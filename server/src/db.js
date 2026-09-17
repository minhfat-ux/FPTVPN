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
  choices_json TEXT NOT NULL DEFAULT '[]',
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

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  balance_after INTEGER NOT NULL,
  note TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT,
  amount INTEGER NOT NULL,
  balance_at_request INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_at TEXT,
  decided_by TEXT,
  granted_amount INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_requests_status ON credit_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_requests_user ON credit_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hub_skills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Khác',
  icon TEXT NOT NULL DEFAULT 'sparkles',
  price INTEGER NOT NULL DEFAULT 0,
  price_vnd INTEGER NOT NULL DEFAULT 0,
  instructions TEXT,
  tools_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'published',
  sort_order INTEGER NOT NULL DEFAULT 0,
  installs INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hub_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  hub_skill_id TEXT NOT NULL,
  price_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_purchases_unique ON hub_purchases(user_id, hub_skill_id);
CREATE INDEX IF NOT EXISTS idx_hub_purchases_user ON hub_purchases(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS topup_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT,
  package_id TEXT,
  package_name TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  amount_vnd INTEGER NOT NULL,
  transfer_note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bank_txn_ref TEXT,
  paid_at TEXT,
  confirmed_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topup_orders_user ON topup_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topup_orders_status ON topup_orders(status, created_at DESC);

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

-- One row per signed-in device/browser. The JWT carries a session id (sid), so
-- several devices for the same account coexist and each can be revoked on its own.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, created_at DESC);

