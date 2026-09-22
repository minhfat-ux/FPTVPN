# VIỆC T-20260921-01 — Nâng DSH harness lên 0.1.5-rc.1 + cài plugin AgentTeams

> Bên giao: **MAC** · Bên nhận: **WIN** · Mở ngày 21/09/2026.
> Mục đích: harness có bộ tool `agent_teams_*` để các session nhắn/điều phối được cho nhau.
> Câu nghiệm thu trong sổ: `dsh --version` ra `0.1.5-rc.1`; `dsh plugin --profile <profile> list` có
> `@nanmicoder/dsh-agent-teams@0.1.20`; một session liệt kê đủ **14 tool** `agent_teams_*`.

## 1. Trạng thái hai bên (21/09/2026)

| Bên | Phần 1 — harness | Phần 2 — plugin AgentTeams | Phần 3 — 14 tool |
|---|---|---|---|
| **MAC** | `0.1.5-rc.1` ✔ | profile `web`: `0.1.20` ✔ (đã pnpm-install) | cần restart harness + refresh trình duyệt rồi đếm |
| **WIN** | `0.1.5-rc.1` ✔ | ⛔ **VƯỚNG** `[EPERM]` khi cài | chưa |

## 2. Vì sao phải cài rồi restart

Plugin AgentTeams chỉ đăng ký tool khi được cài vào composition của profile
(`dsh.profile.bundles` trong `~/.dsh/profiles/<profile>/package.json`). Sau khi cài **phải tắt hẳn
harness của profile đó rồi mở lại**, sau đó **refresh trình duyệt** — client nạp một lần lúc khởi động.

## 3. Lệnh cài chuẩn (nguyên văn README plugin)

```sh
# 1) harness — bỏ qua nếu đã đúng bản
npm install --global @deepseek-ai/dsh@0.1.5-rc.1
dsh --version

# 2) plugin vào profile web, ghim đúng bản
dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.20
```

Rồi: **stop + restart harness**, cuối cùng **refresh trình duyệt**.

## 4. Vướng thật đã gặp trên WIN (21/09/2026 06:55)

WIN chạy đúng lệnh trên **từ trong một session harness** và bị:

```
[EPERM] ...\.dsh\profiles\web\_tmp_...
```

Nguyên nhân (không phải lỗi mạng, không phải sai phiên bản):

1. Session harness chạy dưới **file-sandbox mặc định `workspace-write`**: chỉ được ghi trong
   workspace (`FlowGPT`) và thư mục temp riêng; **mọi ghi ra `~/.dsh` đều bị từ chối**.
2. `dsh plugin add` cần ghi `~/.dsh/profiles/<profile>/` (pnpm tạo `_tmp_…` rồi đổi tên) ⇒ chết ngay tại đó.
3. Session bị watcher đánh thức chạy `dsh --profile headless` **không có kênh phê duyệt**, nên khi xin
   nâng lên `danger-full-access` thì **fail-closed** (`no approval channel is available`).

MAC gặp **đúng lỗi này** khi chạy `dsh` từ trong session (bằng chứng:
`EPERM: open '/Users/minhnguyen/.dsh/profiles/headless/cordis.yml'`).

**Kết luận:** không thể cài plugin từ *bên trong* một session đang bị sandbox. Phải chạy lệnh cài bằng
một tiến trình **ngoài harness**, hoặc nới sandbox của profile (xem §7).

## 5. Cách gỡ — chạy MỘT LẦN, NGOÀI harness

Trên **WIN** (mở `cmd`/PowerShell thường, **không phải** ô chat của harness):

```bat
cd <đường-dẫn-repo>\FlowGPT
git pull origin flowgpt
ops\install-agent-teams.cmd
```

> `git pull` trước để có `ops\install-agent-teams.cmd` + tài liệu này (commit `edce4e8`).

Trên **MAC/Linux**:

```sh
cd ~/FlowGPT && bash ops/install-agent-teams.sh
```

Script repo-local, **idempotent**:

1. in `dsh --version`;
2. `dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.20`;
3. `dsh plugin --profile web list`;
4. kiểm `~/.dsh/profiles/web/package.json` có dependency **và** bundle;
5. in 14 tên tool để đối chiếu, nhắc **restart harness + refresh trình duyệt**.

> Vì sao chạy tay lại được: tiến trình do người dùng mở **không** nằm dưới sandbox của harness ⇒ ghi
> `~/.dsh` bình thường. Đúng điều mà thông báo `blocked` của WIN đã đề nghị.

## 6. Nghiệm thu (3 điều)

```sh
dsh --version                                          # → 0.1.5-rc.1
dsh plugin --profile web list                          # → @nanmicoder/dsh-agent-teams 0.1.20
node -e "const p=require(require('os').homedir()+'/.dsh/profiles/web/package.json'); console.log(p.dependencies['@nanmicoder/dsh-agent-teams'], p.dsh.profile.bundles.includes('@nanmicoder/dsh-agent-teams'))"
```

Rồi trong **một session của profile web**, đếm đủ 14 tool (không phải `NONE`):

```
agent_teams_create        agent_teams_status          agent_teams_add_member
agent_teams_remove_member agent_teams_send_message    agent_teams_create_task
agent_teams_claim_task    agent_teams_update_task     agent_teams_reassign_task
agent_teams_amend_task    agent_teams_edit_plan       agent_teams_approve
agent_teams_resume        agent_teams_delete
```

## 7. Ghi chú kỹ thuật & cảnh báo

- **Tùy chọn nới sandbox** để session tự cài được: thêm vào `~/.dsh/profiles/<profile>/cordis.patch.yml`
  một overlay đặt `@deepseek-ai/dsh-sandbox-policy` `mode: danger-full-access` (hoặc
  `@deepseek-ai/dsh-permission-presets` `defaultPreset: danger-full-access`). **KHÔNG khuyến nghị mặc định**
  — nó bỏ hàng rào ghi file cho **mọi** tool call. Chỉ dùng khi thật cần và có người giám sát.
- **Doctor plugin báo lệch phiên bản nội bộ** trên MAC: CLI `0.1.5-rc.1` nhưng 230 gói con
  `@deepseek-ai/dsh-*` là `0.1.5-rc.2`. Câu nghiệm thu của việc này chỉ yêu cầu `dsh --version`, nên ghi
  lại để biết, **không** coi là điều kiện chặn.
- Plugin mount vào profile **web**. Session do watcher đánh thức chạy `dsh --profile headless` nên **không**
  có 14 tool (headless không nạp bundle này). Nếu muốn session bị đánh thức cũng có tool:
  `ops\install-agent-teams.cmd --profile headless` (tự cân nhắc — headless không có UI).

## 8. Bằng chứng cần ghi vào sổ

```sh
node ops/task.mjs done T-20260921-01 --evidence "commit=<sha>, cmd=ops\install-agent-teams.cmd, kết quả=<3 lệnh §6 + 14/14 tool>" --push
```

---

# PHỤ LỤC (MAC) — vì sao phải nâng host, và các lựa chọn khác

## A. Nguyên nhân gốc (đã kiểm tra, không phải phỏng đoán)

Host **0.1.1-rc.2** thiếu hẳn package `@deepseek-ai/dsh-api-session-controller`, nên **không có service
nào gửi được tin vào inbox của một session khác**. Các đường đã kiểm tra và loại trừ:

| Đường | Kết quả |
|---|---|
| `agentTeams` | Chỉ là *khai báo* trong catalog API của DSH (`dsh-tool-cordis`), **không package nào cài đặt** → `ctx.get('agentTeams')` trả `undefined` |
| `send_message` (tool có sẵn) | Chỉ gửi được cho subagent do **chính session đó** sinh ra. Gửi sang session khác (kể cả sau khi nâng host) đều bị từ chối: `belongs to another parent session` |
| `subagents.followup` | Yêu cầu phải là **session cha** của đích |
| `agentTeams.sendMessage` | Không dùng được vì service không mount |
| Event của Host | Đọc hết catalog Event: **không có** event nào đưa tin vào inbox session khác |
| `sessions.list()` / `sessionQuery` | Chỉ **đọc** được, không gửi được |

