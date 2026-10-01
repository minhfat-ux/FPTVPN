# BÀN GIAO TEAM LEADER — dựng node-2 (VPS mới) thành exit node + toàn cảnh việc đang dở

- **Từ:** agent chính (harness Mac) · **Ngày:** 30/09/2026 · **Đến:** phiên Team Leader mới
- **Trạng thái chung:** kênh khách **đang chạy bình thường** — mọi việc dưới đây phải làm theo kiểu **CHỈ THÊM, KHÔNG PHÁ**.

---

## 0. LUẬT AN TOÀN BẮT BUỘC (chủ dự án chốt 30/09/2026)

> *"dựng không được để ảnh hưởng đến hiện tại, chỉ khi không còn bất cứ connecting nào của khách mới tắt exit node
> trên con relay đi. Vì hiện tại có thể vẫn có khách đang dùng."*

1. **KHÔNG sửa** `Caddyfile` hiện có, **KHÔNG đụng** unit đang chạy, **KHÔNG tắt** exit node cũ — chỉ **THÊM** mới.
2. Việc **tắt exit cũ** chỉ làm khi: đo `STATS active=0` **ngay trước đó** + chủ dự án xác nhận.
3. Sau **MỖI** thay đổi: `curl` lại **8 relay phải = 426** (2 cửa × 4) + CP `/v1/health` = ok.
4. Trước khi thao tác production: đọc `AGENTS.md` §7e (đặt lệnh tự hồi TÁCH PHIÊN trước; không thao tác lên chính
   đường mà phiên SSH của mình đang đi — **SSH của harness Mac đi QUA tunnel**, nên restart relay có thể tự cắt phiên mình).

---

## 1. SƠ ĐỒ NODE (đã đổi tên hôm nay)

| Tên | IP | Vai trò | Hostname đã đặt |
|---|---|---|---|
| `node-1` | `103.173.155.50` | **exit** (đang phục vụ khách) | (cũ) |
| `node-2` **(MỚI)** | `103.6.235.39` | **exit mới** + **backup DB** (chưa dựng) | ✅ `node-2` |
| `relay-server` (cũ là node-2) | `165.101.114.162` | **relay-only** + control-plane + Caddy + health-watch | ✅ `relay-server` |

**Thông số node-2 mới:** Ubuntu 24.04.5 · 1 vCPU · 961 MB RAM · đĩa 20 GB (còn 16 GB) ·
AS152992 ONLINE DATA COMPANY LIMITED (Hà Nội).
**`ufw` ĐÃ MỞ sẵn:** 22/tcp · 80/tcp · 443/tcp · 8443/udp · 8443/tcp.
**ĐÃ KIỂM: KHÔNG có firewall ngoài của nhà cung cấp chặn** — bằng chứng: từ Trung Quốc (VPN tắt) cổng 80 trả
`ConnectionRefused` (gói TỚI ĐƯỢC máy) chứ không phải `Timeout`. ⇒ **không cần đụng console nhà cung cấp.**

> ⚠️ SSH vào node-2 mới dùng key `~/.ssh/fpt_vpn_node` (key `fpt_tunnel` bị từ chối).
> SSH vào `relay-server` dùng `~/.ssh/fpt_vpn_node`. SSH vào **node-1** phải dùng **`~/.ssh/fpt_tunnel`**.

---

## 2. VIỆC CHÍNH: dựng node-2 mới thành exit node (5 bước)

### Mẫu đã lấy từ `relay-server` (nhân bản, đừng tự nghĩ)

```
hysteria:  /usr/local/bin/hysteria server -c /etc/hysteria-server.yaml
           config có các khoá: listen: :8443 · tls: · obfs(type: salamander) · auth(type: password)
           ⚠️ credential PHẢI TRÙNG cái client dùng — copy từ config `relay-server`, KHÔNG tự đặt.
              (Không in credential ra log/doc — AGENTS §1.)
wsrelay:   /root/wsrelay.js  (node)
Caddy:     /etc/caddy/Caddyfile — mỗi cửa relay là 1 handle + 1 cổng nội bộ:
             /relay/vn2wg* → 127.0.0.1:7783     /relay/vn2hy* → 127.0.0.1:7785
             /relay/vn1wg* → 127.0.0.1:7786     /relay/vn1hy* → 127.0.0.1:7787 (→ 103.173.155.50:8443)
unit relay: WS_LISTEN_PORT=7785 · WS_UDP_HOST=127.0.0.1 · WS_UDP_PORT=8443 · PONG_TIMEOUT_MS=120000
```

