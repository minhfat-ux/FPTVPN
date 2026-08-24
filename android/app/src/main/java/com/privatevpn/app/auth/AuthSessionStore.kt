package com.privatevpn.app.auth

import com.privatevpn.app.api.CoordinatorAuthSession
import com.privatevpn.app.storage.SecureStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Persists the coordinator app-session token (encrypted storage), mirroring
 *  the iOS AuthSessionStore. */
class AuthSessionStore(private val store: SecureStore) {
    private val json = Json { ignoreUnknownKeys = true }

    private val _session = MutableStateFlow(load())
    val session: StateFlow<CoordinatorAuthSession?> = _session.asStateFlow()

    val accessToken: String? get() = _session.value?.accessToken
    val isSignedIn: Boolean get() = !accessToken.isNullOrEmpty()

    fun save(session: CoordinatorAuthSession) {
        store.putString(SecureStore.Keys.AUTH_SESSION, json.encodeToString(session))
        _session.value = session
    }

    fun signOut() {
        store.remove(SecureStore.Keys.AUTH_SESSION)
        _session.value = null
    }

    private fun load(): CoordinatorAuthSession? {
        val raw = store.getString(SecureStore.Keys.AUTH_SESSION) ?: return null
        return runCatching { json.decodeFromString<CoordinatorAuthSession>(raw) }.getOrNull()
    }
}
