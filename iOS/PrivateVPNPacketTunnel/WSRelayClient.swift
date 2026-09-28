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
    /// H3 (24/09/2026) — trần số datagram ĐỆM trong lúc chưa có link (WS đang dựng lại).
    /// Vì sao phải đệm thay vì vứt: gói QUIC Initial của transport MỚI rơi đúng vào lúc link
    /// chưa mở; vứt nó thì QUIC không bắt tay được (`udpFrames` còn 0,25/s, `droppedNoLink=6`
    /// trong log thật) — transport mới coi như chết dù WS vẫn mở.
    /// 512 gói × ≤1500 B ≈ 750 KB: đủ trùm vài giây dựng lại link, vẫn có trần cứng.
    /// Nguồn sự thật của hai trần này là `RampStatus.DataPathQueuePolicy` (luật THUẦN, có test
    /// ở `scripts/ios-pure-logic-tests`) — KHÔNG khai lại giá trị ở đây.
    private static let pendingLinkLimit = RampStatus.DataPathQueuePolicy.linkDownMaxPackets
    /// Trần THỜI GIAN đệm: gói nằm quá lâu thì thả (QUIC tự gửi lại) để bộ đệm không giữ rác.
    private static let pendingLinkTTL = RampStatus.DataPathQueuePolicy.linkDownMaxAgeS
    /// Keepalive interval, mirroring the Android bridge's 20s ping interval. A
    /// half-open socket still reports itself as open, and the ping is what notices.
    private static let pingInterval: TimeInterval = 20
    private static let minBackoff: TimeInterval = 1
    private static let maxBackoff: TimeInterval = 15
    /// Nhịp log số frame trong 20 giây đầu (mỗi 5s một lần) để chẩn đoán được đường WS.
    private static let frameLogInterval: TimeInterval = 5
    private static let frameLogTicks = 4

    private let url: URL
    private let log: Logger
    private let listener: RelayUDPListener
    private let makeLink: @Sendable () -> RelayLink

    /// Gọi khi link WebSocket ĐỨT (link tự báo: server đóng, hoặc `receive()` ném lỗi).
    ///
    /// Vì sao cần callback chứ không để tầng trên tự đoán: `framesFromRelay` đứng yên KHÔNG
    /// có nghĩa là transport chết (tunnel im lặng thì relay cũng không gửi gì về), còn
    /// bộ đếm byte của WireGuard lại TĂNG ngay cả khi relay chưa chở được gói nào
    /// (`peer.SendBuffer` cộng `tx_bytes` khi gói được giao cho listener cục bộ —
    /// `wireguard-go/device/peer.go:128`). Mốc "link đứt lúc t=+Ns" chỉ link mới biết.
    var onLinkLost: (@Sendable (String) -> Void)?

    /// Gọi khi link WebSocket **MỞ LẠI sau khi đã đứt** (lần mở ĐẦU của phiên KHÔNG tính).
    ///
    /// Vì sao cần callback riêng: WS chỉ đứt rồi mở lại khi ĐƯỜNG NỀN đổi (hoặc mạng chập chờn)
    /// — đây là bằng chứng TỨC THỜI mạnh nhất mà tầng trên có, trong khi nhịp lấy mẫu băng thông
    /// có thể đã ngừng vì `bandwidthBytes == nil`. Sự cố thật 02:21 iPhone 1.4.5/34: chỉ 2 mẫu
    /// `bw: sample` rồi im suốt 3 phút, link WS đứt 02:21:37 rồi mở lại 02:21:39, **không** có
    /// dòng `bw: net đổi giữa phiên` nào ⇒ không dựng lại transport ⇒ tốc độ còn 0–550 kbps.
    var onLinkReopened: (@Sendable () -> Void)?

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
    ///
    /// BUG-IOS-JETSAM-001: bản cũ đếm GÓI với trần **4096** (≈6 MB payload, cộng object +
    /// completion + buffer của URLSession ⇒ vài chục MB — quá nửa trần jetsam ~51 MB của iOS).
    /// Nay trần là **số gói + số byte** và lấy từ `RampStatus.SendBudget` (luật thuần, có test).
    /// Dùng OSAllocatedUnfairLock vì NSLock không được gọi trong ngữ cảnh async (Swift 6).
    private let sendBudget = OSAllocatedUnfairLock(initialState: RampStatus.SendBudget())
    private var heartbeatTask: Task<Void, Never>?
    private var frameLogTask: Task<Void, Never>?

    private var sentFrames = 0
    private var sentBytes = 0
    private var receivedFrames = 0
    private var receivedBytes = 0
    private var droppedNoLink = 0
    /// H3 — datagram đến lúc CHƯA có link, đang được đệm chờ link mở (mốc thời gian để TTL).
    /// Trần cứng + số gói đã thả nằm trong `RampStatus.BoundedBuffer` (trần theo GÓI, thả CŨ NHẤT).
    private var pendingWhileLinkDown = RampStatus.BoundedBuffer<(at: Date, data: Data)>(
        maxCount: WSRelayClient.pendingLinkLimit
    )
    /// Datagram nhận từ socket UDP cục bộ (Go → relay) và số đã lấy RA khỏi `AsyncStream`.
    ///
    /// Vì sao đếm hai số này: `AsyncStream` với `.bufferingNewest` giữ TỐI ĐA `sendBufferLimit`
    /// phần tử và **thả gói cũ nhất KHÔNG có API báo** — không đếm thì hàng đợi này là chỗ duy
    /// nhất trên đường dữ liệu phình/vứt mà log không thấy. Hiệu số (trừ sức chứa của stream)
    /// là số gói đã bị thả im lặng.
    private var listenerDatagrams = 0
    private var streamPopped = 0
    private var pendingLogAt = Date.distantPast
    /// Đã báo "link đứt" cho lượt thử này chưa (mỗi lượt báo đúng một lần).
    private var linkLossNotified = false

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

    /// Link đã TỪNG mở (đã gửi hoặc nhận được ít nhất một frame).
    ///
    /// Tầng trên dùng cờ này để KHÔNG bỏ đường WebSocket chỉ vì một mẫu `isConnected == false`:
    /// link vừa đứt và đang tự nối lại vẫn cho `isConnected == false`, nhưng bỏ nó ở thời điểm
    /// đó nghĩa là tự tay cắt đường duy nhất đi qua Cloudflare (xem `scheduleDirectFallback`).
    var hasEverOpened: Bool {
        lock.lock()
        defer { lock.unlock() }
        return sentFrames > 0 || receivedFrames > 0 || open
    }

    /// Opens the local UDP listener and starts the WebSocket link.
    /// - Returns: the local UDP port WireGuard must send its datagrams to. It stays
    ///   the same for the whole lifetime of this client, WebSocket reconnects included.
    func start() throws -> UInt16 {
        let localPort = try listener.start { [weak self] datagram in
            guard let self else { return }
            // Đếm TRƯỚC khi `yield` (xem `listenerDatagrams`). `noteListenerDatagram` tự nhả khoá
            // trước khi trả về, nên `yield` bên dưới chạy khi KHÔNG giữ khoá: `yield` có thể đánh
            // thức ngay task gửi trên CÙNG luồng ⇒ `lock.lock()` lồng nhau ⇒ NSLock không tái nhập
            // ⇒ chết cứng cả phiên (AGENTS.md §7c).
            self.noteListenerDatagram()
            self.datagramContinuation.yield(datagram)
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
        // H3 — bộ đệm chờ link thuộc phiên này: xoá để không giữ gói của phiên cũ.
        let pendingCount = pendingWhileLinkDown.count
        pendingWhileLinkDown.removeAll()
        lock.unlock()
        // Trần hàng đợi gửi cũng thuộc phiên này: completion của URLSession có thể trả về muộn,
        // để nguyên thì bộ đếm của phiên cũ trừ vào phiên mới.
        sendBudget.withLock { $0.reset() }
        if pendingCount > 0 {
            note("bỏ \(pendingCount) gói còn đệm khi dừng phiên")
        }

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
                self.noteStreamPopped()
                guard let link = self.currentLink(), link.isOpen else {
                    // H3 (24/09/2026): link chưa mở ⇒ ĐỆM, không vứt. Trước đây gói bắt tay
                    // của transport vừa dựng lại bị bỏ ở đây ⇒ QUIC mới không bao giờ lên.
                    //
                    // `autoreleasepool`: luồng của Swift concurrency KHÔNG có pool tự động, mà
                    // `URLSession` là Objective-C ⇒ object tự động nhả của MỖI gói nằm lại vĩnh
                    // viễn nếu không có pool. Đây đúng dạng rò "theo LƯU LƯỢNG, không theo thời
                    // gian" của BUG-IOS-JETSAM-001.
                    autoreleasepool { self.holdWhileLinkDown(datagram) }
                    continue
                }
                // Link đã mở lại: xả gói đệm TRƯỚC gói vừa đọc (thứ tự bắt tay được giữ).
                autoreleasepool { self.flushWhileLinkDown(into: link) }
                // Không await từng gói: chờ từng gói làm tốc độ tụt còn ~1 gói/RTT
                // (đo thật: 200–320 kbps). URLSessionWebSocketTask tự xếp hàng, nên ta chỉ cần
                // chặn khi hàng đợi quá dài — nhưng TRẦN phải là trần CỨNG theo gói VÀ byte
                // (`RampStatus.SendBudget`), không phải "khi nào nhớ thì kiểm".
                switch self.sendBudget.withLock({ $0.admit(packetBytes: datagram.count) }) {
                case .accept:
                    autoreleasepool {
                        link.sendQueued(datagram) { [weak self] error in
                            guard let self else { return }
                            self.sendBudget.withLock { $0.release(packetBytes: datagram.count) }
                            if error == nil { self.noteSent(datagram.count) } else { self.noteDropped() }
                        }
                    }
                case .backpressure:
                    // Hàng đợi đầy: CHỜ một gói gửi xong rồi mới đọc gói tiếp (backpressure),
                    // TUYỆT ĐỐI không vứt gói. Vứt gói ở đây làm WireGuard mất gói liên tục
                    // ⇒ handshake/keepalive hỏng dần ⇒ "càng chạy càng chậm" (đo trên iPad).
                    // Lần bị chặn đã được `SendBudget` đếm (`waits`) nên log thấy được ngay.
                    do {
                        try await link.send(datagram)
                        self.noteSent(datagram.count)
                    } catch {
                        self.noteDropped()
                    }
                case .drop:
                    // Gói to hơn CẢ trần byte: chờ cũng không bao giờ lọt ⇒ thả CÓ ĐẾM.
                    self.noteDropped()
                }
            }
        }
    }

    // MARK: - H3: đệm datagram trong lúc chưa có link

    /// Giữ một datagram đến lúc link CHƯA mở, có trần cả số gói lẫn thời gian.
    ///
    /// Vì sao đệm chứ không vứt: transport dựng lại (ramp/liveness) đúng lúc Go gửi lại QUIC
    /// Initial; vứt gói đó thì transport mới không bắt tay được (log thật 24/09/2026:
    /// `droppedNoLink=6`, `udpFrames` 0,25/s). Khi quá trần thì thả gói CŨ NHẤT (FIFO) — QUIC
    /// tự gửi lại Initial theo PTO nên gói mới ở đuôi bộ đệm là gói còn giá trị.
    private func holdWhileLinkDown(_ datagram: Data) {
        let now = Date()
        lock.lock()
        let droppedBefore = pendingWhileLinkDown.dropped
        var evictedByTTL = 0
        while let first = pendingWhileLinkDown.items.first,
              now.timeIntervalSince(first.at) > WSRelayClient.pendingLinkTTL {
            pendingWhileLinkDown.dropOldest()
            evictedByTTL += 1
        }
        let evictedByLimit = pendingWhileLinkDown.append((at: now, data: datagram))
        // Mọi gói bị thả (TTL hoặc quá trần) đều vào `droppedNoLink` — thả mà im lặng là
        // đúng thứ đã làm log 25/09/2026 không nhìn ra hàng đợi nào phình.
        let evicted = pendingWhileLinkDown.dropped - droppedBefore
        droppedNoLink += evicted
        let pending = pendingWhileLinkDown.count
        let buffered = pendingWhileLinkDown.appended
        let dropped = pendingWhileLinkDown.dropped
        let shouldLog = now.timeIntervalSince(pendingLogAt) >= WSRelayClient.frameLogInterval
        if shouldLog { pendingLogAt = now }
        lock.unlock()
        if shouldLog {
            note(
                "chưa có link — ĐỆM \(pending) gói chờ link mở (tổng đệm \(buffered), "
                    + "đã thả \(dropped): TTL \(Int(WSRelayClient.pendingLinkTTL))s/trần "
                    + "\(WSRelayClient.pendingLinkLimit) gói"
                    + (evictedByLimit > 0 ? "; vừa thả \(evictedByLimit) gói vì quá trần" : "")
                    + ")"
            )
        }
    }

    /// Link vừa mở lại: gửi hết gói đã đệm (theo đúng thứ tự nhận) rồi mới tới gói mới.
    ///
    /// **Tôn trọng TRẦN của hàng đợi gửi**: phần chưa nạp được (hàng đợi đầy) được ĐẶT LẠI lên
    /// đầu bộ đệm và xả ở nhịp sau — bản cũ nạp thẳng `sendInflight += 1` cho TẤT CẢ 512 gói,
    /// tức là xả đệm đi VÒNG QUA trần (đúng lúc hàng đợi đang đầy nhất).
    private func flushWhileLinkDown(into link: RelayLink) {
        lock.lock()
        let held = pendingWhileLinkDown.drain()
        let buffered = pendingWhileLinkDown.appended
        let dropped = pendingWhileLinkDown.dropped
        lock.unlock()
        guard !held.isEmpty else { return }
        var sent = 0
        var rest: [(at: Date, data: Data)] = []
        for item in held {
            switch sendBudget.withLock({ $0.admit(packetBytes: item.data.count) }) {
            case .accept:
                sent += 1
                autoreleasepool {
                    link.sendQueued(item.data) { [weak self] error in
                        guard let self else { return }
                        self.sendBudget.withLock { $0.release(packetBytes: item.data.count) }
                        if error == nil { self.noteSent(item.data.count) } else { self.noteDropped() }
                    }
                }
            case .backpressure:
                rest.append(item)
            case .drop:
                noteDropped()
            }
        }
        if !rest.isEmpty {
            lock.lock()
            let evicted = pendingWhileLinkDown.requeueFront(rest)
            if evicted > 0 { droppedNoLink += evicted }
            let kept = pendingWhileLinkDown.count
            lock.unlock()
            note(
                "xả đệm: hàng đợi gửi đã chạm trần — giữ lại \(kept) gói đệm cho nhịp sau"
                    + (evicted > 0 ? " (thả \(evicted) gói cũ nhất)" : "")
            )
        }
        if sent > 0 {
            note("link đã mở lại — XẢ \(sent)/\(held.count) gói đã đệm (tổng đệm \(buffered), đã thả \(dropped))")
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
                let message = try await link.receive()
                // `autoreleasepool` cho MỖI frame: luồng của Swift concurrency không có pool tự
                // động mà đường này đi qua `URLSession` (Objective-C) ⇒ object tự động nhả của
                // mỗi frame nằm lại vĩnh viễn nếu không có pool (rò theo LƯU LƯỢNG).
                autoreleasepool { handle(message) }
            }
        } catch {
            if isRunning {
                note("websocket link dropped: \(error.localizedDescription)")
                notifyLinkLost("đọc WS lỗi: \(error.localizedDescription)")
            }
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
        linkLossNotified = false
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
        notifyLinkReopened()
    }

    /// Báo tầng trên khi link MỞ LẠI sau khi đã đứt.
    ///
    /// Điều kiện `linkLossNotified`: lần mở ĐẦU của phiên không phải "mở lại" (lúc đó chưa có
    /// gì đứt) nên không báo — tránh một lần đánh giá/dựng lại vô ích ngay sau khi khách nối.
    /// Sau lần đứt đầu tiên thì mọi lần mở đều báo; tầng trên tự chặn bằng cooldown + lọc
    /// "đổi mạng giả" (`RampStatus.NetworkChangePolicy`).
    private func notifyLinkReopened() {
        lock.lock()
        guard linkLossNotified else { lock.unlock(); return }
        let callback = onLinkReopened
        lock.unlock()
        callback?()
    }

    private func noteLinkClosed(_ link: RelayLink, reason: String) {
        lock.lock()
        if self.link === link { open = false }
        lock.unlock()
        // A deliberate stop() also closes the socket; that is not a failure.
        if isRunning {
            note("handshake/link closed: \(reason)")
            notifyLinkLost("WS đóng: \(reason)")
        }
    }

    /// Báo cho tầng trên biết link vừa đứt (mỗi lượt thử báo một lần). Không dùng để tự dựng
    /// lại ngay: client vẫn tự nối lại với backoff — tầng trên chỉ cần mốc thời gian + lý do.
    private func notifyLinkLost(_ reason: String) {
        lock.lock()
        guard !linkLossNotified else { lock.unlock(); return }
        linkLossNotified = true
        let callback = onLinkLost
        lock.unlock()
        callback?(reason)
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

    /// Số frame hai chiều đã đi qua WebSocket của phiên này.
    ///
    /// Vì sao cần tách khỏi `countersSummary()`: provider phải QUYẾT ĐỊNH được (không chỉ
    /// ghi log) rằng đường hysteria có thật sự chở gói hay không — `framesFromRelay == 0`
    /// sau khi QUIC đã gửi Initial nghĩa là relay/node không trả lời, tức tunnel "Connected
    /// nhưng không có mạng", phải hạ chứ không để treo.
    var frameCounts: (sent: Int, received: Int) {
        lock.lock()
        defer { lock.unlock() }
        return (sentFrames, receivedFrames)
    }

    /// Trần + số ĐANG CHỜ của MỌI hàng đợi trên đường relay của phiên này.
    ///
    /// Vì sao có: số đo máy thật 25–26/09/2026 cho thấy bộ nhớ của extension leo **theo LƯU
    /// LƯỢNG** (iPad Netflix: 17,9 → 49,4 MB trong 6 phút, ~0,65 B cho mỗi byte qua relay) —
    /// nhưng log cũ chỉ có bộ đếm frame, KHÔNG có số của hàng đợi nào, nên không chỉ được chỗ
    /// phình. Provider in struct này vào dòng `tài nguyên:` (60 s), KHÔNG thêm đồng hồ nào.
    struct QueueSnapshot: Sendable {
        /// Số gói/byte đang chờ URLSession gửi xong (đã tính vào trần).
        var inflightPackets = 0
        var inflightBytes = 0
        /// Trần cứng đang áp (`RampStatus.DataPathQueuePolicy`).
        var maxPackets = 0
        var maxBytes = 0
        var admitted = 0
        /// Số lần hàng đợi ĐẦY ⇒ phải chờ (backpressure có kiểm soát).
        var waits = 0
        /// Số gói bị THẢ vì không bao giờ lọt trần.
        var sendDropped = 0
        /// Gói đang đệm vì link chưa mở, tổng số đã đệm và tổng số đã thả.
        var pendingLink = 0
        var pendingLinkAppended = 0
        var pendingLinkDropped = 0
        var listenerDatagrams = 0
        var streamPopped = 0
        /// Byte đang nằm trong socket UDP cục bộ chờ vòng đọc (`FIONREAD`) — hàng đợi giữa Go
        /// và vòng gửi WebSocket. `-1` = không đọc được.
        var listenerSocketPendingBytes = 0
        /// Số gói bị `AsyncStream` (`.bufferingNewest`) thả IM LẶNG — TÍNH RA, không phải đếm
        /// trực tiếp (stream không có API báo drop): tổng nhận − tổng lấy ra − sức chứa stream.
        var streamDropped: Int {
            max(0, listenerDatagrams - streamPopped - WSRelayClient.sendBufferLimit)
        }
    }

    /// Ảnh chụp hàng đợi để in ra dòng `tài nguyên:` — chỉ ĐỌC, không đổi trạng thái.
    ///
    /// Cố ý KHÔNG gọi `listener.pendingBytes` trong lúc đang giữ `lock`: hai khoá khác nhau,
    /// lồng nhau là mầm của ca "giữ khoá tới hết phiên" (AGENTS.md §7c).
    var queueSnapshot: QueueSnapshot {
        lock.lock()
        let budget = sendBudget.withLock { $0 }
        var snapshot = QueueSnapshot()
        snapshot.inflightPackets = budget.packets
        snapshot.inflightBytes = budget.bytes
        snapshot.maxPackets = budget.maxPackets
        snapshot.maxBytes = budget.maxBytes
        snapshot.admitted = budget.accepted
        snapshot.waits = budget.waits
        snapshot.sendDropped = budget.dropped
        snapshot.pendingLink = pendingWhileLinkDown.count
        snapshot.pendingLinkAppended = pendingWhileLinkDown.appended
        snapshot.pendingLinkDropped = pendingWhileLinkDown.dropped
        snapshot.listenerDatagrams = listenerDatagrams
        snapshot.streamPopped = streamPopped
        lock.unlock()
        snapshot.listenerSocketPendingBytes = listener.pendingBytes
        return snapshot
    }

    /// Counters useful to spot which direction of the bridge went quiet.
    ///
    /// Tên trường cũ (`pendingLink`/`bufferedLink`/`pendingDropped`) được GIỮ NGUYÊN để log cũ
    /// còn grep được; phần `sendQueue`/`sendWaits`/`sendDropped`/`udpIn`/`udpPopped` là mới.
    func countersSummary() -> String {
        lock.lock()
        defer { lock.unlock() }
        let budget = sendBudget.withLock { $0 }
        return "udpFrames=\(sentFrames) udpBytes=\(sentBytes) framesFromRelay=\(receivedFrames) bytesFromRelay=\(receivedBytes) droppedNoLink=\(droppedNoLink) pendingLink=\(pendingWhileLinkDown.count) bufferedLink=\(pendingWhileLinkDown.appended) pendingDropped=\(pendingWhileLinkDown.dropped) wsOpen=\(open) sendQueue=\(budget.summary) sendWaits=\(budget.waits) sendDropped=\(budget.dropped) udpIn=\(listenerDatagrams) udpPopped=\(streamPopped)"
    }

    private func noteSent(_ bytes: Int) {
        lock.lock()
        sentFrames += 1
        sentBytes += bytes
        lock.unlock()
    }

    /// Đếm một datagram nhận từ socket UDP cục bộ (Go → relay). Xem `listenerDatagrams`.
    private func noteListenerDatagram() {
        lock.lock()
        listenerDatagrams += 1
        lock.unlock()
    }

    /// Đếm một datagram đã lấy RA khỏi `AsyncStream`. Xem `listenerDatagrams`.
    ///
    /// Tách thành hàm (không phải `lock.lock()` thẳng trong thân `Task`): `NSLock.lock()` bị đánh
    /// dấu `noasync` nên gọi thẳng trong ngữ cảnh async là cảnh báo (lỗi ở Swift 6).
    private func noteStreamPopped() {
        lock.lock()
        streamPopped += 1
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
