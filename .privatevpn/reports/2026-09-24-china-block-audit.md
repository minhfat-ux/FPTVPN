# Audit: API / VPS / URL của VPNFlow có đang bị chặn không?

- **Ngày đo:** 2026-09-24 (~22:20–22:45 giờ Trung Quốc)
- **Người đo:** Solution Architect (DSH harness Mac)
- **Điểm đo:** **Quảng Châu, Quảng Đông, Trung Quốc** — `120.234.32.53`,
  **AS56040 China Mobile**. Đây là điểm nhìn sau GFW, đúng loại mạng khách bị chặn.
- **Trạng thái:** đã đo xong; **chưa sửa gì** — dưới đây là findings + đề xuất.

## 1. Kết luận nhanh

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Domain/API qua Cloudflare (`api`, `t1`, `home`, apex) | ✅ **KHÔNG bị chặn** | DNS + TCP + TLS(SNI) đều tốt |
| Tailscale Funnel `fcnvpn.tail303be3.ts.net` (443, 8443) | ✅ **KHÔNG bị chặn** | TCP + TLS verify OK |
| Đường relay WS qua Cloudflare (`/relay/vn1wg`, `vn2wg`, `vn1hy`, `vn2hy`) | ✅ **SỐNG** | `HTTP/1.1 101 Switching Protocols` |
| Đường relay WS qua Funnel (`/vn2`, `:10000`, `:8443`) | ✅ **SỐNG** | `101` |
| **IP VPS node-1 `103.173.155.50`** | ❌ **BỊ CHẶN** | ICMP mất 100%; TCP 22/443/8443 **đều fail** |
| **IP VPS node-2 `165.101.114.162`** | ❌ **BỊ CHẶN** | ICMP mất 100%; TCP 22/443/8443 **đều fail** |
| Giám sát chặn phía Trung Quốc | ❌ **KHÔNG CÓ** | xem §4 |

**Tóm lại:** *domain và API không bị chặn; cả hai IP VPS bị chặn ở mức IP (mọi cổng).
Đường sống duy nhất từ Trung Quốc là các front qua CDN: Cloudflare và Tailscale Funnel.*

## 2. Bằng chứng đo

### 2.1 Domain / API — OK

```json
{"checkedAt":"2026-09-24T14:20:24Z","hosts":[
 {"host":"api.meetflowai.site","ip":"104.21.83.112","verdict":"OK"},
 {"host":"t1.meetflowai.site","ip":"172.67.175.138","verdict":"OK"},
 {"host":"home.meetflowai.site","ip":"172.67.175.138","verdict":"OK"},
 {"host":"meetflowai.site","ip":"104.21.83.112","verdict":"OK"},
 {"host":"fcnvpn.tail303be3.ts.net","ip":"103.84.155.153","verdict":"OK"}]}
```
(`scripts/gfw-check.sh --json`, exit 0)

### 2.2 IP VPS — bị chặn toàn bộ cổng (đo 2 lần, cách nhau vài phút)

```text
103.173.155.50   ping 4 packets transmitted, 0 received, 100.0% packet loss
  TCP 22 FAIL · TCP 443 FAIL · TCP 8443 FAIL   (và 9445/28443/54443 FAIL)
165.101.114.162  ping 4 packets transmitted, 0 received, 100.0% packet loss
  TCP 22 FAIL · TCP 443 FAIL · TCP 8443 FAIL
```

### 2.3 Đối chứng — chứng minh KHÔNG phải mạng Trung Quốc hỏng chung

```text
8.8.8.8:53        OK        140.82.113.4:443 (GitHub) OK      104.21.83.112:443 (Cloudflare) OK
IP Việt Nam KHÁC (không phải của mình):
  103.199.18.1    avg 115.288 ms
  203.113.131.1   avg  69.805 ms
  118.70.125.1    avg  61.633 ms
```

⇒ Trung Quốc → Việt Nam nói chung **tốt**. **Chỉ 2 IP của mình** không tới được ⇒ chặn **có mục tiêu
theo IP**, không phải lỗi định tuyến chung.

`traceroute` tới node-1 đi qua China Mobile rồi tới `113.171.31.242`/`113.171.33.195` (Việt Nam)
rồi tắt ở hop 15–18. Tức gói **ra khỏi Trung Quốc được**, nhưng không có đường tới đích —
khớp với việc IP đích bị chặn chứ không phải bị chặn ngay tại biên Trung Quốc.

