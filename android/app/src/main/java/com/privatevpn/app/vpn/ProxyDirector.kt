package com.privatevpn.app.vpn

import android.content.Context
import android.content.SharedPreferences
import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Quyết định proxy hệ thống của TV đi **đường nào** — yêu cầu chủ dự án 22/10/2026:
 * "đặt luôn 1 cái trong setting cho lựa chọn tự động nhảy 2 chiều hoặc chọn 1 trong 2".
 *
 * Ba chế độ (`Config.KEY_PROXY_MODE`):
 *  - [Config.PROXY_MODE_AUTO]    : ưu tiên **đường của TV** (`127.0.0.1:1081`); 1081 chết thì nhảy sang
 *                                  **gateway LAN**; cả hai chết thì gỡ proxy (`:0`) để TV còn mạng trực tiếp.
 *  - [Config.PROXY_MODE_TV]      : chỉ dùng đường của TV. 1081 chết ⇒ gỡ proxy, **không** nhảy sang gateway.
 *  - [Config.PROXY_MODE_GATEWAY] : chỉ dùng gateway LAN. **Không bao giờ** đặt `127.0.0.1:1081`.
 *
 * Vì sao phải kiểm bằng TCP thật chứ không tin giá trị setting: sự cố thật 20/10/2026 — proxy trỏ
 * `127.0.0.1:1081` trong khi cổng không ai nghe ⇒ **cả TV mất mạng**, phải mở app hoặc reboot mới chữa.
 * Cùng lý do đó, `auto` không bao giờ "đoán": 1081 không mở thì coi như chết.
 *
 * Gọi từ: nhịp keepalive 60 s ([VpnKeepAlive]), lúc app khởi động ([com.privatevpn.app.VPNFlowApp]),
 * và ngay khi người dùng đổi chế độ trong Settings.
 */
object ProxyDirector {

    /** Proxy nội bộ của app (LocalProxy) — chính là "đường của TV". */
    private fun tvProxy(): String = "127.0.0.1:${HysteriaVpnService.SOCKS_PORT}"

    /** Địa chỉ gateway LAN đang đặt trong prefs (mặc định 192.168.100.11:18081). */
    /**
     * Danh sách gateway LAN dự phòng, **thử lần lượt theo thứ tự**. Mặc định Windows trước
     * (`192.168.100.11:18081`) rồi tới Mac (`192.168.100.5:18081`) — yêu cầu chủ dự án 22/10/2026:
     * "fallback thêm cả cơ chế cho Mac làm gateway". Ai sống thì dùng, cả hai chết mới gỡ proxy.
     * Đổi được bằng prefs (chuỗi ngăn cách bởi dấu phẩy), không cần build lại.
     */
    fun gateways(context: Context, forceDiscover: Boolean = false): List<String> {
        val raw = prefs(context).getString(Config.KEY_PROXY_GATEWAY, null)
            ?.takeIf { it.contains(":") && it.isNotBlank() }
            ?: Config.PROXY_GATEWAY_DEFAULT
        // Prefs TRƯỚC (người dùng đã đặt thì ưu tiên — handoff Mac 23/10/2026), rồi tới gateway TỰ DÒ
        // (địa chỉ thật khi DHCP đổi IP). Chế độ `tv` KHÔNG dò gì (yêu cầu A.4).
        val configured = raw.split(',').map { it.trim() }.filter { it.contains(":") }
        if (mode(context) == Config.PROXY_MODE_TV) return configured
        val needDiscover = forceDiscover || (discList.isEmpty() && scanList.isEmpty())
        val discovered = if (needDiscover) {
            discoveredGateways(forceDiscover) + scanSubnet(context, forceDiscover)
        } else {
            discList + scanList
        }
        return (configured + discovered)
            .filter { it.contains(":") && it.isNotBlank() }
            .distinct()
    }

    /**
     * Tự dò gateway trong LAN bằng UDP broadcast — vì DHCP đổi IP máy liên tục (22→23/10/2026:
     * laptop .11 → .5, Mac .5 → .3) nên mọi địa chỉ hard-code đều chết.
     *
     * Giao thức: app phát `FLOWVPNGW?` tới 255.255.255.255:[DISCOVERY_PORT]; `tools/lan-proxy` trả
     * `FLOWVPNGW1 <cổng proxy>`. Kết quả nhớ 60 s để không phải broadcast mỗi nhịp.
     */
    @Volatile private var discAt = 0L
    @Volatile private var discList: List<String> = emptyList()

