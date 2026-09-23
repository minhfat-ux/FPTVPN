import SwiftUI

/// Main screen: one-tap Connect/Disconnect, live status card, location and
/// on-device diagnostics. Target flow: Open app → Choose Vietnam → Connect →
/// Connected → internet exits through Vietnam.
struct ContentView: View {
    @EnvironmentObject private var vpnManager: VPNManager
    @EnvironmentObject private var configStore: VPNConfigStore
    @EnvironmentObject private var subscriptionStore: SubscriptionStore
    @EnvironmentObject private var authStore: AuthSessionStore
    @EnvironmentObject private var languageStore: AppLanguageStore
    @State private var showingSettings = false
    @State private var showingPaywall = false
    @State private var showingLogin = false
    @State private var forcedUpdateInfo: AppVersionInfo?

    /// Bản mới CHƯA bắt buộc (latest_version > bản đang chạy nhưng minimum_version thì chưa vượt).
    /// Trước đây app chỉ có cổng CHẶN CỨNG nên khách ở build cũ KHÔNG BAO GIỜ biết có bản mới —
    /// kể cả khi server đã tăng `ios_ipa_build`/`latest_mac_version`.
    @State private var availableUpdateInfo: AppVersionInfo?

    var body: some View {
        NavigationStack {
            ZStack {
                VPNTheme.backgroundGradient
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        header

                        freeTrialBanner

                        locationCard

                        if vpnManager.state.isTransitioning {
                            HStack(spacing: 10) {
                                ProgressView()
                                    .tint(VPNTheme.accent)
                                Text(languageStore.t(.preparingPermission))
                                    .font(.footnote)
                                    .foregroundStyle(VPNTheme.secondaryLabel)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(VPNTheme.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }

                        primaryButton

                        if vpnManager.state == .failed {
                            errorBanner(vpnManager.statusMessage ?? languageStore.t(.vpnStartFailure))
                        }

                        diagnosticsCard
                        notConfiguredHint
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 10)
                    .padding(.bottom, 28)
                    .frame(maxWidth: .infinity)
                }
                .scrollIndicators(.hidden)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape.fill")
                            .foregroundStyle(VPNTheme.secondaryLabel)
                    }
                    .accessibilityLabel(languageStore.t(.configuration))
                    .disabled(vpnManager.state.isTransitioning)
                }
            }
            .sheet(isPresented: $showingSettings) {
                NavigationStack {
                    SettingsView()
                        .environmentObject(configStore)
                        .environmentObject(vpnManager)
                        .environmentObject(subscriptionStore)
                        .environmentObject(authStore)
                        .environmentObject(languageStore)
                }
            }
            .sheet(isPresented: $showingPaywall, onDismiss: {
                // Đóng paywall = thời điểm khách vừa có thể đã trả tiền trên trang web trong
                // WebView, nên đọc lại quyền ngay (best-effort, im lặng nếu lỗi/404).
                Task { await refreshEntitlementFromBackend() }
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
            .fullScreenCover(item: $forcedUpdateInfo) { info in
                ForceUpdateView(info: info)
                    .environmentObject(languageStore)
            }
            // Nhắc MỀM khi có bản mới: khách vẫn dùng được app (không phải cổng chặn cứng), nhưng
            // biết là có bản mới và cập nhật ngay bằng đúng luồng OTA của ForceUpdateView.
            .alert(
                languageStore.t(.updateRequired),
                isPresented: Binding(
                    get: { availableUpdateInfo != nil },
                    set: { if !$0 { availableUpdateInfo = nil } }
                ),
                presenting: availableUpdateInfo
            ) { info in
                Button(languageStore.t(.update)) { openUpdateLink(info) }
                Button(languageStore.t(.cancel), role: .cancel) { availableUpdateInfo = nil }
            } message: { _ in
                Text(languageStore.t(.updateRequiredDetail))
            }
        }
        // Device cap hit: show the real reason + let the user log out an old
        // device instead of a vague "Coordinator rejected this device".
        .confirmationDialog(
            vpnManager.deviceLimitMessage ?? "Device limit reached",
            isPresented: Binding(
                get: { vpnManager.deviceLimitMessage != nil },
                set: { if !$0 { vpnManager.dismissDeviceLimit() } }
            ),
            titleVisibility: .visible
        ) {
            ForEach(vpnManager.deviceLimitDevices) { device in
                Button(deviceLimitLabel(device)) {
                    Task {
                        await vpnManager.logOutDeviceAndRetry(
                            deviceId: device.id,
                            store: configStore,
                            authStore: authStore
                        )
                    }
                }
            }
            Button("Cancel", role: .cancel) { vpnManager.dismissDeviceLimit() }
        } message: {
            Text("Choose a device to log out, then VPNFlow will connect again.")
        }
        .onAppear {
            if !authStore.isSignedIn {
                showingLogin = true
            } else {
                syncBackendPremium()
            }
        }
        .onChange(of: authStore.session) { _, _ in
            syncBackendPremium()
        }
        .onChange(of: authStore.isSignedIn) { _, isSignedIn in
            if isSignedIn {
                showingLogin = false
                // Vừa đăng nhập: đồng bộ quyền từ backend (best-effort).
                Task { await refreshEntitlementFromBackend() }
            } else {
                showingSettings = false
                showingLogin = true
            }
        }
        .task {
            vpnManager.refreshStatus()
            // Quyền Premium có thể được cấp trên web SAU lần đăng nhập cuối, còn session chỉ
            // được cấp lúc đăng nhập — nên đọc lại ngay khi mở app (nút Connect bị khoá theo
            // `isSubscribed`). Chạy SONG SONG với fetchNodes để mạng chậm không làm chậm việc
            // mở khoá Connect hay cổng force-update. Best-effort: lỗi thì im lặng, giữ quyền.
            async let entitlementRefresh: Void = refreshEntitlementFromBackend()
            // Backend-first server selection (SRS A8): load exit nodes from the
            // coordinator before enabling Connect; never rely on hardcoded presets
            // in production.
            await vpnManager.fetchNodes(store: configStore)
            await entitlementRefresh
            // Force-update gate: if the backend requires a newer build, block usage.
            if let baseURL = configStore.controlPlaneBaseURL,
               let info = try? await AppVersionService.fetch(from: baseURL) {
                if AppVersionService.isForcedUpdate(info) {
                    forcedUpdateInfo = info
                } else if AppVersionService.isUpdateAvailable(info) {
                    // Có bản mới nhưng chưa bắt buộc ⇒ NHẮC. Trước đây nhánh này không tồn tại nên
                    // khách ở build cũ im lặng mãi; server có tăng `ios_ipa_build` cũng vô ích.
                    availableUpdateInfo = info
                }
            }
        }
    }

