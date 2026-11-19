/**
 * Daily digest cron — GET/POST /api/cron/digest
 *
 * Vercel calls this on a schedule (daily — the Hobby plan maximum) with
 * Authorization: Bearer ${CRON_SECRET}. Each user who enabled digests gets
 * a summary of the last 24 hours.
 */

import {
  listUserIds,
  getSettings,
  listActivity,
  listWatches,
  listTasks,
  getBotUsername,
} from "../_lib/store.js";

function esc(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}

async function send(userId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: userId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10000),
  }).catch((err) => console.error("digest send failed:", err.message));
}

export default async function handler(req, res) {
  const auth = String(req.headers.authorization ?? "");
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const users = await listUserIds();
    let sent = 0;
    for (const userId of users) {
      const settings = await getSettings(userId);
      if (!settings.digestEnabled) continue;

      const since = Date.now() - 24 * 3600 * 1000;
      const activity = (await listActivity(userId, 20)).filter(
        (a) => new Date(a.createdAt).getTime() >= since
      );
      const watches = await listWatches(userId);
      const tasks = (await listTasks(userId, 5)).filter(
        (t) => new Date(t.updatedAt).getTime() >= since
      );

      const lines: string[] = [
        `☀️ <b>Tandem daily digest</b>`,
        ``,
        `Activity (24h): ${activity.length}`,
        ...activity.slice(0, 6).map((a) => `• ${esc(a.action)}${a.detail ? ` — ${esc(a.detail.slice(0, 70))}` : ""}`),
        activity.length === 0 ? `• quiet day — no provider events` : ``,
        ``,
        `Watches: ${watches.length ? watches.map((w) => esc(w.repo)).join(", ") : "none"}`,
        tasks.length
          ? `Workflows: ${tasks.map((t) => `${esc(t.workflow)} ${t.status}`).join(", ")}`
          : ``,
        ``,
        `Send /activity for the full log.`,
      ];

      await send(userId, lines.filter((l) => l !== "").join("\n"));
      sent++;
    }
    return res.status(200).json({ ok: true, users: users.length, sent, bot: (await getBotUsername()) ?? null });
  } catch (err) {
    console.error("digest error:", err);
    return res.status(500).json({ ok: false, error: err.message ?? String(err) });
  }
}