    private fun discoveredGateways(force: Boolean = false): List<String> {
        // throttle: tối đa 1 lượt broadcast/60 s (yêu cầu A.3 — không scan storm)
        if (!force && android.os.SystemClock.elapsedRealtime() - discAt < DISCOVERY_TTL_MS) return discList
        val found = linkedSetOf<String>()
        runCatching {
            java.net.DatagramSocket().use { sock ->
                sock.broadcast = true
                sock.soTimeout = 500
                val payload = "FLOWVPNGW?".toByteArray()
                runCatching {
                    sock.send(
                        java.net.DatagramPacket(
                            payload, payload.size,
                            java.net.InetAddress.getByName("255.255.255.255"), DISCOVERY_PORT,
                        ),
                    )
                }
                val buf = ByteArray(128)
                val deadline = android.os.SystemClock.elapsedRealtime() + DISCOVERY_WAIT_MS
                while (android.os.SystemClock.elapsedRealtime() < deadline) {
                    val pkt = java.net.DatagramPacket(buf, buf.size)
                    if (runCatching { sock.receive(pkt) }.isFailure) break
                    val text = String(pkt.data, 0, pkt.length).trim()
                    if (!text.startsWith("FLOWVPNGW1")) continue
                    val port = text.substringAfter(' ', "18081").trim().toIntOrNull() ?: 18081
                    found.add("${pkt.address.hostAddress}:$port")
                }
            }
        }
        discAt = android.os.SystemClock.elapsedRealtime()
        discList = found.toList()
        if (found.isNotEmpty()) {
            DiagnosticsLog.log("tuyến: tự dò được gateway ${found.joinToString(", ")}")
        }
        return discList
    }

    /**
     * Quét subnet (…/24) tìm máy đang mở cổng proxy — dùng khi broadcast không thấy gì.
     *
     * Vì sao cần: gateway của Mac không trả lời `FLOWVPNGW?` (bridge của Mac là binary riêng), nên
     * nếu chỉ dựa vào broadcast thì app chỉ biết gateway của Windows. Quét 1 lần mỗi
     * [SCAN_TTL_MS], mỗi host một TCP connect 250 ms (chạy song song 32 luồng) — rẻ và chịu được
     * việc DHCP đổi IP bất kỳ máy nào.
     */
    @Volatile private var scanAt = 0L
    @Volatile private var scanList: List<String> = emptyList()

    private fun scanSubnet(context: Context, force: Boolean = false): List<String> {
        // cache 10 phút; force thì bỏ qua cache nhưng vẫn giữ nhịp tối thiểu 60 s
        val sinceScan = android.os.SystemClock.elapsedRealtime() - scanAt
        if (!force && sinceScan < SCAN_TTL_MS) return scanList
        if (force && sinceScan < DISCOVERY_TTL_MS) return scanList
        scanAt = android.os.SystemClock.elapsedRealtime()
        val prefix = localSubnetPrefix(context) ?: return scanList
        val hits = java.util.Collections.synchronizedList(mutableListOf<String>())
        val tasks = 254 * SCAN_PORTS.size
        val pool = java.util.concurrent.Executors.newFixedThreadPool(SCAN_THREADS)
        val latch = java.util.concurrent.CountDownLatch(tasks)
        for (host in 1..254) {
            val addr = "$prefix.$host"
            // Quét cả 18081 (gateway smart-route) và 18083 (Flow3 trực tiếp của Mac).
            for (port in SCAN_PORTS) {
                runCatching {
                    pool.execute {
                        try {
                            runCatching {
                                java.net.Socket().use { s ->
                                    s.connect(java.net.InetSocketAddress(addr, port), SCAN_TIMEOUT_MS)
                                    hits.add("$addr:$port")
                                }
                            }
                        } finally {
                            latch.countDown()
                        }
                    }
                }
            }
        }
        runCatching { latch.await(8, java.util.concurrent.TimeUnit.SECONDS) }
        pool.shutdownNow()
        scanList = hits.toList()
        if (scanList.isNotEmpty()) {
            DiagnosticsLog.log("tuyến: quét subnet thấy gateway ${scanList.joinToString(", ")}")
        }
        return scanList
    }

