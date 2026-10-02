# bus-686 — Bỏ key Soniox/OpenRouter khỏi app Windows (đưa về backend)

**Hướng chọn: (A) đưa về backend** — client Windows không giữ bất kỳ key provider nào,
giống iOS/Android. Không dùng (B) vì app desktop phát cho khách thì mọi khoá giải mã
nằm trong binary đều trích ra được.

## Repo / commit

`minhfat-ux/MeetFlowAI_Win` · branch `main`

| commit | nội dung |
|---|---|
| `cee56ee` | fix(security): drop Soniox/OpenRouter keys from Windows client (bus-686) |
| `99da3f2` | chore(security): enforce keyless AppSettings whitelist + scrub doc mentions |

Đã push: `9194a96..99da3f2` (remote `refs/heads/main` = `99da3f2`).

## Đã sửa gì

- `Configuration/AppSettings.cs`: bỏ `SonioxApiKey`, `OpenRouterApiKey`,
  `OpenRouterChatCompletionsUrl`, `OpenRouterModel`, `OpenRouterFallbackModel`;
  còn đúng 3 trường không bí mật: `MeetingApiBaseUrl`, `SonioxModel`, `ActivationApiUrl`.
- **Xoá** `Configuration/ProtectedSetting.cs` + `tools/protect-appsettings.ps1`:
  đây là gốc rò rỉ 02/10 — `PortableSecret` là hằng số trong binary nên giải mã được.
- `Services/MeetingBackendClient.cs` (**mới**): `POST /tmp-key` (key Soniox tạm,
  TTL ~900s), `POST /summary` (biên bản họp), `POST /chat` (AI assistant), có xử lý
  envelope lỗi `{error:{code,message}}`.
- `Services/SonioxRealtimeClient.cs`: lấy temp key từ backend trước mỗi lần connect,
  không đọc key từ config nữa.
- `Services/MeetingSummaryService.cs` + `IMeetingSummaryService.cs` +
  `Models/SummaryResult.cs`: gửi `segments[] + targetLanguage` lên `/summary`, nhận
  text biên bản (trường `Content`).
- `ViewModels/MainViewModel.cs`: truyền ngôn ngữ đích đang chọn.
- `artifacts/fallback-smoke/Program.cs`: viết lại test cho đường backend + assert
  `AppSettings` đúng whitelist keyless + DPAPI + xoá plaintext.
- `tools/package-overlay.ps1`: mở rộng bộ quét rò rỉ (tên key provider, payload
  portable, `sk-*`/`snx_*`).
- Docs: `README.md`, `AGENTS.md`, `docs/meetflowai-architecture.md`.

## Bằng chứng kiểm chứng

1. **Không còn key trong cây đã push** (`git grep` trên `HEAD`, thư mục `MeetFlowAI.Win`):
   - `SonioxApiKey|OpenRouterApiKey|OpenRouterChatCompletionsUrl|OpenRouterFallbackModel|PortableSecret`
     ⇒ **không có dòng nào** (exit 1).
   - `enc:` chỉ còn trong regex chống rò rỉ của `tools/package-overlay.ps1` (cố ý).
2. **Build** (`_win-src/MeetFlowAI_Win`):
   `dotnet build .\MeetFlowAI.Win\MeetFlowAI.Win.csproj -c Release` ⇒ **0 lỗi**
   (chỉ còn warning NU1900 do máy không ra được nuget.org).
3. **Smoke** (`dotnet run --project .\MeetFlowAI.Win\artifacts\fallback-smoke\FallbackSmoke.csproj -c Release`):
   6/6 PASS — `/tmp-key` + `/summary` + `/chat` qua backend, envelope lỗi, whitelist
   keyless, lưu biên bản, retention, DPAPI round-trip.
4. **Backend thật** (`ops/_scratch/bus686-live-probe.mjs`, xem `backend-probe.txt`):
   `GET /health` 200 · `POST /tmp-key` 201 (key tạm 147 ký tự, prefix `snx_`) ·
   `POST /summary` 200 (`provider=openrouter`, 801 ký tự) · `POST /chat` 200.

## Còn lại (ngoài tay WIN)

- **Chủ dự án PHẢI rotate Soniox + OpenRouter key** (2 key cũ đã phơi công khai ~15 phút
  ngày 02/10). Backend đọc key từ `.env` trên node-1 nên sau khi rotate chỉ cần cập nhật
  `.env` + restart service MeetFlow.
- Installer/zip công khai (bus-683) nên được **build lại từ `99da3f2`** để bản phát hành
  mang đúng client keyless mới; bản zip 9194a96 tuy đã sạch `appsettings.json` nhưng
  binary cũ vẫn còn code đọc key nếu config có.
