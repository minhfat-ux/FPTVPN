# R-004 — Chọn model thích ứng (adaptive model selection) cho fBuddy

| | |
|---|---|
| **Mã nghiên cứu** | R-004 (**bản 2 — đào sâu**, ưu tiên theo yêu cầu) |
| **Feature** | **F-004 — Tự chọn provider/model cho từng lượt** theo việc, chi phí, độ trễ, năng lực, sức khoẻ provider |
| **Câu hỏi nghiên cứu** | "Thiết kế cụ thể thế nào để chạy được trong fBuddy, đo bằng gì, tiết kiệm bao nhiêu, rủi ro ở đâu?" |
| **Ngày khảo sát** | 20/09/2026 |
| **Người thực hiện** | Phiên nghiên cứu (Mac) |
| **Trạng thái** | Có thiết kế + bộ đo + lộ trình; chờ quyết định triển khai |
| **Phụ lục** | [A — thuật toán định tuyến & bằng chứng](R-004-appendix-A-thuat-toan-dinh-tuyen.md) · [B — bộ eval & schema log](R-004-appendix-B-bo-eval-va-schema-log.md) |
| **Liên quan** | R-001 (giá model), R-001-C (11 kiểu lỗi tool calling), R-005/R-006 (hạ tầng & migrate) |

---

## 1. Kết luận (TL;DR)

1. **Thiết kế đúng không phải "một router thông minh", mà là 4 lớp tách bạch**: lọc năng lực → chấm điểm →
   thực thi/chịu lỗi → học. Làm sai thứ tự là cách chắc chắn nhất để vừa tốn công vừa không đo được lợi ích. `[ĐỀ XUẤT]`
2. **Bằng chứng học thuật cho thấy lợi ích lớn và có thật**: RouteLLM **giảm tới 85% chi phí** mà giữ **95% chất
   lượng GPT-4** trên MT-Bench (bài báo: **>2×**), FrugalGPT **tới 98%**, AutoMix **>50%**; RouterBench cung cấp
   chuẩn so sánh với **405k kết quả suy luận**. `[ĐÃ KIỂM]` (abstract/README)
3. **Phát hiện quan trọng nhất cho fBuddy:** bài báo *A Unified Approach to Routing and Cascading* (arXiv 2410.10347)
   chỉ ra **"quality estimator" (bộ ước lượng chất lượng) mới là yếu tố quyết định**, không phải bản thân router.
   Với fBuddy, bộ ước lượng đó **có sẵn và rẻ**: (a) tool call có hợp lệ theo schema không, (b) có tạo ra artifact
   không, (c) tool loop có kết thúc không, (d) người dùng có gửi lại không. `[ĐÃ KIỂM]` (bài báo) + `[ĐỀ XUẤT]`
4. **Rủi ro số 1 là tool calling**, không phải chi phí: fBuddy có **12 công cụ** (`generate_pptx`, `generate_xlsx`,
   `analyze_data`, `edit_image`, `open_image_studio`, `read_image`, `xlsx_from_image`, `list_files`, `tinh_toan`,
   `tra_cuu`, `remember_fact`, `search_past_chats`) và bộ schema gửi mỗi lượt **~1.600 token**; một model rẻ hỏng
   tool loop là **hỏng sản phẩm**. `[ĐÃ KIỂM]` (code) + R-001 phụ lục C
5. **Tiết kiệm cho fBuddy (ước tính từ giá thật R-001 §3):** tất cả lượt bằng `gemini-2.5-flash` ≈ **$2,15/1.000 lượt**;
   trộn 80% lượt dễ → model rẻ ≈ **$0,47/1.000 lượt** (tiết kiệm **~78%**). `[ƯỚC TÍNH]`
6. **Nhưng người dùng không tự động được rẻ hơn**: `costForModel` lấy `max(giá phẳng, chi phí thật × margin)` ⇒
   tiết kiệm chảy vào biên lợi nhuận trừ khi đổi chính sách credit. `[ĐÃ KIỂM]` (code)
7. **Lộ trình 3 pha, bắt đầu bằng "chỉ ghi log, không đổi hành vi"**: (1) bảng model + luật + log quyết định,
   (2) dự phòng/cooldown + nâng cấp có trần, (3) học từ phản hồi. Pha 1 **không rủi ro** vì chưa đổi gì cho người dùng.
