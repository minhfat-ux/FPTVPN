import crypto from "node:crypto";
import { getById, getAppSettings } from "./db.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { confirmTopupOrder, listTopupOrders } from "./topup.js";

/**
 * SePay — xác nhận nạp tiền tự động.
 *
 * Hai đường, chọn bằng `sepayMode`:
 *  - `webhook`: SePay POST về /api/topup/sepay mỗi khi có tiền vào. Xác thực bằng
 *    HMAC-SHA256 (`X-SePay-Signature: sha256=…`, `X-SePay-Timestamp`, chuỗi ký =
 *    `{timestamp}.{raw_body}`) hoặc `Authorization: Apikey <secret>`.
 *  - `poll`: FlowGpt gọi API giao dịch của SePay theo chu kỳ (cần **API token**
 *    riêng, KHÁC webhook secret) và tự khớp nội dung chuyển khoản.
 *
 * Nguyên tắc giống VPNFlow: module này chỉ chứa hàm thuần (không I/O) để test được;
 * phần gọi mạng nằm ở `pollOnce`, phần cắm vào route/poller nằm ở `routes.js`/`index.js`.
 * Việc cộng credit dùng lại `confirmTopupOrder` (đã idempotent) nên không bao giờ
 * cộng hai lần, dù webhook gửi lại hay poll trùng.
 */

const DEFAULT_TOLERANCE_SEC = 300;
/** SePay API dùng cho chế độ poll. */
export const SEPAY_API_BASE = "https://my.sepay.vn/userapi";

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

/** HMAC-SHA256 theo đúng công thức SePay: `{timestamp}.{raw_body}`. */
export function verifySepaySignature({
  rawBody,
  signature,
  timestamp,
  secret,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = DEFAULT_TOLERANCE_SEC,
}) {
  if (!secret || !signature || timestamp === undefined || timestamp === null || timestamp === "") return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false;

  const provided = String(signature).trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;

  const expected = crypto
    .createHmac("sha256", String(secret))
    .update(`${ts}.${rawBody ?? ""}`)
    .digest("hex");
  return timingSafeEqualText(provided, expected);
}

/** Kiểu xác thực thứ hai SePay hỗ trợ: `Authorization: Apikey <secret>`. */
export function verifySepayApiKey({ header, secret }) {
  if (!secret) return false;
  const value = String(header ?? "").trim();
  if (!value) return false;
  const token = value.replace(/^apikey\s+/i, "").trim();
  return timingSafeEqualText(token, secret);
}

/** Chuẩn hoá một giao dịch SePay (tên trường có thể là camelCase hoặc snake_case). */
export function normalizeTransaction(raw = {}) {
  const pick = (...keys) => keys.map((key) => raw[key]).find((value) => value !== undefined && value !== null);
  const amountIn = Number(pick("amount_in", "amountIn", "transferAmount", "transfer_amount") ?? 0);
  return {
    id: String(pick("id", "referenceCode", "reference_code", "transaction_id") ?? ""),
    content: String(pick("transaction_content", "transactionContent", "content", "description") ?? ""),
    amountIn: Number.isFinite(amountIn) ? Math.abs(amountIn) : 0,
    transferType: String(pick("transfer_type", "transferType") ?? "in").toLowerCase(),
    accountNumber: String(pick("account_number", "accountNumber") ?? ""),
    when: String(pick("transaction_date", "transactionDate", "when") ?? ""),
  };
}

/** Bỏ khoảng trắng + viết hoa, để "flowgpt 000123" khớp "FLOWGPT000123". */
function normalizeNote(value) {
  return String(value ?? "").replace(/[\s._-]/g, "").toUpperCase();
}

/**
 * Tìm đơn nạp khớp với một giao dịch. Hàm thuần (đưa vào để test).
 *
 * Khớp khi: giao dịch là tiền VÀO, nội dung chứa mã đơn (`FLOWGPT######`), và số
 * tiền >= giá đơn (thiếu một chút vẫn nhận, vì ngân hàng có thể trừ phí; nhưng
 * tuyệt đối không nhận khi nhỏ hơn 80% — tránh khớp nhầm giao dịch khác).
 */
