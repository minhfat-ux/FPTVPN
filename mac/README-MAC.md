# FlowTech Harness — bản cài cho macOS

Chạy **1 lần** là DSH trên máy Mac đổi sang style của mình:
**theme FlowVPN** (màu thương hiệu, favicon, browse-picker cho truy cập từ xa)
+ **branding FlowTech / "HarnessFlow"** (logo, tên, tiêu đề trang, icon tab).

## Cách 1 — 1 dòng lệnh (khuyến nghị, tự cài mọi thứ)

```bash
curl -fsSL https://meetflowai.site/dl/harness/install.sh | bash
```

Script tự: cài **Node.js** (qua Homebrew, chưa có Homebrew thì cài luôn) → `npm install -g @deepseek-ai/dsh`
→ cài **Python 3** nếu thiếu → tải bộ cài mới nhất (kiểm tra **sha256**) → áp patch. Chạy lại nhiều lần vô hại.

Nếu máy đã có Node/npm:

```bash
npx -y github:minhfat-ux/FPTVPN#harness
```

## Cách 2 — tải bộ cài rồi chạy tay

```bash
curl -fL -o flowvpn-harness-mac.zip https://meetflowai.site/dl/harness/flowvpn-harness-mac.zip
unzip -q flowvpn-harness-mac.zip -d ~/flowvpn-harness && cd ~/flowvpn-harness
bash mac/install-mac.sh
```

Tham số hữu ích:

```bash
bash mac/install-mac.sh --dsh-root /opt/homebrew/lib/node_modules/@deepseek-ai/dsh   # chỉ định DSH
bash mac/install-mac.sh --skip-patch                                                 # chỉ cài, không patch
```

## Sau khi cài

1. **Ctrl+C** cửa sổ `dsh web` rồi chạy lại `dsh web`
2. Trong trình duyệt: **Cmd+Shift+R** (hard refresh)

## Script làm gì

| Bản vá | Nội dung |
|---|---|
| `patches/apply-fpt-patches.py` | theme FlowVPN (màu `#33C773`, nền navy), favicon, pin browse-picker cho workspace từ xa |
| `patches/apply-flowtech-brand.py` | logo FlowTech (giữ đúng tỉ lệ, **không cắt** chữ), tên + `<title>` = **HarnessFlow**, favicon/PWA icon, cỡ logo (sidebar 24→72px, hero 34→102px), `.logoRow` cao 88px |

Cả hai script **idempotent** (chạy lại không đổi gì) và tự backup `.fpt.bak` trước khi sửa.
Thứ tự bắt buộc: **FPT trước, FlowTech sau** (bước FPT ghi lại `dist/favicon.svg`).

## Kiểm tra sau khi chạy

```bash
npm root -g                      # -> thư mục chứa @deepseek-ai/dsh
ls ~/.dsh/profiles/web/cordis.patch.yml
node -e "const t=require('fs').readFileSync(process.argv[1],'utf8');console.log(t.includes('HarnessFlow')?'brand OK':'brand CHUA ap')" "$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html"
```

## Gỡ / quay về bản gốc

Mọi file bị sửa đều có bản `.fpt.bak` cạnh nó:

```bash
cd "$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai"
find . -name '*.fpt.bak' -exec sh -c 'for f; do cp "$f" "${f%.fpt.bak}"; done' _ {} +
```

## Ghi chú

- Patch chỉ đổi **style/branding**, không đụng dữ liệu phiên làm việc (`~/.dsh/sessions`).
- Tunnel/domain cho bản Mac (nếu cần truy cập từ ngoài) nằm ở `mac/setup-tunnel.sh` — chạy khi đã có VPS.
- Windows: xem `README-WINDOWS.md`.
