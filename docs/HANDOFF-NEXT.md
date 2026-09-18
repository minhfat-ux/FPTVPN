# Bàn giao — tiếp tục ở session mới

Ngày: 2026-09-18 · Nguồn: DSH Windows, workspace `C:\Users\Minhn\FlowTech AI`
Trạng thái: **production đang chạy bình thường**, nhưng có 1 lỗ bảo mật đang mở và 1 việc hạ tầng cần chốt.

> Đọc hết file này trước khi làm gì. Có 3 chỗ nếu làm theo bản năng sẽ **phá production**.

---

## 0. BA ĐIỀU KHÔNG ĐƯỢC LÀM SAI

### 0.1 App đã đổi tên thành fBuddy — `flowgpt.service` đã chết

| | |
|---|---|
| Tiến trình đang chạy | **`fbuddy.service`** — `WorkingDirectory=/opt/fbuddy`, port **7790**, env prefix **`FBUDDY_*`** |
| `flowgpt.service` | **inactive (dead) + disabled** |
| `/opt/flowgpt` | bản cũ, **không phục vụ gì** |
| Dữ liệu | `/var/lib/fbuddy/fbuddy.db` (md5 `cb5d6964fbab5b84ca38044e4fc750b1`) — **giống hệt** `/var/lib/flowgpt/flowgpt.db` |
| Caddy | **cả** `flowgpt.meetflowai.site` **và** `fbuddy.meetflowai.site` → `127.0.0.1:7790` |

Bằng chứng: `GET https://flowgpt.meetflowai.site/api/meta` trả `"appName":"fBuddy"`; `<title>` là `fBuddy — Trợ lý AI đa năng`.

**⇒ `deploy/deploy.ps1` hiện nhắm `/opt/flowgpt` — deploy vào đó KHÔNG lên sóng.**

### 0.2 Deploy phải dùng code ĐÃ PULL từ `origin/flowgpt`

`/opt/fbuddy` là **fork đã đổi tên** so với repo này **ở trạng thái cũ**:

- **22 file khác nội dung**, chỉ 15 file giống; thêm file mới `server/src/skills/skillhub.js`
- có **route SePay** (`grep -c sepay src/routes.js` = 15) mà bản cũ **không có** (`= 0`)
- env đổi `FLOWGPT_*` → `FBUDDY_*`, DB `flowgpt.db` → `fbuddy.db`

**Nhưng fork đó NẰM TRONG GIT** — trên `origin/flowgpt`, do harness Mac commit:

```
559d20d docs(mobile): bo tai lieu + template de dung app iOS & Android cho fBuddy
646aba2 feat(chat): avatar tro ly trong khung chat dung logo fBuddy (icon Culi)
175fefb fix(brand): icon Culi hien ngay — cache-busting + bo immutable cho logo/favicon
655d73e feat(brand): dung icon Culi lam logo + icon chinh cua fBuddy
44d8d9c feat(fbuddy): doi ten FlowGpt -> fBuddy + vien SePay + client SkillHub + va loi khoa ma hoa
```

Sai lầm của session trước: checkout local đang **tụt 5 commit** so với `origin/flowgpt`, nên bản local là code FlowGpt cũ
⇒ suýt kết luận "phải tar bản cũ đè lên `/opt/fbuddy`". **Đã rebase xong, local giờ bằng `origin/flowgpt`.**

**⇒ Quy tắc: `git pull` trước, rồi hãy deploy.** Deploy code đã pull vào `/opt/fbuddy` là ĐÚNG.
Deploy từ checkout cũ là **mất rebrand fBuddy + skill hub + SePay**, và nhiều khả năng chết vì thiếu `FBUDDY_SECRET`.

Remote còn có nhánh `origin/harness` và `main` đã được cập nhật (`03817f0..771eb8c`) — kiểm tra nhánh nào mới nhất
trước khi làm tiếp.

### 0.3 Thư mục deploy không phải git repo, nhưng nguồn thì có

`git -C /opt/fbuddy log` → `fatal: not a git repository` (chỉ là thư mục deploy).
**Nguồn thật = `origin/flowgpt`.** Nên xác nhận `/opt/fbuddy` đang khớp commit nào trước khi sửa.

---

## 1. Lỗ bảo mật `/tmp-key` — ĐÃ VÁ MỘT PHẦN (2026-09-18 chiều)

