/**
 * Support / help page — linked from the buy pages and from the apps themselves.
 *
 * Localized in the same 5 languages as the buy and guide pages. Every purchase
 * now goes through the web channel (bank QR / transfer) — there is no app-store
 * channel any more (owner decision 14/09/2026), so the FAQ answers must only
 * describe the web channel: one-time payment, no auto-renewal, refunds by email.
 */

const PICK = (v) => (["en", "vi", "zh", "ja", "ko"].includes(v) ? v : "vi");

const T = {
  vi: {
    htmlLang: "vi",
    title: "Hỗ trợ",
    sub: "Trung tâm hỗ trợ cho ứng dụng và dịch vụ VPN của chúng tôi.",
    contactTitle: "Liên hệ",
    contactBody: "Gửi email tới địa chỉ dưới đây, chúng tôi trả lời trong vòng 24 giờ (thứ 2 – thứ 7).",
    includeTitle: "Khi gửi hỗ trợ, ghi rõ:",
    include: [
      "Email bạn dùng để đăng nhập / mua gói",
      "Mã đơn hàng (nếu đã thanh toán)",
      "Thiết bị và phiên bản hệ điều hành (ví dụ iPhone 15, iOS 18.2)",
      "Mô tả ngắn lỗi và ảnh chụp màn hình nếu có",
    ],
    faqTitle: "Câu hỏi thường gặp",
    faq: [
      ["Tôi không nhận được mã đăng nhập.", "Kiểm tra cả hộp thư rác/quảng cáo. Bấm “Gửi lại mã” sau ít nhất 1 phút. Nếu vẫn không có, gửi email hỗ trợ kèm địa chỉ email đăng nhập để chúng tôi cấp mã trực tiếp."],
      ["Đã chuyển khoản nhưng app chưa lên Premium.", "Chuyển khoản ngân hàng thường được đối chiếu trong vài phút (tối đa 10 phút giờ làm việc). Hãy mở lại app hoặc đăng nhập lại. Nếu quá 30 phút, gửi email kèm mã đơn và ảnh chụp giao dịch."],
      ["VPN kết nối nhưng không vào được mạng.", "Thử đổi máy chủ khác trong danh sách, tắt/bật lại VPN, hoặc chuyển giữa Wi-Fi và 4G/5G. Một số mạng công cộng chặn VPN — thử máy chủ khác trước khi báo lỗi."],
      ["Gói của tôi có tự động gia hạn không?", "Không. Gói mua trên web là mua một lần (QR/chuyển khoản) và KHÔNG tự động gia hạn — hết hạn là dừng, không cần huỷ ở đâu. Muốn dừng trước hạn thì gửi email kèm email đăng nhập hoặc mã đơn."],
      ["Tôi muốn hoàn tiền.", "Gói mua trên web (QR/chuyển khoản): gửi email kèm mã đơn trong vòng 7 ngày kể từ lúc thanh toán."],
      ["Tôi đổi điện thoại, có phải mua lại?", "Không. Premium gắn với tài khoản email — chỉ cần đăng nhập cùng email trên thiết bị mới. Nếu Premium chưa hiện, vào Cài đặt → “Làm mới trạng thái gói”."],
      ["Làm sao xoá tài khoản của tôi?", "Trong app: Cài đặt → Xoá tài khoản. Toàn bộ dữ liệu tài khoản sẽ bị xoá; gói đang còn hiệu lực cũng chấm dứt."],
      ["Các bạn thu thập dữ liệu gì?", "Chỉ email đăng nhập, mã thiết bị và trạng thái gói để vận hành dịch vụ. Chúng tôi không ghi lại nội dung truy cập của bạn và không bán dữ liệu. Chi tiết ở Chính sách riêng tư."],
    ],
    linksTitle: "Liên kết",
    linkGuide: "Hướng dẫn kích hoạt",
    linkBuy: "Trang mua gói",
    linkPrivacy: "Chính sách riêng tư",
    linkTerms: "Điều khoản sử dụng",
  },
  en: {
    htmlLang: "en",
    title: "Support",
    sub: "Support centre for our VPN apps and service.",
    contactTitle: "Contact",
    contactBody: "Email us at the address below — we reply within 24 hours (Mon–Sat).",
    includeTitle: "Please include:",
    include: [
      "The email you sign in / bought with",
      "Your order code (if you already paid)",
      "Device and OS version (e.g. iPhone 15, iOS 18.2)",
      "A short description of the issue and a screenshot if you have one",
    ],
    faqTitle: "Frequently asked questions",
    faq: [
      ["I never received the login code.", "Check spam/junk as well. Tap “Resend code” after at least a minute. If it still does not arrive, email support with the login address and we will issue a code for you."],
      ["I paid but the app still is not Premium.", "Bank transfers are usually matched within a few minutes (up to 10 minutes in business hours). Reopen the app or sign in again. If it has been over 30 minutes, email us with the order code and a screenshot of the transfer."],
      ["The VPN connects but I have no internet.", "Try another server in the list, toggle the VPN off and on, and switch between Wi-Fi and mobile data. Some public networks block VPNs — test another server before reporting a fault."],
      ["Does my plan auto-renew?", "No. Web plans are one-time payments (QR / bank transfer) and never auto-renew — when the period ends the plan simply stops, so there is nothing to cancel. To end it early, email us with your login email or order code."],
      ["I would like a refund.", "Web purchases paid by QR / bank transfer: email us within 7 days of paying, with your order code."],
      ["I changed phones — do I pay again?", "No. Premium is tied to your email account, so just sign in with the same email. If Premium does not show up, open Settings → “Refresh Purchase Status”."],
      ["How do I delete my account?", "In the app: Settings → Delete Account. All account data is erased and any active plan ends."],
      ["What data do you collect?", "Only your login email, a device identifier and your subscription state, used to run the service. We do not log what you browse and we never sell data. See the Privacy Policy."],
    ],
    linksTitle: "Links",
    linkGuide: "Activation guide",
    linkBuy: "Buy page",
    linkPrivacy: "Privacy Policy",
    linkTerms: "Terms of Use",
  },
  zh: {
    htmlLang: "zh-Hans",
    title: "技术支持",
    sub: "我们的 VPN 应用与服务支持中心。",
    contactTitle: "联系我们",
    contactBody: "请发送邮件至下方地址，我们会在 24 小时内回复（周一至周六）。",
    includeTitle: "来信请注明：",
    include: [
      "您登录 / 购买时使用的邮箱",
      "订单号（如已付款）",
      "设备与系统版本（例如 iPhone 15、iOS 18.2）",
      "问题的简要说明，如有截图请一并附上",
    ],
    faqTitle: "常见问题",
    faq: [
      ["我没有收到登录验证码。", "请同时检查垃圾邮件箱。至少等待 1 分钟后点击“重新发送验证码”。若仍未收到，请用登录邮箱联系我们，我们会直接为您发放验证码。"],
      ["我已付款，但应用仍显示未开通。", "银行转账通常在几分钟内完成核对（工作时间最长 10 分钟）。请重新打开应用或重新登录。若超过 30 分钟，请附订单号与转账截图来信。"],
      ["VPN 已连接但无法上网。", "请尝试更换列表中的其他服务器、关闭再开启 VPN，或在 Wi-Fi 与移动数据之间切换。部分公共网络会屏蔽 VPN。"],
      ["我的套餐会自动续订吗？", "不会。网页购买的套餐是一次性付款（扫码／转账），不会自动续订——到期即自动结束，无需取消。如需提前结束，请附登录邮箱或订单号来信。"],
      ["我想退款。", "网页扫码／转账购买：请在付款后 7 天内附订单号来信。"],
      ["换了手机需要重新购买吗？", "不需要。会员与邮箱账号绑定，用同一邮箱登录即可。若未显示会员，请在 设置 →“刷新订阅状态”。"],
      ["如何删除我的账号？", "在应用内：设置 → 删除账号。账号数据将被清除，正在生效的套餐同时终止。"],
      ["你们收集哪些数据？", "仅收集登录邮箱、设备标识与订阅状态，用于提供服务。我们不记录您的访问内容，也不出售数据。详见隐私政策。"],
    ],
    linksTitle: "相关链接",
    linkGuide: "激活指南",
    linkBuy: "购买页面",
    linkPrivacy: "隐私政策",
    linkTerms: "使用条款",
  },
  ja: {
    htmlLang: "ja",
    title: "サポート",
    sub: "VPN アプリとサービスのサポートセンターです。",
    contactTitle: "お問い合わせ",
    contactBody: "下記アドレスまでメールでご連絡ください。24時間以内（月〜土）に返信します。",
    includeTitle: "お問い合わせの際は以下をご記載ください：",
    include: [
      "ログイン／購入に使用したメールアドレス",
      "注文番号（お支払い済みの場合）",
      "端末と OS のバージョン（例：iPhone 15、iOS 18.2）",
      "不具合の簡単な説明（スクリーンショットがあれば添付）",
    ],
    faqTitle: "よくある質問",
    faq: [
      ["ログインコードが届きません。", "迷惑メールフォルダもご確認ください。1分以上待ってから「コードを再送」を押してください。それでも届かない場合は、ログイン用メールアドレスを添えてご連絡いただければコードを発行します。"],
      ["支払ったのにプレミアムになりません。", "銀行振込の照合は通常数分（営業時間内で最大10分）です。アプリを再起動するか再ログインしてください。30分以上経過しても反映されない場合は、注文番号と振込のスクリーンショットを添えてご連絡ください。"],
      ["VPN は接続できるのに通信できません。", "一覧の別サーバーを試し、VPN をオフ／オンし、Wi-Fi とモバイルデータを切り替えてください。公共 Wi-Fi では VPN が遮断されることがあります。"],
      ["プランは自動更新されますか？", "いいえ。Web での購入は一度きりのお支払い（QR／振込）で、自動更新はありません。期間が終わればそのまま終了するため、解約の手続きは不要です。途中で終了したい場合は、ログイン用メールまたは注文番号を添えてご連絡ください。"],
      ["返金してほしい。", "Web の QR／振込での購入：お支払いから 7日以内に注文番号を添えてご連絡ください。"],
      ["機種変更したら再購入が必要ですか？", "いいえ。プレミアムはメールアカウントに紐づくため、同じメールでログインするだけです。表示されない場合は 設定 →「購入状態を更新」をお試しください。"],
      ["アカウントを削除するには？", "アプリ内：設定 → アカウントを削除。アカウントデータは消去され、有効なプランも終了します。"],
      ["どのようなデータを収集しますか？", "サービス提供のため、ログイン用メール、端末識別子、購読状態のみを収集します。閲覧内容の記録やデータの販売は行いません。詳細はプライバシーポリシーをご覧ください。"],
    ],
    linksTitle: "リンク",
    linkGuide: "有効化ガイド",
    linkBuy: "購入ページ",
    linkPrivacy: "プライバシーポリシー",
    linkTerms: "利用規約",
  },
  ko: {
    htmlLang: "ko",
    title: "지원",
    sub: "VPN 앱과 서비스 지원 센터입니다.",
    contactTitle: "문의",
    contactBody: "아래 주소로 이메일을 보내주세요. 24시간 이내(월~토)에 답변드립니다.",
    includeTitle: "문의 시 다음을 알려주세요:",
    include: [
      "로그인 / 구매에 사용한 이메일",
      "주문 번호(결제한 경우)",
      "기기와 OS 버전(예: iPhone 15, iOS 18.2)",
      "문제에 대한 간단한 설명과 스크린샷(있는 경우)",
    ],
    faqTitle: "자주 묻는 질문",
    faq: [
      ["로그인 코드가 오지 않습니다.", "스팸함도 확인해 주세요. 최소 1분 후 “코드 재전송”을 눌러주세요. 그래도 오지 않으면 로그인 이메일과 함께 문의해 주시면 코드를 발급해 드립니다."],
      ["결제했는데 앱이 아직 프리미엄이 아닙니다.", "계좌 이체는 보통 몇 분 내(업무 시간 기준 최대 10분) 확인됩니다. 앱을 다시 열거나 다시 로그인해 주세요. 30분이 지나도 반영되지 않으면 주문 번호와 이체 캡처를 보내주세요."],
      ["VPN은 연결되지만 인터넷이 안 됩니다.", "목록의 다른 서버로 바꿔보고, VPN을 껐다 켜고, Wi-Fi와 모바일 데이터를 전환해 보세요. 일부 공용 네트워크는 VPN을 차단합니다."],
      ["요금제가 자동 갱신되나요?", "아니요. 웹 구매는 일회성 결제(QR/계좌이체)이며 자동 갱신되지 않습니다. 기간이 끝나면 그대로 종료되므로 해지 절차가 필요 없습니다. 중간에 종료하려면 로그인 이메일 또는 주문 번호와 함께 문의해 주세요."],
      ["환불을 받고 싶습니다.", "웹 QR/계좌이체 구매: 결제 후 7일 이내에 주문 번호와 함께 문의해 주세요."],
      ["기기를 바꾸면 다시 결제해야 하나요?", "아니요. 프리미엄은 이메일 계정에 연결되어 있어 같은 이메일로 로그인하면 됩니다. 표시되지 않으면 설정 → “구매 상태 새로 고침”을 눌러주세요."],
      ["계정을 삭제하려면?", "앱에서: 설정 → 계정 삭제. 계정 데이터가 삭제되고 유효한 요금제도 종료됩니다."],
      ["어떤 데이터를 수집하나요?", "서비스 운영을 위해 로그인 이메일, 기기 식별자, 구독 상태만 수집합니다. 이용 기록을 저장하거나 데이터를 판매하지 않습니다. 자세한 내용은 개인정보 처리방침을 참고하세요."],
    ],
    linksTitle: "링크",
    linkGuide: "활성화 안내",
    linkBuy: "구매 페이지",
    linkPrivacy: "개인정보 처리방침",
    linkTerms: "이용약관",
  },
};

