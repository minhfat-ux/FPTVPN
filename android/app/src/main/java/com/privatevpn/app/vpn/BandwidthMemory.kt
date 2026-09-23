package com.privatevpn.app.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.net.wifi.WifiManager
import android.os.Process
import android.telephony.TelephonyManager
import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog
import java.net.HttpURLConnection
import java.net.URL

/**
 * Khai băng thông ĐỘNG cho Brutal CC (hysteria2) trên Android.
 *
 * Vì sao cần: Brutal CC pace ĐÚNG theo số client khai, nên số khai phải sát băng thông
 * THẬT của mạng đang nằm dưới tunnel. Cơ chế tĩnh chỉ có 2 nấc (metered -> 8/12 Mbps,
 * unmetered -> 30/100 Mbps) nên khai sai theo cả hai hướng — đo trên máy thật:
 *   khai 300/1000 -> 1,3 Mbps; khai 30/100 -> 29,9 Mbps; Wi-Fi khách sạn (raw 49,8 Mbps)
 *   mà khai mức mobile 8/12 -> trần 13,44 Mbps.
 *
 * Cách làm ở đây:
 *  1. Sau khi tunnel đã chở traffic, ĐO goodput thật qua chính tunnel (<=3s) rồi nhớ vào
 *     SharedPreferences theo KHOÁ CỦA MẠNG hiện tại (SSID Wi-Fi, tên nhà mạng, hoặc dấu
 *     vân tay của link khi không đọc được SSID).
 *  2. Lần kết nối sau vào CÙNG mạng: khai theo số đã nhớ (85% số đo), kẹp trần "sức mạng
 *     vật lý" (Wi-Fi linkSpeed + RSSI, hoặc loại mạng di động) và trần của cơ chế tĩnh.
 *  3. Không có số đo nào => dùng ĐÚNG cơ chế tĩnh cũ làm mặc định (đường lùi an toàn:
 *     không mạng nào chậm hơn trước).
 *
 * Ràng buộc: số khai chỉ được chốt ở RANH GIỚI KẾT NỐI. Đổi số khai đòi hỏi dựng lại client
 * hysteria (Mobile.connect nhận số ngay lúc mở), nên tuyệt đối không đổi giữa lúc tunnel
 * đang chở traffic — vì vậy số đo của lượt này chỉ có tác dụng từ lượt kết nối sau.
 */
class BandwidthMemory(context: Context) {

    private val appContext = context.applicationContext
    private val cm: ConnectivityManager? =
        appContext.getSystemService(ConnectivityManager::class.java)

    /** Khoá nhớ tốc độ + trần vật lý của mạng đang nằm dưới tunnel. */
    data class NetProfile(val key: String, val display: String, val ceilingDownKbps: Int)

    /** Tên interface TUN, nhớ sau lần đọc /proc/net/dev đầu tiên. */
    @Volatile private var ifaceName: String? = null

    /** Wi-Fi PHY đọc được từ WifiInfo (linkSpeed là tốc độ ĐÀM PHÁN, không phải tốc độ thật). */
    private class WifiRadio(val ssid: String?, val linkSpeedMbps: Int, val rssi: Int)

    // ---- nhận diện mạng -------------------------------------------------------

    /**
     * Khoá nhớ tốc độ + trần tải xuống cho mạng hiện tại.
     *
     * Vì sao khoá là SSID/tên nhà mạng chứ không phải "wifi/cell": cơ chế tĩnh chỉ có 2
     * nấc nên mọi Wi-Fi dùng chung một số; đo thật cho thấy Wi-Fi khách sạn và Wi-Fi nhà
     * lệch nhau hơn 10 lần, nên số đã nhớ phải theo TỪNG mạng.
     */
    fun profileOf(net: Network?, label: String): NetProfile {
        if (label.contains("cell")) {
            val op = operatorName()
            return NetProfile(
                key = "cell:" + (op ?: "default").lowercase(),
                display = (op ?: "cell").replace(' ', '_'),
                ceilingDownKbps = cellCeilingDownKbps(),
            )
        }
        if (net != null && isWifi(net)) {
            val radio = wifiRadio()
            // Không đọc được SSID (thiếu quyền vị trí) thì khoá bằng dấu vân tay của link.
            val fingerprint = if (radio?.ssid == null) linkFingerprint(net) else null
            val name = radio?.ssid ?: fingerprint!!.second
            return NetProfile(
                key = "wifi:" + (radio?.ssid?.lowercase() ?: fingerprint!!.first),
                display = name.replace(' ', '_'),
                // Trần vật lý tính bằng hàm của lớp ngoài (lớp lồng nhau không gọi được hàm instance).
                ceilingDownKbps = radio?.let { wifiCeilingDownKbps(it.linkSpeedMbps, it.rssi) } ?: 0,
            )
        }
        return NetProfile(key = label, display = label, ceilingDownKbps = 0)
    }

    private fun isWifi(net: Network): Boolean = runCatching {
        cm?.getNetworkCapabilities(net)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    }.getOrDefault(false)

