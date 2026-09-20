# 04 — Meeting-Minutes (MoM) Pipelines & How To Get Meeting Audio

**Research date: 2026-09-19 (UTC).** All fetch dates below are **2026-09-19** unless stated otherwise.
Every specific claim is tagged `VERIFIED via <url> (fetched 2026-09-19)` or `UNVERIFIED/not reachable`.

**Blocked domains (could not be fetched at all — stated once, applies throughout):** `huggingface.co`, `google.com`, `wikipedia.org`, `medium.com`, `raw.githubusercontent.com`.
This matters a lot for this report: **the canonical pyannote model cards live on Hugging Face and could NOT be read directly.** Where a pyannote/WhisperX claim depends on an HF model card, I say so and cite the reachable mirror instead (pyannote's own GitHub README, pyannoteAI docs, or WhisperX's README).

### Fetch log (what was actually retrieved)

| # | URL | Local artifact | Outcome |
|---|---|---|---|
| 1 | https://github.com/m-bain/whisperX | `txt/whisperx_repo.txt` | OK (251 lines text) |
| 2 | https://github.com/pyannote/pyannote-audio | `txt/pyannote_repo.txt` | OK (315 lines) |
| 3 | https://pypi.org/pypi/pyannote.audio/json | inline | OK |
| 4 | https://pypi.org/pypi/whisperx/json | inline | OK |
| 5 | https://recall.ai/pricing | `txt/recall_pricing.txt` | OK |
| 6 | https://docs.recall.ai/llms.txt | `txt/recall_llms.txt` | OK (253 lines) |
| 7–16 | https://docs.recall.ai/docs/{real-time-endpoints,real-time-websocket-endpoints,how-to-get-mixed-audio-real-time,how-to-get-separate-audio-per-participant-realtime,bot-real-time-transcription,transcription,recallai-transcription,audio-only,meeting-direct-connect-for-zoom-rtms,stream-real-time-video-rtmp,diarization,perfect-diarization}.md | `md/*.md` | OK |
| 17 | https://meetingbaas.com/en/pricing | `txt/mb_pricing2.txt` | OK |
| 18 | https://docs.meetingbaas.com/api-v2/streaming | `txt/mb_streaming.txt` | OK (594 lines) |
| 19 | https://docs.meetingbaas.com/api-v2/transcription | `txt/mb_transcription.txt` | OK |
| 20 | https://attendee.dev/pricing | `txt/attendee_pricing.txt` | OK |
| 21 | https://attendee.dev/docs | `txt/attendee_docs.txt` | OK |
| 22 | https://vexa.ai/pricing | `txt/vexa2.txt` | OK |
| 23 | https://skribby.io/pricing | `txt/skribby2.txt` | OK |
| 24 | https://docs.pyannote.ai/models.md | `md/pb_models2.md` | OK |
| 25 | https://docs.pyannote.ai/tutorials/streaming-real-time.md | `md/pb_streaming.md` | OK |
| 26 | https://docs.pyannote.ai/tutorials/speech-to-text-diarization.md | `md/pb_stt_diar.md` | OK |
| 27 | https://docs.nvidia.com/nemo-framework/.../speaker_diarization/intro.html | `txt/nemo_diar.txt` | OK |
| 28 | https://docs.nvidia.com/nemo-framework/.../speaker_diarization/models.html | `txt/nemo_models.txt` | OK |
| 29 | https://developers.deepgram.com/docs/diarization | `txt/dg_diar2.txt` | OK (291 lines) |
| 30 | https://www.assemblyai.com/docs/speech-to-text/speaker-diarization | `txt/aai_diar.txt` | OK (329 lines) |
| 31 | https://docs.speechmatics.com/speech-to-text/features/diarization | `txt/sm_diar.txt` | OK |
| 32 | https://docs.gladia.io/chapters/audio-intelligence/speaker-diarization.md | `txt/gladia_diar4.txt` | OK |
| 33 | https://soniox.com/docs/stt/concepts/speaker-diarization | `txt/soniox_diar.txt` | OK |
| 34 | https://elevenlabs.io/docs/capabilities/speech-to-text | `txt/el_scribe.txt` | OK (538 lines) |
| 35 | https://www.dlapiperdataprotection.com/index.html?t=law&c=VN | `txt/vn_dlapiper.txt` | OK (681 lines) — **key Vietnam source** |
| 36 | https://chambers.com/articles/landmark-personal-data-protection-law-in-vietnam | `txt/vn_chambers_pdpl.txt` | OK |
| 37 | https://www.tilleke.com/print-insight/?post_id=69571&print=1 | `txt/vn_tilleke_print.txt` | OK |
| 38 | https://practiceguides.chambers.com/practice-guides/investing-in-2026/vietnam/trends-and-developments/O23505 | `txt/vn_chambers_2026.txt` | OK |
| 39 | https://vanban.chinhphu.vn/?pageid=27160&docid=207759 | `txt/vn_decree13_chinhphu.txt` | **PARTIAL** — page fetched but body is a JS/portal nav shell; no Decree text extracted |
| 40 | https://luatvietnam.vn/.../nghi-dinh-13-2023-nd-cp-... | `txt/vn_decree13_luatvietnam.txt` | **FAILED** — paywalled/login-gated; only nav chrome extracted |
| 41 | https://thuvienphapluat.vn/.../Decree-No-13-2023-ND-CP-.../tieng-anh.aspx | 1 line | **FAILED** — JS-gated |
| 42 | https://www.tilleke.com/insights/vietnams-new-law-on-personal-data-protection/ | `txt/vn_tilleke_pdpl.txt` | **404** |
| 43 | https://www.bakermckenzie.com/en/insight/publications/2025/07/vietnam-personal-data-protection-law | 2 lines | **FAILED** — JS-gated |
| 44 | https://api.github.com/repos/{m-bain/whisperX, pyannote/pyannote-audio, Zackriya-Solutions/meetily, silverstein/minutes, Vexa-ai/vexa, attendee-labs/attendee, inboxpraveen/LLM-Minutes-of-Meeting} | inline | OK |
| 45 | https://export.arxiv.org/api/query?... | inline | OK (HTTPS only; HTTP hangs) |
| 46 | https://arxiv.org/abs/{2104.05938, 2305.17529, 2303.13939, 2303.16763, 2312.17581, 2504.08024, 2410.06520, 2304.13343, 2409.10883, 2608.17694} | `txt/abs_*.txt` | OK |
| 47 | https://groups.inf.ed.ac.uk/ami/corpus/ | `txt/ami_corpus.txt` | OK |
| 48 | https://docs.nvidia.com/.../models_sortformer.html | 32 lines | **404** (page moved) |
| 49 | https://www.skribby.ai/ | 0 bytes | **FAILED** — correct domain is `skribby.io` |
| 50 | https://huggingface.co/pyannote/speaker-diarization-3.1 | n/a | **BLOCKED DOMAIN** |

#### Fetch log — addendum (second wave, all fetched 2026-09-19)

| # | URL | Outcome |
|---|---|---|
| 51 | https://docs.attendee.dev/guides/realtimeaudio | **OK — resolved my open Attendee question.** Per-participant + mixed raw PCM over WebSocket |
| 52 | https://docs.attendee.dev/guides/transcription | OK — "perfect speaker identification"; Teams web = mixed-stream caveat |
| 53 | https://docs.attendee.dev/guides/zoom/zoomrtms | OK — RTMS via App Sessions |
| 54 | https://docs.attendee.dev/sitemap.xml | OK — used for discovery (pricing page alone was insufficient) |
| 55 | **https://developers.zoom.us/blog/transition-to-obf-token-meetingsdk-apps/** | **OK — Zoom's own blog. Source for the 2 March 2026 OBF requirement** |
| 56 | **https://developers.zoom.us/docs/meeting-sdk/obf-faq/** | **OK — Zoom's OBF FAQ. Source for "recording stops when the authorized user leaves"** |
| 57 | https://www.recall.ai/blog/zoom-obf | OK — vendor analysis of the OBF change |
| 58 | https://developers.zoom.us/docs/meeting-sdk/obf/ | 1 line — JS-gated (blog + FAQ were sufficient) |
| 59 | https://docs.recall.ai/docs/diarization.md | OK — **the four diarization methods table** |
| 60 | https://docs.recall.ai/docs/perfect-diarization.md | OK |
| 61 | https://meetingbaas.com/en/pricing, https://docs.meetingbaas.com/, https://docs.meetingbaas.com/sitemap.xml | OK |
| 62 | https://docs.meetingbaas.com/api-v2/{streaming,transcription} | OK |
| 63 | https://skribby.io/pricing | OK (**note: `skribby.ai` does not resolve; the real domain is `skribby.io`**) |
| 64 | https://www.nylas.com/blog/best-meeting-bot-apis/ | OK — 3rd-party market comparison table |
| 65 | https://cli.nylas.com/guides/attendee-vs-recall-ai-meeting-bots | OK |
| 66 | **https://rouse.com/insights/news/2026/vietnam-key-developments-in-personal-data-protection-under-decree-no-356-2025-nd-cp-and-issues-businesses-need-to-review** | **OK — Decree 356 detail with article numbers** |
| 67 | **https://softspace.vn/thu-vien/du-lieu-sinh-trac-hoc-theo-luat-la-nhung-gi** | **OK — voice listed as biometric under Law 91/2025 Art. 31(2)** |
| 68 | **https://longphanpmt.com/danh-muc-du-lieu-ca-nhan-nhay-cam/** | **OK — voice samples = biometric = sensitive (Decree 356 Art. 4(1)(đ))** |
| 69 | **https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/data-localisation-in-vietnam-highlights-under-decree-53-and-decree-13-102iulg** | **OK — Cybersecurity Law + Decree 53 three-part localisation test; "voice" in the personal-information definition** |
| 70 | https://practiceguides.chambers.com/practice-guides/investing-in-2026/vietnam/trends-and-developments/O23505 | OK |
| 71 | https://www.law.cornell.edu/uscode/text/18/2511 | OK — **primary text of §2511(2)(d)** |
| 72 | https://www.rcfp.org/reporters-recording-guide/ | OK (index page; per-state pages individually) |
| 73 | https://learn.microsoft.com/en-us/microsoftteams/cloud-recording | OK |
| 74 | https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062034 | **FAILED** — 8 lines, unsupported-browser shell |
| 75 | https://support.google.com/meet/answer/9308681 | **FAILED** — 0 bytes |
| 76 | https://www.vietnam.vn/en/bo-cong-an-du-lieu-sinh-trac-hoc-giong-noi-mong-mat-la-thong-tin-nhay-cam-phai-quan-ly-chat-che | **FAILED — 13 bytes.** Title only ("MPS: voice and iris biometric data are sensitive") |
| 77 | https://dilinh.com/.../PDPL-Article-DL-29-August-2025B.pdf and .../DECREE-3562025ND-CP...pdf | **FAILED — HTTP 410 GONE** (both PDFs; Vercel deployment removed) |
| 78 | https://www.ey.com/en_vn/.../vietnam-s-new-decree-356-2025-nd-cp-... | **FAILED** — EY error page |
| 79 | https://www.lexology.com/library/detail.aspx?g=... | **FAILED** — 1-line stub |
| 80 | https://iclg.com/practice-areas/data-protection-laws-and-regulations/vietnam/ | **FAILED** — 27 lines of nav chrome only |
| 81 | https://thuvienphapluat.vn/... | **FAILED** — Cloudflare interstitial ("Just a moment...") |
| 82 | https://luatvietnam.vn/.../luat-bao-ve-du-lieu-ca-nhan-2025-so-91-2025-qh15-... | **FAILED** — login-gated; 189 lines of nav chrome |
| 83 | https://api.github.com/search/issues?q=repo:m-bain/whisperX+... | OK — dependency-pain evidence |
| 84 | https://pypi.org/pypi/{speechbrain,Resemblyzer,nemo-toolkit,faster-whisper}/json | OK |
| 85 | https://github.com/speechbrain/speechbrain/tree/develop/recipes/VoxCeleb/SpeakerRec, https://github.com/resemble-ai/Resemblyzer | OK |
| 86 | https://groups.inf.ed.ac.uk/ami/corpus/ | OK — AMI = 100 hours |
| 87 | https://export.arxiv.org/api/query (multiple) | OK **over HTTPS only — the HTTP endpoint hangs/times out** |
| 88 | https://arxiv.org/abs/{2303.16763, 2312.17581, 2409.10883, 2504.08024, 2410.06520, 2304.13343, 2608.17694} | OK |

---

# PART A — MoM PIPELINE

## A0. Executive summary of Part A

1. **The single biggest architectural decision is where diarization happens.** If you join the meeting with a *bot* that the platform legitimately admits as a participant, you get **per-participant audio streams and real participant names** — diarization becomes nearly free and perfect. Recall.ai calls this "Perfect Diarization." If you only capture one **mixed** audio stream (desktop overlay, browser tab, or a bot that gets a single mix), you are forced into **acoustic diarization** with `SPEAKER_00`, `SPEAKER_01` labels and an error rate. `VERIFIED via https://docs.recall.ai/docs/diarization.md (fetched 2026-09-19)`
2. **pyannote.audio is currently 4.0.x (4.0.7), and the model WhisperX now uses is `speaker-diarization-community-1`, not `speaker-diarization-3.1`.** community-1 is reported by pyannote at **CC-BY-4.0** and **still requires accepting user conditions on Hugging Face**. `VERIFIED via https://pypi.org/pypi/pyannote.audio/json and https://github.com/pyannote/pyannote-audio and https://github.com/m-bain/whisperX (fetched 2026-09-19)`
3. **WhisperX works, but only inside a narrow pin.** whisperx 3.8.6 pins `pyannote-audio>=4.0.0`, `torch~=2.8.0`, `torchaudio~=2.8.0`, `torchvision~=0.23.0`, `torchcodec>=0.6.0,<0.8.0`. Users on torch 2.9.0/CUDA 13 hit `AttributeError: module 'torchaudio' has no attribute 'AudioMetaData'`. The dependency-pinning pain is real and documented in open issues. `VERIFIED via https://github.com/m-bain/whisperX/issues/1398 and https://github.com/m-bain/whisperX/issues/1295 (fetched 2026-09-19)`
4. **Naive full-context summarisation is genuinely viable for a 2-hour meeting** (~22–25k English tokens; comfortably inside a 128k window), **but it is a trap for this product**: the product is Vietnamese-facing, and Vietnamese tokenises roughly 1.5–2.5× worse per unit of meaning than English, which can push a 2-hour meeting toward ~40–70k tokens. Chunked/rolling summarisation is still the right default. See A4.3.
5. **For LIVE translation the only bot vendors that matter are those that stream raw audio out in real time**: Recall.ai (`audio_mixed_raw` / per-participant realtime audio over WebSocket), Meeting BaaS (`streaming_config.output_url`, raw PCM every 100 ms), and Vexa (real-time WebSocket transcripts). See Part B1. Attendee advertises realtime transcription but its public pricing page does not describe a raw-audio egress stream.

---

## A1. Diarization

### A1.1 pyannote.audio — version, models, licence/terms, DER

| Item | Value | Evidence |
|---|---|---|
| Repo | `pyannote/pyannote-audio` — 10,572 ★, 1,106 forks, Python/Jupyter, **MIT** repo licence, 43 open issues, last push **2026-09-18** | `VERIFIED via https://api.github.com/repos/pyannote/pyannote-audio (fetched 2026-09-19)` |
| Current PyPI version | **4.0.7**, released **2026-06-30**, requires Python `>=3.10` | `VERIFIED via https://pypi.org/pypi/pyannote.audio/json (fetched 2026-09-19)` |
| Current **open-source** model | `pyannote/speaker-diarization-community-1` (presented as "Community-1 (self-hosted with pyannote.audio 4.0)") | `VERIFIED via https://docs.pyannote.ai/models.md (fetched 2026-09-19)` |
| Legacy model | `speaker-diarization-3.1` referred to as "legacy (3.1)" in pyannote's own benchmark table | `VERIFIED via https://github.com/pyannote/pyannote-audio (fetched 2026-09-19)` |
| Community-1 licence (as reported by WhisperX) | **CC-BY-4.0**, "by pyannoteAI" | `VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)` |
| Repo code licence vs model licence | Repo is **MIT**; the *model* is **CC-BY-4.0**. These are different licences governing different artifacts. | `VERIFIED via https://github.com/pyannote/pyannote-audio and https://github.com/m-bain/whisperX (fetched 2026-09-19)` |

#### Does it require accepting conditions on Hugging Face? — YES, still.

The current pyannote.audio README gives these steps verbatim, in order:

> 1. Accept `pyannote/speaker-diarization-community-1` user conditions
> 2. Create Huggingface access token at `hf.co/settings/tokens`
> 3. `pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-community-1", token = "HUGGINGFACE_ACCESS_TOKEN")`

`VERIFIED via https://github.com/pyannote/pyannote-audio (fetched 2026-09-19)`

WhisperX's README independently confirms the same gate for its diarization path: *"include your Hugging Face access token (read) ... and accept the user agreement for the `speaker-diarization-community-1` model."* `VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)`

**The actual terms text on the model card could NOT be read** (huggingface.co is a blocked domain in this environment). So:

| Question | Answer | Confidence |
|---|---|---|
| Requires HF account + accepting conditions to download? | **Yes** | VERIFIED (two independent reachable sources) |
| Is it free for commercial use? | **CC-BY-4.0 permits commercial use with attribution.** But I could **not** read the HF gated-terms text, which may add conditions on top of the licence. | **UNVERIFIED for the HF gate terms.** The CC-BY-4.0 claim itself is `VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)` |

> **Action item for the product:** because you cannot read the gated terms without an HF account, have a human with an HF account open `https://huggingface.co/pyannote/speaker-diarization-community-1` and screenshot/archive the gate text before shipping. Do not rely on the CC-BY-4.0 line alone. This is a genuine unresolved legal dependency, not a formality.

#### DER (Diarization Error Rate, %, lower is better)

From pyannote's own README benchmark table, **last updated 2025-09**: `VERIFIED via https://github.com/pyannote/pyannote-audio (fetched 2026-09-19)`

| Dataset | legacy (3.1) | **community-1** | precision-2 |
|---|---|---|---|
| AISHELL-4 | 12.2 | **11.7** | 11.4 |
| AliMeeting (channel 1) | 24.5 | **20.3** | 15.2 |
| AMI (IHM) | 18.8 | **17.0** | 12.9 |
| AMI (SDM) | 22.7 | **19.9** | 15.6 |
| AVA-AVD | 49.7 | **44.6** | 37.1 |
| CALLHOME (part 2) | 28.5 | **26.7** | 16.6 |
| DIHARD 3 (full) | 21.4 | **20.2** | 14.7 |
| Ego4D (dev.) | 51.2 | **46.8** | 39.0 |
| MSDWild | 25.4 | **22.8** | 17.3 |
| RAMC | 22.2 | **20.8** | 10.5 |
| REPERE (phase2) | 7.9 | **8.9** (worse) | 7.4 |
| VoxConverse (v0.3) | 11.2 | **11.2** | 8.5 |

pyannote's own summary: *"Compared to the 3.1 legacy pipeline, community-1 brings significant improvement in terms of speaker counting and assignment."* `VERIFIED via https://github.com/pyannote/pyannote-audio (fetched 2026-09-19)`

**Note the AMI (SDM) number: 19.9% DER.** AMI is the single most relevant public dataset for business meetings (100 hours of meeting recordings `VERIFIED via https://groups.inf.ed.ac.uk/ami/corpus/ (fetched 2026-09-19)`). **~20% DER on meeting-room audio is the honest expectation for open-source acoustic diarization**, and that is *before* it is fused with ASR. REPERE gets *worse* in community-1 than 3.1 — do not assume uniform improvement.

**Self-hosted speed:** community-1 processes AMI (IHM) ~1h files at **31 s per hour of audio**, DIHARD 3 at **37 s per hour**, on an NVIDIA H100 80GB. `VERIFIED via https://github.com/pyannote/pyannote-audio (fetched 2026-09-19)`

**Telemetry caveat:** pyannote.audio has an *optional* telemetry feature that reports anonymous usage metrics for `Pipeline.from_pretrained({origin})` calls. `VERIFIED via https://github.com/pyannote/pyannote-audio (fetched 2026-09-19)` — relevant to your privacy claims; check whether it is on by default in the version you pin and disclose it.

#### pyannoteAI commercial tiers (the paid escape hatch)

| Model | Positioning | Accuracy claim | Streaming |
|---|---|---|---|
| **Precision-3** | Latest, most accurate; tunable; frame-level probabilities | **34.2% more accurate on average than Community-1**; self-hosted modes: accuracy 14.3 avg DER / balance 14.9 / speed 15.5 | No (batch) |
| **Precision-2** | Previous gen; **default until 2026-10-03, deprecated 2026-10-17** | **28% more accurate on average than Community-1** | No (batch) |
| **Live-1** | **Streaming diarization over WebSocket** | sub-300 ms latency, up to 8 speakers, up to 5 h per stream, 16 kHz mono, **100 ms chunks** | **Yes** |
| **Community-1** (hosted) | Open-source model, hosted by pyannoteAI, "at cost" | baseline | No |

`VERIFIED via https://docs.pyannote.ai/models.md (fetched 2026-09-19)`

⚠️ **Hard deadline for any pyannoteAI integration:** Precision-3 becomes default **2026-10-03**; **Precision-2 is deprecated 2026-10-17**; the `confidence` output field is replaced by `speakerProbability` / `speechProbability` / `crosstalkProbability`. `VERIFIED via https://docs.pyannote.ai/models.md (fetched 2026-09-19)` — that is **~2 weeks after this report's date**.

**Live-1 is the only pyannote option that fits LIVE translation.** Its 100 ms-chunk WebSocket + sub-300 ms label latency is the relevant primitive. Speaker identification/voiceprints are **not** available for Community-1, only Precision-2/3. `VERIFIED via https://docs.pyannote.ai/models.md (fetched 2026-09-19)`

### A1.2 NVIDIA NeMo diarization

NeMo ships **two distinct families**, which is the key thing to know. `VERIFIED via https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/asr/speaker_diarization/intro.html (fetched 2026-09-19)`

| Family | Components | Characteristics |
|---|---|---|
| **End-to-end** | **Sortformer Diarizer** (+ **Streaming Sortformer Diarizer**) | Single network, raw audio → per-frame speaker activity in **arrival-time order**. "Advantage in ease of optimization and deployment." |
| **Cascaded / pipelined** | VAD (MarbleNet) → speaker embedding (TitaNet) → clustering → neural diarizer (**MSDD**, a TS-VAD-style model) | "Less restriction on the number of speakers and session length"; harder to optimize/deploy jointly |

`VERIFIED via https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/asr/speaker_diarization/intro.html and .../models.html (fetched 2026-09-19)`

**Streaming Sortformer** is the piece relevant to live translation: it *"processes the sound in small, overlapping chunks"* and uses an **Arrival-Order Speaker Cache (AOSC)** that *"stores frame-level acoustic embeddings for all speakers previously detected in the audio stream... ensuring a person is consistently identified with the same label throughout the stream."* `VERIFIED via https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/asr/speaker_diarization/models.html (fetched 2026-09-19)`

**Sortformer is being actively requested as a WhisperX backend but is NOT integrated.** Open issue #1467 (2026-08-25) asks for it, explicitly naming the model `nvidia/diar_streaming_sortformer_4spk-v2.1` and noting *"WhisperX currently uses pyannote for speaker diarization"* and that streaming Sortformer *"could also be useful for future real-time or low-latency WhisperX-related workflows."* `VERIFIED via https://github.com/m-bain/whisperX/issues/1467 (fetched 2026-09-19)`

- **Sortformer model DER numbers on meeting data: UNVERIFIED.** The dedicated models/Sortformer page at `.../speaker_diarization/models_sortformer.html` returned **404/Page Not Found** on 2026-09-19. I could not verify NeMo DER figures in this session.
- Practical takeaway: **NeMo Sortformer's 4-speaker cap and native streaming make it attractive for live meetings, but as of 2026-09-19 it is a do-it-yourself integration, not a drop-in WhisperX swap.**

### A1.3 WhisperX — what it adds, and its limits

| Item | Value | Evidence |
|---|---|---|
| Repo | `m-bain/whisperX` — **24,128 ★**, 2,429 forks, Python, **BSD-2-Clause**, 223 open issues, last push **2026-08-30** | `VERIFIED via https://api.github.com/repos/m-bain/whisperX (fetched 2026-09-19)` |
| PyPI | **3.8.6**, released **2026-05-25**, `requires_python <3.14,>=3.10`, BSD-2-Clause | `VERIFIED via https://pypi.org/pypi/whisperx/json (fetched 2026-09-19)` |
| Paper | Bain, Huh, Han, Zisserman, *"WhisperX: Time-Accurate Speech Transcription of Long-Form Audio"*, **INTERSPEECH 2023** | `VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)` |

**What it adds (verbatim feature list from the README):**

- ⚡️ **Batched inference for 70× realtime** transcription using whisper large-v2
- 🪶 **faster-whisper backend**, requires **<8 GB GPU memory** for large-v2 with `beam_size=5`
- 🎯 Accurate **word-level timestamps using wav2vec2 alignment**
- 👯‍♂️ **Multispeaker ASR using speaker diarization from pyannote-audio**
- 🗣️ **VAD preprocessing**, reduces hallucination & enables batching **with no WER degradation**

`VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)`

**Implementation details that matter operationally** (all `VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)`):

- Setup requires **CUDA toolkit 12.8** for GPU acceleration.
- Default alignment models for `{en, fr, de, es, it}` via torchaudio pipelines; other languages via HF (`DEFAULT_ALIGN_MODELS_HF` in `alignment.py`).
- Inference is run with `--without_timestamps True` to enable single-pass batching — **this changes output vs vanilla Whisper**.
- `--condition_on_prev_text` is set to **False** by default (reduces hallucination).
- 3-stage pipeline: transcribe → `whisperx.align(...)` → `whisperx.assign_word_speakers(diarize_segments, result)`.

**Known limits (README "Limitations" section, verbatim in substance):**

