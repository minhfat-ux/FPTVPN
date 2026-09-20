# Spec: soạn nội dung GỐC cho 19 mục giáo dục (fBuddy)

Bạn là người viết nội dung cho fBuddy — chợ kỹ năng AI tiếng Việt. VIẾT TỪ ĐẦU (không dịch
từ bất kỳ nguồn nào, không chép văn bản có sẵn). Nội dung phải là của bạn.

## Định dạng JSON cần ghi (ghi ra file ops/rewrite-education-<n>.json)

Mỗi mục là một entry:
{
  "<slug>": {
    "name": "tên tiếng Việt (≤120 ký tự)",
    "tagline": "một câu (≤200)",
    "description": "2-4 câu giới thiệu (≤2000)",
    "instructions": "toàn bộ chỉ dẫn cho model, 400-6000 ký tự, như một system-prompt ngắn, rõ, có markdown",
    "i18n": {
      "en": {"name","tagline","description","instructions"},
      "zh": {"name","tagline","description","instructions"}
    }
  }
}

## Quy tắc BẮT BUỘC
- Tiếng Việt là bản gốc; en/zh là bản VIẾT LẠI tự nhiên của bạn (không phải dịch máy).
- Thích nghi cho người dùng Việt Nam/Đông Nam Á: KHÔNG chi tiết chỉ đúng Trung Quốc
  (WeChat/微信, 飞书, 企微, "doanh nghiệp Trung Quốc đầu tư vào…").
- KHÔNG dùng tên thương hiệu bên thứ ba làm tên sản phẩm.
- KHÔNG nhắc tới bất kỳ nguồn/nền tảng nào.
- Chuyên nghiệp, thực dụng, có cấu trúc rõ (dùng ### hoặc -).
- category mọi mục: "Giáo dục". priceVnd: 0 (miễn phí).
- JSON hợp lệ (đúng dấu ngoặc, không comment), lưu với ensure_ascii=False.

## Danh sách 19 slug + chủ đề

1. family-education-ma — Giáo dục gia đình: giúp phụ huynh kèm con học, rèn thói quen, giao tiếp với trẻ.
2. ket-prep-team — Luyện thi KET: ôn chứng chỉ tiếng Anh Cambridge cho trẻ 8-12, từ vựng/ngữ pháp/nghe/nói.
3. vocab-craft-expert — Huấn luyện từ vựng ngoại ngữ: spaced repetition, cách ghi nhớ từ lâu dài.
4. study-planner — Lập kế hoạch học tập: đặt mục tiêu, thời gian biểu, ôn thi theo lộ trình.
5. study-abroad-consultant — Tư vấn du học: chọn trường/ngành, hồ sơ, chi phí, visa.
6. liuxue-yanxue-expert — Du học & trải nghiệm học tập: chương trình trao đổi, trại hè, học ngắn hạn.
7. ai-shifu — Thiết kế khóa học: soạn giáo trình, bài giảng, bài kiểm tra.
8. corporate-training-designer — Thiết kế đào tạo doanh nghiệp: onboarding, kỹ năng, đánh giá hiệu quả.
9. innovation-startup-mentor — Cố vấn khởi nghiệp cho sinh viên: ý tưởng, mô hình kinh doanh, pitch.
10. law-student-coach — Huấn luyện học luật: phân tích case, lý thuyết pháp lý, tư duy phản biện.
11. ncre-expert — Luyện thi chứng chỉ máy tính: tin học văn phòng, kỹ năng công nghệ cơ bản.
12. academic-tutor — Gia sư học thuật: giải thích môn học, hướng dẫn bài tập.
13. english-exam-writing-reviewer — Chấm & chữa bài viết tiếng Anh thi (IELTS/TOEFL/THPT).
14. english-intensive-reader — Đọc sâu tiếng Anh: phân tích văn bản, từ vựng, đọc hiểu.
15. open-lesson — Soạn giáo án: kế hoạch bài dạy chi tiết cho giáo viên.
16. teachany — Dạy mọi chủ đề: cấu trúc bài giảng theo chủ đề bất kỳ.
17. tutor-skills — Kỹ năng gia sư: phương pháp dạy 1-1 hiệu quả.
18. vibeknow-ppt-explain — Giảng giải bài từ PPT/PDF: biến slide/tài liệu thành bài giảng.
19. xiaobai-coach — Kèm người mới: hướng dẫn từ con số 0 theo từng bước nhỏ.
