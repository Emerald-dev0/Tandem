import { Markup } from "telegraf";

export const mainMenuKeyboard = Markup.keyboard([
  ["🚀 Create", "🐙 GitHub"],
  ["☁️ Deployments", "🌐 Infrastructure"],
  ["📊 Activity", "⚙️ Settings"],
]).resize();

export const welcomeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🚀 Get started", "welcome:get_started")],
  [Markup.button.callback("🔌 Connect a service", "welcome:connect")],
  [Markup.button.callback("📋 View available commands", "welcome:commands")],
  [Markup.button.callback("❓ Help", "welcome:help")],
]);

export const connectKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🐙 GitHub", "connect:github")],
  [Markup.button.callback("▲ Vercel", "connect:vercel")],
  [Markup.button.callback("☁️ Cloudflare", "connect:cloudflare")],
  [Markup.button.callback("🟣 Render", "connect:render")],
  [Markup.button.callback("⬅️ Back", "welcome:back")],
]);

export const githubKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("📂 List repositories", "github:repos")],
  [Markup.button.callback("➕ Create repository", "github:create_repo")],
  [Markup.button.callback("⬅️ Back", "welcome:back")],
]);

export const deploymentsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("▲ Vercel projects", "deploy:vercel")],
  [Markup.button.callback("🟣 Render services", "deploy:render")],
  [Markup.button.callback("⬅️ Back", "welcome:back")],
]);

export const infraKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("🌐 Cloudflare zones", "infra:cloudflare")],
  [Markup.button.callback("⬅️ Back", "welcome:back")],
]);

export const settingsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("👤 Profile", "settings:profile")],
  [Markup.button.callback("🔌 Connections", "settings:connections")],
  [Markup.button.callback("📊 Status", "settings:status")],
  [Markup.button.callback("⬅️ Back", "welcome:back")],
]);

export function cancelFlowKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🚫 Cancel", "flow:cancel")],
  ]);
}

export function disconnectKeyboard(provider: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`🗑 Yes, disconnect ${provider}`, `disconnect:${provider}:yes`)],
    [Markup.button.callback("⬅️ Keep it", "settings:connections")],
  ]);
}

export function connectDoneKeyboard(provider: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🔌 Connect another", "welcome:connect")],
    [Markup.button.callback("🔌 View connections", "settings:connections")],
    [Markup.button.callback("⬅️ Main menu", "welcome:back")],
  ]);
}

export function genKeyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🔐 Generate encryption key", "flow:genkey")],
    [Markup.button.callback("🚫 Cancel", "flow:cancel")],
  ]);
}
