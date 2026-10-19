# Android **v38 / 1.4.6** — sửa GỐC sự cố "ép cập nhật làm chết TV" + kênh `android-tv` cho client (19/10/2026)

- **Vì sao có bản này:** chủ dự án chốt *"Làm v38 rồi mới ép [cập nhật]"* ngay sau khi phát hiện sự cố
  ở `docs/handoff/PUBLISH_ANDROID_1.4.5_37_2026-10-19.md` §4a.
- **Build commit:** `2f93b20` (code) — artifact build từ commit này, `versionCode 38`.
- **Kênh phát:** `android` · `android-legacy` · `android-tv` (kênh TV lần đầu có client biết mình là TV).

## 1. Sự cố gốc (vì sao không thể chỉ "nâng minimum")

```kotlin
// TRƯỚC (build ≤ 37) — android/app/src/main/java/com/privatevpn/app/api/AppVersionService.kt
val av = a.split(".").mapNotNull { it.toIntOrNull() }   // "1.4.5-tv" -> [1, 4]
val bv = b.split(".").mapNotNull { it.toIntOrNull() }   // "1.4.5"    -> [1, 4, 5]
// độ dài khác nhau ⇒ phần thiếu = 0 ⇒ 1.4.5-tv < 1.4.0 … 1.4.9  LUÔN ĐÚNG
```

Gói TV khai `versionNameSuffix = "-tv"` ⇒ versionName thật là `1.4.6-tv`. Khúc `"5-tv"` **không phải số**
nên bị `mapNotNull` **bỏ hẳn**, làm version TV luôn bị coi là nhỏ hơn bản điện thoại cùng số. Hệ quả khi
server nâng `android_minimum_version` lên `1.4.x`:

1. mọi app TV (`1.4.3-tv`, `1.4.5-tv`, …) vào **màn ÉP CẬP NHẬT** và **không bao giờ thoát ra được**
   (cài xong vẫn bị ép);
2. nút cập nhật tải `apk_url` = **APK điện thoại** (`com.privatevpn.app`) — khác `applicationId` với gói
   TV ⇒ Android **cài THÊM một app thứ hai** chứ không nâng cấp, và app TV cũ vẫn bị ép tiếp.

## 2. Đã sửa gì

| File | Thay đổi |
|---|---|
| `android/…/api/AppVersionService.kt` | `isVersion` mỗi khúc lấy **phần chữ số đầu** (`components()`): `"5-tv"` → `5` ⇒ `1.4.6-tv == 1.4.6`; bản cũ hơn vẫn bị coi là cũ (không "tha" hết) |
| `android/…/api/ControlAPIClient.kt` | `fetchAppVersion()` gửi `?platform=$appVersionPlatform`, với `appVersionPlatform = if (BuildConfig.TV_FLAVOR) "android-tv" else "android"` |
| `android/app/build.gradle.kts` | `versionCode 38`, `versionName "1.4.6"` (flavor tv ⇒ `1.4.6-tv`) |
| `control-plane/src/app-version.js` | thêm `android-tv` (+ alias `androidtv`) vào `KNOWN_PLATFORMS`; `androidTvVersionPayload()` đọc `android_tv_latest_version` / `android_tv_minimum_version` / `android_tv_apk_url`, thiếu thì **rơi về mốc Android chung** (không bao giờ `0.0.0`); nhánh TV xét **TRƯỚC** các nhánh UA (UA app TV cũng là OkHttp) |
| `control-plane/src/index.js` | `PATCH /v1/admin/android-version` nhận thêm `tv_latest_version`, `tv_minimum_version`, `apk_url_tv`; thêm `GET /v1/admin/android-tv-version` |
| `android/…/ApiFallbackTest.kt` | đường dẫn kỳ vọng tính theo `BuildConfig.TV_FLAVOR` (chạy đúng cho cả 3 flavor) |
| `android/…/AppVersionServiceTest.kt` | +1 test khoá hai chiều hậu tố `-tv` (và cả `-beta`) |
| `control-plane/test/app-version.test.js` | +5 test: payload TV riêng (không phải route APK điện thoại), alias, mốc riêng thắng mốc chung, đường lùi UA khi không có `?platform`, mặc định an toàn |

## 3. Artifact (đo từ file thật)

