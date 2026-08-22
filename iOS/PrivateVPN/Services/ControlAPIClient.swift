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

struct NodesResponse: Equatable, Codable {
    var nodes: [ExitNode]
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

        var errorDescription: String? {
            switch self {
            case .badResponse:
                return "The coordinator returned an invalid response."
            case .server(let message):
                return message
            case .transport(let endpoint, let error):
                return "Could not reach the coordinator while requesting \(endpoint): \(error.localizedDescription)"
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
        endpoint: String
    ) async throws -> CoordinatorRegisterResponse {
        let url = baseURL.appendingPathComponent("v1/peers/register")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode([
            "name": name,
            "platform": platform,
            "wireguard_public_key": wireguardPublicKey,
            "endpoint": endpoint,
            "join_token": joinToken,
        ])

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

    /// Requests a fresh one-time join token from the coordinator. The server may
    /// require an admin token (Bearer header); pass it if configured.
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

    private struct TokenResponse: Decodable {
        let token: String
    }

    private struct ErrorBody: Decodable {
        let error: String?
        let message: String?
    }
}
