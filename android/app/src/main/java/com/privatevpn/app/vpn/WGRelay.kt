package com.privatevpn.app.vpn

import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.net.Socket
import android.net.Network
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * WireGuard-over-TCP relay client.
 *
 * WireGuard's own UDP socket (GoBackend) points at a LOCAL UDP listener here.
 * This relay wraps every WG datagram in a length-prefixed TCP frame and ships it
 * to relayHost:relayPort (a relay daemon next to the WireGuard server, which
 * unwraps and forwards it to the server's WG UDP 443). This lets WG ride a plain
 * TCP connection instead of raw UDP, which is what traverses restrictive
 * networks (China) where foreign-VPN UDP is dropped.
 *
 * Frames: [len:u16 BE][payload ...] in both directions.
 */
class WGRelay(
    private val relayHost: String,
    private val relayPort: Int = 9444,
    private val network: Network? = null,
) {
    private var localSocket: DatagramSocket? = null
    private var tcpSocket: Socket? = null
    private val running = AtomicBoolean(false)
    private val lock = Any()

    /** The underlying TCP socket to the relay host (for VpnService.protect). */
    val tcpSocketForProtect: Socket?
        get() = synchronized(lock) { tcpSocket }

    /** Local UDP port that the WG tunnel should point at. */
    val localPort: Int
        get() = synchronized(lock) { localSocket?.localPort ?: -1 }

    /** Opens the TCP link to the relay and starts the local UDP relay. */
    fun start(): Boolean {
        synchronized(lock) {
            if (running.get()) return true
            val udp = DatagramSocket(0)
            val tcp = Socket()
            try {
                tcp.connect(InetSocketAddress(relayHost, relayPort), 10_000)
                tcp.tcpNoDelay = true
            } catch (e: IOException) {
                udp.close()
                throw e
            }
            localSocket = udp
            tcpSocket = tcp
            running.set(true)
        }
        val udp = localSocket ?: return false
        val tcp = tcpSocket ?: return false

        // WireGuard's source address (its UDP socket port). Responses must go
        // back to this exact address, NOT a hardcoded port.
        val peer = java.util.concurrent.atomic.AtomicReference<InetSocketAddress?>()
        thread(name = "wg-relay-udp2tcp", isDaemon = true) {
            val out = DataOutputStream(tcp.getOutputStream())
            val buf = ByteArray(65535)
            while (running.get()) {
                val pkt = DatagramPacket(buf, buf.size)
                try {
                    udp.receive(pkt)
                    peer.set(InetSocketAddress(pkt.address, pkt.port))
                    synchronized(lock) {
                        out.writeShort(pkt.length)
                        out.write(buf, 0, pkt.length)
                        out.flush()
                    }
                } catch (e: Exception) {
                    if (running.get()) stop()
                    break
                }
            }
        }

        thread(name = "wg-relay-tcp2udp", isDaemon = true) {
            val input = DataInputStream(tcp.getInputStream())
            while (running.get()) {
                try {
                    val len = input.readUnsignedShort()
                    if (len <= 0 || len > 65535) continue
                    val payload = ByteArray(len)
                    input.readFully(payload)
                    val dst = peer.get() ?: InetSocketAddress("127.0.0.1", 51820)
                    udp.send(DatagramPacket(payload, len, dst))
                } catch (e: Exception) {
                    if (running.get()) stop()
                    break
                }
            }
        }
        return true
    }

    fun stop() {
        synchronized(lock) {
            if (!running.getAndSet(false)) return
            try { tcpSocket?.close() } catch (_: IOException) {}
            try { localSocket?.close() } catch (_: IOException) {}
            tcpSocket = null
            localSocket = null
        }
    }
}
