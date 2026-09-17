# Bàn giao — FlowGpt (`flowgpt.meetflowai.site`)

Ngày: 2026-09-17 · Harness: DSH Windows · Trạng thái: **ĐANG CHẠY production**

---

## 1. Tóm tắt

Đã dựng và triển khai **FlowGpt** — web AI chatbox tiếng Việt (kiểu ChatGPT/ChatFPT) tại
**https://flowgpt.meetflowai.site**, chạy trên **node-2** (`165.101.114.162`) sau Caddy, dưới systemd unit `flowgpt`
(port nội bộ 7790), dữ liệu ở `/var/lib/flowgpt`.

Có: chat streaming + tool-calling; 4 skill chạy thật (sửa ảnh, PPT, Excel, phân tích dữ liệu); cấu hình
**nhà cung cấp AI** + **MCP server** từ backend; đăng nhập passwordless bằng mã gửi email; theme + logo FlowTech.
Mặc định hiện tại: **DeepSeek `deepseek-chat`** (key của chủ dự án, lưu mã hoá AES-256-GCM).

## 2. Bằng chứng đã chạy (không phải "đã sửa xong")

| Việc | Lệnh | Kết quả thật |
|---|---|---|
| Bộ test tự động | `node --test "server/test/*.test.js"` | **64 pass / 0 fail** — gồm ca tạo `.pptx`/`.xlsx` byte thật (magic `PK`), MCP CRUD, phân quyền, rate limit, login bằng mã |
| Smoke qua domain công khai | `node ops/smoke.mjs https://flowgpt.meetflowai.site/api` | **ĐẠT HẾT 7 bước** (login → provider → chat → tool → tải pptx 55.392 byte `PK`) |
| Smoke với model thật | `node ops/smoke.mjs http://127.0.0.1:7790/api` (DeepSeek) | 195 sự kiện SSE; DeepSeek tự gọi `generate_pptx`; tệp **58.074 byte**, tải về hợp lệ |
| DeepSeek trên production | `ops/configure-deepseek.mjs` | Test 834ms + streaming thật trả lời tiếng Việt; key đã lưu mã hoá, file key tạm đã xoá |
| UI trong trình duyệt (CDP) | `node ops/ui-check.mjs` / `ui-login-check.mjs` / `ui-chat-check.mjs` | Login bằng mã OK; chat render tool card + **thẻ tải tệp 54.1 KB**; Studio 4 tab + canvas; Settings 4 tab + modal provider; **0 exception, 0 console error** |
| Gửi mail thật | `POST /api/auth/request-token` cho `minhnb2@fpt.com` | `delivered: true`; Resend báo `delivered`; audit có `auth.login_token` → **chủ dự án đã đăng nhập được** |
| Không phá site cũ | kiểm tra 7 hostname | `api.meetflowai.site/health` 200; các hostname khác giữ nguyên hành vi (xem §6) |

## 3. File đã tạo / sửa

