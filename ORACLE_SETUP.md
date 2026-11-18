# Tandem on Oracle Cloud Always Free — Full Setup Guide

Get a **permanent, free, 24/7 server** for Tandem. No monthly bill, no sleeping.

> **What you get free forever:** up to 4 ARM CPUs + 24 GB RAM (or 2 AMD VMs with 1 GB each), 200 GB storage, 10 TB/month data transfer. That's more than enough for Tandem — a Telegram bot uses less than 200 MB RAM.

**Time needed:** ~30–45 minutes (mostly waiting for Oracle to verify your account).
**Cost:** $0. You need a credit/debit card for verification, but you won't be charged if you stay within the free limits.

---

## Before you start — 3 things to know

1. **Your "Home Region" is permanent.** When you sign up, Oracle asks you to pick a data-center region. You can never change it later. Choose carefully (Step 2).
2. **You need a Visa/Mastercard** for identity verification. Oracle places a tiny temporary hold (usually ~$1) to verify it's real, then releases it. Nigerian bank cards sometimes fail Oracle's check — if yours fails, try a different card or ask a friend abroad to help verify. You will NOT be charged for the free tier.
3. **"Out of capacity" is normal.** Oracle's free ARM servers are popular. If you see that error, don't panic — Step 4 shows 4 fixes.

---

## Step 1 — Create your Oracle Cloud account

