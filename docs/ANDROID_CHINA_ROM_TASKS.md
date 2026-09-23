# Android — ROM Trung Quốc / AOSP không GMS: task backlog (audit → sửa)

> **Trạng thái: CHƯA SỬA CODE APP.** Đây là log task đã chốt thứ tự ưu tiên, chờ thi hành.
> Người làm: Android dev (harness Windows). Người nghiệm thu: chủ dự án, trên **máy thật**.
>
> - **Nguồn:** audit tĩnh (đọc code, không build) toàn bộ `android/` — 37 file `.kt`, `AndroidManifest.xml`
>   (cả 2 flavor), `libs.versions.toml`, `proguard-rules.pro`, đối chiếu `control-plane/src/app-version.js`.
> - **Ngày audit:** 2026-09-24 · **Audit bởi:** harness Windows (agent chính + 2 worker read-only).
> - **Luật áp dụng:** `AGENTS.md` (§1 cấm thêm dependency / nới test · §3 diff tối thiểu · §4 bằng chứng),
>   `.privatevpn/coordination/PROTOCOL.md` (§3 claim trước khi sửa · §5 tên area).
> - **Claim của tài liệu này:** `[windows] android-china-rom`.
> - **Tài liệu liên quan:** `docs/ANDROID_METERED_BACKGROUND_DATA.md` (đã fix FGS ở 1.2.4),
>   `docs/ANDROID_CPU_TODO.md` (CPU/pin — xem mục 6 để không làm trùng).

---

## 0. Kết luận audit — vì sao thứ tự ưu tiên lại như dưới

Checklist audit ban đầu được viết cho app **có** GMS. App này thì không:

| Mục checklist | Kết luận trên code hiện tại |
|---|---|
| **1. GMS hard dependency** (FCM/Maps/FusedLocation/Sign-in) | **KHÔNG CÓ — 0 dependency Google.** Không cần `GoogleApiAvailability`, không cần abstraction layer. `libs.versions.toml:14-31` + `build.gradle.kts:150-172` chỉ có androidx/compose/okhttp/kotlinx/wireguard/`hysteria.aar`. |
| **2. Play Integrity / SafetyNet** | **KHÔNG dùng.** Rủi ro tương đương là **force-update gate** — xem `T-AND-01`. |
| **3. Background/battery kill** | FGS đã làm **đúng chuẩn Android 14+** (`specialUse` + property + `startForeground` ngay đầu `onStartCommand`). **Thiếu toàn bộ phần xin quyền ROM** — xem `T-AND-02`; có 1 lỗi **ANR** — `T-AND-09`. |
| **4. Network quirk khi khởi động** | 3 request bắn ở frame compose đầu nhưng **đều fail-soft, không crash** (`runCatching` + cache + node built-in). Vấn đề là timeout budget + UI "đang tải" vô hạn — `T-AND-08`. |

**Rủi ro thật, theo thứ tự thiệt hại:** (1) thiếu quyền ROM ⇒ VPN tự ngắt; (2) chặn cứng ở force-update
⇒ khoá app; (3) ANR khi đổi Wi-Fi ⇄ 4G ⇒ user bấm "Đóng ứng dụng"; (4) luồng consent VPN ⇒ treo
"Connecting" vĩnh viễn + chiếm slot thiết bị; (5) Keystore hỏng ⇒ app không mở được.

---

## 1. Blocker — phải xử lý TRƯỚC KHI test được trên máy thật

| # | Blocker | Bằng chứng / việc cần làm |
|---|---|---|
| B1 | **Máy Windows này không build được**: không có JDK, không có Android Studio (`java` không tồn tại; không tìm thấy `jbr`/`Android Studio`). SDK thì có (`C:\Users\Minhn\Android\sdk`, platform android-36, build-tools 35/36) và gradle cache có sẵn | Cài **JDK 17** rồi `./gradlew :app:testModernDebugUnitTest` + `:app:assembleModernDebug` để có APK cài máy thật. Không có bước này thì **mọi task đều không có bằng chứng build**. |
| B2 | **Bản debug sẽ bị màn ép cập nhật chặn cứng** ngay khi server đặt `android_minimum_version = 1.4.3`: `versionName` debug là `1.4.3-dev`, mà `AppVersionService.isVersion` cắt `"3-dev"` thành `0` (`AppVersionService.kt:38-48`) ⇒ `[1,4] < [1,4,3]` = **true** | **`T-AND-01` phải xong trước khi test máy thật**, nếu không sẽ không vào được app để test bất cứ thứ gì. |
| B3 | Đang có claim `[windows] release` = **PUBLISH Android 1.4.3 (code 29)** | Các fix trong tài liệu này đi vào **1.4.4 (versionCode 30)**, không nhét vào 1.4.3 đang phát hành. |
| B4 | Máy test | Cần tối thiểu: **1 máy ROM TQ** (Xiaomi/HyperOS hoặc Samsung CN) + **1 máy AOSP gần sạch** (để chứng minh không cần GMS). Flavor `legacy` (Fire OS/Android 7) chỉ test khi có máy. |

---

## 2. Bảng tổng hợp

