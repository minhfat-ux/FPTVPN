import Foundation
import Network
import NetworkExtension

/// Khai băng thông ĐỘNG cho Brutal CC của hysteria2 (extension iOS/iPadOS).
///
/// Vì sao cần: Brutal CC **pace theo đúng số client khai**
/// (`tools/hysteria-android/mobile.go`: `MaxTx = upKbps*1000/8`, `MaxRx = downKbps*1000/8`),
/// nên khai sai là tự bóp. Đo thật 18–19/09/2026: khai 300/1000 Mbps ⇒ 1,3 Mbps; khai
/// 30/100 ⇒ 29,9 Mbps. Nấc tĩnh nay lấy từ `HysteriaDefaults` (30/100 Mbps) cho Wi-Fi và từ
/// `RampStatus.NetworkTier.mobile*` (8/12 Mbps) cho mạng di động.
///
/// ⚠️ **24/09/2026 — CHÍNH SÁCH NAY LÀ CỦA ANDROID, không còn là bản iOS tự nghĩ.**
/// Chủ dự án chốt: iOS phải áp ĐÚNG luật của Android (`docs/YEU_CAU_TOC_DO_ON_DINH.md` +
/// `android/.../BandwidthMemory.kt` `object BandwidthPolicy`), nên toàn bộ luật số khai +
/// vòng ramp nằm ở **`RampStatus.BandwidthPolicy`** (hàm THUẦN, có test đối chiếu 1-1 trong
/// `scripts/ios-pure-logic-tests/main.swift`). File này chỉ còn phần ĐỌC/GHI thiết bị:
///   1. **Đo mạng THẬT trước khi khai** (A8 §2e) — `BandwidthControl.preMeasure`, socket đi
///      thẳng ra mạng nền, ngưỡng y Android (`Config.PREMEASURE_*`);
///   2. **Nhớ theo mạng** (khoá `NetworkIdentity`, KHÔNG cần entitlement vị trí) — CHỈ nhớ số
///      đã chứng minh bằng **tải thật** (`realLoadMinBytes`), không nhớ mẫu nền/rỗng;
///   3. **Vòng ramp** đọc bộ đếm byte utun mỗi 1 s rồi hỏi `RampStatus.BandwidthPolicy`
///      (`shouldRampUp`/`rampUp`/`rampDown`, giữ 10 s, cách nhau 15 s).
///
/// Luật CHỐT SỐ KHAI (giống Android): 4 dải `đo/khai` = 150/95/80%, giảm xóc 60% số đo LIỀN
/// TRƯỚC, sàn 500/1000 kbps, khởi điểm từ ĐỈNH đã chứng minh (`best`). Bộ nhớ CHỈ nhận số ĐO.
///
/// ⚠️ **25/09/2026 — BỐN LUẬT RIÊNG CỦA iOS** (chủ dự án chốt sau log máy thật; hàm THUẦN nằm ở
/// `RampStatus.PreMeasurePolicy` + `RampStatus.StartupDeclaration`, có test trong
/// `scripts/ios-pure-logic-tests/main.swift`); `BandwidthPolicy.decide` KHÔNG bị sửa:
///   1. phép đo trước khi khai **TRỪ THỜI GIAN BẮT TAY** (log thật iPad: `5409kbps` tính cả bắt
///      tay vs `38272kbps` phần đọc — lệch 7×); bắt tay TO **không** phải lý do bỏ mẫu, chỉ bỏ khi
///      chính phần đọc quá mỏng (<200 ms hoặc <200 KB) — xem `RampStatus.PreMeasurePolicy`;
///   2. **số đo TƯƠI thắng bộ nhớ** (khai = 85% × số đo, kẹp trần/sàn) — bộ nhớ chỉ là DỰ PHÒNG;
///   3. **kẹp theo NẤC TĨNH của loại mạng** (Wi-Fi 30/100 Mbps, di động 8/12 Mbps — Android
///      `Config.MOBILE_*`) ⇒ không bao giờ khai số Wi-Fi lên 4G; kẹp `best ≤ 1,5 × số đo đã nhớ`;
///   4. mạng CHƯA có bộ nhớ **và** đo hỏng ⇒ khởi điểm THẬN TRỌNG ở nấc metered 8/12 Mbps
///      (`reason=cautious-new-network`) rồi để vòng ramp leo lên — không mở ra ở 100 Mbps.
///
/// Ràng buộc cứng của hysteria: số khai được Go đọc MỘT LẦN trong `MobileConnect` ⇒ đổi số
/// = client mới = QUIC/stream mới. Vì vậy ở đây **KHÔNG BAO GIỜ dựng lại transport giữa phiên
/// vì số khai**: số mới được chốt + ghi bộ nhớ ngay rồi **ÁP NGAY TRONG PHIÊN** qua
/// `RampStatus.ApplyGate` (rảnh ⇒ `apply=idle-now`; đang bận ⇒ chờ tối đa 20 s rồi
/// `apply=forced-after-wait`; quá 3 lần/10 phút ⇒ `apply=disabled-for-session`; cầu không chở lại
/// gói ⇒ `apply=rollback`). Mọi lần dựng lại đều lấy **cặp fd MỚI + cầu mới** (`installTunnelFD`)
/// — tái dùng fd cũ chính là lỗi làm cầu bỏ 100% gói. Watchdog H2 vẫn là lưới an toàn cuối.
///
/// Các hàm THUẦN cũ của iOS (`downKbpsFromMeasurement`, `clampedDeclaration`, `isUnderrun`,
/// `isSaturated`, `isClearlySaturated`) **KHÔNG còn nằm trên đường chạy** — giữ lại làm tham
/// chiếu cho các ghi chép lịch sử, đừng nối lại vào đường ramp (luật nay ở `BandwidthPolicy`).
enum BandwidthControl {

    // MARK: - Hằng số quyết định

    /// Nấc tĩnh của Wi-Fi — còn là ĐƯỜNG LÙI khi chưa đo được gì (25/09/2026: mạng HOÀN TOÀN mới
    /// mà đo hỏng thì lùi về nấc metered 8/12, xem `RampStatus.StartupDeclaration`).
    static let fallbackUpKbps = HysteriaDefaults.upKbps
    static let fallbackDownKbps = HysteriaDefaults.downKbps

    /// Mức tăng mỗi bậc ramp: ×1,25 khi thấy ĐỈNH vượt số khai ≥15%.
    /// Một nguồn sự thật với thẻ Diagnostics A10 (`RampStatus.rampFactor`).
    static let rampFactor = RampStatus.rampFactor
    /// Mức tăng khi số khai bị chặn trần rõ ràng (dùng hết ≥90% số khai trong ≥10s):
    /// mạnh hơn một bậc để đỡ mất nhiều vòng ramp (mỗi vòng phải chờ tunnel rảnh).
    static let rampFactorSaturated = 1.5
    /// Mất gói/RTT xấu ⇒ hạ ×0,7 rồi mới tăng lại.
    static let lossBackoff = 0.7
    /// Chỉ ramp khi dùng hết ≥85% số khai (trần thật đang chạm số khai).
    static let saturatedRatio = 0.85
    /// …hoặc khi đỉnh trượt vượt số khai ≥15% (đường nhanh hơn số đang khai).
    static let headroomRatio = 1.15
    /// Đỉnh trượt: trung bình dài nhất trong cửa sổ này.
    ///
    /// 24/09/2026 — trỏ về `RampStatus.BandwidthPolicy.sustainedWindowS` (12 s, đúng Android
    /// `SUSTAINED_WINDOW_S`; trước đây iOS để 10 s, lệch khỏi nền tảng kia) để chỉ còn MỘT
    /// nguồn sự thật cho cửa sổ "đỉnh bền vững" của §2b.
    static let peakWindow: TimeInterval = TimeInterval(RampStatus.BandwidthPolicy.sustainedWindowS)
    /// Phải thấy dấu hiệu bão hoà liên tục ngần này mới tăng.
    static let rampMinObserved: TimeInterval = 10
    /// Mất gói phải liên tục ngần này mới hạ (tránh một mẫu xấu làm bóp cả phiên).
    static let lossBackoffMinObserved: TimeInterval = 5
    /// Tunnel rảnh ngần này mới được dựng lại transport để áp số khai mới.
    static let idleBeforeChange: TimeInterval = 2
    /// Trần thời gian một thay đổi HẠ số khai được CHỜ tunnel rảnh.
    ///
    /// Vì sao phải có trần: đường bị flood thì **không bao giờ rảnh** — máy vẫn đang cố tải,
    /// gói vẫn vào tunnel nên "chờ rảnh" thành "chờ mãi". HẠ số khai là việc CHỮA; TĂNG thì chỉ
    /// áp ở ranh giới rảnh.
    ///
    /// H1 (24/09/2026): hết hạn này **KHÔNG còn** cho phép dựng lại transport giữa lúc đang chở
    /// traffic — đo thật cho thấy làm vậy thì tầng Go ngừng đọc fd và cầu bỏ 100% gói. Provider
    /// chỉ dùng `pendingForceExpired` để GHI LOG "đã chờ quá hạn, vẫn chờ ranh giới rảnh"
    /// (xem `applyBandwidthRampIfIdle`); số mới áp ở ranh giới rảnh hoặc ở phiên sau.
    static let pendingForceAfter: TimeInterval = RampStatus.downRampForceSeconds
    /// Một mẫu chỉ tính là "đang chở dữ liệu" khi vượt ngần này (dưới ngưỡng ⇒ coi như rảnh).
    static let busyBytesPerSecond = 2_000
    /// Cho phép DỰNG LẠI transport giữa phiên để áp số khai mới.
    ///
    /// **BẬT 24/09/2026** (chủ dự án: *"nó phải tự ramp mà không cần người dùng connect lại"*) —
    /// nhưng **có rào**: mọi lần dựng lại do băng thông nay đi qua `RampStatus.ApplyGate` (chỉ khi
    /// lệch ≥115%/≤85%; cooldown ≥90 s; tối đa 3 lần/10 phút, quá ⇒ `apply=disabled-for-session`;
    /// cầu không chở lại gói ⇒ `apply=rollback`), và **bắt buộc lấy cặp fd MỚI + cầu mới**
    /// (`HysteriaPacketTunnelProvider.installTunnelFD`).
    ///
    /// Vì sao phải có rào: đo thật 24/09/2026 — dựng lại transport giữa lúc tunnel vừa "rảnh"
    /// chốc lát mà **tái dùng fd cũ** thì cầu `packetFlow↔fd` bỏ gói hàng loạt (`toGo` đóng băng,
    /// `toGoDropped` nhảy vọt) ⇒ khách mất mạng, đúng dòng:
    ///   `bw: ramp đã áp sau khi dựng lại transport (mất 0.8s, tunnel đang rảnh)`
    /// Gốc lỗi là fd đã bị Go đóng khi `serve()` kết thúc — xem `installTunnelFD`.
    ///
    /// Ngoài đường này, watchdog H2 (tunnel hỏng thật) vẫn tự dựng lại như trước.
    static var allowsTransportRebuild: Bool {
        // 24/09/2026 TỐI — TẮT HẲN, theo đúng cách Android đã làm (android parity).
        //
        // Lịch sử trong ngày: bản này từng BẬT LẠI kèm "bản sửa gốc" (`TunnelBridge.retarget`,
        // kiểm ≤3 s có gói vào cầu mới, không đạt thì rollback). Nhưng log máy thật (iPhone 14 Pro
        // Max, 15:47→22:07) vẫn ghi **7 lần** `transport vừa thay (ramp băng thông)` trong MỘT
        // phiên — mỗi lần là một lần khách thấy "đứt rồi nối lại", và mỗi lần còn làm **bộ đếm cầu
        // reset về 0** ⇒ mẫu 1 s kế tiếp đọc `observed=0`/`realLoad=0` ⇒ ramp + watchdog lại tưởng
        // đường chết ⇒ dựng lại tiếp (log: 21:21:02 `apply=idle-now` → 21:21:18 `observed=0`;
        // 22:07:12 watchdog đòi dựng lại vì "chiều về đứng yên 10s" trong lúc tunnel chỉ RẢNH).
        //
        // Android — nguồn sự thật — đã BỎ HẲN nhánh này (`HysteriaVpnService.applyRampDecision`:
        // *"KHÔNG dựng lại client giữa phiên (bỏ hẳn nhánh `if (idle) Mobile.stop()` cũ)"*) sau khi
        // đo 11,7 giờ thấy **33 lần** `apply=idle-now` = 33 lần khách thấy đứt, trong khi lợi ích
        // gần bằng 0: server bật `ignoreClientBandwidth`, đo thật khai 3,8 Mbps vẫn tải 35 Mbps
        // ⇒ số khai KHÔNG bóp chiều tải xuống. Số mới vẫn được GHI NHỚ theo mạng
        // (`rememberBest`/`persistPeaksIfNeeded`) và áp ở lần kết nối/đổi mạng kế tiếp
        // (`apply=deferred-next-connect`).
        //
        // 25/09/2026 — BẬT LẠI (chủ dự án: *"ramp được thì phải đổi đường ramp luôn"*), có BẰNG CHỨNG
        // ĐO: chính bản macOS trên máy chủ dự án (1.4.3/build 20 — revision TRƯỚC khi tắt) log
        //   `bw: ramp-apply … apply=forced-after-wait 20` + `transport vừa thay (ramp băng thông)`
        // và đạt **14.824 kbps** qua tunnel, trong phiên đó 0 tự gỡ/0 ngắt, nhịp tim 7.
        // Nghĩa là "áp ngay trong phiên" KHÔNG tự nó gây mất ổn định — 7 swap/phiên của bản 1.4.4/21
        // đến từ watchdog báo oan + bộ đếm bị reset + hàng đợi bị chặn, và ba thứ đó đã được sửa ở
        // build 26–28. Vẫn giữ nguyên mọi rào của `RampStatus.ApplyGate`: chỉ áp khi RẢNH, cooldown
        // 90 s, tối đa 3 lần/10 phút, sau retarget phải chứng minh có gói vào cầu mới (≤3 s) nếu
        // không thì rollback + TẮT tự-áp cho hết phiên.
        //
        // CỔNG ĐO (nếu swap nhiều/ảnh hưởng khách thì TẮT LẠI bằng đúng 1 dòng này):
        //   số dòng `transport vừa thay (ramp băng thông)` mỗi phiên · tốc độ qua tunnel · số lần
        //   khách thấy đứt. Xem `docs/DIAG_IOS_STABILITY_2026-09-24.md` §5.
        //
        // 25/09/2026 — TẮT LẠI (đo trên máy thật ngay sau build 29): bật áp-ngay-trong-phiên làm
        // tunnel **tự ngắt rồi KHÔNG kết nối lại được** trên iOS (khác macOS 1.4.3/20 dù cùng code —
        // bản iOS đã có thêm watchdog/dò lỗi iOS-only tương tác với chuỗi dựng lại). Quay về đúng
        // hành vi Android: số mới được GHI NHỚ và áp ở lần kết nối/đổi mạng kế tiếp.
        // Muốn "đổi số mà không chạm khách" thì phải thêm hàm đổi băng thông lúc chạy ở cầu Go
        // (`MobileSetBandwidth`) — việc riêng, cần build lại framework.
        false
    }

