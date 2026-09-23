# VPNFlow iOS 1.4.2 (build 19) — có gì mới

> Phát hành 23/09/2026. Đây là bản **BUỘC CẬP NHẬT**: app cũ (≤ 1.4.1/18) sẽ hiện màn hình yêu cầu
> cập nhật và **không dùng được** cho tới khi cập nhật xong (`minimum_version = 1.4.2`).
> Nội dung thông báo khách: `docs/NOTICE_IOS_RELOGIN.md` (VI/EN/ZH) · gửi email bằng
> `scripts/send-ios-b19-announcement.py`.
> Nguồn: commit `7c98e53` (đăng xuất thiết bị khác), `820b9d2` + `ff08f5b` (watchdog sống-còn),
> và commit bỏ nhóm keychain của bản này.

## Vì sao bắt buộc cập nhật

Bản ≤ 1.4.1/18 khai **nhóm keychain dùng chung** (`G6XW3RN6LJ.com.privatevpn.shared`) nhưng profile
Ad Hoc chỉ cấp wildcard `G6XW3RN6LJ.*` ⇒ `SecItemAdd` trả `errSecMissingEntitlement (-34018)` ⇒
khách **nhập mã OTP xong vẫn đứng ở màn đăng nhập**. Bản 19 bỏ hẳn nhóm đó: iOS chỉ ghi keychain
RIÊNG của app (extension iOS là hysteria-only, không đọc keychain nên không cần chia sẻ).

**Hệ quả với khách:** phải **đăng nhập lại một lần** (email + OTP). Không mất hội thoại, credit hay
gói dịch vụ. `device.identity` sinh lại nên có thể bị tính là thiết bị mới — tài khoản chủ dự án đã
được miễn kiểm thiết bị; khách thường tự đăng xuất máy cũ ngay trong app (Cài đặt → Thiết bị).

## Điểm chính (dùng để thông báo khách)

1. **Sửa lỗi "nhập mã xong không vào được app"** — bỏ nhóm keychain dùng chung trên iOS (app + appex).
2. **Tự đăng xuất khỏi thiết bị khác ngay trên app** (Cài đặt → Thiết bị) — `7c98e53`.
3. **Watchdog "tunnel còn sống nhưng không chở gói" chạy suốt phiên và tự dựng lại** — `820b9d2`, `ff08f5b`.
4. **Nhắc mềm khi có bản mới** + màn hình buộc cập nhật (đọc `latest_version`/`minimum_version` từ server).
5. Nút **Đăng xuất khỏi thiết bị này** và danh sách thiết bị trong Cài đặt.

## Chưa có trong build 19 (sẽ ở build 20 — KHÔNG được quảng cáo)

- **Chính sách khai báo băng thông theo Android** (`BandwidthMemory`/pre-measure trước khi khai,
  `apply=deferred-next-connect`, bỏ clamp theo mẫu rỗng) — đang làm, chỉ phát hành sau khi có log
  chứng minh trên máy thật. Build 20 sẽ là **nhắc mềm**, KHÔNG buộc cập nhật.

## Kênh phát hành

| Kênh | Bản | Ghi chú |
|---|---|---|
| Trang buy / cài trực tiếp (IPA ad-hoc) | 1.4.2 (19) | `FlowVPN.ipa` · 8.156.045 B · sha256 `803eeec340b616d08d039fc178a7b44a006f39bff7f4ad791f64583c1450156e` · profile `VPNFlow AdHoc App` **8 UDID** · `get-task-allow=false` (không cần Developer Mode) |
| App Store Connect / TestFlight | 1.4.2 (19) | nộp sau khi bản ad-hoc chạy ổn định |

## Việc đã kiểm trước khi phát

- Version/build **đọc trực tiếp trong IPA**: app `1.4.2 / 19` · extension `1.4.2 / 19`.
- `codesign -d --entitlements :-` trên app + appex: **0** dòng `keychain-access-groups` (2 target macOS vẫn giữ nhóm — đã kiểm `project.yml` dòng 318/396).
- Profile Ad Hoc nhúng IPA: `VPNFlow AdHoc App` · **8 UDID** — khớp 1-1 với 8 thiết bị `platform=IOS` trên Apple (bản ghi thứ 9 ở control-plane là **máy Mac** `Mac15,13`, không thuộc profile iOS).
- `python3 scripts/check-publish-version.py --platform ios --version 1.4.2 --build 19` → **exit 0** (không còn mục `KHÔNG ĐẠT`).
- IPA export từ **cây sạch** `/Volumes/BIWIN/SourcesCode/PrivateVPN-rel142` (HEAD `a293da0` + patch keychain/version) — `git diff HEAD` cho `HysteriaBandwidthControl.swift`/`RampStatus.swift` **trống** ⇒ KHÔNG chứa code ramp đang làm dở.
- Đã cài lên iPhone thật (`00008120-00010D102E40C01E`, iPhone 14 Pro Max) — **chờ chủ dự án đăng nhập lại 1 lần** để chốt lỗi `-34018` đã hết trước khi bật `minimum_version`.
