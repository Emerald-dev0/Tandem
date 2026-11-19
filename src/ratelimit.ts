/**
 * Phase 10 — rate limiting.
 *
 * Sliding-window counters per user and per (user, action-kind). Pure
 * in-memory: per warm serverless instance, which is exactly the blast
 * radius we need to stop message floods and API hammering.
 */

interface Window {
  timestamps: number[];
}

const windows = new Map<string, Window>();

export interface LimitSpec {
  max: number;
  windowMs: number;
}

export const LIMITS = {
  messages: { max: 15, windowMs: 10_000 },
  providerCalls: { max: 45, windowMs: 60_000 },
  destructive: { max: 6, windowMs: 60_000 },
} as const;

/** Returns { ok } or { ok: false, retryAfterSec }. */
export function checkLimit(
  userId: number,
  kind: keyof typeof LIMITS,
  spec: LimitSpec = LIMITS[kind]
): { ok: true } | { ok: false; retryAfterSec: number } {
  const key = `${kind}:${userId}`;
  const now = Date.now();
  const w = windows.get(key) ?? { timestamps: [] };
  w.timestamps = w.timestamps.filter((t) => now - t < spec.windowMs);

  if (w.timestamps.length >= spec.max) {
    const oldest = w.timestamps[0];
    windows.set(key, w);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + spec.windowMs - now) / 1000)) };
  }

  w.timestamps.push(now);
  windows.set(key, w);

  // Opportunistic GC so the map can't grow unbounded.
  if (windows.size > 5000) {
    for (const [k, v] of windows) {
      if (v.timestamps.every((t) => now - t >= spec.windowMs)) windows.delete(k);
    }
  }
  return { ok: true };
}

/** Test hook. */
export function _resetLimits() {
  windows.clear();
}
