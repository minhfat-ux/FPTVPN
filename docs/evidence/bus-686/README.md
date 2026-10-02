# bus-686 — Bỏ key Soniox/OpenRouter khỏi app Windows (đưa về backend)

**Hướng chọn: (A) đưa về backend** — client Windows không giữ bất kỳ key provider nào,
giống iOS/Android. Không dùng (B) vì app desktop phát cho khách thì mọi khoá giải mã
nằm trong binary đều trích ra được.

## Repo / commit

`minhfat-ux/MeetFlowAI_Win` · branch `main`

| commit | nội dung |
|---|---|
| `cee56ee` | fix(security): drop Soniox/OpenRouter keys from Windows client (bus-686) |
| `99da3f2` | chore(security): enforce keyless AppSettings whitelist + scrub doc mentions (bus-686) — **origin/main hiện tại** |

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

## Bằng chứng kiểm chứng (source)

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

---

## PHÁT HÀNH LẠI bản keyless (bus-686 mở lại lúc 09:05Z 02/10)

**Lý do MAC mở lại:** source đã sạch nhưng **gói phát hành công khai** vẫn là client cũ
giữ key — overlay zip công khai chứa `MeetFlowAI.Win.dll` build 15:56 (trước `cee56ee`),
installer `/dl/MeetFlowAI-Setup-latest.exe` build trước `cee56ee`. → Phải build lại gói
từ `99da3f2`, đẩy lên `/dl/`, cập nhật `?v=` trên web.

### Build (02/10 17:08–17:13)

| bước | lệnh | kết quả |
|---|---|---|
| publish | `dotnet publish .\MeetFlowAI.Win.csproj -c Release -r win-x64 --self-contained -o artifacts\publish\MeetFlowAIInstallerBuild-20261002-170821` | exit 0 · **485 file** · **0 entry `appsettings*`** |
| smoke | `dotnet run --project .\artifacts\fallback-smoke\FallbackSmoke.csproj -c Release` | **6/6 PASS** (tmp-key, /summary, /chat, envelope lỗi, keyless AppSettings, save/retention/DPAPI) |
| overlay | `tools\package-overlay.ps1 -SourceDir <publish> -OutFile dist\bus686\MeetFlowAI-Overlay-2.0.0-win-x64.zip` | **OK — sạch** (0 `appsettings*`, 0 key), 485 entry |
| installer | `ISCC.exe tools\installer\MeetFlowAI-bus686.iss` | exit 0 (57,9s, Inno Setup 6.7.0) |

Nguồn build: **`MeetFlowAI_Win@99da3f2`** (HEAD = origin/main, cây sạch trước build).
Config được installer stage là **template KEYLESS** `tools\installer\appsettings.keyless.json`
(3 trường không bí mật: `MeetingApiBaseUrl`, `SonioxModel`, `ActivationApiUrl`) — **không**
dùng `appsettings.json` của máy dev; installer vẫn `--protect-config` → `appsettings.dat` (DPAPI).

### Artifact công khai (đã đẩy node-2 `/var/www/flowvpn/dl/`, `caddy:caddy 644`)

| tên file | bytes | md5 | sha256 |
|---|---|---|---|
| `MeetFlowAI-Setup-latest.exe` | 52.183.737 | `145f80972d615e81e02f68b89f21b27f` | `6f5db3fc1b47f5f6472b4e183a9667e3a663d3fc36f047bf7007f8071a08d0f0` |
| `MeetFlowAI-Setup-2.0.0.exe` (bản versioned) | 52.183.737 | (cùng hash) | (cùng hash) |
| `MeetFlowAI-Overlay-2.0.0-win-x64.zip` | 73.565.774 | `a097ab51033e917564035128b2ab75cd` | `4122022c3bfb164d3f92c465d86fa5b8e008ae508ad7c23c2d12209098326c10` |
| `MeetFlowAI-Overlay-latest-win-x64.zip` + `…-20261002-…` + `…-20261002-r2-…` | 73.565.774 | (cùng hash) | (cùng hash) |

