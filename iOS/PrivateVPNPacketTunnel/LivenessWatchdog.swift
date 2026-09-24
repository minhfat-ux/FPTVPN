import Foundation

/// Quyết định của watchdog "tunnel còn sống nhưng không chở gói" — chạy SUỐT phiên.
///
/// Đây là **thuần logic, KHÔNG I/O**, tách khỏi provider để test được (giống
/// `RelayHealthWatchdog` của Windows 1.4.1). Provider chỉ bơm vào hai bộ đếm gói đã có
/// (`toGo`/`fromGo` của cầu `packetFlow↔fd`) rồi thi hành `Verdict` trả về.
///
/// Vì sao dùng BẤT ĐỐI XỨNG thay vì probe HTTP như Windows: traffic của tiến trình extension
/// **KHÔNG** đi qua tunnel của nó (NetworkExtension giữ nó ở đường vật lý — đo thật 19/09/2026,
/// xem chú thích `startTrafficSupervisor` trong `HysteriaPacketTunnelProvider`), nên một probe
/// "qua tunnel" từ trong extension là vô nghĩa. Dấu hiệu hỏng đọc được từ gói THẬT của máy:
/// máy **vẫn gửi** gói vào tunnel (`toGoOffered = toGo + toGoDropped` tăng — xem `tick`) mà
/// **không có gói nào trả về** (`fromGo` đứng yên) trong `silenceLimit` giây ⇒ đường hỏng
/// (đúng dấu hiệu TCP blackhole).
///
/// Chống báo oan (bài học Windows): người dùng ngồi yên thì `toGo` cũng đứng yên ⇒ KHÔNG kết
/// luận, KHÔNG cắt VPN. Chỉ khi đồng thời "chiều về im" VÀ "máy vẫn gửi" mới tính là hỏng.
///
/// Ngưỡng mặc định bám tiêu chí **A5** (`docs/YEU_CAU_TOC_DO_ON_DINH.md`): cửa sổ im **15 s**
/// và **1 nhịp** là đủ kết luận (`strikesToRebuild = 1`) ⇒ kết luận ngay ở nhịp 15 s kế tiếp.
/// Bản Windows 1.4.1 dùng 60 s × 3 nhịp (180 s) — quá chậm so với mốc A5; `strikesToRebuild` giữ
/// lại để harness test được cả hai chế độ.
///
/// Hết trần tự dựng lại thì KHÔNG teardown (chốt 22/09/2026): chuyển sang pha **HOLD** — giữ
/// nguyên đường đã chọn, tunnel vẫn UP, `holdTick` ping lại mỗi nhịp cho tới khi có byte chiều về.
struct LivenessWatchdog {

    /// Kết quả một nhịp kiểm tra.
    enum Verdict: Equatable {
        /// Chưa đủ bằng chứng: mới lên (< `silenceLimit`), đang ramp, người dùng yên, hoặc
        /// không đọc được bộ đếm nào. Không làm gì.
        case idle
        /// Có byte chiều VỀ mới ⇒ tunnel còn chở dữ liệu; mọi strike được reset.
        case alive
        /// Chiều về im VÀ máy vẫn gửi: đã đếm thêm 1 strike (giá trị 1-based).
        case strike(Int)
        /// Đã đủ `strikesToRebuild` strike ⇒ tới hạn tự dựng lại transport.
        case rebuild
    }

    /// Kết quả một nhịp ở pha **HOLD** — chủ dự án chốt 22/09/2026: *"hết mọi đường thì dùng
    /// đường đã chọn và chờ ping tiếp thôi"* ⇒ KHÔNG `closeTun()`/teardown vì lý do tốc độ.
    enum HoldVerdict: Equatable {
        /// Chưa thấy mạng về — đã ping thêm 1 lần (giá trị 1-based).
        case waiting(Int)
        /// Chiều VỀ có byte mới ⇒ mạng đã về, quay lại STABLE.
        case networkBack
    }

    let interval: TimeInterval
    let silenceLimit: TimeInterval
    let strikesToRebuild: Int

    /// Byte chiều VỀ lần đọc trước (`fromGo`).
    private(set) var lastFromGo = 0
    /// Mốc "máy vẫn gửi" tại lần cuối tunnel còn sống — GIỮ `toGoOffered`, không phải `toGo`
    /// (xem `tick`): `toGo` chỉ đếm gói ghi THÀNH CÔNG nên đứng yên đúng lúc cầu nghẽn.
    private(set) var baselineToGo = 0
    /// Mốc `toGoOffered` của nhịp trước — dùng để ghi log DELTA khi ra quyết định.
    private(set) var lastToGoOffered = 0
    /// Lần cuối thấy byte chiều về tăng.
    private(set) var lastReturnAt: Date
    /// Số nhịp liên tiếp "im VÀ bất đối xứng" hiện tại.
    private(set) var strikes = 0
    /// Số lần đã ping trong pha HOLD hiện tại (0 = chưa ping lần nào).
    private(set) var holdPings = 0

