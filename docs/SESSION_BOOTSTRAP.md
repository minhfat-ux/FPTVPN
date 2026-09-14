# SESSION BOOTSTRAP — PrivateVPN / MeetFlow AI OPS

> Mục tiêu: đồng bộ ngữ cảnh nhanh giữa các session/agent.
> Mỗi session mới: **đọc file này trước**, rồi mới trả lời/chạy lệnh.
> Updated: 2026-09-14

---

## 1) Current infra truth (đang chạy thật)

- **Primary node (node-2)**: `165.101.114.162` (`fcnvps2`)
  - `flowvpn-cp.service` (control plane) trên `127.0.0.1:7778`
  - Caddy public cho `meetflowai.site` + `api.meetflowai.site`
- **Standby/relay node (node-1)**: `103.173.155.50`
  - `cp-proxy.service` (forward sang node-2), `wsrelay*`, Funnel bridge
- **Domains**
  - `meetflowai.site` → site/buy/admin routes
  - `api.meetflowai.site` → API routes
- **Fallback (mạng bị chặn/GFW)**
  - `https://fcnvpn.tail303be3.ts.net/admin`
  - `https://fcnvpn.tail303be3.ts.net/buy`

---

## 2) Canonical links (đúng tại thời điểm hiện tại)

- Buy page (canonical): `https://meetflowai.site/buy`
- Admin panel (canonical): `https://meetflowai.site/PrivateVPN/Admin`
- Admin panel (fallback): `https://fcnvpn.tail303be3.ts.net/admin`

> Lưu ý: qua Funnel dùng `/admin` (không có `/PrivateVPN` prefix).

---

## 3) Sự cố đã gặp gần đây + trạng thái

### A. "Không vào được buy/admin" sau khi đổi IP node-2

**Nguyên nhân chính đã xác nhận:** cache DNS local giữ IP cũ (`103.6.234.233`) trong khi DNS thật đã trỏ IP mới (`165.101.114.162`).

Triệu chứng điển hình:
- `dig meetflowai.site` ra IP mới
- nhưng `dscacheutil`/`ping` vẫn ra IP cũ
- `curl` thường timeout, còn `curl --resolve <IP mới>` thì 200

**Fix đã áp:**
- node-1 `cp-proxy.js` đổi `UPSTREAM_IP` sang `165.101.114.162` (Funnel sống lại)
- node-1 Caddy `trusted_proxies` đổi sang `165.101.114.162`

### B. Dashboard live connections (per-server + ISP)

Đã có trên production:
- `GET /v1/admin/stats` có `by_node`, `by_location`, `online_devices`, `connections_totals`
- Dashboard tab có chart theo server + ISP + bảng thiết bị online

---

## 4) Bẫy quan trọng (đừng lặp lại)

1. **Khi đổi IP node-2, bắt buộc sửa đủ 4 chỗ**
   - node-1 `/usr/local/bin/cp-proxy.js` → `UPSTREAM_IP`
   - node-1 `/etc/caddy/Caddyfile` → `trusted_proxies static <new-ip>`
   - node-2 `/etc/caddy/Caddyfile` → block `http://<new-ip>` (nếu dùng đường tải trực tiếp theo IP)
   - node-2 `flowvpn-cp.service` → `WG_PUBLIC_ENDPOINT=<new-ip>:443`

2. **DNS TTL quá cao làm đổi IP đau đớn**
   - TTL hiện từng ở 3600; khuyến nghị 60.

3. **Admin page Base URL localStorage trap**
   - Đã fix: chỉ reuse base đã lưu khi cùng origin với trang đang mở.

4. **Không in secret ra log/chat**
   - Nếu lỡ in, ghi nhận sự cố và rotate secret ngay.

---

## 5) Quick check 60 giây (copy/paste)

```bash
# 1) Public reachability
curl -s -o /dev/null -w 'buy:%{http_code}\n' https://meetflowai.site/buy
curl -s -o /dev/null -w 'admin:%{http_code}\n' https://meetflowai.site/PrivateVPN/Admin

# 2) Fallback reachability
curl -s -o /dev/null -w 'funnel-buy:%{http_code}\n' https://fcnvpn.tail303be3.ts.net/buy
curl -s -o /dev/null -w 'funnel-admin:%{http_code}\n' https://fcnvpn.tail303be3.ts.net/admin

# 3) DNS reality vs local cache (macOS)
dig +short meetflowai.site
dscacheutil -q host -a name meetflowai.site
```

