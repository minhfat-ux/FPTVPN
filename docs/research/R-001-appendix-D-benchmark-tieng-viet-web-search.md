<!--
  PHỤ LỤC THÔ — KHÔNG PHẢI KẾT LUẬN
  Báo cáo của một lượt nghiên cứu độc lập chỉ dùng web_search (không fetch được trang, không parse được PDF),
  giữ nguyên tiếng Anh và cách tự đánh dấu của tác giả.
  Mọi mục "not found" / chưa xác minh KHÔNG được dùng để ra quyết định.
  Kết luận chính thức của F-001 nằm ở R-001-free-llm-va-chi-phi-model.md.
  Phụ lục này CHỈ nói về benchmark tiếng Việt — phần R-001 chưa khảo sát.
-->

# PHỤ LỤC R-001-D — Benchmark tiếng Việt: open model so với model đóng (nguồn thô, tiếng Anh)

| | |
|---|---|
| **Thuộc nghiên cứu** | R-001 |
| **Feature** | **F-001 — Chi phí model / LLM giá rẻ–miễn phí cho fBuddy** (phần: chất lượng tiếng Việt) |
| **Loại tài liệu** | Phụ lục "nguồn thô" — đầu vào tham khảo, **không phải kết luận** |
| **Ngày** | 20/09/2026 |
| **Điểm yếu đã biết** | Chỉ có `web_search` (danh sách URL + snippet, không có nội dung trang) ⇒ **không lấy được bảng xếp hạng VMLU** |
| **Giá trị chính** | Xác định **chính xác cái gì chưa biết** + danh sách URL cần fetch để lấy số thật |

## Đính chính trước khi đọc

| Nội dung trong phụ lục | Trạng thái |
|---|---|
| "58 subjects" cho VMLU (xuất hiện trong bản nháp trước của lượt khảo sát này) | **KHÔNG được xác nhận.** Phụ lục này kết luận số chủ đề là **not found**. Chỉ con số **10.880 câu hỏi** là có nguồn. |
| `vmlu.org` | **Không tồn tại trong kết quả tìm kiếm.** Site thật là **`vmlu.ai`** |
| Bảng xếp hạng VMLU theo từng model | **KHÔNG lấy được** — đây là lỗ hổng lớn nhất. Các URL nắm số thật ở §4 cuối phụ lục |
| Số liệu VM14K (Gemini 2.0 Flash vs Qwen3-32B) | Dùng được làm **chỉ báo hướng**, không phải kết luận: lưu ý đây là **Gemini 2.0** Flash, không phải 2.5 |

---

# Vietnamese benchmarks for open-weight LLMs vs closed models (Gemini 2.5 Flash / GPT-4o)

**Retrieval constraint (read first).** This research was performed with the `web_search` tool **only** — no shell and no network client, so **no page was ever opened and no PDF table was parsed**. Everything below is limited to *text that appeared inside search-result snippets or result titles*. Where a snippet exposed a table row, the numbers are quoted verbatim. Where it did not, the entry says **not found** and cites the nearest URL that should contain it. Column semantics of many quoted rows could **not** be verified (header row was outside the snippet), and this is flagged per row. Nothing here is recalled from memory or inferred.

Environment note: several indexed sources are dated **2026** (arXiv IDs `2512.*`, `2601.*`, `2602.*`, `2603.*`, `2604.*`, `2606.*`; ACL/ICML/LREC 2026), consistent with a current date around September 2026. "2025–2026" coverage below therefore includes what a 2025-only search would miss.

---

## 1. VMLU (Vietnamese Multitask Language Understanding)

### 1.1 Construction — what I could verify