    /**
     * SSID + linkSpeed + RSSI của Wi-Fi đang kết nối.
     *
     * SSID chỉ trả về khi app có quyền VỊ TRÍ (runtime, từ Android 8.1) — app này cố ý
     * không xin quyền vị trí, nên phần lớn máy sẽ trả "<unknown ssid>" và ta rơi về
     * [linkFingerprint]. linkSpeed/RSSI chỉ cần ACCESS_WIFI_STATE (quyền thường, không hỏi
     * người dùng) nên luôn đọc được.
     */
    private fun wifiRadio(): WifiRadio? = runCatching {
        val wm = appContext.getSystemService(WifiManager::class.java) ?: return null
        @Suppress("DEPRECATION")
        val info = wm.connectionInfo ?: return null
        @Suppress("DEPRECATION")
        val ssid = info.ssid?.trim('"')?.takeIf {
            it.isNotBlank() && !it.contains("unknown", ignoreCase = true) && !it.startsWith("0x")
        }
        @Suppress("DEPRECATION")
        val linkSpeed = info.linkSpeed
        @Suppress("DEPRECATION")
        val rssi = info.rssi
        WifiRadio(ssid, linkSpeed, rssi)
    }.getOrNull()

    /**
     * Dấu vân tay của một mạng Wi-Fi khi không đọc được SSID: interface + gateway + DNS đầu.
     *
     * Cùng một mạng (nhà, khách sạn) giữ nguyên gateway và DNS qua các lần kết nối nên số
     * đã nhớ vẫn khớp. Điểm yếu đã biết: hai mạng khác nhau cùng gateway 192.168.1.1 và
     * cùng DNS sẽ trùng khoá — khi đó lần kết nối ĐẦU ở mạng mới khai theo số cũ, và phép
     * đo ngay sau đó (reason=probe) sửa lại cho lần sau.
     *
     * @return (khoá đầy đủ, tên ngắn để ghi log)
     */
    private fun linkFingerprint(net: Network): Pair<String, String> {
        val lp = runCatching { cm?.getLinkProperties(net) }.getOrNull()
        val gw = runCatching {
            lp?.routes?.firstOrNull { it.isDefaultRoute }?.gateway?.hostAddress
        }.getOrNull()
        val dns = runCatching { lp?.dnsServers?.firstOrNull()?.hostAddress }.getOrNull()
        val iface = lp?.interfaceName ?: "wlan"
        val key = listOfNotNull(iface, gw, dns).joinToString("-")
        return key to ("wifi-gw-" + (gw ?: "?"))
    }

    /**
     * Tên nhà mạng làm khoá nhớ tốc độ cho mạng di động. `getNetworkOperatorName()` không
     * thuộc nhóm cần quyền runtime (khác getDataNetworkType — hàm đó cần READ_PHONE_STATE,
     * xem cellCeilingDownKbps). Không đọc được thì lùi về "default": vẫn nhớ tốc độ, chỉ là
     * dùng chung cho mọi nhà mạng.
     */
    private fun operatorName(): String? = runCatching {
        appContext.getSystemService(TelephonyManager::class.java)
            ?.networkOperatorName?.takeIf { it.isNotBlank() }
    }.getOrNull()

    /**
     * Trần XUỐNG (kbps) mà Wi-Fi vật lý có thể chở. Công thức viết rõ để lần sau chỉnh được:
     *
     *   phyMbps = WifiInfo.linkSpeed                     (tốc độ PHY đàm phán, KHÔNG phải tốc độ thật)
     *   ratio   = 0,45 khi RSSI >= -55 dBm; 0,35 khi >= -67; 0,25 khi >= -75; còn lại 0,15
     *   ceiling = phyMbps * 1000 * ratio
     *
     * Vì sao 0,45 chứ không phải 0,7 (hiệu suất lý thuyết của 802.11): goodput TCP thật chỉ
     * đạt ~50-60% tốc độ PHY khi tín hiệu tốt, rồi tunnel thêm một chặng nữa (hysteria +
     * relay WS qua Cloudflare). RSSI yếu kéo cả tỉ lệ điều chế lẫn tỉ lệ mất gói xuống nên
     * ratio giảm theo bậc. Trần này chỉ để CHẶN TRÊN — số khai còn bị kẹp bởi profile tĩnh
     * (30/100 Mbps) — nên nó chỉ có tác dụng đúng lúc cần: Wi-Fi 2,4 GHz hoặc tín hiệu yếu,
     * nơi khai 100 Mbps là khai vượt khả năng thật và Brutal sẽ tự gây nghẽn.
     *
     * Không đọc được linkSpeed (một số máy trả -1) ⇒ trả 0 = "không biết trần vật lý", khi
     * đó chỉ còn trần của profile tĩnh.
     */
    private fun wifiCeilingDownKbps(linkSpeedMbps: Int, rssi: Int): Int {
        if (linkSpeedMbps <= 0) return 0
        val ratioPct = when {
            // rssi == 0 là "không đọc được", không phải tín hiệu 0 dBm: coi như tín hiệu tốt.
            rssi == 0 || rssi >= -55 -> 45
            rssi >= -67 -> 35
            rssi >= -75 -> 25
            else -> 15
        }
        return linkSpeedMbps * 1000 * ratioPct / 100
    }

