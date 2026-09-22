# Agent Handoff

- **Agent:** main (Senior dev / orchestrator — DSH harness Mac)
- **Task ID:** TASK-20260922-REPO-STATE-CLEANUP
- **Date:** 2026-09-22
- **Status:** done (2 việc chờ chủ dự án quyết — xem §Open Questions)

## Summary

Dọn nợ trạng thái của repo trước khi làm việc mới. Phát hiện & sửa 6 lệch thực tế, trong đó 3
lệch có thể gây hậu quả thật: (a) lệnh `ssh` trong `PROTOCOL.md` §4 **chạy nguyên văn thì fail**
→ không agent Mac nào `check` được bảng việc trước khi sửa; (b) hook chặn commit vào vùng bảo vệ
§6b **đang TẮT** trên chính máy orchestrator (`core.hooksPath`/`coord.owner` chưa đặt) — tức lớp
bảo vệ đã sinh ra sau sự cố 18/09 đang không hoạt động; (c) `project.json` ghi 0 bug trong khi
`bugs.json` có 1 high + 1 medium, và ghi iOS còn phải qua App Store review trong khi
`ARCHITECTURE.md` §B6 as-built đã bỏ kênh App Store từ 14/09/2026. 26 GB "untracked" ở
`fbuddy-ios/` thực chất **đã được ignore sẵn** (`.dd-*/`), chỉ 16 file / 2,0 MB là source thật.
Toàn bộ diff Android đang treo của phiên trước **được giữ nguyên, không commit** (ngoài phạm vi).

## Files Changed

| Path | Change Summary |
|---|---|
| `.privatevpn/coordination/PROTOCOL.md` | §4: thêm `-i $HOME/.ssh/fpt_vpn_node` (lệnh cũ fail), bỏ alias `node-2` hỏng; §6: tách `coord.cmd` cho server/Mac, cảnh báo `~` không được expand |
| `.githooks/pre-commit` | Sửa comment cài đặt: Mac phải đi qua ssh + `$HOME` thay vì "server/mac gọi trực tiếp" (sai thực tế) |
| `.gitignore` | Thêm `__pycache__/`, `*.pyc` |
| `.privatevpn/status/project.json` | `open_bugs` 0/0/0/0 → 0/1/1/0 (khớp `bugs.json`); blocker #1 viết lại theo Ad Hoc OTA as-built; blocker #4 nêu rõ `/v1/tokens` đang mở + trỏ ADR-0005; `next_verification` bỏ mốc App Store; `updated` → 2026-09-22 |
| `.privatevpn/status/requirements.json` | FR-AUTH-001: ghi chú production vẫn `LEGACY_MODE=1` ⇒ `/v1/tokens` song song còn mở; `updated` → 2026-09-22 |
| `docs/ARCHITECTURE.md` | Sửa tiêu đề trùng số: `### B6. Android / Windows client clone target` → `### B7.` (trước đó có 2 mục B6) |
| `docs/adr/0005-legacy-mode-fail-closed.md` | Sửa tham chiếu chết `PROJECT_STATE.md` (không tồn tại) → `docs/WINDOWS_HARNESS_TASK_1.4.0.md` + `docs/RELEASE_PLAN_2026-09-24.md`, kèm số liệu thật của bản Windows 1.4.1 |
| `.privatevpn/memory/AGENT_HANDOFFS/2026-09-22-repo-state-cleanup.md` | **MỚI** — báo cáo này |
| `scripts/__pycache__/check-public-surface.cpython-313.pyc` | **XOÁ** — rác build, đã thêm vào `.gitignore` |

