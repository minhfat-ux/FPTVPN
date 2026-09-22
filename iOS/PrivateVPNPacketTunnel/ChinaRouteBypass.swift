import Foundation
#if canImport(NetworkExtension)
import NetworkExtension
#endif

/// A7 — app Trung Quốc đi ĐƯỜNG RIÊNG, không qua VPN.
///
/// iOS/macOS **không** có API loại trừ theo từng app (`addDisallowedApplication` chỉ có trên
/// Android), nên hai nền tảng này chia theo **ĐÍCH ĐẾN**: danh sách dải IP Trung Quốc
/// (`https://meetflowai.site/dl/routes/cn.txt` + `cn6.txt`, sinh lại từ APNIC bằng
/// `scripts/gen-cn-cidrs.mjs`) được đưa vào `excludedRoutes` của utun ⇒ gói tới IP TQ đi thẳng
/// qua đường vật lý, KHÔNG vào tunnel. Cùng nguyên tắc với Windows và với ghi chú ngay trong
/// `cn-apps.txt` (".privatevpn/reports/2026-09-18-windows-1.0.5-handoff.md" §2/§3).
///
/// IPv6 (chủ dự án chốt 22/09 — WIN commit `92f60c9`): server **không có IPv6** ⇒ KHÔNG đưa
/// `::/0` vào tunnel (sẽ đen hết IPv6). Thiết kế đúng: **IPv6 của TQ đi THẲNG, IPv6 còn lại
/// CHẶN** (không rò IP thật). Vì vậy `ipv6Settings` đặt `includedRoutes = ::/0` + `excludedRoutes`
/// = `cn6.txt`: gói tới dải TQ được loại trừ (đi thẳng), phần còn lại vào tunnel — mà tunnel/core
/// không có IPv6 nên bị chặn, không rò.
///
/// VÌ SAO KHÔNG dùng ACL sẵn có của hysteria2: hysteria2 **có** `extras/outbounds/acl` với
/// geoip/geosite, nhưng nó chỉ nằm ở tầng APP/PROXY (`app/cmd/server.go:1336-1361`), còn
/// framework nhúng trong extension (`tools/hysteria-android/mobile.go`) đưa thẳng `client.Client`
/// cho `tun.Server` (`app/internal/tun/server.go:20-21`) ⇒ **không có nhánh ACL nào chạy**.
/// Muốn dùng phải sửa core Go + nhúng geo data (việc lớn, không thuộc lượt này).
/// sing-box/libbox thì mới là DRAFT + chặn license (`docs/SINGBOX_INTEGRATION_PLAN.md` §7.1).
///
/// Bắt buộc: tải/cập nhật danh sách ở **LUỒNG NỀN**, KHÔNG nằm trên đường kết nối — bài học
/// Windows 1.0.4 "connecting mãi" khi thêm 5.494 route đồng bộ trong lúc connect.
enum ChinaRouteBypass {
    static let listURL = URL(string: "https://meetflowai.site/dl/routes/cn.txt")!
    static let list6URL = URL(string: "https://meetflowai.site/dl/routes/cn6.txt")!
    /// Trần số dải nhận: file APNIC hiện ~5.500 IPv4 / ~2.000 IPv6; trần để một file hỏng không
    /// nhét hàng trăm nghìn route vào NetworkExtension.
    static let maxRoutes = 8000
    private static let cacheKey = "A7.cnRouteList.v1"
    private static let cache6Key = "A7.cn6RouteList.v1"

    // MARK: - IPv4: thuần logic (unit test được, không cần NetworkExtension)

