# Release notes — Android **1.4.5** (versionCode **37**) — 19/10/2026

## Có gì mới

**Hút băng thông bằng N tunnel (mặc định TẮT).** Trên mạng dùng chung (tòa nhà, khách sạn) nhà mạng
giới hạn tốc độ **theo TỪNG KẾT NỐI** — đo thật 19/10/2026, lặp 3 lần: 1 luồng **4–12 Mbps**,
4 luồng 17–29, **8 luồng 72–81 Mbps**. Trước bản này app chỉ mở **một** tunnel nên trần thực tế
~12 Mbps, khai số cao hơn cũng không vượt được.

Bật trong **Settings → Tăng tốc → Hút băng thông (N tunnel)** rồi chọn **2 / 4 / 6 / 8**:

- App mở N kết nối song song tới **cùng một exit node** (không đổi IP giữa phiên — bất biến F3), chia
  traffic **theo từng luồng** (không chia theo gói ⇒ không đảo thứ tự, TCP bên trong không sụp).
- Số khai băng thông (Brutal CC) = **năng lực một luồng × N**, nếu không thì công cụ điều tiết bị khoá
  ở mức một luồng và bật N cũng không nhanh hơn.
- **Mặc định vẫn TẮT**: bản này chạy y hệt 1.4.4 với người không bật.

## Không thay đổi

- Kênh phát, đăng nhập, thanh toán, danh sách node, gói Premium: **không đổi**.
- `minSdk` giữ nguyên: modern **26**, legacy (Fire OS/Android 7 cũ) **24**.
- Định dạng file cấu hình/khôi phục: không đổi.

## Ai bị ảnh hưởng

- **Tất cả** người dùng Android modern + legacy (cài đè, không mất đăng nhập).
- Người **không bật** công tắc: không thấy khác biệt (N=1 đi đúng đường cũ, đã nghiệm thu).
- Người **bật N**: nên thử 2 → 4 → 8 và giữ mức cho tốc độ cao nhất ổn định; máy yếu/ pin thấp nên để 2–4.

## Cách cập nhật

- App tự báo "có bản mới" (mốc server = 1.4.5) hoặc tải tại trang mua/`/v1/downloads/android`.
- Cài đè (`adb install -r` hoặc mở APK) — **không cần gỡ bản cũ**, không mất đăng nhập/phiên Premium.

## Bằng chứng chất lượng

- Unit test: **64/64 mỗi flavor** (modern/legacy/tv), 0 fail — gồm 7 test mới khoá luật kẹp N
  (`1..8`) và luật "số khai = một luồng × N".
- Nghiệm thu máy thật (Samsung SM-F9460, Android 16): bật N=4 → **4 cầu WS** mở thật (4 cổng local
  khác nhau, cùng relay), `tunnel: UP (ws-n4)`, `n-tunnel: 4/4 tunnel sẵn sàng
  (up=8324 down=27752 kbps, đã ×4)`; tắt công tắc (N=1) → đi đúng đường cũ `hy-tcp:8443`, không mở cầu phụ.
- Hai lỗi phát hiện trong lúc nghiệm thu và đã sửa trước khi phát: số khai bị ghi đè mất phần ×N khi
  đổi mạng; bộ đếm byte chỉ đọc cầu WS chính (Diagnostics báo thiếu N lần khi N>1).
- Chi tiết + log thô: `docs/handoff/HANDOFF_ANDROID_NTUNNEL_WINDOWS_2026-10-19.md`.

## Ghi chú kỹ thuật

- Core Go (`hysteria.aar`) build lại từ hysteria `app/v2.12.2`, đủ 4 ABI; API mới `connectSlot/slotCount`.
- Version: `versionCode 37`, `versionName 1.4.5` (bản phát trước: 1.4.4 / 32).
