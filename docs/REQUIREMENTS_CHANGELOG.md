# PRIVATEVPN — REQUIREMENTS CHANGELOG

- **Latest baseline:** RS-20260819-01
- **Date:** 2026-08-20

Change requests are captured with stable IDs (CR-xxxx, spec §10-§12). Baseline
initialization is CR-0001.

## CR-0001 — Baseline initialization

- **ID:** CR-0001
- **Title:** Initialize SRS v0.1 requirement baseline
- **Requested by:** Owner (master spec directive)
- **Date:** 2026-08-19
- **Affected requirements:** all (initial set)
- **Current requirement:** none
- **Proposed requirement:** SRS v0.1 baseline RS-20260819-01 as registered in `docs/REQUIREMENTS_REGISTRY.md`
- **Reason:** GATE 0 bootstrap; convert master-spec objective into testable requirements.
- **Trigger/evidence:** `docs/spec/CULI_PRIVATEVPN_IOS_MASTER_SPEC.md` §1, §3, §7, §8.
- **Business impact:** none (new).
- **Technical impact:** establishes IDs, versions, gate mapping.
- **Security impact:** baseline security requirements NFR-SEC-* introduced.
- **UX impact:** none.
- **Architecture impact:** none yet.
- **Affected tasks:** all future tasks (record baseline).
- **Affected tests:** none yet.
- **Affected evidence:** none yet.
- **Affected gates:** GATE 0 artifacts.
- **Backward compatibility:** N/A (initial).
- **Migration need:** none.
- **Recommendation:** accept.
- **Decision:** ACCEPTED.
- **Decision owner:** MinhNb2 (owner) / Culi.
- **Effective requirement version:** SRS v0.1 / RS-20260819-01.

## CR-0002 — Docs sync with authoritative status + privacy review (AC-019)

- **ID:** CR-0002
- **Title:** Docs status sync + privacy review (NFR-PRIV-001 / AC-019 evidence)
- **Requested by:** Owner (verification workflow / master spec directive)
- **Date:** 2026-08-20
- **Affected requirements:** none changed — impl states of all 23 requirements synced to `.privatevpn/status/requirements.json`
- **Current requirement:** unchanged
- **Proposed requirement:** unchanged (docs-only; no SRS text change)
- **Reason:** RULE-DASH-001 — registry/dashboard are projections of authoritative state; sync after commit `6d1a1f7` (FR-ADMIN-001 / NFR-SEC-002 / FR-DIAG-001 → IMPLEMENTED). Privacy review produces AC-019 evidence for NFR-PRIV-001.
- **Trigger/evidence:** `.privatevpn/status/requirements.json`; `evidence/2026-08-20-privacy-review.md`.
- **Business impact:** none.
- **Technical impact:** none (docs + evidence only).
- **Security impact:** privacy review records 3 low-severity findings (no code fix in this CR): (1) `UIDevice.current.name` transmitted in POST /device; (2) control-plane auth token stored in UserDefaults plaintext; (3) admin endpoints unauthenticated when `AUTH_TOKEN` unset (depends on NFR-SEC-004).
- **UX impact:** none.
- **Architecture impact:** none.
- **Affected tasks:** none.
- **Affected tests:** none.
- **Affected evidence:** `evidence/2026-08-20-privacy-review.md` (new).
- **Affected gates:** GATE 6 (NFR-PRIV-001 evidence), GATE 5 (status sync).
- **Backward compatibility:** full.
- **Migration need:** none.
- **Recommendation:** accept.
- **Post-verify update (2026-08-20 11:30):** GATE 3 iOS unit tests re-verified — **37/37 PASS, TEST SUCCEEDED** (iPhone 16 Pro simulator, `evidence/builds/2026-08-20-gate3-tests.log`); `NFR-SEC-001` → IMPLEMENTED (Keychain backend + `DeviceIdentity`), `NFR-PRIV-001` → PARTIAL (AC-019 evidence exists; 3 low issues pending GATE 6). Registry/dashboard synced per RULE-DASH-001.
- **Decision:** ACCEPTED.
- **Decision owner:** MinhNb2 (owner) / Culi.
- **Effective requirement version:** SRS v0.1 / RS-20260819-01 (unchanged).

## CR-0003 — Privacy low-issue fixes (owner-approved, GATE 6)

- **ID:** CR-0003
- **Title:** Fix 3 low-severity privacy review issues (deviceName transmission, token in UserDefaults, unauthenticated admin endpoints)
- **Requested by:** Owner (approval 2026-08-20, follow-up to CR-0002 findings)
- **Date:** 2026-08-20
- **Affected requirements:** NFR-PRIV-001 (PARTIAL → IMPLEMENTED), NFR-SEC-004 (NOT_STARTED → IMPLEMENTED)
- **Current requirement:** NFR-PRIV-001 partial (AC-019 evidence, 3 low issues); NFR-SEC-004 not started.
- **Proposed requirement:** both IMPLEMENTED.
- **Reason:** close GATE 6 privacy findings — (1) stop transmitting `UIDevice.current.name`
  in POST /device; (2) store control-plane auth token in Keychain instead of UserDefaults
  (one-shot migration); (3) admin endpoints fail closed when `AUTH_TOKEN` unset (AC-018).
