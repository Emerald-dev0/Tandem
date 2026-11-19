# Tandem — Setup Guide

Welcome! This guide walks you through getting Tandem running, step by step.
No prior bot experience needed. Total time: ~10 minutes.

> **Do we have to host Tandem on Render?**
> **No.** Render is one of the four services Tandem *manages for its users*
> (GitHub, Vercel, Cloudflare, Render). Tandem itself can run anywhere:
> your laptop, Railway, Fly.io, a VPS, Vercel (webhook mode), etc.
> This guide recommends **Railway** or **Fly.io** for production because
> they're cheap and always-on — but you can start on your own laptop for free.

> **No card? No local setup?** Perfect — use **Option 1 (Vercel)** or
> **Option 2 (Render)** below. Both deploy straight from GitHub, need no
> credit card, and you never touch a terminal. Oracle Cloud (Option 4)
> needs a card for verification, so skip it for now.

---

## What we're building (roadmap)

| Phase | What | Status |
|---|---|---|
| 1 | Telegram foundation — bot, /start, /help, menus, accounts | ✅ **You are here** |
| 2 | Integration framework — secure connections, encrypted credentials | Next |
| 3 | GitHub — repos, files, branches, PRs | |
| 4 | Vercel — projects, deployments, domains | |
| 5 | Cloudflare — zones, DNS | |
| 6 | Render — services, deployments | |
| 7 | Natural language — "create a repo called X" | |
| 8 | Workflow orchestration — multi-step tasks | |
| 9 | Monitoring & notifications | |
| 10 | Production hardening | |

---

## Step 1 — Create your Telegram bot (2 minutes)

1. Open Telegram and search for **@BotFather** (the official bot creator).
2. Send `/newbot`.
3. BotFather asks for a **name** — e.g. `Tandem`.
4. Then a **username** — must end in `bot`, e.g. `tandem_devops_bot`.
5. BotFather replies with a **token** that looks like:
   `123456789:AAE...xyz...`
6. **Copy that token and keep it secret.** It's the password to your bot.
   Never share it or commit it to GitHub.

> Optional: send `/setdescription` and `/setabouttext` to BotFather to
> describe Tandem, and `/setuserpic` to add a profile picture.

## Step 2 — Run Tandem on your laptop (3 minutes)

