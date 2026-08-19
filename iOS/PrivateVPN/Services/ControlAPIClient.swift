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
    func register(publicKey: String, deviceName: String) async throws -> RegisterDeviceResponse {
        let url = baseURL.appendingPathComponent("device")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONEncoder().encode([
            "publicKey": publicKey,
            "deviceName": deviceName,
        ])

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

    private struct ErrorBody: Decodable {
        let error: String
    }
}
