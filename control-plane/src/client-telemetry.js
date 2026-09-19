/**
 * Telemetry client → control plane (nền tảng cho vòng lặp AI tinh chỉnh băng thông).
 *
 * Vì sao: app đang ghi ra log dạng `bw: net=… measured=… declared up=… reason=…`,
 * `bw: probe …B/…ms -> …kbps`, `hy-udp:<port> … up=… down=…` nhưng số đó nằm chết trên máy
 * khách. Không có dữ liệu thật thì mọi tham số trong `BandwidthPolicy`/`BandwidthControl`
 * chỉ là phỏng đoán. Module này chuẩn hoá đúng những dòng log đó thành JSON, nhận qua
 * `POST /v1/client-telemetry` (KHÔNG cần đăng nhập) và lưu vào SQLite để agent/AI đọc rồi
 * sửa `bw_policy` trên server (xem `bw-policy.js`) mà không phải phát hành app mới.
 *
 * Quy tắc riêng tư (ép ở tầng validate, không chỉ ghi trong doc):
 *   - KHÔNG nhận SSID thô / MAC router thô: chỉ nhận `net_key_hash` (hex).
 *   - KHÔNG nhận token/credential/mật khẩu.
 *   - KHÔNG nhận nội dung traffic: không URL đã truy cập, không tên miền DNS đã hỏi, không body.
 *   - KHÔNG nhận IP dạng thô (`ip`, `exit_ip`, …): chỉ nhận `exit_ip_hash` (hex).
 *   Key vi phạm bị TỪ CHỐI cả request (400) — client sai thì biết ngay, chứ không âm thầm
 *   lưu dữ liệu nhạy cảm vào DB.
 */

import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Phiên bản schema telemetry (tăng khi đổi tên/bỏ field). */
export const TELEMETRY_SCHEMA_VERSION = 1;

/** Đường dẫn endpoint nhận telemetry. */
export const TELEMETRY_PATH = "/v1/client-telemetry";

/** Trần kích thước MỘT request (byte) — chặn payload rác/lạm dụng. */
export const TELEMETRY_MAX_BYTES = 32 * 1024;
/** Trần kích thước MỘT sự kiện khi gửi theo lô (byte). */
export const TELEMETRY_MAX_EVENT_BYTES = 8 * 1024;
/** Số sự kiện tối đa trong một request (client gom lô khi mạng chập chờn). */
export const TELEMETRY_MAX_EVENTS = 20;
/** Số ngày giữ dữ liệu trước khi xoá (xoay vòng). */
export const TELEMETRY_RETENTION_DAYS = 90;
/** Trần số dòng trong bảng — vượt thì xoá cũ nhất trước. */
export const TELEMETRY_MAX_ROWS = 2_000_000;
/** Bao nhiêu lần ghi thì chạy dọn dữ liệu cũ một lần (ngoài lần dọn lúc khởi động). */
export const TELEMETRY_PURGE_EVERY_INSERTS = 500;
/** Client được phép gửi sự kiện cũ nhất bao nhiêu ngày (gom lô khi offline). */
export const TELEMETRY_BACKFILL_DAYS = 7;

/** Hạn mức mặc định: sự kiện/phút. Đổi bằng env (xem README module ở docs). */
export const TELEMETRY_RATE_PER_IP_PER_MIN = 60;
export const TELEMETRY_RATE_PER_DEVICE_PER_MIN = 30;
export const TELEMETRY_RATE_GLOBAL_PER_MIN = 3000;

/** Nền tảng hợp lệ. */
export const TELEMETRY_PLATFORMS = Object.freeze(["android", "ios", "macos", "windows", "linux", "other"]);
/** Loại mạng hợp lệ. */
export const TELEMETRY_NET_TYPES = Object.freeze(["wifi", "cell", "ethernet", "other", "unknown"]);
/** Loại sự kiện: mẫu định kỳ | tổng kết phiên | kết quả probe | quyết định ramp. */
export const TELEMETRY_KINDS = Object.freeze(["sample", "session", "probe", "ramp", "summary"]);
/** Lý do chốt số khai — lấy đúng các giá trị app đang ghi ra log. */
export const TELEMETRY_REASONS = Object.freeze([
  "probe", "memory", "clamp", "profile", "ramp", "idle-reconnect", "loss-backoff", "other",
]);

