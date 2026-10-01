# Agent Handoff — bổ sung **WireGuard đầy đủ** cho `vietnam-3` (node-2 mới `103.6.235.39`)

- **Task ID:** TASK-20260930-VN3-WG (tiếp nối `HANDOFF_VN3_NODE_DEPLOY_2026-09-30.md`)
- **Date:** 2026-09-30 · **Agent:** main (harness Mac)
- **Status:** ✅ XONG — đã tự nghiệm thu; còn 1 bước cần chủ dự án (chọn lại node trên máy khách)

## 1. Triệu chứng & gốc rễ

**Chủ dự án báo:** *"connect vào node mới đang mất mạng"*.

**Gốc rễ (đã chứng minh bằng code, không phải suy đoán):** `vietnam-3` được dựng **chỉ hysteria2**.
Hàng `exit_nodes` vì thế có `public_key = HYSTERIA_ONLY_VN3` (chuỗi giữ), `ws_relay_url`/`wg_relay_url` = NULL,
`ssh_target` = rỗng. Nhưng:

| Bằng chứng | Ý nghĩa |
|---|---|
| `iOS/PrivateVPN/Services/ControlAPIClient.swift:63` — `var relayURL: String? { wg_relay_url ?? ws_relay_url }` | iOS/macOS lấy relay qua `wg_relay_url` |
| `mac/PrivateVPNMac/VPNManagerMac.swift:876` — cùng công thức | macOS dùng stack WireGuard |
| `ControlAPIClient.swift:98` — `relayURLMissing = "RELAY_URL_MISSING"` | iOS báo **lỗi cấu hình**, không đoán relay |
| `control-plane/src/index.js:5366` — `wgForNode()` rơi về wg **local** khi `ssh_target` rỗng | peer khách bị nhét nhầm vào wg0 của `relay-server` |

⇒ Client WireGuard chọn `Vietnam 3` sẽ **dựng route rồi bắt tay vào `103.6.235.39:443` nơi không có gì**
⇒ `Connected` nhưng **mất sạch mạng**.

**Đã kiểm tra và BÁC BỎ hai giả thuyết trước khi sửa** (ghi lại để không ai đi lại đường cũ):
1. ~~"node-2 không forward/NAT"~~ — `ip_forward=0` + `FORWARD DROP` là thật, **nhưng hysteria2 ở đây chạy
   proxy không gian người dùng** (`ls /sys/class/net` chỉ có `enp3s0`/`lo`, **không có TUN**), nên hysteria
   không dùng đường forward. Đã sửa NAT/forward **vì WireGuard cần**, không phải vì hysteria.
2. ~~"log `timeout: no recent network activity` của node-2 là lỗi"~~ — **node-1 đang chạy tốt cũng có 102 lỗi
   y hệt**. Đó là tiếng ồn bình thường của hysteria. Node-2 đi internet tốt (ping 1.1.1.1 = 27 ms,
   Google 302 trong 0,42 s, TCP tới `157.240.211.3:443` OK, conntrack 39/8192).

## 2. Đã làm (CHỈ THÊM — KHÔNG PHÁ; không tắt/không đổi `active`/`priority` của node cũ)

### node-2 `103.6.235.39`
| Việc | Chi tiết |
|---|---|
| Cài WireGuard | `wireguard-tools v1.0.20210914` |
| `ip_forward` | `=1`, persist `/etc/sysctl.d/99-wireguard-forward.conf` |
| `wg0.conf` | `Address = 10.77.0.1/24` · `ListenPort = 443` · NAT `10.77.0.0/24` ra **`enp3s0`** (không phải `eth0`) |
| `rp_filter` | `net.ipv4.conf.wg0.rp_filter=0`, persist `/etc/sysctl.d/99-wireguard-rpfilter.conf` |
| systemd | `wg-quick@wg0` **active + enabled** (sống qua reboot) |
| `ufw` | `443/udp` ALLOW · `DEFAULT_FORWARD_POLICY="ACCEPT"` (backup `/etc/default/ufw.bak-vn3wg`) |
| Key | sinh mới **tại node**; public key `PJkfS+hkO6rKkHkpjKfHi2vHqSv5kl66IsaoA6OMvG0=` |
| `authorized_keys` | thêm pubkey **`id_node1`** của coordinator (suy bằng `ssh-keygen -y`); **đã gỡ** key `id_ed25519` tôi thêm nhầm lúc đầu ⇒ còn **2 dòng** |

### relay-server `165.101.114.162` (= coordinator)
| Việc | Chi tiết |
|---|---|
| Unit mới | `/etc/systemd/system/relay-cf-vn3wg.service` — `WS_LISTEN_PORT=7791`, `WS_UDP_HOST=103.6.235.39`, `WS_UDP_PORT=443`, `PONG_TIMEOUT_MS=120000`, active+enabled |
| `Caddyfile` | chèn **2** `handle /relay/vn3wg*` → `127.0.0.1:7791` (cả hai site block); backup `/etc/caddy/Caddyfile.bak-vn3wg-20260930-220655` |
| Lưới an toàn | `/root/vn3wg-rollback.sh` — đặt **TRƯỚC** khi reload (luật AGENTS §7e.1), tự khôi phục Caddyfile nếu cửa nào ≠ 426 |
| Công cụ vận hành | vá `flowvpn-health-watch` (+1 dòng CATALOG), `flowvpn-safe-status` (+1 relay, "năm"→"sáu"), `flowvpn-safe-stop` (`NODE3_RELAYS` nay 2 relay). Backup `/root/flowvpn-tools-backup-20260930-220836-vn3wg/` |

### Registry (`exit_nodes`, qua `PATCH /v1/admin/nodes/vietnam-3`)
`public_key` = key thật · `ssh_target` = `root@103.6.235.39` · `ws_relay_url` = `wg_relay_url` =
`wss://api.meetflowai.site/relay/vn3wg` · **giữ nguyên** `hy_relay_url`, `active=1`, `priority=150`, `endpoint`.
Backup DB: `/root/flowvpn-cp/data/nodes.db.bak-vn3wg-20260930-221029`.

## 3. Bằng chứng (lệnh thật + kết quả thật)

```text
# /v1/nodes — vietnam-3 nay du field
vietnam-3  pk=PJkfS+hkO6rKkHkpjKfH   wg=wss://api.meetflowai.site/relay/vn3wg   hy=wss://api.meetflowai.site/relay/vn3hy

# 12 cua relay (6 path x 2 hostname)
api: vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426 vn3hy=426 vn3wg=426
t1:  vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426 vn3hy=426 vn3wg=426

# flowvpn-safe-status
KẾT LUẬN: ✔ TẤT CẢ ĐẠT (mọi unit active, cả sáu relay = 426)

# watchdog tu dong thay relay moi
2026-09-30 22:28:54 RELAY: vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426 vn3hy=426 vn3wg=426

# node-2 WireGuard
wg-quick@wg0: active/enabled · listen=443 · addr=10.77.0.1/24
ip_forward=1 · rp_filter=0 · ufw co 443/udp

# Duong production cap peer (id_node1 -> node-2), mo phong dung viec coordinator lam
ID_NODE1_OK ; CAP_OK ; allowed-ips 10.77.0.99/32 co mat ; THU_HOI_OK ; peers_con_lai=0

# Chung minh chang relay -> node-2 (bat goi CA HAI DAU, co doi chung 8443)
relay-server eth0 Out: 165.101.114.162.43400 > 103.6.235.39.443: UDP, length 12   (x3)
relay-server eth0 Out: 165.101.114.162.32578 > 103.6.235.39.8443: UDP, length 13  (x3)
node-2 enp3s0 In:     165.101.114.162.43400 > 103.6.235.39.443: UDP, length 12   (x3)  → 443=3
node-2 enp3s0 In:     165.101.114.162.32578 > 103.6.235.39.8443: UDP, length 13  (x3)  → 8443=3

# Khach cu khong hoi quy: caddy=active, flowvpn-cp=active, 4 relay cu van 426, tunnel Mac van Connected
```

