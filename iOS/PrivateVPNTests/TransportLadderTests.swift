import XCTest

/// Tests cho `TransportLadder` — thang nâng cấp ĐƯỜNG + NODE (yêu cầu §2c, A1/A3/A4).
///
/// Thuần logic, không I/O. Bám các luật: một chiều (không hạ bậc), nhớ bậc đã đạt (A3), trần số
/// lần nâng trong phiên (A4), và chốt 22/09/2026 — đổi node khác là bậc HỢP LỆ nhưng chỉ lên khi
/// kênh dò chứng minh (≥1,25× ×2).
final class TransportLadderTests: XCTestCase {

    private let n1 = TransportLadderNode(
        nodeID: "vn1hy",
        host: "node1.example",
        quicPort: 8443,
        tcpRelayPort: 9444,
        wsRelayURL: URL(string: "wss://relay.example/vn1hy")!
    )
    private let n2 = TransportLadderNode(
        nodeID: "vn2hy",
        host: "node2.example",
        quicPort: 8443,
        tcpRelayPort: 9444,
        wsRelayURL: URL(string: "wss://relay.example/vn2hy")!
    )

    private var quic: TransportPath {
        TransportPath(kind: .quicDirect, nodeID: "vn1hy", host: "node1.example", port: 8443)
    }
    private var tcp: TransportPath {
        TransportPath(kind: .tcpRelay, nodeID: "vn1hy", host: "node1.example", port: 9444)
    }
    private var wsOther: TransportPath {
        TransportPath(
            kind: .wsRelayOtherNode,
            nodeID: "vn2hy",
            host: "node2.example",
            port: 8443,
            relayURL: URL(string: "wss://relay.example/vn2hy")!
        )
    }

    /// Thang mặc định: QUIC → TCP → WS node khác (chốt 22/09: node khác là bậc hợp lệ).
    func testCanonicalRungsIncludeOtherNodeByDefault() {
        let rungs = TransportLadder.canonicalRungs(primary: n1, others: [n2])
        XCTAssertEqual(rungs.map(\.kind), [.quicDirect, .tcpRelay, .wsRelayOtherNode])
        XCTAssertEqual(rungs.map(\.nodeID), ["vn1hy", "vn1hy", "vn2hy"])
    }

    /// Bậc node khác bị CHẶN cho tới khi kênh dò chứng minh (chốt chặn §4.1(1)).
    func testOtherNodeRungRequiresProbeProof() {
        var ladder = TransportLadder(rungs: [quic, tcp, wsOther])
        XCTAssertEqual(ladder.nextPath(after: quic), tcp)
        XCTAssertNil(ladder.nextPath(after: tcp), "chưa có chứng minh ⇒ không nhảy node khác")
        ladder.markProven(nodeID: "vn2hy")
        XCTAssertEqual(ladder.nextPath(after: tcp), wsOther)
    }

    /// Nâng bậc là MỘT CHIỀU: quic → tcp, hết thang thì nil (giữ STABLE ở mức thấp nhất).
    func testNextPathIsOneWayAndExhausts() {
        var ladder = TransportLadder(rungs: [quic, tcp])
        XCTAssertEqual(ladder.current, quic)
        XCTAssertEqual(ladder.nextPath(after: quic), tcp)
        XCTAssertEqual(ladder.current, tcp)
        XCTAssertNil(ladder.nextPath(after: tcp))
        XCTAssertEqual(ladder.rampUps, 1)
    }

    /// Trần số lần nâng bậc trong phiên (A4).
    func testRampUpsAreCapped() {
        var options = TransportLadderOptions()
        options.maxRampUps = 2
        var ladder = TransportLadder(rungs: [quic, tcp, wsOther], options: options)
        ladder.markProven(nodeID: "vn2hy")
        XCTAssertEqual(ladder.nextPath(after: quic), tcp)
        XCTAssertEqual(ladder.nextPath(after: tcp), wsOther)
        XCTAssertNil(ladder.nextPath(after: wsOther))
        XCTAssertEqual(ladder.rampUps, 2)
        XCTAssertFalse(ladder.canAdvance)
    }

