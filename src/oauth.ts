/**
 * OAuth flows — "log in with provider" instead of pasting tokens.
 *
 * The bot stores a single-use state nonce, hands the user a link to
 * /api/oauth/start, which redirects to the provider's consent screen.
 * The provider calls back /api/oauth/callback with a code; we exchange
 * it for a token, validate it, encrypt it into the vault, and deep-link
 * the user back into Telegram.
 *
 * GitHub gets three options, in order of preference:
 *  1. GitHub App   — "install Tandem on your account" (app_install)
 *  2. GitHub OAuth — classic "Log in with GitHub" (oauth)
 *  3. PAT paste    — fallback (handled by the bot's token intake)
 */

import { config, oauthEnabled } from "./config.js";
import { pfetch } from "./providers/http.js";

export type OAuthProvider = "github" | "github_app" | "vercel" | "cloudflare";

export function callbackUrl(): string {
  return `${config.publicBaseUrl}/api/oauth/callback`;
}

/** Where /api/oauth/start should send the user. */
export function buildAuthorizeUrl(provider: OAuthProvider, state: string): string {
  const cb = encodeURIComponent(callbackUrl());
  switch (provider) {
    case "github":
      return (
        `https://github.com/login/oauth/authorize` +
        `?client_id=${encodeURIComponent(config.oauth.github.clientId)}` +
        `&redirect_uri=${cb}` +
        `&scope=${encodeURIComponent("repo workflow read:org user")}` +
        `&state=${encodeURIComponent(state)}`
      );
    case "github_app":
      // GitHub preserves ?state through the install flow to the Setup URL.
      return `https://github.com/apps/${config.oauth.githubApp.slug}/installations/new?state=${encodeURIComponent(state)}`;
    case "vercel":
      return (
        `https://vercel.com/oauth/authorize` +
        `?client_id=${encodeURIComponent(config.oauth.vercel.clientId)}` +
        `&redirect_uri=${cb}` +
        `&state=${encodeURIComponent(state)}`
      );
    case "cloudflare":
      return (
        `https://dash.cloudflare.com/oauth2/auth` +
        `?client_id=${encodeURIComponent(config.oauth.cloudflare.clientId)}` +
        `&redirect_uri=${cb}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent("user:read zone:read zone:write")}` +
        `&state=${encodeURIComponent(state)}`
      );
    default:
      throw new Error(`Unknown OAuth provider "${provider}"`);
  }
}

export interface ExchangedToken {
  token: string;
  authType: "oauth" | "app_install";
}

/**
 * Exchange an authorization code (and, for GitHub App installs, the
 * installation id) for a storable credential.
 */
export async function exchangeCode(
  provider: OAuthProvider,
  params: { code?: string; installationId?: string }
): Promise<ExchangedToken> {
  switch (provider) {
    case "github": {
      const data = await pfetch("https://github.com/login/oauth/access_token", null, {
        method: "POST",
        form: {
          client_id: config.oauth.github.clientId,
          client_secret: config.oauth.github.clientSecret,
          code: params.code ?? "",
        },
        headers: { Accept: "application/json" },
      });
      if (!data.access_token) throw new Error(data.error_description || data.error || "GitHub gave no token.");
      return { token: data.access_token, authType: "oauth" };
    }
    case "github_app": {
      const installationId = Number(params.installationId);
      if (!Number.isFinite(installationId)) throw new Error("GitHub did not send an installation id.");
      // Optional user token if the app requests user authorization during install.
      let userToken: string | undefined;
      if (params.code) {
        try {
          const data = await pfetch("https://github.com/login/oauth/access_token", null, {
            method: "POST",
            form: {
              client_id: config.oauth.githubApp.clientId || config.oauth.github.clientId,
              client_secret: config.oauth.githubApp.clientSecret || config.oauth.github.clientSecret,
              code: params.code ?? "",
            },
            headers: { Accept: "application/json" },
          });
          userToken = data.access_token ?? undefined;
        } catch {
          /* user token is optional for installation-based access */
        }
      }
      return {
        token: JSON.stringify({ installationId, ...(userToken ? { userToken } : {}) }),
        authType: "app_install",
      };
    }
    case "vercel": {
      const data = await pfetch("https://api.vercel.com/v2/oauth/access_token", null, {
        method: "POST",
        form: {
          client_id: config.oauth.vercel.clientId,
          client_secret: config.oauth.vercel.clientSecret,
          code: params.code ?? "",
          redirect_uri: callbackUrl(),
        },
      });
      if (!data.access_token) throw new Error(data.error_description || "Vercel gave no token.");
      return { token: data.access_token, authType: "oauth" };
    }
    case "cloudflare": {
      const data = await pfetch("https://dash.cloudflare.com/oauth2/token", null, {
        method: "POST",
        form: {
          client_id: config.oauth.cloudflare.clientId,
          client_secret: config.oauth.cloudflare.clientSecret,
          code: params.code ?? "",
          redirect_uri: callbackUrl(),
          grant_type: "authorization_code",
        },
      });
      if (!data.access_token) throw new Error(data.error_description || "Cloudflare gave no token.");
      return { token: data.access_token, authType: "oauth" };
    }
    default:
      throw new Error(`Unknown OAuth provider "${provider}"`);
  }
}

/** Which connect options are actually configured right now. */
export function connectOptions(): { provider: OAuthProvider; label: string; kind: "install" | "login" }[] {
  const out: { provider: OAuthProvider; label: string; kind: "install" | "login" }[] = [];
  if (oauthEnabled("github_app"))
    out.push({ provider: "github_app", label: "🐙 Install GitHub App", kind: "install" });
  if (oauthEnabled("github"))
    out.push({ provider: "github", label: "🐙 Log in with GitHub", kind: "login" });
  if (oauthEnabled("vercel"))
    out.push({ provider: "vercel", label: "▲ Log in with Vercel", kind: "login" });
  if (oauthEnabled("cloudflare"))
    out.push({ provider: "cloudflare", label: "☁️ Log in with Cloudflare", kind: "login" });
  return out;
}

/** Normalized provider key for storage ("github_app" connections live under "github"). */
export function storageProvider(provider: OAuthProvider): string {
  return provider === "github_app" ? "github" : provider;
}
