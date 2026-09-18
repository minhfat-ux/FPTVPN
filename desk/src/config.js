import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Cấu hình của flowdesk — service RIÊNG cho bản Windows.
 *
 * Tách khỏi fBuddy có chủ đích: tiến trình riêng, port riêng, tiền tố env riêng
 * (`DESK_*`), DB riêng, key Soniox/OpenRouter riêng. Nhờ vậy xoay key hoặc làm
 * hỏng service này không đụng tới bản Mac (`api.meetflowai.site`) đang chạy tốt.
 * Service chỉ ĐỌC `fbuddy.db` để biết đơn nào đã trả tiền, không bao giờ ghi vào đó.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** `.../desk` */
export const DESK_ROOT = path.resolve(HERE, "..");
/** Repo fBuddy (chứa cả `server/`, `web/`, `deploy/`). */
export const REPO_ROOT = path.resolve(DESK_ROOT, "..");

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

const isProduction = (process.env.NODE_ENV ?? "development") === "production";

const dataDir = process.env.DESK_DATA_DIR
  ? path.resolve(process.env.DESK_DATA_DIR)
  : isProduction
    ? "/var/lib/flowdesk"
    : path.join(REPO_ROOT, "data", "flowdesk");

/**
 * Khoá ký token phiên + HMAC của mã kích hoạt. Ở production BẮT BUỘC có env
 * (systemd drop-in); nếu thiếu thì service không khởi động — thà chết còn hơn
 * chạy với khoá mặc định ai cũng đoán được.
 */
function resolveSecret() {
  const fromEnv = process.env.DESK_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (isProduction) throw new Error("DESK_SECRET là bắt buộc ở production (>= 32 ký tự)");
  fs.mkdirSync(dataDir, { recursive: true });
  const devFile = path.join(dataDir, ".dev-secret");
  if (fs.existsSync(devFile)) return fs.readFileSync(devFile, "utf8").trim();
  const generated = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(devFile, generated, { mode: 0o600 });
  return generated;
}

/**
 * Token admin để cấp/thu hồi mã kích hoạt (fBuddy gọi sang khi đơn thành `paid`).
 * Không đặt ở production ⇒ chết; ở dev ⇒ các route admin trả 503 để không bao
 * giờ có route admin mở công khai.
 */
function resolveAdminToken() {
  const fromEnv = process.env.DESK_ADMIN_TOKEN;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (isProduction) throw new Error("DESK_ADMIN_TOKEN là bắt buộc ở production (>= 16 ký tự)");
  return null;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProduction,
  version: "0.1.0",
  serviceName: "flowdesk",

  host: process.env.DESK_HOST ?? "127.0.0.1",
  port: envInt("DESK_PORT", 7791),
  publicUrl: (process.env.DESK_PUBLIC_URL ?? "https://desk.meetflowai.site").replace(/\/+$/, ""),
  trustProxy: envBool("DESK_TRUST_PROXY", true),

  dataDir,
  dbFile: path.join(dataDir, "desk.db"),
  /** DB của fBuddy — CHỈ ĐỌC. Đây là nguồn sự thật duy nhất cho quyền sử dụng. */
  fbuddyDbFile: process.env.DESK_FBUDDY_DB
    ? path.resolve(process.env.DESK_FBUDDY_DB)
    : isProduction
      ? "/var/lib/fbuddy/fbuddy.db"
      : path.join(REPO_ROOT, "data", "fbuddy.db"),

  secret: resolveSecret(),
  adminToken: resolveAdminToken(),

  /** Mã kích hoạt sống bao lâu (ngày) kể từ lúc phát. */
  codeTtlDays: envInt("DESK_CODE_TTL_DAYS", 30),
  /** Số thiết bị tối đa dùng chung một mã (cài lại máy cũ vẫn tính là 1). */
  maxDevicesPerCode: envInt("DESK_MAX_DEVICES_PER_CODE", 3),
  /** Token phiên ngắn hạn — hết hạn thì app tự gia hạn bằng /session. */
  sessionTtlMin: envInt("DESK_SESSION_TTL_MIN", 45),
  /** Hạn mức audio mỗi tháng cho mỗi user (phút) — dùng ở lớp WS proxy. */
  maxSttMinutesPerMonth: envInt("DESK_MAX_STT_MINUTES_PER_MONTH", 600),

  maxBodyBytes: envInt("DESK_MAX_BODY_BYTES", 1024 * 1024),

  /**
   * Key nhà cung cấp của RIÊNG bản Windows. Đọc qua accessor (không nằm trong
   * object `config` xuất ra) để không ai vô tình log/in ra.
   *
   * URL của nhà cung cấp cũng đọc qua accessor (không chốt lúc import) để test
   * trỏ được sang server giả mà không phụ thuộc thứ tự import.
   */
  sonioxModel: process.env.DESK_SONIOX_MODEL ?? "stt-rt-v5",
  openrouterModel: process.env.DESK_OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash",
  /** Trần ký tự transcript cho một lần tóm tắt (chống đốt tiền bằng payload khổng lồ). */
  maxSummaryChars: envInt("DESK_MAX_SUMMARY_CHARS", 200_000),
  /** Trần thời lượng một phiên STT (phút) — chặn phiên treo cả ngày. */
  maxSttSessionMinutes: envInt("DESK_MAX_STT_SESSION_MINUTES", 240),
  /** Timeout gọi OpenRouter (ms). */
  summaryTimeoutMs: envInt("DESK_SUMMARY_TIMEOUT_MS", 120_000),

  /** Rate limit (đếm theo IP, cửa sổ trượt trong bộ nhớ). */
  rateActivatePerHourPerIp: envInt("DESK_RATE_ACTIVATE_PER_HOUR", 20),
  rateActivateFailPerTenMinPerIp: envInt("DESK_RATE_ACTIVATE_FAIL_PER_10MIN", 8),
  rateSessionPerHour: envInt("DESK_RATE_SESSION_PER_HOUR", 240),
  rateAdminPerHour: envInt("DESK_RATE_ADMIN_PER_HOUR", 120),
};

export function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

/**
 * Key nhà cung cấp — chỉ đọc từ env, không bao giờ trả ra client, không log.
 * Trả `null` khi chưa cấu hình để lớp gọi tự quyết định (503/close).
 */
export function sonioxKey() {
  return String(process.env.DESK_SONIOX_API_KEY ?? "").trim() || null;
}

export function openrouterKey() {
  return String(process.env.DESK_OPENROUTER_API_KEY ?? "").trim() || null;
}

/** Endpoint WebSocket của Soniox (đọc env mỗi lần gọi). */
export function sonioxWsUrl() {
  return String(process.env.DESK_SONIOX_WS ?? "wss://stt-rt.soniox.com/transcribe-websocket").trim();
}

/** Endpoint chat-completions của OpenRouter (đọc env mỗi lần gọi). */
export function openrouterUrl() {
  return String(process.env.DESK_OPENROUTER_URL ?? "https://openrouter.ai/api/v1/chat/completions").trim();
}
