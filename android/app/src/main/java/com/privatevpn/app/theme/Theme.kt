package com.privatevpn.app.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/** Visual theme — mirrors iOS/macOS VPNTheme. FlowVPN navy palette in dark mode
 *  (matches FPT Harness style: #0A1F3B base, #0E2747 cards, #16385E bottom),
 *  iOS system backgrounds in light mode, system blue accent. */
object VPNTheme {
    // iOS system blue (#007AFF) — matches the iOS/macOS app accent.
    val Accent = Color(0xFF007AFF)
    val Red = Color(0xFFFF3B30)
    val Orange = Color(0xFFFF9500)
    val Yellow = Color(0xFFFFD60A)

    // FlowVPN navy palette (FPT Harness style).
    private val NavyBase = Color(0xFF0A1F3B)      // #0A1F3B
    private val NavyLayer1 = Color(0xFF0E2747)    // #0E2747
    private val NavyLayer2 = Color(0xFF123052)    // #123052
    private val NavyLayer3 = Color(0xFF16385E)    // #16385E

    // Adaptive backgrounds: system light, FlowVPN navy dark.
    val BackgroundTop: Color @Composable get() = if (isSystemInDarkTheme()) NavyBase else Color(0xFFF2F2F7)
    val BackgroundBottom: Color @Composable get() = if (isSystemInDarkTheme()) NavyLayer3 else Color(0xFFF2F2F7)

    val CardBackground: Color @Composable get() = if (isSystemInDarkTheme()) NavyLayer1 else Color(0xFFFFFFFF)
    val CardStroke: Color @Composable get() = if (isSystemInDarkTheme()) Color.White.copy(alpha = 0.12f) else Color(0xFFE5E5EA)

    val Label: Color @Composable get() = if (isSystemInDarkTheme()) Color(0xFFFFFFFF) else Color(0xFF000000)
    val SecondaryLabel: Color @Composable get() = if (isSystemInDarkTheme()) Color.White.copy(alpha = 0.6f) else Color(0xFF3C3C43)
    val TertiaryLabel: Color @Composable get() = if (isSystemInDarkTheme()) Color.White.copy(alpha = 0.4f) else Color(0xFF3C3C43).copy(alpha = 0.6f)

    val backgroundGradient: Brush @Composable get() = Brush.verticalGradient(
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
