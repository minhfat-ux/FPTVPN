plugins {
    alias(libs.plugins.android.application)
}

// App "guard" RIÊNG cho TV không TUN: giữ proxy hệ thống không bao giờ trỏ vào cổng chết.
// Vì sao phải là app thứ hai: ROM Xiaomi dùng `Force stopping` với VPNFlow (PeriodicCleaner),
// mà force-stop huỷ TOÀN BỘ alarm của chính app đó. App guard là package khác nên alarm của nó
// vẫn nổ, và nó có thể dọn proxy + đánh thức VPNFlow.
android {
    namespace = "com.privatevpn.app.guard"
    compileSdk = 36
    // Dùng đúng build-tools đã có sẵn trên máy (module app cũng dùng 35.0.0); để mặc định thì
    // Gradle đòi tải 34.0.0 từ Google — mạng này không tải được.
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.privatevpn.app.guard"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
        }
    }
}
