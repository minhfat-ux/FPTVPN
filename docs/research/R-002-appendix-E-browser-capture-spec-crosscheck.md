# Browser Live-Audio-Capture Capability Report (subagent draft, prioritised)

**Fetch date: 2026-09-20 (local, CST / UTC+8) = 2026-09-19 UTC.** All pages below were actually fetched by `curl` on that date via `/tmp/research/fetch.sh` (curl + text strip), unless a row explicitly says otherwise.

**Evidence markers**

| Marker | Meaning |
|---|---|
| **VERIFIED** | I fetched that exact page today and the claim is stated on it. URL given. |
| **UNVERIFIED** | Could not fetch, OR the claim is my engineering inference / recalled knowledge, not read from a page today. |
| **BOTH** | Page read today *and* the conclusion requires an inference step (stated inline). |

**Network reachability (measured today, `curl -o /dev/null -w %{http_code}`)**

| Host | Result | Consequence |
|---|---|---|
| `developer.mozilla.org` | 200 | primary source, used heavily |
| `caniuse.com` | 200 | used for per-option compat tables |
| `w3.org`, `w3c.github.io` | 200 | specs used as primary |
| `webkit.org`, `bugs.webkit.org` | 200 | WebKit bug used |
| `bugzilla.mozilla.org` (REST API) | 200 | Firefox bugs used |
| `cdn.jsdelivr.net` (npm + `gh/`) | 200 | used for MDN BCD JSON + MDN content source |
| `api.stackexchange.com` | 200 | used for SO Q&A bodies |
| `chromestatus.com` **API** (`/api/v0/features`) | 200 | used; the HTML UI is JS-rendered and yields ~1 line |
| **`developer.chrome.com`** | **000 (timeout, DNS resolves to 142.250.197.78)** | **COULD NOT FETCH** — Chrome's own docs are unavailable from this sandbox |
| **`issues.chromium.org`** | **000 (timeout)** | **COULD NOT FETCH** — no Chromium issue tracker access |
| **`bugs.chromium.org`** | 404 root; issue detail returns 200 but **body is JS-rendered → empty text** | **COULD NOT READ ISSUE CONTENT** |
| **`chromium.googlesource.com` / `source.chromium.org` / `googlesource.com`** | **000** | cannot read Chromium source |
| **`github.com` HTML, `raw.githubusercontent.com`, `raw.githack.com`** | 000 | GitHub *HTML* pages unreadable |
| `api.github.com` | 403 rate-limited (shared IP) | GitHub issue bodies unreadable |
| `stackoverflow.com` HTML | 403 | used the Stack Exchange **API** instead |
| `web.dev` | 000 | could not fetch |

> **Honest scope statement up front:** because `developer.chrome.com` and `issues.chromium.org` are unreachable from this sandbox, most Chrome-specific behaviour below rests on (a) MDN, (b) caniuse's mirror of MDN BCD, (c) the W3C spec, and (d) the `@types/chrome` typings (which embed Chrome's own doc comments). Where I had to rely on the typings or a vendor blog rather than Chrome's docs page, I say so. **I could not enumerate Chromium bug reports at all** — see §5.

---

## 0. Executive summary — the load-bearing conclusions

| # | Conclusion | Status |
|---|---|---|
| A | `getDisplayMedia({audio:true})` **produces no audio at all in Firefox and no audio at all in Safari** (desktop or mobile). Only Chromium (Chrome/Edge/Opera) implements it. | **VERIFIED** (MDN BCD) |
| B | Audio source availability is OS-gated in Chrome: **system audio only on Windows + Chrome OS**; on **macOS and Linux only *tab* audio**. | **VERIFIED** (MDN BCD note) |
| C | `getDisplayMedia` **cannot be driven without a user picking a surface.** Transient activation is a spec MUST, and no option bypasses the picker. Every surface option (`preferCurrentTab`, `selfBrowserSurface`, `systemAudio`, `surfaceSwitching`, `monitorTypeSurfaces`, `windowAudio`) is a **hint the UA MAY ignore** and is **Chromium-only**. | **VERIFIED** (W3C spec + caniuse/BCD) |
| D | To capture **tab audio with no picker**, the only supported path is a **browser extension** using `chrome.tabCapture` / `chrome.tabCapture.getMediaStreamId()` + `getUserMedia({mandatory:{chromeMediaSource:'tab', chromeMediaSourceId}})` **redeemed in an offscreen document**. Not possible from a plain web page. | **VERIFIED** (typings + vendor engineering write-up), see §2/§3 |
| E | Tab capture of a **same-browser Google Meet tab DOES include remote participants' audio** (that is the whole point of the known reference implementation). Tab capture does **not** include the local microphone. | **VERIFIED** (reference impl README + blog) |
| F | **MediaRecorder `timeslice` chunks are not guaranteed to be independently decodable** — the spec guarantees only that the *concatenation* is playable. So MediaRecorder is a poor fit for streaming discrete chunks to a WebSocket STT. | **VERIFIED** (W3C MediaStream Recording spec) |
| G | **Safari's MediaRecorder only supports `audio/mp4` + `video/mp4`** with `avc1`/`mp4a` codecs — **no WebM, no Opus** in MediaRecorder. | **BOTH** — a high-voted accepted SO answer quoting WebKit source; I could not re-read current WebKit source (see §2 caveat) |
| H | Raw PCM from **AudioWorklet at 16 kHz mono Int16 = 32 KB/s**; 48 kHz mono Float32 = 192 KB/s. | **VERIFIED** (arithmetic; rates from MDN process() docs) |
| I | `getDisplayMedia` is **entirely absent on mobile** (iOS Safari, Android Chrome, Firefox Android). | **VERIFIED** (caniuse + MDN BCD) |
| J | A mobile web app **cannot** capture a phone call's audio. Only the microphone via `getUserMedia` is available. | **BOTH** — platform absence is VERIFIED; the "why" is inference in §6 |

---

## 1. `getDisplayMedia()` AUDIO support matrix (TOP PRIORITY)

### 1.1 The single most important citation

**VERIFIED today via https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia** — but the compat *table* on that page is JS-rendered, so the actual data came from **MDN browser-compat-data (BCD) v8.1.2**, the upstream data source that renders it, fetched today via
`https://cdn.jsdelivr.net/npm/@mdn/browser-compat-data/api/MediaDevices.json`
(latest version confirmed `8.1.2` from `https://registry.npmjs.org/@mdn/browser-compat-data/latest`).

The decisive BCD entry is `api.MediaDevices.getDisplayMedia.audio-capture-support`. **Verbatim notes:**

> **chrome:** `74` — *"On Windows and Chrome OS the entire system audio can be captured, but on Linux and Mac only the audio of a tab can be captured."*
> **edge:** `≤79` — *"On Windows, the entire system audio can be captured, but on Linux and Mac only the audio of a tab can be captured."*
> **firefox:** `false`
> **safari:** `false`
> **chrome_android:** `false` · **safari_ios:** `false` · **firefox_android:** `false`

### 1.2 `getDisplayMedia` itself — support by platform

**VERIFIED** — MDN BCD `api.MediaDevices.getDisplayMedia` + `https://caniuse.com/mdn-api_mediadevices_getdisplaymedia` (fetched today).

| Browser | `getDisplayMedia` video | `getDisplayMedia` **audio** | Earliest version |
|---|---|---|---|
| Chrome (desktop) | ✅ | ✅ tab audio always; system audio Windows/ChromeOS only | 72 (video, as `Navigator` member in 70–71); audio 74 |
| Edge (desktop) | ✅ | ✅ same OS gating as Chrome | 79 |
| Firefox (desktop) | ✅ (66+; `mediaSource` from 33) | **❌ NO AUDIO** | 66 |
| Safari (desktop) | ✅ (13+) | **❌ NO AUDIO** | 13 |
| Chrome Android | **❌** | ❌ | — |
| Firefox Android | **❌** *"API is available, but will always fail with `NotAllowedError`"* | ❌ | — |
| Safari iOS | **❌** (caniuse: not supported through 27.2) | ❌ | — |

caniuse (`https://caniuse.com/mdn-api_mediadevices_getdisplaymedia`) corroborates: **Safari on iOS ❌ 3.2–27.2**, **Chrome for Android ❌ 152**, **Firefox for Android ❌ 155**, while desktop Safari ✅ 13–27.1 and Firefox ✅ 66+.

> **Interpretation (mine, stated as inference):** caniuse marks Firefox "Supported" for `getDisplayMedia` because *video* capture works. It is NOT evidence of audio support. The audio column comes from the BCD `audio-capture-support` entry, which is unambiguous: `firefox: false`, `safari: false`.

### 1.3 Corroboration from Firefox's own bug tracker

**VERIFIED today via `https://bugzilla.mozilla.org/rest/bug?quicksearch=getDisplayMedia%20audio`** (Bugzilla REST API, returned JSON):

| Bug | Summary | Status |
|---|---|---|
| **1541425** | **"Implement audio capture for getDisplayMedia"** | **NEW** (still unimplemented) |
| 1700730 | "Add a preference for disabling user gesture requirement for getDisplayMedia" | UNCONFIRMED |
| 1724865 | `InvalidStateError: "getDisplayMedia must be called from a user gesture handler"` in cross-origin iframe with `allow="camera; microphone; display-capture"` | NEW |

Bug 1541425 status **NEW** is direct evidence that **Firefox has never implemented gDM audio**. (This bug list was readable; the Chromium equivalent was not — see §5.)

### 1.4 What the spec says audio sources may be (and why it is deliberately unpredictable)

**VERIFIED via https://w3c.github.io/mediacapture-screen-share/** (editor's draft, fetched today), §"Capturing screen contents":

