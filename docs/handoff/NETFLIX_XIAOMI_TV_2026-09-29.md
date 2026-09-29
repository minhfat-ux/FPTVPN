# Netflix trên 3 TV Xiaomi nội địa (`.110` / `.111` / `.112`) — 29/09/2026

**Kết luận ngắn:** cài được **APK Netflix thật** (chữ ký `Netflix, Inc.`) lên cả 3 TV, nhưng **chính app Netflix từ chối thiết bị**
(`This version is not compatible with your device` / `This device is not supported by the app.`).
Đây là chặn ở **tầng chứng nhận thiết bị của Netflix**, không phải lỗi phiên bản APK — đã chứng minh bằng **2 app khác nhau**
(app Android TV `com.netflix.ninja` và app phone `com.netflix.mediaclient`) trên cùng một TV, cả hai đều bị chặn.
**Không có bản APK chính chủ nào vượt được cửa này.**

## 1. APK đã dùng (đều là hàng thật, verify bằng `apksigner`)

| App | Package | Version | ABI / minSdk | Chữ ký | sha256 file |
|---|---|---|---|---|---|
| Netflix (Android TV) | `com.netflix.ninja` | 10.3.0 build 19305 | armeabi-v7a / 24 | `CN=PPD Builder, OU=PPD, O="Netflix, Inc.", L=Los Gatos, ST=California, C=US` + Source Stamp Google | `8023dee831c2f3f707a72f8b0fd085a726e003a9c7dd090b207d2aad918348cf` |
| Netflix (Android TV, dự phòng) | `com.netflix.ninja` | 9.0.3 build 11180 | armeabi-v7a | (chưa dùng tới) | `1cfe17de57aa2ebbc1af7d1868eef46cb27e0a233ec43554a7f29a33a45871b9` |
| Netflix (phone, để thử) | `com.netflix.mediaclient` | 8.143.1 (vc 52000) | armeabi-v7a / 24 | **cùng cert** `SHA-256 363863596ea99241eb71b1a985553aa604de3ea3c5f0c546742390e682164e6b` | `a3c8ae44198064a89519bea580b4301928fe6438911201df50699c769aba22ae` |

Nguồn: bản nguyên gốc (đăng lại trên `archive.org`, gốc APKMirror). APKMirror/APKPure bị Cloudflare chặn 403 từ cả mạng
Trung Quốc **và** từ VPS node-2 ⇒ tải qua `archive.org` bằng node-2 rồi kéo về.

Link đã publish để test (server Caddy, HTTP 200):
- `https://meetflowai.site/dl/test/Netflix-TV-10.3.0.apk`
- `https://meetflowai.site/dl/test/Netflix-TV-9.0.3.apk`
- `https://meetflowai.site/dl/test/Netflix-phone-8.143.1.apk`

## 2. Bằng chứng "Netflix tự chặn thiết bị" (không phải ROM)

| Bằng chứng | Lệnh | Kết quả |
|---|---|---|
| Cài được lên cả 3 TV | `adb -s <ip>:5555 install -r Netflix-TV-10.3.0.apk` | `Performing Streamed Install Success` trên `.110` (19:05), `.111` (19:07), `.112` (18:07) |
| App **đang chạy** khi hiện thông báo | `dumpsys activity activities \| grep ResumedActivity` | `ResumedActivity: ActivityRecord{… com.netflix.ninja/.MainActivity}` |
| Màn hình lỗi do **Netflix vẽ** (không phải ROM) | `screencap` khi hộp thoại hiện vs khi ở Home | **0 byte** khi hộp thoại hiện (Netflix bật `FLAG_SECURE`) · **857.775 byte** khi về Home |
| Netlix TV báo lỗi gì | người dùng đọc trên TV | `This version is not compatible with your device` + mã **-3** |
| App **phone** cũng bị chặn | `uiautomator dump` (dialog thuộc package nào) | `text='This device is not supported by the app.' pkg=com.netflix.mediaclient` (ảnh: `nf-phone-110-b.png`) |
| Không phải do thiếu Google Play | `.110` có `com.google.android.gms`/`gsf` còn `.111`/`.112` không có | **cả 3 TV lỗi giống nhau** |
| Không phải sai ABI | `getprop ro.product.cpu.abilist` | `armeabi-v7a,armeabi` — khớp APK `armeabi-v7a` |
| Widevine có sẵn cho app | log `WVCdm-DrmFactory: [app][com.netflix.mediaclient] … createDrmPlugin` | DRM factory được gọi, HAL `vendor.drm-widevine-hal-1-1` running |

**Điểm chung của 3 TV = ROM nội địa Trung Quốc:**

```
.110: Xiaomi/heidi/heidi:14/UD2A.240505.001.W1/OS3.0.116.0.USSAATV:user/release-keys   (Android 14, MiTV-ASSU0)
.111: Xiaomi/mulan/mulan:9/PPR1.180610.011/OS2.0.8.0.PSTAATV:user/release-keys          (Android 9,  MiTV-ASTP0)
.112: MiTV-ASTP0, Android 9
```

PatchWall còn gắn cờ "không hợp quy" (ẩn khỏi *Ứng dụng của tôi*, **không** gỡ package):

```
AppComplianceUtils: isCompliance() … com.netflix.ninja:false
NewLocalAppMineBlockCreator: 删除不合规应用，com.netflix.ninja
```

## 3. Vì sao đổi APK không giải quyết được

Netflix có **danh sách thiết bị được Netflix chứng nhận, tách biệt với chứng nhận Google**, gắn với Widevine/ESN của máy.
TV Xiaomi bán tại Trung Quốc (license `gitv`, ROM `…AATV`) không nằm trong danh sách đó ⇒ app TV trả lỗi `-3`,
app phone trả `This device is not supported by the app.` Bản 9.0.3/10.3.0/13.x hay app phone đều chạy **cùng một cửa kiểm tra**.

## 4. Phương án thật để xem Netflix (đề xuất theo thứ tự)

1. **Cắm 1 thiết bị HDMI được Netflix chứng nhận** — Fire TV Stick 4K / Chromecast with Google TV / Mi Box S /
   Xiaomi TV Stick 4K / Apple TV. Chắc chắn chạy, remote mượt, HD/4K. **Đây là cách đúng cho TV nội địa.**
2. Xem trên điện thoại (Samsung SM-F9460 `10.193.44.103`) — máy đã có Netflix + VPNFlow chạy tốt.
3. ⚠️ APK "bỏ kiểm tra thiết bị" (bản mod, không chính chủ): **không khuyến nghị** — phải nhập tài khoản Netflix
   vào code của người lạ, rủi ro mất tài khoản; chỉ làm nếu chủ dự án xác nhận rõ ràng.
4. ⚠️ Flash ROM quốc tế cho TV (MiTV-ASTP0 có bản quốc tế Xiaomi TV P1): rủi ro brick, cần nghiên cứu riêng,
   chưa có bằng chứng bản quốc tế cho đúng mã máy này có Netflix ESN.

## 5. Trạng thái hiện tại trên TV

- `com.netflix.ninja` (10.3.0): **còn nguyên** trên cả 3 TV — chạy được nhưng hiện thông báo không tương thích.
- `com.netflix.mediaclient` (8.143.1): cài trên `.110` để thử — hiện `This device is not supported by the app.`
- VPNFlow TV v36 + SmartTube vẫn hoạt động bình thường, không liên quan tới lỗi này.
