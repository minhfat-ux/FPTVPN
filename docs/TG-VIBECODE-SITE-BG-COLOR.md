# Mã màu nền trang meetflowai.site — TG /vibecode (bus #519)

> Owner hỏi qua Telegram (bus #519, 2026-09-27T18:13:23Z → WIN): *"gửi cho anh mã màu của background page meetflowAI.site"*.
> Trả lời ngắn: **nền trang KHÔNG phải một màu phẳng** — nó là gradient navy nhiều lớp. Màu đáy (và cũng là `theme-color`) là **`#071628`**.

## 1. Trả lời trực tiếp

| Vai trò | Mã màu |
|---|---|
| Màu đáy tối nhất (nền gốc, cũng là `<meta name="theme-color">`) | **`#071628`** |
| Navy sáng ở góc trên-trái (điểm bắt đầu gradient) | `#14406c` |
| Navy trung gian (55% gradient) | `#0a1f3b` |
| Quầng sáng thương hiệu xanh lá (góc trên-trái) | `rgba(51, 199, 115, 0.20)` |
| Quầng sáng thương hiệu cyan (góc trên-phải) | `rgba(34, 211, 238, 0.15)` |
| Màu chữ mặc định trên nền đó | `#eaf2ff` |

**Nếu chỉ cần MỘT mã màu để dùng lại (splash, icon, ảnh nền, Telegram theme): `#071628`.**
Đó là màu cuối của dải gradient (100%) và là màu trang web tự khai với trình duyệt/điện thoại qua `theme-color`.

## 2. CSS nguyên văn (nguồn xác thực)

Trang chủ được control-plane sinh ra, CSS nằm inline trong HTML. Bản mã nguồn trên máy WIN: `_work/web-assets-main/control-plane/src/home-page.js` dòng 1111 (`theme-color`), 1143 (`--sig-surface`), 1164 (`body`) — khớp byte với HTML đang phát (xem mục 3).

```css
:root {
  color-scheme: dark;
  --sig-surface: radial-gradient(130% 120% at 0% 0%, #14406c 0%, #0a1f3b 55%, #071628 100%);
}

body {
  color: #eaf2ff;
  /* Nền có chiều sâu: 2 quầng sáng thương hiệu đè lên navy radial của popup. */
  background:
    radial-gradient(900px 520px at 6% -10%, rgba(51, 199, 115, 0.2), transparent 70%),
    radial-gradient(780px 500px at 98% 2%, rgba(34, 211, 238, 0.15), transparent 70%),
    var(--sig-surface);
  background-attachment: fixed;
}
```

```html
<meta name="theme-color" content="#071628">
```

Ba lớp, vẽ từ trên xuống: quầng xanh lá → quầng cyan → dải navy `#14406c → #0a1f3b → #071628`.
`background-attachment: fixed` ⇒ nền đứng yên khi cuộn; màu nhìn thấy ở đáy trang luôn là `#071628`.

**Lưu ý kỹ thuật:** `body` dùng shorthand `background:` với toàn gradient nên `background-color` tính toán = `transparent` (không có màu phẳng nào chống lưng). Vì vậy "mã màu nền" phải hiểu là dải gradient ở trên, không phải một giá trị `background-color`.

## 3. Lệnh tái lập (đã chạy thật)

```powershell
node ops/_scratch/probe-site-bg.mjs
```

Script tải `https://meetflowai.site/` (200, 34.471 byte, không có file CSS ngoài — 1 khối `<style>` 16.493 byte), lưu bản HTML vào `ops/_scratch/site-home.html`, rồi in ra:
`bodyRule` (gradient nền), `rootVars` (`--sig-surface`), `themeColor` (`#071628`).

Kết quả đo lúc `2026-09-27T18:14:27Z` (đối chiếu chéo với `control-plane/src/home-page.js`):

```json
"bodyRule": [{ "selector": "body",
  "decl": "background: radial-gradient(900px 520px at 6% -10%, rgba(51, 199, 115, 0.2), transparent 70%), radial-gradient(780px 500px at 98% 2%, rgba(34, 211, 238, 0.15), transparent 70%), var(--sig-surface)" }],
"rootVars": ["--sig-surface: radial-gradient(130% 120% at 0% 0%, #14406c 0%, #0a1f3b 55%, #071628 100%)"],
"themeColor": ["<meta name=\"theme-color\" content=\"#071628\">"]
```

Kiểm chứng độc lập (không cần mạng) trên bản mã nguồn đang có ở máy:

```powershell
Select-String -Path _work\web-assets-main\control-plane\src\home-page.js -Pattern 'sig-surface','theme-color'
```

Kết quả: `--sig-surface` ở dòng 1143, `theme-color` = `#071628` ở dòng 1111 — trùng khớp với HTML tải từ site.

## 4. Phạm vi

- Chỉ là **câu hỏi thông tin** (mã màu) — không sửa gì trên trang, không build lại, không deploy.
- Trang chủ `meetflowai.site` là trang chủ control-plane (`control-plane/src/home-page.js`), khớp với bản đang phát.
