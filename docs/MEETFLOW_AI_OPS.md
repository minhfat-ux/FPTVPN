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

## 3b. Trang quản lý user (admin → tab "AI Users")

Mở `https://api.meetflowai.site/admin` → dán **Admin Bearer Token** → tab **AI Users**.

### Dashboard hiển thị gì

| Thẻ | Ý nghĩa |
|---|---|
| Tổng user biết được | Số email hệ thống đã thấy (registry + Firebase + đơn hàng) |
| Pro đang hoạt động | Gồm cả gói trọn đời |
| Sắp hết hạn (<=7 ngày) | Đúng nhóm mà job nhắc gia hạn sẽ email tới |
| Đã hết hạn / Chưa có Pro | Phân loại phần còn lại |
| User mới 30 ngày | Theo ngày đăng ký (Firebase) hoặc ngày biết tới đầu tiên |
| Khách đã trả tiền | Số user có ít nhất 1 đơn đã xác nhận + số đơn |
| Doanh thu Pro (web) | Tổng tiền các đơn đã xác nhận, theo giá gói lúc mua |
| Tài khoản Firebase | Số tài khoản đọc được từ Firebase Authentication |

Kèm 2 biểu đồ: doanh thu 6 tháng và user mới theo tháng.

### Ba nguồn dữ liệu được gộp lại (khoá là email)

1. **Firebase Authentication** — tài khoản đăng ký thật của app MeetFlow AI
   (ngày tạo, đăng nhập cuối, cách đăng nhập, đã xác thực email chưa, có bị khoá không).
2. **Entitlement Pro** (`data/ai-access.json`) — ai đang có Pro, gói gì, hết hạn khi nào, lịch sử cấp.
3. **Đơn hàng** (pending + paid) — đã trả bao nhiêu, phương thức nào, đơn nào còn chờ xác nhận.
4. **Registry nội bộ** (`data/ai-users.json`) — email mà app/trang mua đã liên hệ, kể cả chưa trả tiền.
   Được ghi tự động mỗi lần app gọi `/v1/ai/entitlement`, mỗi lần tạo đơn, mỗi lần admin cấp/thu hồi.

### Firebase — trạng thái & cách thay key

Đã kết nối project **meetflowai-82dee** (service account `firebase-adminsdk-fbsvc`).
Key nằm ở `/root/flowvpn-cp/data/firebase-admin.json`, quyền `0600` root, và
**không** được expose qua HTTP (đã kiểm tra: `/data/…`, `/assets/…` đều 401/404).

Cách thay key mới (khi key cũ hết hạn hoặc bị thu hồi):

1. Firebase Console → ⚙️ **Project settings** → **Service accounts** → **Generate new private key**.
2. Dán toàn bộ nội dung file JSON vào khung **"Kết nối Firebase"** trong tab AI Users → **Lưu & kiểm tra**.
   (Hoặc copy lên VPS: `scp <key>.json root@103.173.155.50:/root/flowvpn-cp/data/firebase-admin.json`
   rồi `chmod 600`.)
3. Nếu key sai/không hợp lệ, khung đó hiện **đúng thông báo lỗi của Google**
   (ví dụ `invalid_grant: account not found` = service account đã bị xoá).

- Hoặc dùng biến môi trường `FIREBASE_SERVICE_ACCOUNT_JSON` (inline) /
  `FIREBASE_SERVICE_ACCOUNT_FILE` (đường dẫn) trong systemd drop-in, khi đó không cần file.
- Bấm **Xoá key đã lưu** để thu hồi quyền truy cập của control plane bất cứ lúc nào.
- Danh sách Firebase được cache 60 giây (lỗi chỉ cache 5 giây để sửa key là ăn ngay).

Lưu ý về con số: **app Android/iOS đăng nhập Firebase ẩn danh** (anonymous) nên phần lớn
tài khoản không có email. Những tài khoản đó vẫn nằm trong bảng Firebase (hiện `(không có email)`)
nhưng không thành dòng trong bảng gộp, vì bảng gộp khoá theo email. Số ẩn danh được ghi rõ
trong khung trạng thái ở đầu tab.

### Hành động trên từng user

| Nút | Việc xảy ra |
|---|---|
| Chi tiết | Xem gói, hạn, số lần cấp Pro, đơn hàng, lịch sử cấp/thu hồi, nguồn dữ liệu |
| +30 ngày / +1 năm | Cấp thêm Pro (cộng dồn từ hạn hiện tại, không phải từ hôm nay) |
| Cấp 30 ngày + gửi email | Như trên, kèm email hoá đơn (dùng khi khách trả tiền ngoài luồng QR) |
| Thu hồi | Kết thúc Pro ngay, vẫn giữ lịch sử để đối chiếu |
| Khoá / Mở khoá tài khoản | `disabled` bên Firebase (chặn đăng nhập) |
| Reset mật khẩu | Trả về link đặt lại mật khẩu để gửi cho khách |
| Xoá (bảng Firebase) | Xoá hẳn tài khoản Firebase |
| Xoá khỏi danh sách theo dõi | Chỉ xoá registry nội bộ, không ảnh hưởng Firebase/đơn hàng |

Lọc: tìm theo email (gõ là lọc ngay), theo trạng thái Pro, theo nguồn, sắp xếp, số dòng.
**Export CSV** xuất đúng tập đang lọc (mở được bằng Excel/Google Sheets).

### API tương ứng (đều cần Bearer token admin)

```
GET    /v1/admin/ai/users?q=&status=&source=&sort=&limit=&offset=
GET    /v1/admin/ai/users.csv?<cùng tham số>
GET    /v1/admin/ai/users/:email
POST   /v1/admin/ai/users/:email/grant     { plan?, days?, notify?, note? }
POST   /v1/admin/ai/users/:email/revoke    { reason? }
POST   /v1/admin/ai/users/:email/forget
GET    /v1/admin/ai/firebase
POST   /v1/admin/ai/firebase/credentials   { json }
DELETE /v1/admin/ai/firebase/credentials
POST   /v1/admin/ai/firebase/users/:uid/disable          { disabled }
DELETE /v1/admin/ai/firebase/users/:uid
POST   /v1/admin/ai/firebase/users/:uid/password-reset   { email }
```

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
