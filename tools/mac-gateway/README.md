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

## Mac làm gateway trong suốt cho TV (khi TV không có TUN)

**Vì sao cần:** app TV360 tự mở kết nối TCP 443 tới CDN **không qua `http_proxy`**; TV đi thẳng
từ mạng nhà (đo được IP ra **China/Shenzhen**) ⇒ máy chủ TV360 thấy sai khu vực và chặn.
Cách duy nhất bịt được lỗ này mà không root TV là bắt toàn bộ traffic ở tầng mạng.

**Thành phần:**

| File | Việc |
|---|---|
| `sni-proxy/main.go` | Proxy TLS trong suốt: đọc SNI trong ClientHello, nối qua socks (`*.tv360.vn → 1083` node-3, còn lại `→ 1081` node-2) |
| `pf-tv-gateway.sh` | `sudo` bật IP forwarding + pf NAT cho TV + redirect TCP 443 của TV vào `127.0.0.1:18090` |
| `pf-tv-gateway-off.sh` | Gỡ cấu hình, trả TV về DHCP |

**Cách chạy:**

```bash
# 1. Chạy proxy (user thường; hoặc cài LaunchAgent)
/Volumes/BIWIN/XiaoMiLauncher/sni-proxy-darwin-arm64 -listen 127.0.0.1:18090 &

# 2. Bật gateway (cần sudo)
sudo bash tools/mac-gateway/pf-tv-gateway.sh

# 3. Trên TV: đặt IP tĩnh 192.168.100.104, gateway 192.168.100.6, DNS 192.168.100.1

# 4. Kiểm tra
tail -f /tmp/sni-proxy.log          # thấy dòng "dial <sni> (socks) ..." khi TV tải
curl -s -o /dev/null -w "%{http_code}\n" --connect-to tv360.vn:443:127.0.0.1:18090 https://tv360.vn/
```

**Lưu ý:**
- Script sửa `/etc/pf.conf` (có backup) và **bật IP forwarding**; script `-off` gỡ lại.
- Nếu Mac đổi IP DHCP, cần sửa gateway trên TV tương ứng.
- Mac phải bật 24/7 và không ngủ khi TV đang dùng (`caffeinate -s` đã có sẵn qua LaunchAgent keepawake).