    init(
        now: Date,
        interval: TimeInterval = 15,
        silenceLimit: TimeInterval = 15,
        strikesToRebuild: Int = 1
    ) {
        self.interval = max(1, interval)
        self.silenceLimit = max(1, silenceLimit)
        self.strikesToRebuild = max(1, strikesToRebuild)
        self.lastReturnAt = now
    }

    /// Một nhịp. `fromGo`/`toGo` là bộ đếm luỹ kế đã đi qua tunnel; `nil` = không đọc được nguồn
    /// nào (không đủ bằng chứng ⇒ `.idle`). `rampInFlight` = đang dựng lại transport để ramp
    /// băng thông ⇒ coi như đường còn tốt, không được đụng vào.
    ///
    /// `toGoDropped` (bộ đếm cầu `packetFlow↔fd`) là phần **BẮT BUỘC** của tín hiệu "máy vẫn
    /// gửi": `toGo` chỉ đếm gói `write()` THÀNH CÔNG vào fd của Go. Khi tầng Go ngừng đọc fd
    /// (đúng ca ramp dựng lại transport giữa lúc đang chở traffic, 24/09/2026) thì `write` trả
    /// lỗi ⇒ `toGo` ĐÓNG BĂNG trong khi `toGoDropped` leo liên tục (đo thật: `toGo` đứng ở
    /// 2387/5783, `toGoDropped` 13→4285 và 6→5109). Chỉ nhìn `toGo` thì watchdog tưởng "người
    /// dùng ngồi yên" và trả `.idle` MÃI MÃI — đúng lỗi "Connected nhưng mất mạng hoàn toàn"
    /// (0 dòng tự gỡ trong cả 2/2 phiên). Vì vậy tín hiệu vào đây là
    /// `toGoOffered = toGo + toGoDropped`.
    mutating func tick(
        now: Date,
        fromGo: Int?,
        toGo: Int?,
        toGoDropped: Int = 0,
        rampInFlight: Bool
    ) -> Verdict {
        guard let fromGo, let toGo else { return .idle }
        // Số âm chỉ xảy ra khi bộ đếm bị thay nguồn: kẹp về 0 để không làm mốc sai.
        let offered = toGo + max(0, toGoDropped)
        lastToGoOffered = offered
        if rampInFlight {
            noteReturn(at: now, fromGo: fromGo, toGoOffered: offered)
            return .idle
        }
        // (1) Chiều về có byte mới ⇒ tunnel sống thật.
        if fromGo > lastFromGo {
            noteReturn(at: now, fromGo: fromGo, toGoOffered: offered)
            return .alive
        }
        // (2) Chiều về đứng yên: chưa đủ dài thì chỉ là im bình thường.
        guard now.timeIntervalSince(lastReturnAt) >= silenceLimit else { return .idle }
        // (3) Máy có GỬI gì vào tunnel trong lúc im không? `toGoOffered` (kể cả gói cầu phải
        // bỏ) mới là "máy vẫn gửi"; không tăng ⇒ người dùng ngồi yên, chưa đủ bằng chứng để
        // kết luận (giữ nguyên baseline, không tăng strike).
        guard offered > baselineToGo else { return .idle }
        // (4) Im VÀ bất đối xứng ⇒ đường hỏng.
        strikes += 1
        return strikes >= strikesToRebuild ? .rebuild : .strike(strikes)
    }

    /// Reset trạng thái sau khi dựng lại transport thành công (transport mới, bộ đếm mới).
    mutating func resetAfterRebuild(now: Date, fromGo: Int, toGo: Int, toGoDropped: Int = 0) {
        noteReturn(at: now, fromGo: fromGo, toGoOffered: toGo + max(0, toGoDropped))
        holdPings = 0
    }

    // MARK: - Pha HOLD (chốt 22/09/2026: không teardown vì lý do tốc độ)

    /// Vào pha HOLD: giữ nguyên đường đã chọn, đặt lại mốc để lần có byte chiều VỀ đầu tiên
    /// được nhận đúng là "mạng về". Không bao giờ trả `.rebuild` sau đây.
    mutating func beginHold(now: Date, fromGo: Int, toGo: Int, toGoDropped: Int = 0) {
        noteReturn(at: now, fromGo: fromGo, toGoOffered: toGo + max(0, toGoDropped))
        holdPings = 0
    }

