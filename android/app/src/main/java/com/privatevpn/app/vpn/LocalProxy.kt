package com.privatevpn.app.vpn

import com.privatevpn.app.diag.DiagnosticsLog
import java.io.BufferedInputStream
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL

/**
 * HTTP proxy NỘI BỘ **luôn sống** ở `127.0.0.1:1081` (proxy hệ thống của máy không có TUN).
 *
 * Vì sao phải có thay vì để core Go giữ cổng: proxy hệ thống của Android chỉ là một chuỗi
 * `127.0.0.1:1081`. Nếu cổng đó chỉ mở trong lúc tunnel sống thì **mọi lần tunnel chết là cả TV
 * mất mạng** — đo thật 20/10/2026 trên `MiTV-AFZP0`: lane WS bị relay cắt (`pong-timeout`), proxy
 * vẫn trỏ 1081, FPT Play báo "không load được" và mọi app tôn trọng proxy đều chết theo.
 *
 * Cách làm: cổng 1081 do TIẾN TRÌNH APP giữ thường trực. Mỗi kết nối vào:
 *  - tunnel đang sống (proxy của core Go ở [TUNNEL_PORT] nhận được) ⇒ chuyển tiếp nguyên request
 *    sang đó, tức đi qua hysteria như cũ;
 *  - tunnel chưa/không còn sống ⇒ **đi thẳng** ra mạng (fail-open), TV vẫn có internet.
 *
 * Nhờ vậy proxy hệ thống không bao giờ trỏ vào cổng chết; cùng lắm là "không qua VPN" chứ không
 * phải "mất mạng".
 */
object LocalProxy {

    /** Cổng proxy của core Go (chỉ mở khi tunnel sống). Không trùng cổng proxy hệ thống. */
    const val TUNNEL_PORT = 1082

    private const val HEADER_MAX_BYTES = 32 * 1024
    private const val CONNECT_TIMEOUT_MS = 8_000
    private const val TUNNEL_PROBE_TIMEOUT_MS = 300
    private const val TUNNEL_PROBE_CACHE_MS = 1_000L

    @Volatile private var server: ServerSocket? = null
    @Volatile private var started = false

    /** Kết quả dò cổng tunnel, nhớ 1 s để không phải dò cho từng kết nối. */
    @Volatile private var tunnelCheckedAt = 0L
    @Volatile private var tunnelWasUp = false

    /** Mở cổng [port] một lần cho cả tiến trình; gọi nhiều lần vô hại. */
    fun ensureStarted(port: Int): Boolean {
        synchronized(this) {
            val current = server
            if (started && current != null && !current.isClosed) return true
            // Sự cố thật 20/10/2026: listener chết (vòng accept thoát) mà cờ `started` vẫn true
            // ⇒ không bao giờ mở lại ⇒ proxy hệ thống trỏ cổng chết ⇒ cả TV mất mạng.
            started = false
            runCatching { current?.close() }
            val socket = runCatching { ServerSocket(port, 64, java.net.InetAddress.getByName("127.0.0.1")) }
                .getOrElse {
                    DiagnosticsLog.warn("local-proxy: KHÔNG mở được 127.0.0.1:$port (${it.message})")
                    return false
                }
            server = socket
            started = true
            Thread {
                DiagnosticsLog.log("local-proxy: nghe 127.0.0.1:$port (fail-open khi tunnel tắt)")
                while (started) {
                    val client = try {
                        socket.accept()
                    } catch (_: Exception) {
                        if (!started || socket.isClosed) break
                        // Lỗi tạm thời (ROM dọn tài nguyên, thiếu fd…): thử lại, KHÔNG thoát vòng.
                        runCatching { Thread.sleep(200) }
                        continue
                    }
                    Thread { handle(client) }.apply { isDaemon = true; name = "local-proxy-conn" }.start()
                }
                synchronized(this@LocalProxy) {
                    started = false
                    server = null
                }
                DiagnosticsLog.warn("local-proxy: vòng accept dừng -> nhịp kiểm kế tiếp sẽ mở lại")
            }.apply { isDaemon = true; name = "local-proxy" }.start()
            return true
        }
    }

    /** Cổng proxy nội bộ có đang thật sự lắng nghe không (dùng trước khi đặt proxy hệ thống). */
    fun isListening(): Boolean {
        val current = server
        return started && current != null && !current.isClosed
    }

    fun stop() {
        started = false
        runCatching { server?.close() }
        server = null
    }

    // ───────────────────────── một kết nối ─────────────────────────

    private fun handle(client: Socket) {
        try {
            client.soTimeout = 20_000
            client.tcpNoDelay = true
            val input = BufferedInputStream(client.getInputStream())
            val header = readHeader(input) ?: return
            val text = String(header, Charsets.ISO_8859_1)
            val firstLine = text.lineSequence().firstOrNull().orEmpty().trim()
            val parts = firstLine.split(' ')
            if (parts.size < 2) return
            val method = parts[0]
            val target = parts[1]

            if (tunnelAvailable()) {
                forwardToTunnel(header, input, client)
                return
            }
            if (method.equals("CONNECT", ignoreCase = true)) {
                val (host, port) = splitHostPort(target, 443)
                directConnect(client, input, host, port)
            } else {
                directHttp(client, input, method, target, text)
            }
        } catch (_: Throwable) {
            // Nuốt lỗi: một kết nối hỏng không được kéo theo cả proxy.
        } finally {
            runCatching { client.close() }
        }
    }

