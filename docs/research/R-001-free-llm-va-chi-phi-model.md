# R-001 — Dùng LLM "miễn phí" (Hugging Face, OpenRouter free) để giảm chi phí model của fBuddy

| | |
|---|---|
| **Mã nghiên cứu** | R-001 |
| **Feature** | **F-001 — Chi phí model / nhà cung cấp LLM giá rẻ–miễn phí cho fBuddy** |
| **Câu hỏi nghiên cứu** | "Dùng các LLM free trên Hugging Face cho fBuddy được không, rẻ được bao nhiêu, rủi ro gì?" |
| **Ngày khảo sát** | 20/09/2026 (giờ máy Mac) |
| **Người thực hiện** | Phiên nghiên cứu (Mac) |
| **Trạng thái** | Có kết luận — chờ quyết định của chủ dự án |
| **Liên quan trong repo** | `server/src/providers/index.js`, `server/src/providers/openai.js`, `server/src/credits.js`, `docs/ARCHITECTURE.md` |

> Mọi con số dưới đây là **giá trị tại ngày khảo sát**. Giá/quota của HF và OpenRouter đổi liên tục —
> chạy lại mục "Cách tự kiểm chứng lại" trước khi dùng để ra quyết định.

---

## 1. Kết luận (TL;DR)

1. **Hugging Face không có "LLM miễn phí".** "Inference Providers" là router OpenAI-compatible
   **trả tiền theo token theo đúng giá provider, không markup**; tài khoản free được tặng
   **0,10 USD/tháng**, PRO **2,00 USD/tháng**. `[ĐÃ KIỂM]`
2. **Model giá 0 là promo tạm thời và rất ít:** quét 2.361 model đang phục vụ, chỉ **4 endpoint giá 0**. `[ĐÃ KIỂM]`
3. **0,10 USD/tháng ≈ 2.200 lượt chat fBuddy** trên model rẻ nhất có tool calling, ~300–600 lượt trên
   model 20B–27B. Đủ để **dev / đo chất lượng**, **không đủ** nuôi production. `[ĐÃ KIỂM]`
4. **Muốn "free" cho production thì HF không phải chỗ:** cùng ngày, OpenRouter có **22 model `:free`**
   với hạn mức **20 request/phút, 50 request/ngày** (1.000/ngày nếu đã từng mua ≥ ~9 credit) — và fBuddy
   **đã có sẵn** kind `openrouter`. `[ĐÃ KIỂM]`
5. **Giảm tiền thật không cần HF:** chỉ cần đổi model id sang các model rẻ trên OpenRouter
   (`mistral-nemo` 0,019/0,030; `ling-3.0-flash` 0,021/0,063; `deepseek-v4-flash-0731` 0,04/0,08 USD mỗi 1M token,
   đều có tool calling) — rẻ hơn `gemini-2.5-flash` đang chạy **20–50 lần**, không thêm provider nào. `[ĐÃ KIỂM]`
6. **Tích hợp HF gần như 0 dòng code** (kind `openai-compatible`, base URL `https://router.huggingface.co/v1`),
   nhưng có 2 điểm phải xác minh (usage khi stream; bảng giá model HF) — xem §6.
7. **Đề xuất:** dùng HF làm (a) sân đo chất lượng model rẻ, (b) hàng dự phòng — **không** làm mặc định,
   **không** hứa "miễn phí" với người dùng.

---

## 2. HF cho gì, "miễn phí" nằm ở đâu `[ĐÃ KIỂM]`

| Hạng mục | Số thật 20/09/2026 | Nguồn |
|---|---|---|
| Credit tặng/tháng, tài khoản free | **0,10 USD**, "subject to change" | `huggingface/hub-docs` → `docs/inference-providers/pricing.md` (commit 21/08/2026) |
| Credit tặng/tháng, PRO | **2,00 USD** (gói PRO trả phí) | như trên |
| Credit tặng, Team/Enterprise | 2,00 USD **mỗi seat**, dùng chung với Inference Endpoints / GPU Spaces / Jobs | như trên |
| Cách tính tiền | Đúng giá provider, HF "no additional fees" (passthrough) | như trên |
| Hết credit | Phải **mua credit** mới dùng tiếp (pay-as-you-go) | như trên |
| Mang key provider riêng | Đi qua router nhưng **không** tiêu credit HF | như trên |
| Endpoint | `https://router.huggingface.co/v1` — OpenAI-compatible, **chỉ chat completion** | `docs/inference-providers/index` |
| Route theo provider | `https://router.huggingface.co/<provider>/...` (ví dụ `hf-inference` → `/hf-inference/models/<model>`) | `huggingface.js` → `packages/inference/src/config.ts`, `providers/hf-inference.ts` |
| Token | Fine-grained token cần quyền **"Make calls to Inference Providers"** | `docs/inference-providers/index` |
| Dữ liệu | HF **không lưu** request body/response; log debug tối đa **30 ngày**; TLS | `docs/inference-providers/security.md` |

