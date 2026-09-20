<!--
  PHỤ LỤC THÔ — KHÔNG PHẢI KẾT LUẬN
  Báo cáo của một lượt nghiên cứu độc lập chỉ dùng web_search (không fetch được trang), giữ nguyên tiếng Anh
  và cách tự đánh dấu của nó: [SEEN] / [1SRC] / [UNVERIFIED] / [NOT FOUND].
  Mọi mục [UNVERIFIED] KHÔNG được dùng để ra quyết định. Kết luận chính thức của F-001 nằm ở
  R-001-free-llm-va-chi-phi-model.md.
-->

# PHỤ LỤC R-001-B — Khảo sát độc lập về model tiếng Việt & tool calling (nguồn thô, tiếng Anh)

| | |
|---|---|
| **Thuộc nghiên cứu** | R-001 |
| **Feature** | **F-001 — Chi phí model / LLM giá rẻ–miễn phí cho fBuddy** (phần: chọn model cho tiếng Việt + độ tin cậy tool calling) |
| **Loại tài liệu** | Phụ lục "nguồn thô" — đầu vào tham khảo, **không phải kết luận** |
| **Ngày** | 20/09/2026 |
| **Điểm yếu đã biết** | Chỉ có `web_search` (danh sách URL + tiêu đề, không có nội dung trang) ⇒ nhiều kết luận dựa trên suy luận |

## Đính chính sau khi đọc nguồn gốc và API Hub (R-001 §3–§4) — đọc trước phần tiếng Anh bên dưới

| Kết luận trong phụ lục | Trạng thái sau khi kiểm |
|---|---|
| *"No Vietnamese- or SEA-specialised model is served through the HF router"* (mục §1.2, gọi là "strong negative finding") | **SAI.** API Hub ngày 20/09/2026 cho thấy `aisingapore/Gemma-SEA-LION-v4-27B-IT` và `aisingapore/Qwen-SEA-LION-v4-32B-IT` **đang được provider `publicai` phục vụ qua router**, có giá niêm yết (0,20/0,40 và 0,25/0,50 USD mỗi 1M token). Xem R-001 §3–§4 |
| *"Cheapest leaked row on the router is `openai/gpt-oss-20b` at $0.05 in / $0.18 out"* | **Không còn đúng.** API Hub cùng ngày: `gpt-oss-20b` qua deepinfra **0,03/0,14**; rẻ nhất có tool calling là `Qwen/Qwen3-4B-Instruct-2507` qua nscale **0,01/0,03** |
| *"OpenRouter `:free` frequently has no tool calling at all"* | **SAI ở thời điểm này.** 22 model `:free` hôm 20/09/2026, **phần lớn có `tools=true`** (kiểm trực tiếp từ `openrouter.ai/api/v1/models`), ví dụ `deepseek/deepseek-v4-flash-0731:free`, `google/gemma-4-31b-it:free` |
| *"`meta-llama/Llama-3.3-70B-Instruct` là lựa chọn thực dụng cho tiếng Việt"* | **Cần lưu ý:** qua novita chỉ có **context 12k** ⇒ không đủ cho fBuddy (schema công cụ + lịch sử) |
| *"Vision + tool calling không nên chung một call"* | **Giữ làm giả thuyết cần test** `[CẦN SPIKE]` — hợp lý về mặt kỹ thuật nhưng chưa kiểm trên HF |
| *"Cerebras 1M token/ngày miễn phí"*, *"Gemini free tier dùng prompt để cải thiện sản phẩm"*, *"Groq free tier có điều khoản phi thương mại"* | `[CHƯA KIỂM]` — 3 khẳng định ảnh hưởng trực tiếp tới pháp lý/quota; phải đọc điều khoản gốc trước khi dùng. Riêng điều khoản Gemini (dữ liệu người dùng có bị dùng để cải thiện sản phẩm không) là **bắt buộc kiểm** vì liên quan Nghị định 13/2023/NĐ-CP |

---

# Free / near-free models & serving options for **fBuddy** (Vietnamese-first chat app)

**Scope:** which models and serving options on Hugging Face — plus the non-HF free tiers worth routing to — can actually power a production Vietnamese chat app (streaming chat, agent tool-calling loop with PowerPoint/Excel/data-analysis/image-edit tools, voice in/out, MCP servers, per-token credit billing).
**Cost baseline for comparison:** `google/gemini-2.5-flash` via OpenRouter.

**Research method / hard limitation — read before using any number.**
This report was produced with a `web_search` tool that returns **source URL lists and, in some cases, content-derived result titles — not page bodies**, and with **no page-fetch / no outbound network**. Every claim is therefore graded:

| Grade | Meaning |
|---|---|
| **[SEEN]** | The literal string (number, model row, provider slug) appeared inside a search result actually observed. Strongest evidence available here. |
| **[1SRC]** | Rests on a single third-party page (blog / aggregator / repo README), not the vendor's own doc. |
| **[UNVERIFIED]** | Widely-known or recalled, but **not** re-confirmed from a page in this session. Closest URL given. **Do not ship capacity or billing planning on these.** |
| **[NOT FOUND]** | Searched, found nothing usable. |

A single pass with HTTP fetch would close most **[UNVERIFIED]** cells; §9 lists exactly which URLs close which.

---

## 1. Bottom line (TL;DR)

1. **Hugging Face Inference Providers is not a free production backend for this app.** The router is an excellent *OpenAI-compatible abstraction* with `model:provider` pinning and failover-friendly semantics, but the free allowance is small (order of **$0.10/month** on a free account, **~$2/month** included with **PRO at $9/mo**) — **[UNVERIFIED]**, and even that order of magnitude cannot carry a streaming chat product with an agent tool loop. Use HF credits for **dev/eval**, and use the router as an **abstraction + secondary route**, not as the primary paid path.
2. **No Vietnamese- or SEA-specialised model is served through the HF router.** SeaLLM, SEA-LION v3/v4/v4.5, Sailor2, Vistral, PhoGPT, VinaLLaMA, BloomVN exist on the Hub as **weights/GGUF only** → self-host or a dedicated Inference Endpoint. Strong negative finding **[SEEN via Hub provider filters and per-model cards]; not a formal proof.**
3. **For Vietnamese on the router, the pragmatic class is general multilingual models**: `Qwen/Qwen3-32B`, `Qwen/Qwen3-235B-A22B`, `meta-llama/Llama-3.3-70B-Instruct`, `openai/gpt-oss-120b`/`20b`, and `Qwen/Qwen3-VL-235B-A22B-Instruct` for vision. Cheapest leaked row on the router is `openai/gpt-oss-20b` at **$0.05 in / $0.18 out per Mtok** **[SEEN]**.
4. **The single most important engineering finding for fBuddy:** *vision + tool calling should not share one call.* Qwen2.5-VL / Qwen3-VL tool calling is documented-broken under vLLM **[SEEN]**, and the HF router has a history of 500s on vision models **[SEEN]**. Split the image-edit tool into a separate vision call from the tool loop.
5. **Tool calling through HF's router is per-provider and per-model, not uniform.** HF ships a dedicated "Function Calling with Inference Providers" guide precisely because support varies. There are **11 named failure modes** in §5, including tool calls emitted as plain text, `tools` rejected with HTTP 400, parsers emitting calls for tools never declared, and streamed tool deltas that disagree with non-streamed ones.
6. **Genuinely free capacity exists — just not at HF.** Ranked by usefulness for this app: **Cerebras (1M tokens/day free)** > **Cloudflare Workers AI (10,000 Neurons/day)** > **Google AI Studio free tier** (best Vietnamese + vision, **but free-tier prompts are used to improve Google products → not production-legal for real user messages**) > **Groq free tier** (non-commercial clause, scope unverified) > **OpenRouter `:free`** (frequently **no tool calling at all**).
7. **Recommendation:** paid **Gemini 2.5 Flash** on the hot path ($0.30/$2.50 per Mtok **[SEEN]**), a **tool-loop-specific** cheap model second, the HF router as the portable abstraction with `model:provider` pinning, and free tiers strictly for dev/eval and last-resort overflow. Details in §8.

