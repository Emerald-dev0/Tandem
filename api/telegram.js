/**
 * Vercel serverless entry point for Tandem.
 *
 * Telegram POSTs updates to https://<your-project>.vercel.app/api/telegram.
 * Updates are parsed here and handed straight to Telegraf's handleUpdate —
 * no path filters, no middleware indirection, nothing that can silently
 * drop an update.
 *
 * GET /api/telegram = health check AND one-time setup. The FIRST browser
 * visit registers commands + webhook with Telegram, and the JSON reports
 * exactly what happened — including Telegram's own view via getWebhookInfo
 * (pending updates, last delivery error). That report is the diagnostic.
 *
 * No local setup, no card needed — deploy from GitHub on Vercel's free tier.
 * See SETUP.md "Option 1 — Vercel (no card, no local)".
 */

import { createBot, registerCommands } from "./_lib/bot.js";
import { config } from "./_lib/config.js";
import { setBotUsername } from "./_lib/store.js";

const WEBHOOK_PATH = "/api/telegram";

let readyPromise = null;

/**
 * Stable production URL first: VERCEL_URL changes with every deployment,
 * which would silently orphan the Telegram webhook. The production
 * domain stays put across redeploys.
 */
function getWebhookUrl() {
  const clean = (u) => u.replace(/\/+$/, "").replace(/\/api\/telegram$/, "");
  if (config.webhookUrl) return clean(config.webhookUrl);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

/**
 * One-time setup: verify token, register commands, register the webhook.
 * Cached; reset on failure so the next request retries.
 */
async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!config.botToken) {
        throw new Error(
          "BOT_TOKEN is not set. Add it in Vercel \u2192 Settings \u2192 Environment Variables (BOT_TOKEN = your token from @BotFather), then Redeploy."
        );
      }

      const bot = createBot();

      // Verify the token first — a clear 401 beats a vague webhook error.
      const me = await bot.telegram.getMe();
      bot.botInfo = me; // skip the per-update getMe lookup
      await setBotUsername(me.username).catch(() => {}); // for OAuth deep links

      await registerCommands(bot);

      const webhookUrl = getWebhookUrl();
      const webhookTarget = `${webhookUrl}${WEBHOOK_PATH}`;
      if (webhookUrl) {
        await bot.telegram.setWebhook(webhookTarget, {
          secret_token: config.webhookSecret || undefined,
        });
      }

      return {
        bot,
        info: {
          bot: `@${me.username}`,
          webhook: `registered \u2192 ${webhookTarget}`,
        },
      };
    })().catch((err) => {
      readyPromise = null; // allow retry on the next request
      throw err;
    });
  }
  return readyPromise;
}

/** Read the Telegram update from the request (Vercel leaves req.body raw). */
async function readUpdate(req) {
  if (req.body != null) {
    let body = req.body;
    if (Buffer.isBuffer(body)) body = String(body);
    if (typeof body === "string") body = JSON.parse(body);
    return body;
  }
  let raw = "";
  for await (const chunk of req) raw += String(chunk);
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  // GET = health check + first-visit setup (this is what wires up Telegram)
  if (req.method === "GET") {
    try {
      const { bot, info } = await ensureReady();
      let telegram = null;
      try {
        const wi = await bot.telegram.getWebhookInfo();
        telegram = {
          url: wi.url,
          pending_update_count: wi.pending_update_count,
          last_error_date: wi.last_error_date
            ? new Date(wi.last_error_date * 1000).toISOString()
            : null,
          last_error_message: wi.last_error_message ?? null,
        };
      } catch {
        /* diagnostics must never break the health check */
      }
      return res.status(200).json({
        ok: true,
        service: "Tandem",
        status: "alive",
        mode: "vercel-webhook",
        version: "0.4.0",
        phases: "1-10",
        ...info,
        telegram,
      });
    } catch (err) {
      console.error("Tandem init error:", err);
      return res.status(500).json({
        ok: false,
        service: "Tandem",
        error: err.message ?? String(err),
      });
    }
  }

  // Telegram update delivery. Any error becomes a 500 WITH the message,
  // so Telegram records it in getWebhookInfo.last_error_message and the
  // GET diagnostic above can see it.
  try {
    const { bot } = await ensureReady();
    const update = await readUpdate(req);
    console.log("Tandem update:", update.update_id, JSON.stringify(update).slice(0, 200));
    await bot.handleUpdate(update);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Tandem update error:", err);
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ ok: false, error: err.message ?? String(err) });
    }
  }
}
