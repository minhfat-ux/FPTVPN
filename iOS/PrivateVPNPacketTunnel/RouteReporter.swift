import Foundation
#if canImport(CryptoKit)
import CryptoKit
#endif

/// A9 — client gửi số đo lên control plane để **server quyết định đường tốt nhất**.
///
/// Hợp đồng server: `POST /v1/route-report` (commit `50ccf55`, `control-plane/src/route-report.js`).
/// File này là phần **THUẦN LOGIC + gọi mạng** của client:
///   * dựng body đúng schema (chỉ số liệu tổng hợp; định danh mạng là **băm**);
///   * đọc `{recommended, ttl_s}` / `{recommended: null}`;
///   * áp luật an toàn §2f.1: **chỉ đổi** khi `recommended` khác đường đang dùng + `ttl_s` còn hạn;
///   * nhịp **≤1 lần/5 phút/thiết bị**;
///   * chờ server **≤2000 ms**; timeout/lỗi/`null` ⇒ trả `nil` để app tự chọn (server là kênh
///     tối ưu, KHÔNG phải cổng chặn).
///
/// Client KHÔNG tự gọi ở đây: nơi gọi (máy trạng thái §5b `START/RAMP/STABLE/PROBE/DEGRADED`)
/// chịu trách nhiệm chọn thời điểm báo (sau STABLE, sau mỗi lần kênh dò kết thúc, khi suy giảm)
/// và bơm `device_id` + `credential` (app truyền qua `providerConfiguration`, xem
/// `docs/DEV_PLAN_IOS_MACOS_TOC_DO.md` §0b).
enum RouteReporter {
    static let path = "v1/route-report"
    static let defaultBaseURL = URL(string: "https://api.meetflowai.site")!
    /// A9: nhịp báo ≤ 1 lần/5 phút/thiết bị.
    static let minInterval: TimeInterval = 300
    /// A9: server phải trả lời trong ≤ 2000 ms; quá hạn ⇒ app tự quyết.
    static let decideTimeout: TimeInterval = 2
    /// Server chặn `candidates` nhiều hơn 6 (`MAX_CANDIDATES`).
    static let maxCandidates = 6

    enum Transport: String, CaseIterable { case udp, tcp, ws }
    enum NetworkType: String, CaseIterable { case cell, wifi, other }

    struct Network: Equatable {
        var type: NetworkType
        /// Băm định danh mạng (`sha256(ssid|carrier|...)`), KHÔNG BAO GIỜ là giá trị thô.
        var identityHash: String
        var rawKbps: Double
    }

    struct Current: Equatable {
        var transport: Transport
        var node: String?
        var port: Int?
        var goodputKbps: Double
        var stableKbps: Double?
        var rttMs: Double?
        var reconnects: Int
    }

    struct Candidate: Equatable {
        var transport: Transport
        var port: Int?
        var node: String?
        var connectMs: Double?
        var rttMs: Double?
        /// `"ok"` | `"fail"` | `nil` (chưa đo).
        var result: String?
    }

    struct Report: Equatable {
        var platform: String
        var appVersion: String
        var deviceId: String
        var credential: String
        var network: Network
        var current: Current
        var candidates: [Candidate]
    }

    struct Recommended: Equatable {
        var transport: Transport
        var port: Int?
        var node: String?
        var reason: String?
    }

    struct Decision: Equatable {
        var recommended: Recommended?
        var ttlS: Int
        var reason: String?
        var retryAfterS: Int?
    }

    // MARK: - Thuần logic (unit test được)

    /// Băm định danh mạng — A9 luật riêng tư §2f.3 (chỉ gửi băm, không gửi SSID/IP/carrier thô).
    static func identityHash(_ raw: String) -> String {
        #if canImport(CryptoKit)
        return SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
        #else
        return ""
        #endif
    }

