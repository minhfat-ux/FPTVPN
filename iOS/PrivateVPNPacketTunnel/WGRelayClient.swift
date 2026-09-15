import Darwin
import Foundation
import Network
import os

/// WireGuard-over-TCP relay client — the iOS counterpart of the Android `WGRelay`.
///
/// The WireGuard interface inside this extension is pointed at a local UDP listener
/// here. Every datagram it sends is wrapped in a length-prefixed TCP frame
/// (`[length: u16 big-endian][payload]`) and shipped to the relay daemon running next
/// to the exit node, which unwraps it and forwards it to the WireGuard server's UDP
/// port (and back). This is how the tunnel survives networks where the WireGuard
/// handshake never completes over raw UDP.
///
/// The local UDP port stays the same for the whole tunnel lifetime, including across
/// TCP reconnects, so WireGuard never has to be reconfigured: it keeps sending
/// handshakes into the local listener and the relay re-establishes the link.
final class WGRelayClient {

    private let host: String
    /// Relay ports to try, in order (node-1 runs 9444 + 8443, node-2 only 8443).
    private let ports: [UInt16]
    private let log: Logger
    private let listener: RelayUDPListener
    private var portIndex = 0
    private var lastGoodPort: UInt16?

    private let lock = NSLock()
    private var tcpFD: Int32 = -1
    private var running = false

    init(host: String, ports: [UInt16], log: Logger) {
        self.host = host
        self.ports = ports.isEmpty ? [9444] : ports
        self.log = log
        self.listener = RelayUDPListener(label: "relay-udp", log: log)
    }

    /// True while the TCP link to the relay is established. The tunnel uses this to
    /// decide whether the local listener is actually carrying anything.
    var isConnected: Bool {
        lock.lock()
        defer { lock.unlock() }
        return tcpFD >= 0
    }

    /// Opens the local UDP listener and starts the TCP link.
    /// - Returns: the local UDP port WireGuard must send its datagrams to.
    func start() throws -> UInt16 {
        let localPort = try listener.start { [weak self] datagram in
            self?.forwardToRelay(datagram)
        }

        lock.lock()
        running = true
        lock.unlock()

        Thread { [weak self] in
            while let self, self.running {
                Thread.sleep(forTimeInterval: 15)
                self.note("heartbeat \(self.countersSummary())")
            }
        }.start()

        // The TCP link is established (and re-established) on its own thread, so a
        // relay that is briefly unreachable never blocks the tunnel from starting.
        let readThread = Thread { [weak self] in self?.tcpReadLoop() }
        readThread.name = "wg-relay-tcp-read"
        readThread.start()

        note("local udp listener 127.0.0.1:\(localPort) -> \(self.host):\(self.ports)")
        return localPort
    }

    func stop() {
        lock.lock()
        guard running else { lock.unlock(); return }
        running = false
        let tcp = tcpFD
        tcpFD = -1
        lock.unlock()

        // Đóng socket UDP + CHỜ thread đọc thoát hẳn trước khi trả về, để phiên sau bind
        // lại được và không bị thread cũ của phiên này đọc nhầm fd (xem RelayUDPListener).
        listener.stop()
        // TCP: shutdown để đánh thức `recv` đang chặn; chính `tcpReadLoop` sở hữu fd nên
        // nó tự đóng, tránh đóng trùng.
        if tcp >= 0 { shutdown(tcp, SHUT_RDWR) }
        note("stopped")
    }

    // MARK: - TCP link

