/**
 * Storage drivers.
 *
 * postgres  — Neon (Vercel Marketplace, free, no card) — system of record.
 * redis     — Upstash Redis (optional) — cache / future queue layer.
 * memory    — dev fallback; resets on redeploy.
 *
 * The typed data layer lives in store.ts; this file only moves bytes.
 */

import { neon } from "@neondatabase/serverless";

export interface ActivityRow {
  userId: number;
  provider: string | null;
  action: string;
  detail: string | null;
  createdAt: string; // ISO
}

export interface StoreDriver {
  mode: "postgres" | "redis" | "memory";
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  list(prefix: string): Promise<string[]>;
  insertActivity(row: ActivityRow): Promise<void>;
  listActivity(userId: number, limit: number): Promise<ActivityRow[]>;
}

// ── Memory ──────────────────────────────────────────────────────────

class MemoryDriver implements StoreDriver {
  mode = "memory" as const;
  private map = new Map<string, string>();
  private activity: ActivityRow[] = [];

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
  async list(prefix: string) {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
  async insertActivity(row: ActivityRow) {
    this.activity.push(row);
    if (this.activity.length > 2000) this.activity.splice(0, 500);
  }
  async listActivity(userId: number, limit: number) {
    return this.activity
      .filter((r) => r.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }
}

// ── Upstash Redis (REST, zero deps) ─────────────────────────────────

class RedisDriver implements StoreDriver {
  mode = "redis" as const;
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
  async list(prefix: string) {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const { result } = await this.cmd("scan", cursor, "MATCH", `${prefix}*`, "COUNT", "500");
      const [next, batch] = result as [string, string[]];
      cursor = next;
      keys.push(...batch);
    } while (cursor !== "0");
    return keys.sort();
  }
  async insertActivity(row: ActivityRow) {
    // Key sorts chronologically (ISO timestamp first).
    const key = `tandem:activity:${row.userId}:${row.createdAt}:${Math.random().toString(36).slice(2, 8)}`;
    await this.set(key, JSON.stringify(row));
  }
  async listActivity(userId: number, limit: number) {
    const keys = await this.list(`tandem:activity:${userId}:`);
    const out: ActivityRow[] = [];
    for (const key of keys.reverse().slice(0, limit)) {
      const raw = await this.get(key);
      if (raw) out.push(JSON.parse(raw) as ActivityRow);
    }
    return out;
  }
}

// ── Postgres (Neon serverless driver — HTTP, works in Vercel functions) ──

class PostgresDriver implements StoreDriver {
  mode = "postgres" as const;
  private sql: ReturnType<typeof neon>;
  private schemaReady = false;

  constructor(url: string) {
    this.sql = neon(url);
  }

  private async ensureSchema() {
    if (this.schemaReady) return;
    await this.sql`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await this.sql`
      CREATE TABLE IF NOT EXISTS activity (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        provider TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await this.sql`
      CREATE INDEX IF NOT EXISTS activity_user_idx
        ON activity (user_id, created_at DESC)`;
    this.schemaReady = true;
  }

  async get(key: string) {
    await this.ensureSchema();
    const rows = (await this.sql`SELECT value FROM kv WHERE key = ${key}`) as Record<string, any>[];
    return rows.length ? ((rows[0] as { value: string }).value ?? null) : null;
  }
  async set(key: string, value: string) {
    await this.ensureSchema();
    await this.sql`
      INSERT INTO kv (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()`;
  }
  async del(key: string) {
    await this.ensureSchema();
    await this.sql`DELETE FROM kv WHERE key = ${key}`;
  }
  async incr(key: string) {
    await this.ensureSchema();
    const rows = (await this.sql`
      INSERT INTO kv (key, value) VALUES (${key}, '1')
      ON CONFLICT (key) DO UPDATE
        SET value = (kv.value::bigint + 1)::text, updated_at = now()
      RETURNING value`) as Record<string, any>[];
    return Number((rows[0] as { value: string }).value);
  }
  async list(prefix: string) {
    await this.ensureSchema();
    const rows = (await this.sql`
      SELECT key FROM kv WHERE key LIKE ${`${prefix}%`} ORDER BY key LIMIT 1000`) as Record<string, any>[];
    return rows.map((r) => (r as { key: string }).key);
  }
  async insertActivity(row: ActivityRow) {
    await this.ensureSchema();
    await this.sql`
      INSERT INTO activity (user_id, provider, action, detail, created_at)
      VALUES (${row.userId}, ${row.provider}, ${row.action}, ${row.detail}, ${row.createdAt})`;
  }
  async listActivity(userId: number, limit: number) {
    await this.ensureSchema();
    const rows = (await this.sql`
      SELECT user_id, provider, action, detail, created_at
      FROM activity WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT ${limit}`) as Record<string, any>[];
    return rows.map((r) => {
      const row = r as { user_id: string | number; provider: string | null; action: string; detail: string | null; created_at: string | Date };
      return {
        userId: Number(row.user_id),
        provider: row.provider,
        action: row.action,
        detail: row.detail,
        createdAt: new Date(row.created_at).toISOString(),
      };
    });
  }
}

// ── Selection ───────────────────────────────────────────────────────

let instance: StoreDriver | null = null;

export function storageMode(): "postgres" | "redis" | "memory" {
  return getStorage().mode;
}

export function getStorage(): StoreDriver {
  if (instance) return instance;

  const pgUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (pgUrl) {
    instance = new PostgresDriver(pgUrl);
  } else if (redisUrl && redisToken) {
    instance = new RedisDriver(redisUrl.replace(/\/$/, ""), redisToken);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "Tandem: no DATABASE_URL / POSTGRES_URL set — using in-memory storage. " +
          "Data resets on every cold start. Connect Neon Postgres in Vercel → Storage (free, no card)."
      );
    }
    instance = new MemoryDriver();
  }
  return instance;
}

/** Test hook: swap in a fresh driver (used by scripts/simulate.mjs). */
export function _resetStorageForTests() {
  instance = new MemoryDriver();
}
