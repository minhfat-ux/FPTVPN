/**
 * Trang chủ (index) của hệ sinh thái FlowTech — VPNFlow (VPN) + MeetFlow AI + FlowTech Harness.
 *
 * Vì sao có file này: trước đây khách chỉ gặp trang /buy (paywall) khi đã có link, còn
 * meetflowai.site/ chưa có trang giới thiệu nào do mình phục vụ. Trang này là mặt tiền:
 * nói rõ ba sản phẩm, bảng giá lấy ĐÚNG từ PlanStore của control plane, FAQ thật của sản
 * phẩm, và hai nút mua trỏ về /buy + /ai/buy.
 *
 * Nguyên tắc nội dung (quan trọng hơn hình thức):
 *   - Mọi con số/năng lực nêu trên trang phải kiểm chứng được trong repo (thanh toán QR
 *     VietQR, hoá đơn email, 4 nền tảng app, 5 ngôn ngữ, giới hạn thiết bị theo
 *     MAX_DEVICES_PER_USER). KHÔNG bịa số liệu, giải thưởng hay đánh giá khách.
 *   - Khối "đánh giá khách" chỉ render khi người gọi truyền `reviews` thật (xem chú thích
 *     ở reviewsHTML bên dưới) — không có dữ liệu thì ẩn hẳn, không dựng review giả.
 *   - Bảng giá chỉ render khi có gói đang bán; `plans: []` ⇒ ẩn cả khối (không hiện bảng trống).
 *
 * Thuần Node ESM, không thư viện ngoài, không ảnh ngoài (logo vẽ bằng SVG inline để trang
 * vẫn hiện đủ khi mạng hạn chế). Mọi chuỗi từ dữ liệu (plans, reviews, email, url) đi qua
 * esc() trước khi vào HTML.
 */

/** 5 ngôn ngữ, cùng bộ mã với trang /buy và /guide (en/vi/zh/ja/ko). */
const LANG_CODES = ["en", "vi", "zh", "ja", "ko"];

/** Chuẩn hoá mã ngôn ngữ; mã lạ ⇒ vi (giữ hành vi cũ của các trang khác). */
export function pickHomeLang(v) {
  return LANG_CODES.includes(v) ? v : "vi";
}

const LOCALES = { en: "en-US", vi: "vi-VN", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR" };

const LANG_NAMES = { vi: "Tiếng Việt", en: "English", zh: "中文", ja: "日本語", ko: "한국어" };

/**
 * Escape mọi giá trị động trước khi nhét vào HTML (text và attribute).
 * Dùng cho plans / reviews / email / url — những thứ không do file này kiểm soát.
 */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Chỉ cho phép href tương đối hoặc http(s)/mailto: — chặn `javascript:` / `data:` do dữ
 * liệu bên ngoài (gói admin thêm, review) chui vào thuộc tính href.
 * Trả về "" khi không hợp lệ để call site bỏ luôn thẻ <a>.
 */
function safeHref(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^(https?:|mailto:)/i.test(raw)) return raw;
  if (raw.startsWith("//")) return ""; // protocol-relative: không nhận từ dữ liệu động
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return ""; // scheme khác (javascript:, data:, …)
  return raw.startsWith("/") || raw.startsWith("?") || raw.startsWith("#") ? raw : `/${raw}`;
}

