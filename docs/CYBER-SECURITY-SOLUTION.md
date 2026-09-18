# Giải pháp & Kiến trúc — Gói Cyber Security cho fBuddy (Enterprise)

> Tài liệu thiết kế (CHƯA implement). Mục tiêu: cho khách doanh nghiệp bật thêm lớp bảo mật.
> Kèm kế hoạch tính năng: [`CYBER-SECURITY.md`](CYBER-SECURITY.md).

## 1. Bối cảnh & mục tiêu

fBuddy là AI chatbox (chat, sửa ảnh, PPT/Excel, phân tích dữ liệu) — Node/Express 5 + `node:sqlite`,
React web. Hiện **single-tenant**: một DB, một bộ provider/key dùng chung, mọi user chung chính sách.

Doanh nghiệp mua gói Cyber Security thường cần 3 thứ:
1. **Dữ liệu của họ không bị lộ** (ra ngoài, sang model, sang tenant khác).
2. **Kiểm soát được ai làm gì** (truy cập, audit, vùng IP).
3. **Chứng minh được tuân thủ** (GDPR/SOC2/Luật dữ liệu VN) khi bị kiểm.

## 2. Hiện trạng (đã có sẵn — tận dụng, đừng viết lại)

| Thứ | Đã có |
|---|---|
| Xác thực | Email OTP + JWT, `token_version` để thu hồi phiên, role `admin`/`user` (`auth.js`, `sessions.js`) |
| Mã hoá khoá | `encryptSecret` AES-256-GCM + scrypt (`crypto.js`) — API key đã mã hoá at-rest |
| Nhật ký | Hàm `audit()` đã gọi ở vài route (hub.create, mcp.create…) — nhưng **chưa có UI + chưa đủ phủ** |
| Tín dụng | Ledger append-only (`credit_ledger`), đốt credit theo chi phí model (`costForModel`) |
| Hạ tầng | Cloudflare + Caddy (TLS), `fbuddy.service`, agent-bus, systemd timers |

→ Nền đã có 60% "xương". Cyber Security là **thêm lớp chính sách + isolation + minh chứng**, không cần đập đi xây lại.

## 3. Threat model (rủi ro cần che)

1. **Lộ dữ liệu chat ra model** — PII/tài liệu nội bộ gửi lên LLM bên thứ ba.
2. **Lưu trữ không kiểm soát** — chat/tệp tồn đọng vô hạn, vi phạm retention.
3. **Truy cập trái phép** — tài khoản lộ, IP lạ, thiếu MFA/SSO.
4. **Lẫn tenant** — (nếu multi-tenant) khách A đọc được dữ liệu/khóa của khách B.
5. **Không chứng minh được** — không có audit log khi bị kiểm/incident.

## 4. Nguyên tắc thiết kế

- **Đơn giản & pha từng bước** (P0→P2), không nhảy thẳng microservice.
- **Một "security plane"** tập trung: middleware authn/z + chính sách đọc từ `org_security`.
- **Envelope encryption** cho dữ liệu nhạy cảm: mỗi org một data-key (DEK), DEK mã hoá bằng master key.
- **Mọi thứ ghi log** (audit append-only) để minh chứng được.

## 5. Kiến trúc tổng thể

```
User/Web → Cloudflare/Caddy (TLS) → Express
   ├─ authn (JWT) → authz (role + org)          ← security middleware
   ├─ IP allowlist (theo org)                    ← security middleware
   ├─ PII redaction (pre-send hook)              ← trước khi gọi model
   ├─ chat agent → (BYOK provider theo org)      ← provider scoped theo org
   └─ retention (cron bên cạnh)                  ← xoá theo policy

Bảng phụ trợ: model_pricing (agent đồng bộ giá), credit_ledger, audit_log
Sidecars (systemd timers): refresh pricing (đã có), retention purge, audit archive
```

## 6. Thiết kế từng năng lực

### 6.1 Tenant / tổ chức (nền tảng cho mọi thứ khác)
- Thêm `organizations` (id, name, plan, security_flags) + `users.org_id`.
- Mọi bảng "dữ liệu người dùng" (`conversations`, `messages`, `files`, `providers`) gắn `org_id`.
- Truy vấn luôn kèm `WHERE org_id = ?` (đã có `db.js` wrapper — thêm scoping ở tầng data).

### 6.2 Retention / no-log
- `org_security.retention_days` + `no_log` (boolean).
- Cron `ops/retention.mjs` (systemd timer, đêm) xoá conversation/file quá hạn + xoá audit quá hạn.
- `no_log = true` → không persist nội dung tin nhắn (chỉ lưu metadata tối thiểu đã mã hoá), như ZDR.

