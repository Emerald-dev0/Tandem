/**
 * Vercel serverless entry point for Tandem.
 *
 * Telegram POSTs updates to https://<your-project>.vercel.app/api/telegram
 * This function forwards them to Telegraf.
 *
 * GET /api/telegram = health check AND one-time setup. The FIRST browser
 * visit registers the webhook with Telegram (commands + webhook URL), and
 * the JSON response reports exactly what happened — including whether
 * BOT_TOKEN is missing. That report is the deployment diagnostic.
 *
 * No local setup, no card needed — deploy from GitHub on Vercel's free tier.
 * See SETUP.md "Option 1 — Vercel (no card, no local)".
 */

import { createBot, registerCommands } from "./_lib/bot.js";
import { config } from "./_lib/config.js";

const WEBHOOK_PATH = "/api/telegram";

let readyPromise = null;

/**
 * Stable production URL first: VERCEL_URL changes with every deployment,
 * which would silently orphan the Telegram webhook. The production
 * domain stays put across redeploys.
 */
function getWebhookUrl() {
  if (config.webhookUrl) return config.webhookUrl.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

/**
 * One-time setup: verify token, register commands, register the webhook.
 * Returns { info, webhookHandler }. Cached; reset on failure so the next
 * request retries.
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

      await registerCommands(bot);

      const webhookUrl = getWebhookUrl();
      const webhookTarget = `${webhookUrl}${WEBHOOK_PATH}`;
      if (webhookUrl) {
        await bot.telegram.setWebhook(webhookTarget, {
          secret_token: config.webhookSecret || undefined,
        });
      }

      return {
        info: {
          bot: `@${me.username}`,
          webhook: `registered \u2192 ${webhookTarget}`,
        },
        webhookHandler: bot.createWebhook({
          domain: webhookUrl || "https://placeholder.vercel.app",
          path: WEBHOOK_PATH,
          secretToken: config.webhookSecret || undefined,
        }),
      };
    })().catch((err) => {
      readyPromise = null; // allow retry on the next request
      throw err;
    });
  }
  return readyPromise;
}

export default async function handler(req, res) {
  // GET = health check + first-visit setup (this is what wires up Telegram)
  if (req.method === "GET") {
    try {
      const { info } = await ensureReady();
      return res.status(200).json({
        ok: true,
        service: "Tandem",
        status: "alive",
        mode: "vercel-webhook",
        ...info,
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

  try {
    const { webhookHandler } = await ensureReady();
    return webhookHandler(req, res);
  } catch (err) {
    console.error("Tandem webhook error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: "Internal server error" });
    }
  }
}
