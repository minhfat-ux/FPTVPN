import SwiftUI

@main
struct PrivateVPNApp: App {
    @StateObject private var vpnManager = VPNManager()
    @StateObject private var configStore = VPNConfigStore()
    @StateObject private var subscriptionStore = SubscriptionStore()
    @StateObject private var languageStore = AppLanguageStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(vpnManager)
                .environmentObject(configStore)
                .environmentObject(subscriptionStore)
                .environmentObject(languageStore)
        }
    }
}
