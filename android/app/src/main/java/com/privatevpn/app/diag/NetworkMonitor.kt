package com.privatevpn.app.diag

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities

/**
 * Watches the networks around the tunnel. Two jobs:
 *
 *  1. Logging — every WiFi/cellular change with the active transport, so a handover
 *     that strands the tunnel is visible in the on-device diagnostics file.
 *  2. Reporting — [onUnderlyingChanged] fires when the network the tunnel actually
 *     rides on changes (WiFi died, or WiFi came up over mobile data). The tunnel
 *     service uses that to rebuild its outer socket, which is pinned to the network
 *     that was default when it was created.
 *
 * `onCapabilitiesChanged` fires very often, so only real changes are acted on.
 */
class NetworkMonitor(
    context: Context,
    private val onUnderlyingChanged: (() -> Unit)? = null,
) {

    private val cm: ConnectivityManager? =
        context.getSystemService(ConnectivityManager::class.java)

    private var registered = false
    private var allRegistered = false
    private var lastSummary: String? = null
    private var lastDefaultTransport: String? = null

    /** Last underlying network label reported to the tunnel ("wifi", "cell", ...). */
    @Volatile private var lastUnderlying: String? = null

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            DiagnosticsLog.log("net: available ${transportOf(network)} -> default ${snapshot()}")
        }

        override fun onLost(network: Network) {
            // The interesting case: the tunnel is up but its underlying network
            // just disappeared (hotel WiFi -> walking outside).
            DiagnosticsLog.warn("net: LOST ${transportOf(network)} -> default now ${snapshot()}")
        }

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            val summary = summarize(caps)
            if (summary != lastSummary) {
                lastSummary = summary
                DiagnosticsLog.log("net: caps ${transportOf(network)} $summary")
            }
            // A WiFi -> mobile-data flip must be unmistakable in the log: the
            // default callback follows the VPN, so onLost() for WiFi never fires.
            val nowTransport = transportName(caps)
            val prev = lastDefaultTransport
            if (nowTransport != prev) {
                lastDefaultTransport = nowTransport
                if (prev != null) {
                    DiagnosticsLog.warn(
                        "net: DEFAULT TRANSPORT CHANGED $prev -> $nowTransport " +
                            "(transport=${DiagnosticsLog.transport} outer=${DiagnosticsLog.outerLocal})",
                    )
                } else {
                    DiagnosticsLog.log("net: default transport=$nowTransport")
                }
            }
        }

        override fun onLinkPropertiesChanged(network: Network, lp: LinkProperties) {
            DiagnosticsLog.log(
                "net: link ${transportOf(network)} iface=${lp.interfaceName} dns=${lp.dnsServers.size}",
            )
        }
    }

    /**
     * Second, independent callback registered for ALL internet-capable networks
     * (not only the default one): `registerDefaultNetworkCallback` follows the VPN
     * once a tunnel is up, so "WiFi went away" was invisible before.
     */
    private val allCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            DiagnosticsLog.log("allnet: ${transportOf(network)} available")
            notifyUnderlying("available")
        }

        override fun onLost(network: Network) {
            DiagnosticsLog.warn(
                "allnet: ${transportOf(network)} LOST (transport=${DiagnosticsLog.transport} outer=${DiagnosticsLog.outerLocal})",
            )
            notifyUnderlying("lost")
        }

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            DiagnosticsLog.log(
                "allnet: ${transportOf(network)} " +
                    (if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) "validated" else "not-validated") +
                    (if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) ",unmetered" else ",metered"),
            )
            notifyUnderlying("caps")
        }
    }

    fun start() {
        val manager = cm ?: return
        if (registered) return
        runCatching { manager.registerDefaultNetworkCallback(callback) }
            .onSuccess {
                registered = true
                DiagnosticsLog.log("net: monitor started, default ${snapshot()}")
            }
            .onFailure { DiagnosticsLog.warn("net: monitor start failed: ${it.message}") }
        if (!allRegistered) {
            val request = android.net.NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            runCatching { manager.registerNetworkCallback(request, allCallback) }
                .onSuccess { allRegistered = true }
                .onFailure { DiagnosticsLog.warn("net: all-network monitor failed: ${it.message}") }
        }
    }

    fun stop() {
        val manager = cm ?: return
        if (!registered) return
        runCatching { manager.unregisterNetworkCallback(callback) }
        if (allRegistered) {
            runCatching { manager.unregisterNetworkCallback(allCallback) }
            allRegistered = false
        }
        registered = false
        DiagnosticsLog.log("net: monitor stopped")
    }

    /**
     * The network the tunnel really rides on. The app's own default network is the
     * VPN, so this looks at every network and prefers validated WiFi over validated
     * cellular — the same preference Android itself applies.
     */
    fun underlyingNetwork(): Network? {
        val manager = cm ?: return null
        val networks = runCatching { manager.allNetworks }.getOrNull() ?: return null
        var cellular: Network? = null
        for (network in networks) {
            val caps = runCatching { manager.getNetworkCapabilities(network) }.getOrNull() ?: continue
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) continue
            when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> return network
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> cellular = network
            }
        }
        return cellular
    }

    /** Short label for a network, for logs ("wifi", "cell", ...). */
    fun describe(network: Network): String {
        val manager = cm ?: return "net?"
        val caps = runCatching { manager.getNetworkCapabilities(network) }.getOrNull() ?: return "net?"
        return transportName(caps)
    }

    /**
     * Notifies the tunnel when the underlying network changes. This is the trigger
     * for rebuilding the transport: the outer socket cannot move networks on its own.
     */
    private fun notifyUnderlying(trigger: String) {
        val label = underlyingNetwork()?.let { describe(it) } ?: "none"
        if (label == lastUnderlying) return
        val previous = lastUnderlying
        lastUnderlying = label
        DiagnosticsLog.warn("net: UNDERLYING $previous -> $label ($trigger)")
        if (previous != null) {
            runCatching { onUnderlyingChanged?.invoke() }
                .onFailure { DiagnosticsLog.warn("net: rebuild callback failed: ${it.message}") }
        }
    }

    /** One-line picture of the current default network. */
    fun snapshot(): String {
        val manager = cm ?: return "cm=null"
        val network = runCatching { manager.activeNetwork }.getOrNull() ?: return "default=none"
        val caps = runCatching { manager.getNetworkCapabilities(network) }.getOrNull()
        return "default=${transportOf(network)}${caps?.let { " ${summarize(it)}" } ?: ""}"
    }

    /** True when the default network currently claims to be validated (real internet). */
    fun defaultValidated(): Boolean {
        val manager = cm ?: return false
        val network = runCatching { manager.activeNetwork }.getOrNull() ?: return false
        val caps = runCatching { manager.getNetworkCapabilities(network) }.getOrNull() ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun transportOf(network: Network): String {
        val manager = cm ?: return "net?"
        val caps = runCatching { manager.getNetworkCapabilities(network) }.getOrNull() ?: return "net?"
        return transportName(caps)
    }

    private fun transportName(caps: NetworkCapabilities): String = when {
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cell"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "eth"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
        else -> "other"
    }

    private fun summarize(caps: NetworkCapabilities): String {
        val flags = buildList {
            add(transportName(caps))
            if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) add("internet")
            if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) add("validated")
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) add("metered")
        }
        return flags.joinToString(",")
    }
}
