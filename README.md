# Tandem

**Your entire stack. One conversation.**

Tandem is a Telegram-native developer operations platform. Create repositories,
deploy applications, manage domains and infrastructure — all through natural
language and interactive Telegram commands, powered by real provider APIs
(GitHub, Vercel, Cloudflare, Render).

> Tandem is not a notification bot. It is not simply an AI assistant.
> It is an **execution platform**: you describe the outcome, Tandem plans the
> operations, executes them through authorized integrations, and reports what
> actually happened.

## Quick start

New here? Start with **[SETUP.md](./SETUP.md)** — a 10-minute walkthrough from
zero to a live bot.

```bash
npm install
cp .env.example .env   # paste your BOT_TOKEN from @BotFather
npm run dev
```

Then open Telegram, find your bot, and send `/start`.

## Where does Tandem run?

Anywhere — your laptop, Railway, Fly.io, a VPS, Vercel (webhook mode), or
Render. Render is one of the services Tandem *manages*, not a requirement for
hosting Tandem itself. See SETUP.md Step 4.

## Roadmap

- [x] **Phase 1** — Telegram foundation (bot, commands, menus, accounts)
- [ ] **Phase 2** — Integration framework (secure connections, encryption)
- [ ] **Phase 3** — GitHub (repos, files, branches, PRs)
- [ ] **Phase 4** — Vercel (projects, deployments, domains)
- [ ] **Phase 5** — Cloudflare (zones, DNS)
- [ ] **Phase 6** — Render (services, deployments)
- [ ] **Phase 7** — Natural-language intelligence
- [ ] **Phase 8** — Workflow orchestration
- [ ] **Phase 9** — Monitoring & intelligence
- [ ] **Phase 10** — Production hardening

## Tech stack

- **Runtime:** Node.js 18+ / TypeScript
- **Telegram:** Telegraf (Bot API)
- **Database:** PostgreSQL (Phase 1.5+)
- **Queue:** Redis + BullMQ (Phase 8+)