> *"In the case of audio, the user agent MAY present the end-user with audio sources to share. Which choices are available to choose from is up to the user agent, and **the audio source(s) are not necessarily the same as the video source(s)**. An audio source may be a particular window, browser, the entire system audio or any combination thereof. (…) the user agent is allowed **not to return audio even if the audio constraint is present**. If the user agent knows no audio will be shared for the lifetime of the stream it MUST NOT include an audio track in the resulting stream. (…) **The user agent MUST reject audio-only requests.**"*

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture** (page last modified *Sep 10, 2026*):

> *"Capturing audio is always optional, and even when web content requests a stream with both audio and video, the returned MediaStream may still have only one video track, with no audio."*

**Consequence for your feature:** you must code the "no audio track came back" branch on every platform, including Chrome/Edge. `audio: true` is a request, never a guarantee.

---

## 2. Can you capture TAB audio WITHOUT the user picking "This Tab"? (TOP PRIORITY)

### 2.1 Answer: **No — not from a plain web page. Yes — from an extension.**

| Route | Bypasses picker? | Verdict |
|---|---|---|
| `getDisplayMedia({audio:true})` from a web page | **NO** | Spec requires transient activation and a user-chosen surface |
| `getDisplayMedia` + `preferCurrentTab:true` | **NO** | Only makes the current tab *more prominent in the picker*; user still picks and still confirms |
| `getDisplayMedia` + `selfBrowserSurface:"exclude"` | **NO** | It **hides** the current tab from the picker — the opposite of what you want |
| `getDisplayMedia` + `systemAudio:"include"` | **NO** | Only affects whether *system* audio is **offered**, and only for a **monitor** share |
| `display-capture` iframe permission policy | **NO** | It *grants* the capability; it does not remove the picker |
| `chrome.tabCapture.capture()` (extension) | **YES** | Captures the active tab directly |
| `chrome.tabCapture.getMediaStreamId()` (extension) | **YES** | Stream id, no picker |

### 2.2 Spec-level prohibition on bypassing the picker

**VERIFIED via https://w3c.github.io/mediacapture-screen-share/** and the **W3C Working Draft 27 August 2026** (`https://www.w3.org/TR/screen-capture/`, fetched today):

- The algorithm: *"If the relevant global object of this does not have **transient activation**, return a promise rejected with a `DOMException` … `InvalidStateError`."*
- *"The user agent **MUST still offer the user unlimited choice** of any display surface."* And earlier: *"The specified options **can't be used to limit the choices** available to the user. Instead, they must be applied after the user chooses a source."*
- `selfBrowserSurface`: *"The user agent **MAY ignore this hint**."*
- `systemAudio`: *"signals whether the application would like system audio to be included among the possible audio sources offered to the user for **monitor** display surfaces. The user agent **MAY ignore this hint**."*

**VERIFIED via MDN `getDisplayMedia`** (fetched today, page modified Sep 7, 2026), the security section:

> *"The go-ahead permission to use getDisplayMedia() **cannot be persisted for reuse**. **The user must be prompted for permission every time.** **Transient user activation is required.**"*

So: **there is no web-platform mechanism — none — that yields tab audio without a picker.** Preference is the only lever, and it is explicitly ignorable.

### 2.3 The per-option matrix (Chromium-only, desktop-only)

**VERIFIED today** via caniuse's mirror of MDN BCD, one page per option (all fetched): `https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_<option>_option`

| Option | Chrome | Edge | Firefox | Safari | Safari iOS | Chrome Android | Firefox Android |
|---|---|---|---|---|---|---|---|
| `preferCurrentTab` | ✅ **94+** | ✅ 94+ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `selfBrowserSurface` | ✅ **107–110**, ❌ **111**, ✅ **112+** | ✅ 107–110, ❌ 111, ✅ 112+ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `surfaceSwitching` | ✅ **107+** | ✅ 107+ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `systemAudio` | ✅ **105+** | ✅ 105+ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `monitorTypeSurfaces` | ✅ **119+** | ✅ 119+ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `windowAudio` | ◐ **partial 141+** | ◐ 141–142 then ❌ 143+ | ❌ | ❌ | ❌ | ❌ | ❌ |

Two things worth flagging:
- The odd **`selfBrowserSurface` gap at Chrome 111** is in the upstream BCD data (a recognised regression window). **VERIFIED** as data; the *cause* is UNVERIFIED.
- `preferCurrentTab` shipped in **Chrome 94**, not 107 as is often assumed. **VERIFIED.**

### 2.4 `preferCurrentTab` is NOT in the spec at all

**VERIFIED** by direct search of both fetched spec documents today:

```
grep -c -i "preferCurrentTab" w3c-screen-share-spec.txt   -> 0
grep -c -i "preferCurrentTab" w3c-screen-capture-TR.txt   -> 0
```

It appears only in MDN prose (`mdn-gdm.txt`, `mdn-using-scr-cap.txt`) — MDN documents browser reality, not a standard. **`preferCurrentTab` is a non-standard, Chrome-only extension.** Semantics per **VERIFIED** MDN:

> *"a value of `true` instructs the browser to offer the current tab as the **most prominent** capture source, that is, as a separate `"This Tab"` option in the `"Choose what to share"` options presented to the user."*

Note "most prominent option in the picker" — **not** "chosen automatically".

### 2.5 `systemAudio` — semantics, and the Chrome-only Windows limit

**VERIFIED via chromestatus API** (HTML page is JS-rendered; I used the JSON API): `https://chromestatus.com/api/v0/features/4649448880734208` for `DisplayMediaStreamConstraints.systemAudio`, updated 2025-08-22, spec `https://github.com/w3c/mediacapture-screen-share/pull/222/files`:

> *"Hint indicating to the user agent whether the application, upon calling getDisplayMedia() with {systemAudio: true}, wishes **system audio** to be offered to the user. (**If not — only offer tab-audio.**)"*

**This is the key nuance:** `systemAudio` gates **system** audio only. Tab audio is a separate, always-eligible source. **VERIFIED** corroboration in MDN `getDisplayMedia`:

> *"In Chrome (documentation), `systemAudio: "include"` does not guarantee that system audio will be available, but `systemAudio: "exclude"` prevents system audio from being offered when sharing a screen (**audio from a shared browser tab or window may still be available**)."*

And **VERIFIED** in the spec — `SystemAudioPreferenceEnum`:

> *"Describes whether an application invoking getDisplayMedia() would like the user agent to include system audio among the audio sources offered to the user for **monitor display surfaces**. **Does not apply to any other type of display surface.**"*

So your belief is **correct**: `systemAudio` matters for whole-screen sharing, and per MDN BCD the *system-audio* capability is **Windows + Chrome OS only**; macOS/Linux get **tab audio only**. **VERIFIED.**

A newer option, `windowAudio` (`"system" | "window" | "exclude"`), is the window-scoped analogue — **VERIFIED** in the spec and MDN, but only **partial in Chrome 141+** and absent elsewhere.

### 2.6 The one real picker bypass: `chrome.tabCapture` (extension only)

**VERIFIED today** via `https://cdn.jsdelivr.net/npm/@types/chrome/index.d.ts` (fetched, 776 KB). This file embeds **Chrome's own documentation comments**, so it is a faithful mirror of the unreachable `developer.chrome.com` reference page. Verbatim:

```
/** Use the `chrome.tabCapture` API to interact with tab media streams.
 *  Permissions: "tabCapture" */
export namespace tabCapture {

  interface CaptureOptions { audio?: boolean; video?: boolean;
                             audioConstraints?: MediaStreamConstraint;
                             videoConstraints?: MediaStreamConstraint; }

  /** @since Chrome 71 */
  interface GetMediaStreamOptions {
    /** Optional tab id of the tab which will later invoke `getUserMedia()` to consume
     *  the stream. If not specified then the resulting stream can be used only by the
     *  calling extension. ... The tab's origin must be a secure origin, e.g. HTTPS. */
    consumerTabId?: number;
    /** Optional tab id of the tab which will be captured. If not specified then the
     *  current active tab will be selected. Only tabs for which the extension has been
     *  granted the `activeTab` permission can be used as the target tab. */
    targetTabId?: number;
  }

  /** Captures the visible area of the currently active tab. Capture can only be started
   *  on the currently active tab after the extension has been invoked, similar to the way
   *  that activeTab works. Capture is maintained across page navigations within the tab,
   *  and stops when the tab is closed, or the media stream is closed by the extension. */
  function capture(options: CaptureOptions, callback: (stream: MediaStream|null) => void): void;

  /** Creates a stream ID to capture the target tab. Similar to chrome.tabCapture.capture()
   *  but returns a media stream ID, instead of a media stream, to the consumer tab. */
  function getMediaStreamId(options?: GetMediaStreamOptions): Promise<string>;   // Promise since Chrome 116
}
```

**Critical side-effect — VERIFIED** in the same file, `chrome.tabs.MutedInfoReason`:

```
enum MutedInfoReason {
  USER = "user",
  /** Tab capture was started, forcing a muted state change. */
  CAPTURE = "capture",
  EXTENSION = "extension",
}
```

> **Starting a tab capture changes the tab's mute state.** This is a documented, first-class reason value — direct evidence for the "the original tab goes silent / the audio track behaves oddly once capture starts" class of bug reports (§5).

### 2.7 `chromeMediaSource` bridge — the extension→page handoff

**VERIFIED** (practitioner engineering write-up, not a spec): `https://www.recall.ai/blog/how-to-build-a-chrome-recording-extension` — fetched today, 32 KB, **published November 3, 2025, updated September 14, 2026**. This is a production vendor blog describing exactly your feature, so treat as strong practitioner evidence rather than normative. Verbatim:

> *"Chrome doesn't let webpages capture system audio for all OSes, and background scripts can't hold active media streams. If you want to record the actual video and audio your user experiences in the Google Meet tab **without a picker**, there is exactly one supported path: a Chrome extension using `chrome.tabCapture`."*
>
> *"we have to use extension-only media capture APIs because **Chrome doesn't grant standard JavaScript websites without special privileges access to tab audio without a picker**."*
>
> *"**Chrome's tabCapture works in two stages:** The background.ts requests a temporary stream ID. **Chrome only grants this after a user gesture.** The stream ID is not media, it only works inside extension contexts. (…) The offscreen document **redeems** the stream ID for the actual tab audio and video."*

The redemption call (**VERIFIED** as quoted on that page):

```js
// offscreen.ts
audio: {
  mandatory: {
    chromeMediaSource: 'tab',
    chromeMediaSourceId: streamId,
  }
}
// (and video: {mandatory: {chromeMediaSource:'tab', chromeMediaSourceId: streamId}})
```

Note the `chromeMediaSource` / `chromeMediaSourceId` constraints are **non-standard and not present in `@types/chrome`'s typed surface** (I grepped the typings for `chromeMediaSource` — **zero hits**, **VERIFIED by absence**), which is why the blog passes them through the untyped `mandatory` object.

Also **VERIFIED** from `@types/chrome`: `chrome.tabCapture.getMediaStreamId` **returns a Promise since Chrome 116**; the `capture()`/`getMediaStreamId()` callback forms are older.

### 2.8 Manifest V3 architectural constraints (practitioner-verified)

**VERIFIED** via `https://cdn.jsdelivr.net/gh/recallai/chrome-recording-transcription-extension@main/README.md` (fetched today) — a real, working reference implementation whose stated purpose is *"record the current Google Meet tab (video + audio) to a `.webm` file"*:

- Permissions used: `activeTab`, `downloads`, `tabCapture`, `offscreen`, `storage`, `tabs`, `desktopCapture`.
- **"MV3/Offscreen architecture – recording runs in a hidden offscreen document."**
- Flow: *"background service worker creates/coordinates an offscreen document and requests the correct capture streamId for the active tab. Offscreen page captures the tab, optionally mixes microphone audio, records, and hands the blob back."* (README, **VERIFIED**)
- Blog, **VERIFIED**: *"background scripts **can't hold active media streams**"* → hence the offscreen document; the offscreen document *"does have a DOM and can record audio/video, but only while it's explicitly opened."*

### 2.9 Fragility of the `getDisplayMedia` path, per the same practitioner source

**VERIFIED** (recall.ai blog, quotes):
- *"The captured stream is bound to the Google Meet tab and **may end immediately if the tab is reloaded or permissions change**."*
- *"**Make sure not to mute or stop the MediaStream in your code. Chrome interprets a disabled audio track as no sound/silence**, so your recording won't include remote voices."*
- Symptom table entry: *"Audio level meters (RMS) show 0.000 or silence" → "Audio is muted: Google Meet is silent or mixing broke"*.
- On the picker-based route being unsuitable for one-click: *"That makes it **unsuitable for an extension that needs one-click or reload-proof capture**."*

---

## 3. `MediaRecorder` vs WebCodecs — mimeTypes and chunk decodability (TOP PRIORITY)

### 3.1 `MediaRecorder.isTypeSupported()` — what MDN does and does NOT document

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static** (fetched today; page last modified **May 5, 2025**).

MDN gives a list of *example* strings but **publishes no per-browser support matrix for them**. From the page (**VERIFIED** verbatim sample list): `"audio/webm"`, `"audio/webm;codecs=opus"`, `"video/webm;codecs=vp8"`, `"video/mp4"`, `"video/mp4;codecs=avc1.64003E,mp4a.40.2"`, `"video/mp4;codecs=avc1.64003E,opus"`, etc.

Semantics (**VERIFIED**, verbatim): *"returns a Boolean which is `true` if the MIME media type specified is one the user agent should be able to successfully record"* and *"Recording may still fail if there are insufficient resources…"*.

> ⚠️ **Negative result, stated explicitly:** **There is no authoritative per-browser `isTypeSupported` table on MDN, and MDN BCD does not track MIME types at all.** I checked: `api/MediaRecorder.json` from BCD (fetched) contains interface/method/event entries but **no mimeType matrix**. So any "Safari supports X" claim must come from elsewhere. This is a genuine evidence gap — do not let anyone hand you a confident four-column opus table without a source.

### 3.2 Best available per-browser picture for Opus

| Container/codec string | Chrome/Edge | Firefox | Safari | Source |
|---|---|---|---|---|
| `audio/webm;codecs=opus` | ✅ | ✅ | **❌ (MediaRecorder: mp4 only)** | UNVERIFIED for Chrome/FF as a *MediaRecorder* claim; Safari from §3.3 |
| `audio/ogg;codecs=opus` | ✅ (recording) | ✅ | ❌ | UNVERIFIED as a MediaRecorder claim |
| `audio/mp4` (AAC / `mp4a`) | ✅ | ✅ (newer) | ✅ **the only option** | Safari **VERIFIED** §3.3 |
| Opus *codec* in general | ✅ 33+ | ✅ 15+ | ◐ partial | **VERIFIED** `https://caniuse.com/opus` |

**VERIFIED** caveat on the caniuse Opus row — its own footnote reads: *"Support refers to this format's use in the **audio element**, not other conditions."* So caniuse's Opus page is **not** evidence about MediaRecorder. Its table: Chrome ✅ 33+, Firefox ✅ 15+, Safari ◐ 11–27.2 (partial throughout, incl. Safari 27), Safari iOS ◐ 11–17.3, ✅ 18.4+.

### 3.3 Safari MediaRecorder — `audio/mp4` only

**BOTH.** Fetched today via Stack Exchange API: `https://api.stackexchange.com/2.3/questions/66902406/answers` (Q: *"Which MIME Types are supported by MediaRecorder on Safari?"*). Top answer **score 27, accepted**, quoting WebKit source:

> *"Currently, it seems only `audio/mp4` and `video/mp4` containers are supported, at least they're the only values that `MediaRecorder.isTypeSupported()` would return as valid: [source code] `if (!equalLettersIgnoringASCIICase(containerType, "audio/mp4") && !equalLettersIgnoringASCIICase(containerType, "video/mp4")) return false;` And then the only codecs that are accepted by this same method are **AVC1** for the video and **MP4A** for the audio: `if (!startsWithLettersIgnoringASCIICase(codec, "avc1") && !startsWithLettersIgnoringASCIICase(codec, "mp4a")) return false;`"*

**Caveat I must state:** this answer dates from ~2021 and I **could not** re-read current WebKit source to confirm it still holds in Safari 26/27 (WebKit source hosts are unreachable, §Header). Treat "Safari MediaRecorder = mp4/AAC only, no Opus/WebM" as **well-evidenced but not re-verified for 2026**. **Practical rule: always call `MediaRecorder.isTypeSupported()` at runtime, and never assume Opus availability.**

### 3.4 Timeslice chunks are NOT independently decodable — the decisive spec text

**VERIFIED via https://w3c.github.io/mediacapture-record/** (W3C MediaStream Recording spec, fetched today), §"start()", verbatim lines 271–278:

> *"The UA MUST record stream in such a way that the original Tracks can be retrieved at playback time. **When multiple Blobs are returned (because of timeslice or requestData()), the individual Blobs need not be playable, but the combination of all the Blobs from a completed recording MUST be playable.**"*

> *"If any Track within the MediaStream is **muted or not enabled** at any time, the UA will only record **black frames or silence** since that is the content produced by the Track."*

And on timing, verbatim line 252–254:

> *"If timeslice is not `undefined`, then once a **minimum** of `timeslice` milliseconds of data have been collected, **or some minimum time slice imposed by the UA, whichever is greater**, start gathering data into a new Blob…"*

Corroborated by **VERIFIED** MDN `MediaRecorder.start()`:

> *"Like other time values in web APIs, **timeslice is not exact** and the real intervals may be slightly longer due to other pending tasks before the creation of the next blob."*

**This is the crux of your Q4.** Three independent reasons MediaRecorder is wrong for chunked streaming to a WebSocket STT:

1. **Fragments are not self-contained files.** WebM/MP4 headers live in the first blob; later blobs may be undecodable alone. The spec only guarantees the *concatenation*.
2. **`timeslice` is a lower bound, not a schedule.** The UA may use a larger minimum — so your "every 250 ms" is not honoured.
3. **Explicitly-specified consequence:** blob boundaries are allowed to fall at non-frame boundaries, and a WebM cluster/EBML structure cannot be split arbitrarily without rewriting headers.

**Conclusion (mine, clearly inference):** MediaRecorder is acceptable for *recording to a file* or RTC-adjacent use; it is **not** a reliable substrate for "emit an independently-decodable Opus chunk every N ms to a WebSocket". If you must use it, send the **whole growing blob** to the server and let a server-side incremental WebM/Opus de-muxer do the framing — or better, use **WebCodecs `AudioEncoder`**, which hands you discrete `EncodedAudioChunk` objects with explicit timestamps.

### 3.5 WebCodecs `AudioEncoder` availability (the preferred encode path in Chromium)

**VERIFIED** `https://caniuse.com/webcodecs` (fetched today):

| Browser | Support |
|---|---|
| Chrome | ❌ 4–93, ✅ **94+** |
| Edge | ❌ 12–93, ✅ **94+** |
| Safari | ❌ 3.1–16.3, ◐ **16.4–18.7 partial**, ✅ **26.0+** |
| Safari iOS | ❌ 3.2–16.3, ◐ **16.4–18.7 partial**, ✅ **26.0+** |
| Firefox | ❌ 2–129, ✅ **130+** |

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API** (fetched today — page is a stub, 135 lines, mostly an index of interfaces). **VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/AudioEncoder** and `.../AudioEncoder/encode` (both fetched; also stubs). *Notable gap:* **WebCodecs interface pages are not present in the `@mdn/browser-compat-data` npm package** — I probed `api/AudioEncoder.json`, `api/AudioData.json`, `api/EncodedAudioChunk.json`, `api/WebCodecs_API.json` and **all returned 404** (**VERIFIED by failure**). So the caniuse rows above are the best compat data available, and Chrome-versus-Edge version skew cannot be checked per-interface.

