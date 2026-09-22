# iOS — XỬ LÝ SỰ CỐ CÀI ĐẶT (Ad Hoc) & câu hỏi Developer Mode

> Nguồn sự thật: chính IPA đang phát. Kiểm bằng:
> `codesign -d --entitlements :- Payload/*.app` → **get-task-allow = False**
> `security cms -D -i Payload/*.app/embedded.mobileprovision` → profile **Ad Hoc** (có `ProvisionedDevices`).

## 0. Kết luận trước (trả lời thẳng khách)
- Bản shop phát là **Ad Hoc**, `get-task-allow = false` ⇒ **KHÔNG cần Developer Mode**.
- Khách **chỉ cần 2 việc**: (1) máy đã đăng ký UDID với shop, (2) **Trust** hồ sơ nhà phát triển sau khi cài.
- Nếu iOS **đòi Developer Mode** ⇒ khách đang cài **bản ký Development** (bản nội bộ, không phải bản shop) → tải lại từ `https://t1.meetflowai.site/install/ios`.

## 0a. "Nhập code xong KHÔNG vào được app" — profile thiếu nhóm keychain `.shared` (22/09/2026)

**Triệu chứng:** khách nhập đúng code, màn hình đăng nhập **không đóng** và **không hiện thông báo lỗi**
(`AuthSessionStore.save()` nuốt lỗi). Tunnel cũng không dùng được vì khoá WireGuard không lưu.

**Nguyên nhân gốc** (đo trên chính IPA đang phát 1.4.0/16, 8.135.823 B):
- Chữ ký app + extension khai `keychain-access-groups = G6XW3RN6LJ.com.privatevpn.shared`.
- Nhưng `embedded.mobileprovision` chỉ cấp nhóm **wildcard** `G6XW3RN6LJ.*` — **không** liệt kê `.shared`.
- iOS cấp nhóm theo **PROFILE** ⇒ `SecItemAdd` trả `errSecMissingEntitlement` (-34018) ⇒ session không lưu
  ⇒ `isSignedIn = false` ⇒ app đứng ở màn hình đăng nhập.
- Kèm lỗi ký: appex 1.4.0/16 có `application-identifier = G6XW3RN6LJ.com.privatevpn.app` trong khi profile
  của nó là `.packet-tunnel` (bundle bị ký sai entitlements).

**Vì sao lọt:** lệnh verify cũ chỉ soi **chữ ký** (có `.shared` nên PASS) mà **không soi profile**.

**Kiểm bằng cổng chặn (chạy trên máy Mac, có `codesign`):**
```bash
python3 scripts/check-publish-version.py --platform ios --file <ipa> --version <ver> --build <n>
# → [KHÔNG ĐẠT] Keychain group iOS (App/Extension) ... PROFILE không cấp nhóm ...shared
```

**Cách sửa (Apple Developer portal, máy Mac):**
1. Identifiers → App ID `com.privatevpn.app` → **Keychain Sharing** → thêm nhóm `com.privatevpn.shared`.
2. Làm y hệt cho `com.privatevpn.app.packet-tunnel` — **app + extension PHẢI cùng nhóm**.
3. Regenerate profile Ad Hoc/Development ⇒ profile **phải liệt kê** `G6XW3RN6LJ.com.privatevpn.shared`
   (không chỉ `G6XW3RN6LJ.*`).
4. Ký lại IPA (`scripts/ios-resign-ipa.sh` hoặc `scripts/sign-server/resign-ipa.sh`) — chữ ký app **và**
   appex đều phải khai đúng `.shared`.
5. Chạy lại cổng chặn tới khi **ĐẠT**, rồi test trên **iPhone thật** trước khi phát (§2c).

**Nếu portal không cho tạo nhóm `.shared`:** đổi nhóm trong `KeychainStore.accessGroup` +
`PacketTunnelProvider.accessGroup` sang nhóm profile **thật sự cấp** — nhưng phải **cùng một nhóm ở cả
app lẫn extension**; sửa code thì phải **build lại + test máy thật** (không chỉ ký lại).