⇒ Không thể "nhắn cho session đang chạy" trên host cũ bằng bất kỳ đường nào. **Bắt buộc nâng host.**

## B. Bằng chứng bên MAC

| Bước | Lệnh | Kết quả |
|---|---|---|
| Cài pnpm (máy chưa có) | `npm install -g pnpm` | `pnpm 12.5.1` tại `/opt/homebrew/bin/pnpm` |
| Sao lưu cấu hình | `cp ~/.dsh/profiles/web/{package.json,cordis.patch.yml,cordis.yml,pnpm-workspace.yaml} ~/.dsh/backups/…` | `~/.dsh/backups/flowtech-agent-teams-20260921-143441/` |
| Nâng host | `npm install -g @deepseek-ai/dsh@0.1.5-rc.1` | `0.1.1-rc.2` → `0.1.5-rc.1` |
| Cài plugin | `dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.20` | vào `dsh.profile.bundles` của profile `web` |
| Kiểm composition | `dsh --profile web --dump-config \| grep -A3 agent-teams` | có row `id: agent-teams` (tổng 156 row) |
| Kiểm **runtime** | thêm plugin vào profile `headless`, chạy một lượt rồi gỡ ra | agent tự liệt kê **đủ 14 tool** `agent_teams_*`, gồm `agent_teams_send_message` |
| Sau restart | session `web` gọi `agent_teams_status` | trả lời đúng ngữ cảnh domain (tool đã sống) |

Chọn **`0.1.5-rc.1`** chứ không phải `0.1.5-rc.2`: peerDependencies của plugin ghi rõ
`"0.1.5-rc.1 || 0.1.2-rc.1 || 0.1.2-alpha.5 || 0.1.2-alpha.2"` — `rc.2` **không** nằm trong danh sách.
Còn `@huangjiangheng/dsh-cross-session` (3 tool `sessions_list/read/send`, đúng kiểu "nhắn session khác")
thì lại yêu cầu host `0.1.5-rc.2` và **không có trên npm**, phải cài từ GitHub.

## C. Hai lựa chọn khác nếu sau này cần

| Gói | Cho gì | Ghi chú |
|---|---|---|
| `@deepseek-ai/dsh-experimental-agent-team` + `@deepseek-ai/dsh-experimental-tool-agent-team` | Bản **chính thức**, cung cấp đúng service `agentTeams` mà catalog DSH khai báo | Đang ở `0.1.5-alpha.2`, cần host `^0.1.5-alpha.2`; profile mẫu ở `deepseek-ai/deepseek-harness/packages/experimental/agent-team-profile/cordis.patch.yml` |
| `github:MrHuangJser/dsh-cross-session` | `sessions_list`, `sessions_read`, `sessions_send` — nhắn thẳng vào inbox session khác | Không có trên npm; tác giả xác nhận chạy với host `0.1.5-rc.2` |

## D. Cảnh báo thêm

- **DSH Desktop**: bản desktop nhúng core riêng — nâng CLI toàn cục **không** nâng core trong app.
  Nếu chạy desktop thì phải cập nhật app, hoặc chuyển sang `dsh web` từ CLI.
- Quay lại bản cũ: `npm install -g @deepseek-ai/dsh@0.1.1-rc.2` rồi
  `dsh plugin --profile web remove @nanmicoder/dsh-agent-teams`.
- Giới hạn đã biết của AgentTeams: thành viên là subagent **do captain sinh ra**, nên nó **không** nhắn
  được cho một session có sẵn thuộc session cha khác. Muốn đúng session đó nhận việc thì phải do session
  cha của nó chuyển tiếp, hoặc dùng `dsh-cross-session` ở mục C.
