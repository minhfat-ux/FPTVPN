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

/// Khoá server TỪ CHỐI trong body `/v1/route-report` (luật riêng tư §2f.3).
let forbiddenRouteKeys: Set<String> = [
    "ssid", "bssid", "ip", "ip_address", "email", "phone", "password", "token",
    "carrier_raw", "hostname", "url", "payload", "content",
]

func containsForbiddenKey(_ value: Any) -> Bool {
    if let dict = value as? [String: Any] {
        for (key, child) in dict {
            if forbiddenRouteKeys.contains(key.lowercased()) { return true }
            if containsForbiddenKey(child) { return true }
        }
    } else if let array = value as? [Any] {
        return array.contains { containsForbiddenKey($0) }
    }
    return false
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

// MARK: - LivenessWatchdog (24/09/2026 tối): "một gói về" KHÔNG đủ — luật SYN không SYN-ACK

print("LivenessWatchdog — dong nho giot ve KHONG cuu duoc duong hong (SYN ma khong SYN-ACK)")
do {
    // Số lấy từ ca thật 24/09 22:23→22:56 trên iPhone: mỗi 15 s máy gửi ~180 gói mà chỉ ~10 gói về,
    // relay đứng im; watchdog cũ trả `.alive` suốt 32 phút ⇒ khách "Connected mà không có mạng".
    var syn = LivenessWatchdog(now: t0, interval: 15, silenceLimit: 15, strikesToRebuild: 2)
    checkEqual(
        syn.tick(
            now: t0.addingTimeInterval(15), fromGo: 10, toGo: 500,
            synToGo: 2, synAckFromGo: 0, countsTCPHandshake: true, rampInFlight: false
        ),
        .idle,
        "SYN mới mà chưa đủ 15 s ⇒ chưa kết luận (không báo oan lúc mới mở luồng)"
    )
    checkEqual(
        syn.tick(
            now: t0.addingTimeInterval(30), fromGo: 12, toGo: 900,
            synToGo: 3, synAckFromGo: 0, countsTCPHandshake: true, rampInFlight: false
        ),
        .strike(1),
        "≥15 s có SYN mới mà 0 SYN-ACK ⇒ strike, DÙ vẫn có gói nhỏ giọt về"
    )
    checkEqual(
        syn.tick(
            now: t0.addingTimeInterval(45), fromGo: 14, toGo: 1_300,
            synToGo: 4, synAckFromGo: 0, countsTCPHandshake: true, rampInFlight: false
        ),
        .rebuild,
        "đủ 2 strike ⇒ tự dựng lại transport"
    )

    // Đường TỐT: SYN-ACK về ⇒ sống, KHÔNG strike (kể cả khi có SYN mới).
    var healthy = LivenessWatchdog(now: t0, interval: 15, silenceLimit: 15, strikesToRebuild: 1)
    checkEqual(
        healthy.tick(
            now: t0.addingTimeInterval(15), fromGo: 900, toGo: 500,
            synToGo: 2, synAckFromGo: 2, countsTCPHandshake: true, rampInFlight: false
        ),
        .alive,
        "SYN-ACK về bình thường ⇒ .alive, không strike"
    )

    // Upload lớn KHÔNG bị bắt oan: không có SYN mới (bắt tay đã xong) ⇒ luật SYN không chạy.
    var upload = LivenessWatchdog(now: t0, interval: 15, silenceLimit: 15, strikesToRebuild: 1)
    _ = upload.tick(
        now: t0.addingTimeInterval(15), fromGo: 400, toGo: 400,
        synToGo: 5, synAckFromGo: 5, countsTCPHandshake: true, rampInFlight: false
    )
    checkEqual(
        upload.tick(
            now: t0.addingTimeInterval(30), fromGo: 405, toGo: 5_000,
            synToGo: 5, synAckFromGo: 5, countsTCPHandshake: true, rampInFlight: false
        ),
        .alive,
        "đang UPLOAD (không SYN mới, ít gói về) ⇒ .alive — KHÔNG được là .strike/.rebuild"
    )
}

// MARK: - LivenessWatchdog (Android parity): may day goi vao cau ma relay KHONG nhan frame

print("LivenessWatchdog — Android parity: 'may → cau co goi, cau → relay khong frame' ⇒ rebuild")
do {
    // Số lấy từ ca thật 24/09 22:23→22:56: bridge `packetFlow→Go` leo +180 gói/15 s trong khi
    // `ws-relay: heartbeat udpFrames=23094` ĐÓNG BĂNG >30 s.
    var r = LivenessWatchdog(now: t0, interval: 15, silenceLimit: 15, strikesToRebuild: 2)
    checkEqual(
        r.tick(
            now: t0.addingTimeInterval(15), fromGo: 10, toGo: 500,
            relayFramesSent: 23_094, rampInFlight: false
        ),
        .alive,
        "nhịp đầu thấy relay còn nhận frame mới ⇒ sống"
    )
    checkEqual(
        r.tick(
            now: t0.addingTimeInterval(35), fromGo: 12, toGo: 900,
            relayFramesSent: 23_094, rampInFlight: false
        ),
        .idle,
        "bắt đầu cửa sổ kẹt: máy đẩy 400 gói mà udpFrames đứng yên — chưa đủ 20 s"
    )
    checkEqual(
        r.tick(
            now: t0.addingTimeInterval(55), fromGo: 14, toGo: 1_300,
            relayFramesSent: 23_094, rampInFlight: false
        ),
        .strike(1),
        "≥20 s máy vẫn đẩy gói mà relay không nhận thêm frame ⇒ strike"
    )
    checkEqual(
        r.tick(
            now: t0.addingTimeInterval(70), fromGo: 16, toGo: 1_700,
            relayFramesSent: 23_094, rampInFlight: false
        ),
        .rebuild,
        "đủ 2 strike ⇒ tự dựng lại transport (KHÔNG để Connected giả)"
    )

    // Relay CÓ nhận frame ⇒ không kết luận hỏng.
    var ok = LivenessWatchdog(now: t0, interval: 15, silenceLimit: 15, strikesToRebuild: 1)
    _ = ok.tick(
        now: t0.addingTimeInterval(15), fromGo: 10, toGo: 500,
        relayFramesSent: 100, rampInFlight: false
    )
    checkEqual(
        ok.tick(
            now: t0.addingTimeInterval(35), fromGo: 12, toGo: 900,
            relayFramesSent: 140, rampInFlight: false
        ),
        .alive,
        "relay có nhận thêm frame ⇒ .alive"
    )
}

// MARK: - LivenessWatchdog H2 (24/09/2026): toGoOffered = toGo + toGoDropped

print("LivenessWatchdog H2 — toGo dong bang + toGoDropped tang ⇒ PHAI rebuild, khong .idle")
do {
    // Số lấy từ phiên hỏng thật (relay.log): toGo đóng băng ở 2387, toGoDropped 13→4285.
    var h2 = LivenessWatchdog(now: t0)
    checkEqual(
        h2.tick(
            now: t0.addingTimeInterval(15), fromGo: 2_387, toGo: 2_387,
            toGoDropped: 13, rampInFlight: false
        ),
        .alive,
        "nhịp đầu có byte chiều VỀ ⇒ sống, chốt mốc máy-vẫn-gửi = 2387+13"
    )
    checkEqual(
        h2.tick(
            now: t0.addingTimeInterval(30), fromGo: 2_387, toGo: 2_387,
            toGoDropped: 4_285, rampInFlight: false
        ),
        .rebuild,
        "toGo ĐÓNG BĂNG mà toGoDropped 13→4285 ⇒ máy VẪN gửi ⇒ rebuild (KHÔNG .idle)"
    )

    // Chống báo oan: gói cầu bỏ cũng đứng yên (người dùng ngồi yên) ⇒ KHÔNG kết luận.
    var quiet = LivenessWatchdog(now: t0)
    _ = quiet.tick(
        now: t0.addingTimeInterval(15), fromGo: 500, toGo: 500, toGoDropped: 10, rampInFlight: false
    )
    checkEqual(
        quiet.tick(
            now: t0.addingTimeInterval(30), fromGo: 500, toGo: 500,
            toGoDropped: 10, rampInFlight: false
        ),
        .idle,
        "cả toGo lẫn toGoDropped đứng yên ⇒ người dùng ngồi yên ⇒ idle (không gỡ oan)"
    )
    checkEqual(quiet.strikes, 0, "đối xứng ⇒ không tăng strike")

    // `toGoDropped` mặc định 0 ⇒ hành vi cũ giữ nguyên (dùng cho nguồn không đếm được gói bỏ).
    var legacy = LivenessWatchdog(now: t0)
    checkEqual(
        legacy.tick(now: t0.addingTimeInterval(15), fromGo: 0, toGo: 500, rampInFlight: false),
        .rebuild,
        "không truyền toGoDropped: toGo 0→500 vẫn đủ kết luận như trước"
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

// MARK: - RouteReporter (A9, hợp đồng /v1/route-report)

print("RouteReporter — A9: gửi số đo lên server, chỉ đổi khi server bảo")

do {
    let hash = RouteReporter.identityHash("wifi|Unicom|router-1")
    checkEqual(hash.count, 64, "identity_hash là sha256 hex 64 ký tự")
    check(hash.allSatisfy { $0.isHexDigit }, "identity_hash toàn hex")
    check(RouteReporter.identityHash("a") != RouteReporter.identityHash("b"), "định danh khác ⇒ băm khác")
    checkEqual(RouteReporter.identityHash("x"), RouteReporter.identityHash("x"), "băm ổn định")

    let report = RouteReporter.Report(
        platform: "ios",
        appVersion: "1.5.0",
        deviceId: "dev-1",
        credential: "cred-1",
        network: .init(type: .wifi, identityHash: hash, rawKbps: 21_300),
        current: .init(
            transport: .ws, node: "node-2", port: 8443,
            goodputKbps: 6_400, stableKbps: 6_400, rttMs: 1_800, reconnects: 2
        ),
        candidates: [
            .init(transport: .tcp, port: 8443, node: nil, connectMs: 120, rttMs: nil, result: "ok"),
            .init(transport: .udp, port: 8443, node: nil, connectMs: -1, rttMs: nil, result: "fail"),
            .init(transport: .ws, port: nil, node: "node-1", connectMs: nil, rttMs: 1_500, result: nil),
        ]
    )
    let body = RouteReporter.body(report)
    checkEqual(body["platform"] as? String, "ios", "platform")
    checkEqual(body["app_version"] as? String, "1.5.0", "app_version")
    checkEqual(body["device_id"] as? String, "dev-1", "device_id")
    checkEqual(body["credential"] as? String, "cred-1", "credential")
    let network = body["network"] as? [String: Any]
    checkEqual(network?["identity_hash"] as? String, hash, "network gửi BĂM, không phải giá trị thô")
    checkEqual(network?["raw_kbps"] as? Double, 21_300, "raw_kbps")
    let currentBody = body["current"] as? [String: Any]
    checkEqual(currentBody?["transport"] as? String, "ws", "current.transport")
    checkEqual(currentBody?["goodput_kbps"] as? Double, 6_400, "current.goodput_kbps")
    checkEqual((body["candidates"] as? [[String: Any]])?.count, 3, "candidates đủ 3")
    check(!containsForbiddenKey(body), "body KHÔNG chứa khoá định danh thô (server từ chối)")

    let many = RouteReporter.Report(
        platform: "ios", appVersion: "1", deviceId: "d", credential: "c",
        network: .init(type: .cell, identityHash: hash, rawKbps: 0),
        current: .init(
            transport: .udp, node: nil, port: nil,
            goodputKbps: 0, stableKbps: nil, rttMs: nil, reconnects: 0
        ),
        candidates: Array(
            repeating: RouteReporter.Candidate(
                transport: .tcp, port: 1, node: nil, connectMs: nil, rttMs: nil, result: nil
            ),
            count: 9
        )
    )
    checkEqual((RouteReporter.body(many)["candidates"] as? [[String: Any]])?.count, 6, "cắt candidates còn 6")

    let okData = Data(
        #"{"recommended":{"transport":"tcp","port":8443,"node":"node-1","reason":"ws la nút thắt"},"ttl_s":1800}"#.utf8
    )
    let decoded = RouteReporter.decode(okData)
    checkEqual(decoded?.recommended?.transport, .tcp, "decode transport")
    checkEqual(decoded?.recommended?.port, 8443, "decode port")
    checkEqual(decoded?.ttlS, 1_800, "decode ttl")
    check(RouteReporter.decode(Data(#"{"recommended":null,"ttl_s":1800}"#.utf8))?.recommended == nil,
          "recommended:null ⇒ giữ nguyên")
    check(RouteReporter.decode(Data("not json".utf8)) == nil, "response hỏng ⇒ nil")

    let received = t0
    check(
        RouteReporter.shouldApply(decoded, current: report.current, receivedAt: received, now: received.addingTimeInterval(10)),
        "khác đường + ttl còn hạn ⇒ ĐỔI"
    )
    let samePath = RouteReporter.Current(
        transport: .tcp, node: "node-1", port: 8443,
        goodputKbps: 1, stableKbps: nil, rttMs: nil, reconnects: 0
    )
    check(
        !RouteReporter.shouldApply(decoded, current: samePath, receivedAt: received, now: received.addingTimeInterval(10)),
        "trùng đường đang dùng ⇒ KHÔNG đổi"
    )
    check(
        !RouteReporter.shouldApply(decoded, current: report.current, receivedAt: received, now: received.addingTimeInterval(1_801)),
        "ttl hết hạn ⇒ KHÔNG đổi"
    )
    check(
        !RouteReporter.shouldApply(nil, current: report.current, receivedAt: received, now: received),
        "server không trả lời ⇒ app tự quyết"
    )

    var pacer = RouteReporter.Pacer()
    let now = Date(timeIntervalSince1970: 2_000_000)
    check(pacer.shouldSend(deviceId: "d", now: now), "lần đầu gửi")
    pacer.markSent(deviceId: "d", now: now)
    check(!pacer.shouldSend(deviceId: "d", now: now.addingTimeInterval(299)), "chưa đủ 5 phút ⇒ không gửi")
    check(pacer.shouldSend(deviceId: "d", now: now.addingTimeInterval(300)), "đủ 5 phút ⇒ gửi")
    check(pacer.shouldSend(deviceId: "other", now: now.addingTimeInterval(1)), "thiết bị khác có nhịp riêng")
}

// MARK: - ChinaRouteBypass (A7, dải IP TQ đi thẳng)

print("ChinaRouteBypass — A7: dải IP TQ đi thẳng, không qua tunnel")

do {
    let sample = """
    # comment
    1.0.1.0/24
    1.0.1.5/24        # chuẩn hoá về .0
    1.0.2.0/23

    0.0.0.0/0
    not-a-cidr
    1.0.8.0/33
    1.0.8.0/21
    """
    let parsed = ChinaRouteBypass.parse(sample)
    checkEqual(parsed, ["1.0.1.0/24", "1.0.2.0/23", "1.0.8.0/21"], "bỏ comment/trùng/prefix 0/sai, chuẩn hoá")
    checkEqual(ChinaRouteBypass.prefixMask(24), "255.255.255.0", "mask /24")
    checkEqual(ChinaRouteBypass.prefixMask(8), "255.0.0.0", "mask /8")
    checkEqual(ChinaRouteBypass.prefixMask(32), "255.255.255.255", "mask /32")
    checkEqual(ChinaRouteBypass.normalizedCIDR("192.168.1.7/24"), "192.168.1.0/24", "chuẩn hoá địa chỉ")
    check(ChinaRouteBypass.normalizedCIDR("300.1.1.1/24") == nil, "octet > 255 ⇒ nil")
    let capped = ChinaRouteBypass.parse(
        (1...10).map { "10.0.\($0).0/24" }.joined(separator: "\n"),
        limit: 3
    )
    checkEqual(capped.count, 3, "tôn trọng trần số dải")
    checkEqual(ChinaRouteBypass.uint32ToIPv4(ChinaRouteBypass.ipv4ToUInt32("1.2.3.4")!), "1.2.3.4", "round-trip IPv4")

    // IPv6 (cn6.txt): TQ đi thẳng, `::/0` bị loại vì sẽ rò toàn bộ IPv6.
    let sample6 = """
    # comment
    2001:250::/30
    2001:250::/30
    ::/0
    not-an-ipv6
    2001:db8::1/129
    2400:cb00::/32
    """
    checkEqual(ChinaRouteBypass.parseIPv6(sample6), ["2001:250::/30", "2400:cb00::/32"], "parse IPv6 + bỏ ::/0/trùng/sai")
    checkEqual(ChinaRouteBypass.normalizedIPv6CIDR("::1/128"), "::1/128", "IPv6 ::1/128")
    check(ChinaRouteBypass.normalizedIPv6CIDR("2400:cb00::/129") == nil, "prefix IPv6 > 128 ⇒ nil")
    check(ChinaRouteBypass.normalizedIPv6CIDR("1.2.3.4/24") == nil, "IPv4 không lọt vào parse IPv6")

    // A7 bước 2 (macOS, 25/09/2026): gộp `cn.txt` + `tencent-meeting.txt` — thuần logic.
    checkEqual(
        ChinaRouteBypass.merge(["1.0.1.0/24", "1.0.2.0/23"], ["1.0.2.0/23", "43.129.0.0/16"]),
        ["1.0.1.0/24", "1.0.2.0/23", "43.129.0.0/16"],
        "merge: giữ thứ tự, bỏ trùng giữa hai danh sách"
    )
    checkEqual(ChinaRouteBypass.merge(["1.0.1.0/24"], ["1.0.2.0/24"], limit: 1).count, 1,
               "merge: trần áp SAU khi gộp (không vượt maxRoutes)")
    check(ChinaRouteBypass.merge([], []).isEmpty, "merge: hai danh sách rỗng ⇒ rỗng")

    // 26/09/2026 — VÁ RÒ IPv6 TRÊN 5G (chủ dự án xác nhận 5G là IPv6).
    //
    // Thuộc tính phải giữ: `ipv6Settings.includedRoutes = [::/0]` khiến MỌI IPv6 vào tunnel, nên
    // dải của RELAY bắt buộc phải nằm trong `excludedRoutes` — thiếu là kết nối của extension tới
    // relay bị hút vào tunnel rồi ĐEN ⇒ tái diễn đúng sự cố "mất mạng khi connect" của bản
    // `18f8c82` (22/09/2026). Test này chốt lại điều đó để không ai gỡ mất danh sách.
    check(!HysteriaDefaults.relayIPv6ExcludedCIDRs.isEmpty,
          "vá IPv6: danh sách loại trừ relay KHÔNG được rỗng")
    check(HysteriaDefaults.relayIPv6ExcludedCIDRs.contains("2606:4700::/32"),
          "vá IPv6: phải có 2606:4700::/32 — dải Cloudflare mà relay api.meetflowai.site trỏ vào")
    checkEqual(
        ChinaRouteBypass.excludedRoutesV6(from: HysteriaDefaults.relayIPv6ExcludedCIDRs).count,
        HysteriaDefaults.relayIPv6ExcludedCIDRs.count,
        "vá IPv6: MỌI dải loại trừ parse được thành NEIPv6Route (không dòng hỏng)"
    )
    // Tách nhỏ thay vì viết closure trong `check`: compiler báo "unable to type-check in
    // reasonable time" với biểu thức gộp (đã gặp thật 26/09/2026).
    let relayV6Routes = ChinaRouteBypass.excludedRoutesV6(from: HysteriaDefaults.relayIPv6ExcludedCIDRs)
    var cloudflareV6RouteFound = false
    for route in relayV6Routes {
        if route.destinationAddress == "2606:4700::"
            && route.destinationNetworkPrefixLength.intValue == 32 {
            cloudflareV6RouteFound = true
            break
        }
    }
    check(cloudflareV6RouteFound,
          "vá IPv6: route 2606:4700::/32 phải có mặt ⇒ relay đi THẲNG, không bị hút vào tunnel")
    // Bất biến phía Go: utun CÓ IPv6 nhưng Go vẫn nhận rỗng ⇒ `Inet6Address = nil` ⇒ gói IPv6 vào
    // tunnel bị BỎ (app lùi về IPv4) thay vì bị chuyển tiếp tới server không có IPv6.
    checkEqual(HysteriaDefaults.tunIPv6CIDR, "", "vá IPv6: Go vẫn nhận rỗng (Inet6Address = nil)")
    check(ChinaRouteBypass.isValidIPv6(HysteriaDefaults.tunIPv6Address),
          "vá IPv6: địa chỉ utun IPv6 phải hợp lệ")

    // P2 — IPv6 không chở được thì trả ICMPv6 "Destination Unreachable" NGAY (Android parity),
    // thay vì để gói IPv6 biến mất im lặng (app treo) hoặc đi thẳng ra ngoài (rò).
    //
    // 26/09/2026 — MÃ LỖI PHẢI LÀ 4, không phải 0. Bằng chứng (đo thật bản macOS 1.4.7/22 +
    // mã nguồn XNU): `icmp6_input` xếp code 0/3 vào `PRC_UNREACH_NET`, và `tcp_notify` chỉ ghi
    // `tp->t_softerror` cho nhóm đó ⇒ TCP **vẫn retransmit SYN** tới `t_rxtshift > 3` ⇒ `curl -6`
    // treo **4,0 s** (5 SYN vào tunnel). Chỉ code 4 = `PRC_UNREACH_PORT` mới vào
    // `tcp_drop_syn_sent` (`net.inet.tcp.icmp_may_rst=1`) ⇒ `connect()` trả ECONNREFUSED NGAY.
    var v6 = [UInt8](repeating: 0, count: 48)
    v6[0] = 0x60; v6[6] = 6; v6[7] = 64
    for i in 0..<16 { v6[8 + i] = 0x20 }
    for i in 0..<16 { v6[24 + i] = 0x30 }
    switch IPv6Reject.destinationUnreachable(ipv6Packet: v6) {
    case .unreachable(let reply):
        checkEqual(reply.count, 40 + 8 + 48, "P2: độ dài = IPv6(40) + ICMPv6(8) + gói gốc(48)")
        checkEqual(reply[0] >> 4, 6, "P2: version = 6")
        checkEqual(Int(reply[6]), Int(IPv6Reject.nextHeaderICMPv6), "P2: next header = 58 (ICMPv6)")
        checkEqual(reply[40], 1, "P2: ICMPv6 type 1 (Destination Unreachable)")
        checkEqual(Int(reply[41]), Int(IPv6Reject.codePortUnreachable),
                   "P2: MẶC ĐỊNH code 4 (port unreachable) — code 0 làm TCP treo 4 s rồi mới bỏ")
        checkEqual(Int(reply[7]), Int(IPv6Reject.hopLimit), "P2: hop limit hợp lý")
        checkEqual(Int(reply[4]) << 8 | Int(reply[5]), 8 + 48,
                   "P2: payload length = ICMPv6(8) + gói gốc(48)")
        checkEqual(Array(reply[24..<40]), Array(v6[8..<24]), "P2: đích = nguồn gói gốc (trả về đúng máy)")
        checkEqual(Array(reply[48..<(48 + 48)]), v6, "P2: phần trích dẫn = nguyên gói gốc")
        // Checksum phải TỰ KIỂM: zero ô checksum rồi tính lại phải ra đúng giá trị đã ghi.
        var zeroed = Array(reply[40...])
        let stored = UInt16(reply[42]) << 8 | UInt16(reply[43])
        zeroed[2] = 0; zeroed[3] = 0
        checkEqual(
            IPv6Reject.icmpv6Checksum(source: Array(reply[8..<24]), destination: Array(reply[24..<40]),
                                     message: zeroed),
            stored,
            "P2: checksum ICMPv6 khớp (tự kiểm lại)"
        )
    case .notIPv6, .ignoreICMPv6:
        check(false, "P2: gói IPv6 TCP phải dựng được ICMPv6 unreachable")
    }
    // Code 0 vẫn phải dựng ĐÚNG (giữ để tham chiếu/dự phòng) — kiểm cả checksum để không ai
    // "sửa" hàm mà bỏ qua byte code (checksum phủ cả byte code).
    if case .unreachable(let noRoute) = IPv6Reject.destinationUnreachable(
        ipv6Packet: v6, code: IPv6Reject.codeNoRoute
    ) {
        checkEqual(noRoute[41], 0, "P2: truyền code 0 ⇒ code 0 trong gói")
        var zeroed = Array(noRoute[40...])
        let stored = UInt16(noRoute[42]) << 8 | UInt16(noRoute[43])
        zeroed[2] = 0; zeroed[3] = 0
        checkEqual(
            IPv6Reject.icmpv6Checksum(source: Array(noRoute[8..<24]),
                                     destination: Array(noRoute[24..<40]), message: zeroed),
            stored,
            "P2: checksum cũng đúng khi code = 0"
        )
    } else {
        check(false, "P2: code 0 phải dựng được")
    }
    var v4 = [UInt8](repeating: 0, count: 48); v4[0] = 0x45
    check(IPv6Reject.destinationUnreachable(ipv6Packet: v4) == .notIPv6, "P2: IPv4 ⇒ notIPv6")
    check(IPv6Reject.destinationUnreachable(ipv6Packet: [UInt8](repeating: 0, count: 20)) == .notIPv6,
          "P2: gói cụt ⇒ notIPv6")
    // ICMPv6 LỖI (type < 128; ở đây byte type = 0) ⇒ BỎ IM LẶNG: trả lỗi cho lỗi là sai RFC 4443
    // §2.4(e) và có thể thành vòng.
    var icmp6 = v6; icmp6[6] = IPv6Reject.nextHeaderICMPv6
    check(IPv6Reject.destinationUnreachable(ipv6Packet: icmp6) == .ignoreICMPv6,
          "P2: ICMPv6 lỗi (type < 128) ⇒ BỎ IM LẶNG (không trả lỗi cho lỗi)")
    // `ping6` (Echo Request, type 128) thì PHẢI trả lỗi: im lặng ⇒ ping6 chờ hết thời gian chờ
    // (đo thật: `ping6 -c1` mất 11,0 s). Echo Request là THÔNG TIN nên trả lỗi là hợp lệ.
    var echo = v6; echo[6] = IPv6Reject.nextHeaderICMPv6
    echo[IPv6Reject.ipv6HeaderLength] = IPv6Reject.typeEchoRequest
    if case .unreachable(let echoUnreachable) = IPv6Reject.destinationUnreachable(ipv6Packet: echo) {
        checkEqual(Int(echoUnreachable[41]), Int(IPv6Reject.codePortUnreachable),
                   "P2: Echo Request ⇒ trả ICMPv6 unreachable code 4 (để ping6 báo lỗi, không treo)")
    } else {
        check(false, "P2: Echo Request phải được trả lỗi (không được bỏ im lặng)")
    }
    var other6 = echo; other6[IPv6Reject.ipv6HeaderLength] = 129   // Echo Reply
    check(IPv6Reject.destinationUnreachable(ipv6Packet: other6) == .ignoreICMPv6,
          "P2: ICMPv6 thông tin khác (Echo Reply 129) ⇒ bỏ im lặng")
    // Đích MULTICAST (`ff00::/8`) ⇒ KHÔNG bao giờ trả lỗi (RFC 4443 §2.4(c)). Trên macOS route
    // `ff00::/8` của utun có thật nên MLD/ND của chính tunnel đi vào cầu — thiếu chốt này là
    // tunnel tự trả lỗi cho gói điều khiển của chính nó.
    var multicast = v6; multicast[24] = 0xFF; multicast[25] = 0x02
    check(IPv6Reject.destinationUnreachable(ipv6Packet: multicast) == .ignoreICMPv6,
          "P2: đích multicast ⇒ bỏ im lặng (không trả lỗi cho MLD/ND)")
    check(HysteriaDefaults.blockIPv6,
          "P2: mặc định PHẢI BẬT chặn IPv6 (hạ tầng chỉ có IPv4) — đổi phải có lý do + báo cáo")
    var big = [UInt8](repeating: 0, count: 4000); big[0] = 0x60; big[6] = 6
    if case .unreachable(let r) = IPv6Reject.destinationUnreachable(ipv6Packet: big) {
        checkEqual(r.count, 40 + 8 + IPv6Reject.maxQuotedBytes, "P2: gói lớn ⇒ trích tối đa 1232 byte")
    } else {
        check(false, "P2: gói lớn phải dựng được")
    }

    // F3 (`HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md`) — cửa relay dự phòng KHÔNG được đổi node:
    // đổi hostname, GIỮ NGUYÊN path (path chứa mã node). Mượn relay node khác = QUIC sai đích im lặng.
    let vn1Relay = "wss://api.meetflowai.site/relay/vn1hy"
    let alternates = HysteriaDefaults.sameNodeRelayAlternates(for: vn1Relay)
    checkEqual(alternates.first ?? "", "wss://t1.meetflowai.site/relay/vn1hy",
               "F3: chỉ đổi host api→t1, giữ path /relay/vn1hy")
    check(alternates.allSatisfy { $0.hasSuffix("/relay/vn1hy") },
          "F3: KHÔNG cửa nào nhảy sang node khác")
    checkEqual(HysteriaDefaults.sameNodeRelayAlternates(for: "").count, 0,
               "F3: node không khai relay ⇒ KHÔNG mượn cửa của node khác")
    checkEqual(HysteriaDefaults.sameNodeRelayAlternates(for: "wss://la.example/relay/vn9hy").count, 0,
               "F3: host lạ ⇒ không đoán (thà một cửa còn hơn một cửa sai node)")
    checkEqual(HysteriaDefaults.sameNodeRelayAlternates(for: "wss://t1.meetflowai.site/relay/vn2hy").first ?? "",
               "wss://api.meetflowai.site/relay/vn2hy", "F3: chiều ngược t1 → api")

    // F4 — ngân sách phiên PHẢI đủ cho MỌI cửa (bản 26/09 viết cứng 35 s < 4 × 10 s = 40 s).
    let budget = HysteriaDefaults.sessionStartBudget
    let neededForAllDoors = HysteriaDefaults.relayOpenGrace * Double(HysteriaDefaults.maxRelayDoorsPerNode)
    check(budget > neededForAllDoors,
          "F4: sessionStartBudget \(budget)s phải LỚN HƠN \(neededForAllDoors)s (số cửa tối đa × grace)")
    checkEqual(HysteriaDefaults.sameNodeRelayAlternates(for: vn1Relay).count,
               HysteriaDefaults.maxRelayDoorsPerNode - 1,
               "F4: số cửa mỗi node khớp maxRelayDoorsPerNode (dự phòng = max - 1)")

    // Cờ RÚT LUI của A7 macOS (tắt được để quay về bước 1 — 4 dải LAN).
    check(ChinaRouteBypass.bypassEnabled(compiledDefault: true, override: nil),
          "cờ rút lui: không ghi đè ⇒ theo mặc định biên dịch (BẬT)")
    check(!ChinaRouteBypass.bypassEnabled(compiledDefault: true, override: false),
          "cờ rút lui: ghi đè false ⇒ TẮT (về bước 1)")
    check(ChinaRouteBypass.bypassEnabled(compiledDefault: false, override: true),
          "cờ rút lui: ghi đè true thắng mặc định biên dịch")

    // FILE THẬT phải bao đúng các IP Tencent Meeting đã resolve 25/09/2026 — chúng KHÔNG có
    // trong `cn.txt` (đã kiểm bằng `ipaddress`), nên thiếu file này là A7 vô hiệu với app họp.
    let tencentPath = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("docs/routes/tencent-meeting.txt")
    let tencentText = (try? String(contentsOf: tencentPath, encoding: .utf8)) ?? ""
    let tencent = ChinaRouteBypass.parse(tencentText)
    check(!tencent.isEmpty, "đọc được docs/routes/tencent-meeting.txt ⇒ \(tencent.count) dải")
    for required in [
        "129.226.0.0/16", "43.129.0.0/16", "43.175.0.0/16", "43.128.0.0/16", "43.174.0.0/16",
        "43.157.0.0/16", "42.187.185.0/24", "42.187.186.0/24", "1.13.136.0/24", "1.13.137.0/24",
        "110.40.160.0/24", "110.40.161.0/24", "106.55.204.0/24", "106.55.205.0/24",
        "139.186.243.0/24",
    ] {
        check(tencent.contains(required), "tencent-meeting.txt có \(required)")
    }
    for ip in ["43.129.255.19", "129.226.103.131", "43.175.44.35"] {
        check(tencent.contains { cidr in
            let parts = cidr.split(separator: "/", maxSplits: 1)
            guard parts.count == 2, let prefix = Int(parts[1]),
                  let maskText = ChinaRouteBypass.prefixMask(prefix),
                  let mask = ChinaRouteBypass.ipv4ToUInt32(maskText),
                  let network = ChinaRouteBypass.ipv4ToUInt32(String(parts[0])),
                  let target = ChinaRouteBypass.ipv4ToUInt32(ip) else { return false }
            return (target & mask) == (network & mask)
        }, "IP thật \(ip) nằm trong tencent-meeting.txt")
    }
    checkEqual(ChinaRouteBypass.merge(tencent, tencent).count, tencent.count,
               "gộp danh sách với chính nó ⇒ không nhân đôi dải")

    // macOS dùng ĐÚNG bộ tài nguyên như iOS (chủ dự án chốt 25/09/2026): cn.txt + Tencent Meeting.
    // Chốt bằng số thật lấy từ chính file production, không phải mẫu tự nghĩ.
    let cnPath = tencentPath.deletingLastPathComponent().appendingPathComponent("cn.txt")
    let cnList = ChinaRouteBypass.parse((try? String(contentsOf: cnPath, encoding: .utf8)) ?? "")
    check(cnList.count > 5000, "cn.txt production đọc được ⇒ \(cnList.count) dải (> 5.000)")
    let phased = ChinaRouteBypass.platformRoutes(cn: cnList, tencent: tencent)
    checkEqual(phased.count, cnList.count + tencent.count,
               "danh sách nạp = cn.txt + Tencent Meeting (\(cnList.count) + \(tencent.count))")
    check(phased.contains("119.28.0.0/15"), "có dải của cn.txt (119.28.0.0/15)")
    checkEqual(Array(phased.prefix(2)), Array(cnList.prefix(2)), "cn.txt đứng trước, giữ nguyên thứ tự")
    checkEqual(Array(phased.suffix(2)), Array(tencent.suffix(2)), "Tencent Meeting nối ở cuối")
    check(ChinaRouteBypass.sourceLabel.contains("cn.txt")
            && ChinaRouteBypass.sourceLabel.contains("tencent-meeting.txt"),
          "nhãn log nêu đủ nguồn: \(ChinaRouteBypass.sourceLabel)")
    for ip in ["43.129.255.19", "129.226.103.131", "43.175.44.35"] {
        check(phased.contains { cidr in
            let parts = cidr.split(separator: "/", maxSplits: 1)
            guard parts.count == 2, let prefix = Int(parts[1]),
                  let maskText = ChinaRouteBypass.prefixMask(prefix),
                  let mask = ChinaRouteBypass.ipv4ToUInt32(maskText),
                  let network = ChinaRouteBypass.ipv4ToUInt32(String(parts[0])),
                  let target = ChinaRouteBypass.ipv4ToUInt32(ip) else { return false }
            return (target & mask) == (network & mask)
        }, "IP meeting \(ip) đi THẲNG trong bản nạp")
    }
}

// MARK: - RampStatus A11 (§2h): khai báo an toàn trước, ramp sau

print("RampStatus A11 — khai bao an toan truoc: do x0,8; loss cao <= 4/1 Mbps; cam ramp khi loss cao")

do {
    // Có số đo ⇒ khai = đo được × tỉ lệ (24/09/2026: 0,85, khớp Android `DECLARE_RATIO_PCT`).
    let measured = RampStatus.safeDeclaration(
        measuredDownKbps: 10_000, rememberedDownKbps: 0,
        staticDownKbps: 100_000, staticUpKbps: 30_000, highLoss: false
    )
    checkEqual(measured.downKbps, 8_500, "đo 10 Mbps ⇒ khai 8,5 Mbps (=0,85×, khớp Android)")
    checkEqual(measured.reason, "measured", "lý do = measured")
    check(measured.downKbps * 100 <= 10_000 * RampStatus.declareRatioPct,
          "down KHÔNG vượt tỉ lệ khai × số đo")

    // Chưa có số đo nhưng có số nhớ ⇒ min(nấc tĩnh, nhớ × 0,6).
    let remembered = RampStatus.safeDeclaration(
        measuredDownKbps: 0, rememberedDownKbps: 20_000,
        staticDownKbps: 100_000, staticUpKbps: 30_000, highLoss: false
    )
    checkEqual(remembered.downKbps, 12_000, "nhớ 20 Mbps ⇒ min(100, 12) = 12 Mbps")
    checkEqual(remembered.upKbps, 3_600, "chiều lên theo tỉ lệ nấc tĩnh 30/100")

    // Không có cả số đo lẫn số nhớ ⇒ nấc tĩnh (đường lùi an toàn, không chặn kết nối).
    let staticFallback = RampStatus.safeDeclaration(
        measuredDownKbps: 0, rememberedDownKbps: 0,
        staticDownKbps: 100_000, staticUpKbps: 30_000, highLoss: false
    )
    checkEqual(staticFallback.downKbps, 100_000, "không có gì ⇒ nấc tĩnh")
    checkEqual(staticFallback.reason, "static", "lý do = static")

    // Loss cao ⇒ BỎ best cũ, khởi điểm ≤ 4 Mbps down / 1 Mbps up.
    let lossy = RampStatus.safeDeclaration(
        measuredDownKbps: 20_000, rememberedDownKbps: 80_000,
        staticDownKbps: 100_000, staticUpKbps: 30_000, highLoss: true
    )
    checkEqual(lossy.downKbps, 4_000, "loss cao ⇒ down ≤ 4 Mbps dù đo 20 Mbps")
    checkEqual(lossy.upKbps, 1_000, "loss cao ⇒ up ≤ 1 Mbps")
    checkEqual(lossy.reason, "high-loss", "lý do = high-loss")
    check(lossy.highLoss, "cờ highLoss bật")

    // Cấm ramp khi loss cao; cần ≥2 lần chứng minh liên tiếp.
    check(RampStatus.canRampUp(lossPercent: 0, consecutiveProofs: 2), "loss thấp + 2 lần ⇒ được ramp")
    check(!RampStatus.canRampUp(lossPercent: 0, consecutiveProofs: 1), "mới 1 lần ⇒ CHƯA ramp")
    check(!RampStatus.canRampUp(lossPercent: 30, consecutiveProofs: 9), "loss ≥30% ⇒ CẤM ramp dù goodput cao")
    check(!RampStatus.canRampUp(lossPercent: 5, consecutiveProofs: 9), "loss 5% chỉ ở mức biên ⇒ cấm")
    check(RampStatus.requiresDownRamp(lossPercent: 30), "loss ≥30% ⇒ phải hạ khai")
    check(!RampStatus.requiresDownRamp(lossPercent: 29.9), "dưới 30% ⇒ chưa buộc hạ")
    checkEqual(RampStatus.downRampForceSeconds, 15, "hạ khai buộc áp trong ≤15 s (§2h luật 3)")
    checkEqual(RampStatus.declareRatioPct, 85,
               "tỉ lệ khai = 85% số đo (khớp Android BandwidthPolicy.DECLARE_RATIO_PCT)")
}

// MARK: - RampStatus A10 (§2g): số live trên thẻ Diagnostics

print("RampStatus A10 — dinh dang Mbps/kbps/— + % con len duoc + da toi da")

do {
    checkEqual(RampStatus.formatRate(nil), "—", "chưa có số ⇒ — (KHÔNG hiện 0)")
    checkEqual(RampStatus.formatRate(0), "—", "0 ⇒ — (tunnel chưa phục vụ)")
    checkEqual(RampStatus.formatRate(500), "500 kbps", "dưới 1 Mbps ⇒ kbps")
    checkEqual(RampStatus.formatRate(999), "999 kbps", "sát 1 Mbps vẫn kbps")
    checkEqual(RampStatus.formatRate(1_000), "1.0 Mbps", "1 Mbps ⇒ 1 chữ số thập phân")
    checkEqual(RampStatus.formatRate(8_450), "8.4 Mbps", "8,45 Mbps làm tròn 1 chữ số")
    checkEqual(RampStatus.formatRate(100_000), "100.0 Mbps", "100 Mbps")

    // Mục tiêu = min(đo × hệ số ramp, trần).
    checkEqual(
        RampStatus.nextTargetKbps(observedKbps: 6_000, ceilingKbps: nil, rampFactor: 1.25),
        7_500, "mục tiêu = 6 Mbps × 1,25 = 7,5 Mbps"
    )
    checkEqual(
        RampStatus.nextTargetKbps(observedKbps: 6_000, ceilingKbps: 7_000, rampFactor: 1.25),
        7_000, "mục tiêu bị kẹp trần 7 Mbps"
    )
    // % còn lên được = (mục tiêu / khai báo − 1) × 100, với hệ số của THẺ là 1,15 (android parity,
    // `HysteriaVpnService.kt:1191`) — KHÁC bước tăng thật của vòng ramp (1,25).
    checkEqual(
        RampStatus.morePercent(observedKbps: 6_000, declaredDownKbps: 4_800, ceilingKbps: nil),
        44, "+44% (6900/4800 − 1; 6 Mbps × 1,15 = 6,9 Mbps)"
    )
    checkEqual(
        RampStatus.morePercent(observedKbps: 6_000, declaredDownKbps: 9_000, ceilingKbps: nil),
        nil, "mục tiêu thấp hơn khai báo ⇒ không hứa headroom (—), không '+0%'"
    )
    check(RampStatus.isAtMax(observedKbps: 9_500, ceilingKbps: 10_000, probeNoGain: false),
          "đo ≥95% trần ⇒ Đã tối đa")
    check(!RampStatus.isAtMax(observedKbps: 9_000, ceilingKbps: 10_000, probeNoGain: false),
          "đo 90% trần ⇒ chưa tối đa")
    check(RampStatus.isAtMax(observedKbps: 1_000, ceilingKbps: nil, probeNoGain: true),
          "kênh dò kết luận no gain ⇒ Đã tối đa dù đo thấp")

    // Tunnel chưa phục vụ ⇒ xoá hết số (UI hiện —).
    let idle = RampStatus.display(
        serving: false, downKbps: 12_000, upKbps: 3_000, observedKbps: 6_000,
        declaredDownKbps: 4_800, declaredUpKbps: 1_440, ceilingKbps: 7_000,
        stableKbps: 4_800, probeNoGain: false
    )
    checkEqual(idle.downKbps, nil, "chưa phục vụ ⇒ down —")
    checkEqual(idle.observedKbps, nil, "chưa phục vụ ⇒ đo được —")
    checkEqual(idle.declaredDownKbps, nil, "chưa phục vụ ⇒ khai báo —")
    checkEqual(idle.morePercent, nil, "chưa phục vụ ⇒ % —")

    // Đang phục vụ: giữ số + % còn lên được.
    let live = RampStatus.display(
        serving: true, downKbps: 12_000, upKbps: 3_000, observedKbps: 6_000,
        declaredDownKbps: 4_800, declaredUpKbps: 1_440, ceilingKbps: 7_000,
        stableKbps: nil, probeNoGain: false
    )
    checkEqual(live.downKbps, 12_000, "đang phục vụ ⇒ giữ số down live")
    checkEqual(live.observedKbps, 6_000, "giữ số đo được")
    checkEqual(live.morePercent, 44, "6 Mbps × 1,15 (hệ số thẻ, android parity) = 6,9 Mbps / khai 4,8 ⇒ +44%")
    checkEqual(
        RampStatus.morePercent(observedKbps: 6_000, declaredDownKbps: 4_000, ceilingKbps: 6_500),
        63, "trần vẫn kẹp: min(6900, 6500)=6500 / khai 4000 ⇒ +63%"
    )
    check(live.atMax == false, "chưa tối đa")
    checkEqual(live.stableKbps, nil, "chưa STABLE ⇒ mức khoá —")

    let maxed = RampStatus.display(
        serving: true, downKbps: 9_600, upKbps: 2_880, observedKbps: 9_500,
        declaredDownKbps: 7_600, declaredUpKbps: 2_280, ceilingKbps: 10_000,
        stableKbps: 7_600, probeNoGain: false
    )
    check(maxed.atMax, "đo 95% trần ⇒ atMax")
    checkEqual(maxed.morePercent, nil, "atMax ⇒ không hiện % (chỉ hiện 'Đã tối đa')")

    // Kênh dò kết luận `no gain` ⇒ "Đã tối đa" dù chưa biết trần (đúng đường của provider:
    // `diagnostics()` truyền ceiling = nil cho tới khi có A8/probe).
    let noGain = RampStatus.display(
        serving: true, downKbps: 6_000, upKbps: 1_800, observedKbps: 5_800,
        declaredDownKbps: 5_000, declaredUpKbps: 1_500, ceilingKbps: nil,
        stableKbps: 5_000, probeNoGain: true
    )
    check(noGain.atMax, "probe no gain ⇒ atMax dù trần chưa biết")
    checkEqual(noGain.morePercent, nil, "no gain ⇒ không hiện % còn lên được")
    checkEqual(noGain.stableKbps, 5_000, "no gain ⇒ vẫn hiện mức đã khoá (stable)")
}

// MARK: - RampStatus.BandwidthPolicy — ĐỐI CHIẾU 1-1 VỚI ANDROID (BandwidthPolicyTest.kt)
//
// Nguồn sự thật: `android/.../BandwidthMemory.kt` (object BandwidthPolicy) + 24 test của nó.
// Mỗi case dưới đây ghi rõ tên case Android tương ứng; case nào iOS KHÔNG tái hiện được vì
// thiếu API (loss%/RTT của QUIC) thì ghi rõ ngay tại chỗ.

print("BandwidthPolicy (Android parity) — 4 dai 150/95/80, giam xoc 60, san 500/1000, best")

do {
    typealias Policy = RampStatus.BandwidthPolicy
    let staticUp = 30_000
    let staticDown = 100_000
    let mobileUp = 8_000
    let mobileDown = 12_000

    func decide(
        measured: Int,
        declared: Int = 0,
        up: Int = staticUp,
        down: Int = staticDown,
        ceiling: Int = 0,
        previous: Int = 0,
        best: Int = 0
    ) -> Policy.Decision {
        Policy.decide(
            rememberedMeasuredKbps: measured,
            rememberedDeclaredKbps: declared,
            staticUpKbps: up,
            staticDownKbps: down,
            ceilingDownKbps: ceiling,
            previousMeasuredKbps: previous,
            bestKbps: best
        )
    }

    // Android: `chua co so do thi dung dung nac tinh cu`.
    let fresh = decide(measured: 0)
    checkEqual(fresh.upKbps, staticUp, "chưa đo ⇒ up = nấc tĩnh")
    checkEqual(fresh.downKbps, staticDown, "chưa đo ⇒ down = nấc tĩnh")
    checkEqual(fresh.reason, Policy.reasonProfile, "chưa đo ⇒ reason=profile")
    let freshMobile = decide(measured: 0, up: mobileUp, down: mobileDown)
    checkEqual(freshMobile.downKbps, mobileDown, "chưa đo (di động) ⇒ đúng nấc tĩnh 8/12")

    // Android: `tran vat ly kep so khai xuong` + `tran vat ly cao hon nac tinh thi khong doi gi`.
    let capped = decide(measured: 0, ceiling: 25_200)
    checkEqual(capped.downKbps, 25_200, "trần vật lý 25,2 Mbps ⇒ kẹp down")
    check(capped.upKbps < staticUp, "up theo tỉ lệ 30/100 của nấc tĩnh")
    checkEqual(capped.reason, Policy.reasonClamp, "bị kẹp ⇒ reason=clamp")
    checkEqual(decide(measured: 0, ceiling: 389_700).reason, Policy.reasonProfile,
               "trần cao hơn nấc tĩnh ⇒ không đổi gì")

    // Android: `duong yeu hon so khai thi ha theo so do`.
    let weak = decide(measured: 40_000, declared: staticDown, previous: 40_000)
    checkEqual(weak.downKbps, 34_000, "đo 40 Mbps / khai 100 ⇒ 85% × 40 = 34 Mbps")
    checkEqual(weak.upKbps, 10_200, "up = 34 Mbps × 30/100")
    checkEqual(weak.reason, Policy.reasonMemory, "có số đo ⇒ reason=memory")

    // Android: `mot mau do xau khong keo so khai xuong day` (giảm xóc DAMPING_PCT=60).
    let damped = decide(measured: 573, declared: 100_000, previous: 40_000)
    checkEqual(damped.downKbps, 20_400, "mẫu tụt sâu ⇒ mốc 60% × 40 Mbps, không theo 573")
    checkEqual(damped.upKbps, 6_120, "up theo tỉ lệ 30/100, KHÔNG kéo lên nấc tĩnh")
    checkEqual(damped.reason, Policy.reasonMemory, "sàn nhỏ 1000 không đụng vào ⇒ memory")

    // Android: `mang tut that thi so khai di theo so do moi`.
    let reallySlow = decide(measured: 3_000, declared: 100_000, previous: 3_500)
    checkEqual(reallySlow.downKbps, 2_550, "mạng tụt thật ⇒ 85% × 3 Mbps")
    checkEqual(reallySlow.upKbps, 765, "up = 2,55 Mbps × 30/100")
    check(reallySlow.downKbps < staticDown, "đo 3 Mbps ⇒ KHÔNG khai nấc tĩnh 30/100")

    // Android: `do vuot xa so khai thi nhay len ngay theo so do`.
    let jumped = decide(measured: 40_000, declared: 1_000)
    checkEqual(jumped.downKbps, 34_000, "đo 40 Mbps trong khi khai 1 Mbps ⇒ nhảy lên 85% số đo")

    // Android: `do xap xi so dang khai thi gi nguyen khong ha 15 phan tram` (dải chết 80–95%).
    let deadband = decide(measured: 30_000, declared: 34_000)
    checkEqual(deadband.downKbps, 34_000, "đo 88% số khai ⇒ GIỮ NGUYÊN (không trôi dốc)")
    checkEqual(deadband.reason, Policy.reasonMemory, "dải chết vẫn là memory")

    // Android: `do cham tran so khai thi do len 15 phan tram`.
    let explored = decide(measured: 30_000, declared: 30_000)
    checkEqual(explored.downKbps, 34_500, "đo 100% số khai ⇒ dò lên 15%")
    checkEqual(explored.upKbps, 10_350, "up theo tỉ lệ 30/100")

    // Android: `buoc do len khong vuot tran cua nac tinh`.
    checkEqual(decide(measured: 98_000, declared: 100_000).downKbps, staticDown,
               "dò lên bị chặn ở trần nấc tĩnh 100 Mbps")

    // Android: `so do nho bat thuong thi bi kep san` (sàn 500/1000).
    let floored = decide(measured: 300, declared: 1_000)
    checkEqual(floored.downKbps, Policy.floorDownKbps, "số đo 300 kbps ⇒ kẹp SÀN 1000")
    checkEqual(floored.upKbps, Policy.floorUpKbps, "up kẹp sàn 500")
    checkEqual(floored.reason, Policy.reasonClamp, "bị sàn đổi số ⇒ reason=clamp")
    check(Policy.floorDownKbps < mobileDown && Policy.floorDownKbps < staticDown,
          "sàn nhỏ hơn MỌI nấc tĩnh (không được kéo số khai LÊN)")

    // Android: `do mot Mbps thi khong bao gio khai nac tinh mobile 8 tren 12`.
    let hotelWifi = decide(
        measured: 1_063, declared: mobileDown, up: mobileUp, down: mobileDown, previous: 1_555
    )
    checkEqual(hotelWifi.downKbps, Policy.floorDownKbps, "đo 1,06 Mbps ⇒ về sàn 1000, KHÔNG 12 Mbps")
    checkEqual(hotelWifi.upKbps, 602, "up = 1000 × 8/12 (giữ đúng tỉ lệ di động)")
    check(hotelWifi.downKbps < 2_000, "đo 1 Mbps ⇒ khai vài trăm–vài nghìn kbps")

    // Android: `co so do thi so khai la 85 phan tram so do chu khong phai nac tinh`.
    let mobile85 = decide(
        measured: 1_555, declared: mobileDown, up: mobileUp, down: mobileDown, previous: 639
    )
    checkEqual(mobile85.downKbps, 1_555 * RampStatus.declareRatioPct / 100,
               "số đo vượt xa số khai cũ ⇒ theo số đo mới (85%)")
    checkEqual(mobile85.upKbps, 880, "up = 1321 × 8/12")

    // Android: `so do khong bao gio khai cao hon nac tinh dang chay tot`.
    let veryFast = decide(measured: 400_000, declared: staticDown)
    check(veryFast.downKbps <= staticDown, "đo 400 Mbps vẫn không khai quá nấc tĩnh đang chạy tốt")

    // Android: `co dinh da dat thi khoi dong luon o muc do` + `dinh cua mang khac bi kep`.
    let withBest = decide(measured: 0, ceiling: 389_700, best: 25_000)
    checkEqual(withBest.downKbps, 25_000, "có ĐỈNH đã đạt ⇒ khởi động luôn ở mức đó")
    checkEqual(withBest.upKbps, 7_500, "up theo tỉ lệ 30/100, không kéo lên nấc tĩnh")
    checkEqual(withBest.reason, Policy.reasonMemory, "chỉ có đỉnh ⇒ vẫn là memory")
    checkEqual(withBest.ceilingDownKbps, 389_700, "trần lúc này là sức mạng VẬT LÝ, không phải nấc tĩnh")
    let bestCapped = decide(measured: 0, ceiling: 20_000, best: 25_000)
    checkEqual(bestCapped.downKbps, 20_000, "đổi sang AP yếu ⇒ đỉnh cũ bị kẹp theo trần mới")
    checkEqual(bestCapped.reason, Policy.reasonClamp, "bị kẹp ⇒ clamp")

    // Android: `ket noi lai nhieu lan thi hoi tu ve sat suc mang, khong troi doc`.
    var memoryMeasured = 0
    var memoryDeclared = 0
    var decisions: [Int] = []
    var achieved = 0
    let pathKbps = 40_000
    for _ in 0..<8 {
        let d = decide(measured: memoryMeasured, declared: memoryDeclared)
        decisions.append(d.downKbps)
        achieved = min(pathKbps, d.downKbps)
        memoryMeasured = achieved
        memoryDeclared = d.downKbps
    }
    checkEqual(decisions.first, staticDown, "lượt đầu chưa có số đo ⇒ nấc tĩnh")
    checkEqual(decisions[5], decisions[6], "hội tụ: lượt 6 = lượt 7")
    checkEqual(decisions[6], decisions[7], "hội tụ: lượt 7 = lượt 8 (không trôi dốc)")
    check(decisions.last! >= 40_000 && decisions.last! <= 52_000,
          "số khai quanh quẩn sức mạng thật (40 Mbps), got \(decisions.last!)")
    checkEqual(achieved, pathKbps, "tốc độ thực chạm trần sức mạng")
}

print("PreMeasurePolicy — 25/09/2026: DO GOODPUT TRU BAT TAY (bo mau CHI khi phan doc qua mong)")

// Vì sao bổ sung case MỚI (không sửa/xoá case nào khác): 25/09/2026 đổi CÁCH TÍNH của phép đo
// trước khi khai, sau log máy thật iPad `= 5409kbps (mat 2218ms)` vs phần đọc `38272kbps (313ms)`
// — lệch 7×. Luật nằm ở `RampStatus.PreMeasurePolicy` (hàm THUẦN) nên phải có case khẳng định.
//
// SỬA KỲ VỌNG (25/09/2026, theo review của agent chính): bản đầu bỏ mẫu khi bắt tay >1,5 s hoặc
// >50% tổng thời gian, và điều đó VỨT MẤT số đo tốt của đúng ca chủ dự án (bắt tay 86%, phần đọc
// 38272 kbps). Bắt tay là CHI PHÍ ĐỘ TRỄ CỐ ĐỊNH, không phải bằng chứng về băng thông ⇒ nay:
// bắt tay ≥200 ms thì LUÔN dùng số phần đọc, chỉ bỏ mẫu khi CHÍNH phần đọc quá mỏng (<200 ms hoặc
// <200 KB). Hai case cũ khẳng định `.reject` theo bắt tay (1500/1500 ms và 1501 ms) được thay bằng
// case khẳng định `.readWindow` — lý do ghi ngay tại chỗ.
do {
    typealias P = RampStatus.PreMeasurePolicy

    func choose(_ with: Int, _ without: Int, _ bytes: Int, _ total: Int, _ read: Int) -> P.Choice {
        P.choose(
            kbpsWithHandshake: with, kbpsWithoutHandshake: without,
            readBytes: bytes, totalMs: total, readMs: read
        )
    }
    func rejectReason(_ choice: P.Choice) -> String? {
        if case .reject(let why) = choice { return why }
        return nil
    }

    // Ngưỡng đã chốt (đổi số ở đây là đổi hành vi khai báo ⇒ phải sửa cả comment lý do).
    checkEqual(P.useReadWindowHandshakeMs, 200, "bắt tay ≥200 ms ⇒ dùng số của phần đọc")
    checkEqual(P.minReadMs, 200, "phần đọc <200 ms ⇒ bỏ mẫu (cửa sổ quá ngắn để tin)")
    checkEqual(P.minReadBytes, 200_000, "phần đọc <200 KB ⇒ bỏ mẫu (quá ít dữ liệu)")

    // ĐÚNG ca máy thật iPad (Wi-Fi khách sạn): bắt tay 1905 ms / 2218 ms = 86% tổng, nhưng phần
    // đọc DÀY (313 ms, 1,5 MB) ⇒ DÙNG 38272 kbps. Đây là case chính của bản sửa này.
    checkEqual(choose(5_409, 38_272, 1_500_000, 2_218, 313), .readWindow(38_272),
               "ca thật iPad: bắt tay 86% nhưng đọc 313 ms/1,5 MB ⇒ khai 38272, KHÔNG bỏ mẫu")
    check(rejectReason(choose(5_409, 38_272, 1_500_000, 2_218, 313)) == nil,
          "bắt tay TO không còn là lý do bỏ mẫu (bắt tay = chi phí độ trễ cố định)")

    // Bắt tay VỪA (250 ms / 2250 ms = 11%) ⇒ dùng số của phần đọc (đã trừ bắt tay).
    checkEqual(choose(6_000, 6_750, 1_500_000, 2_250, 2_000), .readWindow(6_750),
               "bắt tay 250 ms đáng kể ⇒ khai theo phần đọc 6750, KHÔNG 6000")

    // Bắt tay NHỎ (100 ms) ⇒ giữ nguyên cách tính Android (chênh <10%, dưới mức nhiễu).
    checkEqual(choose(8_000, 8_400, 1_500_000, 2_100, 2_000), .wholeRequest(8_000),
               "bắt tay 100 ms không đáng kể ⇒ giữ số kiểu Android")

    // Biên ngưỡng bắt tay 200 ms: 199 ⇒ giữ nguyên; 200 ⇒ dùng phần đọc; 0 ⇒ giữ nguyên.
    checkEqual(choose(10_000, 10_100, 1_500_000, 2_199, 2_000), .wholeRequest(10_000),
               "bắt tay 199 ms < 200 ⇒ giữ số kiểu Android")
    checkEqual(choose(10_000, 10_100, 1_500_000, 2_200, 2_000), .readWindow(10_100),
               "bắt tay đúng 200 ms ⇒ dùng số phần đọc")
    checkEqual(choose(9_000, 9_000, 1_500_000, 2_000, 2_000), .wholeRequest(9_000),
               "không có bắt tay (total = read) ⇒ giữ số kiểu Android")

    // Bắt tay VƯỢT 1,5 s VÀ chiếm >50% tổng (1600/3000 ms = 53%), phần đọc vẫn dày (1400 ms,
    // 1,5 MB) ⇒ VẪN dùng số phần đọc. Kỳ vọng MỚI: bản đầu bỏ mẫu ở đây (điều kiện tỉ lệ 50%) —
    // đó chính là chỗ làm mất số đo tốt mà review đã chỉ ra.
    checkEqual(choose(1_000, 20_000, 1_500_000, 3_000, 1_400), .readWindow(20_000),
               "bắt tay 1600/3000 ms (53%) + đọc dày ⇒ VẪN dùng số phần đọc")
    check(rejectReason(choose(1_000, 20_000, 1_500_000, 3_000, 1_400)) == nil,
          "không còn luật bỏ mẫu theo TỈ LỆ bắt tay (đã bỏ điều kiện 50%)")

    // Phần đọc QUÁ MỎNG theo THỜI GIAN (80 ms) ⇒ BỎ mẫu dù nhiều byte.
    let thinTime = choose(1_000, 2_000, 500_000, 2_000, 80)
    check(rejectReason(thinTime) != nil, "phần đọc 80 ms < 200 ms ⇒ BỎ mẫu")
    check(rejectReason(thinTime)?.contains("mỏng") == true,
          "lý do bỏ mẫu nói rõ phần đọc mỏng, got \(rejectReason(thinTime) ?? "nil")")

    // Phần đọc QUÁ ÍT DỮ LIỆU (40 KB) ⇒ BỎ mẫu dù thời gian dài.
    let thinBytes = choose(1_000, 2_000, 40_000, 2_000, 400)
    check(rejectReason(thinBytes) != nil, "phần đọc 40 KB < 200 KB ⇒ BỎ mẫu")
    check(rejectReason(thinBytes)?.contains("40") == true,
          "lý do bỏ mẫu in rõ số byte, got \(rejectReason(thinBytes) ?? "nil")")

    // Đúng ca review nêu: đọc 80 ms / 40 KB ⇒ BỎ mẫu.
    check(rejectReason(choose(1_000, 2_000, 40_000, 2_000, 80)) != nil,
          "ca review: đọc 80 ms / 40 KB ⇒ BỎ mẫu")

    // Biên của phần đọc: đúng 200 ms + đúng 200 KB ⇒ NHẬN; 199 ms hoặc 199.999 B ⇒ BỎ.
    checkEqual(choose(10_000, 10_100, 200_000, 2_200, 200), .readWindow(10_100),
               "phần đọc đúng 200 ms / 200 KB ⇒ nhận")
    check(rejectReason(choose(10_000, 10_100, 1_500_000, 2_200, 199)) != nil,
          "phần đọc 199 ms ⇒ bỏ mẫu")
    check(rejectReason(choose(10_000, 10_100, 199_999, 2_200, 400)) != nil,
          "phần đọc 199.999 B ⇒ bỏ mẫu")

    // Bắt tay <200 ms ⇒ KHÔNG xét độ dày của phần đọc (giữ nguyên công thức Android, đúng luật 3).
    checkEqual(choose(9_000, 9_000, 10_000, 1_000, 950), .wholeRequest(9_000),
               "bắt tay 50 ms ⇒ công thức cũ, không xét phần đọc dày/mỏng")
}

print("NetworkTier + StartupDeclaration — 25/09/2026: so do TUOI thang bo nho, kep nac tinh theo loai mang")

// Vì sao bổ sung case MỚI: `SessionState.init` (đường chạy thật) nay chốt số khai qua hàm THUẦN
// `RampStatus.StartupDeclaration` + `RampStatus.NetworkTier` thay vì gọi thẳng `decide` với nấc
// 30/100 cho mọi mạng. Bốn luật chủ dự án chốt 25/09/2026 (số đo tươi thắng bộ nhớ · kẹp nấc
// tĩnh theo loại mạng · kẹp best ≤1,5× số đo · mạng mới + đo hỏng ⇒ 8/12) chỉ có bằng chứng nếu
// có case ở đây; `BandwidthPolicy.decide` KHÔNG bị sửa nên mọi case cũ phía trên vẫn nguyên.
do {
    typealias S = RampStatus.StartupDeclaration
    typealias Policy = RampStatus.BandwidthPolicy

    func startup(
        fresh: Int,
        freshUp: Int = 0,
        hadMemory: Bool = false,
        measured: Int = 0,
        declared: Int = 0,
        previous: Int = 0,
        best: Int = 0,
        kind: String = "wifi",
        ceiling: Int = 0
    ) -> S.Result {
        S.decide(
            freshMeasuredDownKbps: fresh,
            freshMeasuredUpKbps: freshUp,
            hadMemory: hadMemory,
            rememberedMeasuredKbps: measured,
            rememberedDeclaredKbps: declared,
            rememberedPreviousMeasuredKbps: previous,
            rememberedBestKbps: best,
            networkKind: kind,
            ceilingDownKbps: ceiling
        )
    }

    // Nấc tĩnh theo loại mạng — đúng Android `Config.HY_*` / `Config.MOBILE_*`.
    checkEqual(RampStatus.NetworkTier.upKbps(kind: "cell"), 8_000, "di động ⇒ up 8 Mbps")
    checkEqual(RampStatus.NetworkTier.downKbps(kind: "cell"), 12_000, "di động ⇒ down 12 Mbps")
    checkEqual(RampStatus.NetworkTier.upKbps(kind: "wifi"), 30_000, "Wi-Fi ⇒ up 30 Mbps")
    checkEqual(RampStatus.NetworkTier.downKbps(kind: "wifi"), 100_000, "Wi-Fi ⇒ down 100 Mbps")
    checkEqual(RampStatus.NetworkTier.downKbps(kind: "other"), 100_000,
               "chưa rõ loại mạng ⇒ nấc Wi-Fi (không phải di động, không regress)")

    // Chiều LÊN suy từ chiều XUỐNG theo nấc tĩnh CỦA LOẠI MẠNG (Android `ratioUpFrom`) — dùng cho
    // các bước ramp trong phiên (`commitRampPlan`/`noteRawLine`), nơi trước đây iOS luôn áp 30/100.
    checkEqual(RampStatus.NetworkTier.upKbps(forDownKbps: 34_000, kind: "wifi"), 10_200,
               "Wi-Fi: up = down × 30/100 (không đổi so với trước)")
    checkEqual(RampStatus.NetworkTier.upKbps(forDownKbps: 12_000, kind: "cell"), 8_000,
               "di động: down 12 Mbps ⇒ up đúng nấc 8 Mbps (không phải 3,6 Mbps theo 30/100)")
    checkEqual(RampStatus.NetworkTier.upKbps(forDownKbps: 40_000, kind: "cell"), 8_000,
               "di động: ramp down lên 40 Mbps vẫn KHÔNG khai up quá 8 Mbps")
    checkEqual(RampStatus.NetworkTier.upKbps(forDownKbps: 200_000, kind: "wifi"), 30_000,
               "Wi-Fi: up không vượt nấc tĩnh 30 Mbps dù down ramp lên 200 Mbps")
    checkEqual(RampStatus.NetworkTier.upKbps(forDownKbps: 300, kind: "wifi"), 500,
               "up kẹp SÀN 500 kbps khi down nhỏ")

    // (2) SỐ ĐO TƯƠI THẮNG BỘ NHỚ — đúng ca lỗi: số nhớ 100 Mbps không được kéo số khai lên.
    let freshWins = startup(fresh: 40_000, hadMemory: true, measured: 40_000,
                            declared: 100_000, best: 100_000)
    checkEqual(freshWins.downKbps, 34_000, "đo tươi 40 Mbps ⇒ khai 85% = 34 Mbps")
    checkEqual(freshWins.upKbps, 10_200, "up = 34 Mbps × 30/100 (nấc Wi-Fi)")
    checkEqual(freshWins.reason, Policy.reasonMemory, "số khai suy từ SỐ ĐO ⇒ reason=memory")
    checkEqual(Policy.decide(rememberedMeasuredKbps: 40_000, rememberedDeclaredKbps: 100_000,
                             staticUpKbps: 30_000, staticDownKbps: 100_000, ceilingDownKbps: 0,
                             bestKbps: 100_000).downKbps, 100_000,
               "đường cũ (`decide`) vẫn khai 100 Mbps vì `best` — đây đúng là lỗi đang sửa")

    // Số đo tươi nằm trong dải 95–150% của số nhớ (103%) ⇒ vẫn bám số đo, KHÔNG dò lên 15%.
    let freshDeadband = startup(fresh: 30_000, hadMemory: true, measured: 30_000, declared: 29_000)
    checkEqual(freshDeadband.downKbps, 25_500, "đo 30 Mbps / khai cũ 29 Mbps ⇒ khai 85% = 25,5 Mbps")
    checkEqual(Policy.decide(rememberedMeasuredKbps: 30_000, rememberedDeclaredKbps: 29_000,
                             staticUpKbps: 30_000, staticDownKbps: 100_000, ceilingDownKbps: 0
               ).downKbps, 33_350,
               "đường cũ dò lên 15% (33,35 Mbps) — số đo tươi nay thắng")

    // Mạng mới CHƯA có bộ nhớ + đo được ⇒ vẫn theo số đo (không rơi vào nấc thận trọng).
    let freshNoMemory = startup(fresh: 5_000, hadMemory: false)
    checkEqual(freshNoMemory.downKbps, 4_250, "mạng mới đo được 5 Mbps ⇒ khai 4,25 Mbps")
    checkEqual(freshNoMemory.upKbps, 1_275, "up = 4,25 Mbps × 30/100")

    // (3) KẸP THEO LOẠI MẠNG: đo tươi 40 Mbps trên 4G ⇒ không khai quá nấc di động 8/12.
    let freshCell = startup(fresh: 40_000, kind: "cell")
    checkEqual(freshCell.downKbps, 12_000, "đo 40 Mbps trên 4G ⇒ kẹp trần di động 12 Mbps")
    checkEqual(freshCell.upKbps, 8_000, "up kẹp trần di động 8 Mbps")
    checkEqual(freshCell.reason, Policy.reasonClamp, "bị kẹp nấc tĩnh ⇒ reason=clamp")
    checkEqual(freshCell.tierDownKbps, 12_000, "nhánh cell dùng nấc MOBILE_* (không phải 30/100)")

    // Đo tươi 400 Mbps trên Wi-Fi ⇒ kẹp trần Wi-Fi 100/30.
    let freshFast = startup(fresh: 400_000)
    checkEqual(freshFast.downKbps, 100_000, "đo 400 Mbps ⇒ kẹp trần nấc Wi-Fi 100 Mbps")
    checkEqual(freshFast.upKbps, 30_000, "up kẹp trần nấc Wi-Fi 30 Mbps")
    checkEqual(freshFast.reason, Policy.reasonClamp, "bị kẹp ⇒ clamp")

    // Chiều LÊN: có số đo chiều lên thì kẹp ≤ 85% số đo lên (máy khác đo hộ), dù tỉ lệ 30/100 cho cao hơn.
    let withUpMeasurement = startup(fresh: 20_000, freshUp: 2_000)
    checkEqual(withUpMeasurement.downKbps, 17_000, "đo 20 Mbps ⇒ khai 17 Mbps")
    checkEqual(withUpMeasurement.upKbps, 1_700, "up bị kẹp 85% × 2 Mbps = 1,7 Mbps (không phải 5,1)")
    checkEqual(withUpMeasurement.reason, Policy.reasonClamp, "up bị kẹp ⇒ clamp")

    // Sàn nhỏ dùng chung vẫn giữ: đo 200 kbps ⇒ 1000/500, không khai vài chục kbps.
    let tiny = startup(fresh: 200)
    checkEqual(tiny.downKbps, Policy.floorDownKbps, "đo 200 kbps ⇒ kẹp SÀN 1000")
    checkEqual(tiny.upKbps, Policy.floorUpKbps, "up kẹp sàn 500")
    checkEqual(tiny.reason, Policy.reasonClamp, "bị sàn đổi số ⇒ clamp")

    // (2)+ (3) ĐO HỎNG ⇒ bộ nhớ nhưng kẹp trần theo nấc tĩnh của loại mạng đang dùng.
    let fallbackCell = startup(fresh: 0, hadMemory: true, measured: 40_000, declared: 40_000,
                               best: 40_000, kind: "cell")
    checkEqual(fallbackCell.downKbps, 12_000, "đo hỏng + bộ nhớ 40 Mbps trên 4G ⇒ kẹp 12 Mbps")
    checkEqual(fallbackCell.upKbps, 8_000, "up theo nấc di động 8/12")
    checkEqual(fallbackCell.ceilingDownKbps, 12_000, "trần hiệu lực (in log ceil=) = nấc di động")

    // "Không bao giờ khai số Wi-Fi lên 4G": đỉnh cũ 30 Mbps nằm trên khoá mạng di động ⇒ kẹp 12.
    let wifiPeakOnCell = startup(fresh: 0, hadMemory: true, best: 30_000, kind: "cell")
    checkEqual(wifiPeakOnCell.downKbps, 12_000, "đỉnh 30 Mbps (Wi-Fi cũ) trên 4G ⇒ kẹp 12 Mbps")
    checkEqual(wifiPeakOnCell.ceilingDownKbps, 12_000, "trần vẫn là nấc di động")

    // Kẹp "số nhớ ≤ 1,5 × số đo đã nhớ": đỉnh mọi thời đại 100 Mbps nhưng đo gần nhất 10 Mbps.
    let cappedBest = startup(fresh: 0, hadMemory: true, measured: 10_000, declared: 100_000,
                             best: 100_000)
    checkEqual(cappedBest.downKbps, 15_000, "đỉnh cũ 100 Mbps bị kẹp 1,5 × 10 Mbps = 15 Mbps")
    checkEqual(cappedBest.upKbps, 4_500, "up = 15 Mbps × 30/100")
    checkEqual(cappedBest.reason, Policy.reasonMemory, "vẫn là nhánh bộ nhớ (không bị sàn/trần đổi số)")
    checkEqual(Policy.decide(rememberedMeasuredKbps: 10_000, rememberedDeclaredKbps: 100_000,
                             staticUpKbps: 30_000, staticDownKbps: 100_000, ceilingDownKbps: 0,
                             bestKbps: 100_000).downKbps, 100_000,
               "không kẹp `best` thì `decide` khởi động ở 100 Mbps — đúng ca cần chặn")

    // Trần VẬT LÝ vẫn được tôn trọng khi có (iOS hiện truyền 0, nhưng hàm phải đúng).
    let physicalCeiling = startup(fresh: 0, hadMemory: true, measured: 50_000, declared: 50_000,
                                  best: 50_000, ceiling: 20_000)
    checkEqual(physicalCeiling.downKbps, 20_000, "trần vật lý 20 Mbps ⇒ kẹp down")
    checkEqual(physicalCeiling.ceilingDownKbps, 20_000, "trần hiệu lực = trần vật lý")

    // (4) MẠNG MỚI + ĐO HỎNG ⇒ khởi điểm THẬN TRỌNG ở nấc metered 8/12, KHÔNG mở ra ở 100 Mbps.
    let brandNew = startup(fresh: 0, hadMemory: false)
    checkEqual(brandNew.downKbps, 12_000, "mạng mới + đo hỏng ⇒ khai 12 Mbps (không 100 Mbps)")
    checkEqual(brandNew.upKbps, 8_000, "up 8 Mbps (nấc metered)")
    checkEqual(brandNew.reason, S.reasonCautious, "reason=cautious-new-network để đọc log là biết")
    let brandNewCell = startup(fresh: 0, hadMemory: false, kind: "cell")
    checkEqual(brandNewCell.downKbps, 12_000, "mạng di động mới + đo hỏng ⇒ cũng 12 Mbps")
    checkEqual(brandNewCell.reason, S.reasonCautious, "vẫn là nhánh thận trọng")
    let brandNewOther = startup(fresh: 0, hadMemory: false, kind: "other")
    checkEqual(brandNewOther.downKbps, 12_000, "khoá `other|if:unknown` + đo hỏng ⇒ thận trọng 12 Mbps")
    check(brandNew.downKbps < RampStatus.NetworkTier.wifiDownKbps,
          "khởi điểm mạng mới KHÔNG phải nấc Wi-Fi 100 Mbps")
}

print("NetworkChangePolicy — 25/09/2026: DOI MANG giua phien => dung lai transport NGAY (parity Android)")

// Vì sao bổ sung case MỚI: yêu cầu 25/09/2026 (parity Android `rebuildRequested`): phát hiện mạng
// nền đổi ⇒ tự dựng lại transport NGAY trên mạng mới. Phần QUYẾT ĐỊNH (đổi mạng thật hay chỉ là
// khoá cụ thể hơn · cooldown · đang bận) tách thành hàm THUẦN `RampStatus.NetworkChangePolicy` nên
// phải có case khẳng định; phần thi hành (swap fd/cầu) nghiệm thu trên máy thật.
do {
    typealias N = RampStatus.NetworkChangePolicy
    let wifiRouterA = ["wifi|router:aa:aa:aa:aa:aa:aa", "wifi|if:en0", "wifi"]
    let wifiRouterB = ["wifi|router:bb:bb:bb:bb:bb:bb", "wifi|if:en0", "wifi"]
    let wifiSSIDB = ["wifi|ssid:QuanCaPhe", "wifi|if:en0", "wifi"]
    let cellKeys = ["cell|if:pdp_ip0", "cell"]
    let unknownKeys = ["other|if:unknown", "other"]

    checkEqual(N.cooldownS, 10, "cooldown giữa hai lần dựng lại vì đổi mạng = 10 s")

    // Danh tính CHƯA BIẾT (`other|if:unknown`) — không phải một mạng thật.
    check(N.isPlaceholderKey("other|if:unknown"), "`other|if:unknown` là danh tính CHƯA BIẾT")
    check(!N.isPlaceholderKey("wifi|if:en0"), "`wifi|if:en0` là mạng thật")
    check(!N.isPlaceholderKey("cell|if:pdp_ip0"), "`cell|if:pdp_ip0` là mạng thật")

    // CÙNG một mạng, khoá cũ được viết cụ thể hơn (ARP có bản ghi router muộn) ⇒ KHÔNG dựng lại.
    check(!N.isRealChange(previousKey: "wifi|if:en0", newLookupKeys: wifiRouterA),
          "wifi|if:en0 -> wifi|router:<MAC> (cùng mạng) ⇒ KHÔNG dựng lại")
    check(!N.isRealChange(previousKey: "wifi|if:en0", newLookupKeys: wifiRouterB),
          "wifi|if:en0 -> wifi|router:<MAC khác> vẫn tìm được bản ghi cũ ⇒ KHÔNG dựng lại")
    check(!N.isRealChange(previousKey: "other|if:unknown", newLookupKeys: wifiRouterA),
          "danh tính VỪA RÕ (unknown -> wifi) ⇒ KHÔNG dựng lại transport")

    // Đổi mạng THẬT ⇒ dựng lại.
    check(N.isRealChange(previousKey: "wifi|router:aa:aa:aa:aa:aa:aa", newLookupKeys: wifiRouterB),
          "đổi ROUTER Wi-Fi ⇒ dựng lại")
    check(N.isRealChange(previousKey: "wifi|ssid:NhaToi", newLookupKeys: wifiSSIDB),
          "đổi SSID (Wi-Fi nhà -> quán) ⇒ dựng lại")
    check(N.isRealChange(previousKey: "wifi|router:aa:aa:aa:aa:aa:aa", newLookupKeys: cellKeys),
          "Wi-Fi -> 4G (`cell|if:pdp_ip0`) ⇒ dựng lại")
    check(N.isRealChange(previousKey: "cell|if:pdp_ip0", newLookupKeys: wifiRouterA),
          "4G -> Wi-Fi ⇒ dựng lại")
    check(N.isRealChange(previousKey: "cell|if:pdp_ip0", newLookupKeys: unknownKeys),
          "mất sạch mạng: hàm thuần vẫn nói `true`, provider tự chặn bằng `isPlaceholderKey`")

    // Cổng quyết định "dựng lại ngay ở nhịp này chưa".
    check(!N.canRebuildNow(pending: false, sinceLastRebuild: nil, busy: false),
          "không có yêu cầu đổi mạng ⇒ không dựng lại")
    check(!N.canRebuildNow(pending: true, sinceLastRebuild: nil, busy: true),
          "đường khác đang dựng lại (watchdog/ramp) ⇒ nhường, chờ nhịp sau")
    check(N.canRebuildNow(pending: true, sinceLastRebuild: nil, busy: false),
          "có yêu cầu + rảnh + chưa từng dựng lại ⇒ dựng lại NGAY")
    check(!N.canRebuildNow(pending: true, sinceLastRebuild: 3, busy: false),
          "mới 3 s < cooldown 10 s ⇒ chờ (chống nhấp nháy A→B→A)")
    check(!N.canRebuildNow(pending: true, sinceLastRebuild: 9.9, busy: false),
          "9,9 s vẫn dưới cooldown ⇒ chờ")
    check(N.canRebuildNow(pending: true, sinceLastRebuild: 10, busy: false),
          "đúng 10 s (hết cooldown) ⇒ dựng lại")
    check(N.canRebuildNow(pending: true, sinceLastRebuild: 3600, busy: false),
          "đổi mạng lần sau (1 giờ) ⇒ dựng lại bình thường")
}

print("BandwidthPolicy (Android parity) — vong ramp: dinh ben vung 12s, nguong 115%, giu 10s, ×1,25/×0,7")

do {
    typealias Policy = RampStatus.BandwidthPolicy

    // Android: `dinh ben vung la trung binh truot` (cửa sổ 12 s, mẫu rỗng tính là 0).
    let samples = [10_000, 12_000, 8_000, 10_000, 0, 0, 0, 0, 0, 0, 0, 0]
    checkEqual(Policy.sustainedKbps(samples: samples, count: 4), 10_000, "4 mẫu ⇒ trung bình 10 Mbps")
    checkEqual(Policy.sustainedKbps(samples: samples, count: 12), 3_333,
               "12 mẫu (8 mẫu rảnh = 0) ⇒ 3,33 Mbps — mẫu rỗng KÉO TRUNG BÌNH XUỐNG")
    checkEqual(Policy.sustainedKbps(samples: samples, count: 0), 0, "0 mẫu ⇒ 0")

    // Android: `chi tang khi dinh ben vung vuot tran khai it nhat 15 phan tram`.
    check(Policy.shouldRampUp(sustainedKbps: 12_000, declaredKbps: 10_000), "12 ≥ 115% × 10 ⇒ tăng")
    check(!Policy.shouldRampUp(sustainedKbps: 11_000, declaredKbps: 10_000), "110% < 115% ⇒ không tăng")
    check(!Policy.shouldRampUp(sustainedKbps: 10_000, declaredKbps: 0), "chưa khai ⇒ không tăng")

    // Android: `buoc tang 25 phan tram va bi kep boi tran vat ly` / `buoc giam 30 phan tram`.
    checkEqual(Policy.rampUp(currentKbps: 10_000, ceilingKbps: 50_000, floorKbps: 12_000), 12_500,
               "×1,25")
    checkEqual(Policy.rampUp(currentKbps: 10_000, ceilingKbps: 12_000, floorKbps: 12_000), 12_000,
               "kẹp trần 12 Mbps")
    checkEqual(Policy.rampDown(currentKbps: 100_000, ceilingKbps: 400_000, floorKbps: 12_000), 70_000,
               "×0,7")
    checkEqual(Policy.rampDown(currentKbps: 15_000, ceilingKbps: 400_000, floorKbps: 12_000), 12_000,
               "không xuống dưới sàn")

    // Android: `giam tran khi mat goi hoac RTT vot` + `tuot sau so voi tran khai cung la tin hieu giam`.
    check(Policy.shouldRampDown(lossPct: 5, rttMs: 0, rttBaselineMs: 0), "loss 5% ≥ 2% ⇒ giảm")
    check(!Policy.shouldRampDown(lossPct: 0, rttMs: 0, rttBaselineMs: 0), "không loss/RTT ⇒ không giảm")
    check(Policy.shouldRampDown(lossPct: 0, rttMs: 900, rttBaselineMs: 200), "RTT 900 vs nền 200 ⇒ vọt 3×")
    check(!Policy.shouldRampDown(lossPct: 0, rttMs: 500, rttBaselineMs: 200), "RTT 500 chưa vọt ⇒ không giảm")
    check(Policy.shouldRampDownUnderrun(sustainedKbps: 4_000, declaredKbps: 10_000), "4 < 50% × 10 ⇒ tụt sâu")
    check(!Policy.shouldRampDownUnderrun(sustainedKbps: 6_000, declaredKbps: 10_000), "6 > 50% ⇒ chưa tụt sâu")
    check(!Policy.shouldRampDownUnderrun(sustainedKbps: 0, declaredKbps: 10_000),
          "observed=0 (khách KHÔNG tải) ⇒ 0 KHÔNG phải 'tụt sâu'")

    // iOS: cổng "TẢI THẬT" — mẫu rỗng/idle KHÔNG được phép hạ số khai.
    // Đúng ca lỗi máy thật 24/09/2026: observed=483 kbps ≈ 0,72 MB trong 12 s.
    check(!Policy.hasRealLoad(windowBytes: 725_000, busySamples: 12, totalSamples: 12),
          "0,7 MB/12 s (mẫu nền ~483 kbps) ⇒ KHÔNG phải tải thật")
    check(!Policy.hasRealLoad(windowBytes: 0, busySamples: 0, totalSamples: 12),
          "observed=0 tuyệt đối ⇒ KHÔNG phải tải thật")
    check(!Policy.hasRealLoad(windowBytes: 12_000_000, busySamples: 1, totalSamples: 12),
          "đủ byte nhưng chỉ 1/12 mẫu có tải ⇒ KHÔNG phải tải thật liên tục")
    check(Policy.hasRealLoad(windowBytes: 12_000_000, busySamples: 12, totalSamples: 12),
          "12 MB/12 s + 12/12 mẫu có tải (≈ Full HD 8 Mbps) ⇒ CÓ tải thật")

    check(!Policy.allowsUnderrunBackoff(hasRealLoad: false, sustainedKbps: 483, declaredKbps: 3_701),
          "MẪU RỖNG/IDLE ⇒ KHÔNG hạ số khai (đây là lỗi 'mất mạng' đang sửa)")
    check(Policy.allowsUnderrunBackoff(hasRealLoad: true, sustainedKbps: 4_000, declaredKbps: 10_000),
          "CÓ tải thật + đo 4 Mbps so với khai 10 Mbps ⇒ cho hạ")
    check(!Policy.allowsUnderrunBackoff(hasRealLoad: true, sustainedKbps: 6_000, declaredKbps: 10_000),
          "có tải thật nhưng đo 6 Mbps > 50% số khai ⇒ không hạ")
    check(Policy.isBusy(idleRun: 0), "idleRun=0 ⇒ đang bận (định nghĩa Android)")
    check(!Policy.isBusy(idleRun: 2), "idleRun≥2 ⇒ rảnh")

    // iOS: thay đổi số khai KHÔNG bao giờ dựng lại transport giữa phiên.
    checkEqual(Policy.applyDeferred, "deferred-next-connect", "nhãn apply duy nhất của iOS")
    checkEqual(Policy.applyLabel(idle: true), "deferred-next-connect",
               "tunnel rảnh ⇒ VẪN hoãn sang lần kết nối sau (không còn 'idle-now')")
    checkEqual(Policy.applyLabel(idle: false), "deferred-next-connect", "đang chở traffic ⇒ hoãn")

    // iOS: dữ liệu THIẾU — không có loss%/RTT của QUIC (framework chỉ mở Connect/Serve/Stop).
    check(!Policy.hasTransportLossSignal,
          "iOS KHÔNG có API loss/RTT của QUIC ⇒ rtt=/loss= phải ghi '-' trong log, không bịa số")
    checkEqual(Policy.sustainedWindowS, 12, "cửa sổ đỉnh bền vững 12 s (Android SUSTAINED_WINDOW_S)")
    checkEqual(Policy.rampHoldS, 10, "phải giữ điều kiện ramp 10 s (Android RAMP_HOLD_MS)")
    checkEqual(Policy.rampCooldownS, 15, "hai lần đổi số cách nhau ≥15 s (Android RAMP_COOLDOWN_MS)")
    checkEqual(Policy.samplerIdleKbps, 200, "ngưỡng rảnh 200 kbps (Android SAMPLER_IDLE_KBPS)")
    checkEqual(Policy.lossConsecutiveFails, 3, "≥3 lần hỏng liên tiếp mới kết luận mất gói")
}

print("ApplyGate — tu ramp TRONG PHIEN: lech >=115%/<=85% moi ap, cho idle toi da 20s, cooldown 90s, toi da 3 lan/10 phut")

do {
    typealias Gate = RampStatus.ApplyGate

    // (1) Áp khi lệch ĐÁNG KỂ và đường đang RẢNH → apply=idle-now.
    checkEqual(
        Gate.decide(planKbps: 2_235, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: false),
        .applyIdleNow,
        "plan 2235 / declared 1870 (1,195×) + rảnh ⇒ idle-now (tự ramp, không cần connect lại)"
    )
    checkEqual(
        Gate.decide(planKbps: 1_300, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: false),
        .applyIdleNow,
        "plan 1300 / declared 1870 (0,695× ≤ 0,85) ⇒ hạ cũng áp NGAY trong phiên"
    )

    // (2) Lệch không đáng kể ⇒ bỏ qua (không dựng lại vì nhích nhỏ).
    checkEqual(
        Gate.decide(planKbps: 2_050, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: false),
        .skipInsignificant,
        "1,096× < 1,15 ⇒ KHÔNG dựng lại (nhích nhỏ)"
    )
    checkEqual(
        Gate.decide(planKbps: 1_700, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: false),
        .skipInsignificant,
        "0,909× > 0,85 ⇒ không hạ, bỏ qua"
    )
    checkEqual(
        Gate.decide(planKbps: 2_150, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: false),
        .skipInsignificant,
        "2150/1870 = 1,1497× (dưới ngưỡng) ⇒ CHƯA áp"
    )
    checkEqual(
        Gate.decide(planKbps: 2_151, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: false),
        .applyIdleNow,
        "2151/1870 = 1,1503× (vừa vượt ngưỡng) ⇒ áp"
    )

    // (3) Đang BẬN: chờ tìm khe rảnh, tối đa 20 s rồi VẪN áp (không hoãn sang lần connect sau).
    checkEqual(
        Gate.decide(planKbps: 2_235, activeKbps: 1_870, idle: false, pendingFor: 5,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: false),
        .waitIdle,
        "bận 5 s ⇒ còn chờ khe rảnh"
    )
    checkEqual(
        Gate.decide(planKbps: 2_235, activeKbps: 1_870, idle: false, pendingFor: 20,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: false),
        .applyForcedAfterWait(20),
        "bận đủ 20 s ⇒ ÁP LUÔN (apply=forced-after-wait 20)"
    )

    // (4) Cooldown ≥90 s giữa hai lần áp.
    checkEqual(
        Gate.decide(planKbps: 2_235, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: 30, appliesInWindow: 1, disabled: false),
        .waitCooldown,
        "mới áp 30 s trước ⇒ chờ đủ 90 s"
    )
    checkEqual(
        Gate.decide(planKbps: 2_235, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: 90, appliesInWindow: 1, disabled: false),
        .applyIdleNow,
        "đủ 90 s ⇒ được áp"
    )

    // (5) Trần 3 lần / 10 phút ⇒ tắt tự-áp cho hết phiên.
    checkEqual(
        Gate.decide(planKbps: 2_235, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: 200, appliesInWindow: 2, disabled: false),
        .applyIdleNow,
        "lần thứ 3 trong cửa sổ ⇒ vẫn được áp"
    )
    checkEqual(
        Gate.decide(planKbps: 2_235, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: 200, appliesInWindow: 3, disabled: false),
        .disabledForSession,
        "đã 3 lần/10 phút ⇒ disabled-for-session"
    )
    checkEqual(
        Gate.decide(planKbps: 2_235, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: true),
        .disabledForSession,
        "đã tắt ⇒ giữ nguyên số hiện tại tới hết phiên"
    )
    checkEqual(
        Gate.decide(planKbps: 0, activeKbps: 1_870, idle: true, pendingFor: 1,
                    sinceLastApply: nil, appliesInWindow: 0, disabled: false),
        .skipInsignificant,
        "chưa có số khai hợp lệ ⇒ không áp"
    )

    // (6) Rollback khi cầu KHÔNG chở lại gói sau khi dựng lại.
    check(Gate.shouldRollback(progressed: false),
          "cầu đứng sau dựng lại ⇒ ROLLBACK về số cũ + tắt tự-áp")
    check(!Gate.shouldRollback(progressed: true), "cầu chở lại gói ⇒ giữ số mới")

    checkEqual(Gate.significantUpRatio, 1.15, "ngưỡng đáng kể khi LÊN = 1,15×")
    checkEqual(Gate.significantDownRatio, 0.85, "ngưỡng đáng kể khi XUỐNG = 0,85×")
    checkEqual(Gate.cooldownS, 90, "cooldown 90 s")
    checkEqual(Gate.maxPerWindow, 3, "tối đa 3 lần / 10 phút")
    checkEqual(Gate.forcedWaitS, 20, "chờ khe rảnh tối đa 20 s rồi vẫn áp")
    checkEqual(Gate.verifyS, 5, "chờ tối đa 5 s để cầu chở lại gói trước khi rollback")
}

print("TrafficSupervisorPolicy — bo dem tunnel = 0 KHONG duoc go tunnel: phai co may DANG tai + probe hong lien tiep")

do {
    typealias P = TrafficSupervisorPolicy

    // (a) Đúng ca lỗi máy thật 24/09/2026: cả hai chiều 0 nhưng MÁY ĐANG RẢNH ⇒ KHÔNG gỡ.
    checkEqual(
        P.idleVerdict(tunnelCarriedNothing: true, machineActive: false,
                      consecutiveProbeFailures: 0, secondsSinceWindowStart: 280,
                      countersJustReset: false),
        .concludeNothing,
        "cả hai chiều 0 + máy KHÔNG tải (en0 im) ⇒ KHÔNG gỡ tunnel (đúng lỗi 'tự gỡ sau 280s')"
    )
    // Probe OK (0 lần hỏng) + máy rảnh ⇒ vẫn không gỡ.
    checkEqual(
        P.idleVerdict(tunnelCarriedNothing: true, machineActive: false,
                      consecutiveProbeFailures: 0, secondsSinceWindowStart: 600,
                      countersJustReset: false),
        .concludeNothing,
        "probe OK + máy rảnh ⇒ KHÔNG gỡ, chỉ đặt lại mốc"
    )

    // (5) Vừa reset bộ đếm (cầu/transport mới) ⇒ KHÔNG kết luận ngay dù mọi thứ khác xấu.
    checkEqual(
        P.idleVerdict(tunnelCarriedNothing: true, machineActive: true,
                      consecutiveProbeFailures: 9, secondsSinceWindowStart: 0,
                      countersJustReset: true),
        .concludeNothing,
        "bộ đếm vừa TỤT (cầu mới) ⇒ bắt đầu lại cửa sổ, KHÔNG kết luận"
    )
    checkEqual(
        P.idleVerdict(tunnelCarriedNothing: true, machineActive: true,
                      consecutiveProbeFailures: 2, secondsSinceWindowStart: 5,
                      countersJustReset: false),
        .concludeNothing,
        "mới 5 s < 45 s cửa sổ ⇒ chưa kết luận"
    )

    // (2) Máy ĐANG tải nhưng chưa đủ 2 lần probe hỏng ⇒ chờ thêm bằng chứng.
    checkEqual(
        P.idleVerdict(tunnelCarriedNothing: true, machineActive: true,
                      consecutiveProbeFailures: 0, secondsSinceWindowStart: 60,
                      countersJustReset: false),
        .waitForProbe,
        "máy đang tải + tunnel 0 gói + chưa có probe hỏng ⇒ CHỜ probe, không gỡ"
    )
    checkEqual(
        P.idleVerdict(tunnelCarriedNothing: true, machineActive: true,
                      consecutiveProbeFailures: 1, secondsSinceWindowStart: 60,
                      countersJustReset: false),
        .waitForProbe,
        "mới 1 lần probe hỏng ⇒ chưa đủ, chờ lần 2"
    )

    // Máy đang tải + 2 probe hỏng liên tiếp + đủ cửa sổ ⇒ kết luận tunnel hỏng.
    checkEqual(
        P.idleVerdict(tunnelCarriedNothing: true, machineActive: true,
                      consecutiveProbeFailures: 2, secondsSinceWindowStart: 60,
                      countersJustReset: false),
        .concludeTunnelDead,
        "máy đang tải + tunnel 0 gói + 2 probe hỏng ⇒ kết luận tunnel hỏng"
    )

    // Có gói qua tunnel ⇒ không bao giờ vào nhánh này.
    checkEqual(
        P.idleVerdict(tunnelCarriedNothing: false, machineActive: true,
                      consecutiveProbeFailures: 9, secondsSinceWindowStart: 600,
                      countersJustReset: false),
        .concludeNothing,
        "tunnel CÓ chở gói ⇒ không kết luận gì"
    )
    checkEqual(P.idleProbeRequiredFailures, 2, "cần 2 lần probe hỏng liên tiếp")
    checkEqual(P.idleProbeMinSpacing, 5, "hai lần probe cách nhau ≥5 s")
    checkEqual(P.idleWindowS, 45, "cửa sổ quan sát 45 s trước khi được kết luận")
}

print("RawLinePolicy — cong ha khai: (ii) duong that >= so khai => CAM ha; (i) bat doi xung that")

do {
    typealias R = RawLinePolicy

    // (2) Nâng theo số đo đường THẬT.
    checkEqual(R.rawLineUpTarget(measuredRealKbps: 4_800, declaredKbps: 1_621), 4_080,
               "đo thật 4800 / khai 1621 ⇒ nâng lên 85% × 4800 = 4080")
    checkEqual(R.rawLineUpTarget(measuredRealKbps: 1_900, declaredKbps: 1_621), nil, "1,17× ⇒ chưa nâng")
    checkEqual(R.floorKbps(measuredRealKbps: 4_800), 4_080, "sàn = 85% × đo thật")

    // (ii) CỔNG CHÍNH — case chốt của lỗi "bật VPN là chậm":
    checkEqual(R.downRampAllowed(rawLineKbps: 5_818, rawLineAge: 30, consecutiveLowRawLine: 2, asymmetryEvidence: true,
                                 bestKbps: 2_900, declaredKbps: 5_818),
               .refuseRawLineHigh,
               "đường thật 5818 ≥ số khai 5818 ⇒ CẤM hạ DÙ có bằng chứng bất đối xứng")
    checkEqual(R.downRampAllowed(rawLineKbps: 778, rawLineAge: 30, consecutiveLowRawLine: 2, asymmetryEvidence: false,
                                 bestKbps: 2_900, declaredKbps: 5_818),
               .allow,
               "đường thật 778 < số khai 5818 ⇒ CHO hạ (đường đúng là yếu hơn số khai)")
    checkEqual(R.downRampAllowed(rawLineKbps: 5_818, rawLineAge: 30, consecutiveLowRawLine: 2, asymmetryEvidence: false,
                                 bestKbps: 0, declaredKbps: 5_818),
               .refuseRawLineHigh, "rawline cao ⇒ cấm hạ kể cả không có bất đối xứng")

    // (i) Cổng phụ: rawline cũ/chưa đo mới xét bất đối xứng thật.
    checkEqual(R.downRampAllowed(rawLineKbps: 5_818, rawLineAge: 400, consecutiveLowRawLine: 2, asymmetryEvidence: false,
                                 bestKbps: 0, declaredKbps: 5_818),
               .refuseNoCongestion, "rawline cũ 400 s + không bất đối xứng ⇒ để nguyên")
    checkEqual(R.downRampAllowed(rawLineKbps: 5_818, rawLineAge: 400, consecutiveLowRawLine: 2, asymmetryEvidence: true,
                                 bestKbps: 0, declaredKbps: 5_818),
               .allow, "rawline cũ + CÓ bất đối xứng thật (gói về đứng) ⇒ cho hạ")
    checkEqual(R.downRampAllowed(rawLineKbps: 0, rawLineAge: 0, consecutiveLowRawLine: 2, asymmetryEvidence: true,
                                 bestKbps: 0, declaredKbps: 5_818),
               .allow, "chưa từng đo rawline + bất đối xứng ⇒ cho hạ")

    // CHỐNG DAO ĐỘNG: một lần đo thấp chưa đủ để hạ (mỗi lần hạ là một lần retarget ~1,5 s).
    checkEqual(R.downRampAllowed(rawLineKbps: 778, rawLineAge: 30, consecutiveLowRawLine: 1,
                                 asymmetryEvidence: true, bestKbps: 0, declaredKbps: 5_818),
               .refuseNeedSecondSample, "mới 1/2 lần đo thấp ⇒ bỏ qua hạ")
    checkEqual(R.downRampAllowed(rawLineKbps: 778, rawLineAge: 30, consecutiveLowRawLine: 2,
                                 asymmetryEvidence: false, bestKbps: 0, declaredKbps: 5_818),
               .allow, "đủ 2/2 lần đo thấp ⇒ cho hạ")
    checkEqual(R.lowRawLineSamplesRequired, 2, "cần 2 lần đo rawline thấp liên tiếp")
    checkEqual(R.lowRawLineMinSpacing, 60, "hai lần đo thấp cách nhau ≥60 s")

    // (5) Chốt chặn best (giữ nguyên).
    checkEqual(R.downRampAllowed(rawLineKbps: 778, rawLineAge: 30, consecutiveLowRawLine: 2, asymmetryEvidence: true,
                                 bestKbps: 5_526, declaredKbps: 1_621),
               .refuseBestGuard, "best 5526 ≥ 2 × 1621 ⇒ CẤM hạ trước mọi cổng khác")

    // Bất đối xứng thật: KHÔNG dùng toGoDropped nữa.
    check(R.asymmetryEvidence(deltaOffered: 120, deltaFromGo: 0),
          "máy vẫn gửi mà 0 gói về ⇒ bất đối xứng")
    check(!R.asymmetryEvidence(deltaOffered: 120, deltaFromGo: 96),
          "gói về vẫn có ⇒ KHÔNG kết luận (dù hàng đợi có bỏ gói)")
    check(!R.asymmetryEvidence(deltaOffered: 0, deltaFromGo: 0), "máy không gửi ⇒ không kết luận")

    // Nhịp đo lại rawline.
    check(R.shouldProbe(observedKbps: 9_500, declaredKbps: 10_000, sinceLastProbe: 61, idle: false),
          "sát trần + 61 s ⇒ đo lại")
    check(R.shouldProbe(observedKbps: 100, declaredKbps: 10_000, sinceLastProbe: 121, idle: true),
          "rảnh + 121 s ⇒ đo lại")
    check(!R.shouldProbe(observedKbps: 100, declaredKbps: 10_000, sinceLastProbe: 60, idle: false),
          "bình thường + mới 60 s ⇒ chưa đo")
    checkEqual(R.rawLineFreshS, 300, "rawline chỉ coi là mới trong 5 phút")
}

print("ExtensionIdentityPolicy — canh bao khi macOS chay appex CU (lech version/build/mtime hoac thieu truong)")

do {
    typealias P = ExtensionIdentityPolicy
    func id(_ v: String?, _ b: String?, _ m: String?) -> P.Identity {
        P.Identity(version: v, build: b, mTime: m)
    }
    let local = id("1.4.3", "20", "2026-09-23 16:43:03")

    check(!P.isStale(running: local, local: local), "khớp hoàn toàn ⇒ KHÔNG cảnh báo")
    check(P.isStale(running: id("1.4.1", "20", "2026-09-23 16:43:03"), local: local),
          "lệch VERSION ⇒ cảnh báo")
    check(P.isStale(running: id("1.4.3", "19", "2026-09-23 16:43:03"), local: local),
          "lệch BUILD ⇒ cảnh báo")
    check(P.isStale(running: id("1.4.3", "20", "2026-09-23 10:40:00"), local: local),
          "lệch MTIME ⇒ cảnh báo (cùng số nhưng binary khác)")
    // Đúng ca tráo appex thật: extension cũ KHÔNG gửi 4 trường danh tính.
    check(P.isStale(running: id(nil, nil, nil), local: local),
          "extension cũ không gửi trường (nil) ⇒ CẢNH BÁO (ca tráo appex 24/09/2026)")
    check(P.isStale(running: id("?", "?", "?"), local: local),
          "extension trả '?' (không đọc được) ⇒ CẢNH BÁO")
    check(P.isStale(running: id("1.4.3", nil, "2026-09-23 16:43:03"), local: local),
          "thiếu riêng BUILD ⇒ cảnh báo")
    // Không được cảnh báo oan khi app không đọc được appex của chính nó.
    check(!P.isStale(running: local, local: nil), "app không đọc được appex của mình ⇒ KHÔNG cảnh báo oan")
    checkEqual(id("1.4.3", "20", "x").label, "1.4.3/20", "nhãn gộp version/build")
    checkEqual(id(nil, nil, nil).label, "?/?", "thiếu trường ⇒ nhãn ?/?")
}

print("RelayFailoverWatch — failover duong khi chieu VE chet mot chieu (ca that 25/09/2026, relay vn1hy)")

do {
    typealias W = RelayFailoverWatch

    // Mặc định phải khớp hằng số của provider: cửa sổ 15 s, 2 lần vô ích, trần 3 lần đổi/phiên.
    let defaults = W()
    checkEqual(defaults.windowS, 15, "cửa sổ đánh giá 15 s (dùng lại nhịp watchdog)")
    checkEqual(defaults.fruitlessToAdvance, 2, "2 lần dựng lại vô ích liên tiếp ⇒ đổi đường")
    checkEqual(defaults.maxAdvances, 3, "trần đổi đường mỗi phiên = 3 (khớp maxNodeFailovers)")

    // (1) Rebuild mà delta `fromGo` = 0 trong CẢ cửa sổ ⇒ lần dựng lại đó VÔ ÍCH.
    var a = W()
    a.beginWindow(now: t0, fromGo: 360_729)
    checkEqual(a.tick(now: t0.addingTimeInterval(14), fromGo: 360_729), .waiting,
               "14 s: chưa hết cửa sổ ⇒ chưa kết luận")
    checkEqual(a.tick(now: t0.addingTimeInterval(15), fromGo: 360_729), .fruitless(1),
               "hết cửa sổ mà 0 gói VỀ ⇒ lần dựng lại VÔ ÍCH (1/2)")
    checkEqual(a.fruitlessWindows, 1, "đếm được 1 cửa sổ vô ích")

    // Cao điểm THẬT: máy vẫn GỬI RA đều (toGo leo) mà chiều về 0 ⇒ vẫn phải là vô ích,
    // KHÔNG được coi là "transport có chở gói".
    var sent = W()
    sent.beginWindow(now: t0, fromGo: 0)
    checkEqual(sent.tick(now: t0.addingTimeInterval(15), fromGo: 0), .fruitless(1),
               "máy gửi ra 398 gói/nhịp nhưng 0 gói VỀ ⇒ vẫn VÔ ÍCH (không tính gói gửi ra)")

    // (2) 2 lần vô ích liên tiếp ⇒ GỌI ĐỔI ỨNG VIÊN (không thử lại cùng relay lần 3).
    var b = W()
    b.beginWindow(now: t0, fromGo: 100)
    checkEqual(b.tick(now: t0.addingTimeInterval(15), fromGo: 100), .fruitless(1),
               "cửa sổ vô ích thứ 1")
    b.beginWindow(now: t0.addingTimeInterval(30), fromGo: 100)
    checkEqual(b.tick(now: t0.addingTimeInterval(45), fromGo: 100), .advanceRelay(2),
               "2 lần vô ích liên tiếp ⇒ ĐỔI ĐƯỜNG")
    b.noteAdvanced()
    checkEqual(b.advances, 1, "đã ghi nhận 1 lần đổi đường")
    checkEqual(b.fruitlessWindows, 0, "đổi đường xong ⇒ xoá chuỗi vô ích")

    // (3) Có gói chiều VỀ ⇒ lần dựng lại HIỆU QUẢ ⇒ reset bộ đếm (không đổi đường oan).
    var c = W()
    c.beginWindow(now: t0, fromGo: 500)
    checkEqual(c.tick(now: t0.addingTimeInterval(15), fromGo: 640), .carried(140),
               "có 140 gói VỀ trong cửa sổ ⇒ HIỆU QUẢ")
    checkEqual(c.fruitlessWindows, 0, "có gói về ⇒ xoá bộ đếm vô ích")
    // Sau khi reset, phải tích lại đủ 2 cửa sổ vô ích mới đổi đường (không đổi sớm).
    c.beginWindow(now: t0.addingTimeInterval(30), fromGo: 640)
    checkEqual(c.tick(now: t0.addingTimeInterval(45), fromGo: 640), .fruitless(1),
               "cửa sổ vô ích mới chỉ tính là 1/2")
    // Bộ đếm TỤT giữa cửa sổ (nguồn số đổi) ⇒ KHÔNG đo được, KHÔNG kết luận vô ích.
    var regressed = W()
    regressed.beginWindow(now: t0, fromGo: 125_639_055)
    checkEqual(regressed.tick(now: t0.addingTimeInterval(15), fromGo: 12), .waiting,
               "bộ đếm tụt (cầu mới đếm lại từ 0) ⇒ đặt lại mốc, KHÔNG kết luận vô ích")
    checkEqual(regressed.fruitlessWindows, 0, "không cộng oan cửa sổ vô ích")

    // (4) Hết ứng viên ⇒ KHÔNG xoay vòng vô hạn: đủ ngưỡng nhưng đã chạm trần ⇒ .exhausted.
    var d = W(maxAdvances: 3)
    for n in 1...3 {
        d.beginWindow(now: t0, fromGo: 0)
        checkEqual(d.tick(now: t0.addingTimeInterval(15), fromGo: 0), .fruitless(1),
                   "lần \(n): cửa sổ vô ích 1/2 ⇒ chưa đổi đường")
        d.beginWindow(now: t0.addingTimeInterval(30), fromGo: 0)
        checkEqual(d.tick(now: t0.addingTimeInterval(45), fromGo: 0), .advanceRelay(2),
                   "lần \(n): đủ 2 cửa sổ vô ích liên tiếp ⇒ đổi đường")
        d.noteAdvanced()
    }
    checkEqual(d.advances, 3, "đã dùng hết 3 lần đổi đường của phiên")
    d.beginWindow(now: t0, fromGo: 0)
    checkEqual(d.tick(now: t0.addingTimeInterval(15), fromGo: 0), .fruitless(1),
               "hết trần nhưng mới 1 cửa sổ vô ích ⇒ chưa kết luận")
    d.beginWindow(now: t0, fromGo: 0)
    checkEqual(d.tick(now: t0.addingTimeInterval(15), fromGo: 0), .exhausted(2),
               "hết ứng viên đường ⇒ GIỮ tunnel, KHÔNG xoay vòng vô hạn")
    d.noteExhausted()
    checkEqual(d.advances, 3, "hết ứng viên ⇒ KHÔNG tăng số lần đổi (không bao giờ vượt trần)")
    checkEqual(d.fruitlessWindows, 0, "hết ứng viên ⇒ mở lại chuỗi để nhịp sau thử tiếp")

    // (5) DIỄN LẠI ĐÚNG ca thật 25/09/2026 (`vn1hy`, `Go→packetFlow` đóng băng ở 360729 gói):
    //     các lần dựng lại ở 19:42:25 / 19:42:58 / 19:43:31 — phải ĐỔI ĐƯỜNG ngay sau lần thứ 2,
    //     nghĩa là lần dựng lại thứ 3 chạy trên đường MỚI (không thử lại `vn1hy` lần thứ 3).
    var real = W()
    real.beginWindow(now: t0, fromGo: 360_729)                            // 19:42:25 dựng lại lần 1
    checkEqual(real.tick(now: t0.addingTimeInterval(15), fromGo: 360_729), .fruitless(1),
               "19:42:40 — cửa sổ 1: vẫn 360729 gói VỀ ⇒ vô ích 1/2")
    real.beginWindow(now: t0.addingTimeInterval(33), fromGo: 360_729)     // 19:42:58 dựng lại lần 2
    checkEqual(real.tick(now: t0.addingTimeInterval(48), fromGo: 360_729), .advanceRelay(2),
               "19:43:13 — cửa sổ 2 vẫn 0 gói VỀ ⇒ ĐỔI ĐƯỜNG (lần dựng lại 3 sẽ ở đường mới)")
}

print("RelayUnreachableWatch + ung vien doi NODE — relay KHONG KET NOI DUOC (ca that 26/09/2026, relay vn2hy)")

do {
    typealias W = RelayUnreachableWatch

    // Ngưỡng mặc định phải nằm trong khoảng 20–30 s mà brief 26/09/2026 yêu cầu, và khớp hằng số
    // của provider (`relayUnreachableLimit`).
    checkEqual(W.defaultLimit, 20, "ngưỡng mặc định 20 s (trong khoảng 20–30 s của yêu cầu)")
    check(W().limit == 20, "mặc định của instance = 20 s")

    // (1) Link MỚI đứt: chưa đủ ngưỡng ⇒ KHÔNG đổi đường (một cú rớt WS thoáng qua không được tính).
    var a = W(limit: 20)
    checkEqual(a.noteLinkDown(now: t0), .waiting, "nhịp đầu tiên: mở cửa sổ, chưa đổi đường")
    checkEqual(a.noteLinkDown(now: t0.addingTimeInterval(5)), .waiting, "+5 s: chưa đủ 20 s")
    checkEqual(a.noteLinkDown(now: t0.addingTimeInterval(19.9)), .waiting, "+19,9 s: vẫn chưa đủ")
    check(a.isUnreachable, "đang trong chuỗi 'không kết nối được'")

    // (2) Đủ ngưỡng ⇒ ĐỔI cửa/node kế tiếp (đây là thứ luật 25/09 KHÔNG làm được vì không có cửa sổ).
    checkEqual(a.noteLinkDown(now: t0.addingTimeInterval(20)), .advance(20),
               "+20 s: ĐỔI ứng viên đường (đúng mốc nghiệm thu)")
    checkEqual(a.advances, 1, "đếm 1 lần đổi vì relay không mở nổi link")

    // (3) Cửa MỚI cũng không mở được ⇒ phải chờ ĐỦ ngưỡng cho CHÍNH NÓ rồi mới đổi tiếp (quay vòng),
    //     KHÔNG xoay vòng dồn dập (mỗi lần đổi là một lần dựng lại transport).
    checkEqual(a.noteLinkDown(now: t0.addingTimeInterval(25)), .waiting,
               "cửa mới +5 s ⇒ chưa đổi (cửa sổ mới bắt đầu từ lúc đổi)")
    checkEqual(a.noteLinkDown(now: t0.addingTimeInterval(40)), .advance(20),
               "cửa mới +20 s vẫn hỏng ⇒ đổi tiếp (quay vòng, KHÔNG bỏ mặc khách)")
    checkEqual(a.advances, 2, "đã đổi 2 cửa — KHÔNG có trần cứng nào chặn việc quay vòng")

    // (4) Link mở lại ⇒ xoá chuỗi kẹt: cửa sổ kế tiếp phải đếm lại từ đầu (không đổi đường oan).
    var b = W(limit: 20)
    _ = b.noteLinkDown(now: t0)
    b.noteLinkUp()
    check(!b.isUnreachable, "link mở lại ⇒ không còn ở trạng thái 'không kết nối được'")
    checkEqual(b.noteLinkDown(now: t0.addingTimeInterval(19)), .waiting,
               "đếm lại từ đầu: +19 s vẫn chưa đủ ngưỡng")
    checkEqual(b.noteLinkDown(now: t0.addingTimeInterval(39)), .advance(20),
               "+39 s ⇒ đủ 20 s của cửa sổ MỚI ⇒ đổi đường")

    // (5) DIỄN LẠI ĐÚNG ca thật 26/09/2026: chặn `relay-cf-vn2hy` lúc 14:59:07, nhịp kiểm tra 5 s,
    //     ngưỡng 20 s ⇒ tới ~14:59:27 (20 s) client đã có lệnh ĐỔI NODE (mốc nghiệm thu < 30 s), chứ
    //     KHÔNG bám `vn2hy` 24 lần rồi rơi vào Disconnected như bản 1.4.7/25.
    var real = W(limit: 20)
    checkEqual(real.noteLinkDown(now: t0), .waiting, "14:59:12 — link vn2hy vừa đứt")
    checkEqual(real.noteLinkDown(now: t0.addingTimeInterval(5)), .waiting, "14:59:17 — +5 s")
    checkEqual(real.noteLinkDown(now: t0.addingTimeInterval(10)), .waiting, "14:59:22 — +10 s")
    checkEqual(real.noteLinkDown(now: t0.addingTimeInterval(15)), .waiting, "14:59:27 — +15 s")
    checkEqual(real.noteLinkDown(now: t0.addingTimeInterval(20)), .advance(20),
               "14:59:32 — +20 s: ĐỔI NODE (vn2hy → vn1hy), KHÔNG còn bám một relay")
    checkEqual(real.advances, 1, "1 lần đổi đường trong ca thật này")

    // ỨNG VIÊN ĐỔI NODE: thứ tự + danh tính node (finding F3 vẫn giữ — không ghép lệch node).
    let vn2 = "wss://api.meetflowai.site/relay/vn2hy"
    let vn1 = "wss://api.meetflowai.site/relay/vn1hy"
    let nodes: [(nodeID: String, relay: String, host: String)] = [
        (nodeID: "vietnam-2", relay: vn2, host: "165.101.114.162"),
        (nodeID: "node-1", relay: vn1, host: "103.173.155.50"),
    ]
    let list = HysteriaDefaults.failoverRelayCandidates(
        currentRelay: vn2, currentHost: "165.101.114.162", nodes: nodes
    )
    checkEqual(list.count, 2, "vn2hy ⇒ 1 cửa node khác (vn1hy) + 1 cửa đổi hostname cùng node")
    checkEqual(list.first?.relayURL ?? "", vn1,
               "NODE KHÁC phải đứng TRƯỚC (dịch vụ relay chết thì api/t1 cùng chết)")
    checkEqual(list.first?.serverHost ?? "", "103.173.155.50",
               "F3: cửa vn1hy đi kèm host node-1 (KHÔNG ghép host node-2 với relay node-1)")
    checkEqual(list.last?.relayURL ?? "", "wss://t1.meetflowai.site/relay/vn2hy",
               "cửa cùng node (đổi hostname, GIỮ path) đứng SAU")
    checkEqual(list.last?.serverHost ?? "", "165.101.114.162",
               "cửa cùng node giữ nguyên host của node đang chọn")
    check(list.allSatisfy { candidate in
        // Không cửa nào được ghép lệch: relay chứa mã node nào thì host phải là của node đó.
        (candidate.relayURL.contains("vn1hy") && candidate.serverHost == "103.173.155.50")
            || (candidate.relayURL.contains("vn2hy") && candidate.serverHost == "165.101.114.162")
    }, "F3: mọi cửa đều khớp node (relay ↔ serverHost)")

    // Node đang chọn KHÔNG khai relay ⇒ KHÔNG mượn relay node khác (đi UDP trực tiếp, có nhánh riêng).
    checkEqual(
        HysteriaDefaults.failoverRelayCandidates(currentRelay: "", currentHost: "1.2.3.4", nodes: nodes).count,
        0, "F3: node không khai relay ⇒ không mượn cửa của node khác"
    )
    // Node khác thiếu `hy_relay_url` ⇒ bỏ qua cửa đó, không tạo cửa rác.
    let partial = HysteriaDefaults.failoverRelayCandidates(
        currentRelay: vn2, currentHost: "165.101.114.162",
        nodes: [(nodeID: "x", relay: "", host: "9.9.9.9"), (nodeID: "node-1", relay: vn1, host: "103.173.155.50")]
    )
    checkEqual(partial.first?.relayURL ?? "", vn1, "node không khai relay ⇒ bỏ qua, lấy node kế")

    // Danh sách node dài: trần `maxRelayFailoverNodes` giữ ngân sách start không phình vô hạn.
    var many: [(nodeID: String, relay: String, host: String)] = []
    for n in 1...9 {
        many.append((nodeID: "n\(n)", relay: "wss://api.meetflowai.site/relay/vn\(n)hy", host: "10.0.0.\(n)"))
    }
    let capped = HysteriaDefaults.failoverRelayCandidates(
        currentRelay: vn2, currentHost: "165.101.114.162", nodes: many
    )
    checkEqual(capped.count, HysteriaDefaults.maxRelayFailoverNodes + 1,
               "trần cửa node khác = maxRelayFailoverNodes (cộng cửa đổi hostname cùng node)")

    // F4 (ngân sách start PHẢI đủ cho MỌI cửa, kể cả cửa node khác mới thêm 26/09/2026).
    check(HysteriaDefaults.sessionStartBudget
            > HysteriaDefaults.relayOpenGrace * Double(HysteriaDefaults.maxRelayDoorsTotal),
          "F4: budget \(HysteriaDefaults.sessionStartBudget)s > \(HysteriaDefaults.relayOpenGrace)s × "
            + "\(HysteriaDefaults.maxRelayDoorsTotal) cửa")
}

// MARK: - BUG-IOS-JETSAM-001: TRẦN CỨNG cho hàng đợi đường dữ liệu (26/09/2026)
//
// Vì sao phải test bằng số: extension iOS bị iOS giết ở trần per-process ≈51 MB
// (`JetsamEvent` 25/09/2026, `rpages=3202`). Số đo máy thật cho thấy bộ nhớ leo THEO LƯU LƯỢNG
// (iPad Netflix 17,9 → 49,4 MB trong 6 phút ≈ 0,65 B mỗi byte qua relay) nên mọi hàng đợi trên
// đường dữ liệu PHẢI có trần cứng và KHÔNG được phình — đây là bất biến, không phải "mục tiêu".

print("Hàng đợi đường dữ liệu — trần cứng + chính sách khi ĐẦY (BUG-IOS-JETSAM-001)")
do {
    let P = RampStatus.DataPathQueuePolicy.self
    checkEqual(P.linkMaxPackets, 512, "trần GÓI của hàng đợi gửi = 512 (bản cũ 4096)")
    checkEqual(P.linkMaxBytes, 512 * 1024, "trần BYTE của hàng đợi gửi = 512 KB")
    checkEqual(P.overflow(count: 10, maxCount: 512), 0, "còn chỗ ⇒ không thả gói nào")
    checkEqual(P.overflow(count: 600, maxCount: 512), 88, "vượt trần ⇒ thả đúng phần vượt")
    checkEqual(P.overflow(count: 3, maxCount: 0), 2, "trần 0 bị kẹp về 1 (không có hàng đợi vô trần)")

    // (1) Hàng đợi GỬI: nạp KHÔNG có completion ⇒ phải dừng ở ĐÚNG trần, không phình.
    var budget = RampStatus.SendBudget(maxPackets: 512, maxBytes: 512 * 1024)
    var accepted = 0
    var waits = 0
    var overPackets = false
    var overBytes = false
    for _ in 0..<100_000 {
        switch budget.admit(packetBytes: 1_000) {
        case .accept: accepted += 1
        case .backpressure: waits += 1
        case .drop: break
        }
        if budget.packets > budget.maxPackets { overPackets = true }
        if budget.bytes > budget.maxBytes { overBytes = true }
    }
    check(!overPackets && !overBytes, "nạp 100.000 gói mà KHÔNG gửi xong ⇒ KHÔNG bao giờ vượt trần")
    checkEqual(accepted, 512, "chỉ nhận đúng 512 gói (trần GÓI), phần còn lại bị CHẶN")
    checkEqual(budget.packets, 512, "hàng đợi đứng ở trần, KHÔNG phình theo lưu lượng")
    checkEqual(budget.bytes, 512_000, "byte đang chờ = số gói × kích thước gói")
    checkEqual(waits, 100_000 - 512, "mọi gói sau khi đầy đều bị CHẶN (đếm được), không bơm tiếp")
    checkEqual(budget.accepted, 512, "bộ đếm `accepted` khớp số gói đã nhận")
    check(budget.isFull, "hàng đợi báo ĐẦY")

    // (2) Gửi xong thì nhả chỗ ⇒ nạp lại được (không kẹt cứng, không âm).
    budget.release(packetBytes: 1_000)
    checkEqual(budget.packets, 511, "một gói gửi xong ⇒ nhả đúng một chỗ")
    checkEqual(budget.admit(packetBytes: 1_000), .accept, "có chỗ trống ⇒ nhận gói kế tiếp")
    for _ in 0..<10_000 { budget.release(packetBytes: 1_000) }
    checkEqual(budget.packets, 0, "release dư ⇒ kẹp ở 0 (bộ đếm âm là trần vô hiệu)")
    checkEqual(budget.bytes, 0, "byte cũng kẹp ở 0")

    // (3) Trần BYTE phải chặn trước trần GÓI khi gói to (gói bị gộp).
    var byteBound = RampStatus.SendBudget(maxPackets: 512, maxBytes: 20_000)
    var n = 0
    while byteBound.admit(packetBytes: 1_500) == .accept { n += 1 }
    checkEqual(n, 13, "trần BYTE chặn ở 13 gói × 1.500 B (19.500 B ≤ 20.000 B)")
    checkEqual(byteBound.bytes, 19_500, "tổng byte đang chờ ≤ trần BYTE")
    checkEqual(byteBound.waits, 1, "lần bị chặn đầu tiên đã được đếm")

    // (4) Gói TO HƠN CẢ TRẦN ⇒ thả CÓ ĐẾM, không chờ vô hạn (không bao giờ lọt trần).
    var oversized = RampStatus.SendBudget(maxPackets: 512, maxBytes: 20_000)
    checkEqual(oversized.admit(packetBytes: 20_001), .drop, "gói > trần byte ⇒ THẢ")
    checkEqual(oversized.dropped, 1, "đã đếm gói bị thả")
    checkEqual(oversized.packets, 0, "gói bị thả KHÔNG chiếm chỗ")

    // (5) Diễn lại ca thật: máy bơm nhanh hơn đường truyền (Netflix). Đo đỉnh của cả gói lẫn byte.
    var real = RampStatus.SendBudget()
    var peakPackets = 0
    var peakBytes = 0
    var admitted = 0
    for step in 0..<200_000 {
        if real.admit(packetBytes: 1_450) == .accept {
            admitted += 1
            if step % 3 == 0 { real.release(packetBytes: 1_450) }   // completion về chậm hơn nhịp bơm 3×
        }
        peakPackets = max(peakPackets, real.packets)
        peakBytes = max(peakBytes, real.bytes)
    }
    check(peakPackets <= RampStatus.DataPathQueuePolicy.linkMaxPackets, "đỉnh gói ≤ trần")
    check(peakBytes <= RampStatus.DataPathQueuePolicy.linkMaxBytes, "đỉnh byte ≤ trần")
    check(admitted > 0, "vẫn nạp được gói (trần không chặn oan lúc đường còn chỗ)")
    check(real.dropped == 0, "backpressure KHÔNG vứt gói (vứt gói làm handshake/keepalive hỏng)")
    check(real.waits > 0, "đã phải CHỜ (backpressure) chứ không bơm vô hạn")
    real.reset()
    checkEqual(real.packets, 0, "reset ⇒ hàng đợi rỗng")
    checkEqual(real.waits, 0, "reset ⇒ xoá cả bộ đếm")

    // (6) Đệm lúc link chưa mở: trần 512 gói, quá trần thả CŨ NHẤT, không bao giờ phình.
    var buffer = RampStatus.BoundedBuffer<(at: Int, bytes: Int)>(maxCount: P.linkDownMaxPackets)
    var dropEvents = 0
    var overCap = false
    for i in 0..<5_000 {
        dropEvents += buffer.append((at: i, bytes: 1_400))
        if buffer.count > P.linkDownMaxPackets { overCap = true }
    }
    check(!overCap, "đệm link không bao giờ vượt trần")
    checkEqual(buffer.count, 512, "đệm đứng ở trần")
    checkEqual(buffer.appended, 5_000, "đã đếm đủ số gói đến")
    checkEqual(buffer.dropped, 5_000 - 512, "mọi gói vượt trần đều ĐƯỢC ĐẾM (không mất im lặng)")
    checkEqual(dropEvents, 5_000 - 512, "số lần thả trả về cho bên gọi khớp bộ đếm")
    checkEqual(buffer.items.first?.at, 5_000 - 512, "gói CŨ NHẤT bị thả trước (FIFO)")

    // (7) TTL: gói nằm quá lâu bị thả và CÓ ĐẾM.
    let droppedByTTL = buffer.dropOldest()
    checkEqual(droppedByTTL?.at, 4_488, "dropOldest trả đúng gói cũ nhất")
    checkEqual(buffer.dropped, 5_000 - 512 + 1, "thả vì TTL cũng được đếm")

    // (8) Xả đệm khi link mở lại: lấy ra theo ĐÚNG thứ tự, phần chưa xả được đặt lại ĐẦU hàng đợi.
    let held = buffer.drain()
    checkEqual(held.count, 511, "drain lấy hết phần còn lại")
    check(buffer.isEmpty, "drain ⇒ hàng đợi rỗng")
    let rest = Array(held.prefix(300))
    checkEqual(buffer.requeueFront(rest), 0, "đặt lại 300 gói vào hàng đợi còn chỗ ⇒ không thả")
    checkEqual(buffer.count, 300, "hàng đợi giữ đúng 300 gói chưa xả")
    checkEqual(buffer.items.first?.at, 4_489, "gói CŨ NHẤT vẫn đứng đầu (giữ thứ tự bắt tay)")
    checkEqual(buffer.items.last?.at, 4_788, "gói MỚI NHẤT vẫn đứng cuối")
    checkEqual(buffer.requeueFront(Array(held.suffix(400))), 188,
               "đặt lại 400 gói khi chỉ còn 212 chỗ ⇒ thả ĐÚNG phần vượt trần và có đếm")
    checkEqual(buffer.count, 512, "sau khi đặt lại vẫn đứng ở trần")
    buffer.removeAll()
    checkEqual(buffer.count, 0, "removeAll ⇒ rỗng (kết thúc phiên không giữ gói phiên cũ)")
}

// MARK: - NetworkConflictDetector (macOS) — app VPN/mạng khác tranh chấp

// Bám đúng bộ ca của bản Windows (`windows/PrivateVPNWindows.Core.Tests/NetworkConflictDetectorTests.cs`)
// + các ca riêng của macOS (utun giữ default route, proxy hệ thống, DNS nhà mạng không tới được,
// MagicDNS của Tailscale). Số liệu dùng ở đây là số THẬT lấy từ máy chủ dự án 26/09/2026.
print("NetworkConflictDetector (macOS) — app VPN/mạng khác tranh chấp")
do {
    func makeInputs(
        vpns: [SystemVPNConfiguration] = [],
        processes: [String] = [],
        proxyEnabled: Bool = false,
        proxyServer: String? = nil,
        interfaces: [NetworkInterfaceInfo] = [],
        dns: DNSResolverInfo = .empty
    ) -> NetworkConflictInputs {
        NetworkConflictInputs(
            vpnConfigurations: vpns,
            runningProcessNames: processes,
            systemProxyEnabled: proxyEnabled,
            systemProxyServer: proxyServer,
            interfaces: interfaces,
            dns: dns
        )
    }

    func iface(
        _ name: String,
        detail: String = "",
        tunnel: Bool = false,
        own: Bool = false,
        v4: Bool = false,
        v6: Bool = false,
        gateway: String? = nil,
        address: Bool = false
    ) -> NetworkInterfaceInfo {
        NetworkInterfaceInfo(
            name: name,
            detail: detail,
            isTunnelType: tunnel,
            isOwn: own,
            hasDefaultRouteV4: v4,
            hasDefaultRouteV6: v6,
            gatewayV4: gateway,
            hasAssignedAddress: address
        )
    }

    // (1) Interface nào là tunnel của app KHÁC (bám luật + danh sách của bản Windows).
    check(NetworkConflictDetector.isForeignTunnelInterface(name: "utun4", isTunnelType: true),
          "utun4 ⇒ interface tunnel của app khác")
    check(!NetworkConflictDetector.isForeignTunnelInterface(name: "en0", isTunnelType: false),
          "en0 (vật lý) KHÔNG phải tunnel của app khác")
    check(!NetworkConflictDetector.isForeignTunnelInterface(name: "utun7", isTunnelType: true, isOwn: true),
          "utun của CHÍNH VPNFlow (isOwn) ⇒ bỏ qua")
    check(!NetworkConflictDetector.isForeignTunnelInterface(name: "VPNFlow", isTunnelType: true),
          "interface mang tên VPNFlow ⇒ bỏ qua")
    check(!NetworkConflictDetector.isForeignTunnelInterface(name: "PrivateVPN Tunnel", isTunnelType: true),
          "interface mang tên PrivateVPN ⇒ bỏ qua")
    check(NetworkConflictDetector.isForeignTunnelInterface(name: "", detail: "Clash Verge TUN", isTunnelType: false),
          "mô tả chứa Clash Verge ⇒ tunnel của app khác")

    // (2) Tiến trình: ca THẬT trên máy này (Tailscale.app + ovpnagent của OpenVPN Connect).
    check(NetworkConflictDetector.isKnownProxyProcess("Tailscale"), "Tailscale ⇒ nhận ra")
    check(NetworkConflictDetector.isKnownProxyProcess("IPNExtension"), "IPNExtension (extension nền của Tailscale) ⇒ nhận ra")
    check(NetworkConflictDetector.isKnownProxyProcess("io.tailscale.ipn.macos.network-extension"),
          "bundle id Tailscale ⇒ nhận ra")
    check(NetworkConflictDetector.isKnownProxyProcess("ovpnagent"), "ovpnagent (OpenVPN Connect) ⇒ nhận ra")
    check(NetworkConflictDetector.isKnownProxyProcess("/Applications/Clash Verge.app"),
          "đường dẫn .app có khoảng trắng ⇒ nhận ra")
    check(NetworkConflictDetector.isKnownProxyProcess("sing-box.exe"), "sing-box.exe ⇒ nhận ra")
    check(NetworkConflictDetector.isKnownProxyProcess("Hysteria.exe"), "Hysteria.exe ⇒ nhận ra")
    check(NetworkConflictDetector.isKnownProxyProcess("verge-mihomo"), "verge-mihomo ⇒ nhận ra")
    check(NetworkConflictDetector.isKnownProxyProcess("v2rayN.EXE"), "v2rayN.EXE ⇒ nhận ra")
    check(!NetworkConflictDetector.isKnownProxyProcess("Google Chrome"), "Chrome ⇒ KHÔNG phải proxy")
    check(!NetworkConflictDetector.isKnownProxyProcess("Safari"), "Safari ⇒ KHÔNG phải proxy")
    check(!NetworkConflictDetector.isKnownProxyProcess("VPNFlow"), "chính VPNFlow ⇒ KHÔNG báo")
    check(!NetworkConflictDetector.isKnownProxyProcess("com.privatevpn.mac"), "bundle của chính mình ⇒ KHÔNG báo")
    check(!NetworkConflictDetector.isKnownProxyProcess("com.privatevpn.mac.packet-tunnel"),
          "provider của chính mình ⇒ KHÔNG báo")
    check(!NetworkConflictDetector.isKnownProxyProcess(nil), "nil ⇒ KHÔNG báo")
    check(!NetworkConflictDetector.isKnownProxyProcess(""), "rỗng ⇒ KHÔNG báo")
    checkEqual(NetworkConflictDetector.displayName(for: "IPNExtension"), "Tailscale",
               "tên tiến trình nội bộ ⇒ tên khách hiểu được")
    checkEqual(NetworkConflictDetector.displayName(for: "/Applications/Clash Verge.app"), "Clash Verge",
               "đường dẫn app ⇒ tên sản phẩm")
    checkEqual(NetworkConflictDetector.displayName(for: "ovpnagent"), "OpenVPN Connect",
               "ovpnagent ⇒ OpenVPN Connect")

    // (3) Hệ thống SẠCH: tunnel của chính mình giữ default route + DNS của mình ⇒ không cảnh báo.
    let cleanDNS = DNSResolverInfo(
        servers: ["1.1.1.1", "8.8.8.8"],
        tunnelServers: ["1.1.1.1", "8.8.8.8"],
        unreachableServers: [],
        searchDomains: [],
        isTunnelActive: true
    )
    let clean = makeInputs(
        vpns: [SystemVPNConfiguration(
            localizedDescription: "VPNFlow",
            providerBundleIdentifier: "com.privatevpn.mac.packet-tunnel",
            isConnected: true
        )],
        processes: ["Finder", "Google Chrome", "VPNFlow"],
        interfaces: [
            iface("en0"),
            iface("utun7", tunnel: true, own: true, v4: true, v6: true, gateway: "100.100.100.101"),
        ],
        dns: cleanDNS
    )
    check(NetworkConflictDetector.analyze(clean).isEmpty,
          "hệ thống sạch (tunnel của mình giữ route + DNS của mình) ⇒ KHÔNG cảnh báo")

    // (4) Tunnel KHÁC giữ default route IPv4 ⇒ Blocking, nêu đúng tên interface.
    let foreignV4 = makeInputs(
        interfaces: [
            iface("en0", v4: true, gateway: "192.168.1.1"),
            iface("utun9", tunnel: true, v4: true, gateway: "198.18.0.1"),
        ]
    )
    let v4Conflicts = NetworkConflictDetector.analyze(foreignV4)
    checkEqual(v4Conflicts.count, 1, "chỉ một cảnh báo cho default route của tunnel khác")
    checkEqual(v4Conflicts.first?.severity, .blocking, "tunnel khác giữ default route ⇒ Blocking")
    checkEqual(v4Conflicts.first?.kind, .foreignDefaultRoute, "đúng loại xung đột")
    check(v4Conflicts.first?.detail.contains("utun9") == true, "detail nêu tên interface utun9")
    check(v4Conflicts.first?.facts.contains("utun9 (default route IPv4, gateway 198.18.0.1)") == true,
          "facts nêu interface + family + gateway")
    check(NetworkConflictDetector.worst(v4Conflicts)?.severity == .blocking, "worst() trả mức nặng nhất")

    // (5) Chỉ default route IPv6 qua utun khác ⇒ vẫn Blocking (macOS có đường mặc định v6 riêng).
    let foreignV6 = makeInputs(interfaces: [iface("utun5", tunnel: true, v6: true)])
    let v6Conflicts = NetworkConflictDetector.analyze(foreignV6)
    checkEqual(v6Conflicts.count, 1, "một cảnh báo cho default route IPv6")
    checkEqual(v6Conflicts.first?.severity, .blocking, "default v6 qua utun khác ⇒ Blocking")
    check(v6Conflicts.first?.facts.contains("utun5 (default route IPv6)") == true,
          "facts ghi rõ family IPv6")
    check(NetworkConflictDetector.analyze(makeInputs(interfaces: [iface("utun0", tunnel: true)])).isEmpty,
          "utun khác KHÔNG giữ default route ⇒ không báo (tránh báo oan utun hệ thống)")

    // (6) Proxy hệ thống đang bật ⇒ Blocking kèm địa chỉ proxy (Clash/Surge hay bật 127.0.0.1:7890).
    let proxyConflicts = NetworkConflictDetector.analyze(
        makeInputs(proxyEnabled: true, proxyServer: "127.0.0.1:7890")
    )
    checkEqual(proxyConflicts.count, 1, "một cảnh báo proxy hệ thống")
    checkEqual(proxyConflicts.first?.severity, .blocking, "proxy hệ thống ⇒ Blocking (chặn đăng nhập/OTP)")
    checkEqual(proxyConflicts.first?.kind, .systemProxyEnabled, "đúng loại xung đột proxy")
    check(proxyConflicts.first?.detail.contains("127.0.0.1:7890") == true, "detail nêu địa chỉ proxy")
    check(proxyConflicts.first?.facts == ["system proxy 127.0.0.1:7890"], "facts nêu địa chỉ proxy")

    // (7) Chỉ có tiến trình app VPN chạy nền (Tailscale lúc đó `Disconnected`) ⇒ **Info, im lặng**.
    //
    // ĐỔI MỨC 26/09/2026 theo yêu cầu chủ dự án: ca thật log 15:39/15:41 chỉ có TIẾN TRÌNH chạy nền
    // (Tailscale + `ovpnagent` của OpenVPN Connect), chưa chiếm route, chưa bật proxy — trước đây bị
    // xếp Warning nên app hiện băng-rôn "tắt app kia đi" trong khi VPN đang chạy tốt. Mức mới: Info
    // (chỉ ghi log + thẻ Diagnostics, KHÔNG băng-rôn/hộp thoại).
    let processOnly = NetworkConflictDetector.analyze(
        makeInputs(processes: ["google chrome", "IPNExtension", "ovpnagent", "Finder"])
    )
    checkEqual(processOnly.count, 1, "chỉ một cảnh báo cho tiến trình (gom nhiều app vào một dòng)")
    checkEqual(processOnly.first?.severity, .info, "chỉ tiến trình chạy nền ⇒ Info (im lặng, chỉ ghi log)")
    checkEqual(processOnly.first?.kind, .proxyProcessRunning, "đúng loại xung đột tiến trình")
    checkEqual(processOnly.first?.facts, ["Tailscale", "OpenVPN Connect"],
               "facts nêu TÊN APP khách hiểu, bỏ qua Chrome/Finder")

    // (8) Đã có Blocking ⇒ tiến trình vẫn là Info (mức Info là mức duy nhất cho ca chỉ-có-tiến-trình).
    let both = NetworkConflictDetector.analyze(
        makeInputs(processes: ["clash-verge"], interfaces: [iface("utun9", tunnel: true, v4: true)])
    )
    checkEqual(both.count, 2, "hai cảnh báo: tunnel khác + tiến trình")
    checkEqual(both.map(\.severity), [.blocking, .info], "Blocking đứng trước, tiến trình hạ xuống Info")
    checkEqual(NetworkConflictDetector.worst(both)?.kind, .foreignDefaultRoute, "worst() = Blocking của route")

    // (9) VPN khác đang Connected ⇒ Blocking, nêu tên cấu hình VPN.
    let foreignVPN = NetworkConflictDetector.analyze(
        makeInputs(vpns: [
            SystemVPNConfiguration(
                localizedDescription: "Tailscale",
                providerBundleIdentifier: "io.tailscale.ipn.macos.network-extension",
                isConnected: true
            ),
            SystemVPNConfiguration(
                localizedDescription: "Vietnam-WireGuard",
                providerBundleIdentifier: "com.wireguard.macos.network-extension",
                isConnected: false
            ),
        ])
    )
    checkEqual(foreignVPN.count, 1, "chỉ tính VPN đang Connected (bỏ VPN đang tắt)")
    checkEqual(foreignVPN.first?.severity, .blocking, "VPN khác Connected ⇒ Blocking")
    checkEqual(foreignVPN.first?.kind, .foreignVPNConnected, "đúng loại xung đột VPN khác")
    checkEqual(foreignVPN.first?.facts, ["Tailscale (Connected)"], "facts nêu tên VPN khác + trạng thái")
    check(NetworkConflictDetector.analyze(
        makeInputs(vpns: [SystemVPNConfiguration(
            localizedDescription: "VPNFlow",
            providerBundleIdentifier: "com.privatevpn.mac.packet-tunnel",
            isConnected: true
        )])
    ).isEmpty, "VPN của CHÍNH VPNFlow Connected ⇒ KHÔNG báo")

    // (10) Resolver không trả lời — ca thật 26/09/2026: `202.96.134.133` timeout làm DNS treo 5 s.
    //
    // HỢP ĐỒNG (luật 26/09/2026): bộ dò chỉ nhận `unreachableServers` ĐÃ ĐO ĐƯỢC — mà
    // `NetworkConflictDNSProbePolicy` chỉ cho đo khi tunnel của MÌNH Connected. Ca này kiểm đúng phần
    // thuần logic: có số đo ⇒ Warning, bất kể cờ `isTunnelActive` của ảnh chụp (xem thêm ca (15)).
    let dnsDead = NetworkConflictDetector.analyze(
        makeInputs(dns: DNSResolverInfo(
            servers: ["202.96.134.133", "114.114.114.114"],
            tunnelServers: ["1.1.1.1", "8.8.8.8"],
            unreachableServers: ["202.96.134.133"],
            searchDomains: [],
            isTunnelActive: false
        ))
    )
    checkEqual(dnsDead.count, 1, "một cảnh báo DNS (resolver chết + resolver lạ, tunnel CHƯA bật)")
    checkEqual(dnsDead.first?.severity, .warning, "resolver không trả lời ⇒ Warning")
    checkEqual(dnsDead.first?.kind, .unreachableDNSResolver, "đúng loại xung đột DNS chết")
    checkEqual(dnsDead.first?.facts, ["DNS 202.96.134.133 (timeout)"], "facts nêu đúng resolver chết")

    // (11) Tunnel đang bật nhưng DNS toàn cục KHÔNG phải DNS của tunnel ⇒ Warning (app khác chen DNS).
    let dnsHijack = NetworkConflictDetector.analyze(
        makeInputs(dns: DNSResolverInfo(
            servers: ["202.96.134.133", "114.114.114.114"],
            tunnelServers: ["1.1.1.1", "8.8.8.8"],
            unreachableServers: [],
            searchDomains: [],
            isTunnelActive: true
        ))
    )
    checkEqual(dnsHijack.count, 1, "một cảnh báo DNS bị chen khi tunnel đang bật")
    checkEqual(dnsHijack.first?.kind, .foreignDNSResolver, "đúng loại xung đột DNS bị chen")
    check(NetworkConflictDetector.analyze(
        makeInputs(dns: DNSResolverInfo(
            servers: ["202.96.134.133", "114.114.114.114"],
            tunnelServers: ["1.1.1.1", "8.8.8.8"],
            unreachableServers: [],
            searchDomains: [],
            isTunnelActive: false
        ))
    ).isEmpty, "tunnel CHƯA bật ⇒ resolver của mạng nền KHÔNG bị coi là xung đột (tránh báo oan DNS scoped của en0)")

    // (12) MagicDNS của Tailscale đang cắm search domain ⇒ Warning (ca thật: Safari không vào được web).
    let magicDNS = NetworkConflictDetector.analyze(
        makeInputs(dns: DNSResolverInfo(
            servers: ["1.1.1.1"],
            tunnelServers: ["1.1.1.1"],
            unreachableServers: [],
            searchDomains: ["tail303be3.ts.net"],
            isTunnelActive: false
        ))
    )
    checkEqual(magicDNS.count, 1, "một cảnh báo cho search domain của app VPN khác")
    checkEqual(magicDNS.first?.severity, .warning, "MagicDNS của app khác ⇒ Warning")
    checkEqual(magicDNS.first?.kind, .foreignDNSSearchDomain, "đúng loại xung đột search domain")
    checkEqual(magicDNS.first?.facts, ["tail303be3.ts.net"], "facts nêu đúng miền bị cắm")
    check(NetworkConflictDetector.analyze(
        makeInputs(dns: DNSResolverInfo(
            servers: ["1.1.1.1"],
            tunnelServers: ["1.1.1.1"],
            unreachableServers: [],
            searchDomains: ["corp.example.com", "lan"],
            isTunnelActive: true
        ))
    ).isEmpty, "miền nội bộ thường (corp/lan) ⇒ KHÔNG báo")

    // (13) Dòng log cho support: `Blocking — …` + mọi dữ liệu cụ thể, cách nhau bằng ` · `.
    let summary = NetworkConflictDetector.summary(for: both)
    checkEqual(summary, "Blocking — utun9 (default route IPv4) · Clash Verge",
               "dòng log đúng định dạng chủ dự án yêu cầu")
    checkEqual(NetworkConflictDetector.summary(for: []), "sạch", "hệ thống sạch ⇒ log ghi 'sạch'")
    checkEqual(NetworkConflictDetector.analyze(.empty).count, 0, "đầu vào rỗng ⇒ không cảnh báo (không crash)")

    // (14) Nhiều mức cùng lúc: Blocking trước, Warning sau, Info cuối (UI luôn thấy việc nặng nhất trước).
    let mixed = NetworkConflictDetector.analyze(
        makeInputs(
            processes: ["mihomo"],
            proxyEnabled: true,
            proxyServer: "127.0.0.1:7890",
            interfaces: [iface("utun9", tunnel: true, v4: true)],
            dns: DNSResolverInfo(
                servers: ["1.1.1.1"],
                tunnelServers: ["1.1.1.1"],
                unreachableServers: ["1.1.1.1"],
                searchDomains: [],
                isTunnelActive: true
            )
        )
    )
    checkEqual(mixed.map(\.severity), [.blocking, .blocking, .warning, .info],
               "thứ tự mức: Blocking (route) → Blocking (proxy) → Warning (DNS) → Info (tiến trình)")
    checkEqual(mixed.count, 4, "bốn xung đột độc lập đều được báo")

    // ---------------------------------------------------------------------------------------------
    // Các ca THÊM 26/09/2026 — siết cảnh báo "xung đột mạng" cho khỏi kêu oan (log thật 15:39/15:41).
    // ---------------------------------------------------------------------------------------------

    // (15) LUẬT ĐO DNS: chỉ đo khi tunnel của MÌNH đang Connected, và số đo trong lúc tunnel tắt/đang
    //      nối KHÔNG được tính (kể cả bản nhớ tạm). Đây chính là nguồn cảnh báo DNS oan: lúc 15:39:38
    //      và 15:41:24 tunnel đang `Disconnected` mà app vẫn gửi truy vấn ⇒ resolver nào cũng timeout.
    check(NetworkConflictDNSProbePolicy.shouldMeasure(tunnelConnected: true),
          "tunnel Connected ⇒ ĐƯỢC phép đo DNS")
    check(!NetworkConflictDNSProbePolicy.shouldMeasure(tunnelConnected: false),
          "tunnel chưa Connected ⇒ KHÔNG đo DNS (hết nguồn cảnh báo DNS oan)")
    check(NetworkConflictDNSProbePolicy.canReuseCache(
        tunnelConnected: true, measuredWhileConnected: true, age: 10
    ), "số đo lúc Connected + còn TTL + tunnel vẫn Connected ⇒ dùng lại")
    check(!NetworkConflictDNSProbePolicy.canReuseCache(
        tunnelConnected: false, measuredWhileConnected: true, age: 10
    ), "tunnel vừa tắt ⇒ KHÔNG dùng lại số đo cũ")
    check(!NetworkConflictDNSProbePolicy.canReuseCache(
        tunnelConnected: true, measuredWhileConnected: false, age: 10
    ), "số đo được đo trong lúc tunnel tắt/đang nối ⇒ KHÔNG tính")
    check(!NetworkConflictDNSProbePolicy.canReuseCache(
        tunnelConnected: true, measuredWhileConnected: true, age: 301
    ), "quá TTL 300 s ⇒ phải đo lại")
    checkEqual(NetworkConflictDNSProbePolicy.cacheTTL, 300, "TTL số đo DNS = 5 phút")

    // (16) Tunnel của app khác đang BẬT (có địa chỉ định tuyến được) nhưng KHÔNG giữ default route ⇒
    //      Warning (vẫn cho kết nối) — đúng ca "app VPN kia đang Connected nhưng không giữ default route".
    let foreignTunnelUp = NetworkConflictDetector.analyze(
        makeInputs(interfaces: [iface("utun6", tunnel: true, address: true)])
    )
    checkEqual(foreignTunnelUp.count, 1, "một cảnh báo cho tunnel khác đang bật mà không giữ route")
    checkEqual(foreignTunnelUp.first?.severity, .warning,
               "tunnel khác ĐANG BẬT nhưng không giữ default route ⇒ Warning (không chặn)")
    checkEqual(foreignTunnelUp.first?.kind, .foreignTunnelWithoutDefaultRoute,
               "đúng loại xung đột tunnel-bật-không-giữ-route")
    checkEqual(foreignTunnelUp.first?.facts, ["utun6 (đang bật, không giữ default route)"],
               "facts nêu interface + lý do")
    // utun RỖNG của hệ thống (chỉ có link-local `fe80::…%utunN`, không địa chỉ định tuyến được) ⇒ KHÔNG báo.
    check(NetworkConflictDetector.analyze(
        makeInputs(interfaces: [iface("utun0", tunnel: true), iface("utun1", tunnel: true)])
    ).isEmpty, "utun rỗng của hệ thống (không địa chỉ) ⇒ KHÔNG báo oan")
    // Cùng tunnel đó mà GIỮ default route ⇒ đã là Blocking, không phải Warning.
    checkEqual(NetworkConflictDetector.analyze(
        makeInputs(interfaces: [iface("utun6", tunnel: true, v4: true, address: true)])
    ).first?.severity, .blocking, "giữ default route ⇒ Blocking (không hạ xuống Warning)")

    // (17) CHỮ KÝ tình trạng — nền tảng của luật "chỉ nhắc khi mức/tình trạng ĐỔI" và nút "Không nhắc lại".
    checkEqual(NetworkConflictDetector.signature(for: []), "", "hệ thống sạch ⇒ chữ ký rỗng")
    checkEqual(
        NetworkConflictDetector.signature(for: NetworkConflictDetector.analyze(
            makeInputs(processes: ["clash-verge"], interfaces: [iface("utun9", tunnel: true, v4: true)])
        )),
        NetworkConflictDetector.signature(for: NetworkConflictDetector.analyze(
            makeInputs(processes: ["clash-verge"], interfaces: [iface("utun9", tunnel: true, v4: true)])
        )),
        "cùng tình trạng ⇒ CÙNG chữ ký (mở lại app KHÔNG nhắc lại)"
    )
    check(NetworkConflictDetector.signature(for: processOnly) != NetworkConflictDetector.signature(for: both),
          "khác mức/tình trạng ⇒ khác chữ ký (được nhắc lại)")
    check(NetworkConflictDetector.signature(for: processOnly).hasPrefix("Info|"),
          "chữ ký ghi rõ mức nặng nhất (Info ⇒ UI im lặng)")

    // (18) Mức Info KHÔNG bao giờ lên băng-rôn/hộp thoại (UI chỉ hiện mức Warning trở lên).
    checkEqual(NetworkConflictDetector.worst(processOnly)?.severity, .info,
               "chỉ có tiến trình ⇒ mức nặng nhất là Info")
    check(processOnly.allSatisfy { $0.severity == .info }, "mọi cảnh báo của ca này đều là Info")
    check(!processOnly.contains { $0.severity == .warning || $0.severity == .blocking },
          "không có mức nào gây nhiễu khách")

    // (19) DỮ LIỆU THẬT của máy chủ dự án (26/09/2026, `loadAllFromPreferences` + `Global/IPv4`):
    //      Tailscale `connected=true` nhưng KHÔNG giữ default route (en0 giữ), DNS toàn cục là DNS nhà
    //      mạng, tunnel VPNFlow chưa bật ⇒ phải ra Blocking nêu tên Tailscale + Info cho tiến trình,
    //      và TUYỆT ĐỐI không có cảnh báo DNS (vì chưa Connected nên không đo).
    let realMachine = makeInputs(
        vpns: [
            SystemVPNConfiguration(
                localizedDescription: "Tailscale",
                providerBundleIdentifier: "io.tailscale.ipn.macos.network-extension",
                isConnected: true
            ),
            SystemVPNConfiguration(
                localizedDescription: "VPNFlow",
                providerBundleIdentifier: "com.privatevpn.mac.packet-tunnel",
                isConnected: false
            ),
            SystemVPNConfiguration(
                localizedDescription: "Vietnam-WireGuard",
                providerBundleIdentifier: "com.wireguard.macos.network-extension",
                isConnected: false
            ),
        ],
        processes: ["IPNExtension", "ovpnagent"],
        interfaces: [iface("en0", v4: true, gateway: "10.0.3.254"), iface("utun0", tunnel: true)],
        dns: DNSResolverInfo(
            servers: ["202.96.134.133", "114.114.114.114"],
            tunnelServers: ["1.1.1.1", "8.8.8.8"],
            unreachableServers: [],
            searchDomains: [],
            isTunnelActive: false
        )
    )
    let realConflicts = NetworkConflictDetector.analyze(realMachine)
    checkEqual(realConflicts.map(\.severity), [.blocking, .info],
               "dữ liệu thật: Tailscale Connected ⇒ Blocking; tiến trình nền ⇒ Info")
    checkEqual(realConflicts.first?.facts, ["Tailscale (Connected)"],
               "Blocking nêu ĐÚNG TÊN app đang Connected")
    check(realConflicts.first?.kind == .foreignVPNConnected, "đúng loại xung đột VPN khác Connected")
    check(!realConflicts.contains { $0.kind == .unreachableDNSResolver },
          "tunnel chưa Connected ⇒ KHÔNG có cảnh báo DNS oan")
    checkEqual(NetworkConflictDetector.summary(for: realConflicts),
               "Blocking — Tailscale (Connected) · Tailscale · OpenVPN Connect",
               "dòng log support grep được, đúng dữ liệu máy thật 26/09/2026")
}

print("")
print("KẾT QUẢ: \(checks - failures)/\(checks) PASS, \(failures) FAIL")
exit(failures == 0 ? 0 : 1)