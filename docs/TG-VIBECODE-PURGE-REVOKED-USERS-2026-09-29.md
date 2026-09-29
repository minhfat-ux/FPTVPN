# Xoá account đã revoke + ẩn khỏi list user control panel (29/09/2026)

> Người làm: harness **WIN** · task sổ: **`T-20260929-02`** (owner → win, bus **#574** lúc 2026-09-29T14:30:11Z)
> Nguyên văn (Telegram `/vibecode`): *"xóa các account bị revoke đi, không hiện accounts đã revoke trong list user
> của control panel nữa"*. Làm lúc 2026-09-29 14:40–14:50Z (21:40–21:50 giờ VN).

## 1. Đã làm gì

| # | Việc | File / chỗ sửa |
|---|---|---|
| 1 | **Ẩn** account đã revoke khỏi list user | `index.js` route `GET /v1/admin/users` gọi `listUsersWithExpiry({ excludeRevoked: true })` |
| 2 | Thêm tuỳ chọn lọc ở store | `auth-store.js` → `listUsersWithExpiry(options)`; **mặc định vẫn trả đủ** để route map thiết bị iOS (`/v1/admin/ios/devices/:udid/account`) còn tra được account đã revoke |
| 3 | Thêm hàm **xoá hẳn** | `auth-store.js` → `purgeRevokedUsers()`: xoá user revoked **kèm** phiên / gói / enrollment token / nhắc gia hạn của user đó; idempotent |
| 4 | Chạy xoá thật (có backup) | `ops/_scratch/purge-revoked-users-20260929.mjs --apply` (dừng service → xoá → chạy lại) |

## 2. Kết quả đo được

```text
users trước      : 25
account revoked  : 5
   - test@example.com
   - support@meetflowai.site
   - no-reply@meetflowai.site
   - reset-quota-check@example.com
   - reset-quota-check-1790575713@example.com
backup: /root/flowvpn-cp/data/backups/auth.json.before-purge-2026-09-29T14-48-10-242Z
ĐÃ XOÁ : 5 account
users sau        : 20   | còn revoked: 0   | auth.json VALID

# Service vẫn khoẻ
GET  /v1/health                → 200
POST /v1/tokens                → 201
lỗi auth-store trong log       → 0
```

Kiểm thử bộ lọc (tệp tạm, không đụng dữ liệu thật):

```text
tổng: 2 | hiển thị (excludeRevoked): 1 | có account revoked trong list? false  → PASS
```

## 3. Lưu ý

- 5 account bị xoá đều **đã revoke** (không đăng nhập được) — trong đó `support@meetflowai.site` và
  `no-reply@meetflowai.site` là account cũ đã revoke, **không phải** địa chỉ gửi mail (mail vẫn dùng
  `SMTP_USER` trong env service). Muốn dùng lại chỉ cần thêm account theo email như trước.
- Backup nguyên trạng 25 user nằm ở `/root/flowvpn-cp/data/backups/auth.json.before-purge-2026-09-29T14-48-10-242Z`
  ⇒ khôi phục được nếu cần.
- Từ nay account bị revoke sẽ **tự ẩn** khỏi list (nhờ `excludeRevoked`) — không cần chạy lại script.

## 4. Lệnh tái lập / kiểm tra

```bash
# Xem thử (không xoá): node /tmp/purge-revoked.mjs
# Kiểm list admin đã ẩn revoked: node -e "import('file:///root/flowvpn-cp/src/auth-store.js')..." (xem mục 2)
ssh root@165.101.114.162 'node -e "const d=JSON.parse(require(\"fs\").readFileSync(\"/root/flowvpn-cp/data/auth.json\",\"utf8\"));console.log(d.users.length, d.users.filter(u=>u.revokedAt).length)"'
```
