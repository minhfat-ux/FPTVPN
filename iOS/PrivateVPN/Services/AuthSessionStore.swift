import Foundation
import Security

/// Persists the coordinator app-session token used to request enrollment
/// tokens. This is separate from the one-time join token, which must never be
/// stored long term.
@MainActor
final class AuthSessionStore: ObservableObject {
    private static let service = "com.privatevpn.auth"
    private static let account = "coordinator.session"

    @Published private(set) var session: CoordinatorAuthSession?
    @Published var lastError: String?

    var accessToken: String? {
        session?.access_token
    }

    var isSignedIn: Bool {
        accessToken?.isEmpty == false
    }

    init() {
        session = Self.load()
    }

    func save(_ session: CoordinatorAuthSession) {
        do {
            let data = try JSONEncoder().encode(session)
            try Self.saveData(data)
            self.session = session
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    func signOut() {
        Self.delete()
        session = nil
    }

    private static func load() -> CoordinatorAuthSession? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let session = try? JSONDecoder().decode(CoordinatorAuthSession.self, from: data) else {
            return nil
        }
        return session
    }

    private static func saveData(_ data: Data) throws {
        let query = baseQuery()
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        var status = SecItemAdd(attributes as CFDictionary, nil)
        if status != errSecSuccess {
            // Cùng lý do như `KeychainStore.save`: trên macOS item cũ có thể nằm ở kho legacy hoặc
            // được ghi bằng access group khác ⇒ query đầy đủ không khớp khi xoá, rồi add đụng chỉ mục
            // duy nhất (`CSSMERR_DL_INVALID_UNIQUE_INDEX_DATA`) ⇒ phiên đăng nhập không lưu được.
            let relaxed: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            var relaxedDataProtection = relaxed
            #if os(macOS)
            relaxedDataProtection[kSecUseDataProtectionKeychain as String] = true
            #endif
            SecItemDelete(relaxed as CFDictionary)
            SecItemDelete(relaxedDataProtection as CFDictionary)
            status = SecItemAdd(attributes as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            throw AuthSessionError.keychainStatus(status)
        }
    }

    private static func delete() {
        SecItemDelete(baseQuery() as CFDictionary)
    }

    private static func baseQuery() -> [String: Any] {
        // Không set `kSecAttrAccessGroup`: phiên đăng nhập nằm trong keychain RIÊNG của app.
        // Nhóm keychain dùng chung không bao giờ được profile Ad Hoc cấp ⇒ SecItemAdd trả
        // errSecMissingEntitlement (-34018) ⇒ đăng nhập xong app vẫn coi như chưa đăng nhập
        // (sự cố 22/09/2026). Xem thêm `KeychainStore.baseQuery`.
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    enum AuthSessionError: LocalizedError {
        case keychainStatus(OSStatus)

        var errorDescription: String? {
            switch self {
            case .keychainStatus(let status):
                return "Auth session keychain operation failed with status \(status)."
            }
        }
    }
}
