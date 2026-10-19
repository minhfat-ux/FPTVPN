package com.privatevpn.app.vpn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings

/**
 * Dọn proxy hệ thống còn sót **sau khi khởi động lại**.
 *
 * Vì sao cần: máy không có TUN phải chạy chế độ proxy nội bộ (`127.0.0.1:1081`), và Android lưu
 * `Settings.Global.http_proxy` bền qua reboot. Nếu lần khởi động trước app bị kill khi proxy đang
 * bật thì sau reboot **mọi app tôn trọng proxy đều mất mạng** cho tới khi người dùng mở lại app.
 * Đo thật trên TV `MiTV-AFZP0` 20/10/2026: reboot xong `settings get global http_proxy` vẫn trả
 * `127.0.0.1:1081` trong khi không có tiến trình nào giữ cổng 1081.
 *
 * Chỉ đụng đúng giá trị proxy của chính mình; `:0` là cách Android hiểu "không dùng proxy".
 */
class ProxyCleanupReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        runCatching {
            val resolver = context.contentResolver
            val current = Settings.Global.getString(resolver, "http_proxy").orEmpty()
            if (!current.startsWith("127.0.0.1")) return
            Settings.Global.putString(resolver, "http_proxy", ":0")
            android.util.Log.i(
                "VPNFLOW_DEBUG",
                "boot: đã dọn proxy hệ thống còn sót ($current) — tránh mất mạng sau reboot",
            )
        }
    }
}