8. **Không mua router thương mại ở pha đầu**: OpenRouter `auto`, Not Diamond (**$0,05/1M token routed**), Portkey
   (**$49/tháng**) đều có chỗ, nhưng chúng **không minh bạch** — với sản phẩm tính tiền theo token thì **phải log
   được vì sao chọn model nào**. `[ĐÃ KIỂM]` (giá) + `[ĐỀ XUẤT]`

---

## 2. Hiện trạng fBuddy — đúng những gì cần cho F-004 `[ĐÃ KIỂM]`

| Thành phần | Đang làm gì | Dùng được cho F-004 thế nào |
|---|---|---|
| `resolveProviderForChat()` (`settings.js`) | providerId yêu cầu → hội thoại → mặc định → **provider bật đầu tiên có key**; model tương tự | **Điểm cắm số 1**: thay "provider bật đầu tiên" bằng "provider thắng theo luật" |
| `resolveVisionTarget()` | chọn model **theo năng lực đọc ảnh**, có thể cấu hình | **Tiền lệ đúng**: mở rộng từ 1 tiêu chí (vision) thành nhiều tiêu chí |
| `PROVIDER_KINDS` (`providers/index.js`) | có `supportsTools`, `supportsVision`, `supportsImages`, `suggestedModels` | Nền của **L1 (lọc năng lực)**; thiếu giá/độ trễ/chất lượng |
| 12 công cụ built-in + MCP tools | hợp nhất một vòng lặp tool calling | Nguồn của **quality estimator** (tool call hợp lệ?) và của **phân loại việc** |
| SSE: `start`, `status`, `delta`, `reasoning`, `notice`, `usage`, `tool_call`, `tool_result`, `artifact`, `error`, `done` | đã có kênh đẩy sự kiện | **`notice` dùng để nói với người dùng "lượt này dùng model X vì Y"** (minh bạch) |
| `usage_log`, `audit_log` (SQLite) | đã có bảng log | Chỗ ghi **quyết định định tuyến + kết quả** |
| `costForModel()` | giá thật × margin, sàn giá phẳng | Đo chi phí thật theo model; cần bổ sung giá cho provider ngoài OpenRouter |
| `ops/refresh-model-pricing.mjs` | chỉ đồng bộ giá **OpenRouter** | Mở rộng để nạp cả HF router `/v1/models` (có giá + độ trễ + `supports_tools`) |

---

## 3. Bốn lớp — và việc của từng lớp

| Lớp | Câu hỏi | Cách làm ở fBuddy | Trạng thái |
|---|---|---|---|
| **L1 Lọc năng lực** (cứng) | Model này *làm được* việc chưa? | `supportsTools` + `supportsVision` + context + `privacy_class`; loại trước khi chấm điểm | Đã có một phần (`vision.js`) |
| **L2 Chấm điểm** | Trong các model còn lại, chọn cái nào? | Điểm theo (việc × giá × độ trễ × chất lượng VI × độ tin cậy tool) | **Chưa có — làm ở pha 1** |
| **L3 Thực thi & chịu lỗi** | Gọi thế nào cho không gãy? | Chuỗi dự phòng, cooldown, retry trước token đầu, nâng cấp có trần | **Chưa có — pha 2** |
| **L4 Học** | Chọn thế nào cho tốt dần? | Bandit theo (việc × model) với thưởng = thành công − λ·chi phí − μ·độ trễ | **Pha 3** |

---

## 4. Từ điển "việc" của fBuddy (đầu vào của L2)

Phân loại bằng **luật rẻ tiền** (skill đã chọn + có ảnh + từ khoá + độ dài + có MCP tool), **không** gọi model
phân loại ở pha 1 (tốn thêm một lượt và thêm một chỗ hỏng):