    /// Trần cứng của mọi số khai (chặn số rác từ bộ đếm hỏng / file bộ nhớ sửa tay).
    static let maxKbps = 10_000_000
    /// Sàn khi khai (dưới mức này thì hysteria chỉ bò — thà về 0 để dùng CC chuẩn).
    static let minKbps = 500

    // MARK: - Chốt số khai theo SỐ ĐO (giống Android, xem `BandwidthPolicy` của
    // `android/.../BandwidthMemory.kt`)

    /// SÀN AN TOÀN NHỎ khi khai theo số đo (kbps), hai chiều.
    ///
    /// **KHÔNG phải nấc tĩnh.** Lấy nấc tĩnh (30/100 Mbps) làm sàn là đúng lỗi đã đo trên
    /// Android 19/09 (Wi-Fi khách sạn: đo 1,0–1,5 Mbps mà sàn kéo số khai lên 8/12 Mbps ⇒
    /// Brutal pace gấp ~10 lần sức mạng thật ⇒ tự flood ⇒ tắc). Sàn chỉ để không khai 0/vài
    /// chục kbps; dưới mức này thì khai 0 cũng không khác gì.
    static let floorDownKbps = 1_000
    static let floorUpKbps = 500
    /// Tỉ lệ của số đo được đem đi khai: **80%** (A11 §2h luật 1: "có số đo thật ⇒ khai =
    /// đo được × 0,8"). Trước đây 85%; hạ về 80 để khởi điểm không bao giờ vống, đúng
    /// nghiệm thu A11 (`down ≤ 0,8 × goodput`). Chừa ~20% cho chặng tunnel/relay.
    static let declareRatioPct = RampStatus.declareRatioPct
    /// Dải điều chỉnh theo tỉ lệ `pct = số đo × 100 / số khai đã nhớ` (giống Android):
    ///   ≥150% ⇒ đo VƯỢT XA số khai ⇒ số khai là nút cổ chai ⇒ nhảy lên 85% số đo;
    ///   95–150% ⇒ đo chạm trần số khai ⇒ còn dư ⇒ dò lên 15%;
    ///   80–95% ⇒ đo xấp xỉ số khai ⇒ GIỮ NGUYÊN (dải chết, chống dao động);
    ///   <80% ⇒ số khai VƯỢT sức mạng thật ⇒ hạ về 85% số đo.
    static let jumpUpPct = 150
    static let saturatedPct = 95
    static let deadbandPct = 80
    static let explorePct = 115
    /// Số khai KHAI VƯỢT hẳn sức mạng thật (đo < ngần này % số khai) LIÊN TỤC ⇒ hạ NGAY về
    /// 85% số đo (không hạ từng bậc ×0,7: từ 100 Mbps về 1 Mbps là ~13 bậc, mà mỗi bậc là
    /// một lần dựng lại transport).
    static let underrunPct = 50
    /// Một mẫu chỉ được coi là SỐ ĐO thật khi vượt ngần này (kbps): dưới mức đó chỉ là
    /// DNS/ping. Trùng ngưỡng ghi log `bw: measured=` của provider (`bandwidthLogMinKbps`).
    ///
    /// Vì sao 300 chứ không phải 500 (bản đầu): log THẬT trên iPad 19/09/2026 đo được
    /// 503/513/570 kbps — sát ngưỡng 500 tới mức một mẫu 480 kbps là LỌT RA NGOÀI, và khi đó
    /// số khai 30/100 Mbps không bao giờ được hạ (đúng lỗi đang sửa). 300 kbps duy trì suốt cả
    /// cửa sổ trượt 10s vẫn là traffic thật — DNS/ping chỉ ~1–20 kbps — nên đây là ngưỡng vừa
    /// đủ chặt mà không bỏ sót đúng ca cần sửa.
    static let minMeasuredKbps = 300
    /// Bão hoà RÕ RÀNG (≥90% số khai) ⇒ tăng mạnh hơn một bậc, tiết kiệm số vòng ramp.
    static let saturatedStrongRatio = 0.9
    /// Cửa sổ bộ nhớ: quá ngần này không đo lại được thì bỏ (mạng có thể đã khác).
    static let memoryFreshness: TimeInterval = 30 * 24 * 3600
    /// Trần số mạng nhớ được (mỗi bản ghi vài chục byte).
    static let maxRememberedNetworks = 32
    /// Chỉ ghi bộ nhớ khi đỉnh đổi đủ nhiều (đỡ ghi UserDefaults mỗi giây).
    static let memoryWriteDeltaKbps = 2_000
    /// Dưới mức này thì số đo KHÔNG đủ tin để tăng số khai (chỉ là DNS/ping, không phải
    /// bằng chứng đường nhanh hơn số khai).
    static let minTrustedMeasuredKbps = 5_000

    // MARK: - Dấu hiệu "mất gói" trên iOS

    /// iOS **không** đọc được số lần mất gói hay RTT của QUIC: framework hysteria chỉ mở
    /// `MobileConnect`/`MobileServe`/`MobileStop` (xem `Mobile.objc.h`) — không có API thống
    /// kê. Dấu hiệu duy nhất nhìn được từ ngoài là **bộ đếm gói của utun**: máy gửi gói vào
    /// tunnel mà gần như không có gói nào quay về.
    ///
    /// Hai ngưỡng dưới đây cố ý DÈ DẶT (hạ số khai là mất tốc độ thật): phải ≥20 gói ra
    /// trong một mẫu 1s VÀ gói về ≤1/8 số gói ra, LIÊN TỤC `lossBackoffMinObserved` giây.
    /// Tải xuống bình thường không dính: mỗi gói về mang theo ~1,4 KB còn gói ra chỉ ~60 B
    /// (ACK) nên số gói về vẫn xấp xỉ số gói ra.
    static let lossMinPacketsPerSample = 20
    static let lossInboundDivisor = 8

    /// Số khai đã chốt cho một mạng, kèm lý do để in ra telemetry.
    struct Plan {
        var upKbps: Int
        var downKbps: Int
        var reason: Reason
    }

    /// Lý do của dòng telemetry (`bw: … reason=…`).
    enum Reason: String {
        /// Mạng này CHƯA có số đo nào ⇒ số khai đúng nấc TĨNH `HysteriaDefaults` (đường lùi an
        /// toàn, không làm mạng nào chậm hơn trước). Khác `probe`: `profile` nói "đang khai nấc
        /// tĩnh vì chưa đo được", `probe` chỉ nói "chưa chốt được gì".
        case profile
        case probe
        case memory
        case clamp
        case ramp
        case lossBackoff = "loss-backoff"
        /// Mạng CHƯA có bộ nhớ **và** phép đo tươi hỏng ⇒ khởi điểm ở nấc THẬN TRỌNG (metered
        /// 8/12 Mbps) thay vì mở ra ở 100 Mbps. Xem `RampStatus.StartupDeclaration`.
        case cautious = "cautious-new-network"

        /// Chuỗi để in ra telemetry (`bw: … reason=…`).
        var label: String { rawValue }
    }

    // MARK: - Danh tính mạng + trần của đường truyền

    /// Khoá "theo mạng" của iOS.
    ///
    /// Trần thật của iOS: lấy **SSID** cần Location permission (và
    /// `com.apple.developer.networking.wifi-info` cho `CNCopyCurrentNetworkInfo`), còn
    /// `NEHotspotNetwork.fetchCurrent` cần entitlement Hotspot Configuration — bản build này
    /// cố ý KHÔNG xin quyền nào (thêm quyền là phải cấp lại provisioning profile + thêm
    /// prompt vị trí cho khách), nên SSID chỉ là đường **cơ hội**: có thì dùng, không thì thôi.
    ///
    /// Vì vậy khoá mạng ở đây là:
    ///   * `wifi|ssid:<SSID>` — khi lấy được SSID (đúng nhất: phân biệt Wi-Fi nhà và quán);
    ///   * `wifi|router:<MAC router>` — MAC của router mặc định (bảng ARP): khác router là khác
    ///     khoá, mà không cần quyền nào. Đây là đường CHÍNH của bản build này;
    ///   * `wifi|if:en0` (hoặc `cell|if:pdp_ip0`) — tên interface, luôn có, đường cuối cùng.
    ///
    /// Khoá dùng để ĐỌC (lần lượt từ hẹp tới rộng) và để GHI (`preferredKey`).
    struct NetworkIdentity {
        /// `wifi` / `cell` / `wired` / `other` (viết ra thẳng trong log).
        let kind: String
        /// Tên interface của Network.framework (`en0`, `pdp_ip0`, …).
        let interfaceName: String
        /// SSID — chỉ có khi app đã được cấp quyền vị trí.
        let ssid: String?
        /// BSSID (địa chỉ MAC của AP) khi có.
        let bssid: String?
        /// MAC của router mặc định (đọc từ bảng ARP, không cần quyền) — xem
        /// `defaultGatewayAddress`. `nil` khi không đọc được.
        let routerMAC: String?

        /// Khoá để GHI bộ nhớ: ưu tiên thứ phân biệt được nhiều mạng nhất.
        var preferredKey: String {
            if let ssid, !ssid.isEmpty { return "\(kind)|ssid:\(ssid)" }
            if let routerMAC, !routerMAC.isEmpty { return "\(kind)|router:\(routerMAC)" }
            return "\(kind)|if:\(interfaceName)"
        }

        /// Các khoá để ĐỌC, xếp từ cụ thể tới chung — lần trước ghi bằng khoá nào cũng gặp.
        var lookupKeys: [String] {
            var keys = [preferredKey]
            if let routerMAC, !routerMAC.isEmpty { keys.append("\(kind)|router:\(routerMAC)") }
            if let bssid, !bssid.isEmpty { keys.append("\(kind)|bssid:\(bssid)") }
            keys.append("\(kind)|if:\(interfaceName)")
            keys.append(kind)
            var seen = Set<String>()
            return keys.filter { !$0.isEmpty && seen.insert($0).inserted }
        }

        var logLabel: String { preferredKey }
    }

    /// Đọc danh tính mạng hiện tại (loại + tên interface, SSID nếu có, MAC router).
    ///
    /// Cố ý chạy được cả khi `path` là nil: khi app chưa cấp quyền hay đang chuyển mạng, ta
    /// vẫn phải có một khoá để đọc bộ nhớ và ghi số đo.
    static func currentNetworkIdentity(path: NWPath?) -> NetworkIdentity {
        let interface = path?.availableInterfaces.first
        let name = interface?.name ?? "unknown"
        var kind = "other"
        if let type = interface?.type {
            switch type {
            case .wifi: kind = "wifi"
            case .cellular: kind = "cell"
            case .wiredEthernet: kind = "wired"
            default: kind = "other"
            }
        }
        let wifi = (kind == "wifi") ? currentWiFiNetwork() : nil
        return NetworkIdentity(
            kind: kind,
            interfaceName: name,
            ssid: wifi?.ssid,
            bssid: wifi?.bssid,
            routerMAC: defaultGatewayAddress()
        )
    }

    /// Trần của đường truyền dưới tunnel, tính bằng kbps. `nil` = không đọc được.
    ///
    /// Trên iOS **không** đọc được link speed qua `if_media.h` (header này không có trong SDK
    /// iPhoneOS — xem `linkSpeedKbps`), nên trần thật sự đến từ số ĐO: provider truyền vào
    /// `measuredKbps` rồi bị kẹp bởi `measuredSafety` (biên an toàn cho header QUIC/WS).
    static let measuredSafety = 1.5

    /// Kẹp trần: `min(trần đọc được, trần suy từ số đo)`.
    ///
    /// Vì sao trần suy từ số đo là `measured × 1,5`: đó là BIÊN AN TOÀN — cho phép số khai
    /// cao hơn mức đã đo được 50% (đủ chỗ cho header QUIC/WS và cho lần ramp kế tiếp), nhưng
    /// không để một lần ramp nhảy vào vùng chưa từng chứng minh. Số đo **không** nâng trần:
    /// trần chỉ được nâng khi đo được số MỚI cao hơn (lúc đó trần suy từ số mới cũng cao lên).
    ///
    /// `measuredKbps == nil` ⇒ chỉ còn trần đọc được từ link speed (nếu có), tức là chưa có
    /// gì để kẹp — chỗ gọi phải tự quyết định (provider coi "chưa đo" là "không kẹp").
    static func ceilingKbps(
        measuredKbps: Int?,
        linkSpeedKbps: Int?,
        everMeasured: Bool = true
    ) -> Int? {
        var values: [Int] = []
        if let linkSpeedKbps, linkSpeedKbps > 0 { values.append(linkSpeedKbps) }
        if let measuredKbps, measuredKbps > 0, everMeasured {
            values.append(Int(Double(measuredKbps) * measuredSafety))
        }
        guard let value = values.min() else { return nil }
        return min(max(value, minKbps), maxKbps)
    }

    // MARK: - Bộ nhớ theo mạng

    /// Bản ghi của một mạng (UserDefaults trong container extension).
    ///
    /// Trường đặt tên theo đúng bộ nhớ Android (`BandwidthMemory`: `bw_best_*`, `bw_kbps_*`,
    /// `bw_prev_*`, `bw_decl_*`) để hai nền tảng đọc/grep giống nhau:
    ///   * `peakDownKbps`      ↔ `bw_best_<key>`  (đỉnh bền vững CAO NHẤT từng chở được);
    ///   * `measuredDownKbps`  ↔ `bw_kbps_<key>`  (số ĐO của lượt đo gần nhất);
    ///   * `previousMeasuredDownKbps` ↔ `bw_prev_<key>` (mốc giảm xóc `DAMPING_PCT`);
    ///   * `lastDownKbps`      ↔ `bw_decl_<key>`  (số KHAI của chính lượt đo đó).
    struct Memory: Codable {
        /// Đỉnh tốt nhất từng đo được trên mạng này: giá trị LỚN NHẤT của trung bình trượt
        /// (không phải mẫu 1 giây), kbps. Vừa là `bestKbps` khi chốt số khai, vừa là BẰNG CHỨNG
        /// duy nhất cho biết bản ghi có số đã học thật hay không (xem `trustedMeasuredDownKbps`).
        var peakUpKbps: Int = 0
        var peakDownKbps: Int = 0
        /// Số khai của lần kết nối gần nhất — lần sau bắt đầu từ đây rồi ramp tiếp.
        /// CHỈ được ghi khi phiên đó đã đo được số thật (xem `persistPeaksIfNeeded`).
        var lastUpKbps: Int = 0
        var lastDownKbps: Int = 0
        /// Số ĐO (kbps) của lượt đo gần nhất — dải 150/95/80% của `BandwidthPolicy.decide` so
        /// chính con số này với `lastDownKbps` để biết số khai cũ có phải nút cổ chai không.
        var measuredDownKbps: Int = 0
        /// Số ĐO LIỀN TRƯỚC số đã nhớ — mốc giảm xóc `DAMPING_PCT` của Android. Thiếu trường này
        /// (bản ghi cũ) thì `decide` bỏ qua giảm xóc, không hỏng gì.
        var previousMeasuredDownKbps: Int = 0
        /// Số lần đã phải ramp (chỉ để chẩn đoán).
        var rampEvents: Int = 0
        var updatedAt: Date = .distantPast
        /// Mạng này từng bị hạ vì mất gói ⇒ lần sau khởi động thận trọng hơn.
        var lossBackoffSeen = false
    }

