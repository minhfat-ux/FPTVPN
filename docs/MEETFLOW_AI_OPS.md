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

### Quy đổi CNY cho WeChat Pay / Alipay

WeChat và Alipay dùng **QR cá nhân tĩnh** (không nhúng được số tiền), khách phải tự nhập số tiền.
Vì vậy trang buy hiển thị thêm **giá quy đổi sang ¥** cho hai phương thức này:

- Chọn WeChat/Alipay → mỗi gói hiện thêm `≈ ¥39`, kèm khung ghi chú tỷ giá.
- Popup QR hiện số tiền **¥ to** (kèm dòng nhỏ "≈ 150.000 đ · 1 CNY ≈ 3.876 đ"), và nút
  **Sao chép số tiền** copy **số ¥** (không phải VND) để khách dán vào WeChat/Alipay.
- Đổi lại sang chuyển khoản ngân hàng / MoMo → trở về hiển thị VND như cũ.
- Email báo đơn cho chủ shop cũng ghi thêm dòng **Quy đổi CNY: ¥X** để biết cần đối chiếu bao nhiêu.

### Giá được chốt theo từng đơn

Khi khách bấm tạo mã thanh toán, **giá của gói được ghi vào đơn** (`pendingPayments[].amount`).
Lúc xác nhận (nút admin / link trong email / webhook PayOS), hoá đơn và quyền lợi dùng **đúng giá
đã ghi trong đơn**, không dùng giá hiện tại — nên **đổi giá không làm sai hoá đơn của đơn cũ**.

- Log khi hai giá khác nhau: `invoice: order <mã> billed at the price frozen with the order (600000) instead of the current 1800000`.
- Đơn cũ tạo trước khi có cơ chế này (không có `amount`) sẽ dùng giá hiện tại — khi đổi giá, nhớ
  chốt tay cho các đơn đang chờ (đã làm cho 9 đơn đang chờ ngày 11/09/2026: giá cũ 70k/190k/350k/600k).
- Đổi giá gói: sửa `PLANS` trong `control-plane/src/payments.js` (4 gói VPN) hoặc `AI_PLANS` (MeetFlow AI).

### Gói đã ngừng bán

- **VPNFlow: gói "Trọn đời" (1.500.000đ) đã bỏ khỏi trang buy từ 2026-09-11** — chỉ còn 4 gói:
  tháng · 3 tháng · 6 tháng · năm. API `/v1/payments/create` cũng từ chối `plan=lifetime`
  (`invalid_plan`), nên link cũ đặt gói này không tạo được đơn.
- Vẫn giữ định nghĩa gói trong code (`PLANS.lifetime` có `retired: true`) để hoá đơn/đơn hàng cũ
  và màn admin hiển thị đúng tên gói; khách đã mua trọn đời trước đây **không bị ảnh hưởng**
  (quyền lợi không có ngày hết hạn).
- Muốn mở bán lại: xoá `retired: true` và thêm `"lifetime"` lại vào danh sách gói trong `payments.js`.

### Hiển thị giá theo tiền tệ của người xem

Trang mua tự chọn tiền tệ hiển thị (giá chính) theo ngôn ngữ khách đang xem:

| Khách | Giá chính | Dòng phụ (≈) | Thanh toán thực tế |
|---|---|---|---|
| Việt Nam (`?lang=vi`) | **200.000 đ** / 30 ngày | ≈ ¥58 · $7.80 | chuyển khoản/MoMo: **VND** · WeChat/Alipay: **¥** |
| Trung Quốc (`?lang=zh`) | **¥58** / 30 天 | ≈ 200,000 đ · $7.80 | WeChat/Alipay: **¥58** |
| Quốc tế (`?lang=en/ja/ko`) | **$7.80** / 30 days | ≈ 200,000 đ · ¥58 | chuyển khoản/MoMo: **VND** (hiện kèm ≈ $) |

- Có **thanh chọn tiền tệ** (VNĐ / ¥ CNY / $ USD) ngay dưới thanh ngôn ngữ; đổi ngôn ngữ thì
  tiền tệ tự đổi theo. Ép bằng URL: `?cur=CNY`, `?cur=USD`, `?cur=VND` (giữ nguyên khi đổi ngôn ngữ).
- **Popup QR luôn hiện đúng số tiền phải chuyển** (VND cho ngân hàng/MoMo, ¥ cho WeChat/Alipay),
  kèm dòng ≈ quy đổi để khách quốc tế biết giá trị tương đương.
- Làm tròn: **CNY làm tròn lên** (khách tự nhập tay, không để thiếu); **USD làm tròn tới cent**
  (chỉ để tham khảo — không có cổng thu USD).

**Tỷ giá USD:** giống CNY — tự động từ `open.er-api.com`, cache 6 giờ, hoặc ghim cố định bằng
`Environment=VND_PER_USD=25600` trong systemd drop-in. Log: `journalctl -u flowvpn-cp | grep "USD rate"`.
Nếu chưa ghim thì tỷ giá USD đổi theo ngày, còn CNY đang ghim 3.500.

### QR WeChat / Alipay có sẵn số tiền theo từng gói (ĐÃ BẬT 14/09/2026)

Chủ shop đã tạo bộ ảnh QR **có đặt sẵn số tiền** bằng 微信 → 收付款 → 二维码收款 → **设置金额**
và Alipay → 收钱 → **设置金额**, lưu vào `/root/flowvpn-pay/` với tên **theo gói**:

| Gói (id trong code) | Giá | ¥ trong ảnh | File WeChat | File Alipay |
|---|---|---|---|---|
| `monthly` (tháng) | 200.000đ | ¥58 | `wechat-monthly.jpg` | `alipay-monthly.jpg` |
| `quarterly` (3 tháng) | 550.000đ | ¥158 | `wechat-quarterly.jpg` | `alipay-quarterly.jpg` |
| `semiannual` (6 tháng) | 950.000đ | ¥272 | `wechat-semiannual.jpg` | `alipay-semiannual.jpg` |
| `yearly` (năm) | 1.800.000đ | ¥515 | `wechat-yearly.jpg` | `alipay-yearly.jpg` |

Số ¥ trong bảng là **đọc trực tiếp từ ảnh** (OCR — ảnh đã có sẵn số tiền), khớp với quy đổi làm tròn
lên ở tỷ giá ghim 1 CNY = 3.500 đ (¥58/¥158/¥272/¥515). Khách chọn gói nào ⇒ trang buy hiện **đúng
ảnh QR của gói đó**, và hiện luôn số ¥ đó, **không cần nhập hay copy gì**.

Thứ tự ưu tiên ảnh (`resolveQrFile()` trong `payments.js`):

```
<kênh>-<gói>.jpg        wechat-monthly.jpg        ← VPNFlow, ảnh đã có số tiền (đang dùng)
<kênh>-ai-<gói>.jpg     wechat-ai-monthly.jpg     ← MeetFlow AI (giá khác nên phải có tiền tố -ai-)
<kênh>-<số ¥>.jpg       wechat-58.jpg             ← ảnh theo mức tiền (cách đặt tên cũ)
<kênh>-ai.jpg / <kênh>.jpg                        ← ảnh chung, khách tự nhập số tiền (đang dùng cho AI)
```
Đuôi file chấp nhận `.png .jpg .jpeg .webp` **và cả đuôi viết hoa** (`.JPG`). Ảnh của MeetFlow AI
**bắt buộc** có `-ai-`, nếu không hệ thống sẽ không lấy ảnh của VPNFlow (200.000đ ≠ 130.000đ).

Gói nào chưa có ảnh riêng thì tự lùi về ảnh chung — không bao giờ lỗi. Kiểm tra ảnh đang dùng:

```bash
curl -sI "https://api.meetflowai.site/v1/payments/qr/wechat?plan=yearly" | grep -i x-qr
# X-QR-Variant: wechat-yearly.jpg
# X-QR-Amount-Prefilled: 1
```

#### Số ¥ hiện trên trang buy lấy từ đâu

`/root/flowvpn-pay/qr-amounts.json` khai số ¥ **in thật trong từng ảnh**; trang buy dùng số này
(response `qrCny`) thay vì số quy đổi theo tỷ giá — nếu mai kia tỷ giá đổi, khách vẫn thấy đúng con số
trong ví. Sửa file là có hiệu lực ngay (đọc lại theo mtime, **không cần restart**):

```json
{ "wechat-monthly.jpg": 58, "wechat-quarterly.jpg": 158, "wechat-semiannual.jpg": 272, "wechat-yearly.jpg": 515,
  "alipay-monthly.jpg": 58, "alipay-quarterly.jpg": 158, "alipay-semiannual.jpg": 272, "alipay-yearly.jpg": 515 }
```

