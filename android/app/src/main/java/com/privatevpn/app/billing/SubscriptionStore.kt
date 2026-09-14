package com.privatevpn.app.billing

import com.privatevpn.app.BuildConfig
import com.privatevpn.app.api.ControlAPIClient
import com.privatevpn.app.api.CoordinatorSubscriptionStatus
import com.privatevpn.app.auth.AuthSessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Backend-only entitlement store. Mirrors the iOS `SubscriptionStore`.
 *  Từng bọc Google Play Billing; nay quyền Premium chỉ đọc `subscription_status.is_active` từ backend — đừng thêm lại billing vì không còn kênh nào bán qua store. */
class SubscriptionStore(
    private val authStore: AuthSessionStore,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /** Backend entitlement: true when the signed-in account has an active subscription. */
    private val _backendPremium = MutableStateFlow(false)
    val backendPremium: StateFlow<Boolean> = _backendPremium.asStateFlow()

    /** True khi tài khoản đang dùng bản dùng thử 1 ngày miễn phí (`is_active` + `is_trial`). */
    private val _isOnFreeTrial = MutableStateFlow(false)
    val isOnFreeTrial: StateFlow<Boolean> = _isOnFreeTrial.asStateFlow()

    /** Số giờ còn lại của bản dùng thử; null khi không phải trial (xem `trial_hours_left`). */
    private val _trialHoursLeft = MutableStateFlow<Int?>(null)
    val trialHoursLeft: StateFlow<Int?> = _trialHoursLeft.asStateFlow()

    /** Tên gói đang dùng ("Monthly" / "3 Months"…): đọc `plan_badge` từ backend, không có thì suy từ product_id. */
    private val _activePlanName = MutableStateFlow("")
    val activePlanName: StateFlow<String> = _activePlanName.asStateFlow()

    /** Ngày hết hạn của gói đã mua (null = vĩnh viễn hoặc chưa mua). */
    private val _planExpiresAt = MutableStateFlow<Long?>(null)
    val planExpiresAt: StateFlow<Long?> = _planExpiresAt.asStateFlow()

    /** Số ngày còn lại của gói (null khi gói vĩnh viễn). */
    private val _planDaysLeft = MutableStateFlow<Int?>(null)
    val planDaysLeft: StateFlow<Int?> = _planDaysLeft.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    val isSubscribed: Boolean
        get() {
            return if (BuildConfig.DEBUG) {
                // Dev unlock (khớp `#if DEBUG` của iOS): bản debug của chủ dự án luôn
                // thấy Premium, bản Release thì không có đường mở khoá nào ngoài backend.
                true
            } else {
                _backendPremium.value
            }
        }

    fun syncBackendPremium() {
        applySubscriptionStatus(authStore.session.value?.user?.subscriptionStatus)
    }

    /** Ghi quyền Premium + trạng thái trial từ một payload `subscription_status`. */
    private fun applySubscriptionStatus(status: CoordinatorSubscriptionStatus?) {
        val active = status?.isActive ?: false
        _backendPremium.value = active
        _isOnFreeTrial.value = active && status?.isTrial == true
        _trialHoursLeft.value = if (_isOnFreeTrial.value) status?.trialHoursLeft else null
        // Gói đã mua: hiện đúng tên gói + hạn để mục Subscription nói rõ khách đang dùng gì.
        _activePlanName.value = if (!active) "" else {
            status?.planBadge?.takeIf { it.isNotBlank() }
                ?: status?.productId?.takeIf { it.isNotBlank() }?.replaceFirstChar { it.uppercase() }
                ?: "Premium"
        }
        val expiry = status?.expiresAt?.takeIf { it.isNotBlank() }?.let { raw ->
            runCatching { java.time.Instant.parse(raw).toEpochMilli() }
                .recoverCatching { java.time.OffsetDateTime.parse(raw).toInstant().toEpochMilli() }
                .getOrNull()
        }
        _planExpiresAt.value = if (active) expiry else null
        _planDaysLeft.value = _planExpiresAt.value?.let { millis ->
            val left = millis - System.currentTimeMillis()
            maxOf(0, Math.ceil(left / 86_400_000.0).toInt())
        }
    }

    /**
     * Đọc lại session từ coordinator (`GET /v1/auth/session`) và cập nhật quyền Premium.
     *
     * Dùng cho cả hai đường:
     * - nút "Làm mới trạng thái gói" → `reportFailure = true` (khách phải thấy lỗi);
     * - tự động lúc mở app và ngay sau khi đăng nhập → `reportFailure = false`.
     *
     * Vì sao có đường tự động: [syncBackendPremium] chỉ đọc lại session ĐÃ CACHE, mà
     * `subscription_status` chỉ về một lần lúc đăng nhập. Trước đây Play Billing tự đọc quyền
     * trên máy nên khách mua trên web vẫn vào được; Play Billing đã bị gỡ (14/09/2026) nên nếu
     * không đọc lại, khách vừa trả tiền trên web sẽ bị đẩy vào paywall cho tới khi bấm tay.
     *
     * Lỗi (mất mạng, hoặc control plane cũ chưa có route này → 404) thì **giữ nguyên** quyền
     * đang có: không được tự hạ một khách đang trả tiền xuống Free, và lần gọi tự động thì im
     * lặng — không chặn mở app, không chặn nút Connect.
     */
    fun refreshEntitlement(reportFailure: Boolean = true) {
        val token = authStore.accessToken
        if (token.isNullOrEmpty()) {
            if (reportFailure) _errorMessage.value = "Please sign in first."
            return
        }
        scope.launch {
            try {
                val refreshed = ControlAPIClient().fetchSession(token)
                // Chỉ ghi storage khi payload thật sự đổi: tránh ghi vô ích mỗi lần mở app.
                if (authStore.session.value != refreshed) authStore.save(refreshed)
                applySubscriptionStatus(refreshed.user.subscriptionStatus)
                _errorMessage.value = null
            } catch (e: Exception) {
                if (reportFailure) _errorMessage.value = e.message ?: "Could not refresh your purchase."
            }
        }
    }
}
