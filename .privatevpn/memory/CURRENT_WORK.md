# CURRENT_WORK.md

Current task tracked here (schema per spec §31). Structured state also in
`.privatevpn/status/project.json`.

| Field | Value |
|-------|-------|
| Task ID | TASK-IOS-PROD-PUBLISH-PREP (active) / TASK-G3-ACCOUNT-MULTIDEVICE (next) |
| Objective | Prepare FlowVPN iOS production build for App Store submission: StoreKit paywall, privacy/support/legal links, localization, install/device fixes, and Apple review checklist. NEXT after iOS publish: account login + add device (Tailscale-style). |
| Requirement IDs | FR-VPN-001..005, FR-DEVICE-001/002, FR-PROVISION-001/002, FR-AUTH-001, NFR-SEC-001, NFR-UX-001, NFR-PERF-001, NFR-REL-001 |
| Requirement baseline | RS-20260819-01 |
| Rule baseline | RULESET-0001 |
| Expert consultations | none yet; mesh/coordinator integration done (2026-08-21) |
| Assigned agent/runtime | Culi (orchestrator) |
| Status | iOS app is in App Store publish-prep. Real-device install blocker was fixed by giving the packet tunnel extension a non-empty `CFBundleVersion`. StoreKit paywall is enabled for Release/App Store; Debug builds bypass premium for local VPN testing only. Apple checklist pass is local/config-only; Archive/Validate/Upload are not yet verified. macOS build/runtime fixes are in progress: embedded packet tunnel, stale profile cleanup, IPv4-only tunnel route, iPhone-sized window, duplicate Connect-tap guard, and paywall close button. |
| Files in scope | iOS/, mac/PrivateVPNMac/, mac/PrivateVPNMacPacketTunnel/, project.yml, Vendor/WireGuardKit/, control-plane/ (superseded), scripts/mac-test.sh, docs/, .privatevpn/, evidence/ |
| Dependencies | xcodegen 2.46.0, Go 1.26.6 (currently suspicious: `go list fmt` failed locally), Node 24 (VPS coordinator), Xcode, StoreKit products in App Store Connect, Network Extension-capable signing/provisioning |
| Acceptance criteria | iOS Archive + Validate + Upload pass; App Store Connect build processing succeeds; reviewer can access live backend, privacy/support URLs, subscription products, and VPN flow. |
| Expected evidence | Xcode Organizer archive, App Store Connect upload success, `/v1/nodes` live, iOS device install/run, Review Notes submitted |
| Start commit | fafbf5b (GATE 0) |
| End commit | af972a9 (exit-node registry + server list + macOS toggle); NE refactor pending commit |

## Latest iOS publish-prep state (2026-08-22)

- App Store metadata was completed by the user in App Store Connect.
- iOS `Info.plist` app version maps to `MARKETING_VERSION = 1.0` and build `CURRENT_PROJECT_VERSION = 1`.
- iOS packet tunnel extension uses literal `CFBundleShortVersionString = 1.0` and `CFBundleVersion = 1`; this fixed the device install popup:
  `MissingBundleVersion` for `PrivateVPNPacketTunnel.appex`.
- `SubscriptionStore.isSubscribed` returns `true` only under `#if DEBUG` so the user can test VPN on device without completing a StoreKit purchase. Release/App Store still requires verified StoreKit entitlements.
- StoreKit product IDs in code: `Monthly_Premium`, `Yearly_Premium`.
- Paywall includes price rows from StoreKit, restore purchases, privacy/support/EULA links, and an auto-renew/free-trial/cancel disclosure.
- Settings includes language picker, subscription status, choose plan, restore purchases, manage subscription, support, privacy policy, and Apple Standard EULA.
- Privacy/support pages are live:
  - `https://meetflowai.site/FlowVPNPrivacy.html`
  - `https://meetflowai.site/SupportPrivateVPN.html`