/**
 * Key bị TỪ CHỐI (riêng tư/không cần thiết). So khớp không phân biệt hoa thường, ở mọi độ sâu.
 * Danh sách cố ý rộng: thà client báo lỗi 400 còn hơn lưu SSID/token của khách vào DB.
 */
export const TELEMETRY_FORBIDDEN_KEYS = Object.freeze([
  // danh tính mạng thô
  "ssid", "bssid", "net_key", "network_name", "wifi_name", "router_mac", "mac",
  // bí mật
  "token", "access_token", "refresh_token", "id_token", "jwt", "secret", "password",
  "passwd", "passphrase", "credential", "credentials", "authorization", "cookie", "api_key",
  // IP thô (chỉ nhận *_hash)
  "ip", "client_ip", "public_ip", "remote_ip", "exit_ip", "server_ip", "local_ip",
  // nội dung traffic
  "body", "content", "payload", "traffic", "dns_query", "dns_queries", "url", "urls",
  "host", "hosts", "sni", "http_headers", "headers", "user_agent",
]);

/** Cột của bảng `client_telemetry` — thứ tự này dùng cho cả INSERT. */
const COLUMNS = Object.freeze([
  "schema_version", "received_at", "created_at", "tz_offset_min",
  "device_id", "platform", "app_version", "model",
  "net_key_hash", "net_type", "rssi", "link_speed_kbps", "metered", "node_id",
  "measured_kbps", "declared_up_kbps", "declared_down_kbps",
  "effective_up_kbps", "effective_down_kbps", "reason", "transport", "ctx", "policy_revision",
  "rtt_ms", "loss_pct", "probe_bytes", "probe_ms", "exit_ip_hash",
  "session_id", "kind", "payload_json",
]);

const HEX_HASH_RE = /^[0-9a-f]{8,64}$/i;
const POLICY_REV_RE = /^[A-Za-z0-9._-]{1,16}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/;
const SHORT_TOKEN_RE = /^[A-Za-z0-9._:+-]{1,40}$/;
const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const APP_VERSION_RE = /^[A-Za-z0-9._+-]{1,40}$/;
const CTX_RE = /^[A-Za-z0-9 ._:-]{1,40}$/;
const MEASUREMENT_KEYS = Object.freeze([
  "measured_kbps", "declared_up_kbps", "declared_down_kbps",
  "effective_up_kbps", "effective_down_kbps", "probe_bytes", "probe_ms",
]);

// ------------------------------------------------------------------ helper kiểu dữ liệu

function text(value, { max = 64, pattern = null, strip = true } = {}) {
  if (value === null || value === undefined) return { value: null };
  if (typeof value !== "string") return { error: "not_a_string" };
  // Bỏ ký tự điều khiển: log của client có thể lẫn rác nhị phân.
  const trimmed = (strip ? value.replace(/[\u0000-\u001f\u007f]/g, "") : value).trim();
  if (!trimmed) return { value: null };
  if (trimmed.length > max) return { error: "too_long" };
  if (pattern && !pattern.test(trimmed)) return { error: "invalid_format" };
  return { value: trimmed };
}

function integer(value, { min = 0, max = 100_000_000 } = {}) {
  if (value === null || value === undefined) return { value: null };
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return { error: "not_a_number" };
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return { error: "out_of_range" };
  return { value: rounded };
}

function decimal(value, { min = 0, max = 100, digits = 2 } = {}) {
  if (value === null || value === undefined) return { value: null };
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return { error: "not_a_number" };
  if (n < min || n > max) return { error: "out_of_range" };
  return { value: Number(n.toFixed(digits)) };
}

function boolean(value) {
  if (value === null || value === undefined) return { value: null };
  if (typeof value === "boolean") return { value };
  if (typeof value === "number") return value === 0 || value === 1 ? { value: value === 1 } : { error: "not_a_boolean" };
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(v)) return { value: true };
    if (["0", "false", "no", "off"].includes(v)) return { value: false };
  }
  return { error: "not_a_boolean" };
}

/** Mọi key bị cấm xuất hiện trong object (duyệt đệ quy, giới hạn độ sâu). */
export function findForbiddenKeys(value, depth = 0, found = new Set()) {
  if (depth > 4 || !value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (TELEMETRY_FORBIDDEN_KEYS.includes(String(key).toLowerCase())) found.add(String(key));
    if (child && typeof child === "object") findForbiddenKeys(child, depth + 1, found);
  }
  return found;
}

