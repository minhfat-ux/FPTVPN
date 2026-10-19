package com.privatevpn.app.diag

import android.app.ActivityManager
import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Xuất báo cáo chẩn đoán ra thư mục **TẢI VỀ (Downloads)** công khai.
 *
 * Vì sao cần: khách báo *"bản Android cài lên TV Xiaomi Redmi, bật VPN là thoát app"* (23/09/2026).
 * `diagnostics.log` nằm trong `Android/data/<pkg>/files/` mà **từ Android 11 app quản lý file không
 * đọc được thư mục đó**, TV lại gần như không lấy được logcat, TV thì không có trình duyệt. Ghi thêm
 * một bản CÔNG KHAI vào Downloads ⇒ chỉ cần cắm USB hoặc mở app quản lý file có sẵn trên TV là lấy
 * được vết crash ⇒ có bằng chứng để sửa, không phải đoán.
 *
 * Ghi theo MediaStore (API 29+) để không cần quyền; API ≤ 28 ghi thẳng đường dẫn công khai.
 */
object PublicReport {

    const val FILE_NAME = "vpnflow-report.txt"

    /** Thông tin máy — để biết ngay đây là TV gì, còn RAM không, ABI nào. */
    fun deviceInfo(context: Context): String {
        val am = context.getSystemService(ActivityManager::class.java)
        val mi = ActivityManager.MemoryInfo().also { am?.getMemoryInfo(it) }
        val pm = context.packageManager
        val versionCode = runCatching {
            pm.getPackageInfo(context.packageName, 0).longVersionCode
        }.getOrDefault(-1L)
        val versionName = runCatching { pm.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
        return buildString {
            appendLine("model      = ${Build.MANUFACTURER} ${Build.MODEL}")
            appendLine("device     = ${Build.DEVICE} / product ${Build.PRODUCT}")
            appendLine("android    = ${Build.VERSION.RELEASE} (sdk ${Build.VERSION.SDK_INT})")
            appendLine("abi        = ${Build.SUPPORTED_ABIS.joinToString(",")}")
            appendLine("ram        = còn ${mi.availMem / 1_048_576} MB / tổng ${mi.totalMem / 1_048_576} MB, lowMemory=${mi.lowMemory}")
            appendLine("isTv       = ${pm.hasSystemFeature("android.software.leanback")}, touch=${pm.hasSystemFeature("android.hardware.touchscreen")}")
            appendLine("app        = ${context.packageName} v$versionName ($versionCode)")
            appendLine("time       = ${SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())}")
        }
    }

    /**
     * Ghi [text] vào Downloads/[FILE_NAME] (ghi đè bản cũ) **và** vào thư mục ngoài của app
     * (`Android/data/<pkg>/files/vpnflow-report.txt`).
     *
     * Ghi HAI chỗ vì mỗi đời Android cho lấy một kiểu: TV Xiaomi đang chạy **Android 9** thì thư mục
     * `Android/data` vẫn mở với app quản lý file (từ Android 11 mới bị chặn), còn máy mới thì chỉ lấy
     * được qua Downloads. Thà thừa một bản còn hơn không có bằng chứng nào.
     *
     * @return mô tả nơi đã ghi được, null nếu không ghi được chỗ nào (mọi lỗi đều bị nuốt: đây chỉ là
     *   đường lấy bằng chứng, không được làm hỏng việc chính của app).
     */
    fun write(context: Context, text: String): String? {
        val done = mutableListOf<String>()
        // (1) Thư mục ngoài của app — không cần quyền trên MỌI đời Android.
        runCatching {
            val dir = context.getExternalFilesDir(null) ?: context.filesDir
            File(dir, FILE_NAME).writeText(text)
            done += dir.absolutePath
        }
        // (2) Downloads công khai — cách lấy tiện nhất khi app quản lý file bị chặn xem Android/data.
        runCatching {
            val where = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                writeViaMediaStore(context, text)
            } else {
                writeLegacy(text)
            }
            if (where != null) done += where
        }
        return done.joinToString(" | ").ifEmpty { null }
    }

    private fun writeViaMediaStore(context: Context, text: String): String? {
        val resolver = context.contentResolver
        val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
        val selection = "${MediaStore.MediaColumns.DISPLAY_NAME} = ?"
        // Xoá bản cũ trước để không bị ghi thành (1), (2), ...
        runCatching { resolver.delete(collection, selection, arrayOf(FILE_NAME)) }
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, FILE_NAME)
            put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(collection, values) ?: return null
        resolver.openOutputStream(uri)?.use { it.write(text.toByteArray()) }
        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return "Downloads/$FILE_NAME"
    }

    @Suppress("DEPRECATION")
    private fun writeLegacy(text: String): String? {
        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!dir.exists() && !dir.mkdirs()) return null
        val f = File(dir, FILE_NAME)
        f.writeText(text)
        return f.absolutePath
    }
}
