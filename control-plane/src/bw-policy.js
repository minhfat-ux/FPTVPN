/**
 * bw_policy — khối tham số chính sách băng thông mà control plane phát xuống client.
 *
 * Vì sao cần: ngưỡng ramp, hệ số tăng/giảm, cửa sổ quan sát, trần/sàn, URL probe hiện đang
 * HARD-CODE trong app (Android: `vpn/BandwidthMemory.kt` + `object BandwidthPolicy`;
 * iOS: `PrivateVPNPacketTunnel/HysteriaBandwidthControl.swift`), nên mỗi lần tinh chỉnh là
 * một lần phát hành app mới. Khối này đưa đúng các hằng số đó lên server: AI/agent đọc
 * telemetry (`client-telemetry.js`) rồi sửa tham số trên server (bảng `app_config` hoặc env)
 * là client lượt sau nhận giá trị mới qua `/v1/bootstrap` + `/v1/nodes` — không cần build lại app.
 *
 * Nguyên tắc an toàn: **giá trị mặc định ở đây = ĐÚNG hằng số đang chạy trong app**, nên
 * client chưa đọc field `bw_policy` thì hành vi không đổi, và bản build cũ cũng bỏ qua field
 * này (kotlinx.serialization `ignoreUnknownKeys = true`, Swift decode chỉ lấy key nó biết).
 */

import crypto from "node:crypto";

/** Phiên bản schema của khối `bw_policy` (tăng khi đổi tên/bỏ field). */
export const BW_POLICY_SCHEMA_VERSION = 1;

/** Khoá trong bảng `app_config` chứa JSON override — admin sửa được, KHÔNG cần deploy. */
export const BW_POLICY_CONFIG_KEY = "bw_policy";

/** Env chứa JSON override cho cả khối (mức triển khai, thắng `app_config`). */
export const BW_POLICY_ENV_JSON = "BW_POLICY_JSON";

/** Tiền tố env cho TỪNG tham số, ví dụ `BW_POLICY_RAMP_UP_FACTOR=1.4` (thắng cả 2 lớp trên). */
export const BW_POLICY_ENV_PREFIX = "BW_POLICY";

/** Field meta của payload — không được trùng tên tham số trong [BW_POLICY_SPEC]. */
export const BW_POLICY_META_KEYS = Object.freeze([
  "schema_version",
  "revision",
  "generated_at",
  "overridden_keys",
]);

/**
 * Bảng tham số: nguồn sự thật duy nhất cho default | kiểu | khoảng hợp lệ.
 *
 * type: "num" | "int" | "bool" | "str" | "enum"; với "str" có thể thêm `pattern`.
 * def : giá trị app đang dùng (đổi ở đây là đổi hành vi mặc định của MỌI client).
 */
