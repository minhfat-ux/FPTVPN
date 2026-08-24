import SwiftUI

/// Shared visual theme for the PrivateVPN iOS UI.
enum VPNTheme {
    /// Accent — green used for the connected state and the primary action.
    static let accent = Color(red: 0.20, green: 0.78, blue: 0.45)

    static let backgroundTop = Color(red: 0.02, green: 0.08, blue: 0.15)
    static let backgroundBottom = Color(red: 0.04, green: 0.12, blue: 0.23)

    static let cardBackground = Color.white.opacity(0.06)
    static let cardStroke = Color.white.opacity(0.12)

    static let backgroundGradient = LinearGradient(
        colors: [backgroundTop, backgroundBottom],
        startPoint: .top,
        endPoint: .bottom
    )
}

// MARK: - VPNState UI presentation (UI-only extension; VPNState.swift untouched)

extension VPNState {
    /// SF Symbol representing the connection state.
    var symbol: String {
        switch self {
        case .disconnected: return "shield.slash.fill"
        case .connecting: return "shield.lefthalf.filled"
        case .connected: return "checkmark.shield.fill"
        case .disconnecting: return "shield.lefthalf.filled"
        case .failed: return "exclamationmark.triangle.fill"
        }
    }

    /// Accent color for the connection state.
    var tint: Color {
        switch self {
        case .disconnected: return Color.white.opacity(0.55)
        case .connecting, .disconnecting: return .orange
        case .connected: return VPNTheme.accent
        case .failed: return .red
        }
    }

    /// Short user-facing status line shown under the state label.
    var subtitle: String {
        switch self {
        case .disconnected: return "Not protected — internet traffic is direct"
        case .connecting: return "Establishing a secure tunnel…"
        case .connected: return "Protected — your internet exits through Vietnam"
        case .disconnecting: return "Closing the tunnel…"
        case .failed: return "Connection failed — check diagnostics below"
        }
    }

    var isTransitioning: Bool {
        self == .connecting || self == .disconnecting
    }
}

enum AppLanguage: String, CaseIterable, Identifiable {
    case english = "en"
    case vietnamese = "vi"
    case chinese = "zh"
    case japanese = "ja"
    case korean = "ko"

    var id: String { rawValue }
}

enum AppLanguageChoice: String, CaseIterable, Identifiable {
    case system
    case english = "en"
    case vietnamese = "vi"
    case chinese = "zh"
    case japanese = "ja"
    case korean = "ko"

    var id: String { rawValue }

    var language: AppLanguage? {
        switch self {
        case .system: return nil
        case .english: return .english
        case .vietnamese: return .vietnamese
        case .chinese: return .chinese
        case .japanese: return .japanese
        case .korean: return .korean
        }
    }

    func title(in language: AppLanguage) -> String {
        switch self {
        case .system: return "🌐 \(AppLanguageStore.text(.systemLanguage, language: language))"
        case .english: return "🇺🇸 English"
        case .vietnamese: return "🇻🇳 Vietnamese"
        case .chinese: return "🇨🇳 Chinese"
        case .japanese: return "🇯🇵 Japanese"
        case .korean: return "🇰🇷 Korean"
        }
    }
}

enum AppTextKey: String {
    case systemLanguage, language, appSubtitle, configuration, done
    case account, signedIn, signedOut, signInRequired, signInTitle, email, loginCode, sendCode, verifyCode, signOut
    case updateRequired, updateRequiredDetail, update
    case deleteAccount, deleteAccountConfirm, deleteAccountDone
    case cancel
    case emailPlaceholder, codePlaceholder, invalidEmail, devCode, loginCodeSent
    case subscription, status, premiumActive, premiumRequired, free
    case protectionUnlocked, choosePlanToStart, choosePlan, restorePurchases
    case support, contactSupport, privacyPolicy, appleStandardEULA, upgrade
    case preparingPermission, vpnStartFailure, diagnostics, state, location, message, notConfigured
    case secureExitNode, vietnam, startVPNHint, stopVPNHint
    case serverLocation, select, loadingLocations, noServerAvailable, refreshLocations, usingSavedServers
    case paywallTitle, paywallSubtitle, benefitTunnel, benefitWifi, benefitFast
    case noPlans, noPlansDetail, subscriptionDisclosure, manageSubscription, privacy, eula, notNow
    case disconnected, connecting, connected, disconnecting, failed
    case disconnectedSubtitle, connectingSubtitle, connectedSubtitle, disconnectingSubtitle, failedSubtitle
    case devices, revoke, revokeDeviceConfirm, thisDevice, deviceRevoked, noDevices, active, revoked, loadingDevices
}

