import { Telegraf, Context } from "telegraf";
import { config } from "./config.js";
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
import { PROVIDER_LIST, providerDef, validateToken } from "./integrations.js";
import { vaultReady, generateKey } from "./vault.js";
import { storageMode } from "./storage.js";

export const BOT_COMMANDS = [
  { command: "start", description: "Start Tandem and initialize account" },
  { command: "help", description: "Show help and available commands" },
  { command: "commands", description: "Display the command directory" },
  { command: "login", description: "Authenticate an existing Tandem account" },
  { command: "logout", description: "Sign out of Tandem" },
  { command: "profile", description: "View account information" },
  { command: "settings", description: "Manage personal settings" },
  { command: "workspace", description: "View or switch workspace" },
  { command: "cancel", description: "Cancel an active operation" },
  { command: "status", description: "Show Tandem and integration status" },
  { command: "connect", description: "Connect an external provider" },
  { command: "connections", description: "List connected providers" },
  { command: "disconnect", description: "Disconnect a provider" },
  { command: "repos", description: "List connected repositories" },
  { command: "create_repo", description: "Create a repository" },
  { command: "projects", description: "List Vercel projects" },
  { command: "deploy", description: "Trigger a deployment" },
  { command: "zones", description: "List Cloudflare zones" },
  { command: "services", description: "List Render services" },
  { command: "activity", description: "Unified activity feed" },
];

export async function registerCommands(bot: Telegraf) {
  // Telegram only accepts [a-z0-9_] in command names — normalize hyphens
  // so the menu never fails with BOT_COMMAND_INVALID.
  const sanitized = BOT_COMMANDS.map((c) => ({
    ...c,
    command: c.command.replace(/-/g, "_"),
  }));
  await bot.telegram.setMyCommands(sanitized);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Anything that looks like a provider/bot token must never be echoed. */
function looksSecret(text: string): boolean {
  return /(ghp_|gho_|ghu_|ghs_|github_pat_|sk-[A-Za-z0-9]|glpat-|xox[baprs]-|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9]|^\s*\d+:[A-Za-z0-9_-]{30,})/.test(
    text
  );
}

function userFromCtx(ctx: Context) {
  const from = ctx.from;
  if (!from) return Promise.resolve(null);
  return getOrCreateUser({
    telegramUserId: from.id,
    telegramUsername: from.username,
    firstName: from.first_name,
    languageCode: from.language_code,
  });
}

function comingSoon(ctx: Context, feature: string, phase: string) {
  return ctx.reply(
    `⏳ <b>${feature}</b> is coming in ${phase}.\n\n` +
      `Right now Tandem is in Phase 2 — the integration framework. ` +
      `Connections are being wired up provider by provider:\n\n` +
      `🐙 Phase 3 — GitHub\n▲ Phase 4 — Vercel\n☁️ Phase 5 — Cloudflare\n🟣 Phase 6 — Render`,
    { parse_mode: "HTML" }
  );
}

/** Begin the connect flow for one provider: explain + wait for a token. */
async function startConnect(ctx: Context, provider: string) {
  const def = providerDef(provider);
  if (!def) return ctx.reply(`Unknown provider "${provider}".`);
  const user = await userFromCtx(ctx);
  if (!user) return ctx.reply("I couldn't identify your Telegram account.");

  const existing = await getConnection(user.telegramUserId, provider);
  if (existing) {
    return ctx.reply(
      `${def.icon} <b>${def.displayName}</b> is already connected${existing.identity ? ` as ${escapeHtml(existing.identity)}` : ""}.\n\n` +
        `Use /disconnect ${provider} first if you want to replace the token.`,
      { parse_mode: "HTML" }
    );
  }

  if (!vaultReady()) {
    return ctx.reply(
      `🔐 <b>Encryption key required first</b>\n\n` +
        `Before I store any provider token, Tandem needs an <b>ENCRYPTION_KEY</b> ` +
        `to lock it in the vault (AES-256-GCM).\n\n` +
        `Tap the button below and I'll generate one for you, then save it in ` +
        `Vercel → Settings → Environment Variables.`,
      { parse_mode: "HTML", reply_markup: genKeyKeyboard().reply_markup }
    );
  }

  await setPending(user.telegramUserId, { kind: `token:${provider}`, startedAt: new Date().toISOString() });
  return ctx.reply(
    `${def.icon} <b>Connect ${def.displayName}</b>\n\n` +
      `${escapeHtml(def.tokenHelp)}\n\n` +
      `Then <b>paste the token here</b>.\n\n` +
      `🔒 I'll encrypt it immediately and try to delete your message. ` +
      `I'll never show it back to you.\n\n` +
      `Send /cancel to abort.`,
    { parse_mode: "HTML", reply_markup: cancelFlowKeyboard().reply_markup }
  );
}

