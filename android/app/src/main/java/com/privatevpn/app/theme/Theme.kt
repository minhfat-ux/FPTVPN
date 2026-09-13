package com.privatevpn.app.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle

/** Visual theme — mirrors iOS/macOS VPNTheme. Always dark, FlowVPN navy palette
 *  (matches FPT Harness style): #0A1F3B base, #0E2747 cards, #16385E bottom,
 *  system blue accent. */
object VPNTheme {
    // iOS system blue (#007AFF) — matches the iOS/macOS app accent.
    val Accent = Color(0xFF007AFF)
    // Success green — connected state (FlowVPN brand green #33C773).
    val Green = Color(0xFF33C773)

    /**
     * Tên app với "Flow" tô màu brand — giống trang buy.
     *
     * Trang buy render `'VPN<span>Flow</span> Premium'` và CSS `.logo span` đặt
     * `color: #33c773` (control-plane/src/payments.js), tức chữ "Flow" xanh còn
     * "VPN" trắng. #33C773 đúng bằng `Green` ở đây nên không cần thêm màu mới.
     *
     * Trả `AnnotatedString` chứ không trả chuỗi đã style sẵn: `Text(...)` vẫn nhận
     * fontSize/fontWeight/color đặt ở ngoài, đúng cách các màn hình đang dùng.
     */
    fun brandName(): AnnotatedString = buildAnnotatedString {
        append("VPN")
        withStyle(SpanStyle(color = Green)) { append("Flow") }
    }

    /**
     * Tiêu đề paywall với "Flow" tô màu brand — giống trang buy
     * (`'VPN<span>Flow</span> Premium'`).
     *
     * Chỉ tô khi chuỗi BẮT ĐẦU bằng tên app (mọi bản dịch hiện tại đều vậy). Bản dịch
     * nào không bắt đầu bằng tên app thì trả nguyên chuỗi — KHÔNG đoán chỗ cắt, vì cắt
     * sai giữa câu sẽ tô màu vào chữ vô nghĩa.
     */
    fun brandTitle(text: String): AnnotatedString {
        val prefix = "VPNFlow"
        if (!text.startsWith(prefix)) return AnnotatedString(text)
        return buildAnnotatedString {
            append("VPN")
            withStyle(SpanStyle(color = Green)) { append("Flow") }
            append(text.substring(prefix.length))
        }
    }
    val Red = Color(0xFFFF3B30)
    val Orange = Color(0xFFFF9500)
    val Yellow = Color(0xFFFFD60A)

    // FlowVPN navy palette (FPT Harness style) — always dark.
    private val NavyBase = Color(0xFF0A1F3B)      // #0A1F3B
    private val NavyLayer1 = Color(0xFF0E2747)    // #0E2747
    private val NavyLayer2 = Color(0xFF123052)    // #123052
    private val NavyLayer3 = Color(0xFF16385E)    // #16385E

    val BackgroundTop = NavyBase
    val BackgroundBottom = NavyLayer3

    val CardBackground = NavyLayer1
    val CardStroke = Color.White.copy(alpha = 0.12f)

    val Label = Color(0xFFFFFFFF)
    val SecondaryLabel = Color.White.copy(alpha = 0.6f)
    val TertiaryLabel = Color.White.copy(alpha = 0.4f)

    val backgroundGradient = Brush.verticalGradient(
        colors = listOf(BackgroundTop, BackgroundBottom)
    )
}

/** Connection state (mirrors iOS VPNState). */
enum class VPNState {
    DISCONNECTED, CONNECTING, CONNECTED, DISCONNECTING, FAILED;

    val isTransitioning: Boolean
        get() = this == CONNECTING || this == DISCONNECTING

    val canConnect: Boolean
        get() = this == DISCONNECTED || this == FAILED

    val canDisconnect: Boolean
        get() = this == CONNECTING || this == CONNECTED
}
