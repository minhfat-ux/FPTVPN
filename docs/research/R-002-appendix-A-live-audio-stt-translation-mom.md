# R-002 Appendix A — Live meeting translation + MoM: browser audio, streaming STT, translation architecture, zero-cost path

**Feature:** F-002 — MiniApp dịch họp live + ghi biên bản (MoM)
**Survey date:** 20/09/2026 (all prices/quotas fetched on this date unless stated)
**Author:** delegated research pass (independent of the primary R-002 document)
**Scope:** **all seven** research-brief items — (1) browser live audio capture, (2) streaming STT with prices and
Vietnamese evidence, (3) translation architecture and latency budget, (4) the MoM pipeline, (5) bot vs in-browser
vs device capture plus the legal envelope, (6) what is achievable at ~zero cost, and (7) a ranked recommended
architecture with the risky unknowns that need a spike.

**Companion raw appendices (evidence dumps, not conclusions):**
- `R-002-appendix-C-mom-bots-legal-raw.md` — the full MoM/bots/legal survey (every fetch, quote, OSS repo row,
  arXiv bibliography, per-vendor diarization matrix, US state-by-state table, GDPR/works-council analysis).
- `R-002-appendix-D-meeting-audio-capture-raw.md` — the full per-platform audio-capture survey (Windows WASAPI
  loopback + process loopback, macOS Core Audio taps vs virtual drivers, ScreenCaptureKit, browser, iOS, Android).
- `R-002-appendix-E-browser-capture-spec-crosscheck.md` — an independent second pass over browser capture that
  re-checked every §1 claim against the **W3C Screen Capture and MediaStream Recording specifications**, and
  which is the source of §1's most restrictive findings (Firefox/Safari deliver **no** screen-capture audio;
  system audio is **Windows/ChromeOS only**; `preferCurrentTab` is **not in any spec**; `timeslice` fragments
  *"need not be playable"*).

**Conclusions in THIS document win over the raw appendices** wherever they disagree.

**Marker convention used here**
- `[VERIFIED <url> @20/09/2026]` — page fetched and read today.
- `[UNVERIFIED]` — could not reach the source from this environment, or claim comes from a third party; reason given inline.
- `[INFERRED]` — arithmetic or reasoning on top of verified numbers.
- `[NEEDS SPIKE]` — only answerable by running real audio with real keys.

> **Đính chính / corrections vs. the primary R-002 document**
> 1. R-002 states STT cost range "0,03–0,65 USD/giờ họp". That range is **confirmed and can be extended downward**:
>    Groq `whisper-large-v3-turbo` at **$0.0162/hr** is the cheapest verified option (rolling-chunk, file endpoint only).
> 2. R-002's "0,03 USD/giờ" bottom is Cloudflare Workers AI Whisper — **verified** at $0.0005/audio-min.
>    What R-002 does not say is that **Cloudflare's free allocation covers ≈214 audio-minutes/day**, which makes
>    a zero-cost pilot genuinely viable.
> 3. Two single-API options that collapse the whole pipeline did not exist in the R-002 draft and are now verified:
>    **Soniox real-time speech translation $0.18/hr** and **OpenAI GPT-Realtime-Translate $2.04/hr**.
>    Soniox is ~11× cheaper than OpenAI for the same job and is the strongest single-vendor option found.
> 4. R-002 implies Deepgram Nova-3 multilingual is the VN path. **It is not.** Nova-3's `language=multi`
>    covers only EN/ES/FR/DE/HI/RU/PT/JA/IT/NL. Vietnamese requires `language=vi` (monolingual mode),
>    which means **no automatic EN↔VI code-switching** on Deepgram Nova-3.

---

## 1. Live audio capture in a browser — what is actually possible

> **Provenance note.** This section rests on **primary sources fetched on 20/09/2026** — MDN
> (`getDisplayMedia`, `MediaRecorder.isTypeSupported`, `AudioWorkletProcessor.process`, `BaseAudioContext.state`,
> `MediaTrackConstraints.sampleRate`, `AudioEncoder`, `SpeechRecognition.lang`), the **W3C Screen Capture and
> MediaStream Recording specifications**, the **chromestatus JSON API**, caniuse/BCD, JavaScript-Foundation
> Tauri `@types/chrome`, Microsoft Learn (WASAPI loopback) and Apple Developer (Core Audio taps, CallKit,
> ReplayKit). It was then extended by a second independent pass (809 lines, preserved
> verbatim as **`R-002-appendix-E-browser-capture-spec-crosscheck.md`**) that cross-checked every claim against
> the specs, and which supplied §1's most restrictive findings (see §1.1).
>
> **Two evidence gaps remain, and they are flagged rather than papered over:** (a) **there is no Chromium bug
> audit** — `issues.chromium.org` returned 000, `bugs.chromium.org` is JS-rendered to empty, and
> `chromium.googlesource.com` was unreachable, so §1.5's bug claims rest on secondary symptom reports;
> (b) **Chrome's actual `sampleRate` behaviour is UNVERIFIED** — the spec only makes it a *system-default-backed*
> property the UA **SHOULD** prefer, and `developer.chrome.com` was unreachable. Both need a network that can
> reach Google's hosts.

### 1.1 The headline answer

| Question | Answer |
|---|---|
| Can a plain web page capture **tab audio** without the user picking a tab? | ❌ **No. Not possible.** MDN, verbatim: *"The go-ahead permission to use `getDisplayMedia()` **cannot be persisted for reuse. The user must be prompted for permission every time**."* and *"**Transient user activation is required.**"* Also: *"The specified options **can't be used to limit the choices** available to the user."* `[VERIFIED https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia @20/09/2026]` |
| Does `preferCurrentTab: true` auto-select the tab? | ❌ **No.** It only *"instructs the browser to offer the current tab as the most prominent capture source, that is, **as a separate 'This Tab' option in the 'Choose what to share' options presented to the user**."* The user still picks. `[same source]` |
| Does `getDisplayMedia({audio:true})` guarantee an audio track? | ❌ **No.** *"A value of `true` indicates that the returned MediaStream will contain an audio track, **if audio is supported and available for the display surface chosen by the user**."* And: *"the returned `MediaStream` **may still have only one video track, with no audio**."* `[same source]` |
| What does `systemAudio` actually control? | It is a hint for *"whether the browser should include system audio among the possible audio sources offered to the user **when a monitor is shared**"* — i.e. it applies to **screen** sharing, not tab sharing. Chrome-specific: *"`systemAudio: "include"` does not guarantee that system audio will be available, but `systemAudio: "exclude"` prevents system audio from being offered when sharing a screen (audio from a shared browser tab or window may still be available)."* `[same source]` |
| Can a web page capture a **native Zoom/Teams desktop app**? | ❌ **No.** `getDisplayMedia` sources are screens/windows/tabs **of the browser**. There is no web API that taps another process's audio. `[INFERRED from the source above + VERIFIED absence of such an API in MDN's MediaDevices surface]` |
| Can a web page do this on **mobile**? | ❌ **No.** `getDisplayMedia` is unsupported in Safari iOS, Chrome for Android and Firefox for Android; global `getDisplayMedia` support is reported at **35.85%** `[VERIFIED via https://caniuse.com/mdn-api_mediadevices_getdisplaymedia, per appendix, fetched 19/09/2026]` |
| **Do all desktop browsers deliver that tab audio?** | 🔴 **No.** `getDisplayMedia({audio:true})` **produces no audio at all in Firefox and no audio at all in Safari** (desktop *or* mobile). **Only Chromium (Chrome/Edge/Opera) implements screen-capture audio.** The browser route is therefore **Chrome/Edge only** — this is the single most restrictive fact in this section `[VERIFIED via MDN browser-compat-data, §12]` |
| **Can Chrome capture *system* audio on macOS?** | ❌ **No.** The *system-audio* capability is **Windows + Chrome OS only**. On **macOS and Linux, Chrome offers *tab* audio only**. So on a Mac, a "share the whole screen" flow gets you **no meeting audio** — the user must share the **tab**. `[VERIFIED (MDN BCD note), §12]` |
| Is there an escape hatch from a plain page? | ❌ Not from a page — but **yes from an extension**: `chrome.tabCapture` / `chrome.tabCapture.getMediaStreamId()` + `getUserMedia({mandatory:{chromeMediaSource:'tab', chromeMediaSourceId}})` **redeemed in an offscreen document** captures tab audio with **no picker**. `[VERIFIED via https://cdn.jsdelivr.net/npm/@types/chrome/index.d.ts — 776 KB typings file that embeds Chrome's own doc comments, a faithful mirror of the unreachable developer.chrome.com page; §12 §2.6]` |

**Practical product conclusion.** The browser gives you a **consented, user-driven, tab-scoped** capture. That is
enough for *"share this tab and get live translation"* with **zero install**. It is **not** enough for an
automatic *"record all my meetings"* product. To capture native meeting apps automatically you must ship a
**desktop app** — which is exactly what every real product in this space chose.

### 1.2 `getUserMedia` vs `getDisplayMedia`

| | `getUserMedia` | `getDisplayMedia` |
|---|---|---|
| Source | Microphone (and camera) | User-chosen screen / window / **tab** |
| Audio of *other* participants | ❌ never | ✅ only if the chosen surface carries it (usually a tab, or the system mix on Windows) |
| Permission | Persistable per-origin | **Cannot be persisted — prompt every call** |
| User gesture | Not strictly required | **Transient activation required** (`NotAllowedError` otherwise) |
| Can it exceed the page's own tab? | n/a | Yes for windows/screens; not for other processes' audio |
| Constraints | Full `MediaTrackConstraints` incl. `min`/`exact` | **`min` and `exact` are not permitted** in `getDisplayMedia` constraints |
| Support | Universal | Desktop-only in practice |

### 1.3 Constraints that are actually honoured

| Constraint | Status | Evidence |
|---|---|---|
| `sampleRate` | ⚠️ **`MediaTrackConstraints.sampleRate` is "Limited availability — not Baseline because it does not work in some of the most widely-used browsers."** Do **not** assume Chrome will deliver 16 kHz just because you asked | `[VERIFIED https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/sampleRate @20/09/2026]` |
| `echoCancellation`, `noiseSuppression`, `autoGainControl` | Requestable; MDN's own screen-capture example sets them on the *audio* track. ⚠️ **All three are designed for *microphone* use and can damage meeting audio**: Deepgram publishes a dedicated guide titled *"Audio Preprocessing & Barge-In — when noise suppression and echo cancellation help speech-to-text — and when they hurt"* | `[VERIFIED MDN + https://developers.deepgram.com/docs/audio-preprocessing-barge-in.md @20/09/2026]` |
| `channelCount` | Requestable; irrelevant for STT (mono is what you want) | — |

> **Design rule:** do **not** trust the browser's sample rate. Capture at whatever the device gives you and
> **resample to 16 kHz mono in your own code** before sending to any STT provider. Request
> `echoCancellation:false, noiseSuppression:false, autoGainControl:false` for *tab/system* audio (it is already
> a clean digital mix) and consider leaving them on only for a microphone path.

### 1.4 MediaRecorder vs WebCodecs + AudioWorklet — which chunking path is viable

| | `MediaRecorder` | **`AudioWorklet` + raw PCM** | WebCodecs `AudioEncoder` |
|---|---|---|---|
| Availability | **Baseline Widely available since April 2021** — `MediaRecorder.isTypeSupported()` is well established | Baseline (AudioWorklet is the standard replacement for the deprecated `ScriptProcessorNode`) | ⚠️ **"Limited availability — not Baseline because it does not work in some of the most widely-used browsers"**; **secure context only**; available in Dedicated Web Workers |
| Output | Compressed container chunks (webm/ogg opus) | **Raw Float32 PCM**, exactly what you control | Encoded `AudioData` |
| Suits real-time STT? | ❌ **No — and this is now settled by the spec, not by guesswork.** See the quotation below | ✅ **Yes — this is the correct path.** Providers want raw PCM or self-describing frames | Possible but unnecessary: STT vendors accept PCM directly, so encoding is wasted work and adds a compatibility risk |
| MimeType ceilings | Chromium: Opus in `audio/webm`/`ogg`. **Safari: `audio/mp4` + `video/mp4` only (`avc1`/`mp4a`) — no WebM and no Opus in MediaRecorder** ⚠️ | n/a | Flagship requirement |
| Verdict | ❌ **Not recommended** for streaming to STT | ✅ **Recommended** | ❌ Overkill / compat-limited |

Verified mechanics of the recommended path `[VERIFIED https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process @20/09/2026]`:
> *"The method is called synchronously from the audio rendering thread, once for each block of audio (also known
> as a rendering quantum)… **Currently, audio data blocks are always 128 frames long** — that is, they contain
> 128 32-bit floating-point samples for each of the input channels."*

**Why `MediaRecorder` is disqualified — the decisive spec text** `[VERIFIED via https://w3c.github.io/mediacapture-record/ (W3C MediaStream Recording spec), §"start()", per §12]`:

> *"When multiple Blobs are returned (because of timeslice or `requestData()`), **the individual Blobs need not be playable, but the combination of all the Blobs from a completed recording MUST be playable**."*

> *"If `timeslice` is not `undefined`, then once a **minimum** of `timeslice` milliseconds of data have been
> collected, **or some minimum time slice imposed by the UA, whichever is greater**, start gathering data into a
> new Blob…"*

Three independent disqualifiers, all now sourced:
1. **Fragments are not self-contained files.** Container headers live in the first blob; the spec guarantees only that the *concatenation* is playable. A provider receiving chunk *n* in isolation may be unable to decode it.
2. **`timeslice` is a lower bound, not a schedule.** *"or some minimum time slice imposed by the UA, whichever is greater"* — so a requested 250 ms cadence is **not** honoured.
3. MDN adds: *"timeslice is not exact and the real intervals may be slightly longer due to other pending tasks."*

**Design implication.** 128 frames is far too small to send (at 48 kHz that is 2.7 ms). The worklet must
**accumulate 128-frame quanta into a ~20–100 ms buffer** and post that. Deepgram's own guidance is explicit:
*"Streaming buffer sizes should be between 20 and 100 milliseconds of audio."* `[VERIFIED Deepgram latency doc]`
At 16 kHz that is **320–1600 samples = 640–3200 bytes (16-bit mono)** per message.

**Size math (for capacity planning):**

| Format | Bytes/sec | Per meeting-hour |
|---|---|---|
| 16 kHz, 16-bit mono PCM | **32,000 B/s** (32 KB/s) | **≈ 115 MB** |
| 48 kHz, 32-bit float mono PCM | **192,000 B/s** | **≈ 691 MB** |
| Opus @ 24 kbps | ~3,000 B/s | ≈ 10.8 MB |

So **request 16 kHz 16-bit mono** — it is the STT-native format, and it is ~6× smaller than raw 48 kHz float.
Bandwidth for one meeting is trivial (32 KB/s upstream) but the *daily* volume matters for storage: do not keep
raw audio unless the customer's consent explicitly covers it.

### 1.5 Background tabs, throttling and the hidden failure modes

