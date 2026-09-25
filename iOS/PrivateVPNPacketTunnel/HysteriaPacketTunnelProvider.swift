import Foundation
import Network
import NetworkExtension
import os

/// Packet-tunnel provider Hysteria-only cho **macOS và iOS** (cùng một lớp; nhánh nền tảng
/// chỉ còn ở network settings và đường ramp băng thông — tìm `#if os(`. Đường lấy fd và chở
/// gói thì dùng CHUNG: cặp socketpair bắc cầu qua `NEPacketTunnelFlow`, xem
/// `HysteriaTransport.resolveTunnelFD`).
///
/// Vì sao tách khỏi `PacketTunnelProvider` (bản iOS): framework hysteria2 mang theo một
/// Go runtime, WireGuardKit mang theo một runtime nữa (`libwg-go.a`) — link cả hai vào
/// CÙNG một process extension là `duplicate symbol '__cgo_panic' / '_crosscall2' /
/// '__cgo_topofstack'` (đã gặp thật, xem `docs/TRANSPORT_SPEED_2026-09-19.md` §8).
/// Extension macOS vì vậy KHÔNG import WireGuardKit, không dùng
/// `WireGuardAdapter`/`TunnelConfiguration`/`WGRelayClient`: chỉ dựng transport hysteria2
/// qua relay WebSocket.
///
/// Phần việc ở đây là thứ Go không làm được: áp network settings cho utun, lấy fd utun
/// đưa cho `MobileServe`, và bảo đảm KHÔNG bao giờ để tunnel ở trạng thái
/// "Connected nhưng không có mạng" (mọi lỗi ⇒ gỡ settings + `cancelTunnelWithError`).
final class HysteriaPacketTunnelProvider: NEPacketTunnelProvider, @unchecked Sendable {

    /// Lý do cấu hình không dùng được (kèm thông báo tiếng Việt cho người dùng).
    private struct ConfigFailure: Error, CustomStringConvertible {
        let description: String
        init(_ description: String) { self.description = description }
    }

    private let log = Logger(
        subsystem: "com.privatevpn.app.packet-tunnel",
        category: "hysteria-tunnel"
    )

    /// Mã chẩn đoán gửi cho app qua `sendProviderMessage`. Giá trị TRÙNG
    /// `TunnelDiagnosticCode` của app; cố ý không import file đó để extension macOS
    /// không phải kéo theo `ControlAPIClient.swift`.
    private static let codeStartFailed = "TUNNEL_START_FAILED"
    private static let codeNoTraffic = "TUNNEL_NO_TRAFFIC"

    /// Trần thời gian cho TOÀN BỘ lần start (áp settings + dựng relay + bắt tay QUIC).
    private static let startTimeout: TimeInterval = 20

    // MARK: Ngưỡng tự cứu (không bao giờ để "Connected mà mất mạng")

    /// Mốc nghiệm thu: sau khi tunnel "lên", trong ngần này PHẢI chứng minh được có mạng
    /// thật QUA tunnel (probe đọc được IP thoát), nếu không thì TỰ GỠ tunnel.
    ///
    /// Vì sao phải tự gỡ: NetworkExtension giữ tunnel "Connected" rất lâu, còn lỗi tầng
    /// transport thì im lặng — 19/09/2026 khách bấm Connect là mất toàn mạng (TCP blackhole)
    /// mà biểu tượng VPN vẫn xanh. Xem `selfRescue`.
    private static let firstTrafficDeadline: TimeInterval = 15
    /// Mốc riêng cho TCP blackhole: SYN đi mà không có SYN-ACK/RST về trong ngần này ⇒ gỡ.
    /// Ngắn hơn `firstTrafficDeadline` vì đây là bằng chứng HỎNG rõ ràng, không phải "chưa thấy gì".
    private static let tcpBlackholeDeadline: TimeInterval = 10
    /// H2 — mốc "KHÔNG TIẾN TRIỂN" để **DỰNG LẠI** transport (khác `tcpBlackholeDeadline`: mốc đó
    /// chỉ dành cho bằng chứng TCP SYN-mà-không-SYN-ACK ở đầu phiên).
    ///
    /// Vì sao 45s (24/09/2026 tối — **android parity**): Android dùng `RELAY_SILENCE_WARN_SEC = 45`
    /// cho chiều về im lặng, và muốn kết luận phải có probe chủ động qua tunnel thất bại. Bản iOS
    /// trước đây dựng lại sau **10 s** ⇒ bắt OAN lúc tunnel chỉ RẢNH — log máy thật 24/09 22:07:12:
    /// `không tiến triển 10s: chiều về đứng yên (delta ra 0) trong khi máy vẫn gửi (delta vào 36)`
    /// ⇒ dựng lại transport, dù 45 s trước đó chiều về VẪN chảy (`Go→packetFlow 4979 → 4997 gói`).
    private static let stallSilenceDeadline: TimeInterval = 45
    /// Số nhịp LIÊN TIẾP phải "im lặng bất đối xứng" mới dựng lại (Android: `PROBE_WINS_NEEDED = 2`).
    private static let stallStrikesToRebuild = 2
    /// H2 — mốc "KHÔNG TIẾN TRIỂN" trước khi **GỠ** tunnel (trả mạng về cho máy).
    ///
    /// Vì sao 120s (24/09/2026 tối): trước đây 45 s ⇒ chỉ cần tunnel rảnh ~45 s kèm vài gói nền là
    /// extension tự gỡ (`selfRescue` → `codeNoTraffic`), app nhận mã đó rồi gọi `stopVPNTunnel()` +
    /// `state = .failed` ⇒ khách thấy **"tự ngắt"**. Nghiệm thu 19/09 vẫn giữ nguyên: tunnel hỏng
    /// THẬT (SYN không SYN-ACK ở đầu phiên, hoặc im lặng kéo dài đủ 2 strike) vẫn bị gỡ — chỉ là
    /// không gỡ oan. `selfRescue` vẫn tự bỏ qua nếu đang HOLD (chốt 22/09/2026).
    private static let stallTeardownDeadline: TimeInterval = 120
    /// Chống thrash: không yêu cầu dựng lại transport vì "không tiến triển" dày hơn mỗi 30s
    /// (một chu kỳ watchdog sống-còn) — đủ để một lần dựng lại chứng minh được là có ích hay không.
    private static let stallRebuildCooldown: TimeInterval = 30
    /// Nhịp kiểm tra (mỗi nhịp: đọc bộ đếm, ghi mốc gói đầu tiên, có thể probe).
    private static let trafficCheckInterval: TimeInterval = 5
    /// Nhịp chạy probe CHẨN ĐOÁN (chỉ để ghi log mạng của máy) — mỗi `probeEveryTicks` nhịp.
    private static let probeEveryTicks = 2
    /// Trần thời gian một lần probe.
    private static let probeTimeout: TimeInterval = 3

    // MARK: Ngưỡng watchdog SỐNG-CÒN chạy suốt phiên (parity Windows 1.4.1)

    /// Nhịp kiểm tra sống-còn. Cùng nhịp 15s của `RelayHealthWatchdog` bản Windows.
    private static let livenessInterval: TimeInterval = 15
    /// Chiều VỀ (`fromGo`) đứng yên ngần này thì coi là "im" — theo tiêu chí A5 (phát hiện
    /// ≤15 s). Ngắn hơn bản Windows 1.4.1 (60 s) để không bỏ sót ca "Connected mà không có mạng".
    private static let livenessSilenceLimit: TimeInterval = 15
    /// Chốt theo Android (24/09/2026 tối): `DEAD_PROBE_LIMIT = 2` — phải **2 nhịp liên tiếp** mới
    /// dựng lại. Bản trước để 1 (theo nghiệm thu A5 "im ≥15 s") ⇒ dựng lại transport chỉ vì một
    /// khoảng lặng 15 s, trong khi Android coi 45 s im lặng mới là **cảnh báo**.
    private static let livenessStrikesToRebuild = 2
    /// Trần số lần TỰ DỰNG LẠI transport trước khi chịu thua và gỡ tunnel (giống Windows).
    /// Số lần thử trước khi log ở mức "đã thử nhiều lần, vẫn tiếp tục NGẦM" — **KHÔNG còn là trần
    /// dừng**. Chủ dự án chốt 24/09/2026: *"nếu không có mạng thì app phải measure được và auto
    /// reconnect NGẦM lại cho user, chứ không phải báo Connected giả"* ⇒ bỏ hẳn nhánh "hết trần ⇒
    /// HOLD" (HOLD để khách ngồi ở trạng thái Connected mà không có mạng — đúng ca 22:23→22:56).
    private static let livenessRebuildMax = 3
    /// Giãn nhịp thử lại: leo tới trần **60 s** rồi giữ nhịp đó (trước đây `[2,5,10]` vì dừng ở 3
    /// lần). Nhịp giãn để không đốt pin/relay khi đường thượng nguồn chết hẳn.
    private static let livenessRebuildBackoff: [TimeInterval] = [2, 5, 10, 20, 30, 60]
    /// Trần thời gian cho MỘT chuỗi tự dựng lại. `rebuildTransportForLiveness()` là lời gọi CHẶN
    /// (chờ WS/QUIC bắt tay); gặp đường chết hẳn nó có thể kẹt vô hạn ⇒ `livenessRecovering` giữ
    /// `true` mãi ⇒ mọi nhịp sau bị `guard !recovering` bỏ qua (đúng ca 0 nhịp tim build 25/26).
    private static let recoveryStuckTimeout: TimeInterval = 120

    /// Hàng đợi riêng: `HysteriaTransport.start` CHẶN (chờ WS mở + bắt tay QUIC) nên không
    /// được chạy trên main thread của extension.
    private let queue = DispatchQueue(label: "com.privatevpn.mac.hysteria-tunnel")
    private let flowLock = NSLock()
    private var transport: HysteriaTransport?
    /// Cầu `packetFlow ↔ fd` — đường chở gói của CẢ HAI nền tảng
    /// (xem `HysteriaTransport.resolveTunnelFD`).
    private var bridge: TunnelBridge?
    /// fd đã giao cho Go (đầu của cặp socketpair; macOS/iOS như nhau).
    private var tunnelFdForCounters: Int32?
    private var session = 0
    private var startCompleted = false
    private var stopCompleted = false
    private var overallTimeout: DispatchWorkItem?
    /// Bộ giám sát "tunnel có mạng thật không" — xem `startTrafficSupervisor`.
    private var supervisorTimer: DispatchSourceTimer?
    private var supervisorSession = 0
    private var supervisorStart: Date?
    private var supervisorTick = 0
    private var supervisorStopped = false
    /// Chỉ đặt true khi đã CHỨNG MINH được có mạng qua tunnel (probe đọc được IP thoát).
    private var trafficConfirmed = false
    private var probeInFlight = false
    private var firstPacketLogged = false
    private var firstReturnPacketLogged = false
    private var firstTCPHandshakeLogged = false
    private var tcpWaitingLogged = false
    /// H2 (24/09/2026) — mốc bộ đếm của NHỊP TRƯỚC để so DELTA thay vì so luỹ kế với 0.
    private var supervisorLastInPackets = 0
    private var supervisorLastOutPackets = 0
    private var supervisorLastToGoDropped = 0
    private var supervisorLastOfferedPackets = 0
    /// Lần cuối chiều VỀ có tiến triển (gói mới) — mốc "không tiến triển trong N giây".
    private var supervisorOutProgressAt = Date()
    /// Lần cuối MÁY có gửi gói mới (kể cả gói cầu phải bỏ) — "máy vẫn gửi" của luật bất đối xứng.
    private var supervisorInProgressAt = Date()
    /// Mốc lần gần nhất đường "không tiến triển" đã yêu cầu dựng lại transport — chống thrash.
    private var supervisorStallActionAt = Date.distantPast
    /// Số nhịp LIÊN TIẾP "chiều về im lặng trong khi máy vẫn gửi" (24/09/2026 tối, android parity:
    /// `PROBE_WINS_NEEDED = 2` bên Android). Về 0 ngay khi chiều về có gói mới ⇒ một khoảng rảnh
    /// đơn độc không bao giờ đủ để dựng lại/gỡ tunnel.
    private var supervisorStallStrikes = 0
    private let probeQueue = DispatchQueue(label: "com.privatevpn.mac.hysteria-probe")
    private var statusState = "idle"
    private var statusCode: String?
    private var statusMessage: String?

    // MARK: Watchdog SỐNG-CÒN suốt phiên (xem `startLivenessWatchdog`)

    /// Quyết định thuần logic (test được) — bơm bộ đếm gói vào mỗi nhịp.
    private var liveness: LivenessWatchdog?
    private var livenessTimer: DispatchSourceTimer?
    private var livenessSession = 0
    /// Đang trong chuỗi tự dựng lại: nhịp watchdog không được chồng thêm và không đụng vào.
    private var livenessRecovering = false
    /// Số lượt dựng lại đã dùng của chuỗi phục hồi hiện tại.
    private var livenessRebuildAttempts = 0

    // MARK: - Chuyển đường khi relay/node chết CHIỀU VỀ (25/09/2026)

    /// Bộ đếm FAILOVER ĐƯỜNG: sau mỗi lần dựng lại mở cửa sổ `livenessInterval` (15 s) và đo
    /// DELTA số gói CHIỀU VỀ; 2 cửa sổ liên tiếp 0 gói về ⇒ đổi ứng viên (xem `RelayFailoverWatch`).
    ///
    /// Thay hẳn luật cũ (`transportCarriedTraffic` + `recoveryAttemptsWithoutTraffic`): luật cũ đo
    /// delta byte so với mốc bị đặt lại 0 sau MỖI lần dựng lại (`startLivenessWatchdog`) nên nhịp
    /// đầu tiên luôn thấy "có chở" (125 MB của cả phiên) ⇒ xoá bộ đếm vô ích ⇒ bám mãi `vn1hy`.
    /// Mặc định 15 s / 2 lần / 3 lần (khớp hằng số bên dưới, harness `ios-pure-logic-tests` khẳng định);
    /// đầu mỗi phiên được DỰNG LẠI theo đúng hằng số của provider trong `startTrafficSupervisor`.
    private var relayFailover = RelayFailoverWatch()
    /// Số lần đổi đường trong phiên này (chặn xoay vòng vô hạn).
    private var nodeFailovers = 0
    /// Số lần dựng lại "0 gói VỀ" liên tiếp trước khi đổi đường.
    private static let failoverAfterFruitlessRecoveries = 2
    /// Trần đổi đường mỗi phiên.
    private static let maxNodeFailovers = 3

    // MARK: - Luật GOODPUT: node "sống" nhưng chở ≈0 byte (25/09/2026)

    /// Mốc `fromGoBytes` của nhịp trước — để đo BYTE chiều về trong một nhịp (luật im-lặng chỉ đo GÓI).
    private var livenessPrevFromGoBytes = 0
    /// Mốc `toGoBytes` của nhịp trước — để loại trừ ca khách đang UPLOAD (chiều lên lớn, chiều về
    /// chỉ là ACK ⇒ nếu không loại trừ thì luật goodput cắt oan một phiên upload đang chạy tốt).
    private var livenessPrevToGoBytes = 0
    /// Số nhịp liên tiếp "máy đang xin dữ liệu mà chiều về ≈0 byte".
    private var lowGoodputStrikes = 0
    /// Máy phải đẩy đủ ngần này gói trong nhịp 15 s mới tính là "đang XIN dữ liệu"
    /// (máy ngồi yên chỉ có vài gói nền ⇒ không kết luận, tránh cắt oan).
    private static let goodputMinOfferedPackets = 30
    /// Chiều về dưới ngần này BYTE trong nhịp 15 s (20 KB ≈ 10 kbps) ⇒ coi như node KHÔNG chở.
    private static let goodputMinBytes = 20_000
    /// Chiều LÊN từ ngần này BYTE trở lên trong nhịp 15 s (200 KB ≈ 107 kbps) ⇒ coi là phiên UPLOAD
    /// thật, KHÔNG áp luật goodput (tránh cắt oan).
    private static let goodputMaxUpBytes = 200_000
    /// Số nhịp liên tiếp như trên trước khi dựng lại transport.
    private static let lowGoodputStrikesToRebuild = 2
    /// Phiên đã dừng: mọi callback `asyncAfter` còn treo phải tự bỏ.
    private var livenessCancelled = false
    /// Pha HOLD (chủ dự án chốt 22/09/2026): hết mọi đường thì GIỮ đường đã chọn + tunnel vẫn
    /// `Connected` + ping lại mỗi nhịp chờ mạng về — KHÔNG `closeTun()`/teardown.
    private var livenessHold = false
    /// Lý do vào HOLD — chỉ dùng để ghi log.
    private var livenessHoldReason = ""
    /// Bộ đếm của NHỊP TRƯỚC — để log quyết định kèm DELTA (H2: đọc log là thấy mức nghẽn).
    private var livenessPrevFromGo = 0
    private var livenessPrevToGo = 0
    private var livenessPrevToGoDropped = 0
    /// Nhịp watchdog gần nhất + số nhịp đã chạy — "đồng hồ chết" độc lập đọc hai số này.
    private var livenessLastTickAt = Date()
    private var livenessTicks = 0
    /// Đồng hồ CHẾT, chạy trên HÀNG ĐỢI RIÊNG.
    ///
    /// Vì sao phải có: mọi đường thoát của `livenessStep` đều IM LẶNG — `cancelled` gọi
    /// `cancelLivenessWatchdog()` (không log), `recovering` `return` (không log), `.idle` `return`
    /// (không log). Nên khi vòng lặp ngừng chạy thì không còn dấu vết nào và **không ai tự cứu**.
    /// Đúng ca đo trên iPhone 23/09/2026: sau lần ramp dựng lại transport lúc 12:18:38, watchdog
    /// im lặng 14 phút dù `toGo` đóng băng + `toGoDropped` leo (đủ điều kiện `.rebuild`).
    private var watchdogGuardTimer: DispatchSourceTimer?
    private let watchdogGuardQueue = DispatchQueue(label: "com.privatevpn.app.tunnel.watchdog-guard")
    /// (24/09/2026 khuya) Hàng đợi RIÊNG cho **nhịp** watchdog sống-còn.
    ///
    /// Vì sao bắt buộc: trước đây nhịp chạy trên `queue` — cùng hàng đợi với `performBandwidthRebuild`
    /// / `rebuildTransportForLiveness` (đều CHẶN, chờ WS/QUIC bắt tay). Một lượt dựng lại kẹt là
    /// **nhịp watchdog câm luôn**: log thật build 25/26 có **0 nhịp tim** suốt phiên (build 22: 28
    /// nhịp) ⇒ mọi luật phát hiện (kể cả relay-stall) không bao giờ chạy, và ca 23:28:23→23:29:09
    /// (relay đóng băng 46 s) không ai bắt.
    private let livenessQueue = DispatchQueue(label: "com.privatevpn.app.tunnel.liveness")
    /// Hàng đợi cho **việc** tự dựng lại transport (chặn) — tách khỏi `livenessQueue` để dù nó kẹt
    /// thì nhịp tim vẫn đập và vẫn kết luận được.
    private let recoveryQueue = DispatchQueue(label: "com.privatevpn.app.tunnel.recovery")
    /// Giới hạn tần suất log khi nhịp watchdog bị bỏ qua vì đang trong chuỗi tự dựng lại.
    private var lastLivenessSkipLogAt = Date.distantPast

    /// Nhịp tim: 1 dòng mỗi ngần này nhịp (4 × 15 s = 60 s) để `.idle` không còn vô hình.
    private static let livenessHeartbeatEveryTicks = 4
    /// Quá hạn này mà không có nhịp nào ⇒ coi như vòng lặp đã ngừng: log + bật lại.
    private static let livenessStallLimit: TimeInterval = 45

    // MARK: - Lưới an toàn chống ĐÔNG CỨNG cả tiến trình (25/09/2026)

    /// Khoá RIÊNG của lưới an toàn — luồng canh **không bao giờ** lấy `flowLock`/`bandwidthLock`/
    /// `rebuildLock`, nên dù các đường kia kẹt cứng nó vẫn chạy và vẫn hạ được tunnel.
    ///
    /// Vì sao bắt buộc phải có: ca thật 25/09/2026 (iPad build 35) — sau dòng
    /// `tự phục hồi: lần 1 — chờ 2s rồi dựng lại`, tiến trình **đông cứng 43 phút**: extension
    /// VẪN SỐNG (PID còn, màn hình không khoá) nhưng **mọi** nhịp câm (cầu 5 s, relay 15 s,
    /// watchdog 15 s, diagnostics 1 s) ⇒ không còn ai tự phục hồi, khách thấy
    /// **"Connected mà không có internet"** cho tới khi khởi động lại máy.
    /// Mọi cơ chế canh cũ (kể cả `watchdogGuardQueue.asyncAfter`) đều nằm trên **hàng đợi**, mà
    /// hàng đợi thì chết theo khoá bị giữ — nên phải canh bằng một **luồng OS riêng**.
    private let wedgeLock = NSLock()
    /// Nhịp "tiến trình còn chạy" — cập nhật bởi MỌI nhịp định kỳ (chỉ vài nano-giây, khoá riêng).
    private var wedgeLastBeatAt = Date()
    /// `!= nil` khi đang trong một chuỗi dựng lại transport (mốc bắt đầu).
    private var wedgeRecoveryStartedAt: Date?
    /// Tunnel đang PHẢI chạy (bật ở `startTunnel`, tắt ở `stopTunnel`/teardown).
    private var wedgeTunnelActive = false
    private var wedgeGuardRunning = false
    private var wedgeTeardownDone = false
    /// Không nhịp nào trong ngần này giây ⇒ coi như đông cứng.
    ///
    /// 180 s (không phải 75 s) vì **iOS gộp/hoãn timer khi máy để yên**: đo thật trên iPad
    /// 25/09/2026 — `watchdog NGỪNG chạy (45s/46s/53s không có nhịp)` lặp lại trong lúc máy khoá.
    /// Ngưỡng quá nhỏ ⇒ lưới an toàn hạ tunnel OAN khi khách để máy yên (không có gì để cứu).
    /// Luật bắt đúng ca đông cứng 43 phút sáng nay là luật DƯỚI ĐÂY (`wedgeRecoveryLimit` = 30 s),
    /// không phải luật này.
    private static let wedgeStallLimit: TimeInterval = 180
    /// Một chuỗi dựng lại transport chạy quá ngần này giây ⇒ coi như kẹt (bình thường ≤ 10 s).
    private static let wedgeRecoveryLimit: TimeInterval = 30
    /// Nhịp quét của luồng canh.
    private static let wedgeSweepInterval: TimeInterval = 5
    /// Mã lỗi trả cho iOS khi phải hạ tunnel vì đông cứng (khác `TUNNEL_START_FAILED`).
    private static let codeWedgeTeardown = "TUNNEL_WEDGED"
    /// Bộ nhớ vượt ngưỡng an toàn (BUG-IOS-JETSAM-001).
    private static let codeMemoryLimit = "TUNNEL_MEMORY_LIMIT"

    /// Ghi nhận "còn sống" — gọi từ mọi nhịp định kỳ.
    private func wedgeBeat() {
        wedgeLock.lock()
        wedgeLastBeatAt = Date()
        wedgeLock.unlock()
    }

    /// Tunnel bắt đầu/kết thúc "phải chạy" — chặn lưới an toàn bắn khi tunnel đang tắt hợp lệ.
    private func wedgeSetTunnelActive(_ active: Bool) {
        wedgeLock.lock()
        wedgeTunnelActive = active
        wedgeTeardownDone = false
        wedgeLastBeatAt = Date()
        if !active { wedgeRecoveryStartedAt = nil }
        wedgeLock.unlock()
    }

    private func wedgeRecoveryBegin() {
        wedgeLock.lock()
        wedgeRecoveryStartedAt = Date()
        wedgeLock.unlock()
    }

    private func wedgeRecoveryEnd() {
        wedgeLock.lock()
        wedgeRecoveryStartedAt = nil
        wedgeLastBeatAt = Date()
        wedgeLock.unlock()
    }

    // MARK: - Đo TÀI NGUYÊN mỗi 60 s (25/09/2026: "chạy ~30 phút rồi bắt đầu bị" + có JetsamEvent)

    private var resourceTimer: DispatchSourceTimer?
    private var resourcePrevToGo = 0
    private var resourcePrevFromGo = 0
    private var resourcePrevRelaySent = 0
    private var resourcePrevRelayRecv = 0
    private var resourceFootprintHistory: [(Date, Double)] = []

