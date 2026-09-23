import Foundation

/// A10 (§2g) + A11 (§2h) — logic THUẦN cho số hiển thị trên thẻ Diagnostics và luật khai báo
/// an toàn. Tách khỏi `HysteriaBandwidthControl` (đụng NetworkExtension/UserDefaults) để harness
/// `swiftc` chạy được: xem `scripts/ios-pure-logic-tests/run.sh`.
///
/// Nguồn: `docs/YEU_CAU_TOC_DO_ON_DINH.md` §2g (hiện số live + trạng thái ramp) và §2h
/// (khai báo an toàn trước, ramp sau). Bản đồ thi công: `docs/DEV_PLAN_IOS_MACOS_TOC_DO.md`
/// §5b bước 1e (A10) / 1f (A11).
enum RampStatus {

    // MARK: - Mốc & ngưỡng (§2g/§2h)

    /// Mốc Full HD dùng thống nhất cho mọi nền tảng: 8 Mbps duy trì.
    static let fullHDKbps = 8_000
    /// Hệ số ramp mặc định khi tính "mục tiêu kế tiếp" (§2g: min(đo được × hệ số ramp, trần)).
    /// `BandwidthControl.rampFactor` trỏ về đây để chỉ có MỘT nguồn sự thật.
    static let rampFactor = 1.25
    /// "Đã tối đa ở thời điểm này" khi số đo đạt ≥95% trần sức mạng (§2g).
    static let atMaxCeilingRatio = 0.95

    /// Khai báo an toàn = số đo × 0,8 (§2h luật 1). Trùng `declareRatioPct` của
    /// `BandwidthControl`; để ở đây làm mốc duy nhất cho cả hai file.
    static let declareRatioPct = 80
    /// Khởi điểm tối đa khi đường đang loss cao: ≤ 4 Mbps down / 1 Mbps up (§2h luật 1).
    static let highLossStartDownKbps = 4_000
    static let highLossStartUpKbps = 1_000
    /// Tỉ lệ số nhớ dùng làm khởi điểm khi CHƯA có số đo tươi (§2h luật 1).
    static let memoryStartRatioPct = 60

    /// Loss coi là "cao": CẤM ramp lên (§2h luật 2) và buộc hạ khai (§2h luật 3).
    static let highLossPercent = 30.0
    /// Loss coi là "thấp": chỉ ramp khi dưới mức này.
    static let lowLossPercent = 5.0
    /// Goodput phải chứng minh LIÊN TIẾP ngần này lần mới cho ramp lên (§2h luật 2).
    static let rampProofsRequired = 2
    /// Hạ khai phải áp trong ≤15 s (§2h luật 3): trần chờ tunnel rảnh trước khi buộc dựng lại.
    static let downRampForceSeconds: TimeInterval = 15

    // MARK: - A11: khai báo an toàn trước

    /// Kết quả chốt số khai khởi điểm. `reason` in ra telemetry (`bw: … reason=…`).
    struct Declaration: Equatable {
        var upKbps: Int
        var downKbps: Int
        /// "measured" | "memory" | "static" | "high-loss".
        var reason: String
        /// Có phải khởi điểm bị hạ vì loss cao không (để log rõ §2h luật 1).
        var highLoss: Bool { reason == "high-loss" }
    }

    /// Khởi điểm KHÔNG BAO GIỜ VỐNG (§2h luật 1):
    ///   * có số đo thật ⇒ `đo được × 0,8`;
    ///   * chưa có số đo ⇒ `min(nấc tĩnh, số nhớ × 0,6)`;
    ///   * đường đang loss cao ⇒ **bỏ `best` cũ**, khởi điểm ≤ 4 Mbps down / 1 Mbps up.
    ///
    /// Hàm THUẦN: mọi đầu vào là số, không đọc bộ nhớ/thiết bị.
    static func safeDeclaration(
        measuredDownKbps: Int,
        rememberedDownKbps: Int,
        staticDownKbps: Int,
        staticUpKbps: Int,
        highLoss: Bool
    ) -> Declaration {
        let down: Int
        let reason: String
        if measuredDownKbps > 0 {
            down = measuredDownKbps * declareRatioPct / 100
            reason = "measured"
        } else if rememberedDownKbps > 0 {
            down = min(staticDownKbps, rememberedDownKbps * memoryStartRatioPct / 100)
            reason = "memory"
        } else {
            down = staticDownKbps
            reason = "static"
        }
        // Chiều lên suy từ chiều xuống theo đúng tỉ lệ nấc tĩnh (30/100) — phép đo chỉ có
        // chiều xuống, giữ nguyên độ bất đối xứng đã đo tốt.
        let ratio = max(staticDownKbps, 1)
        let up = down * staticUpKbps / ratio
        if highLoss {
            // Loss cao ⇒ CẤM khởi điểm vống: bỏ "best" cũ, kẹp trần an toàn 4/1 Mbps.
            return Declaration(
                upKbps: min(up, highLossStartUpKbps),
                downKbps: min(down, highLossStartDownKbps),
                reason: "high-loss"
            )
        }
        return Declaration(upKbps: max(up, 0), downKbps: max(down, 0), reason: reason)
    }

    /// Có được phép RAMP LÊN không (§2h luật 2): loss phải **thấp** (`< lowLossPercent`) VÀ
    /// goodput đã chứng minh `rampProofsRequired` lần liên tiếp. Loss cao ⇒ CẤM dù goodput
    /// trông cao; dải giữa (5–30%) cũng chưa đủ tin để ramp.
    static func canRampUp(lossPercent: Double, consecutiveProofs: Int) -> Bool {
        lossPercent < lowLossPercent && consecutiveProofs >= rampProofsRequired
    }

