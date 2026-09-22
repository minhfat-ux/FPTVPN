import SwiftUI

/// Điểm vào app fBuddy iOS.
///
/// App này là **vỏ native** quanh web fBuddy (`fbuddy.meetflowai.site`) cộng đúng một
/// tầng nghiệp vụ native: **StoreKit 2 mua credit dạng consumable**. Mọi lối mua khác
/// (trang nạp token bằng chuyển khoản của web) bị chặn — xem `WebGate`, `WebGateScript`
/// và `APPSTORE_CHECKLIST.md` mục 3.1.1.
@main
struct FBuddyApp: App {
    @StateObject private var store = StoreKitManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                // Nạp danh mục + giao giao dịch còn dang dở (server lỗi lần trước).
                .task { await store.start() }
        }
    }
}