**Nguyên nhân gốc:** backend `api.meetflowai.site/meetflow` (VPS **103.173.155.50**, service
`meetflow-backend`, code `/opt/meetflow/backend/server.js`, repo `minhfat-ux/MeetFlowAI`) chạy với
`ALLOW_UNAUTHENTICATED_CLIENTS=true`. Cờ này **cố ý** có để app vẫn dùng được khi thiết bị không lấy
được Firebase token (mạng bị chặn — khách Trung Quốc), nhưng nó mở cho **mọi** route, nên người lạ
`curl` một phát là nhận temp key Soniox thật (log 18/09 12:45 xác nhận: `curl/8.21.0` → 201).

**Đã vá (đã deploy + kiểm chứng):**

| Việc | Kết quả kiểm chứng |
|---|---|
| `/summary`, `/chat`, `/tts` (route đốt key LLM) **bắt buộc đăng nhập** | ẩn danh ⇒ **401** `This endpoint requires a signed-in account.` |
| Token rác trên `/tmp-key` | ⇒ **401** `Invalid Firebase ID token.` |
| Đường ẩn danh của `/tmp-key` (giữ cho khách bị chặn mạng) có **hạn mức ngày** | 20/IP/ngày, 100/ngày toàn cục; đo thật: gọi 5 lần liên tiếp ⇒ 201×4 rồi **429** |

Số liệu để chọn hạn mức (đếm 30 ngày log): khách ẩn danh chỉ ~0,5 lượt/ngày, còn `MeetFlowAI_iOS`
và `okhttp` thật có rơi vào nhánh ẩn danh (nên **không được tắt cờ ngay** — sẽ làm hỏng khách).

**Đóng hẳn thì cần một bản phát hành app** (chủ dự án quyết):

1. Đặt `CLIENT_APP_SECRET=<chuỗi ngẫu nhiên>` trong `/opt/meetflow/backend/.env` → đường ẩn danh
   không có header `X-MeetFlow-Client` sẽ bị 401.
2. App bản mới gửi kèm header đó: iOS thêm `request.setValue(secret, forHTTPHeaderField: "X-MeetFlow-Client")`
   trong `sendAuthorized` (`FChinaTranslator/Services/BackendAPIClient.swift`); Android thêm
   `.header("X-MeetFlow-Client", BuildConfig.CLIENT_APP_SECRET)` trong interceptor
   (`data/remote/BackendApiClient.kt`, kèm field trong `build.gradle.kts`). **Chưa làm** — cố ý,
   vì sửa client mà không build/chạy thử được thì rủi ro hơn là ghi rõ ra đây.

**Không cần xoay key** (chủ dự án chốt): key Soniox/OpenAI/DeepSeek/OpenRouter vẫn chỉ nằm ở server,
không lộ ra client; temp key là key dẫn xuất, ngắn hạn. File `.env.example` đã ghi cảnh báo về cờ
này + hai biến hạn mức — trước đây cờ nguy hiểm đó **không hề được ghi trong tài liệu**.


---

## 2. Đã làm xong và đã kiểm chứng

### 2.1 Trang chủ `meetflowai.site` (khác app — đây là control plane `flowvpn-cp`, port 7778)

File nguồn: **`/root/flowvpn-cp/src/home-page.js`** (không có trong git; chỉ có backup `.bak-*` trên server).
Bản làm việc local: `C:\Users\Minhn\FlowTech AI\_flowvpn-cp\home-page.js`.

| Việc | Trạng thái |
|---|---|
| Áp theme popup (navy radial + quầng sáng, viền gradient 1px, nút gradient, `sig-rise`) | ✅ đã deploy |
| Logo FlowTech thật ở header (`/assets/flowtech-mark.png`, thay ô vuông xanh giả) + favicon + apple-touch-icon | ✅ |
| Dòng dưới tên FlowTech → **"AI Ecosystem"** (cả 5 ngôn ngữ) | ✅ |
| Hero → **sứ mệnh** (AI cho network/education/utilities, productivity, "hai anh em cùng phát triển") | ✅ |
| Products dựng lại theo card `.fg-prod` của popup fbuddy (ô logo + tên + nhãn gradient + mô tả + bullets + nút) | ✅ |
| Đủ **5 sản phẩm, mỗi app một logo**: VPNFlow, MeetFlow AI, FlowTech Harness, **fBuddy** (mới), **SuperMom AI** (mới) | ✅ |
| **Bỏ hẳn section Pricing** (+ link nav + hàm `pricingHTML`) | ✅ |
| Card MeetFlow AI có đủ link tải (xem 2.2) | ✅ |

