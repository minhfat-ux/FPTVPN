# FBUDDY — Thiết kế tính năng model / API key (bản thiết kế, chưa code)

> Trạng thái: **SOLUTION TRƯỚC, CHƯA CODE**. Tài liệu này là bản thiết kế để chủ dự án chốt.
> Bản web để noi theo: **FlowGpt** (`flowgpt/` trong repo này).
> Mục tiêu: fbuddy có **đúng bộ tính năng model/API-key như bản web**.
>
> Quy ước dẫn chứng: mọi chi tiết lấy từ code đều kèm `file:line`.
> Phần **không** có trong code được ghi rõ **`ĐỀ XUẤT`**.
> Mọi đường dẫn trong tài liệu tính từ gốc repo (ví dụ `flowgpt/server/src/db.js`).

---

## 1. Mục tiêu & phạm vi

### 1.1 Mục tiêu

Cho fbuddy khả năng **gọi model qua API key do người dùng tự cấu hình**, với **cùng bộ tính năng** như bản web FlowGpt — tức là:

1. **Nhiều nhà cung cấp (multi-provider)**, thêm/sửa/xoá trong màn hình quản trị.
2. **API key lưu mã hoá** trong DB, không bao giờ trả key thô ra API/UI.
3. **Nút Test** gọi thật 1 request + nạp danh sách model thật từ provider.
4. **Chọn provider/model mặc định** cho cả app.
5. **Chọn model theo từng cuộc trò chuyện** (console chat).
6. **Fallback 2 tầng**: khi thiếu key lúc chọn provider, và giữa lượt chat khi provider lỗi.
7. **Hiển thị usage** (token vào/ra) và provider/model đã trả lời.
8. **Audit log** mọi thao tác ghi vào cấu hình.
9. **CLI ops** cấu hình provider không lộ key ra command line/log.

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
| Provider ưu tiên | Không có kind `groq`/`huggingface`; Groq chỉ đi lọt qua kind `openai-compatible` (`flowgpt/server/test/voice.test.js:103`) | **Phải có kind `groq` và `huggingface` là first-class** | Yêu cầu chủ dự án: 2 provider free, cần base URL + key hint + model gợi ý đúng |
| Thứ tự fallback | Dựa **ngầm** vào `created_at ASC` (`flowgpt/server/src/settings.js:48-50`) | **Cột `priority` tường minh** `ĐỀ XUẤT` | Thứ tự ngầm rất dễ vỡ khi thêm/xoá provider |
| Framework | Node + `node:sqlite` (`flowgpt/server/src/db.js:3,160`) | **Chưa biết** — xem §9 | fbuddy chạy trên `/opt/agent-bus`, chưa có source trong repo |
| Tên secret env | `FLOWGPT_SECRET` (`flowgpt/server/src/config.js:34`) | `FBUDDY_SECRET` `ĐỀ XUẤT` | Tránh lẫn khoá giữa 2 app |

**Khác (cố ý giữ giống để dễ port):** tên bảng, tên cột, tên endpoint, shape payload — giữ **y hệt bản web** để có thể copy adapter/route sang fbuddy với diff nhỏ nhất.

### 1.4 Ngoài phạm vi

- Không làm hệ thống billing/trả tiền.
- Không đổi UX chat hiện có của fbuddy (chỉ thêm phần chọn model + fallback).
- Không đụng bản web FlowGpt đang chạy production.

---

## 2. Mô hình dữ liệu

### 2.1 Bảng `providers`

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
| `priority` | INTEGER | NOT NULL DEFAULT 100 | **`ĐỀ XUẤT`** — thứ tự fallback tường minh (xem §5) |

**Ràng buộc cần thêm (fbuddy)** `ĐỀ XUẤT`:

- `CREATE INDEX idx_providers_enabled_priority ON providers(enabled, priority ASC, created_at ASC)` — phục vụ đúng truy vấn chọn provider.
- Bản web **không** có unique index trên `providers` (chỉ PK) → cho phép 2 provider trùng tên/kind. fbuddy nên **cảnh báo trùng `name`** ở tầng ứng dụng, **không** đặt UNIQUE cứng (để không chặn 2 tài khoản cùng provider).

### 2.2 Bảng `app_settings`

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

### 2.3 Quy tắc mã hoá key

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

### 2.4 Audit log