    /// Bỏ comment/dòng trống, chuẩn hoá về `network/prefix`, bỏ trùng, giữ thứ tự.
    static func parse(_ text: String, limit: Int = maxRoutes) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for rawLine in text.split(whereSeparator: { $0 == "\n" || $0 == "\r" }) {
            let line = rawLine
                .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
                .trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty else { continue }
            guard let cidr = normalizedCIDR(line), seen.insert(cidr).inserted else { continue }
            out.append(cidr)
            if out.count >= limit { break }
        }
        return out
    }

    /// `1.0.1.5/24` → `1.0.1.0/24`; trả nil nếu không phải IPv4 CIDR hợp lệ, hoặc prefix 0
    /// (loại `0.0.0.0/0` = bỏ luôn cả tunnel).
    static func normalizedCIDR(_ value: String) -> String? {
        let parts = value.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2,
              let prefix = Int(parts[1]),
              (1...32).contains(prefix),
              let address = ipv4ToUInt32(String(parts[0])),
              let mask = prefixMask(prefix),
              let maskValue = ipv4ToUInt32(mask) else { return nil }
        return "\(uint32ToIPv4(address & maskValue))/\(prefix)"
    }

    /// `24` → `"255.255.255.0"`.
    static func prefixMask(_ prefix: Int) -> String? {
        guard (0...32).contains(prefix) else { return nil }
        let mask: UInt32
        switch prefix {
        case 0: mask = 0
        case 32: mask = .max
        default: mask = ~(UInt32.max >> UInt32(prefix))
        }
        return uint32ToIPv4(mask)
    }

    static func ipv4ToUInt32(_ value: String) -> UInt32? {
        let octets = value.split(separator: ".", omittingEmptySubsequences: false)
        guard octets.count == 4 else { return nil }
        var result: UInt32 = 0
        for octet in octets {
            guard !octet.isEmpty, octet.count <= 3, octet.allSatisfy(\.isNumber),
                  let number = UInt32(octet), number <= 255 else { return nil }
            result = (result << 8) | number
        }
        return result
    }

    static func uint32ToIPv4(_ value: UInt32) -> String {
        "\((value >> 24) & 0xFF).\((value >> 16) & 0xFF).\((value >> 8) & 0xFF).\(value & 0xFF)"
    }

    // MARK: - IPv6: thuần logic

    /// Bỏ comment/dòng trống, chuẩn hoá `prefix/len`, bỏ trùng. Prefix 0 (`::/0`) bị loại: dùng
    /// làm `excludedRoutes` sẽ đẩy TOÀN BỘ IPv6 ra ngoài tunnel (rò IP thật) — ngược thiết kế.
    static func parseIPv6(_ text: String, limit: Int = maxRoutes) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for rawLine in text.split(whereSeparator: { $0 == "\n" || $0 == "\r" }) {
            let line = rawLine
                .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
                .trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty else { continue }
            guard let cidr = normalizedIPv6CIDR(line), seen.insert(cidr).inserted else { continue }
            out.append(cidr)
            if out.count >= limit { break }
        }
        return out
    }

    static func normalizedIPv6CIDR(_ value: String) -> String? {
        let parts = value.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2,
              let prefix = Int(parts[1]),
              (1...128).contains(prefix),
              isValidIPv6(String(parts[0])) else { return nil }
        return "\(parts[0])/\(prefix)"
    }

    /// Kiểm IPv6 không cần `Network`/`inet_pton`: 8 nhóm hex (hoặc ít hơn khi có đúng một `::`).
    static func isValidIPv6(_ address: String) -> Bool {
        guard address.contains(":") else { return false }
        let doubleColons = address.components(separatedBy: "::").count - 1
        guard doubleColons <= 1 else { return false }
        let body = doubleColons == 1 ? address.replacingOccurrences(of: "::", with: ":") : address
        let groups = body.split(separator: ":", omittingEmptySubsequences: false)
        guard groups.count <= 8 else { return false }
        if doubleColons == 0 && groups.count != 8 { return false }
        for group in groups where !group.isEmpty {
            guard group.count <= 4, group.allSatisfy(\.isHexDigit) else { return false }
        }
        return true
    }

    // MARK: - NetworkExtension

    #if canImport(NetworkExtension)
    /// Đổi danh sách CIDR (đã `parse`) sang `NEIPv4Route` để nhét vào `excludedRoutes`.
    static func excludedRoutes(from cidrs: [String], limit: Int = maxRoutes) -> [NEIPv4Route] {
        cidrs.prefix(limit).compactMap { cidr in
            let parts = cidr.split(separator: "/", maxSplits: 1)
            guard parts.count == 2,
                  let prefix = Int(parts[1]),
                  let mask = prefixMask(prefix) else { return nil }
            return NEIPv4Route(destinationAddress: String(parts[0]), subnetMask: mask)
        }
    }

    /// Đổi danh sách CIDR IPv6 (đã `parseIPv6`) sang `NEIPv6Route`.
    static func excludedRoutesV6(from cidrs: [String], limit: Int = maxRoutes) -> [NEIPv6Route] {
        cidrs.prefix(limit).compactMap { cidr in
            let parts = cidr.split(separator: "/", maxSplits: 1)
            guard parts.count == 2, let prefix = Int(parts[1]) else { return nil }
            return NEIPv6Route(destinationAddress: String(parts[0]), networkPrefixLength: NSNumber(value: prefix))
        }
    }
    #endif

    // MARK: - Tải nền + nhớ đệm

    /// Danh sách IPv4 đã nhớ từ lần trước; CHƯA có thì lùi về **bản bundle sẵn trong app**
    /// (`docs/routes/cn.txt`, chép vào bundle lúc build).
    ///
    /// Vì sao phải có fallback bundle: lần đầu chạy / mạng yếu / DNS bị chặn mà tải list thất bại
    /// ⇒ A7 mất tác dụng đúng lúc khách cần nhất (app TQ lại đi qua VPN). Bản bundle là ảnh chụp
    /// đã kiểm (trùng khít file production — `scripts/gen-cn-cidrs.mjs`), tự cập nhật ở luồng nền.
    static func cached(defaults: UserDefaults = .standard, bundle: Bundle = .main) -> [String] {
        if let text = defaults.string(forKey: cacheKey) {
            let parsed = parse(text)
            if !parsed.isEmpty { return parsed }
        }
        return bundled(bundle: bundle)
    }

    /// Bản bundle sẵn trong app (tài nguyên `cn.txt`, xem `project.yml`).
    static func bundled(bundle: Bundle = .main) -> [String] {
        guard let url = bundle.url(forResource: "cn", withExtension: "txt"),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return [] }
        return parse(text)
    }

    static func store(_ cidrs: [String], defaults: UserDefaults = .standard) {
        defaults.set(cidrs.joined(separator: "\n"), forKey: cacheKey)
    }

    static func cachedIPv6(defaults: UserDefaults = .standard, bundle: Bundle = .main) -> [String] {
        if let text = defaults.string(forKey: cache6Key) {
            let parsed = parseIPv6(text)
            if !parsed.isEmpty { return parsed }
        }
        return bundledIPv6(bundle: bundle)
    }

    static func bundledIPv6(bundle: Bundle = .main) -> [String] {
        guard let url = bundle.url(forResource: "cn6", withExtension: "txt"),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return [] }
        return parseIPv6(text)
    }

    static func storeIPv6(_ cidrs: [String], defaults: UserDefaults = .standard) {
        defaults.set(cidrs.joined(separator: "\n"), forKey: cache6Key)
    }

    /// Tải danh sách ở LUỒNG NỀN rồi gọi `completion` trên hàng đợi nền. Mọi lỗi đều bị nuốt
    /// (best-effort): không có danh sách thì tunnel vẫn chạy như trước, chỉ là app TQ chưa được
    /// chia đường. TUYỆT ĐỐI không gọi trên đường connect.
    static func refresh(
        session: URLSession = .shared,
        completion: @escaping @Sendable ([String]) -> Void
    ) {
        fetch(listURL, session: session, parse: { parse($0) }, store: { store($0) }, completion: completion)
    }

    static func refreshIPv6(
        session: URLSession = .shared,
        completion: @escaping @Sendable ([String]) -> Void
    ) {
        fetch(list6URL, session: session, parse: { parseIPv6($0) }, store: { storeIPv6($0) }, completion: completion)
    }

    private static func fetch(
        _ url: URL,
        session: URLSession,
        parse: @escaping @Sendable (String) -> [String],
        store: @escaping @Sendable ([String]) -> Void,
        completion: @escaping @Sendable ([String]) -> Void
    ) {
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData
        session.dataTask(with: request) { data, response, _ in
            guard let data,
                  let text = String(data: data, encoding: .utf8),
                  let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else { return }
            let parsed = parse(text)
            guard !parsed.isEmpty else { return }
            store(parsed)
            completion(parsed)
        }.resume()
    }
}
