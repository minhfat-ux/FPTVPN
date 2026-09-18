/* ============================================================================
   fBuddy — popup quảng cáo ứng dụng (VPNFlow + MeetFlow AI)
   Trả lời "mọi người thấy link cài đặt": hiện 1 lần khi vào trang, có "Để sau"
   (1 ngày) và "Không hiện lại nữa".

   Vì sao vanilla JS: popup phải chạy cho cả khách CHƯA đăng nhập (trước khi React
   mount) và không phụ thuộc bước build của web/. Nạp bằng <script defer src="/promo.js">.
   ========================================================================== */

(function () {
  "use strict";

  var STORE_KEY = "fbuddy:promo:apps:v1";
  var SNOOZE_MS = 24 * 60 * 60 * 1000;
  var DELAY_MS = 1400;

  /*
   * Nhắc lại theo tình trạng credit: người CHƯA có credit bị nhắc lại sớm (mặc định
   * 5 phút) để họ thấy link mua gói; người ĐÃ có credit chỉ bị nhắc lại sau 1 ngày.
   * Giá trị đọc từ /api/meta nên đổi được trong Cài đặt mà không phải build lại.
   * Trước khi biết kết quả thì dùng mốc NGẮN (đúng ý đồ nhắc), tránh cửa sổ 24h oan.
   */
  var snoozeMs = 5 * 60 * 1000;
  var hasCredit = false;

  function readToken() {
    try {
      return localStorage.getItem("fbuddy.token");
    } catch (err) {
      return null;
    }
  }

  function resolveSnoozeMs() {
    var tasks = [];

    tasks.push(
      fetch("/api/meta", { credentials: "same-origin" })
        .then(function (response) {
          return response.ok ? response.json() : null;
        })
        .then(function (meta) {
          var promo = meta && meta.promo;
          if (!promo) return;
          var soon = Math.max(1, Number(promo.reminderMinutes) || 5) * 60 * 1000;
          var later = Math.max(1, Number(promo.creditSnoozeMinutes) || 1440) * 60 * 1000;
          snoozeMs = hasCredit ? later : soon;
          window.__fbuddyPromoSnooze = { soon: soon, later: later };
        })
        .catch(function () {
          /* offline: giữ mốc mặc định */
        }),
    );

    var token = readToken();
    if (token) {
      tasks.push(
        fetch("/api/credits", { headers: { Authorization: "Bearer " + token } })
          .then(function (response) {
            return response.ok ? response.json() : null;
          })
          .then(function (data) {
            var credits = data && data.credits;
            hasCredit = Boolean(credits && credits.enabled && credits.balance > 0);
            var bounds = window.__fbuddyPromoSnooze;
            if (bounds) snoozeMs = hasCredit ? bounds.later : bounds.soon;
          })
          .catch(function () {
            hasCredit = false;
          }),
      );
    }

    return Promise.all(tasks);
  }

  var BRAND_MARK = "/brand-mark.png?v=culi2";
  var ICON_VPNFLOW = "https://meetflowai.site/assets/flowvpn-logo.png";
  var ICON_MEETFLOW = "https://meetflowai.site/assets/meetflowai-icon.png";

  // Link đã kiểm chứng trả 200 (17/09/2026). Windows dùng bản "-latest" để không lỗi thời.
  var LINKS = {
    vpnflow: {
      buy: "https://meetflowai.site/buy",
      windows: "https://meetflowai.site/dl/VPNFlow-Setup-latest.exe",
      macos: "https://meetflowai.site/install/mac",
      ios: "https://meetflowai.site/install/ios",
      android: "https://meetflowai.site/v1/downloads/android",
    },
    meetflow: {
      buy: "https://meetflowai.site/ai/buy",
      guide: "https://meetflowai.site/ai/guide",
      ios: "https://apps.apple.com/vn/app/meetflow-ai/id6765590042",
      android: "https://api.meetflowai.site/v1/ai/downloads/android",
    },
  };

  var OS_LABEL = {
    windows: "Windows",
    macos: "macOS",
    ios: "iPhone / iPad",
    android: "Android",
  };

  /*
   * Ba thứ tiếng: vi / en / zh. Trước đây toàn bộ chữ hardcode tiếng Việt nên khách
   * nước ngoài (và khách Trung Quốc) đọc không hiểu.
   *
   * Quy tắc: MỌI chữ người dùng nhìn thấy phải đi qua `t()`. Không hardcode lại.
   * `ops/promo-i18n-check.mjs` canh việc này (đủ khoá, và các thứ tiếng phải KHÁC nhau).
   */
  var STRINGS = {
    vi: {
      closeAria: "Đóng quảng cáo",
      eyebrow: "Hệ sinh thái FlowTech",
      title: "Cài app dùng ngay trên mọi thiết bị",
      sub: "VPNFlow cho kết nối riêng tư, nhanh và ổn định — MeetFlow AI là trợ lý AI trong túi. Miễn phí tải về.",
      forYourDevice: "· bản cho máy bạn",
      downloadFor: "Tải cho {os}",
      vpnPitch:
        "Kết nối riêng tư tốc độ cao, không giới hạn dung lượng. Có bản cho Windows, macOS, iPhone/iPad và Android.",
      vpnBuy: "Xem gói & mua",
      aiIosLabel: "App Store (iOS)",
      aiAndroidLabel: "Tải APK (Android)",
      aiIosPrimary: "Tải trên App Store",
      aiAndroidPrimary: "Tải APK cho Android",
      aiPitch: "Trợ lý AI đa năng: hỏi đáp, viết, dịch, tóm tắt và tạo ảnh — dùng ngay trên điện thoại.",
      aiBuy: "Giới thiệu & mua",
      note: "Quảng cáo của FlowTech · bấm để tải, không thu phí tải về",
      later: "Để sau",
      never: "Không hiện lại nữa",
    },
    en: {
      closeAria: "Close this ad",
      eyebrow: "The FlowTech ecosystem",
      title: "Install our apps on any device",
      sub: "VPNFlow for a fast, stable private connection — MeetFlow AI is your AI assistant in your pocket. Free to download.",
      forYourDevice: "· for your device",
      downloadFor: "Download for {os}",
      vpnPitch:
        "High-speed private connection with unlimited data. Available for Windows, macOS, iPhone/iPad and Android.",
      vpnBuy: "See plans & buy",
      aiIosLabel: "App Store (iOS)",
      aiAndroidLabel: "Download APK (Android)",
      aiIosPrimary: "Get it on the App Store",
      aiAndroidPrimary: "Download APK for Android",
      aiPitch: "A multi-purpose AI assistant: ask, write, translate, summarise and create images — right on your phone.",
      aiBuy: "Learn more & buy",
      note: "An ad from FlowTech · tap to download, downloading is free",
      later: "Later",
      never: "Don't show again",
    },
    zh: {
      closeAria: "关闭广告",
      eyebrow: "FlowTech 生态系统",
      title: "在任何设备上安装我们的应用",
      sub: "VPNFlow 提供快速稳定的私人连接 —— MeetFlow AI 是你口袋里的 AI 助手。免费下载。",
      forYourDevice: "· 适合你的设备",
      downloadFor: "下载 {os} 版",
      vpnPitch: "高速私人连接，流量不限。支持 Windows、macOS、iPhone/iPad 和 Android。",
      vpnBuy: "查看套餐并购买",
      aiIosLabel: "App Store (iOS)",
      aiAndroidLabel: "下载 APK (Android)",
      aiIosPrimary: "在 App Store 下载",
      aiAndroidPrimary: "下载 Android 版 APK",
      aiPitch: "多功能 AI 助手：问答、写作、翻译、总结和生成图片 —— 手机上即可使用。",
      aiBuy: "了解详情并购买",
      note: "由 FlowTech 提供的广告 · 点击即可下载，下载免费",
      later: "稍后",
      never: "不再显示",
    },
  };

  /**
   * Chọn thứ tiếng. Thứ tự ưu tiên (cố ý, đừng đảo):
   *
   *   1. Múi giờ Việt Nam / Trung Quốc THẮNG ngôn ngữ trình duyệt — vì khách Việt và
   *      khách Trung rất hay để trình duyệt `en-US`, nếu để ngôn ngữ thắng thì họ mãi
   *      chỉ thấy tiếng Anh (đúng vấn đề của bản cũ).
   *   2. Ngôn ngữ trình duyệt nếu là thứ tiếng mình có (vi/en/zh).
   *   3. Còn lại: `en`.
   */
  function pickLanguage() {
    var zone = "";
    try {
      zone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").toLowerCase();
    } catch (err) {
      zone = "";
    }

    if (/ho_chi_minh|saigon|hanoi|asia\/bangkok/.test(zone)) return "vi";
    if (/shanghai|chongqing|urumqi|hong_kong|taipei|macau|asia\/beijing/.test(zone)) return "zh";

    var candidates = [];
    try {
      candidates = (navigator.languages ? Array.prototype.slice.call(navigator.languages) : []).concat([
        navigator.language || "",
      ]);
    } catch (err) {
      candidates = [];
    }

    for (var i = 0; i < candidates.length; i += 1) {
      var tag = String(candidates[i] || "").toLowerCase();
      if (tag.indexOf("vi") === 0) return "vi";
      if (tag.indexOf("zh") === 0) return "zh";
      if (tag.indexOf("en") === 0) return "en";
    }

    return "en";
  }

  var LANG = pickLanguage();
  var TEXT = STRINGS[LANG] || STRINGS.en;

  /** Lấy chuỗi theo thứ tiếng đang dùng; thay `{os}`, `{count}`… nếu có. */
  function t(key, vars) {
    var value = TEXT[key] || STRINGS.en[key] || "";
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match;
    });
  }

  function os() {
    var ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) return "android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
    if (/Windows/i.test(ua)) return "windows";
    return "other";
  }

  function readState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeState(value) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(value));
    } catch (err) {
      /* chế độ riêng tư chặn localStorage: bỏ qua, chỉ là quảng cáo */
    }
  }

  function shouldShow() {
    var state = readState();
    if (!state) return true;
    if (state.never) return false;
    if (state.until && Date.now() < state.until) return false;
    return true;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  var ICONS = {
    download: "M12 3v12m0 0 4-4m-4 4-4-4M5 21h14",
    windows: "M3 5.5 10 4.5v7H3v-6Zm0 13 7 1v-7H3v6Zm9 1.2 9 1.3V12h-9v8.7ZM12 4.2l9-1.3V11h-9V4.2Z",
    apple: "M16 12.6c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.5.8-3.2.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.9-3.6 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.8 2.1 1.1 0 1.5-.7 2.9-.7s1.7.7 2.9.7 2-1.1 2.7-2.1c.9-1.2 1.2-2.4 1.2-2.5-.1 0-2.7-1-2.7-3.3ZM14 5.3c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2Z",
    robot: "M12 3v3m-5 0h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm3 5h.01M14 11h.01M9 15h6",
    shield: "M12 3 5 6v5c0 4.2 2.9 8.1 7 9 4.1-.9 7-4.8 7-9V6l-7-3Zm-1.2 9.2 3.4-3.4 1.1 1.1-4.5 4.5-2.2-2.2 1.1-1.1 1.1 1.1Z",
    sparkles: "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Zm6 9 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9L18 12Z",
    close: "M6 6l12 12M18 6 6 18",
  };

  function svg(name, size) {
    var node = document.createElementNS(SVG_NS, "svg");
    node.setAttribute("viewBox", "0 0 24 24");
    node.setAttribute("width", size || 16);
    node.setAttribute("height", size || 16);
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", "currentColor");
    node.setAttribute("stroke-width", "1.8");
    node.setAttribute("stroke-linecap", "round");
    node.setAttribute("stroke-linejoin", "round");
    node.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", ICONS[name] || "");
    node.appendChild(path);
    return node;
  }

  /** Nút tải: nhãn theo hệ điều hành đang dùng, kèm icon tương ứng. */
  function downloadButton(platform, href, label, primary) {
    var a = el("a", "fg-btn " + (primary ? "fg-btn--primary" : "fg-btn--ghost"));
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.appendChild(svg(platform === "ios" || platform === "macos" ? "apple" : platform === "windows" ? "windows" : "download", 15));
    a.appendChild(el("span", null, label));
    if (primary) {
      var hint = el("span", "fg-btn__os", t("forYourDevice"));
      a.appendChild(hint);
    }
    return a;
  }

  function productCard(options) {
    var card = el("div", "fg-prod");

    var top = el("div", "fg-prod__top");
    var icon = el("img", "fg-prod__icon");
    icon.src = options.icon;
    icon.alt = options.name;
    icon.loading = "lazy";
    icon.decoding = "async";
    icon.addEventListener("error", function () {
      // Ảnh lỗi thì để nền gradient của .fg-prod__icon làm icon, không vỡ layout.
      icon.style.visibility = "hidden";
    });
    top.appendChild(icon);

    var head = el("div");
    head.appendChild(el("div", "fg-prod__name", options.name));
    head.appendChild(el("span", "fg-prod__tag", options.tag));
    top.appendChild(head);
    card.appendChild(top);

    card.appendChild(el("p", "fg-prod__pitch", options.pitch));

    var actions = el("div", "fg-prod__actions");
    options.buttons.forEach(function (button) {
      actions.appendChild(
        downloadButton(button.platform, button.href, button.label, button.platform === options.os),
      );
    });
    card.appendChild(actions);

    var buy = el("a", "fg-prod__buy", options.buyLabel + " →");
    buy.href = options.buyHref;
    buy.target = "_blank";
    buy.rel = "noopener";
    card.appendChild(buy);

    return card;
  }

  function build() {
    var current = os();

    var backdrop = el("div", "fg-promo-backdrop");
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "fg-promo-title");

    var card = el("div", "fg-promo");

    var close = el("button", "fg-promo__close");
    close.type = "button";
    close.setAttribute("aria-label", t("closeAria"));
    close.appendChild(svg("close", 16));
    card.appendChild(close);

    var head = el("div", "fg-promo__head");
    var mark = el("img", "fg-promo__mark");
    mark.src = BRAND_MARK;
    mark.alt = "";
    head.appendChild(mark);

    var headText = el("div");
    headText.appendChild(el("div", "fg-promo__eyebrow", t("eyebrow")));
    var title = el("h2", "fg-promo__title", t("title"));
    title.id = "fg-promo-title";
    headText.appendChild(title);
    headText.appendChild(el("p", "fg-promo__sub", t("sub")));
    head.appendChild(headText);
    card.appendChild(head);

    var grid = el("div", "fg-promo__grid");

    var vpnButtons = [
      { platform: "windows", href: LINKS.vpnflow.windows, label: "Windows" },
      { platform: "macos", href: LINKS.vpnflow.macos, label: "macOS" },
      { platform: "ios", href: LINKS.vpnflow.ios, label: "iOS" },
      { platform: "android", href: LINKS.vpnflow.android, label: "Android" },
    ];
    // Nút đầu tiên là hệ điều hành của khách để bấm là tải đúng bản.
    var vpnPrimaryFirst = ["windows", "macos", "ios", "android", "other"].indexOf(current) !== -1 ? current : "other";
    if (vpnPrimaryFirst !== "other") {
      vpnButtons.sort(function (a, b) {
        if (a.platform === current) return -1;
        if (b.platform === current) return 1;
        return 0;
      });
      vpnButtons[0].label = t("downloadFor", { os: OS_LABEL[current] });
    }

    grid.appendChild(
      productCard({
        name: "VPNFlow",
        tag: "VPN",
        icon: ICON_VPNFLOW,
        pitch: t("vpnPitch"),
        buttons: vpnButtons,
        os: current,
        buyLabel: t("vpnBuy"),
        buyHref: LINKS.vpnflow.buy,
      }),
    );

    var aiButtons = [
      { platform: "ios", href: LINKS.meetflow.ios, label: t("aiIosLabel") },
      { platform: "android", href: LINKS.meetflow.android, label: t("aiAndroidLabel") },
    ];
    aiButtons.sort(function (a, b) {
      if (a.platform === current) return -1;
      if (b.platform === current) return 1;
      return 0;
    });
    if (current === "ios" || current === "android") {
      aiButtons[0].label = current === "ios" ? t("aiIosPrimary") : t("aiAndroidPrimary");
    }

    grid.appendChild(
      productCard({
        name: "MeetFlow AI",
        tag: "AI",
        icon: ICON_MEETFLOW,
        pitch: t("aiPitch"),
        buttons: aiButtons,
        os: current,
        buyLabel: t("aiBuy"),
        buyHref: LINKS.meetflow.guide,
      }),
    );

    card.appendChild(grid);

    var foot = el("div", "fg-promo__foot");
    foot.appendChild(el("div", "fg-promo__note", t("note")));
    var links = el("div", "fg-promo__links");
    var later = el("button", "fg-link", t("later"));
    later.type = "button";
    var never = el("button", "fg-link", t("never"));
    never.type = "button";
    links.appendChild(never);
    links.appendChild(later);
    foot.appendChild(links);
    card.appendChild(foot);

    backdrop.appendChild(card);
    return { backdrop: backdrop, close: close, later: later, never: never };
  }

  var ui = null;
  var lastFocus = null;

  function onKeydown(event) {
    if (event.key === "Escape") hide({ until: Date.now() + snoozeMs });
  }

  function hide(state) {
    if (!ui) return;
    writeState(state);
    document.removeEventListener("keydown", onKeydown, true);
    document.body.style.removeProperty("overflow");
    if (ui.backdrop.parentNode) ui.backdrop.parentNode.removeChild(ui.backdrop);
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function show() {
    if (!shouldShow() || ui) return;
    ui = build();
    lastFocus = document.activeElement;
    ui.close.addEventListener("click", function () {
      hide({ until: Date.now() + snoozeMs });
    });
    ui.later.addEventListener("click", function () {
      hide({ until: Date.now() + snoozeMs });
    });
    ui.never.addEventListener("click", function () {
      hide({ never: true });
    });
    ui.backdrop.addEventListener("click", function (event) {
      // Bấm ra ngoài = để sau, không phải tắt vĩnh viễn.
      if (event.target === ui.backdrop) hide({ until: Date.now() + snoozeMs });
    });
    document.addEventListener("keydown", onKeydown, true);
    document.body.style.overflow = "hidden";
    document.body.appendChild(ui.backdrop);
    ui.close.focus();
  }

  function schedule() {
    resolveSnoozeMs().then(function () { setTimeout(show, DELAY_MS); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule);
  } else {
    schedule();
  }
})();
