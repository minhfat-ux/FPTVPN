package com.privatevpn.app.diag

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

/**
 * On-device diagnostics for the "still connected but no internet after the phone
 * moves from WiFi to mobile data" investigation.
 *
 * Everything is written twice:
 *  - logcat, tag `VPNFLOW_DIAG` (filter with `adb logcat -s VPNFLOW_DIAG`), and
 *  - a capped file in the app's external files dir
 *    (`Android/data/com.privatevpn.app/files/diagnostics.log`) that survives the
 *    phone being carried outside, so it can be pulled/pasted afterwards.
 *
 * The live fields below are updated by the tunnel service and the WG relay so a
 * periodic probe can report whether traffic is still flowing.
 */
object DiagnosticsLog {

    private const val TAG = "VPNFLOW_DIAG"
    private const val MAX_LINES = 1500
    private const val MAX_BYTES = 512 * 1024L

    private val fmt = SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US)
    private val lock = Any()
    private val lines = ArrayDeque<String>()
    @Volatile private var file: File? = null

    // ---- live transport state -------------------------------------------------
    /** e.g. "wg-relay", "hysteria:tcp:8443", "none". */
    @Volatile var transport: String = "none"
    /** True while the tunnel (TUN fd) is serving traffic. */
    @Volatile var tunnelUp: Boolean = false
    @Volatile var relayConnected: Boolean = false
    @Volatile var relayRxBytes: Long = 0
    @Volatile var relayTxBytes: Long = 0
    /** Epoch millis of the last byte received from/sent to the relay (0 = never). */
    @Volatile var relayLastRxAt: Long = 0
    @Volatile var relayLastTxAt: Long = 0

    fun init(context: Context) {
        synchronized(lock) {
            if (file != null) return
            val dir = context.getExternalFilesDir(null) ?: context.filesDir
            val f = File(dir, "diagnostics.log")
            runCatching { if (f.exists() && f.length() > MAX_BYTES) f.delete() }
            file = f
        }
        log("=== diagnostics session start (app ${appVersion(context)}) ===")
    }

    /** Absolute path of the diagnostics file (nil until [init]). */
    fun path(): String? = file?.absolutePath

    fun log(event: String) = write(Log.INFO, event)

    fun warn(event: String) = write(Log.WARN, event)

    private fun write(priority: Int, event: String) {
        val stamp = fmt.format(Date())
        val line = "$stamp ${if (priority >= Log.WARN) "W" else "I"} $event"
        Log.println(priority, TAG, event)
        synchronized(lock) {
            lines.addLast(line)
            while (lines.size > MAX_LINES) lines.removeFirst()
            val f = file ?: return
            runCatching {
                if (f.length() > MAX_BYTES) f.writeText("")
                f.appendText(line + "\n")
            }
        }
    }

    /** Whole in-memory buffer (newest last). */
    fun dump(): String = synchronized(lock) { lines.joinToString("\n") }

    fun clear() = synchronized(lock) {
        lines.clear()
        runCatching { file?.writeText("") }
    }

    private fun appVersion(context: Context): String = runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
    }.getOrDefault("?")
}
