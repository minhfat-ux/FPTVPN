# Brief: viết nội dung GỐC (tiếng Việt là bản gốc) cho 7 mục giáo dục fBuddy

Dùng cho nhóm A của `ops/rewrite-education-spec.md`. Mỗi người viết chỉ viết ĐÚNG 1 slug của mình,
ghi ra 1 file JSON riêng (đường dẫn do người giao việc chỉ định).

## Viết TỪ ĐẦU
- KHÔNG dịch, KHÔNG chép, KHÔNG bám theo bất kỳ văn bản/nguồn nào. Nội dung là của bạn.
- Tiếng Việt là bản gốc và đầy đủ nhất. `en` và `zh` là bản VIẾT LẠI tự nhiên bằng chính ngôn ngữ đó
  (không phải bản dịch máy, không sao chép cấu trúc câu chữ của bản vi).

## Định dạng JSON (một file = một entry)
```json
{
  "<slug>": {
    "name": "tên tiếng Việt, tối đa 120 ký tự",
    "tagline": "một câu, tối đa 200 ký tự",
    "description": "2-4 câu giới thiệu, tối đa 2000 ký tự",
    "instructions": "toàn bộ chỉ dẫn cho model, 400-6000 ký tự, như một system-prompt ngắn, rõ, có markdown",
    "category": "Giáo dục",
    "priceVnd": 0,
    "i18n": {
      "en": {"name": "...", "tagline": "...", "description": "...", "instructions": "..."},
      "zh": {"name": "...", "tagline": "...", "description": "...", "instructions": "..."}
    }
  }
}
```
- JSON hợp lệ tuyệt đối: dấu ngoặc đúng, không comment, không dấu phẩy thừa.
- Ghi file bằng script Node với `JSON.stringify(obj, null, 1)` (UTF-8, ensure_ascii=False) để chữ Việt
  và chữ Hán hiện nguyên dạng. Khuyến nghị viết bằng một script Node nhỏ rồi chạy, để tránh lỗi JSON.

## Quy tắc BẮT BUỘC
- `instructions` mỗi ngôn ngữ: **400-6000 ký tự**. vi là bản dài nhất/đầy đủ nhất; en và zh đầy đủ
  nhưng có thể ngắn hơn một chút. Độ dài `instructions` của en và zh KHÔNG được bằng đúng độ dài bản vi
  (bị coi là chép). Nên lệch nhau ít nhất vài chục ký tự.
- Bản vi và en TUYỆT ĐỐI không chứa ký tự chữ Hán (CJK). Bản zh thì phải là tiếng Trung.
- Thích nghi cho người dùng Việt Nam / Đông Nam Á: KHÔNG chi tiết chỉ đúng Trung Quốc
  (không WeChat/微信, 飞书, 企微, không "doanh nghiệp Trung Quốc đầu tư vào…", không kỳ thi/giấy tờ
  chỉ có ở Trung Quốc). Bối cảnh mặc định: học sinh - phụ huynh - giáo viên Việt Nam, mở rộng Đông Nam Á.
- KHÔNG dùng tên thương hiệu bên thứ ba (không Duolingo, Anki, Quizlet, ChatGPT, Zoom, Tencent,
  không tên app/nền tảng nào) làm tên sản phẩm hay để so sánh. KHÔNG nhắc tới bất kỳ nguồn/nền tảng nào.
- Tên chứng chỉ/kỳ thi phổ quát thì được nhắc khi chủ đề yêu cầu (KET/PET, IELTS, TOEFL) — nhưng không
  gắn với thương hiệu nào khác.
- Giọng chuyên nghiệp, thực dụng, có cấu trúc rõ (dùng `###` và gạch đầu dòng). Không hứa hẹn tuyệt đối,
  không cam kết điểm số/đỗ đạt.
- `instructions` phải viết như chỉ dẫn vận hành cho model: có vai trò, quy trình từng bước, quy tắc ứng xử,
  định dạng đầu ra, và các trường hợp cần hỏi lại người dùng. Nêu rõ cách hỏi thông tin còn thiếu.
- Nội dung phải khác biệt giữa các slug: không dùng chung một bộ gạch đầu dòng cho nhiều mục.

## Tự kiểm tra trước khi báo xong
Chạy một lệnh Node để in ra độ dài instructions của vi/en/zh và kiểm tra không có CJK trong vi/en:
```bash
node -e "const o=require('/duong/dan/file.json');const k=Object.keys(o)[0];const e=o[k];const L=s=>String(s||'').length;console.log(k,'vi',L(e.instructions),'en',L(e.i18n.en.instructions),'zh',L(e.i18n.zh.instructions));console.log('CJK vi',/[\u3400-\u9fff]/.test(e.instructions),'CJK en',/[\u3400-\u9fff]/.test(e.i18n.en.instructions));"
```
Tất cả các số phải nằm trong 400-6000.
