package com.privatevpn.app

import com.privatevpn.app.api.AppVersionService
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppVersionServiceTest {
    @Test fun `version compare numeric component-wise`() {
        assertTrue(AppVersionService.isVersion("1.0.2", "1.0.10"))
        assertTrue(AppVersionService.isVersion("1.0", "1.1"))
        assertTrue(AppVersionService.isVersion("1.0.0", "1.0.1"))
        assertFalse(AppVersionService.isVersion("1.0.10", "1.0.2"))
        assertFalse(AppVersionService.isVersion("2.0", "1.9"))
        assertFalse(AppVersionService.isVersion("1.0.1", "1.0.1"))
        // shorter left pads with zeros
        assertTrue(AppVersionService.isVersion("1.0", "1.0.1"))
    }

    /**
     * Hậu tố của flavor TV (`versionNameSuffix = "-tv"`) KHÔNG được làm version tụt xuống.
     *
     * Ca thật 19/10/2026: `1.4.5-tv` bị đọc thành `[1, 4]` ⇒ nhỏ hơn `1.4.0`…`1.4.5` ⇒ nếu server
     * nâng `minimum_version` lên ≥ 1.4 thì mọi TV kẹt màn ÉP CẬP NHẬT vĩnh viễn và tải nhầm APK
     * điện thoại. Test này khoá lại cả hai chiều.
     */
    @Test fun `version co hau to -tv cua flavor TV khong bi tut xuong`() {
        // Bản TV đang chạy ĐÚNG bằng mốc ⇒ KHÔNG bị ép cập nhật, KHÔNG báo có bản mới
        assertFalse(AppVersionService.isVersion("1.4.6-tv", "1.4.6"))
        assertFalse(AppVersionService.isVersion("1.4.6-tv", "1.4.5"))
        // Bản TV cũ hơn mốc ⇒ vẫn phải bị coi là cũ (không được "tha" hết)
        assertTrue(AppVersionService.isVersion("1.4.5-tv", "1.4.6"))
        assertTrue(AppVersionService.isVersion("1.3.3-tv", "1.4.6"))
        // Hậu tố khác cũng chịu được (phòng khi đổi tên flavor)
        assertFalse(AppVersionService.isVersion("1.4.6-beta", "1.4.6"))
        assertTrue(AppVersionService.isVersion("1.4.6-beta", "1.4.7"))

        val tv = com.privatevpn.app.api.AppVersionInfo(
            platform = "android-tv",
            minimumVersion = "1.4.6",
            latestVersion = "1.4.6",
            storeUrl = "https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk"
        )
        assertFalse(AppVersionService.isForcedUpdate(tv, "1.4.6-tv"))
        assertFalse(AppVersionService.isUpdateAvailable(tv, "1.4.6-tv"))
        assertTrue(AppVersionService.isForcedUpdate(tv, "1.4.3-tv"))
    }

    @Test fun `forced update below minimum`() {
        val info = com.privatevpn.app.api.AppVersionInfo(
            platform = "android",
            minimumVersion = "1.2.0",
            latestVersion = "1.2.1",
            storeUrl = "https://play.google.com/store/apps/details?id=com.privatevpn.app"
        )
        assertTrue(AppVersionService.isForcedUpdate(info, "1.1.9"))
        assertFalse(AppVersionService.isForcedUpdate(info, "1.2.0"))
        assertTrue(AppVersionService.isUpdateAvailable(info, "1.2.0"))
    }

    private val fallback = "https://api.meetflowai.site/v1/downloads/android"
    private val fallbackLegacy = "https://api.meetflowai.site/v1/downloads/android-legacy"

    @Test fun `update url prefers store_url then apk_url`() {
        val full = com.privatevpn.app.api.AppVersionInfo(
            platform = "android",
            minimumVersion = "1.2.6",
            latestVersion = "1.2.6",
            storeUrl = "https://meetflowai.site/v1/downloads/android",
            apkUrl = "https://cdn.example.com/v.apk"
        )
        assertEquals(
            "https://meetflowai.site/v1/downloads/android",
            AppVersionService.updateUrl(full, fallback, 34)
        )
        // store_url rỗng (lỗi cũ) nhưng có apk_url ⇒ vẫn tải được
        assertEquals(
            "https://cdn.example.com/v.apk",
            AppVersionService.updateUrl(full.copy(storeUrl = ""), fallback, 34)
        )
        // cả hai rỗng ⇒ rơi về endpoint phát APK của mình, KHÔNG trả chuỗi rỗng
        assertEquals(fallback, AppVersionService.updateUrl(full.copy(storeUrl = "", apkUrl = null), fallback, 34))
        assertEquals(fallback, AppVersionService.updateUrl(full.copy(storeUrl = "  ", apkUrl = ""), fallback, 34))
    }

    @Test fun `may Android 7 lay ban legacy, khong lay APK minSdk 26`() {
        val info = com.privatevpn.app.api.AppVersionInfo(
            platform = "android",
            minimumVersion = "1.2.6",
            latestVersion = "1.2.6",
            storeUrl = "https://meetflowai.site/v1/downloads/android",
            apkUrl = "https://meetflowai.site/v1/downloads/android",
            apkUrlLegacy = "https://meetflowai.site/v1/downloads/android-legacy"
        )
        // Android 7.1 (SDK 25) và 7.0 (24) → bản legacy
        for (sdk in listOf(24, 25)) {
            assertEquals(
                "https://meetflowai.site/v1/downloads/android-legacy",
                AppVersionService.updateUrl(info, fallback, sdk, fallbackLegacy)
            )
        }
        // Android 8+ (26 trở lên) → bản thường
        for (sdk in listOf(26, 34)) {
            assertEquals(
                "https://meetflowai.site/v1/downloads/android",
                AppVersionService.updateUrl(info, fallback, sdk, fallbackLegacy)
            )
        }
        // server thiếu apk_url_legacy ⇒ dùng endpoint legacy của mình, KHÔNG đưa APK minSdk 26
        val noLegacy = info.copy(apkUrlLegacy = null)
        assertEquals(
            fallbackLegacy,
            AppVersionService.updateUrl(noLegacy, fallback, 24, fallbackLegacy)
        )
    }
}
