# FBUDDY — Thiết kế tính năng model / API key (bản thiết kế, chưa code)

> Trạng thái: **SOLUTION TRƯỚC, CHƯA CODE**. Tài liệu này là bản thiết kế để chủ dự án chốt.
>
> ## ⚠️ Yêu cầu kiến trúc chủ đạo (quan trọng nhất)
>
> **Web (FlowGpt) và app (fbuddy) DÙNG CHUNG MỘT TẦNG BACKEND.**
> Admin cấu hình provider/model **một lần** ở web console ⇒ app dùng **đúng** cấu hình đó.
> **App KHÔNG giữ API key** của nhà cung cấp; app chỉ là **client thứ hai** gọi API của backend dùng chung.
>
> ⇒ Xem **§2** để biết toàn bộ kiến trúc (nguồn sự thật duy nhất, app token + policy theo client, API dùng chung, đường chuyển đổi, vận hành một chỗ).
> Mọi mục khác trong tài liệu đã được viết lại cho nhất quán với kiến trúc này.
>
> Bản web để noi theo: **FlowGpt** (`flowgpt/` trong repo này) — backend dùng chung **chính là** backend này.
>
> Quy ước dẫn chứng: mọi chi tiết lấy từ code đều kèm `file:line`.
> Phần **không** có trong code được ghi rõ **`ĐỀ XUẤT`**.
> Mọi đường dẫn trong tài liệu tính từ gốc repo (ví dụ `flowgpt/server/src/db.js`).

---

## 1. Mục tiêu & phạm vi

### 1.1 Mục tiêu

Cho fbuddy khả năng **gọi model qua API key do người dùng tự cấu hình**, với **cùng bộ tính năng** như bản web FlowGpt — tức là:

0. **DÙNG CHUNG một tầng backend với web** — admin cấu hình một lần ở web console, app dùng đúng cấu hình đó; **app không giữ API key** (đây là mục tiêu kiến trúc bao trùm, xem §2).
1. **Nhiều nhà cung cấp (multi-provider)**, thêm/sửa/xoá trong màn hình quản trị.
2. **API key lưu mã hoá** trong DB, không bao giờ trả key thô ra API/UI.
3. **Nút Test** gọi thật 1 request + nạp danh sách model thật từ provider.
4. **Chọn provider/model mặc định** — một cấu hình chung cho web **và** app.
5. **Chọn model theo từng cuộc trò chuyện** (console chat).
6. **Fallback 2 tầng**: khi thiếu key lúc chọn provider, và giữa lượt chat khi provider lỗi.
7. **Hiển thị usage** (token vào/ra) và provider/model đã trả lời.
8. **Audit log** mọi thao tác ghi vào cấu hình.
9. **CLI ops** cấu hình provider không lộ key ra command line/log.
10. **App token + policy theo client** — backend biết request đến từ web hay app, và giới hạn được model/provider cho từng client `ĐỀ XUẤT` (§2.4, §2.5).
11. **Vận hành một chỗ** — usage/lỗi/rate-limit của cả web và app nhìn ở cùng backend (§2.8).

### 1.2 Bộ tính năng của bản web (đối chiếu — đây là "definition of done")

| # | Tính năng | Bằng chứng trong code bản web |
|---|---|---|
| F1 | Bảng `providers` lưu nhiều provider | `flowgpt/server/src/db.js:74-86` |
| F2 | Bảng `app_settings` (key/value JSON) cho `defaultProviderId`, `defaultModel`, `systemPrompt`, `appName`… | `flowgpt/server/src/db.js:107-111`, defaults `db.js:279-292` |
| F3 | Key mã hoá AES-256-GCM, khoá derive từ `FLOWGPT_SECRET` | `flowgpt/server/src/crypto.js:82-92`, `config.js:33-45` |
| F4 | API chỉ trả `apiKeyPreview` (mask), không trả key thô | `flowgpt/server/src/settings.js:39`, mask `crypto.js:115-120` |
| F5 | Client gửi lại giá trị mask thì **giữ nguyên** secret cũ | `flowgpt/server/src/settings.js:7-11,103` |
| F6 | Registry kind + adapter | `flowgpt/server/src/providers/index.js:9`, `:12-112` |
| F7 | Adapter OpenAI-compatible dùng chung cho nhiều gateway | `flowgpt/server/src/providers/openai.js:1-211` |
| F8 | Stream SSE `POST {base}/chat/completions` + Bearer key | `flowgpt/server/src/providers/openai.js:82-97` |
| F9 | `stream_options.include_usage` chỉ gửi cho provider nằm trong danh sách hỗ trợ | `flowgpt/server/src/providers/openai.js:80,85-86` |
| F10 | Tự retry 1 lần khi gateway trả 400 vì không hiểu `stream_options` | `flowgpt/server/src/providers/openai.js:100-107` |
| F11 | `GET /models` nạp danh sách model thật | `flowgpt/server/src/providers/openai.js:178-189` |
| F12 | Probe test (non-stream, `max_tokens: 8`) | `flowgpt/server/src/providers/openai.js:192-210` |
| F13 | Fallback tầng 1: provider thiếu key → chọn provider khác, trả `fallbackFrom` | `flowgpt/server/src/settings.js:125-170` |
| F14 | Fallback tầng 2: lỗi 401/402/403/429 hoặc message khớp quota/credit → đổi provider giữa lượt | `flowgpt/server/src/agent.js:237-242`, `:352-373` |
| F15 | Chỉ fallback khi **chưa stream chữ nào** | `flowgpt/server/src/agent.js:356-357` |
| F16 | Mỗi provider chỉ thử 1 lần/lượt | `flowgpt/server/src/agent.js:266,362` |
| F17 | Thông báo cho UI khi đổi provider (`notice`) | `flowgpt/server/src/agent.js:363-367`, UI `flowgpt/web/src/state/chat.tsx:326-327` |
| F18 | Admin UI tab "Nhà cung cấp AI" + modal CRUD | `flowgpt/web/src/settings/SettingsPage.tsx:10-13`, `ProviderModal.tsx:24-33,136-170` |
| F19 | Chọn default provider/model ở tab Hệ thống | `flowgpt/web/src/settings/AppTab.tsx:182,206-212` |
| F20 | Picker model theo từng cuộc trò chuyện | `flowgpt/web/src/chat/Composer.tsx:271-281`, lưu ở conversation `flowgpt/server/src/db.js:30-31` |
| F21 | Hiển thị provider/model + token vào/ra dưới mỗi câu trả lời | `flowgpt/web/src/chat/MessageItem.tsx:135-143` |
| F22 | Admin API: provider-kinds / app / providers CRUD / test | `flowgpt/server/src/routes.js:545,549,557,593,597,607,617,628` |
| F23 | Audit log cho mọi thao tác ghi | `flowgpt/server/src/db.js:150-157,346`, gọi ở `routes.js:602,612,622` |
| F24 | CLI cấu hình provider đọc key từ FILE rồi xoá file | `flowgpt/ops/configure-provider.mjs:1-15`, xoá ở cuối file |
| F25 | CLI đổi model + verify thật bằng chat và stream | `flowgpt/ops/switch-model.mjs` |
| F26 | Test chứng minh fallback chạy (giả lập 429) | `flowgpt/server/test/failover.test.js` |

### 1.3 Khác biệt giữa fbuddy và bản web

**Giống:** toàn bộ F1–F26 là hành vi đích; fbuddy phải có đủ.

**Khác (bắt buộc khác):**

| Điểm | Bản web (FlowGpt) | fbuddy | Vì sao |
|---|---|---|---|
| **Tầng backend** | Backend riêng, tự giữ key + gọi model | **DÙNG CHUNG backend với web** — không có backend thứ hai, app không giữ key | Yêu cầu mới của chủ dự án: admin configure cho web ⇒ app dùng y hệt (chi tiết §2) |
| **Danh tính client** | user + JWT (`auth.js:68-70,101-111`) | **app token mờ, DB lưu hash** + `requireClient` `ĐỀ XUẤT` | Tách cơ chế để không replay chéo token (§2.4) |
| **Phạm vi provider** | Toàn bộ provider đang bật | **Bị giới hạn bởi policy** `ĐỀ XUẤT` | App free tier chỉ nên dùng Groq/HF (§2.5) |
| Provider ưu tiên | Không có kind `groq`/`huggingface`; Groq chỉ đi lọt qua kind `openai-compatible` (`flowgpt/server/test/voice.test.js:103`) | **Bổ sung kind `groq` và `huggingface` là first-class** vào registry **dùng chung** | Yêu cầu chủ dự án: 2 provider free, cần base URL + key hint + model gợi ý đúng |
| Thứ tự fallback | Dựa **ngầm** vào `created_at ASC` (`flowgpt/server/src/settings.js:48-50`) | **Cột `priority` tường minh** `ĐỀ XUẤT` | Thứ tự ngầm rất dễ vỡ khi thêm/xoá provider |
| Framework app | Node + `node:sqlite` (`flowgpt/server/src/db.js:3,160`) — **chỉ còn là backend** | **Chưa biết** — xem §10 | fbuddy chạy trên `/opt/agent-bus`; **nhưng app không cần cùng stack với backend** nữa, chỉ cần gọi HTTP (§2.6) |
| Tên secret env | `FLOWGPT_SECRET` (`flowgpt/server/src/config.js:34`) — ở backend | `FBUDDY_SECRET` `ĐỀ XUẤT` **chỉ dùng nếu** app tự gọi trực tiếp (chế độ `direct` sắp bỏ, §2.7) | Tránh lẫn khoá giữa 2 app |

**Vẫn giữ giống bản web (để dễ port):** tên bảng, tên cột, tên endpoint, shape payload — giữ **y hệt bản web**. Nhưng lý do đã đổi: trước đây là để "copy code sang fbuddy", nay là vì **app gọi thẳng chính API đó** (§2.6) ⇒ hợp đồng API phải ổn định cho **cả hai** client.

**Hệ quả quan trọng:** nhiều mục dưới đây (registry kind §4, fallback §6, API §7) **không** còn là "phải làm lại trong fbuddy" mà là **"phải làm trong backend dùng chung, một lần"**. fbuddy chỉ là client thứ hai.

### 1.4 Ngoài phạm vi

- **Không** xây backend thứ hai cho app. App là **client** của backend dùng chung (§2).
- **Không** nhúng API key nhà cung cấp vào app dưới bất kỳ hình thức nào (§2.3).
- Không làm hệ thống billing/trả tiền.
- Không đổi UX chat hiện có của fbuddy (chỉ thêm phần chọn model + fallback).
- Không đụng bản web FlowGpt đang chạy production — mọi thay đổi backend phải **tương thích ngược** với web đang chạy (§2.7).
- Không làm lại UI quản trị của web; chỉ **thêm** phần quản lý app client + policy (§5.8).

---

## 2. Kiến trúc: MỘT tầng backend dùng chung cho web + app

> **Đây là thay đổi kiến trúc quan trọng nhất của tài liệu này** (yêu cầu mới của chủ dự án):
> web (FlowGpt) và app (fbuddy) **dùng chung một tầng backend**, không phải mỗi bên cấu hình riêng.
> Admin cấu hình một lần ở web console ⇒ app dùng đúng cấu hình đó.

### 2.1 Nguyên tắc

Bản web **đã** làm đúng việc mà app cần: backend giữ key, chọn provider, gọi nhà cung cấp, chạy fallback, ghi usage (`flowgpt/server/src/agent.js`, `flowgpt/server/src/providers/openai.js`).

⇒ Kiến trúc đích: **app trở thành front-end thứ hai của cùng `/api` đó**, **không** phải backend thứ hai.

```
                    ┌──────────────────────────────────────────┐
   web (FlowGpt) ──►│  BACKEND DÙNG CHUNG  /api                 │──► Groq
   app (fbuddy) ───►│  • giữ API key (AES-256-GCM)              │──► HuggingFace
                    │  • providers + app_settings (1 nguồn)     │──► OpenAI-compatible…
                    │  • chọn provider/model + policy theo client│
                    │  • fallback 2 tầng, ghi usage_log/audit_log│
                    └──────────────────────────────────────────┘
```

Bằng chứng cho thấy mô hình "một backend, nhiều front-end" **đã tồn tại** trong bản web:

- Web tĩnh + SPA fallback được phục vụ cùng tiến trình với `/api` (`flowgpt/server/src/index.js:59,63-87`).
- Không có endpoint nào trả key thô ⇒ front-end **không cần** và **không thể** tự gọi nhà cung cấp (§3.3).
- Voice cũng đã resolve provider **ở server** rồi client gọi lại endpoint server (`flowgpt/server/src/settings.js:415-445`, `routes.js:437,454,487,514`).

### 2.2 Một nguồn sự thật duy nhất cho cấu hình LLM

`ĐỀ XUẤT` — chốt các quy tắc sau:

1. **Chỉ backend dùng chung được ghi** vào `providers` và `app_settings` (§3.1, §3.2). App **không** có endpoint ghi cấu hình LLM; nếu app cần hiển thị lựa chọn thì **đọc** qua API.
2. **Không có bảng cấu hình provider thứ hai ở phía app.** Mọi thứ (kind, base URL, model, key) tồn tại đúng một chỗ.
3. **Admin sửa ở web console** bằng đúng các endpoint đã có: `GET|POST|PATCH|DELETE /api/settings/providers`, `PUT /api/settings/app` (§7.1). App thấy thay đổi **ngay ở request kế tiếp** vì không có cache cấu hình riêng ở client.
4. **Không seed key qua env trong app.** `GROQ_API_KEY`/`HF_TOKEN` chỉ là tiện ích **một lần** khi tạo provider (§4.2), sau đó key nằm trong DB (đã mã hoá). App không đọc env key.

**Hệ quả:** xoay key, thêm provider, đổi model mặc định — làm **một lần**, cả web và app cùng đổi.

### 2.3 App KHÔNG giữ API key nhà cung cấp

`ĐỀ XUẤT` — app gọi **API của backend dùng chung**, không gọi nhà cung cấp:

