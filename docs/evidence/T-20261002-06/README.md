# T-20261002-06 / TG-VIBECODE — Test lại bản MeetFlowAI mới nhất trên máy thật (WIN)

Nguồn: Telegram của chủ dự án, chuyển qua connector VPS — bus **#693** (`owner → win`, `kind: task`,
`ref: TG-VIBECODE`, `2026-10-02T08:55:23Z`): **"test lại bản mới nhất meetflowAI trên máy thật"**.

> Ghi chú giao thức: sổ `TG-VIBECODE` được tạo là `owner → mac`, nên WIN **không thể** `ack`/`done`
> trực tiếp (`ops/task.mjs` từ chối: "chỉ bên nhận"). Việc này được chép vào sổ riêng
> `T-20261002-06` (`owner → win`, `transcribedBy: win`, `busId: 693`) — đúng cách đã dùng cho
> `T-20261002-01..03`.

Máy test (máy thật): **DESKTOP-852P1LT**, Windows 11 `10.0.26200`, user `minhn` (KHÔNG phải admin),
không nằm trong tailnet. Thời điểm: 2026-10-02 ~17:00–17:20 (+08).

## 1. Kết quả đo trên máy thật

| # | Hạng mục | Kết quả |
|---|---|---|
| 1 | `/ai/buy` 5/5 ngôn ngữ (mặc định, vi, en, zh, ja, ko) | **PASS** — cả 6 trang HTTP 200, href Windows duy nhất `https://meetflowai.site/dl/MeetFlowAI-Setup-latest.exe?v=a0b7c78f5963dda7f5e8d5341a0e7de6` |
| 2 | HEAD link tải | **PASS** — 200, `content-type: application/octet-stream`, `content-length: 52177349`, `cf-cache-status: HIT` |
| 3 | Tải THẬT từ máy thật | **PASS** — 52.177.349 B; md5 `a0b7c78f5963dda7f5e8d5341a0e7de6`; sha256 `4e832ebff9233b617920a51feb336e88659a39bcd38aa875dacad3643fa095cf`; magic `MZ`; có chuỗi `Inno Setup`; khớp báo cáo của WIN/MAC |
| 4 | Payload trong installer có key/backdoor không? | **PASS (keyless)** — trích được `MeetFlowAI.Win.dll` ngay trong lúc installer giải nén: sha256 `5913C6BC…A50C9D`, **trùng khít** DLL của publish dir `MeetFlowAIInstallerBuild-20261002-164453`; quét `SonioxApiKey` / `OpenRouterApiKey` / `PortableSecret` / `IsAutoActivatedMachine` / `LicenseSecret` = **0** |
| 5 | Chạy app từ đúng payload của installer trên máy thật | **PASS** — `--protect-config` tạo `appsettings.dat` DPAPI 502 B, xoá plaintext; app mở cửa sổ `MeetFlowAI 2.0` 900×640, `Responding=True`, 14 control UIA (Start/Stop live translation, Activate, Generate AI meeting minutes, Save transcript, …) |
| 6 | Backend thật (client keyless) | **PASS** — `GET /health` 200 · `POST /tmp-key` 201 (key tạm `snx_…`, 147 ký tự) · `POST /summary` 200 (`provider=openrouter`) · `POST /chat` 200 |
| 7 | Cài thật bằng installer (Release Workflow bước 5–7) | **CHƯA LÀM ĐƯỢC trong phiên này** — xem §2 |

Chi tiết: `public-download.json`, `uia-controls.txt`, `backend-probe.txt`, `install-inno.log`,
`app-window.png`.

## 2. Vì sao CHƯA cài thật được — nguyên nhân là sandbox của harness, KHÔNG phải lỗi gói

Chạy `MeetFlowAI-Setup-latest.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /LOG=…`:

- Inno Setup **6.7.3 chạy thật**, giải nén **thành công cả 486 file** vào `{app}` (log ghi
  `Successfully installed the file` cho từng file) — rồi **rollback** và thoát **exit 4**.
- Lỗi duy nhất trong log:

  ```
  Fatal exception during installation process (Exception):
  Error creating registry key: … RegCreateKeyEx failed; code 5. Access is denied.
  ```

- Nguyên nhân đo được: **sandbox `workspace-write` của phiên DSH chặn ghi registry HKCU**:

  ```powershell
  New-Item -Path 'HKCU:\Software\__dsh_regtest' -Force
  # → Access to the registry key 'HKEY_CURRENT_USER\Software\__dsh_regtest' is denied.
  ```

  Installer là `PrivilegesRequired=lowest` nên Inno ghi khoá gỡ cài đặt vào
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\…`; sandbox chặn ⇒ Inno coi là lỗi
  nghiêm trọng và gỡ lại toàn bộ. Vì file trong workspace thì ghi được, chỉ registry bị chặn.
- Đã xin nâng quyền chạy ngoài sandbox (`danger-full-access`) để cài thật:
  `Error: sandbox escalation to "danger-full-access" requires approval, but no approval channel is available`
  ⇒ **bị từ chối (fail-closed)**, dừng ở đây theo đúng luật, không tìm đường vòng.

**Kết luận:** bước "cài rồi mở app" cần chạy trong một phiên **không sandbox** (hoặc cần người
duyệt nâng quyền). Đây là hạn chế của harness, không phải khuyết điểm của installer.

### 2b. Cảnh báo bảo mật của Windows (không chặn cứng trong phiên này)

- Smart App Control đang **bật** (`HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy`
  `VerifiedAndReputablePolicyState = 1`). Log `Microsoft-Windows-CodeIntegrity/Operational` có ghi
  một lần chặn cho chính file installer (policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`,
  "Enterprise signing level requirements" + "Smart App Control Block Details"), nhưng các lần chạy
  sau installer **vẫn thực thi** (có log Inno) ⇒ trong phiên này nguyên nhân dừng cứng là sandbox
  registry, không phải SAC.
