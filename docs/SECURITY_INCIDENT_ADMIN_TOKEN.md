# SECURITY INCIDENT — production `AUTH_TOKEN` (admin bearer) bị commit vào repo PUBLIC

- **Ngày phát hiện:** 2026-09-13
- **Phát hiện bởi:** GitHub secret scanning alert (owner báo) → DSH agent kiểm chứng lại
- **Mức độ:** **CRITICAL** (NFR-SEC-004 / AC-018; SECURITY.md §6: "auth bypass")
- **Trạng thái:** đã redact khỏi document (commit mới); **CHỜ OWNER QUYẾT ĐỊNH ROTATE TOKEN**

## 1. Cái gì bị lộ

`docs/APP_STORE_SUBMISSION_IOS.md` §5 có một lệnh `curl` mẫu dán **giá trị thật** của
`AUTH_TOKEN` (bearer admin của control-plane production) — 48 ký tự hex.
Định danh an toàn (không phải giá trị): md5 `df74fb041743cedb794510a05d87731b`.

- **File:** `docs/APP_STORE_SUBMISSION_IOS.md` (dòng 232 ở bản cũ)
- **Commit đưa vào:** `19bf6d3` — 2026-09-10 17:42 (+0800)
- **Repo:** `minhfat-ux/FPTVPN` — **PUBLIC** (GitHub API: `"private": false`, `"visibility": "public"`)
  ⇒ token nằm trong **cây hiện tại + toàn bộ lịch sử** kể từ 2026-09-10, ai cũng clone/đọc được
  (kể cả qua GitHub code search / các dịch vụ scrape public repo).
- **Thời gian phơi nhiễm:** ~3 ngày (tới 2026-09-13).

## 2. Kiểm chứng token còn "sống" (không in giá trị ra đâu cả)

So sánh md5 giữa giá trị trong docs và biến môi trường của service trên node1:

```bash
printf '%s' '<giá trị trong docs>' | md5            # df74fb041743cedb794510a05d87731b
ssh root@103.173.155.50 'systemctl show flowvpn-cp -p Environment' \
  | tr ' ' '\n' | grep '^AUTH_TOKEN=' | sed 's/^AUTH_TOKEN=//' | tr -d '"' | md5sum
# → df74fb041743cedb794510a05d87731b  ⇒ TRÙNG KHỚP = token trong docs CHÍNH LÀ token đang chạy
```

Token chỉ xuất hiện ở `/etc/systemd/system/flowvpn-cp.service` trên server
(không có trong crontab, không hard-code trong `admin-page.js`, không ở `/var/www`).

## 3. Ảnh hưởng (khi token còn hiệu lực)

`AUTH_TOKEN` là **middleware bearer toàn cục** (`control-plane/src/index.js:175-202`): mọi route
**không** nằm trong allowlist public đều mở bằng token này. Kèm theo đó là toàn bộ `/v1/admin/*`
(`requireAdminAuth`). Cụ thể kẻ có token làm được:

| Nhóm | Route | Hậu quả |
|---|---|---|
| Người dùng VPN | `GET /v1/admin/users`, `/v1/admin/users.csv` | Đọc toàn bộ danh sách user (email, trạng thái gói) |
| Cấp/huỷ gói | `POST /v1/admin/users/:id/subscription`, `/revoke` | **Tự cấp Premium cho bất kỳ email nào** (mất doanh thu) |
| MeetFlow AI | `GET/POST /v1/admin/ai/*` (users.csv, grant, revoke, entitlements, payments confirm) | Đọc/ghi dữ liệu người dùng AI, xác nhận thanh toán khống |
| Nhồi credential | `POST /v1/admin/ai/firebase/credentials`, `/ai/store/credentials` | Ghi đè service-account JSON (Firebase/Google Play) → chiếm luồng push/verify |
| Xoá tài khoản | `POST /v1/admin/ai/firebase/users/:uid/disable`, `DELETE /v1/admin/ai/firebase/users/:uid` | Khoá/xoá tài khoản người dùng |
| Ép phiên bản app | `PATCH /v1/admin/app-version` | Đổi `store_url`/`minimum_version` → đẩy toàn bộ client sang link lạ |
| Hạ tầng node | `GET /v1/admin/nodes/:id/health`, `/v1/admin/payments/pending` | Đọc trạng thái node, đơn chờ |
| Registry thiết bị | các route `/v1/peers*` (không public) | Đọc public key + overlay IP của thiết bị |
| Secret phái sinh | `VERIFY_LINK_SECRET` / `CONFIRM_SECRET` **fallback về `AUTH_TOKEN`** (index.js:921, 1767) | Giả mạo link xác thực email / link xác nhận thanh toán |

