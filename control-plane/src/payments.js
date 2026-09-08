import crypto from "node:crypto";
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
 *   monthly: 100,000 VND / 30 days
 *   yearly : 900,000 VND / 365 days
 */

const PLANS = {
  monthly:   { amount: 70000,  days: 30,   label: "Monthly (70,000 VND / 30 days)", badge: "Monthly" },
  quarterly: { amount: 190000, days: 90,   label: "3 Months (190,000 VND / 90 days)", badge: "3 Months" },
  semiannual:{ amount: 350000, days: 180,  label: "6 Months (350,000 VND / 180 days)", badge: "6 Months" },
  yearly:    { amount: 600000, days: 365,  label: "Yearly (600,000 VND / 365 days)", badge: "Yearly" },
  lifetime:  { amount: 1500000, days: null, label: "Lifetime (1,500,000 VND one-time)", badge: "Lifetime" },
};

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

/**
 * Builds a VietQR (direct bank transfer) as a QR data URL. No merchant
 * registration needed — customer scans with any VN banking app, pays the
 * exact amount, and the note carries the order code for manual/auto matching.
 */
export async function createBankQrDataUrl({ accountNumber, accountName, amount, orderCode }) {
  const payload = buildVietQRPayload({
    accountNumber,
    accountName,
    amount,
    content: String(orderCode),
  });
  const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 2, errorCorrectionLevel: "M" });
  return dataUrl;
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
    androidTitle: "Get it on Google Play — or download the APK directly here",
    emailLabel: "Your VPNFlow account email",
    planLabel: "Choose a plan",
    methodLabel: "Payment method",
    bankName: "VN Bank", bankScan: "Scan TPBank QR",
    wechatScan: "Scan QR", alipayScan: "Scan QR",
    payosName: "PayOS gateway", payosSub: "MoMo / QR / card",
    payBtn: "Create payment QR",
    note: "After you transfer, Premium will be activated for this email.",
    modalTitle: "Scan the QR to pay",
    qrAlt: "Payment QR",
    close: "Close",
    saveQr: "Save QR image",
    saveQrHint: "Tap the QR to save it to your photos, then scan it from your bank app.",
    mini: "Keep the order code for reference. Premium activates automatically after confirmation.",
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
      bankqr: "Open your banking app, scan the QR and enter the exact amount.",
      wechat: "Open WeChat, scan the QR and enter the exact amount.",
      alipay: "Open Alipay, scan the QR and enter the exact amount.",
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
    androidTitle: "Get it on Google Play — hoặc tải APK trực tiếp tại đây",
    emailLabel: "Email tài khoản VPNFlow",
    planLabel: "Chọn gói",
    methodLabel: "Phương thức thanh toán",
    bankName: "Ngân hàng VN", bankScan: "Quét QR TPBank",
    wechatScan: "Quét QR", alipayScan: "Quét QR",
    payosName: "Cổng PayOS", payosSub: "MoMo / QR / thẻ",
    payBtn: "Tạo mã thanh toán",
    note: "Sau khi chuyển tiền, premium sẽ được kích hoạt cho email này.",
    modalTitle: "Quét QR để thanh toán",
    qrAlt: "QR thanh toán",
    close: "Đóng",
    saveQr: "Lưu ảnh QR",
    saveQrHint: "Chạm vào QR để lưu về máy, rồi mở app ngân hàng quét từ ảnh đã lưu.",
    mini: "Giữ mã đơn để đối chiếu. Premium tự kích hoạt sau khi xác nhận.",
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
      bankqr: "Mở app ngân hàng quét QR và nhập đúng số tiền.",
      wechat: "Mở WeChat quét QR, nhập đúng số tiền.",
      alipay: "Mở Alipay quét QR, nhập đúng số tiền.",
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
    androidTitle: "在 Google Play 获取 — 或在此直接下载 APK",
    emailLabel: "您的 VPNFlow 账户邮箱",
    planLabel: "选择套餐",
    methodLabel: "支付方式",
    bankName: "越南银行", bankScan: "扫描 TPBank 二维码",
    wechatScan: "扫描二维码", alipayScan: "扫描二维码",
    payosName: "PayOS 网关", payosSub: "MoMo / 二维码 / 银行卡",
    payBtn: "生成支付二维码",
    note: "转账后，Premium 将为此邮箱激活。",
    modalTitle: "扫描二维码支付",
    qrAlt: "支付二维码",
    close: "关闭",
    saveQr: "保存二维码",
    saveQrHint: "点击二维码保存到相册，再打开银行应用从相册扫描。",
    mini: "请保留订单号以备核对。确认后 Premium 将自动激活。",
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
      bankqr: "打开银行应用扫描二维码并输入准确金额。",
      wechat: "打开微信扫描二维码并输入准确金额。",
      alipay: "打开支付宝扫描二维码并输入准确金额。",
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
    androidTitle: "Google Playで入手 — またはここでAPKを直接ダウンロード",
    emailLabel: "VPNFlowアカウントのメール",
    planLabel: "プランを選択",
    methodLabel: "支払い方法",
    bankName: "ベトナムの銀行", bankScan: "TPBank QRをスキャン",
    wechatScan: "QRをスキャン", alipayScan: "QRをスキャン",
    payosName: "PayOS決済", payosSub: "MoMo / QR / カード",
    payBtn: "支払いQRを作成",
    note: "送金後、このメールでプレミアムが有効になります。",
    modalTitle: "QRをスキャンして支払う",
    qrAlt: "支払いQR",
    close: "閉じる",
    saveQr: "QR画像を保存",
    saveQrHint: "QRをタップして写真に保存し、銀行アプリで保存した画像をスキャンしてください。",
    mini: "照合用に注文番号をお控えください。確認後、プレミアムは自動的に有効になります。",
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
      bankqr: "銀行アプリを開き、QRをスキャンして正確な金額を入力してください。",
      wechat: "WeChatを開き、QRをスキャンして正確な金額を入力してください。",
      alipay: "Alipayを開き、QRをスキャンして正確な金額を入力してください。",
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
    androidTitle: "Google Play에서 받기 — 또는 여기서 APK 직접 다운로드",
    emailLabel: "VPNFlow 계정 이메일",
    planLabel: "요금제 선택",
    methodLabel: "결제 수단",
    bankName: "베트남 은행", bankScan: "TPBank QR 스캔",
    wechatScan: "QR 스캔", alipayScan: "QR 스캔",
    payosName: "PayOS 결제", payosSub: "MoMo / QR / 카드",
    payBtn: "결제 QR 만들기",
    note: "송금 후 이 이메일로 프리미엄이 활성화됩니다.",
    modalTitle: "QR을 스캔하여 결제",
    qrAlt: "결제 QR",
    close: "닫기",
    saveQr: "QR 이미지 저장",
    saveQrHint: "QR을 눌러 사진에 저장한 뒤, 은행 앱에서 저장된 이미지를 스캔하세요.",
    mini: "대조용으로 주문번호를 보관하세요. 확인 후 프리미엄이 자동으로 활성화됩니다.",
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
      bankqr: "은행 앱을 열고 QR을 스캔한 뒤 정확한 금액을 입력하세요.",
      wechat: "WeChat을 열고 QR을 스캔한 뒤 정확한 금액을 입력하세요.",
      alipay: "Alipay를 열고 QR을 스캔한 뒤 정확한 금액을 입력하세요.",
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

