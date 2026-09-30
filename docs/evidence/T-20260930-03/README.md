# T-20260930-03 — "check complain node 1 không ổn định trên bản win"

- **Việc**: chủ dự án giao qua Telegram (`/vibecode`), bus **#607** lúc `2026-09-30T10:49:45Z`
  (nguyên văn: *"check complain node 1 không ổn định trên bản win"*).
- **Bên nhận / người làm**: WIN · **máy đo**: `DESKTOP-852P1LT` (máy chủ dự án, app VPNFlow đang bật)
- **Đo lúc**: 2026-09-30 18:00–18:20 (+07) · **Nghiệm thu**: `node ops/verify-node1-win.mjs`
- **"node 1"** = node `vietnam-1` / id `node-1`, tên hiển thị trong app là **"1"**,
  endpoint `103.173.155.50:443`, VPN gateway `10.77.0.1` (đối chứng: node "2" = `vietnam-2`,
  `165.101.114.162:443`, `10.78.0.1`/`10.77.0.1` — máy Windows đang dùng node này).

## 1. Kết luận ngắn

| Câu hỏi | Trả lời | Bằng chứng |
|---|---|---|
| node-1 có sống không? | **SỐNG** — wg0 up, nghe UDP 443, firewall không chặn | `server-node1.txt`, `verify-output.txt` |
| Từ **chính máy Windows** bắt tay được vào node-1 không? | **ĐƯỢC — 10/10 (100%)**, RTT 139 ms | `verify-output.txt` |
| Đi **đúng đường vật lý** (không qua tunnel, như `udp-direct` của app) thì sao? | **39/40 (98%)**, RTT 113–174 ms | `probe-node1-physical.txt` |
| So với node-2 thì node-1 có tệ hơn không? | **KHÔNG** — node-2: 10/10 (100%) / 133 ms; đo 40 mẫu đường vật lý: node-2 37/40 (92%) | `verify-output.txt` |
| Server node-1 có lỗi gì không? | **Không** — load 0,06; eth0 0 errors/dropped; ra Internet tốt (Google 200 trong 0,34 s; Cloudflare ~386 KB/s; ping 8.8.8.8 mất 0%) | `server-node1.txt` |
| Vậy "không ổn định" là do đâu? | **Do đường UDP của Wi-Fi/ISP máy khách**, không phải node-1 (xem §4). Đồng thời node-1 **không có khách nào dùng** từ lần reboot 26/09 18:27 | §4, §3 |

**Kết luận**: **KHÔNG tái hiện được** lỗi "node 1 không ổn định" tại thời điểm đo. Từ máy Windows,
node-1 bắt tay nhanh và ổn định **ngang node-2**. Cái đo được là mất gói UDP chung của đường
Wi-Fi/ISP (đã đo ở `T-20260930-01`: 10–23%), thứ ảnh hưởng **mọi node**, không riêng node-1.

## 2. Đo từ máy Windows (số thật)

### 2.1 Bắt tay WireGuard thật tới node-1

`node ops/verify-node1-win.mjs --count 10` → **5/5 mục PASS** (`verify-output.txt`):

```
PASS  control plane có node-1 (tên hiển thị "1") — endpoint=103.173.155.50:443
PASS  node-1: wg0 sống và đang nghe UDP 443 — up 3 days, 23 hours, 48 minutes · load 0.14 · 75 peer · firewall: Status: inactive
PASS  node-2: wg0 sống và đang nghe UDP 443 — up 3 weeks, 6 hours, 14 minutes · load 0.28 · 75 peer · firewall: Status: inactive
PASS  node-1: bắt tay WireGuard thật từ máy này — 10/10 thành công (100%), RTT trung bình 139 ms
PASS  node-2: bắt tay WireGuard thật từ máy này — 10/10 thành công (100%), RTT trung bình 133 ms
```

### 2.2 Đường VẬT LÝ (không qua tunnel) — đúng cách app đi `udp-direct`

`probe-physical.ps1` ép gói ra card Wi-Fi bằng `IP_UNICAST_IF`, nên gói đi thẳng ra ISP
(không chui vào tunnel đang bật), rồi đo 40 lần bắt tay (`probe-node1-physical.txt`):

```
TONG KET 103.173.155.50:443 -> thanh cong 39/40 (98%); RTT min/avg/p90/max = 113.2/140.1/164.1/173.7 ms
```

