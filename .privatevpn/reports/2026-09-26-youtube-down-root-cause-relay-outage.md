# "YouTube không hoạt động" trên iPhone — NGUYÊN NHÂN GỐC: relay-cf-vn2hy chết 19 phút

- **Triệu chứng khách báo:** iOS Connected, vào YouTube **không hoạt động** (26/09/2026 ~15:00–15:20 giờ máy)
- **Kết luận:** KHÔNG phải lỗi YouTube, KHÔNG phải lỗi data plane của build 57.
  Là **`relay-cf-vn2hy` trên node-2 chết từ 14:00:38 đến 14:19:42** (giờ node-2) ⇒ mọi phiên tunnel đi qua node-2 **không mở được WS**.

## 1. Bằng chứng hai phía — khớp trong vòng ~10 giây

| Phía | Mốc | Nội dung |
|---|---|---|
| **node-2** (systemd) | **14:00:38** | `relay-cf-vn2hy.service: Killing process 3080035 (MainThread) with signal SIGKILL` · `Failed with result 'timeout'` · `Stopped relay-cf-vn2hy.service` |
| **node-2** (systemd) | **14:19:42** | `Started relay-cf-vn2hy.service` · `LISTEN 7785 -> UDP 127.0.0.1:8443 | ping=15000ms pongTimeout=60000ms` |
| **iPhone** (UTC+8) | **15:00:48 → 15:19:35** | **43 lần** `startTunnel thất bại (TUNNEL_START_FAILED): ws-relay không dựng được: WS không mở được trong 10s` |

`iPhone = node-2 + 1 giờ` ⇒ 15:00:48 iPhone = **14:00:48 node-2** (sau khi relay bị giết **10 giây**);
15:19:35 iPhone = **14:19:35 node-2** (trước khi relay sống lại **7 giây**). **Khớp cả hai đầu.**

Chuỗi thử của client ngay trước mỗi lần thất bại (lặp lại suốt 19 phút):
```
15:19:16 ws-relay: link down, reconnecting in 2s
15:19:19 ws-relay: link down, reconnecting in 4s
15:19:23 ws-relay: link down, reconnecting in 8s
15:19:26 ws-relay: link down, reconnecting in 2s     ← backoff quay lại từ đầu
15:19:29 ws-relay: link down, reconnecting in 4s
15:19:33 ws-relay: link down, reconnecting in 8s
15:19:35 startTunnel thất bại (TUNNEL_START_FAILED): WS không mở được trong 10s
```

## 2. ⚠️ Vì sao client KHÔNG tự cứu được — hệ quả của F3 (relay cùng node)

Client **có** thử cả hai cửa:

| Địa chỉ đã thử | Số lần |
|---|---|
| `wss://api.meetflowai.site/relay/vn2hy` | **100** |
| `wss://t1.meetflowai.site/relay/vn2hy` | **86** |
| `wss://api.meetflowai.site/relay/vn1hy` | 2 (phiên cũ, không phải lúc này) |

**Cả hai cửa đều kết thúc ở CÙNG một dịch vụ trên node-2** (`relay-cf-vn2hy`). Nên khi dịch vụ đó chết,
**cả hai cửa cùng chết**, và client **không hề thử `vn1hy`** — vì **F3** (chỉ nối relay **cùng node**) đã bỏ
đường mượn relay của node khác.

⇒ **F3 đúng về định tuyến/địa lý, nhưng đánh đổi bằng khả năng chịu lỗi:** một node mất relay ⇒ **mất mạng hoàn toàn**
cho khách đang ghim vào node đó, dù có 2 cửa. Đây là lỗ hổng kiến trúc **đã được chứng minh bằng sự cố thật**, không phải giả thuyết.

## 3. Hiện trạng — ĐÃ HỒI PHỤC

```
vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426        (AGENTS §7e.3 — cả 4 relay WebSocket sẵn sàng)
t1/vn1hy=426 t1/vn2hy=426
```
Phiên mới nhất trên iPhone (15:25:55+) chở dữ liệu bình thường:
`TCP sức khoẻ: SYN vào 83, SYN-ACK về 83, RST về 1` · `checksum sai 0` · hai chiều đều tăng.

⇒ **YouTube nên chạy lại được ngay bây giờ.** Cần chủ dự án thử lại để xác nhận.

## 4. Việc phải làm (theo thứ tự)

