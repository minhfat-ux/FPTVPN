import SwiftUI
import WebKit

/// Settings screen for account, devices and subscription actions.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var configStore: VPNConfigStore
    @EnvironmentObject private var vpnManager: VPNManager
    @EnvironmentObject private var subscriptionStore: SubscriptionStore
    @EnvironmentObject private var authStore: AuthSessionStore
    @EnvironmentObject private var languageStore: AppLanguageStore
    @State private var showingPaywall = false
    @State private var showingLogin = false
    @State private var showDeleteAccountConfirm = false
    @State private var accountMessage: String?
    // User-scoped device management (FR-REVOKE-001/002).
    @State private var devices: [CoordinatorDevice] = []
    @State private var isLoadingDevices = false
    @State private var devicesMessage: String?

    var body: some View {
        Form {
            languageSection
            accountSection
            devicesSection
            subscriptionSection
            supportSection
        }
        .tint(VPNTheme.accent)
        .navigationTitle(languageStore.t(.configuration))
        .refreshable {
            await loadDevices()
        }
        .sheet(isPresented: $showingPaywall, onDismiss: {
            // Đóng paywall = thời điểm khách vừa có thể đã trả tiền trên trang web trong
            // WebView, nên đọc lại quyền ngay (best-effort, im lặng nếu lỗi/404).
            Task { await refreshEntitlement(reportFailure: false) }
        }) {
            PaywallView()
                .environmentObject(subscriptionStore)
                .environmentObject(languageStore)
        }
        .fullScreenCover(isPresented: $showingLogin) {
            LoginView()
                .environmentObject(configStore)
                .environmentObject(authStore)
                .environmentObject(languageStore)
        }
        .task {
            await loadDevices()
        }
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(languageStore.t(.done)) { dismiss() }
            }
        }
    }

    private var accountSection: some View {
        Section(languageStore.t(.account)) {
            LabeledContent(languageStore.t(.status)) {
                Text(authStore.isSignedIn ? languageStore.t(.signedIn) : languageStore.t(.signedOut))
                    .foregroundStyle(authStore.isSignedIn ? VPNTheme.accent : .secondary)
            }

            if let email = authStore.session?.user.email, !email.isEmpty {
                LabeledContent(languageStore.t(.email), value: email)
            }

            if authStore.isSignedIn {
                Button(role: .destructive) {
                    authStore.signOut()
                } label: {
                    Label(languageStore.t(.signOut), systemImage: "rectangle.portrait.and.arrow.right")
                }

                Button(role: .destructive) {
                    showDeleteAccountConfirm = true
                } label: {
                    Label(languageStore.t(.deleteAccount), systemImage: "trash")
                }
                .confirmationDialog(
                    languageStore.t(.deleteAccount),
                    isPresented: $showDeleteAccountConfirm,
                    titleVisibility: .visible
                ) {
                    Button(languageStore.t(.deleteAccount), role: .destructive) {
                        Task { await deleteAccount() }
                    }
                    Button(languageStore.t(.cancel), role: .cancel) {}
                } message: {
                    Text(languageStore.t(.deleteAccountConfirm))
                }
            } else {
                Button {
                    showingLogin = true
                } label: {
                    Label(languageStore.t(.signInTitle), systemImage: "person.crop.circle.badge.plus")
                }
            }

            if let message = accountMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @MainActor
    private func deleteAccount() async {
        do {
            guard let baseURL = configStore.controlPlaneBaseURL else {
                throw ControlAPIClient.ClientError.server("Coordinator URL is not configured.")
            }
            guard let token = authStore.accessToken else {
                throw ControlAPIClient.ClientError.missingSession
            }
            try await ControlAPIClient(baseURL: baseURL, joinToken: "").deleteAccount(accessToken: token)
            authStore.signOut()
            accountMessage = languageStore.t(.deleteAccountDone)
        } catch {
            accountMessage = error.localizedDescription
        }
    }

    // MARK: - Devices (FR-REVOKE-001/002)

    private var devicesSection: some View {
        Section(languageStore.t(.devices)) {
            if authStore.isSignedIn {
                if isLoadingDevices && devices.isEmpty {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text(languageStore.t(.loadingDevices))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else if devices.isEmpty {
                    Text(languageStore.t(.noDevices))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(devices) { device in
                        deviceRow(device)
                    }
                }

                if let message = devicesMessage {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } else {
                Button {
                    showingLogin = true
                } label: {
                    Label(languageStore.t(.signInTitle), systemImage: "person.crop.circle.badge.plus")
                }
            }
        }
    }

    private func deviceRow(_ device: CoordinatorDevice) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(device.name ?? device.device_id)
                        .font(.subheadline.weight(.medium))
                    if isCurrentDevice(device) {
                        Text(languageStore.t(.thisDevice))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Text(deviceDetail(device))
                    .font(.caption)
                    .foregroundStyle(device.isActive ? VPNTheme.accent : .secondary)
            }
            Spacer()
        }
    }

    private func isCurrentDevice(_ device: CoordinatorDevice) -> Bool {
        guard let current = vpnManager.devicePublicKey, !current.isEmpty else { return false }
        return device.public_key == current
    }

    private func deviceDetail(_ device: CoordinatorDevice) -> String {
        var parts: [String] = [device.isActive ? languageStore.t(.active) : languageStore.t(.revoked)]
        if let ip = device.assigned_ip, !ip.isEmpty { parts.append(ip) }
        if let platform = device.platform, !platform.isEmpty { parts.append(platform) }
        if let created = device.created_at,
           let date = Self.parseISODate(created) {
            parts.append(date.formatted(date: .abbreviated, time: .shortened))
        }
        return parts.joined(separator: " · ")
    }

    private static func parseISODate(_ raw: String) -> Date? {
        ISO8601DateFormatter().date(from: raw)
    }

    @MainActor
    private func loadDevices() async {
        guard authStore.isSignedIn else { return }
        isLoadingDevices = true
        defer { isLoadingDevices = false }
        do {
            guard let baseURL = configStore.controlPlaneBaseURL else {
                throw ControlAPIClient.ClientError.server("Coordinator URL is not configured.")
            }
            guard let token = authStore.accessToken else {
                throw ControlAPIClient.ClientError.missingSession
            }
            devices = try await ControlAPIClient(baseURL: baseURL, joinToken: "").fetchMyDevices(accessToken: token)
            devicesMessage = nil
        } catch {
            devicesMessage = error.localizedDescription
        }
    }

    private var languageSection: some View {
        Section(languageStore.t(.language)) {
            Picker(languageStore.t(.language), selection: Binding(
                get: { languageStore.choice },
                set: { languageStore.setChoice($0) }
            )) {
                ForEach(AppLanguageChoice.allCases) { choice in
                    Text(choice.title(in: languageStore.language)).tag(choice)
                }
            }
        }
    }

    private var subscriptionSection: some View {
        Section(languageStore.t(.subscription)) {
            LabeledContent(languageStore.t(.status)) {
                Text(subscriptionStore.isSubscribed ? languageStore.t(.premiumActive) : languageStore.t(.free))
                    .foregroundStyle(subscriptionStore.isSubscribed ? VPNTheme.accent : .secondary)
            }

            Button {
                showingPaywall = true
            } label: {
                Label(languageStore.t(.choosePlan), systemImage: "creditcard")
            }

            Button {
                Task {
                    await refreshEntitlement()
                }
            } label: {
                Label(languageStore.t(.restorePurchases), systemImage: "arrow.clockwise")
            }
            .disabled(subscriptionStore.isLoading)

            if let message = subscriptionStore.errorMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// "Đã mua rồi" của luồng mua qua web: hỏi lại backend xem tài khoản đang đăng
    /// nhập đã có gói chưa (xem `SubscriptionStore.refreshEntitlement`).
    ///
    /// `reportFailure: true` cho nút bấm tay (khách phải thấy lỗi); `false` cho các lần tự động
    /// (đóng paywall) — lúc đó lỗi mạng/404 thì im lặng và giữ nguyên quyền đang có.
    @MainActor
    private func refreshEntitlement(reportFailure: Bool = true) async {
        guard authStore.isSignedIn else {
            if reportFailure {
                subscriptionStore.errorMessage = languageStore.t(.signInRequired)
            }
            return
        }
        guard let baseURL = configStore.controlPlaneBaseURL else {
            if reportFailure {
                subscriptionStore.errorMessage = ControlAPIClient.ClientError
                    .server("Coordinator URL is not configured.").localizedDescription
            }
            return
        }
        await subscriptionStore.refreshEntitlement(
            baseURL: baseURL,
            authStore: authStore,
            reportFailure: reportFailure
        )
    }

    private var supportSection: some View {
        Section(languageStore.t(.support)) {
            // Link theo host control-plane đang sống (`ControlAPIHosts.webURL`): ở mạng bị
            // GFW chặn, tên miền chính không mở được nên phải dùng host dự phòng.
            Link(destination: ControlAPIHosts.webURL("support")) {
                Label(languageStore.t(.contactSupport), systemImage: "questionmark.circle")
            }

            Link(destination: ControlAPIHosts.webURL("FlowVPNPrivacy.html")) {
                Label(languageStore.t(.privacyPolicy), systemImage: "hand.raised")
            }

            // Điều khoản RIÊNG của VPNFlow — /terms là điều khoản của MeetFlow AI.
            Link(destination: ControlAPIHosts.webURL("vpnflow/terms")) {
                Label(languageStore.t(.termsOfUse), systemImage: "doc.text")
            }
        }
    }

}

/// Backend-only entitlement store.
/// Đừng thêm lại StoreKit/IAP: đã bỏ store billing 14/09/2026, không còn kênh nào bán qua store.
@MainActor
final class SubscriptionStore: ObservableObject {
    /// Backend entitlement: true when the signed-in account has an active
    /// subscription (subscription_status.is_active from the coordinator).
    @Published var backendPremium = false
    /// `subscription_status` đầy đủ của lần đọc session gần nhất. `backendPremium` chỉ giữ
    /// `is_active`, còn cờ dùng thử (`is_trial` / `trial_hours_left`) thì cần cả struct.
    @Published var backendSubscriptionStatus: CoordinatorSubscriptionStatus?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    var isSubscribed: Bool {
        // Dev bypass (chỉ trên máy chủ dự án): FORCE_PREMIUM=1 trong scheme environment,
        // hoặc `defaults write com.privatevpn.app flowvpn.forcePremium -bool YES`.
        // Bọc trong #if DEBUG để bản phát cho người dùng KHÔNG có đường mở khoá Premium
        // (một tính năng ẩn như vậy là lỗi 2.3.1 nếu Apple phát hiện).
        #if DEBUG
        if ProcessInfo.processInfo.environment["FORCE_PREMIUM"] == "1"
            || UserDefaults.standard.bool(forKey: "flowvpn.forcePremium") {
            return true
        }
        #endif
        return backendPremium
    }

    /// Đang dùng BẢN DÙNG THỬ 1 NGÀY miễn phí. Gắn với `isSubscribed` nên khi trial hết
    /// (`is_active` = false) cờ này tự tắt và banner biến mất.
    var isOnFreeTrial: Bool {
        isSubscribed && backendSubscriptionStatus?.is_trial == true
    }

    /// Số giờ còn lại của trial (nil khi không phải trial hoặc backend không trả).
    var trialHoursLeft: Int? {
        backendSubscriptionStatus?.trial_hours_left
    }

    /// Tên gói khách ĐANG dùng: backend gửi `plan_badge` (Monthly / 3 Months / Yearly…);
    /// payload cũ không có thì suy từ `product_id` để mục Subscription luôn nói rõ gói đã mua.
    var activePlanName: String {
        guard isSubscribed else { return "" }
        if let badge = backendSubscriptionStatus?.plan_badge, !badge.isEmpty { return badge }
        let id = backendSubscriptionStatus?.product_id ?? ""
        guard !id.isEmpty else { return "Premium" }
        return id.prefix(1).uppercased() + id.dropFirst()
    }

    /// Ngày hết hạn của gói đã mua (nil = gói vĩnh viễn hoặc chưa mua).
    var planExpiresAt: Date? {
        guard let raw = backendSubscriptionStatus?.expires_at, !raw.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = iso.date(from: raw) { return parsed }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: raw)
    }

    /// Số ngày còn lại của gói (nil khi gói vĩnh viễn).
    var planDaysLeft: Int? {
        guard let date = planExpiresAt else { return nil }
        return max(0, Int(ceil(date.timeIntervalSinceNow / 86_400)))
    }

    /// Đọc lại session từ coordinator (`GET /v1/auth/session`) và cập nhật quyền Premium.
    ///
    /// Dùng cho cả hai đường:
    /// - nút "Làm mới trạng thái gói" → `reportFailure: true` (khách phải thấy lỗi);
    /// - tự động lúc mở app và ngay sau khi đăng nhập → `reportFailure: false`.
    ///
    /// Vì sao có đường tự động: `syncBackendPremium()` chỉ đọc lại session ĐÃ CACHE, mà
    /// `subscription_status` chỉ về một lần lúc đăng nhập — không đọc lại thì khách vừa trả tiền trên web sẽ bị đẩy vào paywall.
    ///
    /// Lỗi (mất mạng, hoặc control plane cũ chưa có route này → 404) thì **giữ nguyên** quyền
    /// đang có: không được tự hạ một khách đang trả tiền xuống Free, và lần gọi tự động thì im
    /// lặng — không chặn mở app, không chặn nút Connect.
    func refreshEntitlement(
        baseURL: URL,
        authStore: AuthSessionStore,
        reportFailure: Bool = true
    ) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let refreshed = try await ControlAPIClient(baseURL: baseURL, joinToken: "")
                .fetchSession(accessToken: authStore.accessToken ?? "")
            // Chỉ ghi keychain khi payload thật sự đổi: tránh ghi vô ích mỗi lần mở app.
            if refreshed != authStore.session {
                authStore.save(refreshed)
            }
            let status = refreshed.user.subscription_status
            backendSubscriptionStatus = status
            backendPremium = status?.is_active ?? false
            errorMessage = nil
        } catch {
            if reportFailure {
                errorMessage = error.localizedDescription
            }
        }
    }
}