### 2.4 Đường relay — sống, nhưng chỉ có MỘT hostname trên Cloudflare

```text
https://api.meetflowai.site/relay/vn1wg   -> 101 Switching Protocols (Server: cloudflare)
https://api.meetflowai.site/relay/vn2wg   -> 101
https://api.meetflowai.site/relay/vn1hy   -> 101
https://api.meetflowai.site/relay/vn2hy   -> 101
https://t1.meetflowai.site/relay/vn1wg    -> 404      ← KHÔNG có relay
https://meetflowai.site/relay/vn1wg       -> 404      ← KHÔNG có relay

https://fcnvpn.tail303be3.ts.net/vn2      -> 101
https://fcnvpn.tail303be3.ts.net:10000/   -> 101
https://fcnvpn.tail303be3.ts.net:8443/    -> 101
```

⚠️ **Đây là điểm yếu lớn nhất hiện tại:** toàn bộ đường Cloudflare của khách Trung Quốc phụ thuộc
**một hostname duy nhất** `api.meetflowai.site`. Tiền lệ đã có: 15–16/09 GFW chặn **TLS theo SNI**
của `t1.meetflowai.site` dù IP vẫn là Cloudflare (`control-plane/data/gfw-history.json`).
Nếu SNI `api.meetflowai.site` bị chặn, khách Trung Quốc **mất toàn bộ đường dữ liệu Cloudflare**;
chỉ còn Funnel (đang là giá trị mặc định cứng trong client, không phải backend cấp).

### 2.5 Nhìn từ trong VPS (node-1 = `fcnvpn` = 103.173.155.50, vào qua Tailscale)

```text
từ node-1 tới node-2 (165.101.114.162): ping 0% loss, TCP 22/443/8443 OK   ⇒ node-2 SỐNG
dịch vụ node-1 đang chạy: caddy · hysteria (UDP 8443) · wgrelay (TCP 9444) ·
  wsrelay · wsrelay-hy · wsrelay-vn2 · wsrelay-vn2hy · wg-quick@wg0
cổng đang listen: 443 (caddy), 9444 (wgrelay), 8443 (tailscaled, tailnet)
ra Internet: google 200 · api.telegram.org 302 · x.com 200 · youtube 200 · ping 8.8.8.8 25ms
```

⇒ **VPS không chết.** node-1 và node-2 đều sống, cấu hình đầy đủ. Vấn đề **thuần tuý là
đường tới IP công khai từ Trung Quốc**.

### 2.6 Khách vẫn đang được phục vụ — nhưng qua relay

`journalctl -u hysteria` trên node-1: các phiên `client connected` đều đến từ
`127.0.0.1` (wsrelay nội bộ của node-1) hoặc `165.101.114.162` (node-2) — **không có phiên nào
đến trực tiếp từ IP khách**. Trong cửa sổ log còn giữ (từ 21/09 17:00):
633 phiên qua loopback, 423 phiên qua node-2.

⇒ Kiến trúc "China-mode đi qua WS relay" **đang gánh toàn bộ khách Trung Quốc** và vẫn chạy.

### 2.7 Lỗi đáng theo dõi trong log hysteria

Nhiều `dial tcp4 …: i/o timeout` / `timeout: no recent network activity` tới
Google/Telegram/X/Netflix. Nhưng đo trực tiếp **đường ra của node-1 tốt** (§2.5), nên đây là
**transient/suy hao trên chuỗi relay**, không phải đứt egress. Cần theo dõi, chưa kết luận.

## 3. Vì sao bị chặn mà không ai biết — lỗ hổng giám sát

1. `control-plane/src/gfw-watch.js` chạy **trên VPS (Việt Nam)**. Chính comment trong mã nguồn
   thừa nhận nó mù với chặn phía Trung Quốc: *"the GFW blocks node IPs for Chinese networks while
   the node still answers happily from Vietnam, so a check run from here sees nothing wrong"*.
2. `scripts/gfw-check.sh` **có sẵn nhưng không được lên lịch** ở đâu cả (không launchd, không cron;
   đã rà `~/Library/LaunchAgents` và repo).
3. `control-plane/data/gfw-history.json` **đứng từ 2026-09-16T17:03Z** — hơn 8 ngày không cập nhật.
4. Danh sách host được theo dõi cũng **không có IP của node** — chỉ có domain.

