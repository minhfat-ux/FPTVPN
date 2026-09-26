# fBuddy — API contract (nguồn sự thật cho FE/BE)

> Mọi thay đổi API phải sửa file này trước. Web (`web/`) và server (`server/`) đều bám theo đây.
> Base: `https://fbuddy.meetflowai.site` (dev: web Vite proxy `/api` → `http://127.0.0.1:7790`).

## 0. Quy ước chung

- Tất cả endpoint dưới `/api`. JSON vào/ra (`Content-Type: application/json`) trừ upload multipart.
- Thời gian: ISO-8601 UTC string. ID: string (uuid v4).
- Auth: JWT HS256. Client gửi `Authorization: Bearer <token>` **hoặc** cookie `fbuddy_token` (httpOnly).
  - Login/register trả `{ user, token }`; client lưu token (localStorage) và cũng nhận cookie.
- Lỗi: HTTP status + body:
  ```json
  { "error": { "code": "invalid_credentials", "message": "Email hoặc mật khẩu không đúng" } }
  ```
  Mã lỗi dùng trong code: `bad_request`, `unauthorized`, `forbidden`, `not_found`,
  `rate_limited`, `provider_error`, `mcp_error`, `tool_error`, `internal_error`.
- Phân trang: query `?limit=&cursor=`; response `{ "items": [...], "nextCursor": null }`.
- `role`: `admin` | `user`. **Người đăng ký đầu tiên tự động là `admin`.**
  Nếu `app.allowSignup === false`, chỉ admin tạo được user (`POST /api/admin/users`).

## 1. Auth

| Method | Path | Body | Trả về |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password, name? }` | `{ user, token }` — **hoặc** `{ pendingVerification: true, email, delivered, expiresInMin, devCode? }` khi tài khoản phải xác thực email (KHÔNG mở phiên) |
| POST | `/api/auth/login` | `{ email, password }` | `{ user, token }` — 403 `email_not_verified` (kèm `details.email`, `details.delivered`) nếu chưa xác thực email |
| POST | `/api/auth/verify-email` | `{ email, code }` | `{ user, token, emailVerified: true }` — kích hoạt tài khoản, mở phiên luôn |
| POST | `/api/auth/resend-verification` | `{ email }` | `{ ok, delivered, expiresInMin?, devCode? }` — luôn trả lời giống nhau (không dò email) |
| POST | `/api/admin/users/:id/verify-email` | — | `{ user }` — admin kích hoạt tay khi khách không nhận được mail |
| POST | `/api/auth/logout` | – | `{ ok: true }` |
| GET | `/api/auth/me` | – | `{ user }` |
| PATCH | `/api/auth/me` | `{ name?, password?, currentPassword? }` | `{ user }` |

`user`:
```json
{ "id": "u_…", "email": "a@b.com", "name": "Anh", "role": "admin",
  "emailVerified": true, "emailVerifiedAt": "2026-01-01T00:00:00.000Z",
  "createdAt": "2026-01-01T00:00:00.000Z", "isAdmin": true }
```
Mật khẩu tối thiểu 8 ký tự. Sai mật khẩu/không tồn tại → `401 invalid_credentials`
(không tiết lộ email có tồn tại hay không).

## 2. Hội thoại

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/conversations` | `{ items: Conversation[] }` sắp xếp `updatedAt` giảm dần |
| POST | `/api/conversations` | `{ title?, skill?, providerId?, model? }` → `{ conversation }` |
| GET | `/api/conversations/:id` | `{ conversation, messages: Message[] }` |
| PATCH | `/api/conversations/:id` | `{ title?, pinned?, archived?, skill?, providerId?, model? }` |
| DELETE | `/api/conversations/:id` | `{ ok: true }` |
| POST | `/api/conversations/:id/duplicate` | `{ conversation }` |
| GET | `/api/conversations/search?q=` | `{ items: Conversation[] }` |

