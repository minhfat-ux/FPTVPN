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