export const BW_POLICY_SPEC = Object.freeze({
  // ---- ramp (iOS HysteriaBandwidthControl) -------------------------------------------
  ramp_up_factor: { type: "num", def: 1.25, min: 1, max: 4, doc: "×1,25 mỗi bậc ramp khi đỉnh vượt số khai ≥15%" },
  ramp_up_factor_saturated: { type: "num", def: 1.5, min: 1, max: 4, doc: "×1,5 khi dùng hết ≥90% số khai (bão hoà rõ)" },
  ramp_headroom_ratio: { type: "num", def: 1.15, min: 1, max: 4, doc: "đỉnh trượt vượt số khai ≥15% ⇒ còn dư" },
  ramp_saturated_ratio: { type: "num", def: 0.85, min: 0, max: 1, doc: "dùng hết ≥85% số khai ⇒ chạm trần" },
  ramp_saturated_strong_ratio: { type: "num", def: 0.9, min: 0, max: 1, doc: "≥90% ⇒ tăng mạnh hơn một bậc" },
  loss_backoff_factor: { type: "num", def: 0.7, min: 0.1, max: 1, doc: "mất gói ⇒ hạ ×0,7" },
  peak_window_s: { type: "num", def: 10, min: 1, max: 120, doc: "cửa sổ đỉnh trượt (giây)" },
  ramp_min_observed_s: { type: "num", def: 10, min: 1, max: 600, doc: "phải bão hoà liên tục ngần này mới tăng" },
  loss_backoff_min_observed_s: { type: "num", def: 5, min: 1, max: 600, doc: "mất gói liên tục ngần này mới hạ" },
  idle_before_change_s: { type: "num", def: 2, min: 0, max: 60, doc: "tunnel rảnh ngần này mới dựng lại transport" },
  busy_bytes_per_second: { type: "int", def: 2000, min: 0, max: 1000000, doc: "dưới mức này coi là tunnel rảnh" },
  min_trusted_measured_kbps: { type: "int", def: 5000, min: 0, max: 1000000, doc: "dưới mức này số đo chưa đủ tin để TĂNG" },
  memory_freshness_s: { type: "int", def: 2592000, min: 0, max: 31536000, doc: "bộ nhớ theo mạng quá cũ thì bỏ (30 ngày)" },
  max_remembered_networks: { type: "int", def: 32, min: 1, max: 1024, doc: "trần số mạng nhớ được" },
  memory_write_delta_kbps: { type: "int", def: 2000, min: 0, max: 1000000, doc: "chỉ ghi bộ nhớ khi đỉnh đổi đủ nhiều" },
  ramp_rebuild_max_attempts: { type: "int", def: 5, min: 0, max: 50, doc: "trần số lần dựng lại transport vì ramp trong 1 phiên" },
  ramp_transport_retries: { type: "int", def: 4, min: 0, max: 20, doc: "số lần thử dựng lại transport" },
  ramp_transport_retry_delay_ms: { type: "int", def: 300, min: 0, max: 5000, doc: "chờ giữa hai lần thử (ms)" },
  ramp_rebuild_mode: { type: "enum", def: "client-default", values: ["client-default", "on", "off"], doc: "cho phép dựng lại transport giữa phiên; client-default = theo nền tảng" },

  // ---- chốt số khai (Android BandwidthPolicy) -----------------------------------------
  declare_ratio_pct: { type: "int", def: 85, min: 10, max: 100, doc: "khai 85% số đo (chừa đầu cho tunnel/relay)" },
  jumpup_pct: { type: "int", def: 150, min: 100, max: 1000, doc: "đo ≥150% số khai ⇒ nhảy lên theo số đo" },
  saturated_pct: { type: "int", def: 95, min: 10, max: 1000, doc: "95–150% ⇒ dò lên 15%" },
  deadband_pct: { type: "int", def: 80, min: 10, max: 1000, doc: "80–95% ⇒ giữ nguyên (dải chết chống dao động)" },
  explore_pct: { type: "int", def: 115, min: 100, max: 1000, doc: "bước dò lên khi đường còn dư" },
  damping_pct: { type: "int", def: 60, min: 1, max: 100, doc: "giảm xóc: mẫu tụt sâu chỉ kéo xuống còn 60% mốc cũ" },
  floor_up_kbps: { type: "int", def: 500, min: 0, max: 100000, doc: "sàn chiều lên" },
  floor_down_kbps: { type: "int", def: 1000, min: 0, max: 100000, doc: "sàn chiều xuống" },
  ceiling_max_kbps: { type: "int", def: 10000000, min: 1000, max: 100000000, doc: "trần cứng của mọi số khai (chặn số rác)" },
  ceiling_min_kbps: { type: "int", def: 500, min: 0, max: 1000000, doc: "dưới mức này thà về 0 để dùng CC chuẩn" },

  // ---- nấc tĩnh (Android Config.kt) ---------------------------------------------------
  static_up_kbps: { type: "int", def: 30000, min: 100, max: 100000000, doc: "nấc tĩnh chiều lên (unmetered)" },
  static_down_kbps: { type: "int", def: 100000, min: 100, max: 100000000, doc: "nấc tĩnh chiều xuống (unmetered)" },
  mobile_up_kbps: { type: "int", def: 8000, min: 100, max: 100000000, doc: "nấc tĩnh chiều lên (metered)" },
  mobile_down_kbps: { type: "int", def: 12000, min: 100, max: 100000000, doc: "nấc tĩnh chiều xuống (metered)" },

  // ---- phép đo qua tunnel -------------------------------------------------------------
  probe_url: { type: "str", def: "https://speed.cloudflare.com/__down?bytes=4000000", pattern: /^https?:\/\/[^\s]+$/, doc: "URL đo goodput qua tunnel" },
  probe_max_ms: { type: "int", def: 3000, min: 100, max: 600000, doc: "trần thời gian đọc dữ liệu (ms)" },
  probe_bytes: { type: "int", def: 4000000, min: 0, max: 1000000000, doc: "trần byte mỗi phép đo" },
  probe_bytes_metered: { type: "int", def: 1500000, min: 0, max: 1000000000, doc: "trần byte khi mạng tính phí" },
  probe_delay_ms: { type: "int", def: 1200, min: 0, max: 60000, doc: "chờ trước khi đo cho tunnel kịp mở cửa sổ" },
  probe_min_interval_ms: { type: "int", def: 180000, min: 0, max: 86400000, doc: "không đo lại trong khoảng này (đỡ tốn dữ liệu)" },
  probe_min_bytes: { type: "int", def: 200000, min: 0, max: 1000000000, doc: "dưới mức này phép đo vô nghĩa" },
  probe_min_ms: { type: "int", def: 400, min: 1, max: 60000, doc: "dưới mức này phép đo vô nghĩa" },
  probe_connect_timeout_ms: { type: "int", def: 2000, min: 100, max: 60000, doc: "trần bắt tay HTTP của phép đo" },

  // ---- trần vật lý Wi-Fi (theo RSSI) --------------------------------------------------
  wifi_rssi_good_dbm: { type: "int", def: -55, min: -120, max: 0, doc: "ngưỡng RSSI tốt" },
  wifi_rssi_fair_dbm: { type: "int", def: -67, min: -120, max: 0, doc: "ngưỡng RSSI khá" },
  wifi_rssi_weak_dbm: { type: "int", def: -75, min: -120, max: 0, doc: "ngưỡng RSSI yếu" },
  wifi_ceiling_good_pct: { type: "int", def: 45, min: 0, max: 100, doc: "trần = linkSpeed × 45% khi RSSI tốt" },
  wifi_ceiling_fair_pct: { type: "int", def: 35, min: 0, max: 100, doc: "trần = linkSpeed × 35% khi RSSI khá" },
  wifi_ceiling_weak_pct: { type: "int", def: 25, min: 0, max: 100, doc: "trần = linkSpeed × 25% khi RSSI yếu" },
  wifi_ceiling_poor_pct: { type: "int", def: 15, min: 0, max: 100, doc: "trần = linkSpeed × 15% khi RSSI rất yếu" },

  // ---- trần vật lý mạng di động -------------------------------------------------------
  cell_ceiling_5g_kbps: { type: "int", def: 200000, min: 0, max: 100000000, doc: "trần cho 5G NR" },
  cell_ceiling_lte_kbps: { type: "int", def: 50000, min: 0, max: 100000000, doc: "trần cho LTE" },
  cell_ceiling_hspa_kbps: { type: "int", def: 10000, min: 0, max: 100000000, doc: "trần cho HSPA/UMTS" },
  cell_ceiling_default_kbps: { type: "int", def: 20000, min: 0, max: 100000000, doc: "trần khi không đọc được loại mạng" },

  // ---- dấu hiệu mất gói trên iOS (đếm gói utun) ---------------------------------------
  loss_min_packets_per_sample: { type: "int", def: 20, min: 1, max: 1000000, doc: "mẫu phải có ≥20 gói ra mới xét" },
  loss_inbound_divisor: { type: "int", def: 8, min: 1, max: 1000, doc: "gói về ≤ 1/8 gói ra ⇒ coi như mất gói" },

  // ---- cờ bật/tắt tính năng -----------------------------------------------------------
  enabled: { type: "bool", def: true, doc: "công tắc tổng: false ⇒ client giữ nguyên hành vi cũ đang có" },
  memory_enabled: { type: "bool", def: true, doc: "dùng số đã nhớ theo mạng" },
  ramp_enabled: { type: "bool", def: true, doc: "ramp giữa phiên" },
  loss_backoff_enabled: { type: "bool", def: true, doc: "hạ số khai khi mất gói" },
  probe_enabled: { type: "bool", def: true, doc: "đo goodput qua tunnel" },
  clamp_enabled: { type: "bool", def: true, doc: "kẹp trần/sàn" },
  telemetry_enabled: { type: "bool", def: true, doc: "client gửi telemetry lên /v1/client-telemetry" },
  telemetry_interval_s: { type: "int", def: 300, min: 0, max: 86400, doc: "nhịp gửi mẫu telemetry (giây); 0 = chỉ gửi khi kết thúc phiên" },
  notes: { type: "str", def: "", pattern: /^[\s\S]{0,200}$/, doc: "ghi chú của người/AI đặt tham số (không dùng trong logic)" },
});

