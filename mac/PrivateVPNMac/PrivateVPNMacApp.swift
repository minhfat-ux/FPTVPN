import SwiftUI

@main
struct PrivateVPNMacApp: App {
    @StateObject private var vpnManager = VPNManagerMac()
    @State private var showSettings = false

    var body: some Scene {
        // Main window with the iOS-style themed UI.
        WindowGroup {
            ContentViewMac()
                .environmentObject(vpnManager)
                .preferredColorScheme(.dark)
        }

        // Menu bar (status bar) extra: status + Connect/Disconnect/Settings/Quit.
        MenuBarExtra("FPT PrivateVPN", systemImage: menubarIcon) {
            MenuBarContent()
                .environmentObject(vpnManager)
        }
        .menuBarExtraStyle(.menu)

        // Settings window opened from the menu bar.
        Settings {
            SettingsViewMac()
                .environmentObject(vpnManager)
                .preferredColorScheme(.dark)
        }
    }

    private var menubarIcon: String {
        switch vpnManager.state {
        case "Connected": return "shield.fill"
        case "Connecting…": return "shield.lefthalf.filled"
        case "Failed": return "exclamationmark.triangle.fill"
        default: return "shield"
        }
    }
}

private struct MenuBarContent: View {
    @EnvironmentObject private var vpnManager: VPNManagerMac
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        Text("FPT PrivateVPN")
            .font(.headline)

        Divider()

        Text("Status: \(vpnManager.state)")
            .foregroundStyle(statusColor)

        Divider()

        Button("Connect") {
            Task { await vpnManager.connect() }
        }
        .disabled(vpnManager.state == "Connected")

        Button("Disconnect") {
            vpnManager.disconnect()
        }
        .disabled(vpnManager.state != "Connected" && vpnManager.state != "Connecting…")

        Divider()

        Button("Open Settings") {
            openSettings()
        }

        Divider()

        Button("Quit FPT PrivateVPN") {
            NSApplication.shared.terminate(nil)
        }
        .keyboardShortcut("q")
    }

    private var statusColor: Color {
        switch vpnManager.state {
        case "Connected": return .green
        case "Connecting…": return .orange
        case "Failed": return .red
        default: return .secondary
        }
    }
}