## 4. Quyết định & giả định

| Quyết định | Lý do |
|---|---|
| Sửa `ufw` bằng `ufw allow 443/udp` (INPUT) + `iptables -P FORWARD ACCEPT`, **không** `ufw reload` toàn phần | `ufw allow` đã được chứng minh an toàn trên node này; đổi policy FORWARD qua `iptables -P` không đụng chuỗi INPUT nên không cắt SSH |
| Đặt **dead-man switch** `nohup sh -c 'sleep 120; [ -f /tmp/ufw-ok ] \|\| ufw --force disable'` trước khi đụng `ufw` | Luật §7e.1: node-2 không nằm trong watchdog nào, mất SSH là mất luôn đường cứu hộ |
| Cổng relay nội bộ **7791** | 7783/7785/7786/7787/7789 (relay), 7790 (127.0.0.1), 7799 (0.0.0.0) đã dùng |
| Giữ `priority=150`, `active=1` | Chủ dự án đã chốt 30/09: không giành khách của `vietnam-2`/`node-1` |
| **Không** tắt/không sửa node cũ | Luật chủ dự án: chỉ tắt exit cũ khi **0 khách** + có xác nhận |
| `flowvpn-health-watch` báo "10 unit + 6 relay" nhưng câu log cũ vẫn ghi "8/8 unit, 4 relay" | Đó là **nhật ký lịch sử 26/09**, giữ nguyên theo quy ước repo |

## 5. Việc chủ dự án cần làm (~1 phút)

Trên máy khách (macOS/iPhone), **ngắt rồi chọn lại `Vietnam 3` và Connect**. Lần đăng ký này
`provisionEverywhere` sẽ cấp peer trên `wg0` của node-2 qua `id_node1` (đã chứng minh chạy được).
Kỳ vọng: lên mạng, và `wg show wg0` trên node-2 xuất hiện peer `10.77.0.x/32`.

## 6. Điểm chưa chắc / việc còn lại

1. **CHƯA có phép đo từ Trung Quốc trên máy thật qua đường WireGuard** — cần điện thoại Android của
   chủ dự án. Hysteria qua `vn3hy` thì phiên khác đã có bằng chứng khách TQ chở 43,6 MB.
2. **Peer rác trên `relay-server`**: các thiết bị đăng ký trong lúc `vietnam-3` còn `ssh_target` rỗng đã bị
   `provisionEverywhere` nhét peer vào **wg0 local của coordinator**. Cần rà/ dọn riêng (không khẩn cấp,
   peer thừa không gây hại chức năng, nhưng là rác dữ liệu).
3. **Chưa đo độ trễ đăng ký**: mỗi lần đăng ký nay SSH thêm 1 lần sang node-2 (`provisionEverywhere` mirror
   mọi node). Lỗi node mirror **không** làm hỏng đăng ký (chỉ ném khi **node chính** lỗi — đã đọc
   `control-plane/src/peer-mirror.js`), nhưng nếu node-2 chậm thì mọi đăng ký chậm theo.
4. Chưa `wg-quick down/up` thử lại sau reboot node-2 (chỉ mới `enable`).
5. `endpoint` của `vietnam-3` vẫn là `103.6.235.39:443` — **đúng** cho cả UDP trực tiếp (WireGuard 443)
   lẫn qua relay.

## 7. ⚠️ SỰ CỐ BẢO MẬT — tôi làm lộ secret, cần chủ dự án quyết

Khi tìm `AUTH_TOKEN` cho lệnh PATCH admin, tôi chạy `systemctl cat flowvpn-cp` và **chỉ lọc mỗi
`AUTH_TOKEN`**; phần `Environment=` còn lại **đã in ra màn hình phiên làm việc** (gồm token Cloudflare,
khoá Sepay, khoá Resend, `NODE_SELF_SECRET` và vài biến cấu hình khác).

- **Đã làm đúng theo AGENTS §1:** **KHÔNG** copy các giá trị đó vào bất kỳ file/doc/log/báo cáo nào
  (báo cáo này cố ý không chép lại).
- **Nhưng chúng đã nằm trong lịch sử hội thoại của phiên** ⇒ coi như đã lộ khỏi kênh an toàn.
- **Đề xuất:** luân chuyển (rotate) các khoá đó — Cloudflare API token, Sepay key/secret, Resend API key,
  `NODE_SELF_SECRET` — và từ nay khi cần đọc env thì chỉ trích đúng biến
  (`systemctl show <svc> -p Environment --value | tr ' ' '\n' | sed -n 's/^TÊN=//p'`), **không bao giờ in cả khối**.

---

## 8. NGHIỆM THU TỪ TRUNG QUỐC TRÊN MÁY THẬT (30/09/2026 ~23:42–23:50) — ✅ ĐẠT

Mở được đúng vantage TQ (điều kiện "xong" §7 của `AGENT_NEW_NODE_GUIDE.md` mà phiên trước còn thiếu).

**Thiết bị:** Samsung **SM-F9460** (Galaxy Z Fold5), Android **16**, SIM **China Unicom (MCC/MNC 46001)**, 5G NR_SA.
Egress khi VPN tắt: **`120.234.32.53`** (đúng IP đã kéo 43,6 MB qua `vn3hy`).
App: `com.privatevpn.app.dev` `1.4.3-dev` (versionCode 32). Đường vào máy: **adb wireless** `10.0.3.165:38855`.

> ⚠️ adb đi **qua Wi-Fi**, nên quy trình cũ `svc wifi disable; svc data enable` sẽ **tự cắt adb** —
> giữ nguyên Wi-Fi. (Wi-Fi ở đây cũng là mạng TQ: gw `10.0.3.254`, DNS `202.96.134.133`.)

### 8.1 Kết nối lần đầu — ĐẠT

```text
chon-duong: truc-tiep=khong-mo-duoc cau-WS=chua-biet -> uu tien CAU WS
ws-relay: node 103.6.235.39 -> relay wss://api.meetflowai.site/relay/vn3hy (control plane cấp)
ws-relay: connected
hysteria: UP via UDP 127.0.0.1:38296 tun=165
tunnel: UP (hy-udp:38296)
probe: THROUGH TUNNEL http 1.1.1.1:80 ok=HTTP/1.1 301 Moved Permanently in 668ms
probe: THROUGH TUNNEL dns 1.1.1.1:53 answers=2 ip=104.20.23.154 in 192ms
bw: sample ... loss=0%
```

