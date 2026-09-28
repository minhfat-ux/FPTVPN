import AppKit
import SwiftUI

/// Main screen (macOS): bố cục giống hệt bản iOS (`ContentView.swift`) — cùng
/// thứ tự thành phần, màu, bo góc, khoảng cách. Khác desktop: dùng ScrollView +
/// kích thước cửa sổ co giãn được thay cho màn hình điện thoại.
struct ContentViewMac: View {
    @EnvironmentObject private var vpnManager: VPNManagerMac
    @EnvironmentObject private var subscriptionStore: MacSubscriptionStore
    @EnvironmentObject private var authStore: AuthSessionStore
    @EnvironmentObject private var languageStore: AppLanguageStore
    @State private var showingPaywall = false
    @State private var showingLogin = false
    @State private var showingSettings = false
    @State private var forcedUpdateInfo: AppVersionInfo?

    /// Bản mới CHƯA bắt buộc (`latest_version` > bản đang chạy nhưng chưa vượt `minimum_version`).
    /// macOS trước đây CHỈ có cổng chặn cứng ⇒ khách Mac không bao giờ biết có bản mới, dù
    /// `latest_mac_version` đã tăng. Xem `AppVersionService.isUpdateAvailable`.
    @State private var availableUpdateInfo: AppVersionInfo?