| Kênh | versionCode / versionName | size (B) | sha256 | package |
|---|---|---|---|---|
| Android modern | 38 / `1.4.6` | 79.106.252 | `0eabd7875df06d17adcf998771d8f8cc9b3088f2c9cc3cc4a130e57b8da5f4d4` | `com.privatevpn.app` |
| Android legacy (minSdk 24) | 38 / `1.4.6` | 79.122.631 | `aa392fd30e1e8e557a47ef0ded42195c07b226fec62545cc58373c97daf8a208` | `com.privatevpn.app` |
| Android TV | 38 / `1.4.6-tv` | 79.106.408 | `191f8f9529ed41c7dbc4e613b4c294db3a2b12f4ba8d82321938e21a822f8830` | `com.privatevpn.app.tv` (+ LEANBACK launcher) |

Cả 3 ký bằng keystore phát hành `SHA-256 dc6e484bf8ef2eea0dcd15a9192d8233fea1a05068b8ee4486cdc53f456b5e46`.

## 4. Bằng chứng kiểm thử

```
# Android unit test — 3 flavor
gradlew :app:testModernDebugUnitTest :app:testLegacyDebugUnitTest :app:testTvDebugUnitTest
BUILD SUCCESSFUL
test-results: modern 65/65 · legacy 65/65 · tv 65/65  (failures=0 errors=0 skipped=0)

# control-plane, cổng theo file đã sửa
node --test test/app-version.test.js        → tests 30 · pass 30 · fail 0
# control-plane, full suite chạy TRÊN SERVER (Linux, chính là môi trường deploy)
node --test test/*.test.js                  → tests 453 · pass 453 · fail 0
# (trên Windows 12 test fail vì EBUSY unlink sqlite — các suite đó chỉ import node-store.js,
#  không liên quan bản sửa này; trên Linux pass 100%)
```

Deploy control-plane (cổng chặn của repo, chạy trên node-2):

```
file thay đổi (2): app-version.js index.js
OK: đồ thị module 40 file (từ index.js) resolve đủ
chạy test suite trong workspace → tests 453 · pass 453 · fail 0
backup: /root/flowvpn-cp/src-backup-20261019-112701
health OK (http://127.0.0.1:7778/health) — deploy xong
```

Kiểm endpoint sau deploy (thật, host khách):

```
GET /v1/app-version?platform=android-tv
{"platform":"android-tv","minimum_version":"1.2.6","latest_version":"1.4.5",
 "apk_url":"https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk?v=265d46b4", …}
GET /v1/app-version?platform=android          → như cũ (platform=android, latest 1.4.5)
GET /v1/app-version?platform=bogus-xyz        → HTTP 400 (không đoán kênh)
```

## 5. Việc phát hành — ĐÃ XONG cả 3 kênh (19/10/2026)

| Kênh | Artifact đích | size | sha256 | Route |
|---|---|---|---|---|
| android | `/root/flowvpn-apk/VPNFlow-latest.apk` | 79.106.252 | `0eabd787…f4d4` | `GET /v1/downloads/android` |
| android-legacy | `/root/flowvpn-apk/VPNFlow-android7.apk` | 79.122.631 | `aa392fd3…a208` | `GET /v1/downloads/android-legacy` |
| android-tv | `/var/www/flowvpn/dl/VPNFlow-tv-latest.apk` (+`VPNFlow-tv-1.4.6.apk`, `/var/www/dl/…`) | 79.106.408 | `191f8f95…8830` | `GET /dl/VPNFlow-tv-latest.apk?v=191f8f95` |

- Backup bản trước: `*.backup-20261019-184839` (modern 1.4.5 / legacy 1.4.5 / TV 1.4.5).
- Cổng **pre 3/3 ĐẠT**; **post 3/3 ĐẠT** (`android-tv` chạy với `FLOWVPN_BASE_URL=https://t1.meetflowai.site`).
- Mốc: `latest_version = 1.4.6` · `android_tv_latest_version = 1.4.6-tv` ·
  `apk_url_tv = …/VPNFlow-tv-latest.apk?v=191f8f95` · **`minimum_version` vẫn 1.2.6** (xem §6).
