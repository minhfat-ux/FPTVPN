# MeetFlow AI — vận hành web purchase, cập nhật app & email

Tài liệu này ghi lại toàn bộ phần đã triển khai cho **MeetFlow AI Pro bán trên web**
(Android sideload) và các việc vận hành định kỳ.

## 1. Trang bán hàng

| Mục | Giá trị |
|---|---|
| Trang buy | `https://meetflowai.site/ai/buy` (hoặc `…/api.meetflowai.site/ai/buy`) |
| Hướng dẫn kích hoạt | `https://meetflowai.site/ai/guide` |
| Gói | 30 ngày **150.000đ** (mua một lần, **không tự gia hạn**) · Monthly 130.000đ · Yearly 1.050.000đ |
| Phương thức | QR ngân hàng (TPBank, có sẵn số tiền) · MoMo (QR động, có sẵn số tiền) · WeChat Pay · Alipay |
| Ngôn ngữ | vi / en / zh / ja / ko (có bộ chuyển ngay trên trang) |

Phương thức nào **chưa cấu hình sẽ tự ẩn** (PayOS ẩn khi chưa có credentials; WeChat/Alipay/MoMo
ẩn khi thiếu ảnh QR) — khách không bao giờ bấm vào nút chết.

## 2. Kích hoạt Pro cho khách

1. Khách mua trên web → hệ thống ghi đơn + gửi email báo cho chủ shop (có link xác nhận 1-click).
2. Xác nhận đã nhận tiền — 3 cách:
   - Bấm nút trong email báo đơn,
   - Trang admin → tab **MeetFlow AI** → *Xác nhận đã nhận tiền*,
   - API: `POST /v1/admin/ai/payments/:orderCode/confirm` (Bearer AUTH_TOKEN).
3. Hệ thống cấp Pro cho email đó + gửi hoá đơn (theo **đúng ngôn ngữ khách đã dùng**).

App đọc quyền tại `GET /v1/ai/entitlement?email=…`:
```json
{ "active": true, "plan": "monthly", "expires_at": "2026-10-10T08:38:33Z", "lifetime": false }
```
Khách vào app → màn hình nâng cấp → **“Đã mua trên web?”** → nhập email → **Kích hoạt Pro**.

## 3. Gia hạn

QR/chuyển khoản **không thể tự trích tiền** (không có uỷ quyền). Vì vậy:
- Job chạy mỗi 6h gửi email nhắc trước **7 / 3 / 1 ngày** (mỗi mốc 1 lần, không lặp).
- Email có **link gia hạn 1 chạm**: `…/ai/buy?lang=&email=&plan=` → trang mở sẵn email + gói,
  khách chỉ chọn cách thanh toán rồi quét QR.
- Thời hạn **cộng dồn**: mua thêm khi còn hạn thì cộng tiếp vào ngày hết hạn cũ.
- Muốn tự trích tiền thật → phải dùng gateway thu định kỳ (MoMo Business / VNPAY Token /
  2C2P / OnePay) hoặc uỷ nhiệm chi ngân hàng + webhook Casso/SePay.

## 4. Phát hành bản Android mới (bắt buộc cập nhật)

```bash
# 1) tăng versionCode/versionName trong android/app/build.gradle.kts (vd 3 -> 4)
# 2) build + upload
gradle :app:assembleRelease
scp app/build/outputs/apk/release/app-release.apk root@VPS:/root/flowvpn-apk/MeetFlowAI-latest.apk

# 3) báo phiên bản cho app (không cần build lại server)
curl -X PATCH https://api.meetflowai.site/v1/admin/ai/app-version \
  -H "Authorization: Bearer $AUTH_TOKEN" -H 'Content-Type: application/json' \
  -d '{"latest_version_code":4,"minimum_version_code":4,"latest_version_name":"1.0.3",
       "notes":"Ban 1.0.3: ..."}'
```

- `minimum_version_code` = bản mới → **bắt buộc**: app cũ bị chặn ở màn hình "Cần cập nhật",
  khách bấm *Tải bản cập nhật* để tải APK và cài lại.
- Giữ `minimum_version_code` **thấp hơn** `latest_version_code` → chỉ nhắc nhẹ, khách chọn “Để sau”.
- App tự kiểm tra lại khi quay về foreground nên màn hình chặn tự mất sau khi cài xong.
- Xem giá trị đang phát: `GET /v1/ai/app-version` (công khai).

## 5. Cấu hình thanh toán trên VPS (systemd drop-in)

`/etc/systemd/system/flowvpn-cp.service.d/store-urls.conf`:
```
Environment=BANK_QR_ACCOUNT=…        # QR ngân hàng (VietQR)
Environment=BANK_QR_NAME=…
Environment=MOMO_QR_BIN=971025       # MoMo theo chuẩn VietQR (QR động có số tiền)
Environment=MOMO_QR_ACCOUNT=…
Environment=MOMO_QR_DYNAMIC=0        # =0 để quay về ảnh QR tĩnh nếu MoMo không nhận
Environment=PAY_QR_DIR=/root/flowvpn-pay   # chứa wechat.png / alipay.png / momo.png
Environment=APP_STORE_URL_MEETFLOW_AI=…    # nút iOS trên trang buy
Environment=TESTFLIGHT_URL_IOS=…           # dùng khi app chưa lên App Store
Environment=PUBLIC_SITE_URL=https://meetflowai.site   # domain hiển thị trong email
```
Sau khi sửa: `systemctl daemon-reload && systemctl restart flowvpn-cp`.

## 6. Email — chống vào Junk (QUAN TRỌNG)

Hiện trạng DNS của `meetflowai.site`:
- SPF: `v=spf1 include:spf.maychuemail.com ~all` ✅
- DMARC: `v=DMARC1; p=none` ✅
- **DKIM: chưa có** ❌ ← nguyên nhân chính khiến Hotmail/Outlook đẩy thư vào Junk

Việc cần làm (một lần, phía nhà cung cấp mail):
1. Vào trang quản trị mail (maychuemail.com / Mắt Bão) → bật **DKIM** cho `meetflowai.site`.
2. Copy bản ghi TXT mà họ cung cấp (dạng `xxx._domainkey.meetflowai.site`) → thêm vào DNS.
3. Kiểm tra: `dig +short TXT xxx._domainkey.meetflowai.site` phải trả về khoá công khai.
4. Gửi thử tới Gmail/Hotmail, kiểm tra header `Authentication-Results: dkim=pass`.

Đã tối ưu sẵn trong code: có bản `text/plain` cho mọi email, `Reply-To: support@meetflowai.site`,
From đúng thương hiệu theo sản phẩm, link dùng domain đẹp `meetflowai.site`.
Log gửi thư ghi rõ `accepted=…`, `messageId=…`, `mailSent=true/false` để chẩn đoán nhanh.

## 7. Kiểm tra nhanh hệ thống

```bash
curl -s https://api.meetflowai.site/v1/ai/app-version            # phiên bản Android đang phát
curl -s "https://api.meetflowai.site/v1/ai/entitlement?email=X"  # quyền Pro của 1 email
curl -sI https://meetflowai.site/v1/ai/downloads/android         # APK
curl -s "$TOKEN" https://api.meetflowai.site/v1/admin/ai/payments/pending
```