    private static let defaultsKey = "bw.memory.v1"
    /// Tuần tự hoá đọc/ghi UserDefaults: `saveMemory` chạy ở cả hàng đợi lấy mẫu 1s lẫn nhịp
    /// watchdog (hai luồng khác nhau) — không khoá thì hai bên cùng đọc-sửa-ghi là mất bản ghi.
    private static let memoryLock = NSLock()

    /// Một khoá duy nhất trong UserDefaults của extension. Container extension là nơi duy
    /// nhất mà cả hai tiến trình (app/extension) đọc được bằng devicectl; ở đây cố ý KHÔNG
    /// dùng App Group vì target không có entitlement đó (thêm ⇒ phải cấp lại profile).
    static func loadMemory() -> [String: Memory] {
        memoryLock.lock()
        let decoded = readMemoryUnlocked()
        memoryLock.unlock()
        guard !decoded.isEmpty else { return [:] }
        let now = Date()
        let fresh = decoded.filter { now.timeIntervalSince($0.value.updatedAt) < memoryFreshness }
        // Bản ghi NHIỄM bị XOÁ HẲN khỏi store (không chỉ bỏ qua lúc đọc): bản build cũ ghi số
        // khai nấc tĩnh 30/100 Mbps vào bộ nhớ ngay khi CHƯA đo được gì, nên "có bản ghi" không
        // đồng nghĩa "có số đã học" — đúng dòng đã đo trên iPad 19/09/2026:
        //   bw: net=wifi|if:en0 measured=1069 declared up=30000 down=100000 reason=memory
        // Để nguyên bản ghi đó thì mỗi lần vào cùng mạng lại phải lọc, và nó vẫn chiếm chỗ
        // trong `maxRememberedNetworks`.
        let split = splitContaminated(fresh)
        if !split.removed.isEmpty {
            RelayDiagnostics.shared.log(
                "bw: xoá \(split.removed.count) bản ghi bộ nhớ NHIỄM (có số khai mà KHÔNG có "
                    + "đỉnh ĐO nào): \(split.removed.joined(separator: ", "))"
            )
            saveMemory(split.kept)
        }
        return split.kept
    }

    /// Tách bản ghi nhiễm ra khỏi bộ nhớ dùng được (hàm THUẦN, test được ngoài app).
    static func splitContaminated(_ memory: [String: Memory]) -> (kept: [String: Memory], removed: [String]) {
        var kept: [String: Memory] = [:]
        var removed: [String] = []
        for (key, entry) in memory {
            if isContaminated(entry) { removed.append(key) } else { kept[key] = entry }
        }
        return (kept, removed.sorted())
    }

    /// Bản ghi KHÔNG có bằng chứng đo nào (không đỉnh nào) — dấu vết của bản build cũ, thứ ghi
    /// thẳng số khai ra bộ nhớ dù chưa đo gì (xem `persistPeaksIfNeeded`).
    ///
    /// Bộ nhớ CHỈ được giữ giá trị ĐO ĐƯỢC, mà bằng chứng duy nhất của một phép đo là ĐỈNH
    /// (`peakDownKbps`/`peakUpKbps`): chúng chỉ được ghi khi tunnel thật sự chở dữ liệu vượt
    /// `minMeasuredKbps`. Không có đỉnh ⇒ mọi `lastUp/lastDown` trong bản ghi là số CHƯA từng
    /// chứng minh (thường đúng bằng nấc tĩnh) ⇒ bỏ.
    static func isContaminated(_ entry: Memory) -> Bool {
        entry.peakDownKbps <= 0 && entry.peakUpKbps <= 0
    }

    private static func readMemoryUnlocked() -> [String: Memory] {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let decoded = try? JSONDecoder().decode([String: Memory].self, from: data)
        else { return [:] }
        return decoded
    }

    static func saveMemory(_ memory: [String: Memory]) {
        memoryLock.lock()
        defer { memoryLock.unlock() }
        // Giữ bản ghi mới nhất, bỏ dần bản cũ nhất khi quá nhiều mạng.
        let trimmed = memory
            .sorted { $0.value.updatedAt > $1.value.updatedAt }
            .prefix(maxRememberedNetworks)
        var kept: [String: Memory] = [:]
        for entry in trimmed { kept[entry.key] = entry.value }
        guard let data = try? JSONEncoder().encode(kept) else { return }
        UserDefaults.standard.set(data, forKey: defaultsKey)
    }

    /// Bản ghi đã dùng cho mạng này (nil = chưa từng đo).
    static func remembered(_ memory: [String: Memory], identity: NetworkIdentity) -> (key: String, entry: Memory)? {
        for key in identity.lookupKeys {
            if let entry = memory[key] { return (key, entry) }
        }
        return nil
    }

    // MARK: - Kết quả đo trong phiên

    /// Bộ đếm byte của tunnel ở hai chiều (provider lấy từ utun).
    struct ByteSample: Equatable {
        /// Byte tunnel trả về MÁY (`ifi_ibytes`) — dùng cho băng thông xuống.
        var inbound: Int
        /// Byte MÁY đưa vào tunnel (`ifi_obytes`) — dùng cho băng thông lên.
        var outbound: Int
    }

    /// Quyết định ramp cho provider: `nil` = giữ nguyên số khai, không đụng transport.
    ///
    /// `multiplierUp/Down` là hệ số mà provider dùng khi dựng lại transport (`nil` = dùng lại
    /// số khai đang có, ví dụ khi chỉ vừa đổi mạng).
    struct RampDecision: Equatable {
        let multiplierUp: Double?
        let multiplierDown: Double?
        let reason: Reason
        /// Ghi đè chuỗi `reason=` khi in log (Android có nhiều lý do hơn enum này, ví dụ
        /// `underrun-backoff`) — `nil` ⇒ dùng `logReason` mặc định. Giữ chuỗi GIỐNG Android để
        /// hai nền tảng grep được bằng cùng một biểu thức.
        var logReasonOverride: String? = nil
        let observedKbps: Int
        let oldUpKbps: Int
        let oldDownKbps: Int
        let newUpKbps: Int
        let newDownKbps: Int

        var logReason: String {
            if let logReasonOverride { return logReasonOverride }
            switch reason {
            case .lossBackoff: return "loss-backoff"
            // Số khai mới là f(số đo) — in thẳng lý do đã chốt (`clamp` khi sàn/trần phải can
            // thiệp, `memory` khi số đo tự quyết định).
            case .clamp, .memory: return reason.label
            // `.ramp` = nhánh TĂNG; Android in "idle-reconnect" cho nhánh này (giữ nguyên chuỗi
            // để so log hai nền tảng).
            default: return RampStatus.BandwidthPolicy.reasonRampUp
            }
        }
    }
}

// MARK: - Quyết định khai báo (chỗ duy nhất biết "đang khai bao nhiêu")

extension BandwidthControl {

    /// Giữ số khai hiện tại của một phiên + quyết định tăng/giảm.
    ///
    /// Vòng đời: dựng ở `startTunnel` (đọc bộ nhớ theo mạng) → `sample` mỗi 1s → khi
    /// `sample` trả về `RampDecision`, provider dựng lại transport lúc tunnel rảnh rồi gọi
    /// `applied(_:)`. Mọi hàm ở đây chỉ chạm hàng đợi của provider (không tự khóa).
    final class SessionState {
        private(set) var identity: NetworkIdentity
        private(set) var key: String
        private(set) var upKbps: Int
        private(set) var downKbps: Int
        private(set) var planReason: Reason
        /// Trần XUỐNG đang dùng để kẹp (kbps) — in ra log `ceil=`, giống Android.
        private(set) var ceilingDownKbps: Int = BandwidthControl.maxKbps
        /// Đỉnh trượt (trung bình dài nhất trong `peakWindow`) của phiên, hai chiều, kbps.
        private(set) var peakUpKbps = 0
        private(set) var peakDownKbps = 0
        /// Trung bình 10s vừa tính — con số in ra `bw: … measured=` (đối chiếu được với speedtest).
        private(set) var lastAverageDownKbps = 0
        private(set) var lastAverageUpKbps = 0
        /// Đã đo được số nào có nghĩa trên mạng này chưa (false ⇒ không kẹp trần theo số đo).
        private(set) var everMeasured = false
        /// Đã có **TẢI THẬT** (qua cổng `hasRealLoad`) ⇒ mới được ghi bộ nhớ theo mạng.
        private(set) var hasRealMeasurement = false
        /// Mẫu gần nhất có qua cổng "tải thật" không — in ra log `sample` để đọc là biết vì sao
        /// app từ chối hạ số khai.
        private(set) var lastRealLoad = false
        /// Số byte HAI CHIỀU trong cửa sổ 12 s (in log `sample raw=`).
        private(set) var lastWindowBytes = 0
        /// Số mẫu LIÊN TIẾP rảnh (Android `idleRun`) — in log `sample`.
        private(set) var idleRun = 0
        /// PROXY mất gói (%) từ bất đối xứng gói của utun. **KHÔNG** phải loss% của QUIC — log in
        /// là `lossProxy=` để không ai đọc nhầm thành số đo thật (xem
        /// `RampStatus.BandwidthPolicy.hasTransportLossSignal`).
        private(set) var lastLossProxyPct = 0
        /// Bằng chứng NGHẼN (gói bị cầu bỏ vì hàng đợi) — provider cập nhật mỗi nhịp.
        private(set) var congestionEvidence = false
        /// Số đo ĐƯỜNG THẬT (pre-measure NGOÀI tunnel) gần nhất + mốc thời gian.
        private(set) var rawLineKbps = 0
        private(set) var rawLineAt = Date.distantPast
        /// Số lần đo rawline LIÊN TIẾP (≥60 s) đều < số khai — chốt chống dao động.
        private(set) var lowRawLineStreak = 0
        private var lastLowRawLineAt = Date.distantPast
        /// Mốc log gần nhất của việc TỪ CHỐI hạ số khai vì mẫu chưa đủ tải thật — chống ngập log
        /// (nhịp lấy mẫu 1 s; yêu cầu: "throttle log, đừng spam mỗi giây").
        private var lastLoadRefusalLogAt = Date.distantPast
        /// Mốc log gần nhất của việc TỪ CHỐI hạ khai (throttle 30 s).
        private var lastUnderrunRefusalLogAt = Date.distantPast
        private(set) var lossSeen = false
        /// Có thay đổi đang chờ áp ở ranh giới an toàn không.
        private(set) var pendingChange = false
        private(set) var pendingReason: Reason?
        /// Mốc bắt đầu "có thay đổi đang chờ áp" (nil = chưa có gì đang chờ). Dùng để biết đã
        /// chờ quá `pendingForceAfter` chưa — tunnel bị flood thì không bao giờ rảnh.
        private(set) var pendingSince: Date?
        /// Thay đổi đang chờ có phải HẠ số khai không. Chỉ HẠ mới được buộc áp (đứt stream đang
        /// mở); TĂNG thì vẫn chờ tunnel rảnh.
        private(set) var pendingIsDecrease = false
        /// Lần cuối thấy tunnel chở dữ liệu thật (để biết "rảnh" hay "đang truyền").
        private(set) var lastActivityAt = Date()
        /// Bộ nhớ theo mạng đã nạp ở đầu phiên.
        private(set) var memory: [String: Memory]

        /// Trạng thái bộ đếm của lần lấy mẫu trước (nil = chưa có mốc).
        private var baseline: ByteSample?
        private var baselineAt = Date.distantPast
        /// Mẫu tốc độ XUỐNG mỗi giây — vòng ring `sustainedWindowS` phần tử, đúng cách Android
        /// (`BandwidthPolicy.sustainedKbps`) tính "đỉnh bền vững".
        private var rateSamples: [Int] = []
        private var rateSamplesUp: [Int] = []
        /// Byte HAI CHIỀU mỗi giây — dùng cho cổng "tải thật" của iOS (`realLoadMinBytes`).
        private var bytesSamples: [Int] = []
        private var sampleIndex = 0
        /// Số mẫu đã có (≤ `sustainedWindowS`) — chưa đủ 3 mẫu thì KHÔNG coi là "đã đo được".
        private var sampleCount = 0
        /// Số mẫu LIÊN TIẾP dưới `samplerIdleKbps` (Android `idleRun`) — xem khai báo `private(set)`
        /// ở trên (cần đọc được để in log `sample`).
        /// Mốc bắt đầu "đỉnh bền vững vượt trần đang khai" / "tụt sâu" — phải LIÊN TỤC
        /// `rampHoldS` mới đổi số (Android `overSince`/`underSince`).
        private var overSince: Date?
        private var underSince: Date?
        /// Mốc lần đổi số gần nhất — hai lần đổi cách nhau ≥ `rampCooldownS` (Android).
        private var lastRampChangeAt: Date?
        /// Số mẫu LIÊN TIẾP có dấu hiệu mất gói (proxy bất đối xứng gói của utun, KHÔNG phải
        /// loss% của QUIC — xem `BandwidthPolicy.hasTransportLossSignal`) + cửa sổ đếm.
        private var lossFails = 0
        private var lossWindow: [Bool] = []
        /// A10 §2g — "mức đã khoá (stable)": số khai đang được chứng minh bền (goodput đạt ≥95%
        /// số khai) liên tục ≥ `rampHoldS`. Đây là MỐC HIỂN THỊ (nhãn "Mức đã khoá").
        private(set) var stableDownKbps: Int?
        private var stableSince: Date?
        private var lastSavedPeakUp = 0
        private var lastSavedPeakDown = 0
        private var rampEvents: Int
        /// Lần cuối đọc lại danh tính mạng (đọc bảng route + SSID không rẻ: xem `identityRefresh`).
        private var identityCheckedAt = Date.distantPast
        /// Ghi nhớ `NWPath` của lần kiểm tra trước để biết mạng có ĐỔI không.
        private var lastPathInterface: String?
        private static let identityRefresh: TimeInterval = 5

