# fBuddy Mobile — bộ tài liệu để dựng app iOS & Android

> Mục tiêu: đủ chi tiết để một agent/dev dựng được app iPhone + Android **dùng đúng
> theme đang có trên web**, bám đúng API hiện tại, không phải đoán gì.
> Web là nguồn sự thật cho cả giao diện lẫn hợp đồng API — mọi tài liệu ở đây trích
> từ code thật, không phải từ phác thảo.

## Bộ tài liệu gồm gì

| File | Nội dung | Ai đọc |
|---|---|---|
| [`THEME.md`](THEME.md) | Token giao diện đầy đủ (dark + light), cách ánh xạ sang SwiftUI/Compose, luật parity, các bẫy đã gặp | cả hai nền tảng |
| [`theme-tokens.json`](theme-tokens.json) | Cùng bộ token ở dạng máy đọc được — nguồn để sinh/đối chiếu theme | dev, CI |
| [`API.md`](API.md) | 80 route + 11 sự kiện SSE + xác thực + lỗi + luồng đăng nhập cho mobile | cả hai |
| [`SCREENS.md`](SCREENS.md) | Danh sách màn hình, luồng, trạng thái (rỗng/đang tải/lỗi/mất mạng) | cả hai |
| [`IOS.md`](IOS.md) | Khung Xcode + template Swift (theme, API, SSE, Keychain, store) + phát hành TestFlight | iOS |
| [`ANDROID.md`](ANDROID.md) | Khung Gradle + template Kotlin/Compose + phát hành Play | Android |
| [`templates/`](templates/) | Mẫu tài liệu để điền cho từng tính năng/màn hình | cả hai |

## Quyết định đã chốt (đọc trước khi code)

1. **Theme**: fBuddy **dark-first** — đúng như web (`[data-theme="dark"]` là mặc định).
   Accent dark `#33C773`; bản light (phụ) accent `#1F9C5B`. Không hard-code màu ở màn
   hình — mọi màu đi qua file theme của nền tảng.
2. **Bộ khung nền tảng**: đi theo đúng convention đang có trong repo này
   (`android/app/src/main/java/com/privatevpn/app/theme/Theme.kt` và
   `iOS/PrivateVPN/Theme.swift`) — cùng palette navy `#0A1F3B`, cùng cách đặt token
   (`object`/`enum` + `static let`).
3. **Xác thực**: email nhận mã (passwordless) là luồng chính, mật khẩu là luồng phụ.
   Token JWT lưu ở **Keychain (iOS)** / **EncryptedSharedPreferences (Android)** —
   web dùng `localStorage["flowgpt.token"]`, mobile **không** dùng kiểu đó.
4. **Chat streaming**: `POST /api/chat/stream` trả **SSE**, phải có client SSE thật
   trên mobile (không có EventSource sẵn ở cả hai nền tảng — xem template trong
   `IOS.md`/`ANDROID.md`).
5. **Voice**: web dùng Web Speech của trình duyệt; mobile dùng **native**
   (Speech framework / Android SpeechRecognizer + TTS). Endpoint server
   (`/api/voice/*`) là phương án dự phòng, không phải đường chính.
6. **Nơi đặt code**: nhánh `main` của repo này đã có `android/` và `iOS/` (của VPNFlow).
   fBuddy nên là **thư mục riêng** (`fbuddy-ios/`, `fbuddy-android/`) để hai app không
   giẫm lên nhau: chung palette, chung convention, khác bundle id và khác luồng nghiệp vụ.

## Thứ tự làm đề xuất

```
1. THEME.md  → dựng Theme.swift + Theme.kt, chạy màn hình "gallery" để so với web
2. API.md    → APIClient + AuthStore (đăng nhập bằng mã email chạy được thật)
3. SCREENS.md→ dựng lần lượt: Login → Chat (SSE) → Lịch sử → Kỹ năng → Credit/Nạp
4. templates/→ mỗi màn hình một SCREEN-SPEC điền sẵn trước khi code
```

## Việc chưa có ở backend (đừng hứa với người dùng)

| Thiếu | Ghi chú |
|---|---|
| Push notification (APNs/FCM) | Server chưa có endpoint đăng ký thiết bị. Cần thêm trước khi làm thông báo. |
| SSO Firebase/Facebook | `meta.authMethods.sso` đang `false`, nút hiện ghi "Sắp bổ sung". |
| Đăng ký email + mật khẩu tự do | `allowSignup` điều khiển; hiện luồng chính là mã email. |
| Endpoint riêng cho mobile | Chưa cần: web và mobile dùng chung `/api`, không có version riêng. |
