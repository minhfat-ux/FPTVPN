# T-20261007-01 — Rà version Android cho TV/box: đã update latest code chưa?

> Nguồn việc: **bus #829** (`owner → win`, 2026-10-07T09:21:06Z, ref `TG-VIBECODE`), nguyên văn:
> *"check lại các version android cho TV, box, đã update latest code chưa? Báo cáo lại anh và đưa giải
> pháp anh review. Cần update latest solution cho các version đó."*
> Máy làm: **WIN** (`DESKTOP-852P1LT`) · Ngày: 07/10/2026. Người gửi: chủ dự án.
>
> **KẾT LUẬN NGẮN**
> 1. **Bản TV (Xiaomi/Android TV) = ĐÚNG code mới nhất (v36)** nhưng là **bản DEBUG**
>    (`com.privatevpn.app.tv.dev`, `1.4.3-tv-dev`, ký bằng khoá *Android Debug*) — **không phải bản
>    release**, không có kênh version để tự cập nhật.
> 2. **Bản cho box / Fire TV / Android 7 và bản Android thường = v32 / 1.4.4 (23/09)** ⇒ **chậm 4 bản**
>    so với code mới nhất v36 (28/09): thiếu v33 (ghi vết crash TV), v34 (xuất báo cáo chẩn đoán),
>    v35 (không thoát app khi Connect trên TV), v36 (dựng TUN trước rồi protect).
> 3. **MeetFlow AI Android** (`com.meetflow.translator`) = **1.0.7 / 8, đúng code mới nhất** trên
>    `main` (commit cuối đụng `android/`: `666b330`, 21/09) ⇒ **không lệch**.
> 4. **Lỗi số version**: dòng code v33–v36 đã **lùi `versionName` 1.4.4 → 1.4.3** (commit `adcb5a2`)
>    trong khi endpoint vẫn công bố `latest_version = 1.4.4`. Nếu phát thẳng v36 mà không bump số thì
>    app so version kiểu số (`AppVersionService.isVersion`) ⇒ **không ai nhận được cập nhật**.
> 5. Việc phát bản mới cần chủ dự án **mở băng Android** (`FREEZE_ANDROID_2026-09-23.md` §5) và
>    **duyệt giải pháp ở §4**.

---

## 1. Version THỰC TẾ của từng artifact đang phát (đo từ chính file, không tin tên file)

| Đối tượng | Kênh phát | Package trong APK | versionCode / versionName | Ký bởi | Ngày file | Byte |
|---|---|---|---|---|---|---|
| **TV Xiaomi / Android TV** | `https://meetflowai.site/dl/VPNFlow-tv-latest.apk` (chip *"Android TV (APK)"* trên trang chủ; bản gốc `…/dl/test/VPNFlow-tv-v36.apk`) | `com.privatevpn.app.tv.dev` | `36` / `1.4.3-tv-dev` | **`CN=Android Debug`** | 28/09 14:42Z | 113.423.049 |
| **Box / Fire TV / Android 7** | `https://t1.meetflowai.site/v1/downloads/android-legacy` | `com.privatevpn.app` | `32` / `1.4.4` | release (`vpnflow-release`) | 23/09 08:56Z | 74.748.054 |
| **Android thường (phone)** | `https://t1.meetflowai.site/v1/downloads/android` | `com.privatevpn.app` | `32` / `1.4.4` | release (`vpnflow-release`) | 23/09 08:51Z | 74.731.674 |
| **MeetFlow AI (mọi máy Android)** | `https://api.meetflowai.site/v1/ai/downloads/android` | `com.meetflow.translator` | `8` / `1.0.7` | release (`CN=MeetFlow AI`) | 21/09 06:07Z | 4.397.108 |
| **FPT Play (app của FPT, không phải app mình)** | `https://meetflowai.site/dl/tv/FPTPlay-TV-7.34.13-ottbox.xapk` (+ universal) | `net.fptplay.ottbox` | `4394` / `7.34.13` | FPT | 28/09 15:06Z | 90.167.841 |

Endpoint version đang trả:
- VPNFlow: `GET https://api.meetflowai.site/v1/app-version?platform=android`
  → `{"minimum_version":"1.2.6","latest_version":"1.4.4","apk_url":"…/v1/downloads/android","apk_url_legacy":"…/v1/downloads/android-legacy"}`
