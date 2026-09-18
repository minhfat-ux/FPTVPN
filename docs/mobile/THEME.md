# Theme fBuddy cho iOS & Android — bám đúng web

> **Nguồn sự thật:** `web/src/styles.css` (khối `:root` = bản light, `[data-theme="dark"]`
> = bản mặc định) và `web/src/chat/chat.css` cho phần hội thoại.
> Mọi giá trị dưới đây được trích từ file đó — **không** phải màu phỏng theo ảnh chụp.

## 1. Nguyên tắc

1. **Dark-first.** Web mặc định là dark; app cũng vậy. Bản light có token đầy đủ để dùng
   sau, nhưng bản phát hành đầu tiên nên khoá dark (`preferredColorScheme(.dark)` /
   `AppCompatDelegate.MODE_NIGHT_YES`) để giao diện khớp web.
2. **Không hard-code màu ở màn hình.** Giống luật ghi ngay đầu `styles.css`
   ("Every component must use these variables — never a hard-coded colour"): màn hình chỉ
   gọi token, token nằm một chỗ.
3. **Một bộ token, ba nơi dùng** (web / iOS / Android). Đổi ở web thì cập nhật
   `theme-tokens.json` + `Theme.swift` + `Theme.kt` trong cùng một PR.
4. **Bo góc và khoảng cách cũng là token**, không tự chọn số.

## 2. Token — chế độ DARK (mặc định, dùng cái này)

| Token | CSS var | Giá trị | Swift (`FBTheme`) | Compose (`FBTheme`) |
|---|---|---|---|---|
| Nền chính | `--bg` | `#0A1F3B` | `bg` | `Bg` |
| Nền phụ / panel | `--bg-subtle`, `--bg-panel` | `#0E2747` | `bgSubtle` | `BgSubtle` |
| Nền nổi (input, nút) | `--bg-elevated`, `--bg-code` | `#123052` | `bgElevated` | `BgElevated` |
| Nền sidebar | `--bg-sidebar` | `#0A1F3B` | `bgSidebar` | `BgSidebar` |
| Bong bóng người dùng | `--bubble-user` | `#16385E` | `bubbleUser` | `BubbleUser` |
| Hover | `--bg-hover` | `rgba(51,199,115,0.08)` | `bgHover` | `BgHover` |
| Đang chọn | `--bg-active` | `rgba(51,199,115,0.16)` | `bgActive` | `BgActive` |
| **Accent** | `--accent` | `#33C773` | `accent` | `Accent` |
| Accent (nhấn) | `--accent-strong` | `#3DD982` | `accentStrong` | `AccentStrong` |
| Chữ trên accent | `--accent-text` | `#0A1F3B` | `onAccent` | `OnAccent` |
| Accent mờ (nền chip) | `--accent-soft` | `rgba(51,199,115,0.16)` | `accentSoft` | `AccentSoft` |
| Mint phụ | `--accent-mint` | `#7FE6C0` | `accentMint` | `AccentMint` |
| Thành công | `--ok` | `#33C773` | `ok` | `Ok` |
| Cảnh báo | `--warn` | `#E0A63C` | `warn` | `Warn` |
| Lỗi | `--danger` | `#F25A5A` | `danger` | `Danger` |
| Chữ chính | `--text` | `#FFFFFF` | `text` | `Text` |
| Chữ mờ | `--text-muted` | `rgba(255,255,255,0.6)` | `textMuted` | `TextMuted` |
| Chữ rất mờ | `--text-faint` | `rgba(255,255,255,0.4)` | `textFaint` | `TextFaint` |
| Viền | `--border` | `rgba(255,255,255,0.08)` | `border` | `Border` |
| Viền đậm | `--border-strong` | `rgba(255,255,255,0.18)` | `borderStrong` | `BorderStrong` |
| Bóng nhỏ | `--shadow-sm` | `0 1px 2px rgba(0,0,0,.30)` | – | – |
| Bóng vừa | `--shadow` | `0 8px 30px rgba(0,0,0,.38)` | – | – |
| Bóng lớn | `--shadow-lg` | `0 30px 70px rgba(0,0,0,.50)` | – | – |

Thẻ nổi (`.card-feature`, gói nạp, thẻ chợ kỹ năng) dùng nền **radial gradient**:

```
--sig-card-bg: radial-gradient(130% 120% at 0% 0%, #14406C 0%, #0A1F3B 55%, #071628 100%)
```
Trên mobile: `RadialGradient(center: .topLeading, startRadius: 0, endRadius: w*1.3)` với 3 điểm dừng
`#14406C` → `#0A1F3B` (55%) → `#071628`.

## 3. Token — chế độ LIGHT (bản phụ, chưa phát hành)

