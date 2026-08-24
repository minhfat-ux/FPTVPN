package com.privatevpn.app.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/** Visual theme — mirrors iOS/macOS VPNTheme (dark gradient + accent green). */
object VPNTheme {
    val Accent = Color(0xFF33C773)
    val Red = Color(0xFFFF3B30)
    val Orange = Color(0xFFFF9500)
    val Yellow = Color(0xFFFFD60A)

    val BackgroundTop = Color(0xFF051525)
    val BackgroundBottom = Color(0xFF0A1F3A)

    val CardBackground = Color.White.copy(alpha = 0.06f)
    val CardStroke = Color.White.copy(alpha = 0.12f)

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
