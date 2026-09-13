package com.privatevpn.app

/**
 * App-owned configuration. Backend URLs and product IDs are centralized here
 * (never shown in the public UI — NFR-PRIV / security rules).
 */
object Config {
    /** Production coordinator. */
    const val CONTROL_PLANE_URL = "https://api.meetflowai.site"

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
    val API_FALLBACK_ADDRESSES = listOf("103.6.234.233", "103.173.155.50")

    /**
     * Host API dự phòng — đi qua hạ tầng dùng chung (Cloudflare Tunnel / Tailscale
     * Funnel) thay vì IP của node.
     *
     * Vì sao cần: GFW chặn theo IP, nên khi cả IP node bị chặn thì app không gọi được
     * API và báo "cannot reach service" dù node vẫn chạy. Client nói chuyện với IP của
     * hạ tầng dùng chung thì muốn chặn phải chặn cả một dải mà hàng triệu dịch vụ khác
     * đang dùng — đây đúng cách Tailscale không bao giờ "chết vì chặn IP".
     *
     * Khi host chính lỗi transport, OkHttp tự thử lần lượt các host dưới đây
     * (xem fallbackInterceptor trong ControlAPIClient). Cập nhật danh sách này khi
     * đổi tunnel/domain.
     */
    /**
     * Relay WebSocket cho đường dữ liệu (Hysteria đi trong WSS qua Cloudflare Tunnel).
     * Dùng khi IP của mọi node đều bị chặn: client không còn nói chuyện trực tiếp với IP node.
     */
    const val WS_RELAY_URL = "wss://fcnvpn.tail303be3.ts.net:8443"

    /** Cổng Hysteria mà relay đầu kia đang trỏ tới. */
    const val WS_RELAY_PORT = 8443

    val API_FALLBACK_BASES = listOf(
        // Tailscale Funnel — URL cố định, đi qua relay toàn cầu của Tailscale nên
        // vào được cả những mạng đã chặn IP của mọi node (đã đo: 200 OK từ mạng TQ
        // đang chặn cả 103.173.155.50 lẫn 103.6.234.233).
        "https://fcnvpn.tail303be3.ts.net",
    )

    /** Web purchase page (plan picker + QR payment). Mirrors iOS/macOS. */
    const val BUY_URL = "https://meetflowai.site/buy"

    /** Google Play Billing product IDs (must match Play Console + backend). */
    val PRODUCT_IDS = listOf("Monthly_Premium", "Yearly_Premium")

    /** Public support / privacy pages (also linked from the paywall). */
    const val SUPPORT_URL = "https://meetflowai.site/SupportPrivateVPN.html"
    const val PRIVACY_URL = "https://meetflowai.site/FlowVPNPrivacy.html"
    const val EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
    const val MANAGE_SUBSCRIPTION_URL = "https://play.google.com/store/account/subscriptions"

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
    const val HY_SERVER = "103.173.155.50" // node1 (ok qua TQ); node2 = 103.6.234.233 (chờ đổi IP)
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
    // SECURITY NOTE: hysteria auth/obfs values below ship inside the APK/AAB, so
    // they are effectively public. Treat them as non-secret identifiers; if real
    // secrecy is needed, switch the server to per-user auth (hysteria `userpass`)
    // and rotate these values (see docs/EXIT_NODE_RUNBOOK.md).
    const val HY_PASSWORD = "flowvpn_hysteria_2026"
    const val HY_OBFS = "FlowVPN-8f3k"
}