        /// `preMeasuredKbps` = số ĐO TƯƠI của mạng nền TRƯỚC khi mở client (A8 §2e, xem
        /// `BandwidthControl.preMeasure`). `0` = đo hỏng ⇒ lùi về bộ nhớ/nấc tĩnh.
        init(identity: NetworkIdentity, preMeasuredKbps: Int = 0) {
            // Wired/cellular cũng có thể chạy nhưng feature này làm cho Wi-Fi của iPad; các
            // loại khác vẫn chạy được vì chỉ khác KHOÁ, không khác logic.
            self.identity = identity
            self.key = identity.preferredKey
            let memory = BandwidthControl.loadMemory()
            self.memory = memory
            let remembered = BandwidthControl.remembered(memory, identity: identity)
            // Bản ghi gần nhất + đỉnh: lần sau vào cùng mạng bắt đầu từ đúng chỗ đã đạt.
            let base = remembered?.entry
            self.lossSeen = base?.lossBackoffSeen ?? false
            // Số ĐO đáng tin của bản ghi. Ưu tiên `measuredDownKbps` (số đo GẦN NHẤT — đúng
            // ngữ nghĩa `bw_kbps_` của Android); bản ghi CŨ (chưa có trường đó) thì lùi về đỉnh
            // `peakDownKbps` nếu nó đủ lớn — xem `trustedMeasuredDownKbps`. Đây là chỗ chặn bộ
            // nhớ nhiễm: có bản ghi mà KHÔNG có đỉnh đo thì coi như chưa có bộ nhớ.
            let rememberedMeasured = base.map { entry -> Int in
                entry.measuredDownKbps > 0
                    ? entry.measuredDownKbps
                    : BandwidthControl.trustedMeasuredDownKbps(entry)
            } ?? 0
            // Số ĐO dùng cho LƯỚI AN TOÀN loss cao bên dưới: số đo TƯƠI thắng bộ nhớ (mạng có thể
            // đã khác); đo hỏng mới lùi về số đã nhớ. Đường đi thường (không loss cao) không dùng
            // biến này nữa — nó nằm trong `RampStatus.StartupDeclaration.decide`.
            let measured = preMeasuredKbps > 0 ? preMeasuredKbps : rememberedMeasured
            let highLoss = base?.lossBackoffSeen ?? false

            let decidedUp: Int
            let decidedDown: Int
            let decidedReason: Reason
            let decidedCeiling: Int
            if highLoss {
                // §2h luật 1 — đường ĐANG loss cao: bỏ `best` cũ, khởi điểm ≤ 4/1 Mbps. Đây là
                // lưới an toàn riêng của iOS (Android không có nhánh này vì loss của nó đo được
                // trực tiếp và `decide` đã xử lý); giữ lại để không regress A11.
                let safe = RampStatus.safeDeclaration(
                    measuredDownKbps: measured,
                    rememberedDownKbps: base?.lastDownKbps ?? 0,
                    staticDownKbps: BandwidthControl.fallbackDownKbps,
                    staticUpKbps: BandwidthControl.fallbackUpKbps,
                    highLoss: true
                )
                decidedUp = safe.upKbps
                decidedDown = safe.downKbps
                decidedReason = .lossBackoff
                decidedCeiling = max(safe.downKbps, BandwidthControl.minKbps)
            } else {
                // 25/09/2026 — LUẬT KHỞI ĐIỂM RIÊNG CỦA iOS nằm ở `RampStatus.StartupDeclaration`
                // (hàm THUẦN, có test): số đo TƯƠI thắng bộ nhớ · kẹp trần theo NẤC TĨNH của loại
                // mạng (Wi-Fi 30/100, di động 8/12 — không bao giờ khai số Wi-Fi lên 4G) · kẹp
                // `best ≤ 1,5 × số đo đã nhớ` · mạng mới + đo hỏng ⇒ khởi điểm thận trọng 8/12.
                // KHÔNG sửa `BandwidthPolicy.decide` (bản port 1-1 từ Android, có test đối chiếu).
                let startup = RampStatus.StartupDeclaration.decide(
                    freshMeasuredDownKbps: preMeasuredKbps,
                    hadMemory: remembered != nil,
                    rememberedMeasuredKbps: rememberedMeasured,
                    rememberedDeclaredKbps: base?.lastDownKbps ?? 0,
                    rememberedPreviousMeasuredKbps: base?.previousMeasuredDownKbps ?? 0,
                    rememberedBestKbps: base?.peakDownKbps ?? 0,
                    networkKind: identity.kind,
                    // iOS KHÔNG đọc được link speed (xem `linkSpeedKbps`) ⇒ 0 = "không biết trần
                    // vật lý", policy dùng `hardCeilKbps` — đúng ý nghĩa tham số bên Android.
                    ceilingDownKbps: 0
                )
                decidedUp = startup.upKbps
                decidedDown = startup.downKbps
                decidedReason = BandwidthControl.reason(from: startup.reason)
                decidedCeiling = startup.ceilingDownKbps
            }
            self.upKbps = BandwidthControl.clamp(decidedUp)
            self.downKbps = BandwidthControl.clamp(decidedDown)
            self.ceilingDownKbps = max(decidedCeiling, BandwidthControl.minKbps)
            // Bộ nhớ đã đạt mức nào thì coi như vòng ramp trước đã dùng (Android cũng vậy: số
            // lần ramp chỉ để chẩn đoán; quyết định nằm ở `measured`/`best`).
            self.rampEvents = base?.rampEvents ?? 0
            self.planReason = decidedReason
        }

        /// Số khai lúc này (đọc thuần, không side effect).
        var plan: Plan {
            Plan(upKbps: upKbps, downKbps: downKbps, reason: planReason)
        }

        /// A10 §2g — dựng số hiển thị cho thẻ Diagnostics từ trạng thái phiên + số byte live do
        /// provider đo mỗi 1s. `serving == false` (tunnel chưa có byte) ⇒ mọi số `—`, không `0`.
        func diagnostics(
            liveDownKbps: Int?,
            liveUpKbps: Int?,
            serving: Bool,
            probeNoGain: Bool
        ) -> RampStatus.Display {
            // Trần sức mạng THẬT chưa có ở bước này (A8 `RawLinkProbe` + kênh dò §2c là bước
            // sau) — trần của engine (`peak × 1,5`) chỉ để CHẶN ramp, không phải sức mạng thật
            // nên không dùng làm mốc "đã tối đa". Vì vậy truyền `nil`: mục tiêu = đo được × hệ
            // số ramp, và "Đã tối đa" chỉ bật khi kênh dò kết luận `no gain` (`probeNoGain`).
            return RampStatus.display(
                serving: serving,
                downKbps: liveDownKbps,
                upKbps: liveUpKbps,
                observedKbps: everMeasured ? lastAverageDownKbps : nil,
                declaredDownKbps: downKbps,
                declaredUpKbps: upKbps,
                ceilingKbps: nil,
                stableKbps: stableDownKbps,
                probeNoGain: probeNoGain
            )
        }

        /// Thay đổi HẠ số khai đang chờ đã quá hạn "chờ tunnel rảnh" chưa.
        ///
        /// H1 (24/09/2026): provider chỉ dùng cờ này để GHI LOG (đã chờ quá hạn, vẫn chờ ranh
        /// giới rảnh) — KHÔNG còn dùng để buộc dựng lại transport khi đang chở traffic, vì đo
        /// thật cho thấy làm vậy thì tầng Go ngừng đọc fd và cầu bỏ 100% gói.
        func pendingForceExpired(_ now: Date) -> Bool {
            guard pendingChange, pendingIsDecrease, let pendingSince else { return false }
            return now.timeIntervalSince(pendingSince) >= BandwidthControl.pendingForceAfter
        }

        /// Đánh dấu "có thay đổi đang chờ áp" + mốc thời gian. Đã có thay đổi đang chờ thì GIỮ
        /// mốc cũ: nếu nhịp 1s nào đó đặt lại mốc, hạn buộc áp sẽ không bao giờ tới.
        ///
        /// 24/09/2026: **không còn ai gọi** — mọi thay đổi số khai nay đi thẳng vào bộ nhớ theo
        /// mạng rồi provider ÁP NGAY trong phiên (`commitRampPlan` đánh dấu `pending`, provider giải
        /// quyết ở nhịp kế tiếp qua `RampStatus.ApplyGate`). Giữ hàm này vì vẫn là chỗ đặt mốc
        /// `pendingSince` — thứ `ApplyGate` dùng để biết đã chờ bao lâu.
        private func markPending(_ reason: Reason, decrease: Bool, at now: Date) {
            if !pendingChange { pendingSince = now }
            pendingChange = true
            pendingReason = reason
            pendingIsDecrease = pendingIsDecrease || decrease
        }

        // MARK: Lấy mẫu 1s — vòng ramp port từ Android `HysteriaVpnService.startBandwidthSampler`

