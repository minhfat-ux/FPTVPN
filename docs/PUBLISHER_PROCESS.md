# PUBLISHER PROCESS — luật & quy trình phát hành app/version

> Vai trò **publisher** = harness Mac. Tài liệu này là **luật**: làm sai thứ tự ⇒ dừng, hỏi chủ dự án.
> Đọc kèm: `docs/RELEASE_RUNBOOK.md` (lệnh chi tiết), `docs/RELEASE_ARTIFACTS_<ngày>.md` (bàn giao từ bên build).

## 1. Luồng bắt buộc: BUILD → HANDOFF → PUBLISH → ANNOUNCE
```
[máy build]  build xong, ghi docs/RELEASE_ARTIFACTS_<ngày>.md (bảng: file, size, sha256, version, ký, đích node-2, mốc)
             ⚠️ manifest ghi rõ mục "Việc chưa xong" — publisher KHÔNG được quảng cáo mấy mục đó
      ↓
[publisher]  1. CLAIM vùng release trên bảng việc chung (AGENTS.md §6)
             2. VERIFY từng file (bảng §2) — sai/không khớp ⇒ DỪNG, báo lại bên build
             3. BACKUP bản đang phát trên node-2 (đổi tên có ngày)
             4. UPLOAD đúng đường dẫn route đọc (§3)
             5. VERIFY link phát hành: HTTP 200 + content-length KHỚP size file
             6. SET MỐC version (§4) ×em response thật, không tin exit code curl
             7. RELEASE NOTES đã có trong repo ⇒ ghi nhật ký (§6)
             8. EMAIL thông báo user (§5) — nội dung chỉ nêu tính năng ĐÃ xong
             9. Xác nhận trên kênh khách: /buy, /install/ios, /install/mac trỏ bản mới
            10. Báo cáo bằng chứng + RELEASE claim
```

## 2. Bắt buộc verify trước khi upload (không có ngoại lệ)
| Kiểm | Lệnh | Điều kiện đạt |
|---|---|---|
| sha256 | `shasum -a 256 <file>` | **khớp 100%** hash trong manifest |
| Version iOS | `unzip -q <ipa> -d /tmp/x && PlistBuddy -c 'Print :CFBundleShortVersionString' /tmp/x/Payload/*.app/Info.plist` | khớp `version` + `build` trong manifest (**đọc từ trong file**, không tin tên file) |
| Extension iOS | `ls /tmp/x/Payload/*.app/PlugIns/` | có `PrivateVPNPacketTunnel.appex` |
| Keychain group iOS | `codesign -d --entitlements - /tmp/x/Payload/*.app \| grep -o 'G6XW3RN6LJ[A-Za-z.]*'` | đúng `G6XW3RN6LJ.com.privatevpn.app` (sai ⇒ app kẹt màn hình đăng nhập) |
| APK | `aapt2 dump badging <apk> \| grep ^package:` | `versionName`/`versionCode` khớp manifest; **cả modern + legacy cùng cert** |
| Size sau upload | `stat -c %s <file>` trên node-2 | khớp size file local |

## 3. Đích trên node-2 (route nào đọc file nào)

> **Ngoại lệ KHÔNG được đổi host: relay WS.** Mọi link khách bấm đều dùng `t1.meetflowai.site`, nhưng
> relay (`wss://api.meetflowai.site/relay/vn1wg|vn1hy|vn2wg|vn2hy`) **phải giữ host `api.meetflowai.site`**
> vì Caddy chỉ route `/relay/*` trên host đó — đổi là toàn bộ khách mất mạng. `check-public-surface.py`
> có mục kiểm riêng cho việc này.
| Nền tảng | File trên node-2 | Route phát |
|---|---|---|
| iOS (IPA ad-hoc) | `/root/flowvpn-ipa/VPNFlow-latest.ipa` | `GET /v1/downloads/ios` |
| Android modern | `/root/flowvpn-apk/VPNFlow-latest.apk` | `GET /v1/downloads/android` |
| Android legacy | `/root/flowvpn-apk/VPNFlow-android7.apk` | `GET /v1/downloads/android-legacy` |
| macOS | `/root/flowvpn-mac/VPNFlow-mac.dmg` | `GET /v1/downloads/mac` |
| Windows | `/var/www/flowvpn/dl/VPNFlow-Setup-*.exe` | `GET /dl/…` (harness Windows phát hành; publisher chỉ **verify** link trên `/buy`) |
Luôn kiểm bằng host vào được từ TQ: `https://t1.meetflowai.site/...`. Gặp 404 oan ⇒ thêm `?v=<hash>` (cache Cloudflare).

