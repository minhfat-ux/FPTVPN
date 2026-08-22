import AppKit
import SwiftUI

struct ContentViewMac: View {
    @EnvironmentObject private var vpnManager: VPNManagerMac
    @EnvironmentObject private var subscriptionStore: MacSubscriptionStore
    @EnvironmentObject private var languageStore: AppLanguageStore
    @State private var showingPaywall = false

    var body: some View {
        ZStack {
            VPNThemeMac.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 20) {
                // Header
                VStack(spacing: 6) {
                    Image(nsImage: NSApplication.shared.applicationIconImage)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 76, height: 76)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .shadow(color: .black.opacity(0.28), radius: 14, y: 8)
                    Text("FlowVPN")
                        .font(.largeTitle.bold())
                        .foregroundStyle(VPNThemeMac.textPrimary)
                    Text(languageStore.t(.appSubtitle))
                        .font(.subheadline)
                        .foregroundStyle(VPNThemeMac.textSecondary)
                }
                .padding(.top, 16)

                subscriptionStatusCard
                serverSelectionCard

                // Status card
                VStack(spacing: 10) {
                    Image(systemName: statusSymbol)
                        .font(.system(size: 44))
                        .foregroundStyle(statusColor)
                    Text(vpnManager.state.localizedVPNState(languageStore.language))
                        .font(.title2.bold())
                        .foregroundStyle(statusColor)
                    if vpnManager.state == "Connecting…" {
                        Text("Preparing VPN permission…")
                            .font(.footnote)
                            .foregroundStyle(VPNThemeMac.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                    if vpnManager.state == "Failed" {
                        VStack(spacing: 4) {
                            Text(languageStore.t(.vpnStartFailure))
                            if let lastError = vpnManager.lastError, !lastError.isEmpty {
                                Text(lastError)
                                    .lineLimit(3)
                            }
                        }
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(20)
                .background(VPNThemeMac.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
                )

                Spacer()

                // Primary toggle button: Connect when disconnected, Disconnect when connected.
                Button {
                    if vpnManager.state == "Connected" || vpnManager.state == "Connecting…" {
                        vpnManager.disconnect()
                    } else if !subscriptionStore.isSubscribed {
                        showingPaywall = true
                    } else {
                        Task { await vpnManager.connect() }
                    }
                } label: {
                    Image(systemName: "power")
                        .font(.system(size: 44, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 132, height: 132)
                        .background(
                            Circle()
                                .fill(primaryButtonColor)
                                .shadow(color: primaryButtonColor.opacity(0.45), radius: 22, y: 10)
                        )
                        .overlay(
                            Circle()
                                .stroke(.white.opacity(0.22), lineWidth: 1)
                        )
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(primaryButtonDisabled)
                .opacity(primaryButtonDisabled ? 0.72 : 1)
                .padding(.bottom, 16)
            }
            .padding(24)
            .frame(width: 390, height: 760)
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showingPaywall) {
            MacPaywallView()
                .environmentObject(subscriptionStore)
                .environmentObject(languageStore)
        }
        .task {
            await subscriptionStore.start()
            await vpnManager.refreshNodes()
        }
    }

    private var subscriptionStatusCard: some View {
        HStack(spacing: 14) {
            Image(systemName: subscriptionStore.isSubscribed ? "checkmark.seal.fill" : "lock.shield.fill")
                .font(.title3)
                .foregroundStyle(subscriptionStore.isSubscribed ? VPNThemeMac.accent : .orange)

            VStack(alignment: .leading, spacing: 3) {
                Text(subscriptionStore.isSubscribed ? languageStore.t(.premiumActive) : languageStore.t(.premiumRequired))
                    .font(.headline)
                    .foregroundStyle(VPNThemeMac.textPrimary)
                Text(subscriptionStore.isSubscribed ? languageStore.t(.protectionUnlocked) : languageStore.t(.choosePlanToStart))
                    .font(.subheadline)
                    .foregroundStyle(VPNThemeMac.textSecondary)
            }

            Spacer()

            if !subscriptionStore.isSubscribed {
                Button {
                    showingPaywall = true
                } label: {
                    Text(languageStore.t(.upgrade))
                        .font(.subheadline.bold())
                        .foregroundStyle(.black)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(VPNThemeMac.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(VPNThemeMac.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
        )
    }

    private var serverSelectionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.title3)
                    .foregroundStyle(VPNThemeMac.accent)

                Text(languageStore.t(.serverLocation))
                    .font(.headline)
                    .foregroundStyle(VPNThemeMac.textPrimary)

                Spacer()

                Button {
                    Task { await vpnManager.refreshNodes() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
                .foregroundStyle(VPNThemeMac.textSecondary)
                .disabled(vpnManager.isRefreshingNodes || isConnectionTransitioning)
                .help(languageStore.t(.refreshLocations))
            }

            if vpnManager.exitNodes.isEmpty {
                Text(vpnManager.isRefreshingNodes ? languageStore.t(.loadingLocations) : languageStore.t(.noServerAvailable))
                    .font(.subheadline)
                    .foregroundStyle(VPNThemeMac.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Picker(languageStore.t(.serverLocation), selection: Binding(
                    get: { vpnManager.selectedNodeID ?? vpnManager.exitNodes.first?.id ?? "" },
                    set: { vpnManager.selectedNodeID = $0 }
                )) {
                    ForEach(vpnManager.exitNodes) { node in
                        Text(serverTitle(for: node)).tag(node.id)
                    }
                }
                .labelsHidden()
                .disabled(isConnectionTransitioning)
            }
        }
        .padding(16)
        .background(VPNThemeMac.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
        )
    }

    private var primaryButtonColor: Color {
        switch vpnManager.state {
        case "Connected":
            return VPNThemeMac.accent
        case "Connecting…", "Disconnecting…":
            return .orange
        default:
            return .red
        }
    }

    private var primaryButtonDisabled: Bool {
        isConnectionTransitioning || (vpnManager.state != "Connected" && vpnManager.exitNodes.isEmpty)
    }

    private var isConnectionTransitioning: Bool {
        vpnManager.state == "Connecting…" || vpnManager.state == "Disconnecting…"
    }

    private func serverTitle(for node: ExitNode) -> String {
        "\(node.city), \(node.country) · \(node.name)"
    }

    private var statusSymbol: String {
        switch vpnManager.state {
        case "Connected": return "checkmark.shield.fill"
        case "Connecting…": return "shield.lefthalf.filled"
        case "Failed": return "exclamationmark.triangle.fill"
        default: return "shield.slash.fill"
        }
    }

    private var statusColor: Color {
        switch vpnManager.state {
        case "Connected": return VPNThemeMac.accent
        case "Connecting…": return .orange
        case "Failed": return .red
        default: return .red
        }
    }
}

#Preview {
    ContentViewMac()
        .environmentObject(VPNManagerMac())
        .environmentObject(MacSubscriptionStore())
        .environmentObject(AppLanguageStore())
}
