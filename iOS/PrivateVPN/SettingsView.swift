import SwiftUI

/// Configuration screen: control plane (URL/token), location picker and
/// manual server/peer fields. Functionality unchanged — visual style now
/// matches the main screen theme.
struct SettingsView: View {
    @EnvironmentObject private var configStore: VPNConfigStore
    @EnvironmentObject private var vpnManager: VPNManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            controlPlaneSection
            locationSection
            serverSection
            peerSection

            if !configStore.isConfigured {
                Section {
                    Label("Enter the server endpoint and peer public key to enable Connect.",
                          systemImage: "info.circle")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.6))
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(VPNTheme.backgroundGradient.ignoresSafeArea())
        .tint(VPNTheme.accent)
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

    private func applyLocation(_ id: UUID?) {
        guard let loc = VPNLocation.presets.first(where: { $0.id == id }) else { return }
        configStore.serverEndpoint = "\(loc.host):\(loc.port)"
        configStore.serverPublicKey = loc.publicKey
        configStore.tunnelAddress = loc.clientAddress
    }

    private var controlPlaneSection: some View {
        Section {
            LabeledContent("Control plane URL") {
                TextField("https://host:8080", text: $configStore.controlPlaneURL)
                    .multilineTextAlignment(.trailing)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
            }

            LabeledContent("Auth token") {
                TextField("(optional)", text: $configStore.controlPlaneToken)
                    .multilineTextAlignment(.trailing)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            Text(configStore.hasControlPlane
                 ? "Devices are registered automatically; endpoint & peer key are filled in."
                 : "Leave blank to configure the server manually below.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.55))
        } header: {
            Text("Control plane (auto-provision)")
        } footer: {
            Text("Sign-in / device authorization is a future release — entering a URL enables automatic provisioning.")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.4))
        }
    }

    private var locationSection: some View {
        Section("Server location") {
            if configStore.remoteNodes.isEmpty {
                Button {
                    Task { await vpnManager.fetchNodes(store: configStore) }
                } label: {
                    Label("Refresh locations from control plane", systemImage: "arrow.triangle.2.circlepath")
                }
                .disabled(!configStore.hasControlPlane)
            }

            Picker("Location", selection: $configStore.selectedNodeID) {
                ForEach(configStore.availableNodes) { node in
                    Text("\(node.name) — \(node.city), \(node.country)")
                        .tag(node.id as String?)
                }
            }
            .pickerStyle(.menu)
            .onChange(of: configStore.selectedNodeID) { _, newValue in
                applyNode(newValue)
            }

            if let node = configStore.selectedRemoteNode {
                LabeledContent("Endpoint", value: node.endpoint)
                    .multilineTextAlignment(.trailing)
            }
        }
    }

    private func applyNode(_ id: String?) {
        guard let node = configStore.availableNodes.first(where: { $0.id == id }) else { return }
        configStore.serverEndpoint = node.endpoint
        configStore.serverPublicKey = node.public_key
    }

    private var serverSection: some View {
        Section {
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
        } footer: {
            Text("The WireGuard private key is generated on-device and never leaves this device.")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.4))
        }
    }

    private var peerSection: some View {
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
    }
}