## 4. Mốc phiên bản (để app biết có bản mới)
| Nền tảng | Endpoint | Field |
|---|---|---|
| iOS | `PATCH /v1/admin/app-version` | `latest_version`, `ipa_build` |
| Android | `PATCH /v1/admin/android-version` | `latest_version` |
| Windows | `PATCH /v1/admin/windows-version` | `latest_version` (script `scripts/send-update-announcement.sh`) |
**Luật:** chỉ set `latest_version` (+ `ipa_build`). **KHÔNG** đặt `minimum_version` (buộc cập nhật) trừ khi chủ dự án chốt rõ.
`ipa_build` phải khớp `CFBundleVersion` trong IPA — lệch là manifest OTA sai.

## 5. Email thông báo cho user
- Kênh: Resend, gửi từ `support@meetflowai.site` (env `RESEND_API_KEY` trong drop-in của control-plane).
- Danh sách người nhận: user trong `auth.json` (script tự đọc).
- **Nội dung phải có**: tên nền tảng + version, 2–4 tính năng ĐÃ XONG (lấy từ release notes), link tải (`t1.meetflowai.site`), câu hỗ trợ `support@meetflowai.site`.
- **Cấm**: quảng cáo mục nằm trong "Việc chưa xong" của manifest; hứa hẹn ngày phát hành; gửi khi mốc version chưa set xong.
- Trạng thái hiện tại: script `send-update-announcement.sh` có template Windows (zh) ⇒ **cần bổ sung template iOS/Android** trước khi dùng cho 2 nền tảng đó (việc tồn, xem §7).

## 5b. Khách chưa tải được / chưa chạy được (rà soát sau mỗi lần phát hành)
Dùng `scripts/send-reinstall-guide.py` (chạy trên node-2, đọc `auth.json` + `devices.json`):

```bash
python3 scripts/send-reinstall-guide.py --stuck        # chỉ LIỆT KÊ (không gửi)
python3 scripts/send-reinstall-guide.py --all-stuck    # gửi hết danh sách
python3 scripts/send-reinstall-guide.py --email a@b.com,c@d.com
python3 scripts/send-reinstall-guide.py --all-stuck --test   # gửi thử tới ALERT_EMAIL
```

- Tiêu chí "bị tắc" (bằng chứng dữ liệu, không đoán): **(a)** có gói còn hạn nhưng **không có device nào** ⇒ app chưa từng chạy/đăng ký; **(b)** có device nhưng `lastSeenAt` rỗng ⇒ app chạy nhưng chưa từng kết nối.
- Nội dung email: 3 ngôn ngữ, 4 nền tảng, link `t1.meetflowai.site`, nêu rõ **bản Ad Hoc không cần Developer Mode**, xoá app cũ trước khi cài, và xin ảnh lỗi + model máy.
- Vết gửi: `/root/flowvpn-cp/data/reinstall-guide-log.jsonl`; đối chiếu trạng thái thật bằng Resend list API (`last_event = delivered`).
- Nhịp: chạy `--stuck` sau mỗi lần phát hành; khách đăng ký mới mà quá 24h chưa có device ⇒ thêm vào danh sách gửi.

## 5c. Guard tự động (khách mới chưa cài/chưa chạy được)
`flowvpn-guard.service` trên node-2 chạy mỗi 5 phút: phát hiện khách **mới đăng ký** mà không có
device (`never_installed`) hoặc có device nhưng `lastSeenAt` rỗng (`never_connected`) → tự gửi email
hướng dẫn theo đúng nền tảng + phiên bản đang phát; ≥3 khách cùng nền tảng trong 24h → tạo task +
alert Telegram, **chờ chủ dự án `/approve` mới được sửa**; khi bản mới publish → tự đóng task và mời
lại khách bị ảnh hưởng. Chính sách: `/etc/flowvpn-guard.env`. Chi tiết: `PROTOCOL.md` §9.

