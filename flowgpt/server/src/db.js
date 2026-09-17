import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { newId, nowIso } from "./util.js";

/**
 * SQLite via the Node built-in driver (`node:sqlite`, Node >= 22.5) so the VPS
 * needs no native build step. Booleans are stored as 0/1 (the driver rejects
 * JS booleans), and JSON columns are stored as TEXT.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  skill TEXT NOT NULL DEFAULT 'auto',
  provider_id TEXT,
  model TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_preview TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  tool_calls_json TEXT NOT NULL DEFAULT '[]',
  tool_results_json TEXT NOT NULL DEFAULT '[]',
  artifacts_json TEXT NOT NULL DEFAULT '[]',
  provider_id TEXT,
  model TEXT,
  usage_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  stored_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'document',
  origin TEXT NOT NULL DEFAULT 'upload',
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT,
  api_key_enc TEXT,
  models_json TEXT NOT NULL DEFAULT '[]',
  default_model TEXT,
  image_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,
  command TEXT,
  args_json TEXT NOT NULL DEFAULT '[]',
  env_enc TEXT,
  url TEXT,
  headers_enc TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_approve INTEGER NOT NULL DEFAULT 0,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  tools_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'unknown',
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  link_hash TEXT,
  purpose TEXT NOT NULL DEFAULT 'login',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_email ON email_tokens(email, created_at DESC);

CREATE TABLE IF NOT EXISTS user_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  installed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_skills_unique ON user_skills(user_id, skill_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id, sort_order);

CREATE TABLE IF NOT EXISTS usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  conversation_id TEXT,
  provider_id TEXT,
  model TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`;

export const db = new DatabaseSync(config.dbFile);

export function initDb() {
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

const COLUMN_CACHE = new Map();

function columns(table) {
  if (!COLUMN_CACHE.has(table)) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    COLUMN_CACHE.set(table, new Set(rows.map((r) => r.name)));
  }
  return COLUMN_CACHE.get(table);
}

/** SQLite bindings accept only null/number/bigint/string/Uint8Array. */
function bindValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/** JSON columns are declared with a `_json` suffix; callers pass real objects. */
function encodeRow(table, row) {
  const cols = columns(table);
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (!cols.has(key)) continue;
    out[key] = key.endsWith("_json") && value !== null && typeof value !== "string"
      ? JSON.stringify(value ?? null)
      : bindValue(value);
  }
  return out;
}

function decodeRow(table, row) {
  if (!row) return null;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (key.endsWith("_json")) {
      const raw = out[key];
      out[key.replace(/_json$/, "")] = raw ? safeParse(raw) : null;
      delete out[key];
    }
  }
  return out;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function insert(table, row) {
  const id = row.id ?? newId(table.slice(0, 1));
  const cols = columns(table);
  const timestamps = {};
  // Every table carries created_at/updated_at NOT NULL — fill them when the
  // caller does not, so inserts never depend on the caller remembering.
  if (cols.has("created_at") && row.created_at === undefined) timestamps.created_at = nowIso();
  if (cols.has("updated_at") && row.updated_at === undefined) timestamps.updated_at = nowIso();
  const record = encodeRow(table, { ...row, ...timestamps, id });
  const keys = Object.keys(record);
  const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
  db.prepare(sql).run(...keys.map((k) => record[k]));
  return decodeRow(table, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
}

export function getById(table, id) {
  if (!id) return null;
  return decodeRow(table, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
}

export function update(table, id, patch) {
  const record = encodeRow(table, patch);
  const keys = Object.keys(record);
  if (!keys.length) return getById(table, id);
  if (columns(table).has("updated_at")) record.updated_at = nowIso();
  const allKeys = Object.keys(record);
  const sql = `UPDATE ${table} SET ${allKeys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
  db.prepare(sql).run(...allKeys.map((k) => record[k]), id);
  return getById(table, id);
}

export function remove(table, id) {
  const res = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return res.changes > 0;
}

export function all(table, where = "", params = [], { order = "", limit = null } = {}) {
  let sql = `SELECT * FROM ${table}`;
  if (where) sql += ` WHERE ${where}`;
  if (order) sql += ` ORDER BY ${order}`;
  if (limit) sql += ` LIMIT ${Number(limit)}`;
  return db.prepare(sql).all(...params).map((row) => decodeRow(table, row));
}

export function one(table, where, params = []) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE ${where} LIMIT 1`).get(...params);
  return decodeRow(table, row);
}

export function count(table, where = "", params = []) {
  const sql = `SELECT COUNT(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  return Number(db.prepare(sql).get(...params)?.n ?? 0);
}

// ------------------------------------------------------------- app settings

export const DEFAULT_APP_SETTINGS = {
  systemPrompt: [
    "Bạn là FlowGpt — trợ lý AI đa năng của MeetFlow AI, trả lời bằng tiếng Việt tự nhiên, ngắn gọn và chính xác.",
    "Khi người dùng cần tạo tệp (slide, bảng tính, phân tích dữ liệu, sửa ảnh), hãy dùng công cụ tương ứng thay vì chỉ mô tả.",
    "Nếu thiếu thông tin quan trọng, hỏi lại tối đa một câu ngắn rồi vẫn đưa ra bản nháp hợp lý.",
  ].join(" "),
  defaultProviderId: null,
  defaultModel: null,
  defaultSkill: "auto",
  maxToolIterations: 6,
  maxUploadMb: 25,
  allowSignup: true,
  appName: "FlowGpt",
  imageModel: null,

  // --- login by emailed token (passwordless) -------------------------------
  /** How long a login code/link stays valid. */
  loginTokenTtlMin: 15,
  /** Password login stays available as the admin/fallback path. */
  passwordLoginEnabled: true,
  /** A first-time email that requests a code gets an account automatically. */
  autoCreateUserOnLogin: true,
  /** With no mailer configured, show the code on screen so the app is usable. */
  showLoginCodeWhenNoMailer: true,
  /** Sender identity for login mail. */
  mailerFrom: "no-reply@meetflowai.site",
  mailerFromName: "FlowGpt",
  /** AES-GCM encrypted Resend API key (never returned by the API as-is). */
  resendApiKeyEnc: null,

  // --- voice (speech in / speech out) --------------------------------------
  /** null = use the browser's own speech APIs (free, nothing to install). */
  voiceSttProviderId: null,
  voiceSttModel: null,
  voiceTtsProviderId: null,
  voiceTtsModel: null,
  voiceTtsVoice: null,
  /** BCP-47 tag used for recognition, synthesis and the STT request. */
  voiceLanguage: "vi-VN",
  /** Read every assistant reply out loud automatically. */
  voiceAutoRead: false,
  /** Browser speech rate 0.5–2. */
  voiceSpeakRate: 1,
};

export function getAppSettings() {
  const stored = {};
  // `value_json` is decoded to `value` by row decoding (see decodeRow).
  for (const row of all("app_settings")) {
    stored[row.key] = row.value;
  }
  return { ...DEFAULT_APP_SETTINGS, ...stored };
}

export function setAppSettings(patch) {
  const now = nowIso();
  const stmt = db.prepare(
    "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
  );
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_APP_SETTINGS)) continue;
    stmt.run(key, JSON.stringify(value ?? null), now);
  }
  return getAppSettings();
}

export function audit(userId, action, target = null, detail = {}) {
  try {
    insert("audit_log", { user_id: userId, action, target, detail_json: detail });
  } catch {
    // Audit must never break the request path.
  }
}