1. **§7e.5 — watchdog phía server (BẮT BUỘC, chưa có).** Sự cố này để lộ: relay chết **19 phút** mà
   **không ai tự khởi động lại**, và **không có cảnh báo**. Health-watch trên node-2 kiểm mỗi dịch vụ đường khách
   `active` **và** relay trả `426`, tự `start` lại, báo Telegram. Đây là thứ biến sự cố 19 phút thành ~30 giây.
2. **Cân nhắc lại F3:** thêm **đường dự phòng khác node như phương án CUỐI** — nhưng phải kèm **`serverHost` đúng của node đó**
   (bộ ứng viên nhiều node đàng hoàng), **không** mượn relay mà giữ host của node cũ (đó là lỗi F3 sinh ra để chặn).
3. **Client phải NÓI RA khi không mở được đường** — 19 phút thất bại liên tiếp mà khách chỉ thấy "không vào được YouTube",
   không có thông báo "không kết nối được máy chủ, đang thử đường khác".
4. **`backoff` quay lại từ đầu** (2s → 4s → 8s → **2s**) khiến client thử lại dồn dập suốt 19 phút; nên có trần backoff tăng dần.

## 5. Việc KHÁC chưa xong (không liên quan sự cố này)

Phiên build 57 lúc **14:00:22 (giờ iPhone)** — **trước** cửa sổ sự cố — vẫn **KHÔNG ĐẠT**: sau `TỰ DỰNG LẠI transport`
(14:18:53) watchdog tự khai "bật lại với mốc mới" (14:19:02) nhưng **0 nhịp tim trong 131 s** còn lại, kèm bão RST
(`SYN 141 → RST 100`). Xem `.privatevpn/reports/2026-09-26-ios-57-postota-acceptance-FAILED.md`.

---

# PHỤ LỤC (sau khi chủ dự án báo "lỗi CHỈ bị trên mạng data")

## A. ĐÍNH CHÍNH: "bỏ 12% gói" KHÔNG phải mất dữ liệu — đó là **IPv6 bị chặn**

Em từng báo `bỏ 380/3171 gói (~12%)` ở chiều `packetFlow→Go` như một dấu hiệu drop dữ liệu. **Sai.**
Đọc code (`HysteriaTransport.swift`) thì `toGoDropped` chỉ tăng ở **đúng 3 chỗ**:

| Dòng | Nhánh |
|---|---|
| 1162 | ghi vào Go **thất bại** (EAGAIN đếm riêng — log ghi `EAGAIN 0`) |
| **1204** | **IPv6 bị chặn** (`toGoIPv6Blocked += 1; toGoDropped += 1`) |
| **1225** | `ignoreICMPv6` (ICMPv6 điều khiển) |

Vì log luôn ghi `EAGAIN 0`, phần `bỏ` gần như **toàn bộ là IPv6 bị chặn** — và nó khớp số `IPv6-chặn 294/305`.
⇒ **Không có mất dữ liệu IPv4.** Bỏ giả thuyết "drop gây nghẽn".

## B. Khác biệt DUY NHẤT đo được, khớp với "chỉ lỗi trên data"

| | Wi-Fi (của chủ dự án) | Data/5G |
|---|---|---|
| IPv6 toàn cầu trên giao diện | **KHÔNG có** (đã đo trên Mac: `en0` không `inet6`) | **CÓ** (5G phát IPv6 native) |
| Gói IPv6 vào tunnel | 0 | **119–305 mỗi phiên** |
| Nhánh `rejectIPv6` (P2) có chạy? | **Không bao giờ** | **Chạy liên tục** |

⇒ **P2 (chặn IPv6) chỉ được kích hoạt trên mạng có IPv6 — tức là data/5G. Trên Wi-Fi nó không bao giờ chạy.**
Đây là **khớp duy nhất** giữa "chỉ lỗi trên data" và mã nguồn.

**Hệ quả quan trọng:** "build 55 trên iPad chạy tốt trên Wi-Fi" **không loại trừ** P2 — vì **P2 đã có từ build 55**
(`HysteriaTransport.forwardToGo` chặn IPv6 → `rejectIPv6`) và Wi-Fi không có IPv6 để chạy nhánh đó.
Phép so sánh đang lẫn **hai biến**: (build 55 vs 57) **và** (Wi-Fi vs data).

## C. Phép thử QUYẾT ĐỊNH (2×2) — cần chủ dự án chạy

| | **Wi-Fi** | **Data/5G** |
|---|---|---|
| **iPad — build 55** | ✅ chạy tốt (đã xác nhận) | ❓ **CHƯA THỬ** |
| **iPhone — build 57** | ❓ **CHƯA THỬ** | ❌ YouTube không chạy (đã xác nhận) |

