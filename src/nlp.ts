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

  // ── Website parity: GitHub ──
  {
    re: /^(?:star|add a star to)\s+(?:the\s+)?([\w./-]+)\s*$/i,
    build: (m) => ({ command: "star", args: [m[1]], confidence: "exact", echo: `star ${m[1]}` }),
  },
  {
    re: /^(?:unstar|remove (?:my )?star from)\s+(?:the\s+)?([\w./-]+)\s*$/i,
    build: (m) => ({ command: "unstar", args: [m[1]], confidence: "exact", echo: `unstar ${m[1]}` }),
  },
  {
    re: /^(?:fork|make a fork of)\s+(?:the\s+)?([\w./-]+)\s*$/i,
    build: (m) => ({ command: "fork", args: [m[1]], confidence: "exact", echo: `fork ${m[1]}` }),
  },
  {
    re: /^(?:search(?:\s+for)?|look up)\s+(.+)$/i,
    build: (m) => ({ command: "search", args: m[1].split(/\s+/), confidence: "exact", echo: `search GitHub for "${m[1].slice(0, 30)}"` }),
  },
  {
    re: /^(?:show|list|get)?\s*(?:the\s+)?(?:recent\s+)?commits(?:\s+(?:for|on|in)\s+([\w./-]+))?(?:\s+(?:on|from)\s+([\w./-]+))?\s*$/i,
    build: (m) => ({
      command: "commits",
      args: m[1] ? [m[1], ...(m[2] ? [m[2]] : [])] : [],
      confidence: "exact",
      echo: `show commits${m[1] ? ` for ${m[1]}` : ""}`,
    }),
  },
  {
    re: /^(?:view|show|open)\s+(?:pr|pull request)\s*#?(\d+)\s+(?:in|on)\s+([\w./-]+)\s*$/i,
    build: (m) => ({ command: "pr", args: ["view", m[2], m[1]], confidence: "exact", echo: `show PR #${m[1]} in ${m[2]}` }),
  },
  {
    re: /^(?:comment on\s+)(?:pr|pull request)\s*#?(\d+)\s+(?:in|on)\s+([\w./-]+)\s+(.+)$/i,
    build: (m) => ({ command: "pr", args: ["comment", m[2], m[1], m[3]], confidence: "exact", echo: `comment on PR #${m[1]} in ${m[2]}` }),
  },
  {
    re: /^(?:close|reopen)\s+(?:pr|pull request)\s*#?(\d+)\s+(?:in|on)\s+([\w./-]+)\s*$/i,
    build: (m) => ({
      command: "pr",
      args: [m[0].toLowerCase().startsWith("close") ? "close" : "reopen", m[2], m[1]],
      confidence: "exact",
      echo: `${m[0].toLowerCase().startsWith("close") ? "close" : "reopen"} PR #${m[1]} in ${m[2]}`,
    }),
  },
  {
    re: /^(?:view|show|open)\s+(?:issue|bug)\s*#?(\d+)\s+(?:in|on)\s+([\w./-]+)\s*$/i,
    build: (m) => ({ command: "issue", args: ["view", m[2], m[1]], confidence: "exact", echo: `show issue #${m[1]} in ${m[2]}` }),
  },
  {
    re: /^(?:comment on\s+)(?:issue|bug)\s*#?(\d+)\s+(?:in|on)\s+([\w./-]+)\s+(.+)$/i,
    build: (m) => ({ command: "issue", args: ["comment", m[2], m[1], m[3]], confidence: "exact", echo: `comment on issue #${m[1]} in ${m[2]}` }),
  },
  {
    re: /^(?:close|reopen)\s+(?:issue|bug)\s*#?(\d+)\s+(?:in|on)\s+([\w./-]+)\s*$/i,
    build: (m) => ({
      command: "issue",
      args: [m[0].toLowerCase().startsWith("close") ? "close" : "reopen", m[2], m[1]],
      confidence: "exact",
      echo: `${m[0].toLowerCase().startsWith("close") ? "close" : "reopen"} issue #${m[1]} in ${m[2]}`,
    }),
  },
  {
    re: /^(?:delete|remove)\s+(?:the\s+)?(?:repo|repository)\s+([\w./-]+)\s*$/i,
    build: (m) => ({ command: "repo-delete", args: [m[1]], confidence: "exact", echo: `delete repository ${m[1]} (will ask to confirm)` }),
  },

  // ── Website parity: Vercel ──
  {
    re: /^(?:promote|push to production|make live)\s+(?:deployment\s+)?(\S+)\s*$/i,
    build: (m) => ({ command: "promote", args: [m[1]], confidence: "exact", echo: `promote ${m[1]} to production (will ask to confirm)` }),
  },
  {
    re: /^(?:cancel|stop|abort)\s+(?:the\s+)?(?:deployment|deploy)\s+(\S+)\s*$/i,
    build: (m) => ({ command: "deployment-cancel", args: [m[1]], confidence: "exact", echo: `cancel deployment ${m[1]}` }),
  },
  {
    re: /^(?:delete|remove)\s+(?:the\s+)?(?:vercel\s+)?project\s+([\w-]+)\s*$/i,
    build: (m) => ({ command: "project-delete", args: [m[1]], confidence: "exact", echo: `delete Vercel project ${m[1]} (will ask to confirm)` }),
  },
];

/** Keyword cues for "likely" suggestions when no exact rule matches. */
const CUES: { words: string[]; command: string; hint: string }[] = [
  { words: ["repo", "repository"], command: "repos", hint: "try \"list my repos\" or /repos" },
  { words: ["deploy"], command: "deployments", hint: "try \"deploy my-app to vercel\" or /deployments" },
  { words: ["star", "fork"], command: "repos", hint: "try \"star owner/name\" or \"fork owner/name\"" },
  { words: ["search", "find", "look up"], command: "search", hint: "try \"search for <query>\" or /search <query>" },
  { words: ["commit"], command: "commits", hint: "try \"show commits for owner/name\" or /commits owner/name" },
  { words: ["comment", "review"], command: "pr", hint: "try \"comment on pr 12 in owner/name <text>\"" },
  { words: ["promote", "production"], command: "promote", hint: "try \"promote <deployment-id>\" or /promote <deployment-id>" },
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
