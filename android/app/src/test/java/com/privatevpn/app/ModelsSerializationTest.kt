package com.privatevpn.app

import com.privatevpn.app.api.CoordinatorAuthSession
import com.privatevpn.app.api.CoordinatorRegisterResponse
import com.privatevpn.app.api.CoordinatorSubscriptionStatus
import com.privatevpn.app.api.CoordinatorUser
import com.privatevpn.app.api.ExitNode
import com.privatevpn.app.api.NodesResponse
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/** Verifies backend JSON parsing (snake_case keys, unknown-key tolerance). */
class ModelsSerializationTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun `parse nodes response`() {
        val raw = """{"nodes":[
            {"id":"node-1","name":"vietnam-1","country":"VN","city":"Hanoi",
             "endpoint":"103.173.155.50:443","public_key":"N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8="}
        ]}"""
        val resp = json.decodeFromString<NodesResponse>(raw)
        assertEquals(1, resp.nodes.size)
        assertEquals("node-1", resp.nodes[0].id)
        assertEquals("103.173.155.50:443", resp.nodes[0].endpoint)
    }

    @Test fun `parse register response`() {
        val raw = """{"peer_id":"p1","overlay_ip":"10.77.0.9","network":"10.77.0.0/24",
            "peer_credential":"cred1","peers":[]}"""
        val resp = json.decodeFromString<CoordinatorRegisterResponse>(raw)
        assertEquals("10.77.0.9", resp.overlayIp)
        assertEquals("cred1", resp.peerCredential)
    }

    @Test fun `parse auth session with subscription status`() {
        val raw = """{"access_token":"tok123","token_type":"bearer",
            "user":{"id":"u1","email":"a@b.com",
              "subscription_status":{"is_active":true,"product_id":"Monthly_Premium","expires_at":"2026-09-22T00:00:00Z"}}}"""
        val session = json.decodeFromString<CoordinatorAuthSession>(raw)
        assertEquals("tok123", session.accessToken)
        assertNotNull(session.user.subscriptionStatus)
        assertEquals(true, session.user.subscriptionStatus?.isActive)
        assertEquals("Monthly_Premium", session.user.subscriptionStatus?.productId)
    }

    @Test fun `exit node fallback contains working vn endpoints`() {
        val nodes = com.privatevpn.app.api.ExitNodeFallback.builtIn
        assertEquals(2, nodes.size)
        assertEquals("103.173.155.50:443", nodes[0].endpoint)
        assertEquals("VN", nodes[0].country)
    }
}
