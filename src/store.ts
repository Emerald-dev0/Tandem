/**
 * Persistent user/connection store.
 *
 * Backed by Upstash Redis in production (survives Vercel cold starts),
 * in-memory as a dev fallback. Provider tokens are encrypted with the
 * vault before they touch storage — plaintext never leaves vault.ts.
 */

import { getStorage } from "./storage.js";
import { encrypt, decrypt } from "./vault.js";

export interface TandemUser {
  telegramUserId: number;
  telegramUsername?: string;
  firstName?: string;
  languageCode?: string;
  createdAt: Date;
  lastSeenAt: Date;
  workspaceId: string;
  connectedProviders: string[];
}

export interface StoredConnection {
  provider: string;
  /** Who the token belongs to — e.g. "@octocat". */
  identity?: string;
  connectedAt: string;
  /** AES-256-GCM payload, never plaintext. */
  tokenEnc: string;
}

export interface PendingState {
  kind: string; // e.g. "token:github"
  startedAt: string;
  tries?: number;
}

function userKey(id: number) {
  return `tandem:user:${id}`;
}
function connsKey(id: number) {
  return `tandem:conns:${id}`;
}
function pendingKey(id: number) {
  return `tandem:pending:${id}`;
}

function revive(input: Record<string, unknown>): TandemUser {
  return {
    ...(input as unknown as TandemUser),
    createdAt: new Date(input.createdAt as string),
    lastSeenAt: new Date(input.lastSeenAt as string),
  };
}

export async function getOrCreateUser(input: {
  telegramUserId: number;
  telegramUsername?: string;
  firstName?: string;
  languageCode?: string;
}): Promise<TandemUser> {
  const kv = getStorage();
  const raw = await kv.get(userKey(input.telegramUserId));
  if (raw) {
    const user = revive(JSON.parse(raw));
    user.lastSeenAt = new Date();
    if (input.telegramUsername) user.telegramUsername = input.telegramUsername;
    if (input.firstName) user.firstName = input.firstName;
    await kv.set(userKey(input.telegramUserId), JSON.stringify(user));
    return user;
  }

  const user: TandemUser = {
    telegramUserId: input.telegramUserId,
    telegramUsername: input.telegramUsername,
    firstName: input.firstName,
    languageCode: input.languageCode,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    workspaceId: `ws_${input.telegramUserId}`,
    connectedProviders: [],
  };
  await kv.set(userKey(input.telegramUserId), JSON.stringify(user));
  await kv.incr("tandem:stats:user_count");
  return user;
}

export async function getUser(telegramUserId: number): Promise<TandemUser | undefined> {
  const raw = await getStorage().get(userKey(telegramUserId));
  return raw ? revive(JSON.parse(raw)) : undefined;
}

export async function userCount(): Promise<number> {
  return Number((await getStorage().get("tandem:stats:user_count")) || 0);
}

// ── Connections ─────────────────────────────────────────────────────

async function readConns(userId: number): Promise<Record<string, StoredConnection>> {
  const raw = await getStorage().get(connsKey(userId));
  return raw ? (JSON.parse(raw) as Record<string, StoredConnection>) : {};
}

export async function saveConnection(
  userId: number,
  provider: string,
  token: string,
  identity?: string
): Promise<void> {
  const kv = getStorage();
  const conns = await readConns(userId);
  conns[provider] = {
    provider,
    identity,
    connectedAt: new Date().toISOString(),
    tokenEnc: encrypt(token.trim()),
  };
  await kv.set(connsKey(userId), JSON.stringify(conns));

  const user = await getUser(userId);
  if (user && !user.connectedProviders.includes(provider)) {
    user.connectedProviders.push(provider);
    await kv.set(userKey(userId), JSON.stringify(user));
  }
}

export async function getConnection(
  userId: number,
  provider: string
): Promise<{ identity?: string; connectedAt: string; token: string } | undefined> {
  const conn = (await readConns(userId))[provider];
  if (!conn) return undefined;
  return {
    identity: conn.identity,
    connectedAt: conn.connectedAt,
    token: decrypt(conn.tokenEnc),
  };
}

/** List connections WITHOUT tokens — safe to display. */
export async function listConnections(
  userId: number
): Promise<{ provider: string; identity?: string; connectedAt: string }[]> {
  return Object.values(await readConns(userId)).map(({ provider, identity, connectedAt }) => ({
    provider,
    identity,
    connectedAt,
  }));
}

export async function removeConnection(userId: number, provider: string): Promise<void> {
  const kv = getStorage();
  const conns = await readConns(userId);
  delete conns[provider];
  await kv.set(connsKey(userId), JSON.stringify(conns));

  const user = await getUser(userId);
  if (user) {
    user.connectedProviders = user.connectedProviders.filter((p) => p !== provider);
    await kv.set(userKey(userId), JSON.stringify(user));
  }
}

// ── Conversation state (survives cold starts) ───────────────────────

export async function getPending(userId: number): Promise<PendingState | undefined> {
  const raw = await getStorage().get(pendingKey(userId));
  return raw ? (JSON.parse(raw) as PendingState) : undefined;
}

export async function setPending(userId: number, state: PendingState): Promise<void> {
  await getStorage().set(pendingKey(userId), JSON.stringify(state));
}

export async function clearPending(userId: number): Promise<void> {
  await getStorage().del(pendingKey(userId));
}
