import Foundation
import Network
import WireGuardKit

/// A WireGuard device registered for a user, Tailscale-style. A user owns many
/// devices; each device has its own WireGuard keypair and a control-plane-issued
/// tunnel configuration.
struct VPNDevice: Equatable, Codable {
    var id: String
    var name: String
    var createdAt: Date
    var isActive: Bool
}

/// Parsed WireGuard tunnel configuration passed from the app to the packet tunnel.
/// Carries everything needed to build a `TunnelConfiguration` and start the tunnel.
struct WireGuardConfig: Equatable, Codable {
    var name: String
    var privateKeyBase64: String
    var addresses: [String]
    var dnsServers: [String]
    var peers: [WireGuardPeer]

    struct WireGuardPeer: Equatable, Codable {
        var publicKeyBase64: String
        var endpoint: String?
        var allowedIPs: [String]
        var preSharedKeyBase64: String?
        var persistentKeepAlive: UInt16?
    }

    /// Builds the WireGuardKit `TunnelConfiguration` from this model.
    /// Throws if any key or address is invalid.
    func makeTunnelConfiguration() throws -> TunnelConfiguration {
        guard let privateKey = PrivateKey(base64Key: privateKeyBase64) else {
            throw ConfigError.invalidPrivateKey
        }
        let addresses = try self.addresses.map { addressString in
            guard let range = IPAddressRange(from: addressString) else {
                throw ConfigError.invalidAddress(addressString)
            }
            return range
        }
        let dns = dnsServers.compactMap(DNSServer.init(from:))
        var interface = InterfaceConfiguration(privateKey: privateKey)
        interface.addresses = addresses
        interface.dns = dns

        var peers: [PeerConfiguration] = []
        for peer in self.peers {
            guard let publicKey = PublicKey(base64Key: peer.publicKeyBase64) else {
                throw ConfigError.invalidPeerPublicKey
            }
            var peerConfig = PeerConfiguration(publicKey: publicKey)
            peerConfig.allowedIPs = try peer.allowedIPs.map { ipString in
                guard let range = IPAddressRange(from: ipString) else {
                    throw ConfigError.invalidAddress(ipString)
                }
                return range
            }
            if let endpoint = peer.endpoint {
                guard let parsed = Endpoint(from: endpoint) else {
                    throw ConfigError.invalidEndpoint
                }
                peerConfig.endpoint = parsed
            }
            if let psk = peer.preSharedKeyBase64 {
                guard let parsed = PreSharedKey(base64Key: psk) else {
                    throw ConfigError.invalidPreSharedKey
                }
                peerConfig.preSharedKey = parsed
            }
            peerConfig.persistentKeepAlive = peer.persistentKeepAlive
            peers.append(peerConfig)
        }

        return TunnelConfiguration(name: name, interface: interface, peers: peers)
    }

    enum ConfigError: Error, LocalizedError {
        case invalidPrivateKey
        case invalidPeerPublicKey
        case invalidEndpoint
        case invalidPreSharedKey
        case invalidAddress(String)

        var errorDescription: String? {
            switch self {
            case .invalidPrivateKey:
                return "The WireGuard private key is invalid."
            case .invalidPeerPublicKey:
                return "A WireGuard peer public key is invalid."
            case .invalidEndpoint:
                return "A WireGuard peer endpoint is invalid."
            case .invalidPreSharedKey:
                return "A WireGuard pre-shared key is invalid."
            case .invalidAddress(let value):
                return "The WireGuard address '\(value)' is invalid."
            }
        }
    }
}

private extension IPAddress {
    /// Creates an IP address from a string without prefix (e.g. "10.80.0.2").
    static func from(_ string: String) -> IPAddress? {
        let parts = string.split(separator: "/", maxSplits: 1)
        let host = String(parts.first ?? Substring(string))
        if let ipv4 = IPv4Address(host) {
            return ipv4
        }
        if let ipv6 = IPv6Address(host) {
            return ipv6
        }
        return nil
    }
}

extension ProvisionedConfig {
    /// Builds a `WireGuardConfig` from a control-plane-provisioned response,
    /// using the on-device private key.
    func makeWireGuardConfig(privateKey: PrivateKey) -> WireGuardConfig {
        WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: privateKey.base64Key,
            addresses: [address],
            dnsServers: dns,
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: serverPublicKey,
                    endpoint: endpoint,
                    allowedIPs: allowedIPs,
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: persistentKeepalive.map(UInt16.init) ?? 25
                )
            ]
        )
    }
}
