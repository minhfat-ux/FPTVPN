# bus-686 — MAC nghiệm thu độc lập (kết quả: PASS, kèm điều kiện)

Ngày: 2026-10-02 ~09:29Z (phiên MAC, watcher đánh thức bởi connector #704 [done] từ WIN).
Hướng đã chốt: **(A) đưa key về backend** — client Windows không giữ key provider nào.

Bối cảnh: vòng trước MAC đã `verify fail` vì **gói phát hành site-linked** vẫn là client cũ
giữ key. Vòng này WIN publish lại installer + overlay từ `99da3f2`. Đây là nghiệm thu lại.

## 1. Nguồn (ĐẠT)

- `git ls-remote git@github.com:minhfat-ux/MeetFlowAI_Win.git main` → `99da3f2f8e3abff8aeece3a2018a600033ff92bf`.
- Clone thật `--depth 50`; `HEAD = 99da3f2` (`9194a96..99da3f2`, gồm `cee56ee`).
- Grep đúng câu lệnh trong `--verify`:
  - `grep -RIn 'SonioxApiKey|OpenRouterApiKey|enc:|PortableSecret' MeetFlowAI.Win --include=*.cs --include=*.json`
    → **rỗng** (exit 1).
  - Bản `-E` (đúng ý nghĩa): `grep -RInE 'SonioxApiKey|OpenRouterApiKey|enc:|PortableSecret' …`
    → **rỗng** (exit 1).
- `Configuration/AppSettings.cs` chỉ còn 3 trường keyless:
  `MeetingApiBaseUrl`, `SonioxModel`, `ActivationApiUrl`.
- `Configuration/ProtectedSetting.cs` và `tools/protect-appsettings.ps1` **đã bị xoá** (`git show --stat cee56ee`).
- `dotnet build MeetFlowAI.Win/MeetFlowAI.Win.csproj -c Release -p:EnableWindowsTargeting=true`
  (trên macOS, TFM `net8.0-windows`) → **Build succeeded, 0 Error(s)** (3 warning NU1900 do cache NuGet
  ngoài workspace; giống cảnh báo cả hai bên đã ghi nhận).
- `FallbackSmoke` không chạy được trên macOS (`net8.0-windows` + DPAPI); ghi nhận WIN báo 6/6 PASS
  trên Windows, MAC không tự chạy lại được.

## 2. Gói phát hành công khai site-linked (ĐẠT)

Tải THẬT qua Internet công khai bằng đúng link mà trang web đang phát.

### Overlay zip (trang chủ)
`https://meetflowai.site/dl/MeetFlowAI-Overlay-2.0.0-win-x64.zip?v=a097ab51033e917564035128b2ab75cd`

- 73.565.774 B · md5 `a097ab51033e917564035128b2ab75cd` · sha256 `4122022c3bfb164d3f92c465d86fa5b8e008ae508ad7c23c2d12209098326c10`
- server `last-modified: Fri, 02 Oct 2026 09:18:20 GMT` (sau `99da3f2`).
- Giải nén: **485 entry, 0 `appsettings*`**.
- Quét **toàn bộ 485 file** (ASCII + UTF-16): **0 hit** `SonioxApiKey|OpenRouterApiKey|PortableSecret|ProtectedSetting|sk-or-v1|snx_`.
- `MeetFlowAI.Win.dll` (663.040 B): **0** định danh key; CÓ marker bản mới
  `MeetingApiBaseUrl`, `tmp-key`, `/summary`, `/chat`, `SecureConfigurationFile`.

### Installer Inno (/ai/buy)
`https://meetflowai.site/dl/MeetFlowAI-Setup-latest.exe?v=145f80972d615e81e02f68b89f21b27f`

- 52.183.737 B · md5 `145f80972d615e81e02f68b89f21b27f` · sha256 `6f5db3fc1b47f5f6472b4e183a9667e3a663d3fc36f047bf7007f8071a08d0f0`
- server `last-modified: Fri, 02 Oct 2026 09:18:16 GMT`; `Inno Setup Setup Data (6.7.0)`.
- `strings` thô: **0** `SonioxApiKey|OpenRouterApiKey|PortableSecret|ProtectedSetting|sk-or-v1`, **0** `appsettings`.
- Hash/size khớp đúng báo cáo WIN và khớp `?v=` trên web.

### Link web (ĐẠT 6/6)
- `/ai/buy` mặc định + `?lang=vi/en/zh/ja/ko` → đều `…Setup-latest.exe?v=145f80972d615e81e02f68b89f21b27f`.
- Trang chủ `/` → `…Overlay-2.0.0-win-x64.zip?v=a097ab51033e917564035128b2ab75cd`.

## 3. Backend keyless chạy thật (ĐẠT)

Probe trực tiếp `https://api.meetflowai.site/meetflow` (không in key/secret):

| endpoint | kết quả |
|---|---|
| `GET /health` | 200 `{"status":"ok"}` |
| `POST /tmp-key {clientReferenceId}` | **201** `{api_key (147 ký tự), expires_at}` — TTL ~900s |
| `POST /summary {format:"meeting_minutes", segments:[…], targetLanguage}` | **200** `{summary (594 ký tự), provider:"openrouter", model}` |
| `POST /chat {question, context}` | **200** `{answer, provider:"openrouter"}` |

⇒ client lấy temp key từ `/tmp-key` rồi mở WS Soniox (code `SonioxRealtimeClient` thử
`wss://stt-rt.soniox.com/transcribe-websocket` rồi relay `wss://api.meetflowai.site/soniox/transcribe-websocket`),
biên bản qua `/summary`, AI Assistant qua `/chat`.

## 4. Docs + commit (ĐẠT)

- `cee56ee` + `99da3f2` đã push `origin/main` (`MeetFlowAI_Win`), sửa `AppSettings.cs`, xoá
  `ProtectedSetting.cs`/`protect-appsettings.ps1`, thêm `MeetingBackendClient.cs`, cập nhật
  `README.md`, `AGENTS.md`, `docs/meetflowai-architecture.md`, `tools/package-overlay.ps1`.
- Bằng chứng phát hành của WIN: `a362a48 docs(bus-686): publish lai installer + overlay zip keyless …`
  (`docs/evidence/bus-686/README.md`, `backend-probe.txt` trên `origin/flowgpt`).

## 5. Tồn đọng / giới hạn (đã đối chiếu, KHÔNG chặn PASS)

1. **Cloudflare cache URL BARE (không `?v=`)** — vẫn phục vụ bản CŨ còn key:
   - `HEAD /dl/MeetFlowAI-Overlay-latest-win-x64.zip` → 200, `content-length 73.568.515`,
     `last-modified 08:22:28`, `cf-cache-status: HIT`. Tải thật: md5 `fb3154e18357378c0a7d7ec822e4731f`,
     sha256 `11a057754f5c4bad0afa566df1015a687d9bc235a76c84a566bcd97b3b33b394`; DLL bên trong còn
     `ProtectedSetting`, `PortableSecret`, `SonioxApiKey`, `OpenRouterApiKey`.
   - `HEAD /dl/MeetFlowAI-Setup-latest.exe` (bare) → bản cũ `08:49:43`.
   - Đây là cache CDN `max-age 14400` (~4h); token CF trên node-2 chỉ có `Zone:Read` nên WIN không purge được.
     **Mọi link chính thức (`/ai/buy` 6/6 + trang chủ) đều mang `?v=<md5>` nên khách nhận bản keyless.**
     Cách xử lý dứt điểm: **ROTATE key** (mục 6) làm key cũ vô hiệu, hoặc purge/ghi đè 2 URL bare sau khi hết TTL.
2. **Chưa mở được payload installer đã nén** để quét từng entry trên macOS (không có `innoextract`;
   host WIN bị Application Control chặn cài thử, exit 4). Bù lại: overlay zip công khai chứa cùng
   `MeetFlowAI.Win.dll` của cùng publish dir đã quét sạch từng file; installer raw strings 0 hit.
3. `tools/installer/appsettings.keyless.json` + `MeetFlowAI-bus686.iss` (input build installer) chưa
   commit vào repo private — WIN đã nêu; không ảnh hưởng code app (`origin/main@99da3f2`).

## 6. VIỆC CHỦ DỰ ÁN PHẢI LÀM (không thể thay)

- **ROTATE Soniox + OpenRouter key ngay** (2 key cũ đã phơi công khai). Backend đọc `.env` trên node-1;
  sau rotate cập nhật `.env` + restart service MeetFlow, rồi chạy lại probe `/tmp-key` + `/summary` + `/chat`.

## Kết luận

**PASS** cho phạm vi bus-686 (bỏ key khỏi client Windows, đưa về backend, phát hành lại gói keyless,
link web trỏ bản mới). Điều kiện còn lại thuộc chủ dự án: **rotate 2 key** (và tuỳ chọn purge 2 URL bare CDN).
