# LỆNH CÔNG VIỆC (Windows) — Thêm 18 mục GIÁO DỤC cho fBuddy

> Người giao: anh Minh (qua harness Mac). Người làm: **harness Windows**.
> Nghiệm thu: harness Mac. Chính sách nền: [`CONTENT-POLICY.md`](CONTENT-POLICY.md).

## 1. Mục tiêu

Tìm + thêm các skill/expert về **giáo dục** (dạy học, trẻ em, ngoại ngữ, luyện thi, du học,
lập kế hoạch học tập) vào chợ fBuddy, nhóm category **"Giáo dục"**.

## 2. Danh sách 18 mục (slug trong kho WorkBuddy)

**11 expert:**
| slug | chủ đề |
|---|---|
| `family-education-ma` | Giáo dục gia đình (phụ huynh + trẻ em) |
| `ket-prep-team` | Luyện thi KET (chứng chỉ tiếng Anh trẻ em) |
| `vocab-craft-expert` | Huấn luyện từ vựng ngoại ngữ |
| `study-planner` | Lập kế hoạch học tập |
| `study-abroad-consultant` | Tư vấn du học |
| `liuxue-yanxue-expert` | Du học & trải nghiệm học tập |
| `ai-shifu` | Thiết kế khóa học |
| `corporate-training-designer` | Thiết kế đào tạo doanh nghiệp |
| `innovation-startup-mentor` | Cố vấn khởi nghiệp cho sinh viên |
| `law-student-coach` | Huấn luyện học luật |
| `ncre-expert` | Luyện thi chứng chỉ máy tính |

**7 skill:**
| slug | chủ đề |
|---|---|
| `academic-tutor` | Gia sư học thuật |
| `english-exam-writing-reviewer` | Chấm/chữa bài viết tiếng Anh thi |
| `english-intensive-reader` | Đọc sâu tiếng Anh |
| `open-lesson` | Soạn giáo án |
| `teachany` | Dạy mọi chủ đề |
| `tutor-skills` | Kỹ năng gia sư |
| `study-planner` (skill) | Lập kế hoạch học tập (bản skill) |

## 3. Cách làm (giống 22 mục trước)

1. Lấy nội dung gốc từ kho: `ops/workbuddy-fetch.mjs` + `ops/workbuddy-catalog.json` (đã có sẵn).
2. **VIẾT LẠI bằng văn phong riêng** (KHÔNG dịch lại từng câu) — quy tắc đầy đủ trong
   [`CONTENT-POLICY.md`](CONTENT-POLICY.md) §3: bỏ chi tiết chỉ đúng người dùng Trung Quốc,
   không dùng tên thương hiệu bên thứ ba, không copy avatar/ảnh.
3. Ghi nội dung vào `ops/rewrite-education.json` theo đúng cấu trúc của `ops/rewrite-content.json`
   (name/tagline/description/instructions + `i18n.en` + `i18n.zh` viết mới).
4. Nhập vào chợ với `category: "Giáo dục"`, `priceVnd: 0`, `state: "published"` (hoặc `coming_soon` nếu chưa chắc).
5. **Mỗi mục xong thì `progress`**; xong hết thì `done --evidence`.

## 4. Nghiệm thu (Mac chạy)

`node ops/verify-rewrite.mjs --slugs "<18 slug cách nhau dấu phẩy>"` — khoá: `price_vnd=0`,
độ dài 400–6000, bản tiếng Việt không còn chữ Trung Quốc, có `i18n.en`.
(18 mục này là nội dung MỚI nên không có baseline để so độ trùng — Mac sẽ đọc thử vài mục
để chắc nó không phải bản dịch.)

## 5. Lưu ý

- **KHÔNG đụng 22 mục của T-20260918-01** (Mac đã nghiệm thu, xong).
- Ưu tiên: `ket-prep-team`, `vocab-craft-expert`, `family-education-ma`, `academic-tutor`,
  `english-exam-writing-reviewer`, `english-intensive-reader`, `open-lesson` (đúng yêu cầu
  "giáo dục cho trẻ em + ngoại ngữ" của anh Minh).
- Nếu không thấy "giải toán" thì bỏ qua — Mac sẽ tự soạn một skill giải toán nội bộ sau.

## 6. BỔ SUNG (theo yêu cầu anh Minh) — thêm "giáo viên" + 2 mục giảng dạy

### 6.1 Giáo viên AI cho trẻ em — `ai-teacher-kids` (VIẾT MỚI, không import)

Kho WorkBuddy **không có** expert "giáo viên" thuần (chỉ có công cụ làm khóa học). Nên mục này
**do mình tự viết từ đầu** (original, không phải bản dịch, không dính nguồn bên thứ ba):

- **Tên**: "Giáo viên AI cho trẻ em" · category `Giáo dục` · `priceVnd: 0`.
- **Nhiệm vụ**: dạy kèm cho trẻ 5–14 tuổi các môn: **tiếng Anh, tiếng Việt, toán, khoa học tự nhiên**.
- **Cách dạy**: trước tiên hỏi độ tuổi + trình độ + môn muốn học; dùng phương pháp sư phạm
  (Socratic, ví dụ cụ thể, câu chuyện/trò chơi, khen đúng lúc, chia bài học thành bước nhỏ);
  giải thích lại nếu trẻ chưa hiểu; cho bài tập ngắn + đáp án; luôn an toàn, không nội dung
  người lớn, khuyến khích có người lớn bên cạnh.
- **Đầu ra**: một bài học nhỏ có cấu trúc (mục tiêu → giải thích → ví dụ → bài tập → đáp án → gợi ý tiếp).

### 6.2 Hai mục giảng dạy import thêm từ kho

| slug | chủ đề |
|---|---|
| `vibeknow-ppt-explain` | Giảng giải bài từ PPT/PDF |
| `xiaobai-coach` | Kèm người mới học từ con số 0 |

Quy tắc viết lại vẫn như §3. Tổng cộng **21 mục** (18 cũ + `ai-teacher-kids` + 2 trên).

## 7. Danh sách slug đầy đủ để nghiệm thu (21)

```
family-education-ma,ket-prep-team,vocab-craft-expert,study-planner,study-abroad-consultant,liuxue-yanxue-expert,ai-shifu,corporate-training-designer,innovation-startup-mentor,law-student-coach,ncre-expert,academic-tutor,english-exam-writing-reviewer,english-intensive-reader,open-lesson,teachany,tutor-skills,ai-teacher-kids,vibeknow-ppt-explain,xiaobai-coach
```
