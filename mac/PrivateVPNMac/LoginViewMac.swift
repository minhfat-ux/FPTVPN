import AppKit
import SwiftUI

/// Dedicated email-code sign-in screen for macOS — bố cục giống hệt bản iOS
/// (`LoginView.swift`): logo + tên app, thẻ chứa ô email / mã, nút gửi & xác
/// minh, banner thông báo. Khác desktop: kích thước cửa sổ sheet.
struct LoginViewMac: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var vpnManager: VPNManagerMac
    @EnvironmentObject private var authStore: AuthSessionStore
    @EnvironmentObject private var languageStore: AppLanguageStore

    @State private var email = ""
    @State private var loginCode = ""
    @State private var codeRequested = false
    @State private var isSendingCode = false
    @State private var isVerifying = false
    @State private var message: LoginMessageMac?

    var body: some View {
        ZStack {
            VPNThemeMac.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 22) {
                    header

                    VStack(spacing: 16) {
                        emailField
                        sendCodeButton

                        if codeRequested {
                            Divider()
                                .overlay(VPNThemeMac.cardStroke)

                            codeField
                            verifyButton
                        }
                    }
                    .padding(20)
                    .background(VPNThemeMac.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
                    )

                    if let message {
                        messageView(message)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 40)
                .padding(.bottom, 28)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
        }
        .preferredColorScheme(.dark)
        .frame(width: 430, height: 640)
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 10) {
            Image(nsImage: NSApplication.shared.applicationIconImage)
                .resizable()
                .scaledToFit()
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .shadow(color: .black.opacity(0.28), radius: 14, y: 8)

            VPNThemeMac.brandName
                .font(.largeTitle.bold())

            Text(languageStore.t(.appSubtitle))
                .font(.subheadline)
                .foregroundStyle(VPNThemeMac.secondaryLabel)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Fields & buttons

    private var emailField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(languageStore.t(.email))
                .font(.subheadline)
                .foregroundStyle(VPNThemeMac.secondaryLabel)

            TextField(languageStore.t(.emailPlaceholder), text: $email)
                .textFieldStyle(.plain)
                .textContentType(.emailAddress)
                .autocorrectionDisabled()
                .foregroundStyle(VPNThemeMac.label)
                .padding(14)
                .background(VPNThemeMac.fieldBackground)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
                )
        }
    }

    private var codeField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(languageStore.t(.loginCode))
                .font(.subheadline)
                .foregroundStyle(VPNThemeMac.secondaryLabel)

            TextField(languageStore.t(.codePlaceholder), text: $loginCode)
                .textFieldStyle(.plain)
                .textContentType(.oneTimeCode)
                .foregroundStyle(VPNThemeMac.label)
                .padding(14)
                .background(VPNThemeMac.fieldBackground)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(VPNThemeMac.cardStroke, lineWidth: 1)
                )
        }
    }

    private var sendCodeButton: some View {
        Button(action: handleSendCode) {
            HStack(spacing: 8) {
                if isSendingCode {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                }
                Text(languageStore.t(.sendCode))
                    .font(.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .foregroundStyle(.white)
            .background(isSendingCode ? VPNThemeMac.accent.opacity(0.6) : VPNThemeMac.accent)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isSendingCode || isVerifying || trimmedEmail.isEmpty)
    }

    private var verifyButton: some View {
        Button(action: handleVerify) {
            HStack(spacing: 8) {
                if isVerifying {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                }
                Text(languageStore.t(.verifyCode))
                    .font(.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .foregroundStyle(.white)
            .background(isVerifying ? VPNThemeMac.accent.opacity(0.6) : VPNThemeMac.accent)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isVerifying || isSendingCode || trimmedEmail.isEmpty || loginCode.isEmpty)
    }

    private func messageView(_ message: LoginMessageMac) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: message.isError ? "exclamationmark.triangle.fill" : "info.circle.fill")
                .foregroundStyle(message.isError ? .red : VPNThemeMac.accent)
            Text(message.text)
                .font(.footnote)
                .foregroundStyle(message.isError ? .red : VPNThemeMac.label)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background((message.isError ? Color.red : VPNThemeMac.accent).opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke((message.isError ? Color.red : VPNThemeMac.accent).opacity(0.35), lineWidth: 1)
        )
    }

    // MARK: - Actions

    private func handleSendCode() {
        guard isValidEmail(trimmedEmail) else {
            message = .error(languageStore.t(.invalidEmail))
            return
        }
        isSendingCode = true
        message = nil
        Task {
            do {
                let debugCode = try await controlAPIClient().startEmailLogin(email: trimmedEmail)
                codeRequested = true
                if let debugCode {
                    message = .info(String(format: languageStore.t(.devCode), debugCode))
                } else {
                    message = .info(languageStore.t(.loginCodeSent))
                }
            } catch {
                message = .error(error.localizedDescription)
            }
            isSendingCode = false
        }
    }

    private func handleVerify() {
        guard isValidEmail(trimmedEmail) else {
            message = .error(languageStore.t(.invalidEmail))
            return
        }
        isVerifying = true
        message = nil
        Task {
            do {
                let session = try await controlAPIClient().verifyEmailLogin(email: trimmedEmail, code: loginCode)
                authStore.save(session)
                if authStore.isSignedIn {
                    dismiss()
                }
            } catch {
                message = .error(error.localizedDescription)
            }
            isVerifying = false
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

    private var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func isValidEmail(_ value: String) -> Bool {
        guard value.contains("@"), value.contains(".") else { return false }
        return true
    }
}

private enum LoginMessageMac: Equatable {
    case info(String)
    case error(String)

    var text: String {
        switch self {
        case .info(let text), .error(let text):
            return text
        }
    }

    var isError: Bool {
        if case .error = self { return true }
        return false
    }
}

#if DEBUG
#Preview {
    LoginViewMac()
        .environmentObject(VPNManagerMac())
        .environmentObject(AuthSessionStore())
        .environmentObject(AppLanguageStore())
}
#endif
