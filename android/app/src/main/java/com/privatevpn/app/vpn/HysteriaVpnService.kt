package com.privatevpn.app.vpn

import android.app.Service
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import com.privatevpn.app.VPNFlowApp
import mobile.Mobile

/**
 * App-owned VpnService for Hysteria2 China mode. Establishes the tunnel,
 * hands the TUN fd to the hysteria2 Go client (mobile.Mobile), and keeps the
 * VPN alive until stop is requested.
 *
 * Started with plain startService() (NOT startForegroundService): an active
 * VpnService tunnel pins the process itself, and Android 15+/16 dropped the
 * "vpn" value from android:foregroundServiceType so a typed foreground start
 * is no longer possible/needed — the WireGuard AAR follows the same pattern.
 */
class HysteriaVpnService : VpnService() {

    /** Hysteria server host, from the selected exit node (Config fallback). */
    private var runHost: String = DEFAULT_HOST

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // New session: clear any stop flag left by the previous disconnect,
        // otherwise the tunnel thread exits immediately and stops the service.
        stopping = false
        // Hysteria server host comes from the selected exit node; Config is the fallback.
        runHost = intent?.getStringExtra(EXTRA_HOST)?.takeIf { it.isNotBlank() } ?: DEFAULT_HOST
        android.util.Log.e("VPNFLOW_DEBUG", "hysteria: onStartCommand startId=$startId host=$runHost")
        Thread {
            try {
                runTunnel()
                // runTunnel returns only after the tunnel ended (user stop) or a
                // stop was requested mid-connect — always finish the service.
                stopSelf(startId)
            } catch (e: Exception) {
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria failed: ${e.message}", e)
                if (!stopping) reportExit(e.message)
                stopSelf(startId)
            }
        }.start()
        // START_STICKY: if the system kills the process the tunnel restarts;
        // stopSelf() paths (user stop / tunnel error) do not restart.
        return Service.START_STICKY
    }

    /**
     * China mobile/GFW links drop packets in bursts: SYN timeouts on one try,
     * fine a minute later. So we retry the transport preference list in passes
     * (no tunnel is up during a pass, so the device keeps its own internet),
     * and when an established tunnel drops we reconnect automatically. Gives up
     * only after CONNECT_PASS_LIMIT all-failed passes.
     */
    private fun runTunnel() {
        // Clear any stale client state left by a process kill (zombie client).
        runCatching { Mobile.stop() }
        var lastError: Exception? = null
        var everUp = false
        var failedPasses = 0
        while (!stopping) {
            val outcome = oneConnectPass()
            when (outcome) {
                1 -> return // tunnel ran and stopped cleanly (user stop)
                2 -> { // tunnel ran then dropped (network) — reconnect now
                    everUp = true
                    android.util.Log.e("VPNFLOW_DEBUG", "hysteria: tunnel dropped -> reconnecting")
                    continue
                }
                else -> { // whole pass failed to connect
                    if (++failedPasses >= CONNECT_PASS_LIMIT) break
                    if (!stopping) {
                        android.util.Log.e("VPNFLOW_DEBUG", "hysteria: connect pass $failedPasses failed -> retry in 3s")
                        Thread.sleep(3000)
                    }
                }
            }
        }
        val why = lastError?.message ?: "all transports failed"
        throw IllegalStateException(if (everUp) "connection dropped: $why" else "connect failed: $why")
    }

    /** One pass over TCP relays then UDP ports. Returns 0 all-fail, 1 clean
     *  user stop, 2 tunnel ran then dropped. */
    private fun oneConnectPass(): Int {
        // 1) TCP relays (server: TCP relay <-> UDP hysteria on 127.0.0.1).
        for (relayPort in HY_TCP_RELAY_PORTS) {
            if (stopping) return 1
            val sock = java.net.Socket()
            val ok = try {
                sock.connect(java.net.InetSocketAddress(runHost, relayPort), 2500)
                true
            } catch (e: Exception) {
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort connect fail: ${e.message}")
                // In-process OS-level probe to tell app-network issues apart from
                // java.net.Socket quirks.
                val probe = try {
                    val pr = ProcessBuilder("nc", "-z", "-w", "2", runHost, relayPort.toString())
                        .redirectErrorStream(true).start()
                    val code = pr.waitFor()
                    "nc exit=$code"
                } catch (pe: Exception) {
                    "nc err: ${pe.message}"
                }
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria: in-app nc probe $relayPort -> $probe")
                runCatching { sock.close() }
                false
            }
            if (!ok) continue
            val sockFd = try {
                android.os.ParcelFileDescriptor.fromSocket(sock).detachFd()
            } catch (e: Exception) {
                runCatching { sock.close() }
                continue
            }
            try {
                Mobile.connect(runHost, HY_PORTS[0].toLong(), HY_PASSWORD, HY_OBFS_PASSWORD, sockFd.toLong(), true)
            } catch (e: Exception) {
                if (e.message?.contains("already running") == true) throw e
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort connect failed: ${e.message}")
                runCatching { sock.close() }
                continue
            }
            if (stopping) { runCatching { Mobile.stop() }; runCatching { sock.close() }; return 1 }
            val tun = establish()
            try {
                protect(sock)
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UP via TCP relay $relayPort tun=${tun.fd}")
                if (!stopping) reportUp()
                Mobile.serve(tun.fd.toLong(), HY_MTU.toLong(), HY_TUN_IPV4, HY_TUN_IPV6)
                return 1 // clean user stop
            } catch (e: Exception) {
                if (e.message?.contains("already running") == true) throw e
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort serve failed: ${e.message}")
                return 2
            } finally {
                tun.close()
                runCatching { sock.close() }
            }
        }

        // 2) Direct UDP ports (connect client first, then tunnel).
        for (port in HY_PORTS) {
            if (stopping) return 1
            val ds = java.net.DatagramSocket()
            val sockFd = try {
                android.os.ParcelFileDescriptor.fromDatagramSocket(ds).detachFd()
            } catch (e: Exception) {
                runCatching { ds.close() }
                continue
            }
            try {
                Mobile.connect(runHost, port.toLong(), HY_PASSWORD, HY_OBFS_PASSWORD, sockFd.toLong(), false)
            } catch (e: Exception) {
                if (e.message?.contains("already running") == true) throw e
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UDP $runHost:$port connect failed: ${e.message}")
                runCatching { ds.close() }
                continue
            }
            if (stopping) { runCatching { Mobile.stop() }; runCatching { ds.close() }; return 1 }
            val tun = establish()
            try {
                protect(ds)
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UP via UDP $runHost:$port tun=${tun.fd}")
                if (!stopping) reportUp()
                Mobile.serve(tun.fd.toLong(), HY_MTU.toLong(), HY_TUN_IPV4, HY_TUN_IPV6)
                return 1
            } catch (e: Exception) {
                if (e.message?.contains("already running") == true) throw e
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UDP $runHost:$port serve failed: ${e.message}")
                return 2
            } finally {
                tun.close()
                runCatching { ds.close() }
            }
        }
        return 0
    }

    private fun establish(): ParcelFileDescriptor {
        val builder = Builder()
        builder.setSession("FlowVPN Hysteria")
        builder.setMtu(HY_MTU)
        builder.addAddress(HY_TUN_IPV4_IP, 30)
        builder.addRoute("0.0.0.0", 0)
        builder.addDnsServer("1.1.1.1")
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            builder.setMetered(false)
        }
        return builder.establish() ?: throw IllegalStateException("establish failed")
    }

    /** Notifies the UI layer that the tunnel is really up (clears fake state). */
    private fun reportUp() {
        try {
            val app = application as VPNFlowApp
            app.vpnManager.onHysteriaUp()
        } catch (_: Exception) {
        }
    }

    /** Notifies the UI layer that the tunnel ended on its own (not user-stop). */
    private fun reportExit(error: String?) {
        try {
            val app = application as VPNFlowApp
            app.vpnManager.onHysteriaExited(error)
        } catch (_: Exception) {
        }
    }

    override fun onDestroy() {
        stopping = true
        android.util.Log.e("VPNFLOW_DEBUG", "hysteria: service onDestroy -> Mobile.stop()")
        // Ask the Go client to stop; Start() (blocked on another thread) returns.
        try { Mobile.stop() } catch (_: Exception) {}
        super.onDestroy()
    }

    companion object {
        const val CONNECT_PASS_LIMIT = 6

        @Volatile var stopping = false

        /**
         * Disconnect entry point — must NOT depend on onDestroy() (Android can
         * defer service destruction while the VpnService is active). Stops the
         * Go client directly; the blocked tunnel thread then unwinds: closes the
         * TUN fd and calls stopSelf().
         */
        fun requestStop(context: android.content.Context) {
            stopping = true
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: requestStop -> Mobile.stop()")
            runCatching { Mobile.stop() }
            runCatching {
                context.stopService(android.content.Intent(context, HysteriaVpnService::class.java))
            }
        }

        const val EXTRA_HOST = "hysteria_host"
        const val DEFAULT_HOST = com.privatevpn.app.Config.HY_SERVER
        // legacy alias giữ nguyên cho các tham chiếu cũ (nếu có)
        const val HY_HOST = com.privatevpn.app.Config.HY_SERVER
        val HY_PORTS = com.privatevpn.app.Config.HY_PORTS
        const val HY_TCP_RELAY_HOST = com.privatevpn.app.Config.HY_TCP_RELAY_HOST
        val HY_TCP_RELAY_PORTS = com.privatevpn.app.Config.HY_TCP_RELAY_PORTS
        const val HY_PASSWORD = com.privatevpn.app.Config.HY_PASSWORD
        const val HY_OBFS_PASSWORD = com.privatevpn.app.Config.HY_OBFS
        const val HY_MTU = 1500
        // Single overlay address 100.100.100.101/30 (must match Go wrapper default).
        const val HY_TUN_IPV4_IP = "100.100.100.101"
        const val HY_TUN_IPV4 = "100.100.100.101/30"
        const val HY_TUN_IPV6 = ""
    }
}
