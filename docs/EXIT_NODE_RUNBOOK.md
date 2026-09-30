# EXIT NODE RUNBOOK — Thêm exit node mới (1 lần là xong)

> ⚠️ **CẬP NHẬT 2026-09-12 — transport đã đổi.** Node mới phải chạy **hysteria2 + TCP relay**
> **BÊN CẠNH WireGuard**. Quy trình hysteria2: **`docs/AGENT_NEW_NODE_GUIDE.md`** +
> `tools/node-setup/provision-node.sh` (systemd: `hysteria@<port>`, `hyrelay@<port>`), chọn dải IP theo
> `docs/EXIT_NODE_IP_GUIDE.md`.
>
> 🔴 **ĐÍNH CHÍNH 2026-09-30 — "WireGuard chỉ cho node legacy" là SAI.** Sự thật production: cả `node-1`
> (`103.173.155.50`) lẫn `vietnam-2` (`165.101.114.162`) đều đang chạy `wg0` UDP 443, và
> **iOS/macOS/Windows đọc `wg_relay_url ?? ws_relay_url`** để chọn đường
> (`iOS/PrivateVPN/Services/ControlAPIClient.swift:63`, `mac/PrivateVPNMac/VPNManagerMac.swift:876`).
>
> ### 30/09/2026 — WireGuard là BẮT BUỘC trên mọi node mới (bài học `vietnam-3`)
>
> Node `vietnam-3` (`103.6.235.39`) từng được dựng **chỉ hysteria2** ⇒ `public_key = HYSTERIA_ONLY_VN3`,
> `ws_relay_url`/`wg_relay_url` = NULL ⇒ client WireGuard chọn node đó **"Connected" nhưng mất sạch mạng**
> (iOS hiện `RELAY_URL_MISSING`). Node mới **chưa xong** nếu thiếu WireGuard. **4 quy tắc vàng ở §dưới vẫn
> nguyên hiệu lực**; phần WireGuard ở "BƯỚC 1" **vẫn phải làm**, cộng thêm 3 điều đã học:
>
> - Interface WAN của node mới **không phải lúc nào cũng là `eth0`** — `vietnam-3` là **`enp3s0`**.
>   Đặt sai tên interface trong `PostUp` ⇒ MASQUERADE không khớp ⇒ mất mạng.
> - `ufw` mặc định `DEFAULT_FORWARD_POLICY="DROP"` + `iptables -P FORWARD DROP` ⇒ phải đổi sang `"ACCEPT"`,
>   nếu không gói không được forward dù `wg0` đã lên và NAT đã có.
> - Thêm **pubkey `id_node1` của coordinator** vào `authorized_keys` node mới
>   (`ssh-keygen -y -f /root/.ssh/id_node1` — không có sẵn file `.pub`). **Service dùng
>   `SSH_KEY=/root/.ssh/id_node1`, KHÔNG phải `id_ed25519`.** Thiếu key ⇒ `provisionEverywhere` không cấp
>   được peer; tệ hơn, `ssh_target` rỗng làm `wgForNode()` (`control-plane/src/index.js:5366`) rơi về wg
>   **local của coordinator** ⇒ peer bị nhét nhầm vào `relay-server`.
> - Relay riêng cho WireGuard (`relay-cf-<tên>wg`, `WS_UDP_PORT=443`) + `handle` trong **cả hai** site block,
>   rồi **đưa vào `flowvpn-health-watch` + `flowvpn-safe-status` + `flowvpn-safe-stop`** (thêm relay mà quên
>   ⇒ đường mới không được giám sát, `flowvpn-safe-stop` sẽ cho dừng mà không cảnh báo).


## 0. Trạng thái node hiện tại (2026-09-12)

| Node | IP | ASN | Cổng đang chạy | Ghi chú |
|---|---|---|---|---|
| node1 (coordinator) | `103.173.155.50` | AS135905 (VNPT) | hysteria UDP `8443/28443/54443`; relay TCP `8443→8443`, `9445→8443`; wgrelay TCP `9444→UDP 443` (legacy) | Chạy tốt từ TQ (cả UDP lẫn TCP relay) |
| node2 | `103.6.234.233` | AS152992 (Online Data) | như trên | **UDP bị GFW chặn ở mức IP** → chỉ dùng được TCP relay |

