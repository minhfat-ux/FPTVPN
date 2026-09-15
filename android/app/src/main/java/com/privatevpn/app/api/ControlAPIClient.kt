package com.privatevpn.app.api

import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** Talks to the PrivateVPN coordinator (mesh control plane). Mirrors the iOS
 *  ControlAPIClient: register this device, fetch exit nodes, email-code login,
 *  enrollment tokens, device management, app-version gate. */
class ControlAPIClient(
    private val baseUrl: String = Config.CONTROL_PLANE_URL,
    private val joinToken: String = "",
    /** Tham số hoá để test được đường dự phòng; production luôn dùng giá trị trong Config. */
    private val fallbackBases: List<String> = ControlPlaneHosts.fallbackApiBases,
) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Thử y nguyên request qua một host dự phòng (Tailscale Funnel — hạ tầng dùng chung,
     * không phải IP của node). Trả về response nếu tới được, null nếu lỗi transport.
     * Cert của host dự phòng hợp lệ nên không cần xử lý TLS đặc biệt.
     */
    /** Origin của một base dự phòng, dạng scheme://host:port (mặc định 443/80 theo scheme). */
    private fun originOf(base: String): String? = runCatching {
        val uri = java.net.URI(base)
        val port = if (uri.port > 0) uri.port else if (uri.scheme == "https") 443 else 80
        "${uri.scheme}://${uri.host}:$port"
    }.getOrNull()

    private fun tryFallbackBase(
        chain: okhttp3.Interceptor.Chain,
        request: Request,
        base: String,
        /** false khi đang thử lại host đã nhớ: không gia hạn ký ức, để còn dò lại host chính. */
        refreshPreference: Boolean = true,
    ): okhttp3.Response? {
        val target = runCatching { java.net.URI(base) }.getOrNull() ?: return null
        val altUrl = request.url.newBuilder()
            .scheme(target.scheme)
            .host(target.host)
            .port(if (target.port > 0) target.port else if (target.scheme == "https") 443 else 80)
            .build()
        return try {
            val response = chain.proceed(request.newBuilder().url(altUrl).build())
            DiagnosticsLog.log("api: dùng host dự phòng ${target.host} (HTTP ${response.code})")
            // Nhớ NGUYÊN base (có scheme + port), không chỉ host: base dự phòng có thể khác port mặc định.
            if (refreshPreference) PreferredHost.remember(base)
            response
        } catch (e: java.io.IOException) {
            DiagnosticsLog.warn("api: host dự phòng ${target.host} cũng lỗi: ${e.message}")
            PreferredHost.forget()
            null
        }
    }

    /**
     * Khi host chính không tới được (IP bị chặn) hoặc trả 5xx (node vẫn sống nhưng control
     * plane phía sau nó chết — đúng lỗi 502 của node-1 ngày 14/09), thử lại y nguyên request
     * qua các host dự phòng.
     *
     * Thứ tự: host dự phòng đã chạy được lần trước (nếu còn nhớ) → host chính → các host
     * dự phòng còn lại. Nhớ host tốt là bắt buộc ở mạng bị chặn IP: host chính bị nuốt gói
     * nên mỗi lần gọi API phải chờ hết connect timeout mới rơi được xuống dự phòng.
     */
    private val fallbackInterceptor = okhttp3.Interceptor { chain ->
        val request = chain.request()
        // Đang gọi chính host dự phòng rồi thì không thử lại (tránh vòng lặp vô hạn).
        // So ĐÚNG origin (scheme + host + cổng): cùng host nhưng khác cổng là hai upstream khác nhau.
        val requestOrigin = "${request.url.scheme}://${request.url.host}:${request.url.port}"
        val onFallbackHost = fallbackBases.any { originOf(it) == requestOrigin }
        if (!onFallbackHost) {
            val remembered = PreferredHost.get()
            if (remembered != null) {
                tryFallbackBase(chain, request, remembered, refreshPreference = false)
                    ?.let { return@Interceptor it }
            }
        }
        var lastError: java.io.IOException? = null
        var primaryStatus = 0
        try {
            val primary = chain.proceed(request)
            primaryStatus = primary.code
            if (primary.isSuccessful || primary.code !in RETRYABLE_HTTP || onFallbackHost) {
                return@Interceptor primary
            }
            // Phải đóng body trước khi gửi request khác trên cùng connection.
            primary.close()
        } catch (e: java.io.IOException) {
            lastError = e
        }
        DiagnosticsLog.warn(
            "api: ${request.url.host} lỗi (${lastError?.message ?: "HTTP $primaryStatus"}) -> thử host dự phòng"
        )
        for (base in fallbackBases) {
            tryFallbackBase(chain, request, base)?.let { return@Interceptor it }
        }
        throw lastError ?: java.io.IOException("all API hosts unreachable (HTTP $primaryStatus)")
    }

    private val client = OkHttpClient.Builder()
        // 5s: đủ cho TCP+TLS connect trên mạng di động, mà mạng bị chặn (nuốt gói / SNI)
        // thì đỡ phải chờ hết timeout mới rơi xuống host dự phòng. Nằm trong khoảng 4–6s.
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .addInterceptor(fallbackInterceptor)
        // Resolver có ghim IP (xem PinnedDns): câu trả lời cũ/đầu độc của DNS hệ thống —
        // hoặc DNS bị hút vào tunnel đang chết — không còn giữ app offline được nữa.
        .dns(PinnedDns)
        .build()

    /**
     * Tells the coordinator whether this device could actually reach a node.
     *
     * Best-effort and intentionally silent: it runs while the app is already having
     * network trouble, and the coordinator uses it to stop offering a node that only
     * looks healthy from the server side (a GFW-blocked IP still answers from Vietnam).
     */
    suspend fun reportNodeHealth(nodeId: String, reachable: Boolean, reason: String? = null) {
        if (nodeId.isBlank()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val payload = buildString {
                    append("{\"ok\":").append(reachable)
                    if (!reachable && !reason.isNullOrBlank()) {
                        append(",\"reason\":\"").append(reason.replace("\"", "'").take(100)).append("\"")
                    }
                    append("}")
                }
                val request = Request.Builder()
                    .url("$baseUrl/v1/nodes/$nodeId/report")
                    .post(payload.toRequestBody("application/json".toMediaType()))
                    .build()
                client.newCall(request).execute().close()
            }
        }
    }

    sealed class ClientError(message: String) : Exception(message) {
        class BadResponse : ClientError("The coordinator returned an invalid response.")
        class Server(val serverMessage: String) : ClientError(serverMessage)
        class Transport(val endpoint: String, cause: IOException) :
            ClientError("Could not reach the coordinator while requesting $endpoint: ${cause.message}")
        class MissingSession : ClientError("Please sign in before connecting.")

        /** The account already has the maximum number of active devices. */
        class DeviceLimit(val devices: List<CoordinatorDevice>) :
            ClientError("Device limit reached")
    }

    private suspend fun execute(request: Request, endpoint: String): String = withContext(Dispatchers.IO) {
        try {
            client.newCall(request).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    // Device limit: carry the existing devices so the UI can offer
                    // "log out an old device" and then retry.
                    if (body.contains("device_limit_reached")) {
                        val limit = runCatching { json.decodeFromString<DeviceLimitBody>(body) }.getOrNull()
                        throw ClientError.DeviceLimit(limit?.devices ?: emptyList())
                    }
                    val err = runCatching { json.decodeFromString<ErrorBody>(body) }.getOrNull()
                    val message = err?.message ?: err?.error
                    throw ClientError.Server(message ?: "HTTP ${resp.code}")
                }
                body
            }
        } catch (e: IOException) {
            throw ClientError.Transport(endpoint, e)
        }
    }

    private fun bearer(token: String?): String? =
        if (token.isNullOrEmpty()) null else "Bearer $token"

    /** Registers this device with the coordinator. */
    suspend fun register(
        name: String,
        platform: String,
        wireguardPublicKey: String,
        endpoint: String,
        accessToken: String? = null,
        exitNodeId: String? = null,
        enrollmentToken: String? = null,
    ): CoordinatorRegisterResponse {
        val body = buildMap {
            put("name", name)
            put("platform", platform)
            put("wireguard_public_key", wireguardPublicKey)
            put("endpoint", endpoint)
            // Auth flow: the one-time enrollment token (fetched per attempt) is
            // required — the constructor joinToken is only a legacy fallback.
            put("join_token", enrollmentToken ?: joinToken)
            exitNodeId?.let { put("exit_node_id", it) }
        }
        val request = Request.Builder()
            .url("$baseUrl/v1/peers/register")
            .post(json.encodeToString(body).toRequestBody(JSON))
            .apply { bearer(accessToken)?.let { header("Authorization", it) } }
            .build()
        val raw = execute(request, "registration")
        return json.decodeFromString(raw)
    }

    /** Sends a heartbeat to keep this peer marked online. */
    suspend fun heartbeat(peerId: String, credential: String) {
        val body = mapOf("peer_id" to peerId, "credential" to credential)
        val request = Request.Builder()
            .url("$baseUrl/v1/peers/heartbeat")
            .post(json.encodeToString(body).toRequestBody(JSON))
            .build()
        runCatching { execute(request, "heartbeat") }
    }

    /** Fetches the available exit nodes. Empty on failure (caller falls back). */
    suspend fun fetchNodes(): List<ExitNode> = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("$baseUrl/v1/nodes").get().build()
        try {
            val raw = execute(request, "locations")
            json.decodeFromString<NodesResponse>(raw).nodes
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Fetches the required/latest app version (force-update gate).
     *
     * `?platform=android` để server trả đúng kênh APK (`apk_url`), không lẫn link tải của
     * kênh iOS — hai kênh phát hành độc lập nhau.
     */
    suspend fun fetchAppVersion(): AppVersionInfo {
        val request = Request.Builder().url("$baseUrl/v1/app-version?platform=android").get().build()
        val raw = execute(request, "app version")
        return json.decodeFromString(raw)
    }

    /** Deletes the signed-in user's account. */
    suspend fun deleteAccount(accessToken: String) {
        val request = Request.Builder()
            .url("$baseUrl/v1/account")
            .delete()
            .apply { header("Authorization", "Bearer $accessToken") }
            .build()
        execute(request, "account deletion")
    }

    /** Lists the signed-in user's devices. */
    suspend fun fetchMyDevices(accessToken: String): List<CoordinatorDevice> {
        if (accessToken.isEmpty()) throw ClientError.MissingSession()
        val request = Request.Builder()
            .url("$baseUrl/v1/devices")
            .get()
            .header("Authorization", "Bearer $accessToken")
            .build()
        val raw = execute(request, "devices")
        return json.decodeFromString<DevicesResponse>(raw).devices
    }

    /**
     * Claims this installation for the signed-in user. The server rejects with
     * ClientError.DeviceLimit when the account already uses the maximum number
     * of devices, returning the list so the UI can offer to log one out.
     */
    suspend fun claimDevice(
        accessToken: String,
        deviceKey: String,
        name: String,
        platform: String = "android",
    ): Unit {
        if (accessToken.isEmpty()) throw ClientError.MissingSession()
        val body = mapOf("device_key" to deviceKey, "name" to name, "platform" to platform)
        val request = Request.Builder()
            .url("$baseUrl/v1/devices/claim")
            .post(json.encodeToString(body).toRequestBody(JSON))
            .header("Authorization", "Bearer $accessToken")
            .build()
        execute(request, "device claim")
    }

    /** Revokes one of the signed-in user's devices. */
    suspend fun revokeDevice(id: String, accessToken: String) {
        if (accessToken.isEmpty()) throw ClientError.MissingSession()
        val request = Request.Builder()
            .url("$baseUrl/v1/devices/$id")
            .delete()
            .header("Authorization", "Bearer $accessToken")
            .build()
        execute(request, "device revocation")
    }

    /** Requests a fresh one-time enrollment token bound to the signed-in user. */
    suspend fun fetchEnrollmentToken(accessToken: String): String {
        if (accessToken.isEmpty()) throw ClientError.MissingSession()
        val request = Request.Builder()
            .url("$baseUrl/v1/enrollment-tokens")
            .post(EMPTY)
            .header("Authorization", "Bearer $accessToken")
            .build()
        val raw = execute(request, "enrollment token")
        return json.decodeFromString<TokenResponse>(raw).token
    }

    /** Email-code login: request a code. Returns optional debug code. */
    suspend fun startEmailLogin(email: String): String? {
        val body = mapOf("email" to email)
        val request = Request.Builder()
            .url("$baseUrl/v1/auth/email/start")
            .post(json.encodeToString(body).toRequestBody(JSON))
            .build()
        val raw = execute(request, "email login")
        return runCatching {
            json.decodeFromString<Map<String, String?>>(raw)["debug_code"]
        }.getOrNull()
    }

    /** Email-code login: verify the code and receive a session. */
    suspend fun verifyEmailLogin(email: String, code: String): CoordinatorAuthSession {
        val body = mapOf("email" to email, "code" to code)
        val request = Request.Builder()
            .url("$baseUrl/v1/auth/email/verify")
            .post(json.encodeToString(body).toRequestBody(JSON))
            .build()
        val raw = execute(request, "email verification")
        return json.decodeFromString(raw)
    }

    /**
     * Re-reads the signed-in session from the coordinator, so a change made while the app was
     * already signed in becomes visible without logging out and back in — today the only thing
     * that changes underneath us is a Premium plan granted from the web buy page (`/buy`).
     *
     * Requires `GET /v1/auth/session` on the control plane (added 14/09/2026). Deploy order
     * matters: an older coordinator answers 404, so callers must treat a failure as "keep the
     * entitlement we already have", never as "not subscribed".
     */
    suspend fun fetchSession(accessToken: String): CoordinatorAuthSession {
        if (accessToken.isEmpty()) throw ClientError.MissingSession()
        val request = Request.Builder()
            .url("$baseUrl/v1/auth/session")
            .get()
            .header("Authorization", "Bearer $accessToken")
            .build()
        val raw = execute(request, "session")
        return json.decodeFromString(raw)
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private val EMPTY = "{}".toRequestBody(JSON)

        /**
         * 5xx coi như "host chết": node vẫn trả lời nhưng control plane phía sau nó đã
         * dừng (node-1 trả 502 cho `api.meetflowai.site` từ 14/09) — phải thử host dự phòng
         * chứ không trả lỗi cho người dùng.
         */
        private val RETRYABLE_HTTP = setOf(502, 503, 504)
    }
}

/**
 * Nhớ host dự phòng vừa chạy được (trong bộ nhớ tiến trình, TTL 10 phút).
 *
 * Vì sao cần: ở mạng chặn IP node, host chính không trả lời (gói bị nuốt) nên MỖI request
 * phải chờ hết connect timeout mới rơi được xuống host dự phòng — vừa chậm vừa tốn pin.
 * Nhớ host tốt thì các request sau đi thẳng. TTL để còn dò lại host chính khi mạng đổi, và
 * host dự phòng hỏng thì bị quên ngay (xem `forget` trong tryFallbackBase).
 */
internal object PreferredHost {
    private const val TTL_MS = 10 * 60 * 1000L

    @Volatile private var host: String? = null
    @Volatile private var expiresAt = 0L

    fun get(): String? = host?.takeIf { System.currentTimeMillis() < expiresAt }

    fun remember(newHost: String) {
        host = newHost
        expiresAt = System.currentTimeMillis() + TTL_MS
    }

    fun forget() {
        host = null
        expiresAt = 0L
    }
}
