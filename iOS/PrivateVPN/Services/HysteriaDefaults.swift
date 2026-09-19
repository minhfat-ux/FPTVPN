import Foundation

/// Hằng số transport hysteria2 dùng chung cho app + packet-tunnel (iOS và macOS).
///
/// Giá trị hình học (cổng, MTU, địa chỉ utun, băng thông khai cho Brutal CC) phải
/// khớp `android/app/src/main/java/com/privatevpn/app/vpn/HysteriaVpnService.kt`
/// (HY_MTU = 1500, utun 100.100.100.101/30) và `Config.kt`.
///
/// Credential (password/obfs) KHÔNG nằm ở đây: AGENTS.md §1 cấm đưa secret mới vào
/// code, và credential hysteria hiện là giá trị công khai trong APK. App đọc
/// credential từ Info.plist (`HysteriaPassword`, `HysteriaObfs`) do build-time
/// xcconfig nội bộ truyền vào (`iOS/Hysteria.local.xcconfig`, đã gitignore) rồi
/// chuyển cho extension qua `providerConfiguration`. Kế hoạch dài hạn: control plane
/// phát credential theo từng người dùng (hysteria `userpass`).
enum HysteriaDefaults {
    /// Cổng UDP hysteria của node (KHÔNG phải cổng relay).
    static let serverPort: UInt16 = 8443

    /// Relay WebSocket của node-2 — đo 19/09 nhanh hơn node-1 khi đi qua Cloudflare.
    static let relayURLCandidates: [String] = [
        "wss://api.meetflowai.site/relay/vn2hy",
        "wss://api.meetflowai.site/relay/vn1hy"
    ]

    /// MTU của utun: 1500 như Android. Đường WS/Cloudflare cộng thêm header nên
    /// vẫn nằm trong hạn mức của QUIC.
    static let mtu = 1500

    /// Địa chỉ utun, khớp Android (100.100.100.101/30).
    static let tunIPv4Address = "100.100.100.101"
    static let tunIPv4SubnetMask = "255.255.255.252"
    /// Cùng địa chỉ nhưng ở dạng CIDR cho `MobileServe`: Go parse bằng `netip.ParsePrefix`
    /// nên thiếu "/" là lỗi ngay (`bad ipv4 "100.100.100.101": no '/'`) và transport chết
    /// đúng lúc vừa lên. Khớp `HY_TUN_IPV4` của Android (`HysteriaVpnService.kt:1121`).
    static let tunIPv4CIDR = "100.100.100.101/30"
    static let tunIPv6Address = "2001::ffff:ffff:ffff:fff1"
    static let tunIPv6PrefixLength = 126
    /// Địa chỉ IPv6 đưa cho `MobileServe`. Để RỖNG như Android (`HY_TUN_IPV6 = ""`):
    /// tunnel của sản phẩm chỉ áp IPv4 settings, đưa IPv6 vào đây là lệch với utun thật.
    static let tunIPv6CIDR = ""

    /// Brutal CC: khai SÁT băng thông thật của mạng đang dùng. Khai cao hơn thật
    /// làm Brutal tự bóp nghẽn (đo được: khai 300/1000 Mbps ⇒ 1,3 Mbps).
    static let upKbps = 30_000
    static let downKbps = 100_000

    /// Bao lâu thì coi như đường hysteria không lên được và rơi về transport WireGuard.
    static let startTimeout: TimeInterval = 20

    static let dnsServers = ["1.1.1.1"]
}
