import SwiftUI

/// Shared visual theme for the PrivateVPN macOS UI — mirrors the iOS theme.
enum VPNThemeMac {
    /// Accent — green used for the connected state and the primary action.
    static let accent = Color(red: 0.20, green: 0.78, blue: 0.45)

    static let backgroundTop = Color(red: 0.02, green: 0.08, blue: 0.15)
    static let backgroundBottom = Color(red: 0.04, green: 0.12, blue: 0.23)

    static let cardBackground = Color.white.opacity(0.06)
    static let cardStroke = Color.white.opacity(0.12)

    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.6)

    static let backgroundGradient = LinearGradient(
        colors: [backgroundTop, backgroundBottom],
        startPoint: .top,
        endPoint: .bottom
    )
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
    case systemLanguage, language, appSubtitle, subscription, status
    case premiumActive, premiumRequired, free, protectionUnlocked, choosePlanToStart
    case choosePlan, restorePurchases, support, contactSupport, privacyPolicy
    case appleStandardEULA, upgrade, vpnStartFailure
    case paywallTitle, paywallSubtitle, benefitTunnel, benefitWifi, benefitFast
    case noPlans, noPlansDetail, privacy, eula, notNow
    case plan, connect, disconnect, openSettings, upgradeToPremium, quit
    case disconnected, connecting, connected, disconnecting, failed
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
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "Private, encrypted internet from Vietnam",
            .subscription: "Subscription", .status: "Status", .premiumActive: "Premium Active",
            .premiumRequired: "Premium Required", .free: "Free", .protectionUnlocked: "VPN protection is unlocked",
            .choosePlanToStart: "Choose a plan to start protection", .choosePlan: "Choose Plan",
            .restorePurchases: "Restore Purchases", .support: "Support", .contactSupport: "Contact Support",
            .privacyPolicy: "Privacy Policy", .appleStandardEULA: "Apple Standard EULA", .upgrade: "Upgrade",
            .vpnStartFailure: "VPN could not start. Please try again.", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "Unlock private, encrypted internet protection.", .benefitTunnel: "Secure VPN tunnel",
            .benefitWifi: "Protection on public Wi-Fi", .benefitFast: "Fast one-click connection",
            .noPlans: "No plans available", .noPlansDetail: "StoreKit did not return Monthly_Premium or Yearly_Premium.",
            .privacy: "Privacy", .eula: "EULA", .notNow: "Not Now", .plan: "Plan",
            .connect: "Connect", .disconnect: "Disconnect", .openSettings: "Open Settings",
            .upgradeToPremium: "Upgrade to Premium", .quit: "Quit FlowVPN",
            .disconnected: "Disconnected", .connecting: "Connecting", .connected: "Connected",
            .disconnecting: "Disconnecting", .failed: "Failed",
        ],
        .vietnamese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "Internet riêng tư, mã hóa từ Việt Nam",
            .subscription: "Gói đăng ký", .status: "Trạng thái", .premiumActive: "Premium đang hoạt động",
            .premiumRequired: "Cần Premium", .free: "Miễn phí", .protectionUnlocked: "Bảo vệ VPN đã được mở khóa",
            .choosePlanToStart: "Chọn gói để bắt đầu bảo vệ", .choosePlan: "Chọn gói",
            .restorePurchases: "Khôi phục giao dịch", .support: "Hỗ trợ", .contactSupport: "Liên hệ hỗ trợ",
            .privacyPolicy: "Chính sách quyền riêng tư", .appleStandardEULA: "EULA tiêu chuẩn của Apple", .upgrade: "Nâng cấp",
            .vpnStartFailure: "Không thể khởi động VPN. Vui lòng thử lại.", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "Mở khóa bảo vệ internet riêng tư và mã hóa.", .benefitTunnel: "VPN tunnel bảo mật",
            .benefitWifi: "Bảo vệ khi dùng Wi-Fi công cộng", .benefitFast: "Kết nối nhanh một click",
            .noPlans: "Chưa có gói khả dụng", .noPlansDetail: "StoreKit không trả về Monthly_Premium hoặc Yearly_Premium.",
            .privacy: "Quyền riêng tư", .eula: "EULA", .notNow: "Để sau", .plan: "Gói",
            .connect: "Kết nối", .disconnect: "Ngắt kết nối", .openSettings: "Mở Cài đặt",
            .upgradeToPremium: "Nâng cấp Premium", .quit: "Thoát FlowVPN",
            .disconnected: "Đã ngắt kết nối", .connecting: "Đang kết nối", .connected: "Đã kết nối",
            .disconnecting: "Đang ngắt kết nối", .failed: "Lỗi",
        ],
        .chinese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "来自越南的私密加密网络",
            .subscription: "订阅", .status: "状态", .premiumActive: "Premium 已激活",
            .premiumRequired: "需要 Premium", .free: "免费", .protectionUnlocked: "VPN 保护已解锁",
            .choosePlanToStart: "选择套餐以开始保护", .choosePlan: "选择套餐",
            .restorePurchases: "恢复购买", .support: "支持", .contactSupport: "联系支持",
            .privacyPolicy: "隐私政策", .appleStandardEULA: "Apple 标准 EULA", .upgrade: "升级",
            .vpnStartFailure: "VPN 无法启动。请重试。", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "解锁私密、加密的互联网保护。", .benefitTunnel: "安全 VPN 隧道",
            .benefitWifi: "公共 Wi-Fi 保护", .benefitFast: "一键快速连接",
            .noPlans: "暂无可用套餐", .noPlansDetail: "StoreKit 未返回 Monthly_Premium 或 Yearly_Premium。",
            .privacy: "隐私", .eula: "EULA", .notNow: "暂不", .plan: "套餐",
            .connect: "连接", .disconnect: "断开", .openSettings: "打开设置",
            .upgradeToPremium: "升级到 Premium", .quit: "退出 FlowVPN",
            .disconnected: "未连接", .connecting: "正在连接", .connected: "已连接",
            .disconnecting: "正在断开", .failed: "失败",
        ],
        .japanese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "ベトナム経由のプライベートな暗号化通信",
            .subscription: "サブスクリプション", .status: "ステータス", .premiumActive: "Premium 有効",
            .premiumRequired: "Premium が必要", .free: "無料", .protectionUnlocked: "VPN 保護が有効です",
            .choosePlanToStart: "保護を開始するにはプランを選択", .choosePlan: "プランを選択",
            .restorePurchases: "購入を復元", .support: "サポート", .contactSupport: "サポートに連絡",
            .privacyPolicy: "プライバシーポリシー", .appleStandardEULA: "Apple 標準 EULA", .upgrade: "アップグレード",
            .vpnStartFailure: "VPN を開始できませんでした。もう一度お試しください。", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "プライベートで暗号化されたインターネット保護を解除します。", .benefitTunnel: "安全な VPN トンネル",
            .benefitWifi: "公共 Wi-Fi での保護", .benefitFast: "ワンクリックで高速接続",
            .noPlans: "利用可能なプランがありません", .noPlansDetail: "StoreKit が Monthly_Premium または Yearly_Premium を返しませんでした。",
            .privacy: "プライバシー", .eula: "EULA", .notNow: "後で", .plan: "プラン",
            .connect: "接続", .disconnect: "切断", .openSettings: "設定を開く",
            .upgradeToPremium: "Premium にアップグレード", .quit: "FlowVPN を終了",
            .disconnected: "未接続", .connecting: "接続中", .connected: "接続済み",
            .disconnecting: "切断中", .failed: "失敗",
        ],
        .korean: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "베트남을 통한 비공개 암호화 인터넷",
            .subscription: "구독", .status: "상태", .premiumActive: "Premium 활성화됨",
            .premiumRequired: "Premium 필요", .free: "무료", .protectionUnlocked: "VPN 보호가 활성화되었습니다",
            .choosePlanToStart: "보호를 시작하려면 플랜을 선택하세요", .choosePlan: "플랜 선택",
            .restorePurchases: "구매 복원", .support: "지원", .contactSupport: "지원 문의",
            .privacyPolicy: "개인정보 처리방침", .appleStandardEULA: "Apple 표준 EULA", .upgrade: "업그레이드",
            .vpnStartFailure: "VPN을 시작할 수 없습니다. 다시 시도해 주세요.", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "비공개 암호화 인터넷 보호를 잠금 해제하세요.", .benefitTunnel: "보안 VPN 터널",
            .benefitWifi: "공용 Wi-Fi 보호", .benefitFast: "빠른 원클릭 연결",
            .noPlans: "사용 가능한 플랜 없음", .noPlansDetail: "StoreKit이 Monthly_Premium 또는 Yearly_Premium을 반환하지 않았습니다.",
            .privacy: "개인정보", .eula: "EULA", .notNow: "나중에", .plan: "플랜",
            .connect: "연결", .disconnect: "연결 해제", .openSettings: "설정 열기",
            .upgradeToPremium: "Premium으로 업그레이드", .quit: "FlowVPN 종료",
            .disconnected: "연결 끊김", .connecting: "연결 중", .connected: "연결됨",
            .disconnecting: "연결 해제 중", .failed: "실패",
        ],
    ]
}

extension String {
    func localizedVPNState(_ language: AppLanguage) -> String {
        switch self {
        case "Connected": return AppLanguageStore.text(.connected, language: language)
        case "Connecting…": return AppLanguageStore.text(.connecting, language: language)
        case "Disconnecting…": return AppLanguageStore.text(.disconnecting, language: language)
        case "Failed": return AppLanguageStore.text(.failed, language: language)
        default: return AppLanguageStore.text(.disconnected, language: language)
        }
    }
}
