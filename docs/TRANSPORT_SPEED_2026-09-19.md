# Tốc độ đường truyền — điều tra 19/09/2026

Tài liệu này ghi lại **số đo thật** và kết luận kiến trúc sau khi chủ dự án báo
"tốc độ mạng khi chạy VPN rất chậm" (Mac/iPad ≈ 10–15% mạng thật; yêu cầu tối
thiểu 20 Mbps trên đường 120 Mbps, và video streaming phải xem được).

## 1. Cạm bẫy đo lường đã phát hiện (đọc trước khi tin bất kỳ số nào)

1. **Tailscale exit node đang bật trên Mac** (`tailscale set --exit-node=`) làm
   *mọi* số "raw" trước đó là tốc độ qua node-1, không phải đường thật:
   `curl https://api.ipify.org` → `103.173.155.50` (node-1) chứ không phải IP nhà.
   Sau khi tắt exit node: default route về `en0` (10.0.3.254) và đo được
   **15,3 MB/s = 122 Mbps** — đúng bằng con số chủ dự án nói.
   → Muốn đo "mạng thật" phải tắt exit node (hoặc bind `--interface en0`).
2. **Không đo được nhầm target**: `speed.cloudflare.com/__down` trả **403** sau
   khi bị gọi nhiều (body `0`) → ra "1–2 B/s" và dễ kết luận sai là tunnel chậm.
   Luôn kiểm `%{http_code}` và `%{size_download}`, đừng chỉ nhìn B/s.
3. **Đường mạng khách sạn dao động cực mạnh** trong cùng một giờ: raw lúc
   15,3 MB/s, lúc 8,4 MB/s, lúc 2,5 MB/s, lúc 0,28 MB/s. Vì vậy mọi so sánh phải
   đo raw và tunnel **ngay cạnh nhau**, và lặp ≥2 lần.

## 2. Số đo (mạng đang bị chặn IP node)

| Thời điểm | Raw (en0) | Tunnel | Tỉ lệ |
|---|---|---|---|
| 01:35 (đường tốt) | 15,3 MB/s (122 Mbps) | VLESS-WS qua CF: 2,6–3,2 MB/s | ~20% |
| 01:35 (đường tốt) | 15,3 MB/s | hysteria2-qua-WS-relay: 3,73 MB/s (29,9 Mbps) | ~24% |
| 01:40 | 8,4–12,2 MB/s | VLESS-WS: 6,9 MB/s (55 Mbps) | ~60–80% |
| 02:20 (đường xấu) | 1,87 MB/s | hysteria2-qua-WS-relay: 1,55 MB/s | ~83% |
| 02:20 (đường xấu) | 1,87 MB/s | VLESS-WS: 1,88 MB/s | ~100% |

Kết luận: khi đường khách yếu, tunnel **không phải** nút cổ chai (đạt 83–100%
raw). Khi đường khỏe (122 Mbps), tunnel bị chặn trần khoảng **~30 Mbps** ở chặng
Cloudflare↔node — cần đo tiếp xem là trần mỗi luồng (nhiều luồng cộng lại được)
hay trần cứng.

Bằng chứng chặn IP node (đo từ mạng khách, bind `en0`):

```
nc -vz -s 10.0.3.117 -w 5 165.101.114.162 22   # Operation timed out
nc -vz -s 10.0.3.117 -w 5 103.173.155.50  22   # Operation timed out
nc -vz -s 10.0.3.117 -w 5 api.meetflowai.site 443  # succeeded
```

→ UDP/TCP trực tiếp tới node **chết**; chỉ Cloudflare đi được. Vì vậy mọi
transport phải đi qua `/relay/vn*hy` (WebSocket) — đúng như Android đang làm.

## 3. Lỗi hạ tầng đã sửa trong lần này

