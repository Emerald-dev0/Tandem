/**
 * Typed data layer — users, connections, OAuth states, watches, alerts,
 * workflow tasks, settings, activity. Backed by store.ts drivers:
 * Neon Postgres in production, memory in dev/tests.
 *
 * Provider tokens are encrypted with the vault before they touch storage —
 * plaintext never leaves vault.ts.
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

export type AuthType = "pat" | "oauth" | "app_install";

export interface StoredConnection {
  provider: string;
  /** Who the token belongs to — e.g. "@octocat". */
  identity?: string;
  connectedAt: string;
  authType: AuthType;
  /** AES-256-GCM payload (JSON for app_install: {installationId, userTokenEnc?}). */
  tokenEnc: string;
}

export interface PendingState {
  kind: string; // e.g. "token:github"
  startedAt: string;
  tries?: number;
  data?: Record<string, unknown>;
}

export interface UserSettings {
  digestEnabled: boolean;
  notificationsEnabled: boolean;
}

export interface Watch {
  provider: string;
  repo: string; // owner/name
  events: string[];
  createdAt: string;
}

export interface Alert {
  provider: string;
  event: string; // push | pull_request | workflow_run | deployment | issues | '*'
  createdAt: string;
}

export interface TaskStep {
  label: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  detail?: string;
}

export interface Task {
  id: string;
  workflow: string;
  args: string[];
  status: "running" | "done" | "failed";
  steps: TaskStep[];
  createdAt: string;
  updatedAt: string;
}

// ── Keys ────────────────────────────────────────────────────────────

const userKey = (id: number) => `tandem:user:${id}`;
const connsKey = (id: number) => `tandem:conns:${id}`;
const pendingKey = (id: number) => `tandem:pending:${id}`;
const settingsKey = (id: number) => `tandem:settings:${id}`;
const oauthStateKey = (nonce: string) => `tandem:oauth:state:${nonce}`;
const watchKey = (id: number, provider: string, repo: string) =>
  `tandem:watch:${id}:${provider}:${repo.toLowerCase()}`;
const alertKey = (id: number, provider: string, event: string) =>
  `tandem:alert:${id}:${provider}:${event}`;
const taskKey = (id: number, taskId: string) => `tandem:task:${id}:${taskId}`;

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

// ── Users ───────────────────────────────────────────────────────────

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

