import Foundation
import Network
import NetworkExtension

/// Khai băng thông ĐỘNG cho Brutal CC của hysteria2 (extension iOS/iPadOS).
///
/// Vì sao cần: Brutal CC **pace theo đúng số client khai**
/// (`tools/hysteria-android/mobile.go`: `MaxTx = upKbps*1000/8`, `MaxRx = downKbps*1000/8`),
/// nên khai sai là tự bóp. Đo thật 18–19/09/2026: khai 300/1000 Mbps ⇒ 1,3 Mbps; khai
/// 30/100 ⇒ 29,9 Mbps. Số khai hiện lấy từ `HysteriaDefaults` (30/100 Mbps) — đúng cho
/// Wi-Fi nhà nhưng sai cho cả mạng 5G 13 Mbps lẫn Wi-Fi cáp quang 300 Mbps.
///
/// Ba việc của file này:
///   1. **Đo** băng thông THẬT đang chở qua tunnel từ bộ đếm byte của utun (provider lấy
///      mẫu mỗi 1s ⇒ có số trong ≤3s, xem `HysteriaPacketTunnelProvider.startBandwidthSampling`).
///   2. **Nhớ theo mạng**: lần sau vào cùng mạng thì khai luôn ở mức đã đạt (khoá mạng —
///      xem `NetworkIdentity`, KHÔNG cần entitlement vị trí).
///   3. **Ramp**: khi số khai bị chính đường truyền chặn trần (dùng hết ≥85% số khai trong
///      ≥10s), tăng ×1,25/×1,5 — nhưng CHỈ áp ở ranh giới an toàn (xem `RampDecision`).
///
/// Luật CHỐT SỐ KHAI (giống Android, sửa lỗi đo thật trên iPad 19/09):
///   * **có số đo** ⇒ số khai = f(số đo) ≈85% (xem `downKbpsFromMeasurement`), sàn nhỏ
///     500/1000 kbps, **tuyệt đối KHÔNG nâng lên nấc tĩnh** — đo 1,0–1,1 Mbps mà khai
///     30/100 Mbps chính là Brutal tự bóp (log `bw: measured=1069 declared up=30000 down=100000`);
///   * **chưa có số đo** ⇒ đúng `HysteriaDefaults` cũ (không regress);
///   * **bộ nhớ chỉ nhận số ĐO** (`persistPeaksIfNeeded`) — nấc tĩnh/mặc định không bao giờ
///     được ghi vào bộ nhớ rồi đọc lại như "số đã học".
///
/// Ràng buộc cứng của hysteria: số khai được Go đọc MỘT LẦN trong `MobileConnect` ⇒ đổi số
/// = tạo client mới = QUIC/stream mới. Vì vậy quyết định ở đây **không** tự đổi gì: nó chỉ
/// trả `RampDecision` để provider dựng lại transport ĐÚNG LÚC tunnel rảnh (≥2s không có gói),
/// còn đang truyền thì để dành cho lần kết nối sau.
///
/// Không có gì trong bộ nhớ ⇒ dùng đúng `HysteriaDefaults` (không làm mạng nào chậm hơn trước).
enum BandwidthControl {

    // MARK: - Hằng số quyết định

