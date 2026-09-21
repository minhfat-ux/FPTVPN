# Cài FlowTech Harness (Windows + macOS) — 1 dòng lệnh

Bộ cài gồm 2 gói: **Windows** và **macOS**. Mỗi gói tự cài mọi thứ cần thiết rồi áp style của mình
vào DeepSeek Harness (DSH).

## 1. Chạy 1 dòng lệnh (khuyến nghị)

**Windows** — dán vào PowerShell (quyền user bình thường, không cần admin):

```powershell
irm https://meetflowai.site/dl/harness/install.ps1 | iex
```

**macOS** — dán vào Terminal:

```bash
curl -fsSL https://meetflowai.site/dl/harness/install.sh | bash
```

**Máy đã có Node/npm** (cả 2 hệ điều hành):

```bash
npx -y github:minhfat-ux/FPTVPN#harness
```

Cả ba đường đều dẫn tới cùng một installer; chọn đường nào cũng được.

## 2. Nó tự làm gì

| Bước | Windows | macOS |
|---|---|---|
| 1. Node.js LTS | winget; không có winget thì tải MSI từ nodejs.org | Homebrew; chưa có Homebrew thì cài Homebrew |
| 2. DeepSeek Harness | `npm install -g @deepseek-ai/dsh` | như Windows |
| 3. Python 3 (cho patch) | winget | Homebrew (`brew install python`) |
| 4. Tải gói | `latest.json` → zip (kèm `?t=` chống cache) → **kiểm tra sha256** | như Windows |
| 5. Áp patch | theme FlowVPN + branding FlowTech + profile | như Windows |

Sau khi xong:

1. **Ctrl+C** cửa sổ `dsh web` rồi chạy lại `dsh web`
2. Trình duyệt: **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (macOS)

## 3. Link tải trực tiếp (tải tay)

```
https://meetflowai.site/dl/harness/latest.json                                   # luôn trỏ bản mới nhất
https://meetflowai.site/dl/harness/flowvpn-harness-windows-<sha8>.zip            # gói Windows
https://meetflowai.site/dl/harness/flowvpn-harness-mac-<sha8>.zip                # gói macOS
```

Bản đang phát hành (đọc `latest.json` để chắc chắn):

| Gói | File | sha256 |
|---|---|---|
| Windows | `flowvpn-harness-windows-fbbe6054.zip` (599 610 byte) | `fbbe60542d90f4ae2506e9f56d396699891e7dbcd767a4c26ec42d89bfdefaa3` |
| macOS | `flowvpn-harness-mac-8fc9b096.zip` (588 383 byte) | `8fc9b0966d4c92548259ae506a38d7d171c747b85433806148ff73df8bda19df` |

Giải nén rồi chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\flowvpn-harness-windows\install-fpt-harness.ps1
```

```bash
bash flowvpn-harness-mac/install-mac.sh
```

> Tên file zip kèm `<sha8>` nên URL là **bất biến** — Cloudflare cache 4h không ảnh hưởng.
> `latest.json` được đọc kèm `?t=<epoch>` nên luôn là bản mới.

## 4. Patch làm gì

| Bản vá | Nội dung |
|---|---|
| `apply-fpt-patches.py` | theme FlowVPN (màu `#33C773`, nền navy), favicon, browse-picker cho truy cập từ xa |
| `apply-flowtech-brand.py` | logo FlowTech (giữ tỉ lệ, không cắt chữ), tên + `<title>` = **HarnessFlow**, favicon/PWA icon, cỡ logo (sidebar 24→72px, hero 34→102px) |

Thứ tự bắt buộc: **FPT trước, FlowTech sau** (bước FPT ghi lại `dist/favicon.svg`).
Cả hai **idempotent**, tự backup `.fpt.bak`. Chạy lại nhiều lần vô hại.

Với DSH 0.1.5-rc.1: tiêu đề/tên app lấy từ `dsh-client-ui-brand-official`
(`dsh-client-ui-renderer` không còn biến `productTitle`), nên bước đổi `productTitle` là no-op —
không phải lỗi. Bước "hero logo" có thể in `WARN: khong thay cot grid` (markup đổi) nhưng cỡ logo
vẫn được áp (`sidebar 72px`, `hero 102px`).

## 5. Kiểm tra sau khi cài

```bash
npm root -g                                        # thư mục chứa @deepseek-ai/dsh
cat ~/.dsh/profiles/web/cordis.patch.yml           # profile pin browse-picker
```

