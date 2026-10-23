package com.privatevpn.app.vpn

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog

/**
 * Giữ VPN sống trên TV: **tự bật khi TV khởi động** và **tự dựng lại nếu bị hệ thống giết**.
 *
 * Vì sao cần (yêu cầu chủ dự án 20/10/2026 cho TV `MiTV-AFZP0`): TV chạy ROM Tàu có bộ dọn
 * (`PeriodicCleaner` ghi thẳng `OverTimePackage:com.privatevpn.app.tv.dev`), và màn hình chờ
 * (screensaver) làm app bị đưa xuống nền rồi bị kill. Khi service chết thì proxy hệ thống
 * `127.0.0.1:1081` không còn ai nghe ⇒ TV mất mạng cho mọi app tôn trọng proxy.
 *
 * Hai lớp:
 *  1. `BOOT_COMPLETED` / `MY_PACKAGE_REPLACED` ⇒ mở service ngay (service tự kết nối).
 *  2. Chuông báo thức mỗi [INTERVAL_MS] ⇒ nếu service không chạy thì dựng lại (AlarmManager đánh
 *     thức được cả khi tiến trình app đã chết), rồi tự hẹn chuông kế tiếp.
 */
object VpnKeepAlive {

    /** Nhịp tự kiểm: 3 phút. TV cắm điện nên chi phí không đáng kể; hồi nhanh khi bị giết. */
    private const val INTERVAL_MS = 60 * 1000L
    /** Khi bị hệ thống chặn dựng service ở nền: thử lại sớm (20 s) thay vì đợi cả phút. */
    private const val RETRY_AFTER_BLOCKED_MS = 20 * 1000L
    private const val ACTION_KEEPALIVE = "com.privatevpn.app.vpn.KEEPALIVE"
    private const val REQ_CODE = 7201

    /** Relay WS của VPS1 (node-1) — dùng khi service được dựng từ receiver (không có VPNManager). */
    private const val VPS1_WS_RELAY = "wss://api.meetflowai.site/relay/vn1hy"

    /** Bật service (kèm tự kết nối) nếu chưa chạy; an toàn khi gọi nhiều lần. */
    fun ensureRunning(context: Context) {
        // CHỌN TUYẾN TRƯỚC khi dựng lại service: nếu lần trước service bị kill khi proxy đang trỏ
        // 1081 thì TV đang mất mạng. [ProxyDirector] kiểm cổng bằng TCP thật rồi chọn theo chế độ
        // trong Settings: đường TV (1081) → gateway LAN → gỡ hẳn. Nhờ vậy nhịp này không còn "chỉ
        // xoá proxy" mà còn TỰ NHẢY sang đường dự phòng khi đường TV chết (yêu cầu chủ dự án 22/10/2026).
        ProxyDirector.enforce(context)
        // Chế độ "chỉ gateway LAN": tunnel của app là VÔ NGHĨA (proxy không bao giờ trỏ 1081) và còn
        // tốn CPU/băng thông ⇒ không dựng service, chỉ giữ chuông tự kiểm để còn nhảy lại khi đổi chế độ.
        if (ProxyDirector.mode(context) == Config.PROXY_MODE_GATEWAY) {
            schedule(context)
            return
        }
        if (HysteriaVpnService.serviceRunning) {
            schedule(context)
            return
        }
        runCatching {
            val intent = Intent(context, HysteriaVpnService::class.java).apply {
                putExtra(HysteriaVpnService.EXTRA_HOST, Config.HY_SERVER)
                putStringArrayListExtra(
                    HysteriaVpnService.EXTRA_HOST_RELAYS,
                    arrayListOf(Config.HY_SERVER, VPS1_WS_RELAY),
                )
                putExtra(HysteriaVpnService.EXTRA_MULTI_TUNNEL, HysteriaVpnService.PROXY_MIN_TUNNELS)
            }
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            DiagnosticsLog.log("keepalive: đã yêu cầu service VPN chạy (host=${Config.HY_SERVER})")
        }.onFailure {
            // Xiaomi TV chặn startForegroundService từ background:
            //   AppsRelaunchController: Refused to start foreground service (... isCallerSystem=false)
            // (handoff HANDOFF-WINDOWS-TUNNEL-KEEPALIVE-2026-10-23). Khi đó hẹn lại SỚM (20 s) thay vì
            // đợi 60 s, và cứ mỗi lượt thử sẽ có thêm cơ hội rơi vào cửa sổ allowlist (alarm/notification).
            DiagnosticsLog.warn("keepalive: KHÔNG dựng lại được service: ${it.javaClass.simpleName}: ${it.message}")
            blockedRetry = true
        }
        schedule(context, if (blockedRetry) RETRY_AFTER_BLOCKED_MS else INTERVAL_MS)
    }

    /** true khi lần dựng service gần nhất bị hệ thống từ chối (đang bị chặn ở nền). */
    @Volatile private var blockedRetry = false

    // Ghi chú: hàm "chỉ dọn proxy 127.0.0.1" cũ đã được thay bằng [ProxyDirector.enforce] — nó vừa
    // kiểm cổng vừa chọn tuyến theo chế độ (auto/tv/gateway), nên không còn cảnh "xoá proxy rồi để
    // TV đi thẳng" khi vẫn còn gateway dự phòng sống.

    /** Hẹn chuông tự kiểm kế tiếp (ghi đè chuông cũ). */
    fun schedule(context: Context, delayMs: Long = INTERVAL_MS) {
        runCatching {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val pi = pendingIntent(context)
            val at = SystemClock.elapsedRealtime() + delayMs
            // EXACT + allow-while-idle: khi chuông nổ, app được cấp "temporary power allowlist" ~10 s
            // nên startForegroundService ĐƯỢC PHÉP (khác setAndAllowWhileIdle thường — đây là điểm
            // khiến Xiaomi từ chối dựng lại service, xem handoff keepalive 23/10/2026).
            val exactOk = runCatching {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
                true
            }.getOrDefault(false)
            if (!exactOk) {
                if (Build.VERSION.SDK_INT >= 23) {
                    am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
                } else {
                    am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
                }
            }
        }.onFailure {
            DiagnosticsLog.warn("keepalive: KHÔNG hẹn được chuông: ${it.message}")
        }
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, KeepAliveReceiver::class.java).setAction(ACTION_KEEPALIVE)
        val flags = if (Build.VERSION.SDK_INT >= 23) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getBroadcast(context, REQ_CODE, intent, flags)
    }

    /** Nhận chuông: dựng lại service nếu cần + hẹn chuông kế tiếp. */
    class KeepAliveReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent?) {
            DiagnosticsLog.log("keepalive: chuông 10 phút -> kiểm tra service")
            ensureRunning(context)
        }
    }
}
