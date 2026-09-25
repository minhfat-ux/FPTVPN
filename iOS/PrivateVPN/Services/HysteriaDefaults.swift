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

    /// Relay WebSocket dự phòng, thử LẦN LƯỢT khi cửa trước không mở được.
    ///
    /// 26/09/2026 — thêm **CỬA VÀO THỨ HAI** (`t1.meetflowai.site`). Vì sao: log máy thật iPhone
    /// trên 5G có `WS không mở được trong 6s` ⇒ `TUNNEL_START_FAILED`, mà lần ngay sau đó lại mở
    /// được ⇒ hỏng **theo HOSTNAME**, không theo node. Trước bản này cả 2 candidate đều nằm trên
    /// `api.meetflowai.site` nên "thử relay kế tiếp" **chỉ đổi node, không đổi cửa vào** ⇒ không
    /// cứu được gì khi chính hostname đó chậm/bị chặn.
    ///
    /// Thứ tự cố ý: cửa chính trước (nhanh hơn khi tốt), rồi mới sang cửa hai.
    static let relayURLCandidates: [String] = [
        "wss://api.meetflowai.site/relay/vn2hy",
        "wss://api.meetflowai.site/relay/vn1hy",
        // Cửa vào THỨ HAI — cùng Cloudflare nhưng KHÁC hostname ⇒ thoát được ca chặn/chậm theo tên.
        // `t1` nằm chung site block Caddy với apex trên node-2 nên phục vụ được `/relay/*`.
        "wss://t1.meetflowai.site/relay/vn1hy",
        "wss://t1.meetflowai.site/relay/vn2hy"
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
    /// Địa chỉ IPv6 đưa cho Go (`MobileServe`).
    ///
    /// 26/09/2026 — GIỮ RỖNG **có chủ đích**, nhưng lý do đã ĐỔI so với trước: trước đây utun
    /// không có IPv6 nên đưa vào là lệch. Nay utun **CÓ** IPv6 (`ipv6Settings` được áp trong
    /// `networkSettings`, xem `HysteriaPacketTunnelProvider`), nhưng Go vẫn nhận rỗng để
    /// `Inet6Address = nil` — **đúng thứ ta cần**: gói IPv6 vào tunnel sẽ bị tầng Go BỎ, nên app
    /// lùi về IPv4 trong ~250 ms thay vì rò ra đường vật lý.
    /// (Đọc `tools/hysteria-android/mobile.go:243-251`: rỗng ⇒ bỏ qua, KHÔNG lỗi.)
    static let tunIPv6CIDR = ""

    /// Dải IPv6 của Cloudflare — nguồn CHÍNH THỨC <https://www.cloudflare.com/ips-v6/>, lấy 26/09/2026.
    ///
    /// VÌ SAO PHẢI LOẠI TRỪ KHỎI TUNNEL: relay của sản phẩm nằm sau Cloudflare
    /// (`relayURLCandidates` = `api.meetflowai.site`), và host đó **CÓ bản ghi AAAA** ⇒ iOS ưu
    /// tiên IPv6. Nếu `ipv6Settings.includedRoutes = [::/0]` mà KHÔNG chừa dải này thì kết nối WS
    /// của extension tới relay bị hút vào tunnel — mà tunnel/core KHÔNG có IPv6 ⇒ ĐEN ⇒ đúng sự
    /// cố "mất mạng khi connect" của bản `18f8c82` (22/09/2026, `DEV_PLAN_IOS_MACOS_TOC_DO.md`
    /// §5b bước 1c).
    ///
    /// Dùng DẢI của Cloudflare (cố định, công khai) chứ KHÔNG dùng IP lẻ: IP Cloudflare đổi theo
    /// phiên, còn dải thì không. Đây là "endpointExcludedRoutes" mà ghi chú cũ trong provider
    /// nhắc tới, làm ở mức dải cho bền.
    static let relayIPv6ExcludedCIDRs = [
        "2400:cb00::/32",
        "2606:4700::/32",
        "2803:f800::/32",
        "2405:b500::/32",
        "2405:8100::/32",
        "2a06:98c0::/29",
        "2c0f:f248::/32"
    ]

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