- Local validations passed:
  - `plutil -lint` for iOS app plist, packet tunnel plist, and both entitlements.
  - `xcrun --sdk iphoneos swiftc -parse ...` for iOS app Swift files.
  - `curl -I` privacy/support pages returned HTTP/2 200.
- Not verified yet:
  - Xcode Archive, Validate App, Upload to App Store Connect.
  - App Store Connect processing/review.
  - Production StoreKit free trial behavior from App Store Connect.

## Latest macOS state (2026-08-23)

- macOS app is branded FlowVPN and uses NetworkExtension + WireGuardKit through
  `PrivateVPNMacPacketTunnel.appex`; no `wg-quick`, sudo, or Homebrew `wg`
  runtime path should be used for production.
- `project.yml` must keep the macOS extension embedded under
  `FlowVPN.app/Contents/PlugIns/PrivateVPNMacPacketTunnel.appex`; the app icon
  copy script must not remove it.
- `VPNManagerMac` removes stale `FlowVPN` / `FPT PrivateVPN` profiles, creates a
  fresh `NETunnelProviderManager`, saves it, reloads it from preferences, then
  starts the tunnel to avoid stale-configuration errors.
- macOS WireGuard config is IPv4-only full tunnel for now:
  `AllowedIPs = 0.0.0.0/0`. Do not add `::/0` until IPv6 overlay support is
  provisioned and verified.
- macOS UI uses an iPhone-sized fixed content window, shows
  `Preparing VPN permission...` while connecting, disables duplicate Connect
  taps during connecting/disconnecting, surfaces safe errors, and the paywall
  includes a close (`X`) button.
- macOS now loads exit nodes from `GET /v1/nodes` on launch/main-screen task,
  shows a server selector in the main window and menu bar, disables Connect
  until a backend node is available, and `connect()` fails with
  `No exit node available from the coordinator.` when the coordinator returns
  no nodes.
- macOS Premium is temporarily unlocked for normal use while Mac App Store
  product IDs are deferred. This is implemented only in `MacSubscriptionStore`;
  iOS StoreKit gating remains unchanged for App Store publish.
- Local-only admin exit-node guide/config were created under ignored `secrets/`:
  `ADMIN_EXIT_NODE_GUIDE.md` and `flowvpn-vps-root-access.env`. These files are
  intentionally not for GitHub and contain only placeholders unless the owner
  fills secrets locally.
- Build verification passed after these changes. macOS end-to-end public exit IP
  remains to be verified with the correct Network Extension signing profile.
- macOS server-selection upgrade verification:
  `.privatevpn/reports/2026-08-23-macos-server-selection.md`.

## Clone prompt state (2026-08-23)

- `docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md` is the handoff prompt for Android and
  Windows clones.
- Android/Windows scope is client-only: reuse
  `https://api.meetflowai.site`, `GET /v1/nodes`, `POST /v1/tokens`, and
  `POST /v1/peers/register`; do not rebuild backend.
- Android clone must preserve current iOS/macOS UI style, language picker with
  full language names + flags, Store/Billing paywall with close button, VPN
  permission consent flow, and dynamic exit-node selection.

## Next task (continuation rule §103)

