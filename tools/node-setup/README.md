# node-setup — dựng exit node VPNFlow (hysteria2 + TCP relay)

Bộ công cụ chuẩn để dựng **node mới** (thay cách cũ `setsid nohup`): mọi thứ chạy dưới **systemd**,
tự bật lại sau reboot, không cần Node.js.

## Thành phần
| File | Việc |
|---|---|
| `provision-node.sh` | Cài hysteria + relay, sinh cert self-signed, ghi config, tạo `hysteria@<port>` / `hyrelay@<port>`, mở firewall, in ra bảng tóm tắt |
| `relay.go` | TCP ⇄ UDP relay (Go). Framing **2 byte big-endian length prefix** — đúng thứ app Android gửi |
| `systemd/hysteria@.service` | Template unit: `ExecStart=/usr/local/bin/hysteria server -c /etc/hysteria-server-%i.yaml` |
| `systemd/hyrelay@.service` | Template unit: `hyrelay -listen :%i -target $HYRELAY_TARGET` (target set qua drop-in) |
| `bin/hyrelay-linux-amd64`, `bin/hyrelay-linux-arm64` | Binary build sẵn |

## Dùng nhanh
```bash
# trên VPS mới (root)
scp -r tools/node-setup root@NEW_IP:/root/
ssh root@NEW_IP
cd /root/node-setup
./provision-node.sh --hysteria-bin /root/hysteria --hyrelay-bin bin/hyrelay-linux-amd64
```
Tham số tuỳ chọn: `--udp-ports "8443 28443 54443"`, `--relays "8443:8443 9445:8443"`, `--auth <pw>`,
`--obfs <pw>`; hoặc đặt qua env `UDP_PORTS`, `RELAYS`, `AUTH_PASS`, `OBFS_PASS`, `HYSTERIA_URL`.

Kiểm tra sau khi chạy:
```bash
systemctl is-active hysteria@8443 hysteria@28443 hysteria@54443 hyrelay@8443 hyrelay@9445
ss -uln | grep -E '8443|28443|54443'   # hysteria
ss -tln | grep -E '8443|9445'          # relay
```

## Đăng ký vào hệ thống (trên node1 — nơi chạy coordinator)
Node lưu trong **SQLite** `/root/flowvpn-cp/data/nodes.db` (bảng `exit_nodes`), `nodes.json` chỉ là import legacy.
Thêm node qua **admin API** hoặc DB rồi `systemctl restart flowvpn-cp`; kiểm tra `curl -s https://api.meetflowai.site/v1/nodes`.
Chi tiết từng bước: `docs/AGENT_NEW_NODE_GUIDE.md`.

## Build lại binary relay khi sửa `relay.go`
```bash
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o bin/hyrelay-linux-amd64 relay.go
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o bin/hyrelay-linux-arm64 relay.go
```
Smoke test nhanh (macOS): chạy binary bản darwin với 1 UDP echo server rồi gửi frame 2-byte length — xem lịch sử commit.
