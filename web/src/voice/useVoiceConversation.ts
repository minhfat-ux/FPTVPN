import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { toSpeakableText, useSpeechRecognition, useSpeechSynthesis } from ".";
import { getAudioContextCtor, transcribeClip, transcribeErrorMessage, useMicLevel } from "./useMicLevel";
import type { SilenceDetector } from "./useMicLevel";
import type { VoiceState } from "../types";

export interface VoiceTurn {
  role: "user" | "assistant";
  text: string;
  at: number;
}

export interface VoiceConversationOptions {
  /** Voice mode is open. */
  enabled: boolean;
  language: string;
  speakRate: number;
  sttMode: "browser" | "server";
  ttsMode: "browser" | "server";
  ttsVoice: string | null;
  /** Sends the transcript to the chat. */
  onUtterance: (text: string) => void;
  /** Latest assistant reply text coming from the chat state. */
  assistantText: () => string | null;
  /** The chat is streaming a turn. */
  turnBusy: boolean;
  isSending: boolean;
}

export interface VoiceConversationController {
  state: VoiceState;
  interim: string;
  /** 0..1 microphone loudness, for the orb animation. */
  level: number;
  error: string | null;
  turns: VoiceTurn[];
  start: () => Promise<void>;
  stop: () => void;
  toggleMute: () => void;
  muted: boolean;
}

/**
 * Barge-in: the analyser taps the raw mic input, so the assistant's own
 * playback leaks a little energy back in even with echo cancellation. The
 * threshold therefore sits above that leakage.
 */
const BARGE_IN_LEVEL = 0.16;
const BARGE_IN_FRAMES = 5;
/** The chat turn is polled while it settles; never longer than this. */
const TURN_TIMEOUT_MS = 15000;
/** Milestone used to check whether the chat turn already finished. */
const TURN_POLL_MS = 1200;

const CHAT_BUSY_KEY = "voice.error.chatBusy";
const AUDIO_FAILED_KEY = "voice.error.audioFailed";
const TTS_MISSING_KEY = "voice.error.ttsUnsupported";

interface Playback {
  aborted: boolean;
}