- **🟡 BUG-20260823-001 (release blocker; repo fix DONE `afa7c7c` — deploy WAIT App Store approval):** production
  `POST /v1/tokens` is open without auth (confirmed 2026-08-23 — evidence
  `evidence/2026-08-23-tokens-open-production.md`). Anyone can mint join tokens -> free VPN
  (paywall bypass) and revoked devices can re-register (FR-REVOKE-002 at risk). Fix direction
  (owner): build the **account model** — users table, auth, user->devices ownership
  (FR-AUTH-001); issue tokens only for a registered user with active subscription; disable
  public dev bootstrap `/v1/tokens` outside local/internal builds; re-verify external
  unauthenticated POST -> 401/403. Current repo work adds Keychain auth sessions,
  email-code login UI, `/v1/enrollment-tokens`, Bearer-bound `/v1/peers/register`,
  and fail-closed legacy `/v1/tokens` / `/device` behavior in `control-plane/`.
  **Deploy safety (2026-08-23):** `control-plane` now supports dual-mode via `LEGACY_MODE`
  (default `1`): legacy `/v1/tokens` + unauthenticated `/v1/peers/register` keep working for
  the App-Store-review build while the new authenticated flow (email login, enrollment
  tokens) is also live. So a node deploy during the review window is safe — do NOT set
  `LEGACY_MODE=0` until the authenticated app is released.
  **DEPLOYED 2026-08-23 (see DECISIONS.md):** VPS production now runs this dual-mode
  server (`flowvpn-cp.service`, port 7778; Caddy switched; devices migrated 15/15;
  legacy flow verified for the review build; rollback script ready). LEGACY_MODE stays 1
  until the authenticated app is released.
  **Deploy timing (owner, 2026-08-23): initial guidance was DO NOT deploy to production yet** — the current
  app build (depends on open `/v1/tokens`) is submitted for App Store review; deploying the
  fail-closed fix now would break the reviewer's connect test. Deploy the coordinator fix +
  the authenticated app build **together AFTER App Store approval**, then:
  1. Deploy coordinator fix to VPS; verify unauthenticated `/v1/tokens` -> 401/403/410.
  2. Close remaining production gaps first (fix is NOT usable in production without these):
     (a) subscription source: **PENDING (owner)** — StoreKit products are under App Store
         Connect review; keep `AUTH_DEV_GRANT_SUBSCRIPTION` test grant for now; re-check
         after product review, then decide StoreKit receipt verification vs manual grant,
     (b) login: email-OTP needs a mailer — **SOLUTION DECIDED: Resend**
         (see `docs/MAILER_RESEND.md`; free 3k/mo + 100/day; implement `sendOtpEmail`
         in `control-plane/src/mailer.js`, wire into `/v1/auth/email/start`, add
         `RESEND_API_KEY`/`FROM_EMAIL` env, verify domain SPF/DKIM, add resend+verify
         rate limits); **login = email-only (owner decision)** — do NOT implement
         Sign in with Apple JWT verification and do NOT add Firebase Auth; keep
         `/v1/auth/apple` dev-only / 501 in production,
     (c) re-verify: signed-in subscribed user can mint enrollment token; unsubscribed /
         revoked cannot; revoked device cannot re-register (FR-REVOKE-002).
- **Next-version server selection upgrade (iOS remaining; macOS code/build verified)**:
  remove the production dependency on hardcoded `VPNLocation.presets` / local
  fallback nodes. On app launch, clients must load exit nodes from
  `GET /v1/nodes`, show the user a server/location selector, require a selected
  active backend node before Connect, then build the WireGuard config from that
  selected node. Keep any static node seed only as a DEBUG/internal fallback,
  not as the normal production UI path. macOS code/build verification is
  recorded in `.privatevpn/reports/2026-08-23-macos-server-selection.md`;
  real macOS egress remains pending signed NE profile.
- **Design + build account login & add-device (Tailscale-style)**: users table,
  auth (email+password or token), user→devices ownership, device list UI, revoke.
- Production device onboarding: keep registration idempotent by stable device
  identity/public key so any newly installed app instance can join without peer-name
  collisions. Current iOS client now generates a stable `ios-<device-id>` name and
  fetches a fresh one-time join token for every provisioning attempt. Production
  backend must issue enrollment tokens for a registered user ID with an active
  subscription and consume them to attach the device record to that user; the
  current public dev `/v1/tokens` bootstrap endpoint must be disabled outside
  local/internal builds.
- iOS production key handling: WireGuard private key and control-plane credentials
  are stored in shared iOS Keychain. VPN provider configuration must not contain
  private keys; the Packet Tunnel extension loads the private key from the shared
  Keychain access group at tunnel start.
