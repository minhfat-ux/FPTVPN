// Công cụ dòng lệnh để CHẠY THẬT bộ phát hiện xung đột mạng của bản macOS trên máy đang dùng.
//
// Vì sao có file này: `NetworkConflictDetector` là logic thuần (harness `ios-pure-logic-tests` lo
// phần test), còn `NetworkConflictProbe` phải đọc trạng thái máy thật (VPN preferences, tiến trình,
// proxy, default route, DNS). Muốn có BẰNG CHỨNG trên máy thật — ví dụ "Tailscale đang chạy nền
// nhưng chưa Connected ⇒ Warning" — thì cần một chỗ gọi thẳng hai file production đó.
//
// KHÔNG nằm trong target app (`mac/PrivateVPNMac` được include cả thư mục) nên không ảnh hưởng build.
//
// Chạy:
//   swiftc -O mac/PrivateVPNMac/NetworkConflictDetector.swift \
//            mac/PrivateVPNMac/NetworkConflictProbe.swift \
//            iOS/PrivateVPN/Services/HysteriaDefaults.swift \
//            mac/tools/network-conflict-probe/main.swift -o /tmp/net-conflict-probe
//   /tmp/net-conflict-probe            # đo cả DNS
//   /tmp/net-conflict-probe --skip-dns # bỏ phép đo DNS (nhanh, không gửi gói ra ngoài)
//   /tmp/net-conflict-probe --probe-dns 202.96.134.133,114.114.114.114   # đo reachability thủ công

import Foundation

let arguments = CommandLine.arguments
let skipDNS = arguments.contains("--skip-dns")

// Đo reachability cho resolver chỉ định (bằng chứng cho ca thật "DNS nhà mạng không tới được").
if let index = arguments.firstIndex(of: "--probe-dns"), index + 1 < arguments.count {
    for server in arguments[index + 1].split(separator: ",") {
        let value = String(server)
        let answers = NetworkConflictProbe.dnsServerAnswers(value)
        print("DNS \(value): \(answers ? "CÓ trả lời" : "KHÔNG trả lời (timeout \(NetworkConflictProbe.dnsProbeTimeoutMS) ms)")")
    }
    exit(0)
}

print("=== VPNFlow — phát hiện xung đột mạng trên macOS ===")
print("thời điểm: \(ISO8601DateFormatter().string(from: Date()))")

let inputs = await NetworkConflictProbe.capture(probeDNS: !skipDNS)

print("\n--- dữ liệu thô ---")
print("cấu hình VPN đọc được (loadAllFromPreferences): \(inputs.vpnConfigurations.count)")
for configuration in inputs.vpnConfigurations {
    print("  · \(configuration.localizedDescription) [\(configuration.providerBundleIdentifier)] connected=\(configuration.isConnected)")
}
print("proxy hệ thống: enabled=\(inputs.systemProxyEnabled) server=\(inputs.systemProxyServer ?? "—")")
for interface in inputs.interfaces where interface.hasDefaultRouteV4 || interface.hasDefaultRouteV6 || interface.isTunnelType {
    print("  iface \(interface.name) tunnel=\(interface.isTunnelType) own=\(interface.isOwn) defaultV4=\(interface.hasDefaultRouteV4) defaultV6=\(interface.hasDefaultRouteV6) gw=\(interface.gatewayV4 ?? "—")")
}
print("DNS toàn cục: \(inputs.dns.servers.joined(separator: ", "))")
print("DNS tunnel: \(inputs.dns.tunnelServers.joined(separator: ", ")) tunnelActive=\(inputs.dns.isTunnelActive)")
print("DNS không trả lời: \(inputs.dns.unreachableServers.isEmpty ? "—" : inputs.dns.unreachableServers.joined(separator: ", "))")
print("search domain: \(inputs.dns.searchDomains.isEmpty ? "—" : inputs.dns.searchDomains.joined(separator: ", "))")
print("tiến trình (đã lọc theo danh sách VPN/proxy):")
let matched = Set(inputs.runningProcessNames.filter { NetworkConflictDetector.isKnownProxyProcess($0) })
if matched.isEmpty {
    print("  — không có")
} else {
    for name in matched.sorted() {
        print("  · \(name)  →  \(NetworkConflictDetector.displayName(for: name))")
    }
}

let conflicts = NetworkConflictDetector.analyze(inputs)
print("\n--- kết quả ---")
if conflicts.isEmpty {
    print("không phát hiện phần mềm mạng nào tranh chấp")
} else {
    for conflict in conflicts {
        print("[\(conflict.severity.label)] \(conflict.title)")
        print("    detail: \(conflict.detail)")
        print("    advice: \(conflict.advice)")
        print("    facts : \(conflict.facts.joined(separator: " · "))")
    }
}
print("\nconflict: \(NetworkConflictDetector.summary(for: conflicts))")
exit(0)
