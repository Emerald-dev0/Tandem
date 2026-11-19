/**
 * Phase 8 — deterministic workflow orchestration.
 *
 * A workflow is an ordered list of steps. Every step is one provider API
 * call (serverless-safe), reports progress, and fails loudly with the
 * step that broke. Runs are recorded as tasks for /tasks and /history.
 */

import {
  getConnection,
  saveTask,
  type Task,
  type TaskStep,
} from "./store.js";
import { checkLimit } from "./ratelimit.js";
import * as gh from "./providers/github.js";
import * as vc from "./providers/vercel.js";
import * as cf from "./providers/cloudflare.js";
import type { AuthType } from "./store.js";

export interface WorkflowCtx {
  userId: number;
  args: string[];
  /** Connection (authType + decrypted secret) or null when not connected. */
  conn(provider: string): Promise<{ authType: AuthType; token: string } | null>;
  /** Free-form progress line for the live status message. */
  note(line: string): void;
}

export interface WorkflowStep {
  label: string;
  /** Providers this step needs — missing ones skip the step with a hint. */
  needs?: string[];
  run: (ctx: WorkflowCtx) => Promise<string>;
}

export interface Workflow {
  id: string;
  name: string;
  icon: string;
  description: string;
  argsHint: string;
  steps: WorkflowStep[];
}

function ghConn(ctx: WorkflowCtx): gh.GithubConn | null {
  return null; // replaced at runtime by step closures via ctx.conn
}

async function requireConn(ctx: WorkflowCtx, provider: string) {
  const c = await ctx.conn(provider);
  if (!c) throw new Error(`${provider} is not connected — run /connect ${provider} first`);
  return c;
}

export const WORKFLOWS: Workflow[] = [
  {
    id: "diagnose",
    name: "Health check",
    icon: "🩺",
    description: "Check storage, vault, and every provider connection.",
    argsHint: "",
    steps: [
      {
        label: "Storage",
        run: async () => {
          const { storageMode } = await import("./storage.js");
          return `storage mode: ${storageMode()}`;
        },
      },
      {
        label: "Vault",
        run: async () => {
          const { vaultReady } = await import("./vault.js");
          return vaultReady() ? "encryption key present" : "no ENCRYPTION_KEY — /connect will offer to generate one";
        },
      },
      {
        label: "Connections",
        run: async (ctx) => {
          const { listConnections } = await import("./store.js");
          const { validateToken } = await import("./providers/index.js");
          const conns = await listConnections(ctx.userId);
          if (!conns.length) return "no providers connected yet";
          const results: string[] = [];
          for (const c of conns) {
            const full = await ctx.conn(c.provider);
            if (!full) {
              results.push(`${c.provider}: ?`);
              continue;
            }
            const check: import("./providers/index.js").ValidationResult = await validateToken(c.provider, full.token).catch(
              (e: Error) => ({ ok: false, error: e.message })
            );
            results.push(`${c.provider}: ${check.ok ? `ok (${check.identity ?? "verified"})` : `FAILED — ${check.error}`}`);
          }
          return results.join("; ");
        },
      },
    ],
  },
  {
    id: "ship-it",
    name: "Ship it",
    icon: "🚀",
    description: "Create a repo, connect it to Vercel, and deploy it.",
    argsHint: "<name> [private|public]",
    steps: [
      {
        label: "Create GitHub repo",
        needs: ["github"],
        run: async (ctx) => {
          const [name, visibility] = ctx.args;
          if (!name) throw new Error("usage: /run ship-it <name> [private|public]");
          const c = await requireConn(ctx, "github");
          const repo = await gh.createRepo(c as gh.GithubConn, name, {
            isPrivate: (visibility ?? "private") !== "public",
            autoInit: true,
            description: "Created by Tandem 🤖",
          });
          return `repo ${repo.fullName} (${repo.private ? "private" : "public"})`;
        },
      },
      {
        label: "Create Vercel project",
        needs: ["vercel"],
        run: async (ctx) => {
          const [name] = ctx.args;
          const c = await requireConn(ctx, "vercel");
          const p = await vc.createProject(c.token, name, name);
          return `project ${p.name} linked to ${name}`;
        },
      },
      {
        label: "Deploy",
        needs: ["vercel"],
        run: async (ctx) => {
          const [name] = ctx.args;
          const c = await requireConn(ctx, "vercel");
          const d = await vc.deploy(c.token, name);
          return `deployment ${d.id} → https://${d.url} (${d.state})`;
        },
      },
    ],
  },
  {
    id: "site-launch",
    name: "Site launch",
    icon: "🌍",
    description: "Repo → Vercel deploy → point DNS at it.",
    argsHint: "<name> <domain>",
    steps: [
      {
        label: "Create GitHub repo",
        needs: ["github"],
        run: async (ctx) => {
          const [name] = ctx.args;
          if (!name) throw new Error("usage: /run site-launch <name> <domain>");
          const c = await requireConn(ctx, "github");
          const repo = await gh.createRepo(c as gh.GithubConn, name, { isPrivate: true, autoInit: true });
          return `repo ${repo.fullName}`;
        },
      },
      {
        label: "Create Vercel project + deploy",
        needs: ["vercel"],
        run: async (ctx) => {
          const [name] = ctx.args;
          const c = await requireConn(ctx, "vercel");
          await vc.createProject(c.token, name, name);
          const d = await vc.deploy(c.token, name);
          return `deploying → https://${d.url}`;
        },
      },
      {
        label: "Add DNS record",
        needs: ["cloudflare"],
        run: async (ctx) => {
          const [, domain] = ctx.args;
          if (!domain) throw new Error("usage: /run site-launch <name> <domain>");
          const c = await requireConn(ctx, "cloudflare");
          const record = await cf.addDns(
            c.token,
            domain,
            "CNAME",
            domain,
            "cname.vercel-dns.com",
            true
          );
          return `DNS ${record.type} ${record.name} → ${record.content} (proxied)`;
        },
      },
      {
        label: "Verify DNS",
        run: async (ctx) => {
          const [, domain] = ctx.args;
          if (!domain) return "no domain given";
          const check = await cf.dnsCheck(domain, "CNAME").catch(() => cf.dnsCheck(domain, "A"));
          return check.answers.length
            ? `${domain} resolves to ${check.answers[0]}`
            : `${domain} not resolving yet (DNS can take a few minutes)`;
        },
      },
    ],
  },
  {
    id: "morning",
    name: "Morning brief",
    icon: "☀️",
    description: "Status, connections, and the last 24h of activity.",
    argsHint: "",
    steps: [
      {
        label: "System status",
        run: async () => {
          const { storageMode } = await import("./storage.js");
          const { vaultReady } = await import("./vault.js");
          return `storage ${storageMode()}, vault ${vaultReady() ? "ready" : "missing key"}`;
        },
      },
      {
        label: "Recent activity",
        run: async (ctx) => {
          const { listActivity } = await import("./store.js");
          const rows = (await listActivity(ctx.userId, 6)).filter(
            (a) => Date.now() - new Date(a.createdAt).getTime() < 24 * 3600 * 1000
          );
          return rows.length
            ? rows.map((a) => `${a.action}${a.detail ? ` — ${a.detail.slice(0, 50)}` : ""}`).join(" | ")
            : "nothing in the last 24h";
        },
      },
      {
        label: "Watches & alerts",
        run: async (ctx) => {
          const { listWatches, listAlerts } = await import("./store.js");
          const w = await listWatches(ctx.userId);
          const a = await listAlerts(ctx.userId);
          return `${w.length} watch(es) [${w.map((x) => x.repo).join(", ")}], ${a.length} alert rule(s)`;
        },
      },
    ],
  },
];