    /// Một nhịp HOLD. `fromGo`/`toGo` `nil` = không đọc được bộ đếm ⇒ vẫn tính là một lần ping
    /// (chờ mạng về), KHÔNG kết luận hỏng, KHÔNG teardown. `toGoDropped` giữ cho mốc
    /// `baselineToGo` luôn là `toGoOffered` (xem `tick`) sau khi thoát HOLD.
    mutating func holdTick(
        now: Date,
        fromGo: Int?,
        toGo: Int?,
        toGoDropped: Int = 0
    ) -> HoldVerdict {
        guard let fromGo, let toGo else {
            holdPings += 1
            return .waiting(holdPings)
        }
        // Chiều VỀ có byte mới ⇒ mạng đã về (kể cả cửa sổ im đã quá hạn).
        if fromGo > lastFromGo {
            noteReturn(at: now, fromGo: fromGo, toGoOffered: toGo + max(0, toGoDropped))
            return .networkBack
        }
        holdPings += 1
        return .waiting(holdPings)
    }

    /// `toGoOffered` = `toGo + toGoDropped`: mốc "máy vẫn gửi" thật (xem `tick`).
    private mutating func noteReturn(at now: Date, fromGo: Int, toGoOffered: Int) {
        lastFromGo = fromGo
        baselineToGo = toGoOffered
        lastReturnAt = now
        strikes = 0
    }
}

/// Luật cho **"giám sát traffic"** khi bộ đếm gói của tunnel đứng ở 0 cả hai chiều.
///
/// VÌ SAO PHẢI CÓ (lỗi thật trên máy Mac, 24/09/2026): quy tắc cũ kết luận "tunnel không có
/// mạng" chỉ vì `inPackets == 0 && outPackets == 0`, rồi **TỰ GỠ tunnel**:
///   `giám sát: QUYẾT ĐỊNH TỰ GỠ tunnel sau 280.0s — sau 280s KHÔNG có gói nào của máy đi qua
///    tunnel (cả hai chiều đều 0; relay frame gửi 11/nhận 6)`
///   `giám sát: QUYẾT ĐỊNH TỰ GỠ tunnel sau 160.0s — … (cả hai chiều đều 0; relay frame gửi 2/nhận 0)`
/// Hai bộ đếm đó là **LUỸ KẾ** và **bị reset về 0 mỗi lần cầu/transport được dựng lại** ⇒ sau một
/// lần dựng lại (ramp, tự phục hồi, H2) thì "0 gói" chỉ có nghĩa "chưa có gói MỚI", KHÔNG có
/// nghĩa "tunnel chết". Máy đang rảnh (khách không mở gì) cũng cho đúng 0 gói.
///
/// ⇒ Luật mới: **CẤM gỡ tunnel chỉ vì bộ đếm bằng 0**; phải có BẰNG CHỨNG CHỦ ĐỘNG — máy ĐANG
/// tải (interface vật lý nhích) VÀ probe thất bại liên tiếp — mới được kết luận. Máy không tải
/// thì KHÔNG kết luận gì và **đặt lại cửa sổ đánh giá**.
///
/// Hàm THUẦN (không I/O) để harness test được toàn bộ luật — xem
/// `scripts/ios-pure-logic-tests/main.swift`.
enum TrafficSupervisorPolicy {

    /// Số lần probe THẤT BẠI LIÊN TIẾP cần có mới được kết luận tunnel hỏng.
    static let idleProbeRequiredFailures = 2
    /// Hai lần probe cách nhau ≥ ngần này (tránh hai lần hỏng sát nhau do cùng một cú nghẽn).
    static let idleProbeMinSpacing: TimeInterval = 5
    /// Cửa sổ quan sát trước khi được phép kết luận (sau đó vẫn phải có probe hỏng).
    static let idleWindowS: TimeInterval = 45

    enum IdleVerdict: Equatable {
        /// Chưa/chưa cần kết luận (máy rảnh, vừa reset bộ đếm, hoặc chưa đủ cửa sổ).
        case concludeNothing
        /// Cần thêm bằng chứng chủ động (chạy probe, chờ lần sau).
        case waitForProbe
        /// Máy ĐANG tải mà tunnel vẫn 0 gói + probe hỏng liên tiếp ⇒ tunnel hỏng thật.
        case concludeTunnelDead
    }