- MeetFlow AI: `GET https://api.meetflowai.site/v1/ai/app-version`
  → `{"latest_version_code":8,"minimum_version_code":3,"latest_version_name":"1.0.7", …}`

## 2. Đối chiếu với "latest code"

| App | Latest code | Bản đang phát | Kết luận |
|---|---|---|---|
| **VPNFlow Android** | `minhfat-ux/FPTVPN` `main`: `versionCode 36 / versionName 1.4.3`; commit cuối đụng `android/` = **`a83457d` (v36, 28/09 21:04+08)**. Không có commit nào đụng `android/` sau đó (`git log a83457d..HEAD -- android/` rỗng), cây sạch. | phone/box = **v32**; TV = **v36 debug** | ❌ **phone/box chậm 4 bản**; TV đúng code nhưng **sai loại build** |
| **MeetFlow AI Android** | `minhfat-ux/MeetFlowAI` `main`: `versionCode 8 / versionName 1.0.7`; commit cuối đụng `android/` = `666b330` (21/09) | `1.0.7 / 8` | ✅ **khớp latest code** |
| **FPT Play TV** | app bên thứ ba | `7.34.13 / 4394` | — (không phải app của mình; muốn bản mới phải lấy từ nguồn FPT) |

**4 bản vá đang thiếu trên box/phone** (có trong v36, không có trong v32 đang phát):

| Version | Commit | Nội dung |
|---|---|---|
| v33 | `adcb5a2` | Không để app THOÁT khi bật VPN trên TV + ghi vết crash để đọc được (đồng thời **lùi versionName 1.4.4 → 1.4.3**) |
| v34 | `67b8d87` | Xuất báo cáo chẩn đoán ra `Downloads` công khai (lấy được vết crash trên TV) |
| v35 | `4006b14` | Bắt `ActivityNotFoundException` (ROM Xiaomi thiếu `com.android.vpndialogs`) + **tách flavor TV riêng** |
| v36 | `a83457d` | `protect()` thất bại khi chưa có TUN ⇒ **dựng TUN trước rồi protect lại** (hết "quay tít connecting") |

## 3. Ba vấn đề cần chủ dự án biết

1. **Bản TV là bản DEBUG, không phải bản phát hành.** Bằng chứng: package `com.privatevpn.app.tv.dev`
   (hậu tố `.dev`), `versionName 1.4.3-tv-dev`, chữ ký `CN=Android Debug` (không phải
   `vpnflow-release.jks`). Hệ quả: app bật `debuggable`, không thể được "ép cập nhật" bằng bản release
   cùng tên (khác package + khác chữ ký), và người dùng TV phải tự cài tay từ link.
2. **Box / Fire TV / Android 7 và phone đang chạy v32 (1.4.4) — thiếu cả 4 bản vá v33–v36.** Riêng box
   Fire OS dùng bản `legacy` (minSdk 24) nên càng ít được cập nhật.
3. **Số version đang lệch — chặn việc cập nhật tự động.** `app-version` công bố `latest_version 1.4.4`,
   nhưng dòng code mới nhất lại tên `1.4.3`. App so version theo từng thành phần số
   (`AppVersionService.isVersion`: "1.0.2" < "1.0.10"), nên bản `1.4.3` bị coi là **cũ hơn** `1.4.4` ⇒
   phát v36 nguyên số sẽ **không hiện cập nhật** cho ai.

## 4. Giải pháp đề xuất (chờ chủ dự án duyệt — chưa thi công)

1. **Chốt số version mới**: `versionCode 37`, `versionName 1.5.0` (bỏ hẳn mốc 1.4.3/1.4.4 đang lệch).
2. **Build RELEASE (có ký) từ đúng commit `a83457d` (v36)** cho 3 biến thể:
   - `modern` → `com.privatevpn.app` (phone);
   - `legacy` (minSdk 24) → `com.privatevpn.app` (box / Android 7 / Fire TV);
   - `tv` (LEANBACK) → `com.privatevpn.app.tv` (TV Xiaomi).
   Keystore release **đã có sẵn trên máy WIN**: `~/keystores/vpnflow-release.jks` +
   `~/keystores/vpnflow-signing.properties` (`storeFile` trỏ đúng file), build-tools 35/36 + JDK 17 có sẵn.