/// The paywall — always the web buy page.
/// Đừng thêm lại nhánh StoreKit/IAP hay cờ biên dịch theo kênh: chỉ còn một kênh mua là trang web /buy.
struct PaywallView: View {
    var body: some View {
        WebBuyPaywallView()
    }
}

/// The only paywall: the web buy page (bank QR / WeChat / Alipay).
struct WebBuyPaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var languageStore: AppLanguageStore

    private var buyURL: URL {
        // inapp=1: khách đã có app rồi ⇒ trang chỉ hiện ĐĂNG KÝ TÀI KHOẢN + THANH TOÁN,
        // không hiện khối tải/cài app (vô nghĩa trong paywall). Host lấy theo host đang
        // sống để paywall vẫn mở được ở mạng bị chặn.
        ControlAPIHosts.webURL("buy", queryItems: [
            URLQueryItem(name: "lang", value: languageStore.language.rawValue),
            URLQueryItem(name: "inapp", value: "1"),
        ])
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    VPNTheme.brandTitle(languageStore.t(.paywallTitle))
                        .font(.headline)
                    Spacer()
                    Button(languageStore.t(.notNow)) {
                        dismiss()
                    }
                    .font(.subheadline)
                    .foregroundStyle(VPNTheme.secondaryLabel)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(VPNTheme.backgroundTop)

                BuyWebView(url: buyURL)
                    .ignoresSafeArea()
            }
            .background(VPNTheme.backgroundGradient.ignoresSafeArea())
        }
    }
}

/// Minimal WKWebView wrapper that loads a remote URL.
private struct BuyWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 5 / 255, green: 21 / 255, blue: 37 / 255, alpha: 1)
        webView.navigationDelegate = context.coordinator
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        if uiView.url == nil {
            uiView.load(URLRequest(url: url))
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, WKNavigationDelegate {}
}