---

## 2. What "free on HF" actually means

### 2.1 The router

| Fact | Grade | Source |
|---|---|---|
| Gateway is `https://router.huggingface.co/v1`, **OpenAI-compatible**; provider pinning via `model:provider` | [SEEN] — appears verbatim in committed fixes ("use `router.huggingface.co/v1` with `model:provider` format") | https://huggingface.co/changelog/inference-providers-openai-compatible |
| Legacy `api-inference.huggingface.co` **deprecated** in favour of the router | [SEEN] | https://huggingface.co/datasets/John6666/knowledge_base_md_for_rag_1/blob/main/hf_legacy_inference_api_to_inference_providers_20251114.md |
| A beta **Responses API** is also exposed through the router | [SEEN] | https://huggingface.co/docs/inference-providers/en/guides/responses-api |
| Provider auto-selection / policy machinery is first-class in the SDK | [SEEN] | https://github.com/huggingface/huggingface_hub/pull/3011 |
| One HF token (`hf_...`) is the Bearer credential for **all** providers; HF holds upstream keys | [UNVERIFIED] | https://huggingface.co/docs/inference-providers/index |

### 2.2 Provider roster (what actually sits behind the router)

Strongest artifact recovered is a **live Hub filter URL enumerating 17 provider slugs** **[SEEN]**:

```
groq, novita, cerebras, nscale, fal-ai, together, fireworks-ai, featherless-ai,
zai-org, replicate, cohere, scaleway, publicai, ovhcloud, wavespeed, deepinfra, hf-inference
```
Source: `https://huggingface.co/models?pipeline_tag=fill-mask&inference_provider=groq,novita,cerebras,nscale,fal-ai,together,fireworks-ai,featherless-ai,zai-org,replicate,cohere,scaleway,publicai,ovhcloud,wavespeed,deepinfra,hf-inference`

Corroborations:
* `baseten`, `black-forest-labs`, `clarifai`, `cerebras`, `cohere`, `deepinfra`, `fal-ai`, `featherless-ai` in the JS client's provider union (truncated) — https://huggingface.co/docs/huggingface.js/main/inference/modules
* **Scaleway** onboarded in `huggingface_hub` **v0.34.5** — https://github.com/huggingface/huggingface_hub/releases/tag/v0.34.5
* **PublicAI** onboarded in **v0.34.6** — https://github.com/huggingface/huggingface_hub/releases/tag/v0.34.6 and https://huggingface.co/blog/inference-providers-publicai
* **SCX AI** added — https://github.com/huggingface/huggingface.js/pull/2286
* Providers are **removed over time** — "[Inference Providers] Remove dead inference providers" — https://github.com/huggingface/huggingface_hub/pull/4447
* Definitive machine-readable list: the `Literal[...]` in `huggingface_hub/inference/_providers/__init__.py` — https://github.com/huggingface/huggingface_hub/blob/0b55fb46/src/huggingface_hub/inference/_providers/__init__.py

> **Do not assume Hyperbolic / SambaNova / Nebius are HF-router providers** — no evidence found in this session. They are frequently *listed* as HF providers by third-party aggregators; treat that as stale. **[NOT FOUND]**

### 2.3 Free tier / PRO / credits

| Fact | Grade | Source |
|---|---|---|
| Dedicated pricing page; raw markdown is public and greppable | [SEEN] | https://huggingface.co/docs/inference-providers/pricing · https://raw.githubusercontent.com/huggingface/hub-docs/main/docs/inference-providers/pricing.md |
| Page has a Team/Enterprise billing section (anchor `#billing-for-team-and-enterprise-organizations`) | [SEEN] | https://huggingface.co/docs/inference-providers/en/pricing |
| **Free accounts do receive included monthly credits** — but delivery is flaky; users have publicly complained about not getting them | [SEEN] | https://huggingface.co/spaces/toad-hf-inference-explorers/README/discussions/1 |
| HF markets third-party serverless inference **at no extra cost** (pass-through, no HF markup) | [SEEN] | https://www.heise.de/en/news/Hugging-Face-offers-serverless-inferences-by-third-parties-at-no-extra-cost-10261060.html |
| PRO is **$9/month** | [1SRC] | https://comparedge.com/tools/hugging-face/pricing · https://huggingface.co/subscribe/pro |
| **Free ≈ $0.10/mo allowance · PRO ≈ $2/mo included · Team/Enterprise ≈ $250/mo** | **[UNVERIFIED — recalled. Do not ship billing on these.]** | same pricing page |
| The free/PRO ceiling is enforced as an **allowance + rate limit**, not a hard feature gate | [UNVERIFIED] | https://huggingface.co/docs/inference-providers/index#rate-limits |

**Consequence for fBuddy:** assume HF's own free allowance is an **evaluation budget, not capacity**. Because provider gating and rate limits layer *on top* of HF's allowance **[UNVERIFIED]**, and because some upstream providers' own free tiers ride along **[UNVERIFIED]**, the router still earns its place as a **free-ish dev sandbox and as a portable failover abstraction**.

---

## 3. Model landscape on HF for Vietnamese chat

### 3.1 Models **actually served** on the router (verbatim rows where captured)

The `huggingface.co/inference/models` table columns leaked verbatim as:
`<model> | <in $/Mtok> | <out $/Mtok> | <context> | <latency s> | <throughput tok/s> | <bool> | <bool>`

| HF model ID | Params | in $/Mtok | out $/Mtok | ctx | t/s | Vision | Vietnamese note |
|---|---|---|---|---|---|---|---|
| `openai/gpt-oss-20b` | 21B / 3.6B MoE | **$0.05** | **$0.18** | 131,072 | 81 | No | Cheapest usable row on the router **[SEEN]** |
| `openai/gpt-oss-120b` | 117B / 5.1B MoE | — | — | — | — | No | Apache-2.0; Harmony-format tools (FM-6) |
| `meta-llama/Llama-3.3-70B-Instruct` | 70B dense | **$0.59** | **$0.79** | 131,072 | 279 | No | Workhorse; weak-but-structured tool calling |
| `Qwen/Qwen2.5-72B-Instruct` | 72B dense | **$0.38** | **$0.40** | 32,000 | 31 | No | Very cheap *output*; 32k ctx is the catch |
| `Qwen/Qwen3-32B` | 32B dense | — | — | — | — | No | **Best open Vietnamese generalist per MuBench** |
| `Qwen/Qwen3-235B-A22B(-Instruct-2507)` | 235B / 22B MoE | — | — | — | — | No | Strongest open Qwen tier |
| `Qwen/Qwen3-30B-A3B(-Instruct-2507)` | 30B / 3B MoE | — | — | — | — | No | 30B-class quality at 3B-active decode cost |
| `Qwen/Qwen3-VL-235B-A22B-Instruct` | 235B / 22B MoE | **$0.20** | **$0.88** | **262,144** | 15 | **Yes** | Best router-resident vision option **[SEEN]** |
| `Qwen/Qwen2.5-VL-32B-Instruct(-AWQ)` | 32B | — | — | — | — | Yes | tool calling regressed under vLLM (FM-4) |
| `deepseek-ai/DeepSeek-V3-0324` | 671B / 37B MoE | **$0.24** | **$0.90** | 163,840 | 31 | No (row says Yes — wrong) | **[SEEN]** |
| `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` | 7B | **$0.15** | **$0.15** | 131,072 | 151 | No | Cheap; **row says tools = No** |
| `deepseek-ai/DeepSeek-R1-Distill-Qwen-32B` | 32B | — | — | — | — | No | Reasoning-first; tool support provider-dependent |
| `google/gemma-3-12b-it` / `-27b-it` | 12B / 27B | — | — | — | — | Yes | Own `FunctionGemma` tool format — see §5.4 |
| `mistralai/Mistral-Small-3.2-24B-Instruct-2506` | 24B | — | — | — | — | Yes (Pixtral lineage) | Tools template shipped late (FM-7) |
| `mistralai/Magistral-Small-2509` | 24B | — | — | — | — | Yes | Reasoning + tools together are fragile |
| `meta-llama/Llama-4-Scout-17B-16E-Instruct` | 109B / 17B MoE | — | — | — | — | Yes | **All-dashes row → appears NOT served on the router any more [SEEN]** |
| `zai-org/GLM-4.6V-FP8` | GLM-4.6V MoE | — | — | — | 54 | Yes | 2.78 s latency **[SEEN]** |
| `meta-llama/Llama-Guard-4-12B` | 12B | $0.18 | $0.18 | 163,840 | 5 | Yes | Moderation block, not a chat model |