`Conversation`:
```json
{ "id": "c_…", "title": "Tạo slide về …", "skill": "ppt", "providerId": "p_…",
  "model": "gemini-2.5-flash", "pinned": false, "archived": false,
  "createdAt": "…", "updatedAt": "…", "messageCount": 12,
  "lastMessagePreview": "Dạ em đã tạo xong 8 slide…" }
```

`Message`:
```json
{ "id": "m_…", "conversationId": "c_…", "role": "user|assistant|system|tool",
  "content": "markdown text", "createdAt": "…",
  "attachments": [FileRef], "toolCalls": [ToolCall], "toolResults": [ToolResult],
  "artifacts": [Artifact], "providerId": "p_…", "model": "…",
  "usage": { "in": 120, "out": 340 }, "error": null }
```

`FileRef` (tệp người dùng đính kèm):
```json
{ "id": "f_…", "name": "bao-cao.xlsx", "mime": "application/vnd…", "size": 12345, "kind": "image|document|data" }
```

`Artifact` (tệp máy tạo ra, tải được):
```json
{ "id": "f_…", "name": "slide.pptx", "mime": "application/vnd…", "size": 54321,
  "kind": "pptx|xlsx|image|chart|report|csv", "url": "/api/files/f_…/content" }
```

`ToolCall`: `{ "id": "call_…", "name": "generate_pptx", "args": { … }, "source": "builtin|mcp", "serverId": "s_…" }`
`ToolResult`: `{ "id": "call_…", "name": "generate_pptx", "ok": true, "summary": "Đã tạo 8 slide",
  "data": { … }, "artifacts": [Artifact], "error": null, "durationMs": 812 }`

## 3. Chat (streaming)

`POST /api/chat/stream` — body:
```json
{ "conversationId": "c_… | null",     // null ⇒ tạo hội thoại mới, id trả ở event `start`
  "content": "text người dùng",
  "attachments": ["f_…"],
  "skill": "auto|chat|image|ppt|excel|data",
  "providerId": "p_… | null",
  "model": "… | null",
  "toolMode": "auto|off|required",
  "regenerateFromMessageId": "m_… | null" }
```
Response: `text/event-stream` (SSE). Mỗi sự kiện là `event: <name>` + `data: <json>`:

| event | data | Ý nghĩa |
|---|---|---|
| `start` | `{ conversationId, messageId, userMessageId, providerId, model }` | Đã tạo/cập nhật hội thoại |
| `status` | `{ stage }` — `thinking\|calling_tool\|reading_file` | Trạng thái hiển thị |
| `delta` | `{ text }` | Thêm chữ vào câu trả lời |
| `reasoning` | `{ text }` | (tuỳ model) phần suy luận, hiển thị mờ |
| `tool_call` | `ToolCall` | Model yêu cầu gọi tool |
| `tool_result` | `ToolResult` | Kết quả tool |
| `artifact` | `Artifact` | Tệp mới tạo (hiện thẻ tải xuống) |
| `usage` | `{ in, out }` | Token |
| `title` | `{ title }` | Tiêu đề hội thoại vừa sinh tự động |
| `done` | `{ messageId, finishReason, iterations }` | Kết thúc |
| `error` | `{ code, message }` | Lỗi (stream kết thúc sau event này) |

- Client ngắt kết nối ⇒ server dừng gọi provider.
- Nếu `toolMode: "off"` thì không truyền tool; `"required"` buộc model gọi tool.
- Vòng lặp tool tối đa `app.maxToolIterations` (mặc định 6).

`POST /api/chat/stop` `{ messageId }` → `{ ok: true }` (dừng mềm, best-effort).

## 4. Tệp & artifacts

