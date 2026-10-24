# Bộ cài đầy đủ cho TV Xiaomi (MiTV-AFZP0) — "cài cho TV" = cài HẾT 4 app dưới đây

> Ghi nhớ vận hành: khi chủ dự án nói **"cài cho TV …"** (TV Xiaomi/MiTV), hiểu là cài **toàn bộ
> bộ app TVFlow** bên dưới, không chỉ một app lẻ. Chỉ cần `bash tools/tv-kit/install.sh <IP_TV>`.

## Bộ app (bản chốt 24/10/2026)

| # | App | APK | versionCode | SHA-256 |
|---|---|---|---|---|
| 1 | **TVFlow Home** (launcher, HOME nhanh, proxy nội bộ `127.0.0.1:18081`) | `TVFlowHome-2.8.apk` | 19 (2.8) | `864bfce0a8f7fb8090519807aef8643cef4af7ecc8e9216dca4f64a01b30a6f8` |
| 2 | **VPNFlow Guard** (giữ `http_proxy` bám gateway sống, probe YouTube/FPT, failover ~20 s) | `VPNFlowGuard-1.6.apk` | 7 (1.6) | `625342b13d8fdb1643ced328ffbd4bbcee6e95704139e218a17c8aec10aef178` |
| 3 | **VPNFlow TV** (app VPN, chế độ gateway LAN) | `VPNFlow-TV-1.4.5.apk` | 100 | `4454861d501e5fb8bdb2a7837b0f4f0ee38cf4af935d9ee31046737b4a782810` |
| 4 | **FPT Tubeflow** (YouTube không quảng cáo, đổi thương hiệu) | `FPTTubeflow-2.2.apk` | 9013 (2.2) | `51bd0e11387ce4fb9775a36075e13b123d179d97636558bba842a0904ee46c5f` |

Nguồn APK: `/Volumes/BIWIN/XiaoMiLauncher/` và bộ zip `FPT-Tubeflow-kit.zip` (cùng thư mục).

## Cài (1 lệnh)

```bash
bash tools/tv-kit/install.sh 192.168.100.104                  # gateway mặc định 192.168.100.5:18081
bash tools/tv-kit/install.sh 192.168.100.104 192.168.100.6:18081
# Windows:
powershell -ExecutionPolicy Bypass -File tools/tv-kit/install.ps1 -TvIp 192.168.100.104 -Gateway 192.168.100.5:18081
```

Script làm (theo đúng thứ tự):
1. `adb connect <IP>:5555`, kiểm tra thiết bị.
2. Gỡ **SmartTube gốc** `org.smarttube.stable` (FPT Tubeflow khác chữ ký nên bắt buộc gỡ).
3. Cài 4 APK (`install -r -d`).
4. Cấp quyền: `WRITE_SECURE_SETTINGS` (launcher + guard), `SYSTEM_ALERT_WINDOW`, `GET_USAGE_STATS` (launcher).
5. Bật accessibility `com.tvflow.launcher/com.tvflow.launcher.HomeWatcherService` (HOME nhanh).
6. `settings put global http_proxy <gateway>`.
7. Khởi động launcher + guard (broadcast TICK) + mở FPT Tubeflow.
8. In version 3 app + proxy để nghiệm thu.

## Điều kiện môi trường (bắt buộc)

- TV bật **ADB debugging**, cùng LAN với máy tính.
- Có **gateway VN sống** trong LAN: Mac `192.168.100.6:18081` hoặc Windows `192.168.100.5:18081`
  (hoặc gateway khác, truyền qua tham số thứ 2). Kiểm tra:
  `curl -x http://<gw> https://connectivitycheck.gstatic.com/generate_204` → `204`.
- TV Xiaomi không có `/dev/net/tun` (kernel `CONFIG_TUN is not set`) ⇒ **không VPN toàn máy được**;
  mọi app phải đi qua `http_proxy`. Vì vậy guard/VPNFlow là phần không thể thiếu.

## Nghiệm thu sau cài

```bash
adb -s <IP>:5555 shell 'dumpsys package com.tvflow.launcher | grep -m1 versionName'   # 2.8
adb -s <IP>:5555 shell 'dumpsys package com.privatevpn.app.guard | grep -m1 versionName' # 1.5
adb -s <IP>:5555 shell 'dumpsys package org.smarttube.stable | grep -m1 versionName'  # 2.2-fpt-tubeflow
adb -s <IP>:5555 shell 'settings get global http_proxy'                               # gateway
```
Mở FPT Tubeflow: sau ~5 s phải ra danh sách video. Trắng/lỗi ⇒ kiểm tra gateway (mục trên).

## Các bẫy đã gặp (đừng lặp lại)

