import SwiftUI

/// Full-screen forced-update gate: shown when the installed build is below the
/// backend `minimum_version`. The user must update (App Store link) — there is
/// no dismiss/continue path.
struct ForceUpdateView: View {
    let info: AppVersionInfo
    @EnvironmentObject private var languageStore: AppLanguageStore

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
                    .foregroundStyle(.white)

                Text(languageStore.t(.updateRequired))
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)

                Text(languageStore.t(.updateRequiredDetail))
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.65))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                Button {
                    if let url = URL(string: info.store_url) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text(languageStore.t(.update))
                        .font(.headline.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .foregroundStyle(.black)
                        .background(VPNTheme.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 40)
                .padding(.top, 8)
            }
            .padding(20)
        }
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled()
    }
}
