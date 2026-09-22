import SwiftUI
import UIKit
import WebKit

/// `WKWebView` bọc web fBuddy tại `fbuddy.meetflowai.site`.
///
/// Ba việc của lớp này:
/// 1. Mọi điều hướng đi qua `WebGate` — trong app / mở Safari / chặn kênh mua ngoài.
/// 2. Tiêm `WebGateScript` để ẩn và chặn nút nạp token bằng chuyển khoản trong web.
/// 3. Khai user agent `FBuddyIOS/<version>` để web tự phục vụ bản iOS (cách bền vững
///    hơn để ẩn phần nạp token — xem chú thích `WebGateScript`).
struct WebView: UIViewRepresentable {
    /// URL khởi đầu. Truyền vào để đổi được khi test.
    let startURL: URL
    /// Tăng lên mỗi lần bấm "Tải lại"; `updateUIView` thấy đổi thì gọi `reload()`.
    let reloadToken: Int
    /// Người dùng muốn nạp credit ⇒ mở store IAP native.
    let onPurchaseIntent: () -> Void

    static let messageHandlerName = "fbuddyNative"
    static let userAgentToken = "FBuddyIOS/1.0.0"

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.addUserScript(
            WKUserScript(
                source: WebGateScript.source,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: false
            )
        )
        controller.add(context.coordinator, name: Self.messageHandlerName)

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        // `.default()` để cookie phiên `fbuddy_token` dùng chung với `ServerAPI`
        // (ServerAPI đọc lại cookie này rồi gửi kèm dưới dạng Bearer).
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        // Web fBuddy đọc to câu trả lời (TTS) và ghi âm giọng nói ⇒ không chặn autoplay.
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.applicationNameForUserAgent = Self.userAgentToken

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: startURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // Closure của SwiftUI đổi mỗi lần render ⇒ luôn cập nhật để khỏi gọi bản cũ.
        context.coordinator.parent = self
        if context.coordinator.lastReloadToken != reloadToken {
            context.coordinator.lastReloadToken = reloadToken
            uiView.reload()
        }
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        // WKUserContentController giữ handler rất chặt ⇒ phải gỡ, nếu không rò coordinator.
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: messageHandlerName)
        uiView.stopLoading()
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        var parent: WebView
        /// Token reload đã xử lý — để `updateUIView` không reload ở mọi lần render.
        var lastReloadToken: Int

        init(_ parent: WebView) {
            self.parent = parent
            self.lastReloadToken = parent.reloadToken
        }

        private func policy(for url: URL?) -> WKNavigationActionPolicy {
            guard let url else { return .allow }
            switch WebGate.decision(for: url) {
            case .allow:
                return .allow
            case .openExternally:
                UIApplication.shared.open(url)
                return .cancel
            case .blockPurchase:
                parent.onPurchaseIntent()
                return .cancel
            }
        }

        // MARK: - WKNavigationDelegate

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction
        ) async -> WKNavigationActionPolicy {
            policy(for: navigationAction.request.url)
        }

        // MARK: - WKUIDelegate

        /// `target="_blank"` / `window.open` ⇒ WKWebView không tự mở, ta định tuyến tay.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            _ = policy(for: navigationAction.request.url)
            return nil
        }

        /// Voice input của web cần micro; web chạy đúng domain của mình thì cho phép.
        func webView(
            _ webView: WKWebView,
            decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
            initiatedBy frame: WKFrameInfo,
            type: WKMediaCaptureType
        ) async -> WKPermissionDecision {
            WebGate.isAppHost(origin.host) ? .grant : .deny
        }

        // MARK: - WKScriptMessageHandler

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == WebView.messageHandlerName,
                  let body = message.body as? [String: Any],
                  body["type"] as? String == "purchaseIntent"
            else { return }
            parent.onPurchaseIntent()
        }
    }
}
