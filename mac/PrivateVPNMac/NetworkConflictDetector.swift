import Foundation

/// Mức độ cảnh báo khi phát hiện phần mềm mạng khác đang tranh chấp với VPNFlow.
///
/// Bám đúng thang của bản Windows (`windows/PrivateVPNWindows.Core/Tunnel/NetworkConflictDetector.cs`)
/// để hai nền tảng nói cùng một ngôn ngữ với khách: `Info` < `Warning` < `Blocking`.
enum NetworkConflictSeverity: Int, Comparable, CaseIterable {
    /// Chỉ là thông tin (không chắc gây lỗi).
    case info = 0

    /// Có thể làm chậm/kết nối chập chờn — nên xử lý.
    case warning = 1

    /// Gần như chắc chắn làm VPNFlow không kết nối / không đăng nhập được.
    case blocking = 2

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }

    /// Nhãn tiếng Anh dùng cho LOG (`conflict: Blocking — Tailscale (Connected) · …`).
    /// Log phải đọc được độc lập với ngôn ngữ UI (support grep theo từ khoá cố định).
    var label: String {
        switch self {
        case .info: return "Info"
        case .warning: return "Warning"
        case .blocking: return "Blocking"
        }
    }
}

/// Loại xung đột — dùng để chọn câu chữ ĐA NGÔN NGỮ ở tầng UI (`VPNThemeMac.swift`).
///
/// Vì sao tách khỏi câu chữ: `NetworkConflict` giữ sẵn câu tiếng Việt (giống bản Windows và là
/// thứ ghi vào log), nhưng app macOS có 5 ngôn ngữ (vi/en/zh/ja/ko) nên UI ghép lại câu theo
/// `kind` + `facts` (dữ liệu trung tính ngôn ngữ: tên app, địa chỉ proxy…).
enum NetworkConflictKind: String, CaseIterable {
    /// Cấu hình VPN khác của hệ thống đang ở trạng thái Connected.
    case foreignVPNConnected = "foreign-vpn-connected"
    /// Interface tunnel KHÔNG phải của mình đang giữ default route (v4 hoặc v6).
    case foreignDefaultRoute = "foreign-default-route"
    /// Interface tunnel của app khác đang BẬT (có địa chỉ mạng) nhưng KHÔNG giữ default route.
    case foreignTunnelWithoutDefaultRoute = "foreign-tunnel-no-default-route"
    /// Proxy hệ thống đang bật (HTTP/HTTPS/SOCKS/PAC).
    case systemProxyEnabled = "system-proxy"
    /// Tiến trình app VPN/proxy đang chạy nền.
    case proxyProcessRunning = "proxy-process"
    /// Resolver DNS đang dùng KHÔNG trả lời (đo thật bằng truy vấn UDP).
    case unreachableDNSResolver = "dns-unreachable"
    /// Resolver DNS của app khác đang chen vào trong khi tunnel của mình đã bật.
    case foreignDNSResolver = "dns-foreign"
    /// Search domain của app VPN khác (MagicDNS `*.ts.net`…) đang được cắm vào hệ thống.
    case foreignDNSSearchDomain = "dns-search-domain"
}

/// Một xung đột mạng phát hiện được, kèm hướng dẫn cho người dùng.
///
/// `title`/`detail`/`advice` là tiếng Việt (giữ nguyên cấu trúc + câu chữ của bản Windows, và là
/// thứ ghi vào log cho support đọc); `facts` là dữ liệu trung tính ngôn ngữ để UI dựng câu theo
/// ngôn ngữ đang chọn.
struct NetworkConflict: Identifiable, Equatable {
    let severity: NetworkConflictSeverity
    let kind: NetworkConflictKind
    let title: String
    let detail: String
    let advice: String
    /// Dữ liệu cụ thể: tên app ("Tailscale (Connected)"), proxy ("system proxy 127.0.0.1:7890")…
    let facts: [String]

    var id: String { "\(kind.rawValue)|\(facts.joined(separator: "·"))" }
}

/// Cấu hình VPN của hệ thống (do tầng app đọc bằng `NETunnelProviderManager.loadAllFromPreferences()`).
struct SystemVPNConfiguration: Equatable {
    let localizedDescription: String
    let providerBundleIdentifier: String
    let isConnected: Bool
}

