/**
 * GitHub commands (Phase 3) — real API calls through the vaulted connection.
 */

import { Telegraf, Context, Markup } from "telegraf";
import * as gh from "../providers/github.js";
import { withProvider, escapeHtml, fmtAgo, askConfirm, formatError } from "./shared.js";
import { config } from "../config.js";

function argsOf(ctx: Context): string[] {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  return text.split(/\s+/).slice(1).filter(Boolean);
}

const REPOS_PER_PAGE = 20;

export async function cmdRepos(ctx: Context, args: string[]) {
  const page = Math.max(1, Number(args[0]) || 1);
  await withProvider(ctx, "github", "repos.list", async (conn) => {
    const { repos, hasNextPage } = await gh.listRepos(conn, page, REPOS_PER_PAGE);
    if (!repos.length) {
      return page === 1
        ? '📂 <b>No repositories found.</b>\n\nCreate one — say <i>"create a private repo called my-app"</i> or use /create_repo my-app.'
        : `📂 Nothing on page ${page} — that was the end of the list.`;
    }
    const lines = repos.map(
      (r, i) =>
        `${String((page - 1) * REPOS_PER_PAGE + i + 1).padStart(2, " ")}. ` +
        `${r.private ? "🔒" : "🌐"} <a href="${r.url}">${escapeHtml(r.fullName)}</a>` +
        `${r.description ? ` — ${escapeHtml(r.description.slice(0, 40))}` : ""} <i>${fmtAgo(r.updatedAt)}</i>`
    );
    return {
      text:
        `📂 <b>Your repositories</b> — page ${page}\n\n` +
        lines.join("\n") +
        `\n\n/repo owner/name for details.${hasNextPage ? "" : " <i>That's everything.</i>"}`,
      extra: hasNextPage
        ? {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback("➡️ Show more", `repos:page:${page + 1}`)],
            ]).reply_markup,
          }
        : undefined,
    };
  });
}

export async function cmdCreateRepo(ctx: Context, args: string[]) {
  const [name, visibility, ...desc] = args;
  if (!name) {
    return ctx.reply('Usage: /create_repo <name> [private|public] [description]\nOr say "create a private repo called my-app".');
  }
  await withProvider(ctx, "github", "repos.create", async (conn) => {
    const repo = await gh.createRepo(conn, name, {
      isPrivate: (visibility ?? "private").toLowerCase() !== "public",
      description: desc.join(" ") || undefined,
      autoInit: true,
    });
    return (
      `✅ <b>Repository created</b>\n\n` +
      `📂 <a href="${repo.url}">${escapeHtml(repo.fullName)}</a> (${repo.private ? "private" : "public"})\n\n` +
      `Next: /deploy vercel ${escapeHtml(repo.fullName)}`
    );
  });
}

export async function cmdRepo(ctx: Context, args: string[]) {
  const [full] = args;
  if (!full) return ctx.reply("Usage: /repo owner/name");
  await withProvider(ctx, "github", "repos.get", async (conn) => {
    const r = await gh.getRepo(conn, full);
    return (
      `📂 <b><a href="${r.url}">${escapeHtml(r.fullName)}</a></b>\n\n` +
      `${r.description ? `${escapeHtml(r.description)}\n\n` : ""}` +
      `${r.private ? "🔒 private" : "🌐 public"} · ${escapeHtml(r.language ?? "—")} · ⭐ ${r.stars} · 🐞 ${r.openIssues} open issues\n` +
      `Default branch: <code>${escapeHtml(r.defaultBranch)}</code>\n\n` +
      `/branches · /prs · /issues · /runs`
    );
  });
}

export async function cmdFile(ctx: Context, args: string[]) {
  const [full, path, ref] = args;
  if (!full || !path) return ctx.reply("Usage: /file owner/name <path> [branch]");
  await withProvider(ctx, "github", "files.get", async (conn) => {
    const f = await gh.getFile(conn, full, path, ref);
    return (
      `📄 <b>${escapeHtml(f.path)}</b> (${f.size} bytes)\n\n` +
      `<pre>${escapeHtml(f.text.slice(0, 2800))}</pre>\n\n` +
      `sha: <code>${f.sha.slice(0, 8)}</code> — use /commit to change it.`
    );
  });
}