Nếu DNS cache lệch IP mới:
```bash
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

---

## 5b) Admin token: chỗ lưu + cách xoay (14/09)

`AUTH_TOKEN` là **biến môi trường tĩnh**, KHÔNG có cơ chế hết hạn trong code (`index.js`: bearer
so khớp chuỗi). Nên "token hết hạn" thực chất là **token đang giữ không còn khớp server** (env bị
ghi lại trong lúc đổi IP/deploy) — hoặc trang admin gọi API sai đường (xem bẫy bên dưới).

- Nơi khai: drop-in `/etc/systemd/system/flowvpn-cp.service.d/admin-token.conf` (quyền 600, gồm
  `AUTH_TOKEN` + `VERIFY_LINK_SECRET`). Drop-in **ghi đè** `Environment=` trong unit gốc.
- Xoay token:
  ```bash
  openssl rand -hex 32 > /root/admin-token.new && chmod 600 /root/admin-token.new
  sed -i "s|^Environment=AUTH_TOKEN=.*|Environment=AUTH_TOKEN=$(cat /root/admin-token.new)|" \
    /etc/systemd/system/flowvpn-cp.service.d/admin-token.conf
  systemctl daemon-reload && systemctl restart flowvpn-cp && rm -f /root/admin-token.new
  ```
- Token hiện hành (14/09, dấu vân tay `d4dd7e…c25c`, 64 hex): lưu ở **máy Mac của chủ dự án**
  `~/.vpnflow-admin-token` (quyền 600). Xem bằng `cat ~/.vpnflow-admin-token`, copy bằng
  `pbcopy < ~/.vpnflow-admin-token`. **Không dán token vào chat/doc/commit.**
- `VERIFY_LINK_SECRET` tách riêng khỏi `AUTH_TOKEN` để xoay token KHÔNG làm chết link xác thực
  email đã gửi (trước đây `VERIFY_LINK_SECRET || AUTH_TOKEN`).
- Kiểm nhanh (chỉ in mã HTTP):
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(cat ~/.vpnflow-admin-token)" https://api.meetflowai.site/v1/admin/stats   # 200
  curl -s -o /dev/null -w '%{http_code}\n' https://api.meetflowai.site/v1/admin/stats                                                            # 401
  ```
- **App khách KHÔNG bị ảnh hưởng**: `/health`, `/v1/nodes`, `/v1/app-version`, `/v1/auth/*`,
  `/buy`, `/v1/payments/*`, `/v1/ai/*`… được miễn khỏi `AUTH_TOKEN` trong middleware.

### Bẫy mới: `/v1/admin/*` không có trên domain chính (đã fix)
Trang admin canonical là `meetflowai.site/PrivateVPN/Admin` nhưng block `meetflowai.site` chỉ mở
từng đường, và **thiếu `/v1/admin/*`** ⇒ trang tải được, mọi lời gọi API trả **404**, nhìn như
"token hết hạn". Đã thêm `handle /v1/admin/*` → `127.0.0.1:7778` (giống `/v1/payments/*`), backup
`Caddyfile.bak-*`, `caddy validate` OK + reload. Nay cả 3 base đều dùng được:
`meetflowai.site`, `api.meetflowai.site`, `fcnvpn.tail303be3.ts.net`.

---

## 6) Session-start prompt (dán vào session mới)

```text
Đọc `docs/SESSION_BOOTSTRAP.md` và dùng đó làm context hiện tại.
Sau đó kiểm nhanh bằng 60-second checks trong file, báo trạng thái PASS/FAIL từng mục,
rồi mới trả lời câu hỏi chính của tôi.
```

---

## 7) Traceability / commits tham chiếu gần đây

- `7ab38d7` feat(control-plane): dashboard per-server + ISP/IP
- `7226ae6` fix(admin): panel chạy ổn khi đổi domain/Funnel (base origin-safe)
- `cbddadc` docs(memory): bằng chứng deploy panel + blocked-network access
- `7050580` docs(ops): checklist đổi IP máy chính + chẩn đoán buy fail

