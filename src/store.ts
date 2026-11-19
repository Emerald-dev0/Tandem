/**
 * In-memory user store for Phase 1.
 *
 * This is intentionally simple so the bot runs with ZERO setup
 * (no database needed). When we move to Phase 1.5 we'll swap this
 * for PostgreSQL with the exact same interface — the bot code
 * won't need to change.
 */

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

const users = new Map<number, TandemUser>();

export function getOrCreateUser(input: {
  telegramUserId: number;
  telegramUsername?: string;
  firstName?: string;
  languageCode?: string;
}): TandemUser {
  const existing = users.get(input.telegramUserId);
  if (existing) {
    existing.lastSeenAt = new Date();
    if (input.telegramUsername) existing.telegramUsername = input.telegramUsername;
    if (input.firstName) existing.firstName = input.firstName;
    return existing;
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
  users.set(input.telegramUserId, user);
  return user;
}

export function getUser(telegramUserId: number): TandemUser | undefined {
  return users.get(telegramUserId);
}

export function userCount(): number {
  return users.size;
}