        /// Một mẫu byte (nhịp 1 s). Trả về quyết định khi số khai đổi.
        ///
        /// **KHÔNG dựng lại transport**: số mới được chốt + ghi bộ nhớ rồi để dành cho LẦN KẾT
        /// NỐI SAU (`apply=deferred-next-connect`, xem `allowsTransportRebuild`). Ngoại lệ duy
        /// nhất được dựng lại transport giữa phiên là tunnel hỏng thật (watchdog H2).
        func sample(
            bytes: ByteSample,
            packetsIn: Int,
            packetsOut: Int,
            at now: Date,
            path: NWPath?
        ) -> RampDecision? {
            defer { baseline = bytes; baselineAt = now }
            // Đổi mạng giữa phiên: khoá bộ nhớ phải theo mạng mới (xem
            // `refreshNetworkIdentityIfNeeded`). Đường dò này KHÔNG phải đường duy nhất: provider
            // còn gọi nó từ nhịp RIÊNG và từ sự kiện WS relay mở lại, vì nhịp lấy mẫu có thể đã
            // ngừng (sự cố thật 02:21 iPhone 1.4.5/34 — xem `WSRelayClient.onLinkReopened`).
            _ = refreshNetworkIdentityIfNeeded(path: path, force: false, now: now)

            guard let baseline else { return nil }
            let dt = now.timeIntervalSince(baselineAt)
            guard dt >= 0.5, dt <= 5 else { return nil }
            let deltaIn = Double(bytes.inbound - baseline.inbound)
            let deltaOut = Double(bytes.outbound - baseline.outbound)
            // Bộ đếm bị reset (interface dựng lại) ⇒ bỏ mẫu, lấy mốc mới.
            guard deltaIn >= 0, deltaOut >= 0 else { return nil }

            // Tốc độ 1 giây, đơn vị kbps — byte × 8 / ms = kbps, CÙNG công thức Android.
            let kbpsDown = Int(deltaIn * 8 / 1000 / dt)
            let kbpsUp = Int(deltaOut * 8 / 1000 / dt)
            if deltaIn + deltaOut >= Double(BandwidthControl.busyBytesPerSecond) * dt {
                lastActivityAt = now
            }

            // Vòng ring mẫu — nguồn DUY NHẤT của "đỉnh bền vững" (Android `samples` + `count`).
            if rateSamples.count < RampStatus.BandwidthPolicy.sustainedWindowS {
                rateSamples.append(kbpsDown)
                rateSamplesUp.append(kbpsUp)
                bytesSamples.append(Int(deltaIn + deltaOut))
                sampleCount = rateSamples.count
            } else {
                rateSamples[sampleIndex] = kbpsDown
                rateSamplesUp[sampleIndex] = kbpsUp
                bytesSamples[sampleIndex] = Int(deltaIn + deltaOut)
                sampleIndex = (sampleIndex + 1) % RampStatus.BandwidthPolicy.sustainedWindowS
            }
            let sustained = RampStatus.BandwidthPolicy.sustainedKbps(
                samples: rateSamples, count: sampleCount
            )
            let sustainedUp = RampStatus.BandwidthPolicy.sustainedKbps(
                samples: rateSamplesUp, count: sampleCount
            )
            lastAverageDownKbps = sustained
            lastAverageUpKbps = sustainedUp

            // `idleRun` — số mẫu LIÊN TIẾP coi là RẢNH (dưới `samplerIdleKbps`). Đây là cổng
            // chặn đúng lỗi "mẫu rỗng (`observed=0`) ⇒ hạ số khai oan": khách đang đọc chứ
            // không tải thì KHÔNG bao giờ được coi là "đường chậm hơn số khai".
            if kbpsDown < RampStatus.BandwidthPolicy.samplerIdleKbps {
                idleRun += 1
            } else {
                idleRun = 0
            }

            // CỔNG "TẢI THẬT" của iOS (xem `realLoadMinBytes`): đủ byte hai chiều VÀ đa số mẫu
            // có tải. CHỈ khi qua cổng này mới được coi là "đã đo" và mới được phép hạ số khai —
            // mẫu nền (~500 kbps khi khách đang đọc) bị chặn ở đây.
            let windowBytes = bytesSamples.reduce(0, +)
            let busySamples = rateSamples.prefix(sampleCount).filter {
                $0 >= RampStatus.BandwidthPolicy.samplerIdleKbps
            }.count
            let realLoad = RampStatus.BandwidthPolicy.hasRealLoad(
                windowBytes: windowBytes, busySamples: busySamples, totalSamples: sampleCount
            )
            lastRealLoad = realLoad
            lastWindowBytes = windowBytes
            // ĐỈNH chỉ được ghi nhận khi có tải THẬT: "đỉnh" là bằng chứng đường chở được bao
            // nhiêu, không phải con số nhặt được lúc khách đang đọc báo. Nhờ vậy bộ nhớ theo mạng
            // (`peakDownKbps` = `best` của Android) không bị nhiễm mẫu rỗng.
            if realLoad {
                peakDownKbps = max(peakDownKbps, sustained)
                peakUpKbps = max(peakUpKbps, sustainedUp)
                hasRealMeasurement = true
            }
            // `everMeasured` = "đã có số để HIỆN / để kẹp trần" (≥3 mẫu và có traffic) — KHÁC
            // `hasRealMeasurement` = "đã ĐO được băng thông thật" (điều kiện ghi bộ nhớ).
            if sampleCount >= 3, sustained > BandwidthControl.minKbps || sustainedUp > BandwidthControl.minKbps {
                everMeasured = true
            }

            // Proxy MẤT GÓI của iOS — **KHÔNG** phải loss% của QUIC (framework chỉ mở
            // MobileConnect/Serve/Stop; xem `BandwidthPolicy.hasTransportLossSignal`). Dấu hiệu
            // duy nhất nhìn được là bộ đếm gói utun: máy gửi gói vào tunnel mà gần như không có
            // gói nào quay về. Vì là proxy nên phải hội đủ điều kiện mới kết luận (xem dưới).
            let lossNow = packetsOut >= BandwidthControl.lossMinPacketsPerSample
                && packetsIn <= packetsOut / BandwidthControl.lossInboundDivisor
            lossWindow.append(lossNow)
            if lossWindow.count > RampStatus.BandwidthPolicy.lossWindow { lossWindow.removeFirst() }
            lossFails = lossNow ? lossFails + 1 : 0
            let lossPct = lossWindow.isEmpty
                ? 0
                : lossWindow.filter { $0 }.count * 100 / lossWindow.count
            lastLossProxyPct = lossPct

            // Ghi đỉnh vào bộ nhớ (dùng được cả khi tunnel bị đứt giữa phiên).
            persistPeaksIfNeeded()

            // A10 §2g — mốc "đã khoá (stable)". Android parity (24/09/2026 tối): Android lấy mốc
            // này là **sustained ≥ FULLHD_KBPS (8 Mbps) giữ ≥10 s** (`HysteriaVpnService.kt:1524-1532`),
            // KHÔNG phải "≥95% số khai" như bản iOS trước ⇒ hai máy cùng mạng hiện hai số khác nhau.
            let stableNow = sustained >= RampStatus.fullHDKbps
            if stableNow {
                if stableSince == nil { stableSince = now }
                if let since = stableSince,
                   now.timeIntervalSince(since) >= RampStatus.BandwidthPolicy.rampHoldS {
                    // Ghi chính mức ĐO được đã chứng minh bền (giống Android), không phải số khai.
                    stableDownKbps = sustained
                }
            } else {
                stableSince = nil
                stableDownKbps = nil
            }

            // Cần ≥3 mẫu mới xét ramp: trung bình của 1–2 mẫu không phải "đỉnh bền vững".
            guard sampleCount >= 3 else { return nil }
            // Đang có số mới CHỜ ÁP ⇒ chưa chốt thêm số nữa (tránh xếp hàng nhiều lần dựng lại).
            // Provider sẽ áp — hoặc bỏ — số đang chờ ở nhịp kế tiếp (xem `RampStatus.ApplyGate`).
            guard !pendingChange else { return nil }
            // Hai lần đổi số cách nhau ≥ `rampCooldownS` (Android `RAMP_COOLDOWN_MS`).
            if let last = lastRampChangeAt,
               now.timeIntervalSince(last) < RampStatus.BandwidthPolicy.rampCooldownS {
                return nil
            }

            // TRẦN của vòng ramp. Android lấy trần sức mạng VẬT LÝ (linkSpeed+RSSI / loại mạng);
            // iOS KHÔNG đọc được link speed (xem `linkSpeedKbps`) ⇒ lấy trần suy từ ĐỈNH ĐO
            // (`peak × measuredSafety`) — đúng phương án dự phòng của file này. Ghi rõ: đây là
            // DỮ LIỆU THIẾU của iOS, không phải số bịa.
            let link = BandwidthControl.linkSpeedKbps(identity: identity)
            let ceiling = BandwidthControl.effectiveCeiling(
                measured: everMeasured ? peakDownKbps : nil,
                link: link,
                everMeasured: everMeasured
            ) ?? BandwidthControl.maxKbps
            let floor = RampStatus.BandwidthPolicy.floorDownKbps

            // (a) HẠ vì MẤT GÓI. iOS **không** có loss%/RTT của QUIC (framework chỉ mở
            // MobileConnect/Serve/Stop — xem `BandwidthPolicy.hasTransportLossSignal`), nên đây
            // là proxy bất đối xứng gói của utun. Vì là PROXY, phải hội đủ CẢ BA điều như Android
            // mới kết luận (bài học thật 21–22/09: chỉ cần 1 lần probe fail là hạ ⇒ 50 lần
            // `loss-backoff` trong 11,7 giờ dù traffic vẫn chảy 12–35 Mbps):
            //   1) hỏng LIÊN TIẾP ≥3 mẫu, 2) tỉ lệ ≥2% cửa sổ, 3) goodput đã TỤT THẬT (< 1/4 số khai).
            //   Cộng thêm 4) ĐANG có TẢI THẬT — không thì một phiên khách chỉ đọc báo cũng đủ
            //   "gói ra nhiều, gói về ít" để hạ khai oan.
            let goodputCollapsed = sustained < max(
                RampStatus.BandwidthPolicy.floorDownKbps, downKbps / 4
            )
            let lossBad = realLoad
                && lossFails >= RampStatus.BandwidthPolicy.lossConsecutiveFails
                && lossPct >= RampStatus.BandwidthPolicy.rampLossPct
                && goodputCollapsed
            if lossBad {
                overSince = nil
                underSince = nil
                let newDown = RampStatus.BandwidthPolicy.rampDown(
                    currentKbps: downKbps, ceilingKbps: ceiling, floorKbps: floor
                )
                if newDown < downKbps {
                    return commitRampPlan(
                        newDownKbps: newDown,
                        reason: .lossBackoff,
                        observedKbps: sustained,
                        at: now
                    )
                }
                return nil
            }

            // (a0) TỤT SÂU — CHỈ khi ĐANG có TẢI THẬT. Đây chính là cổng chặn lỗi "mẫu rỗng
            // (`observed=0`) ⇒ hạ số khai oan": khách đang đọc chứ không tải thì KHÔNG bao giờ
            // vào nhánh này. Android cũng có cổng tương đương (`val busy = idleRun == 0`); iOS
            // dùng cổng CHẶT HƠN (`hasRealLoad`: đủ byte hai chiều + đa số mẫu có tải) vì bộ đếm
            // utun vẫn nhúc nhích lúc khách không tải. Phải LIÊN TỤC `rampHoldS` mới hạ, và CHỈ
            // hạ một bậc ×0,7 (không nhảy thẳng về f(số đo) như bản cũ — chính bước nhảy đó biến
            // một mẫu rỗng thành "hạ oan").
            // (3)+(5) CẤM hạ khai chỉ vì goodput thấp: phải có BẰNG CHỨNG NGHẼN, và không được
            // hạ khi `best ≥ 2 × declared` (số khai đang sai vì bị hạ, không phải đường yếu).
            let underrunGate = RawLinePolicy.downRampAllowed(
                rawLineKbps: rawLineKbps,
                rawLineAge: now.timeIntervalSince(rawLineAt),
                consecutiveLowRawLine: lowRawLineStreak,
                asymmetryEvidence: congestionEvidence,
                bestKbps: peakDownKbps,
                declaredKbps: downKbps
            )
            if underrunGate != .allow, realLoad,
               RampStatus.BandwidthPolicy.shouldRampDownUnderrun(
                   sustainedKbps: sustained, declaredKbps: downKbps
               ),
               now.timeIntervalSince(lastUnderrunRefusalLogAt) >= 30 {
                lastUnderrunRefusalLogAt = now
                RelayDiagnostics.shared.log(
                    "bw: KHÔNG hạ số khai — "
                        + (underrunGate == .refuseBestGuard
                           ? "best \(peakDownKbps) ≥ 2 × declared \(downKbps) ⇒ số khai đang sai vì bị hạ, chờ đo lại đường thật"
                           : underrunGate == .refuseNeedSecondSample
                           ? "bỏ qua hạ — mới \(lowRawLineStreak)/\(RawLinePolicy.lowRawLineSamplesRequired) lần đo đường thật thấp (rawline=\(rawLineKbps), declared=\(downKbps))"
                           : underrunGate == .refuseRawLineHigh
                           ? "đường thật \(rawLineKbps)kbps ≥ số khai \(downKbps)kbps (goodput thấp do ghìm/khách giới hạn, không phải đường yếu)"
                           : "không có bất đối xứng thật (gói về vẫn có) — observed=\(sustained)")
                )
            }
            // Android parity (24/09/2026 tối): Android chỉ đòi `busy = idleRun == 0` (mẫu gần nhất
            // đều có byte) cho bước HẠ, KHÔNG đòi ≥1 MB/12 s. Cổng `realLoad` cũ cộng với cổng
            // rawline (`downRampAllowed` cần rawline TƯƠI, mà probe chỉ chạy khi rảnh ≥120 s hoặc
            // observed ≥0,9×declared — `LivenessWatchdog.shouldProbe`) tạo ra KẸT CỨNG: khai vống
            // + đang tải ⇒ không hạ được, cũng không lên được (`shouldRampUp` đòi observed
            // ≥1,15×declared) ⇒ số khai đứng im cả phiên, đúng triệu chứng "không ramp".
            // Vẫn giữ nguyên 2 rào: `refuseBestGuard` (best ≥ 2×declared ⇒ số khai đang sai vì bị
            // hạ, không phải đường yếu) và ngưỡng `underrunPct`.
            let busyNow = idleRun == 0 && busySamples > 0
            let downAllowed = (underrunGate == .allow && realLoad)
                || (busyNow && underrunGate != .refuseBestGuard)
            if downAllowed, RampStatus.BandwidthPolicy.allowsUnderrunBackoff(
                hasRealLoad: realLoad || busyNow, sustainedKbps: sustained, declaredKbps: downKbps
            ) {
                if underSince == nil { underSince = now }
            } else {
                // GHI RÕ LÝ DO TỪ CHỐI (yêu cầu "log lý do khi từ chối clamp vì mẫu không đủ
                // tải"), nhưng THROTTLE 30 s/lần: nhịp lấy mẫu là 1 s nên log mỗi nhịp là ngập
                // file (file log có trần 512 KB, ngập là mất bằng chứng cũ).
                if !realLoad,
                   RampStatus.BandwidthPolicy.shouldRampDownUnderrun(
                       sustainedKbps: sustained, declaredKbps: downKbps
                   ),
                   now.timeIntervalSince(lastLoadRefusalLogAt) >= 30 {
                    lastLoadRefusalLogAt = now
                    RelayDiagnostics.shared.log(
                        "bw: KHÔNG hạ số khai — mẫu chưa đủ TẢI THẬT "
                            + "(cửa sổ \(windowBytes)B/\(Int(RampStatus.BandwidthPolicy.rampHoldS))s, "
                            + "mẫu có tải \(busySamples)/\(sampleCount), idleRun=\(idleRun), "
                            + "observed=\(sustained), declared=\(downKbps)) — chờ tải thật"
                    )
                }
                underSince = nil
            }
            if let since = underSince,
               now.timeIntervalSince(since) >= RampStatus.BandwidthPolicy.rampHoldS {
                underSince = nil
                let newDown = RampStatus.BandwidthPolicy.rampDown(
                    currentKbps: downKbps, ceilingKbps: ceiling, floorKbps: floor
                )
                if newDown < downKbps {
                    return commitRampPlan(
                        newDownKbps: newDown,
                        reason: .memory,
                        logReason: RampStatus.BandwidthPolicy.reasonUnderrunBackoff,
                        observedKbps: sustained,
                        at: now
                    )
                }
                return nil
            }

            // (b) TĂNG — Android `shouldRampUp` + `RAMP_HOLD_MS`: đỉnh bền vững vượt số khai
            // ≥15% LIÊN TỤC ≥10 s ⇒ ×1,25 (kẹp trần/sàn). Đây là bước DUY NHẤT được tăng giữa
            // phiên; và vì áp kiểu `deferred-next-connect`, nó KHÔNG cắt stream nào.
            if RampStatus.BandwidthPolicy.shouldRampUp(
                sustainedKbps: sustained, declaredKbps: downKbps
            ) {
                if overSince == nil { overSince = now }
            } else {
                overSince = nil
            }
            if let since = overSince,
               now.timeIntervalSince(since) >= RampStatus.BandwidthPolicy.rampHoldS {
                overSince = nil
                let newDown = RampStatus.BandwidthPolicy.rampUp(
                    currentKbps: downKbps, ceilingKbps: ceiling, floorKbps: floor
                )
                if newDown > downKbps {
                    return commitRampPlan(
                        newDownKbps: newDown,
                        reason: .ramp,
                        observedKbps: sustained,
                        at: now
                    )
                }
            }
            return nil
        }

        /// Bỏ số khai vừa chốt mà KHÔNG áp (lệch không đáng kể, hoặc đã tắt tự-áp cho phiên):
        /// trả `plan` về đúng số ĐANG chạy trong transport để log không nói dối (`plan=` khác
        /// `declared=` mà không có lý do là đọc log sai). Số đã ghi vào bộ nhớ theo mạng vẫn giữ
        /// nguyên — lần kết nối sau vẫn hưởng.
        func discardPendingPlan(activeUp: Int, activeDown: Int) {
            if activeUp > 0 { upKbps = BandwidthControl.clamp(activeUp) }
            if activeDown > 0 { downKbps = BandwidthControl.clamp(activeDown) }
            pendingChange = false
            pendingReason = nil
            pendingSince = nil
            pendingIsDecrease = false
        }

        /// Provider báo bằng chứng nghẽn của nhịp vừa rồi (gói bị bỏ / gói đưa vào).
        func noteCongestion(_ evidence: Bool) {
            congestionEvidence = evidence
        }

        /// Nhận SỐ ĐO ĐƯỜNG THẬT (pre-measure ngoài tunnel) và dùng nó để **kéo số khai ra khỏi
        /// mức thấp** — đây là lối thoát cho vòng kẹt "goodput ≤ số khai nên không bao giờ ramp".
        ///
        /// Hai việc, đúng yêu cầu 24/09/2026:
        ///   (4) SÀN: số khai không được thấp hơn 0,85 × đo thật;
        ///   (2) NÂNG: đo thật ≥ 1,3 × số khai ⇒ plan = 0,85 × đo thật, `reason=rawline`.
        /// Trả `true` nếu đã đổi plan (provider sẽ áp qua `retarget` như mọi lần khác).
        @discardableResult
        func noteRawLine(kbps: Int, at now: Date) -> Bool {
            guard kbps > 0 else { return false }
            rawLineKbps = kbps
            rawLineAt = now
            // Đếm chuỗi "đường thật thấp hơn số khai" (cách nhau ≥60 s mới tính liên tiếp).
            if kbps < downKbps {
                if now.timeIntervalSince(lastLowRawLineAt) >= RawLinePolicy.lowRawLineMinSpacing {
                    lowRawLineStreak += 1
                    lastLowRawLineAt = now
                }
            } else {
                lowRawLineStreak = 0
            }
            // Sàn theo đường thật: kéo lên nếu số khai đang thấp hơn 0,85 × đo thật.
            let floor = RawLinePolicy.floorKbps(measuredRealKbps: kbps)
            let target = max(floor, RawLinePolicy.rawLineUpTarget(
                measuredRealKbps: kbps, declaredKbps: downKbps
            ) ?? 0)
            guard target > downKbps else { return false }
            let oldUp = upKbps
            let oldDown = downKbps
            downKbps = BandwidthControl.clamp(target)
            upKbps = BandwidthControl.clamp(tierUpKbps(forDownKbps: downKbps))
            planReason = .ramp
            lastRampChangeAt = now
            markPending(.ramp, decrease: false, at: now)
            persistPeaksIfNeeded(force: true)
            RelayDiagnostics.shared.log(
                "bw: ramp net=\(key) old=\(oldUp)/\(oldDown) new=\(upKbps)/\(downKbps) "
                    + "reason=rawline đo-đường-thật=\(kbps)kbps plan=\(downKbps) apply=pending "
                    + "(85% × đo thật; goodput qua tunnel không vượt được số khai nên cần lối này)"
            )
            return true
        }

        /// Chốt số khai mới vào PLAN + đánh dấu ĐANG CHỜ ÁP, rồi trả quyết định cho provider GHI LOG.
        ///
        /// 24/09/2026 (chủ dự án): *"nó phải tự ramp mà không cần người dùng connect lại"* ⇒ số mới
        /// được **áp ngay trong phiên** bởi provider (`applyBandwidthRampIfIdle` → `ApplyGate`),
        /// KHÔNG còn hoãn hết sang lần kết nối sau. Cờ `pending` chính là tín hiệu "có số mới cần
        /// áp"; provider tự quyết lúc rảnh / sau 20 s chờ / tắt cho hết phiên.
        private func commitRampPlan(
            newDownKbps: Int,
            reason: Reason,
            logReason: String? = nil,
            observedKbps: Int,
            at now: Date
        ) -> RampDecision {
            let oldUp = upKbps
            let oldDown = downKbps
            downKbps = BandwidthControl.clamp(newDownKbps)
            // Chiều LÊN suy từ chiều XUỐNG theo đúng tỉ lệ nấc tĩnh CỦA LOẠI MẠNG đang dùng,
            // như Android `HysteriaVpnService.ratioUpFrom` (25/09/2026 — trước đây iOS luôn dùng
            // 30/100 của Wi-Fi cho mọi mạng ⇒ máy trên 4G khai chiều lên quá cao).
            upKbps = BandwidthControl.clamp(tierUpKbps(forDownKbps: downKbps))
            planReason = reason
            lastRampChangeAt = now
            rampEvents += 1
            if reason == .lossBackoff { lossSeen = true }
            // Đánh dấu đang chờ ÁP: provider áp ở nhịp 1 s kế tiếp nếu đủ điều kiện (`ApplyGate`).
            markPending(reason, decrease: downKbps < oldDown, at: now)
            // Chốt NGAY vào bộ nhớ theo mạng: nếu phiên kết thúc trước khi áp được (hoặc bị tắt
            // tự-áp), lần kết nối sau vẫn bắt đầu ở số mới.
            persistPeaksIfNeeded(force: true)
            return RampDecision(
                multiplierUp: nil,
                multiplierDown: nil,
                reason: reason,
                logReasonOverride: logReason,
                observedKbps: observedKbps,
                oldUpKbps: oldUp,
                oldDownKbps: oldDown,
                newUpKbps: upKbps,
                newDownKbps: downKbps
            )
        }

