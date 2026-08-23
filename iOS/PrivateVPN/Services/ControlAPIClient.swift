import Foundation

/// A peer known to the PrivateVPN coordinator (mesh). The app connects to the
/// chosen exit node using this info.
struct CoordinatorPeer: Equatable, Codable, Identifiable {
    var peer_id: String
    var name: String
    var overlay_ip: String
    var wireguard_public_key: String
    var endpoint: String
    var allowed_ips: [String]

    var id: String { peer_id }
}

/// Response from `POST /v1/peers/register`.
struct CoordinatorRegisterResponse: Equatable, Codable {
    var peer_id: String
    var overlay_ip: String
    var network: String
    var peer_credential: String
    var peers: [CoordinatorPeer]
}

/// An exit node advertised by the coordinator (Tailscale-style). The app
/// presents these in the location picker and connects to the selected one.
struct ExitNode: Equatable, Codable, Identifiable {
    var id: String
    var name: String
    var country: String
    var city: String
    var endpoint: String
    var public_key: String
}

extension ExitNode {
    /// Fallback exit nodes used when the coordinator is unreachable (e.g. on
    /// censored networks where the control plane domain/IP is blocked). Mirrors
    /// the live production `exit_nodes` table — keep in sync with node-store.
    static let builtInFallback: [ExitNode] = [
        ExitNode(id: "node-1", name: "vietnam-1", country: "VN", city: "Hanoi",
                 endpoint: "103.173.155.50:443",
                 public_key: "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8="),
        ExitNode(id: "vietnam-2", name: "Vietnam 2", country: "VN", city: "Hanoi",
                 endpoint: "103.6.234.233:443",
                 public_key: "OJPfJLblLP2KCQkPdqI1B7WHJT/U4BlzSxUTwh6vZ2c=")
    ]
}

/// Persists the last successfully fetched node list so the picker still shows
/// servers when the coordinator is temporarily unreachable.
enum ExitNodeCache {
    private static let key = "cached.exitNodes.v1"

    static func load() -> [ExitNode]? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(NodesResponse.self, from: data).nodes
    }

    static func save(_ nodes: [ExitNode]) {
        guard let data = try? JSONEncoder().encode(NodesResponse(nodes: nodes)) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}

/// Last successful tunnel provisioning (overlay IP + exit node). Lets the app
/// reconnect without the coordinator when it is temporarily unreachable (e.g.
/// hotel captive portal or censored network) — the WireGuard peer still exists
/// on the node's wg0, so the cached config remains valid.
struct CachedTunnelConfig: Equatable, Codable {
    var overlayIP: String
    var node: ExitNode
    var savedAt: Date
}

enum TunnelConfigCache {
    private static let key = "cached.tunnelConfig.v1"

    static func load() -> CachedTunnelConfig? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(CachedTunnelConfig.self, from: data)
    }

    static func save(overlayIP: String, node: ExitNode) {
        let config = CachedTunnelConfig(overlayIP: overlayIP, node: node, savedAt: Date())
        guard let data = try? JSONEncoder().encode(config) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}

struct NodesResponse: Equatable, Codable {
    var nodes: [ExitNode]
}

/// Authenticated app session issued by the coordinator after user login.
struct CoordinatorAuthSession: Equatable, Codable {
    var access_token: String
    var token_type: String?
    var expires_at: String?
    var user: CoordinatorUser
}

struct CoordinatorUser: Equatable, Codable {
    var id: String
    var email: String?
    var apple_user_id: String?
    var subscription_status: CoordinatorSubscriptionStatus?
}

struct CoordinatorSubscriptionStatus: Equatable, Codable {
    var is_active: Bool
    var product_id: String?
    var expires_at: String?
}

/// App version info from the coordinator (force-update gate). Defined here so the
/// Packet Tunnel extension target (which compiles ControlAPIClient but not the
/// app-only AppVersionService) also has the type.
struct AppVersionInfo: Equatable, Codable, Identifiable {
    var platform: String?
    var minimum_version: String
    var latest_version: String
    var store_url: String
    var id: String { "\(minimum_version)-\(latest_version)" }
}

/// Talks to the PrivateVPN coordinator (mesh control plane) to register this
/// device and learn the exit node it should connect to.
struct ControlAPIClient {
    var baseURL: URL
    /// The one-time join token used to register this device.
    var joinToken: String

    private let session: URLSession

    init(baseURL: URL, joinToken: String, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.joinToken = joinToken
        self.session = session
    }

    enum ClientError: LocalizedError {
        case badResponse
        case server(String)
        case transport(endpoint: String, Error)
        case missingSession

        var errorDescription: String? {
            switch self {
            case .badResponse:
                return "The coordinator returned an invalid response."
            case .server(let message):
                return message
            case .transport(let endpoint, let error):
                return "Could not reach the coordinator while requesting \(endpoint): \(error.localizedDescription)"
            case .missingSession:
                return "Please sign in before connecting."
            }
        }
    }

