# R-004 Phụ lục C — Bộ đề eval 42 ca (tiếng Việt, chấm được bằng máy)

| | |
|---|---|
| **Thuộc nghiên cứu** | R-004 |
| **Feature** | **F-004 — Chọn model thích ứng** (bộ đo chất lượng, điều kiện đầu vào của F-001 và F-003) |
| **Ngày soạn** | 20/09/2026 |
| **Trạng thái** | **Đề cương để duyệt** — chưa tạo fixture, chưa chạy |
| **Cách dùng** | Chạy cùng một bộ đề trên **model hiện tại** (mốc nền) và các model ứng viên; so sánh theo phụ lục B §B.3 |

> Quy ước: mỗi ca có `id`, `intent`, `prompt`, `fixture`, **kiểm được bằng máy** (`must_contain`, `must_not_contain`,
> `expect_tool`, `expect_artifact`), và `rubric` 0/1/2 cho phần chủ quan.
> **Chấm máy trước, rubric sau** — nếu máy trượt thì ca đó tính là 0, không cần chấm rubric.

---

## C.0 Fixture cần tạo (6 tệp, dùng lại cho nhiều ca)

| Mã | Tệp | Nội dung chính xác (để đáp án kiểm được) |
|---|---|---|
| **F1** | `doanh-thu-6-thang.csv` | 3 sản phẩm A/B/C × 6 tháng (đơn vị: triệu đồng): A = 100,120,90,150,200,180 · B = 300,280,320,310,400,350 · C = 50,60,70,80,90,100 |
| **F2** | `hoa-don.png` | Ảnh hoá đơn có: **Số hoá đơn `HD-2026-0917`**, ngày `17/09/2026`, đơn vị `Công ty TNHH Minh Phát`, **tổng tiền `12.500.000`**, VAT `10%` |
| **F3** | `bang-gia.png` | Ảnh bảng 4 dòng: (Tên hàng · Số lượng · Đơn giá) với tổng tiền in ở cuối bảng = **`8.400.000`** |
| **F4** | `bien-ban-hop.txt` | Biên bản họp giả ~1.500 từ, **có chôn 3 dữ kiện**: ngân sách duyệt **`250 triệu`**, hạn chót **`30/10/2026`**, người phụ trách **`chị Hương`** |
| **F5** | `hop-dong-ngan.txt` | Hợp đồng ngắn 1 trang có: thời hạn **`12 tháng`**, phạt chậm **`0,05%/ngày`**, điều khoản chấm dứt trước hạn |
| **F6** | `ghi-chu-cuoc-goi.txt` | Ghi chú thô cuộc gọi khách hàng, có tên riêng + số điện thoại (dùng cho ca `sensitive`) |

**Nguyên tắc fixture:** số liệu **tròn, dễ kiểm**; không dùng số ngẫu nhiên; mọi dữ kiện máy kiểm phải xuất hiện
**đúng chữ** trong tệp.

---

## C.1 `chat` — 8 ca

| # | Prompt | Kiểm bằng máy | Rubric (0/1/2) |
|---|---|---|---|
| CH-1 | "Giải thích credit của fBuddy được tính thế nào, ngắn gọn 3 gạch đầu dòng." | `must_contain`: ["credit", "token"] · `must_not_contain`: ["miễn phí không giới hạn"] | 2 = đúng cơ chế token vào+ra; 1 = có nhưng thiếu; 0 = sai |
| CH-2 | "Viết email xin lỗi khách hàng vì giao hàng chậm 2 ngày, giọng lịch sự." | `must_contain`: ["xin lỗi", "2 ngày"] | 2 = đúng giọng, có lý do + hướng xử lý |
| CH-3 | "Tóm tắt đoạn sau trong 2 câu: <fixture nội tuyến 200 từ>" | `must_contain`: 2 dữ kiện chính | 2 = đúng 2 câu |
| CH-4 | "So sánh ưu nhược điểm của làm việc từ xa và tại văn phòng." | `must_contain`: ["từ xa", "văn phòng"] | 2 = có cả hai phía |
| CH-5 | "Tính 15% của 2.480.000 và giải thích cách tính." | `must_contain`: ["372.000"] (chấp nhận `372000`) | 2 = đúng số + giải thích |
| CH-6 | "Gợi ý 5 tiêu đề cho bài viết về tiết kiệm điện trong gia đình." | đếm ≥5 dòng tiêu đề | 2 = đúng 5, không trùng ý |
| CH-7 | "Người dùng hỏi: 'anh muốn đặt lịch họp tuần sau' — trả lời xác nhận và hỏi lại thời gian cụ thể." | `must_contain`: ["thời gian"] · xưng hô đúng ("anh"/"em") | 2 = đúng vai, có câu hỏi lại |
| CH-8 | "Giải thích sự khác nhau giữa VPN và proxy cho người không rành kỹ thuật." | `must_contain`: ["VPN", "proxy"] · không dùng thuật ngữ khó quá 3 lần | 2 = dễ hiểu, có ví dụ |

