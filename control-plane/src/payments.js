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
        privacyLabel: "Privacy Policy",
    supportLabel: "Support",
        testflightSub: "Join the beta",
        noteExtra: "Pro is activated for the email you enter above. If it is not active within 10 minutes after your transfer, contact support@meetflowai.site.",
        howToTitle: "How to activate after buying",
    iosLineStore: "Available on the App Store — install it, then sign in with the same email you used here; Premium unlocks automatically.",
    iosLineTestflight: "iOS beta via TestFlight — join, install, then sign in with this email.",
    iosLineSoon: "iOS version is coming to the App Store.",
    androidLine: "Android must be installed directly: download the APK above, allow installs from unknown sources, then open the app.",
    steps: ["Download and install the app (iOS: App Store · Android: the APK above).", "Open the app and sign in with the SAME email you used on this page.", "Premium activates automatically — no code and nothing else to do."],
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
        privacyLabel: "Chính sách bảo mật",
    supportLabel: "Hỗ trợ",
        testflightSub: "Tham gia bản thử",
        noteExtra: "Pro được kích hoạt theo email bạn nhập ở trên. Nếu sau 10 phút chuyển khoản vẫn chưa thấy kích hoạt, liên hệ support@meetflowai.site.",
        howToTitle: "Cách kích hoạt sau khi mua",
    iosLineStore: "Đã có trên App Store — tải về, rồi đăng nhập bằng đúng email bạn dùng ở trang này; Premium tự bật.",
    iosLineTestflight: "Bản iOS thử nghiệm qua TestFlight — tham gia, cài đặt, rồi đăng nhập bằng email này.",
    iosLineSoon: "Bản iOS đang chờ phát hành trên App Store.",
    androidLine: "Bản Android cần cài trực tiếp: tải file APK ở trên, cho phép cài từ nguồn không xác định, rồi mở app.",
    steps: ["Tải và cài app (iOS: App Store · Android: file APK ở trên).", "Mở app và đăng nhập bằng ĐÚNG email bạn đã dùng ở trang này.", "Premium tự kích hoạt — không cần mã, không cần làm gì thêm."],
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
        privacyLabel: "隐私政策",
    supportLabel: "支持",
        testflightSub: "加入测试版",
        noteExtra: "Pro 将为您在上方填写的邮箱激活。若转账后 10 分钟内仍未激活，请联系 support@meetflowai.site。",
        howToTitle: "购买后如何激活",
    iosLineStore: "已在 App Store 上架 — 下载后使用本页填写的同一邮箱登录，Premium 自动开启。",
    iosLineTestflight: "iOS 测试版通过 TestFlight — 加入并安装后，用此邮箱登录。",
    iosLineSoon: "iOS 版本即将在 App Store 上架。",
    androidLine: "Android 需直接安装：下载上方 APK，允许“未知来源”安装，然后打开应用。",
    steps: ["下载并安装应用（iOS：App Store · Android：上方 APK）。", "打开应用，使用本页填写的同一邮箱登录。", "Premium 自动激活 — 无需兑换码，无需其他操作。"],
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
        privacyLabel: "プライバシーポリシー",
    supportLabel: "サポート",
        testflightSub: "ベータに参加",
        noteExtra: "Pro は上に入力したメールに有効化されます。送金後 10 分以上経っても有効にならない場合は support@meetflowai.site までご連絡ください。",
        howToTitle: "購入後の有効化方法",
    iosLineStore: "App Store で配信中 — インストール後、このページで使った同じメールでサインインすると Premium が有効になります。",
    iosLineTestflight: "iOS ベータは TestFlight で配布中 — 参加・インストール後、このメールでサインインしてください。",
    iosLineSoon: "iOS 版は App Store で近日公開予定です。",
    androidLine: "Android は直接インストールが必要です：上の APK をダウンロードし、「提供元不明のアプリ」を許可してから開いてください。",
    steps: ["アプリをダウンロードしてインストール（iOS：App Store · Android：上の APK）。", "アプリを開き、このページで使った同じメールでサインインします。", "Premium は自動的に有効になります — コード入力は不要です。"],
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
        privacyLabel: "개인정보 처리방침",
    supportLabel: "지원",
        testflightSub: "베타 참여",
        noteExtra: "Pro는 위에 입력한 이메일로 활성화됩니다. 송금 후 10분이 지나도 활성화되지 않으면 support@meetflowai.site로 문의하세요.",
        howToTitle: "구매 후 활성화 방법",
    iosLineStore: "App Store에서 제공 중 — 설치 후 이 페이지에서 사용한 동일한 이메일로 로그인하면 Premium이 자동으로 활성화됩니다.",
    iosLineTestflight: "iOS 베타는 TestFlight로 제공 — 참여 후 설치하고 이 이메일로 로그인하세요.",
    iosLineSoon: "iOS 버전은 곧 App Store에 출시됩니다.",
    androidLine: "Android는 직접 설치해야 합니다: 위의 APK를 내려받아 \"알 수 없는 출처\" 설치를 허용한 뒤 앱을 여세요.",
    steps: ["앱을 내려받아 설치합니다 (iOS: App Store · Android: 위의 APK).", "앱을 열고 이 페이지에서 사용한 동일한 이메일로 로그인합니다.", "Premium이 자동으로 활성화됩니다 — 코드 입력이 필요 없습니다."],
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

