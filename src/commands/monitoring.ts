/**
 * Monitoring commands (Phase 9) — activity, watches, alerts, digests,
 * history, tasks, notifications. Plus Phase 10 niceties: permissions,
 * integration info, reconnect.
 */

import { Telegraf, Context } from "telegraf";
import {
  logActivity,
  listActivity,
  addWatch,
  removeWatch,
  listWatches,
  addAlert,
  removeAlert,
  listAlerts,
  getSettings,
  setSettings,
  listTasks,
  getConnection,
  removeConnection,
} from "../store.js";
import { escapeHtml, fmtAgo, userFromCtx, withProvider, askConfirm } from "./shared.js";
import { argsOf } from "./github.js";
import { providerDef, PROVIDER_LIST, validateToken } from "../providers/index.js";
import { config } from "../config.js";
import * as gh from "../providers/github.js";

export async function cmdActivity(ctx: Context, args: string[]) {
  const user = await userFromCtx(ctx);
  if (!user) return;
  const limit = Math.min(20, Number(args[0]) || 10);
  const rows = await listActivity(user.telegramUserId, limit);
  if (!rows.length) {
    return ctx.reply("📭 No activity yet — connect a provider and start working!");
  }
  return ctx.reply(
    `📊 <b>Activity</b>\n\n${rows
      .map((a) => `${a.provider ? providerDef(a.provider)?.icon ?? "🔧" : "🤖"} <b>${escapeHtml(a.action)}</b>${a.detail ? ` — ${escapeHtml(a.detail.slice(0, 70))}` : ""} <i>${fmtAgo(a.createdAt)}</i>`)
      .join("\n")}`,
    { parse_mode: "HTML" }
  );
}

export async function cmdWatch(ctx: Context, args: string[]) {
  const [repo, ...events] = args;
  if (!repo) return ctx.reply('Usage: /watch owner/repo [events…]\nExample: /watch me/my-app push pull_request workflow_run');
  const key = `watch:${repo.replace(/\W/g, "").slice(0, 12)}`;
  await askConfirm(
    ctx,
    key,
    `Watch <b>${escapeHtml(repo)}</b> for ${events.length ? escapeHtml(events.join(", ")) : "all events"}?\nTandem will install a repo webhook (needs admin scope) and send you alerts.`,
    "👀 Yes, watch it",
    async () => {
      await withProvider(ctx, "github", "watches.create", async (conn) => {
        const hook = await gh.ensureRepoWebhook(
          conn as gh.GithubConn,
          repo,
          `${config.publicBaseUrl}/api/webhooks/github`,
          config.githubWebhookSecret || "tandem-hook",
          events
        );
        await addWatch(ctx.from!.id, "github", repo, events);
        return `👀 Watching <b>${escapeHtml(repo)}</b> ${hook.created ? "(webhook installed)" : "(webhook already present)"}.\n\n/alerts to choose which events notify you.`;
      });
    }
  );
}

export async function cmdUnwatch(ctx: Context, args: string[]) {
  const [repo] = args;
  const user = await userFromCtx(ctx);
  if (!user) return;
  if (!repo) {
    const watches = await listWatches(user.telegramUserId);
    if (!watches.length) return ctx.reply("You're not watching anything.");
    return ctx.reply(`Watching:\n${watches.map((w) => `• ${escapeHtml(w.repo)}`).join("\n")}\n\n/unwatch owner/repo to stop.`);
  }
  await removeWatch(user.telegramUserId, "github", repo);
  await logActivity(user.telegramUserId, "github", "watches.remove", repo);
  return ctx.reply(`👋 Stopped watching ${escapeHtml(repo)}.`);
}

export async function cmdAlerts(ctx: Context, args: string[]) {
  const user = await userFromCtx(ctx);
  if (!user) return;
  const [sub, event] = args;
  if (sub === "add" && event) {
    await addAlert(user.telegramUserId, "*", event);
    return ctx.reply(`🔔 Alert added for <code>${escapeHtml(event)}</code> events.`, { parse_mode: "HTML" });
  }
  if (sub === "remove" && event) {
    await removeAlert(user.telegramUserId, "*", event);
    return ctx.reply(`🔕 Removed alert for ${escapeHtml(event)}.`);
  }
  const alerts = await listAlerts(user.telegramUserId);
  return ctx.reply(
    `🔔 <b>Alert rules</b>\n\n${alerts.map((a) => `• ${escapeHtml(a.event)} (${escapeHtml(a.provider)})`).join("\n") || "none yet"}\n\n` +
      `Add: /alerts add <event>\nEvents: push, pull_request, issues, deployment, workflow_run, release, check_run, or * for everything.`,
    { parse_mode: "HTML" }
  );
}

export async function cmdDigest(ctx: Context, args: string[]) {
  const user = await userFromCtx(ctx);
  if (!user) return;
  const [toggle] = args;
  if (toggle === "on" || toggle === "off") {
    await setSettings(user.telegramUserId, { digestEnabled: toggle === "on" });
    return ctx.reply(`☀️ Daily digest ${toggle === "on" ? "enabled" : "disabled"} (sent ~08:00 UTC).`);
  }
  const settings = await getSettings(user.telegramUserId);
  return ctx.reply(`☀️ Daily digest is <b>${settings.digestEnabled ? "on" : "off"}</b>.\n/digest on|off to change.`, {
    parse_mode: "HTML",
  });
}