    /// Dựng body đúng schema server. Không bao giờ chứa khoá định danh thô
    /// (`ssid`/`ip`/`email`/`carrier_raw`… — server trả 400 nếu có).
    static func body(_ report: Report, maxCandidates: Int = RouteReporter.maxCandidates) -> [String: Any] {
        // `raw_kbps` bắt buộc: giữ 0 khi chưa đo được thay vì bỏ khoá (server coi thiếu là invalid).
        let network: [String: Any] = [
            "type": report.network.type.rawValue,
            "identity_hash": report.network.identityHash,
            "raw_kbps": report.network.rawKbps,
        ]

        var current: [String: Any] = [
            "transport": report.current.transport.rawValue,
            "goodput_kbps": report.current.goodputKbps,
            "reconnects": report.current.reconnects,
        ]
        if let node = report.current.node { current["node"] = node }
        if let port = report.current.port { current["port"] = port }
        if let stable = report.current.stableKbps { current["stable_kbps"] = stable }
        if let rtt = report.current.rttMs { current["rtt_ms"] = rtt }

        let candidates: [[String: Any]] = report.candidates.prefix(maxCandidates).map { candidate in
            var item: [String: Any] = ["transport": candidate.transport.rawValue]
            if let port = candidate.port { item["port"] = port }
            if let node = candidate.node { item["node"] = node }
            if let connect = candidate.connectMs { item["connect_ms"] = connect }
            if let rtt = candidate.rttMs { item["rtt_ms"] = rtt }
            if let result = candidate.result { item["result"] = result }
            return item
        }

        return [
            "platform": report.platform,
            "app_version": report.appVersion,
            "device_id": report.deviceId,
            "credential": report.credential,
            "network": network,
            "current": current,
            "candidates": candidates,
        ]
    }

    static func bodyData(_ report: Report, maxCandidates: Int = RouteReporter.maxCandidates) -> Data? {
        try? JSONSerialization.data(withJSONObject: body(report, maxCandidates: maxCandidates))
    }

    /// Đọc phản hồi. `recommended: null` (hoặc thiếu/không hợp lệ) ⇒ `recommended = nil` (giữ nguyên).
    static func decode(_ data: Data) -> Decision? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        let ttl = (object["ttl_s"] as? NSNumber)?.intValue ?? 0
        let reason = object["reason"] as? String
        let retry = (object["retry_after_s"] as? NSNumber)?.intValue
        guard let recommendedObject = object["recommended"] as? [String: Any],
              let transportRaw = recommendedObject["transport"] as? String,
              let transport = Transport(rawValue: transportRaw) else {
            return Decision(recommended: nil, ttlS: ttl, reason: reason, retryAfterS: retry)
        }
        let recommended = Recommended(
            transport: transport,
            port: (recommendedObject["port"] as? NSNumber)?.intValue,
            node: recommendedObject["node"] as? String,
            reason: recommendedObject["reason"] as? String
        )
        return Decision(recommended: recommended, ttlS: ttl, reason: reason, retryAfterS: retry)
    }

    /// A9 §2f.1: **chỉ đổi** khi server trả `recommended` KHÁC đường đang dùng và `ttl_s` còn hạn.
    static func shouldApply(_ decision: Decision?, current: Current, receivedAt: Date, now: Date) -> Bool {
        guard let decision, let recommended = decision.recommended else { return false }
        guard decision.ttlS > 0 else { return false }
        guard now.timeIntervalSince(receivedAt) < TimeInterval(decision.ttlS) else { return false }
        return !samePath(recommended, current)
    }

    /// Cùng một đường khi trùng cả transport + port + node (nil = không chỉ định).
    static func samePath(_ recommended: Recommended, _ current: Current) -> Bool {
        recommended.transport == current.transport
            && recommended.port == current.port
            && recommended.node == current.node
    }

    /// Nhịp ≤1 lần/5 phút/thiết bị. Client tự giãn; server cũng trả `retry_after_s` nếu báo dày.
    struct Pacer {
        private var lastSent: [String: Date] = [:]
        var interval: TimeInterval = RouteReporter.minInterval

        mutating func shouldSend(deviceId: String, now: Date) -> Bool {
            guard let last = lastSent[deviceId] else { return true }
            return now.timeIntervalSince(last) >= interval
        }

        mutating func markSent(deviceId: String, now: Date) {
            lastSent[deviceId] = now
        }

        mutating func reset() {
            lastSent.removeAll()
        }
    }

    // MARK: - Gọi mạng (best-effort, không bao giờ ném vào tunnel)

    /// Gửi report với trần `decideTimeout` (≤2 s). Mọi lỗi/timeout/HTTP ≠ 2xx ⇒ `completion(nil)`
    /// để nơi gọi tự chọn đường. Không throw, không retry ở đây (nhịp do `Pacer` quyết).
    static func post(
        _ report: Report,
        baseURL: URL = RouteReporter.defaultBaseURL,
        session: URLSession = .shared,
        completion: @escaping @Sendable (Decision?) -> Void
    ) {
        guard let data = bodyData(report) else {
            completion(nil)
            return
        }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = decideTimeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        session.dataTask(with: request) { responseData, response, _ in
            guard let responseData,
                  let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else {
                completion(nil)
                return
            }
            completion(decode(responseData))
        }.resume()
    }
}
