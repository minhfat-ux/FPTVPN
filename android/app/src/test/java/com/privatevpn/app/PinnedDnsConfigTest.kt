package com.privatevpn.app

import java.net.InetAddress
import java.net.URI
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Khoá hành vi "đường thoát không phụ thuộc DNS": mọi host mà app BẮT BUỘC phải vào được khi
 * IP node bị chặn (API + relay WS) đều phải có IP ghim, và IP ghim phải là literal — nếu ai
 * xoá/đổi sang hostname thì test này đỏ trước khi app ra tới khách.
 */
class PinnedDnsConfigTest {

    @Test
    fun `api host and ws relay host are pinned to literal addresses`() {
        val apiHost = URI(Config.CONTROL_PLANE_URL).host
        val relayHost = URI(Config.WS_RELAY_URL).host

        assertTrue("host API phải có IP ghim", Config.PINNED_HOST_ADDRESSES.containsKey(apiHost))
        assertTrue("host relay WS phải có IP ghim", Config.PINNED_HOST_ADDRESSES.containsKey(relayHost))

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