Đổi giá gói ⇒ phải tạo lại ảnh QR trong app với số tiền mới, thay file, và sửa `qr-amounts.json`.

Trạng thái từng kênh (11/09/2026):

| Kênh | Đang dùng | Số tiền |
|---|---|---|
| Chuyển khoản ngân hàng (TPBank) | QR **động** do server tạo | ✅ nhúng sẵn + ghi mã đơn vào nội dung CK |
| MoMo | QR **động** (VietQR BIN 971025) | ✅ nhúng sẵn + mã đơn |
| WeChat Pay | ảnh theo gói `wechat-<gói>.jpg` (VPN) · `wechat.png` (AI) | ✅ VPN: có sẵn số tiền; AI: khách tự nhập ¥ |
| Alipay | ảnh theo gói `alipay-<gói>.jpg` (VPN) · `alipay.png` (AI) | ✅ VPN: có sẵn số tiền; AI: khách tự nhập ¥ |

Muốn MoMo quay lại dùng ảnh tĩnh `momo.png`: thêm `Environment=MOMO_QR_DYNAMIC=0` rồi restart service.

**Làm tròn:** luôn làm tròn **lên** tới đồng ¥ nguyên (ceil) — khách nhập tay, không để thiếu tiền.

**Tỷ giá hiện tại: GHIM CỐ ĐỊNH 1 CNY = 3.500 đ** (chủ shop ấn định, không dùng tỷ giá thị trường).
Đặt bằng `Environment=VND_PER_CNY=3500` trong `/etc/systemd/system/flowvpn-cp.service.d/store-urls.conf`.

| Gói | Giá (từ 11/09/2026) | Quy đổi ¥ |
|---|---|---|
| VPN tháng | 200.000đ | **¥58** |
| VPN 3 tháng | 550.000đ | **¥158** |
| VPN 6 tháng | 950.000đ | **¥272** |
| VPN năm | 1.800.000đ | **¥515** |
| MeetFlow AI pass30 | 150.000đ | **¥43** |
| MeetFlow AI tháng | 130.000đ | **¥38** |
| MeetFlow AI năm | 1.050.000đ | **¥300** |

Đổi tỷ giá: sửa số trong dòng `VND_PER_CNY` → `systemctl daemon-reload && systemctl restart flowvpn-cp`.
**Xoá** dòng đó để quay lại tỷ giá thị trường tự động.

Khi chạy tỷ giá thị trường (không ghim): lấy từ `open.er-api.com` (miễn phí, cập nhật hằng ngày),
cache **6 giờ**; không gọi được thì dùng cache gần nhất rồi mới tới mặc định `3880`;
lệch quá **30%** so với lần trước thì coi là nguồn lỗi và không áp dụng.

Log kiểm tra: `journalctl -u flowvpn-cp | grep "CNY rate"`

```
CNY rate: pinned at 1 CNY = 3500 VND (env:VND_PER_CNY)          # đang ghim
CNY rate: 1 CNY = 3876 VND (open.er-api.com, cached 6h)          # chạy theo thị trường
```

### Email báo đơn cho chủ shop — có ghi rõ kênh thanh toán

> ⚠️ **Từ 14/09/2026 email này KHÔNG còn gửi mặc định.** Khi đã có webhook SePay tự xác nhận tiền,
> chủ shop chỉ cần biết đơn **đã thanh toán** (xem §5b → *Email thông báo chủ shop*). Email mô tả
> dưới đây chỉ còn gửi khi bật `OWNER_ALERT_ON_CREATE=1`, hoặc **luôn gửi cho WeChat/Alipay** vì hai
> kênh đó không có webhook nào theo dõi.

Mỗi đơn mới gửi 1 email tới `OWNER_ALERT_EMAIL` (mặc định `minhnb2@me.com`). Đầu email có **khung
vàng** trả lời ngay 3 câu: khách trả qua kênh nào, mở app nào để kiểm tra, và số tiền cần khớp.

| Kênh khách chọn | Tiêu đề email | Hướng dẫn kiểm tra trong email |
|---|---|---|
| Chuyển khoản ngân hàng | `… — khách trả qua Chuyển khoản ngân hàng` | Mở app **TPBank** → biến động số dư tài khoản `57222538888` |
| **WeChat Pay** | `… — khách trả qua WeChat Pay` | Mở **WeChat → 我 → 服务 → 钱包 → 账单** (lịch sử giao dịch), số tiền cần khớp ghi bằng **¥** |
| **Alipay** | `… — khách trả qua Alipay` | Mở **Alipay → 我的 → 账单**, số tiền ghi bằng **¥** |
| MoMo | `… — khách trả qua MoMo` | Mở app **MoMo → Lịch sử giao dịch** |
| PayOS | `… — khách trả qua PayOS` | Dashboard **PayOS → Giao dịch** (thường tự xác nhận qua webhook) |

- Với WeChat/Alipay, khung đó ghi **số ¥ cần tìm** kèm quy đổi VND (ví dụ `¥43 (≈ 150.000 đ)`),
  vì khách tự nhập số tiền nên anh phải khớp đúng con số đó.
- Tài khoản/ví nhận tiền được in ngay dưới khung để khỏi mở nhầm ví.
- Nút **✅ Xác nhận đã nhận tiền** nằm cuối email, chỉ có hiệu lực 1 lần.

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

### VPNFlow — kênh APK sideload (KHÁC kênh iOS, dùng chung `/v1/app-version`)

VPNFlow có **hai kênh phát hành**: iOS/macOS qua App Store, Android qua APK sideload
(`meetflowai.site/v1/downloads/android`). Trước đây cả hai dùng chung một câu trả lời nên
kênh Android bị **rỗng `store_url` ⇒ nút "Cập nhật" bấm không mở gì**. Nay server trả lời
theo **đúng kênh của client**:

| Client | Nhận được |
|---|---|
| iPhone/macOS (`CFNetwork/Darwin`) | `{platform:"ios", minimum_version, latest_version, store_url}` — như cũ |
| Android (`okhttp/*`, hoặc `?platform=android`) | `{platform:"android", minimum_version, latest_version, apk_url, apk_url_legacy, store_url}` — `store_url` **bằng** `apk_url` |

Cách nhận kênh: ưu tiên `?platform=android|ios` (bản ≥ 1.2.6 gửi kèm), nếu không có thì suy từ
User-Agent — nhờ vậy **bản đã cài sẵn (≤ 1.2.4) cũng nhận đúng link APK**, không cần build lại.

⚠️ **Máy Android 7.0/7.1 và Fire OS (Fire TV Stick 4K) phải lấy `apk_url_legacy`**: APK thường có
`minSdk 26` nên cài lên máy đó báo *"There was a problem parsing the package"*. App (≥ 1.2.6) tự
chọn theo `Build.VERSION.SDK_INT < 26`; server luôn trả kèm link legacy
(`/v1/downloads/android-legacy`, flavor `legacy`, `minSdk 24`). Khi bật ép cập nhật mà chỉ có một
link APK thì nhóm này bị **chặn cứng ở màn cập nhật** — đó là lý do có field riêng.

```bash
# Xem ngưỡng ép cập nhật của kênh Android
curl -s "https://api.meetflowai.site/v1/app-version?platform=android"
curl -s -H "Authorization: Bearer $AUTH_TOKEN" https://api.meetflowai.site/v1/admin/android-version

# Bắt buộc mọi bản cũ cài lại bản mới (minimum = latest)
curl -X PATCH https://api.meetflowai.site/v1/admin/android-version \
  -H "Authorization: Bearer $AUTH_TOKEN" -H 'Content-Type: application/json' \
  -d '{"latest_version":"1.2.6","minimum_version":"1.2.6"}'
```

Phát hành APK mới (kênh web/sideload, branch `main`):

```bash
cd android && ./gradlew -p . -Pandroid.buildDir=$HOME/.vpnflow-build \
  :app:assembleModernRelease :app:assembleLegacyRelease     # ký bằng ~/keystores/vpnflow-signing.properties
# file ra ở $HOME/.vpnflow-build/app/outputs/apk/{modern,legacy}/release/
scp $HOME/.vpnflow-build/app/outputs/apk/modern/release/app-modern-release.apk \
  root@VPS:/root/flowvpn-apk/VPNFlow-latest.apk
scp $HOME/.vpnflow-build/app/outputs/apk/legacy/release/app-legacy-release.apk \
  root@VPS:/root/flowvpn-apk/VPNFlow-android7.apk
# nên upload vào tên *.incoming rồi md5sum so với máy build trước khi mv đè file đang phát
# rồi PATCH ngưỡng như trên — không cần build lại hay restart server

# kiểm tra sau khi phát hành (1 lệnh, gói hết các bước kiểm tay):
scripts/check-apk-release.py                 # quảng cáo + kích thước + UA routing
scripts/check-apk-release.py --download      # tải thật về, so md5 + versionName trong file
scripts/check-apk-release.py --self-test     # tự kiểm chính script bằng server giả
```

