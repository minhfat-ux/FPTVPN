package com.privatevpn.app.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
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
        // Foreground immediately: on metered networks (China mobile data) Android
        // blocks data for background apps (netpolicy blocked=APP_BACKGROUND), which
        // made connects succeed or fail depending on whether the user was looking
        // at the app. Foreground keeps the app-uid's data access.
        startForegroundSafely()
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
                stopForeground(Service.STOP_FOREGROUND_REMOVE)
                stopSelf(startId)
            } catch (e: Exception) {
                android.util.Log.e("VPNFLOW_DEBUG", "hysteria failed: ${e.message}", e)
                if (!stopping) reportExit(e.message)
                stopForeground(Service.STOP_FOREGROUND_REMOVE)
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
        // Never give up on its own: the tunnel is what the user asked for, and on
        // flaky mobile links a pass can fail purely because of a loss burst. We
        // keep retrying with capped exponential backoff until the user stops us.
        var backoffMs = RETRY_BACKOFF_START_MS
        var everUp = false
        while (!stopping) {
            val outcome = oneConnectPass()
            when (outcome) {
                1 -> return // tunnel ran and stopped cleanly (user stop)
                2 -> { // tunnel was up and dropped — reconnect right away
                    everUp = true
                    backoffMs = RETRY_BACKOFF_START_MS
                    reportReconnecting()
                    android.util.Log.e("VPNFLOW_DEBUG", "hysteria: tunnel dropped -> reconnecting")
                    continue
                }
                else -> { // no transport reachable in this pass
                    reportReconnecting()
                    if (stopping) return
                    android.util.Log.e(
                        "VPNFLOW_DEBUG",
                        "hysteria: no transport reachable (pass failed" + (if (everUp) ", was up before" else "") + ") -> retry in ${backoffMs}ms",
                    )
                    Thread.sleep(backoffMs)
                    backoffMs = (backoffMs * 2).coerceAtMost(RETRY_BACKOFF_MAX_MS)
                }
            }
        }
    }

    /** Foreground notification so metered-background restrictions never apply. */
    private fun startForegroundSafely() {
        try {
            val notif = buildNotification()
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                    NOTIF_ID, notif,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(NOTIF_ID, notif)
            }
        } catch (e: Exception) {
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: startForeground failed: ${e.message}")
        }
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "VPN", NotificationManager.IMPORTANCE_LOW)
        )
        val pi = PendingIntent.getActivity(
            this,
            0,
            Intent(this, com.privatevpn.app.MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("VPNFlow")
            .setContentText("VPN active")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pi)
            .setOngoing(true)
            .build()
    }

    /** One pass: the transport that worked last time, then TCP relays, then UDP. */
    private fun oneConnectPass(): Int {
        val preferred = lastGoodTransport()
        if (preferred != null) {
            val outcome = preferredAttempt(preferred)
            if (outcome != 0) return outcome
        }
        for (relayPort in HY_TCP_RELAY_PORTS) {
            val outcome = tcpRelayAttempt(relayPort)
            if (outcome != 0) return outcome
        }
        for (port in HY_PORTS) {
            val outcome = udpAttempt(port)
            if (outcome != 0) return outcome
        }
        return 0
    }

    /** "tcp:8443" / "udp:8443" — the transport stored by the last successful run. */
    private fun preferredAttempt(pref: String): Int {
        val parts = pref.split(":")
        if (parts.size != 2) return 0
        val port = parts[1].toIntOrNull() ?: return 0
        return if (parts[0] == "tcp") tcpRelayAttempt(port) else udpAttempt(port)
    }

    /** Returns 0 = could not connect, 1 = tunnel ran then user stopped, 2 = dropped. */
    private fun tcpRelayAttempt(relayPort: Int): Int {
        if (stopping) return 1
        val sock = java.net.Socket()
        val ok = try {
            sock.connect(java.net.InetSocketAddress(runHost, relayPort), TCP_CONNECT_TIMEOUT_MS)
            true
        } catch (e: Exception) {
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort connect fail: ${e.message}")
            runCatching { sock.close() }
            false
        }
        if (!ok) return 0
        val sockFd = try {
            android.os.ParcelFileDescriptor.fromSocket(sock).detachFd()
        } catch (e: Exception) {
            runCatching { sock.close() }
            return 0
        }
        try {
            Mobile.connect(
                runHost, HY_PORTS[0].toLong(), HY_PASSWORD, HY_OBFS_PASSWORD,
                sockFd.toLong(), true, HY_UP_KBPS.toLong(), HY_DOWN_KBPS.toLong(),
            )
        } catch (e: Exception) {
            if (e.message?.contains("already running") == true) throw e
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort connect failed: ${e.message}")
            runCatching { sock.close() }
            return 0
        }
        if (stopping) { runCatching { Mobile.stop() }; runCatching { sock.close() }; return 1 }
        val tun = establish()
        try {
            protect(sock)
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UP via TCP relay $relayPort tun=${tun.fd}")
            rememberTransport("tcp:$relayPort")
            if (!stopping) reportUp()
            Mobile.serve(tun.fd.toLong(), HY_MTU.toLong(), HY_TUN_IPV4, HY_TUN_IPV6)
            return 1 // tunnel ran, then stopped because the user asked to
        } catch (e: Exception) {
            if (e.message?.contains("already running") == true) throw e
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort serve failed: ${e.message}")
            return 2
        } finally {
            tun.close()
            runCatching { sock.close() }
        }
    }

    /** Direct UDP attempt (native QUIC — fast path when UDP is not blocked). */
    private fun udpAttempt(port: Int): Int {
        if (stopping) return 1
        val ds = java.net.DatagramSocket()
        val sockFd = try {
            android.os.ParcelFileDescriptor.fromDatagramSocket(ds).detachFd()
        } catch (e: Exception) {
            runCatching { ds.close() }
            return 0
        }
        try {
            Mobile.connect(
                runHost, port.toLong(), HY_PASSWORD, HY_OBFS_PASSWORD,
                sockFd.toLong(), false, HY_UP_KBPS.toLong(), HY_DOWN_KBPS.toLong(),
            )
        } catch (e: Exception) {
            if (e.message?.contains("already running") == true) throw e
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UDP $runHost:$port connect failed: ${e.message}")
            runCatching { ds.close() }
            return 0
        }
        if (stopping) { runCatching { Mobile.stop() }; runCatching { ds.close() }; return 1 }
        val tun = establish()
        try {
            protect(ds)
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UP via UDP $runHost:$port tun=${tun.fd}")
            rememberTransport("udp:$port")
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

    /** UI: we are (re)trying to bring the tunnel up. */
    private fun reportReconnecting() {
        if (stopping) return
        try {
            val app = application as VPNFlowApp
            app.vpnManager.onHysteriaReconnecting()
        } catch (_: Exception) {
        }
    }

    /** Remembers which transport worked last time so we try it first. */
    private fun rememberTransport(value: String) {
        runCatching {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_TRANSPORT, value).apply()
        }
    }

    private fun lastGoodTransport(): String? = runCatching {
        getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TRANSPORT, null)
    }.getOrNull()

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
        runCatching { stopForeground(Service.STOP_FOREGROUND_REMOVE) }
        android.util.Log.e("VPNFLOW_DEBUG", "hysteria: service onDestroy -> Mobile.stop()")
        // Ask the Go client to stop; Start() (blocked on another thread) returns.
        try { Mobile.stop() } catch (_: Exception) {}
        super.onDestroy()
    }

    companion object {
        const val TCP_CONNECT_TIMEOUT_MS = 2500
        const val RETRY_BACKOFF_START_MS = 3000L
        const val RETRY_BACKOFF_MAX_MS = 30000L
        const val NOTIF_ID = 4242
        const val CHANNEL_ID = "vpn_foreground"
        const val PREFS = "vpnflow_hysteria"
        const val KEY_TRANSPORT = "last_good_transport"

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
        const val HY_UP_KBPS = com.privatevpn.app.Config.HY_UP_KBPS
        const val HY_DOWN_KBPS = com.privatevpn.app.Config.HY_DOWN_KBPS
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
