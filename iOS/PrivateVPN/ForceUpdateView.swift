import SwiftUI

/// Full-screen forced-update gate: shown when the installed build is below the
/// backend `minimum_version`. The user must update — there is no dismiss path.
struct ForceUpdateView: View {
    let info: AppVersionInfo
    @EnvironmentObject private var languageStore: AppLanguageStore

    /// Link tải từ backend. Từ 14/09/2026 không còn App Store: server trả link tải file
    /// IPA (`/v1/downloads/ios`) trong `store_url`. Nếu admin để trống thì lùi về trang
    /// mua/tải của mình — TUYỆT ĐỐI không lùi về App Store, vì ở đó không có app và khách
    /// sẽ bấm mãi mà không thoát được màn ép cập nhật.
    private var updateURL: URL? {
        let raw = info.downloadURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if !raw.isEmpty, let url = URL(string: raw) { return url }
        return URL(string: "https://meetflowai.site/buy")
    }

    var body: some View {
        ZStack {
            VPNTheme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(VPNTheme.accent)

                VPNTheme.brandName
                    .font(.largeTitle.bold())

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
                    // Ưu tiên cài TRỰC TIẾP qua OTA: iOS tải IPA (đã ký kèm UDID máy này) và cài
                    // luôn — khách không phải vào trang install bấm thêm bước nào. Không có
                    // manifest (server cũ) thì mới lùi về mở link tải trên web.
                    if let ota = info.otaInstallURL, UIApplication.shared.canOpenURL(ota) {
                        UIApplication.shared.open(ota)
                    } else if let url = updateURL {
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
