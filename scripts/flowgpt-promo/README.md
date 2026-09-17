# Popup quảng cáo app cho FlowGpt (`flowgpt.meetflowai.site`)

Quảng cáo 2 sản phẩm **VPNFlow** và **MeetFlow AI** dưới dạng popup, hiện cho **mọi khách**
(kể cả chưa đăng nhập), kèm link cài đặt theo hệ điều hành.

> FlowGpt nằm ở `/opt/flowgpt` trên node-2 và **không phải git repo** — thư mục này là bản
> lưu trong repo để có version + để máy khác đọc được. Sửa ở đây rồi deploy theo hướng dẫn.

## 1. File & chỗ deploy

| File trong repo | Deploy tới |
|---|---|
| `promo.js` | `/opt/flowgpt/web/public/promo.js` **và** `/opt/flowgpt/web/dist/promo.js` |
| `promo.css` | `/opt/flowgpt/web/public/promo.css` **và** `/opt/flowgpt/web/dist/promo.css` |

Đặt ở `web/public/` để Vite tự copy sang `dist/` ở mỗi lần build (không phải sửa lại sau build).
Copy thêm vào `dist/` để có hiệu lực **ngay** mà không cần build.

## 2. Gắn vào trang

Cả `web/index.html` (bản nguồn) và `web/dist/index.html` (bản đang chạy) phải có 2 tag:

```html
<link rel="stylesheet" href="/promo.css?v=<VERSION>" />
<script src="/promo.js?v=<VERSION>" defer></script>
```

`<VERSION>` hiện tại: **20260917a**

## 3. ⚠️ Bắt buộc: bump `?v=` mỗi lần sửa file

Cloudflare cache `.css`/`.js` ở edge với `cache-control: public, max-age=31536000, immutable`
(`cf-cache-status: HIT`). Token Cloudflare của shop **không có quyền purge**, nên cách duy nhất
là đổi URL:

```bash
VER=$(date -u +%Y%m%d%H%M)   # hoặc 20260917b
sed -i -E "s#(/promo\.(css|js))\?v=[^\"]*#\1?v=$VER#g" /opt/flowgpt/web/index.html /opt/flowgpt/web/dist/index.html
```

Sửa file mà quên bump version ⇒ origin đúng nhưng người dùng vẫn nhận bản cũ (đã dính đúng lỗi
này ngày 17/09/2026). Kiểm tra bằng: `curl -s -D - -o /dev/null https://flowgpt.meetflowai.site/promo.css?v=<VER> | grep -i cf-cache-status`
(phải là `MISS` ở lần đầu).

## 4. Hành vi popup

- Hiện sau **1,4 giây**, cho cả khách chưa đăng nhập (nạp từ `index.html`, không phụ thuộc React).
- Nút tải đầu tiên là **đúng hệ điều hành của khách** (Windows/macOS/iOS/Android) + nhãn "bản cho máy bạn".
- "Để sau" / bấm ra ngoài / phím `Esc` ⇒ ẩn **1 ngày**. "Không hiện lại nữa" ⇒ ẩn vĩnh viễn.
  Lưu trong `localStorage` khoá `flowgpt:promo:apps:v1`.
- Ảnh icon hotlink từ `https://meetflowai.site/assets/...` (có fallback: ảnh lỗi thì nền gradient
  của ô icon vẫn giữ layout).

## 5. Link đã kiểm chứng (200, ngày 17/09/2026)

VPNFlow: `/dl/VPNFlow-Setup-latest.exe` (Windows) · `/install/mac` · `/install/ios` ·
`/v1/downloads/android` · mua tại `/buy`
MeetFlow AI: `apps.apple.com/vn/app/meetflow-ai/id6765590042` ·
`api.meetflowai.site/v1/ai/downloads/android` · giới thiệu ở `/ai/guide` · mua ở `/ai/buy`

## 6. Kiểm tra sau khi deploy

```bash
node --check promo.js
curl -s -o /dev/null -w '%{http_code}\n' "https://flowgpt.meetflowai.site/promo.css?v=<VER>"
curl -s https://flowgpt.meetflowai.site/ | grep -o 'promo[^"]*'
```

Ảnh chụp đối chiếu: dùng `tools/harness-shot.mjs` (Chrome CDP) với `--wait 5200` để popup kịp hiện.
