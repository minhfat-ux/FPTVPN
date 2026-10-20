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

---

# Bổ sung 20/10/2026 (chiều) — HTTP proxy, ghim VPS1, Widevine, proxy fail-open

Bản dev đã nghiệm thu trên TV: **v57** (`com.privatevpn.app.tv.dev`, versionCode 57).

## 7. Đổi SOCKS5 → **HTTP proxy (CONNECT)** — FPT Play mới đăng nhập được

Proxy hệ thống của Android là **HTTP proxy**: app gửi `CONNECT host:443`. Bản SOCKS5 vì thế
làm FPT Play báo lỗi kết nối khi đăng nhập. Core Go thêm `ServeHTTPProxy(listen)` (CONNECT +
GET thường), app đặt proxy hệ thống về cổng đó.

Bằng chứng (đo từ PC qua `adb forward` vào proxy của TV):

```
proxy: HTTP proxy (CONNECT) sẵn sàng 127.0.0.1:1081 (proxy hệ thống=đã đặt)
curl -x http://127.0.0.1:1081 http://api.ipify.org    → 103.173.155.50
curl -x http://127.0.0.1:1081 https://api.ipify.org   → 103.173.155.50  (200, 2.47 s)
```

FPT Play: trước = "lỗi kết nối" ở bước đăng nhập; sau = vào trang chủ, đăng nhập và **xem video OK**.

## 8. Ghim IP thoát về VPS1 + số khai báo sát mạng thật

- `pinExitHost()`: luôn dùng `Config.HY_SERVER` = **103.173.155.50**; **tắt đổi nút** khi
  `noTunDevice` (trước đây failover 2 lượt là nhảy nút ⇒ đổi IP giữa phiên).
- Số khai: sàn 15 Mbps + **đo mạng bằng mẫu 20 MB** (Cloudflare) và **lấy max 2 nguồn** — mẫu 4 MB
  của CDN shop chỉ đo ra 7.986 kbps vì chính CDN đó chậm, khiến số khai kẹt 4-5 Mbps.

```
bw: so do dung de khai = 38286kbps (nguon nhanh nhat: https://speed.cloudflare.com/__down?bytes=20000000)
bw: net=wifi-gw-192.168.100.1 measured=38286 declared up=8775 down=29250 reason=clamp ctx=proxy attempt
proxy: IP thoát = 103.173.155.50 (ĐÚNG VPS1)
```

## 9. Cấp chứng chỉ **Widevine** qua tunnel (cứu mọi app DRM trên mạng chặn Google)

Mạng tòa nhà **chặn toàn bộ IP Google** (đo trực tiếp trên TV): `8.8.8.8:443`,
`172.217.117.4:443`, `www.googleapis.com:443` đều timeout, trong khi `1.1.1.1:80`,
`103.173.155.50:443`, `www.netflix.com:443` mở. Hệ quả: Netflix chết ngay ở bước
`WidevineCDMProvisionRequestTask` (timeout 5 s), và FPT Play không xem được video vì CDM chưa có cert.

Giao thức đúng lấy từ **bytecode APK Netflix** (`WidevineCDMProvisionRequestTask.postRequest`):
`signedRequest` nằm **trên URL**, body **rỗng**, header `Content-Type: application/json`,
`User-Agent: Widevine CDM v1.0`; response là nhị phân đưa thẳng vào `provideProvisionResponse`.

```
wv: xin chứng chỉ Widevine qua tunnel (yêu cầu 1603 B, đầu='CqkIEgTD8F2bGgQIABIAKvgH')
wv: ĐÃ cấp chứng chỉ Widevine (3844 B) — Netflix không cần Google nữa
```

⇒ FPT Play xem video được. **Netflix thì không**: sau khi hết lỗi mạng, app báo `-13`
("không tương thích thiết bị") — chứng nhận Netflix là danh sách **phía server** theo model + ESN
sinh từ Widevine L1 trong keybox; cài `com.netflix.partner.activation` (đã thử) và bản mobile
(cũng báo không hỗ trợ) đều không qua được. Firmware cũng không cứu: bootloader tuy `orange`
(`ro.boot.flash.locked=0`) nhưng kernel **thiếu CONFIG_TUN** và không thể giả ESN.

## 10. Proxy nội bộ **fail-open** + chống lane bị relay cắt

Hai sự cố thật trong ngày:

1. Tunnel chết ⇒ proxy hệ thống vẫn trỏ `127.0.0.1:1081` (cổng chết) ⇒ **cả TV mất mạng**,
   FPT Play "không load được". Reboot cũng giữ nguyên giá trị này.
