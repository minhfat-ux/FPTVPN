import NetworkExtension
import os

final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let log = Logger(
        subsystem: "com.privatevpn.app.packet-tunnel",
        category: "tunnel"
    )

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        let config = (protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration
        guard let serverAddress = protocolConfiguration.serverAddress,
              !serverAddress.isEmpty else {
            let error = NSError(
                domain: "com.privatevpn.tunnel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Missing server address"]
            )
            completionHandler(error)
            return
        }

        setTunnelNetworkSettings(makeNetworkSettings()) { error in
            if let error {
                self.log.error("Failed to apply tunnel settings: \(error.localizedDescription)")
                completionHandler(error)
            } else {
                self.log.info("Tunnel settings applied; remote=\(serverAddress)")
                completionHandler(nil)
            }
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        log.info("Stopping tunnel; reason=\(reason.rawValue)")
        completionHandler()
    }

    private func makeNetworkSettings() -> NEPacketTunnelNetworkSettings {
        let config = (protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration
        let remote = (config?["tunnelRemoteAddress"] as? String) ?? "10.80.0.1"
        let local = (config?["tunnelLocalAddress"] as? String) ?? "10.80.0.2"

        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: remote)
        settings.ipv4Settings = NEIPv4Settings(
            addresses: [local],
            subnetMasks: ["255.255.255.0"]
        )
        let dns = NEDNSSettings(servers: ["1.1.1.1"])
        dns.matchDomains = [""]
        settings.dnsSettings = dns
        return settings
    }
}