`check-apk-release.py` so **bản build trên máy** với **bản đang phát**: versionName (đọc bằng aapt,
tự dò trong Android SDK nếu chưa có trong PATH), `latest_version`/`minimum_version` server quảng cáo,
kích thước + `Content-Disposition` khi tải bằng UA máy thường **và** UA Android 7/Fire TV. Trả mã
khác 0 nếu lệch — dùng được trong CI hoặc trước khi thông báo "đã phát hành".

- `minimum_version` = bản mới ⇒ **bắt buộc** cài lại; thấp hơn `latest_version` ⇒ chỉ hiện ngưỡng
  cần đạt, app vẫn chạy.
- Kiểm tra bản đang phát **không cần cài**: `unzip -p VPNFlow-latest.apk AndroidManifest.xml`
  rồi đọc chuỗi UTF-16 (hoặc `aapt dump badging` ở máy build).
- Nút *Tải/Cập nhật* mở `store_url` (Android luôn có link APK); bản ≥ 1.2.6 còn fallback về
  `apk_url` rồi `https://api.meetflowai.site/v1/downloads/android` nếu cả hai rỗng.
- **Endpoint tải tự chọn bản phù hợp**: `/v1/downloads/android` xem UA của trình duyệt /
  DownloadManager — máy Android 1–7, Fire TV (`AFT*`), `Silk/`, `Fire OS` nhận
  `VPNFlow-android7.apk` (minSdk 24); còn lại nhận `VPNFlow-latest.apk` (minSdk 26). Nhờ vậy
  cả máy cũ **chưa có code mới** cũng không bị kẹt ở màn ép cập nhật.
  ```bash
  curl -sI -A "Mozilla/5.0 (Linux; Android 7.1.2; AFTMM Build/NS6265)" https://meetflowai.site/v1/downloads/android | grep -i content-disposition
  curl -sI -A "Mozilla/5.0 (Linux; Android 14; Pixel 8)"              https://meetflowai.site/v1/downloads/android | grep -i content-disposition
  ```
- Đổi ngưỡng **không cần deploy**: `app-config.db` trên VPS là nguồn sự thật.
- ⚠️ Deploy server: `control-plane/src/index.js` trên VPS phải là bản **đã commit**
  (`git show HEAD:control-plane/src/index.js`), KHÔNG copy file đang sửa dở trong worktree —
  bản WIP có thể import module chưa có trên server và làm service chết ngay khi restart.
  Lưu ý phụ: file trong worktree có thể còn bản cũ hơn index (khi stage bằng `git apply --cached`),
  nên **test trên worktree sạch** (`git show HEAD:…`) hoặc kiểm md5 trên server với `HEAD`.

### Kênh Diawi — link cài trực tiếp (iOS IPA, APK nhỏ) · 14/09/2026

Chủ shop tải gói lên **Diawi** rồi lấy link HTTPS cho khách bấm là cài (không cần cắm cáp, không cần
TestFlight). Upload bằng script trong repo, KHÔNG upload tay (upload tay dễ lẫn bản cũ):

```bash
# token để ở /root/.diawi-token (chmod 600, KHÔNG commit) trên node-2
cd /root && DIAWI_TOKEN=$(cat /root/.diawi-token) node /root/diawi-upload.mjs \
  --file /root/flowvpn-ipa/VPNFlow-latest.ipa --days 30 --find-by-udid \
  --comment "VPNFlow iOS 1.3.2 (12)"
# in ra md5 + link; thêm --json để máy đọc
```

Script gọi HTTP bằng **curl** (không phải node fetch): VPS có bản ghi AAAA cho `*.diawi.com` nhưng
IPv6 không đi được, `fetch` chọn IPv6 rồi treo tới ETIMEDOUT; token truyền qua file cấu hình curl
chmod 600 nên không lộ trong `ps`. Token lấy ở Diawi → Settings → API access.

