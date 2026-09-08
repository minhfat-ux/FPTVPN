import SwiftUI
import UIKit

/// App delegate: tắt VPN tunnel khi app chuẩn bị thoát (best effort — iOS
/// swipe-kill không gọi applicationWillTerminate đáng tin cậy, nhưng bắt được
/// các trường hợp hệ thống kết thúc app).
final class PrivateVPNAppDelegate: NSObject, UIApplicationDelegate {
    func applicationWillTerminate(_ application: UIApplication) {
        VPNManager.sharedForTerminate?.disconnect()
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
