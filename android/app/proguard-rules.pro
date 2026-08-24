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
