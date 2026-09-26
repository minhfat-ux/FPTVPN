import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { buildVietQRPayload } from "./vietqr.js";

/**
 * Web payment integration (PayOS) — Vietnamese payments: MoMo wallet +
 * Bank QR (VietQR) with automatic verification via webhook. Covers the
 * "web account" purchase flow for both Android (sideload) and iOS.
 *
 * Config env (on VPS):
 *   PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY, PAYOS_BASE_URL?
 *
 * Plans:
 *   Giá đang bán nằm trong plan-store.js (data/plans.json) và sửa được từ admin
 *   tab Plans; DEFAULT_PLANS bên dưới chỉ là bảng mặc định (seed + fallback).
 */

/**
 * Bảng giá MẶC ĐỊNH trong code.
 *
 * Sản phẩm không còn phát hành trên App Store / Google Play nữa — giá đang bán
 * nằm trong store sửa được từ admin (src/plan-store.js -> data/plans.json, tab
 * Plans). Bảng này chỉ còn đúng hai việc:
 *   1) seed lần đầu, để deployment cũ chạy y hệt sau khi nâng cấp;
 *   2) FALLBACK khi store trống hoặc không đọc được — bảng giá trống làm trang
 *      /buy không còn gói nào để mua (mất đơn mà không ai biết), nên thà chạy
 *      bằng giá cứng trong code.
 */
export const DEFAULT_PLANS = {
  // Prices raised 2026-09-11 (200k / 550k / 950k / 1.8M).
  monthly:   { amount: 200000, days: 30,   label: "Monthly (200,000 VND / 30 days)", badge: "Monthly" },
  quarterly: { amount: 550000, days: 90,   label: "3 Months (550,000 VND / 90 days)", badge: "3 Months" },
  semiannual:{ amount: 950000, days: 180,  label: "6 Months (950,000 VND / 180 days)", badge: "6 Months" },
  yearly:    { amount: 1800000, days: 365, label: "Yearly (1,800,000 VND / 365 days)", badge: "Yearly" },
  // Lifetime was withdrawn from sale (2026-09-11) — the shop no longer offers it.
  // Kept here so historical orders, invoices and admin views can still resolve
  // the plan name, and `retired` makes the API refuse new orders for it.
  // Store cũng theo đúng luật đó: retire chứ KHÔNG xoá gói.
  lifetime:  { amount: 1500000, days: null, retired: true, label: "Lifetime (1,500,000 VND one-time)", badge: "Lifetime" },
};

/**
 * Bảng gói ĐANG dùng: trang /buy, tạo order, chặn gói retired và hoá đơn đều đọc
 * từ đây. index.js nạp nội dung từ PlanStore lúc boot rồi nạp lại sau mỗi lần
 * admin sửa (xem applyPlans).
 *
 * Sửa TẠI CHỖ (không gán lại biến) là cố ý: PLANS_PUBLIC ở cuối file export đúng
 * object này và index.js giữ tham chiếu đó, nên mọi consumer thấy bảng mới ngay
 * mà không phải đổi call site nào.
 */
const PLANS = clonePlans(DEFAULT_PLANS);

/** Copy bảng gói để bảng đang chạy không dính vào bảng mặc định. */
function clonePlans(table) {
  const out = {};
  for (const [id, cfg] of Object.entries(table ?? {})) out[id] = { ...cfg };
  return out;
}

/**
 * Nạp bảng gói từ store vào bảng đang chạy (index.js gọi lúc boot và sau mỗi lần
 * admin sửa giá). Danh sách rỗng/lỗi => quay về bảng mặc định trong code, không
 * bao giờ để trang bán hàng trắng gói.
 */
export function applyPlans(plans) {
  const list = Array.isArray(plans) ? plans.filter((p) => p && typeof p.id === "string" && p.id) : [];
  if (list.length === 0) {
    console.error("plans: danh sách gói rỗng — giữ bảng giá mặc định trong code");
    for (const key of Object.keys(PLANS)) delete PLANS[key];
    Object.assign(PLANS, clonePlans(DEFAULT_PLANS));
    return;
  }
  for (const key of Object.keys(PLANS)) delete PLANS[key];
  for (const p of list) {
    PLANS[p.id] = {
      amount: p.amount,
      days: p.days ?? null,
      label: p.label,
      badge: p.badge ?? "",
      ...(p.retired === true ? { retired: true } : {}),
    };
  }
}

/** Plans that can still be bought (retired ones stay resolvable but are hidden). */
export function isSellablePlan(product, planId) {
  const table = product === "ai" ? AI_PLANS : PLANS;
  const entry = table?.[planId];
  return Boolean(entry) && entry.retired !== true;
}

function payosConfig() {
  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
  const baseUrl = process.env.PAYOS_BASE_URL || "https://api-merchant.payos.vn";
  if (!clientId || !apiKey || !checksumKey) return null;
  return { clientId, apiKey, checksumKey, baseUrl };
}

function payosSignature({ checksumKey, orderCode, amount, description, cancelUrl, returnUrl }) {
  // PayOS v2 signature: hmac sha256 of "amount=$amount&cancelUrl=$cancelUrl&description=$description&orderCode=$orderCode&returnUrl=$returnUrl"
  const payload = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  return crypto.createHmac("sha256", checksumKey).update(payload).digest("hex");
}

/** Chữ cho trang trạng thái chuyển khoản (chỉ 3 ngôn ngữ như email). */
const STATUS_TEXTS = {
  vi: {
    title: "Tình trạng thanh toán", waiting: "⏳ Chưa nhận được tiền",
    waitingNote: "Hệ thống đang tự kiểm tra. Trang này tự cập nhật mỗi 10 giây — không cần tải lại.",
    paid: "✅ Đã nhận thanh toán", paidNote: "Gói đã được kích hoạt cho tài khoản bên dưới.",
    order: "Mã đơn", plan: "Gói", amount: "Số tiền", account: "Tài khoản",
    notFound: "Không tìm thấy đơn này", notFoundNote: "Kiểm tra lại mã đơn, hoặc liên hệ hỗ trợ.",
    support: "Cần hỗ trợ?", back: "Về trang mua gói",
  },
  en: {
    title: "Payment status", waiting: "⏳ Payment not received yet",
    waitingNote: "We check automatically. This page refreshes every 10 seconds — no need to reload.",
    paid: "✅ Payment received", paidNote: "The plan is now active for the account below.",
    order: "Order", plan: "Plan", amount: "Amount", account: "Account",
    notFound: "Order not found", notFoundNote: "Check the order code, or contact support.",
    support: "Need help?", back: "Back to the store",
  },
  zh: {
    title: "付款状态", waiting: "⏳ 尚未收到款项",
    waitingNote: "系统会自动检查。本页每 10 秒自动刷新，无需手动刷新。",
    paid: "✅ 已收到付款", paidNote: "套餐已为下方账号开通。",
    order: "订单", plan: "套餐", amount: "金额", account: "账号",
    notFound: "找不到该订单", notFoundNote: "请检查订单号，或联系客服。",
    support: "需要帮助？", back: "返回购买页",
  },
};

/**
 * Trang HTML cho khách (và chủ shop) xem **tình trạng chuyển khoản** của một đơn:
 * `/buy/status/<mã đơn>` (VPNFlow) và `/ai/buy/status/<mã đơn>` (MeetFlow AI).
 *
 * Tự cập nhật mỗi 10 giây. Không lộ email đầy đủ (che bớt) vì mã đơn chỉ là mốc thời gian
 * nên có thể bị dò.
 */