export async function cmdCommit(ctx: Context, args: string[]) {
  const [full, path, message, ...content] = args;
  if (!full || !path || !message || !content.length) {
    return ctx.reply('Usage: /commit owner/name <path> <message> <content…>\n(For multi-line files, use the repo file flow in Phase 3.5.)');
  }
  await withProvider(ctx, "github", "files.commit", async (conn) => {
    const r = await gh.commitFile(conn, full, path, content.join(" "), message);
    return `✅ Committed to <code>${escapeHtml(path)}</code>\n${r.htmlUrl ? `<a href="${r.htmlUrl}">view commit</a>` : `sha <code>${(r.commitSha ?? "").slice(0, 8)}</code>`}`;
  });
}

export async function cmdBranches(ctx: Context, args: string[]) {
  const [full] = args;
  if (!full) return ctx.reply("Usage: /branches owner/name");
  await withProvider(ctx, "github", "branches.list", async (conn) => {
    const branches = await gh.listBranches(conn, full);
    return `🌿 <b>Branches</b> — ${escapeHtml(full)}\n\n${branches
      .map((b) => `• <code>${escapeHtml(b.name)}</code>${b.protected ? " 🔒" : ""}`)
      .join("\n")}`;
  });
}

export async function cmdBranch(ctx: Context, args: string[]) {
  const [full, name, from] = args;
  if (!full || !name) return ctx.reply("Usage: /branch owner/name <new-branch> [from-branch]");
  await withProvider(ctx, "github", "branches.create", async (conn) => {
    const b = await gh.createBranch(conn, full, name, from ?? "main");
    return `🌿 Created <code>${escapeHtml(b.name)}</code> from <code>${escapeHtml(b.from)}</code>`;
  });
}

