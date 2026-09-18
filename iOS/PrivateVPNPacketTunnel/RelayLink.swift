import Foundation
import os

/// Một datagram lấy từ link relay (WebSocket giữ nguyên biên message nên một message là
/// đúng một datagram).
enum RelayMessage: Sendable {
    case data(Data)
    case text(String)
}

/// Link phía trên listener UDP của relay WebSocket.
///
/// Tách interface vì hai lý do:
/// 1. Test dùng được link GIẢ, không cần mạng thật, để kiểm đúng vòng đời phiên
///    (tạo phiên A → stop → tạo phiên B ngay).
/// 2. Vòng đời phiên tường minh: mỗi lần thử kết nối tạo một link MỚI; `cancel()` huỷ hẳn.
///    Không có link nào được tái dùng giữa các phiên.
protocol RelayLink: AnyObject, Sendable {
    var isOpen: Bool { get }
    /// Bắt đầu kết nối. `onOpen` gọi khi handshake xong; `onClose` gọi khi link đóng, kèm
    /// lý do dạng chữ để log.
    func connect(
        onOpen: @escaping @Sendable () -> Void,
        onClose: @escaping @Sendable (String) -> Void
    )
    func send(_ datagram: Data) async throws

    /// Gửi không chờ (pipelined) — xem chú thích ở WSRelayLink.sendQueued().
    func sendQueued(_ datagram: Data, onComplete: @escaping @Sendable (Error?) -> Void)
    func receive() async throws -> RelayMessage
    /// Ping để phát hiện socket nửa-mở (vẫn "open" nhưng đường đã chết).
    func ping() async throws
    func cancel()
}

extension RelayLink {
    /// Mặc định: chạy `send` trong Task riêng — link không tự pipeline vẫn đúng ngữ nghĩa.
    func sendQueued(_ datagram: Data, onComplete: @escaping @Sendable (Error?) -> Void) {
        Task {
            do { try await send(datagram); onComplete(nil) } catch { onComplete(error) }
        }
    }
}

/// Link WebSocket thật dùng `URLSessionWebSocketTask`.
///
/// Link tự sở hữu `URLSession` + delegate, nên `cancel()` là điểm duy nhất nhả chúng.
final class URLSessionRelayLink: NSObject, RelayLink, URLSessionWebSocketDelegate, @unchecked Sendable {

    enum LinkError: Error, CustomStringConvertible {
        case notConnected

        var description: String { "ws link not connected" }
    }

    private let url: URL
    private let lock = NSLock()
    private var task: URLSessionWebSocketTask?
    private var open = false
    private var onOpen: (@Sendable () -> Void)?
    private var onClose: (@Sendable (String) -> Void)?

    private lazy var session = URLSession(
        configuration: .default,
        delegate: self,
        delegateQueue: nil
    )

    init(url: URL) {
        self.url = url
        super.init()
    }

    var isOpen: Bool {
        lock.lock()
        defer { lock.unlock() }
        return open
    }

    func connect(
        onOpen: @escaping @Sendable () -> Void,
        onClose: @escaping @Sendable (String) -> Void
    ) {
        lock.lock()
        self.onOpen = onOpen
        self.onClose = onClose
        lock.unlock()

        let task = session.webSocketTask(with: url)
        lock.lock()
        self.task = task
        lock.unlock()
        task.resume()
    }

    func send(_ datagram: Data) async throws {
        guard let task = currentTask() else { throw LinkError.notConnected }
        try await task.send(.data(datagram))
    }

    /// Gửi KHÔNG chờ (pipelined): URLSessionWebSocketTask tự xếp hàng message, nên không cần
    /// `await` từng gói. Vì sao quan trọng: `await task.send(...)` xong mới gửi gói kế ⇒ tốc độ
    /// bị chặn ở ~1 gói / RTT. Đo trên máy thật qua Cloudflare (RTT ~50–100ms) ⇒ chỉ 200–320 kbps,
    /// đúng hiện tượng "VPN chậm dã man" của app iOS/Mac. Android (hysteria/QUIC, gửi bất đồng bộ)
    /// trên cùng hạ tầng đạt 14 MB/s.
    func sendQueued(_ datagram: Data, onComplete: @escaping @Sendable (Error?) -> Void) {
        guard let task = currentTask() else {
            onComplete(LinkError.notConnected)
            return
        }
        task.send(.data(datagram), completionHandler: onComplete)
    }

    func receive() async throws -> RelayMessage {
        guard let task = currentTask() else { throw LinkError.notConnected }
        switch try await task.receive() {
        case .data(let data): return .data(data)
        case .string(let text): return .text(text)
        @unknown default: return .text("")
        }
    }

    func ping() async throws {
        guard let task = currentTask() else { throw LinkError.notConnected }
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

    func cancel() {
        lock.lock()
        let task = self.task
        self.task = nil
        open = false
        onOpen = nil
        onClose = nil
        lock.unlock()

        task?.cancel(with: .goingAway, reason: nil)
        // URLSession giữ delegate (self), nên không invalidate thì link rò rỉ.
        session.invalidateAndCancel()
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        lock.lock()
        open = true
        let callback = onOpen
        lock.unlock()
        callback?()
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        lock.lock()
        open = false
        let callback = onClose
        lock.unlock()
        callback?("closed code=\(closeCode.rawValue)")
    }

    private func currentTask() -> URLSessionWebSocketTask? {
        lock.lock()
        defer { lock.unlock() }
        return task
    }
}
