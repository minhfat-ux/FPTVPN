# Nguồn sự thật & cách deploy FlowGpt

FlowGpt có **3 nơi**, đừng sửa nhầm:

| Nơi | Vai trò |
|---|---|
| `C:\Users\Minhn\FlowTech AI\flowgpt` (Windows) | **NƠI LÀM VIỆC CHÍNH.** Là git repo riêng (branch `master`), remote đã gắn: `origin` = `github.com/minhfat-ux/FPTVPN`, **push lên nhánh `flowgpt`**. `git push` ở đây đã trỏ đúng nhờ upstream. |
| `FPTVPN/flowgpt/` (nhánh `main` của repo này) | **Ảnh chụp (snapshot)** của lần **commit gần nhất** ở bản dev — để mọi người đọc/diff trong repo chính mà không phải sang branch khác. KHÔNG phải nơi sửa. |
| `/opt/flowgpt` (node-2) | **Bản đang chạy**: systemd `flowgpt`, cổng `127.0.0.1:7790`, Caddy TLS cho `flowgpt.meetflowai.site`. |

> 17/09/2026: bản chạy `/opt/flowgpt` **cũ hơn** bản dev (thiếu voice mode, skill picker, topup…). Cần deploy lại theo mục dưới.

## Làm việc hằng ngày (trên Windows)

```powershell
cd "C:\Users\Minhn\FlowTech AI\flowgpt"
git status                          # xem đang sửa gì
git add -A && git commit -m "..."   # commit như bình thường
git push                            # -> origin/flowgpt (đã set upstream)
git pull                            # lấy thay đổi từ máy khác (nếu có)
```

`.gitignore` của app bỏ `node_modules/`, `data/`, `web/dist/` — chúng thuộc về từng máy, không vào git.

## Cập nhật ảnh chụp trong repo chính

Sau khi đã commit ở bản dev:

```powershell
cd "C:\Users\Minhn\FlowTech AI\flowgpt"
git archive --format=tar HEAD -o C:\Users\Minhn\FPTVPN\.tmp\flowgpt-head.tar
cd C:\Users\Minhn\FPTVPN
Remove-Item flowgpt -Recurse -Force
New-Item -ItemType Directory flowgpt | Out-Null
tar -xf .tmp\flowgpt-head.tar -C flowgpt
# nhớ tạo lại file tài liệu này (nó không nằm trong repo app)
git add flowgpt && git commit -m "chore(flowgpt): cap nhat anh chup tu ban dev"
```

Ảnh chụp chỉ chứa file **đã commit**; việc đang làm dở ở bản dev không bị đưa vào.

## Deploy bản dev lên node-2

```powershell
cd "C:\Users\Minhn\FlowTech AI\flowgpt"
tar -czf flowgpt-src.tgz --exclude=node_modules --exclude=data --exclude=web/dist .
scp -o ProxyJump=root@103.173.155.50 flowgpt-src.tgz root@165.101.114.162:/tmp/
```

```bash
# Trên node-2
cd /opt/flowgpt && tar -xzf /tmp/flowgpt-src.tgz
node --check server/src/index.js
systemctl restart flowgpt && sleep 3 && systemctl is-active flowgpt
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7790/    # 200
```

Build web: node-2 **không có `vite`/`tsc`** (devDependencies chưa cài) nên `npm run build` sẽ fail.
Cách nhanh: build ở Windows rồi copy `web/dist/`, hoặc `npm ci` trên node-2 trước.

## Popup quảng cáo VPNFlow + MeetFlow AI

- File: `web/public/promo.js` + `web/public/promo.css`; gắn trong `web/index.html` bằng 2 tag có `?v=<VERSION>`.
- Hiện sau 1,4 giây cho **mọi khách** (kể cả chưa đăng nhập), ưu tiên nút tải theo hệ điều hành,
  "Để sau"/`Esc` ẩn 1 ngày, "Không hiện lại nữa" ẩn vĩnh viễn (`localStorage` khoá `flowgpt:promo:apps:v1`).

### ⚠️ Sửa promo.css / promo.js thì PHẢI bump `?v=`

Cloudflare cache `.css`/`.js` ở edge **1 năm** (`immutable`) và token Cloudflare của shop **không có
quyền purge**. Không bump version ⇒ origin đúng nhưng người dùng vẫn nhận bản cũ (đã dính 17/09/2026):

```bash
VER=$(date -u +%Y%m%d%H%M)
sed -i -E "s#(/promo\.(css|js))\?v=[^\"]*#\1?v=$VER#g" web/index.html web/dist/index.html
curl -s -D - -o /dev/null "https://flowgpt.meetflowai.site/promo.css?v=$VER" | grep -i cf-cache-status  # MISS
```

## Link cài đặt đang dùng (đã kiểm chứng 200, 17/09/2026)

VPNFlow: `/dl/VPNFlow-Setup-latest.exe` (Windows) · `/install/mac` · `/install/ios` · `/v1/downloads/android` · mua ở `/buy`
MeetFlow AI: `apps.apple.com/vn/app/meetflow-ai/id6765590042` · `api.meetflowai.site/v1/ai/downloads/android` · giới thiệu ở `/ai/guide` · mua ở `/ai/buy`
