# Cầu nối cho harness Windows — việc UI/UX của app fBuddy

> **Đây là BẢN SAO.** Nguồn chính thức nằm ở repo **`minhfat-ux/fbuddy`** (private) tại
> `docs/tasks/` và `ops/`. Máy Windows bị chặn credential nên **chưa clone được repo đó**;
> thư mục này để Windows đọc được brief và biết tiêu chí nghiệm thu.

## Vì sao có thư mục này

Tin bus `#46` (2026-09-19) — Windows báo bị chặn:
1. repo `minhfat-ux/fbuddy` là **private**, credential helper bị sandbox chặn (`Win32 error 5`);
2. brief `docs/tasks/WIN-JOIN-fbuddy-repo.md` không có trong checkout `flowgpt` của Windows;
3. lệnh verify ghi đường dẫn macOS (`/Volumes/BIWIN/fbuddy`).

## Việc Windows nhận (3 việc UI/UX, GATE 1)

| Task (sổ repo fbuddy) | Brief | Lệnh nghiệm thu (Mac chạy) |
|---|---|---|
| `T-20260919-01` | [`UI-01-theme-tokens.md`](UI-01-theme-tokens.md) | `node ops/verify-design-parity.mjs --section theme` |
| `T-20260919-02` | [`UI-02-assets-logo-icon.md`](UI-02-assets-logo-icon.md) | `node ops/verify-design-parity.mjs --section assets` |
| `T-20260919-03` | [`UI-03-screen-specs.md`](UI-03-screen-specs.md) | `node ops/verify-design-parity.mjs --section specs` |

## Cách báo cáo khi KHÔNG push được git

Windows **không** cần push. Gửi tin qua connector (`agent-bus`) với đủ 4 phần:

```text
kind=ack|progress|blocked|done   ref=<task id>
cmd=<lệnh đã chạy> · kết quả=<output thật>
file=<đường dẫn file đã tạo/sửa> · rag=<đường dẫn RAG entry đã ghi>
chưa kiểm=<điều chưa kiểm được>
```

Mac sẽ **ghi hộ** sự kiện vào sổ git, kèm **id tin bus** làm bằng chứng
(`RULE-DELEGATE-FB-015` trong `docs/TASK-HANDOFF-RULES.md` của repo fbuddy).

## File nào cần đọc trước khi làm

Nguồn sự thật về giao diện nằm **trong repo fbuddy** (`docs/mobile/theme-tokens.json`,
`docs/mobile/THEME.md`, `web/src/styles.css`, `web/public/brand-*.png`). Nếu Windows chưa có repo đó,
**Mac sẽ gửi kèm** những file cần thiết qua connector hoặc qua thư mục này (báo Mac nếu thiếu).