- `wsrelay.js` (relay WS→UDP, chạy trên **node-1 và node-2**): idle timer 10 phút
  được đặt **một lần** cho cả phiên, không làm mới khi có traffic ⇒ **mọi phiên
  streaming dài bị cắt ngang sau 10 phút bất kể đang truyền dữ liệu**. Đã sửa
  (làm mới timer mỗi chiều có gói), backup tại `/root/wsrelay.js.bak-<ts>`, đã
  restart `relay-cf-*` (node-2) và `wsrelay*` (node-1).
- Node-1 đôi lúc không ra được Cloudflare (`hysteria` log: `readfrom tcp4
  103.173.155.50->162.159.140.220:443: timeout: no recent network activity`), lúc
  đó mọi phiên qua node-1 đều chết ⇒ **ưu tiên exit node-2** (`/relay/vn2hy`) khi
  đi qua Cloudflare.

## 4. Kiến trúc chốt

Hai tầng, dùng chung cho mọi nền tảng:

1. **Transport: hysteria2 (QUIC) bọc trong WebSocket** → đi qua Cloudflare.
   - Mã nguồn: `tools/hysteria-relay/` (`wsrelay.go` = `net.PacketConn` trên
     WebSocket, đúng giao thức "1 binary WS message = 1 UDP datagram";
     `runner.go` = hysteria client + SOCKS5 TCP/UDP nội bộ; `build.sh` clone
     hysteria `app/v2.12.2` rồi **chỉ copy thêm file** — không sửa upstream).
   - Vì sao cần: CLI chính thức của hysteria chỉ có transport UDP/udphop, không
     nối được vào relay WebSocket (đường duy nhất còn đi được).
   - Đo thật trên macOS: bắt tay 0,8–4,2s; 29,9 Mbps khi đường khỏe.
2. **Bộ não TUN/định tuyến: sing-box** (đã được chủ dự án duyệt dùng, kể cả
   GPL-3.0) — TUN + `auto_route`, DNS, và **rule định tuyến** (đây là chỗ để làm
   bypass WeChat/CN sau này: `route.rules` + geosite/geoip, thay vì chắp vá ở
   tầng transport).
   - Trên desktop: chạy 2 process — `flowvpnrelay` (SOCKS5 127.0.0.1) +
     `sing-box` (TUN, outbound = socks đó).
   - Trên Apple: `Libbox.xcframework` (đã build được từ sing-box v1.14.1 cho
     iOS-device, iOS-simulator, macOS; module `Libbox`, `import Libbox`) +
     transport hysteria chạy trong cùng tiến trình NE (framework gomobile, cắm
     vào qua socket UDP do Swift tạo — giống `WSRelayBridge.kt` của Android).

## 5. Trạng thái từng nền tảng

| Nền tảng | Hiện tại | Việc tiếp |
|---|---|---|
| Windows | WireGuard-over-relay (chậm, đã đo 0,007–2 MB/s) | Đang tích hợp `flowvpnrelay.exe` + `sing-box.exe` (TUN) vào app .NET, auto fallback về WireGuard |
| macOS | WireGuard-over-relay (0,7 Mbps, từng chặn hết mạng) | Thay bằng sing-box CLI/sing-box tun + transport hysteria |
| iOS/iPad | WireGuard-over-relay | NE + Libbox (đã build) + transport hysteria |
| Android | hysteria2 (đã đúng hướng) | Đổi relay sang `/relay/vn2hy` để đo lại; giữ Brutal khai đúng băng thông mạng hiện tại |

## 6. Cách đo lại cho đúng (khiếu nại tốc độ lần sau)

```bash
# 1) tắt exit node Tailscale (bắt buộc, nếu không số "raw" là của node-1)
tailscale set --exit-node=
# 2) raw — bind thẳng interface ra internet
curl --interface en0 -o /dev/null -w 'raw %{speed_download} B/s\n' "$URL"
# 3) qua tunnel của sản phẩm (ví dụ SOCKS5 nội bộ của transport)
curl --socks5-hostname 127.0.0.1:1082 -o /dev/null -w 'vpn %{speed_download} B/s\n' "$URL"
```
Dùng ≥2 URL khác nhà cung cấp và kiểm `%{http_code}`.