        // MARK: Áp quyết định

        /// Provider đã dựng lại transport với số khai mới: chốt lại + ghi bộ nhớ.
        ///
        /// 24/09/2026: **không còn đường gọi** từ nhịp lấy mẫu (`allowsTransportRebuild = false`)
        /// — chỉ watchdog H2 dựng lại transport, và nó không đổi số khai. Giữ hàm để đường lùi
        /// (nếu sau này có ngoại lệ "tunnel hỏng thật") vẫn còn nguyên hành vi cũ.
        func applied(_ decision: RampDecision, ceiling: Int?) {
            upKbps = decision.newUpKbps
            downKbps = decision.newDownKbps
            if let ceiling { upKbps = min(upKbps, ceiling); downKbps = min(downKbps, ceiling) }
            planReason = decision.reason
            rampEvents += 1
            pendingChange = false
            pendingReason = nil
            pendingSince = nil
            pendingIsDecrease = false
            stableSince = nil
            stableDownKbps = nil
            // 24/09/2026 — **KHÔNG xoá `peak*` (best) khi áp số khai.**
            //
            // Vì sao (lỗi thật): bản trước đặt `peakUpKbps = 0; peakDownKbps = 0` ở đây nên ngay
            // sau mỗi lần áp, log in `best=0` và phiên sau khởi điểm từ SÀN 1000 kbps thay vì đỉnh
            // đã chứng minh ~5,5 Mbps ⇒ tự bắn vào chân (khai thấp làm tunnel bị ghìm):
            //   `bw: net=… best=468 plan=up500/down1000 apply=pending`
            //   `bw: net=… best=0 (ramp áp idle-now)`      ← mất đỉnh đã nhớ
            // Android (`bw_best_`) chỉ GHI CAO LÊN và không bao giờ bị một lần áp làm hạ; `best`
            // là TRẦN ĐÃ CHỨNG MINH của đường nên phải sống qua mọi lần đổi số khai.
            persistPeaksIfNeeded(force: true)
        }

        /// Ghi số khai + đỉnh của phiên vào bộ nhớ (gọi khi kết thúc phiên hoặc khi có ramp).
        ///
        /// Port theo đúng bộ nhớ Android (`BandwidthMemory.remember` / `rememberBest`):
        ///   * `peakDownKbps` (best) — CHỈ GHI CAO LÊN, và CHỈ khi phiên đã có **tải thật**;
        ///   * cặp (`measuredDownKbps`, `lastDownKbps`) — số đo và số khai của CHÍNH lượt đo, để
        ///     lần kết nối sau biết số khai cũ có phải nút cổ chai không (4 dải 150/95/80%);
        ///   * `previousMeasuredDownKbps` — số đo LIỀN TRƯỚC, mốc giảm xóc `DAMPING_PCT = 60`.
        func persistPeaksIfNeeded(force: Bool = false) {
            // CHỈ ghi khi phiên này ĐÃ ĐO được băng thông THẬT (`hasRealMeasurement` = đã qua
            // cổng "tải thật" `realLoadMinBytes`). Vì sao là ràng buộc cứng:
            //   * bản build cũ ghi `lastUp/lastDown` ngay cả khi CHƯA đo gì ⇒ nấc tĩnh 30/100 Mbps
            //     đi thẳng vào bộ nhớ, lần sau đọc lại như "số đã học" (đúng dòng đã đo trên iPad
            //     19/09: `bw: net=wifi|if:en0 measured=1069 declared up=30000 down=100000 reason=memory`);
            //   * bản 24/09 ghi đỉnh cả khi khách chỉ ĐỌC (mẫu nền ~500 kbps) ⇒ bộ nhớ nhiễm số
            //     rỗng, lần sau khai thấp oan. Nay mẫu nền KHÔNG qua được cổng tải thật.
            guard hasRealMeasurement else { return }
            // Chỉ ghi khi đỉnh đã nhích đủ nhiều (hoặc khi được yêu cầu chốt): UserDefaults
            // không nên bị ghi mỗi giây.
            let moved = abs(peakUpKbps - lastSavedPeakUp) >= BandwidthControl.memoryWriteDeltaKbps
                || abs(peakDownKbps - lastSavedPeakDown) >= BandwidthControl.memoryWriteDeltaKbps
            guard force || moved else { return }
            lastSavedPeakUp = peakUpKbps
            lastSavedPeakDown = peakDownKbps
            var entry = memory[key] ?? Memory()
            // `bestKbps` của Android: CHỈ ghi cao lên, và chỉ với số đã chứng minh bằng tải thật.
            entry.peakUpKbps = max(entry.peakUpKbps, peakUpKbps)
            entry.peakDownKbps = max(entry.peakDownKbps, peakDownKbps)
            // Cặp (số đo, số khai) — chỉ cập nhật khi ĐỈNH ĐỔI thật, để `previousMeasured` là số
            // đo LIỀN TRƯỚC chứ không phải bản sao của chính nó (mốc giảm xóc mất tác dụng).
            let measuredNow = peakDownKbps
            if measuredNow != entry.measuredDownKbps {
                if entry.measuredDownKbps > 0 {
                    entry.previousMeasuredDownKbps = entry.measuredDownKbps
                }
                entry.measuredDownKbps = measuredNow
                // Số khai của CHÍNH lượt đo — đúng ngữ nghĩa `remember(key, measured, declared)`.
                entry.lastDownKbps = downKbps
                entry.lastUpKbps = upKbps
            } else if force {
                // Chốt cuối phiên: giữ cặp (đo, khai) đồng bộ với số khai vừa chốt.
                entry.lastDownKbps = downKbps
                entry.lastUpKbps = upKbps
            }
            entry.rampEvents = rampEvents
            entry.updatedAt = Date()
            // 25/09/2026 — KHÔNG ghi cờ này vào bộ nhớ theo mạng nữa: nó khoá số khai của
            // MỌI phiên sau ở ≤ 4 Mbps down / 1 Mbps up (`safeDeclaration`) ⇒ đúng kiểu "không bao
            // giờ ramp lên được". Android không có trạng thái dính này — mỗi phiên đo lại từ đầu.
            // Vẫn giữ hiệu lực TRONG phiên hiện tại qua `lossSeen` (biến cục bộ).
            memory[key] = entry
            BandwidthControl.saveMemory(memory)
        }

        /// Ghi số ĐO TƯƠI của phép đo TRƯỚC khi khai (A8 §2e) vào bộ nhớ theo mạng.
        ///
        /// Vì sao cần: đây là phép đo TẢI THẬT duy nhất mà iOS có (socket của extension KHÔNG đi
        /// qua tunnel ⇒ không probe được goodput qua tunnel như Android). Không ghi lại thì một
        /// phiên khách không tải gì sẽ không để lại số đo nào, và lần sau lại phải đo lại từ đầu.
        /// Ghi theo đúng cặp (measured, declared) của Android `BandwidthMemory.remember`.
        func recordPreMeasurement(measuredKbps: Int) {
            guard measuredKbps > 0 else { return }
            var entry = memory[key] ?? Memory()
            if entry.measuredDownKbps > 0, entry.measuredDownKbps != measuredKbps {
                entry.previousMeasuredDownKbps = entry.measuredDownKbps
            }
            entry.measuredDownKbps = measuredKbps
            entry.lastDownKbps = downKbps
            entry.lastUpKbps = upKbps
            entry.updatedAt = Date()
            memory[key] = entry
            BandwidthControl.saveMemory(memory)
        }

        /// Chốt lần cuối trước khi phiên kết thúc.
        func finish() {
            persistPeaksIfNeeded(force: true)
        }

        /// Prober phía provider gọi khi áp plan lúc dựng tunnel.
        func noteAppliedPlan(_ plan: Plan) {
            self.planReason = plan.reason
        }

        // MARK: Nội bộ

        private func refreshIdentity(_ identity: NetworkIdentity) {
            self.identity = identity
            self.key = identity.preferredKey
            self.memory = BandwidthControl.loadMemory()
        }

        /// Đọc lại danh tính mạng khi tới nhịp (hoặc khi `force`) và xử lý ĐỔI MẠNG.
        ///
        /// Trả `true` khi đây là ĐỔI MẠNG THẬT. Hàm này là chỗ DUY NHẤT được đụng vào
        /// `identity`/`key`/số đo của phiên, nên cả ba đường gọi dùng chung: nhịp lấy mẫu
        /// (`sample`), nhịp HIỂN THỊ 1 s của provider, và sự kiện `ws-relay: link đã mở lại`.
        ///
        /// Vì sao phải có đường gọi ngoài nhịp lấy mẫu: đo thật 02:21 iPhone 1.4.5/34 — phiên chỉ
        /// có 2 mẫu `bw: sample` rồi im suốt 3 phút (nhịp lấy mẫu trả về sớm vì
        /// `bandwidthBytes == nil`), nên bộ dò đặt trong nhịp đó **không bao giờ chạy** và ca
        /// WiFi→5G→WiFi không hề có dòng `bw: net đổi giữa phiên` nào ⇒ tunnel tự chống chịu qua
        /// link WS mới, tốc độ còn 0–550 kbps.
        ///
        /// `force = true` bỏ qua nhịp 5 s (dùng cho sự kiện WS mở lại — dấu hiệu mạnh nhất rằng
        /// đường nền vừa đổi).
        @discardableResult
        func refreshNetworkIdentityIfNeeded(path: NWPath?, force: Bool, now: Date = Date()) -> Bool {
            let interfaceNow = path?.availableInterfaces.first?.name
            let interfaceChanged = interfaceNow != nil && interfaceNow != lastPathInterface
            guard force || interfaceChanged || now.timeIntervalSince(identityCheckedAt) >= Self.identityRefresh
            else { return false }
            if interfaceChanged { lastPathInterface = interfaceNow }
            identityCheckedAt = now
            let identityNow = BandwidthControl.currentNetworkIdentity(path: path)
            // Danh tính CHƯA BIẾT (`other|if:unknown`: không có interface nào) KHÔNG phải một mạng
            // mới — giữ nguyên danh tính THẬT gần nhất. Nếu đổi sang khoá `unknown` thì (a) bản ghi
            // rác được ghi dưới khoá đó, và (b) lần mạng thật hiện ra sẽ bị coi là "danh tính vừa
            // rõ" ⇒ mất luôn một lần đổi mạng thật.
            guard !RampStatus.NetworkChangePolicy.isPlaceholderKey(identityNow.preferredKey) else {
                return false
            }
            guard identityNow.preferredKey != identity.preferredKey else { return false }
            // ĐỔI MẠNG THẬT hay chỉ là khoá cũ được viết cụ thể hơn? Dùng CÙNG luật với provider
            // (`RampStatus.NetworkChangePolicy`, hàm thuần có test) để hai nơi không bao giờ lệch:
            // `wifi|if:en0` -> `wifi|router:<MAC>` là CÙNG một mạng (bảng ARP có bản ghi router
            // muộn), `wifi|…` -> `cell|if:pdp_ip0` mới là đổi mạng.
            let isNewNetwork = RampStatus.NetworkChangePolicy.isRealChange(
                previousKey: identity.preferredKey, newLookupKeys: identityNow.lookupKeys
            )
            let previousLabel = identity.logLabel
            if isNewNetwork { resetMeasurementForNewNetwork() }
            refreshIdentity(identityNow)
            // Tách khỏi biểu thức `log(...)` bên dưới: để nguyên một chuỗi ghép + ternary dài trong
            // lời gọi làm type-checker báo "unable to type-check this expression in reasonable time".
            let detail = isNewNetwork
                ? "ĐỔI MẠNG THẬT ⇒ xoá đỉnh/số ĐO của mạng cũ (không ghi lẫn sang "
                    + "bộ nhớ mạng mới); số khai của mạng mới áp ở lần dựng lại/"
                    + "kết nối sau "
                : "khoá mạng chỉ đổi MỨC CỤ THỂ (cùng một mạng) ⇒ giữ số của "
                    + "phiên; số khai áp ở lần dựng lại/kết nối sau "
            RelayDiagnostics.shared.log(
                "bw: net đổi giữa phiên \(previousLabel) -> \(identityNow.logLabel) — "
                    + detail
                    + "apply=\(RampStatus.BandwidthPolicy.applyDeferred)"
            )
            return isNewNetwork
        }

        /// Mạng nền ĐỔI THẬT: mọi số ĐO/ĐỈNH của phiên đều thuộc mạng CŨ ⇒ xoá HẾT trước khi đo
        /// tiếp. Gọi NGAY TRƯỚC `refreshIdentity` (xem `sample`).
        ///
        /// Vì sao BẮT BUỘC (lỗi "lẫn số giữa các mạng", 25/09/2026): `refreshIdentity` đã đổi `key`
        /// và nạp lại `memory` cho mạng mới, nhưng `peakUp/DownKbps` vẫn là đỉnh của mạng CŨ; nhịp
        /// sau `persistPeaksIfNeeded` sẽ ghi đỉnh đó vào **bản ghi của MẠNG MỚI** (`memory[key]`) ⇒
        /// mạng mới thừa hưởng "đỉnh đã chứng minh" của mạng cũ (Wi-Fi 100 Mbps "di cư" sang 4G).
        /// Luật kẹp `best ≤ 1,5 × số đo` + kẹp nấc tĩnh chỉ giảm thiệt hại, KHÔNG chặn được gốc.
        ///
        /// Xoá cả `hasRealMeasurement` (cổng bắt buộc của `persistPeaksIfNeeded`) và
        /// `everMeasured` (trần ramp + số hiện trên thẻ): mạng mới CHƯA chứng minh được gì, nên
        /// phải đo lại từ đầu — đúng ngữ nghĩa `bw_best_`/`bw_kbps_` theo khoá mạng của Android.
        /// `lastSavedPeak*` cũng về 0 để cổng "đỉnh nhích đủ nhiều" không bắn với số 0.
        ///
        /// Xoá luôn bằng chứng của phiên CŨ vì chúng cũng thuộc mạng cũ: vòng mẫu 12 s
        /// (`rateSamples`/`bytesSamples` ⇒ "đỉnh bền vững" và cổng `realLoad`), mốc `stable`,
        /// `overSince`/`underSince`, proxy mất gói, và số đo ĐƯỜNG THẬT (`noteRawLine`). Giữ chúng
        /// lại thì vài giây đầu trên mạng mới bị quyết định bằng số của mạng cũ.
        private func resetMeasurementForNewNetwork() {
            peakUpKbps = 0
            peakDownKbps = 0
            lastSavedPeakUp = 0
            lastSavedPeakDown = 0
            hasRealMeasurement = false
            everMeasured = false
            lastAverageDownKbps = 0
            lastAverageUpKbps = 0
            lastRealLoad = false
            lastWindowBytes = 0
            idleRun = 0
            rateSamples.removeAll()
            rateSamplesUp.removeAll()
            bytesSamples.removeAll()
            sampleCount = 0
            sampleIndex = 0
            stableDownKbps = nil
            stableSince = nil
            overSince = nil
            underSince = nil
            lossFails = 0
            lossWindow.removeAll()
            lastLossProxyPct = 0
            rawLineKbps = 0
            rawLineAt = .distantPast
            lowRawLineStreak = 0
            lastLowRawLineAt = .distantPast
        }