| Method | Path | Ghi chú |
|---|---|---|
| POST | `/api/files` | multipart `file` (+ `conversationId?`) → `{ file: FileRef }` |
| GET | `/api/files/:id` | `{ file }` metadata |
| GET | `/api/files/:id/content` | nhị phân, `Content-Disposition: attachment; filename=…`; ảnh hỗ trợ `?inline=1` |
| DELETE | `/api/files/:id` | `{ ok: true }` |
| GET | `/api/artifacts` | `{ items: Artifact[] }` — tệp do máy tạo, mới nhất trước |

Giới hạn upload: `app.maxUploadMb` (mặc định 25). Chỉ nhận: `image/*`, `application/pdf`,
`text/*`, `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/json`.

## 5. Settings (backend — chỉ admin)

### 5.1 App settings
`GET /api/settings/app` → `{ settings }`; `PUT /api/settings/app` body `{ settings: { … } }`.
```json
{ "systemPrompt": "…", "defaultProviderId": "p_…", "defaultModel": "…",
  "defaultSkill": "auto", "maxToolIterations": 6, "maxUploadMb": 25,
  "allowSignup": true, "appName": "fBuddy", "imageModel": "…" }
```

### 5.2 Providers (LLM) — `/api/settings/providers`
```json
{ "id": "p_…", "name": "Gemini", "kind": "openai|anthropic|gemini|openrouter|openai-compatible|mock",
  "baseUrl": "https://…", "models": ["…"], "defaultModel": "…", "imageModel": "…",
  "enabled": true, "hasApiKey": true, "apiKeyPreview": "AIza…4f2",
  "createdAt": "…", "updatedAt": "…" }
```
- `GET` → `{ items: Provider[] }` (không bao giờ trả `apiKey` thật, chỉ `apiKeyPreview`).
- `POST` body `{ name, kind, baseUrl?, apiKey, models?, defaultModel?, imageModel? }` → `{ provider }`.
- `PATCH /:id` — gửi `apiKey` mới để thay; bỏ trống = giữ nguyên; `apiKey: ""` = xoá.
- `DELETE /:id` → `{ ok: true }`.
- `POST /:id/test` → `{ ok, latencyMs, models?: [...], message }` (gọi thật 1 request nhỏ).
- **Lưu ý về mặc định thiếu key**: nhà cung cấp mặc định không có key vẫn được lưu là mặc định, nhưng lượt chat sẽ
  **tự lùi** về nhà cung cấp đang bật đầu tiên có key; sự kiện `start` kèm `notice` giải thích. Nút
  **“Đặt mặc định”** trong tab Nhà cung cấp AI gọi `PUT /api/settings/app` với `defaultProviderId` + `defaultModel`.

### 5.3 MCP servers — `/api/settings/mcp`
```json
{ "id": "s_…", "name": "filesystem", "transport": "stdio|http|sse",
  "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/srv"],
  "env": { "KEY": "…" }, "url": "https://…/mcp", "headers": { "Authorization": "Bearer …" },
  "enabled": true, "autoApprove": false, "timeoutMs": 30000,
  "status": "connected|error|disabled|unknown", "toolCount": 12, "lastError": null,
  "tools": [{ "name": "read_file", "description": "…", "inputSchema": { } }] }
```
- `GET /api/settings/mcp` → `{ items: McpServer[] }` (env/headers được che: chỉ trả tên khoá + `hasValue`).
- `POST`, `PATCH /:id`, `DELETE /:id`.
- `POST /:id/test` → `{ ok, tools: [...], latencyMs, message }` — kết nối thật, liệt kê tool.
- `POST /:id/refresh` → `{ server }` — nối lại và cập nhật danh sách tool.
- `GET /api/mcp/tools` → `{ items: [{ serverId, serverName, name, description, inputSchema, qualifiedName }] }`
  với `qualifiedName = "mcp__<serverSlug>__<toolName>"` (đây là tên model nhìn thấy).