    /** Tiền tố /24 của mạng Wi-Fi hiện tại, ví dụ `192.168.100`. */
    private fun localSubnetPrefix(context: Context): String? = runCatching {
        val wm = context.getSystemService(android.content.Context.WIFI_SERVICE)
            as? android.net.wifi.WifiManager
        @Suppress("DEPRECATION")
        val ip = wm?.connectionInfo?.ipAddress ?: 0
        if (ip == 0) return@runCatching null
        // ipAddress trả về int little-endian.
        val a = ip and 0xff
        val b = (ip ushr 8) and 0xff
        val c = (ip ushr 16) and 0xff
        "$a.$b.$c"
    }.getOrNull()

    /** Gateway đầu tiên trong danh sách (dùng cho nhãn UI). */
    fun gatewayAddress(context: Context): String = gateways(context).firstOrNull() ?: Config.PROXY_GATEWAY_DEFAULT

    fun mode(context: Context): String =
        prefs(context).getString(Config.KEY_PROXY_MODE, Config.PROXY_MODE_AUTO)
            ?.takeIf { it in VALID_MODES }
            ?: Config.PROXY_MODE_AUTO

    fun setMode(context: Context, mode: String) {
        if (mode !in VALID_MODES) return
        prefs(context).edit().putString(Config.KEY_PROXY_MODE, mode).apply()
    }

    fun setGatewayAddress(context: Context, address: String) {
        val trimmed = address.trim()
        if (!trimmed.contains(":")) return
        prefs(context).edit().putString(Config.KEY_PROXY_GATEWAY, trimmed).apply()
    }

    private val VALID_MODES = setOf(
        Config.PROXY_MODE_AUTO,
        Config.PROXY_MODE_TV,
        Config.PROXY_MODE_GATEWAY,
    )

    /**
     * Áp dụng lựa chọn hiện tại lên `Settings.Global http_proxy`.
     *
     * BẤT ĐỒNG BỘ có chủ đích: phép dò là `Socket.connect` thật, mà hàm này được gọi từ
     * `Application.onCreate`, từ `BroadcastReceiver` và từ Compose — toàn **main thread**.
     * Bản đầu tiên gọi connect ngay trên main thread ⇒ `NetworkOnMainThreadException` ⇒ mọi phép dò
     * đều "chết" ⇒ app ghi `:0` (sự cố thật 22/10/2026 ngay sau khi cài bản 79: proxy hệ thống
     * thành `:0` dù gateway LAN vẫn sống). Vì vậy: dò trên luồng riêng, chỉ một lượt chạy tại một thời điểm.
     */
    fun enforce(context: Context) {
        if (!pending.compareAndSet(false, true)) return
        val app = context.applicationContext
        runCatching {
            WORKER.execute {
                try {
                    applyNow(app)
                } finally {
                    pending.set(false)
                }
            }
        }.onFailure { pending.set(false) }
    }

