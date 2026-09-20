<!--
  PHỤ LỤC THÔ — KHÔNG PHẢI KẾT LUẬN
  Đây là bản báo cáo của một lượt nghiên cứu độc lập chỉ dùng công cụ web_search (không đọc được nội dung
  trang), giữ nguyên tiếng Anh và nguyên cách tự đánh dấu của nó: [SEEN] / [URL-SEEN] / [UNVERIFIED — recalled].
  Người đọc: mọi mục [UNVERIFIED — recalled] KHÔNG được dùng để ra quyết định.
  Kết luận chính thức của feature F-001 nằm ở R-001-free-llm-va-chi-phi-model.md.
  Các chỗ phụ lục này nói khác R-001 thì R-001 thắng (R-001 đọc trực tiếp tài liệu gốc và API ngày 20/09/2026).
-->

# PHỤ LỤC R-001-A — Lượt khảo sát độc lập chỉ bằng web_search (nguồn thô, tiếng Anh)

| | |
|---|---|
| **Thuộc nghiên cứu** | R-001 |
| **Feature** | **F-001 — Chi phí model / LLM giá rẻ–miễn phí cho fBuddy** |
| **Loại tài liệu** | Phụ lục "nguồn thô" — đầu vào tham khảo, **không phải kết luận** |
| **Ngày** | 20/09/2026 |
| **Điểm yếu đã biết** | Chỉ có `web_search` (trả về danh sách URL + tiêu đề, không có nội dung trang); tác giả không đọc được body của bất kỳ trang nào |

## Đính chính sau khi đọc nguồn gốc (R-001 §2) — đọc trước phần tiếng Anh bên dưới

| Nội dung trong phụ lục | Trạng thái sau khi kiểm bằng nguồn gốc |
|---|---|
| "Free ≈ $0.10/tháng, PRO ≈ $2/tháng" ghi ở dạng [UNVERIFIED] | **ĐÚNG** — đã xác nhận tại `docs/inference-providers/pricing.md` (commit 21/08/2026) |
| "Team/Enterprise ≈ $250/tháng" (nhớ lại) | **SAI** — tài liệu gốc ghi **$2.00/seat/tháng** |
| "PRO là $9/tháng" | `[CHƯA KIỂM]` — tài liệu pricing của HF chỉ nói về credit, không nêu giá gói PRO; cần đọc `huggingface.co/subscribe/pro` |
| "Provider nào có free tier riêng được nối vào billing của HF: chưa xác minh" | **ĐÃ RÕ** — credit HF tiêu được cho mọi provider HF route; free tier riêng của Groq/Cerebras là tài khoản riêng, không liên quan |
| "Danh sách provider có thể đã cũ" | **ĐÃ CÓ SỐ MỚI** — xem R-001 §4 (14 provider, quét 20/09/2026) |
| "Model catalog tháng 9/2026 có thể mới hơn" | **ĐÚNG** — R-001 §3 liệt kê model + giá thật lấy từ API Hub cùng ngày |

---

# Hugging Face serving options for a production Vietnamese chat app

**Scope:** streaming chat, OpenAI-compatible API, tool/function-calling loop, vision for image edit, credit-based token billing.

## 0. Method, and a hard limitation you must know about

This report was produced with **only the `web_search` tool**. In this session `web_search` returned
**source URL lists with page titles only — no page bodies** (no "answer" summary was ever emitted), and
the sandbox has **no shell/network access** (verified: `curl` to `raw.githubusercontent.com` timed out with
0 bytes after 15 s). Consequence:

* Values that appear **verbatim inside a search-result title** are marked **[SEEN]** — I actually saw that string.
* Numbers/claims I know from training data but **could not re-read in a page** are marked **[UNVERIFIED — recalled]**.
* Structural facts backed by a URL whose title I saw are marked **[URL-SEEN]**.

Everything flagged `[UNVERIFIED]` must be re-checked against the live doc page before you build billing on it.