Lưu ý mâu thuẫn trong chính tài liệu HF: trang index quảng cáo *"generous free tier"*, còn trang pricing
ghi **0,10 USD/tháng**. Chỉ tin con số.

### 2.1 Bốn chỗ có thể gọi là "miễn phí"

| Đường | Thực chất | Dùng được cho fBuddy? |
|---|---|---|
| Credit tặng 0,10 USD/tháng | Credit thật, tiêu cho mọi provider HF route | Được, nhưng rất nhỏ |
| **Public AI** (tổ chức phi lợi nhuận, phục vụ model công như Apertus, SEA-LION) | Qua HF **vẫn bị tính tiền theo token** (SEA-LION 32B: 0,25/0,50 USD/1M) | Được, không "free" |
| **Featherless AI** — gói Chat 25 USD/tháng "Unlimited tokens" (32K ctx, 4 luồng) | Điều kiện gói **loại trừ "app or API traffic, reselling, background automation and benchmarking"** | **Không** (vi phạm điều kiện) |
| Promo model giá 0 | 4 endpoint, biến động theo ngày | Không nên phụ thuộc |

Bốn endpoint giá 0 tại ngày khảo sát: `prism-ml/Ternary-Bonsai-27B-gguf` và `-AWQ-4bit` (together),
`inclusionAI/Ling-3.0-flash-Fin` và `-VL` (novita) — đều ctx 262.144, có tool calling.
Router còn có field `is_free` được mô tả là *"temporary promo"*.

`[CHƯA KIỂM]` Có báo cáo (mã trong một Space công khai) về lỗi
`429 Rate limit exceeded: free-models-per-day`, tức model giá 0 vẫn có hạn mức/ngày.
Con số này **không** có trong tài liệu chính thức của HF ⇒ phải tự test (spike #2).

---

## 3. Model đáng thử cho fBuddy — giá thật `[ĐÃ KIỂM]`

Giá = USD/1M token (vào/ra) lấy từ API Hub. "Lượt/$0.10" tính theo **một lượt fBuddy thật**:
~3.000 token vào (schema công cụ ~1.600 + system prompt + lịch sử) + ~500 token ra.

| Model | Provider rẻ nhất có tool calling | Vào/Ra | Context | USD/lượt | Lượt với 0,10 USD |
|---|---|---|---|---|---|
| `Qwen/Qwen3-4B-Instruct-2507` | nscale | 0,01 / 0,03 | 262k | 0,000045 | **~2.200** |
| `openai/gpt-oss-120b` | deepinfra | 0,037 / 0,17 | 131k | 0,000196 | ~510 |
| `openai/gpt-oss-20b` | deepinfra | 0,03 / 0,14 | 131k | 0,000160 | ~625 |
| `google/gemma-3-4b-it` | deepinfra | 0,05 / 0,10 | 131k | 0,000200 | ~500 |
| `google/gemma-3-12b-it` | deepinfra | 0,05 / 0,15 | 131k | 0,000225 | ~444 |
| `google/gemma-3-27b-it` | deepinfra | 0,08 / 0,16 | 131k | 0,000320 | ~312 |
| `Qwen/Qwen3-8B` | nscale | 0,07 / 0,18 | 41k | 0,000300 | ~333 |
| `deepseek-ai/DeepSeek-V4-Flash` | deepinfra | 0,09 / 0,18 | 1M | 0,000360 | ~277 |
| `zai-org/GLM-4.7-Flash` | novita | 0,07 / 0,40 | 200k | 0,000410 | ~243 |
| `Qwen/Qwen3-235B-A22B-Instruct-2507` | deepinfra | 0,09 / 0,55 | 262k | 0,000545 | ~183 |
| `meta-llama/Llama-3.3-70B-Instruct` | novita | 0,135 / 0,40 | **12k** (!) | 0,000605 | ~165 |
| `aisingapore/Qwen-SEA-LION-v4-32B-IT` | publicai | 0,25 / 0,50 | — | 0,001000 | ~100 |
| `aisingapore/Gemma-SEA-LION-v4-27B-IT` | publicai | 0,20 / 0,40 | — | 0,000800 | ~125 |

**Ghi chú chất lượng tiếng Việt `[ĐÃ KIỂM]` (đọc model card + leaderboard):**

- **SEA-LION v4** là dòng model làm riêng cho Đông Nam Á: model card `Gemma-SEA-LION-v4-27B-IT` ghi rõ
  hỗ trợ **tiếng Việt** (cùng 10 ngôn ngữ SEA khác), **context 128k**, có **"advanced function calling and
  structured outputs"**, đánh giá trên **SEA-HELM** (có nhánh tiếng Việt: Extractive QA VI, SEA-IFEval,
  SEA-MTBench) — nguồn: model card trên Hub + `leaderboard.sea-lion.ai`.
  Lưu ý: API Hub hiện khai báo `toolCalling: false` cho bản Gemma-SEA-LION-27B qua publicai
  (bản Qwen-SEA-LION-32B thì `true`) ⇒ **phải test thật**.
