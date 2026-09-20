# Nghiên cứu (research) — chỉ mục

Thư mục này chứa **kết quả nghiên cứu**: không phải đặc tả thi công, không phải code.
Mỗi tài liệu gắn với **đúng một feature**, ghi rõ trong khối đầu tài liệu.

## Quy ước đánh dấu

- Tên file: `R-<số>-<slug>.md`; phụ lục thô: `R-<số>-appendix-<A|B|C|D>-<slug>.md`.
- Mã feature: `F-<số>` — một feature có thể có nhiều tài liệu theo thời gian. Bảng feature ở dưới.
- **Mức độ tin cậy** (bắt buộc dùng trong tài liệu):
  - `[ĐÃ KIỂM]` — tự fetch/đọc nguồn gốc trong ngày ghi ở đầu tài liệu, có URL.
  - `[CHƯA KIỂM]` — có nguồn nhưng chưa đọc được, hoặc suy luận; phải nói rõ vì sao.
  - `[CẦN SPIKE]` — chỉ trả lời được bằng cách chạy thử thật (cần key/tài khoản).
  - `[ƯỚC TÍNH]` — số do mình suy ra từ số đã kiểm; phải ghi rõ công thức.
  - `[ĐỀ XUẤT]` — khuyến nghị của nghiên cứu, không phải dữ kiện.
- Số liệu giá/quota **luôn kèm ngày khảo sát**.
- Mỗi tài liệu phải có: **Kết luận (TL;DR)**, **Cách tự kiểm chứng lại** (lệnh cụ thể), **Việc cần spike**.
- **Phụ lục** là báo cáo của các lượt khảo sát độc lập (chủ yếu bằng tìm kiếm web / tiếng Anh). Tài liệu chính
  **thắng** khi mâu thuẫn, **trừ khi** tài liệu chính đã ghi rõ đính chính ở mục 0.

## ⚠️ Bốn đính chính dùng chung cho F-002 và F-003 (đọc trước)

1. **Luật dữ liệu cá nhân của Việt Nam đã đổi.** Từ **01/01/2026**, khung pháp lý là
   **Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15** ("PDP Law"), **thay thế Nghị định 13/2023/NĐ-CP**;
   **Nghị định 356/2025/NĐ-CP** hướng dẫn thi hành. Dữ liệu **sinh trắc học** — trong đó **giọng nói dùng để
   nhận diện** — thuộc nhóm **dữ liệu cá nhân nhạy cảm**. Khung phạt: tới **5% doanh thu năm trước** cho vi
   phạm chuyển dữ liệu xuyên biên giới, **3 tỷ đồng** cho vi phạm khác, **10× doanh thu** nếu mua bán dữ liệu
   trái phép. `[ĐÃ KIỂM]` Chambers *Investing in Vietnam 2026* §11.3 + `vanban.chinhphu.vn`.
   ⇒ Mọi chỗ trong repo còn viết "Nghị định 13/2023/NĐ-CP" như khung hiện hành **đều đã cũ**.
2. **Trang web không bắt được âm thanh của app desktop.** `getDisplayMedia` chỉ lấy được **tab trình duyệt**
   hoặc **mic/âm thanh phòng**, **buộc người dùng thao tác lại mỗi phiên**, và **không chạy trên mobile**.
   Muốn bắt họp Zoom/Teams bản cài phải có **overlay desktop** (như bản Windows của MeetFlow AI) hoặc **bot**.
   `[ĐÃ KIỂM]` MDN + R-002 phụ lục D.

3. **Trình duyệt không phải nền tảng trung lập.** Tiếng cho chia sẻ màn hình **chỉ có trên Chromium (Chrome/Edge)**;
   **trên macOS/Linux chỉ chia sẻ được tiếng của TAB** (tiếng hệ thống chỉ Windows/ChromeOS); **mobile đóng về kỹ thuật**
   (Android `AudioPlaybackCapture` không bắt được `USAGE_VOICE_COMMUNICATION`). `[ĐÃ KIỂM]` MDN + R-002 phụ lục D/E.
4. **Luật AI của EU (AI Act) Điều 50 có hiệu lực từ 02/08/2026**: đầu ra do AI tạo phải **đánh dấu ở dạng máy đọc được**;
   miễn trừ chỉ cho trường hợp không làm thay đổi đáng kể dữ liệu đầu vào ⇒ **biên bản trích xuất** có thể được miễn,
   **biên bản AI viết lại thì không**; **giọng dịch tổng hợp có thể bị coi là deep fake** và phải công bố.
   `[ĐÃ KIỂM]` artificialintelligenceact.eu Article 50.

## Bảng feature

