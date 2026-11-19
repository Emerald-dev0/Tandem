import { createServer } from "node:http";
import { createBot, registerCommands } from "./bot.js";
import { config, requireBotToken } from "./config.js";

requireBotToken();

const bot = createBot();

async function main() {
  // Register the command menu with Telegram so users see /help etc.
  await registerCommands(bot);

  if (config.botMode === "webhook") {
    if (!config.webhookUrl) {
      console.error("❌ BOT_MODE=webhook but WEBHOOK_URL is not set. See SETUP.md.");
      process.exit(1);
    }
    const webhookPath = "/telegraf";
    await bot.telegram.setWebhook(`${config.webhookUrl}${webhookPath}`, {
      secret_token: config.webhookSecret || undefined,
    });
    const webhookCallback = await bot.createWebhook({
      domain: config.webhookUrl,
      path: webhookPath,
    });
    const server = createServer((req, res) => {
      void webhookCallback(req, res);
    });
    server.listen(config.port, () => {
      console.log(`🤖 Tandem is live (webhook) on port ${config.port}`);
      console.log(`   Webhook: ${config.webhookUrl}${webhookPath}`);
    });
  } else {
    await bot.telegram.deleteWebhook();
    bot.launch();
    console.log("🤖 Tandem is live (polling mode)");
    console.log("   Open Telegram and send /start to your bot.");
  }

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((err) => {
  console.error("Failed to start Tandem:", err);
  process.exit(1);
});
