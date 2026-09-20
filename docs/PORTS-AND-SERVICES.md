# Cổng, service và tên miền — bản đồ vận hành (node-1 & node-2)

> Cập nhật: 2026-09-20. Mọi lần thêm service/cổng mới **phải cập nhật file này**.
> Sự cố thật đã xảy ra vì hai service cùng giành một cổng — xem §4.

## 1. Tên miền → Caddy → cổng → service

| Tên miền | Caddy (node-2) chuyển tới | Service giữ cổng | Thư mục code | DB |
|---|---|---|---|---|
| `fbuddy.meetflowai.site` | `127.0.0.1:7790` | `fbuddy.service` | `/opt/fbuddy` | `/var/lib/fbuddy/fbuddy.db` |
| `flowgpt.meetflowai.site` | `127.0.0.1:7790` | `fbuddy.service` | `/opt/fbuddy` | `/var/lib/fbuddy/fbuddy.db` |
| `console.meetflowai.site` | `127.0.0.1:7790` | `fbuddy.service` | `/opt/fbuddy` | `/var/lib/fbuddy/fbuddy.db` |
| `api.meetflowai.site` | `127.0.0.1:7778` (+ `/apkup`, `/relay/*`, `/ws/*`, `/meetflow/*`) | `flowvpn-cp` | — | — |
| `meetflowai.site`, `t1.`, `home.` | Caddy phục vụ trực tiếp | — | — | — |
| `meetflowai.io.vn`, `www.` | Caddy → theo block trong Caddyfile | — | — | — |
| `dhs.meetflowai.site`, `dhs-win.meetflowai.site` | `dhs.service` (node tương ứng) | — | — | — |

**Ba tên miền fbuddy/flowgpt/console dùng CHUNG một service và một DB.** Đây là chủ ý: một sản phẩm, một backend. Khác nhau chỉ ở tên miền, còn dữ liệu, phiên đăng nhập và chợ kỹ năng là một.

## 2. Bảng cổng trên node-2 (165.101.114.162 — `fcnvps2`)

| Cổng | Bind | Tiến trình | Việc |
|---|---|---|---|
| 22 | `0.0.0.0` | sshd | SSH |
| 80, 443 | `*` | caddy | Điểm vào HTTPS cho mọi tên miền |
| 2019 | `127.0.0.1` | caddy | API quản trị Caddy |
| 7778 | `*` | flowvpn-cp | Control plane VPNFlow |
| 7783, 7785, 7786, 7787 | `127.0.0.1` | relay-cf-* | Relay Cloudflare cho khách Trung Quốc |
| 7790 | `127.0.0.1` | **fbuddy.service** | fBuddy (web + API) — cấp cho fbuddy/flowgpt/console |
| 7799 | `0.0.0.0` | agent-bus | Connector giữa hai harness (Mac ↔ Windows) |
| 8081 | `127.0.0.1` | sing-box | VLESS over WebSocket |
| 8099 | `127.0.0.1` | python3 | Nhận APK upload (tạm) |
| 8443, 9444, 9445 | `0.0.0.0` | — | Dịch vụ VPN/relay riêng |
| 1080 | `127.0.0.1` | hysteria | Proxy nội bộ |

Quy ước: cổng nội bộ đặt ở `127.0.0.1` khi chỉ Caddy cần gọi; chỉ mở `0.0.0.0` khi có lý do rõ (agent-bus, VPN). **Một cổng chỉ thuộc MỘT service.**

## 3. Tên miền dùng chung phiên đăng nhập

Cookie phiên đặt `Domain=.meetflowai.site` (hàm `authCookieDomain()` trong `server/src/routes.js`, đổi bằng env `AUTH_COOKIE_DOMAIN`). Nhờ vậy đăng nhập ở `fbuddy.meetflowai.site` rồi mở `flowgpt.meetflowai.site` là đã đăng nhập — không phải đăng nhập lại. Web cũng gọi `/api/auth/me` ngay khi khởi động kể cả khi máy chưa có token trong `localStorage`, để nhận ra phiên nằm ở cookie.

## 4. SỰ CỐ ĐÃ GẶP (đọc để không lặp lại)

