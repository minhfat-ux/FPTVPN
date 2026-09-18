# SCREEN-SPEC — <tên màn hình>

| | |
|---|---|
| Nền tảng | ☐ iOS ☐ Android ☐ cả hai |
| Web tương ứng | `<view/component>` (ví dụ `chat/ChatPage`) |
| Ảnh so sánh | `<đường dẫn ảnh chụp web 390px>` + `<ảnh app>` |

## 1. Bố cục
```
<vẽ khối: topbar → nội dung → thanh dưới>
```

## 2. Token dùng (lấy từ ../THEME.md)
| Thành phần | Token | Ghi chú |
|---|---|---|
| Nền | `bg` | |
| Chữ chính | `text` | |
| Accent | `accent` (`#33C773`) | |
| Bong bóng người dùng | `bubbleUser` | |
| Bo góc | `radius` / `radiusSm` / `radiusLg` | |

## 3. Các trạng thái BẮT BUỘC
| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| Rỗng | | |
| Đang tải | | dùng skeleton, không nhảy bố cục |
| Lỗi mạng | | nút "Thử lại" |
| Hết credit (402) | | nút "Nạp thêm" |
| Hết phiên (401) | | về màn đăng nhập, xoá token |

## 4. Hành vi
- Bấm <nút> → <gọi API gì> → <cập nhật gì>
- Vuốt / kéo xuống → <…>
- Bàn phím: <ô nhập có bị che không, có tự giãn không>

## 5. Kiểm thử
| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | | |

## 6. Chữ hiển thị
| Khoá | vi | en | zh |
|---|---|---|---|
| | | | |
> Đặt chữ vào file i18n, **không** viết cứng trong view (web đang có 3 thứ tiếng).
