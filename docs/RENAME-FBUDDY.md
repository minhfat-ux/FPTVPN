# Đổi tên FlowGpt → fBuddy

Đổi thương hiệu toàn bộ: tên hiển thị, định danh kỹ thuật và **domain**. Tài liệu này
ghi lại những gì đã đổi trong repo, những gì **cố ý không đổi**, và các bước migrate
production — phần production **chưa được chạy** khi tài liệu này được viết.

## 1. Đã đổi trong repo

| Nhóm | Số chỗ |
|---|---|
| Tổng thay thế chuỗi (146 file) | 753 |
| File đổi tên | 3 |
| CSDL production cần migrate | 5 khoá `app_settings` + chữ trong `hub_skills` |

File đổi tên:

- `deploy/flowgpt.env.example` → `deploy/fbuddy.env.example`
- `deploy/flowgpt.service` → `deploy/fbuddy.service`
- `ops/report-telegram-flowgpt-round4.sh` → `ops/report-telegram-fbuddy-round4.sh`

Ngoài ra: `package.json` / `server/package.json` / `web/package.json` → `fbuddy`,
`@fbuddy/server`, `@fbuddy/web`; `package-lock.json` và symlink
`node_modules/@fbuddy/*` đã đồng bộ lại; `web/dist` đã build lại để artefact không
còn brand cũ.

## 2. Bảng ánh xạ

| Hạng mục | Trước | Sau |
|---|---|---|
| Tên hiển thị | FlowGpt | **fBuddy** |
| Domain | flowgpt.meetflowai.site | fbuddy.meetflowai.site |
| systemd unit | flowgpt.service | fbuddy.service |
| Thư mục ứng dụng | /opt/flowgpt | /opt/fbuddy |
| Cấu hình | /etc/flowgpt/flowgpt.env | /etc/fbuddy/fbuddy.env |
| Dữ liệu | /var/lib/flowgpt | /var/lib/fbuddy |
| Tệp CSDL | flowgpt.db | fbuddy.db |
| Biến môi trường | `FLOWGPT_*` | `FBUDDY_*` |
| Cookie phiên | `flowgpt_token` | `fbuddy_token` |
| Khoá localStorage | `flowgpt.token`, `flowgpt.theme`, `flowgpt.locale`, `flowgpt.ecosystem.banner` | `fbuddy.*` |
| Nhãn model hiển thị | FlowGPT-4.6 | fBuddy-4.6 |
| Tên gói | `flowgpt`, `@flowgpt/server`, `@flowgpt/web` | `fbuddy`, `@fbuddy/server`, `@fbuddy/web` |

## 3. Cố ý KHÔNG đổi

- **Nhánh git `flowgpt` / `origin/flowgpt`** — máy Windows đang push lên nhánh này
  (xem `docs/HANDOFF-MAC.md`). Đổi tên nhánh remote cần push và phối hợp cả hai máy,
  nên để nguyên; đổi tên nhánh không ảnh hưởng sản phẩm.
- **`FlowTech`** — tên hệ thống thiết kế/theme (`docs/THEME.md`, `docs/flowtech-theme-reference.py`),
  là thương hiệu riêng, không phải tên sản phẩm.
- **`no-reply@meetflowai.site`** — domain gửi mail đã verify ở Resend; đổi sẽ làm mail lỗi.
- **Model id thật của nhà cung cấp** (`glm-4.6`, `glm-4.5-air`, …) — chỉ đổi *nhãn hiển thị*
  (`fBuddy-4.6`), giữ nguyên id để gọi API.
- **Thư mục làm việc trên Mac** `/Volumes/BIWIN/FlowGPT` — đổi tên thư mục sẽ phá đường dẫn
  workspace của phiên đang chạy; hãy đổi bên ngoài phiên nếu cần.
- **Tên thư mục checkout trên Windows** `C:\\Users\\Minhn\\FlowTech AI\\fbuddy` — tài liệu
  (`README.md`, `docs/DEPLOY.md`, `docs/HANDOFF-MAC.md`) đã ghi theo tên mới; nếu bạn giữ
  thư mục cũ là `flowgpt` thì sửa lại đường dẫn `cd` cho khớp máy thật.
- **Nội dung hội thoại cũ** trong bảng `messages` — lịch sử chat là bản ghi, script migrate
  không sửa.

## 4. Migrate production (theo thứ tự)

Hiện trạng lúc viết: `https://flowgpt.meetflowai.site/api/health` → **200**;
`fbuddy.meetflowai.site` **chưa có bản ghi DNS** (nên chưa cấp được TLS).

