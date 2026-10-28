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
- **Proxy trên TV đã được xoá (29/10)**: `settings put global http_proxy :0` — TV giờ đi qua tproxy trong suốt
  (kiểm chứng: TV có flow trực tiếp tới `118.69.x` FPT Play, không còn flow mới tới :18081).
  nft `inet tvproxy` redirect `192.168.100.0/24:18081` **vẫn giữ** làm lưới an toàn nếu app nào tự đặt proxy lại.
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

## 7. LUẬT KHÔNG THỬ LẠI (đọc trước khi định "tối ưu")
- **links=2/8/24 KHÔNG nhanh hơn links=1** — đã đo nhiều lần (28–29/10): links=1 ~215 KB/s, links=2 rơi còn 13–22 KB/s.
  Không thử lại nữa. Giữ `"links": 1`.
- Đường relay (Cloudflare wsrelay) dao động 7–215 KB/s tuỳ phút ⇒ **không đủ cho video HD ổn định**.
- Đường Reality đo 943 KB/s (7,5 Mbps) — ổn định hơn hẳn; đã cấu hình giống relay (cùng rule domain).
- **Không tự ý đổi mapping/hạ tầng khi khách chưa báo lỗi mới.** Mỗi lần đổi phải dùng `config.good` + `sing-box check`.
- Không chạy lại các thử nghiệm đã kết luận: links=N, UDP transport tự động, catch-all direct, Xray v26, DoT trực tiếp.

## 8. CHỐNG LẶP RD-002 / 2001 / 2002 (FPT Play trên TV)

### Nguyên nhân đã xác định (đừng đoán lại)
1. **Đường ra không ổn định**: relay Cloudflare dao động 7–215 KB/s → stream stall → app báo RD/2001/2002.
   Đã chuyển FPT Play sang **Reality** (đo 640–871 KB/s ổn định). `fptplay → auto`.
2. **Xiaomi TV Manager đóng băng app giữa lúc phát**: `ActivityManager: freezing net.fptplay.ottbox`.
   Đã `pm disable-user --user 0 com.xiaomi.mitv.tvmanager` + `deviceidle whitelist +net.fptplay.ottbox`.
3. **Cache/DRM hỏng**: logcat có `cache/...dm No such file` → đã `pm trim-caches` + restart app.
4. **DNS bị FPT đầu độc** cho FB/ChatGPT/Gemini → dnsmasq `addnhosts=/etc/flowvpn/dns-hosts`, cron 20 phút.
5. **Proxy cũ trong TV** (`192.168.100.5/.6:18081`) → nft redirect `192.168.100.0/24:18081` (đã bao cả dải).

### Guard đang tự chạy (không cần can thiệp)
- Watchdog `/etc/flowvpn/health.sh`: e2e FPT Play mỗi 20 s; fail 3 lần → tự chữa; DNS sai → tự chạy `dns-clean`; reality sống thì `auto` dùng reality.
- `config.json.good` + `sing-box check` trước mỗi lần restart.

### Khi lỗi quay lại — làm đúng 4 bước, KHÔNG đổi mapping
1. `adb -s 192.168.100.3:55555 shell "logcat -d | grep -E 'playerFailed|ERROR_CODE_IO|EventLogger'"` → xem lỗi mạng hay DRM.
2. Đo đường: `curl -x http://127.0.0.1:18081 "https://speed.cloudflare.com/__down?bytes=2000000" -w "%{speed_download}"` (phải >300 KB/s).
3. `pm list packages -d | grep tvmanager` (phải có) + `dumpsys deviceidle whitelist | grep fptplay`.
4. Nếu vẫn lỗi DRM/cache: `pm clear net.fptplay.ottbox` (mất đăng nhập, phải đăng nhập lại).

## 9. CHỐT CUỐI 29/10 — mọi thứ đã chạy (chủ nhà xác nhận)
| Dịch vụ | Outbound | Xác nhận |
|---|---|---|
| FPT Play (TV) | `auto` = **Reality** | chủ nhà: "chạy được, chất lượng tốt" |
| Netflix (iPad app) | `auto` = **Reality** | chủ nhà: "netflix chạy được" |
| TV360 | `node3` (1083) | đường mạng OK |
| Facebook / ChatGPT / Gemini / Google / web VN | `auto` / direct CDN | 200 |
- Reality đo 680–941 KB/s; relay Cloudflare chỉ 7–215 KB/s → **ưu tiên Reality**.
- TV **không còn proxy** (đã xoá `http_proxy`), đi tproxy trong suốt.
- **KHÔNG đổi gì thêm** trừ khi chủ nhà báo lỗi mới. Mọi thay đổi: `cp config.json config.json.good` → `sing-box check` → restart.