⇒ Một đợt chặn IP hoàn toàn (cả 2 node, mọi cổng) đã xảy ra **âm thầm**. Mốc thời gian: tài liệu
`docs/CHINA_TRANSPORT_ROADMAP.md` ghi 08–09/09 TCP từ Trung Quốc tới node **vẫn qua được**
("0.09–0.13 s connects"); hôm nay TCP chết hoàn toàn ⇒ **leo thang xảy ra trong khoảng 09/09 → 21/09**.
Không xác định được chính xác hơn vì log journal chỉ giữ từ 21/09 và không có bản ghi giám sát.

## 4. Tác động

- Khách Trung Quốc **vẫn dùng được** nếu client đi đúng đường relay ⇒ sự cố này **không phải
  outage toàn bộ**, nhưng toàn bộ khách Trung Quốc **phụ thuộc một hostname Cloudflare duy nhất**.
- Mọi phương án dự phòng "trực tiếp tới IP node" trong tài liệu (WireGuard UDP 443, hysteria UDP
  8443/28443/54443, TCP relay 9444) **đều vô hiệu từ Trung Quốc**. Client còn thử đường trực tiếp
  trước ⇒ **tốn thời gian chờ** mỗi lần kết nối.
- Build cũ / client không đi relay ⇒ **mất kết nối hoàn toàn**.
- `android/.../Config.kt` `API_FALLBACK_ADDRESSES = ["165.101.114.162","103.173.155.50"]` — ghim
  đúng 2 IP đã bị chặn ⇒ fallback API này hiện **vô dụng**.

## 5. Giải pháp đề xuất (xếp theo thứ tự nên làm)

### S1 — Giám sát từ điểm nhìn Trung Quốc (làm trước; rẻ, giá trị cao nhất)
Đây là thứ duy nhất ngăn sự cố lặp lại âm thầm.
- Chạy định kỳ (5–15 phút) một probe từ **máy trong Trung Quốc** (Mac này và/hoặc harness Windows),
  gồm 4 nhóm:
  1. SNI/TLS: `api`, `t1`, `home`, apex, `fcnvpn.tail303be3.ts.net` (đã có trong `gfw-check.sh`).
  2. **IP node**: ICMP + TCP 22/443/9444 cho từng node (chưa có — cần bổ sung).
  3. **Relay WS**: bắt buộc trả `101` cho từng `/relay/*` (đã có cách đo, chưa có trong tool).
  4. Ghi lại **lịch sử chuyển trạng thái** (OK↔BLOCKED) để biết chặn bắt đầu lúc nào.
- Cảnh báo qua Telegram khi **đổi trạng thái** (không spam mỗi lần chạy) — dùng lại kênh
  `flowvpn-notify --ping` đã có.
- Nên **mở rộng `scripts/gfw-check.sh`** (thêm chế độ `--node` / `--relay`) thay vì viết tool mới.

### S2 — Bỏ phụ thuộc một hostname cho relay (quan trọng ngang S1)
- Phục vụ `/relay/*` trên **hostname thứ hai** (đã có sẵn `t1.meetflowai.site` nhưng đang 404),
  và **công bố cả hai trong `GET /v1/nodes`** để client có đường lùi thật.
- Cân nhắc **zone/CDN thứ hai độc lập** để một vụ chặn theo SNI không hạ cả hai cùng lúc.
- Đưa đường **Funnel** (`fcnvpn.tail303be3.ts.net`) vào backend cấp cho client, thay vì chỉ là
  giá trị mặc định cứng trong `WSRelayDefaults` / `Config.WS_RELAY_URL`. Hiện Funnel là front
  **độc lập hạ tầng** với Cloudflare — tài sản dự phòng quý, nên được dùng như đường hạng nhất.

### S3 — Client nhanh-chuyển-đường (giảm thời gian chờ)
- Rút ngắn timeout thử đường trực tiếp (2–3 s) và **nhớ "trực tiếp hỏng"** trong phiên.
- Dùng cơ chế đã có `POST /v1/nodes/:id/report` + `NODE_FAILURES_TO_DEPRIORITISE` để backend
  xếp node theo độ tới được; cân nhắc trả thêm gợi ý đường đi trong `/v1/nodes`.

### S4 — Xoay IP node (tactical, không bền)
- Theo `docs/EXIT_NODE_IP_GUIDE.md`, ưu tiên dải/AS ít bị chặn (AS135905/VNPT như node-1 từng).
- Lưu ý: node-2 **dùng chung IP với origin của API** (`api.meetflowai.site` → node-2) ⇒ đổi IP
  node-2 kéo theo DNS + cert + Caddy. GFW sẽ chặn lại IP mới ⇒ **CDN fronting mới là đáp án bền**.

