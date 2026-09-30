# T-20260930-01 — Bật VPN trên máy Windows + kiểm tra độ ổn định của app

- **Việc**: chủ dự án giao qua Telegram (`/vibecode`), bus **#600** lúc `2026-09-30T05:32:01Z`
  (nguyên văn: *"bật vpn trên máy win lên, kiểm tra độ ổn định của app."*)
- **Bên nhận / người làm**: WIN · **máy**: `DESKTOP-852P1LT` · **đo lúc**: 2026-09-30 13:35–13:55 (+08)
- **Nghiệm thu**: `node ops/verify-win-vpn-stability.mjs`

## 1. Kết luận ngắn

| Câu hỏi | Trả lời | Bằng chứng |
|---|---|---|
| VPN trên máy Windows có bật không? | **CÓ — đang bật và đang chở traffic** | app `PrivateVPNWindows.App.exe` sống; adapter `vpnflow` = `10.77.0.57`; IP ra Internet = `165.101.114.162` (đúng VPS) |
| App có ổn định (không crash) không? | **App ổn định** — chạy liên tục ~5,9 ngày, không có bản ghi crash | `Get-Process` start `2026-09-24 16:52`; Event Log 3 ngày không có lỗi `VPNFlow`/`.NET Runtime` |
| Đường truyền VPN có ổn định không? | **KHÔNG** — mất gói **10–23%** qua tunnel | ping `10.77.0.1` x60 = mất 11%; `1.1.1.1` x60 = 16%; `8.8.8.8` x60 = 23% |
| Nguyên nhân gốc | **Đường UDP của mạng Wi-Fi/ISP bị chặn/throttle**, không phải app, không phải WireGuard, không phải server | UDP thuần (không WireGuard) tới chính VPS mất **9,5–22,5%**; cùng lúc ICMP trực tiếp **0–3%**, TCP/SSH bình thường |

Tóm lại: **việc "bật VPN" đã xong (VPN đang bật)**. Nhưng chất lượng tunnel kém vì UDP bị mất gói trên đường ra Internet;
đây là lý do app "không ổn định" (tự ngắt / chậm), không phải lỗi app.

## 2. Trạng thái app & tunnel

| Mục | Giá trị |
|---|---|
| App | `PrivateVPNWindows.App.exe` — PID 23248, start 2026-09-24 16:52 (+08), uptime ~5,9 ngày, RAM 138,6 MB, CPU 3943 s |
| Tiến trình tunnel | `wireguard-go.exe` — PID 27152, start 2026-09-28 20:11, RAM 38,2 MB |
| Adapter | `vpnflow` (WireGuard Tunnel) — IPv4 `10.77.0.57/24`, DNS `1.1.1.1`, MTU 1420 |
| Route | `0.0.0.0/1` + `128.0.0.0/1` qua `10.77.0.x` (full tunnel; vài dải Trung Quốc đi thẳng) |
| Endpoint | `165.101.114.162:443`, `PersistentKeepalive = 25` |
| Node đang chọn | `vietnam-2` (`windows-settings.json`) |
| IP ra Internet | **`165.101.114.162`** (đúng VPS ⇒ tunnel có chở traffic thật) |
| Relay | `flowvpnrelay.exe` / `sing-box.exe` **không chạy** — app đang dùng WireGuard |

## 3. Đo độ ổn định (số thật)

### 3.1 Qua tunnel — mất gói cao

| Đích | Gói | Mất | Trễ TB |
|---|---|---|---|
| `10.77.0.1` (gateway VPN) | 60 | **7 (11%)** | 175 ms |
| `1.1.1.1` | 60 | **10 (16%)** | 258 ms |
| `8.8.8.8` | 60 | **14 (23%)** | 210 ms |

- Log `%APPDATA%\VPNFlow\vpnflow.log`: **38 lần** `Handshake did not complete after 5 seconds` (tổng), **10 lần trong 1 giờ** gần nhất.
- Tải 10 MB qua tunnel: 27,69 s ⇒ **2,89 Mbps** (rất thấp; khớp với suy giảm TCP khi mất gói ~15% + RTT ~200 ms).

### 3.2 Đối chứng — đường gốc sạch

