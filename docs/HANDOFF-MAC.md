# Bàn giao sang Mac Harness — fBuddy (chợ kỹ năng + mô hình giá VND)

Ngày: 2026-09-17 · Nguồn: DSH Windows (`C:\Users\Minhn\FlowTech AI\fbuddy`) · Trạng thái: **production đang chạy bản mới**

> Đọc file này là làm tiếp được, **không cần** mang transcript của session cũ.
> Transcript nằm ở `~/.dsh/sessions/--C-Users-Minhn-FlowTech~0020AI--/` và tham chiếu đường dẫn
> Windows tuyệt đối nên không port sang Mac sạch được — bỏ qua nó.

---

## 1. Lấy code về

Repo: `fbuddy` (monorepo) — remote GitHub `https://github.com/minhfat-ux/FPTVPN.git`, nhánh theo dõi `origin/flowgpt`.

```bash
git clone https://github.com/minhfat-ux/FPTVPN.git fbuddy
cd fbuddy && git checkout flowgpt
```

- Nhánh làm việc ở Windows tên là `master`, push lên `origin/flowgpt`.
- **Tên nhánh cố ý giữ nguyên `flowgpt`** dù sản phẩm đã đổi tên thành fBuddy (xem
  `docs/RENAME-FBUDDY.md`): đổi tên nhánh remote cần push và phối hợp cả hai máy.
- Toàn bộ việc chợ kỹ năng + mô hình giá đã push. Kiểm tra: `git log --oneline -8`.

Cấu trúc: `server/` (Node 24 ESM, Express 5, `node:sqlite`), `web/` (React 18 + Vite + TS), `deploy/`, `docs/`, `ops/`.

## 2. Môi trường & lệnh

| Việc | Lệnh |
|---|---|
| Test | `node --test "server/test/*.test.js"` (hiện **168/168 pass**) |
| Build web | `npm --workspace web run build` (chạy `tsc --noEmit` trước Vite) |
| Deploy | `pwsh -File deploy/deploy.ps1` (cần `ssh root@165.101.114.162` đã có key) |
| Log production | `ssh root@165.101.114.162 'journalctl -u fbuddy -f'` |

Production: node-2 `165.101.114.162` · systemd `fbuddy` · `127.0.0.1:7790` · Caddy `fbuddy.meetflowai.site` ·
data `/var/lib/fbuddy` · env `/etc/fbuddy/fbuddy.env` (600).

**Không có phụ thuộc mới** (không thêm package nào). Ưu tiên giải pháp miễn phí, màu qua `var(--…)`.

## 3. Đã làm trong đợt này (đã deploy + kiểm chứng)

### 3.1 Chợ kỹ năng — admin sửa được prompt pack

`GET /api/admin/hub` trước đây dùng chung hàm với API công khai nên không trả `instructions`/`tools`, khiến form
"Sửa" luôn trắng. Đã tách cờ `withContent` chỉ bật cho route admin; API công khai vẫn không lộ.

### 3.2 Giá kỹ năng = VND, tách rời giá credit

- Nguồn sự thật: `hub_skills.price_vnd`. Cột `price` (credit) chỉ còn là cache, **đọc thì luôn suy ra** từ `price_vnd`.
- `creditsForPriceVnd(priceVnd, vndPerCredit) = max(1, ceil(priceVnd / vndPerCredit))` trong `server/src/skills/hub.js`.
- **Cả 6 kỹ năng = 50.000đ**, `brand-voice` 0đ (coming_soon).
- Migration `backfillHubPriceVnd()` chạy **đúng một lần** khi thêm cột; có test dựng DB định dạng cũ
  (`server/test/hub-migration.test.js`). Chạy lại mỗi lần khởi động sẽ làm giá sửa tay "sống dậy" — đừng đổi.

### 3.3 Đơn giá credit — 1 lượt chat ≈ 200đ

Đo trên production bằng `messages.usage_json` (60 lượt): median 3.160 token, **trung bình 3.258 token**.

| Thông số | Giá trị |
|---|---|
| `creditsPerToken` | **0,06** (thập phân!) |
| `vndPerCredit` | **1** |
| Một lượt chat | 162–196đ (min 33đ, p90 331đ, max 403đ) |
| Tặng đăng nhập | 10.000 credit = 10.000đ ≈ 51 lượt |
| Gói nạp | 10k / 50k / 200k credit = 10k / 50k / 200k đ |

> ⚠️ Ô `creditsPerToken` trên control panel phải dùng `decimalOr` (không phải `intOr`) — `intOr` làm tròn 0,06 → 0
> là **mọi lượt chat miễn phí**. Đã sửa trong `web/src/settings/CreditPricingCard.tsx`, có ghi chú trong docs.