- **Nếu iPad/55 trên DATA cũng lỗi** ⇒ **không phải regression của 56/57**; thủ phạm nằm ở đường IPv6 của P2 (có từ 55).
- **Nếu iPad/55 trên DATA chạy tốt** ⇒ regression nằm trong 56/57 (F4 ngân sách phiên / F3 chọn cửa relay), phải soi diff 55→57.
- **iPhone/57 trên Wi-Fi**: nếu chạy tốt ⇒ xác nhận lỗi gắn với IPv6/loại mạng, không phải bản build.

Chỉ cần **một** trong hai ô ❓ là đủ kết luận. Ưu tiên ô **iPad/55 + data** vì nó tách được build khỏi mạng.

## D. Số đo khác trên data (không phải nguyên nhân)

- Số khai **KHÔNG bị hạ**: `declared=12000 up=8000` giữ nguyên suốt phiên; `reason=clamp` (38 lần) chỉ là
  "bắt đầu đo" lúc mở phiên, không phải ghì. Máy tự nói `KHÔNG hạ số khai — mẫu chưa đủ TẢI THẬT`.
  ⇒ **"bị bóp" không đúng**: `observed=38–107 kbps` thấp là vì **gần như không có tải thật**, không phải bị hạ trần.
- Bắt tay TCP **tốt**: `SYN vào 106, SYN-ACK về 106, RST về 1`; `checksum sai 0`.
- Thời gian mở WS trên data: **8,3 s** và **5,4 s** (trần mỗi cửa `relayOpenGrace = 10 s`) ⇒ **8,3 s quá sát trần**;
  mạng chậm hơn một chút là vượt 10 s ⇒ `TUNNEL_START_FAILED`. Đây là rủi ro thật nhưng **chưa phải** nguyên nhân hôm nay.
- `sessionStartBudget = relayOpenGrace × maxRelayDoorsTotal + 5 = 10 × 4 + 5 = 45 s` (không phải 25 s như em nói trước đó).

---

# PHỤ LỤC 2 — chủ dự án xác nhận "Wi-Fi chạy tốt, Data vẫn lỗi" (cùng máy, cùng build 57)

## Đã LOẠI TRỪ được 5 giả thuyết, mỗi cái có bằng chứng

| # | Giả thuyết | Bằng chứng loại trừ |
|---|---|---|
| 1 | Regression của build 56/57 | **Cùng iPhone, cùng build 57**: Wi-Fi chạy tốt (`observed=8532` kbps, cầu `Go→packetFlow 4.243.567 B/5 s` ≈ **6,8 Mbps**), Data không |
| 2 | Cửa relay / node khác nhau | **Cả hai mạng vào đúng cùng một cửa**: `wss://api.meetflowai.site/relay/vn2hy` (phiên cell 15:19:36, 15:25:55 và phiên wifi 15:30:02) |
| 3 | **IPv6 / P2 (`rejectIPv6`)** | **Mạng Wi-Fi CŨNG có IPv6 và CŨNG bị chặn**: `bridge: IPv6 BỊ CHẶN #1..#5` lúc 15:30:03–15:30:05 — **mà Wi-Fi vẫn chạy 8,5 Mbps**. Số lần chặn: cell 11 · wifi 5 ⇒ P2 chạy ở CẢ HAI nơi |
| 4 | Bị "bóp" bởi bộ điều tiết | Số khai **không hề bị hạ**: `declared=12000 up=8000` (cell) / `45508 up=13652` (wifi) giữ nguyên; `reason=clamp` chỉ là *"bắt đầu đo"* lúc mở phiên |
| 5 | Relay chết | Cả 4 relay trả **426** (`vn1hy vn2hy vn1wg vn2wg`, và `t1/…` nữa) |

## Còn lại đúng MỘT khác biệt: last-mile của mạng nền

| | Wi-Fi (ICONLABHOTEL) | Data (China Mobile) |
|---|---|---|
| `observed` | **8.532 kbps** | **0 – 107 kbps** |
| Cầu `Go→packetFlow` | **4,24 MB / 5 s** (~6,8 Mbps) | ~0,3 MB / 5 s (~0,5 Mbps) |
| `realLoad` | 1 (có tải thật) | 0, `idleRun` 82–103 (gần như không có tải) |
| Chặn IPv6 | 5 lần | 11 lần |

