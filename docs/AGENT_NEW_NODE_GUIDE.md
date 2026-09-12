# AGENT_NEW_NODE_GUIDE — dựng exit node VPN mới (dành cho AI agent không có context phiên trước)

> Mục đích: khi owner có thêm VPS mới, bất kỳ agent nào đọc file này cũng dựng được node,
> test được từ Trung Quốc và đăng ký được node vào hệ thống — **không cần hỏi lại context**.
> Tất cả lệnh dưới đây copy-paste được. Repo: `/Volumes/BIWIN/SourcesCode/PrivateVPN`.

Đọc kèm:
- `docs/EXIT_NODE_IP_GUIDE.md` — chọn dải IP/ASN.
- `docs/ANDROID_METERED_BACKGROUND_DATA.md` — vì sao app cần foreground service (đừng "sửa" theo hướng cũ).
- `tools/node-setup/README.md` *(nếu có)*, `tools/node-setup/provision-node.sh`, `tools/node-setup/relay.go`.
- `tools/hysteria-android/README.md` — build AAR client (chỉ khi cần sửa app).

---

## 1. Topology hiện tại (số liệu thật, kiểm tra ngày 2026-09-12)

### Coordinator (control-plane)
| Thành phần | Giá trị |
|---|---|
| Source trên server | `/root/flowvpn-cp` (Node/Express), entry `src/index.js` |
| systemd | `flowvpn-cp.service` (đang chạy trên **node1**) |
| Port nội bộ | **7778** (chỉ localhost) |
| Public | caddy: `api.meetflowai.site` → `reverse_proxy 127.0.0.1:7778`; `meetflowai.site` → `/buy`, `/v1/*`, `/dl/*` (static `/var/www/flowvpn`), `/support`, `/privacy`, … |
| Auth admin | env `AUTH_TOKEN` (Bearer) + allowlist IP **chỉ 127.0.0.1** → mọi lệnh admin phải chạy **trên node1** |
| Auth user | session Bearer (`/v1/auth/email/start` + `/verify`) |
| Dữ liệu | `DATA_FILE=.../devices.json`, `AUTH_FILE=.../auth.json`, `NODES_DB_FILE=.../nodes.db` (**SQLite — nguồn thật của danh sách node**), `NODES_FILE=.../nodes.json` (**legacy, không phải nguồn đang chạy**) |

### Các node đang có
| Node | IP | ASN | Từ Trung Quốc | Ghi chú |
|---|---|---|---|---|
| node1 | `103.173.155.50` | **AS135905 (VNPT)** | ✅ UDP hysteria đi thẳng + TCP relay đều chạy | Chuẩn để so sánh; cũng là nơi đặt coordinator |
| node2 | `103.6.234.233` | **AS152992 (Online Data)** | ⚠️ **UDP bị chặn ở mức IP** → chỉ dùng được TCP relay (chậm hơn) | Đang chờ provider đổi IP |

### Transport (áp dụng cho mọi node)
- **hysteria2 (QUIC)** — server UDP ports: **8443, 28443, 54443**; obfs **salamander** password `<HY_OBFS_PASSWORD>`; auth password `<HY_AUTH_PASSWORD>`; TLS self-signed `CN=meetflowai.site` (client dùng `insecure`).
- **TCP relay** — app dial TCP **8443** và **9445**, relay bọc/giải bọc framing **2 byte big-endian length prefix** rồi chuyển sang UDP `127.0.0.1:8443`. Relay viết bằng Go: `tools/node-setup/relay.go` (binary có sẵn: `tools/node-setup/bin/hyrelay-linux-amd64`). *(Node1/node2 cũ còn dùng `wgrelay.js` bản Node — node mới dùng binary Go, không cần Node.js.)*
- Phía app Android (hysteria mode): `claim` thiết bị → thử lần lượt **[transport đã nhớ]** → **TCP relay** → **UDP**; bật **Brutal CC** (`HY_UP_KBPS=2000`, `HY_DOWN_KBPS=20000`); chạy dưới **foreground service** (`specialUse`).

---

## 2. Chọn IP/VPS (đọc trước khi mua)

