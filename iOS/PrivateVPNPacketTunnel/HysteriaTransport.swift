import Foundation
import Network
import NetworkExtension
import os

#if !os(macOS) && canImport(WireGuardKitC)
// Extension iOS: `ctl_info`/`sockaddr_ctl` (từ `<sys/kern_control.h>`) KHÔNG hiện ra trong Swift
// trên iOS — SDK iPhoneOS không có header đó — nên target iOS (vẫn build cả thư mục
// `iOS/PrivateVPNPacketTunnel`) không compile được (lỗi thật khi build 19/09:
// "cannot find 'ctl_info' in scope"). C module của WireGuardKit đã khai lại đúng hai struct
// (`Vendor/WireGuardKit/Sources/WireGuardKitC/WireGuardKitC.h`) nên chỉ cần import tường minh
// — `import WireGuardKit` KHÔNG đủ vì nó không re-export `WireGuardKitC`.
// Extension macOS cố ý KHÔNG có WireGuardKit (hai Go runtime không cùng một process —
// `docs/TRANSPORT_SPEED_2026-09-19.md` §8) và ở macOS Foundation đã mang sẵn Darwin, nên nhánh
// này không chạy ở đó.
import WireGuardKitC
#endif

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
/// Go runtime cần fd để chở gói; provider KHÔNG lấy được fd utun của NetworkExtension trên
/// nền tảng nào (iOS: KVC `socket` trả nil; macOS: utun của NE không chở gói theo định dạng
/// sing-tun parse) nên dùng `resolveTunnelFD`: cặp socketpair do extension tự tạo, bắc cầu hai
/// chiều với `NEPacketTunnelFlow` qua `TunnelBridge`.
final class HysteriaTransport: @unchecked Sendable {

    struct Options: Sendable {
        /// Relay WebSocket của ĐÚNG node đang chọn (`/relay/vn2hy` hoặc `/relay/vn1hy`).
        var relayURL: URL
        /// Relay dự phòng, thử LẦN LƯỢT khi relay đầu không dựng nổi (WS không mở được).
        /// Rỗng = chỉ dùng `relayURL`.
        var relayURLCandidates: [URL] = []
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
        /// Địa chỉ utun ở dạng CIDR cho `MobileServe` ("100.100.100.101/30"): Go parse
        /// bằng `netip.ParsePrefix` nên thiếu "/" là `bad ipv4 … no '/'` và transport chết
        /// ngay sau khi vừa lên. Phải TRÙNG với settings mà provider áp cho tunnel.
        var ipv4: String
        /// Địa chỉ IPv6 CIDR, để "" khi tunnel chỉ áp IPv4 (giống Android `HY_TUN_IPV6`).
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

    /// Đích QUIC thật mà Go phải nói tới: cổng UDP NỘI BỘ của relay, không phải node.
    ///
    /// Vì sao: `mobile.go` dựng `net.UDPAddr{IP: net.ParseIP(host), Port: port}` từ hai
    /// tham số đầu của `Connect` rồi QUIC gửi gói tới ĐÚNG địa chỉ đó. Trỏ vào
    /// `serverHost:<cổng relay>` là gói QUIC đi thẳng ra IP node (trên mạng bị chặn IP node
    /// thì không bao giờ có trả lời) và không đi qua WebSocket. Android cũng phải đổi
    /// `runHost = "127.0.0.1"` trước khi connect qua bridge
    /// (`HysteriaVpnService.kt:423` — "Cổng phải là cổng BRIDGE đang nghe").
    /// TLS SNI thành "127.0.0.1" là vô hại: client đang `InsecureSkipVerify: true`
    /// (`mobile.go:162`) và hysteria xác thực bằng password.
    private static let quicDialHost = "127.0.0.1"

    /// Chờ WS mở trước khi cho QUIC bắt tay. Relay qua Cloudflare mở trong ~0,5–2s; hết
    /// hạn thì coi như relay này chết và thử relay kế tiếp (đừng để QUIC retry mù).
    private static let relayOpenGrace: TimeInterval = 6

    private let log: Logger
    private let lock = NSLock()
    private var relay: WSRelayClient?
    private var running = false
    private var stopped = false
    private var localPort: UInt16 = 0
    private var onDead: (@Sendable (String) -> Void)?
    /// Gọi khi link WS của relay MỞ LẠI sau khi đứt — provider dùng để đánh giá ĐỔI MẠNG NGAY
    /// (`HysteriaPacketTunnelProvider.noteRelayLinkReopened`). Đặt TRƯỚC `start(...)`.
    var onRelayLinkReopened: (@Sendable () -> Void)?

    init(log: Logger) {
        self.log = log
    }

    /// Cổng UDP nội bộ mà hysteria đang nói tới (127.0.0.1:port) — dùng cho log/chẩn đoán.
    var relayLocalPort: UInt16 {
        lock.lock(); defer { lock.unlock() }
        return localPort
    }

    /// Số frame hai chiều của relay (nil khi chưa có relay).
    ///
    /// Provider dùng con số này để phát hiện tunnel "Connected nhưng không có mạng":
    /// QUIC đã gửi Initial (`sent > 0`) mà relay không trả về gói nào (`received == 0`)
    /// nghĩa là chặng relay↔node không thông.
    var relayFrameCounts: (sent: Int, received: Int)? {
        lock.lock(); defer { lock.unlock() }
        return relay?.frameCounts
    }

    /// Relay WebSocket còn mở không.
    var relayIsConnected: Bool {
        lock.lock()
        let client = relay
        lock.unlock()
        return client?.isConnected ?? false
    }

    /// Dựng relay + bắt tay hysteria. Trả về sau khi QUIC đã bắt tay xong (hàm này
    /// CHẶN vài trăm ms tới vài giây, đừng gọi trên main thread của extension).
    ///
    /// Danh sách relay được thử LẦN LƯỢT: relay đầu không mở nổi WS (hoặc Go không nhận
    /// cấu hình) thì dọn sạch rồi thử relay kế tiếp, cuối cùng vẫn hỏng thì ném lỗi rõ ràng
    /// cho provider — KHÔNG để tunnel "Connected" mà không có gói nào đi.
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

        let candidates = relayCandidates(for: options)
        var lastError: Error = TransportError.relayNotStarted("không có relay URL nào để thử")
        for relayURL in candidates {
            do {
                try attempt(relayURL: relayURL, options: options, tunnelFd: tunnelFd)
                return
            } catch {
                lastError = error
                log.error("hysteria: relay \(relayURL.absoluteString, privacy: .public) hỏng: \(error.localizedDescription, privacy: .public)")
                RelayDiagnostics.shared.log("hysteria: relay \(relayURL.absoluteString) hỏng (\(error)) — thử relay kế tiếp")
                discardAttempt()
            }
        }
        throw lastError
    }

    /// `relayURL` trước, rồi tới các candidate còn lại (bỏ trùng, giữ thứ tự).
    private func relayCandidates(for options: Options) -> [URL] {
        var ordered: [URL] = [options.relayURL]
        for candidate in options.relayURLCandidates
        where !ordered.contains(where: { $0.absoluteString == candidate.absoluteString }) {
            ordered.append(candidate)
        }
        return ordered
    }

