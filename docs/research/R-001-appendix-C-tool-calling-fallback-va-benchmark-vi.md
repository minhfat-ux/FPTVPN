<!--
  PHỤ LỤC THÔ — KHÔNG PHẢI KẾT LUẬN
  Báo cáo của một lượt nghiên cứu độc lập chỉ dùng web_search (không fetch được trang), giữ nguyên tiếng Anh
  và cách tự đánh dấu của nó: [SEEN] / [1SRC] / [UNVERIFIED] / [NOT FOUND].
  Mọi mục [UNVERIFIED] KHÔNG được dùng để ra quyết định. Kết luận chính thức của F-001 nằm ở
  R-001-free-llm-va-chi-phi-model.md.
  Phụ lục này CHỈ chứa phần R-001 CHƯA có: độ tin cậy tool calling, chiến lược fallback đa nhà cung cấp,
  và bản đồ benchmark tiếng Việt. Giá/quota của HF xin đọc R-001 (đã kiểm bằng API ngày 20/09/2026).
-->

# PHỤ LỤC R-001-C — Tool calling, fallback đa nhà cung cấp, benchmark tiếng Việt (nguồn thô, tiếng Anh)

| | |
|---|---|
| **Thuộc nghiên cứu** | R-001 |
| **Feature** | **F-001 — Chi phí model / LLM giá rẻ–miễn phí cho fBuddy** |
| **Loại tài liệu** | Phụ lục "nguồn thô" — đầu vào tham khảo, **không phải kết luận** |
| **Ngày** | 20/09/2026 |
| **Điểm yếu đã biết** | Chỉ có `web_search` (danh sách URL + tiêu đề, không có nội dung trang) ⇒ mọi con số phải đọc kèm nhãn |
| **Phạm vi** | Bù phần R-001 không có: (1) danh mục lỗi tool calling, (2) chiến lược fallback/throttle, (3) benchmark tiếng Việt |

## Đính chính — đọc trước

Bản nháp đầu tiên của lượt khảo sát này có **4 kết luận SAI**, đã được R-001 (đọc API gốc ngày 20/09/2026) sửa.
Ghi lại ở đây để không ai dùng lại:

| Kết luận sai trong bản nháp | Sự thật theo R-001 |
|---|---|
| "Không có model đặc thù tiếng Việt/Đông Nam Á nào được phục vụ qua router HF" | **SAI.** `aisingapore/Gemma-SEA-LION-v4-27B-IT` (0,20/0,40) và `aisingapore/Qwen-SEA-LION-v4-32B-IT` (0,25/0,50) **đang** được `publicai` phục vụ qua router |
| "Model rẻ nhất trên router là `openai/gpt-oss-20b` 0,05/0,18" | **Không còn đúng.** `gpt-oss-20b` qua deepinfra 0,03/0,14; rẻ nhất có tool calling là `Qwen/Qwen3-4B-Instruct-2507` qua nscale **0,01/0,03** |
| "OpenRouter `:free` thường không có tool calling" | **SAI ở thời điểm này.** 22 model `:free`, phần lớn `tools=true` (kiểm từ `openrouter.ai/api/v1/models`) |
| "Team/Enterprise ≈ 250 USD/tháng" | **SAI.** Tài liệu gốc: **2,00 USD/seat/tháng** |

Những gì dưới đây **giữ nguyên giá trị** vì R-001 không khảo sát: danh mục lỗi tool calling (§1),
bảng so sánh free-tier ngoài HF (§2), bản đồ benchmark tiếng Việt (§3), chiến lược fallback (§4).

---

## 1. Tool calling / function calling — độ tin cậy thật