    /** Đọc tới hết khối header (kèm CRLFCRLF) — trả về null nếu kết nối đóng trước đó. */
    private fun readHeader(input: InputStream): ByteArray? {
        val out = java.io.ByteArrayOutputStream(1024)
        var matched = 0
        while (out.size() < HEADER_MAX_BYTES) {
            val b = input.read()
            if (b < 0) return if (out.size() > 0) out.toByteArray() else null
            out.write(b)
            matched = when {
                (matched == 0 || matched == 2) && b == '\r'.code -> matched + 1
                (matched == 1 || matched == 3) && b == '\n'.code -> matched + 1
                b == '\r'.code -> 1
                else -> 0
            }
            if (matched == 4) return out.toByteArray()
        }
        return out.toByteArray()
    }

    private fun tunnelAvailable(): Boolean {
        // Tunnel phải THẬT SỰ đang chở dữ liệu (cờ do service cập nhật) — chỉ kiểm "cổng 1082 có
        // mở" là không đủ: đo thật 20/10/2026 có lúc 1082 vẫn LISTEN nhưng nhận kết nối rồi đóng
        // ngay, chuyển tiếp vào đó làm app treo thay vì fail-open.
        if (!DiagnosticsLog.tunnelUp) return false
        val now = System.currentTimeMillis()
        if (now - tunnelCheckedAt < TUNNEL_PROBE_CACHE_MS) return tunnelWasUp
        tunnelCheckedAt = now
        tunnelWasUp = runCatching {
            Socket().use { probe ->
                probe.connect(InetSocketAddress("127.0.0.1", TUNNEL_PORT), TUNNEL_PROBE_TIMEOUT_MS)
                true
            }
        }.getOrDefault(false)
        return tunnelWasUp
    }

    /** Tunnel sống: chuyển nguyên request (kể cả CONNECT) sang proxy của core Go rồi nối hai ống. */
    private fun forwardToTunnel(header: ByteArray, clientIn: InputStream, client: Socket) {
        val upstream = Socket()
        try {
            upstream.tcpNoDelay = true
            upstream.connect(InetSocketAddress("127.0.0.1", TUNNEL_PORT), CONNECT_TIMEOUT_MS)
            upstream.getOutputStream().apply {
                write(header)
                flush()
            }
            pipe(client, clientIn, upstream)
        } finally {
            runCatching { upstream.close() }
        }
    }

    private fun directConnect(client: Socket, clientIn: InputStream, host: String, port: Int) {
        val upstream = Socket()
        try {
            upstream.tcpNoDelay = true
            upstream.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
            client.getOutputStream().apply {
                write("HTTP/1.1 200 Connection Established\r\n\r\n".toByteArray())
                flush()
            }
            pipe(client, clientIn, upstream)
        } catch (e: Exception) {
            runCatching {
                client.getOutputStream().apply {
                    write("HTTP/1.1 502 Bad Gateway\r\n\r\n".toByteArray())
                    flush()
                }
            }
        } finally {
            runCatching { upstream.close() }
        }
    }

    /** HTTP thường: đổi absolute-URI về origin-form rồi đi thẳng (bỏ header proxy-only). */
    private fun directHttp(client: Socket, clientIn: InputStream, method: String, target: String, text: String) {
        val url = runCatching { URL(target) }.getOrNull() ?: return
        val hostPort = if (url.port > 0) url.port else 80
        val upstream = Socket()
        try {
            upstream.tcpNoDelay = true
            upstream.connect(InetSocketAddress(url.host, hostPort), CONNECT_TIMEOUT_MS)
            val path = url.file.ifEmpty { "/" }
            val sb = StringBuilder()
            sb.append(method).append(' ').append(path).append(" HTTP/1.1\r\n")
            for (line in text.lineSequence().drop(1)) {
                val trimmed = line.trimEnd('\r')
                if (trimmed.isEmpty()) break
                if (trimmed.startsWith("Proxy-Connection", ignoreCase = true)) continue
                sb.append(trimmed).append("\r\n")
            }
            sb.append("\r\n")
            upstream.getOutputStream().apply {
                write(sb.toString().toByteArray(Charsets.ISO_8859_1))
                flush()
            }
            pipe(client, clientIn, upstream)
        } catch (e: Exception) {
            runCatching {
                client.getOutputStream().apply {
                    write("HTTP/1.1 502 Bad Gateway\r\n\r\n".toByteArray())
                    flush()
                }
            }
        } finally {
            runCatching { upstream.close() }
        }
    }

    /** Nối hai chiều; đóng cả hai đầu khi một chiều kết thúc. */
    private fun pipe(client: Socket, clientIn: InputStream, upstream: Socket) {
        val up = Thread {
            runCatching {
                upstream.getInputStream().copyTo(client.getOutputStream(), 16 * 1024)
            }
            runCatching { upstream.close() }
            runCatching { client.close() }
        }.apply { isDaemon = true; name = "local-proxy-up" }
        up.start()
        runCatching { clientIn.copyTo(upstream.getOutputStream(), 16 * 1024) }
        runCatching { upstream.close() }
        runCatching { client.close() }
    }

    private fun splitHostPort(target: String, defaultPort: Int): Pair<String, Int> {
        val idx = target.lastIndexOf(':')
        if (idx <= 0) return target to defaultPort
        val port = target.substring(idx + 1).toIntOrNull() ?: defaultPort
        return target.substring(0, idx) to port
    }
}