| Gói | Link Diawi | Ghi chú |
|---|---|---|
| VPNFlow iOS 1.3.2 build 12 (IPA 4,7 MB, md5 `7de3e103a678…`) | <https://i.diawi.com/gSn4ht> | upload kèm `--days 30 --find-by-udid`; hiện đang là link iOS của cả app lẫn trang buy |
| MeetFlow AI 1.0.3 (APK 4,4 MB, md5 `716d32a31814…`) | <https://i.diawi.com/3G7reo> | |
| VPNFlow Android 1.2.6 (APK **96 MB**) | ❌ Diawi từ chối: `File size too large` | giới hạn theo gói tài khoản ([KB](https://www.diawi.com/knowledge-base/Diawi/Maximum-upload-size)); Android vẫn phát từ server mình |

**Đổi link không cần deploy**: link tải của app đọc `app-config.db` trước biến môi trường
(`storeLinks()` trong `index.js`), nên chỉ cần PATCH:

```bash
T=$(systemctl show flowvpn-cp -p Environment | tr ' ' '\n' | grep ^AUTH_TOKEN= | cut -d= -f2-)
curl -s -X PATCH -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"ipa_url":"https://i.diawi.com/<mã>"}' http://127.0.0.1:7778/v1/admin/app-version      # iOS
curl -s -X PATCH -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"apk_url":"https://i.diawi.com/<mã>"}' http://127.0.0.1:7778/v1/admin/ai/app-version   # APK MeetFlow AI
# về lại file tự phát: PATCH với "ipa_url":"" (rỗng) ⇒ dùng /v1/downloads/ios
```

⚠️ **Hai điều phải biết trước khi coi Diawi là kênh phát chính cho iOS**:
1. Bản IPA hiện tại là **development/ad-hoc**: provisioning profile ghi *Profile type: Development*,
   **chỉ 4 UDID** đăng ký ⇒ máy ngoài 4 UDID đó cài sẽ lỗi. Trang Diawi nói rõ điều này; đã bật
   `find_by_udid` để máy lạ gửi UDID về, nhưng phải **build lại kèm UDID mới** thì mới cài được.
   Muốn phát đại trà cần Enterprise (in-house) certificate hoặc App Store/TestFlight.
2. Link Diawi **có hạn** (mặc định theo tài khoản). Hết hạn thì PATCH về `/v1/downloads/ios` hoặc
   upload lại rồi đổi link — vì vậy link tự phát của server vẫn được giữ làm đường lùi.

Kiểm tra nhanh một link Diawi trước khi phát: mở link bằng UA iPhone rồi xem trang có đúng
Version/Build và không có cảnh báo UDID:

```bash
curl -sL -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" https://i.diawi.com/gSn4ht | grep -oE "Version [0-9.]+|Build [0-9]+|Provisioned devices [0-9]+"
```

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

## 5b. SePay — tự xác nhận đơn chuyển khoản (IPN)

SePay theo dõi biến động số dư tài khoản ngân hàng rồi POST về hệ thống mỗi khi có tiền vào ⇒ đơn
VietQR/chuyển khoản được **kích hoạt tự động**, không phải chờ chủ shop bấm tay. Vì đã có webhook
xác nhận tiền, **email xác nhận tay lúc tạo đơn mặc định KHÔNG gửi nữa**: chủ shop chỉ nhận email
khi đơn **đã thanh toán** (và email cảnh báo khi có tiền vào mà không khớp đơn) — xem
[Email thông báo](#email-thông-báo-chủ-shop-chỉ-báo-khi-đã-thanh-toán).

### URL cắm vào SePay (mục Webhooks / IPN)

```
https://api.meetflowai.site/v1/payments/sepay-webhook
```
(bản sao: `https://meetflowai.site/v1/payments/sepay-webhook` — cả hai đều đi qua Caddy tới control plane)

- **Xác thực**: chọn *HMAC-SHA256* (SePay ký `{timestamp}.{raw_body}`, header `X-SePay-Signature`
  dạng `sha256=<hex>` + `X-SePay-Timestamp`) — hoặc chọn *API Key* và dùng đúng secret đó
  (`Authorization: Apikey <key>`). Code hỗ trợ **cả hai**.
- Secret nằm trong drop-in trên **node-2** (máy chính): `/etc/systemd/system/flowvpn-cp.service.d/sepay.conf`
  (`SEPAY_WEBHOOK_SECRET`, `SEPAY_API_KEY`, `SEPAY_URL_TOKEN`, chmod 600). Đổi key (sang key live) thì
  sửa file đó rồi `systemctl daemon-reload && systemctl restart flowvpn-cp`.
- **Chế độ dự phòng "không xác thực"**: nếu webhook của SePay không gửi header nào (log ghi
  `signature=false, apiKey=false` — đã gặp thật 14/09/2026), dùng URL kèm token bí mật:
  `…/v1/payments/sepay-webhook?token=<SEPAY_URL_TOKEN>` (giá trị trong file drop-in nói trên, KHÔNG
  ghi vào repo). Yếu hơn HMAC vì URL có thể lọt vào log — chỉ dùng khi dashboard không cho chọn HMAC.
- **Mã thanh toán**: nội dung chuyển khoản do VietQR sinh ra có dạng `VPNFLOW-<mã đơn>-<gói>`
  (VPNFlow) và `MEETFLOW-<mã đơn>-<gói>` (MeetFlow AI) — ví dụ `VPNFLOW-1789318609-THANG`,
  `MEETFLOW-1789318130-30NG`. Token gói (`payments.transferNote`): THANG/3THANG/6THANG/NAM cho
  VPNFlow, 30NG/THANG/NAM cho AI (không dấu, ngắn). **Mã đơn đứng trước** vì nội dung có thể bị
  ngân hàng cắt ngắn (EMVCo field 62/01 tối đa 25 ký tự — mọi tổ hợp hiện tại ≤ 25). Cấu hình
  "mã thanh toán" trong SePay nên tách phần số; nếu không cấu hình, code vẫn tự đọc tiền tố trong
  `content` (bộ tách `sepay.js` khớp cả khi có/không có token gói).
- Tài khoản ngân hàng phải là tài khoản đã nối với SePay (`BANK_QR_ACCOUNT`, hiện TPBank `57222538888`).

### Trang buy hiển thị QR của SePay (vietqr.app) + tự lùi về QR sinh tại chỗ

`/v1/payments/create` (và `/v1/ai/payments/create`) trả thêm `qrImageUrl` cho phương thức `bankqr`:
ảnh QR dựng bởi **vietqr.app** (dịch vụ SePay dùng) với số tiền + nội dung CK điền sẵn, có branding
ngân hàng (`template=standee`). Trang buy **ưu tiên ảnh này**; nếu ảnh ngoài không tải được (mạng
chặn dịch vụ ngoài, ví dụ từ Trung Quốc) thì tự rơi về `qrDataUrl` sinh tại chỗ nên khách vẫn trả được.

```bash
# xem URL ảnh + giải mã payload để chắc chắn có số tiền và nội dung
curl -s -X POST -H 'content-type: application/json'   -d '{"email":"<email>","plan":"monthly","method":"bankqr","lang":"vi"}'   https://api.meetflowai.site/v1/payments/create | python3 -c 'import json,sys;print(json.load(sys.stdin)["qrImageUrl"])'
```

⚠️ Khác biệt của vietqr.app so với QR tự sinh (đã xử lý trong code):
| | QR tự sinh (`vietqr.js`) | QR vietqr.app |
|---|---|---|
| Nội dung CK | tag 62 **subfield 01** | tag 62 **subfield 08**, và **bỏ dấu gạch**: `VPNFLOW-<mã đơn>-THANG` → `VPNFLOW< mã đơn>THANG` |
| Tên người nhận | có (tag 59) | không có trong payload (app ngân hàng tự tra theo BIN + STK) |

Bộ tách mã đơn (`sepay.js`) nhận **cả hai dạng** (có/không gạch) và cắt đúng 10 chữ số của mã đơn
(mã đơn là epoch giây) để không lẫn token gói dính sau (`MEETFLOW178931966430NG`).

### Xác nhận tiền về ⇒ tự kích hoạt, và **CỘNG DỒN** nếu gói cũ chưa hết hạn

Khi webhook báo có tiền đúng mã đơn + đủ tiền, backend tự kích hoạt gói tương ứng. Nếu tài khoản
**vẫn còn hạn**, thời gian mới được **cộng dồn** vào hạn cũ (không tính lại từ hôm nay); nếu đã hết
hạn thì tính từ hôm nay. MeetFlow AI đã làm đúng như vậy từ trước, nay VPNFlow đồng nhất
(`auth-store.grantSubscription`).

Đã test thật 14/09/2026 qua chính webhook SePay: mua gói tháng lần 1 → hạn `13/10`, mua tiếp lần 2 →
hạn `12/11` (cộng dồn 30 ngày) — nội dung CK trong test đúng dạng vietqr.app sinh ra (`VPNFLOW< mã đơn>THANG`).

### Quy tắc an toàn đã cài (test thật 14/09/2026)

| Tình huống | Hành vi |
|---|---|
| Tiền vào (`transferType=in`) đúng mã đơn, đủ tiền | tự kích hoạt + gửi hoá đơn: `sepay: TỰ KÍCH HOẠT đơn 1789317437 (vpn, 200000đ, tx 9990123)` |
| Chuyển **thiếu** tiền | **KHÔNG** kích hoạt, log `đơn … chuyển 199000đ < cần 200000đ` **và gửi email cảnh báo** cho chủ shop |
| Webhook **lặp** (SePay gửi lại) | không cấp lần hai: `đơn … không còn chờ xác nhận (đã xử lý hoặc hết hạn)` |
| Nội dung **không có mã đơn** | log + **email cảnh báo** kèm nội dung CK, mã giao dịch, số tiền và link bảng điều khiển |
| Giao dịch tiền **ra** | bỏ qua |
| Sai chữ ký / không xác thực | HTTP **401** |
| Chưa cấu hình secret | HTTP **503** (không nhận webhook trần) |

### Email thông báo chủ shop: chỉ báo khi ĐÃ thanh toán

| Email | Khi nào | Nội dung |
|---|---|---|
| `✅ Đã thanh toán (<sản phẩm>) #<mã đơn> — <số tiền> · <email>` | ngay khi SePay/PayOS xác nhận tiền và hệ thống kích hoạt xong | mã đơn, email khách, gói, số tiền, thời điểm, link `/buy/status/<mã>` (AI: `/ai/buy/status/<mã>`) — **không có nút xác nhận** vì không cần xác nhận gì nữa |
| `⚠️ Tiền vào <số tiền> nhưng chưa khớp đơn — cần xem lại` | có tiền vào mà nội dung **không có mã đơn**, hoặc **chuyển thiếu** | số tiền, nội dung CK, tài khoản nhận, mã giao dịch, lý do, link bảng điều khiển (`/admin`) — đây là email duy nhất cần người xử lý |
| Email "có đơn mới" (nút xác nhận tay) | **mặc định tắt**; bật lại bằng `OWNER_ALERT_ON_CREATE=1` trong drop-in env | như cũ |

- **Ngoại lệ bắt buộc**: WeChat/Alipay là QR cá nhân, **không có webhook nào theo dõi tiền về**, nên
  hai kênh này **vẫn nhận email đơn mới** kể cả khi cờ trên tắt (`shouldAlertOnCreate()` trong
  `index.js`) — nếu tắt hết thì đơn CNY trả tiền sẽ im lặng.
- Khách vẫn nhận **hoá đơn/hướng dẫn kích hoạt** qua email của chính họ khi đơn được kích hoạt.

Bằng chứng thật 14/09/2026 (đơn test `1789322708`, webhook SePay ký HMAC):

```
sepay: đơn 1789322708 khớp giao dịch 990101
[invoice] sent to <email khách> via resend id=…
[paid-alert] sent to minhnb2@me.com via resend id=7a41ec4b-…
paid-alert order 1789322708 to minhnb2@me.com: sent=true       # KHÔNG có dòng payment-alert nào lúc tạo đơn
sepay: TỰ KÍCH HOẠT đơn 1789322708 (vpn, 200000đ, tx 990101, email …)
```

Tiêu đề thư lấy lại từ Resend API (`GET /emails/<id>` → `last_event: delivered`):

```
✅ Đã thanh toán (VPNFlow Premium) #1789322708 — 200.000 đ · <email khách>
⚠️ Tiền vào 50.000 đ nhưng chưa khớp đơn — cần xem lại
```

### Mã đơn là duy nhất (2 khách mua trong cùng một giây)

Mã đơn = epoch giây, nên hai khách bấm "Thanh toán" trong cùng giây sẽ ra **cùng mã**. Trước đây
`recordPendingPayment` xoá mã trùng ⇒ đơn sau ghi đè đơn trước, và vì webhook SePay có thể trả mã
đơn ở trường `code` (không kèm tiền tố sản phẩm), tiền của khách A có thể kích hoạt gói cho khách B.
Từ 14/09/2026 đơn mới chỉ được tạo qua `createPendingOrder()` trong `index.js`:

- kiểm tra trùng trên **cả hai kho** (VPN `auth.json` + MeetFlow AI `ai-access.json`) rồi **nhích
  mã** cho tới khi trống, giữ 10 chữ số để khớp `normalizeOrderCode` của webhook;
- nằm trong hàng đợi chung `withOrderCodeLock()` vì file JSON là đọc-sửa-ghi, hai request chạy xen
  kẽ có thể cùng đọc một trạng thái rồi ghi đè nhau (mất đơn).

```
# 3 đơn đồng thời (đã tái hiện lỗi trước khi sửa: cả 3 ra cùng mã 1789322616)
1789322696 qa-u1@… bankqr   | 1789322697 qa-u3@… momo | 1789322698 qa-u2@… wechat
```

### Checklist bảo mật webhook theo tài liệu SePay (đối chiếu 14/09/2026)

Nguồn: [Xác thực webhook](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc) ·
[Bảo mật webhook](https://developer.sepay.vn/vi/sepay-webhooks/bao-mat)

| SePay khuyến nghị | Trạng thái trong code |
|---|---|
| **HMAC-SHA256** (khuyến nghị cao nhất: phát hiện payload bị sửa) | ✅ `verifySepaySignature()` — ký `{timestamp}.{raw_body}` bằng **raw body** (`express.json({verify})` giữ `req.rawBody`), so sánh bằng `timingSafeEqual`. Đã test thật: chữ ký đúng ⇒ 200 khi URL **không** kèm token |
| Chống replay: từ chối timestamp lệch quá **5 phút** | ✅ đúng 300 giây (`DEFAULT_TOLERANCE_SEC`) — timestamp cũ 10 phút ⇒ **401** |
| Đừng bao giờ "nhận tất" | ✅ không có header nào + không token ⇒ **401**; chưa cấu hình secret ⇒ **503** |
| Không cho hạ cấp bảo mật | ✅ request **có chữ ký** thì chỉ chấp nhận chữ ký: chữ ký sai + token URL đúng vẫn **401** |
| Whitelist IP của SePay | ⚙️ có sẵn, **mặc định tắt**: `SEPAY_IP_ALLOWLIST="1.2.3.4,5.6.7.0/24"` (drop-in phải có dòng `[Service]`). Bật ⇒ IP ngoài danh sách bị **403** + log. Đã test thật: 403 và `X-Forwarded-For` giả **không** lọt (Caddy ghi đè XFF của client) |
| Validate trước khi xác nhận: số tiền · **tài khoản nhận** · mã đơn | ✅ `amountCovers()` + `accountMatches()` + `extractOrderRef()`. Tiền vào tài khoản khác ⇒ **không** kích hoạt, gửi email cảnh báo, ghi nhật ký `wrong-account` |
| Lưu raw payload để audit/đối soát | ✅ `data/sepay-webhooks.log` (JSON lines) với `decision`: `activated` / `duplicate` / `underpaid` / `no-order-code` / `wrong-account` / `order-not-pending` / `rejected-ip` |
| Đối soát định kỳ (webhook có thể mất nếu endpoint sập > 5 giờ) | ⏳ **chưa làm** — cần API token live của SePay; kế hoạch: cron 15–30 phút gọi API giao dịch, so với `sepay-webhooks.log` + `pendingPayments`, bù các giao dịch thiếu |

#### Bật HMAC-SHA256 trong dashboard SePay (việc của chủ shop)

1. SePay → **Webhooks** → sửa webhook đang dùng → mục **Bảo mật / Xác thực** → chọn **HMAC-SHA256**.
2. Dán **Secret Key** = giá trị `SEPAY_WEBHOOK_SECRET` trong
   `/etc/systemd/system/flowvpn-cp.service.d/sepay.conf` trên node-2 (khoá test hiện tại do SePay cấp;
   khi chuyển sang tài khoản live thì tạo khoá mới rồi cập nhật **cả hai** nơi: dashboard + drop-in).
3. Lưu → SePay gửi kèm `X-SePay-Signature` + `X-SePay-Timestamp` từ request sau.
   Token trong URL (`?token=…`) **không cần nữa** khi đã bật HMAC (code tự bỏ qua token khi có chữ ký),
   nhưng cứ để nguyên cũng không sao — chỉ dùng khi dashboard đổi về chế độ "Không xác thực".
4. Muốn bật thêm whitelist IP: lấy danh sách IP tại <https://developer.sepay.vn/vi/sepay-webhooks/dia-chi-ip>
   rồi thêm drop-in (nhớ `[Service]`):

```ini
# /etc/systemd/system/flowvpn-cp.service.d/sepay-ip.conf
[Service]
Environment=SEPAY_IP_ALLOWLIST=1.2.3.4,5.6.7.0/24
```
```bash
systemctl daemon-reload && systemctl restart flowvpn-cp
```

⚠️ Drop-in **thiếu dòng `[Service]`** thì systemd bỏ qua toàn bộ biến (đã dính đúng lỗi này khi test:
whitelist tưởng bật mà không có tác dụng) — luôn kiểm bằng
`systemctl show flowvpn-cp -p Environment | tr ' ' '\n' | grep SEPAY_`.

#### Kết quả test thật 7 chế độ xác thực (14/09/2026)

| Ca | Kết quả |
|---|---|
| HMAC-SHA256 đúng, URL không kèm token | **200** |
| HMAC sai + token URL đúng | **401** (đã chặn hạ cấp) |
| HMAC đúng nhưng timestamp cũ 10 phút | **401** (chống replay) |
| Không header + token URL đúng (chế độ "không xác thực") | **200** |
| API Key đúng, không có chữ ký | **200** |
| Không xác thực gì | **401** |
| Token URL sai | **401** |

### Cách tự test

```bash
# 5 ca cơ bản (chữ ký đúng/sai, API key, không xác thực, tiền ra)
SEPAY_SECRET=spsk_… node scripts/sepay-selftest.mjs --code 555000 --amount 200000

# trọn luồng: tạo đơn thật rồi cho webhook báo có tiền
curl -s -X POST -H 'content-type: application/json' \
  -d '{"email":"<email test>","plan":"monthly","method":"bankqr","lang":"vi"}' \
  https://api.meetflowai.site/v1/payments/create          # lấy orderCode
SEPAY_SECRET=spsk_… node scripts/sepay-selftest.mjs --code <orderCode> --amount 200000
```

Test tự động: `control-plane/test/sepay.test.js` (xác thực/đọc mã đơn/số tiền), `control-plane/test/paid-alert.test.js` (nội dung 2 email thông báo + guard luồng webhook, cổng `OWNER_ALERT_ON_CREATE`, mã đơn duy nhất), `control-plane/test/order-status.test.js` (trang tình trạng). Toàn bộ control-plane: `node --test` → 140 pass / 0 fail.

## 6. Email — chống vào Junk / Spam (ĐÃ XỬ LÝ 13/09/2026)

### Trạng thái hiện tại: gửi qua **Resend**, DKIM **pass** ✅

Đã chuyển toàn bộ thư hệ thống (OTP đăng nhập, link xác thực, nhắc gia hạn, báo đơn cho chủ shop)
sang **Resend**. Bằng chứng thật lấy từ header thư do chính mailer gửi:

```bash
# gửi OTP thật tới hộp thư nội bộ rồi đọc header trong INBOX
curl -s -X POST -H 'content-type: application/json' \
  -d '{"email":"no-reply@meetflowai.site","lang":"vi"}' \
  https://api.meetflowai.site/v1/auth/email/start
```

Log VPS + header nhận được:

```
# journalctl -u flowvpn-cp
mail transport=resend (resend if RESEND_API_KEY is set)
[otp] sent to no-reply@meetflowai.site via resend id=<id>

# Resend API GET /emails/<id> → last_event: delivered

# Header thư trong INBOX (do server nhận mail92231 chấm):
Authentication-Results: mail92231.maychuemail.com (amavis);
    dkim=pass (1024-bit key) header.d=meetflowai.site header.b="..."
    dkim=pass (1024-bit key) header.d=amazonses.com header.b="..."
Return-Path: <...@rsend.meetflowai.site>
  Received: from e234-57.smtp-out.ap-northeast-1.amazonses.com ... by mail92231.maychuemail.com (Postfix)
```

`dkim=pass header.d=meetflowai.site` + `From: no-reply@meetflowai.site` ⇒ **DMARC align pass**
(kể cả khi DMARC đang `p=none`).

### Bản ghi DNS đã thêm ở PA Vietnam (`ns1.pavietnam.vn`)

| Bản ghi | Giá trị | Trạng thái Resend |
|---|---|---|
| `CNAME resend._domainkey.meetflowai.site` | khoá DKIM của Resend | verified |
| `CNAME rsend.meetflowai.site` | return-path/SPF của Resend | verified (đã verify, không cần thêm gì) |
| SPF (subdomain `send`) | do Resend cấp | verified |
| MX (subdomain `send`) | do Resend cấp | **cố tình bỏ** (chỉ dùng để *nhận* thư, không cần) |

Resend báo `partially_verified` là **bình thường**: mục *Receiving* (MX ở `send`) mình cố ý không thêm,
vì hộp thư vẫn nằm ở maychuemail. Gửi thư **không** phụ thuộc mục đó.

⚠️ Lỗi đã gặp: nếu ở `send.meetflowai.site` còn **MX/TXT cũ** thì không thêm được `CNAME` (DNS không
cho CNAME đứng cạnh bản ghi khác) → phải **xoá MX/TXT ở `send` trước**, rồi mới thêm CNAME.

### Vì sao phải đổi (chẩn đoán cũ, giữ lại để tra cứu)

```
SPF check:     pass          ✅  (include:spf.maychuemail.com)
"iprev":       pass          ✅
DKIM check:    permerror     ❌  key "dkim._domainkey.maychuemail.com" doesn't exist (NXDOMAIN)
```

Máy chủ mail cũ **có ký DKIM nhưng ký bằng tên miền của họ** (`d=maychuemail.com`) và khoá công khai
của selector đó **NXDOMAIN** ⇒ thư mang **chữ ký hỏng (permerror)**, với Gmail còn tệ hơn là không ký.
`meetflowai.site` khi đó chưa có DKIM nào. (Cách B — yêu cầu maychuemail bật DKIM theo domain khách —
vẫn để ngỏ nếu sau này muốn quay lại SMTP.)

### Bật / tắt Resend trên VPS (1 lệnh, key không lộ ra màn hình)

```bash
scripts/set-resend-key.sh          # hỏi key (re_...), ghi vào systemd drop-in rồi restart
scripts/set-resend-key.sh --clear  # quay lại SMTP nếu cần
```

Mailer tự chọn transport: **có `RESEND_API_KEY` → Resend**, không có → SMTP như cũ.
Nếu Resend lỗi thì **không tự fallback** sang SMTP (tránh gửi trùng) — log ghi rõ `Resend: ...`.
Log lúc khởi động in `mail transport=smtp|resend|none`.

### Đã gửi thử THẬT toàn bộ email bằng cả 3 ngôn ngữ (13/09/2026)

6 loại email × 3 ngôn ngữ (vi/en/zh) = 18 thư, gửi qua chính mailer production tới hộp thư nội bộ,
đọc lại header trong INBOX: **18/18 delivered, tất cả `dkim=pass`**, tiêu đề đúng ngôn ngữ
(OTP, xác thực, hoá đơn VPNFlow, hoá đơn MeetFlow AI, nhắc gia hạn).

```bash
# chạy lại bất cứ lúc nào (trong repo hoặc trên VPS)
cd control-plane && NODE_ENV=production node ../scripts/check-mail-langs.mjs no-reply@meetflowai.site
# trên VPS:
# trên VPS: helper đọc env từ systemd unit + mọi drop-in rồi chuyển tiếp tham số cho node
python3 scripts/run-with-service-env.py scripts/check-mail-langs.mjs no-reply@meetflowai.site zh --only=otp
# (dùng biến SERVICE_UNIT=... nếu unit không phải flowvpn-cp)
```

Đã sửa kèm 2 lỗi phát hiện khi rà:

1. **Tên gói trong hoá đơn bị tiếng Anh**: hoá đơn dùng `PLANS[id].label` ("Monthly (200,000 VND /
   30 days)") cho mọi ngôn ngữ ⇒ khách Việt/Trung nhận tên gói tiếng Anh. Nay dùng
   `payments.planNameFor(lang, product, planId)` → "Hàng tháng" / "Monthly" / "月度".
2. **Bảng chữ tiếng Trung bị lặp 10 dòng** (khối `verify*` định nghĩa 2 lần trong `mailer.js`) —
   dead code, đã xoá bản trùng.

⚠️ `sendPaymentAlert` (email báo đơn cho **chủ shop**) cố ý chỉ tiếng Việt — người nhận là chủ shop,
không phải khách. Muốn đổi thì sửa `renderPaymentAlert`.

**Phạm vi ngôn ngữ của email:** chỉ có **vi / en / zh** (`MAIL_LANGS`). App hỗ trợ 5 ngôn ngữ
(vi/en/zh/ja/ko) nên khách Nhật/Hàn sẽ nhận thư **tiếng Anh** — `pickMailLang()` rơi về `en` cho
mọi giá trị khác (`ja`, `ko`, rỗng, lạ), KHÔNG bao giờ rơi về tiếng Việt. Muốn thêm ja/ko thì bổ
sung khoá vào bảng `T` trong `mailer.js` (đã tách theo từng ngôn ngữ) + cập nhật `MAIL_LANGS`.
Có test khoá hành vi này: `test/mailer.test.js` → "pickMailLang: … rơi về TIẾNG ANH".

Từ 13/09/2026 còn có **test chống rò tiếng Việt**: `test/mail-langs.test.js` render cả 5 loại email
gửi khách bằng en/zh rồi soi ký tự/dấu tiếng Việt (bỏ qua đơn vị tiền `200.000 đ`), kiểm tiêu đề
đúng chữ Hán/không chữ Hán, và 3 ngôn ngữ phải cho 3 tiêu đề khác nhau. Đã thử phá (gán nhãn gói
tiếng Việt cho bản en): test **fail đúng chỗ** (`invoice-ai/en lọt chữ tiếng Việt "Gói"`) — tức
test này thật sự bắt được lỗi, không phải test trang trí.
Ngoài `mailer.js` **không** còn chỗ nào khác gửi thư (đã grep `nodemailer`/`sendMail`/Resend toàn
repo); Firebase chỉ **sinh link** xác thực (`generateEmailVerificationLink`) rồi mình tự gửi,
nên không có email nào của Firebase gửi khách bằng tiếng Anh mặc định.

### Việc còn lại (không chặn gì)

- Thêm `rua=` vào DMARC để nhận báo cáo tổng hợp (hiện `_dmarc` mới chỉ có `v=DMARC1; p=none`):
  ```
  TXT _dmarc.meetflowai.site
  v=DMARC1; p=none; rua=mailto:support@meetflowai.site; fo=1
  ```
  Dùng **support@** vì đó là hộp thư có thật (đã kiểm: đăng nhập IMAP được). `dmarc@meetflowai.site`
  **chưa tồn tại** — nếu muốn dùng địa chỉ riêng thì phải tạo hộp thư ở panel maychuemail TRƯỚC,
  không thì báo cáo DMARC sẽ bị trả lại.
  Ổn định 1–2 tuần thì nâng `p=quarantine`. Lưu ý: mỗi tên miền **chỉ được có MỘT bản ghi TXT** ở
  `_dmarc` (và một bản ghi TXT SPF ở gốc) — cần thêm include thì **gộp** vào bản ghi hiện có.
  Kiểm tra sau khi thêm: `dig +short TXT _dmarc.meetflowai.site`.
- Khoá DKIM Resend đang là **1024-bit**; muốn 2048-bit thì xoay khoá trong Resend rồi cập nhật CNAME.
- Có thể chạy lại `scripts/check-email-auth.sh` bất cứ lúc nào để xem báo cáo SPF/DKIM/DMARC của Port25.

Đã tối ưu sẵn trong code: `text/plain` cho mọi email, `Reply-To: support@meetflowai.site`,
From đúng thương hiệu theo sản phẩm, link dùng domain đẹp. Log gửi thư ghi `via smtp|resend`,
`accepted=…`, `messageId/id=…`.

## 7. Kiểm tra nhanh hệ thống

```bash
scripts/check-email-auth.sh    # SPF/DKIM/DMARC thật (gửi thư test + đọc báo cáo Port25)
scripts/set-resend-key.sh      # bật Resend (--clear để quay lại SMTP)
```

```bash
curl -s https://api.meetflowai.site/v1/ai/app-version            # phiên bản Android đang phát
curl -s "https://api.meetflowai.site/v1/ai/entitlement?email=X"  # quyền Pro của 1 email
curl -sI https://meetflowai.site/v1/ai/downloads/android         # APK
curl -s "$TOKEN" https://api.meetflowai.site/v1/admin/ai/payments/pending

# VPNFlow (kênh APK sideload)
curl -s -A "okhttp/4.12.0" https://api.meetflowai.site/v1/app-version   # client Android thấy gì
curl -s "https://api.meetflowai.site/v1/app-version?platform=android"
curl -sI https://meetflowai.site/v1/downloads/android                   # APK đang phát
```

### node-2 là "cửa vào dự phòng" khi IP node-1 bị chặn (GFW) — ĐỌC TRƯỚC KHI ĐỔI DNS

**Kiến trúc:** node-1 `103.173.155.50` chạy control plane + Caddy gốc; node-2 `103.6.234.233`
(`fcnvps2`, SSH bằng `~/.ssh/fpt_vpn_node`) chỉ **kết thúc TLS rồi proxy sang node-1** qua đường
VN↔VN (1–8ms). Nguồn sự thật vẫn là node-1 — node-2 không chạy control plane.

```
api.meetflowai.site { reverse_proxy https://103.173.155.50 { transport http { tls_server_name api.meetflowai.site } header_up Host {host} } }
meetflowai.site     { … y hệt … }
```

⚠️ **Đổi bản ghi A của `meetflowai.site` / `api.meetflowai.site` sang node-2 mà node-2 chưa có
chứng chỉ ⇒ TOÀN BỘ web + API chết** với mọi truy vấn DNS mới (TLS `internal error`), trong khi
người còn cache DNS cũ vẫn vào bình thường — rất dễ tưởng là "chỉ một số người bị".
Đã xảy ra thật 13/09/2026, phát hiện khi `check-mail-links` chạy trên VPS báo "6 link hỏng".

**Trước khi trỏ DNS sang node-2, phải có cert trên node-2.** Cách nhanh và an toàn nhất là copy
cert Let's Encrypt đang chạy tốt ở node-1 (cùng tên miền, Caddy cùng layout storage):

```bash
# 1) lấy cert từ node-1
ssh node1 'tar -C /var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory \
  -cf - meetflowai.site api.meetflowai.site' > /tmp/certs.tar
# 2) đặt vào node-2 rồi RESTART (reload không đủ — config không đổi nên Caddy không quét lại storage)
ssh node2 'DEST=/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory
  mkdir -p "$DEST" && tar -C "$DEST" -xf - && chown -R caddy:caddy "$DEST" && systemctl restart caddy' < /tmp/certs.tar
```

Kiểm tra **từ ngoài** (đừng tin cache DNS của máy mình — dùng `--resolve` để ép đúng IP node-2):

```bash
for h in meetflowai.site api.meetflowai.site; do
  curl -s -o /dev/null -w "%{http_code} $h\n" --resolve $h:443:103.6.234.233 https://$h/health
done
# rồi kiểm từ nhiều nước: https://check-host.net/check-http?host=https://api.meetflowai.site/health
```

Ghi nhớ: cert copy từ node-1 hết hạn **20/11/2026**. Node-2 sẽ tự xin cert mới qua ACME (HTTP-01
chạy được vì DNS đang trỏ vào node-2) — nên kiểm lại hạn cert trước ~30/10, đừng để hết hạn mà không ai biết.

**Bắt buộc: `trusted_proxies` trên node-1** — nếu không, **mọi IP khách bị dồn thành IP node-2**:

```
# /etc/caddy/Caddyfile trên node-1
{
	servers {
		protocols h1 h2
		trusted_proxies static 103.6.234.233   # tin node-2 để giữ X-Forwarded-For thật
	}
}
```

Caddy mặc định **không tin** proxy đứng trước nên nó thay `X-Forwarded-For` bằng IP của peer trực
tiếp; đi qua 2 lớp proxy (node-2 → node-1 → control plane) mà không khai `trusted_proxies` thì
control plane thấy **tất cả request đều từ 103.6.234.233**. Hệ quả: giới hạn theo IP bị dùng chung
một rọ (ví dụ `/v1/ai/store/purchase` cho **40 lượt xác thực/giờ cho TOÀN BỘ khách** thay vì từng
người), log/dashboard mất IP thật. Giới hạn OTP resend thì theo **email** nên không bị ảnh hưởng.

Kiểm chứng (phải ra IP thật, và hai đường phải GIỐNG nhau):

```bash
# từ node-1 gọi qua cửa công khai → control plane phải ghi IP của node-1, không phải của node-2
ssh node1 'curl -s -o /dev/null "https://api.meetflowai.site/v1/ai/entitlement?email=ipcheck@example.com"'
ssh node1 'journalctl -u flowvpn-cp -n 20 --no-pager | grep ipcheck'   # ip=<IP thật>

# từ máy bạn: qua node-2 và qua node-1 trực tiếp → cùng một IP
curl -s -o /dev/null "https://api.meetflowai.site/v1/ai/entitlement?email=a@example.com"
curl -s -o /dev/null --resolve api.meetflowai.site:443:103.173.155.50 "https://api.meetflowai.site/v1/ai/entitlement?email=b@example.com"
```

Ghi chú: `requireAdminIP` trong `control-plane/src/index.js` **được định nghĩa nhưng không gắn vào
route nào** — bảng admin hiện chỉ bảo vệ bằng Bearer token (`requireAdminAuth`), KHÔNG chặn theo IP
dù env `ADMIN_ALLOWED_IPS` có tồn tại. Cân nhắc gắn lại nếu muốn giới hạn thêm.

**Tự động giữ cert khớp giữa hai node** — `scripts/sync-caddy-certs.sh` (đã cài cron **mỗi 6 giờ**
trên node-1, log `/var/log/cert-sync.log`):

```
23 */6 * * * /root/flowvpn-cp/scripts/sync-caddy-certs.sh >> /var/log/cert-sync.log 2>&1
```

Vì sao cần: **chỉ node đang giữ bản ghi A mới gia hạn được cert** (HTTP-01/TLS-ALPN-01 kiểm tra theo
tên miền). Node kia sẽ không gia hạn được ⇒ cert cũ đi và hết hạn sau ~90 ngày. Với DNS đang trỏ
node-2 thì node-1 **không tự gia hạn được**, mà node-2 lại verify cert của node-1 khi proxy
(`reverse_proxy https://…`, `insecure_skip_verify` không bật) ⇒ **cert node-1 hết hạn là sập web**
dù DNS trỏ đúng. Script so hạn hai bên rồi đưa cert **xa hạn hơn** sang node kia (chiều nào cũng
chạy được, nên nếu sau này đổi DNS về node-1 thì vẫn tự khớp) rồi restart Caddy ở node nhận.

```bash
scripts/sync-caddy-certs.sh --dry-run      # xem sẽ làm gì
scripts/sync-caddy-certs.sh --no-restart   # copy cert nhưng không đụng Caddy (để thử)
crontab -l | grep -v sync-caddy | crontab -   # tắt tự động (nhớ backup crontab trước!)
```

Đã kiểm thật 13/09/2026: chiều **kéo** (node-2 → node-1) và chiều **đẩy** (node-1 → node-2) đều copy
đúng file + đúng quyền `caddy:caddy`, chạy lần 2 là no-op, node-2 không tới được thì thoát êm (exit 0),
domain thiếu cert thì báo `CẦN XEM TAY` chứ không crash.



### Trạng thái hạ tầng 13/09/2026 — máy chính đã chuyển sang node-2

Từ ~19:08–19:17 hôm nay: **node-2 (103.6.234.233, `fcnvps2`) là máy chính** — nó chạy
`flowvpn-cp.service` + Caddyfile riêng (proxy `127.0.0.1:7778`), DNS `meetflowai.site` /
`api.meetflowai.site` trỏ về đây. **Control plane trên node-1 đã `inactive`**, Caddy node-1 vẫn
chạy nên nếu DNS quay lại node-1 thì `/buy` trả **502** (đã đo) — muốn quay lui phải bật lại CP
trên node-1 trước.

⚠️ **Máy chính phải có đủ 4 thư mục file**, thiếu cái nào là 404 đúng nhóm route đó:

| Thư mục trên máy chính | Thiếu thì hỏng gì |
|---|---|
| `/root/flowvpn-apk/` (`VPNFlow-latest.apk`, `VPNFlow-android7.apk`) | `/v1/downloads/android`, `/android-legacy`, `/v1/ai/downloads/android` → 404 "APK not found" |
| `/root/flowvpn-pay/` (`wechat.png`, `alipay.png`, `momo.png`) | `/v1/ai/payments/qr/wechat|alipay|momo` → 404 ⇒ **khách không quét được QR để trả tiền** |
| `/root/flowvpn-cp/assets/` (`vpnflow-logo.png`, `meetflow-logo.png`) | `/assets/*` → 404; trang buy mất logo |
| `/var/www/flowvpn/` | `/terms`, `/privacy`, `/open`, `/dl/*`, `/PrivateVPN/*` |

Đã gặp thật hôm nay: node-2 thiếu cả 3 thư mục đầu (đã copy từ node-1 sang, xong kiểm 200).

📌 **Cách copy APK an toàn** — **ĐỪNG** pipe qua máy trạm (`ssh node1 tar | ssh node2 tar`) vì
kết nối đứt giữa đường sẽ để lại **file cụt** mà endpoint vẫn phát cho khách (đã xảy ra: 27MB/96MB).
Chạy trong node-1 để đi thẳng VN↔VN, rồi **kiểm md5 + content-length cả hai bên**:

```bash
ssh node1 'tar -C /root -cf - flowvpn-apk/VPNFlow-latest.apk flowvpn-apk/VPNFlow-android7.apk \
  | ssh node2 "tar -C /root -xf - && chmod 644 /root/flowvpn-apk/*.apk"'
ssh node1 'md5sum /root/flowvpn-apk/*.apk'; ssh node2 'md5sum /root/flowvpn-apk/*.apk'   # phải giống nhau
curl -sI https://meetflowai.site/v1/downloads/android | grep -i content-length           # phải khớp dung lượng file
```

📌 **Sau mỗi lần thay APK phải PATCH lại phiên bản đang quảng cáo.** Hiện APK là **1.2.8** nhưng
`/v1/app-version` vẫn quảng cáo `latest_version=1.2.6` (lệch — app chưa dùng `latest_version` để
nhắc nhẹ nên chưa gây hại, nhưng phải sửa cho khớp):

```bash
curl -X PATCH https://api.meetflowai.site/v1/admin/android-version \
  -H "Authorization: Bearer $AUTH_TOKEN" -H 'Content-Type: application/json' \
  -d '{"latest_version":"1.2.8"}'      # thêm "minimum_version":"1.2.8" nếu muốn ép mọi người
scripts/check-apk-release.py           # sẽ báo lỗi nếu còn lệch
```

### So APK giữa hai node (chống file cụt / lệch bản)

`scripts/compare-nodes-apk.sh` — so md5 + dung lượng mọi file trong `/root/flowvpn-apk` của node-1
và node-2, tách rõ file **đang phục vụ** (`VPNFlow-latest.apk`, `VPNFlow-android7.apk`,
`MeetFlowAI-latest.apk`) với file lưu trữ; trả mã 1 kèm lệnh sửa nếu file đang phục vụ khác nhau.

```bash
scripts/compare-nodes-apk.sh
# so hai thư mục khác nhau (khi thử):  APK_DIR1=… APK_DIR2=… scripts/compare-nodes-apk.sh
```

Bài học 13/09/2026: copy qua máy trạm bị đứt giữa đường ⇒ node-2 có `VPNFlow-android7.apk` cụt
27MB/96MB mà endpoint vẫn phát. Chạy script này sau mỗi lần copy APK là thấy ngay.

### Quét toàn bộ bề mặt công khai sau mỗi lần đổi hạ tầng

`scripts/check-public-surface.py` — một lệnh kiểm hết: DNS trỏ về đâu, TLS + số ngày còn lại của
cert, 8 trang công khai, 4 endpoint API, payload phiên bản, và **kênh tải APK theo UA** (máy thường
phải nhận `VPNFlow.apk`, máy Android 7/Fire TV phải nhận `VPNFlow-android7.apk`). Trả mã **1** nếu
có mục hỏng ⇒ dùng được trong cron/CI.

```bash
scripts/check-public-surface.py                       # qua DNS thật
scripts/check-public-surface.py --ip 103.6.234.233    # ép kiểm đúng node-2 (như curl --resolve)
scripts/check-public-surface.py --ip 103.173.155.50   # ép kiểm node-1
scripts/check-public-surface.py --expect-site-ip 103.6.234.233   # cảnh báo nếu DNS đổi node
```

Chạy ngay **sau** khi đổi DNS/entry point/deploy — 2 sự cố 13/09/2026 đều vô hình với máy còn cache
DNS, chỉ lộ ra khi kiểm từ bên ngoài hoặc bằng `--ip`.

### Caddy ở edge — thêm route mới trong Node thì PHẢI thêm `handle` (13/09/2026)

`meetflowai.site` **không** proxy toàn bộ vào control-plane: mỗi đường dẫn công khai phải có
`handle` riêng trong `/etc/caddy/Caddyfile`, còn lại rơi vào `file_server` (`/var/www/flowvpn`).
Vì vậy một route mới ở Node có thể **404 ở ngoài** dù gọi thẳng cổng 7778 lại 200 — đúng ca
`/guide`: hoá đơn VPNFlow nào cũng link tới trang hướng dẫn này, nhưng edge trả 404 cho tới khi
thêm `handle /guide*`.

| Đường dẫn | Xử lý ở edge |
|---|---|
| `/buy`, `/buy/*`, `/v1/payments/*` | → control-plane 7778 |
| `/ai/*`, `/v1/ai/*` (gồm `/ai/buy`, `/ai/guide`, `/ai/support`) | → control-plane 7778 |
| `/guide`, `/guide/*` | → control-plane 7778 (thêm 13/09/2026) |
| `/support`, `/support/*` | → control-plane 7778 |
| `/v1/downloads/android`, `/v1/downloads/android-legacy` | → control-plane 7778 |
| `/assets/*` | → control-plane 7778 (logo trang buy) |
| `/open`, `/terms`, `/privacy`, `/PrivateVPN/*`, `/dl/*` | file tĩnh trong `/var/www/flowvpn` |
| còn lại | `file_server` (404 nếu không có file) |

Kiểm nhanh sau khi sửa Caddy — nhớ so **cả hai** phía (edge vs Node):

```bash
for p in /guide /support /ai/guide /buy /open; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://meetflowai.site$p) edge $p"
done
ssh VPS 'for p in /guide /support /ai/guide; do
  echo "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: meetflowai.site" http://127.0.0.1:7778$p) node $p"
done'
```

Sửa Caddyfile: backup → `caddy validate --config /etc/caddy/Caddyfile` → `caddy reload`.
Bản backup gần nhất nằm ở `/root/Caddyfile.backup-<timestamp>`.

### Đĩa trên VPS (theo dõi — đã có lúc chỉ còn 2.1G/20G)

```bash
df -h /            # cảnh báo khi < 15%
du -sh /root/flowvpn-apk   # mỗi APK ~92MB; giữ bản đang phát + 1 bản rollback, xoá bản cũ
journalctl --disk-usage    # 13/09/2026: 683M — dọn bằng: journalctl --vacuum-size=200M
apt-get clean
```

APK chỉ phục vụ qua `/v1/downloads/android` (file `VPNFlow-latest.apk`) và
`/v1/downloads/android-legacy` (`VPNFlow-android7.apk`) — các file `VPNFlow-<version>.apk` chỉ để lưu
trữ nên xoá được. Endpoint không tham chiếu tên file có phiên bản, nên **không** cần sửa cấu hình khi dọn.

## 8. Phát hành Android (play vs china) — cập nhật 2026-09-12

**Package:** `com.meetflow.translator` · **phiên bản hiện tại: 1.0.4 (versionCode 5)**

Hai flavour trong `FChinaTranslator/android/app/build.gradle.kts`:
| Flavour | Ai dùng | Thanh toán | BuildConfig |
|---|---|---|---|
| `play` | Google Play | **Play Billing** (không có web checkout — yêu cầu chính sách Play, xem commit `ecc845d`) | `WEB_PRO_ONLY=false` |
| `china` | Sideload (web bán QR) | **Web checkout** (bank/WeChat/Alipay qua control-plane) | `WEB_PRO_ONLY=true` |

**Artifact đang phát:**
| Kênh | File | Link |
|---|---|---|
| Google Play | AAB (flavour `play`) | https://meetflowai.site/dl/MeetFlowAI-1.0.4-play.aab |
| Sideload | APK (flavour `china`) | https://meetflowai.site/dl/MeetFlowAI-1.0.4-china.apk |
| Update gate + trang support | APK | `https://api.meetflowai.site/v1/ai/downloads/android` → file `/root/flowvpn-apk/MeetFlowAI-latest.apk` |

**Build (project KHÔNG commit gradle wrapper — dùng gradle 8.11.1 có sẵn trên máy):**
```bash
cd /Volumes/BIWIN/SourcesCode/FChinaTranslator/android
GRADLE=$HOME/.gradle/wrapper/dists/gradle-8.11.1-bin/*/gradle-8.11.1/bin/gradle
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=$HOME/Library/Android/sdk $GRADLE :app:bundlePlayRelease    # AAB cho Play
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=$HOME/Library/Android/sdk $GRADLE :app:assembleChinaRelease   # APK sideload
```
Ký bằng `android/keystore/upload-keystore.jks` (`CN=MeetFlow AI, OU=Mobile`) — **dùng đúng keystore này** cho mọi bản lên Play.

**Release notes 5 ngôn ngữ:** `FChinaTranslator/play-assets/RELEASE_NOTES_1.0.4.md` (mỗi ngôn ngữ ≤500 ký tự theo giới hạn "What's new" của Play).

**Sau khi phát hành bản mới:** cập nhật `MeetFlowAI-latest.apk` (endpoint update trong app) và link trên trang support (`/var/www/flowvpn/support.html`, nhớ `chown caddy` + `chmod 644`).
