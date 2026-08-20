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

    // MARK: - Control plane provisioning

    /// Registers the device with the control plane and builds a config from the
    /// provisioned response (server assigns IP + endpoint automatically).
    private func provisionViaControlPlane(store: VPNConfigStore, baseURL: URL) async throws -> WireGuardConfig {
        let privateKey = try KeychainStore.obtainOrCreatePrivateKey()
        devicePublicKey = privateKey.publicKey.base64Key

        let client = ControlAPIClient(baseURL: baseURL, authToken: store.controlPlaneToken.isEmpty ? nil : store.controlPlaneToken)
        let response = try await client.register(
            publicKey: privateKey.publicKey.base64Key,
            deviceName: UIDevice.current.name,
            deviceId: try DeviceIdentity.deviceID().uuidString,
            platform: "ios"
        )

        let config = ProvisionedConfig(
            serverPublicKey: response.config.serverPublicKey,
            endpoint: response.config.endpoint,
            address: response.config.address,
            dns: response.config.dns,
            allowedIPs: response.config.allowedIPs,
            persistentKeepalive: response.config.persistentKeepalive
        )
        return try config.makeWireGuardConfig(privateKey: privateKey)
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