- **Trigger/evidence:** `evidence/2026-08-20-privacy-review.md` (CR-0002), `evidence/2026-08-20-privacy-fixes.md`.
- **Business impact:** none (no UX change; token UX unchanged; device display name falls back to server default `"device"` until a user-chosen name is added).
- **Technical impact:** iOS — `ControlAPIClient.register` signature change (dropped
  `deviceName`), `VPNConfigStore.controlPlaneToken` backed by Keychain + migration;
  control-plane — `requireAdminAuth` middleware on admin routes (503 when unconfigured).
- **Security impact:** positive — device registry no longer publicly readable without
  authorization; credential no longer persisted plaintext; personal device name no longer
  transmitted.
- **UX impact:** none (fields/behavior unchanged from user perspective).
- **Architecture impact:** none.
- **Affected tasks:** none (executed as owner-approved GATE 6 follow-up run).
- **Affected tests:** `ControlAPIClientTests` (deviceName regression assertion),
  `VPNConfigStoreTests` (+2: Keychain persistence, UserDefaults migration).
- **Affected evidence:** `evidence/2026-08-20-privacy-fixes.md` (new), `evidence/builds/2026-08-20-privacy-fixes-tests.log` (new).
- **Affected gates:** GATE 4 (NFR-SEC-004), GATE 6 (NFR-PRIV-001).
- **Backward compatibility:** iOS client drops one optional request field (server ignores
  unknown fields and defaults the name); control-plane admin routes now require auth —
  intentional, per NFR-SEC-004.
- **Migration need:** token auto-migrates UserDefaults → Keychain on first app launch (one-shot).
- **Recommendation:** accept.
- **Decision:** ACCEPTED.
- **Decision owner:** MinhNb2 (owner) / Culi.
- **Effective requirement version:** SRS v0.1 / RS-20260819-01 (unchanged; impl-state only).

## CR-0004 — China transport (hysteria2) + Android stability/device-limit release

- **ID:** CR-0004
- **Title:** Android China transport, background-connection stability và giới hạn 3 thiết bị
- **Requested by:** Owner (chỉ đạo trực tiếp trong phiên làm việc 2026-09-12)
- **Date:** 2026-09-12
- **Affected requirements:** FR-VPN-* (transport/connectivity), FR-REVOKE-* (quản lý thiết bị), NFR-REL-* (độ ổn định), NFR-SEC-* (không đổi baseline bảo mật)
- **Current requirement:** transport WireGuard UDP + relay TCP chỉ mang tính chứng minh; chưa có giới hạn số thiết bị
- **Proposed requirement:**
  1. Transport chính cho khách Trung Quốc là **hysteria2** (UDP + obfs salamander) với **TCP relay** dự phòng cho mạng chặn UDP; app tự chuyển transport và ghi nhớ transport đã thành công.
  2. Tunnel phải **giữ được khi app ở background trên mạng metered** (dùng foreground service `specialUse`) và **tự kết nối lại vô hạn có backoff** thay vì bỏ cuộc.
  3. Mỗi tài khoản tối đa **3 thiết bị đang hoạt động**; khi vượt, hệ thống chặn kết nối và app hiển thị danh sách để người dùng **đăng xuất thiết bị cũ**.
- **Reason:** lỗi "Connected but no internet"/"chập chờn" trên mạng Trung Quốc; yêu cầu thương mại về số thiết bị; chuẩn bị phát hành Google Play.
- **Implementation (đã giao):**
  - Android **1.2.4 (versionCode 4)**: APK bán web (`/v1/downloads/android`) + AAB Play (`VPNFlow-1.2.4-play-store.aab`).
  - Server: control-plane thêm `POST /v1/devices/claim` + env `MAX_DEVICES_PER_USER=3`.
  - Node: hysteria2 3 cổng UDP + 2 TCP relay, chạy bằng systemd (`tools/node-setup/`).
- **Evidence:** `docs/CHINA_TRANSPORT_ROADMAP.md`, `docs/ANDROID_METERED_BACKGROUND_DATA.md` (đã fix), `docs/DEVICE_LIMIT.md`, `docs/E2E_ANDROID_DEVICE_TEST.md`, `docs/PLAY_SUBMISSION.md`, log thật trên node1 (`journalctl -u flowvpn-cp`) và adb logcat của phiên test.
- **Impact analysis:** không đổi baseline SRS; các requirement WireGuard cũ vẫn hợp lệ nhưng **không còn là transport chính** cho Android (đánh dấu PARTIAL/SUPERSEDED cần owner xác nhận khi sync `.privatevpn/status/requirements.json`).
- **Recommendation:** accept (đã chạy production, đã kiểm thử thiết bị thật).
- **Decision:** PROPOSED — chờ owner chấp thuận.
- **Decision owner:** MinhNb2 (owner).
- **Effective requirement version:** đề xuất nâng lên RS-20260912-01 sau khi ACCEPTED.