    /// Registers this device with the coordinator.
    /// - `wireguardPublicKey`: the device's WireGuard public key.
    /// - `endpoint`: the device's own WireGuard endpoint (host:port). The iOS
    ///   device is outbound-only, so a placeholder is acceptable.
    func register(
        name: String,
        platform: String,
        wireguardPublicKey: String,
        endpoint: String,
        accessToken: String? = nil,
        exitNodeId: String? = nil
    ) async throws -> CoordinatorRegisterResponse {
        let url = baseURL.appendingPathComponent("v1/peers/register")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let accessToken, !accessToken.isEmpty {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        var body: [String: String?] = [
            "name": name,
            "platform": platform,
            "wireguard_public_key": wireguardPublicKey,
            "endpoint": endpoint,
            "join_token": joinToken,
            "exit_node_id": exitNodeId,
        ]
        request.httpBody = try JSONEncoder().encode(body.compactMapValues { $0 })

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(endpoint: "registration", error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.badResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.message
                ?? "HTTP \(http.statusCode)"
            throw ClientError.server(message)
        }
        return try JSONDecoder().decode(CoordinatorRegisterResponse.self, from: data)
    }

    /// Sends a heartbeat to keep this peer marked online.
    func heartbeat(peerId: String, credential: String) async throws {
        let url = baseURL.appendingPathComponent("v1/peers/heartbeat")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode([
            "peer_id": peerId,
            "credential": credential,
        ])
        _ = try await session.data(for: request)
    }

    /// Fetches the list of available exit nodes from the coordinator.
    func fetchNodes() async throws -> [ExitNode] {
        let url = baseURL.appendingPathComponent("v1/nodes")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        // Short timeout so a blocked/slow control plane (e.g. censored
        // networks) fails fast and the app can fall back to cached nodes
        // instead of hanging on "Loading servers…" forever.
        request.timeoutInterval = 10
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(endpoint: "locations", error)
        }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            return []
        }
        return try JSONDecoder().decode(NodesResponse.self, from: data).nodes
    }

    /// Fetches the required/latest app version (force-update gate).
    func fetchAppVersion() async throws -> AppVersionInfo {
        let url = baseURL.appendingPathComponent("v1/app-version")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(endpoint: "app version", error)
        }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ClientError.badResponse
        }
        return try JSONDecoder().decode(AppVersionInfo.self, from: data)
    }

    /// Deletes the signed-in user's account (Apple 5.1.1(v)): user, devices, sessions.
    func deleteAccount(accessToken: String) async throws {
        let url = baseURL.appendingPathComponent("v1/account")
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(endpoint: "account deletion", error)
        }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ClientError.badResponse
        }
    }

    /// Requests a fresh one-time join token from the coordinator. The server may
    /// require an admin token (Bearer header); pass it if configured.
    /// App runtime code must not use this public/dev bootstrap in production;
    /// use `fetchEnrollmentToken(accessToken:)` instead.
    func fetchJoinToken(adminToken: String? = nil) async throws -> String {
        let url = baseURL.appendingPathComponent("v1/tokens")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if let adminToken {
            request.setValue("Bearer \(adminToken)", forHTTPHeaderField: "Authorization")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(endpoint: "token", error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.badResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw ClientError.server("HTTP \(http.statusCode)")
        }
        let body = try JSONDecoder().decode(TokenResponse.self, from: data)
        return body.token
    }

    /// Requests a one-time enrollment token bound to the signed-in user and
    /// active subscription/entitlement.
    func fetchEnrollmentToken(accessToken: String) async throws -> String {
        guard !accessToken.isEmpty else { throw ClientError.missingSession }
        let url = baseURL.appendingPathComponent("v1/enrollment-tokens")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(endpoint: "enrollment token", error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.badResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.message
                ?? (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
                ?? "HTTP \(http.statusCode)"
            throw ClientError.server(message)
        }
        let body = try JSONDecoder().decode(TokenResponse.self, from: data)
        return body.token
    }

    /// Email-code login fallback for regions where third-party SSO is blocked.
    func startEmailLogin(email: String) async throws -> String? {
        let url = baseURL.appendingPathComponent("v1/auth/email/start")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email])
        let data = try await sendEmpty(request, endpoint: "email login")
        return (try? JSONDecoder().decode(EmailLoginStartResponse.self, from: data))?.debug_code
    }

    func verifyEmailLogin(email: String, code: String) async throws -> CoordinatorAuthSession {
        let url = baseURL.appendingPathComponent("v1/auth/email/verify")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email, "code": code])
        return try await send(request, endpoint: "email verification")
    }

    func signInWithApple(identityToken: String, authorizationCode: String?) async throws -> CoordinatorAuthSession {
        let url = baseURL.appendingPathComponent("v1/auth/apple")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode([
            "identity_token": identityToken,
            "authorization_code": authorizationCode,
        ])
        return try await send(request, endpoint: "apple login")
    }

    @discardableResult
    private func sendEmpty(_ request: URLRequest, endpoint: String) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(endpoint: endpoint, error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.badResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.message
                ?? (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
                ?? "HTTP \(http.statusCode)"
            throw ClientError.server(message)
        }
        return data
    }

    private func send<T: Decodable>(_ request: URLRequest, endpoint: String) async throws -> T {
        let data = try await sendEmpty(request, endpoint: endpoint)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private struct TokenResponse: Decodable {
        let token: String
    }

    private struct EmailLoginStartResponse: Decodable {
        let debug_code: String?
    }

    private struct ErrorBody: Decodable {
        let error: String?
        let message: String?
    }
}
