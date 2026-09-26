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
    /** Nguồn đo CHÍNH: CDN của shop — đo trên máy thật 22/09 cho thấy tải được từ data TQ. */
    const val PREMEASURE_URL_PRIMARY = "https://meetflowai.site/v1/downloads/android"
    const val PREMEASURE_URL = "https://speed.cloudflare.com/__down?bytes=1500000"

    /**
     * Trần dữ liệu và ngân sách thời gian của phép đo trước khi khai.
     *
     * Nâng 23/09/2026 (1,5 MB / 2.500 ms → 4 MB / 6.000 ms): trên **5G Unicom** app đo ra
     * **559 kbps** rồi kẹt số khai ở sàn 1.000 kbps, trong khi CÙNG domain đó tải 20 MB cho
     * **19 Mbps**. Lý do: RTT ở mạng di động TQ 300–700 ms nên 2,5 s chỉ đủ cho bắt tay TLS +
     * slow start ⇒ đo được toàn "chi phí mở kết nối" chứ không phải tốc độ. Nay phép đo tính
     * tốc độ **từ byte ĐẦU TIÊN** (xem `NetworkPreMeasure`) và có đủ thời gian để slow start bung.
     * Đo 1 lần cho mỗi mạng (cache theo profile) nên chi phí data vẫn nhỏ.
     */
    const val PREMEASURE_MAX_BYTES = 4_000_000

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
    // SECURITY NOTE: hysteria auth/obfs values below ship inside the APK/AAB, so
    // they are effectively public. Treat them as non-secret identifiers; if real
    // secrecy is needed, switch the server to per-user auth (hysteria `userpass`)
    // and rotate these values (see docs/EXIT_NODE_RUNBOOK.md).
    const val HY_PASSWORD = "flowvpn_hysteria_2026"
    const val HY_OBFS = "FlowVPN-8f3k"
}
