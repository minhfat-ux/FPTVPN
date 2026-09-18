# PRD — <tên tính năng> (fBuddy mobile)

| | |
|---|---|
| Người viết | <tên> · <ngày> |
| Nền tảng | ☐ iOS ☐ Android ☐ cả hai |
| Giai đoạn | <1/2/3 theo SCREENS.md> |
| Trạng thái | ☐ nháp ☐ chờ duyệt ☐ đã chốt |

## 1. Vấn đề & mục tiêu
<Người dùng đang gặp gì. Một câu.>

**Mục tiêu đo được:** <ví dụ: giảm 2 bước để tạo slide từ chat>

## 2. Phạm vi
- **Trong phạm vi:** <…>
- **Ngoài phạm vi:** <…> (ghi rõ để không bị hỏi lại)

## 3. Luồng người dùng
```
<vẽ 5–8 bước, kèm trạng thái lỗi>
```

## 4. Yêu cầu
| # | Yêu cầu | Ưu tiên | Ghi chú |
|---|---|---|---|
| 1 | <…> | bắt buộc | |

## 5. API dùng
| Route | Khi nào gọi | Xử lý lỗi |
|---|---|---|
| `GET /api/…` | | 401 → đăng nhập lại · 402 → mời nạp · 429 → chờ |

## 6. Giao diện
- Token: xem [`../THEME.md`](../THEME.md) — **không** hard-code màu.
- Màn hình liên quan: <link tới SCREEN-SPEC đã điền>

## 7. Đo lường
<Cái gì chứng minh tính năng chạy đúng: log, ảnh chụp, số liệu>

## 8. Rủi ro
| Rủi ro | Cách xử lý |
|---|---|
| <…> | |