| Việc (intent) | Nhận biết | Lọc cứng | Ưu tiên |
|---|---|---|---|
| `chat` | mặc định | tools | rẻ nhất đạt ngưỡng chất lượng VI |
| `translate` | skill dịch / "dịch" + đoạn văn | — | chất lượng dịch VI↔EN/ZH cao nhất trong nhóm giá |
| `doc_ppt` | skill ppt / "slide, thuyết trình" | **tools + tên hàm cụ thể** | `tool_success_rate` cao nhất |
| `doc_xlsx` | skill xlsx / "excel, bảng" | **tools** | như trên |
| `data_analysis` | skill data / đính kèm csv-xlsx | **tools + context** | `tool_success_rate` + context |
| `image_edit` | skill ảnh / có ảnh + "sửa ảnh" | **vision (và tách khỏi lượt tool)** | theo `resolveVisionTarget` |
| `image_read` | có ảnh + hỏi nội dung | **vision** | model vision rẻ nhất đạt ngưỡng |
| `long_doc` | > N token / tệp lớn | **context ≥ N** | model rẻ có context lớn |
| `sensitive` | dữ liệu khách hàng/doanh nghiệp (đánh dấu theo skill hoặc theo người dùng) | `privacy_class = paid_zdr` | loại hẳn free tier có thể dùng dữ liệu để huấn luyện |

> Nhóm `sensitive` là **bắt buộc có** vì fBuddy xử lý dữ liệu người dùng Việt Nam (xem R-002 §0 về luật mới).

---

## 5. Bảng dữ liệu model (`model_catalog`) — nền tảng của mọi thứ

| Trường | Nguồn | Ghi chú |
|---|---|---|
| `provider_id`, `model` | danh sách provider hiện có | khoá chính |
| `context_len`, `supports_tools`, `supports_vision`, `supports_structured` | `PROVIDER_KINDS`, `vision.js`, HF router `/v1/models`, OpenRouter `/models` | L1 |
| `price_in_usd`, `price_out_usd` per 1M token | OpenRouter + HF router (mở rộng `refresh-model-pricing.mjs`) | L2 và **đo tiết kiệm** |
| `ttft_ms_p50`, `ttft_ms_p95` | **tự đo trong `agent.js`** theo từng lượt | L2 |
| `error_rate` | đếm lỗi/ lượt | L2, cooldown |
| `tool_success_rate` | đếm theo lượt có `tool_call` (xem §6) | **quan trọng nhất** |
| `vi_quality` (0..1) | bộ eval tiếng Việt của mình (phụ lục B) | L2 |
| `privacy_class` | thủ công theo điều khoản từng provider | L1 cho `sensitive` |
| `enabled`, `updated_at` | vận hành | — |

**Nguyên tắc:** bảng này là **dữ liệu**, không phải suy đoán của model. Không có nó thì "adaptive" chỉ là cảm tính.

---

## 6. Bộ ước lượng chất lượng (quality estimator) — phần quyết định thành bại

Theo arXiv 2410.10347, thứ quyết định là **bộ ước lượng chất lượng**, không phải router. Với fBuddy, thứ tự tin cậy:

| # | Estimator | Cách đo | Chi phí |
|---|---|---|---|
| 1 | **Tool call hợp lệ** | tên hàm có trong danh sách? JSON có đúng schema (`inputSchema`)? tham số bắt buộc có đủ? | **0đ** (đã có dữ liệu trong agent loop) |
| 2 | **Artifact được tạo** | lượt yêu cầu tạo tệp ⇒ có sự kiện `artifact` không? | 0đ |
| 3 | **Kết thúc sạch** | tool loop kết thúc trước `maxToolIterations`; `finish_reason` bình thường; không rơi vào `error` | 0đ |
| 4 | **Tín hiệu người dùng** | có gửi lại/ sửa câu hỏi trong N phút? có phản hồi tiêu cực? | 0đ |
| 5 | **Tự kiểm (self-verification)** | cho model rẻ tự chấm câu trả lời của nó, hoặc một verifier rẻ chấm | 1 lượt rẻ |
| 6 | **Kiểm tra bằng luật** | kết quả có chứa số liệu cần thiết, có đúng định dạng (bảng/biểu đồ) | 0đ |
| 7 | Xác suất log (logprobs) | chỉ một số provider trả về ⇒ **không dùng làm trục chính** | 0đ nếu có |

