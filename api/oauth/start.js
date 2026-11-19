/**
 * OAuth entry point — GET /api/oauth/start?provider=github&state=abc123
 *
 * Validates the state nonce the bot created, then 302s to the provider's
 * consent screen (or the GitHub App install page).
 */

import { buildAuthorizeUrl } from "../_lib/oauth.js";
import { consumeOAuthState, saveOAuthState } from "../_lib/store.js";

const VALID = new Set(["github", "github_app", "vercel", "cloudflare"]);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  try {
    const provider = String(req.query?.provider ?? "");
    const state = String(req.query?.state ?? "");
    if (!VALID.has(provider) || !state) {
      return res.status(400).send(html("Missing or unknown provider"));
    }

    // Re-save to refresh TTL, but only if the nonce really exists (bot created it).
    const existing = await consumeOAuthState(state);
    if (!existing) {
      return res.status(400).send(html("This connect link expired or was already used. Send /connect again in Telegram."));
    }
    await saveOAuthState(state, existing.userId, existing.provider);

    const url = buildAuthorizeUrl(provider, state);
    res.writeHead(302, { Location: url });
    return res.end();
  } catch (err) {
    console.error("oauth start error:", err);
    return res.status(500).send(html(`Something went wrong: ${err.message ?? err}`));
  }
}

function html(msg) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tandem</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui;max-width:520px;margin:80px auto;padding:0 24px;text-align:center;color:#1a1a2e}</style>
</head><body><h1>🤖 Tandem</h1><p>${String(msg).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</p>
<p><a href="https://t.me">Back to Telegram</a></p></body></html>`;
}
