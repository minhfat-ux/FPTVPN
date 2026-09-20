# Free-tier LLM APIs for a Vietnamese-first production chat app (2026)

**Scope:** streaming chat + tool/function calling + vision (image-edit), Vietnamese-first, production use.
**Research method:** `web_search` only (no page fetch, no shell/network access).

---

## 0. Evidence-strength disclaimer — READ THIS FIRST

This research ran in a restricted environment. The `web_search` tool returned **source URL lists plus, in some cases, content-derived result titles** — it did **not** return full page bodies for most queries.

Therefore:

* A number is marked **✅ confirmed** only when the number itself appeared in a search result I actually received (usually inside the result title, which for `raw.githubusercontent.com` and some doc pages is derived from page content).
* Numbers that are commonly known but which I **could not confirm** from a source found here are marked **⛔ unverified**, with the closest URL, exactly as instructed.
* Values resting on a single third-party blog/aggregator rather than a vendor doc are marked **🟡 weak**.

Legend: ✅ confirmed by a source found here · 🟡 single/weak or third-party source · ⛔ unverified (closest URL given) · ❌ no source found.

**Do not ship capacity planning off any ⛔ or 🟡 cell.**

---

## 1. Master comparison table

| Provider | Free quota | Rate limits (free) | Context | Tool calling | Vision | Commercial-use ToS | Vietnamese quality notes | Paid $/1M in+out |
|---|---|---|---|---|---|---|---|---|
| **Groq** (`console.groq.com`) | Free tier exists; the 14,400 RPD figure is widely misquoted and **applies to non-chat models** ✅ [1] | ⛔ per-model RPM/RPD/TPM/TPD not confirmed. Only free-tier hint found: **6,000 TPM** 🟡 [2]. Official table: [3] | `llama-3.3-70b-versatile` = **131,072 ctx / 8,192 max out** 🟡 [4] | ✅ Supported incl. streaming, **but documented `tool_use_failed` / streaming parse failures** ✅ [5][6] | ✅ Llama 4 Scout (17Bx16E, 128k) vision on Groq ✅ [7][8] | ⚠️ Groq ToS contains a "Limited License and **Non-Commercial** Use Restriction" provision 🟡 [9] — **scope unverified, must read ToS before production** [10] | Qwen3 + Llama 4 family; Vietnamese not a first-class target, mid-tier | `$0.59 in / $0.79 out` for Llama-3.3-70B 🟡 [4]; band `$0.05–$3.00/M` ⛔ [11] |
| **Google AI Studio / Gemini API** | Free tier per-model; **2026 quota increase** — some models to ~1M TPM ✅ [12][13] | Seen for a free-tier flash-class model: **15 RPM · 1,000 RPD · 250k TPM** 🟡 [14][15]. Official table: [16] | 1M ctx (Flash class) ⛔ [17] | ✅ Supported, **but multiple streaming tool-call defects** ✅ [18][19][20] | ✅ Native; best-in-class for image-edit ✅ [21] | **Free tier: prompts ARE used to improve products / human review**; paid tier is not ✅ [22][23] — free tier is **not** suitable for production user data | Strongest Vietnamese of the closed models; long context + vision | `gemini-2.5-flash`: **$0.30 in / $2.50 out** ✅ [24]; audio in $1.00, cache read $0.03 ✅ [24][25]. Flash-Lite ⛔ [26] |
| **Cerebras** (`cloud.cerebras.ai`) | **1M tokens/day free** ✅ [27][28] | ⛔ RPM/TPM not confirmed. Closest: [29][30] | ⛔ not confirmed. Closest: [31] | ⛔ not confirmed (OpenAI-compatible chat format exists) 🟡 [31] | ❌ no free-tier vision confirm | ⛔ unverified (EULA [32], ToS index [33]) | Serves Qwen3/Llama class ⛔ [34]; Vietnamese = base-model quality | ⛔ unverified; closest [29][35] |
| **Cloudflare Workers AI** | **10,000 Neurons/day** ✅ [36]; billed at **$0.011 / 1,000 Neurons** ✅ [37] | Neuron-metered daily cap ✅ [36] | ⛔ per-model; Llama-3.3-70B-fp8-fast served ⛔ [38] | ✅ Function-calling docs exist ✅ [39]; **real failure modes documented** ✅ [40][41] | ✅ (llava / image-to-text family) ⛔ [42] | ⛔ unverified; **note the Paid-plan gate below** | Qwen/Llama/Gemma/Mistral served; mid-tier Vietnamese | ⛔ per-model $/1M unverified; neurons rate is the metered unit ✅ [37] |
| **OpenRouter** (`:free` variants) | Free variants exist; **many free models do NOT support tool calling** ✅ [43] | ⛔ exact free RPM/RPD unconfirmed; **credit-linked gate is real** — community reports a **$10 credit** threshold before some free models unlock 🟡 [44]. Official FAQ [45] | Per-model ⛔ | ❌ **Frequently fails on `:free`** (HTTP 404 "tool calling not supported") ✅ [43] | Per-model ⛔ | Privacy/data-policy must be enabled in account settings ⛔ [46] | Free pool rotates; Qwen3-Coder was free ✅ [47] | ⛔ `google/gemini-2.5-flash` and Qwen $/1M unverified; closest [48][49] |
| **Together AI** | **Free trial appears GONE as of Aug 2026** — "requires a minimum $5 credit purchase, no advertised free trial" 🟡 [50] | n/a (paid) | ⛔ | ⛔ | ⛔ | ⛔ | Qwen3/Llama served | ⛔ Qwen3-32B / Llama-3.3-70B $/1M unverified |
| **Fireworks AI** | Free tier page exists 🟡 [51] | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | — | Band quoted as `Free–$9 per million tokens` 🟡 [52] |
| **DeepInfra** | ⛔ no signup-credit confirmation found | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | — | `Qwen3-32B` pricing pages exist ✅ [53][54]; **numbers not captured** ⛔ |
| **Novita** | Company itself publishes that free keys exist but "not all stay free" ✅ [55][56] | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | — | ⛔ |
| **Hyperbolic** | ❌ nothing found beyond a discounts page [57] | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | — | ⛔ |
| **Mistral La Plateforme (Experiment free tier)** | **~1B tokens/month free mode, all models, phone verification required** 🟡 [58][59] | ⛔ "1 req/sec" **not confirmed**; per-model matrix exists ✅ [60] | ⛔ | ⛔ | Pixtral exists, **not confirmed on free tier** ⛔ | Free-tier commercial use **not confirmed**; generic analysis says free/trial keys ban production use 🟡 [61] | Mistral Small 3.x / Ministral ✅ [62]; weak-to-mid on Vietnamese | ⛔ Small 3.2 / Ministral $/1M unverified [63] |
| **GitHub Models** | Free tier with **per-model-tier rate limits** ✅ (tiers exist) [64] | ⛔ exact RPD/token numbers unconfirmed; community thread is the reference ✅ [64] | ⛔ | ⛔ (OpenAI-compatible, so likely yes) | ⛔ | ⛔ — see "Responsible use" doc ✅ [65] | Multi-vendor catalog incl. Mistral/Llama ✅ [66] | **2026: GitHub Models migrating to Microsoft Foundry** ✅ [67] — **plan for this** |
| **Ollama / local** | "Free" = you own the GPU | n/a | Qwen3-8B/14B ⛔ [68]; Qwen3-30B-A3B = **18.6 GB @ Q4_K_M** 🟡 [69] | ✅ with caveats (model-dependent parsers) | Vision via separate models ⛔ | ✅ No vendor ToS; you are the operator | Qwen3 is the best open Vietnamese option 🟡 [70][71] | Qwen3-30B-A3B: **196 tok/s on RTX 4090** ✅ [72], **226 tok/s on RTX 5090** ✅ [73], ~**80 tok/s on RTX 4070 w/ CPU offload** ✅ [74]. Rental ⛔ $/hr unverified [75][76][77] |