**Logo từng app** (route `/assets/:file` của control plane, allow-list ở `src/index.js`):
`vpnflow-logo.png`, `meetflow-logo.png`, `flowtech-icon.png`, `fbuddy-logo.png`, `supermom-logo.png`

**Icon app thật** lấy từ: `flowtech-mark/icon.png` (mark cánh), `flowvpn-logo.png` (khiên), `meetflow-logo.png` (chữ M),
`fbuddy-logo.png` (mascot CULI — nguồn là WebP đặt tên `.png`, đã convert sang **PNG thật** bằng canvas trong Chrome),
`supermom-logo.png` (mẹ + bóng đèn, nén 1024→256px, 1.85 MB → 161 KB).

### 2.2 MeetFlow AI — link tải trên card

| Nền tảng | Link | Nhãn |
|---|---|---|
| iOS | `https://apps.apple.com/app/id6765590042` | App Store |
| macOS | cùng link | App Store (macOS) |
| Windows | `https://meetflowai.site/dl/MeetFlowAI-Overlay-latest-win-x64.zip` | Windows (overlay) |
| Android | `https://api.meetflowai.site/v1/ai/downloads/android` | Android (APK) |

**Không có chữ IPA** ở card MeetFlow (đúng yêu cầu); card VPNFlow vẫn phát IPA như cũ. Có test canh riêng cho cả hai
(`_flowvpn-cp/check-meetflow-dl.mjs`).

⚠️ **Hai App Store id khác nhau, đừng lẫn**: SuperMom AI = `id6768231353`, MeetFlow AI = `id6765590042`
(bundle `FPT-China.FChinaTranslator`, tra từ repo `minhfat-ux/MeetFlowAI`).

### 2.3 Bản Windows overlay — đã build và đã lên sóng

Nguồn: `C:\Users\Minhn\FPTVPN\MeetFlowAI_Win` (WPF, .NET 8, overlay phụ đề song ngữ qua Soniox).

```bash
dotnet publish MeetFlowAI.Win/MeetFlowAI.Win.csproj -c Release -r win-x64 --self-contained true -o <out>
# → 162 MB, nén zip 68 MB
```

Đã upload (verify: HTTP 200, `application/zip`, 71.363.017 bytes, magic `50 4b 03 04`):
- `https://meetflowai.site/dl/MeetFlowAI-Overlay-2.0.0-win-x64.zip`
- `https://meetflowai.site/dl/MeetFlowAI-Overlay-latest-win-x64.zip`

Không có file cài `.exe` vì máy này **không có Inno Setup** (script `.iss` có sẵn nhưng chưa compile được) ⇒ phát hành zip,
khách giải nén chạy `MeetFlowAI.Win.exe`. App hiện **bắt khách tự nhập key** ⇒ đây chính là lý do phải làm mục 3.

---

## 3. Việc đang làm dở — backend riêng cho bản Windows

### 3.1 Quyết định đã chốt với chủ dự án

| Câu hỏi | Chốt |
|---|---|
| Bảo vệ key | **Mức 3** — app Windows **không giữ key**, đi qua backend của mình, thu hồi được |
| Đơn nào mở khoá | **Mọi đơn `status = "paid"`** (ghi kèm `order_id` để sau siết thành gói riêng thì đổi 1 chỗ) |
| Kênh gửi | **Email tự động** khi đơn thành `paid` **+** trang `?view=desktop` xem lại |
| Backend | **Làm backend RIÊNG cho Windows**, không đụng backend `/meetflow` của bản Mac |

### 3.2 Kiến trúc

```
App Windows (không key, không biết Soniox)
   │  mã kích hoạt trong email → token phiên
   ▼
desk service MỚI   ← key Soniox + OpenRouter RIÊNG của bản Windows
   │  đọc đơn đã "paid" để quyết định quyền (chỉ ĐỌC DB)
   │  WS proxy PCM → Soniox · /summary → OpenRouter
   ▼
Soniox / OpenRouter
```

