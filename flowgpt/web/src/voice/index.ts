/**
 * Voice module entry point.
 *
 * `VoiceProvider` owns the shared configuration (language, STT/TTS engine) and
 * the single speech-synthesis queue; `VoiceMode` is the full-screen talk UI.
 */
export {
  useSpeechRecognition,
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  speechErrorMessage,
} from "./useSpeechRecognition";
export type {
  SpeechRecognitionOptions,
  SpeechRecognitionController,
  SpeechRecognitionLike,
  SpeechRecognitionCtor,
} from "./useSpeechRecognition";
export {
  useSpeechSynthesis,
  toSpeakableText,
  chunkForSpeech,
  pickVietnameseVoice,
  isVietnameseVoice,
  speechSynthesisSupported,
} from "./useSpeechSynthesis";
export type { SpeechSynthesisController } from "./useSpeechSynthesis";
export { useVoiceConversation, playBlob } from "./useVoiceConversation";
export type { VoiceTurn, VoiceConversationOptions, VoiceConversationController } from "./useVoiceConversation";
export { useMicLevel, getAudioContextCtor, transcribeClip, transcribeErrorMessage } from "./useMicLevel";
export { VoiceProvider, useVoice } from "./VoiceProvider";
export type { VoiceContextValue } from "./VoiceProvider";
export { VoiceMode } from "./VoiceMode";
