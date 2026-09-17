# FlowGpt — `flowgpt.meetflowai.site`

Web AI chatbox kiểu ChatGPT/ChatFPT cho hệ MeetFlow AI: chat streaming có tool-calling, **bốn skill chạy thật**
(sửa ảnh, tạo PowerPoint, tạo Excel, phân tích dữ liệu), **nói chuyện bằng giọng nói** (dictation, đọc câu trả lời,
chế độ rảnh tay có barge-in) và **cấu hình nhà cung cấp AI + MCP server ngay từ backend**.

> Đăng nhập hiện tại: **mã dùng một lần gửi qua email** (passwordless, có magic link). SSO Firebase/Facebook
> đã chừa sẵn chỗ và sẽ bật sau. Đăng ký bằng email + mật khẩu không dùng nữa (vẫn giữ làm đường dự phòng cho admin).

## Trạng thái production

| | |
|---|---|
| URL | **https://flowgpt.meetflowai.site** |
| Máy chủ | node-2 `165.101.114.162` — systemd `flowgpt`, cổng nội bộ `127.0.0.1:7790`, Caddy làm TLS |
| Dữ liệu | `/var/lib/flowgpt` (SQLite + tệp + artifact) · cấu hình `/etc/flowgpt/flowgpt.env` (600) |
| Model mặc định | **DeepSeek `deepseek-chat`** (key lưu mã hoá AES-256-GCM; đổi trong Cài đặt) |
| Giọng nói | **Miễn phí bằng trình duyệt** (Web Speech + SpeechSynthesis). Trên **Microsoft Edge** có sẵn giọng tiếng Việt natural **Hoài My / Nam Minh**. Muốn chất lượng đồng nhất mọi máy thì trỏ STT/TTS sang một provider (Gemini/Groq free tier) trong **Cài đặt → Giọng nói** |
| Email | **Resend** (gửi từ `no-reply@meetflowai.site`) — mã đăng nhập đã gửi thật, `delivered` |
| Vào hệ thống lần đầu | Email đăng nhập **đầu tiên** tự thành **quản trị viên** |
| Bàn giao | [`docs/HANDOVER.md`](docs/HANDOVER.md) — bằng chứng, bug đã sửa, việc còn lại |

**Cấu hình nằm ở đâu:** đăng nhập → sidebar **Cài đặt & MCP** → 4 tab: *Nhà cung cấp AI* (thêm/sửa key, test kết nối,
nạp danh sách model), *MCP server* (thêm server stdio/http/sse, test, xem tool), *Hệ thống* (prompt hệ thống,
model mặc định, email & đăng nhập, thống kê), *Người dùng*.


```
flowgpt/
├── server/           Node 22+ (Express 5, ESM, node:sqlite) — API + agent + skills + MCP client
├── web/              React 18 + Vite + TypeScript — UI tiếng Việt, theme FlowTech
├── deploy/           systemd unit, Caddy block, script deploy lên node-2, script DNS Cloudflare
├── docs/             API contract, kiến trúc, hướng dẫn deploy
└── ops/              script vận hành (probe VPS, báo cáo Telegram)
```

## Chạy ở máy (dev)

```powershell
cd "C:\Users\Minhn\FlowTech AI\flowgpt"
npm install                      # đã cài sẵn; nếu chạy lại nhớ --ignore-scripts nếu sandbox chặn spawn
npm run dev:server               # API ở http://127.0.0.1:7790
npm run dev:web                  # UI ở http://localhost:5173 (proxy /api → 7790)
```

Mở http://localhost:5173 → nhập email → **mã đăng nhập hiện thẳng trên màn hình** khi chưa cấu hình email
(production đã cấu hình Resend nên mã được gửi vào hộp thư).
Email đăng nhập đầu tiên tự trở thành **quản trị viên**.

Sau khi vào được:

1. **Cài đặt → Nhà cung cấp AI**: bật provider **Demo** để thử toàn bộ luồng (chat, gọi công cụ, tạo tệp) mà
   không cần API key — hoặc thêm key thật (Google Gemini, OpenAI, Anthropic, DeepSeek/OpenRouter/Ollama…).
2. **Cài đặt → MCP server**: thêm MCP server (stdio/http/sse). Tool của MCP sẽ xuất hiện với model dưới tên
   `mcp__<server>__<tool>` và dùng chung vòng lặp tool-calling với skill built-in.
3. **Cài đặt → Hệ thống → Email & đăng nhập**: dán **Resend API key** để gửi mã đăng nhập thật thay vì hiện trên màn hình.

## Kiểm thử

```powershell
node --test "server/test/*.test.js"     # 77 ca: auth, provider, MCP, chat SSE, 4 skill, voice, phân quyền, rate limit
node ops/smoke.mjs http://127.0.0.1:7790/api            # smoke end-to-end (local)
node ops/smoke.mjs https://flowgpt.meetflowai.site/api  # smoke qua domain công khai
```

Bộ test dùng provider `mock` nên **không cần mạng và không cần API key**; các ca skill kiểm tra byte thật của
tệp `.pptx`/`.xlsx` (magic `PK`) và nội dung bảng phân tích trả về.

Các script vận hành khác trong `ops/`: `deploy`-helpers cho node-2 (`check-deploy.sh`, `reset-data.sh`,
`enable-mailer.sh`, `diagnose-login.sh`), cấu hình model (`configure-deepseek.mjs`) và kiểm tra UI bằng trình duyệt
headless (`ui-check.mjs`, `ui-login-check.mjs`, `ui-chat-check.mjs`, `ui-settings-shot.mjs`).

## Kiến trúc trong 30 giây

- **Agent loop** (`server/src/agent.js`): dựng prompt hệ thống theo skill → gọi provider (stream) → nếu model
  yêu cầu tool thì thực thi (built-in hoặc MCP) → nối kết quả vào hội thoại → lặp tối đa `maxToolIterations`.
  Mọi bước được phát ra UI qua SSE (`start`, `status`, `delta`, `tool_call`, `tool_result`, `artifact`, `done`).
- **Provider adapter** (`server/src/providers/*`): OpenAI-compatible, Anthropic, Gemini (+ `mock`) cùng một giao
  diện `streamChat()`; thêm provider mới = thêm 1 file + 1 dòng trong `PROVIDER_KINDS`.
- **MCP** (`server/src/mcp.js`): giữ một client sống cho mỗi server đã bật, gộp tool, gọi tool, và luôn che
  secret khi trả về UI.
- **Skill** (`server/src/skills/*`): `generate_pptx` (pptxgenjs), `generate_xlsx` (exceljs),
  `analyze_data` (parser CSV/Excel + thống kê + chart spec), `edit_image` (provider có model ảnh).
- **Dữ liệu**: SQLite (`node:sqlite`) tại `FLOWGPT_DATA_DIR`; tệp và artifact nằm ngoài webroot, tải qua
  endpoint có kiểm tra chủ sở hữu; API key provider/MCP mã hoá AES-256-GCM bằng `FLOWGPT_SECRET`.

Chi tiết: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · hợp đồng API: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) ·
triển khai: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Giao diện

Theme lấy đúng palette **FlowTech Harness** (navy `#0A1F3B`, layer `#0E2747`/`#123052`/`#16385E`,
accent `#33C773`, chữ trên nền accent `#0A1F3B`) và logo FlowTech (`web/public/brand-mark.png`,
`brand-logo.png`, `favicon.png`). Mọi màu đi qua biến CSS trong `web/src/styles.css` — không hard-code màu ở component.
