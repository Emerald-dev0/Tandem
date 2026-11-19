/**
 * Cloudflare provider — zones, DNS records, cache purge, zone settings.
 * API: https://developers.cloudflare.com/api/
 */

import { pfetch, ProviderError } from "./http.js";
import type { ValidationResult } from "./index.js";

const API = "https://api.cloudflare.com/client/v4";

async function cf(token: string, url: string, opts: Parameters<typeof pfetch>[2] = {}) {
  const data = await pfetch(url, token, opts);
  if (data && data.success === false) {
    const msg = (data.errors ?? []).map((e: any) => e.message).join("; ") || "unknown error";
    throw new ProviderError(`Cloudflare said: ${msg}`);
  }
  return data?.result ?? data;
}

export async function validateCloudflare(token: string): Promise<ValidationResult> {
  try {
    const verify = await pfetch(`${API}/user/tokens/verify`, token);
    if (verify?.result?.status !== "active")
      return { ok: false, error: "Cloudflare says that token is not active. Check the token and its permissions." };
    let identity = "active Cloudflare token";
    try {
      const user = await cf(token, `${API}/user`);
      if (user?.email) identity = user.email;
    } catch {
      /* /user needs User:Read — optional */
    }
    return { ok: true, identity };
  } catch (err) {
    if (err instanceof ProviderError && err.status === 401)
      return { ok: false, error: "Cloudflare rejected that token (401)." };
    throw err;
  }
}

export interface ZoneSummary {
  id: string;
  name: string;
  status: string;
  paused: boolean;
}

export async function listZones(token: string): Promise<ZoneSummary[]> {
  const zones = await cf(token, `${API}/zones?per_page=20`);
  return (zones as any[]).map((z) => ({ id: z.id, name: z.name, status: z.status, paused: z.paused }));
}

export async function getZone(token: string, nameOrId: string): Promise<ZoneSummary> {
  const isId = /^[0-9a-f]{32}$/.test(nameOrId);
  const z = await cf(token, isId ? `${API}/zones/${nameOrId}` : `${API}/zones?name=${encodeURIComponent(nameOrId)}`);
  const zone = Array.isArray(z) ? z[0] : z;
  if (!zone) throw new ProviderError(`Zone "${nameOrId}" not found on this account.`);
  return { id: zone.id, name: zone.name, status: zone.status, paused: zone.paused };
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export async function listDns(token: string, zone: string): Promise<DnsRecord[]> {
  const z = await getZone(token, zone);
  const records = await cf(token, `${API}/zones/${z.id}/dns_records?per_page=25`);
  return (records as any[]).map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    content: r.content,
    proxied: r.proxied,
    ttl: r.ttl,
  }));
}

export async function addDns(
  token: string,
  zone: string,
  type: string,
  name: string,
  content: string,
  proxied = false
): Promise<DnsRecord> {
  const z = await getZone(token, zone);
  const r = await cf(token, `${API}/zones/${z.id}/dns_records`, {
    method: "POST",
    body: { type: type.toUpperCase(), name, content, ttl: 1, proxied },
  });
  return { id: r.id, type: r.type, name: r.name, content: r.content, proxied: r.proxied, ttl: r.ttl };
}

export async function updateDns(
  token: string,
  zone: string,
  recordId: string,
  patch: { type?: string; name?: string; content?: string; proxied?: boolean }
): Promise<DnsRecord> {
  const z = await getZone(token, zone);
  const r = await cf(token, `${API}/zones/${z.id}/dns_records/${recordId}`, {
    method: "PATCH",
    body: {
      type: patch.type?.toUpperCase(),
      name: patch.name,
      content: patch.content,
      proxied: patch.proxied,
      ttl: 1,
    },
  });
  return { id: r.id, type: r.type, name: r.name, content: r.content, proxied: r.proxied, ttl: r.ttl };
}

export async function deleteDns(token: string, zone: string, recordId: string): Promise<void> {
  const z = await getZone(token, zone);
  await cf(token, `${API}/zones/${z.id}/dns_records/${recordId}`, { method: "DELETE" });
}

export async function purgeCache(token: string, zone: string): Promise<void> {
  const z = await getZone(token, zone);
  await cf(token, `${API}/zones/${z.id}/purge_cache`, {
    method: "POST",
    body: { purge_everything: true },
  });
}

export async function zoneSettings(token: string, zone: string) {
  const z = await getZone(token, zone);
  const settings = await cf(token, `${API}/zones/${z.id}/settings`);
  const pick = ["ssl", "always_use_https", "min_tls_version", "brotli", "http2", "http3", "automatic_https_rewrites"];
  return (settings as any[])
    .filter((s) => pick.includes(s.id))
    .map((s) => ({ id: s.id, value: typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value) }));
}

/** Public DNS resolution check (Cloudflare DoH — no token needed). */
export async function dnsCheck(name: string, type = "A"): Promise<{ name: string; type: string; answers: string[] }> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
    { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new ProviderError(`DNS lookup failed (${res.status}).`);
  const data = await res.json();
  return {
    name,
    type,
    answers: (data.Answer ?? []).map((a: any) => `${a.data} (TTL ${a.TTL})`),
  };
}
