# flowvpn-harness

Cài **DeepSeek Harness** rồi áp style của mình (theme FlowVPN + branding **FlowTech / "HarnessFlow"**)
— Windows và macOS, một dòng lệnh.

## Chạy

```bash
# Windows (PowerShell)
irm https://meetflowai.site/dl/harness/install.ps1 | iex

# macOS / Linux-shell
curl -fsSL https://meetflowai.site/dl/harness/install.sh | bash
```

Hoặc khi máy đã có Node/npm:

```bash
npx -y github:minhfat-ux/FPTVPN#harness
flowvpn-harness --dry-run        # xem sẽ làm gì
flowvpn-harness --skip-patch     # chỉ cài DSH, không patch style
```

## Nó tự làm gì

1. **Node.js LTS** — Windows: winget (không có winget thì tải MSI từ nodejs.org); macOS: Homebrew.
2. **DeepSeek Harness** — `npm install -g @deepseek-ai/dsh` (bỏ qua nếu đã có).
3. **Python 3** — cần cho script patch (winget / Homebrew nếu thiếu).
4. **Tải bộ cài mới nhất** từ `latest.json`, **kiểm tra sha256** trước khi chạy.
5. **Áp patch**: theme FlowVPN (màu `#33C773`, browse-picker từ xa) + branding FlowTech
   (logo, tên, `<title>` = HarnessFlow, favicon, cỡ logo) + profile pin browse-picker.

Chạy lại nhiều lần **vô hại** (idempotent, tự backup `.fpt.bak`).

## Sau khi chạy

1. **Ctrl+C** cửa sổ `dsh web` rồi chạy lại `dsh web`
2. Trình duyệt: **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (macOS)

## Gói này chứa gì

| Thư mục | Nội dung |
|---|---|
| `windows/` | `install-fpt-harness.ps1` (installer Windows) + `patches/` + `profile/` + `tools/harness-shot.mjs` |
| `mac/` | `install-mac.sh` (installer macOS) + `setup-tunnel.sh` |
| `profile/` | `cordis.patch.yml` — pin browse directory-picker |
| `cli.mjs` | CLI chạy bởi `npx` (cài DSH rồi gọi installer đúng hệ điều hành) |

## Gỡ / quay về bản gốc

Mọi file bị sửa đều có `.fpt.bak` cạnh nó:

```bash
cd "$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai"
find . -name '*.fpt.bak' -exec sh -c 'for f; do cp "$f" "${f%.fpt.bak}"; done' _ {} +
```

Tài liệu chi tiết: `README-WINDOWS.md` (bản Windows), `README-MAC.md` (bản macOS).
