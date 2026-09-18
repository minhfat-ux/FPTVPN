import Foundation
import os

/// WireGuard-over-WebSocket relay client — the iOS counterpart of the Android
/// `WSRelayBridge`.
///
/// The WireGuard interface inside this extension is pointed at a local UDP listener
/// (`RelayUDPListener`). Instead of a length-prefixed TCP frame, each datagram is shipped
/// as one binary WebSocket message to the relay behind the Tailscale Funnel endpoint,
/// which unwraps the stream to WireGuard's UDP 443 on the exit node and sends the answers
/// back the same way (WebSocket keeps message boundaries, so one binary message is exactly
/// one datagram — no framing needed).
///
/// This is the transport that survives a full IP block: the client talks to shared
/// Tailscale infrastructure instead of the exit node's own IP, so blocking it means
/// blocking a range many unrelated services use.
///
/// Mỗi phiên là một instance MỚI: listener UDP, link WebSocket, queue và task đều thuộc
/// instance này. `stop()` huỷ hết, KHÔNG có trạng thái tĩnh dùng chung giữa các phiên —
/// đây là điều kiện để "Connect lần hai" không tái dùng client đã chết của lần một.
final class WSRelayClient: @unchecked Sendable {

    /// WireGuard datagrams held while the WebSocket is down. Bounded so an outage can
    /// never grow the extension's memory; WireGuard re-sends its handshake every 5s.
    private static let sendBufferLimit = 256
    /// Keepalive interval, mirroring the Android bridge's 20s ping interval. A
    /// half-open socket still reports itself as open, and the ping is what notices.
    private static let pingInterval: TimeInterval = 20
    private static let minBackoff: TimeInterval = 1
    /// Trần số gói chờ trong hàng đợi WS (vượt thì bỏ gói như UDP).
    /// Trần gói chờ trong hàng đợi WS. 512 gói ≈ 600KB in-flight ⇒ với RTT ~100ms qua
    /// Cloudflare chỉ đạt ~6 MB/s lý thuyết. Nâng lên 4096 để không tự chặn băng thông.
    private static let maxSendInflight = 4096
    private static let maxBackoff: TimeInterval = 15
    /// Nhịp log số frame trong 20 giây đầu (mỗi 5s một lần) để chẩn đoán được đường WS.
    private static let frameLogInterval: TimeInterval = 5
    private static let frameLogTicks = 4

    private let url: URL
    private let log: Logger
    private let listener: RelayUDPListener
    private let makeLink: @Sendable () -> RelayLink

    /// Guards every field below: the async loops and the link callbacks all touch them.
    private let lock = NSLock()
    private var running = false
    /// The WebSocket link of the current attempt. Never reused across sessions.
    private var link: RelayLink?
    private var open = false
    private var openedInThisAttempt = false
    private var sendTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    /// Số gói WS đang nằm trong hàng đợi của URLSession (không chờ từng gói).
    /// Dùng OSAllocatedUnfairLock vì NSLock không được gọi trong ngữ cảnh async (Swift 6).
    private let sendInflight = OSAllocatedUnfairLock(initialState: 0)
    private var heartbeatTask: Task<Void, Never>?
    private var frameLogTask: Task<Void, Never>?

    private var sentFrames = 0
    private var sentBytes = 0
    private var receivedFrames = 0
    private var receivedBytes = 0
    private var droppedNoLink = 0

    private let datagrams: AsyncStream<Data>
    private let datagramContinuation: AsyncStream<Data>.Continuation

    init(
        url: URL,
        log: Logger,
        linkFactory: (@Sendable () -> RelayLink)? = nil
    ) {
        self.url = url
        self.log = log
        self.listener = RelayUDPListener(label: "ws-relay-udp", log: log)
        // Mặc định dùng link WebSocket thật; test truyền link giả để không cần mạng.
        self.makeLink = linkFactory ?? { URLSessionRelayLink(url: url) }
        (datagrams, datagramContinuation) = AsyncStream.makeStream(
            of: Data.self,
            bufferingPolicy: .bufferingNewest(WSRelayClient.sendBufferLimit)
        )
    }

    /// True while the WebSocket to the relay is open. The tunnel uses this to decide
    /// whether this transport is actually carrying anything.
    var isConnected: Bool {
        lock.lock()
        defer { lock.unlock() }
        return open
    }

