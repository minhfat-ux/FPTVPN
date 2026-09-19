# BRIEF — WIN tham gia repo fBuddy mới (bootstrap, làm trước mọi việc UI/UX)

- **Người làm:** harness **Windows** (`AGENT_NAME=WIN`)
- **Bên giao / nghiệm thu:** MAC (`AGENT_NAME=MAC`)
- **Gate:** GATE 0 → GATE 1 · **Hạn:** trong ngày nhận được (2026-09-19)
- **Vì sao:** sản phẩm fBuddy đã tách sang repo riêng `minhfat-ux/fbuddy` (private). Sổ giao việc,
  luật, SRS, RAG đều nằm ở repo đó. Máy Windows hiện chỉ theo dõi repo cũ (`FPTVPN`) nên **chưa thấy**
  ba việc UI/UX đã giao (`T-20260919-01/02/03`).

## 1. Mục tiêu (đo được)

Windows clone repo mới, chạy watcher/bộ nghe tại đó, **ack 3 việc đang chờ**, và ghi một RAG entry
xác nhận đã tham gia ⇒ `node ops/verify-win-joined.mjs` trên Mac trả **PASS**.

## 2. Việc phải làm

1. Clone repo (cùng tài khoản GitHub `minhfat-ux`, quyền đã có):
   ```bat
   git clone git@github.com:minhfat-ux/fbuddy.git
   cd fbuddy
   ```
   (Nếu dùng HTTPS: `git clone https://github.com/minhfat-ux/fbuddy.git`)
2. Cài Node ≥ 20.11 nếu chưa có; **không cần** `npm install` cho các việc UI/UX GATE 1.
3. Tạo `.env.bus` tại gốc repo (file **của máy**, đã bị `.gitignore` chặn) với 2 dòng:
   `AGENT_BUS_URL=http://10.77.0.1:7799` và `AGENT_BUS_TOKEN=<lấy bằng: curl http://10.77.0.1:7799/token>`.
4. Đọc luật (bắt buộc, theo thứ tự): `AGENTS.md` → `docs/TASK-HANDOFF-RULES.md` →
   `docs/SESSION-HANDOFF-AND-RAG.md` → `docs/WORK-ENVIRONMENT.md`.
5. `node ops/task.mjs sync && node ops/task.mjs list` → phải thấy `T-20260919-01/02/03` (UI/UX).
6. Ack từng việc:
   ```bat
   set "AGENT_NAME=WIN" && node ops\task.mjs ack T-20260919-01 --note "đã nhận" --push
   ```
7. Chạy watcher/bộ nghe tại repo mới (để nhận việc về sau):
   `ops\agent-watch.cmd` (chạy liên tục) — hoặc `ops\agent-listen-hidden.vbs` cho kênh đẩy SSE.
8. Ghi RAG entry `.privatefbuddy/knowledge/AGENT_ENGINEERING/KAE-003-win-da-tham-gia.md` theo mẫu
   trong `docs/SESSION-HANDOFF-AND-RAG.md` §3, front-matter **phải có `verified_by: WIN`**, nội dung:
   máy nào, đường dẫn repo, watcher đang chạy hay không, đã ack việc nào. **Không** tự commit.

## 3. Phạm vi file (whitelist)

| Đường dẫn | Loại |
|---|---|
| `.privatefbuddy/knowledge/AGENT_ENGINEERING/KAE-003-win-da-tham-gia.md` | tạo mới |
| `.env.bus` | tạo mới — **file của máy, không commit** |

Ngoài hai đường dẫn trên: **không** sửa gì (việc UI/UX có whitelist riêng trong từng brief).

## 4. Tiêu chí nghiệm thu

- `node ops/task.mjs list` (trên Mac) thấy `acked` cho cả 3 việc.
- Có `KAE-003-win-da-tham-gia.md` với `verified_by: WIN`.
- `node ops/verify-win-joined.mjs` → **PASS** (3/3 việc có phản hồi + có RAG entry của WIN).

## 5. Lệnh nghiệm thu (Mac chạy đúng lệnh này)

```bash
node ops/verify-win-joined.mjs
```

## 6. Bằng chứng phải nộp (`done --evidence`)

1. Output thật của `node ops/task.mjs list` (thấy `acked` cho 3 việc).
2. Đường dẫn file RAG đã ghi.
3. Cho biết watcher/bộ nghe **đang chạy hay không** (và chạy bằng lệnh nào).
4. Xác nhận Node version trên máy Windows (`node -v`).

## 7. Phụ thuộc / rủi ro

- Repo **private**: nếu tài khoản GitHub trên máy Windows khác `minhfat-ux` thì phải được thêm
  collaborator trước (báo Mac).
- Không thể gọi VÀO máy Windows từ ngoài ⇒ nếu watcher không chạy thì việc sẽ nằm im
  (`list` sẽ cảnh báo `CHƯA thấy đánh thức/ack`).