/* =====================================================================
 * MeetFlow AI (second product) — same web-paywall flow, own plans/brand.
 * 30-day pass / Monthly / Yearly, QR (VietQR) + WeChat + Alipay.
 * ================================================================== */

export const AI_PLANS = {
  pass30:  { amount: 130000,  days: 30,  label: "MeetFlow Pro 30-Day Pass (130,000 VND / 30 days)", badge: "30-Day Pass" },
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
    privacyUrl: "https://meetflowai.site/FlowVPNPrivacy.html",
    supportUrl: "https://meetflowai.site/SupportPrivateVPN.html",
  },
  ai: {
    logoPath: "/assets/meetflow-logo.png",
    brandName: "MeetFlow AI",
    privacyUrl: "https://meetflowai.site/privacy",
    supportUrl: "https://meetflowai.site/support.html",
  },
};

/** Plan list in display order with localized names + price text. */
export function localizedPlanRows(lang, product = "vpn") {
  const base = TEXTS[lang] || TEXTS.vi;
  const t = product === "ai" ? { ...base, ...(AI_TEXTS[lang] || AI_TEXTS.vi) } : base;
  const table = product === "ai" ? AI_PLANS : PLANS;
  const order = product === "ai" ? AI_PLAN_ORDER : ["monthly", "quarterly", "semiannual", "yearly", "lifetime"];
  return order.map((id) => {
    const p = table[id];
    const price = t.planNames[id] + " — " + fmtAmount(lang, p.amount)
      + (p.days ? " / " + p.days + " " + t.dayUnit : " · " + base.lifetimeNote);
    return { id, name: t.planNames[id], price };
  });
}

