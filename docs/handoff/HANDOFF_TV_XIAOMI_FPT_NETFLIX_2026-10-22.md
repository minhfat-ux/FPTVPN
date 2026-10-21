# HANDOFF — Xiaomi TV (MiTV-AFZP0): FPT Play chạy được, dọn RAM, watchdog app, gateway fallback

- **Ngày:** 22/10/2026 · **Người đo:** harness macOS (`192.168.100.5`) qua ADB Wi-Fi
- **TV:** MiTV-AFZP0 (`moderntimes`), Android 14 / SDK 34, **armeabi-v7a (32-bit)**,
  Amlogic `txhd2`, **1 GB RAM**, **`CONFIG_TUN is not set`**, không root, **không GMS/Play Store**
- **Liên quan:** `HANDOFF_WINDOWS_FPT_PLAY_TV_PROXY_2026-10-22.md` (cơ chế proxy mode)

> Mục đích: harness Windows nắm toàn bộ trạng thái + lệnh đã dùng trên TV này, để
> không phải dò lại và để giữ cho đường gateway `192.168.100.11:18081` tương thích.

---

## 1. Kết quả chính

| Hạng mục | Trạng thái |
|---|---|
| FPT Play trên TV | **Phát được** (720p ổn định, có lúc 1080p), qua proxy nội bộ TV |
| Vì sao trước đó không chạy | IP ra China Mobile AS9808 → FPT chặn vùng |
| Gateway laptop Windows | **Chạy được cho FPT khi dùng Flow1/Flow2** (Flow3 bị chặn) |
| App VPNFlow trên TV | Bị Xiaomi TV Manager disable liên tục → đã disable TV Manager |
| Proxy bị xoá định kỳ | Keepalive VPNFlow xoá `127.0.0.1:1081` vài phút/lần → watchdog app giữ lại |
| RAM | Đã tắt app rác + gỡ Netflix; ~440 MB available (tổng 1 GB) |
| Netflix | Research xong; đang thử hướng Kodi + addon (Widevine **L1** có sẵn) |

## 2. FPT Play — cơ chế đang dùng

```
FPT Play → system proxy 127.0.0.1:1081 (HTTP CONNECT trong app VPNFlow trên TV)
        → hysteria2/wsrelay → Flow1 Hà Nội 103.173.155.50 → FPT CDN
```

- App: `com.privatevpn.app.tv.dev` bản `1.4.5-tv-dev` (transport `http1081`, không cần TUN).
- Bằng chứng logcat: `VPNFLOW_DIAG: tunnel: UP (http1081)` /
  `proxy: HTTP proxy (CONNECT) sẵn sàng 127.0.0.1:1081 (proxy hệ thống=đã đặt)`.
- FPT Play `net.fptplay.ottbox` (media3 1.10.1) **tôn trọng system proxy** cho cả API và
  DRM license; sai proxy → `Firestore ... ECONNREFUSED`, đúng proxy → catalog + video.

### Số đo (22/10/2026)

| Đường | Băng thông | Ghi chú |
|---|---|---|
| TV local proxy (VPNFlow) | ~1.0–1.8 Mbps | đủ 720p, thỉnh thoảng 1080p |
| Mac relay `/relay/vn1hy` (Flow1) | **7.1 Mbps** | CPU khoẻ |
| Mac relay `/relay/vn2hy` (Flow2) | 3.7 Mbps | |
| Windows gateway (Flow3) | 0.6–1.5 Mbps + **FPT chặn** | không dùng cho FPT |
| Windows gateway (Flow2, sau khi đổi) | ~1.6 Mbps | FPT Play load content OK |

Độ phân giải quan sát qua ExoPlayer `videoSize`: 640×360 → 1280×720 → (có lúc) 1920×1080.

## 3. Vấn đề TV & cách xử lý (QUAN TRỌNG)

### 3.1 Xiaomi TV Manager tự disable app

- Triệu chứng: `dumpsys package com.privatevpn.app.tv.dev` → `enabled=3` (disabled-user),
  app biến mất khỏi launcher; log `ActivityManager: Force stopping ... from pid <khác>`.
- Xử lý: `adb shell pm disable-user --user 0 com.xiaomi.mitv.tvmanager`
- Bật lại khi cần cài APK qua USB: `adb shell pm enable com.xiaomi.mitv.tvmanager`
- Đã disable sẵn từ trước: `com.xiaomi.mi_connect_service`, `com.xiaomi.hyper_connect.tv`