**Kết luận thiết kế:** fBuddy **không cần** router học máy ở pha 1 — chỉ cần **(a)** lọc năng lực, **(b)** luật chọn
theo việc, và **(c)** **nâng cấp khi estimator 1–4 báo thất bại**. Đây chính là dạng "cascade routing" mà bài báo
chứng minh là tối ưu trong nhiều trường hợp, và là cách tiết kiệm nhiều nhất với rủi ro thấp nhất.

---

## 7. Luật chọn (pha 1) — công thức cụ thể

```
score(model, intent) = w_q · vi_quality(model, intent)
                     + w_t · tool_success_rate(model)          # = 0 nếu intent không cần tools
                     − w_c · cost_per_turn(model, intent)
                     − w_l · ttft_p95(model)
                     − w_e · error_rate(model)
```
- Bộ trọng số `w_*` là **cấu hình**, không hard-code; mặc định đặt sao cho **chất lượng là ràng buộc cứng**
  (model dưới ngưỡng `vi_quality` hoặc `tool_success_rate` bị loại trước khi tính điểm).
- Kết quả **không phải một model** mà là **danh sách xếp hạng** — L3 dùng phần đuôi làm chuỗi dự phòng.
- **Ghim theo hội thoại**: chọn ở lượt đầu, giữ nguyên tới hết hội thoại (trừ khi thiếu năng lực/lỗi/người dùng đổi
  tay). Đổi model liên tục làm gãy văn phong và mất prompt cache.
- **Minh bạch**: khi model bị đổi so với mặc định, phát một sự kiện `notice` (đã có sẵn trong SSE) — ví dụ
  *"Lượt này dùng model rẻ hơn để tiết kiệm credit"* hoặc *"Ảnh cần model có thị giác nên đã chuyển model"*.

**Đường ngắn nhất để thử nghiệm toàn bộ cơ chế mà không viết router:** dùng `openrouter/auto` (OpenRouter tự phân
loại prompt thành ~30 loại việc, có `cost_tier`, có fallback, trả metadata `task_type`) — nhưng chấp nhận
**không minh bạch** và phụ thuộc OpenRouter. `[ĐÃ KIỂM]`

---

## 8. Thực thi & chịu lỗi (pha 2)

