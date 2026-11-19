/**
 * Phase 7 — deterministic natural-language understanding.
 *
 * Every recognized phrase maps to exactly one slash command with parsed
 * args. Nothing is guessed: strong regex matches win, weak keyword
 * matches only suggest, everything else falls through to the help hint.
 * This keeps execution deterministic (PRD requirement) while letting
 * users just talk.
 */

export interface NlpResult {
  /** Slash-command style name, e.g. "repos", "create_repo". */
  command: string;
  args: string[];
  confidence: "exact" | "likely";
  echo: string; // what we tell the user we understood
}

interface Rule {
  re: RegExp;
  build: (m: RegExpMatchArray) => NlpResult;
}

const RULES: Rule[] = [
  {
    re: /^(?:hey |hi |please |can you |could you )*(?:show|list|see|get|what(?:'s| is)|my)?\s*(?:all\s+)?(?:my\s+|git\s*hub\s+)?repos(?:itories)?\s*(?:page\s*(\d+))?$/i,
    build: (m) => ({ command: "repos", args: m[1] ? [m[1]] : [], confidence: "exact", echo: "list your repositories" }),
  },
  {
    re: /^(?:create|make|new|spin up)\s+(?:a\s+)?(private\s+|public\s+)?repo(?:sitory)?\s*(?:called|named)?\s*([\w./-]+)\s*(?:with description\s+(.+))?$/i,
    build: (m) => ({
      command: "create_repo",
      args: [m[2], (m[1] ?? "private").trim().toLowerCase(), m[3] ?? ""],
      confidence: "exact",
      echo: `create a ${(m[1] ?? "private").trim()} repo called ${m[2]}`,
    }),
  },
  {
    re: /^(?:deploy|ship|push)\s+(?:my\s+)?([\w./-]+)(?:\s+(?:to|on)\s+(vercel|render))?(?:\s+(?:from|branch)\s+([\w./-]+))?$/i,
    build: (m) => ({
      command: "deploy",
      args: [m[2] ? m[2].toLowerCase() : "vercel", m[1], m[3] ?? "main"],
      confidence: "exact",
      echo: `deploy ${m[1]} to ${m[2] ? m[2].toLowerCase() : "vercel"}`,
    }),
  },
  {
    re: /^(?:show|list|get)?\s*(?:recent\s+)?deployments?(?:\s+for\s+([\w./-]+))?(?:\s+on\s+(vercel|render))?$/i,
    build: (m) => ({
      command: "deployments",
      args: [m[2] ? m[2].toLowerCase() : "vercel", m[1] ?? ""],
      confidence: "exact",
      echo: `list deployments${m[1] ? ` for ${m[1]}` : ""}`,
    }),
  },
  {
    re: /^(?:show|list|get)?\s*projects?$/i,
    build: () => ({ command: "projects", args: [], confidence: "exact", echo: "list your projects" }),
  },
  {
    re: /^(?:show|list|get)?\s*zones?$/i,
    build: () => ({ command: "zones", args: [], confidence: "exact", echo: "list your Cloudflare zones" }),
  },
  {
    re: /^(?:show|list|get)?\s*(?:dns|records)(?:\s+(?:for|on)\s+([\w.-]+))?$/i,
    build: (m) => ({ command: "dns", args: m[1] ? [m[1]] : [], confidence: "exact", echo: `list DNS records${m[1] ? ` for ${m[1]}` : ""}` }),
  },
  {
    re: /^(?:add|create)\s+(?:dns\s+|a\s+)?(A|AAAA|CNAME|TXT|MX)\s+(?:record\s+)?([\w.-]+)\s+(?:to\s+|pointing to\s+|with\s+)?(\S+)\s*(?:on\s+([\w.-]+))?$/i,
    build: (m) => ({
      command: "dns-add",
      args: [m[4] ?? m[2].split(".").slice(-2).join("."), m[1].toUpperCase(), m[2], m[3]],
      confidence: "exact",
      echo: `add a ${m[1].toUpperCase()} record ${m[2]} → ${m[3]}`,
    }),
  },
  {
    re: /^(?:purge|clear|flush)\s*(?:the\s+)?(?:cache|cdn)?\s*(?:for\s+([\w.-]+))?$/i,
    build: (m) => ({
      command: "purge",
      args: m[1] ? [m[1]] : [],
      confidence: "exact",
      echo: `purge cache${m[1] ? ` for ${m[1]}` : ""}`,
    }),
  },
  {
    re: /^(?:show|list|get)?\s*(?:render\s+)?services?$/i,
    build: () => ({ command: "services", args: [], confidence: "exact", echo: "list your Render services" }),
  },
  {
    re: /^(?:restart|bounce|reboot)\s+(?:the\s+)?(?:service\s+)?([\w-]+)$/i,
    build: (m) => ({ command: "restart", args: [m[1]], confidence: "exact", echo: `restart service ${m[1]}` }),
  },
  {
    re: /^(?:what(?:'s| is)?\s+)?(?:the\s+)?(?:status|health)(?:\s+check)?$/i,
    build: () => ({ command: "status", args: [], confidence: "exact", echo: "show system status" }),
  },
  {
    re: /^(?:connect|link|auth(?:enticate)?)\s+(github|vercel|cloudflare|render)\s*$/i,
    build: (m) => ({ command: "connect", args: [m[1].toLowerCase()], confidence: "exact", echo: `connect ${m[1].toLowerCase()}` }),
  },
  {
    re: /^(?:what(?:'s| is)?\s+)?(?:my\s+)?(?:recent\s+)?activity(?:\s+in\s+the\s+last\s+(\d+)\s*(h|hours?|d|days?))?$/i,
    build: (m) => ({ command: "activity", args: [], confidence: "exact", echo: "show recent activity" }),
  },
  {
    re: /^(?:help|what can you do|commands?|how do i)$/i,
    build: () => ({ command: "help", args: [], confidence: "exact", echo: "show help" }),
  },
  {
    re: /^(?:create|make|new)\s+(?:a\s+)?(?:workflow\s+)?(?:called\s+)?ship[\s-]?it\s*(?:for\s+)?([\w-]+)?\s*$/i,
    build: (m) => ({ command: "run", args: ["ship-it", ...(m[1] ? [m[1]] : [])], confidence: "exact", echo: "run the ship-it workflow" }),
  },
  {
    re: /^(?:run|start|execute)\s+(?:the\s+)?(?:workflow\s+)?([\w-]+)\s*(.*)$/i,
    build: (m) => ({
      command: "run",
      args: [m[1], ...(m[2] ? m[2].split(/\s+/).filter(Boolean) : [])],
      confidence: "exact",
      echo: `run workflow ${m[1]}`,
    }),
  },
];

/** Keyword cues for "likely" suggestions when no exact rule matches. */
const CUES: { words: string[]; command: string; hint: string }[] = [
  { words: ["repo", "repository"], command: "repos", hint: "try \"list my repos\" or /repos" },
  { words: ["deploy"], command: "deployments", hint: "try \"deploy my-app to vercel\" or /deployments" },
  { words: ["dns", "record", "domain"], command: "dns", hint: "try \"list dns for example.com\" or /dns" },
  { words: ["zone", "cloudflare"], command: "zones", hint: "try /zones" },
  { words: ["service", "render"], command: "services", hint: "try /services" },
  { words: ["cache", "purge", "cdn"], command: "purge", hint: "try \"purge cache for example.com\" or /purge" },
  { words: ["connect", "login", "auth"], command: "connect", hint: "try /connect" },
  { words: ["status", "health", "online"], command: "status", hint: "try /status" },
  { words: ["activity", "happened", "events"], command: "activity", hint: "try /activity" },
  { words: ["workflow", "ship", "pipeline"], command: "workflows", hint: "try /workflows" },
];

export function parse(text: string): NlpResult | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t.startsWith("/")) return null;

  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (m) return rule.build(m);
  }

  // Weak match → suggest only (caller decides not to auto-execute).
  const lower = t.toLowerCase();
  for (const cue of CUES) {
    if (cue.words.some((w) => lower.includes(w))) {
      return { command: cue.command, args: [], confidence: "likely", echo: cue.hint };
    }
  }
  return null;
}
