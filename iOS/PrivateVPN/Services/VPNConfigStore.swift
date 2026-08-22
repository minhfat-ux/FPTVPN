import Foundation

/// Internal server configuration for the WireGuard tunnel.
@MainActor
final class VPNConfigStore: ObservableObject {
    private enum Key {
        static let serverEndpoint = "config.server.endpoint"
        static let serverPublicKey = "config.server.publicKey"
        static let tunnelAddress = "config.server.address"
        static let dnsServers = "config.server.dns"
        static let allowedIPs = "config.server.allowedIPs"
        static let selectedLocationID = "config.server.locationID"
        static let controlPlaneURL = "config.controlPlane.url"
        /// ID of the exit node chosen from the control plane's node list.
        static let selectedNodeID = "config.node.id"
        /// Keychain account for the control-plane auth token. The token is a
        /// credential and must not live in UserDefaults (NFR-PRIV-001 — privacy
        /// review 2026-08-20 ISSUE #3).
        static let controlPlaneTokenAccount = "control-plane.token"
        /// Legacy UserDefaults key for the token; read once for migration, then removed.
        static let controlPlaneTokenLegacy = "config.controlPlane.token"
    }

    private let defaults: UserDefaults

    /// Default coordinator URL (VPS). This is app-owned config, not user UI.
    private static let defaultControlPlaneURL = "https://api.meetflowai.site"

    @Published var serverEndpoint: String {
        didSet { defaults.set(serverEndpoint, forKey: Key.serverEndpoint) }
    }
    @Published var serverPublicKey: String {
        didSet { defaults.set(serverPublicKey, forKey: Key.serverPublicKey) }
    }
    @Published var tunnelAddress: String {
        didSet { defaults.set(tunnelAddress, forKey: Key.tunnelAddress) }
    }
    @Published var dnsServers: String {
        didSet { defaults.set(dnsServers, forKey: Key.dnsServers) }
    }
    @Published var allowedIPs: String {
        didSet { defaults.set(allowedIPs, forKey: Key.allowedIPs) }
    }
    @Published var selectedLocationID: UUID? {
        didSet { defaults.set(selectedLocationID?.uuidString, forKey: Key.selectedLocationID) }
    }
    @Published var controlPlaneURL: String {
        didSet { defaults.set(controlPlaneURL, forKey: Key.controlPlaneURL) }
    }
    @Published var controlPlaneToken: String {
        didSet { persistControlPlaneToken() }
    }
    /// Exit nodes fetched from the control plane (Tailscale-style), plus any
    /// legacy local presets. Controls the location picker.
    @Published var remoteNodes: [ExitNode] = []
    /// The exit node id currently selected.
    @Published var selectedNodeID: String? {
        didSet { defaults.set(selectedNodeID, forKey: Key.selectedNodeID) }
    }

    /// The currently selected preset location, if any.
    var selectedLocation: VPNLocation? {
        VPNLocation.presets.first { $0.id == selectedLocationID }
    }

    /// All selectable exit nodes: control-plane nodes first, then legacy presets.
    var availableNodes: [ExitNode] {
        if !remoteNodes.isEmpty {
            return remoteNodes
        }
        return VPNLocation.presets.map {
            ExitNode(id: $0.id.uuidString, name: $0.name, country: $0.country,
                     city: $0.city, endpoint: "\($0.host):\($0.port)", public_key: $0.publicKey)
        }
    }

    /// The currently selected exit node (remote or preset).
    var selectedRemoteNode: ExitNode? {
        availableNodes.first { $0.id == selectedNodeID }
    }

    /// True when an endpoint and a peer public key have both been entered.
    var isConfigured: Bool {
        !serverEndpoint.trimmingCharacters(in: .whitespaces).isEmpty
            && !serverPublicKey.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// True when a control plane URL has been provided for auto-provisioning.
    var hasControlPlane: Bool {
        !controlPlaneURL.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// The control plane URL as an http(s) `URL`, if configured.
    /// A missing scheme is treated as `https://` to match production defaults and make
    /// pasting `host:port` work on device.
    var controlPlaneBaseURL: URL? {
        let trimmed = controlPlaneURL.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        let urlString = trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
            ? trimmed
            : "https://\(trimmed)"
        guard let url = URL(string: urlString),
              let scheme = url.scheme,
              ["http", "https"].contains(scheme.lowercased()),
              let host = url.host,
              !host.isEmpty else { return nil }
        return url
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        serverEndpoint = defaults.string(forKey: Key.serverEndpoint) ?? ""
        serverPublicKey = defaults.string(forKey: Key.serverPublicKey) ?? ""
        tunnelAddress = defaults.string(forKey: Key.tunnelAddress) ?? "10.80.0.2/32"
        dnsServers = defaults.string(forKey: Key.dnsServers) ?? "1.1.1.1"
        allowedIPs = defaults.string(forKey: Key.allowedIPs) ?? "0.0.0.0/0"
        selectedLocationID = defaults.string(forKey: Key.selectedLocationID).flatMap(UUID.init)
        defaults.removeObject(forKey: Key.controlPlaneURL)
        controlPlaneURL = Self.defaultControlPlaneURL
        controlPlaneToken = Self.loadControlPlaneToken(defaults: defaults)
        selectedNodeID = defaults.string(forKey: Key.selectedNodeID)

        // Seed a default server selection on first launch so the app is usable
        // without manual endpoint entry.
        if selectedNodeID == nil, let first = VPNLocation.presets.first {
            selectedNodeID = first.id.uuidString
            serverEndpoint = "\(first.host):\(first.port)"
            serverPublicKey = first.publicKey
            tunnelAddress = first.clientAddress
        }
    }

    // MARK: - Control-plane token persistence (Keychain)

    /// Reads the token from the Keychain, migrating any legacy UserDefaults
    /// value on first run (NFR-PRIV-001 — privacy review 2026-08-20 ISSUE #3).
    private static func loadControlPlaneToken(defaults: UserDefaults) -> String {
        if let data = try? KeychainStore.loadData(for: Key.controlPlaneTokenAccount),
           let token = String(data: data, encoding: .utf8),
           !token.isEmpty {
            return token
        }
        if let legacy = defaults.string(forKey: Key.controlPlaneTokenLegacy), !legacy.isEmpty {
            try? KeychainStore.save(Data(legacy.utf8), for: Key.controlPlaneTokenAccount)
            defaults.removeObject(forKey: Key.controlPlaneTokenLegacy)
            return legacy
        }
        return ""
    }

    private func persistControlPlaneToken() {
        do {
            try KeychainStore.save(Data(controlPlaneToken.utf8), for: Key.controlPlaneTokenAccount)
        } catch {
            // Surface programming errors in debug; never crash on a storage hiccup.
            assertionFailure("Failed to persist control-plane token to Keychain: \(error)")
        }
    }
}