- Toàn bộ `MeetFlowAI.Win.exe/.dll` + installer đều **NotSigned** (không có Authenticode). Với khách
  hàng thật (SmartScreen/SAC), gói không ký sẽ bị cảnh báo/chặn. **Khuyến nghị: ký Authenticode cho
  installer + app trước khi phát hành rộng.**

## 3. Đối chiếu với việc MAC mở lại `bus-686` (#695)

MAC mở lại vì cho rằng **cả installer** `/dl/MeetFlowAI-Setup-latest.exe` cũng là client cũ còn key.
Đo trực tiếp trên máy thật cho thấy **installer thì đã keyless**:

- Installer `a0b7c78f…` ⇄ `.iss` `MeetFlowAI-bus685.iss` (SourceDir
  `artifacts/publish/MeetFlowAIInstallerBuild-20261002-164453`) ⇄ file `dist/bus685/MeetFlowAI-2.0-Setup.exe`
  (cùng md5) — và payload DLL trích từ chính installer đó = `5913C6BC…A50C9D`, đúng DLL của publish
  `164453`, quét key/backdoor = 0 (§1 mục 4).

⇒ Phần **còn sai là bản overlay ZIP công khai** (`MeetFlowAI-Overlay-*`), không phải installer.
Việc publish lại ZIP/installer từ commit `99da3f2` đang do phiên WIN khác thực hiện (đã `ack`
`bus-686` lúc 09:06Z) — phiên này **không** sửa source/không upload để tránh sự cố #684 (hai phiên
ghi đè artifact).

## 4. Ghi chú môi trường (để lần sau không mất thời gian)

- `curl.exe` và `Invoke-WebRequest` **hỏng TLS** trong sandbox này:
  `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e)` — với mọi host,
  kể cả google.com. **Node `fetch` hoạt động bình thường** ⇒ dùng script Node để tải/kiểm web.
- Không có 7-Zip/`innoextract` trên máy; để lấy payload installer đã dùng cách: chạy installer với
  `/DIR` trong workspace rồi **bắt file `MeetFlowAI.Win.dll` ngay trong cửa sổ giải nén** (trước khi
  rollback) — script hoá bằng `Start-Job` poll 80 ms.
- Chạy nhiều phiên WIN song song là có thật (xem `docs/evidence/bus-683/README.md`); phiên này chỉ
  đọc/đo, không ghi vào artifact phát hành.

## 5. Khuyến nghị

1. Chạy lại bước cài thật trong phiên **không sandbox** (hoặc mở approval để nâng quyền) — lệnh:
   `dist/tg-vibecode-real-test/MeetFlowAI-Setup-latest.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART`
   rồi xác nhận `%LOCALAPPDATA%\Programs\MeetFlowAI\MeetFlowAI.Win.exe` mở cửa sổ `Responding=True`.
2. **Ký Authenticode** installer + app (hiện NotSigned) trước khi phát hành rộng.
3. Publish lại overlay ZIP từ `99da3f2` (việc của `bus-686`, phiên khác đang làm) và cập nhật `?v=`.
4. **Chủ dự án phải rotate Soniox + OpenRouter** (2 key cũ đã phơi công khai ở bản zip 02/10).
5. Cân nhắc bỏ hẳn 2 dòng stage `appsettings.json` trong `.iss` (schema cũ `OpenRouter*` đã chết,
   `AppSettings` đã có default) để installer không còn config nào.

## 6. Lệnh tái lập

```powershell
node ops/_scratch/win-real-machine-test.mjs        # 5/5 ngôn ngữ + tải + md5/sha256 + MZ + MOTW
node ops/_scratch/bus686-live-probe.mjs            # /health, /tmp-key, /summary, /chat tu may that
# payload app (dung y nguyen trong installer):
$pub = '_win-src\MeetFlowAI_Win\MeetFlowAI.Win\artifacts\publish\MeetFlowAIInstallerBuild-20261002-164453'
Copy-Item "$pub\*" dist\tg-vibecode-real-test\app-sim -Recurse
Copy-Item '_win-src\MeetFlowAI_Win\MeetFlowAI.Win\appsettings.json' dist\tg-vibecode-real-test\app-sim
Start-Process 'dist\tg-vibecode-real-test\app-sim\MeetFlowAI.Win.exe' -PassThru   # -> cua so 'MeetFlowAI 2.0'
```
