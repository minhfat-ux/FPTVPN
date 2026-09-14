import SwiftUI
import UIKit

/// Shared visual theme for the PrivateVPN iOS UI — always dark, FlowVPN navy
/// palette (matches FPT Harness style): #0A1F3B base, #0E2747 cards,
/// #16385E gradient bottom, system blue accent (#007AFF).
enum VPNTheme {
    /// Accent — iOS system blue, used for the primary action and highlights.
    static let accent = Color(uiColor: .systemBlue)

    /// Success green — connected state (FlowVPN brand green #33C773).
    static let success = Color(red: 51/255, green: 199/255, blue: 115/255)

    /// Tên app với "Flow" tô màu brand — giống trang buy.
    ///
    /// Trang buy render `'VPN<span>Flow</span> Premium'` và CSS `.logo span` đặt
    /// `color: #33c773` (control-plane/src/payments.js), tức "Flow" xanh còn "VPN"
    /// trắng. #33C773 đúng bằng `success` ở đây nên không cần thêm màu mới.
    ///
    /// Trả `Text` (không phải `some View`) để ghép chuỗi được và vẫn ăn font/size
    /// đặt ở ngoài — đúng cách các màn hình đang dùng.
    ///
    /// Cố ý đặt màu TRẮNG cho "VPN" ngay trong đây, và các màn hình đã bỏ
    /// `.foregroundStyle(VPNTheme.label)` ở ngoài: modifier `foregroundStyle` áp lên
    /// cả `Text` đã ghép sẽ đè màu từng đoạn, tức "Flow" mất màu xanh và thay đổi
    /// này im lặng không có tác dụng.
    static var brandName: Text {
        Text("VPN").foregroundStyle(label)
            + Text("Flow").foregroundStyle(success)
    }

    /// Tiêu đề paywall với "Flow" tô màu brand — giống trang buy.
    ///
    /// Trang buy in `'VPN<span>Flow</span> Premium'`, nên tiêu đề trong app cũng phải
    /// là "VPN" trắng + "Flow" xanh + phần còn lại trắng.
    ///
    /// Chỉ tô khi chuỗi BẮT ĐẦU bằng tên app (mọi bản dịch hiện tại đều vậy). Bản dịch
    /// nào không bắt đầu bằng tên app thì trả nguyên chuỗi — KHÔNG đoán chỗ cắt, vì
    /// cắt sai giữa câu sẽ tô màu vào chữ vô nghĩa.
    ///
    /// Màu trắng đặt ngay trong đây (và call site bỏ `.foregroundStyle` ở ngoài) vì
    /// modifier đó áp lên cả `Text` đã ghép sẽ đè màu từng đoạn.
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

    static let backgroundGradient = LinearGradient(
        colors: [backgroundTop, backgroundBottom],
        startPoint: .top,
        endPoint: .bottom
    )