---

## 2. Streaming + tool calls together — the verdict table

The axis that most often breaks in production, so it gets its own table.

| Provider | Streaming + tool calls together | Evidence |
|---|---|---|
| **Groq** | **⚠️ PARTIAL — works but breaks in the wild.** Documented `tool_use_failed` HTTP 400 errors, plus *"intermittent parsing failure with Groq streaming responses when using tools"*. 8B-class models hallucinate malformed JSON on nested schemas; a common mitigation is flattening tool schemas to a flat `list[str]`. | ✅ [5][6][78] |
| **Gemini** | **⚠️ PARTIAL — multiple concrete defects.** `finish_reason` returns `stop` instead of `tool_calls` on the OpenAI-compatible endpoint; malformed function-call handling in SSE streams; a Vercel AI SDK changeset specifically for the no-args streaming tool call. | ✅ [18][19][20] |
| **Cerebras** | **❓ UNVERIFIED.** OpenAI-compatible chat-completions format documented, but **no** source found testifying streaming tool calls work. Treat as unknown. | 🟡 [31] |
| **Cloudflare Workers AI** | **⚠️ PARTIAL.** Function calling documented **and** there is a dedicated troubleshooting page; plus agent tool calls rejected by the Workers AI schema, and a websocket error on long tool-call responses. | ✅ [39][40][41] |
| **OpenRouter `:free`** | **❌ FAILS on many free models** — HTTP 404 `tool calling not supported on :free tier`. Free endpoints also break silently and need a fallback layer. | ✅ [43][79] |
| **Mistral** | **❓ UNVERIFIED** here. | ⛔ |
| **GitHub Models** | **❓ UNVERIFIED** here. | ⛔ |
| **Together / Fireworks / DeepInfra / Novita / Hyperbolic** | **❓ UNVERIFIED** here for all five. | ⛔ |
| **Ollama / local** | **✅ generally OK** (OpenAI-compatible streaming + tools in recent llama.cpp/Ollama), but parser quality varies per model family. Not confirmed by a source in this session. | ⛔ |