-- Per-account (not per-device) state that has to follow the user everywhere,
-- e.g. the conversation they last worked on.
CREATE TABLE IF NOT EXISTS user_state (
  user_id TEXT PRIMARY KEY,
  last_conversation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const db = new DatabaseSync(config.dbFile);

export function initDb() {
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrate();
  return db;
}

/**
 * Additive migrations for databases created by an older release. `CREATE TABLE IF
 * NOT EXISTS` cannot add a column, and there is no migration framework — a plain
 * `ALTER TABLE ... ADD COLUMN` guarded by a PRAGMA lookup is enough here (SQLite
 * allows adding a NOT NULL column when a default is given).
 */
const ADDED_COLUMNS = [
  { table: "messages", column: "choices_json", definition: "TEXT NOT NULL DEFAULT '[]'" },
  // `price_vnd` is the authoritative skill price (VND). `price` stays as a legacy
  // credits cache and is only read to seed `price_vnd` on the migration below.
  { table: "hub_skills", column: "price_vnd", definition: "INTEGER NOT NULL DEFAULT 0" },
];

function migrate() {
  for (const entry of ADDED_COLUMNS) {
    const existing = new Set(db.prepare(`PRAGMA table_info(${entry.table})`).all().map((row) => row.name));
    if (existing.has(entry.column)) continue;
    db.exec(`ALTER TABLE ${entry.table} ADD COLUMN ${entry.column} ${entry.definition}`);
    console.log(`[fbuddy] đã thêm cột ${entry.table}.${entry.column}`);
    if (entry.table === "hub_skills" && entry.column === "price_vnd") backfillHubPriceVnd();
  }
  COLUMN_CACHE.clear();
}

/**
 * Converts the legacy credits price of every existing skill into VND using the
 * price of one credit at migration time, so a running shop keeps charging the
 * same money. Runs once, right after `price_vnd` is added — running it on every
 * boot would resurrect a skill the admin deliberately made free.
 */
function backfillHubPriceVnd() {
  const perCredit = Math.max(0, Number(getAppSettings().vndPerCredit) || 0);
  if (!perCredit) return;
  const result = db
    .prepare("UPDATE hub_skills SET price_vnd = price * ? WHERE price_vnd = 0 AND price > 0")
    .run(perCredit);
  if (result.changes) {
    console.log(`[fbuddy] quy đổi giá ${result.changes} kỹ năng sang VND (${perCredit}đ/credit)`);
  }
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
    "Bạn là fBuddy — trợ lý AI đa năng của MeetFlow AI, trả lời bằng tiếng Việt tự nhiên, ngắn gọn và chính xác.",
    "Khi người dùng cần tạo tệp (slide, bảng tính, phân tích dữ liệu, sửa ảnh), hãy dùng công cụ tương ứng thay vì chỉ mô tả.",
    "Nếu thiếu thông tin quan trọng, hỏi lại tối đa một câu ngắn rồi vẫn đưa ra bản nháp hợp lý.",
    "Khi đã tạo tệp, chỉ nói ngắn gọn đã tạo gì và nêu vài số liệu chính; KHÔNG viết link tải kiểu sandbox:/… hay đường dẫn giả — giao diện đã hiện thẻ tệp cho người dùng bấm tải.",
    "Nếu ảnh đính kèm không xem được, đừng đoán nội dung ảnh: nói rõ là chưa đọc được ảnh.",
  ].join(" "),
  defaultProviderId: null,
  defaultModel: null,
  defaultSkill: "auto",
  maxToolIterations: 6,
  maxUploadMb: 25,
  allowSignup: true,
  appName: "fBuddy",
  imageModel: null,
  /**
   * Which provider/model reads images (OCR, "đưa ảnh thành Excel") when the model
   * the user picked cannot see. null = auto (a provider whose model has vision).
   */
  visionProviderId: null,
  visionModel: null,

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
  mailerFromName: "fBuddy",
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

  // --- credits -------------------------------------------------------------  /** Master switch for metering chat and blocking users who run out. */
  creditsEnabled: true,
  /** Credits handed to a brand-new account on first login (0 = must buy first). */
  signupCredits: 10000,
  /**
   * Credits charged per token, counting input + output. Calibrated against real
   * usage: a turn measures ~3.500 tokens (tool schemas + prompt + history), so
   * 0.06 credit/token × 1đ/credit ≈ 210đ per turn. Fractional on purpose —
   * see `costForUsage`, which rounds up to a whole credit.
   */
  creditsPerToken: 0.06,
  /**
   * Selling price of ONE credit in VND. The top-up packages derive their price
   * from this (`credits × vndPerCredit`) unless a package sets its own price, so the
   * owner only has to change one number here (Cài đặt → Hệ thống → Credit & giá).
   */
  vndPerCredit: 1,
  /** Where the "nạp thêm" button sends people. */
  creditBuyUrl: "https://fbuddy.meetflowai.site/?view=topup",
  /** Token packages sold on the fBuddy top-up page (price in VND). */
  topupPackages: [
    { id: "starter", name: "Gói khởi đầu", tokens: 10000, priceVnd: null, bonusTokens: 0, note: "Phù hợp để thử" },
    { id: "pro", name: "Gói Pro", tokens: 50000, priceVnd: null, bonusTokens: 5000, note: "Phổ biến nhất" },
    { id: "business", name: "Gói doanh nghiệp", tokens: 200000, priceVnd: null, bonusTokens: 30000, note: "Cho cả nhóm" },
  ],
  /** Bank account shown on the top-up page (VietQR image is built from these). */
  bankId: "970436",
  bankAccount: "",
  bankAccountName: "",
  /** Prefix of the transfer note so the owner can match a payment to an order. */
  bankNotePrefix: "FBUDDY",

  // --- SePay (tự động xác nhận nạp tiền) -----------------------------------
  /** Bật/tắt tự động cộng credit khi tiền vào. */
  sepayEnabled: false,
  /** `webhook` = SePay gọi vào fBuddy; `poll` = fBuddy gọi API giao dịch. */
  sepayMode: "poll",
  /** Chu kỳ poll (giây). */
  sepayPollSeconds: 60,
  /** API token của SePay (user API) — mã hoá AES-GCM, không trả nguyên văn. */
  sepayApiTokenEnc: null,
  /** Webhook secret (spsk_…) để kiểm chữ ký — mã hoá AES-GCM. */
  sepayWebhookSecretEnc: null,
  /** How often the promo popup nags a visitor who has no credit (minutes). */
  promoReminderMinutes: 5,
  /** Snooze for visitors who do have credit (minutes). */
  promoCreditSnoozeMinutes: 1440,
  /**
   * Public model names shown to users (vendor names stay internal). Models that
   * are not listed here still get a fBuddy-style label when they come from a
   * known family (see `publicModelLabel`).
   */
  modelAliases: {
    "glm-4-flash": "fBuddy-4-Flash",
    "glm-4.5-air": "fBuddy-4.5-Air",
    "glm-4.5": "fBuddy-4.5",
    "glm-4.6": "fBuddy-4.6",
    "glm-4.7": "fBuddy-4.7",
    "glm-5.3-flash": "fBuddy-5.3-Flash",
    "glm-5.3": "fBuddy-5.3",
  },
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
