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

    /// Tỉ lệ của số đo được đem đi khai.
    ///
    /// 24/09/2026 (chủ dự án chốt "iOS áp đúng chính sách Android"): đổi 80 → **85** cho khớp
    /// `BandwidthPolicy.DECLARE_RATIO_PCT = 85` của Android — cũng đúng con số đã đo thật trên
    /// Android v25 (`docs/YEU_CAU_TOC_DO_ON_DINH.md` §3b: đo 8.387 kbps ⇒ chốt khai 7.128 ≈ 0,85).
    /// `docs/YEU_CAU_TOC_DO_ON_DINH.md` §2h luật 1 ghi 0,8 và nghiệm thu A11 ghi "down ≤ 0,8 ×
    /// goodput" ⇒ **hai tài liệu lệch nhau**. Agent chính chốt 24/09/2026: **GIỮ 85%** (Android là
    /// nguồn sự thật theo yêu cầu chủ dự án) cho tới khi chủ dự án chốt lại 0,80 hay 0,85 — đã ghi
    /// rõ trong báo cáo bàn giao. Nếu chốt 0,80 thì chỉ cần đổi ĐÚNG hằng số này (mọi chỗ khác
    /// đều đọc từ đây).
    static let declareRatioPct = 85
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

    // MARK: - §3b — BANDWIDTH POLICY THEO ANDROID (nguồn sự thật: `BandwidthMemory.kt`)

    /// Bản port **1-1** của `object BandwidthPolicy` bên Android
    /// (`android/app/src/main/java/com/privatevpn/app/vpn/BandwidthMemory.kt`, khoá bằng
    /// `android/app/src/test/java/com/privatevpn/app/BandwidthPolicyTest.kt` — 24 test).
    ///
    /// VÌ SAO port nguyên thay vì tự nghĩ ngưỡng (chủ dự án chốt 24/09/2026): hai nền tảng phải
    /// chốt cùng con số thì mới grep-so được log và mới không lặp lại lỗi "mỗi bản một luật".
    /// Các ngưỡng/tỉ lệ dưới đây **giữ đúng tên và giá trị của Android**; chỗ nào iOS thiếu API
    /// thì ghi rõ ngay tại chỗ đó (KHÔNG bịa số).
    ///
    /// Khác biệt DUY NHẤT so với Android: iOS **không đọc được loss% và RTT của QUIC**
    /// (framework chỉ mở `MobileConnect/MobileServe/MobileStop`, xem `HysteriaBandwidthControl`)
    /// nên hai đầu vào đó luôn là 0/không có dữ liệu — xem `hasTransportLossSignal`.
    enum BandwidthPolicy {

        // MARK: Hằng số (giữ nguyên tên + giá trị Android)

        /// Chưa có số đo nào ⇒ dùng đúng nấc tĩnh cũ.
        static let reasonProfile = "profile"
        /// Dùng số đã nhớ của mạng này.
        static let reasonMemory = "memory"
        /// Số nhớ (hoặc số tĩnh) bị kẹp bởi trần/sàn.
        static let reasonClamp = "clamp"
        /// Số khai của phiên đang được vòng ramp trong lúc chạy điều chỉnh.
        static let reasonRamp = "ramp"
        /// Lý do của nhánh TĂNG khi vòng ramp chạy (giữ nguyên chuỗi của Android để grep giống).
        static let reasonRampUp = "idle-reconnect"
        static let reasonUnderrunBackoff = "underrun-backoff"
        static let reasonLossBackoff = "loss-backoff"
        static let reasonRTTBackoff = "rtt-backoff"

        /// Bốn dải của `pct = measured * 100 / declared` (xem `BandwidthPolicyTest.kt`).
        static let jumpUpPct = 150
        static let saturatedPct = 95
        static let deadbandPct = 80
        /// Bước dò lên khi đường còn dư (chỉ ở ranh giới kết nối).
        static let explorePct = 115
        /// Giảm xóc cho mẫu đo TỤT SÂU: không hạ quá 60% số đo LIỀN TRƯỚC.
        static let dampingPct = 60
        /// SÀN AN TOÀN NHỎ (KHÔNG phải nấc tĩnh — xem test `so do nho bat thuong thi bi kep san`).
        static let floorUpKbps = 500
        static let floorDownKbps = 1_000
        /// Trần cứng khi KHÔNG biết sức mạng vật lý (linkSpeed không đọc được — đúng ca iOS).
        static let hardCeilKbps = 200_000

        /// Đỉnh bền vững = trung bình trượt 12 giây (brief §2b: cửa sổ 12 s).
        static let sustainedWindowS = 12
        /// Quan sát bền vững vượt trần đang khai từ 15% ⇒ coi là khai thấp.
        static let rampTriggerPct = 115
        /// Phải giữ điều kiện ramp LIÊN TỤC 10 s mới đổi số khai.
        static let rampHoldS: TimeInterval = 10
        static let rampUpPct = 125
        static let rampDownPct = 70
        /// Mất gói (%) vượt ngưỡng này ⇒ giảm trần.
        static let rampLossPct = 2
        static let rttSpikeX = 3
        static let rttSpikeMinMs = 800
        /// Quan sát tụt dưới 50% số khai LIÊN TỤC ⇒ giảm trần (lưới an toàn).
        static let underrunPct = 50

        /// Một mẫu dưới mức này coi là RẢNH (Android `SAMPLER_IDLE_KBPS`).
        static let samplerIdleKbps = 200
        /// Số mẫu rảnh liên tiếp để log "HOÃN áp dụng" (Android `SAMPLER_IDLE_SAMPLES`).
        static let samplerIdleSamples = 2
        /// **CỔNG "TẢI THẬT" của iOS** — tổng byte HAI CHIỀU tối thiểu trong cửa sổ 12 s.
        ///
        /// Vì sao iOS cần cổng này mà Android không: Android chỉ đưa vào `decide` những con số
        /// đến từ **phép đo tải thật** (pre-measure 1,5 MB hoặc probe tải 4 MB qua tunnel), còn
        /// iOS **không có probe qua tunnel** (socket của extension không đi qua tunnel) nên phải
        /// dùng bộ đếm byte utun — mà bộ đếm đó vẫn nhúc nhích khi khách KHÔNG tải (keepalive,
        /// push, DNS). Đúng ca lỗi đã đo trên máy thật 24/09/2026:
        ///   `bw: sample observed=0 down=628 up=108 declared=3701/1110`
        ///   rồi `measured=483 declared up=1110 down=3701 reason=memory`
        /// ⇒ một mẫu nền ~500 kbps bị tính là "đường chậm hơn số khai" và hạ số khai oan.
        ///
        /// Ngưỡng 1 MB / 12 s (≈ 667 kbps duy trì hai chiều): lớn hơn hẳn mẫu nền đã đo
        /// (483 kbps ≈ 0,7 MB/12 s) nên loại được đúng ca lỗi, mà vẫn nhỏ hơn nhiều so với mốc
        /// xem video Full HD 8 Mbps (§1: 12 MB/12 s) nên không chặn nhầm phiên có tải thật.
        /// Đây là tham số **của iOS** (không có tương đương bên Android) — ghi rõ ở báo cáo.
        static let realLoadMinBytes = 1_000_000
        /// Mỗi lần đổi số cách nhau ≥15 s (mỗi lần đổi là một QUIC mới ở Android).
        static let rampCooldownS: TimeInterval = 15
        static let sampleLogIntervalS: TimeInterval = 15
        /// Cửa sổ đếm mất gói + số lần hỏng LIÊN TIẾP mới kết luận (Android).
        static let lossWindow = 10
        static let lossConsecutiveFails = 3

        /// Nhãn `apply=` — iOS **chỉ có một chế độ**: hoãn sang lần kết nối sau.
        ///
        /// VÌ SAO KHÔNG CÒN `idle-now` (lỗi "vài phút lại mất mạng"): số khai được Go đọc MỘT
        /// LẦN trong `MobileConnect`; đổi số = dựng lại relay + QUIC giữa phiên, mà đo thật
        /// 24/09/2026 cho thấy làm vậy thì tầng Go ngừng đọc fd của cặp socketpair ⇒ cầu
        /// `packetFlow↔fd` bỏ gói hàng loạt (`toGoDropped` nhảy vọt) ⇒ khách mất mạng.
        /// Android 1.4.2 cũng đã bỏ hẳn nhánh `if (idle) Mobile.stop()` với đúng lý do này.
        static let applyDeferred = "deferred-next-connect"

        /// Nhãn `apply=` để in log. `idle` chỉ còn để ghi chú "đang rảnh" — **không** đổi hành vi.
        static func applyLabel(idle: Bool) -> String {
            _ = idle
            return applyDeferred
        }

        /// iOS có tín hiệu loss/RTT của transport không.
        ///
        /// **KHÔNG** — framework hysteria trên iOS chỉ mở `MobileConnect/MobileServe/MobileStop`,
        /// không có API thống kê loss/RTT của QUIC (Android đo bằng TCP probe xuyên TUN; socket
        /// của extension iOS **không** đi qua tunnel nên không có đường tương đương). Vì vậy
        /// nhánh `loss-backoff`/`rtt-backoff` của Android **không tái hiện được**; iOS chỉ còn
        /// lưới an toàn "tụt sâu" (`underrun-backoff`, đòi ĐANG có tải thật) + bất đối xứng gói
        /// của utun làm proxy (xem `HysteriaBandwidthControl`).
        static let hasTransportLossSignal = false

        // MARK: Hàm thuần

        /// Đỉnh bền vững = trung bình của `count` mẫu 1 giây gần nhất (kbps). Port 1-1.
        static func sustainedKbps(samples: [Int], count: Int) -> Int {
            let n = min(count, samples.count)
            guard n > 0 else { return 0 }
            var sum = 0
            for index in 0..<n { sum += samples[index] }
            return sum / n
        }

        /// Đỉnh bền vững vượt trần đang khai ≥15% ⇒ đường còn dư thật.
        static func shouldRampUp(sustainedKbps: Int, declaredKbps: Int) -> Bool {
            guard declaredKbps > 0 else { return false }
            return sustainedKbps * 100 >= declaredKbps * rampTriggerPct
        }

        /// Giảm trần: mất gói vượt ngưỡng, hoặc RTT vọt lên so với nền.
        static func shouldRampDown(lossPct: Int, rttMs: Int, rttBaselineMs: Int) -> Bool {
            if lossPct >= rampLossPct { return true }
            if rttMs <= 0 || rttBaselineMs <= 0 { return false }
            return rttMs >= max(rttBaselineMs * rttSpikeX, rttSpikeMinMs)
        }

        /// Quan sát tụt hẳn so với trần đang khai (lưới an toàn).
        static func shouldRampDownUnderrun(sustainedKbps: Int, declaredKbps: Int) -> Bool {
            guard declaredKbps > 0, sustainedKbps > 0 else { return false }
            return sustainedKbps * 100 < declaredKbps * underrunPct
        }

        /// Tunnel ĐANG có tải thật (Android: `busy = idleRun == 0`).
        ///
        /// VÌ SAO phải có cổng này: mẫu rỗng (`observed=0`, khách đang đọc chứ không tải) mà
        /// đem so với số khai thì luôn "tụt sâu" ⇒ hạ khai oan. Android không dính vì số đo của
        /// nó đến từ phép đo tải thật; iOS đo bằng bộ đếm utun nên **buộc** phải tự loại mẫu rảnh.
        static func isBusy(idleRun: Int) -> Bool { idleRun == 0 }

        /// **TẢI THẬT** — cổng riêng của iOS (xem `realLoadMinBytes`): cửa sổ phải chở đủ byte
        /// HAI CHIỀU VÀ đa số mẫu phải trên mức rảnh. Đây là điều kiện BẮT BUỘC để được phép HẠ
        /// số khai giữa phiên: mẫu nền/`observed=0` không bao giờ qua được cổng này.
        static func hasRealLoad(windowBytes: Int, busySamples: Int, totalSamples: Int) -> Bool {
            guard totalSamples > 0 else { return false }
            guard windowBytes >= realLoadMinBytes else { return false }
            // "Chiếm đa số": > 50% số mẫu trong cửa sổ phải là mẫu CÓ tải.
            return busySamples * 2 > totalSamples
        }

        /// Chỉ cho phép hạ vì "tụt sâu" khi ĐANG có **tải thật** (không phải chỉ "khác 0"):
        /// mẫu rỗng hoặc mẫu nền lẻ tẻ ⇒ KHÔNG hạ số khai.
        static func allowsUnderrunBackoff(
            hasRealLoad: Bool,
            sustainedKbps: Int,
            declaredKbps: Int
        ) -> Bool {
            hasRealLoad && shouldRampDownUnderrun(sustainedKbps: sustainedKbps, declaredKbps: declaredKbps)
        }

        /// Bước TĂNG trần, kẹp bởi `ceilingKbps` và không xuống dưới `floorKbps`.
        static func rampUp(currentKbps: Int, ceilingKbps: Int, floorKbps: Int) -> Int {
            clampToRange(currentKbps * rampUpPct / 100, ceilingKbps: ceilingKbps, floorKbps: floorKbps)
        }

        /// Bước GIẢM trần (mất gói/RTT vọt/tụt sâu), cùng cách kẹp.
        static func rampDown(currentKbps: Int, ceilingKbps: Int, floorKbps: Int) -> Int {
            clampToRange(currentKbps * rampDownPct / 100, ceilingKbps: ceilingKbps, floorKbps: floorKbps)
        }

        private static func clampToRange(_ value: Int, ceilingKbps: Int, floorKbps: Int) -> Int {
            let low = floorKbps
            let high = max(ceilingKbps, floorKbps)
            return min(max(value, low), high)
        }

        /// Kết quả chốt số khai (tên trường trùng Android `BandwidthPolicy.Decision`).
        struct Decision: Equatable {
            var upKbps: Int
            var downKbps: Int
            var reason: String
            /// Trần xuống thật đã dùng để kẹp (kbps) — in ra log.
            var ceilingDownKbps: Int
            /// Trần "sức mạng vật lý" — vòng ramp trong phiên được phép bò tới đây.
            var physicalCeilingDownKbps: Int
        }

        /// Chốt số khai cho lượt kết nối tới. Port 1-1 `BandwidthPolicy.decide`.
        ///
        /// `ceilingDownKbps = 0` nghĩa là KHÔNG biết sức mạng vật lý (đúng ca iOS: không đọc
        /// được linkSpeed — xem `linkSpeedKbps`), khi đó trần là `hardCeilKbps`.
        static func decide(
            rememberedMeasuredKbps: Int,
            rememberedDeclaredKbps: Int,
            staticUpKbps: Int,
            staticDownKbps: Int,
            ceilingDownKbps: Int,
            previousMeasuredKbps: Int = 0,
            bestKbps: Int = 0
        ) -> Decision {
            let ceilPhysical = ceilingDownKbps > 0 ? ceilingDownKbps : hardCeilKbps
            let ceilStart = min(ceilPhysical, staticDownKbps)
            let ceilDown = bestKbps > 0 ? ceilPhysical : ceilStart
            let ratioUp = staticUpKbps
            let ratioDown = max(staticDownKbps, 1)
            let ceilUp = min(
                max(staticUpKbps, floorUpKbps),
                max(floorUpKbps, ceilDown * ratioUp / ratioDown)
            )

            var down: Int
            var up: Int
            var reason: String
            if rememberedMeasuredKbps <= 0 && bestKbps <= 0 {
                // Chưa từng đo, chưa từng ramp mạng này: ĐÚNG cơ chế tĩnh cũ (đường lùi an toàn).
                down = staticDownKbps
                up = staticUpKbps
                reason = reasonProfile
            } else if rememberedMeasuredKbps > 0 && rememberedDeclaredKbps > 0 {
                let pct = rememberedMeasuredKbps * 100 / rememberedDeclaredKbps
                if pct >= jumpUpPct {
                    down = rememberedMeasuredKbps * RampStatus.declareRatioPct / 100
                } else if pct >= saturatedPct {
                    down = rememberedDeclaredKbps * explorePct / 100
                } else if pct >= deadbandPct {
                    down = rememberedDeclaredKbps
                } else {
                    down = max(rememberedMeasuredKbps, previousMeasuredKbps * dampingPct / 100)
                        * RampStatus.declareRatioPct / 100
                }
                up = down * ratioUp / ratioDown
                reason = reasonMemory
            } else if rememberedMeasuredKbps > 0 {
                // Có số đo mà không có số khai đi kèm (dữ liệu cũ/thiếu): coi như khai vượt.
                down = rememberedMeasuredKbps * RampStatus.declareRatioPct / 100
                up = down * ratioUp / ratioDown
                reason = reasonMemory
            } else {
                // Chỉ có ĐỈNH (mạng đã từng ramp nhưng chưa có phép đo nào được lưu).
                down = bestKbps
                up = down * ratioUp / ratioDown
                reason = reasonMemory
            }

            // Bắt đầu từ ĐỈNH đã đạt: không bao giờ khởi điểm thấp hơn mức chính mạng này đã
            // từng chở được liên tục (điểm quan trọng nhất cho UX).
            if bestKbps > down {
                down = bestKbps
                up = down * ratioUp / ratioDown
            }

            // Chỉ báo `clamp` khi con số THỰC SỰ bị đổi.
            var clamped = false
            if down > ceilDown { down = ceilDown; clamped = true }
            if up > ceilUp { up = ceilUp; clamped = true }
            if down < floorDownKbps && floorDownKbps <= ceilDown { down = floorDownKbps; clamped = true }
            if up < floorUpKbps && floorUpKbps <= ceilUp { up = floorUpKbps; clamped = true }
            if clamped { reason = reasonClamp }
            return Decision(
                upKbps: up,
                downKbps: down,
                reason: reason,
                ceilingDownKbps: ceilDown,
                physicalCeilingDownKbps: ceilPhysical
            )
        }
    }

    // MARK: - TỰ RAMP TRONG PHIÊN — cổng quyết định "có ÁP NGAY không" (chủ dự án 24/09/2026)

    /// Luật áp số khai MỚI **ngay trong phiên** (không bắt khách Connect lại).
    ///
    /// Chủ dự án chốt 24/09/2026: *"nó phải tự ramp mà không cần người dùng connect lại"* ⇒ bỏ
    /// kiểu "hoãn hết sang lần connect sau" cho **cả** ramp lên lẫn ramp xuống. Nhưng đổi số khai
    /// = client hysteria mới = dựng lại relay + QUIC, nên phải có rào để không quay lại cảnh
    /// "vài phút lại mất mạng" (bài học 24/09: dựng lại giữa lúc đang chở gói thì cầu bỏ gói).
    ///
    /// Hàm THUẦN (không I/O) để harness test được toàn bộ luật áp — xem
    /// `scripts/ios-pure-logic-tests/main.swift`.
    enum ApplyGate {

        /// Chỉ áp khi mức mới ĐÁNG KỂ: lên ≥115% hoặc xuống ≤85% mức đang chạy.
        /// Vì sao: nhích nhỏ mà cũng dựng lại transport là tự bắn vào chân (mỗi lần dựng lại là
        /// một lần khựng + rủi ro cầu bỏ gói).
        static let significantUpRatio = 1.15
        static let significantDownRatio = 0.85
        /// Hai lần áp cách nhau ≥90 s (chống dựng lại liên tục).
        static let cooldownS: TimeInterval = 90
        /// Trần số lần áp trong cửa sổ `windowS` — quá thì tắt tự-áp cho hết phiên.
        static let maxPerWindow = 3
        static let windowS: TimeInterval = 600
        /// Đang BẬN thì chờ tối đa ngần này để tìm khe rảnh, rồi **áp luôn** (không hoãn sang lần
        /// connect sau — đúng yêu cầu "tự ramp").
        static let forcedWaitS: TimeInterval = 20
        /// Sau khi dựng lại, chờ tối đa ngần này để cầu chở lại gói; không tiến triển ⇒ ROLLBACK.
        static let verifyS: TimeInterval = 5

        /// Việc cần làm ở nhịp hiện tại.
        enum Action: Equatable {
            /// Đường đang rảnh ⇒ dựng lại + áp ngay (`apply=idle-now`).
            case applyIdleNow
            /// Đã chờ đủ `forcedWaitS` mà vẫn bận ⇒ áp ngay (`apply=forced-after-wait <s>`).
            case applyForcedAfterWait(Int)
            /// Đang bận nhưng chưa hết hạn chờ ⇒ chờ nhịp sau.
            case waitIdle
            /// Chưa đủ cooldown 90 s ⇒ chờ.
            case waitCooldown
            /// Quá trần số lần áp trong cửa sổ (hoặc đã tắt) ⇒ giữ nguyên tới hết phiên.
            case disabledForSession
            /// Lệch không đáng kể ⇒ bỏ qua, KHÔNG dựng lại.
            case skipInsignificant
        }

        /// Quyết định có áp mức `planKbps` lên đường đang chạy `activeKbps` hay không.
        ///
        /// - Parameters:
        ///   - idle: tunnel đang rảnh (không chở gói) theo cổng idle sẵn có.
        ///   - pendingFor: đã chờ bao lâu kể từ lúc số mới được chốt.
        ///   - sinceLastApply: bao lâu kể từ lần áp gần nhất (`nil` = chưa áp lần nào).
        ///   - appliesInWindow: số lần đã áp trong `windowS` gần nhất.
        ///   - disabled: đã bị tắt tự-áp cho phiên này chưa.
        static func decide(
            planKbps: Int,
            activeKbps: Int,
            idle: Bool,
            pendingFor: TimeInterval,
            sinceLastApply: TimeInterval?,
            appliesInWindow: Int,
            disabled: Bool
        ) -> Action {
            if disabled { return .disabledForSession }
            guard planKbps > 0, activeKbps > 0 else { return .skipInsignificant }
            let significant = planKbps >= activeKbps
                ? Double(planKbps) >= Double(activeKbps) * significantUpRatio
                : Double(planKbps) <= Double(activeKbps) * significantDownRatio
            guard significant else { return .skipInsignificant }
            if appliesInWindow >= maxPerWindow { return .disabledForSession }
            if let sinceLastApply, sinceLastApply < cooldownS { return .waitCooldown }
            if idle { return .applyIdleNow }
            if pendingFor >= forcedWaitS { return .applyForcedAfterWait(Int(pendingFor)) }
            return .waitIdle
        }

        /// Sau khi dựng lại: cầu có chở lại gói không ⇒ có phải ROLLBACK về số cũ không.
        ///
        /// Vì sao cần: nếu lần dựng lại làm cầu đứng (bài học fd cũ), thà quay về số khai CŨ rồi
        /// tắt tự-áp cho hết phiên còn hơn để khách mất mạng vì một lần "tối ưu".
        static func shouldRollback(progressed: Bool) -> Bool { !progressed }
    }
}