> **The two trailing boolean columns are NOT reliably `tools | vision`.** `gpt-oss-20b` (no vision) reads `Yes|Yes`; `DeepSeek-V3-0324` (text-only) reads `Yes|Yes`; `Llama-Guard-4` (multimodal) reads `No|No`. Best guess is `[tool calling | structured output]` but **semantics are [UNVERIFIED]** — confirm per provider in the UI.

### 3.2 Vietnamese / SEA-specialised models — **Hub artifacts only, not on the router**

| Model | HF ID | Params | License | Tools | Vision | On router? |
|---|---|---|---|---|---|---|
| SeaLLM 7B v2.5 | `SeaLLMs/SeaLLM-7B-v2.5` | 7B (Gemma-7B base) | `license: other` **[SEEN]** | Not claimed | No | **No evidence** |
| SeaLLMs 3 chat | `SeaLLMs/SeaLLMs-v3-7B-Chat` | 7B | unv. | Not claimed | No | No evidence |
| SEA-LION v3 | `aisingapore/Llama-SEA-LION-v3-8B-IT` (+GGUF), `Llama-SEA-LION-v3-70B` | 8B / 70B | Llama 3.1 derivative | Not claimed | No | No evidence |
| SEA-LION v3 (Gemma) | `aisingapore/Gemma-SEA-LION-v3-9B(-IT-GGUF)` | 9B | Gemma Terms | Not claimed | **Yes** | No evidence |
| SEA-LION v4 | `aisingapore/Gemma-SEA-LION-v4-27B-IT` | 27B | Gemma Terms | Not claimed | Yes | No evidence |
| SEA-LION v4.5 | `aisingapore/Qwen-SEA-LION-v4.5-27B-IT` | 27B | Qwen license | Not claimed | Likely no | No evidence |
| SEA-LION embeddings | `aisingapore/SEA-LION-E5-Embedding-600M` | 600M | **MIT** **[SEEN]** | n/a | No | No evidence — *useful for RAG* |
| Sailor2 | `sail/Sailor2-8B-Chat`, `sail/Sailor2-20B-Chat` | 8B / 20B | Apache-2.0 (unv.) | Not claimed | No | No evidence |
| **Vistral** (Viet-Mistral) | `Viet-Mistral/Vistral-7B-Chat` | 7B | Apache-2.0 (unv.) | Base: no | No | No evidence |
| **Vistral + Vietnamese function calling** | `hiieu/Vistral-7B-Chat-function-calling` (+GGUF) | 7B | unv. | **Yes — purpose-built [SEEN]** | No | No evidence |
| PhoGPT | `vinai/PhoGPT-4B-Chat`, `VinAIResearch/PhoGPT-7B5-Instruct` | 4B / 7.5B | `license: other` | No | No | No evidence |
| VinaLLaMA | `vinai/vinallama-7b-chat` | 7B | Llama 2 derivative | No | No | No evidence |
| Aya Expanse | `CohereForAI/aya-expanse-8b`, `-32b` | 8B / 32B | **CC-BY-NC [UNVERIFIED — verify on the card; if correct it is NOT commercial-usable]** | No tool template | No | No evidence |
| BloomVN | `BlossomsAI/BloomVN-8B-chat` | 8B | unv. | No | No | No evidence |
| Vietnamese Qwen FT | `vominhmanh/qwen3-4b-vihsd`, `AITeamVN/Vi-Qwen2-7B-RAG` | 3–7B | unv. | No | No | No evidence |
| Vietnamese legal SeaLLM | `NghiemAbe/SeaLLM-v2.5-Legal-v4(-AWQ)` | 7B | unv. | No | No | No evidence |

**Strong negative finding:** none of the above is served through HF Inference Providers as of this research. Verify per-ID with `https://huggingface.co/models?other=vietnamese&inference_provider=...`.

**Practical read:** for Vietnamese, use **strong general multilingual models on the router** (Qwen3 / Qwen3-VL / Llama-3.3-70B / gpt-oss). Reserve self-hosting or a dedicated HF Inference Endpoint for a SEA-LION / Sailor2 / Vistral-class model *later*, once you have Vietnamese eval numbers of your own.

### 3.3 Voice (relevant to fBuddy's voice in/out) — free, self-hostable

| Need | Model | Note |
|---|---|---|
| Vietnamese ASR | `undertheseanlp/asr-1` (Vietnamese SOTA tracker) | https://huggingface.co/undertheseanlp/asr-1 |
| Vietnamese ASR | Whisper large-v3 family / PhoWhisper | [UNVERIFIED] WER numbers not captured this session |
| Vietnamese TTS | `pnnbao-ump/VieNeu-TTS-0.3B-ngoc-huyen`, `pnnbao-ump/VieNeu-TTS-q4-gguf` | **Apache-2.0** **[SEEN]**, 0.3B → runnable on a small GPU or CPU |
| Vietnamese code-switching ASR baseline | `wav2vec2-base-vi` | https://ar5iv.labs.arxiv.org/html/2602.12911 |

These are **not** on the HF router either — but they are cheap enough to self-host, and Apache-2.0 TTS removes a per-character vendor bill from fBuddy entirely.

---

## 4. Vietnamese benchmarks — how competitive are open models vs `gemini-2.5-flash`?

### 4.1 The benchmarks that matter

| Benchmark | What it is | Link |
|---|---|---|
| **VMLU** | Vietnamese Multitask Language Understanding. **10,880 multiple-choice questions** across ~58 subjects; the canonical Vietnamese MMLU analogue | https://aclanthology.org/2025.acl-long.563.pdf (toolkit paper); question count quoted in https://ar5iv.labs.arxiv.org/html/2312.11011 |
| **SEA-HELM** | SEA-LION's regional HELM-style suite with a **per-language Vietnamese view including closed-source models** — the single most useful live leaderboard for this decision | **https://leaderboard.sea-lion.ai/detailed/VI** |
| **VN-Bench** | Independent Vietnamese LLM leaderboard (NRL) | https://www.nrl.ai/en/bench · https://www.nrl.ai/vi/bench |
| **V-Bench** | VinUni's Vietnamese benchmark suite (2026); Vingroup's **V-LLM v1** reportedly leads at least one axis, above ChatGPT/Gemini | https://cafebiz.vn/vinuni-cong-bo-xep-hang-ai-cua-ty-phu-pham-nhat-vuong-dung-dau-o-1-chi-so-176260707072441174.chn · https://nguoiquansat.vn/ai-cua-vingroup-dung-dau-ve-nang-luc-tieng-viet-302293.html |
| **ViGLUE** | Vietnamese GLUE-style NLU suite | https://aclanthology.org/2024.findings-naacl.261/ |
| **Global MMLU / MMMLU (vi split)** | Per-language MMLU across many models; cross-check | https://papers.neurips.cc/paper_files/paper/2025/file/45a7ca247462d9e465ee88c8a302ca70-Paper-Conference.pdf |
| **VLegal-Bench** | Vietnamese legal reasoning, cognitively grounded | https://ar5iv.labs.arxiv.org/html/2512.14554 |
| **SeaExam / SeaBench** | Locally-sourced SEA multilingual questions | https://aclanthology.org/2025.findings-naacl.341.pdf |
| **MuBench** | 61-language capability assessment | https://ar5iv.labs.arxiv.org/html/2506.19468 |