### 5.4 Models & skills cho UI
- `GET /api/models` → `{ items: [{ providerId, providerName, model, isDefault, supportsTools, supportsVision, kind }] }`
- `GET /api/skills` → danh sách kỹ năng của **chính người dùng** + toàn bộ danh mục:
  ```json
  { "items": [SkillDescriptor],        // đã cài, theo thứ tự người dùng chọn — dropdown hiển thị cái này
    "installed": ["chat", "ppt"],      // id theo thứ tự
    "catalog": [SkillDescriptor],      // mọi kỹ năng, gồm cả mục "coming_soon" của chợ kỹ năng
    "maxSelectable": 10,
    "tools": [{ "name": "generate_pptx", "label": "Tạo slide PowerPoint", "skill": "ppt", "description": "…" }] }
  ```
  `SkillDescriptor` = `{ id, label, icon, description, starterPrompts, category?, state?: "ready"|"coming_soon", builtin? }`.
  Bộ cơ bản hiện có: `chat`, `image`, `ppt`, `excel`, `data`. `auto` là lựa chọn ảo ("Tự động"), không lưu vào DB.
- `PUT /api/skills/installed` (auth) body `{ "ids": ["ppt", "data"] }` → `{ installed, items }`.
  Quy tắc: giữ **ít nhất 1**, tối đa `maxSelectable` (10), bỏ qua `auto`, id không tồn tại → 400,
  id thuộc `coming_soon` → 400 kèm lý do "sẽ có ở chợ kỹ năng". Danh sách là **theo từng người dùng**;
  người dùng chưa từng lưu gì thì mặc định nhận **toàn bộ kỹ năng đang mở**.
- Kỹ năng được gửi lên ở `POST /api/chat/stream` qua field `skill`; server chấp nhận mọi id có trong danh mục
  (kỹ năng tương lai không cần sửa server), id lạ thì rơi về `app.defaultSkill`.

## 6. Skill built-in (server thực thi, model gọi qua tool)

| Tool name | Tham số | Kết quả |
|---|---|---|
| `generate_pptx` | `{ title?, subtitle?, theme?, slides: [{ title, subtitle?, bullets?: string[], notes? }] }` | artifact `.pptx` |
| `generate_xlsx` | `{ filename?, sheets: [{ name, columns: string[], rows: any[][], totalsRow? }] }` | artifact `.xlsx` |
| `analyze_data` | `{ fileId, operations: [{ op, ... }] }` — op ∈ `describe`,`value_counts`,`group_by`,`timeseries`,`correlation`,`sort`,`filter`,`top`. `filter` dùng `column` + `op_filter` (∈ `eq`,`ne`,`gt`,`gte`,`lt`,`lte`,`contains`,`not_contains`,`in`,`is_null`,`not_null`) + `value`; `top` dùng `n`/`labelColumn`; `sort` dùng `desc`/`limit` | `{ summary, tables, chart }` (chart = spec cho web vẽ) |
| `edit_image` | `{ fileId, instruction, model? }` | artifact ảnh mới (cần provider có model ảnh) |
| `open_image_studio` | `{ fileId? }` | chỉ đường mở Image Studio (thao tác ở đó không tốn credit) |
| `list_files` | `{}` | danh sách FileRef của user (để model biết `fileId`) |

Quy tắc: mọi tool trả JSON ngắn gọn cho model (`summary` + dữ liệu cần), artifact trả qua event `artifact`.
Danh sách tool gửi cho model **luôn đầy đủ** (kỹ năng chỉ "steer" bằng system prompt, không chặn tool); mọi schema
đều được gửi lại ở **mỗi** request nên mô tả trong schema được viết rất ngắn để tiết kiệm token.

## 7. Health & meta

- `GET /api/health` → `{ ok: true, version, uptimeSec, providerCount, mcpCount }` (không cần auth).
- `GET /api/meta` → `{ appName, version, allowSignup, firstUserIsAdmin, hasProvider, authMethods, mailer, loginTokenTtlMin, promo: { reminderMinutes, creditSnoozeMinutes }, credits: { enabled, signupCredits, perToken, vndPerCredit, buyUrl } }` (không cần auth).

