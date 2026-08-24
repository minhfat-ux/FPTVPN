package com.privatevpn.app.l10n

import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-app localization — mirrors the iOS/macOS AppLanguageStore text table
 * (5 languages: EN/VI/ZH/JA/KO + System). Language override persists locally.
 */
enum class AppLanguage(val code: String) {
    ENGLISH("en"), VIETNAMESE("vi"), CHINESE("zh"), JAPANESE("ja"), KOREAN("ko");

    companion object {
        fun fromCode(code: String): AppLanguage =
            entries.firstOrNull { it.code == code } ?: ENGLISH
    }
}

enum class LangChoice(val id: String) {
    SYSTEM("system"), ENGLISH("en"), VIETNAMESE("vi"), CHINESE("zh"), JAPANESE("ja"), KOREAN("ko");

    val language: AppLanguage?
        get() = when (this) {
            SYSTEM -> null
            ENGLISH -> AppLanguage.ENGLISH
            VIETNAMESE -> AppLanguage.VIETNAMESE
            CHINESE -> AppLanguage.CHINESE
            JAPANESE -> AppLanguage.JAPANESE
            KOREAN -> AppLanguage.KOREAN
        }

    fun title(lang: AppLanguage): String = when (this) {
        SYSTEM -> "\uD83C\uDF10 ${L10n.text(LKey.systemLanguage, lang)}"
        ENGLISH -> "\uD83C\uDDFA\uD83C\uDDF8 English"
        VIETNAMESE -> "\uD83C\uDDFB\uD83C\uDDF3 Vietnamese"
        CHINESE -> "\uD83C\uDDE8\uD83C\uDDF3 Chinese"
        JAPANESE -> "\uD83C\uDDEF\uD83C\uDDF5 Japanese"
        KOREAN -> "\uD83C\uDDF0\uD83C\uDDF7 Korean"
    }

    companion object {
        fun fromId(id: String): LangChoice =
            entries.firstOrNull { it.id == id } ?: SYSTEM
    }
}

enum class LKey {
    systemLanguage, language, appSubtitle, configuration, done,
    account, signedIn, signedOut, signInRequired, signInTitle, email, loginCode, sendCode, verifyCode, signOut,
    updateRequired, updateRequiredDetail, update,
    deleteAccount, deleteAccountConfirm, deleteAccountDone,
    cancel,
    emailPlaceholder, codePlaceholder, invalidEmail, devCode, loginCodeSent,
    subscription, status, premiumActive, premiumRequired, free,
    protectionUnlocked, choosePlanToStart, choosePlan, restorePurchases,
    support, contactSupport, privacyPolicy, appleStandardEULA, upgrade,
    preparingPermission, vpnStartFailure, diagnostics, state, location, message, notConfigured,
    secureExitNode, vietnam, startVPNHint, stopVPNHint,
    serverLocation, select, loadingLocations, noServerAvailable, refreshLocations, usingSavedServers,
    paywallTitle, paywallSubtitle, benefitTunnel, benefitWifi, benefitFast,
    noPlans, noPlansDetail, subscriptionDisclosure, manageSubscription, privacy, eula, notNow,
    disconnected, connecting, connected, disconnecting, failed,
    disconnectedSubtitle, connectingSubtitle, connectedSubtitle, disconnectingSubtitle, failedSubtitle,
    devices, revoke, revokeDeviceConfirm, thisDevice, deviceRevoked, noDevices, active, revoked, loadingDevices,
    signInRequiredShort, updateRequiredShort, deleteAccountDoneShort, invalidEmailShort,
    notNowShort
}

object L10n {
    fun systemLanguage(): AppLanguage {
        val code = Locale.getDefault().language.lowercase()
        return when {
            code.startsWith("vi") -> AppLanguage.VIETNAMESE
            code.startsWith("zh") -> AppLanguage.CHINESE
            code.startsWith("ja") -> AppLanguage.JAPANESE
            code.startsWith("ko") -> AppLanguage.KOREAN
            code.startsWith("en") -> AppLanguage.ENGLISH
            else -> AppLanguage.ENGLISH
        }
    }

