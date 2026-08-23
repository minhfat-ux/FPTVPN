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
    case account, signedIn, signedOut, signInRequired, email, loginCode, sendCode, verifyCode, signOut
    case subscription, status, premiumActive, premiumRequired, free
    case protectionUnlocked, choosePlanToStart, choosePlan, restorePurchases
    case support, contactSupport, privacyPolicy, appleStandardEULA, upgrade
    case vpnStartFailure, diagnostics, state, location, message, notConfigured
    case secureExitNode, vietnam, startVPNHint, stopVPNHint
    case paywallTitle, paywallSubtitle, benefitTunnel, benefitWifi, benefitFast
    case noPlans, noPlansDetail, subscriptionDisclosure, manageSubscription, privacy, eula, notNow
    case disconnected, connecting, connected, disconnecting, failed
    case disconnectedSubtitle, connectingSubtitle, connectedSubtitle, disconnectingSubtitle, failedSubtitle
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
            .account: "Account", .signedIn: "Signed in", .signedOut: "Signed out", .signInRequired: "Sign in required", .email: "Email",
            .loginCode: "Login code", .sendCode: "Send Code", .verifyCode: "Verify Code", .signOut: "Sign Out",
            .configuration: "Configuration", .done: "Done", .subscription: "Subscription", .status: "Status",
            .premiumActive: "Premium Active", .premiumRequired: "Premium Required", .free: "Free",
            .protectionUnlocked: "VPN protection is unlocked", .choosePlanToStart: "Choose a plan to start protection",
            .choosePlan: "Choose Plan", .restorePurchases: "Restore Purchases", .support: "Support",
            .contactSupport: "Contact Support", .privacyPolicy: "Privacy Policy", .appleStandardEULA: "Apple Standard EULA",
            .upgrade: "Upgrade", .vpnStartFailure: "VPN could not start. Please try again.",
            .diagnostics: "Diagnostics", .state: "State", .location: "Location", .message: "Message",
            .notConfigured: "Not configured - tap to open Configuration", .secureExitNode: "Secure exit node",
            .vietnam: "Vietnam", .startVPNHint: "Starts the VPN tunnel to the selected location",
            .stopVPNHint: "Stops the VPN tunnel", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "Unlock private, encrypted internet protection.", .benefitTunnel: "Secure VPN tunnel",
            .benefitWifi: "Protection on public Wi-Fi", .benefitFast: "Fast one-tap connection",
            .noPlans: "No plans available", .noPlansDetail: "StoreKit did not return Monthly_Premium or Yearly_Premium.",
            .subscriptionDisclosure: "Subscriptions auto-renew unless canceled at least 24 hours before renewal. A free trial starts only after subscribing if offered by the App Store.",
            .manageSubscription: "Manage Subscription",
            .privacy: "Privacy", .eula: "EULA", .notNow: "Not Now", .disconnected: "Disconnected",
            .connecting: "Connecting", .connected: "Connected", .disconnecting: "Disconnecting", .failed: "Failed",
            .disconnectedSubtitle: "Your VPN tunnel is off", .connectingSubtitle: "Starting secure VPN tunnel",
            .connectedSubtitle: "Your traffic is protected", .disconnectingSubtitle: "Stopping VPN tunnel",
            .failedSubtitle: "VPN needs attention",
        ],
        .vietnamese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "Internet riêng tư, mã hóa từ Việt Nam",
            .signInRequired: "Cần đăng nhập",
            .configuration: "Cấu hình", .done: "Xong", .subscription: "Gói đăng ký", .status: "Trạng thái",
            .premiumActive: "Premium đang hoạt động", .premiumRequired: "Cần Premium", .free: "Miễn phí",
            .protectionUnlocked: "Bảo vệ VPN đã được mở khóa", .choosePlanToStart: "Chọn gói để bắt đầu bảo vệ",
            .choosePlan: "Chọn gói", .restorePurchases: "Khôi phục giao dịch", .support: "Hỗ trợ",
            .contactSupport: "Liên hệ hỗ trợ", .privacyPolicy: "Chính sách quyền riêng tư", .appleStandardEULA: "EULA tiêu chuẩn của Apple",
            .upgrade: "Nâng cấp", .vpnStartFailure: "Không thể khởi động VPN. Vui lòng thử lại.",
            .diagnostics: "Chẩn đoán", .state: "Trạng thái", .location: "Vị trí", .message: "Thông báo",
            .notConfigured: "Chưa cấu hình - chạm để mở Cấu hình", .secureExitNode: "Exit node bảo mật",
            .vietnam: "Việt Nam", .startVPNHint: "Bắt đầu VPN tunnel tới vị trí đã chọn",
            .stopVPNHint: "Dừng VPN tunnel", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "Mở khóa bảo vệ internet riêng tư và mã hóa.", .benefitTunnel: "VPN tunnel bảo mật",
            .benefitWifi: "Bảo vệ khi dùng Wi-Fi công cộng", .benefitFast: "Kết nối nhanh một chạm",
            .noPlans: "Chưa có gói khả dụng", .noPlansDetail: "StoreKit không trả về Monthly_Premium hoặc Yearly_Premium.",
            .subscriptionDisclosure: "Gói đăng ký tự động gia hạn trừ khi hủy ít nhất 24 giờ trước kỳ gia hạn. Dùng thử miễn phí chỉ bắt đầu sau khi đăng ký nếu App Store cung cấp.",
            .manageSubscription: "Quản lý gói đăng ký",
            .privacy: "Quyền riêng tư", .eula: "EULA", .notNow: "Để sau", .disconnected: "Đã ngắt kết nối",
            .connecting: "Đang kết nối", .connected: "Đã kết nối", .disconnecting: "Đang ngắt kết nối", .failed: "Lỗi",
            .disconnectedSubtitle: "VPN tunnel đang tắt", .connectingSubtitle: "Đang khởi động VPN tunnel bảo mật",
            .connectedSubtitle: "Lưu lượng của bạn đang được bảo vệ", .disconnectingSubtitle: "Đang dừng VPN tunnel",
            .failedSubtitle: "VPN cần được kiểm tra",
        ],
        .chinese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "来自越南的私密加密网络",
            .signInRequired: "需要登录",
            .configuration: "设置", .done: "完成", .subscription: "订阅", .status: "状态",
            .premiumActive: "Premium 已激活", .premiumRequired: "需要 Premium", .free: "免费",
            .protectionUnlocked: "VPN 保护已解锁", .choosePlanToStart: "选择套餐以开始保护",
            .choosePlan: "选择套餐", .restorePurchases: "恢复购买", .support: "支持",
            .contactSupport: "联系支持", .privacyPolicy: "隐私政策", .appleStandardEULA: "Apple 标准 EULA",
            .upgrade: "升级", .vpnStartFailure: "VPN 无法启动。请重试。",
            .diagnostics: "诊断", .state: "状态", .location: "位置", .message: "消息",
            .notConfigured: "尚未配置 - 点击打开设置", .secureExitNode: "安全出口节点", .vietnam: "越南",
            .startVPNHint: "连接到所选位置的 VPN 隧道", .stopVPNHint: "停止 VPN 隧道",
            .paywallTitle: "FlowVPN Premium", .paywallSubtitle: "解锁私密、加密的互联网保护。",
            .benefitTunnel: "安全 VPN 隧道", .benefitWifi: "公共 Wi-Fi 保护", .benefitFast: "一键快速连接",
            .noPlans: "暂无可用套餐", .noPlansDetail: "StoreKit 未返回 Monthly_Premium 或 Yearly_Premium。",
            .subscriptionDisclosure: "订阅会自动续订，除非在续订前至少 24 小时取消。若 App Store 提供免费试用，试用将在订阅后开始。",
            .manageSubscription: "管理订阅",
            .privacy: "隐私", .eula: "EULA", .notNow: "暂不", .disconnected: "未连接",
            .connecting: "正在连接", .connected: "已连接", .disconnecting: "正在断开", .failed: "失败",
            .disconnectedSubtitle: "VPN 隧道已关闭", .connectingSubtitle: "正在启动安全 VPN 隧道",
            .connectedSubtitle: "你的流量正在受到保护", .disconnectingSubtitle: "正在停止 VPN 隧道",
            .failedSubtitle: "VPN 需要检查",
        ],
        .japanese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "ベトナム経由のプライベートな暗号化通信",
            .signInRequired: "サインインが必要です",
            .configuration: "設定", .done: "完了", .subscription: "サブスクリプション", .status: "ステータス",
            .premiumActive: "Premium 有効", .premiumRequired: "Premium が必要", .free: "無料",
            .protectionUnlocked: "VPN 保護が有効です", .choosePlanToStart: "保護を開始するにはプランを選択",
            .choosePlan: "プランを選択", .restorePurchases: "購入を復元", .support: "サポート",
            .contactSupport: "サポートに連絡", .privacyPolicy: "プライバシーポリシー", .appleStandardEULA: "Apple 標準 EULA",
            .upgrade: "アップグレード", .vpnStartFailure: "VPN を開始できませんでした。もう一度お試しください。",
            .diagnostics: "診断", .state: "状態", .location: "場所", .message: "メッセージ",
            .notConfigured: "未設定 - タップして設定を開く", .secureExitNode: "安全な出口ノード", .vietnam: "ベトナム",
            .startVPNHint: "選択した場所への VPN トンネルを開始します", .stopVPNHint: "VPN トンネルを停止します",
            .paywallTitle: "FlowVPN Premium", .paywallSubtitle: "プライベートで暗号化されたインターネット保護を解除します。",
            .benefitTunnel: "安全な VPN トンネル", .benefitWifi: "公共 Wi-Fi での保護", .benefitFast: "ワンタップで高速接続",
            .noPlans: "利用可能なプランがありません", .noPlansDetail: "StoreKit が Monthly_Premium または Yearly_Premium を返しませんでした。",
            .subscriptionDisclosure: "サブスクリプションは、更新の24時間前までにキャンセルしない限り自動更新されます。App Storeで提供される場合、無料トライアルは登録後に開始されます。",
            .manageSubscription: "サブスクリプションを管理",
            .privacy: "プライバシー", .eula: "EULA", .notNow: "後で", .disconnected: "未接続",
            .connecting: "接続中", .connected: "接続済み", .disconnecting: "切断中", .failed: "失敗",
            .disconnectedSubtitle: "VPN トンネルはオフです", .connectingSubtitle: "安全な VPN トンネルを開始中",
            .connectedSubtitle: "通信は保護されています", .disconnectingSubtitle: "VPN トンネルを停止中",
            .failedSubtitle: "VPN の確認が必要です",
        ],
        .korean: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "베트남을 통한 비공개 암호화 인터넷",
            .signInRequired: "로그인이 필요합니다",
            .configuration: "설정", .done: "완료", .subscription: "구독", .status: "상태",
            .premiumActive: "Premium 활성화됨", .premiumRequired: "Premium 필요", .free: "무료",
            .protectionUnlocked: "VPN 보호가 활성화되었습니다", .choosePlanToStart: "보호를 시작하려면 플랜을 선택하세요",
            .choosePlan: "플랜 선택", .restorePurchases: "구매 복원", .support: "지원",
            .contactSupport: "지원 문의", .privacyPolicy: "개인정보 처리방침", .appleStandardEULA: "Apple 표준 EULA",
            .upgrade: "업그레이드", .vpnStartFailure: "VPN을 시작할 수 없습니다. 다시 시도해 주세요.",
            .diagnostics: "진단", .state: "상태", .location: "위치", .message: "메시지",
            .notConfigured: "설정되지 않음 - 탭하여 설정 열기", .secureExitNode: "보안 출구 노드", .vietnam: "베트남",
            .startVPNHint: "선택한 위치로 VPN 터널을 시작합니다", .stopVPNHint: "VPN 터널을 중지합니다",
            .paywallTitle: "FlowVPN Premium", .paywallSubtitle: "비공개 암호화 인터넷 보호를 잠금 해제하세요.",
            .benefitTunnel: "보안 VPN 터널", .benefitWifi: "공용 Wi-Fi 보호", .benefitFast: "빠른 원탭 연결",
            .noPlans: "사용 가능한 플랜 없음", .noPlansDetail: "StoreKit이 Monthly_Premium 또는 Yearly_Premium을 반환하지 않았습니다.",
            .subscriptionDisclosure: "구독은 갱신 최소 24시간 전에 취소하지 않으면 자동 갱신됩니다. App Store에서 제공되는 경우 무료 체험은 구독 후 시작됩니다.",
            .manageSubscription: "구독 관리",
            .privacy: "개인정보", .eula: "EULA", .notNow: "나중에", .disconnected: "연결 끊김",
            .connecting: "연결 중", .connected: "연결됨", .disconnecting: "연결 해제 중", .failed: "실패",
            .disconnectedSubtitle: "VPN 터널이 꺼져 있습니다", .connectingSubtitle: "보안 VPN 터널을 시작하는 중",
            .connectedSubtitle: "트래픽이 보호되고 있습니다", .disconnectingSubtitle: "VPN 터널을 중지하는 중",
            .failedSubtitle: "VPN 확인이 필요합니다",
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