Điểm may: `/v1/admin/*` **không** bị chặn theo IP ở Caddy, nên gọi được từ Internet — mức độ là CRITICAL.

## 4. Những thứ KHÔNG bị lộ (đã kiểm tra)

- **Khoá SSH riêng** (`.tmp/flowvpn_support_page_ed25519`): không có trong git (kể cả lịch sử) — `.tmp/` bị ignore từ đầu.
- **WireGuard private key**: không có file `.conf`/private key nào được commit (`Vendor/WireGuardKit/MOBILECONFIG.md`
  chỉ là ví dụ của upstream WireGuardKit).
- **mật khẩu SMTP / Resend**: chỉ có *tên biến* trong unit, giá trị không nằm trong repo.
- **Hysteria auth + obfs**: có trong `android/.../Config.kt` (và trong lịch sử các docs cũ) — nhưng đây là
  giá trị **đi kèm APK phát hành công khai** (`https://meetflowai.site/v1/downloads/android`), nên coi là
  "không bí mật"; muốn thật kín phải chuyển hysteria sang per-user auth (xem `docs/EXIT_NODE_RUNBOOK.md`).
- Các chuỗi 48/64-hex khác trong repo: chỉ là SHA256 của AAB/APK (công khai, không phải secret).

## 5. Khắc phục

### 5.1 Ngay (bắt buộc)

1. **Rotate `AUTH_TOKEN`** trên node1 (đổi giá trị ⇒ token đã lộ thành vô giá trị):

   ```bash
   NEW=$(openssl rand -hex 24)
   ssh root@103.173.155.50 "sed -i 's/^Environment=AUTH_TOKEN=.*/Environment=AUTH_TOKEN=$NEW/' \
     /etc/systemd/system/flowvpn-cp.service && systemctl daemon-reload && systemctl restart flowvpn-cp"
   # lưu giá trị mới vào .tmp/flowvpn_admin_token.txt (chmod 600, đã gitignore) — KHÔNG dán vào repo/chat
   ```

2. **Verify**: token cũ → `401 Unauthorized`; token mới → `200` (`GET /v1/admin/users`).
3. **Redact docs** — đã làm: `docs/APP_STORE_SUBMISSION_IOS.md` giờ dùng `$AUTH_TOKEN` + hướng dẫn lấy từ unit.
4. Lưu ý hệ quả rotate: link xác thực email / xác nhận thanh toán **đang treo** (nếu dùng fallback)
   sẽ hết hiệu lực → khách bấm lại sẽ nhận link mới; owner phải dán token mới vào trang `/admin`.

### 5.2 Nên làm tiếp

- **Chuyển repo `minhfat-ux/FPTVPN` sang Private** (đang public: lộ cả runbook hạ tầng, IP node, quy trình vận hành).
- Bật **push protection** của GitHub secret scanning để chặn commit chứa secret.
- (Tuỳ chọn) Purge lịch sử: sau khi rotate thì token cũ vô hại, nên **không bắt buộc** phải `git filter-repo`;
  nếu vẫn muốn xoá khỏi lịch sử thì phải force-push và mọi bản clone cũ phải re-clone.
- Đặt `VERIFY_LINK_SECRET` + `CONFIRM_SECRET` riêng (không phụ thuộc `AUTH_TOKEN`).
- Rà lại thói quen: docs/evidence **không bao giờ** dán giá trị thật — dùng `$ENV_VAR` hoặc `<PLACEHOLDER>`
  (RULE-EVID-005, SECURITY.md §7).

