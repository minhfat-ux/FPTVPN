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
    /// Chốt theo A5: "im ≥15 s VÀ bất đối xứng" đã đủ kết luận ⇒ 1 nhịp, KHÔNG chờ 3 nhịp như
    /// bản Windows (60 s × 3 = 180 s mới phát hiện, vượt xa mốc ≤15 s của yêu cầu).
    private static let livenessStrikesToRebuild = 1
    /// Trần số lần TỰ DỰNG LẠI transport trước khi chịu thua và gỡ tunnel (giống Windows).
    private static let livenessRebuildMax = 3
    /// Nhịp chờ trước mỗi lượt dựng lại — Windows dùng đúng 2s/5s/10s.
    private static let livenessRebuildBackoff: [TimeInterval] = [2, 5, 10]

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
    /// Phiên đã dừng: mọi callback `asyncAfter` còn treo phải tự bỏ.
    private var livenessCancelled = false
    /// Pha HOLD (chủ dự án chốt 22/09/2026): hết mọi đường thì GIỮ đường đã chọn + tunnel vẫn
    /// `Connected` + ping lại mỗi nhịp chờ mạng về — KHÔNG `closeTun()`/teardown.
    private var livenessHold = false
    /// Lý do vào HOLD — chỉ dùng để ghi log.
    private var livenessHoldReason = ""

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
    /// Chủ sở hữu ĐỘC QUYỀN việc dựng lại transport: `"bandwidth"` (ramp) hoặc `"liveness"`
    /// (watchdog sống-còn). Cả hai đều thay transport trên cùng fd/cầu nên chồng nhau là hỏng;
    /// một thời điểm chỉ một đường được giữ.
    private var transportRebuildOwner: String?
    private let rebuildLock = NSLock()
    /// Mốc đã ghi bộ nhớ lần trước (để chốt đỉnh đo được ngay cả khi tunnel bị đứt).
    private var measuredPeakDownKbps = 0
    /// Nhịp lấy mẫu byte: 1s (yêu cầu "đo trong ≤3 giây" ⇒ mẫu thứ 2–3 đã có số nếu có traffic).
    private static let bandwidthSampleInterval: TimeInterval = 1
    /// Trần số lần dựng lại transport vì ramp trong MỘT phiên (ramp là tối ưu, không được
    /// phép thành vòng lặp phá tunnel). Hết lượt ⇒ số mới đã nằm trong bộ nhớ, áp ở lần sau.
    private static let rampMaxAttempts = 5
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
    /// Dải IPv6 TQ (cn6.txt): TQ đi thẳng, IPv6 còn lại vào tunnel để CHẶN (server không có IPv6).
    private var chinaExcludedRoutesV6: [NEIPv6Route] = []

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

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        RelayDiagnostics.shared.log("stopTunnel: reason=\(reason.rawValue)")
        log.log(level: .default, "stopTunnel: reason \(reason.rawValue)")
        cancelScheduledWork()
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
        completionHandler?(try? JSONSerialization.data(withJSONObject: report))
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

        flowLock.lock()
        tunnelFdForCounters = tunnelFD.fd
        flowLock.unlock()

        // Chế độ bắc cầu (đường chạy của CẢ HAI nền tảng): gói đi qua `NEPacketTunnelFlow`
        // (API công khai) rồi mới vào fd.
        if let hostFd = tunnelFD.hostFd {
            let created = TunnelBridge(flow: packetFlow, hostFd: hostFd, log: log)
            flowLock.lock()
            bridge = created
            flowLock.unlock()
            created.start()
        }

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
        startLivenessWatchdog()
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
            let cached4 = ChinaRouteBypass.excludedRoutes(from: ChinaRouteBypass.cached())
            let cached6 = ChinaRouteBypass.excludedRoutesV6(from: ChinaRouteBypass.cachedIPv6())
            self.queue.async {
                guard session == self.currentSession else { return }
                self.applyChinaRoutes(cached4, cached6)
            }
            ChinaRouteBypass.refresh { [weak self] cidrs in
                guard let self else { return }
                let fresh = ChinaRouteBypass.excludedRoutes(from: cidrs)
                self.queue.async {
                    guard session == self.currentSession else { return }
                    self.applyChinaRoutes(fresh, self.chinaExcludedRoutesV6)
                }
            }
            ChinaRouteBypass.refreshIPv6 { [weak self] cidrs in
                guard let self else { return }
                let fresh = ChinaRouteBypass.excludedRoutesV6(from: cidrs)
                self.queue.async {
                    guard session == self.currentSession else { return }
                    self.applyChinaRoutes(self.chinaExcludedRoutes, fresh)
                }
            }
        }
        #endif
    }

    /// Áp danh sách dải IP TQ (IPv4 + IPv6) vào settings đang chạy (chạy trên `queue`).
    /// Rỗng/không đổi ⇒ thôi. Một danh sách đổi thì áp lại cả hai (settings là một khối).
    private func applyChinaRoutes(_ routes4: [NEIPv4Route], _ routes6: [NEIPv6Route]) {
        #if os(iOS)
        guard let options = currentOptions else { return }
        let changed = (!routes4.isEmpty && routes4.count != chinaExcludedRoutes.count)
            || (!routes6.isEmpty && routes6.count != chinaExcludedRoutesV6.count)
        guard changed else { return }
        if !routes4.isEmpty { chinaExcludedRoutes = routes4 }
        if !routes6.isEmpty { chinaExcludedRoutesV6 = routes6 }
        let applied = applySettings(networkSettings(options: options))
        RelayDiagnostics.shared.log(
            "china: A7 nạp \(chinaExcludedRoutes.count) dải IPv4 + \(chinaExcludedRoutesV6.count) dải IPv6 TQ"
                + " vào excludedRoutes (áp lại settings=\(applied))"
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
        bandwidthLock.lock()
        bandwidthPathMonitor?.cancel()
        bandwidthPathMonitor = monitor
        bandwidthLock.unlock()
        let state = BandwidthControl.SessionState(identity: identity)
        bandwidth = state
        let plan = state.plan
        RelayDiagnostics.shared.log(
            "bw: chuẩn bị phiên — net=\(identity.logLabel) "
                + "(ssid=\(identity.ssid ?? "không có quyền vị trí/entitlement"), "
                + "router=\(identity.routerMAC ?? "-"), if=\(identity.interfaceName)) "
                + "declared up=\(plan.upKbps) down=\(plan.downKbps) reason=\(plan.reason.rawValue)"
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
        let decision = bandwidth.sample(
            bytes: bytes,
            packetsIn: counters?.fromGo ?? 0,
            packetsOut: counters?.toGo ?? 0,
            at: now,
            path: bandwidthPath
        )
        let averageDown = bandwidth.lastAverageDownKbps
        if averageDown >= Self.bandwidthLogMinKbps, averageDown != measuredPeakDownKbps {
            measuredPeakDownKbps = averageDown
            logDeclaration(key: bandwidth.key)
        }
        if let decision {
            logRampDecision(decision, key: bandwidth.key)
        }
        // Thay đổi đang chờ phải được THỬ ÁP ở MỌI nhịp, không chỉ nhịp sinh ra quyết định:
        // quyết định kẹp chỉ sinh ra MỘT lần, còn việc áp nó có thể phải chờ tunnel rảnh (hoặc
        // tới hạn buộc áp — xem `BandwidthControl.pendingForceAfter`). Chỉ thử khi có quyết
        // định mới là bỏ rơi đúng ca tunnel không bao giờ rảnh ⇒ số khai sai nằm lại trong
        // transport và đường nghẽn cho tới khi chết.
        if bandwidth.pendingChange {
            bandwidthLock.lock()
            bandwidthRampPending = true
            bandwidthLock.unlock()
            applyBandwidthRampIfIdle(
                reason: bandwidth.pendingReason?.label ?? BandwidthControl.Reason.probe.label
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
            + "best=\(bandwidth.peakDownKbps)"
        if plan.upKbps != activeUpKbps || plan.downKbps != activeDownKbps {
            line += " plan=up\(plan.upKbps)/down\(plan.downKbps) reason-plan=\(plan.reason.label)"
            if bandwidth.pendingChange, let since = bandwidth.pendingSince {
                line += " pending=\(Int(Date().timeIntervalSince(since)))s"
            }
        }
        if let event { line += " (\(event))" }
        RelayDiagnostics.shared.log(line)
        if event != nil { log.log(level: .default, "\(line, privacy: .public)") }
    }

    /// Dòng telemetry khi ramp — yêu cầu `bw: ramp net=… observed=… old=… new=… reason=…`.
    private func logRampDecision(_ decision: BandwidthControl.RampDecision, key: String) {
        let line = "bw: ramp net=\(key) observed=\(decision.observedKbps) old=\(decision.oldUpKbps)/"
            + "\(decision.oldDownKbps) new=\(decision.newUpKbps)/\(decision.newDownKbps) "
            + "reason=\(decision.logReason)"
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

    /// Dựng lại transport để áp số khai mới — CHỈ khi tunnel rảnh (xem ràng buộc ở file
    /// `HysteriaBandwidthControl`). Trả về true khi đã dựng lại và lên được.
    ///
    /// Vì sao phải dựng lại cả relay + QUIC: số khai được Go đọc MỘT LẦN trong
    /// `MobileConnect` (`MaxTx/MaxRx` của Brutal CC, xem `tools/hysteria-android/mobile.go`)
    /// — không có API đổi tại chỗ. Vòng đứt cũ đã chạy thật trên đường chẩn đoán của macOS
    /// (`probeThroughTunnel` dừng transport rồi dựng lại trong cùng tiến trình), nhưng đây là
    /// đường mới trên iOS nên có TRẦN SỐ LẦN THỬ (`rampMaxAttempts`): ramp là tối ưu, không
    /// được phép thành vòng lặp phá tunnel.
    @discardableResult
    private func applyBandwidthRampIfIdle(reason: String) -> Bool {
        guard BandwidthControl.allowsTransportRebuild else { return false }
        guard let bandwidth, bandwidth.pendingChange else { return false }
        guard isBandwidthRampPending else { return false }
        // Đang HOLD (hết đường): KHÔNG dựng lại vì lý do tốc độ — giữ nguyên đường đã chọn
        // (chốt 22/09/2026).
        guard !isLivenessHolding else { return false }
        // Tự phục hồi sống-còn đang dựng lại transport: để nó làm xong, đừng tranh fd.
        guard !isLivenessRecovering else { return false }
        // HẠ số khai mà tunnel KHÔNG BAO GIỜ rảnh (đang flood) ⇒ buộc áp sau `pendingForceAfter`
        // (xem chú thích hằng số): đây là việc CHỮA, không phải tối ưu, nên được phép đứt stream
        // đang mở — để nguyên là số khai sai nằm lại trong transport cho tới khi tunnel chết.
        // TĂNG thì vẫn chỉ áp ở ranh giới rảnh.
        let forced = bandwidth.pendingForceExpired(Date())
        if !forced, !isBandwidthIdle() { return false }
        // Chốt "đang dựng lại" trước mọi việc nặng: nhịp watchdog (15s) và nhịp lấy mẫu (1s) có
        // thể cùng gọi hàm này ở hai hàng đợi khác nhau, và watchdog sống-còn cũng dựng lại
        // transport — độc quyền theo chủ sở hữu (xem `acquireTransportRebuild`).
        guard acquireTransportRebuild(owner: "bandwidth") else { return false }
        defer { releaseTransportRebuild(owner: "bandwidth") }
        let plan = bandwidth.plan
        if forced {
            RelayDiagnostics.shared.log(
                "bw: BUỘC áp số khai HẠ sau \(Int(BandwidthControl.pendingForceAfter))s tunnel không rảnh "
                    + "(đang chở traffic) — đứt stream đang mở để hết flood, "
                    + "up=\(activeUpKbps)->\(plan.upKbps) down=\(activeDownKbps)->\(plan.downKbps) "
                    + "reason=\(bandwidth.pendingReason?.label ?? plan.reason.label)"
            )
        }
        guard plan.upKbps != activeUpKbps || plan.downKbps != activeDownKbps else {
            // Số khai không đổi (ví dụ chỉ đổi mạng): không cần đứt stream, chỉ chốt lại.
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
        // Số lần thử có trần: hết lượt thì chốt vào bộ nhớ để lần kết nối sau khai sẵn số mới.
        bandwidthLock.lock()
        let attempt = bandwidthRampAttempts
        bandwidthRampAttempts += 1
        bandwidthLock.unlock()
        let allowed = attempt < Self.rampMaxAttempts
        let message = "bw: ramp \(reason) net=\(bandwidth.key) up=\(activeUpKbps)->\(plan.upKbps) "
            + "down=\(activeDownKbps)->\(plan.downKbps)"
            + (allowed ? "" : " — hết \(Self.rampMaxAttempts) lượt dựng lại của phiên, để dành lần kết nối sau")
        RelayDiagnostics.shared.log(message)
        log.log(level: .default, "\(message, privacy: .public)")
        guard allowed else {
            bandwidth.finish()
            markBandwidthRampNotPending()
            return false
        }
        guard let rebuilt = rebuildTransportForBandwidth(), rebuilt else { return false }
        bandwidth.applied(
            BandwidthControl.RampDecision(
                multiplierUp: nil,
                multiplierDown: nil,
                reason: bandwidth.pendingReason ?? plan.reason,
                observedKbps: bandwidth.peakDownKbps,
                oldUpKbps: activeUpKbps,
                oldDownKbps: activeDownKbps,
                newUpKbps: plan.upKbps,
                newDownKbps: plan.downKbps
            ),
            ceiling: nil
        )
        markBandwidthRampNotPending()
        return true
    }

    /// Dừng transport cũ rồi dựng lại với số khai mới (giữ nguyên fd đã giao cho Go: đầu của
    /// cặp socketpair — cầu `TunnelBridge` vẫn chạy nguyên, chỉ relay + QUIC được dựng lại).
    ///
    /// Dùng CHUNG cho iOS và macOS (parity 1.4.1): fd của macOS cũng là cặp socketpair qua
    /// `TunnelBridge` (`HysteriaTransport.resolveTunnelFD`) nên dựng lại transport trên cùng fd
    /// là đủ — nhờ vậy số đo trong phiên được áp NGAY, không phải chờ lần kết nối sau.
    private func rebuildTransportForBandwidth() -> Bool? {
        guard let bandwidth, var options = currentOptions else { return nil }
        let plan = bandwidth.plan
        options.upKbps = plan.upKbps
        options.downKbps = plan.downKbps
        currentOptions = options
        flowLock.lock()
        let previous = transport
        transport = nil
        flowLock.unlock()
        previous?.stop()
        let started = Date()
        do {
            // Có THỬ LẠI vì `MobileStop` của Go không chờ `serve()` kết thúc: client cũ có thể
            // còn trong `active` vài trăm ms ⇒ `MobileConnect` báo "hysteria client already
            // running" (đua thật, xem `tools/hysteria-android/mobile.go` hàm `Stop`).
            try startTransportRetrying(options: options)
        } catch {
            let message = "bw: dựng lại transport với số khai mới THẤT BẠI (\(error)) — "
                + "quay về số khai đang chạy để không mất mạng"
            RelayDiagnostics.shared.log(message)
            log.error("\(message, privacy: .public)")
            var fallback = options
            fallback.upKbps = bandwidth.upKbps
            fallback.downKbps = bandwidth.downKbps
            currentOptions = fallback
            // Đường lùi cũng phải thử lại: để tunnel không transport là máy mất mạng, và
            // watchdog chỉ gỡ tunnel chứ không dựng lại được.
            do {
                try startTransportRetrying(options: fallback)
            } catch {
                RelayDiagnostics.shared.log(
                    "bw: KHÔNG dựng lại được transport (\(error)) — chuyển HOLD, GIỮ tunnel "
                        + "(chốt 22/09/2026: không teardown vì lý do tốc độ)"
                )
                enterLivenessHold(reason: "ramp băng thông không dựng lại được transport")
            }
            return false
        }
        activeUpKbps = options.upKbps
        activeDownKbps = options.downKbps
        activeBandwidthReason = bandwidth.planReason
        RelayDiagnostics.shared.log(
            "bw: ramp đã áp sau khi dựng lại transport (mất "
                + "\(Self.seconds(Date().timeIntervalSince(started)))s, tunnel đang rảnh)"
        )
        logDeclaration(key: bandwidth.key, event: "ramp đã áp")
        return true
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
        #if os(iOS)
        // LAN + link-local đi THẲNG ra đường vật lý, không vào tunnel: đưa vào tunnel thì
        // router/máy in trong nhà mất kết nối. Giống bản iOS trước đây
        // (`PacketTunnelProvider.startHysteriaSession`). macOS cố ý KHÔNG đặt danh sách này:
        // ở đó đã đo excludedRoutes làm lệch route của NE (xem chú thích ở `ipv4.includedRoutes`).
        var excluded: [NEIPv4Route] = [
            NEIPv4Route(destinationAddress: "10.0.0.0", subnetMask: "255.0.0.0"),
            NEIPv4Route(destinationAddress: "172.16.0.0", subnetMask: "255.240.0.0"),
            NEIPv4Route(destinationAddress: "192.168.0.0", subnetMask: "255.255.0.0"),
            NEIPv4Route(destinationAddress: "169.254.0.0", subnetMask: "255.255.0.0"),
        ]
        // A7 — app TQ đi đường riêng: dải IP TQ (đã nạp ở nền) đi thẳng, không qua tunnel.
        excluded.append(contentsOf: chinaExcludedRoutes)
        ipv4.excludedRoutes = excluded
        #endif
        settings.ipv4Settings = ipv4

        #if os(iOS)
        // A7 IPv6 (chủ dự án chốt 22/09 — WIN `92f60c9`): server KHÔNG có IPv6 nên KHÔNG thể đưa
        // `::/0` "vào tunnel rồi đi ra" (sẽ đen hết IPv6). Thiết kế đúng: **IPv6 TQ đi THẲNG, IPv6
        // còn lại CHẶN**. Đặt `::/0` vào `includedRoutes` (gói IPv6 lạ vào tunnel; core không có
        // IPv6 ⇒ bị chặn, KHÔNG rò IP thật) + dải TQ trong `excludedRoutes` (đi thẳng). Trước đây
        // provider không có `ipv6Settings` ⇒ MỌI IPv6 đi thẳng, rò IP thật.
        let ipv6 = NEIPv6Settings(
            addresses: [HysteriaDefaults.tunIPv6Address],
            networkPrefixLengths: [NSNumber(value: HysteriaDefaults.tunIPv6PrefixLength)]
        )
        ipv6.includedRoutes = [NEIPv6Route.default()]
        ipv6.excludedRoutes = chinaExcludedRoutesV6
        settings.ipv6Settings = ipv6
        #endif

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
        trafficConfirmed = false
        probeInFlight = false
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
        let synToGo = counters?.tcpSynToGo ?? 0
        let synAckFromGo = counters?.tcpSynAckFromGo ?? 0
        let rstFromGo = counters?.tcpRstFromGo ?? 0
        let countsTCPHandshake = counters?.countsTCPHandshake ?? false
        let frames = currentTransport()?.relayFrameCounts
        let receivedFrames = frames?.received ?? 0
        let sentFrames = frames?.sent ?? 0

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

        // (2) Không có gói nào qua tunnel sau mốc.
        if counters != nil, elapsed >= Self.firstTrafficDeadline, inPackets == 0, outPackets == 0 {
            selfRescue(
                reason: "sau \(Int(elapsed))s KHÔNG có gói nào của máy đi qua tunnel (cả hai chiều đều 0; "
                    + "relay frame gửi \(sentFrames)/nhận \(receivedFrames))"
            )
            return
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
        let timer = DispatchSource.makeTimerSource(queue: queue)
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
        flowLock.unlock()
        timer.resume()
        RelayDiagnostics.shared.log(
            "giám sát sống-còn: bật SUỐT phiên — nhịp \(Int(Self.livenessInterval))s; chiều về im "
                + "\(Int(Self.livenessSilenceLimit))s VÀ máy vẫn gửi gói mới kết luận; đủ "
                + "\(Self.livenessStrikesToRebuild) strike ⇒ tự dựng lại tối đa "
                + "\(Self.livenessRebuildMax) lần (chờ 2/5/10s)"
        )
    }

    private func cancelLivenessWatchdog() {
        flowLock.lock()
        let timer = livenessTimer
        livenessTimer = nil
        livenessCancelled = true
        livenessRecovering = false
        livenessHold = false
        livenessHoldReason = ""
        liveness = nil
        flowLock.unlock()
        // Nhả quyền dựng lại nếu chuỗi phục hồi còn treo (idempotent, chỉ nhả đúng chủ).
        releaseTransportRebuild(owner: "liveness")
        timer?.cancel()
    }

    /// Một nhịp: đọc bộ đếm, hỏi `LivenessWatchdog`, thi hành quyết định.
    private func livenessStep() {
        flowLock.lock()
        let expected = livenessSession
        let cancelled = livenessCancelled
        let recovering = livenessRecovering
        flowLock.unlock()
        guard !cancelled, expected == currentSession else {
            cancelLivenessWatchdog()
            return
        }
        guard !recovering else { return }
        // Pha HOLD: KHÔNG dựng lại ngay, KHÔNG bao giờ teardown — giữ đường đã chọn rồi ping
        // lại mỗi nhịp cho tới khi mạng về (chốt 22/09/2026).
        if isLivenessHolding {
            holdStep()
            return
        }
        // KHÔNG đọc bộ đếm trong lúc giữ `flowLock`: `trafficCounters` tự lấy khoá này.
        let counters = trafficCounters
        let rampInFlight = isBandwidthRebuildInFlight
        flowLock.lock()
        var verdict: LivenessWatchdog.Verdict = .idle
        if var dog = liveness {
            verdict = dog.tick(
                now: Date(),
                fromGo: counters?.fromGo,
                toGo: counters?.toGo,
                rampInFlight: rampInFlight
            )
            liveness = dog
        }
        flowLock.unlock()

        switch verdict {
        case .idle, .alive:
            return
        case .strike(let count):
            RelayDiagnostics.shared.log(
                "giám sát sống-còn: chiều về im ≥\(Int(Self.livenessSilenceLimit))s nhưng máy vẫn "
                    + "gửi gói vào tunnel — strike \(count)/\(Self.livenessStrikesToRebuild) "
                    + "(gói vào \(counters?.toGo ?? 0), ra \(counters?.fromGo ?? 0), nguồn "
                    + "\(counters?.origin ?? "không đọc được"))"
            )
        case .rebuild:
            RelayDiagnostics.shared.log(
                "giám sát sống-còn: đủ \(Self.livenessStrikesToRebuild) strike — TỰ DỰNG LẠI transport"
            )
            beginTransportRecovery(
                reason: "tunnel sống nhưng không chở gói (chiều về im "
                    + "≥\(Int(Self.livenessSilenceLimit))s mà máy vẫn gửi)"
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

    /// Bắt đầu chuỗi tự dựng lại transport có trần (3 lần, chờ 2/5/10s). Không chồng lên chuỗi
    /// khác và không tranh fd với đường ramp băng thông (độc quyền theo `transportRebuildOwner`).
    private func beginTransportRecovery(reason: String) {
        flowLock.lock()
        let already = livenessRecovering
        let cancelled = livenessCancelled
        if !already {
            livenessRecovering = true
            livenessRebuildAttempts = 0
        }
        flowLock.unlock()
        guard !already, !cancelled else { return }
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
        RelayDiagnostics.shared.log(
            "tự phục hồi: \(reason) — thử dựng lại tối đa \(Self.livenessRebuildMax) lần "
                + "(chờ 2/5/10s), phiên \(currentSession)"
        )
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
        guard attempts < Self.livenessRebuildMax else {
            finishTransportRecovery(gaveUp: true, reason: reason)
            return
        }
        let next = attempts + 1
        let wait = Self.livenessRebuildBackoff[
            min(next - 1, Self.livenessRebuildBackoff.count - 1)
        ]
        flowLock.lock()
        livenessRebuildAttempts = next
        flowLock.unlock()
        RelayDiagnostics.shared.log(
            "tự phục hồi: lần \(next)/\(Self.livenessRebuildMax) — chờ \(Int(wait))s rồi dựng lại"
        )
        queue.asyncAfter(deadline: .now() + wait) { [weak self] in
            self?.runTransportRecoveryAttempt(next, expected: expected, reason: reason)
        }
    }

    private func runTransportRecoveryAttempt(_ attempt: Int, expected: Int, reason: String) {
        flowLock.lock()
        let cancelled = livenessCancelled
        flowLock.unlock()
        guard !cancelled, expected == currentSession else { return }
        if rebuildTransportForLiveness() {
            let counters = trafficCounters
            flowLock.lock()
            if var dog = liveness {
                dog.resetAfterRebuild(
                    now: Date(),
                    fromGo: counters?.fromGo ?? dog.lastFromGo,
                    toGo: counters?.toGo ?? dog.baselineToGo
                )
                liveness = dog
            }
            livenessRecovering = false
            livenessRebuildAttempts = 0
            flowLock.unlock()
            releaseTransportRebuild(owner: "liveness")
            // P1-1: transport đã lên lại ⇒ XOÁ state/message "đang dựng lại" của lần hỏng trước.
            // Không xoá thì app giữ "Connected" + "Reconnecting…" mãi (đúng lỗi Android từng bị).
            setStatus(state: "up", code: nil, message: nil)
            RelayDiagnostics.shared.log(
                "tự phục hồi: ĐÃ dựng lại transport (lần \(attempt)) — tunnel giữ nguyên, "
                    + "tiếp tục giám sát; đã xoá state/message tạm"
            )
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
                toGo: counters?.toGo ?? dog.baselineToGo
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
            switch dog.holdTick(now: Date(), fromGo: counters?.fromGo, toGo: counters?.toGo) {
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
                toGo: counters?.toGo ?? dog.baselineToGo
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
        previous?.stop()
        let started = Date()
        do {
            try startTransportRetrying(options: options)
        } catch {
            RelayDiagnostics.shared.log("tự phục hồi: dựng lại transport thất bại (\(error))")
            return false
        }
        activeUpKbps = options.upKbps
        activeDownKbps = options.downKbps
        activeBandwidthReason = bandwidth?.planReason
        RelayDiagnostics.shared.log(
            "tự phục hồi: transport mới đã lên sau "
                + "\(Self.seconds(Date().timeIntervalSince(started)))s"
        )
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
                "giám sát: ĐÃ gỡ network settings (\\(code)) — mạng của máy quay lại đường cũ, báo lỗi cho hệ thống"
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
        var tcpSynToGo = 0
        var tcpSynAckFromGo = 0
        var tcpRstFromGo = 0
        /// Có đếm được SYN/SYN-ACK/RST không (macOS có, iOS không).
        var countsTCPHandshake = false
    }

    private var trafficCounters: TrafficCounters? {
        if let counters = bridgeCounters {
            return TrafficCounters(
                origin: "cầu packetFlow↔fd",
                toGo: counters.toGo,
                fromGo: counters.fromGo,
                tcpSynToGo: counters.tcpSynToGo,
                tcpSynAckFromGo: counters.tcpSynAckFromGo,
                tcpRstFromGo: counters.tcpRstFromGo,
                countsTCPHandshake: true
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