/** Giá trị mặc định = hằng số đang chạy trong app (không đổi hành vi khi client chưa đọc). */
export const DEFAULT_BW_POLICY = Object.freeze(
  Object.fromEntries(Object.entries(BW_POLICY_SPEC).map(([key, spec]) => [key, spec.def])),
);

/** @returns {boolean} key có phải tham số hợp lệ không. */
export function isBwPolicyKey(key) {
  return Object.hasOwn(BW_POLICY_SPEC, key);
}

/** Thứ tự field trong payload = thứ tự bảng spec (dễ đọc khi debug). */
export function bwPolicyKeys() {
  return Object.keys(BW_POLICY_SPEC);
}

function parseBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "on", "bat", "bật"].includes(v)) return true;
    if (["0", "false", "no", "off", "tat", "tắt"].includes(v)) return false;
  }
  return null;
}

/** Ép một giá trị thô về đúng kiểu của spec; trả `{ error }` khi không dùng được. */
function parseValue(spec, value) {
  switch (spec.type) {
    case "bool": {
      const b = parseBool(value);
      return b === null ? { error: "not_a_boolean" } : { value: b };
    }
    case "num":
    case "int": {
      const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
      if (!Number.isFinite(n)) return { error: "not_a_number" };
      if (spec.type === "int" && !Number.isInteger(n)) return { value: Math.round(n) };
      return { value: n };
    }
    case "str":
      return typeof value === "string" ? { value } : { error: "not_a_string" };
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? { value } : { error: "not_in_enum" };
    default:
      return { error: "unsupported_type" };
  }
}

