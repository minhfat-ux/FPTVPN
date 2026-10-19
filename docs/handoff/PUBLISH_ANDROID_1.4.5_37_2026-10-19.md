# ĐÃ PHÁT — Android **1.4.5 (build 37)** modern + legacy + **kênh Android TV mới** (19/10/2026)

- **Người phát:** harness Windows (publisher Android theo `docs/PUBLISHER_PROCESS.md` §0 luật 12)
- **Build commit:** `26e261a83f31c72164f9c5ed583492581421aee8` (`android/` không có commit nào sau đó)
- **Bàn giao nguồn:** `docs/handoff/HANDOFF_PUBLISHER_ANDROID_1.4.5_37_2026-10-19.md`
- **Nội dung:** N tunnel (hút băng thông) — port từ iOS `167ba9d`, công tắc trong Settings, **mặc định TẮT**
- **Yêu cầu của chủ dự án:** *"take over để publish bản android mới đi em, các version của TV box, tv
  cũng cần publish mới"* ⇒ trả lời luôn câu hỏi §9.1 của bàn giao: **CÓ phát bản TV** (kênh riêng).

## 1. Kết quả (đo từ file thật, không chép từ docs)

| Kênh | Version (trong APK) | Size (B) | sha256 | Route khách tải | Trạng thái |
|---|---|---|---|---|---|
| Android modern | `1.4.5` / vc 37, pkg `com.privatevpn.app`, minSdk 26 | 79.106.244 | `c195eb6a99d058f89db0973a20ecc1469899c3d81adb8858185c61eb81c1d663` | `GET /v1/downloads/android` | ✅ đã phát |
| Android legacy | `1.4.5` / vc 37, minSdk 24 | 79.122.645 | `098902dedae154511504f70167b02bec9d123b5e4b4b10d805da42af2dce9b55` | `GET /v1/downloads/android-legacy` | ✅ đã phát |
| **Android TV (mới)** | `1.4.5-tv` / vc 37, pkg `com.privatevpn.app.tv`, LEANBACK | 79.106.409 | `265d46b49ad3e9381a2dca95c3a39abda5fc930acec99b26070d472bb980b2c2` | `GET /dl/VPNFlow-tv-latest.apk` | ✅ đã phát |

- Cả 3 ký bằng keystore phát hành `CN=Minh Nguyen Binh, OU=VPNFlow, O=VPNFlow, L=Hanoi, ST=Hanoi, C=VN`
  (`SHA-256 dc6e484bf8ef2eea0dcd15a9192d8233fea1a05068b8ee4486cdc53f456b5e46`), `apksigner verify` OK.
- Mốc server: `latest_version = 1.4.5` cho cả `android` và `android-legacy`; **`minimum_version` giữ 1.2.6**
  (xem §4a — đã có người nâng lên 1.4.5 rồi em hạ lại).
- Tag (neo đúng commit build): `android-v1.4.5`, `android-legacy-v1.4.5`, `android-tv-v1.4.5`.
- Bản TV **đang phát trước đó là v36** (113.423.049 B, sha `cc03504e…`); đã sao lưu
  `VPNFlow-tv-latest.apk.backup-20261019-124215` và `VPNFlow-latest.apk/.android7.apk.backup-20261019-124215`.
- Artifact đặt ở đích: `/root/flowvpn-apk/VPNFlow-latest.apk`, `/root/flowvpn-apk/VPNFlow-android7.apk`,
  `/var/www/flowvpn/dl/VPNFlow-tv-latest.apk` + `VPNFlow-tv-1.4.5.apk` + `/var/www/dl/…` (docroot IP).

## 2. Bằng chứng cổng chặn (`scripts/check-publish-version.py`)

Trước khi upload (mode pre) — **3/3 ĐẠT**:

```
-- Cổng chặn version · platform=android · mode=pre · định phát 1.4.5 (build 37)
  [ĐẠT] Version trong artifact khớp  1.4.5 == 1.4.5
  [ĐẠT] Build khớp                   build 37
  [ĐẠT] Đúng gói điện thoại          com.privatevpn.app
  [ĐẠT] Không phải bản dev           com.privatevpn.app 1.4.5
  [ĐẠT] Mốc phiên bản                đang 1.4.4 → phát 1.4.5 (tiến)
✅ ĐẠT — được phép upload.                                   (exit 0)

-- platform=android-legacy · mode=pre · 1.4.5 (build 37)     … ✅ ĐẠT (exit 0)

-- platform=android-tv · mode=pre · định phát 1.4.5-tv (build 37)
  [ĐẠT] Đúng gói TV                  com.privatevpn.app.tv
  [ĐẠT] Hậu tố -tv                   1.4.5-tv
  [ĐẠT] LEANBACK launcher            có leanback-launchable-activity (mở được trên TV)
  [ĐẠT] Không phải bản dev           com.privatevpn.app.tv 1.4.5-tv
✅ ĐẠT — được phép upload.                                   (exit 0)
```

