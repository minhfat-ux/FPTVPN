package com.privatevpn.app

import com.privatevpn.app.vpn.WireGuardPeer
import com.privatevpn.app.vpn.WireGuardTunnelConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Verifies the wg-quick config builder produces a parseable WireGuard Config. */
class WireGuardConfigTest {

    private fun sampleConfig(): WireGuardTunnelConfig {
        // Real keypair from the WireGuard library (validates in Config.parse).
        val pair = com.wireguard.crypto.KeyPair()
        return WireGuardTunnelConfig(
            privateKeyBase64 = pair.privateKey.toBase64(),
            addresses = listOf("10.77.0.9/24"),
            dnsServers = listOf("1.1.1.1"),
            peers = listOf(
                WireGuardPeer(
                    publicKeyBase64 = "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=",
                    endpoint = "103.173.155.50:443",
                    allowedIPs = listOf("0.0.0.0/0"),
                    persistentKeepAlive = 25,
                )
            ),
        )
    }

    @Test fun `builds wg quick config that the tunnel library parses`() {
        val wg = sampleConfig().toWgQuickConfig()
        assertNotNull(wg)
        // Parsed Config exposes interface + peers (real validation happened in parse).
        assertEquals(1, wg.getPeers().size)
        assertEquals("10.77.0.9", wg.getInterface().getAddresses().first().getAddress().hostAddress)
        assertEquals("1.1.1.1", wg.getInterface().getDnsServers().first().hostAddress)
    }

    @Test fun `tunnel name valid per library rules`() {
        assertTrue(!com.wireguard.android.backend.Tunnel.isNameInvalid("vpnflow"))
        assertEquals("vpnflow", com.privatevpn.app.Config.WG_TUNNEL_NAME)
    }
}
