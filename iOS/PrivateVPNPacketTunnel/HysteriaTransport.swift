import Foundation
import Network
import NetworkExtension
import os

#if canImport(Hysteria)
import Hysteria
#endif

/// Transport hysteria2 cho NetworkExtension của Apple — bản chuyển từ
/// `android/app/src/main/java/com/privatevpn/app/vpn/HysteriaVpnService.kt`.
///
/// Vì sao: trên mạng bị chặn IP node (TQ / Wi-Fi khách sạn — đo 19/09: TCP tới
/// 103.173.155.50 và 165.101.114.162 timeout, chỉ api.meetflowai.site:443 mở), chỉ
/// đường WebSocket qua Cloudflare là đi được. Hysteria2 (QUIC) chở trong WebSocket
/// đó là đường đã đo nhanh nhất: 3,73 MB/s (29,9 Mbps) qua `/relay/vn2hy`, trong khi
/// WireGuard-chồng-relay chỉ 0,007–2 MB/s.
///
/// Cách nối (giống Android):
///   1. `WSRelayClient` mở WebSocket tới relay và bind một cổng UDP nội bộ
///      (127.0.0.1:port) — mỗi binary message = 1 datagram.
///   2. Go (framework `Hysteria`, xem `tools/hysteria-apple/build.sh`) nói QUIC tới
///      đúng cổng UDP nội bộ đó (`Mobile.connect(host: "127.0.0.1", port: localPort)`),
///      nên gói thật đi qua WebSocket.
///   3. `Mobile.serve(tunFd:...)` bơm gói IP giữa utun của NetworkExtension và QUIC.
///
/// Go runtime cần fd của utun; provider lấy fd đó từ `packetFlow` (xem
/// `packetTunnelFileDescriptor()`), đúng cách các client NetworkExtension khác làm.
final class HysteriaTransport: @unchecked Sendable {

    struct Options: Sendable {
        /// Relay WebSocket của ĐÚNG node đang chọn (`/relay/vn2hy` hoặc `/relay/vn1hy`).
        var relayURL: URL
        /// Danh tính QUIC = host của server hysteria (SNI + khoá TLS). Có thể là IP node.
        var serverHost: String
        /// Cổng UDP hysteria của node (mặc định 8443). KHÔNG phải cổng relay.
        var serverPort: UInt16
        var password: String
        var obfs: String
        /// Brutal CC khai theo băng thông thật của mạng đang dùng (0 = không khai).
        var upKbps: Int
        var downKbps: Int
        var mtu: Int
        /// Địa chỉ IPv4/6 của utun, phải TRÙNG với settings mà provider áp cho tunnel.
        var ipv4: String
        var ipv6: String
    }

    /// Lỗi có mã để tầng trên báo cho người dùng (đừng chỉ ghi log).
    enum TransportError: Error, CustomStringConvertible {
        case relayNotStarted(String)
        case connectFailed(String)
        case alreadyRunning

        var description: String {
            switch self {
            case .relayNotStarted(let reason): return "ws-relay không dựng được: \(reason)"
            case .connectFailed(let reason): return "hysteria connect thất bại: \(reason)"
            case .alreadyRunning: return "hysteria đã chạy"
            }
        }
    }

    private let log: Logger
    private let lock = NSLock()
    private var relay: WSRelayClient?
    private var running = false
    private var stopped = false
    private var localPort: UInt16 = 0
    private var onDead: (@Sendable (String) -> Void)?

    init(log: Logger) {
        self.log = log
    }

    /// Cổng UDP nội bộ mà hysteria đang nói tới (127.0.0.1:port) — dùng cho log/chẩn đoán.
    var relayLocalPort: UInt16 {
        lock.lock(); defer { lock.unlock() }
        return localPort
    }

