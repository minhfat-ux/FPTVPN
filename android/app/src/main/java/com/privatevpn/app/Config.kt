package com.privatevpn.app

/**
 * App-owned configuration. Backend URLs are centralized here
 * (never shown in the public UI — NFR-PRIV / security rules).
 */
object Config {
    /** Production coordinator. */
    const val CONTROL_PLANE_URL = "https://api.meetflowai.site"

    /**
     * Host API dự phòng theo TÊN (không ghim IP), thử sau host chính khi lỗi MẠNG/timeout.
     *
     * Vì sao cần: GFW chặn `api.meetflowai.site` theo SNI — TLS ClientHello bị nuốt nên
     * handshake fail dù IP đằng sau vẫn là Cloudflare. Ghim IP ([PINNED_HOST_ADDRESSES])
     * KHÔNG cứu được kiểu chặn theo tên này vì tên miền vẫn lộ trong SNI; vì vậy phải có
     * đường dự phòng đổi hẳn hostname. `t1.meetflowai.site` đã kiểm chứng vào được từ TQ và
     * phục vụ đầy đủ API + web (trang mua, trang tải, các route /v1/downloads).
     *
     * Chỉ chuyển khi lỗi mạng/timeout, KHÔNG chuyển khi server trả HTTP 4xx (401/403 là lỗi
     * xác thực — đổi host vô ích, còn lặp side-effect của POST).
     */
    val CONTROL_PLANE_FALLBACK_HOSTS = listOf("https://t1.meetflowai.site")

    /** Web gốc (plan picker + QR payment) — host chính. */
    const val WEB_URL = "https://meetflowai.site"

    /**
     * Web base tương ứng từng host API, để trang mua dựng theo host đang dùng được.
     * Host không có trong map (ví dụ tunnel dùng chung) lùi về [WEB_URL].
     */
    val WEB_BASE_BY_API_BASE = mapOf(
        CONTROL_PLANE_URL to WEB_URL,
        "https://t1.meetflowai.site" to "https://t1.meetflowai.site",
    )

    /**
     * Addresses for the coordinator host, tried in this order before the system DNS
     * answer.
     *
     * Why this exists: the OS/ISP resolver cache is NOT cleared by reinstalling the app,
     * so when the API moved to another IP every user whose resolver still held the old
     * (already blocked) address got "cannot reach VPNFlow service" for up to an hour —
     * even right after a fresh install. OkHttp tries each address in turn and TLS still
     * validates the real hostname, so pinning addresses only adds a fallback path; it
     * cannot be used to redirect traffic.
     *
     * Keep node-2's address first: it is the entry point that is reachable from China.
     */
    val API_FALLBACK_ADDRESSES = listOf("165.101.114.162", "103.173.155.50")

    /**
     * Relay WebSocket cho đường dữ liệu (Hysteria đi trong WSS qua Cloudflare Tunnel).
     * Dùng khi IP của mọi node đều bị chặn: client không còn nói chuyện trực tiếp với IP node.
     */
    const val WS_RELAY_URL = "wss://fcnvpn.tail303be3.ts.net:8443"

    /** Cổng Hysteria mà relay đầu kia đang trỏ tới. */
    const val WS_RELAY_PORT = 8443

    /**
     * Host API dự phòng — đi qua hạ tầng dùng chung (Tailscale Funnel) thay vì IP của node.
     *
     * Vì sao cần: GFW chặn theo IP, nên khi cả IP node bị chặn thì app không gọi được
     * API và báo "cannot reach service" dù node vẫn chạy. Client nói chuyện với IP của
     * hạ tầng dùng chung thì muốn chặn phải chặn cả một dải mà hàng triệu dịch vụ khác
     * đang dùng — đây đúng cách Tailscale không bao giờ "chết vì chặn IP".
     *
     * Khi host chính lỗi transport (hoặc trả 502/503/504 — node vẫn sống nhưng control
     * plane sau nó chết), OkHttp thử lại lần lượt các host dưới đây
     * (xem fallbackInterceptor trong ControlAPIClient). Cập nhật danh sách này khi
     * đổi tunnel/domain.
     */
    val API_FALLBACK_BASES = listOf(
        // Tailscale Funnel — URL cố định, đi qua relay toàn cầu của Tailscale nên
        // vào được cả những mạng đã chặn IP của mọi node (đã đo: 200 OK từ mạng TQ
        // đang chặn cả 103.173.155.50 lẫn 103.6.234.233).
        "https://fcnvpn.tail303be3.ts.net",
    )

