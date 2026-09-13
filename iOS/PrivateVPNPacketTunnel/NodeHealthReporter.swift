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

        // Fire-and-forget: báo cáo không bao giờ được ném lỗi vào tunnel hay làm chậm
        // startTunnel. Gửi qua đúng cơ chế dự phòng của `ControlAPIClient`
        // (`ControlAPIHosts.sendWithFallback`): host chính là api.meetflowai.site — trỏ
        // vào IP của node — nên khi IP đó bị chặn thì chính báo cáo này là thứ không đi
        // được, mà nó lại là tín hiệu DUY NHẤT để coordinator biết node bị chặn và hạ nó
        // xuống. Lỗi transport thì thử lại qua host dùng chung; có HTTP response thì thôi.
        Task {
            do {
                _ = try await ControlAPIHosts.sendWithFallback(request, session: .shared)
                RelayDiagnostics.shared.log("health: reported \(nodeId) ok=\(reachable)")
            } catch {
                RelayDiagnostics.shared.log("health: report \(nodeId) ok=\(reachable) failed: \(error.localizedDescription)")
            }
        }
        log.debug("health report node=\(nodeId) ok=\(reachable)")
    }
}
