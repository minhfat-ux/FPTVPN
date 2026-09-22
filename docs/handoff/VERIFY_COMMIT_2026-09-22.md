# Bàn giao — Verify & commit toàn bộ workspace (harness Windows)

- **Người làm**: DSH main agent (owner `windows`)
- **Ngày**: 2026-09-22
- **Phạm vi**: verify cây làm việc + commit/push lên GitHub `minhfat-ux/FPTVPN`
- **Kết quả cuối**: `main = 660d9c2` (GitHub), cây làm việc **khớp GitHub, sạch**
  - `0ac7d4c` — việc thật của Android (3 file) — **đã push**
  - `6d58919` — báo cáo này — **đã push**
  - `5add22f`, `2779a64`, `660d9c2` — agent khác push song song trong lúc tôi làm (Windows 1.4.2 metadata,
    trả lại `<Version>1.4.2` trong csproj, publisher doc iOS) — đã rebase, không xung đột nội dung

## 1. Phát hiện chính (bằng chứng ở §3)

Cây làm việc lúc nhận bàn giao **không phải việc mới**, mà là **ảnh chụp cũ (stale snapshot)**
trộn lẫn:

- Toàn bộ 16 file sửa + 1 file untracked **trùng khít commit checkpoint `da70183`**
  (`dsh-checkpoint session-31d3f420… turn 1`).
- Ảnh chụp đó có mtime 17–18/09/2026 và **đè ngược lên 4 commit mới hơn** (21–22/09):
  `25258cd` (guard/task), `b538e82` (luật host t1), `21f8844` (harness tự vá patch), `7defd33` (cổng chặn version).
- Hệ quả nếu commit nguyên trạng: **mất** hệ thống task/guard + `/approve`, **mất** luật link khách
  phải ở `t1.meetflowai.site`, **mất** bộ tự vá theme/brand harness, **mất** cổng chặn version trước khi publish.
- Trong ảnh chụp đó chỉ có **3 file là việc thật chưa từng commit**: Android (build.gradle.kts,
  Config.kt, HysteriaVpnService.kt). Kiểm chứng: `git log -S RTT_PROBE_FALLBACK_HOST --all` chỉ ra
  các checkpoint, **không** có trên `origin/main`.
- 4 file Windows (csproj/build.ps1/SettingsView ×2) + `scripts/check-publish-version.py` trùng
  `origin/main` ⇒ không có gì mới để commit.

## 2. Files changed

| path | thay đổi gì |
|---|---|
| `android/app/build.gradle.kts` | versionCode 21 / versionName 1.4.1; build `debug` thêm `applicationIdSuffix=".dev"` + `versionNameSuffix="-dev"` để cài song song bản phát hành |
| `android/app/src/main/java/com/privatevpn/app/Config.kt` | thêm `RTT_PROBE_HOST/PORT` (1.1.1.1:80) + `RTT_PROBE_FALLBACK_HOST/PORT` (api.meetflowai.site:443) |
| `android/app/src/main/java/com/privatevpn/app/vpn/HysteriaVpnService.kt` | `tunnelRttMs()` thử mục tiêu chính rồi mục tiêu dự phòng; chỉ coi là mất gói khi ≥3 lần fail LIÊN TIẾP + tỉ lệ fail ≥ ngưỡng + goodput đã tụt thật; bỏ nhánh `Mobile.stop()` dựng lại QUIC giữa phiên |
| 14 file đã **khôi phục** về bản trên GitHub | `AGENTS.md`, `.privatevpn/coordination/PROTOCOL.md`, `control-plane/src/tg-commands.js`, `control-plane/test/tg-commands.test.js`, `docs/HARNESS_INSTALL.md`, `docs/PUBLISHER_PROCESS.md`, `scripts/check-public-surface.py`, `scripts/coord/flowvpn-coord.mjs`, `scripts/housekeeping/harness-dsh.sh`, `scripts/tg-bot/bot.mjs`, `windows/PrivateVPNWindows.App/PrivateVPNWindows.App.csproj`, `windows/…/SettingsView.axaml`, `windows/…/SettingsView.axaml.cs`, `windows/installer/build.ps1` |
| `control-plane/src/payments.js` | **giữ nguyên bản GitHub** (link `t1.meetflowai.site`) theo quyết định của chủ dự án |
| `scripts/check-publish-version.py` | xoá bản untracked trùng khít blob trong `7defd33` (`ea5cdba`) để fast-forward |

