# TEST-PLAN — <tính năng / bản phát hành>

| | |
|---|---|
| Phạm vi | |
| Nền tảng & thiết bị | iOS <model, iOS version> · Android <model, Android version> |
| Người chạy | |

## 1. Kiểm thử tự động
| Loại | Lệnh | Kỳ vọng |
|---|---|---|
| Theme parity | so `theme-tokens.json` với `Theme.swift`/`Theme.kt` | không lệch token nào |
| Unit | <…> | pass |
| Build | `xcodebuild …` / `./gradlew :app:assembleDebug` | không warning mới |

## 2. Kiểm thử tay — đường chính
| # | Thao tác | Kết quả mong đợi | Đạt? |
|---|---|---|---|
| 1 | Đăng nhập bằng mã email thật | vào được Chat | ☐ |
| 2 | Gửi "chào em" | chữ chạy dần, `done` kết thúc | ☐ |
| 3 | Bấm dừng giữa lúc trả lời | dừng ngay, **không** phát sinh thêm credit | ☐ |
| 4 | Yêu cầu tạo slide | có thẻ tệp, tải về mở được | ☐ |
| 5 | Tiêu hết credit rồi gửi | hiện 402 + nút nạp | ☐ |
| 6 | Đăng xuất rồi mở lại app | về màn đăng nhập | ☐ |

## 3. Kiểm thử biên
| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| 1 | Mất mạng giữa lúc stream | giữ phần đã nhận + báo mất kết nối |
| 2 | Xoay màn hình / vào lại app | không mất phần chữ đang chạy |
| 3 | Chữ tiếng Việt dài, có dấu | không cắt dấu, không tràn |
| 4 | Màn 390px (iPhone SE/nhỏ) | không tràn ngang (web đã từng lỗi này) |

## 4. Theme
- [ ] Nền / accent / bo góc / cấu trúc chữ / khoảng cách khớp web (kèm 2 ảnh).

## 5. Kết luận
<ĐẠT / KHÔNG ĐẠT + danh sách lỗi còn lại>
