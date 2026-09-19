import Foundation
import Network
import NetworkExtension
import os

/// Packet-tunnel provider Hysteria-only cho **macOS**.
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
    /// Sau khi tunnel "lên", chờ ngần này rồi kiểm tra relay có thật sự chở gói không.
    private static let trafficGrace: TimeInterval = 12
    /// Số lần tối đa hoãn kiểm tra traffic khi CHƯA có gì để kết luận (QUIC chưa gửi gói).
    private static let maxTrafficDeferrals = 2

    /// Hàng đợi riêng: `HysteriaTransport.start` CHẶN (chờ WS mở + bắt tay QUIC) nên không
    /// được chạy trên main thread của extension.
    private let queue = DispatchQueue(label: "com.privatevpn.mac.hysteria-tunnel")
    private let flowLock = NSLock()
    private var transport: HysteriaTransport?
    /// Cầu `packetFlow ↔ fd` (chỉ có ở chế độ `bridge`, xem `HysteriaTransport.resolveTunnelFD`).
    private var bridge: TunnelBridge?
    private var session = 0
    private var startCompleted = false
    private var stopCompleted = false
    private var watchdog: DispatchWorkItem?
    private var overallTimeout: DispatchWorkItem?
    private var trafficDeferrals = 0
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
        trafficDeferrals = 0
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
        guard let tunnelFD = HysteriaTransport.resolveTunnelFD(from: packetFlow) else {
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

        // Chế độ bắc cầu: gói đi qua `NEPacketTunnelFlow` (API công khai) rồi mới vào fd.
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
        scheduleTrafficWatchdog()
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
        settings.ipv4Settings = ipv4
        settings.dnsSettings = NEDNSSettings(servers: HysteriaDefaults.dnsServers)
        return settings
    }

    // MARK: - Watchdog

    /// Kiểm tra ĐƯỜNG THẬT có chở gói không, không chỉ tin `completionHandler(nil)`:
    /// `MobileConnect` trả về trước khi QUIC bắt tay xong, nên relay/node hỏng vẫn cho ra
    /// tunnel "Connected".
    private func scheduleTrafficWatchdog() {
        let item = DispatchWorkItem { [weak self] in
            guard let self, let hysteria = self.currentTransport() else { return }
            let counts = hysteria.relayFrameCounts
            let sent = counts?.sent ?? 0
            let received = counts?.received ?? 0
            let wsOpen = hysteria.relayIsConnected
            let bridge = self.bridgeCounters
            RelayDiagnostics.shared.log(
                "hysteria: kiểm tra traffic (gui=\(sent) nhan=\(received) wsOpen=\(wsOpen)"
                    + (bridge.map { ", cầu: packetFlow→Go \($0.toGo) gói, Go→packetFlow \($0.fromGo) gói" } ?? "")
                    + ")"
            )
            // Có gói từ relay trả về ⇒ đường thông thật.
            if received > 0 {
                RelayDiagnostics.shared.log("hysteria: có traffic thật qua relay (gui=\(sent) nhan=\(received))")
                return
            }
            // Chưa gửi gói nào (QUIC chưa bắt tay) ⇒ CHƯA kết luận được, hoãn có trần.
            if sent == 0 && wsOpen {
                self.flowLock.lock()
                let deferrals = self.trafficDeferrals
                self.trafficDeferrals += 1
                self.flowLock.unlock()
                if deferrals < Self.maxTrafficDeferrals {
                    RelayDiagnostics.shared.log("hysteria: chưa có gói nào để kết luận — kiểm tra lại sau \(Int(Self.trafficGrace))s")
                    self.scheduleTrafficWatchdog()
                    return
                }
            }
            RelayDiagnostics.shared.log("hysteria: relay không chở gói nào (gui=\(sent) nhan=\(received) wsOpen=\(wsOpen)) — hạ tunnel (TUNNEL_NO_TRAFFIC)")
            self.setStatus(
                state: "no_traffic",
                code: Self.codeNoTraffic,
                message: "Relay hysteria không trả về gói nào (wsOpen=\(wsOpen))."
            )
            self.teardownAndCancel(
                code: Self.codeNoTraffic,
                message: "Relay hysteria không trả về gói nào sau \(Int(Self.trafficGrace))s (đã gửi \(sent) frame, wsOpen=\(wsOpen))."
            )
        }
        watchdog = item
        queue.asyncAfter(deadline: .now() + Self.trafficGrace, execute: item)
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
        watchdog?.cancel()
        watchdog = nil
    }

    /// Dừng cầu `packetFlow ↔ fd` (nếu phiên này chạy ở chế độ bridge).
    private func stopBridge() {
        flowLock.lock()
        let current = bridge
        bridge = nil
        flowLock.unlock()
        current?.stop()
    }

    /// Số gói thật đã đi qua cầu (nil khi không ở chế độ bridge) — dùng cho watchdog/chẩn đoán.
    private var bridgeCounters: TunnelBridge.Counters? {
        flowLock.lock()
        let current = bridge
        flowLock.unlock()
        return current?.snapshot
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
        return .success(HysteriaTransport.Options(
            relayURL: relayURL,
            relayURLCandidates: candidates,
            serverHost: serverHost,
            serverPort: port,
            password: password,
            obfs: dict["obfs"] as? String ?? "",
            upKbps: dict["upKbps"] as? Int ?? HysteriaDefaults.upKbps,
            downKbps: dict["downKbps"] as? Int ?? HysteriaDefaults.downKbps,
            mtu: dict["mtu"] as? Int ?? HysteriaDefaults.mtu,
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
