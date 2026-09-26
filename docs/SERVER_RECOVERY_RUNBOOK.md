# SERVER RECOVERY RUNBOOK — node-2 (đường khách VPNFlow)

> **Đọc trước khi dừng / bật bất kỳ dịch vụ nào trên node-2.** Đi kèm `AGENTS.md` §7e.
> Người đọc giả định: chủ dự án hoặc agent đang được giao việc hạ tầng/monitoring.
> Ngày viết: 26/09/2026 (ngay sau sự cố mất relay 20 phút).

## 0. TL;DR — 4 câu phải nhớ

1. **Máy Mac vào internet QUA tunnel.** Vì vậy SSH tới node-2 cũng đi qua tunnel ⇒ dừng relay
   đang chở tunnel = **tự cắt đường cứu hộ**. Đây là gốc của sự cố 26/09/2026.
2. **Trước khi dừng bất cứ thứ gì**: dùng `flowvpn-safe-stop <unit> <giây>` — nó tự đặt lệnh hồi
   **tách khỏi phiên** và **từ chối** nếu `<unit>` là relay cùng node với đường điều khiển.
3. **Sau khi test xong**: chạy `flowvpn-safe-status` → **cả bốn relay phải = `426`** và **mọi unit
   `active`**. Không có bằng chứng này = test chưa kết thúc.
4. **Khi tunnel chết**: vào node-2 bằng **Tailscale → node-1 → node-2**. Node-2 **không** ở trong
   tailnet (đã đo), nên Tailscale luôn phải nhảy qua node-1 trước. SSH trực tiếp từ VN hay bị chặn.

---

## 1. Sự cố 26/09/2026 — vì sao runbook này tồn tại

Để test failover, một agent chạy `systemctl stop relay-cf-vn2hy` trên node-2. Nhưng **chính phiên
SSH của agent đi qua tunnel của relay đó**, nên lệnh "mở lại" đặt sau đó không bao giờ chạy.
Không có watchdog nào tự khôi phục. Diễn biến thật (journal node-2, `-o short-iso`):

```text
2026-09-26T13:54:47  wsrelay:7785 STATS active=2 …              ← vẫn còn 2 phiên khách Connected
2026-09-26T13:59:08  systemd[1]: Stopping relay-cf-vn2hy.service …
2026-09-26T13:59:08  wsrelay:7785 SIGTERM -> thoát
2026-09-26T14:00:38  systemd[1]: relay-cf-vn2hy.service: State 'stop-sigterm' timed out. Killing.
2026-09-26T14:00:38  systemd[1]: relay-cf-vn2hy.service: Killing process 3080035 with signal SIGKILL.
2026-09-26T14:00:38  systemd[1]: relay-cf-vn2hy.service: Failed with result 'timeout'.
2026-09-26T14:00:38  systemd[1]: Stopped relay-cf-vn2hy.service
2026-09-26T14:19:42  systemd[1]: Started relay-cf-vn2hy.service      ← khôi phục bằng tay
```

**Relay chết 20 phút 34 giây** (13:59:08 → 14:19:42 giờ +07). Ba lỗi chồng nhau:

| # | Lỗi | Hậu quả |
|---|---|---|
| 1 | Lệnh tự hồi không tách khỏi phiên, và dừng chính relay đang chở phiên SSH | Không có cách nào tự mở lại |
| 2 | **Không có watchdog** phía server | 20 phút không ai khôi phục |
| 3 | Client macOS không failover sang `vn1hy` (relay node-1 vẫn sống) | Khách mất mạng ~18 phút tới khi đổi node bằng tay |

Chỉ khôi phục được nhờ **đường vòng**: đổi app sang node-1 → có mạng → SSH lại node-2 → `systemctl start`.

### Vì sao `Restart=always` KHÔNG cứu được ca này

Cả bốn relay **đã** có `Restart=always` + `RestartSec=3`. Nhưng `systemctl stop` là **dừng CHỦ Ý**:
systemd đánh dấu unit là "intentionally stopped" và **không** restart. `Restart=always` chỉ cứu khi
**tiến trình tự chết** (crash/OOM). Đây là lý do phải có watchdog **kiểm định kỳ từ bên ngoài**.

