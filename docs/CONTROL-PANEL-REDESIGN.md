# Solution & Kiến trúc — Redesign Control Panel FlowTech (thống nhất)

> Tài liệu thiết kế (CHƯA implement). Mục tiêu: một control panel duy nhất quản trị
> VPNFlow + fBuddy + bán Windows, thay cho 2 admin UI rời rạc hiện tại.

## 1. Hiện trạng (đã khảo sát)

| Hệ | Nơi | Admin UI | Ghi chú |
|---|---|---|---|
| VPNFlow | `flowvpn-cp` node-2:7778 (`LEGACY_MODE=1`) | `admin-page.js` — **1 file 3338 dòng**, nhúng asset base64, đã patch nhiều `.bak` | routes: nodes, downloads, plans, payments |
| fBuddy/MeetFlow AI | `fbuddy` node-2:7790 | React `SettingsPage` (tabs: providers, credits, users, voice, hub import, MCP) | admin API `/api/admin/*` (JWT `requireAdmin`) |
| AI admin (sơ khai) | trong flowvpn-cp | `/v1/admin/ai/users`, `/ai/payments`, `/ai/entitlements`, `/ai/store/*`, firebase | đã có một phần "AI" nhưng chưa đầy đủ |

**Đau điểm:**
1. Hai admin UI tách rời, hai login khác nhau.
2. `admin-page.js` monolithic — thêm tính năng là phải vá một file 3338 dòng (rủi ro + chậm).
3. Logic "AI" bị xé làm hai nơi: flowvpn-cp quản user/payment AI, fBuddy quản provider/credit/skill.
4. Không có một "cửa" thống nhất để bán/gỡ lỗi cho khách.

## 2. Mục tiêu

Một **FlowTech Console** duy nhất:
- Login một lần (admin SSO).
- Sidebar phân vùng: **VPN · AI (fBuddy) · Sales (Windows) · System**.
- Mọi thao tác admin nằm ở đây; app người dùng (fBuddy web, app VPN) giữ nguyên.

## 3. Kiến trúc đề xuất

```
                 FlowTech Console (React SPA mới, repo console/)
                        │  (1 login admin → JWT FlowTech)
        ┌───────────────┼───────────────────────────────┐
        ▼               ▼                               ▼
  flowvpn-cp API    fBuddy admin API              (Windows key service)
  :7778 /v1/...     :7790 /api/admin/...           (hiện là control-plane + desktop route)
```

- **Console là lớp trình bày mỏng (thin client)** — KHÔNG chứa business logic; chỉ gọi API của 2 backend đang có.
- **Auth:** dùng JWT. 2 lựa chọn:
  - (A) Console tự có auth, lưu token của từng backend (nhanh, đơn giản).
  - (B) **Single admin JWT chung** — một secret ký chung cho cả flowvpn-cp lẫn fBuddy (chuẩn lâu dài).
  Kiến nghị: P0 dùng (A), P2 nâng lên (B).
- **Không viết lại admin-page.js** ngay: giữ nó chạy song song (fallback), chuyển dần từng màn sang Console.

## 4. Phân vùng Console

1. **Overview** — health 2 backend, tổng user/payment hôm nay, doanh thu.
2. **VPN** — nodes/devices, plans, payments, downloads (chuyển dần từ admin-page.js).
3. **AI · fBuddy** — providers+model (đã có), credits/topup, users, skill hub (import/verify), voice, security (từ docs/CYBER-SECURITY-SOLUTION.md).
4. **Sales · Windows** — gen/revoke key, trial, activate (route `/api/desktop/activate` đã có).
5. **System** — mailer, SePay, app settings, audit.

## 5. Lộ trình (làm dần)

- **P0 (v1):** dựng `console/` React + login admin + sidebar 5 vùng + màn **AI/fBuddy** (gọi thẳng `/api/admin/*`). Đây chính là "dọn setting fBuddy ra khỏi app người dùng".
- **P1:** màn VPN (nodes/plans/payments/downloads) — port dần từ admin-page.js.
- **P2:** màn Sales + SSO chung + decommission admin-page.js.

## 6. Quyết định cần anh chốt

1. ~~Console đặt ở domain nào?~~ → **ĐÃ CHỐT: `console.meetflowai.site`** (Cloudflare, cùng origin node-2 như `fbuddy.meetflowai.site`).
2. P0 có cần **SSO chung** ngay, hay chấp nhận login admin riêng của fBuddy trước?
3. VPN admin có bắt buộc phải gom vào Console ngay, hay ưu tiên **AI/fBuddy trước**?

## 7. Rủi ro

- Di cư admin-page.js dễ vỡ tính năng VPN đang chạy — phải làm từng màn + đối chiếu.
- Hai backend khác auth/khác domain — cần xử lý CORS + token rõ ràng.
