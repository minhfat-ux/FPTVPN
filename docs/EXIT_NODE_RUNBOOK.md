# EXIT NODE RUNBOOK — Thêm exit node mới (1 lần là xong)

- **Verified:** 2026-08-23 (node 2: 103.6.234.233 — đã làm đủ, có cả bài học từ lỗi)
- **Scope:** thêm exit node WireGuard mới vào hệ thống (coordinator + registry + app)

## ⚠️ 3 QUY TẮC VÀNG (học từ lỗi thật)

1. **Public key phải là key THỰC TẾ của node** — lấy `wg show wg0 public-key` TRÊN node đó.
   Đừng dùng key của node khác. (Node 2 từng bị lệch key do config bị ghi đè → connect fail.)
2. **NAT phải cover subnet client `10.77.0.0/24`** (không chỉ subnet local của node).
   Lỗi "connected nhưng mạng không thông" = thiếu rule này. (Node 2 chỉ NAT 10.78.0.0/24 → client 10.77.0.x không ra được internet.)
3. **App phải gửi `exit_node_id` khi register** — nếu không, coordinator provision peer lên node đầu
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
