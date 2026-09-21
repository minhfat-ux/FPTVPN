# fBuddy — `fbuddy.meetflowai.site`

Web AI chatbox kiểu ChatGPT/ChatFPT cho hệ MeetFlow AI: chat streaming có tool-calling, **bốn skill chạy thật**
(sửa ảnh, tạo PowerPoint, tạo Excel, phân tích dữ liệu), **nói chuyện bằng giọng nói** (dictation, đọc câu trả lời,
chế độ rảnh tay có barge-in) và **cấu hình nhà cung cấp AI + MCP server ngay từ backend**.

> Đăng nhập hiện tại: **mã dùng một lần gửi qua email** (passwordless, có magic link). SSO Firebase/Facebook
> đã chừa sẵn chỗ và sẽ bật sau. Đăng ký bằng email + mật khẩu không dùng nữa (vẫn giữ làm đường dự phòng cho admin).

> **Đã đổi tên FlowGpt → fBuddy và đã migrate production (2026-09-18).** Domain mới
> `fbuddy.meetflowai.site` đang chạy; domain cũ vẫn được Caddy reverse-proxy vào cùng ứng dụng
> nên link và webhook cũ không chết. Nhật ký migrate + cách rollback: [`docs/RENAME-FBUDDY.md`](docs/RENAME-FBUDDY.md).

## Trạng thái production

| | |
|---|---|
| URL | **https://fbuddy.meetflowai.site** |
| Máy chủ | node-2 `165.101.114.162` — systemd `fbuddy`, cổng nội bộ `127.0.0.1:7790`, Caddy làm TLS |
| Dữ liệu | `/var/lib/fbuddy` (SQLite + tệp + artifact) · cấu hình `/etc/fbuddy/fbuddy.env` (600) |
| Model mặc định | **OpenRouter** `google/gemini-2.5-flash` (key mã hoá AES-256-GCM). DeepSeek vẫn bật làm dự phòng. Đổi mặc định bằng nút **Đặt mặc định** trong Cài đặt → Nhà cung cấp AI |
| Kỹ năng | Dropdown **top 10** trong ô chat (danh sách theo từng người dùng) + nút **Thêm kỹ năng** mở chợ kỹ năng: 5 kỹ năng đang chạy + 4 mục “Sắp có” (MCP, tài liệu, dịch, kỹ năng riêng của công ty) |
| Giọng nói | **Miễn phí bằng trình duyệt** (Web Speech + SpeechSynthesis). Trên **Microsoft Edge** có sẵn giọng tiếng Việt natural **Hoài My / Nam Minh**. Muốn chất lượng đồng nhất mọi máy thì trỏ STT/TTS sang một provider (Gemini/Groq free tier) trong **Cài đặt → Giọng nói** |
| Email | **Resend** (gửi từ `no-reply@meetflowai.site`) — mã đăng nhập đã gửi thật, `delivered` |
| Vào hệ thống lần đầu | Email đăng nhập **đầu tiên** tự thành **quản trị viên** |
| Bàn giao | [`docs/HANDOVER.md`](docs/HANDOVER.md) — bằng chứng, bug đã sửa, việc còn lại |

**Cấu hình nằm ở đâu:** đăng nhập → sidebar **Cài đặt & MCP** → 4 tab: *Nhà cung cấp AI* (thêm/sửa key, test kết nối,
nạp danh sách model), *MCP server* (thêm server stdio/http/sse, test, xem tool), *Hệ thống* (prompt hệ thống,
model mặc định, email & đăng nhập, thống kê), *Người dùng*.


```
fbuddy/
├── server/           Node 22+ (Express 5, ESM, node:sqlite) — API + agent + skills + MCP client
├── web/              React 18 + Vite + TypeScript — UI tiếng Việt, theme FlowTech
├── deploy/           systemd unit, Caddy block, script deploy lên node-2, script DNS Cloudflare
├── docs/             API contract, kiến trúc, hướng dẫn deploy
└── ops/              script vận hành (probe VPS, báo cáo Telegram)
```

