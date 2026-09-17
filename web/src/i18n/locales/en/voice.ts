import type { Dict } from "../../types";

/** English translations for this namespace. */
export const voice: Dict = {
  // ---- Voice mode (VoiceMode)
  "voice.mode.dialogLabel": "Voice mode",
  "voice.mode.badgeProcessing": "Processing",
  "voice.mode.badgeReading": "Reading",
  "voice.mode.badgeOnline": "Online",
  "voice.mode.stateIdle": "Stopped",
  "voice.mode.stateListening": "Listening…",
  "voice.mode.stateThinking": "Thinking…",
  "voice.mode.stateSpeaking": "Speaking…",
  "voice.mode.stateError": "Error",
  "voice.mode.hintIdle": "Tap the microphone to keep talking.",
  "voice.mode.hintListening": "Speak naturally — fBuddy answers as soon as it finishes listening.",
  "voice.mode.hintThinking": "fBuddy is working on your question.",
  "voice.mode.hintSpeaking": "Speak over it to interrupt and ask a follow-up.",
  "voice.mode.hintError": "Check the microphone or the configuration in Settings → Voice.",
  "voice.mode.mutedState": "Microphone off",
  "voice.mode.mutedHint": "Tap the microphone or press Space to keep talking.",
  "voice.mode.mute": "Mute microphone",
  "voice.mode.unmute": "Unmute microphone",
  "voice.mode.muteTitle": "Mute microphone (Space)",
  "voice.mode.unmuteTitle": "Unmute microphone (Space)",
  "voice.mode.stopReading": "Stop reading",
  "voice.mode.stopReadingTitle": "Stop reading the answer",
  "voice.mode.waiting": "Waiting for the answer…",
  "voice.mode.exit": "Exit",
  "voice.mode.exitTitle": "Exit voice mode (Esc)",
  "voice.mode.suggestionRole": "Suggestion",
  "voice.mode.suggestionText": "Try saying: “Hello, what can you help me with?”",
  "voice.mode.roleUser": "You",
  "voice.mode.roleAssistant": "fBuddy",

  // ---- Engine line
  "voice.engine.label": "Recognition: {kind} · Voice: {voice}",
  "voice.engine.browser": "browser",
  "voice.engine.providerFallback": "provider",
  "voice.engine.defaultVoice": "default",
  "voice.engine.browserDefaultVoice": "browser default voice",

  // ---- Browser warning
  "voice.browser.unsupportedTitle": "This browser does not support speech recognition.",
  "voice.browser.unsupportedBody": "Please use Microsoft Edge or Google Chrome, or open Settings → Voice to pick a free STT provider (Gemini, Groq) — voice mode then works on every modern browser.",
  "voice.browser.settingsLink": "Settings → Voice",

  // ---- Microphone / permission errors
  "voice.error.micDenied": "You need to allow microphone access in the browser.",
  "voice.error.micNotFound": "No microphone was found.",
  "voice.error.micOpenFailed": "Could not open the microphone. Please check the browser's microphone permission.",
  "voice.error.micNetwork": "Could not reach the browser's recognition service (it may be blocked in China). Open Settings → Voice to pick an STT provider.",
  "voice.error.recognitionFailed": "Speech recognition failed, please try again.",
  "voice.error.recordUnsupported": "This browser cannot record audio to send to the server.",
  "voice.error.transcribeFailed": "Could not transcribe the speech, please try again.",

  // ---- Speech playback errors
  "voice.error.chatBusy": "The conversation is busy — please try again once the answer has finished.",
  "voice.error.audioFailed": "Could not read the answer aloud.",
  "voice.error.ttsUnsupported": "This browser cannot read text aloud. Open Settings → Voice to pick a TTS provider.",
  "voice.error.providerSpeakFailed": "Could not read the answer aloud with the TTS provider",
};
