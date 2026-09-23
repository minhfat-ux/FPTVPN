package com.privatevpn.app

import java.net.InetAddress
import java.net.URI
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Khoá hành vi "đường thoát không phụ thuộc DNS": host mà app BẮT BUỘC phải vào được khi IP
 * node bị chặn (relay WS/Tailscale) phải có IP ghim, và IP ghim phải là literal — nếu ai
 * xoá/đổi sang hostname thì test này đỏ trước khi app ra tới khách.
 *
 * Cập nhật 23/09/2026: test cũ khẳng định CẢ host API phải có IP ghim, trong khi quyết định
 * 18/09/2026 (ghi ngay trong `Config.PINNED_HOST_ADDRESSES`) là **cố ý KHÔNG ghim** host đó.
 * Test cũ vì thế đỏ suốt từ 18/09 và chặn cả `:app:testModernDebugUnitTest`; nay tách thành
 * hai test: một test khoá ĐIỀU PHẢI CÓ (relay + host dự phòng), một test khoá CHỦ Ý KHÔNG GHIM
 * (host API) kèm lý do, để không ai vô tình ghim lại.
 */
class PinnedDnsConfigTest {

    @Test
    fun `relay WS va moi host du phong deu phai co IP ghim literal`() {
        val relayHost = URI(Config.WS_RELAY_URL).host
        assertTrue("host relay WS phải có IP ghim", Config.PINNED_HOST_ADDRESSES.containsKey(relayHost))

        assertTrue("phải có ít nhất một host được ghim", Config.PINNED_HOST_ADDRESSES.isNotEmpty())
        Config.PINNED_HOST_ADDRESSES.forEach { (host, addresses) ->
            assertTrue("$host phải có ít nhất một IP ghim", addresses.isNotEmpty())
            addresses.forEach { literal ->
                assertEquals(
                    "$literal phải là IP literal (không cần resolver)",
                    literal,
                    InetAddress.getByName(literal).hostAddress,
                )
            }
        }
    }

    @Test
    fun `host API co y khong ghim IP`() {
        // Quyết định 18/09/2026: bản ghim trước đây trỏ vào IP của 2 node, mà trên data di động
        // Trung Quốc IP node bị chặn ⇒ mỗi lần kết nối phải chờ hết timeout (~8s) rồi mới rơi về
        // DNS hệ thống (Cloudflare) — đúng triệu chứng "connecting rất lâu" trên 4G/5G. Đường
        // thoát thật khi IP node bị chặn là relay WS/Tailscale, đã được ghim ở test phía trên.
        val apiHost = URI(Config.CONTROL_PLANE_URL).host
        assertFalse(
            "api host KHÔNG được ghim IP (quyết định 18/09/2026 — xem Config.PINNED_HOST_ADDRESSES)",
            Config.PINNED_HOST_ADDRESSES.containsKey(apiHost),
        )
    }

    @Test
    fun `every fallback base is https and has a pinned address`() {
        assertTrue("phải có ít nhất một host dự phòng", Config.API_FALLBACK_BASES.isNotEmpty())
        Config.API_FALLBACK_BASES.forEach { base ->
            val uri = URI(base)
            assertEquals("host dự phòng phải là https: $base", "https", uri.scheme)
            assertTrue(
                "host dự phòng $base phải có IP ghim",
                Config.PINNED_HOST_ADDRESSES.containsKey(uri.host),
            )
        }
    }
}
