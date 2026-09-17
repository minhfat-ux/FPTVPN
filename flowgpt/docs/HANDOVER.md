# Bàn giao — FlowGpt (`flowgpt.meetflowai.site`)

Ngày: 2026-09-17 · Harness: DSH Windows · Trạng thái: **ĐANG CHẠY production**

> **Cập nhật cuối ngày (đợt 2):** OpenRouter thành mặc định · Nói chuyện bằng giọng nói (miễn phí) ·
> Kỹ năng thành dropdown top 10 + chợ kỹ năng · sửa lỗi vỡ layout lịch sử hội thoại. Chi tiết ở §9.

---

## 9. Đợt 2 — voice, chợ kỹ năng, OpenRouter

### 9.1 OpenRouter là mặc định

| | |
|---|---|
| Provider | `OpenRouter`, kind `openrouter` (dùng adapter OpenAI-compatible + header `HTTP-Referer`/`X-Title`) |
| Model mặc định | `google/gemini-2.5-flash` |
| Kiểm chứng | OpenRouter báo **444 model**; test thật **1368 ms**; streaming thật trả lời tiếng Việt |
| Dự phòng | DeepSeek vẫn bật. **Cơ chế mới:** nhà cung cấp mặc định thiếu key sẽ bị bỏ qua, lượt chat tự lùi về provider có key và sự kiện `start` kèm `notice` giải thích (UI hiện toast, Cài đặt hiện banner) |
| Cấu hình | `ops/configure-provider.mjs` (đọc key từ file → mã hoá → test thật → xoá file; **không in key**) |
| UI | Nút **“Đặt mặc định”** ở từng nhà cung cấp + banner “Mặc định … chưa có API key” |

> ⚠️ **Key OpenRouter đã được dán trong khung chat** để cấu hình. Key hiện lưu **mã hoá AES-256-GCM** trong
> `/var/lib/flowgpt/flowgpt.db` và không nằm trong repo/log. Nếu đoạn chat này được chia sẻ, nên **xoay key**
> trên openrouter.ai rồi dán lại vào Cài đặt → Nhà cung cấp AI.

### 9.2 Nói chuyện bằng giọng nói (mặc định: miễn phí)

| Nửa | Mặc định | Khi trỏ vào provider |
|---|---|---|
| STT | Web Speech API của trình duyệt (`vi-VN`) | `POST /api/voice/transcribe` → Gemini audio, hoặc OpenAI-compatible `/audio/transcriptions` (Groq `whisper-large-v3-turbo`) |
| TTS | `SpeechSynthesis` — **Edge có sẵn Hoài My / Nam Minh (vi-VN natural, miễn phí)** | `POST /api/voice/speech` → Gemini TTS (PCM → WAV) hoặc `/audio/speech` (mp3) |

Ba tính năng: **dictation** (nút micro → chữ vào ô chat), **đọc câu trả lời** (nút loa + công tắc tự đọc),
**Nói chuyện** (chế độ rảnh tay: nghe → suy nghĩ → nói → nghe tiếp, phát hiện im lặng, **barge-in**, echoCancellation).
Cấu hình ở **Cài đặt → Giọng nói** (ngôn ngữ, giọng, tốc độ, tự đọc, hoặc chọn provider).

Chi phí tham khảo (giá công bố 2026): trình duyệt **$0** · Soniox STT $0,12/giờ + TTS ~$0,70/giờ ·
Gemini Live ~$1,38/giờ · OpenAI Realtime-2 ~$6–18/giờ.

### 9.3 Kỹ năng: dropdown top 10 + chợ kỹ năng

- `skills/index.js` → `SKILL_CATALOG` (5 kỹ năng `ready` + 4 mục `coming_soon`: MCP, tài liệu, dịch, kỹ năng công ty).
- `skills/installed.js` + bảng `user_skills` → danh sách **theo từng người dùng**, giữ thứ tự, tối đa 10, tối thiểu 1.
- `GET /api/skills` trả `items` (dropdown) · `installed` · `catalog` · `maxSelectable`;
  `PUT /api/skills/installed` lưu lựa chọn (id `coming_soon` bị từ chối kèm lý do).
- UI: `chat/SkillSelect.tsx` (dropdown có icon + mô tả) và `chat/SkillPicker.tsx` (chợ kỹ năng: tìm kiếm, chọn/bỏ, đếm n/10).
- Chat nhận **mọi id trong danh mục** → thêm kỹ năng mới không cần sửa server.

### 9.4 Đã sửa trong đợt 2

| Bug | Bằng chứng |
|---|---|
| Vỡ layout lịch sử hội thoại khi tiêu đề dài (span inline không cắt được ellipsis) | `ops/ui-layout-check.mjs`: 0 px tràn ngang ở mọi container; tiêu đề 198 ký tự cắt đúng |
| Upload sai tên field trả 500 | nay trả **400** kèm hướng dẫn (đã thử thật) |
| Lỗi export `getAudioContextCtor` làm subagent voice fail | tsc sạch (`exit 0`) |

### 9.5 Kiểm chứng đợt 2

| Việc | Kết quả |
|---|---|
| Test tự động | **93/93 pass** (thêm bộ `skills.test.js`, `openrouter.test.js`, `voice.test.js`) |
| Dropdown + chợ kỹ năng (trình duyệt thật) | menu 6 mục, chọn “Làm PPT” đổi nhãn, modal 9 thẻ (5 chọn/4 sắp có), **bỏ 1 kỹ năng → server còn 4**, modal đóng, 0 exception |
| Voice mode (Chrome micro giả) | `/api/voice/config` = browser/browser; nút micro + “Nói chuyện” có; overlay mở, orb hiện, trạng thái **“Đang nghe…”**, Escape đóng; tab **Giọng nói** có 4 radio/1 slider/1 switch/1 select + nhắc phương án miễn phí |
| Regression | layout 0 tràn; chat tạo **PPTX 64,9 KB** tải được (DeepSeek); production render login bình thường, 0 lỗi console |
| Production | asset khớp đúng bản build local; `providerCount=2`; lượt chat dùng **OpenRouter / google/gemini-2.5-flash** |

### 9.6 Thay đổi KHÔNG do em (cần anh xác nhận)

Một agent khác đã thêm **popup quảng cáo ứng dụng** (`web/public/promo.js`, `promo.css`) và sửa `web/index.html`
(lúc 15:48) để nạp chúng. Hiện `/promo.js` tải được trên production nhưng **dist đang phát không tham chiếu** nên
popup **chưa hiện** với người dùng — lần build+deploy tới nó sẽ bật lên. Em **không xoá** vì có thể là yêu cầu của anh
từ luồng khác; nếu không cần, nói em một câu là em gỡ.

## 10. Việc còn lại / điểm chưa chắc (đợt 2)

1. **Image Studio** vẫn chưa thao tác bằng ảnh thật (chỉ kiểm chứng cấu trúc + render).
2. **MCP server `stdio`** chưa test được từ sandbox Windows (chặn spawn tiến trình con); `http`/`sse` thì được.
3. **Voice cần micro thật + HTTPS** trên thiết bị của anh; em mới test bằng micro giả của Chrome. Nếu anh dùng
   **Chrome trên Windows**, cần cài gói giọng nói tiếng Việt của Windows, hoặc dùng **Edge** (có sẵn Hoài My/Nam Minh).
4. Chưa có **SSO Firebase/Facebook** (đã chừa chỗ) và chưa có **đăng ký email + mật khẩu** (theo yêu cầu).
5. Bundle web 1,16 MB (334 KB gzip) — có thể tách chunk sau.

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