> ⚠️ **Hệ quả nghiệp vụ:** tài khoản mới tặng 10.000đ, một kỹ năng giá 50.000đ ⇒ user phải nạp thêm mới mua được
> kỹ năng. Đây là hệ quả của việc tách giá, không phải lỗi.

## 4. Kiểm chứng đã chạy (đều là thật, không phải "đã viết xong")

| Việc | Kết quả |
|---|---|
| `node --test "server/test/*.test.js"` | **168/168 pass** |
| `npm --workspace web run build` | sạch (`tsc --noEmit` + vite) |
| Migration trên production | log: `đã thêm cột hub_skills.price_vnd` + `quy đổi giá 6 kỹ năng sang VND (20đ/credit)` |
| `ops/hub-catalog-fix.mjs --apply` | 5 kỹ năng về 50.000đ, `installs` tính lại từ `hub_purchases` = 0 (dọn 7 lượt ảo do test) |
| Một lượt chat thật trên production | `usage {in: 2682, out: 12}` → **162 credit**, số dư 100.000 → 99.838 (đúng `ceil(2694×0,06)`) |
| `ops/turn-cost-report.mjs` | 60 lượt: median 190đ · trung bình **196đ** ✔ mục tiêu ~200đ |
| `ops/ui-hub-check.mjs` (Chrome thật) | **ĐẠT HẾT** — bảng admin 50.000đ, form Sửa nạp sẵn 343 ký tự chỉ dẫn, thẻ người dùng 50.000đ, không còn chữ "token" ở giá |

## 5. Việc còn lại (chưa làm)

1. **Nhập kỹ năng từ CodeBuddy** — cần danh sách/link từ chủ dự án. Công cụ đã sẵn:
   `node ops/import-hub-skills.mjs <thư-mục-hoặc-json> --price-vnd 50000 --apply`
   (tự nhận `SKILL.md` + frontmatter, tự map tool `excel`→`generate_xlsx`, `ppt`→`generate_pptx`; mặc định chạy thử).
2. **Voice chống trễ** — chủ dự án đã dặn "đừng làm vội", chưa bắt đầu:
   - L1: TTS theo từng câu + prompt ngắn cho voice + không gửi tool schema trong lượt voice
     (`web/src/voice/useVoiceConversation.ts` — `settlePending` đang đợi hết lượt rồi mới đọc, đó là gốc độ trễ).
   - L2: LLM nhanh (**cần key Groq free**).
   - L3: speech-to-speech realtime (Qwen3-Omni Realtime / DashScope-Bailian — **cần key**; XiaoIce đã loại vì
     không có API công khai).
3. **SePay** — module `server/src/sepay.js` đã xong + test, nhưng **chưa cắm route** (`POST /api/topup/sepay` cần raw
   body, `GET /api/admin/sepay/status`, `POST /api/admin/sepay/poll`), chưa start poller trong `index.js`, chưa có UI.
   Chọn **cách 2** (poll API SePay, không đổi webhook). **Cần API token thật của SePay** (tạo ở My SePay → API Access);
   `SEPAY_API_KEY` trong `flowvpn-cp` là *webhook secret* (`spsk_…`) nên gọi API bị 401.
4. **Tên chủ tài khoản ngân hàng** — `bankAccountName` đang trống nên QR in "TPBANK"; cần tên thật.
5. Đang treo: SSO Firebase/Facebook · đăng ký email+mật khẩu · tạo ảnh bằng key trả phí · MCP `stdio` không test được
   từ sandbox Windows · siết 9 viền gradient ở trang admin `/ai/buy`.

## 6. Bẫy đã gặp, đừng vấp lại

- **`node --test` chạy mỗi file trong một tiến trình riêng** ⇒ test nào `patchAppSettings({vndPerCredit})` thì không
  ảnh hưởng file khác. Nhưng trong cùng file thì có — nhớ trả lại giá trị cũ.
- **`getAppSettings()` = `{...DEFAULT, ...stored}`** ⇒ đổi `DEFAULT_APP_SETTINGS` **không** đổi giá trị đã lưu trên
  production. Muốn đổi thật phải `PUT /api/settings/app` (đã làm cho `vndPerCredit`).
- **`credit_ledger.delta` đã bị nhân với `creditsPerToken` lúc ghi** ⇒ đừng quy ngược ra token sau khi đổi hệ số;
  dùng `messages.usage_json`.
- **Telegram**: PowerShell 5.1 `Get-Content -Raw` đọc UTF-8 thành ANSI làm hỏng tiếng Việt. Dùng
  `ops/send-telegram.ps1 -MessageFile ops/messages/<file>.txt` (đọc UTF-8 tường minh, gửi base64, so khớp lại với
  bản Telegram nhận được). Script nào gọi `process.exit()` ngay sau `fetch` sẽ crash libuv trên Windows
  (`0xC0000409`) — dùng `process.exitCode`.
