import "dotenv/config";

export const config = {
  botToken: process.env.BOT_TOKEN ?? "",
  botMode: (process.env.BOT_MODE ?? "polling") as "polling" | "webhook",
  webhookUrl: process.env.WEBHOOK_URL ?? "",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
  port: Number(process.env.PORT ?? 3000),
  ownerUsername: (process.env.OWNER_TELEGRAM_USERNAME ?? "").replace("@", ""),
};

export function requireBotToken() {
  if (!config.botToken) {
    console.error(
      "\n❌ BOT_TOKEN is not set.\n" +
        "   1. Open Telegram and message @BotFather\n" +
        "   2. Send /newbot and follow the prompts\n" +
        "   3. Copy the token it gives you\n" +
        "   4. Create a .env file:  cp .env.example .env  and paste the token in\n" +
        "   See SETUP.md for the full walkthrough.\n"
    );
    process.exit(1);
  }
}
