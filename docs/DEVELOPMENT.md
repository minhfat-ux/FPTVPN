# PRIVATEVPN — DEVELOPMENT

- **Version:** v0.1
- **Date:** 2026-08-19

## 1. Environment

- macOS (Darwin), Apple Silicon
- Xcode 26.6 (build 17F113)
- Swift 6.3.3
- iOS SDK 26.5 (simulator)
- xcodegen 2.46.0 (`/opt/homebrew/bin/xcodegen`)
- git user: MinhNb2
- No Apple signing team configured → simulator builds; runtime VPN needs real device + team

## 2. Project generation

`project.yml` is the source of truth (ADR-0001). Generate:

```bash
/opt/homebrew/bin/xcodegen generate
```

Generated `PrivateVPN.xcodeproj` is gitignored.

## 3. Build (simulator)

```bash
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

Targets:

- `PrivateVPN` — iOS app
- `PrivateVPNPacketTunnel` — Packet Tunnel Provider extension (embedded)

## 4. Code conventions

- SwiftUI app UI.
- `VPNState` enum drives UI (never optimistic).
- `VPNManager` wraps NEVPNManager; state changes observed, not guessed.
- No custom cryptography; no WireGuard reimplementation (RULE-CODE-002).
- No secrets in code; Keychain for storage.
- No comments unless required; changes scoped (RULE-CODE-003).

## 5. Testing

- Unit tests for state model transitions (GATE 1).
- Future: provisioning flow, config persistence, error states (§82).
- Real E2E mandatory for final acceptance; mocks do not count (RULE-TEST-002).

## 5b. Production deployment (VPS, as-built 2026-08-23)

- Production coordinator = `control-plane/` (this repo) deployed via systemd
  `flowvpn-cp.service` on the VPS (103.173.155.50): port 7778,
  `NODE_ENV=production`, `LEGACY_MODE=1`, dryRun=false; Caddy reverse-proxies
  `api.meetflowai.site` -> 127.0.0.1:7778.
- Data: `devices.json` + `auth.json` (JSON) and **`nodes.db` (SQLite, `node:sqlite`)**
  under `/root/flowvpn-cp/data/`; exit nodes are stored in SQLite and served by
  `GET /v1/nodes`; legacy `nodes.json` is imported into SQLite on first run.
  Old sqlite coordinator DB (`/root/.privatevpn/coordinator.db`, read with
  `sqlite3` CLI, now installed) is kept for audit.
- Redeploy after changing `control-plane/`:
  ```bash
  rsync -az --exclude node_modules --exclude data control-plane/ root@103.173.155.50:/root/flowvpn-cp/
  ssh root@103.173.155.50 'cd /root/flowvpn-cp && npm install --omit=dev && systemctl restart flowvpn-cp'
  ```
- Legacy review window: keep `LEGACY_MODE=1` until the authenticated app is released;
  then set `LEGACY_MODE=0` in the unit + restart.
- Rollback: `/root/flowvpn-cp/rollback.sh` (Caddy back to 7777); old
  `privatevpn.service` still exists for fallback.
- Set `RESEND_API_KEY` (OTP email) and `AUTH_TOKEN` (admin) once available.

## 5c. Android build & release (as-built 2026-09-12)

**Toolchain:** JDK 17 (`/opt/homebrew/opt/openjdk@17`), Android SDK (`~/Library/Android/sdk`),
Gradle 8.11.1 (wrapper ở `android/gradlew`), buildDir ghi ra `$HOME/.vpnflow-build` để tránh volume exFAT.

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk
export GRADLE_USER_HOME=$HOME/.gradle
cd android
./gradlew -p . -Pandroid.buildDir=$HOME/.vpnflow-build :app:assembleDebug     # APK debug (cài test)
./gradlew -p . -Pandroid.buildDir=$HOME/.vpnflow-build :app:assembleRelease   # APK bán web (ký release key)
./gradlew -p . -Pandroid.buildDir=$HOME/.vpnflow-build :app:bundleRelease     # AAB cho Google Play
```

**Hai branch phát hành:**
| Branch | Kênh | Khác biệt |
|---|---|---|
| `main` / `web` | APK sideload (bán qua web) | `Config.SELL_ON_WEB = true` — paywall mở WebView trang buy |
| `store` | Google Play (AAB) | `SELL_ON_WEB = false` — không UI mua gói, không link ra web, bỏ Play Billing |

Version nằm ở `android/app/build.gradle.kts` (`versionCode` / `versionName`) — **bump ở cả 2 branch** mỗi lần phát hành.

**AAR hysteria (transport TQ):** `android/app/libs/hysteria.aar` (29 MB, có trong git).
Build lại bằng `tools/hysteria-android/build.sh` (clone hysteria `app/v2.12.2` → patch TUN fd → wrapper
`mobile.go` → `gomobile bind`). Cần Go ≥1.22, gomobile, **NDK r25**, JDK 17.

**Phát hành:**
```bash
# 1) APK bán web -> endpoint mà nút trên trang buy trỏ tới
scp -i .tmp/flowvpn_support_page_ed25519 <apk> root@103.173.155.50:/root/flowvpn-apk/VPNFlow-latest.apk
#    (link public: https://meetflowai.site/v1/downloads/android)
# 2) AAB cho Play -> thư mục tĩnh /dl
scp -i .tmp/flowvpn_support_page_ed25519 <aab> root@103.173.155.50:/var/www/flowvpn/dl/VPNFlow-<ver>-play-store.aab
ssh ... "chown caddy:caddy /var/www/flowvpn/dl/*; chmod 644 /var/www/flowvpn/dl/*"
```
File đặt trong `/var/www/flowvpn/**` **phải** `chown caddy:caddy` + `chmod 644`, nếu không caddy trả 403.

**Deploy control-plane (coordinator):**
```bash
scp -i .tmp/flowvpn_support_page_ed25519 control-plane/src/<file>.js root@103.173.155.50:/root/flowvpn-cp/src/
ssh ... "systemctl restart flowvpn-cp && systemctl is-active flowvpn-cp"
```
Env của control-plane nằm **inline trong unit** (`systemctl cat flowvpn-cp`) — ví dụ `MAX_DEVICES_PER_USER=3`,
`DEBUG_CODE_EMAILS`, `DEV_LOGIN_CODE`, `SMTP_*`.

**Gotchas vận hành:** cache `~/.gradle/caches/8.11.1/kotlin-dsl` hỏng định kỳ → `./gradlew --stop && rm -rf` rồi build lại;
adb trên máy Samsung test hay rớt (USB debugging tự tắt) → phải bật lại; file trong `/var/www` phải đúng owner/permission.

## 6. Commit conventions

Commit message format (RULE-GIT-005, owner directive):

```text
feat(docs): GATE 0 bootstrap — SRS v0.1 ...
feat(ios): GATE 1 skeleton — app + packet tunnel + state model
build(ios): GATE 1 simulator build succeeded
```

Never commit secrets (RULE-GIT-004).
