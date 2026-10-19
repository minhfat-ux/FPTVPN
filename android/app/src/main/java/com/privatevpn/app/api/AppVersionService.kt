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
     * Kênh Android nhận `apk_url`; bản cũ chỉ đọc `store_url`. Nếu server trả rỗng (đã từng
     * xảy ra: nút "Cập nhật" bấm không mở gì) thì rơi về `fallbackUrl` — endpoint phát APK
     * của mình.
     *
     * Máy Android 7.0/7.1 và Fire OS (Fire TV Stick 4K) **không cài được** APK thường
     * (minSdk 26) — chúng báo "There was a problem parsing the package". Vì vậy với
     * `sdkInt < 26` phải lấy bản `apk_url_legacy` (minSdk 24), không thì màn ép cập nhật
     * chặn cứng nhóm người dùng này.
     */
    fun updateUrl(
        info: AppVersionInfo,
        fallbackUrl: String,
        sdkInt: Int,
        fallbackLegacyUrl: String = fallbackUrl,
    ): String {
        if (sdkInt in 1..25) {
            return listOf(info.apkUrlLegacy.orEmpty(), fallbackLegacyUrl)
                .firstOrNull { it.isNotBlank() } ?: fallbackLegacyUrl
        }
        return listOf(info.storeUrl, info.apkUrl.orEmpty(), fallbackUrl)
            .firstOrNull { it.isNotBlank() } ?: fallbackUrl
    }

    /**
     * Numeric component-wise version compare ("1.0.2" < "1.0.10").
     *
     * Mỗi khúc chỉ lấy **phần chữ số ở đầu** (`"5-tv"` → `5`, `"10-beta"` → `10`). Vì sao: flavor TV
     * khai `versionNameSuffix = "-tv"` nên versionName thật là `1.4.6-tv`; cách cũ (`toIntOrNull` rồi
     * `mapNotNull`) **bỏ mất** khúc đó (`"5-tv"` → null ⇒ `[1, 4]`), làm `1.4.6-tv` bị coi là `1.4` và
     * nhỏ hơn MỌI bản `1.4.x` ⇒ hễ server nâng `minimum_version` lên `1.4.x` là **mọi app TV kẹt màn
     * ÉP CẬP NHẬT vĩnh viễn** (ca thật 19/10/2026 — xem
     * `docs/handoff/PUBLISH_ANDROID_1.4.5_37_2026-10-19.md` §4a).
     */
    fun isVersion(a: String, b: String): Boolean {
        val av = components(a)
        val bv = components(b)
        val count = maxOf(av.size, bv.size)
        for (i in 0 until count) {
            val x = if (i < av.size) av[i] else 0
            val y = if (i < bv.size) bv[i] else 0
            if (x != y) return x < y
        }
        return false
    }

    /** Các khúc số của một version: lấy phần chữ số ĐẦU của từng khúc (`"5-tv"` → 5). */
    private fun components(v: String): List<Int> =
        v.split(".").map { part -> part.takeWhile { it.isDigit() }.toIntOrNull() ?: 0 }
}
