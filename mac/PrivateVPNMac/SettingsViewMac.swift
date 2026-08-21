import SwiftUI

struct SettingsViewMac: View {
    @EnvironmentObject private var vpnManager: VPNManagerMac

    var body: some View {
        Form {
            Section("Connection") {
                LabeledContent("Coordinator URL") {
                    TextField("http://coordinator:port", text: $vpnManager.coordinatorURL)
                        .textFieldStyle(.roundedBorder)
                }
                LabeledContent("Join token") {
                    SecureField("(auto-fetch if empty)", text: $vpnManager.joinToken)
                        .textFieldStyle(.roundedBorder)
                }
                LabeledContent("Device public key") {
                    Text(vpnManager.devicePublicKey ?? "…")
                        .textSelection(.enabled)
                        .foregroundStyle(.secondary)
                        .font(.footnote)
                }
            }
            Text("The WireGuard private key is generated on-device and never leaves this device.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .formStyle(.grouped)
        .frame(width: 440)
        .padding()
    }
}

#Preview {
    SettingsViewMac()
        .environmentObject(VPNManagerMac())
}