**Practical read:** the two providers with the best Vietnamese+vision+context story (Gemini, Groq) are *also* the two with the most documented streaming-tool-call defects. Budget for a streaming tool-call shim (buffer-and-parse; fall back to non-streaming on tool turns) regardless of vendor.

---

## 3. Provider notes

### 3.1 Groq
* Authoritative pages to confirm every free number in one pass: rate limits [3], models [80].
* **The 14,400/day number is a trap.** A dev.to write-up is explicitly titled *"Groq's 14,400 requests a day is not for the chat models"* ✅ [1] — that quota class applies to non-chat endpoints. Do not plan chat capacity on it.
* Free-tier token hint: **6,000 TPM** appears in a Groq course page title 🟡 [2]. **Per-model RPM/RPD/TPM/TPD for chat models: ⛔ unverified.**
* Paid: `llama-3.3-70b-versatile` = **$0.59/M in, $0.79/M out**, 131,072 ctx, 8,192 max output 🟡 [4]. Aggregate band `$0.05–$3.00/M` ⛔ [11].
* Vision: **Llama 4 Scout (17Bx16E, 128k) is served on Groq** ✅ [7]; LangChain added Groq vision support ✅ [8].
* ToS: a "Limited License and Non-Commercial Use Restriction" provision is indexed against the Groq Terms of Use 🟡 [9]. **I could not confirm whether this binds the free API tier for a commercial chat app.** Read [10] and the services agreement [81] before launch — this is the single biggest unresolved legal question in this report.

### 3.2 Google AI Studio / Gemini API
* **2026 quota expansion confirmed**: Google raised free Gemini API quotas, some models reaching ~1M TPM ✅ [12][13]. Any 2024–2025 blog table you find is stale.
* Free-tier row captured: **15 RPM · 1,000 RPD · 250k TPM**, paired in a second source with "Gemini 2.5 Flash-Lite" 🟡 [14][15]. **Attribution is my inference, not a confirmed vendor statement** — confirm at [16].
* **Vision + tool calling**: strongest of the free tiers for both; the image-edit use case is a strong fit ✅ [21].
* **Commercial/terms — critical**: Google's additional terms distinguish paid from unpaid; the paid-services commitment ("Google doesn't use your prompts") does **not** cover the free tier ✅ [22][23]. Free-tier prompts are used to improve products and may be human-reviewed. **For a production Vietnamese chat app carrying real user messages, the Gemini free tier is a data-protection problem, not merely a capacity problem.**
* Paid: `gemini-2.5-flash` = **$0.30/M in (text/image/video), $2.50/M out, $1.00/M audio in, $0.03/M cache read** ✅ [24][25]. **Flash-Lite pricing ⛔ unverified** — closest [26], official page [82].
* Landscape note: Gemini **3.x** is current in 2026 (`gemini-3.1-pro-preview` at `$2.00/$12.00` per M with `$0.20` cache) ✅ [83], so 2.5 Flash is now a *cheap-tier* model — this changes the price/quality comparison.

