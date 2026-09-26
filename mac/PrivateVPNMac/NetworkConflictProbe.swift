import AppKit
import Darwin
import Foundation
import NetworkExtension
import SystemConfiguration
import os

/// Đọc trạng thái mạng thật của máy macOS để đưa cho `NetworkConflictDetector`.
///
/// Vì sao cần: ClashX Pro / Clash Verge / Mihomo / Tailscale / sing-box… bật TUN sẽ chiếm default
/// route và cắm DNS (fake-IP hoặc MagicDNS), làm VPNFlow không bắt tay được VÀ không gọi được API
/// (không đăng nhập / không nhận mã OTP). Khách chỉ thấy "connecting mãi" nên phải chỉ đích danh
/// app đang tranh chấp ngay trong app.
///
/// Nguồn dữ liệu (đều chỉ ĐỌC, không cần quyền root):
/// 1. `NETunnelProviderManager.loadAllFromPreferences()` — cấu hình VPN của hệ thống. Đo thật
///    26/09/2026 trên máy chủ dự án: đọc được CẢ VPN của app khác (Tailscale
///    `io.tailscale.ipn.macos.network-extension` connected=true, Vietnam-WireGuard) — nên đây là
///    nguồn chính để bắt ca "VPN khác đang Connected" ⇒ Blocking. Nguồn này lỗi thì vẫn còn các
///    nguồn dưới (route/DNS/tiến trình);
/// 2. `NSWorkspace` + `sysctl(KERN_PROC_ALL)` — tiến trình app VPN/proxy đang chạy (kể cả daemon);
/// 3. `SCDynamicStoreCopyProxies` — proxy hệ thống (HTTP/HTTPS/SOCKS/PAC);
/// 4. `State:/Network/Global/IPv4|IPv6` — interface + gateway đang giữ default route;
/// 5. `getifaddrs` — danh sách interface, nhận diện interface CỦA MÌNH (địa chỉ tunnel/overlay) và
///    interface của app khác đang BẬT thật (`hasAssignedAddress`);
/// 6. `State:/Network/Global/DNS` + `State:/Network/Service/*/DNS` — resolver + search domain;
///    resolver toàn cục được ĐO bằng truy vấn UDP (timeout) — **chỉ khi tunnel của mình Connected**
///    (`NetworkConflictDNSProbePolicy`; ca thật `202.96.134.133` timeout).
enum NetworkConflictProbe {
    private static let log = Logger(subsystem: "com.privatevpn.mac", category: "net-conflict")

    /// Thời gian chờ một truy vấn DNS khi đo reachability (ms).
    static let dnsProbeTimeoutMS: Int32 = 700

    /// Kết quả đo DNS được nhớ tạm: đo tốn tới ~1 s nên chỉ chạy khi mở app/làm mới, còn lúc bấm
    /// Kết nối thì dùng lại (KHÔNG làm chậm đường Connect).
    ///
    /// LUẬT (26/09/2026 — xem `NetworkConflictDNSProbePolicy`): số đo CHỈ hợp lệ khi nó được đo trong
    /// lúc tunnel của mình đang Connected. Tunnel tắt/đang nối ⇒ bỏ sạch cache, không tính lại kết quả
    /// cũ (đúng nguồn "cảnh báo DNS oan" lúc 15:39/15:41).
    nonisolated(unsafe) private static var cachedUnreachableDNS: [String] = []
    nonisolated(unsafe) private static var dnsProbedAt: Date?
    /// Số đo đang nhớ tạm có được đo trong lúc tunnel Connected không.
    nonisolated(unsafe) private static var dnsProbedWhileConnected = false

    /// Dấu hiệu interface dạng tunnel trên macOS.
    private static let tunnelPrefixes = ["utun", "ipsec", "ppp", "tun", "tap"]

    private struct DefaultRoute {
        let interface: String
        let router: String?
    }

    private struct DNSState {
        var servers: [String] = []
        var searchDomains: [String] = []
    }