### Việc cần làm

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Trên **node-2 mới**: copy binary `hysteria` + tạo `/etc/hysteria-server.yaml` (listen `:8443`, obfs salamander, auth password **trùng client**) + unit `hysteria.service` | `ufw` đã mở 8443/udp |
| 2 | Trên **relay-server**: **THÊM** unit `relay-cf-vn3hy` (`WS_UDP_HOST=103.6.235.39`) + **THÊM** 1 `handle /relay/vn3hy*` → `127.0.0.1:7789`, rồi `caddy reload` | Cách này giống hệt `vn1hy` đang trỏ sang node-1 ⇒ đã có tiền lệ chạy được |
| 3 | ⚠️ **Bất biến F3**: `hy_relay_url` của node-2 mới = `wss://api.meetflowai.site/relay/vn3hy` — **relay RIÊNG của nó**. KHÔNG để khách exit qua node-2 mới mà nối relay `vn2hy` (đó là lỗi F3 sinh ra để chặn) | |
| 4 | **Đăng ký `exit_nodes`** (SQLite control-plane): thêm node-2 mới (`active=1`, `priority` thấp hơn node-1) — **và chỉ khi 0 khách đang dùng** mới `active=0` cho exit cũ | Xem §0 |
| 5 | **Test**: từ TQ (VPN TẮT ⇒ phép đo mới có giá trị) qua cửa mới; rồi **TRÌNH DUYỆT THẬT** kiểm `gemini.google.com` + `claude.ai` | curl KHÔNG thay được trình duyệt (xem §3) |

### Path đặt tên: dùng `/relay/vn3hy` (KHÔNG đổi `vn1hy`/`vn2hy`)
Vì `hy_relay_url` đã ghi trong DB và app đang dùng — **đổi path cũ sẽ làm chết khách đang chạy**.

---

## 3. BÀI HỌC ĐO LƯỜNG (đừng lặp lại sai lầm của agent cũ)

1. **`curl` KHÔNG kiểm được Google/Anthropic có "gắn cờ" IP hay không.** Cả 3 IP (node-1, node-2 cũ, node-2 mới)
   đều cho `claude.ai = 403` + header `cf-mitigated: challenge` với curl — vì **curl không giải được JS challenge**.
   ⇒ **Chỉ trình duyệt thật** mới trả lời được. Kết luận cũ "IP node-2 bị gắn cờ" vì thế **yếu**.
2. **Đo từ Mac phải kiểm VPN đã TẮT chưa.** Một lần agent cũ báo "VPS không bị chặn" trong khi VPN Mac **đang bật**
   ⇒ mọi gói đi ra từ node thoát ở Hà Nội. Bằng chứng nhận ra: `ping 1.1.1.1` chỉ **0,778 ms** (bất khả thi thật).
   Cách kiểm: `pgrep -f com.privatevpn.mac.packet-tunnel` + ping phải cỡ **90–110 ms** mới là đi thẳng.
3. **`myip.com.vn` và `ifconfig.co` nằm trên Cloudflare** — dải IPv6 Cloudflare bị **miễn trừ** khỏi tunnel
   ⇒ IPv6 tới chúng **đi thẳng** ⇒ **báo "rò IPv6" GIẢ**. Dùng `api64.ipify.org` hoặc `ipv6-test.com`.
4. `zen.spamhaus.org` trả `127.255.255.254` = **mã lỗi "open resolver"**, KHÔNG phải bị liệt kê.

---

## 4. VIỆC ĐANG DỞ KHÁC (không được quên)

