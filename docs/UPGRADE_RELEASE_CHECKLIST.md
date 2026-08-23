# FlowVPN Upgrade Release Checklist (bản có login email-OTP + backend-first)

- **Date:** 2026-08-23
- **Baseline:** RS-20260819-01 (SRS v0.1 + Appendix A drift)
- **Scope:** release bản app mới (login email-OTP, backend-first exit-node selection) lên App Store; thay thế bản review hiện tại

## 1. Backend / production (VPS)

- [x] Coordinator = `control-plane/` dual-mode (`flowvpn-cp.service`, port 7778, LEGACY_MODE=1)
- [x] `POST /v1/tokens` 201 cho review build (allowlist khi LEGACY_MODE=1) — verified
- [x] Auth: `/v1/auth/email/start|verify` (email-OTP), `/v1/enrollment-tokens`, Bearer register
- [x] Mailer SMTP (no-reply@meetflowai.site, Postfix 465) — SPF pass + DMARC p=none → iCloud/Gmail nhận OTP
- [x] Admin: nodes (SQLite) + users + health
- [ ] **Subscription source production** — BLOCKER:
  - Hiện chỉ test-grant (GRANT_SUB_EMAILS allowlist + admin grant). User thường mua StoreKit nhưng server KHÔNG verify receipt → `/v1/enrollment-tokens` sẽ 403 cho họ → không connect được.
  - **Cần:** sau khi App Store Connect duyệt products (`Monthly_Premium`, `Yearly_Premium`):
    - App gửi StoreKit transaction/JWS receipt lên server, hoặc
    - Server verify qua App Store Server API, hoặc
    - Tạm (cho bản đầu): cho phép connect khi user có StoreKit entitlement trên device (client-side) — KHÔNG khuyến nghị lâu dài
- [ ] **LEGACY_MODE=0** sau khi bản mới được release (tắt `/v1/tokens` + unauth register → 410/401)

## 2. App (iOS + macOS)

- [x] Login screen riêng (LoginView/LoginViewMac) — build SUCCEEDED
- [x] Backend-first exit-node selection (fetch /v1/nodes lúc launch; no hardcode production)
- [x] Session 30 ngày Keychain (login 1 lần)
- [x] Localization 5 ngôn ngữ
- [x] StoreKit paywall (Monthly_Premium / Yearly_Premium) — chờ products approve
- [x] **Force update gate** (`/v1/app-version` + AppVersionService + ForceUpdateView iOS/macOS) — user dưới minimum_version bị chặn dùng + nút Update mở App Store. Quản lý qua admin `PATCH /v1/admin/app-version`.
  - **Trạng thái hiện tại: DISABLED** (`minimum_version = 0.0.0`) — **chưa có version nào trên App Store nên chưa bật** (owner: bật khi có bản đầu trên store rồi release bản sau, set minimum_version = bản trước).
- [x] **Real-device E2E (iPhone 14 Pro Max) PASS 2026-08-23** — evidence `evidence/e2e/2026-08-23-iphone-e2e.md`; macOS connect pending NE profile (owner tạo trên portal)
- [ ] (Pending) Device list + Revoke UI trong app (FR-REVOKE-001/002 UI)
- [ ] (Pending) Multi-device ownership UI (FR-DEVICE)

## 2b. App Store review — account/registration (owner action trên App Store Connect)

- [x] **Delete Account** (Apple 5.1.1(v)): backend `DELETE /v1/account` + iOS/macOS Settings → Delete Account (confirm + xóa user/devices/session/subscription); deployed.
- [x] **Privacy policy** đầy đủ: data collected (email, device, subscription), **Delete Account instructions**, contact `support@meetflowai.site` (EN + VI) — `https://meetflowai.site/FlowVPNPrivacy.html` live.
- [x] Support email `support@meetflowai.site` (đã có mailbox? — nếu chưa, tạo trên mail server).
- [ ] **App Store Connect — Privacy Nutrition Labels**: khai báo data types (Email, Device ID, Purchases/Subscription).
- [ ] **App Store Connect — account deletion question**: "Can users delete their account?" → **Yes** (kèm hướng dẫn: Settings → Delete Account).
- [ ] **Sign in with Apple**: KHÔNG bắt buộc (app dùng email-OTP tự build, không third-party login — guideline 4.8 chỉ áp dụng third-party). Nếu review hỏi → giải thích.

## 3. Build & submit

- [ ] Build Release trên máy có signing NE-capable (bundle `com.privatevpn.app` + `com.privatevpn.app.packet-tunnel`)
- [ ] Verify Keychain access group khớp team G6XW3RN6LJ (M1 cũ)
- [ ] Archive → Validate → Upload → App Store Connect
- [ ] Sau approve → set LEGACY_MODE=0 + deploy coordinator mới cùng bản app

## 4. Security gating

- [ ] H1 (tokens mở) — fixed + LEGACY_MODE gating (sẽ tắt sau release)
- [ ] H2 (real-device E2E) — cần evidence từ E2E device test
- [ ] BUG-20260823-001: đóng khi LEGACY_MODE=0 + verify 401/410

## Owner actions needed

1. Kiểm tra App Store Connect: **products subscription đã approve chưa?**
2. Xác nhận sẵn sàng **test device iPhone** (build + install + NE profile)
3. Quyết định hướng subscription production (receipt verify vs tạm client-side)