### 3.3 Cerebras
* **Free tier = 1M tokens/day** ✅ [27][28] — the headline, and it is real.
* Throughput in the same source: **~2,600 tok/s on Llama 4 Scout** ✅ [27].
* **RPM / TPM: ⛔ unverified.** Closest: [29][30].
* **Per-token paid pricing: ⛔ unverified** — closest [29][35]. Beware aggregator pages that mix model generations (e.g. an unverified-looking "Gemma 4 31B $0.99 vs $2.15" page [84]).
* Models: Llama 4 Scout ✅ [27]; gpt-oss-120b served ⚠️ [34].
* ToS / commercial use: ⛔ unverified — EULA [32], ToS index [33].
* **Streaming + tool calls: unknown** — the biggest gap for this provider, which is otherwise an excellent free-tier fit.

### 3.4 Cloudflare Workers AI
* **Free allocation: 10,000 Neurons/day** ✅ [36]. Billing unit: **$0.011 per 1,000 Neurons** ✅ [37].
* **The 2026 changelog you asked about exists**: *"Select models now require the Workers Paid plan"*, 2026-07-28 ✅ [85]. Also unified Workers AI + AI Gateway billing (2026-08-07) ✅ [86], and a June 2026 pricing change ✅ [87]. **Net: the free tier did not vanish, but the free model catalog shrank.** Verify the specific models your app needs are still free.
* New models keep landing (GLM-5.3 Flash, 2026-08-26) ✅ [88].
* **Per-model $/1M: ⛔ unverified** — the neuron rate is the real meter.
* **Streaming tool calls: partial** — documented function calling ✅ [39] with a troubleshooting page ✅ [39], but schema-rejection bugs ✅ [40] and long-tool-call websocket failures ✅ [41].

### 3.5 OpenRouter
* **`:free` tool calling is the dealbreaker**: a real bug report documents `HTTP 404: tool calling not supported on :free tier` ✅ [43]. **Capability-check every `:free` model for tools before routing production traffic to it.**
* **Credit-linked gate is real**, exact rule ⛔ unverified here: community reports describe a **$10 credit** threshold before free access to some premium free models 🟡 [44]. Official FAQ [45] is the authority.
* Free endpoints are **flaky by design**: a developer documented building a fallback system after the free API "silently broke" ✅ [79]. Treat `:free` as best-effort, never as capacity.
* Qwen3-Coder was available free ✅ [47]; OpenRouter also runs an `openrouter/free` router ⚠️ [89].
* **Privacy/data-policy requirement**: ⛔ unverified — closest evidence is a config note that the app does not send a data-collection preference [46]. Confirm in account settings before production.
* **`google/gemini-2.5-flash` and Qwen $/1M: ⛔ unverified** — closest usable dataset [48], official blog [49].

### 3.6 Together AI, Fireworks AI, DeepInfra, Novita, Hyperbolic
* **Together AI**: as of **August 2026**, reportedly **requires a minimum $5 credit purchase and offers no advertised free trial** 🟡 [50]. Single third-party review — confirm against official billing docs [90]. **Plan on Together not being a free option.**
* **Fireworks AI**: a free-tier page exists 🟡 [51]; price band quoted as `Free–$9 per million tokens` 🟡 [52]. Nothing else confirmed.
* **DeepInfra**: `Qwen3-32B` model and pricing pages exist ✅ [53][54] but **no number was captured** ⛔.
* **Novita**: Novita's own blog argues free open-source LLM keys exist in 2026 **but not all stay free** ✅ [55][56] — useful as a *warning* source, not a quota source.
* **Hyperbolic**: ❌ nothing usable found; closest [57].
* **Base-rate evidence that free credits evaporate**: a free-tier reference table records GLHF Chat ending its free beta in January 2025 ✅ [91]. Assume any signup credit here is transient; design for provider swap.

