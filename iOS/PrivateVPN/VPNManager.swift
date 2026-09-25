import CoreLocation
import Foundation
import NetworkExtension
import os
import UIKit
import WireGuardKit

@MainActor
final class VPNManager: ObservableObject {
    static let providerBundleIdentifier = "com.privatevpn.app.packet-tunnel"

    /// Tên profile VPN hiển thị trong Settings > VPN. Đổi từ "FlowVPN" sang "VPNFlow"
    /// cho khớp Android (`strings.xml`: `app_name = VPNFlow`) và khớp `CFBundleDisplayName`
    /// trong `project.yml`. (Tài liệu nộp App Store không còn dùng — chủ dự án bỏ App Store
    /// 14/09/2026.)
    private static let profileName = "VPNFlow"

    /// Tên CŨ của profile. Máy đã cài bản trước còn profile mang tên này.
    ///
    /// Vì sao phải nhận ra cả tên cũ thay vì chỉ đổi chuỗi: `localizedDescription` là
    /// KHOÁ để tìm lại profile của chính app. Đổi tên mà không nhận tên cũ thì
    /// `loadAllFromPreferences()` không khớp profile đang có, kết quả là tạo thêm
    /// profile mới và **bỏ rơi profile cũ** — người dùng thấy 2 profile VPN trong
    /// Settings, và mất luôn đường dự phòng offline đọc từ chính profile đó
    /// (`savedTunnelConfig`). Nhận cả hai tên thì lần connect kế tiếp sẽ đổi tên
    /// profile cũ sang tên mới, tự lành.
    private static let legacyProfileNames: Set<String> = ["FlowVPN"]

    /// Có phải profile VPN của app này không (kể cả tên cũ trước khi đổi tên).
    private static func isOwnProfile(_ description: String?) -> Bool {
        guard let description else { return false }
        return description == profileName || legacyProfileNames.contains(description)
    }

    private let log = Logger(subsystem: "com.privatevpn.app", category: "vpn-manager")

    @Published private(set) var state: VPNState = .disconnected
    @Published private(set) var lastError: String?
    @Published private(set) var statusMessage: String?
    /// A10 §2g — số live của thẻ Diagnostics, cập nhật mỗi 1s từ extension khi tunnel chạy
    /// (nhịp lấy mẫu sẵn có, không thêm phép đo). `nil` khi chưa kết nối ⇒ UI hiện `—`.
    @Published private(set) var liveDiagnostics: TunnelStatusReport?
    @Published private(set) var devicePublicKey: String?
    /// Set when the coordinator rejects the connection because the account is at
    /// its device cap — the UI lists these devices so the user can log one out.
    @Published private(set) var deviceLimitMessage: String?
    @Published private(set) var deviceLimitDevices: [CoordinatorDevice] = []

    private var manager: NETunnelProviderManager?
    nonisolated(unsafe) private var statusObserver: NSObjectProtocol?

    /// Poll trạng thái extension sau khi Connect (giống `VPNManagerMac`).
    ///
    /// Vì sao bắt buộc phải có trên iOS: `NEVPNStatus` chỉ nói "Connected" — nó KHÔNG nói
    /// tunnel có chở gói hay không. Không có bước này thì ca "Connected mà không có mạng" là
    /// vô hình với khách, và tệ hơn: lần Connect sau app REPLAY đúng cấu hình cũ từ cache
    /// (`cached.tunnelConfig.v1` / `cached.exitNodes.v1`) ⇒ kẹt mãi, bấm Connect lại vẫn không
    /// có mạng. Đây đúng bug đã gặp trên macOS 15/09 (xem `StaleStateMigration`).
    private var providerProbeTask: Task<Void, Never>?
    /// Đã xử lý chẩn đoán cho lần Connect này (tránh lặp lại thông báo/hạ tunnel nhiều lần).
    private var diagnosticHandled = false

    /// Static ref cho AppDelegate (applicationWillTerminate -> disconnect).
    nonisolated(unsafe) static weak var sharedForTerminate: VPNManager?

