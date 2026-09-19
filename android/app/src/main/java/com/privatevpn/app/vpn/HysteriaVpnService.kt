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
    /**
     * Mang hien tai co phai di dong (metered) khong — dung de chon so khai bang thong.
     *
     * Mặc định **false** (coi như unmetered khi chưa biết gì). Trước đây mặc định là
     * true nên lượt thử ĐẦU TIÊN luôn khai số mobile, kể cả trên Wi-Fi: đo thật trên
     * Galaxy Z Fold5 (Wi-Fi khách sạn, `Metered hint: false`) tunnel khai 8000/12000
     * kbps nên bị kẹp ở trần 12 Mbps — raw 49,82 Mbps mà qua VPN chỉ 13,44 Mbps.
     * Giá trị thật do refreshMeteredState() chốt ở đầu mỗi lượt thử và mỗi lần đổi mạng.
     */
    @Volatile private var meteredNow = false
    @Volatile private var attemptUpKbps = HY_UP_KBPS
    @Volatile private var attemptDownKbps = HY_DOWN_KBPS

    /**
     * Số khai ĐỘNG của mạng hiện tại (có thể theo số đo thật) + lý do + khoá mạng — xem
     * BandwidthMemory. Phải giữ thành field vì (a) đường WS relay đọc lại để hạ số khai
     * xuống mức 2 chặng, (b) dòng log `bw:` phải in đúng con số đã truyền vào client Go.
     */
    @Volatile private var bwUpKbps = HY_UP_KBPS
    @Volatile private var bwDownKbps = HY_DOWN_KBPS
    @Volatile private var bwReason = BandwidthPolicy.REASON_PROFILE
    @Volatile private var bwKey = ""
    @Volatile private var bwDisplay = "?"
    @Volatile private var bwMeasuredKbps = 0
    @Volatile private var bwCeilKbps = 0
    /** Mạng đã đo trong phiên này: mỗi mạng chỉ đo một lần, không đo lại mỗi lần dựng transport. */
    @Volatile private var bwProbedKey: String? = null
    /**
     * Nhớ tốc độ theo mạng + phép đo qua tunnel. Tạo muộn (trong onStartCommand) vì field
     * initializer của Service chạy trước khi Context được gắn.
     */
    private var bandwidth: BandwidthMemory? = null

    /**
     * Số khai XUỐNG mà VÒNG RAMP trong lúc chạy đã chốt cho phiên này (0 = chưa ramp).
     * Sống qua các lượt dựng lại transport (đổi số khai = client hysteria mới, xem ramp).
     */
    @Volatile private var sessionRampDownKbps = 0
    /** Trần "sức mạng vật lý" của mạng hiện tại (kbps) — vòng ramp không được vượt. */
    @Volatile private var bwPhysicalCeilKbps = 0
    /** Vòng lấy mẫu băng thông thật (1s/lần) + điều chỉnh trần. */
    private var bwSampler: Thread? = null
    /**
     * Cầu WS của lượt thử đang chạy — nguồn byte DỰ PHÒNG khi app không đọc được /proc/net/dev
     * (Android 10+ hạn chế /proc/net cho app thường). Xem startBandwidthSampler.
     */
    @Volatile private var wsBridgeStats: WSRelayBridge? = null

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
        if (bandwidth == null) bandwidth = BandwidthMemory(this)
        if (networkMonitor == null) {
            // The listener is what fixes the "connected on WiFi, walked outside, no
            // internet" bug: a transport rebuild is started the moment Android moves
            // the tunnel onto another underlying network.
            networkMonitor = NetworkMonitor(this) { onUnderlyingNetworkChanged() }
                .also { it.start() }
        }
        startProbeLoop()
        startBandwidthSampler()
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
        // Đổi mạng giữa phiên (Wi-Fi -> 4G): chốt lại số khai NGAY, trước khi transport
        // được dựng lại, nếu không lượt dựng lại vẫn khai số của mạng cũ.
        refreshMeteredState("network changed")
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
        // Chốt số khai băng thông TRƯỚC mọi lượt thử transport (kể cả lượt ws-relay,
        // vốn đọc meteredNow ở wsRelayAttempt): mỗi lượt thử đều có thể mở client Go
        // với số mới nhất, không phụ thuộc lượt trước đã kịp cập nhật hay chưa.
        refreshMeteredState("pass start")
        val preferred = lastGoodTransport()?.takeIf { !preferWsFirst || it == "ws" }
        // preferWsFirst=true nghia la luot truoc da chet het: uu tien cu (vi du tcp:8443
        // tu phien Wi-Fi truoc) chi lam cham them ~1,2s moi luot. Bo qua no.
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
        // Cho vòng ramp đọc được byte thật của đường này (nguồn dự phòng khi /proc/net/dev bị chặn).
        wsBridgeStats = bridge
        DiagnosticsLog.log("ws-relay: thử transport qua Cloudflare (local port ${bridge.localPort})")
        // Đợi WS mở (tối đa ~6s) để lần connect đầu không bị mất gói.
        val deadline = System.currentTimeMillis() + WS_OPEN_WAIT_MS
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
        attemptUpKbps = if (meteredNow) MOBILE_UP_KBPS else HY_RELAY_UP_KBPS
        attemptDownKbps = if (meteredNow) MOBILE_DOWN_KBPS else HY_RELAY_DOWN_KBPS
        // Có SỐ ĐO cho mạng này thì lấy số đó làm trần của đường relay: phép đo đi qua chính
        // tunnel nên đã tính cả chi phí 2 chặng, còn min() bảo đảm không bao giờ khai cao hơn
        // mức relay đang chạy tốt. Điều kiện là "KHÔNG PHẢI đường lùi nấc tĩnh" (profile):
        // ramp cũng là số đã chứng minh bằng traffic thật, nên không được nâng lên nấc tĩnh.
        if (bwReason != BandwidthPolicy.REASON_PROFILE) {
            attemptUpKbps = minOf(attemptUpKbps, bwUpKbps)
            attemptDownKbps = minOf(attemptDownKbps, bwDownKbps)
        }
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
            wsBridgeStats = null
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
     * Chốt số kbps khai cho Brutal CC theo mạng đang nằm dưới tunnel.
     *
     * Chuyển từ cơ chế TĨNH (metered 8/12, unmetered 30/100) sang ĐỘNG: số đo thật của
     * CHÍNH mạng này (nhớ theo SSID/nhà mạng, xem BandwidthMemory) + trần sức mạng vật lý.
     * Chưa có số đo nào thì dùng đúng nấc tĩnh cũ, nên đường lùi vẫn an toàn.
     *
     * Vì sao tách khỏi applyUnderlyingNetwork(): hàm này KHÔNG gọi API của VpnService
     * nên gọi được cả khi TUN chưa dựng. Đó là điều bắt buộc — connectClient() truyền
     * số khai vào client Go ngay lúc mở, TRƯỚC khi TUN tồn tại, nên cập nhật muộn
     * (chỉ trong ensureTun) là quá trễ và client khởi động bằng số mặc định.
     *
     * Trả về network đang dùng để applyUnderlyingNetwork() khỏi tra lại lần hai.
     */
    private fun refreshMeteredState(reason: String): android.net.Network? {
        val net = networkMonitor?.underlyingNetwork()
        val label = net?.let { networkMonitor?.describe(it) } ?: "null"
        // Brutal CC gui dung theo so khai ⇒ so khai phai sat bang thong that cua tung loai mang.
        // Xem ghi chu o Config.HY_UP_KBPS (do 18/09: khai 100 Mbps tren 5G 13 Mbps lam tut con 0,6 MB/s).
        val metered = label.contains("cell")
        meteredNow = metered
        // Hai nấc TĨNH cũ — vẫn là mặc định khi chưa có số đo, và là trần trên của cơ chế động.
        val staticUp = if (metered) MOBILE_UP_KBPS else HY_UP_KBPS
        val staticDown = if (metered) MOBILE_DOWN_KBPS else HY_DOWN_KBPS
        val memory = bandwidth ?: BandwidthMemory(this).also { bandwidth = it }
        val profile = memory.profileOf(net, label)
        // Đổi mạng: số ramp của mạng CŨ không còn nghĩa gì (mỗi mạng có đỉnh riêng).
        val keyChanged = profile.key != bwKey
        if (keyChanged) sessionRampDownKbps = 0
        val measured = memory.rememberedMeasuredKbps(profile.key)
        val best = memory.bestKbps(profile.key)
        val decision = BandwidthPolicy.decide(
            rememberedMeasuredKbps = measured,
            rememberedDeclaredKbps = memory.rememberedDeclaredKbps(profile.key),
            staticUpKbps = staticUp,
            staticDownKbps = staticDown,
            ceilingDownKbps = profile.ceilingDownKbps,
            previousMeasuredKbps = memory.rememberedPreviousMeasuredKbps(profile.key),
            bestKbps = best,
        )
        // Số đang RAMP trong CHÍNH phiên này thắng quyết định khởi điểm: nó là mức đã được
        // vòng ramp chứng minh bằng traffic thật (xem startBandwidthSampler).
        var up = decision.upKbps
        var down = decision.downKbps
        var effectiveReason = decision.reason
        val ramp = sessionRampDownKbps
        if (!keyChanged && ramp > 0) {
            down = minOf(ramp, if (bwPhysicalCeilKbps > 0) bwPhysicalCeilKbps else decision.physicalCeilingDownKbps)
            up = ratioUpFrom(down)
            effectiveReason = BandwidthPolicy.REASON_RAMP
        }
        bwKey = profile.key
        bwDisplay = profile.display
        bwReason = effectiveReason
        bwMeasuredKbps = measured
        bwCeilKbps = decision.ceilingDownKbps
        bwPhysicalCeilKbps = decision.physicalCeilingDownKbps
        bwUpKbps = up
        bwDownKbps = down
        attemptUpKbps = up
        attemptDownKbps = down
        // Một dòng log, đọc là biết VÌ SAO app khai con số đó (probe/memory/profile/clamp):
        // net = mạng đang dùng, measured = số đã nhớ của mạng đó (0 = chưa đo),
        // declared = số vừa truyền vào client, ctx = lượt gọi, ceil = trần vật lý đã kẹp.
        DiagnosticsLog.log(
            "bw: net=$bwDisplay measured=$bwMeasuredKbps declared up=$attemptUpKbps " +
                "down=$attemptDownKbps reason=$effectiveReason ctx=$reason ceil=$bwCeilKbps " +
                "best=$best",
        )
        return net
    }

    /**
     * Tells Android which network the tunnel rides on — the same call the official
     * WireGuard client makes. Without it the VPN keeps the underlying network it
     * was established with, so a WiFi -> mobile-data handover is not applied.
     */
    private fun applyUnderlyingNetwork() {
        val net = refreshMeteredState("tun up")
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
        // Tunnel đã chở traffic: đo goodput thật rồi NHỚ theo mạng hiện tại (xem hàm dưới).
        startBandwidthProbe()
        try {
            val app = application as VPNFlowApp
            app.vpnManager.onHysteriaUp()
        } catch (_: Exception) {
        }
    }

    /**
     * Đo goodput qua tunnel và NHỚ theo mạng hiện tại (một lần cho mỗi mạng trong phiên).
     *
     * Số đo KHÔNG đổi được số khai của lượt đang chạy: đổi số khai phải dựng lại client
     * hysteria (Mobile.connect nhận số ngay lúc mở), mà dựng lại giữa lúc đang chở traffic
     * là đúng kiểu tự bóp mạng. Vì vậy số đo chỉ có tác dụng từ LẦN KẾT NỐI SAU vào cùng
     * mạng — lúc đó refreshMeteredState() đọc lại và log reason=memory.
     *
     * Chạy nền, tổng thời gian <=3s (chờ [BandwidthMemory.PROBE_DELAY_MS] rồi đọc tối đa
     * [BandwidthMemory.PROBE_MAX_MS]); lỗi/không đo được thì KHÔNG ghi nhớ gì, đường lùi
     * vẫn là nấc tĩnh cũ.
     */
    private fun startBandwidthProbe() {
        val memory = bandwidth ?: return
        val key = bwKey
        if (key.isEmpty() || key == bwProbedKey) return
        // Vừa đo xong cho mạng này thì thôi: đo lại chỉ tốn dữ liệu của người dùng.
        if (memory.ageMs(key) < BandwidthMemory.PROBE_MIN_INTERVAL_MS) return
        bwProbedKey = key
        val display = bwDisplay
        val metered = meteredNow
        val declared = attemptDownKbps
        val ceiling = bwCeilKbps
        Thread {
            try {
                Thread.sleep(BandwidthMemory.PROBE_DELAY_MS)
            } catch (_: InterruptedException) {
                return@Thread
            }
            // Mạng đổi giữa chừng thì số đo sẽ thuộc về mạng KHÁC — bỏ, lần sau đo lại.
            if (stopping || !DiagnosticsLog.tunnelUp || bwKey != key) return@Thread
            val measured = memory.measureDownKbps(
                maxBytes = if (metered) BandwidthMemory.PROBE_BYTES_METERED else BandwidthMemory.PROBE_BYTES,
                maxMs = BandwidthMemory.PROBE_MAX_MS,
            )
            if (measured <= 0) return@Thread
            memory.remember(key, measured, declared)
            // Số sẽ dùng cho lần kết nối sau — tính bằng ĐÚNG hàm quyết định lúc connect,
            // nên dòng log này là bằng chứng số khai sẽ theo số đo.
            val next = BandwidthPolicy.decide(
                rememberedMeasuredKbps = memory.rememberedMeasuredKbps(key),
                rememberedDeclaredKbps = memory.rememberedDeclaredKbps(key),
                staticUpKbps = if (metered) MOBILE_UP_KBPS else HY_UP_KBPS,
                staticDownKbps = if (metered) MOBILE_DOWN_KBPS else HY_DOWN_KBPS,
                previousMeasuredKbps = memory.rememberedPreviousMeasuredKbps(key),
                ceilingDownKbps = ceiling,
            )
            DiagnosticsLog.log(
                "bw: net=$display measured=${memory.rememberedMeasuredKbps(key)} " +
                    "declared up=${next.upKbps} down=${next.downKbps} " +
                    "reason=${BandwidthPolicy.REASON_PROBE} ctx=next-connect ceil=${next.ceilingDownKbps}",
            )
        }.apply { isDaemon = true; name = "hy-bw-probe" }.start()
    }

    /** Chiều LÊN suy từ chiều xuống theo đúng tỉ lệ của nấc tĩnh (phép đo chỉ đo chiều xuống). */
    private fun ratioUpFrom(downKbps: Int): Int {
        val staticUp = if (meteredNow) MOBILE_UP_KBPS else HY_UP_KBPS
        val staticDown = if (meteredNow) MOBILE_DOWN_KBPS else HY_DOWN_KBPS
        return maxOf(BandwidthPolicy.FLOOR_UP_KBPS, (downKbps.toLong() * staticUp / staticDown).toInt())
    }

    /**
     * VÒNG RAMP TRONG LÚC CHẠY — tăng/giảm trần khai theo băng thông THẬT.
     *
     * Ràng buộc kỹ thuật (không được vi phạm): `BandwidthConfig` của hysteria chỉ đặt được
     * MỘT LẦN lúc tạo client ⇒ đổi số khai = client mới = QUIC mới = ĐỨT mọi stream đang
     * chạy. Vì vậy vòng này chỉ ĐỔI SỐ ở "ranh giới an toàn":
     *   (a) tunnel RẢNH (không có traffic người dùng ~2s) ⇒ dựng lại client ngay, blip ngắn;
     *   (b) không tìm được lúc rảnh ⇒ chỉ ghi số mới vào phiên, áp ở lần kết nối/đổi mạng kế;
     *   (c) KHÔNG BAO GIỜ dựng lại khi đang có traffic.
     *
     * Nguồn số liệu (1s/lần, gần như miễn phí):
     *  - byte thật qua TUN đọc từ /proc/net/dev ⇒ "đỉnh bền vững" = trung bình trượt 12s;
     *  - RTT + mất gói của transport: TCP connect tới 1.1.1.1:80 qua chính tunnel mỗi 5s
     *    (socket không protect nên đi xuyên TUN) — fail/timeout = một lần mất gói.
     *
     * Luật đổi số (xem BandwidthPolicy):
     *  - TĂNG khi đỉnh bền vững vượt trần đang khai ≥15% LIÊN TỤC ≥10s ⇒ ×1,25 (kẹp trần).
     *  - GIẢM khi mất gói ≥2% (bộ đếm 10 lần hỏi gần nhất) hoặc RTT vọt ≥3× nền ⇒ ×0,7;
     *    giảm thì an toàn hơn tăng nên áp ngay ở ranh giới an toàn.
     *  - Lưới an toàn: đỉnh bền vững tụt dưới 50% trần khai liên tục ≥10s ⇒ ×0,7 (trường
     *    hợp bắt đầu ở đỉnh cũ nhưng mạng đã yếu hẳn mà RTT không vọt).
     *  - Mỗi lần đổi cách nhau ≥[RAMP_COOLDOWN_MS] (mỗi lần đổi là một QUIC mới).
     */
    private fun startBandwidthSampler() {
        if (bwSampler != null) return
        bwSampler = Thread {
            val samples = IntArray(BandwidthPolicy.SUSTAINED_WINDOW_S)
            var count = 0
            var idx = 0
            var idleRun = 0
            var overSince = 0L
            var underSince = 0L
            var lastRx = -1L
            var lastAt = 0L
            var lastRttAt = 0L
            var rttLast = 0
            var rttBaseline = 0
            val loss = ArrayDeque<Boolean>()
            var lastChangeAt = 0L
            var lastSampleLogAt = 0L
            var useProc: Boolean? = null
            while (!stopping) {
                try {
                    Thread.sleep(SAMPLE_INTERVAL_MS)
                } catch (_: InterruptedException) {
                    return@Thread
                }
                if (stopping) return@Thread
                if (!DiagnosticsLog.tunnelUp) {
                    // Chưa có tunnel (đang bắt tay/dựng lại): mọi mẫu cũ vô nghĩa.
                    lastRx = -1L
                    count = 0
                    idx = 0
                    idleRun = 0
                    overSince = 0L
                    underSince = 0L
                    continue
                }
                val memory = bandwidth ?: continue
                val now = System.currentTimeMillis()
                // Nguồn byte: ưu tiên /proc/net/dev (thấy MỌI transport, kể cả UDP/TCP trực
                // tiếp), nếu bị chặn đọc thì lùi về bộ đếm của cầu WS. Chọn MỘT nguồn cho cả
                // phiên và ghi log — trộn hai thang đo khác nhau vào cùng một phép trừ là sai.
                if (useProc == null) {
                    useProc = memory.tunRxBytes() >= 0
                    DiagnosticsLog.log(
                        "bw: sampler nguồn byte = " +
                            if (useProc == true) {
                                "/proc/net/dev (tun)"
                            } else {
                                "cầu WS (app không đọc được /proc/net/dev)"
                            },
                    )
                }
                val rx = if (useProc == true) memory.tunRxBytes() else (wsBridgeStats?.rxBytes() ?: -1L)
                if (rx < 0) continue
                if (lastRx < 0 || rx < lastRx) {
                    // Mẫu đầu tiên, hoặc bộ đếm bị reset (TUN mới) — bỏ qua, không tính bừa.
                    lastRx = rx
                    lastAt = now
                    continue
                }
                val elapsedMs = (now - lastAt).coerceAtLeast(1L)
                // bits/ms == kbit/s, nên công thức này ra thẳng kbps.
                val kbps = (((rx - lastRx) * 8) / elapsedMs).toInt()
                lastRx = rx
                lastAt = now
                samples[idx] = kbps
                idx = (idx + 1) % samples.size
                if (count < samples.size) count++
                if (kbps < SAMPLER_IDLE_KBPS) idleRun++ else idleRun = 0

                // RTT + mất gói của transport (hỏi nhẹ qua tunnel, 5s/lần).
                if (now - lastRttAt >= RTT_PROBE_INTERVAL_MS) {
                    lastRttAt = now
                    rttLast = tunnelRttMs()
                    loss.addLast(rttLast <= 0)
                    while (loss.size > LOSS_WINDOW) loss.removeFirst()
                    if (rttLast > 0) {
                        rttBaseline = if (rttBaseline == 0) rttLast else (rttBaseline * 3 + rttLast) / 4
                    }
                }

                val declared = bwDownKbps
                if (declared <= 0) continue
                val ceiling = if (bwPhysicalCeilKbps > 0) bwPhysicalCeilKbps else declared
                val floor = BandwidthPolicy.FLOOR_DOWN_KBPS
                val sustained = BandwidthPolicy.sustainedKbps(samples, count)

                // Mất gói: đếm trên cửa sổ LOSS_WINDOW lần hỏi gần nhất, nhưng chỉ kết luận
                // khi lần hỏi MỚI NHẤT đã hỏng hoặc mất gói đã lan rộng (≥2 lần) — một lần
                // hỏng lẻ rồi thôi thì không đáng dựng lại QUIC.
                val fails = loss.count { it }
                val lossPct = if (loss.isEmpty()) 0 else fails * 100 / loss.size

                // Telemetry [SAMPLE_LOG_INTERVAL_MS]/lần, chỉ khi có traffic thật: đọc logcat
                // là biết vòng ramp đang NHÌN THẤY gì (observed) mà không phải suy đoán.
                if (sustained > 0 && now - lastSampleLogAt >= SAMPLE_LOG_INTERVAL_MS) {
                    lastSampleLogAt = now
                    DiagnosticsLog.log(
                        "bw: sample net=$bwDisplay observed=$sustained declared=$declared " +
                            "rtt=${rttLast}ms loss=${lossPct}% ceil=$ceiling",
                    )
                }

                if (now - lastChangeAt < RAMP_COOLDOWN_MS) continue
                val lossBad = lossPct >= BandwidthPolicy.RAMP_LOSS_PCT &&
                    (loss.lastOrNull() == true || fails >= 2)
                val rttBad = BandwidthPolicy.shouldRampDown(0, rttLast, rttBaseline)
                val bad = lossBad || rttBad
                if (bad) {
                    // Mất gói/RTT vọt là tín hiệu MẠNH: áp ngay ở ranh giới an toàn (giảm thì
                    // an toàn hơn tăng), không cần giữ 10s như chiều tăng.
                    overSince = 0L
                    underSince = 0L
                    val newDown = BandwidthPolicy.rampDown(declared, ceiling, floor)
                    if (newDown < declared) {
                        applyRampDecision(
                            newDown,
                            if (lossBad) "loss-backoff" else "rtt-backoff",
                            sustained,
                            idleRun >= SAMPLER_IDLE_SAMPLES,
                            lossPct,
                            rttLast,
                        )
                        lastChangeAt = now
                    }
                    continue
                }
                // CHỈ xét "tụt sâu" khi ĐANG có traffic thật: lúc tunnel rảnh thì trung bình
                // trượt đương nhiên thấp, hạ trần vì lý do đó là sai (và sẽ hạ oan mỗi lần
                // người dùng ngừng tải).
                val busy = idleRun == 0
                if (busy && BandwidthPolicy.shouldRampDownUnderrun(sustained, declared)) {
                    if (underSince == 0L) underSince = now
                } else {
                    underSince = 0L
                }
                if (BandwidthPolicy.shouldRampUp(sustained, declared)) {
                    if (overSince == 0L) overSince = now
                } else {
                    overSince = 0L
                }
                if (underSince > 0 && now - underSince >= BandwidthPolicy.RAMP_HOLD_MS) {
                    val newDown = BandwidthPolicy.rampDown(declared, ceiling, floor)
                    if (newDown < declared) {
                        applyRampDecision(
                            newDown, "underrun-backoff", sustained,
                            idleRun >= SAMPLER_IDLE_SAMPLES, lossPct, rttLast,
                        )
                        lastChangeAt = now
                    }
                    underSince = 0L
                    continue
                }
                if (overSince > 0 && now - overSince >= BandwidthPolicy.RAMP_HOLD_MS) {
                    val newDown = BandwidthPolicy.rampUp(declared, ceiling, floor)
                    if (newDown > declared) {
                        applyRampDecision(
                            newDown, "idle-reconnect", sustained,
                            idleRun >= SAMPLER_IDLE_SAMPLES, lossPct, rttLast,
                        )
                        lastChangeAt = now
                    }
                    overSince = 0L
                }
            }
        }.apply { isDaemon = true; name = "hy-bw-ramp" }.also { it.start() }
    }

    /**
     * Áp một bước ramp. LUÔN ghi số mới vào phiên (để lần kết nối kế tiếp dùng), nhưng chỉ
     * DỰNG LẠI client khi tunnel đang RẢNH — dựng lại lúc đang truyền là đứt stream.
     */
    private fun applyRampDecision(
        newDownKbps: Int,
        reason: String,
        observedKbps: Int,
        idle: Boolean,
        lossPct: Int,
        rttMs: Int,
    ) {
        val old = bwDownKbps
        val newUp = ratioUpFrom(newDownKbps)
        sessionRampDownKbps = newDownKbps
        bwDownKbps = newDownKbps
        bwUpKbps = newUp
        attemptDownKbps = newDownKbps
        attemptUpKbps = newUp
        // Đỉnh bền vững đã CHỨNG MINH ⇒ lần sau vào mạng này bắt đầu luôn ở mức này (ramp
        // chỉ cần xảy ra một lần cho mỗi mạng).
        if (newDownKbps > old) bandwidth?.rememberBest(bwKey, newDownKbps)
        DiagnosticsLog.log(
            "bw: ramp net=$bwDisplay observed=$observedKbps old=$old new=$newDownKbps " +
                "reason=$reason apply=${if (idle) "idle-now" else "deferred-next-connect"} " +
                "loss=${lossPct}% rtt=${rttMs}ms",
        )
        if (idle) {
            android.util.Log.e(
                "VPNFLOW_DEBUG",
                "hysteria: ramp -> rebuild client down $old -> $newDownKbps kbps (tunnel idle)",
            )
            // serve() trả về -> runTunnel() dựng lại transport với số khai mới.
            runCatching { Mobile.stop() }
        }
    }

    /**
     * RTT của transport + tín hiệu MẤT GÓI, đo qua chính tunnel: TCP connect tới 1.1.1.1:80
     * (socket KHÔNG protect nên đi xuyên TUN, giống probeThroughTunnel) rồi đọc 1 byte.
     *
     * Vì sao tự viết thay vì gọi probeThroughTunnel(): hàm kia làm cả HTTP + DNS và có thể
     * tốn tới ~14s khi đường chết — quá nặng cho nhịp 5s của vòng ramp. Ở đây chỉ 1 lần
     * connect + 1 byte, timeout [RTT_PROBE_TIMEOUT_MS].
     *
     * @return ms, hoặc 0 nếu fail/timeout (được tính là một lần mất gói).
     */
    private fun tunnelRttMs(): Int {
        val started = System.currentTimeMillis()
        return try {
            java.net.Socket().use { s ->
                s.connect(java.net.InetSocketAddress("1.1.1.1", 80), RTT_PROBE_TIMEOUT_MS)
                s.soTimeout = RTT_PROBE_TIMEOUT_MS
                s.getOutputStream().apply {
                    write("GET / HTTP/1.0\r\nHost: one.one.one.one\r\nConnection: close\r\n\r\n".toByteArray())
                    flush()
                }
                val n = s.getInputStream().read(ByteArray(16))
                if (n > 0) (System.currentTimeMillis() - started).toInt() else 0
            }
        } catch (_: Exception) {
            0
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
        bwSampler = null
        sessionRampDownKbps = 0
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
        /** Nhịp lấy mẫu băng thông THẬT qua TUN (đọc /proc/net/dev — gần như miễn phí). */
        const val SAMPLE_INTERVAL_MS = 1_000L
        /** Dưới ngần này (kbps) coi là "tunnel rảnh" — không có traffic người dùng. */
        const val SAMPLER_IDLE_KBPS = 200
        /** Số mẫu 1s liên tiếp phải rảnh trước khi dám dựng lại client để đổi số khai. */
        const val SAMPLER_IDLE_SAMPLES = 2
        /** Nhịp ghi telemetry của vòng ramp (chỉ khi có traffic thật). */
        const val SAMPLE_LOG_INTERVAL_MS = 15_000L
        /** Nhịp hỏi RTT/mất gói qua tunnel. */
        const val RTT_PROBE_INTERVAL_MS = 5_000L
        const val RTT_PROBE_TIMEOUT_MS = 3_000
        /** Cửa sổ đếm mất gói (số lần hỏi gần nhất). */
        const val LOSS_WINDOW = 10
        /** Không đổi số khai dày hơn ngần này: mỗi lần đổi là một QUIC mới. */
        const val RAMP_COOLDOWN_MS = 15_000L
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
        const val WS_OPEN_WAIT_MS = 8_000L
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
        // Mang di dong khai thap hon (Brutal gui dung theo so khai, khai cao hon duong truyen la nghen).
        const val MOBILE_UP_KBPS = com.privatevpn.app.Config.MOBILE_UP_KBPS
        const val MOBILE_DOWN_KBPS = com.privatevpn.app.Config.MOBILE_DOWN_KBPS
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