Tách 3 lớp để "tránh đụng bản Mac": **tiến trình riêng** (port riêng, systemd unit riêng) ·
**key Soniox riêng** (xoay key bên này không chết bên kia, lộ cũng không đụng quota bản Mac) ·
**tên miền riêng** (block Caddy riêng, không sửa Caddyfile của `api.meetflowai.site`).

Tên tạm đề xuất (chưa chốt): service `flowdesk`, host `desk.meetflowai.site`, port `7791`.

### 3.3 Điểm cắm duy nhất

`/opt/fbuddy/server/src/topup.js` → **`confirmTopupOrder()`**, nhánh `status: "paid"` (dòng ~198).
Hàm này **đã idempotent** (gặp đơn `paid` thì trả `alreadyPaid: true` và thoát ở dòng ~187) nên webhook trùng /
poll trùng / duyệt Telegram 2 lần đều **không gửi email 2 lần**.

Cả **4 đường** xác nhận thanh toán đều đi qua đây (đã kiểm trong code live):
duyệt Telegram · link ký HMAC · SePay webhook (`applyTransaction`) · SePay poll.

### 3.4 Endpoint của service mới

| Endpoint | Việc |
|---|---|
| `POST /v1/desktop/activate` | dán mã trong email → token phiên ngắn hạn |
| `POST /v1/desktop/session` | gia hạn token |
| `WS /v1/desktop/stt` | proxy PCM 16 kHz mono → Soniox, key ở server |
| `POST /v1/desktop/summary` | gọi OpenRouter, key ở server |
| `GET /v1/desktop/health` | sống/chết |

Bảng `desktop_activations`: `user_id`, `order_id`, `code_hash`, `issued_at`, `revoked_at`, `last_seen_at` (thu hồi được).

### 3.5 Phải có NGAY từ bản đầu (đừng để sau)

Vì đây là endpoint lộ ra internet — **không lặp lại lỗi `/tmp-key`**:

- Auth thật cho mọi route (trừ `/health`)
- Rate limit theo IP + theo tài khoản, **hạn mức audio/tháng mỗi user**
- Token phiên ngắn hạn, thu hồi được, log mọi lần cấp quyền
- **Không bao giờ** trả key Soniox/OpenRouter nguyên văn ra client

### 3.6 Thứ tự làm

1. Service mới + đọc quyền từ đơn `paid` + bảng `desktop_activations` + `/health` (chạy được, có test)
2. Email tự động (thêm `sendDesktopActivation()` vào `mailer.js`, dùng lại sender Resend) + trang `?view=desktop`
3. WS proxy Soniox + `/summary`
4. Sửa app WPF: bỏ 2 ô key, thêm ô dán mã kích hoạt, trỏ về service mới
5. Deploy Caddy + systemd riêng, kiểm chứng một phiên thật đầu-cuối

### 3.7 Trạng thái sau khi tiếp nhận bàn giao (session 2026-09-18 chiều)

Tên đang dùng (tạm, **chưa chốt với chủ dự án**): service **`flowdesk`**, port **7791**,
host **`desk.meetflowai.site`** — tất cả đọc từ env nên đổi tên chỉ là đổi env + DNS.

**Đã xong 1, 3, phần lõi của 2 và 4. Còn 5 (cần key riêng + DNS) và view SPA của 2.**

