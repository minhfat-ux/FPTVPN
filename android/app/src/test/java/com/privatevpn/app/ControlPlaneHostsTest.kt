package com.privatevpn.app

import com.privatevpn.app.api.ControlPlaneHosts
import com.privatevpn.app.api.PreferredHost
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Khoá thứ tự host và URL web: host chính trước, rồi host dự phòng theo TÊN (chống chặn SNI),
 * rồi host dự phòng ghim IP; trang mua bám theo host đang dùng được.
 */
class ControlPlaneHostsTest {

    @After
    fun resetPreference() {
        ControlPlaneHosts.forget()
    }

    @Test
    fun `host order is primary then t1 then pinned fallbacks`() {
        assertEquals(Config.CONTROL_PLANE_URL, ControlPlaneHosts.orderedApiBases.first())
        assertEquals("https://t1.meetflowai.site", ControlPlaneHosts.orderedApiBases[1])
        assertTrue(ControlPlaneHosts.orderedApiBases.contains("https://fcnvpn.tail303be3.ts.net"))
        assertEquals(
            "fallbackApiBases = mọi host trừ host chính",
            ControlPlaneHosts.orderedApiBases.drop(1),
            ControlPlaneHosts.fallbackApiBases,
        )
    }

    @Test
    fun `buy url follows the active host`() {
        ControlPlaneHosts.forget()
        assertEquals("https://meetflowai.site/buy", ControlPlaneHosts.buyUrl())

        PreferredHost.remember("https://t1.meetflowai.site")
        assertEquals("https://t1.meetflowai.site/buy", ControlPlaneHosts.buyUrl())

        // Host dùng chung (Tailscale) không phục vụ web riêng -> lùi về web chính.
        PreferredHost.remember("https://fcnvpn.tail303be3.ts.net")
        assertEquals("https://meetflowai.site/buy", ControlPlaneHosts.buyUrl())
    }
}