---

## 2. Bản đồ dịch vụ đường khách trên node-2

| unit | kênh / vai trò | node | port local | `Restart=` | ghi chú |
|---|---|---|---|---|---|
| `relay-cf-vn1hy` | WS relay Cloudflare → hysteria node-1 | vietnam-1 | 7787 | `always`/3s | **chở tunnel của máy Mac** (xem §3) |
| `relay-cf-vn2hy` | WS relay Cloudflare → hysteria node-2 | vietnam-2 | 7785 | `always`/3s | relay của sự cố 26/09 |
| `relay-cf-vn1wg` | WS relay Cloudflare → WG node-1 | vietnam-1 | 7786 | `always`/3s | cùng node với đường điều khiển |
| `relay-cf-vn2wg` | WS relay Cloudflare → WG node-2 (exit Hanoi-2) | vietnam-2 | 7783 | `always`/3s | |
| `wgrelay-wg` | WG UDP relay TCP 9444 → UDP 443 | vietnam-2 | 9444 | `always`/3s | |
| `caddy` | TLS / Cloudflare origin | — | 443 | **`no`** | không tự hồi ⇒ watchdog phải `start` |
| `flowvpn-cp` | control plane (cổng khách) | — | 7778 | `always`/3s | sửa dữ liệu khách: **không** đụng dữ liệu |
| `flowvpn-guard` | guard khách mới | — | — | `always`/10s | |

Kiểm mã HTTP qua Cloudflare (mong đợi **426** = WebSocket sẵn sàng):

```bash
for r in vn1hy vn2hy vn1wg vn2wg; do
  curl -s -o /dev/null -w "$r=%{http_code} " https://api.meetflowai.site/relay/$r
done
# mong đợi: vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426
```

---

## 3. Xác định ĐƯỜNG ĐIỀU KHIỂN đang đi qua relay nào (bắt buộc trước khi dừng)

Máy Mac vào internet qua tunnel, nên SSH tới node-2 **cũng** đi qua tunnel. Cách biết đang đi node nào:

```bash
# chạy TRÊN node-2, trong chính phiên SSH cần kiểm:
echo "$SSH_CLIENT"
```

IP nguồn chính là **IP exit của node** mà tunnel đang thoát ra:

| `SSH_CLIENT` (IP nguồn) | nghĩa | relay **CẤM** dừng |
|---|---|---|
| `103.173.155.50` | đi ra qua **node-1** | `relay-cf-vn1hy`, `relay-cf-vn1wg` |
| `165.101.114.162` | đi ra qua **node-2** | `relay-cf-vn2hy`, `relay-cf-vn2wg` |
| khác / không đọc được | không xác định | **mọi** relay (cần `--force`) |

Đo thật 26/09/2026 14:26 +07: `SSH_CLIENT=103.173.155.50` ⇒ máy Mac đang đi **node-1**
(`relay/vn1hy`), nên ca test an toàn phải dùng relay **node-2**.

`flowvpn-safe-stop` tự làm phép kiểm này và **từ chối** (exit 3) nếu bạn định dừng nhầm.

---

## 4. Các đường vào node-2 khi tunnel chết

Khi tunnel chết, đường SSH "bình thường" (`ssh root@165.101.114.162`) cũng chết theo. Ba đường vào:

### 4.1. Tailscale → node-1 → node-2 (**đường chính**)

```bash
# Trên máy Mac: bật Tailscale (nếu chưa bật)
tailscale status | grep 100.76.147.111     # node-1
ssh root@100.76.147.111                    # vào node-1
# Từ node-1 nhảy sang node-2:
ssh root@165.101.114.162                   # node-1 → node-2 (kết nối VPS↔VPS, không qua tunnel khách)
```

- **Node-2 KHÔNG nằm trong tailnet** (đã đo 26/09/2026: `ping 100.76.147.111` từ node-2 **thất bại**;
  node-2 không có `tailscale`). Vì vậy Tailscale **luôn** phải nhảy qua node-1.
