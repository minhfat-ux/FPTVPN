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
    fun gateways(context: Context): List<String> {
        val raw = prefs(context).getString(Config.KEY_PROXY_GATEWAY, null)
            ?.takeIf { it.contains(":") && it.isNotBlank() }
            ?: Config.PROXY_GATEWAY_DEFAULT
        return raw.split(',').map { it.trim() }.filter { it.contains(":") }.distinct()
    }

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
        if (ok) DiagnosticsLog.log("tuyến: proxy hệ thống $current -> $chosen (chế độ ${mode(context)})")
    }

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
                        gateways(app)
                    } else {
                        listOf(tvProxy()) + gateways(app)
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
        val gws = gateways(context)
        val mode = mode(context)
        if (mode == Config.PROXY_MODE_TV) return if (alive(tv)) tv else ":0"

        val candidates = if (mode == Config.PROXY_MODE_GATEWAY) gws else listOf(tv) + gws
        val aliveNow = candidates.filter { alive(it) }
        if (aliveNow.isEmpty()) return ":0"

        // Đo: mọi tuyến CHƯA có điểm hoặc điểm đã cũ, tối đa [MAX_PROBES_PER_TICK] tuyến mỗi lượt.
        // (Bản trước chỉ đo 1 tuyến/lượt VÀ coi điểm quá hạn là "chưa có" ⇒ vài phút sau là rơi về
        // "tuyến đầu tiên", tức auto thực chất không chọn theo tốc độ — lỗi thật 22/10/2026.)
        aliveNow.filter { scoreStale(it) }.take(MAX_PROBES_PER_TICK).forEach { probeQuality(context, it) }

        // Điểm dùng để CHỌN là điểm gần nhất đã biết (kể cả hơi cũ): mạng không đổi chỉ vì đồng hồ
        // hết hạn. Việc đo lại chỉ để cập nhật.
        val scored = aliveNow.mapNotNull { addr -> scoreOf(addr)?.let { addr to it } }
        if (scored.isEmpty()) return aliveNow.first()

        val bestAddr = scored.maxByOrNull { it.second }!!.first
        val bestScore = scored.maxOf { it.second }

        // Chống nhảy qua nhảy lại: giữ tuyến ĐANG dùng nếu nó còn sống và không kém tuyến tốt nhất
        // quá 15% (đổi tuyến = đổi đường của phiên đang xem, dễ làm player giật).
        val current = currentProxy(context)
        if (current != null && current != bestAddr && aliveNow.contains(current)) {
            val curScore = scoreOf(current) ?: 0
            if (curScore > 0 && curScore.toLong() * 100 >= bestScore.toLong() * 85) {
                DiagnosticsLog.log("tuyến: giữ $current (${curScore}kbps) thay vì $bestAddr (${bestScore}kbps)")
                return current
            }
        }
        if (bestAddr != current) {
            val detail = scored.joinToString(", ") { "${it.first}=${it.second}kbps" }
            DiagnosticsLog.log("tuyến: chọn $bestAddr (điểm: $detail)")
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
     * Đo chất lượng qua chính proxy [addr] bằng **CONNECT + TLS** rồi tải [PROBE_BYTES] byte.
     *
     * Vì sao phải đi TLS chứ không GET http:// trực tiếp: gateway của Mac CHỈ xử lý CONNECT
     * (HTTP thường trả `502 tunnel failed`), nên cách cũ chấm Mac = 0 điểm một cách oan uổng —
     * đo thật 22/10/2026. Mọi proxy hệ thống của TV đều phải phục vụ HTTPS, nên đây mới là thước đo
     * đúng thứ người dùng cần.
     *
     * Điểm = kbps (bits/ms). Mẫu < [MIN_SAMPLE_BYTES] coi như không đo được (0) để tránh con số ảo.
     */
    private fun probeQuality(context: Context, addr: String) {
        val idx = addr.lastIndexOf(':')
        if (idx <= 0) return
        val host = addr.substring(0, idx).trim()
        val port = addr.substring(idx + 1).trim().toIntOrNull() ?: return
        val t0 = android.os.SystemClock.elapsedRealtime()
        var bytes = 0L
        var failure: String? = null
        runCatching {
            Socket().use { raw ->
                raw.connect(InetSocketAddress(host, port), 1200)
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
        }.onFailure { failure = "${it.javaClass.simpleName}: ${it.message}" }
        val ms = (android.os.SystemClock.elapsedRealtime() - t0).coerceAtLeast(1)
        // bits / ms = kbps (1 byte = 8 bit; 1 ms = 1/1000 s).
        val rawKbps = if (bytes <= 0) 0 else ((bytes * 8L) / ms).toInt()
        val kbps = if (bytes < MIN_SAMPLE_BYTES) 0 else rawKbps
        val now = android.os.SystemClock.elapsedRealtime()
        scores = scores + (addr to now)
        scoreKbps = scoreKbps + (addr to kbps)
        if (kbps > 0) {
            DiagnosticsLog.log("tuyến: đo $addr = ${kbps} kbps (${bytes} B / ${ms} ms)")
        } else {
            val why = failure ?: "mẫu nhỏ (${bytes} B / ${ms} ms < $MIN_SAMPLE_BYTES B)"
            DiagnosticsLog.log("tuyến: đo $addr = 0 kbps · $why")
        }
    }

    /** Kích thước mẫu đo: đủ để phân biệt tuyến nhanh/chậm, nhỏ để không ăn băng thông. */
    private const val PROBE_BYTES = 131_072
    /** Dưới mức này thì không tính điểm (tránh con số ảo từ vài trăm byte header). */
    private const val MIN_SAMPLE_BYTES = 16_384L
    /** Điểm chỉ có giá trị trong 3 phút — mạng đổi thì đo lại. */
    private const val SCORE_TTL_MS = 3 * 60 * 1000L
    /** Mỗi nhịp 60 s đo tối đa chừng này tuyến (2 × 128 KB ≈ 0,25 MB/phút, đủ nhanh mà không tốn). */
    private const val MAX_PROBES_PER_TICK = 2

    /** TCP connect thật tới host:port (700 ms) — "cổng mở" chứ không phải "setting đang ghi gì". */
    fun alive(hostPort: String, timeoutMs: Int = 700): Boolean {
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

