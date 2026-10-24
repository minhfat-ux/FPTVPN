# Handoff — Gateway laptop Windows + app VPNFlow TV (24/10/2026)

> Tài liệu vận hành đầy đủ cho cấu hình đang chạy. Bản chốt code: xem
> `docs/LOCKED-2026-10-23-gateway-windows-tv.md`. Mục đích: người khác (hoặc phiên agent sau) đọc
> là chạy lại được, không cần hỏi.

## 1. Kiến trúc

```
TV MiTV-AFZP0 (192.168.100.104, KHÔNG có TUN, KHÔNG có Bluetooth, không cert Netflix)
  │  proxy hệ thống: Settings.Global http_proxy
  ▼
Gateway laptop Windows (192.168.100.x — IP đổi theo DHCP: .11 → .5; app tự dò)
  │  tools/lan-proxy/lan-proxy.exe  :18081   HTTP proxy (CONNECT + keep-alive), chia luồng theo domain
  ▼
4 upstream SOCKS5 nội bộ (flowvpnrelay-windows-amd64.exe)
  ├ 1081  UDP trực tiếp  → Flow1 103.173.155.50     (nhanh nhất khi UDP mở: ~10–13 Mbps)
  ├ 1101  WS vn1hy       → Flow1 103.173.155.50     (links=24)
  ├ 1102  WS vn2hy       → Flow2 165.101.114.162    (links=24, dùng cho `.fptplay.vn`)
  └ 1103  WS vn3hy       → Flow3 103.6.235.39       (links=24, dùng cho `.tv360.vn`)
        ▲ qua Cloudflare: wss://api.meetflowai.site/relay/<vn1hy|vn2hy|vn3hy>
```

Máy khác trong LAN cũng làm gateway được: Mac chạy `tools/http-socks-bridge` ở `192.168.100.3/.6`
(cổng 18081 + 18083). App TV tự dò và chấm điểm cả hai.

## 2. Thành phần & lệnh chạy

| File | Vai trò | Cách chạy |
|---|---|---|
| `tools/lan-proxy/main.go` → `lan-proxy.exe` | HTTP proxy LAN cho TV + `-route` theo domain + `-direct` bỏ qua tunnel + discovery UDP 18099 | `lan-proxy.exe -listen 0.0.0.0:18081 -upstream socks5://127.0.0.1:1081,socks5://127.0.0.1:1101,socks5://127.0.0.1:1102 -route .tv360.vn=socks5://127.0.0.1:1103 -direct .miwifi.com -direct .xiaomi.com -direct .mi.com -direct .miui.com` |
| `tools/lan-proxy/gateway-monitor.ps1` | con canh: mỗi 60 s (20 s khi có lỗi) kiểm **egress thật** từng cổng, hỏng **3** nhịp thì dựng lại relay/lan-proxy; dọn process "xác", đợi cổng trống thật, xác nhận đã LISTEN, ghi nhịp tim | `powershell -NoProfile -ExecutionPolicy Bypass -File tools\lan-proxy\gateway-monitor.ps1` (log `.tmp\gw-monitor.log`) |
| `tools/lan-proxy/gateway-autostart.ps1` | tự bật gateway khi ở mạng nhà (SSID `KT-617` hoặc IP `192.168.100.*`), tự tắt khi ra mạng khác; giữ **wake-lock** mỗi nhịp; phát hiện **máy vừa thức** ⇒ dựng lại ngay; thấy nhịp tim monitor cũ > 240 s ⇒ giết + bật lại; mutex 1-instance | Scheduled Task `VPNFlow Gateway Watch` + shortcut Startup; log `.tmp\gw-autostart.log` |
| `tools/lan-proxy/install-gateway-task.ps1` | **đăng ký lại task cho chịu được pin/ngủ**: cho chạy khi dùng pin, không dừng khi rút sạc, `StartWhenAvailable`, 3 trigger (đăng nhập · 5 phút · **sự kiện thức dậy** Kernel-Power 507/1) | `powershell -NoProfile -ExecutionPolicy Bypass -File tools\lan-proxy\install-gateway-task.ps1` (không cần admin) |
| `tools/lan-proxy/disable-tun-for-gateway.ps1` | dọn adapter TUN còn sót (`sing-tun Tunnel`) + ~24.000 route — chạy Administrator | UAC → `powershell -File ...\disable-tun-for-gateway.ps1` |
| `tools/lan-proxy/remove-tun-adapter.ps1` | bản cũ chỉ bắt "Wintun" (đã bị `disable-tun...` thay thế) | – |
| App TV `com.privatevpn.app.tv.dev` | proxy + tunnel nội bộ `127.0.0.1:1081`, dò gateway, chọn tuyến, keepalive | cài bằng `adb install -r app-tv-debug.apk` + `pm grant ... WRITE_SECURE_SETTINGS` |