### 3.7 Mistral La Plateforme ("Experiment" free tier)
* The **~1B tokens/month + phone verification** claim is confirmed only by a third-party project README 🟡 [58], corroborated by an aggregator page 🟡 [59] and a French article on the free tier 🟡 [92].
* **"1 request/second" is ⛔ unverified.** A per-model rate-limit/pricing matrix does exist and was updated July 2026 ✅ [60] — use it to confirm.
* Models: Mistral Small 3.x and Ministral are current ✅ [62] — good cheap workhorses, modest Vietnamese.
* **Commercial use on the free tier: ⛔ unverified.** Generic analysis of free/trial AI API keys states trial keys ban production/commercial use 🟡 [61] — **do not assume Mistral's free tier is production-legal.**
* Vision (Pixtral): exists in the product line but **⛔ not confirmed as available on the free tier**.
* Paid $/1M: ⛔ unverified — closest [63][93].

### 3.8 GitHub Models
* A **tiered rate-limit system** exists ✅ [64] — but **exact RPD / token numbers per tier are ⛔ unverified here.** The community discussion [64] is the practical reference; official docs are the authority.
* Catalog spans multiple vendors incl. Mistral and Llama ✅ [66]; setup is OpenAI-compatible via a GitHub PAT ✅ [94].
* Responsible-use doc ✅ [65] — read it for acceptable-use constraints.
* **Forward-looking 2026 risk**: GitHub Models is being **migrated to Microsoft Foundry** ✅ [67]. Put the integration behind an adapter; this endpoint's long-term shape is changing.

### 3.9 Ollama / local self-host

**VRAM / RAM**
* **Qwen3-30B-A3B (MoE, 3B active): 18.6 GB at Q4_K_M** 🟡 [69]. That is the sweet spot for a single 24 GB card (RTX 3090/4090) with headroom for KV cache at moderate context.
* **Qwen3-8B / 14B: ⛔ unverified here** — closest [68], plus a 14B GPU-picker page [95].
  *Rule of thumb to verify, not a sourced number:* Q4_K_M ≈ 0.6 GB per billion params + KV cache + ~1 GB overhead → 8B ≈ 6–7 GB, 14B ≈ 10–11 GB.
* MoE is why 30B-A3B is attractive: 30B-class quality at 3B-active decode cost.

**Throughput (sourced)**
* Qwen3-30B-A3B: **196 tok/s on RTX 4090** ✅ [72]; **226 tok/s on RTX 5090** ✅ [73]; **~80 tok/s on RTX 4070 with CPU offload** ✅ [74].

**Real cost floor**
* GPU rental comparisons found: [75] (54 providers ranked, 2026), [76] (April 2026), [77] (Lambda vs Vast.ai, May 2026), RunPod cost notes [96], plus a **machine-readable runpod/lambda price snapshot** ✅ [97] — the best single artifact for confirming $/hr.
* **$/hr numbers: ⛔ unverified in this session.** I will not invent them. The arithmetic you need: `$/hr ÷ (tok/s × 3600) × 1e6` = effective $/M output tokens — at 196 tok/s a $0.40/hr GPU yields roughly **$0.57/M output tokens if perfectly saturated**, which for a bursty chat app is optimistic by a large factor.
* **Verdict:** compare that floor against `gemini-2.5-flash` at **$2.50/M out** ✅ [24] and Groq Llama-3.3-70B at **$0.79/M out** 🟡 [4]. Local wins only at high, steady utilization; for a bursty Vietnamese chat app a metered API is usually cheaper than an idle rented GPU, and local gives you no vision quality comparable to Gemini.

---

## 4. Vietnamese-specific notes

Sourced evidence is at benchmark level rather than "which model to pick":

