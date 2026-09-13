package com.privatevpn.app

import com.privatevpn.app.api.ControlAPIClient
import com.privatevpn.app.api.PreferredHost
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.util.Collections
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/**
 * Khoá hành vi sống-còn của đường API khi IP node bị chặn (lỗi 14/09/2026):
 * host chính không tới được (gói bị nuốt / connection refused) thì request PHẢI được thử lại
 * qua host dự phòng, và 5xx từ host chính cũng phải rơi xuống dự phòng (node còn sống nhưng
 * control plane phía sau nó đã chết — node-1 trả 502).
 *
 * Không dùng mạng thật: "host chính chết" = cổng đã đóng, "host dự phòng" = HTTP server tối
 * giản tự viết bằng ServerSocket (không thêm dependency nào).
 */
class ApiFallbackTest {

    private companion object {
        /** App gọi kèm `platform=android` để server trả đúng kênh APK. */
        const val APP_VERSION_PATH = "/v1/app-version?platform=android"
    }

    private val servers = mutableListOf<FakeHttpServer>()

    @Before
    fun resetPreference() {
        PreferredHost.forget()
    }

    @After
    fun stopServers() {
        servers.forEach { it.stop() }
        servers.clear()
    }

    /** Cổng vừa đóng: connect bị từ chối ngay — giống host bị chặn ở mạng khách. */
    private fun deadPort(): Int = ServerSocket(0).use { it.localPort }

    private fun startServer(status: Int): FakeHttpServer =
        FakeHttpServer(status).also { servers += it }

    @Test
    fun `falls back to the backup host when the primary refuses connections`() = runBlocking {
        val backup = startServer(200)
        val client = ControlAPIClient(
            baseUrl = "http://127.0.0.1:${deadPort()}",
            fallbackBases = listOf("http://127.0.0.1:${backup.port}"),
        )

        val info = client.fetchAppVersion()

        assertEquals("1.3.3", info.latestVersion)
        assertEquals(listOf(APP_VERSION_PATH), backup.paths)
    }

    @Test
    fun `falls back when the primary answers 502`() = runBlocking {
        val primary = startServer(502)
        val backup = startServer(200)
        val client = ControlAPIClient(
            baseUrl = "http://127.0.0.1:${primary.port}",
            fallbackBases = listOf("http://127.0.0.1:${backup.port}"),
        )

        val info = client.fetchAppVersion()

        assertEquals("1.3.3", info.latestVersion)
        assertEquals(listOf(APP_VERSION_PATH), primary.paths)
        assertEquals(listOf(APP_VERSION_PATH), backup.paths)
    }

    @Test
    fun `surfaces the error when the backup host fails too, without looping`() = runBlocking {
        val primary = startServer(502)
        val backup = startServer(502)
        val client = ControlAPIClient(
            baseUrl = "http://127.0.0.1:${primary.port}",
            fallbackBases = listOf("http://127.0.0.1:${backup.port}"),
        )

        try {
            client.fetchAppVersion()
            fail("phải ném ClientError.Server khi cả host chính lẫn dự phòng đều 502")
        } catch (expected: ControlAPIClient.ClientError.Server) {
            // đúng: lỗi được đẩy lên UI, không thử lại vô hạn
        }

        assertEquals("chỉ thử host dự phòng đúng một lần", 1, backup.paths.size)
    }
}

/** HTTP/1.1 server tối giản: trả cùng một status cho mọi request, ghi lại đường dẫn đã nhận. */
private class FakeHttpServer(private val status: Int) {
    private val socket = ServerSocket(0, 0, InetAddress.getByName("127.0.0.1"))
    val paths: MutableList<String> = Collections.synchronizedList(mutableListOf())

    val port: Int get() = socket.localPort

    init {
        Thread({ acceptLoop() }, "fake-http").apply { isDaemon = true }.start()
    }

    private fun acceptLoop() {
        while (!socket.isClosed) {
            val client = try {
                socket.accept()
            } catch (_: IOException) {
                return
            }
            Thread({ serve(client) }, "fake-http-conn").apply { isDaemon = true }.start()
        }
    }

    private fun serve(client: java.net.Socket) {
        client.use { conn ->
            val reader = conn.getInputStream().bufferedReader()
            val requestLine = reader.readLine() ?: return
            paths += requestLine.split(" ").getOrNull(1).orEmpty()
            while (true) {
                val line = reader.readLine() ?: break
                if (line.isEmpty()) break
            }
            val body = if (status == 200) {
                """{"platform":"android","minimum_version":"0.0.0",""" +
                    """"latest_version":"1.3.3","store_url":""}"""
            } else {
                """{"error":"upstream"}"""
            }
            val bytes = body.toByteArray()
            val head = "HTTP/1.1 $status ${if (status == 200) "OK" else "Error"}\r\n" +
                "Content-Type: application/json\r\n" +
                "Content-Length: ${bytes.size}\r\n" +
                "Connection: close\r\n\r\n"
            conn.getOutputStream().apply {
                write(head.toByteArray())
                write(bytes)
                flush()
            }
        }
    }

    fun stop() {
        runCatching { socket.close() }
    }
}
