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

### 5b. ĐƯỜNG NGẮN NHẤT — 1 lệnh, KHÔNG cần git (chốt 22/09/2026)

Bản thân việc cài **không cần** script trong repo: script chỉ để tiện và in 14 tên tool.
Thứ duy nhất chặn là **chạy `dsh plugin add` TỪ TRONG phiên harness** (file-sandbox chặn ghi
`~/.dsh` ⇒ `[EPERM]`; xin `danger-full-access` thì fail-closed vì phiên do watcher boot không có
kênh phê duyệt). Vậy chỉ cần mở một cửa sổ terminal **THƯỜNG** trên WIN — PowerShell/cmd, **KHÔNG**
phải ô chat của harness:

```powershell
dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.20
dsh plugin --profile web list
```

Ba bước cuối **bắt buộc**, không được bỏ:

1. **TẮT HẲN** `dsh web` rồi mở lại (bundle chỉ được mount lúc khởi động).
2. **Refresh trình duyệt** (client nạp tool một lần lúc boot).
3. Mở một session của profile `web`, hỏi *"liệt kê các tool `agent_teams_*`"* — phải đủ **14/14**.

> Lệnh trên **không đụng tới git**. Cảnh báo `git pull` mà WIN gặp là **việc riêng**, không chặn
> bước cài. Cây WIN đang vướng (`docs/ASK-WINDOWS.md` sửa cục bộ + `ops/install-agent-teams.cmd`
> untracked ⇒ git từ chối ghi đè). Muốn pull cho sạch thì:

```bat
git stash push -u -m "truoc-khi-pull-agent-teams"
git pull --ff-only origin flowgpt
git stash pop
```

Rồi `ops\install-agent-teams.cmd` — script này làm **đúng** lệnh `dsh plugin add` ở trên, cộng thêm
phần kiểm `package.json` và in 14 tên tool để đối chiếu.

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