Bản cũ được giữ nguyên dạng `.bak-bus686-20261002-091814`.

### Web đã trỏ lại (cache-busting `?v=<md5>`)

- `/ai/buy` (mặc định + `?lang=vi/en/zh/ja/ko`, **6/6**): `https://meetflowai.site/dl/MeetFlowAI-Setup-latest.exe?v=145f80972d615e81e02f68b89f21b27f`
  - `app-config.db` `ai_windows_url` cập nhật (backup `app-config.db.bak-bus686-20261002-091814`).
- Trang chủ `/`: `https://meetflowai.site/dl/MeetFlowAI-Overlay-2.0.0-win-x64.zip?v=a097ab51033e917564035128b2ab75cd`
  - sửa ở cả `/root/flowvpn-cp/src/home-page.js` (live, `chattr +i`) **và** `/root/flowvpn-agent/control-plane/src/home-page.js`; backup `.bak-bus686-20261002-091814`; `flowvpn-cp.service` restart → `active`, `api health=200`.

### Nghiệm thu độc lập (không đọc lại báo cáo)

1. **Từ máy WIN, qua Internet công khai** — `node ops/_scratch/bus686-live-verify.mjs` → **PASS toàn bộ**:
   - 6/6 trang `/ai/buy` đúng href `.exe?v=145f…`; trang chủ đúng overlay `?v=a097…`.
   - Tải THẬT installer: **52.183.737 B**, `content-type application/octet-stream`, md5/sha256 khớp, magic `MZ`, **0** định danh key (`SonioxApiKey|OpenRouterApiKey|OpenAIApiKey|PortableSecret|ProtectedSetting|sk-or-v1-|snx_`).
   - Tải THẬT overlay zip: **73.565.774 B**, md5/sha256 khớp, **0** entry `appsettings*`, **0** định danh key.
2. **Trên node-2, mở zip quét từng entry dll/exe/json/config** — `node ops/_scratch/bus686-verify.mjs` → **PASS**:
   `485 entry · testzip=null · quét 484 file · appsettings*=0 · 0 định danh key`.
3. `sha256sum` trên node-2 của `MeetFlowAI-Setup-latest.exe` + overlay **khớp** hash file build tại máy WIN.
4. `strings` installer công khai: có `Inno Setup Setup Data (6.7.0)`, `grep -c` các định danh key = **0**.

### Tồn / giới hạn (nói thẳng)

- **Cloudflare cache URL BARE** (không `?v=`): HEAD `/dl/MeetFlowAI-Overlay-2.0.0-win-x64.zip`
  còn `cf-cache-status: HIT` bản cũ (`content-length 73.569.240`) tới hết `max-age 14400` (~4h);
  token CF trên node-2 chỉ có `Zone:Read` nên **không purge được**. Mọi link công khai (`/ai/buy`,
  trang chủ) đều mang `?v=<md5>` nên khách **luôn** nhận bản keyless mới.
- **Cài thử installer trên host WIN bị chặn**: `Start-Process … /VERYSILENT` → **exit 4**
  (Application Control policy chặn, như bus-683/685 đã gặp) nên không mở được DLL *đã cài* để quét.
  Bù lại đã quét **chính overlay zip công khai** (chứa cùng `MeetFlowAI.Win.dll` build từ cùng
  publish dir) từng entry — 0 định danh key; installer raw strings cũng 0.
- **Build input installer chưa push**: `tools/installer/appsettings.keyless.json` và
  `tools/installer/MeetFlowAI-bus686.iss` là file build **chưa commit** lên repo private
  `MeetFlowAI_Win` (phiên này sandbox chặn `gh` credential helper cho repo private và không có
  kênh phê duyệt để mở quyền). **Code app vẫn đúng `origin/main@99da3f2`**; artifact đã kiểm chứng.
- **Chủ dự án PHẢI rotate Soniox + OpenRouter key** (2 key cũ đã phơi công khai 02/10).
  Backend đọc key từ `.env` trên node-1 nên sau khi rotate chỉ cần cập nhật `.env` + restart service MeetFlow.
