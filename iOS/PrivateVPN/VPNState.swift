import Foundation
import NetworkExtension

enum VPNState: Equatable, Sendable {
    case disconnected
    case connecting
    case connected
    case disconnecting
    case failed

    init(networkStatus: NEVPNStatus) {
        switch networkStatus {
        case .disconnected:
            self = .disconnected
        case .connecting:
            self = .connecting
        case .connected:
            self = .connected
        case .disconnecting:
            self = .disconnecting
        case .reasserting:
            self = .connecting
        case .invalid:
            self = .failed
        @unknown default:
            self = .failed
        }
    }

    var label: String {
        switch self {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting"
        case .connected: return "Connected"
        case .disconnecting: return "Disconnecting"
        case .failed: return "Failed"
        }
    }

    var canConnect: Bool {
        self == .disconnected || self == .failed
    }

    var canDisconnect: Bool {
        self == .connecting || self == .connected
    }
}
