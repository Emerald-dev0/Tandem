/**
 * Vercel commands (Phase 4) — projects, deployments, env vars, domains, logs.
 */

import { Telegraf, Context } from "telegraf";
import * as vc from "../providers/vercel.js";
import { withProvider, escapeHtml, fmtAgo, askConfirm } from "./shared.js";
import { argsOf } from "./github.js";

export async function cmdProjects(ctx: Context, args: string[]) {
  await withProvider(ctx, "vercel", "projects.list", async (conn) => {
    const projects = await vc.listProjects(conn.token);
    if (!projects.length) return "🈳 No Vercel projects yet.";
    return `▲ <b>Your projects</b>\n\n${projects
      .map((p) => `• <code>${escapeHtml(p.name)}</code>${p.framework ? ` (${escapeHtml(p.framework)})` : ""} <i>${fmtAgo(p.updatedAt)}</i>`)
      .join("\n")}\n\n/project <name> · /deploy <name>`;
  });
}

export async function cmdCreateProject(ctx: Context, args: string[]) {
  const [name, repo] = args;
  if (!name) return ctx.reply("Usage: /create-project <name> [github-owner/repo]");
  await withProvider(ctx, "vercel", "projects.create", async (conn) => {
    const p = await vc.createProject(conn.token, name, repo);
    return `✅ Project <code>${escapeHtml(p.name)}</code> created${repo ? ` and linked to ${escapeHtml(repo)}` : ""}.\n/deploy ${escapeHtml(p.name)} when ready.`;
  });
}