## 8. Credit (cách cấp và cách trừ)

**1 token = `creditsPerToken` credit, tính theo tổng token vào + token ra của mỗi lượt trả lời** (giống cách ChatGPT
tính usage). `creditsPerToken` là số **thập phân** (mặc định **0,06**) nên đừng làm tròn nó thành số nguyên:

```
credit bị trừ = max(1, ceil((token_vào + token_ra) × creditsPerToken))
tiền bị trừ   = credit bị trừ × vndPerCredit        (mặc định 1đ/credit)
```

- **Đơn giá đang chạy: 0,06 credit/token × 1đ/credit.** Đo thật trên production qua 48 lượt: median 3.345 token,
  trung bình 3.483 token một lượt ⇒ **một lượt chat ≈ 210 credit ≈ 210đ**. Đây là con số mục tiêu đã chốt, có test
  canh (`credits.test.js` → "the shipped credit rate keeps one chat turn near 200đ").
- Số dư = `SUM(delta)` trên sổ cái `credit_ledger` (append-only, mỗi bút toán lưu `balance_after`). Lý do bút toán:
  `signup`, `admin_grant`, `chat_usage`, `request_approved`, `topup_paid`, `skill_purchase`.
- Cấp credit: tài khoản mới nhận `signupCredits` (mặc định **10.000** ≈ 10.000đ ≈ 47 lượt) ngay lần đăng nhập đầu;
  admin cấp thêm bằng `POST /api/admin/credits`; yêu cầu của user được duyệt thì ghi `request_approved`.
- Cổng chặn: hết credit ⇒ `POST /api/chat/stream` trả **402** `insufficient_credits` kèm `buyUrl`. Admin luôn qua được
  cổng (số dư có thể âm) nhưng **vẫn bị trừ credit** như người thường.
- Vì sao một lượt chat tốn ~3.500 token: mỗi request gửi lại **toàn bộ schema công cụ (~1.600 token, đo thật trên
  GLM-4-Flash)** + system prompt (~120 token) + lịch sử hội thoại (tối đa 24 message) + câu trả lời.
- `averageCostPerTurn` trả về chi phí **một lượt điển hình** (`TYPICAL_TURN_TOKENS = 3.500`) khi user chưa có lượt nào,
  thay vì "1 credit" — nếu không thì tài khoản mới sẽ thấy "còn 10.000 lượt" trong khi thực tế chỉ ~47.

Endpoint:

- `GET /api/credits` (auth) → `{ credits: { enabled, balance, granted, spent, entries, perToken, vndPerCredit, averageCostPerTurn, estimatedTurnsLeft, buyUrl, recent: [{ delta, reason, ref, balanceAfter, createdAt }] } }`.
- `POST /api/admin/credits` (admin) `{ email, amount, note? }` → cấp (amount > 0) hoặc trừ (amount < 0); `amount = 0` ⇒ 400.
- `GET /api/admin/users` (admin) → mỗi user kèm `creditBalance`.
- `POST /api/credit-requests` (auth) `{ amount, reason? }` → 1 yêu cầu `pending`/user, gửi Telegram kèm 2 link duyệt có
  chữ ký HMAC. `GET /api/credit-requests` trả yêu cầu của user (admin thấy tất cả);
  `POST /api/credit-requests/:id/decide` `{ decision: "approve"|"reject", note? }` (idempotent);
  link trong Telegram: `GET /api/credit-requests/decide?token=…` (hết hạn ⇒ 410, chữ ký sai ⇒ 403).
- Popup nhắc nạp credit đọc `/api/meta` + `/api/credits`: **5 phút** khi số dư = 0, **1440 phút** khi còn credit.

