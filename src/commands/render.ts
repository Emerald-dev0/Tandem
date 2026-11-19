/**
 * Render commands (Phase 6) — services, deploys, restarts.
 */

import { Telegraf, Context } from "telegraf";
import * as rd from "../providers/render.js";
import { withProvider, escapeHtml, fmtAgo, askConfirm } from "./shared.js";
import { argsOf } from "./github.js";

export async function cmdServices(ctx: Context) {
  await withProvider(ctx, "render", "services.list", async (conn) => {
    const services = await rd.listServices(conn.token);
    if (!services.length) return "🈳 No Render services.";
    return `🟣 <b>Your services</b>\n\n${services
      .map((s) => `• ${escapeHtml(s.name)} (${escapeHtml(s.type)}) ${s.status ? `[${escapeHtml(s.status)}]` : ""}${s.url ? `\n  ${escapeHtml(s.url)}` : ""}`)
      .join("\n")}\n\n/service <id-or-name> · /restart <id>`;
  });
}

export async function cmdService(ctx: Context, args: string[]) {
  const [id] = args;
  if (!id) return ctx.reply("Usage: /service <service-id>");
  await withProvider(ctx, "render", "services.get", async (conn) => {
    const s = await rd.serviceStatus(conn.token, id);
    return (
      `🟣 <b>${escapeHtml(s.name)}</b>\n\n` +
      `type: ${escapeHtml(s.type)}\nstatus: ${escapeHtml(s.status ?? "unknown")}\n` +
      `${s.url ? `url: ${escapeHtml(s.url)}\n` : ""}` +
      `${s.repo ? `repo: ${escapeHtml(s.repo)}\n` : ""}` +
      (s.latestDeploy
        ? `\nlast deploy: ${escapeHtml(s.latestDeploy.status)} ${s.latestDeploy.commit ? `<code>${escapeHtml(s.latestDeploy.commit)}</code>` : ""} <i>${fmtAgo(s.latestDeploy.finishedAt)}</i>`
        : "")
    );
  });
}

export async function cmdCreateService(ctx: Context, args: string[]) {
  const [name, repo, branch] = args;
  if (!name || !repo) return ctx.reply("Usage: /create-service <name> <github-owner/repo> [branch]");
  await withProvider(ctx, "render", "services.create", async (conn) => {
    const s = await rd.createService(conn.token, {
      name,
      repo: `https://github.com/${repo.replace(/^https?:\/\/github\.com\//, "")}`,
      branch,
    });
    return `✅ Service <b>${escapeHtml(s.name)}</b> created${s.url ? ` — ${escapeHtml(s.url)}` : ""}.`;
  });
}

export async function cmdRestart(ctx: Context, args: string[]) {
  const [id] = args;
  if (!id) return ctx.reply("Usage: /restart <service-id>");
  const key = `restart:${id.replace(/\W/g, "").slice(0, 12)}`;
  await askConfirm(ctx, key, `Restart service <code>${escapeHtml(id)}</code>?`, `♻️ Yes, restart`, async () => {
    await withProvider(ctx, "render", "services.restart", async (conn) => {
      await rd.restartService(conn.token, id);
      return `♻️ Restarting ${escapeHtml(id)} — give it ~30 seconds.`;
    });
  });
}

export async function cmdServiceStatus(ctx: Context, args: string[]) {
  const [id] = args;
  if (!id) return ctx.reply("Usage: /service-status <service-id>");
  await withProvider(ctx, "render", "services.status", async (conn) => {
    const s = await rd.serviceStatus(conn.token, id);
    return `🟣 <b>${escapeHtml(s.name)}</b> — ${escapeHtml(s.status ?? "unknown")}${
      s.latestDeploy ? ` · deploy ${escapeHtml(s.latestDeploy.status)} <i>${fmtAgo(s.latestDeploy.finishedAt)}</i>` : ""
    }`;
  });
}

export function register(bot: Telegraf) {
  bot.command("services", (ctx) => cmdServices(ctx));
  bot.command("service", (ctx) => cmdService(ctx, argsOf(ctx)));
  bot.command("create-service", (ctx) => cmdCreateService(ctx, argsOf(ctx)));
  bot.command("restart", (ctx) => cmdRestart(ctx, argsOf(ctx)));
  bot.command("service-status", (ctx) => cmdServiceStatus(ctx, argsOf(ctx)));
}
