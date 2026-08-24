package com.privatevpn.app.api

import com.privatevpn.app.Config
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
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    sealed class ClientError(message: String) : Exception(message) {
        class BadResponse : ClientError("The coordinator returned an invalid response.")
        class Server(val serverMessage: String) : ClientError(serverMessage)
        class Transport(val endpoint: String, cause: IOException) :
            ClientError("Could not reach the coordinator while requesting $endpoint: ${cause.message}")
        class MissingSession : ClientError("Please sign in before connecting.")
    }

    private suspend fun execute(request: Request, endpoint: String): String = withContext(Dispatchers.IO) {
        try {
            client.newCall(request).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    val err = runCatching { json.decodeFromString<ErrorBody>(body) }.getOrNull()
                    throw ClientError.Server(err?.message ?: err?.error ?: "HTTP ${resp.code}")
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
    ): CoordinatorRegisterResponse {
        val body = buildMap {
            put("name", name)
            put("platform", platform)
            put("wireguard_public_key", wireguardPublicKey)
            put("endpoint", endpoint)
            put("join_token", joinToken)
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

    /** Fetches the required/latest app version (force-update gate). */
    suspend fun fetchAppVersion(): AppVersionInfo {
        val request = Request.Builder().url("$baseUrl/v1/app-version").get().build()
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

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private val EMPTY = "{}".toRequestBody(JSON)
    }
}
