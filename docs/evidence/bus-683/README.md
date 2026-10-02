# bus-683 — Build bản Windows mới nhất + đóng gói Inno Setup + đưa link lên web

Nguồn: bus **#683** (mac → win, 2026-10-02T08:33:25Z, `kind: task`, yêu cầu từ chủ dự án), kèm
**#685** (link tải trên web phải trỏ `.exe` Inno Setup) và **#686** (bỏ key Soniox/OpenRouter khỏi
client Windows — hướng A: đưa về backend).

## Bối cảnh: nhiều phiên WIN được đánh thức song song

Cùng một đợt, watcher đã đánh thức **nhiều phiên WIN** cho các tin #683/#685/#686
(`ops/tasks/.watch-win.json` → `lastWake`: bus-683 08:33:27Z, bus-685 08:36:56Z, bus-686 08:38:11Z).

- **Phiên A** (phiên này, bắt đầu ~16:33 +08): chép + `ack` **bus-683** lúc 08:39:49Z.
- **Phiên B**: chép + `ack` **bus-685** (08:44:02Z) và **bus-686** (08:43:24Z), đồng thời đang sửa
  source `MeetFlowAI_Win`.

Để không lặp lại **sự cố #684** (hai phiên song song làm lệch metadata artifact), phiên A **không sửa
source C# và không chạy ISCC/upload**; phiên A giữ vai trò **nghiệm thu độc lập** trên trạng thái thật
và ghi lại bằng chứng ở đây. Diễn biến này đã báo MAC qua `progress bus-683` (08:44Z) và phiên B có
tạo khoá phối hợp `ops/_scratch/.lock-publish-win.json`.

## Việc phiên B đã làm (đối chiếu, không phải bằng chứng của phiên A)

| Việc | Giá trị |
|---|---|
| Commit build | `cee56ee` (`fix(security): drop Soniox/OpenRouter keys from Windows client`) |
| Commit HEAD sau đó | `99da3f2` (`chore(security): enforce keyless AppSettings whitelist + scrub doc mentions`) |
| Publish dir | `artifacts/publish/MeetFlowAIInstallerBuild-20261002-164453` (485 file, 0 `appsettings*`) |
| ISCC | `tools/installer/MeetFlowAI-bus685.iss` → exit 0 |
| Artifact | `/var/www/flowvpn/dl/MeetFlowAI-Setup-latest.exe` + `MeetFlowAI-Setup-2.0.0.exe` |
| Web | `appConfig.ai_windows_url` → `https://meetflowai.site/dl/MeetFlowAI-Setup-latest.exe?v=a0b7c78f…` |

`99da3f2` chỉ đụng `AGENTS.md`, `artifacts/fallback-smoke/Program.cs`, `docs/meetflowai-architecture.md`,
`tools/package-overlay.ps1` — **không đổi mã chạy của app**, nên binary build từ `cee56ee` là tương
đương với `99da3f2`.

## Nghiệm thu độc lập của phiên A — `node ops/_scratch/bus683-verify.mjs`

Đo lại từ đầu trên trạng thái thật (không đọc lại báo cáo của phiên B):

| Mục | Kết quả đo |
|---|---|
| File trên node-2 | `MeetFlowAI-Setup-latest.exe` = `MeetFlowAI-Setup-2.0.0.exe` = **52.177.349 B**, `caddy:caddy`, mode 644 |
| Hash | md5 `a0b7c78f5963dda7f5e8d5341a0e7de6`, sha256 `4e832ebff9233b617920a51feb336e88659a39bcd38aa875dacad3643fa095cf` |
| HEAD công khai | `200`, `content-type: application/octet-stream`, `content-length: 52177349` |
| Tải thật qua URL công khai | **52.177.349 B**, md5/sha256 khớp, magic **MZ** (PE), có chuỗi **"Inno Setup"**, 0 marker `SonioxApiKey` / `OpenRouterApiKey` / `sk-or-v1-` |
| `/ai/buy` 5 ngôn ngữ | mặc định (vi), `?lang=en`, `?lang=zh`, `?lang=ja`, `?lang=ko` — **5/5** href `…/MeetFlowAI-Setup-latest.exe?v=a0b7c78f…`, HEAD 200, content-length khớp, không còn link `.zip` |
| Key provider trong input | publish dir: 0 `appsettings*`, 0 marker key; source (git tracked): 0 `SonioxApiKey`/`OpenRouterApiKey`/`PortableSecret` |
| Đã xoá | `Configuration/ProtectedSetting.cs`, `tools/protect-appsettings.ps1` |
| `AppSettings` | chỉ còn `MeetingApiBaseUrl`, `SonioxModel`, `ActivationApiUrl` (không trường key) |

Kết luận: **✅ PASS** — đúng 4 mục của bus-683 và 4 mục verify của bus-685.

## Tồn tại & khuyến nghị

1. **Installer vẫn nhúng `appsettings.json` KEYLESS.** `.iss` stage `..\..\appsettings.json`
   (285 B, chỉ có `SonioxModel`/`OpenRouterChatCompletionsUrl`/`OpenRouterModel`/
   `OpenRouterFallbackModel`/`ActivationApiUrl` — **không có key**) vào `{tmp}` rồi chạy
   `--protect-config`. Không rò secret nên đạt tiêu chí của #685 ("không có appsettings *chứa key
   provider*"), nhưng AGENTS.md lại viết tuyệt đối "Never ship `appsettings.json` in a published
   artifact". Vì `AppSettings` nay đã có default đủ dùng, cách sạch hơn là: cho
   `SecureConfigurationFile.Load` chịu được thiếu `appsettings.dat` rồi **bỏ hẳn** 2 dòng stage
   config trong `.iss` → installer không còn config nào. (2 trường `OpenRouter*` trong file stage là
   schema cũ, đã chết.)
2. **Chưa cài thử thật được trên máy này.** Chạy `MeetFlowAI-2.0-Setup.exe /VERYSILENT
   /SUPPRESSMSGBOXES /NORESTART /DIR=<temp> /LOG=…` → **exit 4**: Inno dừng ở
   `Error creating registry key: RegCreateKeyEx failed; code 5 (Access is denied)` rồi rollback
   (đã xoá sạch thư mục cài). Máy WIN còn **Application Control policy** chặn nạp DLL build trong
   workspace/TEMP. ⇒ Bước 5–7 của Release Workflow (cài + mở app + `Responding=True`) **chưa có bằng
   chứng**; cần chủ dự án/MAC cài thử trên máy sạch.
3. **File build tạm chưa commit**: `MeetFlowAI.Win/tools/installer/MeetFlowAI-bus685.iss` (untracked).
   Nên xoá hoặc đưa vào `.gitignore`/commit cho gọn.
4. **Chủ dự án vẫn phải ROTATE Soniox + OpenRouter** — key cũ đã phơi công khai ở bản 02/10 15:07.
5. **Nhắc lại cơ chế chống chạy chồng**: nên có khoá single-flight cho bước *build + upload* (phiên B
   đã tự tạo `.lock-publish-win.json`, nhưng chưa có gì cưỡng chế).

## Lệnh nghiệm thu

```bash
node ops/_scratch/bus683-verify.mjs        # → ✅ PASS (exit 0)
curl -sIL 'https://meetflowai.site/dl/MeetFlowAI-Setup-latest.exe'   # 200 / octet-stream / 52177349
curl -s  'https://meetflowai.site/ai/buy?lang=zh' | grep -o 'MeetFlowAI-Setup[^"]*'
```
