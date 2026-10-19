# T-20261020-01 — TV MiTV-AFZP0: bấm Connect → "reconnecting" → app tắt

> Nguồn việc: chủ dự án báo **trực tiếp** (chat, 20/10/2026 ~00:17 +08):
> *"kiểm tra cho anh con TV hiện tại đang bị lỗi, bấm connect, reconnecting xong tắt app"*.
> Máy làm: **WIN** (`DESKTOP-852P1LT`) · Ngày: 20/10/2026 · Thiết bị: **`192.168.100.105:5555`** (ADB trong LAN).
>
> ## KẾT LUẬN NGẮN
> **Đây KHÔNG phải lỗi mạng, không phải lỗi tài khoản, và cũng KHÔNG phải bản cài "cũ" đơn thuần.**
> **Kernel của chính con TV này KHÔNG có TUN** (`# CONFIG_TUN is not set`, không có `/dev/tun`) ⇒
> `VpnService.Builder.establish()` **không thể tạo interface VPN** ⇒ app lặp "reconnecting";
> rồi trên Android 14 nó **chết vì `fdsan`** (đóng 2 lần một fd đã thuộc native) ⇒ **app tự tắt**.
>
> Fix đang được dựng trong repo (chưa commit): **chế độ SOCKS5 + proxy hệ thống cho máy không có TUN**.
> Bản đang phát `v38 / 1.4.6-tv` **chưa có** fix này (đã kiểm trong dex) ⇒ cài v38 vẫn lỗi y hệt.

---

## 1. Thiết bị

```
$ adb -s 192.168.100.105:5555 shell getprop ro.product.model   → MiTV-AFZP0
                                              ro.product.brand → Xiaomi
                                              ro.build.version.release → 14  (sdk 34)
                                              ro.build.display.id → UD2A.240505.001.W1.OS3.0.8.0.UFZAATV
app (báo cáo trên máy): xiaomi MiTV-AFZP0 · isTv=true, touch=false · abi=armeabi-v7a,armeabi
                        ram còn 370 MB / tổng 975 MB
```

## 2. NGUYÊN NHÂN GỐC #1 — TV không có TUN (quyết định)

```
$ adb shell ls -l /dev/tun*
ls: /dev/tun*: No such file or directory

$ adb shell "zcat /proc/config.gz | grep -i CONFIG_TUN"
# CONFIG_TUN is not set
# CONFIG_TUN_VNET_CROSS_LE is not set

$ adb shell "cat /proc/misc | grep -i tun"      → (rỗng)
$ adb shell "ls /sys/module | grep -i tun"      → (rỗng)
```

⇒ Máy **không có driver TUN**, nên **mọi app VPN kiểu VpnService (kể cả WireGuard/OpenVPN)** đều
không dựng được tunnel full-device trên model này. Đây là giới hạn **kernel/ROM**, không sửa được bằng code app.

Hệ quả trong app (log của chính app, kéo từ `/sdcard/Android/data/…/files/diagnostics.log`):

```
10-20 00:16:30.177 I hy-tcp:8443 socket protect=true local=/192.168.100.105:33821 remote=/103.173.155.50:8443
10-20 00:16:31.509 I cn-bypass: 67 app TQ đi ĐƯỜNG RIÊNG (không qua VPN), 0 gói không có trên máy
10-20 00:16:31.543 W transport ended on its own (hy-tcp:8443 serve() threw: Cannot create interface) -> reconnecting
10-20 00:16:31.551 W tunnel: reconnecting / not serving
```

- Kết nối **tới relay thành công** (`tcp-relay:8443 protect=true`, TCP tới `103.173.155.50:8443` OK) — mạng và server **bình thường**.
- Chết ở bước dựng TUN: `establish()` ném `IllegalStateException("Cannot create interface")`
  (system_server: `VpnJni: Cannot allocate TUN`).
- Vòng lặp tiếp tục ⇒ giao diện hiện **"reconnecting"** đúng như chủ dự án thấy.

## 3. NGUYÊN NHÂN GỐC #2 — app TẮT vì `fdsan` (Android 14 chặn đóng fd 2 lần)