@MainActor
final class AppLanguageStore: ObservableObject {
    private static let choiceKey = "flowvpn.languageChoice"

    @Published private(set) var choice: AppLanguageChoice

    init(defaults: UserDefaults = .standard) {
        if let rawValue = defaults.string(forKey: Self.choiceKey),
           let storedChoice = AppLanguageChoice(rawValue: rawValue) {
            choice = storedChoice
        } else {
            choice = .system
        }
    }

    var language: AppLanguage {
        choice.language ?? Self.systemLanguage()
    }

    func setChoice(_ nextChoice: AppLanguageChoice) {
        choice = nextChoice
        UserDefaults.standard.set(nextChoice.rawValue, forKey: Self.choiceKey)
    }

    func t(_ key: AppTextKey) -> String {
        Self.text(key, language: language)
    }

    static func systemLanguage() -> AppLanguage {
        for preferred in Locale.preferredLanguages {
            let code = preferred.lowercased()
            if code.hasPrefix("vi") { return .vietnamese }
            if code.hasPrefix("zh") { return .chinese }
            if code.hasPrefix("ja") { return .japanese }
            if code.hasPrefix("ko") { return .korean }
            if code.hasPrefix("en") { return .english }
        }
        return .english
    }

    nonisolated static func text(_ key: AppTextKey, language: AppLanguage) -> String {
        textTable[language]?[key] ?? textTable[.english]?[key] ?? key.rawValue
    }

