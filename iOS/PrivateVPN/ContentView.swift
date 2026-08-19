import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var vpnManager: VPNManager

    var body: some View {
        VStack(spacing: 24) {
            Text("FPT PrivateVPN")
                .font(.largeTitle.bold())

            Text(vpnManager.state.label)
                .font(.title2)
                .foregroundStyle(stateColor)

            if let error = vpnManager.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task {
                    await vpnManager.connect()
                }
            } label: {
                Label("Connect", systemImage: "network")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!vpnManager.state.canConnect)

            Button {
                vpnManager.disconnect()
            } label: {
                Label("Disconnect", systemImage: "network.slash")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(!vpnManager.state.canDisconnect)

            Text("Vietnam (VN) — Hanoi")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(32)
        .task {
            vpnManager.refreshStatus()
        }
    }

    private var stateColor: Color {
        switch vpnManager.state {
        case .connected: return .green
        case .connecting, .disconnecting: return .orange
        case .failed: return .red
        case .disconnected: return .secondary
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(VPNManager())
}