export function orderStatusPageHTML({
  lang = "vi", orderCode, planLabel = "", amount = 0, paid = false,
  emailMasked = "", product = "vpn", supportEmail = "support@meetflowai.site",
  buyUrl = "", found = true,
} = {}) {
  const t = STATUS_TEXTS[lang] || STATUS_TEXTS.vi;
  const money = `${Number(amount || 0).toLocaleString("vi-VN")} đ`;
  const head = paid ? t.paid : t.waiting;
  const note = !found ? t.notFoundNote : (paid ? t.paidNote : t.waitingNote);
  const rows = found
    ? `<tr><th>${t.order}</th><td>#${orderCode}</td></tr>
       <tr><th>${t.plan}</th><td>${planLabel}</td></tr>
       <tr><th>${t.amount}</th><td>${money}</td></tr>
       ${emailMasked ? `<tr><th>${t.account}</th><td>${emailMasked}</td></tr>` : ""}`
    : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${found ? head : t.notFound} — ${product === "ai" ? "MeetFlow AI" : "VPNFlow"}</title>
${found && !paid ? '<meta http-equiv="refresh" content="10">' : ""}
<style>
/* FlowTech Signature theme — docs/THEME.md (repo FlowGpt). Chỉ CSS. */
:root{--accent:#33C773;--accent-2:#22D3EE;--accent-3:#7C3AED;--accent-text:#05202A;--sig-bg:#0A1F3B;--sig-bg-deep:#071628;--sig-text:#EAF2FF;--sig-muted:rgba(234,242,255,.74);--sig-faint:rgba(234,242,255,.5);--sig-mint:#7FE6C0;--sig-line:rgba(255,255,255,.12)}
@keyframes sig-rise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
@keyframes sig-slide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
body{min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:var(--sig-text);background:radial-gradient(115% 70% at 6% -14%,rgba(51,199,115,.18),transparent 58%),radial-gradient(95% 65% at 98% -6%,rgba(34,211,238,.14),transparent 55%),linear-gradient(180deg,var(--sig-bg),var(--sig-bg-deep));background-attachment:fixed}
.c{position:relative;max-width:440px;width:100%;margin:24px;padding:28px;background:radial-gradient(130% 120% at 0% 0%,#14406c 0%,#0a1f3b 55%,#071628 100%);border:1px solid var(--sig-line);border-radius:22px;animation:sig-rise .36s cubic-bezier(.22,1,.36,1) both}
.c::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,#33c773,#22d3ee 46%,#7c3aed);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;opacity:.85;pointer-events:none}
h1{font-size:19px;margin:0 0 6px}p{color:var(--sig-muted);font-size:14px;line-height:1.5}
table{width:100%;border-collapse:collapse;margin:14px 0}
th{text-align:left;color:var(--sig-mint);font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:6px 12px 6px 0;white-space:nowrap}
td{font-weight:600;font-size:14px;padding:6px 0;color:var(--sig-text)}
tbody tr{animation:sig-slide .24s ease-out both}
a{color:var(--sig-mint)}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style></head><body><div class="c">
<h1>${found ? head : t.notFound}</h1>
<p>${note}</p>
<table>${rows}</table>
<p>${t.support} <a href="mailto:${supportEmail}">${supportEmail}</a>${buyUrl ? ` · <a href="${buyUrl}">${t.back}</a>` : ""}</p>
</div></body></html>`;
}

/**
 * Ảnh QR chuyển khoản lấy từ vietqr.app (SePay dùng chính dịch vụ này) — ảnh "standee" có sẵn
 * branding ngân hàng, số tiền và nội dung CK điền sẵn.
 *
 * Lưu ý khi đối chiếu với QR tự sinh (`buildVietQRPayload`):
 *  - vietqr.app đặt nội dung ở tag 62 **subfield 08** (purpose) và **bỏ dấu gạch**:
 *    `VPNFLOW-1789319664-NAM` → `VPNFLOW1789319664NAM` (bộ tách mã đơn đã chấp nhận cả hai dạng).
 *  - Không có tag 59 (tên người nhận) trong payload; app ngân hàng tự tra tên theo BIN + số tài khoản.
 * Vì vậy trang buy hiển thị ảnh này và **tự rơi về QR sinh tại chỗ** nếu ảnh không tải được.
 */
export function bankQrImageUrl({
  amount,
  note = "",
  account,
  holder = "",
  bank = process.env.BANK_QR_BANK_NAME || "TPBank",
  store = process.env.BANK_QR_STORE || "VPNFlow Purchasing",
  template = process.env.BANK_QR_TEMPLATE || "standee",
} = {}) {
  const base = (process.env.VIETQR_IMG_BASE || "https://vietqr.app/img").replace(/\/$/, "");
  const params = new URLSearchParams();
  params.set("bank", bank);
  params.set("acc", String(account ?? ""));
  params.set("template", template);
  if (amount) params.set("amount", String(Math.round(Number(amount))));
  if (note) params.set("des", String(note).slice(0, 25));
  if (holder) params.set("holder", holder);
  if (store) params.set("store", store);
  params.set("showinfo", "true");
  params.set("fullacc", "true");
  return `${base}?${params.toString()}`;
}

/**
 * Token gói hàng ngắn để in vào NỘI DUNG CHUYỂN KHOẢN (không dấu, tối đa 5 ký tự).
 *
 * Ngân hàng cắt nội dung khá ngắn (EMVCo cho field 62/01 tối đa 25 ký tự) nên mã đơn phải đứng
 * TRƯỚC — nếu bị cắt thì mất tên gói, không mất mã đơn (mất mã đơn là không khớp được đơn).
 */
const TRANSFER_PLAN_TOKENS = {
  vpn: { monthly: "THANG", quarterly: "3THANG", semiannual: "6THANG", yearly: "NAM" },
  ai: { pass30: "30NG", monthly: "THANG", yearly: "NAM" },
};

/**
 * Nội dung chuyển khoản hiện cho khách khi quét QR: `<mã đơn>-<token gói>`.
 * Ví dụ: `1789318130-THANG`. Phần tiền tố sản phẩm (`VPNFLOW-`/`MEETFLOW-`) do
 * `buildVietQRPayload` thêm vào.
 */
export function transferNote({ orderCode, plan = "", product = "vpn" } = {}) {
  const code = String(orderCode ?? "").trim();
  const token = TRANSFER_PLAN_TOKENS[product]?.[plan] ?? "";
  const note = token ? `${code}-${token}` : code;
  return note.slice(0, 25);
}

/**
 * Builds a VietQR (direct bank transfer) as a QR data URL. No merchant
 * registration needed — customer scans with any VN banking app, pays the
 * exact amount, and the note carries the order code for manual/auto matching.
 */
/**
 * Ảnh QR (PNG) cho MỘT link tải bất kỳ — dùng cho khối "quét mã để cài trên điện thoại" ở trang buy
 * và ở trang cài iOS. Khách mở trang trên máy tính, quét mã là điện thoại mở đúng link.
 *
 * Sinh tại chỗ (không phụ thuộc dịch vụ ngoài như ảnh QR của Diawi) nên link Diawi hết hạn cũng
 * không ảnh hưởng, và không lộ link qua bên thứ ba.
 */
export async function downloadQrPng(url, { size = 320, margin = 1 } = {}) {
  const target = String(url ?? "").trim();
  if (!target) throw new Error("downloadQrPng: thiếu url");
  return QRCode.toBuffer(target, { type: "png", width: size, margin, errorCorrectionLevel: "M" });
}

/**
 * Khối HTML: QR + link dạng chữ (bấm được) + nút copy. Hiện dưới hai nút tải app ở trang buy.
 * Chuỗi dịch để trong hàm này (không nhét vào 10 object ngôn ngữ của 2 trang) cho gọn.
 */
export function downloadQrSectionHTML({ lang = "vi", qrSrc, linkUrl, note = null } = {}) {
  if (!qrSrc || !linkUrl) return "";
  const L = {
    vi: { title: "📱 Quét mã để cài trên điện thoại", hint: "Mở camera điện thoại và quét mã này — máy sẽ mở đúng trang cài.", link: "Hoặc mở link:", copy: "Sao chép link", copied: "Đã sao chép ✓" },
    en: { title: "📱 Scan to install on your phone", hint: "Open your phone camera and scan — it opens the right install page.", link: "Or open the link:", copy: "Copy link", copied: "Copied ✓" },
    zh: { title: "📱 扫码在手机上安装", hint: "用手机相机扫描此二维码，即可打开安装页面。", link: "或打开链接：", copy: "复制链接", copied: "已复制 ✓" },
    ja: { title: "📱 スマホでインストールするにはスキャン", hint: "スマホのカメラでこのコードを読み取るとインストールページが開きます。", link: "またはリンクを開く：", copy: "リンクをコピー", copied: "コピーしました ✓" },
    ko: { title: "📱 휴대폰 설치용 QR 스캔", hint: "휴대폰 카메라로 이 코드를 스캔하면 설치 페이지가 열립니다.", link: "또는 링크 열기:", copy: "링크 복사", copied: "복사됨 ✓" },
  }[lang] ?? null;
  const t = L ?? { title: "📱 Scan to install on your phone", hint: "Open your phone camera and scan — it opens the right install page.", link: "Or open the link:", copy: "Copy link", copied: "Copied ✓" };
  return `<div class="dlqr">
  <div class="dlqr-title">${t.title}</div>
  <img class="dlqr-img" src="${qrSrc}" alt="QR" width="180" height="180" loading="lazy">
  <div class="dlqr-hint">${t.hint}</div>
  <div class="dlqr-link">${t.link} <a href="${linkUrl}" target="_blank" rel="noopener">${linkUrl.replace(/^https?:\/\//, "")}</a>
    <button type="button" class="dlqr-copy" data-link="${linkUrl}" data-done="${t.copied}">${t.copy}</button>
  </div>
  ${note ? `<div class="dlqr-note">${note}</div>` : ""}
</div>`;
}

export async function createBankQrDataUrl({
  accountNumber,
  accountName,
  amount,
  orderCode,
  bin,
  prefix = "VPNFLOW",
  plan = "",
  product = "vpn",
}) {
  const payload = buildVietQRPayload({
    accountNumber,
    accountName,
    amount,
    // Nội dung chuyển khoản có kèm tên gói để chủ shop nhìn sao kê là biết khách mua gói nào.
    content: transferNote({ orderCode, plan, product }),
    prefix,
    ...(bin ? { bin } : {}),
  });
  const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 2, errorCorrectionLevel: "M" });
  return dataUrl;
}

/**
 * Wallet collections (MoMo) that speak VietQR: their printed QR is a
 * consumer-presented VietQR payload (BIN + account), so we can mint a fresh
 * QR per order **with the plan amount pre-filled** instead of showing a static
 * image the customer has to type the amount into.
 */
export function momoQrConfig() {
  // MOMO_QR_DYNAMIC=0 falls back to the static collection image.
  if (process.env.MOMO_QR_DYNAMIC === "0") return null;
  const bin = process.env.MOMO_QR_BIN;
  const accountNumber = process.env.MOMO_QR_ACCOUNT;
  if (!bin || !accountNumber) return null;
  return { bin, accountNumber, accountName: process.env.MOMO_QR_NAME || "MOMO" };
}

/** Returns bank config from env, or null when not configured. */
export function bankQrConfig() {
  const accountNumber = process.env.BANK_QR_ACCOUNT;
  const accountName = process.env.BANK_QR_NAME || "VPNFlow";
  if (!accountNumber) return null;
  return { accountNumber, accountName };
}

/** Creates a PayOS payment link (checkout page) or null on failure. */
export async function createPayosPaymentLink({ orderCode, amount, description, cancelUrl, returnUrl, buyerEmail }) {
  const cfg = payosConfig();
  if (!cfg) return { error: "PAYOS not configured (set PAYOS_CLIENT_ID/API_KEY/CHECKSUM_KEY)" };

  const signature = payosSignature({ checksumKey: cfg.checksumKey, orderCode, amount, description, cancelUrl, returnUrl });
  const body = {
    orderCode,
    amount,
    description,
    buyerEmail,
    cancelUrl,
    returnUrl,
    signature,
  };

  const res = await fetch(`${cfg.baseUrl}/v2/payment-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-client-id": cfg.clientId, "x-api-key": cfg.apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== "00") {
    return { error: json.desc || `PayOS create link failed (${res.status})` };
  }
  return { checkoutUrl: json.data.checkoutUrl, qrCode: json.data.qrCode ?? null };
}

/** Verifies a PayOS webhook signature and returns normalized event. */
export function verifyPayosWebhook(rawBody, signatureHeader) {
  const cfg = payosConfig();
  if (!cfg) return null;
  try {
    const data = JSON.parse(rawBody);
    // PayOS webhook signature: hmac sha256 of sorted data fields
    const keys = Object.keys(data.data || {}).sort();
    const payload = keys.map((k) => `${k}=${data.data[k]}`).join("&");
    const expected = crypto.createHmac("sha256", cfg.checksumKey).update(payload).digest("hex");
    if (signatureHeader !== expected) return null;
    return { orderCode: data.data.orderCode, code: data.code, success: data.code === "00", amount: data.data.amount };
  } catch {
    return null;
  }
}

/* =====================================================================
 * Buy page localization — the web paywall mirrors the app languages
 * (en / vi / zh / ja / ko). Pages accept ?lang=… (default: vi to keep
 * existing Vietnamese behavior when opened without a parameter).
 * ================================================================== */

const LANG_CODES = ["en", "vi", "zh", "ja", "ko"];

/** Validates/normalizes a requested language code. */
export function pickBuyLang(v) {
  return LANG_CODES.includes(v) ? v : "vi";
}

const LOCALES = { en: "en-US", vi: "vi-VN", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR" };

/** Localized number grouping (e.g. 70000 → 70,000 / 70.000). */
export function fmtAmount(lang, n) {
  try {
    return new Intl.NumberFormat(LOCALES[lang] || "vi-VN").format(n) + " đ";
  } catch {
    return String(n) + " đ";
  }
}

const TEXTS = {
  en: {
    htmlLang: "en",
    pageTitle: "VPNFlow — Buy Premium",
    sub: "Unlock a secure VPN for your account",
    dlTitle: "Get the VPNFlow app",
    dlSub: "Don't have the app yet? Choose your platform:",
    androidTitle: "Download the APK directly", androidTop: "Download for Android", androidBadge: "APK", iosTop: "Download for iPhone / iPad", iosBadge: "iOS (IPA)",
    macTop: "Download for Mac", macBadge: "macOS", windowsTop: "Download for Windows", windowsBadge: "Windows 10/11",
    androidLegacyLabel: "Fire TV / older device",
    androidLegacySub: "APK for Android 7.0 and 7.1 — Fire TV Stick 4K, older phones and TVs",
    emailLabel: "Your VPNFlow account email",
    leadTitle: "Enter your email to get the right build for this device",
    leadBtn: "Continue",
    leadErr: "Invalid email.",
    leadSending: "Checking…",
    leadKnown: "This email already has an account — Premium will be enabled for it after payment.",
    leadOther: "Choose another platform",
    leadFor: "Recommended for your device:",
    planLabel: "Choose a plan",
    methodLabel: "Payment method",
    bankName: "VN Bank", bankScan: "Scan TPBank QR",
    wechatScan: "Scan QR", alipayScan: "Scan QR", momoScan: "Scan QR",
    payosName: "PayOS gateway", payosSub: "MoMo / QR / card",
    inAppNote: "✅ You already have the app — just create your account with the email below and pay. Premium turns on automatically after payment.",
    payBtn: "Create payment QR",
    note: "After you transfer, Premium will be activated for this email.",
    modalTitle: "Scan the QR to pay",
    qrAlt: "Payment QR",
    close: "Close",
    saveQr: "Save QR image",
    saveQrHint: "Tap the QR to save it to your photos, then scan it from your bank app.",
    mini: "Keep the order code for reference. Premium activates automatically after confirmation.",
        privacyLabel: "Privacy Policy",
    supportLabel: "Support",
        noteExtra: "Pro is activated for the email you enter above. If it is not active within 10 minutes after your transfer, contact support@meetflowai.site.",
        deviceNote: "One account works on up to 3 devices. To switch devices, remove an old one first.",
        howToTitle: "How to activate after buying",
    iosLineIpa: "Open the install page on the same iPhone/iPad, register the device (UDID), then install the signed IPA we send; sign in with this email afterward.",
    adhocTitle: "Install on iPhone / iPad (Ad Hoc)",
    adhocSteps: ["Open <b>this page in Safari on the iPhone/iPad</b> you want to install on (Chrome and in-app browsers cannot install).", "Tap <b>Register this device</b> → install the profile (iOS sends the device ID / UDID to the shop).", "The shop adds your UDID to Apple and signs a build for your device (usually 1–2 minutes) — this page refreshes by itself.", "Tap <b>Install</b>. If iOS says “Untrusted Developer”: <b>Settings → General → VPN &amp; Device Management</b> → <b>Trust</b>."],
    macAdhocTitle: "Install on Mac (direct download)",
    macAdhocSteps: ["Download the .dmg installer above and open it.", "Drag <b>VPNFlow</b> into the <b>Applications</b> folder.", "If macOS says it can't verify the developer: <b>right-click</b> the app → <b>Open</b> → <b>Open</b> again, or go to <b>System Settings → Privacy &amp; Security</b> → <b>Open Anyway</b>.", "Open VPNFlow, sign in with the purchase email, click <b>Allow</b> when macOS asks for VPN configuration, then click <b>Connect</b>.", "Nếu vẫn không mở được (báo <i>“VPNFlow is damaged / không thể mở”</i>): mở <b>Terminal</b>, chạy <code>xattr -dr com.apple.quarantine /Applications/VPNFlow.app</code> rồi mở lại app."],
    iosLineStore: "Available on the App Store — install it, then sign in with the same email you used here; Premium unlocks automatically.",
    iosLineSoon: "iOS version is coming soon.",
    androidLine: "Android must be installed directly: download the APK above, allow installs from unknown sources, then open the app.", windowsLine: "Windows must be installed directly: download the installer above, run it (it asks for admin rights to create the tunnel), then open the app and sign in with the SAME email.",
    steps: ["Download and install the app (iOS: the IPA above · Android: the APK above).", "Open the app and sign in with the SAME email you used on this page.", "Premium activates automatically — no code and nothing else to do."],
        cnyNote: "WeChat Pay / Alipay settle in CNY — the ¥ amount is converted at",
        cnyEnter: "Enter exactly the ¥ amount shown on the QR when paying.",
        amountPrefilled: "The amount is already in the QR — just scan and confirm, no need to type anything.",
        copyAmount: "Copy amount",
        amountReminder: "Transfer EXACTLY this amount.",
        planChosen: "Your plan:",
        copyOrder: "Copy reference",
        orderNoteHint: "Paste this into the transfer note:",
    copied: "Copied",
        guideLink: "📖 Step-by-step activation guide",
        renewPrefill: "Renewal link — your email and plan are already filled in. Just pick the payment method and scan the QR.",
    errNoEmail: "Enter your account email.",
    creating: "Creating payment code…",
    errCreate: "Could not create payment.",
    errNoCode: "Could not create a payment code.",
    errNoConn: "Cannot reach the server. Please try again.",
    orderPrefix: "Order code: ",
    waiting: "Waiting for payment confirmation…",
    waitingTick: "Waiting for confirmation…",
    paid: "✅ Payment received! Premium activated. Open the VPNFlow app to use it.",
    hints: {
      bankqr: "Open your banking app and scan the QR — the amount is filled in automatically, just confirm.",
      wechat: "Open WeChat, scan the QR and enter the exact amount.",
      alipay: "Open Alipay, scan the QR and enter the exact amount.",
      momo: "Open MoMo and scan the QR — the amount is filled in automatically, just confirm.",
      other: "Scan the QR with your payment app.",
    },
    errByCode: {
      invalid_email: "Invalid email.",
      invalid_plan: "Invalid plan.",
      bank_not_configured: "Bank QR is not configured yet.",
      payos_not_configured: "PayOS gateway is not configured yet.",
      internal: "Internal error. Please try again.",
    },
    dayUnit: "days",
    lifetimeNote: "one-time · forever",
    planNames: { monthly: "Monthly", quarterly: "3 Months", semiannual: "6 Months", yearly: "Yearly", lifetime: "Lifetime" },
    successTitle: "Payment successful!",
    successBody: "Premium has been activated for your account. Reopen the VPNFlow app — you will see the gold crown right away.",
    cancelTitle: "Payment cancelled",
    cancelBody: "No charge was made. Go back to the buy page to try again.",
  },
  vi: {
    htmlLang: "vi",
    pageTitle: "VPNFlow — Mua Premium",
    sub: "Mở khoá VPN an toàn cho tài khoản của bạn",
    dlTitle: "Tải app VPNFlow",
    dlSub: "Chưa có app? Chọn nền tảng của bạn:",
    androidTitle: "Tải APK trực tiếp", androidTop: "Tải cho Android", androidBadge: "APK", iosTop: "Tải cho iPhone / iPad", iosBadge: "iOS (IPA)",
    macTop: "Tải cho Mac", macBadge: "macOS", windowsTop: "Tải cho Windows", windowsBadge: "Windows 10/11",
    androidLegacyLabel: "Fire TV / máy cũ",
    androidLegacySub: "APK cho Android 7.0 và 7.1 — Fire TV Stick 4K, điện thoại và TV đời cũ",
    emailLabel: "Email tài khoản VPNFlow",
    leadTitle: "Nhập email để nhận bản cài đúng cho thiết bị của bạn",
    leadBtn: "Tiếp tục",
    leadErr: "Email không hợp lệ.",
    leadSending: "Đang kiểm tra…",
    leadKnown: "Email này đã có tài khoản — Premium sẽ được bật cho email này sau khi thanh toán.",
    leadOther: "Chọn nền tảng khác",
    leadFor: "Bản phù hợp với thiết bị của bạn:",
    planLabel: "Chọn gói",
    methodLabel: "Phương thức thanh toán",
    bankName: "Ngân hàng VN", bankScan: "Quét QR TPBank",
    wechatScan: "Quét QR", alipayScan: "Quét QR", momoScan: "Quét QR MoMo",
    payosName: "Cổng PayOS", payosSub: "MoMo / QR / thẻ",
    inAppNote: "✅ Bạn đã có app rồi — chỉ cần nhập email bên dưới để tạo tài khoản và thanh toán. Premium tự bật sau khi thanh toán.",
    payBtn: "Tạo mã thanh toán",
    note: "Sau khi chuyển tiền, premium sẽ được kích hoạt cho email này.",
    modalTitle: "Quét QR để thanh toán",
    qrAlt: "QR thanh toán",
    close: "Đóng",
    saveQr: "Lưu ảnh QR",
    saveQrHint: "Chạm vào QR để lưu về máy, rồi mở app ngân hàng quét từ ảnh đã lưu.",
    mini: "Giữ mã đơn để đối chiếu. Premium tự kích hoạt sau khi xác nhận.",
        privacyLabel: "Chính sách bảo mật",
    supportLabel: "Hỗ trợ",
        noteExtra: "Pro được kích hoạt theo email bạn nhập ở trên. Nếu sau 10 phút chuyển khoản vẫn chưa thấy kích hoạt, liên hệ support@meetflowai.site.",
        deviceNote: "Mỗi tài khoản dùng được tối đa 3 thiết bị. Muốn đổi máy, hãy gỡ bớt một thiết bị cũ trước.",
        howToTitle: "Cách kích hoạt sau khi mua",
    iosLineIpa: "Mở trang cài trên chính iPhone/iPad, đăng ký thiết bị (UDID), rồi cài file IPA đã ký mà shop gửi; sau đó đăng nhập bằng đúng email này.",
    adhocTitle: "Cài trên iPhone / iPad (Ad Hoc)",
    adhocSteps: ["Mở <b>trang này bằng Safari trên chính iPhone/iPad</b> cần cài (Chrome, trình duyệt trong app chat đều không cài được).", "Bấm <b>Đăng ký thiết bị</b> → cài hồ sơ (iOS tự gửi mã thiết bị / UDID về shop).", "Shop thêm UDID vào Apple và ký bản cài riêng cho máy bạn (thường 1–2 phút) — trang này tự cập nhật.", "Bấm <b>Cài đặt</b>. Nếu iOS báo “Untrusted Developer”: <b>Cài đặt → Cài đặt chung → VPN &amp; Quản lý thiết bị</b> → <b>Tin cậy</b>."],
    macAdhocTitle: "Cài trên máy Mac (tải trực tiếp)",
    macAdhocSteps: ["Tải file cài .dmg ở trên rồi mở ra.", "Kéo <b>VPNFlow</b> vào thư mục <b>Applications</b> (Ứng dụng).", "Nếu macOS báo “không xác minh được nhà phát triển”: <b>chuột phải</b> vào app → <b>Open</b> → <b>Open</b> lần nữa, hoặc vào <b>System Settings → Privacy &amp; Security</b> → <b>Open Anyway</b>.", "Mở VPNFlow, đăng nhập bằng email đã mua, bấm <b>Allow</b> khi macOS hỏi cấu hình VPN rồi bấm <b>Connect</b>.", "If it still won't open (says <i>“VPNFlow is damaged”</i>): open <b>Terminal</b>, run <code>xattr -dr com.apple.quarantine /Applications/VPNFlow.app</code>, then open the app again."],
    iosLineStore: "Đã có trên App Store — tải về, rồi đăng nhập bằng đúng email bạn dùng ở trang này; Premium tự bật.",
    iosLineSoon: "Bản iOS sẽ sớm được phát hành.",
    androidLine: "Bản Android cần cài trực tiếp: tải file APK ở trên, cho phép cài từ nguồn không xác định, rồi mở app.", windowsLine: "Windows cũng cài trực tiếp: tải bộ cài ở trên, chạy file (app xin quyền admin để dựng tunnel), rồi mở app và đăng nhập bằng ĐÚNG email này.",
    steps: ["Tải và cài app (iOS: file IPA ở trên · Android: file APK ở trên).", "Mở app và đăng nhập bằng ĐÚNG email bạn đã dùng ở trang này.", "Premium tự kích hoạt — không cần mã, không cần làm gì thêm."],
        cnyNote: "WeChat Pay / Alipay thanh toán bằng CNY (Nhân dân tệ) — số ¥ quy đổi theo tỷ giá",
        cnyEnter: "Nhập đúng số tiền ¥ hiện trên mã QR khi thanh toán.",
        amountPrefilled: "Số tiền đã có sẵn trong mã QR — quét là ra đúng số, không cần nhập gì.",
        copyAmount: "Sao chép số tiền",
        amountReminder: "Chuyển ĐÚNG số tiền này khi chuyển khoản.",
        planChosen: "Gói bạn đã chọn:",
        copyOrder: "Sao chép nội dung CK",
        orderNoteHint: "Dán nội dung này vào ô ghi chú khi chuyển tiền:",
    copied: "Đã sao chép",
        guideLink: "📖 Xem hướng dẫn kích hoạt từng bước",
        renewPrefill: "Link gia hạn — email và gói của bạn đã được điền sẵn. Chỉ cần chọn cách thanh toán rồi quét QR.",
    errNoEmail: "Nhập email tài khoản.",
    creating: "Đang tạo mã thanh toán...",
    errCreate: "Lỗi tạo thanh toán.",
    errNoCode: "Không tạo được mã thanh toán.",
    errNoConn: "Không kết nối được máy chủ. Thử lại.",
    orderPrefix: "Mã đơn: ",
    waiting: "Đang chờ xác nhận thanh toán...",
    waitingTick: "Đang chờ xác nhận...",
    paid: "✅ Đã nhận thanh toán! Premium đã kích hoạt. Mở app VPNFlow để dùng.",
    hints: {
      bankqr: "Mở app ngân hàng quét QR — số tiền đã được điền sẵn, chỉ cần xác nhận.",
      wechat: "Mở WeChat quét QR, nhập đúng số tiền.",
      alipay: "Mở Alipay quét QR, nhập đúng số tiền.",
      momo: "Mở MoMo quét QR — số tiền đã được điền sẵn, chỉ cần xác nhận.",
      other: "Quét QR bằng app thanh toán.",
    },
    errByCode: {
      invalid_email: "Email không hợp lệ.",
      invalid_plan: "Gói không hợp lệ.",
      bank_not_configured: "Bank QR chưa được cấu hình (BANK_QR_ACCOUNT).",
      payos_not_configured: "Cổng PayOS chưa được cấu hình.",
      internal: "Lỗi máy chủ. Thử lại.",
    },
    dayUnit: "ngày",
    lifetimeNote: "một lần · vĩnh viễn",
    planNames: { monthly: "Hàng tháng", quarterly: "3 tháng", semiannual: "6 tháng", yearly: "Hàng năm", lifetime: "Trọn đời" },
    successTitle: "Thanh toán thành công!",
    successBody: "Premium đã được kích hoạt cho tài khoản của bạn. Mở lại app VPNFlow — bạn sẽ thấy vương miện vàng ngay.",
    cancelTitle: "Đã huỷ thanh toán",
    cancelBody: "Không có khoản phí nào bị trừ. Quay lại trang mua để thử lại.",
  },
  zh: {
    htmlLang: "zh-Hans",
    pageTitle: "VPNFlow — 购买高级版",
    sub: "为您的账户解锁安全 VPN",
    dlTitle: "获取 VPNFlow 应用",
    dlSub: "还没有应用？选择您的平台：",
    androidTitle: "直接下载 APK", androidTop: "下载 Android 版", androidBadge: "APK", iosTop: "下载 iPhone / iPad 版", iosBadge: "iOS (IPA)",
    macTop: "下载 Mac 版", macBadge: "macOS", windowsTop: "下载 Windows 版", windowsBadge: "Windows 10/11",
    androidLegacyLabel: "Fire TV / 旧设备",
    androidLegacySub: "适用于 Android 7.0 与 7.1 的 APK — Fire TV Stick 4K、旧款手机与电视",
    emailLabel: "您的 VPNFlow 账户邮箱",
    leadTitle: "请输入邮箱以获取适合本设备的安装包",
    leadBtn: "继续",
    leadErr: "邮箱格式不正确。",
    leadSending: "正在检查…",
    leadKnown: "该邮箱已有账号 — 支付后将为其开通 Premium。",
    leadOther: "选择其他平台",
    leadFor: "适合您设备的安装包：",
    planLabel: "选择套餐",
    methodLabel: "支付方式",
    bankName: "越南银行", bankScan: "扫描 TPBank 二维码",
    wechatScan: "扫描二维码", alipayScan: "扫描二维码", momoScan: "扫描 MoMo 二维码",
    payosName: "PayOS 网关", payosSub: "MoMo / 二维码 / 银行卡",
    inAppNote: "✅ 您已安装应用 —— 只需在下方填写邮箱创建账户并完成支付，支付后 Premium 自动开启。",
    payBtn: "生成支付二维码",
    note: "转账后，Premium 将为此邮箱激活。",
    modalTitle: "扫描二维码支付",
    qrAlt: "支付二维码",
    close: "关闭",
    saveQr: "保存二维码",
    saveQrHint: "点击二维码保存到相册，再打开银行应用从相册扫描。",
    mini: "请保留订单号以备核对。确认后 Premium 将自动激活。",
        privacyLabel: "隐私政策",
    supportLabel: "支持",
        noteExtra: "Pro 将为您在上方填写的邮箱激活。若转账后 10 分钟内仍未激活，请联系 support@meetflowai.site。",
        deviceNote: "每个账号最多可在 3 台设备上使用；如需更换设备，请先移除一台旧设备。",
        howToTitle: "购买后如何激活",
    iosLineIpa: "下载上方 IPA 文件并安装到 iPhone/iPad，然后用本页填写的同一邮箱登录，Premium 自动开启。",
    adhocTitle: "在 iPhone / iPad 上安装（Ad Hoc）",
    adhocSteps: ["请在<b>要安装的 iPhone/iPad 上用 Safari 打开本页</b>（Chrome 或应用内浏览器无法安装）。", "点击<b>注册此设备</b> → 安装描述文件（iOS 会把设备码 UDID 发送给商家）。", "商家把 UDID 加入 Apple 并为你的设备重新签名（通常 1–2 分钟）—— 本页会自动刷新。", "点击<b>安装</b>。若提示“不受信任的开发者”：<b>设置 → 通用 → VPN 与设备管理</b> → <b>信任</b>。"],
    macAdhocTitle: "在 Mac 上安装（直接下载）",
    macAdhocSteps: ["下载上方 .dmg 安装包并打开。", "将 <b>VPNFlow</b> 拖入 <b>Applications（应用程序）</b>文件夹。", "若 macOS 提示“无法验证开发者”：<b>右键</b>点击应用 → <b>Open</b> → 再点一次 <b>Open</b>，或进入 <b>System Settings → Privacy &amp; Security</b> → <b>Open Anyway</b>。", "打开 VPNFlow，使用购买邮箱登录，macOS 询问配置 VPN 时点 <b>Allow</b>，然后点 <b>Connect</b>。", "若仍无法打开（提示 <i>“VPNFlow is damaged”</i>）：打开 <b>Terminal</b>，运行 <code>xattr -dr com.apple.quarantine /Applications/VPNFlow.app</code>，然后重新打开应用。"],
    iosLineStore: "已在 App Store 上架 — 下载后使用本页填写的同一邮箱登录，Premium 自动开启。",
    iosLineSoon: "iOS 版本即将发布。",
    androidLine: "Android 需直接安装：下载上方 APK，允许“未知来源”安装，然后打开应用。", windowsLine: "Windows 也需要直接安装：下载上面的安装包并运行（创建隧道时会请求管理员权限），然后打开应用，用同一个邮箱登录。",
    steps: ["下载并安装应用（iOS：上方 IPA · Android：上方 APK）。", "打开应用，使用本页填写的同一邮箱登录。", "Premium 自动激活 — 无需兑换码，无需其他操作。"],
        cnyNote: "微信支付 / 支付宝以人民币（CNY）结算 — 金额按以下汇率换算：",
        cnyEnter: "支付时请输入二维码上显示的人民币金额。",
        amountPrefilled: "二维码中已包含金额 — 扫码即可，无需输入。",
        copyAmount: "复制金额",
        amountReminder: "请转账「此金额」，不要多也不要少。",
        planChosen: "您选择的套餐：",
        copyOrder: "复制转账备注",
        orderNoteHint: "请在转账备注中粘贴：",
    copied: "已复制",
        guideLink: "📖 查看分步激活指南",
        renewPrefill: "续费链接 — 您的邮箱和套餐已自动填好，只需选择支付方式并扫码。",
    errNoEmail: "请输入账户邮箱。",
    creating: "正在生成支付码…",
    errCreate: "无法创建支付。",
    errNoCode: "无法生成支付码。",
    errNoConn: "无法连接服务器，请重试。",
    orderPrefix: "订单号：",
    waiting: "正在等待支付确认…",
    waitingTick: "等待确认中…",
    paid: "✅ 已收到付款！Premium 已激活。打开 VPNFlow 应用即可使用。",
    hints: {
      bankqr: "打开银行应用扫描二维码 — 金额已自动填好，确认即可。",
      wechat: "打开微信扫描二维码并输入准确金额。",
      alipay: "打开支付宝扫描二维码并输入准确金额。",
      momo: "打开 MoMo 扫描二维码 — 金额已自动填好，确认即可。",
      other: "使用支付应用扫描二维码。",
    },
    errByCode: {
      invalid_email: "邮箱无效。",
      invalid_plan: "套餐无效。",
      bank_not_configured: "银行二维码尚未配置。",
      payos_not_configured: "PayOS 网关尚未配置。",
      internal: "服务器错误，请重试。",
    },
    dayUnit: "天",
    lifetimeNote: "一次性 · 永久",
    planNames: { monthly: "月度", quarterly: "3 个月", semiannual: "6 个月", yearly: "年度", lifetime: "终身" },
    successTitle: "支付成功！",
    successBody: "Premium 已为您的账户激活。重新打开 VPNFlow 应用 — 您会立即看到金色皇冠。",
    cancelTitle: "支付已取消",
    cancelBody: "未产生任何扣费。返回购买页面重试。",
  },
  ja: {
    htmlLang: "ja",
    pageTitle: "VPNFlow — プレミアム購入",
    sub: "アカウントに安全なVPNを解放します",
    dlTitle: "VPNFlowアプリを入手",
    dlSub: "アプリをお持ちでない場合：プラットフォームを選択",
    androidTitle: "APK を直接ダウンロード", androidTop: "Android 版をダウンロード", androidBadge: "APK", iosTop: "iPhone / iPad 版をダウンロード", iosBadge: "iOS (IPA)",
    macTop: "Mac 版をダウンロード", macBadge: "macOS", windowsTop: "Windows 版をダウンロード", windowsBadge: "Windows 10/11",
    androidLegacyLabel: "Fire TV / 旧端末",
    androidLegacySub: "Android 7.0 / 7.1 用 APK — Fire TV Stick 4K、旧型スマホ・テレビ",
    emailLabel: "VPNFlowアカウントのメール",
    leadTitle: "このデバイスに合ったインストーラーを受け取るにはメールアドレスを入力してください",
    leadBtn: "続ける",
    leadErr: "メールアドレスの形式が正しくありません。",
    leadSending: "確認中…",
    leadKnown: "このメールには既にアカウントがあります — お支払い後に Premium が有効になります。",
    leadOther: "別のプラットフォームを選ぶ",
    leadFor: "お使いのデバイスに推奨：",
    planLabel: "プランを選択",
    methodLabel: "支払い方法",
    bankName: "ベトナムの銀行", bankScan: "TPBank QRをスキャン",
    wechatScan: "QRをスキャン", alipayScan: "QRをスキャン", momoScan: "MoMo QR をスキャン",
    payosName: "PayOS決済", payosSub: "MoMo / QR / カード",
    inAppNote: "✅ アプリはインストール済みです —— 下のメールでアカウントを作成し、お支払いください。支払い後 Premium が自動で有効になります。",
    payBtn: "支払いQRを作成",
    note: "送金後、このメールでプレミアムが有効になります。",
    modalTitle: "QRをスキャンして支払う",
    qrAlt: "支払いQR",
    close: "閉じる",
    saveQr: "QR画像を保存",
    saveQrHint: "QRをタップして写真に保存し、銀行アプリで保存した画像をスキャンしてください。",
    mini: "照合用に注文番号をお控えください。確認後、プレミアムは自動的に有効になります。",
        privacyLabel: "プライバシーポリシー",
    supportLabel: "サポート",
        noteExtra: "Pro は上に入力したメールに有効化されます。送金後 10 分以上経っても有効にならない場合は support@meetflowai.site までご連絡ください。",
        deviceNote: "1つのアカウントは最大3台のデバイスで利用できます。機種変更時は古いデバイスを1台削除してください。",
        howToTitle: "購入後の有効化方法",
    iosLineIpa: "上の IPA をダウンロードして iPhone/iPad にインストールし、このページで使った同じメールでサインインすると Premium が有効になります。",
    adhocTitle: "iPhone / iPad にインストール（Ad Hoc）",
    adhocSteps: ["<b>インストールする iPhone/iPad の Safari でこのページを開いてください</b>（Chrome やアプリ内ブラウザは不可）。", "「この端末を登録」をタップ → プロファイルをインストール（iOS が端末 ID / UDID を送信します）。", "ショップが UDID を Apple に追加して端末用に再署名します（通常 1〜2 分）—— このページは自動更新されます。", "「インストール」をタップ。「信頼されていないデベロッパ」と出たら: <b>設定 → 一般 → VPN とデバイス管理</b> → <b>信頼</b>。"],
    macAdhocTitle: "Mac にインストール（直接ダウンロード）",
    macAdhocSteps: ["上の .dmg インストーラをダウンロードして開きます。", "<b>VPNFlow</b> を <b>Applications（アプリケーション）</b>フォルダへドラッグ。", "「開発元を確認できない」と出たら：アプリを<b>右クリック</b> → <b>Open</b> → もう一度 <b>Open</b>、または <b>System Settings → Privacy &amp; Security</b> → <b>Open Anyway</b>。", "VPNFlow を開き、購入時のメールでサインインし、VPN 構成の許可を求められたら <b>Allow</b> をクリックして <b>Connect</b>。", "それでも開けない場合（<i>“VPNFlow is damaged”</i> と表示）：<b>Terminal</b> を開き <code>xattr -dr com.apple.quarantine /Applications/VPNFlow.app</code> を実行し、アプリを開き直してください。"],
    iosLineStore: "App Store で配信中 — インストール後、このページで使った同じメールでサインインすると Premium が有効になります。",
    iosLineSoon: "iOS 版は近日公開予定です。",
    androidLine: "Android は直接インストールが必要です：上の APK をダウンロードし、「提供元不明のアプリ」を許可してから開いてください。", windowsLine: "Windows も直接インストールします。上のインストーラーをダウンロードして実行し（トンネル作成のため管理者権限を求められます）、アプリを開いて同じメールでサインインしてください。",
    steps: ["アプリをダウンロードしてインストール（iOS：上の IPA · Android：上の APK）。", "アプリを開き、このページで使った同じメールでサインインします。", "Premium は自動的に有効になります — コード入力は不要です。"],
        cnyNote: "WeChat Pay / Alipay は人民元（CNY）決済です — 金額は次のレートで換算：",
        cnyEnter: "お支払いの際は、QR に表示された人民元の金額を入力してください。",
        amountPrefilled: "金額はQRに含まれています — 読み取って確認するだけです。",
        copyAmount: "金額をコピー",
        amountReminder: "この金額をそのまま送金してください。",
        planChosen: "選択中のプラン：",
        copyOrder: "参照番号をコピー",
        orderNoteHint: "振込メモに貼り付けてください：",
    copied: "コピーしました",
        guideLink: "📖 順を追った有効化ガイドを見る",
        renewPrefill: "更新リンク — メールとプランは入力済みです。支払い方法を選んでQRをスキャンするだけです。",
    errNoEmail: "アカウントのメールを入力してください。",
    creating: "支払いコードを作成中…",
    errCreate: "支払いを作成できませんでした。",
    errNoCode: "支払いコードを作成できませんでした。",
    errNoConn: "サーバーに接続できません。もう一度お試しください。",
    orderPrefix: "注文番号：",
    waiting: "支払い確認を待っています…",
    waitingTick: "確認待ち…",
    paid: "✅ 支払いを確認しました！プレミアムが有効になりました。VPNFlowアプリを開いてご利用ください。",
    hints: {
      bankqr: "銀行アプリを開いてQRをスキャンしてください — 金額は自動入力されます。",
      wechat: "WeChatを開き、QRをスキャンして正確な金額を入力してください。",
      alipay: "Alipayを開き、QRをスキャンして正確な金額を入力してください。",
      momo: "MoMo を開いて QR をスキャンしてください — 金額は自動入力されます。",
      other: "支払いアプリでQRをスキャンしてください。",
    },
    errByCode: {
      invalid_email: "メールアドレスが無効です。",
      invalid_plan: "プランが無効です。",
      bank_not_configured: "銀行QRが設定されていません。",
      payos_not_configured: "PayOS決済が設定されていません。",
      internal: "サーバーエラーです。もう一度お試しください。",
    },
    dayUnit: "日",
    lifetimeNote: "一回 · 永久",
    planNames: { monthly: "月額", quarterly: "3か月", semiannual: "6か月", yearly: "年額", lifetime: "永久" },
    successTitle: "支払いが完了しました！",
    successBody: "プレミアムがアカウントに有効になりました。VPNFlowアプリを開き直すと、すぐに金色のクラウンが表示されます。",
    cancelTitle: "支払いはキャンセルされました",
    cancelBody: "料金は請求されていません。購入ページに戻ってお試しください。",
  },
  ko: {
    htmlLang: "ko",
    pageTitle: "VPNFlow — 프리미엄 구매",
    sub: "계정에 안전한 VPN을 활성화하세요",
    dlTitle: "VPNFlow 앱 받기",
    dlSub: "아직 앱이 없으신가요? 플랫폼을 선택하세요:",
    androidTitle: "APK 직접 다운로드", androidTop: "Android용 다운로드", androidBadge: "APK", iosTop: "iPhone / iPad용 다운로드", iosBadge: "iOS (IPA)",
    macTop: "Mac용 다운로드", macBadge: "macOS", windowsTop: "Windows용 다운로드", windowsBadge: "Windows 10/11",
    androidLegacyLabel: "Fire TV / 구형 기기",
    androidLegacySub: "Android 7.0 / 7.1용 APK — Fire TV Stick 4K, 구형 휴대폰·TV",
    emailLabel: "VPNFlow 계정 이메일",
    leadTitle: "이 기기에 맞는 설치 파일을 받으려면 이메일을 입력하세요",
    leadBtn: "계속",
    leadErr: "이메일 형식이 올바르지 않습니다.",
    leadSending: "확인 중…",
    leadKnown: "이 이메일에는 이미 계정이 있습니다 — 결제 후 Premium이 활성화됩니다.",
    leadOther: "다른 플랫폼 선택",
    leadFor: "기기에 권장:",
    planLabel: "요금제 선택",
    methodLabel: "결제 수단",
    bankName: "베트남 은행", bankScan: "TPBank QR 스캔",
    wechatScan: "QR 스캔", alipayScan: "QR 스캔", momoScan: "MoMo QR 스캔",
    payosName: "PayOS 결제", payosSub: "MoMo / QR / 카드",
    inAppNote: "✅ 앱은 이미 설치되어 있습니다 — 아래 이메일로 계정을 만들고 결제만 하시면 됩니다. 결제 후 Premium이 자동으로 켜집니다.",
    payBtn: "결제 QR 만들기",
    note: "송금 후 이 이메일로 프리미엄이 활성화됩니다.",
    modalTitle: "QR을 스캔하여 결제",
    qrAlt: "결제 QR",
    close: "닫기",
    saveQr: "QR 이미지 저장",
    saveQrHint: "QR을 눌러 사진에 저장한 뒤, 은행 앱에서 저장된 이미지를 스캔하세요.",
    mini: "대조용으로 주문번호를 보관하세요. 확인 후 프리미엄이 자동으로 활성화됩니다.",
        privacyLabel: "개인정보 처리방침",
    supportLabel: "지원",
        noteExtra: "Pro는 위에 입력한 이메일로 활성화됩니다. 송금 후 10분이 지나도 활성화되지 않으면 support@meetflowai.site로 문의하세요.",
        deviceNote: "계정 1개는 최대 3대의 기기에서 사용할 수 있습니다. 기기를 변경하려면 이전 기기를 먼저 삭제하세요.",
        howToTitle: "구매 후 활성화 방법",
    iosLineIpa: "위의 IPA를 내려받아 iPhone/iPad에 설치한 뒤, 이 페이지에서 사용한 동일한 이메일로 로그인하면 Premium이 자동 활성화됩니다.",
    adhocTitle: "iPhone / iPad에 설치 (Ad Hoc)",
    adhocSteps: ["<b>설치할 iPhone/iPad의 Safari에서 이 페이지를 여세요</b> (Chrome, 앱 내 브라우저는 설치 불가).", "「이 기기 등록」을 눌러 프로파일을 설치하세요 (iOS가 기기 ID / UDID를 전송합니다).", "판매자가 UDID를 Apple에 추가하고 기기용으로 다시 서명합니다 (보통 1~2분) — 이 페이지는 자동 갱신됩니다.", "「설치」를 누르세요. “신뢰할 수 없는 개발자”가 뜨면: <b>설정 → 일반 → VPN 및 기기 관리</b> → <b>신뢰</b>."],
    macAdhocTitle: "Mac에 설치 (직접 다운로드)",
    macAdhocSteps: ["위의 .dmg 설치 파일을 내려받아 엽니다.", "<b>VPNFlow</b>를 <b>Applications(응용 프로그램)</b> 폴더로 드래그하세요.", "“개발자를 확인할 수 없습니다”가 뜨면: 앱을 <b>오른쪽 클릭</b> → <b>Open</b> → 다시 <b>Open</b>, 또는 <b>System Settings → Privacy &amp; Security</b> → <b>Open Anyway</b>.", "VPNFlow를 열고 구매 이메일로 로그인한 뒤, macOS가 VPN 구성을 물으면 <b>Allow</b>를 누르고 <b>Connect</b>를 클릭하세요.", "그래도 열리지 않으면(<i>“VPNFlow is damaged”</i> 표시): <b>Terminal</b>을 열고 <code>xattr -dr com.apple.quarantine /Applications/VPNFlow.app</code> 실행 후 앱을 다시 여세요."],
    iosLineStore: "App Store에서 제공 중 — 설치 후 이 페이지에서 사용한 동일한 이메일로 로그인하면 Premium이 자동으로 활성화됩니다.",
    iosLineSoon: "iOS 버전이 곧 출시됩니다.",
    androidLine: "Android는 직접 설치해야 합니다: 위의 APK를 내려받아 \"알 수 없는 출처\" 설치를 허용한 뒤 앱을 여세요.", windowsLine: "Windows도 직접 설치합니다. 위 설치 파일을 내려받아 실행하고(터널 생성에 관리자 권한이 필요합니다), 앱을 열어 같은 이메일로 로그인하세요.",
    steps: ["앱을 내려받아 설치합니다 (iOS: 위의 IPA · Android: 위의 APK).", "앱을 열고 이 페이지에서 사용한 동일한 이메일로 로그인합니다.", "Premium이 자동으로 활성화됩니다 — 코드 입력이 필요 없습니다."],
        cnyNote: "WeChat Pay / Alipay는 위안화(CNY) 결제입니다 — 금액은 다음 환율로 환산:",
        cnyEnter: "결제 시 QR에 표시된 위안 금액을 정확히 입력하세요.",
        amountPrefilled: "금액이 QR에 포함되어 있습니다 — 스캔 후 확인만 하면 됩니다.",
        copyAmount: "금액 복사",
        amountReminder: "이 금액을 정확히 이체하세요.",
        planChosen: "선택한 요금제:",
        copyOrder: "입금 메모 복사",
        orderNoteHint: "이체 메모에 붙여넣으세요:",
    copied: "복사됨",
        guideLink: "📖 단계별 활성화 안내 보기",
        renewPrefill: "갱신 링크 — 이메일과 요금제가 미리 입력되어 있습니다. 결제 수단을 고르고 QR만 스캔하세요.",
    errNoEmail: "계정 이메일을 입력하세요.",
    creating: "결제 코드 생성 중…",
    errCreate: "결제를 만들 수 없습니다.",
    errNoCode: "결제 코드를 만들 수 없습니다.",
    errNoConn: "서버에 연결할 수 없습니다. 다시 시도하세요.",
    orderPrefix: "주문번호: ",
    waiting: "결제 확인을 기다리는 중…",
    waitingTick: "확인 대기 중…",
    paid: "✅ 결제가 확인되었습니다! 프리미엄이 활성화되었습니다. VPNFlow 앱을 열어 사용하세요.",
    hints: {
      bankqr: "은행 앱을 열고 QR을 스캔하세요 — 금액이 자동으로 입력됩니다.",
      wechat: "WeChat을 열고 QR을 스캔한 뒤 정확한 금액을 입력하세요.",
      alipay: "Alipay를 열고 QR을 스캔한 뒤 정확한 금액을 입력하세요.",
      momo: "MoMo를 열고 QR을 스캔하세요 — 금액이 자동으로 입력됩니다.",
      other: "결제 앱으로 QR을 스캔하세요.",
    },
    errByCode: {
      invalid_email: "이메일이 올바르지 않습니다.",
      invalid_plan: "요금제가 올바르지 않습니다.",
      bank_not_configured: "은행 QR이 설정되지 않았습니다.",
      payos_not_configured: "PayOS 결제가 설정되지 않았습니다.",
      internal: "서버 오류입니다. 다시 시도하세요.",
    },
    dayUnit: "일",
    lifetimeNote: "1회 · 평생",
    planNames: { monthly: "월간", quarterly: "3개월", semiannual: "6개월", yearly: "연간", lifetime: "평생" },
    successTitle: "결제가 완료되었습니다!",
    successBody: "계정에 프리미엄이 활성화되었습니다. VPNFlow 앱을 다시 열면 바로 금색 왕관이 보입니다.",
    cancelTitle: "결제가 취소되었습니다",
    cancelBody: "요금이 청구되지 않았습니다. 구매 페이지로 돌아가 다시 시도하세요.",
  },
};

/* =====================================================================
 * MeetFlow AI (second product) — same web-paywall flow, own plans/brand.
 * 30-day pass / Monthly / Yearly, QR (VietQR) + WeChat + Alipay.
 * ================================================================== */

export const AI_PLANS = {
  pass30:  { amount: 150000,  days: 30,  oneTime: true,
             label: "MeetFlow Pro 30-Day Pass (150,000 VND / 30 days, one-time, NO auto-renewal)",
             badge: "30-Day Pass" },
  monthly: { amount: 130000,  days: 30,  label: "MeetFlow Pro Monthly (130,000 VND / 30 days)",     badge: "Monthly" },
  yearly:  { amount: 1050000, days: 365, label: "MeetFlow Pro Yearly (1,050,000 VND / 365 days)",   badge: "Yearly" },
};

const AI_TEXTS = {
  en: {
    dlTitle: "Get the MeetFlow AI app",
    dlSub: "Don't have the app yet? Download it here:",
        iosLineStore: "Available on the App Store — subscribe inside the iOS app with Apple.",
    steps: ["Buy on this page and keep the email you entered.", "Android: download the APK above and install it (allow installs from unknown sources).", "Open the app → upgrade screen → \"Bought on the web?\" → enter this email → tap Activate Pro."],
    pageTitle: "MeetFlow AI — Buy Pro",
    sub: "Unlock AI translation and meeting minutes",
    logoHtml: "Meet<span>Flow</span> AI",
    paid: "✅ Payment received! Pro is active. Open the MeetFlow AI app to use it.",
    successTitle: "Payment successful!",
    successBody: "Pro has been activated for your account. Reopen the MeetFlow AI app — your Pro features are ready.",
    cancelTitle: "Payment cancelled",
    cancelBody: "No charge was made. Go back to the buy page to try again.",
    pass30Note: "one-time · no auto-renewal",
    renewNote: "The 30-day plan is a one-time purchase — it does NOT renew automatically. Buy again whenever you want another 30 days.",
    planNames: { pass30: "30-Day Pass", monthly: "Monthly", yearly: "Yearly" },
  },
  vi: {
    dlTitle: "Tải app MeetFlow AI",
    dlSub: "Chưa có app? Tải về tại đây:",
        iosLineStore: "Đã có trên App Store — gói được mua trực tiếp trong app iOS qua Apple.",
    steps: ["Mua trên trang này và giữ lại email bạn đã nhập.", "Android: tải file APK ở trên và cài vào máy (bật \"Cài từ nguồn không xác định\").", "Mở app → màn hình nâng cấp → \"Đã mua trên web?\" → nhập email vừa mua → bấm Kích hoạt Pro."],
    pageTitle: "MeetFlow AI — Mua Pro",
    sub: "Mở khoá dịch AI và biên bản cuộc họp",
    logoHtml: "Meet<span>Flow</span> AI",
    paid: "✅ Đã nhận thanh toán! Pro đã kích hoạt. Mở app MeetFlow AI để dùng.",
    successTitle: "Thanh toán thành công!",
    successBody: "Pro đã được kích hoạt cho tài khoản của bạn. Mở lại app MeetFlow AI — tính năng Pro đã sẵn sàng.",
    cancelTitle: "Đã huỷ thanh toán",
    cancelBody: "Không có khoản phí nào bị trừ. Quay lại trang mua để thử lại.",
    pass30Note: "mua một lần · không tự động gia hạn",
    renewNote: "Gói 30 ngày là mua một lần — KHÔNG tự động gia hạn. Muốn dùng tiếp 30 ngày nữa thì mua lại.",
    planNames: { pass30: "Gói 30 ngày", monthly: "Hàng tháng", yearly: "Hàng năm" },
  },
  zh: {
    dlTitle: "获取 MeetFlow AI 应用",
    dlSub: "还没有应用？在此下载：",
        iosLineStore: "已在 App Store 上架 — 请在 iOS 应用内通过 Apple 订阅。",
    steps: ["在本页购买，并记住您填写的邮箱。", "Android：下载上方 APK 并安装（允许“未知来源”安装）。", "打开应用 → 升级页面 → “已在网页购买？” → 输入该邮箱 → 点击“激活 Pro”。"],
    pageTitle: "MeetFlow AI — 购买 Pro",
    sub: "解锁 AI 翻译与会议纪要",
    logoHtml: "Meet<span>Flow</span> AI",
    paid: "✅ 已收到付款！Pro 已激活。打开 MeetFlow AI 应用即可使用。",
    successTitle: "支付成功！",
    successBody: "Pro 已为您的账户激活。重新打开 MeetFlow AI 应用即可使用 Pro 功能。",
    cancelTitle: "支付已取消",
    cancelBody: "未产生任何扣费。返回购买页面重试。",
    pass30Note: "一次性 · 不会自动续费",
    renewNote: "30 天套餐为一次性购买 — 不会自动续费。需要再用 30 天时请重新购买。",
    planNames: { pass30: "30 天通行证", monthly: "月度", yearly: "年度" },
  },
  ja: {
    dlTitle: "MeetFlow AI アプリを入手",
    dlSub: "アプリをお持ちでない場合はこちらから：",
        iosLineStore: "App Store で配信中 — iOS アプリ内で Apple 経由でご購入ください。",
    steps: ["このページで購入し、入力したメールを控えてください。", "Android：上の APK をダウンロードしてインストール（提供元不明を許可）。", "アプリを開く → アップグレード画面 → 「ウェブで購入済み？」 → このメールを入力 → 「Pro を有効化」をタップ。"],
    pageTitle: "MeetFlow AI — Pro を購入",
    sub: "AI翻訳と議事録を解放",
    logoHtml: "Meet<span>Flow</span> AI",
    paid: "✅ 支払いを確認しました！Pro が有効になりました。MeetFlow AI アプリを開いてご利用ください。",
    successTitle: "支払いが完了しました！",
    successBody: "Pro がアカウントに有効になりました。MeetFlow AI アプリを開き直してください。",
    cancelTitle: "支払いはキャンセルされました",
    cancelBody: "料金は請求されていません。購入ページに戻ってお試しください。",
    pass30Note: "一回のみ · 自動更新なし",
    renewNote: "30日パスは買い切りのプランです — 自動更新はありません。さらに30日ご利用になる場合は再度ご購入ください。",
    planNames: { pass30: "30日パス", monthly: "月額", yearly: "年額" },
  },
  ko: {
    dlTitle: "MeetFlow AI 앱 받기",
    dlSub: "아직 앱이 없으신가요? 여기에서 받으세요:",
        iosLineStore: "App Store에서 제공 중 — iOS 앱 안에서 Apple을 통해 구독하세요.",
    steps: ["이 페이지에서 구매하고 입력한 이메일을 기억해 두세요.", "Android: 위의 APK를 내려받아 설치하세요(알 수 없는 출처 허용).", "앱 열기 → 업그레이드 화면 → \"웹에서 구매하셨나요?\" → 이 이메일 입력 → \"Pro 활성화\" 탭."],
    pageTitle: "MeetFlow AI — Pro 구매",
    sub: "AI 번역과 회의록 잠금 해제",
    logoHtml: "Meet<span>Flow</span> AI",
    paid: "✅ 결제가 확인되었습니다! Pro가 활성화되었습니다. MeetFlow AI 앱을 열어 사용하세요.",
    successTitle: "결제가 완료되었습니다!",
    successBody: "계정에 Pro가 활성화되었습니다. MeetFlow AI 앱을 다시 열어 주세요.",
    cancelTitle: "결제가 취소되었습니다",
    cancelBody: "요금이 청구되지 않았습니다. 구매 페이지로 돌아가 다시 시도하세요.",
    pass30Note: "1회 구매 · 자동 갱신 없음",
    renewNote: "30일 이용권은 1회 구매 상품이며 자동 갱신되지 않습니다. 30일을 더 이용하려면 다시 구매하세요.",
    planNames: { pass30: "30일 이용권", monthly: "월간", yearly: "연간" },
  },
};

const AI_PLAN_ORDER = ["pass30", "monthly", "yearly"];

/** Resolves product config (plans, texts, api paths, brand) for a page. */
function productConfig(product) {
  return product === "ai" ? "ai" : "vpn";
}

/** Brand assets + legal/support links per product (shown on the buy page). */
const PRODUCT_META = {
  vpn: {
    logoPath: "/assets/vpnflow-logo.png",
    brandName: "VPNFlow",
    privacyUrl: "https://t1.meetflowai.site/FlowVPNPrivacy.html",
    supportUrl: "https://t1.meetflowai.site/SupportPrivateVPN.html",
  },
  ai: {
    logoPath: "/assets/meetflow-logo.png",
    brandName: "MeetFlow AI",
    privacyUrl: "https://t1.meetflowai.site/privacy",
    supportUrl: "https://t1.meetflowai.site/support.html",
  },
};

/** Plan list in display order with localized names + price text. */
/**
 * VND → CNY for the Chinese payment methods.
 *
 * WeChat Pay and Alipay are settled by scanning a personal QR and typing the
 * amount by hand, so the customer needs a CNY figure. The rate comes from a free
 * daily feed, is cached for 6 hours, can be pinned with VND_PER_CNY, and falls
 * back to the last known / default rate so the page never renders without a
 * price. A swing of more than 30% is treated as a bad feed rather than passed
 * on to customers.
 */
const DEFAULT_VND_PER_CNY = Number(process.env.VND_PER_CNY ?? 3880);
const CNY_CACHE_MS = 6 * 60 * 60 * 1000;
let cnyCache = { rate: null, at: 0, source: null };
let envRateLogged = false;

export async function vndPerCny() {
  if (process.env.VND_PER_CNY) {
    // Pinned by the shop: no rate feed, no drift. Logged once so ops can see
    // which mode is active without spamming every page render.
    if (!envRateLogged) {
      envRateLogged = true;
      console.log(`CNY rate: pinned at 1 CNY = ${Math.round(DEFAULT_VND_PER_CNY)} VND (env:VND_PER_CNY)`);
    }
    return { rate: DEFAULT_VND_PER_CNY, at: null, source: "env:VND_PER_CNY" };
  }
  if (cnyCache.rate && Date.now() - cnyCache.at < CNY_CACHE_MS) return cnyCache;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/VND", { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const rate = 1 / Number(data?.rates?.CNY);
    if (!Number.isFinite(rate) || rate < 1000 || rate > 20000) throw new Error(`rate out of range: ${rate}`);
    const reference = cnyCache.rate ?? DEFAULT_VND_PER_CNY;
    if (Math.abs(rate - reference) / reference > 0.3) {
      throw new Error(`rate moved >30% (${Math.round(rate)} vs ${Math.round(reference)})`);
    }
    cnyCache = { rate, at: Date.now(), source: "open.er-api.com" };
    console.log(`CNY rate: 1 CNY = ${Math.round(rate)} VND (${cnyCache.source}, cached 6h)`);
    return cnyCache;
  } catch (err) {
    console.error("CNY rate unavailable:", err?.message ?? err);
    return {
      rate: cnyCache.rate ?? DEFAULT_VND_PER_CNY,
      at: cnyCache.at || null,
      source: cnyCache.rate ? "cache" : "default",
    };
  }
}

/**
 * VND → USD for international visitors, same shape as the CNY helper: env
 * override, 6h cache, sanity clamp, and a fallback so the page always renders.
 */
const DEFAULT_VND_PER_USD = Number(process.env.VND_PER_USD ?? 25600);
let usdCache = { rate: null, at: 0, source: null };
let usdRateLogged = false;

export async function vndPerUsd() {
  if (process.env.VND_PER_USD) {
    if (!usdRateLogged) {
      usdRateLogged = true;
      console.log(`USD rate: pinned at 1 USD = ${Math.round(DEFAULT_VND_PER_USD)} VND (env:VND_PER_USD)`);
    }
    return { rate: DEFAULT_VND_PER_USD, at: null, source: "env:VND_PER_USD" };
  }
  if (usdCache.rate && Date.now() - usdCache.at < CNY_CACHE_MS) return usdCache;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/VND", { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const rate = 1 / Number(data?.rates?.USD);
    if (!Number.isFinite(rate) || rate < 5000 || rate > 100000) throw new Error(`rate out of range: ${rate}`);
    const reference = usdCache.rate ?? DEFAULT_VND_PER_USD;
    if (Math.abs(rate - reference) / reference > 0.3) {
      throw new Error(`rate moved >30% (${Math.round(rate)} vs ${Math.round(reference)})`);
    }
    usdCache = { rate, at: Date.now(), source: "open.er-api.com" };
    console.log(`USD rate: 1 USD = ${Math.round(rate)} VND (${usdCache.source}, cached 6h)`);
    return usdCache;
  } catch (err) {
    console.error("USD rate unavailable:", err?.message ?? err);
    return {
      rate: usdCache.rate ?? DEFAULT_VND_PER_USD,
      at: usdCache.at || null,
      source: usdCache.rate ? "cache" : "default",
    };
  }
}

/**
 * Which currency to show as the headline price.
 *
 * The visitor's language is the signal we already have (the page is chosen by
 * ?lang= or Accept-Language): Chinese pages price in CNY because that is what
 * WeChat/Alipay customers actually hand over, Vietnamese in dong, everyone else
 * in USD with the dong figure alongside. `?cur=` overrides it.
 */
export function displayCurrencyFor({ lang = "vi", cur = "" } = {}) {
  const forced = String(cur ?? "").trim().toUpperCase();
  if (["VND", "CNY", "USD"].includes(forced)) return forced;
  const code = pickBuyLang(lang);
  if (code === "vi") return "VND";
  if (code === "zh") return "CNY";
  return "USD";
}

/** ¥ amount, rounded up to a whole yuan (the customer types it by hand). */
/**
 * Ảnh QR nhận tiền của chủ shop nằm trong `PAY_QR_DIR` (mặc định `/root/flowvpn-pay`).
 * Thứ tự ưu tiên — cái đầu tiên có trên đĩa sẽ được dùng:
 *
 *   1. `<kênh>-<gói>.<ext>`            (VPNFlow)      ví dụ `wechat-monthly.jpg`
 *      `<kênh>-ai-<gói>.<ext>`         (MeetFlow AI)  ví dụ `wechat-ai-monthly.jpg`
 *   2. `<kênh>-<số ¥>.<ext>`           ảnh đặt theo số tiền, ví dụ `wechat-58.png`
 *   3. `<kênh>-ai.<ext>` (AI) rồi `<kênh>.<ext>` — ảnh chung, khách tự nhập số tiền
 *
 * Ảnh theo GÓI được ưu tiên hơn ảnh theo số ¥ vì giá gói là thứ khách chọn, còn tỷ giá CNY
 * đổi theo ngày nên tên file theo số ¥ sẽ lệch. Ảnh của MeetFlow AI phải có `-ai-` để không
 * hiển nhầm ảnh giá của VPNFlow (200.000đ ≠ 130.000đ).
 *
 * `prefilled: true` = trong ảnh đã có sẵn số tiền, khách quét là ra đúng số, không phải nhập.
 */
export function resolveQrFile(dir, name, { cny = null, plan = null, product = "vpn" } = {}) {
  const exts = ["png", "jpg", "jpeg", "webp"];
  const safePlan = plan ? String(plan).replace(/[^a-z0-9_-]/gi, "") : "";
  const safeName = String(name).replace(/[^a-z0-9_-]/gi, "");
  const bases = [];
  if (safePlan) bases.push(product === "ai" ? `${safeName}-ai-${safePlan}` : `${safeName}-${safePlan}`);
  const cnyValue = Number(cny);
  if (Number.isFinite(cnyValue) && cnyValue > 0) bases.push(`${safeName}-${Math.round(cnyValue)}`);
  if (product === "ai") bases.push(`${safeName}-ai`);
  const generic = `${safeName}`;
  bases.push(generic);

  for (const base of bases) {
    for (const ext of exts) {
      // Ảnh chủ shop tải lên có thể là .JPG (viết hoa) — thử cả hai kiểu tên.
      for (const candidate of [`${base}.${ext}`, `${base}.${ext.toUpperCase()}`]) {
        const file = path.join(dir, candidate);
        if (fs.existsSync(file)) {
          return { file, variant: candidate, prefilled: base !== generic };
        }
      }
    }
  }
  return { file: path.join(dir, `${generic}.png`), variant: `${generic}.png`, prefilled: false, missing: true };
}

/**
 * Số ¥ thật in trong ảnh QR (do chủ shop đặt bằng "设置金额" của WeChat/Alipay).
 * Đọc từ `PAY_QR_DIR/qr-amounts.json` dạng `{"wechat-monthly.jpg": 58}` để trang buy hiện
 * ĐÚNG con số khách sẽ thấy trong ví, thay vì số quy đổi theo tỷ giá (có thể lệch 1 ¥).
 * Đọc lại khi file đổi (cache theo mtime) nên sửa file là có hiệu lực ngay, không cần restart.
 */
export function qrAmountsFor(dir) {
  const file = path.join(dir, "qr-amounts.json");
  try {
    const stat = fs.statSync(file);
    if (qrAmountsCache.file === file && qrAmountsCache.mtime === stat.mtimeMs) return qrAmountsCache.data;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const data = parsed && typeof parsed === "object" ? parsed : {};
    qrAmountsCache = { file, mtime: stat.mtimeMs, data };
    return data;
  } catch {
    return {};
  }
}

let qrAmountsCache = { file: null, mtime: 0, data: {} };

export function cnyFromVnd(amountVnd, rate) {
  const r = Number(rate) > 0 ? Number(rate) : DEFAULT_VND_PER_CNY;
  return Math.max(1, Math.ceil(Number(amountVnd) / r));
}

/** $ amount, rounded to the nearest cent — this figure is informational. */
export function usdVndToUsd(amountVnd, rate) {
  const r = Number(rate) > 0 ? Number(rate) : DEFAULT_VND_PER_USD;
  return Math.max(0.01, Math.round((Number(amountVnd) / r) * 100) / 100);
}

export function fmtCny(amount) {
  return "¥" + Number(amount).toLocaleString("en-US");
}

export function fmtUsd(amount) {
  return "$" + Number(amount).toFixed(2);
}

/** Formats an amount in one of the three currencies. */
export function fmtMoney(currency, amountVnd, { lang = "vi", cnyRate = null, usdRate = null } = {}) {
  if (currency === "CNY") return fmtCny(cnyFromVnd(amountVnd, cnyRate ?? DEFAULT_VND_PER_CNY));
  if (currency === "USD") return fmtUsd(usdVndToUsd(amountVnd, usdRate ?? DEFAULT_VND_PER_USD));
  return fmtAmount(lang, amountVnd);
}

/**
 * Plan rows for the page: localized name, the headline price in the visitor's
 * currency, and the amounts they will actually hand over (dong for bank
 * transfer/MoMo, yuan for WeChat/Alipay).
 */
export function localizedPlanRows(lang, product = "vpn", options = {}) {
  const { cnyRate = null, usdRate = null, currency = "VND" } = options;
  const base = TEXTS[lang] || TEXTS.vi;
  const t = product === "ai" ? { ...base, ...(AI_TEXTS[lang] || AI_TEXTS.vi) } : base;
  const table = product === "ai" ? AI_PLANS : PLANS;
  // Retired plans are filtered out, so the buy page never offers them.
  // Thứ tự hiển thị = thứ tự trong bảng gói (gói admin thêm mới nằm cuối).
  const order = (product === "ai" ? AI_PLAN_ORDER : Object.keys(PLANS))
    .filter((id) => table[id] && table[id].retired !== true);
  return order.map((id) => {
    const p = table[id];
    const period = p.days ? " / " + p.days + " " + t.dayUnit : " · " + base.lifetimeNote;
    // Tên gói: bản địa hoá theo id với các gói có sẵn; gói admin tự thêm chưa có
    // tên trong bảng dịch thì dùng `badge` (ngắn) rồi mới tới `label`, để gói mới
    // không hiện "undefined" trên trang bán hàng.
    const planName = t.planNames?.[id] || p.badge || p.label || id;
    // Ghi chú "mua một lần · không tự động gia hạn" chỉ để ở TÊN gói: lặp lại ở dòng giá
    // làm hàng gói AI không vừa màn hình điện thoại.
    const label = p.oneTime && t.pass30Note ? planName + " · " + t.pass30Note : planName;
    const main = fmtMoney(currency, p.amount, { lang, cnyRate, usdRate }) + period;
    // The other two currencies, small, so nobody has to guess what they pay.
    const others = ["VND", "CNY", "USD"]
      .filter((c) => c !== currency)
      .map((c) => fmtMoney(c, p.amount, { lang, cnyRate, usdRate }));
    return {
      id,
      name: label,
      price: main,
      sub: "≈ " + others.join(" · "),
      amount: p.amount,
      cny: cnyRate ? cnyFromVnd(p.amount, cnyRate) : null,
      usd: usdRate ? usdVndToUsd(p.amount, usdRate) : null,
    };
  });
}

/**
 * Tên gói đã bản địa hoá, dùng cho hoá đơn email.
 *
 * `PLANS[id].label` là tiếng Anh và gắn cả giá ("Monthly (200,000 VND / 30 days)"), nên
 * khách Việt/Trung trước đây nhận hoá đơn có tên gói tiếng Anh. Hoá đơn đã có dòng
 * "Số tiền"/"Thời hạn" riêng, vì vậy ở đây chỉ cần ĐÚNG TÊN GÓI theo ngôn ngữ khách chọn,
 * lấy cùng nguồn chữ với trang bán hàng (`localizedPlanRows`).
 */
export function planNameFor(lang, product, planId) {
  const base = TEXTS[lang] || TEXTS.vi;
  const t = product === "ai" ? { ...base, ...(AI_TEXTS[lang] || AI_TEXTS.vi) } : base;
  const table = product === "ai" ? AI_PLANS : PLANS;
  const plan = table[planId];
  if (!plan) return "";
  // Gói admin thêm mới không có tên trong bảng dịch -> dùng badge/label của gói.
  return t.planNames?.[planId] || plan.badge || plan.label || planId;
}

/**
 * Nhận diện nền tảng của khách từ User-Agent để trang /buy hiện ĐÚNG bản cài.
 *
 * Chủ dự án chốt 26/09/2026: khách phải nhập email trước, rồi mới thấy bản tải; bản
 * hiện ra phải là bản của chính thiết bị đang mở trang. Không nhận ra (bot, UA lạ,
 * iPadOS giả Mac…) thì trả "unknown" ⇒ trang hiện đủ danh sách cho khách tự chọn.
 *
 * Thứ tự kiểm quan trọng: Android trước Linux/Mac, iOS trước Mac (iPad UA có "Mac OS X").
 *
 * @param {string} ua  giá trị header User-Agent
 * @returns {"ios"|"macos"|"android"|"windows"|"unknown"}
 */
export function detectBuyPlatform(ua) {
  const s = String(ua || "");
  if (/iPhone|iPod|iPad/i.test(s)) return "ios";
  if (/Android/i.test(s)) return "android";
  if (/Windows NT|Windows Phone|Win64|Win32|Windows/i.test(s)) return "windows";
  if (/Macintosh|Mac OS X/i.test(s)) return "macos";
  return "unknown";
}

/**
 * Khối "Tải app" của trang buy (tách khỏi buyPageHTML để endpoint /v1/buy/lead trả về
 * ĐÚNG khối này sau khi khách nhập email — trang chưa có email tuyệt đối không được
 * chứa link tải nào, xem docs/handoff/HANDOFF_BUY_EMAIL_GATE_2026-09-26.md).
 *
 * `platform` khi đã nhận diện được thì chỉ hiện bản của máy đó + nút "chọn nền tảng
 * khác"; khi "unknown" thì hiện đủ danh sách như trước.
 */
export function downloadsSectionHTML({ baseUrl, lang = "vi", product = "vpn", links = {}, platform = "unknown" }) {
  lang = pickBuyLang(lang);
  product = productConfig(product);
  const t = TEXTS[lang];
  const androidUrl = links.android || `${baseUrl}${product === "ai" ? "/v1/ai/downloads/android" : "/v1/downloads/android"}`;
  const androidLegacyUrl = links.androidLegacy || null;
  const iosUrl = links.ios || null;
  const iosAdhocUrl = links.iosAdhoc || `${baseUrl}/install/ios`;
  const macUrl = links.mac || null;
  const macAdhocUrl = product === "vpn" ? (links.macAdhoc || `${baseUrl}/install/mac`) : (links.macAdhoc || null);
  const windowsUrl = product === "vpn" ? (links.windows || `${baseUrl}/dl/VPNFlow-Setup-latest.exe`) : null;
  if (!(androidUrl || androidLegacyUrl || iosUrl || iosAdhocUrl || macUrl || macAdhocUrl || windowsUrl)) return "";
  const known = platform !== "unknown";
  // Nền tảng không phải của máy khách ⇒ ẩn (CSS .plat-hidden), nút "chọn nền tảng khác" mở lại.
  const hidden = (plat) => (known && platform !== plat ? ' class="plat-hidden"' : "");
  return `<div class="dl-section">
      <div class="dl-title">${known ? t.leadFor : t.dlTitle}</div>
      <div class="dl-sub">${known ? "" : t.dlSub}</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center;">
        ${iosUrl ? `<a href="${iosUrl}"${hidden("ios")} target="_blank" rel="noopener" title="${t.iosTop}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">${t.iosTop}</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.iosBadge}</text>
          </svg>
        </a>` : ""}
        ${!iosUrl && iosAdhocUrl ? `<a href="${iosAdhocUrl}"${hidden("ios")} target="_blank" rel="noopener" title="${t.iosTop}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">${t.iosTop}</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.iosBadge}</text>
          </svg>
        </a>` : ""}
        ${macUrl ? `<a href="${macUrl}"${hidden("macos")} target="_blank" rel="noopener" title="Download on the Mac App Store">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">Download on the</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Mac App Store</text>
          </svg>
        </a>` : macAdhocUrl ? `<a href="${macAdhocUrl}"${hidden("macos")} target="_blank" rel="noopener" title="${t.macTop}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">${t.macTop}</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.macBadge}</text>
          </svg>
        </a>` : ""}
        ${androidUrl ? `<a href="${androidUrl}"${hidden("android")} target="_blank" rel="noopener" title="${t.androidTitle}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(12 12) scale(0.058)">
              <path fill="#EA4335" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
              <path fill="#FBBC04" d="M47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0z"/>
              <path fill="#4285F4" d="M425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8z"/>
              <path fill="#34A853" d="M104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </g>
            <text x="45" y="20" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.5" fill="#fff" opacity="0.9">${t.androidTop}</text>
            <text x="45" y="34" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.androidBadge}</text>
          </svg>
        </a>` : ""}
        ${windowsUrl ? `<a href="${windowsUrl}"${hidden("windows")} target="_blank" rel="noopener" title="${t.windowsTop}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(13 14)">
              <rect x="0" y="0" width="10.5" height="10.5" fill="#F25022"/>
              <rect x="12" y="0" width="10.5" height="10.5" fill="#7FBA00"/>
              <rect x="0" y="12" width="10.5" height="10.5" fill="#00A4EF"/>
              <rect x="12" y="12" width="10.5" height="10.5" fill="#FFB900"/>
            </g>
            <text x="45" y="20" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.5" fill="#fff" opacity="0.9">${t.windowsTop}</text>
            <text x="45" y="34" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.windowsBadge}</text>
          </svg>
        </a>` : ""}
        ${androidLegacyUrl ? `<a href="${androidLegacyUrl}"${hidden("android")} target="_blank" rel="noopener" title="${t.androidLegacySub}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d" stroke="rgba(255,255,255,.18)"/>
            <g transform="translate(12 12) scale(0.058)">
              <path fill="#34A853" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
              <path fill="#FBBC04" d="M47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0z"/>
              <path fill="#4285F4" d="M425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8z"/>
              <path fill="#EA4335" d="M104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </g>
            <text x="45" y="20" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.5" fill="#fff" opacity="0.9">${t.androidLegacyLabel}</text>
            <text x="45" y="34" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Android 7.0+</text>
          </svg>
        </a>` : ""}
      </div>
      ${known ? `<div style="text-align:center; margin-top:12px;"><a href="#" id="dlOtherBtn" class="guidelnk">${t.leadOther}</a></div>` : ""}
    </div>`;
}

