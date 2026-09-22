import SwiftUI

/// Màn hình chính: thanh công cụ native ở trên + web fBuddy ở dưới.
///
/// Nút "Nạp credit" LUÔN mở store IAP native (`CreditStoreView`) — không bao giờ mở
/// trang web nạp token. Đó là yêu cầu của App Store guideline 3.1.1.
struct ContentView: View {
    @EnvironmentObject private var store: StoreKitManager

    /// Web fBuddy. Đổi ở một chỗ để dễ trỏ sang staging khi test.
    private let startURL = URL(string: "https://fbuddy.meetflowai.site")!

    @State private var reloadToken = 0
    @State private var isSharing = false

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            WebView(
                startURL: startURL,
                reloadToken: reloadToken,
                onPurchaseIntent: openCreditStore
            )
            if let notice = store.notice {
                noticeBar(notice)
            }
        }
        .sheet(isPresented: $store.isStorePresented) {
            CreditStoreView().environmentObject(store)
        }
        .sheet(isPresented: $isSharing) {
            ShareSheet(items: [startURL])
        }
    }

    // MARK: - Thành phần

    private var toolbar: some View {
        HStack(spacing: 16) {
            Text("fBuddy")
                .font(.headline)

            Spacer()

            Button(action: openCreditStore) {
                Label("Nạp credit", systemImage: "creditcard")
                    .labelStyle(.titleAndIcon)
            }
            .accessibilityIdentifier("openCreditStore")

            Button {
                isSharing = true
            } label: {
                Image(systemName: "square.and.arrow.up")
            }
            .accessibilityLabel("Chia sẻ")

            Button {
                reloadToken += 1
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .accessibilityLabel("Tải lại")
        }
        .font(.subheadline)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private func noticeBar(_ notice: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "info.circle")
            Text(notice)
                .font(.footnote)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                store.clearNotice()
            } label: {
                Image(systemName: "xmark")
            }
            .accessibilityLabel("Đóng thông báo")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.thinMaterial)
    }

    private func openCreditStore() {
        store.isStorePresented = true
    }
}
