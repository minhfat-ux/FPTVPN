# BUG → harness Windows: dashboard VPNFlow trộn 3 cơ sở đếm thiết bị (KPI mâu thuẫn nhau)

- **Từ:** harness Mac (main agent) · **Cho:** **harness Windows** (owner `control-plane/**`)
- **Ngày:** 02/10/2026 · **Nguồn:** chủ dự án báo *"quản lý thiết bị đang sai so với số user đã đăng ký"* ⇒ Mac đã đo trực tiếp trên node-2.
- **Mức:** hiển thị sai (KHÔNG mất dữ liệu, KHÔNG ảnh hưởng tunnel/khách dùng). Ưu tiên trung bình.

## 1. Dữ liệu thật (đọc tại node-2, 02/10/2026)
| Kiểm tra | Kết quả |
|---|---|
| `auth.json` users | **20** (20/20 có email, 0 revoked) |
| `devices.json` bản ghi | **14**, trong đó **có `userId`**: 14 · **không có `userId`**: 0 |
| Bản ghi trỏ `userId` không tồn tại | **0** (không mồ côi) |
| Trùng `publicKey` / trùng `deviceName` | 0 / 0 |
| Tài khoản **có** thiết bị | **6** |
| Tài khoản **không có** thiết bị nào | **14** |
| `ios-devices.json` (UDID, cơ chế riêng) | **10** |

⇒ **Dữ liệu đúng**; vấn đề nằm ở **cách đếm/hiển thị** trên dashboard.

## 2. Dashboard đang hiển thị 3 con số khác nhau cho cùng một thứ
`/v1/admin/stats` (node-2) trả:
```
devices: 10   device_records: 14   legacy_android_records: 8   legacy_android_grouped_away: 4
users: 20     active_devices: 14   revoked_devices: 0           test_devices: 0
by_platform: {ios: 4, macos: 1, android: 8, windows: 1}   ← tổng 14
by_user: 6 dòng, tổng = 7+2+2+1+1+1 = 14                  ← tổng 14
```
| Chỗ hiển thị | Con số | Cơ sở đang dùng |
|---|---|---|
| Thẻ **Devices** | **10** | **máy thật** (`summarizeMachines`, đã gộp bản ghi Android cài lại) |
| Thẻ **Active** ("not revoked") | **14** | **bản ghi** ⇒ **Active (14) > Devices (10)** — nhìn là thấy vô lý |
| Chart **By platform** | tổng **14** | bản ghi |
| Panel **Users by devices** | 6 dòng, tổng **14** (minhnb2@me.com = **7**) | bản ghi |
| Thẻ **Users** | **20** | tài khoản (6 có thiết bị / **14 chưa từng có**) |
| Tab **iOS (UDID)** | **10** | thiết bị Apple đăng ký IPA — cơ chế khác hẳn |

Ví dụ một tài khoản: `minhnb2@me.com` = **7 bản ghi** (macos 1 + android 5 + ios 1) nhưng chỉ **3 máy thật** (1 Mac, 1 Android — 5 bản ghi Android cũ gộp còn 1, 1 iPhone). Dashboard đang cho thấy số **7**.

## 3. Nguyên nhân gốc
`control-plane/src/index.js` (bản đang chạy, sha256 `6f47375b…`, 02/10 15:32):
- `devices: machineStats.machines` (10) — theo thiết kế bus #591/T-20260929-04 (đếm MÁY, không đếm bản ghi).
- Nhưng `active_devices` (`byStatus`), `by_platform`, `by_user` vẫn tính trên **`realDevices` = bản ghi** (14).
⇒ Hai cơ sở đếm trong CÙNG một payload, không có nhãn phân biệt ở mọi chỗ ⇒ KPI cạnh nhau mâu thuẫn và
"Users: 20" cạnh "Users by devices: 6 dòng" dễ bị đọc thành **mất 14 tài khoản**.

## 4. Việc cần sửa (WIN — vùng bảo vệ, Mac KHÔNG sửa)
1. **Chọn một cơ sở** cho toàn dashboard. Đề xuất: **máy thật** là số chính; mọi chỗ khác ghi rõ "(bản ghi)" nếu vẫn hiển thị bản ghi.
2. `active_devices` phải đếm theo **máy** (hoặc đổi nhãn thành "Active records") và **đảm bảo Active ≤ Devices**.
3. `by_platform` theo **máy** (hoặc ghi rõ là bản ghi) — hiện tổng 14 lệch với thẻ 10.
4. `by_user`: trả thêm `machines` cạnh `total` (records) và panel hiện **"3 máy / 7 bản ghi"**.
5. Thêm 2 thẻ cho minh bạch: **Owners** = 6 (tài khoản có ≥1 thiết bị) và **Users without device** = 14.
6. Tab **iOS (UDID)**: ghi rõ đây là cơ chế đăng ký IPA (10 thiết bị), **không** cộng vào "Devices".

## 5. Nghiệm thu (Mac sẽ kiểm lại)
1. Trên dashboard: `Devices ≥ Active`, và `By platform` + `Users by devices` khớp đúng cơ sở của thẻ `Devices`.
2. Một dòng đối chiếu đọc được, ví dụ: `10 máy (14 bản ghi) · 6 tài khoản có máy / 20 tài khoản`.
3. Không đổi ngữ nghĩa dữ liệu: 14 bản ghi vẫn còn trong `devices.json`; chỉ đổi cách đếm/hiển thị.
4. Bằng chứng: ảnh/`curl /v1/admin/stats` sau sửa + so với các số ở §1 (phải tái lập được).

## 6. Ghi chú
- Bản `src/index.js` trên node-2 **mới hơn** bản trong repo Mac (`legacy_android*` chưa có trong cây local) — khi sửa nhớ lấy từ node-2 để không ghi đè mất phần đếm máy.
- Việc này độc lập với đợt "bắt buộc đăng ký email" (`HANDOFF_MEETFLOW_EMAIL_NOTICE_2026-10-10.md`), nhưng cùng WIN làm.

## 7. Phát hiện thêm (đo 02/10): **KHÔNG bản ghi nào có `machineId`**
14/14 bản ghi trong `devices.json` đều **thiếu `machineId`** ⇒ `summarizeMachines` phải rơi vào nhánh
"legacy": mọi bản ghi Android cũ của một tài khoản bị **gộp thành 1 máy**, còn iOS/macOS/Windows thì
**mỗi bản ghi = 1 máy**. Nghĩa là con số "máy thật" hiện tại (10) **không phải số đo thật** mà là suy
đoán từ dữ liệu thiếu.
- Hệ quả: nếu một khách cài lại app Android **2 lần trên 2 máy khác nhau** mà không có `machineId`,
  dashboard sẽ gộp thành **1 máy** (đếm thiếu). Ngược lại khách cài lại nhiều lần trên cùng một máy
  thì gộp đúng.
- Cần: (a) phía app Android/Windows/iOS **gửi `machineId` ổn định** khi đăng ký thiết bị (Android =
  `Settings.Secure.ANDROID_ID`; iOS = `identifierForVendor` lưu Keychain; Windows = MachineGuid);
  (b) khi đó `summarizeMachines` mới đếm đúng máy; (c) dashboard ghi rõ khi số máy là ước lượng
  (còn bản ghi thiếu `machineId`).
- Đây là **cùng gốc** với bus #591: bản ghi mới mỗi lần cài lại — nhưng phần client chưa được sửa.
