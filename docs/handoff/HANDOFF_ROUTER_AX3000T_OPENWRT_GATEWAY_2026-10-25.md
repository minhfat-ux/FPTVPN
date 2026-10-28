# Bàn giao — Xiaomi AX3000T RD03v2: flash OpenWrt + gateway chọn node (2026-10-25)

## 1. Kết quả
- Router AX3000T (RD03v2 / IPQ5018) đã flash **OpenWrt** (ADCDS
  `openwrt-xiaomi-ax3000t-rd03v2`, release `v2.0.2`, kernel 6.18.55).
  Trước đó không có mainline OpenWrt cho bản này; chỉ port cộng đồng chạy được
  ở **trạng thái nhà máy chưa cấu hình** (netmode 0). Router đã cấu hình
  (netmode 4) thì bộ cài từ chối ở cổng "V2 CAP path".
- Wi-Fi: SSID `FPT_Minh_Router`, WPA2, country VN; LAN `192.168.1.1`.
- WAN: DHCP từ ONT (`192.168.100.x`).
- Gateway: relay node-1 (socks `1085`) + node-2 (socks `1081`), sing-box TPROXY
  `7893` + HTTP/SOCKS `18081`; **định tuyến chọn lọc** theo domain
  (`tools/router/sing-box-selective.json`) — chỉ domain bị chặn đi qua node,
  còn lại đi thẳng WAN.
- Daemon chọn node `tools/router/health.sh`: đo mỗi 30 s, đổi node khi node
  hiện tại chết hoặc node kia nhanh hơn ≥25%; cả 2 fail 3 lần thì restart relay.
- **node-3 không dùng** cho gateway này (FPT Play/TV360 bị ASN node-3 chặn; chỉ
  YouTube hợp).

## 2. Quy trình flash (Wifi-only, macOS)
1. Reset router về nhà máy (giữ nút ~10 s), **không mở app Mi WiFi** để router
   ở nguyên wizard.
2. Nối Mac vào AP nhà máy `minet_rd03v2_37ec` (mở, không mật khẩu) hoặc
   `minet_rd03_4dfb`; kiểm tra `http://192.168.31.1/cgi-bin/luci/api/xqsystem/init_info`
   phải có `"inited":0`.
3. Bộ cài `ADCDS/xiaomi-openwrt-install` viết cho Linux; trên macOS phải vá
   `chain.py` (`_route_field`/`local_mac` dùng `route -n get` + `ifconfig`) và
   `install.py` (`detect_transport`, `interface_ipv4_networks`, `default_gateways`,
   `discover_linklocal`). Ảnh tải sẵn và chạy `--release v2.0.2 --offline`
   vì lúc flash không có internet.
4. Trong lúc pivot, bộ cài in SSID tạm `OpenWrt-RD03v2-Installer` / key
   `rd03v2install`; phải chuyển Mac sang mạng đó để flash tiếp.

## 3. Sự cố đã gặp và cách xử lý
| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| TV mới vào mạng không nhận IP | nft TPROXY bắt luôn DHCP broadcast | thêm `ip daddr 255.255.255.255 return`, `udp dport 67/68 return` |
| Cả nhà mất internet khi tunnel chết | full-tunnel toàn bộ traffic | chuyển sang định tuyến chọn lọc, `final: direct` |
| FPT Play mở app nhưng đen thui | TV bị trỏ proxy vào gateway Windows `192.168.1.106:18081` đã chết → timeout 15 s | `adb shell settings put global http_proxy 192.168.1.1:18081` |
| Relay chết im lặng (socks vẫn mở, data hỏng) | process sống nhưng WS link chết | daemon restart relay sau 3 lần fail; procd respawn |
| DNS vòng lặp (dnsmasq → sing-box → node cần DNS) | tunnel DNS phụ thuộc relay | bỏ DoT nội bộ, để dnsmasq đi thẳng; relay pin `api.meetflowai.site` trong `/etc/hosts` |

## 4. Bằng chứng đo được (2026-10-25)
- Từ router: `curl -x http://127.0.0.1:18081` → Facebook `200` 2.3 s,
  TikTok `200` 1.5 s, YouTube `204` 1.45 s; `http://www.baidu.com` `200` 0.19 s
  (đi thẳng).
- Tốc độ node-2 qua socks: ~460 KB/s (3 MB file).
- TV (ADB `192.168.1.124`): FPT Play hiện `LIVE`, `Kênh gợi ý`,
  `Còn 26 phút nữa`; TV360 hiện danh sách phim (`Tháng 10 Trên TV360`, ...);
  proxy giữ `192.168.1.1:18081` sau 45 s.

## 5. Việc còn mở
- Guard/Launcher trên TV có thể tự đổi `http_proxy` sang gateway nó quét thấy
  (kể cả gateway chết). Cần sửa Guard để chỉ chọn gateway **qua được probe
  HTTP 200**, không chỉ TCP mở.
- Chưa test lại sau reboot router (các service đã enable/procd respawn).
- Chưa đo lại FPT Play/TV360 sau nhiều giờ; phụ thuộc chất lượng node-1/2.

