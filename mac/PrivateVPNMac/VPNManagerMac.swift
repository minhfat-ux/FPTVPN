import Foundation
import NetworkExtension
import os
import WireGuardKit

/// macOS VPN manager: registers with the coordinator and drives the tunnel via
/// NetworkExtension (NETunnelProviderManager + the embedded packet-tunnel
/// extension built on WireGuardKit). No `wg-quick`/sudo dependency.
@MainActor
final class VPNManagerMac: ObservableObject {
    private let log = Logger(subsystem: "com.privatevpn.mac", category: "vpn-manager")

    static let providerBundleIdentifier = "com.privatevpn.mac.packet-tunnel"

    @Published private(set) var state: String = "Disconnected"
    @Published private(set) var overlayIP: String?
    @Published var lastError: String?
    @Published var coordinatorURL: String = "https://api.meetflowai.site"
    @Published var devicePublicKey: String?
    /// Exit nodes advertised by the coordinator (list of selectable servers).
    @Published var exitNodes: [ExitNode] = []
    @Published private(set) var isRefreshingNodes = false
    /// True when the node list comes from cache/built-in fallback because the
    /// coordinator was unreachable (e.g. censored network). UI shows a hint.
    @Published private(set) var usingFallbackNodes = false
    /// Currently selected exit node id.
    @Published var selectedNodeID: String? {
        didSet { UserDefaults.standard.set(selectedNodeID, forKey: "selectedNodeID") }
    }

    private var manager: NETunnelProviderManager?
    private var statusPollTask: Task<Void, Never>?
    nonisolated(unsafe) private var statusObserver: NSObjectProtocol?

    /// Static ref cho AppDelegate (applicationWillTerminate -> disconnect).
    nonisolated(unsafe) static weak var sharedForTerminate: VPNManagerMac?

    init() {
        VPNManagerMac.sharedForTerminate = self
        refreshPublicKey()
        selectedNodeID = UserDefaults.standard.string(forKey: "selectedNodeID")
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
        Task {
            await loadManagerFromPreferences()
            await refreshNodes()
            startStatusPolling()
        }
    }

    deinit {
        if let statusObserver {
            NotificationCenter.default.removeObserver(statusObserver)
        }
        statusPollTask?.cancel()
    }

    private func refreshStatus() {
        guard let connection = manager?.connection else {
            if state != "Connecting…" && state != "Disconnecting…" {
                state = "Disconnected"
            }
            return
        }
        state = stateString(for: connection.status)
        if connection.status == .disconnected {
            overlayIP = nil
        }
    }

    private func stateString(for status: NEVPNStatus) -> String {
        switch status {
        case .invalid: return "Failed"
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting…"
        case .connected: return "Connected"
        case .reasserting: return "Connecting…"
        case .disconnecting: return "Disconnecting…"
        @unknown default: return "Disconnected"
        }
    }

    func refreshPublicKey() {
        let key = WireGuardKeychain.loadOrCreatePrivateKey()
        devicePublicKey = key.publicKey
    }

    private static func stableSuffix(from publicKey: String) -> String {
        let safe = publicKey
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
        return String(safe.prefix(8))
    }

    private static func randomRegistrationName() -> String {
        "mac-\(UUID().uuidString.prefix(8).lowercased())"
    }

