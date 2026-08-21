import SwiftUI

struct ContentViewMac: View {
    @EnvironmentObject private var vpnManager: VPNManagerMac

    var body: some View {
        VStack(spacing: 20) {
            Text("FPT PrivateVPN")
                .font(.largeTitle.bold())

            Text(vpnManager.state)
                .font(.title2)
                .foregroundStyle(stateColor)

            if let error = vpnManager.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            Form {
                TextField("Coordinator URL", text: $vpnManager.coordinatorURL)
                    .textFieldStyle(.roundedBorder)
                SecureField("Join token", text: $vpnManager.joinToken)
                    .textFieldStyle(.roundedBorder)

                LabeledContent("Device public key") {
                    Text(vpnManager.devicePublicKey ?? "…")
                        .textSelection(.enabled)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 380)

            HStack(spacing: 16) {
                Button("Connect") {
                    Task { await vpnManager.connect() }
                }
                .buttonStyle(.borderedProminent)

                Button("Disconnect") {
                    vpnManager.disconnect()
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(32)
        .frame(minWidth: 480, minHeight: 420)
    }

    private var stateColor: Color {
        switch vpnManager.state {
        case "Connected": return .green
        case "Connecting…": return .orange
        case "Failed": return .red
        default: return .secondary
        }
    }
}

#Preview {
    ContentViewMac()
        .environmentObject(VPNManagerMac())
}
