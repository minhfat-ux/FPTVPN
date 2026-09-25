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
            // `autoreleasepool`: block của `DispatchQueue` KHÔNG tự có pool, mà đường này dùng
            // `DateFormatter`/`FileManager`/`FileHandle` (đều là Objective-C) ⇒ object tự động nhả
            // sẽ nằm lại tới hết tiến trình ⇒ bộ nhớ leo theo SỐ DÒNG LOG (BUG-IOS-JETSAM-001,
            // phần theo thời gian: nhịp `bw: sample` in ~2 dòng/giây suốt phiên).
            autoreleasepool {
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

    // MARK: - CÔNG TẮC LOG (26/09/2026)
    //
    // Mặc định **TẮT log chi tiết**: chỉ ghi những dòng cần cho nghiệm thu/sự cố. Lý do:
    //  (1) log là chi phí thật trong extension — mỗi dòng là một object + ghi file trên luồng
    //      không có `autoreleasepool` (xem BUG-IOS-JETSAM-001);
    //  (2) iOS giết extension ở trần ~51 MB và khách chỉ cần tunnel chạy, không cần log.
    // Bật lại khi cần chẩn đoán bằng 1 trong 2 cách:
    //  - tạo file `Documents/tunnel-log-on` trong container extension, hoặc
    //  - app truyền `providerConfiguration["logVerbose"] = true` khi Connect.
    private static let verboseFlagName = "tunnel-log-on"
    private var verboseCache = false
    private var verboseCheckedAt = Date.distantPast

    /// Bật/tắt log chi tiết ngay trong phiên (app gọi qua providerConfiguration).
    func setVerbose(_ on: Bool) {
        queue.sync { [weak self] in self?.verboseCache = on; self?.verboseCheckedAt = Date() }
    }

    var isVerbose: Bool { queue.sync { verboseCache } }

    /// Những dòng LUÔN ghi (kể cả khi log tắt) — đủ để nghiệm thu và truy sự cố.
    private static let alwaysKeywords = [
        "build: version=", "startTunnel", "stopTunnel", "van an toàn bộ nhớ", "ĐÔNG CỨNG",
        "đổi mạng", "ĐÃ dựng lại transport", "TỰ DỰNG LẠI", "QUYẾT ĐỊNH TỰ GỠ", "TUNNEL_",
        "THẤT BẠI", "thất bại", "lỗi", "LỖI", "KHÔNG lấy được", "link dropped", "link đã mở lại",
        "handshake ok", "XÁC NHẬN tunnel", "cầu mới", "watchdog NGỪNG chạy", "ĐỔI NODE", "đổi node",
        // 1 dòng/phút — giữ để nghiệm thu bộ nhớ (footprint/van) mà không cần bật log chi tiết.
        "tài nguyên:",
    ]

    private func shouldWrite(_ message: String) -> Bool {
        // Đọc lại cờ file thưa (5 s/lần) để không syscall mỗi dòng.
        if Date().timeIntervalSince(verboseCheckedAt) > 5 {
            verboseCheckedAt = Date()
            if let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
               FileManager.default.fileExists(atPath: base.appendingPathComponent(Self.verboseFlagName).path) {
                verboseCache = true
            }
        }
        if verboseCache { return true }
        return Self.alwaysKeywords.contains { message.contains($0) }
    }

    /// Ghi log CHI TIẾT (chỉ khi công tắc bật) — dùng cho nhịp lấy mẫu, nhịp cầu, frames…
    func logVerbose(_ message: String) {
        guard isVerbose else { return }
        log(message)
    }

    func log(_ message: String) {
        guard shouldWrite(message) else { return }
        let line = "\(formatter.string(from: Date())) \(message)\n"
        queue.async { [weak self] in
            // Xem `logSync`: block của `DispatchQueue` KHÔNG tự có pool, phải tự dựng.
            autoreleasepool {
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
}
