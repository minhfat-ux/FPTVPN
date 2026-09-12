package com.privatevpn.app.diag

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities

/**
 * Logs every change of the default network (WiFi ↔ mobile data) together with the
 * active transport, so a handover that strands the tunnel is visible in the log.
 *
 * `onCapabilitiesChanged` fires very often, so only a change of the transport /
 * validation summary is recorded.
 */
class NetworkMonitor(context: Context) {

    private val cm: ConnectivityManager? =
        context.getSystemService(ConnectivityManager::class.java)

    private var registered = false
    private var lastSummary: String? = null

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
        }

        override fun onLinkPropertiesChanged(network: Network, lp: LinkProperties) {
            DiagnosticsLog.log(
                "net: link ${transportOf(network)} iface=${lp.interfaceName} dns=${lp.dnsServers.size}",
            )
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
    }

    fun stop() {
        val manager = cm ?: return
        if (!registered) return
        runCatching { manager.unregisterNetworkCallback(callback) }
        registered = false
        DiagnosticsLog.log("net: monitor stopped")
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
