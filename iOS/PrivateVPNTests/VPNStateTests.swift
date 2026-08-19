import XCTest
import NetworkExtension
@testable import PrivateVPN

final class VPNStateTests: XCTestCase {
    func testDisconnectedStatusMapsToDisconnected() {
        XCTAssertEqual(VPNState(networkStatus: .disconnected), .disconnected)
    }

    func testConnectingStatusMapsToConnecting() {
        XCTAssertEqual(VPNState(networkStatus: .connecting), .connecting)
    }

    func testConnectedStatusMapsToConnected() {
        XCTAssertEqual(VPNState(networkStatus: .connected), .connected)
    }

    func testDisconnectingStatusMapsToDisconnecting() {
        XCTAssertEqual(VPNState(networkStatus: .disconnecting), .disconnecting)
    }

    func testReassertingIsTreatedAsConnecting() {
        XCTAssertEqual(VPNState(networkStatus: .reasserting), .connecting)
    }

    func testInvalidIsTreatedAsFailed() {
        XCTAssertEqual(VPNState(networkStatus: .invalid), .failed)
    }

    func testFailedStateAllowsConnect() {
        XCTAssertTrue(VPNState.failed.canConnect)
        XCTAssertFalse(VPNState.failed.canDisconnect)
    }

    func testConnectedAllowsDisconnectNotConnect() {
        XCTAssertTrue(VPNState.connected.canDisconnect)
        XCTAssertFalse(VPNState.connected.canConnect)
    }

    func testDisconnectedAllowsConnectNotDisconnect() {
        XCTAssertTrue(VPNState.disconnected.canConnect)
        XCTAssertFalse(VPNState.disconnected.canDisconnect)
    }
}
