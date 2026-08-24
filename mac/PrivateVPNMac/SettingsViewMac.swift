import AppKit
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
    @State private var deviceToRevoke: CoordinatorDevice?
    @State private var revokingDeviceID: String?

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
            if device.isActive && !isCurrentDevice(device) {
                Button(languageStore.t(.revoke), role: .destructive) {
                    deviceToRevoke = device
                }
                .font(.caption)
                .disabled(revokingDeviceID != nil)
            }
        }
        .confirmationDialog(
            languageStore.t(.revoke),
            isPresented: Binding(
                get: { deviceToRevoke?.device_id == device.device_id },
                set: { if !$0 { deviceToRevoke = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(languageStore.t(.revoke), role: .destructive) {
                Task { await revokeDevice(device) }
            }
            Button(languageStore.t(.cancel), role: .cancel) { deviceToRevoke = nil }
        } message: {
            Text(languageStore.t(.revokeDeviceConfirm))
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

    @MainActor
    private func revokeDevice(_ device: CoordinatorDevice) async {
        revokingDeviceID = device.device_id
        defer { revokingDeviceID = nil }
        do {
            guard let url = URL(string: vpnManager.coordinatorURL) else {
                throw ControlAPIClient.ClientError.server("Coordinator URL is not configured.")
            }
            guard let token = authStore.accessToken else {
                throw ControlAPIClient.ClientError.missingSession
            }
            try await ControlAPIClient(baseURL: url, joinToken: "").revokeDevice(id: device.device_id, accessToken: token)
            devicesMessage = languageStore.t(.deviceRevoked)
            await loadDevices()
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
        #if DEBUG
        return true
        #else
        return backendPremium || !purchasedProductIDs.isDisjoint(with: Self.productIDs)
        #endif
    }

    var activePlanName: String {
        #if DEBUG
        return "Premium"
        #else
        if let activeProduct = products.first(where: { purchasedProductIDs.contains($0.id) }) {
            return activeProduct.displayName
        }
        return isSubscribed ? "Premium" : "Free"
        #endif
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
    @EnvironmentObject private var subscriptionStore: MacSubscriptionStore
    @EnvironmentObject private var languageStore: AppLanguageStore

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VPNThemeMac.backgroundGradient
                .ignoresSafeArea()

            // ScrollView keeps the sheet usable on small screens: the
            // content (header + benefits + plans + disclosure) can exceed
            // the window height, so it scrolls instead of clipping/offsetting.
            ScrollView {
                VStack(spacing: 22) {
                    header
                    benefits
                    plans
                    footer
                }
                .padding(24)
                .frame(width: 390)
            }
            .scrollIndicators(.hidden)

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
        .frame(width: 438, height: 720)   // fixed sheet size (390 + 2×24 padding)
        .preferredColorScheme(.dark)
        .task {
            await subscriptionStore.start()
        }
    }

    private var header: some View {
        VStack(spacing: 10) {
            Image(nsImage: NSApplication.shared.applicationIconImage)
                .resizable()
                .scaledToFit()
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .shadow(color: .black.opacity(0.28), radius: 14, y: 8)

            Text(languageStore.t(.paywallTitle))
                .font(.largeTitle.bold())
                .foregroundStyle(VPNThemeMac.textPrimary)
                .multilineTextAlignment(.center)

            Text(languageStore.t(.paywallSubtitle))
                .font(.subheadline)
                .foregroundStyle(VPNThemeMac.textSecondary)
                .multilineTextAlignment(.center)
        }
    }

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 14) {
            benefitRow("checkmark.shield.fill", languageStore.t(.benefitTunnel))
            benefitRow("wifi.exclamationmark", languageStore.t(.benefitWifi))
            benefitRow("bolt.fill", languageStore.t(.benefitFast))
        }
        .macPaywallCard()
    }

    private func benefitRow(_ icon: String, _ title: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(VPNThemeMac.accent)
                .frame(width: 26)
            Text(title)
                .font(.headline)
                .foregroundStyle(VPNThemeMac.textPrimary)
            Spacer()
        }
    }

    private var plans: some View {
        VStack(spacing: 12) {
            if subscriptionStore.isLoading && subscriptionStore.products.isEmpty {
                ProgressView()
                    .tint(VPNThemeMac.accent)
                    .padding(.vertical, 24)
            }

            ForEach(subscriptionStore.products, id: \.id) { product in
                Button {
                    Task {
                        await subscriptionStore.purchase(product)
                        if subscriptionStore.isSubscribed {
                            dismiss()
                        }
                    }
                } label: {
                    planRow(product)
                }
                .buttonStyle(.plain)
                .disabled(subscriptionStore.isLoading)
            }

            if subscriptionStore.products.isEmpty && !subscriptionStore.isLoading {
                VStack(spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text(languageStore.t(.noPlans))
                        .font(.headline)
                        .foregroundStyle(VPNThemeMac.textPrimary)
                    Text(languageStore.t(.noPlansDetail))
                        .font(.footnote)
                        .foregroundStyle(VPNThemeMac.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.vertical, 16)
            }

            if let message = subscriptionStore.errorMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
            }
        }
        .macPaywallCard()
    }

    private func planRow(_ product: Product) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text(product.displayName)
                    .font(.headline)
                    .foregroundStyle(VPNThemeMac.textPrimary)
                Text(product.description)
                    .font(.footnote)
                    .foregroundStyle(VPNThemeMac.textSecondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 12)

            Text(product.displayPrice)
                .font(.headline.bold())
                .foregroundStyle(.black)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(VPNThemeMac.accent)
                .clipShape(Capsule())
        }
        .padding(16)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
    }

    private var footer: some View {
        VStack(spacing: 12) {
            Button {
                Task {
                    await subscriptionStore.restorePurchases()
                }
            } label: {
                Label(languageStore.t(.restorePurchases), systemImage: "arrow.clockwise")
                    .font(.subheadline.bold())
            }
            .tint(VPNThemeMac.accent)
            .disabled(subscriptionStore.isLoading)

            legalLinks
            .font(.footnote)
            .foregroundStyle(VPNThemeMac.textSecondary)

            Text(languageStore.t(.subscriptionDisclosure))
                .font(.caption)
                .foregroundStyle(VPNThemeMac.textSecondary.opacity(0.7))
                .multilineTextAlignment(.center)

            Button(languageStore.t(.notNow)) {
                dismiss()
            }
            .font(.footnote)
            .foregroundStyle(VPNThemeMac.textSecondary)
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
    }

    private var legalLinks: some View {
        HStack(spacing: 14) {
            Link(languageStore.t(.privacy), destination: URL(string: "https://meetflowai.site/FlowVPNPrivacy.html")!)
            Link(languageStore.t(.support), destination: URL(string: "https://meetflowai.site/SupportPrivateVPN.html")!)
            Link(languageStore.t(.eula), destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
        }
    }
}

private extension View {
    func macPaywallCard() -> some View {
        self
            .padding(18)
            .frame(maxWidth: .infinity)
            .background(VPNThemeMac.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
            )
    }
}

#Preview {
    SettingsViewMac()
        .environmentObject(VPNManagerMac())
        .environmentObject(MacSubscriptionStore())
        .environmentObject(AuthSessionStore())
        .environmentObject(AppLanguageStore())
}
