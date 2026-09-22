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
    // Có số đo ⇒ khai = đo được × 0,8 (nghiệm thu: down ≤ 0,8 × goodput).
    let measured = RampStatus.safeDeclaration(
        measuredDownKbps: 10_000, rememberedDownKbps: 0,
        staticDownKbps: 100_000, staticUpKbps: 30_000, highLoss: false
    )
    checkEqual(measured.downKbps, 8_000, "đo 10 Mbps ⇒ khai 8 Mbps (=0,8×)")
    checkEqual(measured.reason, "measured", "lý do = measured")
    check(measured.downKbps * 100 <= 10_000 * 80, "down KHÔNG vượt 0,8 × số đo")

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
    checkEqual(RampStatus.declareRatioPct, 80, "tỉ lệ khai = 80% số đo")
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

print("")
print("KẾT QUẢ: \(checks - failures)/\(checks) PASS, \(failures) FAIL")
exit(failures == 0 ? 0 : 1)