Bảng `audit_log` — `flowgpt/server/src/db.js:150-157`:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | TEXT PRIMARY KEY | |
| `user_id` | TEXT nullable | `null` cho hành động tiền-đăng-nhập |
| `action` | TEXT NOT NULL | Ví dụ `provider.create` |
| `target` | TEXT nullable | id provider/user bị tác động |
| `detail_json` | TEXT NOT NULL DEFAULT `'{}'` | Chi tiết |
| `created_at` | TEXT NOT NULL | |

Hàm `audit()` **tự bọc try/catch** (`flowgpt/server/src/db.js:346-349`) ⇒ lỗi ghi audit **không** làm hỏng request nghiệp vụ. fbuddy giữ nguyên hành vi này.

Action đã có ở bản web: `provider.create` / `provider.update` / `provider.delete` (`flowgpt/server/src/routes.js:602,612,622`), `settings.update` (`routes.js:563`).

**Khoảng trống phát hiện được:** endpoint `POST /settings/providers/:id/test` (`routes.js:628-649`) **không** ghi audit, dù nó gửi request thật ra ngoài và tiêu quota. fbuddy `ĐỀ XUẤT` **ghi audit** action `provider.test` kèm `{ ok, model, latencyMs }` — **tuyệt đối không** ghi key.

`detail_json` khi update chỉ ghi **tên field**, không ghi giá trị (`routes.js:612`: `{ keys: Object.keys(req.body ?? {}) }`) ⇒ vô tình đúng: không rò secret vào audit. fbuddy **phải giữ** cách này.

---

## 3. Registry provider

### 3.1 Cơ chế

- `ADAPTERS` ánh xạ kind → module adapter — `flowgpt/server/src/providers/index.js:9`.
- `PROVIDER_KINDS` là mảng metadata cho UI/validate — `flowgpt/server/src/providers/index.js:12-112`.
- `adapterFor(kind)` ném `ApiError(400)` nếu kind lạ — `flowgpt/server/src/providers/index.js:118-122`.
- `toRuntimeProvider(row)` giải mã key + điền `baseUrl`/`defaultModel`/`imageModel` mặc định từ metadata — `flowgpt/server/src/providers/index.js:125-146`.
- `hasKey` = có key **hoặc** kind là `mock` — `flowgpt/server/src/providers/index.js:137`.
- `PROVIDER_KIND_IDS` export cho test — `flowgpt/server/src/providers/index.js:161`.

7 kind hiện có ở bản web: `gemini`, `openai`, `anthropic`, `glm`, `openrouter`, `openai-compatible`, `mock` (`providers/index.js:12-112`).

### 3.2 Kind cần có cho fbuddy

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

**Dead entry đã xác minh:** `"groq"` có trong `SUPPORTS_STREAM_USAGE` (`flowgpt/server/src/providers/openai.js:80`) nhưng **không** có kind `groq` trong `PROVIDER_KINDS` (đã grep toàn bộ `flowgpt/server/src`, `flowgpt/web/src`, `flowgpt/ops` — chỉ 1 kết quả duy nhất là dòng 80). ⇒ fbuddy thêm kind `groq` sẽ **vô tình kích hoạt đúng** entry này, và đó là hành vi mong muốn (Groq có hỗ trợ `stream_options`).

### 3.3 Ghi chú tương thích (bắt buộc tuân thủ)

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

## 4. Luồng người dùng

### 4.1 Admin — thêm provider

Tham chiếu UI: modal ở `flowgpt/web/src/settings/ProviderModal.tsx`. Các field state: `name`, `kind`, `baseUrl`, `apiKey`, `clearKey`, `modelsText`, `defaultModel`, `imageModel`, `enabled` (`ProviderModal.tsx:24-33`).

Trình tự:

1. Chọn **Loại nhà cung cấp** (`kind`) → tự điền `defaultBaseUrl` + `models` gợi ý (`ProviderModal.tsx:145-153`; logic ở `ProviderModal.tsx:38-40` và `onKindChange`).
2. Ô **Base URL** chỉ hiện khi `kind !== "mock"`, hint lấy từ `info.keyHint` (`ProviderModal.tsx:155-163`).
3. Ô **API key**: hint = `keyHint` khi tạo mới; khi sửa thì để trống/giữ mask nghĩa là **không đổi key** (`ProviderModal.tsx:166-170`, cơ chế `looksMasked` ở `settings.js:9-11`).
4. `modelsText` nhận nhiều dòng hoặc phẩy — `normalizeModels()` tách theo `[\n,]` (`flowgpt/server/src/settings.js:13-22`).
5. **Lưu** → `POST /api/settings/providers` (`routes.js:597-605`).

