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
    static let rampFactor = 1.25
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
    /// Một mẫu chỉ tính là "đang chở dữ liệu" khi vượt ngần này (dưới ngưỡng ⇒ coi như rảnh).
    static let busyBytesPerSecond = 2_000
    /// Cho phép DỰNG LẠI transport giữa phiên để áp số khai mới.
    ///
    /// Chỉ bật trên iOS: ở đó Go đọc thẳng fd utun của NetworkExtension nên dựng lại transport
    /// chỉ là mở relay + QUIC mới trên CÙNG fd. Trên macOS Go nhận fd của cặp socketpair do
    /// `TunnelBridge` bắc cầu (`HysteriaTransport.resolveTunnelFD`) nên dựng lại là phải dựng
    /// lại cả cầu — cần đo thực địa rồi mới bật; ở macOS số khai vẫn được kẹp theo mạng/bộ nhớ
    /// và ramp chỉ để dành cho lần kết nối sau.
    static var allowsTransportRebuild: Bool {
        #if os(iOS)
        return true
        #else
        return false
        #endif
    }

    /// Trần cứng của mọi số khai (chặn số rác từ bộ đếm hỏng / file bộ nhớ sửa tay).
    static let maxKbps = 10_000_000
    /// Sàn khi khai (dưới mức này thì hysteria chỉ bò — thà về 0 để dùng CC chuẩn).
    static let minKbps = 500
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
        /// (không phải mẫu 1 giây), kbps.
        var peakUpKbps: Int = 0
        var peakDownKbps: Int = 0
        /// Số khai của lần kết nối gần nhất — lần sau bắt đầu từ đây rồi ramp tiếp.
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
        defer { memoryLock.unlock() }
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let decoded = try? JSONDecoder().decode([String: Memory].self, from: data)
        else { return [:] }
        let now = Date()
        return decoded.filter { now.timeIntervalSince($0.value.updatedAt) < memoryFreshness }
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
            reason == .lossBackoff ? "loss-backoff" : "idle-reconnect"
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
        /// Số giây liên tục đang mất gói.
        private var lossSeconds: TimeInterval = 0
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
            let link = BandwidthControl.linkSpeedKbps(identity: identity)
            let ceiling = BandwidthControl.effectiveCeiling(measured: nil, link: link)
            // KHÔNG có bộ nhớ ⇒ đúng mặc định cũ (không làm mạng nào chậm hơn trước).
            var up = base?.lastUpKbps ?? 0
            var down = base?.lastDownKbps ?? 0
            if up <= 0 { up = BandwidthControl.fallbackUpKbps }
            if down <= 0 { down = BandwidthControl.fallbackDownKbps }
            // Mạng từng mất gói: khởi động thận trọng hơn một bậc để không lặp lại cảnh bóp.
            if self.lossSeen {
                up = max(BandwidthControl.minKbps, Int(Double(up) * BandwidthControl.lossBackoff))
                down = max(BandwidthControl.minKbps, Int(Double(down) * BandwidthControl.lossBackoff))
            }
            // Trần trên (min(link speed, đỉnh đo × biên an toàn)) kẹp số khởi động. Chưa đo gì
            // và không đọc được link speed ⇒ `ceiling == nil` ⇒ KHÔNG kẹp (đúng mặc định cũ).
            var clampedByCeiling = false
            if let ceiling, up > ceiling || down > ceiling {
                up = min(up, ceiling)
                down = min(down, ceiling)
                clampedByCeiling = true
            }
            self.upKbps = BandwidthControl.clamp(up)
            self.downKbps = BandwidthControl.clamp(down)
            // Bộ nhớ đã đạt mức nào thì coi như vòng ramp trước đã dùng: lần này vẫn phải
            // QUAN SÁT đủ lâu mới tăng tiếp, trừ khi "bootstrap" của phiên đầu (xem `sample`).
            self.rampEvents = base?.rampEvents ?? 0
            // Lý do để in telemetry: bị trần kẹp > dùng bộ nhớ > còn lại là lần đo đầu.
            self.planReason = clampedByCeiling ? .clamp : (base == nil ? .probe : .memory)
        }

        /// Số khai lúc này (đọc thuần, không side effect).
        var plan: Plan {
            Plan(upKbps: upKbps, downKbps: downKbps, reason: planReason)
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
                    if !pendingChange {
                        pendingChange = true
                        pendingReason = .memory
                    }
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
                pendingReason = .lossBackoff
                pendingChange = true
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
            guard averageIn >= BandwidthControl.minTrustedMeasuredKbps,
                  (saturatedSpan >= BandwidthControl.rampMinObserved || peakOverDeclared || bootstrap)
            else { return nil }
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
            upKbps = BandwidthControl.clamp(ceiling.map { min(Int(Double(upKbps) * multiplier), $0) }
                ?? Int(Double(upKbps) * multiplier))
            downKbps = BandwidthControl.clamp(ceiling.map { min(Int(Double(downKbps) * multiplier), $0) }
                ?? Int(Double(downKbps) * multiplier))
            // Trần đã chặn hết phần tăng ⇒ tăng nữa cũng vô ích, đừng đứt stream (dựng lại
            // transport là mất mọi kết nối đang mở).
            if upKbps == oldUp && downKbps == oldDown {
                RelayDiagnostics.shared.log(
                    "bw: ramp bỏ qua — trần \(ceiling ?? 0) kbps đã chặn số khai "
                        + "up=\(oldUp)/down=\(oldDown) (đo \(averageIn) kbps)"
                )
                return nil
            }
            pendingChange = true
            pendingReason = .ramp
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
            saturatedSince = nil
            // Đo lại từ mốc mới sau khi dựng lại transport (số khai mới ⇒ tốc độ thật có thể
            // cao hơn). Cố ý KHÔNG xoá `everMeasured`: trần suy từ đỉnh cũ vẫn còn giá trị làm
            // mốc an toàn, còn đỉnh mới sẽ tự nâng trần lên khi đo được số cao hơn.
            peakUpKbps = 0
            peakDownKbps = 0
            persistPeaksIfNeeded(force: true)
        }

        /// Ghi số khai + đỉnh của phiên vào bộ nhớ (gọi khi kết thúc phiên hoặc khi có ramp).
        func persistPeaksIfNeeded(force: Bool = false) {
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
            entry.lastUpKbps = upKbps
            entry.lastDownKbps = downKbps
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
