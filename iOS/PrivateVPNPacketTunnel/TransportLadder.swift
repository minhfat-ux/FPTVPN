import Foundation

/// Bậc đường trong thang nâng cấp tốc độ (yêu cầu §2c / A1).
///
/// **Vì sao nâng tốc bằng ĐƯỜNG chứ không bằng số khai Brutal**: `docs/YEU_CAU_TOC_DO_ON_DINH.md`
/// §3.1 đã đo — server bật `ignoreClientBandwidth: true`, nên nâng số khai (3,8 → 12–13 Mbps)
/// KHÔNG làm tải nhanh hơn. Thứ tự bậc dưới đây là thứ tự thử khi goodput thấp.
///
/// Thuần logic, KHÔNG I/O: file này không `import NetworkExtension`/`Hysteria`, chỉ mô tả thang
/// bậc để unit test được (cả `swiftc` harness lẫn target `PrivateVPNTests`). Provider ánh xạ
/// `TransportPath` → `HysteriaTransport.Options` ở tầng dưới.
enum TransportPathKind: String, CaseIterable, Sendable {
    /// QUIC/UDP trực tiếp tới node — nhanh nhất khi nhà mạng không chặn UDP.
    case quicDirect = "quic-direct"
    /// Relay TCP tới CÙNG node — qua được mạng chặn UDP, chậm hơn QUIC.
    case tcpRelay = "tcp-relay"
    /// WS relay của node KHÁC — qua được cả khi IP node bị chặn, chậm nhất.
    /// ⚠️ Đổi node giữa phiên ảnh hưởng quota/IP thoát của khách ⇒ chỉ bật khi chủ dự án chốt
    /// câu hỏi §7.3 của kế hoạch (`TransportLadderOptions.allowsOtherNodeRungs`).
    case wsRelayOtherNode = "ws-relay-node-khac"
}

/// Một bậc đường cụ thể: loại + node + đích kết nối.
///
/// `relayURL` chỉ có nghĩa với các bậc relay; `host`/`port` là đích QUIC/TCP của node.
struct TransportPath: Equatable, Hashable, Sendable {
    let kind: TransportPathKind
    let nodeID: String
    let host: String
    let port: UInt16
    let relayURL: URL?

    var label: String { "\(kind.rawValue)@\(nodeID)" }

    init(kind: TransportPathKind, nodeID: String, host: String, port: UInt16, relayURL: URL? = nil) {
        self.kind = kind
        self.nodeID = nodeID
        self.host = host
        self.port = port
        self.relayURL = relayURL
    }
}

/// Node đầu vào để dựng thang bậc mặc định.
struct TransportLadderNode: Equatable, Sendable {
    let nodeID: String
    let host: String
    let quicPort: UInt16
    /// Cổng relay TCP của node (rỗng = node không có bậc TCP).
    let tcpRelayPort: UInt16?
    /// WS relay của node — chỉ dùng cho node KHÁC (A6).
    let wsRelayURL: URL?

    init(nodeID: String, host: String, quicPort: UInt16, tcpRelayPort: UInt16? = nil, wsRelayURL: URL? = nil) {
        self.nodeID = nodeID
        self.host = host
        self.quicPort = quicPort
        self.tcpRelayPort = tcpRelayPort
        self.wsRelayURL = wsRelayURL
    }
}

/// Cấu hình thang bậc — tách riêng để câu hỏi mở §7.3 (được đổi node khác không) là một CỜ,
/// không phải một quyết định ẩn trong code.
struct TransportLadderOptions: Equatable, Sendable {
    /// Trần số lần nâng bậc trong MỘT phiên (yêu cầu A4: ≤1 lần dựng lại/30 phút; trần ramp 3).
    var maxRampUps: Int = 3
    /// Cho phép dùng bậc WS relay của node KHÁC. Mặc định TẮT cho tới khi chủ dự án chốt.
    var allowsOtherNodeRungs: Bool = false

    static let `default` = TransportLadderOptions()
}

/// Thang nâng cấp đường: **một chiều** (chỉ đi lên theo thứ tự bậc), nhớ bậc tốt nhất đã đạt
/// (A3 — "khoá ở mức đã đạt") và có trần số lần nâng (A4).
///
/// Dùng:
/// ```
/// var ladder = TransportLadder(rungs: TransportLadder.canonicalRungs(primary: n1, others: [n2]))
/// _ = ladder.restore()                    // phiên mới: bắt đầu ở bậc đã nhớ
/// if goodputKbps < 8_000 { _ = ladder.nextPath(after: ladder.current) }
/// ladder.remember(good: ladder.current!)  // chốt bậc đang chạy là "đã đạt"
/// ```
struct TransportLadder {

    /// Thang bậc theo đúng thứ tự sẽ thử (đã lọc + sắp theo `TransportPathKind`).
    let rungs: [TransportPath]
    let options: TransportLadderOptions

    /// Chỉ số bậc đang chạy (`nil` = thang rỗng).
    private(set) var currentIndex: Int?
    /// Các bậc đã thử trong phiên — không thử lại (một chiều).
    private(set) var tried: Set<Int> = []
    /// Số lần đã nâng bậc trong phiên.
    private(set) var rampUps = 0
    /// Bậc tốt nhất đã đạt, nhớ để phiên sau bắt đầu từ đó (A3).
    private(set) var rememberedIndex: Int?

