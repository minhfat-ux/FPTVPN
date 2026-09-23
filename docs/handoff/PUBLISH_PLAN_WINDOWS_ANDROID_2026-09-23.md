# KẾ HOẠCH PUBLISH — Windows + Android (23/09/2026)

> Người lập: DSH main agent (owner `windows`). Lập theo **luật §0.10**: đọc hết `docs/handoff/` mới nhất
> trước khi claim/kiểm/publish. Nguồn đã đọc: `docs/handoff/HANDOFF_V29_DIAG_2026-09-23.md` (23/09 11:59),
> `docs/handoff/CHECK_WINDOWS_1.4.4_RELEASE_2026-09-22.md` (22/09 19:35), `docs/RELEASE_PLAN_2026-09-24.md`,
> `docs/PUBLISHER_PROCESS.md` §0/§2b, `docs/VERSIONING.md`, `release/releases.jsonl`, `git tag -l`.

## 0. KẾT LUẬN NHANH — chưa thể package/publish cả hai

| Nền tảng | Bản mới nhất | Đã phát? | Chặn hiện tại |
|---|---|---|---|
| **Windows** | `1.4.4` (đã phát) · nhánh mới đang làm: bypass TQ | ✅ đã phát xong 22/09 18:14 | **Source CHƯA commit hết**: 1 session đang giữ claim `windows-app`, 7 file `windows/**` lệch `origin/main` (**+809/−126**) |
| **Android** | build `v29` = `versionCode 29` / `versionName 1.4.3-dev` | ❌ chưa từng phát (kênh vẫn `1.4.0`) | **Chưa có artifact publish được**: mới có **APK debug** (`com.privatevpn.app.dev`, 113.451.055 B) — thiếu **release build + ký cert release** (Mac) |

## 1. Trạng thái thật từng kênh (đo, không đọc suông)

| Kênh | Version đang phát | Artifact | Mốc server | Tag | Sổ |
|---|---|---|---|---|---|
| Windows | `1.4.4` | `/dl/VPNFlow-Setup-1.4.4.exe` · 52.792.515 B · `d9956056…ae1be` | `latest_version=1.4.4` · `/buy` trỏ `?v=d9956056` | `windows-v1.4.4` → `8466b18` | ✅ có dòng publish + tag |
| Android modern | `1.4.0` (code 20) | `/root/flowvpn-apk/VPNFlow-latest.apk` · 96.536.145 B · `dee9f823…` | `latest_version=1.4.0` | `android-v1.4.0` | ✅ (backfill) |
| Android legacy | `1.4.0` (code 20) | `/root/flowvpn-apk/VPNFlow-android7.apk` · 96.536.152 B · `4cbe474e…` | `latest_version=1.4.0` | `android-legacy-v1.4.0` | ✅ (backfill) |
| iOS (tham chiếu) | `1.4.1` (18) | — | đã phát lên trang buy (`23c4cf2`) | — | ⚠️ **sổ CHƯA có dòng 1.4.1** ⇒ luật §0.6b đang bị hở |

## 2. Kiểm tra "các session khác đã commit hết chưa" — KẾT QUẢ: CHƯA

Bảng chặn commit (so với `origin/main`, không so với HEAD local đang lùi):

| Phạm vi | Kết quả | Chi tiết |
|---|---|---|
| `android/**` | ✅ sạch | không file nào lệch `origin/main`; source v29 đã commit (`86944de`) |
| `windows/**` | ❌ **đang dở** | 7 file lệch `origin/main`: `Tunnel/ChinaBypass.cs` (+86), `Tunnel/SingBoxConfigBuilder.cs` (+177/−30), `Tunnel/HysteriaRelayTunnel.cs` (+44/−1), `Tunnel/WintunWireGuardDriver.cs` (+45/−19), `Tests/ChinaBypassTests.cs` (+125), `Tests/SingBoxConfigBuilderTests.cs` (+110), `installer/verify-relay.ps1` (+222/−76) |
| File chưa track | 2 file | `docs/handoff/CHECK_WINDOWS_1.4.4_RELEASE_2026-09-22.md` (handoff 22/09 **chưa lên main** ⇒ Mac không đọc được) và `docs/routes/cn-cidrs.txt` |
| Bảng việc | 2 claim đang mở | `[windows] windows-app` (bypass TQ đường relay, P1+P2+P3) · `[mac] ios` (A7 macOS bước 1: 4 dải LAN `excludedRoutes`) |
| Công cụ trong handoff v29 | ⚠️ không có trong repo | `tools/restore-v29-lines.mjs`, `tools/restore-v29-comments.mjs`, `tools/find-broken-log-calls.mjs` **không tồn tại** ở cây làm việc lẫn `origin/main` (handoff ghi là có) |