1. **Ưu tiên AS135905 (VNPT)** — cùng AS với node1, đã chứng minh thông từ TQ (cả UDP). Dải tham khảo: `103.173.x`, `103.137.184.0/23`, `165.101.114.0/23`.
2. **Tránh AS152992 (Online Data/DataOnline)** cho hysteria UDP: `160.187.0.0/23` và `103.6.234.0/23` (chứa `103.6.235.1`, cùng /23 với node2).
3. **Luôn test 1 IP trước khi mua block**: GFW chặn theo IP//24 theo lịch sử abuse, không theo AS.
4. Khi đặt mua: yêu cầu **block tĩnh /29–/28, dedicated, không NAT**, được **set rDNS/PTR**; hỏi lịch sử abuse.
5. Chi tiết + quy trình: `docs/EXIT_NODE_IP_GUIDE.md`.

---

## 3. Quy trình 7 bước dựng node

### Biến dùng chung (chạy trên máy dev)
```bash
cd /Volumes/BIWIN/SourcesCode/PrivateVPN
export NODE1_KEY=.tmp/flowvpn_support_page_ed25519     # key SSH vào node1 (coordinator)
export NODE2_KEY=~/.ssh/fpt_vpn_node                   # key SSH vào node2 (và các VPS mới dạng Online Data)
export NEW_IP=<IP_VPS_MOI>                             # ví dụ 165.101.114.10
export NEW_ID=<id_node>                                # ví dụ node-3 (2–63 ký tự [a-z0-9-_.])
```

### Bước 1 — SSH vào VPS mới, kiểm tra OS/arch
```bash
ssh -i $NODE2_KEY -o StrictHostKeyChecking=no root@$NEW_IP \
  'uname -m; . /etc/os-release; echo $NAME $VERSION_ID; nproc; free -m | head -2; ip -4 addr show | grep inet | head -3'
```
Kỳ vọng: Ubuntu 22.04/24.04, `x86_64` (nếu `aarch64` thì dùng binary `hyrelay-linux-arm64` và bản hysteria `linux-arm64`).
Kiểm tra firewall nhà cung cấp có mở UDP 8443/28443/54443 và TCP 8443/9445 không (nhiều VPS chặn mặc định).

### Bước 2 — Copy bộ provision lên VPS
```bash
scp -r -i $NODE2_KEY tools/node-setup root@$NEW_IP:/root/
# nếu scp -r lỗi (volume exFAT), dùng tar:
tar czf /tmp/node-setup.tgz -C tools node-setup \
  && scp -i $NODE2_KEY /tmp/node-setup.tgz root@$NEW_IP:/root/ \
  && ssh -i $NODE2_KEY root@$NEW_IP 'tar xzf /root/node-setup.tgz -C /root && ls /root/node-setup'
```

### Bước 3 — Relay: build hoặc dùng binary có sẵn
```bash
# (a) dùng binary có sẵn (nhanh nhất)
scp -i $NODE2_KEY tools/node-setup/bin/hyrelay-linux-amd64 root@$NEW_IP:/root/hyrelay

# (b) hoặc build lại từ source
cd tools/node-setup
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o bin/hyrelay-linux-amd64 relay.go   # arm64: GOARCH=arm64
cd -
```

### Bước 4 — Lấy binary hysteria2 và chạy provision
```bash
# Copy binary đã kiểm chứng từ node1 (23 MB) hoặc tải từ GitHub releases (apernet/hysteria, linux-amd64)
scp -i $NODE1_KEY root@103.173.155.50:/root/hysteria.bin /tmp/hysteria
scp -i $NODE2_KEY /tmp/hysteria root@$NEW_IP:/root/hysteria

ssh -i $NODE2_KEY root@$NEW_IP \
  'cd /root/node-setup && chmod +x provision-node.sh && ./provision-node.sh --hysteria-bin /root/hysteria --hyrelay-bin /root/hyrelay'
```
**Tham số của `provision-node.sh`:**

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `--hysteria-bin PATH` | — | copy binary vào `/usr/local/bin/hysteria` |
| `--hyrelay-bin PATH` | — | copy binary vào `/usr/local/bin/hyrelay` |
| `--udp-ports "p1 p2 …"` | `8443 28443 54443` | các cổng UDP hysteria (mỗi cổng 1 instance systemd `hysteria@<port>`) |
| `--relays "tcp:udp …"` | `8443:8443 9445:8443` | cặp cổng TCP relay → UDP đích (`hyrelay@<tcp>`) |
| `--auth PASS` | `<HY_AUTH_PASSWORD>` | auth password hysteria |
| `--obfs PASS` | `<HY_OBFS_PASSWORD>` | salamander obfs password |
| env `HYSTERIA_URL` | — | nếu không truyền `--hysteria-bin` thì script tải từ URL này |
| env `CERT_CN` | `meetflowai.site` | CN của cert self-signed |

