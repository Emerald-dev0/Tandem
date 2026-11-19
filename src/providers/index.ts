/**
 * Provider registry — one place that knows every service Tandem talks to.
 *
 * Each provider module (github/vercel/cloudflare/render) implements its
 * API operations as plain async functions. This registry holds identity
 * metadata + token validation dispatch used by the connect flows.
 */

import { pfetch, ProviderError } from "./http.js";
import { validateGithub, githubAccessToken } from "./github.js";
import { validateVercel } from "./vercel.js";
import { validateCloudflare } from "./cloudflare.js";
import { validateRender } from "./render.js";

export interface ProviderDef {
  name: string;
  displayName: string;
  icon: string;
  /** How this provider prefers to connect. */
  connectKind: "oauth" | "key";
  /** What the user should create and paste as a token (fallback path). */
  tokenHelp: string;
  /** Short scope guidance shown in /connections. */
  scopesHint: string;
}

export const PROVIDER_LIST: ProviderDef[] = [
  {
    name: "github",
    displayName: "GitHub",
    icon: "🐙",
    connectKind: "oauth",
    tokenHelp:
      "Create a Personal Access Token at github.com → Settings → Developer settings → Personal access tokens (classic). Give it repo + workflow + read:org scopes.",
    scopesHint: "repo, workflow, read:org (or install the Tandem GitHub App)",
  },
  {
    name: "vercel",
    displayName: "Vercel",
    icon: "▲",
    connectKind: "oauth",
    tokenHelp: "Create a token at vercel.com → Account Settings → Tokens.",
    scopesHint: "full account access (OAuth) or a token with project scope",
  },
  {
    name: "cloudflare",
    displayName: "Cloudflare",
    icon: "☁️",
    connectKind: "oauth",
    tokenHelp:
      "Create an API token at dash.cloudflare.com → Profile → API Tokens. Grant Zone:Read + DNS:Edit for your zones.",
    scopesHint: "Zone:Read, DNS:Edit (OAuth grants these at login)",
  },
  {
    name: "render",
    displayName: "Render",
    icon: "🟣",
    connectKind: "key",
    tokenHelp: "Create an API key at dashboard.render.com → Account Settings → API Keys.",
    scopesHint: "full access key",
  },
];

export const PROVIDERS = PROVIDER_LIST.map((p) => p.name);

export function providerDef(name: string): ProviderDef | undefined {
  return PROVIDER_LIST.find((p) => p.name === name.toLowerCase());
}

export interface ValidationResult {
  ok: boolean;
  /** Who the token belongs to — e.g. "@octocat" or "you@example.com". */
  identity?: string;
  error?: string;
}

/**
 * Verify a token against the provider's own API and learn whose it is.
 * `token` may be a plain PAT/key; for GitHub it can also be the JSON blob
 * an app_install connection stores (handled inside github.ts).
 */
export async function validateToken(provider: string, token: string): Promise<ValidationResult> {
  const clean = token.trim();
  if (clean.length < 8) return { ok: false, error: "That token looks too short — check you copied the whole thing." };
  try {
    switch (provider) {
      case "github":
      case "github_app":
        return await validateGithub(clean);
      case "vercel":
        return await validateVercel(clean);
      case "cloudflare":
        return await validateCloudflare(clean);
      case "render":
        return await validateRender(clean);
      default:
        return { ok: false, error: `Unknown provider "${provider}".` };
    }
  } catch (err) {
    if (err instanceof ProviderError) return { ok: false, error: err.message };
    return { ok: false, error: `Couldn't reach ${provider} to verify: ${(err as Error).message}` };
  }
}

export { githubAccessToken, ProviderError, pfetch };
