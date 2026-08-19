import SwiftUI

/// Shared visual theme for the PrivateVPN iOS UI.
enum VPNTheme {
    /// Accent — green used for the connected state and the primary action.
    static let accent = Color(red: 0.20, green: 0.78, blue: 0.45)

    static let backgroundTop = Color(red: 0.04, green: 0.06, blue: 0.13)
    static let backgroundBottom = Color(red: 0.09, green: 0.12, blue: 0.24)

    static let cardBackground = Color.white.opacity(0.06)
    static let cardStroke = Color.white.opacity(0.12)

    static let backgroundGradient = LinearGradient(
        colors: [backgroundTop, backgroundBottom],
        startPoint: .top,
        endPoint: .bottom
    )
}

// MARK: - VPNState UI presentation (UI-only extension; VPNState.swift untouched)

extension VPNState {
    /// SF Symbol representing the connection state.
    var symbol: String {
        switch self {
        case .disconnected: return "shield.slash.fill"
        case .connecting: return "shield.lefthalf.filled"
        case .connected: return "checkmark.shield.fill"
        case .disconnecting: return "shield.lefthalf.filled"
        case .failed: return "exclamationmark.triangle.fill"
        }
    }

    /// Accent color for the connection state.
    var tint: Color {
        switch self {
        case .disconnected: return Color.white.opacity(0.55)
        case .connecting, .disconnecting: return .orange
        case .connected: return VPNTheme.accent
        case .failed: return .red
        }
    }

    /// Short user-facing status line shown under the state label.
    var subtitle: String {
        switch self {
        case .disconnected: return "Not protected — internet traffic is direct"
        case .connecting: return "Establishing a secure tunnel…"
        case .connected: return "Protected — your internet exits through Vietnam"
        case .disconnecting: return "Closing the tunnel…"
        case .failed: return "Connection failed — check diagnostics below"
        }
    }

    var isTransitioning: Bool {
        self == .connecting || self == .disconnecting
    }
}
