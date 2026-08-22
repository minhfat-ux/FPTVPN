import Foundation

/// A selectable VPN server location with its WireGuard endpoint.
/// The list is a static seed for testing; it will later be replaced by a
/// control-plane device registry that assigns the client address.
struct VPNLocation: Identifiable, Hashable, Codable {
    let id: UUID
    var name: String
    var country: String
    var city: String
    var endpoint: String   // host
    var port: UInt16
    var publicKey: String      // WireGuard peer public key
    var clientAddress: String  // client tunnel address assigned to this device

    var host: String {
        endpoint.split(separator: ":").first.map(String.init) ?? endpoint
    }

    /// Static list of servers available for testing.
    static let presets: [VPNLocation] = [
        VPNLocation(
            id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            name: "Hanoi Test Node",
            country: "VN",
            city: "Hanoi",
            endpoint: "103.173.155.50",
            port: 443,
            publicKey: "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=",
            clientAddress: "10.77.0.2/32"
        ),
    ]
}