| ID | P | Mức | Việc | File chính | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| **T-AND-01** | P0 | CRITICAL | Force-update: lối thoát + fail-open + URL dự phòng | `ui/ForceUpdateScreen.kt`, `api/AppVersionService.kt`, `MainActivity.kt` | — | TODO |
| **T-AND-02** | P0 | CRITICAL | Prompt quyền ROM: miễn tối ưu pin + App details + Auto-start | `ui/SettingsScreen.kt`, `AndroidManifest.xml`, `l10n/L10n.kt` | — | TODO |
| **T-AND-03** | P0 | MEDIUM | `CnAppBypass` tải danh sách qua host dự phòng | `vpn/CnAppBypass.kt` | — | TODO |
| **T-AND-04** | P1 | CRITICAL | Luồng consent VPN + khởi động service (gói 3 lỗi) | `MainActivity.kt`, `vpn/VPNManager.kt`, `vpn/HysteriaVpnService.kt` | — | TODO |
| **T-AND-05** | P1 | CRITICAL | `SecureStore` chống crash-loop khi Keystore hỏng | `storage/SecureStore.kt` | — | TODO |
| **T-AND-06** | P1 | HIGH | FGS fail-fast + `onRevoke()` báo UI | `vpn/HysteriaVpnService.kt` | T-AND-04 | TODO |
| **T-AND-07** | P1 | HIGH | Sticky restart giữ node list / relay / hostIds | `vpn/HysteriaVpnService.kt`, `vpn/VPNManager.kt` | — | TODO |
| **T-AND-08** | P1 | HIGH | API timeout budget + trạng thái lỗi danh sách server | `api/ControlAPIClient.kt`, `vpn/VPNManager.kt`, `ui/MainScreen.kt` | — | TODO |
| **T-AND-09** | P2 | CRITICAL | Đưa đo băng thông ra khỏi main thread (ANR) | `vpn/HysteriaVpnService.kt` | B1 (phải đo) | TODO |
| **T-AND-10** | P2 | HIGH | Generation token cho các vòng lặp nền (hết zombie thread) | `vpn/HysteriaVpnService.kt` | — | TODO |
| **T-AND-11** | P2 | HIGH | Edge-to-edge + insets (targetSdk 36) | `MainActivity.kt` + 3 file UI | — | TODO |
| **T-AND-12** | P2 | MEDIUM | Phòng vệ `LinkageError` ở biên `mobile.Mobile` | `vpn/HysteriaVpnService.kt` | — | TODO |
| **T-AND-13** | P2 | MEDIUM | L10n: 8 key thiếu + chuỗi lỗi qua `LKey` + test | `l10n/L10n.kt`, `vpn/VPNManager.kt`, `test/` | — | TODO |
| **T-AND-14** | P3 | MEDIUM | `setMetered(meteredNow)` thay vì hard-code `false` | `vpn/HysteriaVpnService.kt` | — | TODO |
| **T-AND-15** | P3 | MEDIUM | Notification FGS: category/onlyAlertOnce/icon riêng | `vpn/HysteriaVpnService.kt` | — | TODO |
| **T-AND-16** | P3 | MEDIUM | `BOOT_COMPLETED` / tự khởi động lại (chỉ khi user bật) | `AndroidManifest.xml` + receiver | T-AND-02 | TODO |
| **T-AND-17** | P3 | MEDIUM | `<intent-filter android.net.VpnService>` cho Always-on VPN | `AndroidManifest.xml` | cần verify máy thật | TODO |
| **T-AND-18** | P3 | MEDIUM | Deep link: hoặc xử lý `onNewIntent`, hoặc bỏ intent-filter | `MainActivity.kt` / `AndroidManifest.xml` | chủ dự án quyết | TODO |
| **T-AND-19** | P3 | LOW | Dọn dead code `RelayProtectService` | `vpn/RelayProtectService.kt`, manifest | — | TODO |
| **T-AND-20** | P3 | LOW | `DiagnosticsLog`: `SimpleDateFormat` thread-safe + buffer | `diag/DiagnosticsLog.kt` | gộp với CPU TODO mục C | TODO |

---

## 3. Chi tiết từng task

### T-AND-01 — P0 · CRITICAL · Force-update: lối thoát + fail-open + URL dự phòng

**Vì sao:** hiện `ForceUpdateScreen` là nhánh đầu của `when` (`MainActivity.kt:136`) với **đúng 1 nút**,
không "Thử lại", không "Để sau". URL dự phòng hard-code vào `api.meetflowai.site` — **đúng host bị GFW
chặn theo SNI** (`Config.kt:14-18`). Nếu server set cờ sai ⇒ **khoá sạch khách TQ**, họ không có đường thoát.

**Sửa gì:**
1. `api/AppVersionService.kt:5-6,38-48` — `isForcedUpdate` **fail-open** khi version không parse được thành số:
   cắt hậu tố `-`/`+` trước, nếu một trong hai không parse được thì trả `false` (không chặn).
2. `ui/ForceUpdateScreen.kt:63-72` — bọc `ContextCompat.startActivity` trong `runCatching`; khi fail thì
   hiện URL dạng text **copy được** (khách TQ hay gửi link qua WeChat) + nút "Thử lại".
3. `ui/ForceUpdateScreen.kt:41-46` — URL dự phòng đi qua `ControlPlaneHosts.orderedApiBases` (đã có sẵn cơ
   chế fallback host), **không** hard-code `Config.CONTROL_PLANE_URL`.
4. `MainActivity.kt:104-111` — lưu `forcedUpdate` kèm thời điểm check; cho phép "Dùng tiếp bản hiện tại"
   nếu lần check version gần nhất đã quá N ngày (N do chủ dự án chốt, đề xuất 7) — để một cờ sai không
   biến thành brick.
5. Hiện version hiện tại + `minimumVersion` trên màn đó (để khách đọc cho support).

**Điều kiện nghiệm thu:**
- [ ] `isForcedUpdate(info{min="1.4.3"}, "1.4.3-dev")` = **false** (unit test).
- [ ] `isForcedUpdate(info{min="9.9.9"}, "1.4.3")` = **true** (không nới lỏng bảo vệ cũ).
- [ ] `isForcedUpdate(info{min="abc"}, "1.4.3")` = **false** (fail-open).
- [ ] Không máy nào bị chặn khi `fetchAppVersion()` lỗi (giữ nguyên hành vi hiện tại — đã đúng).
- [ ] Bấm Update trên máy **không có trình duyệt** ⇒ **không crash**, hiện link copy được.

**Test trên máy thật:** (a) chặn mạng (`adb shell svc data disable; adb shell svc wifi disable`) → mở app
⇒ phải vào được app bình thường, không có màn ép cập nhật. (b) Bật lại mạng, set `min` phía server = bản
cao hơn ⇒ màn ép cập nhật hiện ra, có "Thử lại" + version + link; bấm Update ⇒ mở được link hoặc hiện link
copy. (c) `adb shell pm disable-user com.android.chrome` (máy có Chrome) rồi bấm Update ⇒ không crash.

**Bằng chứng:** output `./gradlew :app:testModernDebugUnitTest` (kèm tên test mới) + ảnh màn hình 3 bước
trên + `adb logcat -d | grep -i "activitynotfound"` rỗng.