### 3.2 VPNFlow keepalive xoá system proxy

- Log: `VPNFLOW_DIAG: keepalive: đã dọn proxy hệ thống còn sót (127.0.0.1:1081)`
  (quan sát các mốc 01:52:50, 01:56:21, 01:58:44 — vài phút/lần).
- Hệ quả: FPT Play báo `RD_002` / `RD_003` "Đã xảy ra sự cố khi kết nối FPT Play".
- Xử lý: **app watchdog riêng** (mục 4).

### 3.3 Dọn RAM (TV 1 GB)

Đã tắt (`pm disable-user`):

```
com.cibn.tv                              # CIBN酷喵
com.ktcp.video                           # 云视听极光
com.mitv.shoplugin
com.xiaomi.gamecenter.sdk.service.mibox
com.xiaomi.mitv.debug
com.xiaomi.mitv.tvmanager
```

Đã gỡ cho user 0 (`pm uninstall -k --user 0`, cài lại bằng `pm install-existing`):

```
com.netflix.ninja
com.netflix.partner.activation
```

RAM sau dọn: `MemAvailable ≈ 440 MB` (trước ~450 MB nhưng ít app nền/đánh thức hơn).
Lưu ý: LMK vẫn có thể dọn process khi TV căng RAM — đó là lý do watchdog cần alarm.

## 4. Watchdog app (`com.tvflow.watchdog`)

APK: `TVFlowWatchdog-1.0.apk` (16 KB) — tách khỏi launcher.

### Logic

1. Health check **HTTP thật** qua proxy (CONNECT `connectivitycheck.gstatic.com:443`
   → chờ `200`), không chỉ kiểm tra cổng mở.
2. Thứ tự upstream: `127.0.0.1:1081` (TV) → `192.168.100.11:18081` (Windows) →
   `192.168.100.5:18081` (Mac).
3. Không upstream nào sống → fail-open `:0` (giữ Internet trực tiếp).
4. Chu kỳ 5s; TV proxy hỏng 2 lần liên tiếp mới coi là chết (tránh flap).
5. Exact alarm **30s** + `BOOT_COMPLETED` để tự bật lại nếu bị hệ thống dọn.

### Cài đặt (cần ADB, 1 lần)

```bash
adb install -r TVFlowWatchdog-1.0.apk
adb shell pm grant com.tvflow.watchdog android.permission.WRITE_SECURE_SETTINGS
adb shell appops set com.tvflow.watchdog SCHEDULE_EXACT_ALARM allow
adb shell cmd deviceidle whitelist +com.tvflow.watchdog
adb shell am set-standby-bucket com.tvflow.watchdog 10
adb shell am set-inactive com.tvflow.watchdog false
adb shell am start -n com.tvflow.watchdog/.MainActivity
```

Quyền `WRITE_SECURE_SETTINGS` **chỉ cấp được qua ADB** (không qua UI).

### Đã kiểm chứng

| Test | Kết quả |
|---|---|
| Tắt VPNFlow (TV proxy chết) | proxy → `192.168.100.11:18081` trong ~3s |
| Bật lại VPNFlow | proxy → `127.0.0.1:1081` trong ~5s |
| `am kill com.tvflow.watchdog` | exact alarm bật lại sau ~50s (`alarm -> restart service`) |
| Không upstream nào sống | clear proxy sau 4 lần lỗi liên tiếp (~20s) |

## 4B. Chọn đường ra trong app VPNFlow (versionCode 80) — đã test

App TV bản mới (`1.4.5-tv-dev`, versionCode 80) có mục **Settings → Exit path** với 3 lựa chọn,
tự ghi `settings put global http_proxy` (ProxyDirector, kiểm cổng TCP thật 700 ms):

| Chế độ | Kỳ vọng | Đo thực tế 22/10/2026 |
|---|---|---|
| `TV tunnel only` | luôn `127.0.0.1:1081` | ✅ `127.0.0.1:1081` |
| `LAN gateway only` | luôn `192.168.100.11:18081` | ✅ `192.168.100.11:18081` |
| `Automatic (TV first)` | TV sống → TV; TV chết → gateway | ✅ TV sống → `127.0.0.1:1081` |

**Auto fallback đo được** (chế độ Automatic, force-stop rồi mở lại app):

