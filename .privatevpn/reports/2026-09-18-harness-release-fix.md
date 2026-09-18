# 2026-09-18 — Phát hành gói FlowTech Harness (Windows + macOS): sửa lỗi chặn + dọn secret

**Máy thực hiện:** harness Windows (DESKTOP-852P1LT) · **Area claim:** `harness-pkg`
**Commit:** `main = df5c82d`, `harness = c1e30bb`

## 1. Việc đã làm

| File | Thay đổi |
|---|---|
| `.dhs-setup/fpt-harness-package/bootstrap/install.ps1` | ASCII thuần; `$args` → `$psArgs`; bỏ em-dash trong chuỗi |
| `.dhs-setup/fpt-harness-package/windows/install-fpt-harness.ps1` | Comment sang ASCII thuần (không đổi code) |
| `.dhs-setup/fpt-harness-package/windows/fpt-harness-windows-bundle.zip` | Đóng lại từ nguồn đã scrub (bỏ mật khẩu mặc định), thêm `patches/`, `profile/`, `vps/nginx-dhs-gate`, chuẩn hoá LF |
| `scripts/build-harness-release.sh` | **Mới** — build 2 zip tất định + `latest.json` + `--upload` lên node-2 và verify qua CDN |
| `docs/HARNESS_INSTALL.md` | **Mới** — hướng dẫn cài 1 dòng lệnh cho Windows/macOS, link + sha256, quy trình phát hành |
| branch `harness` (npm package) | Scrub mật khẩu mặc định + bootstrap ASCII (repo **public**) |

## 2. Lỗi chặn đã tìm ra (nguyên nhân gốc)

Bootstrap Windows **không chạy được** ở bất kỳ máy sạch nào:

```
powershell -File install.ps1
At install.ps1:52 char:8
Missing closing '}' in statement block or type definition.
```

Nguyên nhân: file `.ps1` là UTF-8 **không BOM**; PowerShell 5.1 giải mã `.ps1` (và nội dung
`irm ... | iex` khi response thiếu charset) theo **codepage ANSI**. Ký tự `—` (U+2014) trong
chuỗi thành `â€”`, mà PowerShell coi `”` (U+201D) là **dấu ngoặc thông minh = dấu kết thúc chuỗi**
⇒ vỡ chuỗi ⇒ lỗi parse. Bằng chứng bisect:

```
ParseInput(UTF-8 text)  errors=0
ParseInput(CP1252 text) errors=1 -> Missing closing '}' @line 52
ParseInput(CP437 text)  errors=0
bỏ hết em-dash (U+2014)                        errors=0
chỉ dòng 59 hoặc chỉ dòng 98: em-dash -> '-'   errors=0
```

Cách chặn tái phát: `scripts/build-harness-release.sh` **từ chối build** nếu bất kỳ `.ps1` nào
trong gói còn byte non-ASCII.

## 3. Bằng chứng (lệnh thật + kết quả)

```
# Bootstrap 1 dòng lệnh thật (tải từ CDN, profile tạm, schtasks = stub)
powershell -File .tmp\test-bootstrap.ps1
=> Ket qua: 12/12 check pass
   OK tai zip + sha256 khop | OK chay duoc installer (buoc 4/4) | OK installer bao XONG
   OK SkipPatch duoc ton trong | OK khong tao task that tren may

# irm | iex decode: 0 loi parse, 0 byte non-ASCII, noi dung = file local
   parse(irm text) -> 0 loi

# Patch lên DSH 0.1.5-rc.1 MỚI TINH (npm install --prefix .tmp/fresh-npm)
bash .tmp/test-harness-patch.sh
   OK title = HarnessFlow            OK theme FlowVPN #33C773
   OK brand-official = mark FlowTech OK favicon = logo FlowTech
   OK browse-picker patch            OK sidebar logo 72px
   file thay doi khi chay lai: KHONG (idempotent)

# Audit CDN cuoi
bash .tmp/final-audit.sh   -> OK: audit pass
   windows flowvpn-harness-windows-fbbe6054.zip 599610 byte sha256 khop latest.json
   mac     flowvpn-harness-mac-8fc9b096.zip     588383 byte sha256 khop latest.json
   install.ps1 5183 byte, non-ASCII byte = 0, = ban local
   goi Windows: 14 entries, installer 0 byte non-ASCII, khong con mau mat khau, khong CRLF
   goi macOS:   12 entries, khong CRLF

# npx tu GitHub (cache sach)
npx -y github:minhfat-ux/FPTVPN#harness --dry-run   -> exit 0, in du flow
```

## 4. Bảo mật

- Gói zip Windows trên server **và** branch `harness` (repo **public**) còn mật khẩu mặc định
  trong `install-fpt-harness.ps1` + `README-WINDOWS.md` ⇒ đã scrub, đóng lại gói, **xoá các zip cũ
  trên server** (giờ 404), push fix lên branch `harness`.
- Mật khẩu này chỉ dùng cho site tunnel Windows (`dhs-win.meetflowai.site`) — kiểm tra trên
  node-2: domain **không phân giải được**, không có tiến trình nào nghe `13080/13081`, không có
  `/tmp/fpt-harness-vps` ⇒ **chưa từng deploy**, nên không có dịch vụ sống nào đang dùng mật khẩu đó.
  Vẫn còn trong **lịch sử git** (blob zip ở `5efc4a9`, branch `554c1d9`) — muốn xoá hẳn phải
  rewrite history; nếu sau này dựng site thì đặt mật khẩu mới qua `-AuthPass`.

## 5. Còn lại

- **macOS chưa test được** ở máy Windows: đã nhắn harness Mac (Telegram, message_id 246) chạy thử
  `install.sh` / `npx ...#harness`.
- Hero logo trong `dist/assets/index-*.js`: script in `WARN: khong thay cot grid cua headline`
  (markup DSH 0.1.5-rc.1 đổi) nhưng cỡ logo vẫn áp đúng (`sidebar 72px`, `hero 102px`). Cần soi
  giao diện thật nếu muốn chỉnh tiếp.
- Bước `productTitle` trong cả 2 patch script là **no-op** với DSH 0.1.5-rc.1 (renderer không còn
  biến này); branding thật nằm ở `dsh-client-ui-brand-official` — đã ghi chú trong docs.