Cài đặt trong `app_settings`: `creditsEnabled`, `signupCredits`, `creditsPerToken` (thập phân), `vndPerCredit`,
`creditBuyUrl`, `promoReminderMinutes`, `promoCreditSnoozeMinutes`, `topupPackages`. Trên control panel, ô
`creditsPerToken` phải giữ được phần thập phân (`decimalOr`, không phải `intOr`) — làm tròn nó về 0 sẽ khiến mọi lượt
chat miễn phí.

### 8.1 Model biết gì về credit

`buildCreditKnowledge(user)` trong `server/src/agent.js` chèn một khối vào system prompt **mỗi lượt**: công thức trừ
credit, `signupCredits`, số dư/đã dùng/trung bình mỗi lượt của chính user, và hướng dẫn 2 đường nạp (“Xin thêm token”
trong menu tài khoản, “Mua thêm token” → trang nạp credit). Nhờ vậy trợ lý trả lời đúng khi được hỏi về credit thay vì
nói “fBuddy miễn phí”. Tắt `creditsEnabled` thì khối này biến mất.

## 9. Nạp credit (`/api/topup`)

| Method | Path | Việc |
|---|---|---|
| `GET` | `/api/topup` | gói đang bán + đơn gần đây của user + thông tin ngân hàng |
| `POST` | `/api/topup/orders` | `{ packageId }` → đơn `pending` kèm mã `FBUDDY######` và URL ảnh VietQR |
| `POST` | `/api/topup/orders/:id/transferred` | user báo “đã chuyển khoản” → `awaiting_confirmation` + Telegram cho admin |
| `POST` | `/api/topup/orders/:id/cancel` | user huỷ đơn của mình |
| `GET` | `/api/topup/orders/:id/confirm?t=…` | admin xác nhận qua link có chữ ký (30 ngày) → `paid` + cộng credit |
| `GET` | `/api/admin/topup-orders` | admin xem đơn (lọc `?status=`) |
| `POST` | `/api/admin/topup-orders/:id/confirm` | admin xác nhận thủ công |
| `POST` | `/api/topup/sepay` | **SePay gọi vào** (webhook) — xem §9.1 |
| `GET` | `/api/admin/sepay/status` | admin: bật/chế độ/đã có credential chưa/đơn đang chờ/vòng poll gần nhất |
| `POST` | `/api/admin/sepay/poll` | admin: chạy một vòng poll ngay (cần API token) |

Trạng thái đơn: `pending` → `awaiting_confirmation` → `paid` (hoặc `cancelled`). Credit chỉ được ghi **một lần**
(`reason = topup_paid`) nên bấm lại link không cộng thêm. Cài đặt: `topupPackages`, `bankId`, `bankAccount`,
`bankAccountName`, `bankNotePrefix`.

### 9.1 SePay — tự động xác nhận nạp tiền

Hai đường, chọn bằng `sepayMode`:

- **`webhook`** — SePay POST về `/api/topup/sepay`. Xác thực bằng HMAC-SHA256
  (`X-SePay-Signature: sha256=…` + `X-SePay-Timestamp`, chuỗi ký = `{timestamp}.{raw_body}`, lệch quá 300 giây bị
  từ chối) **hoặc** `Authorization: Apikey <webhook secret>`. Route nhận **nguyên văn thân request**
  (`index.js` gắn `express.raw` cho đúng path này trước `express.json`) vì chữ ký tính trên bytes gốc — proxy sửa body
  là chữ ký hỏng. Đã xác thực thì luôn trả **200**, kể cả khi không khớp đơn nào (tiền vào vì việc khác), để SePay
  không gửi lại vô ích; `403` khi `sepayEnabled = false`, `401` khi chữ ký sai, `400` khi thân không phải JSON.
- **`poll`** — server tự gọi API giao dịch của SePay mỗi `sepayPollSeconds` (mặc định 60, kẹp 30–3600). Poller trong
  `index.js` đọc lại cài đặt **mỗi vòng** nên bật/tắt hay đổi chu kỳ có hiệu lực ngay, không cần restart; chỉ chạy khi
  đã bật, đang ở chế độ `poll` và đã có API token. Lỗi mạng chỉ ghi log rồi thử lại vòng sau.

