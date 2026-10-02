# HANDOFF → harness Windows: VPNFlow — CHẶN email giả + BẮT BUỘC verify email mới cho đăng ký

- **Từ:** harness Mac (main agent) · **Cho:** **harness Windows** (owner `control-plane/**`)
- **Ngày:** 02/10/2026 · **Chủ dự án chốt trong phiên:** *"kiểm tra email nếu không có thật thì không cho
  đăng ký — ví dụ `x@y.z` ⇒ cần user verification từ email thật xong mới cho đăng ký"*, áp cho **VPNFlow**.
- **Đảo quyết định cũ:** handoff `HANDOFF_BUY_EMAIL_GATE_2026-09-26.md` §1 ghi *"mức đăng ký = CHỈ cần email
  (KHÔNG OTP)"*. Nay chủ dự án yêu cầu **có OTP/verify** trước khi coi là đã đăng ký.

## 1. Hiện trạng (đọc code 02/10, bản trên node-2)
| Chỗ | Đang làm gì | Vấn đề |
|---|---|---|
| `POST /v1/buy/lead` (`index.js` ~789) | chỉ khớp `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | **`x@y.z` LỌT** (TLD 1 ký tự) · không kiểm domain tồn tại · không verify ⇒ lead rác vào thẳng `data/leads.json` và hiện nút tải/cho đặt đơn |
| `POST /v1/payments/create` | nhận email từ lead | không đòi email đã verify ⇒ **đặt đơn được bằng email rác** |
| `POST /v1/auth/email/start` + `/verify` (`auth-store.startEmailLogin`/`verifyEmailLogin`) | gửi **mã 6 số**, chỉ `findOrCreateUser` **sau khi** nhập đúng mã | ✅ đường này ĐÚNG — dùng lại được |
| Không có utility DNS/MX | — | cần thêm |

## 2. Việc cần sửa (WIN)
### 2.1 Kiểm email "có thật" (dùng chung cho mọi route nhận email)
1. **Cú pháp chặt** (thay regex hiện tại):
   - local ≤ 64 ký tự, tổng ≤ 254; đúng 1 dấu `@`; không khoảng trắng; không bắt đầu/kết thúc bằng `.`;
     không có `..`; nhãn domain không rỗng, không bắt đầu/kết thúc bằng `-`.
   - **TLD ≥ 2 ký tự và chỉ chữ cái** ⇒ `x@y.z`, `a@b.1` bị loại.
2. **Kiểm DNS**: tra **MX** của domain; không có MX thì thử **A/AAAA**; cả hai đều không có ⇒ từ chối.
   - Cache theo domain (ví dụ 10 phút) để không tra mỗi request; timeout ≤ 2s; lỗi mạng ⇒ coi là KHÔNG kiểm được
     và trả `503`/`retry` (KHÔNG im lặng cho qua).
3. **Danh sách domain rác/dùng-một-lần** (blocklist tối thiểu) — tuỳ chọn, nên có.
4. Chuẩn hoá trước khi kiểm: `trim`, lowercase, bỏ dấu chấm cuối domain.

### 2.2 Bắt buộc verify trước khi cho "đăng ký"
- Luồng mới cho trang `/buy`: **nhập email → gửi mã 6 số → nhập mã → mới hiện nút tải + cho tạo đơn**.
  Dùng lại `startEmailLogin`/`verifyEmailLogin` (hoặc tách hàm dùng chung) thay vì viết mới.
- Lưu trạng thái đã verify cho email (ví dụ `data/auth.json → verifiedEmails[email] = { at, ip }`) +
  phiên lead có TTL **24h** (cookie/token) để khách quay lại không phải verify lại.
- **Chặn cứng**: `POST /v1/payments/create` trả `400 email_not_verified` nếu email chưa verify.
- Giữ rate-limit hiện có và thêm: 5 mã/giờ/email, cooldown 60s giữa 2 lần gửi, 5 request/phút/IP.
- Lead cũ trong `data/leads.json` (43 email, phần lớn là test) coi như **chưa verify** — không tự động
  chuyển thành tài khoản.

## 3. Nghiệm thu (Mac sẽ kiểm lại, cần bằng chứng lệnh)
1. `POST /v1/buy/lead {"email":"x@y.z"}` ⇒ **400 `invalid_email`**, KHÔNG ghi `leads.json`, KHÔNG hiện nút tải.
2. `{"email":"a@domain-khong-ton-tai-123456.vn"}` ⇒ **400 `invalid_email_domain`** (MX/A fail).
3. Email thật ⇒ gửi mã; khi **chưa** nhập mã: `POST /v1/payments/create` ⇒ **400 `email_not_verified`**;
   nhập đúng mã ⇒ tải được + tạo đơn được.
4. Không có user/tài khoản nào được tạo trước khi verify (kiểm `auth.json` không tăng `users`).
5. Rate-limit vẫn đúng; log KHÔNG chứa mã/token.
6. Không hồi quy: 20 user VPNFlow hiện có (tạo qua OTP) vẫn đăng nhập bình thường.

## 4. Ghi chú
- Đây là việc **control-plane (vùng bảo vệ WIN)** — Mac chỉ soạn brief, không sửa.
- Độc lập với đợt "bắt buộc đăng ký email" của MeetFlow AI, nhưng **cùng tinh thần**: chỉ coi là tài khoản
  khi email đã được xác thực thật.
