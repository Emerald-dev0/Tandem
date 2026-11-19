# Tandem — Security Model

## Credential handling

- **Encryption at rest.** Every provider token is encrypted with AES-256-GCM
  (`ENCRYPTION_KEY`, 32 random bytes) before it touches storage. Decryption
  happens only inside a provider call, in memory, for the duration of that call.
- **Never echoed.** Tokens are never written back to chat. The bot actively
  detects accidental secret pastes (`looksSecret`) and warns instead of
  processing them. When you connect via token paste, the bot tries to delete
  your message immediately.
- **Token messages.** If deletion fails (e.g. privacy-mode edge cases), the bot
  reminds you to delete the message yourself.
- **Revoke any time.** `/disconnect <provider>` deletes the encrypted record.
  Rotating the token at the provider is also safe — the bot validates before use.

## OAuth / least privilege

- Preferred connect path is a real OAuth / GitHub-App login flow, so Tandem only
  receives the scopes it needs (see `/permissions`):
  - GitHub: `repo workflow read:org user` (or an installation limited to chosen repos)
  - Vercel: deployments/projects read+write, env read+write
  - Cloudflare: `user:read zone:read zone:write`
  - Render: API key scoped to your account
- OAuth state is a **single-use nonce** with a 15-minute TTL, stored server-side
  and deleted on first use — no CSRF, no replay.
- PATs remain supported as an explicit fallback, stored under the same
  encryption as OAuth tokens.

## Transport & endpoints

- Everything runs over HTTPS on Vercel; the bot webhook accepts only Telegram
  deliveries (optionally verified with `TELEGRAM_WEBHOOK_SECRET`).
- `/api/webhooks/github` verifies `X-Hub-Signature-256` (HMAC-SHA256) when
  `GITHUB_WEBHOOK_SECRET` is set — unsigned/invalid deliveries are rejected.
- `/api/cron/digest` requires `Authorization: Bearer ${CRON_SECRET}`.

## Destructive operations

- Deleting env vars, deleting DNS records, purging caches and restarting
  services all require an explicit inline-button confirmation. Plain-text
  commands never execute destructive actions silently.
- Rate limits: 15 messages / 10 s per user, 45 provider calls / min,
  6 heavy operations / min.

## Trust boundaries

- The bot never sends messages to anyone who didn't message it first, except
  webhook-triggered alerts and the daily digest — both user-toggleable
  (`/notifications`, `/digest`).
- Optional `OWNER_TELEGRAM_USERNAME` makes the instance single-operator.
- Secrets and `.env` are gitignored; rotate `ENCRYPTION_KEY` and all tokens if
  they ever leak (the vault is useless without `ENCRYPTION_KEY`, so store that
  one in Vercel only).

## Reporting

Found a security issue? Open a GitHub issue on this repository (or contact the
maintainer directly) — please don't post exploit details publicly.