| Token | Giá trị | Token | Giá trị |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `--accent` | `#1F9C5B` |
| `--bg-subtle`, `--bg-sidebar` | `#F4F7FB` | `--accent-strong` | `#17864E` |
| `--bg-elevated`, `--bg-panel` | `#FFFFFF` | `--accent-text` | `#FFFFFF` |
| `--bg-code` | `#F1F5F9` | `--accent-soft` | `rgba(31,156,91,0.14)` |
| `--bubble-user` | `rgba(31,156,91,0.12)` | `--ok` | `#1F9C5B` |
| `--bg-hover` | `rgba(10,31,59,0.05)` | `--warn` | `#B7791F` |
| `--bg-active` | `rgba(31,156,91,0.14)` | `--danger` | `#D64545` |
| `--text` | `#0A1F3B` | `--border` | `#E2E8F2` |
| `--text-muted` | `#4A5A73` | `--border-strong` | `#CBD6E6` |
| `--text-faint` | `#7183A0` | | |

## 4. Hình khối & khoảng cách

| Nhóm | Giá trị |
|---|---|
| Bo góc | `--radius-sm` **8** · `--radius` **12** · `--radius-lg` **18** · `--radius-full` **999** |
| Khoảng cách | 4 · 8 · 12 · 16 · 24 · 32 (`--space-1…6`) |
| Sidebar | **288** rộng (mobile: dùng Drawer cùng bề rộng nếu là tablet) |
| Topbar | cao **56** |
| Logo `brand-mark` | **34×34**, bo **9**, ảnh `object-fit: contain` |
| Avatar trong hội thoại | **32×32**, bo **10** |
| Composer | rộng tối đa **820**, bo **18**, padding `10 12 8`, chiều cao textarea `26…220` |

## 5. Chữ

| Vai trò | Giá trị |
|---|---|
| Font | **Inter** → `system-ui`/`-apple-system` → Helvetica/Arial |
| Mono (mã, số liệu) | **JetBrains Mono** → ui-monospace/Menlo |
| Tên app (wordmark) | `font-weight 800`, chữ tô **gradient** `linear-gradient(120deg, #1E6BE0 0%, #6D5CE7 55%, #A855F7 100%)` cắt vào chữ |
| Hero (màn hình trống) | `clamp(30px, 5vw, 44px)`, weight **800**, `letter-spacing -0.03em`, line-height 1.1 |
| Phụ đề dưới tên app | 11px, weight 500, `--text-muted` |
| Meta tin nhắn (giờ gửi) | 12px, `--text-faint` |
| Nút nhỏ | 13px; nút thường: `font-weight 550`, padding `9px 14px` |

Trên iOS/Android: **Inter** phải nhúng font (không có sẵn). Nếu chưa nhúng, dùng system font
và ghi rõ trong PR là "tạm" — đừng trộn nửa Inter nửa system.

## 6. Thành phần cần dựng giống web

| Web | Thông số | Ghi chú mobile |
|---|---|---|
| `.btn` | bo 8 · viền `--border-strong` · nền `--bg-elevated` · padding `9/14` · weight 550 | hover→`--bg-hover`; nhấn→nhún 1px; disabled 55% |
| `.btn-primary` | nền `--accent`, chữ `--accent-text` | dùng cho hành động chính |
| `.btn-ghost` | trong suốt, chữ `--text-muted` | dùng ở topbar |
| `.btn-danger` | chữ `--danger`, viền 45% danger | xoá hội thoại, đăng xuất |
| `.composer` | bo 18 · viền đậm · nền nổi · bóng vừa · focus: viền accent + quầng `accent-soft` 3px | trên mobile là thanh dưới cùng, an toàn với bàn phím |
| Bong bóng người dùng | nền `--bubble-user`, bo 12, padding `10/14`, giữ xuống dòng | canh phải |
| Tin nhắn trợ lý | không có bong bóng nền, avatar 32 bo 10 = **logo fBuddy**, meta 12px mờ | avatar bo 10 (không tròn) |
| `.chip` | bo tròn hết (`--radius-full`), nền `accent-soft`, chữ accent | kỹ năng đang chọn, model |
| Thẻ nổi | nền radial `--sig-card-bg` + viền trong suốt | gói nạp, thẻ chợ kỹ năng |

## 7. Code mẫu — dán được

<details><summary><b>iOS · FBTheme.swift</b></summary>

