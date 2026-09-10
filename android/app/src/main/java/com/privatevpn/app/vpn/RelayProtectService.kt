package com.privatevpn.app.vpn

import android.app.Service
import android.content.Intent
import android.net.VpnService
import java.net.Socket

/**
 * Minimal VpnService whose only job is to call protect() on the WG relay's TCP
 * socket. protect() marks the socket so it bypasses the VPN tunnel once the
 * tunnel routes 0.0.0.0/0 — otherwise the relay's own connection to the relay
 * host would be pulled into the tunnel and loop forever.
 *
 * The app must have VPN consent (VpnService.prepare) for protect() to succeed.
 */
class RelayProtectService : VpnService() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val socket = companionSocket
        companionSocket = null
        if (socket != null) {
            try { protect(socket); } catch (e: Exception) { android.util.Log.e("VPNFLOW_DEBUG", "protect failed: $e") }
        }
        stopSelf(startId)
        return Service.START_NOT_STICKY
    }

    companion object {
        @Volatile var companionSocket: Socket? = null
        fun protectAsync(socket: Socket) {
            companionSocket = socket
        }
    }
}