```
$ adb shell logcat -b crash -d
10-20 00:10:19.518 F libc : fdsan: attempted to close file descriptor 103, expected to be unowned, actually owned by unique_fd 0xa67bf698
10-20 00:10:19.519 F libc : Fatal signal 6 (SIGABRT), code -1 (SI_QUEUE) in tid 9150 (Thread-11), pid 9043 (evpn.app.tv.dev)
10-20 00:10:21.281 F DEBUG: Cmdline: com.privatevpn.app.tv.dev
10-20 00:10:21.281 F DEBUG: Abort message: 'fdsan: attempted to close file descriptor 103, expected to be unowned, actually owned by unique_fd 0xa67bf698'
10-20 00:10:21.287 F DEBUG: #59 … HysteriaVpnService.tcpRelayAttempt+0
10-20 00:10:21.287 F DEBUG: #65 … HysteriaVpnService.preferredAttempt+0
10-20 00:10:21.287 F DEBUG: #71 … HysteriaVpnService.oneConnectPass+0
```

4 lần chết trong 8 phút: `00:09:29`, `00:10:19`, `00:12:18`, `00:16:33` (mỗi lần bấm Connect).
Nguyên nhân code: `ParcelFileDescriptor.fromSocket(sock).detachFd()` (và `fromDatagramSocket`) **chia sẻ
cùng fd** với `java.net.Socket`; fd đó được đưa cho native (thuộc `unique_fd`), rồi Java
`runCatching { sock.close() }` đóng lại **cùng fd số** ⇒ Android 14 abort process. Trên Android 9 thì
`fdsan` không chặn nên các TV cũ không lộ lỗi này.

## 4. Vì sao lại là bản v36?

```
$ adb shell dumpsys package com.privatevpn.app.tv.dev
    versionCode=36  versionName=1.4.3-tv-dev   flags=[ DEBUGGABLE … ]
    firstInstallTime=2026-10-20 00:03:21
```

- TV đang chạy **bản DEBUG cũ v36** (`com.privatevpn.app.tv.dev`) — APK nguồn là
  `vpnflow-android-142\tools\VPNFlow-tv-v36.apk` (sha256 `cc03504e…`, copy vào máy lúc **00:02:49** hôm nay).
- **v36 không có** xử lý "máy không có TUN" (mã `establish()` của v36 chỉ gọi `builder.establish()` trơn).
- Gói **release** `com.privatevpn.app.tv` (v38) trước đó **không còn** trên TV (đã bị gỡ).

## 5. Đã làm trong phiên này

1. Cài lại **bản phát hành chính thức v38 / `1.4.6-tv`** cho TV:
   `adb install -r tv38-check.apk` → `Success`; APK sha256 **`191f8f9529ed41c7dbc4e613b4c294db3a2b12f4ba8d82321938e21a822f8830`**
   (khớp tuyệt đối với artifact trên kênh phát và với `GET /v1/app-version?platform=android-tv` →
   `latest_version = 1.4.6-tv`, `apk_url …/VPNFlow-tv-latest.apk?v=191f8f95`).
2. App v38 **chạy được** (pid sống, `mCurrentFocus = com.privatevpn.app.tv/…MainActivity`), hiện **màn đăng nhập**
   (Email + Send Code) — vì gói release bị gỡ trước đó nên mất phiên đăng nhập.
3. **Nhưng v38 KHÔNG sửa được lỗi này**: quét `classes.dex` của APK v38 **không có** chuỗi/mã chế độ SOCKS5
   ⇒ vẫn gọi `establish()` và vẫn lỗi y hệt sau khi đăng nhập.
4. Thử cấp quyền cần cho chế độ proxy: `pm grant … WRITE_SECURE_SETTINGS` → **bị từ chối** vì APK v38
   **chưa khai** quyền này (bản fix đang thêm vào `AndroidManifest.xml`).

## 6. Fix đang được dựng (chưa commit) — cần build + cài mới

Trong cây làm việc `FPTVPN` (đang sửa, **chưa commit**):

