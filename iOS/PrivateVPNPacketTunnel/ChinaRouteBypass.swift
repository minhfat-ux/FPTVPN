import Foundation
#if canImport(NetworkExtension)
import NetworkExtension
#endif

/// A7 — app Trung Quốc đi ĐƯỜNG RIÊNG, không qua VPN.
///
/// iOS/macOS **không** có API loại trừ theo từng app (`addDisallowedApplication` chỉ có trên
/// Android), nên hai nền tảng này chia theo **ĐÍCH ĐẾN**: danh sách dải IP Trung Quốc
/// (`https://meetflowai.site/dl/routes/cn.txt`, sinh lại từ APNIC bằng
/// `scripts/upload-route-lists.sh`) được đưa vào `excludedRoutes` của utun ⇒ gói tới IP TQ đi
/// thẳng qua đường vật lý, KHÔNG vào tunnel. Cùng nguyên tắc với Windows 1.0.5 và với ghi chú
/// ngay trong `cn-apps.txt` (".privatevpn/reports/2026-09-18-windows-1.0.5-handoff.md" §2/§3).
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
    /// Trần số dải nhận: file APNIC hiện ~5.500 dòng; trần để một file hỏng không nhét hàng
    /// trăm nghìn route vào NetworkExtension.
    static let maxRoutes = 8000
    private static let cacheKey = "A7.cnRouteList.v1"

    // MARK: - Thuần logic (unit test được, không cần NetworkExtension)

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
    #endif

    // MARK: - Tải nền + nhớ đệm

    /// Danh sách đã nhớ từ lần trước (đọc đồng bộ, KHÔNG gọi mạng).
    static func cached(defaults: UserDefaults = .standard) -> [String] {
        guard let text = defaults.string(forKey: cacheKey) else { return [] }
        return parse(text)
    }

    static func store(_ cidrs: [String], defaults: UserDefaults = .standard) {
        defaults.set(cidrs.joined(separator: "\n"), forKey: cacheKey)
    }

    /// Tải danh sách ở LUỒNG NỀN rồi gọi `completion` trên hàng đợi nền. Mọi lỗi đều bị nuốt
    /// (best-effort): không có danh sách thì tunnel vẫn chạy như trước, chỉ là app TQ chưa được
    /// chia đường. TUYỆT ĐỐI không gọi trên đường connect.
    static func refresh(
        session: URLSession = .shared,
        completion: @escaping @Sendable ([String]) -> Void
    ) {
        var request = URLRequest(url: listURL)
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