- `meta-llama/Llama-3.3-70B` qua novita chỉ có **context 12k** — không đủ cho fBuddy.
- Model **VL** (đọc ảnh) có sẵn: `Qwen/Qwen3-VL-*`, `zai-org/GLM-4.5V`; regex `VISION_MODEL_HINT` trong
  `server/src/providers/vision.js` đã khớp các tên này.

---

## 4. So sánh với các đường "free" khác — cùng ngày `[ĐÃ KIỂM]`

| Đường | Hạn mức thật | Model | Dùng cho production? |
|---|---|---|---|
| HF Inference Providers | **0,10 USD/tháng**/tài khoản (PRO 2 USD) | 200+ model mở, có tool calling | Không (quá nhỏ) |
| **OpenRouter model `:free`** | **20 req/phút**, **50 req/ngày**, 1.000/ngày nếu đã mua ≥ ~9 credit | **22 model `:free`**, gồm `deepseek/deepseek-v4-flash-0731:free` (1M ctx, tools), `google/gemma-4-31b-it:free`, `qwen/qwen3.8-27b:free`, `nvidia/nemotron-3-super-120b-a12b:free` | Có điều kiện |
| Groq trực tiếp | Quota free riêng theo model | Whisper large-v3-turbo + LLM | Có điều kiện |
| Gemini AI Studio | Free tier riêng | Gemini Flash | Có điều kiện |
| Featherless Chat 25 USD/tháng | "Unlimited" nhưng **cấm app/API traffic** | Hàng nghìn model | Không |

Danh sách provider phía sau HF (quét theo số model): featherless-ai 2.264 · novita 114 · deepinfra 112 ·
nscale 33 · zai-org 29 · fireworks-ai 25 · together 23 · baseten 21 · cohere 18 · scaleway 15 ·
ovhcloud 11 · publicai 10 · groq 6 · cerebras 2. Tài liệu HF còn liệt kê replicate, fal-ai, wavespeed,
hf-inference.

---

## 5. Toán tiền: HF rẻ hơn bao nhiêu so với model đang chạy

Số hiện tại của fBuddy (đọc code): `creditsPerToken = 0.06`, `vndPerCredit = 1`, `creditMargin = 1.3`,
`creditUsdVnd = 25500`, một lượt điển hình **~3.500 token**.

| Phương án | Chi phí model/lượt | 1.000 lượt | fBuddy trừ người dùng | Ghi chú |
|---|---|---|---|---|
| Đang chạy: `google/gemini-2.5-flash` (OpenRouter 0,30/2,50) | ~0,00215 USD ≈ **55đ** | ~2,15 USD (≈55.000đ) | 210 credit (giá phẳng) | Biên ~3,8× |
| HF `Qwen3-4B-Instruct-2507` | ~0,000045 USD ≈ **1,1đ** | ~0,045 USD (≈1.150đ) | **vẫn 210 credit** | Rẻ hơn ~98%, chất lượng tiếng Việt thấp hơn nhiều |
| HF `openai/gpt-oss-20b` | ~0,00016 USD ≈ **4đ** | ~0,16 USD | vẫn 210 credit | Cân bằng |
| HF `Qwen-SEA-LION-v4-32B-IT` | ~0,001 USD ≈ **26đ** | ~1,00 USD | vẫn 210 credit | Hợp tiếng Việt nhất trong nhóm HF |

