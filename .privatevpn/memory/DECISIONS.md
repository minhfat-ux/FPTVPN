# DECISIONS.md

Durable engineering decisions (see also `docs/adr/`).

| Date | Decision | Reference |
|------|----------|-----------|
| 2026-08-23 | **Owner reference:** the owner is **Minh (MinhNb2)**. Address the owner as **"Anh"** (Vietnamese honorific) in all communication. | this session (owner request) |
| 2026-08-23 | **Subscription source in production = PENDING (owner).** StoreKit products `Monthly_Premium` / `Yearly_Premium` are still under **App Store Connect review**; do not implement StoreKit receipt verification server-side yet. Keep the temporary `AUTH_DEV_GRANT_SUBSCRIPTION` test-grant path for now. **Re-check after App Store Connect product review completes**, then decide: StoreKit receipt verification (App Store Server API) vs manual grant policy. | this session (owner note) |
| 2026-08-23 | **Subscription production = keep allowlist (owner).** App Store products not approved yet; production keeps test-grant (`GRANT_SUB_EMAILS` + admin grant). New users outside the allowlist cannot mint enrollment tokens (403) until StoreKit receipt verification is implemented after product approval. Applies to the upgrade release. | this session (owner decision) |
| 2026-08-23 | **Node 2 (103.6.234.233) — multi-node exit**: setup WireGuard (wg0 10.77/5SEd...) nhưng bị **ghi đè lúc 20:02** bởi config `10.78.0.0/24` + key `OJPfJLblLP2KCQkPdqI1B7WHJT/U4BlzSxUTwh6vZ2c=` (nguồn chưa rõ — nghi nhà cung cấp hosting). Đã cập nhật registry vietnam-2 theo key thực tế; SSH-provision từ coordinator hoạt động (peer lên node 2 verified). **Rủi ro mở:** reboot node 2 có thể đổi key (nguồn ẩn) → cần kiểm tra lại; hỏi owner nguồn config. | this session |
| 2026-08-23 | **Reject bản review cũ + publish bản latest (owner):** bản đang trên App Store review sẽ bị **reject** (không approve bản cũ); sau đó **submit bản latest** (login email-OTP, backend-first nodes, Delete Account, force update disabled, Mac version 1.0). Owner sẽ làm trên App Store Connect sau khi đi chơi. Khi bản latest approve + release → mới set LEGACY_MODE=0 + bật force update. | this session (owner plan) |
| 2026-08-23 | **Admin page UX + per-node health:** admin page redesigned to list view + separate edit page (WireGuard public key preloaded on edit; token persisted in localStorage; auto-load on open). Added `GET /v1/admin/nodes/:id/health` (latency ping, bandwidth from `wg show transfer` per-peer sum, capability: wg up/peers/uptime/load) shown in a Health column. Exit-node registry stored in SQLite (`nodes.db`, `node:sqlite`). | this session (owner request) |
| 2026-08-23 | **Admin page public via domain (owner):** admin page reachable from the internet at `https://meetflowai.site/PrivateVPN/Admin` (Caddy `handle /PrivateVPN/*` -> 127.0.0.1:7778, strip prefix). IP restriction (localhost/SSH-tunnel-only) removed; admin **API** still requires `Authorization: Bearer AUTH_TOKEN` (401 without, 503 if unset). Supersedes the earlier SSH-tunnel-only rule in SRS A4. | this session (owner decision) |
| 2026-08-23 | **Production test login (owner dev testing):** `DEBUG_CODE_EMAILS=minhnb2@me.com` + `GRANT_SUB_EMAILS=minhnb2@me.com` set on `flowvpn-cp.service` — the owner can log in on macOS/iOS with email minhnb2@me.com: Send Code returns debug_code in-app, subscription `test.premium` granted on verify (verified: enrollment-tokens 201). Replace with real RESEND_API_KEY + App Store product review when available. | this session (deploy) |
| 2026-08-23 | **PRODUCTION DEPLOYED (new server, 2026-08-23):** VPS now runs the `control-plane/` dual-mode server via systemd `flowvpn-cp.service` (port 7778, NODE_ENV=production, LEGACY_MODE=1, dryRun=false). Caddy `api.meetflowai.site` -> 127.0.0.1:7778. Devices migrated from old sqlite (15 peers, same IPs 10.77.0.2-.16, same IDs). Old `privatevpn.service` (port 7777) still running for rollback; `/root/flowvpn-cp/rollback.sh` restores Caddy to 7777. Verified: legacy `/v1/tokens` 201 + legacy register 200/201 + real wg provisioning (peer appears in wg0) + `/v1/health` 200. **Still pending:** RESEND_API_KEY (email OTP login sends real mail), AUTH_TOKEN for admin endpoints (currently fail-closed 503), LEGACY_MODE=0 after authenticated app release. | this session (deploy) |
| 2026-08-23 | **Dual-mode deploy safety (owner):** `control-plane` gets `LEGACY_MODE` (default `1`): while the pre-auth build is under App Store review, deploy can keep `/v1/tokens` (one-time join token) + unauthenticated `/v1/peers/register` working AND expose the new authenticated flow (email login + `/v1/enrollment-tokens` + Bearer register). Set `LEGACY_MODE=0` after the authenticated app is released to fail closed. | this session (owner request) |
| 2026-08-23 | **Authentication = email-only (owner).** Production login uses email-OTP (Resend mailer) only. Do NOT implement Sign in with Apple JWT verification and do NOT add Firebase Auth (owner: setup is too heavy for this project). Keep `/v1/auth/apple` dev-only / 501 in production (or remove). | this session (owner decision) |
| 2026-08-23 | **Mailer = Resend** for OTP login emails (owner). Free tier 3,000 emails/month, 100/day, never expires. Solution doc: `docs/MAILER_RESEND.md`. Backup if scale: Brevo (300/day) or Resend Pro. No Gmail SMTP in production. | this session (owner decision) |
| 2026-08-23 | **BUG-20260823-001 deploy timing (owner):** DO NOT deploy the authenticated-enrollment fix to production yet. The current app build (which depends on open `POST /v1/tokens`) is already submitted for **App Store review**; deploying the fail-closed fix now would break the reviewer's connect test and cause rejection. Deploy the fix + the new authenticated app build **after App Store approval**. Until then production `/v1/tokens` stays open (known risk: paywall/revocation bypass; interim mitigations A rate-limit / B peer-cleanup declined for now by owner). | this session (owner decision) |
| 2026-08-19 | Xcode project generated via xcodegen (project.yml authoritative) | ADR-0001 |
| 2026-08-19 | VPN mechanism = Packet Tunnel Provider (NEPacketTunnelProvider) | ADR-0002 |
| 2026-08-19 | Separate app target + extension target | ADR-0003 |
| 2026-08-19 | Real VPN state model; evidence-gated verification; no fake connected | ADR-0004 |
| 2026-08-19 | GATE 1 targets simulator build (no signing team); real-device runtime deferred with documented blocker | SECURITY.md §4, PROJECT_STATE.md |
| 2026-08-19 | Requirement baseline RS-20260819-01 accepted | CR-0001 |
| 2026-08-19 | WireGuard framework = WireGuardKit (wireguard-apple), vendored into `Vendor/WireGuardKit` (patched sys/types.h for Xcode 26; wireguard-go pinned 2023 for Go 1.26 compat) | PROJECT_STATE.md, VERIFIED_FACTS.md VF-007 |
| 2026-08-19 | Device keypair kept per-device (Tailscale-style: user owns many devices); private key only in Keychain, never on server | ARCHITECTURE.md §2, VERIFIED_FACTS.md |
| 2026-08-19 | `libwg-go.a` built by a pre-build script (Go) at link time; simulator link unsupported (Go iOS-simulator runtime) → WireGuard is device-only | PROJECT_STATE.md |
| 2026-08-19 | Control plane = small Node.js/Express service (control-plane/): POST /device registers, IP pool 10.77.0.0/24 (server-assigned, Tailscale-style), wg set provisioning, optional bearer auth, DRY_RUN mode for dev | commit 464d793, control-plane/README.md |
| 2026-08-19 | Device registers with control plane on Connect when control-plane URL configured in Settings (ControlAPIClient); manual endpoint/peer entry remains as fallback | VPNManager.swift, SettingsView.swift |
| 2026-08-21 | **Switch from local Express control-plane to the VPS coordinator mesh** (`minhfat-ux/privateVPN`, Node 24, port 7777, node:sqlite). ControlAPIClient rewritten for `/v1/peers/register`. The previous `control-plane/` is superseded (kept, unused). | PROJECT_STATE.md, VERIFIED_FACTS.md VF-012 |
| 2026-08-21 | **Exit-node model (Tailscale-style)**: app connects to the VPS exit node (103.173.155.50:443, pubkey N0v...IQ8=) with allowedIPs 0.0.0.0/0 for Internet egress; coordinator auto-provisions peers into wg0 on register/revoke | VF-012, VPNManager*.swift |
| 2026-08-21 | **macOS target `PrivateVPNMac`** added; reuses ControlAPIClient. Legacy join-token bootstrap via `POST /v1/tokens` was used early, but production flow is now authenticated `POST /v1/enrollment-tokens` + `POST /v1/peers/register`. The initial `wg-quick` local test path is superseded by NetworkExtension + WireGuardKit. | project.yml, mac/PrivateVPNMac/ |
| 2026-08-21 | **Join token = single-use, 30-min expiry**; iOS and macOS auto-fetch a fresh enrollment token for each provisioning attempt (no manual paste/reuse). Production tokens must be user/subscription-bound, not public dev bootstrap tokens. | coordinator createJoinToken, VPNManager*.swift |
| 2026-08-21 | Peer registration names are stable per device (`ios-<device-id>`, `mac-<public-key-prefix>`) with random retry on server name collision because the coordinator enforces unique peer names. Backend remains idempotent by WireGuard public key. | VPNManager*.swift |
| 2026-08-22 | iOS production key handling: WireGuard private key is stored in shared Keychain access group `com.privatevpn.shared` and stripped from `NETunnelProviderProtocol.providerConfiguration`; Packet Tunnel reads the key from Keychain at start. | KeychainStore.swift, PacketTunnelProvider.swift |
| 2026-08-22 | Coordinator production URL is `https://api.meetflowai.site` behind Caddy reverse proxy to Node on `127.0.0.1:7777`; Caddy HTTP/3 is disabled so WireGuard can keep UDP 443 on the same VPS. | `/etc/caddy/Caddyfile`, VPNConfigStore.swift |
| 2026-08-22 | iOS App Store subscription model uses StoreKit 2 product IDs `Monthly_Premium` and `Yearly_Premium`; free trial is configured in App Store Connect, not hardcoded in app code. Release/App Store access is based on verified StoreKit current entitlements. | SettingsView.swift, App Store Connect metadata |
| 2026-08-22 | iOS Debug builds bypass premium (`#if DEBUG return true`) so VPN can be tested on device without completing a sandbox purchase. This must stay debug-only and must not be converted to a Release flag. | SettingsView.swift |
| 2026-08-22 | iOS packet tunnel extension uses literal `CFBundleShortVersionString = 1.0` and `CFBundleVersion = 1` because the extension target did not define `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`, which caused device install failure with `MissingBundleVersion`. | iOS/PrivateVPNPacketTunnel/Info.plist, project.yml, Xcode run xcresult |
| 2026-08-22 | App Store review checklist additions: paywall includes privacy/support/EULA links plus auto-renew/free-trial/cancel disclosure; Settings includes Manage Subscription link. | SettingsView.swift, Theme.swift |
| 2026-08-21 | **Exit-node registry on the coordinator** (`exit_nodes` table): `GET /v1/nodes` public, `POST`/`DELETE /v1/nodes` admin; VPS node seeded on first run | coordinator.ts, server.ts |
| 2026-08-21 | **Server list configured from backend**: apps fetch `/v1/nodes` and let the user pick an exit node (macOS Settings picker, iOS location picker) instead of hardcoded presets | VPNManagerMac, SettingsView, SettingsViewMac |
| 2026-08-21 | **macOS Connect/Disconnect = single toggle button** matching iOS one-tap UX (state-driven title/symbol/color) | ContentViewMac |
| 2026-08-21 | **Superseded historical decision**: dev macOS app briefly shelled to `wg-quick` for local testing only. This is no longer the production path. | PROJECT_STATE.md history |
| 2026-08-21 | **Production refactor (macOS) DONE**: macOS tunnel now uses NetworkExtension + WireGuardKit (no wg-quick/sudo/Homebrew). Added `PrivateVPNMacPacketTunnel` app-extension (reuses iOS `PacketTunnelProvider` + `WireGuardConfig`); `VPNManagerMac` uses `NETunnelProviderManager` + `NEVPNStatusDidChange`; `WireGuardKeychain` generates keys via WireGuardKit `PrivateKey()` (dropped shelling to `wg` binary). Build-verified (`CODE_SIGNING_ALLOWED=NO`); runtime needs NE-capable signing profile. | commit (NE refactor), VERIFIED_FACTS.md VF-016 |
| 2026-08-23 | macOS production package must embed `PrivateVPNMacPacketTunnel.appex`; build scripts must not delete `FlowVPN.app/Contents/PlugIns/PrivateVPNMacPacketTunnel.appex`. | project.yml, VERIFIED_FACTS.md VF-022 |
| 2026-08-23 | macOS connect flow removes stale VPN profiles, saves and reloads `NETunnelProviderManager`, uses IPv4-only full-tunnel routing (`0.0.0.0/0`) until IPv6 overlay support exists, disables duplicate Connect taps, and shows provisioning/permission feedback. | VPNManagerMac.swift, ContentViewMac.swift |
| 2026-08-23 | macOS UI should remain iPhone-sized on desktop, matching the current iOS app; paywall must have a visible close button. | ContentViewMac.swift, SettingsViewMac.swift |
| 2026-08-23 | macOS Premium is temporarily unlocked in `MacSubscriptionStore` so the Mac app can be used normally until separate Mac product IDs are configured. iOS StoreKit gating remains unchanged for App Store publish. | SettingsViewMac.swift |
| 2026-08-23 | Android and Windows clone scope is frontend/client only. They must reuse `https://api.meetflowai.site`, dynamic `/v1/nodes`, existing token/register flow, current branding, Store/Billing paywall, and five-language language pack. | docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md |
| 2026-08-23 | Admin exit-node operations documentation and VPS root-access config live under ignored `secrets/` as local-only files. Do not commit or push real root password, admin token, or private keys. | secrets/ADMIN_EXIT_NODE_GUIDE.md, secrets/flowvpn-vps-root-access.env |