## 6. Bảo mật
- Không đưa credential hysteria (`password`, `obfs`) hay mật khẩu admin vào
  repo/docs. File `node1.json`/`node2.json` chỉ nằm trên thiết bị
  (`/etc/flowvpn/`).

## 7. Bổ sung sau khi test TV thực tế (TV360)
- TV360 phát hiện VPN của node-1/node-2 ⇒ báo **C-310 "Nội dung chỉ cho phép lãnh thổ
  Việt Nam"**. Theo tài liệu cũ và test lại: **TV360 chỉ phát được qua node-3**
  (`socks 1083`), trong khi FPT Play phải đi node-1/node-2 (node-3 bị FPT Play chặn).
- Cấu hình đã đổi: `*.tv360.vn`, `viettel*`, `vtvcab`, `vtv`, `ateme.*` → relay **node-3**;
  FPT Play/YouTube/Facebook/TikTok → relay node-1/2 (`node`).
- Thêm relay node-3 (`node3.json`, `socks 127.0.0.1:1083`) chạy bằng procd
  `/etc/init.d/flowvpnrelay3`; daemon chỉ đổi `server_port` của outbound `node`
  (không đụng `node3`).
- Kết quả: TV360 phát được nội dung; FPT Play (LIVE/Kênh gợi ý) vẫn OK.

## 8. DNS chọn lọc (Google/Firebase trong suốt)
- Vấn đề: DNS nhà (ONT) bị đầu độc với Google/Facebook ⇒ client nhận IP rác, TPROXY đi
  tunnel tới IP rác nên relay từ chối. Đặt proxy thủ công thì được nhưng nhiều app
  (Firebase/FCM) không đi theo proxy.
- Giải pháp: thêm listener DNS trong sing-box (`dns-in` `127.0.0.1:5353`, DoT
  `tls://8.8.8.8` detour `node`) + rule `hijack-dns`; dnsmasq chỉ chuyển các domain
  bị chặn sang listener này (`server=/google.com/127.0.0.1#5353`…), còn lại vẫn DNS nhà.
  ⇒ Tunnel chết chỉ ảnh hưởng các domain bị chặn, không mất internet toàn mạng.
- Đo sau khi làm: `www.google.com` → IP thật `142.251.x`; transparent (không proxy)
  `google.com/generate_204` = `204`, `googleapis.com` = `404` (TLS OK),
  `facebook.com` = `200`, `tiktok.com` = `200`; TV FPT Play vẫn `LIVE`.
- Lưu ý: rule `port 443 -> node` (catch-all HTTPS) khiến cả HTTPS nội địa (vd baidu)
  đi tunnel (chậm hơn ~5s); có thể bỏ catch-all khi mọi app đều đi proxy.

## 9. Tối ưu tốc độ (sau khi TV bị giật video)
- Đo băng thông từng node (1 MB qua socks): node-2 ~25 KB/s, node-1 ~47–128 KB/s, node-3 ~63–114 KB/s.
  Nguyên nhân giật là **đường WS relay qua Cloudflare từ ISP hiện tại** (dao động 0,3–1 Mbps),
  không phải CPU router.
- Thử `links: 2` cho relay ⇒ băng thông **giảm** (35 KB/s) và RAM còn 1,4 MB (nguy hiểm) ⇒ giữ
  `links: 1`.
- Đã **tắt relay node-2** (chậm nhất) để giải phóng ~20 MB RAM (còn ~20 MB trống), daemon chỉ
  probe node-1.
- Chia route theo tốc độ: TV360 + FPT Play KHÔNG cùng node — TV360 → node-3; FPT Play → node-1;
  YouTube/Google/Facebook/TikTok/… + catch-all 443 → **node-3** (nhanh nhất).
- Giới hạn: video HD có thể vẫn giật khi đường relay yếu; muốn mượt cần node/kênh có uplink tốt hơn.

## 10. FPT Play lỗi "Hệ thống tạm thời chưa thể xử lý" — bỏ catch-all 443
- Triệu chứng: FPT Play mở app nhưng báo "Thao tác không thực hiện được / Hệ thống tạm thời
  chưa thể xử lý yêu cầu"; log sing-box: relay `socks5 request rejected, code=4` cho các
  kết nối tới **IP CDN** `103.78.126.19x:443`.
- Nguyên nhân: FPT Play lấy danh sách IP CDN từ API rồi **kết nối thẳng bằng IP**; rule
  catch-all `port 443 -> node` đẩy các kết nối IP này vào relay, mà relay chỉ nhận đích dạng
  domain ⇒ reject ⇒ app lỗi.
- Xử lý: **bỏ catch-all `port 443`** khỏi route. Kết nối IP không khớp domain rơi về
  `final: direct` ⇒ CDN FPT Play đi thẳng, app chạy lại; các domain quốc tế vẫn khớp rule
  domain → node.
- Đo lại: FPT Play có nội dung; TV360 `C-310` = 0; transparent `google/generate_204` = 204,
  `facebook.com` = 200.
- TV giữ proxy `192.168.1.1:18081` (router) để app đi qua mixed inbound (domain-based).

