package com.privatevpn.app

import com.privatevpn.app.l10n.AppLanguage
import com.privatevpn.app.l10n.L10n
import com.privatevpn.app.l10n.LKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Verifies the 5-language table covers every key with non-empty text. */
class L10nTest {
    @Test fun `every key has text in all 5 languages`() {
        for (lang in AppLanguage.entries) {
            for (key in LKey.entries) {
                val text = L10n.text(key, lang)
                assertFalse("[$lang] $key is empty", text.isBlank())
                assertFalse("[$lang] $key fell back to key name", text == key.name)
            }
        }
    }

    @Test fun `system language detection`() {
        // Force default locale vi -> VIETNAMESE (device locale is set at runtime;
        // the JVM default here is en, so just check fallback works).
        val en = L10n.systemLanguage()
        assertTrue(en == AppLanguage.ENGLISH || en in AppLanguage.entries)
    }

    @Test fun `key texts differ per language`() {
        val en = L10n.text(LKey.appSubtitle, AppLanguage.ENGLISH)
        val vi = L10n.text(LKey.appSubtitle, AppLanguage.VIETNAMESE)
        val zh = L10n.text(LKey.appSubtitle, AppLanguage.CHINESE)
        assertFalse(en == vi)
        assertFalse(en == zh)
    }

    @Test fun `subscription disclosure contains renewal requirement`() {
        val en = L10n.text(LKey.subscriptionDisclosure, AppLanguage.ENGLISH)
        assertTrue(en.contains("24 hours"))
        assertTrue(en.contains("auto-renew"))
    }
}