| Đích | Gói | Mất | Trễ TB | Ý nghĩa |
|---|---|---|---|---|
| `10.193.44.1` (router Wi-Fi) | 40 | **0%** | 2 ms | Wi-Fi cục bộ tốt |
| `165.101.114.162` ICMP trực tiếp | 30 | **1 (3%)** | 102 ms | đường tới VPS tốt |
| SSH/TCP tới VPS | — | bình thường | — | TCP trên cùng đường không vấn đề |

### 3.3 Thí nghiệm quyết định — UDP thuần (không WireGuard)

Dựng echo server UDP trên chính VPS (`:51888`), client gửi trực tiếp (route đi thẳng, không qua tunnel):

| Nhịp gửi | Gói | Mất | Trễ TB |
|---|---|---|---|
| 50 ms (20/s) | 200 | **22,5%** | 194 ms |
| 200 ms (5/s) | 100 | **20,0%** | 197 ms |
| 20 ms (50/s) | 200 | **9,5%** | 160 ms |
| ICMP cùng lúc | 30 | **3%** | 102 ms |

⇒ Mất gói **chỉ xảy ra với UDP**, không phụ thuộc tốc độ gửi; ICMP/TCP trên cùng đường sạch.
WireGuard chạy trên UDP nên "thừa hưởng" toàn bộ mất gói này.

### 3.4 Phía server (loại trừ)

`ssh root@165.101.114.162` → host `fcnvps2`, uptime 21 ngày, load 0.65:

- `ip -s link wg0`: RX 0 errors / 0 dropped; TX 2 errors / 2276 dropped (tích luỹ 21 ngày).
- `eth0`: 0 dropped.
- `UdpRcvbufErrors = 2 884 516` **không tăng** trong 60 s (`UdpInDatagrams` +17 855, 0 lỗi mới) ⇒ lỗi rcvbuf là **lịch sử**, không phải nguyên nhân hiện tại.
- Server ping `10.77.0.57` = 100% mất: **bình thường** — Windows Firewall chặn ICMP vào qua adapter tunnel.

## 4. Nguyên nhân gốc & khuyến nghị

**Nguyên nhân**: mạng Wi-Fi/ISP của máy Windows (IP công khai `63.140.14.154`) **chặn/throttle UDP**.
WireGuard là UDP ⇒ tunnel mất 10–23% gói ⇒ app chậm, handshake lại liên tục, cảm giác "tự ngắt".

**Khuyến nghị (theo thứ tự dễ làm)**:
1. **Đổi transport của app sang loại chạy trên TCP** nếu app có (mục `Transport` đang `Auto` và đã tự chọn WireGuard/UDP). App có sẵn `flowvpnrelay.exe` + `sing-box.exe` nhưng hiện không chạy.
2. **Đổi node/đổi mạng** để đối chiếu: thử hotspot 4G/5G. Nếu hết mất gói ⇒ chắc chắn do ISP Wi-Fi hiện tại.
3. Giữ nguyên port **443** (mất gói ~10–16%) tốt hơn port UDP khác (~20–22%) — thấy rõ trong thí nghiệm 3.3.
4. Hạ MTU tunnel xuống **1380** (đang 1420) để giảm phân mảnh — lợi ích nhỏ, không chữa được mất gói.
5. Phía VPS: chưa phải nguyên nhân, nhưng nên nâng buffer nhận UDP cho socket WireGuard nếu sau này có tải lớn.

## 5. Bằng chứng kèm theo

- `ping-gateway.txt`, `ping-1111.txt`, `ping-8888.txt` — output ping thô (60 gói/đích).
- `udp-probe.txt` — output thô thí nghiệm UDP thuần.
- `ops/verify-win-vpn-stability.mjs` — script nghiệm thu (chạy trên Windows, in PASS/FAIL + số đo).

## 6. Việc đã thực hiện trên máy

- Ghi việc từ bus #600 vào sổ (`T-20260930-01`), `ack` + push.
- Xác nhận VPN đang bật (không cần bật lại — app đã chạy và tunnel đã lên).
- Đo độ ổn định 4 lớp: tunnel / đường gốc / UDP thuần / phía server.
- Dựng và **dọn sạch** echo server UDP tạm trên VPS (đã `pkill`, xoá `/tmp/udp-echo-server.mjs`, cổng 51888 đã đóng).
- **Không đổi cấu hình VPN** của chủ dự án (giữ nguyên kết nối đang chạy).