### 6.3 Audit log
- Bảng `audit_log` (id, ts, org_id, user_id, action, target, meta_json) — append-only.
- Thêm `audit()` ở MỌI route admin + nhạy cảm (login, key đổi, export, xoá).
- UI admin: lọc theo user/action/khoảng thời gian + xuất CSV.

### 6.4 PII redaction
- Hook ở `agent.js` (trước khi dựng prompt) quét: SĐT, email, CCCD/CMND, số thẻ, địa chỉ.
- Thay bằng token `[PII:phone:1]`; giữ map token→giá trị **ở bộ nhớ** (không ghi DB) để phục hồi trong phản hồi.
- V2: model nhỏ local để nhận diện ngữ cảnh (thay vì chỉ regex).

### 6.5 BYOK (mang key riêng)
- `providers.org_id` (nullable = dùng key nền của FlowTech).
- Doanh nghiệp tự thêm key OpenRouter/OpenAI; traffic của org đó đi bằng key của họ.
- Billing vẫn qua fBuddy (credit) — BYOK chỉ đổi "ai trả tiền token", không đổi cách thu phí.

### 6.6 IP allowlist / region lock
- `org_security.ip_allowlist_json`.
- Middleware so khớp `X-Forwarded-For` (đã trust proxy) với allowlist; chặn ngoài dải.

### 6.7 MFA / SSO (P2)
- MFA TOTP (dễ, tự làm): thêm bí mật TOTP vào `users`, bước xác nhận khi login.
- SSO SAML/OIDC (khó): tích hợp IdP (Auth0/Google Workspace/Azure AD) — để P2.

### 6.8 Encryption at rest (nâng cấp)
- Hiện: chỉ mã hoá API key. Nâng: mã hoá nội dung `messages.content` bằng DEK theo org (envelope).
- Đánh đổi: tìm kiếm/export chậm hơn — chỉ bật cho org có cờ bảo mật.

## 7. Mô hình dữ liệu (bổ sung)

```sql
organizations(id, name, plan, security_flags, created_at)
users.org_id (nullable → cá nhân)
org_security(org_id PK, retention_days, no_log, pii_redact,
             ip_allowlist_json, byok_provider_id, data_key_enc)
audit_log(id, ts, org_id, user_id, action, target, meta_json)
providers.org_id (nullable)
conversations/messages/files: + org_id
```

## 8. API & UI

- Admin UI: Cài đặt → **"Bảo mật"** (tab mới): bật/tắt từng cờ, set retention, allowlist, BYOK, xem audit.
- API (đều `requireAdmin` + scope theo org): `GET/PATCH /api/admin/security`, `GET /api/admin/audit`.
- Middleware đơn lẻ: `securityMiddleware(org)` — đọc `org_security` đã cache, áp allowlist + flags.

## 9. Khoá & vận hành

- Master key: `FBUDDY_SECRET` (đã có). DEK theo org sinh ngẫu nhiên, mã hoá bằng master key (`data_key_enc`).
- Các cron/timer: `fbuddy-pricing.timer` (đã có) + `fbuddy-retention.timer` (mới) + `fbuddy-audit-archive.timer`.
- Sao lưu: DB + key env theo quy trình hiện có.

## 10. Compliance (đối chiếu)

| Yêu cầu | Tính năng đáp ứng |
|---|---|
| GDPR xoá phải (right to erasure) | Retention + export + xoá theo user |
| SOC2 audit | audit_log append-only |
| Luật dữ liệu VN (PDPD 2023) | IP/region lock, mã hoá at-rest, BYOK |
| Minimization | PII redaction + no-log |

## 11. Lộ trình

- **P0 (v1, 2-3 ngày):** retention/no-log + audit log UI + PII redaction (regex). Không đổi tenancy.
- **P1 (tuần sau):** organizations + org-scoping + BYOK + IP allowlist.
- **P2 (sau):** encryption at-rest theo org, MFA, SSO/OIDC.

## 12. Rủi ro & câu hỏi mở

- Multi-tenant (P1) là thay đổi lớn nhất — cần test kỹ migrate, tránh vỡ data hiện có.
- PII redaction regex có thể miss — chỉ cam kết "best-effort" ở P0.
- Cần anh chốt: giá gói (bao nhiêu/tháng), và có bắt buộc multi-tenant ngay từ P0 không?