Kiểm chứng gói **thật sự** đi đường vật lý: node-1 nhìn thấy peer thiết bị Windows với
`endpoint: 63.140.14.154:<cổng>` = **IP công khai của máy Windows** (nếu đi qua tunnel thì node-1
sẽ thấy `165.101.114.162`) — xem `server-node1.txt`.

Đối chứng cùng máy, cùng Wi-Fi, cùng lúc (trước khi dọn interface tạm): node-2 `37/40 (92%)`.
⇒ đường tới node-1 **tốt hơn hoặc bằng** node-2.

### 2.3 Công cụ đo — tự dựng và đã kiểm chứng hai chiều

App Windows nhúng `wireguard-go` nên không có lệnh nào phát được một handshake để hỏi
"node X còn sống không". Vì vậy WIN tự dựng gói handshake WireGuard (Noise IKpsk2) bằng Node thuần:
`ops/lib/wgprobe.mjs`. Trước khi dùng nó để kết luận, đã kiểm chứng **hai chiều**
(`wgprobe-crosscheck.txt`):

1. **Byte-for-byte** với bản tham chiếu **độc lập** viết bằng Python (`cryptography` 41.0.7) trên
   node-2, cùng đầu vào cố định → 148 byte khớp hoàn toàn.
2. **Kernel WireGuard thật** (interface `wgtest` tạm trên node-2) đã **trả lời** `message type=2`
   đúng `sender_index` ⇒ gói hợp lệ, không phải "gửi bừa rồi kết luận".

> Hai lỗi đã gặp khi dựng gói (ghi lại để không lặp):
> **MAC1 là BLAKE2s CÓ KHOÁ 128-bit** với khoá `HASH("mac1----" || static_public của responder)`
> — **không phải** HMAC (dùng HMAC thì responder im lặng tuyệt đối, không log, không phản hồi);
> và `MessageResponse.receiver_index` nằm ở **offset 8**, không phải 4.
> Nguồn đối chiếu: `wireguard-go/device/noise-protocol.go` + `device/cookie.go`.

## 3. Phía server node-1

`server-node1.txt` (18:16 +07, `fcnvpn`):

| Mục | node-1 | node-2 (đối chứng) |
|---|---|---|
| Uptime | 3 ngày 23 h (reboot 26/09 18:27) | 21 ngày |
| Load | 0,06 | 0,32 |
| `wg0` | up, `listening port: 443` | up, `listening port: 443` |
| Firewall | `ufw inactive`, iptables chỉ có rule Tailscale | như node-1 |
| eth0 errors/dropped | 0 / 0 | — |
| Ra Internet | Google 200 (0,34 s), Cloudflare ~386 KB/s, ping 8.8.8.8 mất **0%** | — |
| Peer | 75 (cùng registry) | 75 |
| **Bắt tay trong 10 phút** | **0** | 1 |
| **Traffic wg0 từ lúc boot** | **0 byte** (trước khi WIN đo) | 2,55 GiB nhận / 6,69 GiB gửi |
| Vai trò thật | phục vụ qua **Hysteria** (8443) + relay | phục vụ WireGuard chính |

⇒ node-1 **khỏe**, nhưng **WireGuard của node-1 không có khách nào dùng suốt 4 ngày** kể từ reboot
26/09. Mọi client đang đi node-2. Đây là dữ kiện quan trọng: nếu khách phàn nàn node-1, sự việc
nhiều khả năng nằm ở **khoảng thời gian trước đó** (hoặc mạng của khách), chứ không phải node-1 hiện tại.

### 3.1 Đã loại trừ một "nghi phạm" oan

`journalctl -u hysteria` 1 giờ: node-1 **435 dòng WARN** vs node-2 **9 dòng** — thoạt nhìn như lỗi node-1.
Soi kỹ: **228 dòng là cùng MỘT đích chết `43.159.94.130:443`** do **một** phiên khách (qua relay `vn1hy`),
và **node-2 cũng không tới được đích đó** (`curl --max-time 8` → `000`). ⇒ không phải lỗi node-1.

### 3.2 Relay đều sẵn sàng

`relay-check.txt`: `vn1hy=426 · vn2hy=426 · vn1wg=426 · vn2wg=426` (đúng như runbook §7e mong đợi).

## 4. Vì sao khách vẫn thấy "không ổn định" — nguyên nhân gốc

