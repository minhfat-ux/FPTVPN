/**
 * Harness test cho flowdesk.
 *
 * PHẢI được import TRƯỚC mọi module `src/*`: ESM chạy file này trước (nó là
 * import đầu tiên), nên env đã sẵn sàng khi `config.js` đọc.
 *
 * Ở đây dựng luôn một `fbuddy.db` GIẢ (chỉ 2 bảng cần thiết: `users`,
 * `topup_orders`) để test việc đọc quyền mà không cần app thật.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DESK_SRC = path.join(HERE, "..", "src");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "flowdesk-test-"));
const dataDir = path.join(root, "desk");
const fbuddyDir = path.join(root, "fbuddy");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(fbuddyDir, { recursive: true });

export const TEST_SECRET = "test-desk-secret-0123456789-abcdefghij";
export const TEST_ADMIN_TOKEN = "test-admin-token-0123456789";
export const TEST_FBUDDY_DB = path.join(fbuddyDir, "fbuddy.db");

process.env.NODE_ENV = "test";
process.env.DESK_DATA_DIR = dataDir;
process.env.DESK_SECRET = TEST_SECRET;
process.env.DESK_ADMIN_TOKEN = TEST_ADMIN_TOKEN;
process.env.DESK_PORT = "0";
process.env.DESK_HOST = "127.0.0.1";
process.env.DESK_FBUDDY_DB = TEST_FBUDDY_DB;
process.env.DESK_CODE_TTL_DAYS = "1";
process.env.DESK_MAX_DEVICES_PER_CODE = "2";
process.env.DESK_SESSION_TTL_MIN = "45";
// Hạn mức nhỏ để test được nhánh "vượt hạn mức" mà không phải ghi dữ liệu khổng lồ.
// Phải đặt ở ĐÂY (trước mọi import `src/*`) vì `config.js` chốt giá trị lúc import.
process.env.DESK_MAX_STT_MINUTES_PER_MONTH = "1";
// Hạn mức nhỏ để test rate limit nhanh, không phải bắn hàng trăm request.
process.env.DESK_RATE_ACTIVATE_PER_HOUR = "5";
process.env.DESK_RATE_ACTIVATE_FAIL_PER_10MIN = "3";
process.env.DESK_RATE_SESSION_PER_HOUR = "1000";
process.env.DESK_RATE_ADMIN_PER_HOUR = "1000";

/** DB fBuddy giả — CHỈ chứa cột mà flowdesk thật sự đọc. */
export const fbuddy = new DatabaseSync(TEST_FBUDDY_DB);
fbuddy.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'user'
  );
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
    paid_at TEXT,
    confirmed_by TEXT,
    created_at TEXT NOT NULL
  );
`);

export function seedUser({ id, email, name = null, role = "user" }) {
  fbuddy
    .prepare("INSERT OR REPLACE INTO users (id, email, name, role) VALUES (?, ?, ?, ?)")
    .run(id, email, name, role);
  return id;
}

export function seedOrder({ id, userId, status = "pending", amountVnd = 50000, packageName = "Gói Pro", email = null }) {
  fbuddy
    .prepare(
      `INSERT OR REPLACE INTO topup_orders (id, user_id, email, package_name, tokens, amount_vnd, transfer_note, status, paid_at, confirmed_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      email,
      packageName,
      50000,
      amountVnd,
      `FBUDDY${id.slice(-6)}`,
      status,
      status === "paid" ? new Date().toISOString() : null,
      status === "paid" ? "telegram" : null,
      new Date().toISOString(),
    );
  return id;
}

let booted = null;

/** Boot service thật trên port ngẫu nhiên; trả `{ baseUrl, server }`. */
export async function bootDesk() {
  if (booted) return booted;
  const { startServer } = await import(pathToFileURL(path.join(DESK_SRC, "app.js")).href);
  const { server, url } = await startServer({ port: 0, host: "127.0.0.1" });
  booted = { baseUrl: url, server };
  return booted;
}

export async function closeDesk() {
  if (!booted) return;
  // WebSocket/keep-alive còn mở sẽ làm `close()` chờ mãi ⇒ cắt hết trước.
  booted.server.closeAllConnections?.();
  await new Promise((resolve) => booted.server.close(resolve));
  booted = null;
}

export { TEST_SECRET as SECRET, TEST_ADMIN_TOKEN as ADMIN_TOKEN };

/**
 * Gọi API. `ip` cho phép mỗi test dùng một IP riêng để rate limit không lẫn nhau.
 */
export async function api(method, endpoint, body = undefined, { token = null, admin = null, ip = "10.0.0.1" } = {}) {
  const { baseUrl } = await bootDesk();
  const headers = { "x-forwarded-for": ip };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (admin) headers["x-desk-admin-token"] = admin;
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text, json: safeJson(text), headers: response.headers };
}

export function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Tiện cho test: cấp mã qua route admin và trả mã gốc. */
export async function issueCodeViaAdmin({ userId, orderId = null, ip = "10.0.0.9" } = {}) {
  const res = await api("POST", "/v1/desktop/invitations", { userId, orderId }, { admin: TEST_ADMIN_TOKEN, ip });
  if (res.status !== 201) throw new Error(`cấp mã thất bại: ${res.status} ${res.text}`);
  return res.json;
}