Script làm (idempotent): cài `openssl/curl` nếu thiếu → cài binary vào `/usr/local/bin` → tạo cert `/etc/hysteria-cert.pem` + `/etc/hysteria-key.pem` (key `chmod 600`) → ghi `/etc/hysteria-server-<port>.yaml` cho từng cổng → cài unit `hysteria@.service` + `hyrelay@.service` (drop-in `HYRELAY_TARGET` cho từng cổng TCP) → `enable --now` tất cả → mở `ufw` nếu đang bật → in summary.

### Bước 5 — Kiểm tra trên node mới
```bash
ssh -i $NODE2_KEY root@$NEW_IP 'bash -s' <<'EOS'
systemctl is-active hysteria@8443 hysteria@28443 hysteria@54443 hyrelay@8443 hyrelay@9445
ss -ulnp | grep -E ':(8443|28443|54443)\b'
ss -tlnp | grep -E ':(8443|9445)\b'
systemctl status 'hysteria@*' --no-pager | head -20
tail -3 /var/log/syslog 2>/dev/null | grep -i hysteria || true
EOS
```
Kỳ vọng: 5 dòng `active`, 3 cổng UDP `*:8443 …` do `hysteria`, 2 cổng TCP do `hyrelay`, và các unit `enabled` (sống qua reboot).

### Bước 6 — Test từ ngoài (VN) — dùng hysteria CLI client + SOCKS5 (đã kiểm chứng)
Chạy trên **node1 hoặc node2** (đã có binary hysteria):
```bash
ssh -i $NODE1_KEY root@103.173.155.50 'bash -s' <<EOS
cat > /tmp/hy-client.yaml <<'YAML'
server: $NEW_IP:8443
auth: <HY_AUTH_PASSWORD>
tls:
  sni: $NEW_IP
  insecure: true
obfs:
  type: salamander
  salamander:
    password: <HY_OBFS_PASSWORD>
socks5:
  listen: 127.0.0.1:1080
YAML
pkill -f "hysteria client" 2>/dev/null; sleep 1
setsid nohup /usr/local/bin/hysteria client -c /tmp/hy-client.yaml </dev/null >/tmp/hy-client.log 2>&1 &
sleep 3; tail -3 /tmp/hy-client.log
curl -s -o /dev/null -w "down=%{speed_download} B/s  time=%{time_total}s\n" --max-time 40 \
  --socks5-hostname 127.0.0.1:1080 "https://speed.cloudflare.com/__down?bytes=10000000"
pkill -f "hysteria client"
EOS
```
- Log client phải có `connected to server {"addr": "<NEW_IP>:8443", "udpEnabled": true}` và tốc độ > vài MB/s (baseline node2→node1 đã đo: ~11.4 MB/s).
- **TCP relay** khó test bằng CLI (relay nói framing riêng, không phải SOCKS): test bằng **app Android** (chọn node mới) hoặc build probe `hyconnect` từ cây hysteria — lưu ý probe này **không được commit trong repo**, nếu không có thì bỏ qua, app test là đủ:
  ```bash
  # trong repo hysteria đã clone (xem tools/hysteria-android/build.sh để clone + patch)
  go build -o /tmp/hyconn ./app/tools/hyconnect    # nếu tồn tại
  /tmp/hyconn $NEW_IP 8443 <HY_AUTH_PASSWORD> <HY_OBFS_PASSWORD> tcp $NEW_IP:8443
  ```

