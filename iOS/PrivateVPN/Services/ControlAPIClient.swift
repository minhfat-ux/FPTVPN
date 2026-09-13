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

/// A device owned by the signed-in user (user-scoped device management,
/// FR-REVOKE-001/002). `public_key` lets the app mark the current device.
struct CoordinatorDevice: Equatable, Codable, Identifiable {
    var device_id: String
    var name: String?
    var platform: String?
    var status: String?
    var created_at: String?
    var assigned_ip: String?
    var public_key: String?

    var id: String { device_id }

    var isActive: Bool { status == "active" }
}

struct DevicesResponse: Equatable, Codable {
    var count: Int
    var devices: [CoordinatorDevice]
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

/// Hosts the coordinator is reachable through. Defined here because this file is a
/// source of both the app and the packet-tunnel extension, so `NodeHealthReporter`
/// uses the very same fallback list.
enum ControlAPIHosts {
    /// Fallback coordinator host: a fixed Tailscale Funnel URL that rides shared
    /// infrastructure instead of a node's IP.
    ///
    /// Why this exists: the GFW blocks by IP, so once every node IP is blocked the
    /// app cannot call the API at all even though the nodes are healthy. Blocking
    /// this URL means blocking a range many unrelated services use. TLS still
    /// validates the real hostname, so this only adds a route — it cannot be used
    /// to redirect traffic.
    static let fallbackBaseURLs: [URL] = [
        URL(string: "https://fcnvpn.tail303be3.ts.net")!,
    ]

    /// Sends `request` to its own host and, after a transport failure (no response at all:
    /// blocked IP, poisoned DNS, no route), retries the very same request against each
    /// fallback host once.
    ///
    /// An HTTP status is an answer, not a blocked route, so it is never retried — retrying
    /// would repeat the side effect of a POST. The request is preserved as-is (method,
    /// headers, body) and only scheme/host/port are swapped, so the path and query string
    /// survive. Attempts stay bounded: the caller's host once plus each fallback host once.
    ///
    /// Shared by `ControlAPIClient` and `NodeHealthReporter`: the health report is sent
    /// from inside the censored network, so it is exactly the request that must still get
    /// through when the node's host is blocked.
    static func sendWithFallback(
        _ request: URLRequest,
        session: URLSession
    ) async throws -> (Data, URLResponse) {
        var lastError: Error?
        do {
            return try await session.data(for: request)
        } catch {
            lastError = error
        }
        for base in fallbackBaseURLs {
            // Never hit the same host twice: the caller may already point at a fallback.
            guard base.host != request.url?.host else { continue }
            do {
                return try await session.data(for: request.rewritten(to: base))
            } catch {
                lastError = error
            }
        }
        throw lastError ?? URLError(.cannotConnectToHost)
    }
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
        /// The account already uses the maximum number of active devices. Carries
        /// the coordinator's message and the device list so the UI can offer
        /// "log out an old device" instead of a vague rejection.
        case deviceLimit(message: String, devices: [CoordinatorDevice])

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
            case .deviceLimit(let message, _):
                return message
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

        let (data, response) = try await sendWithFallback(request, endpoint: "registration")
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.badResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            // Device limit: keep the coordinator's message AND the device list so
            // the app can show which devices to log out.
            if let limit = try? JSONDecoder().decode(DeviceLimitBody.self, from: data),
               limit.error == "device_limit_reached" {
                throw ClientError.deviceLimit(
                    message: limit.message ?? "Device limit reached. Log out an old device to continue.",
                    devices: limit.devices ?? []
                )
            }
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
        _ = try await sendWithFallback(request, endpoint: "heartbeat")
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
        let (data, response) = try await sendWithFallback(request, endpoint: "locations")
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
        let (data, response) = try await sendWithFallback(request, endpoint: "app version")
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
        let (_, response) = try await sendWithFallback(request, endpoint: "account deletion")
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ClientError.badResponse
        }
    }

    /// Lists the signed-in user's devices (active first), each with status,
    /// assigned overlay IP and public key (FR-REVOKE-001).
    func fetchMyDevices(accessToken: String) async throws -> [CoordinatorDevice] {
        guard !accessToken.isEmpty else { throw ClientError.missingSession }
        let url = baseURL.appendingPathComponent("v1/devices")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 10
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let data = try await sendEmpty(request, endpoint: "devices")
        return try JSONDecoder().decode(DevicesResponse.self, from: data).devices
    }

    /// Revokes one of the signed-in user's devices (removes its wg peer, so it
    /// can no longer connect — AC-011/AC-012).
    func revokeDevice(id: String, accessToken: String) async throws {
        guard !accessToken.isEmpty else { throw ClientError.missingSession }
        let url = baseURL.appendingPathComponent("v1/devices/\(id)")
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.timeoutInterval = 10
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        _ = try await sendEmpty(request, endpoint: "device revocation")
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
        let (data, response) = try await sendWithFallback(request, endpoint: "token")
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
        let (data, response) = try await sendWithFallback(request, endpoint: "enrollment token")
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

    /// Sends `request`, retrying it against the fallback hosts when the primary host
    /// cannot be reached at all, and reports the endpoint-scoped error the UI knows.
    private func sendWithFallback(
        _ request: URLRequest,
        endpoint: String
    ) async throws -> (Data, URLResponse) {
        do {
            return try await ControlAPIHosts.sendWithFallback(request, session: session)
        } catch {
            throw ClientError.transport(endpoint: endpoint, error)
        }
    }

    /// The single funnel every request goes through (hence not private: the unit tests
    /// drive it directly with a hand-built request).
    @discardableResult
    func sendEmpty(_ request: URLRequest, endpoint: String) async throws -> Data {
        let (data, response) = try await sendWithFallback(request, endpoint: endpoint)
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

    /// 403 body from the coordinator when the account is at the device cap.
    private struct DeviceLimitBody: Decodable {
        let error: String?
        let message: String?
        let devices: [CoordinatorDevice]?
        let max_devices: Int?
    }
}

/// Not private: `NodeHealthReporter` retries its report through the same fallback hosts.
extension URLRequest {
    /// The same request aimed at another base host: scheme/host/port are replaced and
    /// everything else — path, query string, method, headers and body — is carried
    /// over untouched.
    func rewritten(to base: URL) -> URLRequest {        guard let url,
              var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return self
        }
        components.scheme = base.scheme
        components.host = base.host
        components.port = base.port
        var copy = self
        copy.url = components.url
        return copy
    }
}
