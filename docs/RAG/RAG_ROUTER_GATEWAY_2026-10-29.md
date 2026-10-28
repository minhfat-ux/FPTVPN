# RAG — Router AX3000T gateway: cấu hình ĐÚNG đã kiểm chứng (29/10/2026)

> Mục đích: lần sau đọc file này trước khi sửa router. Đây là trạng thái đã chạy được,
> đã test bằng ADB trên TV thật. Đừng "tối ưu" lại từ đầu.

## 1. Mapping outbound (điều quan trọng nhất)
| Dịch vụ / domain | Outbound | Cổng relay | Ghi chú |
|---|---|---|---|
| **FPT Play** (`fptplay.vn`, `fptplay.net`, `fptplay53.net`, `fpt.vn`, `fpt.com.vn`, `fbox.fpt.vn`) | `node` | **1081 = node-2** | đúng yêu cầu: FPT Play ra node 2 |
| **Netflix** (`netflix.com/.net`, `nflxext/nflximg/nflxso/nflxvideo`) | `node` | 1081 = node-2 | |
| **TV360** (`tv360.vn`, `viettel.vn`, `vietteltelecom.vn`, `vtvcab.vn`, `vtv.vn`, `ateme.com`, `ateme.tv`) | `node3` | **1083 = node-3** | đúng yêu cầu: TV360 ra node 3 |
| Facebook/Instagram/Messenger, ChatGPT/OpenAI, Gemini/Google, YouTube, TikTok, Twitter, Telegram, WhatsApp | `auto` | urltest `[reality, node]` | reality = Xray VLESS+Reality (VPS TCP 4443) |
| Quảng cáo/telemetry Xiaomi, FPT CDN `103.78.126.0/23`, `103.78.127.0/24`, `103.116.120.0/23`, `103.116.121.0/24` | `direct` | — | FPT CDN chỉ mở cho mạng FPT |
| Netflix app (node1+node2) | `nf` | urltest `[node1(1085), node(1081)]` | app Netflix nối **theo IP** (appboot 34.217.x, ftl 45.57.x) |
| Còn lại (catch-all 443) | **`auto`** | reality → relay | **KHÔNG dùng direct**: app Netflix/endpoint nối theo IP mà direct bị FPT chặn 403 |

## 2. DNS sạch (FPT đầu độc DNS)
- `/etc/flowvpn/dns-hosts` + `addnhosts` của dnsmasq; cron `/etc/flowvpn/dns-clean.sh` mỗi 20 phút.
- FB/Instagram/Messenger → IP thật FB VN (`57.144.x`); ChatGPT → IP CF thật; Gemini → IP Google thật.
- FPT Play/TV360/Netflix KHÔNG cần hosts (DNS FPT trả đúng).

## 3. TV Xiaomi (MiTV-AFZP0, 192.168.1.124)
- Đã `pm disable-user com.xiaomi.mitv.tvmanager` (nó đóng băng app → video tự dừng).
- Đã `cmd deviceidle whitelist +net.fptplay.ottbox`, `am set-inactive net.fptplay.ottbox false`.
- TV có proxy cũ `192.168.100.5:18081` → nft `inet tvproxy` redirect `192.168.100.0/24:18081` về proxy router (chain này phải còn).
- ADB vào TV từ Mac: nft DNAT `tcp dport 55555 dnat ip to 192.168.1.124:5555`; Mac: `adb connect 192.168.100.3:55555`.
- Bằng chứng FPT Play chạy: logcat `audioDecoderInitialized`, `videoDecoderInitialized` HEVC 1.3 Mbps, media_session state BUFFERING→PLAYING.

## 4. Watchdog (`/etc/flowvpn/health.sh`)
- 1 instance (pid lock + leader check), e2e FPT Play mỗi 20 s, tự chữa: restart relay → đổi node (≤1/15 phút) → transport udp (chỉ khi cần) → về wsrelay.
- CF IP động (không ghim), guard `config.good`, tự `sysctl -p` chống OOM (`tcp_mem 4096/8192/16384`).
- Log: `/var/log/flowvpn-health.log`.

## 5. Lỗi đã gặp & cách chữa (đừng lặp lại)
- **RD-200/2001 FPT Play** = `ERROR_CODE_IO_NETWORK_CONNECTION_FAILED`: media FPT CDN không được đi qua VPS → phải để FPT Play ra node relay (node-2), KHÔNG ép direct toàn bộ.
- Sửa config bằng sed phải **theo số dòng** hoặc kiểm tra `sing-box check` ngay; sed thay `"outbound": "node3"` toàn file sẽ làm hỏng rule TV360.
- Cloudflare wsrelay 0,03–0,17 MB/s và hay đứt; direct UDP hysteria 14 Mbps nhưng bị FPT chặn sau ~7 phút.
- **Catch-all 443 = `direct` là SAI**: các app (Netflix) nối theo IP literal, direct bị FPT trả 403 → app báo "no internet".
  Catch-all phải = `auto` (reality trước, relay sau). Đổi lúc 17:3x 29/10: vnexpress/netflix/fptplay/tv360/facebook/google đều 200.
- Netflix app có 2 endpoint riêng: `appboot.netflix.com` (AWS) và `ios.prod.ftl.netflix.com` (Akamai) — kiểm tra bằng
  `curl --socks5 127.0.0.1:1081 --resolve ios.prod.ftl.netflix.com:443:<IP> https://ios.prod.ftl.netflix.com/`.
- Xray v26 Reality không tương thích sing-box 1.14 client; dùng **Xray v24.9.30**, dest `www.cloudflare.com`.

## 6. TRẠNG THÁI CHỐT — đã chạy được (29/10 sáng)
Đã xác nhận với chủ nhà: **Netflix app trên iPad lên được** sau khi đổi catch-all 443 → `auto`.
Snapshot cuối: `netflix/vn 200 · fptplay 200 · tv360 reachable · facebook 200 · google 200 · vnexpress 200`,
TV 19 kết nối, iPad 51 kết nối, relay 3/3, `sing-box check` OK.
Không đổi gì thêm cho tới khi có lỗi cụ thể — mỗi lần đổi phải `cp config.json config.json.good` + `sing-box check`.

## 6b. Trạng thái cũ (để đối chiếu)
fptplay 200 · netflix/vn 200 · tv360 ws 404 (reachable) · facebook/google/gemini 200 · chatgpt 200 (UA trình duyệt).
TV360 app: còn BUFFERING khi test tự động — cần kiểm tra đăng nhập/DRM của app (đã từng sửa bằng `pm clear com.viettel.tv360.tv`).
