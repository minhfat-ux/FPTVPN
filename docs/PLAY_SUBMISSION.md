# VPNFlow — Google Play Submission Pack (v1.2.2)

_Trạng thái: chưa từng submit. Tài liệu này là checklist + nội dung để đưa app lên Play Console._

## 0. Artifact đã sẵn sàng

| File | Đường dẫn | Ghi chú |
|---|---|---|
| AAB (Play) | `release/android/VPNFlow-1.2.2-play-store.aab` | 39 MB, versionCode **2** / versionName **1.2.2**, ký release cert VPNFlow, build từ branch **`store`** (không có UI mua gói) |
| SHA256 AAB | `c00e23adcd127d352a2a81255695672c67a8b137174defd652e3d02ebeab2218` | |
| APK (sideload) | `release/android/VPNFlow-1.2.2-arm64-x86-universal.apk` | 96 MB universal, phát qua `meetflowai.site/v1/downloads/android` |
| Icon 512×512 | `release/android/play-assets/icon-512.png` | từ icon app (1024 gốc) |
| Feature graphic 1024×500 | `release/android/play-assets/feature-graphic-1024x500.png` | navy + logo + tagline |
| Screenshots | _cần chụp_ | tối thiểu 2 ảnh phone (1080×1920+), nên 4–8 ảnh |
| Release notes 5 ngôn ngữ | `release/android/RELEASE_NOTES_1.2.2.md` | dán vào Play "What's new" |

Package name: **com.privatevpn.app** · minSdk 26 · targetSdk 36 (đạt yêu cầu Play 2026).

## 1. Tài khoản & bước bắt buộc

1. **Loại tài khoản**: tài khoản **cá nhân** tạo sau 11/2023 phải chạy **closed testing với ≥12 tester trong 14 ngày liên tục** trước khi xin lên production. Tài khoản **tổ chức** (cần D-U-N-S) không bị yêu cầu này → nếu có pháp nhân, dùng org account sẽ nhanh hơn nhiều.
2. Tạo app mới: tên **VPNFlow**, ngôn ngữ mặc định **English (US)**, app = **App**, **Free**.
3. Bật **Play App Signing** (Google giữ signing key; ta upload bằng upload key = keystore `~/keystores/vpnflow-release.jks`). Lưu ý: nếu app đã từng có bản khác cùng package thì phải dùng đúng key cũ.

## 2. Store listing (copy & paste)

### English (default)
- **App name (≤30)**: `VPNFlow — Fast Secure VPN`
- **Short description (≤80)**: `Fast, private VPN built for China. Hysteria2 engine, no activity logs.`
- **Full description**:
```
VPNFlow is a fast, privacy-first VPN built for networks where ordinary VPNs fail.

WHY VPNFLOW
• Hysteria2 engine — modern, fast and resilient even on restrictive networks
• Smart fallback: if UDP is blocked (hotel Wi-Fi, campus, corporate networks, mobile carriers) VPNFlow automatically switches to a TCP tunnel and keeps working
• Choose your exit server (Vietnam 1 / Vietnam 2) right in the app
• Automatic reconnection when the network drops
• No activity logs: we do not record the sites you visit

SIMPLE
1. Sign in with your email
2. Pick a server
3. Tap Connect — that's it

Requires an active subscription. Manage your plan from your account page.
Support: support@meetflowai.site
```

### Tiếng Việt
- **Tên app**: `VPNFlow — VPN nhanh & riêng tư`
- **Mô tả ngắn**: `VPN nhanh, riêng tư, tối ưu cho mạng khó. Không lưu log hoạt động.`
- **Mô tả đầy đủ**:
```
VPNFlow là VPN nhanh, ưu tiên riêng tư, được làm cho những mạng mà VPN thông thường bó tay.

VÌ SAO CHỌN VPNFLOW
• Engine Hysteria2 — nhanh, ổn định kể cả trên mạng bị hạn chế
• Tự động chuyển sang đường TCP khi UDP bị chặn (Wi-Fi khách sạn, mạng công ty, nhà mạng) — kết nối không bị "chết"
• Chọn server ra quốc tế (Vietnam 1 / Vietnam 2) ngay trong app
• Tự động kết nối lại khi mạng rớt
• Không lưu log hoạt động: chúng tôi không ghi lại website bạn truy cập

CÁCH DÙNG
1. Đăng nhập bằng email
2. Chọn server
3. Bấm Connect

Cần gói đang hoạt động. Quản lý gói trong trang tài khoản.
Hỗ trợ: support@meetflowai.site
```