        /// Chiều LÊN suy từ chiều XUỐNG theo tỉ lệ NẤC TĨNH CỦA LOẠI MẠNG **đang dùng**, không
        /// vượt nấc tĩnh chiều lên (bản iOS của Android `HysteriaVpnService.ratioUpFrom`).
        /// Luật nằm ở `RampStatus.NetworkTier.upKbps(forDownKbps:kind:)` để có test.
        private func tierUpKbps(forDownKbps down: Int) -> Int {
            RampStatus.NetworkTier.upKbps(forDownKbps: down, kind: identity.kind)
        }
    }

    /// Chuẩn hoá số khai: không âm, không vượt trần cứng.
    static func clamp(_ kbps: Int) -> Int {
        min(max(kbps, minKbps), maxKbps)
    }

    /// Dịch chuỗi `reason` của `RampStatus.BandwidthPolicy` (trùng chuỗi Android) sang enum của
    /// lớp này. Giữ chuỗi gốc làm nguồn sự thật duy nhất để log hai nền tảng grep giống nhau.
    static func reason(from label: String) -> Reason {
        switch label {
        case RampStatus.BandwidthPolicy.reasonMemory: return .memory
        case RampStatus.BandwidthPolicy.reasonClamp: return .clamp
        case RampStatus.BandwidthPolicy.reasonRamp: return .ramp
        case RampStatus.BandwidthPolicy.reasonLossBackoff: return .lossBackoff
        case RampStatus.StartupDeclaration.reasonCautious: return .cautious
        default: return .profile
        }
    }

    /// Số ĐO XUỐNG đáng tin của một bản ghi bộ nhớ (kbps). `0` = bản ghi KHÔNG có phép đo nào.
    ///
    /// Vì sao cần: bản build cũ ghi cả `lastUpKbps/lastDownKbps` khi **chưa đo gì** (nấc tĩnh
    /// 30/100 Mbps đi thẳng vào bộ nhớ), nên "có bản ghi" KHÔNG đồng nghĩa "có số đã học".
    /// Bằng chứng duy nhất của một phép đo là ĐỈNH (`peakDownKbps`) — nó chỉ được ghi khi
    /// tunnel thật sự chở dữ liệu (xem `persistPeaksIfNeeded`).
    static func trustedMeasuredDownKbps(_ entry: Memory) -> Int {
        entry.peakDownKbps >= minMeasuredKbps ? entry.peakDownKbps : 0
    }

    /// Số khai XUỐNG suy từ một phép ĐO (kbps) — hàm THUẦN, test được ngoài app.
    ///
    /// `rememberedDeclaredKbps` = số khai của lần đo đã nhớ (`0` nếu chưa có). Bốn dải của
    /// `pct` xem `jumpUpPct`/`saturatedPct`/`deadbandPct`. Đây là chỗ DUY NHẤT biến số đo
    /// thành số khai: **có số đo thì số khai là f(số đo), không bao giờ nâng lên nấc tĩnh**.
    static func downKbpsFromMeasurement(measuredDownKbps: Int, rememberedDeclaredKbps: Int) -> Int {
        guard measuredDownKbps >= minMeasuredKbps else { return 0 }
        // Chưa có số khai đi kèm (bản ghi cũ/thiếu) ⇒ coi như số khai cũ KHAI VƯỢT.
        let pct = rememberedDeclaredKbps > 0
            ? measuredDownKbps * 100 / rememberedDeclaredKbps
            : jumpUpPct
        if pct >= jumpUpPct { return measuredDownKbps * declareRatioPct / 100 }
        if pct >= saturatedPct { return rememberedDeclaredKbps * explorePct / 100 }
        if pct >= deadbandPct { return rememberedDeclaredKbps }
        return measuredDownKbps * declareRatioPct / 100
    }

    /// Kẹp số khai suy từ SỐ ĐO bằng trần/sàn. Hàm THUẦN (test được ngoài app).
    ///
    /// Trần = `max(nấc tĩnh, số đo)`: nấc tĩnh chỉ được CHẶN TRÊN (bản ghi cũ khai 100 Mbps mà
    /// đo được 1 Mbps thì trần không cứu được số đó — việc hạ do `downKbpsFromMeasurement`),
    /// và **không bao giờ được NÂNG số khai lên nấc tĩnh** — đúng lỗi đang sửa. Mạng đã ĐO
    /// được cao hơn nấc tĩnh thì trần theo số đo, nếu không mỗi lần kết nối lại bị kéo về
    /// 100 Mbps rồi ramp lên lại (dao động quanh nấc tĩnh).
    ///
    /// Chiều LÊN suy từ chiều XUỐNG theo đúng tỉ lệ của nấc tĩnh (`up/down` = 30/100): phép đo
    /// chỉ có chiều xuống, giữ nguyên độ bất đối xứng đã đo tốt.
    static func clampedDeclaration(
        downKbps: Int,
        measuredDownKbps: Int,
        staticDownKbps: Int = fallbackDownKbps,
        staticUpKbps: Int = fallbackUpKbps
    ) -> (upKbps: Int, downKbps: Int, clamped: Bool) {
        let ratioDown = max(staticDownKbps, 1)
        let ceilingDown = max(staticDownKbps, measuredDownKbps)
        var clamped = false
        var down = downKbps
        if down > ceilingDown { down = ceilingDown; clamped = true }
        if down < floorDownKbps, floorDownKbps <= ceilingDown { down = floorDownKbps; clamped = true }
        var up = down * staticUpKbps / ratioDown
        if up < floorUpKbps { up = floorUpKbps; clamped = true }
        return (min(up, maxKbps), min(down, maxKbps), clamped)
    }

    /// Số khai đang KHAI VƯỢT sức mạng thật: đo được dưới `underrunPct`% số khai.
    static func isUnderrun(averageKbps: Int, declaredKbps: Int) -> Bool {
        guard declaredKbps > 0, averageKbps >= minMeasuredKbps else { return false }
        return averageKbps * 100 < declaredKbps * underrunPct
    }

    /// Trần hiệu lực: min(link speed, số đo × biên an toàn). Chưa đo gì thì chỉ còn link speed.
    static func effectiveCeiling(measured: Int?, link: Int?, everMeasured: Bool = true) -> Int? {
        ceilingKbps(measuredKbps: measured, linkSpeedKbps: link, everMeasured: everMeasured)
    }

    /// Số khai (chiều xuống) có đang bị chặn trần không: dùng hết ≥85%.
    static func isSaturated(averageKbps: Int, declaredKbps: Int) -> Bool {
        guard declaredKbps > 0 else { return false }
        return Double(averageKbps) >= Double(declaredKbps) * saturatedRatio
    }

    /// Bão hoà rõ ràng (≥90%) ⇒ tăng mạnh hơn một bậc (tiết kiệm số vòng ramp).
    static func isClearlySaturated(averageKbps: Int, declaredKbps: Int) -> Bool {
        guard declaredKbps > 0 else { return false }
        return Double(averageKbps) >= Double(declaredKbps) * saturatedStrongRatio
    }
}

extension BandwidthControl {

    /// SSID/BSSID nếu iOS TRẢ VỀ — đường "cơ hội", không phải đường chính của bản build này.
    ///
    /// Theo header `NEHotspotNetwork.h` (SDK iPhoneOS 26.5), `fetchCurrent` trả SSID khi ứng
    /// dụng thoả MỘT trong bốn điều kiện (có quyền vị trí chính xác / đã cấu hình Wi-Fi bằng
    /// `NEHotspotConfiguration` / **đã cài cấu hình VPN đang hoạt động** / có `NEDNSSettingsManager`),
    /// **VÀ** phải có entitlement `com.apple.developer.networking.wifi-info`. Thiếu entitlement
    /// ⇒ trả `nil`:
    ///
    ///     An application will receive nil if it fails to meet any of the above 4 requirements.
    ///     An application will receive nil if does not have the "com.apple.developer.networking.wifi-info"
    ///     entitlement.
    ///
    /// Bản build này KHÔNG có entitlement đó (thêm ⇒ phải cấp lại provisioning profile + xin
    /// quyền vị trí ⇒ prompt mới cho khách), nên hàm gần như chắc chắn trả `nil`; khi đó khoá
    /// mạng lùi về MAC router (xem `NetworkIdentity`). Vẫn giữ đường này vì nó MIỄN PHÍ: ngày
    /// nào bản phát hành có entitlement thì SSID tự dùng được, không phải sửa code.
    static func currentWiFiNetwork() -> (ssid: String?, bssid: String?)? {
        #if os(iOS)
        if #available(iOS 14.0, *) {
            let semaphore = DispatchSemaphore(value: 0)
            let box = WiFiNetworkBox()
            NEHotspotNetwork.fetchCurrent { network in
                // `nil` là ca BÌNH THƯỜNG của bản build này (thiếu entitlement) — không log ồn ào.
                box.ssid = network?.ssid
                box.bssid = network?.bssid
                semaphore.signal()
            }
            // Closure chạy trên main queue của tiến trình: hàng đợi lấy mẫu (không phải main)
            // chờ ở đây tối đa 1s, và chỉ 5 giây một lần (xem `identityRefresh`).
            if semaphore.wait(timeout: .now() + 1) == .timedOut { return nil }
            return (box.ssid, box.bssid)
        }
        return nil
        #else
        return nil
        #endif
    }

    /// MAC của router (gateway) của mạng đang dùng — đọc từ bảng ARP bằng
    /// `sysctl(NET_RT_FLAGS, RTF_LLINFO)`.
    ///
    /// Vì sao dùng MAC router làm khoá mạng: cùng một router (một nhà/quán/cơ quan) ⇒ cùng khoá,
    /// khác router ⇒ khác khoá, mà KHÔNG cần entitlement nào.
    ///
    /// Vì sao KHÔNG dùng địa chỉ IP của gateway (đã thử và bỏ): mạng gia đình và gần như mọi
    /// Wi-Fi công cộng đều dùng `192.168.1.1`/`192.168.0.1`/`10.0.0.1` ⇒ khoá trùng nhau ở
    /// đúng những mạng cần phân biệt nhất. MAC của router thì khác nhau thật.
    ///
    /// Vì sao đọc được trên iOS: bảng ARP là dữ liệu kernel, cùng đường `sysctl` mà
    /// `HysteriaTransport.utunPacketCounters` đã dùng cho bộ đếm interface (không cần quyền đặc
    /// biệt, không cần Location). Đọc hỏng ⇒ trả nil, khoá lùi về tên interface.
    static func defaultGatewayAddress() -> String? {
        var mib: [Int32] = [CTL_NET, PF_ROUTE, 0, AF_INET, netRtFlags, rtfLlinfo]
        var length = 0
        guard sysctl(&mib, 6, nil, &length, nil, 0) == 0, length > 0 else { return nil }
        var buffer = [UInt8](repeating: 0, count: length)
        let status = buffer.withUnsafeMutableBytes { pointer in
            sysctl(&mib, 6, pointer.baseAddress, &length, nil, 0)
        }
        guard status == 0, length <= buffer.count else { return nil }
        var offset = 0
        while offset + routeHeaderSize <= length {
            let messageLength = buffer.withUnsafeBytes { pointer in
                pointer.loadUnaligned(fromByteOffset: offset, as: UInt16.self)
            }
            let message = Int(messageLength)
            guard message > routeHeaderSize, offset + message <= length else { break }
            // RTA_DST là sockaddr đầu tiên, ngay sau header; RTA_GATEWAY (MAC) là sockaddr kế.
            var cursor = offset + routeHeaderSize
            let end = offset + message
            var index = 0
            while index < 4 {
                guard cursor + MemoryLayout<sockaddr>.size <= end else { break }
                let sa = buffer.withUnsafeBytes { pointer in
                    pointer.loadUnaligned(fromByteOffset: cursor, as: sockaddr.self)
                }
                let saLen = Int(sa.sa_len)
                guard saLen > 0, cursor + saLen <= end else { break }
                if index == 1, sa.sa_family == UInt8(AF_LINK) {
                    if let mac = linkAddress(in: buffer, at: cursor, length: saLen) { return mac }
                }
                cursor += saLen
                index += 1
            }
            offset += message
        }
        return nil
    }

    /// `NET_RT_FLAGS` = 2, `RTF_LLINFO` = 0x400 — `<net/route.h>` có trong SDK iPhoneOS nhưng
    /// hai hằng số này không hiện ra trong Swift, nên khai tại chỗ (đúng cách file
    /// `HysteriaTransport.swift` đã khai `NET_RT_IFLIST2`).
    private static let netRtFlags: Int32 = 2
    private static let rtfLlinfo: Int32 = 0x400

    /// Kích thước header của một bản ghi `rt_msghdr` TRÊN 64 BIT, tính bằng byte.
    ///
    /// Vì sao không dùng thẳng `MemoryLayout<rt_msghdr>.size`: struct đó KHÔNG hiện ra trong
    /// Swift trên iOS (`error: cannot find type 'rt_msghdr' in scope` — đã gặp thật khi build
    /// 19/09/2026) dù header có trong SDK. Ở đây chỉ cần ĐỘ DÀI để nhảy qua bản ghi (trường
    /// `rtm_msglen` ở 2 byte đầu) rồi đi tiếp, nên một hằng số đúng offset là đủ — và đúng cho
    /// cả hai nền tảng vì Apple silicon/arm64 đều 64 bit:
    ///   u_short msglen(2) + u_char version(1) + u_char type(1) + u_short index(2) + pad(2)
    ///   + int flags(4) + int addrs(4) + pid_t pid(4) + int seq(4) + int errno(4) + int use(4)
    ///   + u_int32 inits(4) + `struct rt_metrics` (72 byte) = 108.
    /// Sai số ở đây KHÔNG làm hỏng gì ngoài việc không tìm được MAC (hàm trả nil) — vì chỉ
    /// đọc `rtm_msglen` rồi cộng dồn offset.
    private static let routeHeaderSize = 108

    /// MAC trong một `sockaddr_dl`: tên interface rồi tới địa chỉ link (đúng `LLADDR` của
    /// `<net/if_dl.h>`: `sdl_data` + `sdl_nlen`).
    private static func linkAddress(in buffer: [UInt8], at offset: Int, length: Int) -> String? {
        let base = offset + 8
        guard offset + length <= buffer.count, base <= offset + length else { return nil }
        // `sockaddr_dl`: sdl_len(0) sdl_family(1) sdl_index(2..3) sdl_type(4) sdl_nlen(5)
        // sdl_alen(6) sdl_slen(7) sdl_data(8...) — xem `<net/if_dl.h>`.
        let nameLength = Int(buffer[offset + 5])
        let addressLength = Int(buffer[offset + 6])
        // `sdl_data` khai 12 byte nhưng vùng làm việc dài hơn ⇒ chỉ cần kiểm tra trong bản ghi.
        let addressOffset = base + nameLength
        guard addressLength == 6, addressOffset + addressLength <= offset + length else { return nil }
        var parts: [String] = []
        for index in 0..<addressLength {
            parts.append(String(format: "%02x", buffer[addressOffset + index]))
        }
        let mac = parts.joined(separator: ":")
        // MAC toàn 0 là bản ghi rỗng của kernel, không phải router thật.
        return mac == "00:00:00:00:00:00" ? nil : mac
    }

    /// Link speed của đường truyền dưới tunnel, kbps. Hiện trả **nil trên cả hai nền tảng**.
    ///
    /// Vì sao không đọc được:
    ///   * **iOS** — `if_media.h` KHÔNG có trong SDK iPhoneOS (kiểm chứng:
    ///     `ls .../iPhoneOS.sdk/usr/include/if_media.h` → No such file), nên không có
    ///     `IFM_SUBTYPE`/`ifm_active` để suy ra tốc độ Wi-Fi. `NWPath`/`nw_interface` cũng không
    ///     có trường tốc độ.
    ///   * **macOS** — header thì có, nhưng Clang **không import được macro** này vào Swift:
    ///     `sys/sockio.h:113` khai `SIOCGIFMEDIA` là `_IOWR('i', 56, struct ifmediareq)` ⇒
    ///     compiler báo `macro 'SIOCGIFMEDIA' unavailable: structure not supported` (đã thử
    ///     `import Darwin` lẫn `import sys.sockio`/`net.if_media`).
    ///
    /// Cố ý KHÔNG tự khai lại `ifmediareq`/hằng số để lách: sai một trường là trần bị kẹp sai
    /// và Brutal tự bóp — đúng lỗi mà file này sinh ra để tránh. Trần vì vậy lấy từ **số ĐO**
    /// (`ceilingKbps(measuredKbps:…)`), đúng phương án dự phòng mà brief cho phép.
    static func linkSpeedKbps(identity: NetworkIdentity) -> Int? {
        _ = identity
        return nil
    }
}

