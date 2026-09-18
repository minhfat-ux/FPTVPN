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
| `wsrelay.go` | `net.PacketConn` trên WebSocket: **1 binary message = 1 datagram** (đúng giao thức `/root/wsrelay.js` phía server). Có ping 20s để giữ WS sống. |
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
  "transport": { "type": "wsrelay", "url": "wss://api.meetflowai.site/relay/vn2hy", "host": "api.meetflowai.site" },
  "socks5": { "listen": "127.0.0.1:1081" },
  "dialTimeoutSec": 12
}
```

Ghi chú vận hành:
- Khai `upKbps`/`downKbps` **phải sát băng thông thật**: Brutal CC bám theo số
  khai, khai cao hơn thật sẽ tự bóp nghẽn (đo được: khai 300/1000 Mbps → 1,3 Mbps;
  khai 30/100 → 29,9 Mbps; không khai → tương đương).
- Node-1 đôi lúc không ra được Cloudflare ⇒ ưu tiên `/relay/vn2hy` (exit node-2).
- `sing-box` dùng làm tầng TUN/định tuyến: `outbounds: [{ "type": "socks",
  "server": "127.0.0.1", "server_port": 1081 }]`.
