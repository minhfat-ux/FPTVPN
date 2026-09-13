/**
 * SePay — xác thực webhook (IPN) và đọc đơn hàng từ giao dịch chuyển khoản.
 *
 * SePay theo dõi biến động số dư tài khoản ngân hàng rồi POST về endpoint của mình mỗi khi
 * có tiền vào. Nhờ vậy đơn chuyển khoản/VietQR được **tự động xác nhận** thay vì chờ chủ shop
 * bấm tay (luồng thủ công vẫn giữ nguyên làm đường dự phòng).
 *
 * Tài liệu: https://developer.sepay.vn/vi/sepay-webhooks/bat-dau-nhanh
 *  - Xác thực: HMAC-SHA256 (khuyến nghị) hoặc API Key (`Authorization: Apikey <key>`).
 *  - Chữ ký: `X-SePay-Signature: sha256=<hex>`, `X-SePay-Timestamp: <unix giây>`,
 *    chuỗi ký = `{timestamp}.{raw_body}` — **raw body**, không phải body đã parse.
 *  - Payload có: id, code, content, transferType ("in"/"out"), transferAmount, referenceCode…
 *
 * Module này chỉ chứa hàm thuần (không I/O) để test được; phần gọi store/activate nằm ở index.js.
 */
import crypto from "node:crypto";

/** Cửa sổ chống replay: chữ ký cũ hơn 5 phút coi như không hợp lệ. */
const DEFAULT_TOLERANCE_SEC = 300;

/**
 * Kiểm chữ ký HMAC-SHA256 của SePay.
 * @returns {boolean}
 */
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

  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Kiểm header `Authorization: Apikey <key>` (SePay cũng nhận `Bearer`). */
export function verifySepayApiKey({ authorization, apiKey }) {
  if (!apiKey) return false;
  const raw = String(authorization ?? "").trim();
  if (!raw) return false;
  const matched = raw.match(/^(?:apikey|bearer)\s+(.+)$/i);
  const provided = (matched ? matched[1] : raw).trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(String(apiKey));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Chế độ dự phòng: SePay có tuỳ chọn "không xác thực" (và một số bản test mode chỉ gửi vậy),
 * khi đó không có header nào để kiểm. Thay vì hạ chuẩn xuống "nhận tất", ta chấp nhận một token
 * bí mật nằm trong URL: `/v1/payments/sepay-webhook?token=<SEPAY_URL_TOKEN>`.
 *
 * Yếu hơn HMAC (URL có thể lọt vào log/lịch sử), nên chỉ dùng khi dashboard không cho chọn
 * HMAC-SHA256/API Key — xem docs §5b.
 */
export function verifySepayUrlToken({ token, urlToken }) {
  if (!urlToken || !token) return false;
  const a = Buffer.from(String(token).trim());
  const b = Buffer.from(String(urlToken).trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Giao dịch tiền RA (transferType "out") không liên quan tới đơn hàng.
 * Payload thiếu `transferType` vẫn nhận (một số bản test không gửi kèm).
 */
export function isIncomingTransfer(payload) {
  const type = String(payload?.transferType ?? "").trim().toLowerCase();
  return type === "" || type === "in";
}

/** Tiền tố trong nội dung chuyển khoản (do VietQR tag 62 sinh ra) → sản phẩm. */
export const ORDER_REF_PREFIXES = { VPNFLOW: "vpn", MEETFLOW: "ai", FLOWVPN: "vpn" };

/**
 * Tìm mã đơn trong `code` (SePay tách sẵn) hoặc trong `content` (nội dung khách chuyển).
 *
 * VietQR của mình ghi nội dung dạng `VPNFLOW-123456` / `MEETFLOW-123456` (xem vietqr.js),
 * nên khớp tiền tố trước; nếu khách gõ tay thiếu tiền tố thì lấy nhóm số dài trong nội dung
 * và để `product = null` (index.js sẽ tra cả hai kho đơn).
 *
 * @returns {{ orderCode: number|null, product: "vpn"|"ai"|null, via: string|null }}
 */
export function extractOrderRef({ code, content } = {}) {
  const fields = [String(code ?? ""), String(content ?? "")];
  for (const field of fields) {
    const matched = field.match(/\b(VPNFLOW|MEETFLOW|FLOWVPN)[\s\-_#]*(\d{3,12})\b/i);
    if (matched) {
      return {
        orderCode: Number(matched[2]),
        product: ORDER_REF_PREFIXES[matched[1].toUpperCase()] ?? null,
        via: matched[1].toUpperCase(),
      };
    }
  }

  // SePay đã tách đúng mã đơn vào `code` (cấu hình "mã thanh toán" chỉ là số)
  const digitsInCode = String(code ?? "").trim().match(/^(\d{3,12})$/);
  if (digitsInCode) return { orderCode: Number(digitsInCode[1]), product: null, via: "code" };

  // Khách gõ tay: lấy nhóm số dài nhất trong nội dung
  const inContent = String(content ?? "").match(/\b(\d{5,12})\b/);
  if (inContent) return { orderCode: Number(inContent[1]), product: null, via: "content" };

  return { orderCode: null, product: null, via: null };
}

/**
 * Số tiền đã chuyển có đủ cho đơn không.
 * Không biết giá (expected rỗng) ⇒ chấp nhận và để chủ shop xác nhận tay: thà chậm còn hơn
 * kích hoạt sai. Chuyển thừa vẫn tính là đủ.
 */
export function amountCovers(paid, expected) {
  const paidNum = Number(paid);
  if (!Number.isFinite(paidNum) || paidNum <= 0) return false;
  const expectedNum = Number(expected);
  if (!Number.isFinite(expectedNum) || expectedNum <= 0) return true;
  return paidNum >= expectedNum;
}