**Rủi ro / lưu ý:** `test/AppVersionServiceTest.kt` (82 dòng) **phải cập nhật** khi thêm case hậu tố —
không được xoá case cũ. Server (`android_minimum_version`) **không phải phạm vi Android dev**.

---

### T-AND-02 — P0 · CRITICAL · Prompt quyền ROM (miễn tối ưu pin + Auto-start)

**Vì sao:** grep toàn `android/` cho `battery|autostart|REQUEST_IGNORE|isIgnoringBatteryOptimizations|BOOT_COMPLETED`
= **0 match**. App phát hành bằng **sideload** (Play Billing đã gỡ — `SubscriptionStore.kt:15-16`) nên không
store nào bật hộ. Đây là **nguyên nhân số 1 VPN tự ngắt khi tắt màn hình** trên MIUI/HyperOS, EMUI,
ColorOS, OriginOS. `START_STICKY` không cứu được nếu chưa cấp quyền Tự khởi động.

**Sửa gì:**
1. `AndroidManifest.xml` (sau dòng 14): thêm
   `<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />`
   (thiếu quyền này ⇒ intent ném `SecurityException`).
2. `ui/SettingsScreen.kt` — thêm section **"Thiết lập cho máy Trung Quốc"** ngay trước
   `SectionTitle(lang.t(LKey.support))` (dòng 251), gồm 3 `ActionRow`:
   - **Miễn tối ưu pin** — chỉ hiện khi `!powerManager.isIgnoringBatteryOptimizations(packageName)`;
     mở `Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; **fallback** sang
     `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` (màn danh sách) vì MIUI/HyperOS hay chặn intent trực tiếp.
   - **Thông tin ứng dụng** — `ACTION_APPLICATION_DETAILS_SETTINGS` (để tự bật quyền nền/dữ liệu nền).
   - **Hướng dẫn Tự khởi động** — dialog theo `Build.MANUFACTURER`: Xiaomi→"Tự khởi động" + "Tiết kiệm pin →
     Không giới hạn"; Huawei→"Ứng dụng → Khởi chạy ứng dụng"; OPPO→"Quản lý khởi động tự động";
     vivo→"Khởi động nền"; khác→hướng dẫn chung.
3. `l10n/L10n.kt` — thêm key mới vào **cả 5 bảng** (EN 92-121, VI 122-153, ZH 154-184, JA 185-215, KO 216-246).
4. `ui/MainScreen.kt` (quanh `onConnect`, dòng 150-157) — hiện prompt này **một lần sau lần Connect thành
   công đầu tiên** (khách TQ thường không tự mở Settings).

**Điều kiện nghiệm thu:**
- [ ] Máy chưa miễn tối ưu pin ⇒ thấy dòng "Miễn tối ưu pin"; bấm ⇒ hiện dialog hệ thống; đồng ý ⇒
      `adb shell dumpsys deviceidle whitelist | grep privatevpn` có package, và dòng đó **biến mất** khi mở lại Settings.
- [ ] Text hiện đúng **tiếng Trung** khi máy để locale `zh-CN` (không lẫn tiếng Anh).
- [ ] Bấm "Thông tin ứng dụng" ⇒ mở đúng màn App info.
- [ ] Không crash khi ROM chặn intent (MIUI) — có fallback.

**Test trên máy thật:** Xiaomi/HyperOS: bật VPN → tắt màn hình 10 phút → VPN còn sống (kiểm bằng
`adb shell dumpsys netpolicy | grep -A2 <uid>` và icon thông báo). Sau khi cấp quyền: lặp lại, phải sống.
Trước khi cấp quyền (đối chứng): nếu tắt được, ghi lại làm bằng chứng "trước/sau".

**Bằng chứng:** ảnh 3 bước + output `dumpsys deviceidle whitelist` trước/sau + `dumpsys netpolicy` sau 10 phút tắt màn hình.

**Rủi ro / lưu ý:** quyền `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` bị **Google Play soi kỹ**; app hiện sideload
nên chấp nhận được, **nhưng nếu sau này phát hành Play thì cần chủ dự án quyết lại** (đây là điểm cần chốt ở mục 5).

---

### T-AND-03 — P0 · MEDIUM · `CnAppBypass` tải danh sách qua host dự phòng

**Vì sao:** `vpn/CnAppBypass.kt:72` gọi thẳng `Config.WEB_URL` (`https://meetflowai.site`) bằng
`HttpURLConnection` — **không** đi qua cơ chế host dự phòng đã dày công xây cho API. Comment của chính file
(`:23-25`) hứa "thêm app TQ mới không cần phát hành app" — lời hứa đó **bị phá ở đúng thị trường cần nó**.
Hành vi khi fail thì đã đúng (giữ bản cũ, `:57-69`) — chỉ cần sửa nguồn tải.

**Sửa gì:** `vpn/CnAppBypass.kt:71-81` — `fetch()` nhận danh sách base từ `ControlPlaneHosts.orderedApiBases`
(hoặc ít nhất thử `t1.meetflowai.site` trước), giữ nguyên timeout 8s/8s, giữ nguyên `MIN_ENTRIES` chống ghi đè
bằng file lỗi. Ghi log rõ đã lấy từ host nào.

**Điều kiện nghiệm thu:**
- [ ] Unit test (không cần mạng): danh sách URL thử có ≥2 host, host chính đứng đầu.
- [ ] Trên máy: `adb logcat -s VPNFLOW_DIAG | grep cn-bypass` cho thấy tải được danh sách khi host chính bị chặn.
- [ ] Mất mạng hoàn toàn ⇒ giữ danh sách cũ, **không ghi đè**, không crash (hành vi hiện tại giữ nguyên).

**Test trên máy thật:** block host chính (DNS/hosts trên máy test hoặc dùng mạng chặn), bật VPN, xem
`assets` cũ vẫn được dùng và log ghi lấy được từ host dự phòng; mở WeChat ⇒ vẫn đi đường riêng
(kiểm: `adb shell dumpsys netpolicy` không đổi / byte tunnel không tăng khi chỉ dùng WeChat).

---

