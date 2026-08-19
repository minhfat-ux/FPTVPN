import Foundation
import Security
import WireGuardKit

/// Stores and generates the WireGuard device keypair in the Keychain.
/// The private key never leaves the device.
final class KeychainStore {
    enum KeychainError: Error, LocalizedError {
        case keyGenerationFailed
        case unexpectedStatus(OSStatus)
        case notFound

        var errorDescription: String? {
            switch self {
            case .keyGenerationFailed:
                return "Failed to generate WireGuard keypair."
            case .unexpectedStatus(let status):
                return "Keychain operation failed with status \(status)."
            case .notFound:
                return "No WireGuard private key stored."
            }
        }
    }

    private static let service = "com.privatevpn.app.keys"
    private static let privateKeyAccount = "wireguard.private-key"
    private static let publicKeyAccount = "wireguard.public-key"

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

    private static func save(_ data: Data, for account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    private static func loadData(for account: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
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
            throw KeychainError.unexpectedStatus(status)
        }
    }
}