⇒ Chênh **>10–100 lần**, cùng thiết bị, cùng build, cùng cửa relay, cùng node ⇒ **nghẽn nằm ở đường China Mobile → Cloudflare**, không nằm trong build.

**Đối chiếu đáng chú ý (chưa giải thích được):** trước đó Mac đi qua **hotspot của chính iPhone** (cùng mạng China Mobile) đạt **~4,3 Mbps** qua tunnel. Cùng last-mile mà nhanh hơn ~10–40 lần ⇒ **không phải chặn cứng cả mạng China Mobile**; nghi là suy giảm theo thời điểm/vị trí/sóng, hoặc khác biệt đường đi IPv4-only của hotspot. Cần đo lại nhiều lần mới kết luận.

## Phép thử quyết định còn lại (chủ dự án chạy, VPN TẮT, trên data)

1. **Tốc độ thô của data** (fast.com / Speedtest) — không qua VPN.
2. `https://api64.ipify.org` — xem nhà mạng có phát IPv6 không.

- Thô **nhanh** (≥20 Mbps) mà qua tunnel chỉ ~0,5 Mbps ⇒ **China Mobile bóp đường tới Cloudflare** ⇒ đây là bài toán chặn TQ quay lại ở tầng mạng di động, và cách chữa là **cổng vào khác** (miền thứ hai `meetflowai.io.vn` mà chủ dự án đã định cấu hình, hoặc ingress không qua Cloudflare), **không** phải sửa client.
- Thô **cũng chậm** ⇒ sóng/điểm truy cập, không phải việc của phần mềm.

---

# PHỤ LỤC 3 — BẰNG CHỨNG PHÍA SERVER: chênh **250 lần** giữa Data và Wi-Fi

Log `relay-cf-vn2hy` trên node-2 ghi **thông lượng thật của từng phiên**. Ghép với giờ iPhone (iPhone = node-2 +1 h):

| Phiên | Giờ node-2 | Giờ iPhone | Mạng | IP khách | Dài | Byte chiều về | **Tốc độ** |
|---|---|---|---|---|---|---|---|
| #1 | 14:19:44 | 15:19:44 | **DATA** | `223.119.20.192` | 367,8 s | 4,37 MB | **0,10 Mbps (100 kbps)** |
| #2 | 14:26:00 | 15:26:00 | **DATA** | `223.119.20.192` | 236,3 s | 2,98 MB | **0,11 Mbps (106 kbps)** |
| #3 | 14:30:04 | 15:30:04 | **WIFI** | `120.234.32.53` | 35,3 s | 105,0 MB | **24,95 Mbps** |
| #4 | 14:30:48 | 15:30:48 | **WIFI** | `120.234.32.53` | 60,9 s | 189,9 MB | **26,16 Mbps** |

⇒ **Relay tự đo: cùng node, cùng cửa `vn2hy`, cùng giao thức, cùng iPhone, cùng build 57.**
Khác duy nhất là mạng truy nhập ⇒ **nghẽn nằm ở đường cellular giữa iPhone và Cloudflare**, không nằm trong build.

**Đính chính bản đồ IP:** trước đó em ghi `120.234.32.53` như IP cellular của Mac. Đối chiếu giờ mở phiên thì **`223.119.20.192` = DATA**, **`120.234.32.53` = Wi-Fi khách sạn** (đo Mac lúc 14:52 là sau khi Mac đã sang Wi-Fi — khớp lời chủ dự án "Mac vừa chuyển lại wifi"). Cả hai đều thoát qua hạ tầng China Mobile.

## Phép thử 1 phút còn lại — dùng ĐÚNG URL mà app tự đo

App tự đo mạng bằng `https://meetflowai.site/v1/downloads/ios` (trên Wi-Fi: **18.000–53.000 kbps**). Chủ dự án chạy trên **data**, cùng URL:

| | VPN TẮT | VPN BẬT |
|---|---|---|
| `curl -o /dev/null -w '%{speed_download}\n' https://meetflowai.site/v1/downloads/ios` | đo **đường thô tới Cloudflare** | đo **qua tunnel** |

- Thô **nhanh**, qua tunnel **~100 kbps** ⇒ **đường WSS tới Cloudflare bị bóp trên China Mobile** ⇒ phải đổi cổng vào (miền thứ hai `meetflowai.io.vn`, hoặc ingress KHÔNG qua Cloudflare).
- Thô **cũng ~100 kbps** ⇒ **China Mobile bóp cả đường tới Cloudflare** ⇒ bài toán chặn TQ ở tầng mạng di động; client không sửa được.
- Thô **nhanh**, qua tunnel **cũng nhanh** ⇒ mâu thuẫn với số liệu trên ⇒ đo lại nhiều lần (suy giảm theo thời điểm/sóng).