    /// Connects to the relay, retrying for as long as the tunnel is up.
    private func connectTCP() -> Int32? {
        while running {
            let fd = socket(AF_INET, SOCK_STREAM, 0)
            guard fd >= 0 else {
                log.error("relay: tcp socket errno=\(errno)")
                return nil
            }

            let port = lastGoodPort ?? ports[portIndex % ports.count]
            if lastGoodPort == nil { portIndex += 1 }

            var address = sockaddr_in()
            address.sin_family = sa_family_t(AF_INET)
            address.sin_port = port.bigEndian
            if inet_pton(AF_INET, host, &address.sin_addr) != 1 {
                // Hostname: resolve it (the relay host is normally an IP literal).
                var hints = addrinfo()
                hints.ai_family = AF_INET
                hints.ai_socktype = SOCK_STREAM
                var result: UnsafeMutablePointer<addrinfo>?
                if getaddrinfo(host, nil, &hints, &result) == 0, let info = result {
                    address.sin_addr = withUnsafePointer(to: info.pointee.ai_addr) {
                        $0.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }
                    }
                    freeaddrinfo(result)
                } else {
                    log.error("relay: cannot resolve \(self.host)")
                    close(fd)
                    Thread.sleep(forTimeInterval: 2)
                    continue
                }
            }

            // Non-blocking connect so a black-holing relay cannot freeze the thread.
            let flags = fcntl(fd, F_GETFL, 0)
            _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)
            let started = Date()
            let connected = withUnsafePointer(to: &address) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
            var ok = connected == 0
            // Lý do hỏng phải ghi RÕ, không dùng lại `errno`: khi connect không hoàn tất thì
            // `errno` vẫn là EINPROGRESS (36) — hằng số của chính lời gọi connect (Darwin),
            // hoàn toàn không phải lỗi. Log cũ in "failed errno=36" nên đọc lên tưởng
            // EINPROGRESS là nguyên nhân, trong khi thật ra là select hết hạn chờ. Đã mất
            // thời gian vì chỗ này khi debug "connected nhưng không có mạng" trên iPad.
            var failureReason = connected == 0 ? "" : "errno=\(errno)"
            if !ok && errno == EINPROGRESS {
                var writeSet = fd_set()
                setFD(fd, &writeSet)
                var timeout = timeval(tv_sec: 10, tv_usec: 0)
                let selected = select(fd + 1, nil, &writeSet, nil, &timeout)
                if selected > 0 {
                    var error: Int32 = 0
                    var errorLength = socklen_t(MemoryLayout<Int32>.size)
                    _ = getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &errorLength)
                    ok = error == 0
                    failureReason = error == 0 ? "" : "SO_ERROR=\(error)"
                } else if selected == 0 {
                    failureReason = "hết hạn 10s chờ connect hoàn tất (EINPROGRESS, không phải lỗi)"
                } else {
                    failureReason = "select errno=\(errno)"
                }
            }
            _ = fcntl(fd, F_SETFL, flags)

            guard ok else {
                note("connect \(self.host):\(port) failed: \(failureReason)")
                close(fd)
                Thread.sleep(forTimeInterval: 2)
                continue
            }

            var noDelay: Int32 = 1
            _ = setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &noDelay, socklen_t(MemoryLayout<Int32>.size))
            lastGoodPort = port
            note("connected to \(self.host):\(port) in \(Int(Date().timeIntervalSince(started) * 1000))ms")
            return fd
        }
        return nil
    }

    /// Reads length-prefixed frames and hands each payload to WireGuard as a datagram.
    private func tcpReadLoop() {
        while running {
            guard let fd = connectTCP() else { return }
            lock.lock()
            tcpFD = fd
            lock.unlock()

            var header = [UInt8](repeating: 0, count: 2)
            while running {
                guard readExactly(fd, into: &header, count: 2) else { break }
                let frameLength = Int(header[0]) << 8 | Int(header[1])
                guard frameLength > 0, frameLength <= 65_535 else { continue }
                var payload = [UInt8](repeating: 0, count: frameLength)
                guard readExactly(fd, into: &payload, count: frameLength) else { break }
                receivedFrames += 1
                receivedBytes += frameLength
                listener.sendToPeer(payload)
            }

            lock.lock()
            if tcpFD == fd { tcpFD = -1 }
            lock.unlock()
            shutdown(fd, SHUT_RDWR)
            close(fd)
            if running { note("TCP link dropped, reconnecting") }
        }
    }

    /// Đẩy một datagram WireGuard nhận từ listener UDP vào link TCP, đóng gói
    /// `[length: u16 big-endian][payload]`. Chạy trên thread đọc của listener.
    private func forwardToRelay(_ datagram: Data) {
        lock.lock()
        let fd = tcpFD
        lock.unlock()

        // No link yet: drop it — WireGuard retries its handshake every 5s anyway.
        guard fd >= 0 else {
            lock.lock(); udpDroppedNoLink += 1; lock.unlock()
            return
        }

        var frame = [UInt8](repeating: 0, count: datagram.count + 2)
        frame[0] = UInt8((datagram.count >> 8) & 0xff)
        frame[1] = UInt8(datagram.count & 0xff)
        frame.replaceSubrange(2..<(datagram.count + 2), with: datagram)
        lock.lock()
        sentFrames += 1
        sentBytes += datagram.count
        lock.unlock()
        if !writeAll(fd, frame) {
            // The link is one-way broken (hotel NAT / relay restart): tear it down
            // so the read loop reconnects. Without this, every later packet was
            // dropped silently and the tunnel stayed "up" with no traffic.
            note("write to relay failed errno=\(errno) — dropping link to reconnect")
            dropLink(fd, reason: "write failure")
        }
    }

    // MARK: - Socket helpers

    // MARK: - Diagnostics

    private var sentFrames = 0
    private var sentBytes = 0
    private var receivedFrames = 0
    private var receivedBytes = 0
    private var udpDroppedNoLink = 0

    /// Logs to os_log at `.default` (visible without `--info`) *and* to the extension's
    /// diagnostic file. `privacy: .public` so the content is not redacted.
    private func note(_ message: String) {
        log.log(level: .default, "relay: \(message, privacy: .public)")
        RelayDiagnostics.shared.log("relay: \(message)")
    }

    /// Counters useful to spot which direction of the bridge went quiet.
    func countersSummary() -> String {
        lock.lock()
        defer { lock.unlock() }
        return "udpFrames=\(sentFrames) udpBytes=\(sentBytes) framesFromRelay=\(receivedFrames) bytesFromRelay=\(receivedBytes) droppedNoLink=\(udpDroppedNoLink) tcpFd=\(tcpFD)"
    }

    /// Closes a broken link; the read loop notices and reconnects.
    private func dropLink(_ fd: Int32, reason: String) {
        note("dropping TCP link (fd=\(fd)): \(reason)")
        lock.lock()
        if tcpFD == fd { tcpFD = -1 }
        lock.unlock()
        shutdown(fd, SHUT_RDWR)
        close(fd)
    }

    private func readExactly(_ fd: Int32, into buffer: inout [UInt8], count: Int) -> Bool {
        var offset = 0
        while offset < count {
            let read = buffer.withUnsafeMutableBytes { raw -> Int in
                guard let base = raw.baseAddress else { return -1 }
                return recv(fd, base + offset, count - offset, 0)
            }
            if read > 0 {
                offset += read
            } else if read == 0 {
                return false // peer closed
            } else if errno == EINTR {
                continue
            } else {
                return false
            }
        }
        return true
    }

    private func writeAll(_ fd: Int32, _ bytes: [UInt8]) -> Bool {
        var offset = 0
        while offset < bytes.count {
            let written = bytes.withUnsafeBytes { raw -> Int in
                guard let base = raw.baseAddress else { return -1 }
                return send(fd, base + offset, bytes.count - offset, 0)
            }
            if written > 0 {
                offset += written
            } else if written < 0 && errno == EINTR {
                continue
            } else {
                return false
            }
        }
        return true
    }

    private func setFD(_ fd: Int32, _ set: inout fd_set) {
        let index = Int(fd) / 32
        let bit = Int32(1) << (Int(fd) % 32)
        withUnsafeMutablePointer(to: &set.fds_bits) { pointer in
            pointer.withMemoryRebound(to: Int32.self, capacity: 32) { bits in
                bits[index] |= bit
            }
        }
    }
}