    /**
     * Trần XUỐNG (kbps) cho mạng di động, theo loại mạng đang đăng ký:
     * 5G NR 200 Mbps, LTE 50 Mbps, HSPA/UMTS 10 Mbps, còn lại 20 Mbps.
     *
     * Số khai cho di động vốn đã bị kẹp ở nấc mobile của profile tĩnh (8/12 Mbps) nên trần
     * này hiếm khi có tác dụng; nó là lưới an toàn cho lúc máy báo nhầm transport.
     * Dùng số literal thay vì hằng TelephonyManager.NETWORK_TYPE_NR (chỉ có từ API 29) để
     * build legacy (minSdk 24) không phụ thuộc API mới.
     */
    private fun cellCeilingDownKbps(): Int = runCatching {
        // getDataNetworkType cần READ_PHONE_STATE từ API 30 ⇒ SecurityException -> không biết.
        val type = appContext.getSystemService(TelephonyManager::class.java)?.dataNetworkType ?: 0
        when (type) {
            20 /* NETWORK_TYPE_NR, 5G */ -> 200_000
            13 /* NETWORK_TYPE_LTE */ -> 50_000
            15 /* HSPAP */, 10 /* HSPA */, 3 /* UMTS */ -> 10_000
            else -> 20_000
        }
    }.getOrDefault(0)

    // ---- bộ nhớ tốc độ theo mạng ---------------------------------------------

    /** Số đo goodput (kbps) đã nhớ cho mạng này; 0 = chưa có số đo nào. */
    fun rememberedMeasuredKbps(key: String): Int = runCatching {
        prefs().getInt(kMeasured(key), 0)
    }.getOrDefault(0)

    /** Số đo LIỀN TRƯỚC số đã nhớ (kbps); 0 nếu chưa có — mốc giảm xóc của BandwidthPolicy. */
    fun rememberedPreviousMeasuredKbps(key: String): Int = runCatching {
        prefs().getInt(kPrevious(key), 0)
    }.getOrDefault(0)

    /** Số khai (kbps) của CHÍNH lượt đo đã nhớ — xem luật "chạm trần" trong BandwidthPolicy. */
    fun rememberedDeclaredKbps(key: String): Int = runCatching {
        prefs().getInt(kDeclared(key), 0)
    }.getOrDefault(0)

    /** Số đo đã nhớ cách đây bao lâu (ms); [Long.MAX_VALUE] nếu chưa từng đo. */
    fun ageMs(key: String): Long = runCatching {
        val at = prefs().getLong(kAt(key), 0L)
        if (at <= 0L) Long.MAX_VALUE else System.currentTimeMillis() - at
    }.getOrDefault(Long.MAX_VALUE)

    /**
     * Ghi nhớ số đo mới nhất cho mạng này (`lastGoodKbps`), kèm số khai của CHÍNH lượt đo.
     *
     * Cặp (đo được, số khai) là dữ liệu để lần kết nối sau biết "số khai cũ có phải nút cổ
     * chai hay không" — xem luật 3 dải trong BandwidthPolicy.decide. Nhờ luật đó mà số khai
     * không trôi dốc mỗi lần kết nối (lấy 85% số đo vô điều kiện thì mỗi lượt lại hạ một
     * nấc, vì phép đo bị chặn bởi chính số khai vừa hạ), và cũng bò lên lại được khi mạng
     * thật sự còn dư.
     *
     * @param declaredKbps số khai đã dùng trong lượt đo vừa rồi.
     */
    fun remember(key: String, measuredKbps: Int, declaredKbps: Int) {
        val previous = rememberedMeasuredKbps(key)
        runCatching {
            prefs().edit()
                .putInt(kPrevious(key), previous)
                .putInt(kMeasured(key), measuredKbps)
                .putInt(kDeclared(key), declaredKbps)
                .putLong(kAt(key), System.currentTimeMillis())
                .apply()
        }
    }

    // ---- đếm byte thật qua TUN (rẻ, 1s/lần) -----------------------------------

    /**
     * Số byte ĐÃ NHẬN qua TUN (dữ liệu tải XUỐNG mà người dùng thật sự nhận).
     *
     * Vì sao đọc /proc/net/dev thay vì API: đây là bộ đếm của nhân, đọc 1s/lần gần như
     * miễn phí và KHÔNG tạo traffic — dùng để biết "mạng thực tế đang chở được bao nhiêu"
     * trong lúc tunnel đang chạy (xem vòng ramp trong HysteriaVpnService).
     *
     * @return tổng byte rx, hoặc -1 nếu chưa đọc được (chưa có TUN / không đọc được file).
     */
    fun tunRxBytes(): Long = readTunCounters()?.first ?: -1L

    /** Byte TX cua TUN — dung cho dong 'toc do tai len' tren man hinh. */
    fun tunTxBytes(): Long = readTunCounters()?.second ?: -1L