export async function cmdPrs(ctx: Context, args: string[]) {
  const [full, state] = args;
  if (!full) return ctx.reply("Usage: /prs owner/name [open|closed|all]");
  await withProvider(ctx, "github", "prs.list", async (conn) => {
    const prs = await gh.listPRs(conn, full, (state as any) ?? "open");
    if (!prs.length) return "🈳 No pull requests.";
    return `🔀 <b>Pull requests</b> — ${escapeHtml(full)}\n\n${prs
      .map(
        (p) =>
          `${p.draft ? "📝" : "🔀"} #${p.number} <a href="${p.url}">${escapeHtml(p.title)}</a> <code>${escapeHtml(p.head)}→${escapeHtml(p.base)}</code> [${p.state}]`
      )
      .join("\n")}`;
  });
}

export async function cmdPr(ctx: Context, args: string[]) {
  const [sub, full, a, ...rest] = args;
  if (sub === "create" && full && a && rest.length) {
    return withProvider(ctx, "github", "prs.create", async (conn) => {
      const p = await gh.createPR(conn, full, rest.slice(1).join(" ") || `Merge ${a} into ${rest[0]}`, a, rest[0]);
      return `✅ PR #${p.number} opened: <a href="${p.url}">${escapeHtml(p.title)}</a>`;
    });
  }
  if (sub === "view" && full && a) {
    return withProvider(ctx, "github", "prs.get", async (conn) => {
      const p = await gh.getPR(conn, full, Number(a));
      return (
        `🔀 <b>PR #${p.number}</b> [${escapeHtml(p.state)}${p.draft ? " · draft" : ""}]\n` +
        `<a href="${p.url}">${escapeHtml(p.title)}</a>\n\n` +
        `${p.body ? `${escapeHtml(p.body)}\n\n` : ""}` +
        `<code>${escapeHtml(p.head)} → ${escapeHtml(p.base)}</code> · ${p.changedFiles} file(s) · by @${escapeHtml(p.author)}\n` +
        `Mergeable: ${p.mergeable === false ? "no (conflicts)" : "yes"}\n\n` +
        `/pr comment ${escapeHtml(full)} ${p.number} <text> · /pr merge ${escapeHtml(full)} ${p.number}`
      );
    });
  }
  if (sub === "comment" && full && a && rest.length) {
    return withProvider(ctx, "github", "prs.comment", async (conn) => {
      const c = await gh.commentPR(conn, full, Number(a), rest.join(" "));
      return `💬 Commented on PR #${a}${c.url ? ` — <a href="${c.url}">view</a>` : ""}`;
    });
  }
  if ((sub === "close" || sub === "reopen") && full && a) {
    return withProvider(ctx, "github", `prs.${sub}`, async (conn) => {
      await gh.setPRState(conn, full, Number(a), sub === "close" ? "closed" : "open");
      return sub === "close" ? `✅ PR #${a} closed.` : `✅ PR #${a} reopened.`;
    });
  }
  if (sub === "merge" && full && a) {
    const key = `prmerge:${full.replace(/\W/g, "")}:${a}`;
    return askConfirm(
      ctx,
      key,
      `Merge PR #${a} in <b>${escapeHtml(full)}</b> (squash)?`,
      `🔀 Yes, merge #${a}`,
      async () => {
        await withProvider(ctx, "github", "prs.merge", async (conn) => {
          const r = await gh.mergePR(conn, full, Number(a), "squash");
          return r.merged ? `✅ PR #${a} merged (${(r.sha ?? "").slice(0, 8)})` : `Couldn't merge: ${escapeHtml(r.message ?? "")}`;
        });
      }
    );
  }
  return ctx.reply(
    "Usage:\n" +
      "/pr view owner/name <n>\n/pr create owner/name <head> <base> [title]\n" +
      "/pr comment owner/name <n> <text>\n/pr merge owner/name <n>\n/pr close|reopen owner/name <n>"
  );
}

export async function cmdIssues(ctx: Context, args: string[]) {
  const [full, state] = args;
  if (!full) return ctx.reply("Usage: /issues owner/name [open|closed|all]");
  await withProvider(ctx, "github", "issues.list", async (conn) => {
    const issues = await gh.listIssues(conn, full, (state as any) ?? "open");
    if (!issues.length) return "🈳 No issues.";
    return `🐞 <b>Issues</b> — ${escapeHtml(full)}\n\n${issues
      .map((i) => `${i.state === "open" ? "🟢" : "🟣"} #${i.number} <a href="${i.url}">${escapeHtml(i.title)}</a>${i.labels.length ? ` [${i.labels.map(escapeHtml).join(", ")}]` : ""}`)
      .join("\n")}`;
  });
}

export async function cmdIssue(ctx: Context, args: string[]) {
  const [sub, full, a, ...rest] = args;
  if (sub === "open" && full && a) {
    return withProvider(ctx, "github", "issues.create", async (conn) => {
      const i = await gh.createIssue(conn, full, rest.join(" ") || a, undefined);
      return `✅ Issue #${i.number}: <a href="${i.url}">${escapeHtml(i.title)}</a>`;
    });
  }
  if (sub === "view" && full && a) {
    return withProvider(ctx, "github", "issues.get", async (conn) => {
      const i = await gh.getIssue(conn, full, Number(a));
      return (
        `🐞 <b>Issue #${i.number}</b> [${escapeHtml(i.state)}]\n` +
        `<a href="${i.url}">${escapeHtml(i.title)}</a>\n\n` +
        `${i.body ? `${escapeHtml(i.body)}\n\n` : ""}` +
        `${i.labels.length ? `Labels: ${i.labels.map(escapeHtml).join(", ")}\n` : ""}` +
        `${i.assignees.length ? `Assignees: ${i.assignees.map((u) => `@${escapeHtml(u)}`).join(", ")}\n` : ""}` +
        `by @${escapeHtml(i.author)}\n\n` +
        `/issue comment ${escapeHtml(full)} ${i.number} <text> · /issue close ${escapeHtml(full)} ${i.number}`
      );
    });
  }
  if (sub === "comment" && full && a && rest.length) {
    return withProvider(ctx, "github", "issues.comment", async (conn) => {
      const c = await gh.commentIssue(conn, full, Number(a), rest.join(" "));
      return `💬 Commented on issue #${a}${c.url ? ` — <a href="${c.url}">view</a>` : ""}`;
    });
  }
  if (sub === "label" && full && a && rest.length) {
    return withProvider(ctx, "github", "issues.label", async (conn) => {
      await gh.labelIssue(conn, full, Number(a), rest);
      return `🏷 Labeled issue #${a}: ${rest.map(escapeHtml).join(", ")}`;
    });
  }
  if ((sub === "close" || sub === "reopen") && full && a) {
    return withProvider(ctx, "github", `issues.${sub}`, async (conn) => {
      await gh.setIssueState(conn, full, Number(a), sub === "close" ? "closed" : "open");
      return sub === "close" ? `✅ Issue #${a} closed.` : `✅ Issue #${a} reopened.`;
    });
  }
  return ctx.reply(
    "Usage:\n" +
      "/issue view owner/name <n>\n/issue open owner/name <title…>\n" +
      "/issue comment owner/name <n> <text>\n/issue label owner/name <n> <label…>\n" +
      "/issue close|reopen owner/name <n>"
  );
}

