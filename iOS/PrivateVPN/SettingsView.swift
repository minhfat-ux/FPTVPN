import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var configStore: VPNConfigStore
    @EnvironmentObject private var vpnManager: VPNManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("Server location") {
                Picker("Location", selection: $configStore.selectedLocationID) {
                    ForEach(VPNLocation.presets) { location in
                        Text("\(location.name) — \(location.city), \(location.country)")
                            .tag(location.id as UUID?)
                    }
                }
                .pickerStyle(.menu)
                .onChange(of: configStore.selectedLocationID) { _, newValue in
                    if let loc = VPNLocation.presets.first(where: { $0.id == newValue }) {
                        configStore.serverEndpoint = "\(loc.host):\(loc.port)"
                    }
                }

                if let loc = configStore.selectedLocation {
                    LabeledContent("Endpoint") {
                        Text("\(loc.host):\(loc.port)")
                            .multilineTextAlignment(.trailing)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Server") {
                LabeledContent("Device public key", value: vpnManager.devicePublicKey ?? "…")
                    .font(.footnote)
                    .textSelection(.enabled)

                LabeledContent("WireGuard address") {
                    TextField("10.80.0.2/32", text: $configStore.tunnelAddress)
                        .multilineTextAlignment(.trailing)
                        .keyboardType(.numbersAndPunctuation)
                }

                LabeledContent("DNS") {
                    TextField("1.1.1.1", text: $configStore.dnsServers)
                        .multilineTextAlignment(.trailing)
                        .keyboardType(.numbersAndPunctuation)
                }
            }

            Section("Peer (Vietnam node)") {
                LabeledContent("Endpoint") {
                    TextField("host:port", text: $configStore.serverEndpoint)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }

                LabeledContent("Public key") {
                    TextField("base64 peer key", text: $configStore.serverPublicKey)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                LabeledContent("Allowed IPs") {
                    TextField("0.0.0.0/0, ::/0", text: $configStore.allowedIPs)
                        .multilineTextAlignment(.trailing)
                        .autocorrectionDisabled()
                }
            }

            if !configStore.isConfigured {
                Section {
                    Label("Enter the server endpoint and peer public key to enable Connect.",
                          systemImage: "info.circle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Configuration")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
        .onAppear {
            vpnManager.refreshDevicePublicKey()
        }
    }
}
