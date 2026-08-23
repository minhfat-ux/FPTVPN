import SwiftUI

/// Dedicated email-code sign-in screen. Shown whenever the user is not signed
/// in: automatically on launch, when tapping Connect while signed out, and via
/// the Sign In button in Settings.
struct LoginView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var configStore: VPNConfigStore
    @EnvironmentObject private var authStore: AuthSessionStore
    @EnvironmentObject private var languageStore: AppLanguageStore

    @State private var email = ""
    @State private var loginCode = ""
    @State private var codeRequested = false
    @State private var isSendingCode = false
    @State private var isVerifying = false
    @State private var message: LoginMessage?

    var body: some View {
        ZStack {
            VPNTheme.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 22) {
                    header

                    VStack(spacing: 16) {
                        emailField
                        sendCodeButton

                        if codeRequested {
                            Divider()
                                .overlay(Color.white.opacity(0.15))

                            codeField
                            verifyButton
                        }
                    }
                    .padding(20)
                    .background(VPNTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(VPNTheme.cardStroke, lineWidth: 1)
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
            .scrollDismissesKeyboard(.interactively)
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 10) {
            Image("AppLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .shadow(color: .black.opacity(0.28), radius: 14, y: 8)

            Text("FlowVPN")
                .font(.largeTitle.bold())
                .foregroundStyle(.white)

            Text(languageStore.t(.appSubtitle))
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Fields & buttons

    private var emailField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(languageStore.t(.email))
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.6))

            TextField(languageStore.t(.emailPlaceholder), text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundStyle(.white)
                .padding(14)
                .background(Color.white.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                )
        }
    }

    private var codeField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(languageStore.t(.loginCode))
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.6))

            TextField(languageStore.t(.codePlaceholder), text: $loginCode)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .foregroundStyle(.white)
                .padding(14)
                .background(Color.white.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                )
        }
    }

    private var sendCodeButton: some View {
        Button(action: handleSendCode) {
            HStack(spacing: 8) {
                if isSendingCode {
                    ProgressView()
                        .tint(.black)
                }
                Text(languageStore.t(.sendCode))
                    .font(.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .foregroundStyle(.black)
            .background(isSendingCode ? VPNTheme.accent.opacity(0.6) : VPNTheme.accent)
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
                        .tint(.black)
                }
                Text(languageStore.t(.verifyCode))
                    .font(.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .foregroundStyle(.black)
            .background(isVerifying ? VPNTheme.accent.opacity(0.6) : VPNTheme.accent)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isVerifying || isSendingCode || trimmedEmail.isEmpty || loginCode.isEmpty)
    }

    private func messageView(_ message: LoginMessage) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: message.isError ? "exclamationmark.triangle.fill" : "info.circle.fill")
                .foregroundStyle(message.isError ? .red : VPNTheme.accent)
            Text(message.text)
                .font(.footnote)
                .foregroundStyle(message.isError ? .red : .white.opacity(0.9))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background((message.isError ? Color.red : VPNTheme.accent).opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke((message.isError ? Color.red : VPNTheme.accent).opacity(0.35), lineWidth: 1)
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
        guard let baseURL = configStore.controlPlaneBaseURL else {
            throw ControlAPIClient.ClientError.server("Coordinator URL is not configured.")
        }
        return ControlAPIClient(baseURL: baseURL, joinToken: "")
    }

    private var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func isValidEmail(_ value: String) -> Bool {
        guard value.contains("@"), value.contains(".") else { return false }
        return true
    }
}

private enum LoginMessage: Equatable {
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

#Preview {
    LoginView()
        .environmentObject(VPNConfigStore())
        .environmentObject(AuthSessionStore())
        .environmentObject(AppLanguageStore())
}
