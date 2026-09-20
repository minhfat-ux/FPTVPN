# R-004 Phụ lục B — Bộ eval tiếng Việt & schema log cho F-004

| | |
|---|---|
| **Thuộc nghiên cứu** | R-004 |
| **Feature** | **F-004 — Chọn model thích ứng cho fBuddy** |
| **Ngày** | 20/09/2026 |
| **Loại tài liệu** | Phụ lục thiết kế (đề cương đo lường) — **chưa** phải code, chưa chạy thử |
| **Mục đích** | Biến "chất lượng" và "tiết kiệm" từ cảm tính thành **số đo được**, trước khi đổi hành vi người dùng |

---

## B.1 Vì sao phải có bộ eval trước khi làm adaptive

Không có điểm chất lượng thì:
- không biết model rẻ có "đủ tốt" cho intent nào;
- không phát hiện được thoái bộ khi bật định tuyến;
- không chứng minh được tiết kiệm mà **không** giảm chất lượng (điều mà mọi bài báo về routing đều nhấn mạnh).

---

## B.2 Bộ eval tối thiểu (30–50 ca, chấm tự động)

**Cấu trúc mỗi ca:**
```
{ id, intent, prompt, attachments?, must_contain?: [], must_not_contain?: [],
  expect_tool?: "generate_xlsx" | null, expect_artifact?: true|false, rubric: [...] }
```

**Phân bổ đề xuất (tối thiểu):**

| Intent | Số ca | Ví dụ nội dung | Chấm bằng |
|---|---|---|---|
| `chat` | 8 | hỏi đáp thường, giải thích, viết ngắn | `must_contain` + rubric 3 mức |
| `translate` | 6 | VI↔EN, VI↔ZH, giữ thuật ngữ, xưng hô anh/chị/em | đối chiếu bản dịch mẫu + thuật ngữ bắt buộc giữ |
| `doc_xlsx` | 6 | "làm bảng chi phí 3 tháng", "từ ảnh này ra excel" | **có artifact .xlsx** + mở được + đúng số cột |
| `doc_ppt` | 5 | "làm 8 slide về X" | **có artifact .pptx** + số slide + có tiêu đề |
| `data_analysis` | 6 | CSV nhỏ: doanh thu theo tháng, top 5 | có bảng số đúng + biểu đồ spec + không bịa |
| `image_read` | 4 | ảnh hoá đơn/hình có chữ | trích đúng các trường |
| `long_doc` | 4 | tệp dài, cần tóm tắt có dẫn chứng | `must_contain` |
| `sensitive` (kiểm tra chặn) | 3 | câu hỏi có dữ liệu khách hàng | **không** được gọi provider free tier |
| **Tổng** | **~42** | | |

**Nguyên tắc viết đề:**
- Có **đáp án kiểm được bằng máy** ở mọi ca (số, tên, sự tồn tại của artifact) — tránh chấm bằng cảm nhận.
- Mỗi ca có **rubric 3 mức** (0 = sai/không làm được, 1 = được nhưng thiếu, 2 = đạt) cho phần không kiểm được bằng máy.
- Bộ đề **cố định** và **versioned** (`eval/vi-v1/…`) để so sánh giữa các lần chạy.

---

## B.3 Chỉ số đo (mỗi model × mỗi intent)

| Chỉ số | Công thức | Nguồn dữ liệu |
|---|---|---|
| `pass_rate` | số ca đạt (rubric ≥1 và mọi điều kiện máy) / tổng ca | eval |
| `tool_call_valid_rate` | số lượt có `tool_call` hợp lệ schema / số lượt có `tool_call` | agent loop |
| `artifact_rate` | số lượt tạo được artifact / số lượt yêu cầu tạo | sự kiện `artifact` |
| `clean_finish_rate` | số lượt kết thúc sạch / tổng lượt | `done` vs `error`, số iteration |
| `ttft_p50/p95` | phân vị thời gian tới token đầu | log lượt |
| `cost_per_turn` | USD/lượt theo `costForModel` | `usage_log` |
| `retry_rate` | tỉ lệ người dùng gửi lại trong 10 phút | `messages` |
| `escalation_rate` | tỉ lệ lượt phải nâng cấp model | log định tuyến |

---

## B.4 Giai đoạn "chỉ ghi log" (shadow) — bắt buộc trước khi đổi hành vi

1. Hệ thống **giữ nguyên** hành vi hiện tại (model như cũ).
2. Mỗi lượt, luật L1+L2 **tính toán trong im lặng**: model nào *sẽ* được chọn, vì sao, chi phí ước tính.
3. Ghi lại kết quả thật (các chỉ số ở B.3) — **đây là dữ liệu offline** để:
   - ước lượng tỉ lệ lượt "khó" thật (quyết định mức tiết kiệm);
   - so sánh "model đang dùng" vs "model luật đề xuất" trên cùng một bộ lượt;
   - phát hiện intent nào luật đề xuất hay sai.