/// Một interface mạng của máy (do tầng app đọc bằng `getifaddrs` + `SCDynamicStore`).
///
/// Tương ứng `AdapterInfo` của bản Windows, thêm `isOwn` (interface của chính VPNFlow) và tách
/// default route theo family vì macOS có cả đường mặc định IPv6 qua utun khác.
struct NetworkInterfaceInfo: Equatable {
    let name: String
    /// Tên dịch vụ mạng / mô tả nếu đọc được (`""` khi không có).
    let detail: String
    /// Interface dạng tunnel: `utun*`, `ipsec*`, `ppp*`, `tun*`, `tap*`.
    let isTunnelType: Bool
    /// Interface của CHÍNH VPNFlow (mang địa chỉ tunnel / overlay của mình) — không bao giờ báo.
    let isOwn: Bool
    let hasDefaultRouteV4: Bool
    let hasDefaultRouteV6: Bool
    let gatewayV4: String?
    /// Interface có địa chỉ ĐỊNH TUYẾN ĐƯỢC (IPv4/IPv6 global — không phải link-local `fe80::…%utunN`
    /// mà macOS gán cho MỌI utun, kể cả utun rỗng).
    ///
    /// Vì sao cần: phân biệt "app VPN kia ĐANG bật thật" (tunnel có địa chỉ) với "utun rỗng của hệ
    /// thống" — chỉ ca đầu mới đáng cảnh báo mức Warning khi nó không giữ default route.
    var hasAssignedAddress: Bool = false
}

/// Trạng thái DNS của máy (do tầng app đọc bằng `SCDynamicStore` + đo reachability).
struct DNSResolverInfo: Equatable {
    /// Resolver đang là DNS chính của máy (`State:/Network/Global/DNS`).
    let servers: [String]
    /// DNS mà tunnel của VPNFlow đặt (`HysteriaDefaults.dnsServers` = 1.1.1.1, 8.8.8.8).
    let tunnelServers: [String]
    /// Server đã ĐO được là không trả lời (timeout) — đúng ca thật 26/09: `202.96.134.133`.
    let unreachableServers: [String]
    /// Search domain / supplemental match domain đang được cắm vào hệ thống (MagicDNS
    /// `tailXXXX.ts.net` của Tailscale là ca thật đã làm Safari không vào được web).
    let searchDomains: [String]
    /// Tunnel của VPNFlow đang bật (để phân biệt "resolver của app kia chen vào").
    let isTunnelActive: Bool

    static let empty = DNSResolverInfo(
        servers: [], tunnelServers: [], unreachableServers: [], searchDomains: [], isTunnelActive: false
    )
}

/// Ảnh chụp trạng thái hệ thống (do tầng App cung cấp) — tương ứng `NetworkConflictInputs` bản Windows.
struct NetworkConflictInputs: Equatable {
    let vpnConfigurations: [SystemVPNConfiguration]
    let runningProcessNames: [String]
    let systemProxyEnabled: Bool
    let systemProxyServer: String?
    let interfaces: [NetworkInterfaceInfo]
    let dns: DNSResolverInfo

    static let empty = NetworkConflictInputs(
        vpnConfigurations: [],
        runningProcessNames: [],
        systemProxyEnabled: false,
        systemProxyServer: nil,
        interfaces: [],
        dns: .empty
    )
}

/// Luật ĐO DNS trên macOS (thuần logic — test bằng `scripts/ios-pure-logic-tests/run.sh`).
///
/// VÌ SAO (ca thật 26/09/2026, log 15:39:38 và 15:41:24): tunnel VPNFlow đang `Disconnected` mà bộ dò
/// vẫn gửi truy vấn DNS tới resolver đang là DNS chính của máy (1.1.1.1/8.8.8.8 mà tunnel sẽ đặt, hoặc
/// 202.96.134.133/114.114.114.114 của nhà mạng) ⇒ tất nhiên timeout ⇒ app hiện cảnh báo "DNS đang dùng
/// không phản hồi" và khuyên khách tắt app VPN khác — cảnh báo VÔ NGHĨA, vì DNS của tunnel chỉ được áp
/// SAU khi tunnel Connected.
///
/// Luật chủ dự án chốt: chỉ ĐO khi tunnel của CHÍNH VPNFlow đang Connected, và kết quả đo trong lúc
/// tunnel tắt/đang nối KHÔNG được tính (kể cả bản nhớ tạm).
enum NetworkConflictDNSProbePolicy {
    /// Thời gian sống của một số đo DNS (giây) — quá hạn thì phải đo lại.
    static let cacheTTL: TimeInterval = 300

    /// Có được phép gửi truy vấn DNS ra ngoài không (chỉ khi tunnel của mình đang Connected).
    static func shouldMeasure(tunnelConnected: Bool) -> Bool { tunnelConnected }

