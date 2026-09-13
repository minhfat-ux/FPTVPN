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

    func log(_ message: String) {
        let line = "\(formatter.string(from: Date())) \(message)\n"
        queue.async { [weak self] in
            guard let self, let url = self.fileURL else { return }
            guard let data = line.data(using: .utf8) else { return }
            let manager = FileManager.default
            if let attributes = try? manager.attributesOfItem(atPath: url.path),
               let size = attributes[.size] as? Int,
               size > self.maxBytes {
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
