import Foundation
import NetworkExtension
import SystemExtensions
import os
import WireGuardKit

/// macOS VPN manager: registers with the coordinator and drives the tunnel via
/// NetworkExtension (NETunnelProviderManager + the embedded packet-tunnel
/// extension built on WireGuardKit). No `wg-quick`/sudo dependency.
@MainActor
final class VPNManagerMac: ObservableObject {
    private let log = Logger(subsystem: "com.privatevpn.mac", category: "vpn-manager")

    static let providerBundleIdentifier = "com.privatevpn.mac.packet-tunnel"

    /// Tên profile VPN của bản này (đổi từ "FlowVPN" sang "VPNFlow" cho khớp tên app).
    private static let currentProfileName = "VPNFlow"

    /// App group chia sẻ app ↔ system extension (xem `project.yml` — `com.apple.security.application-groups`
    /// khai ở CẢ HAI target macOS).
    private static let sharedAppGroupIdentifier = "G6XW3RN6LJ.com.privatevpn.shared"

    /// Hàng đợi ghi `relay.log` (log chẩn đoán do extension gửi sang) — ngoài main actor.
    private let diagnosticsLogQueue = DispatchQueue(
        label: "com.privatevpn.mac.diagnostics-log", qos: .utility
    )

    /// Ghi đuôi log chẩn đoán của extension vào app group container
    /// (`~/Library/Group Containers/G6XW3RN6LJ.com.privatevpn.shared/relay.log`) để **người dùng
    /// đọc được** — xem vì sao phải là APP ghi ở `probeProviderDiagnostics`.
    ///
    /// Ghi ĐÈ cả file (không nối): `tail` là ảnh chụp phần mới nhất nên file luôn ≤ trần và không
    /// phình theo thời gian — giữ đúng tinh thần cap dung lượng của `RelayDiagnostics`.
    private func saveDiagnosticsLog(_ tail: String) {
        guard let base = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.sharedAppGroupIdentifier
        ) else { return }
        let url = base.appendingPathComponent("relay.log")
        diagnosticsLogQueue.async {
            try? Data(tail.utf8).write(to: url, options: .atomic)
        }
    }

    /// So khớp profile do app này quản lý: chấp nhận cả tên mới "VPNFlow" lẫn tên cũ
    /// "FlowVPN"/"FPT PrivateVPN" để máy đã cài từ bản trước vẫn nhận diện được và dọn
    /// profile cũ đi, tránh treo 2 profile VPN cùng lúc.
    private static func isManagedProfile(_ description: String?) -> Bool {
        guard let description else { return false }
        return description == currentProfileName
            || description == "FlowVPN"
            || description == "FPT PrivateVPN"
    }

    /// Ưu tiên profile tên mới; nếu chưa có (máy vừa nâng cấp bản) thì tạm lấy profile
    /// tên cũ để trạng thái vẫn đúng trước lần connect đầu — connect sẽ dọn nó.
    private static func preferredProfile(in managers: [NETunnelProviderManager]) -> NETunnelProviderManager? {
        managers.first { $0.localizedDescription == currentProfileName }
            ?? managers.first { isManagedProfile($0.localizedDescription) }
    }

    @Published private(set) var state: String = "Disconnected"
    @Published private(set) var overlayIP: String?
    @Published var lastError: String?
    /// A10 §2g — số live của thẻ Diagnostics, cập nhật mỗi 2 s từ extension (nhịp poll sẵn có,
    /// KHÔNG thêm phép đo/pin). `nil` khi chưa kết nối ⇒ UI hiện `—`. Bê nguyên cách iOS làm
    /// (`iOS/PrivateVPN/VPNManager.swift:41`): extension lấy mẫu 1 s, app chỉ đọc lại.
    @Published private(set) var liveDiagnostics: TunnelStatusReport?
    /// CẢNH BÁO khi extension đang chạy KHÁC bản appex nằm trong app này (hệ thống dùng lại bản
    /// cũ ở đường dẫn khác — khách cài bản mới mà vẫn dính lỗi cũ). Chỉ CẢNH BÁO, không tự gỡ.
    @Published private(set) var extensionStaleWarning: String?
    /// Xung đột mạng phát hiện được (app VPN/proxy khác đang tranh chấp) — RỖNG = hệ thống sạch.
    /// Xem `NetworkConflictDetector` (logic thuần) + `NetworkConflictProbe` (đọc máy thật).
    /// Thẻ Diagnostics luôn hiện đủ danh sách này (kể cả mức Info).
    @Published private(set) var networkConflicts: [NetworkConflict] = []
    /// Băng-rôn mức Warning ĐANG hiện (nil = không hiện). Chỉ đặt khi tình trạng ĐỔI so với lần nhắc
    /// trước (chữ ký lưu `UserDefaults`) hoặc khi khách bấm Connect ⇒ mở lại app mà tình trạng y nguyên
    /// thì KHÔNG nhắc lại (yêu cầu chủ dự án 26/09/2026). Mức Info không bao giờ lên băng-rôn.
    @Published private(set) var visibleWarningConflict: NetworkConflict?
    /// Xung đột mức Blocking của lần bấm Connect vừa rồi: UI hiện hộp thoại NÊU TÊN app đang tranh
    /// chấp và hướng dẫn tắt đi rồi bấm Connect lại. Khác `lastError`: đây không phải lỗi tunnel.
    @Published var blockingConflict: NetworkConflict?
    /// Chữ ký tình trạng đã nhắc lần trước (persist) — dùng để chỉ nhắc khi mức/tình trạng ĐỔI.
    private static let conflictNotifiedSignatureKey = "flowvpn.conflict.notifiedSignature"
    /// Những chữ ký khách đã bấm "Không nhắc lại" (persist) — im lặng với ĐÚNG tình trạng đó.
    private static let conflictMutedSignaturesKey = "flowvpn.conflict.mutedSignatures"
    /// Khách đã xem cảnh báo và chọn "Vẫn kết nối" ⇒ bỏ qua cổng chặn ĐÚNG MỘT LẦN.
    private var allowConnectDespiteConflict = false
    /// Base URL control-plane đang dùng: host chính, hoặc host dự phòng đã được xác nhận
    /// sống (sticky) — xem `ControlAPIHosts`. UI dùng giá trị này để dựng link web.
    @Published var coordinatorURL: String = ControlAPIHosts.currentBaseURL.absoluteString
    @Published var devicePublicKey: String?
    /// Exit nodes advertised by the coordinator (list of selectable servers).
    @Published var exitNodes: [ExitNode] = []
    @Published private(set) var isRefreshingNodes = false
    /// True when the node list comes from cache/built-in fallback because the
    /// coordinator was unreachable (e.g. censored network). UI shows a hint.
    @Published private(set) var usingFallbackNodes = false
    /// Currently selected exit node id.
    @Published var selectedNodeID: String? {
        didSet { UserDefaults.standard.set(selectedNodeID, forKey: "selectedNodeID") }
    }

    private var manager: NETunnelProviderManager?
    private var statusPollTask: Task<Void, Never>?
    /// Provider macOS là **system extension** nằm ở `Contents/Library/SystemExtensions/` (không còn
    /// appex trong `Contents/PlugIns`): profile Developer ID chỉ cấp `packet-tunnel-provider-systemextension`,
    /// nên appex plugin không qua được tầng NetworkExtension. Hệ thống chỉ dựng tunnel SAU khi
    /// extension được kích hoạt (lần đầu khách phải tự bấm Allow trong System Settings).
    private var systemExtensionReady = false
    /// Lần kích hoạt đang chạy (nhiều đường vào tunnel có thể gọi cùng lúc) — dùng lại thay vì
    /// gửi trùng request.
    private var systemExtensionActivation: Task<Void, Error>?
    /// Giữ delegate sống tới khi request kết thúc.
    nonisolated(unsafe) private var systemExtensionDelegate: PacketTunnelSystemExtensionDelegate?
    /// Heartbeat định kỳ giữ máy ở trạng thái "đang kết nối" trên dashboard.
    ///
    /// Vì sao cần: từ bản hysteria2, control plane KHÔNG còn thấy handshake WireGuard nên
    /// dashboard chỉ còn `lastSeenAt` do heartbeat ghi lại (route `POST /v1/peers/heartbeat`).
    /// Không gửi thì sau 30 phút máy vẫn đang chạy mà dashboard coi như đã tắt.
    private var heartbeatTask: Task<Void, Never>?
    /// Tunnel đã từng ở trạng thái `.connected` trong phiên này chưa — dùng để phân biệt
    /// "chưa lên" (đang chuẩn bị profile) với "đã lên rồi tắt" khi quyết định dừng heartbeat.
    private var tunnelWasConnected = false
    /// Poll trạng thái extension qua `sendProviderMessage` để bắt ca "Connected nhưng
    /// không có mạng" (mã TUNNEL_NO_TRAFFIC) và hiện thông báo cho khách.
    private var providerProbeTask: Task<Void, Never>?
    /// Đã xử lý mã chẩn đoán cho lần Connect hiện tại chưa — chặn việc vừa hạ tunnel vừa
    /// poll lại ngay khi NEVPNStatus còn kịp báo Connected.
    private var diagnosticHandled = false
    /// Đã báo `TUNNEL_NO_TRAFFIC` một lần cho phiên này chưa — để KHÔNG ghi log/xoá cảnh báo mỗi giây
    /// (app poll extension 1 s/lần) mà vẫn để extension tự cứu. Mirror iOS `noTrafficReported`.
    ///
    /// F1 (`HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md`): `noTraffic` KHÔNG được hạ tunnel.
    private var noTrafficReported = false
    /// Đang hiện cảnh báo RELAY_URL_MISSING (lỗi cấu hình, KHÔNG hạ tunnel) để xoá đúng
    /// lúc khi extension báo đường trực tiếp đã có traffic.
    private var relayConfigWarningShown = false
    /// Khách ĐANG MUỐN tunnel chạy: bật ở `connect()`, tắt ở `disconnect()` (và khi app thoát).
    ///
    /// Vì sao PHẢI phân biệt bằng CỜ Ý ĐỊNH (26/09/2026): ca thật — extension tự gỡ tunnel
    /// (`TUNNEL_NO_TRAFFIC`) lúc 15:01:40 rồi máy nằm **Disconnected ~18 phút**, không ai nối lại;
    /// chỉ khi khách tự đổi node và bấm Connect thì tunnel mới lên. Có cờ này thì app phân biệt được
    /// "tunnel rớt" (phải tự nối lại) với "khách bấm Disconnect" (KHÔNG được nối lại).
    private var userWantsConnected = false
    /// Đang trong chuỗi TỰ NỐI LẠI (chờ backoff hoặc đang thử dựng lại). UI hiện "Connecting…" chứ
    /// KHÔNG để khách thấy "Disconnected" im lặng giữa các lần thử.
    private var autoReconnecting = false
    /// Task của lần chờ backoff hiện tại.
    private var reconnectTask: Task<Void, Never>?
    /// Số lần đã thử tự nối lại LIÊN TIẾP (về 0 khi Connected).
    private var reconnectAttempt = 0
    /// Backoff của chuỗi tự nối lại (giây): 2 → 4 → 8 → 16 → 30 → 60, giữ 60 cho các lần sau.
    private static let reconnectBackoff: [TimeInterval] = [2, 4, 8, 16, 30, 60]
    /// Dấu nhận biết thông báo do chuỗi tự nối lại đặt (để chỉ xoá ĐÚNG thông báo đó khi nối lại xong).
    private static let reconnectMessagePrefix = "Mất kết nối tới VPN"
    nonisolated(unsafe) private var statusObserver: NSObjectProtocol?
    nonisolated(unsafe) private var hostObserver: NSObjectProtocol?

    /// Static ref cho AppDelegate (applicationWillTerminate -> disconnect).
    nonisolated(unsafe) static weak var sharedForTerminate: VPNManagerMac?

    init() {
        VPNManagerMac.sharedForTerminate = self
        // Dọn trạng thái cũ còn sót (cache tunnel/node của bản trước) để lần Connect đầu
        // tiên sau khi cập nhật là một phiên sạch. Chạy đúng một lần nhờ marker.
        StaleStateMigration.runIfNeeded()
        refreshPublicKey()
        selectedNodeID = UserDefaults.standard.string(forKey: "selectedNodeID")
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.refreshStatus()
            }
        }
        // Host dự phòng vừa được xác nhận sống (hoặc mạng đổi): giữ `coordinatorURL` khớp
        // với host đang dùng để các link web (Mua/Điều khoản) trỏ đúng chỗ.
        hostObserver = NotificationCenter.default.addObserver(
            forName: .controlAPIHostDidChange,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let host = note.object as? URL else { return }
            Task { @MainActor in
                self?.coordinatorURL = host.absoluteString
            }
        }
        refreshStatus()
        Task {
            await loadManagerFromPreferences()
            await refreshNodes()
            // Dò app VPN/mạng khác đang tranh chấp NGAY khi mở app để thẻ Diagnostics + băng-rôn có dữ
            // liệu trước khi khách bấm Connect. KHÔNG đo DNS ở đây khi tunnel chưa Connected (luật
            // `NetworkConflictDNSProbePolicy`) — phép đo DNS sẽ chạy ở cạnh "vừa Connected".
            await refreshNetworkConflicts(probeDNS: true)
            // Lưu sẵn providerConfiguration (kèm hysteria2) ngay khi app khởi động: nhờ vậy
            // `scutil --nc start "VPNFlow"` từ terminal cũng dựng đúng provider.
            await refreshSavedConfiguration()
            startStatusPolling()
        }
    }

    deinit {
        if let statusObserver {
            NotificationCenter.default.removeObserver(statusObserver)
        }
        if let hostObserver {
            NotificationCenter.default.removeObserver(hostObserver)
        }
        statusPollTask?.cancel()
        providerProbeTask?.cancel()
        reconnectTask?.cancel()
    }

    private func refreshStatus() {
        // Extension đã báo "Connected nhưng không có mạng": giữ nguyên trạng thái Failed
        // (kèm thông báo ở `lastError`) thay vì để NEVPNStatus kéo về "Disconnected" và
        // làm banner lỗi biến mất. `connect()` sẽ đặt lại cờ này cho lần kết nối sau.
        if diagnosticHandled {
            state = "Failed"
            stopProviderDiagnosticsPolling()
            return
        }
        guard let connection = manager?.connection else {
            if state != "Connecting…" && state != "Disconnecting…" {
                state = "Disconnected"
            }
            // A10 §2g — không còn phiên ⇒ xoá số live để UI hiện `—` (không hiện số cũ).
            liveDiagnostics = nil
            stopProviderDiagnosticsPolling()
            return
        }
        // (26/09/2026) Đang TỰ NỐI LẠI: giữa hai lần thử, NetworkExtension báo `.disconnected` vài
        // nhịp — đừng để nó kéo UI về "Disconnected" (khách tưởng VPN đã tắt hẳn, đúng ca thật
        // "nằm Disconnected 18 phút"). Hiện "Connecting…" cho tới khi nối lại được hoặc khách bấm Stop.
        if autoReconnecting, connection.status == .disconnected || connection.status == .invalid {
            state = "Connecting…"
            overlayIP = nil
            liveDiagnostics = nil
            stopProviderDiagnosticsPolling()
            if tunnelWasConnected {
                tunnelWasConnected = false
                stopHeartbeat()
            }
            return
        }
        state = stateString(for: connection.status)
        if connection.status == .disconnected {
            overlayIP = nil
            liveDiagnostics = nil
        }
        // Heartbeat chỉ dừng khi tunnel ĐÃ từng lên rồi mới tắt. Trong lúc `connect()` chuẩn bị
        // profile, NE báo `.disconnected` vài nhịp — nếu dừng theo trạng thái ngay thì heartbeat
        // chết ngay sau khi vừa khởi động (đo thật 20/09/2026: "bắt đầu" rồi "dừng" sau 19 ms).
        switch connection.status {
        case .connected:
            // CẠNH LÊN (chỉ một lần cho mỗi phiên): đây mới là lúc được phép ĐO DNS — tunnel của mình
            // đã Connected nên DNS do tunnel áp (1.1.1.1/8.8.8.8) mới là thứ app thật sự dùng. Đo
            // trước đó chỉ sinh cảnh báo oan (ca thật 26/09/2026 15:39/15:41). `refreshStatus` chạy
            // mỗi 1 s nên phải gate bằng `tunnelWasConnected` để không đo lại liên tục.
            let justConnected = !tunnelWasConnected
            tunnelWasConnected = true
            if justConnected {
                Task { await refreshNetworkConflicts(probeDNS: true) }
            }
            noteAutoReconnectSucceeded()
        case .disconnected, .invalid:
            if tunnelWasConnected {
                tunnelWasConnected = false
                stopHeartbeat()
                // Tunnel vừa tắt: mọi số đo DNS cũ (đo lúc Connected) hết giá trị ⇒ cập nhật lại để
                // cảnh báo DNS biến mất thay vì đứng lại trên UI.
                Task { await refreshNetworkConflicts(probeDNS: false) }
            }
            // Tunnel ĐÃ TỪNG lên rồi mới tắt, mà khách KHÔNG bấm Disconnect ⇒ session bị rớt:
            // tự nối lại CÓ BACKOFF (không để khách nằm "Disconnected" im lặng — ca thật 26/09/2026).
            // Cố ý gate bằng `tunnelWasConnected`: lúc `connect()` đang chuẩn bị profile, NE báo
            // `.disconnected` vài nhịp (xem chú thích heartbeat ở trên) — nối lại ở đó là vô nghĩa.
            if userWantsConnected {
                scheduleAutoReconnect(reason: "session dropped")
            }
        default:
            break
        }
        switch connection.status {
        case .connecting, .connected, .reasserting:
            if !diagnosticHandled {
                startProviderDiagnosticsPolling()
            }
        default:
            stopProviderDiagnosticsPolling()
        }
    }

    // MARK: - TỰ NỐI LẠI khi session rớt (26/09/2026)

    /// Một lượt rớt session mà khách vẫn muốn VPN chạy ⇒ hẹn nối lại với backoff.
    ///
    /// VÌ SAO (ca thật 26/09/2026): extension tự gỡ tunnel lúc 15:01:40 (`TUNNEL_NO_TRAFFIC`), sau đó
    /// máy nằm **Disconnected ~18 phút** — không có ai nối lại, chỉ khi khách tự đổi node và bấm
    /// Connect thì tunnel mới lên. Mọi cơ chế tự phục hồi cũ đều sống BÊN TRONG tiến trình extension,
    /// nên khi cả session bị gỡ thì không còn ai cứu ⇒ phải có vòng nối lại ở phía APP.
    ///
    /// KHÔNG bật `allowsTransportRebuild` cho đường tự-áp số khai trong phiên (AGENTS §7c) — đây là
    /// vòng nối lại SESSION ở phía app, hoàn toàn khác đường đó.
    private func scheduleAutoReconnect(reason: String) {
        guard userWantsConnected, !autoReconnecting else { return }
        autoReconnecting = true
        attemptAutoReconnect(attempt: 1, reason: reason)
    }

    private func attemptAutoReconnect(attempt: Int, reason: String) {
        guard userWantsConnected else {
            autoReconnecting = false
            return
        }
        reconnectAttempt = attempt
        let wait = Self.reconnectBackoff[min(attempt - 1, Self.reconnectBackoff.count - 1)]
        // KHÁCH THẤY "đang kết nối", KHÔNG thấy "Disconnected" im lặng; nội dung thật nằm ở
        // `lastError` (thẻ Diagnostics hiện nguyên câu).
        state = "Connecting…"
        lastError = "\(Self.reconnectMessagePrefix) — đang tự nối lại lần \(attempt) "
            + "(chờ \(Int(wait))s, lý do: \(reason))."
        log.notice("tự nối lại lần \(attempt) (lý do: \(reason, privacy: .public)) — chờ \(Int(wait))s")
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard let self, !Task.isCancelled, self.userWantsConnected else { return }
            await self.performAutoReconnect(attempt: attempt, reason: reason)
        }
    }

    private func performAutoReconnect(attempt: Int, reason: String) async {
        guard userWantsConnected else {
            autoReconnecting = false
            return
        }
        do {
            if manager == nil { await loadManagerFromPreferences() }
            guard let manager else { throw MacError.savedConfigurationMissing }
            // CHỈ `startVPNTunnel` lại trên profile ĐÃ LƯU (init/connect đã ghi cấu hình hysteria của
            // node đang chọn). Cố ý KHÔNG gọi `refreshSavedConfiguration()`/đường kích hoạt system
            // extension ở đây: nó có thể bật hộp thoại của hệ thống giữa lúc khách đang dùng máy.
            try manager.connection.startVPNTunnel()
            log.notice("tự nối lại lần \(attempt): đã yêu cầu dựng lại tunnel (lý do: \(reason, privacy: .public))")
        } catch {
            log.error("tự nối lại lần \(attempt) THẤT BẠI: \(error.localizedDescription, privacy: .public)")
            attemptAutoReconnect(attempt: attempt + 1, reason: "lần \(attempt) thất bại")
        }
    }

    /// Tunnel `Connected` lại ⇒ đóng chuỗi tự nối lại và xoá ĐÚNG thông báo của nó.
    private func noteAutoReconnectSucceeded() {
        reconnectTask?.cancel()
        reconnectTask = nil
        guard autoReconnecting else { return }
        autoReconnecting = false
        reconnectAttempt = 0
        if lastError?.hasPrefix(Self.reconnectMessagePrefix) == true { lastError = nil }
        log.notice("tự nối lại: THÀNH CÔNG — tunnel đã Connected lại")
    }

    /// Khách chủ động ĐỔI Ý (bấm Disconnect / thoát app) ⇒ huỷ mọi lần nối lại đang chờ.
    private func cancelAutoReconnect() {
        userWantsConnected = false
        reconnectTask?.cancel()
        reconnectTask = nil
        autoReconnecting = false
        reconnectAttempt = 0
    }

    // MARK: - Provider diagnostics ("Connected nhưng không có mạng")

    /// Hỏi extension trạng thái phiên mỗi 2s. Extension không có UI và NetworkExtension
    /// không trả lỗi provider cho app, nên đây là cách duy nhất để biết tunnel "lên" mà
    /// không có traffic và hiện thông báo tiếng Việt kèm mã chẩn đoán.
    private func startProviderDiagnosticsPolling() {
        guard providerProbeTask == nil else { return }
        providerProbeTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled, let self else { return }
                await self.probeProviderDiagnostics()
            }
        }
    }

    private func stopProviderDiagnosticsPolling() {
        providerProbeTask?.cancel()
        providerProbeTask = nil
    }

    /// So danh tính extension ĐANG CHẠY với bản system extension nằm trong app này.
    ///
    /// Vì sao: macOS phân giải extension theo LaunchServices, nên đã cài `/Applications/VPNFlow.app`
    /// mới mà hệ thống vẫn launch bản extension ở một VPNFlow.app cũ (đường dẫn khác) — khách tưởng
    /// đã cập nhật nhưng vẫn chạy code cũ. Ở đây chỉ CẢNH BÁO (không tự gỡ cấu hình VPN của khách).
    private func checkExtensionIdentity(_ report: TunnelStatusReport) {
        let running = "\(report.extensionVersion ?? "?")/\(report.extensionBuild ?? "?")"
        let path = report.extensionPath ?? "?"
        let mtime = report.extensionMTime ?? "?"
        // Provider macOS nay nằm ở Contents/Library/SystemExtensions/<bundle-id>.systemextension
        // (Apple bắt tên gói trùng bundle identifier), không còn appex trong Contents/PlugIns.
        let systemExtension = Bundle.main.bundleURL
            .appendingPathComponent("Contents/Library/SystemExtensions")
            .appendingPathComponent("\(Self.providerBundleIdentifier).systemextension")
        guard let info = Bundle(url: systemExtension)?.infoDictionary else {
            extensionStaleWarning = nil
            return
        }
        let appVersion = "\(info["CFBundleShortVersionString"] as? String ?? "?")/"
            + "\(info["CFBundleVersion"] as? String ?? "?")"
        var appMTime = "?"
        let executable = info["CFBundleExecutable"] as? String ?? Self.providerBundleIdentifier
        let binary = systemExtension.appendingPathComponent("Contents/MacOS/\(executable)")
        if let attributes = try? FileManager.default.attributesOfItem(atPath: binary.path),
           let modified = attributes[.modificationDate] as? Date {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
            formatter.locale = Locale(identifier: "en_US_POSIX")
            appMTime = formatter.string(from: modified)
        }
        let runningIdentity = ExtensionIdentityPolicy.Identity(
            version: report.extensionVersion, build: report.extensionBuild, mTime: report.extensionMTime
        )
        let localIdentity = ExtensionIdentityPolicy.Identity(
            version: info["CFBundleShortVersionString"] as? String,
            build: info["CFBundleVersion"] as? String,
            mTime: appMTime
        )
        let stale = ExtensionIdentityPolicy.isStale(running: runningIdentity, local: localIdentity)
        // Ghi vào FILE chẩn đoán của APP (không chỉ os_log) để grep được bất cứ lúc nào — kể cả
        // khi KHỚP. Đây là bằng chứng cho ca "macOS dùng lại appex cũ dù đã cài bản mới".
        let verdict = stale ? "CU" : "KHOP"
        let line = "extension: dang-chay=\(runningIdentity.label) mtime=\(mtime) path=\(path) "
            + "| cua-app=\(appVersion) mtime=\(appMTime) => \(verdict)\n"
        let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("extension-identity.log")
        if let file, let data = line.data(using: .utf8) {
            if let handle = try? FileHandle(forWritingTo: file) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
            } else {
                try? data.write(to: file)
            }
        }
        log.info("extension đang chạy: \(running, privacy: .public) mtime \(mtime, privacy: .public) path \(path, privacy: .public) — app kèm: \(appVersion, privacy: .public) mtime \(appMTime, privacy: .public) => \(verdict, privacy: .public)")
        extensionStaleWarning = stale ? "\(runningIdentity.label) · \(path)" : nil
    }

    private func probeProviderDiagnostics() async {
        guard let session = manager?.connection as? NETunnelProviderSession else { return }
        let report: TunnelStatusReport? = await withCheckedContinuation { continuation in
            do {
                try session.sendProviderMessage(Data()) { data in
                    guard let data,
                          let decoded = try? JSONDecoder().decode(TunnelStatusReport.self, from: data) else {
                        continuation.resume(returning: nil)
                        return
                    }
                    continuation.resume(returning: decoded)
                }
            } catch {
                continuation.resume(returning: nil)
            }
        }
        guard let report else { return }
        // A10 §2g — cập nhật số live cho thẻ Diagnostics ở MỌI nhịp (phiên bình thường cũng có),
        // y như iOS (`iOS/PrivateVPN/VPNManager.swift:282`). Không che trạng thái thật: cầu WS
        // chập thì extension trả số thấp/`—` đúng lúc.
        liveDiagnostics = report
        checkExtensionIdentity(report)
        // 26/09/2026 — lưu đuôi log chẩn đoán của extension ra app group container. **Tiện cho HỖ
        // TRỢ**, KHÔNG phải bản sửa "thẻ Diagnostics trống": thẻ lấy số live qua CHÍNH kênh này
        // (`sendProviderMessage`), không đọc file. Vì sao phải để APP ghi: extension macOS là system
        // extension chạy **root**; app group container là theo từng user nên container của nó là
        // `/var/root/…` và sandbox của nó CHẶN ghi vào container của user (đo thật 26/09/2026:
        // `probes[user:… write=false]`). Xem `TunnelStatusReport.logTail`.
        if let tail = report.logTail { saveDiagnosticsLog(tail) }
        guard let code = report.code else {
            // Extension đã xoá mã (ví dụ đường UDP trực tiếp có traffic): gỡ cảnh báo cấu
            // hình cũ để không hiện lỗi giả cho phiên đang chạy.
            if relayConfigWarningShown {
                relayConfigWarningShown = false
                lastError = nil
            }
            return
        }
        // Thiếu relay URL là lỗi CẤU HÌNH, không phải tunnel chết: extension đã lui về UDP
        // trực tiếp nên phiên có thể vẫn chạy. Chỉ hiện cảnh báo, KHÔNG hạ tunnel — hạ ở
        // đây sẽ cắt ngang một phiên trực tiếp đang hoạt động.
        if code == TunnelDiagnosticCode.relayURLMissing {
            log.error("provider diagnostics: code=\(code, privacy: .public) session=\(report.session) transport=\(report.transport, privacy: .public)")
            lastError = report.message ?? "Node không khai địa chỉ relay (mã \(code))."
            relayConfigWarningShown = true
            return
        }
        guard code == TunnelDiagnosticCode.noTraffic || code == TunnelDiagnosticCode.startFailed else {
            return
        }
        log.error("provider diagnostics: code=\(code, privacy: .public) session=\(report.session) rx=\(report.rxBytes) tx=\(report.txBytes) transport=\(report.transport, privacy: .public)")

        // F1 (`HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md`, mức High) — `noTraffic` KHÁC `startFailed`.
        //
        // MIRROR iOS (`iOS/PrivateVPN/VPNManager.swift:363`): `noTraffic` là **TRẠNG THÁI** ("tunnel đang
        // không chở gói"), KHÔNG phải lệnh giết. Extension có watchdog + dựng lại transport + tự đổi
        // node để tự cứu; khi hết đường thì `selfRescue` tự `teardownAndCancel` ⇒ hệ thống báo
        // `.disconnected` và UI hiện đúng — app không cần hạ lần nữa.
        //
        // Trước bản này macOS hạ tunnel cho CẢ HAI mã ⇒ khách thấy **"tự ngắt"** đúng lúc extension
        // đang tự cứu (lệch hẳn với iOS đã sửa 25/09).
        //
        // Cache: CHỈ xoá khi `startFailed` (trả lời câu hỏi mở #3 của review) — xoá cache trong cửa sổ
        // no-traffic có thể làm mất cấu hình mà extension đang dùng để tự cứu.
        if code == TunnelDiagnosticCode.noTraffic {
            if !noTrafficReported {
                noTrafficReported = true
                lastError = report.message ?? "Tunnel tạm thời không có dữ liệu — đang tự phục hồi."
                log.error("provider diagnostics: noTraffic — KHÔNG hạ tunnel (để extension tự cứu)")
            }
            return
        }

        // `startFailed`: lỗi khởi động THẬT, không có tunnel nào để giữ ⇒ hạ để không blackhole toàn
        // bộ traffic (route 0.0.0.0/0 qua utun mà không có mạng chính là bug khách báo).
        // `diagnosticHandled` giữ trạng thái Failed + thông báo cho tới lần Connect kế tiếp.
        lastError = report.message ?? "Tunnel không khởi động được (mã \(code)). Vui lòng thử lại."
        diagnosticHandled = true
        stopProviderDiagnosticsPolling()
        refreshStatus()
        manager?.connection.stopVPNTunnel()
    }

    private func stateString(for status: NEVPNStatus) -> String {
        switch status {
        case .invalid: return "Failed"
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting…"
        case .connected: return "Connected"
        case .reasserting: return "Connecting…"
        case .disconnecting: return "Disconnecting…"
        @unknown default: return "Disconnected"
        }
    }

    func refreshPublicKey() {
        let key = WireGuardKeychain.loadOrCreatePrivateKey()
        devicePublicKey = key.publicKey
    }

    private static func stableSuffix(from publicKey: String) -> String {
        let safe = publicKey
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
        return String(safe.prefix(8))
    }

    private static func randomRegistrationName() -> String {
        "mac-\(UUID().uuidString.prefix(8).lowercased())"
    }

    /// Prepends `https://` when the user omits a scheme (common when pasting a
    /// bare host:port), then parses.
    private func normalizedURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withScheme: String
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            withScheme = trimmed
        } else {
            withScheme = "https://" + trimmed
        }
        return URL(string: withScheme)
    }

    // MARK: - Xung đột mạng (app VPN/proxy khác đang tranh chấp)

    /// Dò app VPN/mạng khác đang tranh chấp rồi GHI LOG + cập nhật UI (băng-rôn + thẻ Diagnostics).
    ///
    /// `probeDNS: true` mới gửi truy vấn DNS ra ngoài để biết resolver nào không trả lời (ca thật
    /// `202.96.134.133` timeout làm DNS treo 5 s) — và CHỈ khi tunnel của mình đang Connected
    /// (`NetworkConflictDNSProbePolicy`): đo lúc tunnel tắt là chính nguồn cảnh báo DNS oan.
    /// Đường Connect cố ý truyền `false` để KHÔNG làm chậm việc kết nối.
    ///
    /// `nudge: true` (chỉ khi khách BẤM CONNECT) cho phép hiện lại băng-rôn/hộp thoại dù tình trạng
    /// chưa đổi — đúng luật "chỉ hiện khi mức đổi HOẶC khi bấm Connect". Tình trạng đã bấm "Không nhắc
    /// lại" thì im lặng tuyệt đối.
    func refreshNetworkConflicts(probeDNS: Bool = true, nudge: Bool = false) async {
        let rawConflicts = await NetworkConflictProbe.detect(
            ownOverlayIP: overlayIP,
            tunnelConnected: state == "Connected",
            probeDNS: probeDNS
        )
        // (26/09/2026) Tunnel của CHÍNH mình đang Connected ⇒ không được doạ khách ở mức Blocking vì
        // "VPN khác đang giữ đường mặc định": đường mặc định đó là của mình. Ca thật trên máy chủ dự án:
        // `conflict [Blocking] … utun8 (default route IPv4, gateway 100.100.100.101)` — `100.100.100.101`
        // chính là địa chỉ utun VPNFlow ⇒ khách tưởng phải tắt app khác, bấm loạn, tunnel bị ngắt.
        let conflicts = NetworkConflictDetector.demoteOwnTunnelFalsePositives(
            rawConflicts,
            tunnelConnected: state == "Connected"
        )
        networkConflicts = conflicts
        updateConflictNotice(conflicts, nudge: nudge)
        guard !conflicts.isEmpty else {
            log.info("conflict: không phát hiện phần mềm mạng nào tranh chấp")
            return
        }
        // Dòng log theo đúng định dạng support cần grep:
        // `conflict: Blocking — Tailscale (Connected) · system proxy 127.0.0.1:7890`
        log.warning("conflict: \(NetworkConflictDetector.summary(for: conflicts), privacy: .public)")
        for conflict in conflicts {
            log.warning("conflict [\(conflict.severity.label, privacy: .public)] \(conflict.title, privacy: .public) — \(conflict.facts.joined(separator: " · "), privacy: .public)")
        }
    }

    /// Quyết định có hiện băng-rôn mức Warning hay không (mức Info im lặng, mức Blocking đã có hộp
    /// thoại riêng khi bấm Connect).
    ///
    /// Luật chủ dự án chốt 26/09/2026 — "băng-rôn/hộp thoại không được làm phiền":
    /// - chỉ hiện khi tình trạng ĐỔI (chữ ký khác lần nhắc trước, lưu `UserDefaults`) hoặc `nudge`;
    /// - khách đã bấm "Không nhắc lại" cho ĐÚNG chữ ký đó ⇒ không bao giờ hiện lại;
    /// - mở lại app mà tình trạng y nguyên ⇒ không hiện (nhờ chữ ký đã lưu).
    private func updateConflictNotice(_ conflicts: [NetworkConflict], nudge: Bool) {
        guard let warning = conflicts.first(where: { $0.severity == .warning }) else {
            visibleWarningConflict = nil
            return
        }
        let signature = NetworkConflictDetector.signature(for: conflicts)
        let defaults = UserDefaults.standard
        let muted = Set(defaults.stringArray(forKey: Self.conflictMutedSignaturesKey) ?? [])
        guard !muted.contains(signature) else {
            visibleWarningConflict = nil
            return
        }
        let alreadyNotified = defaults.string(forKey: Self.conflictNotifiedSignatureKey) == signature
        guard nudge || !alreadyNotified else { return }
        visibleWarningConflict = warning
        defaults.set(signature, forKey: Self.conflictNotifiedSignatureKey)
    }

    /// Tình trạng xung đột hiện tại đã được khách bấm "Không nhắc lại" chưa.
    private func isCurrentConflictMuted() -> Bool {
        let signature = NetworkConflictDetector.signature(for: networkConflicts)
        guard !signature.isEmpty else { return false }
        let muted = Set(UserDefaults.standard.stringArray(forKey: Self.conflictMutedSignaturesKey) ?? [])
        return muted.contains(signature)
    }

    /// Khách bấm "Không nhắc lại": lưu CHỮ KÝ tình trạng hiện tại vào `UserDefaults` ⇒ từ nay đúng tình
    /// trạng đó thì im lặng (không băng-rôn, không hộp thoại, không chặn Connect), kể cả sau khi mở lại
    /// app. Tình trạng KHÁC (app khác, dấu hiệu khác) vẫn được nhắc bình thường.
    func muteCurrentConflict() {
        let signature = NetworkConflictDetector.signature(for: networkConflicts)
        guard !signature.isEmpty else {
            blockingConflict = nil
            visibleWarningConflict = nil
            return
        }
        var muted = Set(UserDefaults.standard.stringArray(forKey: Self.conflictMutedSignaturesKey) ?? [])
        muted.insert(signature)
        UserDefaults.standard.set(Array(muted).sorted(), forKey: Self.conflictMutedSignaturesKey)
        blockingConflict = nil
        visibleWarningConflict = nil
        log.notice("conflict: khách chọn KHÔNG NHẮC LẠI cho tình trạng hiện tại")
    }

    /// Khách đã xem hộp thoại cảnh báo và chọn "Vẫn kết nối" ⇒ thử kết nối dù có xung đột Blocking.
    func connectDespiteConflict(authStore: AuthSessionStore) async {
        allowConnectDespiteConflict = true
        blockingConflict = nil
        await connect(authStore: authStore)
    }

    /// Đóng hộp thoại cảnh báo mà không kết nối (mặc định: khách phải tắt app kia rồi bấm Connect lại).
    func dismissBlockingConflict() {
        blockingConflict = nil
    }

    func connect(authStore: AuthSessionStore) async {
        guard state != "Connecting…", state != "Disconnecting…" else { return }

        // Cổng chặn TRƯỚC khi dựng tunnel. Vì sao: khi Clash/Mihomo/Tailscale… đang giữ default
        // route hoặc cắm DNS, tunnel của VPNFlow chắc chắn hỏng (khách chỉ thấy "connecting mãi"
        // hoặc "Connected mà không có mạng") và request tới api.meetflowai.site có thể hỏng luôn
        // phần đăng nhập. Dò NHANH (không đo DNS) rồi hiện hộp thoại NÊU TÊN app cho khách tắt đi,
        // thay vì để khách tự đoán. Khách vẫn có đường "Vẫn kết nối" nếu chủ động muốn thử.
        //
        // `nudge: true`: khách VỪA bấm Connect nên được phép nhắc lại (kể cả tình trạng chưa đổi) —
        // trừ khi họ đã bấm "Không nhắc lại" cho đúng tình trạng đó.
        await refreshNetworkConflicts(probeDNS: false, nudge: true)
        if !allowConnectDespiteConflict,
           let blocking = networkConflicts.first(where: { $0.severity == .blocking }),
           !isCurrentConflictMuted() {
            log.error("conflict: CHẶN kết nối — \(NetworkConflictDetector.summary(for: self.networkConflicts), privacy: .public)")
            blockingConflict = blocking
            return
        }
        allowConnectDespiteConflict = false

        state = "Connecting…"
        lastError = nil
        // Lần Connect mới: cho phép poll lại chẩn đoán của extension.
        diagnosticHandled = false
        noTrafficReported = false
        relayConfigWarningShown = false
        // Khách ĐANG MUỐN VPN chạy (mọi lần rớt session sau đây đều được tự nối lại) và mọi chuỗi
        // tự nối lại cũ (nếu có) phải bị huỷ — lần này là Connect do khách bấm.
        userWantsConnected = true
        reconnectTask?.cancel()
        reconnectTask = nil
        autoReconnecting = false
        reconnectAttempt = 0

        let privateKey = WireGuardKeychain.loadOrCreatePrivateKey()

        // Mỗi lần Connect đều hỏi control plane lấy cấu hình MỚI. Trước đây macOS có
        // "fast path" replay cấu hình đã lưu (khác iOS): nó dựng lại overlay IP/node cũ,
        // nên lần Connect thứ hai chạy trên cấu hình phiên trước — tunnel báo "lên" mà
        // không có mạng. Chỉ dùng cache khi control plane KHÔNG tới được (nhánh
        // `.transport` bên dưới) — đó là lý do rõ ràng để giữ lại.
        do {
            // Provider macOS là system extension ⇒ phải kích hoạt XONG mới được lưu/đựng tunnel.
            // Lỗi ở đây (ví dụ khách chưa bấm Allow) được dịch thành câu hướng dẫn cụ thể.
            try await activatePacketTunnelSystemExtension()
            guard let baseURL = normalizedURL(coordinatorURL) else {
                throw MacError.invalidURL(coordinatorURL)
            }
            log.info("connect: coordinator=\(baseURL.absoluteString, privacy: .public)")

            let bootstrap = ControlAPIClient(baseURL: baseURL, joinToken: "")

            let node = try await selectedExitNode(client: bootstrap)
            log.info("connect: selected node \(node.name, privacy: .public) @ \(node.endpoint, privacy: .public)")

            var overlayIP: String
            var exitNode = node
            do {
                log.info("connect: fetching enrollment token")
                guard let accessToken = authStore.accessToken else {
                    throw ControlAPIClient.ClientError.missingSession
                }
                let token = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)

                let deviceName = "mac-\(Self.stableSuffix(from: privateKey.publicKey))"
                var activeKeyPair = privateKey
                var response: CoordinatorRegisterResponse
                do {
                    response = try await registerDevice(
                        baseURL: baseURL,
                        joinToken: token,
                        name: deviceName,
                        publicKey: activeKeyPair.publicKey,
                        accessToken: accessToken,
                        exitNodeId: selectedNodeID
                    )
                } catch ControlAPIClient.ClientError.deviceLimit(let message, let devices) {
                    // Hết hạn mức thiết bị: nếu bản ghi CŨ của chính máy này còn đó (xoay khoá làm server
                    // coi là thiết bị mới) thì nhường slot rồi đăng ký lại (previousInstallCandidate).
                    // Không đoán được (0 hoặc >1 ứng viên) thì ném lỗi để UI hiện danh sách thiết bị.
                    guard let candidate = previousInstallCandidate(
                        devices: devices,
                        platform: "macos",
                        publicKey: activeKeyPair.publicKey
                    ) else {
                        throw ControlAPIClient.ClientError.deviceLimit(message: message, devices: devices)
                    }
                    let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
                    response = try await registerDevice(
                        baseURL: baseURL,
                        joinToken: retryToken,
                        name: deviceName,
                        publicKey: activeKeyPair.publicKey,
                        accessToken: accessToken,
                        exitNodeId: selectedNodeID,
                        replaceDeviceId: candidate.device_id
                    )
                } catch ControlAPIClient.ClientError.server(let message) {
                    if message.localizedCaseInsensitiveContains("revoked") {
                        // Device was revoked server-side; old key can never
                        // register. Rotate to a fresh keypair -> NEW device.
                        activeKeyPair = WireGuardKeychain.rotate()
                        let freshToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
                        response = try await registerDevice(
                            baseURL: baseURL,
                            joinToken: freshToken,
                            name: Self.randomRegistrationName(),
                            publicKey: activeKeyPair.publicKey,
                            accessToken: accessToken,
                            exitNodeId: selectedNodeID
                        )
                    } else if message.localizedCaseInsensitiveContains("name") {
                        let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
                        response = try await registerDevice(
                            baseURL: baseURL,
                            joinToken: retryToken,
                            name: Self.randomRegistrationName(),
                            publicKey: activeKeyPair.publicKey,
                            accessToken: accessToken,
                            exitNodeId: selectedNodeID
                        )
                    } else {
                        let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
                        response = try await registerDevice(
                            baseURL: baseURL,
                            joinToken: retryToken,
                            name: deviceName,
                            publicKey: activeKeyPair.publicKey,
                            accessToken: accessToken,
                            exitNodeId: selectedNodeID
                        )
                    }
                }
                overlayIP = response.overlay_ip
                log.info("connect: registered, overlay=\(overlayIP, privacy: .public)")
                TunnelConfigCache.save(overlayIP: overlayIP, node: exitNode)
                usingFallbackNodes = false
                startHeartbeat(baseURL: baseURL, peerId: response.peer_id, credential: response.peer_credential)
            } catch ControlAPIClient.ClientError.transport {
                // Coordinator unreachable (hotel captive portal / censored
                // network): reconnect with the last successful tunnel config.
                // The WireGuard peer still exists on the node's wg0. The exit
                // node always follows the user's picker selection (falling
                // back to the cached node only when the picker has no list).
                if let cached = TunnelConfigCache.load() {
                    overlayIP = cached.overlayIP
                    exitNode = preferredExitNode(fallback: cached.node)
                    usingFallbackNodes = true
                    log.info("connect: coordinator unreachable — using cached tunnel config (overlay=\(overlayIP, privacy: .public), node=\(exitNode.id, privacy: .public))")
                } else if let saved = savedTunnelConfig() {
                    // No TunnelConfigCache yet (e.g. first run of this build),
                    // but the VPN profile from a previous session is still on
                    // disk — replay it directly.
                    overlayIP = Self.overlayIP(fromSaved: saved)
                    exitNode = preferredExitNode(fallback: savedExitNode(from: saved))
                    usingFallbackNodes = true
                    log.info("connect: coordinator unreachable — replaying saved VPN profile (overlay=\(overlayIP, privacy: .public), node=\(exitNode.id, privacy: .public))")
                } else {
                    // Profile may not be loaded yet (init loads it async).
                    await loadManagerFromPreferences()
                    if let saved = savedTunnelConfig() {
                        overlayIP = Self.overlayIP(fromSaved: saved)
                        exitNode = preferredExitNode(fallback: savedExitNode(from: saved))
                        usingFallbackNodes = true
                        log.info("connect: coordinator unreachable — replayed saved VPN profile after reload (overlay=\(overlayIP, privacy: .public))")
                    } else {
                        throw ControlAPIClient.ClientError.transport(
                            endpoint: "coordinator",
                            MacError.cachedTunnelUnavailable
                        )
                    }
                }
            }

            try await startTunnel(privateKey: privateKey, overlayIP: overlayIP, node: exitNode)
        } catch {
            state = "Failed"
            lastError = error.localizedDescription
            let ns = error as NSError
            log.error("connect failed: \(error.localizedDescription, privacy: .public) [domain=\(ns.domain, privacy: .public) code=\(ns.code)]")
            NSLog("MacVPN: connect failed: \(error.localizedDescription) [\(ns.domain) \(ns.code)]")
        }
    }

    /// Shared tunnel start: builds the WireGuard config and starts the tunnel.
    private func startTunnel(privateKey: WireGuardKeychain.KeyPair, overlayIP: String, node: ExitNode) async throws {
        let config = Self.buildConfig(privateKeyBase64: privateKey.privateKey,
                                      overlayIP: overlayIP,
                                      exitEndpoint: node.endpoint,
                                      exitPublicKey: node.public_key)
        // Relay đi kèm config y như iOS: mạng bị chặn IP node thì extension tự đi qua relay
        // TCP (cạnh exit node) rồi tới relay WS của ĐÚNG node này (Tailscale Funnel) — thiếu
        // phần này thì macOS "Connected" mà không có mạng, đúng lỗi đo được 14/09.
        // `relayURL` = wg_relay_url ?? ws_relay_url: control plane nay cấp relay WireGuard ở
        // field mới `wg_relay_url` và để `ws_relay_url` = null (chỉ còn là bí danh cũ). Đọc
        // thẳng `ws_relay_url` như trước ⇒ luôn nil ⇒ extension rơi vào relay mặc định của
        // node KHÁC và WireGuard im lặng (đúng log "this node declared no relay URL").
        try await prepareConfiguration(
            config,
            nodeId: node.id,
            wsRelayURL: node.relayURL,
            hysteriaNode: node,
            // Danh sách node app ĐÃ TẢI — nguồn ứng viên ĐỔI NODE cho extension (26/09/2026).
            hysteriaNodes: exitNodes
        )
        guard let manager else {
            throw MacError.savedConfigurationMissing
        }

        do {
            try manager.connection.startVPNTunnel()
        } catch {
            let ns = error as NSError
            log.error("connect: startVPNTunnel failed: \(error.localizedDescription, privacy: .public) [domain=\(ns.domain, privacy: .public) code=\(ns.code)]")
            throw error
        }
        self.overlayIP = overlayIP
        lastError = nil
        log.info("connect: startVPNTunnel initiated, overlay=\(overlayIP, privacy: .public)")
        startStatusPolling()
    }

    private func registerDevice(baseURL: URL, joinToken: String, name: String, publicKey: String, accessToken: String, exitNodeId: String?, replaceDeviceId: String? = nil) async throws -> CoordinatorRegisterResponse {
        let client = ControlAPIClient(baseURL: baseURL, joinToken: joinToken)
        return try await client.register(
            name: name,
            platform: "macos",
            wireguardPublicKey: publicKey,
            endpoint: "0.0.0.0:51820",
            accessToken: accessToken,
            exitNodeId: exitNodeId,
            replaceDeviceId: replaceDeviceId
        )
    }

    /// Loads the list of exit nodes from the coordinator (for the picker).
    /// On failure (e.g. control plane unreachable on a censored network) falls
    /// back to the last cached list, then to built-in fallback nodes so the
    /// picker is never empty.
    func refreshNodes() async {
        guard let baseURL = normalizedURL(coordinatorURL) else { return }
        isRefreshingNodes = true
        defer { isRefreshingNodes = false }

        let client = ControlAPIClient(baseURL: baseURL, joinToken: "")
        var nodes: [ExitNode] = []
        var fromFallback = false
        do {
            nodes = try await client.fetchNodes()
            if !nodes.isEmpty {
                ExitNodeCache.save(nodes)
            }
        } catch {
            NSLog("MacVPN: refreshNodes failed: \(error.localizedDescription)")
        }
        if nodes.isEmpty {
            nodes = ExitNodeCache.load() ?? ExitNode.builtInFallback
            fromFallback = true
            NSLog("MacVPN: using fallback nodes (\(nodes.count))")
        }
        usingFallbackNodes = fromFallback
        exitNodes = nodes
        if let selectedNodeID, !nodes.contains(where: { $0.id == selectedNodeID }) {
            self.selectedNodeID = nodes.first?.id
        } else if selectedNodeID == nil, let first = nodes.first {
            selectedNodeID = first.id
        }
        if nodes.isEmpty {
            lastError = MacError.noExitNode.localizedDescription
        } else if lastError == MacError.noExitNode.localizedDescription {
            lastError = nil
        }
    }

    var selectedNode: ExitNode? {
        exitNodes.first { $0.id == selectedNodeID } ?? exitNodes.first
    }

    private func selectedExitNode(client: ControlAPIClient) async throws -> ExitNode {
        // Prefer a fresh fetch, but fall back to whatever is already loaded
        // (cached/built-in) so connect still works when the coordinator is
        // temporarily unreachable on the current network.
        if let nodes = try? await client.fetchNodes(), !nodes.isEmpty {
            exitNodes = nodes
            ExitNodeCache.save(nodes)
            usingFallbackNodes = false
            let selected = nodes.first { $0.id == selectedNodeID } ?? nodes.first!
            selectedNodeID = selected.id
            return selected
        }
        if let node = selectedNode ?? exitNodes.first {
            usingFallbackNodes = true
            return node
        }
        throw MacError.noExitNode
    }

    func disconnect() {
        // Khách CHỦ ĐỘNG tắt: huỷ mọi chuỗi tự nối lại (không được "tự bật lại" sau khi khách tắt).
        cancelAutoReconnect()
        state = "Disconnecting…"
        stopHeartbeat()
        manager?.connection.stopVPNTunnel()
        // A10 §2g — xoá số live ngay (UI hiện `—`), y như iOS `disconnect()`.
        liveDiagnostics = nil
        refreshStatus()
    }

    // MARK: - Heartbeat (dashboard "đang kết nối")

    /// Gửi heartbeat ngay rồi lặp lại mỗi 120s khi tunnel còn sống.
    ///
    /// Số khai 120s: control plane coi thiết bị "vừa báo cáo" trong cửa sổ 30 phút
    /// (`ONLINE_DEVICE_WINDOW_MIN`), nên 120s là dư an toàn kể cả khi mạng chập chờn vài lượt.
    private func startHeartbeat(baseURL: URL, peerId: String, credential: String) {
        stopHeartbeat()
        log.notice("heartbeat: bắt đầu giữ trạng thái online (peer=\(peerId.prefix(8), privacy: .public))")
        heartbeatTask = Task { [weak self] in
            let client = ControlAPIClient(baseURL: baseURL, joinToken: "")
            while !Task.isCancelled {
                guard let self else { return }
                do {
                    try await client.heartbeat(peerId: peerId, credential: credential)
                    self.log.notice("heartbeat: ok")
                } catch {
                    // Không được để heartbeat làm phiền trải nghiệm: chỉ ghi log.
                    self.log.error("heartbeat failed: \(error.localizedDescription, privacy: .public)")
                }
                try? await Task.sleep(nanoseconds: 120 * 1_000_000_000)
            }
        }
    }

    private func stopHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }

    // MARK: - System extension (provider macOS)

    /// Kích hoạt packet-tunnel provider dưới dạng **system extension** rồi mới cho phép lưu/đựng tunnel.
    ///
    /// Vì sao BẮT BUỘC: profile Developer ID (`MAC_APP_DIRECT`) chỉ cấp bộ quyền `*-systemextension`.
    /// Appex plugin khai `packet-tunnel-provider` bị AMFI chặn (`Code=-413 "No matching profile
    /// found"` ⇒ macOS không mở nổi app), còn khi khai `packet-tunnel-provider-systemextension` thì
    /// NetworkExtension từ chối appex plugin (`pkd: could not create extension point record … -10814`,
    /// tunnel đứng ở `Disconnected`). Đường chạy được là system extension + kích hoạt tường minh.
    ///
    /// Lần đầu, macOS bắt chủ máy tự bật extension trong System Settings → Privacy & Security;
    /// trường hợp đó trả lỗi `needsUserApproval` kèm câu hướng dẫn cụ thể cho khách.
    func activatePacketTunnelSystemExtension() async throws {
        if systemExtensionReady { return }
        if let running = systemExtensionActivation {
            try await running.value
            return
        }
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            try await self.submitSystemExtensionActivationRequest()
            self.systemExtensionReady = true
            self.systemExtensionDelegate = nil
            self.log.notice("system extension: đã kích hoạt \(Self.providerBundleIdentifier, privacy: .public)")
        }
        systemExtensionActivation = task
        do {
            try await task.value
            systemExtensionActivation = nil
        } catch {
            systemExtensionActivation = nil
            throw error
        }
    }

    private func submitSystemExtensionActivationRequest() async throws {
        log.notice("system extension: gửi yêu cầu kích hoạt \(Self.providerBundleIdentifier, privacy: .public)")
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let delegate = PacketTunnelSystemExtensionDelegate(
                extensionIdentifier: Self.providerBundleIdentifier,
                appBundlePath: Bundle.main.bundlePath
            ) { result in
                continuation.resume(with: result)
            }
            systemExtensionDelegate = delegate
            let request = OSSystemExtensionRequest.activationRequest(
                forExtensionWithIdentifier: Self.providerBundleIdentifier,
                queue: .main
            )
            request.delegate = delegate
            OSSystemExtensionManager.shared.submitRequest(request)
            // Lưới an toàn: hệ thống luôn gọi lại (needsUserApproval / completed / failed), nhưng nếu
            // không có callback nào thì tự bỏ cuộc sau 2 phút thay vì treo "Connecting…" mãi.
            Task { @MainActor [weak delegate] in
                try? await Task.sleep(for: .seconds(120))
                delegate?.timeOut()
            }
        }
    }

    // MARK: - Config

    private static func buildConfig(privateKeyBase64: String, overlayIP: String, exitEndpoint: String, exitPublicKey: String) -> WireGuardConfig {
        WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: privateKeyBase64,
            addresses: ["\(overlayIP)/24"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: exitPublicKey,
                    endpoint: exitEndpoint,
                    allowedIPs: ["0.0.0.0/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )
    }

    private func prepareConfiguration(
        _ config: WireGuardConfig,
        nodeId: String? = nil,
        wsRelayURL: String? = nil,
        hysteriaNode: ExitNode? = nil,
        hysteriaNodes: [ExitNode] = []
    ) async throws {
        let existing = try await NETunnelProviderManager.loadAllFromPreferences()
        var managedProfiles = existing.filter { profile in
            Self.isManagedProfile(profile.localizedDescription)
        }

        // Di trú appex plugin → system extension (một lần cho mỗi máy): profile VPN do bản cũ tạo
        // gắn với appex đã bị gỡ khỏi app, nên NetworkExtension không phân giải được provider nữa
        // (bundle id không đổi, nhưng hệ thống còn cache đường dẫn appex cũ). Dựng lại cấu hình đã
        // lưu cho sạch — chỉ xoá profile VPN của chính app này, không đụng dữ liệu nào khác.
        let migrationKey = "systemExtensionProfileMigrationDone"
        if !UserDefaults.standard.bool(forKey: migrationKey) {
            if !managedProfiles.isEmpty {
                log.info("configuration: di trú appex → system extension — dựng lại \(managedProfiles.count, privacy: .public) profile VPN đã lưu")
            }
            for staleProfile in managedProfiles {
                try? await staleProfile.removeFromPreferences()
            }
            managedProfiles = []
            UserDefaults.standard.set(true, forKey: migrationKey)
        }

        // DÙNG LẠI profile đang có thay vì xoá hết rồi tạo mới mỗi lần connect. Trước đây
        // macOS xoá profile đang hoạt động ngay trước khi tạo profile khác: hệ thống dựng
        // phiên mới trên nền phiên cũ chưa dọn xong, tunnel báo "lên" nhưng utun không còn
        // IP 10.77.x ⇒ "Connect lần hai không có mạng". iOS đã dùng cách dùng lại này và
        // reconnect ổn định, nên macOS theo đúng mẫu đó.
        // Chỉ xoá các profile trùng/legacy, giữ đúng một profile để dùng lại.
        let manager = Self.preferredProfile(in: managedProfiles) ?? NETunnelProviderManager()
        for staleProfile in managedProfiles where staleProfile !== manager {
            log.info("configuration: removing duplicate/legacy VPN profile")
            try? await staleProfile.removeFromPreferences()
        }

        // Cùng chuỗi transport với iOS/Android: WireGuard đi trong TCP tới relay cạnh exit
        // node, không tới được thì extension chuyển sang relay WS của đúng node, cuối cùng mới
        // dùng UDP trực tiếp. nodeId để extension báo health về coordinator.
        let tunnelConfig = config.withRelay().withNodeId(nodeId).withWSRelayURL(wsRelayURL)

        let protocolConfig = NETunnelProviderProtocol()
        protocolConfig.providerBundleIdentifier = Self.providerBundleIdentifier
        protocolConfig.serverAddress = tunnelConfig.peers.first?.endpoint ?? "not-configured"
        var providerConfiguration: [String: Any] = [
            // macOS KHÁC iOS ở chỗ này: KHÔNG bỏ private key khỏi config.
            //
            // Vì sao: trên macOS, profile ký tự động chỉ cấp quyền keychain group dạng wildcard
            // (`TEAMID.*`), mà data-protection keychain lại đòi ĐÚNG group cụ thể
            // (`TEAMID.com.privatevpn.shared`) ⇒ app ghi được khoá nhưng extension (bundle id khác)
            // đọc không thấy, tunnel chết ngay với "Missing WireGuard private key in shared
            // Keychain" (đo trên máy 14/09, mọi cách chia sẻ keychain đều không qua được).
            // Khoá nằm trong `providerConfiguration` của profile VPN — hệ thống lưu, chỉ app và
            // extension của nó đọc được — nên vẫn kín; đổi lại macOS chạy được mà không phụ thuộc
            // keychain chia sẻ. iOS vẫn dùng keychain như cũ (ở đó chia sẻ chạy tốt).
            "wireguard": try JSONEncoder().encode(tunnelConfig),
        ]

        // Transport hysteria2: đây là đường DUY NHẤT extension macOS chạy (WireGuardKit
        // không nằm trong extension macOS vì hai Go runtime không cùng một process — xem
        // project.yml). Thiếu credential thì KHÔNG thêm khoá "hysteria" và phải nói rõ cho
        // người dùng: extension không có nó sẽ báo TUNNEL_START_FAILED, còn im lặng thì
        // khách chỉ thấy "Connected" mà không có mạng.
        if let hysteria = Self.hysteriaConfiguration(node: hysteriaNode, nodes: hysteriaNodes) {
            providerConfiguration["hysteria"] = hysteria
            let relay = hysteria["relayURL"] as? String ?? "?"
            let host = hysteria["serverHost"] as? String ?? "?"
            log.info("configuration: hysteria2 -> \(relay, privacy: .public) (server \(host, privacy: .public))")
        } else {
            let message = "Bản build thiếu credential hysteria2 (HysteriaPassword/HysteriaObfs trong Info.plist) — tunnel macOS không dựng được. Build lại kèm HYST_PASSWORD/HYST_OBFS (xem scripts/dev-hysteria-build-env.sh)."
            lastError = message
            log.error("configuration: \(message, privacy: .public)")
        }
        protocolConfig.providerConfiguration = providerConfiguration

        manager.protocolConfiguration = protocolConfig
        manager.localizedDescription = Self.currentProfileName
        manager.isEnabled = true
        try await manager.saveToPreferences()
        // Nạp lại để chắc chắn manager gắn với bản ghi hệ thống vừa lưu trước khi start.
        try await manager.loadFromPreferences()
        self.manager = manager
    }

    /// Cấu hình cho transport hysteria2 của extension macOS.
    ///
    /// Credential KHÔNG nằm trong repo: build truyền `HYST_PASSWORD`/`HYST_OBFS` vào
    /// Info.plist của app (xem `scripts/dev-hysteria-build-env.sh`), app đọc lại rồi đưa
    /// cho extension qua `providerConfiguration` — giống cách iOS đang làm.
    ///
    /// Trả nil khi thiếu credential hoặc không xác định được host: gọi ở đây phải nói rõ
    /// cho người dùng, KHÔNG được lặng lẽ bỏ qua.
    private static func hysteriaConfiguration(node: ExitNode?, nodes: [ExitNode] = []) -> [String: Any]? {
        guard let password = Bundle.main.object(forInfoDictionaryKey: "HysteriaPassword") as? String,
              !password.isEmpty,
              let obfs = Bundle.main.object(forInfoDictionaryKey: "HysteriaObfs") as? String,
              !obfs.isEmpty else {
            return nil
        }
        let host = node.map { Self.host(fromEndpoint: $0.endpoint) } ?? ""
        guard !host.isEmpty else { return nil }

        // Relay: dùng `hy_relay_url` của ĐÚNG node đang chọn (control plane cấp). Finding F3 của
        // `HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md` vẫn giữ: KHÔNG ghép `serverHost` của node này
        // với relay của node khác.
        //
        // 26/09/2026 — BỔ SUNG ứng viên ĐỔI ĐƯỜNG của **node KHÁC**, lấy từ chính danh sách node app
        // ĐÃ TẢI (`GET /v1/nodes` → `hy_relay_url` từng node). Vì sao cần: ca thật 26/09 — relay
        // `relay-cf-vn2hy` của node đang chọn bị chặn, log extension có 24 lần `relay/vn2hy` và **0
        // lần `relay/vn1hy`**, tunnel `Disconnected` rồi nằm đó. Mỗi cửa đi KÈM `serverHost` của CHÍNH
        // node nó nên không bao giờ ghép lệch node (F3); thứ tự node-khác-trước do
        // `HysteriaDefaults.failoverRelayCandidates` quyết định (hostname khác của cùng node chỉ là
        // cửa thứ hai vì nó trỏ vào CÙNG một dịch vụ relay).
        let relay = node?.hysteriaRelayURL ?? ""
        let failover = HysteriaDefaults.failoverRelayCandidates(
            currentRelay: relay,
            currentHost: host,
            nodes: nodes.map { entry in
                (
                    nodeID: entry.id,
                    relay: entry.hysteriaRelayURL ?? "",
                    host: Self.host(fromEndpoint: entry.endpoint)
                )
            }
        )
        return [
            "serverHost": host,
            "serverPort": Int(HysteriaDefaults.serverPort),
            "relayURL": relay,
            // Cửa dự phòng cùng node: đổi hostname (`api` ↔ `t1`), GIỮ NGUYÊN path ⇒ không đổi node.
            "relayURLCandidates": HysteriaDefaults.sameNodeRelayAlternates(for: relay),
            // Cửa dự phòng ĐỔI NODE (mỗi cửa kèm host của chính node đó).
            "relayNodeCandidates": failover.map {
                ["relayURL": $0.relayURL, "serverHost": $0.serverHost]
            },
            "password": password,
            "obfs": obfs,
            "upKbps": HysteriaDefaults.upKbps,
            "downKbps": HysteriaDefaults.downKbps,
            "mtu": HysteriaDefaults.mtu,
        ]
    }

    /// Host thuần từ endpoint của node ("165.101.114.162:443" → "165.101.114.162").
    private static func host(fromEndpoint endpoint: String) -> String {
        if endpoint.hasPrefix("[") { // IPv6 dạng [::1]:443
            return endpoint.split(separator: "]").first.map { String($0.dropFirst()) } ?? ""
        }
        return endpoint.split(separator: ":").first.map(String.init) ?? ""
    }

    /// Dựng lại và LƯU profile VPN (kèm `providerConfiguration["hysteria"]`) mà KHÔNG cần
    /// người dùng bấm Connect.
    ///
    /// Vì sao cần: profile NetworkExtension nằm trong preferences của hệ thống và trước đây
    /// chỉ được ghi khi bấm Connect. Đo/chẩn đoán từ terminal — `scutil --nc start "VPNFlow"`
    /// — cần profile đã có sẵn cấu hình hysteria, nếu không extension báo
    /// TUNNEL_START_FAILED dù mọi thứ khác đúng. Hàm này chạy lúc app khởi động
    /// (`VPNManagerMac.init`), nên chỉ cần mở app một lần.
    func refreshSavedConfiguration() async {
        // Chưa kích hoạt được system extension thì profile VPN có lưu cũng không dựng nổi tunnel —
        // dừng ở đây và nói rõ cho khách (thay vì để Connect chết ở tầng NetworkExtension).
        do {
            try await activatePacketTunnelSystemExtension()
        } catch {
            lastError = error.localizedDescription
            log.error("system extension: chưa kích hoạt được, không lưu profile VPN: \(error.localizedDescription, privacy: .public)")
            return
        }
        if manager == nil {
            await loadManagerFromPreferences()
        }
        if exitNodes.isEmpty {
            await refreshNodes()
        }
        guard let node = selectedNode ?? exitNodes.first ?? ExitNode.builtInFallback.first else {
            log.error("configuration: không có node nào để lưu cấu hình")
            return
        }

        // Khoá WireGuard chỉ để profile còn đủ trường cho `savedTunnelConfig()` (đường
        // offline); transport thật của macOS bây giờ là hysteria2.
        let key = WireGuardKeychain.loadOrCreatePrivateKey()
        let overlay = overlayIP ?? TunnelConfigCache.load()?.overlayIP ?? "10.77.0.2"
        let config = Self.buildConfig(
            privateKeyBase64: key.privateKey,
            overlayIP: overlay,
            exitEndpoint: node.endpoint,
            exitPublicKey: node.public_key
        )
        do {
            try await prepareConfiguration(
                config,
                nodeId: node.id,
                wsRelayURL: node.relayURL,
                hysteriaNode: node,
                hysteriaNodes: exitNodes
            )
            log.info("configuration: đã lưu profile \(Self.currentProfileName, privacy: .public) kèm hysteria2 (node \(node.id, privacy: .public))")
        } catch {
            log.error("configuration: lưu profile thất bại: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func loadManagerFromPreferences() async {
        do {
            let existing = try await NETunnelProviderManager.loadAllFromPreferences()
            manager = Self.preferredProfile(in: existing)
            refreshStatus()
        } catch {
            lastError = error.localizedDescription
            log.error("configuration: failed to load VPN profile: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Decodes the WireGuard config stored in the currently saved "VPNFlow"
    /// NEVPN profile. Used as a fallback when the coordinator is unreachable —
    /// the profile persists across sessions even before TunnelConfigCache
    /// existed, so this works on the very first offline reconnect.
    private func savedTunnelConfig() -> WireGuardConfig? {
        guard let protocolConfig = manager?.protocolConfiguration as? NETunnelProviderProtocol,
              let data = protocolConfig.providerConfiguration?["wireguard"] as? Data,
              let config = try? JSONDecoder().decode(WireGuardConfig.self, from: data),
              !config.addresses.isEmpty,
              let peer = config.peers.first,
              !(peer.endpoint ?? "").isEmpty,
              !peer.publicKeyBase64.isEmpty else {
            return nil
        }
        return config
    }

    /// Extracts the bare overlay IP from a saved config's address string
    /// ("10.77.0.9/24" → "10.77.0.9"). buildConfig appends "/24" itself, so a
    /// CIDR-suffixed address would produce an invalid "…/24/24".
    private static func overlayIP(fromSaved config: WireGuardConfig) -> String {
        guard let address = config.addresses.first else { return "" }
        return address.split(separator: "/").first.map(String.init) ?? ""
    }

    /// The exit node to dial, always honoring the user's picker selection:
    /// selected node from the (cached/built-in) list wins; `fallback` is used
    /// only when the picker has no list (e.g. first launch on a blocked net).
    private func preferredExitNode(fallback: ExitNode) -> ExitNode {
        if let selected = selectedNodeID,
           let node = exitNodes.first(where: { $0.id == selected }) {
            return node
        }
        if let node = exitNodes.first {
            return node
        }
        return fallback
    }

    private func savedExitNode(from config: WireGuardConfig) -> ExitNode {
        ExitNode(
            id: "saved",
            name: "Saved",
            country: "VN",
            city: "Hanoi",
            endpoint: config.peers.first?.endpoint ?? "",
            public_key: config.peers.first?.publicKeyBase64 ?? ""
        )
    }

    private func startStatusPolling() {
        guard statusPollTask == nil else { return }
        statusPollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                await MainActor.run {
                    self?.refreshStatus()
                }
            }
        }
    }

    enum MacError: LocalizedError {
        case invalidURL(String)
        case noExitNode
        case savedConfigurationMissing
        case cachedTunnelUnavailable

        var errorDescription: String? {
            switch self {
            case .invalidURL(let url):
                return "Invalid coordinator URL: \(url)"
            case .noExitNode:
                return "No exit node available from the coordinator."
            case .savedConfigurationMissing:
                return "The VPN configuration was saved but could not be reloaded."
            case .cachedTunnelUnavailable:
                return "Could not reach the coordinator and no saved tunnel is available yet. Connect once on a working network, then this network will work offline."
            }
        }
    }
}

/// Lỗi kích hoạt system extension, dịch sang câu tiếng Việt mà khách hiểu và làm được ngay.
private enum SystemExtensionActivationError: LocalizedError {
    case needsUserApproval
    case willCompleteAfterReboot
    case canceled
    case missingEntitlement
    case notFound(String)
    case parentBundleLocation(String)
    case codeSignature(String)
    case validationFailed(String)
    case forbiddenBySystemPolicy(String)
    case superseded
    case timedOut
    case other(String)

    var errorDescription: String? {
        switch self {
        case .needsUserApproval:
            return "VPNFlow cần bạn cho phép tiện ích mở rộng hệ thống: mở System Settings → Privacy & Security → bật VPNFlow (mục System Extensions/Network), rồi bấm Connect lại."
        case .willCompleteAfterReboot:
            return "Đã cài tiện ích mở rộng hệ thống của VPNFlow. Hãy KHỞI ĐỘNG LẠI MÁY rồi bấm Connect."
        case .canceled:
            return "Bạn đã huỷ cài tiện ích mở rộng hệ thống của VPNFlow. Bấm Connect để thử lại."
        case .missingEntitlement:
            return "Bản cài này thiếu quyền cài system extension (profile ký chưa cấp `com.apple.developer.system-extension.install`). Cần bản phát hành mới."
        case .notFound(let id):
            return "Không thấy tiện ích mở rộng hệ thống “\(id)” trong ứng dụng. Bản cài có thể thiếu tệp .systemextension — hãy tải lại bản mới."
        case .parentBundleLocation(let path):
            return "macOS chỉ cho cài tiện ích mở rộng khi VPNFlow nằm trong thư mục Applications (hiện tại: \(path)). Hãy kéo VPNFlow vào Applications rồi mở lại."
        case .codeSignature(let reason):
            return "Chữ ký của tiện ích mở rộng hệ thống không hợp lệ, macOS từ chối cài (\(reason)). Hãy tải lại bản phát hành chính thức."
        case .validationFailed(let reason):
            return "macOS không xác thực được tiện ích mở rộng hệ thống (\(reason)). Hãy tải lại bản phát hành chính thức."
        case .forbiddenBySystemPolicy(let reason):
            return "Chính sách hệ thống của máy chặn tiện ích mở rộng VPNFlow (\(reason)). Kiểm tra cấu hình MDM/System Settings."
        case .superseded:
            return "Yêu cầu cài tiện ích mở rộng hệ thống bị thay thế bởi một yêu cầu mới hơn. Bấm Connect để thử lại."
        case .timedOut:
            return "macOS không phản hồi yêu cầu cài tiện ích mở rộng hệ thống. Mở System Settings → Privacy & Security để kiểm tra VPNFlow, rồi bấm Connect lại."
        case .other(let reason):
            return "Không cài được tiện ích mở rộng hệ thống của VPNFlow (\(reason))."
        }
    }
}

/// Cầu `OSSystemExtensionRequest` → async/await. Mọi callback được giao trên cùng một hàng đợi
/// (`.main`), nên chỉ cần một cờ `finished` để bảo đảm continuation chỉ được resume đúng một lần.
private final class PacketTunnelSystemExtensionDelegate: NSObject, OSSystemExtensionRequestDelegate, @unchecked Sendable {
    private let extensionIdentifier: String
    private let appBundlePath: String
    private let completion: (Result<Void, Error>) -> Void
    private var finished = false

    init(extensionIdentifier: String, appBundlePath: String, completion: @escaping (Result<Void, Error>) -> Void) {
        self.extensionIdentifier = extensionIdentifier
        self.appBundlePath = appBundlePath
        self.completion = completion
    }

    private func finish(_ result: Result<Void, Error>) {
        guard !finished else { return }
        finished = true
        completion(result)
    }

    /// Hệ thống không gọi lại callback nào (người dùng để hộp thoại treo) ⇒ tự bỏ cuộc để UI không kẹt
    /// ở "Connecting…". Cố ý chạy trên main actor: callback của request cũng ở main nên cờ `finished`
    /// không bị tranh chấp.
    @MainActor
    func timeOut() {
        finish(.failure(SystemExtensionActivationError.timedOut))
    }

    private func translate(_ error: Error) -> Error {
        let ns = error as NSError
        guard ns.domain == OSSystemExtensionErrorDomain,
              let code = OSSystemExtensionError.Code(rawValue: ns.code) else {
            return SystemExtensionActivationError.other(ns.localizedDescription)
        }
        switch code {
        case .missingEntitlement:
            return SystemExtensionActivationError.missingEntitlement
        case .extensionNotFound:
            return SystemExtensionActivationError.notFound(extensionIdentifier)
        case .unsupportedParentBundleLocation:
            return SystemExtensionActivationError.parentBundleLocation(appBundlePath)
        case .codeSignatureInvalid:
            return SystemExtensionActivationError.codeSignature(ns.localizedDescription)
        case .validationFailed:
            return SystemExtensionActivationError.validationFailed(ns.localizedDescription)
        case .forbiddenBySystemPolicy:
            return SystemExtensionActivationError.forbiddenBySystemPolicy(ns.localizedDescription)
        case .requestCanceled:
            return SystemExtensionActivationError.canceled
        case .requestSuperseded:
            return SystemExtensionActivationError.superseded
        default:
            return SystemExtensionActivationError.other(ns.localizedDescription)
        }
    }

    /// Bản trong app LUÔN thay bản đang cài: khách vừa cập nhật app thì extension phải chạy đúng
    /// code của bản đó (bản cũ hơn giữ lại sẽ tái hiện đúng lỗi "chạy code cũ" đã gặp).
    func request(
        _ request: OSSystemExtensionRequest,
        actionForReplacingExtension existing: OSSystemExtensionProperties,
        withExtension ext: OSSystemExtensionProperties
    ) -> OSSystemExtensionRequest.ReplacementAction {
        .replace
    }

    /// Người dùng phải tự bật extension trong System Settings. Đây KHÔNG phải lỗi hệ thống —
    /// báo ngay cho khách biết phải làm gì (lần Connect sau, khi đã bật, sẽ chạy tiếp).
    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
        finish(.failure(SystemExtensionActivationError.needsUserApproval))
    }

    func request(_ request: OSSystemExtensionRequest, didFinishWithResult result: OSSystemExtensionRequest.Result) {
        switch result {
        case .completed:
            finish(.success(()))
        case .willCompleteAfterReboot:
            finish(.failure(SystemExtensionActivationError.willCompleteAfterReboot))
        @unknown default:
            finish(.success(()))
        }
    }

    func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) {
        finish(.failure(translate(error)))
    }
}
