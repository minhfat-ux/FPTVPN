# Gateway Mac — watchdog & route TV360

## Vì sao cần

Mac đóng vai gateway LAN `192.168.100.6:18081` cho TV Xiaomi:
- **Flow2** (`site.flowvpn.relay`, socks `127.0.0.1:1081`) → node-2 `165.101.114.162`: FPT Play, YouTube, mọi traffic.
- **Flow3** (`site.flowvpn.relay3`, socks `127.0.0.1:1083`) → node-3 `103.6.235.39`: **chỉ TV360**
  (bridge route `.tv360.vn=127.0.0.1:1083`).

## Sự cố 24/10/2026 — TV360 chết âm thầm

- Biểu hiện: mọi host `*.tv360.vn` qua gateway trả `000` trong ~0.003 s.
- Nguyên nhân: `relay3.log` lặp `wsrelay: dial wss://.../vn3hy: dial tcp: lookup api.meetflowai.site: no such host`
  — tiến trình relay3 mất khả năng phân giải DNS (sau lần đổi mạng/DHCP), nên Flow3 chết; bridge vẫn route
  `.tv360.vn` vào socks 1083 đã chết ⇒ TV360 chết mà **không ai báo**.
- `health.sh` cũ chỉ kiểm Flow2 ⇒ không phát hiện.
- Khắc phục: `launchctl kickstart -k gui/$(id -u)/site.flowvpn.relay3` (kết nối lại node-3 trong ~2 s);
  test `curl --socks5-hostname 127.0.0.1:1083 https://tv360.vn/` → `200`.

## health.sh mới (đã cài)

Kiểm mỗi 5 phút (`site.flowvpn.health.plist`, `StartInterval=300`):
1. Flow2: `curl -x http://127.0.0.1:18081 https://speed.cloudflare.com/__down?bytes=200000` → fail thì restart relay.
2. Flow3: `curl --socks5-hostname 127.0.0.1:1083 https://tv360.vn/` → fail thì restart relay3.

Cài lại:
```bash
cp tools/mac-gateway/health.sh "$HOME/Library/Application Support/flowvpn/health.sh"
chmod +x "$HOME/Library/Application Support/flowvpn/health.sh"
```

## Kiểm tra nhanh khi TV360 không vào được

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 --socks5-hostname 127.0.0.1:1083 https://tv360.vn/
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 -x http://192.168.100.6:18081 https://tv360.vn/
tail -5 "$HOME/Library/Application Support/flowvpn/relay3.log"
```
