/**
 * Copy compiled bot code (dist/) into api/_lib/ so Vercel includes it
 * in the serverless function bundle.
 *
 * Why: Vercel respects .gitignore and excludes dist/ from deployments,
 * which caused /api/telegram to 404. Files under api/ are always
 * included, and folders starting with _ are helpers (not routes).
 */
import { cpSync, rmSync, mkdirSync } from "node:fs";

rmSync("api/_lib", { recursive: true, force: true });
mkdirSync("api/_lib", { recursive: true });
cpSync("dist", "api/_lib", { recursive: true });
console.log("✅ Copied dist/ → api/_lib/ for Vercel functions");