    /**
     * Byte mà TIẾN TRÌNH NÀY đã nhận trên MỌI socket của nó (API công khai của Android).
     *
     * Vì sao cần — đo trên máy thật 22/09/2026: SELinux chặn app đọc `/proc/net/dev`
     * ("app không đọc được /proc/net/dev"), nên vòng ramp lùi về bộ đếm của cầu WS. Nhưng
     * bộ đếm đó CHỈ nhúc nhích khi đường đang chạy qua cầu WS; transport trực tiếp
     * (hy-udp/hy-tcp) làm nó đứng yên ⇒ Diagnostics báo `observed=5kbps` trong khi cùng
     * phiên `probe ... -> 4463kbps qua tunnel` (sai ~900 lần), và vòng ramp vì thế tưởng
     * mạng chết nên kẹt khai báo ở sàn 1.000 kbps.
     *
     * TrafficStats theo UID là nguồn LUÔN đọc được và phủ MỌI transport, vì cả socket
     * trực tiếp lẫn socket của cầu WS đều thuộc UID của app. Đếm ở mức "trên dây" (đã mã
     * hoá + đóng khung) nên nhích cao hơn payload thật vài %; traffic của app đi đường
     * riêng (CN bypass) không thuộc UID này nên không bị tính vào.
     *
     * Đổi lại: traffic KHÔNG qua tunnel của chính app (đo mạng trước khi nối, gọi API điều
     * khiển) cũng nằm trong số này ⇒ đúng mấy giây đó con số hơi cao. Vì vậy chỉ dùng nguồn
     * này khi `/proc/net/dev` không đọc được, và mỗi 15s log ghi kèm `src=` để biết đang đo
     * bằng nguồn nào.
     *
     * @return tổng byte từ lúc khởi động máy, hoặc -1 nếu máy không hỗ trợ.
     */
    fun uidRxBytes(): Long = trafficStat { TrafficStats.getUidRxBytes(Process.myUid()) }

    /** Byte TX theo UID — dùng cho dòng "tốc độ tải lên" trên màn hình. */
    fun uidTxBytes(): Long = trafficStat { TrafficStats.getUidTxBytes(Process.myUid()) }

    private fun trafficStat(read: () -> Long): Long =
        runCatching { read() }.getOrDefault(-1L).let {
            if (it == TrafficStats.UNSUPPORTED.toLong()) -1L else it
        }

    /** @return (rxBytes, txBytes) của interface TUN, null nếu chưa có. */
    private fun readTunCounters(): Pair<Long, Long>? {
        val iface = tunIfaceName() ?: return null
        return runCatching {
            java.io.File("/proc/net/dev").readLines()
                .firstOrNull { it.substringBefore(':').trim() == iface }
                ?.let { line ->
                    val cols = line.substringAfter(':').trim().split(Regex("\\s+"))
                    val rx = cols.getOrNull(0)?.toLongOrNull() ?: return null
                    val tx = cols.getOrNull(8)?.toLongOrNull() ?: return null
                    rx to tx
                }
        }.getOrNull()
    }

    /**
     * Tên interface TUN của app ("tun0" trên thực tế). Không có API nào trả tên này
     * (Builder.establish() chỉ trả fd) nên đọc từ /proc/net/dev; nhớ lại sau lần đầu.
     */
    private fun tunIfaceName(): String? {
        ifaceName?.let { return it }
        val name = runCatching {
            java.io.File("/proc/net/dev").readLines()
                .map { it.substringBefore(':').trim() }
                .filter { it.startsWith("tun") }
                .let { list -> list.firstOrNull { it == "tun0" } ?: list.firstOrNull() }
        }.getOrNull()
        if (name != null) ifaceName = name
        return name
    }

    // ---- đỉnh bền vững đã đạt theo mạng ---------------------------------------

    /**
     * Đỉnh bền vững CAO NHẤT từng đạt trên mạng này (kbps); 0 = chưa từng ramp.
     *
     * Vì sao lưu riêng khỏi số đo probe: probe cho biết "lúc đo được bao nhiêu", còn đỉnh
     * cho biết "mức khai nào đã từng CHỞ ĐƯỢC traffic thật trong ≥10s". Lần sau vào cùng
     * mạng thì bắt đầu luôn ở mức đó ⇒ ramp chỉ cần xảy ra MỘT lần cho mỗi mạng.
     */
    fun bestKbps(key: String): Int = runCatching {
        prefs().getInt(kBest(key), 0)
    }.getOrDefault(0)

    /** Ghi đỉnh bền vững — chỉ GHI CAO LÊN (ramp giảm không xoá đỉnh đã chứng minh). */
    fun rememberBest(key: String, kbps: Int) {
        if (kbps <= bestKbps(key)) return
        runCatching {
            prefs().edit().putInt(kBest(key), kbps).apply()
        }
    }

    // ---- phép đo qua tunnel ---------------------------------------------------

