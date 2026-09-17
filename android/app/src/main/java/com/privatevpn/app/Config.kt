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
    val PINNED_HOST_ADDRESSES: Map<String, List<String>> = mapOf(
        "api.meetflowai.site" to API_FALLBACK_ADDRESSES,
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
    val HY_TCP_RELAY_PORTS = intArrayOf(8443, 9445)
    val HY_PORTS = intArrayOf(8443, 28443, 54443)
    /** Brutal congestion control (hysteria2): the client declares its real
     *  up/down bandwidth and the server paces to it, ignoring packet loss —
     *  this is what keeps speed usable on China mobile data. 0 = standard CC. */
    const val HY_UP_KBPS = 2000
    const val HY_DOWN_KBPS = 20000
    /**
     * Brutal CC cho đường WS relay (khi IP node bị chặn). Đường này đi qua 2 chặng —
     * hạ tầng dùng chung (Tailscale Funnel/Cloudflare) rồi mới tới node — nên khai
     * bằng đường trực tiếp (20Mbps) là tự bóp nghẽn: server pace đúng theo số client
     * khai, gói bị dồn ở chặng giữa và độ trễ tăng vọt. Số dưới đây là mức khởi điểm
     * bảo thủ, chỉnh lại theo số đo thật trên thiết bị.
     */
    // Trần băng thông khai với Hysteria (client dùng để tính congestion control).
    // Đo thật 18/09: 800/4000 kbps quá thấp — đo qua tunnel chỉ đạt ~2,6 Mbps dù mạng khách
    // ~93 Mbps, tức chính con số này bóp tốc độ. Nâng lên mức thực tế của node; chỉnh tiếp
    // nếu uplink node thấp hơn (đặt cao hơn thực tế thì Hysteria tự giảm theo mất gói).
    const val HY_RELAY_UP_KBPS = 20000
    const val HY_RELAY_DOWN_KBPS = 100000
    // SECURITY NOTE: hysteria auth/obfs values below ship inside the APK/AAB, so
    // they are effectively public. Treat them as non-secret identifiers; if real
    // secrecy is needed, switch the server to per-user auth (hysteria `userpass`)
    // and rotate these values (see docs/EXIT_NODE_RUNBOOK.md).
    const val HY_PASSWORD = "flowvpn_hysteria_2026"
    const val HY_OBFS = "FlowVPN-8f3k"
}