Commit duy nhất được tạo: `0ac7d4c fix(android): 1.4.1 + probe RTT có mục tiêu dự phòng, chỉ hạ số khai khi mất gói THẬT`.

## 3. Lệnh đã chạy + kết quả thật

**a) Chứng minh ảnh chụp cũ**
```
$ git hash-object AGENTS.md                      -> c62e6d6c999dbcbef8a9b1c06e74b2813c0ef8f0
$ git rev-parse da70183:AGENTS.md                -> c62e6d6c999dbcbef8a9b1c06e74b2813c0ef8f0   (TRÙNG)
$ git rev-parse origin/main:AGENTS.md            -> d843883acac1390051462ce0f24d143c94205d14   (KHÁC)
$ git hash-object scripts/check-publish-version.py -> ea5cdba45b6804d80b282f04106f19104925dc5d
$ git rev-parse 7defd33:scripts/check-publish-version.py -> ea5cdba45b6804d80b282f04106f19104925dc5d (TRÙNG)
```

**b) Bảng việc chung — không ai giữ claim** (không có xung đột)
```
$ node scripts/coord/flowvpn-coord.mjs list
Bang viec trong: khong ai dang giu claim nao.
```

**c) Test control-plane (chạy từng file để tránh `spawn EPERM` của sandbox)**
```
TONG: tests=269 pass=253 fail=14 skipped=2
File không chạy được / có fail: apple-devices, buy-page-downloads, client-telemetry, home-page,
mac-install, mail-langs, mailer, node-store, order-status, paid-alert, pay-qr,
payment-reminders, plan-name, plan-store, wireguard-remote
  9 file  : ERR_MODULE_NOT_FOUND (thiếu node_modules: qrcode, nodemailer, …)
  2 file  : node-store.test.js EBUSY (Windows khoá file .db)
  4 file  : lỗi assertion (apple-devices, home-page, wireguard-remote) — có từ trước
$ node control-plane/test/tg-commands.test.js  -> tests 26 / pass 26 / fail 0
$ node control-plane/test/sepay.test.js        -> tests 13 / pass 13 / fail 0
```
Commit này **chỉ đụng 3 file Android** ⇒ mọi fail ở control-plane là **có sẵn**, không do commit này.

**d) Push + xác minh trên GitHub**
```
$ git push origin main
To https://github.com/minhfat-ux/FPTVPN.git
   7defd33..0ac7d4c  main -> main

$ git ls-remote origin main
0ac7d4c15b8bf29580064b5064151b6d717c4bd4	refs/heads/main

$ git status --porcelain --untracked-files=all   -> (trống, cây làm việc sạch)
$ git diff --stat origin/main                    -> (trống, khớp GitHub)
```

## 4. Quyết định & giả định

1. **Khôi phục 14 file về bản GitHub, không commit ảnh chụp cũ.** Lý do: theo thứ tự nguồn sự thật
   (`AGENTS.md` §2), code production + commit trên main là sự thật; ảnh chụp 17–18/09 mâu thuẫn với
   4 commit mới hơn. Commit nguyên trạng sẽ là **phát hành lùi** (mất guard/approve, mất luật host t1).
2. **`payments.js`: giữ `t1.meetflowai.site`** — theo lựa chọn trực tiếp của chủ dự án khi được hỏi
   (thay đổi trong workspace định đổi về `meetflowai.site`, trái luật đã chốt ở `b538e82`).
