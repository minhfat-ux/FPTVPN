import Darwin
import Foundation
import os

/// Socket UDP cục bộ mà WireGuard trong extension gửi datagram tới, dùng chung cho cả
/// relay TCP (`WGRelayClient`) lẫn relay WebSocket (`WSRelayClient`).
///
/// Vì sao tách riêng — đây là gốc của bug "Connect lần hai không có mạng" trên macOS:
/// code cũ đọc datagram bằng một vòng lặp chặn vô hạn trong `recvfrom`. Khi `stop()` gọi
/// `close(udp)`, thread đọc KHÔNG tỉnh dậy (Darwin không ngắt `recvfrom` đang chặn khi
/// đóng fd), nên nó vẫn giữ nguyên socket + `self` của phiên trước. Phiên sau mở socket
/// mới và kernel có thể cấp LẠI đúng số fd vừa đóng; thread cũ lúc đó `recvfrom` trên fd
/// mới ⇒ **cướp mất datagram handshake của phiên mới** trong khi phiên mới không thấy gì.
/// Kết quả đúng như đo được: phiên hai tunnel "lên" nhưng không có traffic.
///
/// Ở đây vòng lặp dùng timeout nhận (`SO_RCVTIMEO`) nên luôn tự kiểm tra `running` và
/// thoát; `stop()` đặt `running = false`, CHỜ thread đọc thoát hẳn rồi mới đóng fd, nên
/// fd của phiên cũ không thể bị tái dùng khi vẫn còn thread cũ đọc nó.
///
/// Không có trạng thái tĩnh: mỗi phiên tạo một listener mới, `stop()` là điểm kết thúc.
final class RelayUDPListener: @unchecked Sendable {

    enum ListenerError: Error, CustomStringConvertible {
        case bind(attempts: Int, errno: Int32)

        var description: String {
            switch self {
            case .bind(let attempts, let errno):
                return "udp bind failed after \(attempts) attempt(s): errno=\(errno)"
            }
        }
    }

    /// Bao lâu `recvfrom` chờ trước khi trả về để vòng lặp kiểm tra `running`. Ngắn đủ để
    /// `stop()` không phải chờ lâu, dài đủ để không quay vòng CPU.
    private static let receiveTimeout: timeval = timeval(tv_sec: 0, tv_usec: 250_000)
    /// Trần thời gian `stop()` chờ thread đọc thoát trước khi đóng fd.
    private static let stopJoinTimeout: TimeInterval = 1

    private let label: String
    private let log: Logger

    private let lock = NSLock()
    private var fd: Int32 = -1
    private var running = false
    private var port: UInt16 = 0
    /// Địa chỉ WireGuard gửi tới sau cùng — trả lời về đây, không hardcode cổng (WireGuard
    /// tự chọn cổng nguồn).
    private var peerAddress: sockaddr_in?
    private var readThread: Thread?
    private var onDatagram: ((Data) -> Void)?

    init(label: String, log: Logger) {
        self.label = label
        self.log = log
    }

    var localPort: UInt16 {
        lock.lock()
        defer { lock.unlock() }
        return port
    }

