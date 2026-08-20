import Foundation
import Security
import WireGuardKit

/// Abstraction over the key-value Keychain storage used by `KeychainStore`.
/// Lets unit tests substitute an in-memory implementation (the Keychain is not
/// reliably available to simulator test bundles).
protocol KeychainBackend {
    /// Persists `data` for `account`, replacing any previous value.
    func save(_ data: Data, for account: String) throws

    /// Returns the persisted data for `account`, or nil when absent.
    func loadData(for account: String) throws -> Data?
}

/// Production backend backed by the iOS Keychain (`SecItem` generic passwords).
/// Values are stored with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`:
/// readable only on this device after first unlock, never migrated to other
/// devices and not included in iCloud Keychain sync.
struct SecurityKeychainBackend: KeychainBackend {
    func save(_ data: Data, for account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: KeychainStore.service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainStore.KeychainError.unexpectedStatus(status)
        }
    }

    func loadData(for account: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: KeychainStore.service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            return result as? Data
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainStore.KeychainError.unexpectedStatus(status)
        }
    }
}

/// Stores and generates the WireGuard device keypair in the Keychain.
/// The private key never leaves the device: it is never logged and never
/// transmitted over the network (only the public key is sent to the control
/// plane during registration).
final class KeychainStore {
    enum KeychainError: Error, LocalizedError {
        case keyGenerationFailed
        case unexpectedStatus(OSStatus)
        case notFound
        case invalidStoredData

        var errorDescription: String? {
            switch self {
            case .keyGenerationFailed:
                return "Failed to generate WireGuard keypair."
            case .unexpectedStatus(let status):
                return "Keychain operation failed with status \(status)."
            case .notFound:
                return "No WireGuard private key stored."
            case .invalidStoredData:
                return "Stored keychain value is corrupt."
            }
        }
    }

    /// Keychain service shared by the WireGuard keypair and the device identity.
    static let service = "com.privatevpn.app.keys"
    private static let privateKeyAccount = "wireguard.private-key"
    private static let publicKeyAccount = "wireguard.public-key"

    /// Storage backend. Production uses the real Keychain; unit tests swap in
    /// an in-memory implementation. Marked unsafe because tests deliberately
    /// mutate it before the test bundle touches any keychain-backed code path.
    nonisolated(unsafe) static var backend: KeychainBackend = SecurityKeychainBackend()

    /// Returns the stored private key, generating and persisting a new keypair if none exists.
    static func obtainOrCreatePrivateKey() throws -> PrivateKey {
        if let existing = try loadPrivateKey() {
            return existing
        }
        let key = PrivateKey()
        let publicKey = key.publicKey
        try save(key.rawValue, for: privateKeyAccount)
        try save(publicKey.rawValue, for: publicKeyAccount)
        return key
    }

    /// Loads the stored private key, or nil if none is present.
    static func loadPrivateKey() throws -> PrivateKey? {
        guard let data = try loadData(for: privateKeyAccount) else {
            return nil
        }
        guard let key = PrivateKey(rawValue: data) else {
            throw KeychainError.keyGenerationFailed
        }
        return key
    }

    /// Loads the stored public key, or nil if none is present.
    static func loadPublicKey() throws -> PublicKey? {
        guard let data = try loadData(for: publicKeyAccount) else {
            return nil
        }
        return PublicKey(rawValue: data)
    }

    // MARK: - Keychain primitives
    // Internal (not private) so `DeviceIdentity` shares the same service and
    // backend — the device UUID lives alongside the WireGuard keys.

    static func save(_ data: Data, for account: String) throws {
        try backend.save(data, for: account)
    }

    static func loadData(for account: String) throws -> Data? {
        try backend.loadData(for: account)
    }
}