| Mã feature | Tên feature | Tài liệu |
|---|---|---|
| **F-001** | Chi phí model / dùng LLM "miễn phí" (Hugging Face, OpenRouter free) cho fBuddy | R-001 (+ phụ lục A–D) |
| **F-002** | MiniApp dịch họp live + ghi biên bản (MoM), **tự xây pipeline**, và để fBuddy giữ ngữ cảnh cuộc họp | R-002 (+ phụ lục A, C, D) |
| **F-003** | MiniApp "Phòng họp" **dùng lại MeetFlow AI / engine Soniox**, thu tiền consumer **theo phút** | R-003 |
| **F-004** | **Chọn model thích ứng** (adaptive model selection) theo việc/giá/độ trễ/năng lực | R-004 |
| **F-005** | **Kiến trúc hạ tầng tối thiểu** (thin infra) cho toàn bộ fBuddy — trục xuyên suốt F-001…F-004 | R-005 |
| **F-006** | **Kiến trúc đích + lộ trình migrate** môi trường hiện tại để scale up (backup, DB, tệp, nhiều node) | R-006 |

## Danh mục tài liệu chính

| Mã | Feature | Tài liệu | Ngày khảo sát | Trạng thái | Kết luận một dòng |
|---|---|---|---|---|---|
| R-001 | F-001 | [`R-001-free-llm-va-chi-phi-model.md`](R-001-free-llm-va-chi-phi-model.md) | 20/09/2026 | Có kết luận, chờ quyết định | HF không có LLM miễn phí thật (0,10 USD/tháng); OpenRouter `:free` + model rẻ đang lợi hơn; HF nên là hàng dự phòng/đo chất lượng |
| R-002 | F-002 | [`R-002-miniapp-dich-hop-live-mom.md`](R-002-miniapp-dich-hop-live-mom.md) | 20/09/2026 | Có kết luận + 3 phương án; **đã có mục 0 + 0.1 đính chính (2 lượt khảo sát)** | Khả thi; chi phí chính ở STT; nên làm MVP "tải bản ghi → MoM + ngữ cảnh" trước |
| R-003 | F-003 | [`R-003-meetflow-ai-miniapp-tra-theo-phut.md`](R-003-meetflow-ai-miniapp-tra-theo-phut.md) | 20/09/2026 | Có kết luận + 3 phương án + giá đề xuất; **đã có mục 0 + 0.1 đính chính** | MeetFlow AI **không có bản web**, engine là **Soniox** (~$0,18/giờ ⇒ ~77đ/phút) ⇒ làm "Phòng họp web" bán 250–400đ/phút; nút thắt là **đo phút**; bản web chỉ bắt được họp trong tab |
| R-006 | F-006 | [`R-006-kien-truc-dich-va-lo-trinh-migrate.md`](R-006-kien-truc-dich-va-lo-trinh-migrate.md) | 20/09/2026 | Có kiến trúc đích + 3 mức migrate + runbook DB/tệp | Ba ổ gà migrate: **FTS5/`rowid`**, **tệp ghi ra đĩa**, **session trong tiến trình**; **không có backup nào trong `ops/`** ⇒ 6 việc cắm cờ 0 đồng làm ngay; chi phí M1 0–5, M2 25–45, M3 80–150 USD/tháng |
| R-005 | F-005 | [`R-005-kien-truc-ha-tang-mong.md`](R-005-kien-truc-ha-tang-mong.md) | 20/09/2026 | Có kết luận + thang hạ tầng M0→M3 | VPS ~1 GB RAM (cap 600 MB) vẫn đủ chạy pilot: control plane trên VPS, media plane trên Cloudflare/browser, data plane SQLite+R2 ⇒ **100 giờ họp/tháng ≈ 20 USD, hạ tầng phụ trợ 0 USD**; chỉ nâng khi có trigger đo được |
| R-004 | F-004 | [`R-004-chon-model-thich-ung.md`](R-004-chon-model-thich-ung.md) (**bản 2 — đào sâu**, ưu tiên) + phụ lục A, B | 20/09/2026 | Có thiết kế 4 lớp + bộ đo + lộ trình 3 pha | Đừng làm router thông minh trước: **lọc năng lực → chấm điểm → dự phòng/nâng cấp → học**; bộ ước lượng chất lượng (tool call hợp lệ, artifact) mới là then chốt; bắt đầu bằng **giai đoạn chỉ ghi log** (0 rủi ro) |

## Phụ lục (nguồn tham khảo; đọc kèm mục 0 của tài liệu chính)

