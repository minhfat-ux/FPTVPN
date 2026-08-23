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
        }
    }
}
