/**
 * Vercel provider — projects, deployments, env vars, domains, events.
 * API: https://vercel.com/docs/rest-api
 */

import { pfetch, ProviderError } from "./http.js";
import type { ValidationResult } from "./index.js";

const API = "https://api.vercel.com";

/** Optional team scope (VERCEL_TEAM_ID) — personal account if absent. */
function teamQuery(): string {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}
function teamSep(base: string): string {
  return process.env.VERCEL_TEAM_ID ? `${base}${base.includes("?") ? "&" : "?"}teamId=${process.env.VERCEL_TEAM_ID}` : base;
}

export async function validateVercel(token: string): Promise<ValidationResult> {
  try {
    const data = await pfetch(`${API}/v2/user`, token);
    const u = data?.user ?? data;
    return { ok: true, identity: u?.username ? `@${u.username}` : (u?.email ?? "your Vercel account") };
  } catch (err) {
    if (err instanceof ProviderError && (err.status === 401 || err.status === 403))
      return { ok: false, error: "Vercel rejected that token. Check it hasn't expired." };
    throw err;
  }
}

export interface ProjectSummary {
  id: string;
  name: string;
  framework?: string;
  updatedAt?: number;
}

export async function listProjects(token: string, limit = 25): Promise<ProjectSummary[]> {
  const data = await pfetch(teamSep(`${API}/v9/projects?limit=${limit}`), token);
  return (data.projects ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    framework: p.framework ?? undefined,
    updatedAt: p.updatedAt ?? undefined,
  }));
}

export async function createProject(token: string, name: string, gitRepo?: string): Promise<ProjectSummary> {
  const body: Record<string, unknown> = { name, framework: null };
  if (gitRepo) {
    body.gitRepository = { type: "github", repo: gitRepo };
  }
  const p = await pfetch(teamSep(`${API}/v9/projects`), token, { method: "POST", body });
  return { id: p.id, name: p.name, framework: p.framework ?? undefined };
}

export async function getProject(token: string, idOrName: string) {
  const p = await pfetch(teamSep(`${API}/v9/projects/${encodeURIComponent(idOrName)}`), token);
  return {
    id: p.id,
    name: p.name,
    framework: p.framework ?? undefined,
    latestDeployments: (p.latestDeployments ?? []).slice(0, 3).map((d: any) => ({
      id: d.id,
      url: d.url,
      state: d.readyState,
      createdAt: d.createdAt,
    })),
    gitRepo: p.link?.repo ?? undefined,
  };
}

export interface DeploySummary {
  id: string;
  url: string;
  state: string;
  target?: string;
  createdAt?: number;
}

/** Create a production deployment from the project's connected git repo. */
export async function deploy(token: string, project: string, ref = "main"): Promise<DeploySummary> {
  const p = await pfetch(teamSep(`${API}/v9/projects/${encodeURIComponent(project)}`), token);
  const repoId = p.link?.repoId;
  const repoName = p.link?.repo;
  if (!repoId && !repoName) {
    throw new ProviderError(
      `Project "${project}" has no Git repository connected.`,
      undefined,
      "Connect a GitHub repo in the Vercel dashboard, or use /create-project with a repo."
    );
  }
  const d = await pfetch(teamSep(`${API}/v13/deployments`), token, {
    method: "POST",
    body: {
      name: p.name,
      project: p.id,
      target: "production",
      gitSource: { type: "github", repoId, repo: repoName, ref },
      meta: { action: "tandem-deploy" },
    },
  });
  return { id: d.id, url: d.url, state: d.readyState ?? "QUEUED", target: "production", createdAt: d.createdAt };
}

/** Roll back / promote an existing deployment. */
export async function restoreDeployment(token: string, deploymentId: string): Promise<DeploySummary> {
  const d = await pfetch(teamSep(`${API}/v13/deployments/${encodeURIComponent(deploymentId)}/restore`), token, {
    method: "POST",
    body: {},
  });
  return { id: d.id, url: d.url, state: d.readyState ?? "QUEUED", createdAt: d.createdAt };
}

export async function listDeployments(token: string, project?: string, limit = 15): Promise<DeploySummary[]> {
  let url = teamSep(`${API}/v6/deployments?limit=${limit}`);
  if (project) {
    const p = await pfetch(teamSep(`${API}/v9/projects/${encodeURIComponent(project)}`), token);
    url = teamSep(`${API}/v6/deployments?limit=${limit}&projectId=${p.id}`);
  }
  const data = await pfetch(url, token);
  return (data.deployments ?? []).map((d: any) => ({
    id: d.uid ?? d.id,
    url: d.url,
    state: d.state ?? d.readyState,
    target: d.target ?? undefined,
    createdAt: d.createdAt ?? undefined,
  }));
}

export async function getDeployment(token: string, idOrUrl: string) {
  const d = await pfetch(teamSep(`${API}/v13/deployments/${encodeURIComponent(idOrUrl)}`), token);
  return {
    id: d.id ?? d.uid,
    url: d.url,
    state: d.readyState ?? d.state,
    target: d.target ?? undefined,
    createdAt: d.createdAt ?? undefined,
    meta: d.meta ?? {},
    errorMessage: d.errorMessage ?? undefined,
  };
}

export async function listEnv(token: string, project: string) {
  const data = await pfetch(teamSep(`${API}/v9/projects/${encodeURIComponent(project)}/env`), token);
  return (data.envs ?? []).map((e: any) => ({
    id: e.id,
    key: e.key,
    target: e.target,
    type: e.type,
  }));
}

export async function setEnv(
  token: string,
  project: string,
  key: string,
  value: string,
  target: string[] = ["production"]
) {
  await pfetch(teamSep(`${API}/v9/projects/${encodeURIComponent(project)}/env`), token, {
    method: "POST",
    body: { key, value, target, type: "encrypted" },
  });
  return { key, target };
}

export async function removeEnv(token: string, project: string, envId: string) {
  await pfetch(teamSep(`${API}/v9/projects/${encodeURIComponent(project)}/env/${envId}`), token, {
    method: "DELETE",
  });
  return { removed: envId };
}

export async function listDomains(token: string, project: string) {
  const data = await pfetch(teamSep(`${API}/v9/projects/${encodeURIComponent(project)}/domains`), token);
  return (data.domains ?? []).map((d: any) => ({
    name: d.name,
    verified: d.verified,
    primary: d.primary ?? false,
  }));
}

export async function addDomain(token: string, project: string, domain: string) {
  const d = await pfetch(teamSep(`${API}/v9/projects/${encodeURIComponent(project)}/domains`), token, {
    method: "POST",
    body: { name: domain },
  });
  return { name: d.name, verified: d.verified };
}

/** Recent build/runtime events — best-effort "logs" view. */
export async function deploymentEvents(token: string, deploymentId: string) {
  const data = await pfetch(teamSep(`${API}/v2/deployments/${encodeURIComponent(deploymentId)}/events?limit=15&direction=backward`), token);
  const rows = Array.isArray(data) ? data : (data.events ?? []);
  return rows.map((e: any) => ({
    type: e.type ?? e.name,
    text: e.payload?.text ?? e.payload?.message ?? JSON.stringify(e.payload ?? {}).slice(0, 120),
    created: e.created,
  }));
}

export { teamQuery };
