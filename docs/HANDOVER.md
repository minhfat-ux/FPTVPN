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

## 11. Đợt 3 — credit, nạp token, chợ kỹ năng, đa ngôn ngữ

### 11.1 Credit được cấp và trừ như thế nào

```
credit bị trừ mỗi lượt = max(1, ceil((token_vào + token_ra) × creditsPerToken))     // mặc định creditsPerToken = 1
```

- **1 credit = 1 token**, tính theo tổng token vào + ra (giống cách ChatGPT tính usage), làm tròn lên, thấp nhất 1.
- Tài khoản mới: **10.000 credit** ngay lần đăng nhập đầu (`signupCredits`), không cần làm gì.
- Sổ cái `credit_ledger` là append-only, mỗi bút toán lưu `balance_after` ⇒ mọi thay đổi số dư đều giải thích được
  (`signup`, `admin_grant`, `chat_usage`, `request_approved`, `topup_paid`, `skill_purchase`).
- Hết credit ⇒ cổng chặn trả **402** kèm link nạp; **admin không bị chặn nhưng vẫn bị trừ credit**.

**Vì sao một lượt chat tốn ~1.800 credit** — đo thật trên production (GLM-4-Flash, cùng câu “chào em”):

| Gửi gì | `prompt_tokens` |
|---|---|
| system prompt + **toàn bộ schema 6 công cụ** | **1.707** |
| chỉ system prompt | 114 |
| chỉ câu của người dùng | 8 |

⇒ **~93% chi phí một lượt chat là schema công cụ**, vì mỗi request phải gửi lại toàn bộ định nghĩa tool
(`generate_pptx`, `generate_xlsx`, `analyze_data`, `edit_image`, `open_image_studio`, `list_files`).
Ba lượt chat liên tiếp của anh hôm nay: `1.906 + 1.831 + 1.773 = 5.510` credit — khớp đúng công thức.
Cộng thêm lịch sử hội thoại (tối đa 24 message) nên hội thoại càng dài càng tốn.

Đòn giảm chi phí (chưa làm, chờ anh quyết):

| Cách | Tiết kiệm | Đánh đổi |
|---|---|---|
| Hạ `creditsPerToken` (vd 0,2 ⇒ 1 credit = 5 token) | ~5× số lượt/10.000 credit | giá trị credit thay đổi, phải sửa giá skill trong chợ |
| Tăng `signupCredits` (vd 50.000) | 5× số lượt cho user mới | tặng nhiều hơn |
| Gửi tool theo kiểu “lazy” (chỉ 1 tool `request_tools` ở lượt đầu, model xin thì mới nạp schema) | **~80%** ở lượt chat thường | lượt cần tạo tệp tốn thêm 1 vòng gọi (~1s); rủi ro model quên xin tool |
| Chỉ gửi schema của công cụ thuộc kỹ năng đang chọn | ~60% khi chọn kỹ năng cụ thể | đã từng gây lỗi “công cụ không khả dụng” ở chế độ Trò chuyện nên phải giữ đủ tool cho `auto`/`chat` |
| Giảm `historyLimit` 24 → 12 | ~40% ở hội thoại dài | model nhớ ít ngữ cảnh hơn |

### 11.2 Trợ lý đã biết giải thích credit

Lỗi cũ: system prompt **không hề nhắc tới credit** nên khi được hỏi, trợ lý trả lời kiểu “FlowGpt miễn phí”.
Nay `buildCreditKnowledge(user)` (`server/src/agent.js`) chèn vào **mỗi lượt** một khối gồm: công thức trừ credit,
mức tặng khi đăng nhập, **số dư / đã dùng / trung bình mỗi lượt / số lượt còn lại của chính user đó**, và
hướng dẫn 2 đường nạp kèm đúng nhãn nút trên UI (“Xin thêm token” trong menu tài khoản → gửi yêu cầu chờ duyệt;
“Mua thêm token” → trang nạp credit; thêm kỹ năng ở “Chợ kỹ năng”). Có test riêng cho khối này.
Một câu trong chỉ dẫn kỹ năng Sửa ảnh cũng đã sửa: “Image Studio (miễn phí)” → “(thao tác ở đó không tốn credit)”.

### 11.3 Nạp credit, xin thêm token, chợ kỹ năng

- **Xin thêm token**: menu tài khoản → “Xin thêm token” → gửi yêu cầu → Telegram của anh có 2 nút duyệt (link ký HMAC,
  idempotent). Mỗi user chỉ có 1 yêu cầu `pending`.