    init(rungs: [TransportPath], options: TransportLadderOptions = .default) {
        // Giữ thứ tự người gọi đưa, nhưng luôn xếp theo thứ tự bậc chuẩn (quic → tcp → ws) để
        // không bao giờ "nâng cấp" ngược.
        let deduped = Self.deduped(rungs)
        self.rungs = deduped.sorted { lhs, rhs in
            let lhsOrder = lhs.kind.allCasesIndex
            let rhsOrder = rhs.kind.allCasesIndex
            if lhsOrder != rhsOrder { return lhsOrder < rhsOrder }
            return false // giữ nguyên thứ tự tương đối trong cùng một loại (sort ổn định)
        }
        self.options = options
        self.currentIndex = self.rungs.isEmpty ? nil : 0
        self.tried = self.rungs.isEmpty ? [] : [0]
    }

    // MARK: - Truy vấn

    var current: TransportPath? {
        guard let currentIndex, rungs.indices.contains(currentIndex) else { return nil }
        return rungs[currentIndex]
    }

    /// Bậc đã nhớ (A3) — `nil` nếu chưa từng chốt bậc nào.
    var remembered: TransportPath? {
        guard let rememberedIndex, rungs.indices.contains(rememberedIndex) else { return nil }
        return rungs[rememberedIndex]
    }

    /// Còn bậc nào để nâng không (và chưa quá trần)?
    var canAdvance: Bool {
        guard rampUps < options.maxRampUps else { return false }
        return nextUntriedIndex(after: currentIndex ?? -1) != nil
    }

    // MARK: - Hàm thuần (mutating nhưng KHÔNG I/O)

    /// Bậc kế tiếp SAU `path`, một chiều, bỏ qua bậc đã thử. `nil` = hết thang ⇒ giữ STABLE ở
    /// mức thấp nhất đạt được (đúng tinh thần câu hỏi mở §7.2).
    mutating func nextPath(after path: TransportPath?) -> TransportPath? {
        guard rampUps < options.maxRampUps else { return nil }
        let from = path.flatMap { rungs.firstIndex(of: $0) } ?? (currentIndex ?? -1)
        guard let candidate = nextUntriedIndex(after: from) else { return nil }
        tried.insert(candidate)
        currentIndex = candidate
        rampUps += 1
        return rungs[candidate]
    }

    /// Chốt bậc đang chạy là "đã đạt" ⇒ phiên sau bắt đầu từ đây (A3).
    mutating func remember(good path: TransportPath) {
        guard let idx = rungs.firstIndex(of: path) else { return }
        rememberedIndex = idx
        tried.insert(idx)
    }

    /// Quay về bậc đã nhớ (đầu phiên hoặc sau khi DEGRADED phục hồi).
    mutating func restore() -> TransportPath? {
        guard let idx = rememberedIndex, rungs.indices.contains(idx) else { return current }
        currentIndex = idx
        tried.insert(idx)
        return rungs[idx]
    }

    /// Xoá trạng thái một phiên (giữ bậc đã nhớ — đó là kiến thức giữa các phiên).
    mutating func reset() {
        rampUps = 0
        tried = currentIndex.map { [$0] } ?? []
    }

    // MARK: - Dựng thang mặc định

    /// Thang bậc chuẩn: QUIC trực tiếp → TCP relay (cùng node) → WS relay (node khác).
    ///
    /// Bậc node khác chỉ được thêm khi `options.allowsOtherNodeRungs` (mặc định TẮT — câu hỏi mở
    /// §7.3 của kế hoạch: đổi node giữa phiên ảnh hưởng quota + IP thoát của khách).
    static func canonicalRungs(
        primary: TransportLadderNode,
        others: [TransportLadderNode] = [],
        options: TransportLadderOptions = .default
    ) -> [TransportPath] {
        var rungs: [TransportPath] = [
            TransportPath(
                kind: .quicDirect,
                nodeID: primary.nodeID,
                host: primary.host,
                port: primary.quicPort
            )
        ]
        if let tcpPort = primary.tcpRelayPort {
            rungs.append(
                TransportPath(
                    kind: .tcpRelay,
                    nodeID: primary.nodeID,
                    host: primary.host,
                    port: tcpPort
                )
            )
        }
        if options.allowsOtherNodeRungs {
            for node in others {
                guard let url = node.wsRelayURL else { continue }
                rungs.append(
                    TransportPath(
                        kind: .wsRelayOtherNode,
                        nodeID: node.nodeID,
                        host: node.host,
                        port: node.quicPort,
                        relayURL: url
                    )
                )
            }
        }
        return rungs
    }

    // MARK: - Nội bộ

    private func nextUntriedIndex(after index: Int) -> Int? {
        var candidate = index + 1
        while candidate < rungs.count {
            if !tried.contains(candidate) { return candidate }
            candidate += 1
        }
        return nil
    }

    private static func deduped(_ rungs: [TransportPath]) -> [TransportPath] {
        var seen = Set<TransportPath>()
        return rungs.filter { seen.insert($0).inserted }
    }
}

private extension TransportPathKind {
    /// Vị trí trong thang bậc — dùng để sắp xếp mà không phụ thuộc ord của enum.
    var allCasesIndex: Int {
        TransportPathKind.allCases.firstIndex(of: self) ?? 0
    }
}