    /**
     * Đo goodput XUỐNG thật qua tunnel: một GET ngắn tới [Config.BW_PROBE_URL], đọc tối đa
     * [maxMs] ms hoặc [maxBytes] byte.
     *
     * Vì sao dùng socket KHÔNG protect(): socket không protect của chính app VPN đi XUYÊN
     * QUA TUN (đúng như probeThroughTunnel() đang dùng để kiểm tunnel sống), nên số đo là
     * goodput thật của đường đang chở traffic — tính cả chi phí tunnel + relay, tức đúng
     * con số cần đem đi khai Brutal.
     *
     * Vì sao mốc thời gian lấy SAU khi đã nhận header: DNS + bắt tay TLS là ĐỘ TRỄ, không
     * phải băng thông; gộp vào sẽ đo sai (đường 100 Mbps có RTT 300ms trông như 5 Mbps).
     *
     * @return kbps, hoặc 0 nếu không đo được — khi đó KHÔNG ghi nhớ gì, đường lùi vẫn là
     *   cơ chế tĩnh cũ.
     */
    fun measureDownKbps(maxBytes: Int, maxMs: Long): Int {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(Config.BW_PROBE_URL).openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = maxMs.toInt()
                useCaches = false
                instanceFollowRedirects = true
                setRequestProperty("Accept-Encoding", "identity")
                setRequestProperty("User-Agent", "VPNFlow-bwprobe")
            }
            val code = conn.responseCode
            if (code != 200) {
                DiagnosticsLog.warn("bw: probe HTTP $code -> bỏ qua, giữ số cũ")
                return 0
            }
            val stream = conn.inputStream
            val buf = ByteArray(32 * 1024)
            var total = 0L
            val start = System.nanoTime()
            var last = start
            while (total < maxBytes) {
                val n = stream.read(buf) // readTimeout cắt nếu đường chết hẳn
                if (n <= 0) break
                total += n
                last = System.nanoTime()
                if ((last - start) / 1_000_000L >= maxMs) break
            }
            val ms = ((last - start) / 1_000_000L).coerceAtLeast(1L)
            if (total < MIN_PROBE_BYTES || ms < MIN_PROBE_MS) {
                DiagnosticsLog.warn("bw: probe quá ít dữ liệu (${total}B/${ms}ms) -> bỏ qua")
                return 0
            }
            // bits/ms == kbit/s, nên công thức này ra thẳng kbps.
            val kbps = ((total * 8) / ms).toInt()
            DiagnosticsLog.log("bw: probe ${total}B/${ms}ms -> ${kbps}kbps qua tunnel")
            kbps
        } catch (e: Exception) {
            DiagnosticsLog.warn("bw: probe FAIL ${e.javaClass.simpleName}: ${e.message}")
            0
        } finally {
            runCatching { conn?.disconnect() }
        }
    }

    /** Cùng file prefs với lượt transport đã nhớ (HysteriaVpnService.PREFS) — không tạo file mới. */
    private fun prefs() =
        appContext.getSharedPreferences(HysteriaVpnService.PREFS, Context.MODE_PRIVATE)

    private fun kMeasured(key: String) = "bw_kbps_$key"
    private fun kPrevious(key: String) = "bw_prev_$key"
    private fun kBest(key: String) = "bw_best_$key"
    private fun kDeclared(key: String) = "bw_decl_$key"
    private fun kAt(key: String) = "bw_at_$key"

    companion object {
        /** Trần thời gian bắt tay HTTP của phép đo (DNS + TLS qua tunnel). */
        const val CONNECT_TIMEOUT_MS = 2000
        /** Dưới ngần này thì phép đo vô nghĩa (nhiễu khởi động), không ghi nhớ. */
        const val MIN_PROBE_BYTES = 200_000L
        const val MIN_PROBE_MS = 400L

        /**
         * Chờ trước khi đo, để tunnel kịp chở traffic thật (client vừa lên còn đang mở cửa
         * sổ congestion). Tổng thời gian đo vẫn <= 3s như yêu cầu.
         */
        const val PROBE_DELAY_MS = 1200L
        /** Trần thời gian đọc dữ liệu của phép đo. */
        const val PROBE_MAX_MS = 3000L
        /** Lượng dữ liệu tối đa tải qua tunnel cho một phép đo. */
        const val PROBE_BYTES = 4_000_000
        /** Mạng di động: đo ít hơn (dữ liệu của người dùng, không nên tiêu hoang). */
        const val PROBE_BYTES_METERED = 1_500_000
        /** Vừa đo xong thì thôi, không đo lại mỗi lần reconnect (tốn dữ liệu, vô ích). */
        const val PROBE_MIN_INTERVAL_MS = 3 * 60 * 1000L
    }
}

/**
 * Luật chốt số khai — hàm THUẦN (không đụng API Android) nên test được trên JVM.
 *
 * Tách khỏi [BandwidthMemory] vì đây là phần dễ sai nhất của cơ chế (kẹp trần/sàn, chống
 * trôi dốc số khai) và cần được khoá bằng unit test, không phải bằng cách thử trên máy.
 */
object BandwidthPolicy {

    /** Chưa có số đo nào ⇒ dùng đúng cơ chế tĩnh cũ. */
    const val REASON_PROFILE = "profile"
    /** Dùng số đã nhớ của mạng này. */
    const val REASON_MEMORY = "memory"
    /** Số nhớ (hoặc số tĩnh) bị kẹp bởi trần vật lý / sàn. */
    const val REASON_CLAMP = "clamp"
    /** Lý do của dòng log phát ra từ chính phép đo. */
    const val REASON_PROBE = "probe"
    /** Số khai của phiên đang được vòng ramp trong lúc chạy điều chỉnh. */
    const val REASON_RAMP = "ramp"

    /**
     * Tỉ lệ của số đo được đem đi khai: chừa ~15% đầu cho chặng tunnel/relay và cho việc
     * Brutal pace sát trần (khai đúng bằng goodput đo được là khai vào vùng đã bão hoà).
     */
    const val DECLARE_RATIO_PCT = 85