    /// Nhớ bậc đã đạt (A3) rồi phiên sau `restore()` bắt đầu đúng từ đó.
    func testRememberAndRestoreBestPath() {
        var ladder = TransportLadder(rungs: [quic, tcp])
        ladder.remember(good: tcp)
        XCTAssertEqual(ladder.remembered, tcp)
        // Phiên mới trên cùng thang (bản sao), reset rồi restore ⇒ về đúng bậc đã nhớ.
        var next = ladder
        next.reset()
        XCTAssertEqual(next.restore(), tcp)
        XCTAssertEqual(next.current, tcp)
    }

    /// `reset()` xoá trạng thái một phiên nhưng GIỮ bậc đã nhớ (kiến thức giữa các phiên).
    func testResetKeepsRememberedPath() {
        var ladder = TransportLadder(rungs: [quic, tcp])
        ladder.remember(good: tcp)
        _ = ladder.nextPath(after: quic)
        ladder.reset()
        XCTAssertEqual(ladder.rampUps, 0)
        XCTAssertEqual(ladder.remembered, tcp)
    }

    /// Thang rỗng không sập; `current`/`nextPath` đều nil.
    func testEmptyLadderIsSafe() {
        var ladder = TransportLadder(rungs: [])
        XCTAssertNil(ladder.current)
        XCTAssertNil(ladder.nextPath(after: nil))
        XCTAssertFalse(ladder.canAdvance)
    }

    /// Đường trùng nhau bị lọc, không tạo hai bậc giống hệt.
    func testDuplicatesAreDeduped() {
        let ladder = TransportLadder(rungs: [quic, quic, tcp])
        XCTAssertEqual(ladder.rungs.count, 2)
    }

    /// Nhãn log ổn định để đối chiếu bằng chứng trên thiết bị.
    func testLabelFormat() {
        XCTAssertEqual(quic.label, "quic-direct@vn1hy")
        XCTAssertEqual(tcp.label, "tcp-relay@vn1hy")
        XCTAssertEqual(wsOther.label, "ws-relay-node-khac@vn2hy")
    }

    // MARK: - NodeUpgradePolicy (chốt 22/09: cho phép nâng node, kèm chốt chặn)

    /// Chỉ lên bậc node khác khi kênh dò chứng minh ≥1,25× ở 2 lần LIÊN TIẾP.
    func testUpgradeRequiresTwoConsecutiveProvenProbes() {
        var policy = NodeUpgradePolicy(priorityNodeID: "vn1hy")
        XCTAssertEqual(
            policy.recordProbe(candidateNodeID: "vn2hy", speedVsCurrent: 1.4, currentNodeID: "vn1hy"),
            .stay
        )
        XCTAssertEqual(
            policy.recordProbe(candidateNodeID: "vn2hy", speedVsCurrent: 1.3, currentNodeID: "vn1hy"),
            .upgrade(nodeID: "vn2hy")
        )
    }

    /// Dưới ngưỡng (hoặc đứt chuỗi) thì không đổi node.
    func testBelowThresholdOrBrokenStreakStays() {
        var policy = NodeUpgradePolicy()
        _ = policy.recordProbe(candidateNodeID: "vn2hy", speedVsCurrent: 1.4, currentNodeID: "vn1hy")
        XCTAssertEqual(
            policy.recordProbe(candidateNodeID: "vn2hy", speedVsCurrent: 1.1, currentNodeID: "vn1hy"),
            .stay
        )
        XCTAssertEqual(
            policy.recordProbe(candidateNodeID: "vn3hy", speedVsCurrent: 1.3, currentNodeID: "vn1hy"),
            .stay
        )
    }

    /// Node khách đã chọn sống lại và ngang bằng ⇒ quay về ngay (chốt chặn §4.1(2)).
    func testReturnToPriorityWhenAliveAndParity() {
        var policy = NodeUpgradePolicy(priorityNodeID: "vn1hy")
        XCTAssertEqual(
            policy.recordProbe(candidateNodeID: "vn1hy", speedVsCurrent: 1.0, currentNodeID: "vn2hy"),
            .returnToPriority(nodeID: "vn1hy")
        )
    }

    /// Dò chính node đang chạy không làm gì.
    func testProbingCurrentNodeStays() {
        var policy = NodeUpgradePolicy(priorityNodeID: "vn1hy")
        XCTAssertEqual(
            policy.recordProbe(candidateNodeID: "vn2hy", speedVsCurrent: 2.0, currentNodeID: "vn2hy"),
            .stay
        )
    }
}
