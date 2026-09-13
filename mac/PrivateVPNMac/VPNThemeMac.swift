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
    case account, signedIn, signedOut, signInRequired, signInTitle, email, loginCode, sendCode, verifyCode, signOut
    case updateRequired, updateRequiredDetail, update
    case deleteAccount, deleteAccountConfirm, deleteAccountDone
    case cancel
    case emailPlaceholder, codePlaceholder, invalidEmail, devCode, loginCodeSent
    case systemLanguage, language, appSubtitle, subscription, status
    case premiumActive, premiumRequired, free, protectionUnlocked, choosePlanToStart
    case choosePlan, restorePurchases, support, contactSupport, privacyPolicy
    case termsOfUse, upgrade, preparingPermission, vpnStartFailure
    case paywallTitle, paywallSubtitle, benefitTunnel, benefitWifi, benefitFast
    case privacy, notNow
    case plan, select, connect, disconnect, openSettings, upgradeToPremium, quit
    case disconnected, connecting, connected, disconnecting, failed
    case serverLocation, loadingLocations, noServerAvailable, refreshLocations
    case usingSavedServers
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
            .account: "Account", .signedIn: "Signed in", .signedOut: "Signed out", .signInRequired: "Sign in required", .email: "Email",
            .signInTitle: "Sign In", .loginCode: "Login code", .sendCode: "Send Code", .verifyCode: "Verify Code", .signOut: "Sign Out",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456", .invalidEmail: "Please enter a valid email address.",
            .devCode: "Dev code: %@", .loginCodeSent: "Login code sent",
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "Private, encrypted internet from Vietnam", .updateRequired: "Update Required", .updateRequiredDetail: "A new version of VPNFlow is required to continue. Please download the latest version at meetflowai.site/buy.", .update: "Update", .deleteAccount: "Delete Account", .deleteAccountConfirm: "This permanently deletes your account and all data. This cannot be undone.", .deleteAccountDone: "Account deleted.", .cancel: "Cancel",
            .subscription: "Subscription", .status: "Status", .premiumActive: "Premium Active",
            .premiumRequired: "Premium Required", .free: "Free", .protectionUnlocked: "VPN protection is unlocked",
            .choosePlanToStart: "Choose a plan to start protection", .choosePlan: "Choose Plan",
            .restorePurchases: "Refresh Purchase Status", .support: "Support", .contactSupport: "Contact Support",
            .privacyPolicy: "Privacy Policy", .termsOfUse: "Terms of Use", .upgrade: "Upgrade",
            .preparingPermission: "Preparing VPN permission…", .vpnStartFailure: "VPN could not start. Please try again.", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "Unlock private, encrypted internet protection.", .benefitTunnel: "Secure VPN tunnel",
            .benefitWifi: "Protection on public Wi-Fi", .benefitFast: "Fast one-click connection",
            .privacy: "Privacy", .notNow: "Not Now", .plan: "Plan",
            .select: "Select", .connect: "Connect", .disconnect: "Disconnect", .openSettings: "Open Settings",
            .upgradeToPremium: "Upgrade to Premium", .quit: "Quit FlowVPN",
            .disconnected: "Disconnected", .connecting: "Connecting", .connected: "Connected",
            .disconnecting: "Disconnecting", .failed: "Failed", .serverLocation: "Server",
            .loadingLocations: "Loading servers…", .noServerAvailable: "No server available",
            .refreshLocations: "Refresh servers",
            .usingSavedServers: "Offline mode — using saved servers",
            .devices: "Devices", .revoke: "Revoke", .revokeDeviceConfirm: "Revoke this device? It will no longer be able to connect.", .thisDevice: "This device", .deviceRevoked: "Device revoked.", .noDevices: "No devices registered.", .active: "Active", .revoked: "Revoked", .loadingDevices: "Loading devices…"
        ],
        .vietnamese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "Internet riêng tư, mã hóa từ Việt Nam", .updateRequired: "Cần cập nhật", .updateRequiredDetail: "Cần phiên bản mới của VPNFlow để tiếp tục. Vui lòng tải bản mới tại meetflowai.site/buy.", .update: "Cập nhật", .deleteAccount: "Xóa tài khoản", .deleteAccountConfirm: "Thao tác này sẽ xóa vĩnh viễn tài khoản và toàn bộ dữ liệu của bạn. Không thể hoàn tác.", .deleteAccountDone: "Đã xóa tài khoản.", .cancel: "Hủy",
            .signInRequired: "Cần đăng nhập",
            .signInTitle: "Đăng nhập", .invalidEmail: "Vui lòng nhập địa chỉ email hợp lệ.",
            .devCode: "Mã dev: %@", .loginCodeSent: "Mã đăng nhập đã được gửi",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .subscription: "Gói đăng ký", .status: "Trạng thái", .premiumActive: "Premium đang hoạt động",
            .premiumRequired: "Cần Premium", .free: "Miễn phí", .protectionUnlocked: "Bảo vệ VPN đã được mở khóa",
            .choosePlanToStart: "Chọn gói để bắt đầu bảo vệ", .choosePlan: "Chọn gói",
            .restorePurchases: "Làm mới trạng thái gói", .support: "Hỗ trợ", .contactSupport: "Liên hệ hỗ trợ",
            .privacyPolicy: "Chính sách quyền riêng tư", .termsOfUse: "Điều khoản sử dụng", .upgrade: "Nâng cấp",
            .preparingPermission: "Đang chờ cấp quyền VPN…", .vpnStartFailure: "Không thể khởi động VPN. Vui lòng thử lại.", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "Mở khóa bảo vệ internet riêng tư và mã hóa.", .benefitTunnel: "VPN tunnel bảo mật",
            .benefitWifi: "Bảo vệ khi dùng Wi-Fi công cộng", .benefitFast: "Kết nối nhanh một click",
            .privacy: "Quyền riêng tư", .notNow: "Để sau", .plan: "Gói",
            .select: "Chọn", .connect: "Kết nối", .disconnect: "Ngắt kết nối", .openSettings: "Mở Cài đặt",
            .upgradeToPremium: "Nâng cấp Premium", .quit: "Thoát FlowVPN",
            .disconnected: "Đã ngắt kết nối", .connecting: "Đang kết nối", .connected: "Đã kết nối",
            .disconnecting: "Đang ngắt kết nối", .failed: "Lỗi", .serverLocation: "Máy chủ",
            .loadingLocations: "Đang tải máy chủ…", .noServerAvailable: "Chưa có máy chủ khả dụng",
            .refreshLocations: "Tải lại máy chủ",
            .usingSavedServers: "Chế độ offline — đang dùng máy chủ đã lưu",
            .devices: "Thiết bị", .revoke: "Thu hồi", .revokeDeviceConfirm: "Thu hồi thiết bị này? Thiết bị sẽ không thể kết nối được nữa.", .thisDevice: "Thiết bị này", .deviceRevoked: "Đã thu hồi thiết bị.", .noDevices: "Chưa có thiết bị nào được đăng ký.", .active: "Hoạt động", .revoked: "Đã thu hồi", .loadingDevices: "Đang tải thiết bị…"
        ],
        .chinese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "来自越南的私密加密网络", .updateRequired: "需要更新", .updateRequiredDetail: "需要新版 VPNFlow 才能继续。请前往 meetflowai.site/buy 下载最新版本。", .update: "更新", .deleteAccount: "删除账户", .deleteAccountConfirm: "此操作将永久删除您的账户和所有数据，且无法撤销。", .deleteAccountDone: "账户已删除。", .cancel: "取消",
            .signInRequired: "需要登录",
            .signInTitle: "登录", .invalidEmail: "请输入有效的邮箱地址。",
            .devCode: "开发者验证码：%@", .loginCodeSent: "登录验证码已发送",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .subscription: "订阅", .status: "状态", .premiumActive: "Premium 已激活",
            .premiumRequired: "需要 Premium", .free: "免费", .protectionUnlocked: "VPN 保护已解锁",
            .choosePlanToStart: "选择套餐以开始保护", .choosePlan: "选择套餐",
            .restorePurchases: "刷新订阅状态", .support: "支持", .contactSupport: "联系支持",
            .privacyPolicy: "隐私政策", .termsOfUse: "使用条款", .upgrade: "升级",
            .preparingPermission: "正在等待 VPN 权限…", .vpnStartFailure: "VPN 无法启动。请重试。", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "解锁私密、加密的互联网保护。", .benefitTunnel: "安全 VPN 隧道",
            .benefitWifi: "公共 Wi-Fi 保护", .benefitFast: "一键快速连接",
            .privacy: "隐私", .notNow: "暂不", .plan: "套餐",
            .select: "选择", .connect: "连接", .disconnect: "断开", .openSettings: "打开设置",
            .upgradeToPremium: "升级到 Premium", .quit: "退出 FlowVPN",
            .disconnected: "未连接", .connecting: "正在连接", .connected: "已连接",
            .disconnecting: "正在断开", .failed: "失败", .serverLocation: "服务器",
            .loadingLocations: "正在加载服务器…", .noServerAvailable: "暂无可用服务器",
            .refreshLocations: "刷新服务器",
            .usingSavedServers: "离线模式 — 正在使用已保存的服务器",
            .devices: "设备", .revoke: "撤销", .revokeDeviceConfirm: "撤销此设备？该设备将无法再连接。", .thisDevice: "当前设备", .deviceRevoked: "设备已撤销。", .noDevices: "尚未注册任何设备。", .active: "活跃", .revoked: "已撤销", .loadingDevices: "正在加载设备…"
        ],
        .japanese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "ベトナム経由のプライベートな暗号化通信", .updateRequired: "アップデートが必要です", .updateRequiredDetail: "VPNFlow の新しいバージョンが必要です。最新版は meetflowai.site/buy からダウンロードしてください。", .update: "アップデート", .deleteAccount: "アカウントを削除", .deleteAccountConfirm: "これによりアカウントとすべてのデータが完全に削除されます。元に戻せません。", .deleteAccountDone: "アカウントを削除しました。", .cancel: "キャンセル",
            .signInRequired: "サインインが必要です",
            .signInTitle: "サインイン", .invalidEmail: "有効なメールアドレスを入力してください。",
            .devCode: "開発用コード: %@", .loginCodeSent: "ログインコードを送信しました",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .subscription: "サブスクリプション", .status: "ステータス", .premiumActive: "Premium 有効",
            .premiumRequired: "Premium が必要", .free: "無料", .protectionUnlocked: "VPN 保護が有効です",
            .choosePlanToStart: "保護を開始するにはプランを選択", .choosePlan: "プランを選択",
            .restorePurchases: "購入状態を更新", .support: "サポート", .contactSupport: "サポートに連絡",
            .privacyPolicy: "プライバシーポリシー", .termsOfUse: "利用規約", .upgrade: "アップグレード",
            .preparingPermission: "VPN の許可を待機中…", .vpnStartFailure: "VPN を開始できませんでした。もう一度お試しください。", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "プライベートで暗号化されたインターネット保護を解除します。", .benefitTunnel: "安全な VPN トンネル",
            .benefitWifi: "公共 Wi-Fi での保護", .benefitFast: "ワンクリックで高速接続",
            .privacy: "プライバシー", .notNow: "後で", .plan: "プラン",
            .select: "選択", .connect: "接続", .disconnect: "切断", .openSettings: "設定を開く",
            .upgradeToPremium: "Premium にアップグレード", .quit: "FlowVPN を終了",
            .disconnected: "未接続", .connecting: "接続中", .connected: "接続済み",
            .disconnecting: "切断中", .failed: "失敗", .serverLocation: "サーバー",
            .loadingLocations: "サーバーを読み込み中…", .noServerAvailable: "利用可能なサーバーがありません",
            .refreshLocations: "サーバーを更新",
            .usingSavedServers: "オフラインモード — 保存済みサーバーを使用中",
            .devices: "デバイス", .revoke: "取り消す", .revokeDeviceConfirm: "このデバイスを取り消しますか？このデバイスは接続できなくなります。", .thisDevice: "このデバイス", .deviceRevoked: "デバイスを取り消しました。", .noDevices: "登録されたデバイスがありません。", .active: "アクティブ", .revoked: "取り消し済み", .loadingDevices: "デバイスを読み込み中…"
        ],
        .korean: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "베트남을 통한 비공개 암호화 인터넷", .updateRequired: "업데이트 필요", .updateRequiredDetail: "계속하려면 새 VPNFlow 버전이 필요합니다. 최신 버전을 meetflowai.site/buy에서 다운로드하세요.", .update: "업데이트", .deleteAccount: "계정 삭제", .deleteAccountConfirm: "계정과 모든 데이터가 영구적으로 삭제되며 되돌릴 수 없습니다.", .deleteAccountDone: "계정이 삭제되었습니다.", .cancel: "취소",
            .signInRequired: "로그인이 필요합니다",
            .signInTitle: "로그인", .invalidEmail: "유효한 이메일 주소를 입력하세요.",
            .devCode: "개발자 코드: %@", .loginCodeSent: "로그인 코드가 전송되었습니다",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .subscription: "구독", .status: "상태", .premiumActive: "Premium 활성화됨",
            .premiumRequired: "Premium 필요", .free: "무료", .protectionUnlocked: "VPN 보호가 활성화되었습니다",
            .choosePlanToStart: "보호를 시작하려면 플랜을 선택하세요", .choosePlan: "플랜 선택",
            .restorePurchases: "구매 상태 새로 고침", .support: "지원", .contactSupport: "지원 문의",
            .privacyPolicy: "개인정보 처리방침", .termsOfUse: "이용약관", .upgrade: "업그레이드",
            .preparingPermission: "VPN 권한을 기다리는 중…", .vpnStartFailure: "VPN을 시작할 수 없습니다. 다시 시도해 주세요.", .paywallTitle: "FlowVPN Premium",
            .paywallSubtitle: "비공개 암호화 인터넷 보호를 잠금 해제하세요.", .benefitTunnel: "보안 VPN 터널",
            .benefitWifi: "공용 Wi-Fi 보호", .benefitFast: "빠른 원클릭 연결",
            .privacy: "개인정보", .notNow: "나중에", .plan: "플랜",
            .select: "선택", .connect: "연결", .disconnect: "연결 해제", .openSettings: "설정 열기",
            .upgradeToPremium: "Premium으로 업그레이드", .quit: "FlowVPN 종료",
            .disconnected: "연결 끊김", .connecting: "연결 중", .connected: "연결됨",
            .disconnecting: "연결 해제 중", .failed: "실패", .serverLocation: "서버",
            .loadingLocations: "서버를 불러오는 중…", .noServerAvailable: "사용 가능한 서버 없음",
            .refreshLocations: "서버 새로고침",
            .usingSavedServers: "오프라인 모드 — 저장된 서버 사용 중",
            .devices: "기기", .revoke: "해지", .revokeDeviceConfirm: "이 기기를 해지하시겠습니까? 이 기기는 더 이상 연결할 수 없습니다.", .thisDevice: "현재 기기", .deviceRevoked: "기기가 해지되었습니다.", .noDevices: "등록된 기기가 없습니다.", .active: "활성", .revoked: "해지됨", .loadingDevices: "기기를 불러오는 중…"
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