## 10. NGHIỆM THU 29/10 — chủ nhà xác nhận TỐT
- FPT Play (TV): "chạy được, chất lượng tốt" — đi `auto` = Reality.
- Netflix (iPad app): "chạy được" — đi `auto` = Reality.
- TV360 (TV): "chất lượng tốt" — đi `node3` (1083); ADB xác nhận `media_session state=PLAYING`.
- TV đã bỏ proxy (`http_proxy=:0`), đi tproxy trong suốt.
- Kết quả nghiệm thu tạm thời: **TỐT**. Không thay đổi cấu hình thêm.

## 11. NGHIỆM THU FB / ChatGPT / Gemini (29/10)
- DNS qua router: `www.facebook.com → 57.144.64.1`, `chatgpt.com → 172.64.155.209`, `gemini.google.com → 142.251.154.2`.
- Facebook: **PASS** — 200, ~2,0 s (qua `auto`/Reality).
- Gemini: **PASS** — 200, ~1,8 s.
- ChatGPT: đường mạng OK (TLS tới được, DNS đúng) nhưng `curl` nhận **403 = Cloudflare bot challenge**
  (cả exit Reality lẫn relay đều 403; không có title/"just a moment" trong body).
  ⇒ **Không kết luận bằng curl được**, phải mở app/browser thật trên điện thoại/iPad để nghiệm thu.
  Nếu app báo lỗi thì kiểm tra: `nslookup chatgpt.com 192.168.1.1` phải ra 172.64.155.209 (hoặc IP CF thật),
  và thử đổi UA/thiết bị trước khi đụng cấu hình.

## 12. NGHIỆM THU TỔNG 29/10 — TẤT CẢ PASS (chủ nhà xác nhận)
| Case | Kết quả | Đường |
|---|---|---|
| FPT Play (TV) | PASS — chất lượng tốt | auto = Reality |
| TV360 (TV) | PASS — chất lượng tốt | node3 (1083) |
| Netflix (iPad) | PASS | auto = Reality |
| Facebook | PASS — 200 / 2 s | auto = Reality |
| ChatGPT | PASS (app trên điện thoại) | auto = Reality |
| Gemini | PASS — 200 / 1,8 s | auto = Reality |
| TV | PASS — không proxy, tproxy trong suốt | — |

Ghi chú: `curl chatgpt.com` trả 403 là Cloudflare bot challenge — nghiệm thu bằng **app thật**, không bằng curl.

## 13. TẮT WATCHDOG TRÊN TV + tách IP TV360 (29/10)
- Đã disable trên TV: `com.tvflow.watchdog` (watchdog riêng), `com.privatevpn.app.guard` (VPN guard),
  `com.xiaomi.mitv.tvmanager` (TV Manager đóng băng app).
- Watchdog trong **TVFlow Home**: revoke `WRITE_SECURE_SETTINGS` của `com.tvflow.launcher` +
  `am stop-service .HomeGuardService` + `settings put global http_proxy :0`.
  ⇒ HomeGuard không thể đặt lại proxy cũ nữa; proxy giữ `:0`.
  (HomeGuardService vẫn tồn tại nhưng vô hại vì không còn quyền ghi settings.)
- **Không dính IP TV360**: kiểm tra conntrack khi FPT Play chạy — TV chỉ nói chuyện với FPT (`118.69.x`,
  media KSYUN `103.78.126.x`) + Xiaomi/Google; TV360 dùng dải riêng (`125.235.x`, `156.59.x`, `149.104.x`).
  Rule tách biệt: `fptplay*` khác rule `tv360/viettel/vtvcab/vtv/ateme`.

## 14. TV hoàn toàn trong suốt — không proxy (29/10)
- `settings get global http_proxy` = `:0`; `global_http_proxy_host` = null.
- Bằng chứng không còn proxy: conntrack TV `dport=18081` **giảm dần** (68 → 47, entry cũ tự hết hạn),
  trong khi flow trực tiếp (443/80) **tăng** (22 → 33). Toàn bộ kết nối mới của TV đi thẳng qua router (tproxy).
- FPT Play lúc kiểm tra: `state=PLAYING(3)`, position 625 s, buffered 676 s (đệm trước ~50 s) — phát mượt.
- Watchdog TV đã tắt hết; nft `tvproxy` redirect chỉ là lưới an toàn, không còn được dùng.
