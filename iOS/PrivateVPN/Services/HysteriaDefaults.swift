import Foundation

/// Hằng số transport hysteria2 dùng chung cho app + packet-tunnel (iOS và macOS).
///
/// Giá trị hình học (cổng, địa chỉ utun, băng thông khai cho Brutal CC) khớp
/// `android/app/src/main/java/com/privatevpn/app/vpn/HysteriaVpnService.kt`
/// (utun 100.100.100.101/30) và `Config.kt`.
///
/// NGOẠI LỆ có chủ ý — MTU: iOS dùng **1300** (xem `mtu`) trong khi Android trong repo vẫn
/// 1500, vì bản vá MTU của Android đang nằm trong `git stash` (xem
/// `evidence/2026-09-22-android-mtu-dns-pending.md`). Hai bên phải hội tụ về cùng một số
/// ngay sau khi bản vá Android được áp.
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

    /// MTU của utun — hạ **1500 → 1300** theo `docs/TUNNEL_MTU_DNS_BUGREPORT.md` §4.1
    /// (cùng số với bản vá đã làm cho Android: `HY_MTU` 1500 → 1300).
    ///
    /// Vì sao: Hysteria đi trên QUIC/UDP nên mỗi gói bị bọc thêm ~60–100 byte header; payload
    /// 1500 vượt path-MTU của mạng nền thật (1400–1500) ⇒ gói LỚN bị drop, gói nhỏ vẫn qua:
    /// TLS ClientHello/ServerHello mất ⇒ trang không mở được dù bắt tay TCP xong. Đo trên
    /// iPhone 23/09/2026: `SYN vào 5 / SYN-ACK về 5` cân, nhưng `observed=0` và cầu bỏ gói
    /// (`write=1504 errno=35`) ⇒ "kết nối nhưng không có mạng".
    ///
    /// PHẢI dùng CHÍNH hằng số này cho cả `NEPacketTunnelNetworkSettings.mtu` và
    /// `MobileServe(fd, mtu, …)`: utun khai một MTU còn Go cắt gói theo MTU khác thì gói bị
    /// cắt sai chỗ, hỏng nặng hơn.
    static let mtu = 1300

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

    /// `>= 2` resolver (theo §4.2 của bugreport): tun chỉ có 1 resolver thì khi UDP:53 rớt gói
    /// là MỌI truy vấn chết cùng lúc (`unknown host` ngẫu nhiên) mà không có đường thử lại.
    /// Cùng lý do và cùng danh sách với bản vá Android (`Config.HY_DNS_SERVERS`).
    static let dnsServers = ["1.1.1.1", "8.8.8.8"]
}