---

# PHỤ LỤC 4 — CHỐT: đường 5G THÔ chỉ ~0,28 Mbps. **Không phải lỗi VPN.**

Đo trực tiếp trên Mac nối **Personal Hotspot của iPhone**, **VPN TẮT** (default route = `en0` `172.20.10.2`,
IP công khai `223.119.20.192` = đúng IP "DATA" mà relay đã ghi nhận lúc ~100 kbps).

| Đích | Kết quả | Ghi chú |
|---|---|---|
| `mirrors.aliyun.com` (TQ) | **1,51 MB / 45 s = 0,28 Mbps (34,5 KB/s)** | mirror trong nước, bình thường phải 50–100+ Mbps |
| `mirrors.tuna.tsinghua.edu.cn` (TQ) | 0,69 MB / 25 s = **0,23 Mbps** | |
| `meetflowai.site/v1/downloads/ios` (Cloudflare) | 0,78 MB / 20 s = **0,33 Mbps** | đúng URL app tự đo |
| `speed.cloudflare.com` | 0 MB / 20 s = 0 Mbps | |
| `ping` gateway hotspot | 6,9 ms · **0% mất gói** | link tới iPhone tốt |
| `ping` `223.5.5.5` (Aliyun DNS) | 99,9 ms | trễ cao cho trong nước ⇒ RAN nghẽn/bóp |
| Lỗi giao diện `en0` | không có lỗi/drop | không phải lỗi máy Mac |

**Kết luận:** **mọi đích đều ~0,25 Mbps, kể cả mirror TRONG NƯỚC** ⇒ **đường dữ liệu 5G của SIM đang bị bóp/dùng hết quota**,
không phải Cloudflare, không phải GFW, không phải tunnel của mình. Tunnel chỉ cộng thêm chi phí đóng gói ⇒ ~0,1 Mbps,
và YouTube/Google cần 2–25 Mbps ⇒ **không thể chạy**.

⇒ **Toàn bộ chuỗi "5G connected nhưng không vào được YouTube/Google" được giải thích trọn vẹn**, và
ĐÓNG các hướng sửa đã bàn: **không cần** đổi cổng vào, **không cần** miền thứ hai, **không cần** sửa client.

**Việc chủ dự án cần kiểm (không phải việc phần mềm):**
1. **Quota/fair-use của SIM** — 0,28 Mbps khớp đúng nấc "hết dung lượng tốc độ cao" của nhà mạng TQ.
2. Chạy speedtest **trên chính iPhone, KHÔNG VPN** để đối chiếu (nếu cũng ~0,3 Mbps thì chắc chắn là SIM/mạng).
3. Thử SIM khác / vị trí khác để loại trừ vùng phủ.

**Đối chiếu đã có từ trước (khớp hoàn toàn):** server tự đo phiên DATA `223.119.20.192` = **0,10–0,11 Mbps**,
phiên WIFI `120.234.32.53` = **24,95–26,16 Mbps** ⇒ chênh 250×, nay giải thích được: **mạng truy nhập**, không phải build.

## CHỐT CUỐI (chủ dự án xác nhận 26/09/2026)

> *"Tốc độ của sim: **350 kbps**. quota còn, nhưng nói chung mạng kém quá — bỏ qua cây này đã."*

- Chủ dự án tự đo tốc độ thô của SIM: **350 kbps** — khớp với **280 kbps** agent đo qua hotspot (cùng nấc).
- **Quota còn** ⇒ không phải hết dung lượng; **chất lượng mạng di động tại vị trí này kém**.
- ⇒ **ĐÓNG hạng mục "5G connected nhưng không vào được YouTube/Google"**: **không phải lỗi sản phẩm**, không cần sửa client, không cần đổi cổng vào, không cần miền thứ hai.
- Sau khi trừ chi phí đóng gói của tunnel (~0,1 Mbps đo được ở relay), tốc độ còn lại **không thể** chạy YouTube/Google (cần 2–25 Mbps).
- **Ghi chú để không điều tra lại:** nếu sau này khách báo "5G không vào được mạng", **đo tốc độ thô của SIM TRƯỚC** — đừng mở lại điều tra tunnel.
