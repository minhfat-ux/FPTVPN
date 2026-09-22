import Foundation
import StoreKit

/// StoreKit 2 cho **credit dạng consumable**.
///
/// Nguyên tắc quan trọng nhất: `finish()` **chỉ được gọi SAU khi server fBuddy đã xác
/// thực JWS và cộng credit**. Nếu gọi `finish()` trước mà server lỗi thì khách đã mất
/// tiền mà không có credit, và Apple không bao giờ giao lại giao dịch đó nữa.
/// Vì vậy giao dịch lỗi được giữ "unfinished" — `Transaction.unfinished` sẽ trả lại
/// ở lần mở app sau (xem `start()`).
///
/// Consumable **không** có "Restore Purchases": credit đã cộng vào số dư server, khôi
/// phục nằm ở số dư tài khoản chứ không ở giao dịch. Apple cũng không bắt buộc nút
/// Restore cho hàng tiêu dùng.
@MainActor
final class StoreKitManager: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case ready
        case failed(String)
    }

    /// Product ID phải khớp **từng ký tự** với sản phẩm khai trên App Store Connect.
    /// Danh mục + giá: xem `APPSTORE_CHECKLIST.md` §"Danh sách sản phẩm IAP".
    static let productIDs: [String] = [
        CreditPack.productID(credits: 10_000),
        CreditPack.productID(credits: 55_000),
        CreditPack.productID(credits: 230_000),
    ]

    @Published private(set) var products: [Product] = []
    @Published private(set) var state: LoadState = .idle
    @Published private(set) var purchasingProductID: String?
    /// Câu thông báo gần nhất cho người dùng (thành công / lỗi / chờ duyệt).
    @Published private(set) var notice: String?
    @Published var isStorePresented = false

    private let api: ServerAPI
    private var updatesTask: Task<Void, Never>?

    init(api: ServerAPI = ServerAPI()) {
        self.api = api
    }

    deinit {
        updatesTask?.cancel()
    }

    /// Gọi một lần khi app khởi động.
    func start() async {
        listenForTransactions()
        await loadProducts()
        await deliverUnfinishedTransactions()
    }

    // MARK: - Danh mục sản phẩm

    func loadProducts() async {
        state = .loading
        do {
            let loaded = try await Product.products(for: Self.productIDs)
            products = loaded.sorted { lhs, rhs in
                sortKey(lhs) < sortKey(rhs)
            }
            if loaded.isEmpty {
                state = .failed(
                    "App Store chưa trả về gói credit nào. Kiểm tra sản phẩm đã ở trạng thái "
                        + "\"Ready to Submit\" và đã có giá cho vùng Việt Nam chưa."
                )
            } else {
                state = .ready
            }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Sắp xếp theo số credit suy ra từ product ID (rơi về giá nếu ID lạ).
    /// `Decimal` vì `Product.price` là `Decimal`, không phải số nguyên.
    private func sortKey(_ product: Product) -> Decimal {
        if let credits = CreditPack.credits(fromProductID: product.id) {
            return Decimal(credits)
        }
        return product.price
    }

    func credits(for product: Product) -> Int? {
        CreditPack.credits(fromProductID: product.id)
    }

    // MARK: - Mua

    func purchase(_ product: Product) async {
        purchasingProductID = product.id
        notice = nil
        defer { purchasingProductID = nil }

        do {
            switch try await product.purchase() {
            case .success(let verification):
                await deliver(verification)
            case .userCancelled:
                notice = "Bạn đã huỷ giao dịch."
            case .pending:
                // Ask to Buy: credit chỉ được cộng khi Apple duyệt xong.
                notice = "Giao dịch đang chờ Apple duyệt. Credit sẽ tự được cộng khi được duyệt."
            @unknown default:
                notice = "App Store trả về kết quả giao dịch không xác định."
            }
        } catch {
            notice = "Mua không thành công: \(error.localizedDescription)"
        }
    }

    // MARK: - Lắng nghe & giao hàng

    private func listenForTransactions() {
        guard updatesTask == nil else { return }
        // `Transaction.updates` là nguồn DUY NHẤT cho giao dịch đến ngoài luồng mua:
        // Ask to Buy được duyệt muộn, giao dịch từ thiết bị khác, hoặc giao dịch chưa finish.
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                guard let self else { return }
                await self.deliver(update)
            }
        }
    }

    /// Giao dịch còn dang dở từ các lần chạy trước (server lỗi, app bị kill giữa chừng).
    func deliverUnfinishedTransactions() async {
        for await result in Transaction.unfinished {
            await deliver(result)
        }
    }

    private func deliver(_ result: VerificationResult<Transaction>) async {
        switch result {
        case .unverified(_, let error):
            // Không finish: chữ ký không hợp lệ thì không được cộng credit, nhưng cũng
            // không nên "nuốt" giao dịch — để lần sau Apple ký lại / người dùng liên hệ.
            notice = "Giao dịch chưa được Apple ký xác thực (\(error)) nên chưa cộng credit."
        case .verified(let transaction):
            await grant(transaction, jwsRepresentation: result.jwsRepresentation)
        }
    }

    private func grant(_ transaction: Transaction, jwsRepresentation: String) async {
        guard transaction.productType == .consumable else {
            // Bản này chỉ bán consumable. Loại khác (nếu lọt vào) không thuộc luồng credit.
            notice = "Bỏ qua sản phẩm không phải consumable: \(transaction.productID)"
            return
        }

        do {
            let response = try await api.verifyIAP(
                jwsRepresentation: jwsRepresentation,
                productID: transaction.productID,
                transactionID: transaction.id
            )
            guard response.ok else {
                // Server từ chối ⇒ GIỮ giao dịch, thử lại ở lần mở app sau.
                notice = response.message ?? "Server fBuddy từ chối xác thực giao dịch này."
                return
            }
            // Chỉ tới đây mới được finish: credit đã nằm trong sổ cái của server.
            await transaction.finish()
            let granted = response.credits
                ?? CreditPack.credits(fromProductID: transaction.productID)
                ?? 0
            let balance = response.balance.map { " Số dư mới: \($0.formatted())." } ?? ""
            notice = "Đã cộng \(granted.formatted()) credit.\(balance)"
        } catch {
            // Mất mạng / server chưa có endpoint ⇒ giữ giao dịch để thử lại.
            notice = "Chưa xác thực được với server (\(error.localizedDescription)). "
                + "Giao dịch được giữ lại và sẽ tự thử lại khi mở app."
        }
    }

    /// Người dùng đã đọc thông báo.
    func clearNotice() {
        notice = nil
    }
}
