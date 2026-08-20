import Foundation

/// Stable, per-installation device identity (a UUID) stored in the Keychain.
///
/// This is the `device_id` reported to the control plane on registration and is
/// deliberately separate from:
///  - the WireGuard keypair (`KeychainStore`), so device identity survives key rotation;
///  - any user/auth identity (FR-AUTH-001 AC-001), so a device exists before sign-in.
///
/// It is persisted with the same `com.privatevpn.app.keys` service as the
/// WireGuard keys, under the same `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
/// protection: stable across launches, never backed up, never migrated to
/// another device.
struct DeviceIdentity {
    static let account = "device.identity"

    /// Returns the stable device UUID, creating and persisting it on first use.
    static func deviceID() throws -> UUID {
        if let existing = try load() {
            return existing
        }
        let id = UUID()
        try KeychainStore.save(Data(id.uuidString.utf8), for: account)
        return id
    }

    /// Loads the persisted device UUID, or nil when the device has no identity yet.
    static func load() throws -> UUID? {
        guard let data = try KeychainStore.loadData(for: account) else {
            return nil
        }
        guard let string = String(data: data, encoding: .utf8),
              let uuid = UUID(uuidString: string) else {
            throw KeychainStore.KeychainError.invalidStoredData
        }
        return uuid
    }
}