| Việc | Ở đâu | Bằng chứng |
|---|---|---|
| Service mới (node:http + node:sqlite + `ws`; không express) | `desk/src/*.js` | `desk/test/` — **55 test xanh** |
| Quyền đọc từ `fbuddy.db` **read-only**, đơn `status='paid'` | `desk/src/entitlement.js` | `desk/test/entitlement.test.js` |
| Bảng mã kích hoạt / thiết bị / mức dùng / audit | `desk/src/db.js` (`desk_invitations`, `desk_activations`, `desk_usage`, `desk_audit`) | `desk/test/codes.test.js`, `activations.test.js` |
| Token phiên ký HMAC, thu hồi **hiệu lực ngay** | `desk/src/sessions.js` | `desk/test/activations.test.js` |
| Rate limit + chặn dò mã theo IP | `desk/src/ratelimit.js` | `desk/test/http.test.js` (429) |
| WS proxy Soniox: bỏ `api_key` client, chèn key thật, che key trong phản hồi | `desk/src/stt.js` | `desk/test/phase3.test.js` (Soniox giả) |
| `/summary` → OpenRouter: key ở server, model do server chọn, trần ký tự | `desk/src/summary.js` | `desk/test/phase3.test.js` |
| Hook khi đơn thành `paid` (chạy nền, không phá luồng cộng credit) | `server/src/topup.js` + `server/src/desktop.js` | `server/test/desktop.test.js` — có ca "flowdesk chết nhưng thanh toán vẫn xong" |
| Email mã kích hoạt | `server/src/mailer.js` → `sendDesktopActivation()` | `server/test/desktop.test.js` |
| Trang xem lại mã **không cần đăng nhập** (link ký HMAC 30 ngày) | `GET /api/desktop?u=&t=`, `POST /api/desktop/code`, `GET /api/desktop/status` | `server/test/desktop.test.js` |
| View **`?view=desktop`** trong web app + thu hồi thiết bị của chính mình | `web/src/desktop/DesktopPage.tsx`, `App.tsx`, `components/Sidebar.tsx`, `api/client.ts`, i18n `shell.ts` (vi/en/zh) | `POST /api/desktop/activations/:id/revoke` có test; `tsc --noEmit` sạch; view có trong bundle đã build |
| Cài đặt tự động | `deploy/flowdesk.service`, `deploy/flowdesk-remote-setup.sh`, `deploy/deploy.ps1 -WithDesk` | chưa chạy thật (mục 5) |

Chạy test (Windows trong sandbox DSH — `node --test` bị chặn spawn tiến trình con):

```bash
node --test --test-isolation=none desk/test/*.test.js          # 56/56
node --test --test-isolation=none server/test/desktop.test.js  # 9/9
npx --prefix web tsc --noEmit -p web                           # sạch (0 lỗi)

# App Windows (C#) — smoke thật, cần service flowdesk đang chạy:
#   DESK_SONIOX_WS trỏ vào một Soniox giả, rồi:
DESK_URL=http://127.0.0.1:7791 DESK_CODE=FBW-.... dotnet run --project MeetFlowAI.Win/artifacts/desk-smoke
```

Còn thiếu để khách dùng được thật:

1. ~~**§3.6.4 app WPF**~~ — **xong ngày 2026-09-18 chiều** (xem §3.8). Còn lại: build lại zip
   và phát hành **sau khi** service đã lên (phát trước là khách tải bản không chạy được).
2. **§3.6.5 deploy** — tạo `/etc/flowdesk/flowdesk.env` (key Soniox/OpenRouter **riêng**
   cho bản Windows), thêm DNS `desk`, rồi `.\deploy\deploy.ps1 -WithDesk`.
   Nhớ thêm `FBUDDY_DESK_URL` + `FBUDDY_DESK_ADMIN_TOKEN` vào `/etc/fbuddy/fbuddy.env`
   rồi restart fbuddy, nếu không fBuddy sẽ không phát mã khi đơn thành `paid`.
3. ~~**View `?view=desktop`** trong web app~~ — **xong 2026-09-18 chiều**: `web/src/desktop/DesktopPage.tsx`
   (tải app, lấy mã kích hoạt, danh sách thiết bị + thu hồi), vào từ sidebar "Bản Windows" hoặc
   `?view=desktop`, i18n đủ vi/en/zh, route thu hồi `POST /api/desktop/activations/:id/revoke`
   (chỉ thiết bị của chính mình — có test). **Chờ deploy** mới lên sóng.
4. Lỗ bảo mật `/tmp-key` (§1) **vẫn đang mở** — không sửa được từ repo này.

### 3.8 §3.6.4 — app WPF đã bỏ key, dùng mã kích hoạt (2026-09-18 chiều)

Repo app: `C:\Users\Minhn\FPTVPN\MeetFlowAI_Win` — **LƯU Ý: thư mục này vẫn CHƯA nằm trong git
của FPTVPN** (`git status` ở `C:\Users\Minhn\FPTVPN` hiện `?? MeetFlowAI_Win/`). Nên đưa lên
git trước khi phát hành tiếp, nếu không sẽ lặp lại đúng vấn đề của `/opt/fbuddy`.