    /// Dựng relay + bắt tay hysteria. Trả về sau khi QUIC đã bắt tay xong (hàm này
    /// CHẶN vài trăm ms tới vài giây, đừng gọi trên main thread của extension).
    func start(
        options: Options,
        tunnelFd: Int32,
        onDead: @escaping @Sendable (String) -> Void
    ) throws {
        lock.lock()
        if running {
            lock.unlock()
            throw TransportError.alreadyRunning
        }
        stopped = false
        self.onDead = onDead
        lock.unlock()

        let client = WSRelayClient(url: options.relayURL, log: log)
        let port: UInt16
        do {
            port = try client.start()
        } catch {
            throw TransportError.relayNotStarted(error.localizedDescription)
        }
        lock.lock()
        relay = client
        localPort = port
        lock.unlock()
        log.log("hysteria: relay \(options.relayURL.absoluteString, privacy: .public) -> udp 127.0.0.1:\(port)")

        #if canImport(Hysteria)
        // Go nói QUIC tới cổng UDP nội bộ của relay (không phải tới node): gói thật
        // được WSRelayClient chở qua WebSocket. sockFd = 0 nghĩa là Go tự mở socket UDP
        // (xem mobile.go: sockFd > 0 mới dùng socket do app cấp).
        // gomobile sinh hàm C: MobileConnect(host, port, password, obfsPass, sockFd,
        // sockTcp, upKbps, downKbps, &error) — xem Mobile.objc.h trong framework.
        // Không import kiểu `throws` nên phải truyền con trỏ NSError ra ngoài.
        var connectError: NSError?
        let connected = MobileConnect(
            options.serverHost,
            Int(port),
            options.password,
            options.obfs,
            0,
            false,
            Int(options.upKbps),
            Int(options.downKbps),
            &connectError
        )
        if !connected {
            stop()
            throw TransportError.connectFailed(connectError?.localizedDescription ?? "MobileConnect trả false")
        }
        log.log("hysteria: đã bắt tay QUIC qua relay (up=\(options.upKbps) kbps, down=\(options.downKbps) kbps)")

        lock.lock()
        running = true
        lock.unlock()

        // serve() chạy tới khi transport chết ⇒ chạy trên thread riêng, giống
        // HysteriaVpnService.runTunnel() bên Android.
        let mtu = options.mtu
        let ipv4 = options.ipv4
        let ipv6 = options.ipv6
        let thread = Thread { [weak self] in
            guard let self else { return }
            var serveError: NSError?
            let ok = MobileServe(Int(tunnelFd), Int(mtu), ipv4, ipv6, &serveError)
            let reason = ok
                ? "serve() kết thúc"
                : (serveError?.localizedDescription ?? "MobileServe trả false")
            self.handleDeath(reason)
        }
        thread.name = "hysteria-serve"
        thread.stackSize = 1 << 20
        thread.start()
        #else
        stop()
        throw TransportError.connectFailed(
            "framework Hysteria chưa được nhúng vào extension — chạy tools/hysteria-apple/build.sh " +
            "rồi thêm Hysteria.xcframework vào target (xem project.yml)"
        )
        #endif
    }

    /// Gọi khi Go báo transport chết (WS bị cắt, mạng đổi). Tầng trên quyết định dựng lại.
    private func handleDeath(_ reason: String) {
        lock.lock()
        let wasRunning = running
        running = false
        let callback = onDead
        lock.unlock()
        guard wasRunning, !stopped else { return }
        log.error("hysteria: transport chết (\(reason, privacy: .public))")
        callback?(reason)
    }

    func stop() {
        lock.lock()
        stopped = true
        let wasRunning = running
        running = false
        let client = relay
        relay = nil
        lock.unlock()

        #if canImport(Hysteria)
        if wasRunning {
            // stop() của Go giải phóng client + đóng socket; serve() sẽ trả về.
            MobileStop()
        }
        #endif
        client?.stop()
        log.log("hysteria: đã dừng")
    }

    /// fd của utun mà NetworkExtension đang dùng.
    ///
    /// `NEPacketTunnelProvider` không có API công khai trả fd, nhưng `packetFlow` giữ
    /// một utun và cùng khoá KVC `socket` mà các client NetworkExtension khác dùng.
    /// Trả nil ⇒ provider phải rơi về transport WireGuard (đừng chạy hysteria nửa vời).
    static func packetTunnelFileDescriptor(from flow: NEPacketTunnelFlow) -> Int32? {
        let value = flow.value(forKey: "socket")
        if let number = value as? NSNumber {
            let fd = number.int32Value
            return fd > 0 ? fd : nil
        }
        if let fd = value as? Int32 {
            return fd > 0 ? fd : nil
        }
        return nil
    }
}