| Việc | Nơi thực hiện | Không phải nơi nào |
|---|---|---|
| Giữ + giải mã API key nhà cung cấp | Backend (`crypto.js:82-111`) | ❌ app |
| Chọn provider/model | Backend (`settings.js:125-170`) | ❌ app |
| Gọi `POST {base}/chat/completions` + SSE | Backend (`providers/openai.js:82-163`) | ❌ app |
| Fallback + retry | Backend (`agent.js:245-254,352-373`) | ❌ app |
| Ghi usage + audit | Backend (`db.js:138-157`) | ❌ app |
| Hiển thị + gửi ý người dùng | Web / App | ✅ |

**Lợi ích (đây là lý do chọn kiến trúc này):**

1. **Một chỗ cấu hình** — admin configure cho web thì app dùng y hệt, không phải nhập lại (đúng yêu cầu chủ dự án).
2. **Xoay key một chỗ** — thay/hết hạn key chỉ cần sửa ở web console; app **không phải phát hành bản cập nhật**.
3. **Không lộ key trong app** — app không chứa secret nhà cung cấp, nên dịch ngược app (APK/IPA/binary) **không** lấy được key. Đây là rủi ro thật nếu nhúng key vào app.
4. **Thống nhất fallback** — web và app fallback theo cùng thứ tự `priority`, cùng danh sách lỗi; không có 2 hành vi khác nhau.
5. **Thống nhất usage/chi phí** — token của app và web nằm cùng `usage_log`, gộp báo cáo được.
6. **Thu hồi tức thì** — khoá client của app là 1 thao tác ở backend, không cần build lại app.
7. **App gọn** — app chỉ là HTTP client + UI; không cần thư viện crypto, không cần DB local cho cấu hình, không cần logic provider.

**Đánh đổi phải chấp nhận:** app **phụ thuộc** backend dùng chung — backend chết thì app không chat được. Cần health check + thông báo lỗi rõ ràng ở app `ĐỀ XUẤT`.

### 2.4 Xác thực & phân quyền theo loại client

Hiện trạng bản web (đã xác minh):

- Token lấy từ `Authorization: Bearer <token>` **hoặc** cookie `flowgpt_token` (`flowgpt/server/src/auth.js:92-99`).
- `currentUser()` verify chữ ký JWT → load `users` row → so `tv` với `token_version` (`auth.js:101-111`).
- `requireAuth` (`auth.js:114-119`); `requireAdmin` đòi `role === "admin"` (`auth.js:121-127`).
- JWT payload `{ sub, email, role, tv }` (`auth.js:68-70`), HS256 ký bằng `jwt:${config.secret}` (`crypto.js:52-61`).
- `users.role` mặc định `'user'`, có `token_version` để vô hiệu token cũ (`flowgpt/server/src/db.js:15-23`).

`ĐỀ XUẤT` — thêm lớp **client token** cho app, **không** đụng luồng web hiện có:

| | Web (FlowGpt) | App (fbuddy) |
|---|---|---|
| Danh tính | `users` row (email/password) | `api_clients` row (không phải user) |
| Token | JWT `{sub,email,role,tv}` (`auth.js:68-70`) | **token mờ (opaque) ngẫu nhiên**, DB chỉ lưu **hash** |
| Truyền token | cookie `flowgpt_token` hoặc `Bearer` (`auth.js:93-98`) | `Authorization: Bearer <app token>` (`index.js:29` đã cho phép header này) |
| Middleware | `requireAuth` / `requireAdmin` (`auth.js:114-127`) | `requireClient` (mới) → set `req.client` |
| Thu hồi | bump `token_version` (`auth.js:110`) | đổi/xoá `token_hash`, hoặc `enabled = 0` |
| Phạm vi | toàn bộ provider/model | **chỉ provider/model trong policy** (§2.5) |

**Vì sao dùng token mờ + hash, KHÔNG dùng JWT cho app** `ĐỀ XUẤT`:

- `verifyToken()` chỉ kiểm **chữ ký + `exp`**, **không** kiểm `aud`/`typ` (`flowgpt/server/src/crypto.js:63-78`). Nếu app phát JWT cùng secret, một token do app giữ **có thể bị replay** vào endpoint web (và ngược lại).
- Token mờ đối chiếu bằng hash ⇒ không có không gian để nhầm loại token; và backend **không bao giờ** cần đọc lại token thô (chỉ so sánh) nên hash là đủ — mạnh hơn mã hoá hai chiều.
- **Tiền lệ trong repo:** `email_tokens` đã lưu `token_hash` chứ không lưu token thô (`flowgpt/server/src/db.js:117-118`) ⇒ đúng convention sẵn có.
- Hiển thị token **một lần** lúc tạo, sau đó chỉ còn tiền tố để nhận diện — nhất quán với nguyên tắc F4 "không bao giờ trả secret thô" (§1.2).

Bảng `api_clients` `ĐỀ XUẤT`:

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | |
| `name` | TEXT | NOT NULL | Ví dụ "fbuddy iOS", "fbuddy Android" |
| `token_hash` | TEXT | NOT NULL | Hash của token mờ; **không** lưu token thô |
| `token_prefix` | TEXT | | 6–8 ký tự đầu để admin nhận diện trong danh sách |
| `enabled` | INTEGER | NOT NULL DEFAULT 1 | 0 = thu hồi |
| `created_at` / `updated_at` | TEXT | NOT NULL | |
| `last_seen_at` | TEXT | nullable | Cập nhật mỗi request (có thể gộp theo phút) |

### 2.5 Policy "model nào cho client nào"

`ĐỀ XUẤT` — thêm bảng `client_policies` (1-1 với `api_clients`):

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `client_id` | TEXT PRIMARY KEY | FK → `api_clients.id` |
| `allowed_provider_ids_json` | TEXT DEFAULT `'[]'` | Rỗng = **không** provider nào (§ cảnh báo dưới) |
| `allowed_kinds_json` | TEXT DEFAULT `'[]'` | Ví dụ `["groq","huggingface"]` cho app free |
| `allowed_models_json` | TEXT DEFAULT `'[]'` | Lọc tiếp theo model id |
| `rate_limit_per_min` | INTEGER | Chặn lạm dụng từ app |
| `daily_token_budget` | INTEGER | Trần token/ngày cho client đó |

**Quy tắc vàng:** policy **bắt buộc** được áp ở **cả ba** điểm chọn provider, không chỉ điểm đầu:

1. `resolveProviderForChat()` — chọn provider lúc bắt đầu lượt (`flowgpt/server/src/settings.js:125-170`).
2. `nextUsableProvider()` — chọn provider dự phòng (`settings.js:177-187`).
3. `switchToFallbackProvider()` — đổi provider giữa lượt (`flowgpt/server/src/agent.js:245-254`).

> ⚠️ **Đây là lỗi bảo mật dễ mắc nhất của kiến trúc này.** Nếu chỉ lọc ở bước 1, một lượt của app có thể **thoát policy qua đường fallback** và bị gửi tới provider trả tiền. Cách đúng: truyền `req.client` (hoặc một `policy` đã resolve) **xuyên suốt** `resolveProviderForChat` → `nextUsableProvider` → `switchToFallbackProvider`, và **test bắt buộc** cho ca "app gặp 429 ở provider được phép ⇒ phải lỗi, KHÔNG được nhảy sang provider ngoài policy" (§9.2).

Áp dụng tương tự cho `GET /api/models`: chỉ trả model trong policy của client đang gọi — nguồn là `listModelsForUi()` (`settings.js:189-214`) nhưng **đã lọc** theo client.

### 2.6 API surface dùng chung

`ĐỀ XUẤT` — cả web và app gọi **cùng endpoint**. App chỉ cần đổi base URL. Chi tiết payload đầy đủ ở §7.

| Endpoint | Web | App | Ghi chú |
|---|---|---|---|
| `POST /api/chat/stream` | ✅ | ✅ | SSE; đây là đường đi chính |
| `GET /api/models` | ✅ | ✅ | App nhận **danh sách đã lọc theo policy** |
| `POST /api/conversations`, `PATCH /api/conversations/:id` | ✅ | ✅ | Lưu `providerId`/`model` (`db.js:30-31`) |
| `GET /api/usage` | ✅ | ✅ | `ĐỀ XUẤT` (§7.5) — app xem token đã dùng |
| `GET /api/health` | ✅ | ✅ | Đã có sẵn (`index.js:40`) — app dùng để phát hiện backend chết |
| `/api/settings/**` | ✅ | ❌ | Chỉ admin web; app **không** được ghi cấu hình (§2.2) |

App **không** cần endpoint riêng cho chat ⇒ không có "API chat cho app" thứ hai để lệch hành vi.

**Ràng buộc CORS (đã xác minh, dễ bỏ sót):** CORS chỉ cấp header cho origin nằm trong `[config.publicUrl, ...config.devOrigins]` (`flowgpt/server/src/index.js:19-26`; `config.js:51,60-64`).

- App **native/desktop** (HTTP client không phải trình duyệt) **không** chịu CORS ⇒ chỉ cần base URL.
- Nếu có front-end chạy **trong trình duyệt** ở origin khác ⇒ **phải** thêm origin đó vào `FLOWGPT_PUBLIC_URL`/`FLOWGPT_DEV_ORIGINS`, nếu không sẽ bị chặn. `ĐỀ XUẤT`: thêm biến `FLOWGPT_EXTRA_ORIGINS` cho client app.

### 2.7 Tương thích ngược & đường chuyển đổi

Nếu hiện tại app **đang tự gọi nhà cung cấp bằng key riêng** `ĐỀ XUẤT` — chuyển đổi theo 3 giai đoạn, **không** cắt đột ngột:

| Giai đoạn | App làm gì | Backend | Cờ |
|---|---|---|---|
| **P0 — hiện trạng** | App tự giữ key + tự gọi nhà cung cấp | Không liên quan | — |
| **P1 — song song** | App gọi backend dùng chung; **giữ** đường tự gọi làm dự phòng | Cấp app token + policy cho app | `FBUDDY_LLM_MODE=shared` (mặc định mới) |
| **P2 — cắt hẳn** | App **chỉ** gọi backend; xoá code/key khỏi app | Là nguồn sự thật duy nhất | `FBUDDY_LLM_MODE=shared` (bỏ nhánh `direct`) |

Quy tắc:

1. **Mặc định là `shared`.** Không để mặc định rơi về `direct`, vì như vậy app vẫn có thể lặng lẽ dùng key riêng ⇒ hai nguồn sự thật.
2. **`direct` chỉ là cờ tạm, có ngày hết hạn** `ĐỀ XUẤT` — ghi rõ trong runbook và xoá ở P2. Đây là "nợ kỹ thuật có hạn", không phải chế độ lâu dài.
3. **Trong P1, log phải ghi rõ đường nào đã dùng** (`client = app`, `mode = shared|direct`) để biết app còn phụ thuộc key riêng hay không.
4. **Không đọc key nhà cung cấp từ app trong P0→P1 bằng cách copy DB**: key phải vào backend qua `POST /api/settings/providers` (admin) hoặc CLI `configure-provider` (§8 Bước C) — để nó được mã hoá đúng cách.

### 2.8 Vận hành: một chỗ xem usage / lỗi / rate-limit

`ĐỀ XUẤT` — thêm chiều `client` vào các bảng và log đã có:

| Nơi | Hiện trạng | Cần thêm |
|---|---|---|
| `usage_log` | `user_id, conversation_id, provider_id, model, tokens_in, tokens_out` (`db.js:138-148`) | cột `client` (`'web' \| 'app'`) + `client_id` |
| `audit_log` | `user_id, action, target, detail_json` (`db.js:150-157`) | cột `client` + `client_id` |
| Request log | chỉ ghi khi `status >= 400`, có `method/path/status/ms/ip` — **không có danh tính client** (`flowgpt/server/src/index.js:38-57`) | thêm `client` và `clientId` ⇒ xem được lỗi theo từng client ở **một chỗ** (`journalctl`) |
| Audit thao tác admin | `provider.create/update/delete`, `settings.update` (`routes.js:602,612,622,563`) | thêm `provider.test` (đang thiếu, §3.4) |

**Cảnh báo khi provider hết quota** `ĐỀ XUẤT`: vì mọi client đi qua **cùng** fallback (agent.js:237-242), backend là nơi **duy nhất** nhìn thấy 429/402 của nhà cung cấp. Đặt cảnh báo ở đây:

- Đếm lỗi `isProviderCreditError` theo `provider_id` trong cửa sổ trượt; vượt ngưỡng ⇒ cảnh báo (Telegram/agent-bus) **một lần**, không spam mỗi request.
- `notice` (§5.7) chỉ tới client đang chat; cảnh báo vận hành phải tới **admin**, vì nó ảnh hưởng cả web lẫn app.

### 2.9 Tóm tắt: cái gì dùng chung, cái gì riêng

| Thành phần | Web | App | Dùng chung? |
|---|---|---|---|
| `providers`, `app_settings` | đọc | đọc (gián tiếp, qua API) | ✅ **một nguồn** |
| API key nhà cung cấp | — | — | ✅ chỉ ở backend |
| `/api/chat/stream`, `/api/models`, `/api/usage` | ✅ | ✅ | ✅ **một API** |
| Chọn provider/model + fallback | — | — | ✅ ở backend |
| Danh tính | user + JWT | app token (hash) | ❌ khác cơ chế (§2.4) |
| Policy provider/model | toàn bộ | giới hạn | ❌ khác phạm vi (§2.5) |
| UI/UX | React web | app | ❌ khác hoàn toàn |

---

## 3. Mô hình dữ liệu

> **Vị trí trong kiến trúc dùng chung (§2):** toàn bộ các bảng dưới đây nằm ở **backend dùng chung** — web và app **cùng đọc** chúng. App **không** có bản sao cấu hình provider. Bảng `api_clients` + `client_policies` (§3.5) là phần **thêm mới** để phân biệt và giới hạn client, không phải một nguồn cấu hình thứ hai.

### 3.1 Bảng `providers`