```
+3s   proxy = 192.168.100.11:18081   (tunnel TV chưa lên → rơi xuống gateway)
+6..18s proxy = :0                   (khoảng trống khi tunnel đang dựng)
+21s  proxy = 127.0.0.1:1081         (tunnel lên → quay về TV, giữ ổn định)
```

Log xác nhận 2 chiều:
`tuyến: proxy hệ thống 127.0.0.1:1081 -> 192.168.100.11:18081 (chế độ auto)` và ngược lại
`192.168.100.11:18081 -> 127.0.0.1:1081 (chế độ auto)`.

FPT Play qua **LAN gateway only**: content load nhanh, chất lượng ổn (chủ dự án xác nhận).

> **Quan trọng:** chỉ nên có MỘT nơi ghi `http_proxy`. App đã có ProxyDirector thì **tắt**
> app watchdog riêng (`com.tvflow.watchdog`, đã `pm disable-user`) để tránh 2 bên giành nhau
> (watchdog luôn ưu tiên TV sẽ phá chế độ `gateway`).

## 4C. Launcher TVFlow Home v1.3 — sửa 2 lỗi

- **App cài sau không hiện** (VPNFlow vừa cài không có trong hàng ỨNG DỤNG): nguyên nhân danh
  sách chỉ dựng lúc `onCreate`. Sửa: `buildAppRow()` + `buildShortcutRow()` được gọi lại trong
  `onResume()`.
- **Trùng "Settings"**: hàng ỨNG DỤNG có app Settings của hệ thống, cộng thêm card shortcut
  "Cài đặt" trùng. Sửa: bỏ shortcut Settings + dedupe theo label (`Set<String>` lowercase).
  Kết quả: 1 Settings duy nhất, VPNFlow hiện đúng.

## 5. Gateway laptop Windows — yêu cầu tương thích

- Phải bind `0.0.0.0:18081` (không chỉ 127.0.0.1) và firewall cho phép LAN.
- Phải hỗ trợ **CONNECT** (watchdog health check + FPT HTTPS).
- Node phải là **Flow1 hoặc Flow2**; **Flow3 `103.6.235.39` (AS152992) bị FPT Play chặn**:
  - Flow1: `103.173.155.50:8443` + `wss://api.meetflowai.site/relay/vn1hy`
  - Flow2: `165.101.114.162:8443` + `wss://api.meetflowai.site/relay/vn2hy`
- Tool cầu nối: `tools/http-socks-bridge` (đã fix bug đọc header SOCKS5 reply
  `VER REP RSV ATYP` — bản cũ đọc lệch byte nên CONNECT luôn fail).
- Đo thực tế gateway Windows (Flow2) từ TV: ~1.6 Mbps → đủ 720p.

## 6. Netflix — research & hướng đang thử

### Đo trên TV (APK `DrmProbe`)

```
widevine_supported=true
securityLevel=L1        ← đủ khả năng HD (thậm chí 4K)
vendor=Google
version=18.0.0
deviceUniqueId=f04d8217c140572737fb49eb1a8a52b80cc1e8bf5bf85e1a5b2de94f91b704ab
```

### Vì sao app Netflix fail

- Netflix yêu cầu **chứng nhận thiết bị (ESN)**; Xiaomi TV bản nội địa không có
  (không bán Netflix tại TQ) → app cài được nhưng báo "thiết bị không tương thích".
- Không có GMS/Play Store (một số bản Netflix còn đòi Play Services).

### Hướng khả thi

| Hướng | Khả năng | Chất lượng | Ghi chú |
|---|---|---|---|
| **Kodi + `plugin.video.netflix`** | đang thử | 1080p (addon cap) | Kodi 21.3 `armeabi-v7a` có sẵn; addon v1.23.5 |
| Netflix mobile APK | thấp | 480p | UI cảm ứng, thường đòi GMS |
| Box chứng nhận | chắc chắn | 4K/HDR | Fire TV / Mi Box quốc tế / Apple TV |
| Laptop → HDMI | chắc chắn | theo laptop | dự phòng |

### Trạng thái Kodi (đã cài xong, đang ở bước đăng nhập)

Đã làm và kiểm chứng:

1. **Trỏ data Kodi ra thư mục ghi được** (Kodi không cho adb ghi vào
   `/sdcard/Android/data/org.xbmc.kodi/...`):
   ```
   echo "xbmc.data=/sdcard/kodidata" > /sdcard/xbmc_env.properties
   ```
   Kodi log xác nhận: `special://home/ is mapped to: /sdcard/kodidata/.kodi`.
2. **Proxy cho Kodi** (Kodi không dùng system proxy của Android): đặt
   `/sdcard/kodidata/.kodi/userdata/advancedsettings.xml`:
   ```xml
   <advancedsettings>
     <network>
       <usehttpproxy>true</usehttpproxy>
       <httpproxytype>0</httpproxytype>
       <httpproxyserver>192.168.100.11</httpproxyserver>
       <httpproxyport>18081</httpproxyport>
     </network>
   </advancedsettings>
   ```
   Log xác nhận `Loaded settings file from special://profile/advancedsettings.xml`
   và in ra đúng proxy.
3. **Cài addon offline** (Kodi UI không cần dùng): tải zip từ Kodi mirror rồi giải nén
   vào `/sdcard/kodidata/.kodi/addons/`:
   - `plugin.video.netflix-1.23.5+matrix.1.zip`
   - `inputstream.adaptive` bản `android-armv7` (`kodi.binary.instance.inputstream 3.3.0`
     đã có sẵn trong Kodi)
   - `script.module.inputstreamhelper 0.8.6`, `script.module.requests 2.31.0`,
     `script.module.addon.signals 0.0.6+matrix.1`, `script.module.idna 3.10.0`,
     `script.module.urllib3 2.2.3`, `script.module.certifi 2023.5.7`,
     `script.module.chardet 5.1.0`, `script.module.myconnpy 8.0.33`
     (myconnpy lấy từ repo `matrix`, không có trong `omega`)
   - `script.module.pycryptodome` đã có sẵn trong Kodi 21
   - requests 2.31 cần `charset_normalizer` (không có addon Kodi) → chép package
     PyPI `charset_normalizer` vào `script.module.requests/lib/`
4. **Bật webserver + JSON-RPC** (để điều khiển từ xa, không cần remote):
   sửa `/sdcard/kodidata/.kodi/userdata/guisettings.xml`:
   `services.webserver=true`, `services.webserverport=8080`,
   `services.webserverusername=kodi`, `services.webserverpassword=kodi`.
   Kiểm chứng: `curl -u kodi:kodi -X POST http://<TV>:8080/jsonrpc ...` trả OK.
   Dùng được: `Addons.SetAddonEnabled`, `Addons.ExecuteAddon`, `Input.Select`,
   `Input.SendText`, `XBMC.GetInfoLabels`.
5. **Kết quả**: addon load OK (`plugin.video.netflix v1.23.5+matrix.1 installed`),
   khi chạy đã tới `MediaDrm: starting provisioning` (Widevine L1 được dùng),
   và mở được dialog đăng nhập (`System.CurrentWindow = Yes / No dialog`,
   `Container.FolderPath = plugin://plugin.video.netflix/`).

### Kết quả thử đăng nhập Netflix (22/10/2026) — BỊ CHẶN

Đã làm đủ các bước:

1. Patch addon để Python `requests` dùng proxy LAN (addon không đọc proxy của Kodi):
   `resources/lib/services/nfsession/session/base.py` → `self.session.proxies.update({...192.168.100.11:18081})`.
2. Lấy cookie Netflix bằng Chrome trên Mac (profile `/tmp/nfchrome`, proxy VN) qua CDP.
3. Sinh `NFAuthentication.Key` + PIN (AES-CBC, PIN lặp 4 lần — đúng thuật toán của
   `NFAuthenticationKey.py`), đẩy lên `/sdcard/Download/`.
4. Login addon tự động qua Kodi JSON-RPC: Yes/No → file browser → chọn key → PIN → password.

**Kết quả: thất bại ở bước xác thực mật khẩu**
`POST https://www.netflix.com/api/shakti/mre/profilehub` → **404 BLOCKED**.

Kiểm chứng thêm:
- Gọi cùng endpoint từ **chính Chrome đã đăng nhập** (qua CDP `fetch`) → cũng `404 BLOCKED`.
- Chrome bị Netflix đẩy sang `/vn/LoginHelp` kèm **reCAPTCHA enterprise** ⇒ phiên đăng nhập
  thực tế **không thành công** (cookie chỉ là phiên ẩn danh; `/browse` trả 200 nhưng là trang
  login-help).