export function matchOrderForTransaction({ transaction, orders = [], minRatio = 0.8 }) {
  const tx = normalizeTransaction(transaction);
  if (tx.transferType && tx.transferType !== "in") return null;
  if (tx.amountIn <= 0) return null;
  const haystack = normalizeNote(tx.content);
  if (!haystack) return null;

  for (const order of orders) {
    const note = normalizeNote(order.transferNote ?? order.transfer_note);
    if (!note || !haystack.includes(note)) continue;
    const price = Number(order.amountVnd ?? order.amount_vnd ?? 0);
    if (price > 0 && tx.amountIn < price * minRatio) continue;
    return { order, transaction: tx, exactAmount: price === 0 || tx.amountIn === price };
  }
  return null;
}

/** Cấu hình SePay đang lưu trong app settings (giải mã secret). */
export function sepayConfig() {
  const settings = getAppSettings();
  return {
    enabled: Boolean(settings.sepayEnabled),
    mode: settings.sepayMode === "webhook" ? "webhook" : "poll",
    pollSeconds: Math.min(3600, Math.max(30, Number(settings.sepayPollSeconds) || 60)),
    apiToken: settings.sepayApiTokenEnc ? decryptSecret(settings.sepayApiTokenEnc) : null,
    webhookSecret: settings.sepayWebhookSecretEnc ? decryptSecret(settings.sepayWebhookSecretEnc) : null,
    notePrefix: String(settings.bankNotePrefix ?? "FLOWGPT"),
  };
}

/** Đơn đang chờ tiền (chỉ những đơn này mới cần khớp). */
export function pendingOrders() {
  return [
    ...listTopupOrders({ status: "pending", limit: 100 }),
    ...listTopupOrders({ status: "awaiting_confirmation", limit: 100 }),
  ];
}

/**
 * Khớp một giao dịch rồi cộng credit nếu tìm được đơn. Idempotent nhờ
 * `confirmTopupOrder`. `orders` bơm vào được để test không cần DB.
 */
export function applyTransaction({ transaction, orders, confirmedBy = "sepay" }) {
  const match = matchOrderForTransaction({ transaction, orders });
  if (!match) return { matched: false };
  try {
    const result = confirmTopupOrder({ orderId: match.order.id, confirmedBy });
    return {
      matched: true,
      orderId: match.order.id,
      transferNote: match.order.transferNote,
      tokens: result.order?.tokens ?? match.order.tokens,
      balance: result.balance,
      alreadyPaid: Boolean(result.alreadyPaid),
      exactAmount: match.exactAmount,
    };
  } catch (err) {
    // Một đơn lỗi không được làm hỏng cả vòng poll: ghi lại rồi đi tiếp.
    return {
      matched: true,
      orderId: match.order.id,
      transferNote: match.order.transferNote,
      error: String(err?.message ?? err).slice(0, 200),
    };
  }
}

/** Gọi API giao dịch của SePay (chế độ poll). `fetchImpl` để test. */
export async function fetchTransactions({ token, limit = 50, fetchImpl = fetch, signal }) {
  if (!token) throw new Error("Thiếu SePay API token");
  const response = await fetchImpl(`${SEPAY_API_BASE}/transactions/list?limit=${Number(limit) || 50}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`SePay API ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  const payload = await response.json().catch(() => ({}));
  const list = payload?.transactions ?? payload?.data ?? [];
  return Array.isArray(list) ? list : [];
}

/**
 * Một vòng poll: lấy giao dịch, khớp với đơn đang chờ, cộng credit.
 * Trả về thống kê để route admin hiển thị và để log.
 */
export async function pollOnce({
  token,
  orders = pendingOrders(),
  limit = 50,
  fetchImpl = fetch,
  signal,
  confirmedBy = "sepay",
} = {}) {
  const transactions = await fetchTransactions({ token, limit, fetchImpl, signal });
  const applied = [];
  for (const transaction of transactions) {
    const result = applyTransaction({ transaction, orders, confirmedBy });
    if (result.matched && !result.alreadyPaid) applied.push(result);
  }
  return { checked: transactions.length, pending: orders.length, applied };
}

let lastPoll = null;

export function recordPoll(result, error = null) {
  lastPoll = {
    at: new Date().toISOString(),
    checked: result?.checked ?? 0,
    applied: result?.applied?.length ?? 0,
    error: error ? String(error.message ?? error).slice(0, 300) : null,
  };
  return lastPoll;
}

export function sepayStatus() {
  const config = sepayConfig();
  return {
    enabled: config.enabled,
    mode: config.mode,
    pollSeconds: config.pollSeconds,
    hasApiToken: Boolean(config.apiToken),
    hasWebhookSecret: Boolean(config.webhookSecret),
    pendingOrders: pendingOrders().length,
    lastPoll,
  };
}