3. **Phát**:
   - `/v1/downloads/android` + `/v1/downloads/android-legacy` = 2 bản release mới;
   - `/dl/VPNFlow-tv-latest.apk` = bản TV **release** `com.privatevpn.app.tv`;
   - `PATCH /v1/admin/app-version` cho android: `latest_version = 1.5.0` (giữ `minimum_version 1.2.6`,
     hoặc nâng nếu muốn ép cập nhật).
4. **Chuyển TV từ bản debug sang bản release**: TV đang có `com.privatevpn.app.tv.dev`; cài thêm
   `com.privatevpn.app.tv` (chạy song song vì khác package), mở app mới, rồi gỡ bản `.dev`. Cài bằng
   `adb install -r` (không đè được bản `.dev` vì khác package + khác chữ ký).
5. **Cập nhật máy thật**: 3 TV Xiaomi (`10.193.44.110` Android 14, `10.193.44.112` Android 9,
   `10.193.44.111` đang đóng ADB 5555) + box. **Lưu ý đo được hôm nay**: máy WIN hiện **không cùng LAN**
   với dải TV (`adb connect 10.193.44.x:5555` → timeout cả 3) ⇒ phải làm khi máy ở cùng mạng với TV,
   hoặc chủ dự án tự cài từ link.
6. **Mở băng Android**: theo `FREEZE_ANDROID_2026-09-23.md` §5, muốn build/phát bản mới phải có yêu cầu
   của chủ dự án. Việc này chính là yêu cầu đó — WIN chờ chủ dự án **duyệt §4** rồi thi công.