### 4.1 Hai service cùng giành cổng 7790 ⇒ "chợ load service cũ, DB cũ"
- **Hiện tượng:** `fbuddy.meetflowai.site` và `flowgpt.meetflowai.site` hiển thị khác nhau; chợ kỹ năng thiếu mục mới, có lúc trắng.
- **Nguyên nhân:** tồn tại HAI cây code — `/opt/flowgpt` (bản cũ, unit `flowgpt.service`) và `/opt/fbuddy` (bản mới, unit `fbuddy.service`) — **cả hai đều bind `127.0.0.1:7790`**. Tiến trình nào giành được cổng trước thì phục vụ TẤT CẢ tên miền; tiến trình kia lặp `activating (auto-restart)` vì `EADDRINUSE`. Ngày 2026-09-20 bản cũ đang giữ cổng nên cả hai link đều chạy code và bundle cũ.
- **Cách chữa:** dừng và dời unit cũ (`/etc/systemd/system/flowgpt.service` → `flowgpt.service.disabled-20260920`), `systemctl daemon-reload`, chỉ để `fbuddy.service` giữ 7790.
- **Cách phát hiện trong 10 giây:**
  ```bash
  ss -ltnp | grep 7790                     # PID nào đang giữ cổng
  systemctl show fbuddy -p MainPID --value # service của mình có phải PID đó không (0 = không)
  readlink /proc/<PID>/cwd                 # tiến trình chạy từ cây code nào
  ```

### 4.2 Crash loop vì file lệch bộ
- **Hiện tượng:** service `activating (auto-restart)`, restart counter tăng, web 502.
- **Nguyên nhân:** `routes.js` mới (`import { HUB_KINDS } from "./skills/hub.js"`) đi kèm `skills/hub.js` **cũ** ⇒ `SyntaxError: does not provide an export named 'HUB_KINDS'`. Xảy ra khi deploy **từng file** bằng nhiều lệnh `scp` và một lệnh dừng giữa chừng.
- **Cách chữa:** deploy **nguyên gói** rồi mới restart (xem `ops/deploy-node2.sh`), và đối chiếu md5 sau khi chuyển.

### 4.3 Bundle web bị bản khác đè
- **Hiện tượng:** UI cũ dù API đã mới (chợ không có tab theo `kind`).
- **Nguyên nhân:** `/opt/fbuddy/web/dist` bị một lần deploy khác ghi đè; `dist/index.html` trỏ bundle cũ.
- **Cách kiểm tra:** `grep -o "index-[A-Za-z0-9_-]*\.js" /opt/fbuddy/web/dist/index.html` rồi so với bản vừa build ở máy.

### 4.4 "Mất hết kỹ năng" chỉ vì chưa đăng nhập
- **Hiện tượng:** mở link này thấy chợ đầy đủ, mở link kia thấy trống.
- **Nguyên nhân:** `/api/hub` yêu cầu đăng nhập; token lưu trong `localStorage` **theo từng tên miền**, cookie lại thiếu `Domain` ⇒ link kia là khách chưa đăng nhập.
- **Cách chữa:** cookie dùng chung miền (§3) + web tự hỏi `/api/auth/me` khi khởi động.

## 5. Quy tắc deploy (bắt buộc)

```bash
# 1. Chạy từ máy Mac, trong repo
bash ops/deploy-node2.sh --server          # chỉ server
bash ops/deploy-node2.sh --web             # chỉ web (build + đẩy dist)
bash ops/deploy-node2.sh --all             # cả hai

# 2. Kiểm tra sau deploy (script tự làm, nhưng phải đọc kết quả)
ss -ltnp | grep 7790                        # đúng PID của fbuddy.service
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7790/
grep -o "index-[A-Za-z0-9_-]*\.js" /opt/fbuddy/web/dist/index.html
```

Nguyên tắc:
1. **Không bao giờ** `scp` từng file rồi restart — luôn `tar` một gói, giải nén, `node --check`, rồi mới restart.
2. Trước khi ghi đè, sao lưu `/opt/fbuddy/server/src` và DB.
3. Sau khi restart: kiểm tra `is-active`, đọc 20 dòng log cuối, và gọi thử API.
4. Một cổng — một service. Thêm service mới thì cấp cổng mới và ghi vào §2.