    var body: some View {
        ZStack {
            VPNThemeMac.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    header

                    freeTrialBanner

                    locationCard

                    networkConflictBanner

                    if vpnManager.state.vpnIsTransitioning {
                        transitioningBanner
                    }

                    primaryButton

                    if vpnManager.state == "Failed" {
                        errorBanner(vpnManager.lastError ?? languageStore.t(.vpnStartFailure))
                    }

                    diagnosticsCard
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 28)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
        }
        .frame(minWidth: 390, minHeight: 620)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingSettings = true
                } label: {
                    Image(systemName: "gearshape.fill")
                        .foregroundStyle(VPNThemeMac.secondaryLabel)
                }
                .help(languageStore.t(.configuration))
                .disabled(vpnManager.state.vpnIsTransitioning)
            }
        }
        .sheet(item: $forcedUpdateInfo) { info in
            ForceUpdateViewMac(info: info)
                .environmentObject(languageStore)
        }
        // Nhắc mềm: khách vẫn dùng được app, chỉ được báo là có bản mới và mở đúng link tải mac
        // (`store_url` trong payload macOS = /v1/downloads/mac).
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
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                SettingsViewMac()
                    .environmentObject(vpnManager)
                    .environmentObject(subscriptionStore)
                    .environmentObject(authStore)
                    .environmentObject(languageStore)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button(languageStore.t(.done)) { showingSettings = false }
                        }
                    }
            }
        }
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
        // Xung đột mạng mức Blocking: hộp thoại nêu TÊN app VPN/mạng đang tranh chấp + hướng dẫn tắt
        // đi rồi bấm Kết nối lại (khách vẫn có đường "Vẫn kết nối" nếu chủ động muốn thử).
        .alert(
            vpnManager.blockingConflict?.localizedTitle(languageStore.language)
                ?? languageStore.t(.conflictBlockingTitle),
            isPresented: Binding(
                get: { vpnManager.blockingConflict != nil },
                set: { if !$0 { vpnManager.dismissBlockingConflict() } }
            ),
            presenting: vpnManager.blockingConflict
        ) { _ in
            Button(languageStore.t(.conflictConnectAnyway)) {
                Task { await vpnManager.connectDespiteConflict(authStore: authStore) }
            }
            // "Không nhắc lại": lưu tình trạng vào UserDefaults ⇒ không hiện lại hộp thoại/băng-rôn cho
            // ĐÚNG tình trạng này nữa (kể cả sau khi mở lại app), và lần Connect sau không bị chặn.
            Button(languageStore.t(.conflictDontRemind)) { vpnManager.muteCurrentConflict() }
            Button(languageStore.t(.cancel), role: .cancel) { vpnManager.dismissBlockingConflict() }
        } message: { conflict in
            Text(
                conflict.localizedDetail(languageStore.language)
                    + "\n\n" + conflict.localizedAdvice(languageStore.language)
            )
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
            // Kèm NHẮC MỀM khi có bản mới nhưng chưa bắt buộc — trước đây chỉ có cổng chặn cứng
            // nên khách Mac ở bản cũ không bao giờ được thông báo (xem `latest_mac_version`).
            if let url = URL(string: vpnManager.coordinatorURL),
               let info = try? await AppVersionService.fetch(from: url) {
                if AppVersionService.isForcedUpdate(info) {
                    forcedUpdateInfo = info
                } else if AppVersionService.isUpdateAvailable(info) {
                    availableUpdateInfo = info
                }
            }
        }
    }

    /// Mở link cập nhật cho nhắc mềm — CÙNG logic với `ForceUpdateViewMac` (mở `store_url`, tức
    /// `/v1/downloads/mac`; rỗng thì lùi về trang mua/tải, không để nút bấm không mở gì).
    private func openUpdateLink(_ info: AppVersionInfo) {
        let raw = info.downloadURL.trimmingCharacters(in: .whitespacesAndNewlines)
        // `webURL` KHÔNG trả optional ⇒ `??` cho ra URL (không phải URL?) — không dùng `if let`.
        let url = URL(string: raw) ?? ControlAPIHosts.webURL("buy")
        NSWorkspace.shared.open(url)
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

    // MARK: - Header

    private var header: some View {
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
                    .fill(vpnManager.state.vpnStateTint)
                    .frame(width: 8, height: 8)
                Text(vpnManager.state.localizedVPNState(languageStore.language))
                    .font(.caption)
                    .foregroundStyle(vpnManager.state.vpnStateTint)
            }

            // Màu đã nằm trong brandName (VPN trắng + Flow xanh brand); đừng đặt
            // .foregroundStyle ở ngoài vì nó sẽ đè màu từng đoạn.
            VPNThemeMac.brandName
                .font(.title.bold())
            Text(languageStore.t(.appSubtitle))
                .font(.subheadline)
                .foregroundStyle(VPNThemeMac.secondaryLabel)
        }
        .padding(.top, 14)
    }

    // MARK: - Free trial banner

    /// Banner bản dùng thử 1 ngày miễn phí — giống bố cục iOS: nền accent mờ, nút
    /// "Nâng cấp" mở đúng paywall web sẵn có (`MacPaywallView` → trang /buy).
    @ViewBuilder
    private var freeTrialBanner: some View {
        if subscriptionStore.isOnFreeTrial {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(languageStore.t(.trialBannerTitle))
                        .font(.headline)
                        .foregroundStyle(VPNThemeMac.label)
                    // `%@` + String(format:) theo convention có sẵn của mac (khác `%d` bản iOS).
                    Text(String(
                        format: languageStore.t(.trialBannerSubtitle),
                        String(subscriptionStore.trialHoursLeft ?? 0)
                    ))
                        .font(.subheadline)
                        .foregroundStyle(VPNThemeMac.secondaryLabel)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    showingPaywall = true
                } label: {
                    Text(languageStore.t(.upgrade))
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(VPNThemeMac.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VPNThemeMac.accent.opacity(0.18))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(VPNThemeMac.accent.opacity(0.45), lineWidth: 1)
            )
        }
    }

    // MARK: - Location

    private var locationCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.title3)
                    .foregroundStyle(VPNThemeMac.accent)

                Text(languageStore.t(.serverLocation))
                    .font(.headline)
                    .foregroundStyle(VPNThemeMac.label)

                Spacer()

                Button {
                    Task { await vpnManager.refreshNodes() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
                .foregroundStyle(VPNThemeMac.secondaryLabel)
                .disabled(vpnManager.isRefreshingNodes || vpnManager.state.vpnIsTransitioning)
                .help(languageStore.t(.refreshLocations))
            }

            if vpnManager.exitNodes.isEmpty {
                Text(languageStore.t(.noServerAvailable))
                    .font(.subheadline)
                    .foregroundStyle(VPNThemeMac.secondaryLabel)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                // List view: tối đa 5 server hiển thị, cuộn được. Mỗi dòng chọn server;
                // bấm Connect (nút lớn) để kết nối — giống iOS/Android.
                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(vpnManager.exitNodes) { node in
                            serverRow(node)
                        }
                    }
                    .padding(2)
                }
                .frame(height: min(CGFloat(vpnManager.exitNodes.count), 5) * 44)
                .scrollIndicators(.visible)

                if vpnManager.usingFallbackNodes {
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

    /// Một dòng server: chạm cả dòng là chọn (giống iOS `serverRow`), không connect.
    private func serverRow(_ node: ExitNode) -> some View {
        let isSelected = vpnManager.selectedNodeID == node.id
        let busy = vpnManager.state.vpnIsTransitioning

        return Button {
            vpnManager.selectedNodeID = node.id
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? VPNThemeMac.accent : VPNThemeMac.tertiaryLabel)

                Text(serverTitle(for: node))
                    .font(.subheadline)
                    .lineLimit(1)
                    .foregroundStyle(isSelected ? VPNThemeMac.label : VPNThemeMac.secondaryLabel)

                Spacer(minLength: 8)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 6)
            .background(isSelected ? VPNThemeMac.accent.opacity(0.35) : Color.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .contentShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    // MARK: - Xung đột mạng (app VPN/mạng khác đang tranh chấp)

    /// Cảnh báo NHẸ (mức Warning — tunnel app khác đang bật mà không giữ đường mặc định, DNS không trả
    /// lời trong lúc tunnel Connected, MagicDNS…): VẪN cho kết nối, chỉ nêu tên app/dấu hiệu. Mức
    /// **Info im lặng** (chỉ thẻ Diagnostics), mức Blocking đã có hộp thoại riêng ở `VPNManagerMac`.
    ///
    /// Băng-rôn chỉ được đặt khi tình trạng ĐỔI hoặc khi khách bấm Connect (`visibleWarningConflict`) —
    /// không hiện lại mỗi lần mở app, và có nút "Không nhắc lại" (lưu `UserDefaults`).
    @ViewBuilder
    private var networkConflictBanner: some View {
        if let warning = vpnManager.visibleWarningConflict {
            VStack(alignment: .leading, spacing: 6) {
                Label(warning.localizedTitle(languageStore.language), systemImage: "exclamationmark.triangle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.orange)
                Text(warning.localizedDetail(languageStore.language))
                    .font(.footnote)
                    .foregroundStyle(VPNThemeMac.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
                Text(warning.localizedAdvice(languageStore.language))
                    .font(.footnote)
                    .foregroundStyle(VPNThemeMac.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
                Button(languageStore.t(.conflictDontRemind)) {
                    vpnManager.muteCurrentConflict()
                }
                .buttonStyle(.plain)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(VPNThemeMac.accent)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.orange.opacity(0.45), lineWidth: 1)
            )
        }
    }

    // MARK: - Transitioning banner
    private var transitioningBanner: some View {
        HStack(spacing: 10) {
            ProgressView()
                .tint(VPNThemeMac.accent)
            Text(languageStore.t(.preparingPermission))
                .font(.footnote)
                .foregroundStyle(VPNThemeMac.secondaryLabel)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(VPNThemeMac.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: - Single one-tap primary button

    private var primaryButton: some View {
        Button(action: handlePrimaryTap) {
            ZStack {
                Circle()
                    // Chỉ làm mờ NỀN khi nút bị khoá, giống iOS/Android.
                    .fill(primaryButtonColor.opacity(primaryButtonDisabled ? 0.45 : 1))
                    .frame(width: 132, height: 132)
                    .shadow(color: primaryButtonColor.opacity(0.45), radius: 22, y: 10)
                Circle()
                    .stroke(.white.opacity(0.22), lineWidth: 1)
                    .frame(width: 132, height: 132)
                if vpnManager.state.vpnIsTransitioning {
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
        .help(vpnManager.state.vpnCanConnect
              ? languageStore.t(.startVPNHint)
              : languageStore.t(.stopVPNHint))
    }

    private var primaryButtonColor: Color {
        switch vpnManager.state {
        case "Connected":
            return VPNThemeMac.success
        case "Connecting…", "Disconnecting…":
            return .orange
        default:
            return .red
        }
    }

    /// Giống iOS/Android: CHỈ khoá khi đang chuyển trạng thái; ở disconnected/failed
    /// luôn bấm được để control plane tự cấp cấu hình lúc bấm.
    private var primaryButtonDisabled: Bool {
        vpnManager.state.vpnIsTransitioning
    }

    private func handlePrimaryTap() {
        if vpnManager.state.vpnCanDisconnect {
            vpnManager.disconnect()
        } else if !subscriptionStore.isSubscribed {
            showingPaywall = true
        } else if !authStore.isSignedIn {
            showingLogin = true
        } else {
            Task { await vpnManager.connect(authStore: authStore) }
        }
    }

    // MARK: - Diagnostics

    private var diagnosticsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(languageStore.t(.diagnostics), systemImage: "waveform.path.ecg")
                .font(.headline)
                .foregroundStyle(VPNThemeMac.label)

            Divider().overlay(VPNThemeMac.cardStroke)

            diagRow(
                title: languageStore.t(.state),
                value: vpnManager.state.localizedVPNState(languageStore.language),
                valueColor: vpnManager.state.vpnStateTint
            )
            diagRow(title: languageStore.t(.location), value: nodeDisplay, valueColor: VPNThemeMac.secondaryLabel)
            if let lastError = vpnManager.lastError, !lastError.isEmpty {
                diagRow(title: languageStore.t(.message), value: lastError, valueColor: VPNThemeMac.secondaryLabel)
            }
            // A10 §2g — số live của đường đang chạy (KHÔNG thêm thẻ mới, dùng thẻ Diagnostics có
            // sẵn). Tunnel chưa phục vụ ⇒ `—`, không hiện `0` (§2g luật 1).
            if let stale = vpnManager.extensionStaleWarning {
                // Cảnh báo rõ: hệ thống đang chạy extension KHÁC bản với app này (macOS phân giải
                // theo LaunchServices nên có thể dùng lại appex của một bản VPNFlow cũ).
                let appBuild = "\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?")/"
                    + "\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?")"
                Text(String(format: languageStore.t(.extensionStale), stale, appBuild))
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Divider().overlay(VPNThemeMac.cardStroke)
            networkConflictDiagnosticsRows
            Divider().overlay(VPNThemeMac.cardStroke)
            liveDiagnosticsRows
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VPNThemeMac.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
        )
    }

    private func diagRow(title: String, value: String, valueColor: Color) -> some View {
        HStack(alignment: .top) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(VPNThemeMac.secondaryLabel)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline.monospaced())
                .foregroundStyle(valueColor)
                .multilineTextAlignment(.trailing)
        }
    }

    // MARK: - Xung đột mạng trong thẻ Diagnostics

    /// Mục "Xung đột mạng" của thẻ Diagnostics — khách/support thấy ngay app nào đang tranh chấp,
    /// kèm dấu hiệu cụ thể (interface tunnel đang giữ default route, proxy, DNS…).
    ///
    /// Nhãn mức (`Blocking`/`Warning`/`Info`) giữ tiếng Anh có chủ ý: đó là từ khoá support grep
    /// trong log, không phải câu chữ cho khách.
    private var networkConflictDiagnosticsRows: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(languageStore.t(.conflictDiagnostics))
                .font(.subheadline)
                .foregroundStyle(VPNThemeMac.secondaryLabel)

            if vpnManager.networkConflicts.isEmpty {
                Text(languageStore.t(.conflictNone))
                    .font(.footnote)
                    .foregroundStyle(VPNThemeMac.success)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ForEach(vpnManager.networkConflicts) { conflict in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(conflict.severity.label)
                                .font(.caption2.monospaced())
                                .foregroundStyle(conflictSeverityColor(conflict.severity))
                            Text(conflict.localizedTitle(languageStore.language))
                                .font(.footnote)
                                .foregroundStyle(VPNThemeMac.label)
                        }
                        Text(conflict.localizedDetail(languageStore.language))
                            .font(.caption)
                            .foregroundStyle(VPNThemeMac.secondaryLabel)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func conflictSeverityColor(_ severity: NetworkConflictSeverity) -> Color {
        switch severity {
        case .blocking: return .red
        case .warning: return .orange
        case .info: return VPNThemeMac.tertiaryLabel
        }
    }

    // MARK: - A10 §2g: số live của đường đang chạy

    /// Các dòng bắt buộc của §2g — **bê nguyên thứ tự + cách hiển thị của iOS**
    /// (`iOS/PrivateVPN/ContentView.swift` `liveDiagnosticsRows`) để hai nền tảng nhìn giống nhau.
    ///
    /// Nguồn số: extension lấy mẫu mỗi 1 s, app đọc lại qua `sendProviderMessage`
    /// (`VPNManagerMac.probeProviderDiagnostics`, nhịp 2 s) — KHÔNG đo thêm, không thêm pin.
    @ViewBuilder
    private var liveDiagnosticsRows: some View {
        let report = vpnManager.liveDiagnostics
        diagRow(
            title: languageStore.t(.diagDown),
            value: RampStatus.formatRate(report?.downKbps),
            valueColor: VPNThemeMac.label
        )
        diagRow(
            title: languageStore.t(.diagUp),
            value: RampStatus.formatRate(report?.upKbps),
            valueColor: VPNThemeMac.label
        )
        diagRow(
            title: languageStore.t(.diagObserved),
            value: RampStatus.formatRate(report?.observedKbps),
            valueColor: VPNThemeMac.secondaryLabel
        )
        diagRow(
            title: languageStore.t(.diagDeclared),
            value: declaredText(report),
            valueColor: VPNThemeMac.secondaryLabel
        )
        diagRow(
            title: languageStore.t(.diagMore),
            value: moreText(report),
            valueColor: report?.atMax == true ? VPNThemeMac.label : VPNThemeMac.secondaryLabel
        )
        if report?.atMax == true {
            diagRow(
                title: languageStore.t(.diagAtMax),
                value: "✓",
                valueColor: VPNThemeMac.label
            )
        }
        diagRow(
            title: languageStore.t(.diagPath),
            value: pathText(report),
            valueColor: VPNThemeMac.secondaryLabel
        )
        diagRow(
            title: languageStore.t(.diagStable),
            value: RampStatus.formatRate(report?.stableKbps),
            valueColor: VPNThemeMac.secondaryLabel
        )
        // §2h luật 5 — loss% + RTT. macOS KHÔNG có nguồn số này: framework hysteria chỉ mở
        // `MobileConnect/MobileServe/MobileStop` (không có API loss/RTT của QUIC), và socket của
        // extension không đi qua tunnel nên không probe được như Android ⇒ hiện `—`, KHÔNG bịa.
        // Nhãn ghi "(QUIC)" để nói rõ đang thiếu dữ liệu gì.
        diagRow(
            title: languageStore.t(.diagLoss),
            value: "—",
            valueColor: VPNThemeMac.secondaryLabel
        )
        diagRow(
            title: languageStore.t(.diagRTT),
            value: "—",
            valueColor: VPNThemeMac.secondaryLabel
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
        if let node = vpnManager.selectedNode {
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
                .foregroundStyle(VPNThemeMac.label)
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

    private func serverTitle(for node: ExitNode) -> String {
        "\(flagEmoji(for: node.country)) \(node.city), \(countryName(node.country)) · \(node.name)"
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

#Preview {
    ContentViewMac()
        .environmentObject(VPNManagerMac())
        .environmentObject(MacSubscriptionStore())
        .environmentObject(AuthSessionStore())
        .environmentObject(AppLanguageStore())
}
