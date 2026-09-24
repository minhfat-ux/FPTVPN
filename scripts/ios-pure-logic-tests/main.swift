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
    // % còn lên được = (mục tiêu / khai báo − 1) × 100.
    checkEqual(
        RampStatus.morePercent(observedKbps: 6_000, declaredDownKbps: 4_800, ceilingKbps: nil),
        56, "+56% (7500/4800 − 1)"
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
    checkEqual(live.morePercent, 46, "mục tiêu 7 Mbps (kẹp trần) / khai 4,8 ⇒ +46%")
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

print("")
print("KẾT QUẢ: \(checks - failures)/\(checks) PASS, \(failures) FAIL")
exit(failures == 0 ? 0 : 1)