    /// Chụp trạng thái + phân tích (rỗng = hệ thống sạch).
    ///
    /// `tunnelConnected` = tunnel của CHÍNH VPNFlow đang Connected. Bỏ trống (`nil`) thì suy ra từ việc
    /// có interface của mình (`isOwn`) — dùng cho công cụ dòng lệnh; tầng app truyền trạng thái NE thật.
    static func detect(
        ownOverlayIP: String? = nil,
        tunnelConnected: Bool? = nil,
        probeDNS: Bool = true
    ) async -> [NetworkConflict] {
        NetworkConflictDetector.analyze(
            await capture(ownOverlayIP: ownOverlayIP, tunnelConnected: tunnelConnected, probeDNS: probeDNS)
        )
    }

    /// Chụp trạng thái hệ thống. KHÔNG ném exception: nguồn nào lỗi thì coi như rỗng
    /// (thà bỏ sót một cảnh báo còn hơn chặn oan việc kết nối của khách).
    static func capture(
        ownOverlayIP: String? = nil,
        tunnelConnected: Bool? = nil,
        probeDNS: Bool = true
    ) async -> NetworkConflictInputs {
        let store = SCDynamicStoreCreate(
            nil,
            "com.privatevpn.mac.net-conflict" as CFString,
            nil,
            nil
        )
        let configurations = await vpnConfigurations()
        let processes = await runningProcessNames()
        let proxy = systemProxy(store: store)
        let routeV4 = defaultRoute(store: store, key: "State:/Network/Global/IPv4")
        let routeV6 = defaultRoute(store: store, key: "State:/Network/Global/IPv6")
        let interfaces = networkInterfaces(
            routeV4: routeV4,
            routeV6: routeV6,
            ownOverlayIP: ownOverlayIP
        )
        let dns = dnsState(store: store)
        let tunnelActive = interfaces.contains { $0.isOwn }
        let tunnelUp = tunnelConnected ?? tunnelActive

        // DNS: CHỈ đo khi tunnel của MÌNH đang Connected (luật 26/09/2026). Lúc tunnel tắt/đang nối thì
        // resolver nào cũng timeout (DNS của tunnel chưa được áp) ⇒ đo chỉ sinh cảnh báo oan, nên bỏ
        // luôn cả bản cache để số đo cũ không quay lại khi tunnel vừa lên.
        var unreachable: [String] = []
        if NetworkConflictDNSProbePolicy.shouldMeasure(tunnelConnected: tunnelUp) {
            if probeDNS {
                unreachable = await measureUnreachableDNS(dns.servers)
                cachedUnreachableDNS = unreachable
                dnsProbedAt = Date()
                dnsProbedWhileConnected = true
            } else if let probedAt = dnsProbedAt,
                      NetworkConflictDNSProbePolicy.canReuseCache(
                          tunnelConnected: tunnelUp,
                          measuredWhileConnected: dnsProbedWhileConnected,
                          age: Date().timeIntervalSince(probedAt)
                      ) {
                // Chỉ giữ server còn nằm trong danh sách hiện tại (đổi mạng ⇒ bản cache cũ vô hiệu).
                unreachable = cachedUnreachableDNS.filter { dns.servers.contains($0) }
            }
        } else {
            cachedUnreachableDNS = []
            dnsProbedAt = nil
            dnsProbedWhileConnected = false
        }

        log.info(
            "net-conflict: đọc xong — vpn=\(configurations.count, privacy: .public) iface=\(interfaces.count, privacy: .public) dns=\(dns.servers.joined(separator: ","), privacy: .public) tunnelActive=\(tunnelActive, privacy: .public) tunnelConnected=\(tunnelUp, privacy: .public) doDNS=\(NetworkConflictDNSProbePolicy.shouldMeasure(tunnelConnected: tunnelUp), privacy: .public)"
        )

        return NetworkConflictInputs(
            vpnConfigurations: configurations,
            runningProcessNames: processes,
            systemProxyEnabled: proxy.enabled,
            systemProxyServer: proxy.server,
            interfaces: interfaces,
            dns: DNSResolverInfo(
                servers: dns.servers,
                tunnelServers: HysteriaDefaults.dnsServers,
                unreachableServers: unreachable,
                searchDomains: dns.searchDomains,
                isTunnelActive: tunnelActive
            )
        )
    }

    // MARK: - 1. Cấu hình VPN của hệ thống