export async function cmdReleases(ctx: Context, args: string[]) {
  const [full] = args;
  if (!full) return ctx.reply("Usage: /releases owner/name");
  await withProvider(ctx, "github", "releases.list", async (conn) => {
    const rs = await gh.listReleases(conn, full);
    if (!rs.length) return "🈳 No releases.";
    return `🏷 <b>Releases</b> — ${escapeHtml(full)}\n\n${rs
      .map((r: { url: string; tag: string; name?: string; publishedAt?: string }) => `🏷 <a href="${r.url}">${escapeHtml(r.tag)}</a> ${escapeHtml(r.name ?? "")} <i>${fmtAgo(r.publishedAt)}</i>`)
      .join("\n")}`;
  });
}

export async function cmdRelease(ctx: Context, args: string[]) {
  const [full, tag, ...rest] = args;
  if (!full || !tag) return ctx.reply("Usage: /release owner/name <tag> [notes…]");
  await withProvider(ctx, "github", "releases.create", async (conn) => {
    const r = await gh.createRelease(conn, full, tag, tag, rest.join(" ") || undefined);
    return `✅ Release ${escapeHtml(r.tag)}: <a href="${r.url}">view</a>`;
  });
}

export async function cmdRuns(ctx: Context, args: string[]) {
  const [sub, full, id] = args;
  if (sub === "cancel" && full && id) {
    return withProvider(ctx, "github", "runs.cancel", async (conn) => {
      await gh.cancelRun(conn, full, Number(id));
      return `🚫 Run ${id} is being cancelled.`;
    });
  }
  if (sub === "rerun" && full && id) {
    return withProvider(ctx, "github", "runs.rerun", async (conn) => {
      await gh.rerunRun(conn, full, Number(id));
      return `🔁 Run ${id} re-queued. Check /runs ${escapeHtml(full)} shortly.`;
    });
  }
  const repo = sub && !id ? sub : full;
  if (!repo) return ctx.reply("Usage:\n/runs owner/name\n/runs cancel owner/name <run-id>\n/runs rerun owner/name <run-id>");
  await withProvider(ctx, "github", "runs.list", async (conn) => {
    const runs = await gh.listRuns(conn, repo);
    if (!runs.length) return "🈳 No workflow runs.";
    const icon = (c?: string | null) => (c === "success" ? "✅" : c === "failure" ? "❌" : c === "cancelled" ? "🚫" : "🔄");
    return `⚙️ <b>Workflow runs</b> — ${escapeHtml(repo)}\n\n${runs
      .map((r: { conclusion?: string | null; status?: string; url: string; name: string; branch?: string | null; createdAt: string; id?: number }) => `${icon(r.conclusion ?? r.status)} <a href="${r.url}">${escapeHtml(r.name)}</a> — ${escapeHtml(r.branch ?? "")} <i>${fmtAgo(r.createdAt)}</i> <code>${r.id ?? ""}</code>`)
      .join("\n")}`;
  });
}

