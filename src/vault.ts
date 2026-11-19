/**
 * Credential vault — AES-256-GCM encryption for provider tokens at rest.
 *
 * ENCRYPTION_KEY: 64 hex chars (32 bytes). If it's missing, the bot can
 * generate one for you from Telegram (/connect → Generate) so setup never
 * needs a terminal.
 */

import crypto from "node:crypto";

const KEY_ENV = "ENCRYPTION_KEY";

export function vaultReady(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(process.env[KEY_ENV] ?? "");
}

export function generateKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!vaultReady()) {
    throw new Error(
      `ENCRYPTION_KEY is missing or invalid. Set it in Vercel → Settings → Environment Variables (64 hex chars).`
    );
  }
  return Buffer.from(raw as string, "hex");
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(packed: string): string {
  const [v, ivHex, tagHex, dataHex] = packed.split(":");
  if (v !== "v1") throw new Error("Unknown vault format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
