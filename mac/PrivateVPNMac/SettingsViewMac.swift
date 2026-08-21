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

            Section("Exit node") {
                Picker("Server", selection: $vpnManager.selectedNodeID) {
                    ForEach(vpnManager.exitNodes) { node in
                        Text("\(node.name) — \(node.city), \(node.country)")
                            .tag(node.id as String?)
                    }
                }
                .disabled(vpnManager.exitNodes.isEmpty)

                if vpnManager.exitNodes.isEmpty {
                    Label("No servers from coordinator yet.", systemImage: "network.slash")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Button("Refresh servers") {
                    Task { await vpnManager.refreshNodes() }
                }
            }

            Text("The WireGuard private key is generated on-device and never leaves this device.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .padding()
        .task {
            if vpnManager.exitNodes.isEmpty {
                await vpnManager.refreshNodes()
            }
        }
    }
}

#Preview {
    SettingsViewMac()
        .environmentObject(VPNManagerMac())
}