**Điều kiện chung:** không được gọi công cụ (`expect_tool: null`) — nếu model gọi tool ở các ca này thì tính **thất bại**
(dấu hiệu model yếu, hay "bắn" tool bừa).

---

## C.2 `translate` — 6 ca

| # | Prompt | Kiểm bằng máy | Ghi chú |
|---|---|---|---|
| TR-1 | "Dịch sang tiếng Anh: 'fBuddy là app AI đa năng của FlowTech, tính credit theo token.'" | `must_contain`: ["fBuddy", "FlowTech", "credit", "token"] (giữ nguyên tên riêng/thuật ngữ) | không được dịch tên sản phẩm |
| TR-2 | "Dịch sang tiếng Việt: 'MeetFlow AI records meeting minutes and translates calls in real time.'" | `must_contain`: ["MeetFlow AI"] · `must_contain` một trong ["biên bản", "ghi chú cuộc họp"] và một trong ["thời gian thực", "trực tiếp"] | thuật ngữ nhất quán |
| TR-3 | "Dịch sang tiếng Trung (giản thể): 'Vui lòng thanh toán trước ngày 30/10/2026.'" | `must_contain`: ["30/10/2026"] · có Hán tự | ngày và số không đổi |
| TR-4 | Dịch một đoạn có **xưng hô**: "Anh gửi em báo giá, chị xem giúp nhé." → tiếng Anh | không được dùng "I/you" máy móc cho cả ba vai; rubric chấm vai | ca khó, phân biệt model tốt |
| TR-5 | "Dịch và giữ nguyên định dạng bảng markdown sau: <bảng 3 dòng>" | đầu ra vẫn có 3 dòng bảng markdown (`\|`) | giữ định dạng |
| TR-6 | "Dịch sang tiếng Việt đoạn kỹ thuật 150 từ (có 'round-trip latency', 'throughput')." | `must_contain`: 2 thuật ngữ (giữ tiếng Anh hoặc dịch đúng cả hai) | nhất quán thuật ngữ |

---

## C.3 `doc_xlsx` — 6 ca

| # | Prompt | Fixture | Kiểm bằng máy |
|---|---|---|---|
| XL-1 | "Từ tệp này, làm Excel tổng doanh thu theo sản phẩm." | F1 | `expect_tool: generate_xlsx`, `expect_artifact: .xlsx` · nội dung có **A=840, B=1960, C=450** |
| XL-2 | "Tính doanh thu quý 1 và quý 2 rồi xuất Excel." | F1 | artifact · có **1390** và **1860** |
| XL-3 | "Sản phẩm nào bán chạy nhất 6 tháng? Xuất Excel kèm tổng." | F1 | artifact · có **B** và **1960** |
| XL-4 | "Làm Excel chi phí 3 tháng: mặt bằng 20, lương 60, marketing 15 (triệu/tháng)." | — | artifact · tổng 3 tháng mỗi khoản đúng **60/180/45** |
| XL-5 | "Từ ảnh bảng giá này, xuất Excel 4 dòng + tổng tiền." | F3 | artifact · **4 dòng dữ liệu** + **8400000** |
| XL-6 | "Xuất Excel danh sách việc cần làm từ biên bản này (việc · người · hạn)." | F4 | artifact · có **chị Hương** và **30/10/2026** |

