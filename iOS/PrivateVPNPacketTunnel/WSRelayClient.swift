import Darwin
import Foundation
import os

/// WireGuard-over-WebSocket relay client — the iOS counterpart of the Android
/// `WSRelayBridge`.
///
/// The WireGuard interface inside this extension is pointed at a local UDP listener
/// here, exactly like `WGRelayClient` does. Instead of a length-prefixed TCP frame,
/// each datagram is shipped as one binary WebSocket message to the relay behind the
/// Tailscale Funnel endpoint, which unwraps the stream to WireGuard's UDP 443 on the
/// exit node and sends the answers back the same way (WebSocket keeps message
/// boundaries, so one binary message is exactly one datagram — no framing needed).
///
/// This is the transport that survives a full IP block: the client talks to shared
/// Tailscale infrastructure instead of the exit node's own IP, so blocking it means
/// blocking a range many unrelated services use.
///
/// The local UDP port is bound once in `start()` and is never re-bound: WebSocket
/// reconnects reuse the same listener, so WireGuard is never reconfigured mid-tunnel.
final class WSRelayClient: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {

    enum RelayError: Error, CustomStringConvertible {
        case socket(String)

        var description: String {
            switch self {
            case .socket(let detail): return "ws relay socket error: \(detail)"
            }
        }
    }

    /// Funnel endpoint that terminates TLS and forwards the stream to the relay that
    /// unwraps it to the exit node's WireGuard UDP 443.
    ///
    /// Giá trị thật nằm ở `WSRelayDefaults` (ControlAPIClient.swift) vì file đó được
    /// compile vào cả app lẫn extension — danh sách node dự phòng trong app cũng cần
    /// URL này. Chỉ dẫn tới node-1, nên đây là giá trị ĐOÁN khi node không khai relay.
    static let defaultURL = WSRelayDefaults.url

    /// WireGuard datagrams held while the WebSocket is down. Bounded so an outage can
    /// never grow the extension's memory; WireGuard re-sends its handshake every 5s.
    private static let sendBufferLimit = 256
    /// Keepalive interval, mirroring the Android bridge's 20s ping interval. A
    /// half-open socket still reports itself as open, and the ping is what notices.
    private static let pingInterval: TimeInterval = 20
    private static let minBackoff: TimeInterval = 1
    private static let maxBackoff: TimeInterval = 15

    private let url: URL
    private let log: Logger

    /// Guards every field below: the UDP thread, the async loops and the URLSession
    /// delegate queue all touch them.
    private let lock = NSLock()
    private var udpFD: Int32 = -1
    private var running = false
    /// Last address WireGuard sent from — replies go back here, never to a hardcoded
    /// port (WireGuard picks its own source port).
    private var peerAddress: sockaddr_in?
    private var socketTask: URLSessionWebSocketTask?
    private var open = false
    private var openedInThisAttempt = false
    private var sendTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?

    private var sentFrames = 0
    private var sentBytes = 0
    private var receivedFrames = 0
    private var receivedBytes = 0
    private var droppedNoLink = 0

    private let datagrams: AsyncStream<Data>
    private let datagramContinuation: AsyncStream<Data>.Continuation

    private lazy var session = URLSession(
        configuration: .default,
        delegate: self,
        delegateQueue: nil
    )