- Coordinator TLS is enabled at `https://api.meetflowai.site` via Caddy reverse
  proxy to local Node `127.0.0.1:7777`; Caddy HTTP/3 is disabled because
  WireGuard uses UDP 443 on the same VPS.
- Sign macOS app with an NE-capable Mac App Development profile; verify end-to-end tunnel via NetworkExtension (confirm exit IP = 103.173.155.50).
- TODO production macOS distribution: decide App Store vs direct distribution. Current
  macOS packet tunnel is packaged as an app extension, which is App Store-only
  for packet tunnel providers. For Developer ID/direct distribution, migrate the
  macOS tunnel provider to a Network Extension System Extension and use the
  `packet-tunnel-provider-systemextension` entitlement.
- Update SRS/ARCHITECTURE for Tailscale model + macOS target.
- Keep Android/Windows clone prompt current with frontend/client-only scope and
  current iOS/macOS UI behavior.
- Push iOS app to FPTVPN repo.
- iOS App Store publish continuation: Clean Build Folder → Archive → Validate →
  Upload. If archive fails with WireGuard/Go (`package fmt is not in std`), fix
  local Go toolchain before retrying. If upload fails, inspect signing/profile
  for both `com.privatevpn.app` and `com.privatevpn.app.packet-tunnel`.
- iOS real-device E2E: verify public IP, DNS, HTTPS, reconnect, and disconnect
  with production coordinator URL after publish build is stable.

## E2E device test (2026-08-23, đang chờ owner test trên iPhone)

- App iOS signed đã cài trên iPhone 14 Pro Max (bản login + backend-first + force update DISABLED).
- macOS unsigned không gọi được network (lsof: no socket) → cần Xcode Run signed để test Mac.
- Force update: **DISABLED** (minimum_version=0.0.0) — chưa có version trên App Store (owner note).
- Allowlist: minhnb2@me.com + support@meetflowai.site (debug_code + grant sub).
- Khi owner test: điền `evidence/e2e/README.md`, chạy server-verify (wg peer/handshake + health + users).

## Trạng thái cuối ngày 2026-09-13 (bàn giao — mai tiếp)

### Việc ĐANG CHỜ (owner quyết định mai làm)
1. **iOS / Xcode Cloud** — nguyên nhân fail đã tìm ra & đã fix:
   - `.gitignore` có `*.xcodeproj/` ⇒ repo **không chứa** `PrivateVPN.xcodeproj`; nguồn sự thật là `project.yml` (xcodegen).
   - Đã thêm **`ci_scripts/ci_post_clone.sh`** (mode 100755): cài Go + xcodegen → `xcodegen generate` → kiểm tra shared scheme (commit `f674e02`, `d7cd46d`).
   - **2026-09-13 (tiếp):** build lại local phát hiện thêm 4 lỗi code chặn CI → đã fix (commit `08c847e`):
     `VPNManager.logOutDeviceAndRetry` gọi `ControlAPIClient()` thiếu `baseURL`/`joinToken` (lỗi từ `47c5fac`);
     warning `data` không dùng trong `deleteAccount`; test target không resolve được module vì `PRODUCT_NAME: FlowVPN`
     ⇒ thêm `PRODUCT_MODULE_NAME: PrivateVPN` vào `project.yml`; `InMemoryKeychainBackend` thiếu `delete(for:)`.
   - **Kiểm chứng local (xanh hết):** `PrivateVPN` Release `generic/platform=iOS` → BUILD SUCCEEDED;
     scheme `PrivateVPN` test trên simulator iPhone 17 / iOS 26.5 → **40 test, 0 failure**; scheme `PrivateVPNMac` → BUILD SUCCEEDED.
   - **Việc của owner:** chạy lại workflow Xcode Cloud (scheme `PrivateVPN`, nên bật cả action **Test**); nếu còn fail → dán tên bước + log cho agent.
   - Chi tiết + lệnh kiểm chứng: `docs/XCODE_CLOUD.md`.