| 2026-08-23 | **New WireGuard exit node `vietnam-2` added** (103.6.234.233, UDP 443, subnet 10.78.0.0/24, server pubkey `OJPfJLblLP2KCQkPdqI1B7WHJT/U4BlzSxUTwh6vZ2c=`); registered in main CP registry (active, ssh_target=root@103.6.234.233). New node runs wg0 + NAT only (no local control plane — main CP provisions peers via SSH). | control-plane nodes registry, this session |
| 2026-08-23 | **Devices synced across all nodes** via `sync-peers.py` cron every 5 min on main VPS: reads devices.json → `wg set peer` on every node (local + SSH); revoked devices removed. New registrations propagate to all nodes within 5 min. | /root/flowvpn-cp/sync-peers.py, crontab |
| 2026-08-23 | **DeepSeek API relay** at `https://dhs.meetflowai.site/deepseek/*` → `api.deepseek.com` (Caddy, strip /deepseek, Host rewrite). Lets the harness reach DeepSeek from networks where CloudFront is blocked (e.g. China) without a VPN. | /etc/caddy/Caddyfile |
| 2026-08-23 | **DSH harness branded "FPT China Harness"**: FlowVPN navy/green theme, FPT logo in-app, Culi favicon (tab/login/loading), browse-picker breadcrumb fix. Patches applied to node_modules — re-apply with `FPT-Harness/patches/apply-fpt-patches.py` after DSH updates. | .dhs-setup/fpt-harness-package/ |
| 2026-08-23 | **Backup drive `/Volumes/Backup` is corrupting data** (writes >~10KB read back as 0xff; small writes OK). DO NOT use for any data. Verified by hash mismatch on copied files. Needs Disk Utility First Aid / replacement. | this session (hash checks) |
| 2026-08-23 | **Workspace migration to Backup drive attempted + REVERTED**: sessions were moved + cwd rewritten, then fully restored to `/Volumes/BIWIN/SourcesCode/*` after Backup drive proved corrupt. DSH workspaces stay on BIWIN. | this session |
| 2026-08-23 | **Provider: keep default DeepSeek** (works without VPN on current network). For China network, fallback = custom provider `DeepSeek via VPS` (baseURL `https://dhs.meetflowai.site/deepseek`) or China-native hosts (Kimi `api.moonshot.cn/v1`, Zhipu `open.bigmodel.cn/api/paas/v4`, SiliconFlow `api.siliconflow.cn/v1`). | Settings → Models (GUI) |
| 2026-08-24 | **Bad-gateway root cause FOUND + FIXED**: duplicate launchd job `com.fpt.tunnel` (leftover, KeepAlive) fought `com.dsh.tunnel` — each ran `fuser -k 3080/tcp` on the VPS killing the other's SSH forward (676 "closed by remote host" in log). Booted out + disabled plist; patched `dsh-tunnel.sh` with single-instance lock (`mkdir /tmp/dsh-tunnel.lock` + trap) and moved stale-port cleanup outside the retry loop. Verified: 1 wrapper only, 0 flaps in 45s, public 302 stable. Tunnel routes via Tailscale (utun2 100.109.31.16) — harmless, kept. | ~/Library/LaunchAgents/com.fpt.tunnel.plist.disabled, /Users/minhnguyen/dsh-tunnel.sh |
| 2026-08-24 | **FPT Harness 1-click installer**: `install-fpt-harness.sh` (package root + symlink at workspace root) — one command on the Mac does everything: FPT patches (idempotent, .fpt.bak), profile browse-picker, auto-start launchagents (com.dsh.server + com.dsh.caffeinate, now packaged in mac/), reverse tunnel via setup-tunnel.sh (single-job, lock), and remote VPS install (scp vps/ → sudo install-vps.sh). Flags: --mac-only, --vps-only <domain>, --vps <IP>, --domain, --ssh-user, --auth-user/pass, --yes. Symlink-aware SRC resolution; live-tested --mac-only (DSH UP, tunnel UP). | .dhs-setup/fpt-harness-package/install-fpt-harness.sh, README.md |
| 2026-08-24 | **Phone browser cache fixed at nginx gate**: DSH sends no cache headers for `/assets/*` and `no-cache` for plugins, so every browser reopen refetched MBs. Added `location /assets/` + `/plugins/@deepseek-ai/` blocks with `proxy_hide_header Cache-Control;` + `Cache-Control: public, max-age=31536000, immutable` (URLs are content-hashed/rev-versioned → cache-forever safe). Root `/` stays no-store (plugin-graph freshness), SSE/API uncached. Verified single clean header through public path with auth cookie. | /etc/nginx/sites-available/dhs-gate (bak: .bak-cache), vps/nginx-dhs-gate in package |
| 2026-08-24 | **End of session (wrap-up)**: bad gateway FIXED (root cause: duplicate launchd jobs com.fpt.tunnel vs com.dsh.tunnel fighting — removed legacy job, patched wrapper with single-instance lock); phone browser caching FIXED at nginx gate (immutable for /assets/ + /plugins/@deepseek-ai/, root stays no-store); 1-click installer `install-fpt-harness.sh` delivered + live-tested (--mac-only); nginx+caddy verified clean (0 errors post-fix); caffeinate auto-start confirmed running. **TODO next session (2026-08-25)**: fix MeetFlowAI control-plane backend, review & research stability (see CURRENT_TASK.md TASK-20260825-MEETFLOWAI-BACKEND). | CURRENT_TASK.md, DECISIONS.md |
| 2026-08-24 | **DSH GUI "Ungrouped" group renamed to "MeetFlowAI"**: patched `dsh-client-ui-workspace/lib/client.js` (UNGROUPED_LABEL + i18n group.ungrouped + delete.desc; backup .fpt.bak) and added patch 7c to `apply-fpt-patches.py`. Mac (local) shows after browser refresh; phone needs DSH restart because plugin rev = shortHash(file content) computed at startup and phone has immutable cache on plugin URLs. | apply-fpt-patches.py, FPT-HARNESS-NOTES.md sec 14 |
| 2026-08-24 | **App Store promotional text (macOS) drafted EN/ZH/VI** (158/58/147 chars, ≤170 limit): highlights one-tap connect, WireGuard security, multi-location servers, clean UI. Saved to `docs/APP_STORE_METADATA.md`. Can be changed anytime without review. | docs/APP_STORE_METADATA.md |
| 2026-08-24 | **App Store Description (macOS) drafted EN/ZH/VI** (1100/445/1140 chars, ≤4000 limit): features (one-tap, multi-location, WireGuard, clean UI) + **1-month free trial then subscription** with auto-renew/cancel disclosure per Apple review rules. Saved to `docs/APP_STORE_METADATA.md`. | docs/APP_STORE_METADATA.md |
| 2026-08-24 | **Rebrand FlowVPN → VPNFlow**: app renamed; updated App Store metadata (`docs/APP_STORE_METADATA.md`) — all Description texts EN/ZH/VI now say VPNFlow (promo texts had no brand name, unchanged). | docs/APP_STORE_METADATA.md |
| 2026-08-24 | **Mac product IDs wired**: App Store Connect IDs `Mac_monthly` + `Mac_yearly` → `MacSubscriptionStore.productIDs` (SettingsViewMac.swift) + localized noPlansDetail strings (VPNThemeMac.swift, 5 languages). iOS keeps its own IDs (unchanged). DEBUG unlock in MacSubscriptionStore kept for local dev. | mac/PrivateVPNMac/SettingsViewMac.swift, mac/PrivateVPNMac/VPNThemeMac.swift |
| 2026-08-24 | **Apple-standard subscription disclosure on paywalls (iOS + Mac)**: `.subscriptionDisclosure` expanded to full required wording in 5 languages (payment charged to Apple ID at confirmation; auto-renew unless canceled ≥24h before period end; renewal charged within 24h prior to period end; manage/cancel in Apple ID Account Settings; unused trial portion forfeited on purchase). iOS: updated Theme.swift strings. Mac: added key + strings to VPNThemeMac.swift and rendered it in the paywall footer (SettingsViewMac.swift). Both builds verified (Mac + iOS Simulator, CODE_SIGNING_ALLOWED=NO). | ios/PrivateVPN/Theme.swift, mac/PrivateVPNMac/VPNThemeMac.swift, mac/PrivateVPNMac/SettingsViewMac.swift |
| 2026-08-24 | **Mac: premium from backend + paywall layout fixes**: (1) MacSubscriptionStore was StoreKit-only → added `backendPremium` from `authStore.session.user.subscription_status.is_active`, synced in ContentViewMac + SettingsViewMac (onAppear + onChange session) → account premium (minhnb2@me.com) unlocks Mac release builds without purchase. (2) MacPaywallView wrapped in ScrollView + fixed frame 438×720 → sheet no longer clipped/misaligned on macOS. Build verified. | mac/PrivateVPNMac/SettingsViewMac.swift, mac/PrivateVPNMac/ContentViewMac.swift |
| 2026-08-24 | **Mac flow: login-first, paywall only when no subscription**: ContentViewMac now shows login first; after token received (session change / keychain restore) syncs backendPremium and auto-presents paywall ONLY if not subscribed; sign-out closes paywall. Premium accounts (minhnb2@me.com) never see paywall. Build verified. | mac/PrivateVPNMac/ContentViewMac.swift |
| 2026-08-24 | **Mac menu bar server list redesign**: replaced Picker dropdown with `.menuBarExtraStyle(.window)` popover + ScrollView list (max 5 rows × 30pt visible, scrollable); each row has a Select button that sets selectedNodeID and connects immediately (or opens Settings if not subscribed); current connected server shows "Connected" + disabled; added `.select` key in 5 languages. Build verified. | mac/PrivateVPNMac/PrivateVPNMacApp.swift, mac/PrivateVPNMac/VPNThemeMac.swift |
| 2026-08-24 | **Mac main window polish**: (1) golden crown badge (crown.fill, yellow, on dark circle) at top-left of app logo when subscription active — replaces the "Premium Active" card; (2) big 44pt connection icon removed from status card → small 8pt dot + caption status placed right below the app logo; (3) subscriptionStatusCard (upgrade CTA) now only renders when NOT subscribed. Build verified. | mac/PrivateVPNMac/ContentViewMac.swift |
| 2026-08-24 | **iOS UI synced with Mac**: golden crown badge on app logo (top-left) when premium, small 8pt status dot + caption under logo, big status icon (172pt circle/58pt SF) removed from status card (kept text + inline spinner), subscription upgrade card only when not subscribed. Also added `backendPremium` to iOS SubscriptionStore (reads subscription_status.is_active) synced on onAppear/session change — backend-premium accounts now show the crown on iOS too. Both builds verified. | ios/PrivateVPN/ContentView.swift, ios/PrivateVPN/SettingsView.swift |
| 2026-08-24 | **iOS main screen simplified**: server dropdown → scrollable list view (max 5 rows, Select button per row; select first, then Connect via big button); removed "Connected to" status card and subscription upgrade card from main screen (status stays as small dot under logo; upgrade via Settings/paywall flow); added `.select` key in 5 languages. Build verified. | ios/PrivateVPN/ContentView.swift, ios/PrivateVPN/Theme.swift |
| 2026-08-24 | **Mac main window server list + permission-wait UX (Mac + iOS)**: (1) Mac main-window server dropdown → scrollable list view (max 5 rows, Select button selects + connects; mirror of menu bar/iOS); (2) while waiting for VPN permission/connecting: visible spinner + "Preparing VPN permission…" (new `.preparingPermission` key, 5 languages) and ALL buttons disabled — Mac: select rows/refresh/connect/upgrade; iOS: select rows/refresh/connect (now disabled while .connecting)/settings gear. Both builds verified. | mac/PrivateVPNMac/ContentViewMac.swift, mac/PrivateVPNMac/VPNThemeMac.swift, ios/PrivateVPN/ContentView.swift, ios/PrivateVPN/Theme.swift |
| 2026-08-24 | **Mac menu bar → native macOS style**: reverted custom `.menuBarExtraStyle(.window)` list popover to `.menuBarExtraStyle(.menu)`; server selection now a native submenu (checkmark on selected node), status/plan text rows, standard Buttons + Dividers, Quit ⌘Q; app title "VPNFlow". Select-server then Connect (native interaction). Build verified. | mac/PrivateVPNMac/PrivateVPNMacApp.swift |