| Mã | Thuộc | Tài liệu | Nội dung |
|---|---|---|---|
| R-001-A | F-001 | [`R-001-appendix-A-hf-providers-web-search.md`](R-001-appendix-A-hf-providers-web-search.md) | Khảo sát HF Inference Providers (tiếng Anh) — nhiều mục `[UNVERIFIED]`, có bảng Đính chính |
| R-001-B | F-001 | [`R-001-appendix-B-vietnamese-model-landscape.md`](R-001-appendix-B-vietnamese-model-landscape.md) | Model tiếng Việt + tool calling (tiếng Anh) — **có kết luận sai đã đính chính** (SEA-LION thực ra đang được phục vụ qua router) |
| R-001-C | F-001 | [`R-001-appendix-C-tool-calling-fallback-va-benchmark-vi.md`](R-001-appendix-C-tool-calling-fallback-va-benchmark-vi.md) | 11 kiểu lỗi tool calling + so sánh free-tier ngoài HF + chiến lược fallback |
| R-001-D | F-001 | [`R-001-appendix-D-benchmark-tieng-viet-web-search.md`](R-001-appendix-D-benchmark-tieng-viet-web-search.md) | Benchmark tiếng Việt (VMLU, ViExam, VM14K…) — **không lấy được bảng VMLU** |
| R-002-A | F-002 | [`R-002-appendix-A-live-audio-stt-translation-mom.md`](R-002-appendix-A-live-audio-stt-translation-mom.md) | **Báo cáo đầy đủ 7 phần**: thu âm trong trình duyệt, STT streaming + giá + bằng chứng tiếng Việt, kiến trúc dịch & ngân sách độ trễ, pipeline MoM, bot vs trình duyệt vs thiết bị, đường ~0 đồng, kiến trúc đề xuất + rủi ro cần spike |
| R-002-C | F-002 | [`R-002-appendix-C-mom-bots-legal-raw.md`](R-002-appendix-C-mom-bots-legal-raw.md) | Dữ liệu thô: MoM, bot họp, pháp lý (VN/GDPR/bang Hoa Kỳ), ma trận diarization từng nhà cung cấp |
| R-002-E | F-002 | [`R-002-appendix-E-browser-capture-spec-crosscheck.md`](R-002-appendix-E-browser-capture-spec-crosscheck.md) | Dữ liệu thô: đối chiếu **đặc tả** thu âm trên trình duyệt (Chromium vs Firefox/Safari, tab vs hệ thống, `timeslice` không dùng để stream được) |
| R-002-D | F-002 | [`R-002-appendix-D-meeting-audio-capture-raw.md`](R-002-appendix-D-meeting-audio-capture-raw.md) | Dữ liệu thô: thu âm theo nền tảng (Windows WASAPI loopback, macOS Core Audio taps, trình duyệt, iOS, Android) |

> `R-002-B` **không tồn tại** — chỗ đó được để trống trong lúc lập chỉ mục, không phải thiếu file.

## Việc còn nợ của các lượt khảo sát

- **Chưa lấy được** `vmlu.ai` (bảng xếp hạng VMLU) và `leaderboard.sea-lion.ai/detailed/VI`.
- **Chưa đọc được** văn bản luật gốc của Việt Nam (`thuvienphapluat.vn`, `luatvietnam.vn`, `vanban.chinhphu.vn`)
  ⇒ các kết luận luật dựa trên bản tóm tắt của hãng luật; **cần luật sư xác nhận** trước khi dùng cho sản phẩm thật.
- Một lượt khảo sát sâu về trình duyệt (ma trận mimeType của MediaRecorder, mức throttle khi tab ẩn, mã bug
  Chromium) bị dừng giữa đường; dữ liệu thô nằm ngoài repo (thư mục tạm của phiên).

## Ghi chú kỹ thuật khi ghi tài liệu vào repo này

Volume `/Volumes/BIWIN` là **exFAT**, không hỗ trợ hardlink ⇒ công cụ ghi file dạng atomic
(`write`/`edit` của harness) trả `ENOTSUP`. Tài liệu trong thư mục này được ghi bằng shell
(`cat > file <<'EOF'`), vẫn là văn bản thuần UTF-8 như mọi tài liệu khác trong `docs/`.

| R-004-A | F-004 | [`R-004-appendix-A-thuat-toan-dinh-tuyen.md`](R-004-appendix-A-thuat-toan-dinh-tuyen.md) | Bằng chứng & so sánh 4 họ thuật toán (routing, cascade, cascade routing, bandit) + lựa chọn thương mại (OpenRouter auto, Not Diamond, Portkey, LiteLLM) |
| R-004-B | F-004 | [`R-004-appendix-B-bo-eval-va-schema-log.md`](R-004-appendix-B-bo-eval-va-schema-log.md) | Đề cương bộ eval tiếng Việt 42 ca + chỉ số + **schema log định tuyến** + cỡ mẫu + tiêu chí gate trước khi bật |
| R-004-C | F-004 | [`R-004-appendix-C-bo-de-eval-42-ca.md`](R-004-appendix-C-bo-de-eval-42-ca.md) | **Bộ đề eval 42 ca** trải 9 intent (prompt + kiểm được bằng máy + rubric + 6 fixture + cách chạy + ngưỡng gate) |
| R-004-D | F-004 | [`R-004-appendix-D-de-cuong-pha-1-ghi-log.md`](R-004-appendix-D-de-cuong-pha-1-ghi-log.md) | **Đề cương giao việc pha 1 “chỉ ghi log”**: 6 sản phẩm bàn giao, schema 2 bảng, chia việc + ước lượng, 7 phép kiểm bắt buộc, định nghĩa hoàn thành |