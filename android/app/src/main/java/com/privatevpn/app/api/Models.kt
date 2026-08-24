package com.privatevpn.app.api

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
)

@Serializable
data class NodesResponse(val nodes: List<ExitNode>)

/** Built-in fallback exit nodes when the coordinator is unreachable (mirrors iOS). */
object ExitNodeFallback {
    val builtIn: List<ExitNode> = listOf(
        ExitNode(
            id = "node-1", name = "vietnam-1", country = "VN", city = "Hanoi",
            endpoint = "103.173.155.50:443",
            publicKey = "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=",
        ),
        ExitNode(
            id = "vietnam-2", name = "Vietnam 2", country = "VN", city = "Hanoi",
            endpoint = "103.6.234.233:443",
            publicKey = "OJPfJLblLP2KCQkPdqI1B7WHJT/U4BlzSxUTwh6vZ2c=",
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
)

@Serializable
data class ErrorBody(val error: String? = null, val message: String? = null)

@Serializable
internal data class TokenResponse(val token: String)
