package com.privatevpn.app

/**
 * App-owned configuration. Backend URLs and product IDs are centralized here
 * (never shown in the public UI — NFR-PRIV / security rules).
 */
object Config {
    /** Production coordinator. */
    const val CONTROL_PLANE_URL = "https://api.meetflowai.site"

    /** Web purchase page (plan picker + QR payment). Mirrors iOS/macOS. */
    const val BUY_URL = "https://meetflowai.site/buy"

    /** Selling mode — WEB branch: true (in-app paywall opens the web buy page).
     *  STORE branch (Google Play): false — no in-app purchase, no link out to a
     *  purchase page (Play Payments policy). Users sign in with an account that
     *  already has a subscription. */
    const val SELL_ON_WEB = false

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
    const val HY_PASSWORD = "flowvpn_hysteria_2026"
    const val HY_OBFS = "FlowVPN-8f3k"
}