## Chạy ở máy (dev)

```powershell
cd "C:\Users\Minhn\FlowTech AI\fbuddy"
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
node --test "server/test/*.test.js"     # 133 ca: auth, provider (+OpenRouter/GLM), MCP, chat SSE, skill, credit, topup, chợ kỹ năng, voice, phân quyền, rate limit
node ops/smoke.mjs http://127.0.0.1:7790/api            # smoke end-to-end (local)
node ops/smoke.mjs https://fbuddy.meetflowai.site/api  # smoke qua domain công khai
node ops/credit-explain-check.mjs                       # hỏi chính fBuddy về credit và kiểm tra câu trả lời
node ops/ui-i18n-check.mjs                              # đổi VI/EN/ZH trong trình duyệt thật + chụp ảnh
```

Bộ test dùng provider `mock` nên **không cần mạng và không cần API key**; các ca skill kiểm tra byte thật của
tệp `.pptx`/`.xlsx` (magic `PK`) và nội dung bảng phân tích trả về.

Các script vận hành khác trong `ops/`: `deploy`-helpers cho node-2 (`check-deploy.sh`, `reset-data.sh`,
`enable-mailer.sh`, `diagnose-login.sh`), cấu hình model (`configure-deepseek.mjs`), dọn tài khoản test
(`prune-test-users.mjs`, mặc định chỉ xem trước) và kiểm tra UI bằng trình duyệt headless
(`ui-check.mjs`, `ui-login-check.mjs`, `ui-chat-check.mjs`, `ui-settings-shot.mjs`, `ui-i18n-check.mjs`).

## Credit (cách cấp và cách trừ)

**1 credit = 1 token**, tính theo tổng token **vào + ra** của mỗi lượt:

```
credit bị trừ = max(1, ceil((token_vào + token_ra) × creditsPerToken))
```

Tài khoản mới nhận `signupCredits` (mặc định 10.000) ở lần đăng nhập đầu; số dư đọc từ sổ cái append-only
`credit_ledger` nên mọi thay đổi đều giải thích được. Hết credit ⇒ `POST /api/chat/stream` trả **402** kèm link nạp;
admin không bị chặn nhưng vẫn bị trừ.

Vì sao một lượt chat tốn ~1.800 token: mỗi request gửi lại **toàn bộ schema công cụ (~1.600 token, đo thật trên
GLM-4-Flash)** + system prompt (~120 token) + lịch sử tối đa 24 message. Số đo: có công cụ `1.707`, không công cụ
`114`, chỉ câu hỏi `8`. Trợ lý được chèn một khối số liệu thật mỗi lượt (`buildCreditKnowledge` trong
`server/src/agent.js`) nên trả lời đúng khi được hỏi về credit thay vì nói "miễn phí".

Người dùng có 3 đường lấy thêm: **Xin thêm token** (menu tài khoản → gửi yêu cầu → admin duyệt qua Telegram),
**Mua thêm token** (trang nạp credit `?view=topup`, VietQR + đơn có mã `FBUDDY######`), và **Chợ kỹ năng**
(`?view=hub`) để mua prompt-pack bằng credit. Chi tiết: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) §8–§10.

## Trợ lý biết gì về app của mình

`server/src/apps-knowledge.js` là **nguồn sự thật duy nhất** về hệ sinh thái FlowTech và được ghép vào
system prompt ở tầng code (như quy tắc xưng hô và khối credit) nên vẫn còn hiệu lực dù admin đổi prompt
hệ thống trong Cài đặt:

- **Luôn ghép** khối định danh (~900 ký tự): FlowTech là công ty/hệ sinh thái; **fBuddy và MeetFlow AI là
  hai sản phẩm khác nhau**, kèm luật cấm nói MeetFlow AI là fBuddy / bản mobile của fBuddy / công ty mẹ.