## 3. Chính sách chọn đường của app (v100 — "phương án B")

1. **Ứng viên**: prefs `proxy_gateway` (ưu tiên) + gateway tự dò (broadcast UDP 18099 + quét subnet
   `/24` cổng `18081`,`18083`; throttle ≤1 lượt/60 s, cache quét 10 phút; chế độ `tv` không dò).
2. **Chấm điểm**: mỗi tuyến đo **2 lần trên 2 kết nối mới** (CONNECT + TLS thật tới
   `speed.cloudflare.com`), tải 128 KB/lần, điểm = **min** hai lần; mẫu <16 KB coi như 0. Điểm nhớ
   5 phút, mỗi nhịp 60 s đo tối đa 2 tuyến.
3. **Chọn**:
   - còn gateway LAN sống ⇒ **gateway điểm cao nhất** (hysteresis 15% chỉ giữa các gateway);
   - đường TV (`127.0.0.1:1081`) **được thi đấu** nếu đạt `TV_WIN_MIN_KBPS = 2000` **và** ≥1,5× gateway
     tốt nhất;
   - không còn gì ⇒ `:0` (TV dùng mạng thẳng); nếu có `lastGood` còn sống thì giữ nó.
4. **Giữ trạng thái**: nhịp 60 s (`VpnKeepAlive`, exact alarm + `setExactAndAllowWhileIdle`), guard
   `com.privatevpn.app.guard` (package riêng, kiểm cổng + đặt gateway khi 1081 chết), nút **Refresh**
   = chấm lại toàn bộ tuyến + đo lại + khai báo lại băng thông.

## 4. Bằng chứng đã đo (máy thật)

| Nội dung | Số liệu |
|---|---|
| Gateway Windows qua UDP | 400 KB/s – 1,26 MB/s tuỳ thời điểm (0,5–10 Mbps); 3 luồng song song từng đạt **21,8 Mbps** |
| Cầu WS qua Cloudflare | 20–30 KB/s mỗi node, tổng 3 node 0,5–1,57 Mbps; links=96 tệ hơn 24 khi WS-only |
| Failover tắt gateway Windows | proxy `.5` → Mac `.6` sau **20 s** |
| Failover bật lại gateway | proxy `.6` → `.5` sau **20 s**; log `đo .5 = 903 kbps`, `.6 = 0 kbps (SocketTimeout)` |
| Xác thực đường đo | `.5 = 531 kbps (2 kết nối: 531 / 919)` ⇒ lấy min, không lấy burst 919 |
| Keepalive ở nền (Xiaomi chặn FGS) | sau `am kill`: +4 s yêu cầu service, +9 s `local-proxy: nghe 127.0.0.1:1081`, +70 s `HTTP proxy sẵn sàng`; `/proc/net/tcp` có `:0439 … 0A` |
| Tự dò sau reboot TV | `22:02:33 tự dò được gateway 192.168.100.5` → `22:05:54 chọn .5 (299 kbps)` |
| FPT Play | trang chủ + chi tiết phim + **phát video** (4 khung hình liên tiếp khác nhau) qua gateway |
| TV360 | trang chủ + danh sách kênh OK; phát phụ thuộc node3/băng thông |
| Netflix | app báo **-13**: TV không có OEM cert (chỉ Widevine L3) ⇒ không thể sửa bằng IP/APK |

## 5. Giới hạn đã biết

1. **UDP bị chặn theo đợt** (GFW/QoS): mở thì 10–13 Mbps, chặn thì chỉ còn WS 0,1–0,25 Mbps/luồng.
   Monitor tự thử lại mỗi phút.
2. **Netflix**: không có cách nào trên chính TV này (thiếu cert OEM). Giải pháp: box/stick đã chứng
   nhận cắm HDMI, hoặc iPad + adapter HDMI.
3. **Bluetooth**: TV không có chip BT (chỉ có prop AOSP) ⇒ chuột phải dùng USB / đầu thu 2.4 GHz.
4. **TV không có TUN** ⇒ chỉ proxy hệ thống; app nào đi thẳng (media native) thì proxy không phủ.
5. **DHCP đổi IP liên tục** ⇒ không hard-code IP gateway ở bất kỳ đâu (app tự dò).

## 6. Runbook kiểm tra sau reboot / sự cố