## 11. Ổn định cho FPT Play (sau khi TV báo RD_002 / giật)
- Thử `links: 2` cho node-1: **4/4 probe OK nhưng băng thông tụt còn 4–7 KB/s** ⇒ không dùng;
  giữ `links: 1` (node-1 ~60–128 KB/s lúc tốt, dao động mạnh theo mạng toà nhà).
- `daemon` cũ tự đổi node và **restart sing-box** mỗi lần switch ⇒ làm rớt kết nối đang xem.
  Thay bằng **watchdog không đổi node**: chỉ probe node-1 (FPT Play) và node-3 (TV360), restart relay
  khi fail 3 lần liên tiếp; không sửa config, không restart sing-box.
- Tắt node-2 (chậm, tranh RAM); route: FPT Play → node-1 (1085); TV360 + quốc tế + catch-all 443 → node-3 (1083).
- Theo dõi 4 phút sau khi đổi: FPT Play proxy `301` ổn định 1,5–3,7 s; node-1 `204` 8/8 lần; RAM trống ~26 MB.
- Kết luận: ổn định ở mức "xem được", **không lên FullHD** và đôi lúc giật/RD_002 khi đường ISP→VN yếu
  (mạng toà nhà không ổn định) — không phải lỗi cấu hình router.

## 12. RD_002 sau ~5 phút — nguyên nhân & xử lý
Bằng chứng log:
1. `open connection to 103.78.126.197:443 using outbound/socks[node3]: socks5: request rejected, code=4`
   — FPT Play lấy **IP CDN** từ API rồi kết nối thẳng bằng IP; relay chỉ nhận đích dạng **domain**
   ⇒ reject ⇒ hết buffer (~5 phút) là RD_002.
2. Outbound `node3` từng bị **sai cổng 1085** (thay vì 1083) do lệnh sed trước đó, nên traffic
   "node3" thực chất vào node-1; log `dial tcp 127.0.0.1:1085: connection refused`.
3. Tunnel node-1 thỉnh thoảng rớt: `dial wss://api.meetflowai.site/relay/vn1hy: i/o timeout`
   ⇒ license/API FPT Play fail đúng lúc (license TTL ngắn).

Xử lý:
- Sửa `node3` = `127.0.0.1:1083`.
- Thêm rule `ip_cidr` cho dải CDN FPT (`103.78.126.0/23`, `103.78.127.0/24`,
  `103.116.120.0/23`, `103.116.121.0/24`) → **direct** (relay không nhận IP; CDN VN vẫn phục vụ).
- Giữ node-1 cho API/license; watchdog restart relay1 khi tunnel chết 3 lần.
- Đo lại: FPT Play proxy `301` ~3,5 s; relay `1083`/`1085` đều LISTEN.

### 12.1. Kết quả theo dõi sau khi sửa (10 phút xem liên tục)
- FPT Play proxy: `301` 18/19 mẫu (1 mẫu `000`/8 s do mạng chập chờn), độ trễ 1,6–4,1 s.
- `socks5 code=4` (reject IP CDN): **0 lần mới**.
- `127.0.0.1:1085 connection refused` (sai cổng node3): **0**.
- Tunnel drop (`i/o timeout`): **0** trong cửa sổ theo dõi.
- **TV: `RD_002` = 0** trong ~10 phút xem ⇒ nguyên nhân đã xử lý đúng.

## 13. Tự khôi phục sau khi mạng toà nhà rớt (nguyên nhân RD_002 tái diễn)
- Quan sát: FPT Play xem ổn ~30 phút rồi RD_002. Health log có đúng một nhịp `node1 FAIL` —
  khớp thời điểm license FPT Play (~30 phút) cần làm mới, nhưng tunnel node-1 vừa rớt ⇒ renewal fail.
- Nguyên nhân gốc: **mạng toà nhà chập chờn** làm các WS relay chết im lặng (link chết nhưng process sống).
- Đã thêm tự khôi phục:
  1. `/etc/hotplug.d/iface/99-flowvpn`: khi `wan` **ifup** ⇒ restart relay1/relay3 + watchdog ngay
     (không chờ probe).
  2. Watchdog mới: kiểm tra WAN trước (`ping 192.168.100.1`); WAN down thì chỉ log, không restart
     relay (tránh thrash); WAN up thì probe 20 s/lần, **2 lần fail liên tiếp** ⇒ restart relay.
  3. Bỏ cron restart định kỳ 12 phút (gây blip vô ích); giữ procd respawn cho relay.
- Kỳ vọng: sau khi mạng toà nhà rớt, relay tự nối lại trong vài giây; FPT Play bấm "Thử lại"
  là phát tiếp (tối đa ~1 phút gián đoạn).

### 13.1. Theo dõi 30 phút sau khi cắm lại router (ngày 25/10)
| Chỉ số | Kết quả |
|---|---|
| TV `RD_002` | **0 lần / 30 phút** |
| `socks5 code=4` (reject IP CDN) | **0** |
| `127.0.0.1:1085 connection refused` | **0** |
| WAN down | **0** |
| FPT Play proxy | `301` 28/30 mẫu, trễ 1,6–7,7 s |
| Blip | 2 lần `000`/8 s (16:20, 16:23); watchdog restart relay1 1 lần lúc 16:24 rồi tự hồi |

⇒ RD_002 đã được xử lý; còn lại chỉ là blip ngắn của đường mạng, không làm hỏng phiên xem.