## 2026-08-25 — Android clone (VPNFlow Android)

- **Quyết định**: Build bản Android native (Kotlin + Jetpack Compose), clone
  đúng hành vi iOS/macOS hiện tại (backend-first, login OTP, paywall Play Billing,
  5 ngôn ngữ, theme dark).
- **WireGuard Android**: dùng `com.wireguard.android:tunnel` (AAR chính thức,
  Apache-2.0, chứa wireguard-go + GoBackend$VpnService tự khai báo trong manifest
  khi merge). Không tự viết VpnService từ đầu.
- **Google Play Billing 7.x**: đã bỏ suspend ktx extensions — dùng callback API
  (queryProductDetailsAsync / queryPurchasesAsync + listener).
- **Product IDs Android**: `Monthly_Premium` / `Yearly_Premium` (giống iOS).
- **Debug unlock**: `BuildConfig.DEBUG → isSubscribed = true` (giống iOS #if DEBUG).
- **ExFAT workaround (BIWIN)**: macOS ghi xattr `com.apple.provenance` → ExFAT
  lưu thành file `._*` (AppleDouble) cạnh mỗi file build output → aapt/d8 chết.
  Giải pháp: chuyển build dir sang APFS (`~/.vpnflow-build`) qua
  `layout.buildDirectory` trong root build.gradle.kts. Không dùng fileTree
  `**/._*` (Gradle default-excludes `._*`).
- **Sign-in Android**: không có Sign in with Apple → dùng email OTP (backend đã hỗ trợ).
- **Build verified**: assembleDebug + assembleRelease (R8 + proguard) đều PASS.
  APK debug 33.8MB / release-unsigned 16.1MB.

## 2026-08-24 — REBUILD remote access DSH (spec port 13080, sau incident proxy)

- **Sự cố trước**: setup cũ tạo local proxy helpers + sửa macOS System HTTP/HTTPS Proxy
  (com.vmware.storage.identitydaemonworker.eq03 giả mạo, NODE_OPTIONS=--require preload.js,
  proxy dynamic port) → CẤM tuyệt đối tái tạo.
- **Quyết định kiến trúc (spec mới)**: DSH → SSH reverse tunnel → VPS 127.0.0.1:**13080**
  → nginx gate 3081 (auth cookie) → Caddy HTTPS dhs.meetflowai.site. Mac KHÔNG làm proxy,
  KHÔNG root, KHÔNG LaunchDaemon.
- **Port VPS tunnel = 13080** (KHÔNG phải 3080 như bản cũ) — nginx upstream đã đổi
  7× proxy_pass 3080 → 13080 (backup: /etc/nginx/sites-available/dhs-gate.bak-13080).
- **Persistence**: 1 LaunchAgent duy nhất `com.dsh.tunnel` (user minhnguyen, KeepAlive,
  wrapper ~/dsh-tunnel.sh có lock chống trùng, fuser -k 13080 1 lần, retry 8 lần).
- **SSH key**: ~/.ssh/dsh_tunnel (ed25519, riêng tunnel, pubkey đã cài trên VPS
  authorized_keys — cài qua key fpt_tunnel có sẵn, KHÔNG cần password).
- **Failure-isolation đã test**: stop tunnel → remote DSH unavailable, local DSH 200,
  proxy macOS không đổi, browsing bình thường. /login vẫn 200 (auth 9090 độc lập).
- **Phương pháp làm việc theo yêu cầu user**: audit trước → báo cáo → chờ duyệt từng
  phase → test tay trước → mới tạo persistence. Đã chạy đủ 9 phase, user duyệt từng bước.

## 2026-08-27 — Android verified trên máy thật + Play Console setup

- **Verified end-to-end trên Samsung Z Fold 5 (SM-F9460, RFCX110TCWA)**:
  install, login OTP (minhnb2@me.com), premium crown, server list (2 node),
  Connect→node-1 (IP 103.173.155.50), chọn dòng server→Connect→node-2
  (IP 103.6.234.233), Disconnect (IP về thật). Backend stats: 6 devices
  (2 mac, 2 ios, 2 android).
- **Bug tìm thấy + fix trên máy thật**:
  (1) Nút "Select" server không có click handler → bấm cả dòng = select
  (commit 923c3a6, 3677697).
- **Dashboard admin (control-plane)**: thêm tab Dashboard — /v1/admin/stats
  đếm device THẬT (có userId, exclude probe/test), theo user + platform +
  online peers (wg handshake <3min) + region IP. 42→5 device thật (37 test
  tách riêng). Commit 14e87d4, 22a7913.
- **Release signing**: keystore CN="Minh Nguyen Binh", O=VPNFlow.
  Keystore: ~/keystores/vpnflow-release.jks + secrets/vpnflow-release.jks
  (gitignored). Backup: /Volumes/BIWIN/VPNFlow-Backup/release-signing/
  (jks + properties + pass + README). Properties:
  ~/keystores/vpnflow-signing.properties (gradle load sẵn). Release APK
  đã ký 15MB: ~/.vpnflow-build/app/outputs/apk/release/app-release.apk.
  SHA-256: dc6e484b... (ghi trong README-BACKUP).
- **Play Console**: account đang VERIFY (tạo với tư cách individual,
  tránh DUNS). Chờ verify xong → create app (VPNFlow, com.privatevpn.app),
  upload key, upload APK, tạo Monthly_Premium/Yearly_Premium + free trial.
- **QUYẾT ĐỊNH**: BỎ Windows (không làm bản Windows FPT harness nữa —
  user từ chối; để nguyên bundle đã tạo trong package nếu sau này cần).

## 2026-09-08 — Chống tái diễn lỗi revoke/fake-connected (toàn nền tảng)

- **Nguyên nhân lỗi "coordinator reject"**: device bị revoke (từ nút Revoke
  trong app UI) → backend trả 403 "Device has been revoked" → app giữ key
  cũ, bị chặn vĩnh viễn → fake connected (VpnService UP nhưng wg handshake=0).
- **Giải pháp (đã build PASS cả 3 nền tảng)**:
  (1) Bỏ Revoke khỏi app UI (iOS/Mac/Android) — devices read-only.
  (2) Tự xoay WG keypair khi bị revoked: iOS KeychainStore.rotatePrivateKey(),
  Mac WireGuardKeychain.rotate(), Android DeviceIdentity.rotateKeyPair()
  (commit 81de5b9 trước đó).
  (3) Wrapper tunnel dọn port mỗi retry (bad gateway).
- **iOS+Mac build SUCCEEDED** (commit 96a61ae). Android đã cài lên Samsung
  (bản mới có cả 3 fix).
- Keystore backup: /Volumes/BIWIN/VPNFlow-Backup/release-signing/.
  CN khớp: Minh Nguyen Binh / VPNFlow (script setup-release-signing.sh đã
  align, f22f3d7).

## 2026-09-13 — Dashboard: thiết bị đang kết nối theo từng server + ISP/IP thiết bị

- **Yêu cầu owner**: dashboard hiện chart số thiết bị đang kết nối theo từng server,
  và location thật của các thiết bị.
- **Nguồn dữ liệu**: `wg show <iface> dump` của TỪNG exit node (endpoint = IP công khai
  của client, latest_handshake, rx/tx) ghép với device registry (publicKey → user/device).
- **QUYẾT ĐỊNH (owner chọn)**: KHÔNG dùng API geolocation bên thứ ba — chỉ hiển thị IP
  công khai + ISP/country hint suy từ reverse DNS (PTR), cache 6h + timeout 1.5s; IP không
  có PTR hiện "unknown ISP". Lý do: NFR-PRIV-001, không gửi IP người dùng ra ngoài.
- **Bug phát hiện + sửa**: `WireGuardManager.dump()/listPeers()/serverPublicKey()` trước đây
  LUÔN chạy `wg` ở máy coordinator và bỏ qua `ssh_target` → peer của mọi node remote không
  bao giờ được đọc (dashboard đếm thiếu, node remote luôn 0 peer). Đã thêm `_read()` chạy qua
  SSH khi node có `ssh_target`; `_run()` tái sử dụng `_sshArgs()`.
- **API**: `GET /v1/admin/stats` thêm `by_node` (online/tổng peer theo server), `by_location`
  (gom theo ISP), `online_devices` (chi tiết thiết bị, tối đa 200 + cờ
  `online_devices_truncated`), `connections_totals`; giữ nguyên mọi field cũ (back-compat).
- **UI**: tab Dashboard thêm chart "Online Devices per Server"; chart cũ đổi thành
  "Online Devices by ISP"; thêm bảng "Online Devices (live)".
- **Bằng chứng**: `evidence/2026-09-13-dashboard-live-connections.log` (39/39 test pass +
  E2E 2 exit node + kiểm tra dashboard HTML/JS).

## 2026-09-13 — Tầng 1: sửa gốc lỗi "connected nhưng không có mạng" (Android)

Tiếp nhận từ `docs/HANDOVER_2026-09-13_china_ip_block_and_funnel.md`. Bốn hạng mục
Tầng 1 (commit `3d46f51`, `f6d58fd`).

- **Nguyên nhân gốc**: `WSRelayBridge` khi mất kết nối chỉ set `connected=false`.
  Hysteria vẫn giữ socket UDP trỏ vào bridge nên `serve()` KHÔNG trả về → tunnel nằm
  `tunnelUp=true` mà không gói nào đi đâu cả. Đúng log 21:41–21:42 ngày 13/09.
- **QUYẾT ĐỊNH**: sửa ở tầng bridge, không ở tầng service. `WSRelayBridge` nhận callback
  `onDead` (gọi từ `onFailure`/`onClosed`/`onClosing`), service gọi `Mobile.stop()` để
  `serve()` trả về và `runTunnel()` dựng lại transport. Lý do: chỉ tầng bridge biết chắc
  cầu đã từng mở rồi mới chết; service không phân biệt được "chưa từng lên" với "vừa chết".
  Gác hai điều kiện `running` + `opened` và chỉ báo một lần, nên `stop()` chủ động của
  service không bị coi là sự cố.
- **Watchdog**: `probeThroughTunnel()` nay trả `Boolean`; 2 lần probe liên tiếp thấy tunnel
  UP mà HTTP **và** DNS đều không trả lời thì `Mobile.stop()` để dựng lại (trước đây chỉ
  `warn`). Để 2 lần vì mạng di động TQ hay mất gói từng cú; chỉ tính chết khi cả hai probe
  đều tịt để tránh dương tính giả khi một trong hai bị chặn riêng.
- **Trần thời gian bắt tay**: `armAttemptBudget()` (4s đường trực tiếp, 15s đường WS).
  Cần vì client Go nằm trong `hysteria.aar` đóng sẵn, không truyền được timeout handshake
  từ Kotlin; không có trần thì mỗi cổng chết treo tới hạn nội bộ của QUIC. Timer tự vô hiệu
  theo TOKEN khi `reportUp()` hoặc khi lượt thử kết thúc — cố ý không đọc cờ toàn cục
  `tunnelUp` vì cờ đó có thể còn giá trị cũ và sẽ làm timer không bao giờ nổ.
- **Thứ tự thử transport**: preferred → 2 TCP relay → 1 cổng UDP trực tiếp → WS relay →
  các cổng UDP còn lại. Người không bị chặn vẫn đi đường cũ (<1s); người bị chặn không phải
  thử hết 5 cổng chết trước khi tới WS (trước ~25s, nay ~7–11s). Bỏ qua đường trực tiếp đã
  thử ở lượt ưu tiên, nhưng KHÔNG bỏ qua `"ws"` (mở WS có thể hỏng tạm thời).
- **Brutal CC đường relay**: thêm `HY_RELAY_UP_KBPS=800` / `HY_RELAY_DOWN_KBPS=4000` dùng
  riêng cho lượt thử qua WS. Trước đây dùng chung 20Mbps của đường trực tiếp, mà đường relay
  đi qua 2 chặng nên server pace theo số khai và tự gây nghẽn. Số này là mức khởi điểm bảo
  thủ, **cần chỉnh theo số đo thật**.
- **Bằng chứng**: `evidence/2026-09-13-tier1-android-tunnel-recovery.log`
  (`:app:compileModernReleaseKotlin` OK, `:app:assembleModernRelease` OK gồm R8 + lintVital).
  **CHƯA test trên thiết bị thật** — không có máy nào kết nối adb; các bước đo ghi ở mục 3
  của file bằng chứng.


## 2026-09-13 (tối) — Panel admin: vào được từ mạng bị chặn + sửa bẫy Base URL

- **Owner báo "không access được link"**. Chẩn đoán thật: panel **không hỏng** — từ trong VN
  `https://meetflowai.site/PrivateVPN/Admin` trả **200**. Nguyên nhân là **GFW chặn IP cả 2 node**
  từ mạng TQ (đo từ chính máy owner: `103.6.234.233` tắc cả 443/80/22, trong khi `example.com:443`
  và `github.com:22` OK; traceroute đi qua China Mobile rồi tắc) — đúng sự cố đã ghi ở
  `docs/HANDOVER_2026-09-13_china_ip_block_and_funnel.md`.
- **Đường vào khi bị chặn (đã kiểm chứng):** `https://fcnvpn.tail303be3.ts.net/admin` —
  Tailscale Funnel → `cp-proxy` (node-1) → control plane node-2. Vì đi thẳng vào control plane
  nên **KHÔNG có prefix `/PrivateVPN`**; API của panel gọi cùng origin nên vẫn chạy.
- **Bẫy đã sửa (bug thật)**: panel tự suy `Base URL` từ `window.location`, nhưng giá trị **đã lưu
  trong localStorage luôn được dùng lại**. Ai từng mở panel qua `meetflowai.site` rồi chuyển sang
  mở qua Funnel (đúng tình huống mạng bị chặn) thì page vẫn gọi API về domain đang bị chặn ⇒ panel
  trắng dữ liệu. Nay chỉ dùng lại base cũ khi **cùng origin** với trang đang mở.
- **Đã deploy lên node-2** (`/root/flowvpn-cp/src/admin-page.js`, backup
  `/root/admin-page.js.bak-2026-09-13-222909`, md5 khớp, `systemctl restart flowvpn-cp` → active;
  HTML serve khớp tuyệt đối code HEAD `3857f7f1705fa1fa`).
- **`check-public-surface.py`**: thêm `/PrivateVPN/Admin` vào `SITE_PATHS` — panel trước đây không
  nằm trong bộ kiểm nên sự cố này vô hình.
- **Bằng chứng phụ cho fix peer remote**: trên production, node "Hanoi 1" báo 44 peer còn
  "Hanoi 2" báo 43 (union 44) ⇒ hai node đọc **hai interface khác nhau** (node-1 qua SSH), tức bản
  sửa `WireGuardManager._read()` chạy đúng thật; trước đó cả hai đều đọc wg0 của coordinator.
- **Bằng chứng**: `evidence/2026-09-13-admin-panel-blocked-network-access.log`.

## 2026-09-14 — node-2 đổi IP 103.6.234.233 → 165.101.114.162: trang buy "không vào được"

- **Triệu chứng owner báo**: trang buy không vào được, ngay sau khi đổi IP node-2.
- **Chẩn đoán (đo thật)**: server KHÔNG hỏng — ép đi thẳng IP mới thì
  `/buy` = 200, `/PrivateVPN/Admin` = 200, `/v1/health` = 200, assets + QR (momo/wechat/alipay)
  đều 200, `/v1/nodes` đã trỏ `165.101.114.162:443`. Nguyên nhân là **cache DNS trên máy owner
  vẫn giữ IP cũ**: `dscacheutil`/`ping` → `103.6.234.233` (đã chết, GFW chặn), còn `dig` → IP mới;
  `curl` thường = HTTP 000 trong khi `curl --resolve <IP mới>` = 200. TTL bản ghi A = **3600**.
  ⇒ Cần `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` (cần mật khẩu, agent không
  chạy được) hoặc chờ hết TTL; nên hạ TTL về 60.
- **Hỏng thật do đổi IP (đã sửa)**: `cp-proxy` trên node-1 vẫn `UPSTREAM_IP = 103.6.234.233`
  ⇒ **Tailscale Funnel chết hoàn toàn** (mọi request `/buy`, `/admin` timeout) — đây là đường dự
  phòng duy nhất cho mạng bị chặn. Đã sửa (backup `/root/cp-proxy.js.bak-2026-09-14-102244`),
  restart, Funnel `/buy` = 200, `/admin` = 200.
- **Đã sửa kèm**: `/etc/caddy/Caddyfile` node-1 `trusted_proxies` → IP mới (backup
  `/root/Caddyfile.backup-2026-09-14-102244`, `caddy validate` OK, reload OK). Nếu không sửa, mọi
  IP khách bị dồn thành IP node-2.
- **Node-2 đã đúng sẵn** (do phiên khác cập nhật khi đổi IP): block `http://<IP>` trong Caddyfile,
  `WG_PUBLIC_ENDPOINT=165.101.114.162:443`.
- **Phát hiện phụ (chưa sửa)**: block `http://<IP>` của node-2 trỏ `/var/www/dl` — thư mục không
  tồn tại trên cả 2 node ⇒ `http://<IP>/` = 404 (route chết từ trước). Endpoint chính
  `/v1/downloads/android` vẫn 200 (~96.5 MB).
- **Cảnh báo đang diễn ra**: trên node-2 có upload APK dở dang `/root/flowvpn-apk/.new-modern.apk`
  (53 MB, 10:31) — phải kiểm dung lượng/md5 sau khi xong, tránh phát file cụt cho khách (lỗi đã
  gặp 13/09).
- **Đã ghi vào docs**: `docs/MEETFLOW_AI_OPS.md` — checklist 4 chỗ BẮT BUỘC sửa khi đổi IP máy chính
  (cp-proxy, trusted_proxies node-1, block http://IP node-2, WG_PUBLIC_ENDPOINT) + cách xử lý cache.

## 2026-09-15 — iOS Ad Hoc OTA nối vào trang buy + tự map UDID → account (đã deploy)

- Trang buy giờ hiện khối **"Cài trên iPhone / iPad (Ad Hoc)"** (4 bước × 5 ngôn ngữ: mở bằng Safari,
  đăng ký thiết bị → iOS gửi UDID, shop thêm UDID vào Apple + ký lại, cài rồi Trust certificate).
  Khối chỉ hiện khi kênh iOS đang là trang cài tự phát; nếu là link App Store thật thì ẩn.
- `?token=` (enrollment token của account đã mua) đi từ trang cài vào callback mobileconfig →
  `authStore.lookupEnrollmentToken()` ⇒ UDID **tự map** đúng account (không tiêu thụ token, nên app
  vẫn dùng lại được cho `/v1/peers/register`). Token sai/hết hạn chỉ là "chưa map", không chặn khách.
- Admin có tab **iOS UDID** + `POST /v1/admin/ios/devices/:udid/account` để map/kiểm tra.
- **Sự cố deploy (đã khắc phục)**: deploy đầu tiên copy `src/index.js` từ working tree — file này có
  thay đổi dở của agent khác (`import "./device-replace.js"`, module không có trên server) ⇒ crash loop,
  production down ~3–4 phút (00:39→00:42). Khôi phục từ `/root/cp-backup-2026-09-15-003902` rồi deploy
  lại bản index.js **đã lọc chỉ 3 hunk của mình**. Từ nay: luôn `git diff HEAD` + soát `import` trước khi
  copy file lên server; không deploy file đang bị agent khác sửa.
- Bằng chứng: `evidence/2026-09-15-ios-adhoc-ota-buy-and-account-mapping.log`.

## 2026-09-15 — Nạp khoá App Store Connect thật → tự đăng ký UDID đã chạy

- Chủ shop cung cấp `AuthKey_8GW3662G64.p8`. Key ID `8GW3662G64`, Issuer ID lấy từ
  `scripts/ios-add-udid.sh` (`7a64d085-…`), Team `G6XW3RN6LJ`.
- Khoá được nạp **trực tiếp vào store của control plane trên node-2**
  (`/root/flowvpn-cp/data/apple-asc.json`, quyền 0600) — file `.p8` tạm trên server đã xoá sau khi nạp,
  và khoá **không** nằm trong git/repo.
- Verify thật: `GET /v1/admin/ios/apple` → `configured:true`, Apple trả về **4 thiết bị** của tài khoản
  (MacBook Air, iPhone, iPad của chủ shop).
- Đồng bộ trạng thái: `POST /v1/admin/ios/apple/register-pending` → 2 UDID trong hệ thống
  (`00008101-000A55C01E85001E`, `00008120-0008299A26D80032`) hoá ra **đã có sẵn trên Apple**
  ⇒ được đánh dấu `appleAlreadyRegistered`, panel hiện ✅ thay vì "—".
- Từ giờ khách đăng ký máy mới ⇒ server **tự đẩy UDID lên Apple** ngay trong callback
  (log: `ios-udid: Apple → OK`), không phải copy tay nữa.
- Còn lại để cài được trên iPhone: ký lại IPA với provisioning profile chứa UDID mới (máy Mac),
  rồi khách bấm link cài + Trust certificate.

## 2026-09-15 — Bug "Invalid Profile" khi cài hồ sơ UDID (tự gây ra, đã sửa)

- Thêm `?token=` vào callback URL ⇒ dấu `&` **thô trong XML** ⇒ `.mobileconfig` không well-formed ⇒
  iOS báo **Invalid Profile**, khách không đăng ký được máy. Phát hiện bằng cách parse chính file
  production tải về (`plistlib`: `not well-formed (invalid token)`), không đoán.
- Kèm theo: `buildDeviceProfile()` dùng **cùng một PayloadUUID cho cả 2 payload** — Apple yêu cầu mỗi
  payload một UUID riêng (test cũ chỉ đếm số UUID nên lọt).
- Đã sửa: `xmlEscape()` cho mọi giá trị nội suy, `contentUuid` riêng cho payload con, chỉ thêm token khi
  có token; thêm 2 test chống tái diễn. Bài học: **mọi giá trị chèn vào plist XML phải escape**, và
  test phải kiểm nội dung hợp lệ (parse được), không chỉ kiểm sự tồn tại của khoá.

## 2026-09-15 — Ad Hoc OTA chạy thật trên iPhone (chốt) + 5 lỗi đã sửa

Kết quả: cài được app trên iPhone thật của chủ shop. 5 lỗi phải sửa mới đi hết đường:
1. `.mobileconfig` phải có `PayloadType` CẤP CAO NHẤT = `Profile Service` và `PayloadContent` = `<dict>`
   (bọc trong `<array>` của profile `Configuration` ⇒ iOS cài mà KHÔNG gửi UDID).
2. Mọi giá trị chèn vào plist XML phải `xmlEscape()` (`&token=` thô ⇒ iOS báo **Invalid Profile**).
3. Trang cài phải nhận ra máy bằng **mã phiên (sid)** — iOS gửi UDID ngầm, khách không thấy trang
   callback ⇒ poll theo UDID trong localStorage là không bao giờ biết. Và **luôn hiện nút Tải & cài**.
4. Callback phải nhận RAW body và tự nhận dạng (plist thẳng / form / JSON).
5. iOS 26 gửi body **CMS/PKCS#7** ⇒ phải cắt plist XML trong khối nhị phân.
Hành vi đã xác nhận: iOS **luôn hiện "Invalid Profile"** sau khi gửi UDID (vô hại, đã ghi trong popup);
`VERSION` iOS gửi là số build; `Content-Disposition: attachment` phá luồng cài (đã bỏ).

## 2026-09-15 — Paywall + mục Subscription (3 nền tảng)

- **Paywall trong app** = chỉ ĐĂNG KÝ TÀI KHOẢN + THANH TOÁN: trang `/buy` thêm `?inapp=1` để ẩn mọi
  thứ về tải/cài app (khối tải, hướng dẫn Ad Hoc, link guide). iOS/Android mở paywall kèm cờ này.
  Trang web thường KHÔNG đổi (khách mới vẫn cần nút tải).
- **Mục Subscription**: đã đăng nhập + đã mua gói ⇒ hiện ĐÚNG gói đang dùng + ngày hết hạn + số ngày
  còn lại, nút đổi thành **Gia hạn** (mở paywall để gia hạn/mua thêm). Chưa mua ⇒ như cũ (Nâng cấp).
  Áp dụng iOS, macOS, Android.
- Tên gói lấy từ backend (`subscription_status.plan_badge`, hook `setPlanLabelResolver` → plan-store):
  một nguồn duy nhất thay vì dịch tên gói ở 3 app; app vẫn có fallback suy từ `product_id`.
- Lưu ý commit `2e906dc`: message bị bash ăn mất chữ `plan_badge` (backtick trong lệnh) — nội dung code
  không ảnh hưởng, chỉ thiếu chữ trong mô tả commit.

## 2026-09-15 — Khách thật đăng ký máy mới: tự đăng ký Apple + ký lại IPA (đã phát)

- Máy mới (iPhone17,2, build 23G90, UDID `00008140-00121C460C7B001C`) đăng ký lúc 09:09 ⇒ server
  **tự đẩy UDID lên App Store Connect** (`ios-udid: Apple → OK`) — tính năng chạy thật với khách thật.
- IPA đang phát chưa có UDID đó ⇒ chạy `scripts/ios-adhoc-export.sh --no-upload` (tạo lại profile Ad Hoc
  qua ASC API, 4 UDID) → upload lên node-2 → `POST /v1/admin/ios/devices/built` (buildSerial 6).
  Verify: file công khai 4.945.796 bytes, sha256 khớp, profile chứa cả 4 UDID.
- **Sự cố tự gây (~1–2 phút)**: lệnh upload vòng qua node-1 sai quoting ⇒ IPA 0 byte trên node-2
  (route tải trả file rỗng). Khôi phục từ node-1 + verify. Từ nay: sau khi copy file lớn qua 2 chặng
  phải kiểm `size` + `sha256` tại đích trong cùng một lệnh.

## 2026-09-15 — Bỏ hẳn phụ thuộc máy Mac: ký IPA trên node-1 bằng zsign + chứng chỉ sinh trên server

- **Vấn đề**: ký IPA cần macOS (`codesign` + khoá trong keychain). Máy Mac hay **ngủ/tắt Tailscale**
  (hôm nay rớt 3–4 lần) ⇒ watcher trên Mac không đáng tin; export khoá `.p12` từ keychain lại cần người
  ngồi máy nhập mật khẩu (thử 4 lần đều không ra file).
- **Giải pháp**: dựng máy ký Linux **node-1**:
  · `zsign` v1.1.2 (bản dựng sẵn, sha256 khớp release).
  · `refresh-profiles.mjs` — tạo lại profile Ad Hoc **đủ UDID + tất cả chứng chỉ Distribution** qua ASC API
    (dùng khoá ASC đã có trong control plane).
  · `create-cert.mjs` — **sinh khoá + CSR bằng openssl trên server** rồi **xin Apple cấp chứng chỉ mới**
    (`H4DSJC5XU5`); khoá riêng không bao giờ rời server ⇒ **không cần export từ keychain nữa**.
  · `resign-ipa.sh` — lấy IPA từ node-2 qua ssh → thay profile → zsign ký appex + app → đẩy lại node-2
    (kiểm sha256) → báo `built`.
  · `flowvpn-sign.timer` (15s) trên node-1 = tự động hoàn toàn; **watcher trên Mac đã tắt**.
- **Verify thật**: `codesign --verify --deep --strict` trên bản công khai = valid on disk + satisfies
  Designated Requirement; chuỗi chứng chỉ đủ (leaf + WWDR + Apple Root); entitlements VPN nguyên vẹn;
  profile 5 UDID. Khách mới (iPhone16,1) được xử lý tự động trong lúc triển khai.
- **Lưu ý**: chứng chỉ cũ `KCX28GM58P` vẫn nằm trong profile ⇒ app khách đang cài không bị ảnh hưởng.
  Không revoke nó (app đã ký bằng nó có thể không mở được nếu bị thu hồi).

## 2026-09-16 — Windows quay lại scope + nối UI vào tầng tunnel thật (owner đảo quyết định 27/08)

- **Owner đảo quyết định**: ngày 27/08 đã chốt **bỏ client Windows**; hôm nay owner yêu cầu làm tiếp ⇒
  **Windows trở lại scope**, kênh phát vẫn là bộ cài Inno Setup (`/dl/VPNFlow-Setup-latest.exe` trên `/buy`).
  Các mục "bỏ Windows" trong memory coi như hết hiệu lực.
- **Phát hiện (lỗi thật, không phải suy đoán)**: bản Windows đang phát **báo Connected giả** — nút Connect
  chỉ lật một cờ `bool` trong `MainView.axaml.cs` rồi tự đổi chữ/màu, **không hề dựng tunnel**. Grep cả
  project App cho thấy `VpnConnectionService`, `LoginViewModel`, `ControlApiClient`, `AuthSessionStore`,
  `DeviceIdentity` **không được view nào tham chiếu**; `LoginView`/`SettingsView` chỉ gọi
  `InitializeComponent` nên mọi nút đều không có handler; danh sách server hardcode 4 dòng.
  Vi phạm ADR-0004 / FR-VPN-005 (no fake connected) — cùng loại lỗi đã xử lý cho iOS/Mac/Android ngày 08/09.
- **Phạm vi owner chốt (option A)**: nối Connect vào tunnel thật + đăng nhập email-OTP + danh sách server
  từ `GET /v1/nodes`; **CHƯA chặn theo subscription** (khách vẫn dùng tự do như hiện tại).
  Việc chặn paywall + i18n 5 ngôn ngữ + claim hạn mức 3 máy để đợt sau.
- **Cách làm**: thêm `ViewModels/AppServices.cs` làm composition root (`AppServices.Shared`), nối
  `MainView` → `VpnConnectionService` (trạng thái suy từ tầng tunnel), `LoginView` → `LoginViewModel`,
  `SettingsView` → đăng xuất + mở link web thật; bỏ thanh nav dev, điều hướng theo luồng macOS
  (chưa đăng nhập ⇒ màn đăng nhập, bánh răng ⇒ Settings).
- **Đăng ký thiết bị**: gọi `POST /v1/devices/claim` (Bearer session) để bản cài thuộc tài khoản và
  hạn mức 3 máy có hiệu lực; lỗi mạng/hạ tầng KHÔNG chặn kết nối, chỉ `device_limit_reached` mới dừng.
  Lấy IP overlay + peer qua đường legacy `POST /v1/tokens` → `POST /v1/peers/register`
  (hệ quả của việc chưa chặn paywall — xem BUG-20260823-001).
- **Verify**: `dotnet build` solution **0 warning / 0 error**; `dotnet test` Core **53 passed / 0 failed**;
  build bộ cài OK (sha256 `7e14eddc119ca60f09373c9869c13a9e262003112eeb3b6acf86848d106e2b2e`); cài đè lên
  `%ProgramFiles%\VPNFlow` và cả 4 file khớp byte-for-byte với output publish; app chạy, title `VPNFlow`,
  `GET /v1/nodes` HTTP 200, `POST /v1/tokens` HTTP 201.
- **Việc còn lại**: E2E bấm Connect trên máy Windows thật (cần người bấm); chưa test tunnel thật lần nào
  trên Windows; `session.json` đang lưu **plaintext, không DPAPI** (lệch FR-WIN-001);
  `AuthSessionStore` chưa bind thiết bị vào user ở đường legacy.
- **Ghi chú build**: phải đặt `AVALONIA_TELEMETRY_OPTOUT=1` khi build trong sandbox (task telemetry của
  Avalonia ghi `%LOCALAPPDATA%\AvaloniaUI\BuildServices\buildtasks.log`); shell của DSH là
  **Windows PowerShell 5.1** nên `build.ps1` cần BOM UTF-8 để hiển thị đúng tiếng Việt.
- **Lưu ý license**: ISCC in ra dòng "Non-commercial use only" — cần kiểm tra điều kiện cấp phép của
  Inno Setup trước khi phát hành thương mại.

## 2026-09-16 (tiếp) — Bản Windows chạy thật: 3 lỗi gốc đã sửa + đã gỡ bản cài cũ

- **Đã sửa 3 lỗi, mỗi lỗi đều có bằng chứng đo thật** (commit tương ứng):
  1. `2b426ad` — **"Call from invalid thread"**: `VpnConnectionService` đổi `State` bên trong
     `await …ConfigureAwait(false)` nên `PropertyChanged` bắn từ thread pool; `MainView` phải đẩy
     về UI thread. Kèm: nối UI vào tunnel thật, login email-OTP, server từ `/v1/nodes`, UI nhỏ hơn,
     cửa sổ giữa màn hình, icon khay hệ thống, và **log ra file** `%APPDATA%\VPNFlow\vpnflow.log`
     (trước đó app là WinExe nên mọi log bị nuốt — đây là lý do các lỗi sau "câm").
  2. `5beefda` — **wireguard-go thoát exit 1**: pipe UAPI đặt owner `SYSTEM`; token admin đã elevated
     vẫn **đang tắt** `SeRestorePrivilege`/`SeTakeOwnershipPrivilege` nên `CreateNamedPipe` bị từ chối.
     Sửa bằng `ProcessPrivileges` (P/Invoke `AdjustTokenPrivileges`) bật trước khi spawn. Đồng thời
     **truyền logger xuống driver** (trước đó driver dùng `NullTunnelLogger` nên stderr của
     wireguard-go không vào log).
  3. `a66bab7` — **mất mạng sau khi Connect**: thiếu route loại trừ IP endpoint, nên sau khi gắn
     `0.0.0.0/1` + `128.0.0.0/1`, gói UDP của chính tunnel bị hút vào tunnel ⇒ handshake chết.
     Sửa: thêm `<endpoint>/32` qua gateway vật lý trước khi gắn route chia đôi, xoá lại khi ngắt.
- **Verify E2E (máy Windows thật)**: public IP từ 3 nguồn độc lập đều `165.101.114.162`;
  `meetflowai.site/buy` 200; `gstatic/generate_204` 204; DNS qua `1.1.1.1`. Monitor 10 phút
  (20 mẫu × 30s): **IP đúng 20/20**, adapter Up, route32 còn nguyên — nhưng có **re-handshake định kỳ**
  (~16:58, 16:59, 17:01, "stopped hearing back after 15 seconds" rồi lấy lại ngay) ⇒ nghi chất lượng
  UDP tới node, chưa phải lỗi routing.
- **Đã gỡ bản cài cũ** theo yêu cầu owner: chạy `unins001.exe` rồi `unins000.exe` (máy có 2 entry
  trùng). `C:\Program Files\VPNFlow` **xoá hẳn**, hết shortcut, hết entry registry. Bản mới hiện chạy
  trực tiếp từ `windows\installer\publish\` (chưa cài lại vào Program Files).
- ⚠️ **Bài học quan trọng**: bộ gỡ cài đặt hỏi "xoá dữ liệu đăng nhập?" và khi chạy silent Inno trả lời
  mặc định **Yes** ⇒ **xoá `%APPDATA%\VPNFlow`** — nơi chứa **private key WireGuard** + session.
  Đã sao lưu trước và khôi phục. **Lần sau: luôn sao lưu `%APPDATA%\VPNFlow` trước khi gỡ cài đặt.**
- **Việc còn lại (chưa làm)**:
  - ✅ **Rò IPv6 — ĐÃ SỬA** (`7fbee92`): tunnel chỉ định tuyến IPv4 nên IPv6 sẽ đi thẳng ra ngoài.
    Sửa bằng 2 route `::/1` + `8000::/1` trỏ vào interface tunnel (interface không có địa chỉ IPv6
    nên gói bị đen), gỡ lại khi ngắt kết nối. Đã đo thật: `netsh` chấp nhận (`exit 0 Ok.`),
    sau khi chặn `curl -6` timeout, gỡ route thì IPv6 trở lại. **Lưu ý: máy test hiện KHÔNG có IPv6**
    (không địa chỉ global, không default route, `ping -6` "transmit failed") nên không tái hiện được
    rò tại chỗ — cơ chế chặn thì đã xác nhận chạy trong app: log
    `wintun: đã chặn IPv6 (::/1 + 8000::/1 qua tunnel)`.
  - ✅ **Route endpoint còn sót** — ĐÃ SỬA (`39fa259`): thêm route kiểu xoá-rồi-thêm để hết
    `The object already exists` và không để lại route mồ côi.
  - Icon khay hệ thống chưa được xác nhận là có hiện (owner không tìm được chỗ thoát app trong 3 phút)
    ⇒ nếu không hiện thì "đóng cửa sổ = ẩn xuống khay" thành không có đường thoát.
  - Chưa cài lại bản cuối vào Program Files.
  - Peer test `10.77.0.58` (`b74470e6-…`) tạo lúc repro vẫn còn trên server, cần token admin để xoá.
  - Máy này **thiếu module `NetAdapter`** nên `Remove-NetAdapter` không chạy ⇒ dọn adapter có thể sót
    (wireguard-go tự dọn ở lần chạy sau).