    /// Quyết định khi `inPackets == 0 && outPackets == 0`.
    ///
    /// - Parameters:
    ///   - tunnelCarriedNothing: cả hai chiều của tunnel đều 0 (luỹ kế).
    ///   - machineActive: interface VẬT LÝ (en0) có nhích byte trong nhịp vừa rồi ⇒ máy đang tải.
    ///   - consecutiveProbeFailures: số lần probe NGOÀI tunnel hỏng LIÊN TIẾP.
    ///   - secondsSinceWindowStart: đã bao lâu kể từ khi cửa sổ đánh giá hiện tại bắt đầu.
    ///   - countersJustReset: bộ đếm vừa TỤT (cầu/transport mới) ở chính nhịp này.
    static func idleVerdict(
        tunnelCarriedNothing: Bool,
        machineActive: Bool,
        consecutiveProbeFailures: Int,
        secondsSinceWindowStart: TimeInterval,
        countersJustReset: Bool
    ) -> IdleVerdict {
        // Có gói qua tunnel ⇒ không phải ca này (mọi luật khác giữ nguyên).
        guard tunnelCarriedNothing else { return .concludeNothing }
        // (5) Vừa reset bộ đếm ⇒ cửa sổ đánh giá PHẢI bắt đầu lại, không kết luận từ số 0 mới.
        guard !countersJustReset else { return .concludeNothing }
        // (4) Máy KHÔNG tải ⇒ không có gì bất thường để kết luận (khách đang rảnh).
        guard machineActive else { return .concludeNothing }
        // Chưa đủ cửa sổ quan sát ⇒ chờ (tránh kết luận ngay sau khi tunnel vừa lên).
        guard secondsSinceWindowStart >= idleWindowS else { return .concludeNothing }
        // (2) Phải có bằng chứng chủ động: probe hỏng LIÊN TIẾP đủ số lần.
        guard consecutiveProbeFailures >= idleProbeRequiredFailures else { return .waitForProbe }
        return .concludeTunnelDead
    }
}

/// Luật cho phép **nâng số khai theo SỐ ĐO ĐƯỜNG THẬT (pre-measure NGOÀI tunnel)** và **CẤM hạ
/// khai chỉ vì goodput thấp**.
///
/// VÌ SAO (lỗi thật 24/09/2026, 16:00): goodput đo QUA tunnel không bao giờ vượt chính số khai
/// (Brutal CC pace theo số client khai). Nên khi số khai đã bị hạ, `observed ≈ declared` ⇒ cổng
/// ramp-up (`observed ≥ 1,15 × declared`) **không bao giờ mở** ⇒ KẸT VĨNH VIỄN ở mức thấp, tự
/// ghìm tốc độ (đo được: `declared down=1621` ⇒ tải đúng 161 KB/s ≈ 1,29 Mbps) cho tới khi khách
/// Connect lại. Muốn thoát phải đo **đường thật** (socket extension KHÔNG đi qua tunnel).
///
/// Hàm THUẦN — có test ở `scripts/ios-pure-logic-tests/main.swift`.
enum RawLinePolicy {
    /// Đo thật ≥ 1,3 × số khai ⇒ đường còn dư thật ⇒ cho nâng (không phụ thuộc goodput tunnel).
    static let upRatio = 1.3
    /// Số khai mới ≈ 0,85 × số đo thật (giữ đúng tỉ lệ Android).
    static let declareRatioPct = 85
    /// KHÔNG bao giờ để số khai thấp hơn 0,85 × số đo đường thật MỚI.
    static let floorRatioPct = 85
    /// Trước khi HẠ: `best ≥ 2 × declared` ⇒ cấm hạ, phải đo lại đường thật trước.
    static let bestGuardRatio = 2.0
    /// Ngưỡng "gói bị bỏ vì hàng đợi" (‰ của gói đưa vào) ⇒ bằng chứng NGHẼN.
    static let congestedDropPerMille = 5
    /// Đang sát trần (observed ≥ 0,9 × declared) ⇒ đo lại đường thật mỗi 60 s.
    static let nearCeilingRatio = 0.9
    static let probeNearCeilingS: TimeInterval = 60
    /// Rảnh ⇒ đo lại thưa hơn (120 s) để không tốn data/pin.
    static let probeIdleS: TimeInterval = 120