**Net:** WebCodecs `AudioEncoder` is a real option on Chromium 94+, Firefox 130+, Safari 26+, but a **§3.5-style runtime feature-detect is mandatory**, and on older Safari (16.4–18.7) it is only partial.

### 3.6 Size and rate math

| Format | Bytes/sample | Samples/s | Bytes/s | KB/s (SI) | 60 s |
|---|---|---|---|---|---|
| 16 kHz mono **Int16** | 2 | 16 000 | **32 000** | **32 KB/s** | 1.92 MB |
| 16 kHz mono Float32 | 4 | 16 000 | 64 000 | 64 KB/s | 3.84 MB |
| 48 kHz mono **Float32** | 4 | 48 000 | **192 000** | **192 KB/s** | 11.52 MB |
| 48 kHz mono Int16 | 2 | 48 000 | 96 000 | 96 KB/s | 5.76 MB |
| 48 kHz stereo Float32 | 8 | 48 000 | 384 000 | 384 KB/s | 23.04 MB |

Your figures are **correct** (**VERIFIED** arithmetic): **16 kHz/16-bit mono = 32 KB/s**, **48 kHz Float32 = 192 KB/s**. **A 6× bandwidth reduction** from resampling to 16 kHz Int16, plus every STT worth using (Whisper-style) is natively 16 kHz anyway.

**WebSocket framing note (inference):** 32 KB/s = ~8 KB per 250 ms frame; negligible vs typical WebSocket overhead (~2–6 bytes/frame header client→server). At 192 KB/s Float32 you ship 48 KB per 250 ms frame — still fine on LAN/desktop but wasteful on mobile uplink, and you pay Float32→Int16 conversion server-side anyway. **Send 16 kHz Int16 mono PCM and do the downsample client-side.**

---

## 4. AudioWorklet specifics (TOP PRIORITY)

### 4.1 128-frame quantum

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process** (fetched today; page last modified **Oct 30, 2025**), verbatim:

> *"The method is called **synchronously from the audio rendering thread**, once for each block of audio (also known as a rendering quantum) being directed through the processor's corresponding AudioWorkletNode."*
>
> *"**Currently, audio data blocks are always 128 frames long** — that is, they contain 128 32-bit floating-point samples for each of the inputs' channels. However, plans are already in place to revise the specification to allow the size of the audio blocks to be changed depending on circumstances (for example, if the audio hardware or CPU utilization is more efficient with larger block sizes). **Therefore, you must always check the size of the sample array rather than assuming a particular size.** This size may even be allowed to change over time, so you mustn't look at just the first block and assume the sample buffers will always be the same size."*

Signature (**VERIFIED**): `process(inputs, outputs, parameters)`; each channel is a `Float32Array` of 128 samples, range `[-1..1]`; `inputs[n][m][i]`.

**Derived (inference, arithmetic):**

| Context rate | Quanta/s | 250 ms blob = | Reasonable accumulate-to- |
|---|---|---|---|
| 48 000 Hz | **375 /s** | 94 quanta | ~12 000 frames |
| 16 000 Hz | **125 /s** | 31 quanta | ~4 000 frames |

So **do not post a message per `process()` call** — at 48 kHz that is 375 `postMessage` calls/s. Accumulate several quanta (e.g. 8–32 → 1024–4096 frames) and post one buffer. **Inference.**

### 4.2 Return value / lifetime — a real footgun

**VERIFIED** (MDN `process()`): *"Returning `true` forces the Web Audio API to keep the node alive, while returning `false` allows the browser to terminate the node if it is neither generating new audio data nor receiving data through its inputs."* And: *"**An absence of the return statement means that the method returns `undefined`, and as this is a falsy value, it is like returning `false`.** Omitting an explicit return statement may cause hard-to-detect problems for your nodes."*

Also (**VERIFIED**): *"If an uncaught error is thrown, the node will emit a **`processorerror`** event and **will output silence for the rest of its lifetime**."*

> **Actionable:** a capture worklet must `return true` (it is a sink/consumer whose input may momentarily be silent), and any throw inside `process()` permanently silences capture with only a `processorerror` to show for it. Wrap the body in `try/catch`.

### 4.3 Message passing & transferable ArrayBuffers

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode/port** (fetched today): the node exposes a `MessagePort`. **VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/postMessage** (fetched today): `postMessage(message, transfer)` exists, i.e. **the second `transfer` argument lets you transfer an `ArrayBuffer` rather than structured-clone it.**

**Inference (this is the standard, widely-used pattern, but I did not fetch a page that states it end-to-end today):** allocate a *pool* of `Float32Array` buffers in the worklet, `postMessage(buf, [buf.buffer])` to hand ownership to the main thread with **zero copy**, and have the main thread **transfer the buffer back** to the worklet when done. Without transfer, each post structured-clones the samples.

**Budget (inference, arithmetic):** at 48 kHz mono Float32, one 4096-frame buffer = 16 KB. Posting every ~85 ms costs 16 KB → same 192 KB/s raw traffic, but with **no copy** if transferred. The real risk is not bytes but **garbage-collection pressure** if you allocate a fresh `Float32Array` per quantum (375 small allocations/s) rather than reusing a pool.

**AudioWorklet inside a Worker:** **UNVERIFIED.** I did **not** find a page today stating whether `AudioWorklet` can be constructed in a dedicated worker context. `AudioWorklet` is exposed on `BaseAudioContext`; constructing a `BaseAudioContext` (let alone rendering audio) in a worker is historically not supported, and `OfflineAudioContext` in a worker is the usual workaround for *offline* processing only. **Do not rely on this without testing** — treat as an open question I did not resolve.

### 4.4 Does capture continue when the tab is hidden / backgrounded?

**This is the weakest-evidence area of my report, and I want to be blunt about it.** Here is exactly what I have:

| Claim | Status |
|---|---|
| `AudioContext.state` can be `"suspended"`, `"running"`, `"closed"`, **and `"interrupted"`** | **VERIFIED** — MDN `https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state` (fetched; page title "BaseAudioContext: state property") |
| On iOS Safari, leaving the page (switch tab / minimise / screen off) puts the AudioContext into **`"interrupted"`**, requiring an explicit `resume()` | **VERIFIED**, same MDN page, verbatim: *"In iOS Safari, when a user leaves the page (e.g., switches tabs, minimizes the browser, or turns off the screen) the audio context's state changes to `"interrupted"` and needs to be resumed."* Code sample given uses `if (audioCtx.state === "interrupted") audioCtx.resume().then(() => play())` |
| Interruption can be triggered by *"A conferencing or phone app on the same system requiring exclusive access to the device's audio hardware"* | **VERIFIED**, same page |
| Chrome-specific **timer** throttling in background tabs does not necessarily stop an `AudioContext` that is producing audio, but `postMessage` from a worklet to a *throttled* main thread can back up | **UNVERIFIED / inference.** I could **not** find a doc page confirming this today, and I could **not** search Chromium's tracker (§5) |
| Specific Chromium bug reports about AudioWorklet under backgrounding | **COULD NOT VERIFY** — `issues.chromium.org` unreachable; `bugs.chromium.org` bodies JS-rendered |

**What I *can* assert with evidence:** the Web Audio rendering thread is separate and `process()` runs *on* it (**VERIFIED** MDN), so the **audio graph itself is not subject to `setTimeout` clamping** — that is the important architectural point and it favours AudioWorklet over an `onaudioprocess`/timer design. But **the main-thread consumer must not be your only buffer**: if the main thread is throttled, transferred buffers queue. **Design implication (inference): buffer generously in the worklet and treat main-thread delivery as best-effort**, or move the socket send into a Web Worker if you can establish that the worklet→worker path works in your target browsers (unresolved, above).

### 4.5 ScriptProcessorNode deprecation

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode** (fetched today). I also fetched **`https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet`** (fetched; **thin page — only 46 stripped lines**, no deprecation prose captured) and **`https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode`**.

**VERIFIED** support windows from `https://caniuse.com/mdn-api_audioworklet` (fetched today) — AudioWorklet, i.e. the replacement:

| Browser | AudioWorklet |
|---|---|
| Chrome | ❌ 4–65, ✅ **66+** |
| Edge | ❌ 12–18, ✅ **79+** |
| Firefox | ❌ 2–75, ✅ **76+** |
| Safari | ❌ 3.1–14, ✅ **14.1+** |
| Safari iOS | ❌ 3.2–14.4, ✅ **14.5+** |
| Global usage | 96.36% |

**VERIFIED** `https://caniuse.com/audio-api` (Web Audio API, fetched today): Chrome ✅ 14+, Safari ✅ 6+, Firefox ✅ 25+, global usage **97.02%**.

**Honest gap:** I fetched the MDN `ScriptProcessorNode` page but the stripped text did **not** contain an explicit "deprecated" sentence for me to quote — I am **not** going to fabricate one. What I can state: **AudioWorklet has been available in all four engines since Safari 14.1 / Firefox 76 (≈2021)**, so `ScriptProcessorNode` is avoidable everywhere your feature targets, and the MDN `process()` doc's insistence on the rendering thread (vs ScriptProcessorNode's buffered main-thread callback) is the substantive reason. **Marking the literal "ScriptProcessorNode is deprecated" wording as UNVERIFIED.**

---

## 5. Known browser BUGS (TOP PRIORITY) — and a candid account of what I could NOT do

### 5.1 What I could not do (please read this first)