Sau khi upload (mode post) — **3/3 ĐẠT**, `android-tv` chạy trên host khách `t1.meetflowai.site`:

```
-- platform=android · mode=post
  [ĐẠT] Mốc phiên bản  đã bằng bản vừa phát (1.4.5)
  [CẢNH BÁO] Route tải  file đang phát đã đúng 79106244 byte như local   ← đúng: LIVE == artifact vừa đặt
✅ ĐẠT (exit 0)

-- platform=android-tv · mode=post  (FLOWVPN_BASE_URL=https://t1.meetflowai.site)
  [ĐẠT] Đúng gói TV / Hậu tố -tv / LEANBACK / Không phải bản dev
  [ĐẠT] Mốc phiên bản  đã bằng bản vừa phát (1.4.5)
  [CẢNH BÁO] Route tải  file đang phát đã đúng 79106409 byte như local
✅ ĐẠT (exit 0)
```

**Test âm** (chứng minh cổng mới chặn được đúng lỗi mà bàn giao cảnh báo) — cả 3 đều `exit 1`:

```
A) đem gói TV phát vào kênh điện thoại:
   [KHÔNG ĐẠT] SAI gói cho kênh điện thoại  package com.privatevpn.app.tv là gói TV — KHÔNG phát vào kênh android
B) đem gói điện thoại phát vào kênh TV:
   [KHÔNG ĐẠT] SAI gói cho kênh TV / Thiếu hậu tố -tv / Thiếu LEANBACK launcher
C) đem bản debug (-dev):
   [KHÔNG ĐẠT] Là bản DEV  com.privatevpn.app.dev 1.4.5-dev — bản .dev chỉ để test
```

Liveness của kênh (HTTP thật, host khách `t1.meetflowai.site`):

```
/v1/downloads/android         → 200 · Content-Length 79106244 · cf-cache-status DYNAMIC
/v1/downloads/android-legacy  → 200 · Content-Length 79122645 · cf-cache-status DYNAMIC
/dl/VPNFlow-tv-latest.apk     → 200 · Content-Length 79106409 · last-modified 06:30:23 GMT
/v1/app-version?platform=android         → {"minimum_version":"1.2.6","latest_version":"1.4.5", …}
/v1/app-version?platform=android-legacy  → {"minimum_version":"1.2.6","latest_version":"1.4.5", …}
```

Kiểm thêm: chuỗi `n-tunnel:` **có** trong `classes.dex` của cả bản modern và TV ⇒ artifact release đúng
là cây mã nguồn v37 (R8 rút gọn tên class nên phải kiểm bằng string literal).

**Tải THẬT từ link khách (byte-cuối, không chỉ HEAD):**

```
curl -L "https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk?v=265d46b4"
  size   = 79106409
  sha256 = 265d46b49ad3e9381a2dca95c3a39abda5fc930acec99b26070d472bb980b2c2   ← khớp tuyệt đối
```

## 3. Kênh TV đã được làm thành kênh hạng nhất (thay đổi hạ tầng)

| Chỗ | Thay đổi |
|---|---|
| `scripts/check-publish-version.py` | thêm platform `android-tv` (route `/dl/VPNFlow-tv-latest.apk`, suffix `.apk`, reader APK, mốc dùng chung `android_latest_version` + **bỏ hậu tố `-tv` khi so mốc**); guard mới **chặn phát lẫn gói TV ↔ điện thoại và chặn bản `-dev`**; `version_android` trả thêm `package` + `leanback` |
| `scripts/release-record.mjs` | thêm `android-tv` vào `PLATFORMS` + `CHANNELS` (`/dl/VPNFlow-tv-latest.apk`) |
| `docs/PUBLISHER_PROCESS.md` | §3 thêm dòng kênh TV; §4 ghi rõ TV dùng chung mốc Android và hệ quả hậu tố `-tv` |
| `control-plane` **app-config** (dữ liệu, không phải code) | `android_tv_apk_url = https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk?v=265d46b4` ⇒ chip "Android TV (APK)" trên trang chủ trỏ đúng bản mới, đồng thời **phá cache Cloudflare** (mẫu giống `windows_installer_url`) |

