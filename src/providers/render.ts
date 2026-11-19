/**
 * Render provider — services, deploys, restarts.
 * API: https://render.com/docs/api
 * Render is key-based (no OAuth app for API access) — connections are PATs.
 */

import { pfetch, ProviderError } from "./http.js";
import type { ValidationResult } from "./index.js";

const API = "https://api.render.com/v1";

export async function validateRender(token: string): Promise<ValidationResult> {
  try {
    const data = await pfetch(`${API}/owners`, token);
    const owners = data?.owners ?? data ?? [];
    const owner = owners?.[0]?.owner ?? owners?.[0] ?? {};
    return { ok: true, identity: owner.email ?? owner.name ?? "your Render account" };
  } catch (err) {
    if (err instanceof ProviderError && err.status === 401)
      return { ok: false, error: "Render rejected that API key. Check it and try again." };
    throw err;
  }
}

export interface ServiceSummary {
  id: string;
  name: string;
  type: string;
  status?: string;
  url?: string;
  repo?: string;
}

function mapService(s: any): ServiceSummary {
  return {
    id: s.id,
    name: s.name,
    type: s.type ?? "web_service",
    status: s.serviceDetails?.status ?? s.status ?? undefined,
    url: s.serviceDetails?.url ?? s.url ?? undefined,
    repo: s.repo ?? undefined,
  };
}

export async function listServices(token: string): Promise<ServiceSummary[]> {
  const data = await pfetch(`${API}/services?limit=15`, token);
  const rows = Array.isArray(data) ? data : (data.services ?? []);
  return rows.map((entry: any) => mapService(entry.service ?? entry));
}

export async function getService(token: string, id: string): Promise<ServiceSummary & { deploys?: unknown[] }> {
  const data = await pfetch(`${API}/services/${encodeURIComponent(id)}`, token);
  return mapService(data.service ?? data);
}

export async function createService(
  token: string,
  opts: {
    name: string;
    repo: string; // https://github.com/owner/name
    branch?: string;
    type?: "web_service" | "worker" | "cron";
    ownerId?: string;
  }
): Promise<ServiceSummary> {
  let ownerId = opts.ownerId;
  if (!ownerId) {
    const data = await pfetch(`${API}/owners`, token);
    const owners = data?.owners ?? [];
    ownerId = owners?.[0]?.owner?.id ?? owners?.[0]?.id;
    if (!ownerId) throw new ProviderError("Couldn't determine your Render owner id.");
  }
  const data = await pfetch(`${API}/services`, token, {
    method: "POST",
    body: {
      type: opts.type ?? "web_service",
      name: opts.name,
      ownerId,
      repo: opts.repo,
      branch: opts.branch ?? "main",
      autoDeploy: "yes",
      serviceDetails: { env: "node", plan: "starter" },
    },
  });
  return mapService(data.service ?? data);
}

export async function restartService(token: string, id: string): Promise<{ restarted: boolean }> {
  await pfetch(`${API}/services/${encodeURIComponent(id)}/restart`, token, { method: "POST", body: {} });
  return { restarted: true };
}

export interface DeploySummary {
  id: string;
  status: string;
  finishedAt?: string;
  commit?: string;
}

export async function listDeploys(token: string, serviceId: string): Promise<DeploySummary[]> {
  const data = await pfetch(`${API}/services/${encodeURIComponent(serviceId)}/deploys?limit=8`, token);
  const rows = Array.isArray(data) ? data : (data.deploys ?? []);
  return rows.map((entry: any) => {
    const d = entry.deploy ?? entry;
    return {
      id: d.id,
      status: d.status,
      finishedAt: d.finishedAt ?? undefined,
      commit: d.commit?.id ? String(d.commit.id).slice(0, 7) : d.commitId ? String(d.commitId).slice(0, 7) : undefined,
    };
  });
}

export async function serviceStatus(token: string, id: string) {
  const svc = await getService(token, id);
  const deploys = await listDeploys(token, id).catch(() => []);
  return {
    ...svc,
    latestDeploy: deploys[0] ?? null,
  };
}
