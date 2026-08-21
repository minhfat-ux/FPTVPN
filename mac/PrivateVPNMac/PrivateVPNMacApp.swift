import SwiftUI

@main
struct PrivateVPNMacApp: App {
    @StateObject private var vpnManager = VPNManagerMac()

    var body: some Scene {
        WindowGroup {
            ContentViewMac()
                .environmentObject(vpnManager)
        }
    }
}
