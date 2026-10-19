# hysteria-relay — hysteria2 đi xuyên relay WebSocket của Cloudflare

Transport dùng chung cho mọi nền tảng VPNFlow: chạy **hysteria2 (QUIC)** nhưng
không đi UDP trực tiếp tới node (mạng khách chặn IP node) mà bọc qua **WebSocket**
tới `/relay/vn*hy` sau Cloudflare, rồi tự dựng **TUN + auto-route** (kèm bypass dải
IP Trung Quốc) và mở **SOCKS5 (TCP + UDP)** tại chỗ cho phần còn lại của client.

Từ 1.4.7 (`tun.go`) TUN nằm **trong chính binary này** — không cần `sing-box.exe`
nữa. Xem §TUN bên dưới để biết vì sao.

## Vì sao không dùng CLI chính thức của hysteria

Bản CLI (`github.com/apernet/hysteria/app`) chỉ có `transport.type: udp|udphop`.
Nó **không** nối được vào relay WebSocket, mà đó là đường duy nhất đi qua được khi
IP node bị chặn (đo 19/09: TCP tới 103.173.155.50 / 165.101.114.162 timeout, chỉ
`api.meetflowai.site:443` mở). Android đã đi đúng đường này từ lâu
(`android/.../vpn/WSRelayBridge.kt` + `HysteriaVpnService.kt`).

## Thành phần

| File | Vai trò |
|---|---|
| `wsrelay.go` | `net.PacketConn` trên WebSocket: **1 binary message = 1 datagram** (đúng giao thức `/root/wsrelay.js` phía server). Có ping 20s để giữ WS sống. Bản **multipath** (`MultiConn`) mở N WebSocket song song — xem §Multipath. |
| `runner.go` | Dựng `client.NewClient` với ConnFactory = wsrelay (hoặc UDP trực tiếp), mở SOCKS5 và/hoặc TUN; thêm chế độ `-bench` để đo băng thông qua tunnel mà không cần quyền root/TUN. |
| `tun.go` | TUN + auto-route + bypass, dùng lại `app/internal/tun` của hysteria (không tự viết tầng TUN). In hai mốc `TUNREADY`/`TUNFAIL` trên stderr — xem §TUN. |
| `build.sh` | Clone hysteria tag `app/v2.12.2`, **chỉ copy thêm** 3 file trên vào checkout (`app/internal/wsrelay/`, `app/flowvpnrelay/`) rồi build — upstream không bị sửa. |

## Dùng

```bash
# build cho mac + windows + linux (binary ra /tmp/hysteria-relay-dist)
./build.sh
TARGETS="windows/amd64" OUT_DIR=/tmp/x ./build.sh

# chạy: mở SOCKS5 127.0.0.1:1081 qua relay vn2hy
./flowvpnrelay-darwin-arm64 -c config.json     # in "READY ..." khi tunnel đã lên

# đo băng thông qua tunnel (không cần TUN/root)
./flowvpnrelay-darwin-arm64 -c config.json -bench 'https://<url-lon>' -bench-seconds 20
```

`config.json`:

```json
{
  "server": "165.101.114.162:8443",
  "password": "<hysteria auth>",
  "obfs": "<salamander>",
  "insecure": true,
  "upKbps": 30000,
  "downKbps": 100000,
  "transport": {
    "type": "wsrelay",
    "url": "wss://api.meetflowai.site/relay/vn2hy",
    "host": "api.meetflowai.site",
    "links": 1,
    "mode": "roundrobin",
    "statsSec": 5
  },
  "socks5": { "listen": "127.0.0.1:1081" },
  "dialTimeoutSec": 12
}
```

Không có khoá `tun` ⇒ chỉ mở SOCKS5 như bản cũ (không hồi quy). Có `tun` ⇒ dựng
thêm TUN full-tunnel — xem §TUN.

## TUN — full-tunnel trong chính binary này (làm 13/10/2026)

**Vì sao bỏ `sing-box.exe`:** nó là binary bên thứ ba **chưa ký**, mà máy khách bật
**Smart App Control** thì WDAC chặn mọi binary chưa ký (đo thật: CodeIntegrity
3033/3077/3118, Win32 4551 *"Application Control policy has blocked"*) ⇒ chết cả
đường hầm. Chữ ký của binary ngoài thì ta không kiểm soát được, còn binary của chính
mình thì chạy bình thường trên đúng máy đó — nên phần TUN được đưa vào `tun.go`, dùng
lại client TUN có sẵn của hysteria (`app/internal/tun` → `apernet/sing-tun` →
`wintun.dll`, thứ app đã ship sẵn cho đường WireGuard).

**Hợp đồng với app C#** (`windows/.../Tunnel/HysteriaRelayTunnel.cs`) — hai dòng
stderr ASCII, mỗi dòng một mốc:

