# Agent Handoff

- **Agent:** worker (agent an toàn hạ tầng — node-2)
- **Task ID:** TASK-20260926-NODE2-BLACKLIST
- **Date:** 2026-09-26
- **Status:** **blocked**

## Summary

Nhiệm vụ: geo-định vị các IP đang brute-force SSH vào node-2 (`165.101.114.162`), blacklist toàn bộ
bằng `ipset`/`nftables`, và dựng cơ chế tự blacklist bền vững (`flowvpn-autoban` + systemd timer).
**Không thực hiện được bước nào trên node-2**: sau **3 lần SSH cách nhau ≥60 giây** (08:00:0x ·
08:01:2x · 08:05:5x UTC) đều trả `Connection timed out during banner exchange`, đúng điều kiện dừng
mà chủ dự án đặt ra ("2–3 lần thử cách nhau ≥60 s ⇒ DỪNG và báo").

**Không có thay đổi nào được ghi lên node-2.** Không rule iptables/ipset nào được thêm/xoá bởi agent
này; không file nào trong repo bị sửa (ngoài chính báo cáo này). Vì vậy không có rủi ro mới do agent
gây ra, nhưng **mục §0 khẩn (đưa whitelist lên đầu chuỗi INPUT) vẫn CHƯA được thi hành**.

Chẩn đoán (có bằng chứng, xem §Evidence): tunnel và return-path **khỏe** — IP thô `1.1.1.1` trả `301`,
`https://api.meetflowai.site/relay/vn1hy` trả `426`. Nhưng **mọi cổng của chính node-2** (80/443/22)
bắt tay TCP xong rồi **không trả một byte nào**; `103.173.155.50:22` (node-1, đi qua cùng tunnel) cũng
vậy. ⇒ Nguyên nhân nằm ở **rule INPUT trên node-2** (đúng lỗi thứ tự rule đã mô tả), **không phải**
nghẽn tunnel, không phải máy Mac, không phải rate-limit phía client.

## Files Changed

| Path | Change Summary |
|---|---|
| `evidence/2026-09-26-node2-ssh-blacklist-blocked.md` | Báo cáo trạng thái blocked + chẩn đoán + bằng chứng (file này) |

> Không sửa `docs/SERVER_RECOVERY_RUNBOOK.md` (mục "Blacklist & chống brute-force") vì cơ chế **chưa
> được triển khai**; viết tài liệu cho thứ chưa tồn tại sẽ gây hiểu sai. Sẽ bổ sung ngay sau khi có
> đường vào node-2.

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Dừng vector SSH sau 3 lần thử cách nhau ≥60 s | Đúng điều kiện dừng của chủ dự án; thử tiếp còn ghi thêm vào danh sách `recent --name sshbf` trên node-2, làm khoá sâu hơn | báo cáo này |
| **Không** tự dùng đường khác (Tailscale/node-1) | Brief ghi rõ: "Nếu không vào được node-2 thì DỪNG và báo rõ trạng thái, đừng tự tìm cách khác" | báo cáo này |
| Không viết mục runbook khi cơ chế chưa tồn tại | Tránh tài liệu mô tả thứ chưa được triển khai | báo cáo này |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20260926-001 | command_verified | failed — SSH node-2 ×3: `Connection timed out during banner exchange` |
| EVID-20260926-002 | command_verified | passed — 4 relay `=426`, tunnel macOS `Connected` |
| EVID-20260926-003 | command_verified | passed — `1.1.1.1` IP thô trả `301` ⇒ tunnel + return-path khỏe |
| EVID-20260926-004 | command_verified | failed — node-2 80/443/22 + node-1:22: TCP OPEN, **0 byte** dữ liệu trả về |

## Validation Performed

```bash
# 1) Đường SSH được phép (3 lần, cách nhau ≥60 s)
ssh -i ~/.ssh/fpt_vpn_node -o BatchMode=yes -o ConnectTimeout=20..30 root@165.101.114.162 'hostname; uptime'
```

Result:

