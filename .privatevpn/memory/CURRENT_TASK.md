# Current Task

- **Task ID:** TASK-20260825-MEETFLOWAI-BACKEND
- **Title:** Fix MeetFlowAI backend & make it stable (review + research)
- **Owner:** main agent
- **Status:** todo (planned for 2026-08-25)
- **Created:** 2026-08-24 (note từ cuối phiên 2026-08-24)
- **Updated:** 2026-08-24

## Objective

"Fix con MeetFlowAI, review và research thêm phần backend cho nó ổn định"
— kiểm tra, sửa lỗi và củng cố backend control plane FlowVPN (MeetFlowAI /
meetflowai.site) để chạy ổn định lâu dài, không crash, không rủi ro mất cấu hình.

## Context (đã biết từ các phiên trước)

- Control plane: VPS 103.173.155.50, port 7778, `LEGACY_MODE=1`, code tại `/root/flowvpn-cp/`.
- Từng crash `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` trên Node 18 → đã nâng lên Node 24.19.0 (cài tay, NodeSource repo).
- Chạy CHUNG trên VPS 1 CPU / 1 GB RAM với: Caddy (443), nginx auth gate (3081), dhs-auth (9090), WireGuard wg0 (vietnam-1), cron `sync-peers.py` mỗi 5 phút.
- 2 exit node: vietnam-1 (103.173.155.50:443, 10.77.0.0/24), vietnam-2 (103.6.234.233:443, 10.78.0.0/24) — vietnam-2 tự quản wg0, CP chính provision peer qua SSH (`/root/.ssh/id_ed25519`).
- AUTH_TOKEN của CP lưu trong `/tmp/cp.env` + unit files (đã từng bị lộ trong chat).
- Đồng bộ devices: `sync-peers.py` cron `*/5` → `wg set peer` trên mọi node.

## Plan (draft — làm chi tiết vào sáng 2026-08-25)

| Bước | Nội dung |
|---|---|
| 1. Audit | Log/uptime/crash history của CP; memory usage; trạng thái systemd; sync-peers có chạy ổn; devices.json còn khớp với các node |
| 2. Review kiến trúc | Điểm yếu hiện tại: 1 VPS 1GB chạy quá nhiều service; research hướng ổn định: tách service / giới hạn RAM (systemd MemoryMax) / hardening / giám sát + alert / backup config CP + wg |
| 3. Fix | Sửa các lỗi tìm được (crash, sync fail, memory leak nếu có) |
| 4. Verify | End-to-end: đăng ký device mới → sync tới cả 2 node; reconnect client; uptime sau fix |

## References

- Code CP: VPS `/root/flowvpn-cp/` (+ `sync-peers.py`), registry node trong CP.
- Cấu hình: `/etc/caddy/Caddyfile`, `/etc/nginx/sites-available/dhs-gate`, `/etc/wireguard/wg0.conf` (2 node).
- Docs: `docs/ARCHITECTURE.md`, `docs/SRS.md`, memory `.privatevpn/memory/DECISIONS.md`, `.dhs-setup/FPT-HARNESS-NOTES.md` (phần DSH backend).

## Validation Plan (điền khi làm)

| Check | Required | Evidence |
|---|---|---:|---|
| CP uptime sau fix (≥ 24h không crash) | yes | _ |
| sync-peers chạy đúng cron, mọi node khớp | yes | _ |
| Device mới sync được tới cả 2 node | yes | _ |
| Memory VPS ổn định (không leak) | yes | _ |
| Backup config CP + wg hoạt động | yes | _ |

## Handoff

(Điền cuối phiên ngày mai.) Hôm nay (2026-08-24) đã xong: hết bad gateway
(root cause 2 launchd tunnel đánh nhau), cache browser phone, installer
1-click FPT Harness, nginx/caddy verified sạch lỗi.