export function useVoiceConversation(options: VoiceConversationOptions): VoiceConversationController {
  const { t } = useI18n();
  const latest = useRef(options);
  latest.current = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [muted, setMuted] = useState(false);

  // Mirrors read by the animation frame loop (no re-render required).
  const speakingRef = useRef(false);
  const mutedRef = useRef(false);
  const stoppedRef = useRef(false);

  // Metering
  const aboveRef = useRef(0);

  // Server STT
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const silenceDetectorRef = useRef<SilenceDetector | null>(null);
  const transcribingRef = useRef(false);

  // TTS playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackRef = useRef<Playback | null>(null);

  // Turn tracking
  const tokenRef = useRef(0);
  const pendingRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);

  const mic = useMicLevel(options.enabled, muted);
  const synthesis = useSpeechSynthesis();

  const applyState = useCallback((next: VoiceState) => {
    speakingRef.current = next === "speaking";
    setState(next);
  }, []);

  const fail = useCallback(
    (message: string) => {
      setError(message);
      applyState("error");
    },
    [applyState],
  );

  function pushTurn(role: VoiceTurn["role"], text: string) {
    const clean = text.trim();
    if (!clean) return;
    const turn: VoiceTurn = { role, text: clean, at: Date.now() };
    setTurns((list) => (list.length > 80 ? [...list.slice(-79), turn] : [...list, turn]));
  }

  function canListen(): boolean {
    return latest.current.enabled && !mutedRef.current && !stoppedRef.current;
  }

  function clearTurnTimers() {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }

  // ------------------------------------------------------------ recognition
  const recognition = useSpeechRecognition({
    language: options.language,
    continuous: true,
    interimResults: true,
    onFinal: (text) => {
      if (latest.current.sttMode === "browser") sendUtterance(text);
    },
    onInterim: (text) => setInterim(text),
    onError: (message) => fail(message),
  });
  const recognitionStart = recognition.start;
  const recognitionStop = recognition.stop;

  function stopRecording() {
    const stop = stopRecordingRef.current;
    stopRecordingRef.current = null;
    stop?.();
  }

  async function submitRecording(blob: Blob | null) {
    if (stoppedRef.current) return;
    if (!blob) {
      if (canListen()) applyState("listening");
      return;
    }
    if (transcribingRef.current) return;
    transcribingRef.current = true;
    try {
      const text = await transcribeClip(blob, latest.current.language);
      if (stoppedRef.current) return;
      if (text) sendUtterance(text);
      else if (canListen()) applyState("listening");
    } catch (err) {
      if (!stoppedRef.current) fail(t(transcribeErrorMessage(err)));
    } finally {
      transcribingRef.current = false;
    }
  }

  function startRecordingForUtterance() {
    // The detector is fed by the animation frame loop below.
    const detector = mic.createSilenceDetector(() => stopRecording());
    detector.begin();
    silenceDetectorRef.current = detector;
    const stop = mic.startRecording((blob) => {
      void submitRecording(blob);
    });
    stopRecordingRef.current = stop;
  }

  // -------------------------------------------------- transcript → chat turn
  function sendUtterance(raw: string) {
    const text = toSpeakableText(raw).slice(0, 2000);
    if (!text) {
      if (canListen()) applyState("listening");
      return;
    }
    if (latest.current.turnBusy || latest.current.isSending) {
      fail(t(CHAT_BUSY_KEY));
      return;
    }

    pushTurn("user", text);
    setInterim("");
    setError(null);
    applyState("thinking");
    recognitionStop();
    stopRecording();

    tokenRef.current += 1;
    const token = tokenRef.current;
    pendingRef.current = token;
    latest.current.onUtterance(text);

    clearTurnTimers();
    // The chat store settles `streaming`/`sending` asynchronously; this timer
    // is the path taken when the turn finishes without any React render in
    // between (a very fast provider can emit everything inside one batch).
    pollTimerRef.current = window.setTimeout(() => settlePending(token), TURN_POLL_MS);
    fallbackTimerRef.current = window.setTimeout(() => settlePending(token), TURN_TIMEOUT_MS);
  }

  function settlePending(token: number) {
    if (token !== tokenRef.current || pendingRef.current !== token) return;
    if (!latest.current.enabled || stoppedRef.current) return;
    if (latest.current.turnBusy || latest.current.isSending) {
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = window.setTimeout(() => settlePending(token), TURN_POLL_MS / 2);
      return;
    }
    pendingRef.current = null;
    clearTurnTimers();
    const text = (latest.current.assistantText() ?? "").trim();
    if (text) void speakAndListen(text, token);
    else concludeWithoutReply();
  }

  function concludeWithoutReply() {
    setInterim("");
    applyState(canListen() ? "listening" : "idle");
  }

  // ---------------------------------------------------------------- playback
  function stopPlayback() {
    const playback = playbackRef.current;
    if (playback) {
      playback.aborted = true;
      playbackRef.current = null;
    }
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
    synthesis.stop();
  }

  async function speakAndListen(text: string, token: number) {
    if (!canListen()) {
      concludeWithoutReply();
      return;
    }
    applyState("speaking");
    stopPlayback();

    const playback: Playback = { aborted: false };
    playbackRef.current = playback;

    try {
      if (latest.current.ttsMode === "browser") {
        if (!synthesis.supported) {
          fail(t(TTS_MISSING_KEY));
          return;
        }
        await synthesis.speak(text, { rate: latest.current.speakRate, voiceName: latest.current.ttsVoice });
      } else {
        const blob = await api.speakText(text, latest.current.ttsVoice);
        if (playback.aborted || stoppedRef.current) return;
        const audio = await playBlob(blob, (node) => {
          audioRef.current = node;
        });
        if (playback.aborted || stoppedRef.current) return;
        if (!audio) {
          fail(t(AUDIO_FAILED_KEY));
          return;
        }
      }
    } catch (err) {
      if (!playback.aborted && !stoppedRef.current) {
        fail(err instanceof ApiError ? err.message : t(AUDIO_FAILED_KEY));
      }
      return;
    }

    if (playbackRef.current === playback) playbackRef.current = null;
    if (playback.aborted || stoppedRef.current || token !== tokenRef.current) return;
    if (!latest.current.enabled) return;
    pushTurn("assistant", text);
    concludeWithoutReply();
  }

  // --------------------------------------------------------------- controls
  // Refs holding the newest closures so `stop()` stays referentially stable
  // (the effect that closes voice mode depends on it).
  const stopPlaybackRef = useRef(stopPlayback);
  stopPlaybackRef.current = stopPlayback;
  const stopRecordingAnyRef = useRef(stopRecording);
  stopRecordingAnyRef.current = stopRecording;
  const recognitionStopRef = useRef(recognition.stop);
  recognitionStopRef.current = recognition.stop;
  const applyStateRef = useRef(applyState);
  applyStateRef.current = applyState;
  const clearTurnTimersRef = useRef(clearTurnTimers);
  clearTurnTimersRef.current = clearTurnTimers;
  const micErrorRef = useRef<string | null>(null);
  micErrorRef.current = mic.error;

  const stop = useCallback(() => {
    stoppedRef.current = true;
    mutedRef.current = false;
    setMuted(false);
    setInterim("");
    pendingRef.current = null;
    tokenRef.current += 1;
    clearTurnTimersRef.current();
    stopPlaybackRef.current();
    recognitionStopRef.current();
    stopRecordingAnyRef.current();
    transcribingRef.current = false;
    applyStateRef.current("idle");
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    stoppedRef.current = false;
    mutedRef.current = false;
    setMuted(false);
    setError(null);
    if (latest.current.enabled) applyStateRef.current("listening");
  }, []);

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    setInterim("");
    if (next) {
      recognitionStop();
      stopRecording();
      stopPlayback();
      applyState("idle");
    } else if (!stoppedRef.current) {
      applyState("listening");
    }
  }

  // Level meter, barge-in detection and voice activity detection share one
  // animation frame loop.
  useEffect(() => {
    if (!options.enabled) return;
    let frame = 0;
    let lastFrame = 0;

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const dt = Math.min(120, now - lastFrame);
      lastFrame = now;
      if (dt <= 0) return;

      mic.sample();
      const { level: raw, displayLevel } = mic.levels.current;
      setLevel((previous) => (Math.abs(previous - displayLevel) < 0.005 ? previous : displayLevel));

      if (speakingRef.current) {
        aboveRef.current = raw > BARGE_IN_LEVEL ? aboveRef.current + 1 : 0;
        if (aboveRef.current >= BARGE_IN_FRAMES) {
          aboveRef.current = 0;
          stopPlaybackRef.current();
          applyStateRef.current("listening");
        }
        return;
      }
      aboveRef.current = 0;
      silenceDetectorRef.current?.ingest(raw, now);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [mic, options.enabled]);

  // Mic failures surface as the same Vietnamese error the UI already shows.
  useEffect(() => {
    if (mic.error) fail(mic.error);
  }, [fail, mic.error]);

  // -------------------------------------------------- state → listening loops
  useEffect(() => {
    if (!options.enabled || muted || state !== "listening") return;
    if (options.sttMode !== "browser" || !recognition.supported) return;
    recognitionStart();
    return () => recognitionStop();
  }, [muted, options.enabled, options.sttMode, recognition.supported, recognitionStart, recognitionStop, state]);

  useEffect(() => {
    if (!options.enabled || muted) return;
    if (state !== "listening") return;
    if (options.sttMode !== "server") return;
    // The recorder needs the granted mic stream; `mic.ready` re-runs this.
    if (!mic.ready) return;
    startRecordingForUtterance();
    return () => stopRecording();
  }, [mic.ready, muted, options.enabled, options.sttMode, state]);

  // A render that settles the chat turn (streaming → null, sending → false).
  useEffect(() => {
    const token = pendingRef.current;
    if (token === null) return;
    if (options.turnBusy || options.isSending) return;
    settlePending(token);
    // `settlePending` is recreated per render on purpose: it reads the latest
    // chat state through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.enabled, options.isSending, options.turnBusy]);

  // Closing voice mode (or unmounting) releases mic, recorder, graph and audio.
  useEffect(() => {
    if (options.enabled) return;
    stop();
    setTurns([]);
    setError(null);
    setInterim("");
    setMuted(false);
    mutedRef.current = false;
  }, [options.enabled, stop]);

  useEffect(
    () => () => {
      stoppedRef.current = true;
      recognitionStopRef.current();
      stopRecordingAnyRef.current();
      stopPlaybackRef.current();
    },
    [],
  );

  return useMemo(
    () => ({ state, interim, level, error, turns, start, stop, toggleMute, muted }),
    [error, interim, level, muted, start, state, stop, toggleMute, turns],
  );
}

// ------------------------------------------------------------------ helpers

/**
 * Plays a synthesized blob and resolves once playback has finished. A dedicated
 * `AudioContext` decodes the buffer so playback never depends on the mic graph.
 */
export async function playBlob(
  blob: Blob,
  register: (audio: HTMLAudioElement) => void,
): Promise<HTMLAudioElement | null> {
  const Ctor = getAudioContextCtor();
  const ctx = new Ctor();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    let stopped = false;
    const stopSource = () => {
      if (stopped) return;
      stopped = true;
      try {
        source.stop();
      } catch {
        /* not started yet */
      }
    };
    // A detached element is the cancellation handle used by `stopPlayback()`.
    const handle = document.createElement("audio");
    handle.pause = stopSource;
    register(handle);

    return await new Promise<HTMLAudioElement | null>((resolve) => {
      source.onended = () => {
        void ctx.close().catch(() => undefined);
        resolve(handle);
      };
      try {
        source.start();
      } catch {
        void ctx.close().catch(() => undefined);
        resolve(null);
      }
    });
  } catch {
    void ctx.close().catch(() => undefined);
    return null;
  }
}
