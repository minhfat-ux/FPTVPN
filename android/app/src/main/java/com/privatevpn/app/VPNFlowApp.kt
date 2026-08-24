package com.privatevpn.app

import android.app.Application
import com.privatevpn.app.auth.AuthSessionStore
import com.privatevpn.app.billing.SubscriptionStore
import com.privatevpn.app.l10n.LanguageStore
import com.privatevpn.app.storage.SecureStore
import com.privatevpn.app.vpn.VPNManager

/** Application container — owns the shared stores/managers. */
class VPNFlowApp : Application() {
    lateinit var secureStore: SecureStore
        private set
    lateinit var authStore: AuthSessionStore
        private set
    lateinit var vpnManager: VPNManager
        private set
    lateinit var subscriptionStore: SubscriptionStore
        private set
    lateinit var languageStore: LanguageStore
        private set

    override fun onCreate() {
        super.onCreate()
        secureStore = SecureStore(this)
        authStore = AuthSessionStore(secureStore)
        vpnManager = VPNManager(this, secureStore, authStore)
        subscriptionStore = SubscriptionStore(this, authStore)
        languageStore = LanguageStore(getSharedPreferences("vpnflow_prefs", MODE_PRIVATE))
        vpnManager.refreshDevicePublicKey()
    }
}