    init() {
        VPNManager.sharedForTerminate = self
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.refreshStatus()
            }
        }
        refreshStatus()
        refreshDevicePublicKey()
        Task {
            await loadManagerFromPreferences()
        }
    }

    deinit {
        providerProbeTask?.cancel()
        if let statusObserver {
            NotificationCenter.default.removeObserver(statusObserver)
        }
    }

    func refreshStatus() {
        // Extension đã báo "Connected nhưng không có mạng": giữ nguyên trạng thái Failed kèm
        // thông báo, đừng để NEVPNStatus kéo về "Disconnected" và xoá mất lý do (giống macOS).
        if diagnosticHandled {
            state = .failed
            return
        }
        guard let connection = manager?.connection else {
            state = .disconnected
            statusMessage = nil
            liveDiagnostics = nil
            return
        }
        state = VPNState(networkStatus: connection.status)
        switch connection.status {
        case .connected, .disconnected:
            statusMessage = nil
            if connection.status == .disconnected { liveDiagnostics = nil }
        case .invalid:
            statusMessage = "VPN profile is not ready. Reinstall the VPN profile and try again."
        default:
            break
        }
    }

    /// 25/09/2026 — iOS CHỈ trả SSID/BSSID khi APP có quyền vị trí
    /// (`NEHotspotNetwork.fetchCurrent`; entitlement `…networking.wifi-info` đã khai trong
    /// `project.yml`). Nhờ nó mà khoá bộ nhớ băng thông là **theo từng WiFi**
    /// (`wifi|ssid:<SSID>`) thay vì chung một bucket `wifi|if:en0` — tránh khai số của mạng này
    /// sang mạng khác (ca "SSID mới", "WiFi khác băng thông").
    ///
    /// Xin MỘT lần, ngay trước khi kết nối để prompt có ngữ cảnh. Khách từ chối ⇒ mọi thứ vẫn
    /// chạy bình thường, chỉ là khoá lùi về `wifi|router:<MAC>` rồi `wifi|if:en0`.
    private let wifiInfoLocationManager = CLLocationManager()

    private func requestWiFiInfoPermissionIfNeeded() {
        guard CLLocationManager.locationServicesEnabled() else { return }
        guard wifiInfoLocationManager.authorizationStatus == .notDetermined else { return }
        wifiInfoLocationManager.requestWhenInUseAuthorization()
    }

    func connect(store: VPNConfigStore, authStore: AuthSessionStore) async {
        // Quyền vị trí ⇒ đọc được SSID ⇒ bộ nhớ băng thông tách theo từng mạng (xem chú thích trên).
        requestWiFiInfoPermissionIfNeeded()
        // Báo "đang kết nối" NGAY, TRƯỚC mọi lời gọi mạng — giống Android
        // (VPNManager.kt: `_state.value = VPNState.CONNECTING` rồi mới `claimDevice`).
        //
        // Vì sao phải đặt sớm: cấp config qua control plane là lời gọi mạng, và trên
        // mạng bị chặn nó còn lâu hơn nữa vì phải thử host dự phòng. Trước đây state
        // chỉ được đặt SAU bước đó, nên suốt thời gian ấy nút Connect vẫn ở màu đỏ
        // của "disconnected" và không có vòng xoay cam — người dùng bấm rồi tưởng app
        // không phản ứng gì. Đặt sớm cũng làm banner "đang chuẩn bị quyền VPN" hiện ra
        // đúng lúc, vì nó cũng dựa trên `state.isTransitioning`.
        //
        // Mọi nhánh lỗi bên dưới đều đặt lại .failed/.disconnected nên không bị kẹt
        // ở trạng thái đang kết nối.
        guard !state.isTransitioning else { return }
        state = .connecting
        // TRƯỚC khi cấp cấu hình mới và ghi preferences: dọn phiên CŨ cho sạch.
        // Thiếu bước này, Connect lại trong cùng vòng đời app là "lên mà không có mạng" và
        // chỉ force-quit app mới hết (đo trên iPad 19/09) — xem `prepareForFreshSession`.
        await prepareForFreshSession()
        do {
            let config: WireGuardConfig
            if let baseURL = store.controlPlaneBaseURL {
                config = try await provisionViaControlPlane(store: store, authStore: authStore, baseURL: baseURL)
            } else {
                config = try makeConfig(store: store)
            }
            try await prepareConfiguration(
                config,
                nodeId: store.selectedNodeID,
                // Relay WS của ĐÚNG node đang chọn, do control plane cấp theo từng node.
                // Dùng chung một URL cho mọi node là gốc của lỗi "connected nhưng không
                // có mạng": relay :10000 chỉ hạ cánh ở node-1, nên chọn node-2 thì
                // handshake mã hoá tới khoá node-2 mà lại tới wg0 của node-1 => im lặng.
                wsRelayURL: store.availableNodes
                    .first { $0.id == store.selectedNodeID }?
                    .relayURL,
                // Node cho transport hysteria2: relay WS (`hy_relay_url`) chỉ hạ cánh ở cổng
                // UDP của ĐÚNG node đó, nên phải truyền node đang chọn chứ không dùng một URL
                // chung cho mọi node (xem `hysteriaConfiguration`).
                hysteriaNode: store.availableNodes.first { $0.id == store.selectedNodeID }
                    ?? store.availableNodes.first,
            )
            // State đã là .connecting từ đầu hàm; giữ nguyên tới khi tunnel lên.
            try manager?.connection.startVPNTunnel()
            lastError = nil
            statusMessage = nil
            deviceLimitMessage = nil
            deviceLimitDevices = []
            diagnosticHandled = false
            startProviderDiagnosticsPolling()
        } catch let error as ControlAPIClient.ClientError {
            if case .deviceLimit(let message, let devices) = error {
                // Not a failure to hide behind "Coordinator rejected": show the
                // real reason plus the devices that can be logged out.
                deviceLimitMessage = message
                deviceLimitDevices = devices
                state = .disconnected
                lastError = message
                statusMessage = message
                log.error("device limit reached: \(devices.count) active devices")
                return
            }
            state = .failed
            lastError = error.localizedDescription
            statusMessage = Self.userMessage(for: error)
        } catch {
            state = .failed
            lastError = error.localizedDescription
            statusMessage = Self.userMessage(for: error)
            let ns = error as NSError
            log.error("connect failed: \(error.localizedDescription, privacy: .public) [domain=\(ns.domain, privacy: .public) code=\(ns.code)]")
            NSLog("iOSVPN: connect failed: \(error.localizedDescription) [\(ns.domain) \(ns.code)]")
        }
    }

    func disconnect() {
        AppDiagnostics.shared.log("Disconnect: app gọi stopVPNTunnel() (người dùng bấm)")
        stopProviderDiagnosticsPolling()
        manager?.connection.stopVPNTunnel()
        liveDiagnostics = nil
        refreshStatus()
    }

    // MARK: - Dọn phiên cũ trước mỗi lần Connect

    /// Bảo đảm phiên VPN CŨ đã dừng hẳn và nạp lại profile từ preferences trước khi Connect.
    ///
    /// Vì sao BẮT BUỘC (bằng chứng: chủ dự án phải force-quit app rồi mở lại mới có mạng):
    /// `prepareConfiguration` ghi `protocolConfiguration` MỚI rồi `saveToPreferences()`.
    /// Nếu lúc đó phiên cũ còn `connected`/`connecting`/`disconnecting` (hoặc app vừa đặt
    /// `.failed` trong khi session của NetworkExtension vẫn còn), iOS giữ nguyên session cũ,
    /// và `startVPNTunnel()` sau đó không mở một phiên mới đúng nghĩa: tunnel "lên" nhưng
    /// không có traffic, bấm Connect bao nhiêu lần cũng vậy. Khởi động lại app thì mọi object
    /// `NETunnelProviderManager`/`NEVPNConnection` của tiến trình cũ mất đi ⇒ lại chạy được.
    /// Vì vậy: dừng, CHỜ tới `.disconnected`, rồi mới nạp lại manager — đúng một phiên sạch.
    private func prepareForFreshSession() async {
        if let connection = manager?.connection, connection.status != .disconnected,
           connection.status != .invalid {
            log.info("connect: phiên cũ còn \(connection.status.rawValue) — dừng trước khi Connect lại")
            AppDiagnostics.shared.log("Connect: dừng phiên CŨ (status=\(connection.status.rawValue)) trước khi nối lại")
            connection.stopVPNTunnel()
            let deadline = Date().addingTimeInterval(Self.sessionStopTimeout)
            while Date() < deadline {
                let status = connection.status
                if status == .disconnected || status == .invalid { break }
                try? await Task.sleep(for: .milliseconds(200))
            }
            let status = connection.status
            if status != .disconnected && status != .invalid {
                // Không chặn vô hạn: vẫn đi tiếp, nhưng ghi rõ để lần sau đọc được nguyên nhân.
                log.error("connect: phiên cũ chưa dừng sau \(Int(Self.sessionStopTimeout))s (status=\(status.rawValue))")
                NSLog("iOSVPN: previous session still \(status.rawValue) after stop timeout")
            }
        }
        // Nạp lại từ preferences: object manager cũ còn gắn với session vừa dừng, ghi
        // preferences trên nó là nguồn của ca "Connect lại không có mạng".
        await loadManagerFromPreferences()
    }

    /// Bao lâu chờ phiên cũ dừng hẳn trước khi Connect lại.
    private static let sessionStopTimeout: TimeInterval = 6

    // MARK: - Chẩn đoán từ extension ("Connected nhưng không có mạng")

    /// Hỏi extension trạng thái phiên mỗi 2s trong lúc tunnel đang lên/chạy.
    ///
    /// Extension không có UI và NetworkExtension không đưa lỗi provider cho app, nên đây là
    /// kênh DUY NHẤT để biết tunnel "lên" mà không chở gói. Việc quan trọng nhất khi phát
    /// hiện ca đó: **xoá cache cấu hình** (`TunnelConfigCache`/`ExitNodeCache`) trước khi
    /// khách bấm Connect lại — nếu không, app replay lại đúng cấu hình cũ và tình trạng
    /// "Connect lại cũng không có mạng" lặp vô hạn (bug y hệt đã gặp trên macOS 15/09).
    private func startProviderDiagnosticsPolling() {
        guard providerProbeTask == nil else { return }
        providerProbeTask = Task { [weak self] in
            while !Task.isCancelled {
                // A10 §2g: nhịp 1s ĐÚNG bằng nhịp lấy mẫu byte sẵn có của extension — không
                // thêm phép đo, không thêm pin; chỉ đọc lại ảnh chụp mà extension đã có.
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled, let self else { return }
                await self.probeProviderDiagnostics()
            }
        }
    }

    private func stopProviderDiagnosticsPolling() {
        providerProbeTask?.cancel()
        providerProbeTask = nil
    }

    private func probeProviderDiagnostics() async {
        guard !diagnosticHandled,
              let session = manager?.connection as? NETunnelProviderSession else { return }
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
        guard !Task.isCancelled, let report else { return }
        // A10 §2g — cập nhật số live cho thẻ Diagnostics ở MỌI nhịp (kể cả phiên bình thường).
        // Không che trạng thái thật: cầu WS chập thì extension trả số thấp/`—` đúng lúc.
        liveDiagnostics = report
        guard let code = report.code else { return }
        guard code == TunnelDiagnosticCode.noTraffic || code == TunnelDiagnosticCode.startFailed else {
            return
        }
        diagnosticHandled = true
        stopProviderDiagnosticsPolling()
        log.error("provider diagnostics: code=\(code, privacy: .public) session=\(report.session) rx=\(report.rxBytes) tx=\(report.txBytes) transport=\(report.transport, privacy: .public)")
        NSLog("iOSVPN: provider diagnostics code=\(code) session=\(report.session) rx=\(report.rxBytes) tx=\(report.txBytes)")
        lastError = report.message ?? "Tunnel không có dữ liệu (mã \(code)). Vui lòng thử lại."
        statusMessage = lastError
        // Cấu hình của phiên vừa chết KHÔNG được tái sử dụng: xoá cache tunnel/node để lần
        // Connect sau lấy cấu hình MỚI (overlay IP + peer + relay URL đúng node) từ control
        // plane. Không xoá thì đây chính là vòng lặp "Connect lại cũng không có mạng".
        TunnelConfigCache.clear()
        ExitNodeCache.clear()
        log.error("provider diagnostics: đã xoá cache cấu hình tunnel/node (cached.tunnelConfig.v1, cached.exitNodes.v1)")
        // Tunnel đã chết mà hệ thống vẫn báo Connected: hạ xuống để khách không bị treo ở
        // trạng thái giả (route 0.0.0.0/0 qua utun mà không có mạng).
        manager?.connection.stopVPNTunnel()
        state = .failed
    }

    // MARK: - Device / keypair

    /// Loads (or creates) the device WireGuard keypair and exposes the public key.
    func refreshDevicePublicKey() {
        do {
            if let publicKey = try KeychainStore.loadPublicKey() {
                devicePublicKey = publicKey.base64Key
            } else {
                let privateKey = try KeychainStore.obtainOrCreatePrivateKey()
                devicePublicKey = privateKey.publicKey.base64Key
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Coordinator provisioning

    /// Fetches the available exit nodes from the coordinator (for the picker).
    /// On failure (e.g. control plane unreachable on a censored network) falls
    /// back to the last cached list, then to built-in fallback nodes.
    func fetchNodes(store: VPNConfigStore) async {
        guard let baseURL = store.controlPlaneBaseURL else { return }
        let client = ControlAPIClient(baseURL: baseURL, joinToken: store.controlPlaneToken)
        var nodes: [ExitNode] = []
        var usedFallback = false
        do {
            nodes = try await client.fetchNodes()
            if !nodes.isEmpty {
                ExitNodeCache.save(nodes)
            }
        } catch {
            // Non-fatal: fall back to cache / local presets / manual config.
        }
        if nodes.isEmpty {
            nodes = ExitNodeCache.load() ?? ExitNode.builtInFallback
            usedFallback = true
        }
        store.usingFallbackNodes = usedFallback
        store.remoteNodes = nodes
        if store.selectedNodeID == nil, let first = nodes.first {
            store.selectedNodeID = first.id
            store.serverEndpoint = first.endpoint
            store.serverPublicKey = first.public_key
        }
    }

    /// Registers this device with the PrivateVPN coordinator to obtain its
    /// overlay IP, then builds a WireGuard config that connects to the VPS
    /// exit node (103.173.155.50) for Internet egress. On coordinator failure
    /// (e.g. hotel captive portal / censored network) falls back to the last
    /// successful tunnel config — the WireGuard peer still exists on wg0.
    private func provisionViaControlPlane(store: VPNConfigStore, authStore: AuthSessionStore, baseURL: URL) async throws -> WireGuardConfig {
        let privateKey = try KeychainStore.obtainOrCreatePrivateKey()
        devicePublicKey = privateKey.publicKey.base64Key

        do {
            return try await provisionFresh(store: store, authStore: authStore, baseURL: baseURL, privateKey: privateKey)
        } catch ControlAPIClient.ClientError.transport {
            if let cached = TunnelConfigCache.load() {
                store.usingFallbackNodes = true
                // Prefer the currently selected node (freshest endpoint from
                // cached/built-in list) — a stale cached node could point at a
                // blocked endpoint (e.g. node-1 unreachable while node-2 works).
                let node = store.availableNodes.first { $0.id == store.selectedNodeID }
                    ?? store.availableNodes.first
                    ?? cached.node
                NSLog("iOSVPN: coordinator unreachable — using cached tunnel config (overlay=\(cached.overlayIP), node=\(node.id))")
                return cachedTunnelConfig(privateKey: privateKey, overlayIP: cached.overlayIP, node: node)
            }
            // Profile may not be loaded yet (init loads it async).
            if manager == nil { await loadManagerFromPreferences() }
            if let saved = savedTunnelConfig(), let peer = saved.peers.first {
                store.usingFallbackNodes = true
                // Saved address is "10.77.0.9/24" — cachedTunnelConfig appends
                // "/24" itself, so strip the CIDR suffix first.
                let overlayIP = (saved.addresses.first ?? "").split(separator: "/").first.map(String.init) ?? ""
                let node = ExitNode(
                    id: "saved",
                    name: "Saved",
                    country: "VN",
                    city: "Hanoi",
                    endpoint: peer.endpoint ?? "",
                    public_key: peer.publicKeyBase64
                )
                NSLog("iOSVPN: coordinator unreachable — replaying saved VPN profile (overlay=\(overlayIP))")
                return cachedTunnelConfig(privateKey: privateKey, overlayIP: overlayIP, node: node)
            }
            throw ConfigError.cachedTunnelUnavailable
        }
    }

    private func cachedTunnelConfig(privateKey: PrivateKey, overlayIP: String, node: ExitNode) -> WireGuardConfig {
        WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: privateKey.base64Key,
            addresses: ["\(overlayIP)/24"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: node.public_key,
                    endpoint: node.endpoint,
                    allowedIPs: ["0.0.0.0/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )
    }

    private func provisionFresh(store: VPNConfigStore, authStore: AuthSessionStore, baseURL: URL, privateKey: PrivateKey) async throws -> WireGuardConfig {
        let deviceName = try registrationName()
        let bootstrap = ControlAPIClient(baseURL: baseURL, joinToken: "")
        guard let accessToken = authStore.accessToken else {
            throw ControlAPIClient.ClientError.missingSession
        }
        let joinToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
        store.controlPlaneToken = ""

        var activeKey = privateKey
        var response: CoordinatorRegisterResponse
        do {
            response = try await registerDevice(
                baseURL: baseURL,
                joinToken: joinToken,
                name: deviceName,
                publicKey: activeKey.publicKey.base64Key,
                accessToken: accessToken,
                exitNodeId: store.selectedNodeID
            )
        } catch ControlAPIClient.ClientError.deviceLimit(let message, let devices) {
            // Hết hạn mức thiết bị: nếu bản ghi CŨ của chính máy này còn đó (xoay khoá làm server
            // coi là thiết bị mới) thì nhường slot rồi đăng ký lại (previousInstallCandidate).
            // Không đoán được (0 hoặc >1 ứng viên) thì ném lỗi để UI hiện danh sách thiết bị.
            guard let candidate = previousInstallCandidate(
                devices: devices,
                platform: "ios",
                publicKey: activeKey.publicKey.base64Key
            ) else {
                throw ControlAPIClient.ClientError.deviceLimit(message: message, devices: devices)
            }
            let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
            response = try await registerDevice(
                baseURL: baseURL,
                joinToken: retryToken,
                name: deviceName,
                publicKey: activeKey.publicKey.base64Key,
                accessToken: accessToken,
                exitNodeId: store.selectedNodeID,
                replaceDeviceId: candidate.device_id
            )
        } catch ControlAPIClient.ClientError.server(let message) {
            if message.localizedCaseInsensitiveContains("revoked") {
                // Device was revoked server-side; old key can never register.
                // Rotate to a fresh keypair -> register as a NEW device.
                activeKey = try KeychainStore.rotatePrivateKey()
                devicePublicKey = activeKey.publicKey.base64Key
                let freshToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
                response = try await registerDevice(
                    baseURL: baseURL,
                    joinToken: freshToken,
                    name: Self.randomRegistrationName(),
                    publicKey: activeKey.publicKey.base64Key,
                    accessToken: accessToken,
                    exitNodeId: store.selectedNodeID
                )
            } else if message.localizedCaseInsensitiveContains("name") {
                let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
                response = try await registerDevice(
                    baseURL: baseURL,
                    joinToken: retryToken,
                    name: Self.randomRegistrationName(),
                    publicKey: activeKey.publicKey.base64Key,
                    accessToken: accessToken,
                    exitNodeId: store.selectedNodeID
                )
            } else {
                let retryToken = try await bootstrap.fetchEnrollmentToken(accessToken: accessToken)
                response = try await registerDevice(
                    baseURL: baseURL,
                    joinToken: retryToken,
                    name: deviceName,
                    publicKey: activeKey.publicKey.base64Key,
                    accessToken: accessToken,
                    exitNodeId: store.selectedNodeID
                )
            }
        }

        let exitNode = try await selectedExitNode(store: store, client: bootstrap)
        store.usingFallbackNodes = false
        TunnelConfigCache.save(overlayIP: response.overlay_ip, node: exitNode)

        return WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: activeKey.base64Key,
            addresses: ["\(response.overlay_ip)/24"],
            dnsServers: ["1.1.1.1"],
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: exitNode.public_key,
                    endpoint: exitNode.endpoint,
                    allowedIPs: ["0.0.0.0/0"],
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )
    }

    private func selectedExitNode(store: VPNConfigStore, client: ControlAPIClient) async throws -> ExitNode {
        // Prefer a fresh fetch, but fall back to whatever is already loaded
        // (cached/built-in) so connect still works when the coordinator is
        // temporarily unreachable on the current network.
        if let nodes = try? await client.fetchNodes(), !nodes.isEmpty {
            store.remoteNodes = nodes
            ExitNodeCache.save(nodes)
            let selected = nodes.first { $0.id == store.selectedNodeID } ?? nodes.first!
            store.selectedNodeID = selected.id
            store.serverEndpoint = selected.endpoint
            store.serverPublicKey = selected.public_key
            return selected
        }
        if let node = store.remoteNodes.first(where: { $0.id == store.selectedNodeID }) ?? store.remoteNodes.first {
            store.serverEndpoint = node.endpoint
            store.serverPublicKey = node.public_key
            return node
        }
        throw ConfigError.noBackendNode
    }

    private func registrationName() throws -> String {
        "ios-\(try DeviceIdentity.deviceID().uuidString.prefix(8).lowercased())"
    }

    private static func randomRegistrationName() -> String {
        "ios-\(UUID().uuidString.prefix(8).lowercased())"
    }

    private func registerDevice(baseURL: URL, joinToken: String, name: String, publicKey: String, accessToken: String, exitNodeId: String?, replaceDeviceId: String? = nil) async throws -> CoordinatorRegisterResponse {
        let client = ControlAPIClient(baseURL: baseURL, joinToken: joinToken)
        return try await client.register(
            name: name,
            platform: "ios",
            wireguardPublicKey: publicKey,
            endpoint: "0.0.0.0:51820",  // outbound-only client; placeholder
            accessToken: accessToken,
            exitNodeId: exitNodeId,
            replaceDeviceId: replaceDeviceId
        )
    }

    // MARK: - Configuration

    func makeConfig(store: VPNConfigStore) throws -> WireGuardConfig {
        guard store.isConfigured else {
            throw ConfigError.notConfigured
        }

        let privateKey = try KeychainStore.obtainOrCreatePrivateKey()
        devicePublicKey = privateKey.publicKey.base64Key

        let addresses = store.tunnelAddress
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        let dns = store.dnsServers
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        let allowedIPs = store.allowedIPs
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }

        let config = WireGuardConfig(
            name: "privatevpn",
            privateKeyBase64: privateKey.base64Key,
            addresses: addresses,
            dnsServers: dns,
            peers: [
                WireGuardConfig.WireGuardPeer(
                    publicKeyBase64: store.serverPublicKey.trimmingCharacters(in: .whitespaces),
                    endpoint: store.serverEndpoint.trimmingCharacters(in: .whitespaces),
                    allowedIPs: allowedIPs,
                    preSharedKeyBase64: nil,
                    persistentKeepAlive: 25
                )
            ]
        )
        return config
    }

    enum ConfigError: LocalizedError {
        case notConfigured
        case noBackendNode
        case cachedTunnelUnavailable

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                return "Enter the server endpoint and peer public key in Configuration first."
            case .noBackendNode:
                return "No exit node available from the server. Please try again."
            case .cachedTunnelUnavailable:
                return "Could not reach the server and no saved tunnel is available yet. Connect once on a working network, then this network will work offline."
            }
        }
    }

    private func prepareConfiguration(
        _ config: WireGuardConfig,
        nodeId: String?,
        wsRelayURL: String? = nil,
        hysteriaNode: ExitNode? = nil
    ) async throws {
        let existing = try await NETunnelProviderManager.loadAllFromPreferences()
        let matching = existing.filter { Self.isOwnProfile($0.localizedDescription) }
        let manager = matching.first ?? NETunnelProviderManager()

        for old in matching.dropFirst() {
            try? await old.removeFromPreferences()
        }

        // Same transport as Android: carry WireGuard inside a TCP link to the relay
        // next to the exit node. The extension falls back to direct UDP when the
        // relay cannot be reached.
        // nodeId đi kèm config để extension báo health về coordinator: node bị GFW
        // chặn thì chỉ client mới biết, server tự kiểm tra vẫn thấy nó "sống".
        // wsRelayURL đi kèm vì relay phải khớp node: xem WireGuardConfig.wsRelayURL.
        let tunnelConfig = config.withRelay().withNodeId(nodeId).withWSRelayURL(wsRelayURL)

        let protocolConfig = NETunnelProviderProtocol()
        protocolConfig.providerBundleIdentifier = Self.providerBundleIdentifier
        protocolConfig.serverAddress = tunnelConfig.peers.first?.endpoint ?? "not-configured"
        var providerConfiguration: [String: Any] = [
            "wireguard": try JSONEncoder().encode(tunnelConfig.withoutPrivateKey()),
        ]

        // Transport hysteria2 — đường DUY NHẤT extension iOS chạy (extension iOS là
        // hysteria-only, y như extension macOS: hai Go runtime không cùng một process, xem
        // project.yml). Khoá "wireguard" ở trên vẫn giữ: đó là cấu hình dự phòng/đối chiếu
        // của app (`savedTunnelConfig`) và extension không đọc tới.
        //
        // Thiếu credential thì KHÔNG thêm khoá "hysteria" và phải nói RÕ cho người dùng:
        // extension không có nó sẽ báo TUNNEL_START_FAILED, còn im lặng thì khách chỉ thấy
        // "Connected" mà không có mạng.
        if let hysteria = Self.hysteriaConfiguration(
            node: hysteriaNode,
            endpoint: tunnelConfig.peers.first?.endpoint
        ) {
            providerConfiguration["hysteria"] = hysteria
            let relay = hysteria["relayURL"] as? String ?? "?"
            let host = hysteria["serverHost"] as? String ?? "?"
            log.info("configuration: hysteria2 -> \(relay, privacy: .public) (server \(host, privacy: .public))")
        } else {
            let message = "Bản build thiếu credential hysteria2 (HysteriaPassword/HysteriaObfs trong Info.plist) hoặc chưa xác định được node — tunnel iOS không dựng được. Build lại kèm HYST_PASSWORD/HYST_OBFS (xem scripts/dev-hysteria-build-env.sh)."
            lastError = message
            log.error("configuration: \(message, privacy: .public)")
        }
        protocolConfig.providerConfiguration = providerConfiguration

        manager.protocolConfiguration = protocolConfig
        manager.localizedDescription = Self.profileName
        manager.isEnabled = true
        try await manager.saveToPreferences()
        try await manager.loadFromPreferences()
        self.manager = manager
    }

    /// Cấu hình cho transport hysteria2 của extension iOS (giống `VPNManagerMac`).
    ///
    /// Credential KHÔNG nằm trong repo: build truyền `HYST_PASSWORD`/`HYST_OBFS` vào Info.plist
    /// của app (xem `scripts/dev-hysteria-build-env.sh`), app đọc lại rồi đưa cho extension qua
    /// `providerConfiguration` — extension không có quyền đọc Info.plist của app.
    ///
    /// Trả nil khi thiếu credential hoặc không xác định được host: gọi ở đây phải nói rõ cho
    /// người dùng, KHÔNG được lặng lẽ bỏ qua.
    private static func hysteriaConfiguration(node: ExitNode?, endpoint: String?) -> [String: Any]? {
        guard let password = Bundle.main.object(forInfoDictionaryKey: "HysteriaPassword") as? String,
              !password.isEmpty,
              let obfs = Bundle.main.object(forInfoDictionaryKey: "HysteriaObfs") as? String,
              !obfs.isEmpty else {
            return nil
        }
        // Endpoint của peer trong config là nguồn sự thật về node đang dial; node truyền vào chỉ
        // để lấy `hy_relay_url`.
        let host = Self.host(fromEndpoint: endpoint ?? node?.endpoint ?? "")
        guard !host.isEmpty else { return nil }

        // Relay của ĐÚNG node đang dial, rồi tới relay mặc định (node-2). Relay WireGuard
        // (`wg_relay_url`) KHÔNG dùng được ở đây: một relay chỉ hạ cánh ở một cổng UDP, gửi
        // QUIC vào cổng WireGuard là im lặng.
        let relay = (node?.endpoint == endpoint ? node?.hysteriaRelayURL : nil)
            ?? HysteriaDefaults.relayURLCandidates.first ?? ""
        return [
            "serverHost": host,
            "serverPort": Int(HysteriaDefaults.serverPort),
            "relayURL": relay,
            "relayURLCandidates": HysteriaDefaults.relayURLCandidates,
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

    private func loadManagerFromPreferences() async {
        do {
            let existing = try await NETunnelProviderManager.loadAllFromPreferences()
            manager = existing.first { Self.isOwnProfile($0.localizedDescription) }
            refreshStatus()
        } catch {
            lastError = error.localizedDescription
            statusMessage = Self.userMessage(for: error)
        }
    }

    /// Decodes the WireGuard config stored in the saved VPNFlow NEVPN
    /// profile. Used as a fallback when the coordinator is unreachable — the
    /// profile persists across sessions, so this works even before
    /// TunnelConfigCache was ever written.
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

    /// Closes the device-limit prompt without changing anything.
    func dismissDeviceLimit() {
        deviceLimitMessage = nil
        deviceLimitDevices = []
    }

    /// Logs out one of the account's devices and retries the connection.
    func logOutDeviceAndRetry(deviceId: String, store: VPNConfigStore, authStore: AuthSessionStore) async {
        guard let token = authStore.accessToken, !token.isEmpty,
              let baseURL = store.controlPlaneBaseURL else { return }
        do {
            try await ControlAPIClient(baseURL: baseURL, joinToken: "")
                .revokeDevice(id: deviceId, accessToken: token)
            log.info("logged out device \(deviceId, privacy: .public)")
        } catch {
            log.error("device logout failed: \(error.localizedDescription, privacy: .public)")
        }
        dismissDeviceLimit()
        await connect(store: store, authStore: authStore)
    }

    private static func userMessage(for error: Error) -> String {
        if let error = error as? ControlAPIClient.ClientError {
            switch error {
            case .transport(_, let underlying):
                return transportMessage(underlying: underlying)
            case .server(let message):
                // The coordinator's messages are already user-facing (e.g. which
                // limit was hit) — don't replace them with a vague rejection.
                return message
            case .badResponse:
                return "Coordinator returned an invalid response. Please try again."
            case .missingSession:
                return "Please sign in before connecting."
            case .deviceLimit(let message, _):
                return message
            }
        }
        if error is ConfigError {
            return "VPN configuration is not ready. Please try again."
        }
        return "VPN could not start. Please try again."
    }

    private static func transportMessage(underlying: Error) -> String {
        let nsError = underlying as NSError
        guard nsError.domain == NSURLErrorDomain else {
            return "Cannot reach the coordinator. Please try again."
        }

        switch nsError.code {
        case NSURLErrorAppTransportSecurityRequiresSecureConnection:
            return "Coordinator connection is blocked by app transport security."
        case NSURLErrorCannotConnectToHost:
            return "Cannot connect to the coordinator service."
        case NSURLErrorTimedOut:
            return "Coordinator request timed out."
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
            return "Network is offline while contacting the coordinator."
        case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
            return "Cannot resolve the coordinator."
        default:
            return "Cannot reach the coordinator."
        }
    }
}