    /// Một lượt thử: mở relay → chờ WS mở → cho Go nói QUIC tới cổng UDP nội bộ → serve.
    private func attempt(relayURL: URL, options: Options, tunnelFd: Int32) throws {
        let client = WSRelayClient(url: relayURL, log: log)
        // Chuyển tiếp "WS mở lại sau khi đứt" lên provider. Đọc handler qua `lock` vì nó có thể
        // được đặt ngay trước `start(...)` còn callback chạy trên task của WSRelayClient.
        client.onLinkReopened = { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let handler = self.onRelayLinkReopened
            self.lock.unlock()
            handler?()
        }
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
        log.log("hysteria: relay \(relayURL.absoluteString, privacy: .public) -> udp 127.0.0.1:\(port)")

        // WS phải mở TRƯỚC khi cho QUIC bắt tay: mở sau thì các gói Initial đầu tiên bị
        // WSRelayClient vứt (không có link) và QUIC phải chờ hết hạn retry.
        let deadline = Date().addingTimeInterval(Self.relayOpenGrace)
        while !client.isConnected && Date() < deadline && !isStopped {
            Thread.sleep(forTimeInterval: 0.2)
        }
        guard client.isConnected else {
            throw TransportError.relayNotStarted(
                "WS không mở được trong \(Int(Self.relayOpenGrace))s"
            )
        }

        #if canImport(Hysteria)
        // Go nói QUIC tới cổng UDP nội bộ của relay (không phải tới node): gói thật
        // được WSRelayClient chở qua WebSocket. sockFd = 0 nghĩa là Go tự mở socket UDP
        // (xem mobile.go: sockFd > 0 mới dùng socket do app cấp).
        // gomobile sinh hàm C: MobileConnect(host, port, password, obfsPass, sockFd,
        // sockTcp, upKbps, downKbps, &error) — xem Mobile.objc.h trong framework.
        // Không import kiểu `throws` nên phải truyền con trỏ NSError ra ngoài.
        var connectError: NSError?
        let connected = MobileConnect(
            Self.quicDialHost,
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
            throw TransportError.connectFailed(connectError?.localizedDescription ?? "MobileConnect trả false")
        }
        log.log("hysteria: đã bắt tay QUIC qua relay (server \(options.serverHost, privacy: .public):\(options.serverPort), up=\(options.upKbps) kbps, down=\(options.downKbps) kbps)")

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
        throw TransportError.connectFailed(
            "framework Hysteria chưa được nhúng vào extension — chạy tools/hysteria-apple/build.sh " +
            "rồi thêm Hysteria.xcframework vào target (xem project.yml)"
        )
        #endif
    }

    private var isStopped: Bool {
        lock.lock(); defer { lock.unlock() }
        return stopped
    }

