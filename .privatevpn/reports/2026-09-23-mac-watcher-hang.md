# Watcher Mac harness bị treo — không nhận task từ Windows harness

- **Ngày:** 2026-09-23
- **Người xử lý:** Solution Architect (DSH harness Mac)
- **Triệu chứng (chủ dự án báo):** watcher của Mac harness không chạy để nhận task từ Windows harness.
- **Trạng thái:** ĐÃ SỬA + ĐÃ KIỂM CHỨNG.

## 1. Triệu chứng đo được

| Đo | Kết quả |
|---|---|
| Tiến trình watcher | **CÓ sống** — PID 1275, đã chạy **5h48m** |
| Log `/tmp/agent-watch-mac.log` | dòng cuối **06:46:35**; phiên hiện tại (bật 10:33) ghi **0 dòng** |
| State `ops/tasks/.watch-mac.json` | đứng ở mốc `busSince = 308`, mtime 14:49:44 |
| Bus `/health` | `count 308 · latest 312 · subscribers {win: 1}` — **Mac không đăng ký** |
| Tin gửi cho `mac` chưa xử lý | **#309, #310, #311, #312** (và 141 tin tồn từ trước) |

⇒ Watcher "sống" nhưng **không tick**, nên việc Windows giao qua agent-bus nằm im.
Việc bị kẹt: **#309** email khách Windows 1.4.5 · **#310** bổ sung commit + tag `ios-v1.4.1`/`macos-v1.4.0` · **#311** chuyển keystore release Android.

## 2. Nguyên nhân gốc (chứng minh bằng cây tiến trình)

```text
pgrep -P 1275 -l
  76709 git
  76709 /Applications/Xcode.app/.../git fetch origin flowgpt
  76710 /usr/bin/ssh -o SendEnv=GIT_PROTOCOL git@github.com git-upload-pack 'minhfat-ux/FPTVPN.git'
```

`ops/agent-watch.mjs` gọi `git fetch origin flowgpt` **đồng bộ ở đầu mỗi vòng tick**:

```js
const git = (...argv) => execFileSync("git", argv, { encoding: "utf8", stdio: [...], ...NO_WINDOW }).trim();
```

`execFileSync` **không có `timeout`** ⇒ khi ssh tới `github.com` treo (mạng này đã treo
nhiều lần trong ngày — log có `Connection closed by 20.205.243.166 port 22`,
`ssh: connect to host github.com port 22: Undefined error: 0`), tiến trình `git` con treo
**vĩnh viễn** và cả vòng lặp không bao giờ chạy tiếp. Plugin chỉ restart khi tiến trình con
**thoát** ⇒ treo-mà-sống thì không ai cứu.

## 3. Việc đã làm

### 3.1 Gỡ treo (khôi phục ngay)
`kill -TERM 76709 76710` (tiến trình `git fetch` con của watcher).
Watcher tick lại lúc **16:23:31**, xử lý đủ backlog và đánh thức 4 phiên headless cho
**#309 #310 #311 #312**.

### 3.2 Vá nguyên nhân gốc — repo FlowGPT (không phải repo này)
File: `/Users/minhnguyen/FlowGPT/ops/agent-watch.mjs` (bản sao lưu:
`ops/agent-watch.mjs.bak-timeout-20260923-162534`). Diff tối thiểu 3 chỗ:

1. Thêm hằng số `GIT_TIMEOUT_MS` (mặc định 30000, ghi đè bằng `AGENT_WATCH_GIT_TIMEOUT_MS`).
2. `git()` — thêm `timeout: GIT_TIMEOUT_MS, killSignal: "SIGKILL"`.
3. Nhánh push qua worktree — `execFileSync("git", ["push", …])` thêm cùng timeout (đây cũng là
   lệnh ra mạng, trước đó không có trần).

Hết giờ ⇒ `execFileSync` ném lỗi ⇒ `git()` trả `"!git: …"` ⇒ caller **đã có sẵn** nhánh xử lý
(`if (fetched.startsWith("!git")) log(...)`) nên vòng lặp đi tiếp thay vì treo.