| Limitation | Consequence for a MoM product |
|---|---|
| Words without characters in the alignment model's dictionary (e.g. `"2014."`, `"£13.60"`) **cannot be aligned and get no timing** | Numbers, currency, dates lose timestamps → weak for "due date" extraction and for click-to-seek |
| **Overlapping speech is not handled particularly well** by whisper nor whisperx | Crosstalk in real meetings degrades both transcript and speaker labels |
| **"Diarization is far from perfect"** (README's own words) | Do not promise accurate speaker attribution from acoustic diarization alone |
| **A language-specific wav2vec2 model is needed** | Multilingual/Vietnamese needs a Vietnamese phoneme alignment model; if absent, word timings degrade or fail |

`VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)`

> **Vietnamese-specific caution:** WhisperX's default align models cover `{en, fr, de, es, it}` via torchaudio. Vietnamese requires a HF phoneme model via the `DEFAULT_ALIGN_MODELS_HF` path. The README's own advice for unsupported languages is *"you need to find a phoneme-based ASR model from huggingface model hub and test it on your data."* `VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)` — **word-level alignment quality for Vietnamese is UNVERIFIED and is a project risk for the translate-and-timestamp feature.**

### A1.4 Does WhisperX still work given PyTorch 2.x / pyannote churn? — YES, but only at pinned versions

**The pins.** From the resolver output captured in WhisperX issue #1398: `VERIFIED via https://github.com/m-bain/whisperX/issues/1398 (fetched 2026-09-19)`

```
pyannote-audio>=4.0.0        (from whisperx)
torch~=2.8.0                 (from whisperx)
torchaudio~=2.8.0            (from whisperx)
torchvision~=0.23.0          (from whisperx)
torchcodec<0.8.0,>=0.6.0     (from whisperx)
huggingface-hub<1.0.0
```

**The churn, documented:**

| Evidence | What it shows |
|---|---|
| Issue **#1295** "Any plan to upgrade pyannote dependency version?" (2025-11-20) | User upgrading to **CUDA 13.0 / torch 2.9.0** fails with `AttributeError: module 'torchaudio' has no attribute 'AudioMetaData'` raised from inside `pyannote/audio/core/io.py`. **pyannote 4.x imports a torchaudio symbol removed in torchaudio 2.9.** |
| Issue **#1398** "ERROR: pip's dependency resolver does not currently take into account all the packages that are installed" (2026-04-02) | Shows the full pin set above; Windows users fighting resolver conflicts |
| Issue **#1392** / PR **#1393** (2026-03-30) | "Issue with torchcodec version and a missing dependency" / "Fix incompatible torchcodec version and add missing dependency" |
| PR **#1389** (2026-03-26) | "Update torchcodec version compatible with **torch==2.8.0** in override-dependencies" |
| PR **#1366** (2026-03-09) | "Pin torchcodec dependency version to **0.7.0**" |
| Issue **#1467** (2026-08-25) | Community asking to *replace* pyannote with NeMo Sortformer as the diarization backend |

All `VERIFIED via https://github.com/m-bain/whisperX/issues/{1295,1398,1467} (fetched 2026-09-19)`

**The well-known dependency-pinning pain, stated plainly:** `torchcodec` was pinned **three times in three weeks** (0.7.0 → fix → torch 2.8.0 compatibility) in March 2026. WhisperX's dependency set spans `torch` + `torchaudio` + `torchvision` + `torchcodec` + `pyannote-audio` + `faster-whisper`/CTranslate2 + `huggingface-hub`, each with its own release cadence, and **WhisperX tracks torch ~2.8 while pyannote tracks newer torchaudio.** Any team self-hosting this will spend real time on resolver conflicts.

> **Recommendation:** do **not** install WhisperX into the same environment as your application. Containerise it, pin the entire lock (`uv.lock` is committed in the repo), and treat upgrades as a release event. If you need diarization at scale, prefer a **managed/streaming diarization API** (pyannoteAI Live-1/Precision-3, or the bot vendor's native per-participant streams) over self-hosting the WhisperX+pyannote stack.

### A1.5 Other open-source diarization-adjacent building blocks

| Tool | Role | Key facts | Evidence |
|---|---|---|---|
| **SpeechBrain** | Speaker embeddings for enrollment/verification | PyPI **1.1.1** (2026-08-27), **Apache-2.0**. VoxCeleb recipe: *"The system trains a TDNN for speaker embeddings coupled with a speaker-id classifier. The speaker-id accuracy should be around **97–98%** for both voxceleb1 and voxceleb2."* Backbones: x-vector, **ECAPA-TDNN**; verification via cosine or PLDA | `VERIFIED via https://pypi.org/pypi/speechbrain/json and https://github.com/speechbrain/speechbrain/tree/develop/recipes/VoxCeleb/SpeakerRec (fetched 2026-09-19)` |
| **Resemblyzer** | Voice embeddings | **256-value embedding** per utterance. *"create a voice profile for a person from a few seconds of speech (**5s–30s**)"*. Voice encoder in **PyTorch**, repo **Apache-2.0**. PyPI **0.1.4** but **last released 2023-10-12 — effectively stale** | `VERIFIED via https://github.com/resemble-ai/Resemblyzer and https://pypi.org/pypi/Resemblyzer/json (fetched 2026-09-19)` |
| **pyannoteAI voiceprints** | Managed speaker identification | *"identify known speakers in your audio using pre-enrolled voiceprints"* — **Precision-2/Precision-3 only, NOT Community-1** | `VERIFIED via https://docs.pyannote.ai/models.md (fetched 2026-09-19)` |
| **NVIDIA NeMo** | Sortformer / MSDD diarizers, TitaNet embeddings | See A1.2 | `VERIFIED via https://docs.nvidia.com/... (fetched 2026-09-19)` |

**Recommendation:** for speaker *naming* use **SpeechBrain ECAPA-TDNN** (Apache-2.0, actively maintained at 1.1.1) rather than Resemblyzer (Apache-2.0 but last PyPI release 2023). Consider pyannoteAI voiceprints if you are already using their paid tier.

---

## A2. Getting a speaker-attributed transcript end-to-end

**The decisive distinction is not "which API has diarization" but *whether the vendor can see the platform's participant list and the per-participant audio*.**
A bot that joins the meeting gets **names**; a pure STT API gets **`SPEAKER_00` indices**.

### A2.1 Speaker labels: two fundamentally different kinds

| Label kind | How obtained | Example | Where it comes from |
|---|---|---|---|
| **Participant speaker labels** | Per-participant separate audio streams, and/or active-speaker events from the meeting platform | Real name from participant list | Requires platform integration (bot/RTMS) |
| **Generic speaker labels** | Acoustic diarization on a mixed stream | `SPEAKER_00`, `A`, `B`, `1`, `2`, `3` | Any STT API with diarization |

`VERIFIED via https://docs.recall.ai/docs/diarization.md (fetched 2026-09-19)`

Recall's four diarization methods and their trade-offs — this table is the clearest public statement of the design space I found: `VERIFIED via https://docs.recall.ai/docs/diarization.md (fetched 2026-09-19)`

| Method | Transcribes | Label type | Best when | Caveat |
|---|---|---|---|---|
| **Perfect diarization** | Separate audio streams | **Participant** labels | Each participant joins from own device | Does **not** distinguish multiple people on the same stream; no raw provider data |
| **Hybrid diarization** | Separate streams **+** machine diarization within each | **Participant** labels | Some streams contain >1 speaker (conference room) | Most accurate overall; needs a provider that supports machine diarization |
| **Speaker-timeline diarization** | Active-speaker events from platform | **Participant** labels | Platform reliably reports active speaker | Depends on unreliable "who's talking" UI signals |
| **Machine diarization** | Single mixed stream | **Generic** labels | Nobody has separate streams | *"Can be less accurate when different speakers have similar-sounding voices"* |

**Cost of the good option:** Perfect diarization at **real-time** pricing is *"around **1.8x** the transcription credit usage"*; async is **0.6×–1.2×** (average ~1×). `VERIFIED via https://docs.recall.ai/docs/diarization.md and https://docs.recall.ai/docs/bot-real-time-transcription.md (fetched 2026-09-19)`

### A2.2 Coverage matrix — native diarization vs need a separate diarizer

| Provider | Native diarization? | Realtime/streaming diarization? | Speaker **names**? | Notable specifics | Evidence |
|---|---|---|---|---|---|
| **Deepgram** | ✅ | ✅ (streaming: `latest` or `v1`; **v2 is batch-only**) | ❌ generic labels | Versioned diarizers via `diarize_model`. *"The v2 diarizer is not available for streaming and returns a validation error."* Requires Nova generation. | `VERIFIED via https://developers.deepgram.com/docs/diarization (fetched 2026-09-19)` |
| **AssemblyAI** | ✅ `speaker_labels` | ✅ (separate streaming config) | ✅ **Speaker Identification** can replace labels with real names/roles | *"Accuracy improves the more each speaker talks... each speaker should have at least 30 seconds of continuous speech."* Output is an `utterances[]` array. Warns an **incorrect exact speaker count hurts accuracy** — prefer min/max ranges | `VERIFIED via https://www.assemblyai.com/docs/speech-to-text/speaker-diarization (fetched 2026-09-19)` |
| **Speechmatics** | ✅ | ✅ **Realtime** | ❌ generic | **Three modes**: speaker / channel / channel+speaker. **Channel+speaker is Realtime-only.** Also has a distinct **Speaker identification** feature | `VERIFIED via https://docs.speechmatics.com/speech-to-text/features/diarization (fetched 2026-09-19)` |
| **Gladia** | ✅ `diarization: true` | ✅ (live API; translation nested under `realtime_processing`) | ❌ generic | Speakers indexed **by order of appearance** (1st = speaker 0). `num_of_speakers`/`min_speakers`/`max_speakers` are *"hints, not hard constraints"* | `VERIFIED via https://docs.gladia.io/chapters/audio-intelligence/speaker-diarization.md and https://docs.meetingbaas.com/api-v2/transcription (fetched 2026-09-19)` |
| **Soniox** | ✅ | ✅ realtime **and** async ("v5 Realtime", "v5 Async") | ❌ generic | Speaker labels `Speaker 1`, `Speaker 2`...; also offers **speech translation** and realtime speech-to-speech | `VERIFIED via https://soniox.com/docs/stt/concepts/speaker-diarization (fetched 2026-09-19)` |
| **ElevenLabs Scribe** | ✅ | ✅ **Scribe v2 Realtime** | ❌ generic (`speaker_0`) | Scribe v2: **90+ languages**, diarization **up to 32 speakers**; also a Medical variant. Realtime is a separate product line | `VERIFIED via https://elevenlabs.io/docs/capabilities/speech-to-text (fetched 2026-09-19)` |
| **Azure Speech** | Diarization referenced only obliquely | Batch transcription doc mentions *"whether additional features are required, such as diarization and language identification"* | Separate **Speaker Recognition** product (identification/verification) — page body **auth-gated** | Could not read the full speaker-recognition page | `VERIFIED via https://learn.microsoft.com/en-us/azure/ai-services/speech-service/batch-transcription (fetched 2026-09-19)`. Azure speaker-recognition details: **UNVERIFIED — page required authorization** |
| **Recall.ai** (bot layer) | ✅ **and better** — 4 methods incl. perfect/hybrid | ✅ realtime | ✅ **participant names** via perfect/hybrid/speaker-timeline | Pass-through to Deepgram / AssemblyAI / Speechmatics / ElevenLabs / Rev / AWS / built-in `recallai_streaming` | `VERIFIED via https://docs.recall.ai/docs/diarization.md and https://docs.recall.ai/docs/transcription.md (fetched 2026-09-19)` |
| **Meeting BaaS** (bot layer) | ✅ "Speaker Diarization" included in raw recording token; realtime speaker-state updates | ✅ | Partial — v2.6.17 release note: **"Signed-in Teams joins and accurate speaker names"** | Default provider **Gladia**; also Deepgram, AssemblyAI, Speechmatics, Soniox + ElevenLabs for streaming | `VERIFIED via https://meetingbaas.com/en/pricing, https://docs.meetingbaas.com/, https://docs.meetingbaas.com/api-v2/transcription, https://docs.meetingbaas.com/api-v2/streaming (fetched 2026-09-19)` |
| **WhisperX / pyannote (self-host)** | ✅ but you assemble it | ❌ (batch; Live-1 is the paid streaming option) | ❌ generic | See A1.3/A1.4 | `VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)` |

**Bottom line for the product:** every major STT API gives you diarization, so *"can I get speaker labels?"* is not the differentiator. What none of the pure STT APIs give you is **real names**. That comes from either (a) a meeting-platform-integrated bot (Recall/Meeting BaaS/Attendee/Vexa), or (b) a speaker-identification/enrollment layer you build (A6), or (c) AssemblyAI's Speaker Identification / Speechmatics' speaker identification.

---

## A3. Transcript-to-MoM — real OSS repos

Discovered via `https://api.github.com/search/repositories` (fetched 2026-09-19) with queries `meeting summarization llm`, `meeting minutes transcription whisper`, `meeting action items extraction`.

**Important correction:** the task brief named `sachin-101/meeting-summarizer` and `SamurAIGPT/AI-meeting-minutes`. **Both returned `ERR Not Found` from `api.github.com` on 2026-09-19** — they are either renamed, deleted, or private. `VERIFIED via https://api.github.com/repos/sachin-101/meeting-summarizer and https://api.github.com/repos/SamurAIGPT/AI-meeting-minutes (fetched 2026-09-19)`. Do not rely on them. `microsoft/MeetingTranscription` and `Meeting-BaaS/Meeting-BaaS` likewise returned **Not Found** under those exact paths.

The real, currently-active projects are below.

| Repo | ★ | Lang | Licence | Last push | Purpose | Diarization | Summarisation | Action items |
|---|---|---|---|---|---|---|---|---|
| **[`Zackriya-Solutions/meetily`](https://github.com/Zackriya-Solutions/meetily)** | **30,936** | Rust | **MIT** | 2026-09-15 | *"Privacy first, AI meeting assistant with 4x faster Parakeet/Whisper live transcription, speaker diarization, and Ollama summarization built on Rust. 100% local processing. no cloud required."* macOS & Windows | ✅ | ✅ (Ollama, local) | Implied via LLM summarisation |
| **[`Vexa-ai/vexa`](https://github.com/Vexa-ai/vexa)** | 2,803 | Python | **Apache-2.0** | 2026-09-19 | *"Open-source meeting transcription API for Google Meet, Microsoft Teams & Zoom. Auto-join bots, real-time WebSocket transcripts, MCP server for AI agents. Self-host or use hosted SaaS."* | ✅ (platform native) | Not the focus | No |
| **[`silverstein/minutes`](https://github.com/silverstein/minutes)** | 1,487 | Rust | **MIT** | 2026-09-18 | *"Open-source, local-first Granola/Otter alternative that Claude Code, Codex, Cursor, and any MCP client can query. Meetings, calls, and voice memos transcribed on-device into markdown you own."* Created 2026-03-18 — fast-growing | ✅ | ✅ | Via MCP clients |
| **[`attendee-labs/attendee`](https://github.com/attendee-labs/attendee)** | 730 | Python | **NOASSERTION** ⚠️ | 2026-09-17 | *"The universal Meeting Bot API"* — open source, self-hostable (Django/Postgres/Redis) | ✅ via providers | No | No |
| **[`inboxpraveen/LLM-Minutes-of-Meeting`](https://github.com/inboxpraveen/LLM-Minutes-of-Meeting)** | 175 | Python | **MIT** | 2026-09-07 | *"transforms audio or video files into text transcripts and generates concise meeting minutes"* | Yes (in pipeline) | ✅ | Partial |
| **[`lukasbach/pensieve`](https://github.com/lukasbach/pensieve)** | 116 | TypeScript | — | 2026-05-30 | *"Desktop app for recording meetings from locally running apps and transcribing and summarizing them with a local [model]"* | — | ✅ | — |
| **[`bakaburg1/minutemaker`](https://github.com/bakaburg1/minutemaker)** | 21 | R | — | 2026-01-25 | *"Generate meeting minutes starting from an audio recording or a transcripts using speech-to-text and LLMs"* | — | ✅ | — |
| **[`odest/katip`](https://github.com/odest/katip)** | 15 | TypeScript | — | 2026-09-13 | *"transcribes, summarizes, and extracts action items from meeting recordings, lectures"* | — | ✅ | ✅ |
| **[`mraza007/minute`](https://github.com/mraza007/minute)** | 16 | Rust | — | 2026-08-14 | *"Fully offline meeting notetaker for macOS — records, transcribes, and summarizes on-device with Whisper"* | — | ✅ | — |
| **[`minhnguyen1108/meeting-action-extractor`](https://github.com/minhnguyen1108/meeting-action-extractor)** | 1 | Python | — | 2026-08-12 | *"Offline meeting action-item extraction with owners, deadlines, and review flags"* | — | — | ✅ **owners + deadlines** |

All rows `VERIFIED via https://api.github.com/search/repositories and https://api.github.com/repos/... (fetched 2026-09-19)`.

**Reading of this landscape:**
- The star leader `meetily` (30.9k) is a **local-first desktop app**, not a service — evidence that the market's gravity for privacy-preserving MoM is on-device.
- `silverstein/minutes` reached 1,487 ★ in **~6 months** (created 2026-03-18), and its pitch is *"Claude Code, Codex, Cursor, and any MCP client can query"* — i.e. **the MoM consumer is increasingly an AI agent, not a human reading a document.** Design your data model to be MCP-queryable.
- `attendee-labs/attendee` carries a **NOASSERTION licence** — GitHub could not identify an SPDX licence. **Treat its licence as UNVERIFIED** and have counsel read the actual licence file before self-hosting commercially.
- **No OSS repo I found does diarization + summarisation + action items *with owners and due dates* well.** The closest is `odest/katip` (action items, no owners) and `minhnguyen1108/meeting-action-extractor` (owners + deadlines, 1 ★, unproven). **This is genuine white space.**

---

## A4. Summarisation strategy

### A4.1 The published literature, with arXiv IDs

All verified via `https://export.arxiv.org/api/query` and `https://arxiv.org/abs/...` (fetched 2026-09-19).

| Paper | arXiv | Venue | Why it matters here |
|---|---|---|---|
| **QMSum: A New Benchmark for Query-based Multi-domain Meeting Summarization** | **[arXiv:2104.05938](https://arxiv.org/abs/2104.05938)** | **NAACL 2021** | The canonical meeting-summarisation benchmark: **1,808 query-summary pairs over 232 meetings**, multiple domains. Establishes *query-based* summarisation — summarise **in response to a query**, not one monolithic summary. States plainly that *"it is hard to create a single short summary that covers all the content of a long meeting."* Uses a **locate-then-summarize** method. |
| **MeetingBank: A Benchmark Dataset for Meeting Summarization** | **[arXiv:2305.17529](https://arxiv.org/abs/2305.17529)** | **ACL 2023** | **Directly relevant architecture.** *"a **divide-and-conquer** approach, which involves dividing professionally written meeting minutes into shorter passages and **aligning them with specific segments of the meeting**. This breaks down the process of summarizing a lengthy meeting into smaller, more manageable tasks."* Also: meeting corpora are scarce because *"topics discussed are confidential"* — your enterprise data will look like this. |
| **MUG: A General Meeting Understanding and Generation Benchmark** | **[arXiv:2303.13939](https://arxiv.org/abs/2303.13939)** | **ICASSP 2023** | **AliMeeting4MUG Corpus: 654 recorded Mandarin meeting sessions** with manual annotations for **topic segmentation, topic-level and session-level extractive summarisation, topic title generation, keyphrase extraction, and action item detection.** Proof that the task should be decomposed into these sub-tasks, and that a **non-English** meeting corpus is a first-class research target. |
| **Meeting Action Item Detection with Regularized Context Modeling** | **[arXiv:2303.16763](https://arxiv.org/abs/2303.16763)** | **ICASSP 2023** | The dedicated action-item-detection paper. Introduces a **Chinese meeting corpus with manual action-item annotations** and a **Context-Drop** approach using *"both local and global contexts by contrastive learning."* Also evaluates on the **English AMI corpus**. Confirms: *"datasets manually annotated with action item detection labels are scarce and in small scale."* |
| **Action-Item-Driven Summarization of Long Meeting Transcripts** | **[arXiv:2312.17581](https://arxiv.org/abs/2312.17581)** | **NLPIR 2024** | **The most directly copyable architecture.** *"recursively generating summaries and employing our action-item extraction algorithm for each section of the meeting **in parallel**"*, then combining. Introduces **three methods for dividing long transcripts into topic-based sections** specifically *"to resolve the issue of large language models (LLMs) **forgetting long-term dependencies**."* Reports **BERTScore 64.98 on AMI**, ~**+4.98%** over a fine-tuned BART SOTA. |
| **Summarizing Speech: A Comprehensive Survey** | **[arXiv:2504.08024](https://arxiv.org/abs/2504.08024)** | **EMNLP 2025** | The current survey. Notes the field *"remains loosely defined"*, documents the shift *"from traditional systems to advanced models like fine-tuned cascaded architectures and end-to-end solutions"*, and names the open challenges: **realistic evaluation benchmarks, multilingual datasets, and long-context handling.** Your three hardest problems are the field's three hardest problems. |
| **SCM: Enhancing LLM with Self-Controlled Memory Framework** | **[arXiv:2304.13343](https://arxiv.org/abs/2304.13343)** | **DASFAA 2025** | The **rolling-memory** design. Three components: *"an LLM-based agent..., a **memory stream** storing agent memories, and a **memory controller** updating memories and determining when and how to utilize memories."* Plug-and-play, no fine-tuning. Evaluated on *"long-term dialogues, book summarization, and **meeting summarization**"* — an annotated dataset exists. **This is the closest thing to an academic blueprint for a rolling MoM.** |
| **A Novel LLM-based Two-stage Summarization Approach for Long Dialogues** | **[arXiv:2410.06520](https://arxiv.org/abs/2410.06520)** | 2024 | **Map-reduce with unsupervised topic segmentation.** *"segments and condenses information from long documents"*; **unsupervised topic segmentation identifies semantically appropriate breakpoints**; condensation with an LLM; then fine-tune the summariser on condensed data. Explicitly framed as enabling *"long documents to be processed on models even when the document length exceeds the model's maximum input size."* |
| **CREAM: Comparison-Based Reference-Free ELO-Ranked Automatic Evaluation for Meeting Summarization** | **[arXiv:2409.10883](https://arxiv.org/abs/2409.10883)** | 2024 | How to **evaluate** your MoM without reference summaries. Uses chain-of-thought + key-facts alignment to score **conciseness and completeness**, and **ELO ranking** to compare prompt configurations. Directly addresses that *"existing methods often fall short when applied to complex tasks like long-context summarizations and dialogue-based meeting summarizations."* **Use this to A/B your prompts instead of hand-waving.** |
| **GADR: Gathering Architecture Decision Records from Meeting Transcriptions** | **[arXiv:2608.17694](https://arxiv.org/abs/2608.17694)** | 2026 (cs.SE) | **Decision detection — and the single most cautionary finding.** A **multi-agent, self-correcting** workflow extracting decisions from *"raw meeting transcriptions."* Its premise: previous LLM approaches wrongly assumed *"input is already reasonably structured"*, whereas reality is *"informal, noisy meetings where choices are implicit, fragmented, and entangled with off-topic dialogue, precisely the conditions under which **single-pass prompting degrades**."* **Critical warning:** *"RAG-based enrichment improving ADR depth while simultaneously **risking transcript-unfaithful content**, raising open questions about **traceability**."* |
| **AMI Meeting Corpus** | [groups.inf.ed.ac.uk/ami/corpus](https://groups.inf.ed.ac.uk/ami/corpus/) | 2005– | **100 hours of meeting recordings**, multi-modal, fully annotated; scenario + non-scenario meetings. The standard evaluation set (used by the action-item paper above). | 
| **Fine-grained/legacy meeting summarisation** | [arXiv:1606.07849](https://arxiv.org/abs/1606.07849) (SIGDIAL 2012), [arXiv:2311.04292](https://arxiv.org/abs/2311.04292) (IEEE BigData 2023) | — | Older *"Focused Meeting Summarization via Unsupervised Relation Extraction"* and *"Aspect-based Meeting Transcript Summarization: A Two-Stage Approach with Weak Supervision on Sentence Classification"* — both confirm the **two-stage (classify/filter then summarise)** pattern predates LLMs and keeps working. |

### A4.2 Strategy comparison — what to actually build

| Strategy | Latency to first output | Cost | Long-meeting quality | Failure mode | Fit for our product |
|---|---|---|---|---|---|
| **Single-pass full-context** | Full meeting duration (or 0 if you re-run after) | **Cheapest** — 1 call | Good if transcript fits and instruction-following is strong | Silent truncation; lost middle; **degrades when choices are "implicit, fragmented, entangled with off-topic dialogue"** (GADR) | ✅ **For post-meeting final MoM** if it fits (see A4.3) |
| **Map-reduce** | After all chunks complete (barrier) | N chunk calls + 1 reduce | Good coverage; some loss of cross-chunk reasoning | Cross-references between distant chunks vanish (decision at min 5, rationale at min 55) | ✅ For post-meeting, with **topic-based** not fixed-size chunking |
| **Refine / rolling ("carry a running summary forward")** | **Incremental — available throughout** | N sequential calls (slow to finish, but streams) | Best continuity of narrative/decisions | **Drift/error accumulation**; early summary biases later ones; no chance to revisit | ✅ **The right choice for the live rolling MoM** |
| **Hierarchical / two-stage topic-segmented** | After segmentation | N + M calls | **Best structure** (agenda-shaped output) | Segmentation errors propagate; needs a topic segmenter | ✅ **Best for the final MoM document** |
| **Query-focused (QMSum-style)** | On demand | 1 call per query | Excellent relevance per question | Not a document; needs a query | ✅ For "what did we decide about X?" search, not for the minutes themselves |

**Recommended architecture — hybrid, and this is what the literature supports:**

1. **Live (every N minutes): rolling/refine summarisation** on the last window, carrying a compact running state (decisions, open questions, action items so far). This is **SCM's memory-stream + memory-controller** pattern `VERIFIED via https://arxiv.org/abs/2304.13343`.
2. **Post-meeting: hierarchical, topic-segmented, action-item-driven.** Topic-segment (per `arXiv:2312.17581`'s three sectioning methods and `arXiv:2410.06520`'s unsupervised topic segmentation), extract action items **per section in parallel**, then reduce into one coherent MoM. `VERIFIED via https://arxiv.org/abs/2312.17581 (fetched 2026-09-19)`
3. **Always keep a query path** over the raw segments (QMSum-style locate-then-summarize) for follow-up questions.
4. **Evaluate with CREAM** (`arXiv:2409.10883`) to compare prompt configurations via ELO rather than vibes.

### A4.3 Context-window math — and why full-context is a trap *here*

**The estimate from the brief, checked:**

| Quantity | Estimate | Reasoning |
|---|---|---|
| Speaking rate | ~130–150 wpm | Standard conversational speech |
| 2-hour meeting | ~16,000–18,000 words | 120 min × 133–150 wpm |
| English tokens | **~22,000–25,000 tokens** | ~1.33–1.4 tokens/word for English |

So a 2-hour English meeting ≈ **22–25k tokens**, and a **3-hour** meeting ≈ **33–37k tokens**. Both fit comfortably inside a 128k window, and trivially inside a 1M window (e.g. a 10-hour meeting ≈ 110–125k tokens still fits 128k). **So yes — for English, naive full-context summarisation of a business meeting is genuinely viable, and this is the correct default for the post-meeting MoM.** `This is an arithmetic estimate, not a measured value — marked ESTIMATE.`

**BUT — the Vietnamese multiplier changes the conclusion.** Vietnamese is written with diacritics and word boundaries in Latin script, and BPE tokenisers handle it far less efficiently than English. Vietnamese text typically costs roughly **1.5–2.5× more tokens than English for the same semantic content** (the low end for common syllables, the high end for diacritic-heavy or domain-specific text).

| Scenario | Transcript tokens (ESTIMATE) | Fits 128k? | Fits 1M? |
|---|---|---|---|
| 2 h English | ~22–25k | ✅ easily | ✅ |
| 2 h Vietnamese (1.5×) | ~33–38k | ✅ | ✅ |
| 2 h Vietnamese (2.5×) | ~55–63k | ✅ | ✅ |
| 2 h Vietnamese→English **translated** transcript + original side by side | **~55–88k** | ✅ but expensive | ✅ |
| 4 h Vietnamese (2.5×), bilingual | **~110–175k** | ⚠️ **borderline / overflows** | ✅ |
| 8 h all-day workshop, bilingual | **~220–350k** | ❌ | ✅ |

`All token figures are ESTIMATES derived from the stated wpm and token-multiplier assumptions. **They are NOT verified against a real tokenizer.**`

> **UNVERIFIED but important:** I could not measure the Vietnamese token multiplier empirically in this session (no tokenizer available offline, and `huggingface.co` is blocked, so I could not pull a tokenizer). **Before you architect around a large context window, measure it**: take 3 real Vietnamese meeting transcripts, run them through the exact tokenizer of your chosen model, and compute tokens/hour. That single measurement decides whether you need chunking at all. Treat the table above as a hypothesis to falsify, not a fact.

**Why to chunk anyway, even when it fits** (the arguments that survive even if context is large):

1. **Action items and decisions are localised.** Section-level extraction (then merge) outperforms asking one prompt to find everything in a 25k-token blob, because attention thins and instructions get diluted.
2. **Rolling output is a product requirement**, not just a cost trick — the user wants a MoM update every N minutes. That is inherently incremental.
3. **Cost scales linearly with tokens per call.** Re-summarising the whole meeting every 5 minutes is O(n²) in meeting length. A rolling state is O(n).
4. **GADR's finding:** single-pass prompting degrades *specifically* on informal, fragmented meetings. `VERIFIED via https://arxiv.org/abs/2608.17694 (fetched 2026-09-19)`
5. **Traceability.** If you chunk and keep segment IDs, every MoM sentence can cite `[seg 412 @ 00:47:12 SPEAKER_02]`. If you summarise a single blob, you cannot reliably point back — and GADR names **traceability** as the central open problem. `VERIFIED via https://arxiv.org/abs/2608.17694 (fetched 2026-09-19)`

---

## A5. Action items & decisions with owners and due dates

### A5.1 Known failure modes

Synthesised from the action-item literature and GADR:

| Failure mode | Mechanism | Evidence / source |
|---|---|---|
| **Hallucinated action items** — plausible-sounding to-dos nobody agreed to | LLM generates from meeting *topic* rather than from actual commitments. GADR: RAG enrichment drives *"transcript-unfaithful content"* | `VERIFIED via https://arxiv.org/abs/2608.17694 (fetched 2026-09-19)` |
| **Wrong/no owner** — assigns to the meeting organiser by default | Ownership is often implied, not stated ("I'll take that", "you can do that one"). Without speaker attribution the pronoun has no referent | Inference from `arXiv:2303.16763` (Context-Drop uses **local + global context** precisely because local context is insufficient) |
| **Invented due dates** | Dates are often relative ("by end of sprint", "next Tuesday") or absent. The unalignable-token issue in WhisperX means numeric dates may lack timestamps | WhisperX limits: words like `"2014."` / `"£13.60"` *"cannot be aligned and therefore are not given a timing"* — `VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)` |
| **Missed implicit decisions** | *"choices are implicit, fragmented, and entangled with off-topic dialogue"* | GADR, `VERIFIED via https://arxiv.org/abs/2608.17694 (fetched 2026-09-19)` |
| **Duplicate action items across chunks** | Rolling/map-reduce extraction re-emits the same commitment per section | Structural; addressed by the merge/dedupe stage in `arXiv:2312.17581` |
| **Speaker-label churn breaks owner assignment** | `SPEAKER_00` in chunk 1 ≠ `SPEAKER_00` in chunk 5 unless diarization is globally consistent (or enrollment fixes labels) | See A6 |
| **ASR errors on names** | Vietnamese names, non-English names, and acronyms are the highest-error tokens; owner names are exactly these | Consequence of `arXiv:2504.08024` multilingual-dataset gap |

**On published evaluations of action-item accuracy:** the honest answer is that **the field lacks a strong, standard, public action-item-accuracy benchmark.** `arXiv:2303.16763` states directly that *"datasets manually annotated with action item detection labels are scarce and in small scale"*, and it had to build a new Chinese corpus. `VERIFIED via https://arxiv.org/abs/2303.16763 (fetched 2026-09-19)`. The two public resources are (a) that Chinese corpus merged with the **English AMI corpus**, and (b) the **AliMeeting4MUG** corpus with action-item-detection annotations (`arXiv:2303.13939`). There is **no widely-cited F1 leaderboard for "action item + owner + due date" extraction**. Build your own eval set from real meetings — you have no choice.

**Academic work on "meeting decision detection":** the specific term *"decision detection"* in the meeting literature is **thin** — my arXiv search `ti:"decision detection"` returned only signal-processing papers (soft/hard-decision detection in communications), i.e. a terminology collision. `VERIFIED via https://export.arxiv.org/api/query?search_query=ti:%22decision+detection%22 (fetched 2026-09-19)`. The closest real work is **GADR** (`arXiv:2608.17694`, architecture decisions from transcripts) and **QMSum** (`arXiv:2104.05938`), whose framing explicitly targets *"the key decisions made and the tasks to be completed."* `UNVERIFIED: I did not find a mature dedicated "meeting decision detection" benchmark under that exact name.`

### A5.2 Prompting patterns that actually work

These combine the papers' findings with the practical constraints identified above.

| Pattern | Why | Source |
|---|---|---|
| **Pass timestamps + speaker names with every utterance** | Gives the model the referent for "I'll do that" and an anchor for due dates | WhisperX/Recall both emit word/segment timestamps; `arXiv:2303.16763` (Context-Drop: local + global context) |
| **Require a verbatim evidence quote + timestamp for every action item** | The anti-hallucination control. It makes fabrication expensive: the model must point at real text. This is the single highest-leverage mitigation against GADR's "transcript-unfaithful content" | `VERIFIED via https://arxiv.org/abs/2608.17694 (fetched 2026-09-19)` |
| **Require `null`/`unknown` explicitly for missing owner or due date** | Prevents the default-owner and invented-date failures; an explicit "unknown" is far more useful than a confident guess | Direct consequence of the failure table above |
| **Extract per topic-section in parallel, then merge & dedupe** | `arXiv:2312.17581` does exactly this and beats BART SOTA by ~4.98% BERTScore | `VERIFIED via https://arxiv.org/abs/2312.17581 (fetched 2026-09-19)` |
| **Two-pass: extract candidates → verify each against its cited span** | GADR is a **multi-agent, self-correcting** workflow for exactly this reason; it "captures most expert-identified decisions" | `VERIFIED via https://arxiv.org/abs/2608.17694 (fetched 2026-09-19)` |
| **Topic-segment before summarising instead of fixed-size chunking** | Lets a decision and its rationale stay in the same chunk; `arXiv:2312.17581` introduces three sectioning methods; `arXiv:2410.06520` uses unsupervised topic segmentation | `VERIFIED via https://arxiv.org/abs/2312.17581 and https://arxiv.org/abs/2410.06520 (fetched 2026-09-19)` |
| **Give explicit min/max speaker counts when known** | AssemblyAI: *"providing an incorrect exact count can negatively affect diarization accuracy"* — use ranges | `VERIFIED via https://www.assemblyai.com/docs/speech-to-text/speaker-diarization (fetched 2026-09-19)` |
| **Evaluate with reference-free ELO rank, not one-shot scores** | CREAM: chain-of-thought + key-facts alignment + ELO ranking to compare prompt configurations | `VERIFIED via https://arxiv.org/abs/2409.10883 (fetched 2026-09-19)` |

**Concrete prompt skeleton (recommended):**

```
You extract action items from meeting transcripts. You will receive closed
captions as: [hh:mm:ss] <speaker_name>: <text>

For each action item output:
  - action:      imperative description
  - owner:       speaker name if explicitly assigned, else null
  - due_date:    ISO date if explicitly stated, else null
  - confidence:  high | medium | low
  - evidence:    EXACT verbatim quote from the transcript
  - timestamp:   the [hh:mm:ss] of that quote
  - segment_id:  the segment id of that quote

RULES:
  1. Every action item MUST have a verbatim evidence quote. If you cannot
     quote it, DO NOT output the item.
  2. Never invent an owner. "we should", "someone should" => owner = null.
  3. Never invent a date. "soon", "next week" => due_date = null, and put the
     literal phrase in the note field.
  4. Do not repeat an item already listed in PREVIOUS_ACTION_ITEMS.
  5. Prefer missing an item over fabricating one.
```

Rule 1 and rule 5 are the load-bearing ones. Rule 4 is what makes rolling extraction safe.

---

## A6. Speaker naming — mapping `SPEAKER_00` to real people

### A6.1 The four mechanisms, ranked by reliability

| # | Mechanism | How it works | Reliability | Effort |
|---|---|---|---|---|
| **1** | **Platform participant list (best)** | Bot joins the meeting; platform exposes the participant roster and (with per-stream audio) which stream belongs to which participant. Recall's **perfect diarization** returns **participant speaker labels out of the box** | ★★★★★ — no acoustic guessing | Low, if you use a bot |
| **2** | **Per-participant audio streams** | Each participant's audio is transcribed separately, so the label *is* the partition | ★★★★★ | Low, if bot supports it |
| **3** | **Active-speaker events ("speaker-timeline")** | Map transcript time ranges onto the participant the platform says was speaking | ★★☆☆☆ — *"depends on unreliable 'who's talking' UI signals"*; Recall lists it as a distinct method | Low |
| **4** | **Voice enrollment / speaker identification** | Enroll voiceprints per person; match diarized clusters against them | ★★★☆☆ (depends on enrollment quality) | **High — you must build enrollment UX** |

Mechanisms 1–3 are `VERIFIED via https://docs.recall.ai/docs/diarization.md (fetched 2026-09-19)`.

### A6.2 Enrollment / voice embedding — the OSS options

| Option | What it gives you | Licence | Status |
|---|---|---|---|
| **SpeechBrain ECAPA-TDNN** | Speaker embeddings + verification; VoxCeleb speaker-id accuracy *"around 97–98%"* | **Apache-2.0** | **Actively maintained** — PyPI 1.1.1 (2026-08-27) |
| **Resemblyzer** | 256-dim voice embedding; *"create a voice profile for a person from a few seconds of speech (5s–30s)"*; cosine similarity + threshold for verification | **Apache-2.0** | **Stale** — PyPI 0.1.4, last released **2023-10-12** |
| **pyannoteAI voiceprints** | Managed speaker identification from enrolled voiceprints | Commercial | **Precision-2 / Precision-3 only — NOT Community-1** |
| **AssemblyAI Speaker Identification** | Replaces generic labels with real names/roles as a post-step on the transcript | Commercial (API) | Production-ready |
| **Speechmatics Speaker identification** | Distinct documented feature alongside diarization | Commercial (API) | Production-ready |

`VERIFIED via https://github.com/speechbrain/speechbrain/tree/develop/recipes/VoxCeleb/SpeakerRec, https://pypi.org/pypi/speechbrain/json, https://github.com/resemble-ai/Resemblyzer, https://pypi.org/pypi/Resemblyzer/json, https://docs.pyannote.ai/models.md, https://www.assemblyai.com/docs/speech-to-text/speaker-diarization, https://docs.speechmatics.com/speech-to-text/features/diarization (all fetched 2026-09-19)`

### A6.3 Self-introduction detection — a pragmatic fallback

There is **no paper I found** that validates "self-introduction detection" as a naming method; treat it as an engineering heuristic, not a researched technique. `UNVERIFIED — no supporting literature located.` The idea: on a transcript with speaker labels, prompt an LLM with the first ~3 minutes and ask it to map `SPEAKER_nn` → name based on self-introductions and vocatives ("Thanks, Linh", "over to you Minh"). It works when people introduce themselves; it fails silently when they don't, so it **must** be presented as a suggestion for human confirmation, never as fact.

### A6.4 What commercial tools do

- **Bot-based tools (the winning approach):** Recall.ai makes **perfect diarization its default and recommended method** precisely because it yields participant names without acoustic diarization. `VERIFIED via https://docs.recall.ai/docs/diarization.md (fetched 2026-09-19)`
- **Meeting BaaS** shipped *"Signed-in Teams joins and **accurate speaker names**"* in **v2.6.17 (2026-09-18 — the day before this report)**. `VERIFIED via https://docs.meetingbaas.com/ (fetched 2026-09-19)`
- **AssemblyAI** positions Speaker Identification as the explicit name-replacement step over diarization. `VERIFIED via https://www.assemblyai.com/docs/speech-to-text/speaker-diarization (fetched 2026-09-19)`
- **Calendar attendee-list matching**: I did **not** find a vendor doc publicly describing "map diarized cluster → calendar attendee". It is a reasonable inference (bots like Recall/Meeting BaaS do have **calendar integrations** — Recall: *"Google Calendar and Microsoft Calendar integration"*; Meeting BaaS: *"2/10/100/1000 calendar integrations"* by plan) but **the specific matching behaviour is UNVERIFIED.** `VERIFIED that calendar integrations exist via https://recall.ai/pricing and https://meetingbaas.com/en/pricing (fetched 2026-09-19)`

**Recommended naming ladder for the product:**
1. If a bot can join → use **participant labels** (done, free, perfect).
2. Else → use **hybrid diarization** (separate streams + machine within stream).
3. Else → display `Speaker 1/2/3` plus a **one-click "who is this?"** prompt; let the user name a speaker once and **back-propagate the name across the whole transcript**.
4. Offer **optional voice enrollment** (SpeechBrain ECAPA) for recurring meeting series — highest value for recurring internal meetings, and it needs explicit consent (see Part B5).
5. Never auto-assign a real name without either platform truth or human confirmation.

---

## A7. Chunking, latency, and the rolling MoM data model

### A7.1 Latency budget

Observed real-world latencies from vendor docs — these are the numbers to design against:

| Stage | Latency | Evidence |
|---|---|---|
| Bot admits to meeting, joins, starts recording | Seconds (platform-dependent) | Recall requires `in_call_recording` state before realtime events flow — `VERIFIED via https://docs.recall.ai/docs/real-time-endpoints.md (fetched 2026-09-19)` |
| Realtime **raw audio** egress (Recall) | **200 ms chunks**, mono 16-bit signed LE PCM @ **16 kHz**, base64 `buffer` + relative/absolute timestamp | `VERIFIED via https://docs.recall.ai/docs/how-to-get-mixed-audio-real-time.md (fetched 2026-09-19)` |
| Realtime **raw audio** egress (Meeting BaaS) | **100 ms** binary PCM chunks; 16/24/32/48 kHz (default 24 kHz); plus JSON speaker-state updates | `VERIFIED via https://docs.meetingbaas.com/api-v2/streaming (fetched 2026-09-19)` |
| **Realtime transcript** (Recall) | *"webhook updates every 1–3 seconds"*; partials *"hundreds of ms to low seconds" — varies by provider* | `VERIFIED via https://docs.recall.ai/docs/bot-real-time-transcription.md (fetched 2026-09-19)` |
| Streaming diarization labels (pyannoteAI Live-1) | **sub-300 ms**, 100 ms chunks | `VERIFIED via https://docs.pyannote.ai/models.md (fetched 2026-09-19)` |
| Offline diarization (community-1, self-host) | ~31 s per hour of audio (AMI IHM, H100) | `VERIFIED via https://github.com/pyannote/pyannote-audio (fetched 2026-09-19)` |
| ASR (WhisperX, batched large-v2) | 70× realtime | `VERIFIED via https://github.com/m-bain/whisperX (fetched 2026-09-19)` |
| LLM rolling summary | Seconds per window | Not measured |

**Design consequence:** the translation path can be near-real-time (100–300 ms audio chunks + sub-second streaming STT). **The MoM path is deliberately slower** — do not try to emit minutes every 10 seconds. **Emit a rolling MoM every 2–5 minutes.**

### A7.2 Rolling MoM cadence — recommended

| Cadence | Trigger | Content |
|---|---|---|
| **Continuous (≤2 s)** | Every finalized utterance | Live captions + live translation in the UI. **No LLM summarisation.** |
| **Every 2–5 min** | Window boundary | Incremental summary of the window → merge into running state. Update *open questions* and *candidate action items* only. |
| **On agenda-topic change** | Topic-segmentation signal (`arXiv:2410.06520` / `arXiv:2312.17581`) | Close out the topic section, emit a section summary |
| **At meeting end** | Call ends | Full **hierarchical, action-item-driven** MoM: parallel per-section action-item extraction → merge, dedupe, resolve references against the running state |
| **On demand** | User query | QMSum-style locate-then-summarize over `segments` |

**Critical rule:** the rolling summary must be **recomputed from the running state + the new window only** — never by re-summarising the whole transcript. Otherwise cost is O(n²) and quality *degrades* as the summary gets diluted.

### A7.3 Data model

The `segments` table is the spine. Everything else references it, and every generated claim must carry a `segment_id` so it is auditable (GADR's traceability requirement).

```sql
-- MEETING ---------------------------------------------------------------
CREATE TABLE meetings (
  id              UUID PRIMARY KEY,
  title           TEXT,
  platform        TEXT,            -- zoom | meet | teams | webex | desktop | upload
  meeting_url     TEXT,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  capture_source  TEXT,            -- bot | desktop_overlay | browser_tab | upload
  source_language TEXT,            -- e.g. 'vi'
  output_language TEXT,            -- e.g. 'en'
  consent_state   TEXT NOT NULL,   -- see B5: announced | all_consented | denied | unknown
  consent_log_id  UUID REFERENCES consent_logs(id),
  audio_retention TEXT,            -- e.g. 'delete_after_transcription' | '30d'
  transcript_only BOOLEAN DEFAULT FALSE   -- "translate, don't store" mode
);

-- SPEAKERS --------------------------------------------------------------
CREATE TABLE speakers (
  id            UUID PRIMARY KEY,
  meeting_id    UUID REFERENCES meetings(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,     -- 'SPEAKER_00' | participant id
  display_name  TEXT,              -- resolved real name, NULL until confirmed
  name_source   TEXT,              -- platform | enrollment | self_intro | manual
  name_confidence NUMERIC(3,2),    -- 0..1 ; NULL if platform-provided truth
  voiceprint_id UUID,              -- enrolled embedding (needs consent!)
  is_verified   BOOLEAN DEFAULT FALSE
);
CREATE UNIQUE INDEX ON speakers(meeting_id, label);

-- SEGMENTS (the spine) --------------------------------------------------
CREATE TABLE segments (
  id             BIGSERIAL PRIMARY KEY,
  meeting_id     UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  idx            INT  NOT NULL,          -- monotonic order
  start_ms       INT  NOT NULL,
  end_ms         INT  NOT NULL,
  speaker_id     UUID REFERENCES speakers(id),
  text           TEXT NOT NULL,          -- source language
  lang           TEXT NOT NULL,          -- BCP-47, e.g. 'vi'
  translation    TEXT,                   -- target language
  translation_lang TEXT,
  words          JSONB,                  -- [{w,start_ms,end_ms,score}] from alignment
  confidence     NUMERIC(4,3),           -- ASR confidence if available
  is_final       BOOLEAN DEFAULT TRUE,   -- FALSE for streaming partials
  source         TEXT                    -- stt provider + model
);
CREATE INDEX ON segments(meeting_id, idx);
CREATE INDEX ON segments(meeting_id, start_ms);

-- ROLLING SUMMARY STATE -------------------------------------------------
CREATE TABLE summary_windows (
  id            BIGSERIAL PRIMARY KEY,
  meeting_id    UUID REFERENCES meetings(id) ON DELETE CASCADE,
  window_index  INT NOT NULL,
  start_ms      INT NOT NULL,
  end_ms        INT NOT NULL,
  first_seg_id  BIGINT REFERENCES segments(id),
  last_seg_id   BIGINT REFERENCES segments(id),
  window_summary TEXT NOT NULL,
  model         TEXT, llm_prompt_version TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, window_index)
);

-- TOPIC SECTIONS (for hierarchical final MoM) ---------------------------
CREATE TABLE topic_sections (
  id           BIGSERIAL PRIMARY KEY,
  meeting_id   UUID REFERENCES meetings(id) ON DELETE CASCADE,
  idx          INT,
  title        TEXT,
  start_ms     INT, end_ms INT,
  first_seg_id BIGINT, last_seg_id BIGINT,
  section_summary TEXT
);

-- ACTION ITEMS / DECISIONS ---------------------------------------------
CREATE TABLE action_items (
  id            UUID PRIMARY KEY,
  meeting_id    UUID REFERENCES meetings(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,      -- 'action' | 'decision' | 'open_question'
  text          TEXT NOT NULL,
  owner_speaker_id UUID REFERENCES speakers(id),   -- NULL = unassigned
  owner_raw     TEXT,               -- literal phrase if ambiguous
  due_date      DATE,               -- NULL if not explicitly stated
  due_raw       TEXT,               -- 'end of sprint', 'next Tuesday'
  confidence    NUMERIC(3,2),
  evidence_quote TEXT NOT NULL,     -- VERBATIM. Enforce NOT NULL.
  evidence_seg_id BIGINT NOT NULL REFERENCES segments(id),
  evidence_ts_ms  INT NOT NULL,
  status        TEXT DEFAULT 'open',
  dedupe_key    TEXT,               -- hash(text+evidence_seg_id) for merge stage
  created_by    TEXT                -- 'rolling' | 'final_merge' | 'user'
);
```

**Design notes:**
- `segments.evidence` → `evidence_quote NOT NULL` + `evidence_seg_id NOT NULL` on `action_items` is what **mechanically enforces** the anti-hallucination prompt rule. If the extractor can't cite, the insert fails.
- `is_final` on `segments` lets you render streaming partials in the UI and then replace them, matching Recall's documented pattern: *"deliver low-latency intermediate transcript data... then replace them with the finalized transcript once it arrives."* `VERIFIED via https://docs.recall.ai/docs/bot-real-time-transcription.md (fetched 2026-09-19)`
- `transcript_only` + `audio_retention` are **compliance fields, not features** — they exist so you can prove a "translate, don't store" mode (see B5).
- `words JSONB` preserves WhisperX's word-level alignment for click-to-seek and precise subtitle rendering.

---

# PART B — HOW TO GET MEETING AUDIO + LEGAL

## B1. Meeting-bot services with current pricing

### B1.0 The live-translation filter (read this first)

The product wants **LIVE translation**. That immediately eliminates most of the market. A vendor only qualifies if it can deliver **raw or transcribed meeting audio to your server continuously while the meeting is in progress**. Three things matter:

1. **Does it stream audio out?** (raw PCM over WebSocket is the gold standard)
2. **What is the chunk size / latency?**
3. **Does it work on the platforms your users actually use?** (separate-audio streaming is *not* universal even at a single vendor)

| Vendor | Streams raw audio out? | Chunk size / format | Latency | Live-translation verdict |
|---|---|---|---|---|
| **Recall.ai** | ✅ `audio_mixed_raw` **and** `audio_separate_raw` | **200 ms** chunks, mono 16-bit signed LE PCM @ 16 kHz, base64 | ~200 ms audio chunks; transcripts 1–3 s | ✅ **Yes** |
| **Meeting BaaS** | ✅ `streaming_config.output_url` | **100 ms** binary PCM chunks; 16/24/32/48 kHz (default 24 kHz) | ~100 ms | ✅ **Yes** |
| **Vexa** | ✅ real-time WebSocket transcripts (Apache-2.0, self-hostable) | Not detailed on pricing page | Real-time | ✅ **Yes** |
| **Attendee** | ✅ **YES** — `websocket_settings.audio` (mixed) **and** `websocket_settings.per_participant_audio` | base64 **16-bit mono PCM**; **8000 / 16000 / 24000** Hz (default 16000); bidirectional | Not stated (depends on speech-segment pauses) | ✅ **Yes** — and **self-hostable** |
| **Skribby** | ✅ Realtime addon bundle: *"Realtime meeting events, control actions, and **raw audio** in one bundle"* | — | Realtime models | ✅ **Yes** |
| **Nylas Notetaker** | ❌ CLI/API returns recording + transcript JSON after the call | — | Post-meeting | ❌ No (post-meeting only) |
| **Fireflies.ai API** | ❌ *"Post-meeting audio processing"* | — | Post-meeting | ❌ No |

Evidence for each row is in B1.1–B1.7 below.

**⚠️ Platform-width warning with real teeth:** even Recall.ai — the broadest-coverage vendor — supports **separate real-time audio per participant on Zoom, Teams and Google Meet only (16 concurrent speakers)**, and **NOT** on Webex, Slack Huddles, or GoTo Meeting. `VERIFIED via https://docs.recall.ai/docs/how-to-get-separate-audio-per-participant-realtime.md (fetched 2026-09-19)`. Mixed raw audio is broader (Zoom, Teams, Meet, Webex ✅; Slack Huddles Beta ✅; GoTo Meeting Beta ❌). `VERIFIED via https://docs.recall.ai/docs/how-to-get-mixed-audio-real-time.md (fetched 2026-09-19)`. **If Vietnamese enterprise users are on Webex, live per-speaker translation is not available from Recall.**

### B1.1 Recall.ai — the reference implementation

**Pricing** — `VERIFIED via https://recall.ai/pricing (fetched 2026-09-19)`

| Item | Price |
|---|---|
| **Pay As You Go** | **$0.50 / hour of recording** |
| Launch / Enterprise | Custom pricing (talk to sales) |
| **Built-in transcription** | **+$0.15 / hour** (or bring 3rd-party providers) |
| Recording storage | **7 days free**, then **$0.05 per hour of recording per 30 days** |
| Free trial | **First 5 hours of recording free** on Pay As You Go |
| Startup program | **$0.25/hour for first 10,000 hours** (application required) |
| Calendar API | **Free** |
| Volume discounts | Yes |

**Billing nuances** — `VERIFIED via https://recall.ai/pricing (fetched 2026-09-19)`:
- **Participant count does not affect price**: *"a 1 hour meeting with 10 participants is billed at the same rate as a 1 hour meeting with 1 participant."*
- **Prorated to the second**: a 30-minute meeting on PAYG costs $0.25.
- **Meeting Bot API and Desktop Recording SDK cost the same** ($0.50/hr either way).

**Platforms:** Zoom, Google Meet, Microsoft Teams, Webex, GoTo Meeting, Slack Huddles. Data residency: **US, EU or JP**. `VERIFIED via https://recall.ai/pricing (fetched 2026-09-19)`

**Real-time media — three separate products:** `VERIFIED via https://docs.recall.ai/llms.txt and per-page docs (fetched 2026-09-19)`

| Capability | Doc | Key facts |
|---|---|---|
| **Realtime endpoints** (webhook or websocket) | [real-time-endpoints](https://docs.recall.ai/docs/real-time-endpoints) | Bots must be in `in_call_recording` state for events to flow. Each websocket endpoint = its own connection, open until you close it or the call ends. **No static IPs/domains for allowlisting** — authenticate via HMAC instead |
| **Mixed raw audio (realtime)** | [how-to-get-mixed-audio-real-time](https://docs.recall.ai/docs/how-to-get-mixed-audio-real-time) | `recording_config.audio_mixed_raw = {}`. **Mono 16-bit signed LE PCM @ 16 kHz in 200 ms chunks**, base64 in `audio_mixed_raw.data` event, with `relative` + `absolute` timestamps |
| **Separate audio per participant (realtime)** | [how-to-get-separate-audio-per-participant-realtime](https://docs.recall.ai/docs/how-to-get-separate-audio-per-participant-realtime) | `recording_config.audio_separate_raw = {}`. Zoom/Teams/Meet only, **16 concurrent speakers**. ⚠️ **"Real-time screenshare audio isn't captured at this time"** |
| **Video+audio RTMP out** | [stream-real-time-video-rtmp](https://docs.recall.ai/docs/stream-real-time-video-rtmp) | Broadcast/process live over RTMP |
| **Output Media / speaking bot** | [stream-media](https://docs.recall.ai/docs/stream-media) | Bot can **speak into the meeting**; needed for spoken translation output |
| **Zoom RTMS (botless)** | [meeting-direct-connect-for-zoom-rtms](https://docs.recall.ai/docs/meeting-direct-connect-for-zoom-rtms) | Zoom only. **Requires a Zoom App passing Zoom's app-review process.** **Receive-only** (no Output Media). **No Breakout Rooms.** **Zoom RTMS is a paid Zoom feature** — either use your own Zoom RTMS credits or Recall bundles credits for customers on a Recall plan |

**Realtime latency, measured in vendor docs** — `VERIFIED via https://docs.recall.ai/docs/bot-real-time-transcription.md (fetched 2026-09-19)`:
- **Expected: webhook updates every 1–3 seconds.**
- Partial/low-latency mode: *"the frequency is typically in the hundreds of ms to low seconds range but varies slightly by provider."*
- ⚠️ **`assembly_ai_async_chunked` and `recallai_streaming` in `prioritize_accuracy` mode use ASYNC (pre-recorded, non-real-time) models under the hood — so their latency differs.** If you want low latency, use `mode: "prioritize_low_latency"`.
- ⚠️ **Webhooks are sent serially and in utterance order.** *"blocking a webhook request will delay any subsequent requests"* — \**"if you're running in a single-threaded environment, you should make sure that any processing of the transcription webhook happens asynchronously"*. This is a real architectural trap.

**Built-in transcription:** Recall offers `recallai_streaming` (recommended, fastest, easiest) and integrates Deepgram, AssemblyAI, Speechmatics, ElevenLabs, Rev, AWS Transcribe, and meeting-caption transcription. `VERIFIED via https://docs.recall.ai/docs/recallai-transcription.md and https://docs.recall.ai/docs/transcription.md (fetched 2026-09-19)`

**Desktop Recording SDK** — relevant because it is the bot-free path: `VERIFIED via https://docs.recall.ai/docs/audio-only.md (fetched 2026-09-19)`
- **Audio-only recording mode** requires **macOS 14.2+** when using the DSDK on Apple Silicon.
- macOS permissions: `system-audio` + `accessibility` + `microphone`; **`screen-capture` no longer needed** for audio-only.
- **Windows machines require no permissions.**
- Production macOS apps **must** include **`NSAudioCaptureUsageDescription`** in `Info.plist` or the permission dialog will not appear in production.
- The Desktop SDK supports **real-time transcription** with speaker-attributed events, and can diarize. `VERIFIED via https://docs.recall.ai/docs/dsdk-realtime-transcription.md (from llms.txt index, fetched 2026-09-19)`

### B1.2 Meeting BaaS

**Pricing** — `VERIFIED via https://meetingbaas.com/en/pricing (fetched 2026-09-19)`

| Plan | Price | Bots/day | Calendar integrations | Data retention |
|---|---|---|---|---|
| Pay As You Go / Free | Free | 75 | 2 | 3 days |
| Pro | **$99/mo** | 300 | 10 | 7 days |
| Scale | **$199/mo** | 1,000 | 100 | 14 days |
| Enterprise | **$299/mo** | 3,000 | 1,000 | 30 days (multi-zone data residency coming soon*) |

**Headline: "From $0.35 per recording hour", "8 hours free to start", "3 meeting platforms", tokens never expire.**

**Token consumption model** — this is the actual cost structure — `VERIFIED via https://meetingbaas.com/en/pricing (fetched 2026-09-19)`:

| Usage | Tokens/hour |
|---|---|
| **Raw Recording** (*"Includes speaker diarization"*) | **1.00** |
| Transcription (Gladia) | **+0.25** |
| BYOK Transcription (bring your own key) | **+0.05** |
| **Streaming** | **+0.10 per input or output** |

⚠️ **Discrepancy to be aware of:** the pricing-page FAQ/estimator states *"Real-time Streaming: Enable audio/video streaming (**+0.20 tokens/hr**)"* while the token-rate table says *"+0.10 per input or output"* — i.e. +0.20 when you use both directions. `VERIFIED via https://meetingbaas.com/en/pricing (fetched 2026-09-19)` — the two are consistent if "per input or output" is read literally, but the page presents them differently. Confirm with the vendor before modelling costs.

**Token pack pricing** (tokens never expire) — `VERIFIED via https://meetingbaas.com/en/pricing (fetched 2026-09-19)`:

| Pack | Price | Tokens | Per token |
|---|---|---|---|
| Boost | $50 | 100 | $0.50 |
| Growth | $100 | 220 | $0.45 |
| Power | $625 | 1,550 | $0.40 |
| Infinity | $1,500 | 4,250 | **$0.35** |

⚠️ **Important billing trap, stated on the page:** *"Raw recording tokens would be charged even when a bot has not been accepted in a meeting based on the duration the bot was waiting to be accepted."* A bot stuck in a waiting room burns tokens.

**Realtime streaming (the key capability)** — `VERIFIED via https://docs.meetingbaas.com/api-v2/streaming (fetched 2026-09-19)`:
- **Output streaming**: receive the meeting's mixed audio in real time via WebSocket.
- **Input streaming**: send audio into the meeting (for speaking bots).
- **Bidirectional**: both at once, single or two WebSocket connections.
- **Managed real-time transcription**: Meeting BaaS can run the STT and stream transcript events to your WebSocket.
- **Speaker diarization**: real-time speaker state updates as JSON alongside the audio.
- **Sample rates**: 16,000 / **24,000 (default)** / 32,000 / 48,000 Hz.
- **All platforms**: Google Meet, Microsoft Teams, Zoom.
- Audio delivered as **binary PCM chunks every 100 ms**.
- Config: `streaming_enabled: true`, `streaming_config: { output_url, input_url, audio_frequency }`.
- Two modes: `mode: "audio"` (raw audio) vs `mode: "transcription"` (managed STT → JSON transcript events).
- In `transcription` mode `output_url` is **required** — bot creation fails without it.

**Transcription providers:** Gladia (default), Deepgram, AssemblyAI, Speechmatics, Soniox for batch; **plus ElevenLabs for real-time streaming**. BYOK supported. `VERIFIED via https://docs.meetingbaas.com/api-v2/transcription (fetched 2026-09-19)`

**Speaker names:** v2.6.17 (2026-09-18) shipped *"Signed-in Teams joins and accurate speaker names"*. `VERIFIED via https://docs.meetingbaas.com/ (fetched 2026-09-19)`
**Self-hosting** is offered, plus Bring Your Own Storage (S3-compatible) and an MCP server. `VERIFIED via https://docs.meetingbaas.com/ (fetched 2026-09-19)`

### B1.3 Attendee

**Pricing** — `VERIFIED via https://attendee.dev/pricing (fetched 2026-09-19)`

| Plan | Price |
|---|---|
| **Pay As You Go** | **Five hours free, then $0.50/hour.** Volume discounts down to **$0.35/hour** |
| Enterprise | **Custom** — fixed monthly, self-hosted or cloud |

**Included features (from the pricing page):** *"Unlimited Attendee API Access · Meeting recording and storage · **Realtime and post-meeting transcription** · Bot can output audio and video"*. `VERIFIED via https://attendee.dev/pricing (fetched 2026-09-19)`

**Platforms:** Microsoft Teams, Google Meet, Zoom. `VERIFIED via https://attendee.dev/docs (fetched 2026-09-19)`

**Open source:** `attendee-labs/attendee` — **730 ★**, Python, **NOASSERTION licence ⚠️**, last push 2026-09-17. Self-hosted stack: **Django, Postgres, Redis**. Attendee claims running your own instance reduces costs *"10x vs closed-source vendors"*. `VERIFIED via https://api.github.com/repos/attendee-labs/attendee and https://attendee.dev/docs (fetched 2026-09-19)`

#### ✅ RESOLVED: Attendee *does* stream raw audio — and it is bidirectional

My initial read of the pricing page left this open, but Attendee's docs site (not linked from pricing) documents it fully. `VERIFIED via https://docs.attendee.dev/guides/realtimeaudio (fetched 2026-09-19)`

| Capability | Detail |
|---|---|
| **Mixed realtime audio** | `websocket_settings.audio = { url: "wss://...", sample_rate: 16000 }` |
| **Per-participant realtime audio** | `websocket_settings.per_participant_audio = { url: "wss://...", sample_rate: 16000 }` |
| **Format** | `chunk` = **base64-encoded 16-bit single-channel PCM** |
| **Sample rates** | mixed: **8000 / 16000 / 24000** (default 16000); per-participant: **8000 or 16000** (default 16000) |
| **Triggers** | `realtime_audio.mixed`, `realtime_audio.per_participant` |
| **Timestamp** | `timestamp_ms` included |
| **Speaker resolution** | per-participant payload includes **`participant_uuid`**; resolve it to a full participant object via the `participant_events.join_leave` webhook |
| **Bidirectional** | Send `realtime_audio.bot_output` with a base64 PCM chunk and **the bot speaks in the meeting** |
| **Sample apps** | https://github.com/attendee-labs/voice-agent-example |

**Transcription modes and diarization quality** — `VERIFIED via https://docs.attendee.dev/guides/transcription (fetched 2026-09-19)`:

| Mode | How it works | Diarization | Latency |
|---|---|---|---|
| **Third-party-based** | Uses **a per-speaker audio stream per participant**; when a participant pauses a few seconds, the segment is sent to the STT provider | *"perfect speaker identification, also known as diarization"* | **Higher** — depends on provider processing + **segment size**; *"If a participant speaks for a long time without pausing, the audio segment sent for transcription will be large, increasing processing time"* |
| **Closed-caption-based** | Uses the platform's own captions | *"Perfect speaker identification"* | Lower (per the doc's comparison) |

⚠️ **Important platform caveat (same pattern as Recall):** *"Perfect speaker identification for **Google Meet and Zoom** via separate audio streams. Since the **Teams Web client only exposes one mixed audio stream, we use speaker events for Teams** diarization."* `VERIFIED via https://docs.attendee.dev/guides/transcription (fetched 2026-09-19)`

**Providers:** Deepgram, Gladia, AssemblyAI, OpenAI. BYOK (you supply the provider API key). `VERIFIED via https://docs.attendee.dev/guides/transcription (fetched 2026-09-19)`

**Verdict for live translation: ✅ YES — Attendee is a genuine option, and the strongest one for data sovereignty**, because you get per-participant realtime PCM **and** you can self-host the whole stack (Django/Postgres/Redis) so meeting audio never leaves your infrastructure. That is a decisive advantage for **Vietnamese data-localisation and GDPR/works-council** scenarios (see B5). Its *"perfect speaker identification"* for Meet and Zoom, and the participant-uuid → name resolution, solve the naming problem in Part A6 the same way Recall does. The Teams-web mixed-stream limitation is the thing to check against your user base.

Also note Attendee supports **Zoom RTMS** via an "App Sessions" API — *"RTMS streams meeting data directly to your application without adding anyone to the call"* — which is directly relevant to the OBF problem in B1.8. `VERIFIED via https://docs.attendee.dev/guides/zoom/zoomrtms (fetched 2026-09-19)`

It remains the strongest **self-hostable / data-residency** option (their own testimonial cites Swiss hospitals whose compliance rules prohibit sending data to external systems — `VERIFIED via https://attendee.dev/docs`).

### B1.4 Vexa

**Pricing** — `VERIFIED via https://vexa.ai/pricing (fetched 2026-09-19)`

| Plan | Price | What you get |
|---|---|---|
| **Open source** | **$0** | **Apache-2.0**, self-host forever, full platform on your infra, Google Meet + Teams + Zoom, real-time transcription self-hosted, your storage, MCP + REST API + WebSockets + dashboard, community support |
| **Individual** | **$12/seat/mo** | MCP for agents, 3 platforms, real-time transcription included, 12-month audio storage, one concurrent bot, unlimited meetings |
| **Build on Vexa** | **$0.30/bot-hr** | API, unlimited bots. *"+$0.20/hr transcription · [$0.50/hr all-in]"* |
| **Enterprise** | Custom | Self-hosted, self-updating ("Vexa Delivery"), data-residency review, SLA, volume pricing |

**Free credit:** every new account gets **$2 free bot credit**, no credit card — *"~6 hours of bot time at $0.30/hr"*. Top-ups from $10. `VERIFIED via https://vexa.ai/pricing (fetched 2026-09-19)`

**Repo:** `Vexa-ai/vexa` — **2,803 ★**, 477 forks, Python, **Apache-2.0**, 601 open issues, last push **2026-09-19** (same day). *"Open-source meeting transcription API for Google Meet, Microsoft Teams & Zoom. Auto-join bots, real-time WebSocket transcripts, MCP server for AI agents."* `VERIFIED via https://api.github.com/repos/Vexa-ai/vexa (fetched 2026-09-19)`

**Vexa's own competitive claim:** *"Vexa is open source, self-hostable, and up to 40% cheaper. Bot: $0.30/hr vs Recall.ai ~$0.50/hr."* `VERIFIED via https://vexa.ai/pricing (fetched 2026-09-19)` — note this is *Vexa's own* marketing, not an independent benchmark.

**Verdict:** **the best option if data sovereignty or cost dominates.** Apache-2.0 + self-hostable + real-time WebSocket transcripts is exactly the shape this product needs. The 601 open issues are a maturity signal worth weighing against the 2.8k stars.

### B1.5 Skribby (an Alianza Company)

**Pricing** — `VERIFIED via https://skribby.io/pricing (fetched 2026-09-19)`

| Component | Price |
|---|---|
| **Base rate** (bot deployment + raw audio recording + live webhooks) | **$0.35/hour** ($0.00583/min) |
| Free tier | "Get Started Free", **no credit card required** |
| Storage included | **1 week** |

**"+ transcription" all-in examples** (base $0.35 + model) — `VERIFIED via https://skribby.io/pricing (fetched 2026-09-19)`:

| Provider / Model | All-in $/hour | Flags |
|---|---|---|
| Groq Whisper Large v3 Turbo | $0.39 | Custom vocab |
| xAI STT | $0.45 | Diarization |
| Soniox v5 Async | $0.45 | Diarization, custom vocab |
| **Soniox v5 Realtime** | **$0.52** | **Realtime + diarization** |
| AssemblyAI Universal-Realtime | $0.55 | Realtime |
| AssemblyAI Universal | $0.55 | Diarization, custom vocab, profanity filter |
| Deepgram Nova-2 | $0.61 | Diarization |
| **Deepgram Nova 2-Realtime** | **$0.75** | **Realtime + diarization** |
| Deepgram Nova-3 | $0.67 | Diarization |
| **Deepgram Nova 3-Realtime** | **$0.87** | **Realtime + diarization** |
| Speechmatics Realtime | $0.80 | Realtime, diarization |
| ElevenLabs Scribe V2 Realtime | $0.86 | Realtime |
| **AssemblyAI Universal-3 Pro Streaming** | **$0.97** | **Realtime + diarization** |
| Gladia Realtime | $1.16 | Realtime |
| Google Cloud Chirp 3 Realtime | $1.36 | Realtime |

**Addons** — `VERIFIED via https://skribby.io/pricing (fetched 2026-09-19)`:
- **Realtime features +$0.05/hour**: *"Realtime meeting events, control actions, and **raw audio** in one bundle. Enabled by default without surcharge on realtime models."*
- Video addon **+$0.05/hour**
- **1 Year Storage +$0.05/hour**

**BYOK** supported for any provider. `VERIFIED via https://skribby.io/pricing (fetched 2026-09-19)`

**Verdict:** the **cheapest full stack for live work at ~$0.35 + $0.05 (realtime) + transcription ≈ $0.40 + STT**, and its per-model table is the most transparent pricing I found anywhere in this market. **Alianza** ownership is a stability signal. Platforms: Zoom, Teams, Google Meet.

### B1.6 Also-ran / adjacent vendors worth knowing

| Vendor | What it is | Why it matters | Evidence |
|---|---|---|---|
| **Nylas Notetaker** | Bundled recording + transcription + **calendar sync** + summaries; CLI one-liner | **$0.70/hour bundled**, 5 free sandbox hours. **Post-meeting only** — no live audio. Best if you need calendar/email integration | `VERIFIED via https://www.nylas.com/blog/best-meeting-bot-apis/ (fetched 2026-09-19)` |
| **Fireflies.ai API** | Post-meeting NLP / CRM enrichment; accepts **audio uploads from any source** | Custom pricing, free plan. **Not a live-capture product** | `VERIFIED via https://www.nylas.com/blog/best-meeting-bot-apis/ (fetched 2026-09-19)` |
| **Zoom native** | Zoom Cloud Recording API | ⚠️ *"Cloud Recording API returns post-meeting files only. No live media ingestion"*. For live you need the **Zoom Meeting SDK** or **RTMS** | `VERIFIED via https://www.nylas.com/blog/best-meeting-bot-apis/ (fetched 2026-09-19)` |
| **Microsoft native** | MS Graph + **Microsoft Real-time Media Platform** | *"Graph API lacks real-time media support"*; real-time requires the **Real-time Media Platform** | `VERIFIED via https://www.nylas.com/blog/best-meeting-bot-apis/ (fetched 2026-09-19)` |
| **Google Meet native** | — | *"**No dedicated API for recording or media access.**"* Recording restricted to certain Workspace plans (Business Standard+, Enterprise). Calendar API gives metadata only | `VERIFIED via https://www.nylas.com/blog/best-meeting-bot-apis/ (fetched 2026-09-19)` |
| **`screenappai/meeting-bot`** | OSS universal meeting bot | 176 ★, 2026-08-28 | `VERIFIED via https://api.github.com/search/repositories (fetched 2026-09-19)` |

> ⚠️ **Market risk flagged by a third party:** Nylas states *"In 2026: **Zoom has begun restricting third-party recording bots in some enterprise configurations.** Meeting bot APIs are actively working around this; watch vendor changelogs."* `VERIFIED via https://www.nylas.com/blog/best-meeting-bot-apis/ (fetched 2026-09-19)` — This is a **single-vendor claim (Nylas is a competitor to Recall/Attendee) and I could not independently corroborate it.** Treat as `UNVERIFIED but material`: **build platform-agnostic capture (bot + desktop + browser) rather than betting the product on bot-only capture.**

### B1.7 Recommendation for the live-translation use case

| If your priority is… | Choose | Why |
|---|---|---|
| **Fastest time to market, broadest platforms, best docs** | **Recall.ai** | Only vendor with documented **per-participant** realtime raw audio + realtime transcripts + output audio (bot can speak) + Zoom RTMS. Best-documented (llms.txt + `.md` on every page). $0.50/hr + $0.15/hr STT |
| **Cost + full control + data sovereignty** | **Vexa** (self-host, Apache-2.0) or **Meeting BaaS** (self-host option) | Vexa $0.30/bot-hr hosted, $0 self-hosted. Meeting BaaS has BYO storage + self-hosting |
| **Cheapest managed live path** | **Skribby** | $0.35 base + $0.05 realtime + your choice of STT from a very transparent menu |
| **Self-hosted enterprise / regulated (data must not leave infra)** | **Attendee** | Django/Postgres/Redis, self-hostable — but **confirm raw-audio egress** for live translation |

**⚠️ Critical caveat on price:** your per-hour cost is **not** the bot's recording fee. For live translation you pay for **recording + realtime audio streaming + STT + MT + LLM summarisation**. Using Recall's own numbers as an example: $0.50 (recording) + $0.15 (built-in STT) = **$0.65/hr before translation and summarisation**, and if you enable perfect diarization for **real-time** you should expect **~1.8× the transcription credit usage**. `VERIFIED via https://docs.recall.ai/docs/bot-real-time-transcription.md (fetched 2026-09-19)`

---

---

# PART B2/B3/B4 — HOW TO GET THE AUDIO (capture mechanisms)


> Provenance note: B2 (desktop), B3 (browser) and B4 (mobile) below are a separate research workstream from a second agent, run on the same date (2026-09-19) and using the same verification tagging. It includes its own reachability ledger, which matters because **`developer.android.com` and `developer.chrome.com` were network-unreachable**, so Android evidence comes from the AOSP source mirror and Chrome-internals claims are marked unverified.


## B2.0 Method, provenance and reachability (read this first)

### B2.0.0.1 Evidence-marking convention

* `VERIFIED via <url> (fetched 2026-09-19)` — I fetched that URL in this session and read the extracted text.
* `VERIFIED via <url> (via JSON data endpoint, fetched 2026-09-19)` — `developer.apple.com` renders its documentation in JavaScript, so `curl` on the HTML page yields a JS shell with no content. For Apple pages I fetched the **same page's underlying data endpoint** (`https://developer.apple.com/tutorials/data/documentation/<path>.json`). The URL cited is the canonical human-facing page; the content came from Apple's own JSON for that page.
* `UNVERIFIED/not reachable` — the site timed out, returned 403, or returned only a JS shell / geo-redirect. I say *explicitly* which.

### B2.0.0.2 Host reachability actually observed (2026-09-19)

| Host | Result | Consequence for this report |
|---|---|---|
| `learn.microsoft.com` | Reachable, full text extracted | Windows section is fully primary-sourced |
| `developer.apple.com` (HTML) | Reachable but **JS-only** (1 line of text stripped) | Used the `.json` data endpoint instead |
| `developer.apple.com/videos` | Reachable, **full transcript text extracted** | WWDC citations are primary |
| `developer.apple.com/app-store/review/guidelines/` | Reachable, full text | Cited for iOS review constraints |
| `developer.apple.com/forums` | Reachable but **JS-only** (no content) | Forum thread cited as search-result-only |
| `support.apple.com/guide/...` | HTTP 200 but **redirects every guide URL to the same generic TOC page**; real article body not obtainable | Apple's Multi-Output Device guide is `UNVERIFIED`; replaced with BlackHole's own setup docs |
| `github.com` | Reachable but **flaky** — several fetches succeeded, one later fetch of the same host timed out after 20 s | Used for BlackHole README + AOSP mirror |
| `docs.recall.ai` (HTML) | Reachable, JS shell; `?`→ **`.md` suffix works perfectly** | Recall doc citations are primary |
| `www.recall.ai/blog/...` | Reachable, full text | Cited |
| `rogueamoeba.com` | Reachable, full text | Cited |
| `developer.mozilla.org` | Reachable, full text | Cited |
| `caniuse.com` | Reachable | Cited |
| `www.w3.org` | Reachable, full text | Cited |
| `granola.ai` / `docs.granola.ai` | Reachable; `docs.granola.ai/...md` gives raw markdown | Cited — **the strongest product evidence in this report** |
| `otter.ai` | Reachable | Cited (marketing copy only) |
| `fireflies.ai` | Reachable | Cited (marketing copy only) |
| **`developer.android.com`** | **Connection TIMEOUT (curl 28), not 403.** Also `source.android.com`, `android.googlesource.com`, `developer.android.google.cn` all time out | **Android cannot be primary-sourced from Google docs from this machine.** Replaced with the AOSP source mirror on GitHub |
| **`developer.chrome.com`** | **Connection TIMEOUT** | Chrome tab-capture docs `UNVERIFIED`; MDN + W3C + caniuse used instead |
| `help.otter.ai` | **HTTP 403** | Otter help-centre articles `UNVERIFIED` |
| `apps.apple.com` (App Store listings) | HTTP 200 but **geo-redirects to a Chinese App Store homepage** for every app ID (identical MD5 for Granola/Otter/Fireflies) | **App-store listings unusable via curl**; not used as evidence |
| `web.archive.org` | Connection TIMEOUT | Could not use archived copies of blocked Android/Chrome docs |
| `raw.githubusercontent.com` | Blocked per task brief; a fetch attempt returned an empty body | Not used; `github.com` blob view used instead |

**Bottom line on gaps:** every claim about Android and about Chrome-specific tab capture is either sourced from AOSP source code (Android) or marked `UNVERIFIED`. Nothing in those two areas is asserted from an unread page.

---


## B2.1 Summary matrix — can we capture the meeting audio, per platform?

| Platform | Can a third-party product capture **remote participants' audio** (the meeting app's output)? | Mechanism | Driver / installer needed? | User permission / prompt? | Verified? |
|---|---|---|---|---|---|
| **Windows 10/11 desktop** | **YES** | WASAPI **loopback** on a render endpoint (`AUDCLNT_STREAMFLAGS_LOOPBACK`) — built in since Vista | **NO — built into WASAPI, no virtual cable, no VB-Cable** | Desktop Win32: no OS prompt for loopback itself; `ActivateAudioInterfaceAsync` may show a consent prompt (main-UI-thread requirement). UWP: microphone privacy setting | ✅ primary |
| **Windows 10 build 20348+/20438+** | **YES, per-process** | `ActivateAudioInterfaceAsync` + `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK` + `AUDIOCLIENT_ACTIVATION_PARAMS` | **NO** | Same as above | ✅ primary (with a version caveat, §2.4) |
| **macOS ≤ 14.1 (legacy)** | YES, but painful | Virtual audio device (BlackHole / Loopback) + Multi-Output Device | **YES — a system-wide audio driver + manual Audio MIDI Setup** | Driver install (admin), reboot; plus mic permission | ✅ primary |
| **macOS 14.2+ (modern)** | **YES** | **Core Audio process taps** (`CATapDescription` + `AudioHardwareCreateProcessTap` → HAL aggregate device) | **NO — driver-free** | **YES — `NSAudioCaptureUsageDescription` in Info.plist + a system "system audio recording" prompt** | ✅ primary |
| **macOS 13+/15+** | YES | ScreenCaptureKit `SCStreamConfiguration.capturesAudio` (13+) / `captureMicrophone` (15+) | **NO** | **YES — Screen Recording permission (`NSScreenCaptureUsageDescription`) + app restart** | ✅ primary |
| **Browser (desktop)** | Only the tab/window/screen the **user explicitly picks** | `getDisplayMedia({audio:true})` | n/a | **YES — transient user activation + the browser's own picker. Cannot be silent.** | ✅ primary (MDN/W3C) |
| **Browser (mobile web)** | **NO** | `getDisplayMedia` unsupported on Safari iOS / Chrome Android / Firefox Android | n/a | n/a | ✅ primary (caniuse) |
| **iOS** | **NO** for another app's call or a cellular call. **YES** only for a call your own app is carrying (CallKit VoIP). | CallKit `CXProvider` (your own call); ReplayKit / ScreenCaptureKit for screen+app audio | n/a | CallKit + iOS 2.5.14 explicit-consent rule | ✅ primary |
| **Android** | Only via **MediaProjection + AudioPlaybackCapture**, and only for apps that did not opt out and only for `USAGE_MEDIA/GAME/UNKNOWN` | `AudioPlaybackCaptureConfiguration` + `MediaProjection` consent | Root not required for the API path; root/accessibility hacks are the unsanctioned path | **YES — MediaProjection consent dialog; apps can opt out entirely** | ⚠️ primary source = AOSP code; `developer.android.com` **UNREACHABLE** |

**One-line answer to the headline question:** on **Windows it is built in and driver-free**; on **macOS 14.2+ it is driver-free via Core Audio taps**; on **mobile it is effectively impossible for third-party apps**; and **a pure web product cannot capture a native meeting app at all** — it can only capture a browser tab the user deliberately shares.

---


## B2.2 WINDOWS DESKTOP — system audio capture

### B2.2.2.1 Classic WASAPI loopback (the answer is: **no virtual driver needed**)

**VERIFIED via https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording (fetched 2026-09-19)** — page "Loopback Recording", last updated 2025-04-16.

The documented procedure (verbatim structure from the page):

> "In loopback mode, a client of WASAPI can capture the audio stream that is being played by a rendering endpoint device. To open a stream in loopback mode, the client must: Obtain an `IMMDevice` interface for the rendering endpoint device. Initialize a capture stream in loopback mode on the rendering endpoint device. After following these steps, the client can call the `IAudioClient::GetService` method to obtain an `IAudioCaptureClient` interface on the rendering endpoint device."

The two-line diff from normal capture (verbatim):

> "In the call to the `IMMDeviceEnumerator::GetDefaultAudioEndpoint` method, change the first parameter (dataFlow) from `eCapture` to `eRender`."
> "In the call to the `IAudioClient::Initialize` method, change the value of the second parameter (StreamFlags) from 0 to `AUDCLNT_STREAMFLAGS_LOOPBACK`."

**The decisive sentence on the virtual-driver question** (verbatim, my emphasis):

> **"WASAPI supports loopback recording regardless of whether the audio hardware contains a loopback device, or whether the user has enabled the device."**

That sentence is the citation that answers the task's question: **loopback is built into WASAPI; no VB-Cable, no virtual audio driver, no "Stereo Mix" enablement is required.**

Supporting constraints and fidelity notes from the same page:

| Constraint | Verbatim / close paraphrase | Why it matters for us |
|---|---|---|
| Shared mode only | "A client can enable loopback mode only for a shared-mode stream (`AUDCLNT_SHAREMODE_SHARED`). Exclusive-mode streams cannot operate in loopback mode." | If a user forces WASAPI exclusive mode for a meeting app, loopback will not see it |
| How it is implemented | "The implementation of loopback by WASAPI depend on the capabilities of the hardware. If the hardware supports a loopback pin on the render endpoint, WASAPI uses the audio provided on this pin for the loopback stream. When the hardware does not support a loopback pin, WASAPI copies the output stream from the audio engine into the loopback application's capture buffer, in addition to copying the audio data to the hardware's render pin." | Behaviour is hardware-dependent but always works — this is *why* no driver is needed |
| **Hardware loopback devices are a different, worse thing** | "Some hardware vendors implement loopback devices (as opposed to pin instances on render devices) in their audio adapters." Disadvantages listed: "Not all audio adapters have loopback devices. Thus, applications that depend on them will not work on all systems."; "Before an application can record from a loopback device, the user must identify the loopback device and enable it for use."; "Different vendors assign different names… Stereo Mix / Waveout Mix / Mixed Output / What You Hear"; "The lack of standardized names might cause users to have difficulty identifying a loopback device in a list of device names." | **Do not build on "Stereo Mix".** Microsoft's own page discourages it; use the WASAPI API flag |
| Event-driven caveat (old OS) | "In versions of Windows prior to Windows 10 1703, pull-mode capture client does not receive any events when a stream is initialized with event-driven buffering and is loopback-enabled… In Windows 10 versions 1703 and higher, event-driven loopback clients are supported, and no longer need the workaround involving the render stream." | Only a problem for pre-1703 assets; harmless for a 2026 product |
| **DRM / protected content** | "Windows Vista provides digital rights management (DRM)… a trusted audio driver does not permit a loopback device to capture digital streams that contain protected content." | Protected media will be silent in the capture — acceptable for meetings, worth knowing |
| Session scope | "WASAPI loopback by default contains the mix of all audio being played, regardless of the Terminal Services session the audio originated from. For example, you can run a loopback client in a service running in session 0 and capture audio from all user sessions" | System loopback = **everything on the machine**, including notification sounds, music, other calls |
| RDP | "Remote Desktop allows redirecting audio to the client. This is implemented by creating new audio devices that only appear for that session." | A remote-desktop user may need to capture a non-default render endpoint |

**Fidelity / format detail** — VERIFIED via https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-initialize (fetched 2026-09-19):

> "The loopback flag (`AUDCLNT_STREAMFLAGS_LOOPBACK`) enables audio loopback. A client can enable audio loopback only on a rendering endpoint with a shared-mode stream. Audio loopback is provided primarily to support acoustic echo cancellation (AEC)."
> "If audio loopback is enabled, a client can open a capture buffer for the global audio mix by calling the `IAudioClient::GetService` method to obtain an `IAudioCaptureClient` interface on the rendering stream object. If audio loopback is not enabled, then an attempt to open a capture buffer on a rendering stream will fail. **The loopback data in the capture buffer is in the device format, which the client can obtain by querying the device's `PKEY_AudioEngine_DeviceFormat` property.**"
> "As of Windows 10 the relevant event handles are now set for loopback-enabled streams that are active."
> "Note that all streams must be opened in share mode because exclusive-mode streams cannot operate in loopback mode."

Also on this page, the documented `Initialize` failure modes that matter for error handling:
* `AUDCLNT_E_WRONG_ENDPOINT_TYPE` — "The `AUDCLNT_STREAMFLAGS_LOOPBACK` flag is set but the endpoint device is a capture device, not a rendering device."
* `E_INVALIDARG` — "…or the `AUDCLNT_STREAMFLAGS_LOOPBACK` flag is set but ShareMode is not equal to `AUDCLNT_SHAREMODE_SHARED`…"

**Permission model on Windows** — VERIFIED via https://learn.microsoft.com/en-us/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-activateaudiointerfaceasync (fetched 2026-09-19):

> "Depending on which WASAPI interface is activated, this function may display a consent prompt the first time it is called. For example, when the application calls this function to activate `IAudioClient` to access a microphone, the purpose of the consent prompt is to get the user's permission for the app to access the microphone."
> "`ActivateAudioInterfaceAsync` must be called on the main UI thread so that the consent prompt can be shown. If the consent prompt can't be shown, the user can't grant device access to the app."

And commercially corroborated — **VERIFIED via https://docs.recall.ai/docs/macos-permissions.md (fetched 2026-09-19)**:

> "### Permissions are not needed on Windows
> Windows does not require you to request any additional permissions. Any permission requests made on Windows will immediately succeed, and the permission will enter the `granted` state."

**Practical conclusion for Windows:** capture the default *render* endpoint with `AUDCLNT_STREAMFLAGS_LOOPBACK`. No installer, no driver, no reboot, no OS prompt. This is the single easiest platform in this whole report. The main product risks are (a) system loopback is *all* audio, not just the meeting — so notification dings and background music land in the transcript; and (b) exclusive-mode / protected-content edge cases.

### B2.2.2.2 Process loopback (Windows 10 build 20348+/20438+) — per-application capture

This is the newer API that lets you capture **only** the audio from one process tree (or exclude it), which is exactly what a meeting-notes product wants (Zoom's audio, not Spotify's).

**VERIFIED via https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/ (fetched 2026-09-19)** — "Application loopback audio capture":

> "This sample demonstrates the use of `ActivateAudioInterfaceAsync` Win32 API with a new initialization structure. The new data structure makes it possible to restrict captured audio data to that rendered by a specific process and any of its child processes. Windows 10 has always supported capturing all audio that is played on an audio endpoint (referred to as "system" loopback capture), which captures all audio from all apps that are playing sounds on the chosen audio endpoint."
> "With the new structure, only audio from the specified process, and its children, will be captured. Audio rendered by other processes will not be captured. A flag is also provided to reverse the behavior, capturing all system audio except those from the the specified process (and its children). **Furthermore, the capture is not tied to a specific audio endpoint, eliminating the need to create a separate `IAudioClient` to capture from each physical audio endpoint.**"
> "**If the processes whose audio will be captured does not have any audio rendering streams, then the capturing process receives silence.**"
> "Note that this sample requires Windows 10 build 20348 or later."

Sample invocation forms (verbatim):
```
Capture audio from process 1234 and its children:  ApplicationLoopback 1234 includetree Captured.wav
Capture audio from all process except process 1234 and its children: ApplicationLoopback 1234 excludetree Captured.wav
```

**VERIFIED via https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ne-audioclientactivationparams-audioclient_activation_type (fetched 2026-09-19):**

```c
typedef enum AUDIOCLIENT_ACTIVATION_TYPE {
  AUDIOCLIENT_ACTIVATION_TYPE_DEFAULT,
  AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
} ;
```
> "`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK` — Process loopback activation, allowing for the inclusion or exclusion of audio rendered by the specified process and its child processes."
> Requirements table: **Minimum supported client: Windows 10 Build 20348.** Header `audioclientactivationparams.h`. Page last updated 2024-02-22.

**VERIFIED via https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_activation_params (fetched 2026-09-19):**

```c
typedef struct AUDIOCLIENT_ACTIVATION_PARAMS {
  AUDIOCLIENT_ACTIVATION_TYPE ActivationType;
  union {
    AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
  } DUMMYUNIONNAME;
} AUDIOCLIENT_ACTIVATION_PARAMS;
```
Requirements: **Minimum supported client: Windows 10 Build 20348.**

**VERIFIED via https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_process_loopback_params (fetched 2026-09-19):**

```c
typedef struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
  DWORD                TargetProcessId;
  PROCESS_LOOPBACK_MODE ProcessLoopbackMode;
} AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS;
```
> "`TargetProcessId` — The ID of the process for which the render streams, and the render streams of its child processes, will be included or excluded when activating the process loopback stream."
> Requirements: **Minimum supported client: Windows 10 Build 20348.**

**The activation call** — VERIFIED via https://learn.microsoft.com/en-us/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-activateaudiointerfaceasync (fetched 2026-09-19):

```c
HRESULT ActivateAudioInterfaceAsync(
  [in]  LPCWSTR                              deviceInterfacePath,
  [in]  REFIID                               riid,
  [in]  PROPVARIANT                          *activationParams,
  [in]  IActivateAudioInterfaceCompletionHandler *completionHandler,
  IActivateAudioInterfaceAsyncOperation      **activationOperation
);
```
> "**Specify `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK` to activate the audio interface for process loopback capture.**"
> "**Starting with Windows 10 Build 20438, you can specify `AUDIOCLIENT_ACTIVATION_PARAMS` to activate the interface to include or exclude audio streams associated with a specified process ID.**"
> Function-level requirements table: Minimum supported client **Windows 8**, Minimum supported server **Windows Server 2012** (the *function* is old; the *process-loopback mode* is new).

### B2.2.2.3 ⚠️ Version discrepancy — the task brief's "Windows 10 2004+" is **not** what Microsoft documents

| Source (all fetched 2026-09-19) | Stated minimum version |
|---|---|
| `.../ne-audioclientactivationparams-audioclient_activation_type` | **Windows 10 Build 20348** |
| `.../ns-audioclientactivationparams-audioclient_activation_params` | **Windows 10 Build 20348** |
| `.../ns-audioclientactivationparams-audioclient_process_loopback_params` | **Windows 10 Build 20348** |
| `.../nf-mmdeviceapi-activateaudiointerfaceasync` (Remarks) | **Windows 10 Build 20438** |
| `.../applicationloopbackaudio-sample/` | **Windows 10 build 20348 or later** |

**Finding:** Microsoft's own pages disagree with each other (20348 vs 20438), and **none of them says Windows 10 2004 / build 19041**. Build 19041 is Windows 10 2004; build 20348 is the Windows Server 2022 / late-Windows-10 servicing build; 20438 is a later Insider-era build number.

**Recommendation:** treat **20348 as the conservative documented floor** and gate the feature at runtime (try process-loopback activation; on failure — `E_NOTIMPL` / silent zero-audio — fall back to plain system loopback). Do **not** ship a hard `IsWindows10OrGreater(2004)` check claiming Microsoft supports it. The two *functional* risks regardless of build number are documented above: no render streams on the target process ⇒ **silence**, and the process tree (not the app identity) is the capture unit, so browser-based meetings may need you to target the right helper/renderer process.

### B2.2.2.4 Windows — additional evidence

* **Device roles** — VERIFIED via https://learn.microsoft.com/en-us/windows/win32/coreaudio/device-roles (fetched 2026-09-19): `eConsole` / `eCommunications` / `eMultimedia`; `eCommunications` is documented for "Chat and VoIP". Relevant because a meeting app may render to the *communications* endpoint rather than the default multimedia endpoint — enumerate endpoints, or prefer process loopback to dodge the question entirely.
* **Capturing a Stream (capture-path walkthrough)** — VERIFIED via https://learn.microsoft.com/en-us/windows/win32/coreaudio/capturing-a-stream (fetched 2026-09-19). This is the base sample the loopback page tells you to modify.
* **NOT VERIFIED:** the GitHub copy of the sample (`github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback`) — a fetch to `github.com` **timed out** on 2026-09-19. The `learn.microsoft.com` sample page above **was** fetched and says "Browse code / Download ZIP" with files `ApplicationLoopback.cpp`, `LoopbackCapture.cpp/.h`, `Common.h`. Cite the `learn.microsoft.com` URL.

---


## B2.3 MACOS DESKTOP

### B2.3.3.1 (a) Legacy approach — virtual audio device + Multi-Output Device (the onboarding killer)

**BlackHole** — VERIFIED via https://github.com/ExistentialAudio/BlackHole (fetched 2026-09-19):

> "BlackHole is a modern macOS virtual audio loopback driver that allows applications to pass audio to other applications with zero additional latency."
> "**No kernel extensions or modifications to system security necessary**"
> "Compatible with macOS 10.10 Yosemite and newer … Builds for Intel and Apple Silicon"
> "A license is required for all non-GPLv3 projects"  ← **licensing constraint if you were to bundle it**

Install/uninstall reality (verbatim bullets): "Download the latest installer / **Close all running audio applications** / Open and install package / **Restart your system when prompted**". Uninstall: "Delete the BlackHole driver with the terminal command: `rm -R /Library/Audio/Plug-Ins/HAL/BlackHoleXch.driver`" and "Restart CoreAudio with the terminal command: `sudo killall -9 coreaudiod`".

So BlackHole is a **userspace HAL plug-in** (`/Library/Audio/Plug-Ins/HAL/…`), **not** a kernel extension — that part of the task's premise should be corrected. But it is still **a system-wide audio driver install that requires admin rights, closing all audio apps, and a reboot**, plus terminal commands to remove.

The routing setup the user must perform (verbatim, "Record System Audio → Setup Multi-Output Device"):
> "In Audio MIDI Setup → Audio Devices right-click on the newly created Multi-Output and select 'Use This Device For Sound Output'"
> "Set output driver to 'BlackHole' in sending application"
> "Open receiving application and set input device to 'BlackHole'"

Documented Multi-Output failure modes in the same README (verbatim):
> "If you are using a multi-output device, **due to issues with macOS the Built-in Output must be enabled and listed as the top device in the Multi-Output.**"
> "How can I change the volume of a Multi-Output device? — **Unfortunately macOS does not support changing the volume of a Multi-Output device** but you can set the volume of individual devices in Audio MIDI Setup."
> "Why is audio glitching after X minutes when using a multi-output or an aggregate?"

**This is the friction the task asks about, and it is real and documented:** install a system audio driver (admin + reboot) → open Audio MIDI Setup → create a Multi-Output Device → remember the built-in output must be enabled and first → accept that you can no longer change the volume with the keyboard → *then* your app can hear the meeting. Every one of those steps is a documented support-ticket generator.

**Rogue Amoeba Loopback** — VERIFIED via https://www.rogueamoeba.com/loopback/ (fetched 2026-09-19):

> "Make a virtual audio device with audio from the applications on your Mac…"
> "Your virtual audio devices can be configured to have up to 64 channels"
> "Want to get really wild? You can even nest one Loopback device inside another"
> "This download serves as both the free trial and the full version of the software. **Unlock the full version by entering a license key purchased from our store.**"
> "For MacOS 14.5 to 27"

So Loopback is a **paid third-party GUI app the user must buy, install and configure** — realistically not something a product can require. The page also quotes a reviewer on the lineage: "Loopback from @RogueAmoeba is more powerful, very nice and user-friendly version of **Soundflower**."

**Soundflower:** I did **not** fetch any Soundflower documentation. `UNVERIFIED`. The only fetched mention is that testimonial line in the Loopback page and BlackHole's positioning as its successor. Treat Soundflower as *abandoned legacy* — do not build on it, but I cannot cite a page for its status.

**Commercial corroboration that this is the wrong path for an end-user product** — VERIFIED via https://www.recall.ai/blog/core-audio-taps (fetched 2026-09-19):

> "**Virtual loopback drivers like BlackHole or Loopback were the default before Core Audio process taps were introduced in macOS 14.2. Virtual loopback drivers are not ideal for end-user products because they require users to install and configure a third-party application.**"
> "Tools like BlackHole (macOS 10+) and Loopback (macOS 11+) were common workarounds for capturing application or system audio before Core Audio process taps became available."

**Apple's own Multi-Output Device guide:** `UNVERIFIED/not reachable as content`. `https://support.apple.com/guide/audio-midi-setup/set-up-a-multi-output-device-ams3c1a9c8d3/mac` returned HTTP 200 and 570 KB, but the stripper found only the generic Audio MIDI Setup TOC (Welcome / Set up audio devices / Combine audio devices into a single aggregate device / Play audio through multiple devices at once / Set up MIDI devices) — **every guide URL I tried redirected to that same page**. So I can cite Apple's TOC *headings* ("Play audio through multiple devices at once", "Combine audio devices into a single aggregate device") but **not** the body of the Multi-Output Device article. The BlackHole README above is the fetched source for the actual setup steps.

### B2.3.3.2 (b) Modern approach — Core Audio process taps (macOS 14.2+) **and** ScreenCaptureKit (macOS 13+)

#### 3.2.1 Core Audio taps — driver-free, but requires a permission prompt

**VERIFIED via https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps (via JSON data endpoint, fetched 2026-09-19)** — "Capturing system audio with Core Audio taps":

> "**Use a Core Audio tap to capture outgoing audio from a process or group of processes.**
> This sample code project shows you how to use a tap as an input in a HAL aggregate device, just like a microphone. An audio tap object can specify which outputs it captures from a process or group of processes, as well as different mixdown options (mono, stereo, and so on). Taps can be public (visible to all users), or private (only visible inside the process that created the tap). Taps can also **mute the process output so that the process will no longer play to the speaker or selected audio device, and all process output will go to the tap.**"

The documented workflow (code verbatim from the page):

```swift
// Create a tap description.
let description = CATapDescription()
description.name = tapConfiguration.name
description.processes = Array(tapConfiguration.processes)
description.isPrivate = tapConfiguration.isPrivate
description.muteBehavior = CATapMuteBehavior(rawValue: tapConfiguration.mute.rawValue) ?? description.muteBehavior
description.isMixdown = tapConfiguration.mixdown == .mono || tapConfiguration.mixdown == .stereo
description.isMono = tapConfiguration.mixdown == .mono
description.isExclusive = tapConfiguration.exclusive
description.deviceUID = tapConfiguration.device
description.stream = tapConfiguration.streamIndex

// Ask the HAL to create a new tap and put the resulting `AudioObjectID` in `tapID`.
var tapID = AudioObjectID(kAudioObjectUnknown)
AudioHardwareCreateProcessTap(description, &tapID)
```
Then: create a HAL aggregate device with `AudioHardwareCreateAggregateDevice`, read the tap's UID via selector `kAudioTapPropertyUID`, add it to the aggregate with selector `kAudioAggregateDevicePropertyTapList` on the aggregate device ID, and read it like a microphone.

**The two sentences that directly answer the task's questions** (verbatim, my emphasis):

> "**Configure the sample code project** — Before you run the sample code project in Xcode, ensure that you're using **macOS 14.2 or later**."
> "To capture audio with a tap, you need to include the **`NSAudioCaptureUsageDescription`** key in your Info.plist file, along with a message that tells the user why the app is requesting access to capture audio."
> "**The first time you start recording from an aggregate device that contains a tap, the system prompts you to grant the app system audio recording permission.**"

**Answers:**
* *Does the Core Audio tap API capture system/process audio WITHOUT a virtual audio driver?* — **YES.** The page describes a fully in-API path: `CATapDescription` → `AudioHardwareCreateProcessTap` → HAL aggregate device → input stream. **No BlackHole, no Loopback, no Multi-Output Device, no reboot.** This is the direct replacement for §3.1.
* *Does it require a permission prompt?* — **YES.** `NSAudioCaptureUsageDescription` is mandatory, and macOS shows a *system audio recording* prompt the first time you record from an aggregate device containing a tap.

**VERIFIED via https://developer.apple.com/documentation/bundleresources/information-property-list/nsaudiocaptureusagedescription (via JSON data endpoint, fetched 2026-09-19):**
> "A message that tells people why your app is requesting access to capture system audio on macOS."
> Platform availability metadata: **macOS 14.2**.

**VERIFIED via https://developer.apple.com/documentation/coreaudio/catapdescription (via JSON data endpoint, fetched 2026-09-19):**
> "This class describes a tap object that contains an input stream." / "The input stream is a mix of all of the specified processes' output audio."
> Enumerated properties (from the page's topic list): `bundleIDs`, `deviceUID`, `isExclusive`, `isMixdown`, `isMono`, `isPrivate`, `isProcessRestoreEnabled`, `muteBehavior`, `name`, `processes`, `stream`, `uuid`; initializers include `initMonoGlobalTapButExcludeProcesses:`, `initStereoGlobalTapButExcludeProcesses:`, `initMonoMixdownOfProcesses:`, `initStereoMixdownOfProcesses:`, `init(excludingProcesses:andDeviceUID:withStream:)`, `init(processes:andDeviceUID:withStream:)`.

⚠️ **Availability-metadata caveat, stated honestly:** that page's machine-readable platform metadata says `macOS 12.0` / `iOS 15.0`, which is **inconsistent** with every other piece of evidence (the taps article says macOS 14.2; `NSAudioCaptureUsageDescription` is 14.2; Recall says 14.2). Apple's symbol-level JSON often reports framework-level availability. **Trust the article's 14.2 figure, not the metadata blob** — and note `CATapDescription` is also declared for iOS/Mac Catalyst, so do not read the iOS entry as "iOS has system audio taps".

**Third-party confirmation of the 14.2 floor and the fallback problem** — VERIFIED via https://www.recall.ai/blog/core-audio-taps (fetched 2026-09-19):
> "Core Audio process taps are a type of Core Audio Tap introduced in **macOS 14.2** that allow developers to capture audio from applications like Zoom and Google Chrome."
> "If the desktop meeting recorder uses Core Audio process taps, it cannot capture an app's outgoing audio for end-users on **macOS versions earlier than 14.2**. Developers need to create a fallback capture path… One common path teams explore is using **a virtual loopback driver** so the desktop recorder can still capture an app's outgoing audio on older versions of macOS."

Design consequences the source calls out (same page, FAQ):
> "Core Audio process taps can help you capture the meeting application's outgoing audio… However, **they do not capture microphone audio or screen video by themselves.** To build a complete desktop meeting recorder, you also need to capture the local speaker's microphone audio and video. That usually means combining Core Audio process taps with additional capture APIs such as AVFoundation or ScreenCaptureKit."
> "**They also can be difficult to use with browser-based meetings, because meeting audio may come from a renderer or helper process rather than the main browser process.**"

That last point is operationally critical for a Google-Meet-in-Chrome product: you may need `CATapDescription.bundleIDs` / `processes` pointed at Chrome's audio helper, not at "Chrome".

#### 3.2.2 ScreenCaptureKit audio (macOS 13+ / 15+)

**VERIFIED via https://developer.apple.com/documentation/screencapturekit (via JSON data endpoint, fetched 2026-09-19):**
> "Stream screen content and audio to your app with fine-grained control over what you capture."
> "Use ScreenCaptureKit to capture high-performance video and audio across iOS, iPadOS, macOS, tvOS, and visionOS."
> "**Request screen recording permission from the person before capturing content. In the Info pane of the Xcode target editor, add a `NSScreenCaptureUsageDescription` key** with a description of why your app requires screen recording access."

**VERIFIED via https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturesaudio (via JSON data endpoint, fetched 2026-09-19):**
> "A Boolean value that indicates whether to capture audio."
> "**A stream doesn't capture audio by default.** Set this value to `true` if you require audio capture."
> Availability metadata: **macOS 13.0** (also listed iOS 27.0, Mac Catalyst 18.2, tvOS 27.0, visionOS 27.0).

**VERIFIED via https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturemicrophone (via JSON data endpoint, fetched 2026-09-19):**
> Availability metadata: **macOS 15.0** (and Mac Catalyst 18.2). No iOS entry.

**VERIFIED via https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos (via JSON data endpoint, fetched 2026-09-19):**
> "To run this sample app, you'll need the following: A Mac with macOS 15 or later / Xcode 16 or later"
> "**The first time you run this sample, the system prompts you to grant the app Screen Recording permission. After you grant permission, you need to restart the app to enable capture.**"
> "This sample code project is associated with WWDC24 session 10088."

**VERIFIED via https://developer.apple.com/videos/play/wwdc2024/10088/ (fetched 2026-09-19)** — "Capture HDR content with ScreenCaptureKit" (WWDC24):
> "And with that, you can get started capturing HDR images and video with ScreenCaptureKit. To accompany your beautiful HDR streams, this year, you can also record the microphone along with your system audio."
> "By providing a new microphone output on a stream, your app can now **capture three types of media: screen, system audio, and microphone.**"
> "For your app to capture microphone audio on a stream, the `SCStreamConfiguration` offers two new properties. `captureMicrophone` lets your app turn on microphone capture. `microphoneCaptureDeviceID` lets you choose which microphone device to capture."
> Code shown: `config.microphoneCaptureDeviceID = AVCaptureDevice.default(for: .audio)?.uniqueID`
> "**Use this API to easily record and save screen, audio and microphone content in your app.**" (a new SCStream recording API)

**VERIFIED via https://developer.apple.com/videos/play/wwdc2023/10136/ (fetched 2026-09-19)** — "What's new in ScreenCaptureKit" (WWDC23): introduces `SCContentSharingPicker` (the system screen-sharing picker — "the system shares an `SCContentFilter` with your application"), `SCScreenshotManager`, and Presenter Overlay. Key architectural note for us: **"For every `SCStream` that is created, ScreenCaptureKit will notify the screen sharing picker, and a live preview with controls for the stream will be displayed in a new Video menu bar item."** — i.e. ScreenCaptureKit streams are always visible to the user in the menu bar. That is a privacy/UX design constraint, not a hidden-capture API. (WWDC23 10136 does **not** cover audio capture; audio was already in SCK from macOS 13.)

**ScreenCaptureKit vs Core Audio taps — which to use?** Recall's comparison page, VERIFIED via https://docs.recall.ai/docs/desktop-recording-sdk-vs-native-and-cross-platform-apis.md (fetched 2026-09-19):

| Capability | ScreenCaptureKit | CoreAudioTaps |
|---|---|---|
| Captures meeting audio | Yes | Yes |
| Captures microphone audio | **Yes (on macOS 15+ onwards)** | **No** |
| Captures video screen | Yes | No |
| Works on macOS and Windows | No | No |

> "CoreAudioTaps records system audio but not microphone capture. However, CoreAudioTaps can only record outgoing audio on **macOS 14.2+**, meaning developers will need to create a fallback path using a virtual loopback driver for users on earlier versions of macOS."
> "AVFoundation supports microphone capture but does not capture system audio or outgoing app audio."
> "**ScreenCaptureKit can record both outgoing app audio and microphone audio on macOS 15+, but you must create a fallback for microphone audio for users on older versions of macOS** (This is typically done with CoreAudioTaps…)."
> "…they also do not support mute detection… if mute detection is not implemented, the application will continue recording against the user's wishes"
> "Another challenge is ensuring outgoing app audio and microphone audio remain synchronized… each stream has its own timestamps, buffer sizes, sample rates and latency. If this is not accounted for, the audio might experience **drift**."

**Recommended macOS architecture:** Core Audio process tap (system/remote audio, driver-free, macOS 14.2+) + `AVAudioEngine`/`AVCaptureSession` (microphone) + your own clock-alignment and AEC; or a single ScreenCaptureKit `SCStream` with `capturesAudio = true` and `captureMicrophone = true` if you can require macOS 15+. Both need a real permission onboarding flow; both are visible to the user; neither needs BlackHole. Keep a virtual-driver path only for macOS 13–14.1 and accept that it is a degraded, high-friction experience.

### B2.3.3.3 (c) Commercial-SDK context (Recall Desktop Recording SDK)

**VERIFIED via https://docs.recall.ai/docs/audio-only.md (fetched 2026-09-19):**
> "**The audio-only recording mode requires MacOS 14.2+ when using the DSDK on Apple Silicon**"
> "All production apps that want to request the `system-audio` permission from the DSDK will need to have the **`NSAudioCaptureUsageDescription`** key and associated description in their packaged app's `Info.plist`. **Not including it in your packaged app prevents the `audio-only-permission-request` system dialog from showing in production.**"

**VERIFIED via https://docs.recall.ai/docs/macos-permissions.md (fetched 2026-09-19):**
> Permission table (verbatim): `accessibility` — **Yes** — "We use the Accessibility permission to automatically detect meetings and figure out who is speaking during a meeting."; `microphone` — **Yes**; `screen-capture` — "Required to capture both audio and video. If you only need audio, request `system-audio`."; `system-audio` — "Required to capture only audio… to capture the audio of participants other than yourself in your meetings."; `full-disk-access` — No — "We use the Full Disk Access permission to extract the meeting URL from Teams meetings."
> "By default, the Desktop SDK automatically requests permissions for `accessibility`, `microphone`, and `screen-capture` whenever it starts up."
> "**If the user denies your request for a particular permission, you will not be able to request permission again.** Instead, you will need to show a message in your application's UI directing the user to go to their system settings and enable the permission manually."

**VERIFIED via https://docs.recall.ai/docs/dsdk-supported-platforms.md (fetched 2026-09-19):**
> "macOS 13.0+ (**only on Apple Silicon, we do not support Intel Macs**)"
> "Windows 10+ (**only 64bit**) (**build 1803+**)"

**Interpretation:** the market-leading commercial SDK's macOS audio floor (14.2 / 14.2+ Apple Silicon for audio-only) lines up exactly with Apple's Core Audio taps floor. That is strong triangulation that **the Core Audio tap API is the sanctioned modern mechanism** and that commercial products have abandoned the virtual-driver approach. Note also that a shipping commercial SDK still needs `accessibility` + `full-disk-access` for *meeting detection* — a separate, heavier permission burden from the audio capture itself.

---


---

## B2.4 Consolidated architecture recommendation

| Platform | Build this | Do not build this |
|---|---|---|
| **Windows** | WASAPI **process loopback** (`ActivateAudioInterfaceAsync` + `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK`) targeting the meeting app's process tree; **fall back to classic `AUDCLNT_STREAMFLAGS_LOOPBACK`** system loopback if activation fails. No driver. | ❌ A bundled virtual audio cable (VB-Cable etc.) — unnecessary on Windows, and `loopback-recording` explicitly says WASAPI works "regardless of whether the audio hardware contains a loopback device, or whether the user has enabled the device". ❌ Depending on "Stereo Mix". |
| **macOS** | **Core Audio process taps** (`CATapDescription` + `AudioHardwareCreateProcessTap` → HAL aggregate device) for remote audio, macOS 14.2+, + `AVAudioEngine` for mic; **or** one `SCStream` with `capturesAudio` + `captureMicrophone` if you can require macOS 15+. Ship `NSAudioCaptureUsageDescription` (+ `NSScreenCaptureUsageDescription` if using SCK). Handle the "denied ⇒ cannot re-request" UX and the Screen Recording permission + **app restart**. | ❌ Requiring BlackHole or Loopback + a Multi-Output Device for the default path (documented driver install, reboot, Audio MIDI Setup, `sudo killall -9 coreaudiod`, no volume control, "Built-in Output must be enabled and listed as the top device"). Keep it only as an explicit macOS 13–14.1 fallback, if at all. |
| **Browser** | `getDisplayMedia({video:true, audio:true, preferCurrentTab:true})` behind a clear "Share this tab" affordance, with graceful handling of **no audio track** and `NotAllowedError`. Great for a zero-install translation feature. | ❌ Any claim of automatic or silent capture. ❌ Any expectation of native-app audio. ❌ Any mobile-web screen capture (`getDisplayMedia` unsupported on iOS Safari / Chrome Android / Firefox Android). |
| **iOS** | Nothing that taps a call. If you want phone-call notes, you must **be the call** (CallKit VoIP + your own dialer/number, like Granola) — and realistically **outbound only**. In-person capture via mic is fine. | ❌ Tapping cellular/PSTN calls or another app's calls — **no public API exists**. ❌ Assuming ReplayKit/Broadcast Upload Extension captures call audio. ⚠️ ReplayKit is deprecated at iOS 27 in favour of ScreenCaptureKit — verify migration before committing. |
| **Android** | `MediaProjection` (consented, per session) + `AudioPlaybackCaptureConfiguration` for `USAGE_MEDIA`/`USAGE_GAME`/`USAGE_UNKNOWN` playback; in-person mic capture for the mobile use case. | ❌ Expecting VoIP/call audio — non-media usages "CAN NOT be captured". ❌ Expecting capture when an app sets `android:allowAudioPlaybackCapture="false"` or `ALLOW_CAPTURE_BY_NONE`. ❌ Root/accessibility hacks (Play policy risk; unverified). |

**The single most important architectural conclusion for a *web* product:** the browser alone cannot deliver automatic meeting capture. Every credible product in this space ships a **desktop app** for virtual meetings and uses **mobile only for in-person/mic scenarios**. If the product must remain web-only, the honest framing is *"share the tab"*, not *"it records your meetings"*.

---


## B2.9 Appendix — URL status ledger (fetched 2026-09-19)

### B2.9.A.1 Fetched successfully and used as primary evidence

**Microsoft / Windows**
| URL | Note |
|---|---|
| `https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording` | Last updated 2025-04-16. **Core citation for "no driver needed".** |
| `https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-initialize` | Loopback flag semantics, device format, `AUDCLNT_E_WRONG_ENDPOINT_TYPE` |
| `https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ne-audioclientactivationparams-audioclient_activation_type` | Enum; min client Build 20348 |
| `https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_activation_params` | Struct; min client Build 20348 |
| `https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_process_loopback_params` | `TargetProcessId` + `ProcessLoopbackMode`; Build 20348 |
| `https://learn.microsoft.com/en-us/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-activateaudiointerfaceasync` | `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK`; **Build 20438**; consent-prompt/main-UI-thread rules |
| `https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/` | "Application loopback audio capture"; requires build 20348+ |
| `https://learn.microsoft.com/en-us/windows/win32/coreaudio/capturing-a-stream` | Base capture sample |
| `https://learn.microsoft.com/en-us/windows/win32/coreaudio/device-roles` | `eConsole` / `eCommunications` / `eMultimedia` |

**Apple**
| URL | Retrieval |
|---|---|
| `https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps` | JSON data endpoint. **Core citation for macOS 14.2, driver-free taps, `NSAudioCaptureUsageDescription`, permission prompt** |
| `https://developer.apple.com/documentation/coreaudio/catapdescription` | JSON data endpoint (availability metadata inconsistent — flagged) |
| `https://developer.apple.com/documentation/bundleresources/information-property-list/nsaudiocaptureusagedescription` | JSON data endpoint. **macOS 14.2** |
| `https://developer.apple.com/documentation/screencapturekit` | JSON data endpoint. `NSScreenCaptureUsageDescription` |
| `https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturesaudio` | JSON data endpoint. macOS 13.0; audio off by default |
| `https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturemicrophone` | JSON data endpoint. macOS 15.0; **no iOS** |
| `https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos` | JSON data endpoint. macOS 15 + Screen Recording + restart |
| `https://developer.apple.com/documentation/screencapturekit/scstream` | JSON data endpoint. iOS 27.0 |
| `https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration` | JSON data endpoint. iOS 27.0 |
| `https://developer.apple.com/documentation/screencapturekit/scshareablecontent` | JSON data endpoint. **No iOS availability** |
| `https://developer.apple.com/documentation/callkit` | JSON data endpoint |
| `https://developer.apple.com/documentation/callkit/cxprovider` | JSON data endpoint |
| `https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls` | JSON data endpoint |
| `https://developer.apple.com/documentation/replaykit` | JSON data endpoint. "audio from the app and microphone" |
| `https://developer.apple.com/documentation/replaykit/rpscreenrecorder` | JSON data endpoint. **Deprecated at 27.0 → "Use ScreenCaptureKit instead"** |
| `https://developer.apple.com/documentation/replaykit/rpbroadcastsamplehandler` | JSON data endpoint. **Deprecated at 27.0, "No longer supported"** |
| `https://developer.apple.com/documentation/replaykit/rpbroadcastsamplehandler/processsamplebuffer(_:with:)` | JSON data endpoint. Silence-on-unavailable-audio |
| `https://developer.apple.com/videos/play/wwdc2023/10136/` | Full transcript. ScreenCaptureKit picker |
| `https://developer.apple.com/videos/play/wwdc2024/10088/` | Full transcript. Microphone output + recording API (macOS 15) |
| `https://developer.apple.com/app-store/review/guidelines/` | Full text. Guidelines 2.5.1 / 2.5.4 / 2.5.12 / 2.5.14 |

**Web / browser / other**
| URL | Note |
|---|---|
| `https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia` | Transient activation, optional audio, `systemAudio`/`windowAudio`/`preferCurrentTab` |
| `https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia` | Mic only |
| `https://www.w3.org/TR/screen-capture/` | Normative spec |
| `https://caniuse.com/mdn-api_mediadevices_getdisplaymedia` | **All mobile browsers ❌**; 35.85% global |
| `https://github.com/ExistentialAudio/BlackHole` | Virtual driver install/reboot/Multi-Output friction; GPLv3 + commercial licence |
| `https://rogueamoeba.com/loopback/` | Paid virtual audio device; "For MacOS 14.5 to 27" |
| `https://www.recall.ai/blog/core-audio-taps` | macOS 14.2 floor; "not ideal for end-user products" |
| `https://docs.recall.ai/docs/macos-permissions.md` | Permission table; `NSAudioCaptureUsageDescription`; no Windows permissions |
| `https://docs.recall.ai/docs/audio-only.md` | **macOS 14.2+ Apple Silicon for audio-only** |
| `https://docs.recall.ai/docs/dsdk-supported-platforms.md` | macOS 13+ Apple Silicon only; Windows 10 build 1803+ |
| `https://docs.recall.ai/docs/desktop-recording-sdk-vs-native-and-cross-platform-apis.md` | SCK vs CoreAudioTaps capability matrix |
| `https://docs.recall.ai/llms.txt` | Doc index (used for discovery) |
| `https://github.com/aosp-mirror/platform_frameworks_base/blob/master/media/java/android/media/AudioPlaybackCaptureConfiguration.java` | **Primary Android source:** usage allow-list, `allowAudioPlaybackCapture`, `targetSdkVersion >= Q`, opt-out policy, same-profile rule |
| `https://docs.granola.ai/help-center/ios/getting-started.md` | **"Phones don't let apps capture audio from other apps"** |
| `https://docs.granola.ai/help-center/ios/transcription.md` | Mobile = active mic input only |
| `https://docs.granola.ai/help-center/ios/phone-calls.md` | **Outbound-only, own dialer; "strict limitations in iOS"** |
| `https://docs.granola.ai/help-center/taking-notes/transcription.md` | Desktop-only capture; "no meeting bot"; whole-system mix; web app view-only |
| `https://docs.granola.ai/llms.txt` | Doc index (used for discovery) |
| `https://www.granola.ai/blog/how-to-use-granola-with-zoom` | macOS "Screen & System Audio Recording"; Windows needs no audio permission |
| `https://www.granola.ai/blog/granola-google-meet-integration-recording-transcription` | macOS 13+; bot-free; OS-level config |
| `https://www.otter.ai/` | "bot-free on desktop or Chrome, or capture on mobile" |
| `https://fireflies.ai/` | "Mobile App — in-person conversation"; "Desktop App — your calls" |

### B2.9.A.2 Attempted and **NOT** usable (with the exact failure)

| URL | Failure | Consequence |
|---|---|---|
| `https://developer.android.com/media/legacy/audio-playback-capture` | **Connection timeout (curl 28)**, repeated | Android cannot be primary-sourced from Google docs here |
| `https://developer.android.com/reference/android/media/AudioPlaybackCaptureConfiguration` | **Connection timeout** | Same; AOSP mirror used instead |
| `https://developer.android.com/about/versions/10/features` | **Connection timeout** | Android 10 feature-list claims not directly cited |
| `https://developer.android.com/media/platform/sharing-audio-input` | **Connection timeout** | Search-result only |
| `https://source.android.com/docs/core/audio`, `https://android.googlesource.com/` | **Connection timeout** | CDD/AOSP docs unusable |
| `https://developer.android.google.cn/...` | **Connection timeout** | Mirror unusable |
| `https://support.google.com/googleplay/android-developer/answer/16944162` (+ `/9888170`) | Google host blocked/unreachable | **Play Store policy risk claim left UNVERIFIED** |
| `https://developer.chrome.com/docs/extensions/reference/api/tabCapture` | **Connection timeout** | `chrome.tabCapture` claim left UNVERIFIED |
| `https://developer.chrome.com/blog/avoiding-oversharing-when-screen-sharing` | **Connection timeout** | Chrome oversharing guidance left UNVERIFIED |
| `https://web.archive.org/web/2024/...` (Android + Chrome docs) | **Connection timeout** | No archived fallback available |
| `https://developer.apple.com/forums/thread/770475`, `.../thread/842854` | HTTP 200 but **JS shell, no content** (4 lines) | Forum evidence is search-result-only |
| `https://support.apple.com/guide/audio-midi-setup/set-up-a-multi-output-device-ams3c1a9c8d3/mac` and `.../play-audio-through-multiple-devices-at-once-...` and `.../combine-audio-devices-...` | HTTP 200 but **all redirect to the same generic Audio MIDI Setup TOC**; body not obtainable | Apple's Multi-Output Device article UNVERIFIED; BlackHole README used for the setup steps |
| `https://apps.apple.com/us/app/granola-ai-notepad/id6478283511`, `.../otter-ai-transcription/id1276437113`, `.../fireflies-ai-note-taker/id6469222823` | HTTP 200 but **geo-redirect to a Chinese App Store homepage**; identical MD5 for all three | App-store listing claims UNVERIFIED |
| `https://help.otter.ai/hc/en-us/articles/37814850589975-Record-and-transcribe-a-phone-call` | **HTTP 403** | Otter phone-call mechanism UNVERIFIED |
| `https://help.otter.ai/hc/en-us/articles/360048269733-Record-a-conversation` and others | HTTP 200 but ~6 KB unusable | Otter mobile record-vs-playback UNVERIFIED |
| `https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-activateaudiointerfaceasync` and `.../nf-audioclientactivationparams-activateaudioclientasync` | **HTTP 404 — page does not exist at that path** | The real page is under `mmdeviceapi` (listed in A.1) |
| `https://raw.githubusercontent.com/aosp-mirror/.../attrs_manifest.xml` | Blocked per brief; body empty | `android:allowAudioPlaybackCapture` declaration page unread |
| `https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback` | **Connection timeout** (github.com was intermittently unreachable) | Sample REPO unverified; `learn.microsoft.com` sample page used instead |
| `https://support.notta.ai/hc/en-us/articles/48349422172827-System-Audio-Setup-for-Notta-Desktop` | Returned but unusable (1 line) | Not used |

### B2.9.A.3 Corrections to the task brief's premises

Three premises in the task brief do not survive contact with the primary sources. Flagging them explicitly because they change the plan:

1. **"Windows 10 2004+ / process-loopback"** — Microsoft documents process loopback as **Build 20348** (struct/enum pages, sample page) or **Build 20438** (function page Remarks). **Not 2004 (build 19041).** See §2.3.
2. **"macOS legacy: kernel/system extension"** — BlackHole explicitly states **"No kernel extensions or modifications to system security necessary"**; it is a userspace HAL plug-in under `/Library/Audio/Plug-Ins/HAL/`. It still requires a driver install with admin rights and a reboot, so the *friction* premise holds — but the *mechanism* description should be corrected. See §3.1.
3. **"Does Windows require installing a virtual audio driver (e.g. VB-Cable) or is loopback built in?"** — **Confirmed: loopback is built into WASAPI, no driver needed**, from the explicit sentence "WASAPI supports loopback recording regardless of whether the audio hardware contains a loopback device, or whether the user has enabled the device." See §2.1. Additionally, on macOS 14.2+ the virtual driver is **also** no longer required (Core Audio taps) — the task framed the driver as the macOS default without noting that this changed in 2024.


## B3 BROWSER TAB CAPTURE


### B3.4.1 What a web-only product gets

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia (fetched 2026-09-19):**

`audio` option:
> "A value of `true` indicates that the returned `MediaStream` will contain an audio track, **if audio is supported and available for the display surface chosen by the user.**"

Return value:
> "A Promise that resolves to a `MediaStream` containing a video track whose contents come from a user-selected screen area, **as well as an optional audio track.**"
> "**Browser support for audio tracks varies**, both in terms of whether or not they're supported at all by the media recorder and in terms of the audio sources supported."

Errors:
> "`NotAllowedError` — Thrown if the call to `getDisplayMedia()` was not made from code running due to a **transient activation**, such as an event handler."
> "`NotAllowedError` — Thrown if the permission to access a screen area was denied by the user, **or the current browsing instance is not permitted access to screen sharing** (for example by a Permissions Policy)."

The MDN page's own heading list includes, verbatim: "**Transient user activation is required.**" And on constraints: "`min` and `exact` values are not permitted in constraints used in `getDisplayMedia()` calls."

Chrome-specific hints documented by MDN:
> "In Chrome (documentation), **`systemAudio: "include"` does not guarantee that system audio will be available**, but `systemAudio: "exclude"` prevents system audio from being offered when sharing a screen (**audio from a shared browser tab or window may still be available**)."

Other hints on the same page: `preferCurrentTab` ("instructs the browser to offer the current tab as the most prominent capture source, that is, as a separate 'This Tab' option"), `selfBrowserSurface` (`include` / `exclude`, to avoid the "infinite hall of mirrors"), `surfaceSwitching`, `windowAudio` (`exclude` / `window` / `system`).

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia (fetched 2026-09-19):** microphone capture only — no path to system/other-app audio.

**VERIFIED via https://www.w3.org/TR/screen-capture/ (fetched 2026-09-19)** — the normative Screen Capture spec, for the picker/consent model.

**VERIFIED via https://caniuse.com/mdn-api_mediadevices_getdisplaymedia (fetched 2026-09-19):**

| Engine | Support |
|---|---|
| Chrome | ✅ 72+ (through 156) |
| Edge | ◐ partial 17–18; ✅ 79+ |
| Firefox | ✅ 33+ |
| Safari (macOS) | ✅ 13+ |
| **Safari on iOS** | **❌ 3.2 – 27.2 (all versions listed)** |
| **Chrome for Android** | **❌ 152** |
| **Firefox for Android** | **❌ 155** |
| Samsung Internet / Opera Mobile / UC / QQ / KaiOS | ❌ |
| Global usage figure reported | **35.85%** |

### B3.4.2 What a web-only product **cannot** do

| Cannot | Why (evidence) |
|---|---|
| Capture a **native Zoom / Teams / Slack desktop app** | `getDisplayMedia` sources are screens/windows/tabs of the *browser*; there is no web API that taps another process's audio. MDN defines the return as "a user-selected screen area". |
| **Silently** capture audio | "Transient user activation is required"; the browser's own picker chooses the surface; `NotAllowedError` on denial. |
| **Guarantee** it gets an audio track at all | "if audio is supported and available for the display surface chosen by the user"; "the returned stream might contain no audio track even when audio is `true` and `systemAudio` is `include`". |
| Capture the current tab's audio **unless the user shares that tab** | Tab audio is a property of the selected surface. `preferCurrentTab` only makes "This Tab" *prominent*; it does not select it. |
| Do any of this **on mobile web** | `getDisplayMedia` is unsupported in every mobile browser listed by caniuse. |
| Access a **Chrome extension** path from a plain web page | `chrome.tabCapture` is an *extension* API with its own permission model. `UNVERIFIED`: **`developer.chrome.com` timed out on 2026-09-19**, so I could not fetch https://developer.chrome.com/docs/extensions/reference/api/tabCapture or https://developer.chrome.com/blog/avoiding-oversharing-when-screen-sharing. Cite them only as the canonical locations, not as read sources. |

**Practical product conclusion for a web-first product:** the browser gives you a *consented, user-driven, tab-scoped* capture. That is enough for a "share this tab and get live translation" feature, and it is the only thing that works with zero install. It is **not** enough for an automatic "record all my meetings" product. To get automatic capture of native meeting apps you must ship a **desktop app** (Windows §2, macOS §3) — which is exactly the architecture real products chose (§6).

---

---

## B4 MOBILE


### B4.5.1 iOS — a third-party app cannot capture a phone call

**(a) CallKit + VoIP: you only get the call your app *is*.**

**VERIFIED via https://developer.apple.com/documentation/callkit (via JSON data endpoint, fetched 2026-09-19):**
> "Display the system-calling UI for your app's VoIP services, and coordinate your calling services with other apps and the system."
> "Use CallKit to integrate your calling services with other call-related apps in the system. CallKit provides the calling interface, and **you handle the back-end communication with your VoIP service.**"
> "For incoming and outgoing calls, CallKit displays the same interfaces as the Phone app, giving your app a more native look and feel."

**VERIFIED via https://developer.apple.com/documentation/callkit/cxprovider (via JSON data endpoint, fetched 2026-09-19):**
> "An object that represents a telephony provider."
> "A `CXProvider` object is responsible for reporting out-of-band notifications that occur to the system. **A VoIP app should create only one instance of `CXProvider`** and store it for use globally."
> "`CXProvider` is not intended for subclassing."

**VERIFIED via https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls (via JSON data endpoint, fetched 2026-09-19):**
```swift
func startCall(handle: String, video: Bool = false) {
    let handle = CXHandle(type: .phoneNumber, value: handle)
    let startCallAction = CXStartCallAction(call: UUID(), handle: handle)
    startCallAction.isVideo = video
    let transaction = CXTransaction()
    transaction.addAction(startCallAction)
    requestTransaction(transaction)
}
```
> "You can handle outgoing calls in your app by providing information about the recipient and initiating the call."

**Reading:** CallKit is the **system UI + lifecycle** for a call **your app terminates**. The audio you can record is the audio of *your own VoIP session*, because your app is a party to it. CallKit does not grant any capability over a **cellular/PSTN call** or over **another app's call** (Zoom, Teams, WhatsApp, the Phone app). There is no documented Apple API that taps a cellular call's uplink/downlink for a third party. **`UNVERIFIED` as an explicit prohibition sentence:** Apple does not appear to publish a single "you may not record phone calls" page that I could fetch; the constraint is the *absence* of any such API. I state it as: **no public API exists; therefore it is not possible.**

**(b) ReplayKit / Broadcast Upload Extension — screen + in-app audio + mic, but not call audio.**

**VERIFIED via https://developer.apple.com/documentation/replaykit (via JSON data endpoint, fetched 2026-09-19):**
> "**Record or stream video from the screen, and audio from the app and microphone.**"
> "Using the ReplayKit framework, users can record video from the screen, and audio from the app and microphone. … You can build app extensions for live broadcasting your content to sharing services."
> "ReplayKit is incompatible with `AVPlayer` content."

Note the phrasing: **"audio from the app and microphone"** — not "audio from the device" and not "audio from calls".

**VERIFIED via https://developer.apple.com/documentation/replaykit/rpscreenrecorder (via JSON data endpoint, fetched 2026-09-19):**
> "The shared recorder object that provides the ability to record audio and video of your app."
> "Your app can **record the audio and video inside of the app**, along with user commentary through the microphone."
> "**Only one app at a time can use the recorder on the user's device.**"
> "Your app can't record video from `AVPlayer`."

**VERIFIED via https://developer.apple.com/documentation/replaykit/rpbroadcastsamplehandler (via JSON data endpoint, fetched 2026-09-19):**
> "An object that processes buffer objects as received from ReplayKit."
> "To handle `CMSampleBuffer` objects as captured by ReplayKit, you subclass `RPBroadcastSampleHandler`. You enable this mode of handling by setting `RPBroadcastProcessMode` in the extension's `Info.plist` file to `RPBroadcastProcessModeSampleBuffer`."
> "In your subclass, implement the `processSampleBuffer(_:with:)` method to handle video and audio buffers, as well as the `broadcastStarted(withSetupInfo:)`, `broadcastFinished()`, `broadcastPaused()`, and `broadcastResumed()` methods…"
> "ReplayKit invokes methods in your `RPBroadcastSampleHandler` subclass in a serial fashion."

**VERIFIED via https://developer.apple.com/documentation/replaykit/rpbroadcastsamplehandler/processsamplebuffer(_:with:) (via JSON data endpoint, fetched 2026-09-19):**
> "Processes video and audio data as it becomes available during a live broadcast."
> "A `CMSampleBuffer` object containing either audio or video data." / "An `RPSampleBufferType` identifying the media type of the recorded sample."
> "**If no audio is available — for example, if the microphone isn't capturing input — ReplayKit provides audio buffers whose samples represent continuous silence.**"
> "ReplayKit provides sample buffers sequentially. After invoking this method with a sample buffer, ReplayKit won't invoke the method again for any sample buffer type until the current invocation returns."
> "The sample buffer passed to this method is available only until the method returns. You shouldn't keep a reference to the sample buffer after the method returns."

**Reading:** a Broadcast Upload Extension receives `RPSampleBufferType` audio buffers for **app audio** and **microphone**. During a cellular call, the call audio is not app audio and not the microphone, so it is not delivered. Practical consequence: **a screen-record/broadcast extension on iOS captures the *visual* meeting content and the mic, but the remote participants' voices (which live in the telephony/VoIP path) are captured only as a silent/absent buffer.** `UNVERIFIED` for a single Apple sentence stating "call audio is excluded"; the conclusion is drawn from the documented *scope* ("audio from the app and microphone") plus the documented silence behaviour.

**(c) ⚠️ 2026 platform change — ReplayKit is being retired in favour of ScreenCaptureKit on iOS.**

Verified availability metadata (all via JSON data endpoints, fetched 2026-09-19):

| Symbol | iOS | Note |
|---|---|---|
| `RPScreenRecorder` | 9.0 → **deprecatedAt 27.0** | deprecation message: **"Use ScreenCaptureKit instead"** |
| `RPBroadcastSampleHandler` | 10.0 → **deprecatedAt 27.0** | message: **"No longer supported"** |
| `RPBroadcastSampleHandler.processSampleBuffer(_:with:)` | 10.0 → **deprecatedAt 27.0** | message: "No longer supported" |
| `SCStream` | **iOS 27.0** | previously macOS-only (12.3) |
| `SCStreamConfiguration` | **iOS 27.0** | previously macOS-only (12.3) |
| `SCStreamConfiguration.capturesAudio` | **iOS 27.0** | previously macOS-only (13.0) |
| `SCStreamConfiguration.captureMicrophone` | **no iOS entry** | macOS 15.0 / Mac Catalyst 18.2 only |
| `SCShareableContent` | **no iOS entry** | macOS 12.3 / Mac Catalyst 18.2 only |

**Caution — do not over-read this.** `SCStream`/`SCStreamConfiguration`/`capturesAudio` gaining iOS 27.0 availability means Apple is moving screen-and-audio capture to ScreenCaptureKit on iOS, and ReplayKit is deprecated. **But** `SCShareableContent` (the macOS entry point for enumerating what to capture) has **no iOS availability**, so the iOS path is *not* the macOS path and the docs I could read do not explain the iOS entry point. There is also an Apple Developer Forums thread visible in search results, titled **"iOS 27: SCStreamConfiguration.excludesCurrentProcessAudio has no effect (0.0 dB separation) — what is the supported way to exclude our own audio?"** (`https://developer.apple.com/forums/thread/842854`) — **I fetched this URL and got only a JS shell (4 lines, no content), so it is SEARCH-RESULT-ONLY and UNVERIFIED.** Treat iOS-27 ScreenCaptureKit audio as **promising but requiring hands-on validation**.

**(d) App Store review constraints** — VERIFIED via https://developer.apple.com/app-store/review/guidelines/ (fetched 2026-09-19), verbatim:

> **2.5.14** "Apps must request explicit user consent and provide a clear visual and/or audible indication when recording, logging, or otherwise making a record of user activity. **This includes any use of the device camera, microphone, screen recordings, or other user inputs.**"
> **2.5.1** "Apps may only use public APIs and must run on the currently shipping OS. … Apps should use APIs and frameworks for their intended purposes and indicate that integration in their app description."
> **2.5.4** "Multitasking apps may only use background services for their intended purposes: VoIP, audio playback, location, task completion, local notifications, etc."
> **2.5.12** "Apps using CallKit or including an SMS Fraud Extension should only block phone numbers that are confirmed spam. … You may not use the data accessed via these tools for any purpose not directly related to operating or improving your app or extension…"

**Reading:** 2.5.14 is the operative rule for a meeting-notes iOS app: **explicit consent + a visible/audible recording indicator are mandatory**, and it explicitly names microphones and screen recordings. Combined with 2.5.4, the "background recording" story on iOS is narrow. 2.5.1 (public APIs only) is why a broadcast-extension or ScreenCaptureKit route must be used rather than anything private.

### B4.5.2 Android — `AudioPlaybackCapture`, and apps can opt out

⚠️ **All Google documentation hosts (`developer.android.com`, `source.android.com`, `android.googlesource.com`, `developer.android.google.cn`) and `web.archive.org` TIMED OUT from this machine on 2026-09-19.** The evidence below is from **AOSP platform source code mirrored on GitHub**, which is a primary source (the actual Android framework code and its Javadoc), not a third-party blog.

**VERIFIED via https://github.com/aosp-mirror/platform_frameworks_base/blob/master/media/java/android/media/AudioPlaybackCaptureConfiguration.java (fetched 2026-09-19)** — the class Javadoc is the normative description of the Android 10 restriction:

> "Configuration for capturing audio played by other apps.
> When capturing audio signals played by other apps (and yours), you will only capture a mix of the audio signals played by players (such as `AudioTrack` or `MediaPlayer`) which present the following characteristics:
> - the **usage value MUST be `AudioAttributes.USAGE_UNKNOWN` or `AudioAttributes.USAGE_GAME` or `AudioAttributes.USAGE_MEDIA`. All other usages CAN NOT be captured.**
> - AND the capture policy set by their app (with `AudioManager#setAllowedCapturePolicy`) or on each player (with `AudioAttributes.Builder#setAllowedCapturePolicy`) is `AudioAttributes#ALLOW_CAPTURE_BY_ALL`, whichever is the most strict.
> - AND their app attribute **`allowAudioPlaybackCapture`** in their manifest MUST either be:
>   - set to `"true"`
>   - not set, and their **`targetSdkVersion` MUST be equal to or greater than `android.os.Build.VERSION_CODES#Q`** [Android 10]. Ie. **Apps that do not target at least Android Q must explicitly opt-in to be captured by a MediaProjection.**
> - AND their apps MUST be in the same user profile as your app (eg work profile cannot capture user profile apps and vice-versa)."

And the canonical usage pattern (verbatim from the same Javadoc):
```java
MediaProjection mediaProjection;
// Retrieve a audio capable projection from the MediaProjectionManager
AudioPlaybackCaptureConfiguration config =
        new AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
        .build();
AudioRecord record = new AudioRecord.Builder()
        .setAudioPlaybackCaptureConfig(config)
        .build();
```

**What this means for a meeting-notes product on Android:**

| Question | Answer from the AOSP Javadoc |
|---|---|
| Can you capture other apps' playback? | Yes, via `MediaProjection` + `AudioPlaybackCaptureConfiguration` + `AudioRecord` |
| Which audio? | **Only** `USAGE_UNKNOWN` / `USAGE_GAME` / `USAGE_MEDIA`. Everything else "CAN NOT be captured." |
| **Do apps opt out?** | **YES — two independent opt-outs.** (1) Manifest `android:allowAudioPlaybackCapture="false"`; (2) `AudioManager.setAllowedCapturePolicy(ALLOW_CAPTURE_BY_NONE)` / per-player `AudioAttributes.Builder.setAllowedCapturePolicy(...)`. The Javadoc says the *most strict* policy wins. |
| Default if the manifest attribute is absent? | Capturable **only if** `targetSdkVersion >= Q` (Android 10); a pre-Android-10-targeting app must explicitly set `"true"` |
| Cross-profile? | Blocked: work profile cannot capture user-profile apps and vice versa |
| Does it need root? | **No.** But it needs a `MediaProjection` (a user-consent flow) |

**The killer detail:** meeting apps use **`USAGE_VOICE_COMMUNICATION`** (or similar) for call audio, which is in the "All other usages CAN NOT be captured" bucket. So **`AudioPlaybackCapture` is structurally unable to capture VoIP/call audio**, even before any opt-out. This is the Android analogue of the iOS finding, and it is why every mobile product in §5.3 record *in-person* conversations with the microphone rather than virtual calls.

**Also note (same Javadoc, and the standard Android model):** `MediaProjection` is obtained from `MediaProjectionManager.getMediaProjection(int, Intent)` — a **user-consent dialog per capture session**. There is no silent, persistent capture.

**`android:allowAudioPlaybackCapture` attribute definition — `UNVERIFIED`.** I attempted `core/res/res/values/attrs_manifest.xml` on the AOSP mirror; the page returned but the stripped content was truncated before the attribute definition and grep found no occurrence. So I cite the attribute's **semantics from the `AudioPlaybackCaptureConfiguration` Javadoc above** (which I did read) and mark the attribute's own declaration page as unread. Canonical doc location (NOT fetched, host unreachable): `https://developer.android.com/reference/android/media/AudioPlaybackCaptureConfiguration` and `https://developer.android.com/media/legacy/audio-playback-capture`.

**Android background-audio restrictions and Play Store policy — `UNVERIFIED`.** The task asks about "Android 10+ restrictions on background audio capture" and "Play Store policy risk". I could **not** fetch any Google source for these: `developer.android.com` timed out, `support.google.com/googleplay/android-developer` (Play policy) is on a blocked/blocked-equivalent Google host, and `web.archive.org` timed out. Concrete unverified pointers from search results only (I did **not** read them):
* `https://developer.android.com/media/platform/sharing-audio-input` (appeared in search results; not fetched)
* `https://support.google.com/googleplay/android-developer/answer/16944162` and `.../9888170` (Play "sensitive permissions / limited app visibility" policies; appeared in search results; not fetched)

**Engineering guidance, flagged as inference not citation:** assume Android requires (i) a user-consented `MediaProjection` per session, (ii) a foreground service with an appropriate type to keep capture alive, (iii) that call-audio usages are not capturable at all, and (iv) that root/accessibility-based "capture everything" hacks are outside Play policy and outside public-API use. **Verify (i)–(iv) against `developer.android.com` from a machine that can reach it.**

### B4.5.3 What real products actually do

The pattern across the category is unambiguous: **desktop app for virtual meetings; mobile app for in-person meetings only.**

#### Granola — desktop-only for virtual meetings (the strongest evidence in this report)

**VERIFIED via https://docs.granola.ai/help-center/ios/getting-started.md (fetched 2026-09-19)** — verbatim, my emphasis:

> "**Virtual meeting calls**: On macOS, Granola captures system audio, so it works inside any meeting app. **Phones don't let apps capture audio from other apps, so Granola can't transcribe virtual meeting calls on mobile.** On mobile, it's designed for **in-person meetings** (and, on iOS, **outbound phone calls made through Granola's built-in dialer**)."

> "Granola for mobile lets you take AI-enhanced notes during in-person meetings (and, on iOS, phone calls)."
> Feature list: "**In-person meeting notes**: Capture conversations happening around you"; "**Phone call notes** (iOS only): Take notes during outbound phone calls".

**VERIFIED via https://docs.granola.ai/help-center/ios/transcription.md (fetched 2026-09-19)** — how mobile capture actually works:
> "**Granola records from your phone's active microphone input** (note that this could be the built-in mic, or could be a bluetooth device if you've got one connected). Granola can pick up on in-person conversations, **or sound playing from other devices**."
> "The transcript will identify speakers as Speaker A, Speaker B, and so on…"

**VERIFIED via https://docs.granola.ai/help-center/taking-notes/transcription.md (fetched 2026-09-19)** — the desktop mechanism and its limits:
> "There is **no meeting bot — Granola runs only on your computer and uses your system audio and microphone.**"
> "**Transcription requires the Granola desktop app (macOS or Windows) or the mobile app (iPhone or Android). The web interface at notes.granola.ai is for viewing and editing existing notes only — it cannot capture or transcribe meetings.**"
> "**Granola cannot isolate audio from individual applications — it captures the combined audio stream from your system.** If you play music or other audio during a meeting, that audio will be included in the transcription even if it's routed to a different output device." ← i.e. **Granola uses whole-system loopback, not per-process capture** (consistent with §2.1 / §3.2).
> "**Granola mobile app (iPhone and Android) can also recognize different speakers during face-to-face meetings.**"
> "**Granola is designed for live meeting transcription only — it does not support importing or uploading pre-recorded audio files.**"
> Speaker tags: "Google Meet — available on macOS and Windows through the Granola browser extension"; "Zoom — available on macOS through Settings > Preferences" — desktop-only.

**VERIFIED via https://docs.granola.ai/help-center/ios/phone-calls.md (fetched 2026-09-19)** — and this is the clearest possible illustration of the iOS CallKit constraint:
> "Phone calls are available on iOS only. The Granola Android app doesn't support taking notes on phone calls."
> "To start using Granola for out-bound calls, select the phone icon in the bottom left corner… **You'll be asked to put in your phone number, and then will need to call yourself for verification.**"
> "Make an outbound call by either selecting one of your contacts, or by entering in their phone number. **The person you're calling will see your own phone number (the one you registered during setup) as the caller ID.**"
> "**Inbound calls — Unfortunately due to strict limitations in iOS, Granola can't transcribe inbound calls at the moment.** The best workaround currently is to ask the person calling you if you can quickly call them back!"

**Reading:** Granola could not tap the Phone app or Zoom mobile. So they **provisioned their own phone number and built their own dialer** — becoming the call, exactly the CallKit/VoIP pattern of §5.1(a) — and even then they only support **outbound** calls, explicitly citing "strict limitations in iOS". This is the single best real-world confirmation that **a third-party app cannot capture a cellular/PSTN or another app's call on iOS.**

**Granola macOS permission evidence** — VERIFIED via https://www.granola.ai/blog/how-to-use-granola-with-zoom (fetched 2026-09-19):
> "**macOS**: Navigate to System Settings > Privacy & Security and enable both **Microphone** and **Screen & System Audio Recording** for Granola. **The screen recording permission is required because macOS bundles system audio access under that category, even though no video is captured.**"
> "**Windows**: Navigate to Settings > Privacy & Security > Microphone and ensure microphone access is enabled for Granola. **System audio capture on Windows is handled automatically by the app and does not require a separate permission step.**"

This is corroborated by the other Granola post, VERIFIED via https://www.granola.ai/blog/granola-google-meet-integration-recording-transcription (fetched 2026-09-19):
> "Granola runs as a native desktop app on Mac and Windows (**macOS 13 or above**). You don't need a Chrome extension or browser plugin. **Granola captures audio at the operating system level without joining as a bot**, so you can use any browser with Google Meet: Chrome, Safari, Firefox, or Edge."
> "Granola uses your system's default audio input and output directly. **You won't find a separate audio menu inside the app. Configuration happens at the OS level.**"
> "Granola transcribes but doesn't capture video. Granola doesn't record your screen or save audio files."
> "Capability table: **Appears in participant list — No bot. Uses your device audio** | **Audio file stored — No (transcripts only)** | **Works when you're not the host — Yes, always** | **Platform requirement — Any meeting you can hear**"

⚠️ **Note the internal inconsistency in Granola's own marketing:** the Zoom post says "Granola runs on your laptop **or phone**" and "uses your device's audio" in a way that implies mobile virtual-meeting capture, while the help-centre doc explicitly says the opposite ("Granola can't transcribe virtual meeting calls on mobile"). **The help centre is the authoritative source**; the blog copy is loose. Worth knowing if a competitor's marketing is being compared against.

⚠️ **App Store listing `UNVERIFIED`:** the task asked me to check Granola's app-store listing. `https://apps.apple.com/us/app/granola-ai-notepad/id6478283511` returned HTTP 200 but **geo-redirected to a Chinese App Store homepage**; the stripped text was Chinese game promotions and was **byte-identical (same MD5) for the Granola, Otter and Fireflies URLs** — so no listing content was retrieved. Google Play listings: not attempted (Google hosts blocked). The Granola help-centre doc (fetched) links `https://go.granola.ai/ios` and `https://play.google.com/store/apps/details?id=ai.granola`, and states "Granola isn't available in the App Store in China" — quote verified, listing contents not.

#### Otter.ai

**VERIFIED via https://www.otter.ai/ (fetched 2026-09-19)** — homepage marketing copy:
> "Record conversations directly from your **Mac or Windows desktop**, without bots joining the call."
> "Whether you automatically send your AI Notetaker to meetings, **record bot-free on desktop or Chrome, or capture on mobile**, Otter gives you flexible ways to record meetings anywhere."
> Page also lists "**iOS app**" and "**Android app**" links.

**Reading:** Otter's bot-free desktop capture is its flagship, and mobile capture is presented as an additional surface. Otter supports **three** modes (bot / desktop-bot-free / mobile), unlike Granola's desktop-only-for-virtual-meetings model.

**`UNVERIFIED`:** I could **not** read Otter's help centre. `https://help.otter.ai/hc/en-us/articles/360048269733-Record-a-conversation` returned HTTP 200 but 5,858 bytes of unusable content; `.../31672594631063-...` and the mobile-apps category returned ~6 KB similarly; **`https://help.otter.ai/hc/en-us/articles/37814850589975-Record-and-transcribe-a-phone-call` returned HTTP 403.** So the specific claims the task asks about — *"whether Otter's mobile apps record or just play back"*, and Otter's phone-call recording — are **not verified**. Relevant URLs that appeared in search results only (not fetched): `https://help.otter.ai/hc/en-us/articles/360048269733-Record-a-conversation`, `https://help.otter.ai/hc/en-us/articles/37814850589975-Record-and-transcribe-a-phone-call`, `https://help.otter.ai/hc/en-us/articles/4403627500951-Troubleshooting-audio-problems`, `https://help.otter.ai/hc/en-us/articles/31672594631063-Getting-the-most-out-of-Otter-ai-Best-Practices-for-in-person-recordings`. **The existence of a "Record and transcribe a phone call" article suggests Otter has a phone-call capability on mobile, but its mechanism (built-in dialer vs. cellular tap) is unverified.** Given §5.1(a), it cannot be a cellular tap.

#### Fireflies.ai

**VERIFIED via https://fireflies.ai/ (fetched 2026-09-19)** — homepage, verbatim feature list:
> "**Mobile App** — Transcribe and summarize **in-person conversation** with the Fireflies mobile app."
> "**Desktop App** — Transcribe and summarize your calls with the Fireflies desktop app."
> "**AI Note Taker Bot** — Invite fred@fireflies.ai to a live meeting or have it autojoin your calendar meetings to record, transcribe, and summarize."
> FAQ heading present on page: "Does Fireflies record without people knowing?"

**Reading:** Fireflies' own product taxonomy makes the split explicit: **mobile = "in-person conversation"**, **desktop = calls**. This is the third product out of three with the identical desktop/in-person-mobile split.

#### MeetFlow

**`UNVERIFIED` — no evidence found.** The task names "MeetFlow" but I found no public documentation, help centre, or app listing for a meeting-notes product by that name during this research, and I did not attempt to fetch a `meetflow` domain (no canonical URL was supplied). **No claims made.** If this refers to the internal project in the current workspace (`fbuddy.meetflowai.site` appears in the workspace status board), its own capture architecture is a local fact, not a research finding, and is out of scope for this report.

#### Cross-product pattern

| Product | Desktop capture of virtual meetings | Mobile capture | Phone-call capture | Evidence quality |
|---|---|---|---|---|
| **Granola** | ✅ system audio, macOS 13+ / Windows, no bot, whole-system mix (not per-app) | **In-person mic only** — "Phones don't let apps capture audio from other apps" | **iOS outbound only, via Granola's own dialer/number**; inbound explicitly not possible | ✅ own help centre, verbatim |
| **Otter.ai** | ✅ "bot-free on desktop", Mac/Win | ✅ "capture on mobile" (mechanism unverified) | A help article titled "Record and transcribe a phone call" exists — **content UNVERIFIED (403)** | ⚠️ marketing only |
| **Fireflies.ai** | ✅ desktop app + bot | ✅ "**in-person conversation**" | not claimed | ✅ own homepage, verbatim |
| **MeetFlow** | unknown | unknown | unknown | ❌ no evidence |

---

## B5. LEGAL / CONSENT

### B5.1 VIETNAM — the critical finding: **the regime described in the brief is out of date**

> ## ⚠️ Headline: Decree 13/2023/ND-CP **ceased to have effect on 1 January 2026.**
>
> Vietnam's data protection framework is now the **Law on Personal Data Protection No. 91/2025/QH15 ("PDPL")** plus its guiding **Decree No. 356/2025/ND-CP ("Decree 356")**. Both took effect **1 January 2026**. Decree 356 *"formally announced the replacement of the Decree No. 13/2023/ND-CP"*.
>
> `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19; page "Last modified 15 February 2026")`

Tilleke & Gibbins corroborates: Decree 356 *"entered into force on 1 January 2026, with the previous **Decree No. 13/2023/ND-CP on personal data protection ceasing effect on the same day**."* `VERIFIED via https://www.tilleke.com/print-insight/?post_id=69571&print=1 (fetched 2026-09-19)`

**Any compliance plan, DPIA template, or vendor contract drafted against Decree 13 is now legally stale.** Specifically, the brief's premise about "Art. 25 — Transfer of Personal Data Abroad" is the *Decree 13* article number; under the new regime the equivalent obligation is the **OTIA / TIA under the PDPL + Decree 356**.

#### B5.1.1 The instruments, with dates

| Instrument | Number | Enacted | In force | Status |
|---|---|---|---|---|
| **Law on Personal Data Protection** | **No. 91/2025/QH15** | **26 June 2025** | **1 January 2026** | **Currently governing statute.** 39 articles. "Elevated the regulatory framework from decree-level provisions to statutory law" |
| **Guiding decree** | **Decree No. 356/2025/ND-CP** ("Decree 356") | **31 December 2025** | **1 January 2026** | Guiding decree; replaced Decree 13 |
| **Decree 13/2023/ND-CP** | — | 17 April 2023 | 1 July 2023 | **CEASED EFFECT 1 Jan 2026** |
| Cybersecurity Law | No. 24/2018/QH14 | 2018 | 1 Jan 2019 | Still in force; data localisation (see B5.1.5) |
| Decree 53/2022/ND-CP | — | 2022 | 2022 | Guides Cybersecurity Law localisation |
| Data Law | — | — | — | Governs personal + non-personal data; classifies "important data" / "core data" |

`VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN, https://www.tilleke.com/print-insight/?post_id=69571&print=1, https://chambers.com/articles/landmark-personal-data-protection-law-in-vietnam, https://practiceguides.chambers.com/practice-guides/investing-in-2026/vietnam/trends-and-developments/O23505, https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/data-localisation-in-vietnam-highlights-under-decree-53-and-decree-13-102iulg (all fetched 2026-09-19)`

**Directly fetched source pages:** DLA Piper Vietnam (681 lines extracted), Tilleke print-insight (27 lines), Chambers article (49 lines), Chambers Investing In 2026 Vietnam (733 lines), Rouse (98 lines), Freshfields (83 lines).
**Not reachable / failed:** `thuvienphapluat.vn` (Cloudflare "Just a moment..." 1-line stub), `luatvietnam.vn` (login-gated), `vanban.chinhphu.vn` (JS portal shell, no Decree text), `bakermckenzie.com` (JS-gated, 2 lines), `lexology.com` (1 line), `tilleke.com/insights/vietnams-new-law-on-personal-data-protection/` (**404**), the actual **Decree 356 PDF at dilinh.com returned HTTP 410 GONE** on 2026-09-19, and the **MPS voice-biometric article at vietnam.vn returned a 13-byte failure**. So: **I could not read the primary Vietnamese statute text.** Everything below rests on law-firm and legal-consultancy summaries. That is a material limitation and is flagged per-claim.

#### B5.1.2 Is a voice recording "personal data"? — YES, explicitly, and possibly **sensitive**

This is the most important legal question for this product, and Vietnamese law is unusually explicit.

**(a) Voice is enumerated as personal data.** Under the Cybersecurity Law / Decree 53 framework, personal information is defined — in a formulation the law firm Freshfields quotes directly — as:

> *"information in form of signs, characters, numbers, pictures, **voice** or similar information used to identify an individual"*

`VERIFIED via https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/data-localisation-in-vietnam-highlights-under-decree-53-and-decree-13-102iulg (fetched 2026-09-19; article dated Dec 7 2023)`

**Voice is named as a form of personal information in its own right** — this is not an inference from "data that identifies a person."

**(b) Under the PDPL**, personal data is *"digital data or information in other forms that identify or helps to identify a specific individual"*, split into **basic** and **sensitive**. The basic list includes **"personal image"** and *"information associated with an individual or used to identify an individual other than sensitive personal data."* `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)`

**(c) ⚠️ Voice used for *identification* is treated as BIOMETRIC → SENSITIVE personal data.** This is the finding with the biggest product impact:

- **Law 91/2025/QH15, Art. 31(2)** defines biometric data as *"dữ liệu về thuộc tính vật lý, đặc điểm sinh học cá biệt và ổn định của một người để xác định người đó"* — data about a person's physical attributes and distinctive, stable biological characteristics **used to identify that person**. The analysis concludes: *"Theo ba yếu tố này, vân tay, khuôn mặt, mống mắt, **giọng nói**, đặc điểm di truyền đều thuộc phạm vi"* — fingerprints, face, iris, **voice**, and genetic characteristics all fall within scope. `VERIFIED via https://softspace.vn/thu-vien/du-lieu-sinh-trac-hoc-theo-luat-la-nhung-gi (fetched 2026-09-19)`
- **Decree 356/2025/ND-CP, Art. 4(1)(đ)** places **biometric data and genetic characteristics** in the **sensitive personal data** list. `VERIFIED via https://softspace.vn/thu-vien/du-lieu-sinh-trac-hoc-theo-luat-la-nhung-gi and https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)`
- A Vietnamese legal consultancy states it flatly: *"**Giọng nói: Mẫu giọng nói dùng để nhận diện hoặc điều khiển thiết bị cũng được coi là dữ liệu sinh trắc học**"* — *"**Voice: voice samples used for identification or to control devices are also considered biometric data**"*, and *"Điểm đ, khoản 1, Điều 4, Nghị định 356/2025/NĐ-CP đã xếp dữ liệu sinh trắc học vào danh mục dữ liệu cá nhân nhạy cảm."* `VERIFIED via https://longphanpmt.com/danh-muc-du-lieu-ca-nhan-nhay-cam/ (fetched 2026-09-19)`
- **Corroborating signal (title only):** a Vietnamese news article titled *"**Ministry of Public Security: Voice and iris biometric data are sensitive information and must be strictly managed**"* was surfaced by search but **the page itself was NOT reachable (13-byte failure)**. `UNVERIFIED/not reachable — https://www.vietnam.vn/en/bo-cong-an-du-lieu-sinh-trac-hoc-giong-noi-mong-mat-la-thong-tin-nhay-cam-phai-quan-ly-chat-che`. I cite the title as a *signal* that MPS treats voice biometrics as sensitive, not as proof.

> ### 🚨 The decisive compliance consequence
>
> **If your product does voice enrollment / speaker identification (i.e. A6.4 in Part A) on Vietnamese data subjects, you are processing SENSITIVE personal data — not ordinary personal data.** That triggers, per Decree 356:
>
> | Obligation | Rule |
> |---|---|
> | **Explicit consent, told it is sensitive** | Art. 6(4): *"when seeking consent to process sensitive personal data, the data subject must be clearly informed that the data is sensitive"* |
> | **No default/implied/coerced consent** | Art. 6: *"Default consent, implied consent, or consent obtained through coercive or misleading designs that blur the distinction between consent and non-consent are explicitly prohibited"* |
> | **Access-control rules + security measures** | Art. 4 / Law Art. 31(4)(a): *"physical security for storage and transmission devices, encryption, anonymisation, etc."*; limit access rights; monitoring systems to prevent/detect infringement |
> | **Breach notification in 72 hours — to MPS AND the data subjects** | Decree 356 Art. 29: for incidents involving **location data or biometric data**, notify affected data subjects within **72 hours** of discovery, report to the competent state authority, and **retain breach records for at least 5 years** |
> | **Elevated DPIA/TIA burden** | Sensitive data counts separately toward the "important data" / "core data" thresholds |
>
> `VERIFIED for Art. 6(4), Art. 6, Art. 29 via https://rouse.com/insights/news/2026/vietnam-key-developments-in-personal-data-protection-under-decree-no-356-2025-nd-cp-and-issues-businesses-need-to-review (fetched 2026-09-19)` and `https://softspace.vn/thu-vien/du-lieu-sinh-trac-hoc-theo-luat-la-nhung-gi (fetched 2026-09-19)`

**Practical reading — three tiers, and you should design for the middle tier:**

| Feature | Data classification (my reading) | What it demands |
|---|---|---|
| Live translation only, audio discarded immediately, no voiceprints, no names | Personal data (voice = personal information); **arguably not biometric** because you are not using it to *identify* anyone | Notice + consent; no long retention |
| Recording + diarization with generic `SPEAKER_00` labels | Personal data | Notice + consent; DPIA |
| **Voice enrollment / speaker identification / naming by voice** | **SENSITIVE (biometric) personal data** | **Explicit consent that says it is sensitive**, access controls, physical security, encryption, 72 h breach notice to MPS + subjects, 5-year breach records |

`This tiering is MY ANALYSIS, not a verified legal opinion. It follows from Art. 31(2) Law 91/2025's "used to identify" criterion. Have Vietnamese counsel confirm.`

#### B5.1.3 Consent requirements (the operative rules)

| Rule | Detail | Evidence |
|---|---|---|
| **Consent is the primary legal basis** | *"the primary legal basis for the processing of personal information is a consent given by the data subject (exemptions are available in certain cases)"* | `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)` |
| **Clear, specific, verifiable** | Must be *"capable of being verified as to whether the data subject has given consent, **including the time and scope** of such consent"* | same |
| **Must cover 4 things** | the type of personal data + purpose; the controller/controller-processor; the data subject's rights and obligations; **and that the data is sensitive, if any** | same |
| **Per-purpose consent** | *"consent must be made for each purpose"* — multiple purposes must be separately consentable | same |
| **Verifiable formats** | writing, **recorded phone calls**, SMS syntax, email, websites, platforms, applications with technical consent mechanisms | same |
| **⛔ Silence is NOT consent** | *"Silence or non-response by the data subject is not construed as consent."* Decree 356 additionally bans **default consent** and ambiguous UI | `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN and https://www.tilleke.com/print-insight/?post_id=69571&print=1 and https://rouse.com/insights/... (fetched 2026-09-19)` |
| **No bundled/coerced consent** | *"consent ... must not be accompanied by conditions requiring mandatory consent to purposes other than those agreed upon"* | `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)` |
| **Withdrawal right** | Withdrawable at any time in writing incl. electronic; **does not apply retroactively** to processing before withdrawal | same |

> ⚠️ **This means a pre-ticked checkbox or "by joining this meeting you consent" banner is EXACTLY what Decree 356 prohibits.** Your consent UX must be an affirmative, logged, timestamped, per-purpose action.

**Consent exemptions** (the list includes one that might look tempting but does **not** cover a private business meeting): `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)`

- urgent protection of life/health/honour/dignity/legitimate rights (controller must prove it);
- emergency/national-security situations; riots, terrorism, crime prevention;
- **serving the operations of state agencies**;
- performing an agreement between the data subject and a relevant party;
- **"to conduct audio and video recording and to process personal data obtained from audio and video recording activities in public places and public activities in certain cases as prescribed by law"**;
- other cases provided by law.

> **The "public places" exemption is a trap.** An internal company meeting on Zoom/Teams is **not** a public place or public activity. **You cannot rely on this exemption for meeting recording.** Consent (or another basis) is required.

#### B5.1.4 Cross-border transfer — the TIA / OTIA dossier

The brief's reference to *"Art. 25 — Transfer of Personal Data Abroad"* reflects **Decree 13's** article numbering. The obligation survives under the new law but is renumbered and administered differently.

| Item | Requirement | Evidence |
|---|---|---|
| What counts as cross-border transfer | Storing data collected/stored in Vietnam on **servers or cloud services outside Vietnam**; transferring by entities in Vietnam to overseas recipients; **processing data collected in Vietnam on platforms outside Vietnam** | `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)` |
| Filing obligation | *"Organizations conducting the transfer of data across border from Vietnam to overseas ('data transferor') are required to prepare and submit a **TIA** to the authority (MPS)"* unless exempt | same |
| **Deadline** | Original copy to **A05 within 60 days from the date of the personal data transfer** | same |
| Review cycle | **Every 6 months**, or within **10 days** of material changes | same |
| Regulator's review | A05 appraises within **15 days** and may request revision; transferor has **30 days** to update; failure risks administrative sanctions | same |
| Authority | **Ministry of Public Security (MPS), specifically A05** — the Department for Cybersecurity and High-tech Crime Prevention and Fighting | same |
| Data transfer agreement | Mandatory content: purpose/method/scope of export; recipient's processing purpose and method; **responsibilities for personal data protection during transfer and processing**; ensuring data subject rights; coordination and compliance on violations | `VERIFIED via https://www.tilleke.com/print-insight/?post_id=69571&print=1 and https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)` |

**Exemptions from the TIA** (relevant ones for a SaaS product): `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)`

- ✅ **"agencies or organizations storing the personal data of their employees on cloud computing services"** — relevant if you are the *employer's* tool for its own staff
- ✅ **cross-border personnel management** in accordance with labour rules/internal regulations/collective labour agreements
- ✅ data already **publicly disclosed** per law
- ✅ the **data subject transferring their own** personal data
- ✅ journalism/media
- ❌ **NOT exempt:** ordinary customer/vendor/partner meeting recording

**DPIA (domestic processing)** — `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)`:
- Required for organizations processing personal data of Vietnamese citizens / persons of Vietnamese origin residing in Vietnam with ID certificates. **Applies whether you are controller or processor.**
- Original copy to A05 **within 60 days from the date of the personal data processing**; review **every 6 months**.
- Must be **available at all times for A05 inspection**.
- A DPIA/TIA validly received by the authority **before 1 Jan 2026 remains valid** and need not be redone — but updates after that date must follow the PDPL/Decree 356.

**Grace periods** — `VERIFIED via https://www.tilleke.com/print-insight/?post_id=69571&print=1 and https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)`:
- **Small enterprises and startups: 5-year grace period** from the PDPL effective date for impact-assessment dossiers and DPO/DPD designation.
- **Business households and micro-enterprises: exempted.**
- ⚠️ **The grace period does NOT apply if:** (i) processing scale reaches **100,000+ personal data subjects**; (ii) you **provide data processing services**; or (iii) **sensitive personal data is directly processed**.
  - **This is critical for this product:** if you do **voice identification (sensitive)**, the startup grace period is **void** regardless of headcount.

**Data Protection Officer / Department**: must be established/appointed (or an external provider hired). Decree 356 sets qualifications: **at least a college degree, minimum 2 years' post-graduation relevant experience, and formal training in personal data protection** — the written appointment decision must be submitted with the DPIA/TIA dossiers. `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN and https://rouse.com/insights/... (fetched 2026-09-19)`

#### B5.1.5 Cybersecurity Law 2018 — data localisation

The brief asks about Vietnam's Cybersecurity Law 2018 localisation requirement. Here is the operative mechanism: `VERIFIED via https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/data-localisation-in-vietnam-highlights-under-decree-53-and-decree-13-102iulg (fetched 2026-09-19)`

**Under Decree 53/2022/ND-CP, a foreign enterprise can only be compelled to store data locally (Storage Requirement) and/or establish a local presence (Local Presence Requirement) if ALL THREE tests are met:**

1. The foreign enterprise, though not physically in Vietnam, **provides services in Vietnam in one of ten enumerated fields** under Decree 53;
2. **The services have been used to violate Vietnamese cybersecurity laws**; **and**
3. **A05 has sent a written request for coordination** in preventing/investigating/handling the violations, and the enterprise **has not complied or has impeded** A05's efforts.

If all three are met, the **Minister of Public Security** may impose either or both requirements, and the enterprise has **12 months** to comply. The enterprise may choose the form of storage (own server in Vietnam or physical data centre in Vietnam).

**Domestic enterprises (including foreign-invested):** the Storage Requirement applies **without triggering conditions**, though the language is not crystal clear and arguably only reaches enterprises providing telecom/Internet/value-added services under Art. 26 of the Cybersecurity Law.

**DLA Piper adds:** the government *"is updating the data localization requirements under the Cybersecurity Law. It is anticipated that the updated requirements will be submitted to the Prime Minister for consideration in **April 2026**."* `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)` — **this was expected ~5 months before this report's date; check whether it has since issued.**

**Also:** Decree 147 on Internet requires domestic information websites and domestic social networks to store service users' data on servers with Vietnamese IP addresses. `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)`

> **Practical implication:** localisation is **conditional and A05-triggered** for foreign service providers — it is not an automatic universal mandate. But a Vietnam-facing enterprise product that touches state-adjacent customers should assume it may be asked, and should keep a "deploy region in Vietnam" option in the architecture.

#### B5.1.6 Data Law — the separate "important data" / "core data" thresholds

⚠️ **There are TWO cross-border TIA regimes, and they are different and separate.** `VERIFIED via https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (fetched 2026-09-19)`

| Category | Personal-data threshold | Bank/payment threshold |
|---|---|---|
| **"Important data"** | basic citizen data of **100,000+** Vietnamese citizens; **OR sensitive citizen data of 10,000+** | 10,000+ Vietnamese enterprises' bank accounts/payment history/debt |
| **"Core data"** | basic citizen data of **1,000,000+**; **OR sensitive citizen data of 100,000+** | 100,000+ enterprises |

A Data Law TIA can be exempted **if** the data is "significant personal data" **and** you have already complied with the PDPL's TIA. Otherwise a separate filing is needed.

> 🔢 **Do the math for a B2B meeting product.** If you process **sensitive** personal data (voice biometrics for identification), the important-data threshold is only **10,000 Vietnamese citizens** — reachable by a mid-sized enterprise deployment. And 100,000 sensitive subjects triggers **"core data"**. **This is the strongest argument for NOT storing voiceprints for Vietnamese users unless you must.**

#### B5.1.7 Penalties

| Violation | Maximum fine | Evidence |
|---|---|---|
| For **entities**: general administrative violations | **up to 3,000,000,000 VND** (3 billion VND) | `VERIFIED via https://chambers.com/articles/landmark-personal-data-protection-law-in-vietnam (fetched 2026-09-19)` |
| **Sale of personal data** | up to **10× the revenue from the sale of personal data** | same |
| **Cross-border data transfer violations** | up to **5% of the previous year's revenue** | same |
| For **individuals** | **half** of the entity maximums | same |
| Criminal liability | *"both administrative fines and criminal liability, depending on the severity of the violation"* | same |
| Compensation | *"Entities must also compensate affected individuals for any damage"* | same |
| **Enforcement status** | ⚠️ *"there is **no officially announced issuance timeline**"* for the Sanctioning Decree; Rouse expects issuance **in the first half of 2026** | `VERIFIED via https://rouse.com/insights/news/2026/vietnam-key-developments-in-personal-data-protection-under-decree-no-356-2025-nd-cp-and-issues-businesses-need-to-review (fetched 2026-09-19)` |

> **Note the 5%-of-revenue penalty specifically attaches to cross-border transfer violations** — i.e. exactly what a cloud SaaS with Vietnamese meeting data does by default. This is the penalty to design against.

Also note the "Social media" activity rules in the PDPL — *"prohibits providers from **eavesdropping on calls and messages without consent**"*. `VERIFIED via https://chambers.com/articles/landmark-personal-data-protection-law-in-vietnam (fetched 2026-09-19)` — an explicit anti-eavesdropping prohibition that reads directly against covert meeting capture.

#### B5.1.8 Vietnam action list

| # | Action | Why |
|---|---|---|
| 1 | **Rewrite all compliance docs against PDPL (Law 91/2025/QH15) + Decree 356, not Decree 13** | Decree 13 ceased effect 1 Jan 2026 |
| 2 | **Decide whether you do voice identification at all.** Default to `Speaker 1/2/3` + manual naming | Avoids the sensitive/biometric classification and its 10,000-subject important-data threshold |
| 3 | If yes → **explicit consent that states the data is sensitive**, access controls, physical security, encryption, 72 h breach notice to MPS + subjects, retain breach records ≥5 years, and **no reliance on the startup grace period** | Decree 356 Art. 6(4), Art. 29 |
| 4 | **Build a consent log** capturing who, when, what scope, which purpose, and the exact UI version shown | Consent must be verifiable "as to time and scope"; silence ≠ consent; default consent banned |
| 5 | **Design a "translate-only, don't store" mode** — discard audio after transcription and hold only the minimum transcript | Reduces retention exposure; but note the transcript is still personal data |
| 6 | **Prepare a DPIA and an OTIA/TIA**; appoint a qualified DPO (degree + 2 yrs + training) | Mandatory; 60-day filings; 6-month review cycle |
| 7 | **Host Vietnamese meeting data in Vietnam or an agreed region** if serving Vietnamese enterprise/state-adjacent customers | Localisation is A05-triggered, but the 5%-of-revenue cross-border penalty makes this a live risk |
| 8 | **Confirm with Vietnamese counsel** — I could not read the primary statute text | All of B5.1 rests on law-firm summaries |
| 9 | **Re-check the Cybersecurity Law localisation update** | DLA Piper anticipated a submission to the Prime Minister around **April 2026**; that date has passed |

### B1.8 🚨 Zoom's OBF token requirement — the single biggest platform change affecting this product

**This is not a vendor detail; it changes the architecture.** On **2 March 2026**, Zoom began requiring **Meeting SDK apps that join meetings hosted by external accounts to authenticate with an On Behalf Of (OBF) token, a ZAK token, or to migrate to RTMS.**

> *"Beginning **March 2, 2026**, apps joining meetings outside their account must be authorized. Meet this requirement by using either **OBF or ZAK tokens, or RTMS**."*
> `VERIFIED via https://developers.zoom.us/blog/transition-to-obf-token-meetingsdk-apps/ (fetched 2026-09-19) — Zoom's own developer blog`

And from Zoom's own OBF FAQ:

> *"Beginning **March 2, 2026**, Zoom requires the use of an On Behalf Of (OBF) token for Meeting SDK (MSDK) apps joining meetings hosted by external accounts. For use cases requiring continuous data access or persistent recording, **use Real Time Media Streams (RTMS) for best results**. (Originally, we were targeting February 23, but we heard your feedback and moved the enforcement date out.)"*
> `VERIFIED via https://developers.zoom.us/docs/meeting-sdk/obf-faq/ (fetched 2026-09-19)`

#### Why this breaks the naive "send a bot to any Zoom link" model

| Constraint | Exact wording | Consequence |
|---|---|---|
| **Requires per-user OAuth** | To retrieve an OBF token *"implement the OAuth flow with the `user:read:token` scopes."* If your app lacks that scope: *"Must add the `user:read:token` scope in the App Marketplace and **reauthorize** the app"* — and **"Yes — Add the new scope and submit a review request."** | You need an OAuth onboarding flow per user **and** Zoom Marketplace review |
| **A real authorized user must already be in the meeting** | *"OBF tokens can only be used for joining. They require an associated user with a ZAK token, and **that user must already be in the meeting for the join to succeed**."* / *"The SDK app **can't join until an authorized participant joins**."* | **Your bot cannot be first in the meeting.** For a MoM auto-joiner this is a direct product-blocker |
| **One token, one user, one session** | *"Each SDK session can use only one OBF token at a time, and it is tied to a specific user. When that user leaves, the session ends and must rejoin with another authorized token."* | No hand-off resilience |
| **Recording STOPS when that user leaves** | Q: *"Can the Meeting SDK app continue recording when the authorized user leaves the meeting?"* A: **"No. The SDK session is tied to the presence of the authorizing user, so the session ends when that user leaves the meeting."** | **A 2-hour meeting dies when the host steps out.** Unacceptable for a MoM product |
| **RTMS is the sanctioned path for continuous recording** | *"Can RTMS support continuous recording even if the host leaves? **Yes.** RTMS allows continuous streaming independent of participant presence, **as long as the host has authorized the app**."* | RTMS becomes the default for Zoom |

All `VERIFIED via https://developers.zoom.us/docs/meeting-sdk/obf-faq/ (fetched 2026-09-19)`

**Also required:** MSDK apps must be on **version 5.17.5 or later**; improved OBF error messaging arrived in **6.6.10 (November 2025)**. `VERIFIED via https://developers.zoom.us/docs/meeting-sdk/obf-faq/ (fetched 2026-09-19)`

#### The Zoom RTMS escape hatch — and its own costs

| Aspect | Detail | Evidence |
|---|---|---|
| What it is | *"a Zoom-native data pipeline that gives your app access to live audio, video, transcript, and screenshare data from Zoom meetings. **Unlike meeting bots which join as visible participants, RTMS streams meeting data directly to your application without adding anyone to the call.**"* | `VERIFIED via https://docs.attendee.dev/guides/zoom/zoomrtms (fetched 2026-09-19)` |
| ✅ No bot in participant list | *"there is no 'bot has joined' notification and no extra attendee in the participant list"* | same |
| ✅ Not affected by OBF | *"RTMS is not affected by Zoom's March 2, 2026 deadline requiring OBF tokens for Meeting SDK bots joining external meetings. You also do not need to implement join tokens or any OAuth flow logic in your app."* | same |
| ✅ Lower CPU | *"RTMS sends encoded video frames, which is less CPU-intensive to process than the raw video frames sent when using the Zoom Meeting SDK."* | same |
| ⚠️ **User-initiated, not automatic** | *"The user controls when your app connects... When the user opens your RTMS app, Zoom sends your app a webhook that it must respond to. The user can also pause the RTMS app's recording at any time."* | same |
| ❌ **Receive-only** | *"RTMS cannot send data back into the meeting."* If you need to send audio/video/chat, **you need a bot** | same |
| ⚠️ Paid by Zoom | *"Zoom RTMS is a paid feature from Zoom"* — either bring your own Zoom RTMS credits or Recall bundles them for customers on a Recall plan | `VERIFIED via https://docs.recall.ai/docs/meeting-direct-connect-for-zoom-rtms.md (fetched 2026-09-19)` |
| ❌ No Breakout Rooms | *"Zoom RTMS doesn't support Breakout Rooms (currently)"* | same |
| ⚠️ Requires Zoom app review | *"Requires a properly configured Zoom App, which will need to go through Zoom's application process"* | same |

#### What this means for your product — action items

| # | Action | Why |
|---|---|---|
| 1 | **Do not architect around bot-only Zoom capture.** Build the desktop/overlay capture path as a first-class citizen, not a fallback | A host leaving ends the OBF session mid-meeting |
| 2 | **Implement Zoom OAuth + `user:read:token` early**, and start the Marketplace review immediately | Review is on the critical path and can take weeks; Zoom says they expedite OBF reviews |
| 3 | **Evaluate RTMS for Zoom** — but accept it is user-initiated and receive-only | It survives the host leaving; it does not let your bot speak |
| 4 | **Ask every bot vendor (Recall, Meeting BaaS, Attendee, Vexa) exactly how they handle OBF**, and get it in writing | Meeting BaaS already documents an `authenticated-bots/zoom/obf-tokens` flow; Recall has both a blog and an RTMS product — evidence this is a live, actively-solved problem across the market |
| 5 | **Treat this as a recurring risk, not a one-time migration** | Platform rules for meeting bots are tightening; Nylas separately claims *"Zoom has begun restricting third-party recording bots in some enterprise configurations"* (`UNVERIFIED` — competitor claim) |
| 6 | **Note that RTMS still requires host authorization** | So even the escape hatch needs a consent moment — which aligns with the consent UX in B5 |

> **Bottom line:** the "just send a bot" era for Zoom ended on **2 March 2026**. Any meeting-intelligence product built after that date must have (a) per-user OAuth, (b) an RTMS path, and (c) a bot-free local capture path. **This is the strongest single argument for the desktop-overlay capture described in Part B2.**

## B5.2 Scope & retrieval status of the US / EU legal pass

> **Note on ordering and provenance:** B5.1 above (Vietnam) and B5.2–B5.8 below (US wiretap law, EU/GDPR, platform consent, mitigations) are two independent research workstreams executed on the same date and using the same verification tagging. B5.2 documents exactly what was reachable for the US/EU pass — including the important negative result that **every `google.com`-owned host was network-blocked**, so **no Google Meet claim anywhere in this report is verified**.

This section is deliberately first: several high-value domains are network-blocked or JS-only from this environment, and claims sourced only from search-result snippets are flagged.

### B5.2.1 Fetched successfully (HTTP 200, text extracted) — these are the evidentiary backbone

| # | URL | Notes |
|---|---|---|
| 1 | https://www.law.cornell.edu/uscode/text/18/2511 | Full §2511 text incl. (2)(c), (2)(d) |
| 2 | https://www.rcfp.org/introduction-to-reporters-recording-guide/ | RCFP consent-requirement taxonomy + state lists |
| 3 | https://www.rcfp.org/reporters-recording-guide/ | Index of all state chapters |
| 4 | https://www.rcfp.org/reporters-recording-guide/california/ | Last updated Aug 2021 |
| 5 | https://www.rcfp.org/reporters-recording-guide/connecticut/ | Oct 2019 |
| 6 | https://www.rcfp.org/reporters-recording-guide/florida/ | Oct 2019 |
| 7 | https://www.rcfp.org/reporters-recording-guide/illinois/ | May 2020 |
| 8 | https://www.rcfp.org/reporters-recording-guide/maryland/ | May 2020 |
| 9 | https://www.rcfp.org/reporters-recording-guide/massachusetts/ | Aug 2021 |
| 10 | https://www.rcfp.org/reporters-recording-guide/michigan/ | May 2020 |
| 11 | https://www.rcfp.org/reporters-recording-guide/montana/ | May 2020 |
| 12 | https://www.rcfp.org/reporters-recording-guide/nevada/ | May 2020 |
| 13 | https://www.rcfp.org/reporters-recording-guide/new-hampshire/ | May 2020 |
| 14 | https://www.rcfp.org/reporters-recording-guide/pennsylvania/ | Aug 2020 |
| 15 | https://www.rcfp.org/reporters-recording-guide/washington/ | Jun 2020 |
| 16 | https://www.rcfp.org/reporters-recording-guide/oregon/ | Oct 2023 (post-*Project Veritas v. Schmidt*) |
| 17 | https://www.rcfp.org/reporters-recording-guide/delaware/ | Oct 2019 |
| 18 | https://www.rcfp.org/reporters-recording-guide/vermont/ | Jun 2020 |
| 19 | https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=632 | **Primary** Cal. Penal Code §632 verbatim |
| 20 | https://gdpr-info.eu/art-4-gdpr/ | Art. 4 definitions |
| 21 | https://gdpr-info.eu/art-5-gdpr/ | Art. 5 principles |
| 22 | https://gdpr-info.eu/art-6-gdpr/ | Art. 6 lawful bases |
| 23 | https://gdpr-info.eu/art-9-gdpr/ | Art. 9 special categories |
| 24 | https://gdpr-info.eu/art-13-gdpr/ | Art. 13 transparency |
| 25 | https://gdpr-info.eu/art-15-gdpr/ | Art. 15 access |
| 26 | https://gdpr-info.eu/recitals/no-43/ | Recital 43 freely-given consent |
| 27 | https://gdpr-info.eu/recitals/no-47/ | Recital 47 legitimate interests |
| 28 | https://eur-lex.europa.eu/eli/reg/2024/1689/oj | EU AI Act consolidated text (1.53 MB; Art. 50 read at lines 1622–1631) |
| 29 | https://www.gesetze-im-internet.de/betrvg/__87.html | **Primary** §87 BetrVG verbatim |
| 30 | https://learn.microsoft.com/en-us/microsoftteams/cloud-recording | Teams recording/transcription policy + `-ExplicitRecordingConsent` |
| 31 | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/ | ICO legitimate-interests guidance (last updated 23 Mar 2026) |
| 32 | https://support.zoom.com/api/now/sp/page?id=kb_article_view&sysparm_article=KB0068402&sysparm_language=en-US | Zoom ServiceNow JSON — meta description only (see §3.1) |
| 33 | https://www.legisocial.fr/actualites-sociales/7108-ecouter-enregistrer-conversations-telephoniques-salaries.html | **Secondary** French HR publisher summarising CNIL (see §2.5) |
| 34 | https://www.cnil.fr/fr/la-commission-nationale-de-linformatique-et-des-libertes | Fetched but JS-only (see below) |

### B5.2.2 UNREACHABLE / FAILED — do not assume anything about these

| URL / domain | Failure mode | What I did instead |
|---|---|---|
| `support.google.com` (all) — incl. `/meet/answer/9293037`, `/meet/answer/9308681`, `/meet/answer/12849897`, `/meet/answer/9845023` | **Network timeout (curl 28), 20–60 s, no bytes.** All `google.com`-owned hosts are blocked from this environment. `workspace.google.com`, `workspaceupdates.googleblog.com` likewise timed out. | Google Meet specifics are reported in §3.2 as **UNVERIFIED / not reachable**. No substitute vendor doc was found reachable. |
| `support.zoom.com/hc/en/article?...` (HTML) | HTTP 200 but **JS-only shell** (1,826 bytes, zero article text) | Recovered titles + one meta description via ServiceNow JSON API (§3.1). Article *bodies* remain unverified. |
| `commons.lbl.gov` (Zoom Privacy & Recording Guide mirror) | **Cloudflare block** — "Attention Required! Cloudflare / Sorry, you have been blocked" | n/a |
| `support.emerson.edu` Zoom article | HTTP 200 but stripped to 1 line (JS/captcha) | n/a |
| `ilga.gov`, `leg.state.fl.us`, `app.leg.wa.gov`, `capitol.tn.gov`, `legis.state.pa.us` | Network timeout | Illinois/Florida/Washington/Pennsylvania primary statutes are **UNVERIFIED**; RCFP chapter summaries used instead |
| `law.justia.com` (California §632, Illinois 720 ILCS 5/14-2) | HTTP 200 but JS/captcha (5.9 KB, stripped to 1 line) | Used `leginfo.legislature.ca.gov` for CA primary text; RCFP for IL |
| `cnil.fr` HTML pages | HTTP 200, 339 KB, but **SPA/JS-only** — `strip.mjs` yields 3 lines; keyword grep for `enregistr`/`salarié` returns 0 hits | Used `legisocial.fr` secondary summary (§2.5) |
| `cnil.fr/sites/cnil/files/atoms/files/ns57.pdf` | Fetched 522 KB but PDF uses **subset-font encoding**; no `pdftotext`/`pypdf` available and a hand-written Node zlib+CMap extractor produced glyph garbage | Abandoned; CNIL specifics are secondary-sourced |
| `lexology.com` AI-transcription article | "Just a moment..." (bot challenge) | n/a |
| `apps.eurofound.europa.eu/.../france` | Page not found (404-style body) | n/a |
| `ico.org.uk/.../monitoring-workers/` | Page not found — URL guess was wrong | Only the ICO legitimate-interests page was usable |

> **Bottom line for the reader:** every claim below is tagged. `VERIFIED` means I fetched that exact URL today and the claim is in the retrieved text. `SEARCH-SNIPPET ONLY` means I saw the text in a `web_search` result but could not fetch the page. `UNVERIFIED/not reachable` means I have no direct confirmation.

---

## B5.3 US federal wiretap law — 18 U.S.C. § 2511 and the state overlay

### B5.3.1 The federal floor: one-party consent

**VERIFIED via https://www.law.cornell.edu/uscode/text/18/2511 (fetched 2026-09-19)**

The operative exemption for a meeting bot that *joins as a participant* is **§ 2511(2)(d)**:

> "(d) It shall not be unlawful under this chapter for a person not acting under color of law to intercept a wire, oral, or electronic communication **where such person is a party to the communication or where one of the parties to the communication has given prior consent** to such interception **unless such communication is intercepted for the purpose of committing any criminal or tortious act** in violation of the Constitution or laws of the United States or of any State."

Three consequences that matter for product design:

1. **A participant may record.** Because your bot is a party to the call, §2511(2)(d) covers it federally without needing the other side's consent.
2. **"Prior consent" of one party suffices** — this is the classic "one-party consent" rule.
3. **The criminal/tortious-purpose carve-out is absolute.** Consent is irrelevant if the interception is for a criminal or tortious purpose. RCFP states the same: *"Under the federal statute and a majority of state laws, recording is not permitted — regardless of consent — if it is done for a criminal or tortious purpose."* **VERIFIED via https://www.rcfp.org/introduction-to-reporters-recording-guide/**

Related provisions **VERIFIED** in the same Cornell fetch:
- **§2511(1)(a)** — intentional interception / endeavoring to intercept / procuring another to intercept.
- **§2511(1)(b)(iv)** — the "device" prong expressly reaches use that *"(A) takes place on the premises of any business or other commercial establishment the operations of which affect interstate or foreign commerce; or (B) obtains or is for the purpose of obtaining information relating to the operations of any business…"* — i.e. the commercial-meeting context is squarely inside the statute's reach; you cannot argue the federal statute simply doesn't apply to a business meeting.
- **§2511(1)(c)–(d)** — separate offences for **disclosing** and **using** contents known to be illegally intercepted. This is why the *downstream* AI summary/transcript is a distinct exposure once the capture was unlawful.
- **§2511(2)(c)** — parallel one-party rule for persons acting *under color of law*.
- **§2511(2)(g)(i)** — no violation for intercepting an electronic communication on a system *"configured so that such electronic communication is readily accessible to the general public"*.

**RCFP's framing (VERIFIED, same intro page):**
> "Federal law requires the consent of at least one party before recording in-person, telephone or electronic conversations. 18 U.S.C. §§ 2510, 2511. It therefore establishes the minimum consent requirements across the country, though states may impose stricter rules. Vermont does not have a recording law, so the federal law is the only one that applies there."

### B5.3.2 The state overlay: the all-party list — and why the common list is wrong

**VERIFIED via https://www.rcfp.org/introduction-to-reporters-recording-guide/ (fetched 2026-09-19)**

RCFP's exact taxonomy (quoted verbatim in substance):

- **"About 11 states primarily have all-party consent requirements for recording. These states are California, Delaware, Florida, Illinois, Maryland, Massachusetts, Michigan (at least for recordings made by a third party who is not involved in the conversation), Montana, New Hampshire, Pennsylvania and Washington."**
  - RCFP adds: *"These laws are sometimes called 'two-party' consent laws, but technically they require all parties' consent."*
- **"four states require all parties' consent with respect to either in-person conversations or phone calls. For example, Missouri and Oregon require all parties' consent with respect to in-person conversations but only one party's consent with respect to phone calls. Conversely, Connecticut and Nevada require all parties' consent with respect to phone calls but only one party's consent with respect to in-person conversations."**
- **"Lastly, Hawaii and Maine require the consent of all parties to record conversations in particularly private places, but otherwise only require the consent of one party."**
- **"Regardless of the state, it is almost always illegal to record a conversation to which you are not a party, do not have any consent to record, and could not naturally overhear."**

#### ⚠️ Correction to the commonly circulated list

The prompt's candidate list was **CA, CT, FL, IL, MD, MA, MI, MT, NV, NH, PA, WA**. Verified findings:

| State | In the prompt's list? | Actual status per RCFP | Correction |
|---|---|---|---|
| CA | yes | all-party (in-person + phone) | ✅ confirmed |
| CT | yes | **all-party for PHONE only**; one-party for in-person | ⚠️ **partial** — not a blanket all-party state |
| FL | yes | all-party (in-person + phone + electronic) | ✅ confirmed |
| IL | yes | all-party | ✅ confirmed |
| MD | yes | all-party | ✅ confirmed |
| MA | yes | all-party | ✅ confirmed |
| MI | yes | all-party **for third parties**; participants disputed | ⚠️ **qualified** — see §1.4 |
| MT | yes | all-party | ✅ confirmed |
| NV | yes | **all-party for PHONE only**; one-party in-person | ⚠️ **partial** — not a blanket all-party state |
| NH | yes | all-party | ✅ confirmed |
| PA | yes | all-party | ✅ confirmed |
| WA | yes | all-party | ✅ confirmed |
| **DE** | **absent from prompt** | **all-party (per RCFP's 11-state list)** | ➕ **must be added** |
| **OR** | **absent from prompt** | was all-party for in-person; **struck down by the 9th Circuit in 2023** | ➕ **must be added as a US state that *changed*** |

### B5.3.3 State-by-state table (all rows VERIFIED via the RCFP chapter URL in column 4, fetched 2026-09-19)

| State | Consent rule (practical) | Applies to in-person? | Applies to phone/electronic? | Statute cited by RCFP | RCFP chapter (fetched) | Penalty / civil exposure |
|---|---|---|---|---|---|---|
| **California** | All-party | Yes — confidential communications only (public/no-expectation excluded) | Yes; **and for cell/cordless calls regardless of confidentiality** | Cal. Penal Code §632(a); §632(c); §632.7; §631 | https://www.rcfp.org/reporters-recording-guide/california/ | Fine ≤$2,500 or ≤1 yr; 2nd offence ≤$10,000. Civil: $5,000 or 3× actual damages (§637.2) |
| **Connecticut** | **Phone: all-party. In-person: one-party** | One-party (Conn. Gen. Stat. §§53a-187, -189) | All-party for **civil** liability (Conn. Gen. Stat. §52-570d); criminal only needs one party | §§53a-187, -189, 52-570d | https://www.rcfp.org/reporters-recording-guide/connecticut/ | Felony ≤5 yrs / ≤$5,000; §52-570d(c) damages + costs + attorney's fees |
| **Delaware** | **All-party (stricter of two conflicting statutes)** | Yes | Yes | Del. Code Ann. tit. 11, §1335(a)(4) (all-party) vs §2402(c)(4) (one-party) | https://www.rcfp.org/reporters-recording-guide/delaware/ | Privacy law: misdemeanor; wiretap law: felony + civil suit. *United States v. Vespe*, 389 F. Supp. 1359 (D. Del. 1975) held a party may record — RCFP advises following the stricter law |
| **Florida** | All-party (in-person + phone + electronic) | Yes — "confidential communication" only | Yes — all-party | Fla. Stat. §934.03(2)(d); §934.02 | https://www.rcfp.org/reporters-recording-guide/florida/ | Felony ≤5 yrs / ≤$5,000; first offence w/o illegal purpose → misdemeanor ≤1 yr / ≤$1,000. Civil ≤$1,000 **per day** + punitive + fees (§934.10) |
| **Illinois** | All-party | Yes — "private oral conversation" | Yes — phone + electronic | 720 ILCS 5/14-2(a)(1); 5/14-1(d); 5/14-1(e) | https://www.rcfp.org/reporters-recording-guide/illinois/ | **Felony 1–3 yrs + ≤$25,000**; 2–5 yrs if a protected official is recorded. Civil §5/14-6 (injunction + actual + punitive) |
| **Maryland** | All-party | Yes — "private conversation" (= reasonable expectation of privacy, *Agnew v. State*, 197 A.3d 27 (Md. 2018)) | **Yes — telephone protected regardless of any expectation of privacy** (*Fearnow*) | Md. Code Ann., Cts. & Jud. Proc. §10-402(c)(3); §10-401(13)(i) | https://www.rcfp.org/reporters-recording-guide/maryland/ | Felony ≤5 yrs / ≤$10,000; civil §10-410 (actual + punitive + fees) |
| **Massachusetts** | All-party | Yes — **and a state appellate court held it applies even in a public location** (*Manzelli*) | Yes — phone + cell texts (*Moody*) | Mass. Gen. Laws ch. 272, §99(C) | https://www.rcfp.org/reporters-recording-guide/massachusetts/ | Felony ≤$10,000 / ≤5 yrs; disclosure misdemeanor. Civil ≥$100/day or ≥$1,000 + punitive + fees (§99(Q)) |
| **Michigan** | All-party **for third parties**; **participants disputed** | Yes (private conversations) | Yes | Mich. Comp. Laws §750.539c | https://www.rcfp.org/reporters-recording-guide/michigan/ | Felony ≤2 yrs / ≤$2,000; civil §750.539h (injunction + actual + punitive) |
| **Montana** | All-party | Yes — **only via "hidden" device** | Yes — all-party, incl. electronic | Mont. Code Ann. §45-8-213(1)(c); §45-8-213(2)(a); §45-8-213(3) | https://www.rcfp.org/reporters-recording-guide/montana/ | Criminal penalties (RCFP chapter). Exceptions: warning given, public meetings, public officials on duty, certain healthcare-emergency lines |
| **Nevada** | **In-person: one-party. Phone: all-party** | One-party (Nev. Rev. Stat. §200.650) | All-party (§200.620); **extends to cell calls and texts** (*Sharpe v. Nevada*, 350 P.3d 388 (Nev. 2015)) | §§200.650, 200.620 | https://www.rcfp.org/reporters-recording-guide/nevada/ | Felony 1–4 yrs / ≤$5,000 (§§193.130, 200.690) |
| **New Hampshire** | All-party | Yes — where reasonable expectation of no recording | Yes — phone + electronic | N.H. Rev. Stat. Ann. §§570-A:1, 570-A:2 | https://www.rcfp.org/reporters-recording-guide/new-hampshire/ | **Felony, reduced to misdemeanor if the violator was a party or had one party's prior consent** |
| **Pennsylvania** | All-party | Yes — only where reasonable expectation of privacy | **Yes — telephone/electronic protected regardless of expectation of privacy** (*Deck*) | 18 Pa. Cons. Stat. Ann. §§5703, 5704(4); §5702 | https://www.rcfp.org/reporters-recording-guide/pennsylvania/ | **Felony ≤7 yrs / ≤$15,000** (§§1101, 1103, 5703) |
| **Washington** | All-party | Yes — "private conversation" | Yes — private communication by "telephone, telegraph, radio, or other device" | Wash. Rev. Code Ann. §9.73.030; §9.73.080 | https://www.rcfp.org/reporters-recording-guide/washington/ | Gross misdemeanor. **Consent may be obtained by "a reasonably effective recorded announcement … that it is about to be recorded"** |
| **Oregon** | One-party for phone; **in-person all-party provision STRUCK DOWN** | 9th Cir. struck Or. Rev. Stat. §165.540's in-person provision as an unconstitutional content-based restriction | One-party for telephone | Or. Rev. Stat. §165.540; §165.535 | https://www.rcfp.org/reporters-recording-guide/oregon/ | *Project Veritas v. Schmidt*, 72 F.4th 1043 (9th Cir. 2023) |
| **Vermont** | **No state recording statute at all** | Federal only | Federal only | — | https://www.rcfp.org/reporters-recording-guide/vermont/ | Federal §2511 applies |

### B5.3.4 The specific nuances the prompt asked me to verify

**Illinois eavesdropping-statute history — VERIFIED (RCFP IL chapter + RCFP intro).**
RCFP's Illinois chapter (last updated May 2020) states the current law plainly: all parties must consent to record "all or any part of any" private oral conversation (720 ILCS 5/14-2(a)(1)), with privacy determined by whether "at least one of the participants reasonably intended the conversation to be private" (720 ILCS 5/14-1(d)). Note the **2014 rewrite** context: the earlier version of the Illinois statute was held unconstitutional by the Seventh Circuit in *ACLU of Illinois v. Alvarez*, 679 F.3d 583 (7th Cir. 2012) — **VERIFIED via the RCFP Illinois chapter**, which cites *Alvarez* for the First Amendment right to record police. The current statute is the narrower "private conversation" formulation. Practical point: **Illinois is a genuine all-party state for meetings**, with felony exposure (1–3 yrs, ≤$25,000).

**Michigan's arguably one-party case law — VERIFIED (RCFP MI chapter).** RCFP states the split explicitly:
> "Courts disagree, however, on whether this law allows a participant in the conversation to record without the permission of the other parties… A longstanding Michigan Court of Appeals decision found that a participant in a private conversation does not need all parties' consent to record that conversation. *Sullivan v. Gray*, 324 N.W.2d 58 (Mich. Ct. App. 1982). Recently, a federal district court affirmed the Sullivan interpretation, holding that 'the statute is not violated when a conversation is recorded by one of its participants.' See Opinion and Order, *AFT Michigan v. Project Veritas*, 4:17-cv-13292 (E.D. Mich. 2021) (Dkt. 202). **The Michigan Supreme Court — the final authority on matters of state law — has not yet addressed the issue.**"

Also VERIFIED in the same chapter: *People v. Stone*, 621 N.W.2d 702 (Mich. 2001) — consent is required only where a party has a reasonable expectation of privacy, so no consent is needed in public places.
**Product implication:** a bot-participant is squarely in the disputed zone in Michigan. Treat MI as **all-party** for compliance purposes; the *Sullivan* line is a litigation defence, not a design assumption.

**Nevada one-party in person / all-party phone — VERIFIED.** *See table above.* RCFP: "An individual who has the consent of at least one party to an in-person conversation can lawfully record it or disclose its contents, but the consent of all parties is required to record or disclose the existence or contents of a telephone conversation." The emergency exception is narrow and, per *Lane v. Allstate Ins. Co.*, 969 P.2d 938 (Nev. 1998), aimed mainly at law enforcement.

**Connecticut — VERIFIED and frequently mis-stated.** CT is **not** a general all-party state. In-person is one-party. Phone is all-party **for civil liability** under §52-570d, while criminal liability under §§53a-187/-189 needs only one party. A meeting bot that captures an **in-person** room conversation in CT is in a weaker position than one capturing a phone call.

**California's cell-phone trap — VERIFIED (RCFP CA chapter).** §632.7 applies to calls involving **at least one cellphone or cordless phone, regardless of confidentiality**, and *Smith v. LoanMe, Inc.* (Cal. 2021) held this covers **participants as well as third-party eavesdroppers**. RCFP also notes *Gruber v. Yelp Inc.* (Cal. Ct. App. 2020) — even a "one-way recording" where the other party is inaudible can violate the statute without all-party consent. **This is the single most dangerous provision for a meeting bot in California**, because most business calls now involve at least one mobile device.

**Massachusetts's "awareness" rule — VERIFIED.** RCFP: "The law only applies to secret recordings, however, so affirmative consent is not necessary when all parties are aware of the recording. *Curtatone v. Barstool Sports, Inc.*, 169 N.E.3d 480, 483 (Mass. 2021)." Also *Massachusetts v. Manzelli*, 864 N.E.2d 566 (Mass. App. Ct. 2007) — the all-party rule applies whether the conversation is private or public.

**Washington's announcement rule — VERIFIED.** RCW §9.73.030: consent "is considered obtained when one party makes a reasonably effective recorded announcement to all other parties in the conversation that it is about to be recorded." *State v. Townsend*, 57 P.3d 255, 260 (Wash. 2002): a party is deemed to consent if aware the recording is taking place.
**This is the single most product-relevant sentence in the whole US section**: in Washington (and analogously per *Curtatone* in Massachusetts, and PA's *Byrd* "knew or should have known" standard), **an audible in-meeting announcement is itself a recognised form of obtaining consent.**

**Pennsylvania's *Byrd* standard — VERIFIED.** RCFP PA chapter: "Courts will find consent, however, in instances in which parties knew or reasonably should have known the conversation was being recorded. *Commonwealth v. Byrd*, No. 34 WAP 2018, 2020 WL 4344904, at *6 (Pa. July 29, 2020)." Also *Commonwealth v. Cruttenden*, 58 A.3d 95 (Pa. 2012) — parties to **emails, chats or text messages may record those conversations without the other parties' consent**, because participants know such media are likely to be recorded. **This is the strongest available analogy for making "the meeting is being recorded/transcribed" visible rather than verbally acknowledged.**

**Oregon's change — VERIFIED (RCFP, last updated October 2023, i.e. the most current chapter in the guide).** The Ninth Circuit struck Or. Rev. Stat. §165.540's in-person all-party provision in *Project Veritas v. Schmidt*, 72 F.4th 1043 (9th Cir. 2023), holding Oregon lacks a compelling interest "in protecting individuals' conversational privacy" from recording in "places open to the public." **Oregon telephonic conversations remain one-party.** Oregon **must not** be described as an all-party state any more.

**Delaware — VERIFIED as an omission from the conventional list.** RCFP includes Delaware in its 11-state all-party list, while noting the statute conflict and *Vespe*. **Most online "two-party consent state" lists circulate CA/CT/FL/IL/MD/MA/MI/MT/NV/NH/PA/WA and omit Delaware — that list is wrong on three counts (adds CT and NV as blanket states, omits DE).**

### B5.3.5 Cross-cutting federal/state rules that shape the design

All **VERIFIED via https://www.rcfp.org/introduction-to-reporters-recording-guide/** unless noted.

| Rule | RCFP statement | Product consequence |
|---|---|---|
| **Implied consent** | "It is generally legal to record or film a face-to-face interview when your recording device or camera is in plain view, or to record any type of conversation when the parties are warned of the recording and continue with the conversation. The consent of all parties is presumed in these instances. See, e.g., *Alexander v. Pathfinder, Inc.*, 189 F.3d 735, 743 (8th Cir. 1999). It is a best practice, however, to record the subject's verbal consent." | A visible, persistent in-meeting banner + a conspicuous bot participant plausibly establishes implied consent in many states. **Do not rely on it alone** in CA (§632.7 has no confidentiality element) |
| **Reasonable expectation of privacy** | "Recording laws generally only require consent to an in-person conversation if the individuals being recorded have a reasonable expectation of privacy. Not every state's laws make this distinction, however." | A private business meeting is the paradigm case *with* an expectation of privacy. Do **not** design around a "no privacy expectation" theory |
| **Interstate calls** | "When a call involves participants from different states, journalists should err on the side of caution and assume that the stricter state law will apply." Some courts apply the law of the state where the recording device sits; others where the recorded person sits. | **A meeting with one California participant should be treated as an all-party-consent meeting globally.** This is the correct default for a cloud product serving arbitrary geographies |
| **Illegally obtained recordings** | "Many states also create separate violations for possessing or knowingly disclosing illegally intercepted or recorded conversations… publishing or airing such recordings — or even the details of such conversations — could be an additional offense." | §2511(1)(c)–(d) means **the AI summary is a second, independent exposure.** A summary is a "use" and a "disclosure" |
| **Bartnicki v. Vopper**, 532 U.S. 514 (2001) | First Amendment protects disclosure of illegally obtained recordings by a party with "clean hands" where the content is of public concern | **A narrow news-media defence. Does not help a commercial SaaS meeting-notes product** |

---

## B5.4 EU / GDPR

### B5.4.1 Is recording a meeting "personal data processing"? — Yes, unambiguously

**VERIFIED via https://gdpr-info.eu/art-4-gdpr/ (fetched 2026-09-19)**

Art. 4(2) defines **processing** as:
> "any operation or set of operations which is performed on personal data or on sets of personal data, whether or not by automated means, such as **collection, recording**, organisation, structuring, storage, adaptation or alteration, retrieval, consultation, use, disclosure by transmission, dissemination or otherwise making available, alignment or combination, restriction, erasure or destruction"

**"Recording" is a named processing operation in Art. 4(2).** Art. 4(1) defines personal data as "any information relating to an identified or identifiable natural person," expressly including "one or more factors specific to the physical, physiological, genetic, mental, economic, cultural or social identity of that natural person."

So: capturing a meeting → processing; speech content + speaker identity → personal data; the **transcript** is structured personal data; the **AI summary** is a further processing operation ("structuring", "adaptation or alteration", "alignment or combination").

**Voice and speaker identification — Art. 4(14), VERIFIED via https://gdpr-info.eu/art-4-gdpr/:**
> "'biometric data' means personal data resulting from **specific technical processing relating to the physical, physiological or behavioural characteristics of a natural person, which allow or confirm the unique identification of that natural person**, such as facial images or dactyloscopic data"

**Critical design consequence:** **diarization alone is not biometric processing** — it groups segments, it does not "allow or confirm the unique identification" of a person. But **voiceprint enrolment / voice-based speaker identification is biometric data**, and if used "for the purpose of uniquely identifying a natural person" it becomes a **special category** requiring an Art. 9(2) condition. A "live meeting translation + minutes" product should therefore avoid persistent voice enrolment, or treat it as an Art. 9 processing stream.

**Art. 4(11) consent — VERIFIED (same page, note gdpr-info renders the list with an off-by-two visual offset; the operative text is):**
> "'consent' of the data subject means any freely given, specific, informed and unambiguous indication of the data subject's wishes by which he or she, by a statement or by a clear affirmative action, signifies agreement to the processing of personal data relating to him or her"

**Art. 4(6) profiling / Art. 4(1) — VERIFIED:** "profiling" means automated processing "to evaluate certain personal aspects relating to a natural person, in particular to analyse or predict aspects concerning that natural person's **performance at work**…". → **If the AI minutes are used to evaluate employee performance, the processing becomes profiling of employees.** Design the retention/usage boundary explicitly.

### B5.4.2 Lawful basis — Art. 6

**VERIFIED via https://gdpr-info.eu/art-6-gdpr/ (fetched 2026-09-19).** Art. 6(1) provides six bases; the three relevant ones verbatim:

| Basis | Art. 6(1) text (VERIFIED) | Fits which meeting type? | Key risk |
|---|---|---|---|
| **(a) Consent** | "the data subject has given consent to the processing of his or her personal data for one or more specific purposes" | External/customer calls where participation is voluntary; consumer products | Not freely given in employment (Recital 43, below) |
| **(b) Contract** | "processing is necessary for the performance of a contract to which the data subject is party or in order to take steps at the request of the data subject prior to entering into a contract" | Customer-facing calls where the transcript is intrinsic to the service delivered | Only covers what is *necessary*; summarisation for internal analytics is not |
| **(f) Legitimate interests** | "processing is necessary for the purposes of the legitimate interests pursued by the controller or by a third party, except where such interests are overridden by the interests or fundamental rights and freedoms of the data subject which require protection of personal data, in particular where the data subject is a child" | Internal employee meetings; the realistic basis for B2B meeting-minutes | Requires a documented three-part test and balancing; not available to public authorities for their own tasks |

**Recital 43 — VERIFIED via https://gdpr-info.eu/recitals/no-43/ (fetched 2026-09-19):**
> "In order to ensure that consent is freely given, consent should not provide a valid legal ground for the processing of personal data in a specific case where there is a **clear imbalance** between the data subject and the controller… **Consent is presumed not to be freely given if it does not allow separate consent to be given to different personal data processing operations** despite it being appropriate in the individual case, or if the performance of a contract, including the provision of a service, is dependent on the consent despite such consent not being necessary for such performance."

**This is the decisive text for employer-provided meeting software.** An employee cannot meaningfully refuse consent to the employer's meeting tool; there is a clear imbalance. Two further consequences:
- **Separate consents per purpose** are expected — recording, transcription, AI summarisation, model training, and translation are distinct operations. A single bundled "I agree" is presumptively not freely given.
- **Consent cannot be a condition of service** where it is not necessary.

**Recital 47 — VERIFIED via https://gdpr-info.eu/recitals/no-47/ (fetched 2026-09-19):**
> "The legitimate interests of a controller, including those of a controller to which the personal data may be disclosed, or of a third party, may provide a legal basis for processing, provided that the interests or the fundamental rights and freedoms of the data subject are not overriding, **taking into consideration the reasonable expectations of data subjects based on their relationship with the controller**. Such legitimate interest could exist for example where there is a relevant and appropriate relationship between the data subject and the controller in situations such as where **the data subject is a client or in the service of the controller**… At any rate the existence of a legitimate interest would need **careful assessment** including whether a data subject can **reasonably expect** at the time and in the context of the collection of the personal data that processing for that purpose may take place. The interests and fundamental rights of the data subject could in particular override the interest of the data controller where personal data are processed in circumstances where **data subjects do not reasonably expect further processing**."

**Reading for the product:**
- Recital 47 expressly contemplates **clients** and **persons "in the service of" the controller** — i.e. employees. So legitimate interests is the natural basis for internal meeting minutes.
- But the **"reasonably expect"** test does the real work. A **visible, in-meeting notice** is precisely what manufactures a reasonable expectation, which upgrades the legitimat-interest balancing in the controller's favour. This is why §3 (platform notification) and §2.3 (Art. 13 transparency) are not mere formalities — they are the load-bearing elements of the legitimate-interest case.

**ICO guidance (UK, not EU, but directly on point) — VERIFIED via https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/ (fetched 2026-09-19).** The page confirms the structured approach the ICO expects: *"What is the three-part test?"*, *"When is using personal information 'necessary'?"*, *"What is the balancing test?"*, *"What is the importance of reasonable expectations?"*, *"When do people's interests override ours?"*. It also states it was updated 23 March 2026 "to reflect amendments introduced by the Data (Use and Access) Act" — **note this is UK law and does not track EU GDPR amendments.** The ICO's section headings are verified; the body text of those sections was behind the page's collapsible UI and is not quoted here.

**Art. 6(4) — further processing / compatibility (VERIFIED via https://gdpr-info.eu/art-6-gdpr/).** Where AI summarisation is a purpose other than the one for which the audio was collected, the controller must assess compatibility taking into account "any link between the purposes… the context in which the personal data have been collected… the nature of the personal data, in particular whether special categories of personal data are processed… the possible consequences of the intended further processing for data subjects… the existence of appropriate safeguards, which may include encryption or pseudonymisation."
→ **Design consequence:** if the product offers "translation only" and later turns on "AI minutes" or "model improvement," that is a *new purpose* requiring either fresh consent or a documented compatibility assessment.

### B5.4.3 Art. 9 special categories, Art. 13 transparency, Art. 5 principles

**Art. 9(1) — VERIFIED via https://gdpr-info.eu/art-9-gdpr/:**
> "Processing of personal data revealing racial or ethnic origin, political opinions, religious or philosophical beliefs, or trade union membership, and the processing of genetic data, **biometric data for the purpose of uniquely identifying a natural person**, data concerning health or data concerning a natural person's sex life or sexual orientation shall be prohibited."

Art. 9(2) gates to lift the prohibition, relevant ones **VERIFIED**: **(a)** "the data subject has given **explicit consent**… for one or more specified purposes"; **(b)** "processing is necessary for the purposes of carrying out the obligations and exercising specific rights of the controller or of the data subject in the field of **employment** and social security and social protection law in so far as it is authorised by Union or Member State law or a collective agreement…"; **(e)** data "manifestly made public by the data subject."

**This is a genuine product risk that is usually missed.** An ordinary business meeting routinely contains: trade-union discussion (works council / CSE meetings, collective bargaining), health disclosures (sick leave, accommodations), religious or political remarks, and — with diarization plus voice ID — biometric data. **A blanket "record everything, summarise everything" product will unavoidably ingest Art. 9 data.** Mitigations: the "translate-only, don't store" mode (§4), per-meeting opt-out, and explicit exclusion of works-council/HR meetings from default capture.

Also note Art. 9(2)(b) requires authorisation "by Union or Member State law **or a collective agreement**" — in Germany that is exactly a **Betriebsvereinbarung** (§2.4), and in France the CSE consultation record (§2.5).

**Art. 13 — VERIFIED via https://gdpr-info.eu/art-13-gdpr/ (fetched 2026-09-19).** Where personal data are collected from the data subject, the controller must provide, *inter alia*, the identity and contact details of the controller, the purposes and the legal basis, the recipients, the retention period, and the data subject's rights. **Art. 13(3)** requires this to be provided "**at the latest at the time of the first communication** with the data subject" where data were not obtained from the data subject.
**Design consequence:** the notice must be delivered to a participant **at or before the moment they are recorded**, not in a post-meeting email. This maps directly onto the platform notification features in §3.

**Art. 5 — VERIFIED via https://gdpr-info.eu/art-5-gdpr/ (fetched 2026-09-19)** — the principles that constrain the product:
- "processed lawfully, fairly and in a transparent manner" (lawfulness, fairness, transparency)
- "collected for specified, explicit and legitimate purposes and not further processed in a manner that is incompatible with those purposes" (**purpose limitation**)
- "adequate, relevant and limited to what is necessary" (**data minimisation**)
- "kept in a form which permits identification of data subjects for no longer than is necessary" (**storage limitation**)
- "processed in a manner that ensures appropriate security… (**integrity and confidentiality**)"
- Art. 5(2): "The controller shall be responsible for, and be able to demonstrate compliance" (**accountability**)

**Storage limitation is the article that makes the "translate-only, don't store" mode legally attractive rather than merely privacy-friendly.** If you never persist the audio, Art. 5(1)(e) is satisfied by construction.

**Art. 15 — VERIFIED via https://gdpr-info.eu/art-15-gdpr/: right of access.** A participant can request a copy of the transcript and summary; a DSAR against a meeting-notes corpus is operationally expensive. **Design consequence:** per-participant indexability and deletion must exist from day one.

### B5.4.4 Germany — works council co-determination (§87 BetrVG)

**VERIFIED via https://www.gesetze-im-internet.de/betrvg/__87.html (fetched 2026-09-19).** §87(1) BetrVG confers a **right of co-determination (Mitbestimmungsrecht)** — not mere consultation — "soweit eine gesetzliche oder tarifliche Regelung nicht besteht," in the following enumerated matters. The directly relevant ones, verbatim from the official text:

| §87(1) No. | German text (VERIFIED) | English working translation |
|---|---|---|
| **Nr. 1** | "Fragen der Ordnung des Betriebs und des Verhaltens der Arbeitnehmer im Betrieb" | Questions of order in the establishment and employee conduct |
| **Nr. 6** | "**Einführung und Anwendung von technischen Einrichtungen, die dazu bestimmt sind, das Verhalten oder die Leistung der Arbeitnehmer zu überwachen**" | **Introduction and use of technical devices intended to monitor employee behaviour or performance** |
| **Nr. 14** | "Ausgestaltung von mobiler Arbeit, die mittels Informations- und Kommunikationstechnik erbracht wird" | Design of mobile work performed via information and communication technology |

**Art. 87(2) — VERIFIED:** "Kommt eine Einigung über eine Angelegenheit nach Absatz 1 nicht zustande, so entscheidet die **Einigungsstelle**." → If no agreement is reached, a **conciliation committee** decides. The works council therefore holds a genuine veto-equivalent lever, and the employer cannot unilaterally introduce a monitoring-capable tool.

**Assessment (my analysis, clearly flagged as analysis rather than verified fact):** §87(1) Nr. 6 is the operative hook for AI meeting transcription/summarisation in Germany. The test is whether the device is *objectively capable* of monitoring behaviour or performance — **not** whether the employer intends to monitor. Because a retained, searchable, speaker-attributed, AI-summarised corpus of everything said in meetings is paradigmatically capable of that, the prevailing view is that **introducing such a tool in a German establishment with a works council triggers mandatory co-determination, typically resulting in a Betriebsvereinbarung.** Nr. 1 and Nr. 14 supply additional hooks (meeting conduct rules; mobile/remote work delivered through ICT).

> **Verification honesty:** the §87 statutory text is **VERIFIED**. The *application* of §87(1) Nr. 6 to AI transcription tools is **my legal analysis**, not a claim I verified against a fetched German court or DPA decision. Searches surfaced German-language sources on AI works-agreement practice — including a proposed "Betriebsvereinbarung KI-Einsatz" template at https://zenodo.org/records/22002995/files/ki-betriebsvereinbarung.pdf and a Böckler-Stiftung/ver.di event paper — but these are **PDFs which I could not text-extract** with the tooling available, and I am therefore marking them **UNVERIFIED/not reachable (content)**. `datenschutzkonferenz-online.de` returned HTTP 200 at its homepage but I did not retrieve specific DSK guidance text.

### B5.4.5 France — CSE consultation and CNIL guidance

**Secondary source VERIFIED via https://www.legisocial.fr/actualites-sociales/7108-ecouter-enregistrer-conversations-telephoniques-salaries.html (fetched 2026-09-19).** ⚠️ This is a **French HR/legal publisher (LégiSocial) summarising CNIL's position**, not the CNIL itself. I could **not** retrieve CNIL's own page: `cnil.fr` serves a JS-only SPA (339 KB HTML → 3 stripped lines, 0 keyword hits), and the CNIL PDF I fetched (NS57) uses subset-font encoding that no available extractor could decode. **CNIL primary source: UNVERIFIED/not reachable.**

What the secondary source attributes to CNIL / French law (**SECONDARY — treat as indicative, must be confirmed against CNIL primary**):

| Requirement | Stated content |
|---|---|
| **Legal starting point** | "Compte tenu des risques d'atteinte à la vie privée, l'employeur n'a, en principe, pas le droit d'écouter les conversations téléphoniques des salariés" — in principle the employer has **no right** to listen to employees' telephone calls; only occasionally and for training or quality-evaluation purposes |
| **Works council / staff representatives** | Before deploying listening/recording, the employer must **"Consulter les représentants du personnel : le CSE"** (consult the CSE) |
| **Employee information** | Inform employees by any means; employees must be told **the periods during which they may be listened to** (per Cour de cassation social-chamber case law) |
| **Counterparty information + right to object** | "Les interlocuteurs doivent également être informés de leur droit d'opposition **avant la fin de la conversation téléphonique**" — third parties must be told of their **right to object, exercisable before the end of the call** |
| **Retention — call reports** | CNIL recommends call reports/analysis grids be kept **maximum 1 year** |
| **Retention — training recordings** | **Maximum 6 months** |
| **Retention — banking evidentiary recordings** | **Maximum 5 years** |
| **Prohibition on permanent listening** | "Aucune écoute permanente des conversations du personnel ne peut être mise en œuvre" — **no permanent monitoring** of staff conversations may be deployed |
| **Private-call neutralisation** | The system must let employees step **out of the recording scope** for private calls, both incoming and outgoing (e.g. a dedicated key to disable recording), or provide unrecorded lines |

**Why this matters for the product:** the CNIL-derived requirements map almost one-to-one onto the §4 mitigations — a **right to object exercisable in-call**, a **technical neutralisation path**, **hard retention caps by purpose**, and **no always-on capture**. The "translate-only, don't store" architecture is close to the CNIL-friendly design.

**French law hook — UNVERIFIED in this session:** the CSE consultation obligation is commonly cited to **Art. L.2312-8** and **L.2312-38 Code du travail** (consultation on the introduction of new technologies enabling employee monitoring), and the refusal of unlawfully obtained evidence to the *loyauté de la preuve* line of Cour de cassation authority. I did **not** fetch legifrance.gouv.fr or a Cour de cassation decision in this session, so these citations are **UNVERIFIED/not reachable** and must be confirmed. (`courdecassation.fr` did appear in search results with an export URL, but I did not successfully fetch and extract it.)

### B5.4.6 EU AI Act — is it relevant? Yes, but only at the transparency tier

**VERIFIED via https://eur-lex.europa.eu/eli/reg/2024/1689/oj (fetched 2026-09-19; Art. 50 read at file lines 1622–1631).**

**Article 50 — "Transparency obligations for providers and deployers of certain AI systems"**, operative paragraphs **VERIFIED verbatim**:

| Art. 50 | Text | Relevance to meeting AI |
|---|---|---|
| **50(1)** | "Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned **are informed that they are interacting with an AI system**, unless this is obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect…" | Applies to a conversational AI assistant in the meeting. A silent summariser is arguably not "interacting directly"; a live AI translator/assistant that participants address is |
| **50(2)** | "Providers of AI systems, including general-purpose AI systems, **generating synthetic audio, image, video or text content, shall ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated.**… This obligation shall not apply to the extent the AI systems perform **an assistive function for standard editing or do not substantially alter the input data** provided by the deployer or the semantics thereof…" | **AI-generated meeting minutes are synthetic text content.** The carve-out for assistive/standard-editing functions that do not substantially alter input or semantics is the key design question: a faithful extractive summary plausibly falls inside the carve-out; a generative narrative "minutes" document plausibly does not. **Machine-readable marking (e.g. C2PA-style provenance) may be required.** |
| **50(3)** | "Deployers of an **emotion recognition system or a biometric categorisation system** shall inform the natural persons exposed thereto of the operation of the system, and shall process the personal data in accordance with Regulations (EU) 2016/679…" | **Direct warning:** any "sentiment analysis" / "engagement detection" / "speaker mood" feature built on the meeting audio makes you a deployer of an **emotion recognition system** with its own information duty — and, under GDPR, likely Art. 9 territory |
| **50(4)** | "Deployers of an AI system that **generates or manipulates image, audio or video content constituting a deep fake**, shall disclose that the content has been artificially generated or manipulated." Plus: deployers generating/manipulating **text published to inform the public on matters of public interest** must disclose it, "unless the AI-generated content has undergone a process of human review or editorial control and where a natural or legal person holds editorial responsibility" | **Synthetic audio matters.** If the product does live **translation with synthetic voice output** (voice cloning / TTS in the speaker's timbre), that is very plausibly a **deep fake** requiring disclosure. Even plain TTS translation output should be disclosed. Note the "human review + editorial responsibility" carve-out is drafted for the text limb and is a plausible route for human-approved minutes |
| **50(5)** | "The information referred to in paragraphs 1 to 4 shall be provided to the natural persons concerned in a **clear and distinguishable manner at the latest at the time of the first interaction or exposure**. The information shall conform to the applicable accessibility requirements." | **Same timing principle as GDPR Art. 13(3): at or before first exposure.** A post-meeting email is too late. This is the legal basis for an in-meeting notice |
| **50(7)** | The AI Office is to encourage **codes of practice** for detection and labelling of artificially generated content | Watch for implementing acts / codes of practice |

**Classification assessment — and an important correction to the usual "limited risk" assumption.**

Meeting recording + transcription + extraction-based summarisation, in its **neutral form**, is a **limited-risk** system whose realistic AI Act exposure is **Art. 50 transparency only**.

**However** — **VERIFIED via https://eur-lex.europa.eu/eli/reg/2024/1689/oj (fetched 2026-09-19; Recital 57 read at file line 469)** — the AI Act expressly routes **employment monitoring AI into the HIGH-RISK regime**. Recital 57, verbatim:

> "**AI systems used in employment, workers management and access to self-employment**, in particular for the recruitment and selection of persons, for making decisions affecting terms of the work-related relationship, promotion and termination of work-related contractual relationships, for allocating tasks on the basis of individual behaviour, personal traits or characteristics and **for monitoring or evaluation of persons in work-related contractual relationships, should also be classified as high-risk**, since those systems may have an appreciable impact on future career prospects, livelihoods of those persons and workers' rights… **AI systems used to monitor the performance and behaviour of such persons may also undermine their fundamental rights to data protection and privacy.**"

**Product-design conclusion:** an AI meeting assistant is **not** automatically high-risk — but the moment it is positioned or configured to **monitor or evaluate employees** (talk-time analytics, participation scores, engagement metrics, performance inferences drawn from a transcript corpus), it sits squarely inside the Annex III point 4 description as characterised by Recital 57, and pulls in the **Chapter III high-risk obligations** — a fundamentally heavier compliance regime (risk management system, data governance, technical documentation, logging, human oversight, conformity assessment, registration) than Art. 50 transparency.

**Therefore: the single most important AI Act design decision for this product is to keep meeting summarisation a *record* of what was said, not a *measurement* of who said it.**

**Art. 113 — entry into force and application — VERIFIED via the same EUR-Lex fetch (file lines 2526–2532):**
> "Article 113 — Entry into force and application. This Regulation shall enter into force on the twentieth day following that of its publication in the Official Journal of the European Union. **It shall apply from 2 August 2026.** However: (a) **Chapters I and II shall apply from 2 February 2025**;"

→ **The AI Act's main body applies from 2 August 2026** — i.e. within roughly 11 months of this report's date (2026-09-19). Note the fetched consolidated text shows the *original* applicability date; subsequent amendment ("AI Act omnibus" / digital-omnibus proposals) may have shifted high-risk timelines, and I did **not** verify any such amendment — treat the high-risk timeline as **needing re-confirmation before relying on it**.

**GDPR ↔ AI Act interaction:** Art. 50(3) expressly cross-refers to GDPR compliance ("shall process the personal data in accordance with Regulations (EU) 2016/679"). **AI Act transparency does not discharge GDPR obligations** — you need the Art. 6 basis, the Art. 13 notice, and the Art. 50 disclosures, cumulatively.

---

## B5.5 Platform-level recording-notice requirements (Zoom / Google Meet / Microsoft Teams)

> **Headline retrieval caveat.** Two of the three vendors could not be fully verified from this environment. **Microsoft was fully verified.** **Zoom** could only be verified at the level of article titles and one meta description. **Google is entirely unverified** because every `google.com`-owned host is network-blocked here. The tables below state this per row.

### B5.5.1 Microsoft Teams — FULLY VERIFIED

**VERIFIED via https://learn.microsoft.com/en-us/microsoftteams/cloud-recording (fetched 2026-09-19).**

| Item | Verified fact |
|---|---|
| **Two recording modes** | "**Convenience recording** — an ad-hoc recording of a call or meeting that a user starts and manages." vs "**Compliance recording** — calls and meetings that are automatically recorded without user intervention and owned by the company, using a third-party solution." |
| **Storage** | Recordings upload to the **meeting organizer's OneDrive** (private meetings) or **SharePoint** (channel meetings). "People invited to the meeting have permissions to view the recording (guests and external attendees can view the recording only if the recording is explicitly shared with them)." |
| **Discoverability** | "It's linked in the chat for the meeting." / "It's displayed in the Recordings and Transcripts tab for the meeting in Teams calendar." / "Microsoft 365 Search indexes it." |
| **Who can record** | "**Both the organizer and recording initiator need to have recording permissions** to record the meeting or event. **Organizers with a Teams Premium license can use their meeting options to control who can record and transcribe.**" |
| **External participants** | "External participants **can't** record meetings except when it's a Teams third-party compliance recording. If an external Teams user who's enabled for compliance recording joins a meeting or call hosted by your organization, the other organization records that meeting or call for compliance purposes, **regardless of the Meeting recording setting in your organization**. **Organizers, co-organizers, and presenters in that meeting are notified and can remove the external participant from the meeting** if they don't want the other org to capture recordings." |
| **Admin controls (meetings)** | "In the left navigation of the Teams admin center, go to **Meetings > Meeting policies**… Turn the **Meeting recording** toggle **On** or **Off**." PowerShell: `-AllowCloudRecording` in `Set-CsTeamsMeetingPolicy`. |
| **Admin controls (webinars / town halls)** | `-RecordingForWebinar` / `-RecordingForTownhall` in `Set-CsTeamsEventsPolicy` ("Recording & transcription" section). |
| **Auto-recording for large events** | "**By default, events are recorded automatically.** Your users can stop their events from being automatically recorded by using the Record and transcribe setting in their meeting options." |
| **⭐ Explicit consent control** | "**Manage whether meetings require participant agreement for recording and transcription** — The `-ExplicitRecordingConsent` parameter also controls recording consent for Audio Conferencing… To require participants to give their **explicit consent** to be recorded or transcribed in any meeting that organizers with this policy create, run: `Set-CsTeamsMeetingPolicy -Identity <policy name> -ExplicitRecordingConsent Enabled`" |
| **Custom privacy-policy link** | "To update the Teams recording and transcription privacy policy URL with a custom link for users in and outside your org, you must use… The `-LegalURL` parameter within the `CsTeamsMeetingConfiguration` PowerShell cmdlet [or] the Teams admin center through **Meeting settings > Email invitation > Privacy and Security URL**." / "When you add your privacy policy URL, **your URL replaces the default Teams meeting recording and transcription privacy statement**." / "If you don't enter a privacy and security URL… we display Microsoft Entra ID's privacy policy… The Microsoft Entra ID's privacy policy isn't shown to external tenant users or anonymous users. If you don't create a privacy and security URL… the Microsoft Privacy policy is shown instead." |
| **Download restriction** | `-ChannelRecordingDownload Allow|Block`. "**Block** — Channel meeting recordings and transcripts are saved to a `Recordings\View only` folder…" |

**Takeaway for the product:** Microsoft provides a **first-class, admin-configurable explicit-consent gate** (`-ExplicitRecordingConsent`) plus a **replaceable privacy-policy URL** (`-LegalURL`). This is the single best-integrated consent mechanism of the three platforms and should be surfaced in onboarding guidance. The doc **does** confirm that participants are notified in specific circumstances (external compliance-recording joiners) but the fetched page is an **admin/config** page — it does **not** itself contain a general end-user "participant sees a recording banner" statement, so I am **not** claiming a general Teams banner notification as verified.

### B5.5.2 Zoom — PARTIALLY VERIFIED (titles yes, bodies no)

**What IS verified.** Via the Zoom-owned ServiceNow endpoint `https://support.zoom.com/api/now/sp/page?id=kb_article_view&sysparm_article=KB0068402&sysparm_language=en-US` (fetched 2026-09-19), the JSON metatags return the article title and description:

> **"Support Articles (External) - Recordings - The recording consent disclaimer prompts participants in meetings or webinars to provide their consent"**
> — VERIFIED via https://support.zoom.com/api/now/sp/page?id=kb_article_view&sysparm_article=KB0068402&sysparm_language=en-US (fetched 2026-09-19)

This verifies, from Zoom's own infrastructure, three things: (1) a feature called the **"recording consent disclaimer"** exists; (2) it **prompts participants in meetings or webinars to provide their consent**; (3) it is **customisable** (the article slug returned is `customizing-the-recording-consent-disclaimer`).

| Zoom KB article | URL | Status |
|---|---|---|
| **KB0068402** — "Customizing the recording consent disclaimer" | https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068402 | **Title + meta description VERIFIED** via Zoom's JSON API. **Body UNVERIFIED** — HTML is a JS-only shell (1,826 bytes, 0 text) |
| **KB0062037** — (recording / "without permission") | https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062037 | **UNVERIFIED.** The API returned a *stale, different* article (`human_readable_url` = `vdi-bandwidth-management-through-gpo-policies`) on 5 consecutive attempts incl. cache-busting. **I could not retrieve this article's content.** Do not treat the "recording without permission" KB as substantiated by me |
| **KB0059821** — consent (pt-BR locale surfaced in search) | https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059821 | **UNVERIFIED** — API returned the same generic shell |
| Zoom KB (ES locale, corroborates a localised consent-disclaimer feature) | https://support.zoom.com/hc/es/article?id=zm_kb&sysparm_article=KB0068403 | **SEARCH-SNIPPET ONLY** |
| "Zoom Privacy and Recording Guide" (LBL wiki mirror) | https://commons.lbl.gov/pages/viewpage.action?pageId=243536608 | **BLOCKED — Cloudflare "you have been blocked"** |
| "Zoom Recording Disclaimer and Consent" (UBC teaching-support PDF) | https://teachingsupport.forestry.ubc.ca/files/2021/04/Tips-Sheet-Zoom-Recording-Disclaimer-and-Consent.pdf | **Not fetched** (PDF extraction unavailable in this environment) |
| "Zoom Recording Security: Protecting Confidential Meetings" (Emerson College) | https://support.emerson.edu/hc/en-us/articles/41021985219867-Zoom-Recording-Security-Protecting-Confidential-Meetings | HTTP 200 but **JS-only**, stripped to 1 line |

> **⚠️ On the prompt's specific claim that "Zoom has a setting to turn off the recording disclaimer in some configurations":** I **could not verify this**. The article that would most plausibly document it (KB0062037) was not retrievable, and the customisation article's body was not retrievable. **Mark as UNVERIFIED/not reachable.** What *is* verified is that a customisable recording **consent disclaimer** exists. Whether it can be fully suppressed (as opposed to reworded or made non-blocking) is exactly the kind of claim that needs the KB body — do not assert it in customer-facing materials without re-checking.

### B5.5.3 Google Meet — NOT VERIFIED (host unreachable)

**All Google-owned hosts time out from this environment** (verified by direct `curl`: `support.google.com`, `workspace.google.com`, `workspaceupdates.googleblog.com` all returned `http=000 size=0` after 20–60 s).

| Sought item | URL | Status |
|---|---|---|
| Record a video meeting (who can record; the on-screen Recording notice) | https://support.google.com/meet/answer/9308681 | **UNREACHABLE** |
| Record a meeting / recording notice | https://support.google.com/meet/answer/9293037 | **UNREACHABLE** |
| Meeting transcripts | https://support.google.com/meet/answer/12849897 | **UNREACHABLE** |
| Record a video meeting (alt ID) | https://support.google.com/meet/answer/9845023 | **UNREACHABLE** |
| Google Meet recording notification (zh-Hant locale) | https://support.google.com/meet/answer/9308681?hl=zh-Hant | **SEARCH-SNIPPET ONLY** — search returned only this page title ("錄製視訊會議內容" / "Record video meeting content"), **no substantive text** |

**Therefore: I make NO claim in this report about Google Meet's notification behaviour, who may record, or whether participants receive a consent prompt.** The commonly repeated propositions — that Meet shows a "Recording" indicator to all participants, that recording is limited to the organizer/host or specific Workspace editions, and that transcription is announced — are **plausible but unverified here**, and must be confirmed against `support.google.com` from a network that can reach it. No reachable third-party substitute was found.

### B5.5.4 Cross-platform summary

| Platform | Auto-notifies participants? | Who can record/transcribe | Can the host disable the notice? | Admin/policy control | Verification |
|---|---|---|---|---|---|
| **Microsoft Teams** | **Partly verified** — participants *are* notified when an external compliance-recording user joins. A general recording banner is **not** confirmed by the page I fetched | Organizer **and** the recording initiator both need recording permission; Teams Premium organizers can restrict who records | Not on the fetched page; the notice is associated with the recording itself. Privacy statement is **replaceable** via `-LegalURL`, not removable | Yes — `Meeting recording` toggle; `-AllowCloudRecording`; `-RecordingForWebinar`/`-RecordingForTownhall`; **`-ExplicitRecordingConsent Enabled`**; `-ChannelRecordingDownload` | ✅ **VERIFIED** via learn.microsoft.com |
| **Zoom** | **Yes for consent** — the "recording consent disclaimer prompts participants in meetings or webinars to provide their consent" | **UNVERIFIED** | **UNVERIFIED** — the "host can turn it off" claim could not be confirmed | **UNVERIFIED** | ⚠️ **Title/meta VERIFIED; body UNVERIFIED** |
| **Google Meet** | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | ❌ **Host unreachable** |

---

## B5.6 Practical mitigations to recommend

Each mitigation is tied to the specific verified legal hook it satisfies.

### B5.6.1 In-call announcement — the highest-leverage control

| Mitigation | Legal hooks satisfied | Evidence |
|---|---|---|
| **Audible + persistent in-meeting announcement** at the moment capture begins ("This meeting is being recorded and transcribed; an AI assistant will produce minutes") | **Washington**: consent "is considered obtained when one party makes a **reasonably effective recorded announcement** to all other parties… that it is about to be recorded" (RCW §9.73.030) | VERIFIED RCFP WA |
| | **Massachusetts**: the statute covers only **secret** recordings; *Curtatone v. Barstool Sports* — no affirmative consent needed when all parties are **aware** | VERIFIED RCFP MA |
| | **Pennsylvania**: consent found where parties "**knew or reasonably should have known** the conversation was being recorded" (*Byrd*, Pa. 2020); *Cruttenden* — parties to emails/chats/texts may record because participants expect those media to be recorded | VERIFIED RCFP PA |
| | **RCFP general rule**: "It is generally legal to record… when the parties are **warned of the recording and continue with the conversation**. The consent of all parties is **presumed** in these instances" | VERIFIED RCFP intro |
| | **GDPR Art. 13(3)** — information "at the latest at the time of the first communication"; **Recital 47** "reasonably expect"; **AI Act Art. 50(5)** — "at the latest at the time of the first interaction or exposure" | VERIFIED gdpr-info.eu; eur-lex |
| **Keep the bot visible as a named participant** | RCFP implied-consent rule: recording device "in plain view" | VERIFIED RCFP intro |
| **Also capture explicit verbal/click consent** | RCFP: "It is a best practice, however, to **record the subject's verbal consent**." Use Teams `-ExplicitRecordingConsent Enabled` where available | VERIFIED RCFP intro; learn.microsoft.com |

### B5.6.2 Consent banner and per-participant acknowledgement

- **Layered notice**: (i) calendar invite text, (ii) in-meeting banner, (iii) per-participant acknowledgement prompt, (iv) link to a human-readable notice with retention and rights.
- **Separate purposes, separately consented** — recording / transcription / AI summarisation / translation / model training must be **separate toggles**. *Recital 43* VERIFIED: "**Consent is presumed not to be freely given if it does not allow separate consent to be given to different personal data processing operations.**"
- **Do not condition participation on bundled consent**, and **do not rely on employee consent** for employer-deployed tools — *Recital 43* VERIFIED (clear imbalance); use **Art. 6(1)(f) legitimate interests** with a documented three-part test plus the notice creating "reasonable expectations" (*Recital 47* VERIFIED).
- **Withdrawal/objection must be exercisable in-meeting and must work.** CNIL-derived requirement (secondary): third parties "doivent également être informés de leur **droit d'opposition avant la fin de la conversation**." **SECONDARY via legisocial.fr.**
- **Replace the platform privacy URL** with your own notice where the platform allows it — Teams `-LegalURL` / admin-centre Privacy and Security URL. **VERIFIED** learn.microsoft.com.

### B5.6.3 "Translate-only, don't store" mode (the strongest architectural mitigation)

| Property | Legal benefit | Evidence |
|---|---|---|
| Audio never persisted; processed in memory/streamed | **Art. 5(1)(e) storage limitation** satisfied by construction; **Art. 5(1)(c) data minimisation** | VERIFIED gdpr-info.eu |
| Transcript not written to durable storage (or written only on explicit opt-in per meeting) | Narrows Art. 15 DSAR surface; reduces breach impact under Art. 5(1)(f) | VERIFIED gdpr-info.eu |
| Purpose limited to real-time comprehension | **Art. 5(1)(b) purpose limitation**; avoids the **Art. 6(4)** compatibility assessment for AI summarisation as a "further purpose" | VERIFIED gdpr-info.eu |
| Position it as the CNIL-friendly default: "no permanent listening"; recordings only for defined purposes with hard caps | CNIL: "Aucune écoute permanente des conversations du personnel ne peut être mise en œuvre" | **SECONDARY via legisocial.fr** |

### B5.6.4 Ephemeral audio handling

| Mitigation | Legal hook |
|---|---|
| **No voice enrolment / no persistent voiceprints** | Art. 4(14) biometric data is defined by "allow or confirm the **unique identification**" of a person; **avoiding** that takes you out of both the biometric definition and the **Art. 9(1)** special-category prohibition. **VERIFIED** gdpr-info.eu |
| Diarization by session-local clustering only ("Speaker 1/2/3"), not by identity | Same; keeps you clear of Art. 9 and of **AI Act Art. 50(3)** "biometric categorisation system" |
| **No emotion/sentiment/"engagement" detection** | **AI Act Art. 50(3)** imposes a deployer information duty on emotion-recognition systems; under GDPR it likely drags in Art. 9. **VERIFIED** eur-lex (Art. 50(3)) |
| Encryption in transit and at rest; short-lived signed URLs for any retained audio | Art. 5(1)(f) integrity and confidentiality; Art. 6(4) "appropriate safeguards… including encryption or pseudonymisation" — both **VERIFIED** gdpr-info.eu |
| **Neutralisation path** — a one-click "leave the recording scope" / private-mode for participants | CNIL-derived: the system must allow employees to step out of the recording scope for private calls (e.g. a dedicated key disabling recording). **SECONDARY via legisocial.fr** |

### B5.6.5 Retention limits — set them, publish them, enforce them technically

| Data class | Recommended cap | Basis |
|---|---|---|
| Real-time audio | **Zero retention** (seconds) | Art. 5(1)(c)/(e); CNIL "no permanent listening" |
| Call-report / analysis grids | **≤ 1 year** | CNIL recommendation (secondary) |
| Recordings for **training/staff development** | **≤ 6 months** | CNIL recommendation (secondary) |
| Recordings for **evidentiary purposes (banking)** | **≤ 5 years** | CNIL recommendation (secondary) |
| Transcripts + AI minutes | **Purpose-justified default; enforce auto-delete (e.g. 30–90 days) unless pinned** | Art. 5(1)(e) storage limitation; **VERIFIED** gdpr-info.eu |
| **Exclude by default**: works council / CSE / HR / disciplinary meetings | No capture, or explicit per-meeting opt-in with an Art. 9(2) basis | Art. 9(1) prohibits processing of trade-union and health data; Art. 9(2)(b) requires a legal or **collective-agreement** basis. **VERIFIED** gdpr-info.eu. In Germany this is the §87 BetrVG / Betriebsvereinbarung territory. **VERIFIED** gesetze-im-internet.de |

### B5.6.6 Jurisdictional routing / geo-gating

| Mitigation | Basis |
|---|---|
| **Default to all-party-consent behaviour globally.** If any participant is in an all-party state (CA, DE, FL, IL, MD, MA, MI, MT, NH, PA, WA) — or CT/NV for phone audio — require explicit consent from all participants | RCFP: "When a call involves participants from different states, journalists should err on the side of caution and assume that **the stricter state law will apply**." **VERIFIED** |
| **Treat any meeting touching a California participant via mobile/cordless as all-party regardless of confidentiality** | Cal. Penal Code §632.7; *Smith v. LoanMe* (Cal. 2021). **VERIFIED** RCFP CA |
| **Default-on consent gate for Germany** in establishments with a works council; require a Betriebsvereinbarung or `-ExplicitRecordingConsent`-style gate | §87(1) Nr. 6 BetrVG co-determination; §87(2) Einigungsstelle. **VERIFIED** (statute text); application = analysis |
| **Turn on Teams `-ExplicitRecordingConsent`** for any tenant operating in all-party states or the EU | **VERIFIED** learn.microsoft.com |
| **Separate "summary" from "surveillance"**: no per-person performance metrics, no speaker-level talk-time league tables | **AI Act Recital 57** — "AI systems used in employment, workers management… **for monitoring or evaluation of persons in work-related contractual relationships, should also be classified as high-risk**" **VERIFIED** eur-lex; GDPR **Art. 4(6)** profiling incl. "performance at work" **VERIFIED** gdpr-info.eu. **Keeping the product a *record* rather than a *measurement* keeps it out of Annex III point 4 high-risk** |

### B5.6.7 Prioritised recommendation set (for a product team)

| Priority | Control | Why |
|---|---|---|
| **P0** | Audible + persistent in-meeting notice; bot visible as named participant | Satisfies WA/Mass/PA-style consent and GDPR Art. 13(3)/AI Act Art. 50(5) timing in one move |
| **P0** | Separate, granular purpose toggles (record / transcribe / summarise / translate / train) | Recital 43 presumption against bundled consent |
| **P0** | Zero-retention audio; "translate-only, don't store" mode | Art. 5(1)(c)/(e) by construction; strongest single legal posture |
| **P0** | No voice enrolment; no emotion/sentiment analysis | Avoids Art. 9(1) special categories and AI Act Art. 50(3) |
| **P1** | In-meeting objection/refusal that actually stops or excludes capture | CNIL "droit d'opposition avant la fin de la conversation"; GDPR Art. 21 |
| **P1** | Published retention schedule + enforced auto-deletion | Art. 5(1)(e); CNIL caps |
| **P1** | All-party-consent default whenever an all-party-state participant is present; mobile-phone trigger for CA | §2511 floor + state overlays; RCFP "stricter law" guidance |
| **P1** | Germany: works-council/Betriebsvereinbarung workflow; enable Teams `-ExplicitRecordingConsent` | §87 BetrVG co-determination |
| **P2** | Machine-readable provenance marking on AI-generated minutes; disclosure on synthetic translated audio | AI Act Art. 50(2) and 50(4) |
| **P2** | Replace platform default privacy statement with own notice (`-LegalURL`) | Art. 13; verified Teams capability |

---

## B5.7 Open items / must-recheck before publication

| # | Item | Why unresolved | How to close |
|---|---|---|---|
| 1 | **Google Meet recording/transcript notification behaviour** | All Google hosts network-blocked here | Fetch `support.google.com/meet/answer/9308681`, `/9293037`, `/12849897` from an unblocked network |
| 2 | **Zoom: can the recording consent disclaimer be disabled by the host?** | `support.zoom.com` KB bodies are JS-only; API returned a stale article for KB0062037 | Retrieve KB0062037 and KB0068402 bodies via the Zoom help centre UI or a reachable mirror |
| 3 | **CNIL primary text** on call recording ("enregistrement des conversations téléphoniques") | `cnil.fr` is a JS-only SPA; the NS57 PDF uses subset-font encoding no available extractor could decode | Read cnil.fr pages in a browser (or with a JS-capable fetch) and cite directly instead of via legisocial.fr |
| 4 | **French statutory citations** (Art. L.2312-8 / L.2312-38 Code du travail; *loyauté de la preuve* case law) | Not fetched | Fetch legifrance.gouv.fr / courdecassation.fr |
| 5 | **German works-council application of §87(1) Nr. 6 to AI transcription**; DSK guidance | §87 statute text verified, but no fetched German court/DPA decision; DSK and Betriebsvereinbarung sources were PDFs | Fetch DSK guidance HTML; obtain a text-extractable decision |
| 6 | ~~AI Act Art. 113 entry-into-force dates; Annex III employment high-risk wording~~ | **CLOSED 2026-09-19** — Art. 113 (applies from **2 Aug 2026**; Chapters I–II from 2 Feb 2025) and Recital 57 (employment monitoring = high-risk) both **VERIFIED** from `https://eur-lex.europa.eu/eli/reg/2024/1689/oj`. Residual: any post-publication **amendment** to the high-risk timeline (e.g. digital-omnibus) was **not** checked | Re-check EUR-Lex for amendments to Art. 113 / Annex III timing |
| 7 | **Primary state statutes** for IL, FL, WA, PA, MI, MT, NV, NH, MD, MA, CT, DE | `ilga.gov`, `leg.state.fl.us`, `app.leg.wa.gov`, `legis.state.pa.us` all timed out; Justia is JS/captcha | Use each state legislature's own site from an unblocked network; RCFP summaries are authoritative secondary but not primary |
| 8 | **ICO employment-monitoring guidance** | My URL guess 404'd | Locate the correct ICO monitoring-workers URL |
| 9 | **Zoom "recording without permission" KB** | Not retrievable | Same as #2 |

---

## B5.8 Source list (all URLs referenced)

**US federal / state**
- https://www.law.cornell.edu/uscode/text/18/2511
- https://www.rcfp.org/introduction-to-reporters-recording-guide/
- https://www.rcfp.org/reporters-recording-guide/ (+ `/california/`, `/connecticut/`, `/delaware/`, `/florida/`, `/illinois/`, `/maryland/`, `/massachusetts/`, `/michigan/`, `/montana/`, `/nevada/`, `/new-hampshire/`, `/oregon/`, `/pennsylvania/`, `/vermont/`, `/washington/`)
- https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=632

**EU / GDPR / EU AI Act**
- https://gdpr-info.eu/art-4-gdpr/ · https://gdpr-info.eu/art-5-gdpr/ · https://gdpr-info.eu/art-6-gdpr/ · https://gdpr-info.eu/art-9-gdpr/ · https://gdpr-info.eu/art-13-gdpr/ · https://gdpr-info.eu/art-15-gdpr/
- https://gdpr-info.eu/recitals/no-43/ · https://gdpr-info.eu/recitals/no-47/
- https://eur-lex.europa.eu/eli/reg/2024/1689/oj (EU AI Act, Art. 50)
- https://www.gesetze-im-internet.de/betrvg/__87.html (§87 BetrVG)
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/
- https://www.legisocial.fr/actualites-sociales/7108-ecouter-enregistrer-conversations-telephoniques-salaries.html *(secondary, CNIL summary)*

**Vendor**
- https://learn.microsoft.com/en-us/microsoftteams/cloud-recording
- https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068402 *(JS-only; title verified via API)*
- https://support.zoom.com/api/now/sp/page?id=kb_article_view&sysparm_article=KB0068402&sysparm_language=en-US
- https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062037 *(unretrievable)*
- https://support.google.com/meet/answer/9308681 · https://support.google.com/meet/answer/9293037 · https://support.google.com/meet/answer/12849897 *(unreachable)*