**Validate phía server (fbuddy phải copy):** kind phải hợp lệ, tên không rỗng, và **`kind !== "mock"` thì bắt buộc có API key** (`flowgpt/server/src/settings.js:61-69`). Nếu `models` trống → lấy 3 model gợi ý đầu của kind (`settings.js:78`); `default_model` fallback về `models[0]` hoặc gợi ý đầu tiên (`settings.js:79`).

### 4.2 Admin — sửa / xoá

- **Sửa:** `PATCH /api/settings/providers/:id` (`routes.js:607-615`). Chỉ field có mặt trong body mới bị ghi (`settings.js:89-104`). Đổi `kind` được nhưng phải hợp lệ (`settings.js:91-94`). `apiKey: ""` → **xoá key** (`api_key_enc = null`, `settings.js:102`).
- **Xoá:** `DELETE /api/settings/providers/:id` (`routes.js:617-625`). Nếu provider đang là default → **tự động reset `defaultProviderId` và `defaultModel` về `null`** (`flowgpt/server/src/settings.js:108-114`). fbuddy giữ nguyên: nếu không, app sẽ trỏ vào provider đã chết.

### 4.3 Admin — nút Test

- Endpoint: `POST /api/settings/providers/:id/test` (`routes.js:627-649`).
- Timeout cứng **25 giây** bằng `AbortController` (`routes.js:635-636`).
- Model dùng để test: `req.body.model || provider.defaultModel` (`routes.js:634`).
- Gọi `testProvider()` = 1 request **non-streaming** `max_tokens: 8`, nội dung `"ping"` (`openai.js:192-210`).
- Nếu body có `listModels: true` → gọi thêm `GET /models`, **bắt lỗi trả `null`** để test vẫn OK dù gateway không có `/models` (`routes.js:640-642`).
- Trả `{ ok, model, models, latencyMs, message }` (`routes.js:643`).
- **Lỗi trả về dạng `ok: false`, HTTP vẫn 200** (`routes.js:644-645`) ⇒ UI hiển thị message thay vì coi là lỗi mạng. fbuddy giữ nguyên.
- fbuddy `ĐỀ XUẤT`: thêm (a) ghi audit `provider.test`, (b) tuỳ chọn test **cả stream** vì stream là đường đi thật của chat — bản web chỉ test non-stream, còn `configure-provider.mjs` mới test stream (`ops/configure-provider.mjs:158-176`).

### 4.4 Chọn provider/model mặc định

UI: tab **Hệ thống** (`flowgpt/web/src/settings/SettingsPage.tsx:12`, component `AppTab.tsx`).

- Dropdown "Nhà cung cấp mặc định": **chỉ liệt kê provider đang bật** (`AppTab.tsx:186-190`), có option rỗng "— Tự động chọn nhà cung cấp đang bật đầu tiên —" (`AppTab.tsx:185`).
- Khi đổi provider → **reset `defaultModel` về `null`** (`AppTab.tsx:183`) để tránh giữ model của provider cũ.
- Dropdown "Model mặc định" lọc theo provider đã chọn; option rỗng "— Dùng model mặc định của nhà cung cấp —" (`AppTab.tsx:197-214`).
- Lưu: `PUT /api/settings/app` với `{ settings: patch }` (`routes.js:557-566`), ghi audit `settings.update`.
- Nguồn dữ liệu cho dropdown: `GET /api/models` → `listModelsForUi()` (`routes.js:430-432`), gộp mọi provider đang bật, mỗi item có `providerId`, `providerName`, `model`, `isDefault`, `hasKey`, `supportsTools/Vision/Images` (`flowgpt/server/src/settings.js:189-214`).

### 4.5 Chọn model theo từng cuộc trò chuyện