* **Multilingual benchmark with a per-language table covering LLAMA-3.1 8B, LLAMA-3.3 70B, Qwen-3 8B, Qwen-3 14B, GEMMA-3 27B** ✅ [70] — the most directly useful comparison artifact found. It is a PDF and I could not read the table body, so **the actual rankings are ⛔ unverified**.
* **MuBench (61 languages)**: *"Among open models, Qwen demonstrates strong and consistent performance across a wide range of tasks"* ✅ [71] — supports using **Qwen3** as the Vietnamese open-weight default, and therefore a **Cerebras / Cloudflare / DeepInfra Qwen route** over Llama.
* **VMLU** — the standard Vietnamese benchmark toolkit ✅ [98]. Use it; do not trust vendor marketing for Vietnamese.
* **VNFinEval** — Vietnamese finance benchmark ✅ [99]; relevant if you serve a Vietnamese finance vertical.
* **Vietnamese reasoning in under-resourced languages (LREC 2026)** ✅ [100] — expect a real reasoning gap even for strong multilingual models; plus an academic survey of Vietnamese LLM finetuning/evaluation ✅ [101].
* **Practical implication:** Vietnamese is *not* well served by the small/fast tier of most providers. Your cost model should assume **70B-class or Gemini-2.5-Flash-class** quality for Vietnamese, which pushes you off the cheapest free quotas.
* **No provider in this session advertises Vietnamese as a supported/optimized language on its free tier.**

---

## 5. Recommended shape for this app (given the evidence)

1. **Do not run any free tier as production capacity.** Gemini's free tier uses prompts for product improvement ✅ [22][23]; Groq's ToS carries a non-commercial clause 🟡 [9]; OpenRouter `:free` frequently lacks tool calling ✅ [43]; free credits elsewhere are evaporating ✅ [50][91].
2. **Primary: paid Gemini 2.5 Flash** ($0.30/$2.50 per M ✅ [24]) — the only option simultaneously strong at Vietnamese, native at vision for image-edit, and with a real tool-calling story; caveat: its OpenAI-compatible streaming tool calls need a shim ✅ [18][19][20].
3. **Secondary/cheap: Groq Llama-3.3-70B** ($0.59/$0.79 🟡 [4]) with flattened tool schemas to dodge `tool_use_failed` ✅ [5][78].
4. **Free tier: dev/eval only** — Cerebras 1M tok/day ✅ [27] and Cloudflare 10k Neurons/day ✅ [36], behind a provider adapter, never on the user-data path.
5. **Build the adapter layer now.** Model catalogs changed materially in 2026 at Cloudflare ✅ [85][86], GitHub Models ✅ [67], and Gemini ✅ [12][13].

---

## 6. Explicit gap list (what to confirm with page access)

* Groq free-tier RPM / RPD / TPM / TPD per chat model → [3]
* Cerebras RPM / TPM / context / per-model paid $/1M → [29][31]
* Cloudflare per-model $/1M and current free-model list → [37][85]
* OpenRouter exact `:free` RPM/RPD and the exact credit-threshold rule → [45]
* Gemini 2.5 Flash-Lite free limits and pricing → [16][82]
* Mistral free-tier exact rate limit ("1 req/sec"?) and commercial-use permission → [60]
* GitHub Models per-tier RPD/token numbers → [64]
* Together / Fireworks / DeepInfra / Novita / Hyperbolic current signup credits and Qwen3-32B / Llama-3.3-70B $/1M → [90][51][53][55][57]
* GPU rental $/hr for RunPod / Lambda / Vast → [97]

---

## 7. Source URLs

