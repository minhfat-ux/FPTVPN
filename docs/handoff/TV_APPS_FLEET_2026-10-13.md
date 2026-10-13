# Fleet TV Xiaomi — cài app + trạng thái thật (13/10/2026)

> Chủ dự án: *"cài cho anh bản fpt play latest lên cái tv .112 nhé"* → *"em cài lên tất cả TV trong
> LAN luôn cho anh"* → *"kiếm bản cài TV360 luôn để cài lên 110"* → *"cái meetflow AI bản android
> lên tv 110"* → *"cài lại bản fpt play mới cho con tv 110 đi em"* → *"có cái tV anh đang mở đó,
> check xem"*.
>
> Tài liệu này ghi **trạng thái fleet** (địa chỉ IP **không cố định** — đã đổi thật) + **hash APK**
> + **việc còn chặn**, để lần sau không phải dò lại từ đầu.

## 0. Kết luận ngắn (13/10/2026)

| Câu hỏi | Trả lời thật |
|---|---|
| Cài lại FPT Play mới cho `.110`? | **Không làm được lúc này** — `.110` đang **tắt** (không ping, không có trong bảng ARP). |
| TV nào đang mở? | **`.115`** (`MiTV_ASTP0`, Android 9) — IP cũ là `.111`, DHCP đổi thành `.115`. |
| FPT Play trên TV đang mở? | **Đã cài `7.34.13` (vc 4394)** và **mở được** (dừng ở màn "Đăng nhập FPT Play", process còn sống sau 12 s). |
| `.110` cài lại cùng bản có sửa được lỗi "bật FPT Play là TV tự tắt"? | **Không** — `.110` (phiên trước) đã có **đúng `7.34.13`** ⇒ phải bắt `logcat` tại lúc tắt mới tìm được nguyên nhân. |

## 1. IP **không cố định** — nhận diện TV bằng MAC, không bằng IP

DHCP của LAN cấp lại địa chỉ: TV `MiTV_ASTP0` **`.111` → `.115`** (MAC `0c:79:55:d9:73:e6`).
Lần sau: quét ARP tìm MAC rồi mới `adb connect`.

```powershell
arp -a | Select-String "10\.193\.44\."
foreach ($ip in @("10.193.44.110","10.193.44.111","10.193.44.112","10.193.44.115")) {
  "{0} ping={1} adb5555={2}" -f $ip,
    (Test-Connection $ip -Count 2 -Quiet -ErrorAction SilentlyContinue),
    (Test-NetConnection $ip -Port 5555 -WarningAction SilentlyContinue).TcpTestSucceeded
}
```

Kết quả thật 13/10/2026 16:27:

```
10.193.44.110    ping=False  adb5555=False     <- TAT
10.193.44.111    ping=False  adb5555=False     <- TAT (IP cu cua TV .115)
10.193.44.112    ping=True   adb5555=False     <- BAT nhung ADB dong
10.193.44.115    ping=True   adb5555=True      <- TV dang mo
```

## 2. Trạng thái fleet

| TV | Model / Android | IP hôm nay | App đã có (verify bằng `dumpsys package`) |
|---|---|---|---|
| `.115` (cũ `.111`) | `MiTV_ASTP0` / 9 / armeabi-v7a | `10.193.44.115:5555` | FPT Play `7.34.13` · VPNFlow TV `1.4.3-tv-dev` (`com.privatevpn.app.tv.dev`) · SmartTube `org.smarttube.stable` · MeetFlow `com.meetflow.translator`. **Không có** GMS/Play Store |
| `.112` | `MiTV_ASTP0` / 9 | `10.193.44.112` (ping được, **ADB đóng**) | FPT Play `7.34.13` (đã cài ở phiên trước) |
| `.110` | `MiTV_ASSU0` / 14 | — (**tắt**, không ping) | FPT Play `7.34.13` · MeetFlow AI `1.0.7` · GSF `com.google.android.gsf` + GMS + Play Store + YouTube TV · VPNFlow TV. Không mở được Play Store khi test (TV offline giữa lúc test) |

Bằng chứng trên `.115`:

```
$ adb -s 10.193.44.115:5555 shell "pm list packages | grep -iE 'fpt|privatevpn|tear|smarttube'"
package:com.meetflow.translator
package:org.smarttube.stable
package:com.privatevpn.app.tv.dev
package:net.fptplay.ottbox

$ adb -s 10.193.44.115:5555 shell "dumpsys package net.fptplay.ottbox | grep -E 'versionName|primaryCpuAbi'"
primaryCpuAbi=armeabi-v7a
versionCode=4394 minSdk=23 targetSdk=36
versionName=7.34.13
```

## 3. APK dùng cho fleet (hash thật, lấy lại 13/10/2026)

