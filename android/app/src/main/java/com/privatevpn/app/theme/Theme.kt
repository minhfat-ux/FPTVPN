package com.privatevpn.app.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/** Visual theme — mirrors iOS/macOS VPNTheme (system blue accent + adaptive bg). */
object VPNTheme {
    // iOS system blue (#007AFF) — matches the iOS/macOS app accent.
    val Accent = Color(0xFF007AFF)
    val Red = Color(0xFFFF3B30)
    val Orange = Color(0xFFFF9500)
    val Yellow = Color(0xFFFFD60A)

    // Adaptive system backgrounds (mirrors iOS systemBackground/secondarySystemBackground).
    val BackgroundTop: Color @Composable get() = if (isSystemInDarkTheme()) Color(0xFF000000) else Color(0xFFF2F2F7)
    val BackgroundBottom: Color @Composable get() = if (isSystemInDarkTheme()) Color(0xFF1C1C1E) else Color(0xFFF2F2F7)

    val CardBackground: Color @Composable get() = if (isSystemInDarkTheme()) Color(0xFF2C2C2E) else Color(0xFFFFFFFF)
    val CardStroke: Color @Composable get() = if (isSystemInDarkTheme()) Color(0xFF3A3A3C) else Color(0xFFE5E5EA)

    val Label: Color @Composable get() = if (isSystemInDarkTheme()) Color(0xFFFFFFFF) else Color(0xFF000000)
    val SecondaryLabel: Color @Composable get() = if (isSystemInDarkTheme()) Color(0xFFEBEBF5) else Color(0xFF3C3C43)
    val TertiaryLabel: Color @Composable get() = if (isSystemInDarkTheme()) Color(0xFFEBEBF5).copy(alpha = 0.6f) else Color(0xFF3C3C43).copy(alpha = 0.6f)

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
