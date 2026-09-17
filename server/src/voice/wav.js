/**
 * Voice adapters — speech-to-text and text-to-speech.
 *
 * The default is the browser (Web Speech API + SpeechSynthesis): free, no key,
 * nothing to install. When an admin points the voice settings at a provider row
 * (Gemini free tier, Groq free tier, OpenAI-compatible…) the server does the
 * work instead, which keeps quality identical on every device.
 */

/** Wraps raw PCM in a WAV container so browsers can play Gemini's TTS output. */
export function pcmToWav(pcm, { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {}) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Gemini returns `audio/L16;codec=pcm;rate=24000` — pull the rate out of it. */
export function sampleRateFromMime(mime, fallback = 24000) {
  const match = /rate=(\d+)/i.exec(String(mime ?? ""));
  return match ? Number(match[1]) : fallback;
}

export function isPcmMime(mime) {
  return /audio\/l16|codec=pcm|audio\/pcm/i.test(String(mime ?? ""));
}

export function clampSpeech(text, maxChars = 4000) {
  const value = String(text ?? "").trim();
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}…`;
}