4. **Không** hiện gì khác cho người dùng (trừ khi bật cờ thử nghiệm).

Thời lượng đề xuất: **1–2 tuần** hoặc tối thiểu **500 lượt** có log đầy đủ.

---

## B.5 Schema log định tuyến (đề xuất)

```
routing_decisions(
  id, created_at, user_id, conversation_id, message_id,
  intent,                       -- chat | translate | doc_ppt | ...
  needs_tools, has_images, context_tokens,
  candidates_json,              -- [{provider, model, score, why}] đã xếp hạng (KHÔNG chứa nội dung người dùng)
  chosen_provider, chosen_model, chosen_reason,
  shadow_provider, shadow_model,-- model mà luật đề xuất (khi đang ở giai đoạn shadow)
  est_cost_usd,
  -- kết quả
  actual_provider, actual_model, ttft_ms, in_tokens, out_tokens, cost_usd,
  tools_called_json, tool_call_valid, artifact_created, finish_reason, iterations,
  escalated_from, escalated_reason,
  user_retry_within_10m, user_feedback
)
```
**Quy tắc riêng tư:** bảng này chỉ chứa **metadata**, **không** chứa nội dung tin nhắn hay tệp của người dùng
(tuân thủ nguyên tắc dữ liệu tối thiểu; liên quan luật 91/2025 — R-002 §0).

---

## B.6 Cỡ mẫu & cách kết luận (tránh kết luận sai)

| Muốn phát hiện chênh lệch | Số lượt mỗi nhánh (α=5%, lực 80%) |
|---|---|
| 15 điểm phần trăm | ~180 |
| 10 điểm phần trăm | ~400 |
| 5 điểm phần trăm | ~1.600 |

`[ƯỚC TÍNH]` theo công thức `n ≈ 7,85 · p(1−p) / δ²`, lấy `p ≈ 0,5` (trường hợp xấu nhất).
⇒ Với lưu lượng của fBuddy hiện tại, **chỉ nên kết luận ở mức 10–15 điểm** trong vài tuần đầu; muốn chắc ở mức
5 điểm thì phải chạy lâu hơn hoặc tăng lưu lượng.

**A/B theo tài khoản** (không theo lượt) để một người dùng không thấy hai trải nghiệm khác nhau trong cùng hội thoại.
Luôn có **nhóm đối chứng giữ nguyên mô hình hiện tại** để so sánh.

---

## B.7 Tiêu chí "được phép bật" (gate) cho pha 2

Chỉ bật định tuyến thật khi **tất cả** điều sau đúng trên dữ liệu shadow:

1. `pass_rate` của model được chọn theo luật **không thấp hơn** model hiện tại quá **2 điểm phần trăm** trên cùng bộ eval.
2. `tool_call_valid_rate` của mọi model được phép phục vụ lượt có công cụ **≥ 98%**.
3. `artifact_rate` cho `doc_*` **≥ 95%**.
4. `escalation_rate` ước tính **< 15%**.
5. Không có intent nào mà luật đề xuất model **kém hơn rõ rệt** (chênh > 5 điểm) — nếu có, loại intent đó khỏi định tuyến.

---

## B.8 Việc cần làm để có bộ eval này (đề cương, chưa thực hiện)

| # | Việc | Ai | Ước lượng |
|---|---|---|---|
| 1 | Viết 42 ca đề + đáp án kiểm được bằng máy (VI, có ảnh/CSV/PPT) | người hiểu sản phẩm | 1–2 ngày |
| 2 | Chuẩn hoá rubric 3 mức cho phần chấm chủ quan | như trên | 0,5 ngày |
| 3 | Chạy bộ eval trên model hiện tại (`gemini-2.5-flash`) làm **mốc nền** | kỹ thuật | 0,5 ngày |
| 4 | Chạy trên 4 model rẻ ứng viên (Qwen3-4B, gpt-oss-20b, gemma-3-12b, DeepSeek-V4-Flash) | kỹ thuật | 0,5 ngày + chi phí eval rất nhỏ |
| 5 | So sánh, chốt danh sách model được phép theo intent | cả hai | 0,5 ngày |

**Chi phí eval ước tính:** 42 ca × 5 model ≈ 210 lượt; ở giá model rẻ (~$0,0002/lượt) tức **dưới 0,1 USD**;
kể cả chạy trên `gemini-2.5-flash` cũng chỉ vài USD. ⇒ **Đây là việc rẻ nhất trong toàn bộ F-004 và là điều kiện
đầu vào của cả F-001 lẫn F-003.** `[ƯỚC TÍNH]`