### T-AND-04 — P1 · CRITICAL · Luồng consent VPN + khởi động service (gói 3 lỗi liên hoàn)

**Vì sao:** 3 lỗi nằm cùng một luồng, sửa rời sẽ chỉ che một nửa triệu chứng:
- `MainActivity.kt:69-73` — callback consent **không đọc `result.resultCode`** ⇒ user bấm **Từ chối** vẫn
  chạy tiếp: `claimDeviceThenStart()` (`VPNManager.kt:209-237`) **chiếm 1/3 slot thiết bị** của tài khoản.
- `HysteriaVpnService.kt:761` — `builder.establish() ?: throw IllegalStateException` bị `catch (e: Exception)`
  ở `:681/:733` nuốt ⇒ `runTunnel()` retry **vô hạn** (`:252`), UI đứng "Connecting"/"Reconnecting…" mãi,
  **không có dòng nào nói "bạn chưa cấp quyền VPN"**.
- `VPNManager.kt:291-325` — `app.startService(i)` bọc `runCatching` **không `onFailure`**, rồi vẫn set
  `_state = CONNECTING` ⇒ mọi lỗi khởi động (Android 12+ chặn start-service từ background, ROM TQ chặn nền)
  biến mất, UI treo "Connecting" vĩnh viễn.

**Sửa gì:**
1. `MainActivity.kt:69-73` — đọc kết quả:
```kotlin
) { result ->
    if (result.resultCode == android.app.Activity.RESULT_OK) app.vpnManager.resumeAfterConsent()
    else app.vpnManager.onVpnConsentDenied()   // FAILED + thông báo riêng, KHÔNG claim device
}
```
   ⚠️ **Bắt buộc kèm kiểm tra chéo**: một số ROM trả `RESULT_CANCELED` **dù user đã cho phép** ⇒ trước khi
   kết luận "từ chối", kiểm `VpnService.prepare(app) == null` (đã có quyền). Nếu đã có quyền ⇒ đi tiếp bình
   thường. Không có bước này sẽ **chặn nhầm** khách.
2. `vpn/VPNManager.kt` — thêm `onVpnConsentDenied()`: `_state = FAILED`, `_lastError` + `_statusMessage`
   riêng ("Cần quyền VPN: bấm Connect lại và chọn OK"), **không** gọi `claimDevice`.
3. `vpn/HysteriaVpnService.kt:761` — `establish()` trả `null` ⇒ log + `reportExit("VpnService chưa được cấp
   quyền")` + `stopping = true` + thoát vòng retry (không retry vô hạn).
4. `vpn/VPNManager.kt:291-325` — bắt exception của `startService` ⇒ `FAILED` + message "ROM chặn chạy nền,
   mở lại app rồi thử"; chỉ set `CONNECTING` khi start service thành công.
5. Thêm **timeout 25s** cho trạng thái `CONNECTING`: không nhận được `onHysteriaUp()`/`onHysteriaExited()`
   ⇒ `FAILED` + thông báo (hết "connecting mãi").

**Điều kiện nghiệm thu:**
- [ ] Bấm Connect → **Cancel/Từ chối** dialog VPN ⇒ app hiện lỗi rõ ràng trong ≤2s, **không** ở trạng thái
      "Connecting", và **không** tạo device mới (kiểm trên panel/số thiết bị của tài khoản).
- [ ] Bấm Connect → **OK** ⇒ lên bình thường (không hồi quy).
- [ ] Thu hồi quyền VPN giữa phiên (Settings → VPN → tắt) ⇒ UI chuyển FAILED, **không** đứng "Connecting".
- [ ] Trên ROM chặn start-service từ nền ⇒ có thông báo, không treo (mô phỏng bằng cách gọi connect khi app ở nền nếu làm được).

**Test trên máy thật:** 3 kịch bản trên + `adb logcat -s VPNFLOW_DIAG` (phải thấy dòng permission/consent
tương ứng). Kiểm số thiết bị trước/sau kịch bản "Từ chối" để chứng minh không chiếm slot.

**Rủi ro:** đây là **đổi hành vi có chủ ý** ở nhánh từ chối. Phải giữ nguyên hành vi nhánh đồng ý.

---

### T-AND-05 — P1 · CRITICAL · `SecureStore` chống crash-loop khi Keystore hỏng

**Vì sao:** `SecureStore.kt:14-25` tạo `MasterKey` + `EncryptedSharedPreferences` **không có `runCatching`**,
và nó được khởi tạo trong `VPNFlowApp.onCreate:26`. Master key bị **invalidate vĩnh viễn** khi user đổi/xoá
khoá màn hình, khi **app migrate của Xiaomi (Mi Mover)/Huawei (Phone Clone)/OPPO/Vivo** copy `shared_prefs`
sang máy mới mà không copy được Keystore entry, hoặc sau ROM update. Lúc đó exception ném **ngay trong
`Application.onCreate`** ⇒ không có handler ⇒ **app crash lặp vô hạn, user không có cách tự thoát**
(`allowBackup="false"` nên không restore được). `security-crypto` bản `1.1.0-alpha06` cũng nổi tiếng hay ném lỗi này.

**Sửa gì:** `storage/SecureStore.kt` — bọc việc tạo store; khi lỗi thì log + xoá **chỉ**
`SharedPreferences("vpnflow_secure")` rồi tạo lại (master key mới). **Tuyệt đối không** đụng
`vpnflow_prefs` (ngôn ngữ) hay `vpnflow_hysteria` (transport đã nhớ) hay `vpnflow_cn_bypass`.
Dùng `catch (t: Throwable)` (Keystore có thể ném `ProviderException`/`KeyStoreException` không phải `Exception`).

**Điều kiện nghiệm thu:**
- [ ] Bình thường (Keystore khoẻ): app chạy y như cũ, session cũ **không mất** (kiểm: đăng nhập → giết app → mở lại vẫn đăng nhập).
- [ ] Mô phỏng hỏng: xoá dữ liệu `vpnflow_secure` không đúng cách / đổi khoá màn hình ⇒ app **mở được**,
      chỉ mất phiên đăng nhập (phải login lại), **không crash-loop**.