| Tình huống | Hành vi |
|---|---|
| `429` / `402` / `5xx` / hết thời gian tới token đầu | sang model kế tiếp trong danh sách xếp hạng; retry **chỉ khi chưa phát token nào** |
| `400` do thiếu năng lực (`tools` không được hỗ trợ, ảnh không nhận) | **loại model đó khỏi catalog cho intent tương ứng** (học từ lỗi), rồi thử model kế tiếp |
| Tool call không hợp lệ (estimator #1) | thử lại **một lần** với model mạnh hơn (nâng cấp có trần), ghi log |
| Artifact không tạo được (estimator #2) | như trên; **không** tính credit cho lượt hỏng (cơ chế hoàn credit đã có) |
| Provider lỗi liên tiếp | **cooldown** theo (provider, model) 60 giây, tăng dần |
| Hội thoại đang chạy | **không** đổi model giữa chừng trừ 3 lý do trên |

**Trần chi phí:** mỗi lượt có ngân sách tối đa (ví dụ ≤ 1,5× chi phí model mặc định); vượt thì dừng nâng cấp và
trả lời bằng những gì đã có, kèm ghi chú.

---

## 9. Học (pha 3) + đo lường

- **Giai đoạn "chỉ ghi log"** (bắt buộc làm trước): hệ thống chạy như hiện nay nhưng **ghi lại** model nào *sẽ*
  được chọn theo luật và kết quả thật ⇒ có dữ liệu offline để so sánh **trước khi** đổi hành vi.
- **Bandit** (Thompson sampling) theo cặp (intent × model), thưởng:
  `r = 1[thành công] − λ·chi_phí − μ·độ_trễ + β·phản_hồi_người_dùng`.
  **Chỉ khám phá** ở intent rủi ro thấp (`chat`, `translate`); **không khám phá** ở `doc_*`, `data_analysis`,
  `image_*`, `sensitive`.
- **A/B theo tài khoản** (không theo lượt) để tránh trải nghiệm lộn xộn trong cùng một người dùng.
- **Cỡ mẫu:** muốn phát hiện chênh lệch **10 điểm phần trăm** về tỉ lệ thành công cần khoảng **~400 lượt mỗi nhánh**;
  chênh lệch **5 điểm** cần **~1.600 lượt mỗi nhánh** (mức tin cậy 95%, lực 80%). Đừng kết luận sớm hơn. `[ƯỚC TÍNH]`
- Chi tiết bộ eval, thang chấm, schema log: **phụ lục B**.

---

## 10. Toán tiền (số thật từ R-001 §3) `[ƯỚC TÍNH]`

Một lượt fBuddy ≈ 3.000 token vào (schema công cụ ~1.600 + system prompt + lịch sử) + 500 token ra.

| Chiến lược | Chi phí 1.000 lượt | So với hiện tại |
|---|---|---|
| Tất cả `gemini-2.5-flash` (đang chạy) | ~$2,15 | mốc |
| Tất cả `Qwen3-4B-Instruct-2507` (rẻ nhất có tools) | ~$0,045 | −98%, chất lượng VI thấp |
| **Trộn 80% dễ → model rẻ + 20% khó → gemini-flash** | **~$0,47** | **−78%** |
| Trộn 90/10 (tham chiếu RouteLLM) | ~$0,26 | −88% |

**Điều kiện để con số này thành thật:** tỉ lệ 80/20 phải **đo được**, không phải giả định. Đo bằng cách chạy
giai đoạn "chỉ ghi log" rồi đếm tỉ lệ lượt thật sự cần model mạnh.

---

## 11. Rủi ro & cách chặn

| Rủi ro | Mức | Cách chặn |
|---|---|---|
| Model rẻ hỏng tool loop (11 kiểu lỗi ở R-001-C) | 🔴 cao | Lọc bằng `tool_success_rate` **đo thật**, không tin nhãn provider; estimator #1 bắt lỗi và nâng cấp |
| Vision + tools chung một lượt gọi | 🟠 vừa | Tách thành hai bước (đã có tiền lệ `vision-fallback.js`) |
| Đổi model giữa hội thoại | 🟠 vừa | Ghim theo hội thoại |
| Định tuyến dữ liệu người dùng sang free tier | 🔴 cao (pháp lý) | `privacy_class` + loại trừ trước; liên quan luật 91/2025 (R-002 §0) |
| Router đóng, không giải thích được | 🟠 vừa | Ưu tiên luật của mình; nếu dùng dịch vụ ngoài thì vẫn phải log quyết định |
| Nâng cấp quá nhiều ⇒ hết lợi | 🟠 vừa | Đo tỉ lệ nâng cấp; mục tiêu **< 15%** số lượt |
| Đo sai (chọn mẫu nhỏ, so sánh lệch) | 🟠 vừa | Cỡ mẫu tối thiểu ở §9; A/B theo tài khoản |
| Chi phí ẩn: mỗi lần nâng cấp là một lượt gọi thêm | 🟡 | Tính cả lượt nâng cấp vào chi phí/lượt |

---

## 12. Cách tự kiểm chứng lại

```bash
# Bằng chứng học thuật (đọc 20/09/2026)
curl -sL https://arxiv.org/abs/2406.18665    # RouteLLM (>2×, 85% cost cut @95% GPT-4 quality)
curl -sL https://arxiv.org/abs/2305.05176    # FrugalGPT (tới 98%)
curl -sL https://arxiv.org/abs/2310.12963    # AutoMix (>50%, self-verification + POMDP)
curl -sL https://arxiv.org/abs/2403.12031    # RouterBench (405k kết quả)
curl -sL https://arxiv.org/abs/2410.10347    # Routing + Cascading hợp nhất (quality estimator là then chốt)
curl -s -H "Accept: application/vnd.github.raw" \
  https://api.github.com/repos/lm-sys/RouteLLM/contents/README.md   # router mf/bert/sw_ranking/causal_llm
curl -s -H "Accept: application/vnd.github.raw" \
  https://api.github.com/repos/aurelio-labs/semantic-router/contents/README.md

# Giá & cơ chế thương mại
curl -sL https://openrouter.ai/docs/features/model-routing   # Auto Router (~30 loại việc, cost_tier)
curl -sL https://www.notdiamond.ai/pricing                    # $0,05 / 1M token routed
curl -sL https://portkey.ai/pricing                           # Free / $49 mỗi tháng
curl -sL https://docs.litellm.ai/docs/routing                 # các chiến lược định tuyến (OSS)

# Trong repo
grep -n "resolveProviderForChat" -A 45 server/src/settings.js
grep -n "resolveVisionTarget" -A 25 server/src/settings.js
grep -n "costForModel" -A 15 server/src/credits.js
grep -n "name:" server/src/skills/index.js | head -20      # 12 công cụ
```

---

## 13. Việc cần spike trước khi cam kết `[CẦN SPIKE]`

| # | Câu hỏi | Cách làm | Vì sao quyết định |
|---|---|---|---|
| 1 | `tool_success_rate` thật của 4 model rẻ (Qwen3-4B, gpt-oss-20b, gemma-3-12b, DeepSeek-V4-Flash) trên **chính 12 công cụ của fBuddy** | chạy 50–100 lượt mẫu mỗi model, chấm bằng estimator #1–#3 | Quyết định model nào được phép phục vụ lượt có công cụ |
| 2 | Bộ eval tiếng Việt tối thiểu (30–50 câu, 4 việc: chat, dịch, tạo tài liệu, phân tích dữ liệu) | viết đề + đáp án, chấm tự động | Không có nó thì "chất lượng" là cảm tính |
| 3 | **Tỉ lệ lượt "khó" thật** trong production | giai đoạn "chỉ ghi log" 1–2 tuần | Quyết định mức tiết kiệm thật (80/20 hay 95/5) |
| 4 | TTFT p50/p95 theo (provider, model) | đo từ log lượt thật | Trọng số độ trễ ở L2 |
| 5 | Điều khoản free tier nào được dùng cho dữ liệu người dùng thật | đọc điều khoản + ý kiến luật sư | `privacy_class`, liên quan luật 91/2025 |

---

## 14. Lộ trình triển khai

| Pha | Nội dung | Thời lượng | Điều kiện "xong" |
|---|---|---|---|
| **1 — Quan sát** | `model_catalog` + luật chọn (**chỉ ghi log**, không đổi hành vi) + `notice` khi có đổi model + đo TTFT/chi phí/tỉ lệ lỗi | 1–2 tuần | Nhìn được: mỗi lượt *sẽ* chọn model nào, vì sao, tốn bao nhiêu; có số tỉ lệ lượt khó |
| **2 — Thực thi** | Bật chọn theo luật + chuỗi dự phòng + cooldown + nâng cấp có trần + ghim theo hội thoại | 1–2 tuần | Chi phí/lượt giảm; tỉ lệ lỗi không tăng; tỉ lệ nâng cấp < 15% |
| **3 — Học** | Bandit cho intent rủi ro thấp + A/B theo tài khoản | sau khi có ≥ vài nghìn lượt log | Tiết kiệm thêm ≥ 10% mà chất lượng đo được **không giảm** |
| **Song song, bắt buộc** | Bộ eval tiếng Việt + estimator (phụ lục B) | ngay từ pha 1 | Có điểm chất lượng cho từng model trước khi dùng nó phục vụ người thật |

**KPI theo dõi:** chi phí model/lượt · p95 TTFT · tỉ lệ tool-call hỏng · tỉ lệ nâng cấp model · tỉ lệ người dùng
gửi lại · biên credit/lượt · tỉ lệ lượt bị chặn vì `privacy_class`.

---

## 15. Kết luận

1. **Làm được, đáng làm, và phần lớn giá trị nằm ở pha 1 + 2** — không cần học máy.
2. **Chất lượng ước lượng được mới là thứ quyết định** (arXiv 2410.10347); fBuddy may mắn vì estimator rẻ nhất
   (tool call hợp lệ, artifact có được tạo) **đã có sẵn trong luồng hiện tại**.
3. **Rủi ro nằm ở tool calling và pháp lý (dữ liệu người dùng ↔ free tier)**, không nằm ở chi phí.
4. **Bắt đầu bằng giai đoạn chỉ-ghi-log**: 1–2 tuần, 0 rủi ro cho người dùng, và tạo ra đúng dữ liệu cần để
   biết mức tiết kiệm thật là 78% hay chỉ 20%.
