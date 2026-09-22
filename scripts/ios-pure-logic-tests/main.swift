// Harness `swiftc` cho ba file THUẦN LOGIC của gói tốc độ & ổn định (T-20260922-10, P0-1/P0-2).
//
// Chạy: bash scripts/ios-pure-logic-tests/run.sh
//
// Vì sao không dùng thẳng XCTest: target `PrivateVPNTests` cần dựng cả app (framework Hysteria,
// libwg-go, ký) — không chạy được trên máy chỉ có toolchain. Harness này compile đúng ba file
// production (`LivenessWatchdog`, `TransportLadder`, `GoodputMeter`) với `swiftc` và khẳng định
// cùng các luật như `iOS/PrivateVPNTests/*.swift`, nên số PASS ở đây là bằng chứng chạy thật.

import Foundation

var checks = 0
var failures = 0

func check(_ condition: Bool, _ message: String) {
    checks += 1
    if condition {
        print("  PASS  \(message)")
    } else {
        failures += 1
        print("  FAIL  \(message)")
    }
}

func checkEqual<T: Equatable>(_ lhs: T, _ rhs: T, _ message: String) {
    check(lhs == rhs, "\(message) (got \(lhs), want \(rhs))")
}

let t0 = Date(timeIntervalSince1970: 1_000_000)

// MARK: - LivenessWatchdog (A5)

print("LivenessWatchdog — A5: im >=15s VA bat doi xung")
do {
    let dog = LivenessWatchdog(now: t0)
    checkEqual(dog.interval, 15, "nhịp 15s")
    checkEqual(dog.silenceLimit, 15, "ngưỡng im 15s (A5, không phải 60s)")
    checkEqual(dog.strikesToRebuild, 1, "1 nhịp là đủ kết luận (A5, không chờ 3 nhịp)")

    var a = LivenessWatchdog(now: t0)
    checkEqual(
        a.tick(now: t0.addingTimeInterval(14), fromGo: 0, toGo: 200, rampInFlight: false),
        .idle,
        "14s: chưa đủ ngưỡng"
    )
    checkEqual(
        a.tick(now: t0.addingTimeInterval(15), fromGo: 0, toGo: 500, rampInFlight: false),
        .rebuild,
        "15s + máy vẫn gửi ⇒ rebuild ngay"
    )

    var b = LivenessWatchdog(now: t0)
    checkEqual(
        b.tick(now: t0.addingTimeInterval(600), fromGo: 0, toGo: 0, rampInFlight: false),
        .idle,
        "người dùng ngồi yên (đối xứng) ⇒ KHÔNG kết luận"
    )

    var c = LivenessWatchdog(now: t0)
    checkEqual(
        c.tick(now: t0.addingTimeInterval(300), fromGo: nil, toGo: nil, rampInFlight: false),
        .idle,
        "không đọc được bộ đếm ⇒ idle"
    )

    var d = LivenessWatchdog(now: t0, interval: 15, silenceLimit: 15, strikesToRebuild: 3)
    checkEqual(
        d.tick(now: t0.addingTimeInterval(16), fromGo: 0, toGo: 300, rampInFlight: false),
        .strike(1),
        "cơ chế đếm strike còn dùng được (1/3)"
    )
    checkEqual(
        d.tick(now: t0.addingTimeInterval(31), fromGo: 0, toGo: 600, rampInFlight: false),
        .strike(2),
        "cơ chế đếm strike còn dùng được (2/3)"
    )
    checkEqual(
        d.tick(now: t0.addingTimeInterval(46), fromGo: 0, toGo: 900, rampInFlight: false),
        .rebuild,
        "đủ 3 strike ⇒ rebuild"
    )

    var e = LivenessWatchdog(now: t0)
    checkEqual(
        e.tick(now: t0.addingTimeInterval(300), fromGo: 0, toGo: 5_000, rampInFlight: true),
        .idle,
        "đang ramp băng thông ⇒ nhường, coi như sống"
    )
}

// MARK: - LivenessWatchdog pha HOLD (chốt 22/09/2026: không closeTun)

print("LivenessWatchdog — HOLD: giu duong da chon + ping tiep, KHONG bao gio rebuild/teardown")
do {
    var h = LivenessWatchdog(now: t0)
    h.beginHold(now: t0.addingTimeInterval(100), fromGo: 1_000, toGo: 500)
    checkEqual(h.holdPings, 0, "vào HOLD: chưa ping lần nào")

    checkEqual(
        h.holdTick(now: t0.addingTimeInterval(115), fromGo: 1_000, toGo: 800),
        .waiting(1),
        "im ⇒ ping lần 1 (không trả rebuild ⇒ không teardown)"
    )
    checkEqual(
        h.holdTick(now: t0.addingTimeInterval(130), fromGo: 1_000, toGo: 1_200),
        .waiting(2),
        "vẫn im dù máy gửi ⇒ ping lần 2, KHÔNG cắt VPN"
    )
    checkEqual(
        h.holdTick(now: t0.addingTimeInterval(145), fromGo: nil, toGo: nil),
        .waiting(3),
        "không đọc được bộ đếm ⇒ vẫn chỉ là một lần ping, không kết luận hỏng"
    )
    checkEqual(
        h.holdTick(now: t0.addingTimeInterval(160), fromGo: 1_500, toGo: 1_500),
        .networkBack,
        "có byte chiều VỀ ⇒ mạng về"
    )
    checkEqual(h.holdPings, 3, "đếm đúng số lần ping đã chờ")

    var reset = LivenessWatchdog(now: t0)
    reset.beginHold(now: t0, fromGo: 10, toGo: 10)
    _ = reset.holdTick(now: t0.addingTimeInterval(15), fromGo: 10, toGo: 20)
    reset.resetAfterRebuild(now: t0.addingTimeInterval(16), fromGo: 0, toGo: 0)
    checkEqual(reset.holdPings, 0, "thoát HOLD (dựng lại được) ⇒ xoá đếm ping")
}

