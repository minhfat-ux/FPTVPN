import Foundation
import NetworkExtension
import UIKit
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

    func connect(store: VPNConfigStore) async {
        do {
            let config: WireGuardConfig
            if let baseURL = store.controlPlaneBaseURL {
                config = try await provisionViaControlPlane(store: store, baseURL: baseURL)
            } else {
                config = try makeConfig(store: store)
            }
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
    func refreshDevicePublicKey() {
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

    // MARK: - Coordinator provisioning

    /// Fetches the available exit nodes from the coordinator (for the picker).
    func fetchNodes(store: VPNConfigStore) async {
        guard let baseURL = store.controlPlaneBaseURL else { return }
        let client = ControlAPIClient(baseURL: baseURL, joinToken: store.controlPlaneToken)
        do {
            let nodes = try await client.fetchNodes()
            store.remoteNodes = nodes
            if store.selectedNodeID == nil, let first = nodes.first {
                store.selectedNodeID = first.id
                store.serverEndpoint = first.endpoint ?? ""
                store.serverPublicKey = first.serverPublicKey ?? ""
            }
        } catch {
            // Non-fatal: fall back to local presets / manual config.
        }
    }

    /// Registers this device with the PrivateVPN coordinator to obtain its
    /// overlay IP, then builds a WireGuard config that connects to the VPS
    /// exit node (103.173.155.50) for Internet egress.
    private func provisionViaControlPlane(store: VPNConfigStore, baseURL: URL) async throws -> WireGuardConfig {
        let privateKey = try KeychainStore.obtainOrCreatePrivateKey()
        devicePublicKey = privateKey.publicKey.base64Key

        let client = ControlAPIClient(
            baseURL: baseURL,
            joinToken: store.controlPlaneToken
        )
        let response = try await client.register(
            name: "ios-device",
            platform: "ios",
            wireguardPublicKey: privateKey.publicKey.base64Key,
            endpoint: "0.0.0.0:51820"  // outbound-only client; placeholder
        )

        // Connect to the VPS exit node. Static config — the exit node is the
        // same VPS that runs the coordinator (103.173.155.50, WireGuard :443).
        let exitEndpoint = store.serverEndpoint.isEmpty ? "103.173.155.50:443" : store.serverEndpoint
        let exitPublicKey = store.serverPublicKey.isEmpty ? "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=" : store.serverPublicKey

        return WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: privateKey.base64Key,
            addresses: ["\(response.overlay_ip)/24"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: exitPublicKey,
                    endpoint: exitEndpoint,
                    allowedIPs: ["0.0.0.0/0", "::/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )
    }

    // MARK: - Configuration

    func makeConfig(store: VPNConfigStore) throws -> WireGuardConfig {
        guard store.isConfigured else {
            throw ConfigError.notConfigured
        }

        let privateKey = try KeychainStore.obtainOrCreatePrivateKey()
        devicePublicKey = privateKey.publicKey.base64Key

        let addresses = store.tunnelAddress
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        let dns = store.dnsServers
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        let allowedIPs = store.allowedIPs
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }

        let config = WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: privateKey.base64Key,
            addresses: addresses,
            dnsServers: dns,
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: store.serverPublicKey.trimmingCharacters(in: .whitespaces),
                    endpoint: store.serverEndpoint.trimmingCharacters(in: .whitespaces),
                    allowedIPs: allowedIPs,
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )
        return config
    }

    enum ConfigError: LocalizedError {
        case notConfigured

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                return "Enter the server endpoint and peer public key in Configuration first."
            }
        }
    }

    private func prepareConfiguration(_ config: WireGuardConfig) async throws {
        try await manager.loadFromPreferences()

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