    private static func vpnConfigurations() async -> [SystemVPNConfiguration] {
        do {
            let managers = try await NETunnelProviderManager.loadAllFromPreferences()
            return managers.map { manager in
                let provider = (manager.protocolConfiguration as? NETunnelProviderProtocol)?
                    .providerBundleIdentifier ?? ""
                return SystemVPNConfiguration(
                    localizedDescription: manager.localizedDescription ?? "",
                    providerBundleIdentifier: provider,
                    isConnected: manager.connection.status == .connected
                )
            }
        } catch {
            // Không có quyền/khoá bảo mật: bỏ qua nguồn này, các nguồn còn lại vẫn chạy.
            log.info("net-conflict: không đọc được VPN preferences: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    // MARK: - 2. Tiến trình đang chạy

    private static func runningProcessNames() async -> [String] {
        // NSWorkspace: app có UI (Tailscale.app, ClashX.app, OpenVPN Connect…) — phải hỏi ở main thread.
        let visible: [String] = await MainActor.run {
            NSWorkspace.shared.runningApplications.flatMap { app -> [String] in
                var values: [String] = []
                if let name = app.localizedName { values.append(name) }
                if let bundle = app.bundleIdentifier { values.append(bundle) }
                if let executable = app.executableURL?.lastPathComponent { values.append(executable) }
                return values
            }
        }
        // sysctl: bắt cả tiến trình nền không có UI (IPNExtension, mihomo, tailscaled, ovpnagent…).
        return visible + kernelProcessNames()
    }

    /// Tên tiến trình từ bảng tiến trình của kernel (`KERN_PROC_ALL`, chỉ đọc, không cần root).
    static func kernelProcessNames() -> [String] {
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0]
        var size = 0
        guard sysctl(&mib, u_int(mib.count), nil, &size, nil, 0) == 0, size > 0 else { return [] }
        let stride = MemoryLayout<kinfo_proc>.stride
        let capacity = size / stride + 16
        var processes = [kinfo_proc](repeating: kinfo_proc(), count: capacity)
        var actual = capacity * stride
        guard sysctl(&mib, u_int(mib.count), &processes, &actual, nil, 0) == 0 else { return [] }
        let used = min(capacity, actual / stride)
        return processes.prefix(used).compactMap { process in
            let name = withUnsafeBytes(of: process.kp_proc.p_comm) { raw -> String in
                String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
            }
            return name.isEmpty ? nil : name
        }
    }

    // MARK: - 3. Proxy hệ thống

    /// Proxy hệ thống đang bật. Khoá đọc theo tên tài liệu của SystemConfiguration; giá trị 1 = bật.
    /// Lưu ý: dictionary proxy LUÔN tồn tại (ví dụ chỉ có `FTPPassive`) nên KHÔNG được coi
    /// "có dictionary" là "đang bật proxy".
    private static func systemProxy(store: SCDynamicStore?) -> (enabled: Bool, server: String?) {
        guard let raw = SCDynamicStoreCopyProxies(store) else { return (false, nil) }
        let dictionary = raw as NSDictionary
        func enabled(_ key: String) -> Bool {
            if let number = dictionary[key] as? NSNumber { return number.intValue != 0 }
            return (dictionary[key] as? Bool) ?? false
        }
        func text(_ key: String) -> String? {
            let value = dictionary[key] as? String
            return (value?.isEmpty ?? true) ? nil : value
        }
        func port(_ key: String) -> Int? {
            (dictionary[key] as? NSNumber)?.intValue
        }
        func endpoint(_ host: String?, _ port: Int?) -> String? {
            guard let host else { return nil }
            guard let port, port > 0 else { return host }
            return "\(host):\(port)"
        }

        if enabled("HTTPSEnable"), let server = endpoint(text("HTTPSProxy"), port("HTTPSPort")) {
            return (true, server)
        }
        if enabled("HTTPEnable"), let server = endpoint(text("HTTPProxy"), port("HTTPPort")) {
            return (true, server)
        }
        if enabled("SOCKSEnable"), let server = endpoint(text("SOCKSProxy"), port("SOCKSPort")) {
            return (true, server)
        }
        if enabled("ProxyAutoConfigEnable") {
            return (true, text("ProxyAutoConfigURLString") ?? "PAC")
        }
        return (false, nil)
    }

    // MARK: - 4. Default route của hệ thống

    private static func defaultRoute(store: SCDynamicStore?, key: String) -> DefaultRoute? {
        guard let store,
              let value = SCDynamicStoreCopyValue(store, key as CFString) as? [String: Any],
              let interface = value["PrimaryInterface"] as? String,
              !interface.isEmpty else {
            return nil
        }
        return DefaultRoute(interface: interface, router: value["Router"] as? String)
    }

    // MARK: - 5. Interface mạng

    private static func networkInterfaces(
        routeV4: DefaultRoute?,
        routeV6: DefaultRoute?,
        ownOverlayIP: String?
    ) -> [NetworkInterfaceInfo] {
        var addresses: [String: Set<String>] = [:]
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0, let first = head else { return [] }
        defer { freeifaddrs(head) }

        var cursor: UnsafeMutablePointer<ifaddrs>? = first
        while let current = cursor {
            let interface = current.pointee
            let name = String(cString: interface.ifa_name)
            let isUp = (Int32(interface.ifa_flags) & IFF_UP) != 0
                && (Int32(interface.ifa_flags) & IFF_RUNNING) != 0
            if isUp, let address = interface.ifa_addr {
                let family = address.pointee.sa_family
                if family == UInt8(AF_INET) || family == UInt8(AF_INET6),
                   let text = numericAddress(address) {
                    addresses[name, default: []].insert(text)
                }
            }
            cursor = interface.ifa_next
        }

        return addresses.keys.sorted().map { name in
            let own = isOwnInterface(
                addresses: addresses[name] ?? [],
                ownOverlayIP: ownOverlayIP
            )
            let hasV4 = routeV4?.interface == name
            return NetworkInterfaceInfo(
                name: name,
                detail: "",
                isTunnelType: tunnelPrefixes.contains { name.lowercased().hasPrefix($0) },
                isOwn: own,
                hasDefaultRouteV4: hasV4,
                hasDefaultRouteV6: routeV6?.interface == name,
                gatewayV4: hasV4 ? routeV4?.router : nil,
                hasAssignedAddress: hasRoutableAddress(addresses[name] ?? [])
            )
        }
    }

    /// Interface có địa chỉ ĐỊNH TUYẾN ĐƯỢC không (dùng để biết tunnel của app khác đang BẬT thật).
    ///
    /// Loại trừ địa chỉ mà macOS gán cho interface RỖNG: link-local `fe80::…%utunN` (mọi utun đều có),
    /// `169.254.x` (IPv4 link-local) và loopback. Thiếu phép loại này thì mọi utun hệ thống đều bị coi
    /// là "VPN khác đang bật" ⇒ báo oan.
    private static func hasRoutableAddress(_ addresses: Set<String>) -> Bool {
        addresses.contains { address in
            !address.contains("%")
                && address != "::1"
                && !address.hasPrefix("127.")
                && !address.hasPrefix("169.254.")
        }
    }

    /// Interface này có phải của CHÍNH VPNFlow không (mang địa chỉ tunnel/overlay của mình).
    ///
    /// `100.100.100.101` là địa chỉ utun của tunnel (`HysteriaDefaults.tunIPv4Address`),
    /// `2001::ffff:ffff:ffff:fff1` là địa chỉ IPv6 của nó, còn `10.77.x` là overlay WireGuard.
    private static func isOwnInterface(
        addresses: Set<String>,
        ownOverlayIP: String?
    ) -> Bool {
        let ownAddresses = Set(
            [HysteriaDefaults.tunIPv4Address, HysteriaDefaults.tunIPv6Address]
                + [ownOverlayIP].compactMap { $0 }
        )
        for address in addresses {
            let bare = address.split(separator: "%").first.map(String.init) ?? address
            if ownAddresses.contains(bare) { return true }
            if bare.hasPrefix("10.77.") { return true }
        }
        return false
    }

    private static func numericAddress(_ address: UnsafeMutablePointer<sockaddr>) -> String? {
        var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        let length = socklen_t(address.pointee.sa_len)
        guard getnameinfo(address, length, &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else {
            return nil
        }
        return String(decoding: host.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }, as: UTF8.self)
    }

    // MARK: - 6. DNS

    /// Resolver toàn cục (thứ app thật sự dùng) + search domain đang cắm vào máy.
    ///
    /// Cố ý CHỈ lấy `State:/Network/Global/DNS` cho `servers`: các resolver "scoped" của en0
    /// (ví dụ DNS nhà mạng) vẫn luôn tồn tại và KHÔNG được app dùng khi tunnel đang giữ DNS, nên
    /// báo chúng là "resolver lạ" sẽ là báo oan.
    private static func dnsState(store: SCDynamicStore?) -> DNSState {
        var state = DNSState()
        guard let store else { return state }
        if let value = SCDynamicStoreCopyValue(store, "State:/Network/Global/DNS" as CFString)
            as? [String: Any] {
            state.servers += value["ServerAddresses"] as? [String] ?? []
            state.searchDomains += value["SearchDomains"] as? [String] ?? []
            state.searchDomains += value["SupplementalMatchDomains"] as? [String] ?? []
        }
        if let keys = SCDynamicStoreCopyKeyList(store, "State:/Network/Service/.*/DNS" as CFString)
            as? [String] {
            for key in keys {
                guard let value = SCDynamicStoreCopyValue(store, key as CFString) as? [String: Any] else {
                    continue
                }
                state.searchDomains += value["SearchDomains"] as? [String] ?? []
                state.searchDomains += value["SupplementalMatchDomains"] as? [String] ?? []
            }
        }
        state.servers = dedup(state.servers)
        state.searchDomains = dedup(state.searchDomains)
        return state
    }

    private static func dedup(_ values: [String]) -> [String] {
        var result: [String] = []
        for value in values where !value.isEmpty && !result.contains(value) {
            result.append(value)
        }
        return result
    }

    /// Đo thật: resolver nào không trả lời truy vấn DNS trong `dnsProbeTimeoutMS`.
    private static func measureUnreachableDNS(_ servers: [String]) async -> [String] {
        guard !servers.isEmpty else { return [] }
        return await Task.detached(priority: .utility) {
            servers.filter { !dnsServerAnswers($0) }
        }.value
    }

    /// Gửi MỘT truy vấn A cho `example.com` và chờ phản hồi. Chỉ đo địa chỉ IPv4 literal; hostname
    /// (không phải ca thật) được coi là "ổn" thay vì đoán.
    static func dnsServerAnswers(_ server: String) -> Bool {
        var address = in_addr()
        guard inet_pton(AF_INET, server, &address) == 1 else { return true }

        let descriptor = socket(AF_INET, SOCK_DGRAM, 0)
        guard descriptor >= 0 else { return true }
        defer { close(descriptor) }
        _ = fcntl(descriptor, F_SETFL, fcntl(descriptor, F_GETFL, 0) | O_NONBLOCK)

        var target = sockaddr_in()
        target.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        target.sin_family = sa_family_t(AF_INET)
        target.sin_port = UInt16(53).bigEndian
        target.sin_addr = address

        let query = dnsQuery()
        let sent = withUnsafePointer(to: &target) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
                sendto(
                    descriptor,
                    query,
                    query.count,
                    0,
                    socketAddress,
                    socklen_t(MemoryLayout<sockaddr_in>.size)
                )
            }
        }
        guard sent == query.count else { return true }

        var pollDescriptor = pollfd(fd: descriptor, events: Int16(POLLIN), revents: 0)
        let ready = poll(&pollDescriptor, 1, dnsProbeTimeoutMS)
        guard ready > 0, (pollDescriptor.revents & Int16(POLLIN)) != 0 else { return false }

        var buffer = [UInt8](repeating: 0, count: 512)
        let received = recv(descriptor, &buffer, buffer.count, 0)
        return received > 0
    }

    /// Truy vấn DNS tối thiểu (12 byte header + `example.com` A IN) — chỉ để biết resolver có sống.
    private static func dnsQuery() -> [UInt8] {
        [
            0x12, 0x34,                                     // ID
            0x01, 0x00,                                     // RD
            0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // QDCOUNT=1
            0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, // "example"
            0x03, 0x63, 0x6f, 0x6d,                         // "com"
            0x00,                                           // root
            0x00, 0x01,                                     // QTYPE=A
            0x00, 0x01,                                     // QCLASS=IN
        ]
    }
}
