import { useCallback, useEffect, useRef, useState } from "react";
import { Ear, Loader2, Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { useChat } from "../state/chat";
import { useI18n } from "../i18n";
import { pickVietnameseVoice, useVoiceConversation, isSpeechRecognitionSupported } from ".";
import { useVoice } from "./VoiceProvider";
import type { Message, VoiceState } from "../types";

/** i18n keys behind each voice-state label and hint. */
const STATE_LABEL_KEYS: Record<VoiceState, string> = {
  idle: "voice.mode.stateIdle",
  listening: "voice.mode.stateListening",
  thinking: "voice.mode.stateThinking",
  speaking: "voice.mode.stateSpeaking",
  error: "voice.mode.stateError",
};

const STATE_HINT_KEYS: Record<VoiceState, string> = {
  idle: "voice.mode.hintIdle",
  listening: "voice.mode.hintListening",
  thinking: "voice.mode.hintThinking",
  speaking: "voice.mode.hintSpeaking",
  error: "voice.mode.hintError",
};

/** Full-screen "talk to the assistant" mode, opened from the composer. */
export function VoiceMode() {
  const { t } = useI18n();
  const { config, sttMode, ttsMode, close, reload, vietnameseVoices, speak } = useVoice();
  const { messages, streaming, sending, send, conversation } = useChat();

  const [engine, setEngine] = useState(0);
  const spokenRef = useRef<Set<string>>(new Set());
  /** Reply currently being read by the conversation loop (never re-read here). */
  const beingSpokenRef = useRef<string | null>(null);

  // A voice turn inherits the provider/model the composer already picked.
  const modelValue = {
    providerId: conversation?.providerId ?? null,
    model: conversation?.model ?? null,
  };

  const assistantText = useCallback((): string | null => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && message.content.trim()) return message.content;
    }
    return null;
  }, [messages]);

  const handleUtterance = useCallback(
    (text: string) => {
      void send({ content: text, providerId: modelValue.providerId, model: modelValue.model });
    },
    [modelValue.model, modelValue.providerId, send],
  );

  const voice = useVoiceConversation({
    enabled: true,
    language: config.language,
    speakRate: config.speakRate,
    sttMode,
    ttsMode,
    ttsVoice: config.tts.voice ?? null,
    onUtterance: handleUtterance,
    assistantText,
    turnBusy: Boolean(streaming),
    isSending: sending,
  });

  const { start, stop, toggleMute, muted, state, level, error, interim, turns } = voice;

  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  // Refresh once the configuration settles so the engine line is accurate.
  useEffect(() => {
    void reload().then(() => setEngine((value) => value + 1)).catch(() => undefined);
  }, [reload]);

  // Escape closes; Space toggles the microphone unless the user is typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== " " && event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      const role = target.getAttribute("role");
      if (role === "textbox" || role === "checkbox" || role === "switch") return;
      event.preventDefault();
      toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, toggleMute]);

  // The conversation loop owns the reply of a voice turn; auto-read skips it.
  useEffect(() => {
    if (state === "speaking") {
      beingSpokenRef.current = lastAssistant(messages)?.id ?? null;
    }
  }, [messages, state]);

  // Voice mode is hands-free: an answer that arrives from a typed question is
  // read aloud too, as long as the admin enabled auto-read. Answers produced by
  // a voice turn are spoken by `useVoiceConversation` instead — the guard below
  // keeps this effect from replaying them.
  useEffect(() => {
    if (!config.autoRead || state === "thinking" || state === "speaking") return;
    const last = lastAssistant(messages);
    if (!last || spokenRef.current.has(last.id)) return;
    spokenRef.current.add(last.id);
    void speak(last.content, { rate: config.speakRate, voice: config.tts.voice ?? null });
  }, [config.autoRead, config.speakRate, config.tts.voice, messages, speak, state]);

  const turnsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = turnsRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns, interim]);

  const browserSttMissing = sttMode === "browser" && !isSpeechRecognitionSupported();
  const voiceName =
    ttsMode === "browser"
      ? browserVoiceName(vietnameseVoices, t("voice.engine.browserDefaultVoice"))
      : config.tts.voice || t("voice.engine.defaultVoice");
  const engineLabel = t("voice.engine.label", {
    kind:
      sttMode === "browser"
        ? t("voice.engine.browser")
        : providerLabel(config.stt.providerName, t("voice.engine.providerFallback")),
    voice: voiceName,
  });
  // The browser warning highlights the "Settings → Voice" path in bold.
  const settingsLink = t("voice.browser.settingsLink");
  const warningParts = t("voice.browser.unsupportedBody").split(settingsLink);

  return (
    <div className="voice-mode" role="dialog" aria-modal="true" aria-label={t("voice.mode.dialogLabel")}>
      <div className="voice-mode-top">
        <div className="row gap-2">
          <span className={`badge ${state === "listening" ? "badge-accent" : "badge-ok"}`}>
            {state === "listening" ? <Ear size={13} /> : <Volume2 size={13} />}
            {state === "thinking"
              ? t("voice.mode.badgeProcessing")
              : state === "speaking"
                ? t("voice.mode.badgeReading")
                : t("voice.mode.badgeOnline")}
          </span>
          <span className="tiny faint" data-engine={engine}>
            {engineLabel}
          </span>
        </div>
        <button
          className="btn btn-sm btn-ghost"
          type="button"
          onClick={close}
          title={t("voice.mode.exitTitle")}
        >
          <PhoneOff size={15} /> {t("voice.mode.exit")}
        </button>
      </div>

      {error && (
        <div className="voice-error" role="alert">
          {error}
        </div>
      )}

      <div className="voice-stage">
        <div
          className={`voice-orb voice-orb-${state}${muted ? " voice-orb-muted" : ""}`}
          style={{ transform: `scale(${(1 + Math.min(0.4, level * 0.85)).toFixed(3)})` }}
        >
          <span className="voice-orb-core" />
          <span className="voice-orb-ring" />
        </div>

        <div className="voice-state">{muted ? t("voice.mode.mutedState") : t(STATE_LABEL_KEYS[state])}</div>
        <div className="voice-hint">{muted ? t("voice.mode.mutedHint") : t(STATE_HINT_KEYS[state])}</div>

        {interim && <div className="voice-interim">{interim}</div>}

        <div className="voice-turns" ref={turnsRef}>
          {turns.length === 0 && !interim && (
            <div className="voice-turn">
              <span className="voice-turn-role">{t("voice.mode.suggestionRole")}</span>
              <span className="voice-turn-text">{t("voice.mode.suggestionText")}</span>
            </div>
          )}
          {turns.map((turn, index) => (
            <div className="voice-turn" key={`${turn.at}-${index}`}>
              <span className="voice-turn-role">
                {turn.role === "user" ? t("voice.mode.roleUser") : t("voice.mode.roleAssistant")}
              </span>
              <span className="voice-turn-text">{turn.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="voice-controls">
        <button
          className={`btn ${muted ? "btn-danger" : "btn-primary"}`}
          type="button"
          onClick={toggleMute}
          title={t(muted ? "voice.mode.unmuteTitle" : "voice.mode.muteTitle")}
        >
          {muted ? <MicOff size={16} /> : <Mic size={16} />}
          {t(muted ? "voice.mode.unmute" : "voice.mode.mute")}
        </button>

        {state === "speaking" && (
          <button className="btn" type="button" onClick={stop} title={t("voice.mode.stopReadingTitle")}>
            <VolumeX size={16} /> {t("voice.mode.stopReading")}
          </button>
        )}

        {state === "thinking" && (
          <span className="row gap-2 muted small">
            <Loader2 size={15} className="spin" /> {t("voice.mode.waiting")}
          </span>
        )}
      </div>

      {browserSttMissing && (
        <div className="voice-warning">
          <strong>{t("voice.browser.unsupportedTitle")}</strong>
          <div className="small mt-1">
            {warningParts.flatMap((part, index) =>
              index === 0 ? [part] : [<b key={index}>{settingsLink}</b>, part],
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function providerLabel(name: string | null, fallback: string): string {
  const label = (name ?? "").trim();
  return label || fallback;
}

function browserVoiceName(voices: SpeechSynthesisVoice[], fallback: string): string {
  const picked = pickVietnameseVoice(voices);
  return picked ? `${picked.name} (${picked.lang})` : fallback;
}

function lastAssistant(messages: Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.content.trim()) return message;
  }
  return null;
}
