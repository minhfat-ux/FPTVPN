package com.privatevpn.app.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import com.privatevpn.app.Config
import com.privatevpn.app.diag.DiagnosticsLog

/**
 * Tự bật/tắt vai trò **gateway LAN của điện thoại** theo mạng đang dùng.
 *
 * Yêu cầu chủ dự án 24/10/2026: "con điện thoại này, khi vào mạng này cũng tự bật gateway lên cho TV".
 *
 * Nhận diện mạng nhà bằng **dải IP** (`192.168.100.*`) đọc từ `LinkProperties` — KHÔNG cần đọc SSID
 * (Android 13+ đòi quyền vị trí cho SSID) và cũng không cần thêm quyền nào.
 *
 * Hành vi:
 *  - vào mạng nhà  ⇒ pref `lan_gateway_enabled = true`  ⇒ [LocalProxy] mở proxy `0.0.0.0:18081`
 *    + trả lời discovery để app TV tự dò ra điện thoại;
 *  - ra mạng khác  ⇒ pref = false ⇒ đóng listener (không mở proxy ra mạng ngoài).
 *
 * Người dùng vẫn tắt được bằng tay trong Settings; lần đổi mạng kế tiếp app sẽ áp lại theo quy tắc này.
 */
object LanGatewayAuto {

    /** Dải IP của mạng nhà (khớp `HomeSubnet` trong tool desktop). */
    private const val HOME_PREFIX = "192.168.100."

    /** Đăng ký theo dõi mạng mặc định; gọi 1 lần trong Application.onCreate. */
    fun startWatching(context: Context) {
        val app = context.applicationContext
        sync(app)
        runCatching {
            val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = sync(app)
                override fun onLinkPropertiesChanged(network: Network, lp: LinkProperties) = sync(app)
                override fun onLost(network: Network) = sync(app)
            })
        }.onFailure {
            DiagnosticsLog.warn("lan-gateway: không đăng ký được network callback: ${it.message}")
        }
    }

    /** Áp trạng thái theo mạng hiện tại rồi đồng bộ listener. Gọi được từ bất kỳ đâu. */
    fun sync(context: Context) {
        val home = runCatching { isHomeNetwork(context) }.getOrDefault(false)
        val prefs = context.getSharedPreferences(HysteriaVpnService.PREFS, Context.MODE_PRIVATE)
        val before = prefs.getBoolean(Config.KEY_LAN_GATEWAY, false)
        if (before != home) {
            prefs.edit().putBoolean(Config.KEY_LAN_GATEWAY, home).apply()
            DiagnosticsLog.log("lan-gateway: mạng ${if (home) "NHÀ -> BẬT" else "khác -> TẮT"} vai trò gateway")
        }
        runCatching { LocalProxy.syncLanGateway(context) }
    }

    /** Mạng hiện tại có địa chỉ IPv4 thuộc dải nhà không. */
    private fun isHomeNetwork(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        // Duyệt MỌI mạng (không chỉ mạng "active"): điện thoại hay để Wi-Fi + 4G cùng lúc, mạng active
        // có thể là cellular trong khi Wi-Fi vẫn ở dải nhà (đo thật 24/10/2026).
        val networks = runCatching { cm.allNetworks.toList() }.getOrDefault(emptyList())
        for (net in networks) {
            val props = runCatching { cm.getLinkProperties(net) }.getOrNull() ?: continue
            for (addr in props.linkAddresses) {
                val host = addr.address?.hostAddress ?: continue
                if (host.startsWith(HOME_PREFIX)) return true
            }
        }
        return false
    }
}