/** Buy page HTML — dark theme, email + plan + method picker. */
export function buyPageHTML({ baseUrl, lang, product = "vpn", links = {} }) {
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
  const iosUrl = links.ios || null;
  const macUrl = links.mac || null;
  // iOS can be distributed before App Store approval via a TestFlight public
  // link; the App Store badge wins when both exist.
  const testflightUrl = !iosUrl && links.testflight ? links.testflight : null;
  const anyDownload = Boolean(androidUrl || iosUrl || macUrl || testflightUrl);
  // Activation instructions adapt to how iOS is distributed right now.
  const iosLine = iosUrl
    ? t.iosLineStore
    : testflightUrl
      ? t.iosLineTestflight
      : t.iosLineSoon;
  const howToSteps = Array.isArray(t.steps) ? t.steps : [];
  const showDownloads = anyDownload;
  const rows = localizedPlanRows(lang, product);
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
    button {
      width: 100%; margin-top: 24px; border: 0; border-radius: 12px; padding: 14px;
      color: #06160d; background: #33c773; font: inherit; font-weight: 800; cursor: pointer; font-size: 16px;
    }
    button:disabled { opacity: .55; }
    .status { margin-top: 14px; text-align: center; font-size: 13px; min-height: 18px; }
    .status.err { color: #ff5a6a; }
    .note { margin-top: 16px; text-align: center; color: rgba(255,255,255,.4); font-size: 12px; }
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
    .footer {
      margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.1);
      text-align: center; font-size: 12px;
    }
    .footer a { color: rgba(255,255,255,.62); text-decoration: none; }
    .footer a:hover { color: #33c773; text-decoration: underline; }
    .footer .sep { color: rgba(255,255,255,.3); margin: 0 8px; }

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
    <div class="langbar">
      ${["vi", "en", "zh", "ja", "ko"].map((code) => {
        const names = { vi: "Tiếng Việt", en: "English", zh: "中文", ja: "日本語", ko: "한국어" };
        return `<a class="lang${code === lang ? " on" : ""}" href="?lang=${code}" hreflang="${code}">${names[code]}</a>`;
      }).join("")}
    </div>

    <div class="brand">
      <img class="brand-logo" src="${logoUrl}" alt="${meta.brandName}">
      <div class="logo">${logoHtml}</div>
    </div>
    <div class="sub">${t.sub}</div>

    ${showDownloads ? `<div class="dl-section">
      <div class="dl-title">${t.dlTitle}</div>
      <div class="dl-sub">${t.dlSub}</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center;">
        ${iosUrl ? `<a href="${iosUrl}" target="_blank" rel="noopener" title="Download on the App Store (iOS)">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">Download on the</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">App Store</text>
          </svg>
        </a>` : ""}
        ${testflightUrl ? `<a href="${testflightUrl}" target="_blank" rel="noopener" title="TestFlight beta">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d" stroke="rgba(255,255,255,.18)"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">${t.testflightSub}</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">TestFlight</text>
          </svg>
        </a>` : ""}

        ${macUrl ? `<a href="${macUrl}" target="_blank" rel="noopener" title="Download on the Mac App Store">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">Download on the</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Mac App Store</text>
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
            <text x="45" y="20" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.5" fill="#fff" opacity="0.9">GET IT ON</text>
            <text x="45" y="34" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Google Play</text>
          </svg>
        </a>` : ""}
      </div>
    </div>` : ""}

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
          <div class="icon"><span class="brand" style="background:rgba(255,255,255,.14)">🏦</span></div>${t.bankName}<br><small>${t.bankScan}</small>
        </div>
        <div class="method brand-wechat" data-method="wechat">
          <div class="icon"><span class="brand"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg></span></div>WeChat Pay<br><small>${t.wechatScan}</small>
        </div>
        <div class="method brand-alipay" data-method="alipay">
          <div class="icon"><span class="brand"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809"/></svg></span></div>Alipay<br><small>${t.alipayScan}</small>
        </div>
        <div class="method" data-method="payos">
          <div class="icon"><span class="brand" style="background:rgba(255,255,255,.14)">💳</span></div>${t.payosName}<br><small>${t.payosSub}</small>
        </div>
      </div>

      <button type="submit" id="payBtn">${t.payBtn}</button>
      <div class="status" id="status"></div>
      <div class="note">${t.note}</div>
      <div class="noteextra">ℹ️ ${t.noteExtra}</div>
    </form>

    <div class="howto">
      <div class="howto-title">📱 ${t.howToTitle}</div>
      <div class="howto-row"><span class="plat">iOS</span><span>${iosLine}</span></div>
      <div class="howto-row"><span class="plat">Android</span><span>${t.androidLine}</span></div>
      <ol class="howto-steps">
        ${howToSteps.map((step) => `<li>${step}</li>`).join("")}
      </ol>
    </div>

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
        const res = await fetch(base + "${apiPrefix}/create", {
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
<style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Segoe UI",sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}.card{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}.check{font-size:52px;color:#33c773}h1{font-size:22px;margin:12px 0}p{color:rgba(255,255,255,.6);font-size:14px;line-height:1.5}</style></head>
<body><div class="card"><div class="check">✓</div><h1>${t.successTitle}</h1><p>${t.successBody}</p></div></body></html>`;
}

export function paymentCancelPageHTML(lang, product = "vpn") {
  lang = pickBuyLang(lang);
  const base = TEXTS[lang];
  const t = product === "ai" ? { ...base, ...(AI_TEXTS[lang] || AI_TEXTS.vi) } : base;
  return `<!doctype html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.pageTitle} — ✕</title>
<style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Segoe UI",sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}.card{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}h1{font-size:22px;margin:12px 0}p{color:rgba(255,255,255,.6);font-size:14px;line-height:1.5}</style></head>
<body><div class="card"><h1>${t.cancelTitle}</h1><p>${t.cancelBody}</p></div></body></html>`;
}

export const PLANS_PUBLIC = PLANS;