```powershell
# 0) repo & trạng thái
cd C:\Users\Minhn\FPTVPN; git log --oneline -1

# 1) TUN còn sót? (phải KHÔNG còn)
Get-NetAdapter -IncludeHidden | Where-Object Name -match 'flowvpntun'
Find-NetRoute -RemoteIPAddress 172.67.175.138 | Select-Object -First 1 InterfaceAlias,IPAddress

# 2) autostart/monitor + task
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -match 'gateway-(autostart|monitor)' } | Select-Object ProcessId,CommandLine
schtasks /query /tn "VPNFlow Gateway Watch" /fo LIST

# 3) gateway sống?
foreach ($p in 18081,1081,1101,1102,1103) { "$p = " + ((Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count) }
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' }).IPAddress
curl.exe -s --max-time 20 -x "http://${ip}:18081" https://1.1.1.1/cdn-cgi/trace     # phải có ip=, loc=VN

# 4) TV
$adb = "C:\Users\Minhn\Android\sdk\platform-tools\adb.exe"
& $adb connect 192.168.100.104:5555
& $adb -s 192.168.100.104:5555 shell "settings get global http_proxy"
& $adb -s 192.168.100.104:5555 exec-out "cat /sdcard/Android/data/com.privatevpn.app.tv.dev/files/diagnostics.log" |
  Select-String -Pattern 'tuyến|keepalive' | Select-Object -Last 10

# 5) nếu gateway chưa lên
powershell -NoProfile -ExecutionPolicy Bypass -File tools\lan-proxy\gateway-autostart.ps1 -Once
Get-Content .tmp\gw-autostart.log -Tail 5; Get-Content .tmp\gw-monitor.log -Tail 5
```

## 7. Thay đổi lớn & commit

| Commit | Nội dung |
|---|---|
| `32200cd0` | 2 script dọn TUN (route rác 24k) |
| `6a0ae30d` | app: 3 chế độ đường ra + `lan-proxy` round-robin |
| `73bc6299` | fix `ProxyDirector` dò cổng trên luồng nền (tránh `:0`) |
| `51158452` | tunnel chết ⇒ bàn giao proxy cho gateway (không kéo về `:0`) |
| `fc9cc6ac` | nút Refresh: đo lại + khai báo lại băng thông |
| `5f090033` | gateway Mac trong danh sách fallback |
| `aa358c5d` | chấm điểm chất lượng tuyến (CONNECT + TLS) |
| `50badd0a` | auto thực sự chọn theo điểm (hết hạn điểm, hysteresis) |
| `789a75fb` | app tự dò gateway (broadcast UDP) + route domain fallback + `-direct` |
| `64ebdb47` | quét subnet bắt cả gateway Mac (18081/18083) |
| `89a1a9f1` | theo handoff Mac: discovery theo nhu cầu + exact alarm tự hồi tunnel |
| `f638046f` | lock doc v99 |
| `87febe0d` | **v100**: phương án B + xác thực đường đo (2 kết nối, min) |
| `9979fb1b` | autostart + wake-lock + single-instance |
| `fe0f03b6` | lock doc cuối (v100) |
| `f09c4f20` | DNS TCP fallback + health-check TCP (windows/hysteria-relay) |
| `759521f8` | docs thiết kế gateway client (từ Mac) |

## 8. Việc còn treo

- **Netflix**: chờ hướng từ Mac (box/stick hoặc iPad HDMI). Không sửa được trên TV.
- **Băng thông**: khi UDP bị chặn thì FPT Play/TV360 chỉ chạy được ở mức thấp; cần node/đường khác.
- **Mac verify** 2 handoff (đã gửi `flowvpn-notify`, chưa có hồi âm).
- **Publish cho user**: chờ chủ dự án chốt (xem §9.4).

## 9. Cập nhật 24/10/2026 — điện thoại làm gateway + sửa IPv6

### 9.1 Lỗi "VPN Connected nhưng Google/YouTube bị chặn" (đã sửa, `e133fd61`)

Đo trên Galaxy Z Fold5 (Android 16):
```
curl -4 google  = 302 · youtube = 200     (IPv4 qua tunnel: TỐT)
curl -6 google  = 000                      (IPv6: hỏng)
```
Nguyên nhân chuỗi:
1. Tunnel cũ chỉ khai route IPv4 ⇒ gói IPv6 của Google/YouTube **đi thẳng** ra mạng toà nhà (bị chặn).
2. Khi đưa IPv6 vào tunnel (`fd00:1::1`) thì lại hỏng hơn: **node1 có địa chỉ IPv6 nhưng không ra được
   internet IPv6** (đo `curl -6` từ node = 000) ⇒ app chọn IPv6, bị reset.

Cách sửa cuối (v101→v103): **bắt IPv6 vào TUN** (`addAddress fd00:1::1` + `addRoute "::"`) để không
lọt ra ngoài, nhưng **không cấu hình IPv6 cho stack Go** (`HY_TUN_IPV6 = ""`) ⇒ gói IPv6 bị drop
trong tunnel, app fail nhanh rồi happy-eyeballs chuyển IPv4. Khi node có IPv6 egress thật chỉ cần đặt
`HY_TUN_IPV6 = "fd00:1::1/64"`.

### 9.2 Điện thoại làm gateway cho TV (`fccad620`, versionCode 103)