    /// Opens the local UDP listener and starts the WebSocket link.
    /// - Returns: the local UDP port WireGuard must send its datagrams to. It stays
    ///   the same for the whole lifetime of this client, WebSocket reconnects included.
    func start() throws -> UInt16 {
        let localPort = try listener.start { [weak self] datagram in
            self?.datagramContinuation.yield(datagram)
        }

        lock.lock()
        running = true
        lock.unlock()

        note("local udp listener 127.0.0.1:\(localPort) -> \(url.absoluteString)")

        // The WebSocket link is established (and re-established) on its own tasks, so a
        // relay that is briefly unreachable never blocks the tunnel from starting.
        startSendLoop()
        startWebSocketLoop()
        startHeartbeat()
        startFrameLogging()

        return localPort
    }

    func stop() {
        lock.lock()
        guard running else { lock.unlock(); return }
        running = false
        let currentLink = link
        link = nil
        open = false
        lock.unlock()

        datagramContinuation.finish()
        sendTask?.cancel()
        receiveTask?.cancel()
        heartbeatTask?.cancel()
        frameLogTask?.cancel()
        currentLink?.cancel()
        // Đóng socket + CHỜ thread đọc thoát hẳn trước khi trả về, để phiên sau bind lại
        // được và không bị thread cũ của phiên này đọc nhầm fd.
        listener.stop()
        note("stopped")
    }

    // MARK: - WebSocket side

    /// Drains queued datagrams into the WebSocket, one binary message per datagram.
    private func startSendLoop() {
        sendTask = Task { [weak self] in
            guard let stream = self?.datagrams else { return }
            for await datagram in stream {
                guard let self, self.isRunning else { return }
                guard let link = self.currentLink(), link.isOpen else {
                    self.noteDropped()
                    continue
                }
                // Không await từng gói: chờ từng gói làm tốc độ tụt còn ~1 gói/RTT
                // (đo thật: 200–320 kbps). URLSessionWebSocketTask tự xếp hàng, nên ta
                // chỉ cần chặn khi hàng đợi quá dài (tương đương UDP drop khi nghẽn).
                let inflight = self.sendInflight.withLock { $0 }
                if inflight >= WSRelayClient.maxSendInflight {
                    // Hàng đợi đầy: CHỜ một gói gửi xong rồi mới đọc gói tiếp (backpressure),
                    // TUYỆT ĐỐI không vứt gói. Vứt gói ở đây làm WireGuard mất gói liên tục
                    // ⇒ handshake/keepalive hỏng dần ⇒ "càng chạy càng chậm" (đo trên iPad).
                    do { try await link.send(datagram); self.noteSent(datagram.count) }
                    catch { self.noteDropped() }
                    continue
                }
                self.sendInflight.withLock { $0 += 1 }
                link.sendQueued(datagram) { [weak self] error in
                    guard let self else { return }
                    self.sendInflight.withLock { $0 -= 1 }
                    if error == nil { self.noteSent(datagram.count) } else { self.noteDropped() }
                }
            }
        }
    }

    /// Keeps one WebSocket open, reconnecting with a bounded backoff while running.
    private func startWebSocketLoop() {
        receiveTask = Task { [weak self] in
            var backoff = WSRelayClient.minBackoff
            while let self, self.isRunning {
                let opened = await self.serveOnce()
                guard self.isRunning else { return }
                backoff = opened ? WSRelayClient.minBackoff
                                 : min(backoff * 2, WSRelayClient.maxBackoff)
                self.note("link down, reconnecting in \(Int(backoff))s")
                try? await Task.sleep(nanoseconds: UInt64(backoff * 1_000_000_000))
            }
        }
    }

    /// Serves one WebSocket connection until it closes or fails.
    /// - Returns: whether the socket ever opened, which drives the reconnect backoff.
    private func serveOnce() async -> Bool {
        let link = makeLink()
        guard beginAttempt(link) else {
            link.cancel()
            return false
        }

        link.connect(
            onOpen: { [weak self] in self?.noteLinkOpened(link) },
            onClose: { [weak self] reason in self?.noteLinkClosed(link, reason: reason) }
        )
        let pingTask = startPingLoop(for: link)
        defer { pingTask.cancel() }

        do {
            while isRunning {
                handle(try await link.receive())
            }
        } catch {
            if isRunning { note("websocket link dropped: \(error.localizedDescription)") }
        }

        let opened = endAttempt(link)
        link.cancel()
        return opened
    }