/// Hộp nhận kết quả từ closure `fetchCurrent` (closure của NetworkExtension không `@Sendable`).
private final class WiFiNetworkBox: @unchecked Sendable {
    var ssid: String?
    var bssid: String?
}

// MARK: - A8 (§2e): ĐO MẠNG THỰC TẾ **TRƯỚC** RỒI MỚI KHAI

extension BandwidthControl {

    /// Ngưỡng/thời lượng của phép đo trước khi khai — **lấy đúng số của Android**
    /// (`Config.PREMEASURE_*` + `NetworkPreMeasure`, yêu cầu chủ dự án 22/09/2026, §2e/A8).
    static let preMeasureMaxBytes = 1_500_000
    static let preMeasureMinBytes = 200_000
    static let preMeasureBudget: TimeInterval = 2.5
    static let preMeasureConnectTimeout: TimeInterval = 2

    /// Thứ tự nguồn đo GIỐNG Android: CDN của shop trước (đo thật 22/09/2026: Cloudflare bị
    /// chặn/bóp từ data di động Trung Quốc), rồi mới tới Cloudflare. Bản iOS dùng đúng URL
    /// kênh iOS (`/v1/downloads/ios`, xem `control-plane/src/app-version.js`).
    static let preMeasureURLs: [String] = [
        "https://meetflowai.site/v1/downloads/ios",
        "https://speed.cloudflare.com/__down?bytes=1500000",
    ]

    /// Tải một mẩu nhỏ qua socket **ĐI THẲNG RA MẠNG NỀN** (KHÔNG qua tunnel) rồi trả kbps.
    ///
    /// Vì sao làm được ở đây: lúc `startTunnel` gọi hàm này, tunnel CHƯA được áp network settings
    /// ⇒ mọi socket của extension đi thẳng ra mạng nền (đúng điều `docs/MAC_IOS_PARITY_1.4.1.md`
    /// §4 ghi: "socket của extension vốn KHÔNG đi qua tunnel"). Vì thế KHÔNG cần `protect()`
    /// như Android.
    ///
    /// Trả `0` khi đo hỏng — chỗ gọi lùi về bộ nhớ/nấc tĩnh, **không bao giờ chặn kết nối**.
    ///
    /// `netKey` là KHOÁ MẠNG (`NetworkIdentity.preferredKey`) — in vào log theo đúng format
    /// Android (`bw: DO MANG THUC TE truoc khi khai net=<key> = <X>kbps …`), để hai nền tảng grep
    /// cùng một biểu thức.
    ///
    /// **CÁCH TÍNH GIỜ (chủ dự án chốt 25/09/2026): ĐO GOODPUT TRỪ BẮT TAY.**
    ///
    /// Lịch sử: 24/09/2026 iOS theo đúng Android (`NetworkPreMeasure.measureOnce` đặt `started`
    /// TRƯỚC `execute()` nên DNS + bắt tay TLS nằm TRONG thời gian đo) và chỉ in thêm số không tính
    /// bắt tay để đối chiếu. Log máy thật iPad cho thấy cách đó sai nặng:
    ///   `= 5409kbps (mat 2218ms)` so với `38272kbps` của phần ĐỌC (313 ms) — lệch **7×**.
    /// Chủ dự án đã chốt: **lấy số của phần ĐỌC** khi bắt tay chiếm phần đáng kể. Bắt tay là CHI PHÍ
    /// ĐỘ TRỄ CỐ ĐỊNH nên **không** dùng nó để loại mẫu; chỉ bỏ mẫu khi chính phần đọc quá mỏng
    /// (ngưỡng + lý do ở `RampStatus.PreMeasurePolicy`).
    ///
    /// Log LUÔN in số nào được dùng, số đối chiếu và vì sao — giữ nguyên tiền tố
    /// `bw: DO MANG THUC TE truoc khi khai net=… = …kbps (mat …ms) - dung so nay lam so khai`
    /// để vẫn grep chung được với Android.
    static func preMeasure(netKey: String, log: ((String) -> Void)? = nil) -> Int {
        for urlString in preMeasureURLs {
            guard let url = URL(string: urlString) else { continue }
            guard let sample = measureOnce(url: url) else {
                log?("bw: do mang thuc te CHUA DU du lieu tu \(urlString) -> thu nguon ke tiep")
                continue
            }
            let handshakeMs = max(sample.totalMs - sample.readMs, 0)
            let choice = RampStatus.PreMeasurePolicy.choose(
                kbpsWithHandshake: sample.kbpsWithHandshake,
                kbpsWithoutHandshake: sample.kbpsWithoutHandshake,
                readBytes: sample.bytes,
                totalMs: sample.totalMs,
                readMs: sample.readMs
            )
            switch choice {
            case .reject(let why):
                // Bỏ mẫu = đo hỏng cho nguồn này ⇒ thử nguồn kế tiếp; hết nguồn ⇒ 0 ⇒ chỗ gọi lùi
                // về bộ nhớ / khởi điểm thận trọng (ĐÚNG ý chủ dự án: không khai theo số đã hỏng).
                // 25/09/2026: chỉ bỏ vì PHẦN ĐỌC mỏng — bắt tay to KHÔNG còn là lý do bỏ mẫu.
                log?(
                    "bw: BO MAU do mang thuc te tu \(urlString) — \(why); "
                        + "doc \(sample.readMs)ms/\(sample.bytes)B (bat tay \(handshakeMs)ms/"
                        + "\(sample.totalMs)ms), kieu-android-cu=\(sample.kbpsWithHandshake)kbps "
                        + "-> thu nguon ke tiep"
                )
                continue
            case .readWindow(let kbps):
                log?(
                    "bw: DO MANG THUC TE truoc khi khai net=\(netKey) = \(kbps)kbps "
                        + "(mat \(sample.totalMs)ms) - dung so nay lam so khai "
                        + "[tru-bat-tay: phần đọc \(sample.readMs)ms/\(sample.bytes)B sau bắt tay "
                        + "\(handshakeMs)ms; kieu-android-cu=\(sample.kbpsWithHandshake)kbps; "
                        + "nguon=\(urlString)]"
                )
                return kbps
            case .wholeRequest(let kbps):
                log?(
                    "bw: DO MANG THUC TE truoc khi khai net=\(netKey) = \(kbps)kbps "
                        + "(mat \(sample.totalMs)ms) - dung so nay lam so khai "
                        + "[bắt tay \(handshakeMs)ms không đáng kể ⇒ giữ cách tính Android; "
                        + "không-tính-bắt-tay=\(sample.kbpsWithoutHandshake)kbps; "
                        + "bytes=\(sample.bytes); nguon=\(urlString)]"
                )
                return kbps
            }
        }
        log?(
            "bw: do mang thuc te KHONG do duoc o ca 2 nguon (net=\(netKey)) -> giu so cu"
        )
        return 0
    }

    /// Một nguồn đo. `nil` = hỏng/không đủ dữ liệu.
    ///
    /// Trả **HAI** con số trên cùng một lần tải (chủ dự án chốt 24/09/2026, giữ lại để chọn số):
    /// số kiểu Android (tính cả bắt tay — nay chỉ để ĐỐI CHIẾU) và số của phần đọc (KHÔNG tính
    /// bắt tay — nay là số ĐEM ĐI KHAI khi bắt tay đáng kể, xem `PreMeasurePolicy`). Không tải
    /// hai lần: cùng một luồng dữ liệu, chỉ khác mốc thời gian.
    private static func measureOnce(url: URL) -> PreMeasureSample? {
        var request = URLRequest(url: url)
        request.timeoutInterval = preMeasureBudget
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("bytes=0-\(preMeasureMaxBytes - 1)", forHTTPHeaderField: "Range")
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        request.setValue("VPNFlow-iOS", forHTTPHeaderField: "User-Agent")

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = preMeasureBudget
        configuration.timeoutIntervalForResource = preMeasureBudget + preMeasureConnectTimeout
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let collector = PreMeasureCollector(maxBytes: preMeasureMaxBytes, budget: preMeasureBudget)
        let session = URLSession(
            configuration: configuration, delegate: collector, delegateQueue: collector.queue
        )
        defer { session.invalidateAndCancel() }
        let task = session.dataTask(with: request)
        // Mốc "bắt đầu yêu cầu" = NGAY TRƯỚC `resume()`, đúng vị trí `started` của Android
        // (`NetworkPreMeasure.measureOnce` đặt trước `execute()`): DNS + bắt tay TLS nằm trong.
        collector.markRequestStart()
        task.resume()
        return collector.waitResult()
    }
}

/// Kết quả một lần đo trước khi khai, kèm CẢ HAI cách tính thời gian để chọn số đem đi khai.
struct PreMeasureSample {
    /// Số kiểu Android (tính cả DNS + bắt tay) — nay chỉ để ĐỐI CHIẾU và để giữ nguyên cách tính
    /// khi bắt tay không đáng kể (`PreMeasurePolicy.Choice.wholeRequest`).
    var kbpsWithHandshake: Int
    /// Số của PHẦN ĐỌC (mốc sau khi nhận header) — số ĐEM ĐI KHAI khi bắt tay chiếm phần đáng kể.
    var kbpsWithoutHandshake: Int
    var totalMs: Int
    var readMs: Int
    var bytes: Int
}

/// Gom dữ liệu của phép đo TRƯỚC khi khai và tự cắt khi đủ byte/hết ngân sách.
///
/// Vì sao không dùng `dataTask` + `completionHandler`: URL kênh iOS trả về nguyên file IPA nếu
/// server bỏ qua `Range` ⇒ phải CẮT theo byte ngay trong lúc nhận, không được đệm cả file.
private final class PreMeasureCollector: NSObject, URLSessionDataDelegate {
    let queue = OperationQueue()
    private let maxBytes: Int
    private let budget: TimeInterval
    private let semaphore = DispatchSemaphore(value: 0)
    private let lock = NSLock()
    private var received = 0
    /// Mốc NGAY TRƯỚC `resume()` (kiểu Android: gồm DNS + bắt tay).
    private var requestStarted = Date()
    /// Mốc nhận được header (sau bắt tay) — đầu CỬA SỔ ĐỌC, tức mốc tính số goodput đem đi khai
    /// khi bắt tay đáng kể (xem `RampStatus.PreMeasurePolicy`).
    private var headersAt: Date?
    private var finishedAt: Date?
    private var accepted = false
    private var finished = false

    init(maxBytes: Int, budget: TimeInterval) {
        self.maxBytes = maxBytes
        self.budget = budget
        self.queue.maxConcurrentOperationCount = 1
    }

    /// Gọi NGAY TRƯỚC `task.resume()` — mốc thời gian kiểu Android.
    func markRequestStart() {
        lock.lock()
        requestStarted = Date()
        lock.unlock()
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        let ok = (200..<300).contains(code)
        lock.lock()
        accepted = ok
        headersAt = Date()
        lock.unlock()
        completionHandler(ok ? .allow : .cancel)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.lock()
        received += data.count
        // Ngân sách đọc tính từ mốc YÊU CẦU (kiểu Android `started`), không phải từ header.
        let elapsed = Date().timeIntervalSince(requestStarted)
        let stop = received >= maxBytes || elapsed >= budget
        lock.unlock()
        if stop {
            dataTask.cancel()
            signal()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        signal()
    }

    private func signal() {
        lock.lock()
        if finished { lock.unlock(); return }
        finished = true
        finishedAt = Date()
        lock.unlock()
        semaphore.signal()
    }

    /// Chờ tối đa `budget + connect` rồi trả hai con số (`nil` nếu không đủ dữ liệu).
    func waitResult() -> PreMeasureSample? {
        let timeout = budget + BandwidthControl.preMeasureConnectTimeout
        _ = semaphore.wait(timeout: .now() + timeout)
        lock.lock()
        let bytes = received
        let ok = accepted
        let start = requestStarted
        let headers = headersAt
        let end = finishedAt ?? Date()
        lock.unlock()
        guard ok, bytes >= BandwidthControl.preMeasureMinBytes else { return nil }
        // byte × 8 / ms = kbps — cùng công thức Android (`NetworkPreMeasure.measureOnce`).
        let totalSec = max(end.timeIntervalSince(start), 0.001)
        let readSec = max(end.timeIntervalSince(headers ?? start), 0.001)
        return PreMeasureSample(
            kbpsWithHandshake: Int(Double(bytes) * 8 / 1000 / totalSec),
            kbpsWithoutHandshake: Int(Double(bytes) * 8 / 1000 / readSec),
            totalMs: Int(totalSec * 1000),
            readMs: Int(readSec * 1000),
            bytes: bytes
        )
    }
}
