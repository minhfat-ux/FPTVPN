import Foundation
import Security

/// Minimal WireGuard keypair store for macOS, persisted in the Keychain.
/// Returns plain text keys (macOS wg-quick uses text config files).
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
        let priv = genKey()
        let pub = derivePublic(priv)
        let pair = KeyPair(privateKey: priv, publicKey: pub)
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

    private static func genKey() -> String {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/wg")
        process.arguments = ["genkey"]
        process.standardOutput = pipe
        try? process.run()
        process.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private static func derivePublic(_ priv: String) -> String {
        let process = Process()
        let inPipe = Pipe()
        let outPipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-c", "echo \(priv) | /opt/homebrew/bin/wg pubkey"]
        process.standardInput = inPipe
        process.standardOutput = outPipe
        try? process.run()
        inPipe.fileHandleForWriting.write(Data(priv.utf8))
        inPipe.fileHandleForWriting.closeFile()
        process.waitUntilExit()
        let data = outPipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}