    /**
     * IP ghim cho những host app BẮT BUỘC phải vào được (xem `PinnedDns`).
     *
     * Vì sao cần thêm lớp này: khi tunnel đang UP mà transport đã chết, DNS của máy bị
     * trỏ vào trong tunnel (`dns=1.1.1.1`) nên mọi truy vấn treo/thất bại — đúng lúc app
     * cần resolve host dự phòng nhất. Diagnostics 14/09 ghi đúng lỗi đó:
     * `ws-relay: failed: Unable to resolve host "fcnvpn.tail303be3.ts.net"`.
     * Ghim IP thì đường thoát không còn phụ thuộc DNS; TLS vẫn xác thực đúng hostname nên
     * ghim IP chỉ thêm đường vào, không thể bị dùng để chuyển hướng traffic. Cập nhật
     * danh sách khi IP của hạ tầng đổi.
     */
    /**
     * BƯỚC ĐO MẠNG THỰC TẾ **TRƯỚC** RỒI MỚI KHAI (yêu cầu chủ dự án 22/09/2026 — iOS đã cập nhật).
     *
     * Số khai băng thông cho Brutal CC phải sát băng thông THẬT; nấc tĩnh chỉ là đoán, và đo SAU
     * khi tunnel lên thì lần đầu trên mạng mới vẫn khai theo nấc đoán. Vì vậy trước khi mở client
     * Go, app tải một mẩu nhỏ qua socket đã `protect()` (đi thẳng ra mạng nền) để LẤY SỐ.
     * Xem `vpn/NetworkPreMeasure.kt`.
     */
    /** Nguồn đo: CDN của shop (đo được từ data TQ) + Cloudflare; LẤY SỐ CAO NHẤT. */
    const val PREMEASURE_URL_PRIMARY = "https://meetflowai.site/v1/downloads/android"
    const val PREMEASURE_URL = "https://speed.cloudflare.com/__down?bytes=20000000"

    /**
     * Trần dữ liệu và ngân sách thời gian của phép đo trước khi khai.
     *
     * Nâng 23/09/2026 (1,5 MB / 2.500 ms → 4 MB / 6.000 ms): trên **5G Unicom** app đo ra
     * **559 kbps** rồi kẹt số khai ở sàn 1.000 kbps, trong khi CÙNG domain đó tải 20 MB cho
     * **19 Mbps**. Lý do: RTT ở mạng di động TQ 300–700 ms nên 2,5 s chỉ đủ cho bắt tay TLS +
     * slow start ⇒ đo được toàn "chi phí mở kết nối" chứ không phải tốc độ. Nay phép đo tính
     * tốc độ **từ byte ĐẦU TIÊN** (xem `NetworkPreMeasure`) và có đủ thời gian để slow start bung.
     * Đo 1 lần cho mỗi mạng (cache theo profile) nên chi phí data vẫn nhỏ.
     * Nâng tiếp 20/10/2026 (4 MB → **20 MB**): đo trên TV `MiTV-AFZP0` (mạng tòa nhà ~40 Mbps)
     * cho thấy mẫu 4 MB của CDN shop chỉ ra **7.986 kbps** — vì chính CDN đó chậm, không phải
     * đường chậm — nên số khai bị kẹt 4-5 Mbps. Mẫu 20 MB mới đủ để số khai bám đúng đường.
     */
    const val PREMEASURE_MAX_BYTES = 20_000_000

    /** Dưới ngần này byte thì coi như phép đo hỏng, không dùng (tránh lấy số từ trang lỗi). */
    const val PREMEASURE_MIN_BYTES = 200_000
    const val PREMEASURE_BUDGET_MS = 6_000
    const val PREMEASURE_CONNECT_TIMEOUT_MS = 2_000
    val PINNED_HOST_ADDRESSES: Map<String, List<String>> = mapOf(
        // KHONG ghim IP cho api.meetflowai.site nua (18/09/2026): API_FALLBACK_ADDRESSES dang la
        // IP cua 2 node, ma tren data di dong Trung Quoc IP node bi chan ⇒ moi lan ket noi phai
        // cho het timeout (~8s) roi moi roi ve DNS he thong (Cloudflare) — do la ly do
        // "connecting rat lau" tren 4G/5G. De DNS he thong tra ve IP Cloudflare.
        "fcnvpn.tail303be3.ts.net" to listOf("103.84.155.217", "103.84.155.153"),
    )