| File | Thay đổi |
|---|---|
| `Configuration/AppSettings.cs` | Bỏ `SonioxApiKey`, `OpenRouterApiKey`, `OpenRouterChatCompletionsUrl`, `OpenRouterModel`, `OpenRouterFallbackModel`, `ActivationApiUrl`; thêm `DeskBaseUrl` (mặc định `https://desk.meetflowai.site`) |
| `Configuration/SecureConfigurationFile.cs` | Thiếu `appsettings.dat` thì chạy bằng giá trị mặc định thay vì **ném lỗi làm app chết ngay khi mở** |
| `Services/IActivationService.cs` | Thêm `GetSessionTokenAsync()` |
| `Services/ActivationService.cs` | Viết lại: gọi flowdesk `/v1/desktop/activate` + `/session`; lưu mã bằng **DPAPI** và token phiên vào `license.json`; tự gia hạn/tự kích hoạt lại khi token hết hạn; dịch mã lỗi (`code_expired`, `device_revoked`, `not_entitled_*`…) sang câu tiếng Việt. **Bỏ** `IsAutoActivatedMachine()` (miễn kích hoạt theo tên máy) và **bỏ** kiểu tự ký license bằng secret nhúng trong app |
| `Services/SonioxRealtimeClient.cs` | Nối `wss://<desk>/v1/desktop/stt` kèm `Authorization: Bearer <token>`; cấu hình phiên **không còn `api_key`**; dịch lỗi 401/403/429 khi nâng cấp giao thức |
| `Services/MeetingSummaryService.cs` | Gọi `POST /v1/desktop/summary` (key ở server, model do server chọn); bỏ vòng lặp thử nhiều model phía client |
| `artifacts/desk-smoke/` | Project smoke mới: kích hoạt thật → token → `/v1/desktop/me` → mở phiên STT qua proxy |

**Bằng chứng đã chạy (không phải kể lể):**

```
dotnet build -c Release                          → Build succeeded, 0 warning, 0 error
dotnet run --project artifacts/desk-smoke        → SMOKE PASS (9/9 mục)
  OK  chưa kích hoạt ⇒ báo chưa kích hoạt
  OK  mã sai ⇒ từ chối kèm thông báo dễ hiểu
  OK  mã đúng ⇒ kích hoạt được (phiên đến 15:15)
  OK  token phiên dài 225, được /v1/desktop/me chấp nhận (HTTP 200)
  OK  mở phiên nhận dạng qua proxy KHÔNG cần key trong app
  OK  nhận phụ đề: "xin chào|hello"
  OK  cấu hình Soniox giả nhận được CHỈ có api_key của server, không có key nào từ app
```

Bản cũ đã phát hành (zip trên `meetflowai.site/dl/`) vẫn dùng key khách tự nhập ⇒ **đừng phát
hành bản mới trước khi flowdesk lên sóng**, nếu không khách tải về sẽ không kích hoạt được.



---

## 4. Việc còn treo khác

1. ~~**Popup fbuddy 3 ngôn ngữ theo region** (vi/en/zh)~~ — **xong 2026-09-18 chiều**, xem §4b.
   (Đang chờ deploy: bản trên sóng vẫn là promo.js cũ một thứ tiếng.)
2. **Luồng cấp key qua trang buy** — backend + email đã xong (xem §3.7); còn app WPF (§3.6.4),
   deploy thật (§3.6.5) và view `?view=desktop` trong web app.
3. ~~**Xác nhận `/opt/fbuddy` khớp commit nào của `origin/flowgpt`**~~ — **đã kiểm bằng md5 (2026-09-18 chiều)**:
   `/opt/fbuddy` (trừ `web/dist/` là bản build) **giống hệt `72c7779`**, đúng 1 khác biệt: các chỗ
   `brand-mark.png?v=` trên server là **`culi2`**, trong repo là `culi1` — tức là bản bump cache đã
   được sửa **trực tiếp trên server** mà chưa từng commit. **Đã đưa `culi2` vào repo** (5 chỗ:
   `server/src/topup.js`, `server/src/mailer.js`, `server/src/credit-requests.js`, `web/public/promo.js`,
   `web/index.html`), nếu không lần deploy tới sẽ revert về `culi1` và **logo cũ quay lại từ cache CDN**.
   Cách kiểm lại: `md5sum` file trên server (byte thô, LF) so với `git show <rev>:<path> | md5sum`.
