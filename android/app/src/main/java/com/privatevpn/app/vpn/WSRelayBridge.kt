package com.privatevpn.app.vpn

import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString

/**
 * Cầu UDP <-> WebSocket cho đường dữ liệu khi IP của node bị chặn.
 *
 * Datagram của Hysteria được nhận trên 127.0.0.1, gửi qua WSS tới relay đặt sau
 * Cloudflare Tunnel; đầu kia bung ra thành UDP tới Hysteria server của node. Nhờ vậy
 * client chỉ nói chuyện với hạ tầng dùng chung (Cloudflare) — muốn chặn phải chặn cả
 * một dải dùng chung, đúng cách Tailscale không "chết" khi bị chặn IP.
 *
 * Mỗi binary message WS = 1 datagram (WS giữ nguyên ranh giới message, không cần framing).
 */
class WSRelayBridge(
    private val url: String = Config.WS_RELAY_URL,
    /** VpnService.protect: bắt buộc — nếu không, khi tunnel vừa lên thì kết nối TCP
     *  tới relay bị hút vào chính tunnel (vòng lặp) và bị reset ngay lập tức. */
    private val protector: ((java.net.Socket) -> Boolean)? = null,
) {

    private var udp: DatagramSocket? = null
    private var ws: WebSocket? = null
    private val peer = AtomicReference<InetSocketAddress?>()

    @Volatile private var running = false
    @Volatile var connected = false
        private set

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        // Socket được protect NGAY khi tạo, trước khi connect → đi thẳng ra mạng nền,
        // không qua tunnel của chính mình.
        .socketFactory(object : javax.net.SocketFactory() {
            override fun createSocket(): java.net.Socket =
                java.net.Socket().also { sock -> protector?.invoke(sock) }

            override fun createSocket(host: String?, port: Int): java.net.Socket =
                java.net.Socket(host, port)

            override fun createSocket(host: String?, port: Int, localHost: java.net.InetAddress?, localPort: Int): java.net.Socket =
                java.net.Socket(host, port, localHost, localPort)

            override fun createSocket(host: java.net.InetAddress?, port: Int): java.net.Socket =
                java.net.Socket(host, port)

            override fun createSocket(address: java.net.InetAddress?, port: Int, localAddress: java.net.InetAddress?, localPort: Int): java.net.Socket =
                java.net.Socket(address, port, localAddress, localPort)
        })
        .build()

    /** Cổng UDP local mà Hysteria phải trỏ vào. */
    val localPort: Int get() = udp?.localPort ?: -1

    fun start(): Boolean {
        return try {
            val sock = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
            udp = sock
            running = true
            DiagnosticsLog.log("ws-relay: local udp 127.0.0.1:${sock.localPort} -> $url")

            ws = client.newWebSocket(
                Request.Builder().url(url).build(),
                object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        connected = true
                        DiagnosticsLog.log("ws-relay: connected")
                    }

                    override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                        val target = peer.get() ?: return
                        runCatching {
                            sock.send(DatagramPacket(bytes.toByteArray(), bytes.size, target))
                        }
                    }

                    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                        connected = false
                        DiagnosticsLog.warn("ws-relay: failed: ${t.message}")
                    }

                    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                        connected = false
                    }
                },
            )

            Thread {
                val buffer = ByteArray(65535)
                while (running) {
                    val packet = DatagramPacket(buffer, buffer.size)
                    try {
                        sock.receive(packet)
                    } catch (e: Exception) {
                        break
                    }
                    peer.set(InetSocketAddress(packet.address, packet.port))
                    ws?.send(buffer.toByteString(0, packet.length))
                }
            }.apply { isDaemon = true; name = "ws-relay-udp" }.start()
            true
        } catch (e: Exception) {
            DiagnosticsLog.warn("ws-relay: start failed: ${e.message}")
            stop()
            false
        }
    }

    fun stop() {
        running = false
        connected = false
        runCatching { ws?.close(1000, null) }
        runCatching { udp?.close() }
        ws = null
        udp = null
    }
}