- [ ] Log ghi rõ đã tạo lại store.

**Test trên máy thật:** (a) đổi khoá màn hình khoá→mở rồi mở app; (b) `adb shell pm clear` rồi cài lại — đối
chứng; (c) tốt nhất: nếu có 2 máy, dùng công cụ clone của hãng (Mi Mover/Phone Clone) để mô phỏng đúng lỗi thật.

---

### T-AND-06 — P1 · HIGH · FGS fail-fast + `onRevoke()` báo UI

**Vì sao:**
- `HysteriaVpnService.kt:349-363` — `startForegroundSafely()` `catch (Exception)` **nuốt mọi lỗi** (kể cả
  `ForegroundServiceStartNotAllowedException`/`SecurityException`/`MissingForegroundServiceTypeException`)
  rồi service vẫn `return START_STICKY` và chạy **không có foreground** ⇒ trên ROM TQ bị
  `netpolicy blocked=APP_BACKGROUND` ⇒ tunnel "UP" mà 0 byte (chính comment `:174-177` đã cảnh báo điều này).
- `onRevoke()` **không được override** (grep = 0). AOSP mặc định `stopSelf()` ⇒ service chết nhưng **không ai
  báo UI** ⇒ `_state` vẫn `CONNECTED`, UI xanh "Connected" trong khi máy **đã mất VPN hoàn toàn** (rò rỉ
  traffic không được cảnh báo). Trên ROM TQ việc bị revoke xảy ra thường xuyên (user bật app VPN nội địa khác,
  MIUI "VPN luôn bật" đổi app).

**Sửa gì:**
1. `startForegroundSafely()` — khi fail: `DiagnosticsLog.warn` + gọi `reportExit(...)` + `stopSelf()` và báo
   UI; **không** chạy tiếp ở trạng thái nửa vời. Kèm kiểm `NotificationManagerCompat.areNotificationsEnabled()`
   để cảnh báo khi kênh thông báo bị ROM/user tắt.
2. Override `onRevoke()`: set `stopping = true`, log, `Mobile.stop()`, `closeTun()`, `reportExit("VPN permission revoked")`,
   `stopSelf()`. Lưu ý javadoc: `onRevoke` **có thể không chạy trên main thread** ⇒ giữ thread-safe như `requestStop()`.

**Điều kiện nghiệm thu:**
- [ ] Bật VPN → trong Settings hệ thống tắt VPN của app (hoặc bật app VPN khác chiếm quyền) ⇒ UI **chuyển
      khỏi "Connected"** và hiện thông báo mất quyền, không còn xanh giả.
- [ ] Tắt kênh thông báo "VPN" của app → bật VPN ⇒ có cảnh báo (hoặc ít nhất log rõ), VPN vẫn hoạt động.

**Test trên máy thật:** kịch bản revoke bằng app VPN thứ hai (cài 1 VPN miễn phí) + tắt kênh thông báo trong
Settings. Bằng chứng: ảnh UI + `adb logcat -s VPNFLOW_DIAG | grep -i revoke`.

---

### T-AND-07 — P1 · HIGH · Sticky restart giữ node list / relay / hostIds

**Vì sao:** `HysteriaVpnService.kt:201-214` đọc `EXTRA_HOST*` từ intent; `:232` trả `START_STICKY`. Khi hệ
thống restart service sau khi bị OEM kill, **intent = null** ⇒ `hosts.size == 1` (chỉ `Config.HY_SERVER`),
`hostRelays`/`hostIds` rỗng. Hệ quả: điều kiện đổi node `hosts.size > 1` (`:283`) **không bao giờ đúng** ⇒ quay
vô hạn vào một IP có thể đã bị GFW chặn; không có relay WS của đúng node (đúng lỗi "handshake im lặng" mà
comment `:41-49` cảnh báo); `reportNodeHealth()` thoát ngay ⇒ coordinator không biết node chết.

**Sửa gì:** lưu `hosts` (đã sắp theo node đang chọn), `hostIds`, `hostRelays`, transport tốt cuối vào
`SharedPreferences("vpnflow_hysteria")` (`PREFS`, `:1906`) tại `startHysteriaService()`; khi `intent == null`
thì đọc lại. Nếu không có gì để đọc ⇒ dừng + đăng notification "Mở app để kết nối lại" thay vì đốt pin vào IP chết.

**Điều kiện nghiệm thu:**
- [ ] Bật VPN → kill app (`adb shell am force-stop com.privatevpn.app.dev`) → service được restart (hoặc
      không) ⇒ nếu có restart: log phải cho thấy **hosts > 1** và có relay của node đang chọn.
- [ ] Không có dữ liệu đã lưu ⇒ không retry mù vào 1 IP; có notification/không treo pin.

**Test trên máy thật:** `adb shell am force-stop` + đợi, hoặc `adb shell dumpsys activity services com.privatevpn.app.dev`
để xem service có được tạo lại; kèm `adb logcat -s VPNFLOW_DIAG | grep -E "hosts|node:"`.

---

### T-AND-08 — P1 · HIGH · API timeout budget + trạng thái lỗi danh sách server

**Vì sao:** `api/ControlAPIClient.kt:109-118` chỉ đặt `connectTimeout 5s` / `readTimeout 10s`, **không
`callTimeout`**, mà `fallbackInterceptor` (`:74-107`) thử **tuần tự 3 host** ⇒ một request có thể mất ~45s.
Trong lúc đó `MainScreen` hiện "Đang tải máy chủ…" **vô hạn** (đọc `remoteNodes` khởi tạo `emptyList()`,
`VPNManager.kt:78`) và banner "…Chạm để tải lại" **không có `.clickable`** ⇒ hướng dẫn mà bấm không có gì.

**Sửa gì:**
1. `api/ControlAPIClient.kt` — thêm `.callTimeout(12, TimeUnit.SECONDS)` (một request ≤12s kể cả qua các host
   dự phòng; host dự phòng đã được nhớ nên không mất khả năng thoát khỏi mạng chặn).