Bản web (`flowgpt/server/src/db.js:74-86`) — fbuddy dùng **y hệt** rồi thêm 1 cột `ĐỀ XUẤT`:

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Sinh bằng `newId()` (`flowgpt/server/src/util.js`) |
| `name` | TEXT | NOT NULL | Tên hiển thị |
| `kind` | TEXT | NOT NULL | Phải nằm trong `PROVIDER_KINDS`; validate ở `settings.js:62-64` |
| `base_url` | TEXT | nullable | Nếu trống → dùng `defaultBaseUrl` của kind (`settings.js:75`, `providers/index.js:133`) |
| `api_key_enc` | TEXT | nullable | Bản mã hoá; `NULL` với kind `mock` (`settings.js:77`) |
| `models_json` | TEXT | NOT NULL DEFAULT `'[]'` | Mảng model dạng JSON string |
| `default_model` | TEXT | nullable | Model mặc định của provider |
| `image_model` | TEXT | nullable | Model sinh ảnh; lấy từ `defaultImageModel` của kind (`providers/index.js:140`) |
| `enabled` | INTEGER | NOT NULL DEFAULT 1 | Boolean lưu 0/1 — driver `node:sqlite` từ chối boolean JS (`flowgpt/server/src/db.js:8-9`) |
| `created_at` | TEXT | NOT NULL | ISO string |
| `updated_at` | TEXT | NOT NULL | ISO string |
| `priority` | INTEGER | NOT NULL DEFAULT 100 | **`ĐỀ XUẤT`** — thứ tự fallback tường minh (xem §6) |

**Ràng buộc cần thêm (fbuddy)** `ĐỀ XUẤT`:

- `CREATE INDEX idx_providers_enabled_priority ON providers(enabled, priority ASC, created_at ASC)` — phục vụ đúng truy vấn chọn provider.
- Bản web **không** có unique index trên `providers` (chỉ PK) → cho phép 2 provider trùng tên/kind. fbuddy nên **cảnh báo trùng `name`** ở tầng ứng dụng, **không** đặt UNIQUE cứng (để không chặn 2 tài khoản cùng provider).

### 3.2 Bảng `app_settings`

Bản web (`flowgpt/server/src/db.js:107-111`):

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `key` | TEXT | PRIMARY KEY |
| `value_json` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Ghi theo kiểu upsert `ON CONFLICT(key) DO UPDATE` (`flowgpt/server/src/db.js:335-338`).

**Điểm quan trọng — allow-list:** `setAppSettings` **bỏ qua** mọi key không có trong `DEFAULT_APP_SETTINGS` (`flowgpt/server/src/db.js:340`). Nghĩa là thêm setting mới **bắt buộc** phải thêm vào `DEFAULT_APP_SETTINGS` trước, nếu không API sẽ im lặng không lưu. fbuddy phải giữ đúng cơ chế này.

Các key liên quan model (bản web, `flowgpt/server/src/db.js:279-292`):

| Key | Default | Vai trò |
|---|---|---|
| `defaultProviderId` | `null` | Provider mặc định |
| `defaultModel` | `null` | Model mặc định |
| `systemPrompt` | Chuỗi tiếng Việt | Chỉ dẫn gốc |
| `appName` | `"FlowGpt"` | Tên app |
| `imageModel` | `null` | Model ảnh |
| `maxToolIterations` | `6` | Số vòng gọi tool tối đa |
| `defaultSkill` | `"auto"` | Skill mặc định |

Bổ sung cho fbuddy `ĐỀ XUẤT`: `defaultProviderId`, `defaultModel` phải có **trong allow-list** ngay từ đầu để nút "Lưu" ở tab Hệ thống hoạt động.

### 3.3 Quy tắc mã hoá key

**Thuật toán (fbuddy copy nguyên):**

- Khoá: `scryptSync(secret, "flowgpt-secret-v1", 32, { N: 16384, r: 8, p: 1 })` — `flowgpt/server/src/crypto.js:82-84`.
- Mã hoá: `aes-256-gcm`, IV ngẫu nhiên **12 byte** — `flowgpt/server/src/crypto.js:88-89`.
- Định dạng lưu: `v1.<iv base64url>.<ciphertext base64url>.<authTag base64url>` — `flowgpt/server/src/crypto.js:91`.
- Giải mã **trả `null` khi thất bại, không throw** — `flowgpt/server/src/crypto.js:94-111` (nhờ vậy key sai khoá không làm sập request, chỉ bị coi là "chưa có key").
- `encryptSecret("")` trả `null` — `flowgpt/server/src/crypto.js:87`.
- Salt `"flowgpt-secret-v1"` là **hard-code** → đổi sang `"fbuddy-secret-v1"` `ĐỀ XUẤT` (buộc phải có tiền tố version để sau này xoay khoá).

**Secret lấy từ env:**

- `FLOWGPT_SECRET`; **bắt buộc ≥ 16 ký tự**; ở `NODE_ENV=production` thiếu là **throw ngay** — `flowgpt/server/src/config.js:33-38`.
- Dev fallback: sinh ngẫu nhiên, ghi `data/.dev-secret` với mode `0600` — `flowgpt/server/src/config.js:39-44`.
- Cùng secret được dùng để ký JWT — `flowgpt/server/src/crypto.js:52`. ⇒ **Xoay `FBUDDY_SECRET` sẽ vô hiệu hoá toàn bộ key đã lưu và mọi session.** Phải coi đây là sự kiện migration, không phải thao tác thường.

**Không bao giờ trả key thô:**

- `publicProvider()` trả `hasApiKey` (bool) + `apiKeyPreview` (mask) — `flowgpt/server/src/settings.js:26-46`.
- `maskSecret` mặc định giữ **6 ký tự đầu + 3 ký tự cuối**, ngăn bằng `…`; nếu chuỗi ngắn hơn 9 ký tự thì trả toàn bộ bằng dấu `•` — `flowgpt/server/src/crypto.js:115-120`. Đây là lý do preview **không** đủ để dựng lại key.
- **Không có endpoint nào đọc lại key thô.** fbuddy phải giữ nguyên tính chất này.

**Giữ secret khi client gửi lại giá trị mask:**

- Hằng `KEEP_SECRET = "__KEEP__"` — `flowgpt/server/src/settings.js:7`.
- `looksMasked()` coi là "giữ nguyên" khi giá trị bằng sentinel, **hoặc** bắt đầu bằng ≥ 2 ký tự `•`/`*`, **hoặc** chứa `…` — `flowgpt/server/src/settings.js:9-11`.
- Áp dụng khi PATCH (`settings.js:100-104`) và cả cho secret map của MCP (`settings.js:243`).
- **Cảnh báo thiết kế:** `looksMasked` dùng regex trên chuỗi bắt đầu bằng `**` — một key thật bắt đầu bằng `**` sẽ **không lưu được**. fbuddy `ĐỀ XUẤT` thay bằng so khớp **chính xác** với `apiKeyPreview` đã trả trước đó.

### 3.4 Audit log

Bảng `audit_log` — `flowgpt/server/src/db.js:150-157`:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | TEXT PRIMARY KEY | |
| `user_id` | TEXT nullable | `null` cho hành động tiền-đăng-nhập |
| `action` | TEXT NOT NULL | Ví dụ `provider.create` |
| `target` | TEXT nullable | id provider/user bị tác động |
| `detail_json` | TEXT NOT NULL DEFAULT `'{}'` | Chi tiết |
| `created_at` | TEXT NOT NULL | |
| `client` | TEXT nullable | **`ĐỀ XUẤT`** — `'web'` \| `'app'` (§2.8) |
| `client_id` | TEXT nullable | **`ĐỀ XUẤT`** — FK → `api_clients.id` khi request đến từ app |

Hàm `audit()` **tự bọc try/catch** (`flowgpt/server/src/db.js:346-349`) ⇒ lỗi ghi audit **không** làm hỏng request nghiệp vụ. fbuddy giữ nguyên hành vi này.

Action đã có ở bản web: `provider.create` / `provider.update` / `provider.delete` (`flowgpt/server/src/routes.js:602,612,622`), `settings.update` (`routes.js:563`).

**Khoảng trống phát hiện được:** endpoint `POST /settings/providers/:id/test` (`routes.js:628-649`) **không** ghi audit, dù nó gửi request thật ra ngoài và tiêu quota. fbuddy `ĐỀ XUẤT` **ghi audit** action `provider.test` kèm `{ ok, model, latencyMs }` — **tuyệt đối không** ghi key.

`detail_json` khi update chỉ ghi **tên field**, không ghi giá trị (`routes.js:612`: `{ keys: Object.keys(req.body ?? {}) }`) ⇒ vô tình đúng: không rò secret vào audit. fbuddy **phải giữ** cách này.

---


### 3.5 Bảng cho client dùng chung (app token + policy) — `ĐỀ XUẤT`

> Đây là phần **thêm mới** để thực hiện yêu cầu "web và app dùng chung backend" (§2).
> Bản web hiện **chưa có** hai bảng này — đã kiểm chứng: không có bảng `api_clients`/`client_policies` trong `flowgpt/server/src/db.js`.
> Cách làm bám theo convention sẵn có của repo: booleans là 0/1, JSON lưu dạng TEXT, token lưu dạng **hash**.

#### `api_clients`

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | |
| `name` | TEXT | NOT NULL | "fbuddy iOS", "fbuddy Android", "fbuddy Desktop" |
| `token_hash` | TEXT | NOT NULL | Hash của token mờ — **không** lưu token thô (§2.4) |
| `token_prefix` | TEXT | nullable | 6–8 ký tự đầu để admin nhận diện; **không** đủ để dựng lại token |
| `enabled` | INTEGER | NOT NULL DEFAULT 1 | `0` = thu hồi ngay |
| `last_seen_at` | TEXT | nullable | Gộp cập nhật theo phút để tránh ghi DB mỗi request `ĐỀ XUẤT` |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

`ĐỀ XUẤT` index: `CREATE INDEX idx_api_clients_token ON api_clients(token_hash)` — tra cứu theo hash là đường nóng của mọi request từ app.

**Tiền lệ trong repo:** `email_tokens` đã lưu `token_hash`/`link_hash` thay vì token thô (`flowgpt/server/src/db.js:117-118`) ⇒ hash-token là convention đã có, không phải phát minh mới.

#### `client_policies`

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `client_id` | TEXT | PRIMARY KEY, FK → `api_clients.id` | 1-1 |
| `allowed_provider_ids_json` | TEXT | NOT NULL DEFAULT `'[]'` | Danh sách trắng theo provider id |
| `allowed_kinds_json` | TEXT | NOT NULL DEFAULT `'[]'` | Ví dụ `["groq","huggingface"]` |
| `allowed_models_json` | TEXT | NOT NULL DEFAULT `'[]'` | Lọc tiếp theo model id |
| `rate_limit_per_min` | INTEGER | nullable | `NULL` = không giới hạn riêng |
| `daily_token_budget` | INTEGER | nullable | `NULL` = không giới hạn |
| `updated_at` | TEXT | NOT NULL | |

**Ngữ nghĩa "rỗng" phải chốt rõ** — đây là chỗ dễ hiểu nhầm và có thể thành lỗ hổng:

`ĐỀ XUẤT` chọn **deny-by-default** (an toàn hơn):

| Trạng thái | Ý nghĩa |
|---|---|
| **Không có row** trong `client_policies` | **Chặn hết** — client chưa được cấu hình thì không dùng được model nào; API trả lỗi rõ ràng, không fallback |
| Có row, `allowed_kinds_json = '[]'` **và** `allowed_provider_ids_json = '[]'` | **Chặn hết** (tường minh) |
| Có ít nhất 1 phần tử ở `allowed_kinds_json` hoặc `allowed_provider_ids_json` | Chỉ được dùng phần giao với `providers` đang `enabled` |
| Muốn cho dùng **tất cả** | Ghi sentinel `["*"]` **tường minh** `ĐỀ XUẤT` — không dùng "rỗng = tất cả" |

Lý do chọn deny-by-default: nếu "rỗng = tất cả", một client bị tạo thiếu policy sẽ **âm thầm** có quyền dùng provider trả tiền. Deny-by-default biến lỗi cấu hình thành lỗi **ồn ào** (dễ phát hiện) thay vì lỗi im lặng (khó phát hiện, tốn tiền).

#### Quan hệ với các bảng đã có

| Bảng | Quan hệ |
|---|---|
| `providers` | Policy **tham chiếu** provider id; không nhân bản cấu hình provider (§2.2) |
| `app_settings` | Vẫn là nguồn `defaultProviderId`/`defaultModel` **chung**; policy chỉ **thu hẹp** trên nền cấu hình chung đó |
| `usage_log` | Thêm `client` + `client_id` (§2.8) để tách báo cáo web/app |
| `audit_log` | Thêm `client` + `client_id`; thao tác tạo/sửa/thu hồi app client cũng phải audit (§5.8) |
| `users` | **Không** dùng chung: app client **không** phải user, không có password, không đăng nhập bằng email (§2.4) |

---

## 4. Registry provider

> **Vị trí trong kiến trúc dùng chung (§2):** registry là **một** registry ở backend dùng chung. Thêm kind `groq`/`huggingface` là **sửa backend một lần** — cả web và app cùng thấy kind mới, không cần sửa app.
> Policy theo client (§2.5, §3.5) chỉ **thu hẹp** tập kind/provider mà một client được dùng; nó **không** định nghĩa lại registry. Nói cách khác: `PROVIDER_KINDS` = "có những loại nào", `allowed_kinds_json` = "client này được dùng loại nào".

### 4.1 Cơ chế

- `ADAPTERS` ánh xạ kind → module adapter — `flowgpt/server/src/providers/index.js:9`.
- `PROVIDER_KINDS` là mảng metadata cho UI/validate — `flowgpt/server/src/providers/index.js:12-112`.
- `adapterFor(kind)` ném `ApiError(400)` nếu kind lạ — `flowgpt/server/src/providers/index.js:118-122`.
- `toRuntimeProvider(row)` giải mã key + điền `baseUrl`/`defaultModel`/`imageModel` mặc định từ metadata — `flowgpt/server/src/providers/index.js:125-146`.
- `hasKey` = có key **hoặc** kind là `mock` — `flowgpt/server/src/providers/index.js:137`.
- `PROVIDER_KIND_IDS` export cho test — `flowgpt/server/src/providers/index.js:161`.

7 kind hiện có ở bản web: `gemini`, `openai`, `anthropic`, `glm`, `openrouter`, `openai-compatible`, `mock` (`providers/index.js:12-112`).

### 4.2 Kind cần có cho fbuddy