export async function cmdProject(ctx: Context, args: string[]) {
  const [name] = args;
  if (!name) return ctx.reply("Usage: /project <name>");
  await withProvider(ctx, "vercel", "projects.get", async (conn) => {
    const p = await vc.getProject(conn.token, name);
    return (
      `▲ <b>Project ${escapeHtml(p.name)}</b>\n\n` +
      `${p.framework ? `Framework: ${escapeHtml(p.framework)}\n` : ""}` +
      `${p.gitRepo ? `Repo: ${escapeHtml(p.gitRepo)}\n` : ""}` +
      (p.latestDeployments.length
        ? `\nRecent deployments:\n${p.latestDeployments
            .map((d: { state: string; url: string; createdAt: string }) => `• ${d.state} — https://${escapeHtml(d.url)} <i>${fmtAgo(d.createdAt)}</i>`)
            .join("\n")}`
        : "") +
      `\n\n/deployments ${escapeHtml(p.name)} · /env ${escapeHtml(p.name)} · /domains ${escapeHtml(p.name)}`
    );
  });
}

export async function cmdDeploy(ctx: Context, args: string[]) {
  // NL passes [provider, project, ref]; command form is /deploy <project> [ref]
  let [a, b, c] = args;
  let provider = "vercel";
  if (a === "vercel" || a === "render") {
    provider = a;
    [a, b] = [b, c];
  }
  if (!a) return ctx.reply("Usage: /deploy <project> [ref=main]  (or \"deploy my-app to vercel\")");
  if (provider === "render") {
    return withProvider(ctx, "render", "services.deploy", async (conn) => {
      const { serviceStatus } = await import("../providers/render.js");
      const svc = await serviceStatus(conn.token, a);
      return `🟣 Render service <b>${escapeHtml(svc.name)}</b> status: ${escapeHtml(svc.status ?? "unknown")}${svc.latestDeploy ? ` — last deploy ${escapeHtml(svc.latestDeploy.status)}` : ""}\n(Use the Render dashboard for manual redeploys — /restart ${escapeHtml(a)} to bounce it.)`;
    });
  }
  await withProvider(ctx, "vercel", "deployments.create", async (conn) => {
    const d = await vc.deploy(conn.token, a, b ?? "main");
    return `🚀 <b>Deployment started</b>\n\nhttps://${escapeHtml(d.url)}\nstate: ${escapeHtml(d.state)}\n\n/deployment ${escapeHtml(d.id)} for details.`;
  });
}

export async function cmdRedeploy(ctx: Context, args: string[]) {
  const [deploymentId] = args;
  if (!deploymentId) return ctx.reply("Usage: /redeploy <deployment-id>");
  await withProvider(ctx, "vercel", "deployments.restore", async (conn) => {
    const d = await vc.restoreDeployment(conn.token, deploymentId);
    return `♻️ Redeployed: https://${escapeHtml(d.url)} (${escapeHtml(d.state)})`;
  });
}

export async function cmdDeployments(ctx: Context, args: string[]) {
  // NL passes [provider, project]
  let [a, b] = args;
  if (a === "vercel" || a === "render") {
    if (a === "render") {
      return withProvider(ctx, "render", "deploys.list", async (conn) => {
        const { listServices, listDeploys } = await import("../providers/render.js");
        const services = await listServices(conn.token);
        const target = b ? services.find((s) => s.name === b || s.id === b) : services[0];
        if (!target) return "🈳 No matching Render service.";
        const deploys = await listDeploys(conn.token, target.id);
        return `🟣 <b>Deploys</b> — ${escapeHtml(target.name)}\n\n${deploys
          .map((d) => `• ${escapeHtml(d.status)} ${d.commit ? `<code>${escapeHtml(d.commit)}</code>` : ""} <i>${fmtAgo(d.finishedAt)}</i>`)
          .join("\n") || "🈳 No deploys."}`;
      });
    }
    [a, b] = [b, a];
  }
  await withProvider(ctx, "vercel", "deployments.list", async (conn) => {
    const list = await vc.listDeployments(conn.token, b || a || undefined);
    if (!list.length) return "🈳 No deployments.";
    const icon = (s?: string) => (s === "READY" ? "✅" : s === "ERROR" ? "❌" : "🔄");
    return `☁️ <b>Deployments</b>${b || a ? ` — ${escapeHtml(b ?? a)}` : ""}\n\n${list
      .map((d) => `${icon(d.state)} <code>${escapeHtml(d.id ?? "").slice(0, 10)}</code> https://${escapeHtml(d.url)} [${escapeHtml(d.state ?? "")}] <i>${fmtAgo(d.createdAt)}</i>`)
      .join("\n")}`;
  });
}

export async function cmdDeployment(ctx: Context, args: string[]) {
  const [id] = args;
  if (!id) return ctx.reply("Usage: /deployment <deployment-id>");
  await withProvider(ctx, "vercel", "deployments.get", async (conn) => {
    const d = await vc.getDeployment(conn.token, id);
    return (
      `☁️ <b>Deployment</b>\n\n` +
      `id: <code>${escapeHtml(String(d.id).slice(0, 14))}</code>\n` +
      `url: https://${escapeHtml(d.url)}\n` +
      `state: ${escapeHtml(d.state ?? "")}\n` +
      `${d.errorMessage ? `error: ${escapeHtml(d.errorMessage)}\n` : ""}` +
      `\n/logs ${escapeHtml(String(d.id))} · /redeploy ${escapeHtml(String(d.id))}`
    );
  });
}

