# STORE-RELEASE — fBuddy <phiên bản>

| | |
|---|---|
| Phiên bản | <1.0.0 (build N)> |
| Nền tảng | ☐ App Store ☐ Google Play |
| Ngày dự kiến | |

## 1. Trước khi build
- [ ] Không còn mã debug / log token / URL test trong bản phát hành.
- [ ] `applicationId` / bundle id đúng: `site.meetflowai.fbuddy`.
- [ ] API trỏ production `https://fbuddy.meetflowai.site`.
- [ ] Ảnh so sánh theme với web đã có trong PR cuối.

## 2. Khai báo bắt buộc
| Mục | Nội dung |
|---|---|
| Quyền | iOS: micro + nhận dạng giọng nói (chỉ khi dùng) · Android: `RECORD_AUDIO` |
| Dữ liệu thu thập | Nội dung hội thoại, email, tệp người dùng tải lên → khai ở Data safety / Privacy |
| Đăng nhập | Có (email + mã) → **phải** có luồng xoá tài khoản hoặc ghi rõ cách xoá |
| AI | Mô tả rõ là trợ lý AI, nội dung do mô hình sinh ra |

## 3. Nội dung store
| Trường | Nội dung |
|---|---|
| Tên | fBuddy |
| Phụ đề | Trợ lý AI đa năng |
| Mô tả ngắn | <…> |
| Ảnh chụp | 6.7" + 6.1" (iOS) · điện thoại + 7" (Play) |
| Ảnh bìa | <…> |

## 4. Kiểm tra sau khi phát hành
- [ ] Tải bản phát hành từ store (không phải bản nội bộ).
- [ ] Đăng nhập + một lượt chat thật chạy.
- [ ] Log server thấy request từ app (user-agent/phiên mới).
- [ ] Không có lỗi 5xx mới trong 30 phút đầu.

## 5. Hoàn tác
<Nếu lỗi nặng: tạm ẩn bản khỏi store hay đẩy bản cũ? Ai quyết?>
