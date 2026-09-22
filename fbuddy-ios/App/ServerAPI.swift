import Foundation
import WebKit

/// HTTP client tới server fBuddy. Giai đoạn này chỉ có MỘT endpoint:
/// xác thực giao dịch IAP rồi cộng credit.
///
/// ## Hợp đồng (client định nghĩa, server sẽ viết sau — KHÔNG thuộc scope này)
///
/// ```
/// POST https://fbuddy.meetflowai.site/api/iap/verify
/// Authorization: Bearer <fbuddy_token>      (bắt buộc — biết cộng credit cho ai)
/// Content-Type: application/json
///
/// { "jwsRepresentation": "<JWS của Apple>",
///   "productId": "site.meetflowai.fbuddy.credits.10000",
///   "transactionId": "2000000123456789" }     // chuỗi, xem chú thích bên dưới
///
/// 200 { "ok": true,  "credits": 10000, "balance": 12345 }
/// 200 { "ok": false, "message": "…" }         // JWS không hợp lệ / sản phẩm lạ
/// 401 khi chưa đăng nhập
/// ```
///
/// - `transactionId` gửi dạng **chuỗi** vì `Transaction.id` là `UInt64` và có thể vượt
///   `2^53` — gửi dạng số qua JSON sẽ bị mất chính xác ở phía JS. Server nên nhận cả hai.
/// - Server **phải tự tra** `productId` → số credit (không tin client) và **idempotent**
///   theo `transactionId` (Apple có thể gọi lại nhiều lần).
/// - Xác thực: web fBuddy đăng nhập bằng cookie `fbuddy_token` (HttpOnly, 30 ngày).
///   `URLSession` **không** dùng chung cookie store với `WKWebView`, nên client này đọc
///   cookie từ `WKWebsiteDataStore.default().httpCookieStore` rồi gửi lại dưới dạng
///   `Authorization: Bearer …` — đúng cách `tokenFromRequest()` của server nhận
///   (`flowgpt/server/src/auth.js`).
@MainActor
final class ServerAPI {
    struct VerifyResponse: Decodable {
        let ok: Bool
        /// Số credit server ĐÃ cộng — nguồn sự thật, không phải số client tự suy ra.
        let credits: Int?
        /// Số dư sau khi cộng, nếu server trả.
        let balance: Int?
        let message: String?
    }

    enum APIError: LocalizedError {
        case notSignedIn
        case http(status: Int)
        case transport(String)
        case malformedResponse

        var errorDescription: String? {
            switch self {
            case .notSignedIn:
                return "Chưa đăng nhập fBuddy — hãy đăng nhập trong app rồi thử lại."
            case .http(let status):
                return "Server fBuddy trả về HTTP \(status)."
            case .transport(let detail):
                return "Không gọi được server fBuddy: \(detail)"
            case .malformedResponse:
                return "Server fBuddy trả về dữ liệu không đọc được."
            }
        }
    }

    /// Endpoint xác thực IAP. Đổi được để test với server staging.
    static let verifyPath = "/api/iap/verify"
    private static let authCookieName = "fbuddy_token"

    let baseURL: URL
    private let session: URLSession

    init(baseURL: URL = URL(string: "https://fbuddy.meetflowai.site")!, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func verifyIAP(
        jwsRepresentation: String,
        productID: String,
        transactionID: UInt64
    ) async throws -> VerifyResponse {
        guard let token = await authToken() else { throw APIError.notSignedIn }

        var request = URLRequest(url: baseURL.appendingPathComponent(Self.verifyPath))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "jwsRepresentation": jwsRepresentation,
            "productId": productID,
            "transactionId": String(transactionID),
        ])

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }

        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw APIError.http(status: http.statusCode)
        }
        do {
            return try JSONDecoder().decode(VerifyResponse.self, from: data)
        } catch {
            throw APIError.malformedResponse
        }
    }

    /// Token phiên do web đặt khi đăng nhập. Cookie là `HttpOnly` nên JS không đọc được,
    /// nhưng tầng native thì đọc được từ cookie store của `WKWebView`.
    private func authToken() async -> String? {
        let store = WKWebsiteDataStore.default().httpCookieStore
        return await withCheckedContinuation { continuation in
            store.getAllCookies { cookies in
                // Chỉ chuyển `String?` qua ranh giới isolation — HTTPCookie không Sendable.
                continuation.resume(
                    returning: cookies.first { $0.name == Self.authCookieName }?.value
                )
            }
        }
    }
}