**Hệ quả:** Windows **không được package/publish** cho tới khi session `windows-app` commit xong (nếu publish bây giờ là phát bản thiếu việc bypass TQ). Android chỉ publish được sau khi có **release APK đã ký**.

## 3. Kế hoạch WINDOWS — hai nhánh, chờ chủ dự án chốt

### Nhánh A — không làm gì (1.4.4 đã phát xong)
1.4.4 **không đổi chức năng** so với 1.4.3 (chỉ khớp lại mốc commit build). Mọi mặt tiền đã đúng: mốc, `/buy`, size, sha256, cổng pre/post ĐẠT, sổ + tag. ⇒ **Không publish lại** (phát trùng cùng version khác hash = cấm, `VERSIONING.md` §3.3).

### Nhánh B — gộp việc bypass TQ đang làm dở ⇒ **1.4.5** (khuyến nghị nếu muốn bản Windows có bypass)
| # | Bước | Ai | Lệnh / điều kiện đạt |
|---|---|---|---|
| 1 | Session `windows-app` commit + push hết 7 file (claim hiện còn ~31 phút) | session đó | `git diff --numstat origin/main -- windows/` → **rỗng** |
| 2 | Bump version: `<Version>` csproj `1.4.4` → `1.4.5` + `dotnet test` | Windows harness | 202/202 PASS (mức hiện tại) |
| 3 | Build installer: `windows/installer/build.ps1` | Windows harness | có `VPNFlow-Setup-1.4.5.exe` + FileVersion **1.4.5** |
| 4 | Cổng chặn **trước** upload | publisher | `python3 scripts/check-publish-version.py --platform windows --file …1.4.5.exe --app-exe …App.exe --version 1.4.5` → **exit 0** |
| 5 | Backup file đang phát trên node-2 (đổi tên có ngày) | publisher | `VPNFlow-Setup-latest.bak-…` |
| 6 | Upload `/var/www/flowvpn/dl/VPNFlow-Setup-1.4.5.exe` + cập nhật `latest.exe` | publisher | `sha256sum` khớp file local |
| 7 | Verify link: `t1.` + `meetflowai.site` `/dl/…?v=<sha8>` | publisher | HTTP 200 + content-length = 52.7xx.xxx |
| 8 | **`--mode post`** (đọc version trong file đang phát) | publisher | exit 0, internal = 1.4.5 |
| 9 | `PATCH /v1/admin/windows-version {"latest_version":"1.4.5"}` | publisher | đọc JSON trả về, **không** tin exit code |
| 10 | Ghi sổ + tag | publisher | `release-record.mjs append … --origin publish --commit <sha build>` rồi `tag --platform windows` |
| 11 | Release notes + email khách (§0.7: publisher gửi) | publisher | `docs/RELEASE_NOTES_1.4.5.md`; email chỉ nêu việc **đã xong** |

## 4. Kế hoạch ANDROID — `1.4.3` / `versionCode 29` (2 APK: modern + legacy)

Bản v29 sửa **lỗi thật khách thấy**: Diagnostics báo 5 kbps trong khi tunnel chở 4.463 kbps (nguồn byte sai transport) + port MTU 1300 / 2 resolver. Có thay đổi chức năng ⇒ **nên gửi email** cho khách Android.

