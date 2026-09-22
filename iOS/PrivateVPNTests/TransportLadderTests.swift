import XCTest

/// Tests cho `TransportLadder` — thang nâng cấp ĐƯỜNG + NODE (yêu cầu §2c, A1/A3/A4).
///
/// Thuần logic, không I/O. Bám các luật: một chiều (không hạ bậc), nhớ bậc đã đạt (A3), trần số
/// lần nâng trong phiên (A4), và câu hỏi mở §7.3 (đổi node khác) là một CỜ tắt mặc định.
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

    /// Thang mặc định: QUIC → TCP; KHÔNG có node khác khi cờ §7.3 còn tắt.
    func testCanonicalRungsExcludeOtherNodeByDefault() {
        let rungs = TransportLadder.canonicalRungs(primary: n1, others: [n2])
        XCTAssertEqual(rungs.map(\.kind), [.quicDirect, .tcpRelay])
        XCTAssertEqual(rungs.map(\.nodeID), ["vn1hy", "vn1hy"])
    }

    /// Khi chủ dự án cho phép đổi node: thêm bậc WS relay của node khác, đúng thứ tự cuối thang.
    func testCanonicalRungsIncludeOtherNodeWhenAllowed() {
        let options = TransportLadderOptions(allowsOtherNodeRungs: true)
        let rungs = TransportLadder.canonicalRungs(primary: n1, others: [n2], options: options)
        XCTAssertEqual(rungs.map(\.kind), [.quicDirect, .tcpRelay, .wsRelayOtherNode])
        XCTAssertEqual(rungs.last?.nodeID, "vn2hy")
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
        options.allowsOtherNodeRungs = true
        options.maxRampUps = 2
        var ladder = TransportLadder(rungs: [quic, tcp, wsOther], options: options)
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
}