Credit chỉ được cộng qua `confirmTopupOrder` (đã idempotent) nên webhook gửi lại hay poll trùng đều **không** cộng hai
lần. Khớp đơn theo mã chuyển khoản trong nội dung, và số tiền phải ≥ 80% giá đơn (ngân hàng trừ phí vẫn nhận, nhưng
không khớp nhầm giao dịch nhỏ hơn).

Cài đặt: `sepayEnabled`, `sepayMode`, `sepayPollSeconds`, `sepayApiToken` (chế độ poll), `sepayWebhookSecret`
(webhook). Hai secret lưu **mã hoá AES-256-GCM**; API chỉ trả bản che (`hasSepayApiToken`, `sepayApiTokenPreview`,
`hasSepayWebhookSecret`, `sepayWebhookSecretPreview`). Kiểm chứng thật: `ops/sepay-e2e-check.mjs`.


## 10. Chợ kỹ năng (Skill Hub)

- `GET /api/hub` (auth) → danh sách skill đang bán + `owned` + số dư. **Không** trả `instructions`/`tools`.
- `POST /api/hub/skills/:id/buy` (auth) → trừ credit (`skill_purchase`), ghi `hub_purchases`, tự cài vào `user_skills`
  (tối đa 10 kỹ năng). Giá 0 ⇒ vẫn ghi nhận sở hữu. Hết credit ⇒ **402**.
- **Giá kỹ năng tính bằng VND, tách rời giá credit.** `priceVnd` là giá **lưu trong DB** (nguồn sự thật);
  `price` (credit) do server suy ra = `ceil(priceVnd / vndPerCredit)`, nên đổi giá credit KHÔNG đổi giá chợ.
  Kỹ năng trả tiền luôn tốn tối thiểu 1 credit (không bao giờ thành miễn phí do làm tròn).
  Đơn giá hiện tại: cả 6 kỹ năng = **50.000đ**.
- `GET/POST /api/admin/hub`, `PATCH/DELETE /api/admin/hub/:id` (admin) → CRUD prompt-pack
  (name, tagline, description, category, icon, **priceVnd**, instructions, tools, state, sortOrder, installs).
  `GET` và câu trả lời của `POST`/`PATCH` **có** `instructions`/`tools` để form Sửa nạp sẵn prompt pack.
  `price` (credit) vẫn nhận khi ghi để tương thích, quy đổi theo giá credit hiện hành.
- `installs` là bộ đếm **suy ra được**: `PATCH { installs }` chỉ để admin sửa tay (dọn dữ liệu test);
  nguồn sự thật vẫn là số dòng `hub_purchases` — `ops/hub-catalog-fix.mjs` tính lại từ đó.
- Giá bán tính bằng VND; `ops/hub-catalog-fix.mjs` sửa giá + bộ đếm theo dữ liệu thật,
  `ops/import-hub-skills.mjs` nhập hàng loạt từ thư mục `SKILL.md` (Claude/CodeBuddy) hoặc JSON
  (`--price-vnd 50000`).
- Kỹ năng mua được chọn trong dropdown như kỹ năng built-in; prompt pack được chèn vào system prompt và có thể thu hẹp
  danh sách tool mà nó cần.

## 11. Đa ngôn ngữ (i18n)

`web/src/i18n/` — khoá dạng `namespace.key`, ba locale `vi` (gốc) · `en` · `zh`, namespace
`common|auth|shell|chat|settings|studio|voice|hub|topup`. `useI18n()` cho `t()`, `n()` (số), `d()` (ngày);
thiếu khoá ⇒ lùi về tiếng Việt rồi in ra chính khoá. Ngôn ngữ lưu ở `localStorage["fbuddy.locale"]`, ép bằng `?lang=`.

## 8. Voice (nói chuyện bằng giọng nói)