## 14. "Mất hết mạng" đột ngột — router hết RAM (OOM), và cách cứu hộ
- Triệu chứng: đang xem bình thường thì cả nhà mất mạng; Mac tự nhảy về Wi-Fi nhà; không join được
  `FPT_Minh_Router` (dù iwinfo vẫn báo AP lên).
- Chẩn đoán qua SSH WAN (`root@192.168.100.3` — WAN 22/80 **mở**):
  - `dmesg | grep -c "out of memory"` = **11**; `MemAvailable` còn **488 kB**; load average **13–14**.
  - hostapd/dnsmasq ở trạng thái D (đói bộ nhớ/IO) → Wi-Fi + DNS chết dây chuyền.
- Xử lý: reboot router ⇒ load 1,2; RAM trống ~18 MB; internet `200`; TV tự nối lại; FPT Play proxy
  `301`/1,6 s.
- Phòng ngừa đã thêm:
  1. `cron`: `0 4 * * * /sbin/reboot` (reboot đêm, xả RAM tích luỹ).
  2. Watchdog: nếu `MemAvailable < 6 MB` ⇒ `drop_caches` + restart relay1/relay3.
- Cứu hộ không cần Wi-Fi: **SSH qua WAN `192.168.100.3`** (nếu Wi-Fi/hostapd chết vẫn vào được).

### 14.1. Vì sao 175 MB RAM vẫn OOM dù chỉ vài client
- RAM không tiêu vào client mà vào chính router: OpenWrt + driver Wi-Fi ath11k + hostapd ~90–100 MB;
  sing-box ~26 MB; 2 relay flowvpnrelay ~27 MB; dnsmasq/netifd/logd/kernel slab/page cache phần còn lại
  ⇒ chỉ còn ~18 MB trống, chạy vài giờ là kernel cache làm cạn ⇒ OOM.
- Đã thêm **zram-swap 87 MB** (`apk add zram-swap`, `swapon` OK) ⇒ buffer chống OOM; kèm cron reboot
  04:00 và watchdog RAM <6 MB.
- Đo sau khi bật: free ~35 MB, swap 87 MB (chưa dùng), FPT Play proxy `301`/1,9 s, TV vẫn kết nối.
- Nếu cần nhẹ hơn nữa: bỏ relay node-3 (mất TV360, −13 MB), hoặc đẩy tunnel sang Mac/mini-PC.

## 15. Netflix trên iPad bị văng giữa chừng
- Bằng chứng: iPad `192.168.1.157` có IPv6 ULA (fdba:…); DNS trả **AAAA toàn cầu** cho
  `*.netflix.com` trong khi router **chỉ TPROXY IPv4** ⇒ iPad ưu tiên IPv6, kết nối đi thẳng
  (không qua tunnel) ⇒ tắc ⇒ app thoát.
- Cấu hình trước đó cũng **chưa có domain Netflix** trong rule ⇒ CDN Netflix không đi node.
- Xử lý:
  - Thêm `netflix.com, netflix.net, nflxext.com, nflximg.com, nflximg.net, nflxso.net,
    nflxvideo.net` → outbound **node3**; DNS các domain này qua tunnel (`127.0.0.1#5353`).
  - **Tắt IPv6 LAN** (`dhcp.lan.ra/dhcpv6/ndp = disabled`) và bật `filter_aaaa=1` để client chỉ
    dùng IPv4 ⇒ mọi kết nối đều đi qua TPROXY/proxy.
  - Đo lại: `www.netflix.com` qua proxy `302` (~3 s), FPT Play `301` (không ảnh hưởng).
- Nếu sau này cần IPv6 nội bộ, phải làm TPROXY cho IPv6 hoặc bỏ filter AAAA.

## 16. Tối ưu thêm cho HD (chọn node theo băng thông, giảm tải tunnel)
- Daemon chọn node nay đo **băng thông thật** (600 KB qua socks mỗi ~5 phút) giữa node-1/node-2;
  đổi node khi node kia nhanh hơn ≥25% và >20 KB/s. node-3 cố định cho TV360.
- Quốc tế chung (YouTube/Google/Facebook/TikTok/FPT Play) đi **node nhanh nhất**, không ghim node-3.
- Telemetry/quảng cáo đi thẳng để giảm tải tunnel: `miwifi.com, xiaomi.com, mi.com, adsplay.net,
  doubleclick.net, googleadservices.com, googletagmanager.com, google-analytics.com, crashlytics.com,
  applovin.com, unity3d.com`.
- Đo từ router sau khi đổi: proxy 65–125 KB/s (dao động), FPT Play `301`, RAM trống ~11 MB.
- Giới hạn: băng thông đường VN (Cloudflare WS) là trần; muốn hơn phải đổi exit/hạ tầng.

## 17. TVFlow Home 3.10 — sửa rule chọn gateway (TV không nhảy sang máy mất mạng)
- Triệu chứng: TV nhảy `http_proxy` sang gateway Windows `192.168.1.106:18081` dù máy đó không có internet;
  FPT Play đứt.