| Bẫy | Cách xử lý |
|---|---|
| Cài Tubeflow đè SmartTube gốc | `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (khác chữ ký) → phải `uninstall org.smarttube.stable` trước |
| Cài app cũ rồi mất quyền proxy | Guard cần `WRITE_SECURE_SETTINGS` cấp lại sau mỗi lần reinstall |
| Icon Android 13+ không đổi | Icon thật lấy từ `mipmap-nodpi-v30/app_icon.png`, sửa `nodpi` không đủ |
| TV tự nhảy proxy sang điện thoại | Điện thoại chạy VPNFlow cũng mở gateway LAN `:18081`; đã ghim `proxy_mode=gateway` cho TV |
| "Lúc có video lúc mất" | Do proxy nhảy gateway mỗi 60 s → guard 1.5+ bám gateway đang sống (đừng dùng guard ≤1.4) |
| Gateway Windows `.5` "nửa chết" (cổng TCP mở nhưng CONNECT treo) | Guard 1.6: nhịp 15 s + probe nhanh 4 s ⇒ tự chuyển `.6` trong ~20 s (đo 24/10: 02:43:06 đặt `.5` chết → 02:43:31 proxy = `.6`). Vẫn nên **khởi động lại gateway trên Windows**; khi `.5` hỏng, cho VPNFlow ưu tiên `.6` (`proxy_gateway` sửa thứ tự trong `shared_prefs/vpnflow_hysteria.xml`) |
| HOME lóe launcher Xiaomi | Không thể đặt default HOME (Xiaomi chặn); launcher 2.6+ bật accessibility + HomeGuard ⇒ ~0,2-0,4 s |

## Dựng lại APK khi cần đổi bản

- Launcher: `cd android/tvflow-launcher && bash build.sh` (cần `debug.keystore` — lấy ở
  `/Volumes/BIWIN/IoSApps/FacebookLack/tvlauncher/debug.keystore`; **không commit keystore**).
- Guard: javac + d8 + aapt2 (`--min-sdk-version 26 --target-sdk-version 36`) + apksigner, source
  `android/guard`; nhớ cấp lại `WRITE_SECURE_SETTINGS` sau khi cài.
- FPT Tubeflow: `bash tools/fpt-tubeflow/build.sh <SmartTube.apk> 9013 2.2-fpt-tubeflow`
  (xem `tools/fpt-tubeflow/README.md`).

## Sự cố 24/10/2026 02:40 — "FPT Play không vào được gateway" (đã xử lý)

**Triệu chứng:** TV không tải được FPT Play; `http_proxy` của TV trỏ gateway đã chết; phải tắt/bật
app VPNFlow mới hết.

**Chuỗi nguyên nhân (đo được):**

1. Gateway Windows `.5` bị **"nửa chết"**: cổng TCP 18081 vẫn mở nhưng CONNECT trả `000` cho **mọi**
   đích (gstatic, youtube, vodcdn.fptplay.net) — thời điểm này trùng cửa sổ harness Windows phát hành
   `android 1.4.7/105` (commit `ccc83a3` 02:17) và test gateway trên máy Windows. ⇒ khả năng cao do
   lần test/restart đó.
2. Cùng lúc, app VPNFlow trên TV (vẫn **1.4.5/100**) ở chế độ `proxy_mode=auto` **tự phát hiện gateway
   LAN của điện thoại** `192.168.100.101:18081` (bản 1.4.7/105 vừa cài trên Z Fold5 có "gateway LAN
   trên điện thoại") rồi đặt proxy TV sang điện thoại. Gateway điện thoại **fail Google/CDN
   `gstatic=000`** (lỗi IPv6 — chính là thứ 1.4.7 sửa, nhưng TV còn 1.4.5), chỉ FPT CDN còn `210`
   ⇒ FPT Play chập chờn, Tubeflow chết.
3. Guard cũ (≤1.5) nhịp 60 s + probe 8-10 s/đích nên chuyển gateway rất chậm ⇒ người dùng phải
   tắt/bật VPNFlow để ép chọn lại.

**Đã sửa:**

| Việc | Kết quả |
|---|---|
| Guard **1.6** (vc 7): nhịp **15 s**, `probeQuick` 4 s, thêm đích `www.fptplay.net:443` | Tự failover **~20 s** (đo: 02:43:06 đặt `.5` chết → 02:43:31 proxy = `.6`) |
| `proxy_gateway` của VPNFlow tạm ưu tiên `.6` | TV không bị chọn `.5` chết |
| Đặt lại `http_proxy` = `.6` trên TV | FPT Play vào lại màn kênh; proxy giữ nguyên sau 20 s |

**Bài học / luật rút ra:**

- **Trước khi restart/dừng gateway trên máy Windows (`.5`) phải báo trước** — đó là đường ra đang
  phục vụ TV; test 1 phút là TV mất mạng thật. (Giống luật §7e cho relay server, áp dụng cho gateway LAN.)
- **Tắt "gateway LAN" trên điện thoại** (hoặc gỡ bản 1.4.7 khỏi điện thoại) nếu không muốn TV tự chọn
  điện thoại làm proxy; TV app cũ (1.4.5) chưa có bản sửa IPv6 nên qua điện thoại sẽ chết Google.
- Nếu cập nhật app VPNFlow trên TV lên **1.4.7/105**, cần kiểm lại `proxy_mode` có bị đổi về `auto` không.

## TV360 — đi qua **Flow3 riêng**, có watchdog (24/10/2026)

TV360 (`com.viettel.tv360.tv`) không đi Flow2 như FPT Play: bridge Mac route `*.tv360.vn` sang
**socks `127.0.0.1:1083`** (relay3 → node-3 `103.6.235.39`).

Sự cố 24/10: mọi host `*.tv360.vn` qua gateway trả `000` trong ~3 ms. Nguyên nhân: **relay3 mất DNS**
(`lookup api.meetflowai.site: no such host`), Flow3 chết, còn bridge vẫn trỏ vào 1083 chết ⇒ TV360 chết
âm thầm. `health.sh` cũ chỉ kiểm Flow2 nên không phát hiện.

Đã sửa: restart `site.flowvpn.relay3` (kết nối lại node-3 ~2 s, TV360 `200/2.2 s`) và **mở rộng
watchdog** kiểm cả Flow3 mỗi 5 phút — chi tiết + script: [`tools/mac-gateway/`](../tools/mac-gateway/).
