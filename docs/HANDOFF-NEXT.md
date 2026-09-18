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

### 3.7 §3 (backend riêng cho bản Windows) — **ĐÃ BỎ**, chủ dự án chốt 2026-09-18 chiều

Chủ dự án quyết định: **mọi bản Windows vẫn để khách tự nhập key** Soniox/OpenRouter. Hướng
"app không giữ key, đi qua backend riêng" là **sai hướng** và đã được **xoá hẳn khỏi repo**:

| Đã xoá | Ghi chú |
|---|---|
| `desk/` (service flowdesk + test + README) | xoá cả thư mục |
| `server/src/desktop.js`, `server/test/desktop.test.js` | cầu nối fBuddy → flowdesk |
| `sendDesktopActivation()` trong `server/src/mailer.js` | email mã kích hoạt |
| Hook `queueDesktopActivation` trong `server/src/topup.js` | phát mã khi đơn thành `paid` |
| Các route `/api/desktop*` trong `server/src/routes.js` | gồm cả trang công khai |
| `web/src/desktop/` + nav/topbar/i18n/api client trong web | view `?view=desktop` |
| `deploy/flowdesk.*` + `deploy.ps1 -WithDesk` | cài đặt service riêng |

**Chưa từng lên production** (đã kiểm md5: `/opt/fbuddy` vẫn là bản cũ), nên không có gì phải
hoàn nguyên trên server.

Bài học giữ lại: thiết kế đã bàn với chủ dự án vẫn có thể đổi — **xác nhận lại trước khi làm cả
một chuỗi 5 bước**, và đừng để một hướng mới "gần xong" rồi mới phát hiện là sai hướng.

### 3.8 App Windows — trạng thái hiện tại: **vẫn nhập key** (đã hoàn nguyên)

| File | Trạng thái |
|---|---|
| `Configuration/AppSettings.cs` | Có `SonioxApiKey`, `OpenRouterApiKey`, `OpenRouterChatCompletionsUrl/Model/Fallback`, `ActivationApiUrl` |
| `Services/SonioxRealtimeClient.cs` | Nối thẳng `wss://stt-rt.soniox.com/transcribe-websocket`, gửi `api_key` của khách |
| `Services/MeetingSummaryService.cs` | Gọi thẳng OpenRouter bằng key của khách |
| `Services/ActivationService.cs` + `IActivationService.cs` | Cơ chế cũ (license lưu máy + `ActivationApiUrl`) |
| `Configuration/SecureConfigurationFile.cs` | Yêu cầu có `appsettings.dat` (như cũ) |
| `artifacts/desk-smoke/` | đã xoá (project smoke của hướng cũ) |

Bằng chứng: `dotnet build -c Release` → **0 warning / 0 error**; chuỗi trong DLL có `SonioxApiKey`,
`OpenRouterApiKey`, `ActivationApiUrl` và **không có** `desk.meetflowai.site` — **giống bản zip
đang phát hành** (`_meetflow-win-build`).

⚠️ `C:\Users\Minhn\FPTVPN\MeetFlowAI_Win` **vẫn chưa nằm trong git** của FPTVPN
(`git status` ở `C:\Users\Minhn\FPTVPN` hiện `?? MeetFlowAI_Win/`). Lần này phải hoàn nguyên
bằng tay vì không có lịch sử — **nên đưa lên git trước khi sửa tiếp**.

## 4. Việc còn treo khác

1. ~~**Popup fbuddy 3 ngôn ngữ theo region** (vi/en/zh)~~ — **xong 2026-09-18 chiều**, xem §4b.
   (Đang chờ deploy: bản trên sóng vẫn là promo.js cũ một thứ tiếng.)
2. ~~**Luồng cấp key qua trang buy**~~ — **đã bỏ** cùng §3 (chủ dự án chốt 18/09); bản Windows vẫn nhập key.
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