export async function listUserIds(): Promise<number[]> {
  const keys = await getStorage().list("tandem:user:");
  return keys.map((k) => Number(k.slice("tandem:user:".length))).filter((n) => Number.isFinite(n));
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
  identity?: string,
  authType: AuthType = "pat"
): Promise<void> {
  const kv = getStorage();
  const conns = await readConns(userId);
  conns[provider] = {
    provider,
    identity,
    connectedAt: new Date().toISOString(),
    authType,
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
): Promise<{ identity?: string; connectedAt: string; authType: AuthType; token: string } | undefined> {
  const conn = (await readConns(userId))[provider];
  if (!conn) return undefined;
  return {
    identity: conn.identity,
    connectedAt: conn.connectedAt,
    authType: conn.authType,
    token: decrypt(conn.tokenEnc),
  };
}

/** List connections WITHOUT tokens — safe to display. */
export async function listConnections(
  userId: number
): Promise<{ provider: string; identity?: string; connectedAt: string; authType: AuthType }[]> {
  return Object.values(await readConns(userId)).map(({ provider, identity, connectedAt, authType }) => ({
    provider,
    identity,
    connectedAt,
    authType,
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

// ── OAuth state (single-use, TTL-bounded) ───────────────────────────

export async function saveOAuthState(nonce: string, userId: number, provider: string): Promise<void> {
  await getStorage().set(
    oauthStateKey(nonce),
    JSON.stringify({ userId, provider, createdAt: new Date().toISOString() })
  );
}

export async function consumeOAuthState(
  nonce: string
): Promise<{ userId: number; provider: string } | null> {
  const kv = getStorage();
  const raw = await kv.get(oauthStateKey(nonce));
  if (!raw) return null;
  await kv.del(oauthStateKey(nonce)); // single use
  const parsed = JSON.parse(raw) as { userId: number; provider: string; createdAt: string };
  if (Date.now() - new Date(parsed.createdAt).getTime() > OAUTH_STATE_TTL_MS) return null;
  return { userId: parsed.userId, provider: parsed.provider };
}

// ── Settings ────────────────────────────────────────────────────────

export async function getSettings(userId: number): Promise<UserSettings> {
  const raw = await getStorage().get(settingsKey(userId));
  const defaults: UserSettings = { digestEnabled: true, notificationsEnabled: true };
  return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<UserSettings>) } : defaults;
}

export async function setSettings(userId: number, patch: Partial<UserSettings>): Promise<void> {
  const current = await getSettings(userId);
  await getStorage().set(settingsKey(userId), JSON.stringify({ ...current, ...patch }));
}

// ── Activity (audit trail) ──────────────────────────────────────────

export async function logActivity(
  userId: number,
  provider: string | null,
  action: string,
  detail?: string
): Promise<void> {
  await getStorage().insertActivity({
    userId,
    provider,
    action,
    detail: detail ?? null,
    createdAt: new Date().toISOString(),
  });
}

export async function listActivity(
  userId: number,
  limit = 10
): Promise<{ provider: string | null; action: string; detail: string | null; createdAt: string }[]> {
  return getStorage().listActivity(userId, limit);
}

// ── Watches (repos the user wants events for) ───────────────────────

export async function addWatch(userId: number, provider: string, repo: string, events: string[]): Promise<void> {
  const watch: Watch = { provider, repo, events, createdAt: new Date().toISOString() };
  await getStorage().set(watchKey(userId, provider, repo), JSON.stringify(watch));
}

export async function removeWatch(userId: number, provider: string, repo: string): Promise<void> {
  await getStorage().del(watchKey(userId, provider, repo));
}

export async function listWatches(userId: number): Promise<Watch[]> {
  const keys = await getStorage().list(`tandem:watch:${userId}:`);
  const out: Watch[] = [];
  for (const k of keys) {
    const raw = await getStorage().get(k);
    if (raw) out.push(JSON.parse(raw) as Watch);
  }
  return out;
}

/** All users watching a given repo (used by the GitHub webhook receiver). */
export async function listWatchesForRepo(provider: string, repo: string): Promise<{ userId: number; watch: Watch }[]> {
  const kv = getStorage();
  const keys = await kv.list(`tandem:watch:`);
  const needle = `:${provider}:${repo.toLowerCase()}`;
  const out: { userId: number; watch: Watch }[] = [];
  for (const k of keys) {
    if (!k.endsWith(needle)) continue;
    const raw = await kv.get(k);
    if (!raw) continue;
    const userId = Number(k.split(":")[2]);
    if (Number.isFinite(userId)) out.push({ userId, watch: JSON.parse(raw) as Watch });
  }
  return out;
}

// ── Alerts (which events should notify) ─────────────────────────────

export async function addAlert(userId: number, provider: string, event: string): Promise<void> {
  const alert: Alert = { provider, event, createdAt: new Date().toISOString() };
  await getStorage().set(alertKey(userId, provider, event), JSON.stringify(alert));
}

export async function removeAlert(userId: number, provider: string, event: string): Promise<void> {
  await getStorage().del(alertKey(userId, provider, event));
}

export async function listAlerts(userId: number): Promise<Alert[]> {
  const keys = await getStorage().list(`tandem:alert:${userId}:`);
  const out: Alert[] = [];
  for (const k of keys) {
    const raw = await getStorage().get(k);
    if (raw) out.push(JSON.parse(raw) as Alert);
  }
  return out;
}

/** Users whose alerts match a provider event (used by the webhook receiver). */
export async function listAlertsForEvent(provider: string, event: string): Promise<{ userId: number; alert: Alert }[]> {
  const kv = getStorage();
  const keys = await kv.list(`tandem:alert:${""}`.replace(/:$/, ":")); // "tandem:alert:"
  const out: { userId: number; alert: Alert }[] = [];
  for (const k of keys) {
    const raw = await kv.get(k);
    if (!raw) continue;
    const alert = JSON.parse(raw) as Alert;
    if (alert.provider !== provider && alert.provider !== "*") continue;
    if (alert.event !== event && alert.event !== "*") continue;
    const userId = Number(k.split(":")[2]);
    if (Number.isFinite(userId)) out.push({ userId, alert });
  }
  return out;
}

// ── Workflow tasks ──────────────────────────────────────────────────

export async function saveTask(userId: number, task: Task): Promise<void> {
  await getStorage().set(taskKey(userId, task.id), JSON.stringify(task));
}

export async function getTask(userId: number, taskId: string): Promise<Task | undefined> {
  const raw = await getStorage().get(taskKey(userId, taskId));
  return raw ? (JSON.parse(raw) as Task) : undefined;
}

export async function listTasks(userId: number, limit = 10): Promise<Task[]> {
  const keys = (await getStorage().list(`tandem:task:${userId}:`)).reverse(); // newest-ish first
  const out: Task[] = [];
  for (const k of keys.slice(0, limit)) {
    const raw = await getStorage().get(k);
    if (raw) out.push(JSON.parse(raw) as Task);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ── Bot identity (for OAuth deep links back to Telegram) ────────────

export async function setBotUsername(username: string): Promise<void> {
  await getStorage().set("tandem:bot:username", username.replace(/^@/, ""));
}

export async function getBotUsername(): Promise<string | undefined> {
  return (await getStorage().get("tandem:bot:username")) ?? undefined;
}