```text
Connection timed out during banner exchange
Connection to 165.101.114.162 port 22 timed out
[exit=255]     # ×3, lúc 08:00:0x · 08:01:2x · 08:05:5x UTC
```

```bash
# 2) Đường khách (không bị ảnh hưởng)
for r in vn1hy vn2hy vn1wg vn2wg; do curl -s -o /dev/null -w "$r=%{http_code} " https://api.meetflowai.site/relay/$r; done
scutil --nc status "VPNFlow" | head -1
```

Result:

```text
vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426
Connected
```

```bash
# 3) Phân biệt "nghẽn tunnel" vs "chặn phía node-2"
ping -c 5 165.101.114.162          # 5/5, 0.0% loss, RTT 0.464–0.875 ms
route get 165.101.114.162          # interface: utun7  ⇒ điều khiển ĐI QUA tunnel (AGENTS.md §7e luật 2)
nc -z -v 165.101.114.162 22        # succeeded  ⇒ BẮT TAY TCP THÀNH CÔNG
nc -w 10 165.101.114.162 22        # RỖNG ⇒ KHÔNG có banner "SSH-2.0-…"
nc -z -G 8 -v 103.173.155.50 22    # node-1: succeeded, banner RỖNG
curl -s -m 10 -o /dev/null -w '%{http_code}' http://1.1.1.1/     # 301
curl -s -o /dev/null -w '%{http_code} %{remote_ip}' https://api.meetflowai.site/relay/vn1hy  # 426 172.67.175.138
route get 100.76.147.111           # interface: utun7  ⇒ node-1 (Tailscale) ĐANG bị route vào tunnel
tailscale status                   # "Tailscale is stopped."
ifconfig utun7                     # inet 100.100.100.101, POINTOPOINT, mtu 1300
```

Result:

```text
node-2 165.101.114.162:80  tcp=OPEN banner=NONE
node-2 165.101.114.162:443 tcp=OPEN banner=NONE
node-2 165.101.114.162:22  tcp=OPEN banner=NONE
node-1 103.173.155.50:22   tcp=OPEN banner=NONE
```

## Validation Not Performed

| Check | Reason |
|---|---|
| Đếm `auth.log*` + `journalctl -u ssh --since "-24h"`, top 30 IP + dải /24 | Không có đường vào node-2 |
| Geo/ASN (`curl https://ipinfo.io/<ip>/json`) cho từng IP | Cần danh sách đếm thật từ node-2 trước |
| Tạo `ipset`/`nftables set blacklist` + rule DROP ở INPUT | Không có đường vào node-2 |
| `/usr/local/bin/flowvpn-autoban` + systemd timer | Không có đường vào node-2 |
| `fail2ban` (jail `sshd` maxretry 4 / bantime 24h / findtime 10m / `ignoreip`) | Chưa kiểm được đã cài sẵn hay chưa |
| Lưu bền qua reboot (`iptables-save`, `ipset save`, `rules.v4`, `rc.local`) | Không có đường vào node-2 |
| Kiểm chứng: gói DROP tăng, `Failed password` giảm, test tự ban 1 IP vô hại | Không có đường vào node-2 |
| Mục "Blacklist & chống brute-force" trong `docs/SERVER_RECOVERY_RUNBOOK.md` | Cơ chế chưa triển khai — viết trước sẽ sai |

## Risks

- **Đường SSH quản trị qua tunnel đang hỏng** (bắt tay xong, không có banner). Mọi agent/harness đi
  qua tunnel đều sẽ hỏng giống hệt — không chỉ agent này.
- **Chicken-and-egg:** cách sửa (§0 đưa whitelist ACCEPT lên đầu INPUT) lại **đòi hỏi** phải vào được
  node-2. Nếu DROP ở vị trí 3 chặn cả nguồn whitelist thì `node-1 → node-2` cũng sẽ hỏng, và đường
  duy nhất còn lại là **console/VNC nhà cung cấp** (runbook §4.2).