// MARK: - TransportLadder (P0-2)

print("TransportLadder — QUIC → TCP → WS node khác, một chiều, trần 3")
do {
    let n1 = TransportLadderNode(
        nodeID: "vn1hy", host: "node1.example", quicPort: 8443, tcpRelayPort: 9444,
        wsRelayURL: URL(string: "wss://relay.example/vn1hy")!
    )
    let n2 = TransportLadderNode(
        nodeID: "vn2hy", host: "node2.example", quicPort: 8443, tcpRelayPort: 9444,
        wsRelayURL: URL(string: "wss://relay.example/vn2hy")!
    )
    let quic = TransportPath(kind: .quicDirect, nodeID: "vn1hy", host: "node1.example", port: 8443)
    let tcp = TransportPath(kind: .tcpRelay, nodeID: "vn1hy", host: "node1.example", port: 9444)
    let wsOther = TransportPath(
        kind: .wsRelayOtherNode, nodeID: "vn2hy", host: "node2.example", port: 8443,
        relayURL: URL(string: "wss://relay.example/vn2hy")!
    )

    let def = TransportLadder.canonicalRungs(primary: n1, others: [n2])
    checkEqual(
        def.map(\.kind), [.quicDirect, .tcpRelay, .wsRelayOtherNode],
        "mặc định CÓ bậc node khác (chốt 22/09: node khác là bậc hợp lệ)"
    )

    var gated = TransportLadder(rungs: [quic, tcp, wsOther])
    checkEqual(gated.nextPath(after: quic), tcp, "lên bậc TCP cùng node bình thường")
    check(gated.nextPath(after: tcp) == nil, "CHƯA có chứng minh kênh dò ⇒ KHÔNG nhảy node khác")
    gated.markProven(nodeID: "vn2hy")
    checkEqual(gated.nextPath(after: tcp), wsOther, "kênh dò chứng minh ⇒ mở bậc node khác")

    var ladder = TransportLadder(rungs: [quic, tcp])
    checkEqual(ladder.current, quic, "bắt đầu ở bậc đầu")
    checkEqual(ladder.nextPath(after: quic), tcp, "nâng lên TCP relay")
    check(ladder.nextPath(after: tcp) == nil, "hết thang ⇒ nil (giữ STABLE mức thấp nhất)")

    var opts = TransportLadderOptions()
    opts.maxRampUps = 2
    var capped = TransportLadder(rungs: [quic, tcp, wsOther], options: opts)
    capped.markProven(nodeID: "vn2hy")
    _ = capped.nextPath(after: quic)
    _ = capped.nextPath(after: tcp)
    check(capped.nextPath(after: wsOther) == nil, "trần ramp 2 lần/phiên (A4)")
    checkEqual(capped.rampUps, 2, "đếm đúng số lần nâng")

    var mem = TransportLadder(rungs: [quic, tcp])
    mem.remember(good: tcp)
    checkEqual(mem.remembered, tcp, "nhớ bậc đã đạt (A3)")
    mem.reset()
    checkEqual(mem.rampUps, 0, "reset xoá trạng thái phiên")
    checkEqual(mem.restore(), tcp, "restore về bậc đã nhớ")

    checkEqual(TransportLadder(rungs: [quic, quic, tcp]).rungs.count, 2, "lọc bậc trùng")
    checkEqual(quic.label, "quic-direct@vn1hy", "nhãn log")
    checkEqual(wsOther.label, "ws-relay-node-khac@vn2hy", "nhãn log node khác")
    var empty = TransportLadder(rungs: [])
    check(empty.current == nil && empty.nextPath(after: nil) == nil, "thang rỗng không sập")
}

// MARK: - NodeUpgradePolicy (chốt 22/09: cho phép nâng node, kèm chốt chặn)