- **Ghép thêm danh mục chi tiết** (5 sản phẩm đã công bố + luật chống bịa + app chưa công bố chỉ có tên)
  **chỉ khi câu hỏi chạm tới app/công ty/nền tảng/giá/tải–cài** (`appsQuestionLikely()`), để lượt làm việc
  bình thường không phải trả thêm ~1.200 token mỗi lượt. Muốn ghép đủ mọi lượt: đặt `APPS_KNOWLEDGE_ALWAYS = true`.

Sửa dữ kiện thì sửa đúng trong file đó — mỗi mục ghi rõ nguồn (meetflowai.site, App Store, code). Giá bằng
số cụ thể **không** đưa vào prompt (đổi giá là hỏng câu trả lời), trợ lý chỉ mời xem trang mua. App chưa
công bố chỉ được có tên: không mô tả tính năng, không hứa ngày ra mắt, không có link.

```bash
node --test "server/test/apps-knowledge.test.js"                       # luật ghép + dữ kiện
node ops/apps-explain-check.mjs https://fbuddy.meetflowai.site/api     # hỏi thật fBuddy 3 câu, có chấm đạt/không
```

## Đa ngôn ngữ

Ba locale `vi` (gốc) · `en` · `zh`, namespace `common|auth|shell|chat|settings|studio|voice|hub|topup` trong
`web/src/i18n/locales/`. Dùng `const { t, n, d } = useI18n();` — số qua `n()`, ngày qua `d()`, không hardcode
`vi-VN`. Ngôn ngữ lưu ở `localStorage["fbuddy.locale"]`, ép bằng `?lang=`, đổi trong menu tài khoản
(`LocaleSwitcher`) hoặc Cài đặt → Hệ thống.


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
- **Dữ liệu**: SQLite (`node:sqlite`) tại `FBUDDY_DATA_DIR`; tệp và artifact nằm ngoài webroot, tải qua
  endpoint có kiểm tra chủ sở hữu; API key provider/MCP mã hoá AES-256-GCM bằng `FBUDDY_SECRET`.

Chi tiết: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · hợp đồng API: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) ·
triển khai: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Giao diện

Theme lấy đúng palette **FlowTech Harness** (navy `#0A1F3B`, layer `#0E2747`/`#123052`/`#16385E`,
accent `#33C773`, chữ trên nền accent `#0A1F3B`). Mọi màu đi qua biến CSS trong `web/src/styles.css` — không hard-code màu ở component.

### Icon / avatar (Culi)

| Tệp | Kích thước | Dùng ở đâu |
|---|---|---|
| `web/public/brand-mark.png` | 206×206, trong suốt ngoài hình tròn | avatar trợ lý trong chat, logo sidebar, trang đăng nhập, hero, trang Cài đặt, banner hệ sinh thái, popup quảng cáo, đầu email (đăng nhập/nạp tiền/đổi credit) |
| `web/public/favicon.png` | 406×406, trong suốt ngoài hình tròn | favicon tab trình duyệt |
| `web/public/brand-logo.png` | 480×160 | **chưa dùng ở đâu** trong app (asset cũ: mark xanh + chữ đen) |
| `web/public/favicon.svg` | 64×64 | asset cũ, không còn được tham chiếu |

Ảnh gốc của Culi là hình tròn **trên nền đen đục**; đã cắt thành hình tròn nền trong suốt (script cắt:
bán kính `0.39×chiều rộng` — đúng mép vòng sáng của artwork — rồi cắt sát viền nên hình lấp đầy khung).

> ⚠️ Đổi icon phải **tăng tham số cache** trong mọi chỗ tham chiếu: hiện là `?v=culi2`
> (`web/index.html`, các component trong `web/src`, `web/public/promo.js`, và 3 template email
> trong `server/src/`). Không tăng thì trình duyệt/Cloudflare giữ ảnh cũ — đã từng dính đúng lúc
> thay icon Culi. Server đặt `Cache-Control: public, max-age=300` cho các tệp này (xem `server/src/index.js`).