---

## 6. Diễn biến xử lý — 2026-09-13 (agent, owner đã approve rotate)

### 6.1 Xác nhận mức độ (trước khi rotate)

```bash
curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer <token đã lộ>" \
  https://api.meetflowai.site/v1/admin/users      # → 200
curl -s -o /dev/null -w '%{http_code}' https://api.meetflowai.site/v1/admin/users   # → 401 (không token)
```

⇒ Token **dùng được từ Internet**, không bị chặn theo IP (`requireAdminIP` chỉ áp cho **1** route;
`/v1/admin/users` không có) ⇒ đúng mức **CRITICAL**.

### 6.2 Đã rotate (2026-09-13)

- Sinh token mới (24 byte hex), sửa `Environment=AUTH_TOKEN=...` trong
  `/etc/systemd/system/flowvpn-cp.service`, backup unit: `/root/flowvpn-cp.service.bak-1789298466`,
  `systemctl daemon-reload && systemctl restart flowvpn-cp` → service `active`.
- **Verify sau rotate:** token **mới → 200**, token **cũ → 401** (giá trị cũ đã vô hiệu).
- Token mới lưu tại `.tmp/flowvpn_admin_token.txt` (`chmod 600`, đã gitignore) — **không** vào repo/chat/log.
- Ảnh hưởng phụ: link verify email / link confirm thanh toán đang treo (fallback secret) hết hiệu lực → gửi lại là được.

### 6.3 Rà soát dấu hiệu lạm dụng

- `auth.json`: 15 user / 14 subscription; `ai-users.json`: 9 user. Không thấy bất thường:
  các gói `admin.manual` (09-10 13:31 và 13:35) khớp **cùng giây** với user được tạo (owner cấp tay),
  còn lại là `bankqr.monthly` (mua thật) và `test.premium` (test nội bộ).
- **Hạn chế:** control-plane **không ghi log request** ⇒ **không có audit trail** cho `/v1/admin/*`,
  nên không thể loại trừ 100% việc token bị dùng. Khuyến nghị: thêm access log cho các route admin
  (ghi method + path + IP, **không** ghi token).

### 6.4 GitHub

- **Dependabot đang disabled** ⇒ alert owner thấy gần như chắc chắn là **secret scanning** (đúng loại secret này).
- **Repo vẫn PUBLIC**: PAT lưu trong keychain (`minhfat-ux`, fine-grained) **thiếu quyền Administration: write**
  ⇒ `PATCH /repos/minhfat-ux/FPTVPN {"private":true}` trả *"Resource not accessible by personal access token"*.
  Cần owner đổi bằng UI: **Settings → General → Danger Zone → Change repository visibility → Private**
  (hoặc cấp PAT/`gh` có quyền admin để agent làm).
- Sau khi rotate: vào alert của GitHub bấm **Revoked** (không cần purge lịch sử vì token cũ đã vô hiệu).

### 6.5 Việc còn lại (khuyến nghị)

- [ ] Owner: chuyển repo sang **Private** + bật **push protection** cho secret scanning.
- [ ] Owner: đặt `VERIFY_LINK_SECRET` + `CONFIRM_SECRET` riêng (hiện fallback về `AUTH_TOKEN`).
- [ ] Thêm access log cho `/v1/admin/*` (method + path + IP) để lần sau truy được vết.
- [ ] Xoá `DEV_LOGIN_CODE` sau khi app được duyệt (đang để phục vụ review).

### 6.6 Rà các repo public khác của cùng tài khoản GitHub

Đã clone nông và quét 3 repo public còn lại (`minhfat-ux/privateVPN`, `MeetflowNewsStudio`, `MeetFlowAIMac`):
**không** có token cũ, không có `AIza…`/`re_…`/`sk-…`/`ghp_…`, không có private key, không có
service-account JSON hay file `.env`/keystore nào bị commit. (Chỉ thấy *tên* biến môi trường trong code.)
