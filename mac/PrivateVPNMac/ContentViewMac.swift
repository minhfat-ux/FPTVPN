import SwiftUI

struct ContentViewMac: View {
    @EnvironmentObject private var vpnManager: VPNManagerMac

    var body: some View {
        ZStack {
            VPNThemeMac.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 20) {
                // Header
                VStack(spacing: 6) {
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(VPNThemeMac.accent)
                    Text("FPT PrivateVPN")
                        .font(.largeTitle.bold())
                        .foregroundStyle(VPNThemeMac.textPrimary)
                    Text("Private, encrypted internet from Vietnam")
                        .font(.subheadline)
                        .foregroundStyle(VPNThemeMac.textSecondary)
                }
                .padding(.top, 16)

                // Status card
                VStack(spacing: 10) {
                    Image(systemName: statusSymbol)
                        .font(.system(size: 44))
                        .foregroundStyle(statusColor)
                    Text(vpnManager.state)
                        .font(.title2.bold())
                        .foregroundStyle(statusColor)
                    if let ip = vpnManager.overlayIP {
                        Text("Tunnel IP: \(ip)")
                            .font(.footnote)
                            .foregroundStyle(VPNThemeMac.textSecondary)
                    }
                    if let error = vpnManager.lastError {
                        Text(error)
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
                    } else {
                        Task { await vpnManager.connect() }
                    }
                } label: {
                    Label(primaryButtonTitle, systemImage: primaryButtonSymbol)
                        .font(.title3.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(primaryButtonColor)
                .disabled(primaryButtonDisabled)
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
            }
            .padding(24)
            .frame(minWidth: 380, minHeight: 360)
        }
        .preferredColorScheme(.dark)
    }

    private var primaryButtonTitle: String {
        switch vpnManager.state {
        case "Disconnected", "Failed": return "Connect"
        case "Connecting…": return "Disconnecting…"
        default: return "Disconnect"
        }
    }

    private var primaryButtonSymbol: String {
        switch vpnManager.state {
        case "Disconnected", "Failed": return "network"
        default: return "network.slash"
        }
    }

    private var primaryButtonColor: Color {
        switch vpnManager.state {
        case "Disconnected", "Failed": return VPNThemeMac.accent
        default: return .red
        }
    }

    private var primaryButtonDisabled: Bool {
        vpnManager.state == "Connecting…"
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
        default: return VPNThemeMac.textSecondary
        }
    }
}

#Preview {
    ContentViewMac()
        .environmentObject(VPNManagerMac())
}
