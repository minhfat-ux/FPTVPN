# T-20261002-04 — Bản Windows MeetFlowAI 2.0 mới nhất (bus #666)

Nguồn: bus **#666** (mac → win, 2026-10-02T07:42:58Z), ref
`MeetFlowAI_Win@f774199 · /var/www/flowvpn/dl/MeetFlowAI-Overlay-latest-win-x64.zip`.

## Kết quả

| Mục | Giá trị |
|---|---|
| Commit build | `f774199` (base MAC yêu cầu) **+ `95d67a0`** (commit sửa bảo mật của WIN) |
| Phiên bản | `2.0.0` (MeetFlowAI 2.0) |
| Thư mục publish | `artifacts/publish/MeetFlowAIInstallerBuild-20261002-155644` |
| Thời điểm build | 2026-10-02 ~15:56 (+07, máy WIN) |
| Overlay zip | `MeetFlowAI-Overlay-latest-win-x64.zip` — **73.569.240 B**, md5 `e2d4de4f959e3b91167627cbaba460ae`, sha256 `9dac0181778cfe8cf890293a0243bc89bafcab9e118e4599106f1f742b37e527` |
| Installer | `MeetFlowAI-2.0-Setup.exe` — **52.190.422 B**, md5 `b3966f9c5c2d1bacb6e3a42d16c03689`, sha256 `49aae9eb0cac6a5fe7ebf19c3ad18019c2655cbfa1a72575b0cfe13159fa2a8f` |

Đã upload lên node-2 `/var/www/flowvpn/dl/` (owner `caddy:caddy`, mode 644):

- `MeetFlowAI-Overlay-latest-win-x64.zip` (mới)
- `MeetFlowAI-Overlay-2.0.0-win-x64.zip` + `MeetFlowAI-Overlay-2.0.0-20261002-win-x64.zip` (versioned)
- `MeetFlowAI-2.0-Setup.exe` (installer Inno Setup)
- Bản cũ giữ lại: `*.bak-20261002-150743`

## Thay đổi bắt buộc (mục 4–6 của bus #666)

1. `ActivationApiUrl = https://api.meetflowai.site/v1/ai/license` (giữ nguyên hợp đồng
   `{key, machineId}` → `{valid, message, plan, activatedAt, expiresAt}` và dùng tiếp
   collection Firestore `activationKeys`).
2. Bỏ backdoor trong `Services/ActivationService.cs`:
   `AutoActivatedMachineName "LPP00031920A"` + `AutoActivatedUserName "MinhNB2"`.
3. Bỏ `LicenseSecret` hardcode: không còn ký HMAC cục bộ. `license.json` chỉ nhớ
   `key + machineId + plan + expiry`; mỗi lần mở app gọi `POST /verify` để server quyết
   định (thu hồi / hết hạn / giới hạn máy) ⇒ `license.json` tự viết không mở được app.
4. `GetMachineId()` bỏ qua UUID WMI mặc định (toàn `0` / toàn `F`) để nhiều máy OEM/VM
   không dùng chung một machineId.

Patch nguồn đầy đủ: [`activation-security.patch`](activation-security.patch)
(`git format-patch f774199..95d67a0`).

## Kiểm chứng

- `dotnet build .\MeetFlowAI.Win.csproj -c Release` → **0 warning / 0 error**.
- `dotnet run --project .\artifacts\fallback-smoke\FallbackSmoke.csproj -c Release` →
  **5/5 PASS** (OpenRouter primary/fallback, JSON, DPAPI round-trip + xoá plaintext, retention).
- Soi `MeetFlowAI.Win.dll`: **không còn** chuỗi `LPP00031920A`, `MinhNB2`,
  `MeetFlowAI.Win.2026.LocalLicense`, `AutoActivatedMachineName` (kiểm cả UTF-8 và UTF-16).
- Endpoint LIVE (đo từ node-2): `POST https://api.meetflowai.site/v1/ai/license/activate`
  với key giả → `404 {"valid":false,"message":"Activation key not found"}`.

## Việc Mac cần xử lý

**Cloudflare cache:** link cố định `.../MeetFlowAI-Overlay-latest-win-x64.zip` vẫn bị edge
trả bản **cũ** (content-length `71.363.017`, `cf-cache-status: HIT`, `age ~6142s`,
`max-age=14400` ⇒ còn ~2,3h). Origin đã đúng: `GET ...?cb=<ts>` trả `73.569.240`,
`last-modified 2026-10-02 08:07:46 GMT`. Không purge được từ node-2 vì token Cloudflare
hiện chỉ có quyền `Zone:Read` (`POST purge_cache` → `401 code 10000`).

→ Purge trên dashboard, hoặc tạm trỏ `ai_windows_url` sang bản versioned đang tươi
(`cf-cache-status: MISS`):
`https://meetflowai.site/dl/MeetFlowAI-Overlay-2.0.0-win-x64.zip`.

## Giới hạn

- Máy WIN có **Application Control policy** chặn nạp DLL build trong workspace/TEMP
  (`FileLoadException 0x800711C7`), nên không mở được UI bản mới tại chỗ để chụp/kiểm
  window. Bản cài cũ trong `%LOCALAPPDATA%\Programs\MeetFlowAI` vẫn mở bình thường.
  Không cài đè lên bản đang dùng để tránh đổi `license.json` / `appsettings.dat` của chủ dự án.
- Commit `95d67a0` **chưa push** lên GitHub (`minhfat-ux/MeetFlowAI_Win`) từ máy WIN:
  git HTTPS lỗi `schannel ... SEC_E_NO_CREDENTIALS`. Commit nằm ở repo cục bộ
  `C:\Users\Minhn\FPTVPN\MeetFlowAI_Win` và bản copy trong workspace; patch ở trên là bản
  đầy đủ để áp lại.
- Overlay zip có kèm `appsettings.json` (khoá Soniox/OpenRouter ở dạng portable `enc:`,
  `ActivationApiUrl` mới) để bản overlay chạy được ngay; lần chạy đầu app tự DPAPI-protect
  thành `appsettings.dat` rồi xoá file plaintext (đúng bất biến trong `AGENTS.md`).

Báo cáo đầy đủ đã gửi MAC qua bus **#667**.
