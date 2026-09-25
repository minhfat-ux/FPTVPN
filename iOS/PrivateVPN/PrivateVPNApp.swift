import SwiftUI
import UIKit

/// App delegate: tắt VPN tunnel khi app chuẩn bị thoát.
///
/// 26/09/2026 — chủ dự án chốt **tắt app = thoát VPN**. Vì profile nay bật on-demand (để iOS tự
/// dựng lại extension khi bị giết vì bộ nhớ), phải tắt on-demand **đồng bộ** trước khi tiến trình
/// chết — xem `VPNManager.shutdownForTermination`. Bản cũ gọi `disconnect()` (chạy trong `Task`),
/// mà Task đó không bao giờ chạy khi `applicationWillTerminate` trả về.
///
/// ⚠️ Giới hạn đã biết của iOS: swipe-kill từ app switcher **không** gọi `applicationWillTerminate`
/// một cách đáng tin cậy. Khi callback không được gọi thì không có cách nào tắt on-demand từ app;
/// xem báo cáo `.privatevpn/reports/2026-09-26-ios-selfdisconnect-review.md` §7.
final class PrivateVPNAppDelegate: NSObject, UIApplicationDelegate {
    func applicationWillTerminate(_ application: UIApplication) {
        VPNManager.sharedForTerminate?.shutdownForTermination()
    }
}

@main
struct PrivateVPNApp: App {
    @UIApplicationDelegateAdaptor(PrivateVPNAppDelegate.self) private var appDelegate
    @StateObject private var vpnManager = VPNManager()
    @StateObject private var configStore = VPNConfigStore()
    @StateObject private var subscriptionStore = SubscriptionStore()
    @StateObject private var authStore = AuthSessionStore()
    @StateObject private var languageStore = AppLanguageStore()

    init() {
        // Đổi mạng (Wi-Fi ⇄ 4G) ⇒ quên host control-plane đang sticky để thử lại host chính.
        ControlAPIHosts.startNetworkMonitoring()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(vpnManager)
                .environmentObject(configStore)
                .environmentObject(subscriptionStore)
                .environmentObject(authStore)
                .environmentObject(languageStore)
                .preferredColorScheme(.dark)   // app is always dark (FlowVPN navy)
                .onOpenURL { _ in
                    // Deep link (vpnflow://open or universal link): the app is
                    // already signed-in aware; bringing it to front is enough.
                    // (Content shows login if needed.)
                }
        }
    }
}