    // Trang mua web (plan picker + QR payment), mirrors iOS/macOS: URL KHÔNG cố định mà dựng
    // theo host đang dùng được — xem ControlPlaneHosts.buyUrl() (host chính, hoặc
    // `t1.meetflowai.site` khi host chính bị chặn theo tên).

    /** Public support / privacy pages (also linked from the paywall). */
    const val SUPPORT_URL = "https://meetflowai.site/SupportPrivateVPN.html"
    const val PRIVACY_URL = "https://meetflowai.site/FlowVPNPrivacy.html"
    /** Điều khoản RIÊNG của VPNFlow — `meetflowai.site/terms` là điều khoản của MeetFlow AI. */
    const val TERMS_URL = "https://meetflowai.site/vpnflow/terms"

    /** WireGuard tunnel defaults (match iOS/macOS + backend). */
    const val WG_DNS = "1.1.1.1"
    const val WG_ALLOWED_IPS = "0.0.0.0/0"
    const val WG_PERSISTENT_KEEPALIVE = 25
    const val WG_TUNNEL_NAME = "vpnflow"
    const val WG_CLIENT_ENDPOINT = "0.0.0.0:51820"

    /** TCP relay (China transport): rides WG over TCP instead of raw UDP.
     *  Relay daemon next to the exit node unwraps and forwards to its WG UDP 443. */
    const val USE_RELAY = true
    const val RELAY_HOST = "103.173.155.50"
    const val RELAY_PORT = 9444

    /** Hysteria2 China-mode transport (fast, QUIC+obfs). Ports are tried in
     *  order — 8443 is the classic hysteria port (often UDP-blocked by ISPs),
     *  the others are the fallback listeners running on the same servers. */
    const val HYSTERIA_MODE = true
    const val HY_SERVER = "103.173.155.50" // node1 (ok qua TQ); node2 = 165.101.114.162 (VNPT, đổi IP 14/09)
    // TCP relay trước UDP: mạng nào block UDP (GFW, corporate NAT) vẫn qua TCP.
    // Relay node1: TCP <-> UDP 127.0.0.1:8443 (wgrelay.js); app probe từng cổng.
    const val HY_TCP_RELAY_HOST = "103.173.155.50"
    // Chi 8443: cac cong con lai da go khoi server (18/09/2026) — thu them chi lam
    // moi vong "connecting" dai them ~5s ma khong co co hoi thanh cong nao.
    val HY_TCP_RELAY_PORTS = intArrayOf(8443)
    val HY_PORTS = intArrayOf(8443)
    /** Brutal congestion control (hysteria2): the client declares its real
     *  up/down bandwidth and the server paces to it, ignoring packet loss —
     *  this is what keeps speed usable on China mobile data. 0 = standard CC. */
    // So khai bang thong = toc do Brutal CC se gui dung theo. Do tren may that (18/09/2026,
    // server+client cung 1 may de loai bo moi yeu to mang):
    //   khai 100/100 Mbps -> 10 MB/s   ✓
    //   khong khai (0/0 = BBR) -> 0-0,5 MB/s  ✗ (ban hysteria nay BBR hong)
    // ⇒ PHAI khai, va khai SAT bang thong that: khai cao hon duong truyen ⇒ nghen (do 5G: 13 Mbps
    // that ma khai 100 => tut con 0,6 MB/s). Vi vay chia theo loai mang, xem applyUnderlyingNetwork().
    const val HY_UP_KBPS = 30000
    const val HY_DOWN_KBPS = 100000
    /** Mang di dong (4G/5G) o Trung Quoc: thuc te 10-13 Mbps ⇒ khai sat de Brutal khong nghen. */
    const val MOBILE_UP_KBPS = 8000
    const val MOBILE_DOWN_KBPS = 12000

    /**
     * URL đo goodput qua tunnel cho cơ chế khai băng thông ĐỘNG (xem BandwidthMemory).
     *
     * Cùng endpoint mà phép đo ngoài thiết bị đang dùng (curl `speed.cloudflare.com/__down`):
     * Cloudflare anycast nên vào được ngay cả khi IP node bị chặn, và nó trả ĐÚNG số byte
     * yêu cầu nên phép đo ngắn (<=3s) là đủ để suy ra băng thông. App còn tự cắt theo
     * BandwidthMemory.PROBE_BYTES nên `bytes` ở đây chỉ là mức trần phía server.
     */
    const val BW_PROBE_URL = "https://speed.cloudflare.com/__down?bytes=4000000"

