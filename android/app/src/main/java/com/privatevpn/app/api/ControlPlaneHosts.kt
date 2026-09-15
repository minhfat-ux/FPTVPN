package com.privatevpn.app.api

import com.privatevpn.app.Config

/**
 * Chọn host control-plane đang dùng được, dùng chung cho mọi request API và cho URL web
 * (trang mua).
 *
 * Thứ tự: host chính ([Config.CONTROL_PLANE_URL]) trước, rồi host dự phòng theo TÊN
 * ([Config.CONTROL_PLANE_FALLBACK_HOSTS] — chống chặn SNI), rồi host dự phòng ghim IP
 * ([Config.API_FALLBACK_BASES] — chống chặn IP/DNS cache).
 *
 * "Sticky": host vừa trả lời được được nhớ lại ([PreferredHost]) để các request sau đi thẳng,
 * không phải chờ hết timeout của host chính mỗi lần. Khi mạng đổi, [forget] được gọi để thử
 * lại host chính — ở mạng mới host chính có thể đã vào được.
 */
object ControlPlaneHosts {
    /** Toàn bộ host API theo thứ tự ưu tiên; host chính luôn đứng đầu. */
    val orderedApiBases: List<String> = buildList {
        add(Config.CONTROL_PLANE_URL)
        addAll(Config.CONTROL_PLANE_FALLBACK_HOSTS)
        addAll(Config.API_FALLBACK_BASES)
    }.distinct()

    /** Các host dự phòng (không gồm host chính) theo thứ tự thử. */
    val fallbackApiBases: List<String> = orderedApiBases.drop(1)

    /** Host API đang dùng được; mặc định là host chính. */
    fun activeApiBase(): String = PreferredHost.get() ?: Config.CONTROL_PLANE_URL

    /** Web base tương ứng host API; host lạ (ví dụ tunnel dùng chung) lùi về web chính. */
    fun webBaseFor(apiBase: String): String =
        Config.WEB_BASE_BY_API_BASE[apiBase] ?: Config.WEB_URL

    /** URL trang mua dựng theo host đang dùng được. */
    fun buyUrl(): String = webBaseFor(activeApiBase()) + "/buy"

    /** Quên host đang nhớ để request sau thử lại host chính (gọi khi mạng đổi). */
    fun forget() = PreferredHost.forget()
}
