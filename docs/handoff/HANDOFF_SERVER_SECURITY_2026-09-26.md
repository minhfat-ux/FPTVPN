# HANDOFF — Lấy lại đường vào server & siết bảo vệ (26/09/2026 ~18:40–18:50 +07)

> Trạng thái: **ĐÃ XONG** phần lấy lại đường vào + autoban; còn 3 việc nhỏ ghi ở §4.

## 1. Vì sao vào được lại

- **node-1 vừa được reboot** (lúc đo: `up 14 min`) ⇒ hàng đợi sshd được xả, `iptables` về `-P INPUT ACCEPT`.
- Đường **công khai** `ssh -i .tmp/flowvpn_support_page_ed25519 root@103.173.155.50` **vào được trở lại**
  (trước đó timeout/banner vì sshd bị đợt quét làm ngập). Đường **Tailscale** cũng mở lại được (job break-glass
  vào được bằng cả hai: `TS 100.76.147.111` try=36 lúc `11:40:56Z`).
- Từ node-1 nhảy node-2 OK bằng `/root/.ssh/id_ed25519`.

## 2. Trạng thái thật sau khi vào (đo tại chỗ)

| Hạng mục | node-1 (`103.173.155.50`) | node-2 (`165.101.114.162`) |
|---|---|---|
| uptime | 14 phút (vừa reboot) | 17 ngày |
| sshd | `passwordauthentication no` · `permitrootlogin without-password` · `maxstartups 10:30:100` | `passwordauthentication no` · `permitrootlogin without-password` · `maxstartups 10:30:60` |
| Kết nối :22 | 3 | 2 |
| Thất bại xác thực 60 phút | **2** (trước 26/09 là 3.610+ cùng kỳ) | **0** |
| `iptables -S INPUT` | `-P INPUT ACCEPT` + chain `ts-input` | `-P INPUT ACCEPT` (chỉ còn rule FORWARD wg0) |
| Autoban | **vừa nhân bản từ node-2, xong** | `flowvpn-autoban.timer` active/enabled (2 phút/lần) |
| Watchdog đường khách | — | `flowvpn-health-watch.timer` active/enabled · log 18:41:50 `OK: mọi dịch vụ đường khách active · 4 relay = 426` |
| `flowvpn-safe-status` | — | **TẤT CẢ ĐẠT** (vn1hy/vn2hy/vn1wg/vn2wg = `426`) |

**Đợt quét đã LẮNG**: node-1 từ 3.610+ lần thất bại (26/09 sáng) xuống **2 lần/60 phút**; node-2 = **0**.

## 3. Việc đã làm

1. **Bàn giao inbox** (qua node-1 → node-2): `HANDOFF_MAINLINE_INTEGRITY_2026-09-26.md` (5.608 B) →
   `/var/lib/flowvpn-coord/inbox/{mac,server,windows}/20260926T114219Z-mac-mainline-integrity.md`
   + ping Telegram (`ok=True`).
2. **Nhân bản autoban sang node-1** (`/usr/local/bin/flowvpn-autoban` 2.419 B + `.service`/`.timer` chép từ node-2):
   `enabled` + chạy 2 phút/lần; đã chạy thử 2 lần: **exit 0**, chưa ban ai (đúng, vì chưa có IP vượt ngưỡng).
   Tạo `/etc/iptables/` để script lưu được rules (`/etc/iptables/rules.v4` 1.798 B) — trước đó script **lỗi exit 1** vì thiếu thư mục.
   Ngưỡng giữ nguyên: **>20 lần thất bại/60 phút ⇒ ban 24h; tái phạm ≥3 lần ⇒ vĩnh viễn**; whitelist `103.173.155.50`,
   `165.101.114.162`, `100.76.147.111`, `127.0.0.1` + 15 dải Cloudflare.
3. **Gửi abuse report**: 4/4 thành công (xem `docs/incidents/abuse-report-2026-09-26.md`).

## 4. Còn lại (chưa làm — cần chủ dự án quyết)

1. **Cổng còn hở trên node-1**: `0.0.0.0:9444` = `/root/wgrelay.js` (**đường khách WireGuard — KHÔNG được đóng**),
   `*:3000` = `/usr/bin/node server.js` (cần xác định là gì trước khi đóng/giới hạn), `0.0.0.0:22` (đã khoá mật khẩu).
   Các cổng khác chỉ nghe localhost hoặc trên IP tailnet.
2. **`iptables -P INPUT ACCEPT` ở cả hai node** — "đóng cửa bị quét" mới dừng ở mức autoban; muốn chặn hẳn theo whitelist
   phải làm **có dead-man switch tách phiên** (AGENTS §7e.1) và **giữ mở 80/443/9444** cho khách.
3. **4 dải chưa có đầu mối abuse** (RDAP không trả email): AS198364, AS17665, AS48090, AS216014.
