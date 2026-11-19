/**
 * Shared HTTP plumbing for provider API calls: timeouts, auth headers,
 * and friendly error mapping (401 → "reconnect", 403 → "scopes", …).
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
    public hint?: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

interface FetchOpts {
  method?: string;
  body?: unknown;
  /** Send as application/x-www-form-urlencoded (OAuth token endpoints per RFC 6749). */
  form?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** When true, return the raw Response instead of parsed JSON. */
  raw?: boolean;
}

export async function pfetch(url: string, token: string | null, opts: FetchOpts = {}): Promise<any> {
  const { method = "GET", body, form, headers = {}, timeoutMs = 20000, raw = false } = opts;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        "User-Agent": "Tandem-Bot",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(form !== undefined ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body:
        body !== undefined
          ? JSON.stringify(body)
          : form !== undefined
            ? new URLSearchParams(form).toString()
            : undefined,
    });
  } catch (err) {
    throw new ProviderError(`Network error talking to the provider: ${(err as Error).message}`);
  }

  if (raw) return res;

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text.slice(0, 200) };
  }

  if (!res.ok) throw mapError(res.status, data, url);
  return data;
}

export function mapError(status: number, data: any, url: string): ProviderError {
  const apiMsg =
    data?.message || data?.error?.message || data?.errors?.[0]?.message || data?.error || "";
  const provider = new URL(url).hostname;
  switch (status) {
    case 400:
      return new ProviderError(`The provider rejected the request (400). ${apiMsg}`.trim(), 400);
    case 401:
      return new ProviderError(
        "Your credentials were rejected (401) — they may have expired.",
        401,
        "Run /disconnect then /connect for this provider to refresh the connection."
      );
    case 403:
      return new ProviderError(
        `No permission for that (403). ${apiMsg}`.trim(),
        403,
        "Your token may be missing a scope — check /connections for what Tandem needs."
      );
    case 404:
      return new ProviderError(`Not found (404) on ${provider} — check the name/owner.`, 404);
    case 409:
      return new ProviderError(`Conflict (409): ${apiMsg || "it already exists?"}`, 409);
    case 422:
      return new ProviderError(`Invalid input (422): ${apiMsg}`, 422);
    case 429:
      return new ProviderError("Rate limited by the provider (429) — give it a minute.", 429);
    default:
      return new ProviderError(
        `Provider error (${status}) on ${provider}${apiMsg ? `: ${apiMsg}` : ""}`,
        status
      );
  }
}

/** owner/name parsing for GitHub-style refs. */
export function parseRepo(full: string): { owner: string; repo: string } | null {
  const m = full.trim().match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}
