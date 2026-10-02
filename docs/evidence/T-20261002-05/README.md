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

## Vòng 2 — sửa theo `verify FAIL` của MAC (08:23Z)

MAC mở lại việc với 2 lý do: (a) link công khai trên `/ai/buy` + trang chủ vẫn là URL
**bare** `-2.0.0-win-x64.zip`, bị Cloudflare trả **bản CŨ CÓ KEY** (73.569.240 B, 486 entry);
(b) chưa **commit** cơ chế loại `appsettings.json` — lần trước chỉ là `robocopy /XF` một lần,
build lại từ `main` sẽ lộ lại.

### (a) Link công khai — đã sửa

- `app-config.db`: `ai_windows_url` → `https://meetflowai.site/dl/MeetFlowAI-Overlay-2.0.0-win-x64.zip?v=fb3154e18357378c0a7d7ec822e4731f`
- `home-page.js` (live `/root/flowvpn-cp/src/home-page.js` **và** workspace
  `/root/flowvpn-agent/control-plane/src/home-page.js`, dòng 1095): cùng URL `?v=<md5>`.
- Restart `flowvpn-cp.service` → `active`, `https://api.meetflowai.site/health` = 200.
- Kiểm chứng sau restart:
  - `/ai/buy` và `/ai/buy?lang=zh` và `/` đều render href
    `MeetFlowAI-Overlay-2.0.0-win-x64.zip?v=fb3154e18357378c0a7d7ec822e4731f`.
  - Tải **đúng href đó**: HTTP 200, `content-length 73568515`, `cf-cache-status MISS`,
    sha256 `11a057754f5c4bad0afa566df1015a687d9bc235a76c84a566bcd97b3b33b394`,
    485 entry, **0 entry `appsettings*`**, `testzip None`.
  - Query string nằm trong cache key của Cloudflare (đo: `?v=`/`?cb=` → MISS) nên URL
    này luôn lấy bản tươi từ origin thay vì HIT bản cũ.

### (b) Commit cơ chế loại `appsettings.json` — commit `9194a96`

`origin/main` của `minhfat-ux/MeetFlowAI_Win` nay = **`9194a96`**
(`fix(packaging): never ship appsettings.json in published artifacts`):

1. `MeetFlowAI.Win.csproj`: `appsettings.json` có `CopyToPublishDirectory=Never`
   ⇒ **`dotnet publish` không bao giờ phát file này**, nên zip publish dir kiểu gì cũng sạch.
   `bin/` vẫn giữ file (CopyToOutputDirectory=PreserveNewest) cho `dotnet run`.
2. `MeetFlowAI.iss`: stage `appsettings.json` từ **thư mục project**
   (`{#ConfigFile}` = `..\..\appsettings.json`) thay vì từ publish dir; vẫn
   `--protect-config` → DPAPI như cũ.
3. `tools/package-overlay.ps1` (mới): **cách duy nhất** được phép đóng gói overlay zip —
   strip `appsettings*` rồi tự kiểm tra, **từ chối ghi zip** nếu còn `appsettings*`
   hoặc còn giá trị `SonioxApiKey`/`OpenRouterApiKey` trong file JSON/config.
4. `AGENTS.md` + `docs/meetflowai-architecture.md`: ghi luật + yêu cầu `?v=<md5>`.

Kiểm chứng commit này **bằng publish thật** (trong khi `appsettings.json` **có mặt**):

| Kiểm tra | Kết quả |
|---|---|
| `dotnet publish -c Release -r win-x64 --self-contained` | exit 0, **485 file** |
| `appsettings.json` trong publish output | **KHÔNG có** |
| `bin/Release/net8.0-windows/win-x64/appsettings.json` | có (giữ cho `dotnet run`) |
| `tools/package-overlay.ps1` trên publish dir | OK — 485 entry, không appsettings* |
| `tools/package-overlay.ps1` khi nguồn **có** `appsettings.json` | OK — chỉ còn 1 entry, đã strip |

### Còn tồn

- **Rotate `SonioxApiKey` + `OpenRouterApiKey`** (chủ dự án) — key cũ đã lộ qua bản 02/10.
- Cloudflare vẫn giữ bản **có key** ở cache của URL bare `-2.0.0` /
  `-2.0.0-20261002` tới khi hết `max-age=14400` (không purge được từ node-2, token
  chỉ `Zone:Read`). Không còn link công khai nào trỏ tới 2 URL bare đó; nên purge
  khi có quyền.
- `MeetFlowAI-2.0-Setup.exe` đang bị cách ly (installer cũng nhúng config). Cần
  rebuild installer theo commit `9194a96` khi chủ dự án tạo `appsettings.json` mới
  (đã rotate), hoặc chuyển provider key ra backend (SRS D1/D2).