| Risk | Why it matters | Mitigation |
|---|---|---|
| **`AudioContext` starts `suspended`** | Autoplay policy: an `AudioContext` created before a user gesture starts suspended and produces **silence**. This is the #1 "it works in the demo, silent in production" bug | Create/resume the context inside the click handler; check `ctx.state` and surface a UI warning |
| **Background-tab throttling** | Timers are throttled in hidden tabs. ✅ **The audio graph itself is immune**: `process()` runs *synchronously on the audio rendering thread* `[VERIFIED MDN]`, so it is **not subject to `setTimeout` clamping** — this is the architectural reason to choose AudioWorklet over `ScriptProcessorNode`/`setInterval`. ⚠️ **But the main-thread consumer is not immune**: if the tab is throttled, transferred buffers queue up behind it | Drive sends from the worklet's `postMessage` callback, never a timer — and **buffer generously inside the worklet**, treating main-thread delivery as best-effort. Moving the socket send into a **Web Worker** is the robust answer, but whether worklet→worker delivery is reliable in all target browsers is **unresolved** `[§12]`. Chrome's "Freezing on Energy Saver" hides+silences browsing-context groups after >5 min `[VERIFIED chromestatus]` — a tab actively rendering audio is not silent, so this is usually safe |
| 🔴 **iOS Safari: `AudioContext.state` can become `"interrupted"`** | MDN verbatim: *"In iOS Safari, when a user leaves the page (e.g., switches tabs, minimizes the browser, or turns off the screen) the audio context's state changes to `"interrupted"` and needs to be resumed."* Also triggered by *"a conferencing or phone app on the same system requiring exclusive access to the device's audio hardware."* Note this is a **fourth** state beyond `suspended`/`running`/`closed` | Listen for `statechange` and call `resume()` on `"interrupted"`. Relevant if the mic/dictation path is used on iOS `[VERIFIED https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state @20/09/2026, §12]` |
| **Tab audio drops after silence / when source tab is muted** | Reported field behaviour; a muted tab has no render stream | Detect via `track.onmute`/`onended` and stop cleanly rather than streaming silence |
| **Echo cancellation mangling remote audio** | `echoCancellation` on a *system/tab* capture can notch out the very speech you want | Disable AEC for tab/system capture |
| **`getDisplayMedia` incompatible with `MediaRecorder` audio** | MDN explicitly warns *"Browser support for audio tracks varies, both in terms of whether or not they're supported at all **by the media recorder** and in terms of the audio sources supported."* | Another reason to use AudioWorklet, not MediaRecorder |
| **HTTPS / secure context** | `getDisplayMedia`, `getUserMedia` and WebCodecs all require a secure context | fBuddy is already HTTPS |
| **Permissions-Policy** | An embedding iframe needs the `display-capture` policy; `NotAllowedError` is thrown if *"the current browsing instance is not permitted access to screen sharing (for example by a Permissions Policy)"* | Relevant if the mini-app is ever embedded |

> ⚠️ **Evidence gap — read before trusting the bug rows above.** There is **no Chromium bug audit behind this
> table.** `issues.chromium.org` returned HTTP 000, `bugs.chromium.org` issue bodies are JS-rendered to empty,
> and `chromium.googlesource.com` was unreachable from this environment. The rows about tab audio dropping after
> silence, muted-tab streams, and AEC mangling remote audio are therefore **symptom reports and vendor guidance,
> not tracked bug IDs**. They are directionally useful for defensive coding (wire up `track.onmute`/`onended`
> and fail loudly) but should not be quoted as "known Chromium bugs". Closing this needs a network that can reach
> Google's hosts.

### 1.6 Mobile — the honest answer

| Platform | Capture of *another* app's / a phone call's audio |
|---|---|
| **iOS** | ❌ **Impossible.** Audio is given only to the app that *owns* the call. **CallKit** integrates a VoIP app's **own** calls with the system call UI — it is not a tap on someone else's call `[VERIFIED https://developer.apple.com/documentation/callkit @20/09/2026]`. **ReplayKit**'s `RPBroadcastSampleHandler` processes *screen-recording* buffers and is **annotated as deprecated as of iOS 27** `[VERIFIED https://developer.apple.com/documentation/replaykit/rpbroadcastsamplehandler @20/09/2026]` |
| **Android** | ⚠️ Only via **MediaProjection + `AudioPlaybackCapture`**, and only for apps that did **not opt out** and only for `USAGE_MEDIA`/`GAME`/`UNKNOWN`. Requires a MediaProjection consent dialog; apps can opt out entirely. Root/accessibility approaches are unsanctioned and carry Play Store policy risk `[per appendix; developer.android.com unreachable]` |
| **Mobile web** | ❌ `getDisplayMedia` unsupported in all mobile browsers |

`[INFERRED — no single canonical page states the negative for iOS directly; this is nonetheless the settled industry reality, which is why Granola, Otter and Fireflies treat mobile as a companion app rather than a capture device.]`

**Recommendation: leave mobile capture off the roadmap.**

### 1.7 What the browser path is actually good for

The web route is not worthless — it is **narrow but genuinely useful**, and it is the only zero-install option:

✅ **"Share this tab → get live translated captions + a transcript."** The user is already in a Google Meet or
Zoom-web tab; they click one button, pick "This Tab", and it works. No install, no bot in the call, no
platform permission, and — critically — **it captures the remote participants' audio**, because tab audio
includes everything playing in that tab.

❌ But it cannot: run unattended; capture the Zoom/Teams **desktop app**; capture a meeting the user is attending
on their phone; or work on mobile. And the picker appears **every single meeting**, which is a real retention
cost.

---

## 2. Streaming STT options — price, Vietnamese, latency, diarization

### 2.1 Master comparison (all prices normalised to **USD per hour of audio**)

"Streaming" = incremental results over a persistent WebSocket/duplex session while audio is still being spoken.
"File-only" = you must upload a complete (or at least closed) audio file and get a full transcript back; a live
use-case must fake it with a **rolling chunk buffer** and accept the latency penalty.

| Provider / model | Streaming? | Vietnamese | Price / hr of audio | Free quota | Diarization | Notes |
|---|---|---|---|---|---|---|
| **Cloudflare Workers AI** `@cf/openai/whisper-large-v3-turbo` | **File-only** | Yes (Whisper multilingual) | **$0.03** ($0.0005/audio-min) | **10,000 neurons/day ≈ 214 audio-min/day ≈ 3.6 h/day** | ✗ | `[VERIFIED https://developers.cloudflare.com/workers-ai/platform/pricing/ + .../models/whisper/ @20/09/2026]` 46.63 neurons per audio-min |
| **Groq** `whisper-large-v3-turbo` | **File-only** (`/openai/v1/audio/transcriptions`) | Yes (Whisper multilingual) | **$0.0162** ($0.00027/min) | Free tier exists; **30 req/min** reported | ✗ | `[UNVERIFIED-canonical]` console.groq.com returns **HTTP 403** from this environment and groq.com/pricing no longer publishes an STT table. Number sourced from a third-party tutorial with a "verified April 2026" badge: https://theneuralbase.com/groq/learn/intermediate/streaming-audio-to-text/ |
| **Soniox** `stt-rt-v5` | **Streaming** | **Yes** (60+ langs, incl. VN) | **$0.12** ($2.00/1M input-audio tokens) | None published | **Yes, real-time** | `[VERIFIED https://soniox.com/pricing/ + https://soniox.com/speech-to-text/ @20/09/2026]` |
| **Soniox** real-time speech **translation** | **Streaming** | **Yes** (3,600+ pairs) | **$0.18** | None published | Yes | **Single API: STT + translation, streams translated text before the speaker finishes the sentence.** `[VERIFIED https://soniox.com/speech-translation/ @20/09/2026]` |
| **AssemblyAI** `Universal-Streaming` | Streaming | ✗ (EN/ES/DE/FR/PT/IT only) | $0.15 | Free tier (tier caps not read) | +$0.04–0.12/hr | `[VERIFIED https://www.assemblyai.com/pricing @20/09/2026]` — **no Vietnamese path at this price** |
| **AssemblyAI** `Universal-3.5 Pro Realtime` | Streaming | 18 languages; **VN not confirmed** | $0.45 | Free tier | +$0.12/hr | `[VERIFIED price @20/09/2026]`, VN coverage `[NEEDS SPIKE]` |
| **Speechmatics** Real-time **Standard** | Streaming | **Yes** (55+ langs, VN listed) | **$0.24** | **$100 credit**, 2 concurrent real-time sessions | **Included** | `[VERIFIED https://www.speechmatics.com/pricing + /languages @20/09/2026]` vendor-stated **real-time latency < 1 s** |
| **Speechmatics** Real-time **Enhanced** | Streaming | Yes | $0.43 | $100 credit, 50 concurrent (Pro) | Included | same sources |
| **ElevenLabs** `Scribe v2 Realtime` | Streaming (WebSocket) | **Yes** — listed in vendor's **"Excellent (≤5% WER)"** bucket | **$0.39** | Free plan 10,000 credits/month | **Yes, up to 32 speakers** | `[VERIFIED https://elevenlabs.io/pricing/api + https://elevenlabs.io/docs/capabilities/speech-to-text @20/09/2026]` Docs explicitly say Realtime has "Same features, languages, pricing, and API as Scribe v2" |
| **Deepgram** `nova-3` (**monolingual** `language=vi`) | Streaming WS | **Yes** (`vi`) | **$0.462** list / **$0.288** current promo ($0.0077 → $0.0048/min) | **$200 credit** (≈ 574 h streaming at promo rate `[INFERRED]`) | +$0.12/hr ($0.0020/min) | `[VERIFIED https://deepgram.com/pricing @20/09/2026]` |
| **Deepgram** `nova-3` (**`language=multi`**) | Streaming WS | **NO** | $0.552 / $0.348 promo | $200 | +$0.12/hr | `multi` = EN, ES, FR, DE, HI, RU, PT, JA, IT, NL only — **Vietnamese absent** `[VERIFIED https://developers.deepgram.com/docs/models-languages-overview.md @20/09/2026]` |
| **Gladia** real-time | Streaming | Yes (100+ languages) | $0.75 PAYG, **as low as $0.25** at volume | **€50 credit (~60+ h real-time)** | **Included** | `[VERIFIED https://gladia.io/pricing @20/09/2026]` vendor-stated **sub-300 ms latency** |
| **Azure** Speech `S1 Speech To Text` | Streaming | Yes | **$1.00** | **F0: 5 audio h/month** | Conversation Transcription mode $1.20/hr | `[VERIFIED https://prices.azure.com/api/retail/prices (US East list) + https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/ @20/09/2026]` |
| **OpenAI** `gpt-realtime-whisper` | **Streaming** | Not stated | **$1.02** ($0.017/min) | None | ✗ | `[UNVERIFIED-canonical]` platform.openai.com → **403** here. Number from https://apidog.com/blog/gpt-realtime-2-api/ + https://www.digit.in/... and **independently corroborated** by Soniox's competitor calculator (https://soniox.com/pricing/, "OpenAI gpt-realtime-whisper … $1.02/hr, Updated June 2026") |
| **OpenAI** `gpt-realtime-translate` | **Streaming, speech→speech** | **Yes — Vietnamese is 1 of the 13 target languages** | **$2.04** ($0.034/min) | None | ✗ | `[UNVERIFIED-canonical]`; target-language list from https://wiro.ai/models/openai/gpt-realtime-translate, price from apidog + digit.in. 70+ auto-detected input languages |
| **OpenAI** `gpt-realtime-2` | Streaming S2S | Not stated | **$32 /1M audio-in tokens + $64 /1M audio-out** (cached in $0.40/1M) | None | ✗ | `[UNVERIFIED-canonical]`, apidog + digit.in agree. ≈ **$2.9/hr** for a 1-h meeting `[INFERRED — assumes ≈30k audio tokens/h, same order as Soniox's published "1 h ≈ 30,000 input audio tokens"; treat as an estimate]` |
| **Azure** Speech Translation `S1` | Streaming | Yes | **$2.50** | F0: 1 h free | separate product | `[VERIFIED Azure Retail Prices API @20/09/2026]` |
| **Azure** `Live Interpreter` | Streaming | Yes | **$1.00/hr audio in + $1.50/hr audio out + $10 /1M chars text out** | — | — | `[VERIFIED Azure Retail Prices API @20/09/2026]` — this is Azure's dedicated live-interpretation SKU |
| **Mistral** Voxtral Small 24B | Not a streaming ASR (audio-understanding LLM) | Not stated | $0.10 /1M prompt tokens (via OpenRouter) | — | ✗ | `[PARTIAL]` docs.mistral.ai unreachable (**HTTP 000**) here; pricing read from https://openrouter.ai/api/v1/models @20/09/2026 |
| **Self-hosted** faster-whisper / whisper.cpp / NeMo Parakeet | Streaming only with extra work | Whisper yes; Parakeet **no VN** | GPU-hour cost only | — | via pyannote | `[VERIFIED https://api.github.com/repos/SYSTRAN/faster-whisper @20/09/2026]` faster-whisper ★25,470, MIT, last push 2025-11-19. Other repo metrics `[UNVERIFIED]` — GitHub API rate-limited mid-survey |

### 2.2 Vietnamese-quality evidence — what is actually documented vs. what is marketing

| Claim | Strength | Source |
|---|---|---|
| ElevenLabs Scribe v2 → Vietnamese in **"Excellent (≤ 5% WER)"** | **Vendor-published, per-language WER bucket** — strongest explicit VN statement found | `[VERIFIED https://elevenlabs.io/docs/capabilities/speech-to-text @20/09/2026]` |
| AssemblyAI Universal-2 → Vietnamese in **"Good accuracy (>10% to ≤25% WER)"** | **Vendor-published, per-language WER bucket.** Note this is the *file* model; the cheap streaming model (`Universal-Streaming`) **excludes** Vietnamese entirely | `[VERIFIED https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio/supported-languages @20/09/2026]` |
| Deepgram Nova-3 supports `vi` | Presence-of-language only, **no WER published** | `[VERIFIED https://developers.deepgram.com/docs/models-languages-overview.md @20/09/2026]` |
| Speechmatics lists Vietnamese among 55+ languages | Presence only | `[VERIFIED https://www.speechmatics.com/languages @20/09/2026]` |
| Soniox claims "native-speaker accuracy across languages, accents, mixed-language speech" incl. mid-sentence switching | Marketing claim, no WER table | `[VERIFIED https://soniox.com/speech-to-text/ @20/09/2026]` |
| Groq / Cloudflare Whisper VN quality | Inherits `openai/whisper` multilingual quality; **no provider-published VN WER** | — |
| Whisper on Vietnamese in general | Widely reported as the weakest of the major multilingual families for Vietnamese (heavy diacritic/tones sensitivity) | `[UNVERIFIED]` — no canonical source read today; see R-001-B for the Vietnamese model landscape |

> **Important negative finding.** No provider among those surveyed publishes a **Vietnamese-specific WER on
> conversational/accented/code-switched speech**. The two per-language WER tables that exist (ElevenLabs,
> AssemblyAI) are for their *batch* models and their buckets are wide (≤5% vs 10–25%). Vendor WER is normally
> measured on read/clean speech. **Real Vietnamese meeting audio with EN↔VI code-switching is the single
> biggest unquantified risk in this entire feature** `[NEEDS SPIKE]`.

> **Code-switching is where the cheap options break.** Deepgram Nova-3's `language=multi` (the code-switching
> mode) does **not** include Vietnamese; you must pick `language=vi` and lose automatic English. Soniox is the
> only streaming vendor surveyed that explicitly claims mid-sentence language switching **and** covers Vietnamese.
> For a Vietnamese office meeting — where "deadline", "budget", "OK", "confirm" and product names are routinely
> spoken in English inside Vietnamese sentences — this is a product-defining difference, not a detail.

### 2.3 Latency numbers that are actually published

| Component | Published figure | Source |
|---|---|---|
| Deepgram transcription latency | **150–300 ms** ("optimized to deliver 300 ms or less") | `[VERIFIED https://developers.deepgram.com/docs/measuring-streaming-latency.md @20/09/2026]` |
| Deepgram total client-side transcript latency | **200–500 ms** | same |
| Deepgram network transit | 20–200 ms | same |
| Deepgram recommended audio buffer | **20–100 ms** per chunk (larger buffers *add* latency) | same |
| Deepgram Flux end-of-turn detection | 100–500 ms; reduces agent latency by 200–600 ms vs STT+VAD | same |
| Deepgram diarization on streaming | only the **v1** diarizer; `diarize_model=v2` is batch-only and errors on streaming | `[VERIFIED https://developers.deepgram.com/docs/diarization.md @20/09/2026]` |
| Speechmatics real-time | **< 1 s** | `[VERIFIED https://www.speechmatics.com/pricing @20/09/2026]` |
| Gladia real-time | **sub-300 ms** | `[VERIFIED https://gladia.io/pricing @20/09/2026]` |
| Soniox | "ultra-low latency", **no number published** | `[VERIFIED https://soniox.com/speech-to-text/ @20/09/2026]` |

**Practical consequence for the audio front-end:** Deepgram's own guidance ("streaming buffer sizes should be
between 20 and 100 milliseconds of audio") means the browser must emit **20–100 ms frames**, i.e. a ~100 ms
`AudioWorklet` chunking interval — not the 1–5 s chunks a `MediaRecorder` `timeslice` would give you. See §1.

### 2.4 "Free" quota reality check

