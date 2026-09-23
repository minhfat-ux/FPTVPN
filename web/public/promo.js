/* ============================================================================
   fBuddy — popup quảng cáo ứng dụng hệ sinh thái FlowTech
   Trả lời "mọi người thấy link cài đặt": hiện 1 lần khi vào trang, có "Để sau"
   (1 ngày) và "Không hiện lại nữa".

   Danh mục app (VPNFlow, MeetFlow AI, SuperMom AI, FlowTech Harness…) lấy từ
   /api/apps — cùng nguồn với trang chủ FlowTech và câu trả lời của trợ lý — nên
   mỗi app đều có nút tải theo nền tảng (Windows/macOS/iOS/Android).

   Vì sao vanilla JS: popup phải chạy cho cả khách CHƯA đăng nhập (trước khi React
   mount) và không phụ thuộc bước build của web/. Nạp bằng <script defer src="/promo.js">.
   ========================================================================== */

(function () {
  "use strict";

  var STORE_KEY = "fbuddy:promo:apps:v2";
  /** Khoá của bản popup cũ — chỉ đọc để tôn trọng lựa chọn "không hiện lại nữa". */
  var LEGACY_KEYS = ["fbuddy:promo:apps:v1"];
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
  // Icon lấy từ CHÍNH repo (không hot-link site khác): CSP của fBuddy là `img-src 'self'`
    // nên ảnh ngoài bị chặn ⇒ popup mất icon (lỗi chủ dự án báo 21/09/2026).
    var ICON_VPNFLOW = "/app-icons/vpnflow.png";
  var ICON_MEETFLOW = "/app-icons/meetflow.png";

  /*
   * Danh mục app của popup lấy từ `/api/apps` (nguồn server: PUBLISHED_APPS) — cùng nguồn với
   * câu trả lời của trợ lý và trang chủ FlowTech, nên thêm/bớt/đổi link chỉ phải sửa MỘT chỗ và
   * popup không thể lệch. Bản dựng sẵn dưới đây chỉ dùng khi mạng/API lỗi.
   *
   * Link đã kiểm chứng trả nội dung thật (21/09/2026). Windows dùng bản "-latest" để không lỗi thời.
   */
  var LINKS = {
    vpnflow: {
      buy: "https://meetflowai.site/buy",
      windows: "https://meetflowai.site/dl/VPNFlow-Setup-latest.exe",
      macos: "https://meetflowai.site/install/mac",
      ios: "https://meetflowai.site/install/ios",
      android: "https://meetflowai.site/v1/downloads/android",
    },
    meetflow: {
      buy: "https://meetflowai.site/ai/guide",
      guide: "https://meetflowai.site/ai/guide",
      ios: "https://apps.apple.com/vn/app/meetflow-ai/id6765590042",
      // App Store là bản dùng chung iPhone/iPad/Mac (trang chủ ghi "App Store (macOS)" cho đúng id
      // này) — không bịa link .dmg không tồn tại.
      macos: "https://apps.apple.com/vn/app/meetflow-ai/id6765590042",
      windows: "https://meetflowai.site/dl/MeetFlowAI-Overlay-latest-win-x64.zip",
      android: "https://api.meetflowai.site/v1/ai/downloads/android",
    },
  };

  /** Danh mục dựng sẵn — chỉ dùng khi `/api/apps` không trả được gì. */
  var FALLBACK_APPS = [
    {
      id: "fbuddy",
      name: "fBuddy",
      tag: "AI",
      icon: "/app-icons/fbuddy.png",
      pitch: "Trợ lý AI đa năng: hỏi đáp, viết, dịch, tóm tắt, làm Word/Excel/PowerPoint và phân tích dữ liệu.",
      links: { app: "https://fbuddy.meetflowai.site" },
    },
    {
      id: "vpnflow",
      name: "VPNFlow",
      tag: "VPN",
      icon: ICON_VPNFLOW,
      pitch: "Kết nối riêng tư tốc độ cao, không giới hạn dung lượng. Có bản cho Windows, macOS, iPhone/iPad và Android.",
      links: LINKS.vpnflow,
    },
    {
      id: "meetflow",
      name: "MeetFlow AI",
      tag: "AI",
      icon: ICON_MEETFLOW,
      pitch: "Dịch hội thoại thời gian thực và ghi biên bản cuộc họp. Có bản Windows (overlay), macOS/iPhone/iPad trên App Store và Android.",
      links: LINKS.meetflow,
    },
    {
      id: "supermom",
      name: "SuperMom AI",
      tag: "Học tập",
      icon: "/app-icons/supermom.png",
      pitch: "Trợ lý học tập cho cha mẹ Việt có con lớp 1–9: chụp ảnh bài toán, giải từng bước, kiểm tra bài con đã làm.",
      links: { ios: "https://apps.apple.com/vn/app/supermom-ai/id6768231353" },
    },
    {
      id: "harness",
      name: "FlowTech Harness",
      tag: "Agent",
      icon: "/app-icons/harness.png",
      pitch: "Bộ harness agent của FlowTech: chạy trợ lý trên máy của anh và mở nó từ xa.",
      links: { guide: "https://api.meetflowai.site/guide" },
    },
  ];

  /** Nhãn nút theo nền tảng — khách bấm là tải đúng bản. */
  var PLATFORM_LABEL = {
    windows: "Windows",
    macos: "macOS",
    ios: "App Store (iOS)",
    android: "Android (APK)",
    linux: "Linux",
  };
  /** Nhãn nút tải — iOS phân biệt App Store thật với trang hướng dẫn cài IPA. */
  function platformLabel(platform, href) {
    if (platform === "ios") {
      return /apps\.apple\.com/i.test(href) ? "App Store (iOS)" : "iPhone / iPad (IPA)";
    }
    return PLATFORM_LABEL[platform] || platform;
  }
  /** Thứ tự nút khi không xác định được hệ điều hành của khách. */
  var PLATFORM_ORDER = ["windows", "macos", "ios", "android", "linux"];
  /** Nhãn ngắn cho thẻ app khi server không gửi `kind`. */
  var APP_TAG = { meetflow: "AI", vpnflow: "VPN", supermom: "Học tập", harness: "Agent" };
  /** Nút phụ (không phải bản cài) — nhãn riêng cho từng loại. */
  var EXTRA_LABEL = { buy: "Xem gói & mua", guide: "Hướng dẫn cài", app: "Mở app", support: "Hỗ trợ" };
  var EXTRA_ORDER = ["buy", "guide", "app", "support"];

  /** Tên thiết bị của khách — dùng cho dòng "· bản cho máy bạn". */
  var OS_LABEL = {
    windows: "Windows",
    macos: "macOS",
    ios: "iPhone / iPad",
    android: "Android",
  };

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
      if (raw) return JSON.parse(raw);
      // Khoá của bản popup CŨ (chỉ có VPNFlow + MeetFlow AI, thiếu link Windows/macOS). Nội dung
      // quảng cáo đã đổi nên khách đã "để sau" được xem lại MỘT lần — nhưng ai đã bấm "không hiện
      // lại nữa" thì vẫn được tôn trọng, không réo lại.
      for (var i = 0; i < LEGACY_KEYS.length; i += 1) {
        var legacy = localStorage.getItem(LEGACY_KEYS[i]);
        if (!legacy) continue;
        var parsed = JSON.parse(legacy);
        if (parsed && parsed.never) {
          writeState({ never: true });
          return { never: true };
        }
      }
      return null;
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
      var hint = el("span", "fg-btn__os", "· bản cho máy bạn");
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
      // Ảnh lỗi ⇒ hiện CHỮ CÁI ĐẦU trên nền gradient của `.fg-prod__icon`, KHÔNG để trống
      // (chủ dự án gặp cảnh "thẻ tệp có nhưng icon mất" — thà có chữ cái còn hơn khoảng trắng).
      var letter = el("div", "fg-prod__icon fg-prod__icon--letter", (options.name || "?").trim().charAt(0).toUpperCase());
      icon.replaceWith(letter);
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

    // Không có link mua/hướng dẫn thật thì KHÔNG vẽ nút phụ (đừng bịa link cho đủ thẻ).
    if (options.buyHref) {
      var buy = el("a", "fg-prod__buy", options.buyLabel + " →");
      buy.href = options.buyHref;
      buy.target = "_blank";
      buy.rel = "noopener";
      card.appendChild(buy);
    }

    return card;
  }

  /** Nút tải của một app: bản theo nền tảng, bản của khách lên ĐẦU để bấm là tải đúng. */
  function appButtons(app, current) {
    var links = app.links || {};
    var buttons = PLATFORM_ORDER.filter(function (platform) {
      return typeof links[platform] === "string" && links[platform];
    }).map(function (platform) {
      return { platform: platform, href: links[platform], label: platformLabel(platform, links[platform]) };
    });
    // Cùng một link cho nhiều nền tảng (App Store dùng chung iPhone/iPad/Mac) thì chỉ vẽ MỘT nút.
    var seen = {};
    buttons = buttons.filter(function (button) {
      if (seen[button.href]) return false;
      seen[button.href] = true;
      return true;
    });
    var index = -1;
    buttons.forEach(function (button, i) {
      if (button.platform === current) index = i;
    });
    if (index !== -1) {
      var first = buttons.splice(index, 1)[0];
      first.label = "Tải cho " + (OS_LABEL[current] || first.label);
      buttons.unshift(first);
    }
    return buttons;
  }

  /** Nút phụ của app: xem gói & mua / hướng dẫn cài. */
  function appExtra(app) {
    var links = app.links || {};
    for (var i = 0; i < EXTRA_ORDER.length; i += 1) {
      var key = EXTRA_ORDER[i];
      if (typeof links[key] === "string" && links[key]) {
        return { label: EXTRA_LABEL[key], href: links[key] };
      }
    }
    return null;
  }

  function cardFor(app, current) {
    var extra = appExtra(app);
    return productCard({
      name: app.name,
      tag: app.tag || APP_TAG[app.id] || "App",
      icon: app.icon || "/app-icons/" + app.id + ".png",
      pitch: app.pitch || "",
      buttons: appButtons(app, current),
      os: current,
      buyLabel: extra ? extra.label : null,
      buyHref: extra ? extra.href : null,
    });
  }

  /**
   * Danh mục app cho popup. Nguồn là `/api/apps` (server đọc PUBLISHED_APPS) nên thêm app mới
   * chỉ phải sửa một chỗ ở server; API lỗi thì rơi về bản dựng sẵn, popup không bao giờ trắng.
   */
  function loadApps() {
    return fetch("/api/apps", { credentials: "same-origin" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) return FALLBACK_APPS;
        return items.map(function (item) {
          return {
            id: item.id,
            name: item.name,
            tag: APP_TAG[item.id] || String(item.kind || "App").slice(0, 16),
            icon: item.iconUrl || "/app-icons/" + item.id + ".png",
            pitch: item.summary || "",
            links: item.links || {},
          };
        });
      })
      .catch(function () {
        return FALLBACK_APPS;
      });
  }

  function build(apps) {
    var current = os();

    var backdrop = el("div", "fg-promo-backdrop");
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "fg-promo-title");

    var card = el("div", "fg-promo");

    var close = el("button", "fg-promo__close");
    close.type = "button";
    close.setAttribute("aria-label", "Đóng quảng cáo");
    close.appendChild(svg("close", 16));
    card.appendChild(close);

    var head = el("div", "fg-promo__head");
    var mark = el("img", "fg-promo__mark");
    mark.src = BRAND_MARK;
    mark.alt = "";
    head.appendChild(mark);

    var headText = el("div");
    headText.appendChild(el("div", "fg-promo__eyebrow", "Hệ sinh thái FlowTech"));
    var title = el("h2", "fg-promo__title", "Cài app dùng ngay trên mọi thiết bị");
    title.id = "fg-promo-title";
    headText.appendChild(title);
    headText.appendChild(
      el(
        "p",
        "fg-promo__sub",
        "VPNFlow cho kết nối riêng tư, MeetFlow AI cho dịch & biên bản cuộc họp, SuperMom AI cho cha mẹ có con lớp 1–9, FlowTech Harness cho agent trên máy anh. Miễn phí tải về.",
      ),
    );
    head.appendChild(headText);
    card.appendChild(head);

    // Mỗi app một thẻ, nút tải theo nền tảng (danh mục lấy từ /api/apps). Hết chỗ thì cuộn — thẻ
    // nằm trong .fg-promo nên vẫn thấy được nút "Để sau".
    var grid = el("div", "fg-promo__grid");
    apps.forEach(function (app) {
      grid.appendChild(cardFor(app, current));
    });
    card.appendChild(grid);

    var foot = el("div", "fg-promo__foot");
    foot.appendChild(el("div", "fg-promo__note", "Quảng cáo của FlowTech · bấm để tải, không thu phí tải về"));
    var links = el("div", "fg-promo__links");
    var later = el("button", "fg-link", "Để sau");
    later.type = "button";
    var never = el("button", "fg-link", "Không hiện lại nữa");
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

  function show(apps) {
    if (!shouldShow() || ui) return;
    ui = build(apps);
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
    // Danh mục app và mốc nhắc lại lấy song song: chậm nhất là lúc API trả lời, không cộng dồn.
    Promise.all([resolveSnoozeMs(), loadApps()]).then(function (results) {
      var apps = results[1];
      setTimeout(function () {
        show(apps);
      }, DELAY_MS);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule);
  } else {
    schedule();
  }
})();
