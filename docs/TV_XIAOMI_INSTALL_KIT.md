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
