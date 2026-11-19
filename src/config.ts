import "dotenv/config";

/** Strip trailing slashes and a trailing /api/telegram so WEBHOOK_URL works as a base URL. */
function asBaseUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/api\/telegram$/, "");
}

export const config = {
  botToken: process.env.BOT_TOKEN ?? "",
  botMode: (process.env.BOT_MODE ?? "polling") as "polling" | "webhook",
  webhookUrl: process.env.WEBHOOK_URL ?? "",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
  port: Number(process.env.PORT ?? 3000),
  ownerUsername: (process.env.OWNER_TELEGRAM_USERNAME ?? "").replace("@", ""),

  /** Public origin of this deployment — OAuth callbacks and links use this. */
  publicBaseUrl: (() => {
    const explicit = asBaseUrl(process.env.WEBHOOK_URL ?? "");
    if (explicit) return explicit;
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return `http://localhost:${Number(process.env.PORT ?? 3000)}`;
  })(),

  /** Postgres (Vercel Marketplace → Neon, free) — system of record. */
  databaseUrl:
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || "",

  /** Optional Upstash Redis — cache/queue layer later. */
  redisUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",

  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",

  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    /** GitHub App — "install Tandem on your account" flow. */
    githubApp: {
      appId: process.env.GITHUB_APP_ID ?? "",
      privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      slug: process.env.GITHUB_APP_SLUG ?? "",
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
    },
    vercel: {
      clientId: process.env.VERCEL_CLIENT_ID ?? "",
      clientSecret: process.env.VERCEL_CLIENT_SECRET ?? "",
    },
    cloudflare: {
      clientId: process.env.CLOUDFLARE_CLIENT_ID ?? "",
      clientSecret: process.env.CLOUDFLARE_CLIENT_SECRET ?? "",
    },
  },
};

/** True when a provider has OAuth (or GitHub App) credentials configured. */
export function oauthEnabled(provider: string): boolean {
  switch (provider) {
    case "github":
      return Boolean(config.oauth.github.clientId && config.oauth.github.clientSecret);
    case "github_app":
      return Boolean(config.oauth.githubApp.appId && config.oauth.githubApp.privateKey && config.oauth.githubApp.slug);
    case "vercel":
      return Boolean(config.oauth.vercel.clientId && config.oauth.vercel.clientSecret);
    case "cloudflare":
      return Boolean(config.oauth.cloudflare.clientId && config.oauth.cloudflare.clientSecret);
    default:
      return false;
  }
}

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
