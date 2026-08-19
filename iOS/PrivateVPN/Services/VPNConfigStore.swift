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

    /// True when an endpoint and a peer public key have both been entered.
    var isConfigured: Bool {
        !serverEndpoint.trimmingCharacters(in: .whitespaces).isEmpty
            && !serverPublicKey.trimmingCharacters(in: .whitespaces).isEmpty
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        serverEndpoint = defaults.string(forKey: Key.serverEndpoint) ?? ""
        serverPublicKey = defaults.string(forKey: Key.serverPublicKey) ?? ""
        tunnelAddress = defaults.string(forKey: Key.tunnelAddress) ?? "10.80.0.2/32"
        dnsServers = defaults.string(forKey: Key.dnsServers) ?? "1.1.1.1"
        allowedIPs = defaults.string(forKey: Key.allowedIPs) ?? "0.0.0.0/0, ::/0"
    }
}
