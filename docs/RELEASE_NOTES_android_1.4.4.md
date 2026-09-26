# VPNFlow Android 1.4.4 (versionCode 32) — có gì mới

> Phát hành 23/09/2026. Nguồn code: bản khóa Android `eeae7ef` (v32) + commit bump `versionName`
> `1.4.3` → `1.4.4` (`39baaaf`), applicationId `com.privatevpn.app` (bản production, không phải `.dev`).
> Artifact: **2 APK release** — modern (minSdk 26) + legacy (minSdk 24), cùng cert release
> (`SHA-256 dc6e484b…5e46`).
>
> **Phân biệt với Windows:** đây là release notes riêng cho **Android 1.4.4**. Bản Windows 1.4.4 là tệp
> khác (`docs/RELEASE_NOTES_1.4.4.md`). Quy ước từ 1.4.3: `docs/RELEASE_NOTES_<platform>_<version>.md`.

## Điểm chính (dùng để thông báo khách)

So với bản đang phát **1.4.3 (versionCode 29)**, bản 1.4.4/32 gồm ba bản vá hành vi **v30 → v32** và
một thay đổi phía server:

1. **v30 — số khai tốc độ không còn tự "bóp" khi xem video adaptive.**
   Trước đây cửa sổ tính trung bình 12 giây tính **cả những giây video không tải dữ liệu**, nên số khai
   tự tụt (đo thật khi xem Netflix: `4.018 → 2.812 kbps`) rồi kẹt ở mức thấp. Nay chỉ tính **mẫu đang
   chở dữ liệu**, và chỉ hạ số khai khi cửa sổ có **≥ 8/12 mẫu hoạt động** và tụt dưới 50%.
2. **v31 — không còn chọn nhầm "đường trực tiếp" trên 5G.**
   Trên 5G, `connect()` tới node trong nước có thể trả **2–4 ms** — bắt tay TCP **giả** của nhà mạng ⇒
   app tưởng "đường trực tiếp còn sống" và chọn đúng đường **không chở gói nào**. Nay app **không tin**
   bắt tay nhanh bất khả thi (< 25 ms) và **ghi nhớ "đường trực tiếp đã chết trên mạng này"** cho tới
   khi đổi mạng.
3. **v32 — đo mạng trước khi khai đầy đủ hơn.**
   Trước đây phép đo trước khi khai có **ngân sách 2.500 ms / trần 1,5 MB** nên trên 5G nhanh bị cắt
   trước khi kịp đo (đo ra **559 kbps** trên mạng 5G thật **19 Mbps**) ⇒ kẹt số khai ở sàn 1.000 kbps.
   Nay đo **từ byte đầu tiên**, ngân sách **2.500 → 6.000 ms**, trần **1,5 → 4 MB** (đo **một lần cho
   mỗi mạng**, cache theo profile).
4. **(server) Relay bớt đứt kết nối.** `PONG_TIMEOUT_MS` trên 4 unit relay được nới **20 s → 60 s**
   (app ping đúng 20 s nên trước đây relay cắt kết nối mỗi 20–30 s). Sau khi nới: **0 pong-timeout**,
   đã chuyển **40+ MB**, `dropped=0`. Thay đổi này ở phía server — khách **không cần làm gì**, chỉ cần
   cập nhật app.

Không có thay đổi giao diện nào khác; nhãn Diagnostics giữ nguyên (đã i18n từ v28).

## Artifact & kênh phát hành

| Biến thể | Kênh | Bytes | sha256 |
|---|---|---|---|
| modern (minSdk 26) | `/v1/downloads/android` → `/root/flowvpn-apk/VPNFlow-latest.apk` | 74.731.674 | `145053e918f75aed98f81d4d61c5b827206ea27318be13d629024fea9bfb8677` |
| legacy (minSdk 24) | `/v1/downloads/android-legacy` → `/root/flowvpn-apk/VPNFlow-android7.apk` | 74.748.054 | `b9a03e775d28a506b3d285b286036d56c7d958b3dde859a36b13709cc7d886eb` |

- `applicationId com.privatevpn.app` · `versionCode 32` · `versionName 1.4.4`.
- Tag: `android-v1.4.4` và `android-legacy-v1.4.4` (neo commit `39baaaf`).
- Mốc phát hành `latest_version = 1.4.4`; link tải đã trả đúng `content-length`.
- **Nhãn phiên bản chỉ đổi để phân biệt artifact** (bản 1.4.3/29 đang phát đã chiếm `versionName 1.4.3`);
  **hành vi** của 1.4.4/32 = đúng bản khóa v32.

## Việc đã kiểm trước khi phát (theo bàn giao của Windows)

- Cổng chặn pre + post: **ĐẠT** (Windows).
- Kênh tải (Mac kiểm độc lập 23/09): `https://t1.meetflowai.site/v1/downloads/android` → HTTP 200
  `content-length 74731674`; `.../android-legacy` → HTTP 200 `content-length 74748054`.
- `sha256` do node-2 tự băm khớp hash Windows công bố (`145053e9…b8677` / `b9a03e77…d886eb`).

## Chưa làm — ghi nhận trung thực

- **Đối chiếu artifact ↔ máy thật (SM-F9460) CHƯA làm được** vì thiết bị đang offline. Windows sẽ làm
  khi máy kết nối lại. **Không** ghi nhận là đã kiểm trên máy thật.

## Nghiệm thu

- Bản khóa Android `v32`: `docs/handoff/FREEZE_ANDROID_2026-09-23.md` §1 (các commit `8f949f8`, `48498b7`,
  `eeae7ef`) — đo trên máy thật Z Fold5 ngày 23/09.
- Email thông báo khách: `scripts/send-android-1.4.4-announcement.py` — số người nhận + Resend id ghi
  trong sổ `bus-322`.