    /**
     * Resolver cấp cho `tun0` — PHẢI có ≥2 để chịu được mất gói.
     *
     * Vì sao (đo trên máy thật 22/09/2026, xem `docs/TUNNEL_MTU_DNS_BUGREPORT.md` §4.2): chỉ cấp
     * `1.1.1.1` thì mọi truy vấn DNS đi qua đúng một đường UDP đang rớt gói; DNS fail ngẫu nhiên
     * theo host ⇒ app bên thứ ba (Firebase Auth của MeetFlow AI) mất token và chết hẳn. Hệ điều
     * hành tự chuyển sang resolver kế tiếp khi resolver đầu không trả lời, nên chỉ cần khai thêm.
     * 8.8.8.8 là của Google (khác nhà cung cấp với Cloudflare) ⇒ hai đường hỏng độc lập.
     */
    val HY_DNS_SERVERS = listOf("1.1.1.1", "8.8.8.8")

    /**
     * Mục tiêu đo RTT/mất gói CỦA ĐƯỜNG TUNNEL (vòng ramp hỏi mỗi 5s, xem
     * `HysteriaVpnService.tunnelRttMs`): TCP connect rồi đọc 1 byte.
     *
     * Vì sao cần mục tiêu DỰ PHÒNG: đo trên máy thật 21–22/09/2026 (Z Fold5, Wi-Fi công ty) cho thấy
     * `1.1.1.1:80` **fail 58/437 lần (13%)** trong khi traffic thật vẫn chảy 12–35 Mbps. Với
     * `BandwidthPolicy.RAMP_LOSS_PCT = 2` và cửa sổ 10 lần, **một** lần fail đã là 10% ⇒ hạ số khai
     * ngay (log ghi `loss=10% rtt=0ms`) ⇒ 50 lần `loss-backoff` trong 11,7 giờ, phần lớn là BÁO OAN.
     * Nên khi mục tiêu chính fail thì thử tiếp hạ tầng của CHÍNH MÌNH (Cloudflare) — đây mới là thứ
     * tunnel đang phụ thuộc; chỉ khi CẢ HAI fail mới coi là một lần mất gói.
     */
    const val RTT_PROBE_HOST = "1.1.1.1"
    const val RTT_PROBE_PORT = 80
    const val RTT_PROBE_FALLBACK_HOST = "api.meetflowai.site"
    const val RTT_PROBE_FALLBACK_PORT = 443

    /**
     * Brutal CC cho đường WS relay (khi IP node bị chặn). Đường này đi qua 2 chặng —
     * hạ tầng dùng chung (Tailscale Funnel/Cloudflare) rồi mới tới node — nên khai
     * bằng đường trực tiếp (20Mbps) là tự bóp nghẽn: server pace đúng theo số client
     * khai, gói bị dồn ở chặng giữa và độ trễ tăng vọt. Số dưới đây là mức khởi điểm
     * bảo thủ, chỉnh lại theo số đo thật trên thiết bị.
     */
    // Do thuc te tren Mac (18/09): duong Cloudflare dat 13,7 MB/s => khai 0,8/4 Mbps
    // la tu bop nghẽn. Server cung da bat ignoreClientBandwidth.
    const val HY_RELAY_UP_KBPS = 30000
    const val HY_RELAY_DOWN_KBPS = 100000

