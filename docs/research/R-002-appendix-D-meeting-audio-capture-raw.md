# 04c — Meeting Audio Capture by Platform (capability & evidence report)

**Scope:** how a software product can capture meeting audio on Windows, macOS, the browser, and mobile — for a web-first product that wants *live meeting translation + meeting minutes*.
**Explicitly out of scope:** meeting-bot vendors (Recall/MeetingBaas/Attendee pricing), and the MoM/LLM pipeline.
**Research date:** 2026-09-19.

---

## 0. Method, provenance and reachability (read this first)

### 0.1 Evidence-marking convention

* `VERIFIED via <url> (fetched 2026-09-19)` — I fetched that URL in this session and read the extracted text.
* `VERIFIED via <url> (via JSON data endpoint, fetched 2026-09-19)` — `developer.apple.com` renders its documentation in JavaScript, so `curl` on the HTML page yields a JS shell with no content. For Apple pages I fetched the **same page's underlying data endpoint** (`https://developer.apple.com/tutorials/data/documentation/<path>.json`). The URL cited is the canonical human-facing page; the content came from Apple's own JSON for that page.
* `UNVERIFIED/not reachable` — the site timed out, returned 403, or returned only a JS shell / geo-redirect. I say *explicitly* which.

### 0.2 Host reachability actually observed (2026-09-19)

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

## 1. Summary matrix — can we capture the meeting audio, per platform?

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

## 2. WINDOWS DESKTOP — system audio capture

### 2.1 Classic WASAPI loopback (the answer is: **no virtual driver needed**)

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

### 2.2 Process loopback (Windows 10 build 20348+/20438+) — per-application capture

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

### 2.3 ⚠️ Version discrepancy — the task brief's "Windows 10 2004+" is **not** what Microsoft documents

| Source (all fetched 2026-09-19) | Stated minimum version |
|---|---|
| `.../ne-audioclientactivationparams-audioclient_activation_type` | **Windows 10 Build 20348** |
| `.../ns-audioclientactivationparams-audioclient_activation_params` | **Windows 10 Build 20348** |
| `.../ns-audioclientactivationparams-audioclient_process_loopback_params` | **Windows 10 Build 20348** |
| `.../nf-mmdeviceapi-activateaudiointerfaceasync` (Remarks) | **Windows 10 Build 20438** |
| `.../applicationloopbackaudio-sample/` | **Windows 10 build 20348 or later** |

**Finding:** Microsoft's own pages disagree with each other (20348 vs 20438), and **none of them says Windows 10 2004 / build 19041**. Build 19041 is Windows 10 2004; build 20348 is the Windows Server 2022 / late-Windows-10 servicing build; 20438 is a later Insider-era build number.

**Recommendation:** treat **20348 as the conservative documented floor** and gate the feature at runtime (try process-loopback activation; on failure — `E_NOTIMPL` / silent zero-audio — fall back to plain system loopback). Do **not** ship a hard `IsWindows10OrGreater(2004)` check claiming Microsoft supports it. The two *functional* risks regardless of build number are documented above: no render streams on the target process ⇒ **silence**, and the process tree (not the app identity) is the capture unit, so browser-based meetings may need you to target the right helper/renderer process.

### 2.4 Windows — additional evidence

* **Device roles** — VERIFIED via https://learn.microsoft.com/en-us/windows/win32/coreaudio/device-roles (fetched 2026-09-19): `eConsole` / `eCommunications` / `eMultimedia`; `eCommunications` is documented for "Chat and VoIP". Relevant because a meeting app may render to the *communications* endpoint rather than the default multimedia endpoint — enumerate endpoints, or prefer process loopback to dodge the question entirely.
* **Capturing a Stream (capture-path walkthrough)** — VERIFIED via https://learn.microsoft.com/en-us/windows/win32/coreaudio/capturing-a-stream (fetched 2026-09-19). This is the base sample the loopback page tells you to modify.
* **NOT VERIFIED:** the GitHub copy of the sample (`github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback`) — a fetch to `github.com` **timed out** on 2026-09-19. The `learn.microsoft.com` sample page above **was** fetched and says "Browse code / Download ZIP" with files `ApplicationLoopback.cpp`, `LoopbackCapture.cpp/.h`, `Common.h`. Cite the `learn.microsoft.com` URL.

---

## 3. MACOS DESKTOP

### 3.1 (a) Legacy approach — virtual audio device + Multi-Output Device (the onboarding killer)

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

### 3.2 (b) Modern approach — Core Audio process taps (macOS 14.2+) **and** ScreenCaptureKit (macOS 13+)

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

### 3.3 (c) Commercial-SDK context (Recall Desktop Recording SDK)

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

## 4. BROWSER TAB CAPTURE (short section)

### 4.1 What a web-only product gets

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

### 4.2 What a web-only product **cannot** do

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

## 5. MOBILE