2. Relay cắt lane: `#11062 KHÔNG PONG trong 120000ms -> cắt kết nối ... pong-timeout` ⇒ app thấy
   `ws-relay: failed: Broken pipe`. Nguyên nhân phía client: dữ liệu gửi đi dồn vào một hàng đợi
   OkHttp, pong trả lời ping của relay nằm sau hàng đợi đó.

Cách chữa:

- `LocalProxy` (Kotlin): giữ cổng **1081 thường trực** trong tiến trình app; tunnel sống (core Go
  ở **1082**) thì chuyển tiếp qua tunnel, tunnel tắt thì **đi thẳng** ⇒ proxy không bao giờ trỏ cổng
  chết, cùng lắm là "không qua VPN" chứ không "mất mạng".
- `ProxyCleanupReceiver`: dọn `http_proxy` còn sót ngay khi boot (thêm `RECEIVE_BOOT_COMPLETED`).
- `WSRelayBridge`: hàng đợi gửi > **512 KB** thì bỏ datagram (QUIC tự gửi lại) để pong luôn kịp hạn 120 s.

```
local-proxy: nghe 127.0.0.1:1081 (fail-open khi tunnel tắt)
tunnel: UP (http1081)                    ← tunnel đi qua LocalProxy → core Go 1082
```

## 11. Việc còn treo

- Probe "qua tunnel" vẫn ghi số vào bộ nhớ (`reason=probe ... declared down=2918`) nên lần connect
  sau có thể bị kéo số khai xuống; cần chặn nhánh này khi `noTunDevice`.
- Chưa thử **SmartTube** (YouTube = Google ⇒ chỉ xem được khi tunnel sống).
- Chưa build bản **release** cho kênh TV (v57 mới là bản dev); kênh android-tv vẫn đang giữ
  `1.4.6-tv` trên server.

## 12. Lane bị relay cắt oan (đã sửa trên server) + trần băng thông thật (chiều 20/10)

**Triệu chứng khách thấy:** FPT Play "lúc được lúc không", tunnel báo Connected nhưng ảnh/video
không tải. Phía app: `ws-relay: failed: Broken pipe` rồi `service: onDestroy` sau 45-77 giây.

**Nguyên nhân (log relay node-2):**

```
#12266 KHÔNG PONG trong 120000ms -> cắt kết nối
#12266 ĐÓNG sau 45.0s | in=636f/93300B out=1338f/1585911B | lý do: pong-timeout
```

Lane đã nhận **636 frame** từ client mà vẫn bị coi là "chết" vì relay chỉ đếm `pong`; trong khi
`PONG_TIMEOUT_MS` (120000) chỉ dùng để in log — thời gian cắt thật là `PING_INTERVAL_MS` (15 s).
Client (OkHttp) không kịp pong khi hàng đợi gửi dày ⇒ cắt oan.

**Đã sửa trong /root/wsrelay.js trên node-2** (backup /root/wsrelay.js.bak-*): mọi khung đến
(`pong` / `ping` / binary) đều tính là còn sống, chỉ cắt khi **im lặng hoàn toàn** quá
`PONG_TIMEOUT_MS`. Đã `node --check` và restart 6/6 unit; health:

```
vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426 vn3hy=426 vn3wg=426
relay /healthz: connections=44 active=2 bytesOut=50393819 dropped=0 udpErrors=0 pingsOut=268 pongsIn=267
```

Lưu ý: `relay-cf-vn1hy` mất ~60 s ở trạng thái `deactivating` khi restart (systemd chờ đóng kết
nối) — lần sau restart unit này phải đặt lệnh khôi phục tách phiên và chấp nhận mất SSH nếu phiên
điều khiển đang đi qua chính nó.

**Trần băng thông thật của mạng tòa nhà (đo cùng lúc, TV so với PC cùng mạng):**

| Đường | Tốc độ |
|---|---|
| TV qua tunnel (N=4) | 506.625 B/s ≈ **4,1 Mbps** |
| TV qua tunnel (N=8) | 524.033 / 466.801 / 321.297 B/s ≈ **2,6-4,2 Mbps** |
| PC qua tunnel riêng của PC | 76.183 / 152.953 B/s ≈ **0,6-1,2 Mbps** |

⇒ Tăng lane **không** nâng được trần: nút thắt là đường ra quốc tế của mạng tòa nhà (giờ cao
điểm), không phải app/relay (relay `drop=0`, `udpErr=0`). Vì vậy `PROXY_MIN_TUNNELS` để **6**
là đủ (thêm lane chỉ tốn tài nguyên), và FPT Play nên xem mức 720p/HD thấp cho ổn định.

**Đo lại sau khi sửa relay:** lane KHÔNG còn chết (KHÔNG NHẬN ĐƯỢC KHUNG NÀO không xuất hiện),
tunnel giữ `Connected` liên tục, `IP thoát = 103.173.155.50`.
