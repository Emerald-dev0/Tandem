/**
 * Tandem bot — core handlers + wiring for the command modules.
 *
 * Phases: 1 (Telegram foundation) · 2 (integration framework, vault,
 * OAuth connect flows) · 3–6 (provider commands) · 7 (NL understanding) ·
 * 8 (workflows) · 9 (monitoring) · 10 (hardening: rate limits, owner
 * guard, confirmations, secret hygiene).
 */

import { Telegraf, Context, Markup } from "telegraf";
import { config, oauthEnabled } from "./config.js";
import {
  getOrCreateUser,
  userCount,
  saveConnection,
  listConnections,
  removeConnection,
  getConnection,
  getPending,
  setPending,
  clearPending,
  saveOAuthState,
  logActivity,
} from "./store.js";
import {
  mainMenuKeyboard,
  welcomeKeyboard,
  connectKeyboard,
  githubKeyboard,
  deploymentsKeyboard,
  infraKeyboard,
  settingsKeyboard,
  cancelFlowKeyboard,
  disconnectKeyboard,
  connectDoneKeyboard,
  genKeyKeyboard,
} from "./keyboards.js";
import { PROVIDER_LIST, providerDef, validateToken, ProviderError } from "./providers/index.js";
import * as cfOps from "./providers/cloudflare.js";
import { vaultReady, generateKey, randomHex } from "./vault.js";
import { storageMode } from "./storage.js";
import { connectOptions, storageProvider, type OAuthProvider } from "./oauth.js";
import { parse as nlpParse } from "./nlp.js";
import { checkLimit, LIMITS } from "./ratelimit.js";
import { escapeHtml, looksSecret, runConfirm, userFromCtx } from "./commands/shared.js";

// Command modules (Phases 3–9)
import { register as registerGithub, cmdRepos, cmdCreateRepo } from "./commands/github.js";
import { register as registerVercel, cmdDeploy, cmdDeployments, cmdProjects } from "./commands/vercel.js";
import { register as registerCloudflare, cmdZones, cmdDns, cmdDnsAdd, cmdPurge } from "./commands/cloudflare.js";
import { register as registerRender, cmdServices, cmdRestart } from "./commands/render.js";
import {
  register as registerMonitoring,
  cmdActivity,
} from "./commands/monitoring.js";
import { register as registerWorkflows, cmdRun, cmdWorkflows } from "./commands/workflows.js";

export const BOT_COMMANDS = [
  { command: "start", description: "Start Tandem and initialize account" },
  { command: "help", description: "Show help and available commands" },
  { command: "commands", description: "Display the command directory" },
  { command: "connect", description: "Connect an external provider" },
  { command: "connections", description: "List connected providers" },
  { command: "disconnect", description: "Disconnect a provider" },
  { command: "repos", description: "List GitHub repositories" },
  { command: "create_repo", description: "Create a repository" },
  { command: "deploy", description: "Trigger a deployment" },
  { command: "deployments", description: "List deployments" },
  { command: "projects", description: "List Vercel projects" },
  { command: "zones", description: "List Cloudflare zones" },
  { command: "dns", description: "List DNS records" },
  { command: "services", description: "List Render services" },
  { command: "workflows", description: "List multi-step workflows" },
  { command: "run", description: "Run a workflow" },
  { command: "activity", description: "Unified activity feed" },
  { command: "watch", description: "Watch a repo for events" },
  { command: "alerts", description: "Manage alert rules" },
  { command: "status", description: "Show Tandem and integration status" },
  { command: "diagnose", description: "Run a full health check" },
  { command: "profile", description: "View account information" },
  { command: "settings", description: "Manage personal settings" },
  { command: "workspace", description: "View or switch workspace" },
  { command: "cancel", description: "Cancel an active operation" },
];

export async function registerCommands(bot: Telegraf) {
  // Telegram only accepts [a-z0-9_] in command names — normalize hyphens.
  const sanitized = BOT_COMMANDS.map((c) => ({
    ...c,
    command: c.command.replace(/-/g, "_"),
  }));
  await bot.telegram.setMyCommands(sanitized);
}