export function createBot() {
  const bot = new Telegraf(config.botToken);

  // ── /start ────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const user = await userFromCtx(ctx);
    const name = escapeHtml(user?.firstName ?? "there");
    const isNew = user && user.createdAt.getTime() > Date.now() - 5000;

    await ctx.reply(
      `👋 Hey ${name}, welcome to <b>Tandem</b>.\n\n` +
        `Your development ecosystem, connected in one place.\n\n` +
        `Connect your developer tools and start creating repositories, ` +
        `deploying applications and managing infrastructure — ` +
        `directly from Telegram.\n\n` +
        `✨ <b>Connect your tools. Tell Tandem what you need. Get it done.</b>\n\n` +
        (isNew ? `🆕 I've created your account and workspace.\n\n` : ``) +
        `What would you like to do first?`,
      { parse_mode: "HTML", reply_markup: welcomeKeyboard.reply_markup }
    );
    await ctx.reply("Use the menu below anytime 👇", { reply_markup: mainMenuKeyboard.reply_markup });
  });

  // ── /help & /commands ─────────────────────────────────────────────
  const helpText = `
<b>Tandem — Help</b>

<b>General</b>
/start — Start Tandem and initialize account
/help — Show this help
/commands — Command directory
/login — Authenticate an existing account
/logout — Sign out
/profile — View account information
/settings — Manage settings
/workspace — View or switch workspace
/status — Tandem + integration status
/cancel — Cancel an active operation

<b>Integrations</b>
/connect — Connect a provider (github, vercel, cloudflare, render)
/connections — List connected providers
/disconnect — Disconnect a provider

<b>GitHub</b>
/repos · /create_repo · /repo · /file · /commit · /branch · /branches
/pr · /prs · /issue · /issues · /release · /releases · /workflow · /runs

<b>Vercel</b>
/projects · /create-project · /project · /deploy · /redeploy
/deployments · /deployment · /env · /domains · /logs

<b>Cloudflare</b>
/zones · /dns · /dns-add · /dns-update · /dns-delete · /dns-check

<b>Render</b>
/services · /service · /create-service · /restart · /service-status

<b>Monitoring</b>
/activity · /alerts · /digest · /history · /tasks

💬 You can also just <b>talk naturally</b> — e.g. "Create a private repo called calder-api" or "Deploy my frontend on Vercel". Try it!
`.trim();

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
    const storage = storageMode() === "redis" ? "🟢 persistent (Redis)" : "🟡 in-memory (add Upstash in Vercel → Storage)";
    const vault = vaultReady() ? "🟢 ready" : "🟡 no ENCRYPTION_KEY yet";
    return ctx.reply(
      `<b>📊 Tandem status</b>\n\n` +
        `Bot: 🟢 online\nUsers: ${await userCount()}\nStorage: ${storage}\nVault: ${vault}\n\n${lines.join("\n")}`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("login", (ctx) =>
    ctx.reply(
      "🔐 <b>Login</b>\n\n" +
        "Tandem accounts are created automatically when you send /start, " +
        "so there's nothing extra to do for now.\n\n" +
        "When we add web accounts (Phase 2), this command will send you a " +
        "short-lived, single-use login link here in Telegram.",
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
    const arg = ctx.message && "text" in ctx.message ? ctx.message.text.split(/\s+/)[1]?.toLowerCase() : undefined;
    if (arg && providerDef(arg)) {
      return startConnect(ctx, arg);
    }
    return ctx.reply("🔌 <b>Connect a service</b>\n\nPick one:", {
      parse_mode: "HTML",
      reply_markup: connectKeyboard.reply_markup,
    });
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
    const lines = list.map((c) => {
      const def = providerDef(c.provider);
      return `${def?.icon ?? "🔌"} <b>${def?.displayName ?? c.provider}</b> — ${escapeHtml(c.identity ?? "connected")} (since ${new Date(c.connectedAt).toLocaleDateString()})`;
    });
    return ctx.reply(`🔌 <b>Connected services</b>\n\n${lines.join("\n")}`, {
      parse_mode: "HTML",
      reply_markup: settingsKeyboard.reply_markup,
    });
  });

  bot.command("disconnect", async (ctx) => {
    const user = await userFromCtx(ctx);
    if (!user) return ctx.reply("I couldn't identify your Telegram account.");
    const arg = ctx.message && "text" in ctx.message ? ctx.message.text.split(/\s+/)[1]?.toLowerCase() : undefined;
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
    return ctx.reply("Which service should I disconnect?", {
      reply_markup: disconnectKeyboard(list[0].provider).reply_markup,
    });
  });

  // ── Provider command stubs (real logic lands in Phases 3–6) ───────
  const stub = (label: string, phase: string) => (ctx: Context) =>
    comingSoon(ctx, label, phase);

  bot.command("repos", stub("Listing repositories", "Phase 3 — GitHub"));
  const createRepoStub = stub("Creating a repository", "Phase 3 — GitHub");
  bot.command("create_repo", createRepoStub);
  bot.command("create-repo", createRepoStub); // alias — typed commands aren't menu-validated
  bot.command("repo", stub("Inspecting a repository", "Phase 3 — GitHub"));
  bot.command("file", stub("File management", "Phase 3 — GitHub"));
  bot.command("commit", stub("Committing changes", "Phase 3 — GitHub"));
  bot.command("branch", stub("Branch management", "Phase 3 — GitHub"));
  bot.command("branches", stub("Listing branches", "Phase 3 — GitHub"));
  bot.command("pr", stub("Pull requests", "Phase 3 — GitHub"));
  bot.command("prs", stub("Listing pull requests", "Phase 3 — GitHub"));
  bot.command("issue", stub("Issues", "Phase 3 — GitHub"));
  bot.command("issues", stub("Listing issues", "Phase 3 — GitHub"));
  bot.command("release", stub("Releases", "Phase 3 — GitHub"));
  bot.command("releases", stub("Listing releases", "Phase 3 — GitHub"));
  bot.command("workflow", stub("Workflow inspection", "Phase 3 — GitHub"));
  bot.command("runs", stub("Workflow runs", "Phase 3 — GitHub"));
  bot.command("collaborators", stub("Collaborators", "Phase 3 — GitHub"));

  bot.command("projects", stub("Listing Vercel projects", "Phase 4 — Vercel"));
  bot.command("create-project", stub("Creating a Vercel project", "Phase 4 — Vercel"));
  bot.command("project", stub("Inspecting a Vercel project", "Phase 4 — Vercel"));
  bot.command("deploy", stub("Triggering a deployment", "Phase 4 — Vercel"));
  bot.command("redeploy", stub("Redeploying", "Phase 4 — Vercel"));
  bot.command("deployments", stub("Listing deployments", "Phase 4 — Vercel"));
  bot.command("deployment", stub("Deployment details", "Phase 4 — Vercel"));
  bot.command("env", stub("Environment variables", "Phase 4 — Vercel"));
  bot.command("domains", stub("Domains", "Phase 4 — Vercel"));
  bot.command("logs", stub("Logs", "Phase 4 — Vercel"));

  bot.command("zones", stub("Listing Cloudflare zones", "Phase 5 — Cloudflare"));
  bot.command("zone", stub("Zone details", "Phase 5 — Cloudflare"));
  bot.command("dns", stub("DNS records", "Phase 5 — Cloudflare"));
  bot.command("dns-add", stub("Adding a DNS record", "Phase 5 — Cloudflare"));
  bot.command("dns-update", stub("Updating a DNS record", "Phase 5 — Cloudflare"));
  bot.command("dns-delete", stub("Deleting a DNS record", "Phase 5 — Cloudflare"));
  bot.command("dns-check", stub("Checking DNS", "Phase 5 — Cloudflare"));
  bot.command("dns-import", stub("Importing DNS", "Phase 5 — Cloudflare"));
  bot.command("zone-settings", stub("Zone settings", "Phase 5 — Cloudflare"));
  bot.command("purge", stub("Cache purge", "Phase 5 — Cloudflare"));

  bot.command("services", stub("Listing Render services", "Phase 6 — Render"));
  bot.command("service", stub("Inspecting a Render service", "Phase 6 — Render"));
  bot.command("create-service", stub("Creating a Render service", "Phase 6 — Render"));
  bot.command("restart", stub("Restarting a service", "Phase 6 — Render"));
  bot.command("service-status", stub("Service status", "Phase 6 — Render"));

  bot.command("activity", stub("Activity feed", "Phase 9 — Monitoring"));
  bot.command("alerts", stub("Alerts", "Phase 9 — Monitoring"));
  bot.command("digest", stub("Digests", "Phase 9 — Monitoring"));
  bot.command("history", stub("History", "Phase 9 — Monitoring"));
  bot.command("tasks", stub("Background tasks", "Phase 9 — Monitoring"));
  bot.command("watch", stub("Watches", "Phase 9 — Monitoring"));
  bot.command("unwatch", stub("Removing watches", "Phase 9 — Monitoring"));
  bot.command("notifications", stub("Notification settings", "Phase 9 — Monitoring"));
  bot.command("permissions", stub("Permissions", "Phase 2 — Framework"));
  bot.command("integration", stub("Integration details", "Phase 2 — Framework"));
  bot.command("reconnect", stub("Reconnecting", "Phase 2 — Framework"));

  // ── Inline button callbacks ───────────────────────────────────────
  bot.action("welcome:get_started", (ctx) =>
    ctx.reply(
      "🚀 <b>Let's go!</b>\n\n" +
        "Step 1: Connect GitHub so Tandem can create repositories for you.\n" +
        "Step 2: Connect Vercel to deploy them.\n" +
        "Step 3: Connect Cloudflare for domains & DNS.\n\n" +
        "Tap below to start 👇",
      { parse_mode: "HTML", reply_markup: connectKeyboard.reply_markup }
    )
  );

  bot.action("welcome:connect", (ctx) =>
    ctx.reply("🔌 <b>Connect a service</b>", { parse_mode: "HTML", reply_markup: connectKeyboard.reply_markup })
  );

  bot.action("welcome:commands", (ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));
  bot.action("welcome:help", (ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));

  bot.action("welcome:back", (ctx) =>
    ctx.reply("🏠 <b>Main menu</b>", { parse_mode: "HTML", reply_markup: welcomeKeyboard.reply_markup })
  );

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

  bot.action(/^connect:([a-z]+)$/, async (ctx) => {
    const provider = (ctx.match?.[1] ?? "").toLowerCase();
    return startConnect(ctx, provider);
  });

  bot.action(/^disconnect:([a-z]+):yes$/, async (ctx) => {
    const provider = (ctx.match?.[1] ?? "").toLowerCase();
    const user = await userFromCtx(ctx);
    if (!user) return ctx.reply("I couldn't identify your Telegram account.");
    await removeConnection(user.telegramUserId, provider);
    await clearPending(user.telegramUserId);
    return ctx.reply(`🗑 ${providerDef(provider)?.displayName ?? provider} disconnected. Use /connect anytime to reconnect.`);
  });

  bot.action("github:repos", (ctx) => comingSoon(ctx, "Listing repositories", "Phase 3 — GitHub"));
  bot.action("github:create_repo", (ctx) => comingSoon(ctx, "Creating a repository", "Phase 3 — GitHub"));
  bot.action("deploy:vercel", (ctx) => comingSoon(ctx, "Vercel projects", "Phase 4 — Vercel"));
  bot.action("deploy:render", (ctx) => comingSoon(ctx, "Render services", "Phase 6 — Render"));
  bot.action("infra:cloudflare", (ctx) => comingSoon(ctx, "Cloudflare zones", "Phase 5 — Cloudflare"));

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
  bot.hears("📊 Activity", (ctx) => comingSoon(ctx, "Activity feed", "Phase 9 — Monitoring"));
  bot.hears("⚙️ Settings", (ctx) =>
    ctx.reply("⚙️ <b>Settings</b>", { parse_mode: "HTML", reply_markup: settingsKeyboard.reply_markup })
  );

  // ── Text: token intake (Phase 2) + natural language ───────────────
  bot.on("text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return; // commands handled above
    const user = await userFromCtx(ctx);
    if (!user) return;

    // Token intake: a pending connect flow is waiting for this message.
    const pending = await getPending(user.telegramUserId);
    if (pending?.kind?.startsWith("token:")) {
      const provider = pending.kind.slice("token:".length);
      const def = providerDef(provider);
      const token = text.trim();

      // Never leave a token sitting in the chat if we can remove it.
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
      return ctx.reply(
        `${def?.icon ?? "🔌"} <b>${def?.displayName ?? provider} connected!</b>\n\n` +
          `Account: ${escapeHtml(result.identity ?? "verified")}\n` +
          `Your token is encrypted (AES-256-GCM) in the vault.\n\n` +
          `⚠️ If your token message is still visible, long-press it → Delete.\n\n` +
          `What next?`,
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

    // Natural language (Phase 7 will make this smart) — escaped, truncated, no secrets.
    return ctx.reply(
      `💬 I heard: "<i>${escapeHtml(text.slice(0, 80))}</i>"\n\n` +
        `Natural-language understanding arrives in <b>Phase 7</b>. ` +
        `For now, try a slash command like /help, /connect or /status — ` +
        `or tap the menu below 👇`,
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
