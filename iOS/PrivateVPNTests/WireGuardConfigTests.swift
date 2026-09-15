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

    func testPrivateKeyCanBeStrippedAndRestored() throws {
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        let config = WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: key.base64Key,
            addresses: ["10.77.0.2/32"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: key.publicKey.base64Key,
                    endpoint: "103.173.155.50:443",
                    allowedIPs: ["0.0.0.0/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )

        let publicConfig = config.withoutPrivateKey()
        XCTAssertTrue(publicConfig.privateKeyBase64.isEmpty)
        XCTAssertThrowsError(try publicConfig.makeTunnelConfiguration())

        let restoredConfig = publicConfig.withPrivateKey(key)
        XCTAssertEqual(restoredConfig.privateKeyBase64, key.base64Key)
        XCTAssertNoThrow(try restoredConfig.makeTunnelConfiguration())
    }

    /// App ghi `WireGuardConfig` vào `providerConfiguration["wireguard"]` bằng `JSONEncoder`,
    /// extension đọc lại bằng `JSONDecoder` trên CÙNG struct (một file dùng chung), nên khoá
    /// JSON phải khớp tuyệt đối. Test này chốt bất biến đó cho `wsRelayURL` — nếu ai đổi
    /// CodingKeys ở một phía (hoặc tách struct) thì relay của node sẽ rơi về nil và extension
    /// lại đoán relay mặc định, đúng lỗi "connect mà không có mạng".
    func testRelayURLSurvivesAppToExtensionEncodeDecode() throws {
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        let config = WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: key.base64Key,
            addresses: ["10.77.0.2/24"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: key.publicKey.base64Key,
                    endpoint: "165.101.114.162:443",
                    allowedIPs: ["0.0.0.0/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ],
            nodeId: "vietnam-2",
            wsRelayURL: "wss://fcnvpn.tail303be3.ts.net/vn2"
        )

        let data = try JSONEncoder().encode(config)
        let decoded = try JSONDecoder().decode(WireGuardConfig.self, from: data)

        XCTAssertEqual(decoded.wsRelayURL, "wss://fcnvpn.tail303be3.ts.net/vn2")
        XCTAssertEqual(decoded.nodeId, "vietnam-2")
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