    fun text(key: LKey, language: AppLanguage): String =
        table[language]?.get(key) ?: table[AppLanguage.ENGLISH]?.get(key) ?: key.name

    private val table: Map<AppLanguage, Map<LKey, String>> = mapOf(
        AppLanguage.ENGLISH to mapOf(
            LKey.systemLanguage to "System", LKey.language to "Language", LKey.appSubtitle to "Private, encrypted internet from Vietnam",
            LKey.account to "Account", LKey.signedIn to "Signed in", LKey.signedOut to "Signed out", LKey.signInRequired to "Sign in required", LKey.email to "Email", LKey.updateRequired to "Update Required", LKey.updateRequiredDetail to "A new version of VPNFlow is required to continue. Please update from the store.", LKey.update to "Update", LKey.deleteAccount to "Delete Account", LKey.deleteAccountConfirm to "This permanently deletes your account and all data. This cannot be undone.", LKey.deleteAccountDone to "Account deleted.", LKey.cancel to "Cancel",
            LKey.signInTitle to "Sign In", LKey.loginCode to "Login code", LKey.sendCode to "Send Code", LKey.verifyCode to "Verify Code", LKey.signOut to "Sign Out",
            LKey.emailPlaceholder to "you@example.com", LKey.codePlaceholder to "123456", LKey.invalidEmail to "Please enter a valid email address.",
            LKey.devCode to "Dev code: %s", LKey.loginCodeSent to "Login code sent",
            LKey.configuration to "Configuration", LKey.done to "Done", LKey.subscription to "Subscription", LKey.status to "Status",
            LKey.premiumActive to "Premium Active", LKey.premiumRequired to "Premium Required", LKey.free to "Free",
            LKey.protectionUnlocked to "VPN protection is unlocked", LKey.choosePlanToStart to "Choose a plan to start protection",
            LKey.choosePlan to "Choose Plan", LKey.restorePurchases to "Restore Purchases", LKey.support to "Support",
            LKey.contactSupport to "Contact Support", LKey.privacyPolicy to "Privacy Policy", LKey.appleStandardEULA to "Apple Standard EULA",
            LKey.upgrade to "Upgrade", LKey.preparingPermission to "Preparing VPN permission…", LKey.vpnStartFailure to "VPN could not start. Please try again.",
            LKey.diagnostics to "Diagnostics", LKey.state to "State", LKey.location to "Location", LKey.message to "Message",
            LKey.notConfigured to "Not configured - tap to open Configuration", LKey.secureExitNode to "Secure exit node",
            LKey.vietnam to "Vietnam", LKey.startVPNHint to "Starts the VPN tunnel to the selected location",
            LKey.stopVPNHint to "Stops the VPN tunnel", LKey.paywallTitle to "VPNFlow Premium",
            LKey.paywallSubtitle to "Unlock private, encrypted internet protection.", LKey.benefitTunnel to "Secure VPN tunnel",
            LKey.benefitWifi to "Protection on public Wi-Fi", LKey.benefitFast to "Fast one-tap connection",
            LKey.noPlans to "No plans available", LKey.noPlansDetail to "Play Billing did not return Monthly_Premium or Yearly_Premium.",
            LKey.subscriptionDisclosure to "Payment is charged to your Google Play account at confirmation of purchase. Subscriptions auto-renew unless canceled at least 24 hours before the end of the current period; your account is charged for renewal within 24 hours prior to the period end. Manage or cancel anytime in your Google Play subscription settings. Any unused portion of a free trial, if offered, is forfeited upon purchasing a subscription.",
            LKey.manageSubscription to "Manage Subscription",
            LKey.privacy to "Privacy", LKey.eula to "EULA", LKey.notNow to "Not Now", LKey.disconnected to "Disconnected",
            LKey.connecting to "Connecting", LKey.connected to "Connected", LKey.disconnecting to "Disconnecting", LKey.failed to "Failed",
            LKey.disconnectedSubtitle to "Your VPN tunnel is off", LKey.connectingSubtitle to "Starting secure VPN tunnel",
            LKey.connectedSubtitle to "Your traffic is protected", LKey.disconnectingSubtitle to "Stopping VPN tunnel",
            LKey.failedSubtitle to "VPN needs attention",
            LKey.select to "Select", LKey.serverLocation to "Server", LKey.loadingLocations to "Loading servers…", LKey.noServerAvailable to "No server available", LKey.refreshLocations to "Refresh servers", LKey.usingSavedServers to "Showing saved servers — coordinator unreachable. Tap to refresh.",
            LKey.devices to "Devices", LKey.revoke to "Revoke", LKey.revokeDeviceConfirm to "Revoke this device? It will no longer be able to connect.", LKey.thisDevice to "This device", LKey.deviceRevoked to "Device revoked.", LKey.noDevices to "No devices registered.", LKey.active to "Active", LKey.revoked to "Revoked", LKey.loadingDevices to "Loading devices…",
            LKey.signInRequiredShort to "Sign in required", LKey.updateRequiredShort to "Update Required", LKey.deleteAccountDoneShort to "Account deleted.", LKey.invalidEmailShort to "Please enter a valid email address.", LKey.notNowShort to "Not Now"
        ),
        AppLanguage.VIETNAMESE to mapOf(
            LKey.systemLanguage to "System Setting", LKey.language to "Language", LKey.appSubtitle to "Internet riêng tư, mã hóa từ Việt Nam",
            LKey.signInRequired to "Cần đăng nhập",
            LKey.signInTitle to "Đăng nhập", LKey.invalidEmail to "Vui lòng nhập địa chỉ email hợp lệ.",
            LKey.devCode to "Mã dev: %s", LKey.loginCodeSent to "Mã đăng nhập đã được gửi",
            LKey.emailPlaceholder to "you@example.com", LKey.codePlaceholder to "123456",
            LKey.updateRequired to "Cần cập nhật", LKey.updateRequiredDetail to "Cần phiên bản mới của VPNFlow để tiếp tục. Vui lòng cập nhật từ cửa hàng.", LKey.update to "Cập nhật", LKey.deleteAccount to "Xóa tài khoản", LKey.deleteAccountConfirm to "Thao tác này sẽ xóa vĩnh viễn tài khoản và toàn bộ dữ liệu của bạn. Không thể hoàn tác.", LKey.deleteAccountDone to "Đã xóa tài khoản.", LKey.cancel to "Hủy",
            LKey.configuration to "Cấu hình", LKey.done to "Xong", LKey.subscription to "Gói đăng ký", LKey.status to "Trạng thái",
            LKey.premiumActive to "Premium đang hoạt động", LKey.premiumRequired to "Cần Premium", LKey.free to "Miễn phí",
            LKey.protectionUnlocked to "Bảo vệ VPN đã được mở khóa", LKey.choosePlanToStart to "Chọn gói để bắt đầu bảo vệ",
            LKey.choosePlan to "Chọn gói", LKey.restorePurchases to "Khôi phục giao dịch", LKey.support to "Hỗ trợ",
            LKey.contactSupport to "Liên hệ hỗ trợ", LKey.privacyPolicy to "Chính sách quyền riêng tư", LKey.appleStandardEULA to "EULA tiêu chuẩn của Apple",
            LKey.upgrade to "Nâng cấp", LKey.preparingPermission to "Đang chờ cấp quyền VPN…", LKey.vpnStartFailure to "Không thể khởi động VPN. Vui lòng thử lại.",
            LKey.diagnostics to "Chẩn đoán", LKey.state to "Trạng thái", LKey.location to "Vị trí", LKey.message to "Thông báo",
            LKey.notConfigured to "Chưa cấu hình - chạm để mở Cấu hình", LKey.secureExitNode to "Exit node bảo mật",
            LKey.vietnam to "Việt Nam", LKey.startVPNHint to "Bắt đầu VPN tunnel tới vị trí đã chọn",
            LKey.stopVPNHint to "Dừng VPN tunnel", LKey.paywallTitle to "VPNFlow Premium",
            LKey.paywallSubtitle to "Mở khóa bảo vệ internet riêng tư và mã hóa.", LKey.benefitTunnel to "VPN tunnel bảo mật",
            LKey.benefitWifi to "Bảo vệ khi dùng Wi-Fi công cộng", LKey.benefitFast to "Kết nối nhanh một chạm",
            LKey.noPlans to "Chưa có gói khả dụng", LKey.noPlansDetail to "Play Billing không trả về Monthly_Premium hoặc Yearly_Premium.",
            LKey.subscriptionDisclosure to "Thanh toán sẽ được trừ vào tài khoản Google Play khi bạn xác nhận mua. Gói đăng ký tự động gia hạn trừ khi bạn hủy ít nhất 24 giờ trước khi kết thúc kỳ hiện tại; tài khoản sẽ bị trừ phí gia hạn trong vòng 24 giờ trước khi kết thúc kỳ. Bạn có thể quản lý hoặc hủy gói đăng ký bất cứ lúc nào trong cài đặt Google Play. Mọi phần chưa dùng của thời gian dùng thử miễn phí (nếu có) sẽ bị mất khi bạn mua gói đăng ký.",
            LKey.manageSubscription to "Quản lý gói đăng ký",
            LKey.privacy to "Quyền riêng tư", LKey.eula to "EULA", LKey.notNow to "Để sau", LKey.disconnected to "Đã ngắt kết nối",
            LKey.connecting to "Đang kết nối", LKey.connected to "Đã kết nối", LKey.disconnecting to "Đang ngắt kết nối", LKey.failed to "Lỗi",
            LKey.disconnectedSubtitle to "VPN tunnel đang tắt", LKey.connectingSubtitle to "Đang khởi động VPN tunnel bảo mật",
            LKey.connectedSubtitle to "Lưu lượng của bạn đang được bảo vệ", LKey.disconnectingSubtitle to "Đang dừng VPN tunnel",
            LKey.failedSubtitle to "VPN cần được kiểm tra",
            LKey.select to "Chọn", LKey.serverLocation to "Máy chủ", LKey.loadingLocations to "Đang tải máy chủ…", LKey.noServerAvailable to "Chưa có máy chủ khả dụng", LKey.refreshLocations to "Tải lại máy chủ", LKey.usingSavedServers to "Đang hiển thị máy chủ đã lưu — không kết nối được máy chủ điều phối. Chạm để tải lại.",
            LKey.devices to "Thiết bị", LKey.revoke to "Thu hồi", LKey.revokeDeviceConfirm to "Thu hồi thiết bị này? Thiết bị sẽ không thể kết nối được nữa.", LKey.thisDevice to "Thiết bị này", LKey.deviceRevoked to "Đã thu hồi thiết bị.", LKey.noDevices to "Chưa có thiết bị nào được đăng ký.", LKey.active to "Hoạt động", LKey.revoked to "Đã thu hồi", LKey.loadingDevices to "Đang tải thiết bị…",
            LKey.signInRequiredShort to "Cần đăng nhập", LKey.updateRequiredShort to "Cần cập nhật", LKey.deleteAccountDoneShort to "Đã xóa tài khoản.", LKey.invalidEmailShort to "Vui lòng nhập địa chỉ email hợp lệ.", LKey.notNowShort to "Để sau"
        ),
        AppLanguage.CHINESE to mapOf(
            LKey.systemLanguage to "System Setting", LKey.language to "Language", LKey.appSubtitle to "来自越南的私密加密网络",
            LKey.signInRequired to "需要登录",
            LKey.signInTitle to "登录", LKey.invalidEmail to "请输入有效的邮箱地址。",
            LKey.devCode to "开发者验证码：%s", LKey.loginCodeSent to "登录验证码已发送",
            LKey.emailPlaceholder to "you@example.com", LKey.codePlaceholder to "123456",
            LKey.updateRequired to "需要更新", LKey.updateRequiredDetail to "需要新版 VPNFlow 才能继续。请从商店更新。", LKey.update to "更新", LKey.deleteAccount to "删除账户", LKey.deleteAccountConfirm to "此操作将永久删除您的账户和所有数据，且无法撤销。", LKey.deleteAccountDone to "账户已删除。", LKey.cancel to "取消",
            LKey.configuration to "设置", LKey.done to "完成", LKey.subscription to "订阅", LKey.status to "状态",
            LKey.premiumActive to "Premium 已激活", LKey.premiumRequired to "需要 Premium", LKey.free to "免费",
            LKey.protectionUnlocked to "VPN 保护已解锁", LKey.choosePlanToStart to "选择套餐以开始保护",
            LKey.choosePlan to "选择套餐", LKey.restorePurchases to "恢复购买", LKey.support to "支持",
            LKey.contactSupport to "联系支持", LKey.privacyPolicy to "隐私政策", LKey.appleStandardEULA to "Apple 标准 EULA",
            LKey.upgrade to "升级", LKey.preparingPermission to "正在等待 VPN 权限…", LKey.vpnStartFailure to "VPN 无法启动。请重试。",
            LKey.diagnostics to "诊断", LKey.state to "状态", LKey.location to "位置", LKey.message to "消息",
            LKey.notConfigured to "尚未配置 - 点击打开设置", LKey.secureExitNode to "安全出口节点", LKey.vietnam to "越南",
            LKey.startVPNHint to "连接到所选位置的 VPN 隧道", LKey.stopVPNHint to "停止 VPN 隧道",
            LKey.paywallTitle to "VPNFlow Premium", LKey.paywallSubtitle to "解锁私密、加密的互联网保护。",
            LKey.benefitTunnel to "安全 VPN 隧道", LKey.benefitWifi to "公共 Wi-Fi 保护", LKey.benefitFast to "一键快速连接",
            LKey.noPlans to "暂无可用套餐", LKey.noPlansDetail to "Play Billing 未返回 Monthly_Premium 或 Yearly_Premium。",
            LKey.subscriptionDisclosure to "付款将在购买确认时从您的 Google Play 账户扣除。订阅会自动续订，除非在当前订阅期结束前至少 24 小时取消；续订费用将在当前订阅期结束前 24 小时内从您的账户扣除。您可随时在 Google Play 订阅设置中管理或取消订阅。若提供免费试用，未使用的试用时长将在购买订阅时被收回。",
            LKey.manageSubscription to "管理订阅",
            LKey.privacy to "隐私", LKey.eula to "EULA", LKey.notNow to "暂不", LKey.disconnected to "未连接",
            LKey.connecting to "正在连接", LKey.connected to "已连接", LKey.disconnecting to "正在断开", LKey.failed to "失败",
            LKey.disconnectedSubtitle to "VPN 隧道已关闭", LKey.connectingSubtitle to "正在启动安全 VPN 隧道",
            LKey.connectedSubtitle to "你的流量正在受到保护", LKey.disconnectingSubtitle to "正在停止 VPN 隧道",
            LKey.failedSubtitle to "VPN 需要检查",
            LKey.select to "选择", LKey.serverLocation to "服务器", LKey.loadingLocations to "正在加载服务器…", LKey.noServerAvailable to "暂无可用服务器", LKey.refreshLocations to "刷新服务器", LKey.usingSavedServers to "正在显示已保存的服务器 — 无法连接协调服务器。点击重试。",
            LKey.devices to "设备", LKey.revoke to "撤销", LKey.revokeDeviceConfirm to "撤销此设备？该设备将无法再连接。", LKey.thisDevice to "当前设备", LKey.deviceRevoked to "设备已撤销。", LKey.noDevices to "尚未注册任何设备。", LKey.active to "活跃", LKey.revoked to "已撤销", LKey.loadingDevices to "正在加载设备…",
            LKey.signInRequiredShort to "需要登录", LKey.updateRequiredShort to "需要更新", LKey.deleteAccountDoneShort to "账户已删除。", LKey.invalidEmailShort to "请输入有效的邮箱地址。", LKey.notNowShort to "暂不"
        ),
        AppLanguage.JAPANESE to mapOf(
            LKey.systemLanguage to "System Setting", LKey.language to "Language", LKey.appSubtitle to "ベトナム経由のプライベートな暗号化通信",
            LKey.signInRequired to "サインインが必要です",
            LKey.signInTitle to "サインイン", LKey.invalidEmail to "有効なメールアドレスを入力してください。",
            LKey.devCode to "開発用コード: %s", LKey.loginCodeSent to "ログインコードを送信しました",
            LKey.emailPlaceholder to "you@example.com", LKey.codePlaceholder to "123456",
            LKey.updateRequired to "アップデートが必要です", LKey.updateRequiredDetail to "VPNFlow の新しいバージョンが必要です。ストアから更新してください。", LKey.update to "アップデート", LKey.deleteAccount to "アカウントを削除", LKey.deleteAccountConfirm to "これによりアカウントとすべてのデータが完全に削除されます。元に戻せません。", LKey.deleteAccountDone to "アカウントを削除しました。", LKey.cancel to "キャンセル",
            LKey.configuration to "設定", LKey.done to "完了", LKey.subscription to "サブスクリプション", LKey.status to "ステータス",
            LKey.premiumActive to "Premium 有効", LKey.premiumRequired to "Premium が必要", LKey.free to "無料",
            LKey.protectionUnlocked to "VPN 保護が有効です", LKey.choosePlanToStart to "保護を開始するにはプランを選択",
            LKey.choosePlan to "プランを選択", LKey.restorePurchases to "購入を復元", LKey.support to "サポート",
            LKey.contactSupport to "サポートに連絡", LKey.privacyPolicy to "プライバシーポリシー", LKey.appleStandardEULA to "Apple 標準 EULA",
            LKey.upgrade to "アップグレード", LKey.preparingPermission to "VPN の許可を待機中…", LKey.vpnStartFailure to "VPN を開始できませんでした。もう一度お試しください。",
            LKey.diagnostics to "診断", LKey.state to "状態", LKey.location to "場所", LKey.message to "メッセージ",
            LKey.notConfigured to "未設定 - タップして設定を開く", LKey.secureExitNode to "安全な出口ノード", LKey.vietnam to "ベトナム",
            LKey.startVPNHint to "選択した場所への VPN トンネルを開始します", LKey.stopVPNHint to "VPN トンネルを停止します",
            LKey.paywallTitle to "VPNFlow Premium", LKey.paywallSubtitle to "プライベートで暗号化されたインターネット保護を解除します。",
            LKey.benefitTunnel to "安全な VPN トンネル", LKey.benefitWifi to "公共 Wi-Fi での保護", LKey.benefitFast to "ワンタップで高速接続",
            LKey.noPlans to "利用可能なプランがありません", LKey.noPlansDetail to "Play Billing が Monthly_Premium または Yearly_Premium を返しませんでした。",
            LKey.subscriptionDisclosure to "お支払いは購入確定時に Google Play アカウントに請求されます。サブスクリプションは、現在の期間終了の24時間前までにキャンセルしない限り自動更新され、更新料金は期間終了前24時間以内に請求されます。サブスクリプションは Google Play の購読設定でいつでも管理・キャンセルできます。無料トライアルが提供される場合、未使用分はサブスクリプション購入時に失われます。",
            LKey.manageSubscription to "サブスクリプションを管理",
            LKey.privacy to "プライバシー", LKey.eula to "EULA", LKey.notNow to "後で", LKey.disconnected to "未接続",
            LKey.connecting to "接続中", LKey.connected to "接続済み", LKey.disconnecting to "切断中", LKey.failed to "失敗",
            LKey.disconnectedSubtitle to "VPN トンネルはオフです", LKey.connectingSubtitle to "安全な VPN トンネルを開始中",
            LKey.connectedSubtitle to "通信は保護されています", LKey.disconnectingSubtitle to "VPN トンネルを停止中",
            LKey.failedSubtitle to "VPN の確認が必要です",
            LKey.select to "選択", LKey.serverLocation to "サーバー", LKey.loadingLocations to "サーバーを読み込み中…", LKey.noServerAvailable to "利用可能なサーバーがありません", LKey.refreshLocations to "サーバーを更新", LKey.usingSavedServers to "保存済みサーバーを表示中 — コーディネーターに接続できません。再試行するにはタップ。",
            LKey.devices to "デバイス", LKey.revoke to "取り消す", LKey.revokeDeviceConfirm to "このデバイスを取り消しますか？このデバイスは接続できなくなります。", LKey.thisDevice to "このデバイス", LKey.deviceRevoked to "デバイスを取り消しました。", LKey.noDevices to "登録されたデバイスがありません。", LKey.active to "アクティブ", LKey.revoked to "取り消し済み", LKey.loadingDevices to "デバイスを読み込み中…",
            LKey.signInRequiredShort to "サインインが必要です", LKey.updateRequiredShort to "アップデートが必要です", LKey.deleteAccountDoneShort to "アカウントを削除しました。", LKey.invalidEmailShort to "有効なメールアドレスを入力してください。", LKey.notNowShort to "後で"
        ),
        AppLanguage.KOREAN to mapOf(
            LKey.systemLanguage to "System Setting", LKey.language to "Language", LKey.appSubtitle to "베트남을 통한 비공개 암호화 인터넷",
            LKey.signInRequired to "로그인이 필요합니다",
            LKey.signInTitle to "로그인", LKey.invalidEmail to "유효한 이메일 주소를 입력하세요.",
            LKey.devCode to "개발자 코드: %s", LKey.loginCodeSent to "로그인 코드가 전송되었습니다",
            LKey.emailPlaceholder to "you@example.com", LKey.codePlaceholder to "123456",
            LKey.updateRequired to "업데이트 필요", LKey.updateRequiredDetail to "계속하려면 새 VPNFlow 버전이 필요합니다. 스토어에서 업데이트하세요.", LKey.update to "업데이트", LKey.deleteAccount to "계정 삭제", LKey.deleteAccountConfirm to "계정과 모든 데이터가 영구적으로 삭제되며 되돌릴 수 없습니다.", LKey.deleteAccountDone to "계정이 삭제되었습니다.", LKey.cancel to "취소",
            LKey.configuration to "설정", LKey.done to "완료", LKey.subscription to "구독", LKey.status to "상태",
            LKey.premiumActive to "Premium 활성화됨", LKey.premiumRequired to "Premium 필요", LKey.free to "무료",
            LKey.protectionUnlocked to "VPN 보호가 활성화되었습니다", LKey.choosePlanToStart to "보호를 시작하려면 플랜을 선택하세요",
            LKey.choosePlan to "플랜 선택", LKey.restorePurchases to "구매 복원", LKey.support to "지원",
            LKey.contactSupport to "지원 문의", LKey.privacyPolicy to "개인정보 처리방침", LKey.appleStandardEULA to "Apple 표준 EULA",
            LKey.upgrade to "업그레이드", LKey.preparingPermission to "VPN 권한을 기다리는 중…", LKey.vpnStartFailure to "VPN을 시작할 수 없습니다. 다시 시도해 주세요.",
            LKey.diagnostics to "진단", LKey.state to "상태", LKey.location to "위치", LKey.message to "메시지",
            LKey.notConfigured to "설정되지 않음 - 탭하여 설정 열기", LKey.secureExitNode to "보안 출구 노드", LKey.vietnam to "베트남",
            LKey.startVPNHint to "선택한 위치로 VPN 터널을 시작합니다", LKey.stopVPNHint to "VPN 터널을 중지합니다",
            LKey.paywallTitle to "VPNFlow Premium", LKey.paywallSubtitle to "비공개 암호화 인터넷 보호를 잠금 해제하세요.",
            LKey.benefitTunnel to "보안 VPN 터널", LKey.benefitWifi to "공용 Wi-Fi 보호", LKey.benefitFast to "빠른 원탭 연결",
            LKey.noPlans to "사용 가능한 플랜 없음", LKey.noPlansDetail to "Play Billing이 Monthly_Premium 또는 Yearly_Premium을 반환하지 않았습니다.",
            LKey.subscriptionDisclosure to "결제는 구매 확정 시 Google Play 계정에 청구됩니다. 구독은 현재 기간 종료 최소 24시간 전에 취소하지 않으면 자동 갱신되며, 갱신 요금은 기간 종료 24시간 이내에 청구됩니다. 구독은 Google Play 구독 설정에서 언제든지 관리하거나 취소할 수 있습니다. 무료 체험 기간이 제공되는 경우, 사용하지 않은 부분은 구독 구매 시 소멸됩니다.",
            LKey.manageSubscription to "구독 관리",
            LKey.privacy to "개인정보", LKey.eula to "EULA", LKey.notNow to "나중에", LKey.disconnected to "연결 끊김",
            LKey.connecting to "연결 중", LKey.connected to "연결됨", LKey.disconnecting to "연결 해제 중", LKey.failed to "실패",
            LKey.disconnectedSubtitle to "VPN 터널이 꺼져 있습니다", LKey.connectingSubtitle to "보안 VPN 터널을 시작하는 중",
            LKey.connectedSubtitle to "트래픽이 보호되고 있습니다", LKey.disconnectingSubtitle to "VPN 터널을 중지하는 중",
            LKey.failedSubtitle to "VPN 확인이 필요합니다",
            LKey.select to "선택", LKey.serverLocation to "서버", LKey.loadingLocations to "서버를 불러오는 중…", LKey.noServerAvailable to "사용 가능한 서버 없음", LKey.refreshLocations to "서버 새로고침", LKey.usingSavedServers to "저장된 서버 표시 중 — 코디네이터에 연결할 수 없습니다. 다시 시도하려면 탭하세요.",
            LKey.devices to "기기", LKey.revoke to "해지", LKey.revokeDeviceConfirm to "이 기기를 해지하시겠습니까? 이 기기는 더 이상 연결할 수 없습니다.", LKey.thisDevice to "현재 기기", LKey.deviceRevoked to "기기가 해지되었습니다.", LKey.noDevices to "등록된 기기가 없습니다.", LKey.active to "활성", LKey.revoked to "해지됨", LKey.loadingDevices to "기기를 불러오는 중…",
            LKey.signInRequiredShort to "로그인이 필요합니다", LKey.updateRequiredShort to "업데이트 필요", LKey.deleteAccountDoneShort to "계정이 삭제되었습니다.", LKey.invalidEmailShort to "유효한 이메일 주소를 입력하세요.", LKey.notNowShort to "나중에"
        )
    )
}

