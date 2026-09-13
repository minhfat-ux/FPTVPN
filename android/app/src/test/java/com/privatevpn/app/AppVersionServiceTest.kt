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

    @Test fun `update url prefers store_url then apk_url`() {
        val full = com.privatevpn.app.api.AppVersionInfo(
            platform = "android",
            minimumVersion = "1.2.6",
            latestVersion = "1.2.6",
            storeUrl = "https://meetflowai.site/v1/downloads/android",
            apkUrl = "https://cdn.example.com/v.apk"
        )
        assertEquals("https://meetflowai.site/v1/downloads/android", AppVersionService.updateUrl(full, fallback))
        // store_url rỗng (lỗi cũ) nhưng có apk_url ⇒ vẫn tải được
        assertEquals(
            "https://cdn.example.com/v.apk",
            AppVersionService.updateUrl(full.copy(storeUrl = ""), fallback)
        )
        // cả hai rỗng ⇒ rơi về endpoint phát APK của mình, KHÔNG trả chuỗi rỗng
        assertEquals(fallback, AppVersionService.updateUrl(full.copy(storeUrl = "", apkUrl = null), fallback))
        assertEquals(fallback, AppVersionService.updateUrl(full.copy(storeUrl = "  ", apkUrl = ""), fallback))
    }
}
