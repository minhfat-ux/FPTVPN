# Giao thức giao việc & xác thực giữa hai harness (Mac ↔ Windows)

> Mục đích: **không còn cảnh "đã ping mà không biết bên kia có nhận và có làm hay không"**.
> Mọi việc giao nhau đi qua sổ `ops/tasks/` trong git, có trạng thái và có bằng chứng.

## 1. Vì sao không dùng Telegram làm kênh xác thực

Hai harness gửi tin bằng **cùng một bot**. Telegram **không trả lại** cho `getUpdates` những tin do
chính bot đó gửi ⇒ bên kia không đọc được tin của mình. Đã kiểm chứng: gửi được (`message_id` trả về)
nhưng `read` luôn rỗng.

Nên: **Telegram chỉ để "hú"** cho người thật biết có việc mới. **Kênh xác thực là GIT** — mỗi sự kiện
là một file được push lên `origin/flowgpt`, nên có **commit sha làm bằng chứng**, kiểm tra được, không
phải tin lời nhau.

## 2. Sổ giao việc

```
ops/tasks/<id>/<thời-gian>-<ai>-<loại>.json     # mỗi sự kiện 1 file, KHÔNG sửa file cũ
```

- Mỗi bên ghi file **mới** ⇒ không giẫm chân nhau, không xung đột merge.
- `<id>` dạng `T-YYYYMMDD-NN`. Trạng thái hiện tại = gộp các sự kiện theo thời gian.
- Loại sự kiện: `created`, `sent`, `acked`, `progress`, `blocked`, `done`, `verified`.

Trạng thái đi theo đường: `created → sent → acked → (progress) → done → verified`.
`verify --result fail` ⇒ `reopened`, phải ack + done lại.

## 3. Lệnh

```bash
# Bên GIAO (Mac)
node ops/task.mjs new --title "…" --to win --detail docs/X.md --verify "câu lệnh nghiệm thu" --due 2026-09-20
node ops/task.mjs send <id> --push --ping        # ghi "đã giao" + push git + hú Telegram
node ops/task.mjs verify <id> --result pass|fail --note "…" --push

# Bên NHẬN (Windows) — đặt AGENT_NAME=WIN
node ops/task.mjs ack <id> --note "đã nhận, làm trong hôm nay" --push
node ops/task.mjs progress <id> --note "xong 6/22 mục" --push
node ops/task.mjs blocked <id> --reason "thiếu token admin" --push
node ops/task.mjs done <id> --evidence "commit=…, cmd=…, kết quả=…" --push

# Cả hai
node ops/task.mjs list [--all]     # việc đang mở (mặc định) hoặc tất cả
node ops/task.mjs show <id>
node ops/task.mjs sync             # fetch + đọc sổ TỪ GIT (không đụng cây đang làm việc)
```

`--push` tự lo chuyện đẩy git: nếu cây chính bị lệch/dirty thì nó chép `ops/tasks/` sang một worktree
tạm của `origin/flowgpt`, commit rồi push — **không đụng tới cây đang làm việc của bên kia**.

## 4. Luật cứng (script từ chối nếu sai)

| Luật | Vì sao |
|---|---|
| Chỉ **bên nhận** được `ack` / `progress` / `done` / `blocked` | Không thể tự nhận việc thay nhau |
| Chỉ **bên giao** được `verify` | Người làm không tự nghiệm thu bài của mình |
| `verify --result pass` chỉ chạy **sau `done`** | Không "công nhận xong" khi chưa ai báo xong |
| `done` **bắt buộc** có `--evidence` | Bằng chứng: commit sha / câu lệnh đã chạy / file kết quả |
| `verify fail` mở lại việc | Việc chỉ khép khi bên giao đã kiểm chứng thật |
| Sai `AGENT_NAME` thì bị chặn | Tránh việc Mac tự ack hộ Windows |

## 5. Quy trình chuẩn cho một việc

1. **Mac**: `new` → `send --push --ping`. Git có commit chứa `created` + `sent`.
2. **Windows**: `sync` → thấy việc → `ack --push`. Git có commit `acked` ⇒ **đây là bằng chứng đã nhận**.
3. **Windows**: làm, thỉnh thoảng `progress --push`; xong thì `done --evidence --push`.
4. **Mac**: `sync` → thấy `done` → chạy đúng câu lệnh ở `--verify` (ví dụ `node ops/verify-rewrite.mjs`)
   → `verify --result pass --push`, hoặc `fail` kèm lý do để mở lại.

Việc **chỉ được coi là xong khi có `verified pass`**. Không có bước này thì nó vẫn nằm trong `list`.

## 6. Việc đang mở

`T-20260918-01` — Viết lại 22 mục nhập từ nguồn ngoài (14 chuyên gia VN/ĐNA + 8 kỹ năng Tencent).
Chi tiết: [`TASK-WINDOWS-REWRITE.md`](TASK-WINDOWS-REWRITE.md) · nghiệm thu:
`node ops/verify-rewrite.mjs` → cần 22/22 PASS (hiện 0/22).
