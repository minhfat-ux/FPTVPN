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

    /** All known node hosts, selected node first: rotated when one is unreachable. */
    private var hosts: List<String> = listOf(DEFAULT_HOST)
    private var hostIndex = 0

    /** host -> node id, dùng để báo lên coordinator node nào thật sự tới được. */
    private var hostIds: Map<String, String> = emptyMap()

    /**
     * host -> relay WS của CHÍNH node đó, do control plane cấp theo từng node.
     *
     * Vì sao không dùng một hằng số chung cho mọi node: một relay chỉ hạ cánh ở MỘT
     * node. Client được cấp khoá của node A mà đi qua relay của node B thì handshake
     * mã hoá tới khoá A nhưng tới `wg0` của B — B không giải được và không có peer
     * này, nên WireGuard im lặng tuyệt đối, log chỉ thấy "gửi hoài không có gì về".
     * Đó đúng là lỗi "connected nhưng không có mạng" trên iPad 13/09.
     */
    private var hostRelays: Map<String, String> = emptyMap()
    /**
     * Lượt thử trước đã thất bại hoàn toàn ⇒ lần này thử đường WS (Cloudflare) TRƯỚC.
     * Trên data di động TQ mọi cổng trực tiếp đều chết, thử chúng trước chỉ làm
     * 'connecting' kéo dài thêm ~10s mà không có cơ hội thành công nào.
     */
    @Volatile private var preferWsFirst = false

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

    /**
     * Thông số brutal của lượt thử ĐANG chạy. Mặc định là đường trực tiếp; lượt thử
     * qua WS relay hạ xuống (xem wsRelayAttempt) vì đường đó đi qua 2 chặng.
     * Cùng kiểu với runHost: đổi quanh lời gọi rồi trả lại như cũ.
     */
    @Volatile private var attemptUpKbps = HY_UP_KBPS
    @Volatile private var attemptDownKbps = HY_DOWN_KBPS

    /**
     * Token của lượt thử đang chạy. Timer trần thời gian của lượt cũ thấy token đổi
     * thì tự thoát, nên không cần giữ tham chiếu Thread để huỷ.
     */
    @Volatile private var attemptToken = 0

    /**
     * Lượt thử hiện tại đã vượt trần thời gian bắt tay. Đọc trong serveOutcome() để
     * phân biệt "chưa bao giờ lên" (đi tiếp đường khác) với "vừa chết" (dựng lại).
     */
    @Volatile private var attemptTimedOut = false

    /** Số lần probe liên tiếp thấy tunnel UP mà không có gói nào qua được. */
    @Volatile private var deadProbes = 0

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
        val extraHosts = intent?.getStringArrayListExtra(EXTRA_HOSTS)?.filter { it.isNotBlank() }.orEmpty()
        hosts = (listOf(runHost) + extraHosts).distinct()
        hostIndex = 0
        // host -> node id, để báo health về coordinator (xem reportNodeHealth).
        hostIds = intent?.getStringArrayListExtra(EXTRA_HOST_IDS)?.chunked(2)
            ?.mapNotNull { pair -> if (pair.size == 2) pair[0] to pair[1] else null }
            ?.toMap()
            .orEmpty()
        // host -> relay WS của node đó; "" nghĩa là node không khai relay.
        hostRelays = intent?.getStringArrayListExtra(EXTRA_HOST_RELAYS)?.chunked(2)
            ?.mapNotNull { pair -> if (pair.size == 2) pair[0] to pair[1] else null }
            ?.toMap()
            .orEmpty()
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
        var failedPasses = 0
        try {
            while (!stopping) {
                val outcome = oneConnectPass()
                when (outcome) {
                    1 -> return // user stop
                    2 -> { // transport dropped or was rebuilt for a network change
                        everUp = true
                        failedPasses = 0
                          preferWsFirst = false
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
                        failedPasses++
                        preferWsFirst = true
                        // A node whose IP is blocked (GFW) never answers on any port, so
                        // after a couple of dead passes move on to the next node instead
                        // of retrying a black hole forever.
                        if (failedPasses >= NODE_FAILOVER_AFTER_PASSES && hosts.size > 1) {
                            val previous = runHost
                            hostIndex = (hostIndex + 1) % hosts.size
                            runHost = hosts[hostIndex]
                            failedPasses = 0
                            backoffMs = RETRY_BACKOFF_START_MS
                            DiagnosticsLog.warn("node: $previous unreachable -> switching to $runHost")
                            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: node $previous unreachable -> $runHost")
                            reportNodeHealth(previous, reachable = false, reason = "unreachable from this network")
                        }
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
     *  2 = the transport ended (network change or peer loss) and must be rebuilt,
     *  0 = the attempt never came up within its own budget, so try the next path.
     *
     * Returning 1 for an unexpected end was a bug: the service reported "stopped
     * cleanly" and shut down while the UI still showed Connected.
     */
    private fun serveOutcome(how: String): Int {
        if (stopping) return 1
        // Hết hạn bắt tay: client bị chính armAttemptBudget() dừng, nên đây KHÔNG phải
        // "transport vừa chết" mà là "chưa bao giờ lên" — phải đi tiếp đường khác
        // trong cùng lượt, không được dựng lại đúng đường vừa thất bại.
        if (attemptTimedOut) {
            DiagnosticsLog.warn("attempt: $how -> hết hạn bắt tay, thử đường khác")
            return 0
        }
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

    /**
     * One pass: the transport that worked last time, then the cheapest direct path,
     * then the WS relay, and only then the remaining direct ports.
     *
     * Thứ tự này để người bị chặn IP không phải chờ vô ích: khi GFW chặn IP node thì
     * MỌI cổng trực tiếp đều chết, nên thử hết 2 TCP relay + 3 UDP rồi mới tới WS chỉ
     * làm mất ~20s mà không có cơ hội thành công nào. Người không bị chặn vẫn đi đường
     * cũ trong <1s vì đường trực tiếp thử trước.
     */
    private fun oneConnectPass(): Int {
        val preferred = lastGoodTransport()
        if (preferred != null) {
            val outcome = preferredAttempt(preferred)
            if (outcome != 0) return outcome
        }
        // Đường trực tiếp vừa thử ở lượt ưu tiên thì bỏ qua, đừng thử lại trong cùng
        // lượt: trường hợp IP node bị chặn GIỮA phiên (đúng sự cố 13/09) thì
        // preference cũ trỏ vào đường đã chết, thử lại chắc chắn cùng kết quả và chỉ
        // làm người dùng chờ thêm.
        // KHÔNG áp dụng cho "ws": mở WS có thể hỏng tạm thời (Funnel/Cloudflare chớp),
        // nên vẫn cho nó thử lại — đây là đường duy nhất còn sống khi IP bị chặn.
        val triedDirect = preferred?.takeIf { it != "ws" }
        // Lượt trước chết hết: thử WS trước, khỏi tốn thời gian cho cổng đã chứng minh là chết.
        val wsAlreadyTried = preferWsFirst
        if (wsAlreadyTried) {
            val ws = wsRelayAttempt()
            if (ws != 0) return ws
        }
        for (relayPort in HY_TCP_RELAY_PORTS) {
            if (triedDirect == "tcp:$relayPort") continue
            val outcome = tcpRelayAttempt(relayPort)
            if (outcome != 0) return outcome
        }
        // Một cổng UDP trực tiếp: đây là đường nhanh nhất khi không bị chặn.
        if (triedDirect != "udp:${HY_PORTS[0]}") {
            val primaryUdp = udpAttempt(HY_PORTS[0])
            if (primaryUdp != 0) return primaryUdp
        }
        // Đường duy nhất còn sống khi IP node bị chặn — đi qua hạ tầng dùng chung.
        if (!wsAlreadyTried) {
            val ws = wsRelayAttempt()
            if (ws != 0) return ws
        }
        // WS cũng không mở được: thử nốt các cổng UDP trực tiếp còn lại (mạng chặn UDP
        // không đều, hoặc Funnel/Cloudflare tạm lỗi).
        for (port in HY_PORTS.drop(1)) {
            if (triedDirect == "udp:$port") continue
            val outcome = udpAttempt(port)
            if (outcome != 0) return outcome
        }
        return 0
    }

    /**
     * Đường dữ liệu qua WebSocket: Hysteria trỏ vào bridge local, bridge gửi datagram
     * qua WSS tới Cloudflare Tunnel rồi bung ra UDP tới Hysteria server của node.
     */
    private fun wsRelayAttempt(): Int {
        if (stopping) return 1
        // Đường WS cần thời gian mở cầu + bắt tay WG bên trong, dài hơn hẳn đường trực tiếp.
        // Phải ARM NGAY tại đây: nếu để watchdog 4s của lượt trực tiếp trước còn hiệu lực,
        // nó sẽ Mobile.stop() giữa lúc WS vừa mở -> app quay vòng "connecting" mãi.
        armAttemptBudget(WS_OPEN_WAIT_MS + WS_ATTEMPT_UP_BUDGET_MS)
        // Relay phải là của CHÍNH node đang dùng. `runHost` ở đây vẫn là host node
        // (nó chỉ bị đổi thành 127.0.0.1 bên dưới), nên tra theo nó.
        val relayForNode = hostRelays[runHost]?.takeIf { it.isNotBlank() }
        val relayUrl = relayForNode ?: WS_RELAY_URL
        if (relayForNode == null) {
            // Nói rõ là đang ĐOÁN. Đoán sai node thì handshake im lặng hoàn toàn, không
            // có lỗi nào để lần ra — đúng loại lỗi đã làm mất cả buổi trên iPad.
            DiagnosticsLog.warn(
                "ws-relay: node $runHost không khai relay URL -> dùng mặc định $relayUrl " +
                    "(đoán; nếu relay này dẫn tới node khác thì handshake sẽ im lặng)",
            )
        } else {
            DiagnosticsLog.log("ws-relay: node $runHost -> relay $relayUrl (control plane cấp)")
        }
        val bridge = WSRelayBridge(
            url = relayUrl,
            // Dùng chung protectRelaySocket: socket WS của OkHttp cũng là java.net.Socket
            // nên trước đây cũng bị protect() trả false => bị hút vào tunnel => Connection
            // reset ngay sau khi TUN lên. Log kèm để lần sau không phải suy đoán.
            protector = { sock -> protectRelaySocket(sock, "ws-relay") },
            onDead = { reason ->
                // Mất cầu WS giữa lúc tunnel đang chạy: Hysteria vẫn giữ socket UDP
                // tới bridge nên serve() KHÔNG tự trả về. Phải dừng client Go để
                // runTunnel() nhận outcome 2 và dựng lại transport (kèm WS mới).
                // Không làm việc này thì tunnel nằm "UP" mà không gói nào đi đâu cả.
                if (!stopping) {
                    DiagnosticsLog.warn("ws-relay: $reason -> dừng client để dựng lại transport")
                    runCatching { Mobile.stop() }
                }
            },
        )
        if (!bridge.start()) return 0
        DiagnosticsLog.log("ws-relay: thử transport qua Cloudflare (local port ${bridge.localPort})")
        // Đợi WS mở (tối đa ~6s) để lần connect đầu không bị mất gói.
        val deadline = System.currentTimeMillis() + 15000
        while (!bridge.connected && System.currentTimeMillis() < deadline && !stopping) {
            Thread.sleep(200)
        }
        if (!bridge.connected) {
            DiagnosticsLog.warn("ws-relay: chưa mở được WS, bỏ qua")
            bridge.stop()
            return 0
        }
        val previousHost = runHost
        val previousUp = attemptUpKbps
        val previousDown = attemptDownKbps
        runHost = "127.0.0.1"
        // Đường này đi qua 2 chặng (hạ tầng dùng chung + node) nên brutal phải khai
        // thấp hơn đường trực tiếp, nếu không server pace theo số khai và tự gây nghẽn.
        attemptUpKbps = HY_RELAY_UP_KBPS
        attemptDownKbps = HY_RELAY_DOWN_KBPS
        return try {
            // Cổng phải là cổng BRIDGE đang nghe (127.0.0.1:<localPort>), không phải
            // cổng Hysteria phía server — Hysteria dial vào bridge, bridge mới đẩy
            // datagram qua WSS.
            // Budget dài hơn đường trực tiếp: handshake qua relay chậm hơn thật.
            val outcome = udpAttempt(bridge.localPort, WS_ATTEMPT_UP_BUDGET_MS)
            // Nhớ để lượt sau (và lần mở app sau) đi thẳng qua WS, không phí thời gian
            // thử UDP/TCP trực tiếp vốn đã chết khi IP node bị chặn.
            if (outcome != 0) rememberTransport("ws")
            outcome
        } finally {
            runHost = previousHost
            attemptUpKbps = previousUp
            attemptDownKbps = previousDown
            bridge.stop()
        }
    }

    /** "tcp:8443" / "udp:8443" — the transport stored by the last successful run. */
    private fun preferredAttempt(pref: String): Int {
        val parts = pref.split(":")
        if (parts.size != 2) return 0
        if (parts[0] == "ws") return wsRelayAttempt()
        val port = parts[1].toIntOrNull() ?: return 0
        return if (parts[0] == "tcp") tcpRelayAttempt(port) else udpAttempt(port)
    }

    /**
     * protect() cho socket TCP của đường relay, có tạo fd trước.
     *
     * Vì sao cần hàm này thay vì gọi protect() thẳng — đo trên Galaxy Z Fold5 (Android 16):
     * `protect(java.net.Socket)` trả về **false 8/8 lần**, trong khi
     * `protect(java.net.DatagramSocket)` trả về true. Hậu quả: socket TCP của đường relay
     * đi XUYÊN QUA chính tunnel (local address đo được = IP của TUN, 100.100.100.101),
     * rồi `connect()` trả về true giả tạo vì userspace stack của tunnel tự trả lời SYN.
     * Nghĩa là mọi đường TCP relay đều chết, và socket WS của OkHttp cũng dùng chính
     * protector này nên bị `Connection reset` ngay sau khi TUN lên.
     *
     * Nguyên nhân: `new java.net.Socket()` của OpenJDK tạo fd MUỘN (ở lần dùng đầu tiên),
     * mà protect() cần fd có thật để đánh dấu; DatagramSocket tạo fd ngay trong hàm tạo nên
     * không dính lỗi này. Cách sửa: bind() vào cổng 0 để fd tồn tại TRƯỚC khi protect().
     * bind() chưa gửi gói nào nên vẫn đúng yêu cầu "protect trước connect".
     *
     * Log cả hai lần thử (kèm ngoại lệ) vì đây đúng là loại lỗi im lặng: protect() trả false
     * chứ không ném, nên nếu chỉ nhìn "không có exception" thì tưởng đã bảo vệ xong.
     *
     * @return true nếu socket đã được bảo vệ (đi thẳng ra mạng nền, không qua tunnel).
     */
    private fun protectRelaySocket(sock: java.net.Socket, tag: String): Boolean {
        val first = runCatching { protect(sock) }
        if (first.getOrDefault(false)) {
            DiagnosticsLog.log("protect[$tag]: ok ngay (fd đã có sẵn)")
            return true
        }
        // Lần 1 hỏng: nhiều khả năng fd chưa tồn tại. Tạo fd rồi thử lại.
        val bindError = runCatching { sock.bind(java.net.InetSocketAddress(0)) }.exceptionOrNull()
        val second = runCatching { protect(sock) }
        val secondOk = second.getOrDefault(false)
        fun why(r: Result<Boolean>) = r.exceptionOrNull()?.let { " (${it.javaClass.simpleName}: ${it.message})" } ?: ""
        DiagnosticsLog.log(
            "protect[$tag]: lần 1=false${why(first)}, bind=>" +
                (if (bindError == null) "ok" else "${bindError.javaClass.simpleName}: ${bindError.message}") +
                ", lần 2=$secondOk${why(second)}",
        )
        if (!secondOk) {
            DiagnosticsLog.warn(
                "protect[$tag]: KHÔNG protect được — socket này sẽ đi xuyên qua tunnel và chết " +
                    "(dấu hiệu: local address = IP của TUN)",
            )
        }
        return secondOk
    }

    /** Returns 0 = could not connect, 1 = user stop, 2 = transport ended (rebuild). */
    private fun tcpRelayAttempt(relayPort: Int): Int {
        if (stopping) return 1
        val sock = java.net.Socket()
        // protect() PHẢI trước connect() để socket được ghim vào mạng nền hiện tại thay vì
        // đi vào tunnel. Nhưng protect() trước connect chỉ ăn nếu socket đã có fd — xem
        // protectRelaySocket() (trước đây gọi protect() trần nên luôn trả false).
        val protected = protectRelaySocket(sock, "tcp-relay:$relayPort")
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
        // Trần thời gian cho giai đoạn bắt tay — xem armAttemptBudget().
        armAttemptBudget(ATTEMPT_UP_BUDGET_MS)
        try {
            connectClient(relayPort, sockFd, tcp = true)
        } catch (e: Exception) {
            disarmAttemptBudget()
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: TCP relay $relayPort connect failed: ${e.message}")
            runCatching { sock.close() }
            return 0
        }
        if (stopping) { disarmAttemptBudget(); runCatching { Mobile.stop() }; runCatching { sock.close() }; return 1 }
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
            disarmAttemptBudget()
            DiagnosticsLog.relayConnected = false
            DiagnosticsLog.transport = "none"
            runCatching { sock.close() }
        }
    }

    /** Direct UDP attempt (native QUIC — fast path when UDP is not blocked). */
    private fun udpAttempt(port: Int, upBudgetMs: Long = ATTEMPT_UP_BUDGET_MS): Int {
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
        // Trần thời gian cho giai đoạn bắt tay — xem armAttemptBudget().
        armAttemptBudget(upBudgetMs)
        try {
            connectClient(port, sockFd, tcp = false)
        } catch (e: Exception) {
            disarmAttemptBudget()
            android.util.Log.e("VPNFLOW_DEBUG", "hysteria: UDP $runHost:$port connect failed: ${e.message}")
            runCatching { ds.close() }
            return 0
        }
        if (stopping) { disarmAttemptBudget(); runCatching { Mobile.stop() }; runCatching { ds.close() }; return 1 }
        try {
            DiagnosticsLog.outerLocal = safeAddr(ds)
            DiagnosticsLog.log(
                "hy-udp:$port protect=$protected local=${safeAddr(ds)} remote=$runHost:$port " +
                    "budget=${upBudgetMs}ms up=${attemptUpKbps}kbps down=${attemptDownKbps}kbps",
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
            disarmAttemptBudget()
            DiagnosticsLog.transport = "none"
            runCatching { ds.close() }
        }
    }

    private fun establish(): ParcelFileDescriptor {
        val builder = Builder()
        builder.setSession("VPNFlow Hysteria")
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
                    sockFd.toLong(), tcp, attemptUpKbps.toLong(), attemptDownKbps.toLong(),
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

    /**
     * Đặt trần thời gian cho giai đoạn bắt tay của lượt thử hiện tại.
     *
     * Vì sao cần: client Go nằm trong `hysteria.aar` đóng sẵn, không có tham số
     * timeout handshake để truyền từ Kotlin. Khi IP node bị GFW chặn thì mọi cổng
     * trực tiếp đều không trả lời, mỗi lần thử cứ treo tới hạn nội bộ của QUIC nên
     * cả lượt đi mất hàng chục giây mới tới được WS relay — với người dùng là "quay
     * tít". Hết trần thì tự dừng client Go: `serve()` trả về, lượt thử được tính là
     * thất bại (serveOutcome đọc attemptTimedOut) và đi tiếp đường khác.
     *
     * Timer tự vô hiệu theo TOKEN chứ không đọc cờ toàn cục: token bị đổi khi
     * `reportUp()` (tunnel đã lên, hết giai đoạn bắt tay) hoặc `disarmAttemptBudget()`
     * (lượt thử kết thúc). Nhờ vậy nó không thể cắt một tunnel đang chạy thật, và
     * cũng không phụ thuộc vào việc cờ tunnelUp có được dọn đúng lúc hay không.
     */
    private fun armAttemptBudget(budgetMs: Long) {
        val token = ++attemptToken
        attemptTimedOut = false
        Thread {
            try {
                Thread.sleep(budgetMs)
            } catch (_: InterruptedException) {
                return@Thread
            }
            if (token != attemptToken) return@Thread // tunnel đã lên, hoặc lượt thử đã kết thúc
            if (stopping) return@Thread
            attemptTimedOut = true
            DiagnosticsLog.warn("attempt: quá ${budgetMs}ms chưa lên -> dừng client để thử đường khác")
            runCatching { Mobile.stop() }
        }.apply { isDaemon = true; name = "hy-attempt-budget" }.start()
    }

    /** Lượt thử đã kết thúc: vô hiệu hoá timer của nó. */
    private fun disarmAttemptBudget() {
        attemptToken++
    }

    /** Notifies the UI layer that the tunnel is really up (clears fake state). */
    private fun reportUp() {
        // Bắt tay xong: hết giai đoạn bị tính trần thời gian, nếu không timer sẽ cắt
        // đúng cái tunnel vừa dựng được.
        disarmAttemptBudget()
        DiagnosticsLog.tunnelUp = true
        DiagnosticsLog.log("tunnel: UP (${DiagnosticsLog.transport})")
        reportNodeHealth(runHost, reachable = true)
        try {
            val app = application as VPNFlowApp
            app.vpnManager.onHysteriaUp()
        } catch (_: Exception) {
        }
    }

    /**
     * Báo cho coordinator biết node này tới được hay không (best-effort, chạy nền).
     * Đây là tín hiệu duy nhất phát hiện được node bị GFW chặn: server tự kiểm tra
     * thì vẫn thấy node "sống" vì nó trả lời bình thường từ Việt Nam.
     */
    private fun reportNodeHealth(host: String, reachable: Boolean, reason: String? = null) {
        val id = hostIds[host] ?: return
        Thread {
            runCatching {
                kotlinx.coroutines.runBlocking {
                    com.privatevpn.app.api.ControlAPIClient().reportNodeHealth(id, reachable, reason)
                }
            }
        }.apply { isDaemon = true }.start()
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
                // Watchdog: tunnel "UP" mà gói thật không đi được thì phải dựng lại
                // transport, không chỉ ghi log. Trước đây chỗ này chỉ warn nên tunnel
                // nằm chết ở trạng thái connected cho tới khi người dùng tự tắt/bật.
                val tunnelOk = probeThroughTunnel()
                if (!DiagnosticsLog.tunnelUp) {
                    deadProbes = 0
                } else if (tunnelOk) {
                    deadProbes = 0
                } else {
                    deadProbes++
                    if (deadProbes >= DEAD_PROBE_LIMIT) {
                        DiagnosticsLog.warn(
                            "probe#$tick tunnel UP nhưng $deadProbes lần liên tiếp không có gói nào qua " +
                                "-> dừng client để dựng lại transport",
                        )
                        deadProbes = 0
                        // serve() trả về -> runTunnel() nhận outcome 2 và dựng lại
                        // (kèm transport/WS mới). TUN được giữ nên không rò rỉ gói.
                        runCatching { Mobile.stop() }
                    }
                }
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
                socket.connect(java.net.InetSocketAddress(runHost, Config.RELAY_PORT), 1000)
                ok = true
            } finally {
                runCatching { socket.close() }
            }
        } catch (e: Exception) {
            detail = " (${e.javaClass.simpleName}: ${e.message})"
        }
        DiagnosticsLog.log(
            "probe: relay $runHost:${Config.RELAY_PORT} reachable=$ok " +
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
     *
     * @return true nếu CÓ gói thật đi qua được (HTTP hoặc DNS). Chỉ tính là chết khi
     *   cả hai đều không trả lời: một trong hai có thể bị chặn riêng và như vậy không
     *   có nghĩa tunnel hỏng. Đây là tín hiệu cho watchdog ở startProbeLoop().
     */
    private fun probeThroughTunnel(): Boolean {
        val started = System.currentTimeMillis()
        var httpOk = false
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
                if (n > 0) {
                    httpOk = true
                    "ok=${String(buf, 0, n).lineSequence().first().trim()}"
                } else {
                    "eof"
                }
            }
        } catch (e: Exception) {
            "FAIL ${e.javaClass.simpleName}: ${e.message}"
        }
        DiagnosticsLog.log(
            "probe: THROUGH TUNNEL http 1.1.1.1:80 $http in ${System.currentTimeMillis() - started}ms",
        )
        val dnsStart = System.currentTimeMillis()
        val dns = dnsThroughTunnel("example.com")
        // dnsThroughTunnel trả "answers=<n> <record>" hoặc "FAIL ...": chỉ tính là
        // thông khi có bản ghi trả về thật.
        val dnsAnswers = dns.substringAfter("answers=", "").substringBefore(' ').toIntOrNull() ?: 0
        val dnsOk = dnsAnswers > 0
        DiagnosticsLog.log(
            "probe: THROUGH TUNNEL dns 1.1.1.1:53 $dns in ${System.currentTimeMillis() - dnsStart}ms",
        )
        return httpOk || dnsOk
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
        /**
         * Số lần probe liên tiếp thấy tunnel UP mà không có gói thật nào qua được thì
         * dựng lại transport. Để 2 lần (không phải 1) vì trên mạng di động TQ một cú
         * mất gói đơn lẻ vẫn xảy ra bình thường — dựng lại vì nó chỉ làm mạng chậm thêm.
         *
         * Thời gian phản ứng thật: mỗi vòng probe tốn PROBE_INTERVAL_MS (15s) cộng thời
         * gian đo, mà riêng probeThroughTunnel() có thể tốn tới ~14s khi transport chết
         * (HTTP connect 4s + read 6s, DNS 4s) — nên một vòng tới ~30s. Cần 2 vòng liên
         * tiếp => phát hiện trong khoảng ~30-60s, KHÔNG phải ~10s như handover mong
         * muốn. Đổi lại là không dương tính giả khi mạng chỉ mất gói một cú.
         *
         * Đường WS chết thì nhanh hơn nhiều vì bắt ngay qua onFailure ở WSRelayBridge;
         * watchdog này là lưới an toàn cho trường hợp WS vẫn "mở" nhưng relay âm thầm
         * nuốt gói. Muốn nhanh hơn: hạ PROBE_INTERVAL_MS, hoặc hạ timeout trong
         * probeThroughTunnel().
         */
        const val DEAD_PROBE_LIMIT = 2
        /**
         * Trần thời gian bắt tay của MỘT đường trực tiếp. Đường trực tiếp khi thông thì
         * lên trong <1s; quá ngần này nghĩa là cổng/IP đó không tới được.
         */
        const val ATTEMPT_UP_BUDGET_MS = 1_500L
        /**
         * Trần cho đường WS relay: phải đi qua 2 chặng nên handshake chậm hơn thật, cắt
         * sớm sẽ bỏ mất đúng đường duy nhất còn sống khi IP node bị chặn.
         */
        const val WS_ATTEMPT_UP_BUDGET_MS = 15_000L
        /** Trần thời gian chờ mở cầu WS (đi 2 chặng + TLS tới Cloudflare). */
        const val WS_OPEN_WAIT_MS = 15_000L
        /**
         * TCP connect tới relay. 2500ms là lãng phí: khi IP node bị chặn thì connect
         * không bao giờ xong, còn khi tới được thì RTT từ TQ chỉ vài chục ms.
         */
        const val TCP_CONNECT_TIMEOUT_MS = 1200
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

        /** All known node hosts, selected node first (see VPNManager.nodeHosts). */
        const val EXTRA_HOSTS = "hysteria_hosts"

        /** Cặp host,nodeId dẹt thành list để báo health về coordinator. */
        const val EXTRA_HOST_IDS = "hysteria_host_ids"

        /** Cặp host,relayUrl dẹt thành list — relay WS của TỪNG node. */
        const val EXTRA_HOST_RELAYS = "hysteria_host_relays"

        /** Dead passes before moving to the next node (a blocked IP never answers). */
        const val NODE_FAILOVER_AFTER_PASSES = 2
        const val DEFAULT_HOST = com.privatevpn.app.Config.HY_SERVER
        // legacy alias giữ nguyên cho các tham chiếu cũ (nếu có)
        const val HY_HOST = com.privatevpn.app.Config.HY_SERVER
        val HY_PORTS = com.privatevpn.app.Config.HY_PORTS
        const val HY_UP_KBPS = com.privatevpn.app.Config.HY_UP_KBPS
        const val HY_DOWN_KBPS = com.privatevpn.app.Config.HY_DOWN_KBPS
        /** Brutal CC hạ xuống cho đường WS relay (đi qua 2 chặng) — xem wsRelayAttempt. */
        const val HY_RELAY_UP_KBPS = com.privatevpn.app.Config.HY_RELAY_UP_KBPS
        const val HY_RELAY_DOWN_KBPS = com.privatevpn.app.Config.HY_RELAY_DOWN_KBPS

        /** Relay WS mặc định — chỉ dùng khi node không khai relay (xem wsRelayAttempt). */
        const val WS_RELAY_URL = com.privatevpn.app.Config.WS_RELAY_URL
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
