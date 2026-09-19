# BRIEF UI-01 — Bộ token theme mobile khớp 100% web

- **Người làm:** harness **Windows** (`AGENT_NAME=WIN`) — đây là worker chủ lực UI/UX
- **Bên giao / nghiệm thu:** MAC (`AGENT_NAME=MAC`)
- **Gate:** GATE 1 (Design parity kit) · **Baseline:** `RS-FB-20260919-01` / `RULESET-FB-0001`
- **Task ID:** *(Mac điền khi `task.mjs new` — chưa tạo task tại thời điểm viết brief)*
- **Hạn (`--due`):** 2026-09-22
- **Luật áp dụng:** `RULE-UI-FB-001..010`, `RULE-IOS-FB-006`, `RULE-ANDROID-FB-005`, `RULE-DELEGATE-FB-*`,
  `AGENTS.md` §1 (cấm), §5 (UI/UX dùng lại của web), §7 (convention)

## 1. Mục tiêu (1 câu, đo được)

Dựng bộ token theme cho **iOS (`FBTheme.swift`)** và **Android (`Theme.kt`)** sao cho **100% token khớp hex**
với [`docs/mobile/theme-tokens.json`](../mobile/theme-tokens.json), kèm **một màn hình "gallery"** hiển thị
đủ token để so trực tiếp với web.

## 2. Phạm vi file (whitelist — chỉ được sửa những đường dẫn này)

| Đường dẫn | Loại |
|---|---|
| `ios/FBuddy/Theme/FBTheme.swift` | tạo mới |
| `ios/FBuddy/Theme/ThemeGalleryView.swift` | tạo mới (màn gallery) |
| `android/app/src/main/java/**/theme/Theme.kt` | tạo mới |
| `android/app/src/main/java/**/theme/ThemeGalleryScreen.kt` | tạo mới (màn gallery) |
| `docs/design/ui-01-gallery-*.png` | ảnh chụp gallery |

**Cấm sửa mọi file khác** — đặc biệt: `docs/mobile/**`, `docs/SRS.md`, `.privatefbuddy/**`, `web/**`, `ops/**`.
Nếu buộc phải sửa thêm ⇒ **DỪNG và báo Mac** (`RULE-DELEGATE-FB-014`).
**Không chạy git** (`RULE-GIT-FB-002`). Không thêm dependency mới.

## 3. Nguồn sự thật

- **Token:** `docs/mobile/theme-tokens.json` (104 token lá, trích từ `web/src/styles.css` + `web/src/chat/chat.css`).
- **Giải thích cho người đọc:** `docs/mobile/THEME.md`, `docs/THEME.md`.
- **Luật:** `FR-UI-001`/`AC-038` — "100% token khớp hex với web; grep màn hình **không** thấy mã màu".
- Màu chuẩn dark (để tự kiểm nhanh): accent `#33C773`, nền `#0A1F3B`, panel `#0E2747`,
  bubble user `#16385E`, warn `#E0A63C`, danger `#F25A5A`. **Web dark-first** ⇒ chỉ dựng bộ **dark** ở brief này.
- **So sánh hex không phân biệt hoa/thường** (`#33c773` == `#33C773`).

## 4. Hành vi đúng phải giữ nguyên

- Mọi màu/kích thước/khoảng cách/bo góc của **màn hình** phải đi qua theme; màn hình **không** được chứa
  literal mã màu (`Color(red:`, `0xFF…`, `#RRGGBB`).
- `FBTheme.swift` / `Theme.kt` là **nơi duy nhất** được phép chứa giá trị màu.
- Tên token trong code phải **khớp tên token trong JSON** (ví dụ `bubbleUser`, `bgPanel`) để script parity
  đối chiếu được.

## 5. Tiêu chí nghiệm thu (AC — kiểm chứng được)

- [ ] Tồn tại `ios/FBuddy/Theme/FBTheme.swift` và `android/app/src/main/java/**/theme/Theme.kt`.
- [ ] **100% token trong `theme-tokens.json` có mặt trong cả hai file theme** với **cùng giá trị**.
- [ ] **0** mã màu hard-code ngoài file theme (grep sạch trên toàn bộ màn hình).
- [ ] Có màn hình **gallery** hiển thị: bảng màu (mọi token `color.dark.*`), gradient, radius, spacing,
      type scale, và **vài component mẫu** (bong bóng tin người dùng `bubbleUser`, tin trợ lý **không nền**,
      avatar 32×32 bo góc 10).
- [ ] Ảnh chụp gallery iOS và Android có **kích thước 390×844**.
- [ ] Không có file nào ngoài whitelist bị thay đổi.

## 6. Lệnh nghiệm thu (Mac chạy **đúng** lệnh này, không chạy biến thể dễ hơn)

```bash
node ops/verify-design-parity.mjs --section theme
```

> Lệnh này hiện **chưa tồn tại** trong repo — Mac tạo cùng GATE 1 và phải chạy được **trên máy Mac**
> (`RULE-DELEGATE-FB-006`). Nếu khi bạn nhận việc lệnh vẫn chưa có ⇒ ghi `blocked`, **không** tự viết
> script thay thế và **không** tự hạ tiêu chí (`RULE-DELEGATE-FB-012`).

## 7. Bằng chứng bắt buộc (nộp trong `done --evidence`)

| # | Bằng chứng | Ghi chú |
|---|---|---|
| 1 | Output thật của `node ops/verify-design-parity.mjs --section theme` (dán nguyên, không tóm tắt) | phải thấy số token khớp/tổng |
| 2 | **Ảnh chụp 390×844** màn gallery trên iOS | tên `docs/design/ui-01-gallery-ios.png` |
| 3 | **Ảnh chụp 390×844** màn gallery trên Android | tên `docs/design/ui-01-gallery-android.png` |
| 4 | Output lệnh grep chứng minh **không** hard-code màu ngoài theme | |
| 5 | Bảng file đã thay đổi (đúng whitelist) | |

- Không dán token/email thật vào ảnh hay log (`RULE-DELEGATE-FB-010`).
- `done --evidence "cmd=… ; kết quả=… ; file=… ; rag=<đường dẫn entry RAG đã ghi>"`.

## 8. Phụ thuộc / việc bị chặn

- **Phụ thuộc Mac:** `ops/verify-design-parity.mjs` phải tồn tại trước khi việc này khép được.
- **Phụ thuộc Mac:** khung project `ios/FBuddy.xcodeproj` và project Android (Gradle) phải dựng được để có
  chỗ chạy màn gallery. Nếu chưa có ⇒ làm phần **file theme** trước, và ghi `progress` rõ phần còn lại.
- **Không bị chặn bởi** `OQ-001` (bundle id) hay `OQ-002` (tài khoản store) ⇒ việc này được giao ngay.
- Nếu Android build không chạy được trên máy Windows (thiếu JDK/SDK) ⇒ ghi `blocked` kèm **output lỗi thật**,
  **không** tự hạ tiêu chí và **không** bỏ phần Android mà không báo.
