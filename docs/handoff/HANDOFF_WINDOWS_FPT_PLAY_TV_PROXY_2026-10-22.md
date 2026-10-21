# HANDOFF — FPT Play trên Xiaomi TV chạy bằng "proxy mode" (http1081), không cần TUN

- **Ngày:** 22/10/2026 · **Máy đo:** MiTV-AFZP0 (`moderntimes`), Android 14 / SDK 34, armeabi-v7a,
  kernel **`CONFIG_TUN is not set`**
- **Người đo:** harness macOS (192.168.100.5) qua ADB Wi-Fi tới TV (192.168.100.104)
- **Phạm vi:** hành vi đã đo trên TV + cách áp dụng cùng cơ chế cho Windows
- **Trạng thái:** FPT Play **đã phát được** trên TV (đo 22/10/2026)

> Mục đích của handoff: harness Windows (DESKTOP-852P1LT) nắm được đường **proxy mode** —
> cách bypass geo-block khi **TUN không dùng được** — để không phải dò lại từ đầu.

---

## 1. Triệu chứng & nguyên nhân

FPT Play (`net.fptplay.ottbox`, media3 1.10.1) trên TV: catalog rỗng / báo lỗi vùng, video
không phát. Log có `GooglePlayServices not available due to error 9` nhưng **không phải nguyên
nhân** — TV không có GMS vẫn xem được nếu đúng vùng.

Nguyên nhân thật: đường ra Internet của nhà là **China Mobile (ASN 9808)**:

```
$ curl http://ip-api.com/line/?fields=query,country,as
120.240.178.139
China
AS9808 China Mobile Communications Group Co., Ltd.
```

FPT Play chặn theo IP ngoài Việt Nam.

## 2. Ràng buộc của TV (vì sao không dùng VPN thường)

| Ràng buộc | Hệ quả |
|---|---|
| `CONFIG_TUN is not set` | `VpnService.establish()` không tạo được `tun` ⇒ mọi VPN kiểu TUN chết |
| Không root | `ip route replace` → `Permission denied` |
| `cmd wifi` không có lệnh IP tĩnh | Không trỏ gateway sang máy khác bằng lệnh |

## 3. Cơ chế đã chứng minh: transport `http1081`

APK đang cài trên TV: `com.privatevpn.app.tv.dev`, **1.4.5-tv-dev** (versionCode 78).
App chạy **HTTP proxy (CONNECT) tại `127.0.0.1:1081`** trong tiến trình của nó, đẩy traffic
qua tunnel hysteria2 tới node Việt Nam — **không cần TUN**:

```
FPT Play ──(system proxy)──► 127.0.0.1:1081 (VPNFlow) ──wsrelay/hysteria2──► Flow1 Hà Nội ──► FPT CDN
```

Logcat thật:

```
VPNFLOW_DIAG: tunnel: UP (http1081)
VPNFLOW_DIAG: proxy: HTTP proxy (CONNECT) sẵn sàng 127.0.0.1:1081 (proxy hệ thống=đã đặt)
VPNFLOW_DIAG: proxy: IP thoát = 103.173.155.50 (ĐÚNG VPS1)
```

Hành vi quan sát được (đều tự động, không cần bấm Connect):

1. Mở app VPNFlow → service dựng tunnel, mở 1081, **tự đặt system proxy**.
2. Giữ sống: `keepalive` 10 phút + `audio: giữ luồng câm` để ROM không dọn app.
3. Có `ProxyCleanupReceiver` nhận `BOOT_COMPLETED` — **dọn proxy khi khởi động máy**
   (tránh kẹt proxy chết).
4. Đã whitelist Doze trên TV: `cmd deviceidle whitelist +com.privatevpn.app.tv.dev`
   (standby bucket = 5 exempted).

**FPT Play có tôn trọng system proxy thật** — bằng chứng hai chiều:

- proxy trỏ sai ⇒ `Firestore: Failed trying to connect with proxy ... ECONNREFUSED`;
- proxy đúng ⇒ catalog + video tải được.

## 4. Kết quả đo (22/10/2026)

| Hạng mục | Kết quả |
|---|---|
| Catalog FPT Play | load đủ nội dung, không lỗi vùng |
| Phát video | `state=PLAYING`, position **9,0s → 24,0s** trong 15s (1.0x), buffer trước 2,5–7s |
| Decoder | `c2.amlogic.avc.decoder` + AudioTrack active |
| Lỗi HTTP/DRM | không `PlaybackException`, không 403 |
| Băng thông app tự đo | **16.539 kbps** lúc khởi động |
| Đường ra | Flow1 `103.173.155.50` (Hà Nội) — FPT chấp nhận |

## 5. Áp dụng cho Windows

Windows có cùng lớp vấn đề: TUN cần admin, và Smart App Control chặn binary chưa ký.
Proxy mode là **đường dự phòng** không cần TUN/admin.

