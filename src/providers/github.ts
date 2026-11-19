/**
 * GitHub provider — repos, files, branches, PRs, issues, releases,
 * Actions, collaborators, webhooks.
 *
 * Three auth shapes, all stored in the vault:
 *  - pat:         a PAT/OAuth token string
 *  - oauth:       same as pat (issued via the OAuth login flow)
 *  - app_install: JSON {installationId, userToken?} — the GitHub App
 *                 "install Tandem on your account" flow. Repo calls mint
 *                 short-lived installation tokens (RS256 JWT) on demand.
 */

import { createSign } from "node:crypto";
import { config } from "../config.js";
import { pfetch, ProviderError, parseRepo } from "./http.js";
import type { ValidationResult } from "./index.js";

export interface GithubConn {
  authType: "pat" | "oauth" | "app_install";
  /** Decrypted secret: token string, or JSON for app_install. */
  token: string;
}

const API = "https://api.github.com";

// ── GitHub App installation tokens ──────────────────────────────────

function signAppJwt(): string {
  const { appId, privateKey } = config.oauth.githubApp;
  if (!appId || !privateKey) throw new ProviderError("GitHub App is not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY missing).");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iat: now - 60, exp: now + 540, iss: appId })}`;
  const sig = createSign("RSA-SHA256").update(data).sign(privateKey).toString("base64url");
  return `${data}.${sig}`;
}

const installTokenCache = new Map<number, { token: string; expiresAt: number }>();

async function mintInstallationToken(installationId: number): Promise<string> {
  const cached = installTokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 120_000) return cached.token;

  const jwt = signAppJwt();
  const data = await pfetch(`${API}/app/installations/${installationId}/access_tokens`, jwt, {
    method: "POST",
    body: {},
    headers: { Accept: "application/vnd.github+json" },
  });
  const token = data.token as string;
  installTokenCache.set(installationId, {
    token,
    expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 3600_000,
  });
  return token;
}

/** Resolve the bearer token to use for API calls. */
export async function githubAccessToken(conn: GithubConn): Promise<string> {
  if (conn.authType !== "app_install") return conn.token;
  let parsed: { installationId?: number | string; userToken?: string };
  try {
    parsed = JSON.parse(conn.token);
  } catch {
    throw new ProviderError("Stored GitHub App connection is malformed — reconnect with /connect github.");
  }
  const installationId = Number(parsed.installationId);
  if (!Number.isFinite(installationId))
    throw new ProviderError("GitHub App installation id missing — reconnect with /connect github.");
  return mintInstallationToken(installationId);
}

// ── Validation / identity ───────────────────────────────────────────

export async function validateGithub(token: string): Promise<ValidationResult> {
  // app_install blob: validate by minting an installation token.
  let bearer = token;
  if (token.startsWith("{")) {
    try {
      bearer = await githubAccessToken({ authType: "app_install", token });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
  try {
    const user = await pfetch(`${API}/user`, bearer, {
      headers: { Accept: "application/vnd.github+json" },
    });
    return { ok: true, identity: `@${user.login}` };
  } catch (err) {
    if (err instanceof ProviderError && err.status === 401)
      return { ok: false, error: "GitHub rejected that token (401). Check it's valid and not expired." };
    if (err instanceof ProviderError && err.status === 403)
      return { ok: false, error: "GitHub token lacks the 'read:user' scope — can't identify the account." };
    throw err;
  }
}

// ── Core ops ────────────────────────────────────────────────────────

function gh(token: string, url: string, opts: Parameters<typeof pfetch>[2] = {}) {
  return pfetch(url, token, {
    ...opts,
    headers: { Accept: "application/vnd.github+json", ...(opts.headers ?? {}) },
  });
}

export interface RepoSummary {
  fullName: string;
  private: boolean;
  url: string;
  description?: string;
  updatedAt?: string;
}

export async function listRepos(conn: GithubConn, page = 1): Promise<RepoSummary[]> {
  const token = await githubAccessToken(conn);
  const rows = await gh(
    token,
    `${API}/user/repos?sort=updated&per_page=10&page=${Math.max(1, page)}&affiliation=owner,collaborator`
  );
  return (rows as any[]).map((r) => ({
    fullName: r.full_name,
    private: r.private,
    url: r.html_url,
    description: r.description ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  }));
}

export async function createRepo(
  conn: GithubConn,
  name: string,
  opts: { description?: string; isPrivate?: boolean; autoInit?: boolean } = {}
): Promise<RepoSummary> {
  const token = await githubAccessToken(conn);
  const r = await gh(token, `${API}/user/repos`, {
    method: "POST",
    body: {
      name,
      description: opts.description,
      private: opts.isPrivate ?? true,
      auto_init: opts.autoInit ?? true,
    },
  });
  return {
    fullName: r.full_name,
    private: r.private,
    url: r.html_url,
    description: r.description ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  };
}

export async function getRepo(conn: GithubConn, full: string) {
  const ref = parseRepo(full);
  if (!ref) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const r = await gh(token, `${API}/repos/${ref.owner}/${ref.repo}`);
  return {
    fullName: r.full_name,
    private: r.private,
    url: r.html_url,
    description: r.description ?? undefined,
    defaultBranch: r.default_branch,
    stars: r.stargazers_count,
    openIssues: r.open_issues_count,
    language: r.language ?? undefined,
  };
}

export async function getFile(conn: GithubConn, full: string, path: string, ref?: string) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const f = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}${q}`);
  const text = f.encoding === "base64"
    ? Buffer.from(String(f.content).replace(/\n/g, ""), "base64").toString("utf8")
    : String(f.content ?? "");
  return { name: f.name, path: f.path, size: f.size, sha: f.sha, text: text.slice(0, 3500) };
}

