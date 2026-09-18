# Kế hoạch — Gói Cyber Security cho fBuddy (doanh nghiệp)

> Mục tiêu: cho phép khách **doanh nghiệp** bật thêm một lớp bảo mật (tier riêng),
> bán như add-on. Bản nền (cá nhân) vẫn như hiện tại.

## 1. Mô hình tier
- **Free / Cá nhân**: như hiện tại.
- **Pro**: thêm chức năng tiện ích.
- **Enterprise + Cyber Security (add-on)**: bật các tính năng bảo mật dưới đây.

## 2. Tính năng Cyber Security (theo thứ tự dễ → khó, đều khả thi)

| # | Tính năng | Mô tả | Độ khó |
|---|---|---|---|
| 1 | **Retention / no-log** | Tự xoá hội thoại + file sau N ngày, hoặc chế độ "không lưu" (ZDR) | Thấp |
| 2 | **Audit log UI** | Trang admin xem nhật ký (ai đã làm gì, lúc nào) — nền đã có `audit()` | Trung bình |
| 3 | **PII redaction** | Tự phát hiện & che số điện thoại/email/CCCD/thẻ trước khi gửi lên model | Trung bình |
| 4 | **BYOK** | Doanh nghiệp tự gắn key OpenRouter/OpenAI riêng cho workspace của họ | Trung bình |
| 5 | **IP allowlist / region lock** | Chỉ cho phép truy cập từ dải IP/vùng được phép | Trung bình |
| 6 | **MFA + SSO (SAML/OIDC)** | Đăng nhập qua IdP doanh nghiệp | Cao |
| 7 | **Tenant isolation** | Tách dữ liệu + key theo tổ chức (multi-tenant) | Cao |

## 3. Kiến nghị làm trước (v1 — dễ thắng nhanh, bán được ngay)
1. **Retention/no-log** — cài `retentionDays` + cron xoá; thêm nút "chế độ không lưu".
2. **Audit log** — đã có `audit()` trong code, chỉ cần làm trang admin hiển thị + lọc.
3. **PII redaction** — regex + (tuỳ chọn) model nhỏ để nhận diện trước khi gửi.

## 4. Cách bật/tắt
- `app_settings.securityTier` (none | enterprise) + cờ từng tính năng.
- UI trong Cài đặt → "Bảo mật" (admin), và gói giá ở trang topup.

## 5. Cần xác nhận từ anh
- Gói này tính phí riêng (bao nhiêu/tháng) hay gộp vào gói enterprise?
- Ưu tiên 3 mục v1 ở trên có đúng ý anh không, hay muốn thêm mục khác (ví dụ DLP, encryption at rest)?
