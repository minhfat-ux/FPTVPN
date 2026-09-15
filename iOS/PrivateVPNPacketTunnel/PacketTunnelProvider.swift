import Network
import NetworkExtension
import os
import Security
import WireGuardKit

/// How long each transport in the chain gets to come up before the next one is tried.
private let transportGrace: TimeInterval = 8

/// Sau khi tunnel "lên", chờ ngần này rồi kiểm tra peer đã có handshake/traffic chưa.
/// Nếu chưa, phiên coi như "lên nhưng không có mạng" và watchdog dựng lại.
private let watchdogGrace: TimeInterval = 11
/// Số lần tối đa watchdog tự dựng lại phiên trước khi bỏ cuộc (tránh vòng lặp vô tận).
private let maxWatchdogRebuilds = 2
/// Số lần tối đa watchdog hoãn kiểm tra (transport còn kết nối / runtime chưa sẵn sàng)
/// trước khi dựng lại phiên cho dù chưa xác định được transport đã "connected".
private let maxWatchdogDeferrals = 2
/// Tổng thời gian tối đa một lần Connect được phép chạy mà CHƯA có traffic thật. Quá hạn
/// thì extension tự dừng phiên và báo mã `TUNNEL_NO_TRAFFIC`.
///
/// Vì sao cần: trên macOS, khi extension không dừng dứt khoát, hệ thống cứ dựng lại
/// extension (PID đổi liên tục) và tunnel "lên" mà không có mạng mãi. Trần này chặn vòng
/// lặp đó. Đo trên máy thật: relay thường lên trong ~8s, nên 15s là mốc đủ rộng cho một
/// lần thử lành mạnh.
private let overallTrafficTimeout: TimeInterval = 15

