package com.privatevpn.app.api

/** Force-update gate — mirrors iOS AppVersionService. */
object AppVersionService {
    fun isForcedUpdate(info: AppVersionInfo, current: String): Boolean =
        isVersion(current, info.minimumVersion)

    fun isUpdateAvailable(info: AppVersionInfo, current: String): Boolean =
        isVersion(current, info.latestVersion)

    /**
     * Link để tải bản mới.
     *
     * Kênh Android nhận thêm `apk_url`; bản cũ chỉ đọc `store_url`. Nếu server trả rỗng
     * (đã từng xảy ra: nút "Cập nhật" bấm không mở gì) thì rơi về [fallbackUrl] — endpoint
     * phát APK chuẩn của mình.
     */
    fun updateUrl(info: AppVersionInfo, fallbackUrl: String): String =
        listOf(info.storeUrl, info.apkUrl.orEmpty()).firstOrNull { it.isNotBlank() } ?: fallbackUrl

    /** Numeric component-wise version compare ("1.0.2" < "1.0.10"). */
    fun isVersion(a: String, b: String): Boolean {
        val av = a.split(".").mapNotNull { it.toIntOrNull() }
        val bv = b.split(".").mapNotNull { it.toIntOrNull() }
        val count = maxOf(av.size, bv.size)
        for (i in 0 until count) {
            val x = if (i < av.size) av[i] else 0
            val y = if (i < bv.size) bv[i] else 0
            if (x != y) return x < y
        }
        return false
    }
}
