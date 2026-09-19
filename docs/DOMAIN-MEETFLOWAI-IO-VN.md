# Kế hoạch — domain `meetflowai.io.vn`

> Tài liệu kế hoạch (CHƯA triển khai). Mục tiêu: đưa domain thứ hai vào dùng có kiểm soát.

## 1. Hiện trạng (đã kiểm tra thật)

| Domain | Trạng thái | Đang phục vụ |
|---|---|---|
| **meetflowai.site** | ✅ Cloudflare (NS `ivan/meiling.ns.cloudflare.com`) | `fbuddy.` (app chat), `console.` (admin console — vừa live), `api.` (control-plane VPN), `flowgpt.` |
| **meetflowai.io.vn** | ❌ **chưa có NS** — đã mua nhưng chưa nối đi đâu | (không có gì) |

## 2. Mục đích — cần chốt

- **(a) Thương hiệu Việt**: `.io.vn` là domain cấp 2 của Việt Nam → tốt cho SEO nội địa + niềm tin khách VN.
- **(b) Tách thị trường**: `.site` = quốc tế, `.io.vn` = bản Việt Nam.
- **(c) Dự phòng**: nếu `.site` gặp sự cố DNS/Cloudflare thì còn cửa vào.

## 3. Việc phải làm, theo thứ tự

1. **Thêm domain vào Cloudflare** (Free plan) → Cloudflare cho 2 NS.
2. **Đổi NS tại nhà đăng ký `.io.vn`** sang 2 NS đó (chờ 1–24h propagate). ← *chỉ anh làm được, em không có quyền ở nhà đăng ký.*
3. **Thêm DNS records** trỏ về node-2 (`165.101.114.162`), bật proxy (cam) — giống `.site`.
4. **Thêm block Caddy** trên node-2 cho từng subdomain (Caddy tự lấy cert qua HTTP-01, đã chứng minh chạy được với `console.`).
5. (Tuỳ) **Cloudflare Redirect Rules**: domain phụ → 301 về canonical.

## 4. Cấu trúc đề xuất cho `meetflowai.io.vn`

| Subdomain | Trỏ về | Ghi chú |
|---|---|---|
| `@` + `www` | landing page | trang giới thiệu tiếng Việt |
| `app` (hoặc `fbuddy`) | node-2:7790 | app chat fBuddy |
| `console` | node-2:7790 | admin console (console mode) |
| `api` | node-2:7778 | control-plane (VPN/app) |

## 5. Điểm phải cân nhắc

- **App hardcode base URL**: Android/iOS/macOS/Windows hiện gọi `fbuddy.meetflowai.site`. Nếu `.io.vn` thành canonical thì phải phát hành bản app mới hoặc đổi qua app config.
- **SEO**: chọn **một canonical**, domain còn lại 301 — tránh trùng nội dung.
- **Email**: Resend đang gửi từ `no-reply@meetflowai.site`; muốn gửi từ `@meetflowai.io.vn` phải verify domain mới trên Resend (thêm bản ghi SPF/DKIM).
- **Chứng chỉ**: Caddy + Cloudflare proxy đã chạy tốt ở `.site`; `.io.vn` làm y hệt.

## 6. Lộ trình

- **P0**: nối NS → landing tiếng Việt + alias `app`/`console` trỏ node-2.
- **P1**: alias `api` + verify email domain (nếu muốn gửi mail từ `.io.vn`).
- **P2**: nếu chuyển canonical sang `.io.vn` → cập nhật base URL app + 301 từ `.site`.

## 7. Cần anh chốt

1. Mục đích chính: **(a)** thương hiệu Việt, **(b)** tách thị trường, hay **(c)** dự phòng?
2. Có đổi **canonical** (app dùng domain nào chính) không, hay `.site` vẫn chính và `.io.vn` chỉ là alias?
3. Nhà đăng ký `.io.vn` là ai (để em hướng dẫn đổi NS từng bước)?
