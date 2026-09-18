# Danh sách màn hình & luồng — app fBuddy

> Bám đúng các "view" đang có trên web (`web/src/App.tsx`): `chat`, `studio`, `hub`,
> `topup`, `settings`. App mobile **không cần** bản admin (`settings` chỉ dành cho quản trị).

## 1. Bản đồ màn hình

| # | Màn hình | Tương ứng web | API chính | Giai đoạn |
|---|---|---|---|---|
| 1 | Khởi động / kiểm tra phiên | – | `GET /meta`, `GET /auth/me` | 1 |
| 2 | Đăng nhập — nhập email | `auth/LoginPage` | `POST /auth/request-token` | 1 |
| 3 | Đăng nhập — nhập mã | `auth/LoginPage` | `POST /auth/verify-token` | 1 |
| 4 | **Chat** | `chat/ChatPage` | `POST /chat/stream` (SSE) | 1 |
| 5 | Danh sách hội thoại (tab/drawer) | `components/Sidebar` | `GET /conversations` | 1 |
| 6 | Tìm kiếm hội thoại | `Sidebar` | `GET /conversations/search` | 2 |
| 7 | Chợ kỹ năng | `hub/SkillHubPage` | `GET /hub`, `POST /hub/:id/purchase` | 2 |
| 8 | Chọn kỹ năng cho lượt chat | `chat/SkillSelect` | `GET /skills`, `PUT /skills/installed` | 1 |
| 9 | Credit của tôi | `state/credits` + menu tài khoản | `GET /credits`, `GET /credits/ledger` | 1 |
| 10 | Xin thêm token | `chat/RequestCreditsForm` | `POST /credits/request` | 2 |
| 11 | Nạp credit (gói + VietQR) | `topup/TopupPage` | `GET /topup`, `POST /topup/orders` | 2 |
| 12 | Tài khoản & thiết bị | `components/ProfileMenu`, `SessionList` | `GET /auth/sessions`, `DELETE …` | 2 |
| 13 | Giọng nói (cài đặt) | `settings/VoiceTab` | `GET /voice/config` | 3 |
| 14 | Studio ảnh | `studio/ImageStudio` | upload + chat tool | 3 — cân nhắc, nặng |

Kỹ năng, credit, nạp tiền, voice ở web là **view riêng**; trên điện thoại nên là **tab thứ 2
hoặc sheet**, không nhồi vào chat.

## 2. Chat (màn hình quan trọng nhất) — các trạng thái phải có

| Trạng thái | Điều kiện | Giao diện |
|---|---|---|
| Trống (chưa có tin nhắn) | hội thoại mới | logo fBuddy (`hero-mark` 52×52) + tên app chữ gradient + các thẻ gợi ý (`starter-card`) |
| Đang gửi | vừa bấm gửi | tin nhắn người dùng hiện ngay (bong bóng `--bubble-user`, canh phải), trợ lý hiện `status` |
| Đang trả lời | có `delta` | chữ chạy dần trong bong bóng trợ lý, có nháy con trỏ |
| Đang gọi công cụ | `tool_call` / `tool_result` | thẻ công cụ trong khung chat, lỗi thì viền `--danger` |
| Có tệp sinh ra | `artifact` | thẻ tệp: tên, kích thước, nút tải (tải kèm Bearer) |
| Hết credit | lỗi `402` | khối chặn màu `--warn`/`--danger` + nút "Nạp thêm" và "Xin thêm token" |
| Mất mạng giữa stream | lỗi mạng | giữ phần đã nhận + dòng "Mất kết nối" + nút gửi lại |
| Lỗi máy chủ | `5xx` / `error` | hiện `message` của server (đã là tiếng Việt), đừng thay bằng câu chung chung |

Quy tắc hiển thị lấy từ web: tin nhắn **người dùng** có bong bóng nền `--bubble-user`;
tin nhắn **trợ lý** không có nền, chỉ có avatar 32×32 bo 10 (logo fBuddy) + phần chữ;
meta 12px màu `--text-faint` gồm tên "fBuddy" và giờ gửi.

## 3. Luồng người dùng

```
Mở app
  ├─ có token trong Keychain/Keystore → GET /auth/me
  │     ├─ 200 → vào Chat (mở lại hội thoại đang active nếu có)
  │     └─ 401 → xoá token → Đăng nhập
  └─ chưa có token → Đăng nhập
        └─ nhập email → POST /auth/request-token
              └─ nhập mã  → POST /auth/verify-token → lưu token → Chat

Chat
  ├─ gửi tin nhắn → POST /chat/stream (SSE) → cập nhật dần
  ├─ 402 hết credit → Nạp credit / Xin thêm token
  ├─ chọn kỹ năng   → PUT /skills/installed
  ├─ muốn thêm kỹ năng → Chợ kỹ năng → mua bằng credit
  └─ tải tệp        → GET /files/:id/content (kèm Bearer)
```

## 4. Parity web ↔ mobile — checklist cho mỗi lần phát hành

- [ ] Đăng nhập bằng mã email chạy được (mã tới email thật, sai mã có thông báo đúng).
- [ ] Chat chạy chữ dần (SSE thật, không phải chờ xong mới hiện).
- [ ] Dừng giữa lúc trả lời được và **không** tính thêm credit sau khi dừng.
- [ ] Tạo được tệp (PPTX/XLSX) và tải về được từ thẻ tệp.
- [ ] Số dư credit hiện đúng sau mỗi lượt và ở màn Credit.
- [ ] Đổi kỹ năng trong dropdown có tác dụng thật (kiểm bằng câu hỏi đúng kỹ năng đó).
- [ ] Hết credit hiện đúng lời mời nạp, không phải lỗi chung.
- [ ] Đăng xuất xoá token và huỷ phiên trên server.
- [ ] Theme khớp web: nền, accent, bo góc, chữ, khoảng cách (xem `THEME.md` mục 8).
- [ ] Chữ tiếng Việt không bị cắt dấu, không tràn dòng ở màn 390px.

## 5. Ghi chú nền tảng

| Việc | iOS | Android |
|---|---|---|
| Lưu token | Keychain (`kSecClassGenericPassword`) | EncryptedSharedPreferences / DataStore + Keystore |
| Micro (dictation) | `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` | `RECORD_AUDIO` runtime permission |
| Tải tệp | URLSession download + share sheet | DownloadManager hoặc OkHttp → `MediaStore`/cache + share intent |
| Mở lại app | lưu hội thoại đang mở (`POST /conversations/:id/active`) | như iOS |
| Thông báo | chưa có backend — đừng hứa | chưa có backend — đừng hứa |