/** Mốc ISO của client: nhận ISO 8601 hoặc epoch (giây/ms). */
function parseTimestamp(value, { now, backfillDays }) {
  if (value === null || value === undefined) return { value: new Date(now).toISOString() };
  let ms;
  if (typeof value === "number" && Number.isFinite(value)) {
    ms = value > 1e11 ? value : value * 1000;
  } else if (typeof value === "string" && value.trim() !== "") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && /^\d+(\.\d+)?$/.test(value.trim())) ms = asNumber > 1e11 ? asNumber : asNumber * 1000;
    else ms = Date.parse(value);
  }
  if (!Number.isFinite(ms)) return { error: "invalid_timestamp" };
  if (ms > now + 3600_000) return { error: "timestamp_in_future" };
  if (ms < now - backfillDays * 86_400_000) return { error: "timestamp_too_old" };
  return { value: new Date(ms).toISOString() };
}

// ------------------------------------------------------------------ validate

/**
 * Chuẩn hoá MỘT sự kiện telemetry.
 *
 * @param {unknown} raw body client gửi (1 object)
 * @param {{ now?: number, backfillDays?: number, maxEventBytes?: number }} [options]
 * @returns {{ ok: true, event: Record<string, unknown> } | { ok: false, errors: string[] }}
 */