4. Treo từ trước: voice chống trễ (chủ dự án dặn "đừng làm vội") · SSO Firebase/Facebook · đăng ký email+mật khẩu ·
   MCP `stdio` không test được từ sandbox Windows.

---

### 4b. §4.1 — popup quảng cáo 3 thứ tiếng (vi/en/zh) theo vùng — xong 2026-09-18 chiều

| Việc | Ở đâu |
|---|---|
| Bảng chuỗi 3 thứ tiếng (17 khoá × 3) + `pickLanguage()` + `t()` | `web/public/promo.js` |
| Bản **được phục vụ** | `web/dist/promo.js` — đã copy y hệt; deploy có build sẽ tạo lại từ `public/` |
| Bump cache | `web/index.html` + `web/dist/index.html`: `?v=20260918a` (trước là `20260917b`) |
| Script canh chuỗi | `ops/promo-i18n-check.mjs` |
| Script canh render | `ops/promo-render-check.mjs` |

`ops/promo-i18n-check.mjs` kiểm những thứ mắt thường bỏ qua: đủ khoá ở cả 3 thứ tiếng, **các thứ
tiếng phải KHÁC nhau** (đúng loại lỗi đã từng xảy ra: mọi thứ tiếng nhận tiêu đề tiếng Anh), `en`
không lẫn dấu tiếng Việt/chữ Hán, `zh` phải có chữ Hán, placeholder `{os}` còn nguyên, **không còn
chữ tiếng Việt hardcode ngoài bảng STRINGS**, và `web/dist/promo.js` phải giống `web/public/promo.js`
(hai bản này từng lệch nhau mà không ai biết).

`ops/promo-render-check.mjs` chạy nguyên `promo.js` trong DOM giả rồi đọc chữ đã render — bắt được
cả lỗi ở khâu chọn thứ tiếng.

Thứ tự chọn thứ tiếng (cố ý, test đã khoá lại):

1. **Múi giờ VN/TQ thắng** — vì khách Việt/Trung rất hay để trình duyệt `en-US`; nếu để ngôn ngữ
   thắng thì họ mãi chỉ thấy tiếng Anh, đúng vấn đề của bản cũ.
2. Ngôn ngữ trình duyệt nếu là `vi`/`zh`/`en`.
3. Còn lại: `en`.

```bash
node ops/promo-i18n-check.mjs     # I18N OK — 3 thứ tiếng, 17 khoá, dist == public
node ops/promo-render-check.mjs   # RENDER OK — 8 kịch bản (vi/en/zh/fr + đoán theo múi giờ)
```

⚠️ **Chưa lên sóng**: bản đang phục vụ trên VPS vẫn là `promo.js` cũ (một thứ tiếng). Phải deploy
(`deploy.ps1`, có build web) mới có hiệu lực. Nếu deploy bằng `-SkipBuild` thì `web/dist/*` trong
repo đã có sẵn bản mới nên vẫn đúng.

---

## 5. Bẫy đã vấp — đừng vấp lại

- **PowerShell 5.1 `Get-Content`/`Set-Content` lên file có tiếng Việt ⇒ mojibake.** Dùng công cụ file (read/write)
  hoặc `[System.IO.File]::WriteAllText(..., UTF8Encoding($false))`. Đã tự làm hỏng 1 file vì lỗi này.
- **`process.exit()` ngay sau `fetch` ⇒ crash libuv trên Windows** (`exit -1073740791`). Dùng `process.exitCode`.
- **Đừng viết script sửa file bằng regex có bộ đếm rồi quên tăng bộ đếm đúng chỗ** — đã một lần làm **cả 5 ngôn ngữ
  nhận tiêu đề tiếng Anh**, phải viết script kiểm tra riêng mới phát hiện. Luôn viết script assert + kiểm tra
  "5 ngôn ngữ phải KHÁC NHAU".
- **Neo regex vào giá trị cụ thể**, đừng neo vào tên khoá chung: một lần neo `windows: "` làm bộ đếm thành 6 vì
  khối vừa chèn cũng khớp. Neo `windows: "Windows 10/11"` mới đúng.
- **`pwsh` không có trên PATH** — gọi `& ".\deploy\deploy.ps1"`, đừng `pwsh -File`.
- **`git ls-remote` dùng được credential đã cache** ⇒ đọc được cả repo **private** (`MeetFlowAI`, `SuperMomAI`).
  `gh` CLI **không có**. API GitHub trả 404 với repo private.
