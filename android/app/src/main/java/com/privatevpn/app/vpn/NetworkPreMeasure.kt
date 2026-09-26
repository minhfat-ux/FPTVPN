package com.privatevpn.app.vpn

import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog
import java.net.Socket
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * BƯỚC "ĐO MẠNG THỰC TẾ **TRƯỚC** RỒI MỚI KHAI" (yêu cầu chủ dự án 22/09/2026 — iOS đã cập nhật).
 *
 * Vì sao cần: số khai băng thông cho Brutal CC phải SÁT băng thông thật, mà nấc tĩnh
 * (`MOBILE_UP/DOWN_KBPS`, `HY_UP/DOWN_KBPS`) chỉ là ĐOÁN. Trước đây Android chỉ đo SAU khi
 * tunnel đã lên rồi áp ở lần connect sau ⇒ lần ĐẦU trên một mạng mới vẫn khai theo nấc đoán.
 *
 * Cách làm: tải một mẩu nhỏ (`PREMEASURE_MAX_BYTES`, tối đa `PREMEASURE_BUDGET_MS`) qua socket
 * đã `protect()` — tức đi thẳng ra mạng nền, KHÔNG qua tunnel — rồi lấy `bytes × 8 / ms` làm số đo.
 *
 * Thứ tự nguồn đo: **CDN của shop trước** (`PREMEASURE_URL_PRIMARY`) rồi mới tới Cloudflare:
 * đo trên máy thật 22/09/2026 cho thấy `speed.cloudflare.com` KHÔNG đo được từ data di động
 * Trung Quốc (bị chặn/bóp), trong khi `meetflowai.site` tải được bình thường.
 *
 * Chỉ để LẤY SỐ: không gửi dữ liệu người dùng, không giữ kết nối, mọi lỗi đều nuốt.
 */
object NetworkPreMeasure {

    /** Trả về kbps đo được, hoặc 0 nếu không đo được (không bao giờ ném ra ngoài). */
    fun measure(protector: ((Socket) -> Boolean)?): Int {
        for (url in listOf(Config.PREMEASURE_URL_PRIMARY, Config.PREMEASURE_URL)) {
            val kbps = runCatching { measureOnce(url, protector) }.getOrDefault(0)
            if (kbps > 0) return kbps
        }
        DiagnosticsLog.log("bw: do mang thuc te KHONG do duoc o ca 2 nguon -> giu so cu")
        return 0
    }

    private fun measureOnce(url: String, protector: ((Socket) -> Boolean)?): Int {
        val started = System.currentTimeMillis()
        val client = OkHttpClient.Builder()
            .connectTimeout(Config.PREMEASURE_CONNECT_TIMEOUT_MS.toLong(), TimeUnit.MILLISECONDS)
            .readTimeout(Config.PREMEASURE_BUDGET_MS.toLong(), TimeUnit.MILLISECONDS)
            // Socket được protect NGAY khi tạo: lúc này tunnel có thể đang tồn tại nhưng CHƯA có
            // transport, không protect thì gói bị nuốt và phép đo vô nghĩa.
            .socketFactory(object : javax.net.SocketFactory() {
                override fun createSocket(): Socket =
                    Socket().also { sock -> protector?.invoke(sock) }

                override fun createSocket(host: String?, port: Int): Socket =
                    Socket(host, port)

                override fun createSocket(host: String?, port: Int, localHost: java.net.InetAddress?, localPort: Int): Socket =
                    Socket(host, port, localHost, localPort)

                override fun createSocket(host: java.net.InetAddress?, port: Int): Socket =
                    Socket(host, port)

                override fun createSocket(address: java.net.InetAddress?, port: Int, localAddress: java.net.InetAddress?, localPort: Int): Socket =
                    Socket(address, port, localAddress, localPort)
            })
            .build()

        val request = Request.Builder()
            .url(url)
            .header("Range", "bytes=0-${Config.PREMEASURE_MAX_BYTES - 1}")
            .header("User-Agent", "VPNFlow-Android")
            .build()

        var bytes = 0L
        // Tốc độ tính TỪ BYTE ĐẦU TIÊN, không tính thời gian bắt tay TLS + TTFB: trên mạng di
        // động TQ (RTT 300-700 ms) phần "mở kết nối" chiếm gần hết ngân sách 2,5 s cũ, nên app
        // đo ra 559 kbps trong khi cùng domain tải 20 MB cho 19 Mbps ⇒ kẹt số khai ở sàn.
        var firstByteAt = 0L
        client.newCall(request).execute().use { response ->
            val body = response.body ?: return 0
            val buf = ByteArray(16 * 1024)
            body.byteStream().use { input ->
                while (true) {
                    if (System.currentTimeMillis() - started > Config.PREMEASURE_BUDGET_MS) break
                    val n = try {
                        input.read(buf)
                    } catch (_: Exception) {
                        break
                    }
                    if (n <= 0) break
                    if (firstByteAt == 0L) firstByteAt = System.currentTimeMillis()
                    bytes += n
                    if (bytes >= Config.PREMEASURE_MAX_BYTES) break
                }
            }
        }
        val now = System.currentTimeMillis()
        val setupMs = if (firstByteAt > 0) firstByteAt - started else 0L
        val transferMs = if (firstByteAt > 0) now - firstByteAt else now - started
        if (bytes < Config.PREMEASURE_MIN_BYTES) {
            DiagnosticsLog.log(
                "bw: do mang thuc te CHUA DU du lieu tu $url (${bytes}B, setup=${setupMs}ms, tai=${transferMs}ms)",
            )
            return 0
        }
        val ms = transferMs.coerceAtLeast(1)
        // bytes/ms == kbps (bits trên mili-giây), không cần chia 1000.
        val kbps = ((bytes * 8) / ms).toInt()
        DiagnosticsLog.log(
            "bw: do mang thuc te tu $url = ${kbps}kbps (setup=${setupMs}ms, tai=${transferMs}ms, ${bytes}B)",
        )
        return kbps
    }
}
