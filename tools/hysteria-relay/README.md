# hysteria-relay — hysteria2 đi xuyên relay WebSocket của Cloudflare

Transport dùng chung cho mọi nền tảng VPNFlow: chạy **hysteria2 (QUIC)** nhưng
không đi UDP trực tiếp tới node (mạng khách chặn IP node) mà bọc qua **WebSocket**
tới `/relay/vn*hy` sau Cloudflare, rồi mở **SOCKS5 (TCP + UDP)** tại chỗ để phần
còn lại của client cắm vào (trên desktop: sing-box lo TUN/định tuyến).

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
| `runner.go` | Dựng `client.NewClient` với ConnFactory = wsrelay (hoặc UDP trực tiếp), mở SOCKS5; thêm chế độ `-bench` để đo băng thông qua tunnel mà không cần quyền root/TUN. |
| `build.sh` | Clone hysteria tag `app/v2.12.2`, **chỉ copy thêm** 2 file trên vào checkout (`app/internal/wsrelay/`, `app/flowvpnrelay/`) rồi build — upstream không bị sửa. |

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
- `sing-box` dùng làm tầng TUN/định tuyến: `outbounds: [{ "type": "socks",
  "server": "127.0.0.1", "server_port": 1081 }]`.
