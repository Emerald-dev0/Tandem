/**
 * Key-value storage drivers.
 *
 * Redis (Upstash REST) when configured — survives Vercel cold starts.
 * Falls back to in-memory (dev only, resets on redeploy).
 *
 * Upstash needs no credit card: create it from Vercel → Storage (or
 * upstash.com) and the env vars arrive automatically.
 */

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
}

class MemoryKV implements KV {
  private map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
  async del(key: string) {
    this.map.delete(key);
  }
  async incr(key: string) {
    const next = (Number(this.map.get(key)) || 0) + 1;
    this.map.set(key, String(next));
    return next;
  }
}

/** Upstash Redis over its REST API — plain fetch, zero dependencies. */
class UpstashKV implements KV {
  constructor(private url: string, private token: string) {}

  private async cmd(...segments: string[]): Promise<{ result: unknown }> {
    const res = await fetch(`${this.url}/${segments.map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Upstash error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<{ result: unknown }>;
  }

  async get(key: string) {
    const { result } = await this.cmd("get", key);
    return (result as string | null) ?? null;
  }
  async set(key: string, value: string) {
    await this.cmd("set", key, value);
  }
  async del(key: string) {
    await this.cmd("del", key);
  }
  async incr(key: string) {
    const { result } = await this.cmd("incr", key);
    return Number(result);
  }
}

let instance: KV | null = null;
let mode: "redis" | "memory" = "memory";

export function storageMode(): "redis" | "memory" {
  getStorage();
  return mode;
}

export function getStorage(): KV {
  if (instance) return instance;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    instance = new UpstashKV(url.replace(/\/$/, ""), token);
    mode = "redis";
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "Tandem: no UPSTASH_REDIS_REST_URL/TOKEN set — using in-memory storage. " +
          "Data will reset on every cold start. Add Upstash in Vercel → Storage (free, no card)."
      );
    }
    instance = new MemoryKV();
    mode = "memory";
  }
  return instance;
}
