# Chính sách nội dung & bản quyền của chợ kỹ năng fBuddy

> Trạng thái: **đang áp dụng** từ 2026-09-18. Mọi thay đổi giá/nguồn nhập phải tuân theo file này.

## 1. Quyết định

**Toàn bộ chợ kỹ năng để MIỄN PHÍ. Không bán.** Ngày 2026-09-18 đã đặt 29/29 mục
`price_vnd = 0` và `price = 0` (không mục nào còn thu credit).

Lý do: phần lớn nội dung trong chợ được nhập từ nguồn bên thứ ba (WorkBuddy / SkillHub —
đều thuộc Tencent và các tác giả gốc). Bán lại là **tái phân phối thương mại** nội dung không
được cấp phép.

## 2. Vì sao có rủi ro (dữ kiện, không phải phỏng đoán)

- Kho `infometa/workbuddyskills` (nguồn 14 chuyên gia VN/ĐNA) **không có LICENSE**, GitHub trả
  `license: None`; mô tả repo: *"archive for **offline study**"*.
- README của kho ghi rõ: nội dung lấy từ WorkBuddy/CodeBuddy, **bản quyền thuộc tác giả gốc và các
  sản phẩm liên quan của Tencent**, và **cấm tái phân phối thương mại khi chưa được phép**.
- Tải công khai được **không** đồng nghĩa được phép bán lại. Gói marketplace không kèm giấy phép thương mại.
- Điều khoản Tencent cấm thu thập/tái sử dụng kiểu này (WorkBuddy, CodeBuddy).
- **Dịch là tác phẩm phái sinh**: `instructions` hiện tại của các mục nhập từ nguồn ngoài là bản dịch
  gần nguyên văn (ví dụ `vietnam-finance-tax-expert`). Dịch xong vẫn cần phép của chủ sở hữu.
- Ảnh trong `experts/<slug>/avatars/expert.png` là **tài sản hình ảnh** của họ — không copy.

Miễn phí **giảm mạnh** rủi ro (không còn yếu tố thương mại) nhưng **không xoá hết**: phát hành vẫn là
sao chép/phái sinh. Cách sạch nhất vẫn là **viết lại**.

## 3. Quy tắc bắt buộc

1. **Nội dung nhập từ nguồn ngoài: luôn `price_vnd = 0`.** Hai script nhập đã đổi mặc định
   `--price-vnd` từ `50000` → `0` (`ops/workbuddy-import.mjs`, `ops/skillhub-import.mjs`).
   Muốn gán giá phải là nội dung **do mình viết hoàn toàn**.
2. **Không copy ảnh/avatar/logo** của nguồn. Chỉ dùng ảnh tự tạo.
3. **Không dùng thương hiệu bên thứ ba làm tên sản phẩm bán ra** (Tencent, WorkBuddy, CodeBuddy,
   tên app Trung Quốc...). Chỉ nêu khi thực sự có tích hợp.
4. **Viết lại, không dịch**: giữ chủ đề/chức năng (ý tưởng và dữ kiện không được bảo hộ), nhưng văn phong,
   cấu trúc, ví dụ, tiêu đề phải là của mình. Nguồn công khai hợp lệ để dựa vào: văn bản luật, thông tư,
   số liệu công bố của cơ quan nhà nước.
5. Nếu muốn dùng nguyên nội dung gốc: **xin phép bằng văn bản**, hoặc chỉ dùng nội bộ (không phát hành).
6. Ghi nguồn tham khảo khi phù hợp (attribution) — nên làm, nhưng **không thay thế** giấy phép.
7. Có đường gỡ bỏ khi nhận khiếu nại: ẩn mục (`state = 'hidden'`) trong vòng 24h và lưu lại nguồn gốc.

## 4. Việc còn lại (TODO lớn)

- [ ] Viết lại 14 chuyên gia VN/ĐNA (nhóm "Chuyên gia") bằng văn phong riêng, bỏ toàn bộ câu chữ dịch từ nguồn.
- [ ] Viết lại 8 kỹ năng nhập từ SkillHub; soát điều khoản SkillHub trước khi nhập thêm.
- [ ] Tự tạo avatar cho chuyên gia (monogram + màu thương hiệu) — thay icon Lucide chung.
- [ ] Rà `web/public/connectors.json` (103 mục, hiện chỉ là metadata đã dịch) và ghi rõ nguồn tham khảo.
- [ ] Sau khi viết lại xong mới cân nhắc thu phí — chỉ với nội dung do mình viết 100%.

## 5. Trạng thái kỹ thuật liên quan

- Mọi mục free đã có sẵn đường xử lý: `creditsForPriceVnd(0)` → 0 credit, không phát sinh lỗi 402;
  UI hiện "Miễn phí" / nút "Nhận" thay cho nút mua (`web/src/hub/hubFormat.ts`).
- Giá cũ trước khi free được lưu tại `/root/hub-prices-before-free.json` trên node-2 (để đối chiếu).

*Lưu ý: đây là phân tích rủi ro kỹ thuật, không phải tư vấn pháp lý. Nếu định thương mại hoá ở quy mô lớn,
nên hỏi luật sư về sở hữu trí tuệ.*