1. https://dev.to/build996/groqs-14400-requests-a-day-is-not-for-the-chat-models-1m12
2. https://theneuralbase.com/groq/learn/beginner/rate-limit-6000-tpm-free-tier/
3. https://console.groq.com/docs/rate-limits
4. https://github.com/gumieri/nenya/blob/main/docs/CONFIGURATION.md
5. https://stackoverflow.com/questions/79907528/why-does-groq-langchain-model-return-tool-use-failed-error
6. https://github.com/davidmigloz/langchain_dart/issues/741
7. https://langmart.ai/model-docs/models/groq_llama-4-scout-17bx16e-128k.html
8. https://github.com/langchain-ai/langchain/pull/34620
9. https://conductatlas.com/platform/groq/groq-terms-of-use/provision/CA-P-010022/limited-license-and-non-commercial-use-restriction/
10. https://groq.com/terms-of-use
11. https://costbench.com/software/llm-api-providers/groq/
12. https://www.appinn.com/google-increases-free-gemini-api-quota-1m-tokens/
13. https://www.kucoin.com/news/flash/google-boosts-gemini-api-free-quotas-some-models-reach-1m-tpm
14. https://raw.githubusercontent.com/talirezun/the-curator/12b7f1544ba64819e644ba1cf92541a0bbcf9895/docs/user-guide.md
15. https://raw.githubusercontent.com/api-evangelist/google/refs/heads/main/apis.yml
16. https://ai.google.dev/gemini-api/docs/rate-limits
17. https://developers.googleblog.com/en/gemini-25-flash-lite-is-now-stable-and-generally-available/
18. https://discuss.ai.google.dev/t/the-finish-reason-is-stop-instead-of-tool-calls-in-openai-compatible-endpoint/112704
19. https://raw.githubusercontent.com/vercel/ai/83877a1e9cb30a7620b0b20e62e6b324cfbbbc3d/.changeset/google-no-args-streaming-tool-call.md
20. https://github.com/diegosouzapw/OmniRoute/commit/4ea08f520bfb81dbd02173ff582acaffc76fb0ec
21. https://playground.roboflow.com/models/compare/gemini-2-5-flash-vs-gemini-2-5-flash-lite
22. https://ai.google.dev/gemini-api/terms
23. https://simonwillison.net/2024/Oct/17/gemini-terms-of-service/
24. https://github.com/langfuse/langfuse/pull/15437
25. https://github.com/langfuse/langfuse/pull/16335
26. https://crazyrouter.com/en/blog/gemini-2-5-flash-lite-pricing
27. https://adam.holter.com/cerebras-opens-a-free-1m-tokens-per-day-inference-tier-and-ccerebras-now-offers-free-inference-with-1m-tokens-per-day-real-speed-benchmarks-show-2600-tokens-sec-on-llama4scout-here-are-the-actual-n/
28. https://pricepertoken.com/endpoints/cerebras/free
29. https://www.morphllm.com/cerebras-pricing
30. https://theneuralbase.com/cerebras/learn/intermediate/free-tier-allocation/
31. https://theneuralbase.com/cerebras/learn/beginner/chat-completions-format/
32. https://cerebras.net/wp-content/uploads/2021/10/cerebras-software-eula.pdf
33. https://conductatlas.com/platform/cerebras/cerebras-terms-of-service/
34. https://www.ayautomate.com/free-models/cerebras-gpt-oss-120b
35. https://free-llm.com/provider/cerebras
36. https://raw.githubusercontent.com/diegosouzapw/OmniRoute/main/docs/i18n/th/README.md
37. https://developers.cloudflare.com/workers-ai/platform/pricing/
38. https://pi.dev/models/cloudflare-ai-gateway/workers-ai-cf-meta-llama-3-3-70b-instruct-fp8-fast
39. https://developers.cloudflare.com/workers-ai/function-calling/embedded/troubleshooting/
40. https://github.com/devoxx/DevoxxGenieIDEAPlugin/pull/1262
41. https://github.com/cloudflare/agents/issues/119
42. https://developers.cloudflare.com/workers-ai/models/
43. https://github.com/NousResearch/hermes-agent/issues/49983
44. https://linux.do/t/topic/569697
45. https://openrouter.ai/docs/faq
46. https://raw.githubusercontent.com/talirezun/the-curator/37fbd22c5b778b96395d295cbd73a6ae95020c52/docs/model-lifecycle.md
47. https://inventivehq.com/blog/qwen-code-free-openrouter-cline
48. https://huggingface.co/datasets/danielrosehill/Open-Router-API-Pricing-Analysis
49. https://openrouter.ai/blog/tutorials/free-llm-apis-compared/
50. https://yourtechcompass.com/together-ai-review-2026/
51. https://pricepertoken.com/endpoints/fireworks/free
52. https://costbench.com/software/llm-api-providers/fireworks-ai/
53. https://deepinfra.com/Qwen/Qwen3-32B
54. https://pricepertoken.com/pricing-page/model/qwen-qwen3-32b
55. https://blogs.novita.ai/are-there-any-open-source-llm-api-keys-available/
56. https://blogs.novita.ai/free-llm-api-comparison-2026/
57. https://costbench.com/software/ai-gpu-cloud/hyperbolic/discounts/
58. https://raw.githubusercontent.com/zeeyado/koassistant.koplugin/main/README.md
59. https://pricepertoken.com/endpoints/mistral/free
60. http://rapidevelopers.com/ai-api-limits-performance-matrix/mistral-large
61. https://ai-keiei.shift-ai.co.jp/generative-ai-api-free/
62. https://futureagi.com/llm-cost-calculator/mistral/mistral-small-3-2-2506/
63. https://cloudprice.net/models/mistral-small-3-1-24b-instruct
64. https://github.com/orgs/community/discussions/137298
65. https://docs.github.com/en/github-models/responsible-use-of-github-models
66. https://github.com/danielmiessler/Fabric/blob/main/docs/GitHub-Models-Setup.md
67. https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/how-to/quickstart-github-models
68. https://www.hardware-corner.net/guides/qwen3-hardware-requirements/
69. https://willitrunai.com/models/qwen-3-30b-a3b
70. https://arxiv.org/pdf/2509.13930v3
71. https://ar5iv.labs.arxiv.org/html/2506.19468
72. https://dev.to/jovan_chan_9500711396d4e6/qwen3-30b-a3b-local-ai-guide-196-toks-on-one-rtx-4090-and-what-moe-means-for-your-gpu-33ng
73. https://smeltcore.com/recipes/qwen3-30b-a3b-rtx-5090/
74. https://smeltcore.com/recipes/qwen3-35b-moe-on-rtx-4070-80-tok-s-local-llm-guide/
75. https://gputracker.dev/blog/cheapest-gpu-cloud-2026
76. https://awesomeagents.ai/pricing/gpu-rental-pricing/
77. https://gputracker.dev/provider/lambda-labs/vs/vastai
78. https://huggingface.co/spaces/manitejeswar/project-webagent/commit/b903c7d4cce1d941d1a112c8ce2926d39e086b5b
79. https://dev.to/hamimelon2026_40bd96eff01/i-built-a-fallback-system-for-openrouters-free-api-after-it-silently-broke-3hdp
80. https://console.groq.com/docs/models
81. https://console.groq.com/docs/legal/services-agreement
82. https://ai.google.dev/gemini-api/docs/pricing
83. https://raw.githubusercontent.com/vxcontrol/pentagi/main/README.md
84. https://ecorpit.com/cerebras-inference-docs-price-fork-gemma-4-31b-cache-tpm-ceiling-2026/
85. https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/
86. https://developers.cloudflare.com/changelog/post/2026-08-07-workers-ai-unified-billing/
87. https://www.pravinkumar.co/blog/cloudflare-workers-ai-pricing-webflow-edge-june-2026
88. https://developers.cloudflare.com/changelog/post/2026-08-26-glm-5.3-flash-workers-ai/
89. https://archestra.ai/docs/platform-supported-llm-providers
90. https://docs.together.ai/docs/billing-credits
91. https://github.com/diegosouzapw/OmniRoute/commit/7abb40c64c5866309dfcd9800f597aeb17a2e611
92. https://www.silicon.fr/Thematique/data-ia-1372/Breves/Un-niveau-gratuit-sur-l-API-Mistral-AI-463649.htm
93. https://pricepertoken.com/token-counter/provider/mistral-ai
94. https://github.com/danielmiessler/Fabric/blob/main/docs/GitHub-Models-Setup.md
95. https://specpicks.com/reviews/best-gpu-for-qwen-3-14b
96. https://github.com/ericrisco/rsc-harness/blob/main/skills/runpod/references/cost-and-scaling.md
97. https://huggingface.co/datasets/tensorfeed/ai-ecosystem-daily/blob/main/2026-05-29/gpu-pricing.jsonl
98. https://aclanthology.org/2025.acl-long.563.pdf
99. https://ieeexplore.ieee.org/document/11594251
100. http://www.lrec-conf.org/proceedings/lrec2026/workshops/sigul/pdf/2026.sigul-1.1.pdf
101. https://preview.aclanthology.org/revert-3132-ingestion-checklist/2024.findings-naacl.182.pdf