- Nghi nguyên nhân: IP exit là **VPS/datacenter** (Flow1/Flow2/Windows gateway) → Netflix
  không cho đăng nhập/không cấp session hợp lệ, bất kể addon hay browser.

### Trạng thái cuối (22/10/2026)

- **Kodi đã gỡ** khỏi TV (`adb uninstall org.xbmc.kodi`) cùng dữ liệu
  (`/sdcard/kodidata`, `/sdcard/xbmc_env.properties`) — Netflix bị chặn nên không giữ.
  Artifact cài đặt vẫn nằm trong workspace `netflix/` nếu cần thử lại khi có IP dân cư.
- FPT Play: main trên TV (`127.0.0.1:1081`), watchdog app đang chạy.
- RAM khả dụng sau khi gỡ Kodi: ~445 MB.

### Khuyến nghị cho Netflix

| Cách | Khả thi | Ghi chú |
|---|---|---|
| **Box chứng nhận** (Fire TV Stick 4K / Mi Box S quốc tế / Google TV / Apple TV) | ✅ chắc chắn | Cách chuẩn, 4K/HDR |
| **Laptop → HDMI** | ✅ ngay | Không cần thiết bị mới |
| Kodi + addon Netflix | ❌ với IP datacenter | Cần **IP dân cư Việt Nam** để qua reCAPTCHA/login; sau đó mới tạo được AuthKey |
| App Netflix trên TV | ❌ | Xiaomi TV nội địa không có chứng nhận ESN |

Nếu sau này có line dân cư VN (không phải VPS): đăng nhập netflix.com trong Chrome →
chạy `/Volumes/BIWIN/IoSApps/FacebookLack/netflix/nf_grab.py` (sinh key + PIN) → login addon
bằng JSON-RPC (script `/tmp/kodi_login.py`).

### Dọn dẹp bảo mật

- Xoá `NFAuthentication.Key` khỏi TV (`/sdcard/Download/`, `/sdcard/kodidata/.kodi/`) sau khi test.
- Key chứa cookie phiên Netflix; không commit/lưu lâu.
- Chrome profile `/tmp/nfchrome` chứa cookie — xoá khi không cần.

## 7. Bộ cài & artifact

`/Volumes/BIWIN/XiaoMiLauncher/`

| File | Nội dung |
|---|---|
| `TVFlowHome-1.2.apk` | Launcher (sắp xếp app A→Z/Z→A/Tự chọn; đã tách watchdog) |
| `TVFlowWatchdog-1.0.apk` | Watchdog app (mục 4) |
| `WATCHDOG-README.txt` | Lệnh cấp quyền ADB |
| `TVFlowHome-XiaomiTV-v1.2-USB.zip` | Gói USB: 2 APK + hướng dẫn + SHA-256 |
| `USB-Cai-Dat/` | Bản lẻ để chép USB |

Artifact khác (workspace): `bin/flowvpnrelay-darwin-arm64`, `bin/http-socks-bridge`,
`drmprobe/DrmProbe.apk`, `netflix/kodi-21.3-armeabi-v7a.apk`,
`netflix/plugin.video.netflix-1.23.5.zip`.

## 8. Checklist tái lập nhanh

```bash
adb connect <TV>:5555
# 1) chặn TV Manager disable app
adb shell pm disable-user --user 0 com.xiaomi.mitv.tvmanager
# 2) dọn app rác
for p in com.cibn.tv com.ktcp.video com.mitv.shoplugin \
         com.xiaomi.gamecenter.sdk.service.mibox com.xiaomi.mitv.debug; do
  adb shell pm disable-user --user 0 $p
done
# 3) cài watchdog + quyền
adb install -r TVFlowWatchdog-1.0.apk
adb shell pm grant com.tvflow.watchdog android.permission.WRITE_SECURE_SETTINGS
adb shell appops set com.tvflow.watchdog SCHEDULE_EXACT_ALARM allow
adb shell cmd deviceidle whitelist +com.tvflow.watchdog
adb shell am set-standby-bucket com.tvflow.watchdog 10
adb shell am start -n com.tvflow.watchdog/.MainActivity
# 4) kiểm tra
adb shell settings get global http_proxy        # -> 127.0.0.1:1081
adb shell dumpsys media_session | grep PlaybackState
adb logcat -s TVFlowWatchdog VPNFLOW_DIAG
```
