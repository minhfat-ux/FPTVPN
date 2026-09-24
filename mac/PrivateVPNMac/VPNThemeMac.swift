import SwiftUI

/// Shared visual theme for the PrivateVPN macOS UI — mirrors the iOS theme
/// (iOS/PrivateVPN/Theme.swift) so hai nền tảng render giống nhau: luôn dark,
/// FlowVPN navy palette (#0A1F3B base, #0E2747 cards, #16385E gradient bottom),
/// accent xanh system blue (#007AFF), trạng thái kết nối xanh brand (#33C773).
enum VPNThemeMac {
    /// Accent — iOS system blue, dùng cho hành động chính và highlight.
    static let accent = Color(red: 0/255, green: 122/255, blue: 255/255)

    /// Success green — trạng thái đã kết nối (FlowVPN brand green #33C773).
    static let success = Color(red: 51/255, green: 199/255, blue: 115/255)

    /// Tên app với "Flow" tô màu brand — giống bản iOS.
    ///
    /// Trả `Text` (không phải `some View`) để ghép chuỗi được và vẫn ăn font/size
    /// đặt ở ngoài. Màu trắng đặt ngay trong đây vì `foregroundStyle` áp lên cả
    /// `Text` đã ghép sẽ đè mất màu xanh của "Flow".
    static var brandName: Text {
        Text("VPN").foregroundStyle(label)
            + Text("Flow").foregroundStyle(success)
    }

    /// Tiêu đề paywall với "Flow" tô màu brand — giống bản iOS.
    static func brandTitle(_ text: String) -> Text {
        let prefix = "VPNFlow"
        guard text.hasPrefix(prefix) else { return Text(text).foregroundStyle(label) }
        return Text("VPN").foregroundStyle(label)
            + Text("Flow").foregroundStyle(success)
            + Text(String(text.dropFirst(prefix.count))).foregroundStyle(label)
    }

    /// FlowVPN navy palette (FPT Harness style) — always dark.
    static let navyBase = Color(red: 10/255, green: 31/255, blue: 59/255)      // #0A1F3B
    static let navyLayer1 = Color(red: 14/255, green: 39/255, blue: 71/255)    // #0E2747
    static let navyLayer2 = Color(red: 18/255, green: 48/255, blue: 82/255)    // #123052
    static let navyLayer3 = Color(red: 22/255, green: 56/255, blue: 94/255)    // #16385E

    static let backgroundTop = navyBase
    static let backgroundBottom = navyLayer3

    static let cardBackground = navyLayer1
    static let cardStroke = Color.white.opacity(0.12)

    /// Nền ô nhập liệu — tương đương `.tertiarySystemFill` bản iOS (dark mode).
    static let fieldBackground = Color.white.opacity(0.12)

    static let backgroundGradient = LinearGradient(
        colors: [backgroundTop, backgroundBottom],
        startPoint: .top,
        endPoint: .bottom
    )

    // Dark-only semantic colors.
    static let label = Color.white
    static let secondaryLabel = Color.white.opacity(0.6)
    static let tertiaryLabel = Color.white.opacity(0.4)