Two current-date signals matter: search results include artifacts dated **2026** (e.g. a dataset "Daily snapshot
2026-07-23", HF-model URLs for `google/gemma-4-31B-it`, `unsloth/Qwen3.6-35B-A3B-GGUF`, `minimax_m2`, `GLM-4.6V`).
**My model-catalog priors are therefore likely stale**; the HF router catalog in Sept 2026 probably contains
model families newer than those you listed. Treat section B as a *floor*, not a ceiling.

---

## A. How the HF router works, who is behind it, and what actually costs money

### A.1 Endpoint and OpenAI compatibility

| Fact | Status | Source (URL actually seen in results) |
|---|---|---|
| HF ships a router gateway at `router.huggingface.co/v1`, OpenAI-compatible (`/chat/completions`) | [URL-SEEN] — the string appears in committed code fixes: *"Fix model endpoint: use `router.huggingface.co/v1` with `model:provider` format"* and *"redirect api-inference HF endpoint to router"* | https://huggingface.co/spaces/codelion/safety-copilot/commit/c450b6dedfb6d2ae5b7cc8e7f814a311231a1200 , https://huggingface.co/spaces/krishpotanwar/worldpolicy-v6/commit/43020f1f844710381601edb22eddb50e6bd1a569 |
| "Inference Providers now fully support OpenAI-compatible API" (changelog) | [URL-SEEN] | https://huggingface.co/changelog/inference-providers-openai-compatible |
| Legacy `api-inference.huggingface.co` is deprecated in favour of the router | [URL-SEEN] (mirror doc named *"hf_legacy_inference_api_to_inference_providers"*) | https://huggingface.co/datasets/John6666/knowledge_base_md_for_rag_1/blob/main/hf_legacy_inference_api_to_inference_providers_20251114.md |
| Provider pinning syntax is `model:provider` (e.g. `Qwen/Qwen3-32B:groq`); there is a `provider="auto"` concept | [UNVERIFIED — recalled]; the `:provider` suffix itself is [URL-SEEN] | https://github.com/huggingface/huggingface_hub/pull/3011 |
| Per-provider selection policy + `list_models` filtering by inference provider exists in `huggingface_hub` | [URL-SEEN] | https://github.com/huggingface/huggingface_hub/issues/2963 , https://github.com/huggingface/huggingface_hub/pull/2836 |
| A beta **Responses API** (not just Chat Completions) is offered through the router | [URL-SEEN] | https://huggingface.co/docs/inference-providers/en/guides/responses-api |
| `hf-inference` (HF's own inference) is one provider among the others in the same catalog | [SEEN] (appears in the provider slug list below) | https://huggingface.co/models?pipeline_tag=fill-mask&inference_provider=groq,novita,cerebras,nscale,fal-ai,together,fireworks-ai,featherless-ai,zai-org,replicate,cohere,scaleway,publicai,ovhcloud,wavespeed,deepinfra,hf-inference |

Auth, for the record and [UNVERIFIED — recalled]: the router accepts a normal HF user token (`hf_...`) as a Bearer
token, not per-provider vendor keys; HF handles the upstream credentials. Verify before shipping.

### A.2 The upstream provider list — best evidence I could obtain

The strongest single artifact is a **live filter URL** that enumerates provider slugs:

```
inference_provider=groq,novita,cerebras,nscale,fal-ai,together,fireworks-ai,
                   featherless-ai,zai-org,replicate,cohere,scaleway,publicai,
                   ovhcloud,wavespeed,deepinfra,hf-inference
```

Source: https://huggingface.co/models?pipeline_tag=fill-mask&inference_provider=groq,novita,cerebras,nscale,fal-ai,together,fireworks-ai,featherless-ai,zai-org,replicate,cohere,scaleway,publicai,ovhcloud,wavespeed,deepinfra,hf-inference

That is **17 slugs seen in one string**. Cross-checked against other seen artifacts:

| Provider slug | Corroborating artifact seen |
|---|---|
| `groq` | HF blog "Groq on Hugging Face Inference Providers" — https://huggingface.co/blog/inference-providers-groq ; per-provider doc page https://huggingface.co/docs/inference-providers/main/en/providers/groq |
| `cerebras`, `cohere`, `deepinfra`, `fal-ai`, `featherless-ai`, `baseten`, `black-forest-labs`, `clarifai` | type-union in the JS client docs, truncated at `"f...` — https://huggingface.co/docs/huggingface.js/main/inference/modules |
| `scaleway` | huggingface_hub release **v0.34.5** titled *"Welcoming Scaleway as Inference Providers!"* — https://github.com/huggingface/huggingface_hub/releases/tag/v0.34.5 ; EU-provider press: https://www.silicon.fr/Thematique/cloud-1370/Breves/hugging-face-ajoute-options-europeennes-inference-485472.htm |
| `baseten` | dedicated doc page exists — https://huggingface.co/docs/inference-providers/providers/baseten |
| `SCX AI` | huggingface.js PR *"feat: add SCX AI inference provider"* — https://github.com/huggingface/huggingface.js/pull/2286 |
| Providers get **removed** over time | PR *"[Inference Providers] Remove dead inference providers"* — https://github.com/huggingface/huggingface_hub/pull/4447 |
| Hardware/platform notes per provider are documented | arXiv PDF snippet titled `<table><tr><td>Inference Provider</td><td>Hardware / Platform Notes</td><td>Avg...` — https://arxiv.org/pdf/2601.08156.pdf |

**Not confirmed as HF-router providers in anything I saw:** Hyperbolic, SambaNova, Nebius, MiniMax.
Confirmed-or-strongly-indicated slugs I DID see: groq, novita, cerebras, nscale, fal-ai, together, fireworks-ai,
featherless-ai, zai-org, replicate, cohere, scaleway, publicai, ovhcloud, wavespeed, deepinfra, hf-inference,
baseten, black-forest-labs, clarifai, scx-ai.
Per-provider doc pages are enumerated under `https://huggingface.co/docs/inference-providers/providers/<slug>`
(confirmed for `baseten`; [URL-SEEN]). **The authoritative full roster is that directory listing — fetch it.**

The provider union also appears in code as `huggingface_hub/src/huggingface_hub/inference/_providers/__init__.py`
(lines ~163-208 in the seen blob): https://github.com/huggingface/huggingface_hub/blob/0b55fb46/src/huggingface_hub/inference/_providers/__init__.py
— grep the `Literal[...]` there for the definitive, version-pinned list.

### A.3 FREE tier, PRO tier, and how credits are consumed

**Honest status: I could not read the pricing page body.** The page exists and I saw its URL and one of its
anchors, but not its text. Here is everything I can defensibly say.

| Claim | Status | Source |
|---|---|---|
| There **is** a dedicated pricing/billing page for Inference Providers | [URL-SEEN] | https://huggingface.co/docs/inference-providers/pricing |
| Its markdown source is public and greppable | [URL-SEEN] | https://raw.githubusercontent.com/huggingface/hub-docs/main/docs/inference-providers/pricing.md |
| The page has a section anchored `#billing-for-team-and-enterprise-organizations` -> Team/Enterprise orgs have distinct billing rules | [SEEN] (anchor in a result URL) | https://huggingface.co/docs/inference-providers/en/pricing?python-clients=openai#billing-for-team-and-enterprise-organizations |
| The main docs index has a `#rate-limits` section | [SEEN] (anchor in a result URL) | https://huggingface.co/docs/inference-providers/index#rate-limits |
| PRO is **$9/mo** and there is a Free tier | third-party title, weak | https://comparedge.com/tools/hugging-face/pricing — *"Hugging Face Pricing 2026: Free, PRO & Team Plans from $9/mo"* (also https://huggingface.co/subscribe/pro) |
| HF markets third-party serverless inference **at no extra cost** (passthrough of provider rates, no HF markup) | third-party headline | https://www.heise.de/en/news/Hugging-Face-offers-serverless-inferences-by-third-parties-at-no-extra-cost-10261060.html |
| Credits are metered per-request by provider rate card; the "Supported Models" table exposes per-model $/Mtok | [SEEN] (the table columns themselves) | https://huggingface.co/inference/models |
| Free accounts **do** receive some included credits, and users have publicly complained when they did not arrive | [URL-SEEN] (discussion title: *"DIdn't get Inference Provider credits"*) | https://huggingface.co/spaces/toad-hf-inference-explorers/README/discussions/1 |
| Community expectation that PRO includes inference credits | [URL-SEEN] (forum thread) | https://discuss.huggingface.co/t/about-membership-and-subscription/173746/2 |

**[UNVERIFIED — recalled, DO NOT SHIP BILLING ON THIS]** My recollection is that HF's pricing doc states roughly:
free accounts get a small monthly included-credit allowance (order of **$0.10/month**, frequently described in
community posts as effectively nothing), **PRO ($9/mo) includes on the order of $2/month** of inference credits,
and **Team/Enterprise organizations get a much larger monthly allowance (order of $250/month)**; usage beyond the
included allowance is billed at the upstream provider's rate. **I could not verify any of these three numbers.**
They must be read off `huggingface.co/docs/inference-providers/pricing` (or the raw `.md` above) before you
model unit economics. Treat `$0.10 / $2 / $250` as placeholder magnitudes only.

**Is there genuinely free usage?** Evidence-based answer: **not from HF's included credits at chat-app volumes**
(see above), but **yes, in two indirect ways**:

1. Several upstream providers bring their **own** free tiers into the router [UNVERIFIED — recalled: Groq, Cerebras,
   Novita, Featherless, PublicAI and Cloudflare-style vendors have historically offered free allowances; which of
   these are wired through HF's billing is unverified].
2. The HF router catalog is **not** the only "free LLM API" path; third-party aggregations treat HF as a free-tier
   provider — https://mintlify.wiki/cheahjs/free-llm-api-resources/providers/free/huggingface ,
   https://github.com/raullenchai/free-llm-api-resources , https://free-llm.com/provider/huggingface-inference .
   These are community sources; verify against HF's own doc.

**Gating:** [URL-SEEN] — the pricing page's Team/Enterprise anchor plus the `#rate-limits` anchor on the index mean
gating is by **account tier (free / PRO / Team / Enterprise)**, expressed as included-credit allowance plus rate limits,
not as a hard "free users are blocked" switch. The exact free-tier rate limit numbers are **UNVERIFIED**.

**Practical consequence for your app:** do **not** use HF Inference Providers' free/PRO allowance as the billing
backbone of a credit-based Vietnamese chat app. Treat HF credits as development/eval budget, and plan to either
(a) buy credits, or (b) go direct to a provider (or a cheaper aggregator) for production traffic — while keeping the
HF router as the OpenAI-compatible abstraction layer during prototyping.

---

## B. Models you asked about, as served (or not) through the HF router

### B.0 How to read this: the "Supported Models" table

`https://huggingface.co/inference/models` renders a table. Several result **titles** leaked individual rows verbatim,
which gives us real numbers for the columns:

```
<model> | <input $/Mtok> | <output $/Mtok> | <context> | <latency s> | <throughput tok/s> | <bool> | <bool>
```

Examples I actually saw:
* `openai/gpt-oss-20b | $0.05 | $0.18 | 131,072 | 0.37 | 81 | Yes | Yes`
* `Qwen/Qwen3-VL-235B-A22B-Instruct | $0.20 | $0.88 | 262,144 | 0.41 | 15 | Yes | Yes`
* `Qwen/Qwen2.5-72B-Instruct | $0.38 | $0.40 | 32,000 | 0.90 | 31 | Yes | No`
* `deepseek-ai/DeepSeek-V3-0324 | $0.24 | $0.90 | 163,840 | 0.74 | 31 | Yes | Yes`
* `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B | $0.15 | $0.15 | 131,072 | 0.53 | 151 | No | No`
* `meta-llama/Llama-Guard-4-12B | $0.18 | $0.18 | 163,840 | 0.59 | 5 | No | No`
* `zai-org/GLM-4.6V-FP8 | - | - | - | 2.78 | 54 | Yes | No`
* `(Llama-3.3-70B-Instruct search) | $0.59 | $0.79 | 131,072 | 0.25 | 279 | Yes | No`
* `meta-llama/Llama-4-Scout-17B-16E-Instruct | - | - | - | - | - | - | -`  <- **all dashes = no provider pricing row**

Note: prices are **the cheapest/most representative provider rate across providers serving that model**, not a
per-provider matrix; HF's UI expands per-provider rows when you open the model. Column semantics for the last two
booleans are **UNVERIFIED** — evidence is consistent with **[tool calling | structured-output/JSON mode]** (Qwen3-VL
`Yes|Yes`, gpt-oss-20b `Yes|Yes`, Llama-3.3-70B `Yes|No`, Llama-Guard `No|No`, R1-Distill-Qwen-7B `No|No`), but
GLM-4.6V reading `Yes|No` does not cleanly fit either tool-calling or vision, and gpt-oss-20b has no vision, so
**do not assume the columns mean tools/vision**. Confirm in the UI.

`-` in the price columns means "no price row shown for this model in that query context" — for Llama-4-Scout it
coincides with all other columns being `-`, i.e. **apparently no longer served on the router**.

### B.1 Table 1 — candidate chat/vision models

| HF model ID | Params | License | Tool calling | Vision | Served on HF router (evidence) | Free/paid |
|---|---|---|---|---|---|---|
| `Qwen/Qwen3-235B-A22B` | 235B total / 22B active (MoE) | Apache-2.0 (unverified) | Yes (Qwen3 chat template) [UNVERIFIED] | No | **Yes** — row exists (price truncated in the leak); sibling `Qwen/Qwen3-235B-A22B-Instruct-2507` also exists | Paid (credits) |
| `Qwen/Qwen3-235B-A22B-Instruct-2507` | 235B/22B MoE | Apache-2.0 (unverified) | Yes [UNVERIFIED] | No | **Yes** — quantized-base listings exist; router row not captured | Paid |
| `Qwen/Qwen3-32B` | 32B dense | Apache-2.0 (unverified) | Yes [UNVERIFIED] | No | **Yes** — row exists (prices truncated in leak) | Paid |
| `Qwen/Qwen3-30B-A3B(-Instruct-2507)` | 30B total / 3B active (MoE) | Apache-2.0 (unverified) | Yes [UNVERIFIED] | No | Likely **Yes** (model card confirmed; `Qwen/Qwen3-30B-A3B-Instruct-2507` live) | Paid |
| `Qwen/Qwen3-14B` | 14B | Apache-2.0 | Yes | No | Likely **Yes** (referenced as a `?model=` filter in a router-table result) | Paid |
| `Qwen/Qwen3-8B`, `Qwen/Qwen3-4B` | 8B / 4B | Apache-2.0 | Yes | No | Unverified on router | Paid / maybe free |
| `Qwen/Qwen3-Coder-480B-A35B-Instruct` | 480B / 35B active (MoE) | Apache-2.0 (unverified) | Yes (agentic tool use is its selling point) [UNVERIFIED] | No | Unverified on router (model exists; router row not captured) | Paid |
| `Qwen/Qwen2.5-72B-Instruct` | 72B | Qwen License (non-Apache) | **Yes — leaked `Yes`** | No — leaked `No` | **Yes**, cheapest seen **$0.38 in / $0.40 out per Mtok**, ctx 32,000 | Paid |
| `Qwen/Qwen2.5-32B-Instruct` | 32B | Qwen License | Yes [UNVERIFIED] | No | Unverified | Paid |
| `Qwen/Qwen2.5-7B-Instruct` | 7B | Apache-2.0 | Yes [UNVERIFIED] | No | Unverified | Possibly free-tier |
| `Qwen/Qwen3-VL-235B-A22B-Instruct` | 235B/22B MoE | Apache-2.0 (unverified) | **leaked `Yes`** | **leaked `Yes`** (Qwen3-VL is natively multimodal) | **Yes**, **$0.20 in / $0.88 out per Mtok**, ctx **262,144**, ~15 tok/s | Paid |
| `Qwen/Qwen2.5-VL-32B-Instruct(-AWQ)` | 32B | Qwen License | **Documented break under vLLM** (see C.2 FM-4) | Yes | Model exists; tool calling has a documented regression | Paid |
| `meta-llama/Llama-3.3-70B-Instruct` | 70B | Llama 3.3 Community License | **leaked `Yes`** | leaked `No` | **Yes**, **$0.59 in / $0.79 out per Mtok**, ctx 131,072, ~279 tok/s | Paid |
| `meta-llama/Llama-3.1-8B-Instruct` | 8B | Llama 3.1 Community | Yes (weaker, stringly) [UNVERIFIED] | No | Historic router staple; **current presence unverified** | Paid / near-free |
| `meta-llama/Llama-4-Scout-17B-16E-Instruct` | 109B total / 17B active (MoE) | Llama 4 Community | Yes [UNVERIFIED] | Yes [UNVERIFIED] | **Apparently NOT served** — leaked row is all dashes | n/a |
| `meta-llama/Llama-4-Maverick-17B-128E-Instruct` | 400B / 17B active | Llama 4 Community | Yes | Yes | Unverified; by analogy with Scout, likely absent | n/a |
| `meta-llama/Llama-Guard-4-12B` | 12B | Llama 4 Community | **leaked `No`** | leaked `No` (though the model is multimodal) | **Yes**, $0.18/$0.18, ctx 163,840 | Paid (guard model) |
| `google/gemma-3-27b-it` | 27B | Gemma Terms | Gemma function calling exists as a capability but has its own `FunctionGemma` spec — see C.4 | Yes | Model card confirmed; **router row not captured** | Paid |
| `google/gemma-3-12b-it`, `google/gemma-3-4b-it` | 12B / 4B | Gemma Terms | see above | Yes (all Gemma 3 sizes are multimodal) | Unverified | Paid / free-ish |
| `google/gemma-4-31B-it` | — | — | — | — | **Seen referenced** in a Sept-2026-style HN comment as tried *through HuggingFace* with a provider complaint | Paid |
| `mistralai/Mistral-Small-3.1-24B-Instruct-2503` | 24B | Apache-2.0 | **Yes, but with a known template gap** — llama.cpp needed PR #14148 to add a tool-calling template; HF-format tool template added in repo discussion #63 | Yes (vision-capable) | Model confirmed; router presence unverified | Paid |
| `mistralai/Mistral-Small-3.2-24B-Instruct-2506` | 24B | Apache-2.0 | Yes [UNVERIFIED] | Yes [UNVERIFIED] | Unverified | Paid |
| `mistralai/Magistral-Small-2509` | 24B | Apache-2.0 | Yes [UNVERIFIED] (reasoning + tools is fragile) | Yes [UNVERIFIED] | Model card confirmed | Paid |
| `mistralai/Ministral-8B-Instruct-2410` | 8B | Apache-2.0 | Yes [UNVERIFIED] | No | — | Paid |
| `mistralai/Pixtral-12B-2409` | 12B | Apache-2.0 | Yes [UNVERIFIED] | Yes | — | Paid |
| `deepseek-ai/DeepSeek-V3-0324` | 671B / 37B active | DeepSeek License | **leaked `Yes`** | leaked `Yes` (**suspicious; V3-0324 is text-only**) | **Yes**, **$0.24 in / $0.90 out per Mtok**, ctx 163,840 | Paid |
| `deepseek-ai/DeepSeek-R1-0528` | 671B / 37B active | MIT (unverified) | Reasoning model; tool use provider-dependent [UNVERIFIED] | No | Unverified | Paid |
| `deepseek-ai/DeepSeek-R1-Distill-Qwen-32B` | 32B | MIT (unverified) | [UNVERIFIED] | No | Base-model quant listings exist; router row not captured | Paid |
| `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` | 7B | MIT (unverified) | **leaked `No`** | **leaked `No`** | **Yes**, **$0.15 in / $0.15 out per Mtok**, ctx 131,072, 151 tok/s | Paid |
| `openai/gpt-oss-120b` | 117B / 5.1B active | Apache-2.0 | Yes (Harmony format) — see C.2 FM-6 for parallel-call bugs | No | Router row not captured; HF has a dedicated guide | Paid |
| `openai/gpt-oss-20b` | 21B / 3.6B active | Apache-2.0 | **leaked `Yes`** | leaked `Yes` (**wrong; gpt-oss has no vision**) | **Yes**, **$0.05 in / $0.18 out per Mtok**, ctx 131,072, ~81 tok/s | Paid (cheapest sane general model in the table) |
| `zai-org/GLM-4.6V-FP8` | GLM-4.6V (MoE) | unverified | leaked `Yes` | Model is multimodal; leaked second bool `No` | **Yes**, prices shown as `-` in that capture, latency 2.78 s, 54 tok/s | Paid / unpriced capture |

**Read the leaked booleans with suspicion.** gpt-oss-20b and DeepSeek-V3-0324 both show `Yes|Yes` and neither has
vision; Llama-Guard-4 shows `No|No` and arguably does. So the two columns are **not** `tools | vision` in any way I can
confirm. Open the model page and read the per-provider expansion instead of trusting these.

### B.2 Table 2 — Vietnamese / SEA-specific models

**Headline finding: I found no evidence that *any* Vietnamese- or SEA-specialised open model is served through the HF
Inference Providers router.** The router catalog is a curated set of commercially-hosted models; every Vietnamese model
below appears only as a Hub *artifact* (weights/GGUF/quant repacks), i.e. something you would have to self-host or push
to a dedicated Inference Endpoint. **Flagged as high-confidence-negative but not proven** — the per-model
`inference_provider` filter on the Hub is the way to verify any single ID.

| Model | HF ID(s) actually seen | Params | License | Tool calling | Vision | Served on HF router? | Source |
|---|---|---|---|---|---|---|---|
| SeaLLM 7B v2.5 | `SeaLLMs/SeaLLM-7B-v2.5` | 7B (Gemma-7B based) | **"other"** (leaked `license: other`) | Not claimed on card [UNVERIFIED] | No | **No evidence** | https://huggingface.co/SeaLLMs/SeaLLM-7B-v2.5/raw/main/README.md ; repacks `SorawitChok/SeaLLM-7B-v2.5-AWQ`, `NghiemAbe/SeaLLM-v2.5-Legal-v4-AWQ`; ACL demo paper https://aclanthology.org/2024.acl-demos.pdf |
| SEA-LION v3 | `aisingapore/Llama-SEA-LION-v3-8B-IT` (+`-GGUF`); collection `aisingapore/sea-lion-v3` | 8B | Llama 3.1 Community (derivative) | Not claimed [UNVERIFIED] | No | **No evidence** | https://huggingface.co/aisingapore/Llama-SEA-LION-v3-8B-IT , https://huggingface.co/collections/aisingapore/sea-lion-v3 |
| SEA-LION v4 (Gemma) | `aisingapore/Gemma-SEA-LION-v4-27B-IT` | 27B | Gemma Terms | Not claimed [UNVERIFIED] | **Yes** (Gemma 3 derivative) | **No evidence** | https://huggingface.co/models?other=base_model:finetune:aisingapore/Gemma-SEA-LION-v4-27B-IT |
| SEA-LION v4.5 (Qwen) | `aisingapore/Qwen-SEA-LION-v4.5-27B-IT` | 27B | Qwen license | Not claimed [UNVERIFIED] | Likely no | **No evidence** | named as newer version on https://huggingface.co/aisingapore/Llama-SEA-LION-v3-8B-IT |
| SEA-LION embedding | `aisingapore/SEA-LION-E5-Embedding-600M` | 600M | **MIT** (leaked) | n/a | No | No evidence | https://huggingface.co/aisingapore/SEA-LION-E5-Embedding-600M/blob/main/README.md |
| Sailor2 20B | `sail/Sailor2-20B-Chat` | 20B | Apache-2.0 (unverified) | Not claimed [UNVERIFIED] | No | **No evidence** | https://huggingface.co/sail/Sailor2-20B-Chat , https://huggingface.co/collections/sailor2/sailor2-models |
| Sailor2 8B | `sail/Sailor2-8B-Chat` | 8B | Apache-2.0 (unverified) | Not claimed | No | **No evidence** | https://huggingface.co/sail/Sailor2-8B-Chat/discussions/2 |
| Vistral (Viet-Mistral) | `Viet-Mistral/Vistral-7B-Chat` | 7B | Apache-2.0 (unverified) | Base model: no native tool template. Vietnamese FC fine-tune exists: `hiieu/Vistral-7B-Chat-function-calling` (+ GGUF by `tensorblock`) | No | **No evidence** | https://huggingface.co/Viet-Mistral/Vistral-7B-Chat , https://huggingface.co/hiieu/Vistral-7B-Chat-function-calling , https://huggingface.co/tensorblock/Vistral-7B-Chat-function-calling-GGUF , https://huggingface.co/mradermacher/Vistral-7B-iSMART-GGUF |
| PhoGPT | `VinAIResearch/PhoGPT-7B5-Instruct`, `PhoGPT-4B-Chat` (repacks `nguyenviet/PhoGPT-7B5-Instruct-GGUF`, `nguyenviet/PhoGPT-4B-Chat-GGUF`) | 7.5B / 4B | "other" (leaked on the GGUF repack) | No | No | **No evidence** | https://huggingface.co/buckets/huggingchat/papers-content/tree/2311/2311.02945.md , https://archive.org/details/github.com-VinAIResearch-PhoGPT_-_2023-11-07_03-03-20 |
| VinaLLaMA | `vinai/vinallama-7b-chat` (repack `LoneStriker/vinallama-7b-AWQ`) | 7B | Llama 2 derivative | No | No | **No evidence** | https://ar5iv.labs.arxiv.org/html/2312.11011 |
| Aya Expanse 8B / 32B | `CohereForAI/aya-expanse-8b`, `-32b` (repack `jth01/aya-expanse-8b-5.0bpw-exl2`) | 8B / 32B | CC-BY-NC (unverified — **commercial use likely restricted**) | No documented tool template [UNVERIFIED] | No | **No evidence**. Cohere *is* an HF router provider, but hosted Command models are a separate thing from these open weights | https://huggingface.co/blog/ariG23498/cohere-aya-expanse |
| BloomVN-8B-chat | `BlossomsAI/BloomVN-8B-chat` | 8B | unverified | No | No | **No evidence** | https://huggingface.co/BlossomsAI/BloomVN-8B-chat/blob/main/README.md |
| Vietnamese Qwen3 fine-tunes | `vominhmanh/qwen3-4b-vihsd`, `LuvU4ever/qwen2.5-3b-qlora-merged-v2` | 4B / 3B | unverified | No | No | **No evidence** | https://huggingface.co/vominhmanh/qwen3-4b-vihsd , https://huggingface.co/LuvU4ever/qwen2.5-3b-qlora-merged-v2 |
| Vietnamese Gemma-2 fine-tunes | surfaced only via Hub search `huggingface.co/models?other=vietnamese` | — | — | — | — | No evidence | https://huggingface.co/models?other=vietnamese&p=6&sort=trending |
| Vietnamese legal SeaLLM | `NghiemAbe/SeaLLM-v2.5-Legal-v4(-AWQ)` | 7B | unverified | No | No | No evidence | https://huggingface.co/NghiemAbe/SeaLLM-v2.5-Legal-v4-AWQ/raw/main/README.md |

**Implication for a Vietnamese chat app:** you will not get Vietnamese-specialised serving "for free" out of the HF
router. The realistic architecture is: **use the router (or direct providers) for strong multilingual general models**
(Qwen3 / Qwen3-VL / gpt-oss / Llama-3.3-70B are all competent Vietnamese), and reserve self-hosting or a dedicated
Inference Endpoint for a SEA-LION / Sailor2 / Vistral-class model if you later need one. `aisingapore` SEA-LION
v4/v4.5 is the most actively maintained SEA line I found, and the v4 Gemma variant would also give you vision.

---

## C. Tool calling through the HF router and OpenAI-compatible endpoints — reliability

### C.1 What HF documents, and what the shape of that documentation implies

HF publishes **"Function Calling with Inference Providers"**
— https://huggingface.co/docs/inference-providers/en/guides/function-calling
— raw markdown: https://raw.githubusercontent.com/huggingface/hub-docs/refs/heads/main/docs/inference-providers/guides/function-calling.md
— source: https://github.com/huggingface/hub-docs/blob/main/docs/inference-providers/guides/function-calling.md

I could not read its body. The existence of a dedicated page, plus a dedicated **gpt-oss guide with `tool-call`,
`structured`, `stream`, `tool-call-resp` and `mcp` sections**
(https://huggingface.co/docs/inference-providers/guides/gpt-oss), plus a per-provider doc tree
(https://huggingface.co/docs/inference-providers/providers/baseten), indicates the support surface is
**per-provider and per-model, and HF expects you to consult it** rather than assume uniform support.

Independent corroboration that it is *partial*: the Vercel AI SDK's HF provider commit says
*"Tool calling is supported by many models through Hugging Face's..."*
— https://github.com/vercel/ai/commit/f30012565bb82871554098960d10ba838b55645e
and there was dedicated follow-up work for client-side tool execution:
https://github.com/vercel/ai/pull/10790 . Likewise, codecompanion.nvim had to *add* HF function-calling support as a
feature: https://github.com/olimorris/codecompanion.nvim/pull/1907 . If support were uniform, these would be no-ops.

### C.2 Named failure modes, with sources

**FM-1 — Tool calls that never resolve / hang at the client.** The single most relevant upstream issue:
*"Function/tool calling never resolves"* — https://github.com/huggingface/huggingface_hub/issues/2829 .
Symptom: you send `tools`, the call returns, but no `tool_calls` materialise and your loop deadlocks.
**Mitigation:** wrap the tool loop in a hard timeout plus a "no tool_calls and no content" fallback that
terminates the turn.

**FM-2 — Streaming deviations from the OpenAI spec at the proxy layer.** HF shipped
*"[MCP] Handle Ollama's deviation from the OpenAI tool streaming spec"* —
https://github.com/huggingface/huggingface_hub/pull/3140 . Direct evidence that **tool-call streaming through
the router is not a clean OpenAI stream for every provider**, and the client must tolerate non-conformant deltas.
Related: *"[Draft][Bugfix][Parser] Strip content whitespace at tool-call boundaries in streaming to match
non-streaming"* — https://app.semanticdiff.com/gh/vllm-project/vllm/pull/49426/overview (streaming and non-streaming
paths disagree on whitespace, so you cannot diff test fixtures across modes).

**FM-3 — Structured-output / schema handling bugs at the HF layer.**
*"[Inference Providers] Fix structured output schema in chat completion"* —
https://github.com/huggingface/huggingface_hub/pull/3082 . If HF was mangling `response_format` JSON schemas, any
grammar-constrained tool calling layered on top is suspect. Also: *"[Parser] Pass request.tools to tool parser"* —
https://app.semanticdiff.com/gh/vllm-project/vllm/pull/38860/overview — upstream parsers historically did **not**
receive the tool definitions, i.e. they parse blindly and can emit calls for tools you never declared.

**FM-4 — Qwen2.5-VL / Qwen3-VL tool calling is genuinely broken under vLLM.**
*"Tool Call Issues with Qwen2.5-VL Models (7B & 72B) under vLLM"* — https://github.com/QwenLM/Qwen3-VL/issues/1093
and *"(vLLM) Tool calling broken after update to `tokenizer_config.json`"* —
https://huggingface.co/Qwen/Qwen2.5-VL-32B-Instruct-AWQ/discussions/10 .
**This is critical for your "vision for image edit" requirement**: the exact family you would pick for vision is the
one with the worst documented tool-calling record. **Recommendation: do not put vision and the tool loop on the same
Qwen-VL call.** Route image understanding to a VL model and run the tool loop on a text model (Qwen3 / gpt-oss /
Llama-3.3-70B), or use one VL model proven for tools on the specific provider you pin.

**FM-5 — Qwen3 emits multiple parallel tool calls that naive parsers cannot read.**
*"`qwen3_schema` fails to parse multiple parallel tool calls"* — https://github.com/huggingface/trl/issues/4708 ,
fix PR https://github.com/huggingface/trl/pull/4709 ; and worse,
*"`qwen3_schema` regex causes O(2^n) backtracking hang on malformed tool calls"* —
https://github.com/huggingface/trl/issues/4865 (**a ReDoS-class hazard: a malformed tool call can pin a CPU core**).
If you self-host any Hermes/Qwen3-style parser, pin a patched version and cap regex backtracking.

**FM-6 — gpt-oss / Harmony format: token-ordering and parallel-call bugs.**
*"Function call token ordering mismatch with Harmony format and chat template"* —
https://huggingface.co/openai/gpt-oss-20b/discussions/218 ; *"[fix] Enable parallel tool calls for Harmony (gpt-oss)
models"* — https://app.semanticdiff.com/gh/vllm-project/vllm/pull/44656/overview .
gpt-oss is cheap and attractive ($0.05/$0.18 per Mtok as seen above) but its harmony channel format is a distinct
parser surface, and it is **text-only** — it cannot serve your image-edit path.

**FM-7 — Mistral: templates shipped without tools, then added; and clients that require `tool_calls` to exist.**
Upstream had to *add* a Mistral-Small-3.1 tool template —
https://github.com/ggml-org/llama.cpp/pull/14148 and
https://github.com/ggml-org/llama.cpp/discussions/13585 ; Mistral's own repo took a community contribution to
*"Add tool calling template for HF format"* —
https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503/discussions/63 .
Downstream: *"`unexpected_response` error when Mistral complete message response does not include a `tool_calls`
key"* — https://github.com/brainlid/langchain/issues/439 . **Failure mode: the response simply omits the key**, so
`if "tool_calls" in msg` is the correct guard, never direct indexing, and never assume the key is present-but-null.

**FM-8 — Tool calls arrive as plain text instead of structured `tool_calls`.** The classic Hermes /
`<tool_call>{...}</tool_call>` situation. Direct evidence in the wild:
*"chat: add content-only fallback for JSON_NATIVE tool parser"* —
https://github.com/ggml-org/llama.cpp/pull/20800 and *"chat: harden peg-native tool call parsing"* —
https://github.com/ggml-org/llama.cpp/pull/24329 . Also, vLLM needed *"[Bugfix][ToolParser] Handle braces in required
tool streaming strings"* — https://app.semanticdiff.com/gh/vllm-project/vllm/pull/45389/overview (braces inside
argument strings broke the parser). **Operational rule: parse `content` for a tool-call envelope as a fallback path,
and instrument how often the fallback fires — if it fires above ~1-2%, that model/provider is not production-safe
for your loop.**

**FM-9 — Empty / malformed tool calls propagated into the agent loop.**
*"BUG: Default ToolCallingAgent InferenceClient examples failing"* —
https://github.com/huggingface/smolagents/issues/1808 . HF's *own* default examples for a tool-calling agent over
`InferenceClient` were failing — an honest signal about the base rate.

**FM-10 — Vision plus tools interop at the router edge.**
*"URGENT: Production outage – Hugging Face Router returns 500 errors for vision models"* —
https://github.com/huggingface/huggingface_hub/issues/3688 . Also *"[Bugfix] validate urls object for multimodal content
parts"* — https://github.com/vllm-project/vllm/pull/16990 ; and *"Verify Hugging Face accepts per-tool-return media
spill with a live recording"* — https://github.com/pydantic/pydantic-ai/issues/7651 (whether you may return images
from a tool result). **For image edit specifically, assume you must not rely on tool-returned media: fetch the image
out-of-band and re-attach it as a normal user image part.**

**FM-11 — Schema-shape drift between "HF format" and OpenAI.** HF's own `huggingface_hub` had to fix VLM support in
chat completion (*"Support VLM in chat completion (+some specs updates)"*) —
https://github.com/huggingface/huggingface_hub/pull/2556 — and downstream agents special-case HF router errors in the
wild, e.g. code containing `error_msg = f"HuggingFace router service error (500): {e}"` —
https://huggingface.co/spaces/arterm-sedov/cmw-copilot/blob/5cfb9eb5589af1c4e320b3fdb87a8c9db52fc794/agent.py#L13 .
**Plan for 5xx from the router and implement provider fallback** — which the `model:provider` syntax makes easy.

### C.3 Temperature, `tool_choice`, and streaming — practical rules

* [UNVERIFIED — recalled] Standard lore across vLLM/TGI deployments: **higher temperature increases malformed
  tool-call XML/JSON**, because the parser is grammar-invisible. Every parser bug cited above is a *parser* bug, but
  the trigger is usually a model that produced a slightly-off envelope — and that rate rises with temperature.
  Practical setting for a tool loop: `temperature 0.0-0.3`, and re-sample once at `temperature=0` on parse failure.
* `tool_choice` (`"required"`, named-function forcing): **support is provider-dependent and I found no HF doc
  confirming uniform support** [UNVERIFIED]. Grep the function-calling guide and each provider page. Design your loop
  so that *not* being able to force a tool selection does not break it (never depend on `tool_choice:"required"`).
* Streaming of tool calls: **do not assume it.** FM-2 is direct evidence of deviation; a safe design is
  "stream text for the user, but treat tool-call extraction as an atomic post-step per message", with a
  non-streaming retry if no `tool_calls` delta ever arrives.

### C.4 Gemma specifically

Google documents Gemma function calling
(https://ai.google.dev/gemma/docs/capabilities/function-calling) and, separately, a **`FunctionGemma` formatting and
best-practices** spec — https://ai.google.dev/gemma/docs/functiongemma/formatting-and-best-practices — which tells you
Gemma's tool-call format is its own thing, not plain OpenAI/Hermes. Whether an HF-router provider normalises Gemma
tool calls into OpenAI `tool_calls` for you is **UNVERIFIED** and must be tested per provider.

---

## D. Concrete recommendation for your stack

1. **Do not build billing on HF's free/PRO included credits.** Read
   `https://huggingface.co/docs/inference-providers/pricing` (the raw `.md` is public) and *then* decide. My recalled
   magnitudes are unverified and too small for a production chat app.
2. **Use the router as an abstraction, not as your only path.** `router.huggingface.co/v1` + `model:provider` lets
   you pin and fail over. Keep a direct-provider key as fallback for your hot path.
3. **Split the tool loop from the vision path.** Tool loop -> a text model with a proven record
   (Qwen3-32B / Qwen3-235B-A22B / Llama-3.3-70B / gpt-oss-20b — the last is the cheapest at $0.05/$0.18 per Mtok as
   leaked). Vision/image edit -> Qwen3-VL-235B-A22B (leaked $0.20/$0.88, 262k ctx) on a provider whose tool calling
   you have independently tested, or keep vision on a non-tool call entirely (FM-4).
4. **Design the tool loop defensively from day one:** presence-checked `tool_calls` (FM-7), hard timeout (FM-1),
   text-envelope fallback (FM-8), parse metrics plus alerting, temperature <= 0.3, no dependence on
   `tool_choice:"required"`, no dependence on streamed tool deltas (FM-2), no expectation of tool-returned images (FM-10).
5. **Credit metering:** because the router is a passthrough with per-token prices visible per model, you can meter
   your own credits from `usage` in the Chat Completions response without needing HF's billing data — but add a
   margin for retries, fallbacks and parse-failure re-samples, which in a tool loop are **not** rare.
6. **Vietnamese specifics:** general multilingual models (Qwen3 family, Llama-3.3-70B, gpt-oss) are the pragmatic
   choice. SEA-LION v4/v4.5 (`aisingapore`) and Sailor2 are the models worth a dedicated-endpoint evaluation later;
   none of them are on the router today as far as I could find.
7. **Verify freshness:** my priors are stale relative to the 2026 artifacts in these search results
   (`gemma-4-31B-it`, `Qwen3.6-35B-A3B`, `minimax_m2`, `GLM-4.6V`, `DeepSeek-V4` references). Re-run the provider
   filter URL and the models table before finalising model choices.

---

## Appendix — every source URL cited above, grouped

**HF docs / pricing / router**
- https://huggingface.co/docs/inference-providers/pricing
- https://huggingface.co/docs/inference-providers/en/pricing?python-clients=openai#billing-for-team-and-enterprise-organizations
- https://raw.githubusercontent.com/huggingface/hub-docs/main/docs/inference-providers/pricing.md
- https://huggingface.co/docs/inference-providers/index#rate-limits
- https://raw.githubusercontent.com/huggingface/hub-docs/main/docs/inference-providers/index.md
- https://huggingface.co/docs/inference-providers/en/guides/function-calling
- https://raw.githubusercontent.com/huggingface/hub-docs/refs/heads/main/docs/inference-providers/guides/function-calling.md
- https://github.com/huggingface/hub-docs/blob/main/docs/inference-providers/guides/function-calling.md
- https://huggingface.co/docs/inference-providers/guides/gpt-oss
- https://huggingface.co/docs/inference-providers/tasks/chat-completion
- https://huggingface.co/docs/inference-providers/en/guides/responses-api
- https://huggingface.co/docs/inference-providers/hub-api
- https://huggingface.co/docs/inference-providers/en/hub-integration
- https://huggingface.co/docs/inference-providers/main/en/register-as-a-provider
- https://huggingface.co/docs/inference-providers/providers/baseten
- https://huggingface.co/docs/inference-providers/main/en/providers/groq
- https://huggingface.co/docs/inference-providers/en/integrations/index
- https://huggingface.co/docs/inference-providers/integrations/visionagents
- https://huggingface.co/changelog/inference-providers-openai-compatible
- https://huggingface.co/inference/models
- https://huggingface.co/models?pipeline_tag=fill-mask&inference_provider=groq,novita,cerebras,nscale,fal-ai,together,fireworks-ai,featherless-ai,zai-org,replicate,cohere,scaleway,publicai,ovhcloud,wavespeed,deepinfra,hf-inference
- https://huggingface.co/docs/huggingface.js/main/inference/modules
- https://huggingface.co/docs/huggingface_hub/v0.32.5/en/guides/inference
- https://huggingface.co/blog/inference-providers-groq
- https://huggingface.co/subscribe/pro
- https://huggingface.co/pricing

**Hub client / SDK issues**
- https://github.com/huggingface/huggingface_hub/issues/2829 (tool calling never resolves)
- https://github.com/huggingface/huggingface_hub/issues/3688 (router 500s for vision models)
- https://github.com/huggingface/huggingface_hub/issues/2963
- https://github.com/huggingface/huggingface_hub/pull/3140 (Ollama tool streaming deviation)
- https://github.com/huggingface/huggingface_hub/pull/3082 (structured output schema fix)
- https://github.com/huggingface/huggingface_hub/pull/3011 (provider="auto")
- https://github.com/huggingface/huggingface_hub/pull/2836
- https://github.com/huggingface/huggingface_hub/pull/3482
- https://github.com/huggingface/huggingface_hub/pull/4447
- https://github.com/huggingface/huggingface_hub/pull/2556 (VLM in chat completion)
- https://github.com/huggingface/huggingface_hub/releases/tag/v0.34.5 (Scaleway)
- https://github.com/huggingface/huggingface_hub/blob/0b55fb46/src/huggingface_hub/inference/_providers/__init__.py
- https://github.com/huggingface/huggingface.js/pull/2286 (SCX AI)
- https://github.com/huggingface/smolagents/issues/1808 (ToolCallingAgent examples failing)
- https://github.com/huggingface/trl/issues/4708
- https://github.com/huggingface/trl/pull/4709
- https://github.com/huggingface/trl/issues/4865
- https://github.com/pydantic/pydantic-ai/issues/7651
- https://github.com/vercel/ai/commit/f30012565bb82871554098960d10ba838b55645e
- https://github.com/vercel/ai/pull/10790
- https://github.com/olimorris/codecompanion.nvim/pull/1907
- https://github.com/ruvnet/ruflo/issues/2900

**Upstream serving-engine (vLLM / llama.cpp) tool-call bugs**
- https://app.semanticdiff.com/gh/vllm-project/vllm/pull/38860/overview
- https://app.semanticdiff.com/gh/vllm-project/vllm/pull/45389/overview
- https://app.semanticdiff.com/gh/vllm-project/vllm/pull/44656/overview
- https://app.semanticdiff.com/gh/vllm-project/vllm/pull/49426/overview
- https://github.com/vllm-project/vllm/pull/16990
- https://github.com/ggml-org/llama.cpp/pull/14148
- https://github.com/ggml-org/llama.cpp/discussions/13585
- https://github.com/ggml-org/llama.cpp/pull/20800
- https://github.com/ggml-org/llama.cpp/pull/24329
- https://github.com/QwenLM/Qwen3-VL/issues/1093
- https://huggingface.co/Qwen/Qwen2.5-VL-32B-Instruct-AWQ/discussions/10
- https://huggingface.co/openai/gpt-oss-20b/discussions/218
- https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503/discussions/63
- https://github.com/huggingface/text-generation-inference/pull/2971

**Vietnamese / SEA models**
- https://huggingface.co/SeaLLMs/SeaLLM-7B-v2.5/raw/main/README.md
- https://huggingface.co/SorawitChok/SeaLLM-7B-v2.5-AWQ
- https://huggingface.co/NghiemAbe/SeaLLM-v2.5-Legal-v4-AWQ
- https://huggingface.co/collections/aisingapore/sea-lion-v3
- https://huggingface.co/aisingapore/Llama-SEA-LION-v3-8B-IT
- https://huggingface.co/aisingapore/Llama-SEA-LION-v3-8B-IT-GGUF
- https://huggingface.co/aisingapore/SEA-LION-E5-Embedding-600M/blob/main/README.md
- https://huggingface.co/models?other=base_model:finetune:aisingapore/Gemma-SEA-LION-v4-27B-IT
- https://huggingface.co/sail/Sailor2-20B-Chat
- https://huggingface.co/sail/Sailor2-8B-Chat/discussions/2
- https://huggingface.co/collections/sailor2/sailor2-models
- https://huggingface.co/Viet-Mistral/Vistral-7B-Chat
- https://huggingface.co/hiieu/Vistral-7B-Chat-function-calling
- https://huggingface.co/tensorblock/Vistral-7B-Chat-function-calling-GGUF
- https://huggingface.co/mradermacher/Vistral-7B-iSMART-GGUF
- https://huggingface.co/nguyenviet/PhoGPT-7B5-Instruct-GGUF
- https://huggingface.co/nguyenviet/PhoGPT-4B-Chat-GGUF
- https://huggingface.co/buckets/huggingchat/papers-content/tree/2311/2311.02945.md
- https://ar5iv.labs.arxiv.org/html/2312.11011
- https://huggingface.co/LoneStriker/vinallama-7b-AWQ
- https://huggingface.co/blog/ariG23498/cohere-aya-expanse
- https://huggingface.co/jth01/aya-expanse-8b-5.0bpw-exl2
- https://huggingface.co/BlossomsAI/BloomVN-8B-chat/blob/main/README.md
- https://huggingface.co/vominhmanh/qwen3-4b-vihsd
- https://huggingface.co/LuvU4ever/qwen2.5-3b-qlora-merged-v2
- https://huggingface.co/models?other=vietnamese&p=6&sort=trending
- https://aclanthology.org/2024.acl-demos.pdf
- https://ui.adsabs.harvard.edu/abs/2025arXiv250405747N/abstract

**Third-party / contextual**
- https://mintlify.wiki/cheahjs/free-llm-api-resources/providers/free/huggingface
- https://github.com/raullenchai/free-llm-api-resources
- https://github.com/nejib1/Free-LLM/blob/ee5e93b10fe7de8f026864b76580b504b4fac148/README.md
- https://free-llm.com/provider/huggingface-inference
- https://klymentiev.com/blog/huggingface-inference-api
- https://comparedge.com/tools/hugging-face/pricing
- https://www.eesel.ai/blog/hugging-face-pricing
- https://www.heise.de/en/news/Hugging-Face-offers-serverless-inferences-by-third-parties-at-no-extra-cost-10261060.html
- https://techcrunch.com/2025/01/28/hugging-face-makes-it-easier-for-devs-to-run-ai-models-on-third-party-clouds/
- https://pydantic.dev/articles/hugging-face-inference-providers-in-pydantic-ai
- https://discuss.huggingface.co/t/about-membership-and-subscription/173746/2
- https://huggingface.co/spaces/toad-hf-inference-explorers/README/discussions/1
- https://huggingface.co/datasets/John6666/knowledge_base_md_for_rag_1/blob/main/hf_legacy_inference_api_to_inference_providers_20251114.md
- https://dev.to/build996/one-curl-shows-which-of-14-providers-actually-serves-your-hugging-face-model-17jf