| kind | Bắt buộc | Adapter | `defaultBaseUrl` | Model gợi ý | `keyHint` / ghi chú |
|---|---|---|---|---|---|
| `groq` | **Có** | `openai` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, `whisper-large-v3-turbo` | env `GROQ_API_KEY`. Base URL **đã được chứng minh** ở `flowgpt/server/test/voice.test.js:103` |
| `huggingface` | **Có** | `openai` | `https://router.huggingface.co/v1` | để trống, **bắt buộc** bấm Test để nạp list thật `ĐỀ XUẤT` | env `HF_TOKEN`. HF router là OpenAI-compatible `ĐỀ XUẤT` — **phải verify bằng Test trước khi tin** |
| `openai-compatible` | **Có** | `openai` | giữ `https://api.deepseek.com/v1` như bản web (`providers/index.js:93`) | giữ `deepseek-chat`, `deepseek-reasoner` | Là đường thoát cho mọi gateway chưa có kind riêng |
| `openrouter` | Nên giữ | `openai` | `https://openrouter.ai/api/v1` (`index.js:74`) | giữ nguyên `index.js:75-81` | Cần header `HTTP-Referer`/`X-Title` (`openai.js:69-77`) |
| `openai` | Nên giữ | `openai` | `https://api.openai.com/v1` (`index.js:32`) | giữ nguyên `index.js:33` | |
| `gemini` | Tuỳ | `gemini` | `https://generativelanguage.googleapis.com` (`index.js:16`) | giữ nguyên `index.js:17-22` | Adapter riêng, không phải OpenAI-compatible |
| `anthropic` | Tuỳ | `anthropic` | `https://api.anthropic.com` (`index.js:43`) | giữ nguyên `index.js:44-49` | Adapter riêng |
| `mock` | Nên giữ | `mock` | `null` | `flowgpt-demo` | Không cần key; dùng để thử luồng khi chưa có key |

**Dead entry đã xác minh:** `"groq"` có trong `SUPPORTS_STREAM_USAGE` (`flowgpt/server/src/providers/openai.js:80`) nhưng **không** có kind `groq` trong `PROVIDER_KINDS` (đã grep toàn bộ `flowgpt/server/src`, `flowgpt/web/src`, `flowgpt/ops` — chỉ 1 kết quả duy nhất là dòng 80). ⇒ Thêm kind `groq` vào registry dùng chung sẽ **vô tình kích hoạt đúng** entry này, và đó là hành vi mong muốn (Groq có hỗ trợ `stream_options`).

**Gán kind cho từng client** `ĐỀ XUẤT` (nối §2.5 — đây là ví dụ cấu hình policy, không phải luật cứng):

| Client | `allowed_kinds_json` | Lý do |
|---|---|---|
| web (admin/user FlowGpt) | `["*"]` | Web là console chính, cần mọi kind kể cả provider trả tiền |
| app (fbuddy) | `["groq","huggingface"]` | Chỉ 2 provider free theo yêu cầu chủ dự án ⇒ app không tiêu tiền ngoài dự kiến |

Lưu ý: `allowed_kinds_json` lọc theo **kind**, nên nếu sau này admin thêm một provider `openai-compatible` trỏ tới gateway trả tiền thì app **không** tự động có quyền dùng — đúng như mong muốn. Muốn app dùng thêm thì phải sửa policy (§5.8).

### 4.3 Ghi chú tương thích (bắt buộc tuân thủ)

1. **Không gửi field mà gateway không hiểu.** Adapter bản web chỉ gửi: `model`, `messages`, `stream: true`, `temperature` (`openai.js:48-54`), và `tools`/`tool_choice` khi có tool (`openai.js:55-65`).
   - **Không** có `developer` role — role được dùng chỉ là `system|user|assistant|tool` (`openai.js:8-11`, `:13-45`).
   - **Không** có `reasoning_effort`.
   - ⇒ fbuddy `ĐỀ XUẤT`: **không thêm** 2 field này. Nếu sau này cần, phải gate bằng cờ năng lực **theo kind** (giống mẫu `supportsTools`/`supportsVision` ở `providers/index.js:142-144`), **không** bật mặc định.
2. **`stream_options` phải gate.** Chỉ gửi `{ include_usage: true }` khi kind nằm trong danh sách hỗ trợ (`openai.js:80,85-86`); caller có thể ép bằng `includeUsage` (`openai.js:85`). Danh sách hiện tại: `openai`, `deepseek`, `groq`, `openrouter`.
   - **Lưu ý:** `deepseek` cũng là dead entry (không có kind `deepseek`; DeepSeek đi qua `openai-compatible`) ⇒ fbuddy nên gate theo **kind đã đăng ký**, không theo tên model.
3. **Retry 1 lần khi gateway trả 400 vì `stream_options`.** Adapter đọc body, nếu khớp `/stream_options/i` thì xoá field và gửi lại **một lần** (`openai.js:100-107`). fbuddy giữ nguyên: đây là lưới an toàn cho gateway lạ.
4. **HF router và model id:** HF dùng model id có dạng `org/model`. `listModels` đọc `json.data` hoặc `json.models`, lấy `id ?? name` rồi `sort()` (`openai.js:185-188`) ⇒ tương thích, nhưng **không** nên hard-code model gợi ý cho HF vì list thay đổi liên tục.
5. **Groq và streaming:** Groq hỗ trợ SSE chuẩn OpenAI, và nằm trong danh sách `SUPPORTS_STREAM_USAGE` ⇒ giữ `stream_options`.
6. **Kiến trúc adapter dùng chung:** `openai` được tái sử dụng cho 4 kind (`ADAPTERS`, `index.js:9`). fbuddy thêm `groq` + `huggingface` **cùng trỏ vào module openai** — không viết adapter mới.

---

## 5. Luồng người dùng

### 5.1 Admin — thêm provider

Tham chiếu UI: modal ở `flowgpt/web/src/settings/ProviderModal.tsx`. Các field state: `name`, `kind`, `baseUrl`, `apiKey`, `clearKey`, `modelsText`, `defaultModel`, `imageModel`, `enabled` (`ProviderModal.tsx:24-33`).

Trình tự:

1. Chọn **Loại nhà cung cấp** (`kind`) → tự điền `defaultBaseUrl` + `models` gợi ý (`ProviderModal.tsx:145-153`; logic ở `ProviderModal.tsx:38-40` và `onKindChange`).
2. Ô **Base URL** chỉ hiện khi `kind !== "mock"`, hint lấy từ `info.keyHint` (`ProviderModal.tsx:155-163`).
3. Ô **API key**: hint = `keyHint` khi tạo mới; khi sửa thì để trống/giữ mask nghĩa là **không đổi key** (`ProviderModal.tsx:166-170`, cơ chế `looksMasked` ở `settings.js:9-11`).
4. `modelsText` nhận nhiều dòng hoặc phẩy — `normalizeModels()` tách theo `[\n,]` (`flowgpt/server/src/settings.js:13-22`).
5. **Lưu** → `POST /api/settings/providers` (`routes.js:597-605`).

**Validate phía server (fbuddy phải copy):** kind phải hợp lệ, tên không rỗng, và **`kind !== "mock"` thì bắt buộc có API key** (`flowgpt/server/src/settings.js:61-69`). Nếu `models` trống → lấy 3 model gợi ý đầu của kind (`settings.js:78`); `default_model` fallback về `models[0]` hoặc gợi ý đầu tiên (`settings.js:79`).

### 5.2 Admin — sửa / xoá

- **Sửa:** `PATCH /api/settings/providers/:id` (`routes.js:607-615`). Chỉ field có mặt trong body mới bị ghi (`settings.js:89-104`). Đổi `kind` được nhưng phải hợp lệ (`settings.js:91-94`). `apiKey: ""` → **xoá key** (`api_key_enc = null`, `settings.js:102`).
- **Xoá:** `DELETE /api/settings/providers/:id` (`routes.js:617-625`). Nếu provider đang là default → **tự động reset `defaultProviderId` và `defaultModel` về `null`** (`flowgpt/server/src/settings.js:108-114`). fbuddy giữ nguyên: nếu không, app sẽ trỏ vào provider đã chết.

### 5.3 Admin — nút Test

- Endpoint: `POST /api/settings/providers/:id/test` (`routes.js:627-649`).
- Timeout cứng **25 giây** bằng `AbortController` (`routes.js:635-636`).
- Model dùng để test: `req.body.model || provider.defaultModel` (`routes.js:634`).
- Gọi `testProvider()` = 1 request **non-streaming** `max_tokens: 8`, nội dung `"ping"` (`openai.js:192-210`).
- Nếu body có `listModels: true` → gọi thêm `GET /models`, **bắt lỗi trả `null`** để test vẫn OK dù gateway không có `/models` (`routes.js:640-642`).
- Trả `{ ok, model, models, latencyMs, message }` (`routes.js:643`).
- **Lỗi trả về dạng `ok: false`, HTTP vẫn 200** (`routes.js:644-645`) ⇒ UI hiển thị message thay vì coi là lỗi mạng. fbuddy giữ nguyên.
- fbuddy `ĐỀ XUẤT`: thêm (a) ghi audit `provider.test`, (b) tuỳ chọn test **cả stream** vì stream là đường đi thật của chat — bản web chỉ test non-stream, còn `configure-provider.mjs` mới test stream (`ops/configure-provider.mjs:158-176`).

### 5.4 Chọn provider/model mặc định

> **Áp dụng cho CẢ web và app** (§2.2). Đây là điểm cốt lõi của yêu cầu chủ dự án: admin đặt default ở đây **một lần**, app dùng đúng giá trị đó ở lượt chat kế tiếp — không có bước "cấu hình lại trên app".
> Lưu ý: default là **cấu hình chung**; policy theo client (§2.5) chỉ **thu hẹp** tập ứng viên, không ghi đè default.

UI: tab **Hệ thống** (`flowgpt/web/src/settings/SettingsPage.tsx:12`, component `AppTab.tsx`).

- Dropdown "Nhà cung cấp mặc định": **chỉ liệt kê provider đang bật** (`AppTab.tsx:186-190`), có option rỗng "— Tự động chọn nhà cung cấp đang bật đầu tiên —" (`AppTab.tsx:185`).
- Khi đổi provider → **reset `defaultModel` về `null`** (`AppTab.tsx:183`) để tránh giữ model của provider cũ.
- Dropdown "Model mặc định" lọc theo provider đã chọn; option rỗng "— Dùng model mặc định của nhà cung cấp —" (`AppTab.tsx:197-214`).
- Lưu: `PUT /api/settings/app` với `{ settings: patch }` (`routes.js:557-566`), ghi audit `settings.update`.
- Nguồn dữ liệu cho dropdown: `GET /api/models` → `listModelsForUi()` (`routes.js:430-432`), gộp mọi provider đang bật, mỗi item có `providerId`, `providerName`, `model`, `isDefault`, `hasKey`, `supportsTools/Vision/Images` (`flowgpt/server/src/settings.js:189-214`).

### 5.5 Chọn model theo từng cuộc trò chuyện

- Conversation **lưu `provider_id` + `model`** trong bảng `conversations` (`flowgpt/server/src/db.js:30-31`).
- Tạo conversation nhận `providerId`/`model` từ body (`routes.js:253-254`), sửa qua `PATCH /api/conversations/:id` (`routes.js:269+`).
- UI: picker trong composer, value dạng `"<providerId>::<model>"` (`flowgpt/web/src/chat/Composer.tsx:271-281`), nhãn hiển thị `"{providerName} · {model}"`; khi không chọn thì hiện "Mô hình mặc định" (`Composer.tsx:341`).
- Thứ tự ưu tiên khi chạy 1 lượt — `resolveProviderForChat()` (`flowgpt/server/src/settings.js:125-170`):
  1. `providerId` chỉ định cho lượt,
  2. → `settings.defaultProviderId`,
  3. → provider **đang bật đầu tiên**.
  Model: `model` chỉ định → `settings.defaultModel` (nếu provider đó là default của app) → `provider.default_model` → `provider.models[0]` (`settings.js:160-165`).
- fbuddy giữ đúng chuỗi ưu tiên này.

### 5.6 Hiển thị usage / chi phí

- Adapter phát event `usage` khi `finish_reason` tới và `usage_final` sau vòng lặp (`openai.js:158,162`), map `prompt_tokens`/`completion_tokens` hoặc `input_tokens`/`output_tokens` (`openai.js:125-130`).
- Agent nhận và phát tiếp SSE `usage` (`flowgpt/server/src/agent.js:337-340,375`).
- UI hiển thị dưới mỗi câu trả lời: tên provider, model (mono), `"{in} vào · {out} ra token"` (`flowgpt/web/src/chat/MessageItem.tsx:135-143`; bản turn: `:220-223`).
- Lưu lượng token vào bảng `usage_log` (`flowgpt/server/src/db.js:138-148`) gồm `user_id`, `conversation_id`, `provider_id`, `model`, `tokens_in`, `tokens_out`, index theo `created_at DESC`.

**Về "chi phí":** bản web **không** tính tiền. Không có cột giá, không có bảng giá model, UI chỉ hiện **token**. fbuddy `ĐỀ XUẤT`: hiển thị token (bắt buộc, giống bản web) và **chưa** làm chi phí; nếu chủ dự án cần tiền thì phải thêm `priceInPerMtok`/`priceOutPerMtok` vào metadata kind — việc này **ngoài** bộ tính năng bản web.

### 5.7 Cảnh báo khi thiếu key hoặc bị rate-limit

Ba tầng, đều đã có ở bản web:

1. **Ẩn/đánh dấu provider thiếu key.** `listModelsForUi()` tính `ready` và trả `hasKey` cho từng model (`settings.js:197,205`) → UI biết model nào không dùng được.
2. **Nhắc lúc bắt đầu lượt (thiếu key).** Nếu provider mặc định không có key, `resolveProviderForChat` đổi sang provider sẵn sàng và trả `fallbackFrom` với `reason: "missing_api_key"` (`settings.js:143-146`); agent phát `notice`: `Nhà cung cấp mặc định "X" chưa có API key nên lượt này dùng "Y".` (`flowgpt/server/src/agent.js:123-126`). UI hiện toast info (`flowgpt/web/src/state/chat.tsx:179`).
3. **Nhắc giữa lượt (rate-limit/hết tiền).** Agent phát `notice`: `Nhà cung cấp "X" không dùng được (<lý do, cắt 160 ký tự>). Lượt này chuyển sang "Y".` (`agent.js:363-367`), UI lưu vào turn và hiển thị (`flowgpt/web/src/state/chat.tsx:326-327`).