    // Tên cũ giữ lại cho menu bar / paywall đang tham chiếu.
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.6)
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
    case trialBannerTitle, trialBannerSubtitle
    case choosePlan, restorePurchases, support, contactSupport, privacyPolicy
    case termsOfUse, upgrade, preparingPermission, vpnStartFailure
    case paywallTitle, paywallSubtitle, benefitTunnel, benefitWifi, benefitFast
    case privacy, notNow
    case plan, select, connect, disconnect, openSettings, upgradeToPremium, quit
    case yourPlan, renew, expiresOn, daysLeft
    case disconnected, connecting, connected, disconnecting, failed
    case serverLocation, loadingLocations, noServerAvailable, refreshLocations
    case usingSavedServers
    case configuration, done, diagnostics, state, location, message, notConfigured, vietnam
    /// A10 §2g — 8 dòng số live của thẻ Diagnostics (bê nguyên tên khoá + chuỗi của iOS,
    /// xem `iOS/PrivateVPN/Theme.swift`) để hai nền tảng nhìn giống nhau.
    case diagDown, diagUp, diagObserved, diagDeclared, diagMore, diagAtMax, diagPath, diagStable
    /// §2h luật 5 — loss%/RTT. macOS KHÔNG có nguồn loss/RTT của QUIC (framework chỉ mở
    /// `MobileConnect/MobileServe/MobileStop`) ⇒ hai dòng này luôn hiện `—`; nhãn ghi rõ "(QUIC)"
    /// để không ai đọc nhầm là số đo thật.
    case diagLoss, diagRTT
    /// Cảnh báo "extension đang chạy là bản cũ" — %@ = version/build + đường dẫn, %@ = bản của app.
    case extensionStale
    case disconnectedSubtitle, connectingSubtitle, connectedSubtitle, disconnectingSubtitle, failedSubtitle
    case startVPNHint, stopVPNHint
    case devices, revoke, revokeDeviceConfirm, thisDevice, deviceRevoked, noDevices, active, revoked, loadingDevices
    case about, version, latestOnServer, latestDifferent, latestUnavailable
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
            .yourPlan: "Your plan", .renew: "Renew", .expiresOn: "Expires %@", .daysLeft: "%d days left",
            .premiumRequired: "Premium Required", .free: "Free", .protectionUnlocked: "VPN protection is unlocked",
            .choosePlanToStart: "Choose a plan to start protection", .choosePlan: "Choose Plan",
            .trialBannerTitle: "🎁 You're on a free 1-day trial", .trialBannerSubtitle: "%@ hours of trial left. Buy a plan to keep using the VPN after it ends.",
            .restorePurchases: "Refresh Purchase Status", .support: "Support", .contactSupport: "Contact Support",
            .privacyPolicy: "Privacy Policy", .termsOfUse: "Terms of Use",
            .about: "About", .version: "Version", .latestOnServer: "Latest on server", .latestDifferent: "DIFFERENT from installed build", .latestUnavailable: "(unavailable)",
            .upgrade: "Upgrade",
            .preparingPermission: "Preparing VPN permission…", .vpnStartFailure: "VPN could not start. Please try again.", .paywallTitle: "VPNFlow Premium",
            .paywallSubtitle: "Unlock private, encrypted internet protection.", .benefitTunnel: "Secure VPN tunnel",
            .benefitWifi: "Protection on public Wi-Fi", .benefitFast: "Fast one-click connection",
            .privacy: "Privacy", .notNow: "Not Now", .plan: "Plan",
            .select: "Select", .connect: "Connect", .disconnect: "Disconnect", .openSettings: "Open Settings",
            .upgradeToPremium: "Upgrade to Premium", .quit: "Quit VPNFlow",
            .disconnected: "Disconnected", .connecting: "Connecting", .connected: "Connected",
            .disconnecting: "Disconnecting", .failed: "Failed", .serverLocation: "Server",
            .loadingLocations: "Loading servers…", .noServerAvailable: "No server available",
            .refreshLocations: "Refresh servers",
            .usingSavedServers: "Offline mode — using saved servers",
            .devices: "Devices", .revoke: "Revoke", .revokeDeviceConfirm: "Revoke this device? It will no longer be able to connect.", .thisDevice: "This device", .deviceRevoked: "Device revoked.", .noDevices: "No devices registered.", .active: "Active", .revoked: "Revoked", .loadingDevices: "Loading devices…",
            .configuration: "Configuration", .done: "Done", .diagnostics: "Diagnostics", .state: "State", .location: "Location", .message: "Message",
            .diagDown: "Download ↓", .diagUp: "Upload ↑", .diagObserved: "Measured (ramp path)",
            .diagDeclared: "Currently declared", .diagMore: "Declared headroom",
            .diagAtMax: "Maxed out at this time", .diagPath: "Active path",
            .diagStable: "Locked level (stable)",
            .diagLoss: "Packet loss (QUIC)", .diagRTT: "RTT (QUIC)",
            .extensionStale: "⚠️ Running extension is an older build (%@) while the app is %@ — remove the old VPNFlow copy and reopen the app.",
            .notConfigured: "Not configured - tap to open Configuration", .vietnam: "Vietnam",
            .disconnectedSubtitle: "Your VPN tunnel is off", .connectingSubtitle: "Starting secure VPN tunnel",
            .connectedSubtitle: "Your traffic is protected", .disconnectingSubtitle: "Stopping VPN tunnel",
            .failedSubtitle: "VPN needs attention",
            .startVPNHint: "Starts the VPN tunnel to the selected location", .stopVPNHint: "Stops the VPN tunnel"
        ],
        .vietnamese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "Internet riêng tư, mã hóa từ Việt Nam", .updateRequired: "Cần cập nhật", .updateRequiredDetail: "Cần phiên bản mới của VPNFlow để tiếp tục. Vui lòng tải bản mới tại meetflowai.site/buy.", .update: "Cập nhật", .deleteAccount: "Xóa tài khoản", .deleteAccountConfirm: "Thao tác này sẽ xóa vĩnh viễn tài khoản và toàn bộ dữ liệu của bạn. Không thể hoàn tác.", .deleteAccountDone: "Đã xóa tài khoản.", .cancel: "Hủy",
            .signInRequired: "Cần đăng nhập",
            .signInTitle: "Đăng nhập", .invalidEmail: "Vui lòng nhập địa chỉ email hợp lệ.",
            .devCode: "Mã dev: %@", .loginCodeSent: "Mã đăng nhập đã được gửi",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .subscription: "Gói đăng ký", .status: "Trạng thái", .premiumActive: "Premium đang hoạt động",
            .yourPlan: "Gói của bạn", .renew: "Gia hạn", .expiresOn: "Hết hạn %@", .daysLeft: "Còn %d ngày",
            .premiumRequired: "Cần Premium", .free: "Miễn phí", .protectionUnlocked: "Bảo vệ VPN đã được mở khóa",
            .choosePlanToStart: "Chọn gói để bắt đầu bảo vệ", .choosePlan: "Chọn gói",
            .trialBannerTitle: "🎁 Bạn đang dùng bản dùng thử 1 ngày miễn phí", .trialBannerSubtitle: "Còn %@ giờ dùng thử. Mua gói để tiếp tục dùng VPN sau khi hết hạn.",
            .restorePurchases: "Làm mới trạng thái gói", .support: "Hỗ trợ", .contactSupport: "Liên hệ hỗ trợ",
            .privacyPolicy: "Chính sách quyền riêng tư", .termsOfUse: "Điều khoản sử dụng",
            .about: "Giới thiệu", .version: "Phiên bản", .latestOnServer: "Bản mới nhất trên máy chủ", .latestDifferent: "KHÁC bản đang cài", .latestUnavailable: "(không đọc được)",
            .upgrade: "Nâng cấp",
            .preparingPermission: "Đang chờ cấp quyền VPN…", .vpnStartFailure: "Không thể khởi động VPN. Vui lòng thử lại.", .paywallTitle: "VPNFlow Premium",
            .paywallSubtitle: "Mở khóa bảo vệ internet riêng tư và mã hóa.", .benefitTunnel: "VPN tunnel bảo mật",
            .benefitWifi: "Bảo vệ khi dùng Wi-Fi công cộng", .benefitFast: "Kết nối nhanh một click",
            .privacy: "Quyền riêng tư", .notNow: "Để sau", .plan: "Gói",
            .select: "Chọn", .connect: "Kết nối", .disconnect: "Ngắt kết nối", .openSettings: "Mở Cài đặt",
            .upgradeToPremium: "Nâng cấp Premium", .quit: "Thoát VPNFlow",
            .disconnected: "Đã ngắt kết nối", .connecting: "Đang kết nối", .connected: "Đã kết nối",
            .disconnecting: "Đang ngắt kết nối", .failed: "Lỗi", .serverLocation: "Máy chủ",
            .loadingLocations: "Đang tải máy chủ…", .noServerAvailable: "Chưa có máy chủ khả dụng",
            .refreshLocations: "Tải lại máy chủ",
            .usingSavedServers: "Chế độ offline — đang dùng máy chủ đã lưu",
            .devices: "Thiết bị", .revoke: "Thu hồi", .revokeDeviceConfirm: "Thu hồi thiết bị này? Thiết bị sẽ không thể kết nối được nữa.", .thisDevice: "Thiết bị này", .deviceRevoked: "Đã thu hồi thiết bị.", .noDevices: "Chưa có thiết bị nào được đăng ký.", .active: "Hoạt động", .revoked: "Đã thu hồi", .loadingDevices: "Đang tải thiết bị…",
            .configuration: "Cấu hình", .done: "Xong", .diagnostics: "Chẩn đoán", .state: "Trạng thái", .location: "Vị trí", .message: "Thông báo",
            .diagDown: "Tốc độ tải xuống ↓", .diagUp: "Tốc độ tải lên ↑",
            .diagObserved: "Đo được (đường ramp)", .diagDeclared: "Khai báo hiện tại",
            .diagMore: "Khai báo còn lên được", .diagAtMax: "Đã tối đa ở thời điểm này",
            .diagPath: "Đường đang dùng", .diagStable: "Mức đã khoá (stable)",
            .diagLoss: "Mất gói (QUIC)", .diagRTT: "RTT (QUIC)",
            .extensionStale: "⚠️ Extension đang chạy là bản cũ (%@) trong khi app là %@ — gỡ bản VPNFlow cũ rồi mở lại app.",
            .notConfigured: "Chưa cấu hình - chạm để mở Cấu hình", .vietnam: "Việt Nam",
            .disconnectedSubtitle: "VPN tunnel đang tắt", .connectingSubtitle: "Đang khởi động VPN tunnel bảo mật",
            .connectedSubtitle: "Lưu lượng của bạn đang được bảo vệ", .disconnectingSubtitle: "Đang dừng VPN tunnel",
            .failedSubtitle: "VPN cần được kiểm tra",
            .startVPNHint: "Bắt đầu VPN tunnel tới vị trí đã chọn", .stopVPNHint: "Dừng VPN tunnel"
        ],
        .chinese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "来自越南的私密加密网络", .updateRequired: "需要更新", .updateRequiredDetail: "需要新版 VPNFlow 才能继续。请前往 meetflowai.site/buy 下载最新版本。", .update: "更新", .deleteAccount: "删除账户", .deleteAccountConfirm: "此操作将永久删除您的账户和所有数据，且无法撤销。", .deleteAccountDone: "账户已删除。", .cancel: "取消",
            .signInRequired: "需要登录",
            .signInTitle: "登录", .invalidEmail: "请输入有效的邮箱地址。",
            .devCode: "开发者验证码：%@", .loginCodeSent: "登录验证码已发送",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .subscription: "订阅", .status: "状态", .premiumActive: "Premium 已激活",
            .yourPlan: "您的套餐", .renew: "续费", .expiresOn: "到期 %@", .daysLeft: "剩余 %d 天",
            .premiumRequired: "需要 Premium", .free: "免费", .protectionUnlocked: "VPN 保护已解锁",
            .choosePlanToStart: "选择套餐以开始保护", .choosePlan: "选择套餐",
            .trialBannerTitle: "🎁 您正在使用 1 天免费试用", .trialBannerSubtitle: "试用还剩 %@ 小时。购买套餐以便试用结束后继续使用 VPN。",
            .restorePurchases: "刷新订阅状态", .support: "支持", .contactSupport: "联系支持",
            .privacyPolicy: "隐私政策", .termsOfUse: "使用条款",
            .about: "关于", .version: "版本", .latestOnServer: "服务器最新版本", .latestDifferent: "与已安装版本不同", .latestUnavailable: "(无法读取)",
            .upgrade: "升级",
            .preparingPermission: "正在等待 VPN 权限…", .vpnStartFailure: "VPN 无法启动。请重试。", .paywallTitle: "VPNFlow Premium",
            .paywallSubtitle: "解锁私密、加密的互联网保护。", .benefitTunnel: "安全 VPN 隧道",
            .benefitWifi: "公共 Wi-Fi 保护", .benefitFast: "一键快速连接",
            .privacy: "隐私", .notNow: "暂不", .plan: "套餐",
            .select: "选择", .connect: "连接", .disconnect: "断开", .openSettings: "打开设置",
            .upgradeToPremium: "升级到 Premium", .quit: "退出 VPNFlow",
            .disconnected: "未连接", .connecting: "正在连接", .connected: "已连接",
            .disconnecting: "正在断开", .failed: "失败", .serverLocation: "服务器",
            .loadingLocations: "正在加载服务器…", .noServerAvailable: "暂无可用服务器",
            .refreshLocations: "刷新服务器",
            .usingSavedServers: "离线模式 — 正在使用已保存的服务器",
            .devices: "设备", .revoke: "撤销", .revokeDeviceConfirm: "撤销此设备？该设备将无法再连接。", .thisDevice: "当前设备", .deviceRevoked: "设备已撤销。", .noDevices: "尚未注册任何设备。", .active: "活跃", .revoked: "已撤销", .loadingDevices: "正在加载设备…",
            .configuration: "设置", .done: "完成", .diagnostics: "诊断", .state: "状态", .location: "位置", .message: "消息",
            .diagDown: "下载速度 ↓", .diagUp: "上传速度 ↑", .diagObserved: "实测（爬升路径）",
            .diagDeclared: "当前声明值", .diagMore: "声明还可提升", .diagAtMax: "当前已达上限",
            .diagPath: "当前路径", .diagStable: "已锁定水平（稳定）",
            .diagLoss: "丢包（QUIC）", .diagRTT: "RTT（QUIC）",
            .extensionStale: "⚠️ 正在运行的扩展是旧版本（%@），而应用是 %@ — 请删除旧的 VPNFlow 并重新打开应用。",
            .notConfigured: "尚未配置 - 点击打开设置", .vietnam: "越南",
            .disconnectedSubtitle: "VPN 隧道已关闭", .connectingSubtitle: "正在启动安全 VPN 隧道",
            .connectedSubtitle: "你的流量正在受到保护", .disconnectingSubtitle: "正在停止 VPN 隧道",
            .failedSubtitle: "VPN 需要检查",
            .startVPNHint: "连接到所选位置的 VPN 隧道", .stopVPNHint: "停止 VPN 隧道"
        ],
        .japanese: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "ベトナム経由のプライベートな暗号化通信", .updateRequired: "アップデートが必要です", .updateRequiredDetail: "VPNFlow の新しいバージョンが必要です。最新版は meetflowai.site/buy からダウンロードしてください。", .update: "アップデート", .deleteAccount: "アカウントを削除", .deleteAccountConfirm: "これによりアカウントとすべてのデータが完全に削除されます。元に戻せません。", .deleteAccountDone: "アカウントを削除しました。", .cancel: "キャンセル",
            .signInRequired: "サインインが必要です",
            .signInTitle: "サインイン", .invalidEmail: "有効なメールアドレスを入力してください。",
            .devCode: "開発用コード: %@", .loginCodeSent: "ログインコードを送信しました",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .subscription: "サブスクリプション", .status: "ステータス", .premiumActive: "Premium 有効",
            .yourPlan: "ご契約プラン", .renew: "更新", .expiresOn: "有効期限 %@", .daysLeft: "残り %d 日",
            .premiumRequired: "Premium が必要", .free: "無料", .protectionUnlocked: "VPN 保護が有効です",
            .choosePlanToStart: "保護を開始するにはプランを選択", .choosePlan: "プランを選択",
            .trialBannerTitle: "🎁 1日間の無料トライアルを利用中です", .trialBannerSubtitle: "トライアルは残り %@ 時間です。終了後も VPN を使い続けるにはプランをご購入ください。",
            .restorePurchases: "購入状態を更新", .support: "サポート", .contactSupport: "サポートに連絡",
            .privacyPolicy: "プライバシーポリシー", .termsOfUse: "利用規約",
            .about: "情報", .version: "バージョン", .latestOnServer: "サーバーの最新版", .latestDifferent: "インストール済みと異なります", .latestUnavailable: "(取得できません)",
            .upgrade: "アップグレード",
            .preparingPermission: "VPN の許可を待機中…", .vpnStartFailure: "VPN を開始できませんでした。もう一度お試しください。", .paywallTitle: "VPNFlow Premium",
            .paywallSubtitle: "プライベートで暗号化されたインターネット保護を解除します。", .benefitTunnel: "安全な VPN トンネル",
            .benefitWifi: "公共 Wi-Fi での保護", .benefitFast: "ワンクリックで高速接続",
            .privacy: "プライバシー", .notNow: "後で", .plan: "プラン",
            .select: "選択", .connect: "接続", .disconnect: "切断", .openSettings: "設定を開く",
            .upgradeToPremium: "Premium にアップグレード", .quit: "VPNFlow を終了",
            .disconnected: "未接続", .connecting: "接続中", .connected: "接続済み",
            .disconnecting: "切断中", .failed: "失敗", .serverLocation: "サーバー",
            .loadingLocations: "サーバーを読み込み中…", .noServerAvailable: "利用可能なサーバーがありません",
            .refreshLocations: "サーバーを更新",
            .usingSavedServers: "オフラインモード — 保存済みサーバーを使用中",
            .devices: "デバイス", .revoke: "取り消す", .revokeDeviceConfirm: "このデバイスを取り消しますか？このデバイスは接続できなくなります。", .thisDevice: "このデバイス", .deviceRevoked: "デバイスを取り消しました。", .noDevices: "登録されたデバイスがありません。", .active: "アクティブ", .revoked: "取り消し済み", .loadingDevices: "デバイスを読み込み中…",
            .configuration: "設定", .done: "完了", .diagnostics: "診断", .state: "状態", .location: "場所", .message: "メッセージ",
            .diagDown: "ダウンロード ↓", .diagUp: "アップロード ↑", .diagObserved: "実測（ランプ経路）",
            .diagDeclared: "現在の申告値", .diagMore: "申告の残り伸びしろ", .diagAtMax: "現時点で最大",
            .diagPath: "使用中の経路", .diagStable: "固定レベル（安定）",
            .diagLoss: "パケット損失（QUIC）", .diagRTT: "RTT（QUIC）",
            .extensionStale: "⚠️ 実行中の拡張機能は古いビルド（%@）ですが、アプリは %@ です — 古い VPNFlow を削除してアプリを開き直してください。",
            .notConfigured: "未設定 - タップして設定を開く", .vietnam: "ベトナム",
            .disconnectedSubtitle: "VPN トンネルはオフです", .connectingSubtitle: "安全な VPN トンネルを開始中",
            .connectedSubtitle: "通信は保護されています", .disconnectingSubtitle: "VPN トンネルを停止中",
            .failedSubtitle: "VPN の確認が必要です",
            .startVPNHint: "選択した場所への VPN トンネルを開始します", .stopVPNHint: "VPN トンネルを停止します"
        ],
        .korean: [
            .systemLanguage: "System Setting", .language: "Language", .appSubtitle: "베트남을 통한 비공개 암호화 인터넷", .updateRequired: "업데이트 필요", .updateRequiredDetail: "계속하려면 새 VPNFlow 버전이 필요합니다. 최신 버전을 meetflowai.site/buy에서 다운로드하세요.", .update: "업데이트", .deleteAccount: "계정 삭제", .deleteAccountConfirm: "계정과 모든 데이터가 영구적으로 삭제되며 되돌릴 수 없습니다.", .deleteAccountDone: "계정이 삭제되었습니다.", .cancel: "취소",
            .signInRequired: "로그인이 필요합니다",
            .signInTitle: "로그인", .invalidEmail: "유효한 이메일 주소를 입력하세요.",
            .devCode: "개발자 코드: %@", .loginCodeSent: "로그인 코드가 전송되었습니다",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456",
            .subscription: "구독", .status: "상태", .premiumActive: "Premium 활성화됨",
            .yourPlan: "내 요금제", .renew: "갱신", .expiresOn: "%@ 만료", .daysLeft: "%d일 남음",
            .premiumRequired: "Premium 필요", .free: "무료", .protectionUnlocked: "VPN 보호가 활성화되었습니다",
            .choosePlanToStart: "보호를 시작하려면 플랜을 선택하세요", .choosePlan: "플랜 선택",
            .trialBannerTitle: "🎁 무료 1일 체험판을 사용 중입니다", .trialBannerSubtitle: "체험판이 %@시간 남았습니다. 종료 후에도 VPN을 계속 사용하려면 플랜을 구매하세요.",
            .restorePurchases: "구매 상태 새로 고침", .support: "지원", .contactSupport: "지원 문의",
            .privacyPolicy: "개인정보 처리방침", .termsOfUse: "이용약관",
            .about: "정보", .version: "버전", .latestOnServer: "서버 최신 버전", .latestDifferent: "설치된 버전과 다름", .latestUnavailable: "(읽을 수 없음)",
            .upgrade: "업그레이드",
            .preparingPermission: "VPN 권한을 기다리는 중…", .vpnStartFailure: "VPN을 시작할 수 없습니다. 다시 시도해 주세요.", .paywallTitle: "VPNFlow Premium",
            .paywallSubtitle: "비공개 암호화 인터넷 보호를 잠금 해제하세요.", .benefitTunnel: "보안 VPN 터널",
            .benefitWifi: "공용 Wi-Fi 보호", .benefitFast: "빠른 원클릭 연결",
            .privacy: "개인정보", .notNow: "나중에", .plan: "플랜",
            .select: "선택", .connect: "연결", .disconnect: "연결 해제", .openSettings: "설정 열기",
            .upgradeToPremium: "Premium으로 업그레이드", .quit: "VPNFlow 종료",
            .disconnected: "연결 끊김", .connecting: "연결 중", .connected: "연결됨",
            .disconnecting: "연결 해제 중", .failed: "실패", .serverLocation: "서버",
            .loadingLocations: "서버를 불러오는 중…", .noServerAvailable: "사용 가능한 서버 없음",
            .refreshLocations: "서버 새로고침",
            .usingSavedServers: "오프라인 모드 — 저장된 서버 사용 중",
            .devices: "기기", .revoke: "해지", .revokeDeviceConfirm: "이 기기를 해지하시겠습니까? 이 기기는 더 이상 연결할 수 없습니다.", .thisDevice: "현재 기기", .deviceRevoked: "기기가 해지되었습니다.", .noDevices: "등록된 기기가 없습니다.", .active: "활성", .revoked: "해지됨", .loadingDevices: "기기를 불러오는 중…",
            .configuration: "설정", .done: "완료", .diagnostics: "진단", .state: "상태", .location: "위치", .message: "메시지",
            .diagDown: "다운로드 ↓", .diagUp: "업로드 ↑", .diagObserved: "실측(램프 경로)",
            .diagDeclared: "현재 선언값", .diagMore: "선언 여유분", .diagAtMax: "현재 최대치",
            .diagPath: "사용 중인 경로", .diagStable: "고정 수준(안정)",
            .diagLoss: "패킷 손실(QUIC)", .diagRTT: "RTT(QUIC)",
            .extensionStale: "⚠️ 실행 중인 확장이 이전 빌드(%@)인데 앱은 %@ 입니다 — 이전 VPNFlow를 삭제하고 앱을 다시 여세요.",
            .notConfigured: "설정되지 않음 - 탭하여 설정 열기", .vietnam: "베트남",
            .disconnectedSubtitle: "VPN 터널이 꺼져 있습니다", .connectingSubtitle: "보안 VPN 터널을 시작하는 중",
            .connectedSubtitle: "트래픽이 보호되고 있습니다", .disconnectingSubtitle: "VPN 터널을 중지하는 중",
            .failedSubtitle: "VPN 확인이 필요합니다",
            .startVPNHint: "선택한 위치로 VPN 터널을 시작합니다", .stopVPNHint: "VPN 터널을 중지합니다"
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

    /// Dòng phụ mô tả trạng thái — tương ứng `VPNState.localizedSubtitle` bản iOS.
    func localizedVPNStateSubtitle(_ language: AppLanguage) -> String {
        switch self {
        case "Connected": return AppLanguageStore.text(.connectedSubtitle, language: language)
        case "Connecting…": return AppLanguageStore.text(.connectingSubtitle, language: language)
        case "Disconnecting…": return AppLanguageStore.text(.disconnectingSubtitle, language: language)
        case "Failed": return AppLanguageStore.text(.failedSubtitle, language: language)
        default: return AppLanguageStore.text(.disconnectedSubtitle, language: language)
        }
    }

    /// Đang chuyển trạng thái — tương ứng `VPNState.isTransitioning` bản iOS.
    var vpnIsTransitioning: Bool {
        self == "Connecting…" || self == "Disconnecting…"
    }

    /// Có thể bấm Connect — tương ứng `VPNState.canConnect` bản iOS.
    var vpnCanConnect: Bool {
        self == "Disconnected" || self == "Failed"
    }

    /// Có thể bấm Disconnect — tương ứng `VPNState.canDisconnect` bản iOS.
    var vpnCanDisconnect: Bool {
        self == "Connecting…" || self == "Connected"
    }

    /// Màu accent theo trạng thái — tương ứng `VPNState.tint` bản iOS.
    var vpnStateTint: Color {
        switch self {
        case "Connected": return VPNThemeMac.success
        case "Connecting…", "Disconnecting…": return .orange
        case "Failed": return .red
        default: return .secondary
        }
    }

    /// SF Symbol theo trạng thái — tương ứng `VPNState.symbol` bản iOS.
    var vpnStateSymbol: String {
        switch self {
        case "Connected": return "checkmark.shield.fill"
        case "Connecting…", "Disconnecting…": return "shield.lefthalf.filled"
        case "Failed": return "exclamationmark.triangle.fill"
        default: return "shield.slash.fill"
        }
    }
}