export function validateTelemetryEvent(raw, {
  now = Date.now(),
  backfillDays = TELEMETRY_BACKFILL_DAYS,
  maxEventBytes = TELEMETRY_MAX_EVENT_BYTES,
} = {}) {
  if (raw === null || raw === undefined) return { ok: false, errors: ["missing_body"] };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["event_not_an_object"] };
  const forbidden = [...findForbiddenKeys(raw)];
  if (forbidden.length) return { ok: false, errors: forbidden.map((key) => `privacy_violation:${key}`) };

  let payloadJson;
  try {
    payloadJson = JSON.stringify(raw);
  } catch {
    return { ok: false, errors: ["not_serialisable"] };
  }
  if (payloadJson.length > maxEventBytes) return { ok: false, errors: ["event_too_large"] };

  const errors = [];
  const pick = (result, field) => {
    if (result.error) errors.push(`${field}:${result.error}`);
    return result.value ?? null;
  };

  // Phiên bản: thiếu thì coi như bản hiện tại; client MỚI HƠN server thì từ chối để không
  // lưu dữ liệu mà mình không hiểu.
  const versionRaw = raw.schema_version ?? TELEMETRY_SCHEMA_VERSION;
  const version = integer(versionRaw, { min: 1, max: 1000 });
  if (version.error || version.value === null) errors.push("schema_version:invalid");
  else if (version.value > TELEMETRY_SCHEMA_VERSION) errors.push("schema_version:unsupported");

  const deviceId = text(raw.device_id, { max: 64, pattern: DEVICE_ID_RE });
  if (deviceId.error || !deviceId.value) errors.push(`device_id:${deviceId.error ?? "missing"}`);

  const platformRaw = text(raw.platform, { max: 16 });
  const platform = platformRaw.value ? platformRaw.value.toLowerCase() : null;
  if (!platform) errors.push(`platform:${platformRaw.error ?? "missing"}`);
  else if (!TELEMETRY_PLATFORMS.includes(platform)) errors.push("platform:not_supported");

  const netTypeRaw = text(raw.net_type, { max: 16 });
  let netType = netTypeRaw.value ? netTypeRaw.value.toLowerCase() : null;
  if (netTypeRaw.error) errors.push(`net_type:${netTypeRaw.error}`);
  else if (netType && !TELEMETRY_NET_TYPES.includes(netType)) netType = "other";

  const reasonRaw = text(raw.reason, { max: 32 });
  const reason = reasonRaw.value
    ? (TELEMETRY_REASONS.includes(reasonRaw.value.toLowerCase()) ? reasonRaw.value.toLowerCase() : "other")
    : null;

  const kindRaw = text(raw.kind, { max: 16 });
  let kind = kindRaw.value ? kindRaw.value.toLowerCase() : "sample";
  if (kindRaw.error) errors.push(`kind:${kindRaw.error}`);
  else if (!TELEMETRY_KINDS.includes(kind)) kind = "sample";

  const event = {
    schema_version: version.value ?? TELEMETRY_SCHEMA_VERSION,
    created_at: pick(parseTimestamp(raw.created_at ?? raw.ts ?? raw.time, { now, backfillDays }), "created_at"),
    tz_offset_min: pick(integer(raw.tz_offset_min, { min: -900, max: 900 }), "tz_offset_min") ?? 0,
    device_id: deviceId.value,
    platform,
    app_version: pick(text(raw.app_version, { max: 40, pattern: APP_VERSION_RE }), "app_version"),
    model: pick(text(raw.model, { max: 64 }), "model"),
    net_key_hash: pick(text(raw.net_key_hash, { max: 64, pattern: HEX_HASH_RE }), "net_key_hash"),
    net_type: netType,
    rssi: pick(integer(raw.rssi, { min: -120, max: 0 }), "rssi"),
    link_speed_kbps: pick(integer(raw.link_speed_kbps, { min: 0, max: 100_000_000 }), "link_speed_kbps"),
    metered: pick(boolean(raw.metered), "metered"),
    node_id: pick(text(raw.node_id, { max: 40, pattern: SHORT_TOKEN_RE }), "node_id"),
    measured_kbps: pick(integer(raw.measured_kbps), "measured_kbps"),
    declared_up_kbps: pick(integer(raw.declared_up_kbps), "declared_up_kbps"),
    declared_down_kbps: pick(integer(raw.declared_down_kbps), "declared_down_kbps"),
    effective_up_kbps: pick(integer(raw.effective_up_kbps), "effective_up_kbps"),
    effective_down_kbps: pick(integer(raw.effective_down_kbps), "effective_down_kbps"),
    reason,
    transport: pick(text(raw.transport, { max: 40, pattern: SHORT_TOKEN_RE }), "transport"),
    ctx: pick(text(raw.ctx, { max: 40, pattern: CTX_RE }), "ctx"),
    // Revision của bw_policy mà client đang chạy (rỗng = client chưa đọc bw_policy) — nhờ nó
    // mới so được "trước/sau khi đổi tham số" trên chính dữ liệu thật.
    policy_revision: pick(text(raw.policy_revision, { max: 16, pattern: POLICY_REV_RE }), "policy_revision"),
    rtt_ms: pick(integer(raw.rtt_ms, { min: 0, max: 60_000 }), "rtt_ms"),
    loss_pct: pick(decimal(raw.loss_pct, { min: 0, max: 100 }), "loss_pct"),
    probe_bytes: pick(integer(raw.probe_bytes, { min: 0, max: 1_000_000_000 }), "probe_bytes"),
    probe_ms: pick(integer(raw.probe_ms, { min: 0, max: 600_000 }), "probe_ms"),
    exit_ip_hash: pick(text(raw.exit_ip_hash, { max: 64, pattern: HEX_HASH_RE }), "exit_ip_hash"),
    session_id: pick(text(raw.session_id, { max: 64, pattern: SESSION_ID_RE }), "session_id"),
    kind,
    payload_json: payloadJson,
  };

  // Chống "ping rỗng": phải có ít nhất một số đo, nếu không thì không có gì để học.
  if (!MEASUREMENT_KEYS.some((key) => event[key] !== null)) errors.push("no_measurement");

  if (errors.length) return { ok: false, errors };
  return { ok: true, event };
}

/**
 * Tách body thành danh sách sự kiện: nhận 1 object, mảng object, hoặc `{ events: [...] }`.
 * @returns {{ ok: true, events: unknown[] } | { ok: false, error: string }}
 */
export function splitTelemetryBody(body, { maxEvents = TELEMETRY_MAX_EVENTS } = {}) {
  let events;
  if (Array.isArray(body)) events = body;
  else if (body && typeof body === "object" && Array.isArray(body.events)) events = body.events;
  else events = [body];
  if (!events.length) return { ok: false, error: "empty_batch" };
  if (events.length > maxEvents) return { ok: false, error: "too_many_events" };
  return { ok: true, events };
}

// ------------------------------------------------------------------ rate limit

/**
 * Cửa sổ trượt đếm theo key, có trần số key để không phình bộ nhớ khi bị dội key rác.
 * @param {{ limit: number, windowMs?: number, maxKeys?: number }} options
 */
