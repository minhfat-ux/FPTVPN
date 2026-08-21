import SwiftUI

/// Shared visual theme for the PrivateVPN macOS UI — mirrors the iOS theme.
enum VPNThemeMac {
    /// Accent — green used for the connected state and the primary action.
    static let accent = Color(red: 0.20, green: 0.78, blue: 0.45)

    static let backgroundTop = Color(red: 0.04, green: 0.06, blue: 0.13)
    static let backgroundBottom = Color(red: 0.09, green: 0.12, blue: 0.24)

    static let cardBackground = Color.white.opacity(0.06)
    static let cardStroke = Color.white.opacity(0.12)

    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.6)

    static let backgroundGradient = LinearGradient(
        colors: [backgroundTop, backgroundBottom],
        startPoint: .top,
        endPoint: .bottom
    )
}
