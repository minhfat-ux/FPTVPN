# Nguồn sự thật & cách deploy FlowGpt

FlowGpt có **3 bản** trên 2 máy — đọc mục này trước khi sửa để khỏi sửa nhầm bản.

| Bản | Ở đâu | Vai trò |
|---|---|---|
| **Git (repo này)** | `FPTVPN/flowgpt/` | **Nguồn sự thật có version.** Mọi thay đổi nên chốt ở đây. |
| **Bản dev (Windows)** | `C:\Users\Minhn\FlowTech AI\flowgpt` | Nơi đang code thật (npm workspaces, `npm run dev:server` + `dev:web`). Bản này đi trước bản chạy. |
| **Bản chạy (node-2)** | `/opt/flowgpt` | systemd `flowgpt`, cổng `127.0.0.1:7790`, Caddy TLS cho `flowgpt.meetflowai.site`. |

> 17/09/2026: bản chạy `/opt/flowgpt` **cũ hơn** bản dev khoảng 1 giờ (thiếu voice mode, skill picker, vài test).
> Sync lại theo mục "Deploy" bên dưới khi cần.

## Deploy bản dev lên node-2

`node_modules/`, `data/`, `web/dist/` **không** nằm trong git (xem `.gitignore`) — chúng thuộc về máy đích.

```powershell
# Từ Windows: đóng gói phần source rồi đẩy sang node-2
tar -czf flowgpt-src.tgz --exclude=node_modules --exclude=data --exclude=web/dist `
  -C "C:\Users\Minhn\FlowTech AI\flowgpt" .
scp -o ProxyJump=root@103.173.155.50 flowgpt-src.tgz root@165.101.114.162:/tmp/
```

```bash
# Trên node-2
cd /opt/flowgpt && tar -xzf /tmp/flowgpt-src.tgz
node --check server/src/index.js          # kiểm tra cú pháp trước khi restart
systemctl restart flowgpt && sleep 3 && systemctl is-active flowgpt
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7790/   # 200
```

Build web: **máy node-2 hiện KHÔNG có `vite`/`tsc`** (devDependencies chưa cài) nên `npm run build`
sẽ fail. Muốn build tại chỗ thì `npm ci` trước; còn không thì build ở bản dev rồi copy `web/dist/`.

## Popup quảng cáo VPNFlow + MeetFlow AI

- File: `web/public/promo.js` + `web/public/promo.css` (đặt ở `public/` nên Vite tự copy sang `dist/`).
- Gắn trong `web/index.html`:

```html
<link rel="stylesheet" href="/promo.css?v=<VERSION>" />
<script src="/promo.js?v=<VERSION>" defer></script>
```

- Hành vi: hiện sau 1,4 giây cho **mọi khách** (kể cả chưa đăng nhập, vì nạp từ `index.html`),
  nút tải đầu tiên chọn theo hệ điều hành, "Để sau"/`Esc` ẩn 1 ngày, "Không hiện lại nữa" ẩn vĩnh viễn
  (`localStorage` khoá `flowgpt:promo:apps:v1`).

### ⚠️ Mỗi lần sửa promo.css / promo.js phải bump `?v=`

Cloudflare cache `.css`/`.js` ở edge **1 năm** (`cache-control: public, max-age=31536000, immutable`)
và token Cloudflare của shop **không có quyền purge**. Không bump version thì origin đúng nhưng người
dùng vẫn nhận bản cũ — đã dính đúng lỗi này ngày 17/09/2026.

```bash
VER=$(date -u +%Y%m%d%H%M)
sed -i -E "s#(/promo\.(css|js))\?v=[^\"]*#\1?v=$VER#g" web/index.html web/dist/index.html
curl -s -D - -o /dev/null "https://flowgpt.meetflowai.site/promo.css?v=$VER" | grep -i cf-cache-status  # MISS
```

## Link cài đặt đang dùng (đã kiểm chứng 200, 17/09/2026)

VPNFlow: `/dl/VPNFlow-Setup-latest.exe` (Windows) · `/install/mac` · `/install/ios` · `/v1/downloads/android` · mua ở `/buy`
MeetFlow AI: `apps.apple.com/vn/app/meetflow-ai/id6765590042` · `api.meetflowai.site/v1/ai/downloads/android` · giới thiệu ở `/ai/guide` · mua ở `/ai/buy`

## Nguồn gốc file trong repo này

`flowgpt/` trong repo được snapshot từ bản dev Windows ngày **17/09/2026** (142 file); secret đã được
quét — không có token/key thật trong source (chỉ placeholder `CHANGE_ME_...` và giá trị test).
Cấu hình thật nằm ở `/etc/flowgpt/flowgpt.env` (600) và dữ liệu ở `/var/lib/flowgpt`, **ngoài** thư mục này.