You need [Node.js 18+](https://nodejs.org) installed. Then:

```bash
cd Tandem
npm install
cp .env.example .env
```

Open `.env` in any text editor and paste your token:

```
BOT_TOKEN=123456789:AAE...xyz...
BOT_MODE=polling
```

Start the bot:

```bash
npm run dev
```

You should see:

```
🤖 Tandem is live (polling mode)
   Open Telegram and send /start to your bot.
```

## Step 3 — Talk to your bot 🎉

1. Open Telegram and search for your bot's username (e.g. `@tandem_devops_bot`).
2. Send `/start`.
3. You should get the welcome message with buttons:
   **Get started · Connect a service · View commands · Help**
4. Try the menu buttons at the bottom: **Create, GitHub, Deployments,
   Infrastructure, Activity, Settings**.
5. Try `/help`, `/status`, `/profile`, `/connect`.

Everything works — the provider features (creating repos, deploying, DNS)
are stubs for now and will light up phase by phase. That's intentional:
we build the foundation first, then plug in real integrations.

> **Keep the terminal running** while you test. Press `Ctrl+C` to stop the bot.
> In polling mode the bot must be running to receive messages.

## Step 4 — Put it online 24/7 (pick one — no card, no local needed)

> **No card right now?** Use **Option 1 (Vercel)** or **Option 2 (Render)**.
> Both are free, need no credit card, and deploy straight from GitHub —
> you never install anything or open a terminal. Oracle (Option 4) needs a
> card for verification, so leave it for later.

### Free-plan comparison (checked Nov 2026)

| Host | Card needed? | Free plan | Always-on? | Local setup? |
|---|---|---|---|---|
| **Vercel** ⭐ | ❌ No | Free serverless functions | ⚠️ Wakes on message (webhook) | ❌ None — GitHub deploy |
| **Render** ⭐ | ❌ No | Free web service (512 MB) | ❌ Sleeps after 15 min idle | ❌ None — GitHub deploy |
| **Railway** | ❌ Trial: no card | 30-day trial ($5 credit), then $1/mo | ✅ During trial | ❌ None — GitHub deploy |
| **Your laptop** | ❌ No | $0 forever | ❌ Only while it's on | ✅ Yes (Node.js) |
| **Oracle Cloud** | ✅ Yes (verification) | $0 forever, never sleeps | ✅ Yes | ✅ Yes (SSH) |
| **Fly.io** | ✅ Yes | Small free allowances | ✅ Yes | ✅ Yes (CLI) |

**My recommendation for you (no card, no local):**
1. **Start with Vercel (Option 1)** — you already have it connected, it's free
   forever, and it wakes instantly when you message the bot.
2. **Backup: Render (Option 2)** — also free with no card, if Vercel gives
   you any trouble.

---

### Option 1 — Vercel ⭐ (recommended: no card, no local, free forever)

Tandem runs as a Vercel serverless function (`api/telegram.js`). Telegram
pushes messages to it via webhook — it wakes up, replies, then sleeps.
You never run anything on your computer.

**Prerequisites:** this repo pushed to GitHub + your `BOT_TOKEN` from
@BotFather (Step 1). That's it.

1. Go to **[vercel.com](https://vercel.com)** and sign in (you can use GitHub).
2. Click **Add New → Project**.
3. **Import** this GitHub repo (`Tandem`).
4. Vercel auto-detects the settings (from `vercel.json`):
   - Framework: **Other**
   - Build Command: `npm run build` ✅ (already set)
   - Install Command: `npm install` ✅
5. Click **Environment Variables** and add:
   - `BOT_TOKEN` = your token from @BotFather
   - `BOT_MODE` = `webhook`
   - *(Leave `WEBHOOK_URL` empty — Vercel fills it in automatically.)*
6. Click **Deploy**. Wait ~1 minute. Vercel gives you a URL like
   `https://tandem-xyz.vercel.app`.
7. **Verify:** open that URL in your browser — you should see
   `{"ok": true, "service": "Tandem", ...}`. That means it's alive! ✅
8. **Test the bot:** open Telegram, find your bot, send `/start`.
   The first message may take 2–3 seconds (cold start) — after that it's fast.

> **How it works:** On first deploy, Tandem automatically tells Telegram
> "send all messages to `https://your-app.vercel.app/api/telegram`".
> No manual webhook setup needed.

**Updating later:** push code to GitHub → Vercel auto-deploys. Done.

---

### Option 2 — Render (no card, no local, free tier sleeps)

Render runs Tandem as a normal web service. Free tier sleeps after 15 min
idle, so use **webhook mode** (Telegram wakes it on each message).

1. Go to **[render.com](https://render.com)** and sign up (no card for free tier).
2. **New → Web Service** → connect this GitHub repo.
3. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Environment variables:
   - `BOT_TOKEN` = your token
   - `BOT_MODE` = `webhook`
   - `WEBHOOK_URL` = your Render URL (e.g. `https://tandem.onrender.com`)
     — Render shows this after you create the service; add it, then **Manual Deploy → Redeploy**.
5. Click **Create Web Service**. Wait ~2 minutes.
6. Test: open your Render URL in a browser (should load), then send `/start`
   to your bot in Telegram. First message may take ~50 seconds (free tier
   cold start) — that's normal on the free plan.

---

### Option 3 — Railway (no card for 30-day trial, no local)

1. Go to **[railway.app](https://railway.app)** and sign up — no card needed for the trial.
2. **New Project → Deploy from GitHub repo** → select this repo.
3. Add environment variable `BOT_TOKEN` = your token.
4. Railway detects `npm start` and runs the bot. Done.
5. Keep `BOT_MODE=polling` — Railway keeps the process alive, so polling works.
6. After the 30-day trial, the free plan is $1/mo. For a proper always-on
   bot, Hobby is $5/mo (includes $5 of usage).

### Option 4 — Oracle Cloud Always Free 🏆 (needs a card — do this later)

Best permanent free 24/7 server, but Oracle requires a credit/debit card
for verification. When you have a card ready:

Full walkthrough: **[ORACLE_SETUP.md](./ORACLE_SETUP.md)** — sign up, pick a
region, create the free server, connect via SSH, and run Tandem with PM2.
~30–45 minutes, $0 forever.

### Option 5 — Your laptop (free, but you said no local — skip for now)

```bash
npm install
cp .env.example .env   # paste BOT_TOKEN
npm run dev
```

### Option 6 — Fly.io (needs a card + CLI — skip for now)

```bash
npm install -g flyctl
fly launch
fly secrets set BOT_TOKEN=your_token
fly deploy
```

---

## Step 5 — What's next?

Once your bot replies to `/start`, tell me and we'll move to **Phase 2**:
the integration framework — how Tandem securely connects to GitHub, Vercel,
Cloudflare and Render with encrypted, scoped credentials. Then GitHub (Phase 3)
so you can actually create your first repository from Telegram.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `BOT_TOKEN is not set` | Create `.env` from `.env.example` and paste your token |
| Bot doesn't reply | Is `npm run dev` still running? Did you message the right bot? |
| `401 Unauthorized` | Token was copied wrong — regenerate one via BotFather `/revoke` |
| Bot replies twice | Another copy of the bot is running somewhere — stop it |
| `npm: command not found` | Install Node.js 18+ from nodejs.org |