| Target | Outcome |
|---|---|
| `issues.chromium.org` | **000 — host unreachable from this sandbox.** Zero issue data obtained. |
| `bugs.chromium.org` (root / list) | 404 / 302; an issue *detail* URL returned HTTP 200 but the extracted text was **empty** (JS-rendered SPA). **Zero issue bodies obtained.** |
| Chromium source (`chromium.googlesource.com`, `source.chromium.org`) | **000 — unreachable.** Could not read `media/`, `content/browser/media/capture/`, or Blink `GetDisplayMedia` code. |
| `api.github.com` | **403 rate-limited** (shared IP) — could not read the two GitHub *community discussions* that search surfaced on exactly this topic. |

**So: I did NOT find a single Chromium bug report first-hand.** Everything in §5.3 is either from a reachable tracker (Bugzilla/WebKit) or an **UNVERIFIED** pointer derived from search-result titles. Do not let this section be presented as a Chromium bug audit — it is not one.

### 5.2 Bugs I *did* verify on reachable trackers

**VERIFIED via `https://bugzilla.mozilla.org/rest/bug?quicksearch=getDisplayMedia%20audio` (fetch date 2026-09-20):**

| Bug | Summary | Status | Relevance |
|---|---|---|---|
| **1541425** | *Implement audio capture for getDisplayMedia* | **NEW** | Firefox gDM audio does not exist, and hasn't since 2019 |
| 1724865 | `InvalidStateError: "getDisplayMedia must be called from a user gesture handler"` in cross-origin iframe **with** `allow="camera; microphone; display-capture"` | NEW | **Even with the Permissions-Policy grant, the gesture requirement applies in iframes** — directly relevant to §7 |
| 1700730 | *Add a preference for disabling user gesture requirement for getDisplayMedia* | UNCONFIRMED | confirms the gesture requirement is not bypassable without a pref |
| 1557174 | *Deprecate non-spec mediaSource constraint (in favor of getDisplayMedia)* | NEW | `mediaSource` is legacy Firefox-only |
| 1772274 | *Memory leak of MediaDevices.getDisplayMedia()* | NEW | long sessions |
| 1614965 | *getDisplayMedia Popup does not automatically reflect newly opened or closed windows* | NEW | picker staleness |

**VERIFIED via `https://bugs.webkit.org/show_bug.cgi?id=208516` (fetched today, HTTP 200, 61 KB; status RESOLVED/FIXED, reported 2020-03-03, iOS 13.3.1):**

> **"Audio fails to capture stream in WebRTC if AudioSession gets interrupted"**
> Reproduction: after a Skype/Teams/FaceTime **phone call interrupts the AudioSession**, `getUserMedia` audio silently fails; the reporter ran
> `navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(stream => … console.log(track.getSettings().sampleRate))`
> and reported: *"**you'll see the sampleRate being always 0**"*, and *"from now on you can not use webrtc audio in safari, not even newly opened tabs"*. The report also mentions the device listing *"2 audio and 2 video tracks for the same interfaces"*, and references an earlier duplicate, **bug 180748** (2017).

This is a **concrete, first-hand bug report** tying together §4 (iOS interruption), §5 (audio capture dying), and §3 (sampleRate reporting `0`). Fixed per status, but it establishes the failure *mode* exists on iOS.

### 5.3 Reported symptom classes — evidence status

I break these out by how well I can actually support them, because your question listed four specific rumours.

**(a) "Echo cancellation mangles remote audio" — VERIFIED (mechanism), via a high-quality source.**
**VERIFIED** today via Stack Exchange API, `https://api.stackexchange.com/2.3/questions/55714629/answers` (Q: *"Audio from all users in a conference not captured while recording"*, answer score 2), verbatim:

> *"`navigator.mediaDevices.getUserMedia({audio: true})` gives you the **user's microphone**, not audio from their system. Their microphone might pick up some system audio, but there's no guarantee… The specific reason you're not hearing other participants is **`echoCancellation` is on by default in all browsers**. Without echo cancellation, when your mic picks up a remote speaker, their voice is immediately sent back to them, and they hear echo… you can turn off echoCancellation with: `await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false}});` or after the fact with: `await stream.getAudioTracks()[0].applyConstraints({echoCancellation: false});`"*

**Independently corroborated at spec level — VERIFIED** via `https://w3c.github.io/mediacapture-main/getusermedia.html`, which lists (verbatim) the UA default *"`echoCancellation` set to `true`"* among defaults *"chosen for their suitability for using RTCPeerConnection as a sink"*. And **VERIFIED** MDN `MediaTrackConstraints`: `echoCancellation` is a *`ConstrainBooleanOrDOMString`* — i.e. it can also take an *enum mode string*, not just `true`/`false`.

> **This is the single most actionable bug-class finding for you:** if you ever capture the mic to hear "the room" (e.g. a speakerphone call), **`echoCancellation` defaults to ON and will actively remove the remote participants' voices** — which is precisely the audio you want. Set `echoCancellation: false, noiseSuppression: false, autoGainControl: false` when capturing for STT, and verify via `getSettings()`.

**(b) "Audio track ends when the source tab is muted" / "tab audio drops after silence" — PARTIALLY VERIFIED.**
- **VERIFIED (mechanism, spec):** MediaStream Recording spec — *"If any Track … is **muted or not enabled** at any time, the UA will only record black frames or **silence**."* → a muted/disabled track yields **silence, not an ended stream**.
- **VERIFIED (mechanism, practitioner):** recall.ai blog — *"Chrome interprets a **disabled audio track as no sound/silence**, so your recording won't include remote voices."*
- **VERIFIED (related, chrome):** `MutedInfoReason.CAPTURE` = *"Tab capture was started, **forcing a muted state change**"* — tab capture itself mutates the tab's mute state.
- **VERIFIED (source of user-visible "silence" complaint):** recall.ai blog symptom table — *"Audio level meters (RMS) show 0.000 or silence" → "Google Meet is silent or mixing broke"*.
- **UNVERIFIED:** the specific Chromium bug ID(s) for "tab audio genuinely *ends* after silence". I could not open the tracker.

**(c) Safari `getDisplayMedia` audio — VERIFIED as "does not exist" rather than "buggy."**
BCD `audio-capture-support: safari: false` (**VERIFIED**), caniuse marks the **`systemAudio`/`preferCurrentTab`/etc. options all ❌ for Safari** (**VERIFIED**), and no MDN/BCD row shows Safari producing a gDM audio track. **Conclusion: on Safari, `getDisplayMedia({audio:true})` is a request for something the engine never provides — expect a video-only stream, not an error, and code the no-audio branch.** (Both `safari` and `safari_ios` are `false` in BCD.)

**(d) Chromium-specific tab-audio bugs — COULD NOT VERIFY.** Search surfaced titles/URLs such as *"Audio capture returns silence after plugging headphones during getDisplayMedia recording on Windows (issue 457269075)"* on `issues.chromium.org` and *"Original audio of tab gets muted while using `chrome.tabCapture.capture()` and `MediaRecorder()`"* on Stack Overflow — but **I fetched neither** (host unreachable / 403). **Treat both as leads to chase from a network that can reach `issues.chromium.org`, not as verified findings.**

**(e) AudioWorklet under backgrounding — COULD NOT VERIFY.** See §4.4. I found no first-hand bug report and no doc page.

---

## 6. iOS Safari `getUserMedia` limitations, and `getDisplayMedia` absence (TOP PRIORITY)

### 6.1 `getDisplayMedia` on mobile: absent, not merely restricted

**VERIFIED** (two independent sources fetched today):

| Platform | `getDisplayMedia` | Source |
|---|---|---|
| Safari iOS | **❌ not supported** (caniuse lists ❌ through **27.2**) | `https://caniuse.com/mdn-api_mediadevices_getdisplaymedia` |
| Safari iOS | `audio-capture-support: false`, and `getDisplayMedia: false` | MDN BCD `api/MediaDevices.json` |
| Chrome for Android | **❌** (❌ 152) | caniuse + BCD `chrome_android: false` |
| Firefox for Android | **❌** — BCD note: *"API is available, but **will always fail with `NotAllowedError`**"* | MDN BCD |
| Android Browser / Opera Mobile / Samsung Internet / UC | ❌ | caniuse |

**There is no mobile `getDisplayMedia`.** This is a hard platform absence, not a permission you can request. Note the Firefox Android nuance: the API *object exists* and is *callable*, and **always rejects** — so a naive `if (navigator.mediaDevices.getDisplayMedia)` feature-detect will **pass** on Firefox Android and then throw at call time. **Use a try/catch, not just a typeof check.**

### 6.2 `getUserMedia` on mobile is supported — that is the only mobile path

**VERIFIED** (MDN BCD `api/MediaDevices.getUserMedia`): **`safari_ios: 11`**, **`chrome_android: 53`**, **`firefox_android: 36`**, `secure_context_required: chrome 53, edge 79, firefox 68, chrome_android 53, firefox_android 68`.

**VERIFIED** via `https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia` (fetched today):
- *"Secure context: This feature is available only in secure contexts (HTTPS)."*
- *"Because both `video` and `audio` **default to `false`**, if the constraints object contains neither property or if it's not present at all, the returned promise will always reject."*
- *"`getUserMedia()` is a **powerful feature** that can only be used in secure contexts; in insecure contexts, **`navigator.mediaDevices` is `undefined`**."*
- *"A secure context is, in short, a page loaded using HTTPS or the `file:///` URL scheme, or a page loaded from `localhost`."*

### 6.3 Can a mobile web app capture a phone CALL's audio? **No.**

**This is inference built on verified platform facts** — I found no page today that says the sentence "you cannot capture a phone call" outright, so I flag the reasoning:

1. A cellular/VoIP call's audio is owned by the **OS telephony/audio stack**, not by the browser. It is not a `MediaStreamTrack` in your document. **Inference.**
2. The only audio a mobile web app can obtain is what `getUserMedia({audio:true})` returns: **the microphone**. **VERIFIED** (spec + MDN), and **VERIFIED** as the explicit statement in the SO answer quoted in §5.3(a): *"`getUserMedia({audio:true})` gives you the user's microphone, not audio from their system."*
3. `getDisplayMedia` (the only spec'd route to *non-microphone* audio) **does not exist on mobile** — §6.1. **VERIFIED.**
4. Therefore there is no web-platform API surface that reaches call audio. **Inference (strong).**
5. Even the "speakerphone + microphone" workaround is degraded: on iOS you are at the mercy of `AudioSession` interruptions (**VERIFIED** MDN `BaseAudioContext.state` and **VERIFIED** WebKit bug 208516, which shows capture returning `sampleRate: 0` and failing permanently after a call interruption).

**Realistic alternatives (inference):** speakerphone + mic with `echoCancellation:false`; or a **native app** with OS-level capture (Android `MediaProjection`/`AudioPlaybackCapture`, iOS lacks an equivalent for third-party apps); or OS/desktop-side capture (the recall.ai blog's own framing of "bot or desktop recording form factor" — **VERIFIED** as the vendor's stated alternative). None of these is a web page.

### 6.4 One audio track per device; `getCapabilities` absent in Firefox

- **VERIFIED** via MDN BCD (`api/MediaStreamTrack.json`, fetched): **`getCapabilities` — `firefox: false`, `firefox_android: false`** (all other engines ✅: chrome 66, edge 12, safari ✅). **So in Firefox you cannot enumerate a device's supported constraint ranges.** (Caveat below.)
- **CONFLICT I must report honestly:** the fetched MDN page `https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities` carries a "Baseline / widely available since October 2024" banner, which **contradicts** BCD 8.1.2's `firefox: false`. I could not resolve this (the compat table on the page is JS-rendered). **Flagging both; verify by running it in Firefox before depending on it.**
- `getConstraints` (**VERIFIED** BCD): `safari_ios: false` — *Safari on iOS does not implement `getConstraints()`*. On iOS you get `getSettings()` (available since iOS 11) but not the mirror-image `getConstraints()`.
- On "only one audio track": the WebKit bug 208516 attachment is titled **"Multiple audio tracks listed"** and the reporter describes *"at one point there are 2 audio and 2 video tracks for the same interfaces"* (**VERIFIED** as a 2020 iOS 13.3.1 report). This is a *listing* anomaly, not proof of a one-track limit. **I found no page today proving iOS is limited to one audio track — UNVERIFIED.**

---

## 7. Security / privacy: Permissions-Policy, secure context, indicators (TOP PRIORITY)

### 7.1 Secure context

**VERIFIED** — `https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia`, first line: *"**Secure context:** This feature is available only in secure contexts (HTTPS), in some or all supporting browsers."* Same for `getUserMedia` (§6.2). In an insecure context **`navigator.mediaDevices` is `undefined`** (**VERIFIED** MDN) — so a feature-detect fails cleanly rather than throwing.

### 7.2 `Permissions-Policy: display-capture`

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/display-capture** (fetched today; page last modified **Jul 4, 2025**), verbatim:

> *"The HTTP `Permissions-Policy` header **`display-capture`** directive controls whether or not the document is permitted to use Screen Capture API, that is, `getDisplayMedia()` to capture the screen's contents. If `display-capture` is disabled in a document, the document will not be able to initiate screen capture via `getDisplayMedia()` and **will throw a `NotAllowedError` exception**."*
> *"**Default policy:** The default allowlist for `display-capture` is **`self`**."*
> MDN flags it *"Experimental: This is an experimental technology"* and *"not Baseline"*.

**VERIFIED via MDN `Using_Screen_Capture`** (page modified Sep 10, 2026), verbatim:

> *"In order to function when Permissions Policy is enabled, you will need the `display-capture` permission. This can be done using the `Permissions-Policy` HTTP header or — if you're using the Screen Capture API in an `<iframe>` — the `<iframe>` element's `allow` attribute."*
> `Permissions-Policy: display-capture=(self)`
> `<iframe src="https://mycode.example.net/etc" allow="display-capture"> </iframe>`

**VERIFIED via MDN `Screen_Capture_API`** (fetched; page modified Jun 19, 2026): default allowlist for `display-capture` (and `captured-surface-control`) is **`self`**; these are *"considered **powerful features**, which means that **even if permission is allowed via a Permissions-Policy, the user will still be prompted** for permission to use them"*; and *"the specification requires that a user has **recently interacted with the page** — **transient activation is required**."*

**Consequences table:**

| Situation | Behaviour |
|---|---|
| Same-origin top-level page, HTTPS | Works; picker shown per call |
| Cross-origin iframe, no `allow=` | `NotAllowedError` |
| Cross-origin iframe with `allow="display-capture"` | Permitted, **but the transient-activation requirement still applies** — **VERIFIED** by Mozilla bug **1724865**, which reports exactly `InvalidStateError: "getDisplayMedia must be called from a user gesture handler"` in a cross-origin iframe **even with** `allow="camera; microphone; display-capture"` |
| HTTP (insecure) | `navigator.mediaDevices` is `undefined` |

**So yes — `display-capture` is needed** for iframes, and the default `self` means a same-origin-only embed works without headers. **Do not** widen it to `*`; the user prompt is still required, so widening buys nothing and only removes a defence.

### 7.3 Sharing indicator

**VERIFIED via MDN `Using_Screen_Capture`**, verbatim:

> *"While display capture is in effect, **the machine which is sharing screen contents will display some form of indicator so the user is aware that sharing is taking place**."*

**VERIFIED via the spec** (`w3c.github.io/mediacapture-screen-share` / W3C WD 2026-08-27), verbatim: *"The user agent is **strongly recommended to steer users away from sharing a monitor**, as this poses risks to user privacy."*

MDN notes on privacy (**VERIFIED**, verbatim):
- *"For privacy and security reasons, screen sharing sources are **not enumerable using `enumerateDevices()`**. Related to this, the **`devicechange` event is never sent** when there are changes to the sources available for `getDisplayMedia()`."*
- *"**The go-ahead permission to use `getDisplayMedia()` cannot be persisted for reuse. The user must be prompted for permission every time.**"*
- *"The specified options **can't be used to limit the choices** available to the user… This ensures that web applications can't force the user to share specific content by restricting the source list until only one item is left."*
- On logical surfaces: capturing a fully/partly obscured window may yield **obfuscated content** — *"the browser will provide an image which obscures the hidden portion… such as by blurring or replacing with a color or pattern"*.

**What I could NOT verify:** the *exact* visual/textual form of Chrome's persistent indicator (a chip in the omnibox reading "Sharing your screen"?), because Chrome's docs and `chrome://` references were unreachable. **UNVERIFIED.**

### 7.4 AudioContext autoplay / suspended state

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state** (fetched today) — states are `closed`, `interrupted`, `running`, `suspended`; `interrupted` = *"paused in response to an **interruption outside the control of the web app**"* (browser decides when to resume), `suspended` = *"paused in response to a **user action inside the web app**"* (app calls `resume()`). Transition rules (**VERIFIED**, verbatim):
- *"If `suspend()` is called on an audio context during an interruption (`state` is `interrupted`), the state will transition to `suspended` immediately."*
- *"If `resume()` is called on a suspended audio context during an interruption, the state will transition to `interrupted` immediately."*
- *"If an interruption happens while the audio context is suspended, the context will **not** transition to `interrupted`. This transition won't happen unless `resume()` is called."* — deliberately, *"to avoid exposing too much device information to web pages — for example, logging every time the laptop is closed could be a privacy issue."*
- iOS-specific: *"when a user leaves the page (e.g., switches tabs, minimizes the browser, or turns off the screen) the audio context's state changes to `"interrupted"` and needs to be resumed."*

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay** (fetched today; 228 lines):
- *"The following web features and APIs may be affected by autoplay blocking: The HTML `<audio>` and `<video>` elements; **The Web Audio API**…"*
- *"In the Web Audio API, a website or app can start playing audio using the `start()` method on a source node linked to the `AudioContext`. Doing so **outside the context of handling a user input event** is subject to autoplay rules."*
- *"As a general rule, you can assume that media will be allowed to autoplay **only if** at least one of the following is true: …"*
- There is an **autoplay Permissions Policy** and a `Navigator.getAutoplayPolicy()` API: *"you pass the mediaelement string to get the autoplay policy for all media elements in the document (pass **audiocontext** to get the policy for audio contexts)"*, returning `"allowed" | "allowed-muted" | "disallowed"`.
- *"There is **no way to be notified when the autoplay policy has changed**… and **no specific event (or other notification) is triggered by autoplay success or failure**"*.

**Practical rules for your feature (inference, but the inputs are verified):** create the `AudioContext` **inside** the user-gesture handler that also starts capture; check `ctx.state === 'running'` and `await ctx.resume()` if not; attach an `onstatechange` handler; **specifically handle `'interrupted'` on iOS** by `resume()`-ing; and do **not** assume a *capture-only* graph (source → worklet with no output to `destination`) escapes autoplay suspension — that is precisely the class of behaviour I could not verify first-hand, so test it, and be prepared to connect the worklet to a **zero-gain** `GainNode` → `destination` to keep the graph "active".

---

## 8. getUserMedia constraint behaviour, incl. `sampleRate` (TOP PRIORITY item 3)

### 8.1 Which audio constraints exist

**VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints** (fetched today; page last modified **Oct 15, 2025**) — "Instance properties of audio tracks":

`autoGainControl` (ConstrainBoolean) · `channelCount` (ConstrainULong) · `echoCancellation` (**ConstrainBooleanOrDOMString**) · `latency` (ConstrainDouble) · `noiseSuppression` (ConstrainBoolean) · `sampleRate` (ConstrainULong) · `sampleSize` (ConstrainULong) · `volume` (ConstrainDouble)

Plus the shared-track ones: `deviceId`, `groupId`. And for display tracks: `displaySurface`, `logicalSurface`, `suppressLocalAudioPlayback`, and — **new** — **`restrictOwnAudio`**: *"specifies the requested or mandatory constraints placed on the value of the `restrictOwnAudio` constrainable property. This property controls whether **the system audio originating from the capturing tab is filtered out** of the screen capture."* (**VERIFIED**; also present in MDN `MediaTrackSettings` and in the W3C spec).

Constraint algebra (**VERIFIED**, same page): `exact` → *"If the property can't be set to this value, matching will fail"*; `ideal` → *"If possible, this value will be used, but if it's not possible, the user agent will use the closest possible match"*. And the display-media restriction (**VERIFIED**): *"**`min` and `exact` values are not permitted in constraints used in `MediaDevices.getDisplayMedia()` calls — they produce a `TypeError`** — but they are allowed in `MediaStreamTrack.applyConstraints()` calls."*

### 8.2 `sampleRate` — what the spec actually guarantees

**VERIFIED via https://w3c.github.io/mediacapture-main/getusermedia.html** (fetched today; 4048 stripped lines). Two passages matter enormously:

**(i)** The property definition (verbatim): `sampleRate` — *"{{unsigned long}} — The sample rate in samples per second for the audio data."* (Same table: *"This is usually the case for properties like **sampleRate** or `sampleSize`"*.)

**(ii) The decisive one** — in the `SelectSettings` algorithm (verbatim):

> *"For any property with a **system default value** for the selected device, **the system default value SHOULD be used** if compatible with the above algorithm. **This is usually the case for properties like `sampleRate` or `sampleSize`.** Other properties, like `echoCancellation` or `resizeMode` **do not usually have system default values**. The **User Agent defines its own default values** for these properties. (…) Note that default values **may differ based on the system, for instance desktop vs. mobile**."*

> *"At time of writing, User Agent implementations tend to use the following default values, which were chosen for their suitability for using `RTCPeerConnection` as a sink: width 640; height 480; frameRate 30; **`echoCancellation` set to `true`**."*

**This is the strongest normative evidence on the question.** The spec explicitly classifies `sampleRate` as a **system-default-backed** property and says the system default **SHOULD** win. It does **not** say the UA must resample to your requested rate. So:

| Claim | Status |
|---|---|
| `sampleRate` is a real, spec'd constrainable audio property | **VERIFIED** (MDN + spec) |
| The UA **SHOULD** prefer the device's **system default** rate for `sampleRate` | **VERIFIED** (spec, quoted above) |
| Requesting `sampleRate: 16000` is **best-effort**, not binding, when expressed as `ideal`/bare value | **VERIFIED** (MDN constraint algebra) |
| Requesting `sampleRate: {exact: 16000}` will **fail with `OverconstrainedError`** if the UA won't do it | **BOTH** — MDN documents `exact` semantics and `applyConstraints` rejecting with `OverconstrainedError`; the specific consequence for `sampleRate` on a given device is inference |
| **Chrome always delivers the hardware rate and ignores `sampleRate`** | **UNVERIFIED — I could not verify this, and I am NOT asserting it.** No reachable page today stated it. Chrome's docs and source were unreachable. The spec's "system default SHOULD be used" wording is *consistent with* that behaviour but is not proof of it. |
| Firefox / Safari behaviour on `sampleRate` | **UNVERIFIED** — no page found today for either. |

**The honest, defensible engineering conclusion (inference, and this is what I'd build on):** treat the delivered rate as **unknown until measured**. Always read it back:

```js
const [track] = (await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
})).getAudioTracks();
console.log(track.getSettings());   // authoritative: sampleRate, channelCount, and whether EC/NS/AGC actually applied
```

`MediaTrackSettings` exposes exactly the right read-back fields — **VERIFIED via https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings** (fetched today): `sampleRate` (*"specifying the sample rate in samples per second of the audio data"*), `sampleSize` (*"the linear size, in bits, of each audio sample… CD-quality… would be 16"*), `channelCount` (*"1 for mono, 2 for stereo"*), `echoCancellation`, `noiseSuppression`, `autoGainControl`, `latency`, `volume`, `restrictOwnAudio`. **`getSettings` support — VERIFIED** via MDN BCD: chrome 61, edge 12, firefox 50, safari ✅, chrome_android 61, **safari_ios 11**, firefox_android 50.

**Note the read-back is inherently racy/partial:** MDN warns (**VERIFIED**) that *"Some combination — but not necessarily all — of the following properties will exist on the object. This may be because a given browser doesn't support the property, or because it doesn't apply."* So `settings.sampleRate` may be **absent**, not merely different. The WebKit bug in §5.2 shows iOS reporting **`0`** after an interruption. **Never assume the field exists or is non-zero.**

### 8.3 Real default `sampleRate` per OS — the part I genuinely could not verify

You asked specifically: "What is the real default rate on macOS/Windows/iOS/Android?" **I could not verify this from any page today, and I will not invent a table.** Here is precisely what is and isn't established:

| Environment | Default capture rate | Status |
|---|---|---|
| Any | *"may differ based on the system, for instance **desktop vs. mobile**"* | **VERIFIED** (spec) |
| Any | UA **SHOULD** use the **system default** | **VERIFIED** (spec) |
| macOS | 48 000 Hz typical (CoreAudio default) | **UNVERIFIED** — inference from platform convention, no page fetched |
| Windows | 48 000 Hz typical (WASAPI shared-mode default) | **UNVERIFIED** — inference |
| iOS | 48 000 Hz typical; **`0` observed after AudioSession interruption** | **UNVERIFIED** for the 48 kHz figure; the **`0`** case is **VERIFIED** (WebKit bug 208516) |
| Android | 44 100 or 48 000 depending on device/OEM, frequently 48 000 | **UNVERIFIED** — inference; Android is the most variable |
| `AudioContext` default rate | Typically matches the output device (often 48 000 on desktop); `new AudioContext({sampleRate})` is *allowed* to differ, forcing internal resampling | **UNVERIFIED** today — I could not fetch a page confirming the resampling behaviour. Note macOS output devices are frequently 44 100 Hz while mics are 48 000 Hz, which is exactly the mismatch that makes this painful. |

**Recommended way to settle it empirically (inference):** a 10-line probe page that runs `getUserMedia({audio:true})`, logs `getSettings()` (esp. `sampleRate`), then `new AudioContext().sampleRate`, and reports the pair. Run on: macOS Chrome, macOS Chrome + a Bluetooth headset, macOS Safari, Windows Chrome, iOS Safari, Android Chrome. **Do that before committing to an architecture** — it is cheap and it converts every UNVERIFIED row above into a measured fact.

### 8.4 Resampling: `OfflineAudioContext` vs manual

Both target paths converge on **16 kHz mono Int16** for an STT socket.

| Approach | Pros | Cons |
|---|---|---|
| **Let the UA do it** — request `sampleRate:16000` in `getUserMedia` | zero code | **not binding** (§8.2); UA may ignore; may not apply on all OSes |
| **`OfflineAudioContext`** at 16 kHz — `new OfflineAudioContext(1, length, 16000)` + `startRendering()` | high-quality (proper anti-alias filtering), no audible artifacts, well-tested code path | one-shot, **not** streaming-friendly: you must supply the full buffer up-front and await rendering — awkward for continuous audio. Needs chunked re-invocation or a different design. Also the graph must be rebuilt per call. |
| **`AudioContext` with `sampleRate: 16000`** — `new AudioContext({sampleRate:16000})` and route the mic stream into it | doubles as the resampler, continuous, and gives you a 16 kHz worklet so **`process()` bounds are already 16 kHz** (125 quanta/s) | UA support/behaviour **UNVERIFIED** today; forcing a non-device rate forces browser-internal resampling whose quality/latency I could not confirm |
| **Manual downsample in the worklet** (running-average/low-pass decimation 48 k→16 k, integer ratio 3:1) | fully deterministic, no extra context, cheap, works everywhere, no allocation | you must implement anti-aliasing correctly (a naive 3:1 decimation without a low-pass folds high frequencies back into the speech band); Float32→Int16 conversion and clipping must be handled |

**My recommendation (inference):** do the decimation **manually inside the AudioWorklet** at an integer ratio, with a small FIR/low-pass before decimation, then convert Float32→Int16 and transfer the `ArrayBuffer`. Reasons: (a) it is the only approach that does not depend on any of the UNVERIFIED `sampleRate` behaviours above; (b) it keeps you on the audio rendering thread with no main-thread copying; (c) it makes the 3:1 (or 44100→16000 non-integer, e.g. 160/441) ratio explicit and testable. Use `OfflineAudioContext` only if you need one-shot offline transcription of a recorded file, where its quality advantage is free.

**Int16 conversion detail (inference):** clamp to `[-1, 1]` **before** scaling; `Math.max(-1, Math.min(1, s)) * 32767` (or `32768` with careful asymmetry) — because Whisper-style models are trained on clipped-normalised audio, and an unclamped wrap is a loud click that the model will transcribe as noise. The **`latency`** and **`volume`** settings are also exposed if you need them (**VERIFIED** field list, MDN `MediaTrackSettings`).

---

## 9. Bottom line for your feature (opinion, built on the above)

| Requirement | Verdict | Route |
|---|---|---|
| Mic audio → STT, all browsers, desktop + mobile | **✅ Feasible today** | `getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})` → AudioWorklet → 16 kHz Int16 → WebSocket |
| Tab audio, Chrome/Edge desktop, **with** a picker | **✅ Feasible** | `getDisplayMedia({video:true,audio:true,preferCurrentTab:true,selfBrowserSurface:'exclude'})`; **handle the no-audio-track case**; Chrome tab audio works on **all** desktop OSes |
| System audio (e.g. a native Zoom app) | **◐ Windows + Chrome OS only** | `getDisplayMedia` + share a **monitor** + `systemAudio:'include'`; **impossible on macOS/Linux** via the web platform |
| Tab audio **without** a picker | **❌ Not from a web page** | Requires an extension: `chrome.tabCapture.getMediaStreamId()` → `chromeMediaSource:'tab'` in an **offscreen document** |
| Meet/Zoom tab in the same browser (remote participants) | **✅ via tab capture only** — and note `echoCancellation` will destroy it if you route through the mic | Tab capture gives *everyone else*; mic gives *you*; mix them |
| Firefox / Safari gDM audio | **❌ Does not exist** | Degrade to mic-only, or record a file via other means |
| Mobile | **Mic only** | No `getDisplayMedia`; no call-audio capture, ever |
| Chunked real-time streaming | **❌ Not via MediaRecorder timeslice** | Use AudioWorklet + raw PCM, or WebCodecs `AudioEncoder` for discrete Opus chunks |

**Single most important architectural takeaway:** if the product needs *other participants'* audio **without** a picker, it is **not a web-page feature — it is an extension (or a native/desktop recorder)**. Everything else is a graceful-degradation ladder: extension (best) → `getDisplayMedia` + picker on Chromium desktop (good) → mic-only (universal fallback).

---

## 10. Evidence appendix — every page I actually fetched on 2026-09-20

All of the following were retrieved with `curl` today and stripped to text. Byte counts are of the stripped text and are given so you can judge how substantive each source was.

### MDN (developer.mozilla.org) — VERIFIED
| Page | Bytes |
|---|---|
| `/Web/API/MediaTrackConstraints` (mod. Oct 15 2025) | 11 863 |
| `/Web/API/MediaDevices/getUserMedia` | 16 255 |
| `/Web/API/MediaDevices/getDisplayMedia` (mod. Sep 7 2026) | 10 092 |
| `/Web/API/Screen_Capture_API` (mod. Jun 19 2026) | 7 448 |
| `/Web/API/Screen_Capture_API/Using_Screen_Capture` (mod. Sep 10 2026) | 15 955 |
| `/Web/API/Screen_Capture_API/Element_Display_Capture` | 2 420 |
| `/Web/API/MediaDevices/getSupportedConstraints` | 1 910 |
| `/Web/API/MediaTrackSettings` | 8 778 |
| `/Web/API/MediaStreamTrack/getSettings` | 1 420 |
| `/Web/API/MediaStreamTrack/applyConstraints` | 3 626 |
| `/Web/API/MediaStreamTrack/getCapabilities` | 5 737 |
| `/Web/API/Media_Capture_and_Streams_API/Constraints` | 25 936 |
| `/Web/API/MediaRecorder/isTypeSupported_static` (mod. May 5 2025) | 2 179 |
| `/Web/API/MediaRecorder/start` | 4 005 |
| `/Web/API/MediaRecorder/dataavailable_event` | 3 887 |
| `/Web/API/MediaStream_Recording_API/Using_the_MediaStream_Recording_API` | 10 488 |
| `/Web/API/AudioWorklet` (**thin, 46 lines**) | 1 942 |
| `/Web/API/AudioWorkletProcessor/process` (mod. Oct 30 2025) | 7 565 |
| `/Web/API/AudioWorkletNode/port` | 2 530 |
| `/Web/API/ScriptProcessorNode` | 2 625 |
| `/Web/API/Web_Audio_API/Using_AudioWorklet` | 18 761 |
| `/Web/API/Web_Audio_API/Best_practices` | 7 368 |
| `/Web/API/BaseAudioContext/state` | 4 093 |
| `/Web/API/AudioContext/AudioContext` | 4 659 |
| `/Web/API/AudioContext/resume` | 1 692 |
| `/Web/API/WebCodecs_API` (**stub**) | 9 283 |
| `/Web/API/AudioEncoder` (**stub**) | — |
| `/Web/API/AudioEncoder/encode` (**stub**) | 1 224 |
| `/Web/API/AudioData` (**stub**) | — |
| `/Web/API/MessagePort/postMessage` | 3 217 |
| `/Web/API/Blob/arrayBuffer` | — |
| `/Web/Media/Guides/Autoplay` | 19 012 |
| `/Web/HTTP/Reference/Headers/Permissions-Policy/display-capture` (mod. Jul 4 2025) | 1 505 |

### Specs — VERIFIED (primary sources)
| Document | Bytes |
|---|---|
| `https://w3c.github.io/mediacapture-screen-share/` (editor's draft) | 55 993 |
| `https://www.w3.org/TR/screen-capture/` — **W3C Working Draft 27 August 2026** | 72 172 |
| `https://w3c.github.io/mediacapture-main/getusermedia.html` | 185 575 |
| `https://w3c.github.io/mediacapture-record/` | 30 717 |

### Compatibility data — VERIFIED
- MDN BCD **v8.1.2** JSON via jsdelivr: `api/MediaDevices.json`, `api/MediaRecorder.json`, `api/MediaStreamTrack.json`, `api/AudioWorklet.json`, `api/AudioWorkletNode.json`, `api/AudioWorkletProcessor.json`, `api/AudioContext.json`, `api/BaseAudioContext.json`, `api/OfflineAudioContext.json`, `api/ScriptProcessorNode.json`. **`api/AudioEncoder.json`, `api/AudioData.json`, `api/WebCodecs_API.json`, `api/Permissions-Policy.json`, `api/MediaStreamTrackProcessor.json` → 404 (WebCodecs is absent from the npm BCD package).**
- caniuse: `mdn-api_mediadevices_getdisplaymedia`, `mediarecorder`, `opus`, `webcodecs`, `audio-api`, `mdn-api_audioworklet`, plus per-option pages `mdn-api_mediadevices_getdisplaymedia_{systemaudio,selfbrowsersurface,prefercurrenttab,surfaceswitching,monitortypesurfaces,windowaudio}_option`.

### Chrome-specific (via mirrors, because `developer.chrome.com` was unreachable) — VERIFIED as to content
- **chromestatus JSON API**: `https://chromestatus.com/api/v0/features/4649448880734208` (`systemAudio`) and `/5118675366445056` (`selfBrowserSurface`); searches for `surfaceSwitching` (id `5067650299330560`), `monitorTypeSurfaces` (id `5558622137876480`).
- **`@types/chrome`** via `https://cdn.jsdelivr.net/npm/@types/chrome/index.d.ts` (776 KB) — embeds Chrome's own doc comments for `tabCapture` (lines 11256–11325) and `tabs.MutedInfoReason` (lines 11349–11360).

### Bug trackers
- **VERIFIED**: Bugzilla REST — `https://bugzilla.mozilla.org/rest/bug?quicksearch=getDisplayMedia%20audio`.
- **VERIFIED**: `https://bugs.webkit.org/show_bug.cgi?id=208516` (full text read; also references **WebKit bug 180748**).
- **COULD NOT VERIFY**: `issues.chromium.org` (000), `bugs.chromium.org` (bodies JS-rendered/empty), `chromium.googlesource.com` (000), `api.github.com` (403 rate-limited).

### Practitioner / secondary sources (clearly labelled as such)
- `https://www.recall.ai/blog/how-to-build-a-chrome-recording-extension` — 32 687 B, published **Nov 3 2025**, updated **Sep 14 2026**. Vendor engineering blog; the strongest available substitute for Chrome's unreachable docs.
- `https://cdn.jsdelivr.net/gh/recallai/chrome-recording-transcription-extension@main/README.md` — reference implementation (MEET tab → `.webm`), MV3 + Offscreen.
- Stack Exchange API (fetched, bodies read): `questions/55714629` + `/answers` (conference audio / echoCancellation), `questions/66902406/answers` (Safari MediaRecorder mimeTypes), `questions/54794052/answers` (AudioWorklet streaming glitches), `questions/30031561` (changing AudioContext sample rate — body fetched but content not substantive).

---

## 11. Explicit gaps — what this report does NOT cover

I am listing these so nothing here is mistaken for completeness:

1. **No Chromium bug audit whatsoever.** `issues.chromium.org` was unreachable and `bugs.chromium.org` bodies are JS-rendered. Every Chromium-specific bug claim is marked UNVERIFIED. **Somebody on a network that can reach those hosts must redo §5 for Chrome.**
2. **No empirical browser measurements.** I did not run Chrome/Edge/Firefox/Safari, desktop or mobile. The "real default sample rate per OS" table is explicitly UNVERIFIED, and §8.2's central question ("does Chrome honour `sampleRate`?") is **not** answered by evidence — only bounded by the spec.
3. **No per-browser `isTypeSupported` matrix from an authoritative source.** MDN publishes no such table and BCD does not track MIME types. §3.2 is assembled from mixed-quality sources; the Safari row rests on a ~2021 SO answer I could not re-verify.
4. **`AudioWorklet` in a Worker: unresolved.** Not stated either way by anything I fetched.
5. **Backgrounded-tab capture behaviour: not verified.** §4.4 has the mechanism (separate rendering thread — verified) but no bug report or doc on throttling of the main-thread consumer.
6. **The MDN `getCapabilities` / Firefox conflict is unresolved** (§6.4) — BCD says Firefox unsupported; the MDN page shows a Baseline banner.
7. **I did not read Chrome's own docs** (`developer.chrome.com` unreachable). `chrome.tabCapture` semantics come from `@types/chrome` doc comments (a faithful mirror) and a vendor blog — good, but **not** the primary page.
8. **Indicator UI specifics** (exact Chrome share-indicator appearance, `chrome://` surface) — UNVERIFIED.
9. **Not covered at all:** WebRTC `RTCPeerConnection`-based capture, `MediaStreamTrackProcessor`/`MediaStreamTrackGenerator` (Insertable Streams), `AudioContext` output-device selection (`setSinkId`), WebSocket protocol design for STT, Opus-in-WebM incremental de-muxing on the server, and any measured latency/CPU numbers.