    /**
     * N tunnel (hút băng thông) — port từ iOS commit `167ba9d`, 20/10/2026.
     *
     * Mạng dùng chung (tòa nhà) giới hạn tốc độ theo TỪNG KẾT NỐI: đo thật 19/10/2026 (lặp 3 lần)
     * 1 luồng **4–12 Mbps**, 4 luồng 17–29, **8 luồng 72–81 Mbps** — xem
     * `docs/RESEARCH_SHARED_NETWORK_BANDWIDTH_2026-10-19.md`. App chỉ mở MỘT tunnel nên trần thực
     * tế ~12 Mbps, khai số cao hơn cũng không vượt được.
     *
     * N>1 ⇒ mở N cầu WS song song tới CÙNG một relay của node (bất biến F3: cùng exit node, khác
     * node là IP khách đổi giữa phiên ⇒ hỏng đăng nhập/thanh toán). Core Go bọc N client thành
     * `multiClient` và chia **LUỒNG** theo vòng tròn, nên gói của một luồng vẫn đi đúng một
     * tunnel — không đảo thứ tự gói (chia theo gói sẽ làm TCP bên trong sụp).
     *
     * `1` = TẮT (mặc định — hành vi y hệt bản đang phát). Trần 8 đúng bằng mốc đã đo.
     */
    const val MULTI_TUNNEL_MAX = 8
    /** Các mức chọn trong Settings (khớp iOS: 2/4/6/8). */
    val MULTI_TUNNEL_CHOICES = intArrayOf(2, 4, 6, 8)
    /** Số tunnel đặt sẵn khi người dùng BẬT công tắc (iOS cũng dùng 4). */
    const val MULTI_TUNNEL_DEFAULT_ON = 4
    /** Khoá SharedPreferences (bảng `vpnflow_hysteria`) — KHOÁ RIÊNG, không dùng chung với iOS. */
    const val KEY_MULTI_TUNNEL = "multi_tunnel_count"

    // ───────────── tuyến ra của TV (proxy hệ thống) ─────────────
    //
    // TV `MiTV-AFZP0` không có TUN nên cách duy nhất ép traffic đi qua VPN là proxy hệ thống.
    // Có HAI đường: (1) proxy nội bộ của app `127.0.0.1:1081` ("đường của TV"), (2) gateway LAN
    // (một máy khác trong nhà chạy proxy chia tải node1/node2 — dự phòng khi đường TV chết).
    // Chủ dự án 22/10/2026: muốn trong Settings chọn được "tự động nhảy 2 chiều" hoặc chốt 1 trong 2.
    /** Khoá prefs: `auto` (mặc định) | `tv` | `gateway`. */
    const val KEY_PROXY_MODE = "proxy_mode"
    /** Khoá prefs: địa chỉ gateway LAN dạng `host:port`. */
    const val KEY_PROXY_GATEWAY = "proxy_gateway"
    /** Tự động: ưu tiên đường TV, 1081 chết thì nhảy sang gateway LAN, cả hai chết thì gỡ proxy. */
    const val PROXY_MODE_AUTO = "auto"
    /** Chỉ đường TV; 1081 chết thì gỡ proxy (không nhảy) — để lỗi lộ ra thay vì đi nhầm đường. */
    const val PROXY_MODE_TV = "tv"
    /** Chỉ gateway LAN; KHÔNG BAO GIỜ đặt `127.0.0.1:1081`. */
    const val PROXY_MODE_GATEWAY = "gateway"
    /**
     * Các gateway LAN dự phòng, **thử lần lượt theo thứ tự** (ngăn cách bằng dấu phẩy).
     * Thứ nhất: laptop Windows chạy `tools/lan-proxy` (chia tải node1+node2).
     * Thứ hai: Mac chạy gateway riêng — chỉ dùng khi máy Windows tắt (yêu cầu chủ dự án 22/10/2026).
     */
    const val PROXY_GATEWAY_DEFAULT = "192.168.100.11:18081,192.168.100.5:18081"

        /**
     * Cho TV/máy khác trong LAN dùng ĐIỆN THOẠI làm gateway (yêu cầu chủ dự án 24/10/2026):
     * mở HTTP proxy `0.0.0.0:18081` + trả lời discovery UDP 18099 (cùng giao thức với
     * `tools/lan-proxy` trên desktop). Mặc định TẮT — bật trong Settings.
     */
    const val KEY_LAN_GATEWAY = "lan_gateway_enabled"

/**
     * Cờ "đo lại băng thông ở phiên kế tiếp" — nút Refresh trên UI cắm cờ này rồi khởi động lại
     * tunnel (yêu cầu chủ dự án 22/10/2026). Service xoá mốc đã nhớ của mạng hiện tại khi dựng phiên.
     */
    const val KEY_REMEASURE_ON_START = "remeasure_on_next_start"

    // SECURITY NOTE: hysteria auth/obfs values below ship inside the APK/AAB, so
    // they are effectively public. Treat them as non-secret identifiers; if real
    // secrecy is needed, switch the server to per-user auth (hysteria `userpass`)
    // and rotate these values (see docs/EXIT_NODE_RUNBOOK.md).
    const val HY_PASSWORD = "flowvpn_hysteria_2026"
    const val HY_OBFS = "FlowVPN-8f3k"
}
