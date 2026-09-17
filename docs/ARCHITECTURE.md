# Kiến trúc FlowGpt

## 1. Tổng quan

```
Trình duyệt (React 18 + Vite)
   │  fetch /api/*  (Bearer JWT hoặc cookie httpOnly)
   ▼
Caddy (flowgpt.meetflowai.site)  ──TLS──▶  127.0.0.1:7790
   ▼
Express 5 (server/src/index.js)
   ├── auth.js        đăng nhập bằng mã email (passwordless) + mật khẩu dự phòng
   ├── agent.js       vòng lặp agent: prompt → provider → tool → lặp → SSE
   ├── providers/     OpenAI-compatible · Anthropic · Gemini · mock (cùng 1 giao diện)
   ├── mcp.js         MCP client (stdio/http/sse), gộp tool, che secret
   ├── skills/        pptx · xlsx · analyze_data · edit_image  (+ artifact)
   ├── files.js       lưu tệp/artifact, kiểm tra chủ sở hữu
   ├── settings.js    provider + MCP + app settings (key mã hoá AES-256-GCM)
   ├── mailer.js      gửi mã đăng nhập qua Resend (fallback: hiện mã trên màn hình)
   └── db.js          node:sqlite (WAL) + helper insert/update/all/one
   ▼
/var/lib/flowgpt/{flowgpt.db, files/*}
```

## 2. Vòng đời một lượt chat

1. UI gọi `POST /api/chat/stream` (JSON) → server mở **SSE** và phát ngay `start`.
2. `prepareTurn()`: xác định skill/model/provider (chọn tường minh → hội thoại → mặc định → provider bật đầu tiên),
   tạo/ cập nhật hội thoại, lưu tin nhắn người dùng, gắn tệp đã upload.
3. `buildModelMessages()`: system prompt (base + hướng dẫn theo skill + danh sách tệp kèm `fileId`) + lịch sử gần nhất;
   ảnh được chuyển thành payload vision, tệp văn bản/CSV được chèn dạng text.
4. Vòng lặp tối đa `maxToolIterations` (mặc định 6, trần 12):
   - gọi `streamChat()` của provider → phát `delta` / `reasoning`;
   - nếu model trả `tool_calls` → phát `tool_call`, thực thi (built-in hoặc MCP), phát `tool_result` + `artifact`,
     rồi nối `assistant(tool_calls)` + `tool(result)` vào hội thoại để model trả lời tiếp;
   - không còn tool call → kết thúc.
5. Lưu **một** tin nhắn assistant cho cả lượt (nội dung ghép + toolCalls + toolResults + artifacts + usage),
   cập nhật tiêu đề/preview, phát `done`.

Client ngắt kết nối ⇒ `AbortController` hủy lượt gọi provider (không tính phí thêm).

## 3. Provider adapter

Mọi adapter cùng một hợp đồng:

```js
async function* streamChat({ provider, model, messages, tools, toolMode, temperature, signal })
// yield: {type:'delta'|'reasoning'|'tool_call'|'usage'|'done', ...}
```

- `messages` dùng dạng chuẩn hoá `{ role, content, images?, toolCalls?, toolCallId?, name? }`;
  mỗi adapter tự chuyển sang định dạng riêng (OpenAI `tool_calls`, Anthropic `tool_use/tool_result`,
  Gemini `functionCall/functionResponse`).
- `null`/field thừa không bị đẩy sang provider (Gemini còn bị lọc JSON-Schema theo danh sách key cho phép).
- Thêm provider mới: tạo `providers/<ten>.js` (3 hàm `streamChat`, `listModels`, `testConnection`) rồi thêm một
  mục vào `PROVIDER_KINDS` và `ADAPTERS` trong `providers/index.js`.

## 4. MCP (backend quản lý)

- Admin khai báo server trong **Cài đặt → MCP server**; cấu hình lưu mã hoá (env/headers là secret map,
  chỉ trả về `key` + `hasValue` + preview).
- Khi bật, server giữ **một client sống** cho mỗi MCP server; trạng thái (`connected`/`error`) và danh sách tool
  được ghi lại vào DB để UI hiển thị; sửa cấu hình sẽ reset trạng thái.
- Tool MCP được đặt tên `mcp__<slug>__<tool>` và đưa vào **cùng** danh sách tool với skill built-in, nên model
  không cần biết tool nào từ đâu. Kết quả gọi tool được làm phẳng thành text (+ ảnh nếu có) trước khi trả cho model.
- `stdio` sẽ spawn tiến trình con trên server: chạy được trong systemd của VPS, nhưng **không chạy được trong
  sandbox của harness Windows** (named pipe bị chặn) — dùng `http`/`sse` khi phát triển ở máy.

## 5. Skill built-in

Kỹ năng là **dữ liệu**, không phải code cứng trong UI: `skills/index.js` có `SKILL_CATALOG`
(`state: "ready"` dùng được ngay, `state: "coming_soon"` là chỗ chờ chợ kỹ năng), và
`skills/installed.js` giữ danh sách kỹ năng **của từng người dùng** (bảng `user_skills`) — đây là cái
dropdown "top 10" hiển thị, và cũng chính là chỗ chợ kỹ năng sẽ ghi vào khi anh mở nó.
Người dùng chưa lưu gì thì mặc định nhận mọi kỹ năng `ready`, nên không cần migrate.

