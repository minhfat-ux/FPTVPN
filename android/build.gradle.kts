// Top-level build file. Plugin versions are declared here (settings plugin
// management resolves them from google()/mavenCentral()).
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21" apply false
}

// BIWIN is ExFAT; macOS stores xattrs (com.apple.provenance) as ._ AppleDouble
// sidecars there, which break aapt/d8 on build outputs. Build on APFS instead.
subprojects {
    layout.buildDirectory.set(file(System.getProperty("user.home") + "/.vpnflow-build/" + name))
}
