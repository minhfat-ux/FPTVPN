# Bàn giao — GỐC RỄ "nhập code xong không vào được app" (iOS) + bản 1.4.1/17 đã sửa

- **Người làm**: MAC harness · **Ngày**: 2026-09-22 · **Task**: `T-20260922-06`
- **Kết luận ngắn**: thủ phạm **KHÔNG phải** profile thiếu nhóm keychain. Profile Ad Hoc cấp
  `G6XW3RN6LJ.*` là **đủ**. Lỗi thật là **chữ ký của IPA 1.4.1/17 khai wildcard `G6XW3RN6LJ.*`**
  trong `keychain-access-groups`, trong khi code đòi **ĐÚNG** `G6XW3RN6LJ.com.privatevpn.shared`.
  iOS chỉ cho dùng nhóm **có tên tường minh trong chữ ký** ⇒ `SecItemAdd` trả **-34018** ⇒
  `AuthSessionStore.save()` không lưu được session ⇒ app kẹt ở màn hình đăng nhập.

## 1. Bằng chứng đo trên iPhone THẬT (14 Pro Max, iOS 26.7, UDID `00008120-00010D102E40C01E`)

App chẩn đoán tối giản (`/tmp/kcdiag`, cùng bundle `com.privatevpn.app` + cùng profile Ad Hoc
`VPNFlow AdHoc App` + cùng `application-identifier`), gọi `SecItemAdd` với
`kSecAttrAccessGroup = G6XW3RN6LJ.com.privatevpn.shared`, chạy bằng
`xcrun devicectl device process launch --console`:

| Biến thể | `keychain-access-groups` trong CHỮ KÝ | Nhóm trong PROFILE | `SecItemAdd(.shared)` |
|---|---|---|---|
| A | `[G6XW3RN6LJ.com.privatevpn.shared]` (tường minh) | `[G6XW3RN6LJ.*, com.apple.token]` (wildcard) | **`status=0` — THÀNH CÔNG** |
| B | `[G6XW3RN6LJ.*]` (wildcard, y như IPA 1.4.1/17 cũ) | `[G6XW3RN6LJ.*, com.apple.token]` (wildcard) | **`status=-34018` — errSecMissingEntitlement** |

Cùng profile, cùng máy, cùng bundle — **chỉ khác chữ ký** ⇒ kết luận chắc chắn:
**profile wildcard KHÔNG phải nguyên nhân; chữ ký wildcard mới là.**

Và điều này khớp với `scripts/sign-server/resign-ipa.sh` (bản ký trên server đã có sẵn hàm sửa
`keychain-access-groups` về nhóm cụ thể từ sự cố 16/09) — bản ký trên **Mac** thì **thiếu** bước đó.

## 2. Đã sửa gì

| path | thay đổi |
|---|---|
| IPA 1.4.1/17 | **Ký lại** app + appex với `keychain-access-groups = [G6XW3RN6LJ.com.privatevpn.shared, com.apple.token]` (giữ nguyên mọi quyền khác lấy từ chữ ký cũ + profile cũ). `codesign --verify --deep --strict` = *valid on disk* + *satisfies its Designated Requirement* |
| `scripts/ios-resign-ipa.sh` | Thêm `normalize_keychain_groups()`: sau khi lấy entitlements từ chữ ký cũ, ghi lại **nhóm cụ thể** (bỏ wildcard) cho app **và** appex; thêm **cổng cứng** sau khi ký — thiếu nhóm cụ thể là **thoát lỗi**, không phát |
| `scripts/check-publish-version.py` | Thêm `check_ios_keychain()` + `--require-keychain-group`: **chữ ký** phải có nhóm cụ thể, **profile** chỉ cần phủ (wildcard hợp lệ), và `application-identifier` chữ ký = profile. Chạy ở `--mode pre`. Đây là bản **đúng** thay cho bản đã revert `d8086ee` (bản cũ đòi PROFILE phải liệt kê tường minh — sai, xem bảng §1) |