- Conversation **lưu `provider_id` + `model`** trong bảng `conversations` (`flowgpt/server/src/db.js:30-31`).
- Tạo conversation nhận `providerId`/`model` từ body (`routes.js:253-254`), sửa qua `PATCH /api/conversations/:id` (`routes.js:269+`).
- UI: picker trong composer, value dạng `"<providerId>::<model>"` (`flowgpt/web/src/chat/Composer.tsx:271-281`), nhãn hiển thị `"{providerName} · {model}"`; khi không chọn thì hiện "Mô hình mặc định" (`Composer.tsx:341`).
- Thứ tự ưu tiên khi chạy 1 lượt — `resolveProviderForChat()` (`flowgpt/server/src/settings.js:125-170`):
  1. `providerId` chỉ định cho lượt,
  2. → `settings.defaultProviderId`,
  3. → provider **đang bật đầu tiên**.
  Model: `model` chỉ định → `settings.defaultModel` (nếu provider đó là default của app) → `provider.default_model` → `provider.models[0]` (`settings.js:160-165`).
- fbuddy giữ đúng chuỗi ưu tiên này.

### 4.6 Hiển thị usage / chi phí

- Adapter phát event `usage` khi `finish_reason` tới và `usage_final` sau vòng lặp (`openai.js:158,162`), map `prompt_tokens`/`completion_tokens` hoặc `input_tokens`/`output_tokens` (`openai.js:125-130`).
- Agent nhận và phát tiếp SSE `usage` (`flowgpt/server/src/agent.js:337-340,375`).
- UI hiển thị dưới mỗi câu trả lời: tên provider, model (mono), `"{in} vào · {out} ra token"` (`flowgpt/web/src/chat/MessageItem.tsx:135-143`; bản turn: `:220-223`).
- Lưu lượng token vào bảng `usage_log` (`flowgpt/server/src/db.js:138-148`) gồm `user_id`, `conversation_id`, `provider_id`, `model`, `tokens_in`, `tokens_out`, index theo `created_at DESC`.

**Về "chi phí":** bản web **không** tính tiền. Không có cột giá, không có bảng giá model, UI chỉ hiện **token**. fbuddy `ĐỀ XUẤT`: hiển thị token (bắt buộc, giống bản web) và **chưa** làm chi phí; nếu chủ dự án cần tiền thì phải thêm `priceInPerMtok`/`priceOutPerMtok` vào metadata kind — việc này **ngoài** bộ tính năng bản web.

### 4.7 Cảnh báo khi thiếu key hoặc bị rate-limit

Ba tầng, đều đã có ở bản web:

1. **Ẩn/đánh dấu provider thiếu key.** `listModelsForUi()` tính `ready` và trả `hasKey` cho từng model (`settings.js:197,205`) → UI biết model nào không dùng được.
2. **Nhắc lúc bắt đầu lượt (thiếu key).** Nếu provider mặc định không có key, `resolveProviderForChat` đổi sang provider sẵn sàng và trả `fallbackFrom` với `reason: "missing_api_key"` (`settings.js:143-146`); agent phát `notice`: `Nhà cung cấp mặc định "X" chưa có API key nên lượt này dùng "Y".` (`flowgpt/server/src/agent.js:123-126`). UI hiện toast info (`flowgpt/web/src/state/chat.tsx:179`).
3. **Nhắc giữa lượt (rate-limit/hết tiền).** Agent phát `notice`: `Nhà cung cấp "X" không dùng được (<lý do, cắt 160 ký tự>). Lượt này chuyển sang "Y".` (`agent.js:363-367`), UI lưu vào turn và hiển thị (`flowgpt/web/src/state/chat.tsx:326-327`).

**Chưa có ở bản web** `ĐỀ XUẤT` cho fbuddy: cờ cảnh báo **chủ động** trước khi gửi (ví dụ badge "provider đang bị 429, thử lại sau 30s"). Bản web chỉ phát hiện **sau khi** request thất bại.

---

## 5. Fallback & rate-limit

### 5.1 Thứ tự ưu tiên — vấn đề và đề xuất

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

### 5.2 Fallback tầng 1 — lúc chọn provider (thiếu key)

Trigger: provider được chỉ định (từ lượt / default app) **không có key** hoặc không `enabled`.

