import NetworkExtension
import os
import Security
import WireGuardKit

final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let log = Logger(
        subsystem: "com.privatevpn.app.packet-tunnel",
        category: "tunnel"
    )

    private var adapter: WireGuardAdapter?

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        let adapter = WireGuardAdapter(with: self) { [weak self] level, message in
            let osLevel: OSLogType = level == .error ? .error : .debug
            self?.log.log(level: osLevel, "\(message)")
        }
        self.adapter = adapter

        guard let config = self.configuration,
              let tunnelConfig = try? config.makeTunnelConfiguration() else {
            let error = NSError(
                domain: "com.privatevpn.tunnel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid or missing WireGuard configuration"]
            )
            completionHandler(error)
            return
        }

        adapter.start(tunnelConfiguration: tunnelConfig) { [weak self] error in
            if let error {
                self?.log.error("Failed to start tunnel: \(error.localizedDescription)")
                completionHandler(error)
            } else {
                self?.log.info("WireGuard tunnel started")
                completionHandler(nil)
            }
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        log.info("Stopping tunnel; reason=\(reason.rawValue)")
        adapter?.stop { [weak self] error in
            self?.adapter = nil
            if let error {
                self?.log.error("Error stopping tunnel: \(error.localizedDescription)")
            }
            completionHandler()
        }
    }

    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        adapter?.getRuntimeConfiguration { config in
            completionHandler?(config?.data(using: .utf8))
        }
    }

    /// Extracts and builds the WireGuard configuration from `protocolConfiguration`.
    private var configuration: WireGuardConfig? {
        guard let providerConfig = (protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration,
              let data = providerConfig["wireguard"] as? Data,
              let config = try? JSONDecoder().decode(WireGuardConfig.self, from: data) else {
            return nil
        }
        guard config.privateKeyBase64.isEmpty else {
            return config
        }
        guard let privateKey = try? WireGuardPrivateKeyStore.loadPrivateKey() else {
            log.error("Missing WireGuard private key in shared Keychain")
            return nil
        }
        return config.withPrivateKey(privateKey)
    }
}

private enum WireGuardPrivateKeyStore {
    static let service = "com.privatevpn.app.keys"
    static let accessGroup = "G6XW3RN6LJ.com.privatevpn.shared"
    static let privateKeyAccount = "wireguard.private-key"

    static func loadPrivateKey() throws -> PrivateKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: privateKeyAccount,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data else {
                return nil
            }
            return PrivateKey(rawValue: data)
        case errSecItemNotFound:
            return nil
        default:
            throw NSError(
                domain: "com.privatevpn.tunnel.keychain",
                code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Shared Keychain read failed"]
            )
        }
    }
}

private extension Logger {
    func log(level: OSLogType, _ message: String) {
        self.log(level: level, "\(message, privacy: .public)")
    }
}
