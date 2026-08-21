import XCTest
@testable import PrivateVPN

/// Tests the mapping from a control-plane `ProvisionedConfig` to the
/// `WireGuardConfig` handed to the tunnel, and its conversion into a
/// WireGuardKit `TunnelConfiguration` (FR-PROVISION-001/002).
final class WireGuardConfigTests: XCTestCase {
    override func setUp() {
        super.setUp()
        KeychainStore.backend = InMemoryKeychainBackend()
    }

    override func tearDown() {
        KeychainStore.backend = SecurityKeychainBackend()
        super.tearDown()
    }

    func testMakeTunnelConfigurationRoundTrip() throws {
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        let config = WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: key.base64Key,
            addresses: ["10.77.0.2/32", "fd00::2/128"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: key.publicKey.base64Key,
                    endpoint: "103.173.155.50:22",
                    allowedIPs: ["0.0.0.0/0", "::/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )

        let tunnel = try config.makeTunnelConfiguration()
        XCTAssertEqual(tunnel.interface.addresses.count, 2)
        XCTAssertEqual(tunnel.interface.dns.count, 1)
        XCTAssertEqual(tunnel.peers.count, 1)
        XCTAssertEqual(tunnel.peers[0].allowedIPs.count, 2)
        XCTAssertNotNil(tunnel.peers[0].endpoint)
        XCTAssertEqual(tunnel.peers[0].persistentKeepAlive, 25)
    }

    func testMakeTunnelConfigurationRejectsInvalidPrivateKey() {
        let config = WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: "bm90LWEtZGVjZW50LWtleQ==",
            addresses: ["10.77.0.2/32"],
            dnsServers: ["1.1.1.1"],
            peers: []
        )
        XCTAssertThrowsError(try config.makeTunnelConfiguration()) { error in
            guard case WireGuardConfig.ConfigError.invalidPrivateKey = error else {
                return XCTFail("Expected .invalidPrivateKey, got \(error)")
            }
        }
    }

    func testMakeTunnelConfigurationRejectsInvalidAddress() throws {
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        let config = WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: key.base64Key,
            addresses: ["999.999.999.999/32"],
            dnsServers: ["1.1.1.1"],
            peers: []
        )
        XCTAssertThrowsError(try config.makeTunnelConfiguration()) { error in
            guard case WireGuardConfig.ConfigError.invalidAddress = error else {
                return XCTFail("Expected .invalidAddress, got \(error)")
            }
        }
    }

    func testMakeTunnelConfigurationRejectsInvalidPeerPublicKey() throws {
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        let config = WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: key.base64Key,
            addresses: ["10.77.0.2/32"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: "not-a-valid-public-key",
                    endpoint: nil,
                    allowedIPs: ["0.0.0.0/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: nil
                )
            ]
        )
        XCTAssertThrowsError(try config.makeTunnelConfiguration()) { error in
            guard case WireGuardConfig.ConfigError.invalidPeerPublicKey = error else {
                return XCTFail("Expected .invalidPeerPublicKey, got \(error)")
            }
        }
    }
}
