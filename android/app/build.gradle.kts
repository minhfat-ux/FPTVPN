import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Release signing: keystore + password live OUTSIDE the repo.
// Load from ~/keystores/vpnflow-signing.properties (created by scripts/setup-release-signing.sh)
// or from environment variables (STORE_FILE, STORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD).
fun loadSigningProps(): Properties? {
    val props = Properties()
    val fromEnv = System.getenv("STORE_FILE")
    val home = System.getProperty("user.home")
    val file = File(home, "keystores/vpnflow-signing.properties")
    if (fromEnv != null) {
        props["storeFile"] = fromEnv
        props["storePassword"] = System.getenv("STORE_PASSWORD") ?: ""
        props["keyAlias"] = System.getenv("KEY_ALIAS") ?: "vpnflow"
        props["keyPassword"] = System.getenv("KEY_PASSWORD") ?: props["storePassword"]
        return props
    }
    if (file.exists()) {
        file.inputStream().use { props.load(it) }
        return props
    }
    return null
}

val signingProps = loadSigningProps()

android {
    namespace = "com.privatevpn.app"
    compileSdk = 36
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.privatevpn.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.2.2"
    }

    signingConfigs {
        if (signingProps != null) {
            create("release") {
                storeFile = file(signingProps!!.getProperty("storeFile"))
                storePassword = signingProps!!.getProperty("storePassword")
                keyAlias = signingProps!!.getProperty("keyAlias")
                keyPassword = signingProps!!.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (signingProps != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            // BIWIN volume creates AppleDouble (._*) metadata files; never package them.
            excludes += "**/._*"
        }
        jniLibs {
            // The WireGuard tunnel AAR ships native libs for all ABIs; keep them all.
        }
    }

    aaptOptions {
        // Ignore macOS AppleDouble metadata from the source tree.
        ignoreAssetsPattern = "!.*:!._*:!*.bak"
    }
}

dependencies {
    implementation(files("libs/hysteria.aar"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.billing.ktx)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.security.crypto)
    implementation(libs.wireguard.tunnel)
    debugImplementation(libs.androidx.ui.tooling)

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}

// The ExFAT volume (BIWIN) stores macOS AppleDouble sidecars (._*) for files
// with extended attributes; AAPT2 writes create them next to every .arsc.flat
// and directory. Delete them right before resource parsing so aapt never sees
// a "._drawable" file.
androidComponents {
    onVariants(selector().all()) { variant ->
        val clean = tasks.register("cleanAppleDouble${variant.name.replaceFirstChar { it.uppercase() }}") {
            doLast {
                // Gradle fileTree default-excludes "._*", so walk the tree directly.
                layout.buildDirectory.dir("intermediates").get().asFile
                    .walkTopDown()
                    .filter { it.name.startsWith("._") }
                    .forEach { it.delete() }
            }
        }
        val parseTasks = tasks.matching {
            it.name == "parse${variant.name.replaceFirstChar { it.uppercase() }}LocalResources" ||
                it.name == "parse${variant.name.replaceFirstChar { it.uppercase() }}Resources"
        }
        // Order: package resources -> delete AppleDouble sidecars -> parse.
        clean.configure {
            dependsOn("package${variant.name.replaceFirstChar { it.uppercase() }}Resources")
        }
        parseTasks.configureEach { dependsOn(clean) }
    }
}