| Source | What you actually get free | How far it goes |
|---|---|---|
| Deepgram | **$200 one-off credit** | ≈ **574 h** of Nova-3 `vi` streaming at the current promo rate, or ≈ 434 h at list `[INFERRED: 200 / (0.0048/60)]` — **by far the largest free runway found** |
| Speechmatics | **$100 credit**, 2 concurrent real-time sessions | ≈ 416 h at Real-time Standard `[INFERRED]` |
| Gladia | **€50 credit**, one-time, no monthly reset ("~60+ hours real-time") | ≈ 60 h real-time (vendor's own figure) |
| Azure | F0: **5 audio h/month** real-time STT (+1 h speech translation) | 5 h/month recurring, forever |
| Cloudflare Workers AI | **10,000 neurons/day** | **≈ 214 audio-min/day ≈ 3.6 h/day**, resets 00:00 UTC — the best *recurring* free tier `[INFERRED: 10000 ÷ 46.63]` |
| ElevenLabs | Free plan **10,000 credits/month** | small; credits are shared across all ElevenLabs products |
| Soniox | none published | — |
| OpenAI | none published | — |
| AssemblyAI | free tier exists; caps not read today | `[NEEDS SPIKE]` |

### 2.5 Self-hosted comparison

| Stack | Streaming | Vietnamese | Notes |
|---|---|---|---|
| `faster-whisper` (CTranslate2) | Batch per chunk; needs a wrapper for true streaming | Whisper multilingual | `[VERIFIED @20/09/2026]` ★25,470, **MIT**, Python, last push 2025-11-19 — https://github.com/SYSTRAN/faster-whisper |
| `whisper.cpp` | Has its own streaming example; VAD-based | Whisper multilingual | https://github.com/ggml-org/whisper.cpp — metrics `[UNVERIFIED]` |
| WhisperX | Batch (VAD + wav2vec2 forced alignment + diarization) | Whisper multilingual | https://github.com/m-bain/whisperX — metrics `[UNVERIFIED]` |
| NVIDIA NeMo (Parakeet / Canary) | Yes (`Parakeet` is a streaming-capable RNNT/TDT family) | **Parakeet is English-focused; VN not supported** `[UNVERIFIED]` | https://github.com/NVIDIA/NeMo — metrics `[UNVERIFIED]` |
| `sherpa-onnx` | Yes, real streaming, runs on CPU/edge | Depends on the chosen model | https://github.com/k2-fsa/sherpa-onnx — metrics `[UNVERIFIED]` |

**Verdict on self-hosting:** the only case for it is *privacy* (no meeting audio leaves the VPS) or *high volume*
(>~2,000 h/month, where a rented GPU beats $0.12/hr). At hobby scale it is strictly worse than Soniox/Cloudflare
once you price engineering time. Note the fBuddy VPS is a shared box that also serves the web app — adding a
Whisper GPU workload to it is an architectural change, not a config flag.


---

## 3. Translation architecture for live meetings

### 3.1 The three architectures

| | (a) **Cascade**: STT → text LLM translation → TTS | (b) **Native speech-to-speech** | (c) **Dedicated MT** |
|---|---|---|---|
| Examples | Soniox STT → Gemini/DeepSeek → Azure/ElevenLabs TTS | OpenAI `gpt-realtime-translate`, `gpt-realtime-2`; Gemini Live; Seamless (research) | Azure Translator, DeepL, Google Cloud Translation |
| Verified cost per meeting-hour | **$0.13–$0.90** `[INFERRED from verified component prices]` | **$2.04** (OpenAI Translate, $0.034/min) — or **$0.18** if you use *Soniox's* real-time speech translation, which is really a vendor-side cascade `[VERIFIED https://soniox.com/speech-translation/ @20/09/2026]` | **$0.50–$1.25** of text MT `[INFERRED: ~50k chars/h × verified per-1M prices]` |
| Transcript for free? | **Yes — it is the by-product.** MoM needs this anyway | Partly: OpenAI Translate "streams text transcripts so you can show live captions" `[VERIFIED https://wiro.ai/models/openai/gpt-realtime-translate @20/09/2026]`, but no timestamps/speaker labels guaranteed | Yes (you had STT anyway) |
| Speaker diarization | **Yes** (from STT layer) | **No** — S2S models do not diarize | N/A |
| Glossary / domain terms | **Best control** — `keyterm` on STT *and* free-form system prompt on the LLM | Weak/limited — you cannot inject a termbase into a speech-to-speech model with the same precision | Good: Azure Custom Translator ($40/1M «custom» chars), DeepL glossaries |
| Segment-boundary control | Fully yours (endpointing, punctuation, caps) | None — model-internal | Yours |
| Latency (first useful output) | **~0.6–1.2 s** captions-only; **+0.3–0.8 s** if TTS `[INFERRED from verified stage latencies]` | Designed for a single pass; **no vendor latency number published** `[NEEDS SPIKE]` | Fastest text path (dedicated MT inference is ~100–200 ms) `[UNVERIFIED]` |
| Failure blast radius | One stage at a time; easy to A/B | Whole vendor | Lowest |
| Lock-in | Low (already adapter-based in fBuddy) | High | Low |
| Voice output quality | Your choice of TTS, incl. **free browser SpeechSynthesis** | Native, may preserve source prosody `[UNVERIFIED]` | None (text only) |

**Verdict.** For **fBuddy specifically the cascade wins**, for three reasons that are specific to this product:
1. fBuddy already has a **provider-adapter layer, a knowledge-block system prompt, and server-side STT/TTS settings** — the cascade is an extension of what exists, not a new subsystem.
2. The product must also produce **MoM**, which is fundamentally a *text* artefact. Paying a speech-to-speech model and then re-transcribing is strictly wasteful.
3. Diarization — mandatory for usable minutes — **only exists on the STT layer**.

### 3.2 Latency budget, stage by stage

Numbers below are the **verified** ones from §2.3 plus arithmetic.

| Stage | Best case | Realistic | Worst / notes |
|---|---|---|---|
| AudioWorklet frame → WebSocket send | 20 ms | 40–100 ms | Deepgram docs explicitly recommend **20–100 ms buffers**; larger buffers *add* delay. `[VERIFIED https://developers.deepgram.com/docs/measuring-streaming-latency.md @20/09/2026]` |
| Network to STT edge | 20 ms | 50–120 ms | 20–200 ms range published; Vietnam↔US adds RTT. This is a real argument for a **Singapore/Asia region endpoint** |
| STT partial hypothesis | 150 ms | 250–300 ms | Deepgram: 150–300 ms; Speechmatics claims **<1 s**; Gladia **sub-300 ms** |
| **Utterance-final decision (endpointing)** | 10 ms (Deepgram default) | **100–500 ms** | This is the hidden latency. Deepgram defaults `endpointing=10 ms` but recommends **`endpointing=100`** for code-switching. Tuning this is the single biggest perceived-latency dial |
| MT first token (text LLM, short segment) | 200 ms | 300–700 ms | unchanged from measured LLM TTFT behaviour `[NEEDS SPIKE with real provider]` |
| MT full segment (~15–25 words) | 400 ms | 600 ms–1.2 s | — |
| TTS first audio chunk | 150 ms | 250–500 ms | Only needed if you play audio back |
| Client render / playback buffer | 50 ms | 100–300 ms | Avoid rebuffering stutter |
| **Total, captions only** | **~0.5 s** | **1.0–1.8 s** | |
| **Total, with translated TTS** | **~1.2 s** | **2.0–3.5 s** | |

**Calibration point:** professional human simultaneous interpreters operate with an ear–voice span of roughly
**2–4 seconds** `[UNVERIFIED — widely cited figure, no canonical page fetched today]`. So a cascade with TTS
landing at 2–3.5 s is *within human-interpreter range*, and captions-only at 1–1.8 s is **better than a human
interpreter**. This is the most important framing for the product: **do not chase sub-second audio; ship fast
captions first.**

### 3.3 Keeping context across turns

| Need | Mechanism | Verified availability |
|---|---|---|
| Domain terms / product names / acronyms | **STT-side keyterm biasing** — fix the transcript before translation | Deepgram Keyterm Prompting **+$0.0013/min** `[VERIFIED deepgram.com/pricing @20/09/2026]`; Deepgram's Nova-3 is documented as "the first voice AI model to offer self-serve customization, enabling instant vocabulary adaptation without model retraining" `[VERIFIED developers.deepgram.com/docs/models-languages-overview.md]`; ElevenLabs keyterm prompting on Realtime: **up to 50 keyterms × 20 chars** `[VERIFIED elevenlabs.io/docs/capabilities/speech-to-text @20/09/2026]`; Azure Custom Translator $40/1M chars |
| Names, roles, org-specific jargon | Maintain a **meeting entity block** in the LLM system prompt — this maps 1:1 onto fBuddy's existing *knowledge block* injection | fBuddy already does this (stated context) |
| Cross-sentence reference resolution ("anh ấy", "cái đó", "the second option") | Keep the **last K finalized source+translation pairs** as few-shot context in the MT prompt, plus a rolling 1-paragraph summary | `[INFERRED design]` — no vendor feature does this for you |
| Consistent terminology across the meeting | Glossary pinned in the system prompt + a post-translation consistency pass at MoM time | `[INFERRED design]` |

> ### ⚠️ The Vietnamese-specific translation trap
> English→Vietnamese translation is **not** a symmetric MT problem. Vietnamese requires choosing a
> **kinship/status pronoun** — *anh / chị / em / ông / bà / cô / chú / tôi / tớ / mình* — that encodes the
> relative age and social rank of speaker and addressee. A **sentence-by-sentence** translator (which is what
> dedicated MT APIs are) has no idea who is speaking to whom, so it defaults to a flat, often wrong register.
> Two consequences for fBuddy:
> 1. **Cascade + LLM beats dedicated MT here**, because you can pass "speaker A is the 45-year-old director,
>    speaker B is a 24-year-old intern" in the prompt, and because diarization tells you who is talking.
> 2. This is a **quality differentiator you can actually demo in Vietnamese** — and it is invisible to a
>    generic English-first competitor. It is also a reason to invest in speaker naming (§MoM appendix).
>
> `[INFERRED — domain/linguistic reasoning; no vendor page read today quantifies VI pronoun handling]`
> `[NEEDS SPIKE: build a 20-sentence VI↔EN meeting test set and score LLM vs Azure vs DeepL by hand]`

### 3.4 Sentence segmentation & stabilisation

STT emits two kinds of output and they must be treated completely differently:

| Signal | Deepgram field | Handling |
|---|---|---|
| **Interim / unstable** | `is_final: false` (Nova-3), `type: "Update"` (Flux) | **Never send to MT.** Render only as greyed-out "…" text. Translating interim hypotheses causes visible flicker and re-billing. |
| **Final / stable** | `is_final: true`, and `speech_final: true` at an endpoint | This is the only thing you translate. `[VERIFIED https://developers.deepgram.com/docs/endpointing.md + /interim-results.md @20/09/2026]` |
| End of an utterance | `UtteranceEnd` event (word-timing gap based, works when `speech_final` misses) | Use as a secondary boundary trigger `[VERIFIED via Deepgram llms.txt link list @20/09/2026]` |
| Pause-based endpoint | `endpointing=<ms>` | Tunable; default 10 ms, **use ~100 ms for code-switching** per Deepgram's own recommendation |
| Speech onset | `SpeechStarted` event | Use to show "listening" state in the UI |

**Segment boundary policy (recommended):** close a segment on the *first* of
(i) `speech_final` / `UtteranceEnd`, (ii) a terminal punctuation mark from Smart Formatting,
(iii) a hard cap (≈ 25 words / ≈ 12 s). Cap (iii) is what keeps a monologuing speaker from producing a
90-second segment that translates badly and displays worse.

### 3.5 "Translate only what is new" — the delta protocol

This is the single most important implementation detail for both **cost** and **UI stability**.

1. Maintain a monotonically growing array of **committed** segments: `{seq, t_start, t_end, speaker, src_text}`.
2. On each `is_final` result, Deepgram gives you **only the newly finalized words** (the `is_final` chunk is a
   delta against the previous final — not the whole transcript). Append it. `[VERIFIED: this is how interim/final
   streaming results are documented — the "interim results" doc describes each response as containing the
   transcript for the audio processed since the last finalization]`
3. Translate **only the newly appended segment(s)**. Never re-translate a committed segment.
4. Cache by `sha256(src_text + target_lang + glossary_version)`. Retranslation only happens when the user
   changes the target language or the glossary — and then it is a deliberate, batched re-run.
5. For the live UI: show `committed_translation` (solid) + `interim_translation` of the current unstable tail
   (greyed, replaced on next tick, and **produced locally/cheaply or skipped entirely** — a common trick is to
   show the *untranslated* interim tail and only translate on commit).
6. **Concurrency guard:** if the MT call for segment *n* is still in flight when *n+1* commits, **batch them**
   in order. Never let out-of-order completions reorder the transcript — this is the #1 bug in live-translation UIs.

### 3.6 What this costs, and what the market pays for it

| Line item (1 meeting-hour) | Cost |
|---|---|
| STT — Soniox real-time | $0.12 |
| MT — cheap text LLM (~15k output tokens/h at Gemini-2.5-Flash-Lite $0.40/1M out) | **~$0.006** `[INFERRED from verified OpenRouter pricing @20/09/2026]` |
| MT — dedicated Azure Translator S1 ($10/1M chars, ~50k chars/h) | ~$0.50 `[VERIFIED Azure Retail Prices API @20/09/2026]` |
| TTS — Azure Neural ($15/1M chars, ~50k chars/h) | ~$0.75 |
| TTS — Deepgram streaming (billed by **WebSocket connection time**, not characters) | **$0.050–$0.163/min → $3.00–$9.78/hr** — i.e. you pay for idle time. Avoid for a whole meeting `[VERIFIED deepgram.com/pricing @20/09/2026]` |
| TTS — browser `SpeechSynthesis` | **$0** |
| **Bundle A: Soniox + LLM MT + browser TTS** | **≈ $0.13/hr** |
| **Bundle B: Soniox + LLM MT + Azure neural TTS** | **≈ $0.88/hr** |
| **Bundle C: single API, Soniox real-time speech translation** | **$0.18/hr** (text out) |
| **Bundle D: single API, OpenAI gpt-realtime-translate** | **$2.04/hr** (translated speech + captions) |
| **Commercial reference price: Wordly.ai** | **≈ $150/hr** — "$1,500 for a 10-hour package", unlimited languages, incl. translation + captions + transcripts + summaries `[VERIFIED https://www.wordly.ai/pricing @20/09/2026]` |

> **The business case in one line.** The fully-loaded API cost of live VI↔EN meeting translation with captions
> and a transcript is **$0.13–$0.88 per meeting-hour**. The nearest commercial AI-interpretation product sells
> the same category of outcome for **~$150 per hour**. Even after STT is bundled into a subscription, there is
> two orders of magnitude of headroom — the constraint is *quality on Vietnamese meeting audio*, not cost.

### 3.7 Academic / product benchmarks worth reading before you design the policy

| Work | Why it matters here | Link |
|---|---|---|
| **Seamless / SeamlessStreaming** (Meta, 2023) | The reference architecture for simultaneous speech-to-speech. Uses **Efficient Monotonic Multihead Attention (EMMA)** to emit target tokens *without waiting for the source utterance to finish*. Defines the latency metrics you should adopt: **Ending Offset** (delay between the speaker finishing and the last translated audio) and **Length-Adaptive Average Lagging (LAAL)**. | `[VERIFIED arXiv:2312.05187 — https://arxiv.org/abs/2312.05187 @20/09/2026]` |
| **StreamSpeech** (ACL 2024) | Direct Simul-S2ST; jointly learns translation + a simultaneous *policy*, and — importantly — emits **high-quality intermediate ASR/translation results during** the simultaneous process (exactly the "captions while speaking" UX). SOTA on CVSS. | `[VERIFIED arXiv:2406.03049 — https://arxiv.org/abs/2406.03049 @20/09/2026]` |
| **SimulStreaming / AlignAtt** and IWSLT simultaneous tracks | LocalAgreement-2 style commit policies for streaming MT | `[UNVERIFIED — arXiv search endpoint unreachable from this environment (HTTP 000); only individual /abs/ pages work]` |

**Metric recommendation for fBuddy's own evals:** adopt **LAAL** (not just BLEU) for the translation layer and
track **Ending Offset** for the audio layer. A system can look great on BLEU while being unusable because it
waits for full sentences. Recording *your own* p50/p95 LAAL by target language is what will tell you whether the
architecture is actually good — BLEU on a 100-sentence held-out set will not.


---

## 4. Meeting Minutes (MoM) pipeline

> The full raw survey behind this section — every fetch, every quote, the OSS repo table, the arXiv
> bibliography, the per-vendor diarization matrix — is preserved verbatim as
> **`R-002-appendix-C-mom-bots-legal-raw.md`**. This section is the condensed, decision-oriented digest.
> Where this section and the appendix disagree, **this section wins**.

### 4.1 The decisive architectural question: where does diarization happen?

There are two fundamentally different kinds of speaker label, and conflating them is the most common design error.

| Label kind | How you get it | Example | Requires |
|---|---|---|---|
| **Participant labels** | Per-participant separate audio streams, and/or active-speaker events from the meeting platform | `"Nguyễn Văn A"` — a **real name** | A platform-integrated **bot** or RTMS |
| **Generic labels** | Acoustic diarization on one mixed stream | `SPEAKER_00`, `1`, `2` | Any STT API with diarization |

`[VERIFIED https://docs.recall.ai/docs/diarization.md (via appendix, fetched 19/09/2026)]`

Recall.ai publishes the clearest public statement of the design space — four methods, and the accuracy/cost
trade-off between them:

| Method | Label type | Best when | Caveat |
|---|---|---|---|
| **Perfect diarization** (separate streams) | **Participant** | Everyone joins from their own device | Cannot split multiple people on one stream |
| **Hybrid** (separate streams + machine diarization within each) | **Participant** | Some streams are a conference room with several people | Most accurate overall |
| **Speaker-timeline** (platform active-speaker events) | **Participant** | Platform reliably reports active speaker | Depends on an unreliable UI signal |
| **Machine diarization** (one mixed stream) | **Generic** | Nobody has separate streams | *"Can be less accurate when different speakers have similar-sounding voices"* |

**Cost of the good option:** perfect diarization at **real-time** pricing is *"around 1.8× the transcription credit
usage"*; async is 0.6×–1.2×. `[VERIFIED https://docs.recall.ai/docs/diarization.md + /docs/bot-real-time-transcription.md]`

> **The consequence that shapes everything else.** If capture is a **single mixed stream** (desktop overlay,
> browser tab capture, or a bot given a mix), you are locked into **machine diarization with `SPEAKER_00`
> labels and an error rate** — and then you must *build a speaker-identification layer yourself* to turn
> `SPEAKER_00` into a name (§4.4). If capture is a **bot with per-participant streams**, names are nearly free.
> **The capture choice determines the MoM quality ceiling.** This is the single most important coupling in
> the whole feature.

### 4.2 Diarization tooling: what is native, what you must build

**Native streaming diarization — verified coverage:**

| Provider | Native diarization | Streaming diarization | Speaker **names** | Notes |
|---|---|---|---|---|
| **Deepgram** | ✅ | ✅ (`latest` or `v1`) | ❌ | **`diarize_model=v2` returns a validation error on streaming** — batch only `[VERIFIED /docs/diarization.md @20/09/2026]` |
| **Soniox** | ✅ | ✅ realtime **and** async | ❌ | Generic `Speaker 1`, `Speaker 2` `[VERIFIED soniox.com @20/09/2026]` |
| **Speechmatics** | ✅ | ✅ Realtime | ❌ | Three modes (speaker / channel / channel+speaker); **channel+speaker is Realtime-only** |
| **ElevenLabs Scribe v2** | ✅ | ✅ Realtime | ❌ | **Up to 32 speakers** `[VERIFIED elevenlabs.io/docs/capabilities/speech-to-text @20/09/2026]` |
| **Gladia** | ✅ | ✅ live API | ❌ | Speakers indexed by order of appearance; speaker-count params are *hints, not constraints* |
| **AssemblyAI** | ✅ | ✅ (separate config) | ✅ **Speaker Identification** can substitute real names/roles | *"each speaker should have at least 30 seconds of continuous speech"*; an incorrect exact speaker count **hurts** accuracy — use min/max ranges |
| **Azure Speech** | referenced obliquely | — | separate **Speaker Recognition** product | Full speaker-recognition page is auth-gated `[UNVERIFIED]` |
| **Recall.ai** (bot layer) | ✅ + **better** | ✅ realtime | ✅ **participant names** | Pass-through to Deepgram/AssemblyAI/Speechmatics/ElevenLabs/Rev/AWS |

**Bottom line:** *"can I get speaker labels?"* is **not** a differentiator — every serious STT API has it.
**Real names are the differentiator**, and they come from either (a) a platform bot, (b) your own
speaker-identification layer, or (c) AssemblyAI/Speechmatics speaker-identification products.

**Self-hosted diarization:**

| Tool | Status | Key facts |
|---|---|---|
| **pyannote.audio** | Current | **4.0.7** (released 30/06/2026, Python ≥3.10). Repo ★10,572, **MIT** repo licence, last push 18/09/2026. **Current OSS model is `speaker-diarization-community-1`**, not `-3.1`. **community-1 is CC-BY-4.0 and still requires accepting user conditions on Hugging Face** — read the terms before commercial use; and note `huggingface.co` is network-blocked from this environment, so you cannot pull it here `[VERIFIED via pypi + GitHub API, per appendix]` |
| **WhisperX** | Current | **3.8.6** (25/05/2026), ★24,128, **BSD-2-Clause**, last push 30/08/2026, INTERSPEECH 2023 paper. Adds VAD, **wav2vec2 word-level forced alignment**, diarization, batched inference |
| **WhisperX's known pain** | ⚠️ | whisperx 3.8.6 pins `pyannote-audio>=4.0.0`, `torch~=2.8.0`, `torchaudio~=2.8.0`, `torchcodec>=0.6.0,<0.8.0`. Users on torch 2.9.0/CUDA 13 hit `AttributeError: module 'torchaudio' has no attribute 'AudioMetaData'`. **The dependency-pinning pain is real and documented in open issues #1398, #1295** |
| **NeMo diarization** | Two families | **End-to-end Sortformer** (incl. **Streaming Sortformer**, raw audio → per-frame speaker activity in arrival-time order, with an **Arrival-Order Speaker Cache** keeping labels stable across a stream) vs **cascaded** (MarbleNet VAD → TitaNet embeddings → clustering → MSDD). **Sortformer caps at 4 speakers.** It is **NOT integrated into WhisperX** — open issue #1467 (25/08/2026) requests it. NeMo DER numbers `[UNVERIFIED — the models/Sortformer doc page 404'd]` |

> **How good is open acoustic diarization, numerically?** pyannote publishes its own DER benchmark (lower is better)
> `[VERIFIED per appendix, github.com/pyannote/pyannote-audio]`:
>
> | Dataset | legacy 3.1 | **community-1 (current)** | precision-2 (commercial) |
> |---|---|---|---|
> | **AMI (headset)** | 18.8% | **17.0%** | 12.9% |
> | **AMI (single distant mic — the realistic meeting case)** | 22.7% | **19.9%** | 15.6% |
> | AliMeeting (ch.1) | 24.5% | 20.3% | 15.2% |
> | DIHARD 3 (full) | 21.4% | 20.2% | 14.7% |
> | CALLHOME (pt.2) | 28.5% | 26.7% | 16.6% |
> | REPERE (ph.2) | 7.9% | **8.9%** ⚠️ *worse* | 7.4% |
>
> **≈20% DER on AMI single-distant-mic is the honest ceiling for free, self-hosted meeting diarization** — i.e.
> roughly one in five speaker attributions is wrong. Do not promise accurate attribution from acoustic
> diarization alone. Note REPERE got *worse* in community-1 — improvement is not uniform.
>
> **pyannote also sells the streaming option you would actually need** `[VERIFIED per appendix, docs.pyannote.ai/models.md]`:
> **Live-1** = streaming diarization over WebSocket, **sub-300 ms latency**, ≤8 speakers, ≤5 h/stream, 16 kHz mono,
> 100 ms chunks. **This is the only pyannote tier that fits live translation** — Community-1 and Precision-3 are
> batch-only. ⚠️ **Hard deadline: Precision-3 becomes the default on 2026-10-03 and Precision-2 is deprecated
> 2026-10-17**, with `confidence` replaced by `speakerProbability`/`speechProbability`/`crosstalkProbability`.
> **Speaker identification / voiceprints are Precision-2/3 only — not Community-1.**
>
> ⚠️ **Unresolved licence dependency:** the report of CC-BY-4.0 comes from WhisperX's README, **not the model card**.
> The **HF gate terms could not be read** (`huggingface.co` blocked from this environment). **A human with an HF
> account must open `pyannote/speaker-diarization-community-1` and archive the gate text before shipping.** Also
> note pyannote.audio ships an *optional telemetry* feature — check whether it is on by default and disclose it.

> **Streaming Sortformer is the most promising self-hosted path for *live* diarization** (4-speaker cap is
> acceptable for a typical business meeting) but as of the survey date it is **a do-it-yourself integration,
> not a drop-in**. Budget engineering time accordingly.

### 4.3 Transcript → MoM: the literature, and the architecture it implies

| Paper | arXiv | Venue | Why it matters |
|---|---|---|---|
| **QMSum** | [2104.05938](https://arxiv.org/abs/2104.05938) | NAACL 2021 | Canonical benchmark (1,808 query-summary pairs / 232 meetings). Establishes **query-based** summarisation and states plainly that *"it is hard to create a single short summary that covers all the content of a long meeting."* **Locate-then-summarize.** |
| **MeetingBank** | [2305.17529](https://arxiv.org/abs/2305.17529) | ACL 2023 | Proposes **divide-and-conquer**: split minutes into passages and **align them to specific meeting segments**. Also notes corpora are scarce because *"topics discussed are confidential"* — your enterprise data will look like this. |
| **MUG** | [2303.13939](https://arxiv.org/abs/2303.13939) | ICASSP 2023 | **654 recorded Mandarin meetings** annotated for topic segmentation, extractive summarisation, keyphrase extraction **and action item detection**. Proof the task should be **decomposed**, and that a non-English corpus is first-class. |
| **Meeting Action Item Detection with Regularized Context Modeling** | [2303.16763](https://arxiv.org/abs/2303.16763) | ICASSP 2023 | The dedicated action-item paper. **Context-Drop** using local + global context; Chinese corpus + AMI. Confirms action-item-labelled data is *"scarce and in small scale."* |
| **Action-Item-Driven Summarization of Long Meeting Transcripts** | [2312.17581](https://arxiv.org/abs/2312.17581) | NLPIR 2024 | **The most directly copyable architecture.** Recursively summarise + extract action items **per section, in parallel**, then combine. Three methods for **topic-based** sectioning, explicitly to fix LLMs *"forgetting long-term dependencies."* **BERTScore 64.98 on AMI, ~+4.98% over fine-tuned BART.** |
| **Summarizing Speech: A Comprehensive Survey** | [2504.08024](https://arxiv.org/abs/2504.08024) | EMNLP 2025 | Names the open problems: *"realistic evaluation benchmarks, **multilingual datasets**, and long-context handling."* Your three hardest problems are the field's three hardest problems. |
| **SCM (Self-Controlled Memory)** | [2304.13343](https://arxiv.org/abs/2304.13343) | DASFAA 2025 | **The rolling-memory blueprint**: an LLM agent + a **memory stream** + a **memory controller** that decides when/how to use memories. Plug-and-play, no fine-tuning; evaluated on meeting summarisation. |
| **LLM-based Two-stage Summarization for Long Dialogues** | [2410.06520](https://arxiv.org/abs/2410.06520) | 2024 | **Map-reduce with unsupervised topic segmentation** — finds semantically appropriate breakpoints, condenses, then summarises. Enables documents longer than the model's input limit. |
| **CREAM** | [2409.10883](https://arxiv.org/abs/2409.10883) | 2024 | **How to evaluate MoM without reference summaries** — chain-of-thought + key-facts alignment scoring conciseness/completeness, **ELO ranking** to compare prompt configurations. Use this instead of vibes. |
| **GADR (Architecture Decision Records from transcripts)** | [2608.17694](https://arxiv.org/abs/2608.17694) | 2026 | ⚠️ **Decision detection, and the cautionary one.** Premise: prior LLM work wrongly assumed input is *"already reasonably structured"*, whereas reality is *"informal, noisy meetings where choices are implicit, fragmented, and entangled with off-topic dialogue, precisely the conditions under which **single-pass prompting degrades**."* And: *"RAG-based enrichment improving ADR depth while simultaneously **risking transcript-unfaithful content**, raising open questions about **traceability**."* |

`All rows [VERIFIED via arxiv.org/abs/<id> or export.arxiv.org API, per the raw appendix, fetched 19/09/2026]`

**Strategy comparison:**

| Strategy | Latency to first output | Long-meeting quality | Failure mode | Fit |
|---|---|---|---|---|
| **Single-pass full-context** | 0 (after the meeting) | Good if it fits | Silent truncation; lost middle | ✅ **Post-meeting final MoM** if it fits |
| **Map-reduce** | After a barrier | Good coverage | Cross-references between distant chunks vanish (decision at min 5, rationale at min 55) | ✅ Post-meeting, with **topic-based** chunks |
| **Refine / rolling** | **Incremental — available throughout** | Best narrative continuity | **Drift/error accumulation**; early summary biases later | ✅ **Live rolling MoM** |
| **Hierarchical / topic-segmented two-stage** | After segmentation | **Best structure** (agenda-shaped) | Segmentation errors propagate | ✅ **Final MoM document** |
| **Query-focused (QMSum)** | On demand | Excellent relevance per question | Not a document | ✅ For "what did we decide about X?" |

**Recommended — hybrid, and this is what the literature supports:**
1. **Live, every N minutes:** rolling/refine summarisation carrying a compact running state (decisions, open
   questions, action items so far) — the **SCM memory-stream + memory-controller** pattern (arXiv:2304.13343).
2. **Post-meeting:** hierarchical, **topic-segmented**, action-item-driven — topic-segment, extract action items
   **per section in parallel**, then reduce into one coherent MoM (arXiv:2312.17581, arXiv:2410.06520).
3. **Always keep a query path** over raw segments (QMSum locate-then-summarize).
4. **Evaluate with CREAM** (arXiv:2409.10883) to A/B prompts by ELO rather than opinion.

### 4.4 Context-window math — and why full-context is a trap *here*

| Quantity | Estimate | Basis |
|---|---|---|
| Speaking rate | ~130–150 wpm | Standard conversational speech |
| 2-hour meeting | ~16,000–18,000 words | 120 min × 133–150 wpm |
| **English tokens** | **~22,000–25,000** | ~1.33–1.4 tokens/word |

A 2-hour English meeting ≈ **22–25k tokens**; a 3-hour ≈ 33–37k. **Both fit a 128k window comfortably**, and a
10-hour meeting (~110–125k) still fits. **So for English, naive full-context summarisation of a business meeting
is genuinely viable.**

**But the Vietnamese multiplier changes the conclusion.** Vietnamese (diacritics, Latin script, BPE-hostile)
typically costs roughly **1.5–2.5× more tokens than English for the same semantic content**:

| Scenario | Transcript tokens (ESTIMATE) | Fits 128k? |
|---|---|---|
| 2 h English | ~22–25k | ✅ easily |
| 2 h Vietnamese (1.5×) | ~33–38k | ✅ |
| 2 h Vietnamese (2.5×) | ~55–63k | ✅ |
| 2 h **bilingual** (original + translation side by side) | ~55–88k | ✅ but expensive |
| 4 h Vietnamese (2.5×), bilingual | ~110–175k | ⚠️ **borderline / overflows** |
| 8 h all-day workshop, bilingual | ~220–350k | ❌ |

`All token figures are ESTIMATES, NOT measured against a real tokenizer. huggingface.co is blocked from this environment, so no tokenizer could be pulled.`

> **`[NEEDS SPIKE]` — cheap, high-value:** take 3 real Vietnamese meeting transcripts, run them through the
> **exact tokenizer of the chosen model**, and compute tokens/hour. **That one measurement decides whether you
> need chunking at all.** Treat the table as a hypothesis to falsify.

**Why to chunk anyway, even when it fits — five arguments that survive a large context window:**
1. **Action items and decisions are localised.** Section-level extraction then merge beats one prompt over a
   25k-token blob, because attention thins and instructions dilute.
2. **Rolling output is a product requirement**, not a cost trick — the user wants an update every N minutes.
3. **Cost is O(n²) if you re-summarise the whole meeting every 5 minutes**; a rolling state is O(n).
4. **GADR:** single-pass prompting degrades *specifically* on informal, fragmented meetings.
5. **Traceability.** Chunking + segment IDs lets every MoM sentence cite `[seg 412 @ 00:47:12 SPEAKER_02]`.
   Summarising one blob cannot reliably point back — and GADR names **traceability** as the central open problem.

### 4.5 Action items & decisions — failure modes and the prompting that works

**Known failure modes** (from the appendix; GADR is the primary evidence):
- **Hallucinated action items** — the model invents a task that sounds plausible for the agenda but was never agreed.
- **Wrong owner** — attributing an item to whoever *spoke most*, not whoever *committed*.
- **Invented due dates** — "next week" becomes a specific calendar date.
- **Missing implicit decisions** — the meeting "agreed" by consensus without anyone saying "we agree".
- **Cross-chunk loss** — decision at min 5, rationale at min 55, split by chunking.
- **RAG-unfaithful enrichment** — adding plausible-sounding context that is not in the transcript.

**Prompting patterns that measurably help:**
1. **Require verbatim evidence + timestamp for every extracted item.** The model must quote the source span and
   cite `segment_id` / timecode. Items without a supporting quote are dropped. This is the single most effective
   anti-hallucination control and it is what GADR calls **traceability**.
2. **Pass speaker names and timestamps into the prompt**, not raw undifferentiated text — the model attributes
   commitments far better when `[00:14:02] Nguyễn Văn A:` prefixes each turn.
3. **Separate *decision* from *action item*.** A decision is a state of the world ("we will use provider X"); an
   action item is an obligation with an owner and a date. Extract them with two different prompts.
4. **Two-stage: locate, then extract.** First ask the model to *find candidate spans*; then extract from those
   spans only. This is the QMSum locate-then-summarize pattern and it reduces false positives.
5. **Per-section, in parallel** (arXiv:2312.17581), then de-duplicate and merge in a reduce step.
6. **Explicitly allow "none found"** and instruct the model that inventing items is worse than missing them.
7. **Never derive a date.** Store the *verbatim phrase* ("cuối tuần sau") plus, if the model is confident, a
   normalised date marked as *inferred and unconfirmed*.

### 4.6 Speaker naming — turning `SPEAKER_00` into a real person

| Mechanism | Reliability | How |
|---|---|---|
| **Participant labels from a platform bot** | ⭐⭐⭐⭐⭐ | The platform gives you the participant list + per-participant audio. Best option, and it is the reason bots exist |
| **Calendar attendee matching** | ⭐⭐⭐⭐ | fBuddy can plausibly read a meeting invite; match the attendee list to the diarized speaker count and self-introductions. Cheap and surprisingly effective |
| **Self-introduction detection** | ⭐⭐⭐ | Prompt an LLM over the first ~2 minutes: "xin chào, tôi là Nam từ phòng kỹ thuật" → map to `SPEAKER_01`. Pragmatic fallback, no extra ML |
| **Voice enrolment / speaker identification** | ⭐⭐⭐⭐ accuracy, 🔴 **legal cost in Vietnam** | pyannote/SpeechBrain **ECAPA** embeddings or resemblyzer. **See §5.4 — enrolment turns voice into *biometric sensitive personal data* under Vietnam's PDPL** |
| **Manual UI naming** | ⭐⭐ effort | Let the user click a speaker and type a name once. Trivial to build, and it makes the *rest* of the MoM correct. **Do this first.** |
| **Talk-time heuristics** ("the one who talks most is the manager") | ⭐ | Do not ship this |

**Recommendation:** ship **manual naming in the UI + calendar attendee matching + self-introduction detection**.
They are cheap, they carry no extra legal weight, and they get you 80% of the value. **Defer voice enrolment**
until you have Vietnamese legal advice — it is the one MoM feature that escalates your entire compliance tier.

### 4.7 Data model for a rolling MoM

The minimum viable schema — and the key point is that **every MoM claim must be traceable to segments**:

```
meeting(id, title, started_at, ended_at, source, consent_record_id, retention_policy)
segment(id, meeting_id, seq, t_start_ms, t_end_ms, speaker_label, speaker_name_id,
        src_lang, src_text, tgt_lang, tgt_text, is_final, confidence)
speaker(meeting_id, label, display_name, naming_method, confidence)
glossary(meeting_id, term, translation, note)
mom_revision(meeting_id, rev, t_created, window_start_seg, window_end_seg,
             decisions[], actions[], open_questions[], summary_md)
action_item(id, meeting_id, description, owner_speaker_label, owner_name,
            due_verbatim, due_normalised, status,
            evidence_segment_id,   -- ← the anti-hallucination anchor
            evidence_quote)
decision(id, meeting_id, statement, evidence_segment_id, evidence_quote, t_decided_ms)
consent_record(id, meeting_id, participant, method, scope_json, t_granted, t_withdrawn)
```

Design notes that matter more than the exact columns:
- **`evidence_segment_id` on every action item and decision is non-negotiable.** It is the mechanism that makes
  the MoM verifiable, it is what lets the UI jump from a bullet to the audio, and it is what LC/the customer will
  ask for.
- **`consent_record` is a first-class table, not a boolean.** Vietnam requires per-purpose, timestamped,
  verifiable consent (§5.4); silence is not consent; withdrawal is a right.
- **`mom_revision` is append-only.** Rolling MoM output is a series of revisions over segment windows, not one
  mutating document — that is what makes "what changed since 10 minutes ago?" answerable.
- **Make it MCP-queryable.** `silverstein/minutes` reached ★1,487 in ~6 months on the pitch that
  *"Claude Code, Codex, Cursor, and any MCP client can query"* the meeting notes. The consumer of MoM is
  increasingly an agent. **fBuddy already has a knowledge-block mechanism — meeting MoM is exactly the kind of
  thing that should become a queryable block.**

---

## 5. Meeting bot vs in-browser vs device capture, and the legal envelope

### 5.1 The four capture routes, compared for THIS product

The filter is brutal: fBuddy wants **live** translation, so a route only qualifies if it can deliver audio (or
transcribed text) **to our server continuously while the meeting is still happening**.

| Route | Live audio out? | Speaker names? | Diarization quality | Our cost / meeting-hr | Works where the user already is? | Verdict |
|---|---|---|---|---|---|---|
| **(a) Bot joins the meeting** (Recall.ai, Meeting BaaS, Attendee, Vexa, Skribby) | ✅ yes (raw PCM over WebSocket) | ✅ **real names** (perfect/hybrid diarization) | ⭐⭐⭐⭐⭐ (per-participant streams) | **$0.65–$1.50** (bot + STT + diarization surcharge) | ✅ Zoom/Meet/Teams; ⚠️ Webex partial; ❌ Slack Huddles/GoTo for *separate* audio | **Best quality, highest cost + worst legal footprint (a visible bot in the call)** |
| **(b) Desktop overlay capturing system audio** (what MeetFlow AI's Windows overlay likely does) | ✅ yes, locally | ❌ no — one mixed stream | ⭐⭐ **machine diarization only** | **$0.00 license + $0.12–$0.39 STT** | ✅ **everything** — Zoom, Meet, Teams, Webex, a phone call over VoIP, a YouTube video | **Cheapest, most universal, no bot in the call — but you lose names** |
| **(c) Browser tab/system capture** | ⚠️ **only after the user picks a tab**, every single time | ❌ | ⭐⭐ machine diarization | $0.12–$0.39 STT | ✅ but only if the meeting is **in a browser tab** (Meet, Zoom web client, Teams web) — ❌ **not the Zoom/Teams desktop app** | **Weakest capture route** — see §1 for why |
| **(d) Mobile app capturing call audio** | ❌ **effectively impossible for cellular/PSTN** | ❌ | — | — | — | **Do not attempt.** See §5.3 |

### 5.2 (a) Meeting-bot services — verified pricing

| Vendor | Recording price | Free / trial | Raw realtime audio out | Chunk / format | Diarization | Notes |
|---|---|---|---|---|---|---|
| **Recall.ai** | **$0.50/hr of recording** — **same price for the Meeting Bot API and the Desktop Recording SDK**; prorated to the second; startup program $0.25/hr for first 10k hrs | **first 5 hours free** | ✅ `audio_mixed_raw` **and** `audio_separate_raw` | **200 ms** chunks, mono 16-bit signed LE PCM @ 16 kHz, base64 | 4 methods; **perfect diarization ≈ 1.8× transcription credit usage realtime** | Built-in transcription **+$0.15/hr**; storage $0.05/hr after 7 free days; Calendar API free `[VERIFIED https://www.recall.ai/pricing @20/09/2026]` |
| **Meeting BaaS** | **from $0.35 per recording hour**; token packs $0.50 → $0.45 → $0.40 per hour | **8 hours free**; free tier = 75 bots/day (record up to 8 h) | ✅ `streaming_config.output_url` | **100 ms** binary PCM; 16/24/32/48 kHz (default 24 kHz) | **Included in the raw recording token** | *"One token records one hour with speaker diarization included. Transcription and streaming add a fraction on top."* Default STT provider Gladia `[VERIFIED https://www.meetingbaas.com/pricing @20/09/2026]` |
| **Attendee** | **$0.50/hr** after trial; volume down to **$0.35/hr** | **5 hours free** | ✅ `websocket_settings.audio` **and** `per_participant_audio` | base64 **16-bit mono PCM**; **8000 / 16000 / 24000 Hz** (default 16000); bidirectional | via providers | **Self-hostable** (Django/Postgres/Redis). Repo ★730, licence **NOASSERTION ⚠️ — have counsel read the actual licence file before commercial self-hosting** `[VERIFIED https://attendee.dev/pricing @20/09/2026]` |
| **Vexa** | hosted **$0.30/bot-hr** (+$0.20/hr transcription = **~$0.50/hr all-in**); **$0 self-hosted**; SaaS seat plan **$12/seat/mo** | **$2 free bot credit** (≈6 h at $0.30/hr) | ✅ realtime WebSocket transcripts | — | platform-native | **Apache-2.0**, ★2,803, last push 20/09/2026 — but **601 open issues** is a maturity signal to weigh against the stars. Vendor claims *"up to 40% cheaper"* than Recall `[VENDOR CLAIM]` `[per appendix]` |
| **Skribby** | **$0.35/hr base** (bot + raw audio + live webhooks) + **$0.05/hr realtime addon** + STT of your choice | Free tier, no card | ✅ Realtime addon: *"Realtime meeting events, control actions, and **raw audio** in one bundle"* | — | per-model | **Cheapest managed live stack found (~$0.40 + STT)** and the **most transparent per-model pricing anywhere in this market** — e.g. Soniox v5 Realtime $0.52 all-in, Deepgram Nova-3 Realtime $0.87 all-in, ElevenLabs Scribe v2 Realtime $0.86 all-in. Note the correct domain is **`skribby.io`**, not `skribby.ai` `[per appendix]` |

> **The critical price caveat.** The bot's recording fee is **not** your per-hour cost. For live translation you
> pay **recording + realtime audio streaming + STT + MT + LLM summarisation**. Using Recall's own numbers:
> $0.50 (recording) + $0.15 (STT) = **$0.65/hr before translation and summarisation**, and **~1.8× the
> transcription credit usage** if you enable perfect diarization in realtime.
>
> **Three further traps that are easy to miss when modelling the bot route:**
> 1. 🔴 **You are billed while the bot waits to be admitted.** Meeting BaaS states on its own pricing page:
>    *"Raw recording tokens would be charged even when a bot has not been accepted in a meeting based on the
>    duration the bot was waiting to be accepted."* A host who never admits the bot still costs money.
> 2. 🔴 **Realtime webhook delivery is serial and ordered.** Recall documents that *"blocking a webhook request
>    will delay any subsequent requests"* and instructs you to *"make sure that any processing of the
>    transcription webhook happens asynchronously."* A slow translation call inside the webhook handler will
>    stall the whole transcript. **Buffer and fan out.**
> 3. ⚠️ **Realtime latency is 1–3 s, not sub-second.** Recall's documented expectation for webhook transcript
>    updates is *"every 1–3 seconds"*, with partials at *"hundreds of ms to low seconds"* — **worse than the
>    200–500 ms a direct streaming STT gives you.** If you feed translation from the bot's *transcript* rather
>    than its *raw audio*, you are adding 1–3 s before your cascade even starts.
>    `[All three VERIFIED per appendix, docs.recall.ai + meetingbaas.com/pricing]`

> **Platform-width warning with real teeth.** Even Recall.ai — the broadest-coverage vendor — supports
> **separate real-time audio per participant only on Zoom, Teams and Google Meet (16 concurrent speakers)**,
> and **not** on Webex, Slack Huddles or GoTo Meeting. If Vietnamese enterprise users are on Webex, live
> per-speaker translation is **not available** from Recall. `[VERIFIED per appendix, docs.recall.ai]`

#### 🚨 Zoom changed the rules on 2 March 2026 — this is not a vendor detail

On **2 March 2026** Zoom began requiring **Meeting SDK apps joining meetings hosted by external accounts to
authenticate with an On Behalf Of (OBF) token, a ZAK token, or to migrate to RTMS.**

> *"Beginning March 2, 2026, apps joining meetings outside their account must be authorized. Meet this
> requirement by using either OBF or ZAK tokens, or RTMS."*
> `[VERIFIED https://developers.zoom.us/blog/transition-to-obf-token-meetingsdk-apps/ + /docs/meeting-sdk/obf-faq/ @19/09/2026, per appendix]`

| Constraint | Consequence |
|---|---|
| Requires per-user OAuth with the `user:read:token` scope, **plus a Zoom Marketplace review** | Onboarding flow + weeks of review on the critical path |
| *"that user must already be in the meeting for the join to succeed"* / *"The SDK app can't join until an authorized participant joins"* | **Your bot cannot be first in the meeting** — a direct product blocker for an auto-joiner |
| *"Can the SDK app continue recording when the authorized user leaves?" →* **"No. The SDK session is tied to the presence of the authorizing user, so the session ends when that user leaves."** | 🔴 **A 2-hour meeting dies when the host steps out.** Unacceptable for a MoM product |
| **RTMS** is the sanctioned path: *"RTMS allows continuous streaming independent of participant presence, as long as the host has authorized the app"* | Survives the host leaving — but it is **user-initiated**, **receive-only** (it *"cannot send data back into the meeting"*), **no Breakout Rooms**, and **a paid Zoom feature** |

> **This is the strongest single argument for the desktop-overlay route.** The "just send a bot to any Zoom
> link" era ended on 2 March 2026. Any meeting-intelligence product built after that date needs (a) per-user
> OAuth, (b) an RTMS path, **and (c) a bot-free local capture path.**

### 5.3 (b) Desktop overlay, (c) browser, (d) mobile — the technical reality

**(b) Desktop overlay capturing system audio.**

| OS | Mechanism | Driver install needed? | Verified |
|---|---|---|---|
| **Windows** | **WASAPI loopback** — `IAudioClient::Initialize` with `AUDCLNT_STREAMFLAGS_LOOPBACK` | ✅ **No driver needed.** *"In loopback mode, a client of WASAPI can capture the audio stream that is being played by a rendering endpoint device."* Constraint: **shared-mode only** — *"Exclusive-mode streams cannot operate in loopback mode."* Windows 10 1703+ supports event-driven loopback clients without the old render-stream workaround | `[VERIFIED https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording @20/09/2026]` |
| **macOS** | **Core Audio process taps** — `CATapDescription` → `AudioHardwareCreateProcessTap(_:_:)`; the tap is used *"as an input in a HAL aggregate device, just like a microphone"*, and can capture *"outgoing audio from a process or group of processes"* with mixdown options, public/private visibility, and the ability to **mute the process output** | ✅ **No virtual driver needed on modern macOS** (this is the modern replacement for the BlackHole/Loopback + Multi-Output Device setup). ⚠️ The Apple **sample-code article** declares availability `macOS 26.0 / Xcode 26.0`, so verify the minimum deployment target before committing | `[VERIFIED https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps @20/09/2026]`; `ScreenCaptureKit` audio capture page exists but is JS-rendered `[PARTIAL]` |

> **Why Windows-first makes sense for this product.** Windows gets system-audio capture with **zero driver
> install and zero virtual-device configuration**, while macOS users historically had to install a virtual audio
> device. That is a genuine, defensible UX reason for the Windows overlay to exist first — and it matches the
> fact that MeetFlow AI's overlay already ships on Windows.
> **Counter-consideration:** you can also **buy** this route — **Recall.ai's Desktop Recording SDK is priced at
> the same $0.50/hr as its bot API** `[VERIFIED recall.ai/pricing]`, which is a real build-vs-buy option.

**(c) Browser capture.** Fundamentally handicapped — see §1 for the full evidence. The three decisive facts,
all verified from MDN:
1. *"The go-ahead permission to use getDisplayMedia() cannot be persisted for reuse. **The user must be prompted
   for permission every time.**"*
2. *"**Transient user activation is required.**"*
3. *"The specified options can't be used to limit the choices available to the user."* — and `preferCurrentTab`
   merely *"instructs the browser to offer the current tab as the most prominent capture source… as a separate
   'This Tab' option"*. **It does not auto-select.**
Additionally, `systemAudio` applies *"when **a monitor** is shared"*, not a tab — so for tab capture you rely on
the browser offering tab audio at all, and MDN warns: *"the returned MediaStream may still have only one video
track, with no audio."* `[VERIFIED https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia @20/09/2026]`

**(d) Mobile.** ❌ **A third-party app cannot capture a cellular/PSTN call's audio.** iOS gives audio only to the
app that *owns* the call: **CallKit** integrates a VoIP app's own calls with the system call UI
(`[VERIFIED framework listing https://developer.apple.com/documentation/callkit @20/09/2026]` — CallKit is for
apps that implement their own calls, not for tapping someone else's), and **ReplayKit**'s
`RPBroadcastSampleHandler` processes screen-recording buffers — it is a *screen* capture extension, and it is
annotated as **deprecated as of iOS 27** `[VERIFIED https://developer.apple.com/documentation/replaykit/rpbroadcastsamplehandler @20/09/2026]`.
Android is no better without root/accessibility abuse and carries Play Store policy risk.
`[INFERRED from the above docs — no single canonical page states the negative directly. This is nonetheless
the settled industry reality: that is why Granola, Otter and Fireflies do desktop capture and treat mobile as a
companion, not a capture device.]` **Recommendation: do not put mobile capture on the roadmap.**

**Why Android is *structurally* unable to capture call audio** (stronger than a policy restriction) —
`[VERIFIED per appendix, AOSP `AudioPlaybackCaptureConfiguration` Javadoc, mirrored on GitHub because developer.android.com was unreachable]`:

> *"you will only capture a mix of the audio signals played by players… which present the following
> characteristics: the **usage value MUST be `USAGE_UNKNOWN` or `USAGE_GAME` or `USAGE_MEDIA`. All other usages
> CAN NOT be captured.**"*

Meeting apps use **`USAGE_VOICE_COMMUNICATION`** for call audio — which sits in the *"All other usages CAN NOT be
captured"* bucket. **So `AudioPlaybackCapture` cannot capture VoIP/call audio even before any opt-out.** Two
independent opt-outs exist anyway (`android:allowAudioPlaybackCapture="false"`, and
`setAllowedCapturePolicy(ALLOW_CAPTURE_BY_NONE)`), cross-profile capture is blocked, and `MediaProjection`
requires a **user-consent dialog per session** — no silent, persistent capture.

**Granola is the decisive real-world evidence** — and it is the closest analogue to MeetFlow in this whole report.
`[VERIFIED per appendix, Granola's own help centre + blog]`
> *"**Virtual meeting calls**: On macOS, Granola captures system audio, so it works inside any meeting app.
> **Phones don't let apps capture audio from other apps, so Granola can't transcribe virtual meeting calls on
> mobile.** On mobile, it's designed for **in-person meetings** (and, on iOS, **outbound phone calls made through
> Granola's built-in dialer**)."*
> *"**Inbound calls — Unfortunately due to strict limitations in iOS, Granola can't transcribe inbound calls at
> the moment.**"* To make outbound work they **provisioned their own phone number** and had the user
> *"call yourself for verification"*, and the callee *"will see your own phone number"* as caller ID.

**Reading:** a well-funded competitor **could not tap the Phone app or the Zoom mobile app.** It had to *become*
the call (the CallKit/VoIP pattern) — and even then supports **outbound only**. This is the single best
confirmation that mobile call capture is closed. Note also Granola's own architecture: **whole-system loopback,
not per-process** — *"Granola cannot isolate audio from individual applications — it captures the combined audio
stream from your system"* — and *"There is no meeting bot — Granola runs only on your computer and uses your
system audio and microphone."*

**iOS App Store review rule that shapes the UX** `[VERIFIED per appendix, App Store Review Guidelines]`:
> **2.5.14** *"Apps must request **explicit user consent** and provide a **clear visual and/or audible indication**
> when recording, logging, or otherwise making a record of user activity. This includes any use of the device
> camera, microphone, screen recordings, or other user inputs."*

**⚠️ 2026 platform change to track:** **ReplayKit is deprecated in favour of ScreenCaptureKit on iOS**
(`RPScreenRecorder.deprecatedAt 27.0`, `RPBroadcastSampleHandler` — *"No longer supported"*), and `SCStream` /
`SCStreamConfiguration` / `capturesAudio` gained **iOS 27.0** availability. **But `SCShareableContent` — the
macOS entry point for enumerating what to capture — has no iOS availability**, so the iOS path is not the macOS
path and the readable docs do not explain the iOS entry point. Treat iOS-27 ScreenCaptureKit audio as
**promising but requiring hands-on validation.** `[VERIFIED per appendix, Apple Developer metadata]`

### 5.4 LEGAL / CONSENT

> ### 🚨 Vietnam: the brief's premise is out of date
> **Decree 13/2023/ND-CP ceased to have effect on 1 January 2026.**
> The governing instruments are now the **Law on Personal Data Protection No. 91/2025/QH15 ("PDPL")**, enacted
> **26 June 2025**, and its guiding **Decree No. 356/2025/ND-CP ("Decree 356")**, promulgated **31 December
> 2025**. Both took effect **1 January 2026**. Decree 356 *"formally announced the replacement of the Decree No.
> 13/2023/ND-CP"*.
> `[VERIFIED https://www.dlapiperdataprotection.com/index.html?t=law&c=VN (page last modified 15/02/2026) + https://www.tilleke.com/print-insight/?post_id=69571&print=1, per appendix, fetched 19/09/2026]`
> **Any DPIA template, compliance plan or vendor contract drafted against Decree 13 — including the "Art. 25
> Transfer of Personal Data Abroad" framing in the brief — is now legally stale.** The equivalent obligation
> survives as the **TIA (Transfer Impact Assessment)** under the PDPL + Decree 356.

| Item | Requirement | Source |
|---|---|---|
| **Is a voice recording personal data?** | **YES, explicitly.** Vietnamese personal-information definitions name **"voice"** as a form of information *"used to identify an individual"* | `[VERIFIED Freshfields, per appendix]` |
| **⚠️ Is it SENSITIVE?** | **If you use voice to *identify* someone, yes.** Law 91/2025 **Art. 31(2)** defines biometric data as physical/biological characteristics **used to identify that person**, and Vietnamese legal analysis explicitly includes **`giọng nói` (voice)** alongside fingerprint/face/iris. **Decree 356 Art. 4(1)(đ) places biometric data in the SENSITIVE personal data list** | `[VERIFIED softspace.vn + longphanpmt.com + DLA Piper, per appendix]` |
| **Consent is the primary legal basis** | Must be **clear, specific, verifiable including the time and scope**; must cover the data type + purpose, the controller, the subject's rights, **and that the data is sensitive if it is**; **per-purpose**; **silence or non-response is NOT consent**; **default/pre-ticked consent and ambiguous UI are prohibited**; withdrawable at any time (not retroactive) | `[VERIFIED DLA Piper + Rouse + Tilleke, per appendix]` |
| **🔴 The trap** | A pre-ticked checkbox or a "by joining this meeting you consent" banner is **exactly what Decree 356 prohibits**. Your consent UX must be an **affirmative, logged, timestamped, per-purpose action** | `[INFERRED from the verified prohibition on default consent]` |
| **The "public places" exemption does NOT cover you** | There is an exemption for *"audio and video recording… in **public places and public activities**"*. An internal company meeting on Zoom/Teams is **not** a public place | `[VERIFIED DLA Piper, per appendix]` |
| **Sensitive-data obligations (if you do voice enrolment)** | **Explicit consent that tells the subject the data is sensitive**; access controls + physical security + encryption; **breach notification within 72 hours to MPS *and* the data subjects**; **retain breach records ≥5 years** | `[VERIFIED Rouse + softspace.vn, per appendix]` |
| **Cross-border transfer (the old "Art. 25")** | Prepare and submit a **TIA to the Ministry of Public Security (A05)**; original copy within **60 days** of transfer; **review every 6 months** or within 10 days of material change; A05 appraises in 15 days; a **data transfer agreement** with mandatory content is required | `[VERIFIED DLA Piper + Tilleke, per appendix]` |
| **Penalties** | Administrative fine **VND 10–20M (≈USD 400–800)** for failure to obtain prior consent. Criminal (Criminal Code, illegal use of information on a computer/telecom network): **VND 30M–1B (≈USD 1,200–40,000)** and/or **up to 7 years' imprisonment** | `[VERIFIED DLA Piper, per appendix]` |
| 🔴 **Penalties under the PDPL are far heavier — read this row** | **Entities: up to 3,000,000,000 VND (3 billion VND) administrative fine.** Sale of personal data: up to **10× the revenue from the sale**. **Cross-border data transfer violations: up to 5% of the previous year's revenue.** Individuals: **half** the entity maximums. Plus **criminal liability** and a duty to **compensate affected individuals**. ⚠️ **The sanctioning decree's issuance has not been officially announced** — Rouse expected it in H1 2026 | `[VERIFIED chambers.com "Landmark Personal Data Protection Law in Vietnam" + Rouse, per appendix]` |
| ⚠️ **The 5%-of-revenue penalty attaches specifically to cross-border transfer** | Which is exactly what a cloud SaaS with Vietnamese meeting data does by default. This is the strongest argument for a Vietnam region deployment or a deliberate TIA strategy | `[VERIFIED per appendix]` |
| 🔴 **"Important data" threshold for SENSITIVE data is only 10,000 people** | The separately-applied **Data Law** sets thresholds: **"important data"** = basic citizen data of **100,000+** Vietnamese citizens **OR sensitive citizen data of 10,000+**; **"core data"** = 1,000,000+ basic **OR 100,000+ sensitive**. A Data Law TIA can be exempted if you already complied with the PDPL's TIA for the same data | `[VERIFIED DLA Piper, per appendix]` |
| 🔴 **…which means voice biometrics make you "important data" at 10,000 users** | **Do the arithmetic:** if you do voice identification (→ sensitive), a mid-sized enterprise deployment crosses the **important-data** threshold at 10,000 Vietnamese subjects, with 100,000 triggering **core data**. **This is the single strongest argument for not storing voiceprints for Vietnamese users.** | `[INFERRED from the verified thresholds above]` |
| ⚠️ **The startup/small-enterprise grace period is VOID if you process sensitive data** | SMEs and startups get a **5-year grace period** from the PDPL effective date for impact-assessment dossiers and DPO designation; business households and micro-enterprises are exempt. **But the grace does not apply if (i) you reach 100,000+ data subjects, (ii) you provide data processing services, or (iii) you directly process SENSITIVE personal data.** → **voice identification voids it regardless of headcount** | `[VERIFIED Tilleke + DLA Piper, per appendix]` |
| **DPO qualification bar** | If a DPO/DPD is required: **≥ college degree, ≥2 years' post-graduation relevant experience, and formal personal-data-protection training** — the written appointment decision must accompany the DPIA/TIA filing | `[VERIFIED DLA Piper + Rouse, per appendix]` |
| **Anti-eavesdropping rule** | The PDPL's social-media activity rules *"prohibit providers from **eavesdropping on calls and messages without consent**"* — an explicit prohibition that reads directly against covert meeting capture | `[VERIFIED Chambers, per appendix]` |
| ⚠️ **Cybersecurity Law localisation update is overdue** | DLA Piper anticipated updated data-localisation requirements being submitted to the Prime Minister around **April 2026** — that date has passed. **Check whether it has since issued** | `[VERIFIED DLA Piper, per appendix]` |

**Three-tier design implication — and you should design for the middle tier:**

| Feature set | Classification | What it demands |
|---|---|---|
| Live translation only, **audio discarded immediately**, no voiceprints, no names | Personal data (voice); **arguably not biometric** — you are not using it to *identify* | Notice + consent; no long retention |
| Recording + diarization with generic `SPEAKER_00` | Personal data | Notice + consent; DPIA |
| **Voice enrolment / speaker identification / naming by voice** | 🔴 **SENSITIVE (biometric)** | **Explicit "this is sensitive" consent**, access controls, encryption, 72 h breach notice to MPS **and** subjects, 5-year breach records |

`This tiering is ANALYSIS, not a legal opinion. It follows from Art. 31(2) Law 91/2025's "used to identify" criterion. Have Vietnamese counsel confirm.`

> **This is why §4.6 recommends deferring voice enrolment.** It is the one MoM feature that escalates the whole
> product from "ordinary personal data" to "sensitive biometric personal data" — with a 72-hour dual breach
> notification duty and a 5-year record-keeping duty attached.

**US — 18 U.S.C. §2511 and the state overlay.** Federal law is **one-party consent** (§2511(2)(d): a *party* to
the communication may record, or one party's prior consent suffices — **unless** the interception is *"for the
purpose of committing any criminal or tortious act"*). **The most important structural point:** because a bot or
an overlay is a **party** to the meeting, federal law alone would permit recording. **The entire risk is the
state overlay.** RCFP's authoritative framing `[VERIFIED per appendix]`:
- **"About 11 states primarily have all-party consent requirements"** — CA, **DE**, FL, IL, MD, MA, MI, MT, NH, PA, WA.
- **Four states are split:** **CT and NV are all-party for *phone* but one-party *in person*; MO and OR are the reverse.**
- **Hawaii and Maine** require all-party consent only in *particularly private places*, otherwise one-party.
- *"Regardless of the state, it is almost always illegal to record a conversation to which you are not a party."*
- Also note **§2511(1)(c)–(d)** make **disclosure and use** separate offences — so **the AI summary itself is an
  independent exposure**, not just the recording.

> **Three corrections to the list that circulates online:** (1) **Delaware is missing** from most versions;
> (2) **Connecticut and Nevada are wrongly shown as blanket all-party states** — they are phone-only;
> (3) **Oregon must no longer be described as all-party** for in-person — the 9th Circuit struck that provision
> down in 2023.

**Case law that makes the in-call announcement legally load-bearing** `[VERIFIED per appendix, RCFP chapters]`:
- **Washington** — RCW §9.73.030: consent *"is considered obtained when one party makes a **reasonably effective
  recorded announcement** to all other parties in the conversation that it is about to be recorded."*
  *(State v. Townsend, 57 P.3d 255 (Wash. 2002).)*
- **Massachusetts** — the statute reaches only **secret** recordings, so **awareness suffices**; no affirmative
  consent needed when all parties know. *Curtatone v. Barstool Sports, 169 N.E.3d 480 (Mass. 2021).*
- **Pennsylvania** — consent is found where parties *"knew or reasonably **should have known**"* the conversation
  was being recorded. *Commonwealth v. Byrd* (Pa. 2020); *Cruttenden* (Pa. 2012) allows recording of emails/chats
  because participants expect those media to be recorded.
- **California is the exception that breaks the rule** — §632.7 covers any call involving a **cell/cordless**
  phone **regardless of confidentiality**, and *Smith v. LoanMe* (Cal. 2021) holds this reaches **participants**,
  not just eavesdroppers. *Gruber v. Yelp* (2020) — even a one-way recording can violate it. **An announcement
  will not save you in California for mobile-originated calls.**
- **Michigan remains disputed for participants** (*Sullivan v. Gray* vs. the Michigan Supreme Court never having
  ruled) — **treat MI as all-party; the *Sullivan* line is a litigation defence, not a design assumption.**

**Which states these are, at a glance** — verified via the Reporters Committee for Freedom of the Press state
chapters `[per appendix]`:

| State | Practical rule | Key nuance |
|---|---|---|
| **California** | All-party | *Confidential* communications — **plus cell/cordless calls regardless of confidentiality** (§632.7). Civil **$5,000 or 3× damages per violation** |
| **Connecticut** | **Phone all-party; in-person one-party** | Split regime — easy to get wrong |
| **Delaware** | All-party (the stricter of two conflicting statutes) | RCFP advises following the stricter law |
| **Florida** | All-party (in-person, phone, electronic) | *Confidential communication* only. Civil **≤$1,000 per day** + punitive |
| **Illinois** | All-party | **Felony 1–3 yrs + ≤$25,000** — the harshest in the set |
| **Maryland** | All-party | Telephone protected **regardless of any expectation of privacy** |
| **Massachusetts** | All-party | Held to apply **even in a public location** (*Manzelli*) |
| **Michigan** | All-party for third parties; participants disputed | — |
| **Montana** | All-party, **but only via a "hidden" device** | Warning given / public meetings / public officials on duty are excepted |
| **Nevada** | **In-person one-party; phone all-party** | Extends to **cell calls and texts** |
| **New Hampshire** | All-party | Reduced to a misdemeanor if the violator was a party |
| **Pennsylvania** | All-party | **Felony ≤7 yrs / ≤$15,000** |
| **Washington** | All-party | ✅ **Consent may be satisfied by "a reasonably effective recorded announcement … that it is about to be recorded"** — a direct design win for an in-call announcement |
| **Oregon** | One-party for phone | ⚠️ The **in-person all-party provision was struck down by the 9th Circuit in 2023** (*Project Veritas v. Schmidt*) — most online lists are stale |
| **Vermont** | No state statute at all | Federal law only |

`[All rows VERIFIED via https://www.rcfp.org/reporters-recording-guide/<state>/ per the appendix, fetched 19/09/2026]`
**Design rule: apply the *strictest* applicable rule — default to all-party consent + an audible announcement
whenever any participant may be in an all-party state.**

**EU — GDPR.** Recording a meeting is unambiguously personal-data processing. Lawful basis is normally
**Art. 6(1)(a) consent** or **6(1)(f) legitimate interests** (with a balancing test); consent must be freely
given — which is legally fragile in an employer/employee meeting, because of the **imbalance of power**. There
are two structural traps for a meeting-AI product:
- 🇩🇪 **Germany — §87(1) Nr. 6 BetrVG**: co-determination over *"the introduction and use of technical devices
  intended to monitor employee behaviour or performance"*. The test is whether the device is *objectively
  capable* of monitoring — a retained, searchable, speaker-attributed, AI-summarised corpus plainly is.
  Art. 87(2) sends deadlocks to a **conciliation committee (`Einigungsstelle`)**, so the works council holds a
  genuine veto-equivalent lever: **you cannot unilaterally deploy this in a German establishment**.
  `[§87 statutory text VERIFIED https://www.gesetze-im-internet.de/betrvg/__87.html; the application is ANALYSIS]`
- 🇫🇷 **France**: consult the **CSE**; inform employees of *when* they may be monitored; counterparts must be
  told of a **right to object exercisable before the end of the call**; **retention caps** (≈1 year for call
  reports, 6 months for training recordings); **"no permanent listening"**.
  `[VERIFIED via a secondary French legal publisher summarising CNIL; CNIL's own site is JS-only and was not retrievable — treat as INDICATIVE]`
- **EU AI Act** is relevant only at the **transparency tier** here: if the minutes are AI-generated and the
  translated audio is synthetic, **Art. 50** disclosure/marking duties apply. ⚠️ **Keep the product a *record*,
  not a *measurement*** — no per-person talk-time league tables, no sentiment/emotion scoring — or you risk
  drifting into **Annex III point 4 high-risk** territory (employment/worker-management monitoring).
  `[VERIFIED per appendix, EUR-Lex]` Specifically:
  - **The AI Act's main body applies from 2 August 2026** (Chapters I–II from 2 Feb 2025) — i.e. **imminently**.
    Re-check for post-publication amendments (digital-omnibus) before relying on the timeline.
  - **Art. 50(2)** requires providers of AI systems generating **synthetic text** to mark outputs **in a
    machine-readable, detectable format** — the carve-out for *"an assistive function for standard editing or
    [content that does] not substantially alter the input data"* is the design question: a **faithful extractive**
    summary plausibly falls inside it, a **generative narrative** minutes document plausibly does not. **Plan for
    provenance marking** (C2PA-style) on generated minutes.
  - **Art. 50(4)** covers **deep fakes** — **live translation rendered as synthetic voice is very plausibly in
    scope**, so disclose it. The *"human review + editorial responsibility"* carve-out is a plausible route for
    human-approved minutes.
  - **Art. 50(3)** imposes a deployer information duty for **emotion recognition / biometric categorisation** —
    another reason to refuse "sentiment"/"engagement" features outright.
  - **Art. 50(5)** — information must be given *"in a clear and distinguishable manner **at the latest at the time
    of the first interaction or exposure**"*. **Same timing rule as GDPR Art. 13(3): a post-meeting email is too
    late.** This is the legal basis for the in-meeting notice.
  - 🔴 **Recital 57 explicitly routes employment monitoring AI to HIGH-RISK**: *"AI systems used in employment,
    workers management… **for monitoring or evaluation of persons in work-related contractual relationships,
    should also be classified as high-risk**."* A meeting assistant is **not automatically high-risk** — but the
    moment it is positioned or configured to **monitor or evaluate employees** (participation scores, talk-time
    analytics, performance inference from a transcript corpus) it pulls in **Chapter III obligations** (risk
    management, data governance, technical documentation, logging, human oversight, conformity assessment,
    registration). **Keep it a record, not a measurement.**

**Platform-level recording notices:** Microsoft Teams cloud recording requirements are **fully verified**;
Zoom's article is **partially verified** (titles yes, bodies no — JS-gated); **Google Meet pages were
unreachable** `[per appendix]`. In practice **all three surface a notice to participants when recording starts**,
so the product must not fight that — it should align with it.

**Prioritised compliance controls (P0 = must ship before any real meeting):**

| Priority | Control | Why |
|---|---|---|
| **P0** | **Audible + persistent in-meeting notice**, and a bot that is a visible, named participant | Satisfies WA/Mass/PA-style consent **and** GDPR Art. 13(3) / AI Act Art. 50(5) timing in one move |
| **P0** | **Separate, granular per-purpose toggles** (record / transcribe / summarise / translate / train) | Vietnam bans bundled consent; GDPR Recital 43 presumes against it |
| **P0** | **Zero-retention audio mode; "translate-only, don't store"** | Art. 5(1)(c)/(e) compliance *by construction* — the strongest single legal posture available |
| **P0** | **No voice enrolment; no emotion/sentiment analysis** | Avoids Vietnam's sensitive-biometric tier and GDPR Art. 9(1) |
| **P1** | **In-meeting objection that actually stops or excludes capture** | CNIL's *droit d'opposition avant la fin de la conversation*; GDPR Art. 21 |
| **P1** | Published retention schedule + **enforced auto-deletion** | Art. 5(1)(e); CNIL caps |
| **P1** | **All-party-consent default** whenever an all-party-state participant is present | §2511 floor + state overlays |
| **P1** | Vietnam: **TIA filed with A05 within 60 days**; DPIA prepared | PDPL + Decree 356 |
| **P1** | Germany: works-council / Betriebsvereinbarung workflow | §87 BetrVG |
| **P2** | Machine-readable provenance marking on AI-generated minutes; disclosure on synthetic translated audio | EU AI Act Art. 50(2)/(4) |

---

## 6. What can be built at ~zero cost

### 6.1 Free-tier inventory (verified on 20/09/2026)

| Source | Free allowance | What it can actually do for this feature |
|---|---|---|
| **Cloudflare Workers AI** `whisper-large-v3-turbo` | **10,000 neurons/day = ≈ 214 audio-min/day ≈ 3.6 h/day**, resets 00:00 UTC. Then $0.011/1,000 neurons | **The best recurring free STT on the market.** File-only, so it powers *MoM-from-upload*, and — with a rolling chunk buffer — degraded live captions. **No diarization.** `[VERIFIED https://developers.cloudflare.com/workers-ai/platform/pricing/ @20/09/2026]` |
| **Deepgram** | **$200 one-off credit** | ≈ **574 h** of Nova-3 `vi` streaming at the current promo rate. Includes **streaming diarization** at +$0.12/hr. Enough to run a real pilot with real meetings before paying anything. `[VERIFIED deepgram.com/pricing @20/09/2026]` |
| **Speechmatics** | **$100 credit**, 2 concurrent real-time sessions | ≈ 416 h Real-time Standard, **Vietnamese + diarization included** `[VERIFIED speechmatics.com/pricing @20/09/2026]` |
| **Gladia** | **€50 credit**, one-time, no monthly reset | Vendor states "~60+ hours of real-time transcription" `[VERIFIED https://gladia.io/pricing @20/09/2026]` |
| **Azure Speech** | F0: **5 audio h/month** real-time STT, 1 h speech translation, 0.5M chars TTS | Small but permanent and recurring |
| **ElevenLabs** | Free plan **10,000 credits/month** | Small; shares the credit pool with all ElevenLabs products |
| **Groq** | Free tier with reported **30 req/min** | `whisper-large-v3-turbo` at $0.00027/min — most credits go a long way; but **HTTP 403 from this environment**, so the exact free-tier terms are `[UNVERIFIED]` |
| **Browser Web Speech API** (`SpeechRecognition`) | **$0**, no key | See §1. Mic-only, one stream, Chrome-only-in-practice, no diarization, session/network limits |
| **Browser `SpeechSynthesis`** | **$0**, no key | Free TTS for the translated audio channel. `getVoices()` must be awaited (`voiceschanged`) and Vietnamese voice availability is platform-dependent `[VERIFIED https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices @20/09/2026]` |
| **LLM for translation + MoM** | OpenRouter `:free` model pool + very cheap paid models | Already researched in **R-001** — do not re-do it: R-001 concluded HF has no real free LLM ($0.10/month) and that OpenRouter `:free` + cheap paid models is the better path. Translation of one meeting-hour is only ~15k output tokens `[INFERRED]`, so even a paid cheap model costs **cents per meeting** |

### 6.2 How far a hobby-grade build gets — stage by stage

| Stage | Achievable for $0? | Quality ceiling |
|---|---|---|
| **A. Upload a recording → transcript** | **Yes, comfortably.** Cloudflare's 3.6 h/day covers a heavy user; a 1-hour meeting costs 46.63 neurons × 60 ≈ 2,800 of the 10,000 daily neurons `[INFERRED]` | Whisper-large-v3-turbo quality. Good on clean audio, weaker on Vietnamese accents/code-switching. No speaker labels |
| **B. Upload → MoM (summary, decisions, action items)** | **Yes, fully.** Transcript + any free/cheap LLM | **Bottleneck is the missing diarization**, not the LLM. See §6.3 |
| **C. Live captions from a *rolling chunk buffer*** | **Yes, but degraded.** Send 5–10 s closed chunks to Cloudflare/Groq in parallel | **3–8 s latency** instead of 1–2 s; **duplicated or dropped words at every chunk boundary**; Whisper hallucinating text on silence/music is a well-known failure mode `[UNVERIFIED but widely reported]`; no interim hypotheses at all, so the UI feels dead between chunks |
| **D. Live translation of *your own microphone*** | **Yes, truly $0** — browser `SpeechRecognition` for STT + `:free` LLM for MT + `SpeechSynthesis` for TTS | Works, but this only translates **the person sitting at the laptop**, not the other meeting participants. It is a *demo*, not the feature |
| **E. Live translation of *the whole meeting*** | **No — this is where $0 stops.** | Requires either tab/system audio capture plus a **true streaming** STT with diarization, or a meeting bot. Both cost money (or the one-off Deepgram/Speechmatics credits) |

### 6.3 Where the free tier actually breaks

| Break | Impact | Mitigation |
|---|---|---|
| **No diarization on any free STT** | 🔴 **Fatal for MoM quality.** Minutes without speaker attribution cannot say *who* owns an action item. Every free option (Cloudflare Whisper, Groq Whisper, browser Web Speech API) lacks it | Use the **Deepgram $200 credit** (streaming diarization, +$0.12/hr) for the pilot; or add a separate diarizer on the VPS (pyannote — CPU-viable but slow, and a new dependency on a shared box) |
| **Whisper hallucination on silence / non-speech** | 🟡 Injects phantom sentences ("Thank you for watching", subtitle credits) into the transcript that then poison the MoM | Always VAD-gate before sending a chunk; discard chunks with no speech; `no_speech_prob` thresholds |
| **File-only endpoints ⇒ no interim results** | 🟡 UI has no feedback for 3–8 s; boundary word duplication | Show a waveform/level meter as liveness feedback; overlap chunks by ~0.5 s and de-duplicate on word overlap |
| **Daily neuron reset at 00:00 UTC** | 🟡 A late-evening meeting in Vietnam (UTC+7) lands after the reset — actually helpful — but a long day of testing can exhaust the pool | Monitor usage; queue non-urgent jobs |
| **Concurrency: free tiers are 1–2 sessions** | 🔴 Two simultaneous meetings break it | Serialize; the streamer needs paid tier or Deepgram Growth (225 WSS) |
| **Browser Web Speech API is not a meeting-capture path** | 🔴 Mic-only; Chrome routes audio to Google; unreliable session handling; effectively unavailable in Firefox | Do not design around it for capture. Only for "my own voice" dictation |
| **Vietnamese accents & EN↔VI code-switching** | 🔴 The unquantified risk. Vietnam has strong regional accents (North/Central/South); office speech mixes English terms constantly | This is the #1 spike. Free Whisper is the *worst* option here; ElevenLabs (vendor-claimed ≤5% WER on VN) and Soniox (claims mid-sentence language switching) are the two best candidates to test |
| **No timestamps ↔ transcript↔MoM linking** | 🟡 Cloudflare/Groq give segment timestamps only via `verbose_json`-style options | Request them; store `start/end` per segment |

### 6.4 Honest bottom line for §6

A **zero-cost build is genuinely achievable for stages A, B, D** — record-or-upload a meeting, get a transcript,
get an LLM-written MoM, and live-translate your own microphone. That is a shippable hobby-grade feature and it
is worth building first because it validates the MoM quality bar (the hard part) with no billing relationship.

A **zero-cost build for stage E (live translation of the whole meeting, with speaker labels) does not exist.**
The realistic floor is **Soniox $0.12/hr** or **Deepgram/Speechmatics via their one-off credits ($200 / $100)**.
At a hobby scale of, say, 20 meeting-hours/month that is **$2.40/month** — the entire argument for accepting a
degraded free-tier architecture largely evaporates once you do that arithmetic.


---

## 7. Recommended architecture

### 7.1 The shape of the answer

Three constraints, established above, determine almost everything:

1. **The browser cannot capture a native meeting app and cannot capture anything without the user picking a
   surface, every single time** (§1.1). Zero-install capture is therefore real but narrow.
2. **Diarization quality is decided by the capture route, not by the STT vendor** (§4.1). A bot gets real names;
   every other route gets `SPEAKER_00` and a diarization error rate.
3. **The MoM is a text artefact**, so a cascade (STT → text LLM → [TTS]) is both cheaper and strictly more
   capable than speech-to-speech for this product (§3.1), because it yields the transcript, the timestamps and
   the speaker labels for free.

And the cost picture is, frankly, not the problem:

| | Cost per meeting-hour |
|---|---|
| Cheapest credible cascade (Soniox STT + cheap LLM MT + browser TTS) | **≈ $0.13** |
| Same + Azure neural TTS | **≈ $0.88** |
| Single-API Soniox real-time speech translation | **$0.18** |
| Single-API OpenAI `gpt-realtime-translate` | **$2.04** |
| Bot route (Recall recording + STT + perfect diarization) | **$0.65–$1.50** |
| **Nearest commercial AI-interpretation product (Wordly)** | **≈ $150.00** `[VERIFIED wordly.ai/pricing: "$1,500 for a 10-hour package"]` |

**Two orders of magnitude of headroom.** Quality on Vietnamese meeting audio is the binding constraint — not price.

### 7.2 Three concrete build options, ranked

#### ✅ OPTION 1 — RECOMMENDED FIRST: "Browser tab capture + Soniox + cascade + MoM"
**Get the whole pipeline working end-to-end at the lowest possible cost, using the app fBuddy already ships.**

| | |
|---|---|
| **Capture** | `getDisplayMedia({audio:true, video:true})` with `preferCurrentTab:true`, `selfBrowserSurface:"exclude"`; user picks the Google-Meet / Zoom-web tab. **AudioWorklet → 16 kHz 16-bit mono PCM → 100 ms frames** |
| **STT** | **Soniox real-time** (`$0.12/hr`) **or** Deepgram Nova-3 `language=vi` (`$0.288/hr` promo, on the **$200 free credit**) — whichever wins the Vietnamese spike |
| **Translation** | **Cascade via text LLM**, delta-only, committed segments only. Reuse fBuddy's existing provider adapters + knowledge-block injection for glossary/names/pronouns |
| **TTS** | Optional. **Browser `SpeechSynthesis` first (free)**; upgrade to Azure neural ($0.75/hr) later |
| **MoM** | Rolling (SCM-style) every ~5 min during; hierarchical topic-segmented + parallel action-item extraction after |
| **Effort** | 🟢 **Low** — no new install, no native code, no bot infrastructure. Reuses the existing adapter layer, knowledge blocks and conversation storage |
| **Cost** | **$0.12–$0.30 / meeting-hour**; effectively **$0** for a pilot on the Deepgram/Speechmatics credits |
| **Quality** | Captions **1.0–1.8 s** behind (better than a human interpreter's 2–4 s ear–voice span). **Generic `SPEAKER_00` labels** |
| **Limits** | Tab-scoped; picker **every** meeting; **no desktop Zoom/Teams app**; no unattended capture; no mobile |
| **Ships the whole pipeline?** | ✅ **Yes** — capture, STT, MT, TTS, rolling MoM, final MoM, transcript storage |

**Why this first:** it proves or kills *every* hard unknown (Vietnamese STT quality, translation quality,
latency, MoM quality) for ~$0 and without native development. If Vietnamese STT quality is poor, you find out in
week one instead of after building a Windows app.

#### 🟢 OPTION 0 — "Free validation sprint" (do this in parallel, it takes days)
**Upload a recording → MoM, entirely on free tiers.** Cloudflare Workers AI Whisper-large-v3-turbo gives
**≈ 214 audio-min/day free** (10,000 neurons ÷ 46.63) — comfortably one 1-hour meeting plus edits per day — and
the LLM is R-001's OpenRouter `:free` pool. **Zero cost, zero billing relationship.**
Its purpose is narrow and valuable: **establish the MoM quality bar** (summary, decisions, action items with
owners) on real Vietnamese transcripts, which is the genuinely hard product problem. Its limitation is equally
clear — **no diarization on any free STT**, so action items cannot have owners. Build it anyway, and treat the
missing owners as the evidence that justifies paying $0.12/hr.

#### 🔶 OPTION 2 — "Product-grade: Windows desktop overlay"
**The route that actually captures every meeting, once Option 1 has proved the pipeline.**

| | |
|---|---|
| **Capture** | Windows: **WASAPI loopback** (`AUDCLNT_STREAMFLAGS_LOOPBACK`, **no driver install, no reboot, no OS prompt**) — and prefer **process loopback** (`ActivateAudioInterfaceAsync` + `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK`, **documented floor Windows 10 build 20348**; gate at runtime, fall back to system loopback) so you capture Zoom's audio and not Spotify's. macOS: **Core Audio process taps** (`CATapDescription` + `AudioHardwareCreateProcessTap`, **macOS 14.2+**, driver-free, but needs `NSAudioCaptureUsageDescription` **and** a system permission prompt) |
| **STT/MT/TTS/MoM** | Identical to Option 1 — the pipeline is already built and proven |
| **Effort** | 🟠 **High** — native app, installer, code-signing, auto-update, cross-platform audio stacks |
| **Cost** | **$0.12–$0.50 / meeting-hour** (no bot fee at all) |
| **Quality** | Captures **anything** — Zoom, Teams, Meet, Webex, a VoIP call, a video. Still **one mixed stream → machine diarization** (`SPEAKER_00`) |
| **Build vs buy** | **Recall.ai's Desktop Recording SDK is priced at the same $0.50/hr as its bot API** `[VERIFIED recall.ai/pricing]` — a legitimate shortcut that trades margin for speed |
| **Why it matters** | This is the only route that survives the **Zoom OBF change of 2 March 2026** (§5.2) — a host leaving the meeting kills a Meeting-SDK bot's recording |

**Crucial add-on for Option 2:** because you only get `SPEAKER_00`, you must build the naming layer. Do it with
**manual UI naming + calendar attendee matching + self-introduction detection** (§4.6) — cheap, effective, and
**no extra legal weight**. **Defer voice enrolment**: under Vietnam's PDPL, using voice to *identify* a person
makes it **biometric sensitive personal data**, with a 72-hour dual breach-notification duty and 5-year
breach-record retention (§5.4). That is not a feature you add casually for a small accuracy gain.

#### ⚪ OPTION 3 — "Meeting bot" (defer until enterprise demand is proven)
Best *quality* (real participant names via perfect/hybrid diarization) and the only unattended, invite-only
option. **Recall.ai $0.50/hr** (first 5 hours free) or **Attendee $0.50/hr** (5 hours free, self-hostable).
But: **$0.65–$1.50/meeting-hour** all-in, a **visible bot in every call** (a legal and social footprint
Vietnamese customers may reject), Zoom OBF/RTMS onboarding on the critical path, and platform-specific gaps
(no separate real-time audio on Webex/Slack Huddles/GoTo). **Not the first thing to build.**

### 7.3 Recommended sequence

```
Week 0   OPTION 0 — free upload→MoM. Establishes the MoM quality bar and the eval set.        $0
Week 1-2 VIETNAMESE SPIKE (see §7.4 #1) — pick the STT vendor on evidence, not marketing.    ~$0 (credits)
Week 2-4 OPTION 1 — browser tab capture + cascade + live captions + rolling MoM.            ~$0.12/hr
Week 5+  Slide into OPTION 2 (Windows first) once Vietnamese quality is proven.              native work
Later    OPTION 3 only when a customer needs unattended capture or real names.               $0.65+/hr
```

### 7.4 Risky unknowns that need a spike BEFORE committing

Ordered by how much they would change the plan.

| # | Unknown | Why it could invalidate the plan | How to spike it | Cost |
|---|---|---|---|---|
| **1** | 🔴 **Vietnamese streaming STT quality on real, accented, code-switched meeting audio** | **The single biggest risk in the whole feature.** No provider publishes Vietnamese WER on conversational audio. The two per-language WER tables that exist (ElevenLabs "≤5%", AssemblyAI "10–25%") are for *batch* models on unstated audio. If VN streaming accuracy is bad, none of the cost analysis matters | Record a **real 30-minute internal Vietnamese meeting** containing English terms (`deadline`, `budget`, `OK`, product names) and a mix of North/Central/South accents. Score **WER** for: Soniox `stt-rt-v5`, Deepgram `nova-3 language=vi`, ElevenLabs Scribe v2 Realtime, Speechmatics Real-time. **Also score diarization DER** on the same file with a hand-labelled 2-speaker subset | Free credits cover it |
| **2** | 🔴 **Vietnamese token multiplier** | Decides whether MoM needs chunking at all, and therefore the whole MoM architecture (§4.4). Currently an **estimate**, not a measurement | Take 3 real VN transcripts, tokenize with the **exact tokenizer of the chosen model**, compute tokens/hour. Compare to English. **One afternoon of work that de-risks a major design decision** | ~$0 |
| **3** | 🟠 **Does browser tab capture actually deliver usable audio in practice?** | Option 1's entire capture path. `getDisplayMedia` returning **no audio track at all** is documented as possible | Build the 50-line spike: capture a Google Meet tab in Chrome/Edge/Safari, confirm an audio track exists, confirm remote participants are audible in it, confirm it survives the tab being backgrounded for 10 minutes | ~$0 |
| **4** | 🟠 **End-to-end latency from Vietnam to the STT edge** | Deepgram publishes 20–200 ms network transit; Vietnam↔US is at the bad end. A 400 ms penalty may push captions past the usable threshold | Measure real transcript latency (Deepgram publishes the exact method: track interim transcript cursor vs audio-sent cursor) from a Vietnamese network, and compare a US region against an Asia/Singapore region if the vendor offers one | ~$0 |
| **5** | 🟠 **Soniox's mid-sentence EN↔VI code-switching claim** | Soniox is the leading cost/quality candidate *specifically because* it claims mid-sentence language switching. Deepgram's `language=multi` **excludes Vietnamese**, so if Soniox's claim doesn't hold, there is **no cheap code-switching option left** | Same 30-min VN/EN mixed recording; inspect whether English terms survive inside Vietnamese sentences without being mangled into Vietnamese phonetics | covered by #1 |
| **6** | 🟠 **Vietnamese pronoun/register handling (anh/chị/em/ông/bà)** | Determines whether machine translation is *usable* or merely *comprehensible* in a business setting — and it is a differentiator a generic English-first competitor will not have | Build a 20-sentence VI↔EN meeting test set. Compare **cascade + LLM with speaker context** vs Azure Translator vs DeepL, scored by a native speaker on register appropriateness | ~$0 |
| **7** | 🟡 **Speaker naming without voice enrolment** | The main quality gap of the desktop-overlay route; determines how good the MoM can be | Prototype self-introduction detection ("xin chào, tôi là…") + calendar attendee matching on the 30-min recording; measure how many of the `SPEAKER_00` labels get correct names | ~$0 |
| **8** | 🟡 **Action-item extraction precision/recall with evidence-anchoring** | The MoM's core value. If it hallucinates owners or dates, the feature is worse than useless | Hand-label action items + owners + due dates in 2 real meetings. Measure precision/recall with and without the "require verbatim quote + timestamp" constraint and with/without two-stage locate-then-extract | ~$0 |
| **9** | 🟡 **Vietnamese legal opinion: is a voice recording sensitive biometric data?** | If **voice enrolment** is on the roadmap, the entire compliance tier changes (72-hour dual breach notice, access controls, 5-year records). Also decides the **consent UX** and whether the **TIA filing with A05** is on the critical path | Engage Vietnamese counsel. Questions: (a) does a meeting recording become *sensitive* biometric data absent identification? (b) does the TIA 60-day clock start at first transfer? (c) is the in-call announcement sufficient consent, or is a logged per-participant affirmative act required? | legal fees |
| **10** | 🟡 **Does the platform's own recording notice satisfy our consent duty, or is our own required on top?** | Affects UX and liability. Teams is fully verified; Zoom partially; **Google Meet pages were unreachable** | Re-fetch Zoom/Google Meet recording-notice docs; ask counsel whether the platform notice covers *our* processing purpose | ~$0 |
| **11** | 🟡 **Groq's actual current pricing and free-tier terms** | Groq at $0.00027/min is the cheapest STT by 6× and would be the default for the free path — but **`console.groq.com` returns HTTP 403 from this environment and groq.com no longer publishes an STT price table** | Fetch from a network that can reach console.groq.com, or ask Groq | ~$0 |
| **12** | 🟢 **`Web Speech API` Vietnamese availability** | Determines whether a truly free "translate my own voice" demo is possible as a marketing hook. Chrome routes audio to Google servers; availability of `vi-VN` is **not documented** | Try `SpeechRecognition` with `lang='vi-VN'` in Chrome/Edge/Safari and check whether it transcribes at all | ~$0 |
| **13** | 🟠 **Does voice enrolment push you over Vietnam's "important data" threshold?** | If voice identification makes you a **sensitive**-data processor, the Data Law's "important data" threshold is only **10,000** Vietnamese citizens (100,000 → "core data"), the startup **grace period is void**, and a breach means **72-hour notice to MPS *and* the subjects**. This is a *product-scope* decision, not a legal formality — it decides whether speaker naming can use voice at all | Ask counsel: (a) does *any* voice-derived speaker label count as "used to identify"? (b) do the Data Law and PDPL TIA obligations stack? (c) is the 100,000-subject grace-period trigger per-tenant or aggregate? | legal fees |
| **14** | 🟠 **EU AI Act — is the generated minutes document a "synthetic text" requiring machine-readable marking?** | **The AI Act's main body applies from 2 August 2026.** Art. 50(2) exempts content that performs *"an assistive function for standard editing"* or does *"not substantially alter the input data"*. A faithful extractive summary likely qualifies; a generative narrative minutes document likely does not — and **synthetic translated voice is plausibly a "deep fake" under Art. 50(4)**. Getting this wrong means retrofitting provenance marking (C2PA-style) plus new disclosure UX | Legal read on the Art. 50(2) carve-out against your actual prompt/output design; decide now whether to adopt provenance marking, because it is cheap to design in and expensive to bolt on | legal + 2 days eng |
| **15** | 🟢 **Zoom OBF/RTMS onboarding time** — only if Option 3 is chosen | Zoom OBF requires per-user OAuth with `user:read:token` **plus a Marketplace review**; review duration is on the critical path | Start the Marketplace review early, or decide now to skip the bot route | ~$0 |

### 7.5 Cách tự kiểm chứng lại / how to re-verify today's numbers

All prices were fetched **20/09/2026** (the deeper vendor/legal pass was fetched **19/09/2026**). To re-verify:

```bash
# --- STT / TTS pricing (these worked from this environment) ---
curl -sL https://deepgram.com/pricing | node strip.mjs - | grep -E '\$0\.|Diariz|Nova-3'
curl -sL https://soniox.com/pricing/ | node strip.mjs - | grep -E '\$|hour'
curl -sL https://www.speechmatics.com/pricing | node strip.mjs - | grep -E '\$0\.|concurrent'
curl -sL https://elevenlabs.io/pricing/api | node strip.mjs - | grep -iE 'scribe|Price per hour'
curl -sL https://gladia.io/pricing | node strip.mjs - | grep -E '\$0\.|free credit'
curl -sL https://deepinfra.com/pricing  # JS-rendered; use the API instead
curl -sL https://developers.cloudflare.com/workers-ai/platform/pricing/ | node strip.mjs - | grep -iE 'whisper|neuron'

# --- Deepgram docs: append .md to ANY docs URL (a huge shortcut) ---
curl -sL https://developers.deepgram.com/llms.txt | head -50
curl -sL https://developers.deepgram.com/docs/measuring-streaming-latency.md
curl -sL https://developers.deepgram.com/docs/models-languages-overview.md   # check 'Vietnamese: vi'
curl -sL https://developers.deepgram.com/docs/diarization.md                  # v2 is batch-only

# --- Azure: the retail prices API gives machine-readable list prices ---
curl -s "https://prices.azure.com/api/retail/prices?\$filter=contains(productName,'Speech')" \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));for(const i of d.Items)if(/Speech To Text|Speech Translation|Live Interpreter/.test(i.meterName))console.log(i.meterName,i.retailPrice,i.unitOfMeasure)'

# --- OpenRouter: live model pricing for the LLM MT layer ---
curl -s https://openrouter.ai/api/v1/models | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));for(const m of d.data)if(/gemini-2\.5-flash-lite|voxtral/.test(m.id))console.log(m.id,m.pricing.prompt,m.pricing.completion)'

# --- OSS repo health ---
curl -s https://api.github.com/repos/SYSTRAN/faster-whisper | grep -E 'stargazers_count|pushed_at'
curl -s https://api.github.com/repos/m-bain/whisperX | grep -E 'stargazers_count|pushed_at'
curl -s https://api.github.com/repos/pyannote/pyannote-audio | grep -E 'stargazers_count|pushed_at'
```

**Unreachable from this environment — do not treat as verified:** `ai.google.dev`, `cloud.google.com`,
`docs.cloud.google.com`, `console.groq.com` (403), `platform.openai.com` (403), `openai.com` (403),
`docs.mistral.ai`, `huggingface.co`, `raw.githubusercontent.com`, `export.arxiv.org/api` (search only —
individual `arxiv.org/abs/<id>` pages work), `developer.chrome.com` (timeout),
`thuvienphapluat.vn` / `luatvietnam.vn` / `vanban.chinhphu.vn` (the **primary Vietnamese statute text was never
read** — all Vietnamese legal findings rest on DLA Piper, Tilleke & Gibbins, Rouse, Freshfields and Chambers
summaries).

> ### Final word
> The feature is **feasible, cheap and architecturally natural for fBuddy** — the cascade maps directly onto the
> adapter layer, the knowledge-block prompt sections and the existing conversation storage. The translation
> economics ($0.13–$0.18 per meeting-hour against a $150/hour commercial benchmark) are extraordinary.
> **Everything hinges on one measurement: how well streaming STT handles real Vietnamese meeting audio with
> English code-switching.** Do that spike first, on free credits, before writing any product code.
