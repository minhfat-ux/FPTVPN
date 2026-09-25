import Foundation
import os

/// File-backed diagnostics for the tunnel extension.
///
/// iOS offers no way to stream an app-extension's `os_log` from the command line, and
/// the extension runs in its own process, so everything the relay and the WireGuard
/// adapter log is mirrored into a file inside the extension's own container. Pull it
/// from a Mac with:
///
///     xcrun devicectl device copy from --device <ipad> \
///       --domain-type appDataContainer \
///       --domain-identifier com.privatevpn.app.packet-tunnel \
///       --source Documents/relay.log
///
/// Kept intentionally tiny: append-only, capped, and never blocking the tunnel.
final class RelayDiagnostics: @unchecked Sendable {
    static let shared = RelayDiagnostics()

    private let queue = DispatchQueue(label: "com.privatevpn.app.relay.diagnostics")
    private let maxBytes = 512 * 1024
    private let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MM-dd HH:mm:ss.SSS"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private let fileURL: URL?

    private init() {
        // Resolved once, in init: the write queue serialises everything afterwards.
        if let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
            fileURL = base.appendingPathComponent("relay.log")
        } else {
            fileURL = nil
        }
    }

    /// Ghi ĐỒNG BỘ (chờ ghi xong mới trả về) — chỉ dùng cho những dòng PHẢI có mặt dù tiến trình
    /// bị kết thúc ngay sau đó (ví dụ `stopTunnel`: 25/09/2026 nhiều phiên kết thúc mà log KHÔNG có
    /// dòng `stopTunnel`, nên không phân biệt được app/iOS/người dùng dừng).
    func logSync(_ message: String) {
        let line = "\(formatter.string(from: Date())) \(message)\n"
        queue.sync { [weak self] in
            guard let self, let url = self.fileURL, let data = line.data(using: .utf8) else { return }
            self.trimIfNeeded(url)
            if let handle = try? FileHandle(forWritingTo: url) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
            } else {
                try? data.write(to: url, options: .atomic)
            }
        }
    }

    /// Cắt bớt file khi vượt trần: giữ `keepBytes` CUỐI (bằng chứng gần nhất) rồi ghi lại.
    ///
    /// Vì sao KHÔNG xoá cả file (bản cũ `removeItem`): xoá là mất sạch bằng chứng của phiên đang
    /// chạy — đúng lúc cần nhất; còn để phình mãi thì đầy bộ nhớ thiết bị. Cắt-bớt là cơ chế dọn
    /// tài nguyên tại chỗ: file luôn ≤ trần, và luôn giữ phần mới nhất.
    private func trimIfNeeded(_ url: URL) {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attributes[.size] as? Int, size > self.maxBytes else { return }
        guard let handle = try? FileHandle(forReadingFrom: url) else { return }
        defer { try? handle.close() }
        let keep = self.maxBytes / 2
        try? handle.seek(toOffset: UInt64(max(0, size - keep)))
        guard let tail = try? handle.readToEnd() else { return }
        // Cắt tới dòng hoàn chỉnh đầu tiên để không giữ lại dòng cụt.
        if let nl = tail.firstIndex(of: 0x0A) {
            let clean = tail[(nl + 1)...]
            try? clean.write(to: url, options: .atomic)
        }
    }

    func log(_ message: String) {
        let line = "\(formatter.string(from: Date())) \(message)\n"
        queue.async { [weak self] in
            guard let self, let url = self.fileURL, let data = line.data(using: .utf8) else { return }
            self.trimIfNeeded(url)
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
