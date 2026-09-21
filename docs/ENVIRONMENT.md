# Môi trường làm việc — bản đồ cụ thể để bàn giao

> Cập nhật: 2026-09-21. Bản đồ **cổng/service** ở [`PORTS-AND-SERVICES.md`](PORTS-AND-SERVICES.md);
> ở đây là **môi trường**: máy nào, đường dẫn nào, chạy cái gì, và những sự cố đã gặp thật.

## 1. Máy và đường dẫn

| Máy | Định danh | Vai | Ghi chú |
|---|---|---|---|
| MacBook Air (của anh Minh) | `MacBook-Air-2.local` | **Đầu** — thiết kế, deploy, nghiệm thu | Bản làm việc: `~/FlowGPT` (ổ trong) |
| node-2 | `165.101.114.162` · hostname `fcnvps2` | **Chạy thật** — fBuddy web+API, agent-bus, Caddy | SSH: `-i ~/.ssh/fpt_vpn_node` |
| node-1 | `103.173.155.50` · VPN `10.77.0.1` | VPN + relay + một phần backend | SSH qua tailnet `100.76.147.111`, key `~/.ssh/fpt_tunnel` |
| Windows (văn phòng) | `DESKTOP-852P1LT` | **Thợ thi công** — harness WIN | Gọi ra ngoài được, không gọi vào được |

**Bản làm việc đã chuyển sang ổ trong** `~/FlowGPT`. Ổ ngoài `BIWIN` (exFAT, `/Volumes/BIWIN/FlowGPT`)
đang **hỏng**: xem §8. Đừng đặt bản làm việc chính trên ổ đó nữa — mỗi lần nó tách giữa lúc deploy là
một lần dễ sinh trạng thái nửa vời.

## 2. Chạy và deploy

```bash
bash ops/deploy-node2.sh --all       # build web + đẩy NGUYÊN GÓI server rồi restart
bash ops/deploy-node2.sh --server    # chỉ server
bash ops/deploy-node2.sh --web       # chỉ web
node ops/task.mjs list|show|ack|done|verify     # sổ giao việc
```

Quy tắc số một: **không bao giờ `scp` từng file rồi restart**. Đã gặp thật: `routes.js` mới đi kèm
`skills/hub.js` cũ ⇒ `SyntaxError: does not provide an export named 'HUB_KINDS'` ⇒ service crash-loop,
web 502. Deploy nguyên gói (tar) + `node --check` + kiểm tra cổng/API mới là đường đúng.

## 3. Dữ liệu và sao lưu

- DB thật: `/var/lib/fbuddy/fbuddy.db` (do `/etc/fbuddy/fbuddy.env` đặt `FBUDDY_DATA_DIR`).
  `/opt/fbuddy/data/fbuddy.db` là DB rác 0 mục — đừng nhầm.
- `ops/backup-db.sh` + `fbuddy-backup.timer`: `VACUUM INTO` (nhất quán khi app đang ghi) → gzip →
  giữ 14 bản ở `/var/backups/fbuddy/`, chạy 4 lần/ngày (00:15, 06:15, 12:15, 18:15).
- Mọi lần deploy đều tự sao lưu `/opt/fbuddy/server/src` sang `/root/backup-src`.

## 4. Job cập nhật tin cho trợ lý

- `ops/news-refresh.mjs` + `fbuddy-news.timer`: 2 lần/ngày (06:05, 18:05). RSS của VnExpress, Tuổi Trẻ,
  Thanh Niên, VietnamPlus (TTXVN), Nhân Dân + OpenAI, Google DeepMind, Hugging Face, TechCrunch AI,
  The Verge AI, MIT Technology Review, Ars Technica, Hacker News → bảng `news_items`.