| Tool | Thư viện | Ghi chú |
|---|---|---|
| `generate_pptx` | pptxgenjs | 4 theme, slide tiêu đề + nội dung, ghi chú trình bày, tối đa 60 slide |
| `generate_xlsx` | exceljs | nhiều sheet, freeze header, autofilter, định dạng số theo tên cột, dòng TỔNG (SUM) |
| `analyze_data` | tự viết | parser CSV/TSV/JSON + ExcelJS cho `.xlsx`; op `describe`, `value_counts`, `group_by`, `timeseries`, `correlation`, `sort`, `filter`, `top`; trả bảng + **chart spec** cho web vẽ |
| `edit_image` | provider ảnh | Gemini `*-image` / OpenAI `gpt-image-1`; ảnh canvas thuần do web xử lý (không cần key) |
| `list_files` | – | cho model biết `fileId` của tệp người dùng đã tải lên |

Mọi skill trả cùng một hình dạng: `{ ok, summary, data, artifacts, modelText }` — `modelText` là phần model đọc,
`data` là phần UI đọc (bảng/biểu đồ), `artifacts` là tệp tải về.

## 6. Dữ liệu (SQLite)

`users` · `conversations` · `messages` · `files` · `providers` · `mcp_servers` · `app_settings` · `email_tokens` ·
`usage_log` · `audit_log`.

- Booleans lưu 0/1; cột JSON có hậu tố `_json` được `db.js` tự encode/decode.
- `insert()` tự điền `created_at`/`updated_at` (NOT NULL) nếu thiếu.
- `app_settings` là key-value JSON của các thiết lập đã biết; key lạ bị bỏ qua
  (whitelist theo `DEFAULT_APP_SETTINGS`).

## 7. Đăng nhập bằng mã email

1. `POST /api/auth/request-token` → giới hạn **3 lần/email/15 phút**; email lạ sẽ được tạo tài khoản nếu
   `autoCreateUserOnLogin` (email đầu tiên của hệ thống luôn là **admin**).
2. Sinh **mã 6 số** + **magic link** (cùng hạn `loginTokenTtlMin`), lưu **HMAC-SHA256 có pepper** (`FLOWGPT_SECRET`)
   — mã mới **vô hiệu hoá** mọi mã cũ chưa dùng.
3. Gửi qua Resend nếu có key; nếu chưa cấu hình và `showLoginCodeWhenNoMailer` bật thì trả mã về UI để vẫn dùng được.
4. `POST /api/auth/verify-token` → sai 5 lần là khoá mã; thành công thì mã bị đánh dấu đã dùng (một lần), các mã
   khác của cùng email cũng bị huỷ, trả JWT (`token_version` cho phép thu hồi khi đổi mật khẩu).
5. SSO Firebase/Facebook: `meta.authMethods.sso` đã có (đang `false`); chỉ cần thêm endpoint đổi Firebase/Facebook
   token lấy JWT nội bộ — phần còn lại của app không đổi.

## 7. Voice (speech in / speech out)

Voice là **hai nửa độc lập**, mỗi nửa chọn "trình duyệt" hoặc một nhà cung cấp:

| Nửa | Mặc định (miễn phí) | Khi trỏ vào provider |
|---|---|---|
| STT | Web Speech API (`SpeechRecognition`, `lang=vi-VN`) | `POST /api/voice/transcribe` → Gemini audio understanding, hoặc OpenAI-compatible `/audio/transcriptions` (Groq `whisper-large-v3-turbo`) |
| TTS | `SpeechSynthesis` (Edge có giọng vi-VN natural **Hoài My / Nam Minh**, miễn phí) | `POST /api/voice/speech` → Gemini TTS (PCM 24 kHz bọc thành WAV) hoặc OpenAI-compatible `/audio/speech` (mp3) |

- `server/src/voice/wav.js` bọc PCM thô của Gemini thành WAV để trình duyệt phát được, và đọc `rate=` từ mime.
- `server/src/voice/index.js` là adapter STT/TTS; hình dạng request được test bằng fetch giả
  (`server/test/voice.test.js`) nên không tốn tiền khi chạy test.
- Phía web: `useSpeechRecognition` (tự khởi động lại, map lỗi tiếng Việt), `useSpeechSynthesis`
  (ưu tiên giọng vi-VN natural, bỏ markdown trước khi đọc), `useVoiceConversation` (máy trạng thái
  nghe → suy nghĩ → nói → nghe, phát hiện im lặng bằng AnalyserNode, **barge-in** khi người dùng nói,
  `echoCancellation` để không thu tiếng loa).
- Chế độ "Nói chuyện" gửi transcript qua đúng `send()` của chat, nên vẫn dùng DeepSeek + skill + MCP như thường.
- Chi phí tham khảo (giá công bố 2026): trình duyệt **$0**; Soniox STT realtime $0,12/giờ + TTS ~$0,70/giờ;
  Gemini Live ~$1,38/giờ; OpenAI Realtime-2 ~$6–18/giờ.

## 8. Bảo mật

- API key provider/MCP: AES-256-GCM, khoá dẫn xuất từ `FLOWGPT_SECRET`; API chỉ trả preview.
- Mật khẩu (đường dự phòng): scrypt (`N=16384`), salt riêng mỗi lần, `timingSafeEqual`.
- JWT HS256 30 ngày, có `token_version` để thu hồi; cookie `httpOnly` + `Secure` khi `PUBLIC_URL` là https.
- Rate limit theo IP/user: `/api/auth/*` 20/phút, `/api/chat/stream` 60/phút, upload 40/phút, mã đăng nhập 3/15 phút.
- Tệp nằm ngoài webroot; mọi truy cập đều kiểm tra `user_id` (404 nếu không phải chủ).
- Upload whitelist MIME + giới hạn `maxUploadMb`; hành động quản trị ghi `audit_log`.