/**
 * Chuẩn hoá một object tham số thô về policy đầy đủ.
 *
 * - key lạ ⇒ bỏ (ghi vào `rejected`), KHÔNG ném lỗi: cấu hình cũ còn key đã xoá vẫn chạy.
 * - giá trị sai kiểu / ngoài enum / sai format ⇒ giữ default, ghi `rejected`.
 * - giá trị ngoài [min,max] ⇒ KẸP về biên và ghi `rejected` (reason "clamped") để thấy được.
 *
 * @param {unknown} raw
 * @returns {{ policy: Record<string, unknown>, applied: string[], rejected: Array<{key: string, reason: string}> }}
 */
export function normalizeBwPolicy(raw) {
  const policy = { ...DEFAULT_BW_POLICY };
  const applied = [];
  const rejected = [];
  if (raw === null || raw === undefined) return { policy, applied, rejected };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { policy, applied, rejected: [{ key: "*", reason: "not_an_object" }] };
  }
  for (const [key, value] of Object.entries(raw)) {
    const spec = BW_POLICY_SPEC[key];
    if (!spec) {
      rejected.push({ key, reason: "unknown_key" });
      continue;
    }
    const parsed = parseValue(spec, value);
    if (parsed.error) {
      rejected.push({ key, reason: parsed.error });
      continue;
    }
    let v = parsed.value;
    let clamped = false;
    if (spec.type === "num" || spec.type === "int") {
      if (v < spec.min) { v = spec.min; clamped = true; }
      if (v > spec.max) { v = spec.max; clamped = true; }
    }
    if (spec.type === "str" && spec.pattern && !spec.pattern.test(v)) {
      rejected.push({ key, reason: "invalid_format" });
      continue;
    }
    policy[key] = v;
    applied.push(key);
    if (clamped) rejected.push({ key, reason: "clamped", min: spec.min, max: spec.max });
  }
  return { policy, applied, rejected };
}

/** Parse JSON override: nhận cả object và chuỗi JSON; trả `{}` + lý do khi hỏng. */
function parseOverride(raw) {
  if (raw === null || raw === undefined || raw === "") return { value: null, error: null };
  if (typeof raw === "object" && !Array.isArray(raw)) return { value: raw, error: null };
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { value: parsed, error: null };
      return { value: null, error: "not_an_object" };
    } catch {
      return { value: null, error: "invalid_json" };
    }
  }
  return { value: null, error: "not_an_object" };
}