    /// Có được dùng lại số đo đã nhớ tạm không: tunnel PHẢI đang Connected, số đo cũng phải được đo
    /// trong lúc tunnel Connected, và còn trong TTL.
    static func canReuseCache(
        tunnelConnected: Bool,
        measuredWhileConnected: Bool,
        age: TimeInterval,
        ttl: TimeInterval = cacheTTL
    ) -> Bool {
        tunnelConnected && measuredWhileConnected && age >= 0 && age < ttl
    }
}

/// Phát hiện phần mềm mạng khác đang tranh chấp với VPNFlow trên macOS.
///
/// Bám đúng cấu trúc + thang mức của bản Windows
/// (`windows/PrivateVPNWindows.Core/Tunnel/NetworkConflictDetector.cs`) để hai nền tảng có CÙNG
/// hành vi khi khách cài Clash/Mihomo/Tailscale/WireGuard/sing-box… song song với VPNFlow.
///
/// Vì sao cần: TUN của app khác giữ default route và (thường) chạy DNS fake-IP ⇒ gói UDP của
/// VPNFlow bị đẩy vào TUN của họ, request tới `api.meetflowai.site` hỏng ⇒ khách chỉ thấy
/// "connecting mãi" hoặc "Connected mà không có mạng" và không đoán được nguyên nhân.
///
/// Toàn bộ file là LOGIC THUẦN (chỉ Foundation): mọi dữ liệu hệ thống do tầng app thu thập
/// (`NetworkConflictProbe`) rồi truyền vào `analyze(_:)`, nên test được không cần NetworkExtension
/// (`bash scripts/ios-pure-logic-tests/run.sh`).
enum NetworkConflictDetector {
    /// Dấu hiệu của CHÍNH VPNFlow — không bao giờ được coi là xung đột.
    static let ownAdapterMarkers = ["vpnflow", "privatevpn", "flowvpn"]

    /// Dấu hiệu interface ảo/TUN của phần mềm khác (so khớp không phân biệt hoa thường).
    ///
    /// Danh sách bám bản Windows, thêm các tên chỉ có trên macOS (`utun`, `clashx`, `surge`,
    /// `tunnelblick`, `hiddify`…).
    static let virtualInterfaceMarkers = [
        "clash", "mihomo", "wintun", "tap-windows", "tap0901", "wireguard", "sing-box", "singbox",
        "netch", "openvpn", "tailscale", "zerotier", "proxy", "tun", "tap",
        "v2ray", "xray", "nekoray", "nekobox", "hysteria", "shadowsocks", "trojan", "proxifier", "sstap",
        "utun", "ipsec", "clashx", "surge", "tunnelblick", "openconnect", "anyconnect", "hiddify",
    ]

    /// Tên tiến trình của các phần mềm proxy/VPN phổ biến — so khớp CHÍNH XÁC sau khi chuẩn hoá
    /// (`/đường/dẫn/Clash Verge.app` → `clash-verge`).
    ///
    /// ⚠️ **KHÔNG đưa HELPER/AGENT chạy-nền vào danh sách này** (26/09/2026): `ovpnagent` của
    /// OpenVPN Connect là daemon root **chạy vĩnh viễn ngay khi cài app**, kể cả khi KHÔNG kết nối
    /// server nào — đo trên máy chủ dự án: PID 584/585, 0,0% CPU, 32 KB RSS, **không giữ route mặc
    /// định, không chèn DNS, không mở cổng**. Đưa nó vào đây làm app báo "phát hiện OpenVPN Connect"
    /// trong khi chẳng có tranh chấp nào ⇒ chủ dự án thấy phiền. Tranh chấp **THẬT** của OpenVPN vẫn
    /// bị bắt bằng tín hiệu tunnel/route (`foreignDefaultRoute` / `foreignTunnelWithoutDefaultRoute`),
    /// nên bỏ helper không mất khả năng phát hiện. Giữ `openvpn` = tiến trình daemon thật của bản CLI.
    static let knownProxyProcesses = [
        "clash", "clashx", "clashx-pro", "clash-verge", "clash-verge-service", "clash-meta",
        "verge-mihomo", "mihomo", "v2ray", "v2rayn", "v2rayx", "xray", "sing-box", "singbox",
        "netch", "nekoray", "nekobox", "qv2ray", "openvpn", "wireguard", "wireguard-go",
        "tunnelblick", "shadowsocks", "shadowsocksx", "ss-local", "trojan", "hysteria",
        "tailscale", "tailscaled", "ipnextension", "zerotier-one", "zerotier",
        "proxifier", "sstap", "surge", "surge-3", "surge-4", "surge-5", "mullvad", "mullvad-vpn",
        "nordvpn", "expressvpn", "protonvpn", "windscribe", "cisco", "anyconnect", "openconnect",
        "globalprotect", "forticlient", "warp-svc", "cloudflared", "loon", "quantumult",
        "stash", "outline", "gost", "tun2socks", "hiddify", "foxray", "karing", "sshuttle", "privoxy",
    ]

