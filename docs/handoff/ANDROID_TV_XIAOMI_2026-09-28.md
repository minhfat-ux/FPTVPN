# ANDROID TV (XIAOMI / REDMI) — ĐÃ SỬA 2 LỖI CHẶN, TRẠNG THÁI TỪNG TV (28/09/2026)

> Khách báo: *"bản android bị crash khi cài lên TV Xiaomi Redmi, bật VPN lên là thoát app"*, sau đó
> *"quay tít connecting mãi không lên"*. Đã tìm ra **2 nguyên nhân gốc khác nhau** bằng log lấy **từ
> chính TV qua ADB** và sửa cả hai. Bản TV tách **flavor riêng** theo yêu cầu chủ dự án.

## 1. Lỗi #1 — bấm Connect là **thoát app** (v35, commit `4006b14`)

```
app: CRASH ở thread main -> android.content.ActivityNotFoundException:
Unable to find explicit activity class
{com.android.vpndialogs/com.android.vpndialogs.ConfirmDialog}
    at com.privatevpn.app.MainActivityKt$VPNFlowRoot$7$1.invokeSuspend(MainActivity.kt:130)
```

ROM Xiaomi TV **xoá hẳn** `com.android.vpndialogs` (hộp thoại xin quyền VPN của AOSP). `VpnService.prepare()`
trả về Intent mở hộp thoại đó → activity không tồn tại → exception **trên main thread** → app thoát.

**Sửa:** bọc `vpnConsentLauncher.launch(...)` trong `try/catch ActivityNotFoundException`: ghi log rồi
đi tiếp (`resumeAfterConsent()`). ROM nào cấp quyền sẵn thì tunnel lên; ROM nào không thì `establish()`
báo lỗi rõ ràng **thay vì giết app**.

> Trên một TV khác (`MiTV_ASSU0`, Android 14) **có** hộp thoại này, nhưng **remote không bấm được OK**
> (lỗi AOSP trên TV). Cách xử lý: bấm hộ bằng ADB — `adb shell input tap <x> <y>` vào nút OK
> (đo trên màn 1920×1080: OK ≈ `(600, 720)`).

## 2. Lỗi #2 — **quay tít connecting** mãi không lên (v36, commit `a83457d`)

```
protect[ws-relay]: lần 1=false, bind=>ok, lần 2=false
protect[tcp-relay:8443]: lần 1=false, bind=>ok, lần 2=false
W protect[...]: KHÔNG protect được — socket này sẽ đi xuyên qua tunnel và chết
-> tunnel: reconnecting / not serving      (lặp vô tận)
```

Trên **điện thoại** cùng code: `lần 2=true` (protect OK). Trên TV: `false` cho **mọi** socket ⇒ socket
của cầu WS/relay **chui vào chính tunnel** rồi chết ⇒ treo connecting. Nguyên nhân: app mở transport
**trước** khi dựng TUN, mà trên TV `VpnService.protect()` trả false khi VPN chưa được dựng.

**Sửa:** trong `protectRelaySocket`, nếu cả 2 lần đầu thất bại thì **dựng TUN trước** (`ensureTun()`)
rồi protect lại (log thêm `(sau khi dựng TUN)`).

## 3. Bằng chứng sau khi sửa (log TV, `.110` = MiTV_ASSU0 Android 14)

```
20:44:19 vpn: establish ok tun=261 underlying=underlying=wifi
20:44:19 tunnel: UP (hy-udp:51039)
20:44:25 bw: probe 1113325B/3037ms -> 2932kbps qua tunnel
20:44:26 probe#1 ... outer=:::39683/protect=ok
20:44:27 probe: THROUGH TUNNEL http 1.1.1.1:80 ok in 555ms
20:44:42 probe#2 ... ok 537ms        20:44:58 probe#3 ... ok
```
Chỉ **1 lần** dựng transport (trước đó là churn liên tục). Khách xác nhận: **connect được, có mạng, xem
được FPT Play**.

`.112` = MiTV_ASTP0 Android 9: `tunnel UP`, `protect=ok`, `THROUGH TUNNEL ok`, nguồn byte `/proc/net/dev`
— khách xác nhận **chạy được cả FPT Play**.

## 4. Trạng thái 3 TV (28/09/2026)

| TV | Model / Android | ADB | Trạng thái |
|---|---|---|---|
| `10.193.44.110` | MiTV_ASSU0 · **14** | mở | ✅ **chạy tốt** — v36 cả 2 gói; FPT Play OK |
| `10.193.44.112` | MiTV_ASTP0 · **9** | mở | ✅ **chạy tốt** — v36 cả 2 gói; FPT Play OK |
| `10.193.44.111` | REDMI (cùng dòng) | **ĐÓNG** (5555 refused) | ⏳ **chưa cài được** — cần bật ADB trên TV |

