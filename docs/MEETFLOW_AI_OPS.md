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

## 3c. Gói mua qua Google Play / App Store

### Vì sao cần phần này

Giao dịch mua trong app **không đi qua server mình**: Play Billing và StoreKit trả quyền
ngay trên máy. Nên trước đây khách trả tiền qua Google Play vẫn hiện là "chưa thấy gói"
trong dashboard, và doanh thu Play không ai thấy. Firebase cũng chỉ có danh tính, không có
thông tin mua hàng.

### Luồng hoạt động (bản Android 1.0.3 trở lên)

```
App mua/khôi phục (Play Billing)
   └─ POST /v1/ai/store/purchase  { productId, purchaseToken, uid, email?, orderId, appVersion }
         └─ server xác thực bằng Google Play Developer API
               ├─ hợp lệ + còn hiệu lực + có email  → cấp Pro (productId play.<productId>) + ghi vào dashboard
               ├─ hợp lệ nhưng không có email        → lưu giao dịch (hiện ở bảng Play, chưa cấp Pro)
               └─ chưa có key / lỗi                  → lưu ở trạng thái "chưa xác thực" (không tính là Pro)
```

- App **chỉ báo**, không tự quyết định: một giao dịch chỉ thành Pro khi Google xác nhận.
  Nhờ vậy không ai giả mạo được token để lấy Pro.
- Báo lại nhiều lần không sao: mỗi token là một dòng, báo lại chỉ cập nhật hạn/trạng thái.
- App còn set `obfuscatedAccountId = Firebase uid` khi mở luồng mua, để Google trả về uid
  trong kết quả xác thực — có thể ghép giao dịch với tài khoản kể cả khi app báo hụt.

### Cấu hình Google Play (một lần)

1. **Google Cloud Console** (project `meetflowai-82dee` hoặc project riêng):
   - Bật **Google Play Android Developer API**.
   - IAM → **Service accounts** → tạo service account → **Keys → Add key → JSON** → tải file.
2. **Play Console** → **Users and permissions** → **Invite new users** → dán email service account
   (`...@....iam.gserviceaccount.com`) → cấp quyền **View financial data** (hoặc *Manage orders*)
   cho app MeetFlow AI → gửi lời mời.
3. Dán nội dung file JSON vào khung **"Kết nối Google Play"** trong tab AI Users → **Lưu key Play**.
   - File lưu ở `/root/flowvpn-cp/data/play-admin.json` (quyền `0600`), **không** gửi ngược lại trình duyệt.
   - Hoặc dùng env `PLAY_SERVICE_ACCOUNT_JSON` / `PLAY_SERVICE_ACCOUNT_FILE`, và `PLAY_PACKAGE_NAME`
     (mặc định `com.meetflow.translator`).
4. Nếu chưa làm bước 2 (chưa invite), API trả `401/403` — khung Play sẽ hiện đúng thông báo lỗi đó.

Sau khi có key, các giao dịch đã lưu ở trạng thái "chưa xác thực" có thể bấm **Xác thực lại**
từng dòng, hoặc chỉ cần khách mở app (app báo lại) là tự xác thực.

### API

```
POST   /v1/ai/store/purchase                      (public, app gọi; giới hạn 40 lần/giờ/IP)
GET    /v1/admin/ai/store/purchases               (danh sách + tổng hợp + trạng thái key Play)
POST   /v1/admin/ai/store/purchases/:tokenId/verify
POST   /v1/admin/ai/store/purchases/:tokenId/forget
POST   /v1/admin/ai/store/credentials             { json }   dán service account Play
DELETE /v1/admin/ai/store/credentials             xoá key đã lưu
```

### Giới hạn cần biết

- **App Store (iOS) chưa hỗ trợ**: bản iOS chưa báo giao dịch về server, nên khách mua qua
  App Store vẫn hiện "chưa thấy gói". Muốn làm cần: app set `appAccountToken` + gửi
  `transactionId` về server, và/hoặc bật App Store Server Notifications V2 (cần key In-App Purchase `.p8`).