7. **MeetFlow AI Android**: bản `1.0.7/8` đã là latest ⇒ không cần đụng. Bản có **thông báo bắt buộc
   đăng ký email** (mốc 10/10, handoff `HANDOFF_MEETFLOW_EMAIL_NOTICE_2026-10-10.md`) **chưa có trong
   `main`** — là việc riêng, cần chủ dự án mở băng Android đúng phạm vi (đã chốt ở bus #710).

## 5. Bằng chứng (chạy lại được)

```powershell
# 1) Endpoint version đang công bố gì
curl.exe -s "https://api.meetflowai.site/v1/app-version?platform=android"      # latest_version=1.4.4, apk_url_legacy=…/android-legacy
curl.exe -s "https://api.meetflowai.site/v1/ai/app-version"                     # latest_version_name=1.0.7, code=8

# 2) Tải THẬT artifact đang phát rồi đọc version trong file (không tin tên file)
node ops/_scratch/tvbox-download-artifacts.mjs      # -> ops/_scratch/_tvbox/{ai-android,vpn-modern,vpn-legacy}.apk
& "C:\Users\Minhn\Android\sdk\build-tools\36.0.0\aapt2.exe" dump badging ops\_scratch\_tvbox\vpn-modern.apk | Select-Object -First 1
#   -> package: name='com.privatevpn.app' versionCode='32' versionName='1.4.4'
& "C:\Users\Minhn\Android\sdk\build-tools\36.0.0\aapt2.exe" dump badging ops\_scratch\_tvbox\vpn-legacy.apk | Select-Object -First 1
#   -> package: name='com.privatevpn.app' versionCode='32' versionName='1.4.4'   minSdkVersion:'24'
& "C:\Users\Minhn\Android\sdk\build-tools\36.0.0\aapt2.exe" dump badging ops\_scratch\_tvbox\ai-android.apk | Select-Object -First 1
#   -> package: name='com.meetflow.translator' versionCode='8' versionName='1.0.7'

# 3) Bản TV: package + chữ ký (chứng minh là bản DEBUG)
& "C:\Users\Minhn\Android\sdk\build-tools\36.0.0\aapt2.exe" dump badging "C:\Users\Minhn\.vpnflow-build-142\app\outputs\apk\tv\debug\app-tv-debug.apk" | Select-Object -First 1
#   -> package: name='com.privatevpn.app.tv.dev' versionCode='36' versionName='1.4.3-tv-dev'
$env:JAVA_HOME="C:\Users\Minhn\jdk17\jdk-17.0.20.1+1"
& "C:\Users\Minhn\Android\sdk\build-tools\36.0.0\apksigner.bat" verify --print-certs "C:\Users\Minhn\.vpnflow-build-142\app\outputs\apk\tv\debug\app-tv-debug.apk"
#   -> Signer #1 certificate DN: C=US, O=Android, CN=Android Debug

# 4) File TV phát trên web ĐÚNG BẰNG artifact debug đó (băm thật, tải từ Internet)
node ops/_scratch/tvbox-tv-apk-hash.mjs
#   -> bytes=113423049  sha256=cc03504ed83d0e4a05962c204d535cdc668a2d3f09c3284ec48da33f586ef821 (KHỚP artifact tv/debug)

# 5) Latest code
git -C "C:\Users\Minhn\FPTVPN" log -1 --format="%h %ci %s" a83457d        # v36, 28/09
git -C "C:\Users\Minhn\FPTVPN" log --oneline a83457d..HEAD -- android/    # rỗng = v36 là mới nhất
gh api "repos/minhfat-ux/MeetFlowAI/contents/android/app/build.gradle.kts?ref=main" --jq .content  # versionCode 8 / 1.0.7

# 6) Trạng thái trên node-2 (165.101.114.162)
ssh root@165.101.114.162 "ls -la /var/www/flowvpn/dl/ | grep -i vpnflow; ls -la /var/www/flowvpn/dl/test/; ls -la /var/www/flowvpn/dl/tv/"
#   -> /dl/VPNFlow-tv-latest.apk = 113423049 (28/09 21:42)  ·  /dl/test/VPNFlow-tv-v36.apk, VPNFlow-phone-v36.apk
#   -> KHÔNG có file release nào cho TV (chỉ có bản debug v36)
```

Kết quả băm đã đo (07/10/2026):

| File tải thật | Byte | sha256 | Khớp artifact nào |
|---|---|---|---|
| `…/v1/downloads/android` | 74.731.674 | `145053e918f75aed98f81d4d61c5b827206ea27318be13d629024fea9bfb8677` | `.vpnflow-build/…/app-modern-release.apk` (v32/1.4.4, 23/09) |
| `…/v1/downloads/android-legacy` | 74.748.054 | `b9a03e775d28a506b3d285b286036d56c7d958b3dde859a36b13709cc7d886eb` | `.vpnflow-build/…/app-legacy-release.apk` (v32/1.4.4, 23/09) |
| `…/v1/ai/downloads/android` | 4.397.108 | `a7b825d4ba32aa285b0789ee1ed32081b4b8377b811118a77bdabf6c2e88cd8d` | `MeetFlowAI-1.0.7-china.apk` (v1.0.7/8) |
| `/dl/VPNFlow-tv-latest.apk` | 113.423.049 | `cc03504ed83d0e4a05962c204d535cdc668a2d3f09c3284ec48da33f586ef821` | `.vpnflow-build-142/…/tv/debug/app-tv-debug.apk` (v36, **debug**) |

## 6. Điểm chưa chắc / cần chủ dự án quyết

- **Trạng thái cài trên 3 TV hiện tại**: tài liệu 28–29/09 ghi cả 3 TV đã có **v36 (cả 2 gói)**; hôm nay
  WIN **không đọc lại được qua ADB** vì máy không cùng LAN (`10.193.44.x` timeout). Cần xác nhận lại khi
  máy về đúng mạng, hoặc chủ dự án cho biết TV nào đang lỗi.
- **Bản TV release nên giữ package nào**: `com.privatevpn.app.tv` (sạch) hay cố tình giữ `.tv.dev` để
  khỏi phải cài lại? Đề xuất: **`com.privatevpn.app.tv`** + cài song song rồi gỡ bản dev.
- **Có ép cập nhật không**: nâng `minimum_version` lên `1.5.0` sẽ chặn cứng máy cũ cho tới khi cập nhật;
  đề xuất **không ép** (giữ 1.2.6) ở lần này để tránh khoá khách, chỉ hiện "có bản mới".
- **Play Store**: app VPNFlow/MeetFlow AI chưa có trang Play (đã kiểm 28/09, 404) ⇒ hiện chỉ phát APK.
