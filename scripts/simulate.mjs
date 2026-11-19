/**
 * Simulate Telegram updates against the real bot handlers with a stubbed
 * Telegram API layer. Reproduces exactly what the webhook path does
 * (handleUpdate) without network access — including Telegram's strict
 * HTML entity validation on replies.
 *
 * Usage: node scripts/simulate.mjs
 */
process.env.BOT_TOKEN = "123456:TEST-TOKEN";

const { createBot } = await import("../api/_lib/bot.js");
const { Telegram } = await import("telegraf");

// Stub at the prototype layer: ctx.telegram is a fresh instance per update,
// so patching bot.telegram would be bypassed.
Telegram.prototype.callApi = async function (method, payload) {
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
bot.telegram.getMe = async () => ({
  id: 1,
  is_bot: true,
  username: "tandem_devops_bot",
  first_name: "Tandem",
});
bot.botInfo = {
  id: 1,
  is_bot: true,
  username: "tandem_devops_bot",
  first_name: "Tandem",
};

function msg(from, text) {
  return {
    update_id: Date.now(),
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: from.id, type: "private" },
      from,
      text,
      entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }],
    },
  };
}

const cases = [
  ["plain name", msg({ id: 1, is_bot: false, first_name: "Daniel", username: "dan" }, "/start")],
  ["name with &<>", msg({ id: 2, is_bot: false, first_name: "Dan & <Co>" }, "/start")],
  ["name with emoji", msg({ id: 3, is_bot: false, first_name: "Daniel 🔥" }, "/start")],
  ["plain text", { update_id: Date.now(), message: { message_id: 1, date: 0, chat: { id: 4, type: "private" }, from: { id: 4, is_bot: false, first_name: "Ada" }, text: "hello there" } }],
  ["/profile with &", msg({ id: 5, is_bot: false, first_name: "A & B", username: "a&b" }, "/profile")],
  ["/status", msg({ id: 6, is_bot: false, first_name: "Efe" }, "/status")],
  ["/help", msg({ id: 7, is_bot: false, first_name: "Efe" }, "/help")],
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
console.log(`\n${failures === 0 ? "✅ ALL CASES PASS" : `❌ ${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