/** Env dạng BW_POLICY_RAMP_UP_FACTOR=1.4 → { ramp_up_factor: "1.4" }. */
function envPolicyOverrides(env = {}) {
  const out = {};
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(`${BW_POLICY_ENV_PREFIX}_`) || name === BW_POLICY_ENV_JSON) continue;
    const key = name.slice(BW_POLICY_ENV_PREFIX.length + 1).toLowerCase();
    if (!isBwPolicyKey(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Hash ngắn (12 hex) của policy đã chuẩn hoá — client dùng để biết mình đang chạy bản nào. */
export function bwPolicyRevision(policy) {
  const ordered = {};
  for (const key of bwPolicyKeys()) ordered[key] = policy[key];
  return crypto.createHash("sha256").update(JSON.stringify(ordered)).digest("hex").slice(0, 12);
}

/**
 * Chốt policy hiệu lực từ 3 lớp (lớp sau thắng lớp trước):
 *   1. default trong code  →  2. app_config `bw_policy` (admin, không cần deploy)
 *   →  3. env `BW_POLICY_JSON`  →  4. env từng tham số `BW_POLICY_<KEY>`.
 *
 * @param {{ read?: (key: string) => unknown, env?: Record<string, string|undefined> }} [options]
 * @returns {{ policy: Record<string, unknown>, revision: string, overridden_keys: string[], rejected: Array<{key: string, reason: string}> }}
 */
export function resolveBwPolicy({ read = () => null, env = {} } = {}) {
  const rejected = [];
  const merged = {};
  const take = (raw, source) => {
    const parsed = parseOverride(raw);
    if (parsed.error) rejected.push({ key: source, reason: parsed.error });
    if (!parsed.value) return;
    for (const [key, value] of Object.entries(parsed.value)) merged[key] = value;
  };
  let configRaw = null;
  try {
    configRaw = read(BW_POLICY_CONFIG_KEY);
  } catch {
    rejected.push({ key: BW_POLICY_CONFIG_KEY, reason: "config_read_failed" });
  }
  take(configRaw, `${BW_POLICY_CONFIG_KEY} (app_config)`);
  take(env?.[BW_POLICY_ENV_JSON], BW_POLICY_ENV_JSON);
  Object.assign(merged, envPolicyOverrides(env));

  const normalized = normalizeBwPolicy(merged);
  rejected.push(...normalized.rejected);
  const overridden_keys = bwPolicyKeys().filter((key) => normalized.policy[key] !== DEFAULT_BW_POLICY[key]);
  return {
    policy: normalized.policy,
    revision: bwPolicyRevision(normalized.policy),
    overridden_keys,
    rejected,
  };
}

/**
 * Provider dùng trong route: `bwPolicy.payload()` là khối `bw_policy` trả cho client.
 *
 * `cacheMs = 0` (mặc định) ⇒ đọc lại mỗi request, nên admin sửa `app_config` là client lượt
 * sau thấy ngay. Bật cache chỉ khi bảng `app_config` bị đọc quá nhiều.
 *
 * @param {{ read?: (key: string) => unknown, env?: Record<string, string|undefined>, log?: { warn?: Function }, cacheMs?: number }} [options]
 */
export function createBwPolicyProvider({ read = () => null, env = {}, log = console, cacheMs = 0 } = {}) {
  let cache = null;
  let cachedAt = 0;
  let loggedForRevision = null;

  const resolved = () => {
    const now = Date.now();
    if (cacheMs > 0 && cache && now - cachedAt < cacheMs) return cache;
    const result = resolveBwPolicy({ read, env });
    cache = result;
    cachedAt = now;
    // Cấu hình sai chỉ log MỘT lần cho mỗi revision: route này chạy ở mọi lượt client.
    const interesting = result.rejected.filter((item) => item.reason !== "unknown_key");
    if (interesting.length && loggedForRevision !== result.revision) {
      loggedForRevision = result.revision;
      log?.warn?.(`bw_policy: bỏ qua/kẹp ${interesting.length} giá trị không hợp lệ: ${JSON.stringify(interesting)}`);
    }
    return result;
  };

  return {
    /** Policy đầy đủ (không có field meta). */
    policy: () => resolved().policy,
    /** Revision hiện tại (12 hex). */
    revision: () => resolved().revision,
    /** Khối trả cho client trong /v1/bootstrap và /v1/nodes. */
    payload: () => {
      const current = resolved();
      return {
        schema_version: BW_POLICY_SCHEMA_VERSION,
        revision: current.revision,
        generated_at: new Date().toISOString(),
        overridden_keys: current.overridden_keys,
        ...current.policy,
      };
    },
  };
}