**Điều kiện:** tệp tải về phải **mở được** (kiểm magic `PK` như bộ test hiện có) và có ≥ số dòng tối thiểu.

---

## C.4 `doc_ppt` — 5 ca

| # | Prompt | Kiểm bằng máy |
|---|---|---|
| PP-1 | "Làm 8 slide giới thiệu fBuddy cho khách doanh nghiệp." | artifact `.pptx` · **≥8 slide** · có chữ "fBuddy" |
| PP-2 | "Làm 5 slide quy trình onboarding khách hàng mới." | artifact · **≥5 slide** · có "onboarding" |
| PP-3 | "Làm 6 slide tổng kết doanh thu 6 tháng từ tệp này." (F1) | artifact · có **1960** (tổng B) và **1 tháng cao nhất** được nêu |
| PP-4 | "Làm 4 slide tóm tắt biên bản họp này." (F4) | artifact · có **250 triệu** |
| PP-5 | "Làm 10 slide đào tạo nhân viên mới về bảo mật thông tin." | artifact · **≥10 slide** |

**Rubric chung:** 2 = slide có tiêu đề rõ + nội dung đúng chủ đề; 1 = đủ số slide nhưng nội dung sơ sài; 0 = thiếu slide/không tạo được.

---

## C.5 `data_analysis` — 6 ca

| # | Prompt | Fixture | Kiểm bằng máy |
|---|---|---|---|
| DA-1 | "Phân tích tệp này: tổng, trung bình, tháng cao nhất." | F1 | có **3250** (tổng), **tháng 5** · `expect_tool: analyze_data` |
| DA-2 | "Tính tăng trưởng quý 1 → quý 2 theo %." | F1 | có **1390**, **1860** · phần trăm trong khoảng 33–34% |
| DA-3 | "Top 2 sản phẩm theo doanh thu, kèm biểu đồ." | F1 | có **B**, **A** (hoặc C nếu sai rõ) · có **chart spec** |
| DA-4 | "Có tháng nào doanh thu giảm so với tháng trước không? Liệt kê." | F1 | nêu đúng **tháng 3** (A giảm) và **tháng 6** (B giảm) |
| DA-5 | "Nếu giữ nguyên đà này, dự báo tháng 7 cho từng sản phẩm." | F1 | `must_contain`: ["dự báo"] + ghi rõ **đây là suy đoán** (không bịa là số thật) |
| DA-6 | "Kiểm tra tệp này có dữ liệu thiếu hoặc bất thường không." | F1 (**cố tình chèn 1 ô trống**) | phải **phát hiện ô trống** và **không** tự bịa giá trị |

**Rubric:** 2 = số đúng + nêu cách tính; 1 = số đúng nhưng không giải thích; 0 = sai số.

---

## C.6 `image_read` — 4 ca

| # | Prompt | Fixture | Kiểm bằng máy |
|---|---|---|---|
| IM-1 | "Đọc hoá đơn này và cho biết số hoá đơn, ngày, tổng tiền." | F2 | có **HD-2026-0917**, **17/09/2026**, **12.500.000** |
| IM-2 | "Trong ảnh này có những mặt hàng gì? Liệt kê." | F3 | liệt kê **4** mặt hàng · không bịa thêm |
| IM-3 | "Tính VAT 10% của hoá đơn này." | F2 | có **1.250.000** |
| IM-4 | "Ảnh này là hoá đơn hay bảng giá? Giải thích căn cứ." | F3 | trả lời **bảng giá** + nêu căn cứ (cột số lượng/đơn giá) |

**Điều kiện:** ca này **bắt buộc** model có `supportsVision`; nếu bị chuyển sang model vision khác thì ghi lại
`provider/model` thực tế để so sánh (xem R-004 §7 về `notice`).

---

## C.7 `long_doc` — 4 ca

