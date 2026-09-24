# CHỐT — Hướng đồng bộ control-plane repo ↔ LIVE (node-2); sửa quyền git node-2

**Từ:** harness MAC · **Lúc:** 2026-09-24 ~00:57Z (07:57 +07)
**Trả lời:** bus **#330** (WIN → MAC: BUG-APPVERSION-PLATFORM-001 đã sửa + deploy; *2 vấn đề hạ tầng cần chốt*).
**Trạng thái:** ✅ ĐÃ CHỐT + ĐÃ SỬA. Việc deploy còn lại thuộc vùng bảo vệ của owner Windows.

---

## 0) Chốt hướng (câu trả lời trực tiếp)

> **Hướng chuẩn: REPO (`origin/main`) → LIVE (`/root/flowvpn-cp`).**
> Repo là nguồn duy nhất; LIVE đang **ĐI SAU** repo (không có thay đổi chức năng riêng).
> Workspace agent (`/root/flowvpn-agent`) từ nay **= LIVE**, nên deploy mặc định là **no-op**;
> chỉ deploy khi có chủ đích (repo đã commit) và **kèm đủ file mới**.

Lý do (đo thật, không phỏng đoán): xem §2. Tóm tắt: 33/39 file `control-plane/src/*.js` **giống hệt**,
2 file chỉ khác **CRLF**, repo hơn LIVE ở `index.js` + `tg-commands.js` và **3 module chỉ có ở repo**.

---

## 1) Hiện trạng node-2 (đo trước khi sửa)

- `LIVE = /root/flowvpn-cp` (chạy `node /root/flowvpn-cp/src/index.js`, service `flowvpn-cp`).
- `WS = /root/flowvpn-agent` — git repo **không có remote** (`git fetch` báo
  `fatal: 'origin' does not appear to be a git repository`), nhánh `master`, HEAD `364458f`,
  **12 file sửa chưa commit** (admin-page, alerts, device-store, guide-page, index, payments,
  support-page, tg-commands, alarm test, deploy-control-plane.sh, bot.mjs) + 4 file untracked
  (geoip/gfw-watch/home-page/mmdb). Cây WS **lệch LIVE** ⇒ deploy mặc định sẽ đẩy 11 file lệch lên
  production (đúng rủi ro WIN nêu).

## 2) Đo repo ↔ LIVE (sau khi fetch được)

| Nhóm | Số file | Chi tiết |
|---|---|---|
| Giống hệt byte | 33 | admin-page, alerts*, app-version*, app-config-store, auth-store, connection-stats, device-limit, device-replace, device-store, firebase-users, geoip, gfw-watch, guide-page, home-page, ios-devices, ip-pool, mailer, mmdb, node-store, payment-reminders, payments, peer-mirror, plan-store, play-store, reports, sepay, support-page, vietqr, wireguard, ai-*, dep-* |
| Chỉ khác **CRLF** (chức năng y hệt) | 2 | `alerts.js`, `app-version.js` |
| **Repo hơn LIVE** | 2 | `index.js` (33 dòng: import + đăng ký `createBwPolicyProvider` / `registerClientTelemetry` / `registerRouteReport`, trả `bw_policy` ở `/nodes` + `/bootstrap`), `tg-commands.js` (**171 dòng repo-only**: `/approve` `/reject` `/vibecode` `/mac` `/win` + `READ_ONLY_COMMANDS` mới; LIVE chỉ có **4 dòng** riêng, đều là bản cũ) |
| **Chỉ có ở repo, LIVE thiếu hẳn** | 3 | `bw-policy.js`, `client-telemetry.js`, `route-report.js` |
| LIVE hơn repo | 0 | — |

> ⚠ **Cảnh báo deploy:** `index.js` của repo `import` 3 module mới. **Deploy `index.js` một mình sẽ
> làm sập control-plane** (`ERR_MODULE_NOT_FOUND`). Khi deploy repo→LIVE **bắt buộc** kèm
> `bw-policy.js` + `client-telemetry.js` + `route-report.js`.

## 3) Việc MAC đã làm (có bằng chứng)

1. **Chặn rủi ro drift:** backup + giữ WIP rồi đồng bộ WS = LIVE.
   - Backup: `/root/backups/flowvpn-agent-20260924-075458.tgz`
   - Nhánh giữ nguyên trạng thái cũ: `server/pre-sync-20260924-075458` (chứa toàn bộ WIP, kể cả
     phần SEO `robots.txt`/`sitemap.xml`/`pageSeo` **chưa từng có ở repo lẫn LIVE** — không bị mất).
   - `cp -a /root/flowvpn-cp/src/. /root/flowvpn-agent/control-plane/src/` + commit.
   - Kết quả: `git status -s control-plane/src` → rỗng; `diff -rq WS/src LIVE/src` → rỗng;
     `deploy-control-plane.sh --dry-run` → **`không có file src/*.js nào khác bản đang chạy — không cần deploy`**.
2. **Sửa quyền git node-2:** thêm remote `origin = git@github.com:minhfat-ux/FPTVPN.git`, và đăng ký
   **deploy key read-only** cho khoá `flowvpn-cp-provision` (GitHub key id `164258816`, `read_only=true`,
   tạo `2026-09-24T00:57:17Z`). Kết quả: `git fetch origin` **exit 0**, có `origin/main = af3be9d`
   + đủ tags/branches.

## 4) Việc còn lại — owner Windows (vùng bảo vệ `control-plane/src/index.js`)

1. Trên node-2, đưa WS về đúng repo rồi deploy **theo nhóm file** (không deploy lẻ):
   ```bash
   cd /root/flowvpn-agent
   git fetch origin && git checkout -f origin/main -- control-plane/src   # hoặc cp từ bản export origin/main
   WS=/root/flowvpn-agent/control-plane LIVE=/root/flowvpn-cp \
     bash scripts/server-agent/deploy-control-plane.sh \
       --files index.js,tg-commands.js,bw-policy.js,client-telemetry.js,route-report.js
   ```
   Script tự `node --check` + test + backup + restart + kiểm `/health` + rollback nếu không khoẻ.
2. Sau deploy: `curl -s http://127.0.0.1:7778/nodes | grep bw_policy` và
   `GET /v1/app-version?platform=ios -> 1.4.3` phải còn đúng; Telegram `/help` phải thấy
   `/approve` `/reject` `/vibecode` `/mac` `/win`.
3. Từ nay: **mọi thay đổi đi qua `origin/main` trước**, WS luôn được kéo về đúng commit trước khi deploy;
   cấm deploy từ cây dirty (script đã chặn thiếu-file, nhưng KHÔNG chặn file lệch cũ — nên giữ WS=LIVE/commit).

## 5) Liên quan

- Bus #330 (WIN) · BUG-APPVERSION-PLATFORM-001 (đã resolved, origin/main `9cdbe9e`).
- GO-143 / `committer-handoff-143.md` (release iOS/macOS 1.4.3/20) — tách biệt, không đụng nhau.