### 5.1 iOS — a third-party app cannot capture a phone call

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

### 5.2 Android — `AudioPlaybackCapture`, and apps can opt out

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

### 5.3 What real products actually do

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

## 6. Consolidated architecture recommendation

| Platform | Build this | Do not build this |
|---|---|---|
| **Windows** | WASAPI **process loopback** (`ActivateAudioInterfaceAsync` + `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK`) targeting the meeting app's process tree; **fall back to classic `AUDCLNT_STREAMFLAGS_LOOPBACK`** system loopback if activation fails. No driver. | ❌ A bundled virtual audio cable (VB-Cable etc.) — unnecessary on Windows, and `loopback-recording` explicitly says WASAPI works "regardless of whether the audio hardware contains a loopback device, or whether the user has enabled the device". ❌ Depending on "Stereo Mix". |
| **macOS** | **Core Audio process taps** (`CATapDescription` + `AudioHardwareCreateProcessTap` → HAL aggregate device) for remote audio, macOS 14.2+, + `AVAudioEngine` for mic; **or** one `SCStream` with `capturesAudio` + `captureMicrophone` if you can require macOS 15+. Ship `NSAudioCaptureUsageDescription` (+ `NSScreenCaptureUsageDescription` if using SCK). Handle the "denied ⇒ cannot re-request" UX and the Screen Recording permission + **app restart**. | ❌ Requiring BlackHole or Loopback + a Multi-Output Device for the default path (documented driver install, reboot, Audio MIDI Setup, `sudo killall -9 coreaudiod`, no volume control, "Built-in Output must be enabled and listed as the top device"). Keep it only as an explicit macOS 13–14.1 fallback, if at all. |
| **Browser** | `getDisplayMedia({video:true, audio:true, preferCurrentTab:true})` behind a clear "Share this tab" affordance, with graceful handling of **no audio track** and `NotAllowedError`. Great for a zero-install translation feature. | ❌ Any claim of automatic or silent capture. ❌ Any expectation of native-app audio. ❌ Any mobile-web screen capture (`getDisplayMedia` unsupported on iOS Safari / Chrome Android / Firefox Android). |
| **iOS** | Nothing that taps a call. If you want phone-call notes, you must **be the call** (CallKit VoIP + your own dialer/number, like Granola) — and realistically **outbound only**. In-person capture via mic is fine. | ❌ Tapping cellular/PSTN calls or another app's calls — **no public API exists**. ❌ Assuming ReplayKit/Broadcast Upload Extension captures call audio. ⚠️ ReplayKit is deprecated at iOS 27 in favour of ScreenCaptureKit — verify migration before committing. |
| **Android** | `MediaProjection` (consented, per session) + `AudioPlaybackCaptureConfiguration` for `USAGE_MEDIA`/`USAGE_GAME`/`USAGE_UNKNOWN` playback; in-person mic capture for the mobile use case. | ❌ Expecting VoIP/call audio — non-media usages "CAN NOT be captured". ❌ Expecting capture when an app sets `android:allowAudioPlaybackCapture="false"` or `ALLOW_CAPTURE_BY_NONE`. ❌ Root/accessibility hacks (Play policy risk; unverified). |

**The single most important architectural conclusion for a *web* product:** the browser alone cannot deliver automatic meeting capture. Every credible product in this space ships a **desktop app** for virtual meetings and uses **mobile only for in-person/mic scenarios**. If the product must remain web-only, the honest framing is *"share the tab"*, not *"it records your meetings"*.

---

## Appendix A — URL status ledger (fetched 2026-09-19)

### A.1 Fetched successfully and used as primary evidence

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

### A.2 Attempted and **NOT** usable (with the exact failure)

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

### A.3 Corrections to the task brief's premises

Three premises in the task brief do not survive contact with the primary sources. Flagging them explicitly because they change the plan:

1. **"Windows 10 2004+ / process-loopback"** — Microsoft documents process loopback as **Build 20348** (struct/enum pages, sample page) or **Build 20438** (function page Remarks). **Not 2004 (build 19041).** See §2.3.
2. **"macOS legacy: kernel/system extension"** — BlackHole explicitly states **"No kernel extensions or modifications to system security necessary"**; it is a userspace HAL plug-in under `/Library/Audio/Plug-Ins/HAL/`. It still requires a driver install with admin rights and a reboot, so the *friction* premise holds — but the *mechanism* description should be corrected. See §3.1.
3. **"Does Windows require installing a virtual audio driver (e.g. VB-Cable) or is loopback built in?"** — **Confirmed: loopback is built into WASAPI, no driver needed**, from the explicit sentence "WASAPI supports loopback recording regardless of whether the audio hardware contains a loopback device, or whether the user has enabled the device." See §2.1. Additionally, on macOS 14.2+ the virtual driver is **also** no longer required (Core Audio taps) — the task framed the driver as the macOS default without noting that this changed in 2024.
