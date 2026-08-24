import SwiftUI
import AppKit

/// App delegate: tắt VPN tunnel khi quit app (Cmd+Q).
final class PrivateVPNMacAppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillTerminate(_ notification: Notification) {
        VPNManagerMac.sharedForTerminate?.disconnect()
    }
}

@main
struct PrivateVPNMacApp: App {
    @NSApplicationDelegateAdaptor(PrivateVPNMacAppDelegate.self) private var appDelegate
    @StateObject private var vpnManager = VPNManagerMac()
    @StateObject private var subscriptionStore = MacSubscriptionStore()
    @StateObject private var authStore = AuthSessionStore()
    @StateObject private var languageStore = AppLanguageStore()
    @State private var showSettings = false

    var body: some Scene {
        // Main window with the iOS-style themed UI.
        WindowGroup {
            ContentViewMac()
                .environmentObject(vpnManager)
                .environmentObject(subscriptionStore)
                .environmentObject(authStore)
                .environmentObject(languageStore)
                .preferredColorScheme(.dark)
        }
        .windowResizability(.contentSize)

        // Menu bar (status bar) extra: status + Connect/Disconnect/Settings/Quit.
        MenuBarExtra("FlowVPN", systemImage: menubarIcon) {
            MenuBarContent()
                .environmentObject(vpnManager)
                .environmentObject(subscriptionStore)
                .environmentObject(authStore)
                .environmentObject(languageStore)
        }
        .menuBarExtraStyle(.menu)

        // Settings window opened from the menu bar.
        Settings {
            SettingsViewMac()
                .environmentObject(vpnManager)
                .environmentObject(subscriptionStore)
                .environmentObject(authStore)
                .environmentObject(languageStore)
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
    @EnvironmentObject private var subscriptionStore: MacSubscriptionStore
    @EnvironmentObject private var authStore: AuthSessionStore
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        Text("VPNFlow")
            .font(.headline)

        Divider()

        Text("\(languageStore.t(.status)): \(vpnManager.state.localizedVPNState(languageStore.language))")
            .foregroundStyle(statusColor)

        Text("\(languageStore.t(.plan)): \(subscriptionStore.isSubscribed ? subscriptionStore.activePlanName : languageStore.t(.free))")

        Divider()

        // Server submenu — native macOS style: checkmark on the selected server.
        if vpnManager.exitNodes.isEmpty {
            Text(vpnManager.isRefreshingNodes ? languageStore.t(.loadingLocations) : languageStore.t(.noServerAvailable))
                .foregroundStyle(.secondary)
        } else {
            Menu(languageStore.t(.serverLocation)) {
                ForEach(vpnManager.exitNodes) { node in
                    Button {
                        vpnManager.selectedNodeID = node.id
                    } label: {
                        if vpnManager.selectedNodeID == node.id {
                            Label(serverTitle(for: node), systemImage: "checkmark")
                        } else {
                            Text(serverTitle(for: node))
                        }
                    }
                    .disabled(isBusy)
                }
            }

            Button(languageStore.t(.refreshLocations)) {
                Task { await vpnManager.refreshNodes() }
            }
            .disabled(vpnManager.isRefreshingNodes || isBusy)
        }

        Divider()

        Button(languageStore.t(.connect)) {
            if subscriptionStore.isSubscribed {
                Task { await vpnManager.connect(authStore: authStore) }
            } else {
                openSettings()
            }
        }
        .disabled(vpnManager.state == "Connected" || isBusy || vpnManager.exitNodes.isEmpty)

        if !subscriptionStore.isSubscribed {
            Button(languageStore.t(.upgradeToPremium)) {
                openSettings()
            }
        }

        Button(languageStore.t(.disconnect)) {
            vpnManager.disconnect()
        }
        .disabled(vpnManager.state != "Connected" && vpnManager.state != "Connecting…")

        Divider()

        Button(languageStore.t(.openSettings)) {
            openSettings()
        }

        Button(languageStore.t(.restorePurchases)) {
            Task {
                await subscriptionStore.restorePurchases()
            }
        }
        .disabled(subscriptionStore.isLoading)

        Divider()

        Button(languageStore.t(.quit)) {
            NSApplication.shared.terminate(nil)
        }
        .keyboardShortcut("q")
    }

    private var isBusy: Bool {
        vpnManager.state == "Connecting…" || vpnManager.state == "Disconnecting…"
    }

    private var statusColor: Color {
        switch vpnManager.state {
        case "Connected": return .green
        case "Connecting…": return .orange
        case "Failed": return .red
        default: return .secondary
        }
    }

    private func serverTitle(for node: ExitNode) -> String {
        "\(node.city), \(node.country) · \(node.name)"
    }
}
