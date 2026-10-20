# BẢN ĐÓNG BĂNG (PIN) CHO RIÊNG TV `MiTV-AFZP0` — v63 (20/10/2026)

> **Chủ dự án chốt 20/10/2026: "lock bản này lại cho riêng TV này thôi".**
> Bản dưới đây **chỉ dùng cho đúng một thiết bị**; **KHÔNG phát hành** lên kênh
> `android-tv`, **KHÔNG** đưa vào `release/releases.jsonl`, **KHÔNG** dùng làm bản
> chung cho khách khác.

## 1. Định danh bản đóng băng

| Trường | Giá trị |
|---|---|
| APK lưu trữ | `C:\Users\Minhn\vpnflow-android-142\tools\VPNFlow-tv-PINNED-v63-MiTV-AFZP0.apk` |
| Kích thước | 97.350.589 B |
| SHA-256 | `E71D251F9AE1572520F9AC8EE64B45872144E51B02EEBD53F3E5F19632BE53DE` |
| Package | `com.privatevpn.app.tv.dev` (bản **dev**, cài song song bản phát hành) |
| versionCode / versionName | **63** / `1.4.5-tv-dev` |
| Commit nguồn | `31ca5172` (v63) — chuỗi: `75556453` v57 → `09107388` v59 → `749ad872` v60 → `396c29e2` v61 → `95985e66` v62 → `31ca5172` v63 |

Thiết bị đích (duy nhất):

```
model      MiTV-AFZP0 (Amlogic T950S "moderntimes") · Android 14 · OS3.0.8.0.UFZAATV
kernel     5.15.153-android14-11-gc4c17c3c8b81   → KHÔNG có CONFIG_TUN (không có /dev/tun)
LAN       192.168.100.105:5555 (adb; cổng 5555 phải bật lại sau mỗi lần reboot)
```

## 2. Vì sao bản này không dùng chung được

Bản này chứa các quyết định **riêng cho thiết bị/mạng của khách này**:

1. Chế độ **proxy nội bộ** thay TUN (máy không có TUN): `LocalProxy` 1081 + core Go 1082.
2. **Ghim nút thoát VPS1** `103.173.155.50` + tắt đổi nút khi `noTunDevice`.
3. **Tối thiểu 6 lane** N-tunnel cho chế độ proxy (`PROXY_MIN_TUNNELS`).
4. Đo mạng mẫu 20 MB, lấy max 2 nguồn, sàn khai báo 15 Mbps.
5. **Cấp chứng chỉ Widevine qua tunnel** (mạng tòa nhà chặn toàn bộ IP Google).
6. Tự bật khi khởi động + chuông keepalive 3 phút + whitelist Doze (đã cấp trên máy).

Máy khác (có TUN) không cần và không nên dùng các mặc định này.

## 3. Việc PHẢI làm khi cài lại bản này

```powershell
$adb = "C:\Users\Minhn\Android\sdk\platform-tools\adb.exe"
& $adb connect 192.168.100.105:5555
& $adb -s 192.168.100.105:5555 install -r `
  "C:\Users\Minhn\vpnflow-android-142\tools\VPNFlow-tv-PINNED-v63-MiTV-AFZP0.apk"
& $adb -s 192.168.100.105:5555 shell pm grant com.privatevpn.app.tv.dev android.permission.WRITE_SECURE_SETTINGS
& $adb -s 192.168.100.105:5555 shell settings put global http_proxy :0        # luôn dọn proxy trước khi thử
& $adb -s 192.168.100.105:5555 shell dumpsys deviceidle whitelist +com.privatevpn.app.tv.dev
```

Kiểm tra sau khi cài (log nằm ở `/storage/emulated/0/Android/data/com.privatevpn.app.tv.dev/files/diagnostics.log`):

```
local-proxy: nghe 127.0.0.1:1081 (fail-open khi tunnel tắt)
n-tunnel: N=6 (hút băng thông BẬT)
tunnel: UP (http1081)
proxy: IP thoát = 103.173.155.50 (ĐÚNG VPS1)
```

## 4. Điều kiện môi trường để bản này chạy đúng

- **Relay `wsrelay.js` trên node-2 đã được vá 20/10/2026** (backup `/root/wsrelay.js.bak-*`): chỉ cắt
  lane khi **im lặng hoàn toàn** > `PONG_TIMEOUT_MS`, thay vì cắt khi thiếu pong. Nếu khôi phục
  backup cũ, lane sẽ chết sau 45-77 s và VPNFlow "lúc được lúc không" trở lại.
- Mạng tòa nhà **chặn toàn bộ IP Google** ⇒ Netflix không cứu được (lỗi `-13`, chứng nhận phía
  server), FPT Play/SmartTube đi qua proxy thì được.
- Trần băng thông thật của mạng này ~4 Mbps lúc cao điểm (đo cùng lúc: PC cùng mạng còn thấp hơn).
  Trần nằm ở đường ra quốc tế, không phải app/relay ⇒ tăng lane không nâng được trần.

## 5. Việc còn treo (không thuộc phạm vi bản pin)

- ROM `PeriodicCleaner` kill app sau ~5 phút (`OverTimePackage:com.privatevpn.app.tv.dev`) ⇒ app tự
  sống lại nhờ `START_STICKY` + chuông keepalive. Muốn hết hẳn: whitelist trong **TV Manager**
  (`com.xiaomi.mitv.tvmanager`) → ứng dụng được bảo vệ/tự khởi động, hoặc Cài đặt → Ứng dụng →
  VPNFlow → cho phép chạy nền. **Không cần root, không cần build thêm.**
- Chưa nghiệm thu nhánh `BOOT_COMPLETED` thật trên máy này (adb mất sau reboot).