| App | File cục bộ (`C:\Users\Minhn\Downloads\`) | Bytes | sha256 |
|---|---|---|---|
| FPT Play TV (XAPK) | `fptplay-tv-latest2.apk` | 90.168.083 | `ef45e0d47fc13f9eb32c311fa7d9a6fb8daf3fa35a228fdb72536159c1a5c13c` |
| FPT Play TV (XAPK, bản tải trước) | `fptplay-tv-latest.apk` | 90.167.841 | `ac57bde7996fb946511591341e3dd43ba883a3ba7ba1cc58a499b6a4b2f6129c` |
| YouTube TV | `youtube-tv-latest.apk` | 76.449.448 | `d6a5305d970637a32d1298e0fece946533a35ed9b2df353593eee6c6cb2854af` |
| Google Services Framework | `gms\gsf.apk` | 5.716.267 | `7a0f9e6400ba74b95f95e2bd11a3197abcc9199fe2781a2d8ccd6a9bd2b9422d` |
| Google Play Services | `gms\gms.apk` | 273.929.189 | `657949a565bb9eb632b0c6ef6fd2bfdd1b4d801758782873b883235f3a274b5b` |
| Play Store | `gms\vending.apk` | 106.020.565 | `444e41ee8ef6ec8c55815087c51c28e516ea32f93d856f8bdd0025bb6fc36bc2` |
| TV360 SmartTV (XAPK) | `tv360\TV360-SmartTV.apk` | 69.609.066 | `3ea87c122f30cc419b6497210973e83536ce091da880aeb6dcc86cc3ec6ba76c` |
| SmartTube 32.56 armv7 | `SmartTube-32.56-armv7.apk` | 25.046.686 | `d2e9bc90b95aa6232fbf647e63003ccb9051d1aad53531c103aa997e443457b6` |

**Hai XAPK FPT Play là cùng một build**: base APK bên trong **trùng sha256**
(`36c0911721dd977d1c9ec0edb9c046d83fe82d0974ebc2dacc637156afc672ed`), đều
`versionCode=4394 versionName=7.34.13`. Chỉ phần vỏ XAPK (metadata/icon) khác nhau.

## 4. Cách cài FPT Play (XAPK → `install-multiple`)

`adb` **bắt buộc đuôi `.apk`** — XAPK chỉ là zip, phải giải nén rồi cài theo split:

```powershell
$adb = "C:\Users\Minhn\Android\sdk\platform-tools\adb.exe"
$dir = "C:\Users\Minhn\Downloads\fptplay-tv-xapk2"   # da giai nen XAPK
& $adb connect 10.193.44.115:5555
& $adb -s 10.193.44.115:5555 install-multiple -r `
  "$dir\net.fptplay.ottbox.apk" "$dir\config.armeabi_v7a.apk" `
  "$dir\config.hdpi.apk" "$dir\config.vi.apk" "$dir\config.en.apk"
```

Kết quả thật: `Success`.

Thiếu split ⇒ `INSTALL_FAILED_MISSING_SPLIT` (đã gặp với TV360).

## 5. Bằng chứng "mở được, không tắt TV" (`.115`, 13/10/2026)

```powershell
& $adb -s 10.193.44.115:5555 shell "monkey -p net.fptplay.ottbox -c android.intent.category.LEANBACK_LAUNCHER 1"
Start-Sleep 12
& $adb -s 10.193.44.115:5555 shell "dumpsys window | grep mCurrentFocus ; ps -A | grep -i fpt"
```

```
mCurrentFocus=Window{7b543cc u0 net.fptplay.ottbox/com.tear.modules.tv.welcome.WelcomeActivity}
u0_a32  31605  3244  1699520  273176  S  net.fptplay.ottbox
```

Ảnh `screencap` (1920×1080) cho thấy màn hình **"Đăng nhập FPT Play"** với 2 nút *Đăng nhập ngay* /
*Để sau* — app vẽ UI bình thường, TV **không** tự tắt.

## 6. Việc còn lại / chặn

1. **`.110` — cài lại FPT Play + TV360 + MeetFlow AI:** cần chủ dự án **bật TV và bật ADB debugging**
   (Settings → Giới thiệu → bấm build 7 lần → ADB). Khi có `adb connect` được thì cài lại trong ~2 phút.
2. **`.110` — "bật FPT Play là TV tự tắt":** gần như chắc chắn **không phải lỗi phiên bản APK** (đang
   có đúng bản mới nhất `7.34.13`). Cần bắt log ngay lúc tắt:
   ```powershell
   & $adb -s <ip>:5555 logcat -c
   # ... bam mo FPT Play tren TV ...
   & $adb -s <ip>:5555 logcat -d > "C:\Users\Minhn\Downloads\fpt110-crash.log"
   ```
   Rồi soi `AndroidRuntime`/`FATAL`/`Watchdog`/`WVCdm`. Giả thuyết cần loại trừ: (a) ROM PatchWall tự
   tắt khi app "không hợp quy" (đã có tiền lệ `删除不合规应用` với Netflix — xem
   `NETFLIX_XIAOMI_TV_2026-09-29.md` §2), (b) Widevine/DRM làm sập, (c) TV vào chế độ ngủ do không
   có input.
3. **`.110` — Play Store chưa mở được:** GSF/GMS/Play Store/YouTube TV đã cài nhưng chưa kiểm chứng
   mở được (TV offline giữa lúc test).
4. **`.112` — ADB đang đóng:** muốn cập nhật gì trên `.112` phải bật lại ADB debugging trên TV.
5. **TV360** (`com.tv360.smarttv`): XAPK đã sẵn sàng, **chưa cài được** vì đích là `.110` đang tắt.

## 7. Liên quan

- `ANDROID_TV_XIAOMI_2026-09-28.md` — 2 lỗi chặn của app VPNFlow TV + trạng thái từng TV.
- `NETFLIX_XIAOMI_TV_2026-09-29.md` — vì sao ROM nội địa chặn app theo chứng nhận thiết bị.
- APK không publish lên web; giữ cục bộ trong `C:\Users\Minhn\Downloads\` (không phải đường tải công khai).
