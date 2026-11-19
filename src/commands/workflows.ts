/**
 * Workflow commands (Phase 8) — /workflows, /run, /diagnose.
 */

import { Telegraf, Context } from "telegraf";
import { WORKFLOWS, findWorkflow, runWorkflow, renderTask, type WorkflowCtx } from "../workflows.js";
import { getConnection, saveTask, type AuthType, type Task } from "../store.js";
import { escapeHtml, userFromCtx, formatError } from "./shared.js";
import { argsOf } from "./github.js";

async function makeCtx(userId: number, args: string[]): Promise<WorkflowCtx> {
  return {
    userId,
    args,
    conn: async (provider: string) => {
      const c = await getConnection(userId, provider);
      return c ? { authType: c.authType as AuthType, token: c.token } : null;
    },
    note: () => {},
  };
}

async function runAndRender(ctx: Context, workflowId: string, args: string[]) {
  const user = await userFromCtx(ctx);
  if (!user) return;
  const wf = findWorkflow(workflowId);
  if (!wf) {
    return ctx.reply(`Unknown workflow "${escapeHtml(workflowId)}". See /workflows.`);
  }

  const status = await ctx.reply(`🔄 <b>${wf.icon} ${escapeHtml(wf.name)}</b> — starting…`, { parse_mode: "HTML" });

  const chatId = status.chat.id;
  const messageId = status.message_id;
  let lastText = "";

  const render = async (task: Task) => {
    const text = renderTask(task);
    if (text === lastText) return;
    lastText = text;
    await ctx.telegram
      .editMessageText(chatId, messageId, undefined, text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } })
      .catch(() => {});
  };

  try {
    const wctx = await makeCtx(user.telegramUserId, args);
    const task = await runWorkflow(wf, wctx, render);
    await render(task);
  } catch (err) {
    await ctx.reply(formatError(err), { parse_mode: "HTML" });
  }
}

export async function cmdWorkflows(ctx: Context) {
  return ctx.reply(
    `🧩 <b>Workflows</b> — multi-step automations\n\n` +
      WORKFLOWS.map((w) => `${w.icon} <b>${escapeHtml(w.id)}</b> ${escapeHtml(w.argsHint)} — ${escapeHtml(w.description)}`).join("\n") +
      `\n\n/run <id> [args] to start one.`,
    { parse_mode: "HTML" }
  );
}

export async function cmdRun(ctx: Context, args: string[]) {
  const [id, ...rest] = args;
  if (!id) return ctx.reply("Usage: /run <workflow> [args…]\nSee /workflows.");
  await runAndRender(ctx, id, rest);
}

export async function cmdDiagnose(ctx: Context) {
  await runAndRender(ctx, "diagnose", []);
}

export function register(bot: Telegraf) {
  bot.command("workflows", (ctx) => cmdWorkflows(ctx));
  bot.command("run", (ctx) => cmdRun(ctx, argsOf(ctx)));
  bot.command("diagnose", (ctx) => cmdDiagnose(ctx));
}