Commit kèm theo (do phiên trước để lại untracked, không phải em tạo): `docs/adr/0005-*.md`,
`evidence/2026-09-22-legacy-mode-production-probe.md`,
`.privatevpn/memory/AGENT_HANDOFFS/2026-09-22-legacy-auth-fail-closed.md`, `.privatevpn/status/bugs.json`,
`scripts/security/mac-selfdefense/**`, `fbuddy-ios/**`.

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| ADR-0005 **giữ nguyên `PROPOSED`**, không tự nâng ACCEPTED | Đồng ý ADR nghĩa là sửa `control-plane/src/index.js` — vùng bảo vệ owner `windows` (§6b) — và phải có bản Windows mới trước khi cắt. 4 câu hỏi cho chủ dự án chưa được trả lời | `docs/adr/0005-*.md` (Status), `bugs.json` `owner_decision_needed` |
| `bugs.json` giữ là nơi ghi **mối đe doạ**, `requirements.json` chỉ ghi chú | Mối đe doạ "revoke rồi đăng ký lại qua nhánh legacy" **chưa kiểm chứng**; đổi `impl` của FR-REVOKE-002 khi chưa có bằng chứng là bịa trạng thái | `.privatevpn/status/requirements.json` (FR-AUTH-001 evidence) |
| Đưa `fbuddy-ios/` (16 file/2,0 MB) vào git | Không phải repo git riêng (khác `MeetFlowAI_Win/`), không có secret (đã quét), spec đã nằm trong repo (`docs/FBUDDY_MODEL_FEATURES.md`), và source nằm trên volume ngoài — để untracked là đúng kiểu mất mát đã xảy ra 18/09 | `fbuddy-ios/**` (commit) |
| Đưa `scripts/security/mac-selfdefense/` vào git | Yêu cầu trực tiếp của chủ dự án 22/09 (ghi trong README), có test riêng, `node --test` 39/39 PASS | `scripts/security/**` (commit) |
| Bật hook §6b trên máy Mac | `core.hooksPath`/`coord.owner` chưa đặt ⇒ hook bảo vệ **không chạy**; đã đặt `coord.cmd` trỏ đúng ssh kèm `-i` | git local config (không commit) |
| **Không** commit diff Android đang treo | Là việc dở của phiên trước, chưa có bằng chứng build/đo CPU; gộp vào đợt dọn nợ sẽ làm mờ phạm vi review | — (giữ nguyên trong working tree) |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20260922-101 | runtime_checked (node-2, read-only) | passed — bảng việc trống: `Bang viec trong: khong ai dang giu claim nao` + `Khong co task nao` |
| EVID-20260922-102 | runtime_checked (ssh từ Mac) | passed — lệnh §4 cũ fail `Permission denied (publickey,password)`; có `-i ~/.ssh/fpt_vpn_node` → `OK / fcnvps2` |
| EVID-20260922-103 | runtime_checked (git local) | passed — hook gọi được bảng việc: `OK: khong ai khac dang giu .gitignore, .githooks/pre-commit` |
| EVID-20260922-104 | test_checked | passed — `scripts/security/mac-selfdefense`: **39 pass / 0 fail** |
| EVID-20260922-105 | schema_checked | passed — 3 file status JSON hợp lệ; `bugs.json` {high:1, medium:1} == `project.json` {high:1, medium:1} |
| EVID-20260922-106 | static_checked | passed — `docs/ARCHITECTURE.md` §B6 (as-built 15/09) + `docs/APP_STORE_UNLISTED_ANALYSIS.md` (phân tích, chưa quyết) + commit `9e90b54` xác nhận bỏ App Store / Windows 1.4.1 |
| EVID-20260922-107 | static_checked | passed — `PROJECT_STATE.md` không tồn tại ở bất kỳ đường dẫn nào; `control-plane/src/dep-index.js`, `MainView.axaml.cs`, `evidence/2026-08-23-tokens-open-production.md` đều tồn tại |
| EVID-20260922-108 | tool_checked | passed — `node scripts/coord/flowvpn-coord.mjs selftest` → `selftest OK (18 assertion)` |

## Validation Performed