export async function cmdWorkflow(ctx: Context, args: string[]) {
  const [sub, full, wf, ref] = args;
  if (sub === "run" && full && wf) {
    return withProvider(ctx, "github", "runs.trigger", async (conn) => {
      const r = await gh.triggerWorkflow(conn, full, wf, ref ?? "main");
      return `🚀 Workflow <code>${escapeHtml(r.workflow)}</code> dispatched on <code>${escapeHtml(r.ref)}</code>.\nCheck /runs ${escapeHtml(full)} in a moment.`;
    });
  }
  if (!full) return ctx.reply("Usage:\n/workflow owner/name — list workflows\n/workflow run owner/name <workflow-file-or-name> [ref]");
  return withProvider(ctx, "github", "runs.workflows", async (conn) => {
    const wfs = await gh.listWorkflows(conn, full);
    if (!wfs.length) return "🈳 No workflows in this repo.";
    return `⚙️ <b>Workflows</b> — ${escapeHtml(full)}\n\n${wfs
      .map((w: { state: string; name: string; path: string }) => `${w.state === "active" ? "🟢" : "⏸"} ${escapeHtml(w.name)} <code>${escapeHtml(w.path)}</code>`)
      .join("\n")}\n\n/workflow run ${escapeHtml(full)} <name>`;
  });
}

export async function cmdCollaborators(ctx: Context, args: string[]) {
  const [full] = args;
  if (!full) return ctx.reply("Usage: /collaborators owner/name");
  await withProvider(ctx, "github", "collaborators.list", async (conn) => {
    const users = await gh.listCollaborators(conn, full);
    return `👥 <b>Collaborators</b> — ${escapeHtml(full)}\n\n${users
      .map((u) => `• @${escapeHtml(u.login)} (${escapeHtml(u.role)})`)
      .join("\n")}`;
  });
}

// ── Website-parity commands ────────────────────────────────────────

export async function cmdSearch(ctx: Context, args: string[]) {
  const q = args.join(" ").trim();
  if (!q) return ctx.reply('Usage: /search <query>\nExample: /search react dashboard\nOr say "search for login bug".');
  await withProvider(ctx, "github", "search", async (conn) => {
    const [repos, issues] = await Promise.all([
      gh.searchRepos(conn, q, 5).catch(() => []),
      gh.searchIssues(conn, q, 5).catch(() => []),
    ]);
    const repoLines = repos.map(
      (r: { fullName: string; url: string; stars: number; description?: string }) =>
        `⭐ ${r.stars} <a href="${r.url}">${escapeHtml(r.fullName)}</a>${r.description ? ` — ${escapeHtml(r.description.slice(0, 40))}` : ""}`
    );
    const issueLines = issues.map(
      (i: { number: number; title: string; url: string; state: string; repo: string; isPR: boolean }) =>
        `${i.isPR ? "🔀" : "🐞"} <a href="${i.url}">${escapeHtml(i.repo)}#${i.number}</a> ${escapeHtml(i.title.slice(0, 45))} [${escapeHtml(i.state)}]`
    );
    if (!repoLines.length && !issueLines.length) return `🔍 Nothing found for "${escapeHtml(q)}".`;
    return `🔍 <b>Results for "${escapeHtml(q)}"</b>\n\n${repoLines.length ? `Repositories:\n${repoLines.join("\n")}\n` : ""}${issueLines.length ? `\nIssues & PRs:\n${issueLines.join("\n")}` : ""}`;
  });
}

