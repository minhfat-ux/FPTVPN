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

    /// Trần thời gian chờ MỘT cửa relay mở được WebSocket (giây).
    ///
    /// Ở đây (không nằm trong extension) để **app và extension dùng CHUNG một nguồn sự thật**, và để
    /// harness `ios-pure-logic-tests` kiểm được bất biến "ngân sách phiên đủ cho mọi cửa" (xem
    /// `startTimeout`). Đo trên mạng khách (China Mobile): một lượt mở WS mất tới **4,2 s** chỉ riêng
    /// TCP connect; log máy thật iPhone 5G từng có `WS không mở được trong 6s` ⇒ 6 s quá sát.
    static let relayOpenGrace: TimeInterval = 10

    /// Số cửa vào TỐI ĐA cho MỘT node: cửa chính (`relayURL`) + các cửa thay hostname (xem
    /// `sameNodeRelayAlternates`). Dùng để tính `startTimeout` ⇒ **không bao giờ lệch lại**.
    static let maxRelayDoorsPerNode = 2

    /// Số cửa TỐI ĐA lấy từ **node KHÁC** trong danh sách ứng viên đổi đường (xem
    /// `failoverRelayCandidates`). Vì sao có trần: danh sách ứng viên càng dài thì ngân sách start
    /// càng lớn (mỗi cửa tối đa `relayOpenGrace` = 10 s), mà danh sách node của control plane hiện
    /// chỉ có 2 node ⇒ 2 cửa là đủ và giữ lần start đầu không bị kéo dài vô ích.
    static let maxRelayFailoverNodes = 2

    /// Trần số CỬA relay của CẢ danh sách ứng viên (cửa chính + dự phòng cùng node + node khác).
    static var maxRelayDoorsTotal: Int { maxRelayDoorsPerNode + maxRelayFailoverNodes }

    /// Trần thời gian cho TOÀN BỘ lần start (áp settings + dựng relay + bắt tay QUIC).
    ///
    /// **TÍNH TỪ hằng số, KHÔNG viết số cứng.** Vì sao: bản 26/09 viết cứng 35 s nhưng lại có 4 cửa ×
    /// 10 s = **40 s** ⇒ provider cắt ngang trước khi thử hết cửa (đúng finding F4 của bản review
    /// `HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md`). Công thức dưới đây khiến việc thêm/bớt cửa
    /// **tự** cập nhật ngân sách — kể cả khi thêm cửa của **node khác** (26/09/2026, xem
    /// `failoverRelayCandidates`).
    ///
    /// Tên `sessionStartBudget` (KHÔNG phải `startTimeout`) để không lẫn với `startTimeout = 20` bên
    /// dưới — hằng đó có nghĩa KHÁC: "bao lâu thì coi như hysteria không lên và rơi về WireGuard".
    static let sessionStartBudget: TimeInterval =
        relayOpenGrace * Double(maxRelayDoorsTotal) + 5

    /// Các cửa relay DỰ PHÒNG cho **ĐÚNG node đang chọn** — suy ra từ chính `relayURL` của node.
    ///
    /// **BẤT BIẾN chống "sai đích im lặng" (finding F3):** giữ nguyên **PATH**, chỉ đổi **HOSTNAME**.
    /// Path chứa mã node (`/relay/vn1hy`, `/relay/vn2hy`) nên đổi host **không bao giờ** nhảy sang node
    /// khác. TUYỆT ĐỐI **không** mượn một danh sách relay toàn cục nhiều node: một relay chỉ hạ cánh ở
    /// đúng một node, ghép `serverHost` của node A với relay của node B là QUIC đi sai chỗ mà **không
    /// báo lỗi** — đúng loại lỗi khó chẩn đoán nhất.
    ///
    /// Trả `[]` khi node không khai relay ⇒ extension đi **UDP trực tiếp** (có nhánh xử lý riêng),
    /// KHÔNG mượn relay của node khác.
    static func sameNodeRelayAlternates(for relayURL: String) -> [String] {
        guard !relayURL.isEmpty else { return [] }
        let pairs = [
            ("wss://api.meetflowai.site/", "wss://t1.meetflowai.site/"),
            ("wss://t1.meetflowai.site/", "wss://api.meetflowai.site/"),
        ]
        for (from, to) in pairs where relayURL.hasPrefix(from) {
            let swapped = to + relayURL.dropFirst(from.count)
            guard swapped != relayURL else { return [] }
            return [swapped]
        }
        // Host lạ (chưa từng gặp): KHÔNG đoán — thà một cửa còn hơn một cửa sai node.
        return []
    }

    /// Một CỬA relay kèm **DANH TÍNH NODE** của nó.
    ///
    /// Vì sao phải đi CẶP (khác `relayURLCandidates: [URL]` cũ chỉ có URL): một relay chỉ hạ cánh ở
    /// ĐÚNG node ghi trong path (`/relay/vn2hy`). Đổi sang relay của node khác mà vẫn giữ
    /// `serverHost` của node cũ là ghép lệch node — đúng thứ finding F3 cấm (QUIC sai đích mà KHÔNG
    /// báo lỗi). Đi cặp thì cửa nào cũng mang host của chính node đó, không thể ghép lệch.
    struct RelayCandidate: Sendable, Equatable {
        /// `wss://api.meetflowai.site/relay/vn1hy` — **path** mang mã node.
        var relayURL: String
        /// Host hysteria của CHÍNH node đó (`103.173.155.50`), KHÔNG phải host relay.
        var serverHost: String
    }

    /// Danh sách ỨNG VIÊN ĐỔI ĐƯỜNG (theo THỨ TỰ THỬ) cho node đang chọn — KHÔNG gồm cửa chính.
    ///
    /// VÌ SAO PHẢI CÓ (ca thật 26/09/2026, macOS system extension 1.4.7/25, tunnel đi relay `vn2hy`
    /// của node `vietnam-2`): relay `relay-cf-vn2hy` bị chặn phía server. Trong ~4 phút log extension
    /// có **24 lần `relay/vn2hy` và 0 lần `relay/vn1hy`**, `framesFromRelay` = 0, rồi tunnel
    /// `Disconnected` và NẰM ĐÓ — client không hề thử relay/node khác dù node-1 còn sống. Đường
    /// failover cũ (`RelayFailoverWatch`) chỉ mở cửa sổ đánh giá SAU KHI dựng lại THÀNH CÔNG, nên ca
    /// "KHÔNG kết nối được" không bao giờ có cửa sổ nào ⇒ không bao giờ đổi đường.
    ///
    /// Thứ tự có chủ đích — **node KHÁC trước, hostname khác của CÙNG node sau**:
    ///   1. relay của các node khác trong danh sách app ĐÃ TẢI (`GET /v1/nodes` → `hy_relay_url`):
    ///      đây mới là đường sống khi relay của node đang chọn chết. Hai hostname `api.`/`t1.` chỉ là
    ///      hai cửa vào CÙNG một dịch vụ relay ⇒ dịch vụ chết thì cả hai đều chết (đúng ca 26/09:
    ///      thử hostname khác của cùng node là vô ích, phải sang node khác);
    ///   2. cửa cùng node đổi hostname (`api` ↔ `t1`): cứu ca HOST bị chặn/độc DNS mà node vẫn sống.
    ///
    /// Trả `[]` khi `currentRelay` rỗng (node không khai relay ⇒ extension đi **UDP trực tiếp**, có
    /// nhánh xử lý riêng; KHÔNG mượn relay của node khác vì ghép lệch node là QUIC im lặng).
    static func failoverRelayCandidates(
        currentRelay: String,
        currentHost: String,
        nodes: [(nodeID: String, relay: String, host: String)]
    ) -> [RelayCandidate] {
        guard !currentRelay.isEmpty else { return [] }
        var out: [RelayCandidate] = []
        var seen: Set<String> = [currentRelay]
        for node in nodes {
            let relay = node.relay.trimmingCharacters(in: .whitespaces)
            let host = node.host.trimmingCharacters(in: .whitespaces)
            guard !relay.isEmpty, !host.isEmpty, !seen.contains(relay) else { continue }
            seen.insert(relay)
            out.append(RelayCandidate(relayURL: relay, serverHost: host))
            if out.count >= maxRelayFailoverNodes { break }
        }
        for alternate in sameNodeRelayAlternates(for: currentRelay) where !seen.contains(alternate) {
            seen.insert(alternate)
            out.append(RelayCandidate(relayURL: alternate, serverHost: currentHost))
        }
        return out
    }

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

    /// CÔNG TẮC đường CHẶN IPv6 của P2 (26/09/2026) — `true` = BẬT chặn.
    ///
    /// Vì sao mặc định BẬT: node/exit hiện tại **chỉ có IPv4** (node-2 `165.101.114.162` chỉ có
    /// `fe80::/64`, KHÔNG có default IPv6 route ⇒ `ping6`/`curl -6` trả "Network is unreachable"
    /// sau 0,018 s). Chở IPv6 qua tunnel là bất khả thi, nên đúng đắn là **trả lỗi tức thì** để app
    /// lùi IPv4 ngay — mà vẫn kéo `::/0` vào tunnel nên IPv6 KHÔNG rò ra đường vật lý.
    ///
    /// ĐỔI SANG `false` khi node có IPv6 egress thật: gói IPv6 được chuyển tiếp bình thường vào Go
    /// (hết `ICMPv6 Destination Unreachable`). Có HAI cách tắt:
    ///  1. sửa hằng số này rồi build lại; hoặc
    ///  2. **cờ chẩn đoán lúc chạy, không cần build lại**: tạo file rỗng `<app group>/ipv6-allow`
    ///     (xem `RelayDiagnostics.isIPv6Allowed`). Thư mục app group trên macOS:
    ///     `~/Library/Group Containers/G6XW3RN6LJ.com.privatevpn.shared/`.
    static let blockIPv6 = true

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