- **Bẫy route:** `100.76.147.111` (node-1) hiện đi qua `utun7`. Chỉ gõ `ssh root@103.173.155.50` lúc
  này sẽ **đi qua node-2** và chết y hệt. Phải `tailscale up` **trước**, rồi xác nhận
  `route get 100.76.147.111` **không còn** `utun7`.
- **Chưa có blacklist nào được áp** ⇒ các IP brute-force vẫn đang thử đăng nhập. Rủi ro bảo mật chưa
  được giảm.
- Đường khách **không** bị ảnh hưởng (4 relay `426`, tunnel `Connected`) — đây thuần là sự cố đường
  quản trị.

## Open Questions

- DROP ở vị trí 3 trên node-2 khớp điều kiện gì (nguồn cụ thể, `--ctstate`, hay module `recent`)?
  Biết được thì xác định ngay `node-1 → node-2` có cứu được hay phải dùng console.
- Yêu cầu §0 nới rate-limit SSH thành **12/60s** thay cho `--hitcount 6` — cần xác nhận rule cũ đã
  được xoá hay còn sót bản trùng.

## Next Recommended Step

1. Trên Mac: `tailscale up`; xác nhận `route get 100.76.147.111` **không còn** `utun7`.
2. `ssh root@100.76.147.111` (node-1) → từ node-1 `ssh root@165.101.114.162`. Nếu vẫn chết sau bắt
   tay ⇒ dùng **console/VNC nhà cung cấp** (runbook §4.2).
3. Chạy **ngay** block §0, kèm **dead-man switch tách phiên đặt TRƯỚC** khi đụng INPUT:
   ```bash
   nohup sh -c 'sleep 300; iptables -F INPUT; iptables -P INPUT ACCEPT' >/dev/null 2>&1 & echo deadman-scheduled
   for ip in 103.173.155.50 100.76.147.111 165.101.114.162 127.0.0.1; do iptables -I INPUT 1 -s "$ip" -j ACCEPT; done
   iptables -L INPUT -n --line-numbers | head -12
   ```
   (không có dòng `deadman-scheduled` ⇒ **không được** đụng INPUT)
4. Báo lại để agent này chạy tiếp toàn bộ §2 (đếm log + top 30 + geo/ASN → `ipset` blacklist →
   `flowvpn-autoban` → `fail2ban` → lưu bền → kiểm chứng → mục runbook).

### Luật ban đã chốt (agent đã ghi nhận, sẽ code khi có đường vào)

- Ngưỡng: **>20 lần đăng nhập thất bại / IP trong cửa sổ 60 phút** (`Failed password` |
  `Invalid user` | `Connection closed by authenticating user`, `journalctl -u ssh --since "-60min"`);
  lần thứ **21** ⇒ ban ở nhịp timer kế tiếp. Timer đề xuất **2 phút** (thay 5 phút) cho sát ngưỡng.
- Thời hạn: **24 h** lần đầu; **tái phạm ≥3 lần ⇒ ban vĩnh viễn**
  (`/var/lib/flowvpn-autoban/permanent.json`), vẫn ghi log + Telegram.
- **Whitelist cứng, kiểm TRƯỚC khi ban:** `103.173.155.50`, `165.101.114.162`, `100.76.147.111`,
  `127.0.0.1`, và toàn bộ dải Cloudflare (`173.245.48.0/20`, `103.21.244.0/22`, `103.22.200.0/22`,
  `103.31.4.0/22`, `141.101.64.0/18`, `108.162.192.0/18`, `190.93.240.0/20`, `188.114.96.0/20`,
  `197.234.240.0/22`, `198.41.128.0/17`, `162.158.0.0/15`, `104.16.0.0/13`, `104.24.0.0/14`,
  `172.64.0.0/13`, `131.0.72.0/22`).
- Chuẩn hoá `::ffff:a.b.c.d` → IPv4 trước khi đếm/ban; báo cáo 2 tin Telegram (PHÁT HIỆN + KẾT QUẢ) +
  bản lưu 3 inbox (`mac`/`windows`/`server`); ESCALATE nếu `ipset`/`iptables` lỗi.
