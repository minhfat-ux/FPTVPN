import { useCallback, useEffect, useRef, useState } from "react";
import { Ear, Loader2, Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { useChat } from "../state/chat";
import { pickVietnameseVoice, useVoiceConversation, isSpeechRecognitionSupported } from ".";
import { useVoice } from "./VoiceProvider";
import type { Message, VoiceState } from "../types";

const STATE_LABELS: Record<VoiceState, string> = {
  idle: "Đã dừng",
  listening: "Đang nghe…",
  thinking: "Đang suy nghĩ…",
  speaking: "Đang nói…",
  error: "Lỗi",
};

const STATE_HINTS: Record<VoiceState, string> = {
  idle: "Bấm micro để tiếp tục trò chuyện.",
  listening: "Anh/chị nói tự nhiên, FlowGpt sẽ trả lời ngay khi nghe xong.",
  thinking: "FlowGpt đang xử lý câu hỏi của anh/chị.",
  speaking: "Nói xen vào để ngắt lời và hỏi tiếp.",
  error: "Kiểm tra micro hoặc cấu hình trong Cài đặt → Giọng nói.",
};

/** Full-screen "talk to the assistant" mode, opened from the composer. */
export function VoiceMode() {
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
  const voiceName = ttsMode === "browser" ? browserVoiceName(vietnameseVoices) : config.tts.voice || "mặc định";
  const engineLabel = `Nhận dạng: ${sttMode === "browser" ? "trình duyệt" : providerLabel(config.stt.providerName)} · Giọng đọc: ${voiceName}`;

  return (
    <div className="voice-mode" role="dialog" aria-modal="true" aria-label="Chế độ giọng nói">
      <div className="voice-mode-top">
        <div className="row gap-2">
          <span className={`badge ${state === "listening" ? "badge-accent" : "badge-ok"}`}>
            {state === "listening" ? <Ear size={13} /> : <Volume2 size={13} />}
            {state === "thinking" ? "Đang xử lý" : state === "speaking" ? "Đang đọc" : "Trực tuyến"}
          </span>
          <span className="tiny faint" data-engine={engine}>
            {engineLabel}
          </span>
        </div>
        <button className="btn btn-sm btn-ghost" type="button" onClick={close} title="Thoát chế độ giọng nói (Esc)">
          <PhoneOff size={15} /> Thoát
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

        <div className="voice-state">{muted ? "Đã tắt micro" : STATE_LABELS[state]}</div>
        <div className="voice-hint">{muted ? "Bấm micro hoặc phím Space để nói tiếp." : STATE_HINTS[state]}</div>

        {interim && <div className="voice-interim">{interim}</div>}

        <div className="voice-turns" ref={turnsRef}>
          {turns.length === 0 && !interim && (
            <div className="voice-turn">
              <span className="voice-turn-role">Gợi ý</span>
              <span className="voice-turn-text">Hãy nói: “Xin chào, bạn giúp được gì cho tôi?”</span>
            </div>
          )}
          {turns.map((turn, index) => (
            <div className="voice-turn" key={`${turn.at}-${index}`}>
              <span className="voice-turn-role">{turn.role === "user" ? "Bạn" : "FlowGpt"}</span>
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
          title={muted ? "Bật micro (Space)" : "Tắt micro (Space)"}
        >
          {muted ? <MicOff size={16} /> : <Mic size={16} />}
          {muted ? "Bật micro" : "Tắt micro"}
        </button>

        {state === "speaking" && (
          <button className="btn" type="button" onClick={stop} title="Dừng đọc câu trả lời">
            <VolumeX size={16} /> Dừng đọc
          </button>
        )}

        {state === "thinking" && (
          <span className="row gap-2 muted small">
            <Loader2 size={15} className="spin" /> Đang chờ câu trả lời…
          </span>
        )}
      </div>

      {browserSttMissing && (
        <div className="voice-warning">
          <strong>Trình duyệt này không hỗ trợ nhận dạng giọng nói.</strong>
          <div className="small mt-1">
            Anh/chị hãy dùng Microsoft Edge hoặc Google Chrome, hoặc vào <b>Cài đặt → Giọng nói</b> để chọn nhà
            cung cấp STT miễn phí (Gemini, Groq) — khi đó giọng nói vẫn dùng được trên mọi trình duyệt hiện đại.
          </div>
        </div>
      )}
    </div>
  );
}

function providerLabel(name: string | null): string {
  const label = (name ?? "").trim();
  return label || "nhà cung cấp";
}

function browserVoiceName(voices: SpeechSynthesisVoice[]): string {
  const picked = pickVietnameseVoice(voices);
  return picked ? `${picked.name} (${picked.lang})` : "giọng mặc định của trình duyệt";
}

function lastAssistant(messages: Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.content.trim()) return message;
  }
  return null;
}
