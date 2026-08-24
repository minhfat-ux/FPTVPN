package com.privatevpn.app.api

/** Force-update gate — mirrors iOS AppVersionService. */
object AppVersionService {
    fun isForcedUpdate(info: AppVersionInfo, current: String): Boolean =
        isVersion(current, info.minimumVersion)

    fun isUpdateAvailable(info: AppVersionInfo, current: String): Boolean =
        isVersion(current, info.latestVersion)

    /** Numeric component-wise version compare ("1.0.2" < "1.0.10"). */
    fun isVersion(a: String, b: String): Boolean {
        val av = a.split(".").mapNotNull { it.toIntOrNull() }
        val bv = b.split(".").mapNotNull { it.toIntOrNull() }
        val count = maxOf(av.size, bv.size)
        for (i in 0 until count) {
            val x = if (i < av.size) av[i] else 0
            val y = if (i < bv.size) bv[i] else 0
            if (x != y) return x < y
        }
        return false
    }
}