| Nhóm | Đường dẫn | Nội dung |
|---|---|---|
| Server | `server/src/*.js` | `index.js` (Express bootstrap), `config.js`, `db.js` (node:sqlite), `crypto.js`, `auth.js`, `settings.js`, `mailer.js`, `mcp.js`, `agent.js`, `chat-store.js`, `files.js`, `routes.js`, `util.js` |
| Provider | `server/src/providers/*` | `openai.js` (OpenAI-compatible), `anthropic.js`, `gemini.js`, `mock.js`, `images.js`, `sse.js`, `index.js` |
| Skill | `server/src/skills/*` | `pptx.js` (pptxgenjs), `xlsx.js` (exceljs), `data.js` (parser + thống kê + chart spec), `image.js`, `index.js` |
| Test | `server/test/*.test.js` | 5 file, 64 ca (crypto, util, data, settings, e2e, auth-token) |
| Web | `web/src/**` | `App.tsx`, `main.tsx`, `styles.css` (palette FlowTech), `types.ts`, `api/client.ts`, `state/{store,chat}.tsx`, `auth/LoginPage.tsx`, `components/{ui,Sidebar,Chart}.tsx`, `chat/**`, `settings/**`, `studio/**` |
| Deploy | `deploy/*` | `flowgpt.service`, `flowgpt.env.example`, `remote-setup.sh`, `deploy.ps1`, `dns-cloudflare.sh` |
| Vận hành | `ops/*` | `probe-node2.sh`, `probe-keys.sh`, `check-deploy.sh`, `finish-deploy.sh`, `fix-deps.sh`, `reinstall-deps.sh`, `reset-data.sh`, `enable-mailer.sh`, `diagnose-login.sh`, `check-owner-account.sh`, `check-dns-records.sh`, `caddy-issue-cert.sh`, `smoke.mjs`, `configure-deepseek.mjs`, `ui-check.mjs`, `ui-login-check.mjs`, `ui-chat-check.mjs`, `ui-settings-shot.mjs`, `report-telegram.sh` |
| Tài liệu | `README.md`, `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, `docs/HANDOVER.md` | Hợp đồng API là nguồn sự thật cho FE/BE |

## 4. Bug thật đã tìm ra và sửa (đều có test/kiểm chứng)

| # | Bug | Cách phát hiện | Sửa |
|---|---|---|---|
| 1 | `insert()` không điền `created_at/updated_at` → mọi INSERT lỗi NOT NULL | test `settings.test.js` | `db.js` tự điền timestamp |
| 2 | `app_settings` đọc sai cột (`value_json` đã được decode thành `value`) → mọi setting trả `null` | test | `getAppSettings()` dùng `row.value` |
| 3 | Provider `mock` gọi tool lặp 6 lần (tới trần vòng lặp) | test e2e | mock chỉ gọi tool 1 lần/lượt |
| 4 | **Chat mất câu trả lời** khi provider trả lời nhanh: `onClose` đọc state qua ref chưa commit | kiểm tra UI bằng trình duyệt (CDP) | `web/src/state/chat.tsx` dùng reducer thuần + biến tích luỹ cục bộ |
| 5 | **Login bằng mã bị 401**: auto-submit đọc `code` từ closure cũ (thiếu 1 ký tự) | chính chủ dự án báo + log server (`attempts=2`, `status:401`) | `LoginPage` truyền mã tường minh, không xoá ô khi sai |
| 6 | **Skill "Trò chuyện" không được cấp tool** → "làm slide" trả "công cụ không khả dụng" | CDP chat check + đọc DB | `skills/index.js` luôn cấp đủ tool; skill chỉ *gợi hướng*; tên tool sai có thông báo rõ |
| 7 | Thẻ tệp bị lặp 2 lần trong chat | CDP (đếm `.artifact-card`) | `MessageList` lọc artifact đã hiển thị |
| 8 | Magic link không đổi tài khoản khi đang có phiên khác | CDP settings check | xử lý link ở `App.tsx` (không chỉ ở trang login) |
| 9 | Deploy script chết giữa chừng: PowerShell 5.1 coi stderr của ssh/npm là lỗi, và tự thêm `\r` khi pipe sang ssh | chạy deploy | `$ErrorActionPreference=Continue` + gửi script qua base64 một dòng |

## 5. Cấu hình production hiện tại

| Thành phần | Giá trị |
|---|---|
| Service | `flowgpt.service` (systemd, `MemoryMax=600M`, `ProtectSystem=full`, chỉ ghi `/var/lib/flowgpt`) |
| Cổng | `127.0.0.1:7790` → Caddy block `flowgpt.meetflowai.site` (cert Let's Encrypt đã cấp, hết hạn tự gia hạn) |
| DNS | Cloudflare `A flowgpt → 165.101.114.162` (Proxied) |
| Secret | `/etc/flowgpt/flowgpt.env` (600) — `FLOWGPT_SECRET` sinh tự động, **đổi là mất mọi API key đã lưu** |
| Email | Dùng **Resend**, key lấy từ drop-in sẵn có của `flowvpn-cp` (không in ra), gửi từ `no-reply@meetflowai.site` |
| LLM mặc định | **DeepSeek** `deepseek-chat` (key chủ dự án, mã hoá trong DB; provider demo đã tắt) |
| Tài khoản | `minhnb2@fpt.com` = **admin** (email đăng nhập đầu tiên); `minhnb2@me.com` = user |

## 6. Việc còn lại / điểm chưa chắc

1. **SSO Firebase + Facebook**: `meta.authMethods.sso` đã có (đang `false`), nút trong trang login ghi "Sắp bổ sung".
   Cần thêm endpoint đổi token Firebase/Facebook lấy JWT nội bộ; phần còn lại của app không phải sửa.
2. **Image Studio** đã kiểm chứng cấu trúc (canvas + dropzone + công cụ render, 0 lỗi) nhưng **chưa** kiểm chứng
   bằng ảnh thật chạy qua từng công cụ vẽ/cắt/filter. Nên thử tay một lần.
3. **MCP server kiểu `stdio`** chưa test được từ sandbox Windows (chặn spawn tiến trình con); `http`/`sse` test được.
   Trên VPS thì cả ba chạy bình thường — nên thử một MCP http/sse thật rồi bấm "Kiểm tra".
4. **Bundle web 1.1 MB (317 KB gzip)**: chưa tách chunk (recharts + highlight.js chiếm phần lớn). Tối ưu sau.
5. **Smoke test tạo tài khoản test** trên instance nó chạy vào. Nếu chạy trên production mới cài thì tài khoản đó
   thành admin — dùng `ops/reset-data.sh` để dọn (đã dọn 2 lần trong quá trình này).
6. **Vấn đề có sẵn của hạ tầng, KHÔNG do FlowGpt**:
   - `dhs.meetflowai.site` và `dhs-win.meetflowai.site` **không có bản ghi DNS** trong zone `meetflowai.site`
     (Caddy vẫn cấu hình 2 host này nên log ACME báo NXDOMAIN liên tục).
   - `meetflowai.site/` trả 404 vì `/var/www/flowvpn` **không có `index.html`** (site chỉ có `/buy`, `/open`,
     `/privacy`, `/support`…).
   - `meetflowai.io.vn` / `www.meetflowai.io.vn`: nameserver trả SERVFAIL (zone khác, ngoài zone này).
7. **Rate limit theo email**: 3 mã/15 phút, 5 lần nhập sai là khoá mã. Nếu anh thao tác nhanh sẽ gặp 429 —
   đây là thiết kế, không phải lỗi.
