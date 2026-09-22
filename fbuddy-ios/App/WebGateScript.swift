import Foundation

/// JavaScript tiêm vào web fBuddy để **ẩn và chặn mọi lối vào kênh nạp token ngoài app**
/// (chuyển khoản ngân hàng).
///
/// Vì sao phải làm ở tầng DOM chứ không chỉ ở `WKNavigationDelegate`:
/// trong web fBuddy, màn nạp token là **state React** (`App.tsx`: `setView("topup")`),
/// KHÔNG đổi URL — nên `decidePolicyFor` của WKWebView không bao giờ thấy nó. Lớp
/// native (`WebGate`) chỉ bắt được trường hợp mở thẳng `?view=topup`.
///
/// Nhãn nút lấy nguyên văn từ `flowgpt/web/src/i18n/locales/{vi,en,zh}/shell.ts`:
/// - `shell.sidebar.topup`: "Nạp token" / "Top up tokens" / "充值代币"
/// - `shell.credits.topupMore`: "Nạp thêm" / "Top up" / "充值"
/// - `shell.view.topup.title`: "Nạp token" / "Top up tokens" / "充值代币"
///
/// Đây là biện pháp PHÒNG NGỪA (defense in depth) và có thể vỡ khi web đổi nhãn.
/// Cách bền vững hơn — và là việc còn lại của web — là để web tự ẩn mục nạp token khi
/// thấy user agent `FBuddyIOS/...` (xem `applicationNameForUserAgent` trong `WebView`).
enum WebGateScript {
    static let source = #"""
    (function () {
      if (window.__fbuddyNativeGate) { return; }
      window.__fbuddyNativeGate = true;

      var LABELS = ["nạp token", "nạp thêm", "top up tokens", "top up", "充值代币", "充值"];
      var CLICKABLE = "button, a, [role=button], .nav-item, .btn";
      var MAX_LABEL_LEN = 40;

      function norm(value) {
        return String(value == null ? "" : value).replace(/\s+/g, " ").trim().toLowerCase();
      }

      function isPurchaseHref(href) {
        if (!href) { return false; }
        try {
          var url = new URL(href, window.location.origin);
          var path = url.pathname.toLowerCase().replace(/^\/+|\/+$/g, "");
          if (path === "topup" || path === "buy") { return true; }
          if ((url.searchParams.get("view") || "").toLowerCase() === "topup") { return true; }
        } catch (error) { /* href kiểu javascript:void(0) — bỏ qua */ }
        return false;
      }

      function isClickable(node) {
        return Boolean(node) && typeof node.matches === "function" && node.matches(CLICKABLE);
      }

      function looksLikePurchase(node) {
        if (!isClickable(node)) { return false; }
        var text = norm(node.textContent);
        if (!text || text.length > MAX_LABEL_LEN) { return false; }
        for (var i = 0; i < LABELS.length; i++) {
          if (text.indexOf(LABELS[i]) !== -1) { return true; }
        }
        return false;
      }

      function matchesPurchase(node) {
        if (!node) { return false; }
        var href = typeof node.getAttribute === "function" ? node.getAttribute("href") : null;
        return looksLikePurchase(node) || isPurchaseHref(href);
      }

      function post(message) {
        try { window.webkit.messageHandlers.fbuddyNative.postMessage(message); } catch (error) {}
      }

      function hide(node) {
        if (!node || node.getAttribute("data-fbuddy-hidden") === "1") { return; }
        node.setAttribute("data-fbuddy-hidden", "1");
        node.style.setProperty("display", "none", "important");
        node.setAttribute("aria-hidden", "true");
      }

      // Chỉ ẩn CHÍNH phần tử bấm được, không ẩn tổ tiên: ẩn nhầm sidebar sẽ làm trắng app.
      function sweep() {
        var nodes = document.querySelectorAll(CLICKABLE);
        for (var i = 0; i < nodes.length; i++) {
          if (matchesPurchase(nodes[i])) { hide(nodes[i]); }
        }
      }

      // Lớp 1 (quan trọng nhất): chặn click ở pha capture, trước khi React kịp đổi view.
      document.addEventListener("click", function (event) {
        var node = event.target;
        while (node && node !== document.body && node !== document.documentElement) {
          if (matchesPurchase(node)) {
            event.preventDefault();
            event.stopPropagation();
            post({ type: "purchaseIntent" });
            return false;
          }
          node = node.parentElement;
        }
        return true;
      }, true);

      // Lớp 2: cửa sổ/tab mới mở thẳng trang nạp token.
      var nativeOpen = window.open;
      window.open = function (url) {
        if (isPurchaseHref(url)) {
          post({ type: "purchaseIntent" });
          return null;
        }
        return nativeOpen.apply(window, arguments);
      };

      // React render lại liên tục nên phải quét lại; debounce cho khỏi tốn CPU.
      var pending = false;
      function scheduleSweep() {
        if (pending) { return; }
        pending = true;
        window.setTimeout(function () { pending = false; sweep(); }, 250);
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scheduleSweep);
      } else {
        scheduleSweep();
      }
      new MutationObserver(scheduleSweep).observe(document.documentElement, { childList: true, subtree: true });
    })();
    """#
}
