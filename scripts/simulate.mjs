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

console.log(`\n${failures === 0 ? "✅ ALL CASES PASS" : `❌ ${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
