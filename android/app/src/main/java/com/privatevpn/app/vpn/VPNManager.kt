package com.privatevpn.app.vpn

import android.app.Application
import android.net.VpnService
import android.util.Log
import com.privatevpn.app.Config
import com.privatevpn.app.api.ControlAPIClient
import com.privatevpn.app.api.ExitNode
import com.privatevpn.app.auth.AuthSessionStore
import com.privatevpn.app.storage.DeviceIdentity
import com.privatevpn.app.storage.SecureStore
import com.privatevpn.app.theme.VPNState
import com.wireguard.android.backend.Backend
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config as WgConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import java.io.ByteArrayInputStream
import kotlinx.coroutines.withContext

/**
 * Coordinates VPN lifecycle on Android: backend node list, device registration
 * via the control plane, WireGuard tunnel via GoBackend (wireguard-go), and the
 * VpnService consent flow. Mirrors the iOS VPNManager state machine.
 */
class VPNManager(
    private val app: Application,
    private val store: SecureStore,
    private val authStore: AuthSessionStore,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var backend: GoBackend? = null

    private val _state = MutableStateFlow(VPNState.DISCONNECTED)
    val state: StateFlow<VPNState> = _state.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    private val _statusMessage = MutableStateFlow<String?>(null)
    val statusMessage: StateFlow<String?> = _statusMessage.asStateFlow()

    private val _devicePublicKey = MutableStateFlow<String?>(null)
    val devicePublicKey: StateFlow<String?> = _devicePublicKey.asStateFlow()

    /** Exit nodes loaded from the coordinator (or cache/fallback). */
    private val _remoteNodes = MutableStateFlow<List<ExitNode>>(emptyList())
    val remoteNodes: StateFlow<List<ExitNode>> = _remoteNodes.asStateFlow()

    private val _usingFallbackNodes = MutableStateFlow(false)
    val usingFallbackNodes: StateFlow<Boolean> = _usingFallbackNodes.asStateFlow()

    private val _selectedNodeID = MutableStateFlow<String?>(store.getString(SecureStore.Keys.SELECTED_NODE_ID))
    val selectedNodeID: StateFlow<String?> = _selectedNodeID.asStateFlow()

    private var activeTunnel: Tunnel? = null
    private var peerCredential: String? = null
    private var peerId: String? = null

    val availableNodes: List<ExitNode>
        get() {
            val remote = _remoteNodes.value
            if (remote.isNotEmpty()) return remote
            return com.privatevpn.app.api.ExitNodeFallback.builtIn
        }

    val selectedNode: ExitNode?
        get() = availableNodes.firstOrNull { it.id == _selectedNodeID.value }

    fun selectNode(id: String) {
        _selectedNodeID.value = id
        store.putString(SecureStore.Keys.SELECTED_NODE_ID, id)
    }

    fun refreshDevicePublicKey() {
        val pair = DeviceIdentity.obtainOrCreateKeyPair(store)
        _devicePublicKey.value = pair.publicKey.toBase64()
    }

    /** VpnService consent. Returns the intent to launch if consent is needed. */
    fun prepareVpnServiceIntent(): android.content.Intent? = VpnService.prepare(app)

    /** Call after the user grants VpnService consent via the intent. */
    fun onVpnConsentGranted() {
        scope.launch { connect() }
    }

    /** Fetches the exit-node list; falls back to cache, then built-ins. */
    fun fetchNodes() {
        scope.launch {
            val client = ControlAPIClient()
            var nodes = runCatching { client.fetchNodes() }.getOrDefault(emptyList())
            if (nodes.isNotEmpty()) {
                cacheNodes(nodes)
                _usingFallbackNodes.value = false
            } else {
                nodes = loadCachedNodes() ?: com.privatevpn.app.api.ExitNodeFallback.builtIn
                _usingFallbackNodes.value = true
            }
            _remoteNodes.value = nodes
            if (_selectedNodeID.value == null && nodes.isNotEmpty()) {
                selectNode(nodes.first().id)
            }
        }
    }

    /** Main connect flow. Assumes premium + signed-in are already checked. */
    fun connect() {
        scope.launch {
            if (_state.value.isTransitioning) return@launch
            _state.value = VPNState.CONNECTING
            _lastError.value = null
            _statusMessage.value = null
            try {
                val config = provision()
                val consentIntent = prepareVpnServiceIntent()
                if (consentIntent != null) {
                    _statusMessage.value = "Preparing VPN permission…"
                    // UI observes consentIntent and launches it; connect() continues
                    // after onVpnConsentGranted(). To keep single-path, expose a
                    // pending-config holder handled by the UI layer.
                    pendingConfig = config
                    _pendingConsent.value = consentIntent
                    return@launch
                }
                startTunnel(config)
            } catch (e: Exception) {
                _state.value = VPNState.FAILED
                _lastError.value = e.message
                _statusMessage.value = userMessage(e)
            }
        }
    }

    /** Resumes connect() after consent was granted. */
    fun resumeAfterConsent() {
        scope.launch {
            val config = pendingConfig
            pendingConfig = null
            _pendingConsent.value = null
            if (config == null) {
                _state.value = VPNState.FAILED
                _statusMessage.value = "VPN could not start. Please try again."
                return@launch
            }
            startTunnel(config)
        }
    }

    private var pendingConfig: WireGuardTunnelConfig? = null
    private val _pendingConsent = MutableStateFlow<android.content.Intent?>(null)
    val pendingConsent: StateFlow<android.content.Intent?> = _pendingConsent.asStateFlow()

    fun disconnect() {
        scope.launch {
            _state.value = VPNState.DISCONNECTING
            withContext(Dispatchers.IO) {
                try {
                    backend?.setState(activeTunnel ?: SimpleTunnel(Config.WG_TUNNEL_NAME), Tunnel.State.DOWN, null)
                } catch (e: Exception) {
                    Log.e("VPNFlow", "disconnect failed: $e")
                }
            }
            activeTunnel = null
            _state.value = VPNState.DISCONNECTED
            _statusMessage.value = null
        }
    }

    // MARK: - Provisioning

    private suspend fun provision(): WireGuardTunnelConfig {
        val client = ControlAPIClient()
        val keyPair = DeviceIdentity.obtainOrCreateKeyPair(store).also { pair ->
            _devicePublicKey.value = pair.publicKey.toBase64()
        }

        val accessToken = authStore.accessToken
            ?: throw ControlAPIClient.ClientError.MissingSession()

        val joinToken = runCatching { client.fetchEnrollmentToken(accessToken) }.getOrElse {
            throw ControlAPIClient.ClientError.Server("Cannot prepare secure access. Please try again.")
        }

        val node = selectedNode ?: run {
            val nodes = client.fetchNodes()
            if (nodes.isEmpty()) throw ControlAPIClient.ClientError.Server("No exit node available from the server. Please try again.")
            _remoteNodes.value = nodes
            selectNode(nodes.first().id)
            nodes.first()
        }

        val response = try {
            client.register(
                name = DeviceIdentity.registrationName(store),
                platform = "android",
                wireguardPublicKey = keyPair.publicKey.toBase64(),
                endpoint = Config.WG_CLIENT_ENDPOINT,
                accessToken = accessToken,
                exitNodeId = node.id,
            )
        } catch (e: ControlAPIClient.ClientError.Server) {
            // Retry once with a fresh token + random name (duplicate-name safety).
            val retryToken = runCatching { client.fetchEnrollmentToken(accessToken) }
                .getOrElse { throw ControlAPIClient.ClientError.Server("Cannot prepare secure access. Please try again.") }
            client.register(
                name = DeviceIdentity.randomRegistrationName(),
                platform = "android",
                wireguardPublicKey = keyPair.publicKey.toBase64(),
                endpoint = Config.WG_CLIENT_ENDPOINT,
                accessToken = accessToken,
                exitNodeId = node.id,
            )
        }

        peerId = response.peerId
        peerCredential = response.peerCredential
        cacheTunnel(overlayIp = response.overlayIp, node = node)
        heartbeatLoop()

        return WireGuardTunnelConfig(
            privateKeyBase64 = keyPair.privateKey.toBase64(),
            addresses = listOf("${response.overlayIp}/24"),
            dnsServers = listOf(Config.WG_DNS),
            peers = listOf(
                WireGuardPeer(
                    publicKeyBase64 = node.publicKey,
                    endpoint = node.endpoint,
                    allowedIPs = listOf(Config.WG_ALLOWED_IPS),
                    persistentKeepAlive = Config.WG_PERSISTENT_KEEPALIVE,
                )
            ),
        )
    }

    private fun startTunnel(config: WireGuardTunnelConfig) {
        scope.launch {
            withContext(Dispatchers.IO) {
                try {
                    val backendInstance = backend ?: GoBackend(app).also { backend = it }
                    val tunnel = SimpleTunnel(Config.WG_TUNNEL_NAME) { newState ->
                        if (newState == Tunnel.State.UP) {
                            _state.value = VPNState.CONNECTED
                            _statusMessage.value = null
                        } else if (newState == Tunnel.State.DOWN) {
                            _state.value = VPNState.DISCONNECTED
                        }
                    }
                    activeTunnel = tunnel
                    backendInstance.setState(tunnel, Tunnel.State.UP, config.toWgQuickConfig())
                } catch (e: Exception) {
                    _state.value = VPNState.FAILED
                    _lastError.value = e.message
                    _statusMessage.value = userMessage(e)
                }
            }
        }
    }

    private fun heartbeatLoop() {
        val pid = peerId ?: return
        val cred = peerCredential ?: return
        scope.launch {
            while (_state.value == VPNState.CONNECTING || _state.value == VPNState.CONNECTED) {
                runCatching { ControlAPIClient().heartbeat(pid, cred) }
                kotlinx.coroutines.delay(30_000)
            }
        }
    }

    // MARK: - Caches (mirror iOS ExitNodeCache / TunnelConfigCache)

    private fun cacheNodes(nodes: List<ExitNode>) {
        runCatching {
            store.putString(SecureStore.Keys.CACHED_NODES, kotlinx.serialization.json.Json.encodeToString(
                kotlinx.serialization.builtins.ListSerializer(ExitNode.serializer()), nodes))
        }
    }

    private fun loadCachedNodes(): List<ExitNode>? {
        val raw = store.getString(SecureStore.Keys.CACHED_NODES) ?: return null
        return runCatching {
            kotlinx.serialization.json.Json.decodeFromString(
                kotlinx.serialization.builtins.ListSerializer(ExitNode.serializer()), raw)
        }.getOrNull()
    }

    private fun cacheTunnel(overlayIp: String, node: ExitNode) {
        runCatching {
            val data = kotlinx.serialization.json.Json.encodeToString(
                CachedTunnel(overlayIp = overlayIp, node = node))
            store.putString(SecureStore.Keys.CACHED_TUNNEL, data)
        }
    }

    private fun loadCachedTunnel(): CachedTunnel? {
        val raw = store.getString(SecureStore.Keys.CACHED_TUNNEL) ?: return null
        return runCatching { kotlinx.serialization.json.Json.decodeFromString<CachedTunnel>(raw) }.getOrNull()
    }

    private fun userMessage(e: Exception): String = when (e) {
        is ControlAPIClient.ClientError.Transport -> "Cannot reach VPNFlow service. Please try again."
        is ControlAPIClient.ClientError.Server -> "Coordinator rejected this device. Please try again."
        is ControlAPIClient.ClientError.MissingSession -> "Please sign in before connecting."
        is com.wireguard.android.backend.BackendException ->
            if (e.reason == com.wireguard.android.backend.BackendException.Reason.VPN_NOT_AUTHORIZED)
                "VPN permission is required to connect."
            else "VPN could not start. Please try again."
        else -> "VPN could not start. Please try again."
    }

    companion object {
        private const val TAG = "VPNFlow"
    }
}

