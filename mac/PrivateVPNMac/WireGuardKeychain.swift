import Foundation
import OSLog
import Security
import WireGuardKit

/// WireGuard keypair store for macOS, persisted in the **shared** Keychain group.
///
/// Vì sao phải là nhóm shared: tunnel chạy trong process extension riêng, và extension
/// đọc khoá qua `KeychainStore` (nhóm `com.privatevpn.shared`). Bản trước đây ghi khoá
/// vào keychain riêng của app (`com.privatevpn.mac.keys`) nên extension không thấy gì và
/// tunnel chết ngay với "Missing WireGuard private key in shared Keychain" (đo trên máy
/// 14/09, macOS chỉ báo "Connected" rồi không có mạng).
///
/// Vẫn là app-owned API để phần còn lại của app không phải đổi: chỉ phần lưu trữ đổi.
enum WireGuardKeychain {
    struct KeyPair {
        let privateKey: String
        let publicKey: String
    }

    static func loadOrCreatePrivateKey() -> KeyPair {
        if let existing = load() {
            log.notice("dùng lại khoá WireGuard đã có (pub=\(existing.publicKey.prefix(12), privacy: .public)…)")
            return existing
        }
        let key = PrivateKey()
        let pair = KeyPair(privateKey: key.base64Key, publicKey: key.publicKey.base64Key)
        save(pair)
        log.notice("đã TẠO khoá WireGuard mới và lưu keychain (pub=\(pair.publicKey.prefix(12), privacy: .public)…)")
        return pair
    }

    /// Replaces the stored keypair with a brand-new one (device revoked server-side:
    /// the old key can never register again, so come back as a NEW device).
    static func rotate() -> KeyPair {
        try? KeychainStore.rotatePrivateKey()
        return loadOrCreatePrivateKey()
    }

    /// Ghi log thay vì `try?`: nuốt lỗi ở đây là gốc của ca 14/09 — app ghi khoá thất bại im lặng,
    /// extension chỉ báo "Missing WireGuard private key", mất cả buổi mới lần ra bên nào hỏng.
    private static let log = Logger(subsystem: "com.privatevpn.mac", category: "keychain")

    private static func load() -> KeyPair? {
        do {
            guard let data = try KeychainStore.loadData(for: privateKeyAccount),
                  let priv = String(data: data, encoding: .utf8), !priv.isEmpty else {
                return nil
            }
            return KeyPair(privateKey: priv, publicKey: derivePublic(priv))
        } catch {
            log.error("đọc khoá WireGuard thất bại: \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    private static func save(_ pair: KeyPair) {
        do {
            try KeychainStore.save(Data(pair.privateKey.utf8), for: privateKeyAccount)
            try KeychainStore.save(Data(pair.publicKey.utf8), for: publicKeyAccount)
            log.notice("ghi khoá WireGuard vào keychain nhóm shared: OK")
        } catch {
            log.error("GHI khoá WireGuard thất bại: \(String(describing: error), privacy: .public) — extension sẽ báo 'Missing WireGuard private key'")
        }
    }

    private static func derivePublic(_ priv: String) -> String {
        PrivateKey(base64Key: priv)?.publicKey.base64Key ?? ""
    }

    // Cùng tên account như iOS (KeychainStore) để hai nền tảng dùng chung một bố cục.
    private static let privateKeyAccount = "wireguard.private-key"
    private static let publicKeyAccount = "wireguard.public-key"
}