## 4c. KẾ HOẠCH đã chốt với chủ dự án (2026-09-18 tối) — quản lý bản Windows

Chủ dự án chốt lại hướng (thay hẳn hướng đã bỏ ở §3.7):

| Yêu cầu | Chốt |
|---|---|
| Nơi quản lý | **Control Panel của FlowTech** (control plane `flowvpn-cp`, port 7778, phục vụ meetflowai.site) — thêm mục quản lý **bản Windows** vào phần **MeetFlow AI** |
| Key kích hoạt | Sinh bằng **một nút trên control panel**, gửi cho khách; **tự động gửi email** khi webhook (SePay) xác nhận đã nhận tiền |
| Bản Windows mới | **Dùng thử 3 ngày**, hết hạn thì **bắt activate** |
| Chính sách force update | **Chặn hẳn tại thời điểm bật chức năng Live meeting** (không chặn cả app): bản cũ hơn `minSupported` thì không cho bật live meeting, chỉ hiện nút tải bản mới |

**Điều KHÔNG thể (đã kiểm bằng source, đừng hứa với chủ dự án):** bản Windows **đã cài trên máy khách
không gọi về server mình câu nào** — chỉ có `wss://stt-rt.soniox.com`, `https://openrouter.ai/...` và
`{ActivationApiUrl}/activate` (mặc định RỖNG, chỉ gọi nếu khách tự điền). ⇒ **không ép từ xa được** các
máy đã cài. Chỉ ép được **từ bản mới trở đi** (bản mới sẽ gọi server để trial/activate/check version).
Với khách đang dùng bản cũ: chỉ còn cách **thông báo** (email toàn bộ khách đã mua · popup web · Telegram).

**Kiến trúc đề xuất (chờ chủ dự án gật):**

- **Backend đặt ở fBuddy** (`fbuddy.meetflowai.site`): đã có user/đơn/webhook SePay, và đã có sẵn module
  lõi `server/src/desktop-keys.js` (bảng `desktop_keys` + `desktop_key_activations`, chỉ lưu **hash**
  của key, thu hồi được từng máy). Endpoint cần thêm:
  - `POST /api/desktop/activate` (công khai, rate limit) — app gọi `{key, machineId}` ⇒
    `{valid, message, plan, activatedAt, expiresAt}` (đúng hợp đồng `ActivationService.cs`).
  - `POST /api/desktop/trial` (công khai) — đăng ký dùng thử theo `machineId`, trả `expiresAt`;
    trial lưu **server-side** để xoá file cấu hình không reset được.
  - `GET /api/desktop/version` (công khai) — `{latest, minSupported, downloadUrl, note}`.
  - Admin (token admin): `POST/GET /api/desktop/keys`, `POST /api/desktop/keys/:id/revoke`,
    `POST /api/desktop/keys/:id/rotate`, `PUT /api/desktop/version`.
- **Control panel (`/root/flowvpn-cp`)** chỉ là **UI**: card "MeetFlow AI → Bản Windows" gọi các API admin
  trên (nút **Gen key**, danh sách key + máy đã kích hoạt, thu hồi, đặt `latest`/`minSupported`/`downloadUrl`).
  ⚠️ `/root/flowvpn-cp` **không nằm trong git** (chỉ có `.bak-*` trên server) ⇒ **backup trước khi sửa**.
- **App Windows**: mặc định `ActivationApiUrl` trỏ về fBuddy; thêm màn hình trial (còn N ngày) và khoá
  nút bật Live meeting khi hết trial / khi version < `minSupported`.

**Thứ tự làm:** (1) route + email + test cho `desktop-keys.js`; (2) `/trial` + `/version`;
(3) UI trên control panel; (4) sửa app (trial 3 ngày + force khi bật live meeting) + build zip mới;
(5) thông báo cho khách đang dùng bản cũ. **Đừng phát hành zip mới trước khi (1)-(3) lên sóng.**

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