```bash
# 1) DNS: tạo bản ghi A proxied cho fbuddy (token Cloudflare đã có trên node-2)
bash /opt/fbuddy/deploy/dns-cloudflare.sh            # xem trước
bash /opt/fbuddy/deploy/dns-cloudflare.sh --apply
dig +short fbuddy.meetflowai.site                    # phải ra IP Cloudflare

# 2) TLS + block Caddy cho domain mới
bash /opt/fbuddy/ops/caddy-issue-cert.sh

# 3) Đưa code mới lên node-2 (từ Windows): deploy.ps1 tự tar → /opt/fbuddy
#    hoặc copy thủ công rồi bash /opt/fbuddy/deploy/remote-setup.sh

# 4) Chuyển dữ liệu sang tên mới
systemctl stop flowgpt                               # dừng bản cũ trước khi copy
mv /var/lib/flowgpt /var/lib/fbuddy
mv /var/lib/fbuddy/flowgpt.db /var/lib/fbuddy/fbuddy.db

# 5) Env: tạo từ mẫu rồi bê nguyên giá trị secret cũ sang tên FBUDDY_*
install -d -m 755 /etc/fbuddy
cp deploy/fbuddy.env.example /etc/fbuddy/fbuddy.env  # điền lại secret cũ, chmod 600
#    FLOWGPT_SECRET       -> FBUDDY_SECRET       (BẮT BUỘC giữ nguyên giá trị,
#    FLOWGPT_ADMIN_TOKEN  -> FBUDDY_ADMIN_TOKEN     nếu đổi là mọi token/credential
#    ...                                             đã mã hoá sẽ không giải mã được)
chmod 600 /etc/fbuddy/fbuddy.env

# 6) systemd: bật unit mới
install -m 644 /opt/fbuddy/deploy/fbuddy.service /etc/systemd/system/fbuddy.service
systemctl daemon-reload
systemctl enable --now fbuddy
systemctl disable --now flowgpt                      # chỉ sau khi fbuddy đã chạy

# 7) Migrate nhãn thương hiệu đã lưu trong SQLite (xem mục 1)
FBUDDY_DB=/var/lib/fbuddy/fbuddy.db node /opt/fbuddy/ops/rename-to-fbuddy.mjs            # xem trước
FBUDDY_DB=/var/lib/fbuddy/fbuddy.db node /opt/fbuddy/ops/rename-to-fbuddy.mjs --apply
systemctl restart fbuddy

# 8) Xác minh
bash /opt/fbuddy/ops/check-deploy.sh
node /opt/fbuddy/ops/smoke.mjs https://fbuddy.meetflowai.site/api
node /opt/fbuddy/ops/verify-production.mjs
```

**Giữ domain cũ hoạt động (khuyến nghị).** Link đăng nhập đã gửi, mail cũ và người dùng
đã lưu bookmark đều trỏ `flowgpt.meetflowai.site`. Thêm vào Caddyfile rồi reload:

```caddyfile
flowgpt.meetflowai.site {
	redir https://fbuddy.meetflowai.site{uri} permanent
}
```

## 4b. Đã chạy thật trên production (2026-09-18)

Thứ tự đã dùng, và những chỗ suýt trả giá:

1. `tar` code mới (bỏ `node_modules`/`data`/`.git`) → `/opt/fbuddy`; dùng lại
   `node_modules` của bản cũ vì bộ dependency không đổi.
2. **Tạo `/etc/fbuddy/fbuddy.env` TRƯỚC khi chạy `remote-setup.sh`.**
   ⚠️ `deploy/remote-setup.sh` sinh **secret ngẫu nhiên mới** nếu file env chưa tồn tại —
   chạy nó trước là mất khoá giải mã mọi API key đã lưu và đăng xuất toàn bộ người dùng.
   Env mới tạo bằng `sed -E s/^FLOWGPT_/FBUDDY_/` từ file cũ nên giá trị secret giữ nguyên
   từng byte (kiểm chứng bằng `sha256sum`, không in giá trị ra màn hình).
3. DNS: `bash deploy/dns-cloudflare.sh --apply` → bản ghi A proxied. Trong lúc Caddy chưa có
   block cho domain mới thì Cloudflare trả **525** — bình thường, hết sau bước 4.
4. Cutover (downtime ~1 phút): `systemctl stop flowgpt` → `cp -a /var/lib/flowgpt/. /var/lib/fbuddy/`
   → đổi tên `flowgpt.db* → fbuddy.db*` → `PRAGMA wal_checkpoint(TRUNCATE)` → chạy
   `deploy/remote-setup.sh` (cài unit, thêm block Caddy, restart, tự kiểm tra health).
5. Đối chiếu dữ liệu trước/sau khi copy: `users=7 conversations=10 messages=145 files=7
   hub_skills=7 app_settings=13 auth_sessions=6` và `files/` 67=67 — khớp.
6. Migrate nhãn trong CSDL: `bankNotePrefix` `"FLOWGPT"` → `"FBUDDY"` (tiền tố mã đơn nạp) và
   chữ trong 1 kỹ năng của chợ; sau đó 0 hàng còn nhãn cũ.
7. `systemctl disable flowgpt` — **bắt buộc**: cả hai unit cùng trỏ cổng 7790, để nguyên là
   reboot xong chúng tranh cổng và có thể dựng lại bản cũ với dữ liệu cũ.
8. Kiểm chứng: `/api/health` 200 ở cả hai domain, `/api/meta` trả `appName=fBuddy`,
   `ops/smoke.mjs https://fbuddy.meetflowai.site/api` gửi được mail thật (chứng minh secret +
   khoá Resend sau khi đổi tên biến env vẫn đúng).