- Nguyên nhân trong code cũ (3.9):
  1. `LocalGatewayProxy.probe()` chỉ CONNECT rồi đọc chữ " 200" — proxy **mở cổng nhưng upstream chết**
     vẫn trả 200 nên bị coi là "sống" (và LAN nhanh ~1 ms nên luôn thắng router ~2 s).
  2. `ensureProxy()` chạy **trên main thread** ⇒ mọi probe ném `NetworkOnMainThreadException`, bị catch
     im lặng ⇒ lớp quản lý proxy của launcher thực tế **chưa từng hoạt động**.
  3. Danh sách gateway hardcode dải `192.168.100.x` (mạng nhà), không có gateway router `192.168.1.1`.
- Sửa trong 3.10 (versionCode 31):
  - Probe **end-to-end**: `GET http://www.gstatic.com/generate_204` qua gateway, phải nhận `204` thật
    (timeout 3,5 s) ⇒ gateway mất mạng bị loại.
  - Chạy `ensureProxy()` trên **thread nền** (`kickProxy`, có cờ chống chồng).
  - Gateway ứng viên lấy **gateway mặc định của mạng hiện tại** (`ConnectivityManager`/`LinkProperties`)
    trước, rồi mới tới danh sách cũ; giữ nguyên sticky 2 lần fail.
  - Cần `pm grant com.tvflow.launcher android.permission.WRITE_SECURE_SETTINGS` (grant không tự có sau khi cài).
- Kiểm chứng: đặt `http_proxy=192.168.1.106:18081` (chết) ⇒ trong ~7 s tự về `192.168.1.1:18081`;
  FPT Play load nội dung bình thường trên TV.

## 19. TVFlow Home 3.15 — overlay logo FPT khi xem FPT Tubeflow
- Yêu cầu: khi chạy **FPT Tubeflow** (`org.smarttube.stable`) luôn có logo FPT nhỏ overlay trên video.
- Cách làm: `HomeWatcherService` (AccessibilityService đã bật sẵn) nhận `TYPE_WINDOW_STATE_CHANGED`;
  khi package == `org.smarttube.stable` thì `addView` một `ImageView` logo `res/drawable-nodpi/fpt_logo.png`
  kiểu **`TYPE_ACCESSIBILITY_OVERLAY`** (không cần quyền SYSTEM_ALERT_WINDOW), góc phải trên, alpha 0,85,
  không focus/không chạm. Khi app khác lên foreground thì gỡ overlay.
- Chống vòng lặp tự ẩn: bỏ qua event do chính package launcher phát ra (cửa sổ overlay của mình),
  chỉ ẩn overlay khi `MainActivity` của launcher resume (hook `homeShown/homeHidden`).
- Đã cài 3.15 trên 2 TV công ty reachable (`.109`, `.113`); TV `.115` cần bật lại ADB (Android 9 mất
  ADB-over-TCP sau reboot); TV nhà chưa cài (khác mạng).
- Lưu ý: logo hiển thị khi Tubeflow ở foreground (kể cả menu); ẩn khi về TVFlow Home.

## 20. RD_002 "sau vài phút" — chuỗi nguyên nhân thật + watchdog v3 (2026-10-28)

Triệu chứng: FPT Play xem vài phút thì RD_002; sau đó có đợt "TV mất mạng", "FPT Play không lên",
"Facebook siêu chậm".

Nguyên nhân (theo thứ tự phát hiện, đều có log):

1. **Watchdog tự failover + restart cả 3 relay giữa lúc xem.** `/var/log/flowvpn-health.log` ghi
   `CF FAILOVER 104.21.83.112 -> 172.67.175.138` (17:33:34) và ngược lại (17:41:03). Mỗi lần failover
   restart cả 3 relay ⇒ mọi kết nối đang phát bị cắt ⇒ RD_002 đúng nhịp "vài phút".
   Sâu xa: có **2 tiến trình `health.sh` chạy song song** (procd + hotplug ifup restart chồng lên) và điều
   kiện "cả 1081+1085 cùng đóng" bị kích hoạt trong cửa sổ vài giây relay restart ⇒ vòng lặp restart,
   load 4+, router **tự reboot** (uptime về 0).
2. **`node3` trỏ nhầm cổng 1081** (đúng là 1083) ⇒ toàn bộ traffic 443 (catch-all) + TV360 dồn vào node2,
   đúng relay FPT Play dùng.
3. **DNS mặc định đi DoT qua tunnel** (1–4 s/lookup; đo `whippet.bsp.xiaomi.com` 3,59 s) ⇒ app timeout.
4. **Config DNS có `detour: direct`** (sai với sing-box 1.14) ⇒ sing-box **crash loop** sau reboot
   (`FATAL start service: start dns/udp[local]: detour to an empty direct outbound makes no sense`) ⇒ TV mất
   mạng hoàn toàn vì traffic tproxy không có ai nhận.
5. **TV cấu hình proxy trỏ địa chỉ cũ mạng ONT** (`192.168.100.101:18081`, `.100.5`, `.100.6`) ⇒ app đi
   qua proxy chết (hàng chục `SYN_SENT`).

Cách sửa đã deploy (đều nằm trong `tools/router/`):

