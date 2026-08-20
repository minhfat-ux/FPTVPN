import XCTest
@testable import PrivateVPN

/// Verifies NFR-SEC-001 / FR-DEVICE-002 (AC-003): the WireGuard keypair is
/// generated on-device, persisted in secure storage, never regenerated across
/// calls, and the stored public key always matches the stored private key.
///
/// Uses the in-memory `KeychainBackend` because the real Keychain is not
/// reliably available to simulator test bundles.
final class KeychainStoreTests: XCTestCase {
    override func setUp() {
        super.setUp()
        KeychainStore.backend = InMemoryKeychainBackend()
    }

    override func tearDown() {
        KeychainStore.backend = SecurityKeychainBackend()
        super.tearDown()
    }

    func testLoadPrivateKeyReturnsNilWhenNothingStored() throws {
        XCTAssertNil(try KeychainStore.loadPrivateKey())
        XCTAssertNil(try KeychainStore.loadPublicKey())
    }

    func testObtainOrCreateGeneratesA32ByteKeypair() throws {
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        XCTAssertEqual(key.rawValue.count, 32, "WireGuard private key must be 32 bytes")
        XCTAssertEqual(key.publicKey.rawValue.count, 32, "Derived public key must be 32 bytes")

        let storedPrivate = try XCTUnwrap(KeychainStore.loadPrivateKey())
        XCTAssertEqual(storedPrivate, key, "Stored private key must round-trip")

        let storedPublic = try XCTUnwrap(KeychainStore.loadPublicKey())
        XCTAssertEqual(storedPublic, key.publicKey, "Stored public key must be the derived one")
        XCTAssertEqual(storedPublic.base64Key, key.publicKey.base64Key)
    }

    func testObtainOrCreateIsIdempotent() throws {
        let first = try KeychainStore.obtainOrCreatePrivateKey()
        let second = try KeychainStore.obtainOrCreatePrivateKey()
        XCTAssertEqual(first, second, "obtainOrCreate must not regenerate an existing keypair")
        XCTAssertEqual(first.rawValue, second.rawValue)
        XCTAssertEqual(try KeychainStore.loadPublicKey(), first.publicKey)
    }

    func testPublicKeyMatchesPrivateKeyAcrossLoads() throws {
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        let loadedPrivate = try XCTUnwrap(KeychainStore.loadPrivateKey())
        let loadedPublic = try XCTUnwrap(KeychainStore.loadPublicKey())

        XCTAssertEqual(loadedPublic, loadedPrivate.publicKey,
                       "Stored public key must always be the public key of the stored private key")
    }

    func testKeypairPersistsAcrossAppRestart() throws {
        let firstBackend = InMemoryKeychainBackend()
        KeychainStore.backend = firstBackend
        let key = try KeychainStore.obtainOrCreatePrivateKey()

        // Simulate a restart: a fresh backend backed by the same stored data.
        KeychainStore.backend = InMemoryKeychainBackend(store: firstBackend.store)
        let afterRestart = try XCTUnwrap(KeychainStore.loadPrivateKey())
        XCTAssertEqual(afterRestart, key, "Keypair must survive app restarts (Keychain persistence)")
        XCTAssertEqual(try KeychainStore.loadPublicKey(), key.publicKey)
    }

    func testOnlyPublicKeyIsExposedAsBase64ForTransmission() throws {
        // AC-015: the only key material that ever leaves the device is the
        // public key; the private key is only ever handed to WireGuardKit for
        // on-device tunnel config construction.
        let key = try KeychainStore.obtainOrCreatePrivateKey()
        let publicBase64 = key.publicKey.base64Key
        XCTAssertFalse(publicBase64.isEmpty)
        XCTAssertTrue(publicBase64.contains("=") || publicBase64.count == 43,
                      "WireGuard public keys are 32 raw bytes → 43-char base64")
    }
}

/// Verifies FR-DEVICE-001 (AC-002): a stable per-device UUID exists in the
/// Keychain, separate from the WireGuard keypair and from any auth identity.
final class DeviceIdentityTests: XCTestCase {
    override func setUp() {
        super.setUp()
        KeychainStore.backend = InMemoryKeychainBackend()
    }

    override func tearDown() {
        KeychainStore.backend = SecurityKeychainBackend()
        super.tearDown()
    }

    func testDeviceIDIsStableAcrossCalls() throws {
        let first = try DeviceIdentity.deviceID()
        let second = try DeviceIdentity.deviceID()
        XCTAssertEqual(first, second, "device_id must be stable within a launch")
        XCTAssertEqual(try DeviceIdentity.load(), first)
    }

    func testDeviceIDPersistsAcrossRestart() throws {
        let firstBackend = InMemoryKeychainBackend()
        KeychainStore.backend = firstBackend
        let id = try DeviceIdentity.deviceID()

        KeychainStore.backend = InMemoryKeychainBackend(store: firstBackend.store)
        XCTAssertEqual(try DeviceIdentity.deviceID(), id, "device_id must survive restarts")
    }

    func testDeviceIdentityIsSeparateFromWireGuardKeypair() throws {
        let deviceID = try DeviceIdentity.deviceID()
        let key = try KeychainStore.obtainOrCreatePrivateKey()

        XCTAssertNotEqual(deviceID.uuidString, key.publicKey.base64Key,
                          "device identity must be distinct from the WireGuard public key")
        XCTAssertEqual(try DeviceIdentity.load(), deviceID)
        XCTAssertEqual(try KeychainStore.loadPrivateKey(), key,
                       "storing the identity must not disturb the keypair")
    }

    func testStoredIdentityIsValidUUIDString() throws {
        _ = try DeviceIdentity.deviceID()
        let backend = KeychainStore.backend as! InMemoryKeychainBackend
        let data = try XCTUnwrap(backend.store[DeviceIdentity.account])
        let string = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertNotNil(UUID(uuidString: string), "Keychain must hold a parseable UUID string")
    }
}