export async function cmdHistory(ctx: Context, args: string[]) {
  const user = await userFromCtx(ctx);
  if (!user) return;
  const tasks = await listTasks(user.telegramUserId, 10);
  const activity = await listActivity(user.telegramUserId, 5);
  const taskLines = tasks.length
    ? tasks
        .map((t) => `${t.status === "done" ? "✅" : t.status === "failed" ? "❌" : "🔄"} ${escapeHtml(t.workflow)} ${t.args.length ? `<code>${escapeHtml(t.args.join(" "))}</code>` : ""} <i>${fmtAgo(t.updatedAt)}</i>`)
        .join("\n")
    : "no workflow runs yet";
  const actLines = activity.length
    ? activity.map((a) => `• ${escapeHtml(a.action)} <i>${fmtAgo(a.createdAt)}</i>`).join("\n")
    : "no activity yet";
  return ctx.reply(`📜 <b>History</b>\n\n<b>Workflows</b>\n${taskLines}\n\n<b>Recent activity</b>\n${actLines}`, {
    parse_mode: "HTML",
  });
}

export async function cmdTasks(ctx: Context, args: string[]) {
  const user = await userFromCtx(ctx);
  if (!user) return;
  const tasks = await listTasks(user.telegramUserId, 10);
  if (!tasks.length) return ctx.reply("🈳 No workflow tasks yet. Try /run diagnose.");
  return ctx.reply(
    `🗂 <b>Workflow tasks</b>\n\n${tasks
      .map((t) => {
        const done = t.steps.filter((s) => s.status === "done").length;
        return `${t.status === "done" ? "✅" : t.status === "failed" ? "❌" : "🔄"} <b>${escapeHtml(t.workflow)}</b> — ${done}/${t.steps.length} steps <i>${fmtAgo(t.updatedAt)}</i>`;
      })
      .join("\n")}\n\n/run <workflow> to start one.`,
    { parse_mode: "HTML" }
  );
}

export async function cmdNotifications(ctx: Context, args: string[]) {
  const user = await userFromCtx(ctx);
  if (!user) return;
  const [toggle] = args;
  if (toggle === "on" || toggle === "off") {
    await setSettings(user.telegramUserId, { notificationsEnabled: toggle === "on" });
    return ctx.reply(`🔔 Notifications ${toggle === "on" ? "enabled" : "muted"}.`);
  }
  const settings = await getSettings(user.telegramUserId);
  return ctx.reply(`🔔 Notifications are <b>${settings.notificationsEnabled ? "on" : "off"}</b>.\n/notifications on|off`, {
    parse_mode: "HTML",
  });
}

export async function cmdPermissions(ctx: Context) {
  return ctx.reply(
    `🔐 <b>Least privilege</b>\n\nTandem only holds what each operation needs:\n\n` +
      PROVIDER_LIST.map((p) => `${p.icon} <b>${p.displayName}</b> — ${escapeHtml(p.scopesHint)}`).join("\n") +
      `\n\nTokens are AES-256-GCM encrypted at rest and never shown back to you.\n/connections to see what's linked.`,
    { parse_mode: "HTML" }
  );
}

export async function cmdIntegration(ctx: Context, args: string[]) {
  const user = await userFromCtx(ctx);
  if (!user) return;
  const [provider] = args;
  if (!provider) {
    return ctx.reply(
      `🔌 <b>Integrations</b>\n\n` +
        PROVIDER_LIST.map((p) => `${p.icon} ${p.displayName} — ${p.connectKind === "oauth" ? "login flow" : "API key"}`).join("\n") +
        `\n\n/integration <name> for details.`,
      { parse_mode: "HTML" }
    );
  }
  const def = providerDef(provider);
  if (!def) return ctx.reply(`Unknown provider "${escapeHtml(provider)}".`);
  const conn = await getConnection(user.telegramUserId, provider);
  return ctx.reply(
    `${def.icon} <b>${def.displayName}</b>\n\n` +
      `Status: ${conn ? `🟢 connected${conn.identity ? ` as ${escapeHtml(conn.identity)}` : ""} via ${escapeHtml(conn.authType)}` : "⚪ not connected"}\n` +
      `Needs: ${escapeHtml(def.scopesHint)}\n\n` +
      `${conn ? `/disconnect ${escapeHtml(provider)} to remove.` : `/connect ${escapeHtml(provider)} to add.`}`,
    { parse_mode: "HTML" }
  );
}

export async function cmdReconnect(ctx: Context, args: string[]) {
  const user = await userFromCtx(ctx);
  if (!user) return;
  const [provider] = args;
  if (!provider || !providerDef(provider)) return ctx.reply("Usage: /reconnect <github|vercel|cloudflare|render>");
  await removeConnection(user.telegramUserId, provider);
  await logActivity(user.telegramUserId, provider, "disconnected", "reconnect requested");
  return ctx.reply(`🔄 Old ${escapeHtml(provider)} connection cleared.\n/connect ${escapeHtml(provider)} to link it again.`);
}

export function register(bot: Telegraf) {
  bot.command("activity", (ctx) => cmdActivity(ctx, argsOf(ctx)));
  bot.command("watch", (ctx) => cmdWatch(ctx, argsOf(ctx)));
  bot.command("unwatch", (ctx) => cmdUnwatch(ctx, argsOf(ctx)));
  bot.command("alerts", (ctx) => cmdAlerts(ctx, argsOf(ctx)));
  bot.command("digest", (ctx) => cmdDigest(ctx, argsOf(ctx)));
  bot.command("history", (ctx) => cmdHistory(ctx, argsOf(ctx)));
  bot.command("tasks", (ctx) => cmdTasks(ctx, argsOf(ctx)));
  bot.command("notifications", (ctx) => cmdNotifications(ctx, argsOf(ctx)));
  bot.command("permissions", (ctx) => cmdPermissions(ctx));
  bot.command("integration", (ctx) => cmdIntegration(ctx, argsOf(ctx)));
  bot.command("reconnect", (ctx) => cmdReconnect(ctx, argsOf(ctx)));
}
