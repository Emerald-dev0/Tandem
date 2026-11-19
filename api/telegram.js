/**
 * Vercel serverless entry point for Tandem.
 *
 * Telegram POSTs updates to https://<your-project>.vercel.app/api/telegram
 * This function forwards them to Telegraf.
 *
 * No local setup, no card needed — deploy from GitHub on Vercel's free tier.
 * See SETUP.md "Option 1 — Vercel (no card, no local)".
 */

import { createBot, registerCommands } from "../dist/bot.js";
import { config } from "../dist/config.js";

let handlerPromise = null;

function getWebhookUrl() {
  if (config.webhookUrl) return config.webhookUrl.replace(/\/$/, "");
  // Vercel automatically provides VERCEL_URL (without https://)
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

async function getHandler() {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      if (!config.botToken) {
        throw new Error("BOT_TOKEN is not set. Add it in Vercel → Settings → Environment Variables.");
      }

      const bot = createBot();
      const webhookUrl = getWebhookUrl();
      const webhookPath = "/api/telegram";

      // Register commands + webhook once (cached in handlerPromise)
      await registerCommands(bot);
      if (webhookUrl) {
        await bot.telegram.setWebhook(`${webhookUrl}${webhookPath}`, {
          secret_token: config.webhookSecret || undefined,
        });
      }

      return bot.createWebhook({
        domain: webhookUrl || "https://placeholder.vercel.app",
        path: webhookPath,
      });
    })();
  }
  return handlerPromise;
}

export default async function handler(req, res) {
  // Health check: GET /api/telegram returns OK (Telegram only POSTs)
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "Tandem",
      status: "alive",
      mode: "vercel-webhook",
    });
  }

  try {
    const webhookHandler = await getHandler();
    return webhookHandler(req, res);
  } catch (err) {
    console.error("Tandem webhook error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: "Internal server error" });
    }
  }
}