    /// Dấu hiệu ĐẶC TRƯNG — khớp cả khi tên tiến trình có tiền tố/hậu tố
    /// (`io.tailscale.ipn.macsys.network-extension`, `Clash Verge Helper`).
    ///
    /// ⚠️ Bỏ `openvpn`/`ovpnagent` (26/09/2026) vì đường dẫn
    /// `/Library/Frameworks/OpenVPNConnect.framework/.../ovpnagent` khớp cả hai ⇒ báo oan "OpenVPN
    /// Connect" chỉ vì app đã cài. Xem chú thích `knownProxyProcesses`.
    static let distinctiveProxyMarkers = [
        "clash", "mihomo", "sing-box", "singbox", "v2ray", "xray", "nekoray", "nekobox",
        "wireguard", "tunnelblick", "shadowsocks", "proxifier", "sstap", "tailscale",
        "ipnextension", "zerotier", "hysteria", "anyconnect", "openconnect", "globalprotect",
        "forticlient", "mullvad", "nordvpn", "expressvpn", "protonvpn", "windscribe", "surge",
        "quantumult", "hiddify", "tun2socks", "cloudflared",
    ]

    /// Dấu hiệu search domain của app VPN khác cắm vào hệ thống (Tailscale MagicDNS `*.ts.net`…).
    static let foreignDNSDomainMarkers = [
        "ts.net", "tailscale", "tailnet", "zerotier", "wireguard", "openvpn",
        "clash", "sing-box", "hiddify", "hysteria",
    ]

    /// Tên sản phẩm để nói với KHÁCH (thay vì tên tiến trình nội bộ khó hiểu như `IPNExtension`).
    private static let friendlyNames: [(marker: String, name: String)] = [
        ("ipnextension", "Tailscale"), ("tailscale", "Tailscale"),
        ("clash-verge", "Clash Verge"), ("verge-mihomo", "Clash Verge"), ("clashx", "ClashX"),
        ("clash", "Clash"), ("mihomo", "Mihomo"), ("sing-box", "sing-box"), ("singbox", "sing-box"),
        ("v2ray", "v2rayN"), ("xray", "Xray"), ("nekoray", "NekoRay"), ("nekobox", "NekoBox"),
        ("wireguard", "WireGuard"), ("tunnelblick", "Tunnelblick"), ("openvpn", "OpenVPN"),
        ("ovpnagent", "OpenVPN Connect"), ("anyconnect", "Cisco AnyConnect"),
        ("openconnect", "OpenConnect"), ("globalprotect", "GlobalProtect"),
        ("forticlient", "FortiClient"), ("surge", "Surge"), ("proxifier", "Proxifier"),
        ("sstap", "SSTap"), ("mullvad", "Mullvad"), ("nordvpn", "NordVPN"),
        ("expressvpn", "ExpressVPN"), ("protonvpn", "Proton VPN"), ("windscribe", "Windscribe"),
        ("zerotier", "ZeroTier"), ("hysteria", "Hysteria"), ("shadowsocks", "Shadowsocks"),
        ("trojan", "Trojan"), ("quantumult", "Quantumult"), ("hiddify", "Hiddify"),
        ("cloudflared", "Cloudflare WARP"), ("warp-svc", "Cloudflare WARP"),
        ("tun2socks", "tun2socks"), ("outline", "Outline"), ("loon", "Loon"), ("stash", "Stash"),
    ]

