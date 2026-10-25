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