/** Buy page HTML — dark theme, email + plan + method picker. */
export function buyPageHTML({ baseUrl, lang, product = "vpn", links = {}, prefillEmail = "", prefillPlan = "", methods, cny = null, usd = null, cur = "", inApp = false, ua = "", emailVerified = true }) {
  lang = pickBuyLang(lang);
  product = productConfig(product);
  const base = TEXTS[lang];
  const t = product === "ai" ? { ...base, ...(AI_TEXTS[lang] || AI_TEXTS.vi) } : base;
  const apiPrefix = product === "ai" ? "/v1/ai/payments" : "/v1/payments";
  const logoHtml = product === "ai" ? t.logoHtml : 'VPN<span>Flow</span> Premium';
  const meta = PRODUCT_META[product];
  const logoUrl = `${baseUrl}${meta.logoPath}`;
  // Store / download links: injected by the server (APP_STORE_URL_* env vars,
  // APK endpoint). Badges render only for links that actually exist.
  const androidUrl = links.android || `${baseUrl}${product === "ai" ? "/v1/ai/downloads/android" : "/v1/downloads/android"}`;
  // Separate build for Fire TV / older devices (minSdk 24 instead of 26). Rendered
  // only when the server provides the link, so the page never shows a dead badge.
  const androidLegacyUrl = links.androidLegacy || null;
  const iosUrl = links.ios || null;
  const iosAdhocUrl = links.iosAdhoc || `${baseUrl}/install/ios`;
  const macUrl = links.mac || null;
  // Bản macOS cũng phát trực tiếp từ shop (file .zip/.dmg), không qua App Store:
  // khi không có link store thật, badge Mac trỏ về trang hướng dẫn /install/mac
  // (giống cách iOS trỏ /install/ios qua iosAdhocUrl). Chỉ áp dụng cho VPNFlow.
  const macAdhocUrl = product === "vpn" ? (links.macAdhoc || `${baseUrl}/install/mac`) : (links.macAdhoc || null);
  // Bộ cài Windows 1-click (Inno Setup), phát từ shop. Link cố định "-latest" nên trang
  // /buy không phải sửa mỗi lần ra bản mới; chỉ hiện cho kênh VPNFlow.
  const windowsUrl = product === "vpn" ? (links.windows || `${baseUrl}/dl/VPNFlow-Setup-latest.exe`) : null;
  const anyDownload = Boolean(androidUrl || androidLegacyUrl || iosUrl || iosAdhocUrl || macUrl || macAdhocUrl || windowsUrl);
  // Activation instructions adapt to how iOS is distributed right now.
  // Bản iOS phát bằng IPA từ server mình (không qua App Store), nên chỉ dùng câu
  // "Available on the App Store" khi link ios THỰC SỰ là link store. Link trỏ về
  // /v1/downloads/ios (hoặc IOS_IPA_URL) thì phải nói đúng là tải IPA.
  const iosIsStoreLink = /apps\.apple\.com|itunes\.apple\.com/.test(iosUrl ?? "");
  const iosLine = iosAdhocUrl
    ? (iosUrl && iosIsStoreLink ? t.iosLineStore : (t.iosLineIpa ?? t.iosLineStore))
    : t.iosLineSoon;
  const howToSteps = Array.isArray(t.steps) ? t.steps : [];
  // Bản iOS phát Ad Hoc: khách phải tự đăng ký máy trước khi shop ký được bản cài.
  // Chỉ hiện khối bước khi kênh iOS hiện tại ĐÚNG LÀ trang cài tự phát (không phải
  // link App Store) — nếu không, trang bán hàng sẽ nói sai về cách cài.
  const iosIsStore = /apps\.apple\.com|itunes\.apple\.com/.test(iosUrl ?? "");
  const iosAdhocStepsUrl = !iosIsStore ? (iosUrl && /\/install\/ios/.test(iosUrl) ? iosUrl : iosAdhocUrl) : null;
  const iosAdhocSteps = !inApp && iosAdhocStepsUrl && Array.isArray(t.adhocSteps) ? t.adhocSteps : null;
  // Khối hướng dẫn cài macOS (tải trực tiếp): song song với adhocSteps của iOS.
  // Chỉ hiện khi KHÔNG có link store thật (có store thì hướng dẫn kéo app là sai).
  const macAdhocStepsUrl = !inApp && !macUrl && macAdhocUrl ? macAdhocUrl : null;
  const macAdhocSteps = macAdhocStepsUrl && Array.isArray(t.macAdhocSteps) ? t.macAdhocSteps : null;
  const guideUrl = `${baseUrl}${product === "ai" ? "/ai/guide" : "/guide"}?lang=${lang}`;
  // Mở TRONG app (paywall): khách đã có app rồi ⇒ chỉ để lại ĐĂNG KÝ TÀI KHOẢN + THANH TOÁN,
  // bỏ hết khối tải/cài app và hướng dẫn cài (vô nghĩa và làm rối).
  const showDownloads = anyDownload && !inApp && emailVerified;
  // Bước email bắt buộc (chủ dự án chốt 26/09/2026): chưa có email hợp lệ thì trang
  // KHÔNG được chứa link tải nào và form thanh toán còn ẩn — xem
  // docs/handoff/HANDOFF_BUY_EMAIL_GATE_2026-09-26.md. Bản trong app (paywall) không gate
  // vì khách đã có app rồi, chỉ cần thanh toán.
  const showLeadGate = !inApp && !emailVerified;
  // WeChat Pay / Alipay are priced in CNY (the customer types the amount by
  // hand), and the headline price follows the visitor: dong for Vietnamese,
  // yuan for Chinese pages, dollars for everyone else. `?cur=` overrides.
  const cnyRate = Number(cny?.rate) > 0 ? Number(cny.rate) : DEFAULT_VND_PER_CNY;
  const cnySource = cny?.source ?? "default";
  const usdRate = Number(usd?.rate) > 0 ? Number(usd.rate) : DEFAULT_VND_PER_USD;
  const usdSource = usd?.source ?? "default";
  const displayCurrency = displayCurrencyFor({ lang, cur });
  // Server-side formatting (NUM_LOCALE only exists inside the page script).
  const cnyRateLabel = Math.round(cnyRate).toLocaleString("vi-VN");
  const usdRateLabel = Math.round(usdRate).toLocaleString("vi-VN");
  const rows = localizedPlanRows(lang, product, { cnyRate, usdRate, currency: displayCurrency });
  const wantedPlan = rows.some((r) => r.id === prefillPlan) ? prefillPlan : rows[0]?.id;
  const planHtml = rows.map((r) =>
    `<div class="plan${r.id === wantedPlan ? " active" : ""}" data-plan="${r.id}" data-amount="${r.amount}" data-cny="${r.cny ?? ""}" data-usd="${r.usd ?? ""}"><span>${r.name}</span><span class="price">${r.price}<span class="pricesub">${r.sub}</span></span></div>`
  ).join("\n        ");
  const safeEmail = String(prefillEmail || "").replace(/[<>"']/g, "");
  // Only render payment methods that are actually configured (QR image
  // uploaded / gateway credentials present) so nobody taps a dead option.
  const METHOD_ORDER = ["bankqr", "wechat", "alipay", "momo", "payos"];
  const enabledMethods = Array.isArray(methods) && methods.length
    ? METHOD_ORDER.filter((id) => methods.includes(id))
    : METHOD_ORDER;
  const has = (id) => enabledMethods.includes(id);
  const firstMethod = enabledMethods[0] || "bankqr";
  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t.pageTitle}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; font-family: -apple-system, "Segoe UI", sans-serif;
      color: #fff; background: linear-gradient(180deg, #051525, #0a1f3a);
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .card {
      width: 100%; max-width: 460px; padding: 28px;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
      border-radius: 18px; backdrop-filter: blur(16px);
    }
    .langbar {
      display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;
      margin-bottom: 16px;
    }
    .lang {
      font-size: 12px; padding: 4px 10px; border-radius: 50px; text-decoration: none;
      color: rgba(255,255,255,.6); background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.1);
    }
    .lang:hover { color: #fff; border-color: rgba(255,255,255,.3); }
    .lang.on { color: #06160d; background: #33c773; border-color: #33c773; font-weight: 700; }
    .brand { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 10px; }
    .brand-logo {
      width: 76px; height: 76px; border-radius: 18px; display: block;
      box-shadow: 0 10px 24px rgba(0,0,0,.38);
    }
    .logo { text-align: center; font-size: 26px; font-weight: 800; }
    .logo span { color: #33c773; }
    .sub { text-align: center; color: rgba(255,255,255,.6); font-size: 14px; margin-bottom: 24px; }
    label { display: block; color: rgba(255,255,255,.6); font-size: 13px; margin: 16px 0 7px; }
    input, select {
      width: 100%; border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
      padding: 12px 14px; color: #fff; background: rgba(255,255,255,.08); font: inherit; outline: none;
    }
    input:focus, select:focus { border-color: #33c773; box-shadow: 0 0 0 3px rgba(51,199,115,.18); }
    .plans { display: grid; gap: 10px; margin-top: 6px; }
    .plan {
      padding: 14px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px;
      background: rgba(255,255,255,.05); cursor: pointer; display: flex; justify-content: space-between; align-items: center;
    }
    .plan.active { border-color: #33c773; background: rgba(51,199,115,.12); }
    .plan .price { color: #33c773; font-weight: 800; text-align: right; }
    .plan .name { display: block; }
    /* Khối giá phải được phép co và xuống dòng: gói AI pass30 có tên rất dài,
       nowrap từng làm tên gói bị bóp còn vài ký tự và hàng gói cao gấp 3 lần. */
    .price { text-align: right; min-width: 0; }
    .plan { flex-wrap: wrap; }
    .plan > span:first-child { flex: 1 1 auto; min-width: 0; }
    .plan > .price { flex: 0 1 auto; margin-left: auto; }
    .pricesub { display: block; margin-top: 3px; font-size: 11.5px; font-weight: 500; color: rgba(255,255,255,.5); }
    .curbar { display: flex; gap: 6px; justify-content: center; margin: -6px 0 14px; }
    .curbar a {
      padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; text-decoration: none;
      color: rgba(255,255,255,.6); background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
    }
    .curbar a.on { color: #06160d; background: #33c773; border-color: #33c773; }
    .cnynote {
      display: none; margin: 0 0 10px; padding: 10px 12px; border-radius: 10px;
      font-size: 12.5px; line-height: 1.55; color: rgba(255,255,255,.78);
      background: rgba(122,184,255,.1); border: 1px solid rgba(122,184,255,.3);
    }
    body.m-cny .cnynote { display: block; }
    .cnynote b { color: #7ab8ff; }
    .qrsub { margin-top: 4px; font-size: 12.5px; color: rgba(255,255,255,.6); }

    .plannote {
      margin-top: 8px; padding: 8px 10px; border-radius: 8px; font-size: 11.5px;
      line-height: 1.5; color: rgba(255,255,255,.7);
      background: rgba(255,180,0,.08); border: 1px solid rgba(255,180,0,.25);
    }
    .methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-top: 6px; }
    .method {
      padding: 14px 8px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px;
      background: rgba(255,255,255,.05); cursor: pointer; text-align: center; font-size: 13px;
    }
    .method.active { border-color: #33c773; background: rgba(51,199,115,.12); }
    .method .icon { font-size: 22px; margin-bottom: 6px; display: flex; align-items: center; justify-content: center; }
    .method .brand {
      width: 28px; height: 28px; border-radius: 7px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .method .brand svg { width: 17px; height: 17px; display: block; }
    .method.brand-wechat .brand { background: #07C160; }
    .method.brand-alipay .brand { background: #1677FF; }
    .method.brand-momo .brand { background: #A50064; }
    .momo-mark { color: #fff; font-weight: 800; font-size: 9.5px; letter-spacing: -.3px; }
    button {
      width: 100%; margin-top: 24px; border: 0; border-radius: 12px; padding: 14px;
      color: #06160d; background: #33c773; font: inherit; font-weight: 800; cursor: pointer; font-size: 16px;
    }
    button:disabled { opacity: .55; }
    .status { margin-top: 14px; text-align: center; font-size: 13px; min-height: 18px; }
    .status.err { color: #ff5a6a; }
    .note { margin-top: 16px; text-align: center; color: rgba(255,255,255,.4); font-size: 12px; }
    .prefill {
      margin: -14px 0 18px; padding: 9px 12px; border-radius: 10px; font-size: 12px; line-height: 1.5;
      background: rgba(51,199,115,.1); border: 1px solid rgba(51,199,115,.3); color: rgba(255,255,255,.85);
    }
    .noteextra {
      margin-top: 10px; padding: 10px 12px; border-radius: 10px; text-align: left;
      color: rgba(255,255,255,.62); background: rgba(255,255,255,.05);
      border: 1px solid rgba(255,255,255,.08); font-size: 11.5px; line-height: 1.55;
    }
    .howto {
      margin-top: 18px; padding: 14px; border-radius: 12px;
      background: rgba(51,199,115,.07); border: 1px solid rgba(51,199,115,.22);
    }
    .howto-title { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 10px; }
    .howto-row { display: flex; gap: 8px; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.72); margin-bottom: 6px; }
    .howto-row .plat {
      flex: 0 0 auto; font-weight: 700; color: #33c773; min-width: 56px;
    }
    .howto-steps { margin: 10px 0 0 0; padding-left: 18px; }
    .howto-steps li { font-size: 12px; line-height: 1.6; color: rgba(255,255,255,.82); margin-bottom: 4px; }
    .guidelnk { display: inline-block; margin-top: 10px; color: #33c773; font-size: 12.5px; font-weight: 700;
                text-decoration: none; }
    .guidelnk:hover { text-decoration: underline; }
    .footer {
      margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.1);
      text-align: center; font-size: 12px;
    }
    .footer a { color: rgba(255,255,255,.62); text-decoration: none; }
    .footer a:hover { color: #33c773; text-decoration: underline; }
    .footer .sep { color: rgba(255,255,255,.3); margin: 0 8px; }

    .inapp-note{margin:16px 0;padding:12px 14px;border-radius:12px;background:rgba(51,199,115,.1);border:1px solid rgba(51,199,115,.3);font-size:13px;line-height:1.55;color:rgba(255,255,255,.85)}
    .dl-section { margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,.1); }
    .howto.adhoc { border: 1px solid rgba(51,199,115,.35); background: rgba(51,199,115,.07); }
    .dl-title { text-align: center; font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .dl-sub { text-align: center; color: rgba(255,255,255,.5); font-size: 12px; margin-bottom: 14px; }
    .dl-section a { text-decoration: none; display: inline-block; transition: transform .1s; }
    .dl-section a:hover { transform: scale(1.04); }
    /* Nút tải của nền tảng KHÁC bị ẩn khi đã nhận diện được thiết bị (xem
       downloadsSectionHTML); nút "chọn nền tảng khác" gỡ class này để hiện lại. */
    .plat-hidden { display: none !important; }

    .modal-overlay {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,.72); display: none;
      align-items: center; justify-content: center; padding: 20px;
    }
    .modal-overlay.show { display: flex; }
    .modal {
      width: 100%; max-width: 380px; background: #0d1b30;
      border: 1px solid rgba(255,255,255,.14); border-radius: 18px;
      padding: 24px; text-align: center; position: relative;
      box-shadow: 0 24px 60px rgba(0,0,0,.5);
    }
    .modal .close {
      position: absolute; top: 10px; right: 14px; cursor: pointer;
      color: rgba(255,255,255,.6); font-size: 22px; background: none; border: 0; width: 30px; height: 30px;
    }
    .modal .qr-wrap {
      display: inline-block; background: #fff; border-radius: 12px; padding: 8px; margin: 12px 0;
    }
    .modal img { width: 230px; height: 230px; display: block; border-radius: 8px; }
    /* Amount block sits ABOVE the QR: the customer must read it before scanning. */
    .modal .amtbox {
      margin: 12px 0 4px; padding: 10px 12px; border-radius: 12px;
      background: rgba(51,199,115,.10); border: 1px solid rgba(51,199,115,.35);
    }
    .modal .amtplan { font-size: 12.5px; color: rgba(255,255,255,.7); }
    .modal .amtremind { margin-top: 6px; font-size: 12.5px; font-weight: 700; color: #ffd166; line-height: 1.45; }
    .modal .amt { font-size: 26px; font-weight: 800; color: #33c773; line-height: 1.2; margin-top: 2px; }
    .modal .oc { color: rgba(255,255,255,.7); font-size: 13px; margin: 8px 0; word-break: break-all; }
    .modal .hint { color: rgba(255,255,255,.55); font-size: 13px; line-height: 1.5; }
    .modal .qstatus { margin-top: 12px; font-size: 13px; min-height: 18px; color: #33c773; }
    .modal .qerr { color: #ff5a6a; }
    .modal button.done { margin-top: 6px; }
    .modal button.copyamt {
      margin-top: 8px; background: rgba(255,255,255,.08); color: #fff;
      border: 1px solid rgba(255,255,255,.16); font-size: 13px; padding: 8px 12px;
    }
    .modal button.save {
      margin-top: 12px; background: rgba(255,255,255,.12); color: #fff;
      border: 1px solid rgba(255,255,255,.2);
    }
    .modal .savehint { font-size: 11px; color: rgba(255,255,255,.5); margin-top: 8px; line-height: 1.4; }
    .modal .mini { font-size: 11px; color: rgba(255,255,255,.4); margin-top: 10px; }

    /* ==========================================================================
       FLOWTECH SIGNATURE THEME — hợp đồng style: docs/THEME.md (repo FlowGpt).
       CHỈ thêm biến + override ở CUỐI khối CSS: không sửa/xoá khai báo nào phía
       trên, không đổi HTML, không đổi JS, KHÔNG đổi chữ / số tiền / mã đơn / link
       tải / logic thanh toán. Xoá khối này là trang về nguyên trạng.
       ========================================================================== */
    :root {
      --accent: #33C773;
      --accent-2: #22D3EE;
      --accent-3: #7C3AED;
      --accent-text: #05202A;
      --sig-bg: #0A1F3B;
      --sig-bg-deep: #071628;
      --sig-bg-top: #14406C;
      --sig-text: #EAF2FF;
      --sig-muted: rgba(234, 242, 255, 0.74);
      --sig-faint: rgba(234, 242, 255, 0.5);
      --sig-mint: #7FE6C0;
      --sig-line: rgba(255, 255, 255, 0.12);
      --sig-card-bg: radial-gradient(130% 120% at 0% 0%, #14406c 0%, #0a1f3b 55%, #071628 100%);
      --sig-r22: 22px;
      --sig-r16: 16px;
      --sig-r11: 11px;
    }

    @keyframes sig-fade { from { opacity: 0 } to { opacity: 1 } }
    @keyframes sig-rise {
      from { opacity: 0; transform: translateY(16px) scale(.97) }
      to { opacity: 1; transform: none }
    }
    @keyframes sig-slide {
      from { opacity: 0; transform: translateY(8px) }
      to { opacity: 1; transform: none }
    }

    body {
      color: var(--sig-text);
      background:
        radial-gradient(115% 70% at 6% -14%, rgba(51, 199, 115, .18), transparent 58%),
        radial-gradient(95% 65% at 98% -6%, rgba(34, 211, 238, .14), transparent 55%),
        linear-gradient(180deg, var(--sig-bg), var(--sig-bg-deep));
      background-attachment: fixed;
    }

    /* Khung chính của trang: nền navy + viền gradient 1px bằng mask (THEME.md §2). */
    .card {
      position: relative;
      background: var(--sig-card-bg);
      border: 1px solid var(--sig-line);
      border-radius: var(--sig-r22);
      animation: sig-rise .36s cubic-bezier(.22, 1, .36, 1) both;
    }
    .card::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
      background: linear-gradient(135deg, #33c773, #22d3ee 46%, #7c3aed);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      mask-composite: exclude;
      opacity: .85; pointer-events: none;
    }
    .card::after {
      content: ""; position: absolute; top: -70px; left: 12%; width: 60%; height: 150px;
      background: radial-gradient(closest-side, rgba(51, 199, 115, .4), transparent);
      filter: blur(30px); pointer-events: none;
    }

    label { color: var(--sig-muted); }
    input, select {
      border-radius: var(--sig-r11);
      background: rgba(10, 31, 59, .55);
      border-color: var(--sig-line);
      color: var(--sig-text);
    }
    input:focus, select:focus {
      border-color: rgba(51, 199, 115, .5);
      box-shadow: 0 0 0 3px rgba(34, 211, 238, .18);
    }

    /* Chip chọn ngôn ngữ / tiền tệ: chip 999px. */
    .lang, .curbar a {
      border-radius: 999px;
      background: rgba(255, 255, 255, .07);
      border: 1px solid rgba(255, 255, 255, .14);
      color: var(--sig-muted);
      transition: background .18s ease, border-color .18s ease, color .18s ease;
    }
    .lang:hover, .curbar a:hover { color: var(--sig-text); border-color: rgba(255, 255, 255, .28); }
    .lang.on, .curbar a.on {
      color: var(--accent-text);
      background: linear-gradient(135deg, #33c773, #22d3ee);
      border-color: transparent;
    }

    /* Khung gói: card con navy 16px; gói đang chọn được viền gradient. */
    .plans { gap: 12px; }
    .plan {
      position: relative;
      background: rgba(10, 31, 59, .55);
      border: 1px solid var(--sig-line);
      border-radius: var(--sig-r16);
      color: var(--sig-text);
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
      animation: sig-slide .24s ease-out both;
    }
    .plan:hover { transform: translateY(-2px); border-color: rgba(51, 199, 115, .45); }
    .plan .price { color: var(--sig-mint); }
    .plan .pricesub { color: var(--sig-faint); }
    .plan.active {
      border-color: transparent;
      background: linear-gradient(180deg, rgba(51, 199, 115, .14), rgba(34, 211, 238, .07)), var(--sig-card-bg);
    }
    .plan.active::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
      background: linear-gradient(135deg, #33c773, #22d3ee 46%, #7c3aed);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      mask-composite: exclude;
      opacity: .85; pointer-events: none;
    }

    /* Khung phương thức thanh toán */
    .method {
      position: relative;
      background: rgba(10, 31, 59, .55);
      border: 1px solid var(--sig-line);
      border-radius: var(--sig-r16);
      color: var(--sig-text);
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
      animation: sig-slide .24s ease-out both;
    }
    .method:hover { transform: translateY(-2px); border-color: rgba(51, 199, 115, .45); }
    .method small { color: var(--sig-faint); }
    .method.active {
      border-color: rgba(51, 199, 115, .55);
      background: linear-gradient(180deg, rgba(51, 199, 115, .15), rgba(34, 211, 238, .07)), var(--sig-card-bg);
    }

    /* Nút chính (Tạo mã / Tải): gradient + hào quang, hover nhấc 1px. */
    button {
      border-radius: var(--sig-r11);
      color: var(--accent-text);
      background: linear-gradient(135deg, #33c773, #22d3ee);
      box-shadow: 0 10px 24px -10px rgba(34, 211, 238, .75);
      transition: transform .18s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease;
    }
    button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 14px 30px -10px rgba(51, 199, 115, .8);
    }
    button:active:not(:disabled) { transform: translateY(0); }
    button:disabled { box-shadow: none; }

    /* Modal QR: card nổi bật (nền navy + viền gradient), vào bằng sig-rise. */
    .modal-overlay.show { animation: sig-fade .28s ease-out; }
    .modal {
      position: relative;
      background: var(--sig-card-bg);
      border: 1px solid var(--sig-line);
      border-radius: var(--sig-r22);
      animation: sig-rise .36s cubic-bezier(.22, 1, .36, 1) both;
    }
    .modal::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
      background: linear-gradient(135deg, #33c773, #22d3ee 46%, #7c3aed);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      mask-composite: exclude;
      opacity: .85; pointer-events: none;
    }
    .modal .amtbox {
      border-radius: var(--sig-r16);
      background: rgba(51, 199, 115, .10);
      border: 1px solid rgba(51, 199, 115, .35);
    }
    .modal .amt { color: var(--sig-mint); }
    .modal .amtplan, .modal .oc { color: var(--sig-muted); }
    .modal .hint { color: var(--sig-muted); }
    .modal .qstatus { color: var(--sig-mint); }
    .modal .mini, .modal .savehint { color: var(--sig-faint); }
    /* Khung QR: card con navy 16px + viền gradient; ảnh QR vẫn nền TRẮNG để quét được.
       Ảnh giữ nguyên kích thước hiển thị 230px (246 = 230 + padding 8px mỗi bên). */
    .modal .qr-wrap {
      position: relative;
      padding: 10px;
      background: var(--sig-bg-deep);
      border: 1px solid var(--sig-line);
      border-radius: var(--sig-r16);
    }
    .modal .qr-wrap::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
      background: linear-gradient(135deg, #33c773, #22d3ee 46%, #7c3aed);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      mask-composite: exclude;
      opacity: .85; pointer-events: none;
    }
    .modal img {
      width: 246px; height: 246px;
      background: #fff; padding: 8px; border-radius: 10px;
    }
    .modal .close { box-shadow: none; border-radius: 999px; }
    .modal .close:hover { background: rgba(255, 255, 255, .12); }
    .modal button.copyamt, .modal button.save {
      color: var(--sig-text);
      background: rgba(255, 255, 255, .07);
      border: 1px solid rgba(255, 255, 255, .14);
      box-shadow: none;
    }
    .modal button.copyamt:hover, .modal button.save:hover { background: rgba(255, 255, 255, .14); }

    /* Khối phụ trợ */
    .brand-logo { border-radius: var(--sig-r16); }
    .sub, .qrsub, .dl-sub { color: var(--sig-muted); }
    .note { color: var(--sig-faint); }
    .logo span, .guidelnk { color: var(--sig-mint); }
    .guidelnk:hover { color: var(--sig-mint); }
    .howto {
      background: rgba(10, 31, 59, .5);
      border: 1px solid var(--sig-line);
      border-radius: var(--sig-r16);
    }
    .howto-title, .dl-title { color: var(--sig-text); }
    .howto-row { color: var(--sig-muted); }
    .howto-steps li { color: var(--sig-muted); }
    .howto-row .plat { color: var(--sig-mint); }
    .noteextra, .prefill, .cnynote, .inapp-note, .plannote { border-radius: var(--sig-r16); }
    .dl-section { border-bottom: 1px solid var(--sig-line); }
    .footer { border-top: 1px solid var(--sig-line); }
    .footer a { color: var(--sig-muted); }
    .footer a:hover { color: var(--sig-mint); }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      button:hover:not(:disabled), .plan:hover, .method:hover { transform: none; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="langbar">
      ${["vi", "en", "zh", "ja", "ko"].map((code) => {
        const names = { vi: "Tiếng Việt", en: "English", zh: "中文", ja: "日本語", ko: "한국어" };
        const keepCur = cur ? `&cur=${encodeURIComponent(cur)}` : "";
        return `<a class="lang${code === lang ? " on" : ""}" href="?lang=${code}${keepCur}" hreflang="${code}">${names[code]}</a>`;
      }).join("")}
    </div>
    <div class="curbar">
      ${["VND", "CNY", "USD"].map((code) => {
        const label = code === "VND" ? "VNĐ" : code === "CNY" ? "¥ CNY" : "$ USD";
        return `<a class="${code === displayCurrency ? "on" : ""}" href="?lang=${lang}&cur=${code}">${label}</a>`;
      }).join("")}
    </div>

    <div class="brand">
      <img class="brand-logo" src="${logoUrl}" alt="${meta.brandName}">
      <div class="logo">${logoHtml}</div>
    </div>
    <div class="sub">${t.sub}</div>
    ${safeEmail && t.renewPrefill ? `<div class="prefill">🔁 ${t.renewPrefill}</div>` : ""}

    ${showLeadGate ? `<div class="dl-section" id="leadGate">
      <div class="dl-title">${t.leadTitle}</div>
      <label>${t.emailLabel}</label>
      <input type="email" id="leadEmail" placeholder="you@example.com" value="${safeEmail}">
      <button type="button" id="leadBtn">${t.leadBtn}</button>
      <div class="status" id="leadStatus"></div>
    </div>` : ""}
    <div id="dlHost"></div>

    ${showDownloads ? `<div class="dl-section">
      <div class="dl-title">${t.dlTitle}</div>
      <div class="dl-sub">${t.dlSub}</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center;">
        ${iosUrl ? `<a href="${iosUrl}" target="_blank" rel="noopener" title="${t.iosTop}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">${t.iosTop}</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.iosBadge}</text>
          </svg>
        </a>` : ""}
        ${!iosUrl && iosAdhocUrl ? `<a href="${iosAdhocUrl}" target="_blank" rel="noopener" title="${t.iosTop}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">${t.iosTop}</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.iosBadge}</text>
          </svg>
        </a>` : ""}

        ${macUrl ? `<a href="${macUrl}" target="_blank" rel="noopener" title="Download on the Mac App Store">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">Download on the</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Mac App Store</text>
          </svg>
        </a>` : macAdhocUrl ? `<a href="${macAdhocUrl}" target="_blank" rel="noopener" title="${t.macTop}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">${t.macTop}</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.macBadge}</text>
          </svg>
        </a>` : ""}
        ${androidUrl ? `<a href="${androidUrl}" target="_blank" rel="noopener" title="${t.androidTitle}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(12 12) scale(0.058)">
              <path fill="#EA4335" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
              <path fill="#FBBC04" d="M47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0z"/>
              <path fill="#4285F4" d="M425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8z"/>
              <path fill="#34A853" d="M104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </g>
            <text x="45" y="20" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.5" fill="#fff" opacity="0.9">${t.androidTop}</text>
            <text x="45" y="34" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.androidBadge}</text>
          </svg>
        </a>` : ""}
        ${windowsUrl ? `<a href="${windowsUrl}" target="_blank" rel="noopener" title="${t.windowsTop}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(13 14)">
              <rect x="0" y="0" width="10.5" height="10.5" fill="#F25022"/>
              <rect x="12" y="0" width="10.5" height="10.5" fill="#7FBA00"/>
              <rect x="0" y="12" width="10.5" height="10.5" fill="#00A4EF"/>
              <rect x="12" y="12" width="10.5" height="10.5" fill="#FFB900"/>
            </g>
            <text x="45" y="20" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.5" fill="#fff" opacity="0.9">${t.windowsTop}</text>
            <text x="45" y="34" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">${t.windowsBadge}</text>
          </svg>
        </a>` : ""}
        ${androidLegacyUrl ? `<a href="${androidLegacyUrl}" target="_blank" rel="noopener" title="${t.androidLegacySub}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d" stroke="rgba(255,255,255,.18)"/>
            <g transform="translate(12 12) scale(0.058)">
              <path fill="#34A853" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
              <path fill="#FBBC04" d="M47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0z"/>
              <path fill="#4285F4" d="M425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8z"/>
              <path fill="#EA4335" d="M104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </g>
            <text x="45" y="20" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.5" fill="#fff" opacity="0.9">${t.androidLegacyLabel}</text>
            <text x="45" y="34" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Android 7.0+</text>
          </svg>
        </a>` : ""}
      </div>
    </div>` : ""}

    <form id="buyForm"${showLeadGate ? ' style="display:none"' : ""}>
      <label>${t.emailLabel}</label>
      <input type="email" id="email" placeholder="you@example.com" required value="${safeEmail}">

      <label>${t.planLabel}</label>
      <div class="plans" id="planList">
        ${planHtml}
      </div>
      ${t.renewNote ? `<div class="plannote">${t.renewNote}</div>` : ""}

      <label>${t.methodLabel}</label>
      <div class="cnynote" id="cnyNote">${t.cnyNote} <b>1 CNY ≈ ${cnyRateLabel} đ</b>. ${t.cnyEnter}</div>
      <div class="methods">
        ${has("bankqr") ? `        <div class="method active" data-method="bankqr">
          <div class="icon"><span class="brand" style="background:rgba(255,255,255,.14)">🏦</span></div>${t.bankName}<br><small>${t.bankScan}</small>
        </div>` : ""}
        ${has("wechat") ? `        <div class="method brand-wechat" data-method="wechat">
          <div class="icon"><span class="brand"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg></span></div>WeChat Pay<br><small>${t.wechatScan}</small>
        </div>` : ""}
        ${has("alipay") ? `        <div class="method brand-alipay" data-method="alipay">
          <div class="icon"><span class="brand"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809"/></svg></span></div>Alipay<br><small>${t.alipayScan}</small>
        </div>` : ""}
        ${has("momo") ? `        <div class="method brand-momo" data-method="momo">
          <div class="icon"><span class="brand"><span class="momo-mark">MoMo</span></span></div>MoMo<br><small>${t.momoScan}</small>
        </div>` : ""}
        ${has("payos") ? `        <div class="method" data-method="payos">
          <div class="icon"><span class="brand" style="background:rgba(255,255,255,.14)">💳</span></div>${t.payosName}<br><small>${t.payosSub}</small>
        </div>` : ""}
      </div>

      <button type="submit" id="payBtn">${t.payBtn}</button>
      <div class="status" id="status"></div>
      <div class="note">${t.note}</div>
      <div class="noteextra">ℹ️ ${t.noteExtra}</div>
      <div class="noteextra">📱 ${t.deviceNote}</div>
    </form>

    ${emailVerified && iosAdhocSteps ? `<div class="howto adhoc">
      <div class="howto-title">📲 ${t.adhocTitle}</div>
      <ol class="howto-steps">${iosAdhocSteps.map((step) => `<li>${step}</li>`).join("")}</ol>
      <a class="guidelnk" href="${iosAdhocStepsUrl}" target="_blank" rel="noopener">${iosAdhocStepsUrl}</a>
    </div>` : ""}

    ${emailVerified && macAdhocSteps ? `<div class="howto adhoc">
      <div class="howto-title">💻 ${t.macAdhocTitle}</div>
      <ol class="howto-steps">${macAdhocSteps.map((step) => `<li>${step}</li>`).join("")}</ol>
      <a class="guidelnk" href="${macAdhocStepsUrl}" target="_blank" rel="noopener">${macAdhocStepsUrl}</a>
    </div>` : ""}

    ${inApp ? `<div class="inapp-note">${t.inAppNote}</div>` : emailVerified ? `<div class="howto">
      <div class="howto-title">📱 ${t.howToTitle}</div>
      <div class="howto-row"><span class="plat">iOS</span><span>${iosLine}</span></div>
      <div class="howto-row"><span class="plat">Android</span><span>${t.androidLine}</span></div>
      ${windowsUrl ? `<div class="howto-row"><span class="plat">Windows</span><span>${t.windowsLine}</span></div>` : ""}
      <ol class="howto-steps">
        ${howToSteps.map((step) => `<li>${step}</li>`).join("")}
      </ol>
      <a class="guidelnk" href="${guideUrl}" target="_blank" rel="noopener">${t.guideLink}</a>
    </div>` : ""}

    <div class="footer">
      <a href="${meta.privacyUrl}" target="_blank" rel="noopener">${t.privacyLabel}</a>
      <span class="sep">·</span>
      <a href="${meta.supportUrl}" target="_blank" rel="noopener">${t.supportLabel}</a>
    </div>

  </div>

  <div class="modal-overlay" id="qrModal">
    <div class="modal">
      <button class="close" id="qrClose">&times;</button>
      <div style="font-size:15px;font-weight:700;">${t.modalTitle}</div>
      <div class="amtbox">
        <div class="amtplan" id="qrPlan"></div>
        <div class="amt" id="qrAmt"></div>
        <div class="qrsub" id="qrAmtSub"></div>
        <div class="amtremind" id="qrAmtRemind">${t.amountReminder}</div>
      </div>
      <button type="button" class="copyamt" id="qrCopyBtn">📋 ${t.copyAmount}</button>
      <div class="qr-wrap"><img id="qrImg" alt="${t.qrAlt}"></div>
      <button type="button" class="copyamt" id="qrCopyOrderBtn">📋 ${t.copyOrder}</button>
      <div class="oc" id="qrOrder"></div>
      <div class="qrsub" id="qrOrderHint"></div>
      <div class="hint" id="qrHint"></div>
      <div class="qstatus" id="qrStatus"></div>
      <button type="button" class="save" id="qrSaveBtn">💾 ${t.saveQr}</button>
      <div class="savehint" id="qrSaveHint"></div>
      <button type="button" class="done" id="qrCloseBtn">${t.close}</button>
      <div class="mini">${t.mini}</div>
    </div>
  </div>

  <script>
    const base = ${JSON.stringify(baseUrl)};
    const T = ${JSON.stringify(t)};
    const lang = ${JSON.stringify(lang)};
    const NUM_LOCALE = ${JSON.stringify(LOCALES[lang])};
    // Reference prefix shown/copied by the customer and embedded in the bank QR.
    const REF_PREFIX = ${JSON.stringify(product === "ai" ? "MEETFLOW" : "VPNFLOW")};
    let plan = ${JSON.stringify(wantedPlan || "monthly")};
    let method = ${JSON.stringify(firstMethod)};

    function money(n) {
      try { return new Intl.NumberFormat(NUM_LOCALE).format(n) + " đ"; } catch (e) { return String(n) + " đ"; }
    }

    document.querySelectorAll(".plan").forEach((el) => {
      el.onclick = () => {
        document.querySelectorAll(".plan").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
        plan = el.dataset.plan;
      };
    });

    document.querySelectorAll(".method").forEach((el) => {
      if (el.style.cursor === "not-allowed") return;
      el.onclick = () => {
        document.querySelectorAll(".method").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
        method = el.dataset.method;
        applyCnyMode();
      };
    });

    // WeChat Pay / Alipay settle in CNY: show ¥ prices and copy the ¥ amount.
    const CNY = { rate: ${JSON.stringify(cnyRate)}, source: ${JSON.stringify(cnySource)} };
    const USD = { rate: ${JSON.stringify(usdRate)}, source: ${JSON.stringify(usdSource)} };
    const DISPLAY_CUR = ${JSON.stringify(displayCurrency)};
    function usdLabel(vnd) { return "$" + (Number(vnd || 0) / (USD.rate > 0 ? USD.rate : 1)).toFixed(2); }
    function cnyLabel(vnd) { return "¥" + cnyOf(vnd); }
    const CNY_METHODS = ["wechat", "alipay"];
    let isCny = CNY_METHODS.indexOf(method) !== -1;
    function cnyOf(vnd) {
      const r = CNY.rate > 0 ? CNY.rate : 1;
      return Math.max(1, Math.ceil(Number(vnd || 0) / r));
    }
    function applyCnyMode() {
      isCny = CNY_METHODS.indexOf(method) !== -1;
      document.body.classList.toggle("m-cny", isCny);
    }

    const statusEl = document.getElementById("status");
    const btn = document.getElementById("payBtn");
    const qrModal = document.getElementById("qrModal");
    const qrImg = document.getElementById("qrImg");
    const qrAmt = document.getElementById("qrAmt");
    const qrOrder = document.getElementById("qrOrder");
    const qrHint = document.getElementById("qrHint");
    const qrStatus = document.getElementById("qrStatus");
    const qrAmtSub = document.getElementById("qrAmtSub");
    const qrAmtRemind = document.getElementById("qrAmtRemind");
    const qrPlan = document.getElementById("qrPlan");
    applyCnyMode();
    const qrSaveBtn = document.getElementById("qrSaveBtn");
    const qrSaveHint = document.getElementById("qrSaveHint");

    // ---- Bước 1: EMAIL TRƯỚC, rồi mới hiện bản tải đúng thiết bị --------------
    // Trang chưa có email KHÔNG chứa link tải nào; khối tải do server trả về sau khi
    // POST /v1/buy/lead (server nhận diện thiết bị từ User-Agent của chính request đó).
    const leadBtn = document.getElementById("leadBtn");
    if (leadBtn) {
      const leadEmail = document.getElementById("leadEmail");
      const leadStatus = document.getElementById("leadStatus");
      const setLeadError = (msg) => { leadStatus.className = "status err"; leadStatus.textContent = msg || T.leadErr; };
      const revealDownloads = (email, data) => {
        const host = document.getElementById("dlHost");
        if (host && data && data.downloads) {
          host.innerHTML = data.downloads;
          const other = document.getElementById("dlOtherBtn");
          if (other) other.onclick = (ev) => {
            ev.preventDefault();
            document.querySelectorAll("#dlHost .plat-hidden").forEach((el) => el.classList.remove("plat-hidden"));
            other.style.display = "none";
          };
        }
        const form = document.getElementById("buyForm");
        if (form) form.style.display = "";
        const emailField = document.getElementById("email");
        if (emailField) { emailField.value = email; emailField.readOnly = true; }
        const gate = document.getElementById("leadGate");
        if (gate) gate.style.display = "none";
        if (data && data.known) { statusEl.className = "status"; statusEl.textContent = T.leadKnown; }
      };
      const submitLead = async () => {
        const email = (leadEmail.value || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setLeadError(T.leadErr);
          leadEmail.focus();
          return;
        }
        if (leadBtn.disabled) return;
        leadBtn.disabled = true;
        leadStatus.className = "status";
        leadStatus.textContent = T.leadSending;
        try {
          const res = await fetch(base + "/v1/buy/lead", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, lang }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.error || !data.ok) { setLeadError(data.error || T.leadErr); return; }
          revealDownloads(email, data);
        } catch (e) {
          setLeadError(T.errNoConn);
        } finally {
          leadBtn.disabled = false;
        }
      };
      leadBtn.onclick = submitLead;
      leadEmail.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); submitLead(); }
      });
    }
    function showQr() { qrModal.classList.add("show"); }
    function hideQr() {
      qrModal.classList.remove("show");
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      qrSaveHint.textContent = "";
    }
    document.getElementById("qrClose").onclick = hideQr;
    document.getElementById("qrCloseBtn").onclick = hideQr;
    qrModal.onclick = (e) => { if (e.target === qrModal) hideQr(); };

    // Save the shown QR as an image so the user can scan it from their bank
    // app's photo library. Works for data: (bank QR) and https (WeChat/Alipay).
    const qrCopyBtn = document.getElementById("qrCopyBtn");
    const qrCopyOrderBtn = document.getElementById("qrCopyOrderBtn");
    const qrOrderHint = document.getElementById("qrOrderHint");

    // The bank/MoMo QR carries the reference inside it (tag 62), but WeChat and
    // Alipay are personal codes that cannot: give the customer a one-tap copy of
    // the reference so they can paste it into the transfer note.
    function copyText(value) {
      return navigator.clipboard.writeText(value).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = value; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        ta.remove();
      });
    }
    qrCopyOrderBtn.onclick = async () => {
      const value = qrCopyOrderBtn.dataset.ref || "";
      if (!value) return;
      await copyText(value);
      const original = qrCopyOrderBtn.textContent;
      qrCopyOrderBtn.textContent = "✅ " + T.copied + " " + value;
      setTimeout(() => { qrCopyOrderBtn.textContent = original; }, 2000);
    };
    qrCopyBtn.onclick = async () => {
      const value = qrCopyBtn.dataset.amount || "";
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = value; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e2) {}
        ta.remove();
      }
      const original = qrCopyBtn.textContent;
      qrCopyBtn.textContent = "✅ " + T.copied + " " + (isCny ? "¥" : "") + value;
      setTimeout(() => { qrCopyBtn.textContent = original; }, 1800);
    };

    qrSaveBtn.onclick = async () => {
      const src = qrImg.src;
      if (!src) return;
      qrSaveHint.textContent = "";
      try {
        let href = src;
        if (!src.startsWith("data:")) {
          const res = await fetch(src);
          if (!res.ok) throw new Error("fetch failed");
          href = URL.createObjectURL(await res.blob());
        }
        const a = document.createElement("a");
        a.href = href;
        a.download = "vpnflow-qr.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (href !== src) setTimeout(() => URL.revokeObjectURL(href), 5000);
        qrSaveHint.textContent = T.saveQrHint;
        qrSaveHint.className = "savehint";
      } catch (e) {
        // Cross-origin fetch blocked or download blocked (some in-app browsers):
        // open the image so the user can long-press to save.
        qrSaveHint.textContent = T.saveQrHint;
        qrSaveHint.className = "savehint";
        try { window.open(src, "_blank"); } catch (e2) {}
      }
    };

    document.getElementById("buyForm").onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      if (!email) {
        statusEl.className = "status err";
        statusEl.textContent = T.errNoEmail;
        document.getElementById("email").focus();
        return;
      }
      // Only one request at a time; the button is always re-enabled in the
      // finally block below, so the customer can change the email/method and
      // generate again without reloading the page.
      if (btn.disabled) return;
      btn.disabled = true;
      statusEl.className = "status";
      statusEl.textContent = T.creating;
      try {
        const res = await fetch(base + "${apiPrefix}/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, plan, method, lang }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          statusEl.className = "status err";
          statusEl.textContent = (data.code && T.errByCode[data.code]) || data.error || T.errCreate;
          return;
        }
        if (data.qrDataUrl || data.qrImageUrl) {
          statusEl.className = "status";
          statusEl.textContent = "";
          // Ví QR ưu tiên ảnh của SePay/vietqr.app (bankqr: đã điền số tiền + nội dung CK,
          // có branding ngân hàng). Nếu ảnh ngoài không tải được — mạng chặn dịch vụ ngoài,
          // ví dụ từ Trung Quốc — thì tự rơi về QR sinh tại chỗ để khách vẫn trả được tiền.
          const remoteQr = /^https?:/i.test(String(data.qrImageUrl || ""))
            ? data.qrImageUrl
            : (data.qrImageUrl ? base + data.qrImageUrl : "");
          const localQr = data.qrDataUrl || "";
          if (remoteQr && localQr) {
            let swapped = false;
            const useLocal = () => { if (!swapped) { swapped = true; qrImg.onerror = null; qrImg.onload = null; qrImg.src = localQr; } };
            qrImg.onerror = useLocal;
            qrImg.onload = () => clearTimeout(guardTimer);
            const guardTimer = setTimeout(() => { if (!qrImg.complete || qrImg.naturalWidth === 0) useLocal(); }, 4000);
            qrImg.src = remoteQr;
          } else {
            qrImg.onerror = null;
            qrImg.src = remoteQr || localQr;
          }
          const methodIsCny = CNY_METHODS.indexOf(data.method) !== -1;
          // Ảnh QR do chủ shop tạo bằng "设置金额" đã mang sẵn số tiền ⇒ hiện ĐÚNG số ¥ in
          // trong ảnh (data.qrCny) thay vì số quy đổi theo tỷ giá, tránh lệch 1 ¥.
          const qrPrefilled = data.amountPrefilled === true;
          if (methodIsCny) {
            // The customer types this into WeChat/Alipay, so lead with ¥ and let
            // the copy button copy the yuan figure.
            const cnyValue = qrPrefilled && data.qrCny ? data.qrCny : cnyOf(data.amount);
            // Show which plan the amount belongs to, right above the figure.
          const planEl = document.querySelector(".plan.active span");
          qrPlan.textContent = T.planChosen + " " + (planEl ? planEl.textContent.trim() : plan);
          qrAmt.textContent = "¥" + cnyValue;
            qrAmtSub.textContent = qrPrefilled
              ? "≈ " + money(data.amount) + " · " + usdLabel(data.amount) + " · " + T.amountPrefilled
              : "≈ " + money(data.amount) + " · " + usdLabel(data.amount) +
                " · 1 CNY ≈ " + new Intl.NumberFormat(NUM_LOCALE).format(Math.round(CNY.rate)) + " đ";
            qrCopyBtn.dataset.amount = String(cnyValue);
          } else {
            const planEl2 = document.querySelector(".plan.active span");
            qrPlan.textContent = T.planChosen + " " + (planEl2 ? planEl2.textContent.trim() : plan);
            qrAmt.textContent = money(data.amount);
            // International visitors still pay in dong here, so show what that is
            // worth in their currency (and in yuan, the other rail).
            qrAmtSub.textContent = DISPLAY_CUR === "VND"
              ? ""
              : "≈ " + usdLabel(data.amount) + " · " + cnyLabel(data.amount);
            qrCopyBtn.dataset.amount = String(data.amount);
          }
          // QR đã mang sẵn SỐ TIỀN và NỘI DUNG (bankqr qua VietQR/SePay, MoMo động) ⇒ khách
          // không phải copy gì: chỉ để lại QR + tên gói + số tiền. Các kênh còn lại
          // (WeChat/Alipay dùng ảnh tĩnh) vẫn hiện số tiền + mã đơn để khách nhập tay.
          const selfContained = data.selfContained === true;
          // QR đã có sẵn SỐ TIỀN (bankqr/MoMo động, hoặc ảnh WeChat/Alipay đặt số tiền) ⇒
          // khách không phải copy gì: chỉ để lại QR + tên gói + số tiền.
          const noTyping = selfContained || qrPrefilled;
          [qrCopyBtn, qrCopyOrderBtn, qrAmtRemind].forEach((el) => {
            if (el) el.style.display = noTyping ? "none" : "";
          });
          qrOrder.style.display = selfContained ? "none" : "";
          qrOrderHint.style.display = selfContained ? "none" : "";
          qrOrder.textContent = T.orderPrefix + data.orderCode;
          // Same reference string the bank QR embeds, so the shop can match it.
          const orderRef = REF_PREFIX + "-" + data.orderCode;
          qrCopyOrderBtn.dataset.ref = orderRef;
          qrOrderHint.innerHTML = selfContained ? "" : (T.orderNoteHint + " <b>" + orderRef + "</b>");
          const labels = {
            bankqr: T.hints.bankqr,
            wechat: T.hints.wechat,
            alipay: T.hints.alipay,
            momo: T.hints.momo
          };
          // When the owner uploaded a QR that already carries the amount
          // (WeChat/Alipay "设置金额"), the customer only confirms — say so.
          qrHint.textContent = (labels[data.method] || T.hints.other) +
            (data.amountPrefilled
              ? " " + T.amountPrefilled
              : (methodIsCny ? " " + T.cnyEnter : ""));
          qrStatus.textContent = T.waiting;
          qrStatus.className = "qstatus";
          showQr();
          startPoll(data.orderCode);
        } else if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          statusEl.className = "status err";
          statusEl.textContent = T.errNoCode;
        }
      } catch (err) {
        statusEl.className = "status err";
        statusEl.textContent = T.errNoConn;
      } finally {
        // Success included: a generated QR must not lock the button — the
        // customer may have typed the wrong email or want another method.
        btn.disabled = false;
      }
    };

    // Editing anything re-arms the form: clear a stale error and make sure the
    // button is clickable even if a previous request died mid-flight.
    const emailInput = document.getElementById("email");
    emailInput.addEventListener("input", () => {
      btn.disabled = false;
      if (statusEl.classList.contains("err")) {
        statusEl.className = "status";
        statusEl.textContent = "";
      }
    });
    document.querySelectorAll(".plan, .method").forEach((el) => {
      el.addEventListener("click", () => { btn.disabled = false; });
    });

    // Poll the order status until it is confirmed (bank transfer / PayOS webhook).
    let pollTimer = null;
    function startPoll(orderCode) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch(base + "${apiPrefix}/status/" + orderCode);
          const data = await res.json();
          if (data.paid) {
            clearInterval(pollTimer);
            qrStatus.textContent = T.paid;
            qrStatus.className = "qstatus";
          } else {
            qrStatus.textContent = T.waitingTick + " (" + (data.elapsed_sec || "") + "s)";
            qrStatus.className = "qstatus";
          }
        } catch (e) { /* keep polling */ }
      }, 5000);
    }
  </script>
</body>
</html>`;
}

export function paymentSuccessPageHTML(lang, product = "vpn") {
  lang = pickBuyLang(lang);
  const base = TEXTS[lang];
  const t = product === "ai" ? { ...base, ...(AI_TEXTS[lang] || AI_TEXTS.vi) } : base;
  return `<!doctype html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.pageTitle} — ✓</title>
