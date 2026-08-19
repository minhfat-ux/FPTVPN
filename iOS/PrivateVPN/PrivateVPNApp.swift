import SwiftUI

@main
struct PrivateVPNApp: App {
    @StateObject private var vpnManager = VPNManager()
    @StateObject private var configStore = VPNConfigStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(vpnManager)
                .environmentObject(configStore)
        }
    }
}