    /// Dọn một lượt thử đã hỏng để lượt sau còn bind được cổng UDP mới.
    private func discardAttempt() {
        #if canImport(Hysteria)
        MobileStop()
        #endif
        lock.lock()
        let client = relay
        relay = nil
        running = false
        localPort = 0
        lock.unlock()
        client?.stop()
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

    /// fd của utun mà NetworkExtension đang dùng (đường CŨ, chỉ còn dùng cho bản WireGuard cũ
    /// `PacketTunnelProvider.swift` — không target nào build nó nữa).
    ///
    /// `NEPacketTunnelProvider` không có API công khai trả fd, nên có hai đường:
    ///   1. KVC `packetFlow.value(forKey: "socket")` — trả nil trên macOS 26.5 (19/09/2026) và
    ///      trên iPad (19/09/2026, build 1.4.0/16) ⇒ KHÔNG tin được ở đâu cả.
    ///   2. Lục fd `0...1024` tìm socket control `com.apple.net.utun_control` của CHÍNH
    ///      tiến trình extension — cách WireGuardKit tự lấy fd utun
    ///      (`Vendor/WireGuardKit/Sources/WireGuardKit/WireGuardAdapter.swift:64`) và CHỈ chạy
    ///      được trên macOS (SDK iPhoneOS không có `<sys/kern_control.h>`).
    ///
    /// Đường chạy của transport hysteria2 KHÔNG dùng hàm này: cả hai nền tảng đi qua
    /// `resolveTunnelFD` (cặp socketpair bắc cầu qua `TunnelBridge`).
    /// Trả nil ⇒ provider phải DỪNG và báo rõ, đừng chạy hysteria nửa vời.
    static func packetTunnelFileDescriptor(from flow: NEPacketTunnelFlow) -> Int32? {
        if let fd = kvcSocketDescriptor(from: flow) { return fd }
        #if os(macOS)
        return utunControlFileDescriptor()
        #else
        // iOS: SDK iPhoneOS KHÔNG có `<sys/kern_control.h>` nên `ctl_info`/`sockaddr_ctl`
        // không hiện ra trong Swift (kiểm chứng: `error: cannot find 'sockaddr_ctl' in
        // scope`) ⇒ không dò được bảng fd như macOS. KVC cũng trả nil trên máy thật, nên ở
        // iOS hàm này gần như luôn trả nil — đường chạy là `resolveTunnelFD` (socketpair).
        return nil
        #endif
    }

    /// fd utun mà NetworkExtension công bố qua KVC `packetFlow.value(forKey: "socket")`.
    /// Tách riêng để cả hai nền tảng dùng chung một cách đọc.
    private static func kvcSocketDescriptor(from flow: NEPacketTunnelFlow) -> Int32? {
        let value = flow.value(forKey: "socket")
        if let number = value as? NSNumber, number.int32Value > 0 { return number.int32Value }
        if let fd = value as? Int32, fd > 0 { return fd }
        return nil
    }

    // Đọc bộ đếm interface theo TÊN — dùng cho CẢ HAI nền tảng (không phụ thuộc fd utun).
    // Trước đây nằm trong khối `#if os(iOS)` nên macOS thiếu hàm ⇒ build đứt.
    /// `NET_RT_IFLIST2` = 6 và `RTM_IFINFO2` = 0x12 nằm trong `<net/route.h>`, header này
    /// KHÔNG có trong SDK iPhoneOS ⇒ khai lại tại chỗ, đúng cách đã khai `SYSPROTO_CONTROL`.
    private static let netRtIflist2: Int32 = 6
    private static let rtmIfinfo2: UInt8 = 0x12

    /// Tổng byte (vào + ra) của interface VẬT LÝ (mặc định `en0`), hoặc `nil` nếu không đọc được.
    ///
    /// Dùng để phân biệt **"máy đang rảnh"** với **"tunnel chết"**: khi VPN bật, lưu lượng của
    /// máy đi vào tunnel trước, nên nếu máy thật sự đang tải thì interface vật lý PHẢI nhích.
    /// Máy không tải mà tunnel 0 gói ⇒ bình thường, KHÔNG được kết luận tunnel hỏng.
    static func physicalInterfaceBytes(ifname: String = "en0") -> Int? {
        guard let counters = interfacePacketCounters(ifname: ifname) else { return nil }
        return counters.inBytes + counters.outBytes
    }

    /// Đọc `if_msghdr2` của ĐÚNG interface `ifname` từ `sysctl(NET_RT_IFLIST2)`.
    private static func interfacePacketCounters(
        ifname: String
    ) -> (in: Int, out: Int, inBytes: Int, outBytes: Int)? {
        let index = if_nametoindex(ifname)
        guard index != 0 else { return nil }
        var mib: [Int32] = [CTL_NET, PF_ROUTE, 0, 0, netRtIflist2, 0]
        var length = 0
        guard sysctl(&mib, 6, nil, &length, nil, 0) == 0, length > 0 else { return nil }
        var buffer = [UInt8](repeating: 0, count: length)
        let status = buffer.withUnsafeMutableBytes { pointer in
            sysctl(&mib, 6, pointer.baseAddress, &length, nil, 0)
        }
        guard status == 0, length <= buffer.count else { return nil }
        var offset = 0
        while offset + MemoryLayout<if_msghdr2>.size <= length {
            let header = buffer.withUnsafeBytes { pointer in
                pointer.loadUnaligned(fromByteOffset: offset, as: if_msghdr2.self)
            }
            let messageLength = Int(header.ifm_msglen)
            guard messageLength > 0, offset + messageLength <= length else { break }
            if header.ifm_type == rtmIfinfo2, header.ifm_index == index {
                return (
                    in: Int(header.ifm_data.ifi_ipackets),
                    out: Int(header.ifm_data.ifi_opackets),
                    inBytes: Int(header.ifm_data.ifi_ibytes),
                    outBytes: Int(header.ifm_data.ifi_obytes)
                )
            }
            offset += messageLength
        }
        return nil
    }
    #if os(iOS)
    /// fd utun mà NetworkExtension công bố qua KVC `socket` trên iOS — nay chỉ là ĐƯỜNG LÙI.
    ///
    /// Vì sao không còn là đường chính (đo thật trên iPad, build 1.4.0/16): KVC trả **nil**
    /// ⇒ không có fd utun nào để giao cho Go, tunnel chết ngay sau khi áp network settings
    /// (`hysteria: không lấy được fd nào để giao cho Go`). Đường chính nay là
    /// `resolveTunnelFD`: cặp socketpair bắc cầu qua `TunnelBridge` — đúng đường đã chạy trên
    /// macOS, không phụ thuộc API riêng nào của NE.
    ///
    /// Vẫn giữ: máy nào KVC còn cho fd thì `resolveTunnelFD` lùi về đây khi `socketpair` lỗi.
    /// Trả nil ⇒ provider phải dừng và báo rõ (không chạy hysteria nửa vời).
    static func directTunnelFD(from flow: NEPacketTunnelFlow) -> TunnelFD? {
        var evidence: [String] = []
        let kvc = flow.value(forKey: "socket")
        evidence.append(
            "KVC packetFlow.value(forKey: \"socket\") = "
                + (kvc.map { "\(type(of: $0)) \($0)" } ?? "nil")
        )
        guard let fd = kvcSocketDescriptor(from: flow) else { return nil }
        evidence.append(describeFD(fd: fd, origin: "KVC"))
        return TunnelFD(
            fd: fd,
            hostFd: nil,
            source: .networkExtension,
            ifname: utunInterfaceName(fd: fd),
            evidence: evidence
        )
    }

    /// Chọn fd giao cho `MobileServe` trên **iOS** — dùng ĐÚNG đường đã chạy trên macOS
    /// (`#if os(macOS)` ở dưới): cặp socketpair bắc cầu với `NEPacketTunnelFlow` qua
    /// `TunnelBridge`.
    ///
    /// Vì sao (đo thật trên iPad, build 1.4.0/16, log `hysteria: không lấy được fd nào để giao
    /// cho Go`): `packetFlow.value(forKey: "socket")` trả **nil**, mà SDK iPhoneOS không có
    /// `<sys/kern_control.h>` nên KHÔNG dò được bảng fd như macOS (`ctl_info`/`sockaddr_ctl`
    /// không hiện ra trong Swift trên iOS) ⇒ nhánh cũ không có fd nào cả và tunnel chết ngay
    /// sau khi áp network settings. Cặp socketpair thì luôn tạo được và không phụ thuộc API
    /// riêng của NE: Go đọc/ghi một đầu, `TunnelBridge` bơm hai chiều qua `packetFlow` — API
    /// CÔNG KHAI, nên định dạng gói do mình quyết định (4 byte họ địa chỉ + gói IP, đúng thứ
    /// sing-tun `tun_darwin.go` parse).
    ///
    /// KVC `socket` vẫn được ghi vào bằng chứng chẩn đoán và được dùng làm ĐƯỜNG LÙI khi
    /// `socketpair` lỗi (hết fd) — nhưng đường chạy chính KHÔNG phụ thuộc nó.
    static func resolveTunnelFD(from flow: NEPacketTunnelFlow) -> TunnelFD? {
        let kvc = flow.value(forKey: "socket")
        var evidence = [
            "KVC packetFlow.value(forKey: \"socket\") = "
                + (kvc.map { "\(type(of: $0)) \($0)" } ?? "nil"),
        ]

        var pair: [Int32] = [0, 0]
        if socketpair(AF_UNIX, SOCK_DGRAM, 0, &pair) == 0 {
            var one: Int32 = 1
            for fd in pair {
                // Đầu kia đóng thì `write` phải trả EPIPE/ECONNREFUSED chứ không giết tiến
                // trình extension bằng SIGPIPE (extension chết giữa phiên = máy mất mạng).
                _ = setsockopt(
                    fd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size)
                )
            }
            evidence.append(
                "socketpair(AF_UNIX, SOCK_DGRAM): fd cho Go = \(pair[0]), fd bắc cầu = \(pair[1])"
            )
            return TunnelFD(
                fd: pair[0],
                hostFd: pair[1],
                source: .bridge,
                ifname: nil,
                evidence: evidence
            )
        }
        evidence.append("socketpair lỗi errno=\(errno) — lùi về fd utun lấy qua KVC")
        guard let direct = directTunnelFD(from: flow) else { return nil }
        evidence.append(contentsOf: direct.evidence)
        return direct
    }

    /// Bộ đếm gói THẬT của interface utun trên iOS — đường lùi khi phiên KHÔNG chạy cầu
    /// `TunnelBridge` (chạy cầu thì `TunnelBridge` tự đếm, có cả cờ TCP).
    ///
    /// Vì sao vẫn cần: tin vào frame của relay là không đủ — QUIC gửi Initial làm `sent > 0`
    /// trong khi máy chẳng có gói nào đi qua tunnel, đúng ca "Connected mà không có mạng" mà
    /// watchdog sinh ra để chặn. Bảng interface của kernel cho đúng hai chiều đó:
    /// `ifi_opackets` = gói MÁY đưa vào tunnel, `ifi_ipackets` = gói tunnel trả về máy.
    ///
    /// Không chặn đường gói, không cần quyền đặc biệt. Đọc hỏng (sysctl bị chặn, chưa có tên
    /// utun) ⇒ trả nil, watchdog lùi về frame của relay — KHÔNG coi là "tunnel chết".
    static func utunPacketCounters(fd: Int32) -> UtunCounters? {
        guard let ifname = utunInterfaceName(fd: fd) else { return nil }
        guard let counters = interfacePacketCounters(ifname: ifname) else { return nil }
        return UtunCounters(
            toGo: counters.out,
            fromGo: counters.in,
            toGoBytes: counters.outBytes,
            fromGoBytes: counters.inBytes,
            ifname: ifname
        )
    }

