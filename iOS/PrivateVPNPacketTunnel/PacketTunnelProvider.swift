import Network
import NetworkExtension
import os
import Security
import WireGuardKit

/// How long each transport in the chain gets to come up before the next one is tried.
private let transportGrace: TimeInterval = 8

final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let log = Logger(
        subsystem: "com.privatevpn.app.packet-tunnel",
        category: "tunnel"
    )

    private var adapter: WireGuardAdapter?
    private var relay: WGRelayClient?
    /// WebSocket relay: only started when the TCP relay never came up (see
    /// `scheduleWebSocketFallback`).
    private var wsRelay: WSRelayClient?
    /// Configuration to restore when the relays never come up (direct UDP endpoint).
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

        // Chuỗi transport, đi một chiều và không quay lại: relay TCP → relay WS → UDP
        // trực tiếp. Mỗi bước chỉ được thử khi bước trước vẫn chưa kết nối được.
        //
        // WireGuard-over-TCP relay (same transport the Android client uses): point the
        // peer at a local UDP listener and let the relay carry the datagrams over TCP
        // to the exit node. Measured on a network where the raw-UDP handshake never
        // completed: the client kept re-sending handshakes every 5s while the server's
        // answers never got through. If the relay cannot be reached we try the
        // WebSocket relay and then direct UDP, so nothing is lost on networks where
        // UDP is fine.
        let directConfiguration = tunnelConfig
        if let relayHost = config.relayHost, let relayPorts = config.relayPorts,
           !tunnelConfig.peers.isEmpty {
            if let localPort = startRelay(host: relayHost, ports: relayPorts) {
                tunnelConfig = configuration(tunnelConfig, pointingAt: localPort)
                log.info("relay: WireGuard endpoint -> 127.0.0.1:\(localPort.rawValue) (relay \(relayHost):\(relayPorts.first ?? 0))")
                RelayDiagnostics.shared.log("relay: WireGuard endpoint -> 127.0.0.1:\(localPort.rawValue)")
                scheduleWebSocketFallback(direct: directConfiguration)
            } else if let localPort = startWebSocketRelay() {
                // Bước 1 không dựng nổi listener (bind lỗi) thì vào chuỗi ở bước 2 luôn:
                // đường WS không phụ thuộc IP node nên nó vẫn là đường sống khi bị chặn IP,
                // bỏ qua nó chỉ vì relay TCP không bind được là mất đúng đường dự phòng.
                tunnelConfig = configuration(tunnelConfig, pointingAt: localPort)
                RelayDiagnostics.shared.log("ws-relay: WireGuard endpoint -> 127.0.0.1:\(localPort.rawValue) (TCP relay did not start)")
                scheduleDirectFallback(direct: directConfiguration)
            } else {
                RelayDiagnostics.shared.log("relay: no relay transport could start — using direct UDP")
            }
        }

        // Sau khi tunnel chạy, báo cho coordinator biết node này có tới được không:
        // node bị GFW chặn thì app phải tự nói, server tự kiểm tra không thấy được.
        // Báo sau khi chuỗi transport đã chọn xong (2 mốc grace + 4s dự phòng) và đọc
        // đúng transport đang chạy — nếu không, node tới được qua WS vẫn bị báo là không
        // tới được, và coordinator lại xếp nó xuống dưới.
        let reportedNodeId = config.nodeId
        DispatchQueue.global().asyncAfter(deadline: .now() + transportGrace * 2 + 4) { [weak self] in
            guard let self else { return }
            let reachable = self.activeTransportIsConnected
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

    /// Starts the WebSocket relay and returns the local UDP port WireGuard must use.
    ///
    /// Same reasoning as `startRelay`: no reachability probe, the client connects
    /// asynchronously and reconnects on its own, and its local UDP port never changes
    /// across those reconnects.
    private func startWebSocketRelay() -> NWEndpoint.Port? {
        let client = WSRelayClient(log: log)
        do {
            let localPort = try client.start()
            wsRelay = client
            log.info("ws-relay: started for \(WSRelayClient.defaultURL.absoluteString)")
            RelayDiagnostics.shared.log("ws-relay: started local udp \(localPort) for \(WSRelayClient.defaultURL.absoluteString)")
            return NWEndpoint.Port(rawValue: localPort)
        } catch {
            log.error("ws-relay: could not start — \(error)")
            RelayDiagnostics.shared.log("ws-relay: could not start — \(error)")
            return nil
        }
    }

    /// Points the first peer at a local relay listener, keeping the rest untouched.
    private func configuration(
        _ config: TunnelConfiguration,
        pointingAt localPort: NWEndpoint.Port
    ) -> TunnelConfiguration {
        var peers = config.peers
        peers[0].endpoint = Endpoint(host: NWEndpoint.Host("127.0.0.1"), port: localPort)
        return TunnelConfiguration(
            name: config.name,
            interface: config.interface,
            peers: peers
        )
    }

    /// Whether the transport WireGuard is currently pointed at is actually carrying
    /// traffic.
    ///
    /// Direct UDP has no link to inspect, so it deliberately counts as REACHABLE, and so
    /// does the moment before any transport exists. That default is intentional, not an
    /// oversight: the coordinator only demotes a node after several "unreachable" reports
    /// in a window, so a false negative would push a healthy node down the picker. Only a
    /// relay that is actually active and never connected reports unreachable.
    private var activeTransportIsConnected: Bool {
        if let relay { return relay.isConnected }
        if let wsRelay { return wsRelay.isConnected }
        return true
    }

    /// Step 2 of the transport chain: when the TCP relay is still not connected after
    /// its grace period, tear it down and carry the tunnel over the WebSocket relay
    /// instead. That path talks to shared Tailscale infrastructure rather than the
    /// node's own IP, so it is the one that survives a network blocking every node IP.
    ///
    /// One-way on purpose, like the rest of the chain: the switch happens at most once
    /// and is never reversed. Each transport keeps its own local UDP port for its whole
    /// lifetime, so WireGuard is reconfigured exactly once per step.
    private func scheduleWebSocketFallback(direct: TunnelConfiguration) {
        guard let relay else { return }
        DispatchQueue.global().asyncAfter(deadline: .now() + transportGrace) { [weak self] in
            guard let self, let adapter = self.adapter else { return }
            guard !relay.isConnected else {
                RelayDiagnostics.shared.log("relay: link is up, keeping the relay transport")
                return
            }
            let grace = Int(transportGrace)
            RelayDiagnostics.shared.log("relay: still not connected after \(grace)s — trying the WebSocket relay")
            self.log.error("relay: not connected after \(grace)s — trying the WebSocket relay")
            relay.stop()
            self.relay = nil

            guard let localPort = self.startWebSocketRelay() else {
                self.applyDirectEndpoint(direct, because: "the WebSocket relay could not start")
                return
            }
            adapter.update(tunnelConfiguration: self.configuration(direct, pointingAt: localPort)) { error in
                if let error {
                    RelayDiagnostics.shared.log("ws-relay: update failed: \(error)")
                } else {
                    RelayDiagnostics.shared.log("ws-relay: WireGuard endpoint -> 127.0.0.1:\(localPort.rawValue)")
                }
            }
            self.scheduleDirectFallback(direct: direct)
        }
    }

    /// Step 3 of the chain: if the WebSocket link is still not up a few seconds after it
    /// was handed to WireGuard, give the node's direct UDP endpoint back. One-way on
    /// purpose — flapping between transports would be worse than either.
    private func scheduleDirectFallback(direct: TunnelConfiguration) {
        directConfiguration = direct
        guard let wsRelay else { return }
        DispatchQueue.global().asyncAfter(deadline: .now() + transportGrace) { [weak self] in
            guard let self else { return }
            guard !wsRelay.isConnected else {
                RelayDiagnostics.shared.log("ws-relay: link is up, keeping the WebSocket transport")
                return
            }
            wsRelay.stop()
            self.wsRelay = nil
            self.applyDirectEndpoint(
                direct,
                because: "WebSocket relay still not connected after \(Int(transportGrace))s"
            )
        }
    }

    /// Last resort of the chain: hand WireGuard the node's own address back.
    private func applyDirectEndpoint(_ direct: TunnelConfiguration, because reason: String) {
        guard let adapter else { return }
        RelayDiagnostics.shared.log("relay: \(reason) — falling back to direct UDP")
        log.error("relay: \(reason) — falling back to direct UDP")
        adapter.update(tunnelConfiguration: direct) { error in
            if let error {
                RelayDiagnostics.shared.log("relay: fallback update failed: \(error)")
            } else {
                RelayDiagnostics.shared.log("relay: WireGuard endpoint restored to the direct node address")
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
        wsRelay?.stop()
        wsRelay = nil
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