    enum DownDecision: Equatable {
        case allow
        /// (ii) CỔNG CHÍNH: đo-đường-thật ≥ số khai ⇒ CẤM hạ (goodput thấp là do Brutal ghìm
        /// hoặc khách tự giới hạn, KHÔNG phải đường yếu).
        case refuseRawLineHigh
        /// (i) Cổng phụ (chỉ khi KHÔNG có rawline mới): không có bất đối xứng thật ⇒ để nguyên.
        case refuseNoCongestion
        /// Mới 1/2 lần đo đường thật thấp liên tiếp ⇒ bỏ qua lần này (chống khựng do nhấp nhô).
        case refuseNeedSecondSample
        /// `best ≥ 2 × declared` ⇒ số khai đang sai vì bị hạ, không phải đường yếu.
        case refuseBestGuard
    }

    /// Số đo rawline còn được coi là MỚI trong ngần này (quá ⇒ phải đo lại trước khi hạ).
    static let rawLineFreshS: TimeInterval = 300

    /// Quyết định có được HẠ số khai — thứ tự theo chốt 24/09/2026:
    ///   1. `best ≥ 2 × declared` ⇒ cấm hạ;
    ///   2. có rawline MỚI ⇒ `rawline ≥ declared` thì **CẤM hạ** (cổng chính ii); `rawline < declared`
    ///      thì **cho hạ** (đường thật đúng là yếu hơn số khai);
    ///   3. rawline cũ/chưa đo ⇒ mới xét **bất đối xứng thật** (i): gói về đứng trong khi máy vẫn
    ///      gửi gói mới. KHÔNG dùng `toGoDropped/toGoOffered` (khách `--limit-rate` làm hàng đợi
    ///      phía máy bỏ gói ⇒ tín hiệu GIẢ).
    /// Số lần đo rawline LIÊN TIẾP (cách nhau ≥60 s) phải đều thấp hơn số khai mới cho hạ.
    static let lowRawLineSamplesRequired = 2
    /// Hai lần đo "thấp" phải cách nhau ≥ ngần này mới tính là liên tiếp.
    static let lowRawLineMinSpacing: TimeInterval = 60

    static func downRampAllowed(
        rawLineKbps: Int,
        rawLineAge: TimeInterval,
        consecutiveLowRawLine: Int,
        asymmetryEvidence: Bool,
        bestKbps: Int,
        declaredKbps: Int
    ) -> DownDecision {
        if bestKbps > 0, Double(bestKbps) >= Double(declaredKbps) * bestGuardRatio {
            return .refuseBestGuard
        }
        if rawLineKbps > 0, rawLineAge <= rawLineFreshS {
            guard rawLineKbps < declaredKbps else { return .refuseRawLineHigh }
            // Chống dao động: một lần rơi tạm thời KHÔNG đủ để khựng đường (mỗi lần hạ là một
            // lần `retarget` ~1,5 s).
            return consecutiveLowRawLine >= lowRawLineSamplesRequired
                ? .allow
                : .refuseNeedSecondSample
        }
        return asymmetryEvidence ? .allow : .refuseNoCongestion
    }

    /// Số khai MỚI khi đo được đường thật nhanh hơn hẳn số đang khai (`nil` = chưa cần nâng).
    static func rawLineUpTarget(measuredRealKbps: Int, declaredKbps: Int) -> Int? {
        guard declaredKbps > 0, measuredRealKbps > 0 else { return nil }
        guard Double(measuredRealKbps) >= Double(declaredKbps) * upRatio else { return nil }
        return measuredRealKbps * declareRatioPct / 100
    }

    /// SÀN theo đường thật: số khai không được thấp hơn mức này khi phép đo còn mới.
    static func floorKbps(measuredRealKbps: Int) -> Int {
        guard measuredRealKbps > 0 else { return 0 }
        return measuredRealKbps * floorRatioPct / 100
    }

    /// Có nên đo lại đường thật (pre-measure) lúc này không.
    static func shouldProbe(
        observedKbps: Int, declaredKbps: Int, sinceLastProbe: TimeInterval, idle: Bool
    ) -> Bool {
        guard sinceLastProbe > 0 else { return true }
        let nearCeiling = declaredKbps > 0
            && Double(observedKbps) >= Double(declaredKbps) * nearCeilingRatio
        if nearCeiling, sinceLastProbe >= probeNearCeilingS { return true }
        if idle, sinceLastProbe >= probeIdleS { return true }
        return false
    }

    /// (i) BẤT ĐỐI XỨNG THẬT: máy VẪN gửi gói mới mà KHÔNG có gói nào về trong nhịp vừa rồi.
    static func asymmetryEvidence(deltaOffered: Int, deltaFromGo: Int) -> Bool {
        deltaOffered > 0 && deltaFromGo == 0
    }
}
