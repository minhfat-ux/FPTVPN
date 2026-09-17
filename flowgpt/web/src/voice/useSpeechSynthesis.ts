import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Markdown is unreadable when spoken, so answers are flattened before synthesis:
 * code fences, inline code, links, emphasis, headings and bullets are removed
 * and whitespace is collapsed.
 */
export function toSpeakableText(input: string): string {
  let text = input ?? "";
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/~~~[\s\S]*?~~~/g, " ");
  text = text.replace(/`([^`]*)`/g, "$1");
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/gi, " ");
  text = text.replace(/^\s{0,3}(#{1,6})\s*/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s{0,3}[-*+]\s+/gm, "");
  text = text.replace(/^\s{0,3}\d+[.)]\s+/gm, "");
  // Horizontal rules first: "***" would otherwise look like emphasis.
  text = text.replace(/^\s{0,3}(?:\*\s*){3,}$/gm, " ");
  text = text.replace(/^\s{0,3}(?:-\s*){3,}$/gm, " ");
  text = text.replace(/^\s{0,3}(?:_\s*){3,}$/gm, " ");
  text = text.replace(/(\*\*)(.*?)\1/g, "$2");
  text = text.replace(/(__)(.*?)\1/g, "$2");
  text = text.replace(/(\*)(.*?)\1/g, "$2");
  text = text.replace(/(_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

/** Splits long answers into sentence-sized utterances (~1200 chars each). */
export function chunkForSpeech(text: string, maxLength = 1200): string[] {
  const clean = toSpeakableText(text).slice(0, maxLength * 8);
  if (!clean) return [];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    const trimmed = current.trim();
    if (trimmed && chunks.length < 40) chunks.push(trimmed);
    current = "";
  };

  // Split after sentence-ending punctuation, then chunk under `maxLength`.
  for (const sentence of clean.split(/(?<=[.!?…])\s+/)) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (piece.length > maxLength) {
      push();
      let rest = piece;
      while (rest.length > maxLength) {
        if (chunks.length < 40) chunks.push(rest.slice(0, maxLength).trim());
        rest = rest.slice(maxLength);
      }
      current = rest;
      continue;
    }
    if (`${current} ${piece}`.trim().length > maxLength) push();
    current = `${current} ${piece}`.trim();
  }
  push();
  return chunks;
}

/** Edge ships free natural Vietnamese voices — prefer them when present. */
const PREFERRED_VOICE = /Hoài My|Hoai My|Nam Minh|Natural|Online/i;

export function isVietnameseVoice(voice: SpeechSynthesisVoice): boolean {
  return /^vi\b/i.test(voice.lang ?? "");
}

export function pickVietnameseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const vietnamese = voices.filter(isVietnameseVoice);
  if (!vietnamese.length) return null;
  return vietnamese.find((voice) => PREFERRED_VOICE.test(voice.name)) ?? vietnamese[0];
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export interface SpeechSynthesisController {
  supported: boolean;
  speaking: boolean;
  voices: SpeechSynthesisVoice[];
  vietnameseVoices: SpeechSynthesisVoice[];
  hasVietnameseVoice: boolean;
  speak: (text: string, opts?: { rate?: number; voiceName?: string | null }) => Promise<void>;
  stop: () => void;
}

export function useSpeechSynthesis(): SpeechSynthesisController {
  const [supported] = useState(() => speechSynthesisSupported());
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  /** Bumped by `stop()` so an in-flight queue aborts between chunks. */
  const generation = useRef(0);
  /** Lets `stop()` settle the pending chunk promise immediately. */
  const pendingFinish = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => {
      const list = synth.getVoices();
      if (list.length) setVoices(list);
    };
    load();
    synth.addEventListener?.("voiceschanged", load);
    // Some Chromium builds only populate the list after the first tick.
    const timer = window.setInterval(load, 1000);
    const stopPolling = window.setTimeout(() => window.clearInterval(timer), 12000);
    return () => {
      synth.removeEventListener?.("voiceschanged", load);
      window.clearInterval(timer);
      window.clearTimeout(stopPolling);
    };
  }, [supported]);

  const vietnameseVoices = useMemo(() => voices.filter(isVietnameseVoice), [voices]);

  const stop = useCallback(() => {
    generation.current += 1;
    setSpeaking(false);
    pendingFinish.current?.();
    pendingFinish.current = null;
    if (!supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }, [supported]);

  const speak = useCallback(
    async (text: string, opts?: { rate?: number; voiceName?: string | null }) => {
      if (!supported) return;
      const chunks = chunkForSpeech(text);
      if (!chunks.length) return;

      const synth = window.speechSynthesis;
      generation.current += 1;
      const token = generation.current;
      synth.cancel();
      setSpeaking(true);

      const rate = clampRate(opts?.rate ?? 1);
      const chosen =
        (opts?.voiceName ? voices.find((voice) => voice.name === opts.voiceName) : null) ??
        pickVietnameseVoice(voices);

      try {
        for (const chunk of chunks) {
          if (token !== generation.current) return;
          await speakChunk(synth, chunk, rate, chosen, (finish) => {
            pendingFinish.current = finish;
          });
        }
      } finally {
        pendingFinish.current = null;
        if (token === generation.current) setSpeaking(false);
      }
    },
    [supported, voices],
  );

  useEffect(
    () => () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return {
    supported,
    speaking,
    voices,
    vietnameseVoices,
    hasVietnameseVoice: vietnameseVoices.length > 0,
    speak,
    stop,
  };
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(2, Math.max(0.5, rate));
}

/**
 * Speaks one chunk. Resolves on `end`/`error`, and also resolves immediately
 * when the promise is handed to `useSpeechSynthesis.stop()`.
 */
function speakChunk(
  synth: SpeechSynthesis,
  text: string,
  rate: number,
  voice: SpeechSynthesisVoice | null,
  register: (finish: () => void) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.lang = voice?.lang ?? "vi-VN";
    if (voice) utterance.voice = voice;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(guard);
      utterance.onend = null;
      utterance.onerror = null;
      register(() => undefined);
      resolve();
    };
    // Safety net: a cancelled utterance does not always fire `end` in Chrome.
    const guard = window.setTimeout(finish, Math.max(8000, text.length * 120));

    register(finish);
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
    // Chrome pauses very long utterances right after queuing them.
    synth.resume();
  });
}