    /// Bind listener vào 127.0.0.1 rồi bắt đầu đọc datagram.
    ///
    /// Khi bind lỗi, log RÕ errno và thử lại bằng một socket mới — cổng 0 để kernel cấp
    /// cổng trống khác, `preferredPort` khác 0 thì thử lại đúng cổng đó.
    /// - Returns: cổng UDP cục bộ WireGuard phải trỏ tới.
    @discardableResult
    func start(
        preferredPort: UInt16 = 0,
        maxAttempts: Int = 3,
        onDatagram: @escaping (Data) -> Void
    ) throws -> UInt16 {
        var lastErrno: Int32 = 0
        for attempt in 1...max(1, maxAttempts) {
            let udp = socket(AF_INET, SOCK_DGRAM, 0)
            guard udp >= 0 else {
                lastErrno = errno
                note("udp socket attempt \(attempt) failed errno=\(lastErrno)")
                continue
            }

            // Timeout nhận: vòng lặp đọc tỉnh dậy định kỳ để thấy `running == false`.
            var timeout = RelayUDPListener.receiveTimeout
            _ = setsockopt(
                udp,
                SOL_SOCKET,
                SO_RCVTIMEO,
                &timeout,
                socklen_t(MemoryLayout<timeval>.size)
            )

            var address = sockaddr_in()
            address.sin_family = sa_family_t(AF_INET)
            address.sin_port = preferredPort.bigEndian
            address.sin_addr.s_addr = inet_addr("127.0.0.1")
            var length = socklen_t(MemoryLayout<sockaddr_in>.size)
            let bound = withUnsafePointer(to: &address) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    Darwin.bind(udp, $0, length)
                }
            }
            guard bound == 0 else {
                lastErrno = errno
                note("udp bind attempt \(attempt) failed port=\(preferredPort) errno=\(lastErrno)")
                close(udp)
                continue
            }
            let named = withUnsafeMutablePointer(to: &address) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    getsockname(udp, $0, &length)
                }
            }
            guard named == 0 else {
                lastErrno = errno
                note("udp getsockname attempt \(attempt) failed errno=\(lastErrno)")
                close(udp)
                continue
            }

            let localPort = UInt16(bigEndian: address.sin_port)
            lock.lock()
            fd = udp
            running = true
            port = localPort
            self.onDatagram = onDatagram
            lock.unlock()

            let thread = Thread { [weak self] in self?.readLoop() }
            thread.name = label
            lock.lock()
            readThread = thread
            lock.unlock()
            thread.start()

            note("udp listener bound 127.0.0.1:\(localPort) (attempt \(attempt))")
            return localPort
        }
        throw ListenerError.bind(attempts: maxAttempts, errno: lastErrno)
    }

    /// Gửi một datagram nhận từ relay trở lại đúng peer WireGuard đã gửi tới.
    func sendToPeer(_ payload: [UInt8]) {
        lock.lock()
        let udp = fd
        let target = peerAddress
        lock.unlock()
        guard udp >= 0, var destination = target else { return }
        _ = payload.withUnsafeBytes { raw in
            withUnsafePointer(to: &destination) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    sendto(
                        udp,
                        raw.baseAddress,
                        raw.count,
                        0,
                        $0,
                        socklen_t(MemoryLayout<sockaddr_in>.size)
                    )
                }
            }
        }
    }

    /// Dừng listener: đặt `running = false`, CHỜ thread đọc thoát hẳn, rồi mới đóng fd.
    /// Thứ tự này là điều kiện để phiên sau bind lại được và không bị thread cũ đọc nhầm.
    func stop() {
        lock.lock()
        guard running else { lock.unlock(); return }
        running = false
        let udp = fd
        let stoppedPort = port
        fd = -1
        port = 0
        let thread = readThread
        readThread = nil
        onDatagram = nil
        lock.unlock()

        if let thread, thread !== Thread.current {
            let deadline = Date().addingTimeInterval(RelayUDPListener.stopJoinTimeout)
            while !thread.isFinished && Date() < deadline {
                Thread.sleep(forTimeInterval: 0.01)
            }
            if !thread.isFinished {
                // Không chặn vô hạn: vẫn đóng fd, nhưng ghi lại để chẩn đoán.
                note("read thread did not exit within \(Int(RelayUDPListener.stopJoinTimeout))s")
            }
        }

        if udp >= 0 {
            // Đánh thức `recvfrom` còn đang chờ (nếu có) rồi nhả socket.
            _ = shutdown(udp, SHUT_RDWR)
            close(udp)
        }
        note("udp listener stopped (was 127.0.0.1:\(stoppedPort))")
    }

    // MARK: - Read loop

    private func readLoop() {
        var buffer = [UInt8](repeating: 0, count: 65_535)
        while isRunning {
            let udp = currentFD()
            guard udp >= 0 else { return }

            var sender = sockaddr_in()
            var senderLength = socklen_t(MemoryLayout<sockaddr_in>.size)
            let received = buffer.withUnsafeMutableBytes { raw -> Int in
                guard let base = raw.baseAddress else { return -1 }
                return withUnsafeMutablePointer(to: &sender) { pointer in
                    pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                        recvfrom(udp, base, raw.count, 0, $0, &senderLength)
                    }
                }
            }

            if received > 0 {
                lock.lock()
                peerAddress = sender
                let handler = onDatagram
                lock.unlock()
                handler?(Data(buffer[0..<received]))
                continue
            }
            if received < 0 {
                let code = errno
                // Timeout (SO_RCVTIMEO) hoặc bị ngắt: quay lại kiểm tra `running`.
                if code == EAGAIN || code == EWOULDBLOCK || code == EINTR { continue }
                if code == EBADF { return }
                Thread.sleep(forTimeInterval: 0.05)
            }
        }
    }

    // MARK: - State helpers

    private var isRunning: Bool {
        lock.lock()
        defer { lock.unlock() }
        return running
    }

    private func currentFD() -> Int32 {
        lock.lock()
        defer { lock.unlock() }
        return fd
    }

    /// Log ở mức `.default` (hiện trong `log show` không cần `--info`) và ghi thêm vào file
    /// chẩn đoán của extension. `privacy: .public` để nội dung không bị che `<private>`.
    private func note(_ message: String) {
        log.log(level: .default, "\(self.label, privacy: .public): \(message, privacy: .public)")
        RelayDiagnostics.shared.log("\(self.label): \(message)")
    }
}