> **Chưa làm (đề xuất):** thêm field `apk_url_tv` vào `PATCH /v1/admin/android-version` để lần sau đổi
> link TV bằng API thay vì ghi thẳng `app_config.db` (lần này ghi thẳng vì route chưa có field đó).

## 4. ⚠️ Ba sự cố phát hiện trong lúc phát (đọc trước khi phát lần sau)

### 4a. `minimum_version` bị nâng lên 1.4.5 **trước** khi có bản phát — đã hạ về 1.2.6

`app_config` ghi: `android_minimum_version = 1.4.5` lúc **13:29:42 (+07)**, `android_latest_version = 1.4.5`
lúc 13:30:42 — tức một phiên làm việc **song song** đã nâng mốc *trước/song song* lúc em đặt artifact
(13:30:22). Bàn giao §3 ghi rõ: **"KHÔNG nâng `min_app_version` lên 1.4.5 trừ khi chủ dự án đồng ý"**
(nâng = ép mọi khách cũ phải cập nhật). Em đã **hạ `minimum_version` về `1.2.6`** (giá trị đang dùng trước
đó, đổi lúc 06:31:51Z) và giữ `latest_version = 1.4.5`.

Vì sao việc nâng này **nguy hiểm riêng với TV** (không chỉ là "ép cập nhật"):

```kotlin
// android/app/src/main/java/com/privatevpn/app/api/AppVersionService.kt
fun isVersion(a: String, b: String): Boolean {
    val av = a.split(".").mapNotNull { it.toIntOrNull() }   // "1.4.5-tv" -> [1, 4]   ("5-tv" không phải số)
    val bv = b.split(".").mapNotNull { it.toIntOrNull() }   // "1.4.5"    -> [1, 4, 5]
    … // độ dài khác nhau ⇒ phần thiếu coi là 0  ⇒  "1.4.5-tv" < "1.4.5"  LUÔN ĐÚNG
}
```

⇒ Với `minimum_version ≥ 1.4.x`, **mọi app TV** (versionName luôn có hậu tố `-tv`) rơi vào màn **ÉP CẬP
NHẬT vĩnh viễn**: bấm cập nhật thì tải `apk_url` = **APK điện thoại** (`com.privatevpn.app`, khác
applicationId ⇒ cài **thêm** một app thứ hai), cài xong mở lại vẫn bị ép tiếp. `1.2.6` thì không kích hoạt
(vì `1.4` > `1.2`), đúng như trạng thái đã chạy ổn định bấy lâu.

### 4b. App TV đang hỏi **sai kênh** — cần bản v38 mới sửa được

`ControlAPIClient.kt` hardcode `"$baseUrl/v1/app-version?platform=android"` cho **cả 3 flavor**. Hệ quả với
bản TV: nó đọc `latest_version` + `apk_url` của **kênh điện thoại**. Hiện chỉ ảnh hưởng phần hiển thị
("có bản mới") vì `minimum_version` đã hạ; nhưng đường "bấm để cập nhật" vẫn trỏ APK điện thoại.

**Đề xuất cho v38 (bản build sau, KHÔNG sửa artifact 37 đã test):**
1. `AppVersionService.isVersion` bỏ hậu tố không phải số ở **khúc cuối** (`"5-tv"` → `5`).
2. Flavor TV gọi `?platform=android-tv` (server đã/chưa hỗ trợ đều an toàn: nếu server lạ ⇒ 400 rõ ràng,
   còn hiện tại server trả payload iOS cho platform lạ — nên nếu làm, phải thêm nhánh `android-tv` phía
   server trước).
3. Chừng nào chưa có v38: **tuyệt đối không** nâng `android_minimum_version` lên ≥ 1.4.

### 4c. Hai phiên làm việc cùng phát một kênh ⇒ sổ có dòng trùng

Trong lúc phát, một **phiên DSH khác trên cùng máy** (`session-451bec83…`, đang làm Windows 1.4.8) đã:
commit luôn phần sửa của em (`92e1ffb`, `42afbc6`), tạo tag `android-v1.4.5` + `android-legacy-v1.4.5`
(13:35), ghi 2 dòng publish cho mỗi kênh và nâng `minimum_version`. Kết quả trong
`release/releases.jsonl`: `android` và `android-legacy` mỗi kênh **3 dòng `1.4.5`** (2 của phiên kia +
1 của em), `android-tv` 2 dòng. **Sổ là append-only nên em KHÔNG xoá dòng nào** — dòng có
`verified_by`/`evidence`/`notes` là dòng chuẩn để đọc. Ảnh hưởng thực tế: **không** (cùng sha256, cùng
commit); ảnh hưởng audit: cần biết mà không hoảng.

