// BUG-20260920-003: xoá nhà cung cấp (OpenRouter) rồi mà lượt chat vẫn gửi kèm model cũ
// ⇒ server gọi nhà cung cấp KHÁC bằng model của OpenRouter ⇒ lỗi "model không tồn tại"
// ⇒ phải retry/failover ⇒ người dùng thấy lỗi OpenRouter và app chậm hẳn.
import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeServer } from "./helpers.js";

const { initDb } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");

after(async () => {
  await closeServer();
});

function freshProvider(name, { kind = "openai", baseUrl, models, defaultModel }) {
  return settings.createProvider({
    name,
    kind,
    baseUrl,
    apiKey: "sk-test-key-0123456789",
    models,
    defaultModel,
  });
}

test("model của nhà cung cấp đã xoá KHÔNG bị dùng cho nhà cung cấp khác", () => {
  const gone = freshProvider("OpenRouter", {
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-4o-mini"],
    defaultModel: "openai/gpt-4o-mini",
  });
  const alive = freshProvider("GLM", {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-flash"],
    defaultModel: "glm-4-flash",
  });
  settings.patchAppSettings({ defaultProviderId: alive.id, defaultModel: "glm-4-flash" });

  // Client cũ vẫn gửi providerId + model của OpenRouter.
  settings.deleteProvider(gone.id);
  const turn = settings.resolveProviderForChat({ providerId: gone.id, model: "openai/gpt-4o-mini" });

  assert.equal(turn.provider.id, alive.id, "phải dùng nhà cung cấp còn sống");
  assert.equal(turn.model, "glm-4-flash", "KHÔNG được gửi model của OpenRouter sang GLM");
  assert.equal(turn.ignoredModel?.model, "openai/gpt-4o-mini");
  assert.equal(turn.ignoredModel?.reason, "provider_gone");
  assert.equal(turn.fallbackFrom?.reason, "provider_gone", "UI cần biết lý do để giải thích");

  settings.deleteProvider(alive.id);
});

test("model lạ (không có trong danh sách của nhà cung cấp) bị bỏ, dùng model mặc định", () => {
  const provider = freshProvider("DeepSeek", {
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
  });
  settings.patchAppSettings({ defaultProviderId: provider.id, defaultModel: "deepseek-chat" });

  const turn = settings.resolveProviderForChat({ providerId: provider.id, model: "openai/gpt-4o-mini" });
  assert.equal(turn.provider.id, provider.id);
  assert.equal(turn.model, "deepseek-chat");
  assert.equal(turn.ignoredModel?.reason, "model_not_in_provider");

  // Model hợp lệ của chính nhà cung cấp thì phải được giữ nguyên.
  const ok = settings.resolveProviderForChat({ providerId: provider.id, model: "deepseek-reasoner" });
  assert.equal(ok.model, "deepseek-reasoner");
  assert.equal(ok.ignoredModel, null);

  settings.deleteProvider(provider.id);
});

test("defaultModel trỏ model của nhà cung cấp đã xoá thì cũng không gửi bừa", () => {
  const provider = freshProvider("Gemini", {
    baseUrl: "https://generativelanguage.googleapis.com",
    models: ["gemini-2.5-flash"],
    defaultModel: "gemini-2.5-flash",
  });
  // Cấu hình cũ còn sót model của OpenRouter trong Cài đặt.
  settings.patchAppSettings({ defaultProviderId: provider.id, defaultModel: "openai/gpt-4o-mini" });

  const turn = settings.resolveProviderForChat({});
  assert.equal(turn.model, "gemini-2.5-flash", "phải rơi về model mặc định của nhà cung cấp");
  assert.equal(turn.ignoredModel?.reason, "model_not_in_provider");

  settings.patchAppSettings({ defaultProviderId: null, defaultModel: null });
  settings.deleteProvider(provider.id);
});