- Từ node-2 tới node-1 **có** đường (đã đo: TCP `103.173.155.50:22` **mở**; node-2 có khoá riêng
  `/root/.ssh/id_node1`).
- Đây là đường **không phụ thuộc relay khách** ⇒ là đường cứu hộ đúng khi đã tự cắt tunnel.

### 4.2. Console nhà cung cấp (VPS console / VNC)

Vào thẳng console của node-2 qua trang quản trị nhà cung cấp. Không phụ thuộc SSH, không phụ thuộc
tunnel. Dùng khi §4.1 cũng không được (ví dụ node-1 cũng có vấn đề).

### 4.3. SSH trực tiếp tới `165.101.114.162:22` — **thường KHÔNG dùng được từ VN**

- Đã đo (26/09/2026, ghi nhận của chủ dự án): SSH trực tiếp từ máy Mac tới `165.101.114.162:22`
  **timeout khi tunnel tắt**. Đây chính là lý do sự cố 26/09 kéo dài: người trực không còn đường vào.
- **Không đo lại trong task này** vì muốn đo phải cắt tunnel — mà cắt tunnel chính là sự cố cần tránh.
- Kết luận: **coi đường này là KHÔNG có**, đừng tính vào phương án cứu hộ.

---

## 5. Kiểm & khôi phục từng dịch vụ

### 5.1. Kiểm nhanh toàn bộ (dùng lệnh này trước và sau mọi thao tác)

```bash
flowvpn-safe-status          # đầy đủ
flowvpn-safe-status --quiet  # chỉ mã relay (dùng cho script/checklist)
```

### 5.2. Khôi phục tay từng dịch vụ

```bash
systemctl status <unit> --no-pager        # xem trạng thái + log gần nhất
systemctl start  <unit>                   # bật lại (KHÔNG dùng stop trong lúc debug)
systemctl restart <unit>                  # chỉ khi tiến trình còn sống nhưng không phục vụ được
journalctl -u <unit> --no-pager -n 50 -o short-iso
```

Unit đang `failed` ⇒ `systemctl reset-failed <unit>` rồi `systemctl start <unit>`.

### 5.3. Relay sống nhưng Cloudflare không trả 426

Chẩn đoán **theo thứ tự** (đừng restart mù):

```bash
# (a) cổng local có listen không?
ss -lntp | grep -E ':(7783|7785|7786|7787)\b'
# (b) relay trả lời trực tiếp không? (qua Cloudflare/Caddy)
curl -s -o /dev/null -w '%{http_code}\n' https://api.meetflowai.site/relay/vn2wg
```

| (a) cổng local | (b) qua Cloudflare | kết luận | hành động |
|---|---|---|---|
| KHÔNG listen | ≠ 426 | tiến trình relay chết | `systemctl start <unit>` |
| **listen** | ≠ 426 | **lỗi Cloudflare/upstream**, không phải relay | **KHÔNG restart** (vô ích, gây rung) — kiểm Cloudflare/DNS/Caddy |

Đây đúng là logic của watchdog: cổng vẫn listen thì nó **chỉ alert, không restart**.

### 5.4. `flowvpn-cp` / `caddy` / `flowvpn-guard`

```bash
systemctl start flowvpn-cp      # control plane (cổng khách)
systemctl start caddy           # lưu ý: Restart=no ⇒ không tự hồi
systemctl start flowvpn-guard
```

⚠️ **Tuyệt đối không** sửa/khôi phục dữ liệu khách (`auth.json`, `devices.json`, `nodes.db`) trong
lúc cứu hộ. Chỉ bật lại dịch vụ.

---

## 6. Watchdog tự sửa: `flowvpn-health-watch`

### 6.1. Thành phần

