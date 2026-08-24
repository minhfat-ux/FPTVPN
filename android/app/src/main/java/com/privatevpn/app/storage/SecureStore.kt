package com.privatevpn.app.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * EncryptedSharedPreferences-backed secure storage (Android Keystore master
 * key). Holds credentials the iOS app keeps in the Keychain: the WireGuard
 * private key, the auth session, and the stable device identity.
 */
class SecureStore(context: Context) {
    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "vpnflow_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun getString(key: String, default: String? = null): String? = prefs.getString(key, default)
    fun putString(key: String, value: String) { prefs.edit().putString(key, value).apply() }
    fun remove(key: String) { prefs.edit().remove(key).apply() }
    fun contains(key: String): Boolean = prefs.contains(key)

    object Keys {
        const val WG_PRIVATE_KEY = "wg.privateKey"
        const val WG_PUBLIC_KEY = "wg.publicKey"
        const val DEVICE_ID = "device.identity"
        const val AUTH_SESSION = "auth.session.json"
        const val CACHED_NODES = "cached.nodes.json"
        const val CACHED_TUNNEL = "cached.tunnel.json"
        const val SELECTED_NODE_ID = "config.node.id"
    }
}