### 中文
- **应用名称**: `VPNFlow — 高速安全 VPN`
- **简短说明**: `为复杂网络打造的高速隐私 VPN，无活动日志。`
- **完整说明**:
```
VPNFlow 是一款高速、注重隐私的 VPN，专为普通 VPN 无法工作的网络环境打造。

为什么选择 VPNFLOW
• Hysteria2 引擎——在现代受限网络下依然快速稳定
• 智能回退：当 UDP 被屏蔽（酒店 Wi-Fi、校园网、公司网络、运营商）时自动切换到 TCP 通道，连接不再中断
• 在应用内直接选择出口服务器（Vietnam 1 / Vietnam 2）
• 网络中断时自动重连
• 不记录活动日志：我们不会记录您访问的网站

使用步骤
1. 使用邮箱登录
2. 选择服务器
3. 点击 Connect

需要有效的订阅。可在账户页面管理套餐。
客服：support@meetflowai.site
```

_(Play 还支持 ja/ko locale — 需要 thì lấy từ `RELEASE_NOTES_1.2.2.md`.)_

## 3. Đồ hoạ cần upload

| Loại | Yêu cầu Play | File |
|---|---|---|
| App icon | 512×512 PNG 32-bit | `play-assets/icon-512.png` ✅ |
| Feature graphic | 1024×500 PNG/JPG | `play-assets/feature-graphic-1024x500.png` ✅ |
| Phone screenshots | 2–8 ảnh, cạnh 1080–3840px, tỉ lệ 16:9 hoặc 9:16 | **cần chụp** (trang chủ connected, danh sách server, cài đặt, paywall) |
| 7"/10" tablet | không bắt buộc | bỏ qua |

## 4. App content (bắt buộc khai trong Play Console)

1. **Privacy policy URL**: `https://meetflowai.site/privacy`
2. **Ads**: No ads.
3. **App access**: có login → cung cấp **tài khoản test** (email + mật khẩu OTP/mật khẩu demo) trong mục "App access → All functionality is available without special access? No" và ghi chú cách đăng nhập. Chuẩn bị 1 tài khoản Pro test.
4. **Content rating**: điền questionnaire (category: Utility/Communication). VPN → chọn "Yes" ở mục chia sẻ vị trí? Không; app không thu vị trí. Kết quả thường là 3+/PEGI 3 hoặc 12+ tuỳ phần hỏi về nội dung.
5. **Target audience**: 18+ (VPN trả phí) — tránh Children category.
6. **News app**: No. **COVID**: No. **Data safety**: khai như dưới.
7. **VPN declaration**: Play hỏi app có dùng VpnService không → chọn **Yes**, mục đích: cung cấp kết nối VPN cho người dùng; cam kết không dùng VpnService cho mục đích khác (ad-blocking, thu thập dữ liệu). App chỉ dùng `VpnService` để tạo tunnel — không lọc quảng cáo, không đọc nội dung traffic.
8. **Permissions declaration**: `FOREGROUND_SERVICE` (WireGuard backend notification) — nếu Play yêu cầu video demo thì quay cảnh kết nối VPN.

### Data safety (gợi ý khai đúng thực tế)
| Câu hỏi | Trả lời |
|---|---|
| Thu thập dữ liệu? | **Có** |
| Email address | Thu thập (đăng nhập tài khoản, quản lý gói) — mục đích: App functionality, Account management |
| Purchase history | Thu thập (trạng thái gói/serial thanh toán) — App functionality |
| Device or other IDs | Thu thập (định danh thiết bị để gán IP overlay) — App functionality |
| App activity / Web browsing | **Không** thu thập (không lưu log truy cập) |
| Location | **Không** thu thập |
| Dữ liệu mã hoá khi truyền | Yes (HTTPS/TLS) |
| Người dùng có thể yêu cầu xoá dữ liệu | Yes — qua support@meetflowai.site |
| Bán dữ liệu cho bên thứ ba | **Không** |

