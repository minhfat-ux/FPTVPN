import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.privatevpn.app"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.privatevpn.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