```swift
import SwiftUI

/// Token giao diện fBuddy — bám đúng `web/src/styles.css` (khối [data-theme="dark"]).
/// Cùng convention với `VPNTheme` đang dùng trong repo này: enum + static let,
/// app luôn dark.
enum FBTheme {
    // Nền
    static let bg          = Color(hex: 0x0A1F3B)
    static let bgSubtle    = Color(hex: 0x0E2747)
    static let bgElevated  = Color(hex: 0x123052)
    static let bubbleUser  = Color(hex: 0x16385E)

    // Accent
    static let accent       = Color(hex: 0x33C773)
    static let accentStrong = Color(hex: 0x3DD982)
    static let onAccent     = Color(hex: 0x0A1F3B)
    static let accentSoft   = Color(hex: 0x33C773).opacity(0.16)
    static let accentMint   = Color(hex: 0x7FE6C0)

    // Trạng thái
    static let ok     = Color(hex: 0x33C773)
    static let warn   = Color(hex: 0xE0A63C)
    static let danger = Color(hex: 0xF25A5A)

    // Chữ & viền
    static let text        = Color.white
    static let textMuted   = Color.white.opacity(0.6)
    static let textFaint   = Color.white.opacity(0.4)
    static let border      = Color.white.opacity(0.08)
    static let borderStrong = Color.white.opacity(0.18)

    // Hình khối
    static let radiusSm: CGFloat = 8
    static let radius: CGFloat = 12
    static let radiusLg: CGFloat = 18
    static let avatarSize: CGFloat = 32
    static let brandMarkSize: CGFloat = 34

    /// Wordmark "fBuddy" — chữ tô gradient đúng như `.brand-word` trên web.
    static let wordmarkGradient = LinearGradient(
        colors: [Color(hex: 0x1E6BE0), Color(hex: 0x6D5CE7), Color(hex: 0xA855F7)],
        startPoint: .leading, endPoint: .bottomTrailing
    )
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}
```
</details>

<details><summary><b>Android · FBTheme.kt</b></summary>

```kotlin
package com.fbuddy.app.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Token giao diện fBuddy — bám đúng `web/src/styles.css` ([data-theme="dark"]).
 *  Cùng convention với VPNTheme: object + val, app luôn dark. */
object FBTheme {
    // Nền
    val Bg         = Color(0xFF0A1F3B)
    val BgSubtle   = Color(0xFF0E2747)
    val BgElevated = Color(0xFF123052)
    val BubbleUser = Color(0xFF16385E)

    // Accent
    val Accent        = Color(0xFF33C773)
    val AccentStrong  = Color(0xFF3DD982)
    val OnAccent      = Color(0xFF0A1F3B)
    val AccentSoft    = Color(0x2933C773)   // rgba(51,199,115,0.16)
    val AccentMint    = Color(0xFF7FE6C0)

    // Trạng thái
    val Ok     = Color(0xFF33C773)
    val Warn   = Color(0xFFE0A63C)
    val Danger = Color(0xFFF25A5A)

    // Chữ & viền
    val Text         = Color.White
    val TextMuted    = Color(0x99FFFFFF)    // 0.6
    val TextFaint    = Color(0x66FFFFFF)    // 0.4
    val Border       = Color(0x14FFFFFF)    // 0.08
    val BorderStrong = Color(0x2EFFFFFF)    // 0.18

    // Hình khối
    val RadiusSm = 8.dp
    val Radius   = 12.dp
    val RadiusLg = 18.dp
    val AvatarSize = 32.dp
    val BrandMarkSize = 34.dp

    /** Nền thẻ nổi — đúng `--sig-card-bg` của web. */
    fun sigCardBrush(): Brush = Brush.radialGradient(
        0f to Color(0xFF14406C), 0.55f to Color(0xFF0A1F3B), 1f to Color(0xFF071628)
    )

    /** Wordmark "fBuddy" — chữ tô gradient như `.brand-word`. */
    val wordmark = Brush.linearGradient(
        listOf(Color(0xFF1E6BE0), Color(0xFF6D5CE7), Color(0xFFA855F7))
    )
}
```
</details>

## 8. Cách kiểm "đúng theme" (làm trước khi mở PR)

1. Mở web ở **bề rộng 390px** (DevTools) và chụp 3 màn: đăng nhập, chat có tin nhắn, danh sách hội thoại.
2. Chụp đúng 3 màn đó trên app (cùng nội dung, cùng trạng thái).
3. Đặt cạnh nhau, soi 5 điểm: **nền**, **accent**, **bo góc**, **cấu trúc chữ**, **khoảng cách**.
4. Kèm 2 ảnh vào PR. Lệch màu thì sửa token, lệch khoảng cách thì sửa spacing — không "chỉnh cho đẹp".

## 9. Bẫy đã gặp (đừng vấp lại)

- **`foregroundStyle` ngoài `Text` đã ghép sẽ đè màu từng đoạn** — đã ghi rõ trong
  `iOS/PrivateVPN/Theme.swift` của repo: chữ "Flow" xanh bị nuốt và **thay đổi im lặng không
  có tác dụng**. Với wordmark fBuddy cũng vậy: đặt màu ngay trong `Text` ghép, đừng đặt ở ngoài.
- **Ảnh logo đang là bản bo góc** (`brand-mark.png`, `favicon.png`) và được phục vụ kèm
  `?v=culi2` để phá cache CDN. Nếu app tải logo từ web, dùng **đúng URL có `?v=`**; nếu nhúng
  vào app thì copy file vào Assets — đừng hot-link.
- **Đừng hard-code `#0A1F3B` rải rác**: hiện web có 2 chế độ; hard-code là chặn đường làm light mode sau.
- **`--accent-soft` là rgba, không phải hex**: trên Compose phải là `Color(0x2933C773)`
  (alpha hex đầu), trên Swift là `.opacity(0.16)`. Chép nhầm thành hex đặc sẽ ra màu xanh đặc.
