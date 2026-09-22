# Agent Handoff

- **Agent:** main (Solution Architect — DSH harness Mac)
- **Task ID:** TASK-20260922-LEGACY-AUTH-FAIL-CLOSED
- **Date:** 2026-09-22
- **Status:** needs_review (owner decision required; no production change made)

## Summary

Điều tra lỗ hổng `POST /v1/tokens` mở không cần auth trong production và chốt lộ trình fail-closed.
Kết quả: production **đang chạy `LEGACY_MODE=1`** (đã kiểm chứng bằng probe không thay đổi dữ liệu).
Cờ `LEGACY_MODE` là **fail-OPEN mặc định** (`?? "1"`) và là cờ dev/legacy **duy nhất** không có
guard `!IS_PRODUCTION`. Client **duy nhất** còn phụ thuộc đường legacy là **Windows**
(`MainView.axaml.cs:254` gọi `FetchJoinTokenAsync()` + `accessToken: null` trên **mọi** lần Connect),
trong khi iOS/macOS/Android đã đi đường `enrollment-tokens` có session + subscription.
Windows **đã có sẵn** `FetchEnrollmentTokenAsync` trong Core — thiếu phần nối dây.
Em **không sửa code** (control-plane/src/index.js là vùng bảo vệ của owner `windows`, AGENTS.md §6b);
bàn giao ADR-0005 + bằng chứng + đề xuất 4 pha.

## Files Changed

| Path | Change Summary |
|---|---|
| `docs/adr/0005-legacy-mode-fail-closed.md` | **MỚI** — ADR-0005 (PROPOSED): bối cảnh, 8 phát hiện có dẫn chứng, 4 pha retirement, alternatives, câu hỏi cho owner |
| `evidence/2026-09-22-legacy-mode-production-probe.md` | **MỚI** — bằng chứng probe production + giải thích vì sao probe kết luận được và không đổi dữ liệu |
| `.privatevpn/status/bugs.json` | Đăng ký `BUG-20260823-001` (trước đây **không có** trong registry) + blocker Windows + câu hỏi cần owner quyết; `updated` -> 2026-09-22 |
| `docs/ARCHITECTURE.md` | §B3: thêm ghi chú **SUPERSEDED** — lý do "App-Store-review build" đã hết hiệu lực, trỏ ADR-0005 + bằng chứng |
| `.privatevpn/memory/AGENT_HANDOFFS/2026-09-22-legacy-auth-fail-closed.md` | **MỚI** — báo cáo này |

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Không cắt `LEGACY_MODE=0` ngay | Windows gọi `/v1/tokens` trên MỌI lần Connect ⇒ cắt ngay làm mọi máy Windows mất kết nối ở lần Connect kế tiếp | ADR-0005 §Decision (P2 trước P3) |
| Đề xuất P0 đổi default sang opt-in (`=== "1"`) | Loại bỏ chế độ fail-open: mất env var thì tự mở lại đường không auth | ADR-0005 Phase 0 |
| P0 có **điều kiện tiên quyết** | Nếu systemd unit KHÔNG set `LEGACY_MODE` tường minh thì P0 chính là cú cắt, không phải hardening | ADR-0005 Phase 0 + Open question 1 |
| Đề xuất xoá `control-plane/src/dep-index.js` | Bản trùng 3.449 dòng của `index.js`, chứa cùng logic `LEGACY_MODE`, không được tham chiếu ở đâu (package.json/deploy-node.sh đều dùng `src/index.js`) | ADR-0005 finding 7 |
| Chỉ điều tra, không sửa code control-plane | `control-plane/src/index.js` là vùng bảo vệ owner `windows` (AGENTS.md §6b); Mac chỉ được đề xuất | báo cáo này |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20260922-001 | runtime_checked (production, non-mutating) | passed — production ở `LEGACY_MODE=1` |
| EVID-20260922-002 | static_checked (source đối chiếu 4 client) | passed — chỉ Windows phụ thuộc legacy |
| EVID-20260922-003 | static_checked (repo-wide reference scan) | passed — `dep-index.js` không được tham chiếu |
| EVID-20260922-004 | schema_checked (`python3 -m json.tool`) | passed — `bugs.json` hợp lệ, 2 bug open |

## Validation Performed

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 15 https://api.meetflowai.site/v1/health
curl -s --max-time 20 -X POST https://api.meetflowai.site/v1/peers/register \
  -H 'Content-Type: application/json' \
  -d '{"join_token":"PVPN-JOIN-INVALID-PROBE-DOES-NOT-EXIST","name":"probe","platform":"probe",
       "wireguard_public_key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}' -w "\nHTTP=%{http_code}\n"
```

Result:

```text
200
{"error":"Invalid or expired join token","message":"Invalid or expired join token"}
HTTP=401
```

`Invalid or expired join token` chỉ sinh ra trong nhánh `LEGACY_MODE === "1"` ⇒ production đang mở đường legacy.

```bash
python3 -m json.tool .privatevpn/status/bugs.json > /dev/null
# -> JSON VALID — 2 open bugs
```

```bash
grep -rn "dep-index" --include=*.{md,sh,json,js,mjs,py,yml,service} .   # (grep tool)
# -> No matches found
```

## Validation Not Performed

| Check | Reason |
|---|---|
| `systemctl show flowvpn-cp.service -p Environment` trên production | Cần ssh đọc cấu hình server; chủ dự án chỉ authorize `flowvpn-coord`. Đây là câu hỏi mở #1 cho owner |
| Test "thiết bị đã revoke có đăng ký lại được qua legacy không" | Sẽ phải tạo dữ liệu thật trên production (mutating) — ngoài phạm vi cho phép |
| Disassemble binary Windows đã phát hành | Kết luận phụ thuộc legacy là ở mức source; binary chưa được kiểm |
| `node --test` control-plane | Không sửa code control-plane, chỉ thêm/sửa docs + JSON |
| Build Windows/iOS/macOS/Android | Không sửa file client nào |

## Risks

- Nếu owner đặt `LEGACY_MODE=0` trước khi phát hành bản Windows mới ⇒ **mọi client Windows mất khả năng kết nối** ở lần Connect kế tiếp.
- `dep-index.js` còn nằm trong repo; nếu ai đó deploy nhầm file này, cùng lỗ hổng tái xuất hiện mà không có gì cảnh báo.
- Probe dùng endpoint production: không tạo token, không ghi dữ liệu, nhưng **có** để lại dấu trong access log của server.

## Open Questions

1. `flowvpn-cp.service` trên production có set `LEGACY_MODE=1` **tường minh** không? (quyết định P0 là hardening hay là cú cắt)
2. Có chấp nhận đưa bản Windows lên đường găng trước khi cắt không?
3. Windows có cần gate premium phía client, hay chỉ cần thông báo `403` rõ ràng?
4. Cửa sổ rollback 1 tuần đã đủ chưa?

## Next Recommended Step

Owner trả lời 4 câu hỏi trên. Nếu đồng ý P0-P4: giao owner `windows` (vùng bảo vệ) thực hiện
P0 + P2 trong `control-plane/src/index.js` và `windows/.../MainView.axaml.cs`, mỗi bước kèm bằng chứng;
Mac verify lại bằng đúng probe trong `evidence/2026-09-22-legacy-mode-production-probe.md`.