    /**
     * Bốn dải của tỉ lệ `pct = measured * 100 / declared` (đo được so với số khai cũ).
     * Đây là vòng điều chỉnh và CHỈ chạy ở ranh giới kết nối — đổi số khai phải dựng lại
     * client hysteria nên tuyệt đối không đổi giữa lúc đang chở traffic:
     *
     *   >= 150% ⇒ đo VƯỢT XA số khai ⇒ số khai là nút cổ chai rõ ràng ⇒ NHẢY LÊN theo số đo
     *             (85% số đo). Cần dải này vì dò 15% mỗi lần kết nối thì từ 1 Mbps lên
     *             40 Mbps phải mất hàng chục lần kết nối.
     *   95-150% ⇒ đo chạm trần số khai (Brutal pace đúng số khai nên goodput = số khai khi
     *             đường chưa bão hoà) ⇒ còn dư ⇒ DÒ LÊN 15% cho tới khi chạm trần thật.
     *   80-95%  ⇒ đo xấp xỉ số đang khai ⇒ GIỮ NGUYÊN. Dải chết chống dao động: hạ ở đây thì
     *             mỗi lần kết nối lại tụt một nấc, còn dò lên thì hai lượt liên tiếp đổi số
     *             qua lại mà tốc độ thật không đổi.
     *   < 80%   ⇒ đo thấp hơn hẳn số đang khai ⇒ số khai cũ KHAI VƯỢT sức mạng ⇒ hạ, nhưng
     *             KHÔNG hạ quá [DAMPING_PCT]% số cũ trong một lần (xem DAMPING_PCT).
     */
    const val JUMPUP_PCT = 150
    const val SATURATED_PCT = 95
    const val DEADBAND_PCT = 80
    /** Bước dò lên khi đường còn dư (chỉ ở ranh giới kết nối). */
    const val EXPLORE_PCT = 115

    /**
     * Giảm xóc cho mẫu đo TỤT SÂU: khi hạ số khai, lấy mốc là số đo MỚI, nhưng nếu số đo mới
     * nhỏ hơn 60% số đo LIỀN TRƯỚC thì chỉ tính 60% mốc cũ.
     *
     * Vì sao cần — đo thật trên Wi-Fi khách sạn ICONLABHOTEL (19/09): mạng chập chờn theo
     * từng phút, ba lần đo RAW liên tiếp ra 42 / 0,79 / 119 Mbps. Một phép đo 3s rơi đúng
     * lúc mạng đứng chỉ ra 573 kbps, mà luật "hạ về 85% số đo" sẽ khai 1 Mbps cho phiên sau
     * — trong khi chính mạng đó lúc khác chở được 49 Mbps ⇒ một mẫu xấu làm chậm cả một
     * phiên. Có giảm xóc thì mẫu tụt sâu chỉ kéo số khai xuống một nửa, và dải >=150% sẽ
     * nhảy lên lại NGAY ở lần kết nối sau khi mạng thật sự còn dư.
     *
     * Mốc giảm xóc là SỐ ĐO trước đó (không phải SỐ KHAI trước đó): số khai có thể đang cao
     * hơn hẳn sức mạng thật, lấy nó làm mốc thì số khai cứ bám mãi ở mức không tưởng.
     */
    const val DAMPING_PCT = 60

    /**
     * SÀN khai tối thiểu (kbps): chỉ để KHÔNG BAO GIỜ khai 0/vài chục kbps cho Brutal CC.
     *
     * Đây là SÀN AN TOÀN NHỎ, **KHÔNG phải nấc tĩnh**. Vì sao tuyệt đối không lấy nấc tĩnh
     * (metered 8/12 Mbps) làm sàn — đúng lỗi đo được trên Galaxy Z Fold5 lúc 22:52 19/09
     * (Wi-Fi khách sạn bị hệ thống coi là metered):
     *   bw: net=wifi-gw-10.0.3.254 measured=1555 declared up=8000 down=12000 reason=clamp
     *   bw: probe 425210B/3199ms -> 1063kbps qua tunnel
     * Đo được 1,0-1,5 Mbps mà sàn kéo số khai LÊN 8/12 Mbps ⇒ Brutal pace gấp ~10 lần sức
     * mạng thật ⇒ tự flood ⇒ tắc (YouTube không kéo nổi). Sàn phải nhỏ hơn MỌI nấc tĩnh.
     *
     * Chiều LÊN giữ đúng tỉ lệ up/down của nấc tĩnh đang dùng (8000/12000) nên sàn lên
     * tương ứng 500 kbps: dưới mức đó thì khai 0 cũng không khác gì.
     */
    const val FLOOR_UP_KBPS = 500
    const val FLOOR_DOWN_KBPS = 1_000

    /** Trần cứng khi KHÔNG biết sức mạng vật lý (linkSpeed không đọc được). */
    const val HARD_CEIL_KBPS = 200_000

    // ---- vòng ramp trong lúc chạy (chỉ áp ở ranh giới an toàn) ----------------

    /** Đỉnh bền vững = trung bình trượt [SUSTAINED_WINDOW_S] giây (brief: 10-15s). */
    const val SUSTAINED_WINDOW_S = 12

    /** Quan sát bền vững vượt trần đang khai từ ngần này % ⇒ coi là khai thấp. */
    const val RAMP_TRIGGER_PCT = 115

    /**
     * Phải giữ điều kiện ramp LIÊN TỤC ngần này ms mới đổi số khai: một đợt burst ngắn
     * (cache, ACK dồn) không đủ để dựng lại QUIC.
     */
    const val RAMP_HOLD_MS = 10_000L