    /// Bộ đếm gói + BYTE của interface utun. Byte cần cho việc khai băng thông động
    /// (`HysteriaBandwidthControl`): số khai cho Brutal CC phải sát băng thông thật, mà
    /// gói thì không suy ra được byte (kích thước gói thay đổi theo tải).
    struct UtunCounters {
        var toGo: Int
        var fromGo: Int
        /// Byte MÁY đưa vào tunnel (`ifi_obytes`).
        var toGoBytes: Int
        /// Byte tunnel trả về MÁY (`ifi_ibytes`).
        var fromGoBytes: Int
        var ifname: String
    }

    #endif

    #if os(macOS)
    /// `CTLIOCGINFO` không được export sang Swift. WireGuardKit khai lại đúng giá trị này
    /// trong `Vendor/WireGuardKit/Sources/WireGuardKitC/WireGuardKitC.h`
    /// (`#define CTLIOCGINFO 0xc0644e03UL`, = `_IOW('N', 3, struct ctl_info)`); ở đây khai
    /// lại để KHÔNG phải kéo WireGuardKit vào extension macOS (hai Go runtime ⇒ trùng symbol).
    private static let ctliocginfo: UInt = 0xc0644e03

    /// Lục bảng fd của tiến trình để tìm utun của NetworkExtension (không có API công khai).
    private static func utunControlFileDescriptor() -> Int32? {
        var ctlInfo = ctl_info()
        withUnsafeMutablePointer(to: &ctlInfo.ctl_name) {
            $0.withMemoryRebound(to: CChar.self, capacity: MemoryLayout.size(ofValue: $0.pointee)) {
                _ = strcpy($0, "com.apple.net.utun_control")
            }
        }
        for fd: Int32 in 0...1024 {
            var addr = sockaddr_ctl()
            var ret: Int32 = -1
            var len = socklen_t(MemoryLayout.size(ofValue: addr))
            withUnsafeMutablePointer(to: &addr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    ret = getpeername(fd, $0, &len)
                }
            }
            if ret != 0 || addr.sc_family != AF_SYSTEM {
                continue
            }
            if ctlInfo.ctl_id == 0 {
                ret = ioctl(fd, Self.ctliocginfo, &ctlInfo)
                if ret != 0 { continue }
            }
            if addr.sc_id == ctlInfo.ctl_id {
                return fd
            }
        }
        return nil
    }
    #endif

    // MARK: - Chọn fd giao cho Go (dùng cho extension macOS)

    /// Nguồn fd đưa cho `MobileServe`.
    enum TunnelFDSource: String {
        /// fd utun thật của NetworkExtension (KVC `socket` hoặc dò bảng fd).
        case networkExtension = "ne-utun"
        /// Cặp socket datagram tự tạo, bắc cầu với `NEPacketTunnelFlow` qua `TunnelBridge`.
        case bridge = "bridge-socketpair"
    }

    /// fd giao cho Go, kèm bằng chứng chẩn đoán để ghi thẳng vào log.
    struct TunnelFD {
        /// fd đưa cho `MobileServe`.
        var fd: Int32
        /// Đầu còn lại của cặp socket (chỉ chế độ `bridge`) — provider giữ để bắc cầu.
        var hostFd: Int32?
        var source: TunnelFDSource
        /// Tên utun của NetworkExtension nếu dò được (chỉ để log).
        var ifname: String?
        /// Từng dòng bằng chứng: giá trị KVC, fd, cờ fcntl, họ socket, tên interface.
        var evidence: [String]

        /// fd này do extension tự tạo (phải tự đóng) hay của NetworkExtension (KHÔNG được đóng).
        var ownedByExtension: Bool { source == .bridge }
    }

    /// `SYSPROTO_CONTROL` / `UTUN_OPT_IFNAME` — xem `WireGuardAdapter.interfaceName`.
    ///
    /// `SYSPROTO_CONTROL` (= 2, `<sys/kern_control.h>`) cũng không hiện ra trong Swift trên iOS
    /// (cùng lý do như `ctliocginfo`), nên khai hằng số nội bộ dùng cho cả `socket(...)` lẫn
    /// `getsockopt(...)`.
    private static let sysprotoControl: Int32 = 2
    private static let sysprotoControlSocket: Int32 = 2
    private static let utunOptIfname: Int32 = 2
    private static let utunControlName = "com.apple.net.utun_control"

    #if os(macOS)
    /// Chọn fd giao cho `MobileServe`, kèm BẰNG CHỨNG kiểm tra từng ứng viên.
    ///
    /// Vì sao không dùng thẳng fd utun của NetworkExtension (đo thật 19/09/2026, macOS 26.5):
    /// fd lấy qua KVC `packetFlow.value(forKey: "socket")` (và cả fd dò trong bảng fd, đúng
    /// cách WireGuardKit làm) là utun của NE, nhưng gói ghi vào đó bị kernel trả lỗi:
    /// `netstat -ibn` của utun đó cho `ipkts=0 ierrs=+453k opkts=0 oerrs=+442k obytes=0`
    /// trong 20 giây (≈23k lỗi/s) — chưa một gói nào tới được ứng dụng, trong khi QUIC/relay
    /// vẫn chở vài trăm KB hai chiều. Utun của NE trên macOS mới mang cờ
    /// `CHANNEL_IO,TSO4,TSO6,PARTIAL_CSUM,ZEROINVERT_CSUM`, khác utun 4-byte-header mà Go
    /// (sing-tun `tun_darwin.go`) giả định.
    ///
    /// Vì vậy đường chạy MẶC ĐỊNH là `bridge`: tự tạo một cặp socket datagram, đưa một đầu
    /// cho Go, đầu kia bắc cầu với `NEPacketTunnelFlow` (API công khai của NE, nên định dạng
    /// gói do NE bảo đảm) — `TunnelBridge` gắn 4 byte họ địa chỉ đúng thứ Go parse.
    ///
    /// Chế độ `direct` (dùng thẳng fd utun) vẫn giữ để A/B; bật bằng file chẩn đoán
    /// `Documents/hysteria-diag.txt` (`mode=direct`, `probe=1`) — không có file ⇒ mặc định.
    static func resolveTunnelFD(from flow: NEPacketTunnelFlow) -> TunnelFD? {
        var evidence: [String] = []
        let controlID = utunControlID()
        evidence.append("ctl_id(\(utunControlName)) = \(controlID.map { String($0) } ?? "không lấy được")")

        let kvc = flow.value(forKey: "socket")
        if let kvc {
            evidence.append("KVC packetFlow.value(forKey: \"socket\") = \(type(of: kvc)) \(kvc)")
        } else {
            evidence.append("KVC packetFlow.value(forKey: \"socket\") = nil")
        }

        // Ứng viên: KVC trước (đường các client NE khác dùng), rồi tới dò bảng fd.
        var candidates: [(fd: Int32, origin: String)] = []
        if let number = kvc as? NSNumber, number.int32Value > 0 {
            candidates.append((number.int32Value, "KVC"))
        } else if let value = kvc as? Int, value > 0 {
            candidates.append((Int32(value), "KVC"))
        }
        if let id = controlID {
            for fd in Int32(0)...1024 where !candidates.contains(where: { $0.fd == fd }) {
                if isUtunControl(fd: fd, controlID: id) {
                    candidates.append((fd, "dò bảng fd"))
                }
            }
        }
        for candidate in candidates {
            evidence.append(describe(fd: candidate.fd, origin: candidate.origin, controlID: controlID))
        }

        let validUtun = candidates.first { candidate in
            controlID.map { isUtunControl(fd: candidate.fd, controlID: $0) } ?? false
        }
        let probe = diagnosticFlag("probe") == "1"
        if diagnosticFlag("mode") == "direct", let validUtun {
            evidence.append("probe read: \(probeRead(fd: validUtun.fd, timeoutMs: 2000))")
            evidence.append("probe write: \(probeWrite(fd: validUtun.fd))")
            return TunnelFD(
                fd: validUtun.fd,
                hostFd: nil,
                source: .networkExtension,
                ifname: utunInterfaceName(fd: validUtun.fd),
                evidence: evidence
            )
        }
        if probe {
            for candidate in candidates {
                evidence.append("probe read fd=\(candidate.fd): \(probeRead(fd: candidate.fd, timeoutMs: 2000))")
                evidence.append("probe write fd=\(candidate.fd): \(probeWrite(fd: candidate.fd))")
            }
        }

        var pair: [Int32] = [0, 0]
        guard socketpair(AF_UNIX, SOCK_DGRAM, 0, &pair) == 0 else {
            // Không tạo được cặp socket: lùi về fd utun nếu có (hành vi cũ), còn không thì thôi.
            evidence.append("socketpair lỗi errno=\(errno) — lùi về fd utun trực tiếp")
            guard let validUtun else { return nil }
            return TunnelFD(
                fd: validUtun.fd,
                hostFd: nil,
                source: .networkExtension,
                ifname: utunInterfaceName(fd: validUtun.fd),
                evidence: evidence
            )
        }
        evidence.append("socketpair(AF_UNIX, SOCK_DGRAM): fd cho Go = \(pair[0]), fd bắc cầu = \(pair[1])")
        return TunnelFD(
            fd: pair[0],
            hostFd: pair[1],
            source: .bridge,
            ifname: validUtun.flatMap { utunInterfaceName(fd: $0.fd) },
            evidence: evidence
        )
    }

    /// `ctl_id` của kernel control `com.apple.net.utun_control`.
    private static func utunControlID() -> UInt32? {
        let probe = socket(PF_SYSTEM, SOCK_DGRAM, Self.sysprotoControlSocket)
        guard probe >= 0 else { return nil }
        defer { close(probe) }
        var info = ctl_info()
        withUnsafeMutablePointer(to: &info.ctl_name) {
            $0.withMemoryRebound(to: CChar.self, capacity: MemoryLayout.size(ofValue: $0.pointee)) {
                _ = strcpy($0, utunControlName)
            }
        }
        guard ioctl(probe, ctliocginfo, &info) == 0 else { return nil }
        return info.ctl_id
    }

    private static func isUtunControl(fd: Int32, controlID: UInt32) -> Bool {
        var addr = sockaddr_ctl()
        var len = socklen_t(MemoryLayout.size(ofValue: addr))
        let rc = withUnsafeMutablePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getpeername(fd, $0, &len)
            }
        }
        return rc == 0 && addr.sc_family == AF_SYSTEM && addr.sc_id == controlID
    }

    #endif

    /// Tên interface của fd utun (`getsockopt(UTUN_OPT_IFNAME)`) — bằng chứng fd này là utun nào.
    ///
    /// Dùng cho CẢ HAI nền tảng (iOS cần để (1) ghi log utun nào đang chở gói, (2) tra bộ đếm
    /// gói của interface trong `utunPacketCounters`); `SYSPROTO_CONTROL`/`UTUN_OPT_IFNAME` được
    /// khai lại bằng số ở dưới vì `<sys/kern_control.h>` không có trong SDK iPhoneOS.
    private static func utunInterfaceName(fd: Int32) -> String? {
        guard fd >= 0 else { return nil }
        var buffer = [UInt8](repeating: 0, count: Int(IFNAMSIZ))
        var size = socklen_t(IFNAMSIZ)
        let rc = buffer.withUnsafeMutableBufferPointer { pointer -> Int32 in
            guard let base = pointer.baseAddress else { return -1 }
            return getsockopt(fd, sysprotoControl, utunOptIfname, base, &size)
        }
        guard rc == 0 else { return nil }
        // Cắt ở byte 0 đầu tiên rồi decode — `String(cString:)` đã bị deprecate.
        return String(decoding: buffer.prefix { $0 != 0 }, as: UTF8.self)
    }

    /// Một dòng bằng chứng về một fd, KHÔNG cần `sockaddr_ctl` (dùng được cả iOS):
    /// cờ fcntl, tên utun, ifindex.
    private static func describeFD(fd: Int32, origin: String) -> String {
        var parts = ["\(origin): fd=\(fd)"]
        let flags = fcntl(fd, F_GETFL, 0)
        if flags < 0 {
            parts.append("fcntl(F_GETFL) errno=\(errno)")
        } else {
            parts.append("F_GETFL=0x\(String(flags, radix: 16))\((flags & O_NONBLOCK) != 0 ? " O_NONBLOCK" : " blocking")")
        }
        if let name = utunInterfaceName(fd: fd) {
            parts.append("ifname=\(name) ifindex=\(if_nametoindex(name))")
        } else {
            parts.append("getsockopt(UTUN_OPT_IFNAME) không cho tên utun")
        }
        return parts.joined(separator: " · ")
    }

    #if os(macOS)
    /// Một dòng bằng chứng về một fd: cờ fcntl, họ socket (có phải utun control không), tên utun.
    private static func describe(fd: Int32, origin: String, controlID: UInt32?) -> String {
        var parts = ["\(origin): fd=\(fd)"]
        let flags = fcntl(fd, F_GETFL, 0)
        if flags < 0 {
            parts.append("fcntl(F_GETFL) errno=\(errno)")
        } else {
            parts.append("F_GETFL=0x\(String(flags, radix: 16))\((flags & O_NONBLOCK) != 0 ? " O_NONBLOCK" : " blocking")")
        }
        var addr = sockaddr_ctl()
        var len = socklen_t(MemoryLayout.size(ofValue: addr))
        let rc = withUnsafeMutablePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getpeername(fd, $0, &len)
            }
        }
        if rc == 0 {
            let matches = controlID.map { addr.sc_id == $0 } ?? false
            parts.append("peer sc_family=\(addr.sc_family) sc_id=\(addr.sc_id) sc_unit=\(addr.sc_unit) utun_control=\(matches)")
        } else {
            parts.append("getpeername errno=\(errno) (không phải socket đã connect)")
        }
        if let name = utunInterfaceName(fd: fd) {
            parts.append("ifname=\(name) ifindex=\(if_nametoindex(name))")
        }
        return parts.joined(separator: " · ")
    }

    /// Đọc thử MỘT gói từ fd để biết định dạng gói thật. CHỈ chạy khi bật chẩn đoán: nó lấy
    /// mất một gói của đường đang chạy.
    private static func probeRead(fd: Int32, timeoutMs: Int32) -> String {
        var descriptor = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
        let ready = poll(&descriptor, 1, timeoutMs)
        guard ready > 0, (descriptor.revents & Int16(POLLIN)) != 0 else {
            return "poll=\(ready) errno=\(errno) — không có gói nào trong \(timeoutMs)ms"
        }
        var buffer = [UInt8](repeating: 0, count: 2048)
        let count = buffer.withUnsafeMutableBytes { read(fd, $0.baseAddress, 2048) }
        guard count > 0 else { return "read=\(count) errno=\(errno)" }
        let head = buffer.prefix(min(24, count)).map { String(format: "%02x", $0) }.joined(separator: " ")
        switch buffer[0] >> 4 {
        case 4: return "read=\(count) byte: \(head) → IPv4 TRẦN (không có 4 byte header)"
        case 6: return "read=\(count) byte: \(head) → IPv6 TRẦN (không có 4 byte header)"
        case let nibble: return "read=\(count) byte: \(head) → nibble đầu=\(nibble), KHÔNG phải gói IP trần"
        }
    }

    /// Ghi thử một gói IPv4 vô hại (proto 253, đích trong subnet utun) theo định dạng utun
    /// darwin (4 byte họ địa chỉ + gói) để biết fd có nhận không.
    private static func probeWrite(fd: Int32) -> String {
        // 45 00 0014 0000 0000 40 fd B05A | 100.100.100.101 -> 100.100.100.102
        var framed: [UInt8] = [0x00, 0x00, 0x00, 0x02]
        framed += [0x45, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00, 0x40, 0xfd,
                   0xb0, 0x5a, 100, 100, 100, 101, 100, 100, 100, 102]
        let count = framed.withUnsafeBytes { write(fd, $0.baseAddress, framed.count) }
        return "write(4 byte header + gói IPv4 20B)=\(count) errno=\(errno)"
    }

    #endif

    /// Công tắc CHẨN ĐOÁN (không có trong bản phát hành): đọc `Documents/hysteria-diag.txt`
    /// với các dòng `mode=direct|bridge` / `probe=1` để A/B hai đường lấy fd trên máy thật
    /// mà không phải build lại. Không có file ⇒ mặc định (bridge, không probe).
    /// (`internal` để `TunnelBridge` cùng file dùng được.)
    static func diagnosticFlag(_ key: String) -> String? {
        guard let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
              let text = try? String(contentsOf: base.appendingPathComponent("hysteria-diag.txt"), encoding: .utf8)
        else { return nil }
        for line in text.split(separator: "\n") {
            let parts = line.split(separator: "=", maxSplits: 1)
            if parts.count == 2, parts[0].trimmingCharacters(in: .whitespaces) == key {
                return parts[1].trimmingCharacters(in: .whitespaces)
            }
        }
        return nil
    }
}

