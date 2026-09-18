# App iOS (SwiftUI) — khung + template

> Đi theo đúng convention đang có trong repo này: `iOS/PrivateVPN/` dùng SwiftUI, theme là
> một `enum` + `static let` trong `Theme.swift`. fBuddy làm tương tự ở thư mục riêng
> `fbuddy-ios/` (đừng nhét vào project PrivateVPN — khác bundle id, khác luồng nghiệp vụ).

## 1. Khung project

```
fbuddy-ios/
├── FBuddy.xcodeproj
└── FBuddy/
    ├── FBuddyApp.swift          # @main, khoá dark, nạp phiên
    ├── Theme/
    │   └── FBTheme.swift        # token — chép từ THEME.md mục 7
    ├── Net/
    │   ├── APIClient.swift      # request JSON + Bearer + lỗi có kiểu
    │   ├── SSEClient.swift      # đọc text/event-stream theo dòng
    │   └── TokenStore.swift     # Keychain
    ├── Features/
    │   ├── Login/LoginView.swift
    │   ├── Chat/ChatView.swift · ChatStore.swift · MessageRow.swift · ComposerView.swift
    │   ├── Conversations/ConversationListView.swift
    │   ├── Credits/CreditsView.swift
    │   └── Topup/TopupView.swift
    └── Assets.xcassets          # AppIcon + brand-mark (chép file, KHÔNG hot-link)
```

`Info.plist` cần:

```xml
<key>NSMicrophoneUsageDescription</key><string>Để bạn nói thay vì gõ tin nhắn.</string>
<key>NSSpeechRecognitionUsageDescription</key><string>Để chuyển giọng nói thành chữ.</string>
<key>ITSAppUsesNonExemptEncryption</key><false/>
```
`FBuddyApp.swift` khoá theme để khớp web: `.preferredColorScheme(.dark)`.

## 2. Template: `APIClient.swift`

```swift
import Foundation

struct APIError: Error, LocalizedError {
    let status: Int
    let code: String
    let message: String          // server trả tiếng Việt → hiện thẳng được
    var errorDescription: String? { message }
    var isUnauthorized: Bool { status == 401 }
    var needsCredit: Bool { status == 402 }
}

actor APIClient {
    static let shared = APIClient()
    private let base = URL(string: "https://fbuddy.meetflowai.site/api")!
    private let session = URLSession(configuration: .ephemeral)

    private func request(_ path: String, method: String = "GET", body: Encodable? = nil) throws -> URLRequest {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = TokenStore.shared.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body { req.httpBody = try JSONEncoder().encode(AnyEncodable(body)) }
        return req
    }

    func send<T: Decodable>(_ path: String, method: String = "GET", body: Encodable? = nil) async throws -> T {
        let (data, response) = try await session.data(for: try request(path, method: method, body: body))
        let http = response as? HTTPURLResponse
        guard let http, (200..<300).contains(http.statusCode) else {
            // Lỗi chuẩn của server: { "error": { "code": …, "message": … } }
            let envelope = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data)
            throw APIError(status: http?.statusCode ?? -1,
                           code: envelope?.error.code ?? "unknown",
                           message: envelope?.error.message ?? "Không kết nối được máy chủ.")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

struct APIErrorEnvelope: Decodable { struct Body: Decodable { let code: String; let message: String }; let error: Body }
/// Bọc `Encodable` bất kỳ để không phải viết overload cho từng kiểu body.
struct AnyEncodable: Encodable { private let encodeImpl: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeImpl = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeImpl(encoder) } }
```

## 3. Template: `SSEClient.swift` (phần không được làm sai)

```swift
import Foundation

/// Đọc `text/event-stream` theo dòng. PHẢI buffer theo dòng: một khối `data:` có thể
/// bị cắt giữa hai gói TCP, gom cả response rồi parse là mất tính chạy chữ.
struct SSEEvent { let name: String; let data: Data }

final class SSEClient {
    private var task: URLSessionDataTask?

    func start(path: String, body: [String: Any], onEvent: @escaping (SSEEvent) -> Void,
               onError: @escaping (Error) -> Void, onDone: @escaping () -> Void) {
        var req = URLRequest(url: URL(string: "https://fbuddy.meetflowai.site/api\(path)")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let token = TokenStore.shared.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        Task {
            do {
                let (bytes, response) = try await URLSession.shared.bytes(for: req)
                guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                guard http.statusCode == 200 else {
                    throw APIError(status: http.statusCode, code: "http_\(http.statusCode)",
                                   message: http.statusCode == 402 ? "Bạn đã hết credit." : "Không mở được luồng trả lời.")
                }
                var name = "message"
                var dataLines: [String] = []
                for try await line in bytes.lines {
                    if line.isEmpty {                       // dòng trống = hết một khối
                        if !dataLines.isEmpty {
                            onEvent(SSEEvent(name: name, data: Data(dataLines.joined(separator: "\n").utf8)))
                        }
                        name = "message"; dataLines = []
                    } else if line.hasPrefix("event:") {
                        name = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                    } else if line.hasPrefix("data:") {
                        dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
                    }
                }
                onDone()
            } catch { onError(error) }
        }
        _ = task
    }

    func cancel() { task?.cancel() }   // dừng phải HUỶ request, không chỉ bỏ qua sự kiện
}
```