```bash
ssh -o BatchMode=yes -i ~/.ssh/fpt_vpn_node root@165.101.114.162 'flowvpn-coord list && flowvpn-coord task list --all'
ssh -o BatchMode=yes -i ~/.ssh/fpt_vpn_node root@165.101.114.162 'flowvpn-coord check .privatevpn/status/project.json ... .gitignore'
git check-ignore -v fbuddy-ios/.dd-sim/ fbuddy-ios/FBuddy.xcodeproj/
git status --porcelain -uall fbuddy-ios/ | wc -l
python3 -m json.tool .privatevpn/status/project.json > /dev/null
cd scripts/security/mac-selfdefense && node --test
node scripts/coord/flowvpn-coord.mjs selftest
```

Result:

```text
Bang viec trong: khong ai dang giu claim nao.       (list)
Khong co task nao.                                  (task list --all)
OK: khong ai khac dang giu ...                      (check, exit 0)
.gitignore:54:.dd-*/        fbuddy-ios/.dd-sim/     (26 GB da duoc ignore san)
.gitignore:2:*.xcodeproj/   fbuddy-ios/FBuddy.xcodeproj/
16                                                  (so file fbuddy thuc su vao git)
OK .privatevpn/status/project.json / requirements.json / bugs.json
tests 39 | pass 39 | fail 0
selftest OK (18 assertion)
```

## Validation Not Performed

| Check | Reason |
|---|---|
| Build APK Android bằng `.tools/jdk/temurin-17.jdk` | Ngoài phạm vi đợt dọn nợ; diff Android đang treo chưa được review. **Ghi nhận**: blocker cũ "JDK 17 trên Mac hỏng" đã hết đúng — `java -version` → `17.0.20.1` chạy tốt, `~/.gradle/caches/8.11.1` + SDK `android-35` có sẵn |
| Đo CPU/MTU/DNS trên máy Android thật | Không có thiết bị; vẫn là điều kiện chặn của `BUG-ANDROID-CPU-001` |
| Kiểm chứng "revoke rồi đăng ký lại qua nhánh legacy" | Cần thao tác làm thay đổi dữ liệu production ⇒ §1 cấm; `bugs.json` đang ghi đúng là *chưa kiểm chứng* |
| `git push` | Chưa thực hiện trong báo cáo này — xem log commit ở phần trao đổi |

## Risks

- **Rủi ro chính không nằm ở diff này**: `POST /v1/tokens` vẫn mở không auth trên production
  (`BUG-20260823-001`, high). Mọi việc dọn dẹp ở đây không thu hẹp được lỗ đó; nó chỉ làm lộ trình
  (ADR-0005) và trạng thái trở nên chính xác.
- Danh mục `fbuddy-ios/` là **sản phẩm khác** (`site.meetflowai.fbuddy`) nằm trong repo VPNFlow.
  Nếu chủ dự án định tách nó thành repo riêng như `MeetFlowAI_Win/`, cần `git rm -r --cached fbuddy-ios`
  và thêm vào `.gitignore` — nếu không, lịch sử sẽ chứa source của app kia.
- `project.json` vẫn có thể còn mốc cũ chưa đối chiếu (ví dụ `last_verified` 2026-08-23) — em **không**
  đổi vì chưa có bằng chứng verify mới.

## Open Questions

1. `fbuddy-ios/` ở lại repo này (đã commit) hay tách repo riêng như `MeetFlowAI_Win/`?
2. 4 câu hỏi của ADR-0005 (systemd unit có set `LEGACY_MODE=1` tường minh không; Windows lên đường
   găng; có cần gate premium phía client; cửa sổ rollback 1 tuần) — chưa trả lời thì ADR-0005 đứng yên.
3. Phần Android đang treo (`HY_MTU` 1500→1300, 2 DNS resolver, `versionCode` 21): review để commit,
   hay build lại APK lấy bằng chứng trước?

## Next Recommended Step

Review + chốt diff Android đang treo (đọc kỹ 3 file, build APK bằng
`.tools/jdk/temurin-17.jdk/Contents/Home` để có bằng chứng, rồi quyết commit/rollback) — đây là
thay đổi duy nhất còn lại trong working tree và nó đụng hành vi mạng của khách Android.
