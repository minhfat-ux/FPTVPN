# App Android (Kotlin + Compose) — khung + template

> Đi theo đúng convention trong repo: `android/app/src/main/java/com/privatevpn/app/`
> dùng Compose, theme là một `object` trong `theme/Theme.kt`. fBuddy dựng ở thư mục riêng
> `fbuddy-android/` với applicationId riêng, không dùng chung module với VPNFlow.

## 1. Khung project

```
fbuddy-android/
├── settings.gradle.kts · build.gradle.kts · gradle/libs.versions.toml
└── app/
    ├── build.gradle.kts
    └── src/main/
        ├── AndroidManifest.xml
        └── java/com/fbuddy/app/
            ├── FBuddyApp.kt              # Application, khởi tạo OkHttp
            ├── MainActivity.kt           # setContent { FBuddyTheme { … } }
            ├── theme/FBTheme.kt          # token — chép từ THEME.md mục 7
            ├── net/ApiClient.kt · SseClient.kt · Dto.kt
            ├── data/TokenStore.kt        # EncryptedSharedPreferences
            └── ui/chat/ChatScreen.kt · ChatViewModel.kt · Composer.kt
```

Phụ thuộc chính (`app/build.gradle.kts`):

```kotlin
android {
    namespace = "com.fbuddy.app"
    compileSdk = 35
    defaultConfig { applicationId = "site.meetflowai.fbuddy"; minSdk = 26; targetSdk = 35 }
    buildFeatures { compose = true }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")          // SSE — bắt buộc
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("androidx.security:security-crypto:1.1.0-alpha06") // token
    implementation("io.coil-kt:coil-compose:2.7.0")                   // ảnh VietQR, avatar
}
```

`AndroidManifest.xml`: `INTERNET`, và `RECORD_AUDIO` (chỉ khi làm dictation/voice):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```
Trong `MainActivity`: khoá dark cho khớp web —
`AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)`, và theme Compose
đọc token từ `FBTheme` (không dùng `dynamicColor`, vì màu sẽ đổi theo máy và lệch web).

## 2. Template: `ApiClient.kt`

```kotlin
package com.fbuddy.app.net

import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

class ApiException(val status: Int, val code: String, override val message: String) : IOException(message) {
    val isUnauthorized get() = status == 401
    val needsCredit get() = status == 402
}

object ApiClient {
    const val BASE = "https://fbuddy.meetflowai.site/api"
    val json = Json { ignoreUnknownKeys = true }
    val http: OkHttpClient = OkHttpClient.Builder().build()

    /** Lỗi chuẩn của server: { "error": { "code": …, "message": … } } */
    @kotlinx.serialization.Serializable data class ErrBody(val code: String, val message: String)
    @kotlinx.serialization.Serializable data class ErrEnvelope(val error: ErrBody)

    fun request(path: String, method: String = "GET", bodyJson: String? = null): Request {
        val builder = Request.Builder().url("$BASE$path")
        if (bodyJson != null) builder.method(method, bodyJson.toRequestBody("application/json".toMediaType()))
        else builder.method(method, null)
        TokenStore.token?.let { builder.header("Authorization", "Bearer $it") }
        return builder.build()
    }

    suspend fun <T> send(path: String, method: String = "GET", bodyJson: String? = null,
                         decode: (String) -> T): T = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        http.newCall(request(path, method, bodyJson)).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val env = runCatching { json.decodeFromString<ErrEnvelope>(text) }.getOrNull()
                throw ApiException(response.code, env?.error?.code ?: "unknown",
                    env?.error?.message ?: "Không kết nối được máy chủ.")
            }
            decode(text)
        }
    }
}
```

## 3. Template: `SseClient.kt` (dùng `okhttp-sse`)

```kotlin
package com.fbuddy.app.net

import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

/** Một sự kiện SSE: name = start/status/delta/tool_call/tool_result/artifact/usage/notice/done/error */
data class SseEvent(val name: String, val data: String)

class SseClient(private val onEvent: (SseEvent) -> Unit,
                private val onError: (Throwable) -> Unit,
                private val onClosed: () -> Unit = {}) {

    private var source: EventSource? = null

    fun start(path: String, bodyJson: String) {
        val request = Request.Builder()
            .url("${ApiClient.BASE}$path")
            .header("Accept", "text/event-stream")
            .apply { TokenStore.token?.let { header("Authorization", "Bearer $it") } }
            .post(bodyJson.toRequestBody("application/json".toMediaType()))
            .build()
        source = EventSources.createFactory(ApiClient.http)
            .newEventSource(request, object : EventSourceListener() {
                override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                    onEvent(SseEvent(type ?: "message", data))     // okhttp-sse đã tự buffer theo dòng
                }
                override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                    onError(t ?: ApiException(response?.code ?: -1, "stream", "Mất kết nối."))
                }
                override fun onClosed(eventSource: EventSource) { onClosed() }
            })
    }

    /** Dừng phải HUỶ thật: server vẫn tính credit tới khi lượt kết thúc. */
    fun cancel() { source?.cancel(); source = null }
}
```

## 4. Template: `TokenStore.kt` (mã hoá bằng Keystore)

```kotlin
package com.fbuddy.app.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Token JWT sống 30 ngày — lưu mã hoá, KHÔNG dùng SharedPreferences thường. */
object TokenStore {
    private const val FILE = "fbuddy_secure"
    private const val KEY = "auth-token"
    private lateinit var prefs: android.content.SharedPreferences

