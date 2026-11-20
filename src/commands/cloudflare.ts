/**
 * Cloudflare commands (Phase 5) — zones, DNS, cache, settings.
 */

import { Telegraf, Context } from "telegraf";
import * as cf from "../providers/cloudflare.js";
import { withProvider, escapeHtml, askConfirm, comingSoon } from "./shared.js";
import { argsOf } from "./github.js";

export async function cmdZones(ctx: Context) {
  await withProvider(ctx, "cloudflare", "zones.list", async (conn) => {
    const zones = await cf.listZones(conn.token);
    if (!zones.length) return "🈳 No zones on this account.";
    return `☁️ <b>Your zones</b>\n\n${zones
      .map((z) => `${z.paused ? "⏸" : "🟢"} <code>${escapeHtml(z.name)}</code> [${escapeHtml(z.status)}]`)
      .join("\n")}\n\n/dns <zone> · /purge <zone>`;
  });
}

export async function cmdZone(ctx: Context, args: string[]) {
  const [name] = args;
  if (!name) return ctx.reply("Usage: /zone <domain>");
  await withProvider(ctx, "cloudflare", "zones.get", async (conn) => {
    const z = await cf.getZone(conn.token, name);
    const settings = await cf.zoneSettings(conn.token, z.id).catch(() => []);
    return (
      `☁️ <b>Zone ${escapeHtml(z.name)}</b>\n\n` +
      `status: ${escapeHtml(z.status)}${z.paused ? " (paused)" : ""}\n` +
      settings.map((s) => `• ${escapeHtml(s.id)}: ${escapeHtml(String(s.value).slice(0, 30))}`).join("\n")
    );
  });
}

export async function cmdDns(ctx: Context, args: string[]) {
  const [zone] = args;
  if (!zone) return ctx.reply("Usage: /dns <domain>");
  await withProvider(ctx, "cloudflare", "dns.list", async (conn) => {
    const records = await cf.listDns(conn.token, zone);
    return (
      `🌐 <b>DNS records</b> — ${escapeHtml(zone)}\n\n` +
      records
        .map(
          (r) =>
            `<code>${escapeHtml(r.type.padEnd(5))}</code> ${escapeHtml(r.name)} → ${escapeHtml(r.content.slice(0, 45))}${r.proxied ? " 🟠" : ""} <i>#${escapeHtml(r.id.slice(0, 8))}</i>`
        )
        .join("\n") +
      `\n\n/dns-add ${escapeHtml(zone)} A app 203.0.113.7\n/dns-delete ${escapeHtml(zone)} <id-prefix>`
    );
  });
}

export async function cmdDnsAdd(ctx: Context, args: string[]) {
  const [zone, type, name, content, proxied] = args;
  if (!zone || !type || !name || !content) {
    return ctx.reply("Usage: /dns-add <domain> <TYPE> <name> <content> [proxied]\nExample: /dns-add example.com CNAME www example.com proxied");
  }
  await withProvider(ctx, "cloudflare", "dns.add", async (conn) => {
    const r = await cf.addDns(conn.token, zone, type, name, content, (proxied ?? "").toLowerCase() === "proxied");
    return `✅ DNS added: <code>${escapeHtml(r.type)}</code> ${escapeHtml(r.name)} → ${escapeHtml(r.content)} <i>#${escapeHtml(r.id.slice(0, 8))}</i>`;
  });
}

export async function cmdDnsUpdate(ctx: Context, args: string[]) {
  const [zone, idPrefix, ...rest] = args;
  if (!zone || !idPrefix || rest.length < 2) {
    return ctx.reply("Usage: /dns-update <domain> <id-prefix> <TYPE> <name> <content> [proxied]");
  }
  await withProvider(ctx, "cloudflare", "dns.update", async (conn) => {
    const records = await cf.listDns(conn.token, zone);
    const target = records.find((r) => r.id.startsWith(idPrefix));
    if (!target) return `No record starting with "${escapeHtml(idPrefix)}" in ${escapeHtml(zone)}.`;
    const [type, name, content, proxied] = rest;
    const r = await cf.updateDns(conn.token, zone, target.id, {
      type,
      name,
      content,
      proxied: (proxied ?? "").toLowerCase() === "proxied",
    });
    return `✅ Updated: <code>${escapeHtml(r.type)}</code> ${escapeHtml(r.name)} → ${escapeHtml(r.content)}`;
  });
}

