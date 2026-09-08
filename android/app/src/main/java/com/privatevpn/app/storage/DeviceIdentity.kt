package com.privatevpn.app.storage

import com.wireguard.crypto.KeyPair
import com.wireguard.crypto.Key

/**
 * Stable, per-installation device identity + WireGuard keypair, stored
 * encrypted (Android Keystore). Mirrors iOS DeviceIdentity + KeychainStore.
 */
object DeviceIdentity {

    /** Returns the stable device id, creating and persisting it on first use. */
    fun deviceID(store: SecureStore): String {
        store.getString(SecureStore.Keys.DEVICE_ID)?.let { return it }
        val id = java.util.UUID.randomUUID().toString()
        store.putString(SecureStore.Keys.DEVICE_ID, id)
        return id
    }

    /** Loads (or creates) the WireGuard keypair. Never sends the private key out. */
    fun obtainOrCreateKeyPair(store: SecureStore): KeyPair {
        val existing = store.getString(SecureStore.Keys.WG_PRIVATE_KEY)
        if (existing != null) {
            return runCatching {
                KeyPair(Key.fromBase64(existing))
            }.getOrElse { generateAndStore(store) }
        }
        return generateAndStore(store)
    }

    private fun generateAndStore(store: SecureStore): KeyPair {
        val pair = KeyPair()
        store.putString(SecureStore.Keys.WG_PRIVATE_KEY, pair.privateKey.toBase64())
        store.putString(SecureStore.Keys.WG_PUBLIC_KEY, pair.publicKey.toBase64())
        return pair
    }

    /**
     * Replaces the stored WireGuard keypair with a brand-new one. Used when the
     * coordinator rejects this device as revoked (403 "Device has been
     * revoked"): the old key can never register again, so come back as a NEW
     * device with a NEW keypair.
     */
    fun rotateKeyPair(store: SecureStore): KeyPair {
        store.remove(SecureStore.Keys.WG_PRIVATE_KEY)
        store.remove(SecureStore.Keys.WG_PUBLIC_KEY)
        return generateAndStore(store)
    }

    fun registrationName(store: SecureStore): String {
        val id = deviceID(store)
        return "android-${id.replace("-", "").take(8)}"
    }

    fun randomRegistrationName(): String {
        val id = java.util.UUID.randomUUID().toString().replace("-", "")
        return "android-${id.take(8)}"
    }
}
