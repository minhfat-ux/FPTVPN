import { readJson } from "./sse.js";
import * as mock from "./mock.js";

/**
 * Image generation / editing across providers.
 * Returns { mime, dataBase64, note? } or throws an Error with code 'provider_error'.
 */

const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash-image",
  openai: "gpt-image-1",
};

export function defaultImageModel(kind) {
  return DEFAULT_MODELS[kind] ?? null;
}

export async function generateImage({ provider, model, prompt, image, signal, size = "1024x1024" }) {
  const chosen = model || provider.imageModel || defaultImageModel(provider.kind);
  if (!chosen) {
    const error = new Error(
      `Nhà cung cấp "${provider.name}" chưa cấu hình model ảnh (imageModel).`,
    );
    error.code = "provider_error";
    error.status = 400;
    throw error;
  }
  switch (provider.kind) {
    case "gemini":
      return geminiImage({ provider, model: chosen, prompt, image, signal });
    case "openai":
    case "openai-compatible":
      return openAiImage({ provider, model: chosen, prompt, image, signal, size });
    case "mock":
      return mock.generateImage({ image, prompt });
    default:
      throw unsupported(provider);
  }
}

function unsupported(provider) {
  const error = new Error(
    `Nhà cung cấp "${provider.name}" (${provider.kind}) không hỗ trợ tạo/sửa ảnh. ` +
      "Hãy cấu hình một provider Gemini hoặc OpenAI có model ảnh.",
  );
  error.code = "provider_error";
  error.status = 400;
  return error;
}

async function geminiImage({ provider, model, prompt, image, signal }) {
  const base = String(provider.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const parts = [{ text: prompt }];
  if (image?.dataBase64) {
    parts.push({ inlineData: { mimeType: image.mime, data: image.dataBase64 } });
  }
  const response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": provider.apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts }] }),
  });
  const json = await readJson(response, { providerName: provider.name });
  const outParts = json?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = outParts.find((p) => p.inlineData?.data);
  if (!imagePart) {
    const error = new Error(
      `Gemini không trả về ảnh. Phản hồi: ${JSON.stringify(outParts).slice(0, 300)}`,
    );
    error.code = "provider_error";
    error.status = 502;
    throw error;
  }
  return {
    mime: imagePart.inlineData.mimeType ?? "image/png",
    dataBase64: imagePart.inlineData.data,
    note: outParts.find((p) => p.text)?.text?.slice(0, 300) ?? null,
  };
}

async function openAiImage({ provider, model, prompt, image, signal, size }) {
  const base = String(provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${provider.apiKey}` };

  if (image?.dataBase64) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append(
      "image",
      new Blob([Buffer.from(image.dataBase64, "base64")], { type: image.mime || "image/png" }),
      image.name || "image.png",
    );
    const response = await fetch(`${base}/images/edits`, { method: "POST", signal, headers: auth, body: form });
    const json = await readJson(response, { providerName: provider.name });
    return { mime: "image/png", dataBase64: firstImage(json) };
  }

  const response = await fetch(`${base}/images/generations`, {
    method: "POST",
    signal,
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size, n: 1 }),
  });
  const json = await readJson(response, { providerName: provider.name });
  return { mime: "image/png", dataBase64: firstImage(json) };
}

function firstImage(json) {
  const entry = json?.data?.[0];
  if (!entry) {
    const error = new Error("Nhà cung cấp không trả về ảnh.");
    error.code = "provider_error";
    error.status = 502;
    throw error;
  }
  if (entry.b64_json) return entry.b64_json;
  const error = new Error(
    "Nhà cung cấp chỉ trả URL ảnh (chưa hỗ trợ). Dùng model trả b64_json (ví dụ gpt-image-1).",
  );
  error.code = "provider_error";
  error.status = 502;
  throw error;
}