export async function cmdDnsDelete(ctx: Context, args: string[]) {
  const [zone, idPrefix] = args;
  if (!zone || !idPrefix) return ctx.reply("Usage: /dns-delete <domain> <id-prefix>\n(id prefixes are shown by /dns)");
  await withProvider(ctx, "cloudflare", "dns.delete", async (conn) => {
    const records = await cf.listDns(conn.token, zone);
    const target = records.find((r) => r.id.startsWith(idPrefix));
    if (!target) return `No record starting with "${escapeHtml(idPrefix)}" in ${escapeHtml(zone)}.`;
    const key = `dnsdel:${zone.replace(/\W/g, "")}:${target.id.slice(0, 8)}`;
    await askConfirm(
      ctx,
      key,
      `Delete <code>${escapeHtml(target.type)}</code> ${escapeHtml(target.name)} → ${escapeHtml(target.content.slice(0, 40))}?`,
      "🗑 Yes, delete it",
      async () => {
        await withProvider(ctx, "cloudflare", "dns.delete", async (c2) => {
          await cf.deleteDns(c2.token, zone, target.id);
          return `🗑 Deleted ${escapeHtml(target.name)}.`;
        });
      }
    );
  });
}

export async function cmdDnsCheck(ctx: Context, args: string[]) {
  const [name, type] = args;
  if (!name) return ctx.reply("Usage: /dns-check <name> [TYPE=A]\nResolves public DNS so you can verify records.");
  await withProvider(ctx, "cloudflare", "dns.check", async () => {
    const check = await cf.dnsCheck(name, type ?? "A");
    return `🔍 <b>${escapeHtml(check.name)}</b> (${escapeHtml(check.type)})\n\n${check.answers.map((a) => `• ${escapeHtml(a)}`).join("\n") || "no public answers yet"}`;
  });
}

export async function cmdDnsImport(ctx: Context, args: string[]) {
  const [zone] = args;
  if (!zone) return ctx.reply("Usage: /dns-import <domain>\nThen paste records, one per line: TYPE name content");
  const { setPending, getPending } = await import("../store.js");
  const user = ctx.from;
  if (!user) return;
  const existing = await getPending(user.id);
  await setPending(user.id, {
    kind: `dnsimport:${zone}`,
    startedAt: new Date().toISOString(),
    tries: existing?.tries ?? 0,
    data: { zone },
  });
  return ctx.reply(
    `📥 Paste your DNS records for <b>${escapeHtml(zone)}</b> — one per line:\n<code>A app 203.0.113.7</code>\n<code>CNAME www app</code>\n\n/cancel to abort.`,
    { parse_mode: "HTML" }
  );
}

export async function cmdZoneSettings(ctx: Context, args: string[]) {
  const [zone] = args;
  if (!zone) return ctx.reply("Usage: /zone-settings <domain>");
  await withProvider(ctx, "cloudflare", "zones.settings", async (conn) => {
    const settings = await cf.zoneSettings(conn.token, zone);
    return `⚙️ <b>Zone settings</b> — ${escapeHtml(zone)}\n\n${settings
      .map((s) => `• ${escapeHtml(s.id)}: ${escapeHtml(String(s.value).slice(0, 40))}`)
      .join("\n")}`;
  });
}

export async function cmdPurge(ctx: Context, args: string[]) {
  const [zone] = args;
  if (!zone) return ctx.reply("Usage: /purge <domain>");
  const key = `purge:${zone.replace(/\W/g, "")}`;
  await askConfirm(ctx, key, `Purge <b>entire cache</b> for ${escapeHtml(zone)}?`, "🔥 Yes, purge it", async () => {
    await withProvider(ctx, "cloudflare", "cache.purge", async (conn) => {
      await cf.purgeCache(conn.token, zone);
      return `🔥 Cache purged for ${escapeHtml(zone)}.`;
    });
  });
}

export function register(bot: Telegraf) {
  // Cloudflare is built but held back for launch focus (GitHub + Vercel first).
  // Flip these back to the cmd* handlers to re-enable.
  const soon = (ctx: Context) => comingSoon(ctx, "Cloudflare");
  bot.command("zones", soon);
  bot.command("zone", soon);
  bot.command("dns", soon);
  bot.command("dns-add", soon);
  bot.command("dns-update", soon);
  bot.command("dns-delete", soon);
  bot.command("dns-check", soon);
  bot.command("dns-import", soon);
  bot.command("zone-settings", soon);
  bot.command("purge", soon);
}
