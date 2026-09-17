import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal local typings for the Web Speech API.
 *
 * The DOM lib shipped with TypeScript does not know `SpeechRecognition` /
 * `webkitSpeechRecognition`, so the interfaces are declared here (no `@types`
 * package is available in this workspace).
 */

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Reads the vendor-prefixed constructor Chrome/Edge expose. */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

/** Vietnamese explanation for every error code the browser can report. */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Anh/chị cần cho phép dùng micro trong trình duyệt.";
    case "network":
      return "Không kết nối được dịch vụ nhận dạng của trình duyệt (có thể bị chặn ở Trung Quốc). Vào Cài đặt → Giọng nói để chọn nhà cung cấp STT.";
    case "audio-capture":
      return "Không tìm thấy micro.";
    case "no-speech":
    case "aborted":
      return null;
    default:
      return "Nhận dạng giọng nói gặp lỗi, vui lòng thử lại.";
  }
}

export interface SpeechRecognitionOptions {
  /** BCP-47 tag, e.g. "vi-VN". */
  language: string;
  /** Keep listening after the first utterance (default true). */
  continuous?: boolean;
  /** Emit partial transcripts through `onInterim` (default true). */
  interimResults?: boolean;
  /** One finished utterance. */
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string, code: string) => void;
}

export interface SpeechRecognitionController {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/** Chrome ends the session after a silence; restarting keeps hands-free mode alive. */
const RESTART_DELAY_MS = 350;
/** Hard stop for one utterance sent to chat — protects the request body. */
const MAX_UTTERANCE_CHARS = 2000;

export function useSpeechRecognition(options: SpeechRecognitionOptions): SpeechRecognitionController {
  const [supported] = useState<boolean>(() => isSpeechRecognitionSupported());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** The latest callbacks, so the recognition instance never has to be rebuilt. */
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  }, [options]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const startedRef = useRef(false);
  const pendingRef = useRef("");
  const restartTimer = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearRestart = useCallback(() => {
    if (restartTimer.current !== null) {
      window.clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  }, []);

  const buildRecognition = useCallback((): SpeechRecognitionLike | null => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;

    const recognition = new Ctor();
    const current = () => latest.current;
    recognition.lang = current().language;
    recognition.continuous = current().continuous ?? true;
    recognition.interimResults = current().interimResults ?? true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      startedRef.current = true;
      clearRestart();
      if (mountedRef.current) {
        setListening(true);
        setError(null);
      }
    };

    recognition.onresult = (event) => {
      const results = event.results;
      let finalText = "";
      let partial = "";
      for (let index = event.resultIndex ?? 0; index < results.length; index += 1) {
        const result = results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else partial += transcript;
      }

      if (finalText.trim()) {
        // One recognition session can deliver several isFinal results, so the
        // finished utterance is accumulated and only emitted when the session
        // ends (or when `stop()` is requested).
        pendingRef.current = `${pendingRef.current} ${finalText}`.trim();
        pendingRef.current = pendingRef.current.slice(0, MAX_UTTERANCE_CHARS);
        partial = "";
      }

      if (mountedRef.current) setInterim(partial.trim());

      if (!finalText.trim() && partial.trim() && current().interimResults !== false) {
        current().onInterim?.(partial.trim());
      }
    };

    recognition.onerror = (event) => {
      const code = event.error || "unknown";
      if (code === "no-speech" || code === "aborted") return;
      shouldListenRef.current = false;
      const message = speechErrorMessage(code);
      if (message && mountedRef.current) {
        setError(message);
        setListening(false);
      }
      if (message) current().onError?.(message, code);
    };

    recognition.onend = () => {
      startedRef.current = false;
      if (!mountedRef.current) return;

      const text = pendingRef.current.trim();
      pendingRef.current = "";
      if (text) {
        setInterim("");
        latest.current.onFinal(text);
      }

      if (shouldListenRef.current) {
        // Chrome stops after a silence: restart with a small delay so a failing
        // service cannot turn into a restart storm.
        clearRestart();
        restartTimer.current = window.setTimeout(() => {
          restartTimer.current = null;
          if (!mountedRef.current || !shouldListenRef.current) return;
          try {
            recognition.start();
          } catch {
            setListening(false);
            shouldListenRef.current = false;
          }
        }, RESTART_DELAY_MS);
      } else {
        setListening(false);
      }
    };

    return recognition;
  }, [clearRestart]);

  const start = useCallback(() => {
    if (!supported) return;
    if (!recognitionRef.current) recognitionRef.current = buildRecognition();
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (shouldListenRef.current && startedRef.current) return;

    shouldListenRef.current = true;
    clearRestart();
    setError(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      // A stale session can still own the mic — restart after aborting it.
      try {
        recognition.abort();
        window.setTimeout(() => {
          if (mountedRef.current && shouldListenRef.current) {
            try {
              recognition.start();
            } catch {
              shouldListenRef.current = false;
              setListening(false);
            }
          }
        }, RESTART_DELAY_MS);
      } catch {
        shouldListenRef.current = false;
        setListening(false);
      }
    }
  }, [buildRecognition, clearRestart, supported]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    clearRestart();
    setListening(false);
    setInterim("");
    pendingRef.current = "";
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, [clearRestart]);

  const reset = useCallback(() => {
    setError(null);
    setInterim("");
    pendingRef.current = "";
  }, []);

  // `clearRestart` is stable, but the ref keeps this effect truly mount-only.
  const clearRestartRef = useRef(clearRestart);
  clearRestartRef.current = clearRestart;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      shouldListenRef.current = false;
      clearRestartRef.current();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, []);

  return { supported, listening, interim, error, start, stop, reset };
}
