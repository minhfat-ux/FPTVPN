import Foundation

/// Configuration returned by the control plane after device registration.
/// Carries everything the client needs to build its WireGuard tunnel config.
struct ProvisionedConfig: Equatable, Codable {
    var serverPublicKey: String
    var endpoint: String
    var address: String
    var dns: [String]
    var allowedIPs: [String]
    var persistentKeepalive: Int?
}

/// A device as known to the control plane.
struct ProvisionedDevice: Equatable, Codable {
    var id: String
    var publicKey: String
    var deviceName: String?
    var assignedIP: String
    var active: Bool
}

struct RegisterDeviceResponse: Equatable, Codable {
    var device: ProvisionedDevice
    var config: ProvisionedConfig
}

/// An exit node advertised by the control plane (Tailscale-style). The app
/// fetches these instead of hardcoding a server list.
struct RemoteNode: Equatable, Codable, Identifiable {
    var id: String
    var name: String
    var country: String
    var city: String
    var endpoint: String?
    var serverPublicKey: String?
}

struct NodesResponse: Equatable, Codable {
    var nodes: [RemoteNode]
}

/// Talks to the PrivateVPN control plane to register a device and obtain its
/// WireGuard configuration (Tailscale-style).
struct ControlAPIClient {
    var baseURL: URL
    var authToken: String?

    private let session: URLSession

    init(baseURL: URL, authToken: String? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.authToken = authToken
        self.session = session
    }

    enum ClientError: LocalizedError {
        case badResponse
        case server(String)
        case transport(Error)

        var errorDescription: String? {
            switch self {
            case .badResponse:
                return "The control plane returned an invalid response."
            case .server(let message):
                return message
            case .transport(let error):
                return "Could not reach the control plane: \(error.localizedDescription)"
            }
        }
    }

    /// Registers (or re-registers) a device by its WireGuard public key.
    /// `deviceId` is the stable on-device UUID from `DeviceIdentity`; `platform`
    /// is the client OS. Both are forward-compatible extras — the control plane
    /// currently keys registration on the public key and ignores unknown fields.
    ///
    /// Deliberately does NOT send a device name: `UIDevice.current.name`
    /// frequently contains the owner's real name (e.g. "Minh's iPhone") and is
    /// not required by the VPN service (NFR-PRIV-001 — privacy review
    /// 2026-08-20 ISSUE #1). The control plane defaults the display name.
    func register(
        publicKey: String,
        deviceId: String? = nil,
        platform: String? = nil
    ) async throws -> RegisterDeviceResponse {
        let url = baseURL.appendingPathComponent("device")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        var body: [String: String] = [
            "publicKey": publicKey,
        ]
        if let deviceId {
            body["deviceId"] = deviceId
        }
        if let platform {
            body["platform"] = platform
        }
        request.httpBody = try JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.badResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
                ?? "HTTP \(http.statusCode)"
            throw ClientError.server(message)
        }
        return try JSONDecoder().decode(RegisterDeviceResponse.self, from: data)
    }

    /// Fetches the list of available exit nodes from the control plane.
    func fetchNodes() async throws -> [RemoteNode] {
        let url = baseURL.appendingPathComponent("nodes")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.badResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw ClientError.server("HTTP \(http.statusCode)")
        }
        return try JSONDecoder().decode(NodesResponse.self, from: data).nodes
    }

    private struct ErrorBody: Decodable {
        let error: String
    }
}