export async function cmdStar(ctx: Context, args: string[]) {
  const [full] = args;
  if (!full) return ctx.reply("Usage: /star owner/name");
  await withProvider(ctx, "github", "repos.star", async (conn) => {
    await gh.starRepo(conn, full);
    return `⭐ Starred <b>${escapeHtml(full)}</b>.`;
  });
}

export async function cmdUnstar(ctx: Context, args: string[]) {
  const [full] = args;
  if (!full) return ctx.reply("Usage: /unstar owner/name");
  await withProvider(ctx, "github", "repos.unstar", async (conn) => {
    await gh.unstarRepo(conn, full);
    return `💫 Unstarred <b>${escapeHtml(full)}</b>.`;
  });
}

export async function cmdFork(ctx: Context, args: string[]) {
  const [full] = args;
  if (!full) return ctx.reply("Usage: /fork owner/name");
  await withProvider(ctx, "github", "repos.fork", async (conn) => {
    const f = await gh.forkRepo(conn, full);
    return `🍴 Forked → <b>${escapeHtml(f.fullName ?? full)}</b>${f.url ? ` — <a href="${f.url}">view</a>` : ""}`;
  });
}

export async function cmdCommits(ctx: Context, args: string[]) {
  const [full, ref] = args;
  if (!full) return ctx.reply("Usage: /commits owner/name [branch]");
  await withProvider(ctx, "github", "commits.list", async (conn) => {
    const commits = await gh.listCommits(conn, full, ref);
    if (!commits.length) return "🈳 No commits found.";
    return (
      `🧾 <b>Recent commits</b> — ${escapeHtml(full)}${ref ? ` (${escapeHtml(ref)})` : ""}\n\n` +
      commits
        .map(
          (c: { sha: string; message: string; author: string; date?: string; url: string }) =>
            `<code>${escapeHtml(c.sha)}</code> <a href="${c.url}">${escapeHtml(c.message.slice(0, 55))}</a>\n   ${escapeHtml(c.author)} <i>${fmtAgo(c.date)}</i>`
        )
        .join("\n") +
      `\n\n/commit-info ${escapeHtml(full)} <sha> for the diff summary.`
    );
  });
}

export async function cmdCommitInfo(ctx: Context, args: string[]) {
  const [full, sha] = args;
  if (!full || !sha) return ctx.reply("Usage: /commit-info owner/name <sha>");
  await withProvider(ctx, "github", "commits.get", async (conn) => {
    const c = await gh.getCommit(conn, full, sha);
    return (
      `🧾 <b>Commit ${escapeHtml(c.sha)}</b>\n` +
      `<a href="${c.url}">${escapeHtml(c.message.split("\n")[0].slice(0, 70))}</a>\n` +
      `${escapeHtml(c.author)} <i>${fmtAgo(c.date)}</i> · +${c.stats.additions} −${c.stats.deletions}\n\n` +
      c.files
        .map(
          (f: { name: string; additions: number; deletions: number; status: string }) =>
            `<code>${escapeHtml(f.status[0] ?? "M")}</code> ${escapeHtml(f.name)} <i>+${f.additions} −${f.deletions}</i>`
        )
        .join("\n")
    );
  });
}

export async function cmdRepoEdit(ctx: Context, args: string[]) {
  const [full, what, ...rest] = args;
  if (!full || !what) {
    return ctx.reply(
      "Usage:\n/repo-edit owner/name desc <new description>\n/repo-edit owner/name public|private"
    );
  }
  if (what === "desc") {
    return withProvider(ctx, "github", "repos.edit", async (conn) => {
      const r = await gh.updateRepo(conn, full, { description: rest.join(" ") });
      return `✅ Description updated for <b>${escapeHtml(r.fullName ?? full)}</b>.`;
    });
  }
  if (what === "public" || what === "private") {
    const key = `vis:${full.replace(/\W/g, "").slice(0, 16)}:${what}`;
    return askConfirm(
      ctx,
      key,
      `Make <b>${escapeHtml(full)}</b> ${what === "public" ? "PUBLIC — anyone on the internet can see it" : "private"}?`,
      `⚠️ Yes, make it ${what}`,
      async () => {
        await withProvider(ctx, "github", "repos.edit", async (conn) => {
          await gh.updateRepo(conn, full, { private: what === "private" });
          return `✅ <b>${escapeHtml(full)}</b> is now ${what}.`;
        });
      }
    );
  }
  return ctx.reply("Usage:\n/repo-edit owner/name desc <new description>\n/repo-edit owner/name public|private");
}