1. Go to **[oracle.com/cloud/free](https://www.oracle.com/cloud/free/)**
2. Click **Start for free**
3. Fill in:
   - **First name / Last name** — your real name (must match your card)
   - **Email** — a real email you can access (Oracle sends a verification code)
   - **Password** — pick a strong one, save it somewhere safe
   - **Cloud Account Name (OCID)** — this becomes part of your login. Use something like `tandem-yourname` (lowercase, no spaces)
4. Click **Verify email** and enter the code Oracle emails you.
5. Enter your **phone number** and verify the SMS code.
6. Enter your **card details** for verification (not charged).
7. Click **Start my free account** and wait. Oracle usually activates in 5–30 minutes. You'll get an email when it's ready.

> ⚠️ **Use a real email and real card.** Fake details = account rejected, and Oracle may block you from signing up again.

---

## Step 2 — Pick your Home Region (IMPORTANT — can't change later)

During signup, Oracle asks for your **Home Region**. This is where your server lives.

**For you in Lagos, Nigeria, pick in this order:**

| Priority | Region | Why |
|---|---|---|
| 🥇 1st choice | **South Africa (Johannesburg)** — `af-johannesburg-1` | Closest to Lagos = fastest bot replies |
| 🥈 2nd choice | **Germany (Frankfurt)** — `eu-frankfurt-1` | Very reliable, good capacity |
| 🥉 3rd choice | **UK (London)** — `uk-london-1` | Also reliable |
| 4th choice | **US (Phoenix)** — `us-phoenix-1` | Most free capacity, but farther away |

**My advice:** Try **Johannesburg** first. If ARM servers there are always "out of capacity", you can still create the server in Frankfurt/Phoenix later (Step 4) — your home region only locks your account settings, not where every server must live.

Pick one, click **Next**, finish signup.

---

## Step 3 — Log in to the Oracle Console

1. Go to **[cloud.oracle.com](https://cloud.oracle.com)** and sign in with your Cloud Account Name + email + password.
2. You'll land on the **Oracle Cloud Console** — this is your control panel.
3. Top-right corner: make sure the region shown matches your home region (or switch it later if needed).

---

## Step 4 — Create your free server (VM)

1. Top-left **☰ menu** → **Compute** → **Instances**
2. Click **Create instance**
3. Fill in:

| Field | What to enter |
|---|---|
| **Name** | `tandem-bot` |
| **Image** | Click **Change image** → **Canonical Ubuntu** → **Ubuntu 24.04 ARM** (or 22.04 ARM) |
| **Shape** | Click **Change shape** → **Ampere** → tick **VM.Standard.A1.Flex** |
| **OCPUs** | **1** (enough for Tandem; you can use up to 4 total) |
| **Memory** | **6 GB** (enough for Tandem + future PostgreSQL) |
| **Boot volume** | Leave default (~50 GB) |
| **Networking** | Leave defaults — make sure **Assign a public IPv4 address** is ON |
| **SSH key** | See Step 5 below — paste your public key here |

4. Click **Create**. Wait 1–2 minutes until status shows **Running**.
5. Note your server's **Public IP address** — you'll need it in Step 6. (Click the instance name to see it.)

> 💡 **Why 1 OCPU / 6 GB and not the max 4 / 24?** Smaller servers are much more likely to get capacity. Tandem only needs ~200 MB RAM. You can always resize later.

### If you see "Out of capacity" — try these 4 fixes (in order)

1. **Try a different Availability Domain:** On the create page, scroll to Availability Domain and switch from AD-1 → AD-2 → AD-3.
2. **Try a smaller shape:** 1 OCPU / 6 GB instead of 2 / 12.
3. **Upgrade to Pay-As-You-Go (still free):** Console → **Billing** → **Upgrade to Pay As You Go**. This sounds scary but you keep your free limits — Oracle just gives your requests priority. As long as you stay within Always Free limits, your bill stays $0. This fixes "out of capacity" for most people.
4. **Try the AMD shape as a fallback:** Change shape → **AMD** → **VM.Standard.E2.1.Micro** (1 GB RAM). Less powerful, but often available when ARM is full. Tandem runs fine on it.
5. **Wait and retry:** Capacity comes and goes. Try again in a few hours, or try creating the instance in a different region (top-right region switcher → Frankfurt or Phoenix).

---

## Step 5 — Create your SSH key (your server's "password")

SSH keys are how you log in securely. You only do this once.

**On Mac or Linux:**
```bash
ssh-keygen -t ed25519 -C "tandem-oracle" -f ~/.ssh/tandem_oracle
```
Press Enter twice (no password). This creates two files:
- `~/.ssh/tandem_oracle` — your **private** key (keep secret!)
- `~/.ssh/tandem_oracle.pub` — your **public** key (paste this into Oracle)

Show the public key:
```bash
cat ~/.ssh/tandem_oracle.pub
```
Copy the whole line (starts with `ssh-ed25519 ...`) and paste it into the **SSH key** field in Step 4.

**On Windows:** Open **PowerShell** and run the same `ssh-keygen` command. Windows 10/11 includes OpenSSH. Then use **Windows Terminal** or **PowerShell** for Step 6.

> ⚠️ **Never share your private key** (`tandem_oracle` without `.pub`). It's the only way into your server.

---

## Step 6 — Connect to your server

Open your terminal (Mac/Linux Terminal, or Windows Terminal/PowerShell) and run:

```bash
ssh -i ~/.ssh/tandem_oracle ubuntu@YOUR_SERVER_IP
```

Replace `YOUR_SERVER_IP` with the public IP from Step 4. Example:

```bash
ssh -i ~/.ssh/tandem_oracle ubuntu@129.151.100.50
```

First time? It asks `Are you sure you want to continue connecting?` → type `yes` and press Enter.

You should now see a prompt like `ubuntu@tandem-bot:~$`. You're in! 🎉

> **Windows note:** If you're on Windows, the key path looks like `C:\Users\YourName\.ssh\tandem_oracle`. In PowerShell: `ssh -i $env:USERPROFILE\.ssh\tandem_oracle ubuntu@YOUR_IP`

---

## Step 7 — Install Tandem on the server

Run these commands **one block at a time** on your server (copy-paste each block, press Enter, wait for it to finish):

**1. Update the server and install tools:**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl
```

**2. Install Node.js 20:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should show v20.x
```

**3. Install PM2** (keeps Tandem running 24/7 and restarts it if it crashes):
```bash
sudo npm install -g pm2
```

**4. Download Tandem:**
```bash
git clone https://github.com/Emerald-dev0/Tandem.git
cd Tandem
npm install
npm run build
```

**5. Add your bot token:**
```bash
cp .env.example .env
nano .env
```
In nano: find `BOT_TOKEN=` and paste your token after it. Make sure `BOT_MODE=polling`.
Press `Ctrl+O`, Enter, then `Ctrl+X` to save and exit.

**6. Start Tandem:**
```bash
pm2 start dist/index.js --name tandem
pm2 save
pm2 startup
```
(Follow the `pm2 startup` instructions — it prints a command to run. This makes Tandem auto-start if the server reboots.)

**7. Check it's running:**
```bash
pm2 status
pm2 logs tandem
```
You should see `🤖 Tandem is live (polling mode)`.

---

## Step 8 — Test it! 🎉

1. Open Telegram on your phone.
2. Find your bot and send `/start`.
3. You should get the welcome message — **from your Oracle server!**
4. Try `/help` and `/status`.

If it replies, you're done. Your bot is now online 24/7 for $0.

> **Good news:** Because Tandem uses *polling* mode, you don't need to open any firewall ports or buy a domain. Telegram connects *out* to your server. Simple!

---

## Useful commands (bookmark these)

| What | Command |
|---|---|
| See if Tandem is running | `pm2 status` |
| See live logs | `pm2 logs tandem` |
| Restart Tandem | `pm2 restart tandem` |
| Stop Tandem | `pm2 stop tandem` |
| Update Tandem after code changes | `cd Tandem && git pull && npm install && npm run build && pm2 restart tandem` |
| Disconnect from server | Type `exit` |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Out of capacity" when creating server | See the 4 fixes in Step 4 (try AD-2, smaller shape, PAYG upgrade, or AMD shape) |
| `Permission denied (publickey)` on SSH | Wrong key or wrong username. Use `ubuntu@` for Ubuntu images, and `-i` pointing to your **private** key |
| `Connection timed out` on SSH | Check the server is **Running** in the Console. Wait 2 minutes after creating it |
| Bot doesn't reply | SSH in and run `pm2 logs tandem` — check for errors. Usually a wrong/missing `BOT_TOKEN` in `.env` |
| Bot replies twice | Two copies running. Run `pm2 status` — there should be only one `tandem` |
| Server rebooted, bot offline | `pm2 startup` + `pm2 save` (Step 7) makes it auto-start. Check with `pm2 status` after SSHing in |
| Card verification failed | Try a different Visa/Mastercard. Nigerian bank cards often fail — a foreign card or a friend's card can verify the account |

---

## What happens next?

Your bot is live on a free server. When you're ready, tell me and we'll move to **Phase 2** (secure integration connections) and **Phase 3** (GitHub — creating real repositories from Telegram). Updating the bot later is just:

```bash
ssh -i ~/.ssh/tandem_oracle ubuntu@YOUR_IP
cd Tandem && git pull && npm install && npm run build && pm2 restart tandem
```

**Tandem — Your entire stack. One conversation.** 🚀