- **Telegram**: dùng `ops/send-telegram.ps1 -MessageFile ops/messages/<file>.txt` (đọc UTF-8 tường minh, base64,
  so khớp lại với bản Telegram nhận được). Đừng tự `Get-Content -Raw` rồi gửi.
- **Quoting JSON qua `ssh`/PowerShell hay bị phá** ⇒ viết script ra file rồi `scp` sang, hoặc base64:
  `$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content f -Raw)))`.
- **`tr -d "\r"` qua `ssh` từ PowerShell bị PowerShell nhân đôi dấu `\`** ⇒ `tr` xoá cả chữ `r` và dấu `\`
  trong file, ra hash rác. So hash thì dùng Node `execFileSync("ssh", [...])` (giữ nguyên byte) hoặc
  `md5sum` trần, đừng normalize kiểu đó.
- **Sửa gì trên server thì phải commit lại vào repo.** Đã có chuyện bump cache `?v=culi1 → culi2` chỉ
  nằm trên `/opt/fbuddy` (5 file), repo vẫn `culi1` ⇒ deploy là revert, logo cũ quay lại.
- **`web/dist/` trong repo là bản build cũ** (từng còn tiêu đề "FlowGpt" trong khi nguồn đã là "fBuddy").
  Deploy bằng `-SkipBuild` là đẩy bản mục đó lên sóng. `ops/promo-i18n-check.mjs` canh cả việc này
  (tiêu đề dist phải khớp `web/index.html`, `dist/promo.js` phải giống `public/promo.js`).

---

## 6. Đường dẫn & lệnh hay dùng

```bash
# Test + build
node --test "server/test/*.test.js"        # 168/168 pass (ở thời điểm bàn giao)
npm --workspace web run build

# Production
ssh root@165.101.114.162
systemctl is-active fbuddy flowgpt          # fbuddy active, flowgpt inactive
journalctl -u fbuddy -f
FLOWGPT_DATA_DIR=/var/lib/flowgpt node ops/db-peek.mjs   # xem nhanh DB (script ở flowgpt/ops)
```

| Thứ | Ở đâu |
|---|---|
| App fBuddy (live) | `/opt/fbuddy` · systemd `fbuddy` · port 7790 · env `/etc/fbuddy/fbuddy.env` |
| DB live | `/var/lib/fbuddy/fbuddy.db` |
| Control plane (trang chủ) | `/root/flowvpn-cp` · systemd `flowvpn-cp` · port 7778 · `src/home-page.js` |
| Static tải app | `/var/www/flowvpn/dl/` (Caddy phục vụ tại `/dl/`) · assets ở `/root/flowvpn-cp/assets/` |
| Backup để rollback | `/root/flowvpn-cp/src/home-page.js.bak-theme-*`, `.bak-products-*`, `.bak-meetflowdl-*`, `src/index.js.bak-*` |
| Token admin | `%TEMP%\admin-token.txt` (Windows), mint bằng `auth.issueToken` cho `minhnb2@fpt.com`. **Không in ra.** |

Thư mục tạm trong workspace (chủ dự án cho phép xoá): `_flowvpn-cp` (bản làm việc trang chủ),
`_meetflow` (repo Apple), `_supermom` (repo SuperMom), `_live-fbuddy` (code live tải về để so),
`_meetflow-win-build` (+ zip 68 MB).

## 7. Tài khoản & cấu hình

- Production: `minhnb2@fpt.com` (admin, 100000 credit), `minhnb2@me.com`, `tranhoangnam081215@gmail.com`,
  `minhfat@gmail.com`, `chiaki04052014@gmail.com`
- Đơn giá đang chạy: `creditsPerToken 0.06` × `vndPerCredit 1` ⇒ **1 lượt chat ≈ 210đ** (đo thật 60 lượt:
  median 3.160 token). Kỹ năng chợ = **50.000đ** mỗi kỹ năng. Tặng đăng nhập 10.000 credit.
- `creditsPerToken` là **số thập phân** — ô trên control panel phải dùng `decimalOr`, `intOr` sẽ làm tròn thành 0
  và **mọi lượt chat miễn phí**.
