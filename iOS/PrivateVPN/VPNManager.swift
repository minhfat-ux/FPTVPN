import Foundation
import NetworkExtension
import WireGuardKit

@MainActor
final class VPNManager: ObservableObject {
    static let providerBundleIdentifier = "com.privatevpn.app.packet-tunnel"

    @Published private(set) var state: VPNState = .disconnected
    @Published private(set) var lastError: String?
    @Published private(set) var devicePublicKey: String?

    private let manager = NEVPNManager.shared()
    nonisolated(unsafe) private var statusObserver: NSObjectProtocol?

    init() {
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.refreshStatus()
            }
        }
        refreshStatus()
        refreshDevicePublicKey()
    }

    deinit {
        if let statusObserver {
            NotificationCenter.default.removeObserver(statusObserver)
        }
    }

    func refreshStatus() {
        state = VPNState(networkStatus: manager.connection.status)
    }

    func connect() async {
        do {
            let config = try await makeConfig()
            try await prepareConfiguration(config)
            try manager.connection.startVPNTunnel()
            lastError = nil
            refreshStatus()
        } catch {
            state = .failed
            lastError = error.localizedDescription
        }
    }

    func disconnect() {
        manager.connection.stopVPNTunnel()
        refreshStatus()
    }

    // MARK: - Device / keypair

    /// Loads (or creates) the device WireGuard keypair and exposes the public key.
    private func refreshDevicePublicKey() {
        do {
            if let publicKey = try KeychainStore.loadPublicKey() {
                devicePublicKey = publicKey.base64Key
            } else {
                let privateKey = try KeychainStore.obtainOrCreatePrivateKey()
                devicePublicKey = privateKey.publicKey.base64Key
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Configuration

    private func makeConfig() async throws -> WireGuardConfig {
        let privateKey = try KeychainStore.obtainOrCreatePrivateKey()
        let publicKey = privateKey.publicKey.base64Key
        devicePublicKey = publicKey

        // TODO(GATE 2+): replace with server-provisioned values from the control
        // plane (Tailscale-style device registration). Placeholders below stand
        // in until a real Vietnam node endpoint + peer public key is provided.
        let config = WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: privateKey.base64Key,
            addresses: ["10.80.0.2/32"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: "",
                    endpoint: "",
                    allowedIPs: ["0.0.0.0/0", "::/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )
        return config
    }

    private func prepareConfiguration(_ config: WireGuardConfig) async throws {
        try await manager.loadFromPreferences()
        guard manager.protocolConfiguration == nil else { return }

        let protocolConfig = NETunnelProviderProtocol()
        protocolConfig.providerBundleIdentifier = Self.providerBundleIdentifier
        protocolConfig.serverAddress = config.peers.first?.endpoint ?? "not-configured"
        protocolConfig.providerConfiguration = [
            "wireguard": try JSONEncoder().encode(config),
        ]

        manager.protocolConfiguration = protocolConfig
        manager.localizedDescription = "PrivateVPN"
        manager.isEnabled = true
        try await manager.saveToPreferences()
    }
}