- "Ready" = `kind === "mock"` **hoặc** giải mã được key: `settings.js:137`, `:179`.
- Nếu default không ready → chọn provider ready đầu tiên, trả `fallbackFrom = { id, name, reason: "missing_api_key" }` (`settings.js:144-146`).
- Nếu **không còn provider nào** ready → ném `ApiError(400)` với thông báo tiếng Việt hướng dẫn vào Cài đặt (`settings.js:147-155`).
- Nếu chọn được provider nhưng **không có model nào** → `ApiError(400)` (`settings.js:166-168`).
- Không có provider nào `enabled` → `ApiError(400)` (`settings.js:128-134`).

### 5.3 Fallback tầng 2 — giữa lượt chat (lỗi provider)

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

### 5.4 Ma trận quyết định (tóm tắt)

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

---

## 6. API surface

Tiền tố: router gắn ở `/api` (`flowgpt/server/src/index.js:59`). Tất cả endpoint dưới đây **giống bản web** để dễ port.

### 6.1 Endpoint hiện có của bản web

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

### 6.2 Shape `Provider` trả ra client (không có key thô)

Theo `publicProvider()` (`flowgpt/server/src/settings.js:26-46`):

```
{ id, name, kind, baseUrl, models[], defaultModel, imageModel,
  enabled, hasApiKey, apiKeyPreview,
  supportsImages, supportsTools, supportsVision,
  createdAt, updatedAt }
```

`apiKeyPreview` dạng `"AIzaSy…4f2"` (`crypto.js:115-120`). **Tuyệt đối không** có field chứa key thô.

### 6.3 Shape `ProviderKind` cho UI

Theo `PROVIDER_KINDS` (`flowgpt/server/src/providers/index.js:12-112`):

```
{ id, label, defaultBaseUrl, suggestedModels[], defaultImageModel,
  supportsImages, supportsTools, supportsVision, keyHint }
```

### 6.4 Payload POST / PATCH provider

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

### 6.5 Bổ sung đề xuất cho fbuddy

| Method | Path | Ghi chú |
|---|---|---|
| PATCH | `/api/settings/providers/:id` | thêm field **`priority`** vào body `ĐỀ XUẤT` (§5.1) |
| POST | `/api/settings/providers/:id/test` | thêm `{ stream: true }` để test cả đường SSE thật `ĐỀ XUẤT` |
| GET | `/api/settings/providers/:id/usage` | tổng token theo provider/model từ `usage_log` `ĐỀ XUẤT` — bản web chưa có endpoint này |

### 6.6 SSE event của lượt chat

Phát bởi agent: `start` (`agent.js:169`), `status` (`:309,477`), `delta` (`:329`), `reasoning` (`:332`), `notice` (`:363`), `usage` (`:375`), `tool_call` (`:397`), `artifact` (`:463`), `tool_result` (`:465`), `error` (`:496`), `done` (`:497,516`).

Hai event liên quan trực tiếp tính năng model:

- `notice` — lý do đổi provider (`agent.js:363-367`).
- `usage` — `{ in, out }` (`agent.js:375`, `openai.js:125-130`).

---

## 7. Kế hoạch triển khai theo bước

Chia theo **mức phụ thuộc vào source fbuddy** (`/opt/agent-bus`).

### 7.0 Tiền đề — điều tra còn thiếu (BƯỚC 0, chặn mọi bước sau)

Chưa biết fbuddy viết bằng gì. **Phải trả lời §9 Q1–Q3 trước khi code.** Vì vậy:

- **Bước A** dưới đây làm được **ngay, không cần source fbuddy**.
- **Bước B trở đi cần source `/opt/agent-bus`.**

### Bước A — Làm ngay, không cần source fbuddy

| # | Việc | Sản phẩm | Vì sao làm được ngay |
|---|---|---|---|
| A1 | **Chuẩn hoá "hợp đồng cấu hình"**: chốt JSON schema của `providers` + `app_settings` + shape API (§2, §6) thành 1 file spec máy đọc được | `docs/` spec hoặc JSON schema | Chỉ là thiết kế, không phụ thuộc runtime |
| A2 | **Viết script test key độc lập** cho Groq + HF: 1 chat non-stream, 1 stream, 1 lần key sai — chạy bằng `node`, đọc key từ FILE, **không** in key | `ĐỀ XUẤT` `flowgpt/ops/…` hoặc script riêng | Không cần fbuddy; chứng minh provider hoạt động thật **trước** khi tích hợp |
| A3 | **Xác minh HF router thực sự OpenAI-compatible** (`POST /chat/completions`, `GET /models`, SSE) | Kết quả chạy A2 | Là giả định **chưa** có bằng chứng trong repo (§3.2) |
| A4 | **Xác minh Groq có hỗ trợ `stream_options`** (đối chiếu entry `openai.js:80`) và có trả `usage` trong stream | Kết quả chạy A2 | Xác nhận/bác bỏ dead entry |
| A5 | Quyết định `priority` vs `created_at` (§5.1) | Chủ dự án chốt | Là quyết định thiết kế |
| A6 | Đặt tên secret env (`FBUDDY_SECRET`) + quy trình xoay khoá | Chốt trong doc | Tránh lẫn với `FLOWGPT_SECRET` |

