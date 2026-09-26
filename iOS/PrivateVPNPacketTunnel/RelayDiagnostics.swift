import Foundation
import os

/// File-backed diagnostics for the tunnel extension.
///
/// iOS offers no way to stream an app-extension's `os_log` from the command line, and
/// the extension runs in its own process, so everything the relay and the WireGuard
/// adapter log is mirrored into a file **dùng chung giữa app và extension**.
///
/// 26/09/2026 — BỆNH CŨ và cách sửa: đường cũ là `Documents/relay.log` của CHÍNH tiến trình.
/// Extension macOS là **system extension chạy bằng root**, nên file rơi vào container của root
/// (`/var/root/...`) — app (user) **không mở được**, tệp chẩn đoán trống, và dấu vết IPv6
/// (`bridge: IPv6 BỊ CHẶN`) coi như mất. Nay log ghi vào **app group container**
/// `G6XW3RN6LJ.com.privatevpn.shared` (khai `com.apple.security.application-groups` ở cả hai
/// target macOS; `NEMachServiceName` của system extension cũng bắt đầu bằng nhóm này).
///
/// **CẢNH BÁO đo được 26/09/2026 (đừng "sửa" lại thành một đường):** container app group là
/// **THEO TỪNG USER**, không phải một thư mục dùng chung. `containerURL` của extension (root) trả
/// `/private/var/root/Library/Group Containers/…`, còn của app (user) là
/// `/Users/<user>/Library/Group Containers/…` — HAI thư mục khác nhau. Vì vậy:
///  • **chính**: container của user đang đăng nhập (`/Users/<user>/Library/Group Containers/…`) —
///    chỗ app/người dùng đọc được. Suy ra từ chủ `/dev/console` (xem `consoleUserHomeDirectory`);
///  • **bản sao (mirror)**: container của chính tiến trình — luôn ghi được, để không mất log khi
///    thư mục user không ghi được (sandbox của system extension có thể chặn).
/// Cả hai đường đều được THỬ GHI THẬT lúc khởi tạo và kết quả được ghi ra unified log
/// (`relay.log: primary=… mirror=… probes[…]`).
///
/// Cùng thư mục đó chứa hai file CỜ chẩn đoán (`tunnel-log-on`, `ipv6-allow`) mà app (user)
/// tạo/đọc được.
///
/// iOS không đổi (`RelayDiagnostics` giữ `containerURL` → `nil` vì target iOS CỐ Ý không khai app
/// group, xem `project.yml`), nên log iOS vẫn nằm ở `Documents/relay.log` của extension và vẫn
/// lấy ra bằng:
///
///     xcrun devicectl device copy from --device <ipad> \
///       --domain-type appDataContainer \
///       --domain-identifier com.privatevpn.app.packet-tunnel \
///       --source Documents/relay.log
///
/// Kept intentionally tiny: append-only, capped, and never blocking the tunnel.
final class RelayDiagnostics: @unchecked Sendable {
    static let shared = RelayDiagnostics()

    /// App group dùng chung (xem `project.yml` — entitlement của cả hai target macOS).
    static let appGroupIdentifier = "G6XW3RN6LJ.com.privatevpn.shared"

    private static let unifiedLog = Logger(
        subsystem: "com.privatevpn.app.packet-tunnel",
        category: "diagnostics"
    )

    private let queue = DispatchQueue(label: "com.privatevpn.app.relay.diagnostics")
    private let maxBytes = 512 * 1024
    private let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MM-dd HH:mm:ss.SSS"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private let fileURL: URL?
    private let mirrorURL: URL?
    /// Thư mục chính (chứa `relay.log`). `nil` = không có app group ⇒ dùng `Documents` của tiến
    /// trình (đúng hành vi iOS: target iOS KHÔNG khai app group).
    private let directoryURL: URL?
    /// Mọi thư mục cần soi file CỜ (chính + bản sao + container của user đang đăng nhập).
    private let flagDirectories: [URL]
    private init() {
        // Resolved once, in init: the write queue serialises everything afterwards.
        let resolved = Self.resolveLogDirectories()
        let primary = resolved.primary
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        directoryURL = primary
        fileURL = primary?.appendingPathComponent("relay.log")
        mirrorURL = resolved.mirror?.appendingPathComponent("relay.log")
        flagDirectories = resolved.flagDirectories
        if let primary {
            try? FileManager.default.createDirectory(at: primary, withIntermediateDirectories: true)
        }
        // Ghi ĐƯỜNG DẪN ra unified log: không có dòng này thì không biết file chẩn đoán nằm đâu
        // (đúng thứ đã làm mất một vòng điều tra ngày 26/09/2026). `probe=` nói luôn đường nào
        // GHI ĐƯỢC — cần thiết vì app group container của tiến trình **root** là
        // `/var/root/Library/Group Containers/...`, KHÁC container của user (xem đầu file).
        let primaryPath = fileURL?.path ?? "-"
        let mirrorPath = mirrorURL?.path ?? "-"
        let candidates = resolved.report.joined(separator: " | ")
        Self.unifiedLog.notice(
            "relay.log: primary=\(primaryPath, privacy: .public) mirror=\(mirrorPath, privacy: .public) probes[\(candidates, privacy: .public)]"
        )
    }