2. **Google Play (VPNFlow)** — AAB sẵn sàng: `release/android/VPNFlow-1.2.4-play-store.aab` (link `https://meetflowai.site/dl/VPNFlow-1.2.4-play-store.aab`).
   Cần: khai **Foreground service type = specialUse** (text ở `docs/PLAY_SUBMISSION.md` §4c) + video demo (`https://meetflowai.site/dl/VPNFlow-foreground-service-demo.mp4`),
   App access `review@meetflowai.site` / code `246810` (account đã được dọn về 0 thiết bị), privacy `https://meetflowai.site/FlowVPNPrivacy.html`.
   Tài khoản Play **cá nhân** ⇒ cần **closed testing 12 tester × 14 ngày** (hoặc đi Organization + D-U-N-S, xem `docs/PLAY_ORG_ACCOUNT_DUNS.md`).
3. **Windows client** — requirement đã viết (CR-0005 PROPOSED, `docs/spec/WINDOWS_CLIENT_REQUIREMENTS.md`).
   **Chờ owner trả lời Q1–Q6** (TUN vs proxy, code-signing cert, Microsoft Store, WireGuard legacy, Windows Server/IPv6, per-user hysteria auth).
4. **Bảo mật** — repo GitHub `minhfat-ux/FPTVPN` đang **PUBLIC**: đề xuất owner chuyển **Private**; credential hysteria đã redact khỏi docs/script (còn trong `Config.kt` vì app cần, coi như không bí mật).
   Cân nhắc đổi auth+obfs mới (script hoá) — chờ owner quyết.
5. **Branch `web`** đang bị worktree `/Volumes/BIWIN/SourcesCode/PrivateVPN-production` giữ và có thay đổi staged của agent khác ⇒ chưa sync với `main` (cần chạy `git merge --ff-only main` khi worktree rảnh).
6. **codebuddy** hết hạn subscription (`429 Enterprise subscription has expired`) ⇒ chỉ dùng được `opencode` cho delegate (xem RULE-DELEGATE-001, `docs/AGENTIC_PROJECT_WORKFLOW.md` §10b).

### Đã xong trong ngày (tóm tắt)
- Android 1.2.4 phát hành (APK web + AAB Play): fix mobile-data (foreground service `specialUse` + retry vô hạn + nhớ transport + Brutal CC), giới hạn 3 thiết bị (server `POST /v1/devices/claim` + dialog logout 5 ngôn ngữ).
- Control-plane: refactor `deviceLimitDecision` + test (28/28 pass), sửa 3 test cũ lỗi thời, deploy node1 + test live.
- Node tooling: `tools/node-setup/` (hysteria + relay Go + systemd), `docs/AGENT_NEW_NODE_GUIDE.md`, `docs/EXIT_NODE_IP_GUIDE.md`.
- MeetFlowAI: AAB 1.0.4 (play) + APK (china) + release notes 5 ngôn ngữ; trang support đổi sang bản release.
- Workflow agent: `AGENTS.md` + `CLAUDE.md` + `RULE-DELEGATE-001` + template brief; đã kiểm chứng worker tự đọc luật.

## 14/09/2026 — Android "Cannot reach VPNFlow service" (đã fix + phát hành 1.3.3)

**Nguyên nhân (đo được trên đúng mạng khách):** GFW chặn cả 2 IP node (`ping` 100% loss) → mọi request
API trực tiếp chết; **APK đang phát ở `/v1/downloads/android` là 1.2.8 (versionCode 8) — dex không có
chuỗi `fcnvpn.tail303be3.ts.net`, tức KHÔNG có đường dự phòng**; bản 1.3.2 trên máy test có fallback
nhưng phụ thuộc DNS cho host Funnel, mà khi tunnel UP + transport chết thì DNS bị hút vào tunnel
(`Unable to resolve host "fcnvpn.tail303be3.ts.net"`); thêm nữa node-1 hết sạch đĩa (`/` 100% vì
`/tmp/tcpcap.txt` 11,2 GB) và trả 502 cho host API.