## CR-0005 — VPNFlow Windows client (đưa non-iOS client vào scope)

- **ID:** CR-0005
- **Title:** Yêu cầu cho client VPNFlow trên Windows (desktop app)
- **Requested by:** Owner (chỉ đạo trực tiếp 2026-09-13)
- **Date:** 2026-09-13
- **Affected requirements:** SRS §2 Scope; SRS §3 Out of scope (bỏ "non-iOS clients" và "billing/subscriptions" khỏi ánh xạ cho Windows);
  SRS **A7** (dòng 310: "Windows … WireGuardNT") — đề nghị **supersede**; `docs/ARCHITECTURE.md` dòng 209 cùng nội dung;
  nhóm mới **FR-WIN-001…016**, **NFR-WIN-001…005**, **AC-024…AC-030**
- **Current requirement:** SRS §3 xếp "non-iOS clients" là out of scope; chỉ có iOS/macOS/Android
- **Proposed requirement:** thêm **Windows client** vào scope với 11 FR và 5 NFR, chi tiết ở
  `docs/spec/WINDOWS_CLIENT_REQUIREMENTS.md` (tái dùng coordinator + transport hysteria2/TCP relay + giới hạn 3 thiết bị)
- **Reason:** khách hàng (đặc biệt tệp dùng Windows tại Trung Quốc) cần client desktop; backend đã sẵn sàng, không cần sửa server
- **Implementation (chưa có):** đề xuất 4 phase (P1 proxy mode → P2 TUN/wintun → P3 auto-update + installer ký → P4 tuỳ chọn)
- **Evidence:** chưa có (đây là requirement mới). Khi triển khai phải có: build trên Win11 x64/arm64, E2E từ mạng TQ, log SHA256 update, `route print` trước/sau disconnect
- **Impact analysis:** không đổi requirement iOS/Android hiện có; SRS §3 cần bỏ "non-iOS clients" khỏi danh sách out-of-scope khi CR được ACCEPTED
- **Backend cần bổ sung (không fork):** kênh version theo nền tảng cho Windows (`/v1/app-version` hiện chỉ trả cấu hình iOS);
  và quyết định **per-user hysteria auth** (hiện dùng chung 1 mật khẩu nằm trong APK/EXE). `/v1/peers/heartbeat` **không tồn tại** → Windows không dùng.
- **Open questions:** Q1–Q6 trong `docs/spec/WINDOWS_CLIENT_REQUIREMENTS.md` §9 (TUN vs proxy, code-signing cert, Microsoft Store,
  WireGuard legacy, Windows Server/IPv6, per-user hysteria auth)
- **Review độc lập:** bản v1 của spec đã được một worker agent (opencode) review; 10 phát hiện đã được verify và xử lý trong bản v2 (§0 của spec)
- **Recommendation:** accept phần scope + FR/NFR; chốt Q1–Q5 trước khi bắt đầu code
- **Decision:** PROPOSED — chờ owner chấp thuận và trả lời Q1–Q5
- **Decision owner:** MinhNb2 (owner)

## Change history

| CR | Date | Type | Result | Effective baseline |
|----|------|------|--------|--------------------|
| CR-0001 | 2026-08-19 | Initial baseline | ACCEPTED | RS-20260819-01 |
| CR-0002 | 2026-08-20 | Docs sync + privacy review (AC-019 evidence) | ACCEPTED | RS-20260819-01 |
| CR-0003 | 2026-08-20 | Privacy fixes (NFR-PRIV-001 + NFR-SEC-004 → IMPLEMENTED) | ACCEPTED | RS-20260819-01 |
| CR-0004 | 2026-09-12 | Android China transport (hysteria2 + TCP relay) + background stability + giới hạn 3 thiết bị | PROPOSED | RS-20260819-01 (đề xuất RS-20260912-01) |
| CR-0005 | 2026-09-13 | Windows client (FR-WIN-*/NFR-WIN-*) — đưa non-iOS client vào scope | PROPOSED | RS-20260819-01 (đề xuất RS-20260913-01) |

## Rules for changes

- Material changes (behavior/security/UX/scope/AC/tests, spec §10) require a new CR-xxxx.
- Formatting/typo changes do not require a CR.
- Accepted material changes trigger: impact analysis (§12) → affected tasks marked
  CONTEXT_STALE → re-verification of affected claims (RULE-REQ-006).
