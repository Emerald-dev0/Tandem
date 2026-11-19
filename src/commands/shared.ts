/**
 * Shared command plumbing: connection loading, error mapping,
 * confirmation flow, activity logging, formatting.
 */

import { Context, Markup } from "telegraf";
import {
  getOrCreateUser,
  getConnection,
  logActivity,
  type TandemUser,
  type AuthType,
} from "../store.js";
import { ProviderError } from "../providers/http.js";
import { providerDef } from "../providers/index.js";
import { checkLimit } from "../ratelimit.js";

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Anything that looks like a provider/bot token must never be echoed. */
export function looksSecret(text: string): boolean {
  return /(ghp_|gho_|ghu_|ghs_|github_pat_|sk-[A-Za-z0-9]|glpat-|xox[baprs]-|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9]|^\s*\d+:[A-Za-z0-9_-]{30,})/.test(
    text
  );
}

export async function userFromCtx(ctx: Context): Promise<TandemUser | null> {
  const from = ctx.from;
  if (!from) return null;
  return getOrCreateUser({
    telegramUserId: from.id,
    telegramUsername: from.username,
    firstName: from.first_name,
    languageCode: from.language_code,
  });
}

export interface ProviderConn {
  authType: AuthType;
  token: string;
  identity?: string;
}

/**
 * Run a provider operation with connection + rate limit + error mapping
 * + activity logging. Replies with a connect prompt when not connected.
 */
export async function withProvider(
  ctx: Context,
  provider: string,
  action: string,
  fn: (conn: ProviderConn, user: TandemUser) => Promise<string | void>
): Promise<void> {
  const user = await userFromCtx(ctx);
  if (!user) return void (await ctx.reply("I couldn't identify your Telegram account."));

  const limit = checkLimit(user.telegramUserId, "providerCalls");
  if (!limit.ok) {
    return void (await ctx.reply(`⏳ Provider calls are rate limited — try again in ${limit.retryAfterSec}s.`));
  }

  const conn = await getConnection(user.telegramUserId, provider);
  if (!conn) {
    const def = providerDef(provider);
    return void (await ctx.reply(
      `${def?.icon ?? "🔌"} <b>${def?.displayName ?? provider} isn't connected yet.</b>\n\nUse /connect ${provider} — ` +
        `you can log in${provider === "render" ? " with an API key" : " in one tap"}, no token pasting needed${provider === "render" ? "" : " (or paste a token if you prefer)"}.`,
      { parse_mode: "HTML" }
    ));
  }

  try {
    const result = await fn({ authType: conn.authType, token: conn.token, identity: conn.identity }, user);
    await logActivity(user.telegramUserId, provider, action).catch(() => {});
    if (result) await ctx.reply(result, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  } catch (err) {
    await ctx.reply(formatError(err), { parse_mode: "HTML" });
  }
}

export function formatError(err: unknown): string {
  if (err instanceof ProviderError) {
    return `❌ ${escapeHtml(err.message)}${err.hint ? `\n\n💡 ${escapeHtml(err.hint)}` : ""}`;
  }
  return `❌ ${escapeHtml(String((err as Error)?.message ?? err))}`;
}

// ── Destructive-action confirmations ────────────────────────────────

type ConfirmFn = () => Promise<void>;
const confirmRegistry = new Map<string, ConfirmFn>();

export function askConfirm(ctx: Context, key: string, question: string, yesLabel: string, run: ConfirmFn) {
  confirmRegistry.set(key, run);
  // Auto-expire keys so the map can't grow forever.
  setTimeout(() => confirmRegistry.delete(key), 10 * 60 * 1000).unref?.();
  return ctx.reply(`⚠️ ${question}`, {
    parse_mode: "HTML",
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(yesLabel, `confirm:${key}`)],
      [Markup.button.callback("🚫 Cancel", "flow:cancel")],
    ]).reply_markup,
  });
}

export async function runConfirm(key: string): Promise<boolean> {
  const fn = confirmRegistry.get(key);
  if (!fn) return false;
  confirmRegistry.delete(key);
  await fn();
  return true;
}

// ── Formatting helpers ──────────────────────────────────────────────

export function fmtAgo(isoOrMs?: string | number): string {
  if (!isoOrMs) return "";
  const t = typeof isoOrMs === "number" ? isoOrMs : new Date(isoOrMs).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export function chunk<T>(rows: T[], per: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per));
  return out;
}