**Đã làm:**
- App 1.3.3 (versionCode 13): ghim IP cho `api.meetflowai.site` + `fcnvpn.tail303be3.ts.net`
  (`Config.PINNED_HOST_ADDRESSES`), resolver mới `api/PinnedDns.kt` (IP ghim trước, DNS hệ thống chỉ chờ
  ≤1,2 s), `WSRelayBridge` dùng cùng resolver, fallback khi IOException **và** 502/503/504, so đúng origin,
  nhớ host dự phòng 10 phút, connectTimeout 3 s. Test: `ApiFallbackTest` + `PinnedDnsConfigTest` → **20 test, 0 fail**.
  **Đã kiểm chứng trên Fold5 ở mạng đang chặn**: log `api: dùng host dự phòng fcnvpn.tail303be3.ts.net (HTTP 200)`.
- Phát hành APK modern + legacy 1.3.3 lên node-2 (`sha256` khớp build), gate `android_latest_version` = 1.3.3
  (minimum giữ 1.2.6). Khách bị chặn tải được qua Funnel: `https://fcnvpn.tail303be3.ts.net/v1/downloads/android`.
- Hạ tầng: dọn 11,2 GB `/tmp` node-1 (`/` 100% → 40%); `cp-proxy` đi **HTTPS** tới node-2 (SNI + verify cert);
  Caddy node-1 trỏ upstream vào `cp-proxy` (7781) ⇒ **IP node-1 hết 502**, dùng lại được làm cửa dự phòng.

**Còn lại:** (1) node-2 còn mở cổng 7778 công khai bằng HTTP → nên bind 127.0.0.1 (phải sửa `index.js`,
file đang có session khác sửa); (2) iOS/macOS chưa có API dự phòng + chưa ghim IP; (3) thêm URL dự phòng
thứ hai (Cloudflare) + ghim IP; (4) đổi IP node-1.

Chi tiết đầy đủ: `docs/HANDOVER_2026-09-13_china_ip_block_and_funnel.md` §8.

## 14/09/2026 — Dọn đĩa + nghỉ hưu coordinator cũ trên node-1

- **node-1: `/` 100% → 27%** (5,0 GB dùng / 14 GB trống). Đã xoá: `/tmp/tcpcap.txt` 11,2 GB +
  `hycap.txt`/`speedtest.bin` (bắt gói còn sót), 9 APK VPNFlow cũ + 4 APK MeetFlowAI cũ trong
  `/root/flowvpn-apk` (node-1 KHÔNG còn phục vụ APK — mọi request đi qua cp-proxy → node-2),
  APK/AAB cũ trong `/var/www/flowvpn/dl` (1.2.2 ×2 147 MB, AAB 1.2.2/1.2.3/1.2.7, APK 1.2.6/1.2.7),
  `VPNFlow-diag-1.2.4.apk`, `MeetFlowAI-debug.apk.bak`, các file `.bak` HTML, `/tmp/web.tgz` +
  `cp-deps.tgz` + `cp-src-data.tgz`, bản `/tmp/cloudflared` trùng, apt cache, và `/root/privatevpn`.
- **Nghỉ hưu `privatevpn.service`** (coordinator đời cũ, port 7777, chạy từ `/root/privatevpn`):
  đã **stop + disable** (không ai nối vào 7777, Caddy không trỏ tới, `/health` trả 404) rồi mới xoá thư mục.
  Unit file giữ nguyên để còn khôi phục nếu cần.
- **Giữ lại ở node-1** (vì có link sống / để rollback): `MeetFlowAI-1.0.4-china.apk` (link trong trang support),
  `VPNFlow-1.2.4-play-store.aab` (docs PLAY_SUBMISSION trỏ tới), bộ 1.2.8 trong `/dl`, video demo, `speedtest-50mb.bin`.
