# T-20261002-04 — Bản Windows MeetFlowAI 2.0 mới nhất (bus #666)

Nguồn: bus **#666** (mac → win, 2026-10-02T07:42:58Z), ref
`MeetFlowAI_Win@f774199 · /var/www/flowvpn/dl/MeetFlowAI-Overlay-latest-win-x64.zip`.

> ⚠️ Bản zip đầu tiên của task này **có kèm `appsettings.json` chứa key provider** (MAC phát hiện
> ở bus #671). Đã publish lại bản **keyless** — xem
> [`../T-20261002-05/README.md`](../T-20261002-05/README.md) để biết hash/URL cuối cùng.

## Kết quả build

| Mục | Giá trị |
|---|---|
| Commit build | `f774199` (base MAC yêu cầu) **+ `95d67a0`** (commit sửa bảo mật của WIN) — đã push lên `origin/main` của `minhfat-ux/MeetFlowAI_Win` |
| Phiên bản | `2.0.0` (MeetFlowAI 2.0) |
| Thư mục publish | `artifacts/publish/MeetFlowAIInstallerBuild-20261002-155644` |
| Thời điểm build | 2026-10-02 ~15:56 (+07, máy WIN) |
| Overlay zip (keyless, bản phát hành) | **73.568.515 B**, md5 `fb3154e18357378c0a7d7ec822e4731f`, sha256 `11a057754f5c4bad0afa566df1015a687d9bc235a76c84a566bcd97b3b33b394` |
| Overlay zip (bản đầu, CÓ key — đã bị thay) | 73.569.240 B, md5 `e2d4de4f959e3b91167627cbaba460ae` |
| Installer Inno Setup (không phát công khai) | `MeetFlowAI-2.0-Setup.exe` — 52.190.422 B, md5 `b3966f9c5c2d1bacb6e3a42d16c03689`, sha256 `49aae9eb0cac6a5fe7ebf19c3ad18019c2655cbfa1a72575b0cfe13159fa2a8f` |

## Thay đổi bắt buộc (mục 4–6 của bus #666)

1. `ActivationApiUrl = https://api.meetflowai.site/v1/ai/license` (giữ nguyên hợp đồng
   `{key, machineId}` → `{valid, message, plan, activatedAt, expiresAt}` và dùng tiếp
   collection Firestore `activationKeys`).
2. Bỏ backdoor trong `Services/ActivationService.cs`:
   `AutoActivatedMachineName "LPP00031920A"` + `AutoActivatedUserName "MinhNB2"`.
3. Bỏ `LicenseSecret` hardcode: không còn ký HMAC cục bộ. `license.json` chỉ nhớ
   `key + machineId + plan + expiry`; mỗi lần mở app gọi `POST /verify` để server quyết
   định (thu hồi / hết hạn / giới hạn máy) ⇒ `license.json` tự viết không mở được app.
4. `GetMachineId()` bỏ qua UUID WMI mặc định (toàn `0` / toàn `F`).

Patch nguồn đầy đủ: [`activation-security.patch`](activation-security.patch)
(`git format-patch f774199..95d67a0`). Commit `95d67a0` đã có trên
`origin/main` (`gh api repos/minhfat-ux/MeetFlowAI_Win/commits/main --jq .sha`).

## Kiểm chứng

- `dotnet build .\MeetFlowAI.Win.csproj -c Release` → **0 warning / 0 error**.
- `dotnet run --project .\artifacts\fallback-smoke\FallbackSmoke.csproj -c Release` →
  **5/5 PASS**.
- Soi `MeetFlowAI.Win.dll` (md5 `39f6e61bdee4b912e8a424313614d284`): **không còn** chuỗi
  `LPP00031920A`, `MinhNB2`, `MeetFlowAI.Win.2026.LocalLicense`, `AutoActivatedMachineName`
  (kiểm cả UTF-8 và UTF-16).
- Endpoint LIVE (đo từ node-2): `POST https://api.meetflowai.site/v1/ai/license/activate`
  với key giả → `404 {"valid":false,"message":"Activation key not found"}`.
- MAC nghiệm thu PASS ở bus **#673**.

## Giới hạn

- Máy WIN có **Application Control policy** chặn nạp DLL build trong workspace/TEMP
  (`FileLoadException 0x800711C7`), nên không mở được UI bản mới tại chỗ.
- Ghi chú ban đầu "zip có kèm appsettings.json" là **sai và đã được sửa**: bản phát hành
  cuối cùng **không** có `appsettings.json` (xem T-20261002-05).

Báo cáo đã gửi MAC qua bus **#667** (bản đầu) và **#674** (bản keyless).
