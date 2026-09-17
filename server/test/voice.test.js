import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, closeServer } from "./helpers.js";

const { initDb, all } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");
const { pcmToWav, sampleRateFromMime, isPcmMime } = await import("../src/voice/wav.js");
const { transcribeAudio, synthesizeSpeech, supportsStt, supportsTts } = await import("../src/voice/index.js");

after(async () => {
  await closeServer();
});

// --------------------------------------------------------------- pure helpers

test("pcmToWav writes a valid RIFF/WAVE header with the right sizes", () => {
  const pcm = Buffer.alloc(2000, 7);
  const wav = pcmToWav(pcm, { sampleRate: 24000, channels: 1, bitsPerSample: 16 });
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.subarray(12, 16).toString(), "fmt ");
  assert.equal(wav.readUInt16LE(20), 1); // PCM
  assert.equal(wav.readUInt16LE(22), 1); // mono
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(28), 48000); // byte rate
  assert.equal(wav.readUInt16LE(32), 2); // block align
  assert.equal(wav.subarray(36, 40).toString(), "data");
  assert.equal(wav.readUInt32LE(40), pcm.length);
  assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
  assert.equal(wav.length, 44 + pcm.length);
});

test("mime helpers read the sample rate Gemini reports", () => {
  assert.equal(sampleRateFromMime("audio/L16;codec=pcm;rate=24000"), 24000);
  assert.equal(sampleRateFromMime("audio/L16;rate=16000"), 16000);
  assert.equal(sampleRateFromMime("audio/mpeg"), 24000); // fallback
  assert.equal(isPcmMime("audio/L16;codec=pcm;rate=24000"), true);
  assert.equal(isPcmMime("audio/mpeg"), false);
});

test("capability matrix matches the adapters", () => {
  assert.equal(supportsStt("gemini"), true);
  assert.equal(supportsStt("openai-compatible"), true);
  assert.equal(supportsStt("anthropic"), false);
  assert.equal(supportsStt("mock"), false);
  assert.equal(supportsTts("gemini"), true);
  assert.equal(supportsTts("anthropic"), false);
});

// --------------------------------------------------- request shapes (stubbed)

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return calls;
}

test("gemini STT sends base64 audio plus a transcription instruction", async () => {
  const calls = stubFetch(() =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "  Xin chào fBuddy  " }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );

  const result = await transcribeAudio({
    provider: { name: "Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com", apiKey: "k" },
    model: "gemini-2.5-flash",
    audio: { buffer: Buffer.from("audio-bytes"), mime: "audio/webm" },
    language: "vi",
  });

  assert.equal(result.text, "Xin chào fBuddy");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gemini-2\.5-flash:generateContent$/);
  const body = JSON.parse(calls[0].init.body);
  assert.match(body.contents[0].parts[0].text, /Transcribe this audio verbatim in Vietnamese/);
  assert.equal(body.contents[0].parts[1].inlineData.mimeType, "audio/webm");
  assert.equal(body.contents[0].parts[1].inlineData.data, Buffer.from("audio-bytes").toString("base64"));
  assert.equal(calls[0].init.headers["x-goog-api-key"], "k");
  globalThis.fetch = originalFetch;
});