### 5.1 Mở SOCKS5 bằng relay client

```bash
cd tools/hysteria-relay
TARGETS="windows/amd64" OUT_DIR=/tmp/x ./build.sh      # -> flowvpnrelay-windows-amd64.exe
```

`config-socks.json` (không có khối `tun` ⇒ chỉ mở SOCKS5, không cần admin):

```json
{
  "server": "165.101.114.162:8443",
  "password": "<HY_PASSWORD trong Config.kt>",
  "obfs": "<HY_OBFS trong Config.kt>",
  "insecure": true,
  "transport": { "type": "wsrelay", "url": "wss://api.meetflowai.site/relay/vn2hy",
                 "host": "api.meetflowai.site", "links": 1 },
  "socks5": { "listen": "127.0.0.1:1081" },
  "dialTimeoutSec": 15
}
```

### 5.2 Cầu HTTP → SOCKS5

System proxy của Windows là **HTTP proxy**, không nói SOCKS5. Dùng tool mới thêm:

```bash
cd tools/http-socks-bridge
go build -o http-socks-bridge.exe main.go
./http-socks-bridge.exe -listen 127.0.0.1:18081 -socks 127.0.0.1:1081
```

### 5.3 Đặt system proxy (WinINet)

```bat
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer /t REG_SZ /d "127.0.0.1:18081" /f
```

App đang chạy cần refresh WinINet (`InternetSetOption` với `INTERNET_OPTION_REFRESH` +
`INTERNET_OPTION_SETTINGS_CHANGED`) — app C# có thể P/Invoke trực tiếp; dùng WinHTTP thì
`netsh winhttp set proxy proxy-server="127.0.0.1:18081"`.

### 5.4 Dọn proxy — bắt buộc

Proxy trỏ vào cổng đã chết ⇒ **mất mạng cả máy**. Phải dọn ở cả hai chỗ:

- khi tunnel/bridge thoát (finally);
- khi đăng nhập/khởi động: task/`Run` key chạy
  `reg add ... /v ProxyEnable /t REG_DWORD /d 0 /f`.

### 5.5 Kiểm chứng

```bash
curl -x http://127.0.0.1:18081 http://ip-api.com/line/?fields=query,country,as
# phải ra IP Việt Nam (Flow1 103.173.155.50 / Flow2 165.101.114.162 ...)
```

## 6. Lệnh đã chạy trên máy đo (để tái lập)

```bash
# build client relay cho macOS
cd tools/hysteria-relay && TARGETS="darwin/arm64" OUT_DIR=/tmp/hysteria-relay-dist ./build.sh
# chạy SOCKS5 qua /relay/vn2hy
./flowvpnrelay-darwin-arm64 -c config-socks.json

# TV: bật app, đợi tunnel, rồi mở FPT Play
adb -s <TV>:5555 shell monkey -p com.privatevpn.app.tv.dev -c android.intent.category.LAUNCHER 1
adb -s <TV>:5555 shell settings get global http_proxy     # -> 127.0.0.1:1081
adb -s <TV>:5555 shell dumpsys media_session | grep PlaybackState
```

Phương án dự phòng khi app TV bị dọn: cho TV dùng proxy của Mac
(`192.168.100.5:18081`) — cùng tool cầu nối này.

## 7. Ghi chú về nguồn mã (quan trọng)

`http1081` / `ProxyCleanupReceiver` **không có trong checkout này** — đã kiểm:

```bash
git log --all --oneline -S "ProxyCleanupReceiver"   # rỗng
git grep -l "http1081" $(git branch --format='%(refname:short)') -- android   # rỗng
```

nhưng APK trên TV **có** các chuỗi đó (`strings classes*.dex` → `http1081`,
`ProxyCleanup`, `127.0.0.1:1081`). Nghĩa là bản APK đó build từ nguồn khác (máy/workspace
Windows hoặc nhánh chưa đẩy lên `origin`). Trước khi sửa tiếp phần TV, cần **lấy đúng nguồn
đã build `1.4.5-tv-dev`**; nếu không, dựng lại theo đúng mô tả ở §3 (HTTP CONNECT proxy +
tự đặt/dọn system proxy + cleanup on boot).

## 8. Checklist nghiệm thu cho Windows

- [ ] `flowvpnrelay.exe` mở SOCKS5 `127.0.0.1:1081` (config không có `tun`).
- [ ] `http-socks-bridge` chạy `127.0.0.1:18081`.
- [ ] `curl -x http://127.0.0.1:18081 http://ip-api.com/line/?fields=query,country` → VN.
- [ ] System proxy đặt/refresh đúng; tắt app ⇒ proxy được dọn.
- [ ] Khởi động lại máy ⇒ không còn proxy chết.
- [ ] App mục tiêu chạy được qua proxy (FPT Play là app tham chiếu trên TV).
