import XCTest

/// Tests cho `RouteReporter` — client A9 của hợp đồng `POST /v1/route-report`
/// (`control-plane/src/route-report.js`, commit 50ccf55).
///
/// Thuần logic, không I/O: body/parse/luật đổi đường/nhịp. Bản sao khẳng định trong
/// `scripts/ios-pure-logic-tests/main.swift` (harness swiftc chạy được không cần Xcode).
final class RouteReporterTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 2_000_000)

    private func sampleReport(identityHash: String = String(repeating: "a", count: 64)) -> RouteReporter.Report {
        RouteReporter.Report(
            platform: "ios",
            appVersion: "1.5.0",
            deviceId: "dev-1",
            credential: "cred-1",
            network: .init(type: .wifi, identityHash: identityHash, rawKbps: 21_300),
            current: .init(
                transport: .ws, node: "node-2", port: 8443,
                goodputKbps: 6_400, stableKbps: 6_400, rttMs: 1_800, reconnects: 2
            ),
            candidates: [
                .init(transport: .tcp, port: 8443, node: nil, connectMs: 120, rttMs: nil, result: "ok"),
                .init(transport: .udp, port: 8443, node: nil, connectMs: -1, rttMs: nil, result: "fail"),
            ]
        )
    }

    func testIdentityHashIsSHA256Hex() {
        let hash = RouteReporter.identityHash("wifi|Unicom|router-1")
        XCTAssertEqual(hash.count, 64)
        XCTAssertTrue(hash.allSatisfy { $0.isHexDigit })
        XCTAssertNotEqual(hash, RouteReporter.identityHash("cell|Mobile"))
    }

    func testBodyMatchesContractAndNeverLeaksRawIdentity() throws {
        let report = sampleReport()
        let body = RouteReporter.body(report)
        XCTAssertEqual(body["platform"] as? String, "ios")
        XCTAssertEqual(body["app_version"] as? String, "1.5.0")
        XCTAssertEqual(body["device_id"] as? String, "dev-1")
        XCTAssertEqual(body["credential"] as? String, "cred-1")

        let network = try XCTUnwrap(body["network"] as? [String: Any])
        XCTAssertEqual(network["identity_hash"] as? String, report.network.identityHash)
        XCTAssertNil(network["ssid"])
        XCTAssertNil(network["carrier_raw"])
        XCTAssertEqual(network["raw_kbps"] as? Double, 21_300)

        let current = try XCTUnwrap(body["current"] as? [String: Any])
        XCTAssertEqual(current["transport"] as? String, "ws")
        XCTAssertEqual(current["goodput_kbps"] as? Double, 6_400)
        XCTAssertEqual(current["reconnects"] as? Int, 2)

        XCTAssertEqual((body["candidates"] as? [[String: Any]])?.count, 2)
        XCTAssertNotNil(RouteReporter.bodyData(report), "body phải serialize được")
    }

    func testBodyCapsCandidatesAtSix() {
        let candidate = RouteReporter.Candidate(
            transport: .tcp, port: 1, node: nil, connectMs: nil, rttMs: nil, result: nil
        )
        var report = sampleReport()
        report.candidates = Array(repeating: candidate, count: 9)
        XCTAssertEqual((RouteReporter.body(report)["candidates"] as? [[String: Any]])?.count, 6)
    }

    func testDecodeRecommendedAndNull() throws {
        let ok = try XCTUnwrap(RouteReporter.decode(Data(
            #"{"recommended":{"transport":"tcp","port":8443,"node":"node-1","reason":"ws"}"#.utf8
        )))
        XCTAssertEqual(ok.recommended?.transport, .tcp)
        XCTAssertEqual(ok.recommended?.port, 8443)
        XCTAssertEqual(ok.recommended?.node, "node-1")

        let keep = try XCTUnwrap(RouteReporter.decode(Data(#"{"recommended":null,"ttl_s":1800}"#.utf8)))
        XCTAssertNil(keep.recommended)
        XCTAssertNil(RouteReporter.decode(Data("not json".utf8)))
    }

    /// §2f.1: chỉ đổi khi recommended KHÁC đường đang dùng + ttl còn hạn.
    func testShouldApplyOnlyWhenDifferentAndTtlValid() throws {
        let decision = try XCTUnwrap(RouteReporter.decode(Data(
            #"{"recommended":{"transport":"tcp","port":8443,"node":"node-1"},"ttl_s":1800}"#.utf8
        )))
        let report = sampleReport()
        XCTAssertTrue(RouteReporter.shouldApply(
            decision, current: report.current, receivedAt: t0, now: t0.addingTimeInterval(10)
        ))

        let same = RouteReporter.Current(
            transport: .tcp, node: "node-1", port: 8443,
            goodputKbps: 1, stableKbps: nil, rttMs: nil, reconnects: 0
        )
        XCTAssertFalse(RouteReporter.shouldApply(
            decision, current: same, receivedAt: t0, now: t0.addingTimeInterval(10)
        ))
        XCTAssertFalse(RouteReporter.shouldApply(
            decision, current: report.current, receivedAt: t0, now: t0.addingTimeInterval(1_801)
        ))
        XCTAssertFalse(RouteReporter.shouldApply(
            nil, current: report.current, receivedAt: t0, now: t0
        ), "server không trả lời ⇒ app tự quyết")
    }

    /// A9: nhịp ≤ 1 lần/5 phút/thiết bị.
    func testPacerEnforcesFiveMinuteCadence() {
        var pacer = RouteReporter.Pacer()
        XCTAssertTrue(pacer.shouldSend(deviceId: "d", now: t0))
        pacer.markSent(deviceId: "d", now: t0)
        XCTAssertFalse(pacer.shouldSend(deviceId: "d", now: t0.addingTimeInterval(299)))
        XCTAssertTrue(pacer.shouldSend(deviceId: "d", now: t0.addingTimeInterval(300)))
        XCTAssertTrue(pacer.shouldSend(deviceId: "other", now: t0.addingTimeInterval(1)))
        XCTAssertEqual(RouteReporter.decideTimeout, 2, "chờ server ≤ 2000 ms")
        XCTAssertEqual(RouteReporter.minInterval, 300, "nhịp ≤ 1 lần/5 phút")
    }
}