## 1. Luồng cài đúng (3 bước, đã có trên email + trang cài)
1. Mở **Safari trên chính iPhone/iPad** → `https://t1.meetflowai.site/install/ios` → **Đăng ký thiết bị** → cài hồ sơ (Settings → **Profile Downloaded** → Install). Bước này gửi UDID về shop.
2. Chờ shop ký (thường vài phút) → quay lại trang, bấm **Cài đặt VPNFlow**.
3. Nếu iOS báo *“Untrusted Developer”* hoặc app mở ra rồi tắt ngay: **Settings → General → VPN & Device Management → (tên nhà phát triển) → Trust** → mở lại app.
4. Mở app → đăng nhập email đã mua → **Allow** khi iOS hỏi cấu hình VPN → **Connect**.

## 2. Developer Mode: khi nào cần, khi nào KHÔNG
| Tình huống | Có cần Developer Mode? | Xử lý |
|---|---|---|
| Cài IPA **Ad Hoc** của shop (`get-task-allow=false`) | **KHÔNG** | Chỉ cần **Trust** hồ sơ (mục 1.3) |
| Cài IPA **Development** (bản nội bộ, `get-task-allow=true`) | **CÓ** | Chỉ dùng cho máy nội bộ; khách thì phát bản Ad Hoc |
| Cài qua **TestFlight** | **KHÔNG** | Chỉ cần cài TestFlight + bấm Install |
| Chạy app trên máy Mac (macOS 15+) khi build Development | CÓ | Bản phát hành macOS đã ký Developer ID + notarize ⇒ không cần |

## 3. Nếu BẮT BUỘC phải bật Developer Mode (máy nội bộ)
**Đường dẫn:** `Settings → Privacy & Security → Developer Mode` → bật → **khởi động lại máy** → sau khi khởi động lại, xác nhận **Turn On**.
- Chỉ xuất hiện từ **iOS/iPadOS 16**. Máy iOS 15 trở xuống **không có** mục này (và cũng không cần cho Ad Hoc).
- Máy **đã cài app ký Development** cũng làm mục này hiện ra.

### 3a. Trường hợp menu **Developer Mode bị ẨN** (câu hỏi của chủ dự án)
Nguyên nhân & cách xử theo thứ tự:
1. **Chưa từng kết nối Xcode / chưa cài app Development nào** → mục này **chưa tồn tại**.
   Cách làm hiện: cắm máy vào **Mac có Xcode** (Xcode → Window → Devices and Simulators, chờ máy hiện ra), hoặc cài **một app ký Development** bất kỳ → mục Developer Mode sẽ xuất hiện trong Settings → Privacy & Security.
2. **Máy do công ty/quản lý (MDM/supervised)** → mục bị ẩn và **không thể tự bật**; phải nhờ IT gỡ MDM. Cách này không khả thi cho khách → **phát bản Ad Hoc** (không cần Dev Mode).
3. **iOS < 16** → không có Developer Mode; app Ad Hoc vẫn cài bình thường.
4. Đã bật nhưng app vẫn báo: thường là **chưa Trust hồ sơ** (mục 1.3) hoặc máy **chưa có trong profile** (UDID chưa đăng ký) → kiểm ở `ios-devices.json` và đăng ký UDID với Apple rồi ký lại IPA.

## 4. Kiểm tra nhanh phía shop (không cần hỏi khách nhiều)
```bash
# UDID hợp lệ của Apple phải có dạng 8 ký tự hex - 16 ký tự hex, ví dụ:
#   00008120-0008299A26D80032
# Giá trị dạng UUID 8-4-4-4-12 (ví dụ 664D325A-AFAE-53D7-BD2B-D6AF7A80AB41) là KHÔNG hợp lệ
#   → Apple từ chối: "An invalid value ..." ⇒ khách phải làm lại hồ sơ trên đúng máy iOS.
```
- Đối chiếu UDID trong store với profile trong IPA:
  `security cms -D -i Payload/*.app/embedded.mobileprovision` → `ProvisionedDevices`.
- Thiếu UDID ⇒ phải **ký lại IPA** (xem `docs/MACOS_SIGN_NOTARIZE.md` §tương tự cho iOS + `scripts/ios-resign-ipa.sh`).

## 5. Mẫu trả lời khách (ngắn, dùng lại được)
> Bản của shop **không cần Developer Mode**. Anh/chị làm 3 bước: mở Safari trên chính máy đó → tải và cài **hồ sơ đăng ký thiết bị** → quay lại trang bấm **Cài đặt VPNFlow**. Sau khi cài, vào **Settings → General → VPN & Device Management** và bấm **Trust**. Nếu máy báo cần Developer Mode thì anh/chị đang cài **bản nội bộ**, hãy tải lại bản chính thức ở `https://t1.meetflowai.site/install/ios`.
