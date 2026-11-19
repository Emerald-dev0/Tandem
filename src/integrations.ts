/**
 * Provider registry — one place that knows every service Tandem talks to.
 *
 * Phase 2 gives each provider: identity, icon, and a token validator that
 * hits the provider's own API to confirm the token works and learn which
 * account it belongs to. Phases 3–6 add real operations on top of this.
 */

export interface ProviderDef {
  name: string;
  displayName: string;
  icon: string;
  /** What the user should create and paste as a token. */
  tokenHelp: string;
}

export const PROVIDER_LIST: ProviderDef[] = [
  {
    name: "github",
    displayName: "GitHub",
    icon: "🐙",
    tokenHelp:
      "Create a Personal Access Token at github.com → Settings → Developer settings → Personal access tokens. Give it repo + workflow scopes.",
  },
  {
    name: "vercel",
    displayName: "Vercel",
    icon: "▲",
    tokenHelp: "Create a token at vercel.com → Account Settings → Tokens.",
  },
  {
    name: "cloudflare",
    displayName: "Cloudflare",
    icon: "☁️",
    tokenHelp:
      "Create an API token at dash.cloudflare.com → Profile → API Tokens. Grant Zone:Read + DNS:Edit for your zones.",
  },
  {
    name: "render",
    displayName: "Render",
    icon: "🟣",
    tokenHelp: "Create an API key at dashboard.render.com → Account Settings → API Keys.",
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

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export async function validateToken(provider: string, token: string): Promise<ValidationResult> {
  const clean = token.trim();
  if (clean.length < 8) return { ok: false, error: "That token looks too short — check you copied the whole thing." };

  try {
    switch (provider) {
      case "github": {
        const { status, body } = await getJson("https://api.github.com/user", {
          Authorization: `Bearer ${clean}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "Tandem-Bot",
        });
        if (status === 401) return { ok: false, error: "GitHub rejected that token (401). Check it's valid and not expired." };
        if (status !== 200) return { ok: false, error: `GitHub returned ${status}. Try again in a moment.` };
        return { ok: true, identity: `@${body.login}` };
      }
      case "vercel": {
        const { status, body } = await getJson("https://api.vercel.com/v2/user", {
          Authorization: `Bearer ${clean}`,
        });
        if (status === 403 || status === 401)
          return { ok: false, error: "Vercel rejected that token. Check it hasn't expired." };
        if (status !== 200) return { ok: false, error: `Vercel returned ${status}. Try again in a moment.` };
        const u = body?.user ?? body;
        return { ok: true, identity: u?.username ? `@${u.username}` : (u?.email ?? "your Vercel account") };
      }
      case "cloudflare": {
        const { status, body } = await getJson("https://api.cloudflare.com/client/v4/user/tokens/verify", {
          Authorization: `Bearer ${clean}`,
          "Content-Type": "application/json",
        });
        if (!body?.success || body?.result?.status !== "active")
          return { ok: false, error: "Cloudflare says that token is not active. Check the token and its permissions." };
        // Identity is best-effort — /user needs User:Read which tokens may lack.
        const user = await getJson("https://api.cloudflare.com/client/v4/user", {
          Authorization: `Bearer ${clean}`,
          "Content-Type": "application/json",
        }).catch(() => null);
        const email = user?.body?.result?.email;
        return { ok: true, identity: email ?? "active Cloudflare token" };
      }
      case "render": {
        const { status, body } = await getJson("https://api.render.com/v1/owners", {
          Authorization: `Bearer ${clean}`,
          Accept: "application/json",
        });
        if (status === 401) return { ok: false, error: "Render rejected that API key. Check it and try again." };
        if (status !== 200) return { ok: false, error: `Render returned ${status}. Try again in a moment.` };
        const owner = body?.owners?.[0]?.owner ?? body?.[0]?.owner ?? {};
        return { ok: true, identity: owner.email ?? owner.name ?? "your Render account" };
      }
      default:
        return { ok: false, error: `Unknown provider "${provider}".` };
    }
  } catch (err) {
    return { ok: false, error: `Couldn't reach ${provider} to verify: ${(err as Error).message}` };
  }
}