    /// Mở link cập nhật cho nhắc mềm — CÙNG logic với `ForceUpdateView` (ưu tiên OTA
    /// `itms-services` để cài ngay trong app, không có manifest thì mở link tải trên web).
    private func openUpdateLink(_ info: AppVersionInfo) {
        if let ota = info.otaInstallURL, UIApplication.shared.canOpenURL(ota) {
            UIApplication.shared.open(ota)
            return
        }
        let raw = info.downloadURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: raw) {
            UIApplication.shared.open(url)
        } else {
            // `webURL` KHÔNG trả optional — không dùng `if let` ở đây.
            UIApplication.shared.open(ControlAPIHosts.webURL("buy"))
        }
    }

    private func deviceLimitLabel(_ device: CoordinatorDevice) -> String {
        let name = device.name?.isEmpty == false ? device.name! : device.device_id
        let platform = device.platform?.isEmpty == false ? " · \(device.platform!)" : ""
        return "\(name)\(platform)"
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
        guard authStore.isSignedIn, let baseURL = configStore.controlPlaneBaseURL else { return }
        await subscriptionStore.refreshEntitlement(
            baseURL: baseURL,
            authStore: authStore,
            reportFailure: false
        )
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 6) {
            ZStack(alignment: .topLeading) {
                Image("AppLogo")
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
                    .fill(vpnManager.state.tint)
                    .frame(width: 8, height: 8)
                Text(vpnManager.state.localizedLabel(languageStore.language))
                    .font(.caption)
                    .foregroundStyle(vpnManager.state.tint)
            }

            // Màu đã nằm trong brandName (VPN trắng + Flow xanh brand); đừng đặt
            // .foregroundStyle ở ngoài vì nó sẽ đè màu từng đoạn.
            VPNTheme.brandName
                .font(.title.bold())
            Text(languageStore.t(.appSubtitle))
                .font(.subheadline)
                .foregroundStyle(VPNTheme.secondaryLabel)
        }
        .padding(.top, 14)
    }

    // MARK: - Status card (real state from VPNState, color + SF Symbol)

    private var statusCard: some View {
        VStack(spacing: 14) {
            HStack(spacing: 8) {
                if vpnManager.state.isTransitioning {
                    ProgressView()
                        .tint(vpnManager.state.tint)
                }
                Text(vpnManager.state.localizedLabel(languageStore.language))
                    .font(.title2.bold())
                    .foregroundStyle(VPNTheme.label)
            }

            Text(vpnManager.state.localizedSubtitle(languageStore.language))
                .font(.subheadline)
                .foregroundStyle(VPNTheme.secondaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 26)
        .padding(.horizontal, 20)
        .background(VPNTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(VPNTheme.cardStroke, lineWidth: 1)
        )
        .animation(.easeInOut(duration: 0.25), value: vpnManager.state)
    }

    // MARK: - Location

    private var locationCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.title3)
                    .foregroundStyle(VPNTheme.accent)

                Text(languageStore.t(.serverLocation))
                    .font(.headline)
                    .foregroundStyle(VPNTheme.label)

                Spacer()

                Button {
                    Task { await vpnManager.fetchNodes(store: configStore) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
                .foregroundStyle(VPNTheme.secondaryLabel)
                .disabled(vpnManager.state.isTransitioning)
                .accessibilityLabel(languageStore.t(.refreshLocations))
            }

            let nodes = configStore.availableNodes
            if nodes.isEmpty {
                Text(languageStore.t(.noServerAvailable))
                    .font(.subheadline)
                    .foregroundStyle(VPNTheme.secondaryLabel)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                // List view: tối đa 5 server hiển thị, cuộn được. Mỗi dòng có
                // nút Select để chọn server; bấm Connect (nút lớn) để kết nối.
                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(nodes) { node in
                            serverRow(node)
                        }
                    }
                    .padding(2)
                }
                .frame(height: min(CGFloat(nodes.count), 5) * 44)
                .scrollIndicators(.visible)

                if configStore.usingFallbackNodes {
                    Text(languageStore.t(.usingSavedServers))
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(16)
        .background(VPNTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(VPNTheme.cardStroke, lineWidth: 1)
        )
    }

    /// Một dòng server: CHẠM VÀO CẢ DÒNG là chọn, giống Android
    /// (`MainScreen.kt`: `.clickable(enabled = !busy, onClick = onSelect)`).
    ///
    /// Trước đây chỉ chữ "Select" ở cuối dòng là Button, nên chạm vào tên server
    /// không có tác dụng gì — khác hẳn Android và rất dễ tưởng app bị treo. Nay
    /// bọc cả dòng trong Button + contentShape để toàn bộ khối chữ nhật là vùng
    /// chạm, và bỏ hẳn nút "Select" (đã dùng chung một hành vi với Android).
    private func serverRow(_ node: ExitNode) -> some View {
        let isSelected = configStore.selectedNodeID == node.id
        let busy = vpnManager.state.isTransitioning

        return Button {
            selectNode(id: node.id)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? VPNTheme.accent : VPNTheme.tertiaryLabel)

                Text(serverTitle(for: node))
                    .font(.subheadline)
                    .lineLimit(1)
                    // Chữ của dòng được chọn là trắng đủ; dòng không chọn mờ đi.
                    .foregroundStyle(isSelected ? VPNTheme.label : VPNTheme.secondaryLabel)

                Spacer(minLength: 8)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 6)
            // Dòng ĐƯỢC CHỌN phải là dòng SÁNG nhất.
            //
            // Trước đây dòng được chọn chỉ `accent` 15%, còn dòng không chọn dùng
            // `Color(uiColor: .tertiarySystemFill)` — app này LUÔN ở dark mode
            // (PrivateVPNApp: `.preferredColorScheme(.dark)`), nên màu đó là xám
            // ~24%: SÁNG HƠN cả dòng được chọn => nhìn như bị ngược.
            //
            // Cũng bỏ luôn màu theo hệ thống ở đây: app ép theme navy tối cố định
            // thì không nên trộn màu semantic của UIKit vào giữa.
            .background(isSelected ? VPNTheme.accent.opacity(0.35) : Color.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            // Cả khối là vùng chạm, không chỉ phần có nội dung (khoảng trống giữa
            // tên server và mép phải cũng phải ăn).
            .contentShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func selectNode(id: String) {
        configStore.selectedNodeID = id
        if let node = configStore.availableNodes.first(where: { $0.id == id }) {
            configStore.serverEndpoint = node.endpoint
            configStore.serverPublicKey = node.public_key
        }
    }

    private func serverTitle(for node: ExitNode) -> String {
        "\(flagEmoji(for: node.country)) \(node.city), \(countryName(node.country)) · \(node.name)"
    }

    /// Dòng phụ của thẻ Subscription: chưa mua ⇒ "chọn gói để bắt đầu"; đã mua ⇒
    /// "3 Months · Hết hạn 13/12/2026 · Còn 27 ngày" (gói vĩnh viễn thì không có hạn).
    private var subscriptionSubtitle: String {
        guard subscriptionStore.isSubscribed else {
            return languageStore.t(.choosePlanToStart)
        }
        var parts: [String] = []
        let plan = subscriptionStore.activePlanName
        if !plan.isEmpty { parts.append(plan) }
        if let expiry = subscriptionStore.planExpiresAt {
            parts.append(String(
                format: languageStore.t(.expiresOn),
                expiry.formatted(date: .abbreviated, time: .omitted)
            ))
            if let days = subscriptionStore.planDaysLeft, days <= 30 {
                parts.append(String(format: languageStore.t(.daysLeft), days))
            }
        } else {
            parts.append(languageStore.t(.protectionUnlocked))
        }
        return parts.joined(separator: " · ")
    }

    private var subscriptionStatusCard: some View {
        HStack(spacing: 14) {
            Image(systemName: subscriptionStore.isSubscribed ? "checkmark.seal.fill" : "lock.shield.fill")
                .font(.title3)
                .foregroundStyle(subscriptionStore.isSubscribed ? VPNTheme.accent : .orange)

            VStack(alignment: .leading, spacing: 3) {
                Text(subscriptionStore.isSubscribed ? languageStore.t(.premiumActive) : languageStore.t(.premiumRequired))
                    .font(.headline)
                    .foregroundStyle(VPNTheme.label)
                // Đã mua gói ⇒ hiện ĐÚNG gói khách đang dùng + ngày hết hạn + số ngày còn lại
                // (nút bên cạnh đổi thành "Gia hạn"). Chưa mua ⇒ mời chọn gói như trước.
                Text(subscriptionSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(VPNTheme.secondaryLabel)
            }

            Spacer()

            // Luôn có nút: chưa mua ⇒ "Nâng cấp" (bán gói); đã mua ⇒ "Gia hạn"
            // (paywall để gia hạn hoặc mua thêm) — đúng yêu cầu chủ shop.
            Button {
                showingPaywall = true
            } label: {
                Text(languageStore.t(subscriptionStore.isSubscribed ? .renew : .upgrade))
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(VPNTheme.accent)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(VPNTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(VPNTheme.cardStroke, lineWidth: 1)
        )
    }

    /// Banner bản dùng thử 1 ngày miễn phí. Backend chỉ trả `is_trial = true` khi tài khoản
    /// đang chạy gói `trial.*`, nên có cờ này là biết chắc khách đang dùng thử — nói rõ còn
    /// bao nhiêu giờ và cho đường mua ngay, thay vì để trial hết rồi Connect bị chặn im lặng.
    @ViewBuilder
    private var freeTrialBanner: some View {
        if subscriptionStore.isOnFreeTrial {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(languageStore.t(.freeTrialTitle))
                        .font(.headline)
                        .foregroundStyle(VPNTheme.label)
                    // `%d` + String(format:) theo đúng convention của `.devCode` trong Theme.swift.
                    Text(String(format: languageStore.t(.freeTrialBody), subscriptionStore.trialHoursLeft ?? 0))
                        .font(.subheadline)
                        .foregroundStyle(VPNTheme.secondaryLabel)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                // Mở đúng paywall sẵn có (trang web /buy qua PaywallView) — không hardcode URL mới.
                Button {
                    showingPaywall = true
                } label: {
                    Text(languageStore.t(.upgrade))
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(VPNTheme.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VPNTheme.accent.opacity(0.18))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(VPNTheme.accent.opacity(0.45), lineWidth: 1)
            )
        }
    }

    // MARK: - Single one-tap primary button (NFR-UX-001 / AC-022)

    private var primaryButton: some View {
        Button(action: handlePrimaryTap) {
            ZStack {
                Circle()
                    // Chỉ làm mờ NỀN khi nút bị khoá, giống Android
                    // (`MainScreen.kt`: `color.copy(alpha = if (disabled) 0.45f else 1f)`
                    // đặt trên background, không phải trên cả nút).
                    //
                    // Trước đây iOS đặt `.opacity(...)` lên cả Button nên vòng xoay
                    // trắng cũng bị mờ theo, trong khi Android giữ vòng xoay trắng rõ
                    // trên nền cam đã mờ. Nhìn vào tưởng iOS không hiện trạng thái
                    // "đang kết nối".
                    .fill(primaryButtonColor.opacity(primaryButtonDisabled ? 0.45 : 1))
                    .frame(width: 132, height: 132)
                    .shadow(color: primaryButtonColor.opacity(0.45), radius: 22, y: 10)
                Circle()
                    .stroke(.white.opacity(0.22), lineWidth: 1)
                    .frame(width: 132, height: 132)
                if vpnManager.state.isTransitioning {
                    ProgressView()
                        .controlSize(.large)
                        .tint(.white)
                } else {
                    Image(systemName: "power")
                        .font(.system(size: 44, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(primaryButtonDisabled)
        .animation(.easeInOut(duration: 0.25), value: vpnManager.state)
        .accessibilityHint(vpnManager.state.canConnect
                           ? languageStore.t(.startVPNHint)
                           : languageStore.t(.stopVPNHint))
    }

    private var primaryButtonColor: Color {
        switch vpnManager.state {
        case .connected:
            return VPNTheme.success
        case .connecting, .disconnecting:
            return .orange
        case .disconnected, .failed:
            return .red
        }
    }

    /// Giống hệt Android (`MainScreen.kt` PowerButton): CHỈ khoá khi đang chuyển
    /// trạng thái. Ở disconnected/failed thì luôn bấm được, kể cả khi chưa cấu
    /// hình, vì control plane sẽ tự cấp cấu hình lúc bấm (Android ghi rõ: "always
    /// allow: control plane provisions").
    ///
    /// Trước đây iOS khoá nút khi `!isConfigured && !hasControlPlane` nên chạm vào
    /// không có phản ứng gì — một trong những lý do nút Connect "khác Android".
    private var primaryButtonDisabled: Bool {
        switch vpnManager.state {
        case .disconnecting, .connecting:
            return true
        case .connected, .disconnected, .failed:
            return false
        }
    }

    private func handlePrimaryTap() {
        if vpnManager.state.canDisconnect {
            vpnManager.disconnect()
        } else if !subscriptionStore.isSubscribed {
            showingPaywall = true
        } else if !authStore.isSignedIn {
            showingLogin = true
        } else {
            Task {
                await vpnManager.connect(store: configStore, authStore: authStore)
            }
        }
    }

    // MARK: - Diagnostics (FR-DIAG-001 / AC-014: on-device, no secrets)

    private var diagnosticsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(languageStore.t(.diagnostics), systemImage: "waveform.path.ecg")
                .font(.headline)
                .foregroundStyle(VPNTheme.label)

            Divider().overlay(VPNTheme.cardStroke)

            diagRow(title: languageStore.t(.state), value: vpnManager.state.localizedLabel(languageStore.language), valueColor: vpnManager.state.tint)
            diagRow(title: languageStore.t(.location), value: nodeDisplay, valueColor: VPNTheme.secondaryLabel)
            if let statusMessage = vpnManager.statusMessage {
                diagRow(title: languageStore.t(.message), value: statusMessage, valueColor: VPNTheme.secondaryLabel)
            }
            // A10 §2g — số live 1s của đường đang chạy (KHÔNG thêm thẻ mới, dùng thẻ Diagnostics
            // có sẵn). Tunnel chưa phục vụ ⇒ `—`, không hiện `0`.
            Divider().overlay(VPNTheme.cardStroke)
            liveDiagnosticsRows
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VPNTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(VPNTheme.cardStroke, lineWidth: 1)
        )
    }

    private func diagRow(title: String, value: String, valueColor: Color) -> some View {
        HStack(alignment: .top) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(VPNTheme.secondaryLabel)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline.monospaced())
                .foregroundStyle(valueColor)
                .multilineTextAlignment(.trailing)
        }
    }

    // MARK: - A10 §2g: số live của đường đang chạy

    /// Các dòng bắt buộc của §2g. Nguồn số: extension lấy mẫu mỗi 1s (`TunnelStatusReport`),
    /// app chỉ đọc lại — KHÔNG đo thêm, không thêm pin.
    @ViewBuilder
    private var liveDiagnosticsRows: some View {
        let report = vpnManager.liveDiagnostics
        diagRow(
            title: languageStore.t(.diagDown),
            value: RampStatus.formatRate(report?.downKbps),
            valueColor: VPNTheme.label
        )
        diagRow(
            title: languageStore.t(.diagUp),
            value: RampStatus.formatRate(report?.upKbps),
            valueColor: VPNTheme.label
        )
        // A10 §2g — "Đỉnh phiên": đỉnh của trung bình trượt goodput trong CẢ phiên
        // (`BandwidthControl.peakDownKbps`). Đây là con số nói lên sức đường đã đạt, KHÔNG tụt
        // về "—" khi khách mở thẻ lúc tunnel rảnh (khác hai dòng "Đang truyền" ở trên).
        diagRow(
            title: languageStore.t(.diagPeakDown),
            value: RampStatus.formatRate(report?.peakDownKbps),
            valueColor: VPNTheme.label
        )
        diagRow(
            title: languageStore.t(.diagObserved),
            value: RampStatus.formatRate(report?.observedKbps),
            valueColor: VPNTheme.secondaryLabel
        )
        diagRow(
            title: languageStore.t(.diagDeclared),
            value: declaredText(report),
            valueColor: VPNTheme.secondaryLabel
        )
        diagRow(
            title: languageStore.t(.diagMore),
            value: moreText(report),
            valueColor: report?.atMax == true ? VPNTheme.label : VPNTheme.secondaryLabel
        )
        if report?.atMax == true {
            diagRow(
                title: languageStore.t(.diagAtMax),
                value: "✓",
                valueColor: VPNTheme.label
            )
        }
        diagRow(
            title: languageStore.t(.diagPath),
            value: pathText(report),
            valueColor: VPNTheme.secondaryLabel
        )
        diagRow(
            title: languageStore.t(.diagStable),
            value: RampStatus.formatRate(report?.stableKbps),
            valueColor: VPNTheme.secondaryLabel
        )
    }

    /// "Khai báo hiện tại" — số Brutal CC đang khai, hai chiều (↓/↑).
    private func declaredText(_ report: TunnelStatusReport?) -> String {
        guard let report else { return "—" }
        let down = RampStatus.formatRate(report.declaredDownKbps)
        let up = RampStatus.formatRate(report.declaredUpKbps)
        guard down != "—" || up != "—" else { return "—" }
        return "↓ \(down) / ↑ \(up)"
    }

    /// "Khai báo còn lên được" = `+X%`; đã tối đa ⇒ nói thẳng "Đã tối đa ở thời điểm này".
    private func moreText(_ report: TunnelStatusReport?) -> String {
        guard let report, report.serving == true else { return "—" }
        if report.atMax == true { return languageStore.t(.diagAtMax) }
        if let more = report.morePercent { return "+\(more)%" }
        return "—"
    }

    /// "Đường đang dùng" = transport + node.
    private func pathText(_ report: TunnelStatusReport?) -> String {
        guard let report else { return "—" }
        let node = report.node.map { " · \($0)" } ?? ""
        switch report.transport {
        case "ws-relay": return "Cầu WS\(node)"
        case "relay": return "TCP relay\(node)"
        case "direct": return "Trực tiếp QUIC\(node)"
        default: return "\(report.transport)\(node)"
        }
    }

    private var nodeDisplay: String {
        if let loc = configStore.selectedLocation {
            return loc.name
        }
        if let node = configStore.selectedRemoteNode {
            return "\(node.city), \(countryName(node.country))"
        }
        return languageStore.t(.vietnam)
    }

    // MARK: - Helpers

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            Text(message)
                .font(.footnote)
                .foregroundStyle(VPNTheme.label)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(Color.red.opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.red.opacity(0.35), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var notConfiguredHint: some View {
        if !configStore.isConfigured && !configStore.hasControlPlane && vpnManager.state != .connected {
            Button {
                showingSettings = true
            } label: {
                Label(languageStore.t(.notConfigured), systemImage: "gearshape")
                    .font(.footnote)
                    .foregroundStyle(VPNTheme.secondaryLabel)
            }
        }
    }

    private func countryName(_ code: String) -> String {
        code == "VN" ? languageStore.t(.vietnam) : code
    }

    /// ISO 3166-1 alpha-2 country code → regional indicator flag emoji.
    private func flagEmoji(for countryCode: String) -> String {
        let base: UInt32 = 127397
        return countryCode.uppercased().unicodeScalars.reduce(into: "") { result, scalar in
            if let flag = UnicodeScalar(base + scalar.value) {
                result.unicodeScalars.append(flag)
            }
        }
    }
}

#if DEBUG
#Preview {
    ContentView()
        .environmentObject(VPNManager())
        .environmentObject(VPNConfigStore())
        .environmentObject(SubscriptionStore())
        .environmentObject(AuthSessionStore())
        .environmentObject(AppLanguageStore())
}
#endif