2. `vpn/VPNManager.kt:124-140` — thêm `nodesError` state; phân biệt "đang tải" / "đã fail".
3. `ui/MainScreen.kt:291-317` — nhánh `nodes.isEmpty()` thành 2: đang tải (có spinner) và lỗi + **nút "Thử lại"**;
   gắn `.clickable { onRefresh() }` vào banner `usingSavedServers` (hoặc bỏ chữ "Chạm để tải lại").
4. `SubscriptionStore.refreshEntitlement` (`refreshEntitlement`, `:105-122`) — **giữ nguyên** hành vi "lỗi thì
   giữ quyền đang có, im lặng"; chỉ thêm `callTimeout` được hưởng từ client chung.

**Điều kiện nghiệm thu:**
- [ ] Mất mạng: list node không treo "đang tải" quá ~15s; hiện trạng thái lỗi + "Thử lại" bấm được.
- [ ] Bấm "Thử lại" khi đã có mạng ⇒ danh sách node hiện ra.
- [ ] App **không** hạ quyền Premium khi `GET /v1/auth/session` lỗi (giữ đúng hành vi cũ).

**Test trên máy thật:** chuyển máy sang chế độ máy bay rồi mở app; đo thời gian từ mở app tới khi thấy trạng
thái lỗi (bằng đồng hồ bấm giây/ảnh). Bằng chứng: ảnh 2 trạng thái + số giây.

---

### T-AND-09 — P2 · CRITICAL · Đưa đo băng thông ra khỏi main thread (ANR)

**Vì sao:** `NetworkMonitor` đăng ký callback từ `onStartCommand` (`HysteriaVpnService.kt:187-192`) nên
callback chạy trên **main thread**; `onUnderlyingNetworkChanged()` (`:311-319`) gọi đồng bộ
`refreshMeteredState` → `freshPreMeasure` (`:789-803`) → `NetworkPreMeasure.measure` = HTTP tải 1,5MB,
thử **2 URL**, mỗi URL connect 2s + read 2,5s ⇒ **tệ nhất ~9 giây block UI** mỗi lần Wi-Fi ⇄ 4G
(rất thường gặp ở TQ) ⇒ **ANR** ⇒ MIUI/EMUI hiện "Ứng dụng không phản hồi" ⇒ user bấm "Đóng ứng dụng" ⇒ tunnel chết.

**Sửa gì:** callback chỉ **set cờ** rồi return; phần đo/refresh chạy trên `HandlerThread`/coroutine IO.
**Giữ nguyên ngữ nghĩa**: số đo phải xong **trước** khi mở client Go (`:812-815` giải thích vì sao — nếu đổi
thứ tự là hồi quy tốc độ).

**Điều kiện nghiệm thu:**
- [ ] Trong lúc đổi Wi-Fi ⇄ 4G, UI **không** đứng: bấm được các nút, không có dialog ANR
      (`adb logcat | grep -i "ANR in"` = rỗng).
- [ ] Tốc độ **không hồi quy**: đo lại cùng một node cùng một mạng, so trước/sau (ghi số vào mục 5).
- [ ] Số khai băng thông động vẫn được dùng (log `bw: DO MANG THUC TE truoc khi khai`).

**Test trên máy thật:** script đổi mạng 5 lần (bật/tắt Wi-Fi) trong lúc tunnel đang chạy; theo dõi ANR +
tốc độ. **Đây là task có rủi ro hồi quy cao nhất — phải đo, không được chỉ đọc code.**

---

### T-AND-10 — P2 · HIGH · Generation token cho các vòng lặp nền

**Vì sao:** `stopping` là biến **static** (`HysteriaVpnService.kt:1909`), `onDestroy` (`:1418-1433`) chỉ
null-hoá field chứ **không `interrupt()`** thread. Stop rồi Connect lại nhanh (thói quen "quay IP" rất phổ
biến) ⇒ `onStartCommand` set `stopping = false` (`:181`) ⇒ **thread cũ thức dậy và chạy tiếp** ⇒ 2 `runTunnel()`
cùng gọi `Mobile.connect` ⇒ lần thứ hai báo "already running" ⇒ `throw e` (`:906-912`) ⇒ thoát ra `:223` ⇒
`reportExit()` + `stopSelf()` ⇒ **giết luôn phiên mới**. Các vòng sampler/probe zombie còn gọi `Mobile.stop()`
(`:1511`) giết phiên đang chạy.

**Sửa gì:** thay cờ static bằng **generation token**: mỗi `onStartCommand` tăng `sessionGen`, mọi vòng lặp
dùng `while (!stopping && gen == sessionGen)`; lưu `Thread` vào list và `interrupt()` trong `onDestroy`.
(Không cần thêm dependency, không cần WorkManager.)

**Điều kiện nghiệm thu:**
- [ ] Stop → Connect lại liên tiếp 5 lần, mỗi lần cách 1-2s ⇒ **không** có log "already running", tunnel vẫn lên.
- [ ] Sau 5 lần, số thread `hy-*` không tăng (kiểm `adb shell ps -T -p <pid> | grep -c hy-`).
- [ ] Tốc độ và trạng thái UI vẫn đúng.

**Test trên máy thật:** 5 lần stop/start nhanh + đếm thread + log. Bằng chứng: output `ps -T` + logcat.

---

### T-AND-11 — P2 · HIGH · Edge-to-edge + insets (targetSdk 36)

**Vì sao:** `targetSdk = 36` (`build.gradle.kts:44`) nhưng **không có `enableEdgeToEdge`/`WindowInsets`** nào
(grep = 0). Từ Android 15 (targetSdk ≥ 35) app bị **ép edge-to-edge** và `android:statusBarColor` /
`navigationBarColor` trong `themes.xml:4-5` **bị bỏ qua**; SDK 36 không còn opt-out. Với padding hard-code
(`MainScreen.kt:92-99` `top = 10.dp`, `SettingsScreen.kt:105-111`, `LoginScreen.kt:64-71`) ⇒ nút bánh răng
**chồng lên status bar**, card cuối chồng lên thanh điều hướng — trên đúng nhóm máy ROM TQ đời mới
(HyperOS 2, ColorOS 15, OriginOS 5).

