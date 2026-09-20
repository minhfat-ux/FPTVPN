// Model dự phòng cho model mặc định (yêu cầu chủ dự án 2026-09-20):
// model chính chết ⇒ lượt chat chạy bằng cặp dự phòng ĐÃ CẤU HÌNH, không tự chọn bừa.
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

function provider(name, models, defaultModel, { key = "sk-test-0123456789" } = {}) {
  return settings.createProvider({
    name,
    kind: "openai",
    baseUrl: "https://example.test/v1",
    apiKey: key,
    models,
    defaultModel,
  });
}

test("model mặc định không dùng được ⇒ chạy bằng model dự phòng đã cấu hình", () => {
  const main = provider("Chính", ["glm-4-flash"], "glm-4-flash");
  const backup = provider("Dự phòng", ["deepseek-chat"], "deepseek-chat");
  settings.patchAppSettings({
    defaultProviderId: main.id,
    defaultModel: "glm-4-flash",
    fallbackProviderId: backup.id,
    fallbackModel: "deepseek-chat",
  });

  // Chưa cấu hình gì thêm: lượt chat bình thường vẫn dùng model chính.
  const normal = settings.resolveProviderForChat({});
  assert.equal(normal.provider.id, main.id);
  assert.equal(normal.model, "glm-4-flash");
  assert.equal(normal.usedFallbackModel, false);

  // Nhà cung cấp chính bị TẮT (hết credit/key hỏng) ⇒ phải rơi về đúng cặp dự phòng.
  settings.updateProvider(main.id, { enabled: false });
  const afterDisable = settings.resolveProviderForChat({});
  assert.equal(afterDisable.provider.id, backup.id, "phải dùng nhà cung cấp dự phòng");
  assert.equal(afterDisable.model, "deepseek-chat");
  assert.equal(afterDisable.usedFallbackModel, true);

  settings.patchAppSettings({ defaultProviderId: null, defaultModel: null, fallbackProviderId: null, fallbackModel: null });
  settings.deleteProvider(main.id);
  settings.deleteProvider(backup.id);
});

test("dự phòng trỏ nhà cung cấp đã xoá/tắt thì bị bỏ qua, không làm chậm lượt chat", () => {
  const main = provider("Chính2", ["glm-4-flash"], "glm-4-flash");
  const dead = provider("Dự phòng chết", ["x"], "x");
  settings.patchAppSettings({
    defaultProviderId: main.id,
    defaultModel: "glm-4-flash",
    fallbackProviderId: dead.id,
    fallbackModel: "x",
  });
  settings.deleteProvider(dead.id);
  assert.equal(settings.resolveFallbackTarget(), null, "cặp dự phòng đã xoá ⇒ coi như không có");

  settings.updateProvider(main.id, { enabled: false });
  // Không còn gì dùng được ⇒ báo lỗi rõ ràng (không thử nhà cung cấp đã xoá).
  let failed = false;
  try {
    settings.resolveProviderForChat({});
  } catch (error) {
    failed = true;
    assert.match(error.message, /Chưa có nhà cung cấp AI nào/);
  }
  assert.ok(failed, "phải ném lỗi rõ ràng");

  settings.patchAppSettings({ defaultProviderId: null, defaultModel: null, fallbackProviderId: null, fallbackModel: null });
  settings.deleteProvider(main.id);
});

test("model dự phòng lạ (không thuộc nhà cung cấp dự phòng) ⇒ dùng model mặc định của nó", () => {
  const main = provider("Chính3", ["glm-4-flash"], "glm-4-flash");
  const backup = provider("Dự phòng3", ["deepseek-chat", "deepseek-reasoner"], "deepseek-chat");
  settings.patchAppSettings({
    defaultProviderId: main.id,
    defaultModel: "glm-4-flash",
    fallbackProviderId: backup.id,
    fallbackModel: "model-khong-ton-tai",
  });
  const target = settings.resolveFallbackTarget();
  assert.equal(target.provider.id, backup.id);
  assert.equal(target.model, "deepseek-chat", "phải rơi về model mặc định của nhà cung cấp dự phòng");

  settings.patchAppSettings({ defaultProviderId: null, defaultModel: null, fallbackProviderId: null, fallbackModel: null });
  settings.deleteProvider(main.id);
  settings.deleteProvider(backup.id);
});
