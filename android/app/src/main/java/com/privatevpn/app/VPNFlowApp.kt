package com.privatevpn.app

import android.app.Application
import android.content.Context
import android.util.Log
import com.privatevpn.app.auth.AuthSessionStore
import com.privatevpn.app.billing.SubscriptionStore
import com.privatevpn.app.diag.DiagnosticsLog
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
        com.privatevpn.app.diag.DiagnosticsLog.init(this)
        reportPreviousCrash()
        installCrashLogger()
        secureStore = SecureStore(this)
        authStore = AuthSessionStore(secureStore)
        vpnManager = VPNManager(this, secureStore, authStore)
        subscriptionStore = SubscriptionStore(authStore)
        languageStore = LanguageStore(getSharedPreferences("vpnflow_prefs", MODE_PRIVATE))
        vpnManager.refreshDevicePublicKey()
    }

    /**
     * Ghi vết crash của lần chạy TRƯỚC vào diagnostics.log.
     *
     * Vì sao cần: khách báo *"cài lên TV Xiaomi Redmi, bật VPN lên là thoát app"* (23/09/2026).
     * Trên TV gần như không có cách lấy logcat, mà crash thì để lại đúng một dấu vết — nếu không
     * lưu lại thì lần sau mở app chẳng còn gì để đọc. Đọc xong XOÁ ngay để không báo lặp lại.
     */
    private fun reportPreviousCrash() {
        runCatching {
            val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val crash = prefs.getString(KEY_LAST_CRASH, null) ?: return
            prefs.edit().remove(KEY_LAST_CRASH).apply()
            DiagnosticsLog.warn("app: LẦN CHẠY TRƯỚC BỊ THOÁT (crash) ->\n$crash")
            Log.e("VPNFLOW_DEBUG", "previous crash:\n$crash")
        }
    }

    /**
     * Bắt mọi exception không được xử lý: ghi stack vào diagnostics.log + lưu lại cho lần chạy sau,
     * rồi mới chuyển cho handler mặc định (giữ nguyên hành vi hệ thống).
     *
     * Không bắt được lỗi native (Go/panic) — nếu app VẪN thoát sau bản này thì kết luận được ngay
     * là lỗi ở tầng native, không phải exception của Kotlin.
     */
    private fun installCrashLogger() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val stack = Log.getStackTraceString(error)
                DiagnosticsLog.warn(
                    "app: CRASH ở thread ${thread.name} -> ${error.javaClass.name}: ${error.message}\n$stack",
                )
                val entry = "thread=${thread.name}\n$stack".take(8_000)
                getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY_LAST_CRASH, entry).apply()
            }
            previous?.uncaughtException(thread, error)
        }
    }

    private companion object {
        const val PREFS = "vpnflow_crash"
        const val KEY_LAST_CRASH = "last_crash"
    }
}