**Vì sao A2/A3/A4 quan trọng:** chúng biến 2 giả định chưa kiểm chứng (HF router là OpenAI-compatible; Groq hỗ trợ usage-in-stream) thành dữ kiện. Nếu HF router **không** OpenAI-compatible thì phải viết adapter riêng — điều này đổi khối lượng công việc, nên phải biết **trước**.

### Bước B — Sau khi có source fbuddy (cần `/opt/agent-bus`)

| # | Việc | Phụ thuộc |
|---|---|---|
| B1 | Chốt stack fbuddy (ngôn ngữ, DB, HTTP framework) và ánh xạ §2 sang stack đó | Source |
| B2 | Migration tạo/sửa bảng `providers` + `app_settings` (thêm `priority`) | B1 |
| B3 | Module crypto: `encryptSecret`/`decryptSecret`/`maskSecret` port từ `crypto.js:82-120` | B1 |
| B4 | Registry kind + adapter OpenAI-compatible (port `providers/index.js`, `providers/openai.js`) | B1, A3 |
| B5 | Endpoint CRUD provider + test (§6) | B2–B4 |
| B6 | Fallback 2 tầng (§5.2, §5.3) + ghi `provider_id`/`model` lên message | B5 |
| B7 | Admin UI: tab provider + modal + chọn default | B5 |
| B8 | Console: picker model theo conversation + hiển thị usage/notice | B6 |
| B9 | Audit log cho mọi thao tác ghi (kể cả `provider.test`) | B5 |
| B10 | Bộ test nghiệm thu (§8) | B6, B8 |

### Bước C — Vận hành

- CLI thêm provider đọc key từ file, verify chat + stream, rồi **xoá file key** (mẫu: `flowgpt/ops/configure-provider.mjs:1-15` và bước 6 ở cuối file).
- CLI đổi model + verify (mẫu: `flowgpt/ops/switch-model.mjs`).
- Runbook: cách xoay `FBUDDY_SECRET` (nhắc lại: **vô hiệu hoá toàn bộ key đã lưu**, xem §2.3).

### 7.1 Thứ tự ưu tiên đề xuất

1. **A2/A3/A4** — chứng minh 2 provider free chạy thật. Không có bước này thì mọi thiết kế sau là giả định.
2. **B1/B2/B3** — nền dữ liệu + crypto.
3. **B4/B5** — CRUD + test (giá trị người dùng thấy ngay).
4. **B6** — fallback.
5. **B7/B8/B9** — UI + audit.
6. **B10** — nghiệm thu.

---

## 8. Test / nghiệm thu

### 8.1 Chứng minh từng provider chạy thật

Với **mỗi** provider (Groq, HF, và 1 provider `openai-compatible` bất kỳ), chạy 3 phép thử và lưu output:

| # | Phép thử | Kỳ vọng | Mẫu trong repo |
|---|---|---|---|
| T1 | **1 request chat non-stream** | HTTP 200, có nội dung trả lời, in `latencyMs` | `testConnection()` `openai.js:192-210` |
| T2 | **1 request stream** | Nhận ≥ 1 event `delta` có chữ; nếu provider hỗ trợ thì có thêm `usage` | Vòng lặp stream trong `ops/configure-provider.mjs:158-176` |
| T3 | **1 lần key sai** (key rác) | Thất bại **sạch**: 401/403, message đọc được, **không** rò key trong log | `isProviderCreditError` phải nhận diện 401 (`agent.js:240`) |
| T4 | **`GET /models`** | Trả danh sách model thật; nếu 404 thì ghi nhận "không có /models nhưng chat OK" | `ops/configure-provider.mjs:88-101` (đã xử lý đúng ca này) |