- Egress qua tunnel: **`103.6.235.39`** (đúng node-2, đo 2 lần) · `google=302` (1,43 s) · `claude=403`
  (challenge Cloudflare với `curl` — **không phải** bị chặn; xem bài học §3.1 của handoff trước).
- Phía máy chủ khớp đúng: relay `#10 MỞ từ 120.234.32.53 local_udp=28904 -> 103.6.235.39:8443`
  ↔ node-2 `client connected {"addr":"165.101.114.162:28904"}`.

### 8.2 Ngắt → nối lại 3 lần (tiêu chí §7 DoD) — ĐẠT 3/3

| Vòng | `ws-relay` | `hysteria: UP via UDP` | tun fd | IP ra |
|---|---|---|---|---|
| 1 | connected | `127.0.0.1:59256` | 178 | `103.6.235.39` |
| 2 | connected | `127.0.0.1:53868` | 186 | `103.6.235.39` |
| 3 | connected | `127.0.0.1:56184` | 199 | `103.6.235.39` |

Cổng local và fd **đổi mới mỗi vòng** ⇒ dọn dẹp sạch. **0 lần** `hysteria client already running`,
**0** `hysteria failed`. Sau đó phiên vòng 3 chạy **liên tục > 7 phút** (còn sống lúc chụp màn hình).

### 8.3 Giao diện xác nhận

`Server = Hanoi, Vietnam · Vietnam 3` · `State = Connected` · **`Path in use = Cau WS`** · `Location = Hanoi, VN`.
⇒ Đường đang dùng là **cầu WebSocket qua Cloudflare**; `truc-tiep=khong-mo-duoc` đúng như dự đoán
(dải `103.6.235.0/23` / AS152992 bị chặn UDP/UDP-hỏng từ TQ).

### 8.4 Phát hiện thêm trong lúc nghiệm thu: **thiếu TCP relay trực tiếp**

- App Android (`Config.kt:149,158,161`) có đường lùi **TCP relay trực tiếp tới node đang chọn**
  (`probeTcpRelayMs()` → `<runHost hoặc HY_TCP_RELAY_HOST>:HY_TCP_RELAY_PORTS[0]`), có **chốt chống GFW
  giả bắt tay**: bắt tay **2–4 ms** tới node Việt Nam bị coi là bất khả thi ⇒ báo "không mở được"
  (đúng như log `reachable=true in 3ms` bị từ chối, không phải app tin nhầm).
- node-2 **không có TCP listener nào** ⇒ đường này không tồn tại cho `vietnam-3`.
- **Chẩn đoán chính xác nguyên nhân timeout** (đừng đoán là GFW):

  | Cổng node-2 | ufw | Kết quả từ relay-server |
  |---|---|---|
  | 443/tcp | ALLOW | **REFUSED 0,00 s** (tới được máy, không ai nghe) |
  | 8443/tcp | ALLOW | **REFUSED 0,00 s** |
  | 9444/tcp | *không mở* | **TIMEOUT 6,01 s** ⇒ **ufw DROP**, KHÔNG phải GFW |

  ⇒ Gói tin **tới được** node-2; timeout chỉ là `ufw`. Đường TCP relay trực tiếp từ TQ **khả thi**.

- **Đã bổ sung:** copy `tools/node-setup/bin/hyrelay-linux-amd64` (sha256 khớp repo `ab328e01…`) →
  `/usr/local/bin/hyrelay` trên node-2, cài `hyrelay@.service`, bật `hyrelay@8443`
  (`-listen :8443 -target 127.0.0.1:8443`) ⇒ **active/enabled**, TCP 8443 nối được từ ngoài.
  `ufw` **không cần đổi** (8443/tcp đã mở sẵn).
- **CHƯA chứng kiến app ramp sang đường trực tiếp**: `Path in use` vẫn là `Cau WS`; hyrelay chưa ghi nhận
  kết nối nào. Việc ramp là quyết định lúc chạy của app, có thể mất thêm thời gian hoặc bị chốt
  `plausibleDirectMs` chặn. Cần một phiên ngắt/nối sạch nữa để kết luận.

### 8.5 Đính chính một kết luận SAI của tôi lúc đầu phiên

Tôi từng đọc `curl --interface en0` trả `000` rồi kết luận "đường vật lý hỏng". **SAI** — máy Mac này
đang ở **trong mạng TQ** (Wi-Fi gw `10.0.3.254`, DNS `202.96.134.133`), nên đi thẳng thì Google bị chặn.
Điều đó cũng có nghĩa: **máy Mac và điện thoại cùng một mạng TQ**, và mọi phép đo phía trên là đo TQ thật.

### 8.6 Việc còn lại sau nghiệm thu

1. **Chưa xác nhận app ramp được sang TCP relay trực tiếp** (mục 8.4) — cần ngắt/nối sạch lần nữa.
2. node-2 hiện **chưa** chạy `hyrelay@9445` và **chưa** mở 28443/54443 UDP (phiên trước cố ý bỏ). Node-1
   cũng **không** có TCP 8443 ⇒ hiện `vietnam-3` là node **đầu tiên** có TCP relay hysteria hoạt động.
3. Peer WG của khách: cần máy khách (macOS/Windows/iOS) **chọn lại Vietnam 3** để `provisionEverywhere`
   cấp peer trên node-2 (mục 5).

---

## 9. Xử lý 3 phát hiện còn treo — harness Mac (30/09/2026 ~23:40)

### 9.1 "Rác peer" trên `wg0` relay-server — ❌ KHÔNG PHẢI RÁC (đính chính)

- Ban đầu tôi tưởng là rác: `wg0` relay-server có **75 peer** mà `wg0.conf` có **0 `[Peer]`**, và trong đó
  **2 peer thuộc device `vietnam-3`** (`ynIHHp4…`, `DMhXggy…`) — nên tôi **đã xoá 2 peer đó** (75 → 73).
- **Kiểm lại: peer quay về đủ 75.** Tra `control-plane/src/peer-mirror.js`: hàm `provisionEverywhere()`
  **mirror peer sang MỌI node đang bật** — đó là **THIẾT KẾ**, ghi rõ lý do *"để node nào khách chọn cũng
  handshake được"* (bài học 15/09: node thiếu SSH key ⇒ peer không được tạo ⇒ khách "Connected" mà mất mạng).
- ⇒ **2 peer đó KHÔNG phải rác**, chúng hợp lệ và hệ thống tự thêm lại. **Đính chính: việc xoá của tôi là
  sai hướng** — trạng thái đúng là **75 peer**, không cần dọn gì.
- **Điểm duy nhất còn thật:** **63 peer của device đã bị xoá khỏi `devices.json`** không được thu hồi.
  Nhưng `wg0.conf` có **0 `[Peer]`** ⇒ chúng chỉ tồn tại ở runtime và **mất khi reboot**. Muốn sạch lâu dài
  cần một nhịp **thu hồi (revoke)** cho device đã xoá — việc **thiết kế**, không phải sự cố vận hành.

### 9.2 App ramp sang TCP relay trực tiếp — ✅ ĐÓNG (nghiệm thu thật 01/10/2026 ~00:45)