    /// Một dòng tài nguyên: bộ nhớ (footprint/resident), số fd, bộ đệm cầu + relay.
    /// Vì sao cần: ca thật — phiên chạy tốt ~30 phút rồi extension bị iOS giết (`JetsamEvent`
    /// 25/09 19:09:42). Không có đường cong tài nguyên thì không biết thứ gì phình (bộ nhớ, fd rò
    /// mỗi lần dựng lại transport, hay bộ đệm relay) ⇒ chỉ đoán.
    private func startResourceTicker() {
        resourceTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: diagQueue)
        timer.schedule(deadline: .now() + 60, repeating: 60)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            let snapshot = self.resourceSnapshot()
            RelayDiagnostics.shared.log("tài nguyên: \(snapshot)")
            // DỌN TÀI NGUYÊN TẠI CHỖ: iOS giết extension theo `per-process-limit` (~51 MB,
            // `JetsamEvent` 25/09 19:09:42) ⇒ khi footprint vượt ngưỡng thì xả cache NGAY,
            // không đợi tới lúc bị giết. Đo trước/sau để biết có hiệu quả hay không.
            let footprint = self.resourceFootprintMB()
            // BẮT TỐC ĐỘ LEO: đo thật 25/09 — Netflix làm footprint leo **~1 MB/phút** (37,9 → 44,5 MB
            // trong 8 phút) và phiên chết ở 44,5 MB *trước khi* chạm ngưỡng 45 ⇒ chỉ ngưỡng tĩnh là
            // không đủ. Giữ 6 mốc (≈6 phút); leo ≥ 6 MB trong 5 phút ⇒ hạ tunnel sạch như van.
            self.resourceFootprintHistory.append((Date(), footprint))
            if self.resourceFootprintHistory.count > 6 { self.resourceFootprintHistory.removeFirst() }
            var growthTrigger: Double = 0
            if let oldest = self.resourceFootprintHistory.first {
                let minutes = Date().timeIntervalSince(oldest.0) / 60
                if minutes >= 4.5, footprint - oldest.1 >= Self.memoryGrowthTriggerMB {
                    growthTrigger = footprint - oldest.1
                }
            }
            // VAN AN TOÀN BỘ NHỚ (đo thật 25/09/2026: phiên Netflix leo tới 48,8 MB rồi bị iOS giết
            // `per-process-limit` ≈ 51 MB — BUG-IOS-JETSAM-001; dọn URLCache đo được 0 MB hiệu quả)
            // ⇒ tự HẠ TUNNEL SẠCH ở 45 MB để iOS trả mạng, thay vì bị giết đột ngột giữa lúc khách dùng.
            if footprint >= Self.memoryTeardownThresholdMB || growthTrigger > 0 {
                RelayDiagnostics.shared.logSync(String(
                    format: "van an toàn bộ nhớ: footprint %.1fMB (ngưỡng %.0fMB, leo %.1fMB/5phút) "
                        + "⇒ HẠ tunnel SẠCH (trả mạng ngay) rồi thoát extension, thay vì để iOS jetsam giết đột ngột",
                    footprint, Self.memoryTeardownThresholdMB, growthTrigger
                ))
                self.setStatus(
                    state: "failed", code: Self.codeMemoryLimit,
                    message: "Tunnel dùng quá nhiều bộ nhớ — đã hạ để trả mạng lại, hãy Connect lại."
                )
                setTunnelNetworkSettings(nil) { _ in }
                cancelTunnelWithError(NSError(
                    domain: "com.privatevpn.app.tunnel", code: 2_020,
                    userInfo: [NSLocalizedDescriptionKey:
                        "Bộ nhớ vượt ngưỡng an toàn — đã hạ tunnel để trả mạng lại."]))
                Thread.sleep(forTimeInterval: 3)
                exit(0)
            }
            // (Đã BỎ khối "dọn tài nguyên" cũ: đo thật 25/09 — 8 lần chạy, đều giảm **0 MB**
            //  ⇒ URLCache/cửa sổ đo KHÔNG phải chỗ giữ bộ nhớ. Giữ log sạch để chỉ còn một dòng van.)
        }
        resourceTimer = timer
        timer.resume()
    }

    /// Ngưỡng bắt đầu dọn (MB). iOS giết extension ở `per-process-limit` ≈ 51 MB (JetsamEvent
    /// 25/09/2026 19:09:42: `rpages=3202`) ⇒ dọn ở 32 MB là còn biên an toàn.
    ///
    /// ⚠️ macOS **KHÔNG có jetsam** (trần per-process của iOS ≈51 MB là chuyện của iOS). Áp nguyên
    /// ngưỡng 32/45 MB của iOS lên macOS làm extension **TỰ HẠ TUNNEL** khi footprint vượt 45 MB ⇒
    /// khách thấy "VPN tự tắt/chập chờn" (đo thật trên máy Mac 25/09/2026: 23:17 `footprint=148.0MB`
    /// và 23:42 `footprint=58.8MB` đều ghi `van an toàn bộ nhớ ⇒ HẠ tunnel SẠCH`). Vì vậy ngưỡng
    /// macOS để cao hơn hẳn: chỉ dọn, gần như không bao giờ phải hạ tunnel.
    #if os(iOS)
    private static let memoryCleanupThresholdMB: Double = 32

    /// Ngưỡng HẠ TUNNEL SẠCH (MB): dưới trần jetsam ~51 MB. Đo thật: mẫu tải nhẹ chỉ 13–14 MB còn
    /// Netflix leo ~1 MB/phút ⇒ 40 MB là mức bắn sớm mà không bắn oan.
    private static let memoryTeardownThresholdMB: Double = 40
    /// Bắt theo TỐC ĐỘ LEO: tăng ≥ ngần này MB trong ~5 phút ⇒ hạ sớm (ca Netflix).
    private static let memoryGrowthTriggerMB: Double = 6
    #else
    private static let memoryCleanupThresholdMB: Double = 200
    private static let memoryTeardownThresholdMB: Double = 400
    #endif

    private func resourceFootprintMB() -> Double {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(
            MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size
        )
        let kr = withUnsafeMutablePointer(to: &info) { ptr in
            ptr.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), rebound, &count)
            }
        }
        return kr == KERN_SUCCESS ? Double(info.phys_footprint) / 1_048_576 : 0
    }

    private func openFileDescriptorCount() -> Int {
        (try? FileManager.default.contentsOfDirectory(atPath: "/dev/fd").count) ?? -1
    }

    private func resourceSnapshot() -> String {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(
            MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size
        )
        let kr = withUnsafeMutablePointer(to: &info) { ptr in
            ptr.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), rebound, &count)
            }
        }
        let footprint = kr == KERN_SUCCESS ? Double(info.phys_footprint) / 1_048_576 : -1
        let resident = kr == KERN_SUCCESS ? Double(info.resident_size) / 1_048_576 : -1
        let fds = (try? FileManager.default.contentsOfDirectory(atPath: "/dev/fd").count) ?? -1
        let c = trafficCounters
        let relay = currentTransport()?.relayFrameCounts
        let relayOpen = currentTransport()?.relayIsConnected ?? false
        let dToGo = (c?.toGo ?? 0) - resourcePrevToGo
        let dFromGo = (c?.fromGo ?? 0) - resourcePrevFromGo
        let dRelaySent = (relay?.sent ?? 0) - resourcePrevRelaySent
        let dRelayRecv = (relay?.received ?? 0) - resourcePrevRelayRecv
        if let c { resourcePrevToGo = c.toGo; resourcePrevFromGo = c.fromGo }
        if let relay { resourcePrevRelaySent = relay.sent; resourcePrevRelayRecv = relay.received }
        return String(
            format: "footprint=%.1fMB resident=%.1fMB fds=%d | cầu vào %d/ra %d (bỏ %d) | relay gửi %d nhận %d mở=%@ | Δ1phút vào+%d ra+%d relay+%d/+%d",
            footprint, resident, fds,
            c?.toGo ?? -1, c?.fromGo ?? -1, c?.toGoDropped ?? -1,
            relay?.sent ?? -1, relay?.received ?? -1, relayOpen ? "yes" : "no",
            dToGo, dFromGo, dRelaySent, dRelayRecv
        )
    }

    /// Bật luồng canh (idempotent). Luồng chỉ `Thread.sleep` + đọc 2 mốc ⇒ không thể bị đói
    /// như Swift concurrency thread-pool, và không thể chết theo một khoá app.
    private func startWedgeGuard() {
        wedgeLock.lock()
        let already = wedgeGuardRunning
        wedgeGuardRunning = true
        wedgeLock.unlock()
        guard !already else { return }
        let thread = Thread { [weak self] in self?.wedgeGuardLoop() }
        thread.name = "com.privatevpn.app.tunnel.wedge-guard"
        thread.stackSize = 256 * 1024
        thread.start()
        RelayDiagnostics.shared.log(
            "lưới an toàn: luồng canh đông-cứng BẬT — mọi nhịp câm >\(Int(Self.wedgeStallLimit))s, "
                + "hoặc một chuỗi dựng lại >\(Int(Self.wedgeRecoveryLimit))s ⇒ HẠ tunnel để iOS trả "
                + "mạng lại (thay vì treo 'Connected' vô hạn)"
        )
    }

    private func wedgeGuardLoop() {
        while true {
            Thread.sleep(forTimeInterval: Self.wedgeSweepInterval)
            let now = Date()
            wedgeLock.lock()
            let running = wedgeGuardRunning
            let active = wedgeTunnelActive
            let done = wedgeTeardownDone
            let beat = wedgeLastBeatAt
            let recoveryStart = wedgeRecoveryStartedAt
            wedgeLock.unlock()
            guard running else { return }
            guard active, !done else { continue }
            if let recoveryStart {
                let stuck = now.timeIntervalSince(recoveryStart)
                // HAI điều kiện, không phải một:
                //  (1) chuỗi dựng lại quá trần, VÀ
                //  (2) **mọi nhịp cũng đã câm ≥15 s** — tức tiến trình THẬT SỰ đông cứng.
                // Vì sao cần (2): lần bắn oan 12:02 ngày 25/09/2026 — dựng lại đã thành công nhưng
                // cờ "đang dựng lại" còn treo, các nhịp VẪN ĐẬP; chỉ nhìn (1) là hạ tunnel oan.
                // Ca đông cứng thật (43 phút sáng 25/09) thì cả hai đều đúng.
                let silentNow = now.timeIntervalSince(beat)
                if stuck >= Self.wedgeRecoveryLimit, silentNow >= 15 {
                    hardTeardownForWedge(
                        reason: "một chuỗi tự dựng lại transport kẹt \(Int(stuck))s "
                            + "(trần \(Int(Self.wedgeRecoveryLimit))s) và mọi nhịp câm "
                            + "\(Int(silentNow))s"
                    )
                    continue
                }
            }
            let silent = now.timeIntervalSince(beat)
            if silent >= Self.wedgeStallLimit {
                hardTeardownForWedge(
                    reason: "mọi nhịp của tunnel câm \(Int(silent))s "
                        + "(trần \(Int(Self.wedgeStallLimit))s) — tiến trình còn sống nhưng đông cứng"
                )
            }
        }
    }

    /// Hạ tunnel bằng ĐÚNG những lời gọi KHÔNG lấy khoá app (đường kia có thể đang giữ khoá):
    /// `RelayDiagnostics.log` (hàng đợi riêng) + `setTunnelNetworkSettings(nil)` (async) +
    /// `cancelTunnelWithError` (async). Sau đó `exit(0)`: iOS dựng lại extension theo yêu cầu,
    /// còn mạng của khách được trả lại NGAY thay vì treo "Connected" vô hạn.
    ///
    /// Cố ý KHÔNG gọi `teardownAndCancel`/`cancelScheduledWork`: hai hàm đó lấy `flowLock` — đúng
    /// thứ có thể đang bị giữ trong ca đông cứng.
    private func hardTeardownForWedge(reason: String) {
        wedgeLock.lock()
        let already = wedgeTeardownDone
        wedgeTeardownDone = true
        wedgeTunnelActive = false
        wedgeLock.unlock()
        guard !already else { return }
        RelayDiagnostics.shared.log(
            "lưới an toàn: ĐÔNG CỨNG — \(reason) ⇒ HẠ tunnel rồi thoát extension để iOS dựng lại "
                + "(mạng của khách được trả lại ngay)"
        )
        setStatus(state: "failed", code: Self.codeWedgeTeardown, message: reason)
        setTunnelNetworkSettings(nil) { _ in }
        cancelTunnelWithError(
            NSError(
                domain: "com.privatevpn.app.tunnel",
                code: 2_014,
                userInfo: [NSLocalizedDescriptionKey:
                    "Tunnel đông cứng (\(reason)) — đã hạ để trả mạng lại, hãy bấm Connect lại."]
            )
        )
        Thread.sleep(forTimeInterval: 5)
        RelayDiagnostics.shared.log("lưới an toàn: thoát extension sau khi đã hạ tunnel")
        Thread.sleep(forTimeInterval: 1)
        exit(0)
    }

    // MARK: Khai băng thông động cho Brutal CC (xem `HysteriaBandwidthControl`)

    /// Số khai + bộ nhớ theo mạng của phiên hiện tại. `nil` ⇒ dùng đúng `HysteriaDefaults`.
    private var bandwidth: BandwidthControl.SessionState?
    /// Mạng nằm dưới tunnel. Cần để biết máy ĐÃ đổi mạng (Wi-Fi → 4G, đổi router) mà đổi khoá
    /// bộ nhớ và số khai ở lần kết nối sau — `NWPathMonitor` giữ `currentPath` luôn mới.
    private var bandwidthPathMonitor: NWPathMonitor?
    /// Số khai của transport ĐANG chạy — cần để biết lần dựng lại có thật sự đổi số không.
    private var activeUpKbps = 0
    private var activeDownKbps = 0
    private var activeBandwidthReason: BandwidthControl.Reason?
    /// Có yêu cầu ramp đang chờ dựng lại transport ở ranh giới an toàn (tunnel rảnh).
    private var bandwidthRampPending = false
    /// H1 (24/09/2026) — mốc log gần nhất của việc TỪ CHỐI buộc áp hạ số khai khi tunnel đang
    /// chở traffic (chống ngập log vì nhịp lấy mẫu là 1s).
    private var lastForcedDownRampRefusalLogAt = Date.distantPast
    /// Chủ sở hữu ĐỘC QUYỀN việc dựng lại transport: `"bandwidth"` (ramp) hoặc `"liveness"`
    /// (watchdog sống-còn). Cả hai đều thay transport trên cùng fd/cầu nên chồng nhau là hỏng;
    /// một thời điểm chỉ một đường được giữ.
    private var transportRebuildOwner: String?
    private let rebuildLock = NSLock()
    /// Mốc đã ghi bộ nhớ lần trước (để chốt đỉnh đo được ngay cả khi tunnel bị đứt).
    private var measuredPeakDownKbps = 0

    // MARK: - ĐỔI MẠNG GIỮA PHIÊN (parity Android `rebuildRequested`, 25/09/2026)
    //
    // Đường RIÊNG, KHÔNG đi qua `BandwidthControl.allowsTransportRebuild` (đường tự-áp số khai
    // trong phiên vẫn TẮT có chủ đích — xem `allowsTransportRebuild`).

    /// Khoá mạng đã xử lý lần cuối. `BandwidthControl.SessionState.sample` tự cập nhật `key` khi
    /// danh tính mạng đổi (nó ghi log `bw: net đổi giữa phiên …`); provider so khoá này mỗi nhịp 1 s
    /// để biết mình vừa ĐỔI MẠNG ⇒ dựng lại transport trên đường mới.
    private var lastBandwidthNetworkKey: String?
    /// Yêu cầu dựng lại đang chờ (đã phát hiện đổi mạng nhưng chưa tới lượt: cooldown/đang bận).
    private var pendingNetworkChangeFrom: String?
    private var pendingNetworkChangeTo: String?
    /// Mốc lần dựng lại GẦN NHẤT vì đổi mạng — mốc của cooldown `NetworkChangePolicy.cooldownS`.
    private var lastNetworkChangeRebuildAt: Date?
    /// Số lần đã dựng lại vì đổi mạng trong phiên (chỉ để chẩn đoán).
    private var networkChangeRebuildCount = 0
    /// Chủ sở hữu quyền dựng lại của đường này (xem `acquireTransportRebuild`).
    private static let networkChangeRebuildOwner = "net-change"
    /// A10 §2g — số byte live của lần lấy mẫu trước, để tính tốc độ ↓/↑ mỗi 1s (kiểu Ookla).
    private var liveSampleBaseline: BandwidthControl.ByteSample?
    private var liveSampleAt = Date.distantPast
    private var liveDownKbps = 0
    private var liveUpKbps = 0
    /// Cửa sổ 3 mẫu 1 s gần nhất, CHỈ dùng cho số hiển thị trên thẻ Diagnostics.
    ///
    /// Vì sao cần: một mẫu 1 s đơn lẻ dao động rất mạnh (có lúc 0, có lúc gấp đôi) nên không so
    /// được với phép đo kiểu Ookla (đo trung bình nhiều giây) — khách phản ánh "down/up không đúng
    /// với Ookla". Không logic ramp/transport nào đọc hai số này.
    private var liveDownWindow: [Int] = []
    private var liveUpWindow: [Int] = []
    /// Phiên này đã từng chở byte chưa — mốc `serving` của thẻ Diagnostics.
    ///
    /// Vì sao KHÔNG dùng `bytes.inbound + bytes.outbound > 0` như trước: bộ đếm đó thuộc CẦU HIỆN
    /// TẠI, mà mỗi lần dựng lại transport là một cầu MỚI (`retargetTunnelFD` → `bridge = created`)
    /// nên bộ đếm quay về 0 ⇒ `serving = false` ⇒ `RampStatus.display` xoá hết số ⇒ thẻ Diagnostics
    /// **mất toàn bộ thông số** dù phiên vẫn đang chạy (đúng triệu chứng: "hiện lên khi connect,
    /// sau đó không có thông số").
    private var hasServedThisSession = false
    /// A10 §2g — ảnh chụp số hiển thị Diagnostics, cập nhật ở nhịp 1s sẵn có và đọc trong
    /// `handleAppMessage`. Bảo vệ bằng `bandwidthLock` (ghi ở `bandwidthQueue`, đọc ở queue NE).
    private var liveDiagSnapshot: RampStatus.Display?

    // MARK: - Nhịp HIỂN THỊ riêng 1 giây (25/09/2026)
    //
    // Vì sao cần: thẻ Diagnostics lấy số từ `bandwidthStep` (nhịp lấy mẫu cho vòng ramp) — nhịp đó
    // bị chặn nên log máy thật cho thấy **2 mẫu / 105 giây** ⇒ thẻ hiện `live down=0` trong khi bộ
    // đếm cầu cho thấy tunnel đang chở 1,1–1,6 Mbps. Nhịp dưới đây chạy ở hàng đợi RIÊNG, 1 giây/lần,
    // đọc ĐÚNG nguồn byte mà bảng kiểm tra log dùng: `Go→packetFlow` = xuống, `packetFlow→Go` = lên.
    private let diagQueue = DispatchQueue(label: "com.privatevpn.app.tunnel.diag-ticker")
    private var diagTimer: DispatchSourceTimer?
    private var displayDownKbps: Int?
    private var displayUpKbps: Int?
    private var displayRateAt = Date.distantPast
    private var displayPrevBytes: (inBytes: Int, outBytes: Int, at: Date)?
    private var displayDownWindow: [Int] = []
    private var displayUpWindow: [Int] = []
    /// Mốc ghi log "nhịp mù" gần nhất (`bandwidthBytes == nil` làm cả hai nhịp trả về sớm) — 60 s/lần.
    private var displayBlindLogAt = Date.distantPast
    /// A10 §2g — mốc ghi log `bw: sample observed=…` (10s/lần) để đối chiếu số trên màn hình
    /// với log chẩn đoán mà không làm ngập file log.
    private var lastDiagLogAt = Date.distantPast
    /// Nhịp lấy mẫu byte: 1s (yêu cầu "đo trong ≤3 giây" ⇒ mẫu thứ 2–3 đã có số nếu có traffic).
    private static let bandwidthSampleInterval: TimeInterval = 1
    /// Trần số lần dựng lại transport vì ramp trong MỘT phiên (ramp là tối ưu, không được
    /// phép thành vòng lặp phá tunnel). Hết lượt ⇒ số mới đã nằm trong bộ nhớ, áp ở lần sau.
    private static let rampMaxAttempts = 5
    /// Mốc các lần ÁP số khai trong phiên — dùng cho trần "3 lần/10 phút" của
    /// `RampStatus.ApplyGate` (xem `applyBandwidthRampIfIdle`).
    private var bandwidthApplyTimes: [Date] = []
    /// Mốc lần áp số khai gần nhất (cooldown ≥90 s).
    private var lastBandwidthApplyAt: Date?
    /// Bằng chứng chủ động cho "giám sát traffic" khi bộ đếm tunnel = 0 (xem
    /// `TrafficSupervisorPolicy`): byte interface vật lý ở nhịp trước, số lần probe hỏng LIÊN
    /// TIẾP, mốc bắt đầu cửa sổ đánh giá, và mốc log (throttle).
    private var supervisorPhysicalBytes: Int?
    private var supervisorIdleProbeFailures = 0
    private var supervisorIdleWindowStart = Date()
    private var supervisorIdleLogAt = Date.distantPast
    private var supervisorIdleProbeInFlight = false
    /// Đã TẮT tự-áp cho hết phiên này (quá trần 3 lần/10 phút, hoặc vừa phải rollback một lần).
    private var bandwidthAutoApplyDisabled = false
    /// Đã ghi log `apply=disabled-for-session` chưa (chỉ ghi MỘT lần, không ngập log).
    private var bandwidthDisabledLogged = false
    /// Số lần đã phải ROLLBACK trong phiên (chỉ để đếm/báo cáo).
    private var bandwidthRollbackCount = 0
    /// Số lần RETARGET cầu (đổi fd giữa phiên, KHÔNG dừng cầu) — đếm để báo cáo.
    private var bandwidthRetargetCount = 0
    /// Mốc retarget gần nhất (báo cáo/đo).
    private var lastBandwidthRetargetAt: Date?
    /// Mốc đo ĐƯỜNG THẬT (pre-measure ngoài tunnel) gần nhất + cờ đang đo.
    private var lastRawLineProbeAt = Date.distantPast
    private var rawLineProbeInFlight = false
    /// Mốc bộ đếm của nhịp TRƯỚC cho cổng bất đối xứng (i).
    private var bwPrevOfferedPackets = 0
    private var bwPrevFromGoPackets = 0
    /// Ngưỡng ghi log `measured=`: dưới mức này chỉ là DNS/ping, không phải một lần đo. Trùng
    /// `BandwidthControl.minMeasuredKbps` (300 kbps) — đo THẬT trên iPad 19/09/2026 ra
    /// 503/513/570 kbps, sát ngưỡng 500 tới mức một mẫu thấp hơn chút là không có dòng log nào.
    private static let bandwidthLogMinKbps = 300
    /// Trần thời gian chờ bản cập nhật MẠNG đầu tiên của `NWPathMonitor` lúc mở phiên (xem
    /// `prepareBandwidthSession`). Thực tế về trong <100ms; trần này chỉ để `startTunnel`
    /// không bao giờ bị treo (ngân sách chung là `startTimeout` = 20s).
    private static let bandwidthPathWait: TimeInterval = 1.5
    /// Số lượt thử dựng lại transport + nhịp chờ giữa hai lượt (xem `startTransportRetrying`).
    private static let rampTransportRetries = 4
    private static let rampTransportRetryDelay: TimeInterval = 0.3
    /// Nhịp nhường sau `MobileStop()` trước khi THAY cặp fd khi dựng lại transport (xem
    /// `rebuildTransportForLiveness` → `installTunnelFD`).
    ///
    /// Vì sao cần: `Stop()` của Go trả về NGAY ("it does not wait for Serve()/Connect() to
    /// return", `tools/hysteria-android/mobile.go:295`), còn sing-tun đóng fd đã giao khi
    /// `serve()` kết thúc ⇒ thay fd ngay lập tức là đua với lần unwind cũ. 0,3 s là ngắn hơn
    /// nhiều so với ngân sách A5 ≤15 s nên không ảnh hưởng nghiệm thu.
    private static let rebuildSettleDelay: TimeInterval = 0.3
    /// Hàng đợi riêng cho mẫu băng thông: dựng lại transport CHẶN vài trăm ms (WS + QUIC), không
    /// được để việc đó nằm chung nhịp với watchdog "tunnel có mạng không".
    private let bandwidthQueue = DispatchQueue(label: "com.privatevpn.app.bandwidth-sample")
    private let bandwidthLock = NSLock()
    private var bandwidthTimer: DispatchSourceTimer?
    private var bandwidthRampAttempts = 0
    /// Cấu hình transport của phiên — cần giữ lại để dựng lại y nguyên khi chỉ đổi số khai.
    private var currentOptions: HysteriaTransport.Options?

    // MARK: - A7: dải IP Trung Quốc đi thẳng (xem `ChinaRouteBypass`)

    /// Dải IP TQ đã nhớ, đưa thêm vào `excludedRoutes` của utun. Mặc định rỗng: nạp ở nền SAU
    /// khi tunnel lên (`startChinaBypass`) để không nằm trên đường connect.
    private var chinaExcludedRoutes: [NEIPv4Route] = []

    // MARK: - Vòng đời

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        flowLock.lock()
        session += 1
        let currentSession = session
        startCompleted = false
        flowLock.unlock()

        // DẤU BUILD là dòng ĐẦU TIÊN của phiên: mọi kết luận sau này (kể cả "ramp dựng lại
        // transport làm cầu bỏ 100% gói" 24/09/2026) phải truy được về đúng build đã chạy.
        logBuildStamp(session: currentSession)

        setStatus(state: "starting", code: nil, message: nil)
        RelayDiagnostics.shared.log("startTunnel: bắt đầu phiên \(currentSession) (hysteria-only)")
        log.log(level: .default, "startTunnel: begin session \(currentSession)")

        // Khai băng thông động: nạp bộ nhớ theo MẠNG ĐANG DÙNG trước khi chốt số khai (xem
        // `HysteriaBandwidthControl`). Không có bộ nhớ ⇒ số khai đúng như trước (HysteriaDefaults).
        prepareBandwidthSession()

        switch hysteriaOptions() {
        case .success(let tunnelOptions):
            scheduleOverallTimeout(completion: completionHandler)
            queue.async { [weak self] in
                self?.bringUp(options: tunnelOptions, completion: completionHandler)
            }
        case .failure(let failure):
            // Lỗi cấu hình là lỗi của APP (thiếu credential/relay trong
            // providerConfiguration), không phải lỗi mạng tạm thời: báo thẳng, đừng để
            // tunnel "lên" rồi không có mạng.
            failStart(reason: failure.description, code: Self.codeStartFailed, completion: completionHandler)
        }
    }

    /// Ghi dấu BUILD vào `relay.log` ngay đầu mỗi phiên.
    ///
    /// Vì sao: log là bằng chứng duy nhất lấy được từ máy thật (extension không stream được
    /// `os_log`), mà không có dấu build thì không biết dòng log thuộc bản nào — đúng vướng mắc
    /// khi đọc `relay.log` 24/09/2026. Số version/build đọc từ Info.plist của CHÍNH extension
    /// (không hard-code); `git` chỉ ghi khi build nhúng sẵn biến (`GITCommitSHA`), còn không
    /// thì ghi rõ "không nhúng" thay vì bịa số. Thời điểm sửa của file thực thi là mốc dự phòng
    /// phân biệt hai build cùng số version/build.
    private func logBuildStamp(session: Int) {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        let bundleID = Bundle.main.bundleIdentifier ?? "?"
        let git = (info?["GITCommitSHA"] as? String)
            ?? (info?["GitCommitSHA"] as? String)
            ?? (info?["GIT_SHA"] as? String)
            ?? "không nhúng"
        var binary = "?"
        if let url = Bundle.main.executableURL,
           let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
           let modified = attributes[.modificationDate] as? Date {
            binary = Self.buildStampFormatter.string(from: modified)
        }
        RelayDiagnostics.shared.log(
            "build: version=\(version) build=\(build) git=\(git) bundle=\(bundleID) "
                + "binary=\(binary) (giờ máy) phiên \(session)"
        )
    }

    private static let buildStampFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        // ĐỒNG BỘ: dòng này phải tồn tại dù iOS kết thúc tiến trình ngay sau đó.
        RelayDiagnostics.shared.logSync("stopTunnel: reason=\(reason.rawValue)")
        log.log(level: .default, "stopTunnel: reason \(reason.rawValue)")
        // Tắt lưới an toàn TRƯỚC mọi lời gọi lấy khoá: đây là lần dừng HỢP LỆ, không phải đông cứng.
        wedgeSetTunnelActive(false)
        cancelScheduledWork()
        stopDisplayTicker()
        flowLock.lock()
        let current = transport
        transport = nil
        stopCompleted = false
        flowLock.unlock()
        // Transport dừng TRƯỚC, rồi mới gỡ network settings.
        current?.stop()
        stopBridge()
        // Chốt số đo cuối phiên vào bộ nhớ theo mạng TRƯỚC khi dừng đồng hồ lấy mẫu: lần kết
        // nối sau vào cùng mạng sẽ khai luôn ở mức đã đạt.
        stopBandwidthSampling()
        bandwidth?.finish()
        bandwidth = nil
        currentOptions = nil
        setStatus(state: "stopped", code: nil, message: nil)

        // NetworkExtension đợi callback này; gọi hai lần là crash, không gọi là treo tiến
        // trình extension ⇒ có trần 5s phòng khi `setTunnelNetworkSettings(nil)` im lặng.
        queue.asyncAfter(deadline: .now() + 5) { [weak self] in
            self?.completeStop(completionHandler)
        }
        setTunnelNetworkSettings(nil) { [weak self] _ in
            self?.completeStop(completionHandler)
        }
    }

    /// App hỏi trạng thái phiên (macOS dùng để phát hiện "Connected nhưng không có mạng").
    /// JSON khớp khoá với `TunnelStatusReport` bên app.
    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        flowLock.lock()
        let counters = bridge?.snapshot
        var report: [String: Any] = [
            "session": session,
            "state": statusState,
            "rxBytes": counters?.fromGoBytes ?? 0,
            "txBytes": counters?.toGoBytes ?? 0,
            "transport": "ws-relay",
        ]
        if let code = statusCode { report["code"] = code }
        if let message = statusMessage { report["message"] = message }
        flowLock.unlock()
        // A10 §2g — số live của thẻ Diagnostics (nhịp 1s sẵn có). Trường nào `nil` thì KHÔNG
        // gửi, để app hiện `—` thay vì `0` gây hiểu nhầm "mạng chết".
        bandwidthLock.lock()
        let diag = liveDiagSnapshot
        let dispDown = displayDownKbps
        let dispUp = displayUpKbps
        let dispAt = displayRateAt
        bandwidthLock.unlock()
        if let diag {
            report["serving"] = diag.serving
            report["atMax"] = diag.atMax
            if let value = diag.downKbps { report["downKbps"] = value }
            if let value = diag.upKbps { report["upKbps"] = value }
            if let value = diag.observedKbps { report["observedKbps"] = value }
            if let value = diag.declaredDownKbps { report["declaredDownKbps"] = value }
            if let value = diag.declaredUpKbps { report["declaredUpKbps"] = value }
            if let value = diag.targetDownKbps { report["targetDownKbps"] = value }
            if let value = diag.morePercent { report["morePercent"] = value }
            if let value = diag.stableKbps { report["stableKbps"] = value }
        }
        // 25/09/2026: SỐ HIỂN THỊ ưu tiên nhịp riêng 1 giây (cùng nguồn byte với bảng kiểm tra log).
        // Thẻ phải khớp với thực tế qua tunnel, không phụ thuộc vòng lấy mẫu của vòng ramp.
        if Date().timeIntervalSince(dispAt) <= 5 {
            if let v = dispDown { report["downKbps"] = v }
            if let v = dispUp { report["upKbps"] = v }
            report["serving"] = true
        }
        // Danh tính của CHÍNH extension đang chạy — app dùng để phát hiện hệ thống đang dùng lại
        // một appex CŨ (khác bản với app), ca đã gặp thật trên macOS 24/09/2026.
        let extInfo = Bundle.main.infoDictionary
        report["extensionVersion"] = extInfo?["CFBundleShortVersionString"] as? String ?? "?"
        report["extensionBuild"] = extInfo?["CFBundleVersion"] as? String ?? "?"
        report["extensionPath"] = Bundle.main.bundlePath
        if let executable = Bundle.main.executableURL,
           let attributes = try? FileManager.default.attributesOfItem(atPath: executable.path),
           let modified = attributes[.modificationDate] as? Date {
            report["extensionMTime"] = Self.buildStampFormatter.string(from: modified)
        }
        // "Đường đang dùng": node lấy từ chính relay URL đang chạy (`/relay/v2hy` → `v2hy`).
        if let node = Self.nodeLabel(from: currentOptions?.relayURL) { report["node"] = node }
        completionHandler?(try? JSONSerialization.data(withJSONObject: report))
    }

    /// Nhãn node đọc từ relay URL của transport đang chạy (`/relay/vn2hy` → `vn2hy`).
    /// Dùng cho dòng "Đường đang dùng" của Diagnostics A10.
    private static func nodeLabel(from relayURL: URL?) -> String? {
        guard let relayURL else { return nil }
        let last = relayURL.lastPathComponent
        return last.isEmpty ? nil : last
    }

    // MARK: - Dựng tunnel

    private func bringUp(options: HysteriaTransport.Options, completion: @escaping (Error?) -> Void) {
        currentOptions = options
        RelayDiagnostics.shared.log(
            "hysteria: áp network settings (utun \(HysteriaDefaults.tunIPv4Address)/\(HysteriaDefaults.tunIPv4SubnetMask), mtu \(options.mtu), dns \(HysteriaDefaults.dnsServers.joined(separator: ",")))"
        )
        guard applySettings(networkSettings(options: options)) else {
            failStart(
                reason: "không áp được network settings cho tunnel",
                code: Self.codeStartFailed,
                completion: completion
            )
            return
        }

        // fd giao cho Go, kèm bằng chứng kiểm tra (xem `HysteriaTransport.resolveTunnelFD`).
        //
        // CẢ HAI nền tảng đi CÙNG một đường: tự tạo cặp socketpair rồi bắc cầu qua
        // `packetFlow` (`TunnelBridge`) — vì utun của NE không dùng thẳng được ở đâu cả:
        //   * macOS 26.5 (đo 19/09/2026): gói ghi vào utun của NE bị kernel trả lỗi
        //     (ipkts=0/opkts=0/obytes=0, ~23k lỗi/s), KVC `socket` cũng trả nil.
        //   * iOS (đo 19/09/2026 trên iPad, build 1.4.0/16): `packetFlow.value(forKey:
        //     "socket")` trả nil ⇒ nhánh cũ báo `không lấy được fd nào để giao cho Go` và
        //     tunnel chết ngay sau khi áp network settings.
        let resolvedTunnelFD = HysteriaTransport.resolveTunnelFD(from: packetFlow)
        guard let tunnelFD = resolvedTunnelFD else {
            RelayDiagnostics.shared.log("hysteria: không lấy được fd nào để giao cho Go")
            clearSettings()
            failStart(
                reason: "không lấy được fd để chở gói (utun của NetworkExtension lẫn cặp socket tự tạo)",
                code: Self.codeStartFailed,
                completion: completion
            )
            return
        }
        for line in tunnelFD.evidence {
            RelayDiagnostics.shared.log("hysteria: fd — \(line)")
        }
        RelayDiagnostics.shared.log(
            "hysteria: dùng fd=\(tunnelFD.fd) qua \(tunnelFD.source.rawValue)"
                + (tunnelFD.ifname.map { " (utun \($0))" } ?? "")
        )

        installTunnelFD(tunnelFD)

        let hysteria: HysteriaTransport
        do {
            hysteria = try startTransport(options: options)
        } catch {
            RelayDiagnostics.shared.log("hysteria: dựng thất bại: \(error)")
            flowLock.lock()
            transport = nil
            flowLock.unlock()
            // fd tự tạo mà Go chưa kịp nhận thì phải tự đóng, không thì rò fd mỗi lần thử lại.
            if tunnelFD.ownedByExtension { close(tunnelFD.fd) }
            clearSettings()
            failStart(reason: "\(error)", code: Self.codeStartFailed, completion: completion)
            return
        }

        let localPort = hysteria.relayLocalPort
        RelayDiagnostics.shared.log("hysteria: transport đã lên (relay udp 127.0.0.1:\(localPort))")
        log.log(level: .default, "hysteria: transport up, relay udp 127.0.0.1:\(localPort)")
        setStatus(state: "up", code: nil, message: nil)
        activeUpKbps = options.upKbps
        activeDownKbps = options.downKbps
        activeBandwidthReason = bandwidth?.planReason
        completeStart(completion, error: nil, session: currentSession)
        startTrafficSupervisor()
        startBandwidthSampling()
        startDisplayTicker()
        startLivenessWatchdog()
        // Lưới an toàn chống đông cứng: luồng OS riêng, bật ngay khi tunnel đã lên.
        wedgeSetTunnelActive(true)
        startWedgeGuard()
        startResourceTicker()
        startChinaBypass()
    }

    /// A7 — nạp dải IP Trung Quốc ở LUỒNG NỀN rồi áp lại `excludedRoutes`.
    ///
    /// Chỉ chạy SAU khi tunnel đã lên (`bringUp` gọi sau `completeStart`), không bao giờ nằm
    /// trên đường connect: bài học Windows 1.0.4 "connecting mãi" khi thêm 5.494 route đồng bộ
    /// trong lúc kết nối (`.privatevpn/reports/2026-09-18-windows-1.0.5-handoff.md` §1).
    /// Bước 1 dùng bản đã NHỚ (không cần mạng); bước 2 tải bản mới; chỉ áp lại khi số dải đổi.
    private func startChinaBypass() {
        #if os(iOS)
        let session = currentSession
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self else { return }
            let cached = ChinaRouteBypass.excludedRoutes(from: ChinaRouteBypass.cached())
            self.queue.async {
                guard session == self.currentSession else { return }
                self.applyChinaRoutes(cached)
            }
            ChinaRouteBypass.refresh { [weak self] cidrs in
                guard let self else { return }
                let fresh = ChinaRouteBypass.excludedRoutes(from: cidrs)
                self.queue.async {
                    guard session == self.currentSession else { return }
                    self.applyChinaRoutes(fresh)
                }
            }
        }
        #endif
    }

    /// Áp danh sách dải IP TQ (IPv4) vào settings đang chạy (chạy trên `queue`).
    /// Rỗng/không đổi ⇒ thôi.
    private func applyChinaRoutes(_ routes: [NEIPv4Route]) {
        #if os(iOS)
        guard !routes.isEmpty, routes.count != chinaExcludedRoutes.count else { return }
        chinaExcludedRoutes = routes
        guard let options = currentOptions else { return }
        let applied = applySettings(networkSettings(options: options))
        RelayDiagnostics.shared.log(
            "china: A7 nạp \(routes.count) dải IP TQ vào excludedRoutes (áp lại settings=\(applied))"
        )
        #endif
    }

    /// Dựng transport hysteria2 với fd utun ĐANG dùng của NetworkExtension.
    ///
    /// Tách khỏi `bringUp` vì đường ramp băng thông phải dựng lại transport giữa phiên (số
    /// khai chỉ được Go đọc một lần trong `MobileConnect`) mà KHÔNG được đụng network settings
    /// hay tự gỡ tunnel như khi transport chết.
    @discardableResult
    private func startTransport(
        options: HysteriaTransport.Options
    ) throws -> HysteriaTransport {
        flowLock.lock()
        let tunnelFd = tunnelFdForCounters
        flowLock.unlock()
        guard let tunnelFd else {
            throw ConfigFailure("chưa có fd utun để dựng transport")
        }
        let hysteria = HysteriaTransport(log: log)
        // Sự kiện "WS relay MỞ LẠI sau khi đứt" ⇒ đánh giá ĐỔI MẠNG NGAY (xem
        // `noteRelayLinkReopened`). Đặt TRƯỚC `start(...)` vì callback có thể chạy ngay khi WS mở.
        hysteria.onRelayLinkReopened = { [weak self] in
            guard let self else { return }
            // Transport nào KHÔNG còn là transport ĐANG chạy thì sự kiện của nó thuộc đường cũ
            // (ramp đổi mạng hoặc tự phục hồi đã thay nó ra) — bỏ qua, y như nhánh `onDead` dưới.
            guard self.currentTransport() === hysteria else { return }
            self.noteRelayLinkReopened()
        }
        flowLock.lock()
        transport = hysteria
        flowLock.unlock()
        do {
            try hysteria.start(options: options, tunnelFd: tunnelFd) { [weak self] reason in
                guard let self else { return }
                // Transport nào KHÔNG còn là transport ĐANG chạy thì cái chết của nó là theo
                // thiết kế (ramp băng thông hoặc tự phục hồi đã thay nó ra) — KHÔNG được hạ tunnel.
                // So identity là đủ và không phụ thuộc thứ tự gán `transport`.
                guard self.currentTransport() === hysteria else {
                    RelayDiagnostics.shared.log(
                        "hysteria: transport cũ đã dừng (\(reason)) — tunnel giữ nguyên"
                    )
                    return
                }
                // Transport ĐANG chạy chết giữa phiên: thử TỰ DỰNG LẠI (3 lần, 2/5/10s) trước khi
                // gỡ tunnel. Để nguyên chính là ca "Connected mà không có mạng" (parity Windows 1.4.1).
                self.handleTransportDeath(reason: reason)
            }
        } catch {
            // Dọn cầu (nếu có, chế độ bridge của macOS) trước khi ném lên: để nguyên là rò fd.
            stopBridge()
            throw error
        }
        return hysteria
    }

    // MARK: - Khai băng thông động

    /// Bắt đầu lấy mẫu byte mỗi 1s + ghi telemetry `bw:`. Gọi ngay sau khi transport lên.
    /// Nhịp HIỂN THỊ 1 giây — nguồn số cho thẻ Diagnostics (xem khối `display*` đầu class).
    private func startDisplayTicker() {
        let timer = DispatchSource.makeTimerSource(queue: diagQueue)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            // Nhịp "còn sống" cho lưới an toàn — đặt TRƯỚC mọi `guard` đọc byte (đúng lý do đã
            // tách bộ dò đổi mạng lên đây: `bandwidthBytes == nil` không được làm nhịp câm).
            self.wedgeBeat()
            // 25/09/2026 — DÒ ĐỔI MẠNG đặt Ở ĐÂY, trên nhịp RIÊNG và TRƯỚC mọi `guard` đọc byte.
            //
            // Vì sao: nhịp lấy mẫu (`bandwidthStep`) trả về sớm khi `bandwidthBytes == nil`, và
            // sự cố thật 02:21 iPhone 1.4.5/34 cho thấy hậu quả — 2 mẫu `bw: sample` rồi im suốt
            // 3 phút, WiFi→5G→WiFi mà KHÔNG có dòng `bw: net đổi giữa phiên` nào ⇒ không dựng lại
            // transport ⇒ tốc độ qua tunnel còn 0–550 kbps. Nhịp hiển thị thì luôn chạy (chỉ bị
            // huỷ khi hết phiên), nên nó là chỗ đáng tin để treo việc dò.
            self.requestNetworkChangeCheck()
            self.refreshDisplayRates()
        }
        bandwidthLock.lock()
        diagTimer?.cancel()
        diagTimer = timer
        displayPrevBytes = nil
        bandwidthLock.unlock()
        timer.resume()
    }

    private func stopDisplayTicker() {
        bandwidthLock.lock()
        let timer = diagTimer
        diagTimer = nil
        bandwidthLock.unlock()
        timer?.cancel()
    }

    /// Một nhịp: đọc bộ đếm byte của cầu, tính kbps 2 chiều, lấy trung bình 3 mẫu cho HIỂN THỊ.
    private func refreshDisplayRates() {
        guard let bytes = bandwidthBytes else {
            // NHỊP MÙ: `bandwidthBytes == nil` làm CẢ nhịp lấy mẫu (`bandwidthStep`) lẫn nhịp hiển
            // thị này trả về sớm ở mỗi giây. Trước 25/09/2026 ca này IM LẶNG tuyệt đối — log thật
            // 02:21 iPhone 1.4.5/34 có 3 phút không một dòng `bw: sample` mà không ai biết vì sao.
            // Ghi THƯA (60 s/lần) để còn bằng chứng; KHÔNG chặn gì (chỉ đọc vài biến).
            let now = Date()
            if now.timeIntervalSince(displayBlindLogAt) >= 60 {
                displayBlindLogAt = now
                flowLock.lock()
                let hasBridge = bridge != nil
                let fd = tunnelFdForCounters
                flowLock.unlock()
                RelayDiagnostics.shared.log(
                    "bw: KHÔNG đọc được byte của cầu (bandwidthBytes=nil; bridge="
                        + (hasBridge ? "có" : "KHÔNG") + ", fd=" + (fd.map(String.init) ?? "-")
                        + ") — nhịp lấy mẫu + nhịp hiển thị đang MÙ; dò đổi mạng vẫn chạy "
                        + "(nhịp riêng + sự kiện WS relay mở lại)"
                )
            }
            return
        }
        let now = Date()
        bandwidthLock.lock()
        let prev = displayPrevBytes
        displayPrevBytes = (bytes.inbound, bytes.outbound, now)
        bandwidthLock.unlock()
        guard let prev else { return }
        let dt = now.timeIntervalSince(prev.at)
        guard dt >= 0.5, dt <= 5 else { return }
        let dIn = bytes.inbound - prev.inBytes
        let dOut = bytes.outbound - prev.outBytes
        guard dIn >= 0, dOut >= 0 else { return }
        let down = Int(Double(dIn) * 8 / 1_000 / dt)
        let up = Int(Double(dOut) * 8 / 1_000 / dt)
        bandwidthLock.lock()
        displayDownWindow.append(down)
        displayUpWindow.append(up)
        if displayDownWindow.count > 3 { displayDownWindow.removeFirst() }
        if displayUpWindow.count > 3 { displayUpWindow.removeFirst() }
        displayDownKbps = displayDownWindow.reduce(0, +) / displayDownWindow.count
        displayUpKbps = displayUpWindow.reduce(0, +) / displayUpWindow.count
        displayRateAt = now
        if bytes.inbound + bytes.outbound > 0 { hasServedThisSession = true }
        bandwidthLock.unlock()
    }

    private func startBandwidthSampling() {
        guard let bandwidth else { return }
        let timer = DispatchSource.makeTimerSource(queue: bandwidthQueue)
        timer.schedule(
            deadline: .now() + Self.bandwidthSampleInterval,
            repeating: Self.bandwidthSampleInterval
        )
        timer.setEventHandler { [weak self] in self?.bandwidthStep() }
        bandwidthLock.lock()
        bandwidthTimer?.cancel()
        bandwidthTimer = timer
        bandwidthLock.unlock()
        timer.resume()
        let plan = bandwidth.plan
        RelayDiagnostics.shared.log(
            "bw: net=\(bandwidth.key) measured=0 declared up=\(plan.upKbps) down=\(plan.downKbps) "
                + "reason=\(plan.reason.rawValue) — bắt đầu đo (mẫu mỗi "
                + "\(Int(Self.bandwidthSampleInterval))s, đỉnh trượt "
                + "\(Int(BandwidthControl.peakWindow))s)"
        )
    }

    /// Nạp bộ nhớ theo mạng + bật theo dõi mạng. Gọi ở đầu mỗi phiên `startTunnel`.
    private func prepareBandwidthSession() {
        bandwidthRampPending = false
        bandwidthRampAttempts = 0
        measuredPeakDownKbps = 0
        activeBandwidthReason = nil
        liveSampleBaseline = nil
        liveSampleAt = .distantPast
        liveDownKbps = 0
        liveUpKbps = 0
        liveDownWindow.removeAll()
        liveUpWindow.removeAll()
        hasServedThisSession = false
        lastDiagLogAt = .distantPast
        // Tự-áp trong phiên: mọi bộ đếm/mốc phải bắt đầu lại từ đầu cho phiên mới (trần
        // 3 lần/10 phút, cooldown 90 s, cờ tắt tự-áp, số lần rollback).
        supervisorPhysicalBytes = nil
        supervisorIdleProbeFailures = 0
        supervisorIdleWindowStart = Date()
        supervisorIdleLogAt = .distantPast
        supervisorIdleProbeInFlight = false
        bandwidthApplyTimes = []
        lastBandwidthApplyAt = nil
        bandwidthAutoApplyDisabled = false
        bandwidthDisabledLogged = false
        bandwidthRollbackCount = 0
        bandwidthRetargetCount = 0
        lastBandwidthRetargetAt = nil
        lastRawLineProbeAt = .distantPast
        rawLineProbeInFlight = false
        bwPrevOfferedPackets = 0
        bwPrevFromGoPackets = 0
        // Đổi mạng: mốc/đếm của phiên TRƯỚC không còn nghĩa gì (mỗi lần vào phiên phải bắt đầu
        // lại — cùng lý do với các bộ đếm tự-áp phía trên).
        lastBandwidthNetworkKey = nil
        pendingNetworkChangeFrom = nil
        pendingNetworkChangeTo = nil
        lastNetworkChangeRebuildAt = nil
        networkChangeRebuildCount = 0
        bandwidthLock.lock()
        liveDiagSnapshot = nil
        bandwidthLock.unlock()
        let monitor = NWPathMonitor()
        // PHẢI `start` rồi CHỜ bản cập nhật ĐẦU TIÊN rồi mới đọc `currentPath`.
        //
        // Vì sao: `currentPath` trước `start(queue:)` là path RỖNG (không interface) ⇒
        // `currentNetworkIdentity` trả `other|if:unknown`, khoá này KHÔNG khớp bộ nhớ đã ghi
        // (`wifi|if:en0`) nên số đã học bị bỏ qua và MỌI lần kết nối lại khai nấc tĩnh. Đo
        // thật 19/09/2026 (đúng ca "Connect thứ hai"): bộ nhớ đã có `peakDownKbps=23377`,
        // `lastDownKbps=7814` mà log vẫn
        //   `bw: chuẩn bị phiên — net=other|if:unknown … declared up=30000 down=100000 reason=profile`
        // rồi 3 giây sau mới `net đổi giữa phiên other|if:unknown -> wifi|if:en0`.
        let firstPath = BandwidthPathBox()
        let ready = DispatchSemaphore(value: 0)
        monitor.pathUpdateHandler = { path in
            // Bản cập nhật đầu tiên đôi khi vẫn chưa có interface: chỉ nhận path ĐÃ có
            // interface (vẫn có trần `bandwidthPathWait` phòng khi máy không có mạng nào).
            guard !path.availableInterfaces.isEmpty else { return }
            if firstPath.store(path) { ready.signal() }
        }
        monitor.start(queue: bandwidthQueue)
        if ready.wait(timeout: .now() + Self.bandwidthPathWait) == .timedOut {
            RelayDiagnostics.shared.log(
                "bw: chưa có bản cập nhật mạng có interface sau \(Self.bandwidthPathWait)s — "
                    + "dùng danh tính mạng hiện có (khả năng cao là chưa có mạng nào)"
            )
        }
        // Giữ handler rỗng: `currentPath` phải tiếp tục được cập nhật suốt phiên
        // (`bandwidthPath` đọc nó để phát hiện ĐỔI MẠNG giữa phiên).
        monitor.pathUpdateHandler = { _ in }
        let identity = BandwidthControl.currentNetworkIdentity(
            path: firstPath.path ?? monitor.currentPath
        )
        // A8 (§2e) — ĐO MẠNG THỰC TẾ **TRƯỚC** RỒI MỚI KHAI.
        //
        // Chạy Ở ĐÂY (trước `hysteriaOptions()` ⇒ trước khi client Go được mở) vì tunnel CHƯA
        // được áp network settings nên socket của extension đi thẳng ra mạng nền — đúng yêu cầu
        // §2e ("trước khi mở client") và đúng thực tế iOS (xem `BandwidthControl.preMeasure`).
        // Ngân sách tối đa 2,5 s + 2 s bắt tay; đo hỏng ⇒ 0 và lùi về bộ nhớ/nấc tĩnh, KHÔNG
        // bao giờ chặn kết nối (`startTimeout` của cả phiên là 20 s và đếm SAU bước này).
        let preMeasured = BandwidthControl.preMeasure(netKey: identity.preferredKey) { line in
            RelayDiagnostics.shared.log(line)
        }
        bandwidthLock.lock()
        bandwidthPathMonitor?.cancel()
        bandwidthPathMonitor = monitor
        bandwidthLock.unlock()
        let state = BandwidthControl.SessionState(identity: identity, preMeasuredKbps: preMeasured)
        if preMeasured > 0 {
            // Nhớ số đo TƯƠI + số khai vừa chốt theo mạng (Android `BandwidthMemory.remember`):
            // phiên sau khỏi đo lại, và `decide` có đủ cặp (đo, khai) để biết số cũ có phải nút
            // cổ chai không.
            state.recordPreMeasurement(measuredKbps: preMeasured)
        }
        bandwidth = state
        // Mốc "khoá mạng đã xử lý" của đường ĐỔI MẠNG (xem `networkChangeStep`).
        lastBandwidthNetworkKey = state.key
        let plan = state.plan
        RelayDiagnostics.shared.log(
            "bw: chuẩn bị phiên — net=\(identity.logLabel) "
                + "(ssid=\(identity.ssid ?? "không có quyền vị trí/entitlement"), "
                + "router=\(identity.routerMAC ?? "-"), if=\(identity.interfaceName)) "
                + "preMeasure=\(preMeasured)kbps declared up=\(plan.upKbps) down=\(plan.downKbps) "
                + "reason=\(plan.reason.rawValue) apply=\(RampStatus.BandwidthPolicy.applyDeferred)"
        )
    }

    private func stopBandwidthSampling() {
        bandwidthLock.lock()
        let timer = bandwidthTimer
        bandwidthTimer = nil
        let monitor = bandwidthPathMonitor
        bandwidthPathMonitor = nil
        bandwidthLock.unlock()
        timer?.cancel()
        monitor?.cancel()
    }

    /// Một nhịp (1s): đọc byte hai chiều của tunnel → cho `BandwidthControl` quyết định.
    private func bandwidthStep() {
        guard let bandwidth else { return }
        guard let bytes = bandwidthBytes else { return }
        let counters = trafficCounters
        let now = Date()
        // A10 §2g — tốc độ ↓/↑ LIVE: delta byte RX/TX của lần lấy mẫu trước, đúng nhịp 1s sẵn
        // có (KHÔNG thêm phép đo, không thêm pin). Bộ đếm tụt (dựng lại transport/interface)
        // ⇒ bỏ mẫu này thay vì in số âm.
        let liveDt = now.timeIntervalSince(liveSampleAt)
        if let previous = liveSampleBaseline, liveDt >= 0.5, liveDt <= 5 {
            let deltaIn = bytes.inbound - previous.inbound
            let deltaOut = bytes.outbound - previous.outbound
            if deltaIn >= 0, deltaOut >= 0 {
                liveDownKbps = Int(Double(deltaIn) * 8 / 1_000 / liveDt)
                liveUpKbps = Int(Double(deltaOut) * 8 / 1_000 / liveDt)
                // Giữ cửa sổ 3 mẫu cho SỐ HIỂN THỊ (log vẫn in số 1 s thô để giữ nguyên định dạng
                // đối chiếu với Android: `bw: sample … liveDown=… liveUp=…`).
                liveDownWindow.append(liveDownKbps)
                liveUpWindow.append(liveUpKbps)
                if liveDownWindow.count > 3 { liveDownWindow.removeFirst() }
                if liveUpWindow.count > 3 { liveUpWindow.removeFirst() }
            }
        }
        if bytes.inbound + bytes.outbound > 0 { hasServedThisSession = true }
        liveSampleBaseline = bytes
        liveSampleAt = now
        // Bằng chứng NGHẼN: gói bị cầu bỏ vì hàng đợi (`toGoDropped`) so với gói đưa vào.
        // (i) BẤT ĐỐI XỨNG THẬT (không dùng toGoDropped — khách tự giới hạn làm tín hiệu GIẢ).
        if let counters {
            let deltaOffered = counters.toGoOffered - bwPrevOfferedPackets
            let deltaFromGo = counters.fromGo - bwPrevFromGoPackets
            bandwidth.noteCongestion(
                RawLinePolicy.asymmetryEvidence(deltaOffered: deltaOffered, deltaFromGo: deltaFromGo)
            )
            bwPrevOfferedPackets = counters.toGoOffered
            bwPrevFromGoPackets = counters.fromGo
        }
        let decision = bandwidth.sample(
            bytes: bytes,
            packetsIn: counters?.fromGo ?? 0,
            packetsOut: counters?.toGo ?? 0,
            at: now,
            path: bandwidthPath
        )
        // ĐỔI MẠNG GIỮA PHIÊN ⇒ dựng lại transport NGAY trên mạng mới (parity Android
        // `rebuildRequested`). Đặt TRƯỚC các bước khác vì đường cũ đã chết — mọi thứ phía sau
        // (đo lại đường thật, log) chỉ có nghĩa khi cầu đang nằm trên mạng mới.
        networkChangeStep(now: now)
        // (1) Đo lại ĐƯỜNG THẬT theo chu kỳ (60 s khi sát trần, 120 s khi rảnh) — dùng ĐÚNG
        // `preMeasure` sẵn có (1,5 MB / 2,5 s / 200 KB), KHÔNG thêm phép đo mới. Đây là lối thoát
        // cho vòng kẹt "goodput ≤ số khai ⇒ không bao giờ ramp lên được".
        maybeProbeRawLine(now: now)
        let averageDown = bandwidth.lastAverageDownKbps
        if averageDown >= Self.bandwidthLogMinKbps, averageDown != measuredPeakDownKbps {
            measuredPeakDownKbps = averageDown
            logDeclaration(key: bandwidth.key, event: "bw: measured")
        }
        if let decision {
            logRampDecision(decision, key: bandwidth.key)
        }
        // Thay đổi số khai nay KHÔNG mở đường dựng lại transport giữa phiên: mọi quyết định đã
        // được chốt + ghi bộ nhớ theo mạng ngay trong `BandwidthControl.sample` và chỉ áp ở LẦN
        // KẾT NỐI SAU (`apply=deferred-next-connect`). Vì vậy `pendingChange` không bao giờ bật
        // nữa; giữ nhánh dưới chỉ để không đổi cấu trúc file (nó tự thoát ngay ở
        // `BandwidthControl.allowsTransportRebuild`).
        if bandwidth.pendingChange {
            bandwidthLock.lock()
            bandwidthRampPending = true
            bandwidthLock.unlock()
            applyBandwidthRampIfIdle(
                reason: bandwidth.pendingReason?.label ?? BandwidthControl.Reason.probe.label
            )
        }
        // A10 §2g — chốt ảnh chụp số hiển thị Diagnostics cho `handleAppMessage` đọc.
        // `serving == false` (phiên CHƯA từng chở byte nào) ⇒ mọi số là `—`, không hiện `0`.
        var display = bandwidth.diagnostics(
            liveDownKbps: liveDownWindow.isEmpty
                ? liveDownKbps : liveDownWindow.reduce(0, +) / liveDownWindow.count,
            liveUpKbps: liveUpWindow.isEmpty
                ? liveUpKbps : liveUpWindow.reduce(0, +) / liveUpWindow.count,
            serving: hasServedThisSession,
            probeNoGain: false
        )
        // "Khai báo hiện tại" phải là số ĐANG NẰM TRONG TRANSPORT, không phải số kế hoạch của
        // `BandwidthControl`. Đo thật 23/09/2026, hai số lệch nhau và thẻ hiện số kế hoạch:
        //   `bw: net=… declared up=1431 down=4773 … plan=up1002/down3341 apply=pending`
        // ⇒ khách thấy "thông số Diagnostics không đúng". `activeUp/DownKbps` là số Go đang dùng.
        if activeDownKbps > 0 { display.declaredDownKbps = activeDownKbps }
        if activeUpKbps > 0 { display.declaredUpKbps = activeUpKbps }
        bandwidthLock.lock()
        liveDiagSnapshot = display
        bandwidthLock.unlock()
        // A10 §2g + §3b — log đối chiếu theo CÙNG format Android (`bw: sample net=… observed=…
        // declared=… rtt=…ms loss=…% ceil=… src=… raw=…`) để grep hai nền tảng bằng một biểu thức.
        //
        // `rtt=-` và `loss=-` là DỮ LIỆU THIẾU, không phải số bịa: framework hysteria trên iOS
        // không mở API thống kê loss/RTT của QUIC, và socket của extension không đi qua tunnel
        // nên không có đường đo tương đương Android (xem
        // `BandwidthPolicy.hasTransportLossSignal`). `lossProxy=` là thứ iOS THẬT SỰ có: tỉ lệ
        // mẫu bất đối xứng gói của utun (`gói ra nhiều, gói về rất ít`) — chỉ dùng làm proxy.
        if display.serving, now.timeIntervalSince(lastDiagLogAt) >= 10 {
            lastDiagLogAt = now
            RelayDiagnostics.shared.log(
                "bw: sample net=\(bandwidth.key) observed=\(bandwidth.lastAverageDownKbps) "
                    + "declared=\(bandwidth.downKbps) up=\(bandwidth.upKbps) rtt=-ms loss=-% "
                    + "lossProxy=\(bandwidth.lastLossProxyPct)% "
                    + "realLoad=\(bandwidth.lastRealLoad ? 1 : 0) idleRun=\(bandwidth.idleRun) "
                    + "liveDown=\(liveDownKbps) liveUp=\(liveUpKbps) "
                    + "rawWindowBytes=\(bandwidth.lastWindowBytes) ceil=\(bandwidth.ceilingDownKbps) "
                    + "src=utun atMax=\(display.atMax)"
            )
        }
    }

    /// Dòng telemetry `bw: …` của SỐ KHAI ĐANG CHẠY.
    ///
    /// `declared` ở đây là số nằm THẬT trong transport (Brutal CC pace theo đúng nó), không
    /// phải số đã quyết định — chỉ số này mới là bằng chứng nghiệm thu "khai bám số đo"
    /// (`declared ≈ best × 85%`). Khi quyết định mới CHƯA áp được (chờ tunnel rảnh / chờ hạn
    /// buộc áp) thì in thêm `plan=…` để nhìn log biết ngay vì sao số đang chạy khác số đã chốt.
    private func logDeclaration(key: String, event: String? = nil) {
        guard let bandwidth else { return }
        let plan = bandwidth.plan
        var line = "bw: net=\(key) measured=\(bandwidth.lastAverageDownKbps) "
            + "declared up=\(activeUpKbps) down=\(activeDownKbps) "
            + "reason=\(activeBandwidthReason?.label ?? BandwidthControl.Reason.probe.label) "
            + "ctx=\(bandwidth.planReason.label) ceil=\(bandwidth.ceilingDownKbps) "
            + "best=\(bandwidth.peakDownKbps)"
        if plan.upKbps != activeUpKbps || plan.downKbps != activeDownKbps {
            line += " plan=up\(plan.upKbps)/down\(plan.downKbps) reason-plan=\(plan.reason.label)"
            // Số mới đã chốt nhưng CHƯA nằm trong transport: đang chờ provider áp trong phiên
            // (`apply=pending`; xem `RampStatus.ApplyGate`) — KHÔNG còn kiểu hoãn sang lần connect sau.
            line += " apply=pending"
            if bandwidth.pendingChange, let since = bandwidth.pendingSince {
                line += " pending=\(Int(Date().timeIntervalSince(since)))s"
            }
        }
        if let event { line += " (\(event))" }
        RelayDiagnostics.shared.log(line)
        if event != nil { log.log(level: .default, "\(line, privacy: .public)") }
    }

    /// Dòng telemetry khi CHỐT số khai mới — format khớp Android
    /// (`HysteriaVpnService.applyRampDecision`): `bw: ramp net=… observed=… old=…/… new=…/…
    /// reason=… plan=… apply=… loss=… rtt=…`.
    ///
    /// `apply=pending`: số đã chốt vào plan và đang chờ provider ÁP NGAY trong phiên — dòng
    /// `bw: ramp-apply …` (do `applyBandwidthRampIfIdle` ghi) mới là dòng nói **đã áp thật hay
    /// chưa** (`apply=idle-now|forced-after-wait N|disabled-for-session|rollback`) kèm `stallMs=`.
    /// `loss=`/`rtt=` in `-` vì iOS KHÔNG có API loss/RTT của QUIC — dữ liệu THIẾU, không bịa.
    private func logRampDecision(_ decision: BandwidthControl.RampDecision, key: String) {
        let line = "bw: ramp net=\(key) observed=\(decision.observedKbps) old=\(decision.oldUpKbps)/"
            + "\(decision.oldDownKbps) new=\(decision.newUpKbps)/\(decision.newDownKbps) "
            + "reason=\(decision.logReason) plan=\(decision.newDownKbps) apply=pending "
            + "loss=-% rtt=-ms"
        RelayDiagnostics.shared.log(line)
        log.log(level: .default, "\(line, privacy: .public)")
    }

    /// Byte hai chiều đã đi qua tunnel. Nguồn: cầu `packetFlow↔fd` (macOS) hoặc bộ đếm
    /// interface utun (iOS) — CÙNG nguồn với watchdog, xem `trafficCounters`.
    private var bandwidthBytes: BandwidthControl.ByteSample? {
        if let counters = bridgeCounters {
            return BandwidthControl.ByteSample(
                inbound: counters.fromGoBytes,
                outbound: counters.toGoBytes
            )
        }
        #if os(iOS)
        flowLock.lock()
        let fd = tunnelFdForCounters
        flowLock.unlock()
        guard let fd, let counters = HysteriaTransport.utunPacketCounters(fd: fd) else { return nil }
        return BandwidthControl.ByteSample(
            inbound: counters.fromGoBytes,
            outbound: counters.toGoBytes
        )
        #else
        return nil
        #endif
    }

    /// Cờ "có thay đổi đang chờ áp" — đọc/ghi từ hai hàng đợi nên luôn đi qua `bandwidthLock`.
    private var isBandwidthRampPending: Bool {
        bandwidthLock.lock(); defer { bandwidthLock.unlock() }
        return bandwidthRampPending
    }

    /// Đang dựng lại transport để ramp băng thông — watchdog sống-còn phải nhường.
    private var isBandwidthRebuildInFlight: Bool {
        rebuildLock.lock(); defer { rebuildLock.unlock() }
        return transportRebuildOwner == "bandwidth"
    }

    /// Đang trong chuỗi tự phục hồi sống-còn — đường ramp phải nhường.
    private var isLivenessRecovering: Bool {
        flowLock.lock(); defer { flowLock.unlock() }
        return livenessRecovering
    }

    /// Đang ở pha HOLD (giữ đường đã chọn, chờ mạng về) — cấm mọi lần dựng lại vì lý do tốc độ
    /// và cấm teardown (chốt 22/09/2026).
    private var isLivenessHolding: Bool {
        flowLock.lock(); defer { flowLock.unlock() }
        return livenessHold
    }

    /// Giành quyền dựng lại transport (chỉ một đường giữ tại một thời điểm). Trả `false` nếu
    /// đường khác đang giữ.
    private func acquireTransportRebuild(owner: String) -> Bool {
        rebuildLock.lock(); defer { rebuildLock.unlock() }
        guard transportRebuildOwner == nil else { return false }
        transportRebuildOwner = owner
        return true
    }

    /// Nhả quyền — chỉ nhả nếu đúng là chủ sở hữu hiện tại (tránh nhả hộ đường khác).
    private func releaseTransportRebuild(owner: String) {
        rebuildLock.lock()
        if transportRebuildOwner == owner { transportRebuildOwner = nil }
        rebuildLock.unlock()
    }

    private func markBandwidthRampNotPending() {
        bandwidthLock.lock()
        bandwidthRampPending = false
        bandwidthLock.unlock()
    }

    /// `NWPath` hiện tại (mạng nằm dưới tunnel) nếu monitor đang chạy.
    private var bandwidthPath: NWPath? {
        bandwidthLock.lock(); defer { bandwidthLock.unlock() }
        return bandwidthPathMonitor?.currentPath
    }

    /// Tunnel đã rảnh (không chở gói nào) đủ lâu để dựng lại transport chưa.
    private func isBandwidthIdle() -> Bool {
        guard let bandwidth else { return false }
        return Date().timeIntervalSince(bandwidth.lastActivityAt) >= BandwidthControl.idleBeforeChange
    }

    /// Áp số khai mới vào transport ĐANG CHẠY (tự ramp trong phiên). Trả `true` khi đã áp.
    ///
    /// Quyết định "có áp lúc này không" nằm ở `RampStatus.ApplyGate` (hàm THUẦN, có test):
    /// ưu tiên lúc RẢNH (`apply=idle-now`); đang bận thì chờ tối đa 20 s tìm khe rảnh rồi
    /// **áp luôn** (`apply=forced-after-wait`); cooldown ≥90 s; tối đa 3 lần/10 phút
    /// (`apply=disabled-for-session`); cầu không chở lại gói sau khi dựng lại ⇒
    /// `apply=rollback` + tắt tự-áp cho hết phiên.
    ///
    /// Vì sao phải dựng lại cả relay + QUIC: số khai được Go đọc MỘT LẦN trong `MobileConnect`
    /// (`MaxTx/MaxRx` của Brutal CC, xem `tools/hysteria-android/mobile.go`) — không có API đổi
    /// tại chỗ. Mọi lần dựng lại đi qua `performBandwidthRebuild` (cặp fd MỚI + cầu mới);
    /// watchdog H2 vẫn là lưới an toàn cuối khi tunnel hỏng thật.
    @discardableResult
    private func applyBandwidthRampIfIdle(reason: String) -> Bool {
        // 24/09/2026 — TỰ RAMP TRONG PHIÊN (chủ dự án: *"nó phải tự ramp mà không cần người dùng
        // connect lại"*): số khai mới được ÁP NGAY, KHÔNG hoãn sang lần kết nối sau.
        //
        // Rào an toàn nằm ở `RampStatus.ApplyGate` (hàm THUẦN, có test): chỉ áp khi lệch
        // ≥115%/≤85%; cooldown ≥90 s; tối đa 3 lần/10 phút (quá ⇒ `apply=disabled-for-session`);
        // đang bận thì chờ tối đa 20 s rồi VẪN áp (`apply=forced-after-wait`).
        //
        // Mọi lần dựng lại dùng `performBandwidthRebuild` → `installTunnelFD` (cặp socketpair MỚI
        // + cầu mới): tái dùng fd cũ — thứ Go đã đóng khi `serve()` kết thúc — chính là lỗi làm
        // cầu bỏ 100% gói ("vài phút lại mất mạng").
        guard BandwidthControl.allowsTransportRebuild else {
            deferBandwidthRampForNextConnect()
            return false
        }
        guard let bandwidth, bandwidth.pendingChange else { return false }
        guard isBandwidthRampPending else { return false }
        // Đang HOLD (hết đường) hoặc đang tự phục hồi: không tranh fd (chốt 22/09/2026).
        guard !isLivenessHolding, !isLivenessRecovering else { return false }

        let now = Date()
        let plan = bandwidth.plan
        let action = RampStatus.ApplyGate.decide(
            planKbps: plan.downKbps,
            activeKbps: activeDownKbps,
            idle: isBandwidthIdle(),
            pendingFor: bandwidth.pendingSince.map { now.timeIntervalSince($0) } ?? 0,
            sinceLastApply: lastBandwidthApplyAt.map { now.timeIntervalSince($0) },
            appliesInWindow: bandwidthAppliesInWindow(now: now),
            disabled: bandwidthAutoApplyDisabled
        )
        switch action {
        case .skipInsignificant:
            // Lệch nhỏ: bỏ, KHÔNG dựng lại. Trả plan về số đang chạy để log không nói dối.
            bandwidth.discardPendingPlan(activeUp: activeUpKbps, activeDown: activeDownKbps)
            markBandwidthRampNotPending()
            return false
        case .waitIdle, .waitCooldown:
            // Chưa tới lượt: giữ nguyên pending, nhịp 1 s sau thử lại.
            return false
        case .disabledForSession:
            if !bandwidthDisabledLogged {
                bandwidthDisabledLogged = true
                bandwidthAutoApplyDisabled = true
                RelayDiagnostics.shared.log(
                    "bw: ramp net=\(bandwidth.key) apply=disabled-for-session "
                        + "(đã áp \(bandwidthApplyTimes.count) lần/\(Int(RampStatus.ApplyGate.windowS))s "
                        + "hoặc vừa rollback) — giữ nguyên up=\(activeUpKbps) down=\(activeDownKbps) "
                        + "tới hết phiên"
                )
            }
            bandwidth.discardPendingPlan(activeUp: activeUpKbps, activeDown: activeDownKbps)
            markBandwidthRampNotPending()
            return false
        case .applyIdleNow, .applyForcedAfterWait:
            break
        }

        guard plan.upKbps != activeUpKbps || plan.downKbps != activeDownKbps else {
            // Số không đổi (ví dụ chỉ đổi mạng): không cần dựng lại, chỉ chốt lại.
            bandwidth.applied(
                BandwidthControl.RampDecision(
                    multiplierUp: nil,
                    multiplierDown: nil,
                    reason: bandwidth.pendingReason ?? plan.reason,
                    observedKbps: bandwidth.peakDownKbps,
                    oldUpKbps: activeUpKbps,
                    oldDownKbps: activeDownKbps,
                    newUpKbps: activeUpKbps,
                    newDownKbps: activeDownKbps
                ),
                ceiling: nil
            )
            markBandwidthRampNotPending()
            return true
        }

        // Nhịp watchdog (15 s) và nhịp lấy mẫu (1 s) có thể cùng gọi hàm này ở hai hàng đợi khác
        // nhau ⇒ độc quyền theo chủ sở hữu (xem `acquireTransportRebuild`).
        guard acquireTransportRebuild(owner: "bandwidth") else { return false }
        defer { releaseTransportRebuild(owner: "bandwidth") }

        let applyLabel: String
        switch action {
        case .applyForcedAfterWait(let seconds): applyLabel = "forced-after-wait \(seconds)"
        default: applyLabel = "idle-now"
        }
        let oldUp = activeUpKbps
        let oldDown = activeDownKbps
        let previousOptions = currentOptions
        guard var next = previousOptions else { return false }
        next.upKbps = plan.upKbps
        next.downKbps = plan.downKbps
        // Có TRAFFIC THẬT ngay trước khi dựng lại không ⇒ quyết định cách KIỂM sau đó: đang chở gói
        // thì bắt buộc thấy cầu chở lại; đang RẢNH thì không có gói nào để chứng minh (bỏ qua kiểm).
        let wasBusy = !isBandwidthIdle()

        let before = bridgeCounters
        let rebuilt = performBandwidthRebuild(options: next)
        guard rebuilt.ok else {
            // Dựng lại hỏng: đưa đường CŨ trở lại để không mất mạng, rồi để nhịp sau thử lại.
            if let previousOptions {
                _ = performBandwidthRebuild(options: previousOptions)
                activeUpKbps = previousOptions.upKbps
                activeDownKbps = previousOptions.downKbps
            }
            RelayDiagnostics.shared.log(
                "bw: ramp net=\(bandwidth.key) apply=\(applyLabel) THẤT BẠI — đã quay về "
                    + "up=\(oldUp)/\(oldDown) (stallMs=\(rebuilt.stallMs))"
            )
            return false
        }
        restartLivenessAfterTransportSwap(reason: "ramp băng thông")

        // (2) CHỨNG MINH ĐƯỜNG DỮ LIỆU CÒN SỐNG ≤3 s sau retarget: phải có ÍT NHẤT 1 gói đi vào
        // cầu mới (`packetFlow→Go` delta > 0). KHÔNG dùng "wasBusy" làm cớ bỏ qua kiểm nữa —
        // đúng lỗi 24/09/2026: `verify=idle-skip` rồi cầu mới 0 gói suốt 6 phút, máy mất Internet.
        let progressed = waitForInboundProgress(from: before, within: 3)
        if RampStatus.ApplyGate.shouldRollback(progressed: progressed) {
            // Cầu KHÔNG chở lại gói ⇒ ROLLBACK về số cũ + TẮT tự-áp cho hết phiên: thà chậm một
            // chút còn hơn để khách mất mạng vì một lần "tối ưu".
            bandwidthRollbackCount += 1
            bandwidthAutoApplyDisabled = true
            bandwidthDisabledLogged = true
            var rollback = previousOptions ?? next
            rollback.upKbps = oldUp
            rollback.downKbps = oldDown
            let rolled = performBandwidthRebuild(options: rollback)
            activeUpKbps = oldUp
            activeDownKbps = oldDown
            activeBandwidthReason = bandwidth.planReason
            bandwidth.discardPendingPlan(activeUp: oldUp, activeDown: oldDown)
            markBandwidthRampNotPending()
            RelayDiagnostics.shared.log(
                "bw: ramp-apply net=\(bandwidth.key) apply=rollback prev=\(oldUp)/\(oldDown) "
                    + "stallMs=\(rebuilt.stallMs) verify=\(Int(RampStatus.ApplyGate.verifyS))s "
                    + "(cầu không chở lại gói; rollback ok=\(rolled.ok); TẮT tự-áp cho hết phiên)"
            )
            logDeclaration(key: bandwidth.key, event: "apply=rollback")
            return false
        }

        activeUpKbps = next.upKbps
        activeDownKbps = next.downKbps
        activeBandwidthReason = bandwidth.planReason
        lastBandwidthRetargetAt = Date()
        bandwidthRetargetCount += 1
        bandwidthApplyTimes.append(now)
        lastBandwidthApplyAt = now
        bandwidth.applied(
            BandwidthControl.RampDecision(
                multiplierUp: nil,
                multiplierDown: nil,
                reason: bandwidth.pendingReason ?? plan.reason,
                observedKbps: bandwidth.peakDownKbps,
                oldUpKbps: oldUp,
                oldDownKbps: oldDown,
                newUpKbps: plan.upKbps,
                newDownKbps: plan.downKbps
            ),
            ceiling: nil
        )
        markBandwidthRampNotPending()
        RelayDiagnostics.shared.log(
            "bw: ramp-apply net=\(bandwidth.key) observed=\(bandwidth.lastAverageDownKbps) "
                + "old=\(oldUp)/\(oldDown) new=\(plan.upKbps)/\(plan.downKbps) "
                + "reason=\(bandwidth.pendingReason?.label ?? plan.reason.label) plan=\(plan.downKbps) "
                + "apply=\(applyLabel) stallMs=\(rebuilt.stallMs) "
                + "verify=inbound-packets(≤3s) retargets=\(bandwidthRetargetCount) "
                + "appliesInWindow=\(bandwidthApplyTimes.count)"
        )
        logDeclaration(key: bandwidth.key, event: "ramp áp \(applyLabel)")
        return true
    }

    /// Chốt số khai mới **cho LẦN KẾT NỐI SAU** khi đường tự-áp trong phiên đang TẮT.
    ///
    /// Vì sao vẫn phải gọi `applied`/`markBandwidthRampNotPending`: `commitRampPlan` đã bật cờ
    /// `pendingChange`; nếu không gỡ cờ thì vòng lấy mẫu bị chặn vĩnh viễn (`guard !pendingChange`)
    /// và log `plan=` sẽ khác `declared=` mãi mà không ai áp. Số mới ĐÃ nằm trong bộ nhớ theo mạng
    /// (`persistPeaksIfNeeded` trong `commitRampPlan`) nên lần kết nối sau vẫn hưởng.
    private func deferBandwidthRampForNextConnect() {
        guard let bandwidth, bandwidth.pendingChange else { return }
        let plan = bandwidth.plan
        RelayDiagnostics.shared.log(
            "bw: ramp net=\(bandwidth.key) old=\(activeUpKbps)/\(activeDownKbps) "
                + "new=\(plan.upKbps)/\(plan.downKbps) "
                + "reason=\(bandwidth.pendingReason?.label ?? plan.reason.label) "
                + "apply=deferred-next-connect stallMs=0 "
                + "(tự-áp trong phiên đang TẮT: swap cầu giữa phiên làm mất vòng readPackets)"
        )
        bandwidth.applied(
            BandwidthControl.RampDecision(
                multiplierUp: nil,
                multiplierDown: nil,
                reason: bandwidth.pendingReason ?? plan.reason,
                observedKbps: bandwidth.peakDownKbps,
                oldUpKbps: activeUpKbps,
                oldDownKbps: activeDownKbps,
                newUpKbps: activeUpKbps,
                newDownKbps: activeDownKbps
            ),
            ceiling: nil
        )
        markBandwidthRampNotPending()
        logDeclaration(key: bandwidth.key, event: "deferred-next-connect")
    }

    // MARK: - ĐỔI MẠNG GIỮA PHIÊN ⇒ dựng lại transport NGAY trên mạng mới (parity Android)

    /// Có đường khác đang dựng lại transport không (ramp / tự phục hồi / chính đường này).
    private var isTransportRebuildInFlight: Bool {
        rebuildLock.lock(); defer { rebuildLock.unlock() }
        return transportRebuildOwner != nil
    }

    /// Một nhịp: phát hiện ĐỔI MẠNG rồi dựng lại transport khi tới lượt. Chạy trên `bandwidthQueue`.
    ///
    /// Vì sao đọc `bandwidth.key` mà không tự tính danh tính: chính `SessionState` đã đọc danh tính
    /// (tối đa 5 s một lần, hoặc ngay khi tên interface đổi) và cập nhật `key` khi mạng đổi — tính
    /// lại ở đây là làm hai lần cùng một phép đọc (SSID/MAC router) và có thể lệch nhau.
    ///
    /// `forceIdentityRefresh = true` (từ sự kiện WS relay mở lại): đọc lại danh tính NGAY, không
    /// chờ nhịp 5 s — link WS vừa đứt rồi mở lại là dấu hiệu mạnh nhất rằng đường nền vừa đổi.
    private func networkChangeStep(now: Date, forceIdentityRefresh: Bool = false) {
        guard let bandwidth else { return }
        // Đọc lại danh tính Ở ĐÂY, trên nhịp nào gọi hàm này: `force=false` vẫn tôn trọng nhịp 5 s
        // của `SessionState` (rẻ — phần lớn các nhịp chỉ so mốc thời gian), `force=true` (sự kiện
        // WS mở lại) đọc NGAY. Nhờ vậy bộ dò KHÔNG phụ thuộc `bandwidthStep` — đúng sự cố 02:21:
        // nhịp lấy mẫu im 3 phút thì `bandwidth.key` không bao giờ đổi và bộ dò sẽ không thấy gì.
        _ = bandwidth.refreshNetworkIdentityIfNeeded(path: bandwidthPath, force: forceIdentityRefresh, now: now)
        let currentKey = bandwidth.key
        // Chưa có mạng nào (danh tính `other|if:unknown`, xem `prepareBandwidthSession`): KHÔNG có
        // đường để nối lại ⇒ không dựng lại, và KHÔNG cập nhật mốc — giữ khoá THẬT gần nhất để khi
        // mạng thật hiện ra ta còn so đúng với nó (nếu ghi đè bằng khoá `unknown` thì lần mạng mới
        // hiện ra sẽ bị coi là "danh tính vừa rõ" và bỏ mất một lần đổi mạng thật).
        guard !RampStatus.NetworkChangePolicy.isPlaceholderKey(currentKey) else { return }
        if let previous = lastBandwidthNetworkKey {
            if previous != currentKey {
                lastBandwidthNetworkKey = currentKey
                // Xét "đổi mạng THẬT" bằng lookupKeys của danh tính MỚI (hàm thuần, có test):
                // `wifi|if:en0` -> `wifi|router:<MAC>` là CÙNG mạng, chỉ đổi mức cụ thể của khoá.
                if RampStatus.NetworkChangePolicy.isRealChange(
                    previousKey: previous, newLookupKeys: bandwidth.identity.lookupKeys
                ) {
                    pendingNetworkChangeFrom = previous
                    pendingNetworkChangeTo = currentKey
                    RelayDiagnostics.shared.log(
                        "bw: đổi mạng ⇒ dựng lại transport — lý do: net \(previous) -> \(currentKey) "
                            + "(cooldown \(Int(RampStatus.NetworkChangePolicy.cooldownS))s, "
                            + "KHÔNG dùng đường tự-áp số khai trong phiên)"
                    )
                } else {
                    RelayDiagnostics.shared.log(
                        "bw: khoá mạng đổi mức cụ thể (\(previous) -> \(currentKey), cùng một mạng "
                            + "hoặc danh tính vừa rõ) — KHÔNG dựng lại transport"
                    )
                }
            } else if forceIdentityRefresh {
                // Sự kiện WS mở lại mà KHOÁ KHÔNG ĐỔI (đường nền có thể đã đổi rồi đổi lại, hoặc
                // WS phía server rớt): theo đúng luật lọc "đổi mạng giả" thì KHÔNG dựng lại. Ghi log
                // rõ để đọc log là biết ngay vì sao lần này không có dòng `kết quả: ok`.
                RelayDiagnostics.shared.log(
                    "bw: ws-relay mở lại — net \(currentKey) KHÔNG đổi ⇒ KHÔNG dựng lại transport "
                        + "(luật lọc \"đổi mạng giả\")"
                )
            }
        } else {
            lastBandwidthNetworkKey = currentKey
        }
        guard pendingNetworkChangeFrom != nil else { return }
        // Nhường chuỗi TỰ PHỤC HỒI đang chạy (nó đang giữ fd + cầu): nhịp sau thử lại, yêu cầu
        // vẫn nằm trong `pendingNetworkChange*`. KHÁC đường ramp: đang ở HOLD thì VẪN thử, vì mạng
        // mới là bằng chứng mới và HOLD có thể đang chờ đúng lúc này (để lâu là tunnel nằm im).
        guard !isLivenessRecovering else { return }
        guard RampStatus.NetworkChangePolicy.canRebuildNow(
            pending: true,
            sinceLastRebuild: lastNetworkChangeRebuildAt.map { now.timeIntervalSince($0) },
            busy: isTransportRebuildInFlight
        ) else { return }
        rebuildTransportForNetworkChange()
    }

    /// Yêu cầu dò đổi mạng ở nhịp kế tiếp, chạy trên `bandwidthQueue`.
    ///
    /// Vì sao phải HOP sang `bandwidthQueue`: chỉ ở đó mới được chạm `SessionState` (không
    /// thread-safe — cùng lý do `maybeProbeRawLine` quay về hàng đợi này). Hàng đợi là serial và
    /// không có lời gọi chặn vô hạn nào, nên hop này chạy trong vài ms.
    private func requestNetworkChangeCheck(forceIdentityRefresh: Bool = false) {
        bandwidthQueue.async { [weak self] in
            guard let self else { return }
            self.networkChangeStep(now: Date(), forceIdentityRefresh: forceIdentityRefresh)
        }
    }

    /// `ws-relay: link đã mở lại` — link vừa ĐỨT rồi MỞ LẠI.
    ///
    /// Đây là bằng chứng TỨC THỜI mạnh nhất rằng đường nền vừa đổi, và nó KHÔNG phụ thuộc nhịp lấy
    /// mẫu (sự cố thật 02:21 iPhone 1.4.5/34: link đứt 02:21:37 → mở lại 02:21:39 mà 2 phút sau
    /// tunnel vẫn chỉ vài trăm kbps vì không ai dựng lại transport). Vẫn tôn trọng
    /// `RampStatus.NetworkChangePolicy`: cooldown 10 s, lọc "đổi mạng giả", 1 lần/lần đổi mạng.
    private func noteRelayLinkReopened() {
        RelayDiagnostics.shared.log(
            "bw: ws-relay mở lại sau khi đứt — đánh giá ĐỔI MẠNG NGAY (đường đổi mạng riêng, "
                + "không phụ thuộc nhịp lấy mẫu)"
        )
        requestNetworkChangeCheck(forceIdentityRefresh: true)
    }

    /// Dựng lại transport NGAY khi mạng nền đổi, và **áp LUÔN số khai của mạng mới** (Android
    /// `refreshMeteredState`: số mới được chốt ngay khi đổi mạng rồi `MobileConnect` mới đọc nó).
    ///
    /// Đường RIÊNG với `applyBandwidthRampIfIdle`: hàm này KHÔNG đọc/không phụ thuộc
    /// `BandwidthControl.allowsTransportRebuild` (đường đó vẫn TẮT có chủ đích — bật nó ở build 29
    /// làm tunnel tự ngắt rồi không nối lại được). Chỉ chạy khi danh tính mạng ĐỔI THẬT.
    ///
    /// Trả `true` khi transport mới đã lên VÀ cầu mới có gói đi vào trong ≤3 s.
    @discardableResult
    private func rebuildTransportForNetworkChange() -> Bool {
        let started = Date()
        func elapsedMs() -> Int { Int(Date().timeIntervalSince(started) * 1000) }
        guard let bandwidth else { return false }
        let oldKey = pendingNetworkChangeFrom ?? lastBandwidthNetworkKey ?? "?"
        // Số khai của MẠNG MỚI: hỏi thẳng `SessionState` cho danh tính hiện tại (đo tươi = 0 ⇒
        // bộ nhớ / nấc tĩnh của loại mạng / nấc THẬN TRỌNG cho mạng mới). Nhờ vậy luật chốt số chỉ
        // có MỘT nguồn sự thật (`StartupDeclaration`), không chép tay vào provider.
        //
        // KHÔNG `preMeasure` ở đây: phép đo CHẶN tới ~4,5 s, mà việc phải làm là nối lại NGAY trên
        // đường mới (Android cũng ưu tiên nối lại; số sẽ được vòng ramp/nhịp đo rawline tinh chỉnh).
        let fresh = BandwidthControl.SessionState(identity: bandwidth.identity, preMeasuredKbps: 0)
        let plan = fresh.plan
        guard var next = currentOptions else {
            RelayDiagnostics.shared.log(
                "bw: đổi mạng ⇒ dựng lại transport — lý do: net \(oldKey) -> \(bandwidth.key) — "
                    + "kết quả: thất bại (chưa có currentOptions) \(elapsedMs())ms"
            )
            pendingNetworkChangeFrom = nil
            pendingNetworkChangeTo = nil
            return false
        }
        let previous = next
        next.upKbps = plan.upKbps
        next.downKbps = plan.downKbps
        let before = bridgeCounters

        // Độc quyền theo chủ sở hữu: nhịp watchdog (15 s) và nhịp lấy mẫu (1 s) ở hai hàng đợi
        // khác nhau đều có thể dựng lại transport — chồng nhau là hỏng cầu.
        guard acquireTransportRebuild(owner: Self.networkChangeRebuildOwner) else {
            // Đường khác đang giữ: GIỮ yêu cầu lại cho nhịp sau (không mất sự kiện đổi mạng).
            pendingNetworkChangeFrom = oldKey
            pendingNetworkChangeTo = bandwidth.key
            return false
        }
        var released = false
        defer { if !released { releaseTransportRebuild(owner: Self.networkChangeRebuildOwner) } }

        let rebuilt = performBandwidthRebuild(options: next)
        if !rebuilt.ok {
            let restored = rollbackNetworkChange(to: previous, keeping: plan)
            // Số khai ĐANG nằm trong transport (hoặc số mà chuỗi tự phục hồi sẽ dựng lại) là số của
            // MẠNG MỚI — lần quay về ở trên cố ý giữ nguyên nó.
            activeUpKbps = plan.upKbps
            activeDownKbps = plan.downKbps
            activeBandwidthReason = plan.reason
            bandwidth.discardPendingPlan(activeUp: plan.upKbps, activeDown: plan.downKbps)
            bandwidth.noteAppliedPlan(plan)
            pendingNetworkChangeFrom = nil
            pendingNetworkChangeTo = nil
            lastNetworkChangeRebuildAt = started
            RelayDiagnostics.shared.log(
                "bw: đổi mạng ⇒ dựng lại transport — lý do: net \(oldKey) -> \(bandwidth.key) — "
                    + "kết quả: thất bại (stallMs=\(rebuilt.stallMs)) → quay về đường cũ "
                    + "transport, GIỮ số khai mạng mới up=\(plan.upKbps)/down=\(plan.downKbps) "
                    + "rollbackOk=\(restored) \(elapsedMs())ms"
            )
            if !restored {
                // Transport đang KHÔNG lên (cả lần mới lẫn rollback đều hỏng) ⇒ giao cho chuỗi tự
                // phục hồi có giãn nhịp sẵn có. PHẢI nhả quyền TRƯỚC khi gọi (nó xin quyền
                // "liveness"), nếu không nó tự bỏ qua vì tưởng đường khác đang dựng lại.
                releaseTransportRebuild(owner: Self.networkChangeRebuildOwner)
                released = true
                beginTransportRecovery(
                    reason: "đổi mạng \(oldKey) -> \(bandwidth.key): dựng lại + rollback đều hỏng"
                )
            }
            return false
        }

        // Transport mới đã lên: đặt lại mốc cho CẢ HAI bộ giám sát NGAY (cầu mới ⇒ bộ đếm về 0;
        // không đặt lại thì giám sát traffic tưởng "cả phiên không có gói" và TỰ GỠ tunnel — đúng
        // sự cố 24/09/2026 đã ghi ở `resetTrafficSupervisorBaselineAfterSwap`). Việc này cũng gỡ
        // HOLD nếu đang HOLD (xem `startLivenessWatchdog`).
        restartLivenessAfterTransportSwap(reason: "đổi mạng \(oldKey) -> \(bandwidth.key)")

        // Kiểm chứng như đường ramp: ≤3 s phải có ÍT NHẤT 1 gói đi vào cầu mới
        // (`packetFlow→Go` delta > 0). Không đạt ⇒ cầu mới đứng ⇒ quay về đường cũ + log rõ.
        let progressed = waitForInboundProgress(from: before, within: 3)
        guard progressed else {
            let restored = rollbackNetworkChange(to: previous, keeping: plan)
            // Số khai ĐANG nằm trong transport (hoặc số mà chuỗi tự phục hồi sẽ dựng lại) là số của
            // MẠNG MỚI — lần quay về ở trên cố ý giữ nguyên nó.
            activeUpKbps = plan.upKbps
            activeDownKbps = plan.downKbps
            activeBandwidthReason = plan.reason
            bandwidth.discardPendingPlan(activeUp: plan.upKbps, activeDown: plan.downKbps)
            bandwidth.noteAppliedPlan(plan)
            pendingNetworkChangeFrom = nil
            pendingNetworkChangeTo = nil
            lastNetworkChangeRebuildAt = started
            RelayDiagnostics.shared.log(
                "bw: đổi mạng ⇒ dựng lại transport — lý do: net \(oldKey) -> \(bandwidth.key) — "
                    + "kết quả: thất bại (cầu mới KHÔNG có gói vào trong 3s) → quay về đường cũ "
                    + "transport, GIỮ số khai mạng mới up=\(plan.upKbps)/down=\(plan.downKbps) "
                    + "rollbackOk=\(restored) stallMs=\(rebuilt.stallMs) \(elapsedMs())ms"
            )
            if !restored {
                releaseTransportRebuild(owner: Self.networkChangeRebuildOwner)
                released = true
                beginTransportRecovery(
                    reason: "đổi mạng \(oldKey) -> \(bandwidth.key): cầu mới đứng + rollback hỏng"
                )
            }
            return false
        }

        // OK: số khai của MẠNG MỚI đang nằm trong transport. Ghi lại đúng số đang chạy để log và
        // thẻ Diagnostics không nói dối (`discardPendingPlan` trả `plan` về số ĐANG chạy, KHÔNG ghi
        // bộ nhớ — khác `applied`).
        activeUpKbps = plan.upKbps
        activeDownKbps = plan.downKbps
        activeBandwidthReason = plan.reason
        bandwidth.discardPendingPlan(activeUp: plan.upKbps, activeDown: plan.downKbps)
        bandwidth.noteAppliedPlan(plan)
        pendingNetworkChangeFrom = nil
        pendingNetworkChangeTo = nil
        lastNetworkChangeRebuildAt = Date()
        networkChangeRebuildCount += 1
        RelayDiagnostics.shared.log(
            "bw: đổi mạng ⇒ dựng lại transport — lý do: net \(oldKey) -> \(bandwidth.key) — "
                + "kết quả: ok declared up=\(plan.upKbps) down=\(plan.downKbps) "
                + "reason=\(plan.reason.rawValue) stallMs=\(rebuilt.stallMs) "
                + "verify=inbound-packets(≤3s) rebuilds=\(networkChangeRebuildCount) \(elapsedMs())ms"
        )
        logDeclaration(key: bandwidth.key, event: "đổi mạng ⇒ dựng lại transport ok")
        return true
    }

    /// Quay về **cấu hình transport** TRƯỚC lần dựng lại — giống đường ramp khi dựng lại hỏng: thà
    /// chạy cấu hình cũ (đã chở traffic vài giây trước) còn hơn để cầu mới đứng mà không ai chữa.
    ///
    /// 25/09/2026 (chủ dự án chốt): **GIỮ số khai của MẠNG MỚI** trong lần quay về này. Vì sao: số
    /// khai KHÔNG quyết định cầu có chở gói hay không (nó chỉ đặt Brutal `MaxTx/MaxRx`), còn ràng
    /// buộc cứng là "không bao giờ khai số Wi-Fi lên 4G" — khôi phục nguyên số của mạng cũ là vi
    /// phạm ngay (Wi-Fi 30/100 Mbps trên 4G).
    ///
    /// Trả `false` nếu chính lần quay về cũng không lên ⇒ chỗ gọi đưa sang chuỗi tự phục hồi.
    private func rollbackNetworkChange(
        to options: HysteriaTransport.Options,
        keeping plan: BandwidthControl.Plan
    ) -> Bool {
        var restored = options
        restored.upKbps = plan.upKbps
        restored.downKbps = plan.downKbps
        guard performBandwidthRebuild(options: restored).ok else { return false }
        // Rollback cũng tạo CẦU MỚI ⇒ phải đặt lại mốc giám sát, nếu không bộ giám sát traffic
        // thấy bộ đếm về 0 và tự gỡ tunnel ngay sau khi vừa chữa xong (sự cố 24/09/2026).
        restartLivenessAfterTransportSwap(reason: "rollback sau đổi mạng")
        return true
    }

    /// Đo lại ĐƯỜNG THẬT (ngoài tunnel) theo chu kỳ và đưa số vào `SessionState.noteRawLine`.
    ///
    /// `preMeasure` CHẶN tới ~4,5 s nên phải chạy ở hàng đợi nền, rồi quay về `bandwidthQueue`
    /// mới chạm `SessionState` (không thread-safe).
    private func maybeProbeRawLine(now: Date) {
        guard let bandwidth else { return }
        let since = now.timeIntervalSince(lastRawLineProbeAt)
        let idle = isBandwidthIdle()
        guard RawLinePolicy.shouldProbe(
            observedKbps: bandwidth.lastAverageDownKbps,
            declaredKbps: bandwidth.downKbps,
            sinceLastProbe: since,
            idle: idle
        ) else { return }
        guard !rawLineProbeInFlight else { return }
        rawLineProbeInFlight = true
        lastRawLineProbeAt = now
        let key = bandwidth.key
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self else { return }
            let kbps = BandwidthControl.preMeasure(netKey: key) { line in
                RelayDiagnostics.shared.log(line)
            }
            self.bandwidthQueue.async {
                self.rawLineProbeInFlight = false
                guard kbps > 0, let current = self.bandwidth else { return }
                RelayDiagnostics.shared.log(
                    "bw: đo lại ĐƯỜNG THẬT giữa phiên — \(kbps)kbps "
                        + "(nguồn: preMeasure ngoài tunnel, ngưỡng 1,5 MB/2,5 s/200 KB)"
                )
                _ = current.noteRawLine(kbps: kbps, at: Date())
            }
        }
    }

    /// Số lần đã ÁP số khai trong `ApplyGate.windowS` gần nhất (dọn mốc cũ khi đọc).
    private func bandwidthAppliesInWindow(now: Date) -> Int {
        bandwidthApplyTimes = bandwidthApplyTimes.filter {
            now.timeIntervalSince($0) < RampStatus.ApplyGate.windowS
        }
        return bandwidthApplyTimes.count
    }

    /// Chờ cầu chở lại gói (bất kỳ chiều nào) trong `seconds` — dùng để quyết định ROLLBACK.
    ///
    /// Chặn hàng đợi LẤY MẪU tối đa `ApplyGate.verifyS` (5 s) — chấp nhận được vì đây là lúc
    /// transport vừa được thay (nhịp 1 s vốn đã trễ), và KHÔNG chặn hàng đợi của NetworkExtension.
    private func waitForBridgeProgress(
        from before: TunnelBridge.Counters?,
        within seconds: TimeInterval
    ) -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            Thread.sleep(forTimeInterval: 0.25)
            guard let now = bridgeCounters else { continue }
            if let before {
                if now.fromGo > before.fromGo || now.toGo > before.toGo { return true }
            } else if now.fromGo > 0 || now.toGo > 0 {
                return true
            }
        }
        return false
    }

    /// Giao cặp fd MỚI cho Go mà **KHÔNG dừng cầu** (retarget) — xem `TunnelBridge.retarget`.
    ///
    /// Chỉ tạo cầu mới khi CHƯA có cầu (đầu phiên). Giữa phiên thì bắt buộc retarget: dừng cầu
    /// làm mất vòng `readPackets` ⇒ 0 gói mãi mãi (lỗi thật 24/09/2026).
    private func retargetTunnelFD(_ tunnelFD: HysteriaTransport.TunnelFD) {
        flowLock.lock()
        let existing = bridge
        tunnelFdForCounters = tunnelFD.fd
        flowLock.unlock()
        if let existing, let hostFd = tunnelFD.hostFd {
            existing.retarget(hostFd: hostFd)
        } else if let hostFd = tunnelFD.hostFd {
            let created = TunnelBridge(flow: packetFlow, hostFd: hostFd, log: log)
            flowLock.lock()
            bridge = created
            flowLock.unlock()
            created.start()
        }
        RelayDiagnostics.shared.log(
            "bridge: giao fd mới cho Go — fd=\(tunnelFD.fd) qua \(tunnelFD.source.rawValue)"
                + (tunnelFD.hostFd.map { " (hostFd \($0), retarget)" } ?? "")
        )
    }

    /// Chờ có gói ĐI VÀO cầu mới (`packetFlow→Go` tăng) trong `seconds` — điều kiện sống ≤3 s.
    private func waitForInboundProgress(
        from before: TunnelBridge.Counters?, within seconds: TimeInterval
    ) -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            Thread.sleep(forTimeInterval: 0.25)
            guard let now = bridgeCounters else { continue }
            let baseline = before?.toGo ?? 0
            if now.toGo > baseline { return true }
        }
        return false
    }

    /// Dừng transport cũ rồi dựng lại trên **CẶP fd MỚI** (cầu được RETARGET, không tạo lại)
    /// với số khai trong `options`.
    ///
    /// Trả `(ok, stallMs)` — `stallMs` là thời gian KHỰNG THẬT của lần dựng lại (in ra log).
    ///
    /// Vì sao KHÔNG tái dùng fd cũ: fd giao cho Go do sing-tun `os.NewFile` quản lý và bị ĐÓNG khi
    /// `serve()` kết thúc (`tools/hysteria-android/mobile.go:225-295`), còn `TunnelBridge.stop()`
    /// cũng đóng `hostFd`. Dùng lại fd đã chết ⇒ cầu vẫn chạy nhưng gói bị bỏ 100% (`toGo` đóng
    /// băng, `toGoDropped` leo) — đúng dấu vết đo được trong `relay.log` 24/09/2026.
    private func performBandwidthRebuild(
        options: HysteriaTransport.Options
    ) -> (ok: Bool, stallMs: Int) {
        let started = Date()
        func stall() -> Int { Int(Date().timeIntervalSince(started) * 1000) }
        flowLock.lock()
        let previous = transport
        transport = nil
        flowLock.unlock()
        previous?.stop()
        // `MobileStop()` trả về NGAY (không chờ `serve()` unwind) mà sing-tun đóng fd khi `serve()`
        // kết thúc ⇒ nhường một nhịp ngắn trước khi thay cặp fd (xem `installTunnelFD`).
        Thread.sleep(forTimeInterval: Self.rebuildSettleDelay)
        guard let freshFD = HysteriaTransport.resolveTunnelFD(from: packetFlow) else {
            RelayDiagnostics.shared.log(
                "bw: dựng lại KHÔNG lấy được cặp fd mới — KHÔNG dùng lại fd cũ (sẽ làm cầu bỏ gói)"
            )
            return (false, stall())
        }
        retargetTunnelFD(freshFD)
        currentOptions = options
        do {
            try startTransportRetrying(options: options)
        } catch {
            RelayDiagnostics.shared.log("bw: dựng lại transport THẤT BẠI (\(error))")
            return (false, stall())
        }
        return (true, stall())
    }

    /// Dựng transport, thử lại vài lượt khi Go còn giữ client cũ.
    ///
    /// Trần chờ: `rampTransportRetries * rampTransportRetryDelay` = 4 × 300 ms = 1,2s — tunnel
    /// đang rảnh nên khoảng này không cắt ngang traffic nào.
    private func startTransportRetrying(options: HysteriaTransport.Options) throws {
        var lastError: Error?
        for attempt in 0..<Self.rampTransportRetries {
            do {
                try startTransport(options: options)
                return
            } catch {
                lastError = error
                // `stop()` trước lượt sau: lần thử hỏng có thể đã để lại transport nửa vời.
                flowLock.lock()
                let half = transport
                transport = nil
                flowLock.unlock()
                half?.stop()
                if attempt < Self.rampTransportRetries - 1 {
                    Thread.sleep(forTimeInterval: Self.rampTransportRetryDelay)
                }
            }
        }
        throw lastError ?? ConfigFailure("không dựng được transport")
    }

    private func networkSettings(options: HysteriaTransport.Options) -> NEPacketTunnelNetworkSettings {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: options.serverHost)
        settings.mtu = NSNumber(value: options.mtu)

        let ipv4 = NEIPv4Settings(
            addresses: [HysteriaDefaults.tunIPv4Address],
            subnetMasks: [HysteriaDefaults.tunIPv4SubnetMask]
        )
        ipv4.includedRoutes = [NEIPv4Route.default()]
        // ĐÃ THỬ và KHÔNG dùng (19/09/2026): thêm `NEIPv4Route("100.100.100.100", "255.255.255.252")`
        // vào includedRoutes để kernel có đường gửi tới `100.100.100.102` (địa chỉ NAT nội bộ của
        // stack Go — xem `HysteriaTransport.resolveTunnelFD`). Đo thật: KHÔNG sửa được TCP
        // (vẫn treo SYN_SENT), và có lần NE còn không cài route nào ⇒ máy đi thẳng ra en0
        // (rò rỉ: ping 17ms, tải 7,59 MB/s trong khi route 100.100.100.x TRỐNG). Bỏ để không
        // che mất lỗi thật và không tạo rủi ro rò rỉ.
        // LAN + link-local đi THẲNG ra đường vật lý, không vào tunnel: đưa vào tunnel thì
        // router/máy in trong nhà mất kết nối. Giống bản iOS trước đây
        // (`PacketTunnelProvider.startHysteriaSession`).
        //
        // macOS — BƯỚC 1 của `docs/A7_MACOS_SOLUTION.md` (chủ dự án chốt 22/09/2026): trước đây
        // macOS cố ý KHÔNG đặt danh sách này vì lần đo 19/09 kết luận `excludedRoutes` làm lệch
        // route của NE. Nhưng lần đo đó đổi ĐỒNG THỜI `includedRoutes` (thêm `100.100.100.100/30`)
        // nên CHƯA tách được nguyên nhân, và không để lại artifact nào trong `evidence/`. Vì vậy
        // bật lại ĐÚNG 4 dải LAN (chưa kèm danh sách TQ) để tái hiện hoặc bác bỏ nút thắt cũ
        // trong điều kiện sạch — đồng thời sửa lỗi LAN đang có trên Mac (LAN đi vào tunnel).
        var excluded: [NEIPv4Route] = [
            NEIPv4Route(destinationAddress: "10.0.0.0", subnetMask: "255.0.0.0"),
            NEIPv4Route(destinationAddress: "172.16.0.0", subnetMask: "255.240.0.0"),
            NEIPv4Route(destinationAddress: "192.168.0.0", subnetMask: "255.255.0.0"),
            NEIPv4Route(destinationAddress: "169.254.0.0", subnetMask: "255.255.0.0"),
        ]
        #if os(iOS)
        // A7 — app TQ đi đường riêng: dải IP TQ (đã nạp ở nền) đi thẳng, không qua tunnel.
        // CHỈ iOS ở bước này: macOS phải qua bước 1 (đo 4 dải LAN) rồi mới sang bước 2.
        excluded.append(contentsOf: chinaExcludedRoutes)
        #endif
        ipv4.excludedRoutes = excluded
        settings.ipv4Settings = ipv4

        // A7 IPv6 — ĐÃ BỎ (chủ dự án chốt 22/09; `docs/DEV_PLAN_IOS_MACOS_TOC_DO.md` §5b bước 1c).
        // Bản `18f8c82` đặt `ipv6Settings.includedRoutes = [::/0]` để "IPv6 TQ đi thẳng, IPv6 còn
        // lại CHẶN". Nhưng relay `api.meetflowai.site` CÓ bản ghi AAAA ⇒ iOS ưu tiên IPv6 ⇒ gói tới
        // relay bị hút vào tunnel mà server không có IPv6 ⇒ ĐEN ⇒ "mất mạng khi connect" trên iPhone
        // thật. Bỏ `ipv6Settings` (IPv6 đi thẳng như trước, KHÔNG chặn kết nối). Việc bịt rò IPv6 —
        // nếu còn cần — phải loại trừ ĐÚNG địa chỉ relay/endpoint (kiểu WireGuard
        // `endpointExcludedRoutes`), KHÔNG dùng `::/0`; đó là việc riêng, chưa thuộc lượt này.

        settings.dnsSettings = NEDNSSettings(servers: HysteriaDefaults.dnsServers)
        return settings
    }

    // MARK: - Watchdog

    // MARK: - Giám sát traffic & TỰ CỨU

    /// Giám sát "tunnel có mạng thật không" và TỰ GỠ khi không có (xem `selfRescue`).
    ///
    /// Bằng chứng đến từ CHÍNH GÓI CỦA MÁY qua cầu `packetFlow ↔ fd` (bộ đếm trong
    /// `TunnelBridge`), vì **traffic của tiến trình extension KHÔNG đi qua tunnel của nó**:
    /// NetworkExtension giữ nó ở đường vật lý. Đo thật 19/09/2026 trên macOS 26.5:
    ///   * probe `URLSession` trong extension trả `120.234.32.53` (IP nhà) trong khi máy đang
    ///     route 0/0 qua utun của tunnel;
    ///   * probe TCP bind nguồn `100.100.100.101` (địa chỉ utun) bị `bind()` từ chối:
    ///     `errno=49` (EADDRNOTAVAIL).
    /// ⇒ Một probe "chủ động" từ trong extension KHÔNG thể chứng minh đường tunnel. Vì vậy
    /// quyết định tự gỡ dựa trên dấu hiệu HỎNG nhìn thấy từ gói thật của máy, còn probe chỉ
    /// để ghi log mạng của máy (không dùng để gỡ tunnel — gỡ oan còn tệ hơn).
    ///
    /// Hai dấu hiệu tự gỡ:
    ///   1. **TCP blackhole** (đúng bug khách báo): máy gửi SYN vào tunnel mà KHÔNG có
    ///      SYN-ACK/RST nào quay về ⇒ TCP không thể chạy qua tunnel ⇒ gỡ ngay.
    ///   2. **Không có gói nào** đi qua tunnel sau mốc 15s (cả hai chiều đều 0) ⇒ gỡ.
    /// Ngoài ra transport chết (WS đứt) đã có đường riêng (`handleDeath`).
    private func startTrafficSupervisor() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(
            deadline: .now() + Self.trafficCheckInterval,
            repeating: Self.trafficCheckInterval
        )
        timer.setEventHandler { [weak self] in self?.supervisorStep() }
        flowLock.lock()
        supervisorTimer?.cancel()
        supervisorTimer = timer
        supervisorSession = session
        supervisorStart = Date()
        supervisorTick = 0
        supervisorStopped = false
        supervisorLastInPackets = 0
        supervisorLastOutPackets = 0
        supervisorLastToGoDropped = 0
        supervisorLastOfferedPackets = 0
        supervisorOutProgressAt = supervisorStart ?? Date()
        supervisorInProgressAt = supervisorStart ?? Date()
        supervisorStallActionAt = Date.distantPast
        supervisorStallStrikes = 0
        trafficConfirmed = false
        probeInFlight = false
        // Trần đổi đường là TRẦN MỖI PHIÊN: phiên mới phải được đổi đường lại từ đầu, nếu không thì
        // sau 3 lần của phiên trước, phiên sau hết quyền đổi dù đường mới hỏng.
        nodeFailovers = 0
        relayFailover = RelayFailoverWatch(
            windowS: Self.livenessInterval,
            fruitlessToAdvance: Self.failoverAfterFruitlessRecoveries,
            maxAdvances: Self.maxNodeFailovers
        )
        firstPacketLogged = false
        firstReturnPacketLogged = false
        firstTCPHandshakeLogged = false
        tcpWaitingLogged = false
        flowLock.unlock()
        timer.resume()
        RelayDiagnostics.shared.log(
            "giám sát: bắt đầu — mốc \(Int(Self.firstTrafficDeadline))s phải thấy gói thật qua tunnel; "
                + "TCP blackhole (SYN mà không có SYN-ACK/RST) sau \(Int(Self.tcpBlackholeDeadline))s là GỠ NGAY; "
                + "không có gói nào qua tunnel sau \(Int(Self.firstTrafficDeadline))s cũng gỡ"
        )
    }

    /// Một nhịp: đọc bộ đếm, ghi mốc, quyết định tự gỡ.
    private func supervisorStep() {
        flowLock.lock()
        let expected = supervisorSession
        let started = supervisorStart ?? Date()
        supervisorTick += 1
        let tick = supervisorTick
        let confirmed = trafficConfirmed
        flowLock.unlock()
        guard expected == currentSession else {
            cancelSupervisor()
            return
        }
        let elapsed = Date().timeIntervalSince(started)

        // Nguồn bằng chứng: macOS đếm ở cầu `packetFlow ↔ fd`, iOS đọc bộ đếm gói của
        // interface utun (xem `trafficCounters`). Không đọc được bộ đếm nào ⇒ lùi về số
        // frame của relay làm proxy (đường dự phòng, xem các quy tắc (2)/(2b)).
        let counters = trafficCounters
        let inPackets = counters?.toGo ?? 0
        let outPackets = counters?.fromGo ?? 0
        // H2 — "máy vẫn gửi" phải tính CẢ gói cầu bỏ: khi tầng Go ngừng đọc fd thì `toGo`
        // đóng băng còn `toGoDropped` leo (đo thật 24/09/2026: bỏ 13→4285 và 6→5109).
        let droppedPackets = counters?.toGoDropped ?? 0
        let offeredPackets = counters?.toGoOffered ?? 0
        let synToGo = counters?.tcpSynToGo ?? 0
        let synAckFromGo = counters?.tcpSynAckFromGo ?? 0
        let rstFromGo = counters?.tcpRstFromGo ?? 0
        let countsTCPHandshake = counters?.countsTCPHandshake ?? false
        let frames = currentTransport()?.relayFrameCounts
        let receivedFrames = frames?.received ?? 0
        let sentFrames = frames?.sent ?? 0

        // H2 (fix chính, 24/09/2026) — so DELTA giữa hai nhịp thay vì so bộ đếm LUỸ KẾ từ đầu
        // phiên với 0. Vì sao: phiên hỏng thật đã có 2387 gói vào/ra và 60 SYN-ACK từ đầu phiên
        // nên mọi điều kiện `inPackets == 0` / `outPackets == 0` / `synAckFromGo == 0` KHÔNG BAO
        // GIỜ khớp ⇒ watchdog mù suốt phiên (0 dòng "QUYẾT ĐỊNH TỰ GỠ" trong 2/2 phiên).
        let now = Date()
        let deltaIn = max(0, inPackets - supervisorLastInPackets)
        let deltaOut = max(0, outPackets - supervisorLastOutPackets)
        let deltaDropped = max(0, droppedPackets - supervisorLastToGoDropped)
        let deltaOffered = max(0, offeredPackets - supervisorLastOfferedPackets)
        // Bộ đếm TỤT (nguồn/cầu mới) ⇒ đặt lại mốc tiến triển, KHÔNG kết luận hỏng.
        let regressed = inPackets < supervisorLastInPackets
            || outPackets < supervisorLastOutPackets
            || offeredPackets < supervisorLastOfferedPackets
        flowLock.lock()
        supervisorLastInPackets = inPackets
        supervisorLastOutPackets = outPackets
        supervisorLastToGoDropped = droppedPackets
        supervisorLastOfferedPackets = offeredPackets
        if regressed {
            supervisorInProgressAt = now
            supervisorOutProgressAt = now
            supervisorStallStrikes = 0
        } else {
            if deltaOut > 0 {
                supervisorOutProgressAt = now
                // Chiều về CÓ gói mới ⇒ huỷ chuỗi strike (Android: probe thắng thì đếm lại từ đầu).
                supervisorStallStrikes = 0
            }
            if deltaOffered > 0 { supervisorInProgressAt = now }
        }
        let outProgressAt = supervisorOutProgressAt
        let inProgressAt = supervisorInProgressAt
        let lastStallActionAt = supervisorStallActionAt
        flowLock.unlock()

        noteFirstPackets(inPackets: inPackets, outPackets: outPackets, elapsed: elapsed)
        noteFirstTCPHandshake(synAckFromGo: synAckFromGo, synToGo: synToGo, elapsed: elapsed)

        // (1) TCP blackhole — dấu hiệu HỎNG rõ ràng nhất, đúng ca "connect là mất mạng".
        // macOS: đếm được SYN/SYN-ACK vì gói đi qua cầu của extension.
        if elapsed >= Self.tcpBlackholeDeadline, countsTCPHandshake,
           synToGo > 0, synAckFromGo == 0, rstFromGo == 0 {
            selfRescue(
                reason: "TCP blackhole: máy đã gửi \(synToGo) SYN vào tunnel nhưng KHÔNG có SYN-ACK/RST nào "
                    + "quay về sau \(Int(elapsed))s (gói vào \(inPackets), gói ra \(outPackets))"
            )
            return
        }

        #if os(iOS)
        // (1b) iOS: extension KHÔNG tap được gói (Go đọc thẳng fd utun) nên không đếm được cờ
        // SYN/SYN-ACK. Dấu hiệu TƯƠNG ĐƯƠNG từ bộ đếm interface: máy ĐÃ đưa gói vào tunnel mà
        // KHÔNG có gói nào quay về sau 10s ⇒ TCP không thể chạy qua tunnel, đúng ca khách báo.
        // Ngưỡng giữ nguyên \(Self.tcpBlackholeDeadline)s như macOS.
        //
        // Cố ý KHÔNG bật nhánh này trên macOS: ở đó `countsTCPHandshake` luôn true khi có cầu
        // (đường sản phẩm) nên quy tắc (1) đã phủ, còn chế độ chẩn đoán `mode=direct` giữ
        // NGUYÊN hành vi cũ (không thêm điều kiện tự gỡ nào).
        if elapsed >= Self.tcpBlackholeDeadline, !countsTCPHandshake,
           inPackets > 0, outPackets == 0 {
            selfRescue(
                reason: "TCP blackhole (iOS, đếm trên \(counters?.origin ?? "?")): máy đã đưa "
                    + "\(inPackets) gói vào tunnel nhưng KHÔNG có gói nào quay về sau \(Int(elapsed))s"
            )
            return
        }
        #endif

        // (2) Bộ đếm tunnel = 0 cả hai chiều — **CẤM kết luận "tunnel hỏng" chỉ vì con số 0**.
        //
        // Lỗi thật 24/09/2026 (máy Mac): quy tắc cũ gỡ tunnel của máy ĐANG CÓ MẠNG nhưng rảnh:
        //   `giám sát: QUYẾT ĐỊNH TỰ GỠ tunnel sau 280.0s — … (cả hai chiều đều 0; relay frame gửi 11/nhận 6)`
        // Bộ đếm là LUỸ KẾ và bị reset về 0 mỗi lần cầu/transport dựng lại ⇒ "0 gói" chỉ nghĩa
        // "chưa có gói mới". Nay phải có BẰNG CHỨNG CHỦ ĐỘNG: máy ĐANG tải (interface vật lý
        // nhích) VÀ probe hỏng LIÊN TIẾP ≥2 lần (xem `TrafficSupervisorPolicy`).
        if counters != nil, elapsed >= Self.firstTrafficDeadline, inPackets == 0, outPackets == 0 {
            let machineActive = physicalInterfaceActive()
            let verdict = TrafficSupervisorPolicy.idleVerdict(
                tunnelCarriedNothing: true,
                machineActive: machineActive,
                consecutiveProbeFailures: currentIdleProbeFailures(),
                secondsSinceWindowStart: Date().timeIntervalSince(idleWindowStartLocked()),
                countersJustReset: regressed
            )
            switch verdict {
            case .concludeNothing:
                logIdleTrafficNoVerdict(machineActive: machineActive, elapsed: elapsed,
                                        sentFrames: sentFrames, receivedFrames: receivedFrames)
                resetIdleTrafficWindow()
                return
            case .waitForProbe:
                startIdleTrafficProbe(elapsed: elapsed)
                return
            case .concludeTunnelDead:
                RelayDiagnostics.shared.log(
                    "giám sát: máy ĐANG tải + tunnel 0 gói cả hai chiều + "
                        + "\(TrafficSupervisorPolicy.idleProbeRequiredFailures) probe hỏng liên tiếp "
                        + "⇒ TỰ DỰNG LẠI transport (KHÔNG gỡ tunnel ngay; relay frame gửi "
                        + "\(sentFrames)/nhận \(receivedFrames))"
                )
                resetIdleTrafficWindow()
                beginTransportRecovery(reason: "tunnel không chở gói dù máy đang tải (có probe hỏng liên tiếp)")
                return
            }
        }
        if counters == nil, elapsed >= Self.firstTrafficDeadline, sentFrames == 0, receivedFrames == 0 {
            selfRescue(
                reason: "sau \(Int(elapsed))s relay không chở frame nào (gửi 0, nhận 0) — tunnel không có mạng"
            )
            return
        }
        #if os(iOS)
        // (2b) iOS, khi mất nguồn đếm gói (`sysctl` không đọc được bộ đếm interface): vẫn còn
        // bằng chứng từ relay — QUIC đã gửi Initial mà relay KHÔNG trả về frame nào trong 15s
        // nghĩa là chặng relay↔node không thông (xem `relayFrameCounts`), tunnel không thể có
        // mạng. macOS không có nhánh này: đường sản phẩm luôn có bộ đếm của cầu.
        if counters == nil, elapsed >= Self.firstTrafficDeadline, sentFrames > 0, receivedFrames == 0 {
            selfRescue(
                reason: "đã gửi \(sentFrames) frame qua relay mà sau \(Int(elapsed))s KHÔNG nhận được "
                    + "frame nào về — QUIC không bắt tay được, tunnel không có mạng"
            )
            return
        }
        #endif

        // (3) H2 — KHÔNG TIẾN TRIỂN trong N giây (so DELTA, không so luỹ kế với 0).
        // Chiều VỀ đứng yên ≥ `stallSilenceDeadline` (45 s — android parity) trong khi máy VẪN gửi
        // gói MỚI — kể cả gói cầu phải bỏ (`toGoDropped`, đúng dấu hiệu tầng Go ngừng đọc fd) ⇒
        // tunnel không chở được gì dù WS vẫn mở. Bất đối xứng mới kết luận: máy ngồi yên (không có
        // gói mới) thì KHÔNG đụng tới, tránh gỡ oan. Phải đủ `stallStrikesToRebuild` nhịp liên tiếp.
        let outStalled = now.timeIntervalSince(outProgressAt)
        let machineStillSending = deltaOffered > 0 && inProgressAt > outProgressAt
        if machineStillSending, outStalled >= Self.stallSilenceDeadline {
            flowLock.lock()
            supervisorStallStrikes += 1
            let strikes = supervisorStallStrikes
            flowLock.unlock()
            let stall = "không tiến triển \(Int(outStalled))s (strike \(strikes)/"
                + "\(Self.stallStrikesToRebuild)): chiều về đứng yên (delta ra \(deltaOut), "
                + "tổng ra \(outPackets)) trong khi máy vẫn gửi (delta vào \(deltaIn), delta bỏ "
                + "\(deltaDropped), tổng vào \(inPackets), tổng bỏ \(droppedPackets); nguồn "
                + "\(counters?.origin ?? "không đọc được"), relay frame gửi \(sentFrames)/nhận "
                + "\(receivedFrames))"
            if strikes >= Self.stallStrikesToRebuild, outStalled >= Self.stallTeardownDeadline {
                // Đã nhường trọn chu kỳ sửa của watchdog sống-còn mà vẫn không có gói nào về:
                // thà trả mạng về cho máy (tự bỏ qua nếu đang HOLD — chốt 22/09/2026).
                selfRescue(reason: "\(stall) — quá \(Int(Self.stallTeardownDeadline))s, tunnel không chở được gói")
                return
            }
            if strikes >= Self.stallStrikesToRebuild,
               now.timeIntervalSince(lastStallActionAt) >= Self.stallRebuildCooldown {
                flowLock.lock()
                supervisorStallActionAt = now
                flowLock.unlock()
                RelayDiagnostics.shared.log("giám sát: \(stall) ⇒ TỰ DỰNG LẠI transport")
                beginTransportRecovery(reason: stall)
                return
            }
        }

        // Xác nhận có mạng THẬT qua tunnel (chỉ để ghi log + trạng thái, không dùng để gỡ).
        // KHÔNG coi "có gói khứ hồi" là đủ khi máy ĐANG thử TCP mà chưa handshake nào xong:
        // đo thật 19/09/2026, tunnel blackhole vẫn có ICMP/DNS khứ hồi (574 vào/557 ra) nên
        // chỉ nhìn gói là kết luận sai.
        if !confirmed {
            if synAckFromGo > 0 {
                confirmTraffic(
                    elapsed: elapsed,
                    evidence: "TCP handshake hoàn tất \(synAckFromGo) lần (gói vào \(inPackets), ra \(outPackets))"
                )
            } else if synToGo == 0, inPackets > 0, outPackets > 0 {
                confirmTraffic(
                    elapsed: elapsed,
                    evidence: "gói khứ hồi qua tunnel: vào \(inPackets), ra \(outPackets) (máy chưa thử TCP nào)"
                )
            } else if synToGo > 0, synAckFromGo == 0, !tcpWaitingLogged {
                flowLock.lock()
                tcpWaitingLogged = true
                flowLock.unlock()
                RelayDiagnostics.shared.log(
                    "giám sát: máy đã gửi \(synToGo) SYN vào tunnel mà CHƯA có SYN-ACK nào quay về "
                        + "(gói vào \(inPackets), ra \(outPackets)) — chờ tới mốc "
                        + "\(Int(Self.tcpBlackholeDeadline))s rồi tự gỡ"
                )
            }
        }

        // Ramp băng thông: quyết định đã có ở nhịp 1s (`bandwidthStep`) nhưng số khai chỉ vào
        // transport khi dựng lại được. Watchdog ở đây chạy mỗi `trafficCheckInterval` giây nên
        // là chỗ thử lại tự nhiên (nhịp 1s cũng thử, xem `bandwidthStep`); điều kiện "rảnh hay
        // buộc áp" nằm trong chính `applyBandwidthRampIfIdle`.
        if isBandwidthRampPending {
            // Lý do in ra log lấy từ chính quyết định đang chờ: `clamp` (kẹp theo số đo — xem
            // `underrunPct`) khác `loss-backoff` (mất gói); còn lại là đường ramp thường.
            let pending = bandwidth?.pendingReason
            _ = applyBandwidthRampIfIdle(reason: pending?.label ?? "idle-reconnect")
        }

        // Probe chẩn đoán: CHỈ ghi log mạng của máy (xem chú thích ở `startTrafficSupervisor`).
        if tick % Self.probeEveryTicks == 0 { startProbe(expected: expected, elapsed: elapsed) }
    }

    /// Ghi log MỘT lần cho mỗi chiều gói đầu tiên đi qua cầu (mốc nghiệm thu).
    private func noteFirstPackets(inPackets: Int, outPackets: Int, elapsed: TimeInterval) {
        flowLock.lock()
        let needIn = inPackets > 0 && !firstPacketLogged
        let needOut = outPackets > 0 && !firstReturnPacketLogged
        if needIn { firstPacketLogged = true }
        if needOut { firstReturnPacketLogged = true }
        flowLock.unlock()
        if needIn {
            RelayDiagnostics.shared.log(
                "giám sát: gói ĐẦU TIÊN của máy vào tunnel sau \(Self.seconds(elapsed))s (tổng \(inPackets) gói)"
            )
        }
        if needOut {
            RelayDiagnostics.shared.log(
                "giám sát: gói ĐẦU TIÊN từ tunnel về máy sau \(Self.seconds(elapsed))s (tổng \(outPackets) gói)"
            )
        }
    }

    /// Mốc quan trọng nhất: tunnel đã hoàn tất được MỘT handshake TCP với máy ⇒ TCP chạy.
    private func noteFirstTCPHandshake(synAckFromGo: Int, synToGo: Int, elapsed: TimeInterval) {
        flowLock.lock()
        let needed = synAckFromGo > 0 && !firstTCPHandshakeLogged
        if needed { firstTCPHandshakeLogged = true }
        flowLock.unlock()
        guard needed else { return }
        RelayDiagnostics.shared.log(
            "giám sát: TCP ĐÃ CHẠY qua tunnel — SYN-ACK đầu tiên về máy sau \(Self.seconds(elapsed))s "
                + "(SYN vào \(synToGo), SYN-ACK về \(synAckFromGo))"
        )
    }

    // MARK: Bằng chứng chủ động cho "giám sát traffic" (xem `TrafficSupervisorPolicy`)

    /// Máy có ĐANG tải không: interface vật lý nhích byte trong nhịp vừa rồi.
    ///
    /// Ngưỡng thấp (2 KB trong 5 s ≈ 3 kbps) đủ để phân biệt "có hoạt động mạng" với "im";
    /// máy rảnh thật thì gần như đứng yên.
    private func physicalInterfaceActive() -> Bool {
        guard let now = HysteriaTransport.physicalInterfaceBytes() else { return false }
        defer { supervisorPhysicalBytes = now }
        guard let previous = supervisorPhysicalBytes else { return false }
        return now - previous >= 2_000
    }

    private func currentIdleProbeFailures() -> Int {
        flowLock.lock(); defer { flowLock.unlock() }
        return supervisorIdleProbeFailures
    }

    /// ⚠️ TÊN nói `Locked` nhưng hàm **TỰ lấy `flowLock`** — gọi khi đang giữ khoá là deadlock
    /// (`NSLock` không tái nhập). Muốn dùng bên trong vùng đã khoá thì đọc thẳng
    /// `supervisorIdleWindowStart`.
    private func idleWindowStartLocked() -> Date {
        flowLock.lock(); defer { flowLock.unlock() }
        return supervisorIdleWindowStart
    }

    /// Đặt lại cửa sổ đánh giá (máy rảnh, hoặc vừa kết luận) — luật (5) của yêu cầu 24/09/2026.
    private func resetIdleTrafficWindow() {
        flowLock.lock()
        supervisorIdleWindowStart = Date()
        supervisorIdleProbeFailures = 0
        flowLock.unlock()
    }

    /// Log (THROTTLE 60 s) rằng bộ đếm 0 nhưng KHÔNG kết luận gì — thay cho dòng
    /// "QUYẾT ĐỊNH TỰ GỠ" oan trước đây, để đọc log biết ngay vì sao app không gỡ tunnel.
    private func logIdleTrafficNoVerdict(
        machineActive: Bool, elapsed: TimeInterval, sentFrames: Int, receivedFrames: Int
    ) {
        guard Date().timeIntervalSince(supervisorIdleLogAt) >= 60 else { return }
        supervisorIdleLogAt = Date()
        let why = machineActive
            ? "máy ĐANG tải nhưng chưa đủ bằng chứng probe"
            : "máy đang RẢNH (interface vật lý không nhích)"
        RelayDiagnostics.shared.log(
            "giám sát: bộ đếm tunnel = 0 cả hai chiều sau \(Self.seconds(elapsed))s — \(why) "
                + "⇒ KHÔNG gỡ tunnel, đặt lại mốc đánh giá (relay frame gửi \(sentFrames)/nhận \(receivedFrames))"
        )
    }

    /// Probe NGOÀI tunnel (hạ tầng sẵn có, timeout 3 s) để đếm bằng chứng chủ động.
    ///
    /// ⚠️ GIỚI HẠN NỀN TẢNG (đã kiểm trong repo): extension KHÔNG probe được *xuyên* tunnel —
    /// socket của extension không đi qua tunnel của chính nó, và `bind` vào địa chỉ utun bị
    /// macOS chặn (`EADDRNOTAVAIL`, đo 19/09/2026). Vì vậy probe trả lời "MÁY còn Internet
    /// không": hỏng = đường ra của máy có vấn đề; thành công thì `idleVerdict` vẫn KHÔNG cho gỡ.
    private func startIdleTrafficProbe(elapsed: TimeInterval) {
        flowLock.lock()
        if supervisorIdleProbeInFlight { flowLock.unlock(); return }
        supervisorIdleProbeInFlight = true
        flowLock.unlock()
        probeQueue.async { [weak self] in
            guard let self else { return }
            let ip = self.probeThroughTunnel()
            self.flowLock.lock()
            self.supervisorIdleProbeInFlight = false
            if ip == nil {
                self.supervisorIdleProbeFailures += 1
            } else {
                self.supervisorIdleProbeFailures = 0
            }
            let failures = self.supervisorIdleProbeFailures
            self.supervisorIdleWindowStart = Date()
            self.flowLock.unlock()
            if let ip {
                RelayDiagnostics.shared.log(
                    "giám sát: probe NGOÀI tunnel OK (IP \(ip)) ⇒ KHÔNG gỡ, đặt lại mốc đánh giá "
                        + "(lần hỏng liên tiếp = 0)"
                )
            } else {
                RelayDiagnostics.shared.log(
                    "giám sát: probe hỏng lần \(failures)/\(TrafficSupervisorPolicy.idleProbeRequiredFailures) "
                        + "(sau \(Self.seconds(elapsed))s) — chưa gỡ tunnel"
                )
            }
        }
    }

    private func startProbe(expected: Int, elapsed: TimeInterval) {
        flowLock.lock()
        if probeInFlight {
            flowLock.unlock()
            return
        }
        probeInFlight = true
        flowLock.unlock()
        probeQueue.async { [weak self] in
            guard let self else { return }
            let ip = self.probeThroughTunnel()
            self.finishProbe(ip: ip, expected: expected, elapsed: elapsed)
        }
    }

    private func finishProbe(ip: String?, expected: Int, elapsed: TimeInterval) {
        flowLock.lock()
        probeInFlight = false
        flowLock.unlock()
        guard expected == currentSession else { return }
        // KHÔNG dùng probe để gỡ tunnel: traffic của extension không đi qua tunnel của nó,
        // nên probe chỉ nói lên "máy có Internet hay không", không nói gì về đường tunnel.
        guard let ip else { return }
        let counters = trafficCounters
        RelayDiagnostics.shared.log(
            "giám sát: mạng NGOÀI tunnel của máy OK sau \(Self.seconds(elapsed))s — IP \(ip); "
                + "gói QUA tunnel (\(counters?.origin ?? "không đọc được bộ đếm")): "
                + "vào \(counters?.toGo ?? 0), ra \(counters?.fromGo ?? 0), "
                + "SYN vào \(counters?.tcpSynToGo ?? 0), SYN-ACK về \(counters?.tcpSynAckFromGo ?? 0), "
                + "RST về \(counters?.tcpRstFromGo ?? 0)"
        )
    }

    private func confirmTraffic(elapsed: TimeInterval, evidence: String) {
        flowLock.lock()
        let already = trafficConfirmed
        trafficConfirmed = true
        flowLock.unlock()
        guard !already else { return }
        RelayDiagnostics.shared.log(
            "giám sát: XÁC NHẬN tunnel có mạng thật sau \(Self.seconds(elapsed))s — \(evidence)"
        )
    }

    /// Probe CHẨN ĐOÁN mạng của máy (KHÔNG quyết định gỡ tunnel — xem
    /// `startTrafficSupervisor`): traffic của extension không đi qua tunnel của nó nên probe
    /// này chỉ nói "máy còn Internet hay không", giúp phân biệt "tunnel hỏng" với "cả mạng hỏng".
    ///
    /// KHÔNG bind nguồn = địa chỉ utun: macOS chặn (`bind` trả `errno=49` EADDRNOTAVAIL từ
    /// tiến trình extension — đo thật 19/09/2026), nên một probe "qua tunnel" là bất khả thi
    /// từ trong extension.
    /// Hàm CHẶN nên chỉ được gọi trên `probeQueue`.
    private func probeThroughTunnel() -> String? {
        probeTrace()
    }

    /// TCP tới `1.1.1.1:80` (Cloudflare trace, không cần DNS), đọc `ip=` trong phản hồi.
    private func probeTrace() -> String? {
        let request = "GET /cdn-cgi/trace HTTP/1.0\r\nHost: one.one.one.one\r\nConnection: close\r\n\r\n"
        let payload = Array(request.utf8)
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        defer { close(fd) }

        var remote = sockaddr_in()
        remote.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        remote.sin_family = sa_family_t(AF_INET)
        remote.sin_port = UInt16(80).bigEndian
        guard inet_pton(AF_INET, "1.1.1.1", &remote.sin_addr) == 1 else { return nil }
        _ = fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_NONBLOCK)
        let connected = withUnsafePointer(to: &remote) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        if connected != 0 {
            guard errno == EINPROGRESS else { return nil }
            var descriptor = pollfd(fd: fd, events: Int16(POLLOUT), revents: 0)
            guard poll(&descriptor, 1, Int32(Self.probeTimeout * 1000)) > 0 else { return nil }
            var socketError: Int32 = 0
            var length = socklen_t(MemoryLayout<Int32>.size)
            guard getsockopt(fd, SOL_SOCKET, SO_ERROR, &socketError, &length) == 0, socketError == 0 else { return nil }
        }
        _ = payload.withUnsafeBytes { write(fd, $0.baseAddress, payload.count) }

        var buffer = [UInt8](repeating: 0, count: 2048)
        var body = ""
        let deadline = Date().addingTimeInterval(Self.probeTimeout)
        while Date() < deadline {
            var descriptor = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
            guard poll(&descriptor, 1, 300) > 0 else { continue }
            let capacity = buffer.count
            let count = buffer.withUnsafeMutableBytes { read(fd, $0.baseAddress, capacity) }
            if count <= 0 { break }
            body += String(decoding: buffer[0..<count], as: UTF8.self)
            if let ip = Self.exitIP(from: body) { return ip }
        }
        return Self.exitIP(from: body)
    }

    /// Tách IP thoát từ body của endpoint. Chỉ nhận token ĐÚNG dạng IP (`Network.IPv4Address` /
    /// `IPv6Address` parse nghiêm) — đo thật 19/09/2026: regex lỏng từng nuốt cả timestamp
    /// `05:08:45` trong header HTTP thành "IP".
    private static func exitIP(from body: String?) -> String? {
        guard let body else { return nil }
        let separators: Set<Character> = ["\n", "\r", " ", "\t", "=", ",", "\"", "'"]
        for token in body.split(whereSeparator: { separators.contains($0) }) {
            let candidate = String(token)
            guard !candidate.isEmpty, candidate.count <= 45 else { continue }
            // IPv4 dạng đủ 4 octet (IPv4Address một mình còn nhận cả "301" — mã trạng thái HTTP).
            if candidate.filter({ $0 == "." }).count == 3, IPv4Address(candidate) != nil { return candidate }
            if candidate.contains(":"), IPv6Address(candidate) != nil { return candidate }
        }
        return nil
    }

    /// TỰ GỠ tunnel khi không chứng minh được có mạng — trả mạng của máy về như trước.
    ///
    /// Đây là điều kiện nghiệm thu của chủ dự án (19/09/2026): "connect vào mất toàn mạng"
    /// là lỗi nặng nhất; thà ngắt tunnel kèm lỗi rõ còn hơn để máy ở trạng thái Connected
    /// mà không có mạng.
    private func selfRescue(reason: String) {
        // Đang HOLD: chốt 22/09/2026 cấm teardown — giữ đường đã chọn và chờ mạng về, không
        // để supervisor tự gỡ tunnel mà HOLD đang giữ.
        if isLivenessHolding {
            RelayDiagnostics.shared.log(
                "giám sát: BỎ QUA tự gỡ vì đang HOLD (giữ đường đã chọn, chờ mạng về) — \(reason)"
            )
            return
        }
        flowLock.lock()
        let alreadyStopped = supervisorStopped
        supervisorStopped = true
        let elapsed = supervisorStart.map { Date().timeIntervalSince($0) } ?? 0
        flowLock.unlock()
        guard !alreadyStopped else { return }
        RelayDiagnostics.shared.log("giám sát: QUYẾT ĐỊNH TỰ GỠ tunnel sau \(Self.seconds(elapsed))s — \(reason)")
        log.error("traffic supervisor: self-rescue (\(reason, privacy: .public))")
        setStatus(
            state: "no_traffic",
            code: Self.codeNoTraffic,
            message: "Tự gỡ tunnel: \(reason)"
        )
        teardownAndCancel(
            code: Self.codeNoTraffic,
            message: "Tự gỡ tunnel vì không có mạng qua tunnel (đã gỡ network settings, mạng trở lại bình thường): \(reason)"
        )
    }

    private func cancelSupervisor() {
        flowLock.lock()
        let timer = supervisorTimer
        supervisorTimer = nil
        flowLock.unlock()
        timer?.cancel()
    }

    // MARK: - Watchdog SỐNG-CÒN suốt phiên (parity Windows 1.4.1)

    /// Bật watchdog "tunnel còn sống nhưng không chở gói" cho SUỐT phiên. Gọi sau khi transport
    /// đã lên; huỷ trong `cancelScheduledWork` (cả `stopTunnel` lẫn `teardownAndCancel`).
    ///
    /// Nhịp 15s: đọc bộ đếm gói thật rồi giao `LivenessWatchdog` quyết định. Chỉ tự dựng lại khi
    /// chiều VỀ im ≥15s (A5) VÀ máy VẪN gửi gói vào tunnel (bất đối xứng) — người dùng ngồi
    /// yên không bị cắt oan (bài học từ `RelayHealthWatchdog` của Windows).
    private func startLivenessWatchdog() {
        // Nhịp PHẢI ở hàng đợi riêng: xem chú thích `livenessQueue`.
        let timer = DispatchSource.makeTimerSource(queue: livenessQueue)
        timer.schedule(
            deadline: .now() + Self.livenessInterval,
            repeating: Self.livenessInterval
        )
        timer.setEventHandler { [weak self] in self?.livenessStep() }
        flowLock.lock()
        livenessTimer?.cancel()
        livenessTimer = timer
        livenessSession = session
        liveness = LivenessWatchdog(
            now: Date(),
            interval: Self.livenessInterval,
            silenceLimit: Self.livenessSilenceLimit,
            strikesToRebuild: Self.livenessStrikesToRebuild
        )
        livenessRecovering = false
        livenessRebuildAttempts = 0
        livenessCancelled = false
        livenessHold = false
        livenessHoldReason = ""
        livenessPrevFromGo = 0
        livenessPrevToGo = 0
        livenessPrevToGoDropped = 0
        livenessPrevFromGoBytes = 0
        livenessPrevToGoBytes = 0
        lowGoodputStrikes = 0
        livenessLastTickAt = Date()
        livenessTicks = 0
        flowLock.unlock()
        timer.resume()
        startWatchdogGuard()
        RelayDiagnostics.shared.log(
            "giám sát sống-còn: bật SUỐT phiên — nhịp \(Int(Self.livenessInterval))s; chiều về im "
                + "\(Int(Self.livenessSilenceLimit))s VÀ máy vẫn gửi gói (đếm cả gói cầu phải bỏ) "
                + "mới kết luận; đủ "
                + "\(Self.livenessStrikesToRebuild) strike ⇒ tự dựng lại tối đa "
                + "\(Self.livenessRebuildMax) lần (chờ 2/5/10s)"
        )
    }

    private func cancelLivenessWatchdog() {
        flowLock.lock()
        let timer = livenessTimer
        livenessTimer = nil
        let guardTimer = watchdogGuardTimer
        watchdogGuardTimer = nil
        livenessCancelled = true
        livenessRecovering = false
        livenessHold = false
        livenessHoldReason = ""
        liveness = nil
        flowLock.unlock()
        // Nhả quyền dựng lại nếu chuỗi phục hồi còn treo (idempotent, chỉ nhả đúng chủ).
        releaseTransportRebuild(owner: "liveness")
        timer?.cancel()
        guardTimer?.cancel()
    }

    /// Đồng hồ CHẾT chạy trên hàng đợi RIÊNG: thấy nhịp watchdog im quá `livenessStallLimit` (hoặc
    /// timer không còn) thì ghi log thật rõ rồi **bật lại** watchdog với mốc mới.
    ///
    /// Nhờ chạy ở hàng đợi khác, nó vẫn báo được cả khi hàng đợi của nhịp watchdog bị chặn — đúng
    /// loại sự cố không thể chẩn đoán được từ log trước đây.
    private func startWatchdogGuard() {
        watchdogGuardTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: watchdogGuardQueue)
        timer.schedule(deadline: .now() + Self.livenessInterval, repeating: Self.livenessInterval)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            self.flowLock.lock()
            let last = self.livenessLastTickAt
            let cancelled = self.livenessCancelled
            let session = self.session
            let timerMissing = self.livenessTimer == nil
            self.flowLock.unlock()
            guard !cancelled else { return }
            let stalledFor = Date().timeIntervalSince(last)
            guard timerMissing || stalledFor >= Self.livenessStallLimit else { return }
            RelayDiagnostics.shared.log(
                "giám sát sống-còn: watchdog NGỪNG chạy (\(Int(stalledFor))s không có nhịp, "
                    + "timerMissing=\(timerMissing)) — bật lại, phiên \(session)"
            )
            self.startLivenessWatchdog()
        }
        watchdogGuardTimer = timer
        timer.resume()
    }

    /// Transport vừa bị THAY (ramp băng thông / tự phục hồi / HOLD) ⇒ mọi mốc của watchdog cũ trỏ
    /// vào đường cũ. Bật lại watchdog với trạng thái mới, và đây cũng là lưới an toàn cho ca đo
    /// được 23/09/2026 (sau lần ramp dựng lại transport, watchdog im lặng 14 phút).
    private func restartLivenessAfterTransportSwap(reason: String) {
        RelayDiagnostics.shared.log(
            "giám sát sống-còn: transport vừa thay (\(reason)) — bật lại watchdog với mốc mới"
        )
        startLivenessWatchdog()
        resetTrafficSupervisorBaselineAfterSwap()
    }

    /// Cầu/fd vừa được THAY: bộ đếm gói của cầu mới bắt đầu lại từ 0 nên MỌI mốc so sánh của
    /// "giám sát traffic" phải đặt lại.
    ///
    /// Vì sao bắt buộc: nhánh (2) của `supervisorStep` kết luận dựa trên `elapsed` (tính từ
    /// `supervisorStart` của ĐẦU phiên) và tổng gói hiện tại. Sau khi thay cầu, `elapsed` vẫn lớn
    /// (ví dụ 160 s) mà bộ đếm mới = 0 ⇒ giám sát hiểu sai thành "cả phiên không có gói nào" và
    /// **TỰ GỠ tunnel** ngay sau khi ramp. Đúng ca đo trên máy thật 24/09/2026 15:06:03:
    ///   `bridge: giao fd mới cho Go — fd=10 qua bridge-socketpair (hostFd 13)`
    ///   → `giám sát: QUYẾT ĐỊNH TỰ GỠ tunnel sau 160.0s — sau 160s KHÔNG có gói nào của máy đi
    ///      qua tunnel (cả hai chiều đều 0; relay frame gửi 2/nhận 0)`
    ///
    /// Chạy trên `queue` (cùng hàng đợi với `supervisorStep`) để không đua trạng thái.
    private func resetTrafficSupervisorBaselineAfterSwap() {
        queue.async { [weak self] in
            guard let self else { return }
            self.flowLock.lock()
            self.supervisorLastInPackets = 0
            self.supervisorLastOutPackets = 0
            self.supervisorLastToGoDropped = 0
            self.supervisorLastOfferedPackets = 0
            self.supervisorOutProgressAt = Date()
            self.supervisorInProgressAt = Date()
            self.supervisorStart = Date()
            self.supervisorTick = 0
            self.flowLock.unlock()
            RelayDiagnostics.shared.log(
                "giám sát: cầu mới ⇒ đặt lại mốc đếm gói (tránh gỡ oan 'không có gói nào qua tunnel')"
            )
        }
    }

    private func verdictLabel(_ verdict: LivenessWatchdog.Verdict) -> String {
        switch verdict {
        case .idle: return "idle"
        case .alive: return "alive"
        case .strike(let count): return "strike \(count)"
        case .rebuild: return "rebuild"
        }
    }

    /// Một nhịp: đọc bộ đếm, hỏi `LivenessWatchdog`, thi hành quyết định.
    private func livenessStep() {
        wedgeBeat()
        flowLock.lock()
        let expected = livenessSession
        let cancelled = livenessCancelled
        let recovering = livenessRecovering
        livenessLastTickAt = Date()
        livenessTicks += 1
        let ticks = livenessTicks
        flowLock.unlock()
        guard !cancelled else { cancelLivenessWatchdog(); return }
        // Phiên đổi KHÔNG được huỷ vĩnh viễn watchdog: bản cũ gọi `cancelLivenessWatchdog()` ở đây,
        // mà hàm đó tắt LUÔN cả đồng hồ chết ⇒ không ai bật lại nữa (log thật build 25/26:
        // **0 nhịp tim** suốt phiên trong khi build 22 có 28 nhịp). Nay bật lại với phiên mới.
        guard expected == currentSession else {
            RelayDiagnostics.shared.log(
                "giám sát sống-còn: phiên đổi \(expected)→\(currentSession) — BẬT LẠI watchdog "
                    + "(trước đây huỷ vĩnh viễn ⇒ watchdog câm)"
            )
            startLivenessWatchdog()
            return
        }
        guard !recovering else {
            // Trước đây nhánh này `return` IM LẶNG: chuỗi tự dựng lại mà treo thì watchdog tắt
            // tiếng vĩnh viễn và log không có lấy một dòng.
            if Date().timeIntervalSince(lastLivenessSkipLogAt) >= 30 {
                lastLivenessSkipLogAt = Date()
                RelayDiagnostics.shared.log(
                    "giám sát sống-còn: BỎ QUA nhịp \(ticks) — đang trong chuỗi tự dựng lại, "
                        + "phiên \(currentSession)"
                )
            }
            return
        }
        // Pha HOLD: KHÔNG dựng lại ngay, KHÔNG bao giờ teardown — giữ đường đã chọn rồi ping
        // lại mỗi nhịp cho tới khi mạng về (chốt 22/09/2026).
        if isLivenessHolding {
            holdStep()
            return
        }
        // KHÔNG đọc bộ đếm trong lúc giữ `flowLock`: `trafficCounters` tự lấy khoá này.
        let counters = trafficCounters
        // FAILOVER ĐƯỜNG: đo CHIỀU VỀ trong cửa sổ 15 s mở sau mỗi lần dựng lại transport. Gọi ở
        // ĐÂY vì đang KHÔNG giữ `flowLock` (hàm này tự lấy khoá, và `advanceRelayCandidate` cũng lấy).
        relayFailoverStep(now: Date(), fromGo: counters?.fromGo)
        let rampInFlight = isBandwidthRebuildInFlight
        // DELTA so với nhịp trước — chỉ để ghi log; quyết định vẫn nằm trong `LivenessWatchdog`.
        // Bộ đếm tụt (dựng lại cầu/nguồn khác) ⇒ kẹp 0, không in số âm.
        let deltaFromGo = max(0, (counters?.fromGo ?? livenessPrevFromGo) - livenessPrevFromGo)
        let deltaToGo = max(0, (counters?.toGo ?? livenessPrevToGo) - livenessPrevToGo)
        let deltaToGoDropped = max(
            0,
            (counters?.toGoDropped ?? livenessPrevToGoDropped) - livenessPrevToGoDropped
        )
        // BYTE chiều về trong nhịp — luật im-lặng chỉ đo GÓI nên bỏ lọt node "sống mà chở ≈0 byte".
        let deltaFromGoBytes = max(
            0,
            (counters?.fromGoBytes ?? livenessPrevFromGoBytes) - livenessPrevFromGoBytes
        )
        if let counters { livenessPrevFromGoBytes = counters.fromGoBytes }
        let deltaToGoBytes = max(
            0,
            (counters?.toGoBytes ?? livenessPrevToGoBytes) - livenessPrevToGoBytes
        )
        if let counters { livenessPrevToGoBytes = counters.toGoBytes }
        // Có BYTE thật về ⇒ đường còn chở dữ liệu. Đo bằng BYTE chứ không bằng "có gói": node nhỏ
        // giọt vài gói vẫn tính là KHÔNG chở — đúng ca node 1 ngày 25/09 (7–16 KB/phút ⇒ watchdog
        // cũ báo `alive` nên không có strike nào, không dựng lại, không đổi node).
        // (Đếm FAILOVER không còn dùng delta byte ở đây nữa — xem `relayFailoverStep`: delta byte so
        // với mốc bị đặt lại 0 sau mỗi lần dựng lại, nên nó luôn báo "có chở" một cách giả.)
        if deltaFromGoBytes >= Self.goodputMinBytes {
            lowGoodputStrikes = 0
        } else if hasServedThisSession, deltaToGo >= Self.goodputMinOfferedPackets,
                  deltaToGoBytes < Self.goodputMaxUpBytes {
            // "Đang XIN dữ liệu": đủ gói vào, mà chiều LÊN không lớn (loại trừ phiên upload thật).
            lowGoodputStrikes += 1
        } else {
            lowGoodputStrikes = 0
        }
        if lowGoodputStrikes >= Self.lowGoodputStrikesToRebuild {
            lowGoodputStrikes = 0
            let kbps = Double(deltaFromGoBytes) * 8 / 1000 / Self.livenessInterval
            let lowGoodputReason = "máy đang xin dữ liệu (\(deltaToGo) gói/nhịp) mà chiều về chỉ "
                + "\(deltaFromGoBytes) byte/nhịp (~\(Int(kbps)) kbps) trong "
                + "\(Self.lowGoodputStrikesToRebuild) nhịp liên tiếp — node sống nhưng KHÔNG chở"
            RelayDiagnostics.shared.log(
                "giám sát sống-còn: \(lowGoodputReason) ⇒ TỰ DỰNG LẠI transport"
            )
            beginTransportRecovery(reason: lowGoodputReason)
            return
        }
        if let counters {
            livenessPrevFromGo = counters.fromGo
            livenessPrevToGo = counters.toGo
            livenessPrevToGoDropped = counters.toGoDropped
        }
        flowLock.lock()
        var verdict: LivenessWatchdog.Verdict = .idle
        if var dog = liveness {
            verdict = dog.tick(
                now: Date(),
                fromGo: counters?.fromGo,
                toGo: counters?.toGo,
                // H2 (fix chính, 24/09/2026): gói cầu PHẢI BỎ cũng là "máy vẫn gửi". Thiếu số
                // này thì `toGo` đóng băng lúc Go ngừng đọc fd ⇒ watchdog trả `.idle` mãi mãi.
                toGoDropped: counters?.toGoDropped ?? 0,
                // 24/09/2026 tối: luật "SYN gửi mà KHÔNG có SYN-ACK nào về" — ca thật 22:23→22:56
                // (khách "Connected mà không có mạng" 32 phút dù mỗi 15 s vẫn có ~10 gói nhỏ giọt
                // về). Xem `LivenessWatchdog.tick`.
                synToGo: counters?.tcpSynToGo ?? 0,
                synAckFromGo: counters?.tcpSynAckFromGo ?? 0,
                countsTCPHandshake: counters?.countsTCPHandshake ?? false,
                // Android parity 24/09/2026: `udpFrames` = số frame client đã GỬI LÊN relay. Máy đẩy
                // gói vào cầu mà số này đứng yên ⇒ tầng Go không đẩy gói lên relay (ca thật
                // 22:23→22:56: +180 gói/15 s vào cầu, `udpFrames` đóng băng >30 s).
                // ⚠️ ĐANG GIỮ `flowLock` (mở ở trên, đóng ở `flowLock.unlock()` ngay sau `dog.tick`)
                // nên TUYỆT ĐỐI không gọi `currentTransport()` — hàm đó `flowLock.lock()` LẦN NỮA
                // mà `flowLock` là `NSLock` KHÔNG tái nhập ⇒ **tự khoá chết ngay nhịp watchdog ĐẦU
                // TIÊN** và giữ `flowLock` vĩnh viễn cho tới hết phiên.
                //
                // Đo thật 25/09/2026 (log máy thật, 26 phiên): từ build 25 mọi phiên iOS đều
                // `bw: sample` đúng **2 dòng** rồi im (dòng cuối ở +12…+22 s = nhịp +15 s), **0
                // nhịp tim** watchdog, còn cầu `packetFlow↔fd` VẪN chở gói tới hết phiên (nhịp 5 s
                // của cầu không đụng `flowLock`). Build 24 và macOS 1.4.3/20 (trước dòng này) thì
                // nhịp lấy mẫu chạy SUỐT phiên (36 mẫu/477 s; 71 mẫu/741 s) ⇒ hồi quy nằm đúng đây.
                // Hệ quả khi dính: thẻ Diagnostics đứng im, KHÔNG ramp, KHÔNG dò được đổi mạng,
                // watchdog câm — mọi thứ cần `flowLock` đều chết lặng.
                // Đọc thẳng `transport` là ĐÚNG vì ta đang giữ khoá bảo vệ nó.
                relayFramesSent: transport?.relayFrameCounts?.sent,
                rampInFlight: rampInFlight
            )
            liveness = dog
        }
        flowLock.unlock()

        // Dòng delta dùng chung cho cả 3 nhánh log bên dưới.
        let deltaNote = "delta \(Int(Self.livenessInterval))s: vào \(deltaToGo) gói (bỏ "
            + "\(deltaToGoDropped)), ra \(deltaFromGo) gói; tổng vào \(counters?.toGo ?? 0), "
            + "bỏ \(counters?.toGoDropped ?? 0), ra \(counters?.fromGo ?? 0) — nguồn "
            + "\(counters?.origin ?? "không đọc được")"

        switch verdict {
        case .idle, .alive:
            // Nhịp tim ~60 s: `.idle`/`.alive` trước đây KHÔNG ghi gì nên "watchdog ngừng chạy" là
            // trạng thái vô hình. Có dòng này thì log luôn trả lời được: watchdog còn sống không,
            // và nó đang nghĩ gì (kèm nguồn số + delta).
            if ticks % Self.livenessHeartbeatEveryTicks == 0 {
                RelayDiagnostics.shared.log(
                    "giám sát sống-còn: nhịp \(ticks) — \(verdictLabel(verdict)); \(deltaNote)"
                )
            }
            return
        case .strike(let count):
            RelayDiagnostics.shared.log(
                "giám sát sống-còn: \(liveness?.lastStallEvidence ?? "nghi đường về hỏng") — "
                    + "strike \(count)/\(Self.livenessStrikesToRebuild) (\(deltaNote))"
            )
        case .rebuild:
            let evidence = liveness?.lastStallEvidence ?? "chiều về im"
            RelayDiagnostics.shared.log(
                "giám sát sống-còn: đủ \(Self.livenessStrikesToRebuild) strike — TỰ DỰNG LẠI transport "
                    + "[\(evidence)] (\(deltaNote))"
            )
            beginTransportRecovery(
                reason: "tunnel sống nhưng không chở gói [\(evidence)] (\(deltaNote))"
            )
        }
    }

    /// Transport ĐANG chạy chết giữa phiên ⇒ thử tự dựng lại (parity Windows 1.4.1) thay vì gỡ
    /// tunnel ngay. Hết 3 lượt mới trả mạng về đường trực tiếp.
    private func handleTransportDeath(reason: String) {
        RelayDiagnostics.shared.log(
            "hysteria: transport chết (\(reason)) — thử TỰ DỰNG LẠI (tối đa "
                + "\(Self.livenessRebuildMax) lần) thay vì gỡ tunnel"
        )
        setStatus(
            state: "rebuilding",
            code: nil,
            message: "Đường hysteria2 dừng (\(reason)). Đang tự dựng lại…"
        )
        beginTransportRecovery(reason: "transport chết: \(reason)")
    }

    /// Chuyển `currentOptions` sang relay/node KẾ TIẾP trong danh sách dự phòng (`relayURLCandidates`)
    /// rồi xoay vòng node cũ xuống cuối. Gọi từ `relayFailoverStep` (sau khi cửa sổ đánh giá 15 s
    /// chứng minh 2 lần dựng lại liên tiếp vẫn 0 gói VỀ) — lần dựng lại KẾ TIẾP sẽ chạy trên node mới.
    ///
    /// Vì sao cần: node có thể chết ở CHIỀU VỀ (relay WS vẫn mở được, handshake ok, nhưng không trả
    /// gói nào) — khi đó dựng lại CÙNG node là vô ích. Đo thật 25/09/2026: máy Mac ghim `vn1hy`, dựng
    /// lại transport 3 lần liên tiếp vẫn 0 gói về trong khi đó bật lại cùng máy với `vn2hy` là chạy.
    private func advanceRelayCandidate(reason: String) {
        guard nodeFailovers < Self.maxNodeFailovers else {
            RelayDiagnostics.shared.log(
                "hết ứng viên đường: đã đổi đủ \(Self.maxNodeFailovers) lần trong phiên — GIỮ đường "
                    + "hiện tại (\(reason))"
            )
            return
        }
        flowLock.lock()
        let options = currentOptions
        flowLock.unlock()
        guard let options else {
            RelayDiagnostics.shared.log("đổi đường: chưa có currentOptions — không đổi được (\(reason))")
            return
        }
        guard !options.relayURLCandidates.isEmpty else {
            RelayDiagnostics.shared.log(
                "hết ứng viên đường: cấu hình không có đường dự phòng (relayURLCandidates rỗng) — "
                    + "GIỮ đường hiện tại (\(reason))"
            )
            return
        }
        let old = options.relayURL.lastPathComponent
        var rest = options.relayURLCandidates
        let next = rest.removeFirst()
        let switched = HysteriaTransport.Options(
            relayURL: next,
            // Xoay vòng: node vừa bỏ xuống CUỐI để lần sau còn quay lại được.
            relayURLCandidates: rest + [options.relayURL],
            serverHost: options.serverHost,
            serverPort: options.serverPort,
            password: options.password,
            obfs: options.obfs,
            upKbps: options.upKbps,
            downKbps: options.downKbps,
            mtu: options.mtu,
            ipv4: options.ipv4,
            ipv6: options.ipv6
        )
        flowLock.lock()
        currentOptions = switched
        flowLock.unlock()
        nodeFailovers += 1
        RelayDiagnostics.shared.log(
            "đã đổi đường: \(old) → \(next.lastPathComponent) — \(reason); lần \(nodeFailovers)/"
                + "\(Self.maxNodeFailovers) trong phiên (còn \(rest.count) đường dự phòng)"
        )
    }

    /// Một nhịp cho luật FAILOVER ĐƯỜNG (xem `RelayFailoverWatch`): đo DELTA số gói CHIỀU VỀ trong
    /// cửa sổ 15 s mở ngay sau mỗi lần dựng lại transport. 0 gói về 2 lần liên tiếp ⇒ đổi ứng viên.
    ///
    /// ⚠️ CHỈ gọi khi ĐANG KHÔNG giữ `flowLock` (hàm này tự lấy khoá; `advanceRelayCandidate` cũng
    /// lấy khoá ⇒ gọi lồng sẽ tự khoá chết, xem AGENTS.md §7c).
    private func relayFailoverStep(now: Date, fromGo: Int?) {
        // Không đọc được bộ đếm ⇒ không đo được gì, giữ nguyên cửa sổ cho nhịp sau.
        guard let fromGo else { return }
        flowLock.lock()
        let verdict = relayFailover.tick(now: now, fromGo: fromGo)
        // Đóng chuỗi vô ích (đổi thành công) / hết ứng viên ngay TRONG vùng khoá, chỉ ghi log + hành
        // động ở ngoài — để không gọi hàm lấy khoá trong lúc đang giữ khoá.
        switch verdict {
        case .advanceRelay: relayFailover.noteAdvanced()
        case .exhausted: relayFailover.noteExhausted()
        case .waiting, .carried, .fruitless: break
        }
        let series = relayFailover.fruitlessWindows
        flowLock.unlock()

        switch verdict {
        case .waiting:
            return
        case .carried(let delta):
            RelayDiagnostics.shared.log(
                "tự phục hồi: cửa sổ \(Int(Self.livenessInterval))s có \(delta) gói VỀ ⇒ lần dựng lại "
                    + "vừa rồi HIỆU QUẢ — xoá bộ đếm vô ích (0/\(Self.failoverAfterFruitlessRecoveries))"
            )
        case .fruitless(let count):
            RelayDiagnostics.shared.log(
                "tự phục hồi: \(count) lần dựng lại vẫn 0 gói VỀ trong cửa sổ "
                    + "\(Int(Self.livenessInterval))s — chưa đủ \(Self.failoverAfterFruitlessRecoveries) "
                    + "lần nên chưa đổi đường (\(series)/\(Self.failoverAfterFruitlessRecoveries))"
            )
        case .advanceRelay(let count):
            RelayDiagnostics.shared.log("tự phục hồi: \(count) lần dựng lại vẫn 0 gói VỀ ⇒ đổi đường")
            advanceRelayCandidate(reason: "\(count) lần dựng lại transport mà vẫn 0 gói VỀ")
        case .exhausted(let count):
            RelayDiagnostics.shared.log(
                "tự phục hồi: \(count) lần dựng lại vẫn 0 gói VỀ nhưng hết ứng viên đường "
                    + "(đã đổi đủ \(Self.maxNodeFailovers) lần trong phiên) — GIỮ tunnel của khách, "
                    + "nhịp sau thử lại, KHÔNG xoay vòng vô hạn"
            )
        }
    }

    private func beginTransportRecovery(reason: String) {
        flowLock.lock()
        let already = livenessRecovering
        let cancelled = livenessCancelled
        if !already {
            livenessRecovering = true
            livenessRebuildAttempts = 0
        }
        flowLock.unlock()
        guard !already, !cancelled else {
            if already {
                // Trước đây nhánh này im lặng: nếu chuỗi trước treo thì watchdog không bao giờ
                // được bật lại mà log cũng không có dấu vết.
                RelayDiagnostics.shared.log(
                    "tự phục hồi: BỎ QUA vì chuỗi tự dựng lại trước chưa kết thúc (\(reason))"
                )
            }
            return
        }
        guard acquireTransportRebuild(owner: "liveness") else {
            // Đường ramp băng thông đang dựng lại transport: nhường nó (số khai mới rồi sẽ lên).
            flowLock.lock()
            livenessRecovering = false
            flowLock.unlock()
            RelayDiagnostics.shared.log(
                "tự phục hồi: bỏ qua (\(reason)) vì đường ramp băng thông đang dựng lại transport"
            )
            return
        }
        // Trần thời gian cho cả chuỗi do LƯỚI AN TOÀN (luồng OS riêng) thi hành — xem `wedgeGuardLoop`.
        wedgeRecoveryBegin()
        // ĐỔI ĐƯỜNG (25/09/2026): relay/node đang chọn có thể CHẾT Ở CHIỀU VỀ trong khi WS relay vẫn
        // bắt tay được (ca thật: `vn1hy` — handshake ok nhưng `Go→packetFlow` đóng băng 125 MB, cả
        // `SYN-ACK về` đứng im; đổi sang relay khác là mạng chạy lại ngay). Việc quyết định đổi đường
        // KHÔNG nằm ở đây nữa mà ở `relayFailoverStep` (đo DELTA chiều về trong cửa sổ sau mỗi lần
        // dựng lại) — luật cũ ở đây bị reset oan mỗi lần nên không bao giờ đổi.
        RelayDiagnostics.shared.log(
            "tự phục hồi: \(reason) — thử dựng lại tối đa \(Self.livenessRebuildMax) lần "
                + "(chờ 2/5/10s), phiên \(currentSession)"
        )
        // Trần thời gian cho cả chuỗi: hết trần mà vẫn `recovering` ⇒ nhả cờ + nhả quyền dựng lại
        // để nhịp sau thử tiếp (KHÔNG để watchdog câm vì một lượt dựng lại kẹt).
        watchdogGuardQueue.asyncAfter(deadline: .now() + Self.recoveryStuckTimeout) { [weak self] in
            guard let self else { return }
            self.flowLock.lock()
            let stuck = self.livenessRecovering && !self.livenessCancelled
            self.flowLock.unlock()
            guard stuck else { return }
            RelayDiagnostics.shared.log(
                "tự phục hồi: KẸT >\(Int(Self.recoveryStuckTimeout))s — nhả cờ 'đang phục hồi' + quyền "
                    + "dựng lại để nhịp sau thử tiếp (KHÔNG để watchdog câm)"
            )
            self.finishTransportRecovery(gaveUp: false, reason: "quá hạn một lượt tự dựng lại")
        }
        scheduleTransportRecoveryAttempt(expected: currentSession, reason: reason)
    }

    /// Lên lịch lượt kế tiếp (chờ theo backoff) hoặc chịu thua khi hết trần.
    private func scheduleTransportRecoveryAttempt(expected: Int, reason: String) {
        flowLock.lock()
        let cancelled = livenessCancelled
        let attempts = livenessRebuildAttempts
        flowLock.unlock()
        guard !cancelled, expected == currentSession else {
            finishTransportRecovery(gaveUp: false, reason: reason)
            return
        }
        // 24/09/2026 (chủ dự án chốt): KHÔNG có nhánh "hết trần ⇒ chịu thua/HOLD" nữa. Đường về
        // hỏng thì cứ thử lại NGẦM mãi (giãn nhịp tới 60 s), vì để khách ở "Connected mà không có
        // mạng" là tệ nhất. Mỗi lần thử đều ghi log để còn bằng chứng.
        let next = attempts + 1
        let wait = Self.livenessRebuildBackoff[
            min(next - 1, Self.livenessRebuildBackoff.count - 1)
        ]
        flowLock.lock()
        livenessRebuildAttempts = next
        flowLock.unlock()
        RelayDiagnostics.shared.log(
            "tự phục hồi: lần \(next) — chờ \(Int(wait))s rồi dựng lại"
                + (next > Self.livenessRebuildMax
                   ? " (đã thử \(next) lần, vẫn tiếp tục ngầm; KHÔNG báo Connected giả)"
                   : "")
        )
        // Việc dựng lại là lời gọi CHẶN ⇒ chạy ở `recoveryQueue`, KHÔNG ở `livenessQueue`.
        recoveryQueue.asyncAfter(deadline: .now() + wait) { [weak self] in
            self?.runTransportRecoveryAttempt(next, expected: expected, reason: reason)
        }
    }

    private func runTransportRecoveryAttempt(_ attempt: Int, expected: Int, reason: String) {
        flowLock.lock()
        let cancelled = livenessCancelled
        flowLock.unlock()
        guard !cancelled, expected == currentSession else {
            // Phiên đổi/huỷ giữa chuỗi ⇒ kết thúc mốc "đang dựng lại", nếu không lưới an toàn sẽ
            // bắn oan 30 s sau (đúng lỗi 25/09/2026: dựng lại THÀNH CÔNG mà lưới vẫn tưởng kẹt).
            wedgeRecoveryEnd()
            return
        }
        if rebuildTransportForLiveness() {
            let counters = trafficCounters
            flowLock.lock()
            if var dog = liveness {
                dog.resetAfterRebuild(
                    now: Date(),
                    fromGo: counters?.fromGo ?? dog.lastFromGo,
                    toGo: counters?.toGo ?? dog.baselineToGo,
                    toGoDropped: counters?.toGoDropped ?? 0
                )
                liveness = dog
            }
            livenessRecovering = false
            livenessRebuildAttempts = 0
            // MỞ CỬA SỔ đánh giá FAILOVER cho lần dựng lại VỪA XONG: `fromGo` đọc ngay bây giờ là mốc
            // gốc, 15 s sau mà vẫn đúng số đó ⇒ lần dựng lại này VÔ ÍCH (không có gói nào VỀ). Không
            // đo được bộ đếm (nil) thì thôi, để nhịp sau.
            if let counters {
                relayFailover.beginWindow(now: Date(), fromGo: counters.fromGo)
            }
            flowLock.unlock()
            releaseTransportRebuild(owner: "liveness")
            // P1-1: transport đã lên lại ⇒ XOÁ state/message "đang dựng lại" của lần hỏng trước.
            // Không xoá thì app giữ "Connected" + "Reconnecting…" mãi (đúng lỗi Android từng bị).
            setStatus(state: "up", code: nil, message: nil)
            RelayDiagnostics.shared.log(
                "tự phục hồi: ĐÃ dựng lại transport (lần \(attempt)) — tunnel giữ nguyên, "
                    + "tiếp tục giám sát; đã xoá state/message tạm"
            )
            // Dựng lại THÀNH CÔNG ⇒ đóng mốc "đang dựng lại" NGAY. Thiếu dòng này, lưới an toàn
            // bắn oan "chuỗi dựng lại kẹt 30 s" rồi hạ tunnel — đúng ca 12:02 ngày 25/09/2026.
            wedgeRecoveryEnd()
            return
        }
        RelayDiagnostics.shared.log(
            "tự phục hồi: lần \(attempt) dựng lại thất bại — thử lượt kế"
        )
        scheduleTransportRecoveryAttempt(expected: expected, reason: reason)
    }

    /// Kết thúc chuỗi phục hồi: thành công thì thôi; chịu thua thì vào **HOLD** (chốt
    /// 22/09/2026) — GIỮ đường đã chọn + tunnel vẫn `Connected` + ping tiếp, KHÔNG teardown.
    private func finishTransportRecovery(gaveUp: Bool, reason: String) {
        wedgeRecoveryEnd()
        flowLock.lock()
        livenessRecovering = false
        livenessRebuildAttempts = 0
        flowLock.unlock()
        releaseTransportRebuild(owner: "liveness")
        guard gaveUp else { return }
        enterLivenessHold(reason: reason)
    }

    // MARK: - Pha HOLD (chốt 22/09/2026: hết đường thì giữ đường đã chọn + ping tiếp)

    /// Vào HOLD: giữ nguyên đường đã chọn (đường đang chạy), tunnel vẫn UP, KHÔNG gỡ network
    /// settings, KHÔNG `cancelTunnelWithError`. UI vẫn `Connected` — mã `TUNNEL_NO_TRAFFIC`
    /// chỉ còn để hiển thị/log, không dùng để hạ tunnel.
    private func enterLivenessHold(reason: String) {
        flowLock.lock()
        let already = livenessHold
        livenessHold = true
        livenessHoldReason = reason
        flowLock.unlock()
        guard !already else { return }
        // Đặt mốc từ bộ đếm hiện tại để lần có byte chiều VỀ đầu tiên là "mạng về".
        let counters = trafficCounters
        flowLock.lock()
        if var dog = liveness {
            dog.beginHold(
                now: Date(),
                fromGo: counters?.fromGo ?? dog.lastFromGo,
                toGo: counters?.toGo ?? dog.baselineToGo,
                toGoDropped: counters?.toGoDropped ?? 0
            )
            liveness = dog
        }
        flowLock.unlock()
        // KHÔNG đổi trạng thái VPN (vẫn Connected) để không rò rỉ ra nhà mạng.
        setStatus(state: "up", code: nil, message: nil)
        RelayDiagnostics.shared.log(
            "hold: giu \(currentPathLabel()), ping lai moi \(Int(Self.livenessInterval))s (lan 0) — "
                + "hết \(Self.livenessRebuildMax) lượt dựng lại (\(reason)); KHÔNG gỡ tunnel, chờ mạng về"
        )
    }

    /// Một nhịp HOLD: ping lại đường đã chọn (không đổi bậc, không teardown). Chiều VỀ có byte
    /// mới HOẶC dựng lại được transport ⇒ mạng về ⇒ quay lại STABLE mức cũ rồi chạy lại PROBE.
    private func holdStep() {
        let counters = trafficCounters
        let rampInFlight = isBandwidthRebuildInFlight
        flowLock.lock()
        var pingNo = liveness?.holdPings ?? 0
        var networkBack = false
        if var dog = liveness {
            switch dog.holdTick(
                now: Date(),
                fromGo: counters?.fromGo,
                toGo: counters?.toGo,
                toGoDropped: counters?.toGoDropped ?? 0
            ) {
            case .waiting(let count): pingNo = count
            case .networkBack: networkBack = true
            }
            liveness = dog
        }
        let reason = livenessHoldReason
        flowLock.unlock()

        if networkBack {
            finishLivenessHold(reason: reason, evidence: "thấy byte chiều về")
            return
        }

        RelayDiagnostics.shared.log(
            "hold: giu \(currentPathLabel()), ping lai moi \(Int(Self.livenessInterval))s (lan \(pingNo)) — \(reason)"
        )
        // Đang ramp băng thông giữ fd: nhường nhịp này, không tranh.
        guard !rampInFlight else { return }
        guard acquireTransportRebuild(owner: "liveness") else { return }
        let rebuilt = rebuildTransportForLiveness()
        releaseTransportRebuild(owner: "liveness")
        if rebuilt {
            finishLivenessHold(reason: reason, evidence: "dựng lại được transport trên đường đã chọn")
        }
    }

    /// Thoát HOLD khi mạng đã về. KHÔNG đổi trạng thái UI khỏi `Connected`.
    private func finishLivenessHold(reason: String, evidence: String) {
        let counters = trafficCounters
        flowLock.lock()
        let pings = liveness?.holdPings ?? 0
        livenessHold = false
        livenessHoldReason = ""
        if var dog = liveness {
            dog.resetAfterRebuild(
                now: Date(),
                fromGo: counters?.fromGo ?? dog.lastFromGo,
                toGo: counters?.toGo ?? dog.baselineToGo,
                toGoDropped: counters?.toGoDropped ?? 0
            )
            liveness = dog
        }
        flowLock.unlock()
        setStatus(state: "up", code: nil, message: nil)
        RelayDiagnostics.shared.log(
            "hold: mạng về sau \(pings) lần ping (\(evidence)) — về STABLE mức cũ rồi chạy lại PROBE (\(reason))"
        )
    }

    /// Nhãn đường đã chọn để ghi log HOLD (host:port của transport đang giữ).
    private func currentPathLabel() -> String {
        guard let options = currentOptions else { return "đường-đã-chọn" }
        return "\(options.serverHost):\(options.serverPort)"
    }

    /// Dừng transport hiện tại rồi dựng lại y nguyên `currentOptions` (giữ fd + cầu). Khác đường
    /// ramp ở chỗ KHÔNG đổi số khai băng thông.
    private func rebuildTransportForLiveness() -> Bool {
        guard currentSession == livenessSession else { return false }
        guard let options = currentOptions else {
            RelayDiagnostics.shared.log(
                "tự phục hồi: chưa có currentOptions — không dựng lại được"
            )
            return false
        }
        flowLock.lock()
        let previous = transport
        transport = nil
        flowLock.unlock()
        // MỐC TỪNG BƯỚC (25/09/2026): ca "một chuỗi dựng lại kẹt >30 s" lặp lại thật (lưới an toàn
        // phải hạ tunnel lúc 30–32 s, hai lần trong một buổi). Không có mốc thì chỉ biết "kẹt ở đâu
        // đó trong hàm này"; có mốc thì lần sau đọc log là biết CHÍNH XÁC lời gọi nào không trả về.
        RelayDiagnostics.shared.log("tự phục hồi[b1]: dừng transport cũ…")
        previous?.stop()
        RelayDiagnostics.shared.log("tự phục hồi[b2]: transport cũ đã dừng")
        // `MobileStop()` KHÔNG chờ `serve()` kết thúc (xem `tools/hysteria-android/mobile.go`),
        // và sing-tun đóng fd khi `serve()` trả về ⇒ phải nhường một nhịp ngắn trước khi thay
        // cặp fd, nếu không lần `Serve(fd mới)` có thể đua với lần `Serve` cũ đang unwind.
        Thread.sleep(forTimeInterval: Self.rebuildSettleDelay)
        RelayDiagnostics.shared.log("tự phục hồi[b3]: đã nhường \(Self.rebuildSettleDelay)s")
        // fd MỚI + cầu MỚI (xem `installTunnelFD`): dùng lại fd cũ — thứ Go đã đóng — chính là
        // "lỗi thứ hai" làm cầu bỏ 100% gói sau mỗi lần dựng lại.
        RelayDiagnostics.shared.log("tự phục hồi[b4]: lấy cặp fd mới…")
        guard let freshFD = HysteriaTransport.resolveTunnelFD(from: packetFlow) else {
            RelayDiagnostics.shared.log(
                "tự phục hồi: KHÔNG lấy được cặp fd mới — không dựng lại được (giữ nguyên trạng thái)"
            )
            return false
        }
        RelayDiagnostics.shared.log("tự phục hồi[b5]: đã có cặp fd mới")
        // H2 cũng RETARGET (không dừng cầu) — dừng cầu làm mất vòng `readPackets` ⇒ dựng lại
        // "thành công" mà tunnel vẫn 0 gói (đúng dấu vết cũ: `toGo` đóng băng sau dựng lại).
        RelayDiagnostics.shared.log("tự phục hồi[b6]: retarget fd mới vào cầu…")
        retargetTunnelFD(freshFD)
        RelayDiagnostics.shared.log("tự phục hồi[b7]: retarget xong")
        let started = Date()
        RelayDiagnostics.shared.log("tự phục hồi[b8]: mở transport mới…")
        do {
            try startTransportRetrying(options: options)
        } catch {
            RelayDiagnostics.shared.log("tự phục hồi: dựng lại transport thất bại (\(error))")
            // Cầu mới không có transport thì phải dọn (fd tự tạo mà không đóng là rò fd mỗi lượt).
            stopBridge()
            if freshFD.ownedByExtension { close(freshFD.fd) }
            return false
        }
        activeUpKbps = options.upKbps
        activeDownKbps = options.downKbps
        activeBandwidthReason = bandwidth?.planReason
        RelayDiagnostics.shared.log(
            "tự phục hồi: transport mới đã lên sau "
                + "\(Self.seconds(Date().timeIntervalSince(started)))s (đã thay cặp fd + cầu mới)"
        )
        // Cầu mới ⇒ đặt lại mốc cho CẢ HAI bộ giám sát: nếu không, bộ giám sát lưu lượng sẽ thấy
        // "0 gói trong > 90 s" (vì bộ đếm cầu mới) và GỠ tunnel ngay sau khi vừa dựng lại xong —
        // đúng ca đo được 23/09/2026 lúc xem Netflix (dựng lại 15:47:59 ⇒ GỠ 15:48:03).
        restartLivenessAfterTransportSwap(reason: "tự phục hồi sống-còn")
        return true
    }

    private static func seconds(_ value: TimeInterval) -> String {
        String(format: "%.1f", value)
    }

    private func scheduleOverallTimeout(completion: @escaping (Error?) -> Void) {
        flowLock.lock()
        let expectedSession = session
        flowLock.unlock()
        let item = DispatchWorkItem { [weak self] in
            guard let self, !self.isStartCompleted else { return }
            RelayDiagnostics.shared.log(
                "hysteria: start quá \(Int(Self.startTimeout))s chưa xong — hạ tunnel (TUNNEL_START_FAILED)"
            )
            self.setStatus(
                state: "failed",
                code: Self.codeStartFailed,
                message: "Dựng tunnel hysteria2 quá \(Int(Self.startTimeout))s."
            )
            self.completeStart(
                completion,
                error: self.error(
                    code: Self.codeStartFailed,
                    message: "Hết thời gian \(Int(Self.startTimeout))s khi dựng transport hysteria2."
                ),
                session: expectedSession
            )
            self.cancelScheduledWork()
            self.flowLock.lock()
            let current = self.transport
            self.transport = nil
            self.flowLock.unlock()
            current?.stop()
            self.stopBridge()
            self.setTunnelNetworkSettings(nil) { _ in }
        }
        overallTimeout = item
        queue.asyncAfter(deadline: .now() + Self.startTimeout, execute: item)
    }

    // MARK: - Dọn dẹp

    /// Hạ tunnel vì lỗi SAU khi đã lên: gỡ network settings + `cancelTunnelWithError`.
    /// Đây là cách duy nhất để macOS trả mạng lại cho máy — để tunnel "Connected" là máy
    /// mất mạng mà biểu tượng vẫn xanh.
    private func teardownAndCancel(code: String, message: String) {
        cancelScheduledWork()
        flowLock.lock()
        let current = transport
        transport = nil
        flowLock.unlock()
        current?.stop()
        stopBridge()
        setTunnelNetworkSettings(nil) { [weak self] _ in
            guard let self else { return }
            RelayDiagnostics.shared.log(
                "giám sát: ĐÃ gỡ network settings (\(code)) — mạng của máy quay lại đường cũ, báo lỗi cho hệ thống"
            )
            self.cancelTunnelWithError(self.error(code: code, message: message))
        }
    }

    private func failStart(reason: String, code: String, completion: @escaping (Error?) -> Void) {
        RelayDiagnostics.shared.log("startTunnel thất bại (\(code)): \(reason)")
        log.error("startTunnel failed (\(code, privacy: .public)): \(reason, privacy: .public)")
        setStatus(state: "failed", code: code, message: reason)
        cancelScheduledWork()
        completeStart(completion, error: error(code: code, message: reason), session: currentSession)
    }

    private func error(code: String, message: String) -> NSError {
        NSError(
            domain: "com.privatevpn.tunnel",
            code: 1,
            userInfo: [
                NSLocalizedDescriptionKey: message,
                "TunnelDiagnosticCode": code
            ]
        )
    }

    /// Gọi `completionHandler` của NetworkExtension đúng MỘT lần cho mỗi lần start, và chỉ
    /// khi vẫn đang ở phiên hiện tại (callback của timeout phiên cũ không được chạm vào).
    private func completeStart(_ completion: @escaping (Error?) -> Void, error: Error?, session expected: Int) {
        flowLock.lock()
        let stale = expected != session
        let alreadyDone = startCompleted
        if !stale { startCompleted = true }
        flowLock.unlock()
        guard !stale, !alreadyDone else { return }
        overallTimeout?.cancel()
        overallTimeout = nil
        completion(error)
    }

    private func completeStop(_ completion: @escaping () -> Void) {
        flowLock.lock()
        let alreadyDone = stopCompleted
        stopCompleted = true
        flowLock.unlock()
        guard !alreadyDone else { return }
        completion()
    }

    private var currentSession: Int {
        flowLock.lock(); defer { flowLock.unlock() }
        return session
    }

    private var isStartCompleted: Bool {
        flowLock.lock(); defer { flowLock.unlock() }
        return startCompleted
    }

    private func currentTransport() -> HysteriaTransport? {
        flowLock.lock(); defer { flowLock.unlock() }
        return transport
    }

    private func cancelScheduledWork() {
        stopBandwidthSampling()
        bandwidth?.finish()
        cancelSupervisor()
        cancelLivenessWatchdog()
        flowLock.lock()
        supervisorStopped = true
        flowLock.unlock()
    }

    /// Dừng cầu `packetFlow ↔ fd` (nếu phiên này chạy ở chế độ bridge).
    private func stopBridge() {
        flowLock.lock()
        let current = bridge
        bridge = nil
        flowLock.unlock()
        current?.stop()
    }

    /// Giao một fd mới cho Go + dựng cầu `packetFlow ↔ fd` trên CẶP SOCKETPAIR MỚI.
    ///
    /// Dùng chung cho lúc MỞ phiên (`bringUp`) và lúc DỰNG LẠI transport (`rebuildTransportForLiveness`).
    ///
    /// VÌ SAO bắt buộc phải lấy cặp fd MỚI khi dựng lại (đây là "lỗi thứ hai" của đường dựng lại):
    ///   * fd giao cho Go là đầu của cặp `socketpair` do extension tạo; Go bọc nó bằng
    ///     `os.NewFile` (sing-tun `tun.Server{FileDescriptor: fd}`, xem
    ///     `tools/hysteria-android/mobile.go:225-260`) ⇒ khi `Serve()` kết thúc (sau `Stop()`)
    ///     **Go đóng fd đó**;
    ///   * `TunnelBridge.stop()` cũng `shutdown + close` đầu còn lại (`hostFd`).
    ///   ⇒ Dùng lại `tunnelFdForCounters` cũ sau một lần dựng lại là ghi/đọc trên fd ĐÃ CHẾT: cầu
    ///     vẫn chạy (nên watchdog thấy "có gói vào") nhưng gói bị bỏ 100% — đúng dấu vết đã đo:
    ///     `toGo` đóng băng, `toGoDropped` nhảy vọt ngay sau dòng
    ///     `bw: ramp đã áp sau khi dựng lại transport`. Vì vậy mọi lần dựng lại phải gọi hàm này
    ///     với fd mới, KHÔNG tái dùng fd cũ.
    private func installTunnelFD(_ tunnelFD: HysteriaTransport.TunnelFD) {
        // Cầu cũ phải dừng TRƯỚC khi thay cặp fd: nó đang giữ `hostFd` cũ (không dừng là rò fd),
        // và callback `readPackets` đang chờ của nó phải được nhả trước khi cầu mới đọc.
        stopBridge()
        flowLock.lock()
        tunnelFdForCounters = tunnelFD.fd
        flowLock.unlock()
        if let hostFd = tunnelFD.hostFd {
            let created = TunnelBridge(flow: packetFlow, hostFd: hostFd, log: log)
            flowLock.lock()
            bridge = created
            flowLock.unlock()
            created.start()
        }
        RelayDiagnostics.shared.log(
            "bridge: giao fd mới cho Go — fd=\(tunnelFD.fd) qua \(tunnelFD.source.rawValue)"
                + (tunnelFD.hostFd.map { " (hostFd \($0))" } ?? "")
        )
    }

    /// Số gói thật đã đi qua tunnel (nil khi không đọc được nguồn nào) — watchdog dùng số này.
    private var bridgeCounters: TunnelBridge.Counters? {
        flowLock.lock()
        let current = bridge
        flowLock.unlock()
        return current?.snapshot
    }

    /// Bộ đếm gói THẬT đã đi qua tunnel, chuẩn hoá cho cả hai nền tảng.
    ///
    /// Vì sao cần lớp này: watchdog chỉ được phép tự gỡ tunnel khi có BẰNG CHỨNG HỎNG nhìn từ
    /// gói của CHÍNH MÁY (xem `startTrafficSupervisor`), mà nguồn bằng chứng có hai loại:
    ///   * cầu `packetFlow ↔ fd` tự đếm (`TunnelBridge`) — đường chạy của macOS VÀ iOS, có cả
    ///     SYN/SYN-ACK nên phát hiện TCP blackhole đúng như thiết kế (`countsTCPHandshake = true`).
    ///   * bộ đếm gói của interface utun (`HysteriaTransport.utunPacketCounters`) — chỉ dùng khi
    ///     phiên KHÔNG chạy cầu (đường lùi hiếm: fd utun lấy được qua KVC); có hai chiều gói
    ///     nhưng KHÔNG có cờ TCP.
    private struct TrafficCounters {
        /// Nguồn số liệu — ghi thẳng vào log để lần sau biết con số đến từ đâu.
        var origin: String
        /// Gói MÁY đưa vào tunnel.
        var toGo: Int
        /// Gói tunnel trả về MÁY.
        var fromGo: Int
        /// Gói MÁY đã gửi mà cầu `packetFlow↔fd` phải BỎ (`write` vào fd của Go lỗi/không ghi
        /// hết) — xem `TunnelBridge.forwardToGo`. Đây là phần chứng minh "máy VẪN gửi" khi tầng
        /// Go ngừng đọc fd: lúc đó `toGo` đứng yên còn `toGoDropped` leo (H2, 24/09/2026).
        var toGoDropped = 0
        var tcpSynToGo = 0
        var tcpSynAckFromGo = 0
        var tcpRstFromGo = 0
        /// Có đếm được SYN/SYN-ACK/RST không (macOS có, iOS không).
        var countsTCPHandshake = false
        /// BYTE hai chiều (chỉ cầu `packetFlow↔fd` mới có) — dùng cho luật GOODPUT: node có thể
        /// "sống" (vẫn nhỏ giọt gói) nhưng chở ≈0 byte, và luật im-lặng không bắt được ca đó.
        var fromGoBytes = 0
        var toGoBytes = 0

        /// "Máy vẫn gửi" = gói vào được tầng Go + gói cầu phải bỏ vì Go ngừng đọc.
        var toGoOffered: Int { toGo + toGoDropped }
    }

    private var trafficCounters: TrafficCounters? {
        if let counters = bridgeCounters {
            return TrafficCounters(
                origin: "cầu packetFlow↔fd",
                toGo: counters.toGo,
                fromGo: counters.fromGo,
                toGoDropped: counters.toGoDropped,
                tcpSynToGo: counters.tcpSynToGo,
                tcpSynAckFromGo: counters.tcpSynAckFromGo,
                tcpRstFromGo: counters.tcpRstFromGo,
                countsTCPHandshake: true,
                fromGoBytes: counters.fromGoBytes,
                toGoBytes: counters.toGoBytes
            )
        }
        #if os(iOS)
        flowLock.lock()
        let fd = tunnelFdForCounters
        flowLock.unlock()
        guard let fd, let counters = HysteriaTransport.utunPacketCounters(fd: fd) else { return nil }
        return TrafficCounters(
            origin: "bộ đếm interface \(counters.ifname) (iOS)",
            toGo: counters.toGo,
            fromGo: counters.fromGo
        )
        #else
        return nil
        #endif
    }

    /// Áp settings rồi CHỜ kết quả (hàm chạy trên `queue`, không phải main thread).
    private func applySettings(_ settings: NEPacketTunnelNetworkSettings) -> Bool {
        let semaphore = DispatchSemaphore(value: 0)
        let result = AppliedSettings()
        setTunnelNetworkSettings(settings) { error in
            if let error {
                RelayDiagnostics.shared.log("hysteria: setTunnelNetworkSettings lỗi: \(error.localizedDescription)")
            }
            result.ok = error == nil
            semaphore.signal()
        }
        if semaphore.wait(timeout: .now() + 8) == .timedOut {
            RelayDiagnostics.shared.log("hysteria: setTunnelNetworkSettings không trả về sau 8s")
            return false
        }
        return result.ok
    }

    private func clearSettings() {
        setTunnelNetworkSettings(nil) { _ in }
    }

    private func setStatus(state: String, code: String?, message: String?) {
        flowLock.lock()
        statusState = state
        statusCode = code
        statusMessage = message
        flowLock.unlock()
    }

    // MARK: - Cấu hình từ app

    /// Đọc `providerConfiguration["hysteria"]` do app truyền (xem
    /// `VPNManagerMac.prepareConfiguration`).
    ///
    /// Trả `.failure(reason)` với lý do CỤ THỂ khi thiếu khoá bắt buộc: extension không có
    /// UI, im lặng ở đây nghĩa là khách chỉ thấy "Connected" rồi không có mạng.
    private func hysteriaOptions() -> Result<HysteriaTransport.Options, ConfigFailure> {
        guard let raw = protocolConfiguration as? NETunnelProviderProtocol else {
            return .failure(ConfigFailure("profile VPN không phải NETunnelProviderProtocol"))
        }
        guard let dict = raw.providerConfiguration?["hysteria"] as? [String: Any] else {
            return .failure(ConfigFailure("providerConfiguration thiếu khoá \"hysteria\" (app chưa truyền cấu hình hysteria2)"))
        }
        guard let serverHost = dict["serverHost"] as? String, !serverHost.isEmpty else {
            return .failure(ConfigFailure("thiếu \"serverHost\" trong cấu hình hysteria2"))
        }
        guard let password = dict["password"] as? String, !password.isEmpty else {
            return .failure(ConfigFailure("thiếu \"password\" trong cấu hình hysteria2 (xem HysteriaPassword trong Info.plist của app)"))
        }

        // Relay: ưu tiên "relayURL" của app, rồi tới danh sách dự phòng; không có cả hai
        // thì lùi về hằng số dùng chung (HysteriaDefaults) — node-2 trước, node-1 sau.
        var candidates: [URL] = []
        if let list = dict["relayURLCandidates"] as? [String] {
            candidates = list.compactMap { URL(string: $0) }
        }
        if candidates.isEmpty {
            candidates = HysteriaDefaults.relayURLCandidates.compactMap { URL(string: $0) }
        }
        let relayURL: URL
        if let string = dict["relayURL"] as? String, let url = URL(string: string) {
            relayURL = url
        } else if let first = candidates.first {
            relayURL = first
            candidates.removeFirst()
        } else {
            return .failure(ConfigFailure("thiếu \"relayURL\" và cũng không có relay dự phòng nào"))
        }

        let port = (dict["serverPort"] as? Int).flatMap { UInt16(exactly: $0) } ?? HysteriaDefaults.serverPort

        // Ghi đè CHẨN ĐOÁN từ `Documents/hysteria-diag.txt` (chỉ có khi người đo tạo file —
        // xem `tools/hysteria-apple/measure-matrix.sh`): đổi relay/MTU/băng thông khai cho
        // Brutal CC mà không phải build lại app. Không có file ⇒ đúng cấu hình sản phẩm.
        var relayOverride: URL?
        if let raw = HysteriaTransport.diagnosticFlag("relay"), let url = URL(string: raw) {
            relayOverride = url
            RelayDiagnostics.shared.log("diag: ép relay = \(raw)")
        }
        let diagUp = HysteriaTransport.diagnosticFlag("upKbps").flatMap { Int($0) }
        let diagDown = HysteriaTransport.diagnosticFlag("downKbps").flatMap { Int($0) }
        let diagMTU = HysteriaTransport.diagnosticFlag("mtu").flatMap { Int($0) }
        if diagUp != nil || diagDown != nil || diagMTU != nil {
            RelayDiagnostics.shared.log(
                "diag: ép upKbps=\(diagUp.map(String.init) ?? "-") downKbps=\(diagDown.map(String.init) ?? "-") mtu=\(diagMTU.map(String.init) ?? "-")"
            )
        }

        return .success(HysteriaTransport.Options(
            relayURL: relayOverride ?? relayURL,
            relayURLCandidates: relayOverride == nil ? candidates : [],
            serverHost: serverHost,
            serverPort: port,
            password: password,
            obfs: dict["obfs"] as? String ?? "",
            // Số khai cho Brutal CC: thứ tự ưu tiên (mạnh nhất trước)
            //   1. ghi đè CHẨN ĐOÁN trong Documents/hysteria-diag.txt (người đo ép tay);
            //   2. số ĐỘNG của `HysteriaBandwidthControl` (bộ nhớ theo mạng / số đo phiên);
            //   3. số app truyền trong providerConfiguration — app chỉ biết nấc TĨNH
            //      (`HysteriaDefaults`), nên đứng SAU số động;
            //   4. mặc định HysteriaDefaults — y như trước khi có feature này.
            // Vì sao (2) phải TRƯỚC (3): app LUÔN truyền `upKbps`/`downKbps` = nấc tĩnh
            // (xem `VPNManager.hysteriaConfiguration`), nên để (3) trước là số động không bao
            // giờ tới được Go — đo thật trên iPad 19/09: `bw: measured=1069 declared up=30000
            // down=100000` dù plan động đã hạ xuống hàng trăm kbps.
            upKbps: diagUp ?? bandwidth?.upKbps ?? dict["upKbps"] as? Int ?? HysteriaDefaults.upKbps,
            downKbps: diagDown ?? bandwidth?.downKbps ?? dict["downKbps"] as? Int ?? HysteriaDefaults.downKbps,
            mtu: diagMTU ?? dict["mtu"] as? Int ?? HysteriaDefaults.mtu,
            // CIDR cho Go (netip.ParsePrefix) — xem HysteriaDefaults.tunIPv4CIDR.
            ipv4: HysteriaDefaults.tunIPv4CIDR,
            ipv6: HysteriaDefaults.tunIPv6CIDR
        ))
    }
}

/// Hộp nhỏ để lấy kết quả từ closure của `setTunnelNetworkSettings` (closure của
/// NetworkExtension không `@Sendable`, nên không dùng được biến local `var` qua
/// `DispatchSemaphore` mà không có cảnh báo Swift 6).
private final class AppliedSettings: @unchecked Sendable {
    var ok = false
}

/// Hộp nhận `NWPath` ĐẦU TIÊN có interface của `NWPathMonitor`.
///
/// Cần hộp + khoá vì `pathUpdateHandler` chạy trên `bandwidthQueue` còn
/// `prepareBandwidthSession` chờ ở luồng của NetworkExtension (xem chú thích ở đó), và chỉ
/// bản cập nhật ĐẦU TIÊN mới được tính (`store` trả `false` cho các lần sau ⇒ chỉ `signal`
/// một lần, không đua).
private final class BandwidthPathBox: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: NWPath?

    /// Lưu path; trả `true` đúng một lần — lần gọi ĐẦU TIÊN.
    func store(_ path: NWPath) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard stored == nil else { return false }
        stored = path
        return true
    }

    var path: NWPath? {
        lock.lock(); defer { lock.unlock() }
        return stored
    }
}
