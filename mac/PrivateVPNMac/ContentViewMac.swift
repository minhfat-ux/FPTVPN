import AppKit
import SwiftUI

struct ContentViewMac: View {
    @EnvironmentObject private var vpnManager: VPNManagerMac
    @EnvironmentObject private var subscriptionStore: MacSubscriptionStore
    @EnvironmentObject private var authStore: AuthSessionStore
    @EnvironmentObject private var languageStore: AppLanguageStore
    @State private var showingPaywall = false
    @State private var showingLogin = false
    @State private var forcedUpdateInfo: AppVersionInfo?

    var body: some View {
        ZStack {
            VPNThemeMac.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 20) {
                // Header
                VStack(spacing: 6) {
                    ZStack(alignment: .topLeading) {
                        Image(nsImage: NSApplication.shared.applicationIconImage)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 76, height: 76)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .shadow(color: .black.opacity(0.28), radius: 14, y: 8)

                        // Crown badge: active Premium → góc trái trên của app logo.
                        if subscriptionStore.isSubscribed {
                            Image(systemName: "crown.fill")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.yellow)
                                .padding(3)
                                .background(Circle().fill(Color.black.opacity(0.6)))
                                .offset(x: -5, y: -5)
                        }
                    }
                    .frame(width: 76, height: 76)

                    // Connection status: chấm nhỏ + trạng thái, nằm ngay dưới logo.
                    HStack(spacing: 5) {
                        Circle()
                            .fill(statusColor)
                            .frame(width: 8, height: 8)
                        Text(vpnManager.state.localizedVPNState(languageStore.language))
                            .font(.caption)
                            .foregroundStyle(statusColor)
                    }

                    Text("FlowVPN")
                        .font(.largeTitle.bold())
                        .foregroundStyle(VPNThemeMac.textPrimary)
                    Text(languageStore.t(.appSubtitle))
                        .font(.subheadline)
                        .foregroundStyle(VPNThemeMac.textSecondary)
                }
                .padding(.top, 16)

                // Bản dùng thử 1 ngày: khách ĐANG có quyền nhưng chưa trả tiền — nhắc mua gói.
                if subscriptionStore.isOnFreeTrial {
                    trialBanner
                }

                if !subscriptionStore.isSubscribed {
                    subscriptionStatusCard
                }

                serverSelectionCard