- `health.sh` v3: 1 instance (pid lock + kiểm tra "leader" mỗi vòng), failover relay tối đa 1 lần/10 phút
  sau 3 lần check liên tiếp, **chỉ restart relay đang lỗi**, node switch tối đa 1 lần/15 phút,
  guard sing-box (3 lần mất 7893/18081 → khôi phục `config.json.good` + restart).
- **CF IP không ghim chết** (`CF_LIST` + `cf_pick()`): probe từng IP bằng
  `curl --resolve api.meetflowai.site:443:$ip`, chọn IP trả lời nhanh nhất; chỉ đổi khi IP hiện tại fail
  2 lần liên tiếp, tối đa 1 lần/10 phút. Bằng chứng: nhiều IP CF timeout trong khi IP khác trả 200 và
  nhanh gấp 4 lần (104.17.232.29: 1,69 MB/10 s/4 luồng so với 104.21.83.112: 0,39 MB).
- `sing-box-selective.json`: `node3 = 1083`, DNS mặc định = DNS ONT `192.168.100.1` (0,15 s), chỉ domain
  cần chống nhiễm độc (Netflix/Twitter/FB/Telegram/ChatGPT/TikTok) đi DoT qua `node3`, log `warn`.
- `nft-singbox.nft`: thêm bảng `tvproxy` — chuyển mọi kết nối tới `192.168.100.0/24:18081` về proxy router
  (chữa proxy cũ trên TV; sống qua reboot vì nằm trong `/etc/nftables.d/`).

Bằng chứng kiểm chứng:
- 45 phút FPT Play fullHD qua proxy: **0** `code=4`, **0** relay flap/`1006`, **0** watchdog restart,
  đỉnh 910 MB / 128.000 packets trên một kết nối.
- `/var/log/flowvpn-health.log` sau khi deploy: không còn `CF FAILOVER`; chỉ còn các dòng `node FAIL (1)`
  đơn lẻ khi mạng chập chờn.
- `sing-box check -c` OK; 3 relay đều trả `204`; `fptplay.vn` qua mixed `200` (~2 s).

Giới hạn đã xác định: băng thông tunnel = băng thông FPT→Cloudflare. Đo từ Mac (không proxy) tới
`speed.cloudflare.com` chỉ **91 KB/s** và nhiều CF IP timeout; tunnel đạt 55–170 KB/s tuỳ luồng ⇒
Facebook/Netflix nặng vẫn chậm, cần exit không qua CF (HK relay / VPS direct) nếu muốn mượt.

Việc còn lại:
- TV nhà `192.168.1.124`: bật ADB để xoá hẳn proxy cũ trong Settings (hiện chữa bằng NAT redirect).
- TV360: đã về đúng `node3=1083`, cần test lại sau reboot.
- Commit/push: xem commit kèm theo section này.

## 21. Tốc độ: chuyển relay sang direct hysteria2 UDP tới VPS, bỏ Cloudflare (2026-10-28)

Phát hiện: `tools/hysteria-relay/runner.go` đã hỗ trợ `transport.type = "udp"` (hysteria2 **direct** tới
VPS), chỉ cần đổi `"wsrelay"` → `"udp"` trong `node{1,2,3}.json` (giữ `server`/`password`/`obfs`).

Số đo thật (bench 4 luồng, file 8 MB qua `speed.cloudflare.com`):
| Đường | node1 (VN) | node2 (VN) | node3 (VN) |
|---|---|---|---|
| Cloudflare wsrelay (cũ) | 0,03–0,17 MB/s | 0,03–0,17 MB/s | 0,03–0,17 MB/s |
| Direct hysteria2 UDP | **1,77 MB/s (14,1 Mbps)** | **1,85 MB/s (14,8 Mbps)** | **0,58 MB/s (4,6 Mbps)** |

Sau khi đổi qua sing-box (`socks5-hostname` mỗi node): 579–826 KB/s (trước 10–170 KB/s).
Facebook: TTFB 0,9 s / tổng 1,6 s (trước 5–7 s / 8–13 s). FPT Play 200 trong 0,76 s.

Vì sao nhanh hơn: chặng FPT→Cloudflare bị bóp (đo từ Mac không proxy chỉ 38–91 KB/s tới CF, nhiều IP CF
timeout), còn FPT→VPS VN nội địa đạt 14 Mbps.

Lưu ý:
- IP-literal vẫn có thể bị hysteria server trả `code=4` (host unreachable) — lỗi phía VPS không tới được
  đích (vd FPT CDN chỉ mở cho mạng FPT). FPT CDN vẫn đi `direct` theo `ip_cidr` như cũ.
- Giữ bản cũ: `node{1,2,3}.json.wsrelay`.
- Watchdog v3.1: thêm `MODE` (`/tmp/relay-transport`); relay down 3 lần × 2 vòng mà transport=udp →
  tự khôi phục `*.json.wsrelay` + restart + log `TRANSPORT FALLBACK udp -> wsrelay` (chống VPS bị chặn UDP).
  Đổi lại direct: đặt lại `"type": "udp"` và `echo udp > /tmp/relay-transport`.

## 22. Facebook trên Android không vào được — FPT đầu độc DNS (2026-10-28)

Triệu chứng: phone Android (Z Fold5, `192.168.1.143`) + TV mở Facebook lỗi/không tải; trước đó tưởng do relay.