    /** Bước tăng / giảm trần khi ramp (chỉ đổi ở ranh giới an toàn). */
    const val RAMP_UP_PCT = 125
    const val RAMP_DOWN_PCT = 70

    /** Mất gói (%) vượt ngần này ⇒ giảm trần (giảm thì an toàn hơn tăng nên ưu tiên ngay). */
    const val RAMP_LOSS_PCT = 2

    /** RTT vọt lên = gấp [RTT_SPIKE_X] lần mức nền, và ít nhất [RTT_SPIKE_MIN_MS] ms. */
    const val RTT_SPIKE_X = 3
    const val RTT_SPIKE_MIN_MS = 800

    /**
     * Quan sát bền vững TỤT so với trần đang khai (dưới ngần này %) trong [RAMP_HOLD_MS]
     * ⇒ giảm trần. Đây là lưới an toàn cho trường hợp "bắt đầu ở đỉnh cũ nhưng mạng đã
     * yếu hẳn" mà RTT không vọt (chặng relay bị bóp dung lượng nhưng không dồn hàng đợi).
     */
    const val UNDERRUN_PCT = 50

    /**
     * Đỉnh bền vững = trung bình trượt của [count] mẫu 1 giây gần nhất (kbps).
     * Hàm THUẦN để test được trên JVM (vòng lấy mẫu nằm trong service).
     */
    fun sustainedKbps(samples: IntArray, count: Int): Int {
        val n = minOf(count, samples.size)
        if (n <= 0) return 0
        var sum = 0L
        for (i in 0 until n) sum += samples[i]
        return (sum / n).toInt()
    }

    /** Quan sát bền vững vượt trần đang khai ≥ [RAMP_TRIGGER_PCT]% ⇒ đường còn dư thật. */
    fun shouldRampUp(sustainedKbps: Int, declaredKbps: Int): Boolean =
        declaredKbps > 0 && sustainedKbps.toLong() * 100 >= declaredKbps.toLong() * RAMP_TRIGGER_PCT

    /** Giảm trần: mất gói vượt ngưỡng, hoặc RTT vọt lên so với mức nền. */
    fun shouldRampDown(lossPct: Int, rttMs: Int, rttBaselineMs: Int): Boolean {
        if (lossPct >= RAMP_LOSS_PCT) return true
        if (rttMs <= 0 || rttBaselineMs <= 0) return false
        return rttMs >= maxOf(rttBaselineMs.toLong() * RTT_SPIKE_X, RTT_SPIKE_MIN_MS.toLong())
    }

    /** Quan sát tụt hẳn so với trần đang khai (lưới an toàn, xem [UNDERRUN_PCT]). */
    fun shouldRampDownUnderrun(sustainedKbps: Int, declaredKbps: Int): Boolean =
        declaredKbps > 0 && sustainedKbps > 0 &&
            sustainedKbps.toLong() * 100 < declaredKbps.toLong() * UNDERRUN_PCT

    /** Bước TĂNG trần, kẹp bởi [ceilingKbps] (sức mạng vật lý) và không xuống dưới [floorKbps]. */
    fun rampUp(currentKbps: Int, ceilingKbps: Int, floorKbps: Int): Int =
        (currentKbps.toLong() * RAMP_UP_PCT / 100).toInt()
            .coerceIn(floorKbps, maxOf(ceilingKbps, floorKbps))

    /** Bước GIẢM trần (mất gói/RTT vọt/tụt sâu), cùng cách kẹp như [rampUp]. */
    fun rampDown(currentKbps: Int, ceilingKbps: Int, floorKbps: Int): Int =
        (currentKbps.toLong() * RAMP_DOWN_PCT / 100).toInt()
            .coerceIn(floorKbps, maxOf(ceilingKbps, floorKbps))

    data class Decision(
        val upKbps: Int,
        val downKbps: Int,
        val reason: String,
        /** Trần xuống thật đã dùng để kẹp (kbps) — in ra log để biết vì sao bị kẹp. */
        val ceilingDownKbps: Int,
        /** Trần "sức mạng vật lý" (kbps) — vòng ramp trong phiên được phép bò tới đây. */
        val physicalCeilingDownKbps: Int = ceilingDownKbps,
    )

