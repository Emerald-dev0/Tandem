/**
 * GitHub webhook receiver — POST /api/webhooks/github
 *
 * Verifies X-Hub-Signature-256 (HMAC-SHA256 with GITHUB_WEBHOOK_SECRET),
 * records activity for everyone watching the repo, fires matching alerts
 * as Telegram notifications.
 *
 * Configure it two ways:
 *  - GitHub App: set this URL as the App's Webhook URL (preferred)
 *  - /watch command installs a repo webhook pointing here (token flow)
 */

import crypto from "node:crypto";
import { getStorage } from "../../../dist/storage.js";
import {
  listWatchesForRepo,
  listAlertsForEvent,
  getSettings,
  logActivity,
  getUser,
} from "../../../dist/store.js";

function verify(rawBody, header, secret) {
  if (!secret || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function summarize(event, payload) {
  const repo = payload.repository?.full_name ?? "repo";
  const actor = payload.sender?.login ?? "someone";
  switch (event) {
    case "push": {
      const commits = payload.commits?.length ?? 0;
      const branch = String(payload.ref ?? "").replace("refs/heads/", "");
      return { detail: `${actor} pushed ${commits} commit(s) to ${branch}`, action: "push" };
    }
    case "pull_request":
      return {
        action: `pr:${payload.action}`,
        detail: `${actor} ${payload.action} PR #${payload.pull_request?.number} "${payload.pull_request?.title}" on ${repo}`,
      };
    case "issues":
      return {
        action: `issue:${payload.action}`,
        detail: `${actor} ${payload.action} issue #${payload.issue?.number} "${payload.issue?.title}" on ${repo}`,
      };
    case "deployment":
      return {
        action: "deployment",
        detail: `${actor} created a deployment (${payload.deployment?.environment ?? "env"}) on ${repo}`,
      };
    case "workflow_run":
      return {
        action: `workflow:${payload.action}`,
        detail: `Workflow "${payload.workflow_run?.name}" ${payload.workflow_run?.conclusion ?? payload.workflow_run?.status ?? "updated"} on ${repo}`,
      };
    case "release":
      return {
        action: `release:${payload.action}`,
        detail: `${actor} ${payload.action} release ${payload.release?.tag_name} on ${repo}`,
      };
    case "check_run":
      return {
        action: "check",
        detail: `Check "${payload.check_run?.name}" ${payload.check_run?.conclusion ?? "updated"} on ${repo}`,
      };
    default:
      return { action: event, detail: `${event} event on ${repo}` };
  }
}

async function notify(botToken, userId, text) {
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: userId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000),
  }).catch((err) => console.error("notify failed:", err.message));
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  // Raw body for HMAC verification.
  let raw = "";
  for await (const chunk of req) raw += String(chunk);

  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  const sig = req.headers["x-hub-signature-256"];
  if (secret && !verify(raw, sig, secret)) {
    return res.status(401).json({ ok: false, error: "bad signature" });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ ok: false, error: "bad json" });
  }

  const event = String(req.headers["x-github-event"] ?? "ping");
  if (event === "ping") return res.status(200).json({ ok: true, pong: true });

  const repo = payload.repository?.full_name;
  if (!repo) return res.status(200).json({ ok: true, ignored: true });

  try {
    const { action, detail } = summarize(event, payload);

    // Everyone watching this repo gets the activity entry.
    const watchers = await listWatchesForRepo("github", repo);
    for (const { userId, watch } of watchers) {
      const relevant =
        watch.events.length === 0 ||
        watch.events.includes(event) ||
        watch.events.includes("*") ||
        watch.events.includes(action.split(":")[0]);
      if (!relevant) continue;
      await logActivity(userId, "github", action, detail);
    }

    // Alerts → Telegram notifications (watchers only, respecting settings).
    const alertTargets = await listAlertsForEvent("github", event);
    const notified = new Set();
    for (const { userId } of alertTargets) {
      if (notified.has(userId)) continue;
      if (!watchers.some((w) => w.userId === userId)) continue; // alert without watch = no event source
      notified.add(userId);
      const settings = await getSettings(userId);
      if (!settings.notificationsEnabled) continue;
      await notify(process.env.BOT_TOKEN, userId, `🔔 ${detail}`);
    }

    return res.status(200).json({ ok: true, watchers: watchers.length });
  } catch (err) {
    console.error("github webhook error:", err);
    return res.status(500).json({ ok: false, error: err.message ?? String(err) });
  }
}
