import SwiftUI

/// Full-screen forced-update gate: shown when the installed build is below the
/// backend `minimum_version`. The user must update (App Store link) — there is
/// no dismiss/continue path.
struct ForceUpdateView: View {
    let info: AppVersionInfo
    @EnvironmentObject private var languageStore: AppLanguageStore

    /// App Store link from the backend. Until the app has a public App Store
    /// page the admin leaves `store_url` empty, so fall back to an App Store
    /// search for the app name instead of a dead button.
    private var updateURL: URL? {
        let raw = info.store_url.trimmingCharacters(in: .whitespacesAndNewlines)
        if !raw.isEmpty, let url = URL(string: raw) { return url }
        return URL(string: "https://apps.apple.com/search?term=FlowVPN")
    }

    var body: some View {
        ZStack {
            VPNTheme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(VPNTheme.accent)

                Text("FlowVPN")
                    .font(.largeTitle.bold())
                    .foregroundStyle(VPNTheme.label)

                Text(languageStore.t(.updateRequired))
                    .font(.title3.bold())
                    .foregroundStyle(VPNTheme.label)
                    .multilineTextAlignment(.center)

                Text(languageStore.t(.updateRequiredDetail))
                    .font(.subheadline)
                    .foregroundStyle(VPNTheme.secondaryLabel)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                Button {
                    if let url = updateURL {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text(languageStore.t(.update))
                        .font(.headline.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .foregroundStyle(.white)
                        .background(VPNTheme.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 40)
                .padding(.top, 8)
            }
            .padding(20)
        }
        .interactiveDismissDisabled()
    }
}
