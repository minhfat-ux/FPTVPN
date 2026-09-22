# RELEASE RUNBOOK — vai trò PUBLISHER (harness Mac)

> Ai: **harness Mac** là publisher chính thức của app & version (iOS, Android, macOS, Windows link).
> Nguyên tắc: **không có bằng chứng = chưa phát hành.** Mọi bước phải có output thật dán vào báo cáo.

## 0. Bảng version đang phát (cập nhật mỗi lần release)
| Nền tảng | Version | Build/Code | File trên server | Nguồn build |
|---|---|---|---|---|
| iOS | 1.3.3 | 14 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` | Mac build (archive + export ad-hoc) |
| Android (modern) | 1.3.9 | — | `/root/flowvpn-apk/…` (route `/v1/downloads/android`) | harness/other |
| Android (legacy) | — | — | route `/v1/downloads/android-legacy` | — |
| Windows | — | — | `/var/www/flowvpn/dl/VPNFlow-Setup-*.exe` (link `/buy` tự cập nhật — commit `2dd0376`) | harness Windows |
| macOS (DMG) | 1.4.0 | 14 | `/root/flowvpn-mac/VPNFlow-mac.dmg` | Mac build (Developer ID + notarize, **chưa staple**) |

> **Chốt 22/09/2026 — đọc thẳng artifact đang phát** (không tin tên file/tài liệu):
> `GET /v1/downloads/mac` (cả `meetflowai.site` lẫn `api.meetflowai.site`) trả DMG **21.617.309 B**,
> sha256 `9d05f271232b75ddbae281059ff48355d5162032cb2a86114fafc130bfd54597`, `last-modified`
> 20/09 15:56 GMT. `Info.plist` trong **app và extension** = **1.4.0 / build 14**;
> ký `Developer ID Application: Minh Nguyen (G6XW3RN6LJ)`; `spctl` = **Notarized Developer ID**
> nhưng `xcrun stapler validate` = **CHƯA staple** ticket (máy offline lần đầu có thể vẫn bị cảnh báo).
> Ba tài liệu trước mâu thuẫn (RUNBOOK/PUBLISHER ghi 1.3.3/13, RELEASE_ARTIFACTS ghi 23.961.684 /
> 23.972.080 B) — bản đang phát thật là 1.4.0/14 nêu trên.

## 1. Hợp đồng bàn giao từ bên build (template)
```
iOS <version> (build <n>) — IPA ad-hoc
  file: <đường dẫn tuyệt đối trên Mac>
  sha256: <hash>
  release notes: release/<file>.md
  đích node-2: /root/flowvpn-ipa/VPNFlow-latest.ipa
  mốc phiên bản: latest_version=<version>, ipa_build=<n>

Android <version> (versionCode <n>) — APK
  modern: <path>  sha256 <hash>
  legacy: <path>  sha256 <hash>
  release notes: release/<file>.md
  đích node-2: /root/flowvpn-apk/… (đúng tên route /v1/downloads/android đọc)
  mốc: latest_version=<version>