| Dòng | Nghĩa |
|---|---|
| `READY transport=<t> server=<s> socks5=<listen>` | SOCKS5 đã mở (mốc cũ, không đổi). |
| `TUNREADY if=<tên> mtu=<mtu> route=<yes\|no>` | Interface TUN **đã có thật trong HĐH**; app lấy `if=` để đặt DNS lên đúng adapter đó. |
| `TUNFAIL <lý do ascii ngắn>` | Không dựng/cấu hình được TUN ⇒ app rơi đường khác NGAY, không chờ hết ngân sách. |

Khối `tun` (tuỳ chọn) trong config JSON — schema phẳng, **nguồn sự thật là
`tools/hysteria-relay/tun.go`** (phía C# sinh ra nó ở
`SingBoxConfigBuilder.BuildTun`):

```json
"tun": {
  "name": "flowvpntun",
  "mtu": 1500,
  "ipv4": "100.100.100.101/30",
  "ipv6": "",
  "route": {
    "strict": false,
    "ipv4": [],
    "ipv6": [],
    "ipv4Exclude": ["1.0.1.0/24", "223.5.5.5/32"],
    "ipv6Exclude": []
  }
}
```

| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `name` | `flowvpntun` | Tên adapter (C# dùng đúng tên này để đặt DNS). |
| `mtu` | `1500` | MTU của TUN. |
| `ipv4` | `100.100.100.101/30` | Address IPv4 của TUN (dải CGNAT, không đụng LAN khách). |
| `ipv6` | rỗng | **Rỗng = KHÔNG gán IPv6** (khác mặc định CLI hysteria — mạng khách ở TQ thường không có IPv6). |
| `route.strict` | `false` | `strict=false` chia `0.0.0.0/1` + `128.0.0.0/1`, KHÔNG xoá default route của adapter vật lý ⇒ tiến trình chết giữa chừng không làm mất mạng cả máy. |
| `route.ipv4` / `route.ipv6` | `[]` | Danh sách route đưa vào TUN. **Rỗng = TOÀN BỘ** (`0.0.0.0/0`, `::/0`) — đúng ngữ nghĩa `BuildAutoRouteRanges` của sing-tun. |
| `route.ipv4Exclude` / `ipv6Exclude` | `[]` | Dải **TRỪ RA** khỏi auto-route, tức đi THẲNG không qua tunnel — đây là bypass Trung Quốc (app nhúng `cn.txt`/`cn6.txt` vào đây). |

Ghi chú:

- Có khối `tun` ⇒ auto-route **luôn bật**. Khác CLI hysteria (ở đó không khai
  `route` thì auto-route tắt): hợp đồng với app C# là "có TUN nghĩa là full-tunnel",
  và app luôn ghi khối `route`.
- Không khai `socks5.listen` mà có `tun` ⇒ **không mở SOCKS5** (app không cần). Không
  có `tun` ⇒ giữ nguyên hành vi cũ: luôn mở SOCKS5, mặc định `127.0.0.1:1081`.
- TUN lỗi (ví dụ chạy không có quyền admin) **không panic**: in `TUNFAIL <lý do>` rồi
  trả lỗi, vòng ngoài ở `main()` dựng lại chứ không thoát.
- Log của tầng TUN đi qua zap ở mức **Warn** trở lên và `EventLogger` rỗng: log từng
  kết nối TCP/UDP sẽ đổ hàng nghìn dòng mỗi giây và làm chậm đường gói.

## Multipath — nhiều WebSocket song song (làm 19/09/2026, **chưa bật ở app nào**)

Ý tưởng: chặng Cloudflare↔node bị bóp **theo từng kết nối**, mà một `PacketConn` chỉ là
**một** WebSocket (một luồng TCP qua CF) ⇒ trần 1 luồng. `MultiConn` mở N WebSocket tới
**cùng một relay**, rải datagram ra N link, đọc từ **mọi** link rồi gộp về một hàng đợi
đọc duy nhất (hysteria không cần biết có mấy link).

Bật bằng khối `transport`:

```json
"transport": {
  "type": "wsrelay",
  "url": "wss://api.meetflowai.site/relay/vn2hy",
  "host": "api.meetflowai.site",
  "links": 4,
  "mode": "roundrobin",
  "burst": 32,
  "statsSec": 5
}
```

| Tham số | Ý nghĩa |
|---|---|
| `links` | số WebSocket song song. **Không khai (hoặc ≤0) = đường MỘT kết nối cũ**; `1` = một link nhưng đi qua `MultiConn`; `2..4` = multipath. |
| `mode` | `roundrobin` (mặc định: gói thứ i đi link i%N) · `sizehash` (gói ≤200 byte — ACK/điều khiển QUIC — luôn đi link 0, gói lớn rải vòng) · `burst` (mỗi link `burst` gói liên tiếp rồi mới đổi) |
| `burst` | số gói liên tiếp trên một link ở `mode=burst` (mặc định 8) |
| `statsSec` | >0: log `[wsrelay] multipath: link0[sống] tx=…pkt/…B rx=…pkt/…B \| link1[…] …` mỗi N giây — để biết **link nào chở bao nhiêu** |

Cờ đo (`-bench`): `-bench-streams N` mở **N kết nối TCP song song** trong một lần đo (cộng
byte, in cả tốc độ mỗi luồng) — dùng để tách "trần chặng WS" khỏi "trần một luồng đích".
Mỗi 2 giây in một dòng `bench: tiến độ …`; hết `-bench-seconds` thì lấy số đã đo rồi thoát
(kể cả khi còn luồng treo — đã gặp ca `Read` không trả về làm lượt đo treo >9 phút).

Hành vi khi link lỗi (đã test bằng relay giả tại chỗ):

- Một link chết (RST/đóng) ⇒ **chỉ bỏ link đó**, các link còn lại chạy tiếp; link chết được
  **mở lại ngay** (backoff 0,25→4s, tối đa 6 lần/lượt; `maintainLoop` thử lại mỗi 15s).
- **Mọi** link đều chết và mở lại thua ⇒ `PacketConn` **tự đóng** với `ErrAllLinksDead` để
  tầng trên dựng lại transport — **không treo im**.
- `Close()` đóng từng conn **không** qua write-mutex ⇒ không treo vì một lần ghi đang kẹt.

**Kết quả đo (19/09/2026, macOS, mạng khách sạn, `-bench` qua `/relay/vn2hy`): KHÔNG ăn.**

| Cấu hình | 4 lượt xen kẽ (`-bench`, Linode SG, 1 luồng đích, 15s) | Trung vị |
|---|---|---|
| 1 link (đường cũ) | 0,22 · 0,15 · 0,88 · 0,23 MB/s | 0,22 MB/s |
| 1 link (qua MultiConn) | 0,18 · 0,16 · 0,74 · 0,28 MB/s | 0,22 MB/s |
| **4 link (roundrobin)** | **0,06 · 0,04 · 0,05 · 0,07 MB/s** | **0,055 MB/s** |

| Cấu hình | 3 lượt xen kẽ qua **SOCKS5** (đúng đường sản phẩm, `curl`, 20s) | Trung vị |
|---|---|---|
| 1 link (đường cũ) | 0,161 · 0,072 · 0,112 MB/s | 0,112 MB/s |
| 1 link (qua MultiConn) | 0,091 · 0,076 · 0,146 MB/s | 0,091 MB/s |
| **4 link (roundrobin)** | **0,050 · 0,053 · 0,050 MB/s** | **0,050 MB/s** |

- Multipath **chậm hơn ~4 lần** so với 1 link, và chậm hơn nữa khi tải nặng hơn.
- Phí truyền lại (RX/byte payload, đọc từ dòng `BENCH-LINK`): 1 link **3–13%**, 2 link
  **10–51%**, 4 link **43–96%** ⇒ đúng như cảnh báo: rải gói làm **đảo thứ tự**, QUIC coi là
  mất gói và gửi lại. `burst` và `sizehash` **không** cứu được (đo cùng khung giờ: 0,07–0,09
  và 0,02 MB/s).
- `hash theo luồng` là **bất khả** ở tầng này: hysteria gom MỌI kết nối của client vào **một**
  kết nối QUIC ⇒ mọi datagram cùng một connection-ID; phần payload đã mã hoá nên hash nội
  dung = rải ngẫu nhiên (tệ hơn round-robin).
- Hai khung giờ tunnel **rất nhanh**: 23:06 (1→2→4 link = 0,13→2,77→**5,40 MB/s**, tăng đơn
  điệu theo số link) và 23:32 (4 link **7,40 MB/s** = 59 Mbps qua SOCKS5). Cả hai **không tái
  lập được** khi đo xen kẽ ngay sau đó (6 cặp ghép + 4 lượt đối chứng + 3 lượt SOCKS đều cho
  1 link ≥ nhiều link) ⇒ coi là ngoại lệ của đường truyền, không phải hiệu ứng của multipath.
- Biến số lớn nhất **không phải** số link: cùng một máy, cùng URL, tunnel nhảy giữa
  **0,04 MB/s và 5,4 MB/s** giữa hai lượt cách nhau 13 giây (raw cùng lúc 7–12 MB/s).
  Việc cần làm trước khi nghĩ tới multipath là tìm ra vì sao chặng relay tụt còn ~1–3% raw.

Ghi chú vận hành:
- Khai `upKbps`/`downKbps` **phải sát băng thông thật**: Brutal CC bám theo số
  khai, khai cao hơn thật sẽ tự bóp nghẽn (đo được: khai 300/1000 Mbps → 1,3 Mbps;
  khai 30/100 → 29,9 Mbps; không khai → tương đương).
- Node-1 đôi lúc không ra được Cloudflare ⇒ ưu tiên `/relay/vn2hy` (exit node-2).
- `sing-box` **không còn dùng** ở đường này: TUN/định tuyến/DNS do `tun.go` lo (xem
  §TUN). `SingBoxConfigBuilder.BuildSingBoxConfig` còn giữ lại cho đường WireGuard và
  để so sánh khi cần.
