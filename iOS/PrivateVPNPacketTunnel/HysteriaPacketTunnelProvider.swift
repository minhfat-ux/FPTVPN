import Foundation
import Network
import NetworkExtension
import os

/// Packet-tunnel provider Hysteria-only cho **macOS và iOS** (cùng một lớp, hai nhánh
/// nền tảng ở đúng ba chỗ: lấy fd utun, network settings, và nguồn bộ đếm gói cho watchdog —
/// tìm `#if os(`).
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

    /// Hàng đợi riêng: `HysteriaTransport.start` CHẶN (chờ WS mở + bắt tay QUIC) nên không
    /// được chạy trên main thread của extension.
    private let queue = DispatchQueue(label: "com.privatevpn.mac.hysteria-tunnel")
    private let flowLock = NSLock()
    private var transport: HysteriaTransport?
    /// Cầu `packetFlow ↔ fd` (chỉ có ở chế độ `bridge` của macOS, xem `HysteriaTransport.resolveTunnelFD`).
    private var bridge: TunnelBridge?
    /// fd đã giao cho Go — trên iOS dùng để đọc bộ đếm gói của interface utun
    /// (xem `trafficCounters`).
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
        RelayDiagnostics.shared.log("startTunnel: bắt đầu phiên \(currentSession) (hysteria-only, macOS)")
        log.log(level: .default, "startTunnel: begin session \(currentSession)")

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

        // fd giao cho Go, kèm bằng chứng kiểm tra (xem `HysteriaTransport.resolveTunnelFD`:
        // trên macOS fd utun của NetworkExtension KHÔNG chở gói — netstat cho
        // ipkts=0/opkts=0/obytes=0 và ~23k lỗi/s — nên mặc định bắc cầu qua packetFlow).
        #if os(macOS)
        let resolvedTunnelFD = HysteriaTransport.resolveTunnelFD(from: packetFlow)
        #else
        // iOS: KHÔNG cần socketpair/bắc cầu — KVC `packetFlow.value(forKey: "socket")` là fd
        // utun thật và chở gói đúng định dạng sing-tun parse (xem `directTunnelFD`).
        let resolvedTunnelFD = HysteriaTransport.directTunnelFD(from: packetFlow)
        #endif
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

        // Chế độ bắc cầu (chỉ macOS): gói đi qua `NEPacketTunnelFlow` (API công khai) rồi mới vào fd.
        if let hostFd = tunnelFD.hostFd {
            let created = TunnelBridge(flow: packetFlow, hostFd: hostFd, log: log)
            flowLock.lock()
            bridge = created
            flowLock.unlock()
            created.start()
        }

        let hysteria = HysteriaTransport(log: log)
        flowLock.lock()
        transport = hysteria
        flowLock.unlock()

        do {
            try hysteria.start(options: options, tunnelFd: tunnelFD.fd) { [weak self] reason in
                guard let self else { return }
                // Đường hysteria chết SAU khi đã lên: hạ tunnel ngay và báo lỗi cho app.
                // Để nguyên chính là ca "Connected mà không có mạng".
                RelayDiagnostics.shared.log("hysteria: transport chết (\(reason)) — hạ tunnel")
                self.setStatus(
                    state: "no_traffic",
                    code: Self.codeNoTraffic,
                    message: "Đường hysteria2 dừng (\(reason))."
                )
                self.teardownAndCancel(
                    code: Self.codeNoTraffic,
                    message: "Đường hysteria2 dừng: \(reason)"
                )
            }
        } catch {
            RelayDiagnostics.shared.log("hysteria: dựng thất bại: \(error)")
            flowLock.lock()
            transport = nil
            flowLock.unlock()
            hysteria.stop()
            stopBridge()
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
        completeStart(completion, error: nil, session: currentSession)
        startTrafficSupervisor()
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
        ipv4.excludedRoutes = [
            NEIPv4Route(destinationAddress: "10.0.0.0", subnetMask: "255.0.0.0"),
            NEIPv4Route(destinationAddress: "172.16.0.0", subnetMask: "255.240.0.0"),
            NEIPv4Route(destinationAddress: "192.168.0.0", subnetMask: "255.255.0.0"),
            NEIPv4Route(destinationAddress: "169.254.0.0", subnetMask: "255.255.0.0"),
        ]
        #endif
        settings.ipv4Settings = ipv4
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
        cancelSupervisor()
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
    /// gói của CHÍNH MÁY (xem `startTrafficSupervisor`), mà nguồn bằng chứng khác nhau theo
    /// nền tảng:
    ///   * macOS — cầu `packetFlow ↔ fd` tự đếm (`TunnelBridge`), có cả SYN/SYN-ACK nên phát
    ///     hiện TCP blackhole đúng như thiết kế (`countsTCPHandshake = true`).
    ///   * iOS — không có cầu (Go đọc thẳng fd utun), nên lấy bộ đếm gói của interface utun
    ///     (`HysteriaTransport.utunPacketCounters`): có hai chiều gói nhưng KHÔNG có cờ TCP.
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
                origin: "cầu packetFlow↔fd (macOS)",
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
            upKbps: diagUp ?? dict["upKbps"] as? Int ?? HysteriaDefaults.upKbps,
            downKbps: diagDown ?? dict["downKbps"] as? Int ?? HysteriaDefaults.downKbps,
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