const MENU_LABELS = new Set(["🚀 Create", "🐙 GitHub", "☁️ Deployments", "🌐 Infrastructure", "📊 Activity", "⚙️ Settings"]);

function comingSoon(ctx: Context, feature: string, phase: string) {
  return ctx.reply(
    `⏳ <b>${feature}</b> is coming in ${phase}.\n\n` +
      `Meanwhile, try /workflows — real multi-step automations already work.`,
    { parse_mode: "HTML" }
  );
}

// ── Connect flows (Phase 2 + OAuth) ─────────────────────────────────

async function startConnect(ctx: Context, providerRaw: string) {
  const provider = storageProvider(providerRaw as OAuthProvider);
  const def = providerDef(provider);
  if (!def) return ctx.reply(`Unknown provider "${escapeHtml(providerRaw)}".`);
  const user = await userFromCtx(ctx);
  if (!user) return ctx.reply("I couldn't identify your Telegram account.");

  const existing = await getConnection(user.telegramUserId, provider);
  if (existing) {
    return ctx.reply(
      `${def.icon} <b>${def.displayName}</b> is already connected${existing.identity ? ` as ${escapeHtml(existing.identity)}` : ""} (via ${escapeHtml(existing.authType)}).\n\n` +
        `Use /disconnect ${provider} first if you want to replace it.`,
      { parse_mode: "HTML" }
    );
  }

  if (!vaultReady()) {
    return ctx.reply(
      `🔐 <b>Encryption key required first</b>\n\n` +
        `Before I store any provider credential, Tandem needs an <b>ENCRYPTION_KEY</b> ` +
        `to lock it in the vault (AES-256-GCM).\n\n` +
        `Tap below and I'll generate one — you save it in Vercel and come back.`,
      { parse_mode: "HTML", reply_markup: genKeyKeyboard().reply_markup }
    );
  }

  // Preferred: OAuth / GitHub App login buttons.
  const buttons: any[] = [];
  const options = connectOptions();
  for (const opt of options) {
    if (storageProvider(opt.provider) !== provider) continue;
    const nonce = randomHex(16);
    await saveOAuthState(nonce, user.telegramUserId, opt.provider);
    const url = `${config.publicBaseUrl}/api/oauth/start?provider=${opt.provider}&state=${nonce}`;
    buttons.push([Markup.button.url(opt.label, url)]);
  }

  // Fallback: paste a token/key directly.
  const nonce2 = randomHex(16);
  await setPending(user.telegramUserId, { kind: `token:${provider}`, startedAt: new Date().toISOString() });
  buttons.push([Markup.button.callback("🔑 I'll paste a token instead", "flow:noop")]);
  buttons.push([Markup.button.callback("🚫 Cancel", "flow:cancel")]);

  const how =
    buttons.length > 2
      ? `Tap <b>Log in</b> and Tandem gets access the official way — nothing to copy.`
      : `${escapeHtml(def.tokenHelp)}\n\nThen <b>paste it here</b>.`;

  return ctx.reply(
    `${def.icon} <b>Connect ${def.displayName}</b>\n\n${how}\n\n` +
      `🔒 Either way, the credential is encrypted immediately (AES-256-GCM), ` +
      `never shown back, and I'll try to delete your token message.\n\n` +
      `Send /cancel to abort.`,
    { parse_mode: "HTML", reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
  );
}

// ── Help text ───────────────────────────────────────────────────────

const helpText = `
<b>Tandem — Help</b>

<b>Connect</b>
/connect — Log in with GitHub, Vercel, Cloudflare (or paste a token)
/connections · /disconnect · /permissions

<b>GitHub</b>
/repos · /create_repo · /repo · /file · /commit · /branch · /branches
/pr · /prs · /issue · /issues · /release · /releases · /workflow · /runs

<b>Vercel</b>
/projects · /create-project · /project · /deploy · /redeploy
/deployments · /deployment · /env · /domains · /logs

<b>Cloudflare</b>
/zones · /zone · /dns · /dns-add · /dns-update · /dns-delete · /dns-check
/dns-import · /zone-settings · /purge

<b>Render</b>
/services · /service · /create-service · /restart · /service-status

<b>Workflows & monitoring</b>
/workflows · /run · /diagnose · /activity · /watch · /unwatch
/alerts · /digest · /history · /tasks · /notifications

<b>Account</b>
/start · /help · /profile · /status · /settings · /workspace · /cancel

💬 Or just <b>talk to me</b> — "create a private repo called calder-api",
"deploy my-app to vercel", "list dns for example.com", "purge cache for example.com".
`.trim();

// ── Bot factory ─────────────────────────────────────────────────────

export function createBot() {
  const bot = new Telegraf(config.botToken);

  // Phase 10: owner guard + rate limit for every update.
  bot.use(async (ctx, next) => {
    if (config.ownerUsername) {
      const uname = (ctx.from?.username ?? "").toLowerCase();
      if (uname && uname !== config.ownerUsername.toLowerCase()) {
        return ctx.reply("🔒 This Tandem instance is private. Ask the owner for access.");
      }
      if (!uname) return ctx.reply("🔒 This Tandem instance needs a Telegram username to identify you.");
    }
    if (ctx.from) {
      const limit = checkLimit(ctx.from.id, "messages", LIMITS.messages);
      if (!limit.ok) {
        return ctx.reply(`⏳ Slow down a little — try again in ${limit.retryAfterSec}s.`);
      }
    }
    return next();
  });

  // ── /start ────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const user = await userFromCtx(ctx);
    const name = escapeHtml(user?.firstName ?? "there");
    const isNew = user && user.createdAt.getTime() > Date.now() - 5000;
    const payload = ctx.startPayload ?? "";

    // OAuth deep-link results (t.me/bot?start=connected_github …).
    if (payload.startsWith("connected_")) {
      const provider = payload.slice("connected_".length);
      const def = providerDef(provider);
      await logActivity(user?.telegramUserId ?? ctx.from!.id, provider, "connected", "via login flow");
      return ctx.reply(
        `${def?.icon ?? "✅"} <b>${def?.displayName ?? provider} connected!</b>\n\n` +
          `Your credential is encrypted in the vault. See everything with /connections.`,
        { parse_mode: "HTML", reply_markup: connectDoneKeyboard(provider).reply_markup }
      );
    }
    if (payload.startsWith("oauth_fail_")) {
      return ctx.reply("😕 Connection didn't finish. Send /connect to try again.");
    }

    await ctx.reply(
      `👋 Hey ${name}, welcome to <b>Tandem</b>.\n\n` +
        `Your development ecosystem, connected in one place.\n\n` +
        `🐙 GitHub · ▲ Vercel · ☁️ Cloudflare · 🟣 Render — ` +
        `create repositories, deploy applications and manage infrastructure ` +
        `directly from Telegram.\n\n` +
        `✨ <b>Connect your tools. Tell Tandem what you need. Get it done.</b>\n\n` +
        (isNew ? `🆕 I've created your account and workspace.\n\n` : ``) +
        `What would you like to do first?`,
      { parse_mode: "HTML", reply_markup: welcomeKeyboard.reply_markup }
    );
    await ctx.reply("Use the menu below anytime 👇", { reply_markup: mainMenuKeyboard.reply_markup });
  });

  bot.command("help", (ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));
  bot.command("commands", (ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));

  // ── Account commands ──────────────────────────────────────────────
  bot.command("profile", async (ctx) => {
    const user = await userFromCtx(ctx);
    if (!user) return ctx.reply("I couldn't identify your Telegram account.");
    return ctx.reply(
      `<b>👤 Your Tandem profile</b>\n\n` +
        `Name: ${escapeHtml(user.firstName ?? "—")}\n` +
        `Telegram: @${escapeHtml(user.telegramUsername ?? "—")}\n` +
        `Telegram ID: <code>${user.telegramUserId}</code>\n` +
        `Workspace: <code>${user.workspaceId}</code>\n` +
        `Member since: ${user.createdAt.toLocaleDateString()}\n` +
        `Connected services: ${user.connectedProviders.length ? user.connectedProviders.join(", ") : "none yet"}`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("status", async (ctx) => {
    const user = await userFromCtx(ctx);
    const lines = PROVIDER_LIST.map((p) => {
      const connected = user?.connectedProviders.includes(p.name);
      return `${connected ? "🟢" : "⚪"} ${p.displayName} — ${connected ? "connected" : "not connected"}`;
    });
    const storage =
      storageMode() === "postgres"
        ? "🟢 Postgres (persistent)"
        : storageMode() === "redis"
          ? "🟡 Redis (persistent)"
          : "🟡 in-memory (connect Neon Postgres in Vercel → Storage)";
    const vault = vaultReady() ? "🟢 ready" : "🟡 no ENCRYPTION_KEY yet";
    return ctx.reply(
      `<b>📊 Tandem status</b> v0.3.0\n\n` +
        `Bot: 🟢 online\nUsers: ${await userCount()}\nStorage: ${storage}\nVault: ${vault}\n\n${lines.join("\n")}\n\n` +
        `/diagnose for a full health check.`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("login", (ctx) =>
    ctx.reply(
      "🔐 <b>Login</b>\n\n" +
        "Tandem accounts are created automatically when you send /start — there's nothing extra to do.\n\n" +
        "To give Tandem access to your tools, use /connect — you'll get a proper " +
        "\"Log in with…\" flow where you authorize on the provider's own site.",
      { parse_mode: "HTML" }
    )
  );

  bot.command("logout", (ctx) =>
    ctx.reply("👋 You've been signed out of Tandem in this chat. Send /start anytime to sign back in.")
  );

  bot.command("settings", (ctx) =>
    ctx.reply("⚙️ <b>Settings</b>", { parse_mode: "HTML", reply_markup: settingsKeyboard.reply_markup })
  );

  bot.command("workspace", async (ctx) => {
    const user = await userFromCtx(ctx);
    return ctx.reply(
      `🏠 <b>Workspace</b>\n\nYou're in <code>${user?.workspaceId ?? "—"}</code>.\n\n` +
        "Tandem is built workspace-first, so team workspaces can be added later " +
        "without redesigning anything.",
      { parse_mode: "HTML" }
    );
  });

  bot.command("cancel", async (ctx) => {
    const user = await userFromCtx(ctx);
    const pending = user ? await getPending(user.telegramUserId) : undefined;
    if (user) await clearPending(user.telegramUserId);
    return ctx.reply(
      pending ? "✅ Cancelled. Nothing is pending now." : "No active operation to cancel right now. ✅"
    );
  });

  // ── Integration commands (Phase 2) ────────────────────────────────
  bot.command("connect", async (ctx) => {
    const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
    const arg = text.split(/\s+/)[1]?.toLowerCase();
    if (arg && (providerDef(arg) || arg === "github_app")) {
      return startConnect(ctx, arg);
    }

    const buttons: any[] = [];
    for (const opt of connectOptions()) {
      const user = await userFromCtx(ctx);
      if (!user) return;
      const nonce = randomHex(16);
      await saveOAuthState(nonce, user.telegramUserId, opt.provider);
      buttons.push([
        Markup.button.url(opt.label, `${config.publicBaseUrl}/api/oauth/start?provider=${opt.provider}&state=${nonce}`),
      ]);
    }
    for (const p of PROVIDER_LIST) {
      buttons.push([Markup.button.callback(`🔑 ${p.displayName} — paste a token`, `connect:${p.name}`)]);
    }
    buttons.push([Markup.button.callback("⬅️ Back", "welcome:back")]);
    return ctx.reply(
      `🔌 <b>Connect a service</b>\n\n` +
        (buttons.length > 2
          ? `Pick a provider. The <b>Log in</b> options are the easy way — Tandem gets installed on your account with proper permissions.`
          : `Pick a provider and paste a token (OAuth apps can be added later for one-tap login).`),
      { parse_mode: "HTML", reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
    );
  });

  bot.command("connections", async (ctx) => {
    const user = await userFromCtx(ctx);
    if (!user) return ctx.reply("I couldn't identify your Telegram account.");
    const list = await listConnections(user.telegramUserId);
    if (!list.length) {
      return ctx.reply(
        "🔌 No services connected yet.\n\nUse /connect to add GitHub, Vercel, Cloudflare or Render."
      );
    }
    const how = (t: string) => (t === "app_install" ? "installed app" : t === "oauth" ? "login flow" : "token");
    const lines = list.map((c) => {
      const def = providerDef(c.provider);
      return `${def?.icon ?? "🔌"} <b>${def?.displayName ?? c.provider}</b> — ${escapeHtml(c.identity ?? "connected")} via ${how(c.authType)} (since ${new Date(c.connectedAt).toLocaleDateString()})`;
    });
    return ctx.reply(`🔌 <b>Connected services</b>\n\n${lines.join("\n")}\n\n/permissions for the scopes Tandem holds.`, {
      parse_mode: "HTML",
      reply_markup: settingsKeyboard.reply_markup,
    });
  });

  bot.command("disconnect", async (ctx) => {
    const user = await userFromCtx(ctx);
    if (!user) return ctx.reply("I couldn't identify your Telegram account.");
    const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
    const arg = text.split(/\s+/)[1]?.toLowerCase();
    const list = await listConnections(user.telegramUserId);

    if (arg && providerDef(arg)) {
      if (!list.some((c) => c.provider === arg)) {
        return ctx.reply(`${providerDef(arg)?.icon ?? ""} ${arg} is not connected.`);
      }
      return ctx.reply(`Really disconnect <b>${escapeHtml(arg)}</b>?`, {
        parse_mode: "HTML",
        reply_markup: disconnectKeyboard(arg).reply_markup,
      });
    }

    if (!list.length) return ctx.reply("🔌 Nothing is connected — nothing to disconnect.");
    const buttons = list.map((c) => [
      Markup.button.callback(`🗑 ${providerDef(c.provider)?.displayName ?? c.provider}`, `disconnect:${c.provider}:yes`),
    ]);
    buttons.push([Markup.button.callback("⬅️ Keep everything", "flow:cancel")]);
    return ctx.reply("Which service should I disconnect?", {
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    });
  });

  // ── Command modules (Phases 3–9) ──────────────────────────────────
  registerGithub(bot);
  registerVercel(bot);
  registerCloudflare(bot);
  registerRender(bot);
  registerMonitoring(bot);
  registerWorkflows(bot);

  // ── Inline button callbacks ───────────────────────────────────────
  bot.action("welcome:get_started", async (ctx) => {
    const user = await userFromCtx(ctx);
    const buttons: any[] = [];
    for (const opt of connectOptions()) {
      if (!user) break;
      const nonce = randomHex(16);
      await saveOAuthState(nonce, user.telegramUserId, opt.provider);
      buttons.push([
        Markup.button.url(opt.label, `${config.publicBaseUrl}/api/oauth/start?provider=${opt.provider}&state=${nonce}`),
      ]);
    }
    buttons.push([Markup.button.callback("🔑 Paste a token instead", "welcome:connect")]);
    return ctx.reply(
      "🚀 <b>Let's go!</b>\n\n" +
        "Step 1: Connect GitHub so Tandem can work with your repositories.\n" +
        "Step 2: Connect Vercel to deploy them.\n" +
        "Step 3: Connect Cloudflare for domains & DNS.\n\n" +
        "Tap below to start 👇",
      { parse_mode: "HTML", reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
    );
  });

  bot.action("welcome:connect", (ctx) =>
    ctx.reply("🔌 <b>Connect a service</b> — send /connect to pick one.", {
      parse_mode: "HTML",
      reply_markup: connectKeyboard.reply_markup,
    })
  );

  bot.action("welcome:commands", (ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));
  bot.action("welcome:help", (ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));

  bot.action("welcome:back", (ctx) =>
    ctx.reply("🏠 <b>Main menu</b>", { parse_mode: "HTML", reply_markup: welcomeKeyboard.reply_markup })
  );

  bot.action("flow:noop", (ctx) => ctx.reply("OK — paste the token here whenever you're ready (or /cancel)."));

  bot.action("flow:cancel", async (ctx) => {
    const user = await userFromCtx(ctx);
    if (user) await clearPending(user.telegramUserId);
    return ctx.reply("✅ Cancelled.");
  });

  bot.action("flow:genkey", async (ctx) => {
    if (vaultReady()) {
      return ctx.reply("🔐 ENCRYPTION_KEY is already configured. Send your token with /connect.");
    }
    const key = generateKey();
    return ctx.reply(
      `🔐 <b>Your new encryption key</b>\n\n<code>${key}</code>\n\n` +
        `Now:\n` +
        `1. Copy it\n` +
        `2. Vercel → your project → Settings → Environment Variables\n` +
        `3. Add <code>ENCRYPTION_KEY</code> with this value\n` +
        `4. Redeploy, then run /connect again\n\n` +
        `⚠️ <b>Delete this message</b> after saving — anyone with this key can unlock your stored tokens.`,
      { parse_mode: "HTML" }
    );
  });

  bot.action(/^confirm:(.+)$/, async (ctx) => {
    const key = ctx.match?.[1] ?? "";
    const ran = await runConfirm(key);
    if (!ran) return ctx.reply("That confirmation expired — run the command again.");
  });

  bot.action(/^connect:([a-z_]+)$/, async (ctx) => {
    const provider = (ctx.match?.[1] ?? "").toLowerCase();
    return startConnect(ctx, provider);
  });

  bot.action(/^disconnect:([a-z]+):yes$/, async (ctx) => {
    const provider = (ctx.match?.[1] ?? "").toLowerCase();
    const user = await userFromCtx(ctx);
    if (!user) return ctx.reply("I couldn't identify your Telegram account.");
    await removeConnection(user.telegramUserId, provider);
    await clearPending(user.telegramUserId);
    await logActivity(user.telegramUserId, provider, "disconnected");
    return ctx.reply(`🗑 ${providerDef(provider)?.displayName ?? provider} disconnected. Use /connect anytime to reconnect.`);
  });

  bot.action("github:repos", (ctx) => cmdRepos(ctx, []));
  bot.action("github:create_repo", (ctx) =>
    ctx.reply('➕ Send me: /create_repo <name> [private|public]\nOr just say "create a private repo called my-app".')
  );
  bot.action("deploy:vercel", (ctx) => cmdProjects(ctx, []));
  bot.action("deploy:render", (ctx) => cmdServices(ctx));
  bot.action("infra:cloudflare", (ctx) => cmdZones(ctx));

  bot.action("settings:profile", async (ctx) => {
    const user = await userFromCtx(ctx);
    return ctx.reply(
      `👤 <b>Profile</b>\n\nName: ${escapeHtml(user?.firstName ?? "—")}\nTelegram: @${escapeHtml(user?.telegramUsername ?? "—")}\nWorkspace: <code>${user?.workspaceId ?? "—"}</code>`,
      { parse_mode: "HTML" }
    );
  });

  bot.action("settings:connections", async (ctx) => {
    const user = await userFromCtx(ctx);
    const list = user ? await listConnections(user.telegramUserId) : [];
    return ctx.reply(
      list.length
        ? `🔌 Connected: ${list.map((c) => c.provider).join(", ")}\n\nUse /connections for details or /disconnect to remove one.`
        : "🔌 Nothing connected yet. Use /connect to add a service."
    );
  });

  bot.action("settings:status", async (ctx) => {
    const user = await userFromCtx(ctx);
    const lines = PROVIDER_LIST.map((p) => {
      const connected = user?.connectedProviders.includes(p.name);
      return `${connected ? "🟢" : "⚪"} ${p.displayName} — ${connected ? "connected" : "not connected"}`;
    });
    return ctx.reply(`<b>📊 Status</b>\n\nBot: 🟢 online\n\n${lines.join("\n")}`, { parse_mode: "HTML" });
  });

  // ── Reply-keyboard menu buttons ───────────────────────────────────
  bot.hears("🚀 Create", (ctx) =>
    ctx.reply("🚀 <b>Create</b>\n\nWhat would you like to create?", {
      parse_mode: "HTML",
      reply_markup: githubKeyboard.reply_markup,
    })
  );
  bot.hears("🐙 GitHub", (ctx) =>
    ctx.reply("🐙 <b>GitHub</b>", { parse_mode: "HTML", reply_markup: githubKeyboard.reply_markup })
  );
  bot.hears("☁️ Deployments", (ctx) =>
    ctx.reply("☁️ <b>Deployments</b>", { parse_mode: "HTML", reply_markup: deploymentsKeyboard.reply_markup })
  );
  bot.hears("🌐 Infrastructure", (ctx) =>
    ctx.reply("🌐 <b>Infrastructure</b>", { parse_mode: "HTML", reply_markup: infraKeyboard.reply_markup })
  );
  bot.hears("📊 Activity", (ctx) => cmdActivity(ctx, []));
  bot.hears("⚙️ Settings", (ctx) =>
    ctx.reply("⚙️ <b>Settings</b>", { parse_mode: "HTML", reply_markup: settingsKeyboard.reply_markup })
  );

  // ── Text: intake (tokens, DNS import) + natural language ──────────
  bot.on("text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return; // commands handled above
    if (MENU_LABELS.has(text)) return; // menu buttons handled above
    const user = await userFromCtx(ctx);
    if (!user) return;

    const pending = await getPending(user.telegramUserId);

    // DNS import: "TYPE name content" lines.
    if (pending?.kind?.startsWith("dnsimport:")) {
      const zone = pending.kind.slice("dnsimport:".length);
      const lines = text
        .split("\n")
        .map((l) => l.trim().split(/\s+/))
        .filter((p) => p.length >= 3);
      if (!lines.length) {
        return ctx.reply('Send records one per line: `A app 203.0.113.7` (or /cancel).', {
          parse_mode: "Markdown",
        });
      }
      await clearPending(user.telegramUserId);
      let ok = 0;
      const errors: string[] = [];
      for (const [type, name, content] of lines.slice(0, 15)) {
        try {
          const conn = await getConnection(user.telegramUserId, "cloudflare");
          if (!conn) {
            errors.push("cloudflare not connected");
            break;
          }
          await cfOps.addDns(conn.token, zone, type, name, content);
          ok++;
        } catch (err) {
          errors.push(`${type} ${name}: ${(err as Error).message.slice(0, 60)}`);
        }
      }
      return ctx.reply(
        `📥 Imported ${ok} record(s) into ${escapeHtml(zone)}.${errors.length ? `\n\nIssues:\n${errors.map((e) => `• ${escapeHtml(e)}`).join("\n")}` : ""}\n\n/dns ${escapeHtml(zone)} to verify.`
      );
    }

    // Token intake: a pending connect flow is waiting for this message.
    if (pending?.kind?.startsWith("token:")) {
      const provider = pending.kind.slice("token:".length);
      const def = providerDef(provider);
      const token = text.trim();

      try {
        await ctx.deleteMessage();
      } catch {
        /* bots can't always delete — the reminder below covers it */
      }

      const result = await validateToken(provider, token);
      if (!result.ok) {
        const tries = (pending.tries ?? 0) + 1;
        if (tries >= 3) {
          await clearPending(user.telegramUserId);
          return ctx.reply(
            `❌ ${escapeHtml(result.error ?? "That didn't work.")}\n\nLet's start over — run /connect ${provider} when ready.\n\n⚠️ If you posted a token in this chat, delete that message now.`
          );
        }
        await setPending(user.telegramUserId, { ...pending, tries });
        return ctx.reply(
          `❌ ${escapeHtml(result.error ?? "That didn't work.")}\n\nSend another token, or /cancel.\n\n⚠️ If you posted a token in this chat, delete that message now.`,
          { reply_markup: cancelFlowKeyboard().reply_markup }
        );
      }

      await saveConnection(user.telegramUserId, provider, token, result.identity);
      await clearPending(user.telegramUserId);
      await logActivity(user.telegramUserId, provider, "connected", result.identity ?? undefined);
      return ctx.reply(
        `${def?.icon ?? "🔌"} <b>${def?.displayName ?? provider} connected!</b>\n\n` +
          `Account: ${escapeHtml(result.identity ?? "verified")}\n` +
          `Your credential is encrypted (AES-256-GCM) in the vault.\n\n` +
          `⚠️ If your token message is still visible, long-press it → Delete.\n\nWhat next?`,
        { parse_mode: "HTML", reply_markup: connectDoneKeyboard(provider).reply_markup }
      );
    }

    // Safety net: never process or echo something that looks like a secret.
    if (looksSecret(text)) {
      return ctx.reply(
        "🔐 That looks like a secret! Please <b>don't</b> paste tokens as plain messages.\n\n" +
          "Use /connect and I'll store it encrypted — and delete that message right now.",
        { parse_mode: "HTML" }
      );
    }

    // Phase 7 — deterministic natural language.
    const parsed = nlpParse(text);
    if (parsed && parsed.confidence === "exact") {
      await ctx.reply(`⚡ <i>${escapeHtml(parsed.echo)}</i>…`, { parse_mode: "HTML" }).catch(() => {});
      const dispatch: Record<string, (ctx: Context, args: string[]) => Promise<unknown>> = {
        repos: cmdRepos,
        create_repo: cmdCreateRepo,
        deploy: cmdDeploy,
        deployments: cmdDeployments,
        projects: cmdProjects,
        zones: cmdZones,
        dns: cmdDns,
        "dns-add": cmdDnsAdd,
        purge: cmdPurge,
        services: cmdServices,
        restart: cmdRestart,
        activity: cmdActivity,
        run: cmdRun,
        workflows: cmdWorkflows,
      };
      const fn = dispatch[parsed.command];
      if (fn) return void (await fn(ctx, parsed.args));
      if (parsed.command === "status") return void (await bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: "/status" } } as any));
      return;
    }
    if (parsed && parsed.confidence === "likely") {
      return ctx.reply(
        `💬 ${escapeHtml(parsed.echo)}\n\n(Phase 7 understands exact phrasings — try "${escapeHtml(text.slice(0, 30))} …" more literally, or use the slash command.)`,
        { parse_mode: "HTML", reply_markup: mainMenuKeyboard.reply_markup }
      );
    }

    // Fallback — escaped, truncated, never secrets.
    return ctx.reply(
      `💬 I heard: "<i>${escapeHtml(text.slice(0, 80))}</i>"\n\n` +
        `I understand commands like "create a private repo called my-app", "deploy my-app to vercel", ` +
        `"list dns for example.com". Or tap /help for everything 👇`,
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard.reply_markup }
    );
  });

  // ── Error handling ────────────────────────────────────────────────
  bot.catch((err, ctx) => {
    console.error("Bot error:", err);
    const detail = String((err as Error)?.message ?? err).slice(0, 200);
    ctx
      ?.reply(`⚠️ Something went wrong on my side: ${escapeHtml(detail)}\n\nPlease try again in a moment.`)
      .catch(() => {});
  });

  return bot;
}
