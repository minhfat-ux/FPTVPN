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
- `PrivateVPNMac` / `PrivateVPNMacPacketTunnel` — bản macOS

⚠️ **Hai target tunnel dùng CHUNG `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift`**
(`project.yml` khai file này cho cả iOS và macOS), nhưng target iOS khai **cả thư mục**
(`sources: - iOS/PrivateVPNPacketTunnel`) còn target macOS chỉ khai **đúng file provider**
(`project.yml:248`). Vì vậy khi thêm file `.swift` mới vào thư mục tunnel mà quên khai cho
macOS thì **iOS vẫn build được, macOS build đứt** — lỗi kiểu `cannot find type 'X' in scope`
trong `PacketTunnelProvider.swift`. Đã gặp thật 13/09/2026 với `WGRelayClient.swift` +
`RelayDiagnostics.swift`.

Kiểm tra nhanh sau khi thêm file vào tunnel:

```bash
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN    -configuration Release -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPNMac -configuration Release -destination 'generic/platform=macOS'         CODE_SIGNING_ALLOWED=NO build
```

Lưu ý khi kiểm tra: build trong worktree đang có WIP của agent khác có thể đứt vì lý do không
phải của mình — muốn biết **bản đã commit** có build được không thì tạo worktree sạch
(`git worktree add /tmp/clean <commit>` → `xcodegen generate` → build).

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

**Gotcha git (repo nằm trên volume exFAT `BIWIN`):** `git rebase` / `git pull --rebase` fail vô cớ với
`error: Your local changes to the following files would be overwritten by merge` **dù `git status` sạch**
(index coi file là "racily clean" trên exFAT). Cách xử lý — **cherry-pick thay cho rebase**:

```bash
git fetch origin
git checkout --detach origin/main      # HEAD = upstream
git cherry-pick <commit-của-mình>      # replay lên trên
git switch -C main                     # đưa branch main lên commit mới
git push origin main
```

Đừng `git rebase --continue` trong trạng thái đó (todo bị lặp commit) — `git rebase --abort` rồi cherry-pick.

## 5d. iOS release — Ad Hoc OTA (as-built 2026-09-15)

Không dùng App Store/TestFlight: app phát trực tiếp từ domain của mình.

```bash
# A) Chỉ có UDID MỚI (không đổi code) → CHỈ KÝ LẠI, không build lại:
scripts/ios-resign-ipa.sh          # profile mới (ASC API) + ký lại + upload + báo đã ký

# B) CODE đổi (paywall/subscription/bug) → build lại rồi export:
bash scripts/archive-appstore.sh ios adhoc        # bump CURRENT_PROJECT_VERSION trong project.yml trước
scripts/ios-adhoc-export.sh --no-upload
scripts/upload-ios-ipa.sh <ipa>                   # (hoặc để ios-resign-ipa.sh upload)

# 2) Đưa IPA lên node-2
scp <ipa> root@165.101.114.162:/root/flowvpn-ipa/VPNFlow-latest.ipa

# 3) Bump số build trong panel (tab Nodes → app-version → ipa_build)

# 4) Báo khách đã có bản mới (tự gửi mail cho máy đã map email)
curl -X POST -H "Authorization: Bearer $AUTH_TOKEN" \
  https://api.meetflowai.site/v1/admin/ios/devices/built -d '{"note":"1.3.4"}'
```

Luồng khách: `/install/ios` → cài `.mobileconfig` → server nhận UDID (log `ios-udid`) → tự đăng ký Apple
→ khách bấm **Tải & cài**. Cập nhật về sau: app bấm **Update** là iOS tải + cài luôn
(`/v1/app-version` trả `ipa_manifest_url`).

⚠️ **Đọc trước khi sửa bất cứ thứ gì liên quan `.mobileconfig`/UDID/manifest:**
`docs/IOS_ADHOC_OTA.md` — có cấu trúc plist BẮT BUỘC, định dạng body iOS 26 (CMS/PKCS#7), và bảng
8 bẫy đã gặp thật (mỗi bẫy từng làm khách không cài được).

## 6. Commit conventions

Commit message format (RULE-GIT-005, owner directive):

```text
feat(docs): GATE 0 bootstrap — SRS v0.1 ...
feat(ios): GATE 1 skeleton — app + packet tunnel + state model
build(ios): GATE 1 simulator build succeeded
```

Never commit secrets (RULE-GIT-004).
