# AGENTS.md — luật bắt buộc cho MỌI agent làm việc trong repo này

> File này được nạp tự động khi một agent (opencode, codebuddy, Codex, …) mở repo.
> Đọc hết trước khi sửa bất kỳ file nào. Nếu brief bạn nhận **xung đột** với file này → **dừng lại và báo**, đừng tự quyết.

## 0. Vai trò
- **Agent chính (DSH/main agent) = người giao task, review, commit, push, deploy.** Chịu trách nhiệm cuối.
- **Bạn (worker) = chỉ sửa file trong phạm vi được giao.** Bạn KHÔNG sở hữu trạng thái cuối của repo.
- Chủ dự án (người) là người quyết định cuối cùng.

## 1. Cấm tuyệt đối
- ❌ `git add/commit/push/checkout/merge/rebase/stash` — mọi thao tác git. Agent chính làm việc đó.
- ❌ `ssh`, `scp`, sửa file trên server production, gọi API production có thay đổi dữ liệu.
- ❌ Sửa file ngoài danh sách trong brief. Không "tiện tay" format lại, đổi tên, hay refactor file khác.
- ❌ Thêm dependency mới, đổi `package.json`/`build.gradle`/`Podfile` trừ khi brief yêu cầu rõ.
- ❌ Đưa secret/credential/token/khoá riêng vào code, doc, log, hay nội dung báo cáo. Nếu thấy secret đang bị lộ → báo, KHÔNG copy nó vào chỗ khác.
- ❌ Nới lỏng test (đổi assertion thành luôn-đúng, xoá case, `skip`) để "cho pass".

## 2. Nguồn sự thật (theo thứ tự)
1. Code production trong repo.
2. Docs repo-backed (`docs/**`), đặc biệt `docs/SRS.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`.
3. `.privatevpn/status/*.json` (trạng thái requirement/bug).
4. Chat/lịch sử hội thoại = **context, không phải sự thật**.

Nếu brief nói một đằng, code nói một nẻo → **theo code**, và ghi rõ phát hiện đó trong báo cáo.

## 3. Convention bắt buộc
- Đọc thêm: `docs/templates/agentic-project/RULES.md`, `docs/AGENTIC_PROJECT_WORKFLOW.md` (§5, §10b), `docs/DEVELOPMENT.md` (§4 code conventions, §5c Android, §6 commit conventions).
- **Diff tối thiểu**: chỉ đụng đúng phần cần thiết; giữ nguyên style, naming, thứ tự import của file xung quanh.
- **Comment**: chỉ thêm khi thực sự cần giải thích "vì sao"; viết cùng ngôn ngữ với comment xung quanh (repo này thường dùng tiếng Việt cho ghi chú nghiệp vụ, tiếng Anh cho code/API).
- **Test**: control-plane dùng Node built-in runner — `node --test`, file `control-plane/test/*.test.js`, `import test from "node:test"; import assert from "node:assert/strict";`. Android/iOS: không thêm framework mới.
- **Ngôn ngữ commit/docs**: theo file đang sửa, không tự dịch lại toàn bộ.
- Không tạo file mới nếu chỉ cần sửa file có sẵn (trừ khi brief yêu cầu file mới).

## 4. Bằng chứng & báo cáo (bắt buộc)
- **Không có bằng chứng = chưa xong.** Kể lể ("tôi đã sửa xong") không phải bằng chứng.
- Báo cáo cuối theo mẫu `docs/templates/agentic-project/AGENT_HANDOFF.md`, gồm tối thiểu:
  1. **Files changed** — bảng `path | thay đổi gì`
  2. **Lệnh đã chạy + kết quả thật** (ví dụ `npm test` → `28 pass / 0 fail`) — dán output, không tóm tắt suông
  3. **Quyết định & giả định** (nếu có), kèm lý do
  4. **Điểm chưa chắc / việc còn lại / blocker**
- Không tự commit, không tự deploy. Bàn giao diff + bằng chứng cho agent chính để verify.

## 5. Khi bị chặn
Dừng và báo ngay (không tự xử theo hướng khác) nếu: brief mâu thuẫn với file này, cần quyền ngoài phạm vi, test không thể pass vì lý do ngoài phạm vi, hoặc phát hiện vấn đề bảo mật/rò rỉ dữ liệu.

## 6. Phối hợp nhiều máy — BẮT BUỘC trước khi sửa file
Repo này có nhiều agent sửa song song: **harness Mac (orchestrator)**, **harness Windows**, và
**agent trên server** (`/root/flowvpn-agent`). Trước khi sửa bất kỳ file nào, phải hỏi bảng việc
chung (nguồn sự thật: `node-2:/var/lib/flowvpn-coord/claims/`):

```bash
flowvpn-coord check <đường-dẫn-file> --owner <windows|mac|server>   # exit 1 = có người khác đang giữ
flowvpn-coord claim --owner <owner> --area <vùng> --files <p1,p2> --note "<việc đang làm>"
flowvpn-coord release --owner <owner> --area <vùng>
flowvpn-coord list
```

- `check` báo **XUNG DOT** (exit code 1) → **dừng lại**, nhắn orchestrator qua Telegram, không tự sửa.
- Đang làm thì phải giữ `claim`; xong thì `release`. Claim hết hạn sau 90 phút (gia hạn bằng
  cách `claim` lại).
- Chi tiết + lệnh cho từng máy: `.privatevpn/coordination/PROTOCOL.md`.
- Mã nguồn tool: `scripts/coord/flowvpn-coord.mjs` (`selftest` để tự kiểm tra logic).

### 6b. Vùng bảo vệ — chỉ harness Windows được sửa

Các đường dẫn sau **chỉ owner `windows`** được commit/deploy (xem `PROTOCOL.md` §8):

- `control-plane/src/home-page.js` (trang chủ `meetflowai.site`)
- `control-plane/src/index.js`, `control-plane/assets/**`
- `flowgpt/web/public/promo.*`

Máy khác cần thay đổi → xin handoff qua Telegram + đợi nhường claim. Hook `.githooks/pre-commit`
chặn cứng commit vào vùng này khi `coord.owner ≠ windows` (muốn ghi đè có ý thức:
`ALLOW_PROTECTED=1 git commit ...`). **Deploy control plane: commit trước, deploy sau.**