- Config hysteria: node1 `/etc/hysteria/server.yaml` (+`server-<port>.yaml`), node2 `/etc/hysteria-server-<port>.yaml`; cert self-signed `/etc/hysteria-cert.pem`.
- Auth `<HY_AUTH_PASSWORD>`, obfs salamander `<HY_OBFS_PASSWORD>`. **Đặt `ignoreClientBandwidth: true`** —
  BẮT BUỘC giống fleet (sửa 30/09/2026; node-1 và relay-server đều đang `true`; lý do 18/09/2026: app cũ khai
  2/20 Mbps nên Brutal tự bóp).
- Registry node là **SQLite** `/root/flowvpn-cp/data/nodes.db` (bảng `exit_nodes`) — `nodes.json` chỉ là đường import legacy.

- **Verified:** 2026-08-23 (node 2: 103.6.234.233 — đã làm đủ, có cả bài học từ lỗi)
- **Scope:** thêm exit node WireGuard mới vào hệ thống (coordinator + registry + app)

## ⚠️ 3 QUY TẮC VÀNG (học từ lỗi thật)

1. **Public key phải là key THỰC TẾ của node** — lấy `wg show wg0 public-key` TRÊN node đó.
   Đừng dùng key của node khác. (Node 2 từng bị lệch key do config bị ghi đè → connect fail.)
2. **NAT phải cover subnet client `10.77.0.0/24`** (không chỉ subnet local của node).
   Lỗi "connected nhưng mạng không thông" = thiếu rule này. (Node 2 chỉ NAT 10.78.0.0/24 → client 10.77.0.x không ra được internet.)
3. **wg0 phải có ADDRESS của subnet client** (VD `10.77.0.1/24` trên wg0) + `rp_filter=0` cho wg0.
   Nếu wg0 chỉ có subnet khác (VD 10.78.0.1/24) → **reverse-path filter drop** → handshake OK nhưng egress fail
   (transfer ~13 KiB kẹt). Fix thực tế node 2: `ip addr add 10.77.0.1/24 dev wg0` + Address trong wg0.conf + `sysctl -w net.ipv4.conf.wg0.rp_filter=0`.
4. **App phải gửi `exit_node_id` khi register** — nếu không, coordinator provision peer lên node đầu
   (firstActive) → node Anh chọn không có peer. (Đã fix trong app — giữ nguyên.)

---

## BƯỚC 1 — Hạ tầng trên node mới (SSH root)

```bash
# 1. Cài WireGuard
apt-get update && apt-get install -y wireguard

# 2. Bật IP forwarding (persist)
sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf

# 3. Tạo keypair + wg0.conf (port 443; NAT cho CẢ 10.77.0.0/24 client + subnet local)
mkdir -p /etc/wireguard && umask 077
wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub
cat > /etc/wireguard/wg0.conf << CONF
[Interface]
Address = 10.77.0.1/24
ListenPort = 443
# LƯU Ý: nếu node có sẵn subnet khác (VD 10.78.0.1/24), thêm CẢ client subnet:
# Address = 10.78.0.1/24, 10.77.0.1/24  + sysctl -w net.ipv4.conf.wg0.rp_filter=0
PrivateKey = $(cat /etc/wireguard/server.key)
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -m state --state RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.78.0.0/24 -o eth0 -j MASQUERADE; iptables -t nat -A POSTROUTING -s 10.77.0.0/24 -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -m state --state RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.78.0.0/24 -o eth0 -j MASQUERADE; iptables -t nat -D POSTROUTING -s 10.77.0.0/24 -o eth0 -j MASQUERADE
CONF
wg-quick up wg0

# 4. LƯU LẠI key THỰC TẾ (dùng cho registry)
wg show wg0 public-key
```