**Cách mở ADB trên TV Xiaomi** (đã dùng thành công cho `.112`): `Cài đặt → Thiết bị & Tuỳ chọn thiết bị
→ Giới thiệu → bấm "Bản dựng/Build" 7 lần → Tùy chọn nhà phát triển → bật **ADB debugging**` (một số bản
có mục **"Remote services / Dịch vụ từ xa"** — chính mục này đã mở cổng 5555 trên `.112`), **reboot nếu
cổng chưa mở**. Sau đó máy cài sẽ `adb connect <ip>:5555` và TV hiện hộp thoại **"Cho phép gỡ lỗi USB?"**
→ tick *Luôn cho phép* → **Cho phép**.

Khi `.111` mở ADB, cài đúng 2 lệnh:
```powershell
adb -s 10.193.44.111:5555 install -r -d <APK bản TV>      # com.privatevpn.app.tv.dev  (ưu tiên cho TV)
adb -s 10.193.44.111:5555 install -r -d <APK bản thường>  # com.privatevpn.app.dev
# rồi mở app trên TV, bấm Kết nối; nếu hiện "Connection request" mà remote không bấm được:
adb -s 10.193.44.111:5555 shell input tap 600 720
```

## 5. Bản TV riêng (theo yêu cầu chủ dự án)

- Flavor `tv`: `applicationId com.privatevpn.app.tv` (+ `.dev` cho debug), `versionNameSuffix -tv`,
  `BuildConfig.TV_FLAVOR=true`, thêm `LEANBACK_LAUNCHER` + bỏ yêu cầu màn hình cảm ứng
  (`src/tv/AndroidManifest.xml`). **Cài song song** với bản điện thoại ⇒ không ảnh hưởng bản stable.
- Build: `gradlew :app:assembleTvDebug` → `app-tv-debug.apk` (`com.privatevpn.app.tv.dev`, v36).
- APK đã đưa lên server để tải: `https://meetflowai.site/dl/test/VPNFlow-tv-v36.apk`
  (bản thường: `https://meetflowai.site/dl/test/VPNFlow-dev-34.apk` — sẽ cập nhật v36 nếu cần).

## 6. Bài học cho các nền tảng khác (iOS/macOS không bị vì không dùng VpnService AOSP)

1. **Không bao giờ để lời gọi hệ thống trong luồng UI mà không bọc `try/catch`** — `startActivityForResult`
   trên ROM hãng thiếu component là crash chết app (`ActivityNotFoundException`), mà log chỉ có nếu có
   handler crash toàn cục (đã thêm ở v33).
2. **`protect()` có thể trả false khi VPN chưa dựng** — nếu thiết kế "mở transport trước, dựng TUN sau"
   thì phải có đường lùi "dựng TUN rồi protect lại" (đã thêm ở v36).
3. **TV hãng ≠ Android chuẩn**: Xiaomi bỏ hộp thoại VPN hoặc không cho D-pad bấm OK; luôn kiểm trên máy
   thật và giữ flavor riêng cho TV.

## 7. Sự việc "TV tự tắt khi mở FPT Play" — **KHÔNG phải do VPN** (điều tra 29/09/2026)

Khách báo: *"bật FPT Play trên TV .110 thì TV tự tắt"*. Đã điều tra và **loại trừ app VPN**:

- Phía server: relay `vn2hy` lúc đó **không có lỗi** (`dropped=0`, `udpErrors=0`, `lastError=null`), phiên
  của TV chở ~1,07 MB vào / 1,14 MB ra rồi **client tự đóng 1001** — không có gì bất thường.
- Trước đó **cùng TV, cùng VPN** khách đã xem FPT Play bình thường ("rất đẹp luôn").
- **Mốc thay đổi**: khách cài **YouTube + Google Play** lên TV (MiTV bản Trung Quốc **không có GMS chính thức**).
- Triệu chứng sau đó: **mọi app khác chạy bình thường, chỉ FPT Play làm TV tự tắt**.
- **Kiểm chứng cuối**: **gỡ Google Play + YouTube ra ⇒ FPT Play chạy lại bình thường.**

**Kết luận:** bộ GMS vá tay trên ROM MiTV nội địa làm hỏng đường DRM/HDCP; app có DRM (FPT Play/YouTube)
làm TV tự tắt. **Không liên quan VPN/VPNFlow.**