HF có trang hướng dẫn riêng **"Function Calling with Inference Providers"**:
https://huggingface.co/docs/inference-providers/en/guides/function-calling
(raw: https://raw.githubusercontent.com/huggingface/hub-docs/refs/heads/main/docs/inference-providers/guides/function-calling.md)
**Sự tồn tại của trang hướng dẫn theo từng provider tự nó là bằng chứng: hỗ trợ là theo provider/model, không đồng nhất.** `[SEEN]`

### 1.1 Ai nhận tham số `tools`

| Provider / họ model | Nhận `tools`? | Nguồn |
|---|---|---|
| Router HF nói chung | Theo provider. Vercel AI SDK: *"Tool calling is supported by many models through Hugging Face's…"* | https://github.com/vercel/ai/commit/f30012565bb82871554098960d10ba838b55645e |
| HF router + MCP | HF có plumbing MCP (*"[MCP] Handle Ollama's deviation from the OpenAI tool streaming spec"*) | https://github.com/huggingface/huggingface_hub/pull/3140 |
| Model không hỗ trợ | **HTTP 400 `'tools' is not supported by the model`** | https://errs.dmxapi.cn/detail.php?id=4409 |
| `google/gemma-3-*` | Có **định dạng tool riêng** (FunctionGemma), kiểu Gemini API — **không** phải OpenAI style | https://ai.google.dev/gemma/docs/capabilities/function-calling · https://ai.google.dev/gemma/docs/functiongemma/formatting-and-best-practices |
| `google/gemma-3-12b-it` | Chat template **không có role `tool`** | https://huggingface.co/google/gemma-3-12b-it/discussions/11 |
| `google/gemma-3-27b-it` | Nhiều thread người dùng không gọi được tool | https://huggingface.co/google/gemma-3-27b-it/discussions/8 · https://huggingface.co/google/gemma-3-27b-it/discussions/24 · https://github.com/ollama/ollama/issues/9941 |
| `mistralai/Mistral-Small-3.1-24B` | Template tool **ra muộn**; client crash khi index `tool_calls` | https://github.com/ggml-org/llama.cpp/pull/14148 · https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503/discussions/63 |
| `Qwen/Qwen2.5-VL-32B`, `Qwen3-VL` | **Hỏng có tài liệu khi chạy vLLM** | https://github.com/QwenLM/Qwen3-VL/issues/1093 · https://huggingface.co/Qwen/Qwen2.5-VL-32B-Instruct-AWQ/discussions/10 |
| `openai/gpt-oss` (Harmony) | Chạy được, nhưng có bug thứ tự token + parallel call | https://huggingface.co/openai/gpt-oss-20b/discussions/218 |

### 1.2 Mười một kiểu lỗi có tên (FM-1 … FM-11)

| # | Kiểu lỗi | Vì sao fBuddy phải quan tâm | Nguồn |
|---|---|---|---|
| **FM-1** | Tool call không bao giờ kết thúc → vòng agent treo (không `tool_calls`, không content) | Cần timeout cứng + điều kiện kết thúc lượt, nếu không người dùng treo vô hạn | https://github.com/huggingface/huggingface_hub/issues/2829 |
| **FM-2** | **Streaming lệch chuẩn OpenAI**; delta tool lúc stream khác lúc không stream (khoảng trắng ở ranh giới) | fBuddy stream — **đây là rủi ro số 1** | https://github.com/huggingface/huggingface_hub/pull/3140 |
| **FM-3** | Tool parser **không nhận được `tools`** → model phát ra lời gọi cho tool chưa từng khai báo | Luôn validate tên tool theo registry trước khi chạy | https://github.com/vllm-project/vllm/pull/38860 · https://github.com/huggingface/huggingface_hub/pull/3082 |
| **FM-4** | **Tool calling của Qwen2.5-VL / Qwen3-VL hỏng thật khi chạy vLLM** | **Tool sửa ảnh không được dùng chung call với vòng tool** | https://github.com/QwenLM/Qwen3-VL/issues/1093 |
| **FM-5** | Qwen3 **parallel tool call** làm vỡ parser ngây thơ; một bug là treo kiểu ReDoS O(2^n) | Một prompt độc hại có thể treo worker | https://github.com/huggingface/trl/issues/4708 · https://github.com/huggingface/trl/issues/4865 |
| **FM-6** | gpt-oss / Harmony sai thứ tự token + bug parallel call; text-only → không làm ảnh | Chỉ dùng gpt-oss cho tool văn bản | https://huggingface.co/openai/gpt-oss-20b/discussions/218 |
| **FM-7** | Template phát hành thiếu tool; response **không có key `tool_calls`** | **Luôn kiểm tra key tồn tại** — thiếu key là bình thường, không phải exception | https://github.com/brainlid/langchain/issues/439 |
| **FM-8** | **Tool call bị phát ra dưới dạng văn bản thuần** (`<tool_call>{...}</tool_call>`, kiểu Hermes) thay vì `tool_calls` có cấu trúc | Parse `content` làm fallback **và đo tỉ lệ fallback** | https://github.com/ggml-org/llama.cpp/pull/20800 · https://github.com/NousResearch/hermes-agent/pull/83023 |
| **FM-9** | Ví dụ tool-agent mặc định của chính HF từng lỗi | Đừng đánh đồng "được hỗ trợ" với "chạy được" | https://github.com/huggingface/smolagents/issues/1808 |
| **FM-10** | Ghép vision + tools ở mép router mong manh: *"URGENT: Production outage – Hugging Face Router returns 500 errors for vision models"* | **Không dựa vào ảnh trả về từ tool** — tải về rồi gắn lại như image part thường | https://github.com/huggingface/huggingface_hub/issues/3688 · https://github.com/pydantic/pydantic-ai/issues/7651 |
| **FM-11** | Lệch shape schema HF-format vs OpenAI; router 5xx ngoài thực tế | Giữ đường fallback theo provider (`model:provider`) | https://github.com/huggingface/huggingface_hub/pull/2556 |

Nguồn bổ sung về parser: https://github.com/vllm-project/vllm/pull/17506 (Qwen3 tool calling lỗi khi dùng qwen3 reasoning parser) · https://github.com/vllm-project/vllm/pull/35687 (coi `<tool_call>` là kết thúc reasoning ngầm) · https://github.com/vllm-project/vllm/pull/55759 (trích tool call nằm trong block reasoning) · https://github.com/vllm-project/vllm/pull/47606 (flush reasoning parser ở ranh giới reasoning → tool) · https://github.com/NousResearch/hermes-agent/pull/7628 (fallback parser cho Qwen3-Coder) · https://github.com/defilantech/LLMKube/issues/589 (cần adapter cho model tool-call không chuẩn OpenAI) · https://github.com/anomalyco/opencode/pull/32666 (`function.name` null khi stream tool call)

### 1.3 Hợp đồng vòng tool phòng vệ (đề xuất)

1. **Kiểm tra tồn tại** key `tool_calls` trước khi index (FM-7).
2. **Timeout cứng mỗi lượt** + điều kiện kết thúc "không tool call và không content" (FM-1).
3. **Parser fallback cho envelope văn bản** (`<tool_call>`, JSON trong content) (FM-8), đo tỉ lệ fallback.
4. **Validate tên tool** theo registry trước khi thực thi (FM-3).
5. **Giới hạn parallel tool call 1–2** và parse có timeout để chặn FM-5.
6. **Buffer-and-parse khi stream**: lượt có tool thì retry non-streaming nếu delta hỏng (FM-2).
7. **Tách vision khỏi tools**: năng lực sửa ảnh gọi riêng, vòng tool chỉ văn bản (FM-4, FM-10).
8. **Temperature 0,0–0,3** cho lượt tool; resample 1 lần ở 0 khi parse lỗi. `[UNVERIFIED]`
9. **Không phụ thuộc `tool_choice: "required"`** và không phụ thuộc delta tool khi stream. `[UNVERIFIED]`
10. **Meter từ `usage`** trong response, **cộng biên cho retry/fallback/resample** — cả ba đều phổ biến trong vòng tool.
    ⚠️ R-001 §6 đã xác định: nếu gateway không trả `usage`, fBuddy đang **tính sàn 1 credit** ⇒ rủi ro mất doanh thu. Đây là **ca test đầu tiên** khi ghép HF.

---

## 2. Free tier ngoài HF — so sánh cùng ngày khảo sát

> Bảng này **bổ sung** §4 của R-001 (R-001 đã kiểm OpenRouter `:free` bằng API). Các ô ở đây phần lớn là
> `[UNVERIFIED]` / `[1SRC]` vì lượt khảo sát này không đọc được nội dung trang.

| Provider | Free quota | Rate limit free | Context | Tool calling | Vision | ToS dùng thương mại | Tiếng Việt | Giá trả tiền |
|---|---|---|---|---|---|---|---|---|
| **Cerebras** | **1M token/ngày** `[SEEN]` | `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED — chưa rõ]` | chưa xác nhận | `[UNVERIFIED]` | ngang model gốc | `[UNVERIFIED]` |
| **Cloudflare Workers AI** | **10.000 Neuron/ngày**, **0,011 USD/1.000 Neuron** `[SEEN]` | theo Neuron/ngày | theo model | Có tài liệu, **nhưng có bug schema + websocket** `[SEEN]` | Có (llava) | `[UNVERIFIED]` | trung bình | `[UNVERIFIED]` |
| **Gemini AI Studio** | free theo model; **2026 đã tăng quota**, có model ~1M TPM `[SEEN]` | **15 RPM · 1.000 RPD · 250k TPM** (nhiều khả năng là Flash-Lite) `[1SRC]` | 1M | Có, **nhưng `finish_reason=stop` thay vì `tool_calls`, SSE hỏng** `[SEEN]` | Tốt nhất | ⚠️ **Prompt ở free tier ĐƯỢC dùng để cải thiện sản phẩm / có người duyệt** `[SEEN]` — **không dùng cho dữ liệu người dùng thật; liên quan Nghị định 13/2023/NĐ-CP** | mạnh nhất nhóm closed | gemini-2.5-flash 0,30/2,50 `[SEEN]` |
| **Groq** | có free tier; **14.400 RPD KHÔNG phải quota chat model** `[SEEN]` | theo model `[UNVERIFIED]`; gợi ý 6.000 TPM `[1SRC]` | 131k / 8k ra (Llama-3.3-70B) `[1SRC]` | Có, **nhưng `tool_use_failed` + lỗi parse khi stream** `[SEEN]` | Có (Llama 4 Scout 128k) | ⚠️ ToS có điều khoản **"Non-Commercial Use Restriction"** — **phạm vi chưa xác minh; câu hỏi pháp lý lớn nhất** `[1SRC]` | trung bình | Llama-3.3-70B 0,59/0,79 `[1SRC]` |
| **OpenRouter `:free`** | **R-001 đã kiểm: 22 model, 20 req/phút, 50 req/ngày (1.000/ngày nếu ≥ ~9 credit), phần lớn `tools=true`** | xem R-001 §4 | theo model | Phần lớn CÓ (R-001) | theo model | cần bật privacy/data-policy `[UNVERIFIED]` | luân phiên | xem R-001 |
| **Mistral La Plateforme** | **~1B token/tháng** free Experiment, cần xác minh điện thoại `[1SRC]` | "1 req/giây" `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED]` | Pixtral trên free: `[UNVERIFIED]` | ⛔ **không mặc định là hợp pháp cho production** `[1SRC]` | yếu–trung bình | `[UNVERIFIED]` |
| **Together AI** | **free trial được cho là đã bỏ (8/2026) — tối thiểu 5 USD credit** `[1SRC]` | n/a | — | `[UNVERIFIED]` | `[UNVERIFIED]` | — | có Qwen3/Llama | `[UNVERIFIED]` |
| **Fireworks AI** | có trang free tier `[1SRC]` | `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED]` | — | dải `Free–9 USD/M` `[1SRC]` |
| **DeepInfra / Novita / Hyperbolic** | Novita tự nói key free có nhưng **không phải tất cả ở free mãi** `[SEEN]`; còn lại `[NOT FOUND]` | `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED]` | — | `[UNVERIFIED]` |
| **GitHub Models** | free có **chia tier model** `[SEEN]` | số RPD/token chưa xác minh `[UNVERIFIED]` | `[UNVERIFIED]` | nhiều khả năng có (OpenAI-compatible) `[UNVERIFIED]` | `[UNVERIFIED]` | xem Responsible Use | đa nhà cung cấp | **đang chuyển sang Microsoft Foundry trong 2026** `[SEEN]` |
| **Ollama / tự host** | "free" = bạn sở hữu GPU | n/a | theo model | Có, kèm lưu ý parser (FM-8) | model riêng | Không có ToS nhà cung cấp | Qwen3 là lựa chọn mở tốt nhất `[1SRC]` | ~0,57 USD/M ra nếu GPU thuê 0,40 USD/giờ chạy bão hòa 196 tok/s — **giá thuê GPU `[UNVERIFIED]`** |

**Streaming + tool call cùng lúc — kết luận:**

| Provider | Kết luận |
|---|---|
| Groq | **MỘT PHẦN** — có `tool_use_failed`; lỗi parse khi stream; cách chữa phổ biến là làm phẳng schema về `list[str]` |
| Gemini | **MỘT PHẦN** — `finish_reason=stop` thay vì `tool_calls`; SSE hỏng; có changeset riêng trong Vercel AI SDK cho tool call không tham số khi stream |
| Cloudflare Workers AI | **MỘT PHẦN** — có tài liệu function calling + trang troubleshooting, kèm bug từ chối schema và websocket khi tool call dài |
| Cerebras / Mistral / GitHub Models / Together / Fireworks / DeepInfra / Novita / Hyperbolic | **CHƯA XÁC MINH — không tìm được nguồn nào theo cả hai chiều. Phải test trước khi route.** |
| Ollama / local | Nhìn chung ổn; chất lượng parser khác nhau theo họ model |

Nguồn §2: https://stackoverflow.com/questions/79907528/why-does-groq-langchain-model-return-tool-use-failed-error · https://console.groq.com/docs/rate-limits · https://discuss.ai.google.dev/t/the-finish-reason-is-stop-instead-of-tool-calls-in-openai-compatible-endpoint/112704 · https://ai.google.dev/gemini-api/terms · https://simonwillison.net/2024/Oct/17/gemini-terms-of-service/ · https://developers.cloudflare.com/workers-ai/function-calling/embedded/troubleshooting/ · https://github.com/cloudflare/agents/issues/119 · https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/ · https://developers.cloudflare.com/workers-ai/platform/pricing/ · https://adam.holter.com/cerebras-opens-a-free-1m-tokens-per-day-inference-tier-and-ccerebras-now-offers-free-inference-with-1m-tokens-per-day-real-speed-benchmarks-show-2600-tokens-sec-on-llama4scout-here-are-the-actual-n/ · https://conductatlas.com/platform/groq/groq-terms-of-use/provision/CA-P-010022/limited-license-and-non-commercial-use-restriction/ · https://github.com/orgs/community/discussions/137298 · https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/how-to/quickstart-github-models · https://yourtechcompass.com/together-ai-review-2026/

---

## 3. Bản đồ benchmark tiếng Việt (R-001 chưa có mục này)

### 3.1 Bộ benchmark nên dùng

| Benchmark | Nội dung | Link |
|---|---|---|
| **VMLU** | Vietnamese Multitask Language Understanding — **10.880 câu trắc nghiệm** `[SEEN]`; tương đương MMLU cho tiếng Việt. **Số chủ đề: không xác minh được** (con số "58" không có nguồn). Site thật là **`vmlu.ai`** — `vmlu.org` không tồn tại trong kết quả tìm kiếm. Do Zalo AI + JAIST quản lý | https://aclanthology.org/2025.acl-long.563.pdf · https://ar5iv.labs.arxiv.org/html/2312.11011 · https://vmlu.ai/ |
| **SEA-HELM (VI)** | Bộ kiểu HELM của SEA-LION, **có nhánh riêng tiếng Việt và có cả model closed-source** — leaderboard hữu dụng nhất cho quyết định này | **https://leaderboard.sea-lion.ai/detailed/VI** |
| **VN-Bench** | Leaderboard tiếng Việt độc lập (NRL) | https://www.nrl.ai/en/bench · https://www.nrl.ai/vi/bench |
| **V-Bench** | Bộ của VinUni (2026); **V-LLM v1** của Vingroup được báo là đứng đầu ít nhất một chỉ số, trên cả ChatGPT/Gemini | https://cafebiz.vn/vinuni-cong-bo-xep-hang-ai-cua-ty-phu-pham-nhat-vuong-dung-dau-o-1-chi-so-176260707072441174.chn · https://nguoiquansat.vn/ai-cua-vingroup-dung-dau-ve-nang-luc-tieng-viet-302293.html |
| **ViGLUE** | Bộ NLU kiểu GLUE cho tiếng Việt | https://aclanthology.org/2024.findings-naacl.261/ |
| **Global MMLU / MMMLU (vi)** | MMLU theo từng ngôn ngữ, đối chiếu chéo | https://papers.neurips.cc/paper_files/paper/2025/file/45a7ca247462d9e465ee88c8a302ca70-Paper-Conference.pdf |
| **VLegal-Bench** | Suy luận pháp lý tiếng Việt | https://ar5iv.labs.arxiv.org/html/2512.14554 |
| **SeaExam / SeaBench** | Câu hỏi bản địa Đông Nam Á | https://aclanthology.org/2025.findings-naacl.341.pdf |
| **MuBench** | Đánh giá 61 ngôn ngữ | https://ar5iv.labs.arxiv.org/html/2506.19468 |
| **Suy luận tiếng Việt (LREC 2026 SIGUL)** | *"How Well Do Large Language Models Reason in Under-Resourced Languages? Evidence from Vietnamese"* — nghiên cứu học thuật sát use case fBuddy nhất | https://aclanthology.org/2026.sigul-1.1/ |
| **Bộ miền tiếng Việt** | Văn hoá / STEM / Pháp lý / Y tế / An toàn / Coding / Thơ | https://arxiv.org/pdf/2604.03395 |
| **SealTool** | Benchmark tool calling Đông Nam Á | https://aclanthology.org/2026.findings-acl.462.pdf |
| **BFCL đa ngữ** | Berkeley Function-Calling Leaderboard, nhánh đa ngữ cho model nhỏ/vừa | https://browse-export.arxiv.org/pdf/2511.22138 |
| **Từ chối gọi tool ở ngôn ngữ ít tài nguyên** | *"Teaching Small Models When Not to Call Functions"* — liên quan trực tiếp tới lỗi **gọi tool thừa** (tốn credit) | https://dl.acm.org/doi/pdf/10.1145/3805712.3809979 |

### 3.2 Con số bắt được

| Nội dung | Số | Nhãn | Nguồn |
|---|---|---|---|
| `gemini-2.5-flash` trên một eval tiếng Việt (VN-vi / VN-en) | **VN-vi 73,6**; VN-en 69,6 / 77,3 | `[SEEN]` (nguyên dòng bảng) | https://sap.ist.i.kyoto-u.ac.jp/EN/bib/intl/ZHE-ACL26.pdf |
| **VM14K (y khoa tiếng Việt)** — cặp open vs closed sạch nhất tìm được | `Gemini 2.0 Flash`: 77,92 / 80,16 / 77,34 / 74,77 / 75,67 / 78,03 / 75,18 / 71,75 — `Qwen3-32B`: — / — / — / — / 72,47 / 74,37 / 72,10 / 68,79 ⇒ **model đóng thắng mọi cột có đủ hai giá trị** | `[SEEN]` (dòng bảng; **lưu ý là Gemini 2.0, không phải 2.5**) | https://ar5iv.labs.arxiv.org/html/2506.01305 |
| **ViExam / VMMU** | 2.548 câu hỏi, 7 miền; dòng `Sonnet 4.0`: 50,66 / 38,50 / 53,31 / 44,87 / 48,44 / 58,04 / 44,17 / 48,28. Có **dòng `gemini-2.5-flash` nhưng giá trị bị che trong snippet** | `[SEEN]` (dòng bảng một phần) | https://ar5iv.labs.arxiv.org/html/2508.13680 · https://github.com/vytuongdang/VMMU |
| **Dịch máy Vi–En (khảo sát đa ngữ)** | *"For Spanish and Vietnamese, the **Aya Expanse 8B** model outperforms all other models across the three evaluation metrics"* ⇒ một model mở **nhỏ** dẫn đầu dịch Vi trong khảo sát đó | `[SEEN]` (trích) | https://dl.acm.org/doi/pdf/10.1145/3786171.3788386 |
| **Sailor2-8B / Sailor2-8B-Chat** | Nhiều dòng số đầy đủ có trong 2 bài (2502.12982, 2504.05747), **nhưng không snippet nào lộ tiêu đề cột** ⇒ giữ làm bằng chứng thô, không diễn giải thành điểm | `[SEEN]` (dòng bảng, header không rõ) | https://ar5iv.labs.arxiv.org/html/2502.12982 · https://ar5iv.labs.arxiv.org/html/2504.05747 |
| VLSP 2025 (xác nhận dùng Gemini) | *"We test multiple versions of the Gemini family, including the lightweight **Gemini-1.5/2.5 Flash**"* | `[SEEN]` (trích) | https://aclanthology.org/2025.vlsp-1.43.pdf |
| `Qwen3-32B` vs `gpt-4o-mini` trên MMLU (không riêng tiếng Việt) | Qwen3-32B **87,9x** vs GPT-4o-mini **88,37** | `[SEEN]` | https://arxiv-org.ezproxy.obspm.fr/pdf/2608.04634 |
| SeaLLM-7B-v2.5 (nền Gemma-7B) | *"surpasses ChatGPT-3.5"* | `[SEEN]` (trích) | https://aclanthology.org/2024.acl-demos.pdf |
| Sailor2 | tự nhận vượt Qwen2.5 / Llama 3.1 / Gemma 2 / SEA-LION trên ngôn ngữ SEA | `[1SRC]` blog hãng | https://sail.sea.com/blog/articles/55 |
| MuBench (61 ngôn ngữ) | *"Among open models, **Qwen** demonstrates strong and consistent performance"* | `[SEEN]` | https://ar5iv.labs.arxiv.org/html/2506.19468 |
| VLegal-Bench, dòng `BloomVN-8B-chat` | Overall 49,08 / 57,00 ở các cột được báo | `[SEEN]` (dòng một phần) | https://ar5iv.labs.arxiv.org/html/2512.14554 |
| Lợi thế model đóng **đang hẹp lại** | *"The Diminishing Advantage of Proprietary Models … (GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Flash) maintain…"* | `[SEEN]` (mảnh trích) | https://arxiv.org/pdf/2512.14554v5 |
| Qwen3-30B-A3B-Instruct-2507 (chung, không riêng VI) | 79,65 / 76,63 / 79,17 / 79,01 / 78,62 / 81,21 | `[SEEN]` | https://arxiv-org.ezproxy.obspm.fr/pdf/2607.02966 |
| Quét đa ngữ Gemma 3 / Llama 3 | *"Llama3-70B-base and Gemma3-27B-base perform best overall, both scoring 90.2% on average"* | `[SEEN]` | http://web3.arxiv.org/pdf/2504.02768 |

### 3.3 Trả lời thẳng câu "open model có đuổi kịp gemini-2.5-flash?"

* **Trên tác vụ kiến thức/trắc nghiệm tiếng Việt (kiểu VMLU):** bằng chứng duy nhất lấy được là **VM14K
  (y khoa)**: `Gemini 2.0 Flash` thắng `Qwen3-32B` ở **mọi cột có đủ hai giá trị** (ví dụ 74,77 vs 68,79;
  75,67 vs 72,47). Nghĩa là ở miền chuyên môn tiếng Việt, model đóng vẫn dẫn. Việc "Qwen3-32B / SEA-LION v4
  nằm cùng dải Gemini Flash" **chưa có số tiếng Việt nào chống lưng trong lượt khảo sát này.**
  `[UNVERIFIED dưới dạng một con số — xem PHỤ LỤC R-001-D: bảng xếp hạng VMLU KHÔNG lấy được.]`
* **Trên chất lượng chat tiếng Việt, tuân thủ hướng dẫn và tool calling:** khoảng cách rộng hơn và nghiêng về
  model đóng. Mọi đánh giá tiếng Việt tìm được đều có dạng kiến thức/trắc nghiệm.
  Có công trình tool-calling cho khu vực — **SealTool**, **BFCL đa ngữ**, nghiên cứu **từ chối gọi tool** —
  nhưng **không tìm được leaderboard tool-calling riêng cho tiếng Việt có số theo từng model.
  Đây là lỗ hổng bằng chứng lớn nhất cho fBuddy**, vì vòng agent tool chính là điểm khác biệt của sản phẩm.
* **Kỳ vọng lỗi "gọi tool thừa":** sự tồn tại của tài liệu về *từ chối gọi tool* cho thấy model nhỏ/vừa
  **gọi tool cả khi không nên**. Với fBuddy, mỗi lần gọi tool là một lần trừ credit ⇒ phải có đường
  **từ chối/không gọi** và đo tỉ lệ này.
* **Model mở thắng ở đâu cho fBuddy:** chi phí, tự host/toàn quyền dữ liệu, và quyền fine-tune trên dữ liệu
  tiếng Việt riêng (workflow Excel/PowerPoint/phân tích dữ liệu, dọc kế toán–tài chính VN).
* **Việc nên làm thay vì tin mọi bảng trên:** chạy **VMLU + SEA-HELM-VI + ~200 prompt tiếng Việt thật của
  fBuddy** trên `gemini-2.5-flash`, `Qwen3-32B`, `Qwen3-30B-A3B`, `Qwen-SEA-LION-v4-32B-IT`, `gpt-oss-120b`
  và chấm bằng rubric tiếng Việt. Chi phí vài USD, giá trị cao hơn toàn bộ bảng tổng hợp trong tài liệu này.
* **Cảnh báo về chính tài liệu này:** phần lớn dòng số ở §3.2 được trích từ snippet **không có dòng tiêu đề
  cột đi kèm** ⇒ đọc như **bằng chứng thô**, không phải chỉ số đã diễn giải. Chi tiết và danh sách URL cần
  fetch nằm ở **PHỤ LỤC R-001-D** (benchmark tiếng Việt).

### 3.4 Cảnh báo "benchmark là marketing"

Thị trường Việt Nam có các bảng xếp hạng do chính chủ model công bố (V-Bench / V-LLM v1 của Vingroup;
model 120B của Viettel *"ranking among leading models of comparable scale"*). Coi các tuyên bố dẫn đầu
của chủ model là marketing cho tới khi được tái lập độc lập.
Nguồn: https://viettelai.vn/en/tin-tuc/viettel-trains-120-billion-parameter-vietnamese-sovereign-ai-model

---

## 4. Chiến lược fallback đa nhà cung cấp (R-001 §7 mới chỉ nêu rủi ro)

### 4.1 Sơ đồ mục tiêu

```
                      +-------------------------------------+
  fBuddy web  ------->|  LLM Gateway (dịch vụ của mình)     |
                      |  - route theo năng lực (tools/ảnh)  |
                      |  - circuit breaker theo provider    |
                      |  - kế toán token + credit           |
                      |  - cache prompt tiếng Việt          |
                      +------+------------------------------+
                             |
   +-------------+-----------+------------+--------------+-------------+
   v             v           v            v              v             v
 P0 CHÍNH     P1 PHỤ      P2 HF ROUTER  P3 FREE        P4 FREE      P5 LOCAL
 Gemini 2.5   Groq         router.hf.co  Cerebras       Cloudflare   Ollama
 Flash        Llama-3.3    model:provider 1M tok/ngày   10k Neuron   Qwen3-30B-A3B
 (trả tiền)   70B          (trả tiền rẻ) (dev/overflow) (dev/overflow)(lô/ngoại tuyến)
```

### 4.2 Bảng route

| Vai trò | Model | Vì sao | Chi phí |
|---|---|---|---|
| **P0 chính (đường nóng)** | `google/gemini-2.5-flash` | Tiếng Việt tốt nhất + vision gốc cho sửa ảnh + tool calling thật | xem R-001 §5 |
| **P1 phụ rẻ (đường nóng)** | `meta-llama/Llama-3.3-70B-Instruct` trên Groq, **schema tool làm phẳng** | Nhanh; đã có cách chữa `tool_use_failed` | rẻ hơn Gemini ~3× phần vào |
| **P2 trừu tượng hoá / dự phòng** | Router HF `router.huggingface.co/v1` + ghim `model:provider` | Một mặt API OpenAI-compatible; ghim provider cho phép health-check và failover không phải viết lại | passthrough |
| **P2 model rẻ nhất router** | `Qwen/Qwen3-4B-Instruct-2507` (nscale, 0,01/0,03), `openai/gpt-oss-20b` (deepinfra) | Tiêu đề hội thoại, phân loại, điền tham số MCP | **R-001 §3** |
| **P2 model tiếng Việt trên router** | `aisingapore/Qwen-SEA-LION-v4-32B-IT` (publicai) | Dòng SEA-LION v4 làm riêng cho Đông Nam Á, model card nêu hỗ trợ tiếng Việt + function calling | **R-001 §3** |
| **P2 vision trên router** | `Qwen/Qwen3-VL-*` | Gọi **tách riêng** khỏi vòng tool (FM-4, FM-10) | **R-001 §3** |
| **P3 overflow free** | Cerebras | 1M token/ngày thật sự miễn phí | 0 |
| **P4 overflow free** | Cloudflare Workers AI | 10k Neuron/ngày | 0 |
| **P5 lô / ngoại tuyến** | Tự host `Qwen/Qwen3-30B-A3B` (18,6 GB @ Q4_K_M, ~196 tok/s trên 4090) | Không hoá đơn theo token; tự do fine-tune tiếng Việt | chi phí GPU cố định |

### 4.3 Thứ tự failover

1. **Gemini 2.5 Flash** → gặp `429`, `5xx`, TTFT > 8 s, hoặc **delta tool khi stream hỏng** → hạ bậc trong một cửa sổ cooldown.
2. **Groq Llama-3.3-70B** → `tool_use_failed` hai lần trong cùng một lượt → trả Gemini về cho **lượt có tool**, giữ Groq cho chat thường.
3. **Router HF (ghim provider)** → traffic lô/cần rẻ, và là đường độc lập thứ ba.
4. **Cerebras / Cloudflare free** → **chỉ dev/eval và overflow không có dữ liệu người dùng.** Không đặt tin nhắn tiếng Việt thật lên free tier chưa làm rõ ToS (§2).
5. **Qwen3 tự host** → việc lô, eval ngoại tuyến, và đường cuối khi mọi API bị throttle.

### 4.4 Phát hiện bị throttle (cụ thể)

| Tín hiệu | Hành động |
|---|---|
| HTTP `429` + `Retry-After` | tuân thủ đúng; không retry trước hạn |
| HTTP `402` (OpenRouter hết credit) | đánh dấu provider **hết tiền**; không retry |
| HTTP `400 'tools' is not supported by the model` | ghi vào cache năng lực là **lệch năng lực** cho tổ hợp `(model, provider, tools=true)` — đây **không** phải lỗi tạm thời |
| Stream kết thúc không có `tool_calls` **và** không content | điều kiện kết thúc FM-1 → retry một lần non-streaming ở temp 0 |
| `finish_reason=stop` khi đã yêu cầu tools (Gemini OpenAI-compat) | coi là **mất tool call âm thầm** → fallback |
| `tool_use_failed` lặp lại (Groq) | làm phẳng schema, rồi fallback |
| Router `500` với model vision | đẩy vision sang P0; không retry đường router |
| TTFT vượt ngân sách p99 | hạ bậc provider trong một cooldown (throttle mềm — rẻ hơn một lỗi) |

LiteLLM hỗ trợ sẵn `fallbacks`, cooldown, route theo loại lỗi: https://docs.litellm.ai/docs/proxy/config_settings ·
https://openrouter.ai/docs/guides/routing/provider-selection ·
https://futureagi.com/blog/what-is-llm-fallback-strategy-2026/

### 4.5 Free tier đáng bao nhiêu tiền (định lượng)

Giả định một lượt chat có vòng agent **~4.000 token vào + ~600 token ra**; dùng đơn giá gemini-2.5-flash
0,30/2,50 USD/1M `[SEEN]` ⇒ ≈ 0,0012 + 0,0015 ≈ **0,0027 USD/lượt**.

| Free tier | Giá trị/tháng (bậc độ lớn) | Kết luận |
|---|---|---|
| Cerebras 1M token/ngày | ~30M token/tháng ≈ **9–30 USD tương đương** | **Có ý nghĩa cho dev + overflow**, không đủ cho đợt tăng tải |
| Cloudflare 10k Neuron/ngày | tính theo Neuron, ~**vài USD/tháng tương đương** | chỉ dev/eval |
| Gemini free tier | quota rộng, nhưng **ToS dữ liệu khiến không dùng được cho production** | chỉ đánh giá |
| Groq free tier | quota hữu ích, nhưng **điều khoản phi thương mại chưa rõ phạm vi** | chỉ đánh giá tới khi pháp lý xác nhận |
| OpenRouter `:free` | **R-001: 20 req/phút, 50 req/ngày** | dùng có điều kiện; R-001 §1 kết luận đây là đường "free" khả thi nhất |
| Credit HF free/PRO | 0,10 / 2,00 USD/tháng | chỉ dev/eval |

**Kết luận: không có cấu hình free tier nào đủ nuôi fBuddy production.** Free tier mua tốc độ phát triển và
biên dự phòng; kinh tế đơn vị phải xây trên **đơn giá trả theo token**, coi free tier là ưu đãi cho R&D chứ
không phải thay thế COGS.

---

## 5. Việc cần spike (chỉ trả lời được bằng chạy thật)

1. HF router có trả `usage` khi `stream=true` không? → quyết định việc fBuddy đang **tính sàn 1 credit** (R-001 §6).
2. Model giá 0 trên router HF có hạn mức/ngày không? (có báo cáo `429 free-models-per-day` chưa kiểm)
3. Ghép vision + tool call trong **một** call qua router HF có hỏng thật không? (FM-4/FM-10 mới là giả thuyết)
4. `Gemma-SEA-LION-v4-27B-IT` qua publicai: API Hub khai `toolCalling: false` nhưng model card nói có function calling ⇒ **phải test**.
5. Chất lượng tiếng Việt: chạy bộ eval ở §3.3 trên 5 model ứng viên.
6. Điều khoản Gemini free tier (dữ liệu người dùng có bị dùng để cải thiện sản phẩm) — **bắt buộc** vì liên quan Nghị định 13/2023/NĐ-CP.
7. **Lấy bảng xếp hạng VMLU** (chưa ai lấy được): fetch theo thứ tự `https://vmlu.ai/` → `https://aclanthology.org/2025.acl-long.563.pdf` → `https://leaderboard.sea-lion.ai/detailed/VI` → `https://arxiv.org/html/2512.14554v5` → `https://arxiv.org/pdf/2508.13680v3` → `https://arxiv.org/html/2506.01305`

## 6. Nguồn

**Tool calling:** https://huggingface.co/docs/inference-providers/en/guides/function-calling · https://github.com/huggingface/huggingface_hub/issues/2829 · https://github.com/huggingface/huggingface_hub/pull/3140 · https://github.com/huggingface/huggingface_hub/pull/3082 · https://github.com/huggingface/huggingface_hub/pull/2556 · https://github.com/huggingface/huggingface_hub/issues/3688 · https://github.com/huggingface/trl/issues/4708 · https://github.com/huggingface/trl/issues/4865 · https://github.com/huggingface/smolagents/issues/1808 · https://github.com/QwenLM/Qwen3-VL/issues/1093 · https://huggingface.co/Qwen/Qwen2.5-VL-32B-Instruct-AWQ/discussions/10 · https://huggingface.co/openai/gpt-oss-20b/discussions/218 · https://huggingface.co/google/gemma-3-12b-it/discussions/11 · https://huggingface.co/google/gemma-3-27b-it/discussions/8 · https://huggingface.co/google/gemma-3-27b-it/discussions/24 · https://github.com/ollama/ollama/issues/9941 · https://github.com/ggml-org/llama.cpp/pull/14148 · https://github.com/ggml-org/llama.cpp/pull/20800 · https://github.com/NousResearch/hermes-agent/pull/83023 · https://github.com/NousResearch/hermes-agent/issues/49983 · https://github.com/brainlid/langchain/issues/439 · https://github.com/pydantic/pydantic-ai/issues/7651 · https://errs.dmxapi.cn/detail.php?id=4409 · https://ai.google.dev/gemma/docs/capabilities/function-calling · https://ai.google.dev/gemma/docs/functiongemma/formatting-and-best-practices

**Model tiếng Việt / Đông Nam Á trên Hub:** https://huggingface.co/SeaLLMs/SeaLLM-7B-v2.5 · https://huggingface.co/SeaLLMs/SeaLLMs-v3-7B-Chat · https://huggingface.co/aisingapore/Gemma-SEA-LION-v3-9B · https://huggingface.co/aisingapore/Llama-SEA-LION-v3-8B-IT · https://huggingface.co/sail/Sailor2-20B-Chat · https://huggingface.co/sail/Sailor2-8B-Chat · https://huggingface.co/Viet-Mistral/Vistral-7B-Chat · https://huggingface.co/hiieu/Vistral-7B-Chat-function-calling · https://huggingface.co/vinai/PhoGPT-4B-Chat · https://huggingface.co/BlossomsAI/BloomVN-8B-chat · https://huggingface.co/collections/aisingapore/sea-lion-v3

**Benchmark tiếng Việt:** https://aclanthology.org/2025.acl-long.563.pdf · https://vmlu.ai/ · https://ar5iv.labs.arxiv.org/html/2506.01305 (VM14K) · https://ar5iv.labs.arxiv.org/html/2508.13680 (ViExam/VMMU) · https://dl.acm.org/doi/pdf/10.1145/3786171.3788386 (Aya Expanse 8B dẫn đầu dịch Vi) · https://aclanthology.org/2025.vlsp-1.43.pdf · https://leaderboard.sea-lion.ai/detailed/VI · https://www.nrl.ai/en/bench · https://aclanthology.org/2024.findings-naacl.261/ · https://ar5iv.labs.arxiv.org/html/2512.14554 · https://ar5iv.labs.arxiv.org/html/2506.19468 · https://aclanthology.org/2025.findings-naacl.341.pdf · https://papers.neurips.cc/paper_files/paper/2025/file/45a7ca247462d9e465ee88c8a302ca70-Paper-Conference.pdf · https://aclanthology.org/2024.acl-demos.pdf · https://sap.ist.i.kyoto-u.ac.jp/EN/bib/intl/ZHE-ACL26.pdf · https://cafebiz.vn/vinuni-cong-bo-xep-hang-ai-cua-ty-phu-pham-nhat-vuong-dung-dau-o-1-chi-so-176260707072441174.chn · https://aclanthology.org/2026.sigul-1.1/ · https://arxiv.org/pdf/2604.03395 · https://aclanthology.org/2026.findings-acl.462.pdf · https://browse-export.arxiv.org/pdf/2511.22138 · https://dl.acm.org/doi/pdf/10.1145/3805712.3809979

**Voice (nhắc thêm cho fBuddy):** https://huggingface.co/pnnbao-ump/VieNeu-TTS-q4-gguf (Apache-2.0, TTS tiếng Việt) · https://huggingface.co/undertheseanlp/asr-1 (ASR tiếng Việt)