    /// Loss có buộc HẠ khai ngay không (§2h luật 3).
    static func requiresDownRamp(lossPercent: Double) -> Bool {
        lossPercent >= highLossPercent
    }

    // MARK: - A10: số hiển thị trên thẻ Diagnostics

    /// Định dạng tốc độ theo §2g luật 2: `—` khi chưa có số (KHÔNG hiện `0`), dưới 1 Mbps hiện
    /// kbps, từ 1 Mbps hiện Mbps 1 chữ số thập phân.
    static func formatRate(_ kbps: Int?) -> String {
        guard let kbps, kbps > 0 else { return "—" }
        if kbps < 1_000 { return "\(kbps) kbps" }
        return String(format: "%.1f Mbps", Double(kbps) / 1_000)
    }

    /// Số khai còn lên được, tính theo §2g:
    /// `(mục tiêu kế tiếp / khai báo − 1) × 100`, mục tiêu = `min(đo được × hệ số ramp, trần)`.
    /// Trả `nil` khi **không có** headroom dương (mục tiêu ≤ khai báo) hoặc chưa tính được —
    /// UI hiện `—`, không hứa "+0%" gây hiểu nhầm.
    static func morePercent(observedKbps: Int, declaredDownKbps: Int, ceilingKbps: Int?) -> Int? {
        guard observedKbps > 0, declaredDownKbps > 0 else { return nil }
        let target = nextTargetKbps(
            observedKbps: observedKbps,
            ceilingKbps: ceilingKbps,
            rampFactor: rampFactor
        )
        guard let target else { return nil }
        let pct = (Double(target) / Double(declaredDownKbps) - 1.0) * 100.0
        guard pct > 0 else { return nil }
        return Int(pct.rounded())
    }

    /// Mục tiêu kế tiếp = `min(đo được × hệ số ramp, trần sức mạng)` (§2g). `nil` khi chưa đo.
    static func nextTargetKbps(observedKbps: Int, ceilingKbps: Int?, rampFactor: Double) -> Int? {
        guard observedKbps > 0 else { return nil }
        let target = Int(Double(observedKbps) * rampFactor)
        if let ceilingKbps, ceilingKbps > 0 { return min(target, ceilingKbps) }
        return target
    }

    /// `Đã tối đa ở thời điểm này` khi số đo ≥95% trần, HOẶC kênh dò §2c vừa kết luận `no gain`.
    static func isAtMax(observedKbps: Int, ceilingKbps: Int?, probeNoGain: Bool) -> Bool {
        if probeNoGain { return true }
        guard let ceilingKbps, ceilingKbps > 0 else { return false }
        return Double(observedKbps) >= Double(ceilingKbps) * atMaxCeilingRatio
    }

    /// Toàn bộ số của thẻ Diagnostics. Mọi trường `nil` ⇒ UI hiện `—`.
    struct Display: Equatable {
        var downKbps: Int?
        var upKbps: Int?
        var observedKbps: Int?
        var declaredDownKbps: Int?
        var declaredUpKbps: Int?
        var targetDownKbps: Int?
        /// % khai báo còn lên được; `nil` khi đã tối đa hoặc chưa phục vụ.
        var morePercent: Int?
        var atMax: Bool
        var stableKbps: Int?
        /// Tunnel chưa phục vụ (chưa có byte) ⇒ mọi số phải là `—`.
        var serving: Bool
    }

    /// Dựng số hiển thị. `serving == false` (tunnel chưa phục vụ) ⇒ xoá hết số để UI hiện `—`,
    /// **không** hiện `0` gây hiểu nhầm là mạng chết (§2g luật 1).
    static func display(
        serving: Bool,
        downKbps: Int?,
        upKbps: Int?,
        observedKbps: Int?,
        declaredDownKbps: Int?,
        declaredUpKbps: Int?,
        ceilingKbps: Int?,
        stableKbps: Int?,
        probeNoGain: Bool
    ) -> Display {
        guard serving else {
            return Display(
                downKbps: nil, upKbps: nil, observedKbps: nil,
                declaredDownKbps: nil, declaredUpKbps: nil, targetDownKbps: nil,
                morePercent: nil, atMax: false, stableKbps: nil, serving: false
            )
        }
        let observed = (observedKbps ?? 0) > 0 ? observedKbps : nil
        let atMax = observed.map { isAtMax(observedKbps: $0, ceilingKbps: ceilingKbps, probeNoGain: probeNoGain) } ?? false
        var target: Int?
        var more: Int?
        if let observed, !atMax {
            target = nextTargetKbps(observedKbps: observed, ceilingKbps: ceilingKbps, rampFactor: rampFactor)
            if let declared = declaredDownKbps, declared > 0 {
                more = morePercent(observedKbps: observed, declaredDownKbps: declared, ceilingKbps: ceilingKbps)
            }
        }
        return Display(
            downKbps: downKbps,
            upKbps: upKbps,
            observedKbps: observed,
            declaredDownKbps: declaredDownKbps,
            declaredUpKbps: declaredUpKbps,
            targetDownKbps: target,
            morePercent: more,
            atMax: atMax,
            stableKbps: stableKbps,
            serving: true
        )
    }
}
