# TV Xiaomi KHÔNG có TUN — fix bằng chế độ SOCKS5 nội bộ (20/10/2026)

**Thiết bị:** `MiTV-AFZP0` · Android 14 · `OS3.0.8.0.UFZAATV` · kernel
`5.15.153-android14-11-gc4c17c3c8b81-abOS3.0.8.0.UFZAATV` (Amlogic "moderntimes") · LAN `192.168.100.105`

## 1. Triệu chứng & bằng chứng (không phải lỗi app)

App (v36, v38, v41 — mọi bản) đều **kết nối xong transport nhưng không lên tunnel**:

```
E/VpnJni (system_server): Cannot allocate TUN: Bad file descriptor
W/VPNFLOW_DIAG: vpn: establish ĐẦY ĐỦ hỏng  (IllegalStateException: Cannot create interface)
W/VPNFLOW_DIAG: vpn: establish TỐI GIẢN cũng hỏng (…)
W/VPNFLOW_DIAG: transport ended on its own (… serve() threw: Cannot create interface) -> reconnecting
```

Đọc trực tiếp trên máy:

```
zcat /proc/config.gz | grep CONFIG_TUN  →  # CONFIG_TUN is not set      ← KERNEL KHÔNG CÓ TUN
ls -l /dev/tun                          →  No such file or directory
ls -l /dev/net/tun                      →  symlink -> ../tun (đích không tồn tại)
cat /proc/misc | grep tun               →  (không có)
find /vendor /system -name 'tun*.ko'    →  (không có module)
```

⇒ **VpnService của Android không thể tạo interface** ⇒ **mọi app VPN** (không riêng VPNFlow) đều
không chạy được. Đối chiếu: 3 TV còn lại (`MiTV-ASSU0`, `MiTV-ASTP0`) chạy `tunnel: UP` bình thường
⇒ kernel của chúng có TUN; đây là **khác biệt firmware của model**, không phải phiên bản app.

**Không thể "cài TUN":** kernel thiếu driver TUN, không có `tun.ko` cho kernel này (Amlogic/Xiaomi
không phát hành), `CONFIG_MODVERSIONS=y` (module phải khớp CRC chính xác), và **không có root**
(`ro.build.type=user`, `ro.debuggable=0`, không `su`, SELinux Enforcing) để `insmod`.

## 2. Cách chữa: chế độ SOCKS5 nội bộ (không cần TUN)

Vẫn dùng ĐÚNG tunnel hysteria2 của mình, chỉ đổi "cửa ra":

1. **Core Go** (`tools/hysteria-android/mobile.go`): thêm `ServeSocks(listen)` — chạy SOCKS5 server
   của hysteria trên client đã `Connect` (gộp cả N tunnel nếu bật `multiClient`). Không cần TUN.
2. **Service** (`HysteriaVpnService.kt`):
   - `establish()` thử **cấu hình đầy đủ**, hỏng thì thử **tối giản** (bỏ DNS/metered/bypass app TQ);
   - cả hai hỏng ⇒ bật cờ `noTunDevice` và log rõ;
   - `oneConnectPass()`: khi `noTunDevice` ⇒ đi thẳng `proxyAttempt()` (không thử đường TUN nữa,
     tránh vòng lặp vô ích);
   - `proxyAttempt()`: mở cầu WS như cũ → `Mobile.connect(...)` → tự đặt **proxy hệ thống**
     `127.0.0.1:1081` (`WRITE_SECURE_SETTINGS`) → `Mobile.serveSocks("127.0.0.1:1081")`;
     khi dừng thì **gỡ proxy**.
3. **Manifest**: thêm `android.permission.WRITE_SECURE_SETTINGS` (cấp bằng
   `adb shell pm grant com.privatevpn.app.tv.dev android.permission.WRITE_SECURE_SETTINGS`).

## 3. Kết quả nghiệm thu (log thật, 20/10/2026 00:30)

```
vpn: máy KHÔNG có TUN -> chuyển chế độ SOCKS5 nội bộ (proxy hệ thống 127.0.0.1:1081)
tunnel: UP (socks1081)
proxy: SOCKS5 sẵn sàng 127.0.0.1:1081 (proxy hệ thống=đã đặt)
bw: probe 4000000B/2196ms -> 14571kbps qua tunnel        ← traffic thật qua VPN VN
probe#2 transport=socks1081 tunnelUp=true
adb shell settings get global http_proxy  →  127.0.0.1:1081
```

## 4. Giới hạn (phải nói với khách)

- Chỉ app **tôn trọng proxy hệ thống** mới đi qua: **FPT Play, SmartTube, trình duyệt** ✓.
- **Netflix KHÔNG** đi qua (tự mở socket) — muốn Netflix cần thiết bị có TUN/box.
- Đây là chế độ **tự động**: không cần người dùng cấu hình; app tự đặt proxy khi kết nối và gỡ khi dừng.
- Bản đang cài trên TV là **debug v42** (`com.privatevpn.app.tv.dev`). Muốn phát cho khách cần
  build **release** với versionCode mới — chờ chủ dự án chốt (kênh TV hiện giữ `1.4.5-tv` theo quyết định 20/10).

## 5. Bản đồ thay đổi

| File | Thay đổi |
|---|---|
| `tools/hysteria-android/mobile.go` | + `ServeSocks(listen)`, import `errors`/`socks5`, `noopSocksLogger` |
| `android/app/libs/hysteria.aar` | build lại 34.166.802 B (4 ABI), API mới `serveSocks(String)` |
| `android/.../vpn/HysteriaVpnService.kt` | establish 2 bước + cờ `noTunDevice` + `proxyAttempt()` + `setSystemProxy()`, `SOCKS_PORT=1081`, nhánh trong `oneConnectPass()` |
| `android/app/src/main/AndroidManifest.xml` | + `WRITE_SECURE_SETTINGS` |
| `android/app/build.gradle.kts` | `versionCode 42` (bản debug TV đã test) |

## 6. Làm cho chế độ SOCKS5 AN TOÀN (bổ sung 20/10, sau khi test thật)

Ba việc phải làm, nếu không sẽ gây sự cố THẬT (đã xảy ra khi test):

1. **Nhớ "máy không có TUN" qua lần khởi động lại**: lưu `no_tun_device` vào SharedPreferences.
   Không lưu thì mỗi lần service bị kill lại thử TUN trước (~5–10 s) rồi mới sang SOCKS5.
2. **Gỡ proxy khi transport kết thúc** (và khi `onDestroy`): nếu giữ, lúc app bị kill proxy sẽ trỏ
   vào **cổng chết** ⇒ **cả TV mất mạng** (đo thật: VPNFlow không tải nổi danh sách server, các app
   khác cũng lỗi `Failed to connect to /127.0.0.1:1081`).
3. **Tự dọn proxy cũ ngay khi mở app** (`VPNFlowApp.onCreate`): force-stop **không chạy** `onDestroy`
   nên proxy còn sót; mở app phải dọn TRƯỚC mọi lời gọi mạng. Đã kiểm:
   ```
   connect            → tunnel: UP (socks1081), proxy=127.0.0.1:1081
   force-stop         → proxy vẫn 127.0.0.1:1081 (kill không chạy onDestroy)
   mở lại app         → app: đã dọn proxy cũ (127.0.0.1:1081) còn sót từ phiên trước ; proxy=:0
   ```

Bản đã test trên TV: **v46** (debug `com.privatevpn.app.tv.dev`). Chuỗi bản: v42 (SOCKS5) →
v43 (nhớ cờ) → v44 (gỡ proxy khi dừng) → v45/v46 (tự dọn lúc mở app).
