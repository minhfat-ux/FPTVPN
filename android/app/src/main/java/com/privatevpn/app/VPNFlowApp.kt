package com.privatevpn.app

import android.app.Application
import android.content.Context
import android.util.Log
import com.privatevpn.app.auth.AuthSessionStore
import com.privatevpn.app.billing.SubscriptionStore
import com.privatevpn.app.diag.DiagnosticsLog
import com.privatevpn.app.diag.PublicReport
import com.privatevpn.app.l10n.LanguageStore
import com.privatevpn.app.storage.SecureStore
import com.privatevpn.app.vpn.VPNManager

/** Application container — owns the shared stores/managers. */
class VPNFlowApp : Application() {
    lateinit var secureStore: SecureStore
        private set
    lateinit var authStore: AuthSessionStore
        private set
    lateinit var vpnManager: VPNManager
        private set
    lateinit var subscriptionStore: SubscriptionStore
        private set
    lateinit var languageStore: LanguageStore
        private set

    override fun onCreate() {
        super.onCreate()
        DiagnosticsLog.init(this)
        val previousCrash = takePreviousCrash()
        if (previousCrash != null) {
            DiagnosticsLog.warn("app: LẦN CHẠY TRƯỚC BỊ THOÁT (crash) ->\n$previousCrash")
            Log.e("VPNFLOW_DEBUG", "previous crash:\n$previousCrash")
        }
        installCrashLogger()
        // Xuất báo cáo NGAY khi khởi động: bản công khai trong Downloads lấy được bằng USB / app quản
        // lý file có sẵn trên TV (xem PublicReport). Nhờ vậy TV không có logcat vẫn có bằng chứng.
        exportReport(previousCrash)
        secureStore = SecureStore(this)
        authStore = AuthSessionStore(secureStore)
        vpnManager = VPNManager(this, secureStore, authStore)
        subscriptionStore = SubscriptionStore(authStore)
        languageStore = LanguageStore(getSharedPreferences("vpnflow_prefs", MODE_PRIVATE))
        vpnManager.refreshDevicePublicKey()
    }

    /** Đọc vết crash của lần chạy trước rồi XOÁ (không báo lặp lại ở các lần sau). */
    private fun takePreviousCrash(): String? = runCatching {
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val crash = prefs.getString(KEY_LAST_CRASH, null) ?: return null
        prefs.edit().remove(KEY_LAST_CRASH).apply()
        crash
    }.getOrNull()

    /**
     * Bắt mọi exception không được xử lý: ghi stack vào diagnostics.log + lưu lại cho lần chạy sau,
     * xuất luôn báo cáo công khai, rồi mới chuyển cho handler mặc định (giữ nguyên hành vi hệ thống).
     *
     * Không bắt được lỗi native (Go/panic) hay bị hệ thống giết vì hết RAM — nếu app VẪN thoát mà
     * báo cáo không có mục "crash" nào thì kết luận được ngay là một trong hai trường hợp đó
     * (báo cáo vẫn có phần RAM/thiết bị để loại trừ dần).
     */
    private fun installCrashLogger() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val stack = Log.getStackTraceString(error)
                DiagnosticsLog.warn("app: CRASH ở thread ${thread.name} -> ${error.javaClass.name}: ${error.message}\n$stack")
                val entry = "thread=${thread.name}\n$stack".take(8_000)
                getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY_LAST_CRASH, entry).apply()
                // Xuất ngay, vì sau đây tiến trình sẽ chết.
                exportReport(entry)
            }
            previous?.uncaughtException(thread, error)
        }
    }

    /** Báo cáo công khai: thông tin máy + vết crash (nếu có) + log gần nhất. */
    private fun exportReport(crash: String?) {
        runCatching {
            val body = buildString {
                appendLine("=== VPNFlow report (Android / TV) ===")
                appendLine(PublicReport.deviceInfo(this@VPNFlowApp))
                appendLine("--- crash lần chạy trước / vừa xảy ra ---")
                appendLine(crash ?: "(không có)")
                appendLine("--- log gần nhất ---")
                appendLine(DiagnosticsLog.dump().takeLast(8_000))
            }
            PublicReport.write(this, body)?.let { DiagnosticsLog.log("app: đã xuất báo cáo ra $it") }
        }
    }

    private companion object {
        const val PREFS = "vpnflow_crash"
        const val KEY_LAST_CRASH = "last_crash"
    }
}
