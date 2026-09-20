# R-004 Phụ lục A — Thuật toán định tuyến: bằng chứng, so sánh, khi nào dùng cái nào

| | |
|---|---|
| **Thuộc nghiên cứu** | R-004 |
| **Feature** | **F-004 — Chọn model thích ứng cho fBuddy** |
| **Ngày khảo sát** | 20/09/2026 |
| **Loại tài liệu** | Phụ lục kỹ thuật — bổ sung bằng chứng cho R-004 §7–§9 |
| **Mức độ** | Số liệu lấy từ abstract/README gốc (đã fetch); **không** tự chạy lại thực nghiệm |

---

## A.1 Bốn họ thuật toán và bản chất

| Họ | Ý tưởng | Ví dụ | Điểm mạnh | Điểm yếu |
|---|---|---|---|---|
| **Routing** (định tuyến) | Chọn **một** model cho mỗi truy vấn, dựa trên dự đoán chất lượng/chi phí | RouteLLM (`mf`, `bert`, `sw_ranking`, `causal_llm`), semantic-router, RouterBench | Nhanh, chỉ 1 lượt gọi, tiết kiệm rõ | Sai một lần là mất cả lượt; cần "bộ ước lượng" tốt |
| **Cascading** (thác nước) | Chạy model rẻ trước, **kiểm tra**, nếu chưa đạt thì chạy model mạnh hơn | FrugalGPT, AutoMix | Chất lượng gần model mạnh, tiết kiệm lớn | Có thể tốn 2 lượt; cần tiêu chí "đạt" |
| **Cascade routing** (hợp nhất) | Tối ưu đồng thời cả chọn và nâng cấp | arXiv 2410.10347 | Được chứng minh tối ưu trong nhiều trường hợp; tác giả chỉ ra **bộ ước lượng chất lượng là then chốt** | Triển khai phức tạp hơn |
| **Học tăng cường/bandit** | Học dần từ kết quả thật | Thompson sampling theo (intent × model) | Tự thích nghi khi model/giá thay đổi | Cần dữ liệu; khám phá trên người dùng thật là rủi ro |

---

## A.2 Bằng chứng định lượng (đã fetch, 20/09/2026)

| Nguồn | Con số | Ghi chú |
|---|---|---|
| **RouteLLM** (arXiv 2406.18665; README) | **giảm tới 85% chi phí** giữ **95% chất lượng GPT-4** trên MT-Bench; bài báo: **giảm hơn 2×** ở một số trường hợp, không giảm chất lượng; có **khả năng chuyển đổi** khi đổi cặp model mạnh/yếu | Router `mf` được khuyến nghị (nhẹ, mạnh); `sw_ranking` dùng Elo có trọng số; `bert` là classifier; `causal_llm` dùng LLM làm router |
| **FrugalGPT** (arXiv 2305.05176) | khớp chất lượng model tốt nhất (GPT-4) với **giảm tới 98% chi phí**, hoặc **+4% chính xác** với cùng chi phí | Ba nhóm chiến lược: prompt adaptation, LLM approximation, **LLM cascade** |
| **AutoMix** (arXiv 2310.12963) | **giảm hơn 50% chi phí** với chất lượng tương đương | Cơ chế: **self-verification** (model tự ước lượng độ tin cậy) + router **POMDP** |
| **RouterBench** (arXiv 2403.12031) | bộ chuẩn + **405k kết quả suy luận** từ các LLM tiêu biểu | Dùng để so sánh router một cách hệ thống; có khung lý thuyết cho routing |
| **Routing + Cascading hợp nhất** (arXiv 2410.10347) | cascade routing **vượt trội rõ rệt** so với từng cách riêng; **"good quality estimators are the critical factor"** | Đây là kết luận quan trọng nhất cho fBuddy: đầu tư vào **bộ ước lượng**, không phải vào router |
| **Semantic Router** (aurelio-labs, MIT) | định tuyến bằng **embedding** (không cần LLM cho quyết định), có bản chạy local | Hợp cho phân loại **intent** nhanh, không hợp để ước lượng chất lượng câu trả lời |
| **OpenRouter Auto Router** | phân loại prompt thành **~30 loại việc**, chọn theo **thị phần chi tiêu 7 ngày**, có `cost_tier` low→max, fallback, trả `task_type` qua header metadata | Chọn theo "đám đông", không theo chất lượng đo được của bạn |
| **Not Diamond** | **$0,05 mỗi 1M token được route**; tự nhận 20–40% tiết kiệm; có chế độ **privacy-preserving** (chỉ dùng metadata) | Không phải gateway; cắm vào gateway sẵn có |
| **Portkey** | Free 10k log/tháng (không khuyến nghị production), **Production $49/tháng** | Nghiêng gateway/observability hơn router chất lượng |
| **LiteLLM Router** (OSS) | chiến lược: `simple-shuffle` (**khuyến nghị production**), rate-limit-aware, latency-based, least-busy, **lowest-cost**, tag-based, fallback/cooldown/retry; tài liệu **cảnh báo** usage-based routing tốn độ trễ do Redis | Nguồn ý tưởng tốt cho L3 (dự phòng/cooldown), không cần bê cả proxy vào fBuddy |

