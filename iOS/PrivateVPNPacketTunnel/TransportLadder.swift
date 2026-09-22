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
    /// Cho phép dùng bậc WS relay của node KHÁC. Chủ dự án chốt 22/09/2026: **CÓ** — node khác là
    /// một bậc HỢP LỆ của thang (không chỉ dùng khi node hiện tại chết).
    var allowsOtherNodeRungs: Bool = true
    /// Chốt chặn §4.1(1): bậc node khác chỉ được lên khi KÊNH DÒ chứng minh node đó nhanh hơn
    /// ≥1,25× ở 2 lần liên tiếp — mặc định BẬT để không nhảy node theo cảm tính.
    var requiresProbeProofForOtherNode: Bool = true
    /// Node khách đã chọn (ưu tiên, §4.1(2)) — để so sánh/quay về.
    var priorityNodeID: String?

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
    /// Node đã được kênh dò chứng minh đủ lợi (≥1,25× ×2) — điều kiện mở bậc node khác.
    private(set) var provenNodes: Set<String> = []

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
        if path.kind == .wsRelayOtherNode { provenNodes.insert(path.nodeID) }
    }

    /// Đánh dấu node đã được kênh dò chứng minh lợi (≥1,25× ×2) ⇒ mở bậc node khác (§4.1(1)).
    mutating func markProven(nodeID: String) {
        provenNodes.insert(nodeID)
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
            if !tried.contains(candidate), canUseRung(rungs[candidate]) { return candidate }
            candidate += 1
        }
        return nil
    }

    /// Bậc node khác chỉ dùng được khi kênh dò đã chứng minh (§4.1(1)); bậc cùng node luôn dùng được.
    private func canUseRung(_ path: TransportPath) -> Bool {
        guard options.requiresProbeProofForOtherNode else { return true }
        guard path.kind == .wsRelayOtherNode else { return true }
        return provenNodes.contains(path.nodeID)
    }

    private static func deduped(_ rungs: [TransportPath]) -> [TransportPath] {
        var seen = Set<TransportPath>()
        return rungs.filter { seen.insert($0).inserted }
    }
}

/// Chốt chặn khi nâng cấp sang NODE khác — chủ dự án chốt 22/09/2026 ("được phép nâng cấp sang
/// node tốt hơn", kèm 4 chốt chặn ở §4.1 của `docs/DEV_PLAN_IOS_MACOS_TOC_DO.md`).
///
/// Thuần logic, KHÔNG I/O: nhận kết quả từng lần dò (`goodput node ứng viên / goodput phiên
/// chính`) và quyết định `stay` / `upgrade` / `returnToPriority`. Việc mở transport để dò nằm ở
/// `ProbeChannel`; kết quả đủ điều kiện thì gọi `TransportLadder.markProven(nodeID:)`.
struct NodeUpgradePolicy: Equatable {

    enum Decision: Equatable {
        /// Giữ nguyên node đang chạy.
        case stay
        /// Lên bậc node khác — đã đủ `consecutiveProbesRequired` lần liên tiếp nhanh hơn ≥ ngưỡng.
        case upgrade(nodeID: String)
        /// Node khách đã chọn sống lại và ngang bằng ⇒ quay về node đó (§4.1(2)).
        case returnToPriority(nodeID: String)
    }

    /// Ngưỡng lợi bắt buộc: node khác phải nhanh hơn ≥ ngần này lần (mặc định 1,25×).
    let gainThreshold: Double
    /// Số lần dò LIÊN TIẾP phải đạt ngưỡng mới được đổi node (mặc định 2).
    let consecutiveProbesRequired: Int
    /// Node khách đã chọn — ưu tiên; sống lại và ngang bằng ⇒ quay về.
    let priorityNodeID: String?
    /// Mức coi là "ngang bằng" khi xét quay về node ưu tiên (1,0 = không chậm hơn phiên chính).
    let priorityParityFloor: Double

    /// Số lần LIÊN TIẾP đã đạt ngưỡng, đếm riêng theo từng node ứng viên.
    private var streaks: [String: Int] = [:]

    init(
        gainThreshold: Double = 1.25,
        consecutiveProbesRequired: Int = 2,
        priorityNodeID: String? = nil,
        priorityParityFloor: Double = 1.0
    ) {
        self.gainThreshold = max(1.0, gainThreshold)
        self.consecutiveProbesRequired = max(1, consecutiveProbesRequired)
        self.priorityNodeID = priorityNodeID
        self.priorityParityFloor = priorityParityFloor
    }

    /// Ghi một lần dò. `currentNodeID` = node phiên chính đang chạy; `candidateNodeID` = node vừa
    /// dò; `speedVsCurrent` = goodput dò / goodput phiên chính (≤0 = không đo được ⇒ coi như không lợi).
    mutating func recordProbe(
        candidateNodeID: String,
        speedVsCurrent: Double,
        currentNodeID: String?
    ) -> Decision {
        guard candidateNodeID != currentNodeID else {
            streaks[candidateNodeID] = nil
            return .stay
        }
        // (2) Node khách chọn sống lại và ngang bằng ⇒ quay về, không cần đủ 2 lần.
        if let priorityNodeID, candidateNodeID == priorityNodeID,
           speedVsCurrent >= priorityParityFloor {
            streaks[candidateNodeID] = nil
            return .returnToPriority(nodeID: candidateNodeID)
        }
        // (1) Chỉ lên bậc node khác khi đạt ≥ ngưỡng ở 2 lần LIÊN TIẾP.
        if speedVsCurrent >= gainThreshold {
            let next = (streaks[candidateNodeID] ?? 0) + 1
            if next >= consecutiveProbesRequired {
                streaks[candidateNodeID] = nil
                return .upgrade(nodeID: candidateNodeID)
            }
            streaks[candidateNodeID] = next
            return .stay
        }
        // Không đạt ngưỡng (hoặc đo được chậm hơn) ⇒ đứt chuỗi liên tiếp.
        streaks[candidateNodeID] = nil
        return .stay
    }
}

private extension TransportPathKind {
    /// Vị trí trong thang bậc — dùng để sắp xếp mà không phụ thuộc ord của enum.
    var allCasesIndex: Int {
        TransportPathKind.allCases.firstIndex(of: self) ?? 0
    }
}