    /**
     * Chốt số khai cho lượt kết nối tới.
     *
     * @param rememberedMeasuredKbps số đã nhớ (0 = chưa từng đo mạng này).
     * @param rememberedDeclaredKbps số khai của chính lượt đo đã nhớ (0 nếu chưa có).
     * @param previousMeasuredKbps số đo LIỀN TRƯỚC số đã nhớ (0 nếu chưa có) — mốc giảm xóc.
     * @param staticUpKbps/@param staticDownKbps nấc tĩnh cũ (metered 8/12, unmetered 30/100).
     * @param ceilingDownKbps trần "sức mạng vật lý" từ linkSpeed+RSSI/loại mạng; 0 = không biết.
     */
    fun decide(
        rememberedMeasuredKbps: Int,
        rememberedDeclaredKbps: Int,
        staticUpKbps: Int,
        staticDownKbps: Int,
        ceilingDownKbps: Int,
        previousMeasuredKbps: Int = 0,
        bestKbps: Int = 0,
    ): Decision {
        // Trần "sức mạng vật lý": vòng ramp TRONG PHIÊN được phép bò tới đây khi mạng đã
        // CHỨNG MINH là chở được (xem BandwidthPolicy.rampUp).
        val ceilPhysical = if (ceilingDownKbps > 0) ceilingDownKbps else HARD_CEIL_KBPS
        // Nấc KHỞI ĐIỂM (chưa từng ramp trên mạng này) vẫn bị kẹp như cũ: không vượt nấc tĩnh
        // đang chạy tốt (30/100) ⇒ mặc định của mọi mạng KHÔNG đổi so với trước.
        val ceilStart = minOf(ceilPhysical, staticDownKbps)
        // ĐÃ CÓ ĐỈNH bền vững trên mạng này ⇒ bắt đầu luôn ở mức cao nhất từng đạt (ramp chỉ
        // cần xảy ra MỘT lần cho mỗi mạng), và lúc đó trần là sức mạng vật lý — vì đỉnh đã
        // được chứng minh là chở được traffic thật, không phải con số đoán.
        val ceilDown = if (bestKbps > 0) ceilPhysical else ceilStart
        // Chiều LÊN không đo riêng (phép đo chỉ tải xuống) nên lấy đúng tỉ lệ up/down của nấc
        // tĩnh (unmetered 30/100, metered 8/12) để giữ nguyên độ bất đối xứng đã đo tốt.
        val ratioUp = staticUpKbps.toLong()
        val ratioDown = staticDownKbps.coerceAtLeast(1).toLong()
        val ceilUp = minOf(
            maxOf(staticUpKbps.toLong(), FLOOR_UP_KBPS.toLong()),
            maxOf(FLOOR_UP_KBPS.toLong(), ceilDown.toLong() * ratioUp / ratioDown),
        ).toInt()

        var down: Int
        var up: Int
        var reason: String
        if (rememberedMeasuredKbps <= 0 && bestKbps <= 0) {
            // Chưa từng đo, chưa từng ramp mạng này: ĐÚNG cơ chế tĩnh cũ (đường lùi an toàn).
            down = staticDownKbps
            up = staticUpKbps
            reason = REASON_PROFILE
        } else if (rememberedMeasuredKbps > 0 && rememberedDeclaredKbps > 0) {
            val pct = rememberedMeasuredKbps * 100 / rememberedDeclaredKbps
            down = when {
                pct >= JUMPUP_PCT -> rememberedMeasuredKbps * DECLARE_RATIO_PCT / 100
                pct >= SATURATED_PCT -> rememberedDeclaredKbps * EXPLORE_PCT / 100
                pct >= DEADBAND_PCT -> rememberedDeclaredKbps
                else -> maxOf(
                    rememberedMeasuredKbps,
                    previousMeasuredKbps * DAMPING_PCT / 100,
                ) * DECLARE_RATIO_PCT / 100
            }
            up = (down.toLong() * ratioUp / ratioDown).toInt()
            reason = REASON_MEMORY
        } else if (rememberedMeasuredKbps > 0) {
            // Có số đo mà không có số khai đi kèm (dữ liệu cũ/thiếu): coi như khai vượt.
            down = rememberedMeasuredKbps * DECLARE_RATIO_PCT / 100
            up = (down.toLong() * ratioUp / ratioDown).toInt()
            reason = REASON_MEMORY
        } else {
            // Chỉ có ĐỈNH (mạng đã từng ramp nhưng chưa có phép đo nào được lưu).
            down = bestKbps
            up = (down.toLong() * ratioUp / ratioDown).toInt()
            reason = REASON_MEMORY
        }

        // Bắt đầu từ ĐỈNH đã đạt: không bao giờ khởi điểm thấp hơn mức mà chính mạng này đã
        // từng chở được liên tục >=10s (điểm quan trọng nhất cho UX — brief mục 5).
        if (bestKbps > down) {
            down = bestKbps
            up = (down.toLong() * ratioUp / ratioDown).toInt()
        }

        // Chỉ báo reason=clamp khi con số THỰC SỰ bị đổi (bước dò 15% chạm trần thì vẫn là
        // "dùng số đã nhớ", không phải bị kẹp).
        var clamped = false
        if (down > ceilDown) {
            down = ceilDown
            clamped = true
        }
        if (up > ceilUp) {
            up = ceilUp
            clamped = true
        }
        // Sàn CHỈ để tránh khai 0 (xem FLOOR_DOWN_KBPS) — không bao giờ kéo số khai LÊN nấc
        // tĩnh: có số đo thì số khai là f(số đo), nấc tĩnh chỉ là đường lùi khi CHƯA đo được.
        if (down < FLOOR_DOWN_KBPS && FLOOR_DOWN_KBPS <= ceilDown) {
            down = FLOOR_DOWN_KBPS
            clamped = true
        }
        if (up < FLOOR_UP_KBPS && FLOOR_UP_KBPS <= ceilUp) {
            up = FLOOR_UP_KBPS
            clamped = true
        }
        if (clamped) reason = REASON_CLAMP
        return Decision(
            upKbps = up,
            downKbps = down,
            reason = reason,
            ceilingDownKbps = ceilDown,
            physicalCeilingDownKbps = ceilPhysical,
        )
    }
}