    fun init(context: Context) {
        val master = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        prefs = EncryptedSharedPreferences.create(context, FILE, master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }
    var token: String?
        get() = prefs.getString(KEY, null)
        set(value) { prefs.edit().apply { if (value == null) remove(KEY) else putString(KEY, value) }.apply() }
}
```

## 5. Template: `ChatViewModel.kt`

```kotlin
package com.fbuddy.app.ui.chat

import androidx.lifecycle.ViewModel
import com.fbuddy.app.net.SseClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.*

data class ChatUiState(
    val messages: List<Pair<Boolean, String>> = emptyList(),  // true = người dùng
    val streaming: String = "",
    val status: String? = null,
    val error: String? = null,
    val needsCredit: Boolean = false,
)

class ChatViewModel : ViewModel() {
    private val json = Json { ignoreUnknownKeys = true }
    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state
    private var sse: SseClient? = null

    fun send(text: String, conversationId: String? = null, skill: String = "auto") {
        _state.value = _state.value.copy(
            messages = _state.value.messages + (true to text),
            streaming = "", error = null, needsCredit = false)
        val body = buildJsonObject {
            put("content", text); put("skill", skill); put("toolMode", "auto")
            put("attachments", buildJsonArray { })
            conversationId?.let { put("conversationId", it) }
        }.toString()

        sse = SseClient(
            onEvent = { event ->
                val obj = runCatching { json.parseToJsonElement(event.data).jsonObject }.getOrNull()
                when (event.name) {
                    "delta"  -> _state.value = _state.value.copy(streaming = _state.value.streaming + (obj?.get("text")?.jsonPrimitive?.content ?: ""))
                    "status" -> _state.value = _state.value.copy(status = obj?.get("stage")?.jsonPrimitive?.content)
                    "usage"  -> Unit   // cập nhật số dư credit nếu cần
                    "done"   -> _state.value = _state.value.copy(
                                    messages = _state.value.messages + (false to _state.value.streaming),
                                    streaming = "", status = null)
                    "error"  -> _state.value = _state.value.copy(
                                    needsCredit = obj?.get("code")?.jsonPrimitive?.content == "insufficient_credits",
                                    error = obj?.get("message")?.jsonPrimitive?.content)
                }
            },
            onError = { _state.value = _state.value.copy(error = it.message) },
        ).also { it.start("/chat/stream", body) }
    }

    /** Dừng: huỷ request thật, và giữ phần chữ đã nhận. */
    fun stop() {
        sse?.cancel(); sse = null
        _state.value = _state.value.let {
            it.copy(messages = it.messages + (false to it.streaming), streaming = "", status = null)
        }
    }

    override fun onCleared() { sse?.cancel() }
}
```

## 6. Chạy & phát hành

```bash
cd fbuddy-android && ./gradlew :app:assembleDebug
./gradlew :app:bundleRelease          # AAB để đưa lên Play
```
- `applicationId` `site.meetflowai.fbuddy`; ký bằng keystore riêng (không dùng keystore của VPNFlow).
- R8: giữ class `@Serializable` — thêm rule
  `-keepclassmembers class com.fbuddy.app.** { *** Companion; }` và
  `-keepclasseswithmembers class com.fbuddy.app.** { kotlinx.serialization.KSerializer serializer(...); }`.
- Play: mô tả rõ là trợ lý AI, khai báo quyền micro chỉ khi thật sự dùng; Data safety phải
  khai có gửi nội dung hội thoại lên máy chủ.
- Điền [`templates/STORE-RELEASE.template.md`](templates/STORE-RELEASE.template.md) trước khi nộp.

## 7. Checklist trước khi mở PR

- [ ] Màu chỉ lấy từ `FBTheme` (grep `Color(0x` ngoài `theme/` phải rỗng).
- [ ] Không bật dynamic color / Material You (sẽ lệch web).
- [ ] SSE chạy chữ dần; dừng huỷ request thật; 402 hiện lời mời nạp.
- [ ] Token nằm EncryptedSharedPreferences; đăng xuất xoá token **và** gọi `/auth/logout`.
- [ ] Xoay màn hình / vào lại app không mất phần chữ đang chạy (ViewModel giữ state).
- [ ] Ảnh so sánh với web ở 390px (xem `THEME.md` mục 8).
