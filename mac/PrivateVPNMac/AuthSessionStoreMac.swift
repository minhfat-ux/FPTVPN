import Foundation
import Security

/// Persists the coordinator app-session token used to request enrollment
/// tokens. This is separate from the one-time join token, which must never be
/// stored long term.
@MainActor
final class AuthSessionStore: ObservableObject {
    private static let service = "com.privatevpn.mac.auth"
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
        // Không nuốt lỗi đọc Keychain: trước đây `load()` trả nil cho MỌI lỗi nên app "quên"
        // phiên mà không có dấu vết nào để chẩn đoán (xem `saveData`).
        do {
            session = try Self.load()
            lastError = nil
        } catch {
            session = nil
            lastError = error.localizedDescription
        }
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

    /// Trả `nil` CHỈ khi thật sự chưa có phiên (`errSecItemNotFound`). Mọi lỗi khác (ACL,
    /// sandbox, item hỏng…) được ném ra để `init()` báo lên `lastError` thay vì im lặng.
    private static func load() throws -> CoordinatorAuthSession? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data,
                  let session = try? JSONDecoder().decode(CoordinatorAuthSession.self, from: data) else {
                return nil
            }
            return session
        case errSecItemNotFound:
            return nil
        default:
            throw AuthSessionError.keychainStatus(status)
        }
    }

    private static func saveData(_ data: Data) throws {
        let query = baseQuery()
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]

        // CẬP NHẬT trước, chỉ THÊM khi chưa có item.
        //
        // Vì sao không `SecItemDelete` rồi `SecItemAdd` như bản cũ: item do một bản build KÝ KHÁC
        // tạo ra thì `SecItemDelete` trả lỗi (ACL của item chỉ cho chữ ký cũ), nhưng bản cũ BỎ QUA
        // kết quả đó rồi gọi `SecItemAdd` trong khi item vẫn còn ⇒ `errSecDuplicateItem (-25299)`
        // ⇒ `save()` ném lỗi nhưng KHÔNG nơi nào hiển thị. Hệ quả thật (23/09/2026): server đã cấp
        // session + premium cho `minhnb2@me.com` mà app Mac vẫn đứng ở màn đăng nhập, không báo gì.
        // Bằng chứng: item Keychain giữ nguyên ngày sửa 14/09 dù verify thành công 3 lần trong ngày.
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw AuthSessionError.keychainStatus(updateStatus)
        }

        var addAttributes = query
        addAttributes.merge(attributes) { _, new in new }
        let addStatus = SecItemAdd(addAttributes as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw AuthSessionError.keychainStatus(addStatus)
        }
    }

    private static func delete() {
        SecItemDelete(baseQuery() as CFDictionary)
    }

    private static func baseQuery() -> [String: Any] {
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