Bằng chứng:
- Cả ONT, 8.8.8.8 và 1.1.1.1 đều trả `www.facebook.com = 185.45.5.35` (IP rác) ⇒ **FPT chặn/đầu độc DNS Facebook ở tầng mạng**.
- Relay nhận IP đích rác ⇒ VPS không tới được ⇒ hysteria server trả `code=4` (host unreachable) cho mọi kết nối theo IP.
- Khi đích là **domain** (sing-box gửi domain), relay tự resolve ở VPS (57.144.x — FB edge VN) nên `www.facebook.com` qua relay = 200.
- DoT/DoH trực tiếp từ nhà bị FPT reset (`Send failure: Connection reset by peer`); DoH **qua tunnel** (mixed 18081) trả 200.

Cách sửa: `tools/router/fb-hosts.sh` + `addn-hosts` của dnsmasq:
1. Lấy IP thật của `facebook.com/graph.facebook.com/instagram.com` qua DoH **trong tunnel**
   (`https://cloudflare-dns.com/dns-query`, proxy mixed 18081).
2. Thử từng IP qua relay với SNI đúng (`--socks5 127.0.0.1:1085 --resolve www.facebook.com:443:IP`),
   lấy IP trả 2xx/3xx đầu tiên; fallback `57.144.8.1 / 57.144.24.1 / 57.144.100.141`.
3. Ghi `IP domain` cho 12 domain FB/Instagram/Messenger vào `/etc/flowvpn/fb-hosts`,
   `kill -HUP dnsmasq`. Cron `*/20` chạy lại ⇒ IP chết tự đổi (không ghim).
4. `uci add_list dhcp.@dnsmasq[0].addnhosts=/etc/flowvpn/fb-hosts`.

Kết quả: `nslookup www.facebook.com 192.168.1.1` → `57.144.64.1`; IP này qua relay = 200 (4 s).
Lưu ý: sau khi đổi DNS, app Facebook trên phone phải được khởi động lại (hoặc bật/tắt chế độ máy bay)
để bỏ cache DNS cũ; các TV cũng cần mở lại app.

## 23. Sự cố 28/10 tối: FPT bóp Cloudflare + đầu độc DNS (FB/ChatGPT/Gemini) — trạng thái và bài học

### Đo được (bằng chứng)
| Đường | Kết quả |
|---|---|
| Cloudflare wsrelay (qua CF) | 0,03–0,17 MB/s, lúc thì handshake 13 s rồi **0 byte** |
| Direct hysteria2 UDP 8443 → VPS | **1,77 MB/s (14 Mbps)** — nhưng sau ~1 h dùng thì FPT chặn (handshake treo) |
| Direct hysteria2 TCP 443 → VPS (caddy TLS thật) | WS 101 OK, nhưng bench chỉ **0,1–0,2 MB/s** (FPT bóp TCP tới VPS) |
| FPT DNS (ONT/8.8.8.8/1.1.1.1) | trả IP rác cho Facebook/ChatGPT/Gemini |

### Phát hiện quan trọng: Go TLS bị FPT DPI chặn
Binary relay build bằng Go 1.26 **không bắt tay TLS được** tới VPS dù `curl` cùng máy chạy tốt
(`context deadline exceeded`, curl `101`). Nguyên nhân: ClientHello của Go 1.26 có ML-KEM
(X25519MLKEM768) → gói lớn bị DPI của FPT nuốt. **Sửa: chạy relay với `GODEBUG=tlsmlkem=0`** thì
bắt tay được ngay. Nếu sau này dùng transport TCP trực tiếp, phải giữ biến này trong init script.

### DNS sạch (thay cho fb-hosts.sh cũ)
`tools/router/dns-clean.sh` (cron `*/20`): DoH trong tunnel → IP thật → thử qua relay với đúng SNI →
ghi `/etc/flowvpn/dns-hosts` → HUP dnsmasq. Ba "family":
- Facebook/Instagram/Messenger → `57.144.64.1` (FB edge VN, qua relay 200)
- ChatGPT (`chatgpt.com`, `auth.openai.com`, `cdn.oaistatic.com`, `ab.chatgpt.com`) → `104.18.32.47`
  (200; lưu ý nếu UA lạ sẽ 403 — app dùng UA riêng nên OK)
- Gemini (`gemini.google.com`, `aistudio.google.com`) → `142.251.152.2` (200, TTFB ~7 s)

Kết quả kiểm chứng: `nslookup` qua router trả đúng 3 IP trên; `chatgpt.com` (UA trình duyệt) = 200,
`gemini.google.com` = 200, `facebook.com` = 200.

### Trạng thái cuối
- Transport: **wsrelay qua Cloudflare** (`MODE=wsrelay`), CF IP `104.17.232.29` (health.sh tự dò IP sống).
- `node` (FPT Play, FB, ChatGPT, Gemini…) = **1081** (node2) vì node1 (1085) đang lỗi link.
- Watchdog 1 instance, không restart relay trừ khi hỏng thật.
- TV: FPT Play cần **khởi động lại app** sau khi mạng đứt lâu; app tự retry thì vẫn lên.