## 4b. Branch strategy (đã tách)

| Branch | Dùng cho | Khác biệt |
|---|---|---|
| `main` / `web` | Bán gói qua **web** — APK sideload (`meetflowai.site/v1/downloads/android`) | `Config.SELL_ON_WEB = true`: paywall mở WebView trang buy (WeChat/Alipay/bank QR) |
| `store` | **Google Play** — AAB upload lên Play Console | `Config.SELL_ON_WEB = false`: paywall chỉ hiện màn hình thông tin + nút "Restore purchases" + mailto support; **không giá, không link ra trang bán**; ẩn cả thẻ nâng cấp ở màn chính |

Ngoài cờ `SELL_ON_WEB`, branch `store` còn được dọn cho đúng chuẩn Play:
- Bỏ **toàn bộ Play Billing** (`billing-ktx` dependency + `BillingClient`) → app không còn khai báo quyền `com.android.vending.BILLING`; quyền lợi chỉ đọc từ backend theo tài khoản đăng nhập.
- Bỏ các permission thừa: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_VPN`, `POST_NOTIFICATIONS` (không nơi nào gọi `startForeground`) → bản Play chỉ còn `INTERNET` + `ACCESS_NETWORK_STATE`.
- Xoá service chết `RelayProtectService`.
- Thêm `-dontwarn com.google.errorprone.annotations.**` (R8, do Tink tham chiếu annotation không có trên runtime). AAB nộp Play **phải** build từ branch `store`; APK bán web build từ `main`/`web`.

Cách build:
```bash
git checkout store && ./gradlew :app:bundleRelease     # AAB cho Play
git checkout main  && ./gradlew :app:assembleRelease   # APK bán web
```

## 5. ⚠️ Chính sách thanh toán — đã xử bằng branch `store`

App hiện bán gói **trong app bằng web** (mở trang buy với WeChat/Alipay/bank QR — `Config` trỏ tới `meetflowai.site/buy`). Google Play **Payments policy** yêu cầu mọi nội dung số bán trong app phải dùng **Play Billing**. Nộp nguyên trạng rất dễ bị reject.

**Đã chọn: tách branch (phương án A).** Branch `store` ẩn toàn bộ UI mua gói và **không có bất kỳ liên kết nào ra trang bán** → không vi phạm Payments policy:

- Màn chính: thẻ "nâng cấp" bị ẩn khi chưa có gói (`SELL_ON_WEB = false`).
- Paywall: hiện thông tin "Premium Required" + nút **Restore purchases** (đồng bộ lại quyền lợi từ backend) + liên hệ support qua **mailto**. Không hiển thị giá, không mở web.
- Người dùng mua gói ở ngoài app (web) rồi đăng nhập trong bản Play là dùng được.

Nếu sau này muốn bán trực tiếp trên Play thì mới cần **Play Billing** (library + xác thực purchase token với backend) — hiện chưa làm.

## 6. Trình tự submit

1. Tạo app → điền App content (mục 4) + Data safety + Content rating + Target audience.
2. Upload `VPNFlow-1.2.2-play.aab` vào **Closed testing** (internal testing trước để tự test).
3. Thêm ≥12 tester (nếu account cá nhân) → chạy 14 ngày liên tục.
4. Kiểm tra pre-launch report (Play tự chạy trên máy thật) — xem crash/ANR.
5. Xin **Production access** → rollout 20% → theo dõi → 100%.
6. Sau khi live: **giữ đúng upload key**, mọi bản sau tăng `versionCode`.

## 7. Việc cần làm tiếp (owner)

- [x] Chốt phương án thanh toán → tách branch `store` (không bán trong app)
- [ ] Chụp screenshots từ máy thật (≥4 ảnh) và copy vào `release/android/play-assets/`
- [ ] Tạo tài khoản Pro test để khai "App access"
- [ ] Xác nhận loại tài khoản Play (cá nhân/tổ chức) → biết có phải chạy 12 tester × 14 ngày không