Windows: mở `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-web-frontend\dist\index.html`
→ phải thấy `<title>HarnessFlow</title>`.

## 6. Quay về bản gốc

Mọi file bị sửa đều có `.fpt.bak` cạnh nó:

```bash
cd "$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai"
find . -name '*.fpt.bak' -exec sh -c 'for f; do cp "$f" "${f%.fpt.bak}"; done' _ {} +
```

## 7. Ghi chú bảo mật & vận hành

- Mật khẩu đăng nhập GUI harness (site qua VPS) **không** nằm trong mã nguồn: truyền `-AuthPass`
  khi cài bản có tunnel/VPS. Repo này là **public**, đừng commit secret.
- Patch chỉ đổi style/branding, **không** đụng dữ liệu phiên (`~/.dsh/sessions`).
- **Mọi file `.ps1` phát cho người dùng phải là ASCII thuần.** PowerShell 5.1 giải mã `.ps1`
  (không BOM) và nội dung `irm ... | iex` theo codepage ANSI khi thiếu charset, nên ký tự UTF-8
  đa byte — đặc biệt `—` (U+2014) — biến thành dấu ngoặc thông minh `”`, làm vỡ chuỗi và lỗi parse.
  `scripts/build-harness-release.sh` **từ chối build** nếu còn byte non-ASCII trong `.ps1`
  hoặc còn mật khẩu mặc định, và tự kiểm tra sha256 sau khi upload.

## 8. Phát hành bản mới (dành cho người phát hành)

```bash
bash scripts/build-harness-release.sh            # build 2 zip + latest.json (không upload)
bash scripts/build-harness-release.sh --upload   # build + đẩy lên node-2 + verify qua CDN
```

Script build zip **tất định** (cùng nguồn → cùng sha256) từ `.dhs-setup/fpt-harness-package/`,
chuẩn hoá **LF** cho mọi file text (CRLF làm hỏng script bash trên macOS/Linux),
cập nhật `latest.json`, đồng bộ lại `fpt-harness-windows-bundle.zip` trong repo, rồi (khi có
`--upload`) copy lên `/var/www/flowvpn/dl/harness`, `chown caddy:caddy`, và verify HTTP 200 +
sha256 khớp qua chính URL public. Tên file zip đổi theo `<sha8>` nên bản cũ vẫn tải được —
xóa tay các bản cũ trên server khi muốn dọn.

## 9. Tự vá lại theme/brand sau khi nâng cấp DSH (đọc trước khi `npm i -g`)

`npm install -g @deepseek-ai/dsh@<ver>` **thay cả thư mục package** ⇒ xoá sạch patch (theme
`#33C773`, logo FlowTech, tên **HarnessFlow**, **icon Culi**). Sự cố 21/09/2026: nâng cấp lên
`0.1.5-rc.1` làm harness mất theme/layout, icon quay về DeepSeek mà không ai biết.

Bộ tự vá (idempotent, tự backup `.fpt.bak`):

```bash
bash scripts/harness-ensure-patches.sh          # kiểm tra + vá ngay (--check = chỉ kiểm, --notify = báo Telegram)
bash scripts/harness-patches-install.sh         # cài bản chạy nền vào ổ trong + bật LaunchAgent
```

- LaunchAgent `site.meetflowai.harness-patches` chạy **mỗi 15 phút** (`StartInterval=900`), tự vá lại
  và nhắn Telegram khi vừa vá.
- **Vì sao bản cài nằm ở `~/.local/share/harness-patches`**: launchd bị TCC chặn đọc ổ ngoài
  (`/Volumes/BIWIN`) — agent trỏ thẳng vào repo sẽ chết im lặng (`Operation not permitted`). Sau khi
  sửa script/patch trong repo phải chạy lại `harness-patches-install.sh` để đồng bộ bản ổ trong.
- **Icon harness = hình Culi** (`patches/culi-icon.png` 512×512) cho `favicon.png`, `favicon.svg`
  (SVG nhúng PNG) và `brand-mark.png` (icon trong sidebar); logo FlowTech có chữ vẫn dùng cho
  hero/login (`brand-logo.png`).
- Sau khi vá: khởi động lại `dsh web` rồi **Cmd+Shift+R**; nếu icon trên tab vẫn cũ, đóng/mở lại tab
  (Chrome cache favicon rất dai).