    init(url: URL = WSRelayClient.defaultURL, log: Logger) {
        self.url = url
        self.log = log
        (datagrams, datagramContinuation) = AsyncStream.makeStream(
            of: Data.self,
            bufferingPolicy: .bufferingNewest(WSRelayClient.sendBufferLimit)
        )
        super.init()
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
        let udp = socket(AF_INET, SOCK_DGRAM, 0)
        guard udp >= 0 else { throw RelayError.socket("udp socket errno=\(errno)") }

        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = 0
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(udp, $0, length) }
        }
        let named = withUnsafeMutablePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(udp, $0, &length) }
        }
        guard bound == 0, named == 0 else {
            close(udp)
            throw RelayError.socket("udp bind errno=\(errno)")
        }

        let localPort = UInt16(bigEndian: address.sin_port)
        lock.lock()
        udpFD = udp
        running = true
        lock.unlock()

        note("local udp listener 127.0.0.1:\(localPort) -> \(url.absoluteString)")

        // The WebSocket link is established (and re-established) on its own tasks, so a
        // relay that is briefly unreachable never blocks the tunnel from starting.
        let readThread = Thread { [weak self] in self?.udpToWebSocketLoop() }
        readThread.name = "ws-relay-udp"
        readThread.start()
        startSendLoop()
        startWebSocketLoop()
        startHeartbeat()

        return localPort
    }

    func stop() {
        lock.lock()
        guard running else { lock.unlock(); return }
        running = false
        let udp = udpFD
        let task = socketTask
        udpFD = -1
        socketTask = nil
        open = false
        lock.unlock()

        datagramContinuation.finish()
        sendTask?.cancel()
        receiveTask?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        // URLSession retains its delegate, so the client would leak without this.
        // A stopped client is never restarted; the tunnel builds a new one instead.
        session.invalidateAndCancel()
        if udp >= 0 { close(udp) }
        note("stopped")
    }

    // MARK: - UDP side

    /// Forwards every WireGuard datagram to the WebSocket send loop.
    private func udpToWebSocketLoop() {
        var buffer = [UInt8](repeating: 0, count: 65_535)
        while isRunning {
            var sender = sockaddr_in()
            var senderLength = socklen_t(MemoryLayout<sockaddr_in>.size)
            let udp = currentUDPFD()
            guard udp >= 0 else { Thread.sleep(forTimeInterval: 0.2); continue }
            let received = buffer.withUnsafeMutableBytes { raw -> Int in
                guard let base = raw.baseAddress else { return -1 }
                return withUnsafeMutablePointer(to: &sender) { pointer in
                    pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                        recvfrom(udp, base, raw.count, 0, $0, &senderLength)
                    }
                }
            }
            guard received > 0 else {
                if isRunning && errno != EINTR { Thread.sleep(forTimeInterval: 0.2) }
                continue
            }

            lock.lock()
            peerAddress = sender
            lock.unlock()

            // Bounded queue: while the WebSocket is down the oldest datagrams are
            // dropped rather than buffered without limit.
            datagramContinuation.yield(Data(buffer[0..<received]))
        }
    }

    /// Writes a datagram received from the relay back to the remembered WireGuard peer.
    private func sendToWireGuard(_ payload: [UInt8]) {
        lock.lock()
        let udp = udpFD
        let target = peerAddress
        lock.unlock()
        guard udp >= 0, var destination = target else { return }
        _ = payload.withUnsafeBytes { raw in
            withUnsafePointer(to: &destination) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    sendto(udp, raw.baseAddress, raw.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
        }
    }

    // MARK: - WebSocket side

    /// Drains queued datagrams into the WebSocket, one binary message per datagram.
    private func startSendLoop() {
        sendTask = Task { [weak self] in
            guard let stream = self?.datagrams else { return }
            for await datagram in stream {
                guard let self, self.isRunning else { return }
                guard let task = self.currentSocketTask(), self.isConnected else {
                    self.noteDropped()
                    continue
                }
                do {
                    try await task.send(.data(datagram))
                    self.noteSent(datagram.count)
                } catch {
                    // The receive loop sees the same failure and reconnects.
                    self.noteDropped()
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
        let task = session.webSocketTask(with: url)
        guard beginAttempt(task) else {
            task.cancel(with: .goingAway, reason: nil)
            return false
        }

        task.resume()
        let pingTask = startPingLoop(for: task)
        defer { pingTask.cancel() }

        do {
            while isRunning {
                handle(try await task.receive())
            }
        } catch {
            if isRunning { note("websocket link dropped: \(error.localizedDescription)") }
        }

        let opened = endAttempt(task)
        task.cancel(with: .goingAway, reason: nil)
        return opened
    }

    /// Registers a new connection as the current one.
    /// - Returns: false when the client was stopped meanwhile.
    private func beginAttempt(_ task: URLSessionWebSocketTask) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard running else { return false }
        socketTask = task
        open = false
        openedInThisAttempt = false
        return true
    }

    /// Releases the current connection and reports whether it ever opened.
    private func endAttempt(_ task: URLSessionWebSocketTask) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if socketTask === task { socketTask = nil }
        let opened = openedInThisAttempt
        open = false
        return opened
    }

    /// One binary message is one datagram: hand it to WireGuard as-is.
    private func handle(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .data(let data):
            lock.lock()
            receivedFrames += 1
            receivedBytes += data.count
            lock.unlock()
            sendToWireGuard([UInt8](data))
        case .string(let text):
            note("ignoring text frame (\(text.count) chars)")
        @unknown default:
            break
        }
    }

    /// Pings the relay; a failing ping means the path is dead even though the socket
    /// still looks open. Cancelling the task makes `serveOnce` reconnect.
    private func startPingLoop(for task: URLSessionWebSocketTask) -> Task<Void, Never> {
        Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(WSRelayClient.pingInterval * 1_000_000_000))
                guard !Task.isCancelled, let self, self.isRunning else { return }
                do {
                    try await self.ping(task)
                } catch {
                    self.note("ping failed: \(error.localizedDescription) — reconnecting")
                    task.cancel(with: .goingAway, reason: nil)
                    return
                }
            }
        }
    }

    private func ping(_ task: URLSessionWebSocketTask) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            task.sendPing { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        lock.lock()
        openedInThisAttempt = true
        open = true
        lock.unlock()
        note("connected to \(url.absoluteString)")
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        lock.lock()
        open = false
        lock.unlock()
        // A deliberate stop() also closes the socket; that is not a failure.
        if isRunning { note("websocket closed code=\(closeCode.rawValue)") }
    }

    // MARK: - Diagnostics

    private func startHeartbeat() {
        let thread = Thread { [weak self] in
            while let self, self.isRunning {
                Thread.sleep(forTimeInterval: 15)
                guard self.isRunning else { return }
                self.note("heartbeat \(self.countersSummary())")
            }
        }
        thread.name = "ws-relay-heartbeat"
        thread.start()
    }

    /// Logs to os_log *and* to the extension's diagnostic file (iOS offers no way to
    /// stream an app-extension's log from the command line).
    private func note(_ message: String) {
        log.info("ws-relay: \(message)")
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

    private func currentUDPFD() -> Int32 {
        lock.lock()
        defer { lock.unlock() }
        return udpFD
    }

    private func currentSocketTask() -> URLSessionWebSocketTask? {
        lock.lock()
        defer { lock.unlock() }
        return socketTask
    }
}
