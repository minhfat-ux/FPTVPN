import Network
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
    private var relay: WGRelayClient?
    /// Configuration to restore when the relay never comes up (direct UDP endpoint).
    private var directConfiguration: TunnelConfiguration?

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        RelayDiagnostics.shared.log("startTunnel requested")
        let adapter = WireGuardAdapter(with: self) { [weak self] level, message in
            let osLevel: OSLogType = level == .error ? .error : .debug
            self?.log.log(level: osLevel, "\(message)")
            // Mirror the WireGuard adapter into the pullable file: handshake and
            // transport errors only ever show up here.
            RelayDiagnostics.shared.log("wg: \(message)")
        }
        self.adapter = adapter

        guard let config = self.configuration,
              var tunnelConfig = try? config.makeTunnelConfiguration() else {
            let error = NSError(
                domain: "com.privatevpn.tunnel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid or missing WireGuard configuration"]
            )
            completionHandler(error)
            return
        }

        // WireGuard-over-TCP relay (same transport the Android client uses): point the
        // peer at a local UDP listener and let the relay carry the datagrams over TCP
        // to the exit node. Measured on a network where the raw-UDP handshake never
        // completed: the client kept re-sending handshakes every 5s while the server's
        // answers never got through. If the relay cannot be reached we fall back to
        // direct UDP, so nothing is lost on networks where UDP is fine.
        let directConfiguration = tunnelConfig
        if let relayHost = config.relayHost, let relayPorts = config.relayPorts,
           let localPort = startRelay(host: relayHost, ports: relayPorts),
           !tunnelConfig.peers.isEmpty {
            var peers = tunnelConfig.peers
            peers[0].endpoint = Endpoint(host: NWEndpoint.Host("127.0.0.1"), port: localPort)
            tunnelConfig = TunnelConfiguration(
                name: tunnelConfig.name,
                interface: tunnelConfig.interface,
                peers: peers
            )
            log.info("relay: WireGuard endpoint -> 127.0.0.1:\(localPort.rawValue) (relay \(relayHost):\(relayPorts.first ?? 0))")
            RelayDiagnostics.shared.log("relay: WireGuard endpoint -> 127.0.0.1:\(localPort.rawValue)")
            scheduleDirectFallback(direct: directConfiguration)
        }

        // Sau khi tunnel chạy, báo cho coordinator biết node này có tới được không:
        // node bị GFW chặn thì app phải tự nói, server tự kiểm tra không thấy được.
        let reportedNodeId = config.nodeId
        let activeRelay = relay
        DispatchQueue.global().asyncAfter(deadline: .now() + 15) {
            let reachable = activeRelay?.isConnected ?? true
            NodeHealthReporter.report(
                nodeId: reportedNodeId,
                reachable: reachable,
                reason: reachable ? nil : "relay unreachable from this network"
            )
        }

        adapter.start(tunnelConfiguration: tunnelConfig) { [weak self] error in
            if let error {
                self?.log.error("Failed to start tunnel: \(error.localizedDescription)")
                RelayDiagnostics.shared.log("Failed to start tunnel: \(error.localizedDescription)")
                completionHandler(error)
            } else {
                self?.log.info("WireGuard tunnel started")
                RelayDiagnostics.shared.log("WireGuard tunnel started")
                completionHandler(nil)
            }
        }
    }

    /// Starts the relay and returns the local UDP port WireGuard must use.
    ///
    /// No reachability probe here on purpose: a single 3s TCP probe at tunnel-start
    /// time can fail for reasons that have nothing to do with the relay (routes being
    /// installed, a slow first packet on the hotel network) and it then stranded the
    /// whole session on direct UDP, which is exactly the case this relay exists for.
    /// The client connects asynchronously and keeps retrying, so the link comes up as
    /// soon as the network allows.
    private func startRelay(host: String, ports: [UInt16]) -> NWEndpoint.Port? {
        let client = WGRelayClient(host: host, ports: ports, log: log)
        do {
            let localPort = try client.start()
            relay = client
            log.info("relay: started for \(host) ports \(ports)")
            RelayDiagnostics.shared.log("relay: started for \(host) ports \(ports)")
            return NWEndpoint.Port(rawValue: localPort)
        } catch {
            log.error("relay: could not start on \(host) — \(error)")
            RelayDiagnostics.shared.log("relay: could not start on \(host) — \(error)")
            return nil
        }
    }

    /// Safety net for exit nodes without a relay: if the TCP link is still not up a
    /// few seconds after the tunnel started, hand WireGuard the direct endpoint back.
    /// One-way on purpose — flapping between transports would be worse than either.
    private func scheduleDirectFallback(direct: TunnelConfiguration) {
        directConfiguration = direct
        guard let relay else { return }
        DispatchQueue.global().asyncAfter(deadline: .now() + 8) { [weak self] in
            guard let self, let adapter = self.adapter else { return }
            guard !relay.isConnected else {
                RelayDiagnostics.shared.log("relay: link is up, keeping the relay transport")
                return
            }
            RelayDiagnostics.shared.log("relay: still not connected after 8s — falling back to direct UDP")
            self.log.error("relay: not connected after 8s — falling back to direct UDP")
            adapter.update(tunnelConfiguration: direct) { error in
                if let error {
                    RelayDiagnostics.shared.log("relay: fallback update failed: \(error)")
                } else {
                    RelayDiagnostics.shared.log("relay: WireGuard endpoint restored to the direct node address")
                }
            }
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        log.info("Stopping tunnel; reason=\(reason.rawValue)")
        RelayDiagnostics.shared.log("stopTunnel reason=\(reason.rawValue)")
        relay?.stop()
        relay = nil
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