- **Nạp credit**: trang riêng `?view=topup` — gói VND (mặc định 3 gói), tạo đơn có mã `FLOWGPT######`, ảnh VietQR,
  user bấm “đã chuyển khoản” → anh xác nhận bằng link ký (30 ngày) → credit vào tài khoản 1 lần duy nhất.
  ⚠️ **Cần anh cấp `bankAccount` + `bankAccountName`** thì ảnh VietQR mới hiện.
- **Chợ kỹ năng**: mua prompt-pack bằng credit (6 skill thật + 1 coming soon), mua xong tự cài vào dropdown
  (tối đa 10 kỹ năng); admin CRUD trong Cài đặt → “Chợ kỹ năng”.
  - Giá đã chỉnh lại theo **20đ/credit**: 1.500–3.500 token (30.000–70.000đ)/kỹ năng. Bảng admin và form Sửa
    hiện luôn quy đổi VND, tự tính theo ô `vndPerCredit` trong Cài đặt → Hệ thống.
  - `GET /api/admin/hub` trả kèm `instructions`/`tools` ⇒ form Sửa **nạp sẵn** prompt pack (trước đây trống,
    không sửa được chỉ dẫn vì tưởng là rỗng). API công khai vẫn không lộ 2 trường này.
  - `installs` là dữ liệu suy ra: `ops/hub-catalog-fix.mjs` tính lại từ `hub_purchases` (đã dọn 7 lượt ảo
    do test trên production, thực tế 0 lượt mua).
  - `ops/import-hub-skills.mjs` nhập hàng loạt từ thư mục `SKILL.md` (Claude/CodeBuddy) hoặc JSON,
    tự map tool (`excel` → `generate_xlsx`, `ppt` → `generate_pptx`), mặc định chạy thử, `--apply` mới ghi.
- **Đa ngôn ngữ**: hạ tầng i18n 3 thứ tiếng (vi/en/zh) cho cả shell; bản dịch đầy đủ đang được phủ dần theo từng khu vực.

### 11.4 Bug thật đã sửa trong đợt này

| Bug | Nguyên nhân | Sửa |
|---|---|---|
| `analyze_data` op `filter` **luôn lỗi** | `applyFilter` đọc `operation.op` — nhưng `op` đã là tên thao tác (`"filter"`) nên rơi vào `default` ⇒ “Toán tử lọc không hỗ trợ: filter”; schema còn khai báo sai `op_filter` và thiếu `value`/`n`/`limit`/`desc`/`labelColumn` | Tách toán tử so sánh sang `op_filter`, khai báo đủ tham số trong schema, thêm test hồi quy (lọc 5 dòng CSV còn 2 + toán tử sai phải báo lỗi) |
| Credit bị tính bằng `creditSettings().perKToken` (không tồn tại) | gõ nhầm tên khoá, may là `undefined` rơi vào giá trị mặc định nên không sai số | đổi thành `creditsPerToken` |
| Test `meta.credits.buyUrl` fail | đổi mặc định sang trang nạp nội bộ `?view=topup` nhưng test còn so với URL cũ | so với chính `app_settings.creditBuyUrl` + khớp `?view=topup` |

### 11.5 Script kiểm chứng mới (đều là kiểm chứng thật, không phải "đã viết xong")

| Script | Việc |
|---|---|
| `ops/credit-explain-check.mjs` | Tạo tài khoản mới rồi **hỏi chính FlowGpt** về credit; assert câu trả lời có công thức, mức tặng, cách xin/mua; so số dư với `token vào + ra`. Chạy: `node ops/credit-explain-check.mjs` |
| `ops/ui-i18n-check.mjs` | Mở trình duyệt thật (CDP 9224), đăng nhập tài khoản tạm, đổi VI→EN→ZH, chụp ảnh từng ngôn ngữ, kiểm tra `html lang`, copy có đổi thật không và menu tài khoản có `LocaleSwitcher` |
| `ops/ui-hub-check.mjs` | Chợ kỹ năng trên Chrome thật: bảng admin có quy đổi VND, **form Sửa nạp sẵn đúng chỉ dẫn từ server**, giá khớp API, trang chợ phía người dùng hiện giá mới. Chạy: `node ops/ui-hub-check.mjs https://flowgpt.meetflowai.site ops/ui-out-hub 9224 <adminToken>` |
| `ops/prune-test-users.mjs` | Dọn tài khoản tạm (`credit-explain+%`, `i18n-ui+%`) **và** mọi dòng chúng sở hữu; mặc định chỉ xem trước, thêm `--apply` mới xoá |
| `ops/report-telegram-credit.sh` | Báo cáo Telegram đợt credit (đã gửi, message_id 201) |

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

