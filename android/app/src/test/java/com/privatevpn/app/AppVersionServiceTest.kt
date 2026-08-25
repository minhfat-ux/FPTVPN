package com.privatevpn.app

import com.privatevpn.app.api.AppVersionService
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
}
