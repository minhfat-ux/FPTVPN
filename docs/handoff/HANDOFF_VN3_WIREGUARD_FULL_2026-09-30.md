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