**Sửa gì:** gọi `enableEdgeToEdge()` trong `MainActivity.onCreate:50-56`; thay padding cứng bằng
`Modifier.safeDrawingPadding()` / `windowInsetsPadding(WindowInsets.safeDrawing)` ở 4 màn (Main, Settings,
Login, Paywall) và `ForceUpdateScreen`.

**Điều kiện nghiệm thu:**
- [ ] Trên Android 15/16: mọi nút bấm được, không bị status bar/nav bar/notch che; 4 màn đều kiểm.
- [ ] Không hồi quy trên Android 10-14.
- [ ] Chụp ảnh 4 màn trước/sau.

**Rủi ro:** đụng layout **toàn app** ⇒ làm riêng một commit, không trộn với task khác.

---

### T-AND-12 — P2 · MEDIUM · Phòng vệ `LinkageError` ở biên `mobile.Mobile`

**Vì sao:** `import mobile.Mobile` (`HysteriaVpnService.kt:17`) nạp `libgojni.so`. Nếu không nạp được
(ABI lạ, cài hỏng, ROM chặn `dlopen`), JVM ném `ExceptionInInitializerError`/`NoClassDefFoundError` — là
**`LinkageError`, KHÔNG phải `Exception`**. Các chỗ `catch (e: Exception)` ở biên Go (`:223`, `:906-912`,
`:1432`) **không bắt được** ⇒ process crash thay vì báo lỗi tử tế. (`runCatching` thì bắt được vì nó bắt
`Throwable` — nên nhiều chỗ khác đã an toàn.)

**Sửa gì:** (1) preflight 1 lần ở đầu `onStartCommand`: `runCatching { Class.forName("mobile.Mobile") }`,
fail ⇒ log + `reportExit("engine unavailable")` + `stopSelf`; (2) đổi `catch (e: Exception)` thành
`catch (t: Throwable)` **chỉ ở biên `Mobile.*`**.

**Điều kiện nghiệm thu:**
- [ ] Bình thường: không đổi hành vi (tunnel lên như cũ).
- [ ] Mô phỏng: xoá/đổi tên `libgojni.so` trong APK test ⇒ app báo lỗi rõ ràng, **không crash**.

**Ghi chú:** AAR hiện có đủ 4 ABI (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) nên xác suất thấp — task này
là **phòng vệ**, xếp P2.

---

### T-AND-13 — P2 · MEDIUM · L10n: 8 key thiếu + chuỗi lỗi qua `LKey` + test

**Vì sao:** máy TQ mặc định `zh-CN`; `L10n.systemLanguage()` map `zh` → `CHINESE`, nhưng 8 key
(`account`, `signedIn`, `signedOut`, `email`, `loginCode`, `sendCode`, `verifyCode`, `signOut`) **chỉ có ở
bảng ENGLISH** ⇒ **màn Login và mục Account hiện tiếng Anh xen giữa giao diện tiếng Trung**. Nặng hơn: toàn
bộ **thông báo lỗi/trạng thái hardcode tiếng Anh** hiển thị thẳng lên UI (`VPNManager.kt:606-618` +
`:157,213,229,331,416-418`), và `LoginScreen.kt:123`/`SettingsScreen.kt:99,177` hiện thẳng `e.message`
kỹ thuật ("Could not reach the coordinator while requesting…").

**Sửa gì:** (1) thêm 8 key vào bảng VI/ZH/JA/KO; (2) `userMessage` trả `LKey` rồi dịch ở UI; thêm key
`vpnErrTransport/vpnErrPermission/vpnErrNetworkUnstable/vpnErrConnectionLost/reconnecting` vào cả 5 bảng;
(3) **không** hiển thị `e.message` thô (chỉ log); (4) thêm test chống hồi quy "mọi `LKey` có ở mọi
`AppLanguage`" (cần expose accessor vì `table` đang `private`, `L10n.kt:90`).

**Điều kiện nghiệm thu:**
- [ ] Đặt máy `zh-CN`: màn Login + Settings **không còn chuỗi tiếng Anh** nào (trừ tên thương hiệu).
- [ ] `node --test`-style: test L10n mới PASS; **không xoá/nới** test cũ (`L10nTest.kt`).
- [ ] Mất mạng khi login ⇒ thông báo tiếng Trung, không lộ `e.message`.

---

### T-AND-14 … T-AND-20 — P3 (làm sau, khi P0-P2 đã nghiệm thu)

| ID | Việc | File:line | Ghi chú |
|---|---|---|---|
| **T-AND-14** | `builder.setMetered(meteredNow)` thay vì `setMetered(false)` hard-code — hiện app tự khai mạng VPN là "unmetered" cả trên 4G TQ ⇒ Data Saver của ROM không áp dụng, app nền tiêu data của khách | `HysteriaVpnService.kt:755-757` (`meteredNow` đã có ở `:819-825`) | Sửa 1 dòng, rủi ro thấp |
| **T-AND-15** | Notification FGS: thêm `setCategory(CATEGORY_SERVICE)`, `setOnlyAlertOnce(true)`, icon riêng trong `res/drawable` (hiện dùng `android.R.drawable.ic_lock_lock` bị ROM theme lại) | `HysteriaVpnService.kt:365-394` | Giữ `IMPORTANCE_LOW` |
| **T-AND-16** | `<receiver>` cho `BOOT_COMPLETED` + `MY_PACKAGE_REPLACED` (`exported="false"`, `RECEIVE_BOOT_COMPLETED`), **chỉ** auto-connect nếu user đã bật | `AndroidManifest.xml` + class mới | Cần T-AND-02 trước (không có Autostart thì vô ích) |
| **T-AND-17** | Thêm `<intent-filter><action android:name="android.net.VpnService"/></intent-filter>` cho `HysteriaVpnService`, hoặc khai `SUPPORTS_ALWAYS_ON=false` — để "Always-on VPN" của MIUI/EMUI bind được | `AndroidManifest.xml:51-64` | ⚠️ **Cần verify trên máy thật** (Settings → VPN có hiện app không). Luồng connect thường **không** bị ảnh hưởng (1.4.3 đang chạy thật) |
| **T-AND-18** | Deep link `vpnflow://open` + `https://meetflowai.site/open` được khai báo nhưng `onNewIntent` **không override** và `intent.data` không được đọc ⇒ link bị nuốt im lặng | `AndroidManifest.xml:25-46`, `MainActivity.kt` | **Chủ dự án quyết**: xử lý thật (allowlist scheme/host/path) hay xoá intent-filter |
| **T-AND-19** | Xoá `RelayProtectService` (dead code, `protectAsync` không được gọi) hoặc `android:enabled="false"` — app đang có ≥3 component VpnService ⇒ ROM/always-on dễ chọn nhầm | `vpn/RelayProtectService.kt`, `AndroidManifest.xml:61-64` | LOW |
| **T-AND-20** | `DiagnosticsLog`: `SimpleDateFormat` gọi **ngoài** `synchronized` (không thread-safe) + ghi file mỗi dòng | `diag/DiagnosticsLog.kt:30,80-93` | **Gộp với `docs/ANDROID_CPU_TODO.md` mục C**, không làm 2 lần |