    /// Interface này có phải của phần mềm KHÁC (không phải VPNFlow) không.
    /// Khi tunnel CỦA CHÍNH VPNFlow đang Connected: hạ mức các xung đột kiểu "app/đường khác đang
    /// tranh default route" xuống `info`.
    ///
    /// Ca thật 26/09/2026 21:52:23 trên máy chủ dự án: tunnel vừa lên, bộ dò đọc default route rồi báo
    /// `conflict [Blocking] … utun8 (default route IPv4, gateway 100.100.100.101) · utun8 (default route
    /// IPv6)` — mà `100.100.100.101` CHÍNH LÀ địa chỉ utun của VPNFlow. Khách nhận hộp thoại doạ
    /// "Hãy TẮT VPN kia rồi bấm Kết nối lại" trong khi chẳng có VPN nào khác ⇒ hoang mang, bấm loạn,
    /// tunnel bị ngắt rồi traffic đi thẳng ra ngoài (bị rule chặn).
    ///
    /// Chốt an toàn: **tunnel của mình đang chạy là bằng chứng mạnh nhất rằng đường mặc định không phải
    /// của app khác**, nên trong trạng thái đó không bao giờ được doạ khách ở mức `blocking`. Vẫn giữ
    /// lại thông tin (mức `info`) để chẩn đoán về sau, và vẫn báo `blocking` cho các loại khác
    /// (proxy hệ thống, DNS hỏng…) khi tunnel CHƯA lên.
    static func demoteOwnTunnelFalsePositives(
        _ conflicts: [NetworkConflict],
        tunnelConnected: Bool
    ) -> [NetworkConflict] {
        guard tunnelConnected else { return conflicts }
        return conflicts.map { conflict in
            switch conflict.kind {
            case .foreignDefaultRoute, .foreignVPNConnected, .foreignTunnelWithoutDefaultRoute:
                guard conflict.severity > .info else { return conflict }
                return NetworkConflict(
                    severity: .info,
                    kind: conflict.kind,
                    title: conflict.title,
                    detail: conflict.detail,
                    advice: conflict.advice,
                    facts: conflict.facts
                )
            default:
                return conflict
            }
        }
    }

    static func isForeignTunnelInterface(
        name: String,
        detail: String = "",
        isTunnelType: Bool,
        isOwn: Bool = false
    ) -> Bool {
        if isOwn { return false }
        let text = "\(name) \(detail)".lowercased()
        if ownAdapterMarkers.contains(where: { text.contains($0) }) { return false }
        if isTunnelType { return true }
        return virtualInterfaceMarkers.contains { text.contains($0) }
    }

    /// Tên tiến trình (hoặc bundle id) có phải phần mềm proxy/VPN đã biết không.
    static func isKnownProxyProcess(_ processName: String?) -> Bool {
        guard let processName else { return false }
        let value = normalizedProcessName(processName)
        guard !value.isEmpty else { return false }
        if ownAdapterMarkers.contains(where: { value.contains($0) }) { return false }
        if knownProxyProcesses.contains(value) { return true }
        return distinctiveProxyMarkers.contains { value.contains($0) }
    }