export async function commitFile(
  conn: GithubConn,
  full: string,
  path: string,
  content: string,
  message: string,
  opts: { branch?: string; sha?: string } = {}
) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const url = `${API}/repos/${repo.owner}/${repo.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
  };
  if (opts.branch) body.branch = opts.branch;
  if (opts.sha) body.sha = opts.sha;
  const r = await gh(token, url, { method: "PUT", body });
  return { commitSha: r.commit?.sha, htmlUrl: r.commit?.html_url, contentPath: r.content?.path };
}

export async function listBranches(conn: GithubConn, full: string) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const rows = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/branches?per_page=20`);
  return (rows as any[]).map((b) => ({ name: b.name, protected: b.protected }));
}

export async function createBranch(conn: GithubConn, full: string, name: string, fromBranch = "main") {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const base = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`);
  await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/git/refs`, {
    method: "POST",
    body: { ref: `refs/heads/${name}`, sha: base.object.sha },
  });
  return { name, from: fromBranch };
}

export async function listPRs(conn: GithubConn, full: string, state: "open" | "closed" | "all" = "open") {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const rows = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/pulls?state=${state}&per_page=10`);
  return (rows as any[]).map((p) => ({
    number: p.number,
    title: p.title,
    url: p.html_url,
    state: p.state,
    draft: p.draft,
    head: p.head?.ref,
    base: p.base?.ref,
  }));
}

export async function createPR(conn: GithubConn, full: string, title: string, head: string, base: string, body?: string) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const p = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/pulls`, {
    method: "POST",
    body: { title, head, base, body },
  });
  return { number: p.number, title: p.title, url: p.html_url };
}

export async function mergePR(conn: GithubConn, full: string, number: number, method: "merge" | "squash" | "rebase" = "squash") {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const r = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/pulls/${number}/merge`, {
    method: "PUT",
    body: { merge_method: method },
  });
  return { merged: Boolean(r.merged), sha: r.sha, message: r.message };
}

export async function listIssues(conn: GithubConn, full: string, state: "open" | "closed" | "all" = "open") {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const rows = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/issues?state=${state}&per_page=10`);
  return (rows as any[])
    .filter((i) => !i.pull_request)
    .map((i) => ({ number: i.number, title: i.title, url: i.html_url, state: i.state, labels: (i.labels ?? []).map((l: any) => l.name) }));
}

export async function createIssue(conn: GithubConn, full: string, title: string, body?: string, labels?: string[]) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const i = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/issues`, {
    method: "POST",
    body: { title, body, labels },
  });
  return { number: i.number, title: i.title, url: i.html_url };
}

export async function closeIssue(conn: GithubConn, full: string, number: number) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const i = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/issues/${number}`, {
    method: "PATCH",
    body: { state: "closed" },
  });
  return { number: i.number, state: i.state, url: i.html_url };
}

export async function listReleases(conn: GithubConn, full: string) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const rows = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/releases?per_page=10`);
  return (rows as any[]).map((r) => ({
    tag: r.tag_name,
    name: r.name,
    url: r.html_url,
    draft: r.draft,
    prerelease: r.prerelease,
    publishedAt: r.published_at ?? undefined,
  }));
}

export async function createRelease(conn: GithubConn, full: string, tag: string, name?: string, body?: string) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const r = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/releases`, {
    method: "POST",
    body: { tag_name: tag, name: name ?? tag, body, generate_release_notes: !body },
  });
  return { tag: r.tag_name, url: r.html_url, name: r.name };
}

export async function listWorkflows(conn: GithubConn, full: string) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const data = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/actions/workflows?per_page=20`);
  return (data.workflows ?? []).map((w: any) => ({ id: w.id, name: w.name, state: w.state, path: w.path }));
}

export async function listRuns(conn: GithubConn, full: string) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const data = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/actions/runs?per_page=8`);
  return (data.workflow_runs ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
    url: r.html_url,
    branch: r.head_branch,
    createdAt: r.created_at,
  }));
}

export async function triggerWorkflow(conn: GithubConn, full: string, workflow: string, ref: string, inputs?: Record<string, string>) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  await gh(
    token,
    `${API}/repos/${repo.owner}/${repo.repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    { method: "POST", body: { ref, inputs } }
  );
  return { workflow, ref, dispatched: true };
}

export async function listCollaborators(conn: GithubConn, full: string) {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const rows = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/collaborators?per_page=20`);
  return (rows as any[]).map((c) => ({ login: c.login, role: c.role_name ?? (c.permissions?.admin ? "admin" : "push"), url: c.html_url }));
}

/** Make sure a repo webhook points at Tandem (used by /watch). */
export async function ensureRepoWebhook(
  conn: GithubConn,
  full: string,
  webhookUrl: string,
  secret: string,
  events: string[]
): Promise<{ created: boolean; hookId: number }> {
  const repo = parseRepo(full);
  if (!repo) throw new ProviderError(`"${full}" isn't in owner/name form.`);
  const token = await githubAccessToken(conn);
  const hooks = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/hooks?per_page=50`);
  const existing = (hooks as any[]).find((h) => h.config?.url === webhookUrl);
  if (existing) return { created: false, hookId: existing.id };
  const hook = await gh(token, `${API}/repos/${repo.owner}/${repo.repo}/hooks`, {
    method: "POST",
    body: {
      name: "web",
      active: true,
      events: events.length ? events : ["push", "pull_request", "issues", "deployment", "workflow_run", "release"],
      config: { url: webhookUrl, content_type: "json", secret },
    },
  });
  return { created: true, hookId: hook.id };
}
