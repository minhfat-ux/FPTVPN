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
| `tools/lan-proxy/gateway-monitor.ps1` | con canh: mỗi 60 s kiểm **egress thật** từng cổng, hỏng 2 nhịp thì dựng lại relay/lan-proxy | `powershell -NoProfile -ExecutionPolicy Bypass -File tools\lan-proxy\gateway-monitor.ps1` (log `.tmp\gw-monitor.log`) |
| `tools/lan-proxy/gateway-autostart.ps1` | tự bật gateway khi ở mạng nhà (SSID `KT-617` hoặc IP `192.168.100.*`), tự tắt khi ra mạng khác; giữ **wake-lock** chống ngủ; mutex 1-instance | Scheduled Task `VPNFlow Gateway Watch` (5 phút) + shortcut Startup; log `.tmp\gw-autostart.log` |
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
- **Điện thoại Android**: APK đã build (`app-modern-debug.apk`, versionCode 99) — chưa cài; khi cần:
  cắm USB + `adb install` + `settings put secure always_on_vpn_app com.privatevpn.app.dev`.
- **Băng thông**: khi UDP bị chặn thì FPT Play/TV360 chỉ chạy được ở mức thấp; cần node/đường khác.
- **Mac verify** 2 handoff (đã gửi `flowvpn-notify`, chưa có hồi âm).
