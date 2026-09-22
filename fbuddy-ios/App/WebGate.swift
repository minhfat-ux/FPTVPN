import Foundation

/// Chính sách điều hướng của `WKWebView`: cái gì được chạy TRONG app, cái gì đẩy ra
/// Safari, cái gì bị chặn hẳn.
///
/// Lý do tồn tại: App Store guideline 3.1.1 cấm app bán hàng số mà lại có đường dẫn
/// tới kênh mua ngoài. Web fBuddy có trang nạp token bằng chuyển khoản ngân hàng
/// (`?view=topup`) — trên iOS trang đó KHÔNG được hiện. Xem `APPSTORE_CHECKLIST.md`.
enum WebGate {
    /// Web fBuddy chạy trong app. Mọi host khác (kể cả `meetflowai.site`) mở ra Safari.
    static let appHost = "fbuddy.meetflowai.site"

    enum Decision: Equatable {
        /// Load trong WebView.
        case allow
        /// Mở bằng app ngoài (Safari / Mail / Phone).
        case openExternally
        /// Chặn hẳn, và mời người dùng mua bằng IAP trong app.
        case blockPurchase
    }

    static func isAppHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == appHost || host.hasSuffix(".\(appHost)")
    }

    /// URL có phải kênh mua credit NGOÀI app không.
    ///
    /// Bám đúng code web fBuddy (đọc 20/09/2026), không đoán:
    /// - `flowgpt/web/src/topup/links.ts` → `isInternalTopupUrl`: `?view=topup` hoặc path `/topup`.
    /// - `flowgpt/web/src/App.tsx` → `initialView()` nhận `?view=topup`.
    /// - `flowgpt/server/src/db.js` → `creditBuyUrl = "https://fbuddy.meetflowai.site/?view=topup"`.
    static func isPurchaseURL(_ url: URL) -> Bool {
        let path = url.path.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if path == "topup" || path == "buy" { return true }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return items.contains {
            $0.name.lowercased() == "view" && ($0.value ?? "").lowercased() == "topup"
        }
    }

    static func decision(for url: URL) -> Decision {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            // mailto:, tel:, sms:, itms-apps:, scheme riêng của app khác.
            return .openExternally
        }
        // Kiểm tra kênh mua TRƯỚC host: `meetflowai.site/buy` của VPNFlow cũng là
        // trang bán hàng số, không cho mở từ trong app này.
        if isPurchaseURL(url) { return .blockPurchase }
        guard isAppHost(url.host) else { return .openExternally }
        return .allow
    }
}
