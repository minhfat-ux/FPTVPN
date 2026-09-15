import SwiftUI
import AppKit

/// Full-screen forced-update gate (macOS): shown when the installed build is below
/// the backend minimum_version. No dismiss path — must update.
struct ForceUpdateViewMac: View {
    let info: AppVersionInfo
    @EnvironmentObject private var languageStore: AppLanguageStore

    var body: some View {
        ZStack {
            VPNThemeMac.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(VPNThemeMac.accent)

                VPNThemeMac.brandName
                    .font(.largeTitle.bold())

                Text(languageStore.t(.updateRequired))
                    .font(.title3.bold())
                    .foregroundStyle(VPNThemeMac.label)
                    .multilineTextAlignment(.center)

                Text(languageStore.t(.updateRequiredDetail))
                    .font(.subheadline)
                    .foregroundStyle(VPNThemeMac.secondaryLabel)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                Button {
                    // Không còn App Store: server trả link tải IPA trong `store_url`. Nếu
                    // rỗng thì lùi về trang mua/tải của mình, đừng để nút bấm không mở gì.
                    let raw = info.downloadURL.trimmingCharacters(in: .whitespacesAndNewlines)
                    let url = URL(string: raw) ?? URL(string: "https://meetflowai.site/buy")
                    if let url { NSWorkspace.shared.open(url) }
                } label: {
                    Text(languageStore.t(.update))
                        .font(.headline.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .foregroundStyle(.white)
                        .background(VPNThemeMac.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 40)
                .padding(.top, 8)
            }
            .padding(20)
            .frame(width: 380)
        }
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled()
    }
}
