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

    var body: some View {
        NavigationStack {
            ZStack {
                VPNTheme.backgroundGradient
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        header

                        locationCard

                        if vpnManager.state.isTransitioning {
                            HStack(spacing: 10) {
                                ProgressView()
                                    .tint(VPNTheme.accent)
                                Text(languageStore.t(.preparingPermission))
                                    .font(.footnote)
                                    .foregroundStyle(.white.opacity(0.75))
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
                            .foregroundStyle(.white.opacity(0.8))
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
            .sheet(isPresented: $showingPaywall) {
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
        }
        .preferredColorScheme(.dark)
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
            } else {
                showingSettings = false
                showingLogin = true
            }
        }
        .task {
            vpnManager.refreshStatus()
            // Backend-first server selection (SRS A8): load exit nodes from the
            // coordinator before enabling Connect; never rely on hardcoded presets
            // in production.
            await vpnManager.fetchNodes(store: configStore)
            await subscriptionStore.start()
            // Force-update gate: if the backend requires a newer build, block usage.
            if let baseURL = configStore.controlPlaneBaseURL,
               let info = try? await AppVersionService.fetch(from: baseURL),
               AppVersionService.isForcedUpdate(info) {
                forcedUpdateInfo = info
            }
        }
    }

    private func syncBackendPremium() {
        subscriptionStore.backendPremium = authStore.session?.user.subscription_status?.is_active ?? false
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

            Text("FlowVPN")
                .font(.title.bold())
                .foregroundStyle(.white)
            Text(languageStore.t(.appSubtitle))
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.6))
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
                    .foregroundStyle(.white)
            }

            Text(vpnManager.state.localizedSubtitle(languageStore.language))
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.65))
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
                    .foregroundStyle(.white)

                Spacer()

                Button {
                    Task { await vpnManager.fetchNodes(store: configStore) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white.opacity(0.7))
                .disabled(vpnManager.state.isTransitioning)
                .accessibilityLabel(languageStore.t(.refreshLocations))
            }

            let nodes = configStore.availableNodes
            if nodes.isEmpty {
                Text(languageStore.t(.noServerAvailable))
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.6))
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

    private func serverRow(_ node: ExitNode) -> some View {
        let isSelected = configStore.selectedNodeID == node.id
        let busy = vpnManager.state.isTransitioning

        return HStack(spacing: 8) {
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(isSelected ? VPNTheme.accent : .white.opacity(0.4))

            Text(serverTitle(for: node))
                .font(.subheadline)
                .lineLimit(1)
                .foregroundStyle(.white)

            Spacer(minLength: 8)

            Button(languageStore.t(.select)) {
                selectNode(id: node.id)
            }
            .font(.footnote.bold())
            .foregroundStyle(VPNTheme.accent)
            .buttonStyle(.plain)
            .disabled(busy)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 6)
        .background(isSelected ? VPNTheme.accent.opacity(0.15) : Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 8))
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

    private var subscriptionStatusCard: some View {
        HStack(spacing: 14) {
            Image(systemName: subscriptionStore.isSubscribed ? "checkmark.seal.fill" : "lock.shield.fill")
                .font(.title3)
                .foregroundStyle(subscriptionStore.isSubscribed ? VPNTheme.accent : .orange)

            VStack(alignment: .leading, spacing: 3) {
                Text(subscriptionStore.isSubscribed ? languageStore.t(.premiumActive) : languageStore.t(.premiumRequired))
                    .font(.headline)
                    .foregroundStyle(.white)
                Text(subscriptionStore.isSubscribed ? languageStore.t(.protectionUnlocked) : languageStore.t(.choosePlanToStart))
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.6))
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
                        .background(VPNTheme.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
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

    // MARK: - Single one-tap primary button (NFR-UX-001 / AC-022)

    private var primaryButton: some View {
        Button(action: handlePrimaryTap) {
            ZStack {
                Circle()
                    .fill(primaryButtonColor)
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
        .opacity(primaryButtonDisabled ? 0.45 : 1)
        .disabled(primaryButtonDisabled)
        .animation(.easeInOut(duration: 0.25), value: vpnManager.state)
        .accessibilityHint(vpnManager.state.canConnect
                           ? languageStore.t(.startVPNHint)
                           : languageStore.t(.stopVPNHint))
    }

    private var primaryButtonColor: Color {
        switch vpnManager.state {
        case .connected:
            return VPNTheme.accent
        case .connecting, .disconnecting:
            return .orange
        case .disconnected, .failed:
            return .red
        }
    }

    private var primaryButtonDisabled: Bool {
        switch vpnManager.state {
        case .disconnecting, .connecting:
            return true
        case .connected:
            return false
        case .disconnected, .failed:
            // Nothing to dial yet — unless the control plane can provision.
            return !configStore.isConfigured && !configStore.hasControlPlane
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
                .foregroundStyle(.white)

            Divider().overlay(Color.white.opacity(0.15))

            diagRow(title: languageStore.t(.state), value: vpnManager.state.localizedLabel(languageStore.language), valueColor: vpnManager.state.tint)
            diagRow(title: languageStore.t(.location), value: nodeDisplay, valueColor: .white.opacity(0.85))
            if let statusMessage = vpnManager.statusMessage {
                diagRow(title: languageStore.t(.message), value: statusMessage, valueColor: .white.opacity(0.85))
            }
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
                .foregroundStyle(.white.opacity(0.55))
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline.monospaced())
                .foregroundStyle(valueColor)
                .multilineTextAlignment(.trailing)
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
                .foregroundStyle(.white.opacity(0.9))
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
                    .foregroundStyle(.white.opacity(0.6))
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

#Preview {
    ContentView()
        .environmentObject(VPNManager())
        .environmentObject(VPNConfigStore())
        .environmentObject(SubscriptionStore())
        .environmentObject(AuthSessionStore())
        .environmentObject(AppLanguageStore())
}
