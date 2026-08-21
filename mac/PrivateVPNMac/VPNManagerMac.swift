import Foundation

/// macOS VPN manager: registers with the coordinator and drives `wg-quick`
/// to bring the tunnel up on this Mac. Reuses the same coordinator client as iOS.
@MainActor
final class VPNManagerMac: ObservableObject {
    @Published private(set) var state: String = "Disconnected"
    @Published var lastError: String?
    @Published var joinToken: String = ""
    @Published var coordinatorURL: String = "http://103.173.155.50:7777"
    @Published var devicePublicKey: String?

    static let exitEndpoint = "103.173.155.50:443"
    static let exitPublicKey = "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8="

    private let stateDir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".privatevpn")

    init() {
        refreshPublicKey()
    }

    func refreshPublicKey() {
        let key = WireGuardKeychain.loadOrCreatePrivateKey()
        devicePublicKey = key.publicKey
    }

    private static func randomSuffix() -> String {
        String(UUID().uuidString.prefix(6).lowercased())
    }

    /// Prepends `http://` when the user omits a scheme (common when pasting a
    /// bare host:port), then parses.
    private func normalizedURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withScheme: String
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            withScheme = trimmed
        } else {
            withScheme = "http://" + trimmed
        }
        return URL(string: withScheme)
    }

    func connect() async {
        do {
            guard let baseURL = normalizedURL(coordinatorURL) else {
                throw MacError.invalidURL(coordinatorURL)
            }
            let privateKey = WireGuardKeychain.loadOrCreatePrivateKey()

            // Auto-provision a join token if the user left the field empty.
            if joinToken.isEmpty {
                NSLog("MacVPN: fetching join token from \(coordinatorURL)")
                let bootstrap = ControlAPIClient(baseURL: baseURL, joinToken: "")
                joinToken = try await bootstrap.fetchJoinToken()
            }

            let client = ControlAPIClient(baseURL: baseURL, joinToken: joinToken)
            let response = try await client.register(
                name: "mac-\(Self.randomSuffix())",
                platform: "macos",
                wireguardPublicKey: privateKey.publicKey,
                endpoint: "0.0.0.0:51820"
            )
            let overlayIP = response.overlay_ip
            NSLog("MacVPN: registered, overlay=\(overlayIP)")
            let config = Self.buildConfig(privateKey: privateKey.privateKey,
                                          overlayIP: overlayIP)
            try writeConfig(config)
            state = "Connecting…"
            try Self.runWireGuardUp(configPath: stateDir.appendingPathComponent("privatevpn0.conf").path)
            state = "Connected (\(overlayIP))"
            lastError = nil
        } catch {
            state = "Failed"
            lastError = error.localizedDescription
            NSLog("MacVPN: connect failed: \(error.localizedDescription)")
        }
    }

    func disconnect() {
        let path = stateDir.appendingPathComponent("privatevpn0.conf").path
        Self.runWireGuardDown(configPath: path)
        state = "Disconnected"
    }

    // MARK: - Config

    private static func buildConfig(privateKey: String, overlayIP: String) -> String {
        """
        [Interface]
        PrivateKey = \(privateKey)
        Address = \(overlayIP)/24
        DNS = 1.1.1.1

        [Peer]
        PublicKey = \(exitPublicKey)
        Endpoint = \(exitEndpoint)
        AllowedIPs = 0.0.0.0/0
        PersistentKeepalive = 25
        """
    }

    private func writeConfig(_ content: String) throws {
        try FileManager.default.createDirectory(at: stateDir, withIntermediateDirectories: true)
        try content.write(to: stateDir.appendingPathComponent("privatevpn0.conf"), atomically: true, encoding: .utf8)
    }

    // MARK: - wg-quick via admin

    private static func runWireGuardUp(configPath: String) throws {
        // Run wg-quick with admin privileges. `wg-quick up <conf>`.
        let script = "osascript -e 'do shell script \"wg-quick up \(configPath)\" with administrator privileges'"
        try run(script)
    }

    private static func runWireGuardDown(configPath: String) {
        let script = "osascript -e 'do shell script \"wg-quick down \(configPath)\" with administrator privileges'"
        _ = try? run(script)
    }

    private static func run(_ command: String) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-c", command]
        try process.run()
        process.waitUntilExit()
        if process.terminationStatus != 0 {
            throw MacError.commandFailed(process.terminationStatus)
        }
    }

    enum MacError: LocalizedError {
        case missingConfig
        case missingToken
        case invalidURL(String)
        case commandFailed(Int32)

        var errorDescription: String? {
            switch self {
            case .missingConfig:
                return "Enter a coordinator URL and join token first."
            case .missingToken:
                return "Enter a join token."
            case .invalidURL(let url):
                return "Invalid coordinator URL: \(url)"
            case .commandFailed(let code):
                return "wg-quick failed with exit code \(code)."
            }
        }
    }
}
