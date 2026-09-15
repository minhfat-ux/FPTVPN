# Phân tích phương án C — Phát hành qua App Store (unlisted / public)

> Ngày: 2026-09-15 · Trạng thái: **phân tích, chưa quyết** · Người quyết: chủ dự án
> Bối cảnh: Ad Hoc OTA đang chạy tốt nhưng iOS 16+ **buộc khách bật Developer Mode** một lần.
> Tài liệu này trả lời: có đường nào phát qua App Store để bỏ bước đó không, và cái giá là gì.

## 0. Kết luận ngắn (TL;DR)

- **Bỏ Developer Mode thì buộc phải qua App Store (public hoặc unlisted) hoặc TestFlight.**
  Không có cách nào khác cho app cài ngoài App Store (trừ Enterprise — chỉ dùng nội bộ).
- **Nhưng phương án C đụng 4 cổng, và cổng khó nhất là thanh toán (3.1.1)** — đúng lý do nhóm anh
  đã bỏ kênh App Store ngày 14/09/2026 (StoreKit bị xoá khỏi cả iOS lẫn macOS).
- **Muốn đi C thì phải chọn 1 trong 2 mô hình** (không có đường thứ ba hợp lệ):
  **C1 = bán bằng IAP trong app** (tuân thủ mọi nơi, Apple ăn 15–30%) hoặc
  **C2 = app KHÔNG có UI mua** (chỉ đăng nhập tài khoản đã mua trên web; tuân thủ, nhưng phải
  xoá sạch mọi đường dẫn/nút mua ngoài trong app).
- **Rủi ro lớn nhất không nằm ở Apple mà ở khách TQ**: App Store khu vực Trung Quốc **không** phát
  app VPN (cần giấy phép nhà nước) ⇒ khách dùng Apple ID TQ vẫn không tải được, buộc phải đổi sang
  Apple ID nước ngoài. Ad Hoc hiện tại không bị ràng buộc này.

## 1. Unlisted App Distribution là gì (nguyên văn Apple)

Nguồn: <https://developer.apple.com/support/unlisted-app-distribution/>

- Dành cho app "không phù hợp phát hành công khai": *partner sales tools, employee resources, research studies*.
- **Không** xuất hiện trong categories, recommendations, charts, search results hay bất kỳ danh sách nào;
  chỉ vào được bằng **link trực tiếp**. Ai có link cũng cài được (Apple khuyên tự thêm cơ chế chặn).
- Đối tượng Apple nêu: nhân viên bán thời gian, franchisee, đối tác, affiliate, sinh viên, người dự hội nghị.
- **Quy trình**: app phải **đã ở trên App Store** HOẶC **sẵn sàng phát hành và đã nộp App Review**;
  ghi chú trong *Review Notes* là app dự định phát unlisted → rồi **gửi yêu cầu** xin unlisted.
  Yêu cầu **bị từ chối** nếu app chưa nộp review hoặc đang ở trạng thái beta/prerelease.
- Duyệt xong: *Pricing and Availability* → distribution method = **Unlisted App**.

⚠️ **Unlisted KHÔNG phải đường vòng qua review** — vẫn là một listing App Store đầy đủ, vẫn bị soi
đúng bộ guideline như bản public. Unlisted chỉ giảm *khả năng bị tìm thấy*, không giảm *yêu cầu tuân thủ*.

## 2. Bốn cổng phải qua

### Cổng 1 — Guideline 5.4: app VPN phải do **tổ chức (organization)** phát hành
> "Apps that provide VPN services must use the NEVPNManager API and may only be offered by developers
> enrolled as an organization."

- App mình dùng `NEVPNManager` + `NEPacketTunnelProvider` ✓ (đúng yêu cầu kỹ thuật).
- **Phải kiểm tra**: tài khoản Apple Developer dùng để nộp có phải **organization** không?
  Chứng chỉ hiện tại ghi `Minh Nguyen (G6XW3RN6LJ)` (nghe như cá nhân). Muốn nộp App Store cho app VPN
  phải enroll dạng **Company/Organization** (cần **D-U-N-S number**).
- Việc cần làm: xác nhận loại tài khoản; nếu là cá nhân → enroll org (mất vài ngày, cần D-U-N-S).

