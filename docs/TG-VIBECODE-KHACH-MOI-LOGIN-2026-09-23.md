# KHÁCH MỚI báo "không thể kết nối tới máy chủ VPNFlow khi gọi email login" — kết quả kiểm tra

> Người làm: harness **WIN** · task sổ: **`T-20260923-07`** (owner → win, bus **#373** lúc 2026-09-23T15:09:17Z)
> Yêu cầu (Telegram): *"KHÁCH MỚI, LỖI BÁO KHÔNG THỂ kết nối đến máy chủ vpnflow khi gọi email login. Kiểm tra gấp."*
> Kiểm tra lúc 2026-09-23 15:10–15:25Z (22:10–22:25 giờ VN).

## 1. Kết luận ngắn

**Máy chủ VPNFlow KHÔNG có lỗi tại thời điểm kiểm tra.** Câu báo lỗi của khách là lỗi
**transport phía máy khách** (không nhận được phản hồi HTTP nào), không phải máy chủ trả lỗi:

| Lớp | Kết quả đo thật |
|---|---|
| `GET /v1/health` | 200 `{"status":"ok"}` trên **cả** `api.meetflowai.site` và `t1.meetflowai.site`, 15/15 lượt × 2 vantage (Windows + node-2) = **100%** |
| Đăng nhập email end-to-end | `POST /v1/auth/email/start` → **202** + `debug_code`; `POST /v1/auth/email/verify` → **201** + `access_token` (cả host chính lẫn host dự phòng) |
| Gửi OTP | Resend gửi được (`[otp] sent … via resend`), hôm nay 23 lượt gửi OK; **không** có `sendOtpEmail failed` nào cho email thật |
| Đường từ Trung Quốc đại lục | `api.meetflowai.site/v1/health` **200** × 3 lượt; `t1` **200**; funnel **200** (node apihz `type=1`) |
| Tài khoản khách mới | đã tạo + cấp 30 ngày premium; OTP gửi **thành công** 14:54:09Z; **0 device** ⇒ app chưa từng vượt qua bước đăng nhập |
| Guard tự động | đã gửi mail hướng dẫn cài cho khách lúc 15:17:26Z |

⇒ Việc còn lại **không nằm ở server**: cần 3 thông tin từ khách (mục §5) và 2 phép thử 30 giây (§6).

## 2. Câu lỗi của khách đến từ đâu (đối chiếu code, không phỏng đoán)

- Chuỗi chỉ tồn tại trong **client Windows**: `windows/PrivateVPNWindows.Core/Api/ApiExceptions.cs:50`
  → `ApiTransportException`: *"Không thể kết nối tới máy chủ VPNFlow khi gọi {endpoint}. Vui lòng thử lại."*
- `endpoint` = `"email login"` được truyền từ `ControlApiClient.StartEmailLoginAsync()`
  (`…/Api/ControlApiClient.cs`, gọi `v1/auth/email/start`) ⇒ câu khách thấy khớp **chính xác** với
  `POST /v1/auth/email/start` **không nhận được phản hồi HTTP**.
- `ApiTransportException` **không** phải lỗi HTTP: 4xx/5xx đi đường `ApiServerException` (hiện message
  của server). Nghĩa là gói tin **không tới được** (DNS hỏng / IP-SNI bị chặn / proxy chặn / mất route),
  chứ không phải máy chủ từ chối.
- Client tự thử lần lượt 3 host (`ControlApiHosts.FallbackBaseUrls`) khi gặp lỗi mạng:
  `https://api.meetflowai.site` → `https://t1.meetflowai.site` → `https://fcnvpn.tail303be3.ts.net`,
  mỗi host tối đa ~6 s, có DoH 1.1.1.1 chống DNS giả (Clash fake-IP). Bản **1.4.6** đã có đủ 3 lớp này
  (đã kiểm trong tag `windows-v1.4.6`); `1.4.5` cũng có.

## 3. Bằng chứng đo trên máy chủ

```text
# WIN (Windows) — node ops/_scratch/verify-email-login.mjs
[health]      GET  https://api.meetflowai.site/v1/health              -> 200 {"status":"ok"}
[email/start] POST https://api.meetflowai.site/v1/auth/email/start    -> 202 {"ok":true,"debug_code":"246810"}
[email/verify]POST https://api.meetflowai.site/v1/auth/email/verify   -> 201 access_token + user
[fallback]    POST https://t1.meetflowai.site/v1/auth/email/start     -> 202
== KET LUAN: PASS ==

# node-2 (165.101.114.162) — node ops/_scratch/stability-login-hosts.mjs 15
https://api.meetflowai.site/v1/health  OK 15/15 (100%)  p50=153ms
https://t1.meetflowai.site/v1/health   OK 15/15 (100%)  p50=164ms
http://127.0.0.1:7778/v1/health        OK 15/15 (100%)  p50=6ms   (origin truc tiep)

# Trung Quoc dai luc (apihz type=1, 3 luot)
api.meetflowai.site/v1/health              -> 200 / 200 / 200
api.meetflowai.site/v1/auth/email/start    -> 404 / 404 / 404   (GET tren route POST = dung)
api.meetflowai.site/v1/app-version?platform=windows -> 200 / 200 / 200
t1.meetflowai.site/v1/health               -> 200
fcnvpn.tail303be3.ts.net/v1/health         -> 200
```

Dịch vụ trên node-2: `flowvpn-cp` **active**, `/v1/health` OK, `mail transport=resend`; hôm nay service
chỉ restart 3 lần (10:20, 11:41, 17:47 giờ VN) — **không** có lần nào quanh 22:09 giờ VN (15:09Z) khi
khách báo lỗi.

**Một lưu ý để không tự lừa mình:** lúc 15:11:13Z log có `sendOtpEmail failed` — đó là **probe của WIN**
dùng `probe.win@example.com`, bị Resend từ chối domain `example.com`. **Không phải** khách.

## 4. Khách mới: `jeffwangzhulux@gmail.com`

| Mốc | Sự kiện |
|---|---|
| 14:53:37Z | admin tạo tài khoản + cấp 30 ngày premium (`auth.json: users`) |
| 14:54:08Z | có bản ghi OTP (hết hạn 15:04:08Z) |
| 14:54:09Z | `[otp] sent to jeffwangzhulux@gmail.com via resend id=01a0cec2-…` ⇒ **máy chủ có nhận request và gửi được mail** |
| 15:09:17Z | owner báo lỗi qua Telegram |
| 15:17:26Z | `flowvpn-guard` đã gửi mail hướng dẫn cài (`audit.jsonl`), phân loại `never_installed` |
| — | **0 device** trong `devices.json` cho user `6c874fba-…` ⇒ app **chưa từng** đăng ký thiết bị = chưa qua được đăng nhập |

Chi tiết "0 device" khớp với câu owner nói: khách mở app, bấm đăng nhập bằng email, app báo không kết nối.

## 5. Cần khách cung cấp (3 câu)

1. **Nền tảng + phiên bản app** (Windows: menu/About; cần xem có phải ≥ 1.4.6 không).
2. **Ảnh chụp câu lỗi đầy đủ** (câu này có kèm `endpoint`, ví dụ "khi gọi email login").
3. **Khách đang ở đâu / dùng mạng gì**, và máy có đang bật **Clash / v2rayN / proxy / VPN khác** không.

## 6. Hai phép thử 30 giây gửi thẳng cho khách

1. Mở **trên chính máy đó**, bằng trình duyệt:
   - `https://api.meetflowai.site/v1/health` → phải thấy `{"status":"ok"}`
   - `https://t1.meetflowai.site/v1/health` → phải thấy `{"status":"ok"}`
   - **Nếu cả hai cũng không mở được** ⇒ mạng/DNS của khách đang chặn (không phải lỗi app, không phải lỗi server).
   - **Nếu mở được mà app vẫn báo lỗi** ⇒ gửi WIN phiên bản app + log để soi tiếp.
2. **Tắt hết proxy/VPN khác** (Clash/v2rayN ở chế độ TUN + fake-IP chính là thủ phạm đã biết), đổi DNS
   sang `8.8.8.8` / `1.1.1.1` (hoặc bật DoH), rồi thử lại; nếu vẫn lỗi thì thử qua **hotspot 4G** để loại
   mạng LAN/ISP.

## 7. Việc đã làm thay khách (không cần khách làm gì)

- Tài khoản đã có + **premium 30 ngày**; OTP gửi được tới hộp thư (nếu khách không thấy: kiểm Spam/Quảng cáo).
- `flowvpn-guard` đã tự gửi **mail hướng dẫn cài đúng nền tảng + đúng phiên bản đang phát** cho khách (15:17:26Z).
- Bản Windows đang phát là **1.4.6** (`/v1/app-version?platform=windows` → `1.4.6`, link `t1.meetflowai.site/dl/VPNFlow-Setup-1.4.6.exe`),
  có đủ DoH + 3 lớp host dự phòng.

## 8. Việc KHÔNG phải nguyên nhân (đã loại trừ)

- Không phải mailer/Resend: 23 lượt OTP gửi OK hôm nay, không có lỗi gửi cho email thật.
- Không phải service chết/restart: `flowvpn-cp` active, không restart quanh 15:09Z; health 100%.
- Không phải Cloudflare chặn WAF: token Cloudflare hiện có **không** có quyền đọc analytics
  (`zone.analytics.read`) nên **chưa** đọc được log WAF — đây là điểm chưa kiểm chứng được, không phải
  bằng chứng "không có chặn". Caddy trên node-2 **không bật access log** nên không truy được request của khách.
- Không phải bản 1.4.6 làm hỏng login: `git diff windows-v1.4.5 windows-v1.4.6 -- windows/` chỉ đụng
  `Tunnel/SingBoxConfigBuilder.cs` (+ tests), **không** đụng `Api/`.

## 9. Điểm chưa chắc / cần theo dõi

1. **Chưa xác định được mạng của khách** (quốc gia/ISP) ⇒ chưa kết luận được là do DNS giả, SNI hay proxy.
2. **Không có access log ở tầng Caddy** và token Cloudflare thiếu quyền analytics ⇒ mất khả năng truy
   vết "request của khách có tới edge hay không". Đề xuất: bật access log Caddy cho `api.meetflowai.site`
   (ghi file, xoay vòng) — rẻ và sẽ trả lời được câu này trong 1 phút cho mọi ca sau.
3. **File lớn (>50 MB) từ Trung Quốc vẫn timeout** (`VPNFlow-Setup-1.4.6.exe` đo từ node TQ = 0 byte/15 s).
   Đây là lỗi **riêng, đã biết** (xem `docs/TG-VIBECODE-BUY-LINKS-CHINA.md`), nhưng nếu khách này ở TQ thì
   khả năng cao khách **tải bộ cài rất chậm/treo** — cần mirror cho TQ.
4. Client Windows hiện chỉ báo "không kết nối tới máy chủ" chung chung, **không nói host nào fail** và
   không gợi ý xử lý ⇒ khó chẩn đoán từ xa. Nên thêm mã lỗi ngắn hiển thị trên UI (ví dụ `NET-01 <host>`).

## 10. Lệnh tái lập (bên giao chạy được)

```bash
node ops/_scratch/verify-email-login.mjs            # e2e email login tren production -> PASS
node ops/_scratch/stability-login-hosts.mjs 15      # do do on dinh 2 host
node ops/_scratch/check-china-login.mjs             # do tu TQ/HK/My qua apihz
ssh root@165.101.114.162 'journalctl -u flowvpn-cp --since "2026-09-23 22:00" --no-pager | grep -i otp'
```