export async function cmdEnv(ctx: Context, args: string[]) {
  const [sub, project, key, ...rest] = args;
  if (sub === "set" && project && key) {
    return withProvider(ctx, "vercel", "env.set", async (conn) => {
      await vc.setEnv(conn.token, project, key, rest.join(" "));
      return `✅ Env <code>${escapeHtml(key)}</code> set on ${escapeHtml(project)} (production).`;
    });
  }
  if (sub === "rm" && project && key) {
    return withProvider(ctx, "vercel", "env.remove", async (conn) => {
      const vars = await vc.listEnv(conn.token, project);
      const target = vars.find((v: { key: string; id: string }) => v.key === key || v.id === key);
      if (!target) return `No env var "${escapeHtml(key)}" on ${escapeHtml(project)}.`;
      const keyId = `envrm:${project.replace(/\W/g, "")}:${target.id}`;
      await askConfirm(ctx, keyId, `Delete env var <code>${escapeHtml(target.key)}</code> from ${escapeHtml(project)}?`, `🗑 Yes, delete ${escapeHtml(target.key)}`, async () => {
        await withProvider(ctx, "vercel", "env.remove", async (c2) => {
          await vc.removeEnv(c2.token, project, target.id);
          return `🗑 Removed <code>${escapeHtml(target.key)}</code>.`;
        });
      });
    });
  }
  if (!project && sub) {
    // /env <project>
    return withProvider(ctx, "vercel", "env.list", async (conn) => {
      const vars = await vc.listEnv(conn.token, sub);
      return `🔐 <b>Env vars</b> — ${escapeHtml(sub)}\n\n${vars
        .map((v: { key: string; target: string[] }) => `• <code>${escapeHtml(v.key)}</code> [${v.target.join(",")}]`)
        .join("\n") || "🈳 No env vars."}\n\n/env set ${escapeHtml(sub)} <key> <value>`;
    });
  }
  return ctx.reply("Usage:\n/env <project> — list\n/env set <project> <key> <value>\n/env rm <project> <key>");
}

export async function cmdDomains(ctx: Context, args: string[]) {
  const [sub, project, domain] = args;
  if (sub === "add" && project && domain) {
    return withProvider(ctx, "vercel", "domains.add", async (conn) => {
      const d = await vc.addDomain(conn.token, project, domain);
      return `✅ Domain ${escapeHtml(d.name)} added to ${escapeHtml(project)}${d.verified ? " (verified)" : " — point DNS at cname.vercel-dns.com to verify"}.`;
    });
  }
  const name = sub && project ? project : sub;
  if (!name) return ctx.reply("Usage:\n/domains <project> — list\n/domains add <project> <domain>");
  await withProvider(ctx, "vercel", "domains.list", async (conn) => {
    const domains = await vc.listDomains(conn.token, name);
    return `🌐 <b>Domains</b> — ${escapeHtml(name)}\n\n${domains
      .map((d: { verified: boolean; name: string; primary?: boolean }) => `${d.verified ? "✅" : "⏳"} ${escapeHtml(d.name)}${d.primary ? " ⭐" : ""}`)
      .join("\n") || "🈳 No custom domains."}\n\n/domains add ${escapeHtml(name)} example.com`;
  });
}

export async function cmdLogs(ctx: Context, args: string[]) {
  const [id] = args;
  if (!id) return ctx.reply("Usage: /logs <deployment-id>");
  await withProvider(ctx, "vercel", "deployments.events", async (conn) => {
    const events = await vc.deploymentEvents(conn.token, id);
    return `📜 <b>Recent events</b> — ${escapeHtml(id)}\n\n${events
      .map((e: { type?: unknown; text?: unknown }) => `• <code>${escapeHtml(String(e.type ?? ""))}</code> ${escapeHtml(String(e.text ?? "").slice(0, 80))}`)
      .join("\n") || "🈳 No events."}`;
  });
}

export function register(bot: Telegraf) {
  bot.command("projects", (ctx) => cmdProjects(ctx, argsOf(ctx)));
  bot.command("create-project", (ctx) => cmdCreateProject(ctx, argsOf(ctx)));
  bot.command("project", (ctx) => cmdProject(ctx, argsOf(ctx)));
  bot.command("deploy", (ctx) => cmdDeploy(ctx, argsOf(ctx)));
  bot.command("redeploy", (ctx) => cmdRedeploy(ctx, argsOf(ctx)));
  bot.command("deployments", (ctx) => cmdDeployments(ctx, argsOf(ctx)));
  bot.command("deployment", (ctx) => cmdDeployment(ctx, argsOf(ctx)));
  bot.command("env", (ctx) => cmdEnv(ctx, argsOf(ctx)));
  bot.command("domains", (ctx) => cmdDomains(ctx, argsOf(ctx)));
  bot.command("logs", (ctx) => cmdLogs(ctx, argsOf(ctx)));
}
