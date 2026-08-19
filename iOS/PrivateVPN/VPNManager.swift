import Foundation
import NetworkExtension

@MainActor
final class VPNManager: ObservableObject {
    static let providerBundleIdentifier = "com.privatevpn.app.packet-tunnel"

    @Published private(set) var state: VPNState = .disconnected
    @Published private(set) var lastError: String?

    private let manager = NEVPNManager.shared()
    nonisolated(unsafe) private var statusObserver: NSObjectProtocol?

    init() {
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.refreshStatus()
            }
        }
        refreshStatus()
    }

    deinit {
        if let statusObserver {
            NotificationCenter.default.removeObserver(statusObserver)
        }
    }

    func refreshStatus() {
        state = VPNState(networkStatus: manager.connection.status)
    }

    func connect() async {
        do {
            try await prepareConfiguration()
            try manager.connection.startVPNTunnel()
            lastError = nil
            refreshStatus()
        } catch {
            state = .failed
            lastError = error.localizedDescription
        }
    }

    func disconnect() {
        manager.connection.stopVPNTunnel()
        refreshStatus()
    }

    private func prepareConfiguration() async throws {
        try await manager.loadFromPreferences()
        guard manager.protocolConfiguration == nil else { return }

        let protocolConfig = NETunnelProviderProtocol()
        protocolConfig.providerBundleIdentifier = Self.providerBundleIdentifier
        protocolConfig.serverAddress = "vpn.privatevpn.invalid"
        protocolConfig.providerConfiguration = [
            "tunnelRemoteAddress": "10.80.0.1",
            "tunnelLocalAddress": "10.80.0.2",
        ]

        manager.protocolConfiguration = protocolConfig
        manager.localizedDescription = "PrivateVPN"
        manager.isEnabled = true
        try await manager.saveToPreferences()
    }
}