final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let log = Logger(
        subsystem: "com.privatevpn.app.packet-tunnel",
        category: "tunnel"
    )

    private var adapter: WireGuardAdapter?
    private var relay: WGRelayClient?
    /// WebSocket relay: only started when the TCP relay never came up (see
    /// `scheduleWebSocketFallback`).
    private var wsRelay: WSRelayClient?
    /// Configuration to restore when the relays never come up (direct UDP endpoint).
    private var directConfiguration: TunnelConfiguration?

    /// Bộ đếm phiên: mỗi lần start tăng lên một lần. Mọi callback async của phiên cũ
    /// (fallback transport, watchdog, báo health) phải kiểm tra `isCurrentSession` trước
    /// khi chạm vào trạng thái dùng chung, nên phiên cũ KHÔNG thể dừng relay, ghi đè cấu
    /// hình hay gỡ network settings của phiên mới. Đây là gốc của lỗi "Connect lần hai
    /// tunnel lên nhưng không có mạng": callback phiên cũ còn sót đã dọn dở phiên mới.
    private let sessionLock = NSLock()
    private var sessionGeneration = 0
    private var sessionActive = false
    /// Các tác vụ hẹn giờ thuộc phiên hiện tại, huỷ hết khi stop/thay phiên.
    private var scheduledWorkItems: [DispatchWorkItem] = []
    /// Số lần watchdog đã dựng lại phiên trong lần Connect hiện tại.
    private var watchdogRebuilds = 0
    /// Số lần watchdog hoãn kiểm tra (transport còn đang kết nối / runtime chưa sẵn sàng).
    /// Có trần để không hoãn mãi: hết trần thì vẫn dựng lại như yêu cầu.
    private var watchdogDeferrals = 0

    /// Trạng thái chẩn đoán của phiên hiện tại, app đọc qua `handleAppMessage`
    /// (`sendProviderMessage`). Extension không có UI nên đây là kênh DUY NHẤT để báo
    /// "tunnel lên nhưng không có mạng" cho người dùng — thiếu nó thì khách chỉ thấy
    /// Connected mà không biết vì sao không vào được mạng.
    private var statusState = "idle"
    private var statusCode: String?
    private var statusMessage: String?
    private var statusRxBytes = 0
    private var statusTxBytes = 0
    /// Byte đầu tiên của phiên hiện tại đã được log chưa (mỗi phiên log đúng một lần).
    private var firstTrafficLogged = false
    /// Một lần Connect (từ lúc app gọi startVPNTunnel) đã nhận traffic thật chưa. KHÁC
    /// `firstTrafficLogged`: cờ này chỉ reset ở `startTunnel`, KHÔNG reset khi watchdog
    /// dựng lại phiên, nên timeout tổng không bị "trẻ hoá" bởi các lần rebuild nội bộ.
    private var connectHasTraffic = false
    /// Timer timeout tổng của lần Connect hiện tại. Cố ý KHÔNG nằm trong
    /// `scheduledWorkItems` để watchdog dựng lại phiên không huỷ nó.
    private var overallTimeoutItem: DispatchWorkItem?

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        // Mỗi lần start là một phiên MỚI: tăng generation để mọi callback async của
        // phiên trước tự vô hiệu, rồi dọn sạch adapter/relay còn sót trước khi dựng mới.
        watchdogRebuilds = 0
        let generation = beginSession()
        // Timeout tổng tính từ lần Connect này, không bị watchdog rebuild làm mới.
        sessionLock.lock()
        connectHasTraffic = false
        sessionLock.unlock()
        resetSessionResources()
        RelayDiagnostics.shared.log("startTunnel requested (session \(generation))")
        log.log(level: .default, "startTunnel: begin session \(generation, privacy: .public)")

        guard let config = self.configuration,
              (try? config.makeTunnelConfiguration()) != nil else {
            let error = NSError(
                domain: "com.privatevpn.tunnel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid or missing WireGuard configuration"]
            )
            RelayDiagnostics.shared.log("startTunnel: invalid or missing WireGuard configuration")
            completionHandler(error)
            return
        }

        startSession(config: config, generation: generation, completion: completionHandler)
        scheduleOverallTimeout()
    }

    /// Dựng adapter + chuỗi transport cho MỘT phiên. Cấu hình được đọc lại từ
    /// `configuration` (protocolConfiguration mới nhất) chứ không dùng biến còn sót.
    /// `completion` là callback của NetworkExtension ở lần start đầu, và là log thuần
    /// khi watchdog dựng lại phiên.
    private func startSession(
        config: WireGuardConfig,
        generation: Int,
        completion: @escaping (Error?) -> Void
    ) {
        guard var tunnelConfig = try? config.makeTunnelConfiguration() else {
            let error = NSError(
                domain: "com.privatevpn.tunnel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid or missing WireGuard configuration"]
            )
            completion(error)
            return
        }

        let adapter = WireGuardAdapter(with: self) { [weak self] level, message in
            let osLevel: OSLogType = level == .error ? .error : .debug
            self?.log.log(level: osLevel, "\(message)")
            // Mirror the WireGuard adapter into the pullable file: handshake and
            // transport errors only ever show up here.
            RelayDiagnostics.shared.log("wg: \(message)")
        }
        self.adapter = adapter

        // Chuỗi transport, đi một chiều và không quay lại: relay TCP → relay WS → UDP
        // trực tiếp. Mỗi bước chỉ được thử khi bước trước vẫn chưa kết nối được, hoặc
        // không dựng nổi listener (bước 1 bind lỗi thì vào thẳng bước 2).
        //
        // WireGuard-over-TCP relay (same transport the Android client uses): point the
        // peer at a local UDP listener and let the relay carry the datagrams over TCP
        // to the exit node. Measured on a network where the raw-UDP handshake never
        // completed: the client kept re-sending handshakes every 5s while the server's
        // answers never got through. If the relay cannot be reached we try the
        // WebSocket relay and then direct UDP, so nothing is lost on networks where
        // UDP is fine.
        let directConfiguration = tunnelConfig
        if let relayHost = config.relayHost, let relayPorts = config.relayPorts,
           !tunnelConfig.peers.isEmpty {
            if let localPort = startRelay(host: relayHost, ports: relayPorts) {
                tunnelConfig = configuration(tunnelConfig, pointingAt: localPort)
                note("relay: WireGuard endpoint -> 127.0.0.1:\(localPort.rawValue) (relay \(relayHost):\(relayPorts.first ?? 0))")
                scheduleWebSocketFallback(direct: directConfiguration, generation: generation)
            } else if let localPort = startWebSocketRelay() {
                // Bước 1 không dựng nổi listener (bind lỗi) thì vào chuỗi ở bước 2 luôn:
                // đường WS không phụ thuộc IP node nên nó vẫn là đường sống khi bị chặn IP,
                // bỏ qua nó chỉ vì relay TCP không bind được là mất đúng đường dự phòng.
                tunnelConfig = configuration(tunnelConfig, pointingAt: localPort)
                note("ws-relay: WireGuard endpoint -> 127.0.0.1:\(localPort.rawValue) (TCP relay did not start)")
                scheduleDirectFallback(direct: directConfiguration, generation: generation)
            } else {
                note("relay: no relay transport could start — using direct UDP")
            }
        }

        // Sau khi tunnel chạy, báo cho coordinator biết node này có tới được không:
        // node bị GFW chặn thì app phải tự nói, server tự kiểm tra không thấy được.
        // Báo sau khi chuỗi transport đã chọn xong (2 mốc grace + 4s dự phòng) và đọc
        // đúng transport đang chạy — nếu không, node tới được qua WS vẫn bị báo là không
        // tới được, và coordinator lại xếp nó xuống dưới.
        let reportedNodeId = config.nodeId
        schedule(after: transportGrace * 2 + 4) { [weak self] in
            guard let self, self.isCurrentSession(generation) else { return }
            let reachable = self.activeTransportIsConnected
            NodeHealthReporter.report(
                nodeId: reportedNodeId,
                reachable: reachable,
                reason: reachable ? nil : "relay unreachable from this network"
            )
        }

        adapter.start(tunnelConfiguration: tunnelConfig) { [weak self] error in
            guard let self else {
                completion(error)
                return
            }
            let isCurrent = self.isCurrentSession(generation)
            if let error {
                self.log.error("Failed to start tunnel: \(error.localizedDescription)")
                RelayDiagnostics.shared.log("Failed to start tunnel: \(error.localizedDescription)")
                if isCurrent {
                    self.setStatus(
                        state: "failed",
                        code: TunnelDiagnosticCode.startFailed,
                        message: "Không khởi động được tunnel (mã TUNNEL_START_FAILED): \(error.localizedDescription)"
                    )
                }
                // Start hỏng SAU khi setTunnelNetworkSettings đã áp DNS/route ⇒ phải tự gỡ
                // trước khi báo lỗi, nếu không máy giữ nguyên DNS 1.1.1.1 + route qua utun
                // (bug "Disconnect xong mất mạng" đo trên macOS 14/09). Xem stopTunnel.
                // Nhưng nếu phiên mới đã bắt đầu thì để yên settings của nó.
                if isCurrent, self.sessionNotRestarted(since: generation) {
                    self.setTunnelNetworkSettings(nil) { _ in
                        completion(error)
                    }
                } else {
                    completion(error)
                }
                return
            }
            guard isCurrent else {
                // Phiên bị thay thế trong lúc adapter.start chạy: không áp watchdog/health
                // lên phiên mới, chỉ báo huỷ cho NetworkExtension.
                RelayDiagnostics.shared.log("startSession: stale session \(generation) started — ignoring")
                completion(NSError(
                    domain: "com.privatevpn.tunnel",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Session replaced before start completed"]
                ))
                return
            }
            self.setStatus(state: "up")
            self.note("WireGuard tunnel started (session \(generation))")
            self.note("network settings applied: addr=\(config.addresses.first ?? "?") dns=\(config.dnsServers.joined(separator: ","))")
            completion(nil)
            // Dò byte đầu tiên sớm (3s/lần) để log kịp thời, rồi watchdog kiểm tra tổng thể.
            self.scheduleTrafficProbe(generation: generation, attempt: 1)
            self.scheduleWatchdog(generation: generation)
        }
    }

    // MARK: - Session lifecycle

    /// Bắt đầu một phiên mới: tăng generation, đánh dấu active và huỷ mọi tác vụ hẹn giờ
    /// của phiên cũ. Không dừng tài nguyên ở đây — `resetSessionResources` làm việc đó.
    private func beginSession() -> Int {
        sessionLock.lock()
        sessionGeneration += 1
        sessionActive = true
        let generation = sessionGeneration
        let pending = scheduledWorkItems
        scheduledWorkItems = []
        // Phiên mới bắt đầu từ trạng thái sạch: không giữ mã chẩn đoán của phiên trước.
        statusState = "starting"
        statusCode = nil
        statusMessage = nil
        statusRxBytes = 0
        statusTxBytes = 0
        firstTrafficLogged = false
        watchdogDeferrals = 0
        sessionLock.unlock()
        for item in pending { item.cancel() }
        return generation
    }

    /// Kết thúc phiên hiện tại: đánh dấu không còn active và huỷ tác vụ hẹn giờ.
    /// KHÔNG tăng generation — để callback dọn dẹp của chính lần stop này vẫn nhận ra
    /// "chưa có phiên mới" mà gỡ network settings.
    private func endSession() {
        sessionLock.lock()
        sessionActive = false
        watchdogRebuilds = 0
        statusState = "stopped"
        let pending = scheduledWorkItems
        scheduledWorkItems = []
        let timeout = overallTimeoutItem
        overallTimeoutItem = nil
        sessionLock.unlock()
        for item in pending { item.cancel() }
        timeout?.cancel()
    }

    /// Hẹn timeout TỔNG của lần Connect: quá hạn mà chưa có traffic thật thì dừng phiên.
    /// Không dùng `schedule(after:)` vì việc đó gắn với `scheduledWorkItems` — watchdog
    /// dựng lại phiên sẽ huỷ mất timeout tổng.
    private func scheduleOverallTimeout() {
        sessionLock.lock()
        let previous = overallTimeoutItem
        let item = DispatchWorkItem { [weak self] in self?.handleOverallTimeout() }
        overallTimeoutItem = item
        sessionLock.unlock()
        previous?.cancel()
        DispatchQueue.global().asyncAfter(deadline: .now() + overallTrafficTimeout, execute: item)
    }

    /// Chốt an toàn chống vòng lặp vô hạn trên macOS: hết thời gian tổng mà chưa có byte
    /// thật nào thì ghi mã chẩn đoán rồi tự dừng phiên, KHÔNG để hệ thống dựng lại mãi.
    private func handleOverallTimeout() {
        sessionLock.lock()
        let active = sessionActive
        let hasTraffic = connectHasTraffic
        overallTimeoutItem = nil
        sessionLock.unlock()
        guard active, !hasTraffic else { return }

        let seconds = Int(overallTrafficTimeout)
        log.error("start timeout: no traffic after \(seconds)s — stopping session (TUNNEL_NO_TRAFFIC)")
        RelayDiagnostics.shared.log(
            "start timeout: no traffic after \(seconds)s — stopping session (TUNNEL_NO_TRAFFIC) transport=\(activeTransportName)"
        )
        setStatus(
            state: "no_traffic",
            code: TunnelDiagnosticCode.noTraffic,
            message: "Không nhận được dữ liệu sau \(seconds) giây (mã TUNNEL_NO_TRAFFIC). "
                + "Phiên đã được dừng. Vui lòng kiểm tra mạng rồi bấm Connect lại."
        )
        cancelTunnelWithError(NSError(
            domain: "com.privatevpn.tunnel",
            code: 3,
            userInfo: [NSLocalizedDescriptionKey:
                "Tunnel start timed out after \(seconds)s without traffic (TUNNEL_NO_TRAFFIC)"]
        ))
    }

    /// Ghi trạng thái chẩn đoán cho phiên hiện tại (thread-safe).
    private func setStatus(state: String, code: String? = nil, message: String? = nil) {
        sessionLock.lock()
        statusState = state
        statusCode = code
        statusMessage = message
        sessionLock.unlock()
    }

    /// Ảnh chụp trạng thái để trả cho app qua `handleAppMessage`.
    private func statusSnapshot() -> TunnelStatusReport {
        sessionLock.lock()
        let session = sessionGeneration
        let state = statusState
        let code = statusCode
        let message = statusMessage
        let rx = statusRxBytes
        let tx = statusTxBytes
        sessionLock.unlock()
        return TunnelStatusReport(
            session: session,
            state: state,
            code: code,
            message: message,
            rxBytes: rx,
            txBytes: tx,
            transport: activeTransportName
        )
    }

    /// Transport hiện có của phiên (dùng cho log chẩn đoán và báo cáo cho app).
    private var activeTransportName: String {
        if relay != nil { return "relay" }
        if wsRelay != nil { return "ws-relay" }
        return "direct"
    }

    private func isCurrentSession(_ generation: Int) -> Bool {
        sessionLock.lock()
        defer { sessionLock.unlock() }
        return sessionActive && sessionGeneration == generation
    }

    /// True khi CHƯA có phiên mới nào bắt đầu kể từ `generation` — dùng cho dọn dẹp lúc
    /// stop để không gỡ network settings của phiên vừa được dựng.
    private func sessionNotRestarted(since generation: Int) -> Bool {
        sessionLock.lock()
        defer { sessionLock.unlock() }
        return sessionGeneration == generation
    }

    /// Log mốc chẩn đoán ở mức `.default` (hiện trong `log show` không cần `--info`) và
    /// ghi thêm vào file chẩn đoán kéo được từ thiết bị. `privacy: .public` để nội dung
    /// không bị che `<private>` — log cũ dùng `.info` nên gần như vô hình khi debug máy thật.
    private func note(_ message: String) {
        log.log(level: .default, "\(message, privacy: .public)")
        RelayDiagnostics.shared.log(message)
    }

    /// Hẹn một tác vụ thuộc phiên hiện tại; tác vụ được theo dõi để huỷ khi stop/thay phiên.
    private func schedule(after delay: TimeInterval, _ work: @escaping () -> Void) {
        let item = DispatchWorkItem(block: work)
        sessionLock.lock()
        scheduledWorkItems.append(item)
        sessionLock.unlock()
        DispatchQueue.global().asyncAfter(deadline: .now() + delay, execute: item)
    }

    /// Dừng adapter/relay còn sót từ phiên trước (best-effort, không chờ) trước khi dựng mới.
    private func resetSessionResources() {
        relay?.stop()
        relay = nil
        wsRelay?.stop()
        wsRelay = nil
        directConfiguration = nil
        if let adapter {
            adapter.stop { _ in }
        }
        adapter = nil
    }

    /// Dừng tài nguyên phiên hiện tại và chỉ gọi `completion` khi adapter đã dừng hẳn —
    /// watchdog dùng để dựng lại phiên trên nền đã sạch.
    private func stopSessionResources(completion: @escaping () -> Void) {
        relay?.stop()
        relay = nil
        wsRelay?.stop()
        wsRelay = nil
        directConfiguration = nil
        if let adapter {
            adapter.stop { [weak self] _ in
                if self?.adapter === adapter { self?.adapter = nil }
                completion()
            }
        } else {
            completion()
        }
    }

    /// Starts the relay and returns the local UDP port WireGuard must use.
    ///
    /// No reachability probe here on purpose: a single 3s TCP probe at tunnel-start
    /// time can fail for reasons that have nothing to do with the relay (routes being
    /// installed, a slow first packet on the hotel network) and it then stranded the
    /// whole session on direct UDP, which is exactly the case this relay exists for.
    /// The client connects asynchronously and keeps retrying, so the link comes up as
    /// soon as the network allows.
    private func startRelay(host: String, ports: [UInt16]) -> NWEndpoint.Port? {
        let client = WGRelayClient(host: host, ports: ports, log: log)
        do {
            let localPort = try client.start()
            relay = client
            note("relay: started for \(host) ports \(ports)")
            return NWEndpoint.Port(rawValue: localPort)
        } catch {
            log.error("relay: could not start on \(host) — \(error)")
            RelayDiagnostics.shared.log("relay: could not start on \(host) — \(error)")
            return nil
        }
    }

    /// Starts the WebSocket relay and returns the local UDP port WireGuard must use.
    ///
    /// Same reasoning as `startRelay`: no reachability probe, the client connects
    /// asynchronously and reconnects on its own, and its local UDP port never changes
    /// across those reconnects.
    private func startWebSocketRelay() -> NWEndpoint.Port? {
        // Relay phải là của ĐÚNG node đang dùng: một relay chỉ hạ cánh ở MỘT node, đi
        // qua relay của node khác thì handshake mã hoá tới khoá của node đang chọn
        // nhưng lại tới wg0 của node kia — node kia không giải được và không có peer
        // này, nên WireGuard im lặng tuyệt đối (lỗi iPad 13/09: framesFromRelay=0 mãi).
        let declared = configuration?.wsRelayURL?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let declared, !declared.isEmpty, let url = URL(string: declared) else {
            // KHÔNG đoán relay: một relay chỉ hạ cánh ở MỘT node. Dùng URL mặc định cho
            // node khác thì gói handshake mã hoá tới khoá node này nhưng lại tới wg0 của
            // node kia — bên kia không giải được, WireGuard im lặng tuyệt đối. Thay vì
            // "đoán rồi hy vọng", log rõ các KHOÁ có trong providerConfiguration (chỉ tên
            // khoá, KHÔNG log giá trị — private key nằm trong đó) và báo lỗi cho người
            // dùng; chuỗi transport tự lui về UDP trực tiếp.
            let keys = declaredProviderConfigurationKeys
            log.error("ws-relay: this node declared no relay URL — providerConfiguration keys=\(keys, privacy: .public)")
            RelayDiagnostics.shared.log(
                "ws-relay: node không khai relay URL (RELAY_URL_MISSING) — khoá có trong " +
                    "providerConfiguration: \(keys)"
            )
            setStatus(
                state: "no_traffic",
                code: TunnelDiagnosticCode.relayURLMissing,
                message: "Node không khai địa chỉ relay (mã RELAY_URL_MISSING). Đang thử kết nối trực tiếp."
            )
            return nil
        }
        note("ws-relay: relay của node này (control plane cấp): \(declared)")
        let client = WSRelayClient(url: url, log: log)
        do {
            let localPort = try client.start()
            wsRelay = client
            note("ws-relay: started for \(url.absoluteString) — local udp 127.0.0.1:\(localPort)")
            return NWEndpoint.Port(rawValue: localPort)
        } catch {
            log.error("ws-relay: could not start — \(error)")
            RelayDiagnostics.shared.log("ws-relay: could not start — \(error)")
            return nil
        }
    }

    /// Tên các khoá có trong `providerConfiguration` — CHỈ tên, không giá trị (private key
    /// nằm trong đó trên macOS). Dùng để chẩn đoán ca RELAY_URL_MISSING: biết app đã gửi
    /// khoá nào mà thiếu relay, thay vì đoán mò.
    private var declaredProviderConfigurationKeys: [String] {
        ((protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration ?? [:])
            .keys
            .sorted()
    }

    /// Points the first peer at a local relay listener, keeping the rest untouched.
    private func configuration(
        _ config: TunnelConfiguration,
        pointingAt localPort: NWEndpoint.Port
    ) -> TunnelConfiguration {
        var peers = config.peers
        peers[0].endpoint = Endpoint(host: NWEndpoint.Host("127.0.0.1"), port: localPort)
        return TunnelConfiguration(
            name: config.name,
            interface: config.interface,
            peers: peers
        )
    }

    /// Whether the transport WireGuard is currently pointed at is actually carrying
    /// traffic.
    ///
    /// Direct UDP has no link to inspect, so it deliberately counts as REACHABLE, and so
    /// does the moment before any transport exists. That default is intentional, not an
    /// oversight: the coordinator only demotes a node after several "unreachable" reports
    /// in a window, so a false negative would push a healthy node down the picker. Only a
    /// relay that is actually active and never connected reports unreachable.
    private var activeTransportIsConnected: Bool {
        if let relay { return relay.isConnected }
        if let wsRelay { return wsRelay.isConnected }
        return true
    }

    /// Step 2 of the transport chain: when the TCP relay is still not connected after
    /// its grace period, tear it down and carry the tunnel over the WebSocket relay
    /// instead. That path talks to shared Tailscale infrastructure rather than the
    /// node's own IP, so it is the one that survives a network blocking every node IP.
    ///
    /// One-way on purpose, like the rest of the chain: the switch happens at most once
    /// and is never reversed. Each transport keeps its own local UDP port for its whole
    /// lifetime, so WireGuard is reconfigured exactly once per step.
    private func scheduleWebSocketFallback(direct: TunnelConfiguration, generation: Int) {
        guard let relay else { return }
        schedule(after: transportGrace) { [weak self] in
            guard let self, self.isCurrentSession(generation), let adapter = self.adapter else { return }
            guard !relay.isConnected else {
                note("relay: link is up, keeping the relay transport")
                return
            }
            let grace = Int(transportGrace)
            RelayDiagnostics.shared.log("relay: still not connected after \(grace)s — trying the WebSocket relay")
            self.log.error("relay: not connected after \(grace)s — trying the WebSocket relay")
            relay.stop()
            if self.relay === relay { self.relay = nil }

            guard let localPort = self.startWebSocketRelay() else {
                self.applyDirectEndpoint(direct, because: "the WebSocket relay could not start")
                return
            }
            adapter.update(tunnelConfiguration: self.configuration(direct, pointingAt: localPort)) { error in
                if let error {
                    RelayDiagnostics.shared.log("ws-relay: update failed: \(error)")
                } else {
                    RelayDiagnostics.shared.log("ws-relay: WireGuard endpoint -> 127.0.0.1:\(localPort.rawValue)")
                }
            }
            self.scheduleDirectFallback(direct: direct, generation: generation)
        }
    }

    /// Step 3 of the chain: if the WebSocket link is still not up a few seconds after it
    /// was handed to WireGuard, give the node's direct UDP endpoint back. One-way on
    /// purpose — flapping between transports would be worse than either.
    private func scheduleDirectFallback(direct: TunnelConfiguration, generation: Int) {
        directConfiguration = direct
        guard let wsRelay else { return }
        schedule(after: transportGrace) { [weak self] in
            guard let self, self.isCurrentSession(generation) else { return }
            guard !wsRelay.isConnected else {
                note("ws-relay: link is up, keeping the WebSocket transport")
                return
            }
            wsRelay.stop()
            if self.wsRelay === wsRelay { self.wsRelay = nil }
            self.applyDirectEndpoint(
                direct,
                because: "WebSocket relay still not connected after \(Int(transportGrace))s"
            )
        }
    }

    /// Last resort of the chain: hand WireGuard the node's own address back.
    private func applyDirectEndpoint(_ direct: TunnelConfiguration, because reason: String) {
        guard let adapter else { return }
        RelayDiagnostics.shared.log("relay: \(reason) — falling back to direct UDP")
        log.error("relay: \(reason) — falling back to direct UDP")
        adapter.update(tunnelConfiguration: direct) { error in
            if let error {
                RelayDiagnostics.shared.log("relay: fallback update failed: \(error)")
            } else {
                RelayDiagnostics.shared.log("relay: WireGuard endpoint restored to the direct node address")
            }
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        let generation = currentGeneration()
        endSession()
        log.log(level: .default, "Stopping tunnel; reason=\(reason.rawValue, privacy: .public) (session \(generation, privacy: .public))")
        RelayDiagnostics.shared.log("stopTunnel reason=\(reason.rawValue) session=\(generation)")
        relay?.stop()
        relay = nil
        wsRelay?.stop()
        wsRelay = nil
        directConfiguration = nil

        // Xoá cấu hình mạng của tunnel (DNS + route 0.0.0.0/0) trước khi báo hoàn tất.
        // Vì sao: đây là bug thật đã làm khách "mất mạng" — macOS giữ nguyên DNS mà
        // tunnel áp lên Wi-Fi nếu tunnel không tự gỡ. Đo thật sau khi Disconnect:
        //   networksetup -getdnsservers Wi-Fi  →  1.1.1.1
        //   scutil --dns | grep nameserver     →  nameserver[0] : 1.1.1.1
        // 1.1.1.1 thường bị ISP Việt Nam chặn ⇒ không phân giải được tên miền; kèm
        // ~35 route rác trỏ qua utun. setTunnelNetworkSettings(nil) buộc hệ thống trả
        // lại DNS/route của interface vật lý (Wi-Fi) và dỡ route của tunnel.
        // Gọi cả khi `adapter` nil (tunnel chưa/không start được) để không bỏ sót.
        //
        // Chốt an toàn cho bug "Connect lần hai không có mạng": nếu một phiên MỚI đã
        // bắt đầu trong lúc adapter cũ đang dừng, KHÔNG gỡ settings nữa — phiên mới đã
        // áp IP 10.77.x/DNS của nó, gỡ ở đây sẽ xoá đúng cấu hình đó.
        let clearNetworkSettingsAndFinish = { [weak self] in
            guard let self else {
                completionHandler()
                return
            }
            guard self.sessionNotRestarted(since: generation) else {
                self.note("stopTunnel: a new session started — leaving its network settings untouched")
                completionHandler()
                return
            }
            let logger = self.log
            self.setTunnelNetworkSettings(nil) { _ in
                logger.info("stopTunnel: network settings removed")
                RelayDiagnostics.shared.log("stopTunnel: network settings removed")
                completionHandler()
            }
        }

        if let adapter {
            adapter.stop { [weak self] error in
                if let error {
                    self?.log.error("Error stopping tunnel: \(error.localizedDescription)")
                }
                // Chỉ xoá nếu đây vẫn là adapter của phiên này — tránh nil nhầm adapter
                // mà phiên mới vừa tạo.
                if self?.adapter === adapter { self?.adapter = nil }
                clearNetworkSettingsAndFinish()
            }
        } else {
            clearNetworkSettingsAndFinish()
        }
    }

    // MARK: - First-byte probe

    /// Dò runtime vài lần ngay sau khi tunnel lên để log "byte đầu tiên nhận được" sớm,
    /// thay vì đợi tới mốc watchdog 11s. Tối đa 3 lần (3s/6s/9s) rồi nhường cho watchdog.
    private func scheduleTrafficProbe(generation: Int, attempt: Int) {
        guard attempt <= 3 else { return }
        schedule(after: 3) { [weak self] in
            guard let self, self.isCurrentSession(generation) else { return }
            self.probeTraffic(generation: generation, attempt: attempt)
        }
    }

    private func probeTraffic(generation: Int, attempt: Int) {
        guard let adapter else { return }
        adapter.getRuntimeConfiguration { [weak self] text in
            guard let self, self.isCurrentSession(generation) else { return }
            if let text {
                let stats = Self.parseRuntimeStats(text)
                self.recordTraffic(stats)
                if stats.hasTraffic {
                    self.logFirstTrafficIfNeeded(stats, generation: generation)
                    return
                }
            }
            self.scheduleTrafficProbe(generation: generation, attempt: attempt + 1)
        }
    }

    /// Ghi rx/tx mới nhất vào ảnh chụp trạng thái (app đọc được).
    private func recordTraffic(_ stats: RuntimeStats) {
        sessionLock.lock()
        statusRxBytes = stats.rxBytes
        statusTxBytes = stats.txBytes
        sessionLock.unlock()
    }

    /// Log byte đầu tiên đúng một lần cho mỗi phiên (kèm bộ đếm gói của relay nếu có).
    private func logFirstTrafficIfNeeded(_ stats: RuntimeStats, generation: Int) {
        sessionLock.lock()
        let alreadyLogged = firstTrafficLogged
        firstTrafficLogged = true
        connectHasTraffic = true
        sessionLock.unlock()
        guard !alreadyLogged else { return }
        // Cảnh báo RELAY_URL_MISSING chỉ đúng khi chưa có đường nào chạy. Khi peer đã có
        // traffic (đường UDP trực tiếp chạy được), xoá mã để app không hiện lỗi giả.
        if statusSnapshot().code == TunnelDiagnosticCode.relayURLMissing {
            setStatus(state: "up")
        }
        let relays = relayCounters
        note("first bytes received: rx=\(stats.rxBytes) tx=\(stats.txBytes) transport=\(self.activeTransportName) relay[\(relays)] (session \(generation))")
    }

    /// Bộ đếm gói của relay đang dùng — đọc được cả khi WireGuard runtime rỗng.
    private var relayCounters: String {
        if let relay { return relay.countersSummary() }
        if let wsRelay { return wsRelay.countersSummary() }
        return "direct"
    }

    // MARK: - Watchdog

    /// Sau khi tunnel "lên", hẹn kiểm tra peer có handshake/traffic thật chưa.
    private func scheduleWatchdog(generation: Int) {
        schedule(after: watchdogGrace) { [weak self] in
            guard let self, self.isCurrentSession(generation) else { return }
            self.runWatchdogCheck(generation: generation)
        }
    }

    /// Đọc runtime config của WireGuard để biết peer đã handshake/chuyển byte chưa.
    /// Tunnel "lên" (NE báo connected) mà runtime rỗng nghĩa là client không có mạng —
    /// đúng ca khách báo. Gặp ca đó thì dựng lại phiên.
    private func runWatchdogCheck(generation: Int) {
        guard let adapter else { return }
        adapter.getRuntimeConfiguration { [weak self] text in
            guard let self, self.isCurrentSession(generation) else { return }
            // Runtime rỗng = adapter chưa ở trạng thái started (ví dụ iOS đang
            // temporaryShutdown vì mất mạng). Chưa dựng lại, để nó tự hồi — nhưng phải
            // hẹn kiểm lại, không im lặng dừng watchdog.
            guard let text else {
                self.deferWatchdog(generation: generation, reason: "runtime config unavailable")
                return
            }
            let stats = Self.parseRuntimeStats(text)
            self.recordTraffic(stats)
            if stats.hasTraffic {
                self.logFirstTrafficIfNeeded(stats, generation: generation)
                self.note("watchdog: traffic ok rx=\(stats.rxBytes) tx=\(stats.txBytes) handshakeAge=\(Int(stats.handshakeAge))s relay[\(self.relayCounters)]")
                return
            }
            // Chưa có traffic nhưng relay vẫn đang kết nối: để chuỗi transport chạy tiếp,
            // dựng lại lúc này chỉ cắt ngang bước fallback hợp lệ. Chỉ rebuild khi transport
            // đang dùng đã "connected" (hoặc direct UDP) mà peer vẫn im lặng.
            if !self.activeTransportIsConnected {
                self.deferWatchdog(generation: generation, reason: "transport still connecting")
                return
            }
            self.log.error("watchdog: no handshake/traffic \(Int(watchdogGrace))s after start — rebuilding session")
            RelayDiagnostics.shared.log("watchdog: no handshake after \(Int(watchdogGrace))s — rebuilding (attempt \(self.watchdogRebuilds + 1)/\(maxWatchdogRebuilds))")
            self.rebuildFromWatchdog(generation: generation)
        }
    }

    /// Hoãn kiểm tra watchdog (transport còn kết nối / runtime chưa sẵn sàng) và hẹn kiểm
    /// lại. Có trần `maxWatchdogDeferrals`: hết trần thì vẫn dựng lại phiên thay vì hoãn mãi.
    private func deferWatchdog(generation: Int, reason: String) {
        if watchdogDeferrals < maxWatchdogDeferrals {
            watchdogDeferrals += 1
            note("watchdog: \(reason) after \(Int(watchdogGrace))s — re-checking (\(self.watchdogDeferrals)/\(maxWatchdogDeferrals))")
            scheduleWatchdog(generation: generation)
        } else {
            log.error("watchdog: \(reason) after \(maxWatchdogDeferrals) re-checks — rebuilding anyway")
            RelayDiagnostics.shared.log("watchdog: \(reason) after \(maxWatchdogDeferrals) re-checks — rebuilding anyway")
            rebuildFromWatchdog(generation: generation)
        }
    }

    /// Dựng lại phiên "lên nhưng không có mạng": dừng sạch, đọc lại cấu hình MỚI từ
    /// protocolConfiguration rồi start lại. Tối đa `maxWatchdogRebuilds` lần.
    private func rebuildFromWatchdog(generation: Int) {
        guard isCurrentSession(generation) else { return }
        guard watchdogRebuilds < maxWatchdogRebuilds else {
            // Bỏ cuộc: tunnel vẫn "Connected" nhưng không có mạng. Đặt mã chẩn đoán để app
            // đọc qua `handleAppMessage` và hiện thông báo tiếng Việt cho khách — im lặng
            // ở đây chính là lỗi cũ (khách chỉ thấy Connected rồi tự đoán).
            log.error("watchdog: giving up after \(self.watchdogRebuilds) rebuilds")
            RelayDiagnostics.shared.log("watchdog: giving up after \(watchdogRebuilds) rebuilds — tunnel left up but not carrying traffic")
            setStatus(
                state: "no_traffic",
                code: TunnelDiagnosticCode.noTraffic,
                message: "Tunnel đã kết nối nhưng không nhận được dữ liệu nào (mã TUNNEL_NO_TRAFFIC). "
                    + "Ứng dụng đã tự dựng lại phiên \(watchdogRebuilds) lần mà vẫn không có traffic. "
                    + "Vui lòng kiểm tra mạng, chọn server khác rồi bấm Connect lại."
            )
            return
        }
        watchdogRebuilds += 1
        setStatus(
            state: "rebuilding",
            message: "Chưa nhận được dữ liệu — đang dựng lại phiên (lần \(watchdogRebuilds)/\(maxWatchdogRebuilds))"
        )

        stopSessionResources { [weak self] in
            guard let self else { return }
            guard let config = self.configuration else {
                RelayDiagnostics.shared.log("watchdog: cannot rebuild — configuration missing")
                self.setStatus(
                    state: "failed",
                    code: TunnelDiagnosticCode.noTraffic,
                    message: "Không dựng lại được phiên (thiếu cấu hình). Vui lòng bấm Disconnect rồi Connect lại."
                )
                return
            }
            let newGeneration = self.beginSession()
            self.note("watchdog: rebuilding session \(newGeneration) (attempt \(self.watchdogRebuilds))")
            self.startSession(config: config, generation: newGeneration) { [weak self] error in
                if let error {
                    self?.log.error("watchdog: rebuild failed: \(error.localizedDescription)")
                    RelayDiagnostics.shared.log("watchdog: rebuild failed: \(error.localizedDescription)")
                } else {
                    self?.note("watchdog: session rebuilt")
                }
            }
        }
    }

    private struct RuntimeStats {
        var rxBytes = 0
        var txBytes = 0
        var handshakeAge: TimeInterval = 0
        var hasTraffic: Bool { rxBytes > 0 || txBytes > 0 || handshakeAge > 0 }
    }

    /// Parse UAPI runtime config (`wgGetConfig`) — mỗi peer có `rx_bytes`, `tx_bytes`,
    /// `last_handshake_time_sec`. Không phụ thuộc log của adapter.
    private static func parseRuntimeStats(_ text: String) -> RuntimeStats {
        var stats = RuntimeStats()
        for line in text.split(separator: "\n") {
            let pair = line.split(separator: "=", maxSplits: 1)
            guard pair.count == 2 else { continue }
            switch String(pair[0]) {
            case "rx_bytes":
                stats.rxBytes += Int(pair[1]) ?? 0
            case "tx_bytes":
                stats.txBytes += Int(pair[1]) ?? 0
            case "last_handshake_time_sec":
                let handshake = TimeInterval(Int(pair[1]) ?? 0)
                if handshake > 0 {
                    stats.handshakeAge = max(0, Date().timeIntervalSince1970 - handshake)
                }
            default:
                break
            }
        }
        return stats
    }

    private func currentGeneration() -> Int {
        sessionLock.lock()
        defer { sessionLock.unlock() }
        return sessionGeneration
    }

    /// App hỏi trạng thái phiên (dùng cho thông báo lỗi). Trả JSON `TunnelStatusReport`;
    /// `code == TunnelDiagnosticCode.noTraffic` là ca "Connected nhưng không có mạng".
    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        let report = statusSnapshot()
        RelayDiagnostics.shared.log("app message: session=\(report.session) state=\(report.state) code=\(report.code ?? "-") transport=\(report.transport)")
        completionHandler?(try? JSONEncoder().encode(report))
    }

    /// Extracts and builds the WireGuard configuration from `protocolConfiguration`.
    private var configuration: WireGuardConfig? {
        guard let providerConfig = (protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration,
              let data = providerConfig["wireguard"] as? Data,
              let config = try? JSONDecoder().decode(WireGuardConfig.self, from: data) else {
            return nil
        }
        guard config.privateKeyBase64.isEmpty else {
            return config
        }
        let privateKey: PrivateKey?
        do {
            privateKey = try WireGuardPrivateKeyStore.loadPrivateKey()
        } catch {
            // Lỗi thật khi đọc (ví dụ errSecMissingEntitlement / errSecInteractionNotAllowed) —
            // phải in ra, vì trước đây `try?` nuốt lỗi nên log chỉ nói "Missing ..." và rất khó lần.
            log.error("Đọc khoá WireGuard thất bại: \(String(describing: error), privacy: .public)")
            return nil
        }
        guard let privateKey else {
            // errSecItemNotFound: app CHƯA ghi khoá vào nhóm chia sẻ (khác hẳn lỗi đọc).
            log.error("Missing WireGuard private key in shared Keychain (errSecItemNotFound — app chưa ghi khoá?)")
            return nil
        }
        return config.withPrivateKey(privateKey)
    }
}

private enum WireGuardPrivateKeyStore {
    static let service = "com.privatevpn.app.keys"
    static let accessGroup = "G6XW3RN6LJ.com.privatevpn.shared"
    static let privateKeyAccount = "wireguard.private-key"

    static func loadPrivateKey() throws -> PrivateKey? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: privateKeyAccount,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        #if os(macOS)
        // Keychain legacy của macOS BỎ QUA access group ⇒ extension không đọc được item do app ghi
        // trong nhóm shared (errSecItemNotFound, đo 14/09). Data-protection keychain mới hỗ trợ
        // access group ⇒ phải chỉ định, xem chú thích ở KeychainStore.
        query[kSecUseDataProtectionKeychain as String] = true
        #endif

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data else {
                return nil
            }
            return PrivateKey(rawValue: data)
        case errSecItemNotFound:
            return nil
        default:
            throw NSError(
                domain: "com.privatevpn.tunnel.keychain",
                code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Shared Keychain read failed"]
            )
        }
    }
}

private extension Logger {
    func log(level: OSLogType, _ message: String) {
        self.log(level: level, "\(message, privacy: .public)")
    }
}
