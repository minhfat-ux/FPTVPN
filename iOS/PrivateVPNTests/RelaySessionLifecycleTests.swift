import Darwin
import Foundation
import os
import XCTest

/// Vòng đời phiên relay: tạo phiên A → stop → tạo phiên B NGAY.
///
/// Đây là hồi quy cho bug "Connect lần hai không có mạng" trên macOS. Nguyên nhân gốc:
/// socket UDP của phiên trước chưa được nhả (thread đọc cũ vẫn chặn trong `recvfrom`),
/// nên khi phiên sau mở socket và kernel cấp lại đúng số fd đó, thread cũ đọc nhầm và
/// **cướp mất datagram handshake của phiên mới**; đồng thời link/queue của phiên trước
/// có thể bị tái dùng.
///
/// Test dùng link GIẢ (`FakeRelayLink`) nên không cần mạng thật.
final class RelaySessionLifecycleTests: XCTestCase {

    // MARK: - Fake transport

    /// Link WebSocket giả: "mở" ngay khi connect, chặn trong `receive()` cho tới khi
    /// `cancel()` được gọi. Không chạm mạng.
    final class FakeRelayLink: RelayLink, @unchecked Sendable {
        enum FakeError: Error { case closed }

        private let lock = NSLock()
        private var open = false
        private var cancelled = false
        private var waiter: CheckedContinuation<RelayMessage, Error>?

        var isOpen: Bool {
            lock.lock(); defer { lock.unlock() }
            return open
        }

        var isCancelled: Bool {
            lock.lock(); defer { lock.unlock() }
            return cancelled
        }

        func connect(
            onOpen: @escaping @Sendable () -> Void,
            onClose: @escaping @Sendable (String) -> Void
        ) {
            lock.lock()
            open = true
            lock.unlock()
            onOpen()
        }

        func send(_ datagram: Data) async throws {
            if cancelledValue { throw FakeError.closed }
        }

        func receive() async throws -> RelayMessage {
            try await withCheckedThrowingContinuation { continuation in
                if !park(continuation) {
                    continuation.resume(throwing: FakeError.closed)
                }
            }
        }

        func ping() async throws {}

        func cancel() {
            lock.lock()
            cancelled = true
            open = false
            let continuation = waiter
            waiter = nil
            lock.unlock()
            continuation?.resume(throwing: FakeError.closed)
        }

        /// `NSLock` không dùng được trực tiếp trong hàm async (Swift 6), nên gom vào helper
        /// đồng bộ.
        private var cancelledValue: Bool {
            lock.lock(); defer { lock.unlock() }
            return cancelled
        }

        /// Lưu continuation đang chờ. Trả về false nếu link đã bị huỷ.
        private func park(_ continuation: CheckedContinuation<RelayMessage, Error>) -> Bool {
            lock.lock()
            defer { lock.unlock() }
            guard !cancelled else { return false }
            waiter = continuation
            return true
        }
    }

    /// Ghi lại các link đã được tạo, thread-safe (factory chạy trên task nền).
    final class LinkRecorder: @unchecked Sendable {
        private let lock = NSLock()
        private var links: [FakeRelayLink] = []

        func record(_ link: FakeRelayLink) {
            lock.lock(); links.append(link); lock.unlock()
        }

        var all: [FakeRelayLink] {
            lock.lock(); defer { lock.unlock() }
            return links
        }
    }

    /// Hộp nhận datagram thread-safe cho listener.
    final class DatagramBox: @unchecked Sendable {
        private let lock = NSLock()
        private var datagrams: [Data] = []

        func append(_ data: Data) {
            lock.lock(); datagrams.append(data); lock.unlock()
        }

        var count: Int {
            lock.lock(); defer { lock.unlock() }
            return datagrams.count
        }
    }

    // MARK: - Helpers

    private func waitUntil(
        _ timeout: TimeInterval = 2,
        _ condition: () -> Bool,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.01)
        }
        XCTAssertTrue(condition(), "condition not met within \(timeout)s", file: file, line: line)
    }

    private func sendUDP(_ payload: Data, to port: UInt16) {
        let fd = socket(AF_INET, SOCK_DGRAM, 0)
        guard fd >= 0 else {
            XCTFail("cannot open udp socket")
            return
        }
        defer { close(fd) }
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        _ = payload.withUnsafeBytes { raw in
            withUnsafePointer(to: &address) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    sendto(
                        fd,
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

    // MARK: - Tests

    func testSecondSessionBindsOwnPortAndFreshLink() throws {
        let log = Logger(subsystem: "com.privatevpn.tests", category: "relay-lifecycle")
        let url = URL(string: "wss://relay.invalid/never")!
        let recorder = LinkRecorder()
        let factory: @Sendable () -> RelayLink = {
            let link = FakeRelayLink()
            recorder.record(link)
            return link
        }

        // Phiên A lên bình thường.
        let sessionA = WSRelayClient(url: url, log: log, linkFactory: factory)
        let portA = try sessionA.start()
        XCTAssertGreaterThan(portA, 0)
        waitUntil { sessionA.isConnected }
        let linkA = try XCTUnwrap(recorder.all.first)
        XCTAssertTrue(linkA.isOpen)
        XCTAssertEqual(recorder.all.count, 1)

        // Stop A rồi tạo B NGAY (đúng thao tác Disconnect → Connect của người dùng).
        sessionA.stop()
        XCTAssertFalse(sessionA.isConnected)
        XCTAssertTrue(linkA.isCancelled, "link phiên A phải bị huỷ khi stop")

        let sessionB = WSRelayClient(url: url, log: log, linkFactory: factory)
        let portB = try sessionB.start()
        XCTAssertGreaterThan(portB, 0)
        waitUntil { sessionB.isConnected }

        // Phiên B phải có link MỚI, KHÔNG tái dùng link đã chết của A.
        XCTAssertEqual(recorder.all.count, 2, "mỗi phiên phải tạo link riêng")
        let linkB = try XCTUnwrap(recorder.all.last)
        XCTAssertFalse(linkB === linkA)
        XCTAssertTrue(linkB.isOpen)
        XCTAssertFalse(linkB.isCancelled)

        sessionB.stop()

        // Bằng chứng socket UDP của phiên A đã được NHẢ: bind lại đúng cổng A phải được.
        let rebind = RelayUDPListener(label: "test-rebind", log: log)
        defer { rebind.stop() }
        let reboundPort = try rebind.start(preferredPort: portA) { _ in }
        XCTAssertEqual(reboundPort, portA, "cổng UDP của phiên A chưa được nhả")
    }

    func testListenerDeliversDatagramsAfterRestart() throws {
        let log = Logger(subsystem: "com.privatevpn.tests", category: "relay-lifecycle")

        let boxA = DatagramBox()
        let listenerA = RelayUDPListener(label: "test-a", log: log)
        let portA = try listenerA.start { boxA.append($0) }
        sendUDP(Data([0x01, 0x02, 0x03]), to: portA)
        waitUntil { boxA.count == 1 }
        listenerA.stop()

        let boxB = DatagramBox()
        let listenerB = RelayUDPListener(label: "test-b", log: log)
        let portB = try listenerB.start { boxB.append($0) }
        sendUDP(Data([0x0a, 0x0b]), to: portB)
        waitUntil { boxB.count == 1 }
        XCTAssertEqual(boxA.count, 1, "listener A không được nhận datagram sau khi stop")
        listenerB.stop()
    }
}