### S5 — Dọn lệch tài liệu/cấu hình
- `docs/CHINA_TRANSPORT_ROADMAP.md` còn mô tả `hyrelay@8443` / `hyrelay@9445` (TCP relay) —
  **không còn tồn tại**. Thực tế node-1: `hysteria.service` (UDP 8443), `wgrelay.service`
  (TCP 9444), 4 unit `wsrelay*`.
- `gfw-history.json` cũ 8 ngày; Android ghim 2 IP đã chết.

### S6 — Theo dõi lỗi `dial tcp4 … i/o timeout` trong hysteria (§2.7)
Chưa phải nguyên nhân, nhưng nếu khách báo chậm/rớt mạng thì đây là chỗ soi đầu tiên.

## 6. Cần chủ dự án quyết

1. **Đặt probe Trung Quốc ở đâu?** Mac này chỉ đúng khi anh còn ở Quảng Châu. Muốn bền thì nên
   là máy luôn ở Trung Quốc (harness Windows `desktop-852p1lt` đang offline 5 ngày) hoặc thuê 1
   VPS nhỏ trong Trung Quốc làm điểm đo.
2. **Chọn front thứ hai cho relay**: mở `/relay/*` trên `t1.meetflowai.site`, hay thêm zone/CDN khác?
3. **Có xoay IP node ngay không?** (tactical; chấp nhận bị chặn lại)
4. Có cho em **triển khai S1** (mở rộng `gfw-check.sh` + lịch chạy + cảnh báo Telegram) không?

## 7. Phụ lục — lệnh tái lập

```bash
cd /Volumes/BIWIN/SourcesCode/PrivateVPN
bash scripts/gfw-check.sh --json                       # domain/SNI
for ip in 103.173.155.50 165.101.114.162; do
  ping -c 4 -t 8 $ip; for p in 22 443 8443; do nc -z -G 5 -w 5 $ip $p && echo "$p OK" || echo "$p FAIL"; done
done
KEY=$(openssl rand -base64 16)
curl -s -o /dev/null -w "%{http_code}\n" --http1.1 --max-time 12 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: $KEY" \
  https://api.meetflowai.site/relay/vn1wg              # phải là 101
```

Vào VPS khi IP bị chặn (đường Tailscale, đã kiểm chứng):

```bash
ssh -i ~/.ssh/fpt_tunnel root@100.76.147.111           # node-1 qua tailnet
ssh -o BatchMode=yes root@165.101.114.162              # node-2, nhảy từ node-1
```

---

## 8. Kế hoạch triển khai S2 — dùng domain thứ hai `meetflowai.io.vn`

**Chủ dự án chốt 24/09:** dùng 2 domain. Chủ dự án tự cấu hình DNS/CDN cho `meetflowai.io.vn`.

### 8.1 Hiện trạng đo được

| Thứ | Trạng thái |
|---|---|
| `meetflowai.io.vn` / `www.meetflowai.io.vn` | **Không có bản ghi DNS** (dig rỗng) ⇒ hiện không phân giải |
| Block Caddy `meetflowai.io.vn` | Có, trên **node-2**: chỉ `root + file_server` (site tĩnh `/var/www/meetflowai-io-vn`), **không có `/relay/*`** |
| Block Caddy cho `meetflowai.io.vn` trên **node-1** | **Không có** (node-1 chỉ có `api`, `meetflowai.site`, `dhs`, `dhs-win`) |
| Relay backend trên **node-2** (bind local) | ✅ đủ **cả 4**: `relay-cf-vn1wg`→7786, `relay-cf-vn1hy`→7787, `relay-cf-vn2wg`→7783, `relay-cf-vn2hy`→7785 |
| Relay backend trên **node-1** | ✅ `vn1wg`→7782, `vn1hy`→7784, `vn2wg`→7783, `vn2hy`→7785 |
| `/relay/*` trên hostname khác `api` | `t1.meetflowai.site` → **404**, `meetflowai.site` → **404** |
| Caddy ACME | Không có `tls`/`acme`/`dns` toàn cục — dùng mặc định Let's Encrypt (HTTP-01), đã cấp được cert cho `api`/`t1`/`home`… **sau Cloudflare proxy** |
| Ghi chép trong repo | `io.vn` **không xuất hiện ở đâu** trong repo — chỉ có trong Caddyfile node-2 |