---

## A.3 Ánh xạ vào fBuddy: dùng cái nào, ở lớp nào

| Lớp | Nên dùng | Không nên |
|---|---|---|
| **L1 Lọc năng lực** | Tập luật + metadata (`supportsTools`, `supportsVision`, `context_len`, `privacy_class`) | Học máy — không cần, và sai thì hỏng nặng |
| **L2 Chấm điểm** | **Luật có trọng số cấu hình được** (R-004 §7) + điểm chất lượng đo từ eval; khi đã có ≥ vài nghìn lượt thì thử **`mf`-kiểu** (ma trận phân rã trên preference) hoặc classifier `bert` | Mua router đóng ngay từ đầu; dùng LLM làm router (tốn thêm lượt, thêm chỗ hỏng) |
| **L3 Thực thi** | **Cascade + dự phòng + cooldown** theo mô hình FrugalGPT/AutoMix, với **estimator rẻ của fBuddy** (tool call hợp lệ, artifact, kết thúc sạch, người dùng gửi lại) | Chỉ routing thuần (một phát, sai là hỏng lượt) |
| **L4 Học** | Bandit cho intent rủi ro thấp; A/B theo tài khoản | Khám phá trên `doc_*`, `data_analysis`, `image_*`, `sensitive` |
| **Phân loại intent** (đầu vào) | Luật rẻ tiền trước; nếu cần chính xác hơn thì **semantic-router kiểu embedding** (local, nhanh, không tốn token) | Gọi LLM để phân loại ở mỗi lượt |

---

## A.4 Cách tự kiểm chứng lại

```bash
curl -sL https://arxiv.org/abs/2406.18665    # RouteLLM
curl -sL https://arxiv.org/abs/2305.05176    # FrugalGPT
curl -sL https://arxiv.org/abs/2310.12963    # AutoMix
curl -sL https://arxiv.org/abs/2403.12031    # RouterBench
curl -sL https://arxiv.org/abs/2410.10347    # Routing + Cascading hợp nhất
curl -s -H "Accept: application/vnd.github.raw" \
  https://api.github.com/repos/lm-sys/RouteLLM/contents/README.md
curl -s -H "Accept: application/vnd.github.raw" \
  https://api.github.com/repos/aurelio-labs/semantic-router/contents/README.md
curl -sL https://openrouter.ai/docs/features/model-routing
curl -sL https://www.notdiamond.ai/pricing
curl -sL https://portkey.ai/pricing
curl -sL https://docs.litellm.ai/docs/routing
```

## A.5 Giới hạn của phụ lục này

- Con số của các bài báo là trên **bộ benchmark chung** (MT-Bench, GSM8K…) với **cặp model mạnh/yếu cụ thể** —
  **không** chuyển thẳng thành kỳ vọng cho fBuddy (tiếng Việt, có tool calling, có tạo tệp).
- **Chưa** thử nghiệm nào được chạy lại trong phiên này; mọi thứ ở đây là bằng chứng để thiết kế, không phải kết quả đo.
- Chưa kiểm chứng chi tiết RouterBench ở mức bảng số (chỉ đọc abstract).
