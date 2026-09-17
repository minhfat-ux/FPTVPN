import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { useI18n } from "../i18n";

/**
 * Microphone plumbing shared by voice mode: one MediaStream, one AudioContext
 * for level metering plus voice activity detection, and a MediaRecorder-based
 * capture for server-side STT.
 *
 * Browser STT (Web Speech API) runs on the same stream but is driven by
 * `useSpeechRecognition`.
 */

export interface MicMetrics {
  /** Raw RMS of the current frame (0..1). */
  level: number;
  /** Smoothed level used for the orb (0..1). */
  displayLevel: number;
}

/** Ends one recording as soon as the speaker goes quiet. */
export interface SilenceDetector {
  begin: () => void;
  ingest: (level: number, now: number) => void;
}

export interface MicLevelController {
  /** `true` once the mic stream is granted (the recorder needs it). */
  ready: boolean;
  error: string | null;
  /** Live RMS/display values, refreshed by `sample()`. */
  levels: React.MutableRefObject<MicMetrics>;
  analyser: React.MutableRefObject<AnalyserNode | null>;
  /** Reads one analyser frame; call from a requestAnimationFrame loop. */
  sample: () => void;
  /** One MediaRecorder session; the returned function stops it. */
  startRecording: (onCaptured: (blob: Blob | null) => void) => () => void;
  /** Creates the voice activity detector for a recording. */
  createSilenceDetector: (stop: () => void) => SilenceDetector;
}

const SILENCE_LEVEL = 0.02;
const SPEECH_LEVEL = 0.05;
const SILENCE_HOLD_MS = 1200;
const MAX_RECORD_MS = 20000;
/** Minimum clip size worth uploading (a few hundred ms of Opus). */
const MIN_CLIP_BYTES = 2048;
/** Display gain applied on top of the smoothed RMS. */
const METER_GAIN = 3.4;
const MIC_ERROR_KEY = "voice.error.micOpenFailed";
const RECORD_UNSUPPORTED_KEY = "voice.error.recordUnsupported";
const TRANSCRIBE_FAILED_KEY = "voice.error.transcribeFailed";

interface WindowWithLegacyAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

export function getAudioContextCtor(): typeof AudioContext {
  const scope = window as unknown as WindowWithLegacyAudio;
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) throw new Error("Trình duyệt không hỗ trợ Web Audio API");
  return Ctor;
}

export function useMicLevel(enabled: boolean, muted: boolean): MicLevelController {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const levelsRef = useRef<MicMetrics>({ level: 0, displayLevel: 0 });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const maxTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || muted) return;
    let disposed = false;

    const openMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        // A dedicated context normalises the mic and taps it for the level
        // meter. Server TTS plays through its own context, so the assistant's
        // own output can never drive the barge-in meter.
        const Ctor = getAudioContextCtor();
        const ctx = new Ctor();
        const source = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = 1;
        const boost = ctx.createGain();
        boost.gain.value = 0.15;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(gain);
        gain.connect(ctx.destination);
        gain.connect(boost);
        boost.connect(analyser);

        ctxRef.current = ctx;
        analyserRef.current = analyser;
        dataRef.current = new Uint8Array(analyser.fftSize);
        if (ctx.state === "suspended") await ctx.resume();
        setError(null);
        setReady(true);
      } catch {
        if (!disposed) setError(t(MIC_ERROR_KEY));
      }
    };

    void openMic();

    return () => {
      disposed = true;
      setReady(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      analyserRef.current = null;
      dataRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      void ctx?.close().catch(() => undefined);
      levelsRef.current = { level: 0, displayLevel: 0 };
    };
  }, [enabled, muted, t]);

  const sample = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return;

    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const deviation = (data[index] - 128) / 128;
      sum += deviation * deviation;
    }
    const level = Math.min(1, Math.sqrt(sum / data.length));
    const smoothed = levelsRef.current.displayLevel * 0.6 + level * 0.4;
    levelsRef.current = {
      level,
      displayLevel: Math.min(1, Math.max(0, (smoothed - 0.008) * METER_GAIN)),
    };
  }, []);

  const createSilenceDetector = useCallback((stop: () => void): SilenceDetector => {
    let speechSeen = false;
    let silentSince = 0;
    let startedAt = 0;
    return {
      begin() {
        speechSeen = false;
        silentSince = 0;
        startedAt = performance.now();
      },
      ingest(level: number, now: number) {
        if (level > SPEECH_LEVEL) {
          speechSeen = true;
          silentSince = 0;
          return;
        }
        if (!speechSeen || level >= SILENCE_LEVEL) return;
        if (silentSince === 0) {
          silentSince = now;
          return;
        }
        if (now - silentSince >= SILENCE_HOLD_MS && now - startedAt > SILENCE_HOLD_MS) stop();
      },
    };
  }, []);

  /**
   * Records one utterance and hands it back through `onCaptured`
   * (`null` means the clip was too short to be worth transcribing).
   */
  const startRecording = useCallback(
    (onCaptured: (blob: Blob | null) => void): (() => void) => {
      const stream = streamRef.current;
      if (!stream || typeof MediaRecorder === "undefined") {
        setError(t(RECORD_UNSUPPORTED_KEY));
        onCaptured(null);
        return () => undefined;
      }

      const mimeType = ["audio/webm;codecs=opus", "audio/webm", ""].find(
        (candidate) => !candidate || MediaRecorder.isTypeSupported(candidate),
      );
      let recorder: MediaRecorder | null = null;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        try {
          recorder = new MediaRecorder(stream);
        } catch {
          recorder = null;
        }
      }
      if (!recorder) {
        setError(t(RECORD_UNSUPPORTED_KEY));
        onCaptured(null);
        return () => undefined;
      }

      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
        onCaptured(blob.size >= MIN_CLIP_BYTES ? blob : null);
      };

      try {
        recorder.start(250);
      } catch {
        recorderRef.current = null;
        onCaptured(null);
        return () => undefined;
      }

      let finished = false;
      const clearMaxTimer = () => {
        if (maxTimerRef.current !== null) {
          window.clearTimeout(maxTimerRef.current);
          maxTimerRef.current = null;
        }
      };
      const stop = () => {
        if (finished) return;
        finished = true;
        clearMaxTimer();
        const active = recorderRef.current;
        recorderRef.current = null;
        if (active && active.state !== "inactive") {
          try {
            active.stop();
          } catch {
            /* already stopping */
          }
        }
      };

      // The 20 s cap keeps a single utterance from growing without bound.
      maxTimerRef.current = window.setTimeout(stop, MAX_RECORD_MS);
      return stop;
    },
    // `t` is stable per locale; re-creating the recorder on a language switch is fine.
    [t],
  );

  return { ready, error, levels: levelsRef, analyser: analyserRef, sample, startRecording, createSilenceDetector };
}

/** Uploads a recorded clip and returns the transcript (server STT path). */
export async function transcribeClip(blob: Blob, language: string): Promise<string> {
  const result = await api.transcribeAudio(blob, { language });
  return (result.text ?? "").trim();
}

/** i18n key for a failed transcription (keys, not sentences: callers translate). */
export function transcribeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return TRANSCRIBE_FAILED_KEY;
}
