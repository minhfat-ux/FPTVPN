import AppKit
import WebKit
import StoreKit
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
                        await subscriptionStore.restorePurchases()
                    }
                } label: {
                    Label(languageStore.t(.restorePurchases), systemImage: "arrow.clockwise")
                }
                .disabled(subscriptionStore.isLoading)
            }

            Section(languageStore.t(.support)) {
                Link(destination: URL(string: "https://meetflowai.site/SupportPrivateVPN.html")!) {
                    Label(languageStore.t(.contactSupport), systemImage: "questionmark.circle")
                }

                Link(destination: URL(string: "https://meetflowai.site/FlowVPNPrivacy.html")!) {
                    Label(languageStore.t(.privacyPolicy), systemImage: "hand.raised")
                }

                Link(destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!) {
                    Label(languageStore.t(.appleStandardEULA), systemImage: "doc.text")
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .padding()
        .sheet(isPresented: $showingPaywall) {
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
            await subscriptionStore.start()
            await loadDevices()
        }
        .onAppear {
            subscriptionStore.backendPremium = authStore.session?.user.subscription_status?.is_active ?? false
        }
        .onChange(of: authStore.session) { _, _ in
            subscriptionStore.backendPremium = authStore.session?.user.subscription_status?.is_active ?? false
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

@MainActor
final class MacSubscriptionStore: ObservableObject {
    static let productIDs = [
        "Mac_monthly",
        "Mac_yearly"
    ]

    @Published private(set) var products: [Product] = []
    @Published private(set) var purchasedProductIDs: Set<String> = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    /// Backend entitlement: true when the signed-in account has an active
    /// subscription (subscription_status.is_active from the coordinator).
    @Published var backendPremium = false

    private var hasStarted = false
    private var transactionUpdatesTask: Task<Void, Never>?

    var isSubscribed: Bool {
        // Dev bypass (owner machine): FORCE_PREMIUM=1 in the scheme environment,
        // or `defaults write com.privatevpn.mac flowvpn.forcePremium -bool YES`
        // on this Mac. Debug and Release behave identically; end users never
        // have this flag set, so StoreKit/backend checks apply to them.
        if ProcessInfo.processInfo.environment["FORCE_PREMIUM"] == "1"
            || UserDefaults.standard.bool(forKey: "flowvpn.forcePremium") {
            return true
        }
        return backendPremium || !purchasedProductIDs.isDisjoint(with: Self.productIDs)
    }

    var activePlanName: String {
        if let activeProduct = products.first(where: { purchasedProductIDs.contains($0.id) }) {
            return activeProduct.displayName
        }
        return isSubscribed ? "Premium" : "Free"
    }

    func start() async {
        guard !hasStarted else { return }
        hasStarted = true
        observeTransactionUpdates()
        await loadProducts()
        await refreshEntitlements()
    }

    func loadProducts() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let loadedProducts = try await Product.products(for: Self.productIDs)
            products = loadedProducts.sorted { left, right in
                if left.type == right.type {
                    return left.price < right.price
                }
                return left.id < right.id
            }
            errorMessage = loadedProducts.isEmpty ? "No StoreKit products found. Check Mac_monthly and Mac_yearly in App Store Connect." : nil
        } catch {
            errorMessage = "Cannot load plans. Please try again."
        }
    }

    func purchase(_ product: Product) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    errorMessage = "Purchase could not be verified."
                    return
                }
                await transaction.finish()
                await refreshEntitlements()
                errorMessage = nil
            case .pending:
                errorMessage = "Purchase is pending approval."
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            errorMessage = "Purchase failed. Please try again."
        }
    }

    func restorePurchases() async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await AppStore.sync()
            await refreshEntitlements()
            errorMessage = isSubscribed ? nil : "No active Premium purchase was found."
        } catch {
            errorMessage = "Restore failed. Please try again."
        }
    }

    func refreshEntitlements() async {
        var activeProductIDs = Set<String>()

        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard Self.productIDs.contains(transaction.productID) else { continue }
            if transaction.revocationDate == nil,
               transaction.expirationDate.map({ $0 > Date() }) ?? true {
                activeProductIDs.insert(transaction.productID)
            }
        }

        purchasedProductIDs = activeProductIDs
    }

    private func observeTransactionUpdates() {
        transactionUpdatesTask?.cancel()
        transactionUpdatesTask = Task(priority: .background) { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                await self.refreshEntitlements()
            }
        }
    }

    deinit {
        transactionUpdatesTask?.cancel()
    }
}

struct MacPaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var languageStore: AppLanguageStore

    /// Buy page localized to the in-app language (paywall maps to app UI).
    private var buyURL: URL {
        URL(string: "https://meetflowai.site/buy?lang=\(languageStore.language.rawValue)")!
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VPNThemeMac.backgroundGradient
                .ignoresSafeArea()

            // Buy page (meetflowai.site/buy) handles plans, payment
            // (bank QR / WeChat / Alipay) and emails the invoice. Premium is
            // activated server-side for the signed-in account.
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
        .frame(width: 460, height: 760)   // fixed sheet size
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