export async function cmdRepoDelete(ctx: Context, args: string[]) {
  const [full] = args;
  if (!full) return ctx.reply("Usage: /repo-delete owner/name");
  const key = `repodel:${full.replace(/\W/g, "").slice(0, 24)}`;
  return askConfirm(
    ctx,
    key,
    `🚨 PERMANENTLY delete <b>${escapeHtml(full)}</b>?\nThis cannot be undone.`,
    "🗑 Yes, delete it forever",
    async () => {
      await withProvider(ctx, "github", "repos.delete", async (conn) => {
        await gh.deleteRepo(conn, full);
        return `🗑 <b>${escapeHtml(full)}</b> has been deleted.`;
      });
    }
  );
}

export function register(bot: Telegraf) {
  bot.command("repos", (ctx) => cmdRepos(ctx, argsOf(ctx)));
  bot.action(/^repos:page:(\d+)$/, (ctx) => cmdRepos(ctx, [String(ctx.match?.[1] ?? "2")]));
  const createRepo = (ctx: Context) => cmdCreateRepo(ctx, argsOf(ctx));
  bot.command("create_repo", createRepo);
  bot.command("create-repo", createRepo);
  bot.command("repo", (ctx) => cmdRepo(ctx, argsOf(ctx)));
  bot.command("file", (ctx) => cmdFile(ctx, argsOf(ctx)));
  bot.command("commit", (ctx) => cmdCommit(ctx, argsOf(ctx)));
  bot.command("branch", (ctx) => cmdBranch(ctx, argsOf(ctx)));
  bot.command("branches", (ctx) => cmdBranches(ctx, argsOf(ctx)));
  bot.command("pr", (ctx) => cmdPr(ctx, argsOf(ctx)));
  bot.command("prs", (ctx) => cmdPrs(ctx, argsOf(ctx)));
  bot.command("issue", (ctx) => cmdIssue(ctx, argsOf(ctx)));
  bot.command("issues", (ctx) => cmdIssues(ctx, argsOf(ctx)));
  bot.command("release", (ctx) => cmdRelease(ctx, argsOf(ctx)));
  bot.command("releases", (ctx) => cmdReleases(ctx, argsOf(ctx)));
  bot.command("workflow", (ctx) => cmdWorkflow(ctx, argsOf(ctx)));
  bot.command("runs", (ctx) => cmdRuns(ctx, argsOf(ctx)));
  bot.command("collaborators", (ctx) => cmdCollaborators(ctx, argsOf(ctx)));
  bot.command("search", (ctx) => cmdSearch(ctx, argsOf(ctx)));
  bot.command("star", (ctx) => cmdStar(ctx, argsOf(ctx)));
  bot.command("unstar", (ctx) => cmdUnstar(ctx, argsOf(ctx)));
  bot.command("fork", (ctx) => cmdFork(ctx, argsOf(ctx)));
  bot.command("commits", (ctx) => cmdCommits(ctx, argsOf(ctx)));
  bot.command("commit-info", (ctx) => cmdCommitInfo(ctx, argsOf(ctx)));
  bot.command("repo-edit", (ctx) => cmdRepoEdit(ctx, argsOf(ctx)));
  bot.command("repo-delete", (ctx) => cmdRepoDelete(ctx, argsOf(ctx)));
}

export { argsOf };