### Bước 7 — Test từ TRUNG QUỐC (bài test quyết định)
Bắt buộc: vantage TQ = **điện thoại Android của owner** (đang dùng SIM TQ). `check-host.net` **không có node TQ**, HK không tính.
```bash
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
adb devices                      # nếu trống: nhắc owner BẬT LẠI USB debugging (máy Samsung tự tắt sau ~10 phút)
adb shell "svc wifi disable; svc data enable"
adb shell "ping -c 3 $NEW_IP; toybox nc -z -w 3 $NEW_IP 8443; echo tcp8443=\$?; toybox nc -z -w 3 $NEW_IP 9445; echo tcp9445=\$?"
```
Sau đó **Connect bằng app** với node mới và đọc log:
```bash
adb logcat -c
adb logcat -v time | grep --line-buffered VPNFLOW_DEBUG
# cần thấy:  hysteria: UP via UDP <NEW_IP>:8443      → UDP thông từ TQ (tốt nhất)
# hoặc:      hysteria: UP via TCP relay 8443         → chỉ TCP thông (IP bị chặn UDP, giống node2)
# hoặc:      hysteria: no transport reachable        → IP/dải có vấn đề, đổi IP
```
> UDP **không** test được bằng `nc`; chỉ hysteria client mới xác nhận UDP.

---

## 4. Đăng ký node với hệ thống

### 4.1 Cách đúng: admin API (chạy TRÊN node1, vì admin chỉ cho 127.0.0.1)
```bash
ssh -i $NODE1_KEY root@103.173.155.50 'bash -s' <<EOS
AT=\$(systemctl show flowvpn-cp -p Environment | tr ' ' '\n' | grep '^AUTH_TOKEN=' | cut -d= -f2-)
curl -s -X POST http://127.0.0.1:7778/v1/admin/nodes \
  -H "Authorization: Bearer \$AT" -H 'Content-Type: application/json' \
  -d '{
        "id": "$NEW_ID",
        "name": "Vietnam 3",
        "country": "VN",
        "city": "Hanoi",
        "endpoint": "$NEW_IP:443",
        "public_key": "PLACEHOLDER_HYSTERIA_ONLY",
        "active": true,
        "priority": 150
      }' | python3 -m json.tool
EOS
```
Quy tắc validate của server (`validateNode`): `id` 2–63 ký tự `[a-z0-9-_.]`, `name`, `country` ISO-2 (`VN`), `city`, `endpoint` dạng `host:port`, `public_key` **bắt buộc khác rỗng**.
- Chế độ hysteria của app **chỉ dùng phần host** của `endpoint` (port bị bỏ qua) → đặt `IP:443` theo convention hiện tại.
- `public_key`: nếu node có WireGuard thì điền pubkey thật; nếu node hysteria-only thì để placeholder (app hysteria không dùng field này).
- `priority`: số nhỏ = ưu tiên cao hơn (node-1 = 100, vietnam-2 = 200).

### 4.2 ⚠️ Không sửa `nodes.json` để mong node xuất hiện
`/root/flowvpn-cp/data/nodes.json` là **legacy**: nguồn dữ liệu đang chạy là **SQLite** `NODES_DB_FILE=/root/flowvpn-cp/data/nodes.db`.
Bằng chứng: `nodes.json` chứa entry `test-vietnam-2` (inactive, endpoint `10.0.0.1:443`) trong khi `/v1/nodes` trả `vietnam-2` **active** với `103.6.234.233:443` → hai nguồn khác nhau.
Chỉ sửa `nodes.json` nếu có consumer khác đọc nó; **cách duy nhất để app thấy node là admin API (hoặc `PATCH /v1/admin/nodes/:id`)**.
Nếu sau khi POST mà `/v1/nodes` chưa thấy node: `systemctl restart flowvpn-cp` trên node1.

### 4.3 Verify
```bash
curl -s https://api.meetflowai.site/v1/nodes | python3 -m json.tool
# phải thấy entry mới (id, name, country, city, endpoint, public_key/serverPublicKey)
```