---

## 12. Đợt 4 — chợ kỹ năng & mô hình giá mới (VND)

### 12.1 Chợ kỹ năng: admin sửa được prompt pack

`GET /api/admin/hub` trước đây dùng chung hàm với API công khai nên **không trả `instructions`/`tools`** ⇒ mở form
"Sửa" thì ô chỉ dẫn luôn trắng và bấm Lưu không sửa được gì. Đã tách cờ `withContent` chỉ bật cho route admin; API
công khai vẫn không lộ 2 trường này. Form Sửa giờ gửi **đúng phần thay đổi** (kể cả xoá trắng để bỏ chỉ dẫn cũ).

### 12.2 Giá kỹ năng tính bằng VND, TÁCH RỜI giá credit

Trước: `hub_skills.price` là **credit**, nên đổi giá credit là đổi luôn giá cả chợ. Nay:

| | |
|---|---|
| Nguồn sự thật | `hub_skills.price_vnd` (VND), cột `price` chỉ còn là cache credit |
| Giá đang bán | **50.000đ cho mỗi kỹ năng** (6 kỹ năng), `brand-voice` miễn phí |
| Quy đổi | `credits = max(1, ceil(priceVnd / vndPerCredit))` — `creditsForPriceVnd()` trong `server/src/skills/hub.js` |
| Migration | `ADDED_COLUMNS` + `backfillHubPriceVnd()`: quy đổi giá credit cũ sang VND **đúng một lần** theo giá credit lúc migrate. Chạy lại mỗi lần khởi động sẽ làm giá đã sửa tay "sống dậy" nên có test riêng canh (`hub-migration.test.js`) |
| Sổ cái | Bút toán `skill_purchase` ghi rõ giá VND: `Mua kỹ năng Viết content bán hàng (50.000đ)` |

### 12.3 Đơn giá credit: một lượt chat ≈ 200đ

Đo thật 48 lượt trên production: **median 3.345 token, trung bình 3.483 token** một lượt (không phải 2.000 như phỏng
đoán ban đầu — schema công cụ + system prompt + lịch sử chiếm phần lớn). Từ đó chốt:

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| `creditsPerToken` | **0,06** | **thập phân** — làm tròn thành `intOr` sẽ về 0 và mọi lượt chat miễn phí |
| `vndPerCredit` | **1** | 1 credit = 1đ, số tiền hiện trên chợ trùng số credit |
| Một lượt chat | ≈ 210 credit ≈ **210đ** | có test canh trong `credits.test.js` |
| Tặng đăng nhập | 10.000 credit = 10.000đ | ≈ 47 lượt |
| Gói nạp | 10k / 50k / 200k credit = 10k / 50k / 200k đ | giá suy ra từ `vndPerCredit`, không cần sửa |

`averageCostPerTurn` giờ trả về **một lượt điển hình** (`TYPICAL_TURN_TOKENS = 3.500`) khi user chưa chat lần nào,
thay vì "1 credit" — trước đây tài khoản mới thấy "còn 10.000 lượt" trong khi thực tế chỉ ~47.

> ⚠️ **Hệ quả cần biết:** tài khoản mới được tặng 10.000đ, mà một kỹ năng giá 50.000đ ⇒ user phải nạp thêm mới mua
> được kỹ năng. Đây là hệ quả của việc tách giá, không phải lỗi.

### 12.4 Script & kiểm chứng mới

| Script | Việc |
|---|---|
| `ops/import-hub-skills.mjs` | Nhập hàng loạt từ thư mục `SKILL.md` (Claude/CodeBuddy) hoặc JSON; tự map tool (`excel`→`generate_xlsx`, `ppt`→`generate_pptx`); mặc định chạy thử, `--apply` mới ghi, `--price-vnd 50000` |
| `ops/hub-catalog-fix.mjs` | Sửa giá VND + tính lại `installs` từ `hub_purchases` thật (đã dọn 7 lượt ảo do test trên production) |
| `ops/turn-cost-report.mjs` | Đo token/lượt thật từ sổ credit và thử các hệ số giá để chọn `creditsPerToken` |
| `ops/ui-hub-check.mjs` | Chrome thật: bảng admin + form Sửa nạp sẵn prompt pack + trang chợ |
| `server/test/hub-migration.test.js` | Dựng DB **định dạng cũ** rồi migrate: giá đúng, miễn phí vẫn miễn phí, và backfill không chạy lại |
