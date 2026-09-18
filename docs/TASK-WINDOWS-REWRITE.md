# LỆNH CÔNG VIỆC (Windows) — Viết lại 22 mục nhập từ nguồn bên thứ ba

> Người ra lệnh: anh Minh (qua harness Mac). Người thực hiện: **harness Windows**.
> Người nghiệm thu: harness Mac (`ops/verify-rewrite.mjs`). Chính sách nền: [`CONTENT-POLICY.md`](CONTENT-POLICY.md).

## 1. Vì sao phải làm

`instructions` của 22 mục dưới đây hiện là **bản dịch gần nguyên văn** từ nội dung có bản quyền
(WorkBuddy / SkillHub — tác giả gốc + Tencent). Kho nguồn không có LICENSE và ghi rõ cấm tái phân
phối thương mại. **Chợ đã được chuyển sang miễn phí (29/29 mục = 0đ) để hạ rủi ro**, nhưng phát hành
bản dịch vẫn là tác phẩm phái sinh. Việc cần làm: **viết lại bằng văn phong của mình**.

## 2. Phạm vi: đúng 22 mục

**14 chuyên gia (nhóm "Chuyên gia"):**
`vietnam-finance-tax-expert`, `vietnam-public-affairs`, `sg-finance-tax`, `sg-biz-dev`,
`sg-hr-admin-expert`, `malaysia-finance-tax`, `malaysia-legal`, `malaysia-hr-admin`,
`malaysia-marketing`, `indonesia-digital-law-expert`, `indonesia-pa-expert`,
`indonesia-bd-expert`, `thai-marketing-creative`, `thailand-hr-admin`

**8 kỹ năng nhập từ Tencent/SkillHub:**
`cmo`, `one-person-company-plus`, `sales-analyzer`, `reverse-costing`, `accountant`,
`ciabao`, `corp-financial-analysis`, `social-media-lead-generation`

**KHÔNG đụng tới** 7 kỹ năng do mình viết: `lesson-plan`, `data-story`, `content-sales`,
`doc-translate`, `contract-review`, `meeting-notes`, và `brand-voice` (đang `coming_soon`).

## 3. Viết lại nghĩa là gì (bắt buộc)

**Phải:**
- Tự viết lại từ đầu theo **cấu trúc và văn phong của mình**: mục nào cần, thứ tự nào hợp lý, ví dụ nào
  phù hợp người dùng Việt/ĐNA. Giữ **chủ đề, năng lực, phạm vi công việc** (ý tưởng không ai độc quyền).
- Bản gốc (cột `instructions`, tiếng Việt) là bản chính; `i18n.en` viết tiếng Anh **cũng do mình viết**;
  `i18n.zh` viết tiếng Trung **từ bản của mình**, tuyệt đối không chép lại chữ của nguồn.
- Bám bối cảnh thật: luật/thuế/quy định Việt Nam, Singapore, Malaysia, Indonesia, Thái Lan — dùng
  **văn bản pháp luật và số liệu công khai** làm nguồn (được phép, không phải nội dung có bản quyền).
- Mỗi mục 400–6000 ký tự. Câu ngắn, rõ, có phần "khi nào dùng / không dùng / đầu ra mong đợi".

**Không được:**
- Dịch lại từng câu, đổi vài từ, hay giữ nguyên cấu trúc mục lục của nguồn.
- Chép ảnh/avatar/logo (kho nguồn có `experts/<slug>/avatars/expert.png` — **không dùng**).
- Dùng tên thương hiệu bên thứ ba làm tên sản phẩm (Tencent, WorkBuddy, CodeBuddy, 金数据, 企查查,
  美团…). Chỉ nêu khi thực sự có tích hợp, và ghi là "tương thích với…".
- Để lại chi tiết chỉ đúng với người dùng Trung Quốc (WeChat/朋友圈, 飞书, 企微, "doanh nghiệp Trung
  Quốc đầu tư vào…") trừ khi đó là bối cảnh thật của chuyên gia đó.
- Đặt giá. Script áp dụng **luôn gửi `priceVnd: 0`**.

## 4. Cách làm

1. Viết nội dung vào `ops/rewrite-content.json` theo định dạng:

```json
{
  "vietnam-finance-tax-expert": {
    "name": "Chuyên gia Thuế – Tài chính – Kế toán Việt Nam",
    "tagline": "Một câu mô tả ngắn",
    "description": "2–4 câu giới thiệu",
    "instructions": "Toàn bộ chỉ dẫn viết lại (400–6000 ký tự)",
    "i18n": {
      "en": { "name": "…", "tagline": "…", "description": "…", "instructions": "…" },
      "zh": { "name": "…", "tagline": "…", "description": "…", "instructions": "…" }
    }
  }
}
```

2. Chạy thử (không ghi gì): `node ops/rewrite-apply.mjs --file ops/rewrite-content.json`
3. Ghi thật: `node ops/rewrite-apply.mjs --file ops/rewrite-content.json --apply`
   - Token admin: `FBUDDY_ADMIN_TOKEN` hoặc `--token-file %TEMP%\admin-token.txt` (đúng quy ước
     `ops/import-hub-skills.mjs`). API mặc định `http://127.0.0.1:7790/api`, đổi bằng `--base`.
   - Làm từng mục cũng được: thêm `--only <slug>`.
4. Ưu tiên làm **14 chuyên gia trước** (nhóm rủi ro cao nhất), rồi 8 kỹ năng.

## 5. Nghiệm thu (Mac chạy, không cần Windows làm)

Trên node-2: `node ops/verify-rewrite.mjs` — kiểm tra 5 điều cho từng mục:

| # | Điều kiện |
|---|---|
| 1 | `price_vnd = 0` |
| 2 | `instructions` dài 400–6000 ký tự |
| 3 | Bản tiếng Việt không còn ký tự Trung Quốc |
| 4 | **Độ trùng trigram với bản dịch cũ < 35%** (chứng minh viết lại thật) |
| 5 | Có `i18n.en`, và bản tiếng Anh cũng sạch chữ Trung Quốc |

Chạy hết 22 mục PASS thì coi như xong. Trước khi Windows làm, kết quả là **0/22 PASS** (đã chạy thật).

## 6. Sau khi xong

- Vẫn **để miễn phí** cho tới khi anh Minh quyết định khác (chỉ nội dung tự viết mới cân nhắc thu phí).
- Báo lại Mac qua kênh ping trong [`ASK-WINDOWS.md`](ASK-WINDOWS.md) kèm slug đã làm.