/** Nối `?plan=` vào url mua mà không phá query có sẵn (vd `/buy?lang=vi`). */
function withPlan(url, planId) {
  const href = safeHref(url);
  if (!href || !planId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}plan=${encodeURIComponent(planId)}`;
}

/** Điền chỗ trống `{ten}` trong câu dịch bằng giá trị ĐÃ escape. */
function fill(template, values) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole);
}

/** Số nguyên dương (số ngày, số thiết bị) — sai/thiếu ⇒ null để không hiện số vô nghĩa. */
function positiveInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Tiền tệ: VND (đ), CNY (¥), USD ($), còn lại `CODE 123`. Không bao giờ trả NaN. */
function money(amount, currency, lang) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  const locale = LOCALES[lang] || "vi-VN";
  let num;
  try {
    num = new Intl.NumberFormat(locale).format(n);
  } catch {
    num = String(n);
  }
  const code = String(currency || "VND").toUpperCase();
  if (code === "VND") return `${num} đ`;
  if (code === "CNY") return `¥${num}`;
  if (code === "USD") return Number.isInteger(n) ? `$${num}` : `$${n.toFixed(2)}`;
  return `${code} ${num}`;
}

const TEXTS = {
  en: {
    htmlLang: "en",
    pageTitle: "FlowTech — VPNFlow VPN and MeetFlow AI",
    metaDescription:
      "FlowTech is building an AI ecosystem for connectivity, education and the small utilities that fill a working day — so each person gets more done. Products: VPNFlow, MeetFlow AI, FlowTech Harness, fBuddy, SuperMom AI.",
    brandTagline: "AI Ecosystem",
    navAria: "Main navigation",
    navProducts: "Products",
    navPricing: "Pricing",
    navFaq: "FAQ",
    navBuy: "Buy now",
    langAria: "Choose language",
    heroKicker: "The FlowTech ecosystem",
    heroTitle: "An AI ecosystem for connectivity, learning and everyday work",
    heroSub:
      "Our mission is to bring AI into networking, education and the small tools that fill a working day — so every person gets more done with less friction. The two of us build it together, one product at a time: VPNFlow, MeetFlow AI, FlowTech Harness, fBuddy and SuperMom AI.",
    ctaVpn: "Buy VPNFlow",
    ctaAi: "Use MeetFlow AI",
    trustAria: "What we actually offer",
    trust: [
      "Bank QR payment (VietQR) — scan, the amount is pre-filled, the transfer note carries your order code",
      "Invoice and activation confirmations sent by email",
      "Apps for iOS (IPA), Android (APK), macOS (.dmg) and Windows (one-click installer)",
      "One account on up to {maxDevices} active devices, switch devices any time",
      "Public pages in 5 languages: Vietnamese, English, Chinese, Japanese, Korean",
    ],
    productsTitle: "Products",
    productsSub: "Five parts of the same ecosystem — buy only what you need.",
    p1Name: "VPNFlow",
    p1Tag: "Private VPN",
    p1Desc: "A WireGuard-based VPN that ties your subscription to your email account.",
    p1Bullets: [
      "Sign in with an email one-time code — no password to remember",
      "Install on iOS (IPA), Android (APK), macOS (.dmg) and Windows",
      "Plans are one-time purchases: no auto-renewal, we email you before expiry",
    ],
    p1Cta: "Buy VPNFlow",
    p2Name: "MeetFlow AI",
    p2Tag: "AI assistant",
    p2Desc: "AI translation and meeting minutes for your calls and recordings.",
    p2Bullets: [
      "Pro unlocks after checkout — the app verifies the email you bought with",
      "Android APK and iOS build available",
      "30-day pass, monthly and yearly plans, all one-time on the web",
    ],
    p2Cta: "Use MeetFlow AI",
    p3Name: "FlowTech Harness",
    p3Tag: "Agent toolkit",
    p3Desc: "Our packaged agent harness: run the assistant on your own machine, reach it from anywhere.",
    p3Bullets: [
      "One-command installer for macOS plus a Windows installer in the same package",
      "Optional VPS part: HTTPS domain with a login gate in front of your machine",
      "Source and install scripts are kept in the project repository",
    ],
    p3Cta: "Install guide",
    p4Name: "fBuddy",
    p4Tag: "AI chat app",
    p4Desc: "The friendly AI assistant app: ask, write, translate and summarise — on the web or on your phone.",
    p4Bullets: [
      "Chat by voice, in Vietnamese, English, Chinese, Japanese and Korean",
      "Translation, writing and meeting summaries in one app",
      "Opens in the browser — install it as an app on iOS and Android",
    ],
    p4Cta: "Open fBuddy",
    p5Name: "SuperMom AI",
    p5Tag: "AI study helper",
    p5Desc: "An AI study companion for Vietnamese parents with children in grades 1–9: photograph a maths problem and get a step-by-step solution written so the parent understands it, not just the child.",
    p5Bullets: [
      "Snap a maths problem for a step-by-step solution, and check a finished worksheet for mistakes",
      "English solver, a daily challenge, study notes with reminders, and an AI chat for parents",
      "On the App Store for iPhone and iPad — a Vietnamese interface written for parents",
    ],
    p5Cta: "Download on the App Store",
    dlAria: "Download the app",
    platforms: {
      ios: "iOS (IPA)",
      android: "Android (APK)",
      androidLegacy: "Android 7.x (APK)",
      mac: "macOS",
      windows: "Windows 10/11",
      appStore: "App Store",
      appStoreMac: "App Store (macOS)",
      windowsOverlay: "Windows overlay",
    },
    pricingTitle: "Pricing",
    pricingSub: "Prices are in VND. Bank QR, MoMo, WeChat Pay or Alipay — your choice at checkout.",
    pricingOneTime: "Every plan is a one-time purchase: nothing renews by itself.",
    pricingLifetime: "Lifetime (no expiry)",
    pricingDays: "{days} days",
    planCta: "Choose this plan",
    faqTitle: "Frequently asked",
    faq: [
      [
        "How do I pay with a bank QR?",
        "Open the buy page, enter your account email, pick a plan and scan the QR with your banking app. The amount is already filled in and the transfer note carries the order code — transfer the exact amount and keep the note unchanged so the payment is matched.",
      ],
      [
        "How long until my plan is activated?",
        "We match the incoming transfer, activate the plan for the email you bought with and email you the invoice. It usually takes a few minutes; if nothing arrives after 10 minutes, email support with your order code.",
      ],
      [
        "How many devices can one account use?",
        "Up to {maxDevices} active devices per account. To move to a new device, sign out of an old one first.",
      ],
      [
        "Does the plan renew automatically?",
        "No. Bank QR payment is a one-time purchase that covers the plan's days; you will get a reminder email before it expires.",
      ],
      [
        "What about refunds and support?",
        "Email {supportEmail} with the order code and the email you bought with. Refund requests are handled under our terms of service — we do not promise automatic refunds.",
      ],
      [
        "How do I install the app?",
        "iOS: open /install/ios in Safari on the device itself and register it (UDID) so a signed build can be produced. Android: download the APK on the buy page and allow installs from unknown sources. macOS: download the .dmg. Windows: run the installer (it asks for admin rights to create the tunnel).",
      ],
      [
        "Does a web purchase work on both iOS and Android?",
        "Yes. The plan is tied to your email account, so signing in with the same email works on every supported device.",
      ],
      [
        "Do I have to pay again on a new device?",
        "No. Sign in with the same email on the new device; if the account already has {maxDevices} active devices, remove an old one first.",
      ],
    ],
    reviewsTitle: "What customers say",
    reviewsSub: "Reviews we received directly from customers.",
    reviewsStars: "{stars} out of 5",
    promoTitle: "One more thing while you are here",
    promoBody:
      "VPNFlow keeps the connection private, MeetFlow AI takes the notes. Both activate with your email right after payment.",
    promoVpn: "Buy VPNFlow",
    promoAi: "Try MeetFlow AI",
    promoClose: "Close",
    promoNever: "Do not show again",
    footerProducts: "Products",
    footerHelp: "Help &amp; legal",
    footerBuy: "Buy VPNFlow",
    footerAiBuy: "Buy MeetFlow AI",
    footerGuide: "Activation guide",
    footerInstallIos: "Install on iPhone / iPad",
    footerSupport: "Support",
    footerPrivacy: "Privacy policy",
    footerTerms: "Terms of service",
    footerContact: "Need help? Email",
    footerRights: "© {year} FlowTech. All rights reserved.",
  },

  vi: {
    htmlLang: "vi",
    pageTitle: "FlowTech — VPNFlow và MeetFlow AI",
    metaDescription:
      "FlowTech đang xây một hệ sinh thái AI cho kết nối, giáo dục và những tiện ích lấp đầy một ngày làm việc — để mỗi người làm được nhiều hơn. Sản phẩm: VPNFlow, MeetFlow AI, FlowTech Harness, fBuddy và SuperMom AI.",
    brandTagline: "AI Ecosystem",
    navAria: "Điều hướng chính",
    navProducts: "Sản phẩm",
    navPricing: "Bảng giá",
    navFaq: "Câu hỏi",
    navBuy: "Mua ngay",
    langAria: "Chọn ngôn ngữ",
    heroKicker: "Hệ sinh thái FlowTech",
    heroTitle: "Hệ sinh thái AI cho kết nối, học tập và công việc hằng ngày",
    heroSub:
      "Sứ mệnh của tụi mình là đưa AI vào network, education và những tiện ích nhỏ lấp đầy một ngày làm việc — để mỗi người làm được nhiều hơn mà bớt ma sát. Hai anh em cùng phát triển, mỗi lần một sản phẩm: VPNFlow, MeetFlow AI, FlowTech Harness, fBuddy và SuperMom AI.",
    ctaVpn: "Mua VPNFlow",
    ctaAi: "Dùng MeetFlow AI",
    trustAria: "Những gì chúng tôi thực sự có",
    trust: [
      "Thanh toán QR ngân hàng (VietQR) — quét là ra đúng số tiền, nội dung chuyển khoản có mã đơn",
      "Hoá đơn và xác nhận kích hoạt gửi qua email",
      "App cho iOS (IPA), Android (APK), macOS (.dmg) và Windows (bộ cài 1 lần bấm)",
      "Một tài khoản dùng được tối đa {maxDevices} thiết bị đang hoạt động, đổi máy bất cứ lúc nào",
      "Trang công khai đủ 5 ngôn ngữ: Việt, Anh, Trung, Nhật, Hàn",
    ],
    productsTitle: "Sản phẩm",
    productsSub: "Năm phần trong cùng một hệ sinh thái — cần gì mua nấy.",
    p1Name: "VPNFlow",
    p1Tag: "VPN riêng tư",
    p1Desc: "VPN chạy trên WireGuard, gói mua gắn với email tài khoản của bạn.",
    p1Bullets: [
      "Đăng nhập bằng mã dùng một lần gửi tới email — không cần nhớ mật khẩu",
      "Cài trên iOS (IPA), Android (APK), macOS (.dmg) và Windows",
      "Gói mua một lần, không tự động gia hạn; gần hết hạn sẽ có email nhắc",
    ],
    p1Cta: "Mua VPNFlow",
    p2Name: "MeetFlow AI",
    p2Tag: "Trợ lý AI",
    p2Desc: "Dịch và ghi biên bản cuộc họp bằng AI cho cuộc gọi và bản ghi âm của bạn.",
    p2Bullets: [
      "Pro mở khoá ngay sau khi thanh toán — app kiểm tra đúng email đã mua",
      "Có bản Android (APK) và bản iOS",
      "Gói 30 ngày, theo tháng và theo năm — mua một lần trên web",
    ],
    p2Cta: "Dùng MeetFlow AI",
    p3Name: "FlowTech Harness",
    p3Tag: "Bộ công cụ agent",
    p3Desc: "Bộ harness agent của chúng tôi: chạy trợ lý trên máy của bạn và mở nó từ xa.",
    p3Bullets: [
      "Cài bằng một lệnh trên macOS, kèm bộ cài Windows trong cùng gói",
      "Phần VPS tuỳ chọn: tên miền HTTPS có cổng đăng nhập trước máy của bạn",
      "Mã nguồn và script cài nằm trong kho của dự án",
    ],
    p3Cta: "Hướng dẫn cài",
    p4Name: "fBuddy",
    p4Tag: "App AI đa năng",
    p4Desc: "App trợ lý AI thân thiện: hỏi đáp, viết, dịch và tóm tắt — dùng trên web hoặc trên điện thoại.",
    p4Bullets: [
      "Trò chuyện bằng giọng nói, hỗ trợ Việt, Anh, Trung, Nhật, Hàn",
      "Dịch, viết và tóm tắt cuộc họp trong cùng một app",
      "Mở ngay trên trình duyệt — cài thành app trên iOS và Android",
    ],
    p4Cta: "Mở fBuddy",
    p5Name: "SuperMom AI",
    p5Tag: "Trợ lý học tập AI",
    p5Desc: "Trợ lý học tập bằng AI cho cha mẹ Việt Nam có con học lớp 1–9: chụp ảnh bài toán rồi nhận lời giải từng bước, viết để phụ huynh hiểu chứ không chỉ cho con.",
    p5Bullets: [
      "Chụp bài toán để giải từng bước, và kiểm tra lại bài con đã làm xem sai ở đâu",
      "Giải bài tiếng Anh, thử thách mỗi ngày, ghi chú lịch học kèm nhắc nhở, chat với AI",
      "Có trên App Store cho iPhone và iPad — giao diện tiếng Việt viết cho phụ huynh",
    ],
    p5Cta: "Tải trên App Store",
    dlAria: "Tải app",
    platforms: {
      ios: "iOS (IPA)",
      android: "Android (APK)",
      androidLegacy: "Android 7.x (APK)",
      mac: "macOS",
      windows: "Windows 10/11",
      appStore: "App Store",
      appStoreMac: "App Store (macOS)",
      windowsOverlay: "Windows (overlay)",
    },
    pricingTitle: "Bảng giá",
    pricingSub: "Giá tính bằng VND. Lúc thanh toán bạn chọn QR ngân hàng, MoMo, WeChat Pay hoặc Alipay.",
    pricingOneTime: "Mọi gói đều mua một lần — không có gói nào tự động gia hạn.",
    pricingLifetime: "Vĩnh viễn (không hết hạn)",
    pricingDays: "{days} ngày",
    planCta: "Chọn gói này",
    faqTitle: "Câu hỏi thường gặp",
    faq: [
      [
        "Thanh toán bằng QR ngân hàng thế nào?",
        "Mở trang mua, nhập email tài khoản, chọn gói rồi quét mã QR bằng app ngân hàng. Số tiền đã điền sẵn và nội dung chuyển khoản có mã đơn — chuyển đúng số tiền, giữ nguyên nội dung để hệ thống khớp được đơn.",
      ],
      [
        "Bao lâu thì gói được kích hoạt?",
        "Hệ thống đối soát tiền về, kích hoạt gói cho đúng email bạn đã mua và gửi hoá đơn qua email. Thường chỉ vài phút; sau 10 phút vẫn chưa thấy thì gửi email hỗ trợ kèm mã đơn.",
      ],
      [
        "Một tài khoản dùng được mấy thiết bị?",
        "Tối đa {maxDevices} thiết bị đang hoạt động cho mỗi tài khoản. Muốn chuyển sang máy mới, hãy đăng xuất một thiết bị cũ trước.",
      ],
      [
        "Gói có tự động gia hạn không?",
        "Không. Thanh toán QR là mua một lần, dùng đúng số ngày của gói; gần hết hạn bạn sẽ nhận email nhắc gia hạn.",
      ],
      [
        "Hoàn tiền và hỗ trợ ra sao?",
        "Gửi email tới {supportEmail} kèm mã đơn và email bạn đã mua. Yêu cầu hoàn tiền được xử lý theo điều khoản dịch vụ — chúng tôi không hứa hoàn tiền tự động.",
      ],
      [
        "Cài app trên từng máy thế nào?",
        "iOS: mở /install/ios bằng Safari trên chính máy đó rồi đăng ký thiết bị (UDID) để shop ký bản cài. Android: tải APK ở trang mua và cho phép cài từ nguồn không xác định. macOS: tải file .dmg. Windows: chạy bộ cài (app xin quyền admin để dựng tunnel).",
      ],
      [
        "Mua trên web dùng được cho cả iOS và Android?",
        "Được. Gói gắn với email tài khoản, nên đăng nhập bằng đúng email đã mua là dùng được trên mọi thiết bị được hỗ trợ.",
      ],
      [
        "Đổi sang máy mới có phải mua lại?",
        "Không. Chỉ cần đăng nhập cùng email trên máy mới; nếu tài khoản đã có đủ {maxDevices} thiết bị hoạt động thì gỡ một thiết bị cũ trước.",
      ],
    ],
    reviewsTitle: "Khách nói gì",
    reviewsSub: "Đánh giá do khách gửi trực tiếp cho chúng tôi.",
    reviewsStars: "{stars} trên 5",
    promoTitle: "Còn một thứ nữa",
    promoBody:
      "VPNFlow giữ kết nối riêng tư, MeetFlow AI ghi biên bản cuộc họp. Cả hai kích hoạt theo email ngay sau khi thanh toán.",
    promoVpn: "Mua VPNFlow",
    promoAi: "Dùng thử MeetFlow AI",
    promoClose: "Đóng",
    promoNever: "Không hiện lại",
    footerProducts: "Sản phẩm",
    footerHelp: "Hỗ trợ &amp; pháp lý",
    footerBuy: "Mua VPNFlow",
    footerAiBuy: "Mua MeetFlow AI",
    footerGuide: "Hướng dẫn kích hoạt",
    footerInstallIos: "Cài trên iPhone / iPad",
    footerSupport: "Hỗ trợ",
    footerPrivacy: "Chính sách bảo mật",
    footerTerms: "Điều khoản dịch vụ",
    footerContact: "Cần hỗ trợ? Email",
    footerRights: "© {year} FlowTech. Bảo lưu mọi quyền.",
  },

  zh: {
    htmlLang: "zh-Hans",
    pageTitle: "FlowTech — VPNFlow 与 MeetFlow AI",
    metaDescription:
      "FlowTech 正在构建面向连接、教育与日常工作工具的 AI 生态——让每个人产出更多。产品：VPNFlow、MeetFlow AI、FlowTech Harness、fBuddy、SuperMom AI。",
    brandTagline: "AI Ecosystem",
    navAria: "主导航",
    navProducts: "产品",
    navPricing: "价格",
    navFaq: "常见问题",
    navBuy: "立即购买",
    langAria: "选择语言",
    heroKicker: "FlowTech 生态",
    heroTitle: "面向连接、学习与日常工作的 AI 生态",
    heroSub:
      "我们的使命是把 AI 带进网络、教育和填满一天工作的小工具——让每个人以更少的阻力完成更多事情。由我们两个人一起开发，一次一个产品：VPNFlow、MeetFlow AI、FlowTech Harness、fBuddy 和 SuperMom AI。",
    ctaVpn: "购买 VPNFlow",
    ctaAi: "使用 MeetFlow AI",
    trustAria: "我们真实提供的能力",
    trust: [
      "银行二维码付款（VietQR）——扫码即带金额，转账备注含订单号",
      "发票与激活确认通过邮件发送",
      "支持 iOS（IPA）、Android（APK）、macOS（.dmg）与 Windows（一键安装包）",
      "一个账号最多 {maxDevices} 台在线设备，随时可换设备",
      "公开页面支持 5 种语言：越语、英语、中文、日语、韩语",
    ],
    productsTitle: "产品",
    productsSub: "同一生态的五部分 — 需要哪个买哪个。",
    p1Name: "VPNFlow",
    p1Tag: "私有 VPN",
    p1Desc: "基于 WireGuard 的 VPN，套餐与你的账号邮箱绑定。",
    p1Bullets: [
      "用邮箱一次性验证码登录 — 不需要记密码",
      "支持 iOS（IPA）、Android（APK）、macOS（.dmg）与 Windows",
      "套餐为一次性购买，不会自动续订；到期前会发邮件提醒",
    ],
    p1Cta: "购买 VPNFlow",
    p2Name: "MeetFlow AI",
    p2Tag: "AI 助手",
    p2Desc: "为通话与录音提供 AI 翻译与会议纪要。",
    p2Bullets: [
      "付款后即可解锁 Pro — 应用会校验购买时使用的邮箱",
      "提供 Android（APK）与 iOS 版本",
      "30 天通行证、月度、年度套餐，网页一次性购买",
    ],
    p2Cta: "使用 MeetFlow AI",
    p3Name: "FlowTech Harness",
    p3Tag: "Agent 工具箱",
    p3Desc: "我们打包的 agent harness：在自己的机器上运行助手，并可远程访问。",
    p3Bullets: [
      "macOS 一条命令安装，同一安装包内含 Windows 安装程序",
      "可选 VPS 部分：在机器前加 HTTPS 域名与登录门禁",
      "源码与安装脚本保留在项目仓库中",
    ],
    p3Cta: "安装说明",
    p4Name: "fBuddy",
    p4Tag: "AI 对话应用",
    p4Desc: "好用的 AI 助手应用：问答、写作、翻译、总结——网页和手机都能用。",
    p4Bullets: [
      "语音对话，支持越南语、英语、中文、日语、韩语",
      "翻译、写作和会议纪要在同一个应用里完成",
      "浏览器直接打开——也可在 iOS 和 Android 上安装为应用",
    ],
    p4Cta: "打开 fBuddy",
    p5Name: "SuperMom AI",
    p5Tag: "AI 学习助手",
    p5Desc: "面向越南家长的 AI 学习助手，适合 1–9 年级孩子的家庭：拍下数学题，得到写给家长看的逐步讲解。",
    p5Bullets: [
      "拍数学题获得逐步解答，还能检查孩子做过的作业错在哪里",
      "英语题解答、每日挑战、带提醒的学习笔记，以及与 AI 对话",
      "已在 App Store 上架，支持 iPhone 和 iPad——越南语界面，为家长而写",
    ],
    p5Cta: "在 App Store 下载",
    dlAria: "下载应用",
    platforms: {
      ios: "iOS (IPA)",
      android: "Android (APK)",
      androidLegacy: "Android 7.x (APK)",
      mac: "macOS",
      windows: "Windows 10/11",
      appStore: "App Store",
      appStoreMac: "App Store (macOS)",
      windowsOverlay: "Windows 悬浮窗版",
    },
    pricingTitle: "价格",
    pricingSub: "价格以越南盾（VND）计。付款时可选择银行二维码、MoMo、微信支付或支付宝。",
    pricingOneTime: "所有套餐均为一次性购买 — 不会自动续订。",
    pricingLifetime: "永久（不限时间）",
    pricingDays: "{days} 天",
    planCta: "选择此套餐",
    faqTitle: "常见问题",
    faq: [
      [
        "如何用银行二维码付款？",
        "打开购买页，填写账号邮箱、选择套餐，用银行 App 扫描二维码。金额已填好，转账备注含订单号 — 请转入准确金额并保留备注，系统才能匹配订单。",
      ],
      [
        "多久可以激活？",
        "系统核对到账后为购买邮箱开通套餐，并把发票发到你的邮箱。通常几分钟；若 10 分钟后仍未收到，请带上订单号联系客服。",
      ],
      [
        "一个账号可以几台设备使用？",
        "每个账号最多 {maxDevices} 台在线设备。换新设备前请先退出一台旧设备。",
      ],
      [
        "套餐会自动续订吗？",
        "不会。二维码付款为一次性购买，覆盖套餐天数；到期前我们会发提醒邮件。",
      ],
      [
        "退款与支持怎么处理？",
        "请将订单号和购买邮箱发到 {supportEmail}。退款按服务条款处理 — 我们不承诺自动退款。",
      ],
      [
        "各平台怎么安装？",
        "iOS：在该设备上用 Safari 打开 /install/ios 并注册设备（UDID），我们才能为你签名。Android：在购买页下载 APK，并允许安装未知来源应用。macOS：下载 .dmg。Windows：运行安装包（创建隧道时会请求管理员权限）。",
      ],
      [
        "网页购买能在 iOS 和 Android 上用吗？",
        "可以。套餐绑定你的账号邮箱，用同一邮箱登录即可在所有支持的设备上使用。",
      ],
      [
        "换设备需要重新购买吗？",
        "不需要。在新设备上用同一邮箱登录即可；若账号已有 {maxDevices} 台在线设备，请先移除一台旧设备。",
      ],
    ],
    reviewsTitle: "客户评价",
    reviewsSub: "以下为顾客直接提交给我们的评价。",
    reviewsStars: "{stars} 分（满分 5 分）",
    promoTitle: "顺便说一句",
    promoBody: "VPNFlow 负责私密连接，MeetFlow AI 负责记会议纪要。两者付款后都用邮箱激活。",
    promoVpn: "购买 VPNFlow",
    promoAi: "试试 MeetFlow AI",
    promoClose: "关闭",
    promoNever: "不再显示",
    footerProducts: "产品",
    footerHelp: "帮助与条款",
    footerBuy: "购买 VPNFlow",
    footerAiBuy: "购买 MeetFlow AI",
    footerGuide: "激活指南",
    footerInstallIos: "在 iPhone / iPad 上安装",
    footerSupport: "支持",
    footerPrivacy: "隐私政策",
    footerTerms: "服务条款",
    footerContact: "需要帮助？邮件",
    footerRights: "© {year} FlowTech 保留所有权利。",
  },

  ja: {
    htmlLang: "ja",
    pageTitle: "FlowTech — VPNFlow と MeetFlow AI",
    metaDescription:
      "FlowTech は、接続・教育・日々の仕事を支える小さな道具に AI を届けるエコシステムを作っています。製品：VPNFlow、MeetFlow AI、FlowTech Harness、fBuddy、SuperMom AI。",
    brandTagline: "AI Ecosystem",
    navAria: "メインナビゲーション",
    navProducts: "製品",
    navPricing: "料金",
    navFaq: "よくある質問",
    navBuy: "今すぐ購入",
    langAria: "言語を選択",
    heroKicker: "FlowTech エコシステム",
    heroTitle: "接続・学び・日々の仕事のための AI エコシステム",
    heroSub:
      "私たちの使命は、AI をネットワーク、教育、そして一日の仕事を埋める小さな道具に届けること。一人ひとりがより少ない摩擦で、より多くを成し遂げられるように。二人で一緒に、一つずつ形にしています：VPNFlow、MeetFlow AI、FlowTech Harness、fBuddy、SuperMom AI。",
    ctaVpn: "VPNFlow を購入",
    ctaAi: "MeetFlow AI を使う",
    trustAria: "実際に提供している内容",
    trust: [
      "銀行 QR 決済（VietQR）— 読み取れば金額が入り、振込メモに注文番号が入ります",
      "請求書と有効化の確認はメールで送信",
      "iOS（IPA）・Android（APK）・macOS（.dmg）・Windows（ワンクリックインストーラ）対応",
      "1 アカウントにつき最大 {maxDevices} 台の有効端末、機種変更はいつでも",
      "公開ページは 5 言語：ベトナム語・英語・中国語・日本語・韓国語",
    ],
    productsTitle: "製品",
    productsSub: "同じエコシステムの 5 つ — 必要なものだけ購入できます。",
    p1Name: "VPNFlow",
    p1Tag: "プライベート VPN",
    p1Desc: "WireGuard ベースの VPN。プランはアカウントのメールに紐づきます。",
    p1Bullets: [
      "メールのワンタイムコードでログイン — パスワード不要",
      "iOS（IPA）・Android（APK）・macOS（.dmg）・Windows にインストール可能",
      "買い切りのプランで自動更新なし。期限前にリマインダーメールを送ります",
    ],
    p1Cta: "VPNFlow を購入",
    p2Name: "MeetFlow AI",
    p2Tag: "AI アシスタント",
    p2Desc: "通話や録音に対する AI 翻訳と議事録。",
    p2Bullets: [
      "決済後に Pro が有効 — アプリが購入時のメールを確認します",
      "Android（APK）版と iOS 版があります",
      "30 日パス・月額・年額、いずれもウェブでの買い切り",
    ],
    p2Cta: "MeetFlow AI を使う",
    p3Name: "FlowTech Harness",
    p3Tag: "エージェントツールキット",
    p3Desc: "当社の agent harness パッケージ。自分のマシンで実行し、外部から接続できます。",
    p3Bullets: [
      "macOS はコマンド 1 つでインストール、同じパッケージに Windows インストーラも同梱",
      "任意の VPS 構成：HTTPS ドメインとログインゲートをマシンの手前に配置",
      "ソースとインストールスクリプトはプロジェクトのリポジトリにあります",
    ],
    p3Cta: "インストール手順",
    p4Name: "fBuddy",
    p4Tag: "AI チャットアプリ",
    p4Desc: "親しみやすい AI アシスタントアプリ。質問・作成・翻訳・要約を、Web でもスマホでも。",
    p4Bullets: [
      "音声で会話。ベトナム語・英語・中国語・日本語・韓国語に対応",
      "翻訳・執筆・議事録をひとつのアプリで",
      "ブラウザですぐ使える——iOS / Android にアプリとしても追加可能",
    ],
    p4Cta: "fBuddy を開く",
    p5Name: "SuperMom AI",
    p5Tag: "AI 学習アシスタント",
    p5Desc: "ベトナムの保護者向け AI 学習アシスタント（1〜9 年生）。算数の問題を撮影すると、子どもだけでなく保護者が理解できる段階的な解説が返ります。",
    p5Bullets: [
      "算数の問題を撮影すると段階的な解答、解いた答案の間違いチェックも",
      "英語の解答、毎日のチャレンジ、リマインダー付き学習メモ、AI チャット",
      "App Store で iPhone / iPad 向けに公開——保護者向けのベトナム語 UI",
    ],
    p5Cta: "App Store でダウンロード",
    dlAria: "アプリをダウンロード",
    platforms: {
      ios: "iOS (IPA)",
      android: "Android (APK)",
      androidLegacy: "Android 7.x (APK)",
      mac: "macOS",
      windows: "Windows 10/11",
      appStore: "App Store",
      appStoreMac: "App Store (macOS)",
      windowsOverlay: "Windows（オーバーレイ）",
    },
    pricingTitle: "料金",
    pricingSub: "価格は VND 表示。支払い時に銀行 QR・MoMo・WeChat Pay・Alipay から選べます。",
    pricingOneTime: "すべて買い切りのプランです — 自動更新はありません。",
    pricingLifetime: "永久（期限なし）",
    pricingDays: "{days} 日",
    planCta: "このプランを選ぶ",
    faqTitle: "よくある質問",
    faq: [
      [
        "銀行 QR での支払い方法は？",
        "購入ページでアカウントのメールを入力し、プランを選んで銀行アプリで QR を読み取ります。金額は入力済みで、振込メモに注文番号が入ります — 正確な金額を、メモを変えずに振り込んでください。",
      ],
      [
        "有効化までどのくらいかかりますか？",
        "入金を確認し、購入したメールにプランを有効化して請求書をメールで送ります。通常は数分です。10 分経っても届かない場合は注文番号を添えてサポートへご連絡ください。",
      ],
      [
        "1 アカウントで何台まで使えますか？",
        "1 アカウントにつき最大 {maxDevices} 台の有効端末です。新しい端末に移す場合は、先に古い端末をログアウトしてください。",
      ],
      [
        "プランは自動更新されますか？",
        "いいえ。銀行 QR 決済は買い切りで、プランの日数分だけ利用できます。期限前にリマインダーメールをお送りします。",
      ],
      [
        "返金とサポートは？",
        "注文番号と購入時のメールを {supportEmail} までお送りください。返金は利用規約に沿って対応します — 自動的な返金をお約束するものではありません。",
      ],
      [
        "アプリのインストール方法は？",
        "iOS：その端末の Safari で /install/ios を開き、端末（UDID）を登録すると署名済みビルドを用意できます。Android：購入ページで APK をダウンロードし、提供元不明のアプリを許可します。macOS：.dmg をダウンロード。Windows：インストーラを実行（トンネル作成に管理者権限が必要です）。",
      ],
      [
        "ウェブ購入は iOS と Android の両方で使えますか？",
        "はい。プランはアカウントのメールに紐づくため、同じメールでログインすれば対応するすべての端末で使えます。",
      ],
      [
        "機種変更で買い直しが必要ですか？",
        "いいえ。新しい端末で同じメールにログインしてください。すでに {maxDevices} 台が有効な場合は、先に 1 台を解除してください。",
      ],
    ],
    reviewsTitle: "お客様の声",
    reviewsSub: "お客様から直接いただいたレビューです。",
    reviewsStars: "5 点中 {stars} 点",
    promoTitle: "もう一つご案内",
    promoBody: "VPNFlow は接続のプライバシーを、MeetFlow AI は議事録を担当します。どちらも支払い後すぐにメールで有効化されます。",
    promoVpn: "VPNFlow を購入",
    promoAi: "MeetFlow AI を試す",
    promoClose: "閉じる",
    promoNever: "今後表示しない",
    footerProducts: "製品",
    footerHelp: "サポートと規約",
    footerBuy: "VPNFlow を購入",
    footerAiBuy: "MeetFlow AI を購入",
    footerGuide: "有効化ガイド",
    footerInstallIos: "iPhone / iPad にインストール",
    footerSupport: "サポート",
    footerPrivacy: "プライバシーポリシー",
    footerTerms: "利用規約",
    footerContact: "お困りですか？メール",
    footerRights: "© {year} FlowTech. All rights reserved.",
  },

  ko: {
    htmlLang: "ko",
    pageTitle: "FlowTech — VPNFlow와 MeetFlow AI",
    metaDescription:
      "FlowTech는 연결, 교육, 일상 업무를 돕는 작은 도구에 AI를 담는 생태계를 만들고 있습니다. 제품: VPNFlow, MeetFlow AI, FlowTech Harness, fBuddy, SuperMom AI.",
    brandTagline: "AI Ecosystem",
    navAria: "주요 메뉴",
    navProducts: "제품",
    navPricing: "요금",
    navFaq: "자주 묻는 질문",
    navBuy: "지금 구매",
    langAria: "언어 선택",
    heroKicker: "FlowTech 생태계",
    heroTitle: "연결, 학습, 일상을 위한 AI 생태계",
    heroSub:
      "우리의 사명은 AI를 네트워크, 교육, 그리고 하루를 채우는 작은 도구들에 담는 것입니다. 각자가 더 적은 마찰로 더 많은 일을 해내도록. 두 사람이 함께 하나씩 만들어 갑니다: VPNFlow, MeetFlow AI, FlowTech Harness, fBuddy, SuperMom AI.",
    ctaVpn: "VPNFlow 구매",
    ctaAi: "MeetFlow AI 사용",
    trustAria: "실제로 제공하는 것",
    trust: [
      "은행 QR 결제(VietQR) — 스캔하면 금액이 채워지고 이체 메모에 주문번호가 들어갑니다",
      "청구서와 활성화 확인은 이메일로 발송",
      "iOS(IPA)·Android(APK)·macOS(.dmg)·Windows(원클릭 설치 파일) 지원",
      "계정 1개당 최대 {maxDevices}대 동시 사용, 언제든 기기 변경 가능",
      "공개 페이지 5개 언어: 베트남어·영어·중국어·일본어·한국어",
    ],
    productsTitle: "제품",
    productsSub: "같은 생태계의 다섯 부분 — 필요한 것만 구매하세요.",
    p1Name: "VPNFlow",
    p1Tag: "프라이빗 VPN",
    p1Desc: "WireGuard 기반 VPN이며, 요금제는 계정 이메일에 연결됩니다.",
    p1Bullets: [
      "이메일 일회용 코드로 로그인 — 비밀번호를 기억할 필요 없음",
      "iOS(IPA)·Android(APK)·macOS(.dmg)·Windows에 설치 가능",
      "1회 구매 요금제로 자동 갱신 없음, 만료 전에 알림 메일 발송",
    ],
    p1Cta: "VPNFlow 구매",
    p2Name: "MeetFlow AI",
    p2Tag: "AI 도우미",
    p2Desc: "통화와 녹음에 대한 AI 번역과 회의록.",
    p2Bullets: [
      "결제 후 Pro가 열립니다 — 앱이 구매에 사용한 이메일을 확인합니다",
      "Android(APK)와 iOS 버전 제공",
      "30일 이용권·월간·연간 요금제, 웹에서 1회 구매",
    ],
    p2Cta: "MeetFlow AI 사용",
    p3Name: "FlowTech Harness",
    p3Tag: "에이전트 도구 모음",
    p3Desc: "자체 패키징한 agent harness: 내 컴퓨터에서 실행하고 외부에서 접속합니다.",
    p3Bullets: [
      "macOS는 명령 한 줄로 설치, 같은 패키지에 Windows 설치 파일 포함",
      "선택형 VPS 구성: 컴퓨터 앞에 HTTPS 도메인과 로그인 게이트",
      "소스와 설치 스크립트는 프로젝트 저장소에 있습니다",
    ],
    p3Cta: "설치 안내",
    p4Name: "fBuddy",
    p4Tag: "AI 채팅 앱",
    p4Desc: "친근한 AI 어시스턴트 앱. 질문, 작성, 번역, 요약을 웹과 휴대폰에서.",
    p4Bullets: [
      "음성 대화 지원, 베트남어·영어·중국어·일본어·한국어",
      "번역, 작성, 회의 요약을 한 앱에서",
      "브라우저에서 바로 사용——iOS·Android 앱으로도 설치 가능",
    ],
    p4Cta: "fBuddy 열기",
    p5Name: "SuperMom AI",
    p5Tag: "AI 학습 도우미",
    p5Desc: "베트남 학부모를 위한 AI 학습 도우미(1~9학년). 수학 문제를 찍으면 아이뿐 아니라 학부모가 이해할 수 있도록 단계별 풀이를 제공합니다.",
    p5Bullets: [
      "수학 문제를 찍으면 단계별 풀이, 아이가 푼 답안의 오류 확인까지",
      "영어 문제 풀이, 매일 챌린지, 알림이 있는 학습 메모, AI 채팅",
      "App Store에서 iPhone·iPad용으로 제공——학부모를 위한 베트남어 UI",
    ],
    p5Cta: "App Store에서 다운로드",
    dlAria: "앱 다운로드",
    platforms: {
      ios: "iOS (IPA)",
      android: "Android (APK)",
      androidLegacy: "Android 7.x (APK)",
      mac: "macOS",
      windows: "Windows 10/11",
      appStore: "App Store",
      appStoreMac: "App Store (macOS)",
      windowsOverlay: "Windows(오버레이)",
    },
    pricingTitle: "요금",
    pricingSub: "가격은 VND 기준입니다. 결제 시 은행 QR·MoMo·WeChat Pay·Alipay 중에서 선택하세요.",
    pricingOneTime: "모든 요금제는 1회 구매입니다 — 자동 갱신되지 않습니다.",
    pricingLifetime: "평생(만료 없음)",
    pricingDays: "{days}일",
    planCta: "이 요금제 선택",
    faqTitle: "자주 묻는 질문",
    faq: [
      [
        "은행 QR로 어떻게 결제하나요?",
        "구매 페이지에서 계정 이메일을 입력하고 요금제를 고른 뒤 은행 앱으로 QR을 스캔하세요. 금액이 미리 채워져 있고 이체 메모에 주문번호가 들어 있습니다 — 정확한 금액을, 메모는 그대로 두고 이체하세요.",
      ],
      [
        "활성화까지 얼마나 걸리나요?",
        "입금을 확인해 구매한 이메일에 요금제를 활성화하고 청구서를 메일로 보냅니다. 보통 몇 분입니다. 10분이 지나도 없으면 주문번호와 함께 지원팀에 메일 주세요.",
      ],
      [
        "계정 하나로 몇 대까지 쓸 수 있나요?",
        "계정당 최대 {maxDevices}대까지 동시 사용할 수 있습니다. 새 기기로 옮기려면 이전 기기를 먼저 로그아웃하세요.",
      ],
      [
        "요금제가 자동 갱신되나요?",
        "아니요. 은행 QR 결제는 1회 구매이며 요금제 일수만큼 사용합니다. 만료 전에 알림 메일을 보내드립니다.",
      ],
      [
        "환불과 지원은 어떻게 되나요?",
        "주문번호와 구매에 사용한 이메일을 {supportEmail}로 보내주세요. 환불은 이용약관에 따라 처리하며, 자동 환불을 약속하지는 않습니다.",
      ],
      [
        "앱은 어떻게 설치하나요?",
        "iOS: 해당 기기의 Safari에서 /install/ios를 열고 기기(UDID)를 등록하면 서명된 빌드를 받을 수 있습니다. Android: 구매 페이지에서 APK를 받고 알 수 없는 출처 설치를 허용하세요. macOS: .dmg 다운로드. Windows: 설치 파일 실행(터널 생성에 관리자 권한 필요).",
      ],
      [
        "웹 구매가 iOS와 Android 모두에서 되나요?",
        "됩니다. 요금제는 계정 이메일에 연결되므로 같은 이메일로 로그인하면 지원되는 모든 기기에서 사용할 수 있습니다.",
      ],
      [
        "기기를 바꾸면 다시 사야 하나요?",
        "아니요. 새 기기에서 같은 이메일로 로그인하세요. 이미 {maxDevices}대가 활성 상태라면 이전 기기를 하나 해제하세요.",
      ],
    ],
    reviewsTitle: "고객 후기",
    reviewsSub: "고객이 직접 보내주신 후기입니다.",
    reviewsStars: "5점 만점에 {stars}점",
    promoTitle: "한 가지 더",
    promoBody: "VPNFlow는 안전한 연결을, MeetFlow AI는 회의록을 담당합니다. 둘 다 결제 후 이메일로 바로 활성화됩니다.",
    promoVpn: "VPNFlow 구매",
    promoAi: "MeetFlow AI 사용해 보기",
    promoClose: "닫기",
    promoNever: "다시 표시하지 않기",
    footerProducts: "제품",
    footerHelp: "지원 및 약관",
    footerBuy: "VPNFlow 구매",
    footerAiBuy: "MeetFlow AI 구매",
    footerGuide: "활성화 안내",
    footerInstallIos: "iPhone / iPad에 설치",
    footerSupport: "지원",
    footerPrivacy: "개인정보 처리방침",
    footerTerms: "이용약관",
    footerContact: "도움이 필요하신가요? 이메일",
    footerRights: "© {year} FlowTech. All rights reserved.",
  },
};

/**
 * Tên gói đã bản địa hoá theo id (giống planNames của trang /buy), để bảng giá ở trang chủ
 * đọc cùng một tên với trang mua. Gói admin tự thêm chưa có tên ở đây thì dùng badge/label.
 */
const PLAN_NAMES = {
  vi: { monthly: "Hàng tháng", quarterly: "3 tháng", semiannual: "6 tháng", yearly: "Hàng năm", lifetime: "Trọn đời", pass30: "MeetFlow Pro 30 ngày" },
  en: { monthly: "Monthly", quarterly: "3 Months", semiannual: "6 Months", yearly: "Yearly", lifetime: "Lifetime", pass30: "MeetFlow Pro 30-Day Pass" },
  zh: { monthly: "月度", quarterly: "3 个月", semiannual: "6 个月", yearly: "年度", lifetime: "终身", pass30: "MeetFlow Pro 30 天通行证" },
  ja: { monthly: "月額", quarterly: "3 か月", semiannual: "6 か月", yearly: "年額", lifetime: "永久", pass30: "MeetFlow Pro 30 日パス" },
  ko: { monthly: "월간", quarterly: "3개월", semiannual: "6개월", yearly: "연간", lifetime: "평생", pass30: "MeetFlow Pro 30일 이용권" },
};

/** Chuỗi đầu tiên không rỗng trong danh sách (badge ngắn trước, rồi name, rồi label). */
function firstText(...values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Chuẩn hoá MỘT gói thành dữ liệu hiển thị được. Nhận cả dạng row của PlanStore
 * ({ id, amount, days, label, badge, retired }) lẫn dạng ngắn ({ id, name, price, currency }).
 * Trả về null khi gói đã ngừng bán hoặc không còn gì để hiện — thà thiếu một hàng còn hơn
 * hiện một hàng trống/giá rác.
 */
function normalizePlan(raw, lang) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.retired === true) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = firstText(PLAN_NAMES[lang]?.[id], raw.badge, raw.name, raw.label, id);
  const amountSource = raw.amount ?? raw.price;
  const amountNumber = Number(amountSource);
  const hasNumericPrice = Number.isFinite(amountNumber) && amountNumber > 0;
  const priceText = hasNumericPrice
    ? money(amountNumber, raw.currency, lang)
    : (typeof amountSource === "string" ? amountSource.trim() : "");
  if (!name && !priceText) return null;
  const days = positiveInt(raw.days);
  return {
    id,
    name,
    priceText,
    days,
    lifetime: days === null && raw.days !== undefined,
    product: raw.product === "ai" ? "ai" : "vpn",
  };
}

/**
 * Khối đánh giá khách — CHỈ render khi người gọi truyền `reviews` thật.
 *
 * Lý do (cố ý, không phải thiếu sót): trang bán hàng không được bịa đánh giá. Repo này chưa
 * có nguồn đánh giá nào (không có API review, không có file dữ liệu review), nên mặc định
 * `reviews` là mảng rỗng ⇒ khối này biến mất hoàn toàn. Muốn hiện, phải truyền dữ liệu thật
 * đã có sự đồng ý của khách: [{ name, text, stars }].
 */
function reviewsHTML({ t, reviews }) {
  const list = (Array.isArray(reviews) ? reviews : [])
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const text = firstText(r.text, r.comment, r.body);
      if (!text) return null;
      const raw = Math.round(Number(r.stars));
      const stars = Number.isFinite(raw) ? Math.min(5, Math.max(1, raw)) : 0;
      return { name: firstText(r.name, r.author), text, stars };
    })
    .filter(Boolean);
  if (list.length === 0) return "";
  const cards = list
    .map((r) => {
      const glyphs = r.stars > 0 ? "★".repeat(r.stars) + "☆".repeat(5 - r.stars) : "";
      const label = r.stars > 0 ? fill(t.reviewsStars, { stars: r.stars }) : "";
      return `<li class="review">
          ${glyphs ? `<div class="stars" role="img" aria-label="${esc(label)}">${glyphs}</div>` : ""}
          <p class="review-text">${esc(r.text)}</p>
          ${r.name ? `<div class="review-name">${esc(r.name)}</div>` : ""}
        </li>`;
    })
    .join("\n        ");
  return `<section class="section" id="reviews" aria-labelledby="reviewsTitle">
      <h2 id="reviewsTitle">${t.reviewsTitle}</h2>
      <p class="sub">${t.reviewsSub}</p>
      <ul class="reviews">
        ${cards}
      </ul>
    </section>`;
}

/**
 * Danh sách link tải app (chỉ hiện nền tảng nào server thực sự truyền vào).
 * `map` cho phép mỗi sản phẩm dùng nhãn riêng: VPNFlow phát iOS dạng IPA, còn
 * MeetFlow AI chỉ có trên App Store nên nhãn phải khác.
 */
const VPN_DOWNLOAD_MAP = [
  ["ios", "ios"],
  ["android", "android"],
  ["androidLegacy", "androidLegacy"],
  ["mac", "mac"],
  ["windows", "windows"],
];

function downloadLinksHTML({ t, downloads, map = VPN_DOWNLOAD_MAP }) {
  const items = map
    .map(([key, labelKey]) => {
      const href = safeHref(downloads?.[key]);
      if (!href) return "";
      return `<a class="chip" href="${esc(href)}" rel="noopener">${esc(t.platforms[labelKey])}</a>`;
    })
    .filter(Boolean);
  if (items.length === 0) return "";
  return `<div class="chips" aria-label="${esc(t.dlAria)}">${items.join("")}</div>`;
}

/** Một thẻ sản phẩm (tên, nhãn, mô tả, gạch đầu dòng, nút hành động). */
/**
 * Thẻ sản phẩm — dựng theo đúng card .fg-prod của popup quảng cáo hệ sinh thái
 * (fbuddy.meetflowai.site): logo app trong ô bo góc + tên + nhãn gradient + mô tả
 * + nút hành động. Mỗi app một logo riêng, phục vụ từ /assets/ cùng origin.
 */
function productCard({ name, tag, desc, bullets, cta, href, logo = "", extra = "" }) {
  const list = (Array.isArray(bullets) ? bullets : []).filter((b) => typeof b === "string" && b.trim());
  const link = safeHref(href);
  const icon = safeHref(logo);
  return `<li class="card prod">
        <div class="prod-top">
          ${icon ? `<img class="prod-logo" src="${esc(icon)}" alt="" width="54" height="54" loading="lazy" decoding="async">` : ""}
          <div class="prod-id">
            <h3>${esc(name)}</h3>
            <span class="tag">${esc(tag)}</span>
          </div>
        </div>
        <p class="card-desc">${esc(desc)}</p>
        <ul class="bullets">
          ${list.map((b) => `<li>${esc(b)}</li>`).join("\n          ")}
        </ul>
        ${extra}
        ${link ? `<a class="btn btn-primary" href="${esc(link)}">${esc(cta)}</a>` : ""}
      </li>`;
}

/** Link ngôn ngữ: cùng pattern `?lang=` như trang /buy (giữ được khi mở trang ở mọi host). */
function langPickerHTML({ lang, t }) {
  const items = LANG_CODES.map((code) => {
    const current = code === lang;
    return `<a class="lang${current ? " on" : ""}" href="?lang=${code}" hreflang="${code}"${current ? ' aria-current="true"' : ""}>${esc(LANG_NAMES[code])}</a>`;
  }).join("\n          ");
  return `<details class="langmenu" id="langMenu">
        <summary aria-label="${esc(t.langAria)}" title="${esc(t.langAria)}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.6a15.6 15.6 0 0 0-1.3-3.4A8 8 0 0 1 18.9 8zM12 4.2c.7 1 1.3 2.3 1.7 3.8h-3.4C10.7 6.5 11.3 5.2 12 4.2zM4.3 14A8 8 0 0 1 4 12c0-.7.1-1.4.3-2h3a19 19 0 0 0 0 4h-3zm.8 2h2.6c.3 1.2.8 2.4 1.3 3.4A8 8 0 0 1 5.1 16zm2.6-8H5.1a8 8 0 0 1 3.9-3.4C8.5 5.6 8 6.8 7.7 8zM12 19.8c-.7-1-1.3-2.3-1.7-3.8h3.4c-.4 1.5-1 2.8-1.7 3.8zM14.1 14H9.9a17 17 0 0 1 0-4h4.2a17 17 0 0 1 0 4zm1 5.4c.5-1 1-2.2 1.3-3.4h2.6a8 8 0 0 1-3.9 3.4zm1.6-5.4a19 19 0 0 0 0-4h3c.2.6.3 1.3.3 2s-.1 1.4-.3 2h-3z"/></svg>
          <span class="langcur">${esc(LANG_NAMES[lang])}</span>
        </summary>
        <nav class="langlist">
          ${items}
        </nav>
      </details>`;
}

/**
 * Logo FlowTech thật, phục vụ từ /assets/flowtech-mark.png (cùng origin nên trang
 * vẫn hiện đủ khi mạng hạn chế; route /assets/:file đã có sẵn cho trang chủ + popup).
 * width/height đặt trước để không nhảy layout khi ảnh về.
 */
const LOGO_IMG = `<img class="mark" src="/assets/flowtech-mark.png" width="34" height="34" alt="" decoding="async">`;

/**
 * Trang chủ FlowTech.
 *
 * @param {object}   [opts]
 * @param {string}   [opts.lang]           mã ngôn ngữ (en/vi/zh/ja/ko), mặc định vi
 * @param {object[]} [opts.plans]          gói đang bán (row của PlanStore: id/amount/days/label/badge/retired/…)
 * @param {string}   [opts.buyUrl]         link mua VPNFlow
 * @param {string}   [opts.aiBuyUrl]       link mua MeetFlow AI
 * @param {object}   [opts.downloads]      link tải app: { ios, android, androidLegacy, mac, windows }
 * @param {object}   [opts.user]           tài khoản đang đăng nhập (chỉ dùng để chào tên, có thể null)
 * @param {object[]} [opts.reviews]        đánh giá THẬT [{ name, text, stars }] — rỗng thì ẩn khối
 * @param {string}   [opts.supportEmail]   email hỗ trợ in ở FAQ + footer
 * @param {string}   [opts.canonicalUrl]   có thì mới render <link rel="canonical">
 * @param {number}   [opts.maxDevices]     giới hạn thiết bị/tài khoản (index.js truyền MAX_DEVICES_PER_USER)
 * @param {object}   [opts.links]          ghi đè link phụ: { guide, installIos, support, privacy, terms, harness }
 */
export function homePageHTML({
  lang = "vi",
  plans = [],
  buyUrl = "/buy",
  aiBuyUrl = "/ai/buy",
  downloads = {},
  user = null,
  reviews = [],
  supportEmail = "support@meetflowai.site",
  canonicalUrl = "",
  maxDevices = Number(process.env.MAX_DEVICES_PER_USER || 3),
  links = {},
} = {}) {
  const code = pickHomeLang(lang);
  const t = TEXTS[code];
  const deviceCap = positiveInt(maxDevices) ?? 3;
  const safeSupportEmail = firstText(supportEmail) || "support@meetflowai.site";
  const mailto = safeHref(`mailto:${safeSupportEmail}`);

  const urlBuy = safeHref(buyUrl) || "/buy";
  const urlAiBuy = safeHref(aiBuyUrl) || "/ai/buy";
  const urlGuide = safeHref(links?.guide) || "/guide";
  const urlInstallIos = safeHref(links?.installIos) || "/install/ios";
  const urlSupport = safeHref(links?.support) || "/support";
  const urlPrivacy = safeHref(links?.privacy) || "/privacy";
  const urlTerms = safeHref(links?.terms) || "/terms";
  const urlHarness = safeHref(links?.harness) || urlSupport;
  const urlFbuddy = safeHref(links?.fbuddy) || "https://fbuddy.meetflowai.site/";
  // SuperMom AI hiện chỉ phát hành trên App Store (bundle com.minhnb2.SuperMom).
  const urlSupermom = safeHref(links?.supermom) || "https://apps.apple.com/app/id6768231353";

  // Logo từng app (thư mục /assets của control plane, phục vụ cùng origin).
  const productLogos = {
    vpnflow: "/assets/vpnflow-logo.png",
    meetflow: "/assets/meetflow-logo.png",
    harness: "/assets/flowtech-icon.png",
    fbuddy: "/assets/fbuddy-logo.png",
    supermom: "/assets/supermom-logo.png",
  };

  // Chỗ trống trong câu dịch: giá trị đã escape trước khi nhét vào.
  const slots = { maxDevices: esc(deviceCap), supportEmail: esc(safeSupportEmail) };
  const canonical = safeHref(canonicalUrl);

  const year = new Date().getFullYear();
  const greeting = user && typeof user === "object" && firstText(user.email)
    ? `<span class="who" title="${esc(user.email)}">👤 ${esc(user.email)}</span>`
    : "";

  const trustItems = (Array.isArray(t.trust) ? t.trust : [])
    .map((item) => `<li>${fill(item, slots)}</li>`)
    .join("\n        ");

  const faqItems = (Array.isArray(t.faq) ? t.faq : [])
    .map(([q, a]) => `
        <details class="faq-item">
          <summary>${fill(q, slots)}</summary>
          <p>${fill(a, slots)}</p>
        </details>`)
    .join("");

  const reviewsBlock = reviewsHTML({ t, reviews });
  const downloadsBlock = downloadLinksHTML({ t, downloads });

  // MeetFlow AI: iOS + macOS cùng nằm trên App Store (khách tải qua store, KHÔNG phát IPA);
  // Windows là bản overlay desktop mình tự phát hành; Android là APK.
  const aiDownloads = {
    ios: "https://apps.apple.com/app/id6765590042",
    mac: "https://apps.apple.com/app/id6765590042",
    windows: "https://meetflowai.site/dl/MeetFlowAI-Overlay-latest-win-x64.zip",
    android: "https://api.meetflowai.site/v1/ai/downloads/android",
  };
  const aiDownloadsBlock = downloadLinksHTML({
    t,
    downloads: aiDownloads,
    map: [
      ["ios", "appStore"],
      ["mac", "appStoreMac"],
      ["windows", "windowsOverlay"],
      ["android", "android"],
    ],
  });

  // Popup chỉ là quảng cáo chéo: nội dung chính KHÔNG nằm trong popup (không ảnh hưởng SEO),
  // hiện sau ~1.5s, đóng được bằng Esc, và có nút "không hiện lại" nhớ bằng localStorage.
  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="/assets/flowtech-icon.png" type="image/png">
  <link rel="apple-touch-icon" href="/assets/flowtech-mark.png">
  <meta name="theme-color" content="#071628">
  <title>${t.pageTitle}</title>
  <meta name="description" content="${esc(t.metaDescription)}">
  <meta name="robots" content="index,follow">
  ${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="FlowTech">
  <meta property="og:title" content="${esc(t.pageTitle)}">
  <meta property="og:description" content="${esc(t.metaDescription)}">
  ${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ""}
  <meta name="twitter:card" content="summary">
  <style>
    /* ======================================================================
       FLOWTECH SIGNATURE THEME
       Đồng bộ trang này với popup hệ sinh thái (web/public/promo.css) và app
       FlowGpt (web/src/styles.css) để cả hệ sinh thái nhìn như một sản phẩm.
       Hợp đồng thiết kế: docs/THEME.md trong repo flowgpt.
       Ba dấu hiệu nhận biết:
         1. nền navy radial-gradient có chiều sâu + 2 quầng sáng mint/cyan
         2. card có viền gradient 1px (mask) + hào quang khi hover
         3. nút chính gradient 33c773 -> 22d3ee kèm hào quang
       ====================================================================== */
    :root {
      color-scheme: dark;
      --accent: #33c773;
      --accent-2: #22d3ee;
      --accent-3: #7c3aed;
      --accent-mint: #7fe6c0;
      --ink: #05202a;
      --line: rgba(255, 255, 255, 0.1);
      --sig-gradient: linear-gradient(135deg, #33c773, #22d3ee);
      --sig-ring: linear-gradient(135deg, #33c773, #22d3ee 46%, #7c3aed);
      --sig-surface: radial-gradient(130% 120% at 0% 0%, #14406c 0%, #0a1f3b 55%, #071628 100%);
      --sig-card-bg: linear-gradient(150deg, rgba(51, 199, 115, 0.1), rgba(34, 211, 238, 0.035) 45%, transparent 72%),
        linear-gradient(#0d1b30, #0d1b30);
      --sig-radius: 22px;
      --sig-radius-inner: 16px;
      --sig-ease: cubic-bezier(0.22, 1, 0.36, 1);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      min-height: 100vh;
      font-family: -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #eaf2ff;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      /* Nền có chiều sâu: 2 quầng sáng thương hiệu đè lên navy radial của popup. */
      background:
        radial-gradient(900px 520px at 6% -10%, rgba(51, 199, 115, 0.2), transparent 70%),
        radial-gradient(780px 500px at 98% 2%, rgba(34, 211, 238, 0.15), transparent 70%),
        var(--sig-surface);
      background-attachment: fixed;
    }
    a { color: #7fd3ff; }
    h1, h2, h3 { line-height: 1.25; }
    .wrap { width: 100%; max-width: 1060px; margin: 0 auto; padding: 0 20px; }

    .hdr {
      position: sticky; top: 0; z-index: 50;
      background: rgba(7, 22, 40, 0.72);
      -webkit-backdrop-filter: blur(16px) saturate(1.2);
      backdrop-filter: blur(16px) saturate(1.2);
      border-bottom: 1px solid rgba(127, 230, 192, 0.14);
    }
    .hdr-in { display: flex; align-items: center; gap: 14px; padding: 12px 20px; max-width: 1060px; margin: 0 auto; }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #fff; }
    .brand .mark { border-radius: 10px; display: block; filter: drop-shadow(0 6px 14px rgba(34, 211, 238, 0.28)); }
    .brand-text { display: flex; flex-direction: column; }
    .brand-name { font-weight: 800; font-size: 18px; letter-spacing: 0.2px; }
    .brand-tag { font-size: 11.5px; color: rgba(234, 242, 255, 0.55); }
    .hdr-nav { margin-left: auto; display: flex; align-items: center; gap: 14px; }
    .hdr-nav a.navlink { color: rgba(234, 242, 255, 0.72); text-decoration: none; font-size: 13.5px; transition: color 0.16s ease; }
    .hdr-nav a.navlink:hover { color: #fff; }
    .who { font-size: 12.5px; color: rgba(234, 242, 255, 0.6); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .langmenu { position: relative; }
    .langmenu > summary {
      list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 10px; border-radius: 999px; font-size: 12.5px; color: rgba(234, 242, 255, 0.78);
      background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line);
      transition: border-color 0.16s ease, color 0.16s ease;
    }
    .langmenu > summary::-webkit-details-marker { display: none; }
    .langmenu[open] > summary, .langmenu > summary:hover { color: #fff; border-color: rgba(127, 230, 192, 0.45); }
    .langlist {
      position: absolute; right: 0; top: calc(100% + 8px); min-width: 168px; padding: 6px;
      background: linear-gradient(#0d1b30, #0d1b30); border: 1px solid rgba(127, 230, 192, 0.18);
      border-radius: 14px; box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.85); display: grid; gap: 2px;
      animation: sig-rise 0.28s var(--sig-ease) backwards;
    }
    .langlist a { padding: 8px 10px; border-radius: 9px; font-size: 13px; text-decoration: none; color: rgba(234, 242, 255, 0.78); }
    .langlist a:hover { background: rgba(255, 255, 255, 0.07); color: #fff; }
    .langlist a.on { color: var(--ink); background: var(--sig-gradient); font-weight: 700; }

    /* --- nút: bản chính dùng gradient thương hiệu + hào quang ---------------- */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 11px 20px; border-radius: 12px; font-size: 14px; font-weight: 700;
      text-decoration: none; border: 1px solid transparent; cursor: pointer; background: none; font-family: inherit;
      transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease;
    }
    .btn-primary { background: var(--sig-gradient); color: var(--ink); box-shadow: 0 10px 24px -12px rgba(34, 211, 238, 0.7); }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 14px 30px -12px rgba(51, 199, 115, 0.8); }
    .btn-primary:active { transform: translateY(0); }
    .btn-ghost { border-color: rgba(255, 255, 255, 0.14); color: rgba(234, 242, 255, 0.86); background: rgba(255, 255, 255, 0.06); }
    .btn-ghost:hover { border-color: rgba(51, 199, 115, 0.55); color: #fff; background: rgba(255, 255, 255, 0.1); }

    .hero { padding: 60px 0 34px; }
    .kicker {
      display: inline-block; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700;
      color: var(--accent-mint);
      border: 1px solid rgba(127, 230, 192, 0.28);
      background: linear-gradient(135deg, rgba(51, 199, 115, 0.16), rgba(34, 211, 238, 0.08));
      padding: 5px 12px; border-radius: 999px; margin-bottom: 16px;
    }
    .hero h1 { font-size: clamp(28px, 4.4vw, 42px); font-weight: 800; letter-spacing: -0.02em; max-width: 820px; }
    .hero .lede { margin-top: 14px; color: rgba(234, 242, 255, 0.7); font-size: 16px; max-width: 700px; }
    .cta-row { margin-top: 26px; display: flex; flex-wrap: wrap; gap: 12px; }
    .trust { list-style: none; margin-top: 34px; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
    .trust li {
      padding: 13px 15px 13px 36px; position: relative; font-size: 13px; color: rgba(234, 242, 255, 0.82);
      border: 1px solid transparent; border-radius: var(--sig-radius-inner);
    }
    .trust li::before { content: "✓"; position: absolute; left: 13px; top: 13px; color: var(--accent-mint); font-weight: 800; z-index: 1; }

    .section { padding: 40px 0; border-top: 1px solid rgba(127, 230, 192, 0.13); }
    .section h2 { font-size: 24px; font-weight: 800; letter-spacing: -0.01em; }
    .section .sub { margin-top: 8px; color: rgba(234, 242, 255, 0.64); font-size: 14px; max-width: 720px; }
    .section .note { margin-top: 14px; font-size: 12.5px; color: rgba(234, 242, 255, 0.55); }

    /* --- card: nền navy + viền gradient 1px + hào quang khi hover ----------- */
    .cards { list-style: none; margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
    .card {
      display: flex; flex-direction: column; gap: 10px; padding: 20px;
      border: 1px solid transparent; border-radius: var(--sig-radius);
    }
    .card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .card-head h3 { font-size: 18px; font-weight: 800; }
    .tag {
      font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      color: var(--ink); background: var(--sig-gradient); border: 1px solid transparent;
      padding: 3px 9px; border-radius: 999px;
    }
    .card-desc { color: rgba(234, 242, 255, 0.72); font-size: 13.5px; }
    .bullets { list-style: none; display: grid; gap: 7px; margin: 4px 0 6px; }
    .bullets li { position: relative; padding-left: 16px; font-size: 13px; color: rgba(234, 242, 255, 0.78); }
    .bullets li::before { content: "•"; position: absolute; left: 4px; color: var(--accent-mint); }
    .card .btn { margin-top: auto; text-align: center; }
    /* Ô logo app — cùng tỉ lệ với .fg-prod__icon của popup quảng cáo. */
    .prod-top { display: flex; align-items: center; gap: 12px; }
    .prod-logo {
      width: 54px; height: 54px; flex: none; border-radius: 14px; object-fit: cover;
      background: linear-gradient(135deg, rgba(51, 199, 115, 0.35), rgba(34, 211, 238, 0.28));
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
    }
    .prod-id { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; min-width: 0; }
    .prod-id h3 { font-size: 17px; font-weight: 700; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
    .chip {
      font-size: 11.5px; text-decoration: none; color: rgba(234, 242, 255, 0.8);
      background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px;
      transition: border-color 0.16s ease, color 0.16s ease;
    }
    .chip:hover { border-color: rgba(51, 199, 115, 0.55); color: #fff; }

    .plans { list-style: none; margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
    .plan {
      padding: 18px; display: flex; flex-direction: column; gap: 6px;
      border: 1px solid transparent; border-radius: var(--sig-radius);
    }
    .plan-name { font-weight: 700; font-size: 15px; }
    .plan-price { font-size: 26px; font-weight: 800; color: var(--accent-mint); letter-spacing: -0.01em; }
    .plan-period { font-size: 12.5px; color: rgba(234, 242, 255, 0.55); }
    .plan-cta { margin-top: 10px; text-align: center; }

    .faq { margin-top: 18px; display: grid; gap: 10px; }
    .faq-item { padding: 13px 15px; border: 1px solid transparent; border-radius: var(--sig-radius-inner); }
    .faq-item summary { cursor: pointer; font-size: 14px; font-weight: 600; }
    .faq-item summary:hover { color: var(--accent-mint); }
    .faq-item p { margin-top: 8px; font-size: 13px; color: rgba(234, 242, 255, 0.74); }

    .reviews { list-style: none; margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    .review { padding: 16px; border: 1px solid transparent; border-radius: var(--sig-radius-inner); }
    .stars { color: #ffd166; letter-spacing: 2px; font-size: 14px; }
    .review-text { margin-top: 8px; font-size: 13.5px; color: rgba(234, 242, 255, 0.82); }
    .review-name { margin-top: 8px; font-size: 12.5px; color: rgba(234, 242, 255, 0.55); }

    /* Viền gradient 1px cho mọi khối nổi (mask 2 lớp, không cần thêm phần tử).
       .trust li dùng ::after vì ::before đã là dấu ✓. */
    .card, .plan, .review, .faq-item, .trust li, .promo-box {
      position: relative;
      background-image: var(--sig-card-bg);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.05) inset, 0 18px 40px -30px rgba(0, 0, 0, 0.9);
      animation: sig-rise 0.36s var(--sig-ease) backwards;
      transition: transform 0.22s ease, box-shadow 0.22s ease;
    }
    .card::before, .plan::before, .review::before, .faq-item::before, .promo-box::before,
    .trust li::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      padding: 1px;
      background: var(--sig-ring);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      mask-composite: exclude;
      opacity: 0.72;
      pointer-events: none;
    }
    .card:hover, .plan:hover, .review:hover, .trust li:hover {
      transform: translateY(-2px);
      box-shadow: 0 22px 50px -28px rgba(34, 211, 238, 0.55);
    }

    .footer { padding: 30px 0 44px; border-top: 1px solid rgba(127, 230, 192, 0.13); margin-top: 30px; }
    .footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 20px; }
    .footer h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent-mint); margin-bottom: 10px; font-weight: 700; }
    .footer ul { list-style: none; display: grid; gap: 7px; }
    .footer a { color: rgba(234, 242, 255, 0.74); text-decoration: none; font-size: 13px; }
    .footer a:hover { color: var(--accent-mint); text-decoration: underline; }
    .footer .contact { font-size: 13px; color: rgba(234, 242, 255, 0.64); }
    .footer .rights {
      margin-top: 22px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px; color: rgba(234, 242, 255, 0.44);
    }

    /* --- popup: đúng bản signature của popup hệ sinh thái ------------------- */
    .promo {
      position: fixed; inset: 0; z-index: 90; display: flex;
      align-items: center; justify-content: center; padding: 18px;
      overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
      background: rgba(3, 10, 20, 0.62);
      -webkit-backdrop-filter: blur(8px) saturate(1.15);
      backdrop-filter: blur(8px) saturate(1.15);
      animation: sig-fade 0.28s ease-out both;
    }
    .promo[hidden] { display: none; }
    .promo-box {
      width: 100%; max-width: 440px; margin: auto 0; padding: 24px;
      border: 1px solid transparent; border-radius: var(--sig-radius);
      background-image: var(--sig-surface);
      box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
      animation: sig-rise 0.36s var(--sig-ease) backwards;
    }
    .promo-box h2 { font-size: clamp(19px, 3.3vw, 24px); font-weight: 700; letter-spacing: -0.01em; }
    .promo-box p { margin-top: 10px; font-size: 13.5px; color: rgba(234, 242, 255, 0.74); }
    .promo-ctas { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 10px; }
    .promo-actions { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .promo-x {
      position: absolute; top: 12px; right: 12px; width: 38px; height: 38px; display: grid; place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 999px; background: rgba(255, 255, 255, 0.1);
      color: #dce8fb; cursor: pointer; font-size: 20px; line-height: 1; font-family: inherit; z-index: 1;
      transition: transform 0.22s ease, background 0.22s ease, color 0.22s ease;
    }
    .promo-x:hover { background: rgba(255, 255, 255, 0.16); color: #fff; transform: rotate(90deg); }
    .promo-never {
      border: 1px solid var(--line); background: rgba(255, 255, 255, 0.05); color: rgba(234, 242, 255, 0.74);
      border-radius: 11px; padding: 8px 12px; font-size: 12.5px; cursor: pointer; font-family: inherit;
      transition: color 0.16s ease, border-color 0.16s ease;
    }
    .promo-never:hover { color: #fff; border-color: rgba(255, 255, 255, 0.3); }

    @keyframes sig-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes sig-rise {
      from { opacity: 0; transform: translateY(16px) scale(0.97); }
      to { opacity: 1; transform: none; }
    }

    @media (max-width: 760px) {
      .hdr-in { flex-wrap: wrap; gap: 10px; }
      .hdr-nav { width: 100%; margin-left: 0; justify-content: space-between; }
      .hdr-nav a.navlink { display: none; }
      .hero { padding: 36px 0 24px; }
      .hero h1 { font-size: 27px; }
      .hero .lede { font-size: 15px; }
      .cards, .plans, .reviews, .trust, .footer-grid { grid-template-columns: 1fr; }
      .cta-row .btn, .promo-ctas .btn { flex: 1 1 100%; text-align: center; }
      .promo { padding: 0; align-items: flex-end; }
      .promo-box { max-width: none; width: 100%; border-radius: var(--sig-radius) var(--sig-radius) 0 0; }
      .langlist { right: auto; left: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .promo, .promo-box, .promo-x, .btn, .chip, .faq-item, .card, .plan, .review, .trust li, .langlist {
        transition: none !important; animation: none !important;
      }
      .card:hover, .plan:hover, .review:hover, .trust li:hover { transform: none; }
    }
  </style>
</head>
<body>
  <header class="hdr">
    <div class="hdr-in">
      <a class="brand" href="./">
        ${LOGO_IMG}
        <span class="brand-text">
          <span class="brand-name">FlowTech</span>
          <span class="brand-tag">${esc(t.brandTagline)}</span>
        </span>
      </a>
      <div class="hdr-nav" role="navigation" aria-label="${esc(t.navAria)}">
        <a class="navlink" href="#products">${t.navProducts}</a>
        <a class="navlink" href="#faq">${t.navFaq}</a>
        ${greeting}
        ${langPickerHTML({ lang: code, t })}
        <a class="btn btn-primary" href="${esc(urlBuy)}">${t.navBuy}</a>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section class="hero" aria-labelledby="heroTitle">
      <span class="kicker">${t.heroKicker}</span>
      <h1 id="heroTitle">${t.heroTitle}</h1>
      <p class="lede">${t.heroSub}</p>
      <div class="cta-row">
        <a class="btn btn-primary" href="${esc(urlBuy)}">${t.ctaVpn}</a>
        <a class="btn btn-ghost" href="${esc(urlAiBuy)}">${t.ctaAi}</a>
      </div>
      <ul class="trust" aria-label="${esc(t.trustAria)}">
        ${trustItems}
      </ul>
    </section>

    <section class="section" id="products" aria-labelledby="productsTitle">
      <h2 id="productsTitle">${t.productsTitle}</h2>
      <p class="sub">${t.productsSub}</p>
      <ul class="cards">
        ${productCard({
          name: t.p1Name, tag: t.p1Tag, desc: t.p1Desc, bullets: t.p1Bullets, cta: t.p1Cta,
          href: urlBuy, logo: productLogos.vpnflow, extra: downloadsBlock,
        })}
        ${productCard({
          name: t.p2Name, tag: t.p2Tag, desc: t.p2Desc, bullets: t.p2Bullets, cta: t.p2Cta,
          href: urlAiBuy, logo: productLogos.meetflow, extra: aiDownloadsBlock,
        })}
        ${productCard({
          name: t.p3Name, tag: t.p3Tag, desc: t.p3Desc, bullets: t.p3Bullets, cta: t.p3Cta,
          href: urlHarness, logo: productLogos.harness,
        })}
        ${productCard({
          name: t.p4Name, tag: t.p4Tag, desc: t.p4Desc, bullets: t.p4Bullets, cta: t.p4Cta,
          href: urlFbuddy, logo: productLogos.fbuddy,
        })}
        ${productCard({
          name: t.p5Name, tag: t.p5Tag, desc: t.p5Desc, bullets: t.p5Bullets, cta: t.p5Cta,
          href: urlSupermom, logo: productLogos.supermom,
        })}
      </ul>
    </section>


    <section class="section" id="faq" aria-labelledby="faqTitle">
      <h2 id="faqTitle">${t.faqTitle}</h2>
      <div class="faq">
        ${faqItems}
      </div>
    </section>

    ${reviewsBlock}
  </main>

  <footer class="footer">
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <h4>${t.footerProducts}</h4>
          <ul>
            <li><a href="${esc(urlBuy)}">${t.footerBuy}</a></li>
            <li><a href="${esc(urlAiBuy)}">${t.footerAiBuy}</a></li>
            <li><a href="${esc(urlGuide)}">${t.footerGuide}</a></li>
            <li><a href="${esc(urlInstallIos)}">${t.footerInstallIos}</a></li>
          </ul>
        </div>
        <div>
          <h4>${t.footerHelp}</h4>
          <ul>
            <li><a href="${esc(urlSupport)}">${t.footerSupport}</a></li>
            <li><a href="${esc(urlPrivacy)}">${t.footerPrivacy}</a></li>
            <li><a href="${esc(urlTerms)}">${t.footerTerms}</a></li>
          </ul>
        </div>
        <div>
          <h4>${esc(safeSupportEmail)}</h4>
          <p class="contact">${t.footerContact} <a href="${esc(mailto)}">${esc(safeSupportEmail)}</a></p>
        </div>
      </div>
      <p class="rights">${fill(t.footerRights, { year })}</p>
    </div>
  </footer>

  <div class="promo" id="promo" role="dialog" aria-modal="true" aria-labelledby="promoTitle" hidden>
    <div class="promo-box">
      <button type="button" class="promo-x" id="promoClose" aria-label="${esc(t.promoClose)}">&times;</button>
      <h2 id="promoTitle">${t.promoTitle}</h2>
      <p>${t.promoBody}</p>
      <div class="promo-ctas">
        <a class="btn btn-primary" href="${esc(urlBuy)}">${t.promoVpn}</a>
        <a class="btn btn-ghost" href="${esc(urlAiBuy)}">${t.promoAi}</a>
      </div>
      <div class="promo-actions">
        <button type="button" class="promo-never" id="promoNever">${t.promoNever}</button>
      </div>
    </div>
  </div>

  <script>
    (function () {
      // Menu ngôn ngữ: <details> đã dùng được bằng bàn phím; chỉ thêm đóng khi bấm ra ngoài / Esc.
      var langMenu = document.getElementById("langMenu");
      if (langMenu) {
        document.addEventListener("click", function (e) {
          if (!langMenu.contains(e.target)) langMenu.removeAttribute("open");
        });
        langMenu.addEventListener("keydown", function (e) {
          if (e.key === "Escape") {
            langMenu.removeAttribute("open");
            var s = langMenu.querySelector("summary");
            if (s && s.focus) s.focus();
          }
        });
      }

      // Popup quảng cáo chéo: hiện sau ~1.5s, 1 lần mỗi phiên, và tôn trọng lựa chọn
      // "không hiện lại" (localStorage). Nội dung chính của trang KHÔNG nằm trong popup.
      var PROMO_NEVER_KEY = "flowtech_promo_never";
      var PROMO_SESSION_KEY = "flowtech_promo_seen";
      var popup = document.getElementById("promo");
      if (!popup) return;

      function readFlag(store, key) {
        try { return store.getItem(key) === "1"; } catch (e) { return true; }
      }
      function writeFlag(store, key) {
        try { store.setItem(key, "1"); } catch (e) { /* chế độ riêng tư: bỏ qua */ }
      }

      var lastFocus = null;
      function closePopup(remember) {
        if (popup.hidden) return;
        popup.hidden = true;
        if (remember === "never") writeFlag(window.localStorage, PROMO_NEVER_KEY);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }
      function openPopup() {
        lastFocus = document.activeElement;
        popup.hidden = false;
        var b = document.getElementById("promoClose");
        if (b && b.focus) b.focus();
      }

      var btnClose = document.getElementById("promoClose");
      if (btnClose) btnClose.addEventListener("click", function () { closePopup(); });
      var btnNever = document.getElementById("promoNever");
      if (btnNever) btnNever.addEventListener("click", function () { closePopup("never"); });
      popup.addEventListener("click", function (e) { if (e.target === popup) closePopup(); });
      document.addEventListener("keydown", function (e) {
        if (!popup.hidden && (e.key === "Escape" || e.key === "Esc")) closePopup();
      });

      if (!readFlag(window.localStorage, PROMO_NEVER_KEY) && !readFlag(window.sessionStorage, PROMO_SESSION_KEY)) {
        window.setTimeout(function () {
          if (!popup.hidden) return;
          writeFlag(window.sessionStorage, PROMO_SESSION_KEY);
          openPopup();
        }, 1500);
      }
    })();
  </script>
</body>
</html>`;
}