- Sổ: 3 dòng publish (commit `2f93b20`) + 3 tag `android-v1.4.6`, `android-legacy-v1.4.6`, `android-tv-v1.4.6`.
- HTTP thật (host khách `t1`): android `200 / 79106252` · legacy `200 / 79122631` · TV `200 / 79106408`.
- Email: **hoãn email 1.4.5, gửi MỘT email 1.4.6** (bus #976 → #982 cho Mac) — 1.4.5 chỉ sống ~5 giờ
  trong cùng ngày nên gửi hai thư là nhiễu.

## 6. Sau khi phát — mốc và hệ quả

- `latest_version = 1.4.6` (điện thoại/legacy) và `android_tv_latest_version = 1.4.6-tv`.
- `apk_url_tv` phải mang `?v=<sha8>` của bản TV mới (cache Cloudflare `/dl/*` 4 giờ).
- **Ép cập nhật (minimum)** chỉ đặt được SAU khi v38 đã nằm trên kênh:
  - `minimum_version = 1.4.6` ⇒ mọi máy Android < 1.4.6 bị ép; **TV cũ (≤ 1.4.5-tv) vẫn bị ép sai**
    vì bản đó hardcode `platform=android` ⇒ tải APK điện thoại. Muốn an toàn tuyệt đối cho TV thì để
    `minimum_version` thấp hơn (1.2.6) và chỉ ép bằng `android_tv_minimum_version` sau khi TV đã lên v38.
  - `android_tv_minimum_version = 1.4.6-tv` ⇒ chỉ ép TV **đã có v38 trở lên** (v38 trở đi mới đọc mốc này).

## 7. Nghiệm thu trên TV THẬT (19/10/2026)

TV đang bật trong nhà: **`MiTV-AFZP0` · Android 14 · Xiaomi · armeabi-v7a** (`192.168.100.105:5555`,
MAC `e8:b8:53:c3:ac:fa`), đang cài gói **release** `com.privatevpn.app.tv`.

```
dumpsys package com.privatevpn.app.tv → versionCode=38  versionName=1.4.6-tv
adb install -r app-tv-release.apk     → Success (cài đè, giữ đăng nhập)
launch → mCurrentFocus = com.privatevpn.app.tv/com.privatevpn.app.MainActivity
app state (uiautomator dump): "Hanoi, Vietnam · Flow2/Flow3" · "Premium Active" · "Expires Oct 19, 2027"
diagnostics.log (kéo từ /sdcard/Android/data/com.privatevpn.app.tv/files/):
    10-19 22:41:25.993 I === diagnostics session start (app 1.4.6-tv) ===
```

**Chứng minh đã hỏi ĐÚNG kênh** (không cần MITM vì server không bật access log): so chuỗi trong
`classes.dex` của hai APK build cùng lượt —

| Chuỗi trong dex | APK TV | APK điện thoại |
|---|---|---|
| `/v1/app-version?platform=` | **có** | **có** |
| `android-tv` | **có** | **không** |
| `platform=android` (nguyên cụm) | **không** | **không** |

⇒ hằng số kênh đã được biên dịch đúng theo flavor (TV = `android-tv`); cộng với
`ApiFallbackTest` (assert đường dẫn theo `BuildConfig.TV_FLAVOR`, 65/65 × 3 flavor) và
`GET /v1/app-version?platform=android-tv` trả payload TV thật.

## 8. Mốc ép cập nhật — CHỐT CỦA CHỦ DỰ ÁN

Chủ dự án chốt: **"Ép SAU khi em cập nhật tay TV trong LAN"** ⇒ hiện `minimum_version` **giữ 1.2.6**
(chưa ép ai). Trình tự đúng khi muốn ép:

1. Cập nhật tay mọi TV còn lại trong LAN lên `1.4.6-tv` (adb `install -r`).
2. Sau đó mới `PATCH {"minimum_version":"1.4.6","tv_minimum_version":"1.4.6-tv"}`.
3. Vì bản TV ≤ 1.4.5 hardcode `platform=android`, nếu còn TV ngoài LAN chưa lên v38 thì **đừng** nâng
   `minimum_version` lên `1.4.x` — chúng sẽ kẹt màn ép cập nhật.

Tình trạng TV trong LAN lúc phát: `.105` (MiTV-AFZP0) = **đã 1.4.6-tv, đã nghiệm thu** · `.115`/`.112`/`.110`
(LAN `10.193.44.x`) **không tới được** vì máy Windows đã chuyển sang Wi-Fi `KT-617` (`192.168.100.11`) —
cần về lại LAN `10.193.44.x` mới adb được.

## 9. Rollback

```bash
cd /root/flowvpn-apk
cp -p VPNFlow-latest.apk.backup-<moc>   VPNFlow-latest.apk
cp -p VPNFlow-android7.apk.backup-<moc> VPNFlow-android7.apk
cp -p /var/www/flowvpn/dl/VPNFlow-tv-latest.apk.backup-<moc> /var/www/flowvpn/dl/VPNFlow-tv-latest.apk
# control-plane: khôi phục 2 file đã backup rồi restart
cp -a /root/flowvpn-cp/src-backup-20261019-112701/app-version.js /root/flowvpn-cp/src/
cp -a /root/flowvpn-cp/src-backup-20261019-112701/index.js       /root/flowvpn-cp/src/
systemctl restart flowvpn-cp && sleep 3 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7778/health
```