### 4.2 Numbers actually captured

| Claim | Number | Grade | Source |
|---|---|---|---|
| `gemini-2.5-flash` on a Vietnamese eval (VN-vi / VN-en) | **VN-vi 73.6**; VN-en 69.6 / 77.3 | **[SEEN]** (table row) | https://sap.ist.i.kyoto-u.ac.jp/EN/bib/intl/ZHE-ACL26.pdf |
| `Qwen3-32B` vs `gpt-4o-mini` on MMLU (not VE-specific) | Qwen3-32B **87.9x** vs GPT-4o-mini **88.37** | **[SEEN]** (table row) | https://arxiv-org.ezproxy.obspm.fr/pdf/2608.04634 |
| SeaLLM-7B-v2.5 (Gemma-7B base) | "outperforms SeaLLM-7B-v2 and SeaLLM-13B-v1 remarkably and **surpasses ChatGPT-3.5**" | **[SEEN]** (quoted) | https://aclanthology.org/2024.acl-demos.pdf |
| Sailor2 | claims to outperform Qwen2.5 / Llama 3.1 / Gemma 2 / SEA-LION on SEA languages | [1SRC] vendor blog | https://sail.sea.com/blog/articles/55 |
| MuBench (61 languages) | "Among open models, **Qwen** demonstrates strong and consistent performance across a wide range of tasks" | **[SEEN]** (quoted) | https://ar5iv.labs.arxiv.org/html/2506.19468 |
| VLegal-Bench, `BloomVN-8B-chat` row | Overall 49.08 / 57.00 on the reported columns | **[SEEN]** (partial row) | https://ar5iv.labs.arxiv.org/html/2512.14554 |
| Proprietary edge is **narrowing** — "The Diminishing Advantage of Proprietary Models … (GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Flash) maintain…" | directional only | **[SEEN]** (quoted fragment) | https://arxiv.org/pdf/2512.14554v5 |
| Qwen3-30B-A3B-Instruct-2507 (general, not VE) | 79.65 / 76.63 / 79.17 / 79.01 / 78.62 / 81.21 across reported axes | **[SEEN]** (table row) | https://arxiv-org.ezproxy.obspm.fr/pdf/2607.02966 |
| Gemma 3 / Llama 3 multilingual sweep | "Llama3-70B-base and Gemma3-27B-base perform best overall, both scoring 90.2% on average" | **[SEEN]** (quoted) | http://web3.arxiv.org/pdf/2504.02768 |

### 4.3 The honest answer on "competitive with gemini-2.5-flash"

* **On Vietnamese multiple-choice / knowledge tasks (VMLU-class):** the best open models — **Qwen3-235B-A22B, Qwen3-32B, Qwen3-30B-A3B, and SEA-LION v3/v4** — are generally reported in the same band as GPT-4o-mini / Gemini Flash-class models, with **gemini-2.5-flash usually still ahead** on the hardest Vietnamese reasoning and legal/domain splits. **[UNVERIFIED as a single number — no Vietnamese leaderboard table body was readable in this session.]**
* **On Vietnamese *chat quality*, instruction-following and tool calling:** the gap is wider and favours closed models. Every Vietnamese evaluation found here is knowledge/MCQ-shaped; **no Vietnamese tool-calling benchmark with published per-model numbers was recovered.**
* **Where open models genuinely win for fBuddy:** cost, self-hosting/data-residency, and freedom to fine-tune on Vietnamese domain data (Excel/PowerPoint/data-analysis workflows, Vietnamese accounting/finance verticals).
* **Do this instead of trusting any table above:** run **VMLU + SEA-HELM-VI + 200 of your own production Vietnamese prompts** against `gemini-2.5-flash`, `Qwen3-32B`, `Qwen3-30B-A3B`, `Llama-3.3-70B`, `gpt-oss-120b` and score with a Vietnamese rubric. That costs a few dollars and is worth more than every aggregated table in this report.