Máy thật: Samsung **SM-F9460** (Galaxy Z Fold5, Android 16), app **`com.privatevpn.app.dev`**, Wi-Fi văn phòng
TQ (`10.0.3.165`, gw `10.0.3.254`). Node chọn sẵn: **Vietnam 3**. Kết nối qua `adb` wireless.

```text
00:44:59.430 E/VPNFLOW_DEBUG: hysteria: UP via TCP relay 8443 tun=167
00:44:59.431 I/VPNFLOW_DIAG : tunnel: UP (hy-tcp:8443)
00:45:10.340 probe#1 transport=hy-tcp:8443 tunnelUp=true
00:45:25.727 probe#2 transport=hy-tcp:8443
00:45:41.125 probe#3 transport=hy-tcp:8443      ← giữ nguyên qua nhiều nhịp
00:45:10.597 probe: THROUGH TUNNEL http 1.1.1.1:80 ok=HTTP/1.1 301 in 244ms
00:45:10.717 probe: THROUGH TUNNEL dns 1.1.1.1:53 answers=2 in 118ms
00:45:02.423 bw: probe 4000000B/1159ms -> 27610kbps qua tunnel
```

 Đối chiếu hạ tầng **cùng lúc**:

```text
IP công cộng của điện thoại qua tunnel = 103.6.235.39        ← đúng node-2 mới (vietnam-3)
node-2 : ESTAB [::ffff:103.6.235.39]:8443 [::ffff:120.234.32.53]:48115 users:(("hyrelay",pid=730))
node-1 : 0 kết nối TCP 8443 (không có TCP relay)
```

⇒ **Đường TCP relay trực tiếp chạy thật end-to-end**: điện thoại (TQ, qua NAT văn phòng `120.234.32.53`) →
TCP `103.6.235.39:8443` (**hyrelay**) → hysteria → internet, **egress đúng `103.6.235.39`**, **27,6 Mbps** qua tunnel.

Ghi chú trung thực: watcher tôi tự dựng trên node-2 (`/tmp/tcp8443-watch.log`) báo `tcp8443_est=0` là **SAI** —
`ss -tn state established` + `awk` của tôi không khớp định dạng; `ss -tnp | grep :8443` mới thấy kết nối.
Bằng chứng dùng là **`ss -tnp` + IP công cộng**, không dùng watcher đó.

### 9.3 `9445`/`28443`/`54443` → KHÔNG mở; nhưng phát hiện **`9444`** mới là cổng client thật sự thử

- **`9445` / `28443` / `54443`: không mã client nào dùng.** `HY_TCP_RELAY_PORTS = intArrayOf(8443)`;
  `android/` không nhắc `9445`/`28443`/`54443`; `iOS/` chỉ nhắc trong comment. Direct UDP **tắt mặc định**
  (`enableDirectCandidate = false`). ⇒ mở thêm là **tăng bề mặt tấn công vô ích**. **Quyết định: không mở.**
- 🔎 **Nhưng `9444` thì client CÓ thử** — đây là **relay TCP cho WireGuard** (TCP 9444 → UDP 443):
  `android/…/Config.kt:149 RELAY_PORT = 9444`, `android/…/WGRelay.kt:29`,
  `iOS/…/WireGuardConfig.swift:125 withRelay(ports: [9444, 8443])`, `iOS/…/WGRelayClient.swift:34 ports = [9444]`.
  Log máy thật cho thấy app **thật sự probe**: `probe: relay 103.6.235.39:9444 reachable=true in 5ms` (mỗi nhịp).
- **node-2 mới KHÔNG có `9444`** ⇒ nhánh **WireGuard-qua-TCP-trực-tiếp chưa có** cho `vietnam-3`.
  (Khách WG vẫn đi được qua relay CF `vn3wg` — đã dựng, `=426`.)
- ⚠️ **Đừng "mở 8443 cho WG":** trên node-2, **`8443/tcp` đã là `hyrelay` → UDP 8443 (hysteria)**. `iOS` thử
  `[9444, 8443]` ⇒ nhịp thứ hai sẽ hạ cánh vào **relay hysteria**, **sai đích**. Muốn có relay WG trực tiếp thì
  phải dựng **`wgrelay` TCP `9444` → UDP `443`** (không phải mở 8443).
- **Quyết định:** **chưa mở 9444** — đây là *đường lùi* (WG đã có relay CF `vn3wg` chạy tốt). Muốn thêm thì nói,
  khoảng 3 phút (`wgrelay` + `ufw allow 9444/tcp`).

### 9.4 Phán quyết SA (chủ dự án giao quyết) — ĐÃ MỞ `9444`, và lộ ra bất đối xứng lớn hơn ở node-1

**Câu hỏi:** `vietnam-3` có cần relay TCP cho WireGuard (`9444`, TCP → UDP 443) không?

**Đối chiếu toàn fleet (đo 01/10/2026 ~00:48):**

| Node | `8443/tcp` (relay **hysteria**) | `9444/tcp` (relay **WireGuard**) | `9445/tcp` |
|---|---|---|---|
| node-1 (chính) | ❌ *(chỉ `tailscaled` trên IP tailnet)* | ✅ `wgrelay.service` | ❌ |
| relay-server (vietnam-2) | ✅ | ✅ | ✅ |
| **vietnam-3** | ✅ `hyrelay` | ❌ → **nay ✅** | ❌ |

**Phán quyết: CẦN.** Ba lý do:

1. **2/3 node đã có `9444`** ⇒ đây là **chuẩn fleet**, thiếu là **bất đối xứng** — đúng loại lỗi dự án đã dính
   nhiều lần (node mới hành xử khác fleet: `ignoreClientBandwidth`; và vụ thiếu WireGuard ⇒ "Connected nhưng
   mất sạch mạng").
2. **Thiếu `9444` thì nhịp kế tiếp của client hạ cánh SAI DỊCH.** `iOS WGRelayClient` thử `[9444, 8443]`; trên
   vietnam-3, `8443/tcp` **là relay hysteria → UDP 8443**, KHÔNG phải relay cho WG ⇒ nhịp thứ hai của client WG
   sẽ nối vào **sai dịch vụ**. Đúng loại "sai đích im lặng" mà tài liệu coi là nguy hiểm nhất.
3. Chi phí ~0, thuần thêm, không ảnh hưởng khách.

**Đã triển khai (không restart gì):** `hyrelay@9444` với `HYRELAY_TARGET=127.0.0.1:443`, dùng **chính binary
`hyrelay`** (`relay.go` ghi rõ *"Same protocol as the original wgrelay.js"*) + `ufw allow 9444/tcp`.

```text
hyrelay@9444 = active/enabled · LISTEN *:9444 · wg-quick@wg0 vẫn active
Chứng minh forward: 127.0.0.1.47536 > 127.0.0.1.443: UDP, length 21   (đúng payload 21 B)
Từ relay-server: nc -z 103.6.235.39 9444 → succeeded
node-watch lớp 3 nay kiểm 4 unit: hysteria@8443 hyrelay@8443 hyrelay@9444 wg-quick@wg0 (đều active)
```

**⚠️ Việc LỚN HƠN mà phán quyết này phát hiện — `node-1` KHÔNG có relay hysteria `8443`:**
`HY_TCP_RELAY_HOST` mặc định = `103.173.155.50`, và app thử `node:8443` như **nhịp TCP trực tiếp đầu tiên**;
trên **node-1 (node đông khách nhất)** cổng đó **không có gì** (chỉ `tailscaled` trên IP tailnet) ⇒ mọi lần thử
đường trực tiếp tới node-1 **thất bại im lặng**. Đây là **bất đối xứng lớn hơn** việc thiếu `9444` ở vietnam-3.
Đề xuất: dựng `hyrelay` TCP `8443` → UDP `8443` trên node-1 (cùng cách đã làm ở vietnam-3).
**Chưa làm** vì node-1 nằm ngoài phạm vi `claim` của phiên này — cần chủ dự án giao.

### 9.5 node-1 — ĐÃ BỔ SUNG relay hysteria `8443` (chủ dự án giao, 01/10/2026 ~00:52)

**Bất đối xứng đã đóng.** Trước đây `node-1` **không có** listener TCP `8443`, mà `HY_TCP_RELAY_HOST` mặc định
= `103.173.155.50` và app thử `node:8443` như **nhịp TCP trực tiếp ĐẦU TIÊN** ⇒ mọi nhịp thử tới node-1
**thất bại im lặng**.

**Đã làm (thuần thêm, không restart gì):**
- Copy binary `hyrelay` từ node-2 (sha256 `ab328e01…`, **khớp `tools/node-setup/bin/hyrelay-linux-amd64`**).
- Cài `hyrelay@.service` + drop-in `hyrelay@8443`.
- ⚠️ **Vấp thật:** bind `:8443` **thất bại** — `tailscaled` trên node-1 đã giữ `100.76.147.111:8443` và
  `[fd7a:…]:8443` ⇒ `listen tcp :8443: bind: address already in use`. **Sửa:** bind **đúng IP công cộng**
  `-listen 103.173.155.50:8443` ⇒ `active`. **KHÔNG đụng `tailscaled`** (đó là đường cứu hộ break-glass).
- `ufw` trên node-1 **inactive**, `iptables -P INPUT ACCEPT` ⇒ **không cần rule**.

```text
hyrelay@8443 = active/enabled · LISTEN 103.173.155.50:8443 (tailscaled giữ nguyên)
Chứng minh forward: 127.0.0.1.17242 > 127.0.0.1.8443: UDP, length 22
Từ relay-server: nc -z 103.173.155.50 8443 → succeeded
Nghiệm thu MÁY THẬT (điện thoại, chọn node-1):
    IP công cộng qua tunnel = 103.173.155.50
    E/VPNFLOW_DEBUG(31013): hysteria: UP via TCP relay 8443 tun=158
    node-1: ESTAB 103.173.155.50:8443 120.234.32.53:46627 users:(("hyrelay",pid=1284983))
Khách không hồi quy: 6/6 relay = 426 · node-1 hysteria + wgrelay vẫn active
node-watch lớp 3 nay kiểm 2 node (node-2 mới: 4 unit · node-1: hysteria/hyrelay@8443/wgrelay) — đều active
```

---

## 10. ⚠️ `vietnam-3` KHÔNG dùng được cho GEMINI — Google định vị IP là HỒNG KÔNG (01/10/2026)

**Triệu chứng khách báo:** qua `Flow3` (vietnam-3) mở Gemini ⇒ *"Gemini isn't currently supported in your
country. Stay tuned!"*

### Bằng chứng A/B — CÙNG một điện thoại, CÙNG tài khoản, chỉ đổi node

| Node | Egress đo được | Chrome `gemini.google.com` |
|---|---|---|
| **Flow3** = `vietnam-3` (node-2 mới) | `103.6.235.39` | 🔴 *"Gemini isn't currently supported in your country. Stay tuned!"* |
| **Flow1** = `node-1` | `103.173.155.50` | ✅ **Vào được** — hiện model **"Pro Extended"** + ô **"Ask Gemini"** |

Chạy trên Samsung SM-F9460 (Android 16) qua `adb`, đường `hysteria: UP via TCP relay 8443` (tức **cả 2 node
đều đi đường TCP relay trực tiếp** — tiện thể xác nhận relay `8443` của node-1 vừa dựng chạy thật).

### Nguyên nhân: **định vị địa lý theo IP**, KHÔNG phải chặn IP

```text
Google coi IP node-2 (103.6.235.39 · AS152992 Online Data):
   google.com -> https://www.google.com.hk/url?...&hl=zh-CN&pref=hkredirect&pval=yes   ← HỒNG KÔNG
Google coi IP node-1 (103.173.155.50 · AS135905 VNPT):
   google.com -> google.com (KHÔNG redirect)                                          ← VIỆT NAM
```

**Không bị gắn cờ, không CAPTCHA** (đo cùng lúc): Google Search `200` ~91 KB ở **cả hai** node; `gemini.google.com/app`
`200` ~847 KB ở **cả hai**; các trang `/faq`, `/advanced`, `one.google.com/about/plans` đều `200` ⇒ chốt chặn
**chỉ xuất hiện sau khi đăng nhập**, do vùng bị coi là không hỗ trợ.

### Kết luận & việc cần làm

- **Node không hỏng**: hysteria/TCP relay chạy đúng (`Path in use: Trực tiếp`, đo 27,6 Mbps). Chỉ **các dịch vụ
  phụ thuộc vùng của Google** (Gemini) là không dùng được qua IP này.
- **Đây đúng loại rủi ro repo đã cảnh báo**: `docs/AGENT_NEW_NODE_GUIDE.md` §2.2 khuyên **tránh AS152992 và dải
  `103.6.234.0/23`** — `103.6.235.39` nằm trong chính /23 đó.
- **Việc cần làm (chủ dự án, với nhà cung cấp):** xin **đổi IP/dải** mà Google định vị là **Việt Nam**, lý do nói
  thẳng: *"Google geolocates 103.6.235.39 as Hong Kong, so Gemini returns 'not available in your country'."*
  Hoặc chuyển sang dải **AS135905 (VNPT)** như §2.2 khuyên.
- **Cách test một IP trước khi mua/đổi** (phép thử 1 dòng, đã dùng ở đây):
  `curl -s -o /dev/null -w '%{redirect_url}' https://www.google.com/` ⇒ **không** được đá sang `google.com.hk`.
- **Khi có IP mới**, phải cập nhật: `exit_nodes.endpoint` của `vietnam-3` + `WS_UDP_HOST` trong `relay-cf-vn3hy`
  và `relay-cf-vn3wg` (relay trỏ thẳng IP node). **Không** phải làm lại cert (self-signed + client `insecure`),
  khách không phải cài lại.
- **Tạm thời:** khách cần Gemini thì chọn **Flow1/node-1**. Cân nhắc hạ `priority` của `vietnam-3` để khách ít bị
  rơi vào node này cho tới khi đổi được IP.

### 10b. KHÔNG chỉ node mới: **Flow2 (vietnam-2) cũng bị** — và nó là node ƯU TIÊN CAO NHẤT (01/10/2026)

Chủ dự án báo: khách gặp đúng lỗi đó ở **Flow2** sáng nay. Kiểm tra thì đúng:

```text
Flow2 (165.101.114.162 · AS135905 VNPT): google.com -> google.com.hk/?pref=hkredirect&hl=zh-CN   ← HỒNG KÔNG
Flow1 (103.173.155.50  · AS135905 VNPT): google.com -> google.com (không redirect)                ← VIỆT NAM
Flow3 (103.6.235.39    · AS152992)     : google.com -> google.com.hk/...                          ← HỒNG KÔNG
```

⚠️ Bảng `exit_nodes` trước đó: `vietnam-2 priority=50` (ưu tiên CAO NHẤT) · `node-1=100` · `vietnam-3=150`
⇒ **đa số khách rơi vào vietnam-2 — đúng node Gemini lỗi**. Đây là lỗi đang ảnh hưởng khách, không phải
chuyện riêng của node mới.

**Đã xử lý ngay (chủ dự án duyệt 01/10):** dồn khách sang node chạy được —
`node-1=10` · `vietnam-2=200` · `vietnam-3=300` (PATCH admin API; backup `data/nodes.db.bak-priority-*`).
`GET /v1/nodes` công khai nay trả **node-1 đứng đầu**.

**Mức độ — chủ dự án chốt 01/10/2026: LOW PRIORITY** (chỉ một dịch vụ; không phải sự cố kết nối).

**Đối chiếu lại khi chủ dự án nói "Flow2 đã đổi IP rồi":** `exit_nodes` **vẫn** là
`vietnam-2 → 165.101.114.162`, và **egress thực tế của chính máy đó cũng là `165.101.114.162`** (khớp nhau);
test lại từ máy đó vẫn ra `google.com.hk`. ⇒ Nếu nhà cung cấp đã đổi IP thì **bản mới CHƯA được cấu hình vào hệ
thống**. Khi có IP mới phải cập nhật: `endpoint` của `vietnam-2` **và** `WS_UDP_HOST` trong `relay-cf-vn2hy`
+ `relay-cf-vn2wg` (relay trỏ thẳng IP node), rồi test lại bằng phép thử 1 dòng.

**Phạm vi ảnh hưởng — chủ dự án xác nhận 01/10/2026: CHỈ Gemini.** YouTube, Claude, OpenAI và các AI khác
vẫn **bình thường** qua Flow2/Flow3. Nghĩa là geo sai của Google chỉ chặn **đúng dịch vụ có cổng kiểm tra vùng
của Google (Gemini)** — không phải chặn internet nói chung, và không phải Google Search/YouTube.
⇒ Vì chỉ một dịch vụ bị, việc **đổi IP không còn gấp**; ưu tiên đã dồn về node-1 (nơi Gemini chạy) là đủ trong
lúc chờ nhà cung cấp đổi IP.

### 10c. Có sửa được định vị của Google không? — **KHÔNG có kênh công khai**

| Nguồn định vị | Flow2 | Flow3 | Flow1 |
|---|---|---|---|
| ipinfo.io | VN (Hanoi) | VN (Hanoi) | VN (Hanoi) |
| ip-api.com | Vietnam | Vietnam | Vietnam |
| Cloudflare `loc=` | **VN** | **VN** | **VN** |
| **Google** | 🔴 **HK** | 🔴 **HK** | ✅ VN |

Mọi DB độc lập đều nói **Việt Nam**; chỉ Google nói Hồng Kông ⇒ **là DB riêng của Google bị sai/cũ cho 2 dải
này**, không phải vấn đề dữ liệu địa lý chung.
- ❌ Sửa qua [MaxMind GeoIP correction](https://www.maxmind.com/en/geoip-location-correction) **không giải quyết**
  (các DB khác đã đúng VN mà Google vẫn HK).
- ❌ Google không có kênh công khai để sửa định vị cho một IP không thuộc site mình
  ([thread người dùng](https://support.google.com/websearch/thread/284908825/ip-location-incorrect-when-using-google?hl=en)
  chỉ dành cho người dùng cuối; Search Console geo-targeting là cho **tên miền**, không cho IP).
- ✅ **Đường thực tế duy nhất: đổi IP/dải.** Trước khi nhận IP mới, test 1 dòng:
  `curl -s -o /dev/null -w '%{redirect_url}' https://www.google.com/` ⇒ **phải rỗng** (không được ra `google.com.hk`).
- Ghi chú: 2 dải bị lỗi có dấu hiệu được cấp phát lại (ip-api mô tả chủ thể khác: *"Dương Nội AI Application
  Software"*, *"CAS Security Services"*) ⇒ Google có thể còn giữ dữ liệu phân bổ **cũ** (HK) cho các dải này.

### 10d. 🔴 ĐÍNH CHÍNH — nguyên nhân THẬT là **COOKIES**, không phải node (chủ dự án xác định 01/10/2026)

**Chủ dự án kết luận: lỗi *"Gemini isn't currently supported in your country"* là do COOKIES**, không phải do IP node.
⇒ **Kết luận ở §10/§10b của tôi (quy cho node) là SAI HƯỚNG** — ghi lại đây để không ai dùng nó để đổi IP/đổi node.

**Bằng chứng cũ vẫn đúng, nhưng KHÔNG phải thứ chặn Gemini** (giữ lại để tham chiếu):
- Google **vẫn** định vị `165.101.114.162` (Flow2) và `103.6.235.39` (Flow3) là **Hồng Kông**
  (`google.com` → `google.com.hk`), còn `103.173.155.50` (Flow1) là Việt Nam — **số đo lặp lại được**.
- Nhưng cổng kiểm tra vùng của Gemini đọc **cookie** (vùng đã lưu từ phiên trước) ⇒ máy đã có cookie
  "vùng không hỗ trợ" thì **vẫn lỗi dù đang ở node nào**, và **xoá cookie là vào được** ngay trên cả Flow2/Flow3.
- Vì vậy phép A/B ở §10 (Flow3 lỗi ↔ Flow1 được) chỉ là **trùng hợp có điều kiện**, **không** chứng minh
  quan hệ nhân quả node → lỗi. (Bài học: một phép A/B chỉ chắc khi **chỉ đổi đúng một biến** — ở đây cookie
  không được kiểm soát.)

**Hệ quả / việc cần làm:**
1. **Việc dồn khách sang node-1 (đổi `priority` 01/10) là KHÔNG cần thiết** cho lỗi này ⇒ em đã đề xuất trả
   `priority` về như cũ (`vietnam-2=50`, `node-1=100`, `vietnam-3=150`). **Chủ dự án quyết GIỮ NGUYÊN `node-1=10`
   — xem §10f** (từ nay là quyết định có chủ đích, không phải biện pháp cho Gemini).
2. **Không** cần đổi IP node vì lý do Gemini. (Thông tin Google định vị 2 IP là HK **vẫn đáng ghi** cho các
   dịch vụ Google khác phụ thuộc vùng — nhưng **chưa quan sát thấy** dịch vụ nào bị; YouTube/Claude/OpenAI
   đều bình thường.)
3. Khách gặp lỗi ⇒ hướng dẫn **xoá cookie cho `google.com`** (hoặc dùng cửa sổ ẩn danh) — **không cần đổi node,
   không cần đổi IP.**

### 10e. ✅ XÁC NHẬN BẰNG THỰC NGHIỆM CÓ ĐỐI CHỨNG — ẩn danh thì vào được (chủ dự án, 01/10/2026)

**Chủ dự án báo (em chưa tự đo lại): "anh dùng browser ẩn danh thì được"** — cùng máy, cùng node, chỉ khác
**có / không có cookie của `google.com`**:

| Điều kiện | Cookie `google.com` | Kết quả Gemini |
|---|---|---|
| Cửa sổ thường | **có** (giữ vùng "không hỗ trợ" lưu từ phiên trước) | ❌ *"Gemini isn't currently supported in your country"* |
| Cửa sổ **ẩn danh** | **không** (jar rỗng) | ✅ vào được |

⇒ Đây là phép so sánh **chỉ đổi đúng MỘT biến (cookie) trên cùng một node** ⇒ **nhân quả thuộc về cookie**.
Ngược lại, phép A/B ở §10 (Flow3 lỗi ↔ Flow1 được) **đổi node nhưng KHÔNG kiểm soát cookie** ⇒ không có giá trị
nhân quả, đúng như đính chính §10d. **Kết luận §10/§10b (quy cho IP/node) chính thức bị bác bỏ — không dùng nữa.**

**Hệ quả (chốt):**
1. **Không** đổi IP node, **không** đổi node vì lý do Gemini. Việc Google định vị `165.101.114.162` /
   `103.6.235.39` là HK **vẫn đúng như số đo**, nhưng **không phải thứ chặn Gemini** — giữ làm ghi chú tham khảo.
2. Việc dồn `priority` sang node-1 (01/10) là **thừa** ⇒ xem quyết định ở §10f.
3. **Hỗ trợ khách (1 bước, không cần cấu hình):** xoá cookie của `google.com` (hoặc mở cửa sổ ẩn danh) là vào được
   — **không** cần đổi node, **không** cần đổi IP, **không** cần cài lại app.

### 10f. CHỐT `priority` — **GIỮ node-1 đứng đầu** (chủ dự án quyết 01/10/2026)

**Hiện trạng đo lại 01/10/2026** (`/root/flowvpn-cp/data/nodes.db`, đọc trực tiếp):
`node-1 = 10` · `vietnam-2 = 200` · `vietnam-3 = 300` ⇒ `GET /v1/nodes` trả **Flow1 → Flow2 → Flow3**
(đã kiểm: `curl -s .../v1/nodes` ra đúng thứ tự này). Backup còn nguyên:
`/root/flowvpn-cp/data/nodes.db.bak-priority-20261001-005043`.

**Đề xuất của em:** trả về gốc `vietnam-2=50 · node-1=100 · vietnam-3=150` (đúng thiết kế 13/09/2026,
`docs/HANDOVER_2026-09-13_china_ip_block_and_funnel.md:82`) vì lý do dồn khách (lỗi Gemini) đã bị bác bỏ.
**Chủ dự án chọn: GIỮ NGUYÊN `node-1=10` đứng đầu** ⇒ **không đổi dữ liệu, không cần rollback.**

**Lý do ghi lại (để agent sau KHÔNG "sửa lại cho đúng"):** Google định vị `103.173.155.50` (Flow1) = **VN**,
còn `165.101.114.162` (Flow2) và `103.6.235.39` (Flow3) = **HK** (§10c, số đo lặp lại được). Gemini thì đã
chứng minh là do **cookie** (§10e), nhưng giữ Flow1 làm mặc định là **phòng** cho các dịch vụ Google khác còn
phụ thuộc vùng. ⇒ **Từ 01/10/2026 đây là quyết định CÓ CHỦ ĐÍCH, không còn là "biện pháp cho lỗi Gemini".**

**Tác động kỹ thuật đã xác minh (dùng được về sau):**
- `priority` là khoá sắp xếp của `GET /v1/nodes`: **health trước** (node vừa fail tụt xuống), rồi `priority`,
  rồi tên — `control-plane/src/index.js:480`; nguồn: `control-plane/src/node-store.js:111`.
- Client **tự chọn node ĐẦU TIÊN** khi máy **chưa có lựa chọn lưu sẵn**:
  `android/.../vpn/VPNManager.kt:135` (`selectNode(nodes.first().id)`) và `:447` (`nodes.first()`).
  ⇒ `priority` = **node mặc định cho máy mới**, **đổi live được, KHÔNG cần phát hành app**; máy đã chọn node
  thì **giữ nguyên** (không bị đổi khi priority thay đổi) — đây là lý do thao tác này an toàn.
- **Hệ quả cho mục tiêu "thêm node mới":** muốn khách mới vào thẳng Flow3 chỉ cần hạ `priority` của
  `vietnam-3` xuống thấp nhất — **không cần build/phát hành app**.

## 11. FPT PLAY TRÊN FLOW3 — điều tra 01/10/2026 (**CHƯA tái hiện được lỗi, chưa chốt nguyên nhân**)

**Chủ dự án báo:** node Flow3 (`103.6.235.39`) không vào được FPT Play; nghi IP bị nhận sai là Hong Kong.

### 11a. Số đo thật — **chỉ Google nói HK**

| Nguồn định vị | Flow1 `103.173.155.50` | Flow3 `103.6.235.39` |
|---|---|---|
| ipinfo.io | VN (Hanoi) | VN (Hanoi) |
| ip-api.com | VN · AS135905 · hosting=false | VN · AS152992/BAOVECAS · hosting=false · proxy=false |
| ipwho.is | VN | VN |
| ipapi.is | VN | VN (HASAKI VIETNAM SECURITY SERVICES) |
| iplocation.net | — | Viet Nam |
| db-ip.com | — | VN |
| Cloudflare `loc=` | **VN** (`colo=HKG`) | **VN** (`colo=HKG`) |
| **Google** (`google.com` redirect) | **rỗng ⇒ VN** ✅ | 🔴 **`google.com.hk` ⇒ HK** |
| `fptplay.vn/` | http=200 · **59049 byte** | http=200 · **59049 byte** (giống hệt) |

⇒ "Bị nhận sai là Hong Kong" **chỉ đúng với DB của Google**; **6 DB độc lập + Cloudflare đều nói VN**.
⚠️ `colo=HKG` **không phải** định vị quốc gia — **Flow1 cũng `colo=HKG`** mà Google vẫn VN; đừng dùng nó làm bằng chứng.
⚠️ `ipinfo` trả `timezone=Asia/Bangkok` cho **cả hai** node ⇒ trường này vô dụng để phân biệt.

### 11b. **Chưa tái hiện được lỗi** — không được kết luận vội

Trang chủ `fptplay.vn` trả **giống hệt nhau** (200 / 59049 byte) từ Flow1 và Flow3 ⇒ cổng chặn (nếu có) nằm ở tầng
**API/DRM**, chưa xác định. 6 đường API đoán (`api.fptplay.net/api/v6.0|v7.3_v2/...`, `fptplay.vn/api/geo`, …) đều **404**.
⇒ Từ phía server **không chứng minh được** FPT Play chặn vì IP.
- `docs/EXIT_NODE_IP_GUIDE.md` §36 đã ghi đúng: phải test **bằng account thật** (FPT Play chống VPN/datacenter);
  §15 (test bằng "trang chủ trả 200") là **test YẾU — nay đã chứng minh không phân biệt được gì**.
- **Phép thử quyết định còn thiếu:** FPT Play **bằng account thật** trên **Flow1 (đối chứng)** vs **Flow3**, cùng app /
  cùng account, **chỉ khác node**. Flow1 cũng lỗi ⇒ nguyên nhân **không** phải IP ⇒ đổi IP không giải quyết gì.

### 11c. Dải của Flow3 **vốn đã nằm trong danh sách TRÁNH**

`docs/EXIT_NODE_IP_GUIDE.md` §28–31: **AS152992 (Online Data)** đã bị **chặn UDP từ TQ ở mức IP**, và cảnh báo
`103.6.235.1` nằm cùng /23 với IP cũ của node-2 ⇒ *"nhiều khả năng dính y hệt"*. **Flow3 = `103.6.235.39` nằm đúng
trong `103.6.234.0/23`.** ⇒ Muốn đổi thì phải đổi sang **dải NGOÀI `103.6.234.0/23`** (ưu tiên AS135905/VNPT);
**IP mới trong cùng /23 sẽ dính y nguyên** ⇒ mất tiền vô ích. (Guide §38: test IP thật trước khi nhận.)

### 11d. Đổi IP Flow3 **KHÔNG cần phát hành app** ⇒ làm được trong lúc đóng băng

Đã kiểm trong code: **không chỗ nào** hardcode `103.6.235.39`; `ExitNodeFallback.builtIn`
(`android/app/src/main/java/com/privatevpn/app/api/Models.kt:52`) chỉ có **node-1 + vietnam-2**.
Touch-list đo thật trên relay-server **5 chỗ + DB**:
1. `/etc/systemd/system/relay-cf-vn3hy.service` → `WS_UDP_HOST`
2. `/etc/systemd/system/relay-cf-vn3wg.service` → `WS_UDP_HOST`
3. `/usr/local/bin/flowvpn-node-watch` (địa chỉ SSH/health của node-3)
4. `/usr/local/bin/flowvpn-safe-stop` (danh sách nhận diện đường điều khiển)
5. `nodes.db`: `exit_nodes.endpoint` **và** `ssh_target` của `vietnam-3`
6. Nhà cung cấp gán IP mới — **xin gán TĨNH, không DHCP**; node-side không phải đổi cổng
`Caddyfile` **không** chứa IP node-3 (relay định tuyến theo path `/relay/vn3hy*`) — đã grep xác nhận.

### 11e. Đổi IP Flow2 thì NGƯỢC LẠI — tốn kém **và buộc phát hành app**

- `165.101.114.162` **hardcode trong client**: `android/.../Config.kt:50` (`API_FALLBACK_ADDRESSES`),
  `android/.../api/Models.kt:63`, `iOS/.../ControlAPIClient.swift:79` ⇒ đổi IP mà không phát hành bản mới là
  **đường dự phòng khi GFW chặn API trỏ vào IP chết** (đúng ca mà fallback sinh ra để cứu).
- Flow2 = **relay-server** (Caddy + control-plane + 6 relay + DNS + cp-proxy) ⇒ phải chạy đủ **checklist 9 bước**
  (`EXIT_NODE_IP_GUIDE.md` §46).
- Flow2 **đang ở dải TỐT NHẤT** theo chính guide: AS135905 VNPT `165.101.114.0/23` = khuyến nghị #1, và IP này được
  **cố ý đổi sang** ngày 14/09/2026 để **thoát** AS152992 (`103.6.234.233`). Đổi nữa là **lùi**, không phải tiến.

### 11f. ✅ CHỐT BẰNG ĐỐI CHỨNG TRÊN iPad — **nguyên nhân là DẢI IP của Flow3** (chủ dự án, 01/10/2026)

**Chủ dự án đo trên CÙNG một iPad, CÙNG account FPT Play, CÙNG app — chỉ đổi node:**

| Node | IP | FPT Play trên iPad |
|---|---|---|
| **Flow2** (`vietnam-2`) | `165.101.114.162` (AS135905 VNPT) | ✅ **chạy tốt** |
| **Flow3** (`vietnam-3`) | `103.6.235.39` (AS152992) | 🔴 **"không support ở region đó"** |

⇒ Chỉ **một biến** thay đổi (node) ⇒ **nhân quả thuộc về IP/dải của Flow3**. Loại trừ: iPad, account FPT Play, app,
tài khoản Apple, và **rò IPv6** (nếu rò thì Flow2 cũng lỗi).
⇒ Mục §11b ("chưa tái hiện được") **nay đã được tái hiện và chốt** — người tái hiện là chủ dự án.

**Đối chiếu độc lập — 2 dịch vụ khác nhau cùng nói dải này ≠ VN:**
- **Google**: `103.6.235.39` → `google.com.hk` (HK), trong khi Flow1/Flow2 → VN. (§11a)
- **FPT Play**: chặn hẳn Flow3, cho qua Flow2. (bảng trên)
⇒ Không phải "chỉ Google sai": **dữ liệu phân bổ CŨ còn sót ở nhiều nơi** cho `103.6.234.0/23`. Đúng dải mà
`docs/EXIT_NODE_IP_GUIDE.md` §28–31 đã xếp **TRÁNH** (AS152992) — tức **cảnh báo cũ là ĐÚNG**, và việc mua/dựng
Flow3 trên dải này lẽ ra phải bị chặn bởi bài test trước khi mua (guide §32–38).

**⚠️ Bài học test (quan trọng, đã ghi vào guide):** test *"trang chủ `fptplay.vn` trả 200"* là **KHÔNG ĐỦ** —
Flow1 và Flow3 trả **giống hệt nhau 200 / 59049 byte**, kể cả khi một node bị FPT Play chặn hẳn. Cổng thật nằm ở
tầng API/DRM/player. **Cổng nghiệm thu thật = mở FPT Play bằng ACCOUNT THẬT trên thiết bị thật.**

**Hành động (đề xuất của SA):**
1. **Đổi IP Flow3** sang một IP **NGOÀI `103.6.234.0/23`** (ưu tiên dải kiểu AS135905/VNPT như Flow2). **IP mới
   trong cùng /23 chắc chắn dính y nguyên** ⇒ phải yêu cầu nhà cung cấp đổi **dải**, không chỉ đổi IP.
2. **GIỮ NGUYÊN Flow2** — vừa được chứng minh chạy tốt FPT Play; đổi Flow2 là **lùi** + buộc phát hành app (§11e).
3. Đổi IP Flow3 **không cần phát hành app** và **không phá đóng băng** (§11d — touch-list 5 chỗ + `nodes.db`).
4. **Cổng nghiệm thu TRƯỚC KHI NHẬN IP mới** (đủ cả 4 mới nhận):
   - `curl -s -o /dev/null -w '%{redirect_url}' https://www.google.com/` ⇒ **phải RỖNG**;
   - **FPT Play bằng account thật** chạy được (đây là cổng quyết định);
   - AbuseIPDB + Spamhaus **sạch**;
   - nhà cung cấp gán **TĨNH (static)**, không DHCP.