**Bằng chứng cần dán vào báo cáo:** lệnh đã chạy + output thật (theo `AGENTS.md` §4), **đã che key**. Không dán key, kể cả key test.

**Lưu ý về Groq:** repo đã có tiền lệ Groq qua `kind: "openai-compatible"` + base URL `https://api.groq.com/openai/v1` trong `flowgpt/server/test/voice.test.js:103` (dùng key giả trong test). fbuddy dùng **kind `groq` first-class** nhưng cùng base URL.

### 8.2 Chứng minh fallback chạy (giả lập 429)

Không cần gọi provider thật — **stub `fetch`**, đúng như bản web làm:

**Mẫu tham chiếu:** `flowgpt/server/test/failover.test.js`.

**Cách làm (port sang test của fbuddy):**

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

### 8.3 Nghiệm thu bảo mật (bắt buộc)

| # | Kiểm tra | Kỳ vọng |
|---|---|---|
| S1 | Gọi `GET /api/settings/providers` | Chỉ có `apiKeyPreview`, **không** có key thô |
| S2 | Dump bảng `providers` | Cột `api_key_enc` là blob `v1.<iv>.<ct>.<tag>`, **không** đọc được key |
| S3 | Grep log + audit_log sau khi thêm provider | **Không** xuất hiện key |
| S4 | PATCH với `apiKey` = giá trị preview | Key **không** đổi (`looksMasked`) |
| S5 | Đổi secret env rồi gọi API | `hasApiKey` = false (giải mã thất bại trả `null`, `crypto.js:109-111`); app **không** crash |
| S6 | `/api/settings/*` bằng token user thường | **403/bị chặn** (`requireAdmin`) |
| S7 | Key tạm trong file của CLI | File **bị xoá** sau khi chạy |

---

## 9. Rủi ro & câu hỏi mở

### 9.1 Rủi ro

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | **fbuddy có thể không phải Node/SQLite.** Bản web dùng `node:sqlite` + `node:crypto` + `fetch` (`flowgpt/server/src/db.js:3,160`). Nếu fbuddy là Python/Go/Java thì **crypto, DB layer và luồng SSE phải viết lại** — phần "port thẳng" chỉ còn là **thiết kế** (schema, endpoint, quy tắc fallback) | **Cao** | Trả lời Q1 trước; dùng AES-256-GCM + scrypt tương đương ở stack đó và **giữ nguyên định dạng `v1.<iv>.<ct>.<tag>`** để có thể migrate key giữa 2 app |
| R2 | **Không có source fbuddy trong repo.** `fbuddy.meetflowai.site` là endpoint agent-bus (`scripts/notify/agent-bus.mjs:20` mặc định `https://fbuddy.meetflowai.site/agent-bus`; `scripts/notify/README.md:7` ghi rõ node-2, port 7799, qua Caddy `/agent-bus`) | **Cao** | Bước A làm trước; B1 chốt stack |
| R3 | **Xoay `FBUDDY_SECRET` làm chết mọi key + mọi session** (cùng secret ký JWT, `crypto.js:52`) | Trung bình | Runbook riêng; nếu cần xoay thì phải decrypt-bằng-khoá-cũ → encrypt-bằng-khoá-mới |
| R4 | **HF router chưa được chứng minh OpenAI-compatible** — không có dòng code nào trong repo dùng nó | Trung bình | A3 xác minh trước; nếu không tương thích thì phải viết adapter riêng |
| R5 | **Dead entry `groq`/`deepseek` trong `SUPPORTS_STREAM_USAGE`** (`openai.js:80`) cho thấy danh sách năng lực bị lệch khỏi registry kind | Trung bình | fbuddy gate theo **kind đã đăng ký**; thêm test khẳng định mọi entry trong danh sách năng lực đều là kind có thật |
| R6 | **`looksMasked` regex quá rộng** — key thật bắt đầu bằng `**` hoặc chứa `…` sẽ không lưu được (`settings.js:9-11`) | Thấp | So khớp **chính xác** với `apiKeyPreview` thay vì regex |
| R7 | **`priority` là cột mới** → thêm phức tạp migration; nếu fbuddy không phải SQLite thì phải thiết kế lại | Thấp | Default 100 + `ORDER BY priority, created_at` giữ tương thích |
| R8 | **Rate-limit free tier** của Groq/HF rất thấp ⇒ fallback sẽ bị kích hoạt thường xuyên, `notice` có thể gây nhiễu UI | Trung bình | `ĐỀ XUẤT`: gộp notice lặp, hoặc chỉ cảnh báo 1 lần/phiên |
| R9 | **Provider không có `/models`** (một số gateway) → nút Test vẫn OK nhưng dropdown rỗng | Thấp | Bản web đã xử lý: `listModels` lỗi trả `null` (`routes.js:641`), `configure-provider.mjs:88-101` có nhánh dự phòng; giữ lại |
| R10 | **Trùng tên provider** không bị chặn (không có unique index) | Thấp | Cảnh báo ở tầng ứng dụng |