| Fact | Value | Source |
|---|---|---|
| Benchmark name / purpose | VMLU — "a benchmark suite tailored for evaluating foundation models in the Vietnamese language" | [VinaLLaMA paper, ar5iv 2312.11011](https://ar5iv.labs.arxiv.org/html/2312.11011) |
| **Number of questions** | **10,880 multiple-choice questions** ("comprises 10,880 multiple…") | [ar5iv 2312.11011](https://ar5iv.labs.arxiv.org/html/2312.11011) |
| Number of subjects | **not found** (no snippet stated a subject count; "58 subjects" was *not* corroborated) | nearest: [VMLU Benchmarks, ACL 2025](https://aclanthology.org/2025.acl-long.563.pdf) |
| Human baseline | **not found** for VMLU. The only snippet about a per-category human baseline came from an unrelated paper (AGIEval-style: "A test with different groups of humans was performed to determine a human baseline per category of questions") — **do not attribute this to VMLU** | [arXiv 2305.11991](http://arxiv.org/pdf/2305.11991) |
| Peer-reviewed paper | **VMLU Benchmarks: A comprehensive benchmark toolkit for Vietnamese LLMs** — ACL 2025 Long Papers (paper #563) | [aclanthology.org/2025.acl-long.563](https://aclanthology.org/2025.acl-long.563/) · [PDF](https://aclanthology.org/2025.acl-long.563.pdf) · [Semantic Scholar record](https://www.semanticscholar.org/paper/77184b8fc9955b021b9d6329846fbdd071b14434) |
| Authors | indexed as *Bui, Son, Cuc Thi Bui, Hoang Anh Le* (ACL anthology author pages) | [Hoang Anh Le (ACL)](https://aclanthology.org/people/hoang-anh-le/unverified/#abstract-2025--acl-long--563) · [Cuc Thi Bui (ACL)](https://aclanthology.org/people/cuc-thi-bui/unverified/#abstract-2025--acl-long--563) |
| Official site seen in results | **vmlu.ai** ("Contact Us") — the URL `vmlu.org` from the brief **did not appear** in any result | [https://vmlu.ai/](https://vmlu.ai/) |
| Maintainers / governance | Zalo AI + JAIST jointly released a new version of VMLU as a Vietnamese-capability standard for LLMs | [ngheandost.gov.vn announcement](http://ngheandost.gov.vn/chuyen-doi-so/zalo-ai-va-jaist-ra-mat-phien-ban-moi-cua-vmlu-bo-tieu-chuan-danh-gia-nang-luc-tieng-viet-cho-mo-hinh-ngon-ngu-lon-9594.html) · [vietnam.vn (EN)](https://www.vietnam.vn/en/zalo-ai-va-vien-jaist-dong-hanh-cung-cong-dong-phat-trien-llm-bac-cao) · [Zalo post](https://zalo.me/en/post/kiki-vmlu/) |
| Code / data mirrors seen | `Taishi-N324/VMLU` (GitHub); HF datasets `tridm/VMLU`, `nluai/dataset_VMLU_for_bloom` | [github.com/Taishi-N324/VMLU](https://github.com/Taishi-N324/VMLU/) · [tridm/VMLU](https://huggingface.co/datasets/tridm/VMLU) · [nluai/dataset_VMLU_for_bloom](https://huggingface.co/datasets/nluai/dataset_VMLU_for_bloom) |
| Used as a decoder baseline in other work | "We use Vistral-7B-Chat [36] and vmlu-llm…" | [KU Leuven Lirias PDF](https://lirias.kuleuven.be/retrieve/b1a0f26f-28dd-46ff-9ccc-d8d982e9e70c) |

### 1.2 VMLU leaderboard scores — **not found**

**This is the single biggest gap in this report.** Across ~50 queries (including Vietnamese-language queries, site-targeted queries, and "number-fishing" queries for specific candidate scores such as `VMLU 49.19`, `Vistral 31.59`, `VMLU 51.5`, `VMLU SeaLLM 43`), **no VMLU score for any model — open or closed — surfaced in a snippet**. Queries that named a candidate number returned only the same generic VMLU pages, i.e. the numbers were **not corroborated**, and are deliberately omitted here.

Nearest URLs that certainly hold the leaderboard but whose contents I could not read:

| Source | URL | Why it matters |
|---|---|---|
| VMLU official site | [https://vmlu.ai/](https://vmlu.ai/) | Live leaderboard |
| VTV news, 14 Jan 2025 — "Mô hình ngôn ngữ lớn do người Việt huấn luyện bứt phá trên bảng xếp hạng VMLU" (Vietnamese-trained LLMs break through on the VMLU leaderboard) | [vtv.vn article](https://vtv.vn/cong-nghe/mo-hinh-ngon-ngu-lon-do-nguoi-viet-huan-luyen-but-pha-tren-bang-xep-hang-vmlu-20250114084757555.htm) · [print version](https://vtv.vn/print/cong-nghe/mo-hinh-ngon-ngu-lon-do-nguoi-viet-huan-luyen-but-pha-tren-bang-xep-hang-vmlu-20250114084757555.htm) · [1thegioi mirror](https://1thegioi.vn/print/228121.html) | Vietnamese-press article whose headline is explicitly about VMLU ranking movements; almost certainly quotes scores |
| vnExpress — "AI Việt so khả năng xử lý ngôn ngữ tiếng Việt với GPT-4, Llama" | [vnexpress.net](https://vnexpress.net/ai-viet-so-kha-nang-xu-ly-ngon-ngu-tieng-viet-voi-gpt-4-llama-4841667.html) · [techmart mirror](https://techmart.vista.gov.vn/ai-viet-so-kha-nang-xu-ly-ngon-ngu-tieng-viet-voi-gpt-4-llama-18910.html) | Direct Vietnamese-model vs GPT-4 comparison |
| ACL 2025 VMLU toolkit paper (results section) | [PDF](https://aclanthology.org/2025.acl-long.563.pdf) | The paper's own model comparison table |
| Job/procurement doc that discusses VMLU as a shared comparison dataset (Vietnamese) | [tcvn.gov.vn AP112023.pdf](https://tcvn.gov.vn/wp-content/uploads/2024/02/AP112023.pdf) | Third-party description of VMLU's purpose |

**Bottom line for the brief's "open models scoring highest on VMLU" question: not found.** I cannot state which of Vistral / PhoGPT / SeaLLM / Qwen / Gemma / Llama / Sailor / VinaLLaMA / GPT-4o / Claude / Gemini 2.5 tops VMLU without a source I actually saw.

---

## 2. Other Vietnamese evaluations — concrete numbers I did see

All rows below are **verbatim snippet captures**. Unless the header is quoted alongside, treat column meaning as unverified.

### 2.1 ViExam / VMMU — Vietnamese multimodal exam benchmark (`arXiv 2508.13680`)
- Dataset size (verified): **2,548 questions across 7 domains** — [github.com/vytuongdang/VMMU](https://github.com/vytuongdang/VMMU)
- Row captured (**8 numbers**, likely Overall + 7 domains; header not in snippet):
  `Sonnet 4.0 | 50.66 | 38.50 | 53.31 | 44.87 | 48.44 | 58.04 | 44.17 | 48.28` — [ar5iv 2508.13680](https://ar5iv.labs.arxiv.org/html/2508.13680)
- A second table has header `Model | BLEU (%) ↑ | F1 (%) ↑ | CER (%) ↓ | WER (%) ↓` with a **`Gemini-2.5-Flash`** row — **values not visible in the snippet** — [arXiv PDF 2508.13680v3](https://arxiv.org/pdf/2508.13680v3)
- Project page: [vi-exam.github.io](https://vi-exam.github.io/) · HF paper page: [huggingface.co/papers/2508.13680](https://huggingface.co/papers/2508.13680)

### 2.2 VM14K — Vietnamese medical benchmark (`arXiv 2506.01305`)
Two rows captured, each with 8 values (header not in snippet):
- `Gemini 2.0 Flash | 77.92 | 80.16 | 77.34 | 74.77 | 75.67 | 78.03 | 75.18 | 71.75` — [ar5iv 2506.01305](https://ar5iv.labs.arxiv.org/html/2506.01305)
- `Qwen3-32B | - | - | - | - | 72.47 | 74.37 | 72.10 | 68.79` — same source
- VM14K is reused as the primary benchmark by later Vietnamese work (2026) — [sdh.mta.edu.vn Tập 3 (2026)](https://sdh.mta.edu.vn/wp-content/uploads/2026/04/T%E1%BA%ADp-3_resized-1.pdf)

### 2.3 VLegal-Bench — Vietnamese legal reasoning (`arXiv 2512.14554`, ICML 2026)
- `BloomVN-8B-chat | 46.66 | 65.59 | 63.67 | 65.29 | 26.75 | 70.36 | 45.00 | 0.500 | 49.08 | 57.00` — [ar5iv html](https://ar5iv.labs.arxiv.org/html/2512.14554) · [arXiv HTML v4, table A4.T21](https://arxiv.org/html/2512.14554v4)
- `internlm-chat-20b | 16.43 | 24.01 | 17.91 | 21.70 | 18.13 | 11.11 | 9.00 | 0.188 | 61.17 | 32.73` — [arXiv HTML v2, table A4.T17](https://arxiv.org/html/2512.14554v2)
- Subsections/captions captured (no numbers): `Table … Model | Understanding & Structuring | Reasoning & …` — [arXiv 2512.14554v5](https://arxiv.org/pdf/2512.14554v5); failure analysis mentions "changes normative hierarchies or logical dependencies between provisions" — [ACL 2026 long 497](https://aclanthology.org/2026.acl-long.497.pdf)
- **Verbatim qualitative claim (truncated in snippet, quoted as seen):** "The Diminishing Advantage of Proprietary Models — While proprietary models (GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Flash) maintain…" — [arXiv 2512.14554v5](https://arxiv.org/pdf/2512.14554v5). The sentence continues beyond the snippet, so the *direction* of the claim is unverified.
- Third-party score aggregator page (not read): [benchmarklist.com/benchmarks/vlegal_bench](https://benchmarklist.com/benchmarks/vlegal_bench/)

### 2.4 Vietnamese MRC — ViMMRC 2.0, ViMultiChoice, ViGPTQA
- **ViMMRC 2.0**: corpus paper "A Multiple Choices Reading Comprehension Corpus for Vietnamese Language Education" (`arXiv 2303.18162`); snippet states "**the viBERT models show the best results on the test set and development set of the ViMMRC 2.0**" — [paper content mirror](https://huggingface.co/buckets/huggingchat/papers-content/tree/2303/2303.18162.md) · [abs](http://xxx.itp.ac.cn/abs/2303.18162)
- **ViMultiChoice** (`arXiv 2602.09961`): tables with headers `Model | ViRCSoSciD (Acc, F1-m…) | ViMMRC 2.0 (Acc, F1-m…)`; one row captured for Vicuna: `Vicuna 18.73 24.50 15.16 25.96` — [Semantic Scholar reader](https://www.semanticscholar.org/reader/0d8e987c1de64d5bb27796fc4774a90aad9c5818) · [arXiv PDF](https://arxiv.org/pdf/2602.09961v2)
- **ViGPT / ViGPTQA** (EMNLP 2023 Industry track): benchmarks "ViGPT models on Vietnamese extraction-based machine reading comprehension (MRC) datasets, including ViCoQA…"; captured table header `Model | Human | ROUGE-1 (Unicode) | ROUGE-1-Non-Unicode | BLEU-1 | BLEU-4`, first row `vilm/vietcuna-3b | 6…` (**value truncated at "6…" in the snippet — I will not guess the rest**) — [aclanthology.org/2023.emnlp-industry.70.pdf](https://aclanthology.org/2023.emnlp-industry.70.pdf) · also a second table with per-dataset columns `ViWikiQA | ViCoQA | ViNewsQA` — [anthology PDF](https://aclanthology.org/anthology-files/anthology-files/anthology-files/pdf/emnlp/2023.emnlp-industry.pdf)

### 2.5 Vietnamese reasoning / instruction-following / "four open-weight models" study
- **LREC 2026 SIGUL**: "We evaluate **four representative open-weight models** … PhoGPT-4B…" — a Vietnamese open-weight comparison; **the numbers were not exposed in any snippet** — [lrec-conf.org 2026.sigul-1.0.pdf](http://lrec-conf.org/proceedings/lrec2026/workshops/sigul/2026.sigul-1.0.pdf)
- **SIGUL 2026**: "How Well Do Large Language Models Reason in Under-Resourced Languages? Evidence from Vietnamese" — [paper](http://www.lrec-conf.org/proceedings/lrec2026/workshops/sigul/pdf/2026.sigul-1.1.pdf) · [ACL record](https://aclanthology.org/2026.sigul-1.1/). Note: an implementer-facing line in the same volume warns that "Due to the inherent variability in Vietnamese translation and inconsistent model adherence to output formats, automated string m[atching]…" — useful methodological caveat.
- **Vietnamese reasoning/instruction standard (2025 news, Zalo AI-linked)**: "Công bố bộ tiêu chuẩn đánh giá suy luận, tương tác của LLM tiếng Việt" — [vietnam.vn (VI)](https://www.vietnam.vn/cong-bo-bo-tieu-chuan-danh-gia-suy-luan-tuong-tac-cua-llm-tieng-viet) · [(EN)](https://www.vietnam.vn/en/cong-bo-bo-tieu-chuan-danh-gia-suy-luan-tuong-tac-cua-llm-tieng-viet) · "AI models need a set of standards that deeply assess complex capabilities" — [vietnam.vn](https://www.vietnam.vn/en/mo-hinh-ai-can-bo-tieu-chuan-danh-gia-sau-cac-nang-luc-phuc-tap). **Scores: not found.**
- **VinUni V-LLM v1 / V-Bench** (news, dated ~6 July 2026 by aggregators): headline claims a Vingroup model leads above ChatGPT and Gemini "ở 1 chỉ số" (on one metric) — [cafef.vn](https://cafef.vn/vinuni-cong-bo-xep-hang-ai-cua-ty-phu-pham-nhat-vuong-dung-dau-o-1-chi-so-188260706222217467.chn) · [cafebiz.vn](https://cafebiz.vn/vinuni-cong-bo-xep-hang-ai-cua-ty-phu-pham-nhat-vuong-dung-dau-o-1-chi-so-176260707072441174.chn) · [24hmoney](https://24hmoney.vn/news/ai-cua-ty-phu-pham-nhat-vuong-vuot-mat-chatgpt-gemini-c2a2803198.html) · [nguoiquansat: "AI của Vingroup đứng đầu về năng lực tiếng Việt"](https://nguoiquansat.vn/ai-cua-vingroup-dung-dau-ve-nang-luc-tieng-viet-302293.html). **Numbers: not found** (titles only).

### 2.6 VLSP shared tasks (2023 / 2024 / 2025)
Documents located; **no per-system numeric results were exposed in snippets**:
- VLSP 2023 LTER summary: "VLSP 2023 - LTER: A Summary of the Challenge on Legal Textual Entailment Recognition" — [ar5iv 2403.03435](https://ar5iv.labs.arxiv.org/html/2403.03435); winning-system description: "We present our winning approach to the VLSP 2023 Vietnamese Legal Textual Entailment Recognition (LTER) challenge" — [JAIST PDF](https://dspace.jaist.ac.jp/dspace/bitstream/10119/19391/6/paper.pdf)
- VLSP 2025: [TemporalQA shared task](https://aclanthology.org/2025.vlsp-1.35.pdf) · [Numerical Reasoning QA challenge](https://aclanthology.org/2025.vlsp-1.25.pdf) · [champion system for the Temporal QA Date-Arithmetic sub-task](https://aclanthology.org/2025.vlsp-1.40.pdf) · [Vietnamese AMR parsing with LLMs](https://aclanthology.org/2025.vlsp-1.34.pdf) · [ASR/SER challenge analysis](https://aclanthology.org/2025.vlsp-1.1.pdf) · [Voice Conversion shared task overview](https://aclanthology.org/2025.vlsp-1.13.pdf)
- **Gemini in a VLSP 2025 paper (verified snippet):** "Model Variants: We test multiple versions of the Gemini family, including the lightweight **Gemini-1.5/2.5 Flash** and the most po[werful]…" — [aclanthology.org/2025.vlsp-1.43.pdf](https://aclanthology.org/2025.vlsp-1.43.pdf). **Numbers: not found.**
- VLSP 2020 precedent (dependency parsing) via [2020.vlsp-1.pdf](https://preview.aclanthology.org/update-css-js/2020.vlsp-1.pdf)

### 2.7 SEA benchmarks, leaderboards and MMLU variants
| Benchmark / artifact | What is verified | URL |
|---|---|---|
| **SEA-HELM** | ACL 2025 Findings paper; SEA-HELM framework + leaderboard; live Vietnamese detail view exists | [ACL Findings 636](https://aclanthology.org/2025.findings-acl.636/) · [arXiv 2502.14301](https://arxiv.org/html/2502.14301v2) · [leaderboard](https://leaderboard.sea-lion.ai/) · [**Vietnamese detailed view `/detailed/VI`**](https://leaderboard.sea-lion.ai/detailed/VI?showInstructModels=true&showReasoningModels=true&showClosedSourceModels=true&showQuantizedModels=false&minSize=0&maxSize=1000000) · [summary slide deck](https://zheng-shen.github.io/singsum2025/Ngui.pdf) |
| **Vietnamese-Open-LLM-leaderboard (HF)** | HF Space by NlpHUST exists; scores **not found** | [huggingface.co/spaces/NlpHUST/vietnamese_llm_leaderboard](https://huggingface.co/spaces/NlpHUST/vietnamese_llm_leaderboard) |
| **VN-Bench (NRL)** | Vietnamese LLM leaderboard site exists (EN + VI) | [nrl.ai/en/bench](https://www.nrl.ai/en/bench) · [nrl.ai/vi/bench](https://www.nrl.ai/vi/bench) |
| **MMLU-ProX (includes `vi`)** | "We evaluate a comprehensive set of **36 SOTA LLMs** on MMLU-ProX across **29 linguistically diverse languages**"; there is an HF predictions dataset partition `mmlu_prox_vi` | [OpenReview PDF](https://openreview.net/pdf/4155365c22d774a06edc25ff134c342ec48fcee6.pdf) · [gililior/mmlu-prox-eval-predictions → mmlu_prox_vi](https://huggingface.co/datasets/gililior/mmlu-prox-eval-predictions) |
| **Global-MMLU (includes `vi`)** | A per-language table exists ("Table 12: Detailed per-language performance on the Global MMLU (GMMLU) benchmark (5-shot accuracy)"); `gemma-3-27b-it` sample outputs for `global_mmlu_full_vi_marketing` exist | [NeurIPS 2025 paper PDF](https://papers.neurips.cc/paper_files/paper/2025/file/45a7ca247462d9e465ee88c8a302ca70-Paper-Conference.pdf) · [multilingual-snr/samples diff](https://huggingface.co/datasets/multilingual-snr/samples/commit/c3e552084be7c637b3701b5501a1e495a9f8a22c.diff) |
| **ViGLUE** | Paper exists (NAACL 2024 Findings); **scores not found** | [ACL Findings NAACL 261](https://aclanthology.org/2024.findings-naacl.261/) · [NAACL24 final PDF](https://www.cs.jhu.edu/~kevinduh/t/naacl24/final_pdf/paper1013.pdf) |
| **ViLLM-Eval** | "A Comprehensive Evaluation Suite for Vietnamese Large Language Models"; "This work aims to use perplexity and accuracy as the metric" | [ar5iv 2404.11086](https://ar5iv.labs.arxiv.org/html/2404.11086) |
| **VietMed-MCQ** (Vietnamese traditional medicine) | "To assess the capability of current LLMs on Vietnamese Traditional Medicine, we benchmarked **seven representative models**"; aggregator page exists | [arXiv HTML 2601.03792](https://arxiv.org/html/2601.03792v1) · [benchmarklist page](https://benchmarklist.com/benchmarks/vietmed_mcq_a_consistency_filtered_data_synthesis_framework_for_vietnamese_traditional_medicine_evaluation/) |
| **VietJobs** (Vietnamese job ads) | Row captured: `SeaLLMs-v3-7B-Chat | 10.83 | 0.14 | 13.44 | 0.10 | 12.75 | 0.11` (header not seen) | [ar5iv 2603.05262](https://ar5iv.labs.arxiv.org/html/2603.05262) |
| **ViFactCheck** (Vietnamese news fact-checking) | Benchmark exists | [AAAI OJS](https://ojs.aaai.org/index.php/AAAI/article/view/32008/34163) |
| **FLORES-200 / Vi–En translation** | FLORES-200 result tables exist in 2026 work ("Table 18: Main results on the FLORES-200-test benchmark"); a game-dialogue MT survey states "**For Spanish and Vietnamese, the Aya Expanse 8B model outperforms all other models across the three evaluation metrics**" | [ACL 2026 long 469](https://aclanthology.org/2026.acl-long.469.pdf) · [ACM survey 3786171.3788386](https://dl.acm.org/doi/pdf/10.1145/3786171.3788386) · [FLORES-200 table, arXiv 2401.02412](http://export.arxiv.org/pdf/2401.02412) · [FLORES-200 Eng-X table, EMNLP 2025 demos](https://aclanthology.org/2025.emnlp-demos.pdf) |
| **Vietnamese instruction-following (AlpacaEval-style)** | **not found** for a Vietnamese-specific AlpacaEval; nearest Vietnamese-adjacent preference evidence is the SeaLLMs-v3 README 1–5 scale table (§2.8) | [SeaLLMs-v3-7B-Chat README](https://huggingface.co/SeaLLMs/SeaLLMs-v3-7B-Chat/blame/1935b8e07ba3a07e6966232cf0446045252fe87f/README.md) |

### 2.8 SeaLLM / SEA-LION / Sailor rows actually captured
| Row as captured | Source |
|---|---|
| `Qwen1.5-7B-chat \| 79.3 \| 59.4 \| 69.3` (SeaLLM-v2 README comparison table; headers not seen) | [SeaLLM-7B-v2 README](https://huggingface.co/SeaLLMs/SeaLLM-7B-v2/blame/a36711b525ebd355d6048eedb022d612190f2cb9/README.md) |
| `Mistral-7B-Instruct \| 68.1 \| 56.4 \| 45.6` | [SeaLLM-7B-v2 README](https://huggingface.co/SeaLLMs/SeaLLM-7B-v2/blame/5537553019f3d3afe8e308b42d7161da04ea2b48/README.md) |
| `Sailor-7B-Chat \| 4.60 \| 4.04 \| 4.32 \| 3.94 \| 3.17 \| 3.56 \| 4.82 \| 3.6…` (1–5-scale style table) | [SeaLLMs-v3-7B-Chat README](https://huggingface.co/SeaLLMs/SeaLLMs-v3-7B-Chat/blame/1935b8e07ba3a07e6966232cf0446045252fe87f/README.md) |
| SeaLLMs 3 paper has a per-language table with a **`vi`** column (`Model \| en \| zh \| id \| th \| vi \| avg \| avg_sea`, row starting `Gemma-7b…`) and a second table `Model \| en \| jv \| th \| vi \| zh \| avg` with a `Sailor-7B-Chat` row — **values not exposed** | [arXiv 2407.19672](http://arxiv.org/pdf/2407.19672) · [ar5iv](https://ar5iv.labs.arxiv.org/html/2407.19672) |
| **Sailor2-8B** row: `43.22 \| 48.89 \| 48.67 \| 66.4 \| 74.8 \| 81.0 \| 66.84 / 80.50 \| 60.05 / 79.61 \| 66.37 / 81.30 \| 56.50 \| 57.14 \| 65.62` | [ar5iv 2502.12982](https://ar5iv.labs.arxiv.org/html/2502.12982) · [AAU-hosted PDF](https://vbn.aau.dk/ws/portalfiles/portal/770121713/2502.12982v1.pdf) |
| **Sailor2-8B-Chat** row: `43.13 \| 48.98 \| 48.01 \| 45.44 \| 28.29 \| 49.52 \| 45.71 \| 40.00 \| 69.76 \| 66.97 \| 73.94` | [ar5iv 2504.05747 (SEA-LION paper)](https://ar5iv.labs.arxiv.org/html/2504.05747) · [arXiv HTML v3](https://arxiv.org/html/2504.05747v3) |
| SEA-LION v3 docs pages (Gemma-SEA-LION-v3-9B, Llama-SEA-LION-v3-8B) exist incl. a `#benchmark-performance` anchor; a paper lists "Gemma-SEA-LION-v3-9B-IT (Singapore 2024)" — **no numbers seen** | [Gemma-SEA-LION-v3-9B](https://docs.sea-lion.ai/models/sea-lion-v3/gemma-sea-lion-v3-9b) · [Llama-SEA-LION-v3-8B](https://docs.sea-lion.ai/~gitbook/pdf?page=qsoLXQ71r3CYo3akE4vv) · [SEA-LION v3 overview](https://docs.sea-lion.ai/models/sea-lion-v3#benchmark-performance) · [arXiv 2508.12243](https://arxiv.org/pdf/2508.12243v1) |
| SeaLLM-7B-v2.5 claim (verbatim): "**Trained from Gemma-7B, it outperforms SeaLLM-7B-v2 and SeaLLM-13B-v1 remarkably and surpasses ChatGPT-3.5…**" | [ACL 2024 demos proceedings, p.104](https://aclanthology.org/2024.acl-demos.pdf) |
| Sailor2 project blog | [sea-sailor.github.io/blog/sailor2](https://sea-sailor.github.io/blog/sailor2/) |

### 2.9 Vietnamese foundation-model papers (BLOOMZ / VinaLLaMA / PhoGPT / Crossing Linguistic Horizons)
| Row as captured / claim | Source |
|---|---|
| `BLOOMZ-7B \| 0.3205 \| 0.4930 \| 0.3975 \| 0.4523 \| 0.4158` (VinaLLaMA paper comparison table; headers not seen) | [ar5iv 2312.11011](https://ar5iv.labs.arxiv.org/html/2312.11011) · [OpenReview PDF](https://openreview.net/pdf?id=q4fdaHyuTqt) |
| **PhoGPT**: "…our 4B-parameter **PhoGPT-4B-Chat** is highl[y]…" (truncated qualitative claim in a downstream paper's LaTeX source) | [undertheseanlp/bamboo-1 reference tex](https://huggingface.co/undertheseanlp/bamboo-1/blob/30c6ff33cbc989503594eaa829314344a2e63528/references/2023.arxiv.nguyen/paper.tex) · [PhoGPT ar5iv 2311.02945](https://ar5iv.labs.arxiv.org/html/2311.02945) |
| **Crossing Linguistic Horizons** (`arXiv 2403.02715`, NAACL 2024 Findings) rows captured: `GPT-4 \| 0.49±0.02 \| 0.48±0.02 \| − \| 0.35±0.02`; `GemSUra \| 0.00±0.00 \| 0.95±0.00 \| 1.02±0.00` | [ar5iv 2403.02715](https://ar5iv.labs.arxiv.org/html/2403.02715) · [ACL Findings NAACL 2024.182](https://preview.aclanthology.org/revert-3132-ingestion-checklist/2024.findings-naacl.182.pdf) |
| A thesis/paper notes models are predominantly fine-tuned on Vietnamese datasets (`Vistral` and `VBD_Llama`) and evaluates them | [UvA-hosted PDF](https://dspace.uba.uva.nl/server/api/core/bitstreams/38470944-6922-46c9-ac9f-e5faca9e1452/content) |
| `vbd-llama2-7B-50b-chat` has a commit literally titled **"update README: vmlu test"** (a VMLU run exists on the model card; score not visible) | [HF commit](https://huggingface.co/LR-AI-Labs/vbd-llama2-7B-50b-chat/commit/54608d28700d4d3c0eb8cea5565b542761c567c5) |

---

## 3. Cross-lingual: open models vs gemini-2.5-flash / GPT-4o on Vietnamese

### 3.1 What is verified
| Claim / number | Direction | Source |
|---|---|---|
| **VM14K (Vietnamese medical)**: `Gemini 2.0 Flash \| 77.92 \| 80.16 \| 77.34 \| 74.77 \| 75.67 \| 78.03 \| 75.18 \| 71.75` vs `Qwen3-32B \| - \| - \| - \| - \| 72.47 \| 74.37 \| 72.10 \| 68.79` — on the four columns where both have values, **Gemini 2.0 Flash is higher than Qwen3-32B**. *Caveats: closed model is 2.0 Flash, not 2.5 Flash; headers unverified; Qwen3-32B's first four cells are `-`.* | closed > open (this eval) | [ar5iv 2506.01305](https://ar5iv.labs.arxiv.org/html/2506.01305) |
| **VLegal-Bench**: section titled "**The Diminishing Advantage of Proprietary Models**", listing proprietary models as "(GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Flash)" — sentence truncated, **claim direction and margins unverified** | ambiguous as captured | [arXiv 2512.14554v5](https://arxiv.org/pdf/2512.14554v5) |
| **ViExam/VMMU**: `Sonnet 4.0 \| 50.66 \| 38.50 \| 53.31 \| 44.87 \| 48.44 \| 58.04 \| 44.17 \| 48.28`; a `BLEU/F1/CER/WER` table includes a **Gemini-2.5-Flash** row (values unseen). **No open-model row was exposed** | closed rows exist; open comparison **not found** | [ar5iv 2508.13680](https://ar5iv.labs.arxiv.org/html/2508.13680) · [PDF v3](https://arxiv.org/pdf/2508.13680v3) |
| **FLORES-200 / MT survey (game dialogue)**: "For Spanish and Vietnamese, the **Aya Expanse 8B** model outperforms all other models across the three evaluation metrics" | open ≈ best in that survey | [ACM DL](https://dl.acm.org/doi/pdf/10.1145/3786171.3788386) |
| **SeaLLM-7B-v2.5** (Gemma-7B-based, 7B): "surpasses **ChatGPT-3.5**" | open 7B > GPT-3.5 (as claimed) | [ACL 2024 demos p.104](https://aclanthology.org/2024.acl-demos.pdf) |
| **Crossing Linguistic Horizons**: `GPT-4` baseline row ~0.49/0.48/0.35 (±0.02) | GPT-4 baseline (not 4o) | [ar5iv 2403.02715](https://ar5iv.labs.arxiv.org/html/2403.02715) |
| **M2G-Eval** (`arXiv 2512.22628`): `gemini-2.5-flash \| 23.8 \| 29.4 \| 10.8 \| 24.9 \| 38.0 \| 23.4 \| 18.0 \| 38.0 \| 35.3 \| 43.5 \| 23.9 \| 21.4 \| 33.3 \| 31.5 \| 28.9 \| 3.3` (plus a `gemini-2.5-pro` row). **Whether any column is Vietnamese is unverified** | closed-model row captured; vi applicability unknown | [ar5iv 2512.22628](https://ar5iv.labs.arxiv.org/html/2512.22628) · [arXiv HTML](https://arxiv.org/html/2512.22628v1) |

### 3.2 Claims from the brief that I could **not** corroborate
| Claim to check | Status | Nearest URL |
|---|---|---|
| **Qwen3 30B-A3B / 32B / 235B Vietnamese quality** | **not found** — no Vietnamese score or explicit Vietnamese claim surfaced. Only indirect: the `Qwen3-32B` VM14K row, and a Qwen3 language-coverage documentation commit (Qwen3-VL) | [VM14K](https://ar5iv.labs.arxiv.org/html/2506.01305) · [Qwen3-VL language-coverage commit](https://huggingface.co/AMAImedia/Qwen3-VL-2B-UI-Venus-NOESIS-BF16/commit/e4ae557a646962bb80965e338ed874f011f0e4b1) |
| **Gemma 3 multilingual (140 languages) Vietnamese claims** | **not found** — Gemma 3 pages/report located, but no Vietnamese-specific number or "140 languages ⇒ Vietnamese" statement appeared. Indirect evidence Gemma-3 vi evals were run: `global_mmlu_full_vi_*` samples for `gemma-3-27b-it` | [Gemma 3 (DeepMind)](https://deepmind.google/models/gemma/gemma-3/) · [Gemma 3 tech report 2503.19786](https://arxiv.org/html/2503.19786v1) · [vi sample diffs](https://huggingface.co/datasets/multilingual-snr/samples/commit/c3e552084be7c637b3701b5501a1e495a9f8a22c.diff) |
| **SeaLLM-13B-v2 beats GPT-3.5 on Vietnamese** | **partially** — the v2.5 line claims to beat *SeaLLM-13B-v1* and *ChatGPT-3.5*; no 13B-v2 Vietnamese numbers found | [ACL 2024 demos p.104](https://aclanthology.org/2024.acl-demos.pdf) |
| **Sailor2 outperforms Qwen2.5 / Llama 3.1 / Gemma 2 / SEA-LION on SEA languages** | **not verified as a sentence** — paper and SEA-LION paper both exist and both contain Sailor2 rows (§2.8), but I never saw the comparative claim text | [ar5iv 2502.12982](https://ar5iv.labs.arxiv.org/html/2502.12982) · [project blog](https://sea-sailor.github.io/blog/sailor2/) |
| **SEA-LION v3 (Gemma-SEA-LION-v3-9B, Llama-SEA-LION-v3-8B) benchmarks** | **not found** — docs pages exist with a benchmark-performance section; no numbers surfaced | [docs.sea-lion.ai/models/sea-lion-v3](https://docs.sea-lion.ai/models/sea-lion-v3#benchmark-performance) |
| **PhoGPT-4B and Vistral-7B Vietnamese benchmarks** | **not found** as numbers — both are heavily *referenced* as baselines (KU Leuven thesis: "We use Vistral-7B-Chat [36] and vmlu-llm"; LREC 2026 SIGUL evaluates PhoGPT-4B among four open-weight models) but no scores appeared | [Lirias PDF](https://lirias.kuleuven.be/retrieve/b1a0f26f-28dd-46ff-9ccc-d8d982e9e70c) · [LREC 2026 SIGUL](http://lrec-conf.org/proceedings/lrec2026/workshops/sigul/2026.sigul-1.0.pdf) |
| **BloomVN-8B** | **partial** — one VLegal-Bench row captured (§2.3); no other Vietnamese benchmark numbers | [ar5iv 2512.14554](https://ar5iv.labs.arxiv.org/html/2512.14554) |
| **Vietnamese fine-tunes of Qwen3** | **not found** | nearest: [VM14K Qwen3-32B row](https://ar5iv.labs.arxiv.org/html/2506.01305) |
| **2025–2026 papers directly comparing open models vs Gemini 2.5 Flash on Vietnamese** | **partially found** — VLegal-Bench (GPT-4o / Claude Sonnet 4.5 / Gemini 2.5 Flash named) and a VLSP 2025 paper evaluating Gemini-1.5/2.5 Flash variants, plus ViExam's Gemini-2.5-Flash row. **No side-by-side open-vs-2.5-Flash Vietnamese score table was exposed** | [VLegal-Bench](https://arxiv.org/pdf/2512.14554v5) · [VLSP 2025 (1.43)](https://aclanthology.org/2025.vlsp-1.43.pdf) · [ViExam](https://arxiv.org/pdf/2508.13680v3) |

---

## 4. Deliverable table 1 — model → VMLU → other Vietnamese evals

`nf` = **not found** (no number seen in any source snippet). Column semantics of quoted rows are unverified unless stated.

| Model | Params | VMLU score | Other Vietnamese eval scores (as captured) | Source URL |
|---|---|---|---|---|
| Vistral-7B-Chat | 7B | **nf** | Used as a decoder baseline downstream; LREC 2026 SIGUL-style Vietnamese comparisons exist but no score seen | [Lirias](https://lirias.kuleuven.be/retrieve/b1a0f26f-28dd-46ff-9ccc-d8d982e9e70c) |
| PhoGPT-4B-Chat | 4B | **nf** | Qualitative only ("our 4B-parameter PhoGPT-4B-Chat is highl…"); included in LREC 2026 SIGUL four-model study (numbers not exposed) | [bamboo-1 tex](https://huggingface.co/undertheseanlp/bamboo-1/blob/30c6ff33cbc989503594eaa829314344a2e63528/references/2023.arxiv.nguyen/paper.tex) · [SIGUL](http://lrec-conf.org/proceedings/lrec2026/workshops/sigul/2026.sigul-1.0.pdf) |
| VinaLLaMA-7B-chat | 7B | **nf** | VinaLLaMA paper comparison row `BLOOMZ-7B \| 0.3205 \| 0.4930 \| 0.3975 \| 0.4523 \| 0.4158` | [ar5iv 2312.11011](https://ar5iv.labs.arxiv.org/html/2312.11011) |
| SeaLLM-7B-v2 | 7B | **nf** | README rows `Qwen1.5-7B-chat \| 79.3 \| 59.4 \| 69.3`, `Mistral-7B-Instruct \| 68.1 \| 56.4 \| 45.6` | [README (1)](https://huggingface.co/SeaLLMs/SeaLLM-7B-v2/blame/a36711b525ebd355d6048eedb022d612190f2cb9/README.md) · [(2)](https://huggingface.co/SeaLLMs/SeaLLM-7B-v2/blame/5537553019f3d3afe8e308b42d7161da04ea2b48/README.md) |
| SeaLLM-7B-v2.5 | 7B (from Gemma-7B) | **nf** | Claim: outperforms SeaLLM-7B-v2 and SeaLLM-13B-v1 and surpasses ChatGPT-3.5 | [ACL 2024 demos p.104](https://aclanthology.org/2024.acl-demos.pdf) |
| SeaLLM-13B-v1 / v2 | 13B | **nf** | Only as comparison targets of the v2.5 claim | [ACL 2024 demos p.104](https://aclanthology.org/2024.acl-demos.pdf) |
| SeaLLMs-v3-7B-Chat | 7B | **nf** | VietJobs row `10.83 \| 0.14 \| 13.44 \| 0.10 \| 12.75 \| 0.11`; README 1–5-scale table row for `Sailor-7B-Chat` | [VietJobs 2603.05262](https://ar5iv.labs.arxiv.org/html/2603.05262) · [README](https://huggingface.co/SeaLLMs/SeaLLMs-v3-7B-Chat/blame/1935b8e07ba3a07e6966232cf0446045252fe87f/README.md) |
| Sailor-7B-Chat | 7B | **nf** | `4.60 \| 4.04 \| 4.32 \| 3.94 \| 3.17 \| 3.56 \| 4.82 \| 3.6…` (preference-style) | [SeaLLMs-v3 README](https://huggingface.co/SeaLLMs/SeaLLMs-v3-7B-Chat/blame/1935b8e07ba3a07e6966232cf0446045252fe87f/README.md) |
| **Sailor2-8B** | 8B | **nf** | `43.22 \| 48.89 \| 48.67 \| 66.4 \| 74.8 \| 81.0 \| 66.84/80.50 \| 60.05/79.61 \| 66.37/81.30 \| 56.50 \| 57.14 \| 65.62` | [ar5iv 2502.12982](https://ar5iv.labs.arxiv.org/html/2502.12982) |
| **Sailor2-8B-Chat** | 8B | **nf** | `43.13 \| 48.98 \| 48.01 \| 45.44 \| 28.29 \| 49.52 \| 45.71 \| 40.00 \| 69.76 \| 66.97 \| 73.94` | [ar5iv 2504.05747](https://ar5iv.labs.arxiv.org/html/2504.05747) |
| Gemma-7B / Gemma-2 / Gemma 3 | 7B/9B/27B | **nf** | Row exists in SeaLLMs 3 per-language table (row starts `Gemma-7b…`, values hidden); `global_mmlu_full_vi_*` runs exist for `gemma-3-27b-it` | [arXiv 2407.19672](http://arxiv.org/pdf/2407.19672) · [vi samples](https://huggingface.co/datasets/multilingual-snr/samples/commit/c3e552084be7c637b3701b5501a1e495a9f8a22c.diff) |
| Qwen1.5-7B-chat / Qwen2.5 / Qwen3 | 7B / … / 32B | **nf** | `Qwen3-32B` VM14K row `- \| - \| - \| - \| 72.47 \| 74.37 \| 72.10 \| 68.79`; `Qwen1.5-7B-chat \| 79.3 \| 59.4 \| 69.3` | [VM14K](https://ar5iv.labs.arxiv.org/html/2506.01305) · [SeaLLM README](https://huggingface.co/SeaLLMs/SeaLLM-7B-v2/blame/a36711b525ebd355d6048eedb022d612190f2cb9/README.md) |
| BloomVN-8B-chat | 8B | **nf** | VLegal-Bench `46.66 \| 65.59 \| 63.67 \| 65.29 \| 26.75 \| 70.36 \| 45.00 \| 0.500 \| 49.08 \| 57.00` | [ar5iv 2512.14554](https://ar5iv.labs.arxiv.org/html/2512.14554) |
| internlm-chat-20b | 20B | **nf** | VLegal-Bench `16.43 \| 24.01 \| 17.91 \| 21.70 \| 18.13 \| 11.11 \| 9.00 \| 0.188 \| 61.17 \| 32.73` | [arXiv HTML v2](https://arxiv.org/html/2512.14554v2) |
| Vicuna | 7B/13B | **nf** | ViMultiChoice/MRC row `18.73 \| 24.50 \| 15.16 \| 25.96` | [Semantic Scholar reader](https://www.semanticscholar.org/reader/0d8e987c1de64d5bb27796fc4774a90aad9c5818) |
| vilm/vietcuna-3b | 3B | **nf** | ViGPTQA table row `vilm/vietcuna-3b \| 6…` (truncated) | [2023.emnlp-industry.70](https://aclanthology.org/2023.emnlp-industry.70.pdf) |
| **GPT-4o / Claude Sonnet 4.5 / Gemini 2.5 Flash** | closed | **nf** | Named together in VLegal-Bench's "Diminishing Advantage of Proprietary Models" section (claim text truncated) | [arXiv 2512.14554v5](https://arxiv.org/pdf/2512.14554v5) |
| **Gemini 2.5 Flash** | closed | **nf** | Row exists in ViExam/VMMU `BLEU/F1/CER/WER` table (values hidden); M2G-Eval code-gen row `23.8 \| 29.4 \| …` | [PDF v3](https://arxiv.org/pdf/2508.13680v3) · [M2G-Eval](https://ar5iv.labs.arxiv.org/html/2512.22628) |
| Gemini 2.0 Flash | closed | **nf** | VM14K `77.92 \| 80.16 \| 77.34 \| 74.77 \| 75.67 \| 78.03 \| 75.18 \| 71.75` | [ar5iv 2506.01305](https://ar5iv.labs.arxiv.org/html/2506.01305) |
| Claude Sonnet 4.0 | closed | **nf** | ViExam `50.66 \| 38.50 \| 53.31 \| 44.87 \| 48.44 \| 58.04 \| 44.17 \| 48.28` | [ar5iv 2508.13680](https://ar5iv.labs.arxiv.org/html/2508.13680) |
| GPT-4 | closed | **nf** | Crossing Linguistic Horizons row `0.49±0.02 \| 0.48±0.02 \| − \| 0.35±0.02` | [ar5iv 2403.02715](https://ar5iv.labs.arxiv.org/html/2403.02715) |

## 5. Deliverable table 2 — open models vs gemini-2.5-flash / GPT-4o, where numbers exist

| Vietnamese eval | Open model (score) | Closed comparator (score) | Verdict as evidenced | Source |
|---|---|---|---|---|
| **VM14K** (Vietnamese medical MCQ) | Qwen3-32B: 72.47 / 74.37 / 72.10 / 68.79 (last 4 of 8 columns); first 4 columns `-` | **Gemini 2.0 Flash**: 77.92 / 80.16 / 77.34 / 74.77 / 75.67 / 78.03 / 75.18 / 71.75 | **Closed ahead on every column where both have values** (2.0 Flash, not 2.5) | [ar5iv 2506.01305](https://ar5iv.labs.arxiv.org/html/2506.01305) |
| **VLegal-Bench** (Vietnamese legal reasoning) | BloomVN-8B-chat: 46.66 / 65.59 / 63.67 / 65.29 / 26.75 / 70.36 / 45.00 / 0.500 / 49.08 / 57.00; internlm-chat-20b: 16.43 / … / 32.73 | GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Flash named but **scores not captured** | **Indeterminate** — section title asserts a shrinking proprietary advantage, but the captured sentence is truncated and closed-model numbers never appeared | [ar5iv 2512.14554](https://ar5iv.labs.arxiv.org/html/2512.14554) · [v5 PDF](https://arxiv.org/pdf/2512.14554v5) |
| **ViExam / VMMU** (Vietnamese multimodal exams) | **no open-model row captured** | Gemini 2.5 Flash row exists (values hidden); Claude Sonnet 4.0: 50.66 / 38.50 / 53.31 / 44.87 / 48.44 / 58.04 / 44.17 / 48.28 | **Not comparable here** | [ar5iv 2508.13680](https://ar5iv.labs.arxiv.org/html/2508.13680) · [PDF v3](https://arxiv.org/pdf/2508.13680v3) |
| **Vietnamese–English MT (game-dialogue survey)** | **Aya Expanse 8B** — reported to outperform all other models on Vietnamese across three metrics | survey field includes proprietary models | **Open 8B competitive/best in that survey** | [ACM DL](https://dl.acm.org/doi/pdf/10.1145/3786171.3788386) |
| **ChatGPT-3.5 comparison** | SeaLLM-7B-v2.5 (Gemma-7B-based) claimed to surpass ChatGPT-3.5 | ChatGPT-3.5 | **Open 7B > GPT-3.5 (as claimed)** — *not a Gemini 2.5 Flash comparison* | [ACL 2024 demos p.104](https://aclanthology.org/2024.acl-demos.pdf) |
| **VMLU** | **nf** | **nf** | **No comparison possible from what I retrieved** | [vmlu.ai](https://vmlu.ai/) · [ACL 2025 paper](https://aclanthology.org/2025.acl-long.563.pdf) |

---

## 6. Evidence gaps / uncertainty (explicit)

1. **No VMLU score of any kind was verified** — not for Vistral, PhoGPT, SeaLLM, Qwen, Gemma, Llama, Sailor, VinaLLaMA, BloomVN, and not for GPT-4o, Claude, or Gemini 2.5 Flash/Pro. Sources that hold it: [vmlu.ai](https://vmlu.ai/), [ACL 2025 paper](https://aclanthology.org/2025.acl-long.563.pdf), [VTV](https://vtv.vn/cong-nghe/mo-hinh-ngon-ngu-lon-do-nguoi-viet-huan-luyen-but-pha-tren-bang-xep-hang-vmlu-20250114084757555.htm), [vnExpress](https://vnexpress.net/ai-viet-so-kha-nang-xu-ly-ngon-ngu-tieng-viet-voi-gpt-4-llama-4841667.html).
2. **VMLU subject count unverified.** Only "10,880 multiple-choice questions" is sourced; any "58 subjects" figure is unconfirmed.
3. **VMLU human baseline: not found.** The one human-baseline sentence seen belongs to a different paper ([arXiv 2305.11991](http://arxiv.org/pdf/2305.11991)) — do not reuse it.
4. **`vmlu.org` unverified.** The domain appearing in results is **vmlu.ai**; `vmlu.org` never appeared.
5. **Column headers unknown for nearly all quoted rows** (BloomVN-8B's ten VLegal-Bench numbers, VinaLLaMA's `BLOOMZ-7B` five numbers, SeaLLM README's three numbers, ViExam's eight numbers, Sailor2's twelve). Reproduced as raw evidence, not interpreted metric values.
6. **`vilm/vietcuna-3b | 6…` is truncated** in the only snippet seen; left incomplete rather than guessed.
7. **Gemini 2.5 Flash appears only as a row that exists, never with a visible value** (ViExam BLEU/F1/CER/WER table; VLegal-Bench proprietary sentence; VLSP 2025 variant list).
8. **No VMLU / Vietnamese score found for** Qwen3 30B-A3B / 235B, Gemma 3 (any size), Llama 3.x, SEA-LION v3 (Gemma/Llama variants), BloomVN beyond one row, or Vietnamese Qwen3 fine-tunes. Gemma 3's "140 languages" and Qwen3's multilingual coverage were not corroborated as Vietnamese-specific statements.
9. **Sailor2's claim of beating Qwen2.5 / Llama 3.1 / Gemma 2 / SEA-LION is unverified as text**, though Sailor2 rows exist in two papers.
10. **Most promising 2026 open-weight-only Vietnamese source (LREC 2026 SIGUL, "four representative open-weight models" incl. PhoGPT-4B) had no numbers exposed.** Same for SIGUL 2026 reasoning paper, VietMed-MCQ (7 models), VietJobs, and the benchmarklist aggregator pages.
11. **Vietnamese instruction-following / AlpacaEval-style: not found.** Only preference-style numbers seen are the SeaLLMs-v3 README 1–5-scale rows.
12. **VLSP 2023/2024/2025 per-system results: not found.** Only task/summary papers located; no VLSP 2024 result documents surfaced at all.
13. **Search-snippet bias.** Several snippets were table *headers* only (e.g. `Model | Overall | Art & Entert…`), which suggests the underlying pages contain exactly the score tables requested — the failure is snippet extraction, not source availability.
14. **Beware a look-alike table:** a snippet showed `Model | Overall | Art & Entert…` (categories like "Art & Entertainment"), which does **not** match any VMLU category scheme I could source; do not assume it is VMLU.
15. **No VMLU score was ever produced by a Vietnamese-language query either** — the VTV/vnExpress/cafef coverage is confirmed to exist (titles) but is paywalled-or-unindexed body text for snippet purposes.

### How to close these gaps (needs shell/network, unavailable in this session)
Highest-yield URLs to fetch/parse directly:
- `https://vmlu.ai/` (live leaderboard) · `https://aclanthology.org/2025.acl-long.563.pdf` (results tables) · `https://vtv.vn/cong-nghe/mo-hinh-ngon-ngu-lon-do-nguoi-viet-huan-luyen-but-pha-tren-bang-xep-hang-vmlu-20250114084757555.htm`
- `https://leaderboard.sea-lion.ai/detailed/VI?showInstructModels=true&showReasoningModels=true&showClosedSourceModels=true` · `https://aclanthology.org/2025.findings-acl.636/`
- `https://arxiv.org/html/2512.14554v5` (VLegal-Bench: GPT-4o / Claude Sonnet 4.5 / Gemini 2.5 Flash rows)
- `https://arxiv.org/pdf/2508.13680v3` (ViExam/VMMU: Gemini-2.5-Flash + open-VLM rows) · `https://arxiv.org/html/2506.01305` (VM14K full table)
- `http://lrec-conf.org/proceedings/lrec2026/workshops/sigul/2026.sigul-1.0.pdf` and `.../2026.sigul-1.1.pdf`
- `https://www.nrl.ai/en/bench` · `https://huggingface.co/spaces/NlpHUST/vietnamese_llm_leaderboard`
- `https://benchmarklist.com/benchmarks/vlegal_bench/` · `https://benchmarklist.com/benchmarks/vietmed_mcq_a_consistency_filtered_data_synthesis_framework_for_vietnamese_traditional_medicine_evaluation/`
- `https://papers.neurips.cc/paper_files/paper/2025/file/45a7ca247462d9e465ee88c8a302ca70-Paper-Conference.pdf` (Global-MMLU per-language) · `https://openreview.net/pdf/4155365c22d774a06edc25ff134c342ec48fcee6.pdf` (MMLU-ProX `vi`)