Hai nửa pipeline độc lập, **mặc định là trình duyệt** (miễn phí, không cần key, không cần cài gì):
STT = Web Speech API, TTS = SpeechSynthesis. Khi admin trỏ một nửa vào nhà cung cấp thì server làm thay,
chất lượng giống nhau trên mọi máy.

- `GET /api/voice/config` (auth) →
  ```json
  { "config": {
      "language": "vi-VN", "autoRead": false, "speakRate": 1,
      "stt": { "mode": "browser|server", "providerId": null, "providerName": null, "model": null },
      "tts": { "mode": "browser|server", "providerId": null, "providerName": null, "model": null, "voice": null },
      "options": [{ "id": "p_…", "name": "Gemini", "kind": "gemini", "models": ["…"],
                    "supportsStt": true, "supportsTts": true,
                    "defaultSttModel": "gemini-2.5-flash",
                    "defaultTtsModel": "gemini-2.5-flash-preview-tts",
                    "defaultTtsVoice": "Kore" }] },
    "browserHint": "…" }
  ```
- `POST /api/voice/transcribe` (auth, `multipart/form-data`: `audio` file, `language?`, `hint?`) →
  `{ text, provider, model, durationMs }`. **400** kèm hướng dẫn khi `stt.mode === "browser"`.
- `POST /api/voice/speech` (auth, JSON `{ text, voice? }`) → nhị phân `audio/wav` (Gemini: PCM 24kHz được
  bọc header WAV) hoặc `audio/mpeg` (OpenAI-compatible). **400** khi `tts.mode === "browser"`.
- `POST /api/settings/voice/test` (admin, JSON `{ text? }`) → nhị phân audio + header
  `X-Voice-Provider`, `X-Voice-Latency-Ms`; trả JSON `{ ok:false, message }` khi chưa cấu hình provider.
- Giới hạn: 120 request/phút/user cho hai endpoint voice; clip tối đa 15 MB.

Cài đặt voice nằm trong `app_settings`: `voiceSttProviderId`, `voiceSttModel`, `voiceTtsProviderId`,
`voiceTtsModel`, `voiceTtsVoice`, `voiceLanguage`, `voiceAutoRead`, `voiceSpeakRate`.

## 12. Bảo mật

- API key provider/MCP lưu **mã hoá AES-256-GCM** (khoá từ `FBUDDY_SECRET`); không bao giờ trả lại nguyên văn.
- Rate limit: 60 request/phút/user cho `/api/chat/stream`, 20/phút cho `/api/auth/*` (theo IP).
- Tệp lưu ngoài webroot; tải qua endpoint có kiểm tra chủ sở hữu.
- CORS: chỉ cho phép `FBUDDY_PUBLIC_URL` + `http://localhost:5173` (dev).

### Xác thực email mới active (2026-09-26)

- Người dùng mới (`/api/auth/register`) tạo ở trạng thái **chưa xác thực**: không mở phiên, không
  dùng được app. Server gửi mã 6 số + link kích hoạt; `/api/auth/verify-email` (hoặc link
  `/?verifyEmail=…&token=…`) kích hoạt rồi mở phiên luôn.
- Chưa cấu hình mailer (Resend) ⇒ tài khoản được kích hoạt ngay (nếu không thì không ai vào được);
  phản hồi có `activatedWithoutVerification: true`.
- Đăng nhập không mật khẩu (`/api/auth/request-token` → `/api/auth/verify-token`): nhận được mã tức
  là đã chứng minh sở hữu hộp thư ⇒ kích hoạt luôn.
- Tài khoản CÓ TRƯỚC tính năng được **grandfather = đã xác thực** khi nâng cấp (không khoá ai).
- Công tắc: Cài đặt → `requireEmailVerification` (mặc định bật), `emailVerificationTtlMin` (30 phút).
- Mọi route cần đăng nhập trả 403 `email_not_verified` nếu tài khoản chưa xác thực.