### ⚠️ Sự cố đã xảy ra: đổi SALT trong `crypto.js` làm hỏng khoá giải mã

Đây là bài học đắt nhất của lần đổi tên này. `server/src/crypto.js` dẫn xuất khoá AES bằng
`scrypt(config.secret, SALT)` với **SALT viết cứng trong code** (`"flowgpt-secret-v1"`).
Đổi tên thương hiệu bằng cách thay chuỗi toàn repo đã đổi luôn SALT ⇒ khoá dẫn xuất đổi theo,
nên **mọi credential đã lưu (API key của 3 nhà cung cấp AI, Resend, SePay, MCP) không giải mã
được nữa** dù biến môi trường `FBUDDY_SECRET` giữ nguyên từng byte. Triệu chứng duy nhất nhìn
thấy là "nhà cung cấp chưa có API key" vì `decryptSecret()` trả `null` im lặng — rất dễ chẩn
đoán nhầm thành "mất key".

Cách xử lý đang dùng trong code:

- `SECRET_SALT = "fbuddy-secret-v1"` (ghi bằng khoá mới),
- `LEGACY_SALTS = ["flowgpt-secret-v1"]` (ĐỌC được dữ liệu cũ) — **không xoá trước khi** chạy
  `ops/reencrypt-secrets.mjs`,
- `FBUDDY_LEGACY_SECRET` (tuỳ chọn) nếu phần dữ liệu cũ mã hoá bằng secret cũ *khác*.

Quy trình kiểm tra và chuyển đổi:

```bash
set -a; . /etc/fbuddy/fbuddy.env; set +a
node ops/check-secret-health.mjs              # đọc được bao nhiêu khoá, bằng salt nào
node ops/reencrypt-secrets.mjs                # xem trước
node ops/reencrypt-secrets.mjs --apply        # chuyển hết sang khoá mới
```

Đã chạy trên production: 3/3 `providers.api_key_enc` chuyển sang khoá mới, sau đó
`ops/verify-production.mjs` chạy một lượt chat thật và **ĐẠT**.

> ⚠️ Bản vá `crypto.js` này đang là **thay đổi chưa commit** trong cây nguồn. Nếu ai đó
> `git checkout`/rollback mà không deploy lại `server/src/crypto.js`, production sẽ hỏng
> giải mã trở lại dù `/opt/fbuddy` vẫn còn bản vá — hãy commit trước khi rollback bất cứ thứ gì.

**Bẫy vận hành:** script ops chạy trên server cần nạp env trước, nếu không chúng dùng đường dẫn
mặc định và báo `unable to open database file`:

```bash
set -a; . /etc/fbuddy/fbuddy.env; set +a
cd /opt/fbuddy && NODE_ENV=production node ops/verify-production.mjs
```

**Còn lại (việc bên ngoài repo):** cập nhật URL webhook trong dashboard SePay sang domain mới;
sau khi chắc chắn không còn traffic vào domain cũ thì đổi block Caddy của `flowgpt.meetflowai.site`
thành `redir https://fbuddy.meetflowai.site{uri} permanent`. Hiện vẫn giữ reverse-proxy để webhook
và link cũ hoạt động — **không** đổi thành redirect trước khi SePay trỏ domain mới, vì redirect
308 có thể làm hỏng chữ ký HMAC của webhook.

## 5. Ảnh hưởng tới người dùng

- Đổi domain + tên cookie + khoá localStorage ⇒ **mọi người phải đăng nhập lại** một lần.
  Giữ redirect domain cũ để magic link đang hiệu lực vẫn dùng được.
- Nhãn model trong Cài đặt đổi `FlowGPT-4.6` → `fBuddy-4.6`; model thật vẫn là `glm-4.6`.
- Mã hoá provider/MCP dùng khoá dẫn xuất từ `FBUDDY_SECRET`: **giữ nguyên giá trị secret cũ**,
  nếu không mọi API key đã lưu sẽ không giải mã được.

## 6. Rollback

1. `git revert` commit đổi tên (repo), build lại `web/dist`.
2. Đổi hệ thống về tên cũ: `mv /var/lib/fbuddy /var/lib/flowgpt`, `fbuddy.db` → `flowgpt.db`,
   `systemctl enable --now flowgpt`, xoá block Caddy của domain mới.
3. Bản ghi DNS `fbuddy` để nguyên cũng không hại (không trỏ tới app nữa) hoặc xoá.
4. Script `ops/rename-to-fbuddy.mjs` chỉ chạy một chiều; muốn lùi dữ liệu thì sửa `RULES`
   trong script thành chiều ngược lại rồi chạy lại (script idempotent).

## 7. Ghi chú kiểm thử

- Bộ test server: `cd server && node --test "test/*.test.js"` → **177/177 pass** sau đổi tên.
- `npm test` ở gốc repo **đang lỗi sẵn** (không liên quan đổi tên): script trong
  `server/package.json` là `node --test test/`, Node 26 không nhận tham số thư mục nữa
  (`Cannot find module .../server/test`). Muốn dùng `npm test` thì đổi thành
  `node --test "test/*.test.js"`.
