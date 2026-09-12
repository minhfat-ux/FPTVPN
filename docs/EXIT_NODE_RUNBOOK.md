# EXIT NODE RUNBOOK — Thêm exit node mới (1 lần là xong)

> ⚠️ **CẬP NHẬT 2026-09-12 — transport đã đổi.** Từ nay node mới phải chạy **hysteria2 + TCP relay**
> (không phải WireGuard). Các bước WireGuard bên dưới **chỉ còn dùng cho node legacy / client cũ**.
> Quy trình đúng cho node mới: **`docs/AGENT_NEW_NODE_GUIDE.md`** + `tools/node-setup/provision-node.sh`
> (systemd: `hysteria@<port>`, `hyrelay@<port>`), chọn dải IP theo `docs/EXIT_NODE_IP_GUIDE.md`.

## 0. Trạng thái node hiện tại (2026-09-12)

| Node | IP | ASN | Cổng đang chạy | Ghi chú |
|---|---|---|---|---|
| node1 (coordinator) | `103.173.155.50` | AS135905 (VNPT) | hysteria UDP `8443/28443/54443`; relay TCP `8443→8443`, `9445→8443`; wgrelay TCP `9444→UDP 443` (legacy) | Chạy tốt từ TQ (cả UDP lẫn TCP relay) |
| node2 | `103.6.234.233` | AS152992 (Online Data) | như trên | **UDP bị GFW chặn ở mức IP** → chỉ dùng được TCP relay |

- Config hysteria: node1 `/etc/hysteria/server.yaml` (+`server-<port>.yaml`), node2 `/etc/hysteria-server-<port>.yaml`; cert self-signed `/etc/hysteria-cert.pem`.
- Auth `flowvpn_hysteria_2026`, obfs salamander `FlowVPN-8f3k`. **Không** đặt `ignoreClientBandwidth: true` (sẽ mất Brutal CC của client).
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
