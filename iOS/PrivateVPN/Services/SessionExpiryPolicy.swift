import Foundation

extension Notification.Name {
    /// Server đã từ chối phiên đăng nhập (HTTP 401 `"Valid user session required"`).
    /// `AuthSessionStore` nghe thông báo này để xoá token chết + buộc khách đăng nhập lại.
    static let flowvpnSessionExpired = Notification.Name("flowvpn.sessionExpired")
}

/// Quyết định THUẦN LOGIC cho vòng đời phiên đăng nhập.
///
/// Vì sao cần: session của control plane có hạn **30 ngày** (`control-plane/src/auth-store.js`,
/// `SESSION_TTL_MS`). Hết hạn là hành vi đúng, nhưng 25/10/2026 khách chỉ thấy **nguyên văn câu lỗi
/// API tiếng Anh** ("Valid user session required") và app không tự mở màn hình đăng nhập — xem
/// `docs/handoff/HANDOFF_NODE2_PERF_2026-10-23.md` §7.
enum SessionExpiryPolicy {
    /// Số ngày còn lại, làm tròn XUỐNG; `nil` nếu không đọc được mốc hạn.
    /// Đã hết hạn ⇒ `0` (không trả số âm để UI không hiện "-2 ngày").
    static func daysLeft(expiresAt: String?, now: Date = Date()) -> Int? {
        guard let date = parse(expiresAt) else { return nil }
        let seconds = date.timeIntervalSince(now)
        if seconds <= 0 { return 0 }
        return max(0, Int(seconds / 86_400))
    }

    /// Số ngày còn lại **nếu đáng nhắc trước** (≤ `threshold`, mặc định 3 ngày); ngược lại `nil`.
    /// Dùng cho banner nhắc để khách chủ động đăng nhập lại thay vì bị đá ra giữa chừng.
    static func bannerDaysLeft(expiresAt: String?, now: Date = Date(), threshold: Int = 3) -> Int? {
        guard let days = daysLeft(expiresAt: expiresAt, now: now), days <= threshold else { return nil }
        return days
    }

    /// Câu báo khi phiên đã bị server từ chối (401).
    static func expiredMessage(isVietnamese: Bool) -> String {
        isVietnamese
            ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            : "Your session has expired. Please sign in again."
    }

    /// Câu nhắc TRƯỚC khi hết hạn.
    static func bannerMessage(daysLeft: Int, isVietnamese: Bool) -> String {
        isVietnamese
            ? "Phiên đăng nhập còn \(daysLeft) ngày. Hãy đăng nhập lại trước khi hết hạn."
            : "Your session expires in \(daysLeft) day(s). Please sign in again before then."
    }

    /// Đọc `expires_at` của control plane: ISO-8601 (có hoặc không có phần lẻ giây).
    private static func parse(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