### 8.2 Việc chủ dự án cần cấu hình (DNS/CDN)

1. Thêm `meetflowai.io.vn` (và `www`) vào **Cloudflare**, bật **proxy (đám mây cam)**.
   ⚠️ **Bắt buộc proxy ON** — nếu để A record trỏ thẳng IP VPS thì domain vô dụng
   (IP đã bị chặn, xem §2.2).
2. Origin: trỏ về **cùng origin như `api.meetflowai.site`**, hoặc chỉ định `165.101.114.162`
   (node-2 — nơi đã có đủ 4 relay backend cục bộ).
3. TLS mode: **Full (strict)** là được (cert do Caddy tự xin Let's Encrypt).

### 8.3 Việc cần làm trên server (chưa thi hành — chờ duyệt)

Thêm vào block `meetflowai.io.vn` (và thêm block này trên node-1 nếu origin là node-1):

```caddyfile
meetflowai.io.vn {
	handle /relay/vn1wg* { reverse_proxy 127.0.0.1:7786 { flush_interval -1 } }
	handle /relay/vn1hy* { reverse_proxy 127.0.0.1:7787 { flush_interval -1 } }
	handle /relay/vn2wg* { reverse_proxy 127.0.0.1:7783 { flush_interval -1 } }
	handle /relay/vn2hy* { reverse_proxy 127.0.0.1:7785 { flush_interval -1 } }

	handle {
		root * /var/www/meetflowai-io-vn
		encode gzip
		file_server
	}
}
```

Quy trình bắt buộc: **backup `Caddyfile` có timestamp → `caddy validate` → `systemctl reload caddy`
→ đo lại `/relay/*` từ máy Trung Quốc phải trả `101`**; giữ đường rollback.

### 8.4 Cách để client THẬT SỰ dùng cả 2 domain

Đây là phần dễ bị bỏ sót: **thêm DNS thôi thì client vẫn chỉ biết 1 hostname.**
Client lấy URL relay **từ backend** (`ws_relay_url` / `hy_relay_url` trong `/v1/nodes`),
mỗi node chỉ có **một** URL. Ba mức:

| Mức | Cách làm | Cần gì |
|---|---|---|
| **A** (nhanh nhất, không phát hành app) | Tách theo node: đặt node-1 → `wss://meetflowai.io.vn/relay/vn1*`, giữ node-2 → `wss://api.meetflowai.site/relay/vn2*`. Hai hostname cùng có mặt trong `/v1/nodes` | Đổi **dữ liệu** registry qua `PATCH /v1/admin/nodes/:id` (không sửa code, `control-plane/src/index.js` là vùng bảo vệ của owner Windows) |
| **B** | Thêm domain thứ hai vào danh sách relay mặc định cứng của client (iOS `WSRelayDefaults`, Android `Config.WS_RELAY_URL`, Windows `WSRelayDefaults`) | Sửa code client + phát hành bản mới |
| **C** (bền nhất) | `/v1/nodes` trả **danh sách** `relay_urls[]`; client thử lần lượt | Sửa schema control-plane (vùng bảo vệ) + client |

**Khuyến nghị:** làm **A** ngay (0 phát hành), rồi gộp **B** vào bản client kế tiếp.

⚠️ Lưu ý đã đo trong mã: `TransportLadder.canonicalRungs` xếp
*QUIC trực tiếp → TCP relay (cùng node) → WS relay (node KHÁC)*, và bậc "node khác"
**mặc định TẮT** (`allowsOtherNodeRungs = false`). Nên đường dự phòng chéo node hiện
**chưa bật** — cần xác nhận lại với kế hoạch §7.3 của `TransportLadder` trước khi trông cậy vào nó.

### 8.5 Kiểm chứng sau khi xong

```bash
KEY=$(openssl rand -base64 16)
for h in api.meetflowai.site meetflowai.io.vn; do
  for r in vn1wg vn1hy vn2wg vn2hy; do
    printf "%-24s %-8s " "$h" "$r"
    curl -s -o /dev/null -w "%{http_code}\n" --http1.1 --max-time 12 \
      -H "Connection: Upgrade" -H "Upgrade: websocket" \
      -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: $KEY" \
      "https://$h/relay/$r"
  done
done
# Kỳ vọng: cả 8 dòng đều 101
```
