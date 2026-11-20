/**
 * Simulate Telegram updates against the real bot handlers with a stubbed
 * Telegram API layer. Reproduces exactly what the webhook path does
 * (handleUpdate) without network access — including Telegram's strict
 * HTML entity validation on replies and the Phase 2 connect flow.
 *
 * Usage: node scripts/simulate.mjs
 */
process.env.BOT_TOKEN = "123456:TEST-TOKEN";
process.env.ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

const { createBot } = await import("../api/_lib/bot.js");
const { Telegram } = await import("telegraf");

// Stub provider APIs used by validateToken — token checked from the header.
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const auth = String(opts.headers?.Authorization ?? opts.headers?.authorization ?? "");
  const json = (body, status = 200) => ({
    ok: status === 200,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  if (u.includes("api.github.com")) {
    if (auth.includes("ghp_goodtoken")) return json({ login: "octo-test", name: "Octo" });
    return json({ message: "Bad credentials" }, 401);
  }
  return json({}, 404);
};

// Stub at the prototype layer: ctx.telegram is a fresh instance per update,
// so patching bot.telegram would be bypassed.
const sent = [];
Telegram.prototype.callApi = async function (method, payload) {
  sent.push({ method, payload });
  console.log(`\n[API CALL] ${method}:`);
  console.log(`  text: ${JSON.stringify(payload.text)?.slice(0, 220)}`);
  if (payload.parse_mode) console.log(`  parse_mode: ${payload.parse_mode}`);
  if (payload.parse_mode === "HTML") {
    const bad = validateHtml(payload.text ?? "");
    if (bad) throw new Error(`400: Bad Request: can't parse entities — ${bad}`);
  }
  return {
    message_id: 1,
    date: 0,
    chat: { id: payload.chat_id, type: "private" },
    text: payload.text,
  };
};

// Mimic Telegram's strict entity validation: unescaped & or stray < > fail.
function validateHtml(text) {
  const stripped = text
    .replace(/<\/?[a-z][a-z0-9]*>/g, "") // allowed simple tags
    .replace(/&lt;|&gt;|&amp;|&quot;/g, "");
  if (/[<>]/.test(stripped)) return "invalid tag-like markup left after stripping";
  const amp = text.match(/&(?!(lt|gt|amp|quot|apos|#\d+);)/g);
  if (amp) return `unescaped "&" (${amp.length}x) — Telegram rejects this`;
  return null;
}

const bot = createBot();
bot.botInfo = {
  id: 1,
  is_bot: true,
  username: "tandem_devops_bot",
  first_name: "Tandem",
};

function cmd(id, from, text) {
  return {
    update_id: Date.now() + id,
    message: {
      message_id: id,
      date: Math.floor(Date.now() / 1000),
      chat: { id: from.id, type: "private" },
      from,
      text,
      entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }],
    },
  };
}
function txt(id, from, text) {
  return {
    update_id: Date.now() + id,
    message: {
      message_id: id,
      date: Math.floor(Date.now() / 1000),
      chat: { id: from.id, type: "private" },
      from,
      text,
    },
  };
}

const alice = { id: 1, is_bot: false, first_name: "Alice", username: "alice" };

const cases = [
  ["plain name /start", cmd(1, { id: 10, is_bot: false, first_name: "Daniel", username: "dan" }, "/start")],
  ["name with &<> /start", cmd(2, { id: 11, is_bot: false, first_name: "Dan & <Co>" }, "/start")],
  ["plain text", txt(3, { id: 12, is_bot: false, first_name: "Ada" }, "hello there")],
  ["text with &<>", txt(4, { id: 13, is_bot: false, first_name: "Ada" }, "a & b <tag>")],
  ["/profile with &", cmd(5, { id: 14, is_bot: false, first_name: "A & B", username: "a&b" }, "/profile")],
  ["/status", cmd(6, { id: 15, is_bot: false, first_name: "Efe" }, "/status")],

  // ── Phase 2 connect flow ──
  ["/connect github (start flow)", cmd(7, alice, "/connect github")],
  ["bad token → retry", txt(8, alice, "ghp_badtoken1234567890")],
  ["good token → connected", txt(9, alice, "ghp_goodtoken1234567890")],
  ["/connections (lists github)", cmd(10, alice, "/connections")],
  ["secret pasted unprompted", txt(11, { id: 16, is_bot: false, first_name: "Eve" }, "here is ghp_secrettoken123456 oops")],
  ["/disconnect github (confirm)", cmd(12, alice, "/disconnect github")],
  ["/connect github again (already connected)", cmd(13, alice, "/connect github")],

  // ── Phase 7 NL dispatch ──
  ["NL: list my repos → cmdRepos", txt(17, { id: 17, is_bot: false, first_name: "Nia", username: "nia" }, "list my repos")],
  ["NL: what's the status → status", txt(18, { id: 18, is_bot: false, first_name: "Kojo", username: "kojo" }, "what's the status")],

  // ── Launch focus: Cloudflare/Render held back as coming soon ──
  ["/zones → coming soon", cmd(19, { id: 19, is_bot: false, first_name: "Ada" }, "/zones")],
  ["/services → coming soon", cmd(20, { id: 20, is_bot: false, first_name: "Ada" }, "/services")],
];

let failures = 0;
for (const [label, update] of cases) {
  process.stdout.write(`\n════ CASE: ${label} ════`);
  try {
    await bot.handleUpdate(update);
    console.log(`\n✅ "${label}" OK`);
  } catch (err) {
    failures++;
    console.log(`\n❌ "${label}" THREW: ${err.message}`);
  }
}

// Cross-case assertions on what the conversation actually did.
const allText = sent.map((s) => s.payload.text ?? "").join("\n");
function assert(label, cond) {
  console.log(`${cond ? "✅" : "❌"} assertion: ${label}`);
  if (!cond) failures++;
}
assert("good token stored (reply names the identity)", allText.includes("octo-test"));
assert("no token echoed back to chat", !allText.includes("ghp_goodtoken") && !allText.includes("ghp_badtoken"));
assert("secret warning fired for unprompted paste", allText.includes("looks like a secret"));
assert("NL 'list my repos' dispatched to repos command", allText.includes("isn't connected yet") || allText.includes("Your repositories"));
assert("NL 'what's the status' answered with status", allText.includes("Tandem status"));
assert("Cloudflare/Render show coming soon", (allText.match(/coming soon/g) ?? []).length >= 2);

// ═══════════════════════════════════════════════════════════════════
// PHASE 2–10 MODULE CHECKS — store, vault, oauth-state, nlp, ratelimit,
// github client, workflows. Runs last so the fetch stub below can't
// interfere with the bot scenarios above.
// ═══════════════════════════════════════════════════════════════════
function assert2(name, cond, detail = "") {
  console.log(`${cond ? "✅" : "❌"} module assertion: ${name}${!cond && detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

// Vault
const vault = await import("../api/_lib/vault.js");
process.env.ENCRYPTION_KEY = vault.generateKey();
assert2("vault roundtrips encrypt/decrypt", vault.decrypt(vault.encrypt("tok-123")) === "tok-123");
assert2("hmac verify accepts own signature", vault.hmacVerify("sec", "body", vault.hmacSign("sec", "body")));
assert2("hmac verify rejects wrong secret", !vault.hmacVerify("other", "body", vault.hmacSign("sec", "body")));

// Store roundtrip (memory driver)
const store = await import("../api/_lib/store.js");
const u = await store.getOrCreateUser({ telegramUserId: 999, telegramUsername: "test", firstName: "T", languageCode: "en" });
assert2("user created", u.telegramUserId === 999, JSON.stringify(u));
await store.saveConnection(999, "github", "ghp_secret_value", "octo", "pat");
const got = await store.getConnection(999, "github");
assert2(
  "connection stored + decrypted",
  Boolean(got && got.token === "ghp_secret_value" && got.identity === "octo" && got.authType === "pat"),
  JSON.stringify(got)
);
const conns = await store.listConnections(999);
assert2("listConnections keeps entries", conns.length === 1);

// OAuth state: single-use
const state = "abc123state";
await store.saveOAuthState(state, 999, "github");
const c1 = await store.consumeOAuthState(state);
const c2 = await store.consumeOAuthState(state);
assert2("oauth state is single-use", Boolean(c1 && c1.userId === 999 && c2 === null), JSON.stringify({ c1, c2 }));

// NLP (Phase 7)
const nlp = await import("../api/_lib/nlp.js");
const t1 = nlp.parse("create a private repo called calder-api");
assert2(
  "nlp: create a private repo called calder-api",
  Boolean(t1 && t1.command === "create_repo" && t1.args[0] === "calder-api" && t1.args[1] === "private" && t1.confidence === "exact"),
  JSON.stringify(t1)
);
const t2 = nlp.parse("list my repos");
assert2("nlp: list my repos", Boolean(t2 && t2.command === "repos" && t2.confidence === "exact"), JSON.stringify(t2));
const t3 = nlp.parse("deploy my-app to vercel");
assert2(
  "nlp: deploy my-app to vercel",
  Boolean(t3 && t3.command === "deploy" && t3.args[0] === "vercel" && t3.args[1] === "my-app"),
  JSON.stringify(t3)
);
const t4 = nlp.parse("list dns for example.com");
assert2("nlp: list dns for example.com", Boolean(t4 && t4.command === "dns" && t4.args[0] === "example.com"), JSON.stringify(t4));
const t5 = nlp.parse("purge cache for example.com");
assert2("nlp: purge cache for example.com", Boolean(t5 && t5.command === "purge" && t5.args[0] === "example.com"), JSON.stringify(t5));
const t6 = nlp.parse("run ship-it calder");
assert2("nlp: run ship-it calder", Boolean(t6 && t6.command === "run" && t6.args[0] === "ship-it"), JSON.stringify(t6));
const t7 = nlp.parse("hey tell me about my deploy yesterday");
assert2("nlp: weak match suggests only", Boolean(t7 && t7.confidence === "likely"), JSON.stringify(t7));
const t8 = nlp.parse("the quick brown fox");
assert2("nlp: unmatched text returns null", t8 === null, JSON.stringify(t8));

// Phase 11 NL — website parity
const n1 = nlp.parse("star octo/calder-api");
assert2("nlp: star octo/calder-api", Boolean(n1 && n1.command === "star" && n1.args[0] === "octo/calder-api"), JSON.stringify(n1));
const n2 = nlp.parse("search for auth bug");
assert2("nlp: search for auth bug", Boolean(n2 && n2.command === "search" && n2.args.join(" ") === "auth bug"), JSON.stringify(n2));
const n3 = nlp.parse("comment on pr 42 in octo/calder-api looks good to me");
assert2(
  "nlp: comment on pr 42",
  Boolean(n3 && n3.command === "pr" && n3.args[0] === "comment" && n3.args[1] === "octo/calder-api" && n3.args[2] === "42" && n3.args[3] === "looks good to me"),
  JSON.stringify(n3)
);
const n4 = nlp.parse("close issue 7 in octo/calder-api");
assert2("nlp: close issue 7", Boolean(n4 && n4.command === "issue" && n4.args[0] === "close" && n4.args[2] === "7"), JSON.stringify(n4));
const n5 = nlp.parse("promote dpl_abc123");
assert2("nlp: promote deployment", Boolean(n5 && n5.command === "promote" && n5.args[0] === "dpl_abc123"), JSON.stringify(n5));
const n6 = nlp.parse("delete repo octo/old-project");
assert2("nlp: delete repo routes to confirmed command", Boolean(n6 && n6.command === "repo-delete"), JSON.stringify(n6));
const n7 = nlp.parse("show commits for octo/calder-api");
assert2("nlp: show commits for repo", Boolean(n7 && n7.command === "commits" && n7.args[0] === "octo/calder-api"), JSON.stringify(n7));

// Rate limiting (Phase 10)
const rl = await import("../api/_lib/ratelimit.js");
let floodBlocked = false;
for (let i = 0; i < 16; i++) {
  const r = rl.checkLimit(999, "messages");
  if (!r.ok) floodBlocked = true;
}
assert2("rate limit blocks message flood", floodBlocked);
rl._resetLimits();

// GitHub ops against stubbed fetch (Phase 3 client)
const jsonResponse = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const captured = [];
globalThis.fetch = async (url, opts = {}) => {
  const method = opts.method ?? "GET";
  const u = String(url);
  let body;
  if (opts.body) {
    try {
      body = JSON.parse(opts.body);
    } catch {
      body = String(opts.body); // form-encoded bodies (OAuth exchanges)
    }
  }
  captured.push({ url: u, method, body });
  if (u.includes("login/oauth/access_token")) return jsonResponse({ access_token: "tok_cb_test", token_type: "bearer" });
  if (u.endsWith("/user")) return jsonResponse({ login: "octo", id: 1 });
  if (u.includes("/search/issues")) return jsonResponse({ items: [{ number: 7, title: "login bug", html_url: "https://x/7", state: "open", repository_url: "https://api.github.com/repos/octo/calder-api" }] });
  if (u.includes("/search/repositories")) return jsonResponse({ items: [{ full_name: "octo/calder-api", private: false, html_url: "https://x", stargazers_count: 3, pushed_at: "2026-11-18T07:00:00Z", description: "x" }] });
  if (u.includes("/user/starred/")) return jsonResponse({});
  if (u.includes("/comments")) return jsonResponse({ html_url: "https://x/c1" });
  if (u.includes("/user/repos"))
    return jsonResponse([
      {
        name: "calder-api",
        full_name: "octo/calder-api",
        private: true,
        description: "x",
        html_url: "https://github.com/octo/calder-api",
        default_branch: "main",
        language: "TypeScript",
        stargazers_count: 2,
        open_issues_count: 1,
        pushed_at: "2026-11-18T07:00:00Z",
        updated_at: "2026-11-18T07:00:00Z",
        owner: { login: "octo" },
      },
    ]);
  if (u.includes("/contents/") && method === "GET")
    return jsonResponse({
      path: "a.ts",
      sha: "deadbeef",
      content: Buffer.from("hi").toString("base64"),
      encoding: "base64",
      size: 2,
      html_url: "https://x",
      download_url: null,
    });
  if (u.includes("/contents/")) return jsonResponse({ commit: { sha: "cafebabe", html_url: "https://x" }, content: { sha: "f00" } });
  return jsonResponse({});
};

const gh = await import("../api/_lib/providers/github.js");
const repos = await gh.listRepos({ authType: "pat", token: "ghp_x" }, 1);
assert2(
  "github listRepos parses response",
  repos.repos.length === 1 && repos.repos[0].fullName === "octo/calder-api",
  JSON.stringify(repos)
);
assert2("github request goes to api.github.com", captured.at(-1).url.includes("api.github.com"), captured.at(-1).url);
assert2(
  "listRepos includes org-member repos",
  captured.at(-1).url.includes("organization_member") && captured.at(-1).url.includes("sort=pushed"),
  captured.at(-1).url
);
assert2("listRepos reports end of list on short page", repos.hasNextPage === false, JSON.stringify(repos.hasNextPage));
const f = await gh.getFile({ authType: "pat", token: "ghp_x" }, "octo/calder-api", "a.ts");
assert2("github getFile base64-decodes content", f.text === "hi" && f.sha === "deadbeef", JSON.stringify(f));
// GitHub's create-or-update endpoint: PUT with sha = update, PUT without sha = create.
await gh.commitFile({ authType: "pat", token: "ghp_x" }, "octo/calder-api", "a.ts", "new content", "msg", { sha: "deadbeef" });
assert2(
  "github commitFile update sends PUT + existing sha",
  captured.at(-1).method === "PUT" && captured.at(-1).body.sha === "deadbeef",
  JSON.stringify(captured.at(-1))
);
await gh.commitFile({ authType: "pat", token: "ghp_x" }, "octo/calder-api", "b.ts", "fresh", "msg");
assert2(
  "github commitFile create sends PUT without sha",
  captured.at(-1).method === "PUT" && !captured.at(-1).body.sha,
  JSON.stringify(captured.at(-1))
);

// Phase 11 ops: star / comment / search
await gh.starRepo({ authType: "pat", token: "ghp_x" }, "octo/calder-api");
assert2(
  "github starRepo sends PUT to /user/starred",
  captured.at(-1).method === "PUT" && captured.at(-1).url.includes("/user/starred/octo/calder-api"),
  JSON.stringify(captured.at(-1))
);
await gh.commentPR({ authType: "pat", token: "ghp_x" }, "octo/calder-api", 42, "looks good");
assert2(
  "github commentPR posts to issue comments",
  captured.at(-1).method === "POST" && captured.at(-1).url.includes("/issues/42/comments") && captured.at(-1).body.body === "looks good",
  JSON.stringify(captured.at(-1))
);
const sr = await gh.searchIssues({ authType: "pat", token: "ghp_x" }, "login bug");
assert2("github searchIssues parses results", sr.length === 1 && sr[0].repo === "octo/calder-api", JSON.stringify(sr));

// Workflow run (Phase 8) — diagnose touches vault + connections only.
const wf = await import("../api/_lib/workflows.js");
const diagnose = wf.findWorkflow("diagnose");
assert2("findWorkflow resolves diagnose", Boolean(diagnose));
const task = await wf.runWorkflow(diagnose, {
  userId: 999,
  args: [],
  conn: async (p) => (p === "github" ? { authType: "pat", token: "ghp_x" } : null),
  note: () => {},
});
assert2(
  "diagnose workflow completes",
  task.status === "done" && task.steps.every((s) => s.status !== "running"),
  JSON.stringify(task)
);
const savedTasks = await store.listTasks(999, 5);
assert2("workflow task recorded in store", savedTasks.length >= 1, String(savedTasks.length));

// OAuth callback regression: GitHub redirects back WITHOUT ?provider= — the
// handler must resolve the provider from the state record (this exact bug
// produced "unknown: unknown provider" in production).
const cbModule = await import("../api/oauth/callback.js");
const savedState = "cbstate123";
await store.saveOAuthState(savedState, 999, "github");
const cbRes = {
  code: 0,
  headers: {},
  body: "",
  status(c) {
    this.code = c;
    return this;
  },
  json(o) {
    this.body = JSON.stringify(o);
    return this;
  },
  send(html) {
    this.body = String(html);
    return this;
  },
  writeHead(c, h) {
    this.code = c;
    this.headers = h ?? {};
  },
  end() {},
};
await cbModule.default({ method: "GET", query: { code: "testcode", state: savedState } }, cbRes);
assert2(
  "callback resolves provider from state without ?provider= param",
  (cbRes.code === 302 && String(cbRes.headers.Location ?? "").includes("t.me")) ||
    (cbRes.code === 200 && cbRes.body.includes("Connected")),
  `status=${cbRes.code} body=${cbRes.body.slice(0, 120)}`
);
const cbConn = await store.getConnection(999, "github");
assert2("callback stored the exchanged connection", Boolean(cbConn && cbConn.token === "tok_cb_test"), JSON.stringify(cbConn));
const cbExch = captured.filter((c) => c.url.includes("login/oauth/access_token")).at(-1);
assert2(
  "token exchange is form-encoded (RFC 6749)",
  typeof cbExch?.body === "string" && cbExch.body.includes("client_id="),
  JSON.stringify(cbExch?.body)
);

console.log(`\n${failures === 0 ? "✅ ALL CASES + MODULE CHECKS PASS" : `❌ ${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