## 6. Nhật ký phát hành (cập nhật mỗi lần)
| Ngày | Nền tảng | Version/build | Ghi chú |
|---|---|---|---|
| 2026-09-20 | iOS | 1.4.0 (16) | **Ký lại Ad Hoc cho 8 UDID** (`get-task-allow=false` ⇒ khách KHÔNG cần Developer Mode) · IPA đang phát 8.135.823 B · manifest `bundle-version` 16 |
| 2026-09-19 | iOS | 1.4.0 (15) | IPA 5.049.845 B · sha256 `b6bf9a04…0677` · đã upload + set mốc |
| 2026-09-19 | Android | 1.4.0 (20) | file đang phát trên node-2: modern 96.536.145 B (`/root/flowvpn-apk/VPNFlow-latest.apk`, 19/09 22:25 — sau fix timeout `a41bc6e`+`2c34cfb`) · legacy 96.536.152 B |
| 2026-09-19 | Android | 1.4.0 (20) | modern 96.519.741 B `a780a773…56e8` · legacy 96.536.114 B `e36b4fcb…bc46` · đã upload + set mốc |
| 2026-09-18 | Windows | Setup 1.0.7 | do harness Windows phát hành; link `/buy` có `?v=<hash>` |
| 2026-09-18 | iOS | 1.3.3 (14) | bản trước, đã được thay bằng 1.4.0 |
| 2026-09-18 | Android | 1.3.9 | trước 1.4.0 |
| 2026-09-20 | macOS | 1.3.3 (13) | **Ký Developer ID + notarize + staple** (DMG 21.617.309 B) → khách mở không cảnh báo · email 3 ngôn ngữ gửi 17/17 khách |

| 2026-09-21 | dev | guard + link | **Thống nhất mọi link khách tải về `t1.meetflowai.site`** (env `PUBLIC_SITE_URL`+`API_HOSTS`, `ios_ipa_url`/`android_apk_url(_legacy)`/`windows_installer_url`) · thêm `flowvpn-guard` (email tự động cho khách mới bị tắc + task chờ approve trên Telegram: `/guard`, `/approve`, `/reject`) |

## 7. Việc tồn của publisher
1. ~~Template email iOS/Android~~ **ĐÃ XONG 20/09**: `scripts/send-release-announcement.py` (iOS+Android 1.4.0, 3 ngôn ngữ) và `scripts/send-mac-announcement.py` (bản macOS đã ký+notarize, 3 ngôn ngữ, cờ `--all` để gửi toàn bộ khách). Cả hai có bước gửi thử tới ALERT_EMAIL trước khi gửi thật.
2. Đưa **release notes** lên web (hiện chỉ nằm trong repo `release/<platform>/RELEASE_NOTES_<ver>.md`).
3. Tự động hoá: 1 script `publish-ios.sh <ipa> <ver> <build>` + `publish-android.sh <apk-modern> <apk-legacy> <ver>` chạy đủ 10 bước §1 và in bằng chứng.
4. Kiểm tra định kỳ: link phát hành còn 200 + size khớp (đưa vào `health-watch`).

## 8. Lỗi đã từng xảy ra (đọc để không lặp)
- Link trên `/buy` trỏ sai host (`api.` ⇒ 401). Link tải phải là `t1.` hoặc `meetflowai.site`.
- PATCH mốc version thất bại **im lặng** (curl exit 0 dù 401) ⇒ phải đọc JSON trả về.
- Quên `handle` Caddy ⇒ edge 404 dù Node 200.
- Ký lại IPA làm mất keychain group ⇒ app kẹt đăng nhập.
- Đổi relay/hạ tầng khi client còn cache URL cũ ⇒ toàn bộ khách mất mạng (phải chạy song song đường cũ).
- Upload xong **không** verify size ⇒ phát hành file cụt.
- **Khách TQ tải file lớn hay đứt**: log Caddy 20 ngày có 58 lượt `/v1/downloads/*` bị `aborting with incomplete response` (27 lượt từ CN, phần lớn UA WeChat/`MicroMessenger`). Server **đã** hỗ trợ `Range` (206) nên tải lại là tiếp, không mất phần đã tải ⇒ hướng dẫn khách tải bằng Chrome/Safari, **không mở trong WeChat**.
- **Link cài iOS dùng host bị chặn ở TQ**: manifest + nút cài lấy từ `siteBaseUrl()` = `PUBLIC_SITE_URL` (mặc định `https://meetflowai.site`). Khách ở TQ bấm "Cài đặt VPNFlow" có thể fail vì host này bị chặn theo SNI. Trang cài nên tự dùng host khách đang mở (host-aware) rồi fallback `t1.meetflowai.site` — sửa trong `control-plane/src/index.js` (**vùng bảo vệ: cần handoff owner windows**). Tạm thời: luôn gửi khách link `t1.` trong email.
