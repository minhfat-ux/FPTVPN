# API-INTEGRATION — <route hoặc tính năng>

| | |
|---|---|
| Route | `METHOD /api/…` |
| Cần đăng nhập | ☐ có ☐ không |
| Code server | `server/src/…` (đối chiếu trước khi tin tài liệu) |

## 1. Request
```
METHOD /api/…
Headers: Authorization: Bearer <jwt>
Body: { "…": … }
```

## 2. Response thật (dán nguyên văn, đã che dữ liệu nhạy cảm)
```json
{ }
```

## 3. Lỗi cần xử lý
| Mã | `code` | Hiển thị cho người dùng |
|---|---|---|
| 401 | | về màn đăng nhập |
| 402 | | mời nạp credit |
| 429 | | "Bạn thao tác hơi nhanh, thử lại sau ít giây" |
| 5xx | | hiện `message` của server, kèm nút thử lại |

## 4. Kiểm chứng (bắt buộc ghi lại kết quả thật)
| Việc | Lệnh / thao tác | Kết quả |
|---|---|---|
| Gọi khi có token | | |
| Gọi khi token sai | | |
| Gọi khi hết credit | | |

## 5. Ghi chú
- <ví dụ: route này không có version cho mobile, dùng chung với web>