```

## 2. Quy trình iOS (10 bước)
1. **Claim** vùng phát hành (luật §6 AGENTS.md):
   `ssh root@165.101.114.162 flowvpn-coord claim --owner mac --area release --files /root/flowvpn-ipa/ --note "phat hanh iOS <ver>"`
2. **Verify file local**: `shasum -a 256 <ipa>` phải **khớp hash bên build gửi**.
3. **Kiểm nội dung IPA** (không tin tên file):
   `unzip -q <ipa> -d /tmp/ipachk && PlistBuddy -c 'Print :CFBundleShortVersionString' /tmp/ipachk/Payload/*.app/Info.plist`
   → đúng `<version>`; và `ls Payload/*.app/PlugIns/` phải có `PrivateVPNPacketTunnel.appex`.
   Kiểm **keychain group** giữ nguyên: `codesign -d --entitlements - Payload/*.app | grep -o 'G6XW3RN6LJ[^<]*'`
   (sai nhóm này = app kẹt ở màn hình đăng nhập — đã từng xảy ra).
4. **Backup bản đang phát** trên node-2: `cp VPNFlow-latest.ipa VPNFlow-<ver-cũ>-<date>.ipa`.
5. **Upload**: `scripts/upload-ios-ipa.sh <đường-dẫn-ipa>` (script tự verify qua `/v1/downloads/ios`).
6. **Verify phát hành**: `curl -sI https://t1.meetflowai.site/v1/downloads/ios` → 200 và `content-length` khớp size file.
7. **Cập nhật mốc phiên bản** để app biết có bản mới:
   `PATCH /v1/admin/...` với `latest_version=<version>`, `ipa_build=<n>` (dùng script send-update-announcement hoặc admin API).
8. **Đăng release notes**: đặt file `release/<file>.md` (đã nhận) + link trong thông báo.
9. **Email cho user**: `scripts/send-update-announcement.sh <version>` (Resend, gửi từ `support@meetflowai.site`).
10. **Kiểm chứng cuối + báo cáo**: mở `/install/ios` và `/buy` xem link mới; dán bằng chứng; `release` claim.

## 3. Quy trình Android (8 bước)
1. Claim `release` (như trên).
2. `shasum -a 256` **cả 2 APK** (modern + legacy) — khớp hash bên build.
3. Kiểm versionCode/versionName trong APK (aapt/apkanalyzer) khớp `<version>`.
4. Backup APK đang phát trên node-2.
5. Upload vào **đúng đường dẫn route đọc** (`/root/flowvpn-apk/…`); legacy đi route riêng `/v1/downloads/android-legacy`.
6. Verify: `curl -sI https://t1.meetflowai.site/v1/downloads/android` (và `-legacy`) → 200 + size khớp.
7. PATCH `latest_version=<version>` (+ Android code nếu có).
8. Gửi email thông báo + dán bằng chứng + `release` claim.

## 4. macOS / Windows
- **macOS (DMG)**: build Release → `hdiutil create` → đẩy `/root/flowvpn-mac/VPNFlow-mac.dmg` → verify `/v1/downloads/mac`.
- **Windows**: harness Windows build + phát hành; link `/buy` **tự cập nhật** khi họ phát hành (commit `2dd0376`). Publisher Mac chỉ cần **verify link trên `/buy`** trỏ đúng file mới (không tự build Windows).

## 5. Rollback (khi bản mới lỗi)
1. Đổi `VPNFlow-latest.ipa` (hoặc APK) về file backup **cùng tên** ⇒ link tải cũ hoạt động lại ngay.
2. PATCH `latest_version` về bản cũ (nếu đã đẩy) ⇒ app không còn bị hối cập nhật.
3. Ghi rõ lý do rollback + thời điểm vào `docs/` (hoặc Telegram) để không mất dấu.

## 6. Lỗi đã từng xảy ra (đọc để không lặp lại)
- **Sai host trong link**: `/buy` từng trỏ `api.meetflowai.site/dl/...` ⇒ 401. Link tải phải là host **`t1.meetflowai.site`** hoặc `meetflowai.site` (`/dl/...`), không phải `api.`.
- **Link 404 oan do cache Cloudflare**: thêm `?v=<số>` khi test; gọi thẳng origin để phân biệt.
- **PATCH `latest_version` thất bại mà im lặng**: phải đọc response, không chỉ dựa vào exit code của curl (đã ghi trong `send-update-announcement.sh`).
- **Thiếu handle Caddy**: thêm route trong Node là chưa đủ — phải thêm `handle` ở Caddy, nếu không edge trả 404 dù Node 200.
- **Ký lại IPA làm mất keychain group** ⇒ app kẹt màn hình đăng nhập.
- **Đổi relay/hạ tầng mà client còn cache URL cũ** ⇒ toàn bộ khách "mất mạng" tới khi client làm mới. Release nào đổi hạ tầng phải chạy song song đường cũ ít nhất vài giờ.

## 7. Bằng chứng tối thiểu cho mỗi lần phát hành
```
shasum -a 256 <file>                     (khớp hash bên build)
version/build đọc từ trong file          (không tin tên file)
curl -sI <link phát hành> → 200 + size
PATCH version → response JSON thật
email: kết quả gửi (số người nhận / id)
link trên /buy và /install/* đã trỏ bản mới
```