### 4.4 (Tuỳ chọn) Thêm vào fallback của app
Khi coordinator không truy cập được, app dùng danh sách offline trong
`android/app/src/main/java/com/privatevpn/app/api/Models.kt` → object `ExitNodeFallback` (mỗi entry: `id`, `name`, `country`, `city`, `endpoint`, `publicKey`).
Muốn node luôn hiện cả khi offline thì thêm entry ở đây rồi build lại:
```bash
# bản bán web (branch main):  ./gradlew :app:assembleRelease
# bản Google Play (branch store): ./gradlew :app:bundleRelease
# (xem docs/PLAY_SUBMISSION.md cho AAB; không tự release khi chưa được owner xác nhận)
```

---

## 5. Checklist verify sau khi dựng xong (ghi kết quả thật vào đây)

- [ ] SSH vào được bằng key (`$NODE2_KEY` hoặc key của provider): `ssh -i $NODE2_KEY root@$NEW_IP true`
- [ ] OS/arch đúng (`uname -m` = `x86_64`/`aarch64` khớp binary)
- [ ] Firewall provider mở UDP 8443/28443/54443 + TCP 8443/9445
- [ ] `systemctl is-active hysteria@8443 hysteria@28443 hysteria@54443 hyrelay@8443 hyrelay@9445` → 5×`active`
- [ ] Các unit `enabled` (`systemctl is-enabled …`) → sống qua reboot (khác node1/node2 cũ dùng `setsid nohup`)
- [ ] Cert tồn tại: `ls -l /etc/hysteria-cert.pem /etc/hysteria-key.pem` (key 600), CN = `meetflowai.site`
- [ ] `ss -ulnp | grep -E ':(8443|28443|54443)'` → 3 listener; `ss -tlnp | grep -E ':(8443|9445)'` → 2 listener
- [ ] Test từ VN bằng hysteria CLI + socks5 → `connected to server`, tốc độ vài MB/s
- [ ] Test từ **TQ** bằng điện thoại: `ping` OK, TCP 8443/9445 OK
- [ ] Test từ **TQ** bằng app: log có `UP via UDP …` (tốt) hoặc `UP via TCP relay …` (chấp nhận nhưng chậm hơn)
- [ ] `Disconnect` rồi `Connect` lại 3 lần liên tiếp đều lên; rớt mạng thì app tự retry (xem `no transport reachable` + backoff trong log)
- [ ] Node xuất hiện trong `https://api.meetflowai.site/v1/nodes` và chọn được trong app
- [ ] Ghi lại: IP, ASN, kết quả UDP/TCP từ TQ, tốc độ đo được, thời điểm test

---

## 6. Gotchas đã gặp thật (đọc để không lặp lại)

1. **File public phải `chown caddy:caddy` + `chmod 644`** nếu đặt trong `/var/www/flowvpn/…` — caddy chạy bằng user `caddy`, file `600` sẽ trả **403** dù caddy config đúng. (Đã gặp với APK/AAB và `support.html`.)
2. **Relay framing là 2 byte big-endian length prefix**, đúng như app Android gửi. Đổi framing thì phải sửa **cả hai đầu** (client trong `tools/hysteria-android/mobile.go` + server `tools/node-setup/relay.go`), nếu không sẽ treo ở handshake.
3. **Android 15/16 đã bỏ FGS type `vpn`** → app dùng `foregroundServiceType="specialUse"` + property `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`. Server không liên quan; **đừng** quay lại `startForegroundService` + type `vpn` (không còn tồn tại, aapt2 sẽ từ chối).
4. **hysteria server KHÔNG đặt `ignoreClientBandwidth: true`** (và không set `bandwidth` phía server) — app đang dùng **Brutal CC** (`upKbps/downKbps`); đặt `true` sẽ tắt Brutal → tốc độ tụt trên mạng loss.
5. **Cert self-signed `CN=meetflowai.site` là bình thường** (client cấu hình `insecure: true`). Đừng "nâng cấp" sang Let's Encrypt rồi đổi CN/đường dẫn mà không cập nhật cả 2 phía.
6. **SSH key**: node1 dùng `.tmp/flowvpn_support_page_ed25519`; node2 (và VPS mới dạng Online Data) dùng `~/.ssh/fpt_vpn_node`. Nếu cần vào node1 bằng key node2 thì thêm pubkey của `fpt_vpn_node` vào `/root/.ssh/authorized_keys` của node1.
7. **node1/node2 hiện chạy bằng `setsid nohup`** (không systemd) → mất khi reboot; **node mới dùng systemd**. Đừng copy cách cũ.
8. **Đừng chiếm UDP 443** trên node có WireGuard (node1 đang dùng 443/udp cho WG + relay TCP 9444). Node hysteria-only thì dùng 8443/28443/54443.
9. **Nếu test TQ chỉ lên được qua TCP relay** → IP đó bị chặn UDP (giống node2) → đổi IP/dải, đừng cố tối ưu code.
10. **adb/USB debugging trên máy Samsung hay tự tắt (~10 phút)** → phải bật lại trước mỗi lần test; `adb devices` trống nghĩa là tắt, không phải cáp hỏng.
11. **`nc` không test được UDP**; muốn biết UDP có thông từ TQ thì chỉ có cách connect hysteria bằng app.
12. **Đừng tự release** (upload Play / đổi `VPNFlow-latest.apk` / sửa trang buy) khi chưa được owner xác nhận test xong.

