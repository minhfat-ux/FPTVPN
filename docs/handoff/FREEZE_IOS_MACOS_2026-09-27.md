# 🔒 LOCK — iOS + macOS (chủ dự án ra lệnh 27/09/2026)

> **Nguyên văn lệnh:** *"lock bản IOS, MacOS. Không cho update code gì thêm. Chờ cho đến khi có thông báo mới."*

## 1. Hiệu lực
- **CẤM** mọi thay đổi code, build, ký/notarize, upload, set mốc, gửi email, tạo tag cho **iOS** và **macOS**.
- **CẤM** commit/push bất kỳ file nào thuộc đường iOS/macOS: `iOS/**`, `mac/**`, `project.yml`, `scripts/ios-*`,
  `scripts/mac-*`, `scripts/archive-appstore.sh`, `release/ios/**`, `release/releases.jsonl` (dòng iOS/macOS),
  `Mac*/iOS*` trong `docs/handoff/**`.
- **CẤM** mọi lệnh lên App Store Connect cho app `com.privatevpn.app` (kể cả `asc-beta.mjs submit|expire|cancel`)
  và mọi lệnh lên node-2 cho kênh iOS/macOS (`/root/flowvpn-ipa/`, `/root/flowvpn-mac/`).
- **KHÔNG** tạo tag mới, **KHÔNG** sửa `latest_*`/`minimum_*` của ios/macos.
- Kênh khác (Windows, Android, control-plane/buy page) **KHÔNG** thuộc lệnh này — trừ khi đụng vào code iOS/macOS.

## 2. Trạng thái ĐÓNG BĂNG (đo lúc ra lệnh, 27/09/2026 ~00:4x)
| Kênh | Đang phát | Ghi chú |
|---|---|---|
| Web iOS | **1.4.6 / build 57** (8.210.605 B · sha256 `a4fec707…442a30`) | marker `latest_ios_version=1.4.6`, `ipa_build=57`, `minimum` giữ `1.3.3` |
| TestFlight (iOS) | **build 57** `WAITING_FOR_BETA_REVIEW` (nhóm External Test, What-to-Test 3 ngôn ngữ) | build 54 đã `EXPIRED` |
| Web macOS | **1.4.7 / build 28** (23.798.393 B · sha256 `d8364650…b3d2346`) | marker `latest_mac_version=1.4.7`, `minimum_mac_version=1.4.7`; tag `macos-v1.4.7` |
| Tag iOS | `ios-v1.4.6` (trỏ bản 54) | **không** tạo tag mới khi khoá |

## 3. Việc ĐANG DỞ bị TẠM DỪNG (không được tự làm tiếp)
1. **macOS 1.4.7 / build 30** — chủ dự án từng yêu cầu phát; publisher đã hỏi session Mac (bus **#500**) nhưng **chưa có artifact**
   (không có `.macbuild-dd30`, DMG 29/30, `project.yml` vẫn `1.4.7/28`). ⇒ **DỪNG**: không build, không bump version, chờ thông báo.
2. **iOS build 58 (vá `BUG-IOS-WATCHDOG-SILENT-001`)** — bản vá (`timer.resume()` trước khi công bố trong `startLivenessWatchdog`)
   **đang nằm trong cây làm việc, CHƯA commit**. ⇒ **DỪNG**: không commit, không build, không phát.
   ⚠️ **RỦI RO MẤT VIỆC:** cây làm việc đang có nhiều file iOS/macOS sửa dở của các session (kể cả bản vá trên).
   Nếu cần bảo toàn, chủ dự án cho phép thì mới commit vào **nhánh riêng** (`wip/ios-macos-<ngày>`), **không** gộp main, **không** build.
3. **TestFlight 57** đang chờ Apple review — **không** can thiệp thêm (kể cả không rút/expire).

## 4. Việc ĐƯỢC PHÉP trong lúc khoá
- Đọc code/log, viết báo cáo, cập nhật **bug list** (`.privatevpn/status/bugs.json`) và tài liệu **không thuộc** đường iOS/macOS.
- Hỗ trợ khách (email/support), theo dõi kênh, chạy **cổng kiểm tra chỉ-đọc** (không build).
- Kênh Windows/Android và `control-plane` (trang buy) vẫn làm bình thường theo phân vai.

## 5. MỞ KHOÁ
Chỉ khi **chủ dự án thông báo mới**. Khi đó:
1. Ghi ngày/giờ mở khoá vào chính file này.
2. Xác nhận lại version đang phát trên web + App Store Connect **trước khi** build.
3. Xử tiếp danh sách §3 theo thứ tự chủ dự án chốt.

---
*Người ra lệnh: chủ dự án · Người ghi: harness Mac (publisher) · Thời điểm: 27/09/2026 ~00:4x (+08)*