- **Token admin** để chạy script kiểm chứng: mint bằng script server (`auth.issueToken` cho `minhnb2@fpt.com`),
  lưu ở `%TEMP%\admin-token.txt` (Windows) — **không in ra**. Trên Mac truyền qua `FBUDDY_ADMIN_TOKEN`.
- Tài khoản production: `minhnb2@fpt.com` (admin, 100000 credit), `minhnb2@me.com`, `tranhoangnam081215@gmail.com`,
  `minhfat@gmail.com`.
- Model mặc định: GLM `glm-4-flash` (không nhận ảnh — có `applyVisionFallback` tự OCR bằng OpenRouter
  `google/gemini-2.5-flash`). Tên model bị ẩn với người dùng, hiện là `fBuddy-*`.

---

## 7. Đợt 5 — Mac harness tiếp nhận (2026-09-18)

### 7.1 Đã làm: SePay cắm route + poller (mục 5.3 của bàn giao)

- `POST /api/topup/sepay` — webhook, xác thực HMAC **hoặc** `Apikey`; `express.raw` gắn riêng cho path này trong
  `index.js` vì chữ ký tính trên **nguyên văn** thân request. Đã xác thực thì luôn 200 (kể cả không khớp đơn nào).
- `GET /api/admin/sepay/status`, `POST /api/admin/sepay/poll` (admin).
- Poller trong `index.js`: đọc lại cài đặt mỗi vòng ⇒ bật/tắt trong Cài đặt có hiệu lực ngay, không cần restart.
- Kiểm chứng: `node --test "server/test/*.test.js"` → **177/177 pass** (thêm `server/test/sepay-routes.test.js`, 9 ca);
  `npm --workspace web run build` sạch; `ops/sepay-e2e-check.mjs` chạy **trên production** → ĐẠT HẾT (webhook đã ký qua
  HTTPS công khai đi qua Caddy, credit vào đúng, gửi lại không cộng thêm, không ký bị 401, dọn sạch tài khoản tạm).
- **Còn lại của SePay:** cần **API token thật** (My SePay → API Access) hoặc **webhook secret** của chủ dự án mới bật
  được thật; chưa có UI trong control panel (hiện đặt qua `PUT /api/settings/app`).

### 7.2 Việc Mac hay vấp (dùng cho harness sau)

- **SSH**: key mặc định của Mac bị từ chối. Dùng `ssh -i ~/.ssh/fpt_vpn_node root@165.101.114.162`
  (key `fpt_tunnel` cũng vào được). `deploy/deploy.ps1` chỉ chạy trên Windows.
- **`npm install` trên Mac**: cache `~/.npm` có file của root ⇒ `EPERM`. Thêm `--cache .npm-cache` (đã có trong
  `--exclude` của deploy). Cài lần đầu hỏng giữa chừng thì phải `rm -rf node_modules` rồi cài lại, npm không tự sửa.
- **Ổ đĩa BIWIN (exFAT) không hỗ trợ hardlink**: công cụ ghi file kiểu "atomic rename" báo
  `ENOTSUP: operation not supported on socket`. Ghi file bằng heredoc (`cat > file <<'EOF'`) là được.

### 7.3 Hai chỗ bàn giao cũ đã sai

- **§9.6 (HANDOVER) nói dist đang phát chưa tham chiếu `promo.js`** — nay **đã tham chiếu và popup ĐANG chạy** trên
  production (`/promo.js` trả 200, `dist/index.html` có `promo.css/promo.js?v=20260917b`). Deploy lần này không bật
  thêm gì mới.
- **`ops/prune-test-users.mjs` trỏ nhầm DB** ⇒ không dọn được tài khoản test. Nay script đọc
  `FBUDDY_DB` (vẫn nhận `FLOWGPT_DB` trong lúc chuyển tên, xem `docs/RENAME-FBUDDY.md`) và đã
  thêm mẫu `sepay-e2e+%`.

### 7.4 Tencent SkillHub (mục 5.1) — **chặn ở tầng mạng, không phải tầng code**

[`Tencent/skillhub`](https://github.com/Tencent/skillhub) (MIT, Open API `https://api.skillhub.cn`) **không kết nối
được** từ cả Mac lẫn VPS production: DNS phân giải (EdgeOne `43.174.224.202`) nhưng TCP 443/80 timeout, trong khi
baidu.com / cloud.tencent.com / npmjs đều 200 từ hai máy ⇒ giới hạn riêng của dịch vụ. `@tencent/skillhub` trên npm
cũng chưa publish (404). Muốn dùng phải qua relay VPS Trung Quốc hoặc xin `skillhub@tencent.com` mở quyền
(xem `docs/apply.md` của repo đó). Nguồn thay thế **vào được ngay**: ClawHub (`clawhub.ai`), `skills.sh`, SKILL.md
trên GitHub — dùng lại `ops/import-hub-skills.mjs` đã có.
