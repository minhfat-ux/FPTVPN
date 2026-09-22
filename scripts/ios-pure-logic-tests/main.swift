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
    checkEqual(def.map(\.kind), [.quicDirect, .tcpRelay], "mặc định KHÔNG đổi node (§7.3 chưa chốt)")
    let opened = TransportLadder.canonicalRungs(
        primary: n1, others: [n2],
        options: TransportLadderOptions(allowsOtherNodeRungs: true)
    )
    checkEqual(
        opened.map(\.kind), [.quicDirect, .tcpRelay, .wsRelayOtherNode],
        "cho phép đổi node ⇒ có bậc WS node khác"
    )

    var ladder = TransportLadder(rungs: [quic, tcp])
    checkEqual(ladder.current, quic, "bắt đầu ở bậc đầu")
    checkEqual(ladder.nextPath(after: quic), tcp, "nâng lên TCP relay")
    check(ladder.nextPath(after: tcp) == nil, "hết thang ⇒ nil (giữ STABLE mức thấp nhất)")

    var opts = TransportLadderOptions()
    opts.allowsOtherNodeRungs = true
    opts.maxRampUps = 2
    var capped = TransportLadder(rungs: [quic, tcp, wsOther], options: opts)
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