**Chưa có ở bản web** `ĐỀ XUẤT` cho fbuddy: cờ cảnh báo **chủ động** trước khi gửi (ví dụ badge "provider đang bị 429, thử lại sau 30s"). Bản web chỉ phát hiện **sau khi** request thất bại.

### 5.8 Admin — quản lý app client & policy `ĐỀ XUẤT`

> Đây là màn hình **mới** cần thêm vào web console (§2.4, §2.5, §3.5). Bản web hiện chưa có.
> Nguyên tắc: **chỉ web admin** quản lý client; app **không** tự đăng ký, **không** tự đổi policy.

Trình tự:

1. **Tạo client**: admin đặt `name` (ví dụ "fbuddy Android") → backend sinh **token mờ ngẫu nhiên**, trả **một lần duy nhất** cho admin, DB chỉ lưu `token_hash` + `token_prefix` (§2.4).
2. **Cấu hình policy**: chọn provider/kind/model được phép + `rate_limit_per_min` + `daily_token_budget` (§3.5).
3. **Thu hồi**: `enabled = 0` hoặc xoá row ⇒ request kế tiếp từ app bị từ chối **ngay**, không cần build lại app (§2.3 điểm 6).
4. **Xem tình hình**: `last_seen_at`, token đã dùng (từ `usage_log` lọc theo `client_id`).