    /// Chọn thư mục ghi log: ưu tiên chỗ **user đọc được**, luôn có chỗ dự phòng ghi được.
    ///
    /// Trả về thư mục chính (đã kiểm ghi được) + bản sao (nếu có chỗ thứ hai ghi được) + danh sách
    /// thư mục để soi file cờ + chuỗi chẩn đoán cho unified log.
    private static func resolveLogDirectories() -> (
        primary: URL?, mirror: URL?, flagDirectories: [URL], report: [String]
    ) {
        let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        )
        var candidates: [(label: String, url: URL)] = []
        #if os(macOS)
        // Container của NHÓM trong home của **user đang đăng nhập** — chỗ app (user) và người dùng
        // đọc được. Đứng TRƯỚC vì `containerURL` của tiến trình root trả `/var/root/...`.
        if let home = consoleUserHomeDirectory() {
            candidates.append((
                "user:\(home)",
                URL(fileURLWithPath: home)
                    .appendingPathComponent("Library/Group Containers/\(appGroupIdentifier)")
            ))
        } else {
            candidates.append(("user:<không tìm được user /dev/console>", URL(fileURLWithPath: "/")))
        }
        #endif
        if let container { candidates.append(("container", container)) }

        var writable: [URL] = []
        var report: [String] = []
        for candidate in candidates {
            guard candidate.url.path != "/" else { report.append("\(candidate.label)=SKIP"); continue }
            let exists = isExistingDirectory(candidate.url)
            let writableNow = canCreateFile(in: candidate.url)
            report.append("\(candidate.label) exists=\(exists) write=\(writableNow)")
            if writableNow { writable.append(candidate.url) }
        }
        // Thư mục soi file cờ: mọi chỗ ĐỌC được (kể cả chỗ không ghi được — người dùng có thể tự
        // tạo `ipv6-allow` trong container của mình).
        var flagDirectories: [URL] = writable
        for candidate in candidates where candidate.url.path != "/" && !flagDirectories.contains(candidate.url) {
            flagDirectories.append(candidate.url)
        }
        return (
            primary: writable.first,
            mirror: writable.count > 1 ? writable[1] : nil,
            flagDirectories: flagDirectories,
            report: report
        )
    }

    #if os(macOS)
    /// Home của user đang ngồi trước máy (chủ `/dev/console`). BA đường, vì system extension chạy
    /// trong sandbox: đường đầu có thể trả `nil` (đã gặp thật 26/09/2026 — chọn nhầm container của
    /// `/var/root` nên log rơi vào chỗ user không đọc được).
    ///   1. `getpwuid(uid)` — nhanh và chuẩn;
    ///   2. quét `/Users/*` rồi so `st_uid` với chủ `/dev/console`;
    ///   3. `NSHomeDirectoryForUser` cho tên tìm được ở (2).
    private static func consoleUserHomeDirectory() -> String? {
        var info = stat()
        guard stat("/dev/console", &info) == 0 else { return nil }
        if let pw = getpwuid(info.st_uid) {
            let home = String(cString: pw.pointee.pw_dir)
            if !home.isEmpty, isExistingDirectory(URL(fileURLWithPath: home)) { return home }
        }
        let names = (try? FileManager.default.contentsOfDirectory(atPath: "/Users")) ?? []
        for name in names.sorted() where !name.hasPrefix(".") {
            let home = "/Users/\(name)"
            var st = stat()
            guard stat(home, &st) == 0, st.st_uid == info.st_uid else { continue }
            return home
        }
        return nil
    }
    #endif

    private static func isExistingDirectory(_ url: URL) -> Bool {
        var isDirectory: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
        return exists && isDirectory.boolValue
    }

    /// Thử GHI THẬT một file nhỏ: quyền POSIX không nói lên được **sandbox** của tiến trình có
    /// cho ghi vào app group hay không, nên phải thử mới biết.
    private static func canCreateFile(in directory: URL) -> Bool {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let probe = directory.appendingPathComponent(".vpnflow-write-probe")
        do {
            try Data([0]).write(to: probe, options: .atomic)
            try? FileManager.default.removeItem(at: probe)
            return true
        } catch {
            return false
        }
    }

    /// Có file cờ ở BẤT KỲ thư mục log nào? (người dùng có thể tạo `ipv6-allow` trong container
    /// của mình; extension có thể đọc được hoặc không — thử hết.)
    private func flagExists(_ name: String) -> Bool {
        for base in flagDirectories
        where FileManager.default.fileExists(atPath: base.appendingPathComponent(name).path) {
            return true
        }
        return false
    }

    /// Đuôi log gần nhất (≤ `maxBytes`) để **app lưu hộ** ra app group container — xem
    /// `TunnelStatusReport.logTail` và `VPNManagerMac.saveDiagnosticsLog`.
    ///
    /// Vì sao đọc từ FILE chứ không giữ thêm buffer trong RAM: `relay.log` đã có cơ chế cắt trần
    /// (512 KB) nên không dựng bản sao thứ hai trong bộ nhớ (BUG-IOS-JETSAM-001).
    func recentLogTail(maxBytes: Int) -> String? {
        queue.sync { [weak self] in
            guard let self, let url = self.fileURL else { return nil }
            return autoreleasepool { () -> String? in
                guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
                defer { try? handle.close() }
                let size = (try? handle.seekToEnd()) ?? 0
                let start = size > UInt64(maxBytes) ? size - UInt64(maxBytes) : 0
                try? handle.seek(toOffset: start)
                guard let data = try? handle.readToEnd(), !data.isEmpty else { return nil }
                return String(decoding: data, as: UTF8.self)
            }
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
                guard let self, let data = line.data(using: .utf8) else { return }
                self.append(data, to: self.fileURL)
                self.append(data, to: self.mirrorURL)
            }
        }
    }

    /// Ghi 1 dòng vào 1 file (đã cắt trần trước khi ghi). `nil` ⇒ bỏ qua.
    private func append(_ data: Data, to url: URL?) {
        guard let url else { return }
        trimIfNeeded(url)
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        } else {
            try? data.write(to: url, options: .atomic)
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

    /// Cờ CHẨN ĐOÁN `ipv6-allow` (26/09/2026, chủ dự án yêu cầu): có file ⇒ **TẮT** đường chặn IPv6
    /// của P2, tức gói IPv6 được chuyển tiếp bình thường vào Go.
    ///
    /// Vì sao cần cơ chế tắt: hạ tầng hiện tại (node-2 `165.101.114.162`) CHỈ có IPv4 nên chặn là
    /// đúng, nhưng nếu sau này node có IPv6 egress thật thì phải mở lại đường IPv6 **mà không phải
    /// build lại app**. File nằm cùng thư mục với `relay.log` (app group) nên cả app (user) và
    /// extension (root) đều tạo/đọc được:
    ///
    ///     touch ~/Library/Group\ Containers/G6XW3RN6LJ.com.privatevpn.shared/ipv6-allow
    ///
    /// Đọc lại thưa **5 s** (như cờ log chi tiết) để không syscall trên đường gói.
    private static let ipv6AllowFlagName = "ipv6-allow"
    private var ipv6AllowCache = false
    private var ipv6AllowCheckedAt = Date.distantPast

    /// `true` = CHO PHÉP IPv6 đi vào tunnel (đã tắt đường chặn). Mặc định `false`.
    var isIPv6Allowed: Bool {
        queue.sync { [weak self] in
            guard let self else { return false }
            if Date().timeIntervalSince(self.ipv6AllowCheckedAt) > 5 {
                self.ipv6AllowCheckedAt = Date()
                self.ipv6AllowCache = self.flagExists(Self.ipv6AllowFlagName)
            }
            return self.ipv6AllowCache
        }
    }

    /// Những dòng LUÔN ghi (kể cả khi log tắt) — đủ để nghiệm thu và truy sự cố.
    private static let alwaysKeywords = [
        "build: version=", "startTunnel", "stopTunnel", "van an toàn bộ nhớ", "ĐÔNG CỨNG",
        "đổi mạng", "ĐÃ dựng lại transport", "TỰ DỰNG LẠI", "QUYẾT ĐỊNH TỰ GỠ", "TUNNEL_",
        "THẤT BẠI", "thất bại", "lỗi", "LỖI", "KHÔNG lấy được", "link dropped", "link đã mở lại",
        "handshake ok", "XÁC NHẬN tunnel", "cầu mới", "watchdog NGỪNG chạy", "ĐỔI NODE", "đổi node",
        // 1 dòng/phút — giữ để nghiệm thu bộ nhớ (footprint/van) mà không cần bật log chi tiết.
        "tài nguyên:",
        // P2 (26/09/2026) — BẰNG CHỨNG CHỐNG RÒ IPv6 phải LUÔN ghi, KHÔNG được phụ thuộc công tắc log.
        // Vì sao: chính công tắc này đã lọc mất dòng chẩn đoán IPv6, làm mất hẳn một vòng điều tra
        // (không biết `ipv6Settings` có được áp hay không, không biết gói IPv6 có vào tunnel hay không).
        // Bằng chứng nghiệm thu mà có thể bị tắt im lặng thì không phải bằng chứng.
        "IPv6 utun=", "IPv6 BỊ CHẶN", "IPv6-chặn",
    ]

    private func shouldWrite(_ message: String) -> Bool {
        // Đọc lại cờ file thưa (5 s/lần) để không syscall mỗi dòng.
        if Date().timeIntervalSince(verboseCheckedAt) > 5 {
            verboseCheckedAt = Date()
            // Cờ nằm trong thư mục log DÙNG CHUNG (app group) — trước đây là `Documents` của
            // extension, chỗ app (user) không tạo được nên cờ gần như không dùng được.
            if flagExists(Self.verboseFlagName) { verboseCache = true }
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
                guard let self, let data = line.data(using: .utf8) else { return }
                self.append(data, to: self.fileURL)
                self.append(data, to: self.mirrorURL)
            }
        }
    }
}