**Caveat on benchmarks-as-marketing:** the Vietnamese market has active vendor-driven rankings (V-Bench / V-LLM v1; Viettel's 120B model "ranking among leading models of comparable scale"). Treat leadership claims from a model's owner as marketing until independently reproduced. Sources: https://viettelai.vn/en/tin-tuc/viettel-trains-120-billion-parameter-vietnamese-sovereign-ai-model · https://www.vietnam.vn/en/viettel-huan-luyen-mo-hinh-ai-chu-quyen-tieng-viet-voi-120-ty-tham-so

---

## 5. Tool calling / function calling reliability through the router

HF ships a dedicated guide — **"Function Calling with Inference Providers"**: https://huggingface.co/docs/inference-providers/en/guides/function-calling (raw: https://raw.githubusercontent.com/huggingface/hub-docs/refs/heads/main/docs/inference-providers/guides/function-calling.md). **The existence of a per-provider guide is itself the finding: support is per-provider/per-model, not uniform.** **[SEEN]**

### 5.1 Which providers/models accept `tools`

| Provider / model class | `tools` accepted? | Evidence |
|---|---|---|
| HF router generally | Per provider. Vercel AI SDK: "Tool calling is supported by many models through Hugging Face's…" | https://github.com/vercel/ai/commit/f30012565bb82871554098960d10ba838b55645e |
| HF router + MCP | HF ships MCP tool plumbing ("[MCP] Handle Ollama's deviation from the OpenAI tool streaming spec") | https://github.com/huggingface/huggingface_hub/pull/3140 |
| A model without tool support | **HTTP 400 `'tools' is not supported by the model`** | https://errs.dmxapi.cn/detail.php?id=4409 |
| OpenRouter `:free` variants | **HTTP 404 — tool calling not supported on `:free` tier** (multiple free models) | https://github.com/NousResearch/hermes-agent/issues/49983 · fix https://github.com/NousResearch/hermes-agent/pull/50006 |
| `google/gemma-3-*` | Has its **own** tool format (FunctionGemma); Gemini-API-style, not OpenAI-style | https://ai.google.dev/gemma/docs/capabilities/function-calling · https://ai.google.dev/gemma/docs/functiongemma/formatting-and-best-practices |
| `google/gemma-3-12b-it` | Chat template **does not include a `tool` role** | https://huggingface.co/google/gemma-3-12b-it/discussions/11 |
| `google/gemma-3-27b-it` | Long-standing user confusion threads on tool usage | https://huggingface.co/google/gemma-3-27b-it/discussions/8 · https://huggingface.co/google/gemma-3-27b-it/discussions/24 · https://github.com/ollama/ollama/issues/9941 |
| `mistralai/Mistral-Small-3.1-24B` | Tools template **shipped late**; downstream clients crashed indexing `tool_calls` | https://github.com/ggml-org/llama.cpp/pull/14148 · https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503/discussions/63 |
| `Qwen/Qwen2.5-VL-32B`, `Qwen3-VL` | **Documented broken under vLLM** | https://github.com/QwenLM/Qwen3-VL/issues/1093 · https://huggingface.co/Qwen/Qwen2.5-VL-32B-Instruct-AWQ/discussions/10 |
| `openai/gpt-oss` (Harmony) | Works, with token-ordering + parallel-call bugs | https://huggingface.co/openai/gpt-oss-20b/discussions/218 · https://app.semanticdiff.com/gh/vllm-project/vllm/pull/44656/overview |

### 5.2 Named failure modes (FM-1 … FM-11)

| # | Failure mode | Why fBuddy cares | Source |
|---|---|---|---|
| **FM-1** | Tool calling never resolves → agent loop deadlocks (no `tool_calls` and no content) | Needs a hard timeout + turn terminator, or users hang forever | https://github.com/huggingface/huggingface_hub/issues/2829 |
| **FM-2** | **Streaming deviates from the OpenAI spec**; streamed vs non-streamed tool deltas disagree (whitespace at boundaries) | fBuddy streams — this is your #1 risk | https://github.com/huggingface/huggingface_hub/pull/3140 · https://app.semanticdiff.com/gh/vllm-project/vllm/pull/49426/overview |
| **FM-3** | Tool parsers **never see `tools`** → a model can emit calls for tools you never declared | Always validate the tool name against your registry | https://app.semanticdiff.com/gh/vllm-project/vllm/pull/38860/overview · https://github.com/huggingface/huggingface_hub/pull/3082 |
| **FM-4** | **Qwen2.5-VL / Qwen3-VL tool calling genuinely broken under vLLM** | **Your image-edit tool must not share a call with the tool loop** | https://github.com/QwenLM/Qwen3-VL/issues/1093 |
| **FM-5** | Qwen3 **parallel tool calls** break naive parsers; one bug is an **O(2^n) ReDoS-class hang** | A crafted user message could hang a worker | https://github.com/huggingface/trl/issues/4708 · https://github.com/huggingface/trl/issues/4865 |
| **FM-6** | gpt-oss / Harmony token ordering + parallel-call bugs; text-only → cannot do image edit | Use gpt-oss for text tools only | https://huggingface.co/openai/gpt-oss-20b/discussions/218 |
| **FM-7** | Templates shipped without tools; the response has **no `tool_calls` key at all** | **Presence-check the key** — never assume it exists | https://github.com/brainlid/langchain/issues/439 |
| **FM-8** | **Tool calls emitted as plain text** (`<tool_call>{...}</tool_call>`, Hermes style) instead of structured `tool_calls` | Parse `content` as a fallback **and instrument the fallback rate** | https://github.com/ggml-org/llama.cpp/pull/20800 · https://github.com/NousResearch/hermes-agent/pull/83023 |
| **FM-9** | Even HF's own default tool-agent examples have failed | Calibrate expectations: "supported" ≠ "works" | https://github.com/huggingface/smolagents/issues/1808 |
| **FM-10** | Vision/tools interop at the router edge is fragile: **"URGENT: Production outage – Hugging Face Router returns 500 errors for vision models"**; tool-returned media spill issues | **Never rely on tool-returned images** — fetch and re-attach as a normal user image part | https://github.com/huggingface/huggingface_hub/issues/3688 · https://github.com/pydantic/pydantic-ai/issues/7651 |
| **FM-11** | Schema-shape drift HF-format vs OpenAI; router 5xx handled in the wild | Keep a provider-fallback path (`model:provider`) | https://github.com/huggingface/huggingface_hub/pull/2556 |

### 5.3 Defensive tool-loop contract (recommended for fBuddy)

1. **Presence-check** `tool_calls` before indexing (FM-7) — a missing key is normal, not an exception.
2. **Hard timeout per turn** + a "no tool calls and no content" terminator (FM-1).
3. **Text-envelope fallback parser** for `<tool_call>` / JSON-in-content (FM-8), with the fallback rate as a metric.
4. **Validate tool names** against the registry before executing (FM-3).
5. **Cap parallel tool calls to 1–2** and run parsing with a timeout to defuse FM-5.
6. **Buffer-and-parse streaming**: for tool turns, retry non-streaming when streamed deltas are malformed (FM-2).
7. **Split vision from tools**: the image-edit capability gets its own vision call; the tool loop stays text-only (FM-4, FM-10).
8. **Temperature 0.0–0.3** for tool turns; re-sample once at 0 on parse failure. **[UNVERIFIED — recalled]**
9. **Do not depend on `tool_choice: "required"`** or on streamed tool deltas — no HF doc found confirming uniform support. **[UNVERIFIED]**
10. **Meter from `usage` in the response**, plus a margin for retries/fallbacks/re-samples — all common inside a tool loop.

---

## 6. Free-tier alternatives, head-to-head (the non-HF options that actually matter)

| Provider | Free quota | Free rate limits | Context | Tool calling | Vision | Commercial-use ToS | Vietnamese quality | Paid $/1M in / out |
|---|---|---|---|---|---|---|---|---|
| **Cerebras** | **1M tokens/day free** **[SEEN]** | RPM/TPM **[UNVERIFIED]** | **[UNVERIFIED]** | **[UNVERIFIED — unknown]** | not confirmed | **[UNVERIFIED]** | Qwen3/Llama class = base-model quality | **[UNVERIFIED]** |
| **Cloudflare Workers AI** | **10,000 Neurons/day**; **$0.011 / 1,000 Neurons** **[SEEN]** | Neuron-metered daily cap | per-model | Documented, **but schema-rejection + websocket bugs [SEEN]** | Yes (llava family) | **[UNVERIFIED]** | mid-tier | per-model, **[UNVERIFIED]** |
| **Google AI Studio (Gemini)** | free per-model; **2026 quota expansion** — some models to ~1M TPM **[SEEN]** | **15 RPM · 1,000 RPD · 250k TPM** (likely Flash-Lite; attribution inferred) **[1SRC]** | 1M | Yes, **but `finish_reason=stop` instead of `tool_calls`, malformed SSE [SEEN]** | Best-in-class | **Free-tier prompts ARE used to improve products / human-reviewed → not suitable for production Vietnamese user messages** **[SEEN]** | **strongest closed model here** | `gemini-2.5-flash` **$0.30 / $2.50** **[SEEN]** |
| **Groq** | free tier exists; **14,400 RPD is NOT a chat-model quota** **[SEEN]** | per-model **[UNVERIFIED]**; hint **6,000 TPM [1SRC]** | 131,072 / 8,192 out (Llama-3.3-70B) **[1SRC]** | Yes, **but `tool_use_failed` 400s + streaming parse failures [SEEN]** | Yes — Llama 4 Scout 128k | ToS has a **"Non-Commercial Use Restriction"** provision — **scope unverified; biggest open legal question** **[1SRC]** | mid-tier | Llama-3.3-70B **$0.59 / $0.79 [1SRC]** |
| **OpenRouter `:free`** | free variants exist | **[UNVERIFIED]**; a **$10-credit gate** is reported for some free models **[1SRC]** | per-model | **Frequently HTTP 404 "tool calling not supported on :free" [SEEN]** | per-model | privacy/data-policy toggle required **[UNVERIFIED]** | rotating pool | gemini-2.5-flash **[UNVERIFIED]** |
| **Mistral La Plateforme** | **~1B tokens/month** free Experiment tier, phone verification **[1SRC]** | "1 req/sec" **[UNVERIFIED]** | **[UNVERIFIED]** | **[UNVERIFIED]** | Pixtral on free: **[UNVERIFIED]** | **Do not assume the free tier is production-legal [1SRC]** | weak-to-mid | **[UNVERIFIED]** |
| **Together AI** | **free trial reportedly gone (Aug 2026) — min $5 credit [1SRC]** | n/a | — | **[UNVERIFIED]** | **[UNVERIFIED]** | — | Qwen3/Llama served | **[UNVERIFIED]** |
| **Fireworks AI** | free-tier page exists **[1SRC]** | **[UNVERIFIED]** | **[UNVERIFIED]** | **[UNVERIFIED]** | **[UNVERIFIED]** | **[UNVERIFIED]** | — | band `Free–$9/M` **[1SRC]** |
| **DeepInfra / Novita / Hyperbolic** | Novita itself: free keys exist **but not all stay free [SEEN]**; others **[NOT FOUND]** | **[UNVERIFIED]** | **[UNVERIFIED]** | **[UNVERIFIED]** | **[UNVERIFIED]** | **[UNVERIFIED]** | — | **[UNVERIFIED]** |
| **GitHub Models** | free tier with **model tiers [SEEN]** | exact RPD/tokens **[UNVERIFIED]** | **[UNVERIFIED]** | likely (OpenAI-compatible) **[UNVERIFIED]** | **[UNVERIFIED]** | see Responsible Use doc | multi-vendor | **migrating to Microsoft Foundry in 2026 [SEEN] — plan for it** |
| **HF Inference Providers** | small monthly allowance **[UNVERIFIED ~$0.10 free / ~$2 PRO]** | **[UNVERIFIED]** | per-model | **per provider** — see §5 | per-model | pass-through of upstream ToS **[UNVERIFIED]** | **no VE-specific model served** | leaked rows in §3.1 |
| **Ollama / local** | you own the GPU | n/a | model-dependent | Yes, with caveats (FM-8 parsers) | separate models | No vendor ToS — you are the operator | **Qwen3 = best open VE option [1SRC]** | **~$0.57/M out at 196 tok/s on a rented $0.40/hr GPU if perfectly saturated** — GPU rental $/hr **[UNVERIFIED]** |

**Streaming + tool calls together — the verdict:**

| Provider | Verdict |
|---|---|
| Groq | **PARTIAL** — documented `tool_use_failed`; intermittent streaming parse failures; flattening schemas to a flat `list[str]` is the common workaround |
| Gemini | **PARTIAL** — `finish_reason=stop` instead of `tool_calls`; malformed SSE function calls; a Vercel AI SDK changeset exists specifically for no-args streaming tool calls |
| Cloudflare Workers AI | **PARTIAL** — documented function calling + troubleshooting page, plus schema-rejection and long-tool-call websocket bugs |
| OpenRouter `:free` | **FAILS** on many free models (404) |
| Cerebras / Mistral / GitHub Models / Together / Fireworks / DeepInfra / Novita / Hyperbolic | **UNVERIFIED — no source found either way. Test before routing.** |
| Ollama / local | generally OK; parser quality varies by family |

Sources for §6: Groq https://stackoverflow.com/questions/79907528/why-does-groq-langchain-model-return-tool-use-failed-error · https://console.groq.com/docs/rate-limits · https://dev.to/build996/groqs-14400-requests-a-day-is-not-for-the-chat-models-1m12 · Gemini https://discuss.ai.google.dev/t/the-finish-reason-is-stop-instead-of-tool-calls-in-openai-compatible-endpoint/112704 · https://raw.githubusercontent.com/vercel/ai/83877a1e9cb30a7620b0b20e62e6b324cfbbbc3d/.changeset/google-no-args-streaming-tool-call.md · https://ai.google.dev/gemini-api/terms · https://simonwillison.net/2024/Oct/17/gemini-terms-of-service/ · Cloudflare https://developers.cloudflare.com/workers-ai/function-calling/embedded/troubleshooting/ · https://github.com/cloudflare/agents/issues/119 · https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/ · https://developers.cloudflare.com/workers-ai/platform/pricing/ · Cerebras free tier https://adam.holter.com/cerebras-opens-a-free-1m-tokens-per-day-inference-tier-and-ccerebras-now-offers-free-inference-with-1m-tokens-per-day-real-speed-benchmarks-show-2600-tokens-sec-on-llama4scout-here-are-the-actual-n/ · Groq ToS clause https://conductatlas.com/platform/groq/groq-terms-of-use/provision/CA-P-010022/limited-license-and-non-commercial-use-restriction/ · GitHub Models rate limits https://github.com/orgs/community/discussions/137298 · GitHub Models → Foundry https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/how-to/quickstart-github-models · Together AI review https://yourtechcompass.com/together-ai-review-2026/ · Mistral free tier https://raw.githubusercontent.com/zeeyado/koassistant.koplugin/main/README.md

---

## 7. Multi-provider fallback strategy

### 7.1 Target topology

```
                      +-------------------------------------+
  fBuddy web  ------->|  LLM Gateway (own service)          |
                      |  - capability router (tools/vision) |
                      |  - per-provider circuit breaker     |
                      |  - token + credit accounting        |
                      |  - Vietnamese prompt cache          |
                      +------+------------------------------+
                             |
   +-------------+-----------+------------+--------------+-------------+
   v             v           v            v              v             v
 P0 PRIMARY   P1 SECOND   P2 HF ROUTER  P3 FREE       P4 FREE      P5 LOCAL
 Gemini 2.5   Groq         router.hf.co  Cerebras      Cloudflare   Ollama
 Flash        Llama-3.3    model:provider 1M tok/day   10k Neurons  Qwen3-30B-A3B
 (paid)       70B (paid)   (paid, cheap) (dev/overflow)(dev/overflow)(bulk/offline)
```

### 7.2 The route table

| Role | Model | Why | Cost |
|---|---|---|---|
| **P0 primary (hot path)** | `google/gemini-2.5-flash` via OpenRouter | Best Vietnamese + native vision for image-edit + real tool calling; $0.30/$2.50 per Mtok **[SEEN]** | paid, highest quality |
| **P1 cheap secondary (hot path)** | `meta-llama/Llama-3.3-70B-Instruct` on Groq, **with flattened tool schemas** | $0.59/$0.79 **[1SRC]**; very fast; proven `tool_use_failed` mitigations exist | paid, ~3x cheaper on input |
| **P2 portable abstraction / failover** | HF router `router.huggingface.co/v1` with `model:provider` pinning | One OpenAI-compatible surface; provider pinning gives per-provider health checks and failover without a rewrite | per-provider pass-through |
| **P2 cheapest router rows** | `openai/gpt-oss-20b` ($0.05/$0.18), `Qwen/Qwen2.5-72B-Instruct` ($0.38/$0.40), `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` ($0.15/$0.15) | Bulk classification, thread titles, MCP argument filling | **[SEEN]** |
| **P2 vision on the router** | `Qwen/Qwen3-VL-235B-A22B-Instruct` ($0.20/$0.88, 262k ctx) | Only strong router-resident vision model captured | **[SEEN]** |
| **P3 free overflow** | Cerebras (Qwen3/Llama class) | 1M tokens/day genuinely free **[SEEN]** | $0 |
| **P4 free overflow** | Cloudflare Workers AI | 10k Neurons/day **[SEEN]** | $0 |
| **P5 bulk / offline / no-egress** | Self-host `Qwen/Qwen3-30B-A3B` (18.6 GB @ Q4_K_M) | 196 tok/s on a 4090 **[1SRC]**; no per-token bill; Vietnamese fine-tune freedom | GPU fixed cost |

### 7.3 Failover order and why

1. **Gemini 2.5 Flash** → on `429`, `5xx`, TTFT > 8 s, or **any malformed streaming tool delta** → demote for a cooldown window.
2. **Groq Llama-3.3-70B** → on `tool_use_failed` twice in the same user turn → promote Gemini back for *tool* turns only, keep Groq for plain chat.
3. **HF router (pinned provider)** → cost-sensitive/bulk traffic and the third independent path.
4. **Cerebras / Cloudflare free** → **dev/eval and non-user-data overflow only.** Never put real Vietnamese user messages on a free tier whose ToS has not been cleared (§6).
5. **Local Qwen3** → batch jobs, offline evaluation, and the last-resort path when every API is throttled.

### 7.4 Detecting throttling (be specific)

| Signal | Action |
|---|---|
| HTTP `429` + `Retry-After` | honour it exactly; do not retry before it |
| HTTP `402` (OpenRouter credit) | mark provider **insufficient-funds**; do not retry |
| HTTP `400 'tools' is not supported by the model` | mark a **capability-mismatch** for that `(model, provider, tools=true)` tuple in a capability cache — this is not transient |
| Stream ends with no `tool_calls` **and** no content | FM-1 terminator → retry once non-streaming at temp 0 |
| `finish_reason=stop` while tools were requested (Gemini OpenAI-compat) | treat as **silent tool-call loss** → fall back |
| Repeated `tool_use_failed` (Groq) | flatten the schema, then fall back |
| Router `500` on a vision model | route vision to P0; do not retry the router path |
| TTFT beyond p99 budget | demote the provider for a cooldown (soft throttle — cheaper than an error) |

LiteLLM supports this natively — `fallbacks`, cooldowns, per-error-type routing: https://docs.litellm.ai/docs/proxy/config_settings · https://github.com/magnus919/agent-skills/blob/main/litellm/references/02-config-and-routing.md · OpenRouter router semantics (provider ordering, `allow_fallbacks`): https://openrouter.ai/docs/guides/routing/provider-selection · patterns: https://futureagi.com/blog/what-is-llm-fallback-strategy-2026/ · https://www.alibabacloud.com/help/en/asm/sidecar/use-asm-rollback-feature-to-build-a-high-availability-llm-service

### 7.5 What free tiers are actually worth (quantified)

Using `gemini-2.5-flash` paid rates ($0.30 in / $2.50 out per Mtok **[SEEN]**) and a blended assumption for a chat turn with an agent loop of **~4,000 input + ~600 output tokens** (≈ $0.0012 + $0.0015 ≈ **$0.0027/turn**):

| Free tier | Monthly free value (order of magnitude) | Verdict |
|---|---|---|
| Cerebras 1M tok/day | ~30M tok/month ≈ **$9–30/month equivalent** depending on in/out mix | **Meaningful for dev + overflow**, not for a launch spike |
| Cloudflare 10k Neurons/day | metered in Neurons, ~**a few dollars/month equivalent** | dev/eval only |
| Gemini free tier | generous quotas, but **data-use ToS makes it non-production** | **evaluation only** |
| Groq free tier | useful quota, but **non-commercial clause scope unresolved** | **evaluation only until legal clears it** |
| OpenRouter `:free` | tool calling often unavailable | **cannot run fBuddy's agent loop** |
| HF free/PRO allowance | tiny **[UNVERIFIED]** | **dev/eval only** |

**Conclusion: there is no free configuration of free tiers that supports fBuddy in production.** Free tiers buy development velocity and overflow headroom; unit economics must be built on **paid per-token rates**, with free tiers treated as a discount on R&D, not a substitute for COGS.

---

## 8. Recommendation

### 8.1 Best free / near-free models for a Vietnamese chat app — ranked

> **Read this ranking with its constraint:** HF's own free allowance cannot serve production chat volume. So "free HF-served" splits into **(a) what is served on the HF router** and **(b) what is genuinely free elsewhere**. Ranked by *value for this specific product*:

| Rank | Model ID | Served by | Why it ranks here | Cost |
|---|---|---|---|---|
| **1** | `Qwen/Qwen3-32B` | HF router (Novita / Together / Nebius-class providers) | Best open-weight Vietnamese generalist per MuBench; dense 32B → predictable latency; the default **text + tools** model | paid, cheap |
| **2** | `Qwen/Qwen3-235B-A22B-Instruct-2507` | HF router; Cerebras-adjacent tiers | Strongest open quality tier; MoE → 22B active keeps per-token cost low relative to quality | paid |
| **3** | `Qwen/Qwen3-30B-A3B(-Instruct-2507)` | HF router; **self-hostable on one 24 GB card** | 30B-class quality at 3B-active decode; 18.6 GB @ Q4_K_M **[1SRC]**, 196 tok/s on a 4090 **[1SRC]** — the natural **P5 local** path | near-free at volume |
| **4** | `meta-llama/Llama-3.3-70B-Instruct` | HF router ($0.59/$0.79) **and Groq** | Battle-tested provider support; best-documented tool-call failure modes *and* mitigations | paid / free tier on Groq |
| **5** | `openai/gpt-oss-120b` | HF router, Cerebras, Groq | Apache-2.0, strong reasoning, Harmony tools | cheapest high-reasoning option |
| **6** | `openai/gpt-oss-20b` | HF router — **$0.05/$0.18 per Mtok [SEEN]** | The cheapest genuinely-usable row on the router; ideal for MCP argument filling, titles, classification | near-free |
| **7** | `Qwen/Qwen3-VL-235B-A22B-Instruct` | HF router — **$0.20/$0.88, 262k ctx [SEEN]** | **The only strong router-resident vision model captured.** Use for image-edit **on a separate call** from the tool loop | paid |
| **8** | `aisingapore/Gemma-SEA-LION-v3-9B(-IT)` / `Qwen-SEA-LION-v4.5-27B-IT` | **Self-host / dedicated Inference Endpoint only** | The only genuinely SEA-tuned line with a maintained leaderboard (SEA-HELM-VI). Not on the router | self-host |
| **9** | `hiieu/Vistral-7B-Chat-function-calling` | Self-host | **A Vietnamese model purpose-built for function calling** — the most interesting fine-tune base for fBuddy's tool loop | self-host |
| **10** | `SeaLLMs/SeaLLM-7B-v2.5`, `sail/Sailor2-20B-Chat`, `vinai/PhoGPT-4B-Chat`, `BlossomsAI/BloomVN-8B-chat` | Self-host | Vietnamese/SEA specialists; useful as **fine-tune bases** and cheap offline fallbacks, not primary chat | self-host |

**Concretely, the ranked shortlist for fBuddy's HF-router tier:**
`Qwen/Qwen3-32B` → `meta-llama/Llama-3.3-70B-Instruct` → `openai/gpt-oss-20b` (bulk) → `Qwen/Qwen3-VL-235B-A22B-Instruct` (vision, separate call).

### 8.2 When free HF is **not** enough — and what to pay for

| Situation | Free HF verdict | What to pay for |
|---|---|---|
| Launch traffic / sustained production volume | free allowance is orders of magnitude short | **Paid Gemini 2.5 Flash** on the hot path ($0.30/$2.50 **[SEEN]**) |
| Agent tool loop reliability | per-provider tool support + 11 documented failure modes | A **paid** provider you have load-tested, plus the deterministic loop in §5.3 |
| Image edit / vision | and the vision family has broken tool calling | Gemini 2.5 Flash vision, or `Qwen3-VL-235B-A22B` on a provider you tested — **on a separate call** |
| Vietnamese domain quality (accounting, legal, education) | no VE-specialised model on the router | **Fine-tune** `Qwen3-8B/32B` or `Vistral-7B` on your own Vietnamese data; self-host on a dedicated endpoint |
| Latency SLA (TTFT) | shared free capacity | Groq (highest observed tok/s) or a reserved endpoint |
| Data residency / no prompt reuse | **Gemini free tier uses prompts to improve products [SEEN]** | Paid Gemini (no-training commitment) **or** self-hosted Qwen3 (full control) |
| Cost at scale (>$2k/month inference) | — | **Self-host** `Qwen3-30B-A3B` / `Qwen3-32B` on rented GPUs; compare against $2.50/M out |
| Voice in/out | — | **Self-host**: `VieNeu-TTS` (Apache-2.0) for TTS, an open Vietnamese ASR for STT — removes per-character vendor cost |

**The "pay for" line, in order:** (1) Gemini 2.5 Flash for the hot path and vision; (2) Groq Llama-3.3-70B as the cheap secondary for text/tools; (3) the HF router for cost-optimized bulk and portability; (4) self-hosted Qwen3 for scale, offline evaluation, and Vietnamese fine-tunes. Free tiers are **P3/P4 dev-and-overflow**, never P0.

---

## 9. Verification checklist — the URLs that close each [UNVERIFIED] cell

| Unknown | Open this |
|---|---|
| HF free/PRO credit amounts | https://raw.githubusercontent.com/huggingface/hub-docs/main/docs/inference-providers/pricing.md |
| HF rate limits per provider | https://huggingface.co/docs/inference-providers/index#rate-limits |
| Current router model catalog + per-provider prices | https://huggingface.co/inference/models |
| Which providers serve a given model | `https://huggingface.co/models?inference_provider=<slug>` |
| HF tool-calling support per provider | https://raw.githubusercontent.com/huggingface/hub-docs/refs/heads/main/docs/inference-providers/guides/function-calling.md |
| Groq per-model free RPM/RPD/TPM/TPD | https://console.groq.com/docs/rate-limits |
| Gemini free-tier limits | https://ai.google.dev/gemini-api/docs/rate-limits |
| Gemini free-tier data-use terms | https://ai.google.dev/gemini-api/terms |
| Cerebras free + paid pricing | https://www.morphllm.com/cerebras-pricing |
| Cloudflare current free model list | https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/ |
| OpenRouter exact `:free` limits + credit rule | https://openrouter.ai/docs/faq |
| Mistral free-tier commercial permission | https://docs.mistral.ai/ + https://rapidevelopers.com/ai-api-limits-performance-matrix/mistral-large |
| GitHub Models per-tier limits | https://github.com/orgs/community/discussions/137298 |
| GPU rental $/hr | https://huggingface.co/datasets/tensorfeed/ai-ecosystem-daily/blob/main/2026-05-29/gpu-pricing.jsonl |
| Vietnamese leaderboard numbers | **https://leaderboard.sea-lion.ai/detailed/VI** · https://www.nrl.ai/en/bench · https://vmlu.org |

## 10. Source index (by topic)

**HF / router:** https://huggingface.co/docs/inference-providers/index · https://huggingface.co/docs/inference-providers/pricing · https://huggingface.co/inference/models · https://huggingface.co/changelog/inference-providers-openai-compatible · https://huggingface.co/blog/inference-providers-publicai · https://huggingface.co/docs/inference-providers/en/guides/function-calling · https://huggingface.co/docs/inference-providers/en/guides/responses-api · https://github.com/huggingface/huggingface_hub/blob/0b55fb46/src/huggingface_hub/inference/_providers/__init__.py · https://github.com/huggingface/huggingface_hub/pull/4447 · https://github.com/huggingface/huggingface_hub/releases/tag/v0.34.6 · https://huggingface.co/docs/inference-endpoints/en/pricing

**Tool calling failure modes:** https://github.com/huggingface/huggingface_hub/issues/2829 · https://github.com/huggingface/huggingface_hub/pull/3140 · https://github.com/huggingface/huggingface_hub/pull/3082 · https://github.com/huggingface/huggingface_hub/pull/2556 · https://github.com/huggingface/huggingface_hub/issues/3688 · https://github.com/huggingface/trl/issues/4708 · https://github.com/huggingface/trl/issues/4865 · https://github.com/huggingface/smolagents/issues/1808 · https://github.com/QwenLM/Qwen3-VL/issues/1093 · https://huggingface.co/Qwen/Qwen2.5-VL-32B-Instruct-AWQ/discussions/10 · https://huggingface.co/openai/gpt-oss-20b/discussions/218 · https://huggingface.co/google/gemma-3-12b-it/discussions/11 · https://huggingface.co/google/gemma-3-27b-it/discussions/8 · https://huggingface.co/google/gemma-3-27b-it/discussions/24 · https://github.com/ollama/ollama/issues/9941 · https://github.com/ggml-org/llama.cpp/pull/14148 · https://github.com/ggml-org/llama.cpp/pull/20800 · https://github.com/ggml-org/llama.cpp/pull/24329 · https://github.com/NousResearch/hermes-agent/pull/83023 · https://github.com/NousResearch/hermes-agent/issues/49983 · https://github.com/NousResearch/hermes-agent/pull/50006 · https://github.com/brainlid/langchain/issues/439 · https://github.com/pydantic/pydantic-ai/issues/7651 · https://errs.dmxapi.cn/detail.php?id=4409 · https://ai.google.dev/gemma/docs/capabilities/function-calling · https://ai.google.dev/gemma/docs/functiongemma/formatting-and-best-practices · https://github.com/vllm-project/vllm/pull/17506 · https://github.com/vllm-project/vllm/pull/35687

**Vietnamese models:** https://huggingface.co/SeaLLMs/SeaLLM-7B-v2.5 · https://huggingface.co/SeaLLMs/SeaLLMs-v3-7B-Chat · https://huggingface.co/aisingapore/Llama-SEA-LION-v3-8B-IT · https://huggingface.co/aisingapore/Gemma-SEA-LION-v3-9B · https://huggingface.co/aisingapore/Gemma-SEA-LION-v4-27B-IT · https://huggingface.co/aisingapore/Qwen-SEA-LION-v4.5-27B-IT · https://huggingface.co/sail/Sailor2-20B-Chat · https://huggingface.co/sail/Sailor2-8B-Chat · https://huggingface.co/Viet-Mistral/Vistral-7B-Chat · https://huggingface.co/hiieu/Vistral-7B-Chat-function-calling · https://huggingface.co/vinai/PhoGPT-4B-Chat · https://huggingface.co/BlossomsAI/BloomVN-8B-chat · https://huggingface.co/collections/aisingapore/sea-lion-v3 · https://huggingface.co/collections/sailor2/sailor2-models · https://huggingface.co/datasets/ChaosAIVision/Vietnamese-Salesforce-xlam-function-calling-60k-gg-translated

**Vietnamese benchmarks:** https://aclanthology.org/2025.acl-long.563.pdf (VMLU) · https://leaderboard.sea-lion.ai/detailed/VI (SEA-HELM VI) · https://www.nrl.ai/en/bench (VN-Bench) · https://aclanthology.org/2024.findings-naacl.261/ (ViGLUE) · https://ar5iv.labs.arxiv.org/html/2512.14554 (VLegal-Bench) · https://ar5iv.labs.arxiv.org/html/2506.19468 (MuBench) · https://aclanthology.org/2025.findings-naacl.341.pdf (SeaExam/SeaBench) · https://papers.neurips.cc/paper_files/paper/2025/file/45a7ca247462d9e465ee88c8a302ca70-Paper-Conference.pdf (Global MMLU) · https://aclanthology.org/2024.acl-demos.pdf (SeaLLM v2.5 vs ChatGPT-3.5) · https://sap.ist.i.kyoto-u.ac.jp/EN/bib/intl/ZHE-ACL26.pdf (Gemini 2.5 Flash VN scores) · https://cafebiz.vn/vinuni-cong-bo-xep-hang-ai-cua-ty-phu-pham-nhat-vuong-dung-dau-o-1-chi-so-176260707072441174.chn (V-Bench) · https://viettelai.vn/en/tin-tuc/viettel-trains-120-billion-parameter-vietnamese-sovereign-ai-model · https://aclanthology.org/2026.findings-acl.462.pdf (SealTool, SEA tool calling) · https://dl.acm.org/doi/pdf/10.1145/3805712.3809979 (tool refusal in low-resource languages)

**Free tiers / pricing / failover:** see the §6 citation block, plus https://docs.litellm.ai/docs/proxy/config_settings · https://openrouter.ai/docs/guides/routing/provider-selection · https://futureagi.com/blog/what-is-llm-fallback-strategy-2026/ · https://openrouter.ai/blog/tutorials/free-llm-apis-compared/ · https://wotai.co/blog/best-free-llm-apis · https://github.com/pleasedodisturb/kestrel/blob/main/docs/research/free-model-landscape-2026.md

**Voice:** https://huggingface.co/pnnbao-ump/VieNeu-TTS-q4-gguf · https://huggingface.co/undertheseanlp/asr-1 · https://ar5iv.labs.arxiv.org/html/2602.12911