| # | Prompt | Fixture | Kiểm bằng máy |
|---|---|---|---|
| LD-1 | "Tóm tắt biên bản này trong 5 gạch đầu dòng." | F4 | có **250 triệu** và **30/10/2026** |
| LD-2 | "Liệt kê mọi việc cần làm kèm người phụ trách." | F4 | có **chị Hương** |
| LD-3 | "Soát hợp đồng này và chỉ ra 3 rủi ro chính." | F5 | nêu **0,05%/ngày** hoặc **12 tháng** · có bảng/rủi ro |
| LD-4 | "Trong biên bản có mâu thuẫn nào về thời hạn không?" | F4 | trả lời dựa trên văn bản; nếu không có mâu thuẫn thì **nói rõ là không có**, không bịa |

**Rubric:** 2 = đúng dữ kiện + không bịa; 1 = đúng nhưng thiếu; 0 = bịa dữ kiện không có trong tệp.

---

## C.8 `sensitive` — 3 ca (kiểm tra **chặn định tuyến**, không phải chất lượng)

| # | Prompt | Kiểm bằng máy |
|---|---|---|
| SE-1 | "Phân tích danh sách khách hàng này và gợi ý cách chăm sóc." (F6) | `provider.privacy_class == "paid_zdr"` · **không** có provider free tier trong log |
| SE-2 | "Tóm tắt cuộc gọi này, đừng gửi ra bên thứ ba." (F6) | như trên + câu trả lời phải nói rõ dữ liệu **không** bị đưa cho dịch vụ ngoài |
| SE-3 | "Trích số điện thoại khách trong ghi chú này." (F6) | như trên; nếu chính sách cấm hiển thị thì phải che bớt (`090***123`) |

**Điều kiện:** 3 ca này **đạt** nghĩa là: hệ thống chọn provider đúng lớp riêng tư **và** không có log nào chứa
nội dung khách hàng (xem phụ lục B §B.5).

---

## C.9 Cách chạy & đầu ra

| Hạng mục | Đề xuất |
|---|---|
| Lệnh | `node ops/model-eval.mjs --set eval/vi-v1 --models <danh sách> --out ops/out-eval/` (viết sau, dùng lại mẫu `ops/apps-explain-check.mjs`, `ops/credit-explain-check.mjs`) |
| Đầu ra | `ops/out-eval/<model>-<ngày>.json` + bảng CSV tổng hợp: `model · intent · pass_rate · tool_valid · artifact_rate · ttft_p95 · cost/turn` |
| Số lượt | 42 ca × N model; **chạy lại mỗi lần đổi prompt hệ thống hoặc đổi model mặc định** |
| Mốc nền | `gemini-2.5-flash` (đang chạy) — mọi model khác so với mốc này |
| Chi phí | ~210 lượt cho 5 model; **dưới 0,1 USD** với model rẻ, vài USD với gemini-flash `[ƯỚC TÍNH]` |
| Báo cáo | 1 trang: bảng trên + kết luận "model X đủ điều kiện cho intent Y / không" |

**Tiêu chí "model đủ điều kiện phục vụ intent":** `pass_rate ≥ mốc nền − 2 điểm phần trăm`
**và** `tool_call_valid_rate ≥ 98%` **và** `artifact_rate ≥ 95%` (với intent `doc_*`, `data_analysis`).

---

## C.10 Việc cần anh duyệt trước khi ai đó làm

1. **Danh sách 42 ca** ở trên có đúng là những việc thật người dùng fBuddy hay làm không? (cắt/thêm ca nào?)
2. **6 fixture** — ai tạo ảnh `hoa-don.png`, `bang-gia.png` (cần ảnh thật, đúng số liệu ở §C.0)?
3. **Ngưỡng gate** ở §C.9 (`≥ mốc nền − 2 điểm`, `tool ≥ 98%`, `artifact ≥ 95%`) — đồng ý hay siết/nới?
4. Có cần thêm intent nào chưa có (ví dụ: `voice/dictation`, `mcp_*`, `tạo ảnh`)?