## 6. Sao lưu DB giữa hai node (đang triển khai)

Hai node: **node-1** `103.173.155.50` (VPN `10.77.0.1`) và **node-2** `165.101.114.162`.

- `ops/backup-db.sh`: dùng `VACUUM INTO` (bản sao nhất quán của SQLite, không cần dừng app) → `gzip` → giữ N bản gần nhất ở `/var/backups/fbuddy/` → `PRAGMA integrity_check` + đếm bảng, in kết quả để timer ghi log.
- `ops/fbuddy-backup.service` + `ops/fbuddy-backup.timer`: chạy 4 lần/ngày (00:15, 06:15, 12:15, 18:15) và trước mỗi lần deploy.
- Nhân bản sang node kia: `rsync -az --delete` qua SSH (node-2 → node-1), giữ cả bản tại chỗ để cứu được cả khi mất một node.
- Cảnh báo: chạy hỏng thì gửi Telegram (`ops/lib/telegram.mjs`), không im lặng.

## 6b. Job cập nhật tin tức hằng ngày (đang chạy)

`fbuddy-news.timer` chạy `ops/news-refresh.mjs` **2 lần/ngày (06:05 và 18:05)**: lấy RSS của báo
chính thống Việt Nam (VnExpress, Tuổi Trẻ, Thanh Niên, VietnamPlus/TTXVN, Nhân Dân) và nguồn
AI/công nghệ thế giới (OpenAI, Google DeepMind, Hugging Face, TechCrunch AI, The Verge AI, MIT
Technology Review, Ars Technica, Hacker News), ghi vào bảng `news_items` (dedupe theo URL).

Mặt đọc: `server/src/news.js` — ghép khối "TIN ĐÃ LẤY VỀ" vào prompt khi câu hỏi chạm tới thời sự,
và công cụ `tin_moi` để trợ lý tra sâu hơn. Mọi tin trả lời đều phải kèm **NGUỒN + GIỜ ĐĂNG**.

Nguồn đã bỏ sau khi dò thật (đừng thêm lại): `vietnamnet.vn/rss/*` (404/301), `chinhphu.vn/rss/*`
(404 — tin chính phủ tra qua researcher hồ sơ `chinh-phu`), `vneconomy.vn/rss/*` (feed rỗng),
`rss.arxiv.org` (rỗng — câu hỏi bài báo AI đã có researcher gọi arXiv API), `anthropic.com/rss.xml`
(404), `venturebeat.com/.../feed/` (429 liên tục).

Kiểm tra: `systemctl list-timers fbuddy-news.timer` · `journalctl -u fbuddy-news -n 20`.

## 7. Health check & cân bằng tải (thiết kế)

SQLite **không** dùng chung được cho nhiều node ghi đồng thời, nên không làm active-active. Mô hình đúng:

- **Primary/standby**: node-2 chạy `fbuddy.service` (ghi), node-1 chạy bản sao chỉ đọc, DB đồng bộ liên tục (khuyến nghị **Litestream** đẩy WAL lên object storage; phương án nhẹ là `rsync` theo lịch ở §6).
- **Health endpoint**: `GET /api/health` trả `{ ok, db: "ok"|"error", version, uptime }` — có kiểm tra đọc DB thật, không chỉ trả 200.
- **Caddy chọn upstream theo sức khoẻ** (khi đã có node-1 dựng bản sao):
  ```
  fbuddy.meetflowai.site {
      reverse_proxy 127.0.0.1:7790 10.77.0.1:7790 {
          lb_policy first
          health_uri /api/health
          health_interval 10s
          health_timeout 3s
          fail_duration 30s
      }
  }
  ```
  `lb_policy first` = luôn dùng node-2 khi nó khoẻ, chỉ nhảy sang node-1 khi node-2 chết (đúng với SQLite, tránh hai bên cùng ghi).
- **Giám sát**: một timer gọi `/api/health` mỗi phút; 3 lần hỏng liên tiếp thì báo Telegram kèm tên node.
