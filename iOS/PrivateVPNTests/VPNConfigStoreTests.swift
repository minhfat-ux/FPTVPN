import XCTest
@testable import PrivateVPN

/// Tests `VPNConfigStore` persistence and derived logic against an isolated
/// `UserDefaults` suite (never `.standard`).
@MainActor
final class VPNConfigStoreTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "VPNConfigStoreTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    private func makeStore() -> VPNConfigStore {
        VPNConfigStore(defaults: defaults)
    }

    func testInitSeedsDefaultLocationOnFirstLaunch() throws {
        let store = makeStore()
        let preset = try XCTUnwrap(VPNLocation.presets.first)

        XCTAssertEqual(store.selectedLocationID, preset.id)
        XCTAssertEqual(store.selectedLocation, preset)
        XCTAssertEqual(store.serverEndpoint, "\(preset.host):\(preset.port)")
        XCTAssertEqual(store.serverPublicKey, preset.publicKey)
        XCTAssertEqual(store.tunnelAddress, preset.clientAddress)
        XCTAssertTrue(store.isConfigured, "seeded preset must count as configured")
    }

    func testIsConfiguredRequiresEndpointAndPublicKey() {
        let store = makeStore()
        XCTAssertTrue(store.isConfigured)

        store.serverEndpoint = ""
        XCTAssertFalse(store.isConfigured, "missing endpoint must mean not configured")

        store.serverEndpoint = "63.140.14.154:64044"
        store.serverPublicKey = ""
        XCTAssertFalse(store.isConfigured, "missing peer public key must mean not configured")
    }

    func testHasControlPlaneAndBaseURL() {
        let store = makeStore()
        XCTAssertFalse(store.hasControlPlane)
        XCTAssertNil(store.controlPlaneBaseURL)

        store.controlPlaneURL = "https://control.example.com"
        XCTAssertTrue(store.hasControlPlane)
        XCTAssertEqual(store.controlPlaneBaseURL, URL(string: "https://control.example.com"))

        store.controlPlaneURL = "not a url"
        XCTAssertTrue(store.hasControlPlane, "non-empty string counts as configured")
        XCTAssertNil(store.controlPlaneBaseURL, "invalid URL must yield nil base URL")
    }

    func testValuesPersistAcrossStoreInstances() {
        let first = makeStore()
        first.controlPlaneURL = "https://control.example.com"
        first.controlPlaneToken = "tok-123"
        first.allowedIPs = "10.0.0.0/8"
        // A non-nil selection (even unknown to presets) must persist as-is,
        // and must prevent the first-launch preset seeding from re-running.
        let customID = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
        first.selectedLocationID = customID

        let second = makeStore()
        XCTAssertEqual(second.controlPlaneURL, "https://control.example.com")
        XCTAssertEqual(second.controlPlaneToken, "tok-123")
        XCTAssertEqual(second.allowedIPs, "10.0.0.0/8")
        XCTAssertEqual(second.selectedLocationID, customID)
    }

    func testDefaultsForUnsetOptionalFields() {
        // Pre-seed a selection so first-launch preset seeding is skipped and
        // the raw defaults for every field are observable.
        defaults.set(UUID().uuidString, forKey: "config.server.locationID")

        let store = makeStore()
        XCTAssertEqual(store.tunnelAddress, "10.80.0.2/32")
        XCTAssertEqual(store.dnsServers, "1.1.1.1")
        XCTAssertEqual(store.allowedIPs, "0.0.0.0/0, ::/0")
        XCTAssertEqual(store.controlPlaneURL, "")
        XCTAssertEqual(store.controlPlaneToken, "")
    }
}
