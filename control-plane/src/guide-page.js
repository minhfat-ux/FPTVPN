/**
 * Activation guide page — "bought on the web, now activate in the app".
 *
 * Served at /guide (VPNFlow) and /ai/guide (MeetFlow AI), localized in the
 * same 5 languages as the buy pages. Linked from the buy pages and from the
 * invoice email so a customer always has the next step.
 */

const PICK = (v) => (["en", "vi", "zh", "ja", "ko"].includes(v) ? v : "vi");

const SHARED = {
  en: {
    htmlLang: "en",
    needHelp: "Still stuck? Email",
    backToBuy: "← Back to the buy page",
    orderTip: "Tip: keep your order code — it is in the payment screen and in the invoice email.",
    faqTitle: "Frequently asked",
  },
  vi: {
    htmlLang: "vi",
    needHelp: "Vẫn chưa được? Gửi email tới",
    backToBuy: "← Quay lại trang mua",
    orderTip: "Mẹo: giữ lại mã đơn — mã hiện trên màn hình thanh toán và trong email hoá đơn.",
    faqTitle: "Câu hỏi thường gặp",
  },
  zh: {
    htmlLang: "zh-Hans",
    needHelp: "仍有问题？请发邮件至",
    backToBuy: "← 返回购买页面",
    orderTip: "提示：请保留订单号 — 它在支付页面和发票邮件中都有。",
    faqTitle: "常见问题",
  },
  ja: {
    htmlLang: "ja",
    needHelp: "解決しない場合はこちらへ",
    backToBuy: "← 購入ページに戻る",
    orderTip: "ヒント：注文番号を控えてください — 支払い画面と請求メールに記載されています。",
    faqTitle: "よくある質問",
  },
  ko: {
    htmlLang: "ko",
    needHelp: "해결되지 않나요? 이메일",
    backToBuy: "← 구매 페이지로 돌아가기",
    orderTip: "팁: 주문번호를 보관하세요 — 결제 화면과 인보이스 이메일에 있습니다.",
    faqTitle: "자주 묻는 질문",
  },
};

