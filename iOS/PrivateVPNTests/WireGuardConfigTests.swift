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

    private func makeProvisionedConfig(
        keepalive: Int? = 25,
        serverPublicKey: String? = nil
    ) throws -> ProvisionedConfig {
        let serverKey = try serverPublicKey ?? KeychainStore.obtainOrCreatePrivateKey().publicKey.base64Key
        return ProvisionedConfig(
            serverPublicKey: serverKey,
            endpoint: "63.140.14.154:64044",
            address: "10.77.0.2/32",
            dns: ["1.1.1.1", "8.8.8.8"],
            allowedIPs: ["0.0.0.0/0", "::/0"],
            persistentKeepalive: keepalive
        )
    }

    func testMakeWireGuardConfigMapsProvisionedFields() throws {
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        let provisioned = try makeProvisionedConfig(serverPublicKey: key.publicKey.base64Key)
        let config = provisioned.makeWireGuardConfig(privateKey: key)

        XCTAssertEqual(config.name, "privatevpn")
        XCTAssertEqual(config.privateKeyBase64, key.base64Key,
                       "the on-device private key must be used")
        XCTAssertEqual(config.addresses, ["10.77.0.2/32"],
                       "provisioned address must map to tunnel addresses")
        XCTAssertEqual(config.dnsServers, ["1.1.1.1", "8.8.8.8"],
                       "provisioned DNS servers must map to tunnel DNS")

        XCTAssertEqual(config.peers.count, 1)
        let peer = config.peers[0]
        XCTAssertEqual(peer.publicKeyBase64, key.publicKey.base64Key,
                       "server public key must map to the peer public key")
        XCTAssertEqual(peer.endpoint, "63.140.14.154:64044")
        XCTAssertEqual(peer.allowedIPs, ["0.0.0.0/0", "::/0"])
        XCTAssertNil(peer.preSharedKeyBase64)
        XCTAssertEqual(peer.persistentKeepAlive, 25)
    }

    func testMakeWireGuardConfigDefaultsKeepaliveWhenAbsent() throws {
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        let provisioned = try makeProvisionedConfig(keepalive: nil)
        let config = provisioned.makeWireGuardConfig(privateKey: key)
        XCTAssertEqual(config.peers[0].persistentKeepAlive, 25,
                       "persistent keepalive must default to 25 seconds")
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
                    endpoint: "63.140.14.154:64044",
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