print("NodeUpgradePolicy — node khác chỉ lên khi kênh dò chứng minh >=1,25x x2; ưu tiên node khách chọn")
do {
    var policy = NodeUpgradePolicy(priorityNodeID: "vn1hy")
    checkEqual(
        policy.recordProbe(candidateNodeID: "vn2hy", speedVsCurrent: 1.4, currentNodeID: "vn1hy"),
        NodeUpgradePolicy.Decision.stay,
        "1 lần nhanh hơn 1,4x ⇒ CHƯA đổi node (cần 2 lần liên tiếp)"
    )
    checkEqual(
        policy.recordProbe(candidateNodeID: "vn2hy", speedVsCurrent: 1.3, currentNodeID: "vn1hy"),
        NodeUpgradePolicy.Decision.upgrade(nodeID: "vn2hy"),
        "2 lần liên tiếp ≥1,25x ⇒ được lên bậc node khác"
    )
    checkEqual(
        policy.recordProbe(candidateNodeID: "vn2hy", speedVsCurrent: 1.15, currentNodeID: "vn1hy"),
        NodeUpgradePolicy.Decision.stay,
        "dưới ngưỡng 1,25x ⇒ không đổi"
    )
    checkEqual(
        policy.recordProbe(candidateNodeID: "vn3hy", speedVsCurrent: 1.3, currentNodeID: "vn1hy"),
        NodeUpgradePolicy.Decision.stay,
        "chuỗi bị đứt ⇒ lần sau lại phải đủ 2 liên tiếp"
    )
    // Node khách đã chọn sống lại và ngang bằng ⇒ quay về ngay.
    checkEqual(
        policy.recordProbe(candidateNodeID: "vn1hy", speedVsCurrent: 1.0, currentNodeID: "vn2hy"),
        NodeUpgradePolicy.Decision.returnToPriority(nodeID: "vn1hy"),
        "node khách chọn sống lại, ngang bằng ⇒ quay về"
    )
    checkEqual(
        policy.recordProbe(candidateNodeID: "vn2hy", speedVsCurrent: 1.0, currentNodeID: "vn2hy"),
        NodeUpgradePolicy.Decision.stay,
        "dò chính node đang chạy ⇒ không làm gì"
    )
}

// MARK: - GoodputMeter (P0-2)

print("GoodputMeter — cửa sổ trượt 12s/mẫu 1s")
do {
    var meter = GoodputMeter()
    checkEqual(meter.goodputKbps, 0, "chưa có mẫu ⇒ 0")
    check(!meter.hasMeasurement, "chưa đủ mẫu ⇒ chưa có số đo")

    _ = meter.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0)
    checkEqual(
        meter.addSample(now: t0.addingTimeInterval(10), fromGoBytes: 10_000_000, toGoBytes: 0),
        8_000,
        "10 MB / 10 s = 8000 kbps (đúng mốc 8 Mbps của yêu cầu)"
    )
    check(meter.hasMeasurement, "đã có số đo")

    var sliding = GoodputMeter(window: 12, sampleInterval: 1)
    for second in 0...30 {
        _ = sliding.addSample(
            now: t0.addingTimeInterval(Double(second)),
            fromGoBytes: second * 125_000,
            toGoBytes: 0
        )
    }
    checkEqual(sliding.goodputKbps, 1_000, "1 Mbps đều ⇒ cửa sổ 12s giữ số đo")
    check(sliding.samples.count <= 14, "mẫu cũ hơn 12s bị bỏ (còn \(sliding.samples.count))")

    var regress = GoodputMeter()
    _ = regress.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0)
    _ = regress.addSample(now: t0.addingTimeInterval(5), fromGoBytes: 5_000_000, toGoBytes: 0)
    checkEqual(
        regress.addSample(now: t0.addingTimeInterval(6), fromGoBytes: 0, toGoBytes: 0),
        0,
        "bộ đếm tụt (transport mới) ⇒ đo lại, không ra số âm"
    )
    checkEqual(regress.samples.count, 1, "xoá mẫu cũ khi bộ đếm tụt")

    var up = GoodputMeter()
    _ = up.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0)
    _ = up.addSample(now: t0.addingTimeInterval(10), fromGoBytes: 0, toGoBytes: 2_500_000)
    checkEqual(up.goodputKbps, 0, "không tải xuống ⇒ goodput 0")
    checkEqual(up.uploadKbps, 2_000, "tải lên 2 Mbps đo riêng")

    var busy = GoodputMeter(busyBytesPerSecond: 2_000)
    _ = busy.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0)
    _ = busy.addSample(now: t0.addingTimeInterval(1), fromGoBytes: 20_000, toGoBytes: 0)
    check(busy.isBusy, "20 000 B/s ⇒ đang bận")
    check(!busy.isIdle(for: 5, now: t0.addingTimeInterval(3)), "mới bận 2s ⇒ chưa rảnh 5s")
    _ = busy.addSample(now: t0.addingTimeInterval(8), fromGoBytes: 20_000, toGoBytes: 0)
    check(!busy.isBusy, "hết tải ⇒ không bận")
    check(busy.isIdle(for: 5, now: t0.addingTimeInterval(8)), "im 7s ⇒ rảnh ≥5s (điều kiện mở kênh dò)")
}

print("")
print("KẾT QUẢ: \(checks - failures)/\(checks) PASS, \(failures) FAIL")
exit(failures == 0 ? 0 : 1)