    /// Lần đầu gặp một mạng: bắt đầu ở mặc định cũ, rồi tự hạ/tăng theo số đo thật.
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
    static let peakWindow: TimeInterval = 10
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
    /// Bật cho CẢ iOS và macOS (parity 1.4.1): số khai được Go đọc MỘT LẦN trong `MobileConnect`,
    /// còn fd chở gói thì KHÔNG đổi khi dựng lại — fd đó là đầu của cặp socketpair do extension
    /// tự tạo (`HysteriaTransport.resolveTunnelFD`) trên CẢ HAI nền tảng, cầu `TunnelBridge` vẫn
    /// chạy nguyên nên dựng lại transport chỉ là mở relay + QUIC mới trên CÙNG fd. Trước đây
    /// macOS tắt đường này nên số đo trong phiên chỉ được áp ở lần kết nối sau.
    static var allowsTransportRebuild: Bool {
        true
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
    struct Memory: Codable {
        /// Đỉnh tốt nhất từng đo được trên mạng này: giá trị LỚN NHẤT của trung bình trượt 10s
        /// (không phải mẫu 1 giây), kbps. Vừa là số đo để suy số khai, vừa là BẰNG CHỨNG duy
        /// nhất cho biết bản ghi có số đã học thật hay không (xem `trustedMeasuredDownKbps`).
        var peakUpKbps: Int = 0
        var peakDownKbps: Int = 0
        /// Số khai của lần kết nối gần nhất — lần sau bắt đầu từ đây rồi ramp tiếp.
        /// CHỈ được ghi khi phiên đó đã đo được số thật (xem `persistPeaksIfNeeded`).
        var lastUpKbps: Int = 0
        var lastDownKbps: Int = 0
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
        let observedKbps: Int
        let oldUpKbps: Int
        let oldDownKbps: Int
        let newUpKbps: Int
        let newDownKbps: Int

        var logReason: String {
            switch reason {
            case .lossBackoff: return "loss-backoff"
            // Số khai mới KHÔNG phải một bậc ramp mà là f(số đo) — in thẳng lý do đã chốt
            // (`clamp` khi sàn/trần phải can thiệp, `memory` khi số đo tự quyết định) để đọc
            // log biết ngay vì sao số khai đổi (xem `underrunPct`). Trước đây hai ca này in
            // "idle-reconnect" — sai hẳn ngữ nghĩa: trên macOS KHÔNG hề dựng lại transport
            // giữa phiên, số mới chỉ được ghi lại cho lần kết nối sau.
            case .clamp, .memory: return reason.label
            default: return "idle-reconnect"
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
        /// Đỉnh trượt (trung bình dài nhất trong `peakWindow`) của phiên, hai chiều, kbps.
        private(set) var peakUpKbps = 0
        private(set) var peakDownKbps = 0
        /// Trung bình 10s vừa tính — con số in ra `bw: … measured=` (đối chiếu được với speedtest).
        private(set) var lastAverageDownKbps = 0
        private(set) var lastAverageUpKbps = 0
        /// Đã đo được số nào có nghĩa trên mạng này chưa (false ⇒ không kẹp trần theo số đo).
        private(set) var everMeasured = false
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
        /// Cửa sổ trung bình trượt để lấy đỉnh.
        private var window: [(at: Date, bytes: Int)] = []
        private var windowInbound: [(at: Date, bytes: Int)] = []
        /// Dấu hiệu đang bão hoà (theo mốc thời gian, không phải đếm mẫu — mẫu bị bỏ vì
        /// khe thời gian xấu KHÔNG được tính là đã quan sát).
        private var saturatedSince: Date?
        /// Mốc bắt đầu "số khai KHAI VƯỢT sức mạng thật" (xem `underrunPct`) — phải LIÊN TỤC
        /// đủ lâu mới hạ, y như đường ramp (một mẫu tụt không được bóp cả phiên).
        private var underrunSince: Date?
        /// Số giây liên tục đang mất gói.
        private var lossSeconds: TimeInterval = 0
        /// Số mẫu LIÊN TIẾP chứng minh goodput đủ nhanh VÀ loss thấp (A11 §2h luật 2: chỉ ramp
        /// lên khi loss thấp và goodput chứng minh 2 lần liên tiếp). Mẫu xấu ⇒ đếm lại từ 0.
        private var rampProofs = 0
        /// A10 §2g — "mức đã khoá (stable)": số khai đang được chứng minh bền (loss thấp VÀ
        /// goodput đạt ≥95% số khai) liên tục ≥`rampMinObserved`. Đây là MỐC HIỂN THỊ; việc KHOÁ
        /// thật (cấm dựng lại vì tốc độ) thuộc máy trạng thái STABLE ở bước sau (DEV_PLAN §3).
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

        init(identity: NetworkIdentity) {
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
            // Số ĐO đáng tin của bản ghi (0 = bản ghi chưa từng đo, hoặc bị nhiễm nấc tĩnh —
            // xem `trustedMeasuredDownKbps`). Đây là chỗ chặn bộ nhớ nhiễm: có bản ghi mà
            // KHÔNG có đỉnh đo thì coi như chưa có bộ nhớ.
            let measured = base.map(BandwidthControl.trustedMeasuredDownKbps) ?? 0
            // A11 (§2h luật 1) — KHAI BÁO AN TOÀN TRƯỚC: đo được ⇒ ×0,8; chưa đo ⇒
            // min(nấc tĩnh, nhớ ×0,6); loss cao ⇒ bỏ `best` cũ, khởi điểm ≤ 4/1 Mbps.
            // Hàm thuần `RampStatus.safeDeclaration` là nguồn duy nhất của luật này.
            let declaration = RampStatus.safeDeclaration(
                measuredDownKbps: measured,
                rememberedDownKbps: base?.lastDownKbps ?? 0,
                staticDownKbps: BandwidthControl.fallbackDownKbps,
                staticUpKbps: BandwidthControl.fallbackUpKbps,
                highLoss: base?.lossBackoffSeen ?? false
            )
            let reason: Reason
            switch declaration.reason {
            // `memory`: số khai là f(số đo đã nhớ), không bao giờ kéo lên nấc tĩnh.
            case "measured", "memory": reason = .memory
            // `high-loss`: bản ghi từng mất gói ⇒ khởi động thận trọng (kẹp 4/1 Mbps).
            case "high-loss": reason = .lossBackoff
            // `static`: mạng chưa từng có số đo ⇒ đúng nấc tĩnh (đường lùi an toàn).
            default: reason = .profile
            }
            self.upKbps = BandwidthControl.clamp(declaration.upKbps)
            self.downKbps = BandwidthControl.clamp(declaration.downKbps)
            // Bộ nhớ đã đạt mức nào thì coi như vòng ramp trước đã dùng: lần này vẫn phải
            // QUAN SÁT đủ lâu mới tăng tiếp, trừ khi "bootstrap" của phiên đầu (xem `sample`).
            self.rampEvents = base?.rampEvents ?? 0
            self.planReason = reason
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
        private func markPending(_ reason: Reason, decrease: Bool, at now: Date) {
            if !pendingChange { pendingSince = now }
            pendingChange = true
            pendingReason = reason
            pendingIsDecrease = pendingIsDecrease || decrease
        }

        // MARK: Lấy mẫu 1s

        /// Một mẫu byte. Trả về quyết định khi cần đổi số khai — provider chỉ được áp ở
        /// ranh giới an toàn (xem `HysteriaPacketTunnelProvider.applyBandwidthRampIfIdle`).
        func sample(
            bytes: ByteSample,
            packetsIn: Int,
            packetsOut: Int,
            at now: Date,
            path: NWPath?
        ) -> RampDecision? {
            defer { baseline = bytes; baselineAt = now }
            // Đổi mạng giữa phiên: khoá bộ nhớ phải theo mạng mới, còn số khai giữ nguyên
            // cho tới lần kết nối sau (đang truyền thì không được dựng lại transport).
            let interfaceNow = path?.availableInterfaces.first?.name
            let interfaceChanged = interfaceNow != nil && interfaceNow != lastPathInterface
            if interfaceChanged { lastPathInterface = interfaceNow }
            if interfaceChanged || now.timeIntervalSince(identityCheckedAt) >= Self.identityRefresh {
                identityCheckedAt = now
                let identityNow = BandwidthControl.currentNetworkIdentity(path: path)
                let previousLabel = identity.logLabel
                if identityNow.preferredKey != identity.preferredKey {
                    refreshIdentity(identityNow)
                    markPending(.memory, decrease: false, at: now)
                    RelayDiagnostics.shared.log(
                        "bw: net đổi giữa phiên \(previousLabel) -> \(identityNow.logLabel) — "
                            + "số khai của mạng mới chỉ áp ở lần kết nối sau (đang truyền thì không đụng transport)"
                    )
                }
            }

            guard let baseline else { return nil }
            let dt = now.timeIntervalSince(baselineAt)
            guard dt >= 0.5, dt <= 5 else { return nil }
            let deltaIn = bytes.inbound - baseline.inbound
            let deltaOut = bytes.outbound - baseline.outbound
            // Bộ đếm bị reset (interface dựng lại) ⇒ bỏ mẫu, lấy mốc mới.
            guard deltaIn >= 0, deltaOut >= 0 else { return nil }

            let busy = Double(deltaIn + deltaOut) >= Double(BandwidthControl.busyBytesPerSecond) * dt
            if busy { lastActivityAt = now }

            push(&window, at: now, bytes: deltaIn, dt: dt)
            push(&windowInbound, at: now, bytes: deltaOut, dt: dt)
            let averageIn = average(&window)
            let averageOut = average(&windowInbound)
            peakDownKbps = max(peakDownKbps, averageIn)
            peakUpKbps = max(peakUpKbps, averageOut)
            lastAverageDownKbps = averageIn
            lastAverageUpKbps = averageOut
            // Số đo chỉ được coi là ĐO ĐƯỢC khi cửa sổ đã có ≥3 mẫu (≥3 giây): trung bình của
            // một mẫu không phải kết quả đo, và dùng nó làm trần là tự bóp (xem `ceilingKbps`).
            if window.count >= 3, averageIn > BandwidthControl.minKbps || averageOut > BandwidthControl.minKbps {
                everMeasured = true
            }

            // Mất gói (heuristic của iOS — xem chú thích ở `lossMinPacketsPerSample`): máy gửi gói vào
            // tunnel mà gần như không có gói nào quay về, LIÊN TỤC. Chỉ khi tunnel đang chở
            // dữ liệu thật thì mới kết luận, nên không cần phải có thêm nguồn RTT.
            let lossNow = packetsOut >= BandwidthControl.lossMinPacketsPerSample
                && packetsIn <= packetsOut / BandwidthControl.lossInboundDivisor
            lossSeconds = lossNow ? lossSeconds + dt : 0

            // Trần trên = ĐỈNH byte/giây đã đo (trung bình trượt 10s) × biên an toàn. Dùng
            // ĐỈNH chứ không phải trung bình tức thời: trung bình của vài mẫu đầu (1–2 giây)
            // chỉ là một phần của tải nên kẹp trần xuống dưới cả số khai, và khi đó không bao
            // giờ ramp được nữa — đúng cái bẫy "khai sai là tự bóp" mà file này sinh ra để tránh.
            let link = BandwidthControl.linkSpeedKbps(identity: identity)
            let ceiling = BandwidthControl.effectiveCeiling(
                measured: everMeasured ? peakDownKbps : nil,
                link: link,
                everMeasured: everMeasured
            )

            // Ghi đỉnh vào bộ nhớ (dùng được cả khi tunnel bị đứt giữa phiên).
            persistPeaksIfNeeded()

            // A10 §2g — mốc "đã khoá (stable)": số khai đang được chứng minh bền (loss thấp +
            // đo đạt ≥95% số khai) liên tục. Loss quay lại ⇒ bỏ mốc (số phải tụt đúng lúc).
            let stableNow = lossSeconds <= 0
                && averageIn >= BandwidthControl.minMeasuredKbps
                && Double(averageIn) >= Double(downKbps) * RampStatus.atMaxCeilingRatio
            if stableNow {
                if stableSince == nil { stableSince = now }
                if let since = stableSince,
                   now.timeIntervalSince(since) >= BandwidthControl.rampMinObserved {
                    stableDownKbps = downKbps
                }
            } else {
                stableSince = nil
                stableDownKbps = nil
            }

            // (a) HẠ: dấu hiệu mất gói/rớt rõ ràng — phải đủ dài mới hạ.
            if lossSeconds >= BandwidthControl.lossBackoffMinObserved {
                lossSeconds = 0
                let oldUp = upKbps
                let oldDown = downKbps
                upKbps = BandwidthControl.clamp(Int(Double(upKbps) * BandwidthControl.lossBackoff))
                downKbps = BandwidthControl.clamp(Int(Double(downKbps) * BandwidthControl.lossBackoff))
                // Hạ thì để dưới trần là đúng ý (trần chỉ giới hạn phía TĂNG), nhưng vẫn kẹp
                // sàn để không khai về 0 (0 = hysteria dùng CC chuẩn ⇒ mất tính năng Brutal).
                lossSeen = true
                markPending(.lossBackoff, decrease: true, at: now)
                persistPeaksIfNeeded(force: true)
                return RampDecision(
                    multiplierUp: nil,
                    multiplierDown: nil,
                    reason: .lossBackoff,
                    observedKbps: peakDownKbps,
                    oldUpKbps: oldUp,
                    oldDownKbps: oldDown,
                    newUpKbps: upKbps,
                    newDownKbps: downKbps
                )
            }

            // (a0) KẸP XUỐNG theo số đo — lỗi đo THẬT trên iPad 19/09: đo 1,0–1,1 Mbps mà vẫn
            // khai 30/100 Mbps (nấc tĩnh) ⇒ Brutal pace gấp ~100 lần sức mạng thật. Số khai
            // VƯỢT hẳn sức mạng thật (đo < 50% số khai) LIÊN TỤC ⇒ hạ NGAY về 85% số đo.
            //
            // Vì sao không hạ từng bậc ×0,7 như đường mất gói: từ 100 Mbps về 1 Mbps là ~13
            // bậc, mà mỗi bậc là một lần dựng lại transport (chờ tunnel rảnh) ⇒ không bao giờ
            // tới đích. Cũng vì thế ngưỡng phải LIÊN TỤC `rampMinObserved`: trung bình trượt
            // 10s của một đường ĐANG LÊN TỐC sẽ vượt 50% số khai trước khi hết 10s.
            let underrun = BandwidthControl.isUnderrun(averageKbps: averageIn, declaredKbps: downKbps)
            if underrun, underrunSince == nil { underrunSince = now }
            if !underrun { underrunSince = nil }
            if let since = underrunSince, now.timeIntervalSince(since) >= BandwidthControl.rampMinObserved {
                underrunSince = nil
                let oldUp = upKbps
                let oldDown = downKbps
                let chosen = BandwidthControl.clampedDeclaration(
                    downKbps: BandwidthControl.downKbpsFromMeasurement(
                        measuredDownKbps: averageIn,
                        rememberedDeclaredKbps: downKbps
                    ),
                    measuredDownKbps: averageIn
                )
                if chosen.downKbps < downKbps {
                    upKbps = chosen.upKbps
                    downKbps = chosen.downKbps
                    // Chốt ngay vào plan + telemetry: số khai mới là f(số đo), KHÔNG phải một
                    // bậc ramp. Áp thật vẫn chỉ ở ranh giới rảnh (provider dựng lại transport).
                    planReason = chosen.clamped ? .clamp : .memory
                    markPending(planReason, decrease: true, at: now)
                    persistPeaksIfNeeded(force: true)
                    return RampDecision(
                        multiplierUp: nil,
                        multiplierDown: nil,
                        reason: planReason,
                        observedKbps: averageIn,
                        oldUpKbps: oldUp,
                        oldDownKbps: oldDown,
                        newUpKbps: upKbps,
                        newDownKbps: downKbps
                    )
                }
            }

            // (b) TĂNG: chỉ khi CHÍNH số khai đang chặn trần (dùng hết ≥85% trong ≥10s),
            // hoặc thấy đỉnh vượt số khai ≥15%. Trung bình thấp mà đỉnh thấp ⇒ đường không
            // đủ nhanh, KHÔNG tăng (đó là ca khai quá cao của bản cũ).
            // Phải có ít nhất 3 mẫu (≥3 giây) mới xét ramp: trần trên suy từ đỉnh đo, mà đỉnh
            // của 1–2 mẫu đầu là số vô nghĩa ⇒ ramp ở đó sẽ bỏ qua trần và nhảy quá cao.
            guard window.count >= 3 else { return nil }
            let saturated = BandwidthControl.isSaturated(
                averageKbps: averageIn,
                declaredKbps: downKbps
            )
            if saturated, saturatedSince == nil { saturatedSince = now }
            if !saturated { saturatedSince = nil }
            let saturatedSpan = saturatedSince.map { now.timeIntervalSince($0) } ?? 0
            // "Đỉnh vượt số khai ≥15%" chỉ có nghĩa khi đỉnh đó là số ĐO THẬT (≥1 Mbps):
            // 100 kbps của một gói DNS không phải bằng chứng đường nhanh hơn số khai.
            let peakOverDeclared = averageIn >= BandwidthControl.minTrustedMeasuredKbps
                && Double(peakDownKbps) >= Double(downKbps) * BandwidthControl.headroomRatio
            // Chưa ramp lần nào trong phiên ⇒ số khai còn là số mặc định/đã nhớ, chưa từng được
            // chứng minh với mạng này: cho phép ramp ngay khi thấy đường nhanh hơn số khai.
            let bootstrap = rampEvents == 0
            // A11 §2h luật 2: đếm số mẫu LIÊN TIẾP chứng minh goodput đủ nhanh VÀ loss thấp.
            // Mẫu xấu (hoặc đang có dấu hiệu mất gói) ⇒ xoá chuỗi, phải chứng minh lại từ đầu.
            let goodputProof = averageIn >= BandwidthControl.minTrustedMeasuredKbps
                || (saturatedSpan >= BandwidthControl.rampMinObserved
                    && averageIn >= BandwidthControl.minMeasuredKbps)
            if goodputProof, lossSeconds <= 0 {
                rampProofs += 1
            } else {
                rampProofs = 0
            }
            // Đủ tin để TĂNG: đo được ≥5 Mbps (bằng chứng đường nhanh), HOẶC số đo đã CHẠM số
            // khai đang dùng LIÊN TỤC ≥10s — lúc đó tăng theo TỈ LỆ là an toàn kể cả khi số khai
            // nhỏ (số khai nhỏ đến từ chính lần kẹp theo số đo trước đó, không phải đường chậm;
            // nếu chỉ đòi ≥5 Mbps thì sau khi bị kẹp về ~1 Mbps sẽ KHÔNG BAO GIỜ tăng lại được:
            // Brutal pace đúng số khai nên goodput không bao giờ vượt 5 Mbps).
            // Dưới `minMeasuredKbps` thì mọi "số đo" chỉ là DNS/ping ⇒ không tăng.
            let trustedFast = averageIn >= BandwidthControl.minTrustedMeasuredKbps
            let touchingDeclared = saturatedSpan >= BandwidthControl.rampMinObserved
                && averageIn >= BandwidthControl.minMeasuredKbps
            guard trustedFast || touchingDeclared else { return nil }
            guard touchingDeclared || peakOverDeclared || (bootstrap && trustedFast) else { return nil }
            // A11 §2h luật 2 — CẤM ramp lên khi loss cao dù goodput trông cao; và chỉ ramp khi
            // goodput đã chứng minh LIÊN TIẾP (§2h: 2 lần). LossBackoff ở trên đã xử lý việc hạ.
            guard RampStatus.canRampUp(
                lossPercent: lossSeconds > 0 ? 100 : 0,
                consecutiveProofs: rampProofs
            ) else {
                if lossSeconds > 0, goodputProof {
                    RelayDiagnostics.shared.log(
                        "bw: ramp bị chặn vì loss cao (§2h luật 2) — đo \(averageIn) kbps, "
                            + "declared down=\(downKbps)"
                    )
                }
                return nil
            }
            guard !pendingChange else { return nil }
            let oldUp = upKbps
            let oldDown = downKbps
            let multiplier = BandwidthControl.isClearlySaturated(
                averageKbps: averageIn,
                declaredKbps: downKbps
            ) ? BandwidthControl.rampFactorSaturated : BandwidthControl.rampFactor
            // Kẹp theo TRẦN TRÊN trước khi quyết định: trần = min(link speed, đỉnh đo × 1,5).
            // `up/down` là số sẽ khai SAU khi ramp (đã kẹp) — nhờ vậy chỉ cần một chỗ kẹp duy
            // nhất và quyết định "có tăng được không" nhìn thẳng vào hai số đó.
            //
            // Đồng thời xét "NHẢY THẲNG theo số đo": đo vượt xa số khai thì chính số khai là nút
            // cổ chai (xem `jumpUpPct`), và `downKbpsFromMeasurement` cho ngay 85% số đo. Nhân
            // ×1,25 từ 1 Mbps lên 20 Mbps là ~13 vòng dựng lại transport, mà mỗi phiên chỉ có
            // `rampMaxAttempts` lượt — lấy giá trị LỚN HƠN giữa hai cách rồi vẫn kẹp trần/sàn.
            let jumped = BandwidthControl.downKbpsFromMeasurement(
                measuredDownKbps: averageIn,
                rememberedDeclaredKbps: downKbps
            )
            let targetDown = max(Int(Double(downKbps) * multiplier), jumped)
            let targetUp = max(
                Int(Double(upKbps) * multiplier),
                targetDown * BandwidthControl.fallbackUpKbps / max(BandwidthControl.fallbackDownKbps, 1)
            )
            upKbps = BandwidthControl.clamp(ceiling.map { min(targetUp, $0) } ?? targetUp)
            downKbps = BandwidthControl.clamp(ceiling.map { min(targetDown, $0) } ?? targetDown)
            // Trần đã chặn hết phần tăng ⇒ tăng nữa cũng vô ích, đừng đứt stream (dựng lại
            // transport là mất mọi kết nối đang mở).
            //
            // Đường "TĂNG" này **KHÔNG BAO GIỜ được HẠ số khai**. Vì sao phải chặn riêng: trần
            // ở trên suy từ ĐỈNH ĐO CỦA CHÍNH PHIÊN NÀY × biên an toàn, mà phiên vừa mở thì
            // đỉnh mới có vài giây ⇒ trần có thể THẤP HƠN số khai vừa đọc từ bộ nhớ (85% đỉnh
            // tốt nhất đã đo của mạng). Nhân hệ số tăng rồi kẹp trần khi đó ra số THẤP HƠN số
            // đang khai — đo thật 19/09/2026 (cả trên bản cài cuối):
            //   bw: ramp net=wifi|if:en0 observed=5736 old=9906/33020 new=8604/8604 reason=idle-reconnect
            // Log nói "ramp" mà thực chất là HẠ số khai, và nó ghi `lastDownKbps=8604` vào bộ
            // nhớ — xoá số vừa đọc từ bộ nhớ TRƯỚC khi đường hạ THẬT (`isUnderrun`, đòi liên
            // tục 10 giây) kịp lên tiếng. Hạ số khai là việc của hai đường riêng, cả hai đều
            // đòi bằng chứng LIÊN TỤC: `isUnderrun` (số khai vượt sức mạng thật) và
            // `lossSeconds` (mất gói).
            guard upKbps > oldUp || downKbps > oldDown else {
                // Trả lại số cũ: hai biến đã bị nhân/kẹp ở trên.
                upKbps = oldUp
                downKbps = oldDown
                RelayDiagnostics.shared.log(
                    "bw: ramp bỏ qua — trần \(ceiling ?? 0) kbps không cho số khai "
                        + "up=\(oldUp)/down=\(oldDown) tăng (đo \(averageIn) kbps)"
                )
                return nil
            }
            markPending(.ramp, decrease: false, at: now)
            return RampDecision(
                multiplierUp: multiplier,
                multiplierDown: multiplier,
                reason: .ramp,
                observedKbps: averageIn,
                oldUpKbps: oldUp,
                oldDownKbps: oldDown,
                newUpKbps: upKbps,
                newDownKbps: downKbps
            )
        }

        // MARK: Áp quyết định

        /// Provider đã dựng lại transport với số khai mới: chốt lại + ghi bộ nhớ.
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
            saturatedSince = nil
            stableSince = nil
            stableDownKbps = nil
            // Đo lại từ mốc mới sau khi dựng lại transport (số khai mới ⇒ tốc độ thật có thể
            // cao hơn). Cố ý KHÔNG xoá `everMeasured`: trần suy từ đỉnh cũ vẫn còn giá trị làm
            // mốc an toàn, còn đỉnh mới sẽ tự nâng trần lên khi đo được số cao hơn.
            peakUpKbps = 0
            peakDownKbps = 0
            persistPeaksIfNeeded(force: true)
        }

        /// Ghi số khai + đỉnh của phiên vào bộ nhớ (gọi khi kết thúc phiên hoặc khi có ramp).
        func persistPeaksIfNeeded(force: Bool = false) {
            // CHỈ ghi khi phiên này ĐÃ ĐO được số thật (`everMeasured` = có ≥3 mẫu và vượt
            // `minMeasuredKbps`). Vì sao là ràng buộc cứng: bản build cũ ghi `lastUp/lastDown`
            // ngay cả khi CHƯA đo gì ⇒ nấc tĩnh 30/100 Mbps đi thẳng vào bộ nhớ, lần sau đọc
            // lại như "số đã học" và log ra đúng dòng đã đo trên iPad 19/09:
            //   bw: net=wifi|if:en0 measured=1069 declared up=30000 down=100000 reason=memory
            guard everMeasured else { return }
            // Chỉ ghi khi đỉnh đã nhích đủ nhiều (hoặc khi được yêu cầu chốt): UserDefaults
            // không nên bị ghi mỗi giây.
            let moved = abs(peakUpKbps - lastSavedPeakUp) >= BandwidthControl.memoryWriteDeltaKbps
                || abs(peakDownKbps - lastSavedPeakDown) >= BandwidthControl.memoryWriteDeltaKbps
            guard force || moved else { return }
            lastSavedPeakUp = peakUpKbps
            lastSavedPeakDown = peakDownKbps
            var entry = memory[key] ?? Memory()
            entry.peakUpKbps = max(entry.peakUpKbps, peakUpKbps)
            entry.peakDownKbps = max(entry.peakDownKbps, peakDownKbps)
            // Số khai ghi kèm PHẢI suy từ SỐ ĐO, không bao giờ là NẤC TĨNH.
            //
            // Vì sao: phiên ĐẦU ở một mạng chưa có bộ nhớ vẫn đang khai `HysteriaDefaults`
            // (30/100 Mbps) đúng lúc phép đo đầu tiên tới ⇒ ghi thẳng `upKbps/downKbps` là đưa
            // nấc tĩnh vào bộ nhớ, lần sau đọc lại như "số đã học" và không bao giờ hạ được nữa
            // (đúng dòng đã đo: `bw: net=wifi|if:en0 measured=1069 declared up=30000 down=100000
            // reason=memory`). Kẹp về ≈`declareRatioPct`% ĐỈNH đã ĐO — đúng tỉ lệ mà
            // `downKbpsFromMeasurement` dùng — nên bản ghi luôn nhất quán với phép đo đi kèm.
            // Số khai do RAMP hợp lệ (≤85% đỉnh) không bị đụng tới: chỉ kẹp khi số khai đang
            // VƯỢT thứ đã chứng minh được.
            let measuredDeclaredDown = max(
                peakDownKbps * 100 / BandwidthControl.declareRatioPct,
                BandwidthControl.floorDownKbps
            )
            entry.lastDownKbps = min(downKbps, measuredDeclaredDown)
            // Chiều LÊN giữ đúng tỉ lệ của nấc tĩnh (30/100) như `clampedDeclaration`.
            entry.lastUpKbps = min(
                upKbps,
                max(
                    entry.lastDownKbps * BandwidthControl.fallbackUpKbps
                        / max(BandwidthControl.fallbackDownKbps, 1),
                    BandwidthControl.floorUpKbps
                )
            )
            entry.rampEvents = rampEvents
            entry.updatedAt = Date()
            entry.lossBackoffSeen = lossSeen
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

        private func push(_ buffer: inout [(at: Date, bytes: Int)], at now: Date, bytes: Int, dt: TimeInterval) {
            buffer.append((at: now, bytes: bytes))
            // Cửa sổ trượt: 1 mẫu ≈ 1s (provider lấy mẫu mỗi giây) — xoá mẫu cũ hơn cửa sổ.
            let cutoff = now.addingTimeInterval(-BandwidthControl.peakWindow * 2)
            while let first = buffer.first, first.at < cutoff { buffer.removeFirst() }
        }

        /// Trung bình của cửa sổ gần nhất (`peakWindow` giây), kbps.
        private func average(_ buffer: inout [(at: Date, bytes: Int)]) -> Int {
            guard let last = buffer.last else { return 0 }
            let cutoff = last.at.addingTimeInterval(-BandwidthControl.peakWindow)
            let recent = buffer.filter { $0.at >= cutoff }
            guard let oldest = recent.first, recent.count > 1 else { return 0 }
            let seconds = max(last.at.timeIntervalSince(oldest.at), 0.5)
            let bytes = recent.dropFirst().reduce(0) { $0 + $1.bytes }
            return Int(Double(bytes) * 8 / 1000 / seconds)
        }
    }

    /// Chuẩn hoá số khai: không âm, không vượt trần cứng.
    static func clamp(_ kbps: Int) -> Int {
        min(max(kbps, minKbps), maxKbps)
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
