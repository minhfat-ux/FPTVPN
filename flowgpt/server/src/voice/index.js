import { readJson } from "../providers/sse.js";
import { sampleRateFromMime, isPcmMime, clampSpeech, pcmToWav } from "./wav.js";
import { ApiError } from "../util.js";

/**
 * Speech-to-text for server-side providers.
 *
 * - `gemini`             → audio understanding on a normal Gemini model (free tier)
 * - `openai-compatible`  → POST /audio/transcriptions (Groq `whisper-large-v3-turbo`, OpenAI, …)
 *
 * The request shapes are asserted in server/test/voice.test.js with a stubbed
 * fetch, so both paths stay correct without spending money on tests.
 */

export function supportsStt(kind) {
  return kind === "gemini" || kind === "openai-compatible" || kind === "openai";
}

export async function transcribeAudio({ provider, model, audio, language = "vi", signal, hint = "" }) {
  if (!provider) throw new ApiError(400, "bad_request", "Chưa cấu hình nhà cung cấp cho nhận dạng giọng nói");
  if (!audio?.buffer?.length) throw new ApiError(400, "bad_request", "Thiếu dữ liệu âm thanh");
  if (!model) throw new ApiError(400, "bad_request", `Nhà cung cấp "${provider.name}" chưa có model cho STT`);

  switch (provider.kind) {
    case "gemini":
      return geminiTranscribe({ provider, model, audio, language, signal, hint });
    case "openai":
    case "openai-compatible":
      return openAiTranscribe({ provider, model, audio, language, signal, hint });
    default:
      throw new ApiError(
        400,
        "bad_request",
        `Nhà cung cấp "${provider.name}" (${provider.kind}) chưa hỗ trợ nhận dạng giọng nói trên server. Dùng trình duyệt hoặc chọn Gemini/Groq/OpenAI.`,
      );
  }
}

const LANGUAGE_NAMES = { vi: "Vietnamese", en: "English", zh: "Chinese", ja: "Japanese", ko: "Korean" };

async function geminiTranscribe({ provider, model, audio, language, signal, hint }) {
  const base = String(provider.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const started = Date.now();
  const langName = LANGUAGE_NAMES[language] ?? language;
  const instruction = [
    `Transcribe this audio verbatim in ${langName}.`,
    "Return only the transcript text — no quotes, no timestamps, no commentary.",
    "Keep technical terms, product names and numbers exactly as spoken.",
    hint ? `Context (may help with names): ${hint}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": provider.apiKey },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: instruction },
            { inlineData: { mimeType: audio.mime || "audio/webm", data: audio.buffer.toString("base64") } },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    }),
  });
  const json = await readJson(response, { providerName: provider.name });
  const text = (json?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new ApiError(502, "provider_error", "Gemini không trả về nội dung thoại nào");
  return { text, provider: provider.name, model, durationMs: Date.now() - started };
}

async function openAiTranscribe({ provider, model, audio, language, signal, hint }) {
  const base = String(provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const started = Date.now();
  const form = new FormData();
  form.append("model", model);
  form.append(
    "file",
    new Blob([audio.buffer], { type: audio.mime || "audio/webm" }),
    audio.name || "speech.webm",
  );
  if (language) form.append("language", language);
  form.append("response_format", "json");
  if (hint) form.append("prompt", clampSpeech(hint, 800));

  const response = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    body: form,
  });
  const json = await readJson(response, { providerName: provider.name });
  const text = String(json?.text ?? "").trim();
  if (!text) throw new ApiError(502, "provider_error", `${provider.name} không trả về nội dung thoại nào`);
  return { text, provider: provider.name, model, durationMs: Date.now() - started };
}

/**
 * Text-to-speech for server-side providers.
 *
 * - `gemini`            → TTS model, returns PCM that we wrap in a WAV container
 * - `openai-compatible` → POST /audio/speech (OpenAI `tts-1`, `gpt-4o-mini-tts`, …)
 */
export function supportsTts(kind) {
  return kind === "gemini" || kind === "openai" || kind === "openai-compatible";
}

export async function synthesizeSpeech({ provider, model, voice, text, language = "vi", signal }) {
  if (!provider) throw new ApiError(400, "bad_request", "Chưa cấu hình nhà cung cấp cho đọc văn bản");
  const content = clampSpeech(text);
  if (!content) throw new ApiError(400, "bad_request", "Không có nội dung để đọc");
  if (!model) throw new ApiError(400, "bad_request", `Nhà cung cấp "${provider.name}" chưa có model cho TTS`);

  switch (provider.kind) {
    case "gemini":
      return geminiSpeech({ provider, model, voice, text: content, signal });
    case "openai":
    case "openai-compatible":
      return openAiSpeech({ provider, model, voice, text: content, signal });
    default:
      throw new ApiError(
        400,
        "bad_request",
        `Nhà cung cấp "${provider.name}" (${provider.kind}) chưa hỗ trợ đọc văn bản trên server.`,
      );
  }
}

async function geminiSpeech({ provider, model, voice, text, signal }) {
  const base = String(provider.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const voiceName = voice || "Kore";
  const response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": provider.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    }),
  });
  const json = await readJson(response, { providerName: provider.name });
  const part = (json?.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!part) throw new ApiError(502, "provider_error", "Gemini không trả về audio");
  const raw = Buffer.from(part.inlineData.data, "base64");
  const mime = part.inlineData.mimeType ?? "audio/L16;rate=24000";
  if (isPcmMime(mime)) {
    return {
      buffer: pcmToWav(raw, { sampleRate: sampleRateFromMime(mime) }),
      mime: "audio/wav",
      voice: voiceName,
      model,
    };
  }
  return { buffer: raw, mime: mime.split(";")[0] || "audio/wav", voice: voiceName, model };
}

async function openAiSpeech({ provider, model, voice, text, signal }) {
  const base = String(provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${base}/audio/speech`, {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: text,
      voice: voice || "alloy",
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    await readJson(response, { providerName: provider.name });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new ApiError(502, "provider_error", `${provider.name} không trả về audio`);
  return { buffer, mime: "audio/mpeg", voice: voice || "alloy", model };
}
