import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth, useToast } from "../state/store";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { getAudioContextCtor } from "./useMicLevel";
import { VoiceMode } from "./VoiceMode";
import type { VoiceConfig } from "../types";
import "./voice.css";

export interface VoiceContextValue {
  config: VoiceConfig;
  browserHint: string;
  loading: boolean;
  reload: () => Promise<VoiceConfig>;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  speak: (text: string, opts?: { rate?: number; voice?: string | null }) => Promise<void>;
  stopSpeaking: () => void;
  speaking: boolean;
  sttMode: "browser" | "server";
  ttsMode: "browser" | "server";
  /** Vietnamese voices installed in this browser (settings tab picker). */
  vietnameseVoices: SpeechSynthesisVoice[];
  /** Speaks with the browser engine, bypassing the configured mode (preview). */
  previewBrowserVoice: (text: string, voiceName: string | null, rate: number) => Promise<void>;
}

const DEFAULT_CONFIG: VoiceConfig = {
  language: "vi-VN",
  autoRead: false,
  speakRate: 1,
  stt: { mode: "browser", providerId: null, providerName: null, model: null },
  tts: { mode: "browser", providerId: null, providerName: null, model: null, voice: null },
  options: [],
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error("useVoice phải nằm trong <VoiceProvider> — hãy bọc <App /> bằng <VoiceProvider>.");
  }
  return ctx;
}

/**
 * Loads the shared voice configuration and owns playback for the whole app, so
 * a speaker button in the transcript and voice mode use the same engine.
 */
export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { push } = useToast();
  const synthesis = useSpeechSynthesis();

  const [config, setConfig] = useState<VoiceConfig>(DEFAULT_CONFIG);
  const [browserHint, setBrowserHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [rate, setRate] = useState(1);
  const [serverSpeaking, setServerSpeaking] = useState(false);

  const requestRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const reload = useCallback<() => Promise<VoiceConfig>>(async () => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    try {
      const result = await api.voiceConfig();
      if (request !== requestRef.current) return config;
      setConfig({ ...DEFAULT_CONFIG, ...result.config });
      setBrowserHint(result.browserHint ?? "");
      setRate(result.config?.speakRate || 1);
      return result.config;
    } catch {
      // Voice mode must still work with the free browser engine when the
      // configuration endpoint is unavailable.
      if (request === requestRef.current) {
        setConfig(DEFAULT_CONFIG);
        setBrowserHint("");
      }
      return DEFAULT_CONFIG;
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
    // `config` is only read for the stale-request early return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    void reload();
  }, [reload, user]);

  const stopSpeaking = useCallback(() => {
    synthesis.stop();
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    }
    setServerSpeaking(false);
  }, [synthesis]);

  const speak = useCallback(
    async (text: string, opts?: { rate?: number; voice?: string | null }) => {
      const clean = (text ?? "").trim();
      if (!clean) return;
      stopSpeaking();

      const speakRate = opts?.rate ?? rate ?? 1;
      if (config.tts.mode === "server") {
        try {
          const blob = await api.speakText(clean, opts?.voice ?? config.tts.voice ?? null);
          const ctx = getAudioContextCtor();
          const audioCtx = new ctx();
          try {
            const buffer = await audioCtx.decodeAudioData(await blob.arrayBuffer());
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.playbackRate.value = Math.min(2, Math.max(0.5, speakRate));
            setServerSpeaking(true);
            await new Promise<void>((resolve) => {
              source.onended = () => {
                void audioCtx.close().catch(() => undefined);
                resolve();
              };
              source.start();
            });
          } catch {
            void audioCtx.close().catch(() => undefined);
          }
        } catch {
          push("Không đọc được câu trả lời bằng nhà cung cấp TTS", "error");
        } finally {
          setServerSpeaking(false);
        }
        return;
      }

      await synthesis.speak(clean, {
        rate: speakRate,
        voiceName: opts?.voice ?? config.tts.voice ?? null,
      });
    },
    [config.tts.mode, config.tts.voice, push, rate, stopSpeaking, synthesis],
  );

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    stopSpeaking();
    setIsOpen(false);
  }, [stopSpeaking]);

  const previewBrowserVoice = useCallback(
    async (text: string, voiceName: string | null, previewRate: number) => {
      stopSpeaking();
      await synthesis.speak(text, { rate: previewRate, voiceName });
    },
    [stopSpeaking, synthesis],
  );

  const value = useMemo<VoiceContextValue>(
    () => ({
      config,
      browserHint,
      loading,
      reload,
      isOpen,
      open,
      close,
      speak,
      stopSpeaking,
      speaking: synthesis.speaking || serverSpeaking,
      sttMode: config.stt.mode,
      ttsMode: config.tts.mode,
      vietnameseVoices: synthesis.vietnameseVoices,
      previewBrowserVoice,
    }),
    [
      browserHint,
      close,
      config,
      isOpen,
      loading,
      open,
      previewBrowserVoice,
      reload,
      serverSpeaking,
      speak,
      stopSpeaking,
      synthesis.speaking,
      synthesis.vietnameseVoices,
    ],
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {isOpen && <VoiceMode />}
    </VoiceContext.Provider>
  );
}