## 4. Template: `TokenStore.swift` (Keychain)

```swift
import Foundation
import Security

/// Token JWT sống 30 ngày, lưu Keychain — KHÔNG dùng UserDefaults.
final class TokenStore {
    static let shared = TokenStore()
    private let service = "site.meetflowai.fbuddy"
    private let account = "auth-token"

    var token: String? {
        get { read() }
        set { newValue == nil ? delete() : write(newValue!) }
    }

    private func write(_ value: String) {
        delete()
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account,
                                    kSecValueData as String: Data(value.utf8)]
        SecItemAdd(query as CFDictionary, nil)
    }
    private func read() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account,
                                    kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    private func delete() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword,
                       kSecAttrService as String: service,
                       kSecAttrAccount as String: account] as CFDictionary)
    }
}
```

## 5. Template: `ChatStore.swift` (nối `delta` vào bong bóng)

```swift
import SwiftUI

@MainActor
final class ChatStore: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var streaming = ""          // chữ đang chạy
    @Published var status: String?
    @Published var errorText: String?
    @Published var needsCredit = false
    private let sse = SSEClient()

    func send(_ text: String, conversationId: String?, skill: String = "auto") {
        messages.append(.user(text)); streaming = ""; errorText = nil; needsCredit = false
        sse.start(path: "/chat/stream",
                  body: ["content": text, "skill": skill, "conversationId": conversationId as Any,
                         "attachments": [], "toolMode": "auto"]) { [weak self] event in
            guard let self else { return }
            let json = try? JSONSerialization.jsonObject(with: event.data) as? [String: Any]
            switch event.name {
            case "delta":   self.streaming += (json?["text"] as? String) ?? ""
            case "status":  self.status = json?["stage"] as? String
            case "notice":  self.errorText = json?["message"] as? String      // toast nhẹ
            case "artifact": /* thêm thẻ tệp vào messages */ break
            case "done":    self.messages.append(.assistant(self.streaming)); self.streaming = ""; self.status = nil
            case "error":   let code = json?["code"] as? String
                            self.needsCredit = (code == "insufficient_credits")
                            self.errorText = json?["message"] as? String
            default: break
            }
        } onError: { [weak self] error in
            Task { @MainActor in self?.errorText = (error as? APIError)?.message ?? error.localizedDescription }
        } onDone: { }
    }

    func stop() { sse.cancel() }           // server vẫn tính credit tới lúc kết thúc → huỷ thật
}
```

## 6. Chạy & phát hành

```bash
xcodebuild -project fbuddy-ios/FBuddy.xcodeproj -scheme FBuddy \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```
- Bundle id gợi ý: `site.meetflowai.fbuddy` (khác `com.privatevpn.app` của VPNFlow).
- ATS: chỉ dùng HTTPS, không cần ngoại lệ.
- Phát hành: Archive → TestFlight nội bộ trước, kèm ảnh chụp 6.7" và 6.1"; mô tả app phải
  nói rõ là trợ lý AI (Apple soi kỹ nhóm này), và khai báo dùng email để đăng nhập.
- Điền [`templates/STORE-RELEASE.template.md`](templates/STORE-RELEASE.template.md) trước khi nộp.

## 7. Checklist trước khi mở PR

- [ ] Theme lấy từ `FBTheme`, không có màu hard-code trong view (grep `Color(red:` / `Color(hex:` ngoài `Theme/`).
- [ ] Chat chạy chữ dần, dừng được, 402 hiện đúng lời mời nạp.
- [ ] Token nằm Keychain; đăng xuất xoá token **và** gọi `/auth/logout`.
- [ ] Ảnh so sánh với web ở 390px (xem `THEME.md` mục 8).