**Điểm quan trọng về nghiệp vụ:** `costForModel` (`server/src/credits.js`) chỉ tính theo chi phí thật khi
model có trong bảng `model_pricing` (đồng bộ từ OpenRouter). Model HF **không có** trong bảng đó ⇒ tự động
rơi về **giá phẳng** `creditsPerToken` ⇒ **người dùng vẫn bị trừ y như cũ, phần tiết kiệm vào biên lợi nhuận**.
Muốn "rẻ thì bán rẻ" phải đổi chính sách credit, không chỉ đổi provider.

---

## 6. Tích hợp vào fBuddy — đụng vào đâu (phân tích, chưa sửa)

| Chỗ trong repo | Hiện tại | Việc cần cho HF |
|---|---|---|
| `server/src/providers/index.js` → `ADAPTERS` | `openai`, `openai-compatible`, `openrouter`, `glm` dùng adapter OpenAI | **Không cần sửa** nếu chỉ dùng kind `openai-compatible`; thêm `huggingface: openai` nếu muốn kind riêng |
| `PROVIDER_KINDS` (cùng file) | 7 kind có nhãn, gợi ý model, `keyHint` | Thêm mục `huggingface`: base URL `https://router.huggingface.co/v1`, gợi ý model ở §3, `keyHint` nhắc quyền token |
| `server/src/providers/openai.js` → `SUPPORTS_STREAM_USAGE` | Chỉ `openai`, `deepseek`, `groq`, `openrouter` gửi `stream_options.include_usage` | Adapter đã tự retry khi gateway trả 400 vì `stream_options`; chỉ thêm `huggingface` sau khi xác nhận HF trả usage |
| `server/src/agent.js` (mục meter lượt) | Gateway không trả `usage` ⇒ **tính sàn 1 credit** | Rủi ro mất doanh thu nếu HF không trả usage — **ca test đầu tiên** |
| `server/src/credits.js` → `costForModel` | Có giá ⇒ tính theo chi phí thật × margin | Muốn tính đúng cho model HF thì mở rộng `ops/refresh-model-pricing.mjs` đọc thêm `router.huggingface.co/v1/models` |
| `server/src/providers/vision.js` | Regex nhận `-vl-`, `qwen…vl`, `glm-4.5v` | Đã đủ cho `Qwen3-VL`/`GLM-4.5V` |
| `ops/configure-provider.mjs` | Tạo provider + đặt mặc định, key đọc từ file | Dùng lại ngay với `--kind openai-compatible --base-url https://router.huggingface.co/v1` |
| `ops/prune-models.mjs` | Lọc model gateway không còn phục vụ | Router HF trả 200+ model ⇒ nên lọc sẵn theo `supports_tools` + `context_length` |

**Đường ngắn nhất (0 dòng code):** Cài đặt → Nhà cung cấp AI → thêm provider kind *OpenAI-compatible khác*,
Base URL `https://router.huggingface.co/v1`, dán token HF, bấm **Kiểm tra**, chọn model
`openai/gpt-oss-120b:cheapest`, **Đặt mặc định** khi cần.

---

## 7. Rủi ro & tuân thủ

1. **Hạn mức theo tài khoản, không theo người dùng.** Cả app dùng chung 1 token HF ⇒ một người lạm dụng là
   hết quota; fBuddy phải tự chặn rate limit theo user.
2. **Không SLA.** Lỗi thực tế: `429` (hạn mức), `402`-class (hết credit), `5xx/503` (provider quá tải).
   Cần backoff + **không hiện lỗi thô** cho người dùng.
3. **Điều khoản.** HF ToS cho phép *"modify, suspend, or discontinue the Services … with or without notice"*;
   Content Policy §5 *"Platform Abuse, Security Violations and Spam"* cấm lạm dụng dịch vụ
   (`huggingface.co/terms-of-service`, `huggingface.co/content-policy`). Không có điều khoản **cho phép** rõ
   ràng việc lấy credit free/PRO của một tài khoản cá nhân để chạy traffic thương mại nhiều người dùng.
   Cách sạch nhất nếu dùng thật: **mua credit / billing theo tổ chức**.
4. **Quyền riêng tư (điểm cộng).** HF không lưu body/response, log ≤ 30 ngày — dễ giải trình hơn; nhưng
   provider downstream có chính sách riêng. Liên quan Nghị định 13/2023/NĐ-CP mà fBuddy đã nhắc trong
   content policy.