- **node-2: 51% → 49%** — xoá 7 file backup/APK cũ trong `/root/flowvpn-apk` (382 MB), giữ đúng cặp đang phát
  (1.3.3 modern + legacy) + 1 cặp backup gần nhất (1.2.8) + `MeetFlowAI-latest.apk`.
- Kiểm chứng sau dọn: 3 cửa API (IP node-1 qua cp-proxy / DNS node-2 / Tailscale Funnel) đều 200;
  `/v1/downloads/android` trả đúng 96.519.748 bytes (1.3.3) ở cả 3 cửa; file tĩnh `/dl/*` của node-1 vẫn 206;
  gate `android_latest_version` = 1.3.3.

## 14/09/2026 — macOS: build đã sửa, phát hành thì CHƯA (chi tiết §9 handover)

- **Lỗi chặn build đã sửa**: target `PrivateVPNMacPacketTunnel` thiếu `WGRelayClient.swift`/`WSRelayClient.swift`
  (và `WSRelayDefaults` nằm ở `ControlAPIClient.swift`) ⇒ macOS không compile từ lúc iOS thêm relay.
  Nay target macOS dùng cùng nguồn với extension iOS ⇒ build + ký OK (Apple Development + profile tự tạo).
- **Thêm parity**: `VPNManagerMac` truyền relay vào config (`.withRelay().withNodeId().withWSRelayURL()`).
- **Test local**: app chạy, API OK, profile NE lên `Connected`, overlay `10.77.0.9` vào utun14 — nhưng KHÔNG có
  traffic vì **tài khoản test chạm giới hạn 3 thiết bị** (`device_limit_reached` trong log CP; 1 lần trước đó là
  `Device has been revoked`). Các thiết bị mới `.41…48` đều có peer trên node-1 ⇒ đường cấp peer vẫn tốt.
- **Blocker phát hành**: (1) tunnel là app extension ⇒ chỉ Mac App Store, muốn phát web phải chuyển
  **system extension**; (2) chưa có pipeline macOS (script hiện export IPA của iOS, chưa có DMG/notarize);
  (3) backend chưa có kênh macOS (`/v1/app-version` trả payload iOS ⇒ nút Cập nhật đưa khách Mac sang IPA iPhone,
  `/v1/downloads/macos` 404); (4) version lệch (mac 1.3.2/12 vs Android 1.3.3/13); (5) không có test macOS.
- **Cảnh báo vận hành**: bật tunnel FlowVPN trên máy Mac này sẽ ngắt Tailscale; phải bật lại bằng
  `tailscale up --accept-routes --exit-node-allow-lan-access --exit-node=100.76.147.111`, nếu không máy mất mạng
  dù `scutil` vẫn ghi "Connected".
- iOS sau khi sửa `project.yml` vẫn xanh: Release BUILD SUCCEEDED, **51 test 0 fail**.

### ⚠️ Ghi chú quy trình commit (14/09, agent DSH)

Commit `6b6272a` (fix macOS) **vô tình gồm cả phần đang STAGED của session khác** trong `control-plane/`
(`src/index.js`, `src/app-version.js`, `src/payments.js`, `src/sepay.js` + test) vì `git commit` lấy toàn bộ index,
không chỉ các path mình vừa `git add`. **Không mất dữ liệu**: working tree của session kia vẫn còn nguyên các sửa
đổi chưa staged, họ chỉ cần commit tiếp. Nhưng message của `6b6272a` không mô tả phần control-plane đó.

**Từ giờ bắt buộc**: commit theo pathspec — `git commit -- <file...>` (hoặc `git commit -o <path>`) để không kéo
theo thay đổi staged của session khác. Nhiều session dùng chung một checkout nên tuyệt đối không `git add -A`
và không `git commit` trần.
