import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Repo root = .../fbuddy (server/src -> ../../). */
export const ROOT_DIR = path.resolve(HERE, "..", "..");

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

const dataDir = process.env.FBUDDY_DATA_DIR
  ? path.resolve(process.env.FBUDDY_DATA_DIR)
  : path.join(ROOT_DIR, "data");

/**
 * Secret used to derive the AES key for provider/MCP credentials and the JWT
 * signing key. In production it MUST come from the environment (systemd
 * drop-in); the dev fallback is written to disk so tokens survive restarts.
 */
function resolveSecret() {
  const fromEnv = process.env.FBUDDY_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("FBUDDY_SECRET is required in production (>= 16 chars)");
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const devFile = path.join(dataDir, ".dev-secret");
  if (fs.existsSync(devFile)) return fs.readFileSync(devFile, "utf8").trim();
  const generated = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(devFile, generated, { mode: 0o600 });
  return generated;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  host: process.env.FBUDDY_HOST ?? "127.0.0.1",
  port: envInt("FBUDDY_PORT", 7790),
  publicUrl: process.env.FBUDDY_PUBLIC_URL ?? "http://localhost:5173",
  dataDir,
  filesDir: path.join(dataDir, "files"),
  dbFile: path.join(dataDir, "fbuddy.db"),
  webDistDir: path.join(ROOT_DIR, "web", "dist"),
  secret: resolveSecret(),
  version: "0.1.0",
  appName: process.env.FBUDDY_APP_NAME ?? "fBuddy",
  trustProxy: envBool("FBUDDY_TRUST_PROXY", true),
  /// Dev CORS origins (production serves web from the same origin, so CORS is unused).
  devOrigins: (process.env.FBUDDY_DEV_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.filesDir, { recursive: true });
}