    /// Tên sản phẩm để hiện cho khách ("Tailscale", "Clash Verge"…); không nhận ra thì giữ nguyên.
    static func displayName(for processName: String) -> String {
        let value = normalizedProcessName(processName)
        for entry in friendlyNames where value.contains(entry.marker) {
            return entry.name
        }
        return processName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Chuẩn hoá tên tiến trình: bỏ đường dẫn, hạ chữ, đổi khoảng trắng thành `-` (tên tiến trình
    /// trên macOS hay có khoảng trắng: `/Applications/Clash Verge.app` → `clash-verge`), bỏ đuôi gói.
    static func normalizedProcessName(_ processName: String) -> String {
        var value = processName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let slash = value.lastIndex(of: "/") {
            value = String(value[value.index(after: slash)...])
        }
        for suffix in [".exe", ".app", ".appex", ".systemextension"] where value.hasSuffix(suffix) {
            value = String(value.dropLast(suffix.count))
            break
        }
        return value
            .replacingOccurrences(of: " ", with: "-")
            .replacingOccurrences(of: "_", with: "-")
    }

    /// Phân tích và trả về danh sách cảnh báo (rỗng = hệ thống sạch).
    ///
    /// Thang mức (chủ dự án chốt lại 26/09/2026 — "có tranh chấp THẬT mới báo tắt app kia"):
    /// - **Blocking**: VPN khác đang Connected (system VPN: `loadAllFromPreferences`/`scutil --nc`) ·
    ///   interface tunnel khác giữ default route (v4/v6) · proxy hệ thống đang bật. UI hiện hộp thoại
    ///   NÊU TÊN app (vẫn có nút "Vẫn kết nối").
    /// - **Warning**: tunnel của app khác đang BẬT nhưng KHÔNG giữ default route · resolver DNS thật sự
    ///   không trả lời **trong lúc tunnel của mình Connected** · search domain MagicDNS lạ. UI chỉ hiện
    ///   BĂNG-RÔN nhẹ, vẫn cho kết nối.
    /// - **Info**: chỉ thấy TIẾN TRÌNH VPN/proxy chạy nền — im lặng, chỉ ghi log (+ thẻ Diagnostics).
    static func analyze(_ inputs: NetworkConflictInputs) -> [NetworkConflict] {
        var conflicts: [NetworkConflict] = []

        // (1) Cấu hình VPN khác của hệ thống đang Connected.
        let foreignConnected = inputs.vpnConfigurations.filter { configuration in
            guard configuration.isConnected else { return false }
            let text = "\(configuration.providerBundleIdentifier) \(configuration.localizedDescription)".lowercased()
            return !ownAdapterMarkers.contains { text.contains($0) }
        }
        if !foreignConnected.isEmpty {
            let names = foreignConnected.map { configuration -> String in
                let label = configuration.localizedDescription.isEmpty
                    ? configuration.providerBundleIdentifier
                    : configuration.localizedDescription
                return "\(label) (Connected)"
            }
            conflicts.append(NetworkConflict(
                severity: .blocking,
                kind: .foreignVPNConnected,
                title: "Có VPN khác đang kết nối",
                detail: "VPN đang bật: \(names.joined(separator: ", ")). Hai VPN cùng giữ đường mặc định sẽ tranh nhau route/DNS nên VPNFlow không bắt tay được và cũng không gọi được API để đăng nhập.",
                advice: "Hãy TẮT VPN kia (hoặc thoát hẳn app đó) rồi bấm Kết nối lại.",
                facts: names
            ))
        }

        // (2) Interface tunnel KHÁC đang giữ default route (v4 hoặc v6) — đúng cơ chế làm VPNFlow
        //     "connecting mãi" trên Windows, chỉ khác là macOS dùng utun thay cho adapter TUN.
        let foreignWithDefaultRoute = inputs.interfaces.filter { interface in
            isForeignTunnelInterface(
                name: interface.name,
                detail: interface.detail,
                isTunnelType: interface.isTunnelType,
                isOwn: interface.isOwn
            ) && (interface.hasDefaultRouteV4 || interface.hasDefaultRouteV6)
        }
        if !foreignWithDefaultRoute.isEmpty {
            var facts: [String] = []
            for interface in foreignWithDefaultRoute {
                if interface.hasDefaultRouteV4 {
                    let gateway = interface.gatewayV4.map { ", gateway \($0)" } ?? ""
                    facts.append("\(interface.name) (default route IPv4\(gateway))")
                }
                if interface.hasDefaultRouteV6 {
                    facts.append("\(interface.name) (default route IPv6)")
                }
            }
            let names = foreignWithDefaultRoute.map(\.name).joined(separator: ", ")
            conflicts.append(NetworkConflict(
                severity: .blocking,
                kind: .foreignDefaultRoute,
                title: "Có phần mềm VPN/proxy khác đang giữ đường mạng mặc định",
                detail: "Interface tunnel đang chiếm default route: \(names). Gói của VPNFlow bị đẩy vào tunnel của phần mềm đó, nên tunnel không lên và request tới api.meetflowai.site cũng hỏng (không đăng nhập / không nhận mã OTP).",
                advice: "Hãy TẮT chế độ TUN (hoặc thoát hẳn Clash Verge / ClashX / sing-box / Tailscale) rồi bấm Kết nối lại. Nếu buộc chạy song song, thêm rule DIRECT cho meetflowai.site và IP relay (165.101.114.162, 103.173.155.50) trong app đó.",
                facts: facts
            ))
        }

        // (2b) Tunnel của app khác đang BẬT (có địa chỉ định tuyến được) nhưng KHÔNG giữ default route
        //      ⇒ chỉ Warning. Đây đúng ca chủ dự án chốt 26/09/2026: "app VPN kia đang Connected nhưng
        //      không giữ default route" — chưa chiếm đường của mình nên KHÔNG được nêu hộp thoại doạ
        //      khách tắt app, chỉ nhắc nhẹ. utun RỖNG của hệ thống (chỉ có fe80::…%utunN, không địa chỉ
        //      định tuyến được) bị loại bằng `hasAssignedAddress` ⇒ không báo oan.
        let foreignTunnelsUpWithoutRoute = inputs.interfaces.filter { interface in
            isForeignTunnelInterface(
                name: interface.name,
                detail: interface.detail,
                isTunnelType: interface.isTunnelType,
                isOwn: interface.isOwn
            ) && interface.hasAssignedAddress
                && !interface.hasDefaultRouteV4
                && !interface.hasDefaultRouteV6
        }
        if !foreignTunnelsUpWithoutRoute.isEmpty {
            let facts = foreignTunnelsUpWithoutRoute.map { "\($0.name) (đang bật, không giữ default route)" }
            conflicts.append(NetworkConflict(
                severity: .warning,
                kind: .foreignTunnelWithoutDefaultRoute,
                title: "Có VPN/proxy khác đang bật nhưng không giữ đường mạng mặc định",
                detail: "Interface tunnel đang bật: \(foreignTunnelsUpWithoutRoute.map(\.name).joined(separator: ", ")). App kia CÓ thể đang chen DNS/route cho một phần lưu lượng, nhưng chưa chiếm đường mặc định của máy nên chưa chắc làm hỏng kết nối.",
                advice: "Không cần làm gì nếu VPNFlow vẫn kết nối tốt. Nếu mạng chập chờn hoặc phân giải tên miền sai, hãy tắt TUN/proxy của app đó rồi bấm Kết nối lại.",
                facts: facts
            ))
        }

        // (3) Proxy hệ thống đang bật — Clash/Surge hay bật proxy cục bộ (127.0.0.1:7890).
        if inputs.systemProxyEnabled {
            let server = inputs.systemProxyServer.flatMap { $0.isEmpty ? nil : $0 }
            let suffix = server.map { " (\($0))" } ?? ""
            conflicts.append(NetworkConflict(
                severity: .blocking,
                kind: .systemProxyEnabled,
                title: "Đang bật proxy hệ thống của macOS",
                detail: "Proxy hệ thống đang bật\(suffix). Request HTTPS tới api.meetflowai.site có thể bị đẩy qua proxy/fake-IP nên đăng nhập hoặc nhận mã OTP sẽ thất bại, và traffic của VPNFlow đi vòng qua proxy đó.",
                advice: "Hãy tắt proxy hệ thống (System Settings → Network → Details → Proxies) hoặc thoát app proxy đang bật rồi bấm Kết nối lại.",
                facts: ["system proxy\(server.map { " \($0)" } ?? "")"]
            ))
        }

        // (4) Tiến trình app VPN/proxy đang chạy nền ⇒ **Info** (im lặng, chỉ ghi log + thẻ Diagnostics).
        //
        // Vì sao hạ từ Warning xuống Info (26/09/2026): ca thật log 15:39/15:41 — Tailscale (lúc đó
        // `Disconnected`) và `ovpnagent` của OpenVPN Connect chỉ là TIẾN TRÌNH chạy nền, chưa chiếm
        // route và chưa bật proxy, mà app vẫn hiện băng-rôn "tắt app kia đi" ⇒ chủ dự án thấy phiền
        // trong khi VPN đang chạy tốt. Chỉ khi có tranh chấp THẬT (Blocking/Warning ở trên) mới nhắc.
        var running: [String] = []
        for name in inputs.runningProcessNames where isKnownProxyProcess(name) {
            let display = displayName(for: name)
            if !display.isEmpty, !running.contains(display) { running.append(display) }
        }
        if !running.isEmpty {
            conflicts.append(NetworkConflict(
                severity: .info,
                kind: .proxyProcessRunning,
                title: "Phát hiện phần mềm proxy/VPN đang chạy",
                detail: "Tiến trình: \(running.joined(separator: ", ")). Chúng chỉ đang chạy NỀN — chưa chiếm đường mặc định và chưa bật proxy hệ thống nên không ảnh hưởng việc kết nối.",
                advice: "Chỉ là thông tin — không cần làm gì khi VPNFlow vẫn kết nối bình thường.",
                facts: running
            ))
        }

        // (5) Resolver DNS không trả lời — ca thật 26/09/2026: `202.96.134.133` timeout làm DNS
        //     treo 5 s, Safari không vào được YouTube dù tunnel đã lên.
        //
        // HỢP ĐỒNG dữ liệu (luật 26/09/2026): `unreachableServers` CHỈ được chứa kết quả đo trong lúc
        // tunnel của MÌNH đang Connected (`NetworkConflictDNSProbePolicy`). Nhờ vậy cảnh báo này không
        // bao giờ phát ra khi tunnel đang tắt/đang nối — đúng nguồn "cảnh báo DNS oan" đã bị bỏ.
        if !inputs.dns.unreachableServers.isEmpty {
            let servers = inputs.dns.unreachableServers
            conflicts.append(NetworkConflict(
                severity: .warning,
                kind: .unreachableDNSResolver,
                title: "DNS đang dùng không phản hồi",
                detail: "Resolver \(servers.joined(separator: ", ")) không trả lời truy vấn DNS (quá hạn chờ). Mỗi lần mở trang sẽ chờ tới khi hết hạn rồi mới thử resolver kế tiếp — khách thấy web đứng/không vào được dù VPN đã kết nối.",
                advice: "Hãy tắt các ứng dụng VPN/mạng khác đang chen DNS, hoặc ngắt rồi kết nối lại để tunnel đặt lại DNS (1.1.1.1, 8.8.8.8).",
                facts: servers.map { "DNS \($0) (timeout)" }
            ))
        }

        // (6) Resolver của app khác chen vào trong khi tunnel của mình đã bật (DNS của tunnel phải thắng).
        if inputs.dns.isTunnelActive, !inputs.dns.servers.isEmpty,
           !inputs.dns.tunnelServers.isEmpty,
           !inputs.dns.servers.contains(where: { inputs.dns.tunnelServers.contains($0) }) {
            let servers = inputs.dns.servers
            conflicts.append(NetworkConflict(
                severity: .warning,
                kind: .foreignDNSResolver,
                title: "DNS của máy không phải DNS của tunnel",
                detail: "Tunnel đang bật nhưng resolver chính của máy là \(servers.joined(separator: ", ")) thay vì \(inputs.dns.tunnelServers.joined(separator: ", ")) của VPNFlow. Một app mạng khác đang chen DNS của nó vào ⇒ tên miền có thể bị phân giải sai (fake-IP) và trang không mở được.",
                advice: "Hãy thoát app VPN/proxy khác rồi ngắt và kết nối lại VPNFlow để DNS của tunnel được áp lại.",
                facts: servers.map { "DNS \($0)" }
            ))
        }

        // (7) Search domain của app VPN khác đang cắm vào hệ thống (Tailscale MagicDNS
        //     `tailXXXX.ts.net`) — ca thật: Safari không vào được web dù Chrome vẫn vào, vì Chrome
        //     tự phân giải riêng còn Safari đi qua resolver MagicDNS không tới được.
        let foreignDomains = inputs.dns.searchDomains.filter { domain in
            let value = domain.lowercased()
            return foreignDNSDomainMarkers.contains { value.contains($0) }
        }
        if !foreignDomains.isEmpty {
            conflicts.append(NetworkConflict(
                severity: .warning,
                kind: .foreignDNSSearchDomain,
                title: "DNS tìm kiếm của app VPN khác đang được cắm vào máy",
                detail: "Miền tìm kiếm (search domain) đang áp cho máy: \(foreignDomains.joined(separator: ", ")). Đây là DNS riêng (MagicDNS) của một app VPN khác; truy vấn đi qua nó có thể treo hoặc trả sai địa chỉ nên có app mở được web, có app không.",
                advice: "Hãy tắt/thoát app VPN đang cắm miền tìm kiếm đó (Tailscale/ZeroTier…) rồi bấm Kết nối lại.",
                facts: foreignDomains
            ))
        }

        return sortedBySeverity(conflicts)
    }

    /// Xung đột nặng nhất (nil = hệ thống sạch) — UI dùng để chọn hộp thoại/banner.
    static func worst(_ conflicts: [NetworkConflict]) -> NetworkConflict? {
        conflicts.max { $0.severity < $1.severity }
    }

    /// Một dòng log duy nhất cho support grep được, đúng định dạng chủ dự án yêu cầu:
    /// `Blocking — Tailscale (Connected) · system proxy 127.0.0.1:7890`
    static func summary(for conflicts: [NetworkConflict]) -> String {
        guard let worst = worst(conflicts) else { return "sạch" }
        let facts = conflicts.flatMap(\.facts)
        return "\(worst.severity.label) — \(facts.joined(separator: " · "))"
    }

    /// Chữ ký tình trạng xung đột — UI dùng để biết "mức/tình trạng có ĐỔI không" trước khi hiện lại
    /// băng-rôn/hộp thoại (chủ dự án chốt 26/09/2026: tình trạng không đổi thì KHÔNG nhắc lại, kể cả
    /// khi mở lại app). Đổi mức, đổi app, hoặc đổi dấu hiệu ⇒ chữ ký đổi ⇒ được nhắc lại.
    /// Rỗng = hệ thống sạch.
    static func signature(for conflicts: [NetworkConflict]) -> String {
        guard let worst = worst(conflicts) else { return "" }
        return "\(worst.severity.label)|\(conflicts.map(\.id).sorted().joined(separator: "·"))"
    }

    /// Sắp xếp nặng trước, giữ nguyên thứ tự phát hiện trong cùng một mức.
    private static func sortedBySeverity(_ conflicts: [NetworkConflict]) -> [NetworkConflict] {
        conflicts.enumerated()
            .sorted { lhs, rhs in
                if lhs.element.severity != rhs.element.severity {
                    return lhs.element.severity > rhs.element.severity
                }
                return lhs.offset < rhs.offset
            }
            .map(\.element)
    }
}