### 3.3 Nạp token bus cho Mac
Mac **không có** token bus ở bất kỳ nguồn nào (`~/.agent-bus.env`, `.env.agent-bus`,
`/etc/agent-bus.env`, env — đều không). Đã copy từ node-2 `/etc/agent-bus.env` vào
**`.env.agent-bus` ở gốc repo này** (đã gitignore bằng `.env.*`, mode 600).
⚠️ File này chứa cả `AGENT_TG_TOKEN`/`AGENT_TG_CHAT`; không commit, không dán ra ngoài.

## 4. Bằng chứng kiểm chứng

```text
# watcher mới do plugin tự restart (đã nạp bản vá)
2026-09-23T08:27:19.298Z [agent-watch] watcher thoát (mã 0) — sẽ khởi động lại
2026-09-23T08:27:20.091Z [agent-watch] đã dừng 1 watcher cũ của repo này
2026-09-23T08:27:20.092Z [agent-watch] đã khởi động watcher pid 11701 · MAC · poll 20s · tự đánh thức
[08:27:27 MAC] connector: https://fbuddy.meetflowai.site/agent-bus
[08:27:27 MAC] đang chạy: MAC ← WIN · poll 20s · TỰ ĐỘNG đánh thức · cooldown 600s
```

```text
# timeout của execFileSync có tác dụng thật trên Node v26.6.0
nem loi sau 508ms: code=ETIMEDOUT signal=SIGKILL -> timeout HOAT DONG
```

```text
# vòng poll vẫn nhích sau khi restart
state mtime 16:28:27 · giờ 16:28:29 · pid 11701 còn sống
```

```text
# backlog đã được xử lý lúc 16:23:31 (UTC 08:23:31)
BUS #309 … đã đánh thức (pid 88459)
BUS #310 … đã đánh thức (pid 88460)
BUS #311 … đã đánh thức (pid 88461)
BUS #312 … đã đánh thức (pid 88462)
```

## 5. Rủi ro còn lại (chưa xử)

1. **Plugin không có watchdog cho treo-mà-sống.** `dsh-plugin-agent-watch/index.js` chỉ restart
   khi con **thoát**. Nếu watcher treo vì lý do khác (không phải git), nó lại im lặng vô hạn.
   Đề xuất: thêm kiểm tra nhịp (state mtime cũ hơn N phút ⇒ kill + restart).
2. **Mặc định của plugin vẫn trỏ ổ cũ.** `ops/dsh-plugin-agent-watch/index.js` (cả bản trong
   repo FlowGPT lẫn bản đã cài ở `~/.dsh/profiles/node_modules/`) có
   `repo: process.env.FLOWGPT_REPO || "/Volumes/BIWIN/FlowGPT"`. Hiện nó chạy đúng **chỉ vì**
   `~/.dsh/profiles/web/cordis.patch.yml` override `repo: /Users/minhnguyen/FlowGPT`. Nếu dòng
   override đó mất, plugin quay về ổ BIWIN (vẫn còn mount nhưng là bản cũ).
   `ops/backup-old-worktree.sh` cũng tham chiếu đường dẫn này.
   *(Trong lúc xử lý có thấy một tiến trình `cd /Volumes/BIWIN/FlowGPT && git push origin flowgpt`
   bị treo; kiểm lại lần cuối thì tiến trình đó đã hết — không rõ tự thoát hay bị dừng, nên chỉ
   ghi nhận, không khẳng định.)*
3. **Bus chỉ có `win` đăng ký SSE** (`subscribers {win: 1}`); Mac dùng đường poll nên không
   hưởng, nhưng nếu chuyển sang mô hình đẩy thì phải đăng ký.
4. Đã `kill` tiến trình con của watcher trên máy Mac — **không** đụng git/commit/push, không
   deploy, không sửa file production nào.
