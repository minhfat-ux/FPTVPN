import AppKit
import StoreKit
import SwiftUI

struct SettingsViewMac: View {
    @EnvironmentObject private var vpnManager: VPNManagerMac
    @EnvironmentObject private var subscriptionStore: MacSubscriptionStore
    @EnvironmentObject private var authStore: AuthSessionStore
    @EnvironmentObject private var languageStore: AppLanguageStore
    @State private var showingPaywall = false
    @State private var email = ""
    @State private var loginCode = ""
    @State private var accountMessage: String?

    var body: some View {
        Form {
            languageSection
            accountSection

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
        .task {
            await subscriptionStore.start()
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
            } else {
                TextField(languageStore.t(.email), text: $email)
                    .textContentType(.emailAddress)
                SecureField(languageStore.t(.loginCode), text: $loginCode)

                Button {
                    Task { await sendLoginCode() }
                } label: {
                    Label(languageStore.t(.sendCode), systemImage: "envelope")
                }

                Button {
                    Task { await verifyLoginCode() }
                } label: {
                    Label(languageStore.t(.verifyCode), systemImage: "checkmark.seal")
                }
                .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || loginCode.isEmpty)
            }

            if authStore.isSignedIn {
                Button(role: .destructive) {
                    authStore.signOut()
                } label: {
                    Label(languageStore.t(.signOut), systemImage: "rectangle.portrait.and.arrow.right")
                }
            }

            if let message = accountMessage ?? authStore.lastError {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func sendLoginCode() async {
        do {
            let debugCode = try await controlAPIClient().startEmailLogin(email: email)
            accountMessage = debugCode.map { "Login code sent. Dev code: \($0)" } ?? "Login code sent."
        } catch {
            accountMessage = error.localizedDescription
        }
    }

    private func verifyLoginCode() async {
        do {
            let session = try await controlAPIClient().verifyEmailLogin(email: email, code: loginCode)
            authStore.save(session)
            loginCode = ""
            accountMessage = nil
        } catch {
            accountMessage = error.localizedDescription
        }
    }

    private func controlAPIClient() throws -> ControlAPIClient {
        guard let url = normalizedURL(vpnManager.coordinatorURL) else {
            throw ControlAPIClient.ClientError.server("Coordinator URL is not configured.")
        }
        return ControlAPIClient(baseURL: url, joinToken: "")
    }

    private func normalizedURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            return URL(string: trimmed)
        }
        return URL(string: "https://\(trimmed)")
    }
}

@MainActor
final class MacSubscriptionStore: ObservableObject {
    private static let temporaryPremiumUnlock = true

    static let productIDs = [
        "Monthly_Premium",
        "Yearly_Premium"
    ]

    @Published private(set) var products: [Product] = []
    @Published private(set) var purchasedProductIDs: Set<String> = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private var hasStarted = false
    private var transactionUpdatesTask: Task<Void, Never>?

    var isSubscribed: Bool {
        if Self.temporaryPremiumUnlock {
            return true
        }

        #if DEBUG
        return true
        #else
        return !purchasedProductIDs.isDisjoint(with: Self.productIDs)
        #endif
    }

    var activePlanName: String {
        if Self.temporaryPremiumUnlock {
            return "Premium"
        }

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
        guard !Self.temporaryPremiumUnlock else { return }
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
            errorMessage = loadedProducts.isEmpty ? "No StoreKit products found. Check Monthly_Premium and Yearly_Premium in App Store Connect." : nil
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

            VStack(spacing: 22) {
                header
                benefits
                plans
                footer
            }
            .padding(24)
            .frame(width: 390)

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
