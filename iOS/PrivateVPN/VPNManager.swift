import Foundation
import NetworkExtension
import os
import UIKit
import WireGuardKit

@MainActor
final class VPNManager: ObservableObject {
    static let providerBundleIdentifier = "com.privatevpn.app.packet-tunnel"

    private let log = Logger(subsystem: "com.privatevpn.app", category: "vpn-manager")

    @Published private(set) var state: VPNState = .disconnected
    @Published private(set) var lastError: String?
    @Published private(set) var statusMessage: String?
    @Published private(set) var devicePublicKey: String?

    private var manager: NETunnelProviderManager?
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
        Task {
            await loadManagerFromPreferences()
        }
    }

    deinit {
        if let statusObserver {
            NotificationCenter.default.removeObserver(statusObserver)
        }
    }

    func refreshStatus() {
        guard let connection = manager?.connection else {
            state = .disconnected
            statusMessage = nil
            return
        }
        state = VPNState(networkStatus: connection.status)
        switch connection.status {
        case .connected, .disconnected:
            statusMessage = nil
        case .invalid:
            statusMessage = "VPN profile is not ready. Reinstall the VPN profile and try again."
        default:
            break
        }
    }

    func connect(store: VPNConfigStore, authStore: AuthSessionStore) async {
        do {
            let config: WireGuardConfig
            if let baseURL = store.controlPlaneBaseURL {
                config = try await provisionViaControlPlane(store: store, authStore: authStore, baseURL: baseURL)
            } else {
                config = try makeConfig(store: store)
            }
            try await prepareConfiguration(config)
            state = .connecting
            try manager?.connection.startVPNTunnel()
            lastError = nil
            statusMessage = nil
        } catch {
            state = .failed
            lastError = error.localizedDescription
            statusMessage = Self.userMessage(for: error)
            let ns = error as NSError
            log.error("connect failed: \(error.localizedDescription, privacy: .public) [domain=\(ns.domain, privacy: .public) code=\(ns.code)]")
            NSLog("iOSVPN: connect failed: \(error.localizedDescription) [\(ns.domain) \(ns.code)]")
        }
    }

    func disconnect() {
        manager?.connection.stopVPNTunnel()
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
                store.serverEndpoint = first.endpoint
                store.serverPublicKey = first.public_key
            }
        } catch {
            // Non-fatal: fall back to local presets / manual config.
        }
    }

    /// Registers this device with the PrivateVPN coordinator to obtain its
    /// overlay IP, then builds a WireGuard config that connects to the VPS
    /// exit node (103.173.155.50) for Internet egress.
    private func provisionViaControlPlane(store: VPNConfigStore, authStore: AuthSessionStore, baseURL: URL) async throws -> WireGuardConfig {
        let privateKey = try KeychainStore.obtainOrCreatePrivateKey()
        devicePublicKey = privateKey.publicKey.base64Key

        let deviceName = try registrationName()
        let bootstrap = ControlAPIClient(baseURL: baseURL, joinToken: "")
        guard let accessToken = authStore.accessToken else {
            throw ControlAPIClient.ClientError.missingSession
        }
        let joinToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
        store.controlPlaneToken = ""

        let response: CoordinatorRegisterResponse
        do {
            response = try await registerDevice(
                baseURL: baseURL,
                joinToken: joinToken,
                name: deviceName,
                publicKey: privateKey.publicKey.base64Key,
                accessToken: accessToken
            )
        } catch ControlAPIClient.ClientError.server(let message) where message.localizedCaseInsensitiveContains("name") {
            let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
            response = try await registerDevice(
                baseURL: baseURL,
                joinToken: retryToken,
                name: Self.randomRegistrationName(),
                publicKey: privateKey.publicKey.base64Key,
                accessToken: accessToken
            )
        } catch ControlAPIClient.ClientError.server {
            let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
            response = try await registerDevice(
                baseURL: baseURL,
                joinToken: retryToken,
                name: deviceName,
                publicKey: privateKey.publicKey.base64Key,
                accessToken: accessToken
            )
        }

        let exitNode = try await selectedExitNode(store: store, client: bootstrap)

        return WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: privateKey.base64Key,
            addresses: ["\(response.overlay_ip)/24"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: exitNode.public_key,
                    endpoint: exitNode.endpoint,
                    allowedIPs: ["0.0.0.0/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )
    }

    private func selectedExitNode(store: VPNConfigStore, client: ControlAPIClient) async throws -> ExitNode {
        let nodes = try await client.fetchNodes()
        if !nodes.isEmpty {
            store.remoteNodes = nodes
            let selected = nodes.first { $0.id == store.selectedNodeID } ?? nodes.first!
            store.selectedNodeID = selected.id
            store.serverEndpoint = selected.endpoint
            store.serverPublicKey = selected.public_key
            return selected
        }

        return ExitNode(
            id: "vietnam-1",
            name: "Vietnam",
            country: "VN",
            city: "Hanoi",
            endpoint: "103.173.155.50:443",
            public_key: "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8="
        )
    }

    private func registrationName() throws -> String {
        "ios-\(try DeviceIdentity.deviceID().uuidString.prefix(8).lowercased())"
    }

    private static func randomRegistrationName() -> String {
        "ios-\(UUID().uuidString.prefix(8).lowercased())"
    }

    private func registerDevice(baseURL: URL, joinToken: String, name: String, publicKey: String, accessToken: String) async throws -> CoordinatorRegisterResponse {
        let client = ControlAPIClient(baseURL: baseURL, joinToken: joinToken)
        return try await client.register(
            name: name,
            platform: "ios",
            wireguardPublicKey: publicKey,
            endpoint: "0.0.0.0:51820",  // outbound-only client; placeholder
            accessToken: accessToken
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
        let existing = try await NETunnelProviderManager.loadAllFromPreferences()
        let matching = existing.filter { $0.localizedDescription == "FlowVPN" }
        let manager = matching.first ?? NETunnelProviderManager()

        for old in matching.dropFirst() {
            try? await old.removeFromPreferences()
        }

        let protocolConfig = NETunnelProviderProtocol()
        protocolConfig.providerBundleIdentifier = Self.providerBundleIdentifier
        protocolConfig.serverAddress = config.peers.first?.endpoint ?? "not-configured"
        protocolConfig.providerConfiguration = [
            "wireguard": try JSONEncoder().encode(config.withoutPrivateKey()),
        ]

        manager.protocolConfiguration = protocolConfig
        manager.localizedDescription = "FlowVPN"
        manager.isEnabled = true
        try await manager.saveToPreferences()
        try await manager.loadFromPreferences()
        self.manager = manager
    }

    private func loadManagerFromPreferences() async {
        do {
            let existing = try await NETunnelProviderManager.loadAllFromPreferences()
            manager = existing.first { $0.localizedDescription == "FlowVPN" }
            refreshStatus()
        } catch {
            lastError = error.localizedDescription
            statusMessage = Self.userMessage(for: error)
        }
    }

    private static func userMessage(for error: Error) -> String {
        if let error = error as? ControlAPIClient.ClientError {
            switch error {
            case .transport(_, let underlying):
                return transportMessage(underlying: underlying)
            case .server:
                return "Coordinator rejected this device. Please try again."
            case .badResponse:
                return "Coordinator returned an invalid response. Please try again."
            case .missingSession:
                return "Please sign in before connecting."
            }
        }
        if error is ConfigError {
            return "VPN configuration is not ready. Please try again."
        }
        return "VPN could not start. Please try again."
    }

    private static func transportMessage(underlying: Error) -> String {
        let nsError = underlying as NSError
        guard nsError.domain == NSURLErrorDomain else {
            return "Cannot reach the coordinator. Please try again."
        }

        switch nsError.code {
        case NSURLErrorAppTransportSecurityRequiresSecureConnection:
            return "Coordinator connection is blocked by app transport security."
        case NSURLErrorCannotConnectToHost:
            return "Cannot connect to the coordinator service."
        case NSURLErrorTimedOut:
            return "Coordinator request timed out."
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
            return "Network is offline while contacting the coordinator."
        case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
            return "Cannot resolve the coordinator."
        default:
            return "Cannot reach the coordinator."
        }
    }
}