/// Bắc cầu `NEPacketTunnelFlow` (API công khai của NetworkExtension) với một fd datagram
/// giao cho Go.
///
/// Vì sao cần: trên macOS, utun của NE không nhận gói theo định dạng mà Go (sing-tun
/// `tun_darwin.go`) giả định — xem `HysteriaTransport.resolveTunnelFD`. Bắc cầu qua
/// `packetFlow` thì định dạng gói do MÌNH quyết định: mỗi gói = 4 byte họ địa chỉ
/// big-endian (AF_INET = 2, AF_INET6 = 30) + gói IP, đúng thứ Go parse.
///
/// Chiều đi: `packetFlow.readPackets` → fd cho Go. Chiều về: fd cho Go → `packetFlow.writePackets`.
/// `packetFlow` chỉ giữ được MỘT đầu; đầu kia là của Go nên không ai giành gói với ai.
final class TunnelBridge: @unchecked Sendable {

    struct Counters: Sendable {
        var toGo = 0
        var toGoBytes = 0
        var toGoDropped = 0
        var fromGo = 0
        var fromGoBytes = 0
        var fromGoBad = 0
        /// Đếm theo giao thức để biết đường nào sống: ICMP/UDP chạy được mà TCP không là
        /// dấu hiệu của tầng TCP trong stack Go, không phải của cầu.
        var toGoTCP = 0
        var toGoUDP = 0
        var toGoICMP = 0
        var fromGoTCP = 0
        var fromGoUDP = 0
        var fromGoICMP = 0
        /// Gói mang địa chỉ trong subnet utun (100.100.100.100/30) — stack Go dùng vòng này
        /// để đẩy gói TCP đã NAT trở lại kernel (xem `processIPv4TCP` của sing-tun).
        var toGoSubnet = 0
        var fromGoSubnet = 0
        /// Gói Go gửi về có checksum SAI (kernel vứt im lặng ⇒ TCP không bao giờ lên).
        var fromGoBadChecksum = 0
        var fromGoBadTCPChecksum = 0
        /// TCP có nguồn là địa chỉ utun = SYN-ACK/ACK do listener sing-tun gửi ra.
        var toGoTCPFromTun = 0
        /// Sức khoẻ TCP của tunnel, đếm từ chính gói của MÁY (không phụ thuộc traffic của
        /// extension — traffic của extension không đi qua tunnel của nó):
        ///   `tcpSynToGo`    — máy gửi SYN vào tunnel (muốn mở kết nối).
        ///   `tcpSynAckFromGo`/`tcpRstFromGo` — tunnel trả lời được.
        /// SYN có mà không bao giờ có SYN-ACK/RST ⇒ TCP blackhole (đúng bug 19/09/2026).
        var tcpSynToGo = 0
        var tcpSynAckFromGo = 0
        var tcpRstFromGo = 0
    }