Endpoint `ĐỀ XUẤT` (đặt cạnh nhóm `/settings/*` sẵn có, cùng `requireAdmin` — `flowgpt/server/src/auth.js:121-127`):

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/settings/clients` | Danh sách client; **chỉ trả `tokenPrefix`**, không bao giờ trả token/hash |
| POST | `/api/settings/clients` | Trả token thô **một lần** trong response `{ client, token }` |
| PATCH | `/api/settings/clients/:id` | Đổi `name`, `enabled` |
| DELETE | `/api/settings/clients/:id` | Thu hồi |
| POST | `/api/settings/clients/:id/rotate` | Sinh token mới, vô hiệu token cũ |
| GET/PUT | `/api/settings/clients/:id/policy` | Đọc/ghi policy |

**Audit bắt buộc** cho mọi thao tác trên (nhất quán với `provider.create/update/delete` — `routes.js:602,612,622`): action `client.create` / `client.update` / `client.delete` / `client.rotate` / `client.policy_update`.

> ⚠️ **Tuyệt đối không** ghi token thô vào `audit_log.detail_json`. Chỉ ghi `client.id` + `name`. Đây là cùng loại rủi ro như ghi API key provider (§3.4) — và vì `detail_json` hiện chỉ ghi **tên field** (`routes.js:612`) nên **giữ nguyên** cách đó là an toàn.

**Quan hệ với §5.4:** `defaultProviderId`/`defaultModel` vẫn là cấu hình **chung** cho cả web và app. Policy của client **không** thay thế default đó — nó chỉ **thu hẹp** tập ứng viên khi lượt chat của client đi qua `resolveProviderForChat` (§2.5).

**Quan hệ với §5.5:** app cũng có thể chọn model theo từng cuộc trò chuyện như web (`conversations.provider_id`/`model`, `db.js:30-31`), nhưng danh sách model app nhận từ `GET /api/models` **đã bị lọc theo policy** ⇒ app không thể chọn model ngoài phạm vi ngay cả khi tự gửi `providerId`/`model` tuỳ ý.

---

## 6. Fallback & rate-limit

### 6.1 Thứ tự ưu tiên — vấn đề và đề xuất

**Hiện trạng bản web (đã xác minh):** thứ tự fallback **hoàn toàn ngầm** theo `created_at`:

- `listProviderRows()` = `all("providers", "", [], { order: "created_at ASC" })` — `flowgpt/server/src/settings.js:48-50`.
- `resolveProviderForChat` chọn `rows.find(isReady)` theo thứ tự đó — `settings.js:146`.
- `nextUsableProvider` chọn `ready[0]` theo thứ tự đó — `settings.js:182`.
- `switchToFallbackProvider` duyệt `listProviderRows()` — `flowgpt/server/src/agent.js:248`.

⇒ Provider thêm **sớm nhất** được ưu tiên. Hệ quả xấu: không thể đẩy Groq lên trước một provider cũ mà **không xoá và tạo lại** nó; "provider dự phòng" chỉ là "provider cũ thứ hai".

**`ĐỀ XUẤT` cho fbuddy:** thêm cột `priority INTEGER NOT NULL DEFAULT 100` và đổi thứ tự thành:

```
ORDER BY priority ASC, created_at ASC
```

- Số **nhỏ hơn = ưu tiên cao hơn** (giống nice/priority của scheduler).
- Provider `enabled = 0` luôn bị loại trước khi xét (`settings.js:127,178`, `agent.js:249`).
- Default `100` ⇒ mọi provider cũ giữ nguyên hành vi cho tới khi admin chỉnh.
- Cho phép sửa `priority` qua `PATCH /api/settings/providers/:id` (thêm nhánh `if (patch.priority !== undefined)` cạnh `settings.js:95-99`).
- **Tương thích ngược:** migration `ALTER TABLE providers ADD COLUMN priority INTEGER NOT NULL DEFAULT 100`. Không cần backfill.

### 6.2 Fallback tầng 1 — lúc chọn provider (thiếu key)

Trigger: provider được chỉ định (từ lượt / default app) **không có key** hoặc không `enabled`.

- "Ready" = `kind === "mock"` **hoặc** giải mã được key: `settings.js:137`, `:179`.
- Nếu default không ready → chọn provider ready đầu tiên, trả `fallbackFrom = { id, name, reason: "missing_api_key" }` (`settings.js:144-146`).
- Nếu **không còn provider nào** ready → ném `ApiError(400)` với thông báo tiếng Việt hướng dẫn vào Cài đặt (`settings.js:147-155`).
- Nếu chọn được provider nhưng **không có model nào** → `ApiError(400)` (`settings.js:166-168`).
- Không có provider nào `enabled` → `ApiError(400)` (`settings.js:128-134`).

### 6.3 Fallback tầng 2 — giữa lượt chat (lỗi provider)

**Điều kiện kích hoạt** — `isProviderCreditError()` (`flowgpt/server/src/agent.js:237-242`):

- Theo **HTTP status**: `401`, `402`, `403`, `429` (`agent.js:240`).
- Theo **nội dung message** (regex, không phân biệt hoa thường): `余额|欠费|quota|balance|credit|insufficient|billing|rate.?limit|invalid.?api.?key|unauthor` (`agent.js:241`).

**Điều kiện bắt buộc để được đổi** (`agent.js:356-357`) — **tất cả** phải đúng:

- `iteration === 0` (chỉ ở vòng đầu),
- `!text` và `!iterationText` (chưa stream chữ nào),
- `!pendingCalls.length` (chưa có tool call nào).

⇒ **Đây là quy tắc quan trọng nhất:** đã stream chữ thì **không** đổi provider, mà ném lỗi ra ngoài. Lý do: đổi giữa chừng sẽ tạo câu trả lời lai 2 model, người dùng thấy văn phong nhảy. fbuddy **phải giữ nguyên**.

**Cơ chế đổi** (`agent.js:358-372`):

- `switchToFallbackProvider({ failed, attemptedIds })` duyệt các provider đang bật, **bỏ qua** id đã thử và id vừa lỗi (`agent.js:245-254`).
- Mỗi provider **thử đúng 1 lần**: `attemptedProviderIds` khởi tạo bằng provider đầu (`agent.js:266`) và `push` mỗi lần đổi (`agent.js:362`).
- Sau khi đổi: phát `notice` (`agent.js:363-367`), gán `provider`/`model` mới (`agent.js:368-369`), rồi `iteration -= 1; continue;` để **chạy lại đúng vòng đó** (`agent.js:371-372`).
- Hết provider để đổi → ném lỗi gốc (`agent.js:361`). Test chứng minh: khi mọi provider hết tiền thì trả đúng 1 event `error` khớp `/429|充值|余额/` (`flowgpt/server/test/failover.test.js`, test "when every provider is out of credit…").

**Chi tiết dễ sai — model KHÔNG mang sang provider mới.** `switchToFallbackProvider` gọi `nextUsableProvider({ excludeId: null, providerId: row.id })` (`agent.js:250`) — **không** truyền `model`. Trong `nextUsableProvider`, `model` mặc định `null` ⇒ rơi xuống `runtime.defaultModel → runtime.models[0]` của provider dự phòng (`settings.js:184`). fbuddy phải giữ: model của Groq không gửi được cho HF.

**Log rõ provider/model đã trả lời:** bản web lưu `provider_id` + `model` **trên message** (`flowgpt/server/src/db.js:51-52`) và ghi `usage_log` (`db.js:138-148`). Nhờ vậy sau khi fallback, message ghi đúng provider/model **thực tế** đã trả lời, không phải provider đã chọn ban đầu. fbuddy **bắt buộc** giữ điểm này — nếu không, không thể truy vết chi phí/lỗi.

### 6.4 Ma trận quyết định (tóm tắt)

| Tình huống | Hành vi |
|---|---|
| Không có provider `enabled` | `ApiError(400)` + hướng dẫn vào Cài đặt (`settings.js:128-134`) |
| Provider chọn bị thiếu key, còn provider khác ready | Đổi provider + `notice` `missing_api_key` (`settings.js:144-146`, `agent.js:123-126`) |
| Provider được chọn có key, lỗi 500 / context-length | **Không** fallback, ném lỗi (`agent.js:241` — 500 và "context length exceeded" không khớp regex; test khẳng định ở `failover.test.js`) |
| Lỗi 401/402/403/429 ở **vòng đầu**, chưa stream | Đổi provider, thử lại vòng đó (`agent.js:356-372`) |
| Lỗi như trên nhưng **đã stream chữ** | Ném lỗi, không đổi provider (`agent.js:357`) |
| Lỗi ở vòng ≥ 2 (đang chạy tool) | Ném lỗi, không đổi provider (`agent.js:357`: `iteration === 0`) |
| Mọi provider đều lỗi | Ném lỗi gốc; UI nhận 1 event `error` (`agent.js:361`, `routes.js:317`) |
| Đã dùng hết provider chưa thử | Dừng, không lặp vô hạn (`agent.js:266,362`) |
| **Client app:** provider được phép lỗi 429, còn provider **ngoài policy** đang bật | **Ném lỗi — KHÔNG được fallback** sang provider ngoài policy (§6.5) `ĐỀ XUẤT` |
| **Client app:** không có provider nào trong policy | `ApiError(400)` rõ ràng ("client chưa được cấp provider"), **không** rơi về provider toàn cục (§6.5) `ĐỀ XUẤT` |

### 6.5 Ràng buộc policy theo client trong fallback — `ĐỀ XUẤT`

Yêu cầu "web và app dùng chung backend" (§2) đặt ra một ràng buộc mới cho fallback: **tập ứng viên fallback phải bị lọc theo client**.

**Vấn đề:** cả ba hàm chọn provider đều đọc `listProviderRows()` mà **không** biết request đến từ client nào:

- `resolveProviderForChat()` — `flowgpt/server/src/settings.js:127`.
- `nextUsableProvider()` — `settings.js:178`.
- `switchToFallbackProvider()` — `flowgpt/server/src/agent.js:248`.

⇒ Nếu chỉ lọc ở `resolveProviderForChat`, một lượt của app có thể **thoát policy** ngay khi provider đầu tiên trả 429: `switchToFallbackProvider` sẽ quét **toàn bộ** provider đang bật và có thể chọn provider trả tiền.

**Cách sửa `ĐỀ XUẤT`:**

1. Thêm tham số `policy` (hoặc `client`) vào **cả ba** hàm:
   - `resolveProviderForChat({ providerId, model, policy })`
   - `nextUsableProvider({ excludeId, providerId, model, policy })`
   - `switchToFallbackProvider({ failed, attemptedIds, policy })`
2. Tạo **một** hàm lọc duy nhất (ví dụ `isProviderAllowedForClient(row, policy)`) và gọi nó ở cả ba chỗ — **không** viết lại điều kiện lọc ở mỗi nơi (tránh lệch nhau).
3. `policy = null` (web/admin) ⇒ hành vi **y hệt hiện tại** — đây là điều kiện để không phá web đang chạy (§2.7).
4. Lọc theo `enabled` (`settings.js:127,178`, `agent.js:249`) **giữ nguyên**; policy là lớp lọc **thêm**, áp sau.

**Test bắt buộc** (§9.2): "app gặp 429 ở provider được phép ⇒ **lỗi**, tuyệt đối không nhảy sang provider ngoài policy". Đây là ca dễ hồi quy nhất vì `switchToFallbackProvider` là code có sẵn và trông như đã đúng.

**Nhất quán với §5.8:** danh sách model app nhận từ `GET /api/models` cũng lọc theo policy ⇒ app **không** thấy và **không** chọn được provider ngoài phạm vi; nhưng vẫn phải chặn ở tầng fallback vì app có thể tự gửi `providerId` tuỳ ý trong body chat.

---

## 7. API surface

Tiền tố: router gắn ở `/api` (`flowgpt/server/src/index.js:59`).

> **Đây là hợp đồng API DÙNG CHUNG cho web và app (§2.6).** App chỉ cần đổi base URL là chạy — không có "API riêng cho app", nên không có nguy cơ hai bên lệch hành vi.
> Endpoint dưới đây **giống bản web** để app dùng lại được ngay; phần `ĐỀ XUẤT` là bổ sung cho lớp client.

### 7.0 Ai gọi được cái gì

| Endpoint | web | app | Middleware |
|---|---|---|---|
| `POST /api/chat/stream` | ✅ | ✅ | `requireAuth` **hoặc** `requireClient` `ĐỀ XUẤT` |
| `GET /api/models` | ✅ | ✅ | như trên — kết quả **lọc theo policy** nếu là app |
| `POST\|PATCH /api/conversations*` | ✅ | ✅ | như trên |
| `GET /api/usage` | ✅ | ✅ | `ĐỀ XUẤT` — app chỉ thấy usage của chính mình |
| `GET /api/health` | ✅ | ✅ | công khai (`index.js:40`) |
| `/api/settings/**` | ✅ (admin) | ❌ | `requireAdmin` (`auth.js:121-127`) — app **không** ghi cấu hình (§2.2) |

**Cơ chế token (đã xác minh):** `tokenFromRequest` nhận `Authorization: Bearer …` **hoặc** cookie `flowgpt_token` (`flowgpt/server/src/auth.js:92-99`); `currentUser` verify JWT rồi so `tv` với `token_version` (`auth.js:101-111`). Header `Authorization` **đã** nằm trong CORS allow-list (`index.js:29`) ⇒ app dùng `Bearer` không cần đổi CORS.

`ĐỀ XUẤT`: thêm middleware `requireClient` chạy **song song** (không thay thế) `requireAuth`, đặt `req.client` và `req.clientPolicy`; mọi hàm chọn provider nhận `policy` từ đây (§6.5).

### 7.1 Endpoint hiện có của bản web

| Method | Path | Quyền | Trả về | Dẫn chứng |
|---|---|---|---|---|
| GET | `/api/settings/provider-kinds` | admin | `{ items: PROVIDER_KINDS }` | `routes.js:545-547` |
| GET | `/api/settings/app` | admin | `{ settings, defaults, mailer }` | `routes.js:549-555` |
| PUT | `/api/settings/app` | admin | `{ settings, mailer }` | `routes.js:557-566` |
| GET | `/api/settings/providers` | admin | `{ items: Provider[] }` | `routes.js:593-595` |
| POST | `/api/settings/providers` | admin | `201 { provider }` | `routes.js:597-605` |
| PATCH | `/api/settings/providers/:id` | admin | `{ provider }` | `routes.js:607-615` |
| DELETE | `/api/settings/providers/:id` | admin | `{ ok: true }` | `routes.js:617-625` |
| POST | `/api/settings/providers/:id/test` | admin | `{ ok, model, models, latencyMs, message }` | `routes.js:627-649` |
| GET | `/api/models` | user | `{ items: ModelOption[] }` | `routes.js:430-432` |
| POST | `/api/chat/stream` | user | SSE | `routes.js:299`, body `routes.js:253-254` |
| POST/PATCH | `/api/conversations`, `/api/conversations/:id` | user | conversation có `providerId`/`model` | `routes.js:245-255`, `:269+` |

Tất cả endpoint `/settings/*` dùng middleware `requireAdmin` (`routes.js:545` và các dòng tương ứng).

### 7.2 Shape `Provider` trả ra client (không có key thô)

Theo `publicProvider()` (`flowgpt/server/src/settings.js:26-46`):

```
{ id, name, kind, baseUrl, models[], defaultModel, imageModel,
  enabled, hasApiKey, apiKeyPreview,
  supportsImages, supportsTools, supportsVision,
  createdAt, updatedAt }
```

`apiKeyPreview` dạng `"AIzaSy…4f2"` (`crypto.js:115-120`). **Tuyệt đối không** có field chứa key thô.

### 7.3 Shape `ProviderKind` cho UI

Theo `PROVIDER_KINDS` (`flowgpt/server/src/providers/index.js:12-112`):

```
{ id, label, defaultBaseUrl, suggestedModels[], defaultImageModel,
  supportsImages, supportsTools, supportsVision, keyHint }
```

### 7.4 Payload POST / PATCH provider

Theo `createProvider()` (`settings.js:60-84`) và `updateProvider()` (`settings.js:86-106`):

```
POST  { name, kind, baseUrl?, apiKey, models?, defaultModel?, imageModel?, enabled? }
PATCH { name?, kind?, baseUrl?, apiKey?, models?, defaultModel?, imageModel?, enabled? }
```

Quy ước `apiKey`:

- Tạo mới: bắt buộc (trừ `mock`) — `settings.js:67-69`.
- PATCH `apiKey: ""` → **xoá key** (`settings.js:102`).
- PATCH `apiKey: "__KEEP__"` hoặc chuỗi mask → **giữ key cũ** (`settings.js:7-11,103`).

`models` nhận **mảng hoặc chuỗi** (tách `[\n,]`) — `settings.js:13-22`.

### 7.5 Bổ sung đề xuất cho fbuddy

**Cho lớp cấu hình provider (dùng chung):**

| Method | Path | Ghi chú |
|---|---|---|
| PATCH | `/api/settings/providers/:id` | thêm field **`priority`** vào body `ĐỀ XUẤT` (§6.1) |
| POST | `/api/settings/providers/:id/test` | thêm `{ stream: true }` để test cả đường SSE thật `ĐỀ XUẤT` |
| GET | `/api/settings/providers/:id/usage` | tổng token theo provider/model từ `usage_log` `ĐỀ XUẤT` — bản web chưa có endpoint này |

**Cho lớp client dùng chung (§2.4, §2.5, §5.8) `ĐỀ XUẤT`:**

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/api/settings/clients` | admin | Chỉ trả `tokenPrefix`, **không** trả token/hash |
| POST | `/api/settings/clients` | admin | Trả token thô **một lần** |
| PATCH | `/api/settings/clients/:id` | admin | `name`, `enabled` |
| DELETE | `/api/settings/clients/:id` | admin | Thu hồi |
| POST | `/api/settings/clients/:id/rotate` | admin | Xoay token, vô hiệu token cũ |
| GET/PUT | `/api/settings/clients/:id/policy` | admin | Đọc/ghi policy (§3.5) |

**Cho cả hai client dùng chung:**

| Method | Path | Quyền | Response gợi ý |
|---|---|---|---|
| GET | `/api/usage` | user **hoặc** client | `{ items: [{ providerId, providerName, model, client, tokensIn, tokensOut, createdAt }], totals: { in, out } }` — app chỉ thấy `client_id` của chính mình |

**Payload chat app gửi** `ĐỀ XUẤT` — **giống hệt web**, chỉ khác header:

```
POST /api/chat/stream
Authorization: Bearer <app token>
{ "content": "...", "skill": "chat", "providerId": "<tuỳ chọn>", "model": "<tuỳ chọn>" }
```

`providerId`/`model` vẫn nhận từ body (`routes.js:253-254`) nhưng **bị kiểm tra theo policy** — gửi provider ngoài phạm vi phải trả lỗi rõ ràng, **không** âm thầm dùng provider khác.

### 7.6 SSE event của lượt chat

Phát bởi agent: `start` (`agent.js:169`), `status` (`:309,477`), `delta` (`:329`), `reasoning` (`:332`), `notice` (`:363`), `usage` (`:375`), `tool_call` (`:397`), `artifact` (`:463`), `tool_result` (`:465`), `error` (`:496`), `done` (`:497,516`).

Hai event liên quan trực tiếp tính năng model:

- `notice` — lý do đổi provider (`agent.js:363-367`).
- `usage` — `{ in, out }` (`agent.js:375`, `openai.js:125-130`).

---

## 8. Kế hoạch triển khai theo bước

> **Kế hoạch đã đổi theo kiến trúc dùng chung (§2).** Trước đây Bước B là "port backend sang fbuddy".
> Nay **không port gì cả**: sửa **backend dùng chung** (Bước B), rồi sửa **app thành client** (Bước C).

### 8.0 Tiền đề — điều tra còn thiếu (chặn mọi bước sau)

1. Chưa biết app (fbuddy) viết bằng gì ⇒ **phải trả lời §10 Q1–Q3**.
2. Nhưng **khác trước**: app **không cần** cùng stack với backend nữa, vì app chỉ gọi HTTP (§2.6). Stack của app chỉ quyết định **cách** gọi API, **không** quyết định schema/sinh tử của thiết kế.
3. Điều **thực sự** chặn Bước B: chốt mô hình policy (§2.5) và cách phát hành app token (§2.4).

- **Bước A** làm được **ngay**, không cần source app.
- **Bước B** sửa **backend dùng chung** (repo này: `flowgpt/`) — cũng **không** cần source app.
- **Bước C** cần source app (`/opt/agent-bus`).

### Bước A — Làm ngay, không cần source app

| # | Việc | Sản phẩm | Vì sao làm được ngay |
|---|---|---|---|
| A1 | **Chuẩn hoá "hợp đồng API dùng chung"**: chốt JSON schema `providers` + `app_settings` + `api_clients`/`client_policies` + shape API (§3, §7) | `docs/` spec hoặc JSON schema | Chỉ là thiết kế, không phụ thuộc runtime |
| A2 | **Viết script test key độc lập** cho Groq + HF: 1 chat non-stream, 1 stream, 1 lần key sai — chạy bằng `node`, đọc key từ FILE, **không** in key | `ĐỀ XUẤT` script trong `flowgpt/ops/` | Không cần app; chứng minh provider chạy thật **trước** khi tích hợp |
| A3 | **Xác minh HF router thực sự OpenAI-compatible** (`POST /chat/completions`, `GET /models`, SSE) | Kết quả chạy A2 | Là giả định **chưa** có bằng chứng trong repo (§4.2) |
| A4 | **Xác minh Groq hỗ trợ `stream_options`** (đối chiếu `openai.js:80`) và có trả `usage` trong stream | Kết quả chạy A2 | Xác nhận/bác bỏ dead entry |
| A5 | Chốt `priority` vs `created_at` (§6.1) | Chủ dự án chốt | Quyết định thiết kế |
| A6 | Chốt **ngữ nghĩa policy rỗng = chặn hết (deny-by-default)** (§3.5) | Chủ dự án chốt | Nếu chọn "rỗng = tất cả" thì đó là lỗ hổng tiềm ẩn |
| A7 | Chốt **policy khởi điểm** cho app: chỉ `["groq","huggingface"]`? (§4.2) | Chủ dự án chốt | Ảnh hưởng trực tiếp tới chi phí |

**Vì sao A2/A3/A4 quan trọng:** biến 2 giả định chưa kiểm chứng (HF router OpenAI-compatible; Groq hỗ trợ usage-in-stream) thành dữ kiện. Nếu HF **không** OpenAI-compatible thì phải viết adapter riêng — đổi khối lượng công việc, nên phải biết **trước**.

### Bước B — Sửa BACKEND DÙNG CHUNG (repo `flowgpt/`)

Đây là phần lớn nhất, và **không** cần source app. Mọi thay đổi phải **tương thích ngược** với web đang chạy (§2.7).

| # | Việc | Dẫn chứng / ghi chú |
|---|---|---|
| **B1** | Thêm kind `groq` + `huggingface` vào `PROVIDER_KINDS` + `ADAPTERS` (cùng trỏ `openai`) | `providers/index.js:9,12-112` — sửa **một chỗ**, cả web và app cùng thấy |
| **B2** | Thêm cột `priority` + đổi `ORDER BY priority ASC, created_at ASC` | `settings.js:48-50`; migration `ALTER TABLE … DEFAULT 100` (§6.1) |
| **B3** | Migration: bảng `api_clients` + `client_policies` | §3.5; convention `node:sqlite`, boolean 0/1 (`db.js:8-9`) |
| **B4** | Middleware `requireClient` + hash-token lookup; **giữ nguyên** `requireAuth`/`requireAdmin` | `auth.js:114-127`; dùng `Authorization: Bearer` đã có (`auth.js:92-99`, `index.js:29`) |
| **B5** | Hàm lọc policy **duy nhất** + truyền `policy` vào **cả ba** điểm chọn provider | `settings.js:127,178`, `agent.js:248` — ⚠️ xem §6.5, đây là chỗ dễ hở nhất |
| **B6** | Lọc `GET /api/models` theo policy của client | `routes.js:430-432`, `settings.js:189-214` |
| **B7** | Thêm endpoint quản lý client + policy (§5.8) + audit `client.*` | `requireAdmin` (`auth.js:121-127`), mẫu audit `routes.js:602,612,622` |
| **B8** | Thêm `/api/usage` (lọc theo client) | `usage_log` (`db.js:138-148`) |
| **B9** | Thêm cột `client`/`client_id` vào `usage_log` + `audit_log`; thêm `client`/`clientId` vào request log | `db.js:138-157`, `index.js:38-57` — hiện log **không** có danh tính client (§2.8) |
| **B10** | Thêm audit `provider.test` (đang thiếu) | `routes.js:628-649` — endpoint gửi request thật mà không audit (§3.4) |
| **B11** | CORS: thêm biến cho origin của client app (nếu app chạy trong trình duyệt) | `index.js:19-26`, `config.js:51,60-64` |
| **B12** | UI web console: tab quản lý app client + policy | §5.8; theo mẫu `ProvidersTab.tsx` / `SettingsPage.tsx:10-13` |
| **B13** | Bộ test nghiệm thu (§9) — gồm các ca policy/fallback mới | §9.2, §9.4 |

### Bước C — Sửa APP thành client của backend dùng chung (cần `/opt/agent-bus`)

| # | Việc | Ghi chú |
|---|---|---|
| C1 | Đổi base URL trỏ về backend dùng chung (`/api`) | App chỉ cần HTTP client (§2.6) |
| C2 | Dùng **app token** qua `Authorization: Bearer` | Token do admin phát (§5.8); app **không** sinh/lưu token nhà cung cấp |
| C3 | **Xoá** mọi đường giữ/đọc API key nhà cung cấp khỏi app | §2.3 — mục tiêu bảo mật chính |
| C4 | Gọi `POST /api/chat/stream` + đọc SSE (đổi từ gọi nhà cung cấp) | Cùng event như web (§7.6) |
| C5 | Lấy danh sách model từ `GET /api/models` (đã lọc theo policy) | **Không** hard-code model trong app |
| C6 | Hiển thị `notice` (đổi provider) + `usage` cho người dùng | Cùng semantics như web (`chat.tsx:326-327`) |
| C7 | Thêm cờ `FBUDDY_LLM_MODE` (`shared` mặc định, `direct` tạm) | §2.7 — **không** để mặc định là `direct` |
| C8 | Xử lý lỗi khi backend không tới được | Đánh đổi của kiến trúc (§2.3): app phụ thuộc backend |

### Bước D — Vận hành

- CLI thêm provider đọc key từ file, verify chat + stream, rồi **xoá file key** (mẫu: `flowgpt/ops/configure-provider.mjs:1-15` và bước 6 cuối file).
- CLI đổi model + verify (mẫu: `flowgpt/ops/switch-model.mjs`).
- CLI/endpoint phát hành app token (§5.8); runbook thu hồi token.
- Runbook xoay `FLOWGPT_SECRET` (nhắc lại: **vô hiệu hoá toàn bộ key đã lưu + mọi session**, §3.3).
- Cảnh báo hết quota provider (§2.8) — đặt ở backend vì đó là nơi duy nhất thấy lỗi của nhà cung cấp.
- **Kế hoạch hết hạn cho `FBUDDY_LLM_MODE=direct`** (§2.7): ghi ngày xoá, không để tồn tại vô thời hạn.

### 8.1 Thứ tự ưu tiên đề xuất

1. **A2/A3/A4** — chứng minh 2 provider free chạy thật (nếu sai thì đổi thiết kế policy).
2. **B1/B2** — kind mới + `priority` (giá trị thấy ngay ở web, rủi ro thấp).
3. **B3/B4** — `api_clients` + `requireClient` (nền của mọi thứ phía app).
4. **B5/B6** — lọc policy ở cả 3 điểm chọn provider (**làm cùng nhau**, xem §6.5).
5. **B7/B8/B9/B10** — quản lý client, usage, log theo client, audit.
6. **C1–C6** — app chuyển sang gọi backend dùng chung (chạy song song ở P1, §2.7).
7. **B11/B12** — CORS + UI console.
8. **C7/C8 + D** — cắt chế độ `direct`, vận hành, test đầy đủ.

## 9. Test / nghiệm thu

> **Nơi đặt test đã đổi theo kiến trúc dùng chung (§2):** test cho **provider, fallback, policy, token** nằm ở **backend dùng chung** (thư mục `flowgpt/server/test/`), **không** nằm trong app. App chỉ cần một bộ test **tích hợp mỏng** kiểm tra "gọi được backend dùng chung + đọc SSE đúng".
> Lý do: logic đã chuyển hết vào backend (§2.3) ⇒ test ở backend là nơi **duy nhất** có thể chứng minh hành vi cho **cả** web và app.

### 9.1 Chứng minh từng provider chạy thật

Với **mỗi** provider (Groq, HF, và 1 provider `openai-compatible` bất kỳ), chạy 3 phép thử và lưu output:

| # | Phép thử | Kỳ vọng | Mẫu trong repo |
|---|---|---|---|
| T1 | **1 request chat non-stream** | HTTP 200, có nội dung trả lời, in `latencyMs` | `testConnection()` `openai.js:192-210` |
| T2 | **1 request stream** | Nhận ≥ 1 event `delta` có chữ; nếu provider hỗ trợ thì có thêm `usage` | Vòng lặp stream trong `ops/configure-provider.mjs:158-176` |
| T3 | **1 lần key sai** (key rác) | Thất bại **sạch**: 401/403, message đọc được, **không** rò key trong log | `isProviderCreditError` phải nhận diện 401 (`agent.js:240`) |
| T4 | **`GET /models`** | Trả danh sách model thật; nếu 404 thì ghi nhận "không có /models nhưng chat OK" | `ops/configure-provider.mjs:88-101` (đã xử lý đúng ca này) |

**Bằng chứng cần dán vào báo cáo:** lệnh đã chạy + output thật (theo `AGENTS.md` §4), **đã che key**. Không dán key, kể cả key test.

**Lưu ý về Groq:** repo đã có tiền lệ Groq qua `kind: "openai-compatible"` + base URL `https://api.groq.com/openai/v1` trong `flowgpt/server/test/voice.test.js:103` (dùng key giả trong test). fbuddy dùng **kind `groq` first-class** nhưng cùng base URL.

### 9.2 Chứng minh fallback chạy (giả lập 429)

Không cần gọi provider thật — **stub `fetch`**, đúng như bản web làm:

**Mẫu tham chiếu:** `flowgpt/server/test/failover.test.js`.

**Cách làm (thêm test vào backend dùng chung, cạnh `failover.test.js`):**

1. Tạo provider A (đặt làm default) có base URL trỏ tới host giả, và provider B là provider dự phòng thật.
2. Stub `fetch`: host của A → trả **429** kèm body lỗi; host của B → trả **SSE hợp lệ** có `delta` + `finish_reason` + `[DONE]`.
3. Chạy 1 lượt chat.
4. Khẳng định:
   - có **đúng 1** event `notice`,
   - `notice.message` nhắc tên provider A và "chuyển sang",
   - **đã gọi A trước** (`calls.some(url => url.includes(hostA))`),
   - **đã gọi B sau**, đúng path `/chat/completions`,
   - text cuối cùng là của B,
   - có ≥ 1 event `done`.
5. **Ca âm:** tất cả provider đều 429 → đúng **1** event `error`, message khớp `/429|quota|credit|rate/`.

**Các ca bắt buộc bổ sung cho fbuddy** (bản web chưa có test, `ĐỀ XUẤT`):

| Ca | Kỳ vọng |
|---|---|
| Đã stream chữ rồi mới lỗi | **Không** đổi provider; ném lỗi (`agent.js:357`) |
| Lỗi ở vòng 2 (sau tool call) | **Không** đổi provider (`agent.js:357`) |
| Lỗi **500** / context-length | **Không** đổi provider (test bản web khẳng định `isProviderCreditError` trả `false`, `failover.test.js`) |
| Mỗi provider thử đúng 1 lần | Không gọi lại provider đã thất bại (`attemptedProviderIds`) |
| Model không mang sang provider mới | Request tới B dùng `defaultModel` của B, **không** dùng model của A (`settings.js:184`) |
| Provider default bị xoá | `defaultProviderId`/`defaultModel` tự reset `null` (`settings.js:111-113`) |
| Thứ tự `priority` | Đổi `priority` → đổi provider được chọn, **kể cả khi `created_at` ngược lại** (chứng minh cột mới thực sự có tác dụng) |

**Cách chạy:** control-plane trong repo này dùng **Node built-in test runner** — `node --test`, `import test from "node:test"; import assert from "node:assert/strict";` (`AGENTS.md` §3). Bản web theo đúng chuẩn này (`flowgpt/server/test/failover.test.js:2-3`). fbuddy `ĐỀ XUẤT` dùng cùng runner, **không** thêm framework mới.

### 9.3 Nghiệm thu bảo mật (bắt buộc)

| # | Kiểm tra | Kỳ vọng |
|---|---|---|
| S1 | Gọi `GET /api/settings/providers` | Chỉ có `apiKeyPreview`, **không** có key thô |
| S2 | Dump bảng `providers` | Cột `api_key_enc` là blob `v1.<iv>.<ct>.<tag>`, **không** đọc được key |
| S3 | Grep log + audit_log sau khi thêm provider | **Không** xuất hiện key |
| S4 | PATCH với `apiKey` = giá trị preview | Key **không** đổi (`looksMasked`) |
| S5 | Đổi secret env rồi gọi API | `hasApiKey` = false (giải mã thất bại trả `null`, `crypto.js:109-111`); app **không** crash |
| S6 | `/api/settings/*` bằng token user thường | **403/bị chặn** (`requireAdmin`) |
| S7 | Key tạm trong file của CLI | File **bị xoá** sau khi chạy |
| S8 | **App token dùng để gọi `/api/settings/*`** | **403** — app **không** được ghi cấu hình (§2.2) `ĐỀ XUẤT` |
| S9 | **JWT của user web dùng làm app token** (và ngược lại) | **401** — hai cơ chế token **không** thay thế nhau được (§2.4) `ĐỀ XUẤT` |
| S10 | Gọi `POST /api/settings/clients` rồi đọc `GET /api/settings/clients` | Lần POST trả token **một lần**; các lần GET **chỉ** trả `tokenPrefix`, **không** hash, **không** token thô `ĐỀ XUẤT` |
| S11 | Grep `audit_log` sau khi tạo/xoay client | **Không** có token thô (§5.8) `ĐỀ XUẤT` |
| S12 | Thu hồi client (`enabled=0`) rồi gọi lại chat | **401**, có hiệu lực **ngay** (không cache token) `ĐỀ XUẤT` |

### 9.4 Nghiệm thu kiến trúc dùng chung (mới — bắt buộc) `ĐỀ XUẤT`

Đây là các ca **chứng minh yêu cầu "web và app dùng chung backend"** thực sự hoạt động. Phải chạy trên backend dùng chung (không cần app thật — dùng HTTP client + fixture).

| # | Ca kiểm tra | Kỳ vọng | Vì sao quan trọng |
|---|---|---|---|
| **X1** | Admin đổi `defaultModel` ở `/api/settings/app`; sau đó **app** chat | App dùng **đúng** model mới, **không** cần cấu hình lại | Đây chính là yêu cầu chủ dự án (§2.2) |
| **X2** | Admin thêm provider mới (Groq); app gọi `GET /api/models` | App thấy provider/model mới (nếu policy cho phép) | Chứng minh "một nguồn sự thật", không cache ở app |
| **X3** | Admin xoá/đổi key nhà cung cấp; app chat tiếp | App **không** cần đổi gì, **không** cần cập nhật app | Xoay key một chỗ (§2.3) |
| **X4** | **App gặp 429 ở provider được phép, còn provider ngoài policy đang bật** | **Lỗi** — **KHÔNG** fallback ra ngoài policy | ⚠️ Ca dễ hở nhất (§6.5) |
| **X5** | App **tự gửi** `providerId` ngoài policy trong body chat | **Lỗi 4xx** rõ ràng, không âm thầm đổi provider | App không được vượt policy bằng body (§7.5) |
| **X6** | App gọi `GET /api/models` | **Chỉ** thấy model trong policy (app free ⇒ chỉ Groq/HF) | §2.5 |
| **X7** | Client **không có** row policy | **Chặn hết**, lỗi rõ ràng — không rơi về provider toàn cục | Ngữ nghĩa deny-by-default (§3.5) |
| **X8** | Web chat (không policy) | Hành vi **y hệt trước khi sửa** — mọi provider vẫn dùng được | Tương thích ngược (§2.7) |
| **X9** | Một lượt web + một lượt app, sau đó `GET /api/usage` | Tách đúng `client = web` và `client = app` | Vận hành một chỗ (§2.8) |
| **X10** | Dump `providers` + tìm key nhà cung cấp trong **bundle/mã của app** | Không có key nào trong app | Mục tiêu bảo mật chính (§2.3) |
| **X11** | Chạy app với `FBUDDY_LLM_MODE=direct` rồi `=shared` | Ghi log rõ `mode` đã dùng; `shared` là mặc định | Kiểm soát giai đoạn chuyển đổi (§2.7) |

**Ghi chú về X1–X3:** đây là các ca **hợp đồng kiến trúc**, không phải ca logic đơn lẻ. Nên viết thành test tích hợp (boot server + 2 token khác loại) theo mẫu `flowgpt/server/test/failover.test.js` (boot server thật + stub `fetch`), để chứng minh bằng hành vi chứ không bằng mô tả.

---

## 10. Rủi ro & câu hỏi mở

### 10.1 Rủi ro

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | **Stack của app đã bớt quan trọng** sau khi chuyển sang backend dùng chung: app chỉ cần HTTP client (§2.6). **Nhưng** nếu ai đó vẫn định "port backend sang app" thì mới phải viết lại crypto/DB (`flowgpt/server/src/db.js:3,160`) — hướng đó **không** còn là thiết kế | **Thấp** (giảm từ Cao) | Bám đúng kiến trúc §2: app **không** port gì, chỉ gọi API |
| R2 | **Không có source app trong repo.** `fbuddy.meetflowai.site` là endpoint agent-bus (`scripts/notify/agent-bus.mjs:20` mặc định `https://fbuddy.meetflowai.site/agent-bus`; `scripts/notify/README.md:7` ghi rõ node-2, port 7799, qua Caddy `/agent-bus`) | Trung bình (giảm từ Cao) | Bước A + **Bước B không cần source app** (§8) ⇒ làm được phần lớn việc ngay |
| R3 | **Xoay `FLOWGPT_SECRET` làm chết mọi key + mọi session** (cùng secret ký JWT, `crypto.js:52`) — **nay ảnh hưởng CẢ web và app** vì dùng chung backend | **Cao** (tăng) | Runbook riêng; phải decrypt-bằng-khoá-cũ → encrypt-bằng-khoá-mới; app token dùng hash nên **không** bị ảnh hưởng bởi xoay secret |
| R4 | **HF router chưa được chứng minh OpenAI-compatible** — không có dòng code nào trong repo dùng nó | Trung bình | A3 xác minh trước; nếu không tương thích thì phải viết adapter riêng |
| R5 | **Dead entry `groq`/`deepseek` trong `SUPPORTS_STREAM_USAGE`** (`openai.js:80`) cho thấy danh sách năng lực bị lệch khỏi registry kind | Trung bình | Gate theo **kind đã đăng ký**; thêm test khẳng định mọi entry trong danh sách năng lực đều là kind có thật |
| R6 | **`looksMasked` regex quá rộng** — key thật bắt đầu bằng `**` hoặc chứa `…` sẽ không lưu được (`settings.js:9-11`) | Thấp | So khớp **chính xác** với `apiKeyPreview` thay vì regex |
| R7 | **`priority` là cột mới** → thêm phức tạp migration; nếu fbuddy không phải SQLite thì phải thiết kế lại | Thấp | Default 100 + `ORDER BY priority, created_at` giữ tương thích |
| R8 | **Rate-limit free tier** của Groq/HF rất thấp ⇒ fallback sẽ bị kích hoạt thường xuyên, `notice` có thể gây nhiễu UI | Trung bình | `ĐỀ XUẤT`: gộp notice lặp, hoặc chỉ cảnh báo 1 lần/phiên |
| R9 | **Provider không có `/models`** (một số gateway) → nút Test vẫn OK nhưng dropdown rỗng | Thấp | Bản web đã xử lý: `listModels` lỗi trả `null` (`routes.js:641`), `configure-provider.mjs:88-101` có nhánh dự phòng; giữ lại |
| R10 | **Trùng tên provider** không bị chặn (không có unique index) | Thấp | Cảnh báo ở tầng ứng dụng |
| **R11** | ⚠️ **Rò policy qua fallback** — app có thể bị gửi tới provider trả tiền nếu chỉ lọc policy ở bước chọn provider đầu, vì `switchToFallbackProvider` quét **toàn bộ** provider đang bật (`agent.js:248`) | **Cao** | Lọc ở **cả 3 điểm** + test X4/X5 bắt buộc (§6.5, §9.4) |
| **R12** | **App phụ thuộc backend dùng chung** — backend chết/sập thì app không chat được (đánh đổi đã chấp nhận ở §2.3) | Trung bình | Health check (`/api/health`, `index.js:40`) + thông báo lỗi rõ ở app; SLA cho backend |
| **R13** | **Blast radius tăng**: một lỗi ở backend dùng chung ảnh hưởng **cả** web và app, không còn cô lập như khi mỗi bên tự gọi | Trung bình | Test tương thích ngược (X8) + deploy có kiểm soát; không sửa phá vỡ hợp đồng API (§7) |
| **R14** | **Ngữ nghĩa policy rỗng** nếu chọn "rỗng = tất cả" thì client tạo thiếu policy sẽ **âm thầm** có full quyền | Trung bình | Chọn **deny-by-default** (§3.5, Q11) |
| **R15** | **Token app rò rỉ** (log, crash report, transcript) — vì token là bearer, ai có token là dùng được | Trung bình | Chỉ lưu **hash** ở DB; **không** log token; có `rotate` + thu hồi (§5.8, §9.3 S10–S12) |
| **R16** | **Chế độ `direct` tồn tại quá lâu** ⇒ lại có 2 nguồn sự thật, đúng cái kiến trúc này muốn xoá | Trung bình | Ghi **ngày hết hạn** cho `direct` ngay từ P1; log rõ `mode` (§2.7) |
| **R17** | **Rate-limit free tier** của Groq/HF + app dùng chung ⇒ app và web **tranh nhau** quota của cùng một key | Trung bình | `rate_limit_per_min`/`daily_token_budget` theo client (§3.5); ưu tiên `priority` cho provider (§6.1) |

### 10.2 Câu hỏi cần chủ dự án chốt

| # | Câu hỏi | Vì sao chặn | Đề xuất mặc định |
|---|---|---|---|
| **Q1** | App viết bằng **ngôn ngữ/framework nào**? (Có SQLite không **không còn** quyết định schema nữa — schema nằm ở backend dùng chung) | Chỉ còn quyết định **cách gọi HTTP/SSE** phía app (Bước C) | Không chặn Bước B — làm backend dùng chung trước |
| **Q2** | Web console đã có **admin role** chưa, và ai là admin? (`requireAdmin` đòi `role === "admin"`, `auth.js:121-127`) | Quyết định ai được phát/thu hồi app token | Giữ `requireAdmin` cho toàn bộ `/settings/*` **và** `/settings/clients/*` |
| **Q3** | Source app (`/opt/agent-bus`) **lấy về bằng cách nào, khi nào, ai**? | Chỉ chặn **Bước C** (app thành client). Bước A + B **không** cần | — |
| **Q4** | Groq + HF: key lấy từ **env** (`GROQ_API_KEY`, `HF_TOKEN`) hay nhập qua UI? | Quyết định có auto-seed provider lúc khởi động backend | Nhập qua UI/CLI **một lần** vào backend (§2.2); **không** để app đọc env key |
| **Q5** | Cần kind nào trong registry **dùng chung**? (giờ là câu hỏi cho backend, không phải cho app) | Mỗi kind = 1 adapter + test; nhưng **một lần** cho cả 2 client | Thêm `groq` + `huggingface`; giữ `openai`, `openrouter`, `openai-compatible`, `mock`; `gemini`/`anthropic`/`glm` thêm sau |
| **Q6** | Chốt **`priority` tường minh** hay giữ `created_at` như bản web? | §6.1 | **Dùng `priority`** |
| **Q7** | App có cần **tools/function-calling** và **vision** không? | Adapter phải xử lý `tools`/`images` (`openai.js:33-65`); ảnh hưởng policy theo client | Giữ cờ năng lực theo kind; policy có thể tắt `tools` cho app |
| **Q8** | Có cần **chi phí bằng tiền** không, hay token là đủ? | Bản web chỉ có token (§5.6) | Token trước; tiền là hạng mục riêng |
| **Q9** | Có cần **test cả stream** trong nút Test không (bản web chỉ test non-stream)? | §5.3 | **Có** — stream là đường đi thật |
| **Q10** | Salt mã hoá: dùng chung `flowgpt-secret-v1` hay tách? | **Đã đơn giản hơn**: chỉ còn **một** backend giữ key ⇒ giữ nguyên `flowgpt-secret-v1` | Giữ nguyên — không cần `FBUDDY_SECRET` nữa (biến này chỉ còn ý nghĩa nếu dùng chế độ `direct` tạm, §2.7) |
| **Q11** | Policy rỗng nghĩa là **chặn hết** (deny-by-default) hay **cho tất cả**? | §3.5 — chọn sai thành lỗ hổng | **Deny-by-default** (rỗng = chặn hết) |
| **Q12** | App token phát hành **thế nào**: qua web console (thủ công) hay CLI? Bao nhiêu client? | §5.8 | Web console + CLI; mỗi nền tảng app 1 client riêng để thu hồi độc lập |
| **Q13** | App có được dùng **provider trả tiền** không, hay **chỉ Groq/HF free**? | Quyết định policy khởi điểm + kiểm soát chi phí | Chỉ `["groq","huggingface"]`; mở rộng sau bằng cách sửa policy |
| **Q14** | Có chấp nhận **app phụ thuộc backend** (backend chết ⇒ app không chat) không? (§2.3) | Là đánh đổi cốt lõi của kiến trúc dùng chung | Chấp nhận, kèm health check + SLA |
| **Q15** | **Hạn chót xoá chế độ `direct`** (app tự gọi bằng key riêng) là khi nào? | §2.7 — nếu không đặt hạn thì sẽ tồn tại 2 nguồn sự thật | Đặt mốc cụ thể ngay ở P1 |
| **Q16** | Có cần **giới hạn rate/token theo client** ngay từ đầu không? | §3.5 — app và web **tranh quota** cùng key free (§10.1 R17) | Có — ít nhất `rate_limit_per_min` |

---

## Phụ lục A — Bảng dẫn chứng đã xác minh

Toàn bộ dòng dưới đây đã được **đọc trực tiếp trong repo**, không suy đoán:

| Chủ đề | Dẫn chứng |
|---|---|
| Bảng `providers` | `flowgpt/server/src/db.js:74-86` |
| Bảng `app_settings` | `flowgpt/server/src/db.js:107-111` |
| Allow-list setting | `flowgpt/server/src/db.js:340` |
| Defaults | `flowgpt/server/src/db.js:279-292` |
| `audit_log` | `flowgpt/server/src/db.js:150-157`, `:346-349` |
| `usage_log` | `flowgpt/server/src/db.js:138-148` |
| `conversations.provider_id/model` | `flowgpt/server/src/db.js:30-31` |
| SQLite built-in | `flowgpt/server/src/db.js:3,160` |
| Secret env | `flowgpt/server/src/config.js:33-45` |
| AES-256-GCM | `flowgpt/server/src/crypto.js:82-92` |
| Giải mã lỗi → `null` | `flowgpt/server/src/crypto.js:94-111` |
| `maskSecret` | `flowgpt/server/src/crypto.js:115-120` |
| JWT dùng chung secret | `flowgpt/server/src/crypto.js:52` |
| `ADAPTERS` | `flowgpt/server/src/providers/index.js:9` |
| `PROVIDER_KINDS` (7 kind) | `flowgpt/server/src/providers/index.js:12-112` |
| `toRuntimeProvider` | `flowgpt/server/src/providers/index.js:125-146` |
| `SUPPORTS_STREAM_USAGE` (dead `groq`) | `flowgpt/server/src/providers/openai.js:80` |
| Stream SSE | `flowgpt/server/src/providers/openai.js:82-163` |
| Retry 400 `stream_options` | `flowgpt/server/src/providers/openai.js:100-107` |
| `listModels` | `flowgpt/server/src/providers/openai.js:178-189` |
| `testConnection` | `flowgpt/server/src/providers/openai.js:192-210` |
| `apiKeyPreview` | `flowgpt/server/src/settings.js:39` |
| `KEEP_SECRET` / `looksMasked` | `flowgpt/server/src/settings.js:7-11` |
| Sinh id/validate provider | `flowgpt/server/src/settings.js:60-84` |
| PATCH provider | `flowgpt/server/src/settings.js:86-106` |
| Xoá provider reset default | `flowgpt/server/src/settings.js:108-114` |
| Fallback tầng 1 | `flowgpt/server/src/settings.js:125-170` |
| `created_at ASC` | `flowgpt/server/src/settings.js:48-50` |
| `nextUsableProvider` | `flowgpt/server/src/settings.js:177-187` |
| `listModelsForUi` | `flowgpt/server/src/settings.js:189-214` |
| `isProviderCreditError` | `flowgpt/server/src/agent.js:237-242` |
| `switchToFallbackProvider` | `flowgpt/server/src/agent.js:245-254` |
| Fallback giữa lượt | `flowgpt/server/src/agent.js:352-373` |
| Try-once | `flowgpt/server/src/agent.js:266,362` |
| Notice thiếu key | `flowgpt/server/src/agent.js:123-126` |
| SSE event names | `flowgpt/server/src/agent.js:169,309,329,332,363,375,397,463,465,496,497,516` |
| Mount `/api` | `flowgpt/server/src/index.js:59` |
| **Xác thực token (Bearer + cookie)** | `flowgpt/server/src/auth.js:92-99` |
| **`currentUser` + kiểm `token_version`** | `flowgpt/server/src/auth.js:101-111` |
| **`requireAuth` / `requireAdmin`** | `flowgpt/server/src/auth.js:114-127` |
| **JWT payload `{sub,email,role,tv}`** | `flowgpt/server/src/auth.js:68-70` |
| **`verifyToken` chỉ kiểm chữ ký + `exp`, KHÔNG kiểm `aud`/`typ`** | `flowgpt/server/src/crypto.js:63-78` |
| **`users.role` / `token_version`** | `flowgpt/server/src/db.js:15-23` |
| **Tiền lệ lưu token dạng hash (`email_tokens`)** | `flowgpt/server/src/db.js:117-118` |
| **CORS allow-list (`publicUrl` + `devOrigins`)** | `flowgpt/server/src/index.js:19-26`, `config.js:51,60-64` |
| **CORS cho phép header `Authorization`** | `flowgpt/server/src/index.js:29` |
| **Request log chỉ ghi khi `status >= 400`, KHÔNG có danh tính client** | `flowgpt/server/src/index.js:38-57` |
| **Web tĩnh + SPA fallback cùng tiến trình `/api`** | `flowgpt/server/src/index.js:63-87` |
| **Voice resolve provider ở server** | `flowgpt/server/src/settings.js:415-445`, `routes.js:437,454,487,514` |
| Admin API routes | `flowgpt/server/src/routes.js:545,549,557,593,597,607,617,628` |
| `GET /api/models` | `flowgpt/server/src/routes.js:430-432` |
| Chat body `providerId`/`model` | `flowgpt/server/src/routes.js:253-254` |
| Test timeout 25s | `flowgpt/server/src/routes.js:635-636` |
| Tab settings | `flowgpt/web/src/settings/SettingsPage.tsx:10-13` |
| Provider modal | `flowgpt/web/src/settings/ProviderModal.tsx:24-33,145-170` |
| Default provider/model | `flowgpt/web/src/settings/AppTab.tsx:183,185-190,197-214` |
| Model picker chat | `flowgpt/web/src/chat/Composer.tsx:271-281,341` |
| Usage UI | `flowgpt/web/src/chat/MessageItem.tsx:135-143,220-223` |
| Notice UI | `flowgpt/web/src/state/chat.tsx:179,326-327` |
| Test fallback | `flowgpt/server/test/failover.test.js` |
| OpenRouter test | `flowgpt/server/test/openrouter.test.js` |
| Groq base URL | `flowgpt/server/test/voice.test.js:103` |
| CLI provider | `flowgpt/ops/configure-provider.mjs:1-15` + cuối file (xoá key) |
| CLI switch model | `flowgpt/ops/switch-model.mjs` |
| fbuddy = agent-bus | `scripts/notify/agent-bus.mjs:20`, `scripts/notify/README.md:7` |

## Phụ lục B — Những gì tài liệu này KHÔNG khẳng định

Để tránh hiểu nhầm thành "đã kiểm chứng":

1. **Chưa** kiểm chứng app là ngôn ngữ/framework nào — §10 Q1.
2. **Chưa** kiểm chứng HF router `https://router.huggingface.co/v1` là OpenAI-compatible — đây là **giả định**, phải verify ở bước A3.
3. **Chưa** gọi thật Groq hay HF trong quá trình viết tài liệu này (không có request mạng nào được thực hiện).
4. **Chưa** xác minh Groq có trả `usage` trong stream — entry `openai.js:80` là *ý định* trong code, không phải bằng chứng đã chạy.
5. Toàn bộ số liệu về model gợi ý của Groq/HF là **đề xuất**, có thể lệch với danh sách thật tại thời điểm triển khai ⇒ luôn dùng nút Test để lấy list thật.
6. Không có secret nào bị đọc, in, hay dán vào tài liệu này.
7. **Chưa** kiểm chứng app hiện có đang tự gọi nhà cung cấp bằng key riêng hay không — vì **không có source app**. Mục §2.7 (`FBUDDY_LLM_MODE`) là **phòng ngừa**, phải xác nhận khi có source.
8. Toàn bộ phần **app token / `api_clients` / `client_policies` / `requireClient` / policy theo client** (§2.4, §2.5, §3.5, §5.8, §6.5) là **`ĐỀ XUẤT` hoàn toàn** — **không** tồn tại trong code hiện tại. Đã kiểm chứng: không có bảng `api_clients`/`client_policies` và không có khái niệm client trong `flowgpt/server/src/db.js`. Cơ chế xác thực **duy nhất** đang có là user + JWT (`auth.js:68-70,92-127`).
9. **Chưa** kiểm chứng CORS hiện tại có chặn client app hay không — phụ thuộc app là native (không chịu CORS) hay chạy trong trình duyệt (§2.6).
10. **Chưa** có bằng chứng backend dùng chung chịu được tải của **cả** web và app cùng lúc (§10.1 R12, R13) — cần đo trước khi mở cho app.
11. Các endpoint `ĐỀ XUẤT` (`/api/usage`, `/api/settings/clients*`) **chưa tồn tại** — §7.5.