5. **Chất lượng không ổn định theo provider.** Cùng model id có thể do provider khác nhau phục vụ với
   quantization/context khác nhau ⇒ câu trả lời và giá khác nhau. Đường người dùng thấy nên **ghim provider**
   (`model:provider`) thay vì để `:fastest`.

---

## 8. Cách tự kiểm chứng lại

Máy Mac này **bị chặn `huggingface.co`** (timeout) nhưng `hf-mirror.com`, `api.github.com`, `openrouter.ai`
thì được. Ba đường đã dùng:

```bash
# 1) Tài liệu HF bản gốc markdown (luôn mới nhất) — qua GitHub API
curl -s -H "Accept: application/vnd.github.raw" \
  https://api.github.com/repos/huggingface/hub-docs/contents/docs/inference-providers/pricing.md

# 2) Trang tài liệu đã render (đối chiếu chéo) — qua mirror, rồi strip HTML thành text
curl -sL https://hf-mirror.com/docs/inference-providers/pricing

# 3) Danh sách model + giá + tool calling (nguồn số ở §3)
curl -s "https://hf-mirror.com/api/models?inference_provider=all&pipeline_tag=text-generation\
&limit=1000&expand[]=inferenceProviderMapping&sort=downloads&direction=-1"

# 4) Giá/limit OpenRouter (đối chiếu §4)
curl -s https://openrouter.ai/api/v1/models
curl -sL https://openrouter.ai/docs/api-reference/limits
```

---

## 9. Việc phải spike trước khi quyết `[CẦN SPIKE]`

| # | Câu hỏi | Cách test | Ảnh hưởng |
|---|---|---|---|
| 1 | Router HF có trả `usage` khi `stream:true`? | bật `stream_options.include_usage`, xem SSE cuối | Nếu không: mỗi lượt chỉ bị trừ 1 credit (mất doanh thu) |
| 2 | Model giá 0 có hạn mức/ngày thật? | gọi liên tục tới khi 429, ghi ngưỡng + thông điệp | Quyết định có dùng promo được không |
| 3 | Provider nào thực sự nhận `tools` cho model đã chọn? | 1 lượt có `tools` + `tool_choice` với 2–3 provider | Tool calling là điều kiện sống còn của fBuddy |
| 4 | Độ trễ first-token khi chat tiếng Việt | đo bằng nút Kiểm tra trong Cài đặt | Trải nghiệm |
| 5 | Chất lượng tiếng Việt so với `gemini-2.5-flash` | chạy bộ câu hỏi chuẩn hoá (mẫu: `ops/apps-explain-check.mjs`, `ops/credit-explain-check.mjs`) | Quyết định đổi model mặc định |

---

## 10. Kết luận & đề xuất

**Nên làm, theo thứ tự:**

1. **Đo trước, đổi sau.** Thêm provider HF bằng đường ngắn nhất (§6), chạy một bộ câu hỏi tiếng Việt chuẩn
   hoá trên `gemini-2.5-flash` (đang chạy), `gpt-oss-20b`, `Qwen3-4B`, `SEA-LION v4`. Có số rồi mới bàn đổi mặc định.
2. **Giảm tiền ngay mà không cần HF:** đổi model id sang model rẻ trên OpenRouter (§4). Đây là hành động
   cho lợi ích lớn nhất trên mỗi đồng công sức.
3. **HF như hàng dự phòng rẻ:** hiện `agent.js` **chưa có** cơ chế failover giữa các provider
   (chỉ có `vision-fallback.js` cho ảnh). Muốn "provider chính lỗi/429 → tự chuyển" thì phải thêm cơ chế đó —
   có giá trị cho **mọi** provider, không riêng HF.
4. **BYO-key (tuỳ chọn):** cho người dùng dán token HF của họ cho tính năng phụ — quota/điều khoản thuộc về
   tài khoản của họ, fBuddy không tốn gì.

**Không nên:**

- Đặt HF free credit làm **mặc định** cho người dùng trả tiền (0,10 USD/tháng hết trong vài giờ).
- Quảng cáo "fBuddy miễn phí nhờ model miễn phí" — chi phí model chỉ là một phần, quota và điều khoản mới
  là ràng buộc thật.
- Phụ thuộc vào danh sách model giá 0 (§2.1) vì là promo theo ngày.