> Nếu node có sẵn config khác (nhà cung cấp): **giữ config đó**, chỉ cần chắc chắn
> NAT cover `10.77.0.0/24` (thêm rule nếu thiếu) + dùng key THỰC TẾ cho registry.

## BƯỚC 2 — SSH từ coordinator (VPS chính 103.173.155.50) tới node mới

```bash
# Trên coordinator:
ssh-keygen -t ed25519 -N "" -f /root/.ssh/id_ed25519 -q   # nếu chưa có
cat /root/.ssh/id_ed25519.pub
# Thêm pubkey vào node mới /root/.ssh/authorized_keys (chmod 600)
# Test:
ssh -o BatchMode=yes root@<NODE_IP> "echo OK"
```

## BƯỚC 3 — Add node vào registry (admin API)

```bash
TOKEN=$(cut -d= -f2 secrets/flowvpn-cp-admin.env)
curl -X POST "https://meetflowai.site/PrivateVPN/v1/admin/nodes" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "id": "vietnam-3",
    "name": "Vietnam 3",
    "country": "VN",
    "city": "Hanoi",
    "endpoint": "<NODE_IP>:443",
    "public_key": "<KEY_THUC_TE_TU_BUOC_1>",
    "ssh_target": "root@<NODE_IP>",
    "priority": 300,
    "active": true
  }'
```

## BƯỚC 4 — Verify (làm đủ mới coi là xong)

```bash
# 1. Node hiện trong /v1/nodes
curl https://api.meetflowai.site/v1/nodes

# 2. Register test → peer lên node mới (qua SSH)
#    (đăng ký device với exit_node_id = node mới, xem wg show wg0 peers trên node đó)

# 3. Connect thật trên app → public IP = IP node mới
#    (mạng phải THÔNG — nếu connected nhưng không vào được mạng → check NAT 10.77)

# 4. Health
curl -s "https://meetflowai.site/PrivateVPN/v1/admin/nodes/<id>/health" -H "Authorization: Bearer $TOKEN"
```

## Checklist nhanh (copy dùng)

- [ ] Cài WireGuard + ip_forward
- [ ] wg0.conf: NAT cover **10.77.0.0/24** (client subnet) + subnet local
- [ ] wg-quick up + ghi key thực tế (`wg show wg0 public-key`)
- [ ] SSH coordinator → node (không password)
- [ ] Registry: endpoint + public_key (THỰC TẾ) + ssh_target + priority + active
- [ ] Verify: /v1/nodes + register → peer trên node + connect thật → IP đúng + mạng thông

## Troubleshooting thật đã gặp (2026-09-09 → 09-12)

| Triệu chứng | Nguyên nhân | Cách xử |
|---|---|---|
| App "Connected" nhưng không có mạng | socket transport **không được `protect()`** → packet của tunnel bị route vào tunnel chưa kết nối | Đã fix trong app (tạo socket ở Java → `protect()` → `fd` sang Go). Đừng sửa theo hướng cũ. |
| Connect fail khi app ở background trên **mobile data**, WiFi thì OK | `netpolicy` chặn data app ở background trên mạng **metered** (`blocked=APP_BACKGROUND`) | Đã fix: foreground service `specialUse` + retry vô hạn + nhớ transport (`docs/ANDROID_METERED_BACKGROUND_DATA.md`) |
| Node mới, UDP từ TQ timeout dù server vẫn sống | GFW chặn UDP theo **IP** (như node2) | Dùng TCP relay (8443/9445) hoặc xin IP ở dải tốt hơn (`docs/EXIT_NODE_IP_GUIDE.md`) |
| `403` khi tải file trong `/var/www/flowvpn/**` | file thuộc root, mode 600 → caddy (user `caddy`) không đọc được | `chown caddy:caddy <file> && chmod 644 <file>` |
| `caddy reload` làm chết web | cấu hình sai | Luôn `caddy validate --config /etc/caddy/Caddyfile` **trước** khi `systemctl reload caddy` |
| Đổi cấu hình hysteria phải restart tay | chạy bằng `setsid nohup` (node1/node2 hiện tại) | Node mới dùng systemd: `systemctl restart hysteria@8443` |