---

## 4. Bộ lệnh test chung trên máy thật (dùng lại cho mọi task)

```bash
# 0. Cài bản debug (applicationId .dev — cài SONG SONG với bản phát hành, không mất đăng nhập khách)
adb devices
adb install -r android/app/build/outputs/apk/modern/debug/*.apk
adb shell am start -n com.privatevpn.app.dev/com.privatevpn.app.MainActivity

# 1. Log chẩn đoán của app (tag riêng, không lẫn log hệ thống)
adb logcat -c && adb logcat -s VPNFLOW_DIAG VPNFLOW_DEBUG

# 2. Trạng thái nền/pin/mạng của app
adb shell dumpsys netpolicy | grep -A2 $(adb shell dumpsys package com.privatevpn.app.dev | grep userId= | head -1 | tr -dc '0-9')
adb shell am get-standby-bucket com.privatevpn.app.dev
adb shell cmd netpolicy list restrict-background-uids
adb shell dumpsys deviceidle whitelist | grep privatevpn

# 3. Doze (nguyên nhân VPN "tự ngắt" khi tắt màn hình)
adb shell dumpsys deviceidle force-idle        # bắt máy vào Doze
adb shell dumpsys deviceidle unforce

# 4. Always-on VPN / VPN đang giữ quyền
adb shell settings get secure always_on_vpn_app
adb shell dumpsys package com.privatevpn.app.dev | grep -i -A3 vpn

# 5. Bằng chứng mạnh (gửi kèm khi cần)
adb bugreport
```

**File chẩn đoán trong máy:** `Android/data/com.privatevpn.app.dev/files/diagnostics.log`
(ghi bởi `DiagnosticsLog.kt:65-66`) — copy ra để đính kèm bằng chứng.

**Ma trận máy tối thiểu:** (1) ROM TQ (Xiaomi/HyperOS **hoặc** Samsung CN), (2) AOSP gần sạch (không GMS).
Flavor `legacy` (minSdk 24, Fire OS/Android 7) test riêng nếu có máy.

---

## 5. Nhật ký nghiệm thu (chủ dự án điền)

> Quy ước: mỗi dòng = 1 lần nghiệm thu trên máy thật. **FIXED ≠ RESOLVED** (`.privatevpn/rules/BUG_RULES.md`
> RULE-BUG-003) — chỉ đánh RESOLVED khi đã chạy lại checklist và không tái hiện.

| Ngày | Task | Máy / Android | Kết quả | Bằng chứng | Trạng thái |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

**Câu hỏi cần chủ dự án chốt trước khi làm P2:**

1. `T-AND-02`: chấp nhận thêm `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (Play soi kỹ) hay chỉ dùng
   `ACTION_APPLICATION_DETAILS_SETTINGS` + hướng dẫn tay?
2. `T-AND-01`: "Dùng tiếp bản hiện tại" sau bao nhiêu ngày không check được version? (đề xuất 7)
3. `T-AND-18` (deep link): giữ và làm thật, hay xoá intent-filter?

---

## 6. Không thuộc phạm vi Android dev

| Việc | Vì sao không làm ở đây |
|---|---|
| Đặt `android_minimum_version` trên control-plane | Server-side + vùng bảo vệ `control-plane/**` (PROTOCOL §8). Đề xuất: chỉ set = bản **đã publish trên CẢ 2 kênh** (modern + legacy) và log lại mỗi lần set |
| Xác nhận heartbeat/register ở Hysteria mode | `heartbeatLoop()` (`VPNManager.kt:565-574`) **chỉ chạy trong `provision()`** = nhánh WireGuard; với `HYSTERIA_MODE = true` (mặc định) **không bao giờ chạy**. Cần control-plane xác nhận đây là chủ ý (claim device thay thế peer register) hay thiếu sót |
| `docs/ANDROID_CPU_TODO.md` (MTU/probe/log/battery) | Task riêng, đang chờ duyệt. **Lưu ý tài liệu đó đã cũ ở mục MTU**: code hiện tại `HY_MTU = 1300` (`HysteriaVpnService.kt:1967`), không phải 1500 |
| Đăng ký bug files trong `.privatevpn/bugs/OPEN/` | **Chưa làm** — cần chủ dự án quyết (mỗi bug 1 file theo spec §75, RULE-BUG-001). Danh sách ứng viên: T-AND-01, 02, 04, 05, 09 |

---

## 7. Ghi chú về độ tin cậy của audit

- Audit là **phân tích tĩnh, KHÔNG build, KHÔNG chạy** (máy Windows thiếu JDK — xem blocker B1). Mọi kết luận
  về hành vi runtime (ANR, mức kill của MIUI/EMUI/ColorOS) dựa trên code + tài liệu AOSP, **chưa đo trên máy TQ**.
- Các điểm **cần verify on-device** đã được đánh dấu riêng: `T-AND-17` (intent-filter), `T-AND-09` (ANR),
  `T-AND-04` (một số ROM trả `RESULT_CANCELED` dù đã cho phép).
- Nguồn sự thật là **code trong repo** (`AGENTS.md` §2). Tài liệu `docs/ANDROID_CPU_TODO.md` và
  `docs/ANDROID_METERED_BACKGROUND_DATA.md` đã có chỗ lệch so với code hiện tại — khi làm task, **theo code**.