/** Simple tunnel name holder for GoBackend. */
class SimpleTunnel(
    private val tunnelName: String,
    private val onChange: (Tunnel.State) -> Unit = {},
) : Tunnel {
    override fun getName(): String = tunnelName
    override fun onStateChange(newState: Tunnel.State) = onChange(newState)
}

/** Serializable tunnel config (mirrors iOS WireGuardConfig). */
@kotlinx.serialization.Serializable
data class WireGuardTunnelConfig(
    val privateKeyBase64: String,
    val addresses: List<String>,
    val dnsServers: List<String>,
    val peers: List<WireGuardPeer>,
) {
    /** Builds a wg-quick style Config for the tunnel library. */
    fun toWgQuickConfig(): WgConfig {
        val sb = StringBuilder()
        sb.append("[Interface]\n")
        sb.append("PrivateKey = ").append(privateKeyBase64).append('\n')
        addresses.forEach { sb.append("Address = ").append(it).append('\n') }
        dnsServers.forEach { sb.append("DNS = ").append(it).append('\n') }
        peers.forEach { peer ->
            sb.append("\n[Peer]\n")
            sb.append("PublicKey = ").append(peer.publicKeyBase64).append('\n')
            peer.endpoint?.let { sb.append("Endpoint = ").append(it).append('\n') }
            peer.allowedIPs.forEach { sb.append("AllowedIPs = ").append(it).append('\n') }
            peer.persistentKeepAlive?.let { sb.append("PersistentKeepalive = ").append(it).append('\n') }
        }
        return WgConfig.parse(ByteArrayInputStream(sb.toString().toByteArray(Charsets.UTF_8)))
    }
}

@kotlinx.serialization.Serializable
data class WireGuardPeer(
    val publicKeyBase64: String,
    val endpoint: String? = null,
    val allowedIPs: List<String> = emptyList(),
    val preSharedKeyBase64: String? = null,
    val persistentKeepAlive: Int? = null,
)

@kotlinx.serialization.Serializable
data class CachedTunnel(
    val overlayIp: String,
    val node: ExitNode,
)