// MARK: - Danh tính extension (chống macOS dùng lại appex cũ)

/// Luật THUẦN so danh tính extension ĐANG CHẠY với appex nằm trong app — tách khỏi
/// `VPNManagerMac` để harness `swiftc` test được (không phụ thuộc Bundle/UI).
///
/// Vì sao cần: macOS phân giải extension theo LaunchServices nên đã cài bản mới mà hệ thống vẫn
/// launch appex của một bản VPNFlow cũ ở đường dẫn khác. Extension cũ (**không** gửi 4 trường
/// danh tính mới) ⇒ `running` là `nil`/`?` và PHẢI coi là CŨ (đúng ca tráo appex 24/09/2026).
enum ExtensionIdentityPolicy {
    struct Identity: Equatable {
        var version: String?
        var build: String?
        var mTime: String?

        /// Chuỗi gộp để hiện cảnh báo: `1.4.3/20` hoặc `?` khi extension không gửi trường nào.
        var label: String {
            let v = (version?.isEmpty == false) ? version! : "?"
            let b = (build?.isEmpty == false) ? build! : "?"
            return "\(v)/\(b)"
        }
    }

    /// `local == nil` (app không đọc được appex của chính nó) ⇒ KHÔNG cảnh báo oan.
    static func isStale(running: Identity?, local: Identity?) -> Bool {
        guard let local else { return false }
        guard let running else { return true }
        // Extension cũ không gửi trường ⇒ thiếu version/build/mtime nào cũng là CŨ.
        guard let version = running.version, !version.isEmpty, version != "?" else { return true }
        guard let build = running.build, !build.isEmpty, build != "?" else { return true }
        guard let mTime = running.mTime, !mTime.isEmpty, mTime != "?" else { return true }
        return version != local.version || build != local.build || mTime != local.mTime
    }
}
