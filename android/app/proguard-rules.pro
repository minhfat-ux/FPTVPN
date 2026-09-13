# WireGuard tunnel library
-keep class com.wireguard.** { *; }
-keep class com.wireguard.android.backend.** { *; }
-dontwarn com.wireguard.**

# kotlinx-serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.privatevpn.app.api.**$$serializer { *; }
-keepclassmembers class com.privatevpn.app.api.** {
    *** Companion;
}
-keepclasseswithmembers class com.privatevpn.app.api.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Annotation của Google mà tink (androidx.security:security-crypto) có tham chiếu nhưng
# KHÔNG cần lúc chạy. Trước đây R8 không phàn nàn vì rule `-dontwarn
# com.google.errorprone.annotations.**` đến từ consumer proguard.txt của
# play-services-basement, kéo vào gián tiếp qua Google Play Billing. Sau khi bỏ Play
# Billing (14/09/2026) chuỗi đó biến mất nên `assembleModernRelease` fail ở
# minifyModernReleaseWithR8 với "Missing class com.google.errorprone.annotations.*".
# Tự khai lại đúng rule đó ở đây thay vì kéo lại một dependency Google chỉ để lấy proguard
# rule (AGP cũng gợi ý y hệt trong outputs/mapping/missing_rules.txt).
-dontwarn com.google.errorprone.annotations.**