    /// Prepends `https://` when the user omits a scheme (common when pasting a
    /// bare host:port), then parses.
    private func normalizedURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withScheme: String
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            withScheme = trimmed
        } else {
            withScheme = "https://" + trimmed
        }
        return URL(string: withScheme)
    }

    func connect(authStore: AuthSessionStore) async {
        guard state != "Connecting…", state != "Disconnecting…" else { return }
        state = "Connecting…"
        lastError = nil

        do {
            guard let baseURL = normalizedURL(coordinatorURL) else {
                throw MacError.invalidURL(coordinatorURL)
            }
            log.info("connect: coordinator=\(baseURL.absoluteString, privacy: .public)")
            let privateKey = WireGuardKeychain.loadOrCreatePrivateKey()

            let bootstrap = ControlAPIClient(baseURL: baseURL, joinToken: "")

            let node = try await selectedExitNode(client: bootstrap)
            log.info("connect: selected node \(node.name, privacy: .public) @ \(node.endpoint, privacy: .public)")

            var overlayIP: String
            var exitNode = node
            do {
                log.info("connect: fetching enrollment token")
                guard let accessToken = authStore.accessToken else {
                    throw ControlAPIClient.ClientError.missingSession
                }
                let token = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)

                let deviceName = "mac-\(Self.stableSuffix(from: privateKey.publicKey))"
                let response: CoordinatorRegisterResponse
                do {
                    response = try await registerDevice(
                        baseURL: baseURL,
                        joinToken: token,
                        name: deviceName,
                        publicKey: privateKey.publicKey,
                        accessToken: accessToken,
                        exitNodeId: selectedNodeID
                    )
                } catch ControlAPIClient.ClientError.server(let message) where message.localizedCaseInsensitiveContains("name") {
                    let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
                    response = try await registerDevice(
                        baseURL: baseURL,
                        joinToken: retryToken,
                        name: Self.randomRegistrationName(),
                        publicKey: privateKey.publicKey,
                        accessToken: accessToken,
                        exitNodeId: selectedNodeID
                    )
                } catch ControlAPIClient.ClientError.server {
                    let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
                    response = try await registerDevice(
                        baseURL: baseURL,
                        joinToken: retryToken,
                        name: deviceName,
                        publicKey: privateKey.publicKey,
                        accessToken: accessToken,
                        exitNodeId: selectedNodeID
                    )
                }
                overlayIP = response.overlay_ip
                log.info("connect: registered, overlay=\(overlayIP, privacy: .public)")
                TunnelConfigCache.save(overlayIP: overlayIP, node: exitNode)
                usingFallbackNodes = false
            } catch ControlAPIClient.ClientError.transport {
                // Coordinator unreachable (hotel captive portal / censored
                // network): reconnect with the last successful tunnel config.
                // The WireGuard peer still exists on the node's wg0.
                if let cached = TunnelConfigCache.load() {
                    overlayIP = cached.overlayIP
                    exitNode = cached.node
                    usingFallbackNodes = true
                    log.info("connect: coordinator unreachable — using cached tunnel config (overlay=\(overlayIP, privacy: .public))")
                } else if let saved = savedTunnelConfig() {
                    // No TunnelConfigCache yet (e.g. first run of this build),
                    // but the VPN profile from a previous session is still on
                    // disk — replay it directly.
                    overlayIP = Self.overlayIP(fromSaved: saved)
                    exitNode = ExitNode(
                        id: "saved",
                        name: "Saved",
                        country: "VN",
                        city: "Hanoi",
                        endpoint: saved.peers.first?.endpoint ?? "",
                        public_key: saved.peers.first?.publicKeyBase64 ?? ""
                    )
                    usingFallbackNodes = true
                    log.info("connect: coordinator unreachable — replaying saved VPN profile (overlay=\(overlayIP, privacy: .public))")
                } else {
                    // Profile may not be loaded yet (init loads it async).
                    await loadManagerFromPreferences()
                    if let saved = savedTunnelConfig() {
                        overlayIP = Self.overlayIP(fromSaved: saved)
                        exitNode = ExitNode(
                            id: "saved",
                            name: "Saved",
                            country: "VN",
                            city: "Hanoi",
                            endpoint: saved.peers.first?.endpoint ?? "",
                            public_key: saved.peers.first?.publicKeyBase64 ?? ""
                        )
                        usingFallbackNodes = true
                        log.info("connect: coordinator unreachable — replayed saved VPN profile after reload (overlay=\(overlayIP, privacy: .public))")
                    } else {
                        throw ControlAPIClient.ClientError.transport(
                            endpoint: "coordinator",
                            MacError.cachedTunnelUnavailable
                        )
                    }
                }
            }

            let config = Self.buildConfig(privateKeyBase64: privateKey.privateKey,
                                          overlayIP: overlayIP,
                                          exitEndpoint: exitNode.endpoint,
                                          exitPublicKey: exitNode.public_key)
            try await prepareConfiguration(config)
            guard let manager else {
                throw MacError.savedConfigurationMissing
            }

            do {
                try manager.connection.startVPNTunnel()
            } catch {
                let ns = error as NSError
                log.error("connect: startVPNTunnel failed: \(error.localizedDescription, privacy: .public) [domain=\(ns.domain, privacy: .public) code=\(ns.code)]")
                throw error
            }
            self.overlayIP = overlayIP
            lastError = nil
            log.info("connect: startVPNTunnel initiated, overlay=\(overlayIP, privacy: .public)")
            startStatusPolling()
        } catch {
            state = "Failed"
            lastError = error.localizedDescription
            let ns = error as NSError
            log.error("connect failed: \(error.localizedDescription, privacy: .public) [domain=\(ns.domain, privacy: .public) code=\(ns.code)]")
            NSLog("MacVPN: connect failed: \(error.localizedDescription) [\(ns.domain) \(ns.code)]")
        }
    }

    private func registerDevice(baseURL: URL, joinToken: String, name: String, publicKey: String, accessToken: String, exitNodeId: String?) async throws -> CoordinatorRegisterResponse {
        let client = ControlAPIClient(baseURL: baseURL, joinToken: joinToken)
        return try await client.register(
            name: name,
            platform: "macos",
            wireguardPublicKey: publicKey,
            endpoint: "0.0.0.0:51820",
            accessToken: accessToken,
            exitNodeId: exitNodeId
        )
    }

    /// Loads the list of exit nodes from the coordinator (for the picker).
    /// On failure (e.g. control plane unreachable on a censored network) falls
    /// back to the last cached list, then to built-in fallback nodes so the
    /// picker is never empty.
    func refreshNodes() async {
        guard let baseURL = normalizedURL(coordinatorURL) else { return }
        isRefreshingNodes = true
        defer { isRefreshingNodes = false }

        let client = ControlAPIClient(baseURL: baseURL, joinToken: "")
        var nodes: [ExitNode] = []
        var fromFallback = false
        do {
            nodes = try await client.fetchNodes()
            if !nodes.isEmpty {
                ExitNodeCache.save(nodes)
            }
        } catch {
            NSLog("MacVPN: refreshNodes failed: \(error.localizedDescription)")
        }
        if nodes.isEmpty {
            nodes = ExitNodeCache.load() ?? ExitNode.builtInFallback
            fromFallback = true
            NSLog("MacVPN: using fallback nodes (\(nodes.count))")
        }
        usingFallbackNodes = fromFallback
        exitNodes = nodes
        if let selectedNodeID, !nodes.contains(where: { $0.id == selectedNodeID }) {
            self.selectedNodeID = nodes.first?.id
        } else if selectedNodeID == nil, let first = nodes.first {
            selectedNodeID = first.id
        }
        if nodes.isEmpty {
            lastError = MacError.noExitNode.localizedDescription
        } else if lastError == MacError.noExitNode.localizedDescription {
            lastError = nil
        }
    }

    var selectedNode: ExitNode? {
        exitNodes.first { $0.id == selectedNodeID } ?? exitNodes.first
    }

    private func selectedExitNode(client: ControlAPIClient) async throws -> ExitNode {
        // Prefer a fresh fetch, but fall back to whatever is already loaded
        // (cached/built-in) so connect still works when the coordinator is
        // temporarily unreachable on the current network.
        if let nodes = try? await client.fetchNodes(), !nodes.isEmpty {
            exitNodes = nodes
            ExitNodeCache.save(nodes)
            usingFallbackNodes = false
            let selected = nodes.first { $0.id == selectedNodeID } ?? nodes.first!
            selectedNodeID = selected.id
            return selected
        }
        if let node = selectedNode ?? exitNodes.first {
            usingFallbackNodes = true
            return node
        }
        throw MacError.noExitNode
    }

    func disconnect() {
        state = "Disconnecting…"
        manager?.connection.stopVPNTunnel()
        refreshStatus()
    }

    // MARK: - Config

    private static func buildConfig(privateKeyBase64: String, overlayIP: String, exitEndpoint: String, exitPublicKey: String) -> WireGuardConfig {
        WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: privateKeyBase64,
            addresses: ["\(overlayIP)/24"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: exitPublicKey,
                    endpoint: exitEndpoint,
                    allowedIPs: ["0.0.0.0/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )
    }

    private func prepareConfiguration(_ config: WireGuardConfig) async throws {
        let existing = try await NETunnelProviderManager.loadAllFromPreferences()
        let staleProfiles = existing.filter { profile in
            profile.localizedDescription == "FlowVPN" || profile.localizedDescription == "FPT PrivateVPN"
        }

        for staleProfile in staleProfiles {
            log.info("configuration: removing stale VPN profile")
            try? await staleProfile.removeFromPreferences()
        }

        let manager = NETunnelProviderManager()
        let protocolConfig = NETunnelProviderProtocol()
        protocolConfig.providerBundleIdentifier = Self.providerBundleIdentifier
        protocolConfig.serverAddress = config.peers.first?.endpoint ?? "not-configured"
        protocolConfig.providerConfiguration = [
            "wireguard": try JSONEncoder().encode(config),
        ]

        manager.protocolConfiguration = protocolConfig
        manager.localizedDescription = "FlowVPN"
        manager.isEnabled = true
        try await manager.saveToPreferences()

        let refreshed = try await NETunnelProviderManager.loadAllFromPreferences()
        guard let savedManager = refreshed.first(where: { $0.localizedDescription == "FlowVPN" }) else {
            throw MacError.savedConfigurationMissing
        }
        self.manager = savedManager
    }

    private func loadManagerFromPreferences() async {
        do {
            let existing = try await NETunnelProviderManager.loadAllFromPreferences()
            manager = existing.first { $0.localizedDescription == "FlowVPN" }
            refreshStatus()
        } catch {
            lastError = error.localizedDescription
            log.error("configuration: failed to load VPN profile: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Decodes the WireGuard config stored in the currently saved "FlowVPN"
    /// NEVPN profile. Used as a fallback when the coordinator is unreachable —
    /// the profile persists across sessions even before TunnelConfigCache
    /// existed, so this works on the very first offline reconnect.
    private func savedTunnelConfig() -> WireGuardConfig? {
        guard let protocolConfig = manager?.protocolConfiguration as? NETunnelProviderProtocol,
              let data = protocolConfig.providerConfiguration?["wireguard"] as? Data,
              let config = try? JSONDecoder().decode(WireGuardConfig.self, from: data),
              !config.addresses.isEmpty,
              let peer = config.peers.first,
              !(peer.endpoint ?? "").isEmpty,
              !peer.publicKeyBase64.isEmpty else {
            return nil
        }
        return config
    }

    /// Extracts the bare overlay IP from a saved config's address string
    /// ("10.77.0.9/24" → "10.77.0.9"). buildConfig appends "/24" itself, so a
    /// CIDR-suffixed address would produce an invalid "…/24/24".
    private static func overlayIP(fromSaved config: WireGuardConfig) -> String {
        guard let address = config.addresses.first else { return "" }
        return address.split(separator: "/").first.map(String.init) ?? ""
    }

    private func startStatusPolling() {
        guard statusPollTask == nil else { return }
        statusPollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                await MainActor.run {
                    self?.refreshStatus()
                }
            }
        }
    }

    enum MacError: LocalizedError {
        case invalidURL(String)
        case noExitNode
        case savedConfigurationMissing
        case cachedTunnelUnavailable

        var errorDescription: String? {
            switch self {
            case .invalidURL(let url):
                return "Invalid coordinator URL: \(url)"
            case .noExitNode:
                return "No exit node available from the coordinator."
            case .savedConfigurationMissing:
                return "The VPN configuration was saved but could not be reloaded."
            case .cachedTunnelUnavailable:
                return "Could not reach the coordinator and no saved tunnel is available yet. Connect once on a working network, then this network will work offline."
            }
        }
    }
}
