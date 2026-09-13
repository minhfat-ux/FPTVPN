import AppKit
import WebKit
import SwiftUI

struct SettingsViewMac: View {
    @EnvironmentObject private var vpnManager: VPNManagerMac
    @EnvironmentObject private var subscriptionStore: MacSubscriptionStore
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

            Section(languageStore.t(.subscription)) {
                LabeledContent(languageStore.t(.status)) {
                    Text(subscriptionStore.isSubscribed ? languageStore.t(.premiumActive) : languageStore.t(.free))
                        .foregroundStyle(subscriptionStore.isSubscribed ? VPNThemeMac.accent : .secondary)
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

            Section(languageStore.t(.support)) {
                Link(destination: URL(string: "https://meetflowai.site/support")!) {
                    Label(languageStore.t(.contactSupport), systemImage: "questionmark.circle")
                }

                Link(destination: URL(string: "https://meetflowai.site/FlowVPNPrivacy.html")!) {
                    Label(languageStore.t(.privacyPolicy), systemImage: "hand.raised")
                }

                Link(destination: URL(string: "https://meetflowai.site/terms")!) {
                    Label(languageStore.t(.termsOfUse), systemImage: "doc.text")
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .padding()
        .sheet(isPresented: $showingPaywall, onDismiss: {
            // Đóng paywall = thời điểm khách vừa có thể đã trả tiền trên trang web trong
            // WebView, nên đọc lại quyền ngay (best-effort, im lặng nếu lỗi/404).
            Task { await refreshEntitlement(reportFailure: false) }
        }) {
            MacPaywallView()
                .environmentObject(subscriptionStore)
                .environmentObject(languageStore)
        }
        .sheet(isPresented: $showingLogin) {
            LoginViewMac()
                .environmentObject(vpnManager)
                .environmentObject(authStore)
                .environmentObject(languageStore)
        }
        .task {
            await loadDevices()
        }
        .onAppear {
            subscriptionStore.backendPremium = authStore.session?.user.subscription_status?.is_active ?? false
        }
        .onChange(of: authStore.session) { _, _ in
            subscriptionStore.backendPremium = authStore.session?.user.subscription_status?.is_active ?? false
        }
    }

    /// "Đã mua rồi" của luồng mua qua web: hỏi lại backend xem tài khoản đang đăng
    /// nhập đã có gói chưa (xem `MacSubscriptionStore.refreshEntitlement`).
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
        guard let baseURL = URL(string: vpnManager.coordinatorURL) else {
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

    private var accountSection: some View {
        Section(languageStore.t(.account)) {
            LabeledContent(languageStore.t(.status)) {
                Text(authStore.isSignedIn ? languageStore.t(.signedIn) : languageStore.t(.signedOut))
                    .foregroundStyle(authStore.isSignedIn ? VPNThemeMac.accent : .secondary)
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
            guard let url = URL(string: vpnManager.coordinatorURL) else {
                throw ControlAPIClient.ClientError.server("Coordinator URL is not configured.")
            }
            guard let token = authStore.accessToken else {
                throw ControlAPIClient.ClientError.missingSession
            }
            try await ControlAPIClient(baseURL: url, joinToken: "").deleteAccount(accessToken: token)
            authStore.signOut()
            accountMessage = languageStore.t(.deleteAccountDone)
        } catch {
            accountMessage = error.localizedDescription
        }
    }

    // MARK: - Devices (FR-REVOKE-001/002)

    private var devicesSection: some View {
        Section {
            if authStore.isSignedIn {
                if isLoadingDevices && devices.isEmpty {
                    HStack(spacing: 8) {
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
        } header: {
            HStack {
                Text(languageStore.t(.devices))
                Spacer()
                if authStore.isSignedIn {
                    Button {
                        Task { await loadDevices() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.borderless)
                    .disabled(isLoadingDevices)
                    .help(languageStore.t(.refreshLocations))
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
                    .foregroundStyle(device.isActive ? VPNThemeMac.accent : .secondary)
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
            guard let url = URL(string: vpnManager.coordinatorURL) else {
                throw ControlAPIClient.ClientError.server("Coordinator URL is not configured.")
            }
            guard let token = authStore.accessToken else {
                throw ControlAPIClient.ClientError.missingSession
            }
            devices = try await ControlAPIClient(baseURL: url, joinToken: "").fetchMyDevices(accessToken: token)
            devicesMessage = nil
        } catch {
            devicesMessage = error.localizedDescription
        }
    }

}

/// Backend-only entitlement store — mirrors the iOS `SubscriptionStore`.
/// Đừng thêm lại StoreKit/IAP: đã bỏ store billing 14/09/2026, không còn kênh nào bán qua store.
@MainActor
final class MacSubscriptionStore: ObservableObject {
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    /// Backend entitlement: true when the signed-in account has an active
    /// subscription (subscription_status.is_active from the coordinator).
    @Published var backendPremium = false

    var isSubscribed: Bool {
        // Dev bypass (chỉ trên máy chủ dự án): FORCE_PREMIUM=1 trong scheme environment,
        // hoặc `defaults write com.privatevpn.mac flowvpn.forcePremium -bool YES`.
        // Bọc trong #if DEBUG để bản phát cho người dùng không còn đường mở khoá Premium.
        #if DEBUG
        if ProcessInfo.processInfo.environment["FORCE_PREMIUM"] == "1"
            || UserDefaults.standard.bool(forKey: "flowvpn.forcePremium") {
            return true
        }
        #endif
        return backendPremium
    }

    /// Tên gói hiển thị ở menu bar. Trước đây lấy `displayName` của sản phẩm StoreKit;
    /// StoreKit đã bị gỡ nên chỉ còn hai giá trị này.
    var activePlanName: String {
        isSubscribed ? "Premium" : "Free"
    }

    /// Đọc lại session từ coordinator (`GET /v1/auth/session`) và cập nhật quyền Premium.
    ///
    /// Dùng cho cả hai đường:
    /// - nút "Làm mới trạng thái gói" / menu bar → `reportFailure: true` (khách phải thấy lỗi);
    /// - tự động lúc mở app và ngay sau khi đăng nhập → `reportFailure: false`.
    ///
    /// Vì sao có đường tự động: quyền Premium có thể được cấp trên web SAU lần đăng nhập cuối,
    /// còn session chỉ được cấp lúc đăng nhập — không đọc lại thì khách vừa trả tiền sẽ bị đẩy vào paywall.
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
            backendPremium = refreshed.user.subscription_status?.is_active ?? false
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
struct MacPaywallView: View {
    var body: some View {
        MacWebBuyPaywallView()
    }
}

/// The only paywall: the web buy page (bank QR / WeChat / Alipay).
struct MacWebBuyPaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var languageStore: AppLanguageStore

    private var buyURL: URL {
        URL(string: "https://meetflowai.site/buy?lang=\(languageStore.language.rawValue)")!
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VPNThemeMac.backgroundGradient
                .ignoresSafeArea()

            MacBuyWebView(url: buyURL)

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(VPNThemeMac.textPrimary)
                    .frame(width: 32, height: 32)
                    .background(Color.white.opacity(0.12))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(16)
        }
        .frame(width: 460, height: 760)
        .preferredColorScheme(.dark)
    }
}

/// Minimal WKWebView wrapper that loads a remote URL (macOS).
private struct MacBuyWebView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: config)
        // macOS WKWebView has no writable isOpaque; the buy page is dark, so a
        // plain (opaque) view keeps things simple and avoids white flashes.
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        if nsView.url == nil {
            nsView.load(URLRequest(url: url))
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, WKNavigationDelegate {}
}

#Preview {
    SettingsViewMac()
        .environmentObject(VPNManagerMac())
        .environmentObject(MacSubscriptionStore())
        .environmentObject(AuthSessionStore())
        .environmentObject(AppLanguageStore())
}