export function createRateLimiter({ limit, windowMs = 60_000, maxKeys = 20_000 }) {
  const hits = new Map();
  const evictOldest = () => {
    const oldest = hits.keys().next();
    if (!oldest.done) hits.delete(oldest.value);
  };
  return {
    limit,
    windowMs,
    /**
     * @param {string} key
     * @param {{ now?: number, cost?: number }} [options]
     * @returns {{ allowed: boolean, retryAfterS: number }}
     */
    check(key, { now = Date.now(), cost = 1 } = {}) {
      if (!limit || limit <= 0) return { allowed: true, retryAfterS: 0 };
      let list = hits.get(key);
      if (!list) {
        while (hits.size >= maxKeys) evictOldest();
        list = [];
        hits.set(key, list);
      }
      const cutoff = now - windowMs;
      let drop = 0;
      while (drop < list.length && list[drop] <= cutoff) drop++;
      if (drop) list.splice(0, drop);
      if (list.length + cost > limit) {
        const oldest = list[0] ?? now;
        return { allowed: false, retryAfterS: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
      }
      for (let i = 0; i < cost; i++) list.push(now);
      return { allowed: true, retryAfterS: 0 };
    },
    /** Số key đang theo dõi (test + chẩn đoán). */
    size: () => hits.size,
    reset: () => hits.clear(),
  };
}

// ------------------------------------------------------------------ store SQLite

/**
 * Bảng `client_telemetry` + chỉ mục `(platform, created_at)`.
 *
 * Xoay vòng dữ liệu (2 tầng, chạy lúc khởi động và mỗi [TELEMETRY_PURGE_EVERY_INSERTS] lần ghi):
 *   1. theo THỜI GIAN: xoá dòng cũ hơn `retentionDays` ngày;
 *   2. theo SỐ DÒNG: nếu vượt `maxRows` thì xoá cũ nhất cho tới khi bằng `maxRows`.
 * Nhờ vậy bảng không phình vô hạn dù client gửi bao nhiêu.
 */
export class ClientTelemetryStore {
  constructor(dbPath, {
    retentionDays = TELEMETRY_RETENTION_DAYS,
    maxRows = TELEMETRY_MAX_ROWS,
    purgeEveryInserts = TELEMETRY_PURGE_EVERY_INSERTS,
    log = console,
  } = {}) {
    this.dbPath = dbPath;
    this.retentionDays = retentionDays;
    this.maxRows = maxRows;
    this.purgeEveryInserts = purgeEveryInserts;
    this.log = log;
    this.insertsSincePurge = 0;
    this.purged = { deletedOld: 0, deletedOverflow: 0 };
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    try {
      this.db.exec("PRAGMA journal_mode = WAL");
      this.db.exec("PRAGMA busy_timeout = 5000");
    } catch {
      // WAL không cần thiết cho đúng đắn — exFAT/ổ lạ có thể từ chối, bỏ qua.
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS client_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schema_version INTEGER NOT NULL,
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      tz_offset_min INTEGER NOT NULL DEFAULT 0,
      device_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      app_version TEXT,
      model TEXT,
      net_key_hash TEXT,
      net_type TEXT,
      rssi INTEGER,
      link_speed_kbps INTEGER,
      metered INTEGER,
      node_id TEXT,
      measured_kbps INTEGER,
      declared_up_kbps INTEGER,
      declared_down_kbps INTEGER,
      effective_up_kbps INTEGER,
      effective_down_kbps INTEGER,
      reason TEXT,
      transport TEXT,
      ctx TEXT,
      policy_revision TEXT,
      rtt_ms INTEGER,
      loss_pct REAL,
      probe_bytes INTEGER,
      probe_ms INTEGER,
      exit_ip_hash TEXT,
      session_id TEXT,
      kind TEXT NOT NULL DEFAULT 'sample',
      payload_json TEXT NOT NULL
    )`);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_client_telemetry_platform_created ON client_telemetry (platform, created_at DESC)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_client_telemetry_device_created ON client_telemetry (device_id, created_at DESC)");
    this.insertSql = `INSERT INTO client_telemetry (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`;
    this.insertStatement = this.db.prepare(this.insertSql);
    this.purge();
  }

  static get columns() {
    return COLUMNS;
  }

  /** Ghi một sự kiện ĐÃ chuẩn hoá (qua [validateTelemetryEvent]). */
  insert(event, { receivedAt = new Date().toISOString() } = {}) {
    this.insertStatement.run(...COLUMNS.map((column) => valueFor(event, column, receivedAt)));
    this.afterInsert();
  }

  /** Ghi cả lô trong MỘT transaction (nhanh + không để lô nửa vời). */
  insertMany(events, { receivedAt = new Date().toISOString() } = {}) {
    if (!events.length) return 0;
    this.db.exec("BEGIN");
    try {
      for (const event of events) {
        this.insertStatement.run(...COLUMNS.map((column) => valueFor(event, column, receivedAt)));
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    this.afterInsert(events.length);
    return events.length;
  }

  afterInsert(count = 1) {
    this.insertsSincePurge += count;
    if (this.purgeEveryInserts > 0 && this.insertsSincePurge >= this.purgeEveryInserts) this.purge();
  }

  count() {
    return Number(this.db.prepare("SELECT COUNT(*) AS n FROM client_telemetry").get().n);
  }

  /** N dòng mới nhất (test + soi tay khi debug). */
  recent(limit = 20) {
    return this.db.prepare(`SELECT ${COLUMNS.join(", ")} FROM client_telemetry ORDER BY id DESC LIMIT ?`).all(Math.max(1, Math.floor(limit)));
  }

  /**
   * Dọn dữ liệu: theo tuổi rồi theo số dòng.
   * @returns {{ deletedOld: number, deletedOverflow: number }}
   */
  purge({ now = Date.now() } = {}) {
    const cutoff = new Date(now - this.retentionDays * 86_400_000).toISOString();
    const old = this.db.prepare("DELETE FROM client_telemetry WHERE created_at < ?").run(cutoff);
    let overflow = { changes: 0 };
    if (this.maxRows > 0) {
      overflow = this.db.prepare(
        "DELETE FROM client_telemetry WHERE id IN (SELECT id FROM client_telemetry ORDER BY id DESC LIMIT -1 OFFSET ?)",
      ).run(this.maxRows);
    }
    this.purged = { deletedOld: Number(old.changes ?? 0), deletedOverflow: Number(overflow.changes ?? 0) };
    this.insertsSincePurge = 0;
    if (this.purged.deletedOld || this.purged.deletedOverflow) {
      this.log?.log?.(`client-telemetry: dọn ${this.purged.deletedOld} dòng quá ${this.retentionDays} ngày, ${this.purged.deletedOverflow} dòng vượt trần ${this.maxRows}`);
    }
    return this.purged;
  }

  close() {
    try {
      this.db.close();
    } catch {
      // đã đóng rồi thì thôi
    }
  }
}

function valueFor(event, column, receivedAt) {
  if (column === "received_at") return receivedAt;
  const value = event[column];
  if (column === "metered") return value === null || value === undefined ? null : value ? 1 : 0;
  return value === undefined ? null : value;
}

// ------------------------------------------------------------------ route

function clientIpOf(req) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return req.ip || forwarded || req.socket?.remoteAddress || "unknown";
}

function envNumber(env, name, fallback) {
  const raw = env?.[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Đăng ký `POST /v1/client-telemetry` vào app Express.
 *
 * KHÔNG cần đăng nhập (app chưa có phiên khi cần gửi số liệu), nên hàm này phải được gọi
 * TRƯỚC middleware AUTH_TOKEN toàn cục trong `index.js` — đó là lý do duy nhất nó nằm sớm.
 * Bù lại nó tự chịu trách nhiệm chống lạm dụng: trần byte, trần số sự kiện, validate schema,
 * rate-limit 3 tầng (IP / thiết bị / toàn hệ) và trả 204 không body khi thành công.
 *
 * @param {import("express").Express} app
 * @param {{ dbPath?: string, env?: Record<string, string|undefined>, log?: Console, now?: () => number, maxBytes?: number, maxEvents?: number }} [options]
 * @returns {{ store: ClientTelemetryStore, limiters: Record<string, ReturnType<typeof createRateLimiter>>, path: string, enabled: boolean }}
 */
export function registerClientTelemetry(app, {
  dbPath = ":memory:",
  env = process.env,
  log = console,
  now = () => Date.now(),
  maxBytes = TELEMETRY_MAX_BYTES,
  maxEvents = TELEMETRY_MAX_EVENTS,
  retentionDays = envNumber(env, "CLIENT_TELEMETRY_RETENTION_DAYS", TELEMETRY_RETENTION_DAYS),
  maxRows = envNumber(env, "CLIENT_TELEMETRY_MAX_ROWS", TELEMETRY_MAX_ROWS),
} = {}) {
  // Công tắc tắt: vẫn trả 204 để client không phải đổi gì, nhưng không ghi gì cả.
  const enabled = String(env?.CLIENT_TELEMETRY ?? "1") !== "0";
  const store = new ClientTelemetryStore(dbPath, { retentionDays, maxRows, log });
  const limiters = {
    ip: createRateLimiter({ limit: envNumber(env, "CLIENT_TELEMETRY_PER_IP_PER_MIN", TELEMETRY_RATE_PER_IP_PER_MIN) }),
    device: createRateLimiter({ limit: envNumber(env, "CLIENT_TELEMETRY_PER_DEVICE_PER_MIN", TELEMETRY_RATE_PER_DEVICE_PER_MIN) }),
    global: createRateLimiter({ limit: envNumber(env, "CLIENT_TELEMETRY_GLOBAL_PER_MIN", TELEMETRY_RATE_GLOBAL_PER_MIN) }),
  };

  const router = express.Router();
  router.post(TELEMETRY_PATH, (req, res) => {
    try {
      if (!enabled) return res.status(204).end();
      const ts = now();
      const declaredLength = Number(req.headers["content-length"] ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        return res.status(413).json({ error: "payload_too_large", max_bytes: maxBytes });
      }
      const rawLength = req.rawBody ? req.rawBody.length : JSON.stringify(req.body ?? null).length;
      if (rawLength > maxBytes) {
        return res.status(413).json({ error: "payload_too_large", max_bytes: maxBytes });
      }
      const split = splitTelemetryBody(req.body, { maxEvents });
      if (!split.ok) return res.status(400).json({ error: split.error, max_events: maxEvents });

      const global = limiters.global.check("global", { now: ts, cost: split.events.length });
      if (!global.allowed) return rateLimited(res, global.retryAfterS);

      const events = [];
      const errors = [];
      split.events.forEach((rawEvent, index) => {
        const result = validateTelemetryEvent(rawEvent, { now: ts });
        if (result.ok) events.push(result.event);
        else errors.push({ index, errors: result.errors });
      });
      if (errors.length) return res.status(400).json({ error: "invalid_telemetry", details: errors });

      const ip = clientIpOf(req);
      const deviceIds = [...new Set(events.map((event) => event.device_id))];
      const ipCheck = limiters.ip.check(ip, { now: ts, cost: events.length });
      if (!ipCheck.allowed) return rateLimited(res, ipCheck.retryAfterS);
      for (const deviceId of deviceIds) {
        const perDevice = events.filter((event) => event.device_id === deviceId).length;
        const deviceCheck = limiters.device.check(deviceId, { now: ts, cost: perDevice });
        if (!deviceCheck.allowed) return rateLimited(res, deviceCheck.retryAfterS);
      }

      store.insertMany(events, { receivedAt: new Date(ts).toISOString() });
      return res.status(204).end();
    } catch (err) {
      log?.error?.(`POST ${TELEMETRY_PATH} failed:`, err);
      return res.status(500).json({ error: "internal_error" });
    }
  });

  app.use(router);
  return { store, limiters, path: TELEMETRY_PATH, enabled };
}

function rateLimited(res, retryAfterS) {
  res.set("Retry-After", String(retryAfterS));
  return res.status(429).json({ error: "rate_limited", retry_after_s: retryAfterS });
}

/** Tiện cho client/tài liệu: hash ẩn danh (hex) của SSID/MAC/IP — KHÔNG gửi giá trị thô. */
export function anonymisedHash(value, salt = "") {
  return crypto.createHash("sha256").update(`${salt}${String(value)}`).digest("hex");
}

/** Xoay device_id: client tự đổi id ẩn danh theo chu kỳ — server không giữ bản đồ id↔máy. */
export function rotateDeviceId(prefix = "dev") {
  return `${prefix}-${crypto.randomUUID()}`;
}