/** Plan list in display order with localized names + price text. */
export function localizedPlanRows(lang) {
  const t = TEXTS[lang] || TEXTS.vi;
  const order = ["monthly", "quarterly", "semiannual", "yearly", "lifetime"];
  return order.map((id) => {
    const p = PLANS[id];
    const price = t.planNames[id] + " — " + fmtAmount(lang, p.amount)
      + (p.days ? " / " + p.days + " " + t.dayUnit : " · " + t.lifetimeNote);
    return { id, name: t.planNames[id], price };
  });
}

/** Buy page HTML — dark theme, email + plan + method picker. */
export function buyPageHTML({ baseUrl, lang }) {
  lang = pickBuyLang(lang);
  const t = TEXTS[lang];
  const rows = localizedPlanRows(lang);
  const planHtml = rows.map((r, i) =>
    `<div class="plan${i === 0 ? " active" : ""}" data-plan="${r.id}"><span>${r.name}</span><span class="price">${r.price}</span></div>`
  ).join("\n        ");
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
    .logo { text-align: center; font-size: 28px; font-weight: 800; margin-bottom: 6px; }
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
    .methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-top: 6px; }
    .method {
      padding: 14px 8px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px;
      background: rgba(255,255,255,.05); cursor: pointer; text-align: center; font-size: 13px;
    }
    .method.active { border-color: #33c773; background: rgba(51,199,115,.12); }
    .method .icon { font-size: 22px; margin-bottom: 6px; }
    button {
      width: 100%; margin-top: 24px; border: 0; border-radius: 12px; padding: 14px;
      color: #06160d; background: #33c773; font: inherit; font-weight: 800; cursor: pointer; font-size: 16px;
    }
    button:disabled { opacity: .55; }
    .status { margin-top: 14px; text-align: center; font-size: 13px; min-height: 18px; }
    .status.err { color: #ff5a6a; }
    .note { margin-top: 16px; text-align: center; color: rgba(255,255,255,.4); font-size: 12px; }

    .dl-section { margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,.1); }
    .dl-title { text-align: center; font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .dl-sub { text-align: center; color: rgba(255,255,255,.5); font-size: 12px; margin-bottom: 14px; }
    .dl-section a { text-decoration: none; display: inline-block; transition: transform .1s; }
    .dl-section a:hover { transform: scale(1.04); }

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
    .modal .amt { font-size: 18px; font-weight: 800; color: #33c773; }
    .modal .oc { color: rgba(255,255,255,.7); font-size: 13px; margin: 8px 0; word-break: break-all; }
    .modal .hint { color: rgba(255,255,255,.55); font-size: 13px; line-height: 1.5; }
    .modal .qstatus { margin-top: 12px; font-size: 13px; min-height: 18px; color: #33c773; }
    .modal .qerr { color: #ff5a6a; }
    .modal button.done { margin-top: 6px; }
    .modal button.save {
      margin-top: 12px; background: rgba(255,255,255,.12); color: #fff;
      border: 1px solid rgba(255,255,255,.2);
    }
    .modal .savehint { font-size: 11px; color: rgba(255,255,255,.5); margin-top: 8px; line-height: 1.4; }
    .modal .mini { font-size: 11px; color: rgba(255,255,255,.4); margin-top: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">VPN<span>Flow</span> Premium</div>
    <div class="sub">${t.sub}</div>

    <div class="dl-section">
      <div class="dl-title">${t.dlTitle}</div>
      <div class="dl-sub">${t.dlSub}</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center;">
        <a href="https://apps.apple.com/PLACEHOLDER-IOS" target="_blank" rel="noopener" title="Download on the App Store (iOS)">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">Download on the</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">App Store</text>
          </svg>
        </a>
        <a href="https://apps.apple.com/PLACEHOLDER-MAC" target="_blank" rel="noopener" title="Download on the Mac App Store">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">Download on the</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Mac App Store</text>
          </svg>
        </a>
        <a href="${baseUrl}/v1/downloads/android" target="_blank" rel="noopener" title="${t.androidTitle}">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(12 12) scale(0.058)">
              <path fill="#EA4335" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
              <path fill="#FBBC04" d="M47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0z"/>
              <path fill="#4285F4" d="M425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8z"/>
              <path fill="#34A853" d="M104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </g>
            <text x="45" y="20" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.5" fill="#fff" opacity="0.9">GET IT ON</text>
            <text x="45" y="34" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Google Play</text>
          </svg>
        </a>
      </div>
    </div>

    <form id="buyForm">
      <label>${t.emailLabel}</label>
      <input type="email" id="email" placeholder="you@example.com" required>

      <label>${t.planLabel}</label>
      <div class="plans" id="planList">
        ${planHtml}
      </div>

      <label>${t.methodLabel}</label>
      <div class="methods">
        <div class="method active" data-method="bankqr">
          <div class="icon">🏦</div>${t.bankName}<br><small>${t.bankScan}</small>
        </div>
        <div class="method" data-method="wechat">
          <div class="icon">💚</div>WeChat Pay<br><small>${t.wechatScan}</small>
        </div>
        <div class="method" data-method="alipay">
          <div class="icon">🔵</div>Alipay<br><small>${t.alipayScan}</small>
        </div>
        <div class="method" data-method="payos">
          <div class="icon">💳</div>${t.payosName}<br><small>${t.payosSub}</small>
        </div>
      </div>

      <button type="submit" id="payBtn">${t.payBtn}</button>
      <div class="status" id="status"></div>
      <div class="note">${t.note}</div>
    </form>

  </div>

  <div class="modal-overlay" id="qrModal">
    <div class="modal">
      <button class="close" id="qrClose">&times;</button>
      <div style="font-size:15px;font-weight:700;">${t.modalTitle}</div>
      <div class="qr-wrap"><img id="qrImg" alt="${t.qrAlt}"></div>
      <div class="amt" id="qrAmt"></div>
      <div class="oc" id="qrOrder"></div>
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
    const NUM_LOCALE = ${JSON.stringify(LOCALES[lang])};
    let plan = "monthly";
    let method = "bankqr";

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
      };
    });

    const statusEl = document.getElementById("status");
    const btn = document.getElementById("payBtn");
    const qrModal = document.getElementById("qrModal");
    const qrImg = document.getElementById("qrImg");
    const qrAmt = document.getElementById("qrAmt");
    const qrOrder = document.getElementById("qrOrder");
    const qrHint = document.getElementById("qrHint");
    const qrStatus = document.getElementById("qrStatus");
    const qrSaveBtn = document.getElementById("qrSaveBtn");
    const qrSaveHint = document.getElementById("qrSaveHint");
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
      if (!email) { statusEl.className = "status err"; statusEl.textContent = T.errNoEmail; return; }
      btn.disabled = true;
      statusEl.className = "status";
      statusEl.textContent = T.creating;
      try {
        const res = await fetch(base + "/v1/payments/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, plan, method }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          statusEl.className = "status err";
          statusEl.textContent = (data.code && T.errByCode[data.code]) || data.error || T.errCreate;
          btn.disabled = false;
          return;
        }
        if (data.qrDataUrl || data.qrImageUrl) {
          statusEl.className = "status";
          statusEl.textContent = "";
          qrImg.src = data.qrDataUrl || (base + data.qrImageUrl);
          qrAmt.textContent = money(data.amount);
          qrOrder.textContent = T.orderPrefix + data.orderCode;
          const labels = {
            bankqr: T.hints.bankqr,
            wechat: T.hints.wechat,
            alipay: T.hints.alipay
          };
          qrHint.textContent = labels[data.method] || T.hints.other;
          qrStatus.textContent = T.waiting;
          qrStatus.className = "qstatus";
          showQr();
          startPoll(data.orderCode);
        } else if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          statusEl.className = "status err";
          statusEl.textContent = T.errNoCode;
          btn.disabled = false;
        }
      } catch (err) {
        statusEl.className = "status err";
        statusEl.textContent = T.errNoConn;
        btn.disabled = false;
      }
    };

    // Poll the order status until it is confirmed (bank transfer / PayOS webhook).
    let pollTimer = null;
    function startPoll(orderCode) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch(base + "/v1/payments/status/" + orderCode);
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

export function paymentSuccessPageHTML(lang) {
  lang = pickBuyLang(lang);
  const t = TEXTS[lang];
  return `<!doctype html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.pageTitle} — ✓</title>
<style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Segoe UI",sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}.card{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}.check{font-size:52px;color:#33c773}h1{font-size:22px;margin:12px 0}p{color:rgba(255,255,255,.6);font-size:14px;line-height:1.5}</style></head>
<body><div class="card"><div class="check">✓</div><h1>${t.successTitle}</h1><p>${t.successBody}</p></div></body></html>`;
}

export function paymentCancelPageHTML(lang) {
  lang = pickBuyLang(lang);
  const t = TEXTS[lang];
  return `<!doctype html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.pageTitle} — ✕</title>
<style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Segoe UI",sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}.card{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}h1{font-size:22px;margin:12px 0}p{color:rgba(255,255,255,.6);font-size:14px;line-height:1.5}</style></head>
<body><div class="card"><h1>${t.cancelTitle}</h1><p>${t.cancelBody}</p></div></body></html>`;
}

export const PLANS_PUBLIC = PLANS;
