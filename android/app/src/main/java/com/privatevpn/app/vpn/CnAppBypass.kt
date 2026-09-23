package com.privatevpn.app.vpn

import android.content.Context
import android.net.VpnService
import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog
import java.net.HttpURLConnection
import java.net.URL

/**
 * Bypass app Trung Quốc: các app này KHÔNG đi qua VPN (yêu cầu chủ dự án 22/09/2026 —
 * "khi bật vpn, các app Trung quốc cần có đường riêng và không dùng vpn để connect vào",
 * ví dụ WeChat, Alipay, Meituan, Didi, Taobao…).
 *
 * Vì sao phải làm: đi full-tunnel thì traffic của app TQ ra exit nước ngoài, server TQ thấy IP
 * nước ngoài nên cắt phiên (lỗi đăng nhập / "kết nối thất bại" — đúng việc còn treo từ 19/09,
 * xem `docs/RELEASE_PLAN_2026-09-24.md` §2.2).
 *
 * Android làm được CHÍNH XÁC theo từng app: `VpnService.Builder.addDisallowedApplication(pkg)`.
 * (iOS/macOS KHÔNG có API tương đương cho app tự cài VPN — bên đó phải chia theo ĐÍCH ĐẾN/DOMAIN,
 * xem `docs/YEU_CAU_TOC_DO_ON_DINH.md`.)
 *
 * Danh sách là nguồn sự thật ở server: `https://meetflowai.site/dl/routes/cn-apps.txt` — thêm app
 * mới chỉ cần sửa file đó, KHÔNG cần phát hành app. App giữ 1 bản trong `assets/cn-apps.txt` để
 * lần đầu / lúc mất mạng vẫn có; bản tải về lưu vào SharedPreferences và chỉ thay khi hợp lệ.
 */
object CnAppBypass {
    private const val ASSET_NAME = "cn-apps.txt"
    private const val PREFS = "vpnflow_cn_bypass"
    private const val KEY_LIST = "packages"
    /** Dưới ngần này dòng thì coi như danh sách hỏng, không dùng (tránh ghi đè bằng file lỗi). */
    private const val MIN_ENTRIES = 10
    private const val FETCH_TIMEOUT_MS = 8_000

    /** Danh sách gói cần bypass: bản tải về (nếu hợp lệ) → bản trong assets → rỗng. */
    fun packages(context: Context): List<String> {
        val cached = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LIST, null)
        val fromCache = parse(cached)
        if (fromCache.size >= MIN_ENTRIES) return fromCache
        return runCatching {
            context.assets.open(ASSET_NAME).bufferedReader().use { parse(it.readText()) }
        }.getOrDefault(emptyList())
    }

    /** Bỏ chú thích sau `#`, bỏ dòng trống, chỉ nhận tên gói (có dấu chấm, không khoảng trắng). */
    private fun parse(text: String?): List<String> =
        text.orEmpty().lineSequence()
            .map { it.substringBefore('#').trim() }
            .filter { it.isNotEmpty() && it.contains('.') && !it.contains(' ') }
            .distinct()
            .toList()

    /**
     * Cập nhật danh sách từ server ở LUỒNG NỀN — KHÔNG bao giờ chặn đường connect
     * (bài học Windows 1.0.4 "connecting mãi": mọi thứ phụ thuộc mạng phải chạy nền).
     */
    fun refresh(context: Context) {
        Thread {
            val fetched = runCatching { fetch() }.getOrNull()
            val list = parse(fetched)
            if (list.size < MIN_ENTRIES) {
                DiagnosticsLog.log("cn-bypass: giữ danh sách cũ (bản tải về chỉ có ${list.size} dòng)")
                return@Thread
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY_LIST, fetched).apply()
            DiagnosticsLog.log("cn-bypass: cập nhật danh sách ${list.size} app TQ từ server")
        }.apply { isDaemon = true; name = "cn-bypass-refresh" }.start()
    }

    private fun fetch(): String {
        val conn = URL(Config.WEB_URL + "/dl/routes/cn-apps.txt").openConnection() as HttpURLConnection
        return try {
            conn.connectTimeout = FETCH_TIMEOUT_MS
            conn.readTimeout = FETCH_TIMEOUT_MS
            conn.setRequestProperty("User-Agent", "VPNFlow-Android")
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            runCatching { conn.disconnect() }
        }
    }

    /**
     * Gọi TRƯỚC `builder.establish()`. Trả về số app ĐÃ CÀI và được đưa ra ngoài tunnel.
     * Gói không có trên máy thì `addDisallowedApplication` ném NameNotFoundException → bỏ qua.
     */
    fun applyTo(builder: VpnService.Builder, context: Context): Int {
        var applied = 0
        var missing = 0
        for (pkg in packages(context)) {
            if (runCatching { builder.addDisallowedApplication(pkg) }.isSuccess) applied++ else missing++
        }
        DiagnosticsLog.log(
            "cn-bypass: $applied app TQ đi ĐƯỜNG RIÊNG (không qua VPN), " +
                "$missing gói không có trên máy",
        )
        return applied
    }
}