| # | Việc | Trạng thái |
|---|---|---|
| 1 | **iOS build 59 (đã vá) đã cài lên iPhone** của chủ dự án | Chờ **nghiệm thu**: connect→ngắt→connect **liên tiếp 5–10 lần**, đổi node/cửa trong phiên; log phải **hết** `hysteria client already running` |
| 2 | 🔒 **Kênh iOS đang GHIM `1.4.6/57`** (`.privatevpn/status/release-lock.json`) | Build **58 và 59 đều bị `check-publish-version.py` CHẶN (exit 3)**. **KHÔNG mở khoá** cho tới khi chủ dự án cho phép |
| 3 | **Gốc lỗi build 58** đã vá: `tools/hysteria-android/mobile.go` — `Stop()` nay giải phóng `active` NGAY + `Connect()` tự dọn client cũ | Framework `Hysteria.xcframework` đã dựng lại, **đã kiểm bản vá nằm trong** |
| 4 | **`scripts/archive-appstore.sh`** đã thêm **cổng `xcodegen generate`** (exit 4 nếu thiếu xcodegen) | Vì lần build đầu ra IPA mang số **57** dù `project.yml` đã 59 (xcodeproj cũ) — "bản 57 giả". Cổng `ios-verify-ipa.sh` đã bắt được |
| 5 | **`control-plane/src/auth-store.js`** đã vá + **deploy lên `relay-server`**: `_load()` không nuốt lỗi (ném + log), `_save()` ghi nguyên tử | Backup: `data/backups/auth.json.20260926-224751.bak`; source cũ: `src/auth-store.js.bak-225156` |
| 6 | **`relay-cf-*`: `PONG_TIMEOUT_MS` 60000 → 120000** (cả 4 relay trên `relay-server`) | Vì mọi phiên bị cắt bằng `pong-timeout`. Backup unit: `/root/relay-units-backup-20260926-215725/` |
| 7 | **Gemini/Claude trên Windows** | Nghi vấn mới nhất: **khách chạy CLASH song song** (IP hiện Dallas US, nhưng relay thấy IP TQ `120.234.32.53`) ⇒ hai proxy tranh route. **Đã giao Win** (Telegram + `inbox/windows/`), Win **chỉ `.ack`, CHƯA báo cáo**.<br>⚠️ **01/10/2026 — cập nhật:** ca *"Gemini không hỗ trợ ở nước bạn"* đã **chốt nguyên nhân là COOKIE `google.com`** (cùng máy/cùng node, **ẩn danh ⇒ vào được**) — xem **§10e/§10f** của `HANDOFF_VN3_WIREGUARD_FULL_2026-09-30.md`. Với ca khách Windows dưới đây: **thử xoá cookie `google.com` TRƯỚC** rồi mới đuổi theo giả thuyết CLASH song song. |
| 8 | **Kế hoạch watcher** | `docs/handoff/HANDOFF_WATCHER_GOAL_2026-09-26.md` — 7 nhiệm vụ W1–W7 (W1 "đo đường dữ liệu thật" là quan trọng nhất). **Chưa làm** |
| 9 | **Chưa commit** (rủi ro mất — ổ `/Volumes/BIWIN` từng bị NGẮT giữa phiên) — *đã soi lại `git status` ngay lúc bàn giao* | **Thuộc phiên này, nên commit:** `tools/hysteria-android/mobile.go` (+30/−3) · `iOS/PrivateVPN/Services/HysteriaDefaults.swift` (+23/−5) · `scripts/ios-pure-logic-tests/main.swift` (+13/−2) · `project.yml` (iOS 57→59) · `scripts/archive-appstore.sh` (+19) · `.privatevpn/status/release-lock.json` (ghim iOS 57) · `release/releases.jsonl` (+1).<br>⚠️ **KHÔNG quét:** `scripts/security/mac-selfdefense/**` + `.../test/config-defaults.test.js` — **của phiên khác** |
| 10 | Chủ dự án sẽ **backup DB lên node-2 mới** | Nhắc: backup chưa từng **restore thử** thì chưa phải backup; và DB chứa **email khách + token** ⇒ **không mở cổng DB ra Internet** |
| 11 | **Bộ công cụ migration ổ đĩa** `scripts/migrate/` (7 file, 29/09) **CHƯA COMMIT, chưa chạy lần nào** — preflight → format SSD mới → copy → verify → cutover → postflight | Đọc `scripts/migrate/README.md` TRƯỚC khi ai đó định format. Lý do tồn tại: repo nằm trên **exFAT ngoài**, đã 1 lần bị NGẮT giữa phiên (exFAT không journal ⇒ dễ mất dữ liệu). Đây là ứng viên commit sớm vì nó là **lưới an toàn cho chính cái repo** |

---

## 5. KÊNH LIÊN LẠC & CÔNG CỤ

- **Telegram** (gửi được từ Mac qua `scripts/security/mac-selfdefense/lib/notify.mjs`, creds ở `~/.vpnflow-telegram`):
  đây là kênh **DUY NHẤT** còn sống khi SSH tắc — đã dùng để báo chủ dự án + giao việc Win.
- **Inbox chung** trên `relay-server`: `/var/lib/flowvpn-coord/inbox/{mac,windows,server}/` (đồng bộ **qua SSH**).
- **Cổng chặn**: `scripts/ios-verify-ipa.sh` · `scripts/check-publish-version.py` · `scripts/ios-typecheck.sh` ·
  `scripts/ios-pure-logic-tests/run.sh` (657/657) · `scripts/ios-lint-locks.py` · `scripts/check-relay-ipv6-exclusion.py`.
- **`flowvpn-safe-stop <unit> [giây]`** (từ chối nếu unit đang chở phiên điều khiển) · **`flowvpn-safe-status`**.

---

## 6. ĐIỂM CHƯA CHẮC — NÓI THẲNG

1. **Chưa có chứng chỉ TLS cho hysteria của node-2 mới** — cần chủ dự án chốt **dùng domain nào**
   (dùng lại domain cũ nếu cert phủ được, hoặc domain riêng cho node-2). **Không có cert đúng tên ⇒ client từ chối bắt tay.**
2. **Chưa dựng gì trên node-2 mới** — hiện chỉ mới: đổi hostname, mở `ufw`, và có **1 listener tạm** trên cổng 443
   do một lần SSH lỗi nhưng lệnh chạy một phần ⇒ **phải dọn listener tạm đó** trước khi dựng Caddy thật.
3. **Chưa từng đo được "khách TQ có tới được node-2 mới không" trên cổng thật** (chỉ mới test cổng 22/80/443 khi
   chưa có service; 8443 là UDP nên cách đo khác).