| Đối tượng | Đường dẫn | Ghi chú |
|---|---|---|
| Script | `/usr/local/bin/flowvpn-health-watch` | bash, chạy bằng root |
| Service | `/etc/systemd/system/flowvpn-health-watch.service` | `Type=oneshot` |
| Timer | `/etc/systemd/system/flowvpn-health-watch.timer` | `OnBootSec=90`, `OnUnitActiveSec=45`, `AccuracySec=5s`, **enabled** |
| Log | `/var/log/flowvpn-health-watch.log` | + `/etc/logrotate.d/flowvpn-health-watch` (daily, 14 bản, nén) |
| Trạng thái | `/var/lib/flowvpn-health-watch/` | `cooldown/`, `attempts/`, `httpfail/`, `firstbad/`, `escalated/`, `heartbeat` |
| Nhịp dự phòng | root `crontab`: `*/2 * * * *` | chạy `--from-cron` (bắt được cả ca **timer chết**) |
| Cờ bảo trì | `/etc/flowvpn-health-watch.maintenance` | có file ⇒ **chỉ alert, KHÔNG tự sửa** |

### 6.2. Nó tự phát hiện gì

1. **Unit đường khách không `active`** (8 unit ở §2).
2. **Relay không trả `426`** qua Cloudflare — đếm **2 lần liên tiếp** mới hành động (chống rung).
3. **Chính watchdog chết**: timer không `active`, timer không `enabled` (mất sau reboot), service
   `failed`, và **nhịp tim cũ** (>180 s ⇒ timer không chạy; chỉ nhịp cron kết luận được điều này).
4. **Caddy / control-plane / guard chết** (nằm trong danh mục §2).
5. **Ảnh hưởng khách**: đọc journal relay để lấy `STATS active=N` gần nhất + số phiên rớt
   (`1006` / `pong-timeout`) ⇒ báo được "khách đang đi node nào".
6. **Nghi thao tác debug/test**: nếu journal có `Stopping <unit>` (dừng **chủ ý**, không phải crash)
   ⇒ ghi rõ `InvocationID`, thời điểm dừng, và **các IP SSH đã đăng nhập trong 30 phút qua**.
   ⚠️ node-2 **không có `auditd`** ⇒ **không** truy được chính xác *ai* chạy `systemctl`; chỉ suy ra được.

### 6.3. Nó hành động gì

- Unit không `active` ⇒ `systemctl reset-failed` + **`systemctl start`**.
- Relay không 426 **và cổng local không listen** ⇒ `systemctl restart`.
- Relay không 426 **nhưng cổng local vẫn listen** ⇒ **không restart**, chỉ alert (lỗi upstream).
- ⛔ **Không bao giờ** gọi `systemctl stop` / `disable`. Chỉ `start`, `restart`, `reset-failed`, `enable --now`.
- **Chống rung**: cooldown **60 s/unit**; tuyệt đối **không restart unit vừa start trong 60 s**.

### 6.4. Báo cáo: Telegram + inbox