/** Renders the support page. */
export function supportPageHTML({ lang = "vi", product = "vpn", supportEmail = "support@meetflowai.site", links = {} }) {
  const code = PICK(lang);
  const t = T[code] || T.vi;
  const isAi = product === "ai";
  const appName = isAi ? "MeetFlow AI" : "VPNFlow";

  const includeList = t.include.map((line) => `<li>${line}</li>`).join("");
  const faq = t.faq.map(([q, a]) => `
      <details><summary>${q}</summary><p>${a}</p></details>`).join("");
  const linkRows = [
    links.guide ? `<a href="${links.guide}">${t.linkGuide}</a>` : "",
    links.buy ? `<a href="${links.buy}">${t.linkBuy}</a>` : "",
    links.privacy ? `<a href="${links.privacy}">${t.linkPrivacy}</a>` : "",
    links.terms ? `<a href="${links.terms}">${t.linkTerms}</a>` : "",
  ].filter(Boolean).join("");

  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${appName} — ${t.title}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; font-family: -apple-system, "Segoe UI", sans-serif; color: #fff;
           background: linear-gradient(180deg, #051525, #0a1f3a); padding: 24px 16px 40px; }
    .wrap { max-width: 640px; margin: 0 auto; }
    .brand { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #33c773; font-weight: 700; }
    h1 { font-size: 22px; font-weight: 800; margin: 6px 0 8px; }
    .sub { color: rgba(255,255,255,.62); font-size: 14px; line-height: 1.55; margin-bottom: 22px; }
    .card { padding: 16px; border-radius: 12px; background: rgba(51,199,115,.08);
            border: 1px solid rgba(51,199,115,.28); margin-bottom: 14px; }
    .card h2 { font-size: 15px; margin-bottom: 6px; }
    .card p { color: rgba(255,255,255,.74); font-size: 13.5px; line-height: 1.6; }
    .mail { display: inline-block; margin-top: 10px; font-size: 15px; font-weight: 700; color: #33c773; text-decoration: none; }
    .mail:hover { text-decoration: underline; }
    .inc { margin: 10px 0 0 18px; color: rgba(255,255,255,.72); font-size: 13px; line-height: 1.7; }
    h2.sect { font-size: 16px; margin: 26px 0 10px; }
    details { border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
              padding: 12px 14px; margin-bottom: 8px; }
    summary { cursor: pointer; font-size: 13.5px; font-weight: 600; }
    details p { margin-top: 8px; color: rgba(255,255,255,.7); font-size: 13px; line-height: 1.6; }
    .links { margin-top: 26px; display: flex; flex-wrap: wrap; gap: 16px; }
    .links a { color: #33c773; text-decoration: none; font-size: 14px; font-weight: 600; }
    .links a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">${appName}</div>
    <h1>${t.title}</h1>
    <div class="sub">${t.sub}</div>

    <div class="card">
      <h2>${t.contactTitle}</h2>
      <p>${t.contactBody}</p>
      <a class="mail" href="mailto:${supportEmail}">${supportEmail}</a>
      <p style="margin-top:14px;font-weight:600">${t.includeTitle}</p>
      <ul class="inc">${includeList}</ul>
    </div>

    <h2 class="sect">${t.faqTitle}</h2>
    ${faq}

    <div class="links">${linkRows}</div>
  </div>
</body>
</html>`;
}
