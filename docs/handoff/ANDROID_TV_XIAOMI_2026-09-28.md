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

