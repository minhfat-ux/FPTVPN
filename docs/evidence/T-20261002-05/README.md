# T-20261002-05 — Bỏ `appsettings.json` khỏi zip phát hành (bus #671)

Nguồn: bus **#671** (mac → win, 2026-10-02T08:12:35Z, `kind: urgent`).

## Sự cố

Bản overlay publish lúc 02/10 15:07 (md5 `e2d4de4f959e3b91167627cbaba460ae`, 73.569.240 B)
**có thêm `appsettings.json`**; trong đó `SonioxApiKey` + `OpenRouterApiKey` ở dạng portable
`enc:` (AES-CBC + HMAC, khoá KDF là hằng số `MeetFlowAI.Win.2026.Activation.Transcript`
nằm trong binary `Configuration/ProtectedSetting.cs`). File tải công khai không cần đăng nhập
⇒ bất kỳ ai tải cũng giải mã được key. Bản 18/09 **không** có `appsettings.json` ⇒ đây là
regression của bản 02/10.

## Đã sửa

1. **Bỏ `appsettings.json` khỏi zip phát hành** (đóng gói lại từ publish dir, loại file này):
   - `MeetFlowAI-Overlay-latest-win-x64.zip` = **73.568.515 B**
   - md5 `fb3154e18357378c0a7d7ec822e4731f`
   - sha256 `11a057754f5c4bad0afa566df1015a687d9bc235a76c84a566bcd97b3b33b394`
   - 485 entry, **0 entry `appsettings*`**, `testzip = None`.
2. Ghi đè cả 3 tên công khai bằng bản keyless trên node-2
   (`latest`, `-2.0.0`, `-2.0.0-20261002`), owner `caddy:caddy`, mode 644.
3. Thêm URL **mới chưa bị cache** để khách lấy bản keyless ngay:
   `https://meetflowai.site/dl/MeetFlowAI-Overlay-2.0.0-20261002-r2-win-x64.zip`
   (`cf-cache-status: MISS`, content-length 73.568.515).
4. Gỡ installer khỏi thư mục công khai (installer cũng nhúng `appsettings.json`):
   `/var/www/flowvpn/dl/MeetFlowAI-2.0-Setup.exe` → `/root/MeetFlowAI-2.0-Setup.exe.quarantine-20261002-151638`.
5. Cách ly 3 bản backup `.bak-fixcfg-*` (đều 73.569.240 B, **có key**, đang bị phục vụ công khai)
   → `/root/*.quarantine-20261002-1517xx`.

## Commit repo (yêu cầu #2 của bus #671)

`origin/main` của `minhfat-ux/MeetFlowAI_Win` nay = **`95d67a0`**
(`fix(activation): verify license with server, drop dev backdoor + hardcoded secret`),
xác nhận bằng `gh api repos/minhfat-ux/MeetFlowAI_Win/commits/main --jq .sha`.
Bản build keyless chính là DLL build từ commit này (md5 `39f6e61bdee4b912e8a424313614d284`).
Patch: [`../T-20261002-04/activation-security.patch`](../T-20261002-04/activation-security.patch).

## Còn tồn (MAC/chủ dự án xử lý)

- **Rotate `SonioxApiKey` + `OpenRouterApiKey`** — key cũ đã lộ, phải đổi.
- **Cloudflare edge cache** không purge được từ node-2 (token chỉ `Zone:Read`,
  `POST purge_cache` → `401 code 10000`):
  - `.../MeetFlowAI-Overlay-latest-win-x64.zip` → HIT bản 18/09 (71.363.017 B, **không key**, an toàn)
  - `.../MeetFlowAI-Overlay-2.0.0-win-x64.zip` và `.../-2.0.0-20261002-win-x64.zip`
    → HIT bản **có key** (73.569.240 B) thêm ~4h (`max-age=14400`) dù origin đã keyless.
  - → purge trên dashboard khi có quyền, tạm trỏ `ai_windows_url` sang URL `-r2` ở trên.
- Có tiến trình `sftp-server` (root) đang ghi dở
  `/var/www/flowvpn/dl/MeetFlowAI-Overlay-latest-win-x64.zip.new` (đang tăng) — nếu là
  MAC/SERVER đang upload đè `latest` thì cần phối hợp để không ghi đè lẫn nhau.

Báo cáo đã gửi MAC qua bus **#674**.

## Sau nghiệm thu — hợp nhất hash + sự cố hai phiên song song (08:22Z)

MAC đã nghiệm thu **PASS** (`ops/tasks/T-20261002-05/2026-10-02T08-21-27-992Z-mac-verified.json`).

Trong lúc đó có **HAI phiên WIN chạy song song** (cùng một wake): phiên thứ hai đóng gói lại
keyless bằng `ZipFile.CreateFromDirectory` rồi ghi đè `latest` / `-2.0.0` bằng container zip
khác byte nhưng **cùng nội dung**. Kiểm bằng `zipfile` trên node-2: cả 5 tên khi đó có **cùng
map entry → (size, CRC)**, 485 entry, 0 `appsettings*`, 0 marker key ⇒ nội dung giống hệt, chỉ
khác metadata zip (nên md5/sha256 khác). Đây đúng là cảnh báo "nhiều watcher cùng lúc" ở
`TASK-PROTOCOL.md` §7.2 (lỗi thật #2).

Đã hợp nhất về **một bản canonical duy nhất** (`r2`); cả 4 tên công khai nay cùng hash:

| Tên công khai | Byte | md5 | sha256 |
|---|---|---|---|
| `-latest`, `-2.0.0`, `-2.0.0-20261002`, `-2.0.0-20261002-r2` | 73.568.515 | `fb3154e18357378c0a7d7ec822e4731f` | `11a057754f5c4bad0afa566df1015a687d9bc235a76c84a566bcd97b3b33b394` |

Đã xoá alias tạm `-2.0.0-20261002-fixcfg-win-x64.zip`.

Đo lại cache Cloudflare trên URL **bare** (không `?cb=`, lúc 08:2xZ):

| URL bare | content-length | cf-cache-status | age |
|---|---|---|---|
| `-r2` | 73.568.515 (keyless) | HIT | ~165s |
| `-latest` | 71.363.017 (18/09, keyless) | HIT | ~6.949s |
| `-2.0.0` | 73.569.240 (**có key**) | HIT | ~807s |
| `-2.0.0-20261002` | 73.569.240 (**có key**) | HIT | ~807s |

⇒ Nên trỏ `ai_windows_url` sang URL `-r2` (đang HIT bản keyless) thay vì `-2.0.0`.
Bài học vận hành: trước khi upload vào thư mục phát hành phải giành khoá phối hợp
(pidfile) để hai phiên cùng wake không ghi đè lẫn nhau.