    nonisolated private static let textTable: [AppLanguage: [AppTextKey: String]] = [
        .english: [
            .systemLanguage: "System", .language: "Language", .appSubtitle: "Private, encrypted internet from Vietnam",
            .account: "Account", .signedIn: "Signed in", .signedOut: "Signed out", .signInRequired: "Sign in required", .email: "Email", .updateRequired: "Update Required", .updateRequiredDetail: "A new version of FlowVPN is required to continue. Please update from the App Store.", .update: "Update", .deleteAccount: "Delete Account", .deleteAccountConfirm: "This permanently deletes your account and all data. This cannot be undone.", .deleteAccountDone: "Account deleted.", .cancel: "Cancel",
            .signInTitle: "Sign In", .loginCode: "Login code", .sendCode: "Send Code", .verifyCode: "Verify Code", .signOut: "Sign Out",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456", .invalidEmail: "Please enter a valid email address.",
            .devCode: "Dev code: %@", .loginCodeSent: "Login code sent",
            .configuration: "Configuration", .done: "Done", .subscription: "Subscription", .status: "Status",
            .premiumActive: "Premium Active", .premiumRequired: "Premium Required", .free: "Free",
            .protectionUnlocked: "VPN protection is unlocked", .choosePlanToStart: "Choose a plan to start protection",
            .choosePlan: "Choose Plan", .restorePurchases: "Restore Purchases", .support: "Support",
            .contactSupport: "Contact Support", .privacyPolicy: "Privacy Policy", .appleStandardEULA: "Apple Standard EULA",
            .upgrade: "Upgrade", .preparingPermission: "Preparing VPN permission…", .vpnStartFailure: "VPN could not start. Please try again.",
            .diagnostics: "Diagnostics", .state: "State", .location: "Location", .message: "Message",
            .notConfigured: "Not configured - tap to open Configuration", .secureExitNode: "Secure exit node",
            .vietnam: "Vietnam", .startVPNHint: "Starts the VPN tunnel to the selected location",
            .stopVPNHint: "Stops the VPN tunnel", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "Unlock private, encrypted internet protection.", .benefitTunnel: "Secure VPN tunnel",
            .benefitWifi: "Protection on public Wi-Fi", .benefitFast: "Fast one-tap connection",
            .noPlans: "No plans available", .noPlansDetail: "StoreKit did not return Monthly_Premium or Yearly_Premium.",
            .subscriptionDisclosure: "Payment is charged to your Apple ID at confirmation of purchase. Subscriptions auto-renew unless canceled at least 24 hours before the end of the current period; your account is charged for renewal within 24 hours prior to the period end. Manage or cancel anytime in your Apple ID Account Settings. Any unused portion of a free trial, if offered, is forfeited upon purchasing a subscription.",
            .manageSubscription: "Manage Subscription",
            .privacy: "Privacy", .eula: "EULA", .notNow: "Not Now", .disconnected: "Disconnected",
            .connecting: "Connecting", .connected: "Connected", .disconnecting: "Disconnecting", .failed: "Failed",
            .disconnectedSubtitle: "Your VPN tunnel is off", .connectingSubtitle: "Starting secure VPN tunnel",
            .connectedSubtitle: "Your traffic is protected", .disconnectingSubtitle: "Stopping VPN tunnel",
            .failedSubtitle: "VPN needs attention",
            .select: "Select", .serverLocation: "Server", .loadingLocations: "Loading servers…", .noServerAvailable: "No server available", .refreshLocations: "Refresh servers", .usingSavedServers: "Showing saved servers — coordinator unreachable. Tap to refresh.",
            .devices: "Devices", .revoke: "Revoke", .revokeDeviceConfirm: "Revoke this device? It will no longer be able to connect.", .thisDevice: "This device", .deviceRevoked: "Device revoked.", .noDevices: "No devices registered.", .active: "Active", .revoked: "Revoked", .loadingDevices: "Loading devices…"
        ],
        .vietnamese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "Internet riêng tư, mã hóa từ Việt Nam",
            .signInRequired: "Cần đăng nhập",
            .signInTitle: "Đăng nhập", .invalidEmail: "Vui lòng nhập địa chỉ email hợp lệ.",
            .devCode: "Mã dev: %@", .loginCodeSent: "Mã đăng nhập đã được gửi",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .updateRequired: "Cần cập nhật", .updateRequiredDetail: "Cần phiên bản mới của FlowVPN để tiếp tục. Vui lòng cập nhật từ App Store.", .update: "Cập nhật", .deleteAccount: "Xóa tài khoản", .deleteAccountConfirm: "Thao tác này sẽ xóa vĩnh viễn tài khoản và toàn bộ dữ liệu của bạn. Không thể hoàn tác.", .deleteAccountDone: "Đã xóa tài khoản.", .cancel: "Hủy",
            .configuration: "Cấu hình", .done: "Xong", .subscription: "Gói đăng ký", .status: "Trạng thái",
            .premiumActive: "Premium đang hoạt động", .premiumRequired: "Cần Premium", .free: "Miễn phí",
            .protectionUnlocked: "Bảo vệ VPN đã được mở khóa", .choosePlanToStart: "Chọn gói để bắt đầu bảo vệ",
            .choosePlan: "Chọn gói", .restorePurchases: "Khôi phục giao dịch", .support: "Hỗ trợ",
            .contactSupport: "Liên hệ hỗ trợ", .privacyPolicy: "Chính sách quyền riêng tư", .appleStandardEULA: "EULA tiêu chuẩn của Apple",
            .upgrade: "Nâng cấp", .preparingPermission: "Đang chờ cấp quyền VPN…", .vpnStartFailure: "Không thể khởi động VPN. Vui lòng thử lại.",
            .diagnostics: "Chẩn đoán", .state: "Trạng thái", .location: "Vị trí", .message: "Thông báo",
            .notConfigured: "Chưa cấu hình - chạm để mở Cấu hình", .secureExitNode: "Exit node bảo mật",
            .vietnam: "Việt Nam", .startVPNHint: "Bắt đầu VPN tunnel tới vị trí đã chọn",
            .stopVPNHint: "Dừng VPN tunnel", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "Mở khóa bảo vệ internet riêng tư và mã hóa.", .benefitTunnel: "VPN tunnel bảo mật",
            .benefitWifi: "Bảo vệ khi dùng Wi-Fi công cộng", .benefitFast: "Kết nối nhanh một chạm",
            .noPlans: "Chưa có gói khả dụng", .noPlansDetail: "StoreKit không trả về Monthly_Premium hoặc Yearly_Premium.",
            .subscriptionDisclosure: "Thanh toán sẽ được trừ vào tài khoản Apple ID khi bạn xác nhận mua. Gói đăng ký tự động gia hạn trừ khi bạn hủy ít nhất 24 giờ trước khi kết thúc kỳ hiện tại; tài khoản sẽ bị trừ phí gia hạn trong vòng 24 giờ trước khi kết thúc kỳ. Bạn có thể quản lý hoặc hủy gói đăng ký bất cứ lúc nào trong cài đặt tài khoản Apple ID. Mọi phần chưa dùng của thời gian dùng thử miễn phí (nếu có) sẽ bị mất khi bạn mua gói đăng ký.",
            .manageSubscription: "Quản lý gói đăng ký",
            .privacy: "Quyền riêng tư", .eula: "EULA", .notNow: "Để sau", .disconnected: "Đã ngắt kết nối",
            .connecting: "Đang kết nối", .connected: "Đã kết nối", .disconnecting: "Đang ngắt kết nối", .failed: "Lỗi",
            .disconnectedSubtitle: "VPN tunnel đang tắt", .connectingSubtitle: "Đang khởi động VPN tunnel bảo mật",
            .connectedSubtitle: "Lưu lượng của bạn đang được bảo vệ", .disconnectingSubtitle: "Đang dừng VPN tunnel",
            .failedSubtitle: "VPN cần được kiểm tra",
            .select: "Chọn", .serverLocation: "Máy chủ", .loadingLocations: "Đang tải máy chủ…", .noServerAvailable: "Chưa có máy chủ khả dụng", .refreshLocations: "Tải lại máy chủ", .usingSavedServers: "Đang hiển thị máy chủ đã lưu — không kết nối được máy chủ điều phối. Chạm để tải lại.",
            .devices: "Thiết bị", .revoke: "Thu hồi", .revokeDeviceConfirm: "Thu hồi thiết bị này? Thiết bị sẽ không thể kết nối được nữa.", .thisDevice: "Thiết bị này", .deviceRevoked: "Đã thu hồi thiết bị.", .noDevices: "Chưa có thiết bị nào được đăng ký.", .active: "Hoạt động", .revoked: "Đã thu hồi", .loadingDevices: "Đang tải thiết bị…"
        ],
        .chinese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "来自越南的私密加密网络",
            .signInRequired: "需要登录",
            .signInTitle: "登录", .invalidEmail: "请输入有效的邮箱地址。",
            .devCode: "开发者验证码：%@", .loginCodeSent: "登录验证码已发送",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .updateRequired: "需要更新", .updateRequiredDetail: "需要新版 FlowVPN 才能继续。请从 App Store 更新。", .update: "更新", .deleteAccount: "删除账户", .deleteAccountConfirm: "此操作将永久删除您的账户和所有数据，且无法撤销。", .deleteAccountDone: "账户已删除。", .cancel: "取消",
            .configuration: "设置", .done: "完成", .subscription: "订阅", .status: "状态",
            .premiumActive: "Premium 已激活", .premiumRequired: "需要 Premium", .free: "免费",
            .protectionUnlocked: "VPN 保护已解锁", .choosePlanToStart: "选择套餐以开始保护",
            .choosePlan: "选择套餐", .restorePurchases: "恢复购买", .support: "支持",
            .contactSupport: "联系支持", .privacyPolicy: "隐私政策", .appleStandardEULA: "Apple 标准 EULA",
            .upgrade: "升级", .preparingPermission: "正在等待 VPN 权限…", .vpnStartFailure: "VPN 无法启动。请重试。",
            .diagnostics: "诊断", .state: "状态", .location: "位置", .message: "消息",
            .notConfigured: "尚未配置 - 点击打开设置", .secureExitNode: "安全出口节点", .vietnam: "越南",
            .startVPNHint: "连接到所选位置的 VPN 隧道", .stopVPNHint: "停止 VPN 隧道",
            .paywallTitle: "FlowVPN Premium", .paywallSubtitle: "解锁私密、加密的互联网保护。",
            .benefitTunnel: "安全 VPN 隧道", .benefitWifi: "公共 Wi-Fi 保护", .benefitFast: "一键快速连接",
            .noPlans: "暂无可用套餐", .noPlansDetail: "StoreKit 未返回 Monthly_Premium 或 Yearly_Premium。",
            .subscriptionDisclosure: "付款将在购买确认时从您的 Apple ID 账户扣除。订阅会自动续订，除非在当前订阅期结束前至少 24 小时取消；续订费用将在当前订阅期结束前 24 小时内从您的账户扣除。您可随时在 Apple ID 账户设置中管理或取消订阅。若提供免费试用，未使用的试用时长将在购买订阅时被收回。",
            .manageSubscription: "管理订阅",
            .privacy: "隐私", .eula: "EULA", .notNow: "暂不", .disconnected: "未连接",
            .connecting: "正在连接", .connected: "已连接", .disconnecting: "正在断开", .failed: "失败",
            .disconnectedSubtitle: "VPN 隧道已关闭", .connectingSubtitle: "正在启动安全 VPN 隧道",
            .connectedSubtitle: "你的流量正在受到保护", .disconnectingSubtitle: "正在停止 VPN 隧道",
            .failedSubtitle: "VPN 需要检查",
            .select: "选择", .serverLocation: "服务器", .loadingLocations: "正在加载服务器…", .noServerAvailable: "暂无可用服务器", .refreshLocations: "刷新服务器", .usingSavedServers: "正在显示已保存的服务器 — 无法连接协调服务器。点击重试。",
            .devices: "设备", .revoke: "撤销", .revokeDeviceConfirm: "撤销此设备？该设备将无法再连接。", .thisDevice: "当前设备", .deviceRevoked: "设备已撤销。", .noDevices: "尚未注册任何设备。", .active: "活跃", .revoked: "已撤销", .loadingDevices: "正在加载设备…"
        ],
        .japanese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "ベトナム経由のプライベートな暗号化通信",
            .signInRequired: "サインインが必要です",
            .signInTitle: "サインイン", .invalidEmail: "有効なメールアドレスを入力してください。",
            .devCode: "開発用コード: %@", .loginCodeSent: "ログインコードを送信しました",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .updateRequired: "アップデートが必要です", .updateRequiredDetail: "FlowVPN の新しいバージョンが必要です。App Store から更新してください。", .update: "アップデート", .deleteAccount: "アカウントを削除", .deleteAccountConfirm: "これによりアカウントとすべてのデータが完全に削除されます。元に戻せません。", .deleteAccountDone: "アカウントを削除しました。", .cancel: "キャンセル",
            .configuration: "設定", .done: "完了", .subscription: "サブスクリプション", .status: "ステータス",
            .premiumActive: "Premium 有効", .premiumRequired: "Premium が必要", .free: "無料",
            .protectionUnlocked: "VPN 保護が有効です", .choosePlanToStart: "保護を開始するにはプランを選択",
            .choosePlan: "プランを選択", .restorePurchases: "購入を復元", .support: "サポート",
            .contactSupport: "サポートに連絡", .privacyPolicy: "プライバシーポリシー", .appleStandardEULA: "Apple 標準 EULA",
            .upgrade: "アップグレード", .preparingPermission: "VPN の許可を待機中…", .vpnStartFailure: "VPN を開始できませんでした。もう一度お試しください。",
            .diagnostics: "診断", .state: "状態", .location: "場所", .message: "メッセージ",
            .notConfigured: "未設定 - タップして設定を開く", .secureExitNode: "安全な出口ノード", .vietnam: "ベトナム",
            .startVPNHint: "選択した場所への VPN トンネルを開始します", .stopVPNHint: "VPN トンネルを停止します",
            .paywallTitle: "FlowVPN Premium", .paywallSubtitle: "プライベートで暗号化されたインターネット保護を解除します。",
            .benefitTunnel: "安全な VPN トンネル", .benefitWifi: "公共 Wi-Fi での保護", .benefitFast: "ワンタップで高速接続",
            .noPlans: "利用可能なプランがありません", .noPlansDetail: "StoreKit が Monthly_Premium または Yearly_Premium を返しませんでした。",
            .subscriptionDisclosure: "お支払いは購入確定時に Apple ID アカウントに請求されます。サブスクリプションは、現在の期間終了の24時間前までにキャンセルしない限り自動更新され、更新料金は期間終了前24時間以内に請求されます。サブスクリプションは Apple ID アカウント設定でいつでも管理・キャンセルできます。無料トライアルが提供される場合、未使用分はサブスクリプション購入時に失われます。",
            .manageSubscription: "サブスクリプションを管理",
            .privacy: "プライバシー", .eula: "EULA", .notNow: "後で", .disconnected: "未接続",
            .connecting: "接続中", .connected: "接続済み", .disconnecting: "切断中", .failed: "失敗",
            .disconnectedSubtitle: "VPN トンネルはオフです", .connectingSubtitle: "安全な VPN トンネルを開始中",
            .connectedSubtitle: "通信は保護されています", .disconnectingSubtitle: "VPN トンネルを停止中",
            .failedSubtitle: "VPN の確認が必要です",
            .select: "選択", .serverLocation: "サーバー", .loadingLocations: "サーバーを読み込み中…", .noServerAvailable: "利用可能なサーバーがありません", .refreshLocations: "サーバーを更新", .usingSavedServers: "保存済みサーバーを表示中 — コーディネーターに接続できません。再試行するにはタップ。",
            .devices: "デバイス", .revoke: "取り消す", .revokeDeviceConfirm: "このデバイスを取り消しますか？このデバイスは接続できなくなります。", .thisDevice: "このデバイス", .deviceRevoked: "デバイスを取り消しました。", .noDevices: "登録されたデバイスがありません。", .active: "アクティブ", .revoked: "取り消し済み", .loadingDevices: "デバイスを読み込み中…"
        ],
        .korean: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "베트남을 통한 비공개 암호화 인터넷",
            .signInRequired: "로그인이 필요합니다",
            .signInTitle: "로그인", .invalidEmail: "유효한 이메일 주소를 입력하세요.",
            .devCode: "개발자 코드: %@", .loginCodeSent: "로그인 코드가 전송되었습니다",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .updateRequired: "업데이트 필요", .updateRequiredDetail: "계속하려면 새 FlowVPN 버전이 필요합니다. App Store에서 업데이트하세요.", .update: "업데이트", .deleteAccount: "계정 삭제", .deleteAccountConfirm: "계정과 모든 데이터가 영구적으로 삭제되며 되돌릴 수 없습니다.", .deleteAccountDone: "계정이 삭제되었습니다.", .cancel: "취소",
            .configuration: "설정", .done: "완료", .subscription: "구독", .status: "상태",
            .premiumActive: "Premium 활성화됨", .premiumRequired: "Premium 필요", .free: "무료",
            .protectionUnlocked: "VPN 보호가 활성화되었습니다", .choosePlanToStart: "보호를 시작하려면 플랜을 선택하세요",
            .choosePlan: "플랜 선택", .restorePurchases: "구매 복원", .support: "지원",
            .contactSupport: "지원 문의", .privacyPolicy: "개인정보 처리방침", .appleStandardEULA: "Apple 표준 EULA",
            .upgrade: "업그레이드", .preparingPermission: "VPN 권한을 기다리는 중…", .vpnStartFailure: "VPN을 시작할 수 없습니다. 다시 시도해 주세요.",
            .diagnostics: "진단", .state: "상태", .location: "위치", .message: "메시지",
            .notConfigured: "설정되지 않음 - 탭하여 설정 열기", .secureExitNode: "보안 출구 노드", .vietnam: "베트남",
            .startVPNHint: "선택한 위치로 VPN 터널을 시작합니다", .stopVPNHint: "VPN 터널을 중지합니다",
            .paywallTitle: "FlowVPN Premium", .paywallSubtitle: "비공개 암호화 인터넷 보호를 잠금 해제하세요.",
            .benefitTunnel: "보안 VPN 터널", .benefitWifi: "공용 Wi-Fi 보호", .benefitFast: "빠른 원탭 연결",
            .noPlans: "사용 가능한 플랜 없음", .noPlansDetail: "StoreKit이 Monthly_Premium 또는 Yearly_Premium을 반환하지 않았습니다.",
            .subscriptionDisclosure: "결제는 구매 확정 시 Apple ID 계정에 청구됩니다. 구독은 현재 기간 종료 최소 24시간 전에 취소하지 않으면 자동 갱신되며, 갱신 요금은 기간 종료 24시간 이내에 청구됩니다. 구독은 Apple ID 계정 설정에서 언제든지 관리하거나 취소할 수 있습니다. 무료 체험 기간이 제공되는 경우, 사용하지 않은 부분은 구독 구매 시 소멸됩니다.",
            .manageSubscription: "구독 관리",
            .privacy: "개인정보", .eula: "EULA", .notNow: "나중에", .disconnected: "연결 끊김",
            .connecting: "연결 중", .connected: "연결됨", .disconnecting: "연결 해제 중", .failed: "실패",
            .disconnectedSubtitle: "VPN 터널이 꺼져 있습니다", .connectingSubtitle: "보안 VPN 터널을 시작하는 중",
            .connectedSubtitle: "트래픽이 보호되고 있습니다", .disconnectingSubtitle: "VPN 터널을 중지하는 중",
            .failedSubtitle: "VPN 확인이 필요합니다",
            .select: "선택", .serverLocation: "서버", .loadingLocations: "서버를 불러오는 중…", .noServerAvailable: "사용 가능한 서버 없음", .refreshLocations: "서버 새로고침", .usingSavedServers: "저장된 서버 표시 중 — 코디네이터에 연결할 수 없습니다. 다시 시도하려면 탭하세요.",
            .devices: "기기", .revoke: "해지", .revokeDeviceConfirm: "이 기기를 해지하시겠습니까? 이 기기는 더 이상 연결할 수 없습니다.", .thisDevice: "현재 기기", .deviceRevoked: "기기가 해지되었습니다.", .noDevices: "등록된 기기가 없습니다.", .active: "활성", .revoked: "해지됨", .loadingDevices: "기기를 불러오는 중…"
        ],
    ]
}

extension VPNState {
    func localizedLabel(_ language: AppLanguage) -> String {
        switch self {
        case .disconnected: return AppLanguageStore.text(.disconnected, language: language)
        case .connecting: return AppLanguageStore.text(.connecting, language: language)
        case .connected: return AppLanguageStore.text(.connected, language: language)
        case .disconnecting: return AppLanguageStore.text(.disconnecting, language: language)
        case .failed: return AppLanguageStore.text(.failed, language: language)
        }
    }

    func localizedSubtitle(_ language: AppLanguage) -> String {
        switch self {
        case .disconnected: return AppLanguageStore.text(.disconnectedSubtitle, language: language)
        case .connecting: return AppLanguageStore.text(.connectingSubtitle, language: language)
        case .connected: return AppLanguageStore.text(.connectedSubtitle, language: language)
        case .disconnecting: return AppLanguageStore.text(.disconnectingSubtitle, language: language)
        case .failed: return AppLanguageStore.text(.failedSubtitle, language: language)
        }
    }
}
