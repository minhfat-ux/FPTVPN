import Foundation

/// Danh mục credit bán bằng IAP consumable.
///
/// Quy ước product ID (khớp bảng trong `APPSTORE_CHECKLIST.md`):
/// `site.meetflowai.fbuddy.credits.<số credit>`
///
/// Số credit hiển thị được SUY RA từ đuôi product ID, nhưng **server mới là nguồn
/// sự thật**: phản hồi của `POST /api/iap/verify` trả `{ok, credits}` và đó mới là
/// số thực sự cộng vào tài khoản (server tra bảng productId → credits của chính nó,
/// để client không thể tự khai số credit).
enum CreditPack {
    static let productIDPrefix = "site.meetflowai.fbuddy.credits."

    static func productID(credits: Int) -> String { "\(productIDPrefix)\(credits)" }

    /// Số credit suy ra từ product ID; `nil` nếu ID không đúng quy ước.
    static func credits(fromProductID id: String) -> Int? {
        guard id.hasPrefix(productIDPrefix) else { return nil }
        let suffix = String(id.dropFirst(productIDPrefix.count))
        guard let value = Int(suffix), value > 0 else { return nil }
        return value
    }
}
