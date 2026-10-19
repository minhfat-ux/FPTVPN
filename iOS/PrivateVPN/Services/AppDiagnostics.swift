import Foundation

/// Log nhỏ ghi ra `Documents/app.log` trong container của APP (không phải extension).
///
/// Vì sao cần: mọi sự cố "app báo Disconnected" đều nằm ở phía app, mà app **không có log nào**
/// đọc được từ Mac (`os_log` của app trên máy thật cần root để thu). Extension đã có
/// `RelayDiagnostics` ghi ra file từ lâu; app thì chưa — nên ca 25/09/2026 (mỗi phiên iPhone sống
/// 1 phút rồi ngắt, extension không ghi gì) không thể truy nguyên.
///
/// Đọc từ Mac:
///     xcrun devicectl device copy from --device <udid> --domain-type appDataContainer \
///       --domain-identifier com.privatevpn.app --source Documents --destination <dir>
final class AppDiagnostics: @unchecked Sendable {
    static let shared = AppDiagnostics()

    private let queue = DispatchQueue(label: "com.privatevpn.app.app-diagnostics")
    private let maxBytes = 256 * 1024
    private let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MM-dd HH:mm:ss.SSS"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
    private let fileURL: URL?

    private init() {
        if let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
            fileURL = base.appendingPathComponent("app.log")
        } else {
            fileURL = nil
        }
    }

    func log(_ message: String) {
        let line = "\(formatter.string(from: Date())) \(message)\n"
        queue.async { [weak self] in
            guard let self, let url = self.fileURL, let data = line.data(using: .utf8) else { return }
            let manager = FileManager.default
            if let attributes = try? manager.attributesOfItem(atPath: url.path),
               let size = attributes[.size] as? Int, size > self.maxBytes {
                try? manager.removeItem(at: url)
            }
            if let handle = try? FileHandle(forWritingTo: url) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
            } else {
                try? data.write(to: url, options: .atomic)
            }
        }
    }
}

/// Dấu vết TỪNG BƯỚC của `VPNManager.connect()` — để trả lời đúng một câu hỏi:
/// "cú bấm Connect treo ở BƯỚC NÀO".
///
/// Vì sao phải có (ca thật 20/10/2026, build 83): app quay "Connecting" vô hạn mà
/// `Documents/app.log` **không có thêm một dòng nào** sau cú bấm, và container của extension cũng
/// **không có dòng `build: version=`** ⇒ `startVPNTunnel()` không bao giờ được gọi. Đường
/// `connect()` có bốn `await`/lời gọi **không ghi log** (xin quyền vị trí, `loadAllFromPreferences`
/// trong `prepareForFreshSession`, cấp cấu hình qua control plane, `saveToPreferences`), nên log
/// cũ không phân biệt được cái nào treo.
///
/// Hai cơ chế, cả hai đều KHÔNG đổi hành vi:
/// 1. `mark(_:)` + `note(_:)` — ghi mốc vào `app.log` ngay khi đi qua từng bước.
/// 2. `watch(_:)` — đồng hồ canh chạy trong `Task.detached` (KHÔNG phải MainActor). Nhờ vậy
///    nó vẫn ghi được kể cả khi **main thread bị chặn** trong một lời gọi đồng bộ — ca mà mọi
///    log/await khác đều câm. Nếu mốc không đổi sau `stallAfter` giây ⇒ ghi rõ "TREO … ở bước …".
///
/// Khoá ở đây là khoá **riêng** của lớp này, không bao giờ lấy lồng nhau và không gọi ra ngoài
/// trong lúc giữ khoá (AGENTS.md §7c).
final class ConnectTrace: @unchecked Sendable {
    static let shared = ConnectTrace()

    private let lock = NSLock()
    private var step = "chưa bắt đầu"
    private var since = Date()
    private var started: Date?

    private init() {}

    /// Bắt đầu một lượt Connect mới.
    func begin() {
        lock.lock()
        step = "vào connect()"
        since = Date()
        started = Date()
        lock.unlock()
    }

    /// Đi qua một bước: ghi vào `app.log` và đặt lại đồng hồ canh.
    func mark(_ next: String) {
        lock.lock()
        step = next
        since = Date()
        lock.unlock()
        AppDiagnostics.shared.log("connect⏱ \(next)")
    }

    /// Ghi chú không đổi mốc canh (giá trị đọc được, kết quả từng nhánh).
    func note(_ text: String) {
        AppDiagnostics.shared.log("connect⏱   · \(text)")
    }

    func finish(_ why: String) {
        lock.lock()
        let stepNow = step
        let total = started.map { Date().timeIntervalSince($0) } ?? 0
        started = nil
        lock.unlock()
        AppDiagnostics.shared.log(
            String(format: "connect⏱ KẾT THÚC sau %.2fs — %@ (mốc cuối: %@)", total, why, stepNow)
        )
    }

    /// Ảnh chụp mốc hiện tại. Cố ý là hàm ĐỒNG BỘ: Swift 6 cấm gọi `lock()/unlock()` trực tiếp
    /// trong ngữ cảnh async, nên `watch()` chỉ được đụng vào khoá qua hàm này.
    private func snapshot() -> (active: Bool, step: String, idle: TimeInterval) {
        lock.lock()
        defer { lock.unlock() }
        return (started != nil, step, Date().timeIntervalSince(since))
    }

    /// Đồng hồ canh: chạy NGOÀI MainActor. Im lặng nếu `connect()` đã kết thúc.
    func watch(_ tag: String, stallAfter: TimeInterval = 6, every: TimeInterval = 4, maxTicks: Int = 8) {
        Task.detached(priority: .utility) { [weak self] in
            var lastReported = ""
            for _ in 0..<maxTicks {
                try? await Task.sleep(for: .seconds(every))
                guard let self else { return }
                let snap = self.snapshot()
                guard snap.active else { return }
                guard snap.idle >= stallAfter else { continue }
                let line = String(format: "%@ · %.1fs", snap.step, snap.idle)
                guard line != lastReported else { continue }
                lastReported = line
                AppDiagnostics.shared.log(
                    String(format: "connect⏱ TREO %.1fs ở bước: %@ [tag=%@]", snap.idle, snap.step, tag)
                )
            }
        }
    }
}
