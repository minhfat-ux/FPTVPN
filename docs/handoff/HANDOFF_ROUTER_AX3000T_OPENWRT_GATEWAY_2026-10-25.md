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