### Bài học
1. IP rác do DNS đầu độc là nguyên nhân chính của "app không vào được" — kiểm tra `nslookup` qua router
   trước khi nghi tunnel.
2. Không dùng Go build >1.24 cho TLS ra ngoài nếu DPI khó tính — phải `GODEBUG=tlsmlkem=0`.
3. FPT bóp mọi đường tới VPS (UDP 8443 sau ~1 h, TCP 443 ~0,1 MB/s) ⇒ muốn nhanh ổn định phải có
   exit qua nhà cung cấp khác/HK.

## 24. Watchdog v4 — tự chữa end-to-end để không phải fix tay mỗi tối (2026-10-28)

Vấn đề: đường FPT→Cloudflare/VPS thay đổi liên tục trong ngày (bóp, chặn, IP rác) nên bản watchdog
"chỉ canh cổng/node" không đủ: mỗi tối lại có case lệch.

`tools/router/health.sh` **v4** thêm:
- **Đầu mỗi lần chạy**: `sysctl -p /etc/sysctl.d/99-flowvpn.conf` (tcp_mem 4096/8192/16384, rmem/wmem
  256K) — chống `TCP: out of memory`/OOM đã làm router đơ ngày 28/10.
- **END-TO-END mỗi 60 s**: `curl -x 18081 https://fptplay.vn/` phải 2xx. Hỏng 2 lần liên tiếp → thang tự chữa:
  1. restart relay đang dùng;
  2. không được → đổi node (≤1 lần/15 phút);
  3. không được → thử transport **udp** (`nodeN.json.udp`), nếu vẫn hỏng quay lại `wsrelay`
     (≤1 lần/30 phút).
- **DNS sạch mỗi ~5 phút**: kiểm `www.facebook.com` trả đúng IP trong `/etc/flowvpn/dns-hosts`
  (≥15 dòng). Sai/thiếu → chạy lại `dns-clean.sh` ở nền (≤1 lần/20 phút).
- Giữ nguyên: CF IP động, guard sing-box (`config.good`), relay-down khẩn cấp, node3 cho TV360,
  leader-check 1 instance.

Kiểm chứng sau deploy (15:08): load 0,26; `fpt=200 fb=200 chatgpt=200 gemini=200`; TV 14 kết nối
ESTABLISHED; health log không còn restart/failover.

## 25. Watchdog v4.3–v4.5: không đổi đường khi đang xem + ứng cứu mọi relay (2026-10-28 tối)

- **v4.3**: e2e FPT Play kiểm mỗi ~20 s (trước 60 s); khi `MODE=udp` mà e2e hỏng 3 lần →
  **quay về wsrelay ngay, không restart relay trước** (trước đây restart relay rồi mới revert =
  gián đoạn 2 lần, đúng lúc khách thấy "mất"). Bỏ tự động thử udp (UDP bị FPT chặn sau ~7 phút,
  tự chuyển sẽ tạo drop mỗi 7 phút); udp chỉ bật tay khi cần.
- **v4.4**: node ladder mở rộng `1081 1085 1083` + `pick_node()` probe lần lượt relay còn lại →
  tự ứng cứu sang relay nào còn sống. Ca thật tối 28/10: vn1hy/vn2hy không chở dữ liệu (bench "no bytes"),
  chỉ vn3hy sống; watchdog chuyển `node` sang **1083** và mạng LAN có lại (e2e 200, TV/phone ESTABLISHED).
- **v4.5**: chặn `setport ""` (khi không relay nào OK) — trước đó có thể ghi `server_port":` rỗng làm
  hỏng config.json; nay chỉ đổi khi `pick_node` trả về tên relay hợp lệ, còn lại mới restart relay
  (rate-limit 15 phút).

## 26. Mất internet toàn nhà 16:00 28/10 — cả 3 relay cùng chết + catch-all 443 đi tunnel

Triệu chứng: router còn ping được, DNS còn, nhưng mọi máy LAN không vào được internet.

Nguyên nhân:
- Cả 3 relay cùng lúc không chở dữ liệu (vn2hy không mở được WS, vn1hy/vn3hy vừa restart mới sống).
- Rule `{ "port": 443, "outbound": "node3" }` (catch-all) đẩy **toàn bộ HTTPS của cả nhà** qua tunnel
  ⇒ tunnel chết là mất internet, dù đường direct vẫn tốt (`gstatic` 204, `vnexpress` 404 ngay).

Sửa:
- Catch-all 443 → **direct**. Giờ chỉ các domain trong danh sách (FPT Play, Facebook, ChatGPT, Gemini,
  YouTube/Netflix, TV360...) đi tunnel; web Việt Nam và phần còn lại đi trực tiếp ⇒ tunnel có hỏng thì
  nhà vẫn có internet.
- Khởi động lại 3 relay (1085/1083 sống lại; 1081 vẫn lỗi path vn2hy).
- Kiểm chứng: google 200, facebook 200, fptplay 200, gemini 200; tv/phone vẫn ESTABLISHED.
- Lưu ý: TV360 CDN theo IP trước đây nhờ catch-all đi node3; nay đi direct — cần test lại TV360,
  nếu lỗi thì thêm ip_cidr CDN của TV360 → node3.
