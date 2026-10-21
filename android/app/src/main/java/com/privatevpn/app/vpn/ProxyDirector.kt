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
    fun gatewayAddress(context: Context): String =
        prefs(context).getString(Config.KEY_PROXY_GATEWAY, null)
            ?.takeIf { it.contains(":") && it.isNotBlank() }
            ?: Config.PROXY_GATEWAY_DEFAULT

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

    /** Giá trị proxy nên dùng ngay lúc này (`:0` = gỡ). Chỉ gọi từ luồng nền (có connect). */
    fun decide(context: Context): String {
        val tv = tvProxy()
        val gateway = gatewayAddress(context)
        return when (mode(context)) {
            Config.PROXY_MODE_TV ->
                if (alive(tv)) tv else ":0"
            Config.PROXY_MODE_GATEWAY ->
                if (alive(gateway)) gateway else ":0"
            else -> when {
                alive(tv) -> tv
                alive(gateway) -> gateway
                else -> ":0"
            }
        }
    }

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