3. **Xoá `scripts/check-publish-version.py`** (untracked) vì blob trùng khít bản trong `7defd33`;
   không mất nội dung. Backup đầy đủ nằm ở `%TEMP%\fptvpn-backup-20260922\`.
4. Chỉ gộp Android vào **một** commit; nhóm Windows/script cổng version đã có trên GitHub nên không
   tạo commit rỗng.

## 5. Điểm chưa chắc / việc còn lại

1. ✅ **ĐÃ BUILD ĐƯỢC ANDROID TRÊN MÁY WINDOWS NÀY (22/09, sau khi cài JDK 17)** — blocker cũ đã hết.
   Đã cài Temurin JDK 17.0.20.1+1 + set `JAVA_HOME`/`PATH` (scope User); SDK Android đã có sẵn
   (`C:\Users\Minhn\Android\sdk`, platform `android-36`, build-tools `36.0.0`). Bằng chứng thật:
   `compileModernDebugKotlin` + `compileLegacyDebugKotlin` chạy với `--rerun-tasks --no-build-cache`
   → **BUILD SUCCESSFUL** (1m54s, không `e:`/`error:`); `assembleModernDebug` + `assembleLegacyDebug`
   → **BUILD SUCCESSFUL**; APK `app-modern-debug.apk` 108,2 MB đọc bằng aapt2:
   `package: name='com.privatevpn.app.dev' versionCode='21' versionName='1.4.1-dev' … minSdkVersion:'26'`.
   Class đã biên dịch chứa đúng hằng số mới (`LOSS_CONSECUTIVE_FAILS`, `probeTcpOnce`,
   `RTT_PROBE_FALLBACK_HOST`). ⇒ **3 file Kotlin của `0ac7d4c` đã qua compile thật.**
   Còn lại: chỉ **bản release** mới cần máy Mac (keystore ngoài repo) — không phải blocker verify code.
2. **Android đã lên 1.4.1 nhưng chưa publish** ⇒ cần chạy cổng chặn trước khi upload:
   `python3 scripts/check-publish-version.py --platform android --file <apk> --version 1.4.1`
   (không đạt thì DỪNG) rồi mới set mốc version.
3. 14 test fail ở control-plane là **có sẵn** (thiếu `node_modules` + khoá file trên Windows); muốn
   chạy đủ cần `npm --prefix control-plane ci`.
4. `git fetch` trong phiên này cần quyền rộng hơn sandbox mặc định (`schannel … SEC_E_NO_CREDENTIALS`);
   push đã chạy được sau khi được cấp quyền.
5. **⚠️ CẢNH BÁO — có tiến trình NGOÀI đang ghi đè file trong repo này.** Bằng chứng: trong lúc tôi
   làm, `scripts/check-publish-version.py` bị ghi lại lúc **11:37:12** và csproj bị ghi lại, đều mang
   **nội dung CŨ** (bản `5c80340`/trước `2779a64`). Hệ quả thật đã suýt xảy ra: commit local của tôi
   khi đó **xoá 12 dòng fix DMG của agent khác** và **xoá `<Version>1.4.2</Version>`** — nếu push
   nguyên trạng là phá việc vừa làm của họ. Tôi đã phát hiện bằng `git diff origin/main..HEAD` **trước
   khi push**, nên đã `reset --hard origin/main` và bỏ commit trùng đó.
   - Nghi phạm: cơ chế checkpoint/sync của harness (ảnh chụp cũ `da70183`, mtime 17–18/09) tự "khôi
     phục" cây làm việc về ảnh chụp.
   - **Bắt buộc làm trước mỗi lần commit khi còn hiện tượng này**: `git diff --stat origin/main` và
     `git diff origin/main..HEAD` để chắc không có dòng nào bị mất; thấy file lạ bị sửa thì
     `git checkout -- <file>` rồi fetch/rebase lại.
6. Việc của tôi đã nằm trên GitHub: `0ac7d4c` (Android) + `6d58919` (báo cáo này). Các commit publisher
   doc/relay mà tôi định ghi thêm thì **agent khác đã ghi trước** (`660d9c2`, `5add22f`), nên tôi bỏ
   commit trùng, không tạo nhiễu lịch sử.