- `server/src/news.js` ghép khối "TIN ĐÃ LẤY VỀ" khi câu hỏi chạm thời sự; công cụ `tin_moi` để tra sâu.
- Nguồn đã dò và **bỏ** (đừng thêm lại): `vietnamnet.vn/rss/*` (404/301), `chinhphu.vn/rss/*` (404 —
  tin chính phủ tra qua researcher hồ sơ `chinh-phu`), `vneconomy.vn/rss/*` (feed rỗng), arXiv RSS
  (rỗng), `anthropic.com/rss.xml` (404), VentureBeat (429 liên tục).

## 5. Phối hợp hai harness

- **Connector**: `https://fbuddy.meetflowai.site/agent-bus` (service `agent-bus` trên node-2, cổng 7799).
  `GET /subscribe` = kênh ĐẨY (SSE) — bên kia giữ một kết nối mở, **rảnh thì không chạy gì**.
  `GET /pull` là đường dự phòng. `GET /health` cho biết ai đang giữ kênh đẩy.
- **Sổ giao việc**: git, `ops/tasks/<id>/` (mỗi sự kiện một file, bất biến). `origin/flowgpt` là nguồn xác thực.
- **Watcher**: `ops/agent-watch.mjs` (Mac) và `ops/agent-listen.mjs` (Windows, chạy ẩn, có nhịp an toàn).
- **Presence**: ai đang nối connector. Sau khi test nên `POST /presence/reset` để không còn mục rác.
- **Telegram**: chỉ để **báo cho NGƯỜI**, không phải kênh máy–máy (hai bên dùng chung bot nên tin của
  bot không quay lại `getUpdates`).

## 6. Harness DSH trên Mac

- Cấu hình: `~/.dsh/settings.yaml`. Provider đang khai: **`openai`** và **`openrouter`**;
  model mặc định `deepseek-official/deepseek-v4-flash`.
- **Khoá API không cần export**: DSH có service `credentials` (`set`/`describe`/`unset`). Trang
  **Settings → API keys** (plugin động `apikey-1`) cho dán khoá OpenAI / OpenRouter, lưu vào kho đó và
  dùng được ngay ở lượt sau.
- Đã **bỏ `gpt-4` (8.192 token)**: nhỏ hơn cả system prompt + schema công cụ nên chọn là lỗi 100%
  ("exceeds the context window"). Muốn cửa sổ lớn: `gpt-4.1*` (1.05M), `gpt-5.x` (272k–400k).
- Vá cấu hình cho máy khác: `node ops/dsh-fix-providers.mjs --apply` (tự sao lưu, idempotent).

### Watcher gắn vào vòng đời `dsh web`

`~/.dsh/profiles/web/cordis.patch.yml` có một dòng plugin `dsh-plugin-agent-watch` giữ watcher sống
cùng `dsh web` (dsh web tắt là watcher tắt, không để tiến trình mồ côi). Sau khi ổ BIWIN hỏng, dòng
`repo` ở đó đã đổi sang **`/Users/minhnguyen/FlowGPT`** — harness nạp lại patch ngay, và log xác nhận
watcher chạy đúng đường dẫn mới:

```
[agent-watch] đã khởi động watcher pid 17579 · MAC · poll 20s · tự đánh thức
node /Users/minhnguyen/FlowGPT/ops/agent-watch.mjs --auto --interval 20
```

Đổi máy/đổi đường dẫn thì sửa đúng dòng `repo` này (file có sao lưu `.bak-<ngày-giờ>` cạnh đó).

## 7. Sự cố đã gặp — nhận biết trong 10 giây

