package com.privatevpn.app.billing

import com.privatevpn.app.BuildConfig
import com.privatevpn.app.auth.AuthSessionStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * STORE build (Google Play): the subscription status comes from the backend
 * account only. This build deliberately contains NO Play Billing client and no
 * in-app purchase of any kind — subscriptions are bought outside the app, then
 * the user signs in here (Google Play Payments policy).
 *
 * The public surface mirrors the web-selling build so the UI code is identical:
 * `backendPremium`, `purchasedProductIDs`, `isSubscribed`, `syncBackendPremium()`,
 * `start()`, `restorePurchases()`.
 */
class SubscriptionStore(
    private val authStore: AuthSessionStore,
) {
    /** Always empty in the store build (no store purchases to report). */
    private val _purchasedProductIDs = MutableStateFlow<Set<String>>(emptySet())
    val purchasedProductIDs: StateFlow<Set<String>> = _purchasedProductIDs.asStateFlow()

    /** Backend entitlement: true when the signed-in account has an active plan. */
    private val _backendPremium = MutableStateFlow(false)
    val backendPremium: StateFlow<Boolean> = _backendPremium.asStateFlow()

    val isSubscribed: Boolean
        get() = if (BuildConfig.DEBUG) true else _backendPremium.value

    /** Re-reads the subscription status of the signed-in account. */
    fun syncBackendPremium() {
        _backendPremium.value = authStore.session.value?.user?.subscriptionStatus?.isActive ?: false
    }

    /** Call-site compatibility: nothing to initialise without billing. */
    fun start() = Unit

    /** The paywall's "Restore purchases" action = re-sync the account. */
    fun restorePurchases() {
        syncBackendPremium()
    }
}
