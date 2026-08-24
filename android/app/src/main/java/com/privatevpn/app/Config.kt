package com.privatevpn.app

/**
 * App-owned configuration. Backend URLs and product IDs are centralized here
 * (never shown in the public UI — NFR-PRIV / security rules).
 */
object Config {
    /** Production coordinator. */
    const val CONTROL_PLANE_URL = "https://api.meetflowai.site"

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
}