`node scripts/release-record.mjs verify` toàn sổ: **71 ĐẠT · 89 CẢNH BÁO · 10 KHÔNG ĐẠT** — 10 mục
KHÔNG ĐẠT **đều là lịch sử iOS/macOS/Windows có từ trước** (ngoại lệ do chủ dự án chốt, xem
`release/releases.jsonl`), **không có mục nào của Android/TV**.

### 4d. Cache Cloudflare của `/dl/*` (4 giờ)

`Cache-Control: max-age=14400` ⇒ link `-latest` có thể phục vụ bản cũ tới 4h. Lần này
`https://meetflowai.site/dl/VPNFlow-tv-latest.apk` còn HIT bản v36 (Age 3169 s) trong khi
`t1.meetflowai.site` cùng đường dẫn đã trả bản mới; sau khi thêm `?v=265d46b4` cho link trên trang chủ thì
cả hai host đều trả **79.106.409 B**. **Quy ước:** mỗi lần phát TV phải kèm `?v=<sha8>` (giống Windows).

## 5. Việc còn lại

> **CHỐT CỦA CHỦ DỰ ÁN (19/10/2026, trả lời trực tiếp khi phát hiện sự cố §4a):**
> *(1)* mốc ép cập nhật: **"Làm v38 rồi mới ép"** ⇒ `minimum_version` **giữ 1.2.6**, chỉ nâng **sau khi**
> v38 đã phát (v38 phải sửa được §4b trước).
> *(2)* email khách: **"Có — kèm link TV + hướng dẫn cài trên TV"** ⇒ email 1.4.5 phải nêu kênh Android TV.

1. **Email khách** — theo §0 luật 12, **Mac publisher gửi** (Windows harness không tự gửi). Nội dung:
   `docs/RELEASE_NOTES_android_1.4.5.md` + **link TV** `https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk?v=265d46b4`
   + 3 bước cài trên TV (bật ADB hoặc dùng trình duyệt trên TV → mở link → cài; gói TV cài **song song** với
   bản điện thoại nên không ghi đè). Đã nhắn Mac qua agent-bus.
2. **v38 (đã được chủ dự án chốt làm trước khi ép cập nhật)**:
   - `AppVersionService.isVersion`: bỏ hậu tố không phải số ở khúc cuối (`"5-tv"` → `5`) → `1.4.5-tv` = `1.4.5`.
   - `ControlAPIClient.fetchAppVersion()`: TV flavor hỏi `?platform=android-tv` (dùng `BuildConfig.TV_FLAVOR`).
   - Server: thêm `android-tv` vào `KNOWN_PLATFORMS` + payload (`app-version.js`) — **phải deploy control-plane
     trước khi phát v38**, không thì app TV nhận HTTP 400 (UnknownPlatformError) và mất luôn chức năng báo bản mới.
   - Test: `ApiFallbackTest` đang assert hằng số `"/v1/app-version?platform=android"` ⇒ phải cập nhật theo flavor.
3. ~~Chủ dự án quyết `minimum_version`~~ → **đã chốt ở khối trên**: giữ 1.2.6 tới khi có v38.
4. Thêm `apk_url_tv` vào `PATCH /v1/admin/android-version` (hiện phải ghi thẳng `app_config.db`).
5. `docs/RELEASE_NOTES_1.4.6.md` vẫn thiếu (việc tồn cũ, không liên quan bản này).
6. **Phối hợp**: cùng lúc có một phiên DSH khác phát cùng kênh (xem §4c). Trước khi phát lại kênh Android/TV,
   kiểm `git log --oneline -5` + `release/releases.jsonl` xem đã có ai ghi sổ chưa để tránh dòng trùng.

## 6. Rollback (nếu khách báo lỗi)

```bash
cd /root/flowvpn-apk
cp -p VPNFlow-latest.apk.backup-20261019-124215   VPNFlow-latest.apk
cp -p VPNFlow-android7.apk.backup-20261019-124215 VPNFlow-android7.apk
cd /var/www/flowvpn/dl
cp -p VPNFlow-tv-latest.apk.backup-20261019-124215 VPNFlow-tv-latest.apk   # ve v36
# tra moc
curl -s -X PATCH https://api.meetflowai.site/v1/admin/android-version \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"latest_version":"1.4.4"}'          # minimum_version GIU 1.2.6
```
Rồi ghi 1 dòng `origin=rollback` (kèm lý do) vào `release/releases.jsonl`.
