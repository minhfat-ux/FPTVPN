package com.privatevpn.app.vpn

import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog
import com.privatevpn.app.diag.NetworkMonitor
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

    /** Logs default-network changes while the tunnel runs (WiFi -> mobile data). */
    private var networkMonitor: NetworkMonitor? = null
    private var probeThread: Thread? = null

    /**
     * The TUN interface. Created once per session and deliberately KEPT across
     * transport rebuilds: closing it would let the device's traffic leak out
     * unprotected for the second or two a rebuild takes.
     */
    private var tun: ParcelFileDescriptor? = null

    /** Set when the underlying network changed and the outer socket must be rebuilt. */
    @Volatile private var rebuildRequested = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Foreground immediately: on metered networks (China mobile data) Android
        // blocks data for background apps (netpolicy blocked=APP_BACKGROUND), which
        // made connects succeed or fail depending on whether the user was looking
        // at the app. Foreground keeps the app-uid's data access.
        startForegroundSafely()
        // New session: clear any stop flag left by the previous disconnect,
        // otherwise the tunnel thread exits immediately and stops the service.
        stopping = false
        // Diagnostics: default-network changes + periodic transport probe. This is
        // the instrumentation for "connected on hotel WiFi, walked outside, no
        // internet until reconnect".
        DiagnosticsLog.init(this)
        if (networkMonitor == null) {
            // The listener is what fixes the "connected on WiFi, walked outside, no
            // internet" bug: a transport rebuild is started the moment Android moves
            // the tunnel onto another underlying network.
            networkMonitor = NetworkMonitor(this) { onUnderlyingNetworkChanged() }
                .also { it.start() }
        }
        startProbeLoop()
        DiagnosticsLog.log("service: onStartCommand startId=$startId")
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
        try {
            while (!stopping) {
                val outcome = oneConnectPass()
                when (outcome) {
                    1 -> return // user stop
                    2 -> { // transport dropped or was rebuilt for a network change
                        everUp = true
                        backoffMs = RETRY_BACKOFF_START_MS
                        reportReconnecting()
                        // Give the Go client a moment to release its socket/fd before
                        // the next pass opens a fresh one on the new network.
                        Thread.sleep(REBUILD_SETTLE_MS)
                        continue
                    }
                    else -> { // no transport reachable in this pass
                        reportReconnecting()
                        if (stopping) return
                        // Drop the TUN while we back off: with no working transport an
                        // up interface would black-hole every packet on the device.
                        closeTun()
                        val wasUp = if (everUp) ", was up before" else ""
                        android.util.Log.e(
                            "VPNFLOW_DEBUG",
                            "hysteria: no transport reachable (pass failed$wasUp) -> retry in ${backoffMs}ms",
                        )
                        Thread.sleep(backoffMs)
                        backoffMs = (backoffMs * 2).coerceAtMost(RETRY_BACKOFF_MAX_MS)
                    }
                }
            }
        } finally {
            closeTun()
        }
    }

    /**
     * Android moved the tunnel onto a different underlying network: hotel WiFi died,
     * or WiFi came up over mobile data. The outer socket is bound to the network that
     * was default when it was created (measured on device: it stays on the dead WiFi
     * address `10.0.3.247` while the phone is on 4G, so the tunnel silently carries
     * nothing). Stopping the Go client makes serve() return; the create/connect loop
     * then opens a fresh socket, which protect() binds to the NEW network.
     */
    private fun onUnderlyingNetworkChanged() {
        if (tun == null) return // nothing serving yet; the next pass uses the new network
        rebuildRequested = true
        DiagnosticsLog.warn("rebuild: underlying network changed -> restarting transport")
        runCatching { Mobile.stop() }
    }

    /**
     * What a finished serve() means:
     *  1 = the user asked to stop,
     *  2 = the transport ended (network change or peer loss) and must be rebuilt.
     *
     * Returning 1 for an unexpected end was a bug: the service reported "stopped
     * cleanly" and shut down while the UI still showed Connected.
     */
    private fun serveOutcome(how: String): Int {
        if (stopping) return 1
        if (rebuildRequested) {
            rebuildRequested = false
            DiagnosticsLog.warn("rebuild: transport torn down ($how) -> reconnecting on the new network")
            return 2
        }
        DiagnosticsLog.warn("transport ended on its own ($how) -> reconnecting")
        return 2
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
        // Notification channels and the channel-aware Builder only exist on API 26+;
        // guarded so the legacy sideload build (Fire OS 6 / Android 7) can run too.
        val hasChannels = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        if (hasChannels) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "VPN", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val pi = PendingIntent.getActivity(
            this,
            0,
            Intent(this, com.privatevpn.app.MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        @Suppress("DEPRECATION")
        val builder = if (hasChannels) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }
        return builder
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

    /** Returns 0 = could not connect, 1 = user stop, 2 = transport ended (rebuild). */
    private fun tcpRelayAttempt(relayPort: Int): Int {
        if (stopping) return 1
        val sock = java.net.Socket()
        // protect() BEFORE connect(): Android binds the socket to the network that is
        // default at protect() time. Protecting afterwards is a no-op for an already
        // connected socket, which is what left the transport pinned to dead WiFi.
        val protected = runCatching { protect(sock) }.getOrDefault(false)
        DiagnosticsLog.outerProtected = if (protected) "protect=ok" else "protect=false"
        val ok = try {
            sock.connect(java.net.InetSocketAddress(runHost, relayPort), TCP_CONNECT_TIMEOUT_MS)
            true
        } catch (e: Exception) {
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort connect fail: ${e.message}")
            runCatching { sock.close() }
            false
        }
        if (!ok) return 0
        // The outer socket is the thing that gets stranded when the underlying
        // network dies; its local address is the WiFi/cell address it is pinned to.
        DiagnosticsLog.outerDetail = "tcp-relay:$relayPort"
        DiagnosticsLog.outerLocal = safeAddr(sock)
        DiagnosticsLog.log(
            "hy-tcp:$relayPort socket protect=$protected local=${safeAddr(sock)} remote=${safeRemote(sock)}",
        )
        val sockFd = try {
            android.os.ParcelFileDescriptor.fromSocket(sock).detachFd()
        } catch (e: Exception) {
            runCatching { sock.close() }
            return 0
        }
        try {
            connectClient(relayPort, sockFd, tcp = true)
        } catch (e: Exception) {
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort connect failed: ${e.message}")
            runCatching { sock.close() }
            return 0
        }
        if (stopping) { runCatching { Mobile.stop() }; runCatching { sock.close() }; return 1 }
        try {
            // The TUN comes up only once a transport is actually connected: a pass
            // that cannot reach the server must not black-hole the device (that was
            // the old behaviour, and it kept the user offline during long backoffs).
            val tunFd = ensureTun().fd.toLong()
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UP via TCP relay $relayPort tun=$tunFd")
            rememberTransport("tcp:$relayPort")
            DiagnosticsLog.transport = "hy-tcp:$relayPort"
            DiagnosticsLog.relayConnected = true
            if (!stopping) reportUp()
            DiagnosticsLog.log("hy-tcp:$relayPort serve() start")
            Mobile.serve(tunFd, HY_MTU.toLong(), HY_TUN_IPV4, HY_TUN_IPV6)
            return serveOutcome("hy-tcp:$relayPort serve() returned")
        } catch (e: Exception) {
            if (e.message?.contains("already running") == true) throw e
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort serve failed: ${e.message}")
            return serveOutcome("hy-tcp:$relayPort serve() threw: ${e.message}")
        } finally {
            DiagnosticsLog.relayConnected = false
            DiagnosticsLog.transport = "none"
            runCatching { sock.close() }
        }
    }

    /** Direct UDP attempt (native QUIC — fast path when UDP is not blocked). */
    private fun udpAttempt(port: Int): Int {
        if (stopping) return 1
        val ds = java.net.DatagramSocket()
        // Same ordering rule as the TCP relay: bind to the current underlying
        // network before any packet leaves the socket.
        val protected = runCatching { protect(ds) }.getOrDefault(false)
        DiagnosticsLog.outerProtected = if (protected) "protect=ok" else "protect=false"
        val sockFd = try {
            android.os.ParcelFileDescriptor.fromDatagramSocket(ds).detachFd()
        } catch (e: Exception) {
            runCatching { ds.close() }
            return 0
        }
        DiagnosticsLog.outerDetail = "udp:$port"
        try {
            connectClient(port, sockFd, tcp = false)
        } catch (e: Exception) {
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UDP $runHost:$port connect failed: ${e.message}")
            runCatching { ds.close() }
            return 0
        }
        if (stopping) { runCatching { Mobile.stop() }; runCatching { ds.close() }; return 1 }
        try {
            DiagnosticsLog.outerLocal = safeAddr(ds)
            DiagnosticsLog.log(
                "hy-udp:$port protect=$protected local=${safeAddr(ds)} remote=$runHost:$port",
            )
            val tunFd = ensureTun().fd.toLong()
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UP via UDP $runHost:$port tun=$tunFd")
            rememberTransport("udp:$port")
            DiagnosticsLog.transport = "hy-udp:$port"
            if (!stopping) reportUp()
            DiagnosticsLog.log("hy-udp:$port serve() start")
            Mobile.serve(tunFd, HY_MTU.toLong(), HY_TUN_IPV4, HY_TUN_IPV6)
            return serveOutcome("hy-udp:$port serve() returned")
        } catch (e: Exception) {
            if (e.message?.contains("already running") == true) throw e
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UDP $runHost:$port serve failed: ${e.message}")
            return serveOutcome("hy-udp:$port serve() threw: ${e.message}")
        } finally {
            DiagnosticsLog.transport = "none"
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
        val tun = builder.establish() ?: throw IllegalStateException("establish failed")
        DiagnosticsLog.log(
            "vpn: establish ok tun=${tun.fd} underlying=" + runCatching { underlyingSummary() }.getOrDefault("?"),
        )
        return tun
    }

    /**
     * The TUN is created once and reused for the whole session, including across
     * transport rebuilds (a rebuild then never lets traffic escape unprotected).
     */
    private fun ensureTun(): ParcelFileDescriptor {
        tun?.let { return it }
        val created = establish()
        tun = created
        applyUnderlyingNetwork()
        return created
    }

    private fun closeTun() {
        runCatching { tun?.close() }
        tun = null
    }

    /**
     * Tells Android which network the tunnel rides on — the same call the official
     * WireGuard client makes. Without it the VPN keeps the underlying network it
     * was established with, so a WiFi -> mobile-data handover is not applied.
     */
    private fun applyUnderlyingNetwork() {
        val net = networkMonitor?.underlyingNetwork()
        val label = net?.let { networkMonitor?.describe(it) } ?: "null"
        val ok = runCatching {
            setUnderlyingNetworks(if (net != null) arrayOf(net) else null)
        }.getOrDefault(false)
        DiagnosticsLog.log("vpn: setUnderlyingNetworks($label) -> $ok")
    }

    /**
     * Opens the Go client on a fresh socket. A rebuild stops the client first, so
     * the bind can still be settling: retry once instead of failing the pass.
     */
    private fun connectClient(port: Int, sockFd: Int, tcp: Boolean) {
        repeat(2) { attempt ->
            try {
                Mobile.connect(
                    runHost, port.toLong(), HY_PASSWORD, HY_OBFS_PASSWORD,
                    sockFd.toLong(), tcp, HY_UP_KBPS.toLong(), HY_DOWN_KBPS.toLong(),
                )
                return
            } catch (e: Exception) {
                if (e.message?.contains("already running") == true && attempt == 0) {
                    DiagnosticsLog.warn("client still stopping after transport teardown -> retry in ${CLIENT_RESTART_WAIT_MS}ms")
                    runCatching { Mobile.stop() }
                    Thread.sleep(CLIENT_RESTART_WAIT_MS)
                } else {
                    throw e
                }
            }
        }
    }

    /** Notifies the UI layer that the tunnel is really up (clears fake state). */
    private fun reportUp() {
        DiagnosticsLog.tunnelUp = true
        DiagnosticsLog.log("tunnel: UP (${DiagnosticsLog.transport})")
        try {
            val app = application as VPNFlowApp
            app.vpnManager.onHysteriaUp()
        } catch (_: Exception) {
        }
    }

    /** UI: we are (re)trying to bring the tunnel up. */
    private fun reportReconnecting() {
        DiagnosticsLog.tunnelUp = false
        DiagnosticsLog.warn("tunnel: reconnecting / not serving")
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
        DiagnosticsLog.tunnelUp = false
        DiagnosticsLog.log("service: onDestroy")
        networkMonitor?.stop()
        networkMonitor = null
        probeThread = null
        closeTun()
        runCatching { stopForeground(Service.STOP_FOREGROUND_REMOVE) }
        android.util.Log.e("VPNFLOW_DEBUG", "hysteria: service onDestroy -> Mobile.stop()")
        // Ask the Go client to stop; Start() (blocked on another thread) returns.
        try { Mobile.stop() } catch (_: Exception) {}
        super.onDestroy()
    }

    /**
     * Every [PROBE_INTERVAL_MS] logs the network + transport state and checks that
     * the relay is still reachable through the CURRENT underlying network. A
     * tunnel that is up while the relay is silent/unreachable is exactly the
     * "connected but no internet" signature.
     */
    private fun startProbeLoop() {
        if (probeThread != null) return
        probeThread = Thread {
            var tick = 0
            while (!stopping) {
                try {
                    Thread.sleep(PROBE_INTERVAL_MS)
                } catch (_: InterruptedException) {
                    return@Thread
                }
                if (stopping) return@Thread
                tick++
                val rxSilenceSec = if (DiagnosticsLog.relayLastRxAt > 0) {
                    (System.currentTimeMillis() - DiagnosticsLog.relayLastRxAt) / 1000
                } else {
                    -1L
                }
                DiagnosticsLog.log(
                    "probe#$tick transport=${DiagnosticsLog.transport} tunnelUp=${DiagnosticsLog.tunnelUp} " +
                        "wgRelayConnected=${DiagnosticsLog.relayConnected} wgRelayRx=${DiagnosticsLog.relayRxBytes}B " +
                        "wgRelayTx=${DiagnosticsLog.relayTxBytes}B lastRx=" +
                        (if (rxSilenceSec >= 0) "${rxSilenceSec}s ago" else "never") +
                        " outer=${DiagnosticsLog.outerLocal}/${DiagnosticsLog.outerProtected} " +
                        "| " + (networkMonitor?.snapshot() ?: "net=?"),
                )
                if (DiagnosticsLog.tunnelUp && rxSilenceSec > RELAY_SILENCE_WARN_SEC) {
                    DiagnosticsLog.warn(
                        "probe#$tick TUNNEL UP BUT NO TRAFFIC for ${rxSilenceSec}s " +
                            "(stale transport after a network change?)",
                    )
                }
                DiagnosticsLog.log("probe#$tick vpn underlying=${underlyingSummary()}")
                probeRelayReachable()
                probeThroughTunnel()
            }
        }.apply { isDaemon = true; name = "vpn-diagnostics-probe" }.also { it.start() }
    }

    /** Cheap TCP reachability check of the relay through the current network. */
    private fun probeRelayReachable() {
        val started = System.currentTimeMillis()
        var ok = false
        var detail = ""
        try {
            val socket = java.net.Socket()
            try {
                protect(socket)
                socket.connect(java.net.InetSocketAddress(Config.RELAY_HOST, Config.RELAY_PORT), 2500)
                ok = true
            } finally {
                runCatching { socket.close() }
            }
        } catch (e: Exception) {
            detail = " (${e.javaClass.simpleName}: ${e.message})"
        }
        DiagnosticsLog.log(
            "probe: relay ${Config.RELAY_HOST}:${Config.RELAY_PORT} reachable=$ok " +
                "in ${System.currentTimeMillis() - started}ms$detail",
        )
    }

    /**
     * Real end-to-end check through the tunnel. A bare TCP connect proves nothing
     * here: the tunnel's userspace TCP stack answers the SYN locally, so a connect
     * to a remote host returns ok=true in ~1ms even when the transport is dead
     * (observed on device, 1.2.5). So we write a real HTTP request and require
     * response bytes, and (separately) send a real DNS query — a dead transport
     * leaves the request unanswered until the read timeout expires.
     */
    private fun probeThroughTunnel() {
        val started = System.currentTimeMillis()
        val http = try {
            java.net.Socket().use { s ->
                s.connect(java.net.InetSocketAddress("1.1.1.1", 80), 4000)
                s.soTimeout = 6000
                s.getOutputStream().apply {
                    write("GET / HTTP/1.0\r\nHost: one.one.one.one\r\nConnection: close\r\n\r\n".toByteArray())
                    flush()
                }
                val buf = ByteArray(32)
                val n = s.getInputStream().read(buf)
                if (n > 0) "ok=${String(buf, 0, n).lineSequence().first().trim()}" else "eof"
            }
        } catch (e: Exception) {
            "FAIL ${e.javaClass.simpleName}: ${e.message}"
        }
        DiagnosticsLog.log(
            "probe: THROUGH TUNNEL http 1.1.1.1:80 $http in ${System.currentTimeMillis() - started}ms",
        )
        val dnsStart = System.currentTimeMillis()
        val dns = dnsThroughTunnel("example.com")
        DiagnosticsLog.log(
            "probe: THROUGH TUNNEL dns 1.1.1.1:53 $dns in ${System.currentTimeMillis() - dnsStart}ms",
        )
    }

    /** Sends a real A query through the tunnel and reports the answer. */
    private fun dnsThroughTunnel(host: String): String = try {
        java.net.DatagramSocket().use { ds ->
            ds.soTimeout = 4000
            val query = buildDnsQuery(host)
            ds.send(
                java.net.DatagramPacket(
                    query, query.size, java.net.InetAddress.getByName("1.1.1.1"), 53,
                ),
            )
            val buf = ByteArray(512)
            val resp = java.net.DatagramPacket(buf, buf.size)
            ds.receive(resp)
            val answers = ((buf[6].toInt() and 0xff) shl 8) or (buf[7].toInt() and 0xff)
            "answers=$answers ${firstARecord(buf, resp.length)}"
        }
    } catch (e: Exception) {
        "FAIL ${e.javaClass.simpleName}: ${e.message}"
    }

    private fun buildDnsQuery(host: String): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        out.write(byteArrayOf(0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0))
        for (label in host.split('.')) {
            out.write(label.length)
            out.write(label.toByteArray())
        }
        out.write(0)
        out.write(byteArrayOf(0x00, 0x01, 0x00, 0x01)) // A, IN
        return out.toByteArray()
    }

    /** Walks the answer section of a single-question response and prints the A record. */
    private fun firstARecord(buf: ByteArray, len: Int): String {
        var i = 12
        while (i < len && buf[i].toInt() != 0) { // skip QNAME labels
            if (buf[i].toInt() and 0xc0 == 0xc0) { i += 2; break }
            i += (buf[i].toInt() and 0xff) + 1
        }
        if (i < len && buf[i].toInt() == 0) i++
        i += 4 // qtype + qclass
        if (i + 12 > len) return "no-answer-record"
        i += 2 // name pointer
        val type = ((buf[i].toInt() and 0xff) shl 8) or (buf[i + 1].toInt() and 0xff)
        i += 8 // type + class + ttl
        val rdlen = ((buf[i].toInt() and 0xff) shl 8) or (buf[i + 1].toInt() and 0xff)
        i += 2
        if (type != 1 || rdlen != 4 || i + 4 > len) return "type=$type"
        return "ip=${buf[i].toInt() and 0xff}.${buf[i + 1].toInt() and 0xff}." +
            "${buf[i + 2].toInt() and 0xff}.${buf[i + 3].toInt() and 0xff}"
    }

    /** Which network Android currently treats as the tunnel's underlying transport. */
    private fun underlyingSummary(): String {
        val net = networkMonitor?.underlyingNetwork()
        return "underlying=" + (net?.let { networkMonitor?.describe(it) } ?: "none")
    }

    private fun safeAddr(socket: java.net.Socket): String =
        runCatching { socket.localSocketAddress?.toString() ?: "-" }.getOrDefault("-")

    private fun safeRemote(socket: java.net.Socket): String =
        runCatching { socket.remoteSocketAddress?.toString() ?: "-" }.getOrDefault("-")

    private fun safeAddr(socket: java.net.DatagramSocket): String =
        runCatching {
            val a = socket.localSocketAddress as? java.net.InetSocketAddress
            if (a == null || a.isUnresolved) "unbound" else "${a.address?.hostAddress}:${a.port}"
        }.getOrDefault("-")

    companion object {
        /** Probe cadence: frequent enough to catch a handover, cheap enough to keep. */
        const val PROBE_INTERVAL_MS = 15_000L
        /** Warn when the tunnel claims to be up but nothing came back for this long. */
        const val RELAY_SILENCE_WARN_SEC = 45L
        const val TCP_CONNECT_TIMEOUT_MS = 2500
        const val RETRY_BACKOFF_START_MS = 3000L
        const val RETRY_BACKOFF_MAX_MS = 30000L
        /** Pause after a transport teardown so the Go client releases its socket. */
        const val REBUILD_SETTLE_MS = 700L
        /** Wait before retrying a connect that hit "already running". */
        const val CLIENT_RESTART_WAIT_MS = 800L
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