    private let flow: NEPacketTunnelFlow
    /// Đầu fd phía Go. **ĐỔI ĐƯỢC giữa phiên** (xem `retarget`) — vì vậy MỌI chỗ dùng phải
    /// đọc qua `currentHostFd` dưới `lock`, không được giữ bản sao.
    private var hostFd: Int32
    private let log: Logger
    private let lock = NSLock()
    private let tickQueue = DispatchQueue(label: "com.privatevpn.mac.tunnel-bridge.tick")
    private var counters = Counters()
    private var running = false
    private var sampled = 0
    private var heartbeat: DispatchSourceTimer?

    /// AF_INET / AF_INET6 ở dạng gói tin utun darwin — TRÙNG `packetHeader4/6` của
    /// `sing-tun/tun_darwin.go`, lệch là mọi gói về bị Go vứt.
    private static let afInet: UInt8 = 2
    private static let afInet6: UInt8 = 30

    init(flow: NEPacketTunnelFlow, hostFd: Int32, log: Logger) {
        self.flow = flow
        self.hostFd = hostFd
        self.log = log
    }

    var snapshot: Counters {
        lock.lock(); defer { lock.unlock() }
        return counters
    }

    func start() {
        lock.lock()
        if running {
            lock.unlock()
            return
        }
        running = true
        lock.unlock()
        // Không chặn callback của NetworkExtension khi Go chậm: ghi không được thì bỏ gói và đếm.
        let host = currentHostFd()
        _ = fcntl(host, F_SETFL, O_NONBLOCK)
        log.log(level: .default, "bridge: bắt đầu (hostFd \(host, privacy: .public))")
        readOutbound()
        startInboundPump()
        startHeartbeat()
    }

    /// Đầu fd phía Go hiện tại (đọc dưới `lock`).
    private func currentHostFd() -> Int32 {
        lock.lock(); defer { lock.unlock() }
        return hostFd
    }