## 7. Việc còn lại (chưa xong)

- [ ] Đo xem trần ~30 Mbps khi đường khỏe là **mỗi luồng** hay **cứng** (chạy 3
      luồng song song qua cùng tunnel).
- [ ] Windows: test trên máy harness (DESKTOP-852P1LT) — script
      `windows/installer/verify-relay.ps1`.
- [ ] Apple: đưa Libbox + transport hysteria vào NE, bỏ hẳn WireGuard-over-relay.
- [ ] Bypass WeChat: làm bằng `route.rules` của sing-box (chưa làm).
- [ ] Auth hysteria theo người dùng (`userpass`) để bỏ credential nhúng trong app.

## 8. Phát hiện chặn đường của Apple: hai runtime Go không cùng một process

Khi link framework hysteria2 vào packet-tunnel của macOS, link thất bại:

```
duplicate symbol '__cgo_panic' in:
    .../PrivateVPN.build/.../wg/libwg-go.a[arm64][2](go.o)
    .../Build/Products/Debug/Hysteria.framework/Versions/A/Hysteria[arm64][2](go.o)
ld: 3 duplicate symbols
```

`WireGuardKit` mang theo `libwg-go.a` (Go runtime của wireguard-go), framework
hysteria2 cũng mang một Go runtime ⇒ **không thể** cùng nằm trong một process
extension. Hệ quả kiến trúc:

- **Extension của Apple phải là hysteria-only** (bỏ WireGuardKit khỏi 2 target
  extension). Đúng hướng nghiệp vụ luôn: WireGuard-chồng-relay đo chỉ 0,007–2 MB/s
  và từng blackhole cả máy Mac.
- Bất kỳ kế hoạch nào nhúng `Libbox.xcframework` vào extension cũng vướng đúng lỗi
  này. Nếu sau này cần bộ định tuyến của sing-box trên Apple thì phải build **một**
  framework Go duy nhất chứa cả libbox và hysteria (một runtime), chứ không phải
  hai framework cạnh nhau.
- Hysteria2 đã có sẵn chuỗi transport riêng (WS relay / direct UDP / TCP relay) nên
  phần "định tuyến" trên Apple không cần WireGuard.

Framework đã build được (gomobile chính thống `golang.org/x/mobile`; fork SagerNet
chỉ dùng cho libbox):

| Artifact | Slice | Ghi chú |
|---|---|---|
| `Hysteria.xcframework` (74 MB) | `ios-arm64`, `ios-arm64_x86_64-simulator` | module `Hysteria`, API hàm C: `MobileConnect` / `MobileServe` / `MobileStop` |
| `Hysteria-macos.xcframework` (49 MB) | `macos-arm64_x86_64` | dùng cho extension macOS |

Cách nối trong extension: `WSRelayClient` mở WebSocket tới `/relay/vn*hy` và bind
một cổng UDP nội bộ (mỗi binary message = 1 datagram) → `MobileConnect` trỏ QUIC
tới đúng cổng nội bộ đó → `MobileServe` đọc/ghi gói IP trên fd utun lấy từ
`packetFlow.value(forKey: "socket")` (KVC, cùng cách các client NetworkExtension
khác dùng).

## 9. Windows: kiến trúc đang triển khai

`flowvpnrelay.exe` (transport hysteria2-qua-WS, mở SOCKS5 TCP+UDP nội bộ) +
`sing-box.exe` (TUN + `auto_route` + DNS, outbound = SOCKS tới relay) — hai tiến
trình con do app .NET giám sát, tự rơi về đường WireGuard cũ nếu không lên được
trong 20s. Binary nhúng vào `windows/assets/` (wintun.dll đã có sẵn); giấy phép ghi
ở `windows/assets/THIRD_PARTY.md` (sing-box GPL-3.0 đã được chủ dự án duyệt).