- Dùng đúng bot/chat mà harness đang đọc: token + chat lấy từ `/etc/flowvpn-tg-bot.env`, dự phòng
  `/etc/flowvpn-cp.service.d/alerts.conf` (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`).
  **Token không bao giờ được in ra log/stdout**; script chỉ in `message_id`.
- Hai tin cho mỗi sự kiện: **tin PHÁT HIỆN** (cái gì hỏng + ảnh hưởng + hành động dự kiến) và
  **tin KẾT QUẢ** (đã làm gì + kiểm lại mã relay). Không có gì hỏng ⇒ **không gửi** (đỡ spam).
- Ghi thêm bản sao vào **cả ba** hộp thư: `/var/lib/flowvpn-coord/inbox/{mac,windows,server}/`
  (harness nào không đọc Telegram vẫn thấy).
- **ESCALATE**: nếu ≥3 lần thử **hoặc** sau 180 s vẫn hỏng ⇒ gửi tin 🚨 khẩn, nêu rõ **cần người làm gì**
  và các đường cứu hộ đã thử. Không im lặng. (Chống lặp: tối đa 1 tin ESCALATE / 15 phút / unit.)

### 6.5. Xem log

```bash
tail -50 /var/log/flowvpn-health-watch.log          # nhật ký watchdog
systemctl status flowvpn-health-watch.timer --no-pager
systemctl list-timers flowvpn-health-watch.timer --no-pager
journalctl -u flowvpn-health-watch.service -n 50 --no-pager -o short-iso
journalctl -u flowvpn-health-watch.timer --no-pager -o short-iso
```

Log ghi rõ: thời điểm · unit · hành động · kết quả `is-active` **sau đó** · `message_id` Telegram.

### 6.6. Tạm dừng watchdog khi bảo trì có kế hoạch

```bash
touch /etc/flowvpn-health-watch.maintenance   # chỉ alert, không tự sửa
# … làm việc bảo trì …
rm /etc/flowvpn-health-watch.maintenance      # bật lại tự sửa
flowvpn-safe-status                           # kiểm lại
```

Tắt hẳn (chỉ khi thật cần): `systemctl disable --now flowvpn-health-watch.timer` — **nhớ bật lại**,
vì timer `enabled` chính là thứ giữ watchdog sống qua reboot.

---

## 7. Guard cho người/agent test

### 7.1. `flowvpn-safe-stop <unit> [giây=40] [--force]`

Thứ tự **bắt buộc, không thể đảo**: kiểm unit → xác định đường điều khiển (§3) → **đặt lệnh tự hồi
tách khỏi phiên** → *chỉ khi đã có lệnh tự hồi* mới `systemctl stop`.

```bash
# Đúng cách: relay KHÁC node với đường điều khiển
flowvpn-safe-stop relay-cf-vn2wg 120
#   scheduled
#   backstop: systemd-timer:restore-relay-cf-vn2wg-<ts>.timer (nổ sau 119s, AccuracySec=1s)
#             nohup-sleeper:pid=<pid> (sau 120s)
```

Hai backstop **độc lập**, cả hai chỉ gọi `systemctl start` (idempotent):
`systemd-run` transient timer **và** `setsid`+`nohup` sleeper.

| exit | nghĩa |
|---|---|
| 0 | đã `scheduled` rồi mới stop |
| 2 | tham số sai / không có unit |
| 3 | **TỪ CHỐI**: unit là relay cùng node với đường điều khiển (thêm `--force` nếu thật chắc) |
| 4 | **TỪ CHỐI**: không đặt được lệnh tự hồi nào ⇒ **không được** dừng dịch vụ |

> **Vì sao phải *xác minh* lệnh tự hồi, không chỉ đặt nó:** đo thật 26/09/2026, `systemd-run
> --on-active=180` nổ ở **+304 s** vì `AccuracySec` mặc định là **1 phút** và systemd gộp timer.
> `flowvpn-safe-stop` vì vậy: (a) đặt `--timer-property=AccuracySec=1s`, (b) **đọc lại** giờ nổ qua
> `systemctl list-timers --output=json` và chỉ chấp nhận nếu nằm trong `[giây-15, giây+30]`,
> (c) luôn kèm sleeper `nohup` không phụ thuộc systemd timer.
> (Ghi chú kỹ thuật: `NextElapseUSecMonotonic` **luôn** trả chuỗi đã format dạng `2w 3d 2h 32min 48s`,
> không dùng được cho tính toán số — dùng JSON của `list-timers`.)

### 7.2. `flowvpn-safe-status`

In trạng thái 8 unit đường khách + 4 mã HTTP relay + trạng thái watchdog + 5 dòng log cuối.
Exit 0 chỉ khi **mọi unit `active`** và **cả bốn relay = 426**.

---

## 8. Checklist "sau khi test xong phải kiểm gì"

- [ ] `flowvpn-safe-status` → **cả bốn relay = `426`** và **mọi unit `active`**
- [ ] `systemctl list-timers flowvpn-health-watch.timer` → `active`/`enabled`, có `NEXT`
- [ ] Tunnel trên máy khách vẫn **`Connected`** (mở app, xem trạng thái)
- [ ] Không còn unit transient `restore-*` treo: `systemctl list-units --all | grep restore-`
- [ ] Đọc `tail -30 /var/log/flowvpn-health-watch.log`: nếu có `ACTION` ⇒ kiểm lại kết quả đã `active`
- [ ] Kiểm hộp thư đã nhận bản sao: `ls -t /var/lib/flowvpn-coord/inbox/mac/ | head -3`
- [ ] Nếu vừa dừng một relay: kiểm phiên khách đã nối lại (`journalctl -u <unit> | grep -E 'MỞ|STATS'`)
- [ ] Đã xoá cờ bảo trì nếu có: `ls /etc/flowvpn-health-watch.maintenance` (phải KHÔNG tồn tại)

---

## 9. Khoảng trống đã bịt

| Khoảng trống (trước 26/09) | Đã bịt bằng |
|---|---|
| Không ai tự `start` lại unit bị dừng chủ ý | `flowvpn-health-watch.timer` (45 s) tự `start` |
| Không ai phát hiện relay không trả 426 | Watchdog kiểm mã HTTP 4 relay, 2 lần liên tiếp |
| Không ai báo cho người trực | Telegram (tin phát hiện + tin kết quả) + inbox 3 bên |
| Lệnh tự hồi đặt sau `stop` / không tách phiên | `flowvpn-safe-stop`: đặt & **xác minh** trước, 2 backstop tách phiên |
| Dừng nhầm relay đang chở phiên điều khiển | `flowvpn-safe-stop` từ chối (exit 3) theo IP exit của `SSH_CLIENT` |
| Không có nhật ký ai/cái gì đã dừng | Watchdog ghi `InvocationID` + thời điểm + IP SSH nghi vấn |
| Không biết watchdog có sống qua reboot | timer `enabled` + cron dự phòng + nhịp tim |
| Không có đường cứu hộ khi tunnel chết | §4: Tailscale → node-1 → node-2; console nhà cung cấp |

---

## 10. Việc còn lại / khuyến nghị

1. **`AGENTS.md` §7e.5** đang viết "Cần có watchdog phía server" và "trước khi watchdog này tồn tại,
   luật (1)+(2) là bắt buộc tuyệt đối". Watchdog **đã tồn tại** — chủ dự án nên cập nhật §7e.5
   trỏ về runbook này (task này **không** được phép sửa `AGENTS.md`).
2. **Không truy được ai chạy `systemctl`**: node-2 không có `auditd`. Nếu muốn truy trách nhiệm tự động,
   cần bật `auditd` (rule theo dõi `systemctl`) — nằm ngoài phạm vi task này.
3. **Client chưa failover** (lỗi #3 của sự cố): thuộc **build 27**, không thuộc phạm vi runbook này.
   Watchdog chỉ cứu phía server; nếu client không failover thì watchdog là lớp duy nhất giữ khách.

---

## 11. Phụ lục — bằng chứng ca test an toàn 26/09/2026

Thực hiện lúc 14:32–14:34 +07, trên `relay-cf-vn2wg` (relay **node-2**, `active=0` phiên khách, và
**không** phải đường điều khiển vì `SSH_CLIENT=103.173.155.50` = node-1):

```text
14:32:12  flowvpn-safe-stop relay-cf-vn2wg 120 → scheduled
          backstop: systemd-timer:restore-relay-cf-vn2wg-20260926T143212.timer (nổ sau 119s,
                    AccuracySec=1s)  nohup-sleeper:pid=3816907 (sau 120s)
          → systemctl stop relay-cf-vn2wg → inactive
14:32:13  relay vn2wg qua Cloudflare = 502
14:32:53  watchdog (nhịp 45s) phát hiện  ← 41 giây sau khi dừng
14:32:58  ACTION: systemctl start relay-cf-vn2wg → active
14:33:05  Telegram PHÁT HIỆN  message_id=1656 ok=True http=200
14:33:07  Telegram KẾT QUẢ   message_id=1657 ok=True http=200
14:33:07  inbox: /var/lib/flowvpn-coord/inbox/{mac,windows,server}/…-health-watch-….md
14:34:12  backstop systemd timer nổ đúng hẹn: Started restore-relay-cf-vn2wg-…service
14:34:27  flowvpn-safe-status → 8/8 unit active · vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426
```

Test âm (guard từ chối đúng): `flowvpn-safe-stop relay-cf-vn1wg 30` và `… relay-cf-vn1hy 30`
⇒ cả hai **exit 3** (TỪ CHỐI), `relay-cf-vn1hy` và `relay-cf-vn1wg` vẫn `active`.
