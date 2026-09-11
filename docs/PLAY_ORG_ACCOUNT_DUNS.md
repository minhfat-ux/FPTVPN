# Google Play Organization account — chuẩn bị D-U-N-S (Việt Nam)

_Điều kiện tiên quyết: có **pháp nhân** (công ty/TNHH/CP) hoặc ít nhất là hộ kinh doanh có ĐKKD._
_Lợi ích: tài khoản **Organization** KHÔNG bị yêu cầu closed testing 12 tester × 14 ngày._

## 0. Kiểm tra trước: có thể đã có D-U-N-S rồi!
- **Apple Developer Organization account** (nếu anh đang dùng) → D-U-N-S đã tồn tại, **dùng lại được cho Google** (D-U-N-S là mã định danh doanh nghiệp dùng chung, không phải mã của Apple/Google).
- Hợp đồng với doanh nghiệp nước ngoài / hồ sơ xuất khẩu / nền tảng B2B (Amazon, Alibaba…) đôi khi cũng đã cấp D-U-N-S sẵn.
- Tra cứu nhanh: https://www.dnb.com/duns-number/lookup.html (nhập tên + thành phố). Nếu thấy tên công ty mình → ghi lại số D-U-N-S, **bỏ qua bước 1**.

## 1. Xin D-U-N-S (miễn phí)
- Đường xin miễn phí (chọn "I need a D-U-N-S Number for Google Play" nếu vào từ Play Console):
  - D&B global: https://www.dnb.com/duns-number/get-a-duns.html
  - Play Console cũng có link xin trực tiếp trong bước "Organization details" khi tạo tài khoản org → nên **bắt đầu từ Play Console** để đúng luồng Google.
- Thời gian: thường **5–30 ngày làm việc**. Google Play chấp nhận "đang chờ D-U-N-S" trong lúc chờ duyệt.

### Thông tin phải khớp 100% với giấy tờ
| Trường | Lưu ý |
|---|---|
| **Legal entity name** | Tên pháp nhân **bằng tiếng Anh** (như trên ĐKKD/hoá đơn quốc tế), KHÔNG dùng tên thương hiệu |
| **Address** | Địa chỉ đăng ký kinh doanh; điền đúng như ĐKKD, không viết tắt |
| **Phone** | Số điện thoại **của doanh nghiệp** (số có trên website/ĐKKD), không dùng số cá nhân |
| **Website** | Domain có thật + có thông tin liên hệ khớp tên/địa chỉ (vd `meetflowai.site`) |
| **Email** | Nên dùng email **theo domain công ty** (`support@meetflowai.site`) — Gmail cá nhân dễ bị từ chối |
| **Mã số thuế / ĐKKD** | Chuẩn bị sẵn để đối chiếu khi D&B gọi xác minh |
| **Ngành/năm thành lập/quy mô** | Ước lượng được, không cần chính xác tuyệt đối |

### Mẹo để không bị trả lại
1. **Trả lời điện thoại** của D&B (họ gọi xác minh; gọi nhỡ nhiều lần có thể bị huỷ yêu cầu).
2. Website phải hiển thị tên pháp nhân + địa chỉ + email domain (trang About/Contact) — D&B và Google đều kiểm.
3. Địa chỉ trên website = địa chỉ ĐKKD. Sai lệch là lý do phổ biến nhất bị từ chối.
4. Không xin trùng lặp nhiều lần cùng một doanh nghiệp → tạo hồ sơ trùng, bị gộp/treo.

## 2. Tạo tài khoản Organization trên Play Console
- Chi phí **25$** (một lần). **Không thể chuyển tài khoản cá nhân → tổ chức**; phải tạo account mới.
- Cần: D-U-N-S, tên + địa chỉ pháp nhân khớp D-U-N-S, **email theo domain** để xác minh.
- Google xác minh tổ chức: có thể yêu cầu **giấy tờ đăng ký doanh nghiệp** (upload), duyệt 1–7 ngày.
- Nếu anh muốn dùng app `com.privatevpn.app` đã tạo ở account cá nhân: dùng tính năng **Transfer app** sang account mới (không mất versionCode/đánh giá).

## 3. Sau khi có org account
- Upload AAB: `release/android/VPNFlow-1.2.2-play-store.aab` (branch `store`).
- **Không cần** closed testing 12 tester → có thể đẩy thẳng Internal testing → Production.
- Vẫn phải điền đủ: App content, Data safety, Content rating, Privacy policy (`https://meetflowai.site/FlowVPNPrivacy.html`), App access (account review: `review@meetflowai.site` / `246810`).
- Vẫn nên chạy **Internal testing** vài ngày để có pre-launch report trước khi rollout 100%.

## 4. Checklist nhanh cho anh
- [ ] Xác nhận có ĐKKD/pháp nhân → chụp lại ĐKKD (bản gốc + bản tiếng Anh nếu có)
- [ ] Kiểm tra đã có D-U-N-S chưa (mục 0)
- [ ] Chuẩn bị: tên pháp nhân EN, địa chỉ, SĐT doanh nghiệp, website, email domain, MST
- [ ] Vào Play Console → tạo tài khoản Organization → xin D-U-N-S theo luồng Google (nếu chưa có)
- [ ] Trang About/Contact của `meetflowai.site` hiển thị đúng tên + địa chỉ pháp nhân
- [ ] Nhận D-U-N-S → hoàn tất xác minh → upload AAB