    /**
     * Bản đồng bộ cho **luồng nền của service** (lúc tunnel lên/chết). Không gọi từ main thread.
     *
     * Vì sao cần: sự cố thật 22/10/2026 — cầu WS chết (`ping/pong` timeout) ⇒ service gọi
     * `setSystemProxy(false)` ⇒ proxy hệ thống thành `:0` **dù gateway LAN vẫn sống**, TV bị đẩy ra
     * IP Trung Quốc cho tới nhịp keepalive kế tiếp (60 s). Giờ mọi ngã rẽ đều qua đây: tunnel chết
     * thì `auto` nhảy sang gateway, `tv` mới gỡ hẳn.
     */
    fun enforceBlocking(context: Context) {
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
            enforce(context)
            return
        }
        runCatching { applyNow(context.applicationContext) }
    }

    /** Phần thân thật của [enforce] — luôn chạy trên [WORKER] (được phép connect). */
    private fun applyNow(context: Context) {
        val chosen = decide(context)
        val current = runCatching {
            android.provider.Settings.Global.getString(context.contentResolver, "http_proxy")
        }.getOrNull().orEmpty()
        if (chosen == current) return
        val ok = runCatching {
            android.provider.Settings.Global.putString(context.contentResolver, "http_proxy", chosen)
            true
        }.getOrElse {
            DiagnosticsLog.warn(
                "tuyến: KHÔNG ghi được proxy hệ thống (${it.javaClass.simpleName}: ${it.message}) " +
                    "— cần 'pm grant ${context.packageName} android.permission.WRITE_SECURE_SETTINGS'",
            )
            false
        }
        if (ok) {
            if (chosen != ":0") lastGood = chosen
            DiagnosticsLog.log("tuyến: proxy hệ thống $current -> $chosen (chế độ ${mode(context)})")
        }
    }

    /**
     * Tuyến LAN cuối cùng đã dùng được. Vì sao cần: đã có ca thật (22/10/2026) — tắt máy Mac thì
     * TV rơi về `:0` dù gateway Windows vẫn sống, vì lần dò đúng lúc Wi-Fi đang ngủ nên hết hạn 700 ms
     * và app kết luận "chết hết". Có lastGood thì tệ nhất vẫn giữ được tuyến vừa dùng, và nhịp sau
     * dò lại sẽ sửa tiếp.
     */
    @Volatile private var lastGood: String? = null

    private val WORKER = java.util.concurrent.Executors.newSingleThreadExecutor { r ->
        Thread(r, "proxy-director").apply { isDaemon = true }
    }
    private val pending = java.util.concurrent.atomic.AtomicBoolean(false)

    /**
     * Nút Refresh trên UI (yêu cầu chủ dự án 22/10/2026: "bấm refresh thì cũng chọn lại đường tốt
     * nhất mà vào luôn"): xoá điểm cũ, **đo lại TẤT CẢ tuyến đang sống** rồi áp dụng ngay.
     *
     * Chạy trên [WORKER] nên không chặn main thread; gọi từ UI là quay về tức thì. Khác với nhịp
     * 60 s (mỗi lượt chỉ đo 1 tuyến để tiết kiệm băng thông), ở đây đo hết để chọn đúng ngay.
     */
    fun forceRescore(context: Context) {
        val app = context.applicationContext
        runCatching {
            WORKER.execute {
                try {
                    scores = emptyMap()
                    scoreKbps = emptyMap()
                    val candidates = if (mode(app) == Config.PROXY_MODE_GATEWAY) {
                        gateways(app, forceDiscover = true)
                    } else {
                        listOf(tvProxy()) + gateways(app, forceDiscover = true)
                    }
                    val aliveNow = candidates.filter { alive(it) }
                    DiagnosticsLog.log("tuyến: Refresh -> đo lại ${aliveNow.size}/${candidates.size} tuyến sống")
                    aliveNow.forEach { probeQuality(app, it) }
                    applyNow(app)
                } catch (t: Throwable) {
                    DiagnosticsLog.warn("tuyến: Refresh đo lại lỗi: ${t.javaClass.simpleName}: ${t.message}")
                }
            }
        }
    }

    /**
     * Giá trị proxy nên dùng ngay lúc này (`:0` = gỡ). Chỉ gọi từ luồng nền (có connect).
     *
     * "Tốt nhất" nghĩa là **đo thật**, không theo thứ tự cố định (yêu cầu chủ dự án 22/10/2026):
     * mỗi tuyến còn sống được chấm bằng một lần tải nhỏ (128 KB) XUYÊN QUA chính proxy đó, điểm =
     * kbps; chọn điểm cao nhất. Điểm nhớ 5 phút, mỗi lượt chỉ đo TỐI ĐA MỘT tuyến chưa có điểm
     * (giới hạn băng thông dùng cho việc đo: tối đa ~7,7 MB/giờ). Chưa có điểm nào thì giữ thứ tự
     * an toàn: đường TV trước, rồi tới danh sách gateway.
     */
    fun decide(context: Context): String {
        val tv = tvProxy()
        var gws = gateways(context)
        val mode = mode(context)
        if (mode == Config.PROXY_MODE_TV) return if (alive(tv)) tv else ":0"

        var candidates = if (mode == Config.PROXY_MODE_GATEWAY) gws else listOf(tv) + gws
        var aliveNow = candidates.filter { alive(it) }
        // Không còn tuyến nào sống ⇒ dò lại LAN (DHCP vừa đổi IP gateway) rồi tính lại.
        if (aliveNow.isEmpty() && mode != Config.PROXY_MODE_TV) {
            gws = gateways(context, forceDiscover = true)
            candidates = if (mode == Config.PROXY_MODE_GATEWAY) gws else listOf(tv) + gws
            aliveNow = candidates.filter { alive(it) }
        }
        if (aliveNow.isEmpty()) {
            // Không dò được cái nào: nếu tuyến LAN vừa dùng vẫn còn thì GIỮ NÓ thay vì gỡ proxy —
            // "tắt Mac là mất hết" (sự cố thật 22/10/2026) xảy ra đúng ở nhánh này.
            val keep = lastGood
            if (keep != null && alive(keep, 2500)) {
                DiagnosticsLog.log("tuyến: không dò được tuyến nào, giữ tuyến LAN vừa dùng $keep")
                return keep
            }
            return ":0"
        }

        // Đo: mọi tuyến CHƯA có điểm hoặc điểm đã cũ, tối đa [MAX_PROBES_PER_TICK] tuyến mỗi lượt.
        // (Bản trước chỉ đo 1 tuyến/lượt VÀ coi điểm quá hạn là "chưa có" ⇒ vài phút sau là rơi về
        // "tuyến đầu tiên", tức auto thực chất không chọn theo tốc độ — lỗi thật 22/10/2026.)
        aliveNow.filter { scoreStale(it) }.take(MAX_PROBES_PER_TICK).forEach { probeQuality(context, it) }

        // Điểm dùng để CHỌN là điểm gần nhất đã biết (kể cả hơi cũ): mạng không đổi chỉ vì đồng hồ
        // hết hạn. Việc đo lại chỉ để cập nhật.
        val scored = aliveNow.mapNotNull { addr -> scoreOf(addr)?.let { addr to it } }
        if (scored.isEmpty()) return aliveNow.first()

        // CHÍNH SÁCH AUTO (chốt với chủ dự án 23/10/2026 — phương án B):
        //  - Mặc định dùng gateway LAN điểm cao nhất.
        //  - Đường TV (127.0.0.1:1081) ĐƯỢC THI ĐẤU, nhưng phải thắng rõ: điểm >= [TV_WIN_MIN_KBPS]
        //    VÀ >= [TV_WIN_ADVANTAGE] lần gateway tốt nhất.
        //  - Không còn gì ⇒ gỡ proxy (":0").
        // Chống "burst ảo": điểm mỗi tuyến là MIN của HAI lần đo trên HAI kết nối khác nhau
        // (xem probeQuality) — một cú burst không thể kéo điểm lên.
        val tvAlive = aliveNow.contains(tv)
        val tvScore = scoreOf(tv) ?: 0
        val bestGw = aliveNow
            .filter { it != tv }
            .mapNotNull { addr -> scoreOf(addr)?.let { addr to it } }
            .maxByOrNull { it.second }
        val tvWins = mode != Config.PROXY_MODE_GATEWAY && tvAlive && tvScore >= TV_WIN_MIN_KBPS &&
            (bestGw == null || tvScore.toLong() * 100 >= bestGw.second.toLong() * (TV_WIN_ADVANTAGE * 100).toLong())
        val preferred = when {
            tvWins -> tv
            bestGw != null -> bestGw.first
            tvAlive -> tv
            else -> aliveNow.first()
        }
        val bestAddr = preferred
        val bestScore = scoreOf(bestAddr) ?: 0

        // Chống nhảy qua nhảy lại: giữ tuyến ĐANG dùng nếu nó còn sống và không kém tuyến tốt nhất
        // quá 15% (đổi tuyến = đổi đường của phiên đang xem, dễ làm player giật).
        //
        // NHƯNG chỉ áp dụng giữa các GATEWAY với nhau. Nếu tuyến đang dùng là đường TV mà đã có
        // gateway sống thì ĐỔI NGAY — đây chính là lỗi 22/10/2026: đường TV đo burst 1355 kbps nên
        // hysteresis "giữ 1081" và policy ưu tiên gateway LAN không bao giờ có hiệu lực.
        val current = currentProxy(context)
        if (current != null && current != bestAddr && aliveNow.contains(current) &&
            current != tv && bestAddr != tv
        ) {
            val curScore = scoreOf(current) ?: 0
            if (curScore > 0 && curScore.toLong() * 100 >= bestScore.toLong() * 85) {
                DiagnosticsLog.log("tuyến: giữ $current (${curScore}kbps) thay vì $bestAddr (${bestScore}kbps)")
                return current
            }
        }
        if (bestAddr != current) {
            val detail = scored.joinToString(", ") { "${it.first}=${it.second}kbps" }
            val note = if (tvAlive && bestGw != null) {
                "; ưu tiên gateway LAN khi còn gateway sống (đường TV ${scoreOf(tv) ?: 0}kbps)"
            } else {
                ""
            }
            DiagnosticsLog.log("tuyến: chọn $bestAddr (điểm: $detail$note)")
        }
        return bestAddr
    }

    /** Proxy hệ thống đang đặt (để biết có nên đổi tuyến hay không). */
    private fun currentProxy(context: Context): String? = runCatching {
        android.provider.Settings.Global.getString(context.contentResolver, "http_proxy")
    }.getOrNull()?.takeIf { it.contains(":") && it != ":0" }

    // ───────────── đo "chất lượng" từng tuyến ─────────────

    @Volatile private var scores: Map<String, Long> = emptyMap()   // addr -> thời điểm đầu (ms)
    @Volatile private var scoreKbps: Map<String, Int> = emptyMap()  // addr -> kbps

    /** Điểm gần nhất đã biết của tuyến (không xét hạn); null = chưa từng đo. */
    private fun scoreOf(addr: String): Int? {
        scores[addr] ?: return null
        return scoreKbps[addr]
    }

    /** Điểm đã cũ (quá [SCORE_TTL_MS]) hoặc chưa từng đo ⇒ cần đo lại. */
    private fun scoreStale(addr: String): Boolean {
        val at = scores[addr] ?: return true
        return android.os.SystemClock.elapsedRealtime() - at > SCORE_TTL_MS
    }

    /**
     * Đo chất lượng qua chính proxy [addr] — **HAI lần trên HAI kết nối mới**, điểm = MIN của hai lần.
     *
     * Vì sao phải 2 lần: yêu cầu chủ dự án 23/10/2026 "đừng để nó đo vào burst ảo, phải xác thực cả
     * đường đo". Một cú burst 128 KB có thể cho vài nghìn kbps trong khi đường thật đang treo; lấy
     * MIN của hai kết nối độc lập thì burst không thể kéo điểm lên, còn đường thật yếu sẽ lộ ngay.
     *
     * Mỗi lần đo: CONNECT + TLS thật tới speed.cloudflare.com (mọi proxy hệ thống của TV đều phải
     * phục vụ HTTPS; gateway Mac chỉ xử lý CONNECT), tải [PROBE_BYTES] byte rồi tính kbps = bits/ms.
     * Mẫu < [MIN_SAMPLE_BYTES] coi như 0.
     */
    private fun probeQuality(context: Context, addr: String) {
        val idx = addr.lastIndexOf(':')
        if (idx <= 0) return
        val host = addr.substring(0, idx).trim()
        val port = addr.substring(idx + 1).trim().toIntOrNull() ?: return
        val first = measureOnce(host, port)
        val second = if (first > 0) measureOnce(host, port) else 0
        val kbps = if (first > 0 && second > 0) minOf(first, second) else 0
        val now = android.os.SystemClock.elapsedRealtime()
        scores = scores + (addr to now)
        scoreKbps = scoreKbps + (addr to kbps)
        if (kbps > 0) {
            DiagnosticsLog.log("tuyến: đo $addr = ${kbps} kbps (2 kết nối: ${first} / ${second})")
        } else {
            DiagnosticsLog.log(
                "tuyến: đo $addr = 0 kbps (2 kết nối: ${first} / ${second}) — không xác thực được đường đo",
            )
        }
    }

    /** Một lần đo trên một kết nối mới; trả kbps (0 = lỗi hoặc mẫu quá nhỏ). */
    private fun measureOnce(host: String, port: Int): Int {
        val t0 = android.os.SystemClock.elapsedRealtime()
        var bytes = 0L
        val ok = runCatching {
            Socket().use { raw ->
                raw.connect(InetSocketAddress(host, port), 2000)
                raw.soTimeout = 2500
                val out = raw.getOutputStream()
                out.write(
                    ("CONNECT speed.cloudflare.com:443 HTTP/1.1\r\n" +
                        "Host: speed.cloudflare.com:443\r\n\r\n").toByteArray(),
                )
                out.flush()
                // Đọc phần đầu reply CONNECT, phải là "HTTP/1.x 200".
                val head = StringBuilder()
                val one = ByteArray(1)
                val input = raw.getInputStream()
                while (head.length < 512) {
                    val n = input.read(one)
                    if (n <= 0) break
                    head.append(one[0].toInt().toChar())
                    if (head.endsWith("\r\n\r\n")) break
                }
                if (!head.contains(" 200")) throw IllegalStateException("CONNECT: ${head.lineSequence().firstOrNull()}")
                val tls = (javax.net.ssl.SSLSocketFactory.getDefault() as javax.net.ssl.SSLSocketFactory)
                    .createSocket(raw, "speed.cloudflare.com", 443, true) as javax.net.ssl.SSLSocket
                tls.soTimeout = 2500
                tls.startHandshake()
                tls.getOutputStream().apply {
                    write(
                        ("GET /__down?bytes=$PROBE_BYTES HTTP/1.1\r\n" +
                            "Host: speed.cloudflare.com\r\nConnection: close\r\n\r\n").toByteArray(),
                    )
                    flush()
                }
                val tin = tls.getInputStream()
                val buf = ByteArray(16 * 1024)
                while (bytes < PROBE_BYTES) {
                    val n = tin.read(buf)
                    if (n <= 0) break
                    bytes += n
                    if (android.os.SystemClock.elapsedRealtime() - t0 > 4000) break
                }
                runCatching { tls.close() }
            }
        }.isSuccess
        if (!ok) return 0
        val ms = (android.os.SystemClock.elapsedRealtime() - t0).coerceAtLeast(1)
        if (bytes < MIN_SAMPLE_BYTES) return 0
        // bits / ms = kbps (1 byte = 8 bit; 1 ms = 1/1000 s).
        return ((bytes * 8L) / ms).toInt()
    }

    /** Kích thước mẫu đo: đủ để phân biệt tuyến nhanh/chậm, nhỏ để không ăn băng thông. */
    private const val PROBE_BYTES = 131_072
    /** Dưới mức này thì không tính điểm (tránh con số ảo từ vài trăm byte header). */
    private const val MIN_SAMPLE_BYTES = 16_384L
    /** Điểm chỉ có giá trị trong 3 phút — mạng đổi thì đo lại. */
    private const val SCORE_TTL_MS = 5 * 60 * 1000L
    /** Đường TV phải đạt mức này (kbps) mới được xét thắng gateway. */
    private const val TV_WIN_MIN_KBPS = 2000
    /** Và phải cao hơn gateway tốt nhất chừng này lần. */
    private const val TV_WIN_ADVANTAGE = 1.5
    /** Cổng UDP để tự dò gateway (khớp 	ools/lan-proxy). */
    private const val DISCOVERY_PORT = 18099
    /** Nhớ kết quả dò 60 s. */
    private const val DISCOVERY_TTL_MS = 60 * 1000L
    /** Chờ tối đa 700 ms cho các gateway trả lời. */
    private const val DISCOVERY_WAIT_MS = 700L    /** Cổng của gateway LAN (cả Windows lẫn Mac đều mở 18081). */
    private const val GATEWAY_PORT = 18081
    /** Quét những cổng này trên mọi host: 18081 = gateway smart-route, 18083 = Flow3 trực tiếp của Mac. */
    private val SCAN_PORTS = intArrayOf(18081, 18083)
    /** Quét subnet: nhớ 5 phút, 32 luồng, mỗi host chờ 250 ms. */
    private const val SCAN_TTL_MS = 10 * 60 * 1000L
    private const val SCAN_THREADS = 32
    private const val SCAN_TIMEOUT_MS = 250
    /** Mỗi nhịp 60 s đo tối đa chừng này tuyến (2 × 128 KB ≈ 0,25 MB/phút, đủ nhanh mà không tốn). */
    private const val MAX_PROBES_PER_TICK = 2
    /**
     * Đường TV chỉ được chọn khi đo được ít nhất mức này (kbps). Dưới ngưỡng thì dù có số vẫn hay
     * treo (app quay tít) vì jitter/mất gói của cầu WS — kinh nghiệm thật 22/10/2026.
     */
    /** Và phải cao hơn gateway tốt nhất chừng này lần thì mới đáng đổi đường. */

    /** TCP connect thật tới host:port (700 ms) — "cổng mở" chứ không phải "setting đang ghi gì". */
    fun alive(hostPort: String, timeoutMs: Int = 2000): Boolean {
        val idx = hostPort.lastIndexOf(':')
        if (idx <= 0) return false
        val host = hostPort.substring(0, idx).trim()
        val port = hostPort.substring(idx + 1).trim().toIntOrNull() ?: return false
        if (host.isEmpty() || port !in 1..65535) return false
        return runCatching {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(host, port), timeoutMs)
                true
            }
        }.getOrDefault(false)
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(HysteriaVpnService.PREFS, Context.MODE_PRIVATE)
}