    /// Đổi đầu fd phía Go sang cặp socketpair MỚI mà **KHÔNG dừng cầu**.
    ///
    /// VÌ SAO PHẢI CÓ (lỗi thật 24/09/2026, mất mạng 6 phút): `NEPacketTunnelFlow.readPackets`
    /// chỉ cho **MỘT** lời gọi chờ tại một thời điểm. Cách cũ `stop()` rồi tạo cầu mới để lại lời
    /// gọi `readPackets` đang chờ của cầu cũ; khi nó trả về thì cầu cũ đã `running == false` nên
    /// không gọi lại, còn lời gọi của cầu mới đã bị mất ⇒ vòng đọc `packetFlow` của cầu mới
    /// **không bao giờ chạy** (`packetFlow→Go 0 gói/0 B` mãi mãi) ⇒ máy mất Internet.
    ///
    /// `retarget` chỉ đổi `hostFd`; `pumpLoop`/`forwardToGo` đọc fd mỗi lần nên tự chuyển sang fd
    /// mới trong ≤250 ms (nhịp `poll`). Đầu fd CŨ được đóng SAU khi vòng bơm đã chuyển (0,5 s) để
    /// không đóng nhầm fd đang được poll.
    func retarget(hostFd newFd: Int32) {
        lock.lock()
        let old = hostFd
        hostFd = newFd
        lock.unlock()
        _ = fcntl(newFd, F_SETFL, O_NONBLOCK)
        guard old != newFd else { return }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 0.5) {
            close(old)
        }
        log.log(level: .default, "bridge: retarget hostFd \(old, privacy: .public) → \(newFd, privacy: .public)")
        RelayDiagnostics.shared.log("bridge: retarget hostFd \(old) -> \(newFd) (KHÔNG dừng cầu)")
    }

    func stop() {
        lock.lock()
        let wasRunning = running
        running = false
        lock.unlock()
        guard wasRunning else { return }
        heartbeat?.cancel()
        heartbeat = nil
        // Đóng đầu của mình ⇒ Go thấy `read` trả 0 và `serve()` kết thúc.
        let fd = currentHostFd()
        shutdown(fd, SHUT_RDWR)
        close(fd)
        RelayDiagnostics.shared.log("bridge: đã dừng (\(describeCounters()))")
    }

    // MARK: - packetFlow -> Go

    private func readOutbound() {
        guard isRunning else { return }
        flow.readPackets { [weak self] packets, _ in
            guard let self, self.isRunning else { return }
            for packet in packets {
                self.forwardToGo(packet)
            }
            self.readOutbound()
        }
    }

    private func forwardToGo(_ packet: Data) {
        guard !packet.isEmpty else { return }
        var framed = [UInt8](repeating: 0, count: packet.count + 4)
        // Họ địa chỉ lấy từ chính gói IP (không tin tham số của packetFlow: gói lạ vẫn phải
        // đi đúng nhánh IPv4/IPv6).
        framed[3] = (packet[packet.startIndex] >> 4) == 6 ? Self.afInet6 : Self.afInet
        framed.withUnsafeMutableBytes { destination in
            packet.withUnsafeBytes { source in
                guard let dst = destination.baseAddress, let src = source.baseAddress else { return }
                dst.advanced(by: 4).copyMemory(from: src, byteCount: packet.count)
            }
        }
        let written = framed.withUnsafeBytes { write(currentHostFd(), $0.baseAddress, framed.count) }
        let summary = Self.summarize(packet)
        lock.lock()
        if written == framed.count {
            counters.toGo += 1
            counters.toGoBytes += written
            Self.count(summary, toGo: true, counters: &counters)
        } else {
            counters.toGoDropped += 1
        }
        let seen = counters.toGo + counters.toGoDropped
        let tcpSeen = counters.toGoTCP
        let tcpFromTun = counters.toGoTCPFromTun
        lock.unlock()
        if seen <= 3 || (summary.proto == 6 && tcpSeen <= 10) || summary.touchesTunSubnet
            || (summary.fromTunAddress && summary.proto == 6 && tcpFromTun <= 20) {
            RelayDiagnostics.shared.log(
                "bridge: packetFlow→Go #\(seen) (AF=\(framed[3]), write=\(written) errno=\(errno)) \(describe(packet))"
            )
        }
    }

    // MARK: - Go -> packetFlow

    private func startInboundPump() {
        let thread = Thread { [weak self] in self?.pumpLoop() }
        thread.name = "tunnel-bridge-in"
        thread.stackSize = 512 * 1024
        thread.start()
    }

    private func pumpLoop() {
        var buffer = [UInt8](repeating: 0, count: 2048)
        while isRunning {
            // Đọc fd MỖI vòng: `retarget` có thể vừa đổi đầu fd phía Go (vòng lặp này KHÔNG
            // được dừng — xem chú thích `retarget`).
            let fd = currentHostFd()
            var descriptor = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
            let ready = poll(&descriptor, 1, 250)
            if ready <= 0 { continue }
            let count = buffer.withUnsafeMutableBytes { read(fd, $0.baseAddress, 2048) }
            if count <= 0 {
                if count == 0 || (errno != EAGAIN && errno != EINTR) {
                    RelayDiagnostics.shared.log("bridge: Go đóng fd (read=\(count) errno=\(errno))")
                    return
                }
                continue
            }
            guard count > 4 else {
                lock.lock(); counters.fromGoBad += 1; lock.unlock()
                continue
            }
            let af = Int32(buffer[3])
            let payload = Data(buffer[4..<count])
            let summary = Self.summarize(payload)
            Self.checkChecksum(payload, summary: summary, counters: &counters)
            flow.writePackets([payload], withProtocols: [NSNumber(value: af)])
            lock.lock()
            counters.fromGo += 1
            counters.fromGoBytes += count - 4
            Self.count(summary, toGo: false, counters: &counters)
            let seen = counters.fromGo
            let tcpSeen = counters.fromGoTCP
            lock.unlock()
            if seen <= 3 || (summary.proto == 6 && tcpSeen <= 10)
                || summary.touchesTunSubnet || summary.fromTunAddress {
                var extra = ""
                if summary.proto == 6, tcpSeen <= 2 {
                    extra = " hex: " + payload.prefix(48).map { String(format: "%02x", $0) }.joined(separator: " ")
                }
                RelayDiagnostics.shared.log(
                    "bridge: Go→packetFlow #\(seen) (AF=\(af)) \(describe(payload))\(extra)"
                )
            }
        }
    }

    // MARK: - Chẩn đoán

    // MARK: - Kiểm tra checksum (chẩn đoán)

    /// Cộng one's complement 16 bit (chuẩn checksum IP/TCP/UDP).
    private static func onesComplementSum(_ bytes: ArraySlice<UInt8>) -> UInt32 {
        var sum: UInt32 = 0
        var iterator = bytes.makeIterator()
        while let high = iterator.next() {
            let low = iterator.next() ?? 0
            sum &+= UInt32(high) << 8 | UInt32(low)
            if sum > 0xFFFF { sum = (sum & 0xFFFF) &+ (sum >> 16) }
        }
        return sum
    }

    /// Checksum của tầng vận chuyển (TCP/UDP) có đúng không — tính cả pseudo-header; tổng
    /// hợp lệ phải bằng 0xFFFF.
    private static func transportChecksumIsValid(_ packet: Data) -> Bool? {
        let bytes = [UInt8](packet)
        guard bytes.count >= 20, bytes[0] >> 4 == 4 else { return nil }
        let proto = bytes[9]
        guard proto == 6 || proto == 17 else { return nil }
        let headerLength = Int(bytes[0] & 0x0f) * 4
        let totalLength = Int(bytes[2]) << 8 | Int(bytes[3])
        guard totalLength >= headerLength + 8, totalLength <= bytes.count else { return nil }
        var sum = onesComplementSum(bytes[12..<20])               // src + dst
        sum &+= UInt32(proto)                                     // protocol (16 bit cao = 0)
        sum &+= UInt32(totalLength - headerLength)                // độ dài tầng vận chuyển
        sum &+= onesComplementSum(bytes[headerLength..<totalLength])
        while sum > 0xFFFF { sum = (sum & 0xFFFF) &+ (sum >> 16) }
        return sum == 0xFFFF
    }

    private static func checkChecksum(_ packet: Data, summary: PacketSummary, counters: inout Counters) {
        guard let valid = transportChecksumIsValid(packet), !valid else { return }
        counters.fromGoBadChecksum += 1
        if summary.proto == 6 { counters.fromGoBadTCPChecksum += 1 }
    }

    private func startHeartbeat() {
        let timer = DispatchSource.makeTimerSource(queue: tickQueue)
        timer.schedule(deadline: .now() + 5, repeating: 5)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            RelayDiagnostics.shared.log("bridge: \(self.describeCounters())")
        }
        timer.resume()
        heartbeat = timer
    }

    private func describeCounters() -> String {
        let snapshot = self.snapshot
        return "packetFlow→Go \(snapshot.toGo) gói/\(snapshot.toGoBytes) B (bỏ \(snapshot.toGoDropped); "
            + "TCP \(snapshot.toGoTCP), UDP \(snapshot.toGoUDP), ICMP \(snapshot.toGoICMP), subnet \(snapshot.toGoSubnet)), "
            + "Go→packetFlow \(snapshot.fromGo) gói/\(snapshot.fromGoBytes) B (gói hỏng \(snapshot.fromGoBad), checksum sai \(snapshot.fromGoBadChecksum) [TCP \(snapshot.fromGoBadTCPChecksum)]; "
            + "TCP \(snapshot.fromGoTCP), UDP \(snapshot.fromGoUDP), ICMP \(snapshot.fromGoICMP), subnet \(snapshot.fromGoSubnet)); "
            + "TCP sức khoẻ: SYN vào \(snapshot.tcpSynToGo), SYN-ACK về \(snapshot.tcpSynAckFromGo), RST về \(snapshot.tcpRstFromGo))"
    }

    /// Thông tin tối thiểu của một gói IP để chẩn đoán (chỉ ĐỌC, không sửa gói).
    private struct PacketSummary {
        var proto: UInt8 = 0
        var touchesTunSubnet = false
        var fromTunAddress = false
        /// Cờ TCP (chỉ có nghĩa khi proto == 6).
        var tcpSyn = false
        var tcpAck = false
        var tcpRst = false
    }

    /// Subnet của utun (`HysteriaDefaults.tunIPv4CIDR` = 100.100.100.101/30) — stack Go NAT
    /// gói TCP về địa chỉ `inet4Address` = 100.100.100.102 trong subnet này và đẩy ngược lại
    /// kernel; gói mang địa chỉ subnet mà không tới được kernel ⇒ TCP chết dù ICMP/UDP sống.
    private static let tunSubnetPrefix: [UInt8] = [100, 100, 100, 102]
    /// Địa chỉ của chính utun: nguồn của SYN-ACK do listener sing-tun trong extension gửi ra.
    private static let tunAddressPrefix: [UInt8] = [100, 100, 100, 101]

    private static func summarize(_ packet: Data) -> PacketSummary {
        let bytes = [UInt8](packet.prefix(40))
        guard bytes.count >= 20, bytes[0] >> 4 == 4 else { return PacketSummary() }
        var summary = PacketSummary(proto: bytes[9])
        let source = Array(bytes[12..<16])
        let destination = Array(bytes[16..<20])
        summary.touchesTunSubnet = source.starts(with: tunSubnetPrefix) || destination.starts(with: tunSubnetPrefix)
        summary.fromTunAddress = source.starts(with: tunAddressPrefix)
        if summary.proto == 6 {
            let headerLength = Int(bytes[0] & 0x0f) * 4
            if bytes.count >= headerLength + 14 {
                let bits = bytes[headerLength + 13]
                summary.tcpSyn = bits & 0x02 != 0
                summary.tcpAck = bits & 0x10 != 0
                summary.tcpRst = bits & 0x04 != 0
            }
        }
        return summary
    }

    private static func count(_ summary: PacketSummary, toGo: Bool, counters: inout Counters) {
        if toGo, summary.proto == 6, summary.fromTunAddress { counters.toGoTCPFromTun += 1 }
        if summary.proto == 6 {
            if toGo, summary.tcpSyn, !summary.tcpAck { counters.tcpSynToGo += 1 }
            if !toGo, summary.tcpSyn, summary.tcpAck { counters.tcpSynAckFromGo += 1 }
            if !toGo, summary.tcpRst { counters.tcpRstFromGo += 1 }
        }
        switch (summary.proto, toGo) {
        case (6, true): counters.toGoTCP += 1
        case (6, false): counters.fromGoTCP += 1
        case (17, true): counters.toGoUDP += 1
        case (17, false): counters.fromGoUDP += 1
        case (1, true): counters.toGoICMP += 1
        case (1, false): counters.fromGoICMP += 1
        default: break
        }
        if summary.touchesTunSubnet {
            if toGo { counters.toGoSubnet += 1 } else { counters.fromGoSubnet += 1 }
        }
    }

    /// Mô tả một gói đủ để biết nó là gì: giao thức, địa chỉ, cổng, cờ TCP.
    private func describe(_ packet: Data) -> String {
        let bytes = [UInt8](packet.prefix(40))
        guard bytes.count >= 20 else { return "\(packet.count)B (quá ngắn)" }
        guard bytes[0] >> 4 == 4 else { return "IPv6 \(packet.count)B" }
        let proto = bytes[9]
        let source = "\(bytes[12]).\(bytes[13]).\(bytes[14]).\(bytes[15])"
        let destination = "\(bytes[16]).\(bytes[17]).\(bytes[18]).\(bytes[19])"
        let headerLength = Int(bytes[0] & 0x0f) * 4
        var ports = ""
        var flags = ""
        if (proto == 6 || proto == 17), bytes.count >= headerLength + 4 {
            let sourcePort = UInt16(bytes[headerLength]) << 8 | UInt16(bytes[headerLength + 1])
            let destinationPort = UInt16(bytes[headerLength + 2]) << 8 | UInt16(bytes[headerLength + 3])
            ports = " \(sourcePort)→\(destinationPort)"
            if proto == 6, bytes.count >= headerLength + 14 {
                let bits = bytes[headerLength + 13]
                var names: [String] = []
                if bits & 0x02 != 0 { names.append("SYN") }
                if bits & 0x10 != 0 { names.append("ACK") }
                if bits & 0x01 != 0 { names.append("FIN") }
                if bits & 0x04 != 0 { names.append("RST") }
                if bits & 0x08 != 0 { names.append("PSH") }
                flags = names.isEmpty ? "" : " [" + names.joined(separator: "+") + "]"
            }
        }
        let kind = proto == 6 ? "TCP" : proto == 17 ? "UDP" : proto == 1 ? "ICMP" : "proto\(proto)"
        return "\(kind) \(source)→\(destination)\(ports)\(flags) \(packet.count)B"
    }

    private var isRunning: Bool {
        lock.lock(); defer { lock.unlock() }
        return running
    }
}