| Hiện tượng | Nguyên nhân thật | Cách nhận biết |
|---|---|---|
| Web 502, service `activating (auto-restart)` | File lệch bộ sau khi deploy từng file | `journalctl -u fbuddy -n 30` → `SyntaxError ... does not provide an export named` |
| Hai link (fbuddy/flowgpt) hiện khác nhau, "chợ load DB cũ" | **Hai service cùng bind cổng 7790** (`flowgpt.service` cũ + `fbuddy.service`) | `ss -ltnp \| grep 7790` ✓ so `systemctl show fbuddy -p MainPID --value`; `readlink /proc/<pid>/cwd` |
| Mở link kia thấy "mất hết kỹ năng" | Chưa đăng nhập: token theo từng tên miền, cookie thiếu `Domain` | Cookie phải có `Domain=.meetflowai.site`; web tự hỏi `/api/auth/me` khi khởi động |
| Windows im lặng nhiều giờ | **VPN mất kết nối — KHÔNG phải sleep** (đã xác nhận 2026-09-21) | `/presence`: `win` tăng `secondsAgo`; `/health` mất subscriber `win` |
| Lệnh mount ổ treo, Disk Utility không hiện ổ | exFAT hỏng/không đọc nổi: `diskarbitrationd` kẹt ở "Checking file system hierarchy" | `diskutil info` trả lời nhanh nhưng `diskutil list`/`mount` treo ⇒ cần `sudo fsck_exfat -y /dev/rdiskXsY` |

## 8. Ổ ngoài BIWIN (đang hỏng)

- Nhận ở mức thiết bị (`BIWIN PD450 500GB`), nhưng `diskutil info` nhanh còn `diskutil list`/`mount`
  **treo**. Log cho thấy `diskarbitrationd` bắt đầu kiểm tra exFAT rồi **đứng ở bước quét cây thư mục**.
- Cần quyền root: `sudo pkill -9 diskutil` → `sudo fsck_exfat -y /dev/rdiskXsY` → `diskutil mount diskXsY`
  (đĩa **đổi số** sau mỗi lần cắm — kiểm bằng `diskutil info` trước, đừng chạy mù).
- Nếu fsck báo lỗi I/O: thử **hộp/bridge USB khác** trước khi kết luận ổ chết.
- Bản làm việc hiện ở `~/FlowGPT`; dữ liệu đã commit nằm trên GitHub (`flowgpt`, `deploy/handoff`).

### 8b. Đã vớt xong (2026-09-21) — và bài học "production đi trước repo"

- Người dùng chạy First Aid: ổ **mount được** nhưng báo `failed` (sửa chữa thất bại). Vớt được
  `~/backup-old-worktree-1126` (1311 tệp, trừ `web/dist`) và `~/rescue-delta-1127` (16 tệp lệch).
- **Bài học đắt**: cây git sạch `~/FlowGPT` **cũ hơn** bản đang chạy thật. Bản làm việc trên ổ có
  việc **chưa từng commit** mà production đã phục vụ: thư viện mẫu tài liệu trong Tài khoản,
  `web/public/connectors.json` (danh mục 103 kết nối) và bản researcher đầy đủ
  (`normalizeUrl`, cache RSS, `dedupeFindings`). Deploy từ cây sạch là **mất** những thứ đó.
- Cách phát hiện trong 10 giây — so cây repo với bản đang chạy TRƯỚC khi deploy:
  ```bash
  curl -s -o /dev/null -w '%{http_code} %{size_download}\n' https://fbuddy.meetflowai.site/connectors.json
  B=$(curl -s https://fbuddy.meetflowai.site/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  curl -s "https://fbuddy.meetflowai.site/$B" | grep -c "Mẫu của tôi"     # tính năng chỉ có ở bản mới
  ssh -i ~/.ssh/fpt_vpn_node root@165.101.114.162 "grep -c dedupeFindings /opt/fbuddy/server/src/researcher.js"
  ```
  Tệp nào production có mà repo không có (hoặc khác) thì phải vớt về **trước** khi deploy.
- Đã commit `5d44a1f` (kèm miễn trừ tra web cho câu hỏi về chính hệ sinh thái FlowTech — hồ sơ AI
  bắt nhầm chữ "AI" trong "MeetFlow AI" nên tra oan 10–20s), deploy node-2, `293/293` test xanh.
- Ổ BIWIN: chỉ **format sau khi** người dùng xác nhận không cần gì thêm; hai bản vớt vẫn nằm trong
  `$HOME` (không đụng tới).