test("openai-compatible STT posts multipart to /audio/transcriptions", async () => {
  const calls = stubFetch(() =>
    new Response(JSON.stringify({ text: "Báo cáo doanh thu tháng 9" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const result = await transcribeAudio({
    provider: { name: "Groq", kind: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk" },
    model: "whisper-large-v3-turbo",
    audio: { buffer: Buffer.from("webm"), mime: "audio/webm" },
    language: "vi",
  });

  assert.equal(result.text, "Báo cáo doanh thu tháng 9");
  assert.match(calls[0].url, /\/audio\/transcriptions$/);
  assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(calls[0].init.body.get("model"), "whisper-large-v3-turbo");
  assert.equal(calls[0].init.body.get("language"), "vi");
  assert.equal(calls[0].init.headers.Authorization, "Bearer gsk");
  globalThis.fetch = originalFetch;
});

test("gemini TTS output is wrapped into a playable WAV", async () => {
  const pcm = Buffer.alloc(480, 1);
  stubFetch(() =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm.toString("base64") } }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );

  const result = await synthesizeSpeech({
    provider: { name: "Gemini", kind: "gemini", apiKey: "k" },
    model: "gemini-2.5-flash-preview-tts",
    voice: "Kore",
    text: "Xin chào",
  });

  assert.equal(result.mime, "audio/wav");
  assert.equal(result.buffer.subarray(0, 4).toString(), "RIFF");
  assert.equal(result.buffer.readUInt32LE(24), 24000);
  assert.equal(result.buffer.length, 44 + pcm.length);
  assert.equal(result.voice, "Kore");
  globalThis.fetch = originalFetch;
});

test("openai-compatible TTS returns mp3 bytes", async () => {
  const calls = stubFetch(() => new Response(Buffer.from("ID3mp3bytes"), { status: 200 }));
  const result = await synthesizeSpeech({
    provider: { name: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk" },
    model: "tts-1",
    voice: "alloy",
    text: "Xin chào",
  });
  assert.equal(result.mime, "audio/mpeg");
  assert.equal(result.buffer.toString(), "ID3mp3bytes");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "tts-1");
  assert.equal(body.voice, "alloy");
  assert.equal(body.response_format, "mp3");
  globalThis.fetch = originalFetch;
});

test("unsupported provider kinds fail with an actionable message", async () => {
  await assert.rejects(
    () =>
      transcribeAudio({
        provider: { name: "Claude", kind: "anthropic", apiKey: "k" },
        model: "claude-sonnet-4-5",
        audio: { buffer: Buffer.from("x"), mime: "audio/webm" },
      }),
    /chưa hỗ trợ nhận dạng giọng nói/,
  );
  assert.equal(supportsTts("anthropic"), false);
});

// ------------------------------------------------------------ config + routes

test("voice config defaults to the browser pipeline (free, no key)", () => {
  const config = settings.resolveVoiceConfig();
  assert.equal(config.stt.mode, "browser");
  assert.equal(config.tts.mode, "browser");
  assert.equal(config.language, "vi-VN");
  assert.equal(config.autoRead, false);
  assert.equal(config.speakRate, 1);
  assert.deepEqual(config.options, []);
});

test("pointing the voice settings at a provider switches that half to the server", () => {
  const provider = settings.createProvider({
    name: "Gemini voice",
    kind: "gemini",
    apiKey: "AIza-test-key",
    models: ["gemini-2.5-flash"],
  });
  settings.patchAppSettings({ voiceSttProviderId: provider.id, voiceTtsProviderId: provider.id });

  const config = settings.resolveVoiceConfig();
  assert.equal(config.stt.mode, "server");
  assert.equal(config.stt.providerId, provider.id);
  assert.equal(config.stt.model, "gemini-2.5-flash");
  assert.equal(config.tts.mode, "server");
  assert.equal(config.tts.model, "gemini-2.5-flash-preview-tts");
  assert.equal(config.tts.voice, "Kore");
  assert.equal(config.options.length, 1);
  assert.equal(config.options[0].supportsStt, true);
  assert.equal(config.options[0].defaultTtsVoice, "Kore");

  // A disabled provider silently falls back to the browser path.
  settings.updateProvider(provider.id, { enabled: false });
  const off = settings.resolveVoiceConfig();
  assert.equal(off.stt.mode, "browser");
  settings.updateProvider(provider.id, { enabled: true });
  settings.patchAppSettings({ voiceSttProviderId: null, voiceTtsProviderId: null });
});

test("GET /api/voice/config requires auth and returns the browser hint", async () => {
  const anon = await apiRaw("GET", "/voice/config");
  assert.equal(anon.status, 401);

  const { token } = await (async () => {
    const { createUser, issueToken } = await import("../src/auth.js");
    const existing = all("users", "email = ?", ["voice@fbuddy.test"])[0];
    const user = existing ?? createUser({ email: "voice@fbuddy.test", password: "matkhau12345", name: "Voice" });
    return { token: issueToken(user) };
  })();

  const result = await api("GET", "/voice/config", undefined, token);
  assert.equal(result.config.stt.mode, "browser");
  assert.match(result.browserHint, /Edge|trình duyệt/i);
});

test("server voice endpoints refuse politely while the browser handles voice", async () => {
  const { token } = await (async () => {
    const { createUser, issueToken } = await import("../src/auth.js");
    const existing = all("users", "email = ?", ["voice2@fbuddy.test"])[0];
    const user = existing ?? createUser({ email: "voice2@fbuddy.test", password: "matkhau12345" });
    return { token: issueToken(user) };
  })();

  const transcribe = await apiRaw("POST", "/voice/transcribe", { audio: "x" }, token);
  assert.equal(transcribe.status, 400);
  assert.match((await transcribe.json()).error.message, /dùng trình duyệt|trình duyệt/i);

  const speech = await apiRaw("POST", "/voice/speech", { text: "xin chào" }, token);
  assert.equal(speech.status, 400);
  assert.match((await speech.json()).error.message, /trình duyệt/i);
});

test("server voice endpoints reach the provider once configured (stubbed fetch)", async () => {
  const provider = settings.createProvider({
    name: "Groq voice",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: "gsk-test",
    models: ["whisper-large-v3-turbo"],
  });
  settings.patchAppSettings({ voiceSttProviderId: provider.id, voiceSttModel: "whisper-large-v3-turbo" });

  const { token } = await (async () => {
    const { createUser, issueToken } = await import("../src/auth.js");
    const existing = all("users", "email = ?", ["voice3@fbuddy.test"])[0];
    const user = existing ?? createUser({ email: "voice3@fbuddy.test", password: "matkhau12345" });
    return { token: issueToken(user) };
  })();

  const { baseUrl } = await bootServer();
  // Keep the real fetch for our own HTTP call — the stub must only intercept the
  // provider request, otherwise the test would read its own fake response.
  const httpFetch = globalThis.fetch;
  const calls = stubFetch(() =>
    new Response(JSON.stringify({ text: "nội dung nhận dạng" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const form = new FormData();
  form.append("audio", new Blob([Buffer.from("webm-bytes")], { type: "audio/webm" }), "speech.webm");
  form.append("language", "vi");
  const response = await httpFetch(`${baseUrl}/api/voice/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.text, "nội dung nhận dạng", JSON.stringify(json));
  assert.equal(json.provider, "Groq voice", JSON.stringify(json));
  assert.match(calls[0].url, /^https:\/\/api\.groq\.com\/openai\/v1\/audio\/transcriptions$/);

  globalThis.fetch = originalFetch;
  settings.patchAppSettings({ voiceSttProviderId: null, voiceSttModel: null });
  settings.updateProvider(provider.id, { enabled: false });
});
