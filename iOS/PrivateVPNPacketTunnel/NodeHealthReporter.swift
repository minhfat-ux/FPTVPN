import Foundation
import os

/// Báo cho coordinator biết node này có tới được từ mạng của người dùng hay không.
///
/// Vì sao cần: GFW chặn theo IP, nên một node có thể bị chặn với mạng Trung Quốc
/// trong khi server tự kiểm tra vẫn thấy nó "sống" (nó trả lời bình thường từ Việt
/// Nam). Coordinator dùng báo cáo này để xếp node tới được lên trước ở lần lấy
/// danh sách kế tiếp. Best-effort: mọi lỗi đều bị nuốt, không ảnh hưởng tunnel.
enum NodeHealthReporter {
    private static let log = Logger(subsystem: "com.privatevpn.app.packet-tunnel", category: "health")
    private static let baseURL = URL(string: "https://api.meetflowai.site")!

    static func report(nodeId: String?, reachable: Bool, reason: String? = nil) {
        guard let nodeId, !nodeId.isEmpty else { return }
        var request = URLRequest(url: baseURL.appendingPathComponent("/v1/nodes/\(nodeId)/report"))
        request.httpMethod = "POST"
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["ok": reachable]
        if !reachable, let reason { body["reason"] = String(reason.prefix(100)) }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { _, _, error in
            if let error {
                RelayDiagnostics.shared.log("health: report \(nodeId) ok=\(reachable) failed: \(error.localizedDescription)")
            } else {
                RelayDiagnostics.shared.log("health: reported \(nodeId) ok=\(reachable)")
            }
        }.resume()
        log.debug("health report node=\(nodeId) ok=\(reachable)")
    }
}