<style>/* FlowTech Signature theme — docs/THEME.md. Chỉ CSS. */
@keyframes sig-rise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Segoe UI",sans-serif;color:#EAF2FF;background:radial-gradient(115% 70% at 6% -14%,rgba(51,199,115,.18),transparent 58%),linear-gradient(180deg,#0A1F3B,#071628);background-attachment:fixed}
.card{position:relative;max-width:420px;padding:32px;background:radial-gradient(130% 120% at 0% 0%,#14406c 0%,#0a1f3b 55%,#071628 100%);border:1px solid rgba(255,255,255,.12);border-radius:22px;text-align:center;animation:sig-rise .36s cubic-bezier(.22,1,.36,1) both}
.card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,#33c773,#22d3ee 46%,#7c3aed);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;opacity:.85;pointer-events:none}
.check{font-size:52px;color:#7FE6C0}h1{font-size:22px;margin:12px 0}p{color:rgba(234,242,255,.74);font-size:14px;line-height:1.5}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}</style></head>
<body><div class="card"><div class="check">✓</div><h1>${t.successTitle}</h1><p>${t.successBody}</p></div></body></html>`;
}

export function paymentCancelPageHTML(lang, product = "vpn") {
  lang = pickBuyLang(lang);
  const base = TEXTS[lang];
  const t = product === "ai" ? { ...base, ...(AI_TEXTS[lang] || AI_TEXTS.vi) } : base;
  return `<!doctype html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.pageTitle} — ✕</title>
<style>/* FlowTech Signature theme — docs/THEME.md. Chỉ CSS. */
@keyframes sig-rise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Segoe UI",sans-serif;color:#EAF2FF;background:radial-gradient(115% 70% at 6% -14%,rgba(51,199,115,.18),transparent 58%),linear-gradient(180deg,#0A1F3B,#071628);background-attachment:fixed}
.card{position:relative;max-width:420px;padding:32px;background:radial-gradient(130% 120% at 0% 0%,#14406c 0%,#0a1f3b 55%,#071628 100%);border:1px solid rgba(255,255,255,.12);border-radius:22px;text-align:center;animation:sig-rise .36s cubic-bezier(.22,1,.36,1) both}
.card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,#33c773,#22d3ee 46%,#7c3aed);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;opacity:.85;pointer-events:none}
h1{font-size:22px;margin:12px 0}p{color:rgba(234,242,255,.74);font-size:14px;line-height:1.5}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}</style></head>
<body><div class="card"><h1>${t.cancelTitle}</h1><p>${t.cancelBody}</p></div></body></html>`;
}

export const PLANS_PUBLIC = PLANS;