const GUIDES = {
  ai: {
    vi: {
      title: "Mua trên web → Kích hoạt trong app",
      sub: "Hướng dẫn dành cho MeetFlow AI Pro mua bằng QR / WeChat / Alipay trên trang buy.",
      steps: [
        ["Mua trên trang web", "Chọn gói → chọn cách thanh toán → quét QR và chuyển đúng số tiền (số tiền đã điền sẵn với QR ngân hàng và MoMo). Giữ lại email bạn đã nhập."],
        ["Chờ xác nhận thanh toán", "Hệ thống kiểm tra tiền về rồi kích hoạt Pro cho email đó và gửi hoá đơn vào email của bạn. Thường trong vài phút, tối đa 10 phút."],
        ["Cài app lên máy", "iOS: tải trên App Store. Android: tải file APK ở trang buy rồi cho phép “Cài từ nguồn không xác định” để cài."],
        ["Kích hoạt Pro trong app (Android)", "Mở app → màn hình nâng cấp → mục “Đã mua trên web?” → nhập ĐÚNG email đã mua → bấm “Kích hoạt Pro”. App sẽ tự kiểm tra và mở khoá Pro."],
        ["Kiểm tra kết quả", "Pro hiện trong app ngay sau khi kích hoạt. Không thấy Pro? Kiểm tra lại email đã nhập, chờ thêm vài phút rồi bấm lại, hoặc liên hệ hỗ trợ kèm mã đơn."],
      ],
      faq: [
        ["Tôi đã chuyển tiền nhưng app chưa có Pro?", "Kiểm tra bạn nhập trong app ĐÚNG email đã dùng khi mua. Nếu đúng, chờ tối đa 10 phút (hệ thống đối soát tiền về) rồi bấm “Kích hoạt Pro” lại."],
        ["Mua trên web dùng được trên iOS không?", "Bản iOS mua gói trực tiếp trong app qua Apple. Gói mua trên web áp dụng cho tài khoản Android (theo email)."],
        ["Gói 30 ngày có tự gia hạn không?", "Không. Gói 30 ngày là mua một lần, dùng 30 ngày. Muốn dùng tiếp thì mua lại trên trang web."],
        ["Mua xong dùng được trên mấy thiết bị?", "Pro gắn với email bạn đã mua — dùng cùng email đó là được."],
      ],
    },
    en: {
      title: "Buy on the web → activate in the app",
      sub: "Guide for MeetFlow AI Pro bought with QR / WeChat / Alipay on the buy page.",
      steps: [
        ["Buy on the web page", "Pick a plan → pick a payment method → scan the QR and transfer the exact amount (the amount is pre-filled for bank QR and MoMo). Keep the email you entered."],
        ["Wait for payment confirmation", "We check the incoming transfer, activate Pro for that email and email you the invoice. Usually a few minutes, at most 10."],
        ["Install the app", "iOS: download it on the App Store. Android: download the APK from the buy page and allow installs from unknown sources."],
        ["Activate Pro in the app (Android)", "Open the app → upgrade screen → “Bought on the web?” → enter the SAME email you bought with → tap “Activate Pro”. The app verifies it and unlocks Pro."],
        ["Check the result", "Pro appears right after activating. Not seeing it? Re-check the email, wait a few minutes and try again, or contact support with your order code."],
      ],
      faq: [
        ["I paid but the app still shows no Pro.", "Make sure the email you enter in the app is exactly the one used at checkout. Then wait up to 10 minutes for the transfer to be matched and tap “Activate Pro” again."],
        ["Does a web purchase work on iOS?", "The iOS app sells through Apple in-app purchase. Web purchases apply to the Android account (by email)."],
        ["Does the 30-day plan renew automatically?", "No. It is a one-time purchase for 30 days. Buy again on the web page to continue."],
        ["How many devices can I use?", "Pro is tied to the email you bought with — use that same email."],
      ],
    },
    zh: {
      title: "网页购买 → 在应用中激活",
      sub: "适用于在购买页使用 QR / 微信 / 支付宝购买的 MeetFlow AI Pro。",
      steps: [
        ["在网页购买", "选择套餐 → 选择支付方式 → 扫描二维码并转账准确金额（银行二维码和 MoMo 已自动填好金额）。请记住您填写的邮箱。"],
        ["等待支付确认", "我们核对到账后为该邮箱激活 Pro，并把发票发送到您的邮箱。通常几分钟，最多 10 分钟。"],
        ["安装应用", "iOS：在 App Store 下载。Android：在购买页下载 APK，并允许“未知来源”安装。"],
        ["在应用中激活 Pro（Android）", "打开应用 → 升级页面 → “已在网页购买？” → 输入购买时使用的同一邮箱 → 点击“激活 Pro”。应用会自动校验并解锁。"],
        ["确认结果", "激活后 Pro 会立即显示。若未显示，请确认邮箱是否一致，等待几分钟后重试，或携带订单号联系支持。"],
      ],
      faq: [
        ["已付款但应用仍未显示 Pro。", "请确认应用中输入的邮箱与购买时完全一致。随后等待最多 10 分钟以便系统核对到账，再次点击“激活 Pro”。"],
        ["网页购买能在 iOS 上使用吗？", "iOS 版通过 Apple 应用内购买。网页购买适用于 Android 账户（按邮箱）。"],
        ["30 天套餐会自动续费吗？", "不会。30 天套餐为一次性购买，用完 30 天后需在网页重新购买。"],
        ["可以同时在几台设备使用？", "Pro 绑定购买时使用的邮箱，用同一个邮箱登录即可。"],
      ],
    },
    ja: {
      title: "ウェブで購入 → アプリで有効化",
      sub: "購入ページで QR / WeChat / Alipay で購入した MeetFlow AI Pro のご案内です。",
      steps: [
        ["ウェブページで購入", "プランを選択 → 支払い方法を選択 → QR をスキャンして正確な金額を送金（銀行 QR と MoMo は金額が自動入力されます）。入力したメールを控えてください。"],
        ["入金確認を待つ", "入金を確認後、そのメールに Pro を有効化し、請求書をメールでお送りします。通常数分、最大 10 分です。"],
        ["アプリをインストール", "iOS：App Store から。Android：購入ページの APK をダウンロードし、提供元不明のアプリを許可してインストール。"],
        ["アプリで Pro を有効化（Android）", "アプリを開く → アップグレード画面 → 「ウェブで購入済み？」 → 購入時と同じメールを入力 → 「Pro を有効化」をタップ。"],
        ["結果を確認", "有効化後すぐに Pro が表示されます。表示されない場合はメールを再確認し、数分後に再試行するか、注文番号を添えてサポートへご連絡ください。"],
      ],
      faq: [
        ["支払ったのにアプリで Pro になりません。", "アプリに入力するメールが購入時と完全に同じかご確認ください。その後最大 10 分お待ちいただき、再度「Pro を有効化」をタップしてください。"],
        ["ウェブ購入は iOS でも使えますか？", "iOS 版は Apple のアプリ内課金で販売しています。ウェブ購入は Android アカウント（メール単位）に適用されます。"],
        ["30日パスは自動更新されますか？", "いいえ。買い切りの 30 日間です。続ける場合はウェブで再度ご購入ください。"],
        ["何台の端末で使えますか？", "Pro は購入したメールに紐づきます。同じメールでご利用ください。"],
      ],
    },
    ko: {
      title: "웹에서 구매 → 앱에서 활성화",
      sub: "구매 페이지에서 QR / WeChat / Alipay로 구매한 MeetFlow AI Pro 안내입니다.",
      steps: [
        ["웹 페이지에서 구매", "요금제 선택 → 결제 수단 선택 → QR을 스캔해 정확한 금액을 송금하세요(은행 QR과 MoMo는 금액이 자동 입력됩니다). 입력한 이메일을 기억해 두세요."],
        ["결제 확인 대기", "입금을 확인한 뒤 해당 이메일로 Pro를 활성화하고 인보이스를 이메일로 보내드립니다. 보통 몇 분, 최대 10분입니다."],
        ["앱 설치", "iOS: App Store에서 받으세요. Android: 구매 페이지의 APK를 내려받아 알 수 없는 출처 설치를 허용하세요."],
        ["앱에서 Pro 활성화(Android)", "앱 열기 → 업그레이드 화면 → \"웹에서 구매하셨나요?\" → 구매에 사용한 동일한 이메일 입력 → \"Pro 활성화\" 탭."],
        ["결과 확인", "활성화하면 바로 Pro가 표시됩니다. 보이지 않으면 이메일을 다시 확인하고 몇 분 후 다시 시도하거나, 주문번호와 함께 지원팀에 문의하세요."],
      ],
      faq: [
        ["결제했는데 앱에 Pro가 없습니다.", "앱에 입력한 이메일이 결제 시 사용한 이메일과 정확히 같은지 확인하세요. 이후 최대 10분 기다렸다가 \"Pro 활성화\"를 다시 눌러 주세요."],
        ["웹 구매가 iOS에서도 되나요?", "iOS 앱은 Apple 인앱 결제로 판매합니다. 웹 구매는 Android 계정(이메일 기준)에 적용됩니다."],
        ["30일 이용권은 자동 갱신되나요?", "아니요. 1회 구매로 30일 사용입니다. 계속하려면 웹에서 다시 구매하세요."],
        ["기기를 몇 대까지 사용할 수 있나요?", "Pro는 구매한 이메일에 연결됩니다. 같은 이메일로 사용하세요."],
      ],
    },
  },
  vpn: {
    vi: {
      title: "Mua trên web → Kích hoạt trong app",
      sub: "Hướng dẫn cho VPNFlow Premium mua bằng QR trên trang buy.",
      steps: [
        ["Mua trên trang web", "Chọn gói → chọn cách thanh toán → quét QR và chuyển đúng số tiền (QR ngân hàng và MoMo đã điền sẵn số tiền). Giữ lại email bạn đã nhập."],
        ["Chờ xác nhận thanh toán", "Hệ thống đối soát tiền về, kích hoạt Premium cho email đó và gửi hoá đơn. Thường trong vài phút."],
        ["Cài app", "iOS: tải trên App Store. Android: tải file APK ở trang buy và cho phép “Cài từ nguồn không xác định”."],
        ["Đăng nhập bằng email đã mua", "Mở app → nhập ĐÚNG email đã mua → bấm “Gửi mã” → nhập mã OTP trong email → Premium tự bật, không cần làm gì thêm."],
        ["Kiểm tra kết quả", "Vương miện vàng hiện cạnh logo là Premium đã hoạt động. Không thấy? Kiểm tra lại email đã đăng nhập hoặc liên hệ hỗ trợ kèm mã đơn."],
      ],
      faq: [
        ["Đã trả tiền nhưng app vẫn báo cần Premium?", "Kiểm tra bạn đăng nhập bằng ĐÚNG email đã mua. Nếu đúng, chờ vài phút cho hệ thống đối soát rồi mở lại app."],
        ["Mua trên web dùng được cho cả iOS và Android?", "Được. Premium gắn với tài khoản email nên đăng nhập cùng email là dùng được trên mọi thiết bị."],
        ["Gói mua trên web có tự gia hạn?", "Không. Thanh toán QR là mua một lần; khi gần hết hạn bạn sẽ nhận email nhắc gia hạn."],
        ["Đổi thiết bị có phải mua lại?", "Không. Chỉ cần đăng nhập cùng email trên thiết bị mới."],
      ],
    },
    en: {
      title: "Buy on the web → activate in the app",
      sub: "Guide for VPNFlow Premium bought with QR on the buy page.",
      steps: [
        ["Buy on the web page", "Pick a plan → pick a payment method → scan the QR and transfer (bank QR and MoMo already carry the amount). Keep the email you entered."],
        ["Wait for payment confirmation", "We match the transfer, activate Premium for that email and email the invoice. Usually a few minutes."],
        ["Install the app", "iOS: download from the App Store. Android: download the APK on the buy page and allow installs from unknown sources."],
        ["Sign in with the email you bought with", "Open the app → enter that SAME email → tap “Send code” → enter the OTP from your inbox. Premium switches on by itself."],
        ["Check the result", "A gold crown next to the logo means Premium is active. Not seeing it? Re-check the signed-in email or contact support with your order code."],
      ],
      faq: [
        ["I paid but the app still asks for Premium.", "Make sure you signed in with the exact email you bought with. Then wait a few minutes for the transfer to be matched and reopen the app."],
        ["Does a web purchase work on both iOS and Android?", "Yes. Premium is tied to the email account, so signing in with the same email works on any device."],
        ["Does a web purchase renew automatically?", "No. QR payment is a one-time purchase; you will get a reminder email before it expires."],
        ["Do I have to pay again on a new device?", "No. Just sign in with the same email on the new device."],
      ],
    },
  },
};

