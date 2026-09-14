package com.privatevpn.app.api

import com.privatevpn.app.Config
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** An exit node advertised by the coordinator (Tailscale-style). */
@Serializable
data class ExitNode(
    val id: String,
    val name: String,
    val country: String,
    val city: String,
    val endpoint: String,
    @SerialName("public_key") val publicKey: String,
    /**
     * Relay WS dẫn tới CHÍNH node này, do control plane cấp theo từng node
     * (ví dụ Tailscale Funnel -> wsrelay -> UDP 443 của node đó).
     *
     * Vì sao phải theo TỪNG node: một relay chỉ hạ cánh ở MỘT node. Client được cấp
     * khoá của node A mà đi qua relay của node B thì gói handshake mã hoá tới khoá A
     * nhưng lại tới `wg0` của B — B không giải được, cũng không có peer này, nên
     * WireGuard im lặng tuyệt đối. Đó là lỗi "connected nhưng không có mạng" trên
     * iPad 13/09, và nhìn log chỉ thấy "gửi hoài không có gì về" nên rất dễ chẩn đoán
     * sai thành mất gói.
     *
     * null = node này không có relay (hoặc coordinator cũ chưa gửi field). Hai trường
     * hợp đó KHÁC nhau về ý nghĩa nhưng client xử lý giống nhau — dùng hằng số mặc
     * định và ghi log rõ là đang đoán, để lần sau không phải suy luận.
     */
    @SerialName("ws_relay_url") val wsRelayUrl: String? = null,

    /**
     * Relay cho transport HYSTERIA (UDP 8443) của đúng node này.
     *
     * Vì sao tách khỏi [wsRelayUrl]: field cũ bị hai client hiểu hai nghĩa — iOS đọc là relay
     * WireGuard (443), Android đọc là relay Hysteria (8443). Một relay chỉ forward tới MỘT cổng
     * UDP, nên đưa Hysteria vào relay của WireGuard là handshake im lặng (đúng loại lỗi đã làm
     * mất cả buổi trên iPad). Bản mới đọc field này; [wsRelayUrl] chỉ còn là đường lùi.
     */
    @SerialName("hy_relay_url") val hyRelayUrl: String? = null,
) {
    /** Relay cho nhánh Hysteria: ưu tiên field mới, lùi về field cũ. */
    fun hysteriaRelayUrl(): String? = hyRelayUrl ?: wsRelayUrl
}

@Serializable
data class NodesResponse(val nodes: List<ExitNode>)

/** Built-in fallback exit nodes when the coordinator is unreachable (mirrors iOS). */
object ExitNodeFallback {
    val builtIn: List<ExitNode> = listOf(
        ExitNode(
            id = "node-1", name = "vietnam-1", country = "VN", city = "Hanoi",
            endpoint = "103.173.155.50:443",
            publicKey = "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=",
            // Chỉ node-1 có relay trên hạ tầng dùng chung; node-2 thì không. Ghi đúng
            // ở đây để đường dự phòng (coordinator không tới được) cũng không đoán sai.
            hyRelayUrl = Config.WS_RELAY_URL,
        ),
        ExitNode(
            id = "vietnam-2", name = "Vietnam 2", country = "VN", city = "Hanoi",
            endpoint = "165.101.114.162:443",
            publicKey = "OJPfJLblLP2KCQkPdqI1B7WHJT/U4BlzSxUTwh6vZ2c=",
            // Relay Hysteria của node-2 (Funnel path /vn2hy), hostname nên không phụ thuộc IP.
            hyRelayUrl = "wss://fcnvpn.tail303be3.ts.net/vn2hy",
        )
    )
}

/** Response from POST /v1/peers/register. */
@Serializable
data class CoordinatorRegisterResponse(
    @SerialName("peer_id") val peerId: String,
    @SerialName("overlay_ip") val overlayIp: String,
    val network: String,
    @SerialName("peer_credential") val peerCredential: String,
    val peers: List<CoordinatorPeer> = emptyList(),
)

/** A peer known to the coordinator. */
@Serializable
data class CoordinatorPeer(
    @SerialName("peer_id") val peerId: String,
    val name: String,
    @SerialName("overlay_ip") val overlayIp: String,
    @SerialName("wireguard_public_key") val wireguardPublicKey: String,
    val endpoint: String,
    @SerialName("allowed_ips") val allowedIps: List<String> = emptyList(),
)

/** Authenticated app session issued by the coordinator after login. */
@Serializable
data class CoordinatorAuthSession(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    val user: CoordinatorUser,
)

@Serializable
data class CoordinatorUser(
    val id: String,
    val email: String? = null,
    @SerialName("apple_user_id") val appleUserId: String? = null,
    @SerialName("subscription_status") val subscriptionStatus: CoordinatorSubscriptionStatus? = null,
)

@Serializable
data class CoordinatorSubscriptionStatus(
    @SerialName("is_active") val isActive: Boolean,
    @SerialName("product_id") val productId: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    /** Bản dùng thử 1 ngày miễn phí (`product_id` bắt đầu bằng `trial.`). */
    @SerialName("is_trial") val isTrial: Boolean? = null,
    /** Số giờ còn lại của bản dùng thử; null khi không phải trial, 0 khi đã hết. */
    @SerialName("trial_hours_left") val trialHoursLeft: Int? = null,
)

/** A device owned by the signed-in user. */
@Serializable
data class CoordinatorDevice(
    @SerialName("device_id") val deviceId: String,
    val name: String? = null,
    val platform: String? = null,
    val status: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("assigned_ip") val assignedIp: String? = null,
    @SerialName("public_key") val publicKey: String? = null,
) {
    val isActive: Boolean get() = status == "active"
}

@Serializable
data class DevicesResponse(val count: Int, val devices: List<CoordinatorDevice>)

/** App version info from the coordinator (force-update gate). */
@Serializable
data class AppVersionInfo(
    val platform: String? = null,
    @SerialName("minimum_version") val minimumVersion: String,
    @SerialName("latest_version") val latestVersion: String,
    @SerialName("store_url") val storeUrl: String,
    /** Kênh Android (APK sideload): link tải APK — server cũng đặt `store_url` bằng link này. */
    @SerialName("apk_url") val apkUrl: String? = null,
    /** Bản minSdk 24 cho Android 7.0/7.1 + Fire OS: APK thường (minSdk 26) không cài được. */
    @SerialName("apk_url_legacy") val apkUrlLegacy: String? = null,
)

@Serializable
data class ErrorBody(val error: String? = null, val message: String? = null)

/** 403 device_limit_reached: the account already uses the maximum devices. */
@Serializable
data class DeviceLimitBody(
    val error: String? = null,
    val message: String? = null,
    val devices: List<CoordinatorDevice> = emptyList(),
)

@Serializable
internal data class TokenResponse(val token: String)