### 9.2 Câu hỏi cần chủ dự án chốt

| # | Câu hỏi | Vì sao chặn | Đề xuất mặc định |
|---|---|---|---|
| **Q1** | fbuddy viết bằng **ngôn ngữ/framework nào**? Có dùng SQLite không? Node ≥ 22.5 (để có `node:sqlite`) hay DB khác? | Quyết định khối lượng việc: nếu khác stack thì §2/§3 phải viết lại | Nếu là Node: copy gần như nguyên. Nếu khác: giữ schema + thuật toán, viết lại lớp DB/crypto |
| **Q2** | fbuddy có **multi-user + admin role** như FlowGpt không, hay chỉ 1 người dùng? | Quyết định có cần `requireAdmin` + bảng `users` + audit theo user | Giữ `requireAdmin` cho `/settings/*` |
| **Q3** | Source `/opt/agent-bus` **lấy về bằng cách nào và khi nào**? Ai làm? | Bước B không bắt đầu được nếu thiếu | — |
| **Q4** | Groq + HF: key lấy từ **env** (`GROQ_API_KEY`, `HF_TOKEN`) hay nhập qua UI? | Quyết định có cần auto-seed provider lúc khởi động | Nhập qua UI (giống bản web), **không** hard-code env vào DB |
| **Q5** | Có cần **kind `gemini`/`anthropic`/`glm`** ở fbuddy không, hay chỉ OpenAI-compatible? | Mỗi kind thêm = thêm adapter + test | Chỉ cần `groq`, `huggingface`, `openai-compatible`, `mock`; phần còn lại thêm sau |
| **Q6** | Chốt **`priority` tường minh** hay giữ `created_at` như bản web? | §5.1 | **Dùng `priority`** |
| **Q7** | fbuddy có cần **tools/function-calling** và **vision** như bản web không? | Adapter phải xử lý `tools`/`images` (`openai.js:33-65`) | Giữ cờ năng lực theo kind; tắt `tools` cho provider không hỗ trợ |
| **Q8** | Có cần **chi phí bằng tiền** không, hay token là đủ? | Bản web chỉ có token (§4.6) | Token trước; tiền là hạng mục riêng |
| **Q9** | Có cần **test cả stream** trong nút Test không (bản web chỉ test non-stream)? | §4.3 | **Có** — stream là đường đi thật |
| **Q10** | Key của fbuddy có phải **tương thích ngược** với FlowGpt (giải mã chéo được) không? | Quyết định có dùng chung salt `flowgpt-secret-v1` hay tách `fbuddy-secret-v1` | **Tách** — 2 app độc lập, không chia sẻ khoá |

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

1. **Chưa** kiểm chứng fbuddy là Node/SQLite hay framework nào — §9 Q1.
2. **Chưa** kiểm chứng HF router `https://router.huggingface.co/v1` là OpenAI-compatible — đây là **giả định**, phải verify ở bước A3.
3. **Chưa** gọi thật Groq hay HF trong quá trình viết tài liệu này (không có request mạng nào được thực hiện).
4. **Chưa** xác minh Groq có trả `usage` trong stream — entry `openai.js:80` là *ý định* trong code, không phải bằng chứng đã chạy.
5. Toàn bộ số liệu về model gợi ý của Groq/HF là **đề xuất**, có thể lệch với danh sách thật tại thời điểm triển khai ⇒ luôn dùng nút Test để lấy list thật.
6. Không có secret nào bị đọc, in, hay dán vào tài liệu này.