/** Renders the activation guide page. */
export function guidePageHTML({ lang = "vi", product = "vpn", buyUrl = "", supportEmail = "support@meetflowai.site" }) {
  const code = PICK(lang);
  const shared = SHARED[code];
  const guide = (GUIDES[product === "ai" ? "ai" : "vpn"][code]) || GUIDES.vpn.vi;
  const steps = guide.steps.map(([t, d], i) => `
      <li class="step">
        <div class="num">${i + 1}</div>
        <div class="body"><div class="st">${t}</div><div class="sd">${d}</div></div>
      </li>`).join("");
  const faq = guide.faq.map(([q, a]) => `
      <details><summary>${q}</summary><p>${a}</p></details>`).join("");

  return `<!doctype html>
<html lang="${shared.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${guide.title}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; font-family: -apple-system, "Segoe UI", sans-serif;
      color: #fff; background: linear-gradient(180deg, #051525, #0a1f3a);
      padding: 24px 16px 40px;
    }
    .wrap { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
    .sub { color: rgba(255,255,255,.62); font-size: 14px; line-height: 1.55; margin-bottom: 22px; }
    ol { list-style: none; }
    .step { display: flex; gap: 12px; padding: 14px; margin-bottom: 10px; border-radius: 12px;
            background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); }
    .num { flex: 0 0 26px; width: 26px; height: 26px; border-radius: 50%; background: #33c773;
           color: #06160d; font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; }
    .st { font-weight: 700; font-size: 14px; margin-bottom: 3px; }
    .sd { color: rgba(255,255,255,.7); font-size: 13px; line-height: 1.55; }
    .tip { margin: 16px 0; padding: 12px; border-radius: 10px; font-size: 12.5px; line-height: 1.5;
           background: rgba(255,180,0,.08); border: 1px solid rgba(255,180,0,.25); color: rgba(255,255,255,.75); }
    h2 { font-size: 16px; margin: 26px 0 10px; }
    details { border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
              padding: 12px 14px; margin-bottom: 8px; }
    summary { cursor: pointer; font-size: 13.5px; font-weight: 600; }
    details p { margin-top: 8px; color: rgba(255,255,255,.7); font-size: 13px; line-height: 1.6; }
    .actions { margin-top: 26px; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
    .actions a { color: #33c773; text-decoration: none; font-size: 14px; font-weight: 600; }
    .actions a:hover { text-decoration: underline; }
    .help { margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.1);
            color: rgba(255,255,255,.55); font-size: 12.5px; }
    .help a { color: #33c773; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${guide.title}</h1>
    <div class="sub">${guide.sub}</div>
    <ol>${steps}</ol>
    <div class="tip">💡 ${shared.orderTip}</div>
    <h2>${shared.faqTitle}</h2>
    ${faq}
    <div class="actions">
      ${buyUrl ? `<a href="${buyUrl}">${shared.backToBuy}</a>` : ""}
    </div>
    <div class="help">${shared.needHelp} <a href="mailto:${supportEmail}">${supportEmail}</a></div>
  </div>
</body>
</html>`;
}