1. **Mất gói UDP của đường Wi-Fi/ISP** (đã đo trong `T-20260930-01`: UDP thuần mất **9,5–22,5%**,
   trong khi ICMP 0–3% và TCP/SSH sạch). WireGuard chạy trên UDP nên "thừa hưởng" toàn bộ.
   Hôm nay đo lại bằng bắt tay: node-1 **1/40 gói mất**, node-2 **3/40 gói mất** — cùng một đường,
   cùng một lúc ⇒ **không phải node-1 kém**.
2. **Log của chính app trên máy này xác nhận có thật chuyện "node-1 không lên" — nhưng là chuyện cũ**:
   `app-log-windows.txt` §1: 2026-09-18 18:33 chọn `node-1`, app gửi 7 lần `Sending handshake initiation`,
   nhận `Handshake did not complete after 5 seconds` và kết thúc bằng
   `WARN connect: udp-direct không truyền được dữ liệu sau 20s` rồi phải rơi xuống relay.
   §2: 2026-09-22 12:03 chọn `node=node-1` đi đường `wss://api.meetflowai.site/relay/vn1hy` thì **lên được**.
   ⇒ Triệu chứng khách tả là **có thật**, nhưng **không tái hiện được** hôm nay (98–100% bắt tay OK).
3. **node-1 bị reboot 26/09 18:27** ⇒ nếu khách đang ở node-1 đúng lúc đó thì bị ngắt và phải nối lại;
   trong 4 ngày sau đó **không ai** vào lại node-1 (0 byte).

## 5. Khuyến nghị

1. **Với khách còn phàn nàn**: lấy `%APPDATA%\VPNFlow\vpnflow.log` của họ và chạy
   `node ops/verify-node1-win.mjs` **trên máy khách đó** — 30 giây là biết node-1 lỗi hay đường mạng lỗi.
   Đừng kết luận theo cảm giác "app chậm".
2. **Chữa triệu chứng "không ổn định"** (mọi node, không riêng node-1): ưu tiên transport chạy trên TCP
   (relay `hysteria2-over-WS` — app đã có và đã tự rơi xuống khi UDP hỏng), hoặc đổi mạng (hotspot 4G/5G)
   để đối chiếu; hạ MTU tunnel 1420 → 1380 nếu còn phân mảnh.
3. **Vận hành**: node-1 đang "nằm không" về WireGuard (0 byte/4 ngày). Nếu chủ dự án muốn chia tải,
   cần xem lại thứ tự/mặc định chọn node trong app; nếu không, nên biết rằng mọi khách đang dồn vào node-2.
4. Không cần sửa gì trên node-1 (không có lỗi để sửa).

## 6. Bằng chứng kèm theo

| Tệp | Nội dung |
|---|---|
| `verify-output.txt` | chạy `node ops/verify-node1-win.mjs --count 10` → 5/5 PASS |
| `probe-node1-physical.txt` | 40 lần bắt tay ra **đường vật lý** tới node-1 (98%, RTT 113–174 ms) |
| `wgprobe-crosscheck.txt` | đối chiếu gói handshake: Python tham chiếu ↔ Node (byte-for-byte) + kernel WireGuard trả lời |
| `server-node1.txt`, `server-node2.txt` | trạng thái thật hai node (wg0, uptime, load, firewall, counters, hysteria) |
| `app-log-windows.txt` | log của chính app VPNFlow: phiên node-1 hỏng 18/09, phiên node-1 qua relay 22/09, cấu hình hiện tại |
| `relay-check.txt` | 4 relay đều trả `426` |

## 7. Việc đã làm trên máy & trên server (đã dọn sạch)

- Ghi việc từ bus #607 vào sổ (`T-20260930-03`), `ack` + push.
- Thêm `ops/lib/wgprobe.mjs` + `ops/verify-node1-win.mjs` + script đo trong
  `ops/_scratch/T-20260930-03/` (đều là công cụ **chỉ đọc/đo**, không đổi cấu hình VPN của chủ dự án).
- **Không** đổi node, **không** ngắt tunnel của chủ dự án (máy vẫn ở `vietnam-2`, egress `165.101.114.162`).
- Server: **đã dọn** interface tạm `wgtest` + khoá tạm trên node-2; đã gỡ peer tạm và địa chỉ tạm
  `10.77.0.254/32` trên node-1 (node-1 trở lại đúng 75 peer, `wg0 = 10.77.0.1/24`); đã xoá các tệp `/tmp`.
- Không sửa cấu hình WireGuard/Hysteria của hai node.