| File | Nội dung |
|---|---|
| `android/…/vpn/HysteriaVpnService.kt` | thêm `noTunDevice` + `proxyAttempt()`: máy không có TUN ⇒ mở cầu WS → bắt tay hysteria → **mở SOCKS5 `127.0.0.1:1081`** → đặt **proxy hệ thống** (`Settings.Global http_proxy`) ; sửa thêm việc mở N cầu WS song song (cầu #0 timeout 443 trên đúng TV này) |
| `android/…/AndroidManifest.xml` | + `WRITE_SECURE_SETTINGS` (để đặt proxy hệ thống; cấp thêm bằng `adb shell pm grant`) |
| `tools/hysteria-android/mobile.go` + `libs/hysteria.aar` | thêm `ServeSocks(listen)` — mở SOCKS5 trên chính tunnel hysteria (chế độ "cho thiết bị KHÔNG có TUN") |

**Giới hạn phải nói rõ với chủ dự án:** không có TUN thì **không thể** full-tunnel. Chế độ SOCKS5 chỉ
đi qua được với **app tôn trọng proxy hệ thống** (trình duyệt, FPT Play, SmartTube…); app tự mở socket
(Netflix, một số app DRM) **sẽ không** qua VPN. Muốn full-tunnel phải dùng TV/box có kernel bật TUN
(như 2 TV cũ `10.193.44.110`/`.112` đã chạy được v36).

## 7. Việc tiếp theo (đề xuất)

1. Build bản có chế độ SOCKS5 (v39+), cài lên `192.168.100.105`.
2. `adb shell pm grant com.privatevpn.app.tv android.permission.WRITE_SECURE_SETTINGS`
   (và bản `.dev` nếu test bản debug) — nếu thiếu, proxy hệ thống không đặt được.
3. Đăng nhập trên TV → bấm Connect → kiểm `diagnostics.log` phải có
   `vpn: máy KHÔNG có TUN -> chuyển chế độ SOCKS5 nội bộ` + `proxy: SOCKS5 sẵn sàng 127.0.0.1:1081`.
4. **Không** nên để bản debug v36 trên TV nữa (gây nhiễu + crash); gỡ `com.privatevpn.app.tv.dev`
   sau khi bản fix chạy được.

## 8. Bằng chứng (chạy lại được)

```powershell
$adb = "C:\Users\Minhn\Android\sdk\platform-tools\adb.exe"; $d = "192.168.100.105:5555"

# 1) TV có TUN không?  (đây là mấu chốt)
& $adb -s $d shell "ls -l /dev/tun*; zcat /proc/config.gz | grep -i CONFIG_TUN"
#   -> No such file / '# CONFIG_TUN is not set'

# 2) Vì sao app tắt
& $adb -s $d shell "logcat -b crash -d -t 400" | Select-String "fdsan|Abort message|HysteriaVpnService"
#   -> 'fdsan: attempted to close file descriptor …' + SIGABRT trong HysteriaVpnService.tcpRelayAttempt

# 3) Log của chính app (nguyên nhân 'reconnecting')
& $adb -s $d pull /sdcard/Android/data/com.privatevpn.app.tv.dev/files/diagnostics.log .
#   -> 'serve() threw: Cannot create interface' sau khi TCP tới relay ĐÃ thành công

# 4) Bản đang cài + bản vừa cài
& $adb -s $d shell "dumpsys package com.privatevpn.app.tv.dev | grep -E 'versionName|firstInstallTime'"
& $adb -s $d shell "dumpsys package com.privatevpn.app.tv   | grep -E 'versionName|versionCode'"
#   -> .tv.dev = 1.4.3-tv-dev / 36 (cài 00:03:21)   ·   .tv = 1.4.6-tv / 38 (vừa cài)

# 5) Kênh phát đang nói gì
node -e "fetch('https://api.meetflowai.site/v1/app-version?platform=android-tv').then(r=>r.text()).then(console.log)"
#   -> {"platform":"android-tv","minimum_version":"1.2.6","latest_version":"1.4.6-tv", … "?v=191f8f95"}
```

Ảnh/khối log gốc đã kéo về: `ops/_scratch/_tv105/` (`diagnostics.log`, `vpnflow-report.txt`, `ui.xml`).