                // Status card: chỉ text + chi tiết (icon nhỏ đã nằm dưới logo).
                VStack(spacing: 10) {
                    HStack(spacing: 8) {
                        if vpnManager.state == "Connecting…" || vpnManager.state == "Disconnecting…" {
                            ProgressView()
                                .controlSize(.small)
                                .tint(statusColor)
                        }
                        Text(vpnManager.state.localizedVPNState(languageStore.language))
                            .font(.title2.bold())
                            .foregroundStyle(statusColor)
                    }
                    if vpnManager.state == "Connecting…" {
                        Text(languageStore.t(.preparingPermission))
                            .font(.footnote)
                            .foregroundStyle(VPNThemeMac.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                    if vpnManager.state == "Failed" {
                        VStack(spacing: 4) {
                            Text(languageStore.t(.vpnStartFailure))
                            if let lastError = vpnManager.lastError, !lastError.isEmpty {
                                Text(lastError)
                                    .lineLimit(3)
                            }
                        }
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(20)
                .background(VPNThemeMac.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
                )

                Spacer()

                // Primary toggle button: Connect when disconnected, Disconnect when connected.
                Button(action: handlePrimaryTap) {
                    Image(systemName: "power")
                        .font(.system(size: 44, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 132, height: 132)
                        .background(
                            Circle()
                                .fill(primaryButtonColor)
                                .shadow(color: primaryButtonColor.opacity(0.45), radius: 22, y: 10)
                        )
                        .overlay(
                            Circle()
                                .stroke(.white.opacity(0.22), lineWidth: 1)
                        )
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(primaryButtonDisabled)
                .opacity(primaryButtonDisabled ? 0.72 : 1)
                .padding(.bottom, 16)
            }
            .padding(24)
            .frame(width: 390, height: 760)
        }
            .sheet(item: $forcedUpdateInfo) { info in
                ForceUpdateViewMac(info: info)
                    .environmentObject(languageStore)
            }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showingPaywall, onDismiss: {
            // Đóng paywall = thời điểm khách vừa có thể đã trả tiền trên trang web trong
            // WebView, nên đọc lại quyền ngay (best-effort, im lặng nếu lỗi/404).
            Task { await refreshEntitlementFromBackend() }
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
        .onAppear {
            if !authStore.isSignedIn {
                showingLogin = true
            } else {
                // Đã có token (khôi phục từ keychain): check subscription ngay.
                syncBackendPremium()
                if !subscriptionStore.isSubscribed {
                    showingPaywall = true
                }
            }
        }
        .onChange(of: authStore.session) { _, _ in
            // Vừa đăng nhập / session đổi: lấy token trước, rồi mới quyết định paywall.
            syncBackendPremium()
            if authStore.isSignedIn && !subscriptionStore.isSubscribed {
                showingPaywall = true
            }
        }
        .onChange(of: authStore.isSignedIn) { _, isSignedIn in
            showingLogin = !isSignedIn
            if !isSignedIn {
                showingPaywall = false
            } else {
                // Vừa đăng nhập: đồng bộ quyền từ backend (best-effort).
                Task { await refreshEntitlementFromBackend() }
            }
        }
        .task {
            // Quyền Premium có thể được cấp trên web SAU lần đăng nhập cuối, còn session chỉ
            // được cấp lúc đăng nhập — nên đọc lại ngay khi mở app (nút Connect bị khoá theo
            // `isSubscribed`). Chạy SONG SONG với refreshNodes để mạng chậm không làm chậm việc
            // mở khoá Connect hay cổng force-update. Best-effort: lỗi thì im lặng, giữ quyền.
            async let entitlementRefresh: Void = refreshEntitlementFromBackend()
            await vpnManager.refreshNodes()
            await entitlementRefresh
            // `.onAppear` có thể đã kịp mở paywall theo session cache cũ; nếu backend vừa xác
            // nhận khách đã trả tiền thì đóng lại, đừng chặn người đã mua.
            if subscriptionStore.isSubscribed {
                showingPaywall = false
            }
            // Force-update gate (owner requirement): block usage below minimum_version.
            if let url = URL(string: vpnManager.coordinatorURL),
               let info = try? await AppVersionService.fetch(from: url),
               AppVersionService.isForcedUpdate(info) {
                forcedUpdateInfo = info
            }
        }
    }

    private func syncBackendPremium() {
        let status = authStore.session?.user.subscription_status
        subscriptionStore.backendSubscriptionStatus = status
        subscriptionStore.backendPremium = status?.is_active ?? false
    }

    /// Đọc lại session từ backend (best-effort) để quyền Premium sống qua lần mở app và hiện
    /// ngay sau khi đăng nhập. Lỗi mạng / control plane cũ chưa có route thì im lặng và giữ
    /// nguyên quyền đang có — không chặn mở app, không chặn nút Connect.
    private func refreshEntitlementFromBackend() async {
        guard authStore.isSignedIn else { return }
        guard let baseURL = URL(string: vpnManager.coordinatorURL) else { return }
        await subscriptionStore.refreshEntitlement(
            baseURL: baseURL,
            authStore: authStore,
            reportFailure: false
        )
    }

    /// Banner bản dùng thử 1 ngày. Chỉ hiện khi backend nói `is_active` = true VÀ `is_trial`
    /// = true (product_id "trial.") — trial hết hạn thì `is_active` = false, banner tự tắt và
    /// paywall chặn Connect như khách chưa mua.
    /// Nút mua mở đúng paywall web sẵn có (`MacPaywallView` → trang /buy) — không thêm URL mới.
    private var trialBanner: some View {
        HStack(spacing: 14) {
            Image(systemName: "gift.fill")
                .font(.title3)
                .foregroundStyle(VPNThemeMac.accent)

            VStack(alignment: .leading, spacing: 3) {
                Text(languageStore.t(.trialBannerTitle))
                    .font(.headline)
                    .foregroundStyle(VPNThemeMac.textPrimary)
                Text(String(
                    format: languageStore.t(.trialBannerSubtitle),
                    String(subscriptionStore.trialHoursLeft ?? 0)
                ))
                    .font(.subheadline)
                    .foregroundStyle(VPNThemeMac.textSecondary)
            }

            Spacer()

            Button {
                showingPaywall = true
            } label: {
                Text(languageStore.t(.choosePlan))
                    .font(.subheadline.bold())
                    .foregroundStyle(.black)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(VPNThemeMac.accent)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isConnectionTransitioning)
        }
        .padding(16)
        .background(VPNThemeMac.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
        )
    }

    private var subscriptionStatusCard: some View {
        HStack(spacing: 14) {
            Image(systemName: subscriptionStore.isSubscribed ? "checkmark.seal.fill" : "lock.shield.fill")
                .font(.title3)
                .foregroundStyle(subscriptionStore.isSubscribed ? VPNThemeMac.accent : .orange)

            VStack(alignment: .leading, spacing: 3) {
                Text(subscriptionStore.isSubscribed ? languageStore.t(.premiumActive) : languageStore.t(.premiumRequired))
                    .font(.headline)
                    .foregroundStyle(VPNThemeMac.textPrimary)
                Text(subscriptionStore.isSubscribed ? languageStore.t(.protectionUnlocked) : languageStore.t(.choosePlanToStart))
                    .font(.subheadline)
                    .foregroundStyle(VPNThemeMac.textSecondary)
            }

            Spacer()

            if !subscriptionStore.isSubscribed {
                Button {
                    showingPaywall = true
                } label: {
                    Text(languageStore.t(.upgrade))
                        .font(.subheadline.bold())
                        .foregroundStyle(.black)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(VPNThemeMac.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isConnectionTransitioning)
            }
        }
        .padding(16)
        .background(VPNThemeMac.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
        )
    }

    private var serverSelectionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.title3)
                    .foregroundStyle(VPNThemeMac.accent)

                Text(languageStore.t(.serverLocation))
                    .font(.headline)
                    .foregroundStyle(VPNThemeMac.textPrimary)

                Spacer()

                Button {
                    Task { await vpnManager.refreshNodes() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
                .foregroundStyle(VPNThemeMac.textSecondary)
                .disabled(vpnManager.isRefreshingNodes || isConnectionTransitioning)
                .help(languageStore.t(.refreshLocations))
            }

            if vpnManager.exitNodes.isEmpty {
                Text(vpnManager.isRefreshingNodes ? languageStore.t(.loadingLocations) : languageStore.t(.noServerAvailable))
                    .font(.subheadline)
                    .foregroundStyle(VPNThemeMac.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                // List view: tối đa 5 server hiển thị, cuộn được; nút Select
                // chọn server đó và connect luôn (giống menu bar).
                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(vpnManager.exitNodes) { node in
                            serverRow(node)
                        }
                    }
                    .padding(2)
                }
                .frame(height: min(CGFloat(vpnManager.exitNodes.count), 5) * 30)
                .scrollIndicators(.visible)
                if vpnManager.usingFallbackNodes && vpnManager.state == "Disconnected" {
                    Text(languageStore.t(.usingSavedServers))
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(16)
        .background(VPNThemeMac.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
        )
    }

    private var primaryButtonColor: Color {
        switch vpnManager.state {
        case "Connected":
            return VPNThemeMac.accent
        case "Connecting…", "Disconnecting…":
            return .orange
        default:
            return .red
        }
    }

    private func handlePrimaryTap() {
        if vpnManager.state == "Connected" || vpnManager.state == "Connecting…" {
            vpnManager.disconnect()
        } else if !subscriptionStore.isSubscribed {
            showingPaywall = true
        } else if !authStore.isSignedIn {
            showingLogin = true
        } else {
            Task { await vpnManager.connect(authStore: authStore) }
        }
    }

    private var primaryButtonDisabled: Bool {
        isConnectionTransitioning || (vpnManager.state != "Connected" && vpnManager.exitNodes.isEmpty)
    }

    private var isConnectionTransitioning: Bool {
        vpnManager.state == "Connecting…" || vpnManager.state == "Disconnecting…"
    }

    private func serverRow(_ node: ExitNode) -> some View {
        let isSelected = vpnManager.selectedNodeID == node.id
        let isCurrent = isSelected && vpnManager.state == "Connected"
        let busy = isConnectionTransitioning

        return HStack(spacing: 8) {
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(isSelected ? VPNThemeMac.accent : VPNThemeMac.textSecondary)

            Text(serverTitle(for: node))
                .font(.body)
                .lineLimit(1)
                .foregroundStyle(VPNThemeMac.textPrimary)

            Spacer(minLength: 8)

            Button(isCurrent ? languageStore.t(.connected) : languageStore.t(.select)) {
                vpnManager.selectedNodeID = node.id
                if subscriptionStore.isSubscribed {
                    Task { await vpnManager.connect(authStore: authStore) }
                } else {
                    showingPaywall = true
                }
            }
            .font(.footnote.bold())
            .foregroundStyle(isCurrent ? Color.secondary : VPNThemeMac.accent)
            .buttonStyle(.plain)
            .disabled(busy || isCurrent)
        }
        .padding(.vertical, 5)
        .padding(.horizontal, 6)
        .background(isSelected ? VPNThemeMac.accent.opacity(0.12) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func serverTitle(for node: ExitNode) -> String {
        "\(node.city), \(node.country) · \(node.name)"
    }

    private var statusSymbol: String {
        switch vpnManager.state {
        case "Connected": return "checkmark.shield.fill"
        case "Connecting…": return "shield.lefthalf.filled"
        case "Failed": return "exclamationmark.triangle.fill"
        default: return "shield.slash.fill"
        }
    }

    private var statusColor: Color {
        switch vpnManager.state {
        case "Connected": return VPNThemeMac.accent
        case "Connecting…": return .orange
        case "Failed": return .red
        default: return .red
        }
    }
}

#Preview {
    ContentViewMac()
        .environmentObject(VPNManagerMac())
        .environmentObject(MacSubscriptionStore())
        .environmentObject(AuthSessionStore())
        .environmentObject(AppLanguageStore())
}
