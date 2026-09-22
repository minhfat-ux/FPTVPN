import SwiftUI
import StoreKit

/// Màn hình mua credit — kênh mua **duy nhất** trong app (guideline 3.1.1).
///
/// Giá hiển thị là `product.displayPrice` do App Store trả về (đã gồm thuế/tiền tệ địa
/// phương), KHÔNG hard-code. Số credit lấy từ product ID; server vẫn là nguồn sự thật
/// khi cộng thật.
struct CreditStoreView: View {
    @EnvironmentObject private var store: StoreKitManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                switch store.state {
                case .idle, .loading:
                    ProgressView("Đang tải gói credit…")
                case .failed(let message):
                    failedView(message)
                case .ready:
                    packList
                }
            }
            .navigationTitle("Nạp credit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Đóng") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await store.loadProducts() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Tải lại danh mục")
                }
            }
        }
        .task {
            if store.products.isEmpty {
                await store.loadProducts()
            }
        }
    }

    private var packList: some View {
        List {
            Section {
                ForEach(store.products, id: \.id) { product in
                    row(product)
                }
            } footer: {
                Text(
                    "Credit dùng để chạy các lượt trò chuyện trong fBuddy. "
                        + "Credit đã mua được cộng thẳng vào tài khoản fBuddy của bạn."
                )
            }

            if let notice = store.notice {
                Section {
                    Text(notice).font(.footnote)
                }
            }
        }
    }

    private func row(_ product: Product) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(product.displayName)
                    .font(.headline)
                if let credits = store.credits(for: product) {
                    Text("\(credits.formatted()) credit")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if !product.description.isEmpty {
                    Text(product.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            Button {
                Task { await store.purchase(product) }
            } label: {
                if store.purchasingProductID == product.id {
                    ProgressView()
                } else {
                    Text(product.displayPrice).bold()
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.purchasingProductID != nil)
        }
        .padding(.vertical, 4)
    }

    private func failedView(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text(message)
                .font(.footnote)
                .multilineTextAlignment(.center)
            Button("Thử lại") {
                Task { await store.loadProducts() }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
    }
}