- `LocalProxy` mở thêm listener LAN `0.0.0.0:18081` (cùng handler) + trả lời **discovery UDP 18099**
  (`FLOWVPNGW?` → `FLOWVPNGW1 18081`) ⇒ TV tự dò ra điện thoại như laptop/Mac, không nhập IP tay.
- Chỉ phục vụ dải private; tự chối IP ngoài LAN.
- `LanGatewayAuto`: tự bật/tắt theo mạng — nhận diện dải `192.168.100.*` từ `LinkProperties` của
  **mọi** mạng (không cần SSID/quyền vị trí); vào mạng nhà ⇒ bật, ra mạng khác ⇒ tắt. Áp lại mỗi
  nhịp keepalive 60 s.
- `Settings → Chia sẻ điện thoại làm gateway LAN` (Switch) + 5 ngôn ngữ.
- **Lỗi đã gặp và sửa**: `syncLanGateway()` ban đầu chặn theo `tunnelAvailable()` (cổng 1082) — trên
  điện thoại app chạy chế độ TUN nên không có 1081/1082 ⇒ listener LAN không bao giờ mở. Đã bỏ điều
  kiện này (ở chế độ TUN, socket của app tự đi qua tun0 nên vẫn vào VPN).

**Bằng chứng chạy thật (v103):**
```
log (điện thoại): lan-gateway: mạng NHÀ -> BẬT vai trò gateway
                  lan-gateway: nghe 0.0.0.0:18081
                  lan-gateway: trả lời discovery UDP 18099
từ laptop : curl -x http://192.168.100.101:18081 https://1.1.1.1/cdn-cgi/trace
            -> ip=103.173.155.50 loc=VN ; 1MB = 440.902 B/s ; youtube=200
trên TV   : quét subnet thấy gateway 192.168.100.5:18081, .6:18081, .6:18083, 192.168.100.101:18081
            đo 192.168.100.101:18081 = 223 kbps (2 kết nối: 223 / 348)
```
TV chọn gateway theo điểm đo (lúc đo: Mac `.6`=363 kbps > điện thoại 223 > Windows `.5`=0).

### 9.3 Trạng thái app Android hiện tại

| Kênh | versionCode | Ghi chú |
|---|---|---|
| modern (điện thoại) | **103** (release, cùng keystore) | đã cài trên Galaxy Z Fold5, giữ nguyên đăng nhập khi nâng cấp |
| tv | 100 | TV không cần IPv6/LAN gateway (không TUN) — chỉ cần auto gateway + keepalive |
| legacy (Fire OS) | chưa build lại | cần build nếu phát hành cho Fire TV |

### 9.4 Về việc publish cho user

Bản 103 có **2 lỗi thật đã sửa** (Google/YouTube chết khi VPN bật trên máy có IPv6; điện thoại làm
gateway được) ⇒ **nên phát hành**. Quy trình theo `docs/PUBLISHER_PROCESS.md` (harness Windows phát
hành Windows + Android): tăng `versionName` (1.4.5 → 1.4.6), build `modern` + `legacy` release, kiểm
chữ ký/hash, rồi upload theo kênh. Chờ chủ dự án xác nhận thời điểm.

> **ĐÃ PHÁT (24/10/2026):** bản phát hành là **1.4.7 / versionCode 105** (không phải 1.4.6 — cặp
> `android 1.4.6` đã có artifact khác từ 19/10). Xem `docs/RELEASE_ARTIFACTS_2026-10-24.md`.

## 10. Cập nhật 24/10/2026 (khuya) — "đừng bao giờ để gateway/relay của laptop chết"

Sự cố: laptop vào Modern Standby **00:20 → 02:44**, gateway chết **2 h 17 m**, TV mất mạng, chủ dự án
phải tự mở app. Ba lỗi gốc + cách sửa + số đo nghiệm thu nằm ở
**`docs/GATEWAY_WINDOWS_NEVER_DIE_2026-10-24.md`**. Tóm tắt:

1. Task Windows **không được chạy khi dùng pin** và **không chạy bù** nhịp bị lỡ khi ngủ ⇒ sửa bằng
   `tools/lan-proxy/install-gateway-task.ps1` (3 trigger, gồm sự kiện thức dậy).
2. Relay WS 1101/1102 **chưa bao giờ lên được** vì file cấu hình do monitor sinh có **BOM** (Go json
   từ chối) ⇒ chỉ còn 1 đường UDP; sửa: ghi UTF-8 **không BOM**.
3. Monitor không dọn process "xác" (sống nhưng không bind) và không xác nhận đã LISTEN ⇒ sửa: đợi
   cổng trống, chờ LISTEN 30 s, giết đúng pid khi hỏng, dọn zombie, nhịp tim + tự bật lại khi treo.