**KHÔNG cần** Apple Developer portal, **KHÔNG cần** đổi `KeychainStore.accessGroup`, **KHÔNG** cần
build lại code: binary 1.4.1/17 giữ nguyên, chỉ sửa chữ ký.

## 3. Lệnh đã chạy + kết quả thật

```text
# Cổng chặn trên IPA CŨ (chữ ký wildcard) — phải chặn
$ python3 scripts/check-publish-version.py --platform ios --file /tmp/VPNFlow-1.4.1-17-test.ipa \
    --version 1.4.1 --build 17
  [     KHÔNG ĐẠT] Keychain group iOS (App)        CHỮ KÝ thiếu G6XW3RN6LJ.com.privatevpn.shared tường minh ...
  [     KHÔNG ĐẠT] Keychain group iOS (Extension)  CHỮ KÝ thiếu G6XW3RN6LJ.com.privatevpn.shared tường minh ...
⛔ KHÔNG ĐẠT (2 mục)     → exit 1

# Cổng chặn trên IPA ĐÃ SỬA — phải ĐẠT
$ python3 scripts/check-publish-version.py --platform ios --file /tmp/VPNFlow-1.4.1-17-keyshared.ipa \
    --version 1.4.1 --build 17
  [           ĐẠT] Keychain group iOS (App)        chữ ký có G6XW3RN6LJ.com.privatevpn.shared; profile phủ nhóm
  [           ĐẠT] Keychain group iOS (Extension)  chữ ký có G6XW3RN6LJ.com.privatevpn.shared; profile phủ nhóm
✅ ĐẠT — được phép upload.  → exit 0

# Cài lên iPhone thật + xác nhận từ máy
$ xcrun devicectl device install app --device 33987D6F-... /tmp/verify141/Payload/FlowVPN.app
• installationURL: .../FlowVPN.app/
$ xcrun devicectl device info apps --device 33987D6F-...
Name      Bundle Identifier       Version   Bundle Version
VPNFlow   com.privatevpn.app      1.4.1     17
```

## 4. Artifact bàn giao

| Hạng mục | Giá trị |
|---|---|
| IPA | `build/ios-resign/VPNFlow-1.4.1-17-keyshared.ipa` (bản gitignore; gốc `/tmp/VPNFlow-1.4.1-17-keyshared.ipa`) |
| Size | 8.742.734 bytes |
| sha256 | `e6dfe38741ea96ab07c729b40e1b413b2d2526bf80e7a79eb755e8b922bc39aa` |
| Version / build | 1.4.1 / 17 (app **và** extension, đọc từ trong bundle) |
| Ký | `Apple Distribution: Minh Nguyen (G6XW3RN6LJ)` · Ad Hoc `VPNFlow AdHoc App` + `VPNFlow AdHoc Tunnel` (có UDID máy test) |
| Keychain (chữ ký) | app + appex = `[G6XW3RN6LJ.com.privatevpn.shared, com.apple.token]` |
| Keychain (profile) | `[G6XW3RN6LJ.*, com.apple.token]` (đủ — xem §1) |

## 5. Việc còn lại (cần người thật cầm iPhone — không tự động hoá được)

1. Mở app đã cài → đăng nhập email đã mua → nhận code → nhập code ⇒ **phải vào được app**.
   (Đây là mục duy nhất chưa có bằng chứng máy: cần email thật + thao tác tay.)
2. Kết nối ≥10 phút, đổi Wi-Fi ⇄ 4G, ngắt VPN không mất mạng, watchdog 0 báo oan.
3. Ảnh **Settings → About** đối chiếu mốc.

## 6. Điểm chưa chắc

- Chưa chạy được §2c đầu-cuối (cần người thật). Phần keychain — mắt xích được cho là nguyên nhân —
  đã được chứng minh khắc phục bằng thực nghiệm A/B trên chính máy test.
- Chưa kiểm runtime riêng cho **extension** (không cài được app trần trùng bundle `.packet-tunnel`);
  nhưng chữ ký extension đã được cổng chặn xác nhận có nhóm cụ thể và `application-identifier` khớp profile.