export function findWorkflow(idOrName: string): Workflow | undefined {
  const q = idOrName.toLowerCase();
  return WORKFLOWS.find((w) => w.id === q || w.name.toLowerCase() === q);
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Run a workflow. Returns the finished task. `onProgress` fires after each
 * step so the caller can edit a live status message.
 */
export async function runWorkflow(
  wf: Workflow,
  ctx: WorkflowCtx,
  onProgress?: (task: Task) => void | Promise<void>
): Promise<Task> {
  // A workflow is one logical action — count it against the destructive-ish bucket.
  const limit = checkLimit(ctx.userId, "destructive");
  if (!limit.ok) throw new Error(`Slow down a little — try again in ${limit.retryAfterSec}s.`);

  const task: Task = {
    id: shortId(),
    workflow: wf.id,
    args: ctx.args,
    status: "running",
    steps: wf.steps.map((s) => ({ label: s.label, status: "pending" })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveTask(ctx.userId, task);
  await onProgress?.(task);

  for (let i = 0; i < wf.steps.length; i++) {
    const step = wf.steps[i];
    const record: TaskStep = task.steps[i];

    // Skip steps whose providers aren't connected — the run still finishes.
    const missing: string[] = [];
    for (const p of step.needs ?? []) {
      if (!(await ctx.conn(p))) missing.push(p);
    }
    if (missing.length) {
      record.status = "skipped";
      record.detail = `needs ${missing.join(", ")} — /connect ${missing[0]} first`;
      task.updatedAt = new Date().toISOString();
      await saveTask(ctx.userId, task);
      await onProgress?.(task);
      continue;
    }

    record.status = "running";
    await onProgress?.(task);
    try {
      ctx.note(`${step.label}…`);
      record.detail = await step.run(ctx);
      record.status = "done";
    } catch (err) {
      record.status = "failed";
      record.detail = (err as Error).message;
      task.status = "failed";
      task.updatedAt = new Date().toISOString();
      await saveTask(ctx.userId, task);
      await onProgress?.(task);
      return task;
    }
    task.updatedAt = new Date().toISOString();
    await saveTask(ctx.userId, task);
    await onProgress?.(task);
  }

  task.status = "done";
  task.updatedAt = new Date().toISOString();
  await saveTask(ctx.userId, task);
  await onProgress?.(task);
  return task;
}

export function renderTask(task: Task): string {
  const icon = { pending: "⚪", running: "🔄", done: "✅", failed: "❌", skipped: "⏭" } as const;
  const head = task.status === "done" ? "✅ Workflow complete" : task.status === "failed" ? "❌ Workflow failed" : "🔄 Running workflow";
  const lines = [`${head} — <b>${task.workflow}</b>`, ""];
  for (const s of task.steps) {
    lines.push(`${icon[s.status]} ${s.label}${s.detail ? ` — ${s.detail}` : ""}`);
  }
  return lines.join("\n");
}