---

## 7. Definition of done

Node mới chỉ được coi là **xong** khi đạt đủ 3 điều kiện:

1. **Lên được từ mạng Trung Quốc** — tối thiểu `UP via TCP relay` trên app khi dùng data TQ; tốt nhất là `UP via UDP <IP>:8443`. Nếu không lên được đường nào → IP/dải không đạt, báo owner đổi.
2. **Xuất hiện trong hệ thống** — có trong `GET https://api.meetflowai.site/v1/nodes`, chọn được trong app (và tuỳ chọn: có trong `ExitNodeFallback`).
3. **Chịu được disconnect/reconnect** — bấm Disconnect → Connect lại nhiều lần đều lên; khi mạng rớt, app tự retry (log có `no transport reachable` rồi tự `UP via …`), không cần tắt/mở lại app.

Báo cáo lại cho owner: IP + ASN, kết quả test từ TQ (UDP/TCP), tốc độ đo được, và đã thêm node vào coordinator với `id` nào.

---

## Phụ lục A — Tóm tắt file & cổng

| Thành phần | Đường dẫn / cổng |
|---|---|
| Provision script | `tools/node-setup/provision-node.sh` |
| Relay source | `tools/node-setup/relay.go` |
| Relay binary | `tools/node-setup/bin/hyrelay-linux-amd64` (và `-arm64`) |
| systemd units | `tools/node-setup/systemd/hysteria@.service`, `hyrelay@.service` |
| Server config sau khi dựng | `/etc/hysteria-server-<port>.yaml` |
| Cert | `/etc/hysteria-cert.pem`, `/etc/hysteria-key.pem` |
| Log | `journalctl -u hysteria@8443 -f`, `journalctl -u hyrelay@8443 -f` |
| Coordinator | `/root/flowvpn-cp` · `systemctl restart flowvpn-cp` · port `7778` |
| Node registry (thật) | SQLite `/root/flowvpn-cp/data/nodes.db` |
| Android client AAR | `tools/hysteria-android/` + `android/app/libs/hysteria.aar` |

## Phụ lục B — Lệnh test nhanh một phát (copy cả cục)
```bash
cd /Volumes/BIWIN/SourcesCode/PrivateVPN
NEW_IP=<IP>; NODE2_KEY=~/.ssh/fpt_vpn_node
ssh -i $NODE2_KEY root@$NEW_IP 'systemctl is-active hysteria@8443 hysteria@28443 hysteria@54443 hyrelay@8443 hyrelay@9445; ss -ulnp | grep -cE ":(8443|28443|54443)"; ss -tlnp | grep -cE ":(8443|9445)"'
ssh -i .tmp/flowvpn_support_page_ed25519 root@103.173.155.50 \
  "curl -s -o /dev/null -w 'probe-udp-ok=%{http_code}\n' --max-time 10 -x socks5h://127.0.0.1:1080 https://ifconfig.me || true"
```