**Quy tắc cho hỗ trợ khách (ghi vào cẩm nang):**
1. Khách báo "TV Xiaomi tự tắt / đen màn khi mở một app video" ⇒ **kiểm tra ngay TV có cài Google Play /
   YouTube (bộ GMS vá) không** — nếu có, yêu cầu gỡ ra rồi thử lại.
2. **Không khuyến nghị khách cài GMS lên TV Xiaomi nội địa** nếu muốn xem app DRM ổn định; TV vẫn dùng
   VPNFlow bình thường (đã kiểm chứng trên `.110` và `.112`, gồm cả FPT Play).
3. Không cần sửa gì trong app cho ca này; giữ flavor TV như hiện tại.

## 8. Trạng thái cài đặt app trên 3 TV (29/09/2026)

| TV | Model | Android | HyperOS | VPNFlow (TV) | SmartTube | TV360 | Netflix |
|---|---|---|---|---|---|---|---|
| `10.193.44.110` | MiTV-ASSU0 | **14** (SDK 34) | `OS3.0.116.0.USSAATV` (mới nhất của model) | ✅ v36 | ✅ 32.56 | ✅ `com.viettel.tv360.tv` v3.3 | ⏳ chờ APK gốc |
| `10.193.44.111` | MiTV-ASTP0 | **9** (SDK 28) | `OS2.0.8.0.PSTAATV` | ✅ v36 | ✅ 32.56 | ❌ **không cài được** | ⏳ chờ APK gốc |
| `10.193.44.112` | MiTV-ASTP0 | **9** (SDK 28) | `OS3.0.101.0.PSTAATV` | ✅ v36 | ✅ 32.56 | ❌ **không cài được** | ⏳ chờ APK gốc |

**Vì sao TV360 không cài được trên `.111`/`.112`** — lỗi lấy trực tiếp từ ADB:
```
INSTALL_FAILED_OLDER_SDK: Requires newer sdk version #29 (current version is #28)
```
Bản TV360 SmartTV (`com.viettel.tv360.tv` v3.3, nguồn Aptoide, **do Skyworth ký** — bản cài sẵn theo máy
Skyworth, không phải Viettel ký) yêu cầu **Android 10 (minSdk 29)**, còn 2 TV đó là **Android 9**.
Trang chính thức `tv360.vn/app` **chỉ trỏ về Google Play**, không phát APK. Cần bản TV360 cũ hơn
(minSdk ≤ 28) hoặc bản Play 5.6.x — đã nhờ Mac tải (mạng Windows bị chặn APKPure/APKCombo/APKMonk/APKFab).

**Lưu ý về nâng HyperOS:** `.112` đã ở HyperOS **3.0.101** mà vẫn **Android 9** ⇒ nâng `.111` từ 2.0.8 lên
3.0.x **nhiều khả năng vẫn Android 9** ⇒ TV360 vẫn bị chặn. Muốn Android 14 phải là **model khác**
(như `.110` là MiTV-ASSU0). Chủ dự án đã thử nâng `.110` nhưng model này **không có bản mới hơn**.

**SmartTube thay YouTube**: đã cài trên cả 3 TV. Nó **không cần Google Play Services** và **không đi
đường DRM/Widevine** ⇒ dùng tốt mà **không phải cài lại bộ GMS** (thứ đã gây vụ "TV tự tắt" ở §7).
APK: `SmartTube_stable_32.56_universal.apk` (sha256 `4A35B90940612E048E4E9CB9E10379F7DB1E84F30375994129F10A571EE04CE5`).

**Netflix — chưa cài, và đã chặn 1 bản giả:** bản trên Aptoide có chữ ký `CN=Android, O=Android`
(khoá AOSP) + nhãn app **"Welcome"** + chỉ 9,4 MB (bản thật ~25 MB) ⇒ **bản đóng gói lại, KHÔNG cài**.
Cần APK gốc do **`Netflix, Inc.` ký** (`com.netflix.ninja`) — đã nhờ Mac tải; Windows sẽ
`apksigner verify --print-certs` **trước khi cài** và từ chối nếu signer không phải Netflix.
Rào cản kỹ thuật đi kèm: Netflix TV cần máy **được Netflix chứng nhận**; 3 TV có Widevine HAL
(`vendor.drm-widevine-hal-1-1` trên Android 9, `/vendor/lib/libwvaidl.so` trên Android 14) nhưng
**không đọc được mức L1/L3 bằng shell** ⇒ chỉ khi cài app mới biết có chạy được hay không.


