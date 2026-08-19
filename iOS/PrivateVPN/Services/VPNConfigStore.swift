import Foundation

/// User-editable server configuration for the WireGuard tunnel.
/// The server endpoint and peer public key are not secrets (private key stays
/// in the Keychain), so they are persisted in UserDefaults.
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
        static let controlPlaneToken = "config.controlPlane.token"
    }

    private let defaults: UserDefaults

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
        didSet { defaults.set(controlPlaneToken, forKey: Key.controlPlaneToken) }
    }

    /// The currently selected preset location, if any.
    var selectedLocation: VPNLocation? {
        VPNLocation.presets.first { $0.id == selectedLocationID }
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

    /// The control plane URL as a `URL`, if configured.
    var controlPlaneBaseURL: URL? {
        let trimmed = controlPlaneURL.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let url = URL(string: trimmed) else { return nil }
        return url
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        serverEndpoint = defaults.string(forKey: Key.serverEndpoint) ?? ""
        serverPublicKey = defaults.string(forKey: Key.serverPublicKey) ?? ""
        tunnelAddress = defaults.string(forKey: Key.tunnelAddress) ?? "10.80.0.2/32"
        dnsServers = defaults.string(forKey: Key.dnsServers) ?? "1.1.1.1"
        allowedIPs = defaults.string(forKey: Key.allowedIPs) ?? "0.0.0.0/0, ::/0"
        selectedLocationID = defaults.string(forKey: Key.selectedLocationID).flatMap(UUID.init)
        controlPlaneURL = defaults.string(forKey: Key.controlPlaneURL) ?? ""
        controlPlaneToken = defaults.string(forKey: Key.controlPlaneToken) ?? ""

        // Seed a default server selection on first launch so the app is usable
        // without manual endpoint entry.
        if selectedLocationID == nil, let first = VPNLocation.presets.first {
            selectedLocationID = first.id
            serverEndpoint = "\(first.host):\(first.port)"
            serverPublicKey = first.publicKey
            tunnelAddress = first.clientAddress
        }
    }
}