/** Simple observable language store (persists choice in SharedPreferences). */
class LanguageStore(private val prefs: android.content.SharedPreferences) {
    private val choiceKey = "flowvpn.languageChoice"
    private val _choice = MutableStateFlow(LangChoice.fromId(prefs.getString(choiceKey, "system") ?: "system"))
    val choice: StateFlow<LangChoice> = _choice.asStateFlow()

    val language: AppLanguage
        get() = _choice.value.language ?: L10n.systemLanguage()

    fun setChoice(next: LangChoice) {
        _choice.value = next
        prefs.edit().putString(choiceKey, next.id).apply()
    }

    fun t(key: LKey): String = L10n.text(key, language)

    fun stateLabel(state: com.privatevpn.app.theme.VPNState): String = when (state) {
        com.privatevpn.app.theme.VPNState.DISCONNECTED -> t(LKey.disconnected)
        com.privatevpn.app.theme.VPNState.CONNECTING -> t(LKey.connecting)
        com.privatevpn.app.theme.VPNState.CONNECTED -> t(LKey.connected)
        com.privatevpn.app.theme.VPNState.DISCONNECTING -> t(LKey.disconnecting)
        com.privatevpn.app.theme.VPNState.FAILED -> t(LKey.failed)
    }

    fun stateSubtitle(state: com.privatevpn.app.theme.VPNState): String = when (state) {
        com.privatevpn.app.theme.VPNState.DISCONNECTED -> t(LKey.disconnectedSubtitle)
        com.privatevpn.app.theme.VPNState.CONNECTING -> t(LKey.connectingSubtitle)
        com.privatevpn.app.theme.VPNState.CONNECTED -> t(LKey.connectedSubtitle)
        com.privatevpn.app.theme.VPNState.DISCONNECTING -> t(LKey.disconnectingSubtitle)
        com.privatevpn.app.theme.VPNState.FAILED -> t(LKey.failedSubtitle)
    }
}