    /// Registers a new connection as the current one.
    /// - Returns: false when the client was stopped meanwhile.
    private func beginAttempt(_ link: RelayLink) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard running else { return false }
        self.link = link
        open = false
        openedInThisAttempt = false
        return true
    }

    /// Releases the current connection and reports whether it ever opened.
    private func endAttempt(_ link: RelayLink) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if self.link === link { self.link = nil }
        let opened = openedInThisAttempt
        open = false
        return opened
    }

    /// One binary message is one datagram: hand it to WireGuard as-is.
    private func handle(_ message: RelayMessage) {
        switch message {
        case .data(let data):
            lock.lock()
            receivedFrames += 1
            receivedBytes += data.count
            lock.unlock()
            listener.sendToPeer([UInt8](data))
        case .text(let text):
            note("ignoring text frame (\(text.count) chars)")
        }
    }

    /// Pings the relay; a failing ping means the path is dead even though the socket
    /// still looks open. Cancelling the link makes `serveOnce` reconnect.
    private func startPingLoop(for link: RelayLink) -> Task<Void, Never> {
        Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(WSRelayClient.pingInterval * 1_000_000_000))
                guard !Task.isCancelled, let self, self.isRunning else { return }
                do {
                    try await link.ping()
                } catch {
                    self.note("ping failed: \(error.localizedDescription) — reconnecting")
                    link.cancel()
                    return
                }
            }
        }
    }

    // MARK: - Link callbacks

    private func noteLinkOpened(_ link: RelayLink) {
        lock.lock()
        if self.link === link { open = true; openedInThisAttempt = true }
        lock.unlock()
        note("handshake ok — connected to \(url.absoluteString)")
    }

    private func noteLinkClosed(_ link: RelayLink, reason: String) {
        lock.lock()
        if self.link === link { open = false }
        lock.unlock()
        // A deliberate stop() also closes the socket; that is not a failure.
        if isRunning { note("handshake/link closed: \(reason)") }
    }

    // MARK: - Diagnostics

    private func startHeartbeat() {
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                guard !Task.isCancelled, let self, self.isRunning else { return }
                self.note("heartbeat \(self.countersSummary())")
            }
        }
    }

    /// Log số frame nhận/gửi mỗi 5 giây trong 20 giây đầu — không có nó thì không ai
    /// chẩn đoán được đường WS đang chết ở đâu (bind? handshake? chiều nào?).
    private func startFrameLogging() {
        frameLogTask = Task { [weak self] in
            for tick in 1...WSRelayClient.frameLogTicks {
                try? await Task.sleep(
                    nanoseconds: UInt64(WSRelayClient.frameLogInterval * 1_000_000_000)
                )
                guard !Task.isCancelled, let self, self.isRunning else { return }
                self.note("frames t=\(Int(Double(tick) * WSRelayClient.frameLogInterval))s \(self.countersSummary())")
            }
        }
    }

    /// Logs to os_log at `.default` (visible without `--info`) *and* to the extension's
    /// diagnostic file. `privacy: .public` so the content is not redacted.
    private func note(_ message: String) {
        log.log(level: .default, "ws-relay: \(message, privacy: .public)")
        RelayDiagnostics.shared.log("ws-relay: \(message)")
    }

    /// Counters useful to spot which direction of the bridge went quiet.
    func countersSummary() -> String {
        lock.lock()
        defer { lock.unlock() }
        return "udpFrames=\(sentFrames) udpBytes=\(sentBytes) framesFromRelay=\(receivedFrames) bytesFromRelay=\(receivedBytes) droppedNoLink=\(droppedNoLink) wsOpen=\(open)"
    }

    private func noteSent(_ bytes: Int) {
        lock.lock()
        sentFrames += 1
        sentBytes += bytes
        lock.unlock()
    }

    private func noteDropped() {
        lock.lock()
        droppedNoLink += 1
        lock.unlock()
    }

    private var isRunning: Bool {
        lock.lock()
        defer { lock.unlock() }
        return running
    }

    private func currentLink() -> RelayLink? {
        lock.lock()
        defer { lock.unlock() }
        return link
    }
}