### Cổng 2 — Guideline 3.1.1: thanh toán (cổng khó nhất)
- 3.1.1: bán nội dung/dịch vụ số **trong app** ⇒ **bắt buộc dùng IAP**. Và **cấm** mọi
  "call-to-action hoặc URL dẫn người dùng ra cơ chế mua ngoài"
  ([đúng lỗi Apple từ chối mẫu](https://developer.apple.com/forums/thread/767296)).
  → **Paywall hiện tại của mình là WebView `/buy` ⇒ chắc chắn bị từ chối.**
- 3.1.3(b) *Multiplatform Services*: được cho người dùng truy cập thứ **đã mua ở nền tảng khác**…
  **với điều kiện những mục đó cũng phải bán được bằng IAP trong app**. ⇒ Không có chuyện
  "chỉ bán qua web, app chỉ đăng nhập" mà vẫn được coi là 3.1.3(b) nếu trong app còn bán/ quảng cáo gói.
- **Ngoại lệ đáng chú ý (2025)**: sau phán quyết Epic kiện Apple, App Store **khu vực Hoa Kỳ** cho phép
  app đặt **nút/link mua ngoài** không cần entitlement và không mất hoa hồng
  ([RevenueCat](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy),
  [Qonversion](https://www.qonversion.io/blog/apple-s-external-payment-ruling-a-win-for-developers-but-only-if-you-re-ready)).
  Chỉ áp cho storefront US — khách dùng Apple ID TQ/khác thì không được hưởng.

### Cổng 3 — Khu vực Trung Quốc: app VPN bị chặn
- Storefront Trung Quốc yêu cầu **giấy phép cung cấp dịch vụ VPN** (nhà nước cấp); không có thì app
  bị gỡ/không phát được ở đó ([Apple forum: app removed from the China App Store](https://developer.apple.com/forums/thread/105600),
  [VPN app return for sale in China](https://developer.apple.com/forums/thread/105152)).
- Hệ quả thực tế: **khách dùng Apple ID TQ sẽ không tải được bản App Store** — phải đổi sang Apple ID
  nước ngoài (việc nhiều người dùng VPN ở TQ vẫn làm, nhưng là thêm một bước phiền, và đổi region
  Apple ID không phải ai cũng làm được).
- Ad Hoc hiện tại **không** bị ràng buộc này (máy nào có UDID trong profile là cài được).

### Cổng 4 — Chất lượng nộp & dữ liệu
- App Privacy labels, mô tả quyền (VPN, thông báo), demo account cho reviewer (đã có
  `review@meetflowai.site` + `DEV_LOGIN_CODE`), xoá tài khoản trong app (đã có), TestFlight/Review notes.
- Repo đã có sẵn: `docs/APP_STORE_SUBMISSION_IOS.md` (checklist + review notes cũ), `docs/APP_STORE_METADATA.md`.

## 3. Ba đường cụ thể

| | **C1 — IAP trong app** | **C2 — App không có UI mua** | **C3 — Hybrid** |
|---|---|---|---|
| Tiền vào | Khách mua **trong app** (IAP) | Khách mua **trên web** (trước/ngoài app) | IAP cho iOS; web cho Android/TQ |
| Tuân thủ | Chắc chắn ✓ (nếu làm đúng) | ✓ nếu **xoá sạch** mọi nút/link/câu mời mua trong app | ✓ |
| Apple ăn | 15–30% | 0% | 15–30% phần bán qua iOS |
| Việc kỹ thuật | **Lớn**: dựng lại StoreKit paywall + tạo products trên ASC + server verify receipt/JWS + **App Store Server Notifications** + restore + test sandbox | **Vừa**: build variant không paywall web; sửa copy (bỏ mọi câu "mua/nâng cấp/gia hạn" trỏ ra ngoài); màn Subscription chỉ hiển thị trạng thái + "quản lý trên web"? (**không được để link**) | Lớn (làm cả hai) |
| Rủi ro review | Thấp | **Trung bình**: reviewer có thể hỏi vì sao app không có cách mua; phải giải thích "tài khoản được cấp ngoài app" trong Review Notes | Thấp |
| Trải nghiệm khách | Mua ngay trong app (dễ nhất) | Khách phải mua trên web trước, rồi đăng nhập app | Tốt nhất |
| Khách TQ | Không tải được (storefront TQ chặn VPN) | Như trên | Như trên |

### Việc kỹ thuật chi tiết cho C1 (nếu chọn)
1. iOS/macOS: dựng lại `StoreKitPaywallView` (đã từng có, đã bị xoá 14/09 — có thể khôi phục từ git).
2. ASC: tạo sản phẩm IAP (`Monthly_Premium`, `Yearly_Premium`…), bật ở đúng các khu vực cần.
3. Server: verify giao dịch (**JWS của App Store Server API**) + webhook **App Store Server Notifications V2**
   để cập nhật gia hạn/hoàn tiền (đây chính là "webhook" trong Integrations mà anh từng hỏi).
4. Đồng bộ quyền: `subscription_status` phải hợp nhất nguồn IAP + web (tránh khách trả tiền mà app vẫn khoá).
5. Test sandbox + TestFlight nội bộ trước khi nộp.

### Việc kỹ thuật chi tiết cho C2 (nếu chọn)
1. Thêm biến thể build "store" (không paywall web) — như cờ `PAYWALL_APPSTORE` ngày trước, nhưng lần này
   paywall **rỗng** thay vì StoreKit: màn "Cần Premium" chỉ nói *"Tài khoản này chưa có gói. Liên hệ hỗ trợ."*
   (**không** link, **không** giá, **không** nút mua).
2. Soát toàn bộ chuỗi trong app: bỏ mọi chỗ nói "mua gói", "nâng cấp", "tại meetflowai.site/buy".
   (`Theme.swift` hiện có `.updateRequiredDetail` nhắc `meetflowai.site/buy` → phải sửa cho bản store.)
3. Màn Subscription: hiển thị trạng thái gói + hạn; nút duy nhất là "Làm mới trạng thái".
4. Force update: `itms-services` là Ad Hoc ⇒ bản store phải dùng **link App Store** thay thế.
5. Review Notes: nêu rõ tài khoản được cấp phát ngoài app (kèm demo account).

## 4. Rủi ro & điều cần xác nhận trước khi quyết

| Câu hỏi | Vì sao quan trọng |
|---|---|
| Tài khoản Developer đang là **individual hay organization**? | Cổng 1: app VPN chỉ được phát bởi **organization**. Nếu đang là individual → phải enroll lại (D-U-N-S, vài ngày) |
| Khách hàng chủ yếu dùng **Apple ID nước nào**? | Nếu phần lớn là Apple ID TQ → C gần như vô dụng cho họ (phải đổi region) |
| Chấp nhận **Apple ăn 15–30%** không? | Quyết định C1 vs C2 |
| Có sẵn sàng bỏ hẳn UI mua trong app không (kể cả các câu mời mua)? | C2 chỉ hợp lệ khi app **sạch** mọi CTA trỏ ra ngoài |
| Unlisted có bị Apple từ chối không? | Apple có quyền từ chối yêu cầu unlisted; khi đó hoặc phát public, hoặc không phát |

## 5. Khuyến nghị

1. **Trước mắt giữ Ad Hoc** (đã chạy, khách TQ dùng được, không phụ thuộc Apple review) + hướng dẫn
   Dev Mode đã có trên trang cài.
2. **Nếu muốn C**: làm **C2 trước** (ít việc, không mất hoa hồng) để thử nộp review + xin unlisted;
   nếu Apple từ chối vì lý do thanh toán → chuyển sang **C1** (IAP) và giữ web cho Android.
3. Trước khi bắt tay, xác nhận **2 câu hỏi chặn**: loại tài khoản Developer (org?) và thị trường
   Apple ID của khách. Sai 1 trong 2 thì C không đáng làm.

## 6. Nguồn

- Apple: [Unlisted App Distribution](https://developer.apple.com/support/unlisted-app-distribution/),
  [Developer Mode (WWDC22)](https://developer.apple.com/videos/play/wwdc2022/110344/)
- Apple Forums: [app removed from the China App Store](https://developer.apple.com/forums/thread/105600),
  [VPN app return for sale in China](https://developer.apple.com/forums/thread/105152),
  [từ chối vì CTA mua ngoài](https://developer.apple.com/forums/thread/767296),
  [IAP cho app có web bán song song](https://developer.apple.com/forums/thread/744873)
- Phán quyết Epic (link mua ngoài ở US): [RevenueCat](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy),
  [Qonversion](https://www.qonversion.io/blog/apple-s-external-payment-ruling-a-win-for-developers-but-only-if-you-re-ready)
- Thực tế sideload/Dev Mode: [PGYER — iOS 应用安装失败原因排查](https://www.pgyer.com/doc/view/ios_install_failed)
- Nội bộ: `docs/APP_STORE_SUBMISSION_IOS.md`, `docs/APP_STORE_READINESS_STATUS.md`, `docs/IOS_ADHOC_OTA.md`