- Khách mua **ẩn danh** (không nhập email) chỉ hiện trong bảng Play với uid, không thành dòng
  trong bảng user (bảng user khoá theo email). Khi đó dùng nút **Cấp 30 ngày** kèm email khách đọc cho support.
- Doanh thu trong bảng Play chỉ là số ghi nhận từ giá Play trả về ở thời điểm mua; số liệu
  đối soát chính thức vẫn lấy từ Play Console (**Financial reports**).

## 3d. Nhắc xác thực email

Tài khoản đăng ký bằng email/mật khẩu trong Firebase bắt đầu ở trạng thái **chưa xác thực**.
Những tài khoản này nếu quên mật khẩu thì không có đường vào lại, và cũng không nhận được
email đặt lại mật khẩu. Vì app đăng nhập ẩn danh, chỉ control plane phát hiện và nhắc được.

### Tự động

Job chạy **mỗi 6 giờ** (lần đầu sau khi service khởi động 150 giây):

- Chỉ gửi cho tài khoản **có email, chưa xác thực, không bị khoá**, và **tạo cách đây trên 24 giờ**.
- **Cách nhau 7 ngày**, tối đa **3 lần** cho mỗi email (đếm trong `data/ai-users.json`).
- Ngôn ngữ: theo ngôn ngữ đã lưu của email → theo domain (qq/163/126/sina/foxmail/aliyun/yeah → tiếng Trung) → còn lại tiếng Việt.
- Tắt job: `Environment=VERIFY_REMINDERS=0` trong systemd drop-in.
- Tinh chỉnh: `VERIFY_REMINDER_INTERVAL_MS`, `VERIFY_REMINDER_MIN_AGE_MS`,
  `VERIFY_REMINDER_SPACING_MS`, `VERIFY_REMINDER_MAX`, `VERIFY_LINK_TTL_DAYS`.

Log kiểm tra:

```bash
journalctl -u flowvpn-cp --no-pager | grep -E "verify-email|verify-reminder"
# verify-email: to=a@b.com lang=vi reason=scheduled sent=true reminder#1
# verify-reminder run: sent=1 skipped=2
```

### Gửi tay trên dashboard

Tab **AI Users** → mục *Tài khoản Firebase Auth*:

- Mỗi dòng chưa xác thực có nút **Gửi email xác thực**.
- Nút **📧 Gửi email xác thực cho tất cả (chưa xác thực)** gửi một lượt cho mọi tài khoản
  chưa xác thực (vẫn tôn trọng khoảng cách 7 ngày / tối đa 3 lần).
- Trong panel chi tiết user cũng có nút gửi.
- Thẻ KPI **"Chưa xác thực email"** cho biết còn bao nhiêu tài khoản.

### Link xác thực hoạt động thế nào

```
Email của mình  →  https://api.meetflowai.site/v1/ai/verify-email/confirm?t=<token ký HMAC>
                     └─ token hạn 30 ngày, ký bằng VERIFY_LINK_SECRET (mặc định AUTH_TOKEN)
                     └─ server xin Firebase link xác thực MỚI rồi 302 sang đó
                          └─ Firebase xác thực email → emailVerified = true (dashboard cập nhật sau ~60 giây)
```

Vì sao không gửi thẳng link Firebase: link Firebase **hết hạn rất nhanh** và Firebase chặn
`continueUrl` nếu domain chưa được allowlist (`auth/unauthorized-continue-uri`). Link của mình
sống 30 ngày và sinh link Firebase mới ngay lúc khách bấm.

### API

```
GET  /v1/ai/verify-email/confirm?t=…                        (public, link trong email)
POST /v1/admin/ai/firebase/users/:uid/verify-email          { email, force? }  gửi 1 tài khoản
POST /v1/admin/ai/verify-email/remind                       { force? }         gửi tất cả chưa xác thực
```

Trả về `reason` khi không gửi: `too-soon` (vừa nhắc trong 7 ngày), `max-reminders` (đã 3 lần),
`delivery-failed`, `error`. `force: true` bỏ qua khoảng cách và giới hạn (dùng khi khách xin lại).

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