| # | Bước | Ai | Điều kiện đạt |
|---|---|---|---|
| 1 | Build **release** từ commit `86944de` (không phải `-dev`): `versionCode 29`, `versionName "1.4.3"`, `applicationId com.privatevpn.app` | **Mac** | 2 APK: modern + legacy, **cùng một cert release** (`aapt2 dump badging \| grep ^package:`) |
| 2 | Căn **16 KB page** cho `libbwg.so`, `libbgojni.so`, `libandroidx.graphics.path.so` (handoff §7.2) | **Mac** | `zipalign`/kiểm page size đạt — nếu không, Play/Android 15+ từ chối |
| 3 | Test **máy thật** theo handoff §6: `sampler nguồn byte = TrafficStats theo UID`, `observed` cùng bậc speedtest (lệch ≤ ~20%), `declared` leo lên (không kẹt 1.000 kbps) | chủ dự án / Mac | log `diagnostics.log` + ảnh chụp |
| 4 | Cổng chặn **trước**: `check-publish-version.py --platform android --file <modern.apk> --version 1.4.3 --build 29` (và `android-legacy`) | publisher | exit 0 cả 2 biến thể |
| 5 | Backup 2 APK đang phát trên node-2 | publisher | tên có ngày |
| 6 | Upload modern → `/root/flowvpn-apk/VPNFlow-latest.apk`; legacy → `…/VPNFlow-android7.apk` | publisher | size + sha256 khớp nguồn |
| 7 | Verify `t1.meetflowai.site/v1/downloads/android` + `…/android-legacy` | publisher | 200 + content-length khớp |
| 8 | `--mode post` cho cả 2 | publisher | internal = 1.4.3 / code 29 |
| 9 | `PATCH /v1/admin/android-version {"latest_version":"1.4.3"}` — **KHÔNG** đặt `minimum_version` | publisher | đọc JSON trả về |
| 10 | Sổ + tag: `android-v1.4.3` + `android-legacy-v1.4.3` | publisher | 4 dòng sổ (publish ×2, tag ×2) |
| 11 | Release notes + email 3 ngôn ngữ | publisher | tài liệu riêng cho Android (xem §6 cảnh báo trùng tên) |

## 5. Bằng chứng bắt buộc dán khi publish (runbook §7)
```
sha256 + size của TỪNG artifact (đo lại từ file thật)
version/build đọc TỪ BÊN TRONG artifact (cổng pre + post, không tin tên file)
HTTP 200 + content-length khớp ở cả 2 host (t1. và meetflowai.site)
PATCH mốc → JSON trả về thật
sổ: dòng publish + dòng tag;  tag: git show <tag>
/buy và /install/* trỏ bản mới (?v=<sha8>)
email: số người nhận + mã gửi
```

## 6. Cảnh báo & việc tồn (không chặn kế hoạch, nhưng phải xử)
1. **Trùng tên release notes**: `docs/RELEASE_NOTES_1.4.3.md` hiện là **của Windows**; Android cũng sắp là 1.4.3 ⇒ chốt đổi sang `docs/RELEASE_NOTES_<platform>_<version>.md` (tag đã phân biệt theo nền tảng, notes thì chưa).
2. **Sổ thiếu dòng iOS 1.4.1 (18)** dù đã phát lên trang buy (`23c4cf2`) ⇒ bổ sung 1 dòng `append --origin publish --platform ios` (kèm sha256 IPA đang phát).
3. **`docs/handoff/CHECK_WINDOWS_1.4.4_RELEASE_2026-09-22.md` chưa commit** ⇒ Mac không đọc được; luật §0.10 chỉ có tác dụng khi handoff nằm trên `main`.
4. `docs/RELEASE_PLAN_2026-09-24.md` §2.3 còn ghi `21 / 1.4.1` — nay là **29 / 1.4.3** (handoff §7.3).
5. `docs/VERSIONING.md` §2 ví dụ tag còn `android-v1.4.1`, `windows-v1.4.2` — cập nhật theo thực tế (`windows-v1.4.4`, sắp `android-v1.4.3`).
6. iOS/macOS: cùng lớp lỗi "đếm byte chỉ một transport" có thể còn (handoff §8) — ngoài phạm vi 2 nền tảng này.

## 7. Cần chủ dự án chốt trước khi em package/publish
1. **Windows**: (A) để nguyên 1.4.4, hay (B) chờ session `windows-app` commit rồi làm **1.4.5** gồm bypass TQ?
2. **Android**: xác nhận **Mac build + ký release** (em không có keystore release trên máy Windows) và có/không căn 16 KB page trong đợt này.
3. **Email**: Android 1.4.3 (có thay đổi chức năng) — gửi; Windows 1.4.5 nếu có — gửi hay gộp 1 email?
