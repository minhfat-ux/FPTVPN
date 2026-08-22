import Foundation
import Security
import WireGuardKit

/// WireGuard keypair store for macOS, persisted in the Keychain.
/// Keys are generated on-device with WireGuardKit (no external `wg` binary).
enum WireGuardKeychain {
    private static let service = "com.privatevpn.mac.keys"
    private static let privateAccount = "wireguard.private"

    struct KeyPair {
        let privateKey: String
        let publicKey: String
    }

    static func loadOrCreatePrivateKey() -> KeyPair {
        if let existing = load() {
            return existing
        }
        let key = PrivateKey()
        let pair = KeyPair(privateKey: key.base64Key, publicKey: key.publicKey.base64Key)
        save(pair)
        return pair
    }

    private static func load() -> KeyPair? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: privateAccount,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data,
              let priv = String(data: data, encoding: .utf8), !priv.isEmpty else {
            return nil
        }
        return KeyPair(privateKey: priv, publicKey: derivePublic(priv))
    }

    private static func save(_ pair: KeyPair) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: privateAccount,
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = Data(pair.privateKey.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(attributes as CFDictionary, nil)
    }

    private static func derivePublic(_ priv: String) -> String {
        PrivateKey(base64Key: priv)?.publicKey.base64Key ?? ""
    }
}
