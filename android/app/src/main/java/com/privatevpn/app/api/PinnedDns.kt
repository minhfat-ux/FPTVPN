package com.privatevpn.app.api

import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import okhttp3.Dns

/**
 * Resolver cho những host app BẮT BUỘC phải vào được: trả IP ghim
 * ([Config.PINNED_HOST_ADDRESSES]) TRƯỚC, rồi mới ghép thêm câu trả lời của hệ thống —
 * nhưng chỉ chờ tối đa [SYSTEM_LOOKUP_TIMEOUT_MS] rồi bỏ.
 *
 * Vì sao không dùng thẳng `Dns.SYSTEM`: khi tunnel của app đang UP mà transport đã chết,
 * DNS của máy bị trỏ vào trong tunnel (`dns=1.1.1.1`) nên truy vấn treo hoặc trả về rỗng —
 * đúng lúc app cần resolve host dự phòng để thoát ra. Chờ DNS hệ thống ở đây là khoá luôn
 * đường thoát (diagnostics 14/09: `Unable to resolve host "fcnvpn.tail303be3.ts.net"`),
 * nên câu trả lời của hệ thống chỉ được coi là "thêm nếu kịp".
 *
 * TLS vẫn xác thực theo hostname gốc của request, nên ghim IP chỉ thêm đường vào, không
 * thể bị lợi dụng để chuyển hướng traffic.
 */
object PinnedDns : Dns {
    private const val SYSTEM_LOOKUP_TIMEOUT_MS = 1200L

    /** Thread riêng, daemon: DNS hệ thống có thể treo vô hạn khi bị hút vào tunnel chết. */
    private val executor = Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "pinned-dns").apply { isDaemon = true }
    }

    /**
     * IP resolve được LẦN CUỐI lúc mạng còn tốt, và IP vừa TCP-connect THÀNH CÔNG.
     *
     * Vì sao cần thêm: lúc transport vừa chết, DNS của máy vẫn trỏ vào trong tunnel nên
     * `systemLookup` trả rỗng, mà `api.meetflowai.site` không có IP ghim ⇒ OkHttp báo
     * `returned no addresses` và mất TRẮNG cả một lượt dựng lại transport (diagnostics
     * 22/09/2026: 11:49:38 và 12:02:38). Còn khi resolve được thì `api.meetflowai.site`
     * nằm sau Cloudflare với IP anycast connect không nổi (đo cùng ngày: `failed to
     * connect to api.meetflowai.site/172.67.175.138 (port 443) ... after 10000ms`) — thử
     * IP đã chạy được TRƯỚC thì lượt dựng lại không phải chờ hết timeout của IP chết.
     * Cả hai đều chỉ là ĐƯỜNG VÀO thêm: TLS vẫn xác thực theo hostname gốc nên IP cũ
     * không thể bị lợi dụng để chuyển hướng traffic. Bộ nhớ chỉ nằm trong tiến trình.
     */
    private val lastGood = ConcurrentHashMap<String, List<InetAddress>>()
    private val preferred = ConcurrentHashMap<String, InetAddress>()

    /** Ghi lại IP vừa connect được (gọi từ EventListener của OkHttp). */
    fun noteWorkingAddress(host: String, address: InetAddress?) {
        if (address == null) return
        preferred[host] = address
    }

    override fun lookup(hostname: String): List<InetAddress> {
        val pinned = Config.PINNED_HOST_ADDRESSES[hostname].orEmpty().mapNotNull { literal ->
            runCatching { InetAddress.getByName(literal) }.getOrNull()
        }
        val system = systemLookup(hostname)
        if (system.isNotEmpty()) lastGood[hostname] = system
        val addresses = (
            listOfNotNull(preferred[hostname]) + pinned + system + lastGood[hostname].orEmpty()
            ).distinct()
        if (addresses.isEmpty()) {
            // Trả rỗng để OkHttp báo lỗi transport ngay, không treo ở đây.
            DiagnosticsLog.warn("dns: không resolve được $hostname")
        }
        return addresses
    }

    private fun systemLookup(hostname: String): List<InetAddress> {
        val task = executor.submit<List<InetAddress>> { Dns.SYSTEM.lookup(hostname) }
        return runCatching { task.get(SYSTEM_LOOKUP_TIMEOUT_MS, TimeUnit.MILLISECONDS) }
            .getOrElse {
                task.cancel(true)
                emptyList()
            }
    }
}
