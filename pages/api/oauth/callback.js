/**
 * OAuth callback — GET /api/oauth/callback?provider=...&state=...&code=...
 * (GitHub App installs arrive as ?installation_id=...&setup_action=install&state=...)
 *
 * Exchange code → token, validate against the provider, encrypt into the
 * vault, then deep-link the user back to the bot.
 */

import { exchangeCode, storageProvider } from "../../../dist/oauth.js";
import { consumeOAuthState, saveConnection, getBotUsername, listUserIds, logActivity } from "../../../dist/store.js";
import { validateToken } from "../../../dist/providers/index.js";

const VALID = new Set(["github", "github_app", "vercel", "cloudflare"]);

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  const q = req.query ?? {};
  const state = String(q.state ?? "");
  const code = q.code ? String(q.code) : undefined;
  const installationId = q.installation_id ? String(q.installation_id) : undefined;

  try {
    // Resolve the Telegram user via the single-use state nonce FIRST — the
    // state record also knows which provider this connect belongs to.
    let session = state ? await consumeOAuthState(state) : null;
    if (!session && q.installation_id) {
      // GitHub App installs occasionally drop `state` — fall back to the
      // pending github_app connect when it's unambiguous.
      session = await latestPending("github_app");
    }

    // Provider can arrive as ?provider=, via the state record, or (for App
    // installs) via installation_id.
    const providerRaw = String(q.provider ?? session?.provider ?? (q.installation_id ? "github_app" : ""));
    if (!VALID.has(providerRaw)) {
      return fail(res, providerRaw || "connection", "this link couldn't be identified — send /connect and try again");
    }
    if (q.error) {
      return fail(res, providerRaw, String(q.error_description || q.error));
    }
    if (!session) {
      return fail(res, providerRaw, "connect link expired or already used — send /connect again");
    }

    const exchanged = await exchangeCode(providerRaw, { code, installationId });
    const check = await validateToken(storageProvider(providerRaw), exchanged.token);
    if (!check.ok) {
      return fail(res, providerRaw, check.error || "the provider rejected the token");
    }

    await saveConnection(
      session.userId,
      storageProvider(providerRaw),
      exchanged.token,
      check.identity,
      exchanged.authType
    );
    await logActivity(session.userId, storageProvider(providerRaw), "connected", check.identity ?? undefined);

    const botUser = await getBotUsername();
    const label = providerRaw === "github_app" ? "github" : providerRaw;
    if (botUser) {
      res.writeHead(302, {
        Location: `https://t.me/${botUser}?start=connected_${label}`,
      });
      return res.end();
    }
    return res.status(200).send(successHtml(label, check.identity));
  } catch (err) {
    console.error("oauth callback error:", err);
    return fail(res, providerRaw || "unknown", err.message ?? String(err));
  }
}

async function latestPending(provider) {
  const { getStorage } = await import("../../../dist/storage.js");
  const kv = getStorage();
  const keys = await kv.list("tandem:oauth:state:");
  const matches = [];
  for (const key of keys) {
    const raw = await kv.get(key);
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    if (parsed.provider === provider) matches.push({ userId: parsed.userId, provider: parsed.provider });
  }
  // Only safe when unambiguous — with several users connecting at once we
  // can't guess who the install belongs to.
  return matches.length === 1 ? matches[0] : null;
}

function fail(res, provider, reason) {
  const botUser = null; // best effort; the HTML page below always works
  void botUser;
  return res.status(200).send(failHtml(provider, reason));
}

function esc(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}

function successHtml(provider, identity) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tandem — connected</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui;max-width:520px;margin:80px auto;padding:0 24px;text-align:center;color:#1a1a2e}</style>
</head><body><h1>✅ Connected!</h1>
<p><b>${esc(provider)}</b> is now linked${identity ? ` as <b>${esc(identity)}</b>` : ""}.</p>
<p>You can close this page — head back to Telegram and send /connections.</p></body></html>`;
}

function failHtml(provider, reason) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tandem — failed</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui;max-width:520px;margin:80px auto;padding:0 24px;text-align:center;color:#1a1a2e}</style>
</head><body><h1>😕 Connection failed</h1>
<p><b>${esc(provider)}</b>: ${esc(reason)}</p>
<p>Back in Telegram, send /connect to try again.</p></body></html>`;
}