    // Dark-only semantic colors.
    static let label = Color.white
    static let secondaryLabel = Color.white.opacity(0.6)
    static let tertiaryLabel = Color.white.opacity(0.4)
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
        case .disconnected: return .secondary
        case .connecting, .disconnecting: return .orange
        case .connected: return VPNTheme.success
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
    case freeTrialTitle, freeTrialBody
    case support, contactSupport, privacyPolicy, termsOfUse, upgrade
    case preparingPermission, vpnStartFailure, diagnostics, state, location, message, notConfigured
    case secureExitNode, vietnam, startVPNHint, stopVPNHint
    case serverLocation, select, loadingLocations, noServerAvailable, refreshLocations, usingSavedServers
    case paywallTitle, paywallSubtitle, benefitTunnel, benefitWifi, benefitFast
    case privacy, notNow
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
            .account: "Account", .signedIn: "Signed in", .signedOut: "Signed out", .signInRequired: "Sign in required", .email: "Email", .updateRequired: "Update Required", .updateRequiredDetail: "A new version of VPNFlow is required to continue. Please download the latest version at meetflowai.site/buy.", .update: "Update", .deleteAccount: "Delete Account", .deleteAccountConfirm: "This permanently deletes your account and all data. This cannot be undone.", .deleteAccountDone: "Account deleted.", .cancel: "Cancel",
            .signInTitle: "Sign In", .loginCode: "Login code", .sendCode: "Send Code", .verifyCode: "Verify Code", .signOut: "Sign Out",
            .emailPlaceholder: "you@example.com", .codePlaceholder: "123456", .invalidEmail: "Please enter a valid email address.",
            .devCode: "Dev code: %@", .loginCodeSent: "Login code sent",
            .configuration: "Configuration", .done: "Done", .subscription: "Subscription", .status: "Status",
            .premiumActive: "Premium Active", .premiumRequired: "Premium Required", .free: "Free",
            .protectionUnlocked: "VPN protection is unlocked", .choosePlanToStart: "Choose a plan to start protection",
            .freeTrialTitle: "🎁 You're on the free 1-day trial", .freeTrialBody: "%d hours of trial left. Buy a plan to keep using the VPN after it ends.",
            .choosePlan: "Choose Plan", .restorePurchases: "Refresh Purchase Status", .support: "Support",
            .contactSupport: "Contact Support", .privacyPolicy: "Privacy Policy", .termsOfUse: "Terms of Use",
            .upgrade: "Upgrade", .preparingPermission: "Preparing VPN permission…", .vpnStartFailure: "VPN could not start. Please try again.",
            .diagnostics: "Diagnostics", .state: "State", .location: "Location", .message: "Message",
            .notConfigured: "Not configured - tap to open Configuration", .secureExitNode: "Secure exit node",
            .vietnam: "Vietnam", .startVPNHint: "Starts the VPN tunnel to the selected location",
            .stopVPNHint: "Stops the VPN tunnel", .paywallTitle: "VPNFlow Premium",
            .paywallSubtitle: "Unlock private, encrypted internet protection.", .benefitTunnel: "Secure VPN tunnel",
            .benefitWifi: "Protection on public Wi-Fi", .benefitFast: "Fast one-tap connection",
            .privacy: "Privacy", .notNow: "Not Now", .disconnected: "Disconnected",
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
            .updateRequired: "Cần cập nhật", .updateRequiredDetail: "Cần phiên bản mới của VPNFlow để tiếp tục. Vui lòng tải bản mới tại meetflowai.site/buy.", .update: "Cập nhật", .deleteAccount: "Xóa tài khoản", .deleteAccountConfirm: "Thao tác này sẽ xóa vĩnh viễn tài khoản và toàn bộ dữ liệu của bạn. Không thể hoàn tác.", .deleteAccountDone: "Đã xóa tài khoản.", .cancel: "Hủy",
            .configuration: "Cấu hình", .done: "Xong", .subscription: "Gói đăng ký", .status: "Trạng thái",
            .premiumActive: "Premium đang hoạt động", .premiumRequired: "Cần Premium", .free: "Miễn phí",
            .protectionUnlocked: "Bảo vệ VPN đã được mở khóa", .choosePlanToStart: "Chọn gói để bắt đầu bảo vệ",
            .freeTrialTitle: "🎁 Bạn đang dùng bản dùng thử 1 ngày miễn phí", .freeTrialBody: "Còn %d giờ dùng thử. Mua gói để tiếp tục dùng VPN sau khi hết hạn.",
            .choosePlan: "Chọn gói", .restorePurchases: "Làm mới trạng thái gói", .support: "Hỗ trợ",
            .contactSupport: "Liên hệ hỗ trợ", .privacyPolicy: "Chính sách quyền riêng tư", .termsOfUse: "Điều khoản sử dụng",
            .upgrade: "Nâng cấp", .preparingPermission: "Đang chờ cấp quyền VPN…", .vpnStartFailure: "Không thể khởi động VPN. Vui lòng thử lại.",
            .diagnostics: "Chẩn đoán", .state: "Trạng thái", .location: "Vị trí", .message: "Thông báo",
            .notConfigured: "Chưa cấu hình - chạm để mở Cấu hình", .secureExitNode: "Exit node bảo mật",
            .vietnam: "Việt Nam", .startVPNHint: "Bắt đầu VPN tunnel tới vị trí đã chọn",
            .stopVPNHint: "Dừng VPN tunnel", .paywallTitle: "VPNFlow Premium",
            .paywallSubtitle: "Mở khóa bảo vệ internet riêng tư và mã hóa.", .benefitTunnel: "VPN tunnel bảo mật",
            .benefitWifi: "Bảo vệ khi dùng Wi-Fi công cộng", .benefitFast: "Kết nối nhanh một chạm",
            .privacy: "Quyền riêng tư", .notNow: "Để sau", .disconnected: "Đã ngắt kết nối",
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
            .updateRequired: "需要更新", .updateRequiredDetail: "需要新版 VPNFlow 才能继续。请前往 meetflowai.site/buy 下载最新版本。", .update: "更新", .deleteAccount: "删除账户", .deleteAccountConfirm: "此操作将永久删除您的账户和所有数据，且无法撤销。", .deleteAccountDone: "账户已删除。", .cancel: "取消",
            .configuration: "设置", .done: "完成", .subscription: "订阅", .status: "状态",
            .premiumActive: "Premium 已激活", .premiumRequired: "需要 Premium", .free: "免费",
            .protectionUnlocked: "VPN 保护已解锁", .choosePlanToStart: "选择套餐以开始保护",
            .freeTrialTitle: "🎁 您正在使用 1 天免费试用版", .freeTrialBody: "试用还剩 %d 小时。购买套餐以在到期后继续使用 VPN。",
            .choosePlan: "选择套餐", .restorePurchases: "刷新订阅状态", .support: "支持",
            .contactSupport: "联系支持", .privacyPolicy: "隐私政策", .termsOfUse: "使用条款",
            .upgrade: "升级", .preparingPermission: "正在等待 VPN 权限…", .vpnStartFailure: "VPN 无法启动。请重试。",
            .diagnostics: "诊断", .state: "状态", .location: "位置", .message: "消息",
            .notConfigured: "尚未配置 - 点击打开设置", .secureExitNode: "安全出口节点", .vietnam: "越南",
            .startVPNHint: "连接到所选位置的 VPN 隧道", .stopVPNHint: "停止 VPN 隧道",
            .paywallTitle: "VPNFlow Premium", .paywallSubtitle: "解锁私密、加密的互联网保护。",
            .benefitTunnel: "安全 VPN 隧道", .benefitWifi: "公共 Wi-Fi 保护", .benefitFast: "一键快速连接",
            .privacy: "隐私", .notNow: "暂不", .disconnected: "未连接",
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
            .updateRequired: "アップデートが必要です", .updateRequiredDetail: "VPNFlow の新しいバージョンが必要です。最新版は meetflowai.site/buy からダウンロードしてください。", .update: "アップデート", .deleteAccount: "アカウントを削除", .deleteAccountConfirm: "これによりアカウントとすべてのデータが完全に削除されます。元に戻せません。", .deleteAccountDone: "アカウントを削除しました。", .cancel: "キャンセル",
            .configuration: "設定", .done: "完了", .subscription: "サブスクリプション", .status: "ステータス",
            .premiumActive: "Premium 有効", .premiumRequired: "Premium が必要", .free: "無料",
            .protectionUnlocked: "VPN 保護が有効です", .choosePlanToStart: "保護を開始するにはプランを選択",
            .freeTrialTitle: "🎁 1日間の無料トライアルを利用中です", .freeTrialBody: "トライアルは残り %d 時間です。終了後も VPN を使い続けるにはプランをご購入ください。",
            .choosePlan: "プランを選択", .restorePurchases: "購入状態を更新", .support: "サポート",
            .contactSupport: "サポートに連絡", .privacyPolicy: "プライバシーポリシー", .termsOfUse: "利用規約",
            .upgrade: "アップグレード", .preparingPermission: "VPN の許可を待機中…", .vpnStartFailure: "VPN を開始できませんでした。もう一度お試しください。",
            .diagnostics: "診断", .state: "状態", .location: "場所", .message: "メッセージ",
            .notConfigured: "未設定 - タップして設定を開く", .secureExitNode: "安全な出口ノード", .vietnam: "ベトナム",
            .startVPNHint: "選択した場所への VPN トンネルを開始します", .stopVPNHint: "VPN トンネルを停止します",
            .paywallTitle: "VPNFlow Premium", .paywallSubtitle: "プライベートで暗号化されたインターネット保護を解除します。",
            .benefitTunnel: "安全な VPN トンネル", .benefitWifi: "公共 Wi-Fi での保護", .benefitFast: "ワンタップで高速接続",
            .privacy: "プライバシー", .notNow: "後で", .disconnected: "未接続",
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
            .updateRequired: "업데이트 필요", .updateRequiredDetail: "계속하려면 새 VPNFlow 버전이 필요합니다. 최신 버전을 meetflowai.site/buy에서 다운로드하세요.", .update: "업데이트", .deleteAccount: "계정 삭제", .deleteAccountConfirm: "계정과 모든 데이터가 영구적으로 삭제되며 되돌릴 수 없습니다.", .deleteAccountDone: "계정이 삭제되었습니다.", .cancel: "취소",
            .configuration: "설정", .done: "완료", .subscription: "구독", .status: "상태",
            .premiumActive: "Premium 활성화됨", .premiumRequired: "Premium 필요", .free: "무료",
            .protectionUnlocked: "VPN 보호가 활성화되었습니다", .choosePlanToStart: "보호를 시작하려면 플랜을 선택하세요",
            .freeTrialTitle: "🎁 1일 무료 체험판을 사용 중입니다", .freeTrialBody: "체험판이 %d시간 남았습니다. 종료 후에도 VPN을 계속 사용하려면 플랜을 구매하세요.",
            .choosePlan: "플랜 선택", .restorePurchases: "구매 상태 새로 고침", .support: "지원",
            .contactSupport: "지원 문의", .privacyPolicy: "개인정보 처리방침", .termsOfUse: "이용약관",
            .upgrade: "업그레이드", .preparingPermission: "VPN 권한을 기다리는 중…", .vpnStartFailure: "VPN을 시작할 수 없습니다. 다시 시도해 주세요.",
            .diagnostics: "진단", .state: "상태", .location: "위치", .message: "메시지",
            .notConfigured: "설정되지 않음 - 탭하여 설정 열기", .secureExitNode: "보안 출구 노드", .vietnam: "베트남",
            .startVPNHint: "선택한 위치로 VPN 터널을 시작합니다", .stopVPNHint: "VPN 터널을 중지합니다",
            .paywallTitle: "VPNFlow Premium", .paywallSubtitle: "비공개 암호화 인터넷 보호를 잠금 해제하세요.",
            .benefitTunnel: "보안 VPN 터널", .benefitWifi: "공용 Wi-Fi 보호", .benefitFast: "빠른 원탭 연결",
            .privacy: "개인정보", .notNow: "나중에", .disconnected: "연결 끊김",
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
