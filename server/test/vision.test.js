import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import { initDb, db } from "../src/db.js";

initDb();
const settings = await import("../src/settings.js");
const providers = await import("../src/providers/index.js");
const { applyVisionFallback } = await import("../src/vision-fallback.js");
const vision = await import("../src/skills/vision.js");
const { parseCsvBlock } = vision;

/** Minimal 1×1 PNG so `asImagePayload` is happy. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

function resetProviders() {
  db.prepare("DELETE FROM providers").run();
  settings.patchAppSettings({
    defaultProviderId: null,
    defaultModel: null,
    visionProviderId: null,
    visionModel: null,
  });
}

test("a text-only chat model falls back to a vision model for the image", async () => {
  const fakeTarget = { provider: { id: "p_vision", name: "Gemini (thị giác)" }, model: "google/gemini-2.5-flash" };
  const seen = [];
  const notices = [];

  const messages = [
    { role: "system", content: "sys" },
    {
      role: "user",
      content: "Đưa hết data trong ảnh thành excel giúp anh",
      images: [{ mime: "image/jpeg", dataBase64: PNG_BASE64, fileId: "f_1", name: "IMG_3737.jpeg" }],
    },
  ];

  const result = await applyVisionFallback({
    messages,
    provider: { id: "p_glm", name: "GLM" },
    model: "glm-4-flash", // no vision → the gateway answers 400 if we send the image
    user: { id: "u_1" },
    conversationId: "c_1",
    channel: { send: (event, data) => notices.push({ event, message: data?.message }) },
    resolveTarget: () => fakeTarget,
    readImage: async (args, ctx) => {
      seen.push({ args, ctx });
      return { data: { text: "Tên,Số lượng\nGạo,10\nĐường,5" } };
    },
  });

  assert.equal(result.applied, true);
  assert.equal(result.read, 1);
  assert.equal(result.providerName, "Gemini (thị giác)");
  assert.equal(seen.length, 1, "phải đọc đúng một ảnh");
  assert.equal(seen[0].args.fileId, "f_1");
  assert.equal(seen[0].ctx.userId, "u_1");

  const userMessage = messages.at(-1);
  assert.deepEqual(userMessage.images, [], "ảnh phải được bỏ khỏi request vì model không xem được");
  assert.match(userMessage.content, /Đưa hết data trong ảnh/);
  assert.match(userMessage.content, /Nội dung ảnh "IMG_3737\.jpeg" \(id: f_1\) do Gemini \(thị giác\) đọc được/);
  assert.match(userMessage.content, /Gạo,10/, "dữ liệu đọc được phải nằm trong ngữ cảnh");

  assert.equal(notices.length, 2, "một notice bắt đầu, một notice kết thúc");
  assert.match(notices[0].message, /đang đọc ảnh bằng Gemini/);
  assert.match(notices[1].message, /Đã đọc 1 ảnh/);});

test("the fallback does nothing when the chosen model can already see", async () => {
  const messages = [
    { role: "user", content: "ảnh gì đây", images: [{ mime: "image/png", dataBase64: PNG_BASE64, fileId: "f_2", name: "a.png" }] },
  ];
  let readCalled = false;
  const result = await applyVisionFallback({
    messages,
    provider: { id: "p_or", name: "OpenRouter" },
    model: "google/gemini-2.5-flash",
    user: { id: "u_1" },
    channel: { send: () => {} },
    resolveTarget: () => {
      throw new Error("không được gọi");
    },
    readImage: async () => {
      readCalled = true;
      return { data: { text: "x" } };
    },
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "model_sees_images");
  assert.equal(readCalled, false);
  assert.equal(messages[0].images.length, 1, "ảnh vẫn được gửi thẳng cho model có thị giác");
});

test("without any vision model the image is dropped and the user is told what to configure", async () => {
  const messages = [
    { role: "user", content: "đọc ảnh", images: [{ mime: "image/png", dataBase64: PNG_BASE64, fileId: "f_3", name: "b.png" }] },
  ];
  const notices = [];
  const result = await applyVisionFallback({
    messages,
    provider: { id: "p_glm", name: "GLM" },
    model: "glm-4-flash",
    user: { id: "u_1" },
    channel: { send: (event, data) => notices.push(data?.message) },
    resolveTarget: () => null,
    readImage: async () => {
      throw new Error("không được gọi");
    },
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "no_vision_provider");
  assert.deepEqual(messages[0].images, []);
  assert.match(notices[0], /chưa có model thị giác nào/);
  assert.match(notices[0], /Cài đặt → Nhà cung cấp AI/);
});

test("a failing OCR call never breaks the turn", async () => {
  const messages = [
    { role: "user", content: "đọc ảnh", images: [{ mime: "image/png", dataBase64: PNG_BASE64, fileId: "f_4", name: "c.png" }] },
  ];
  const notices = [];
  const result = await applyVisionFallback({
    messages,
    provider: { id: "p_glm", name: "GLM" },
    model: "glm-4-flash",
    user: { id: "u_1" },
    channel: { send: (event, data) => notices.push(data?.message) },
    resolveTarget: () => ({ provider: { id: "p_v", name: "Vision" }, model: "m" }),
    readImage: async () => {
      throw new Error("provider 429");
    },
  });
  assert.equal(result.applied, true);
  assert.equal(result.read, 0);
  assert.deepEqual(messages[0].images, []);
  assert.doesNotMatch(messages[0].content, /Nội dung ảnh/);
  assert.match(notices.at(-1), /không đọc được ảnh này/);
});

test("vision target resolution picks a model that really accepts images", () => {
  resetProviders();
  const glm = settings.createProvider({ name: "GLM", kind: "glm", apiKey: "k", models: ["glm-4-flash"] });
  settings.createProvider({ name: "DeepSeek", kind: "openai-compatible", apiKey: "k", models: ["deepseek-chat"] });
  const openrouter = settings.createProvider({
    name: "OpenRouter",
    kind: "openrouter",
    apiKey: "k",
    models: ["google/gemini-2.5-flash"],
  });
  settings.patchAppSettings({ defaultProviderId: glm.id, defaultModel: "glm-4-flash" });

  const auto = settings.resolveVisionTarget({});
  assert.ok(auto, "phải tìm được model thị giác");
  assert.equal(auto.row.id, openrouter.id);
  assert.equal(auto.model, "google/gemini-2.5-flash");
  assert.equal(providers.modelAcceptsImages(auto.provider, auto.model), true);

  // Pinning a vision model on the GLM provider wins over the auto choice.
  settings.updateProvider(glm.id, { models: ["glm-4-flash", "glm-4v-flash"] });
  settings.patchAppSettings({ visionProviderId: glm.id, visionModel: "glm-4v-flash" });
  const pinned = settings.resolveVisionTarget({});
  assert.equal(pinned.row.id, glm.id);
  assert.equal(pinned.model, "glm-4v-flash");

  // No vision model anywhere → null, so the caller can explain what to configure.
  settings.updateProvider(glm.id, { models: ["glm-4-flash"] });
  settings.patchAppSettings({ visionProviderId: glm.id, visionModel: null });
  db.prepare("DELETE FROM providers").run();
  settings.createProvider({ name: "GLM", kind: "glm", apiKey: "k", models: ["glm-4-flash"] });
  assert.equal(settings.resolveVisionTarget({}), null);
  resetProviders();
});

test("a photo with a table AND other text asks before choosing what to export", () => {
  const { extraText, excelChoices, planXlsxFromImage } = vision;
  const ocr = [
    "- 4. Comparing Phones. Table 1.7 shows data for eight phones (Consumer Reports).",
    "- a. How many elements are in this data set?",
    "```csv\nBrand,Price ($)\nAT&T,60\nPanasonic,100\n```",
    "- 5. Summarizing Phone Data. Refer to Table 1.7.",
  ].join("\n");
  const table = { columns: ["Brand", "Price ($)"], rows: [["AT&T", "60"], ["Panasonic", "100"]] };

  assert.match(extraText(ocr), /Comparing Phones/);
  assert.doesNotMatch(extraText(ocr), /Brand,Price/, "phần bảng không tính là chữ khác");

  const choices = excelChoices("f_9", "IMG_1.jpeg");
  assert.deepEqual(choices.map((choice) => choice.id), ["table+text", "table", "text", "retry"]);
  assert.ok(choices.every((choice) => choice.label && choice.value));
  assert.match(choices[0].value, /f_9/, "lựa chọn phải mang theo id ảnh");

  // No mode chosen + extra text present ⇒ ask instead of exporting silently.
  const ask = planXlsxFromImage({ table, text: ocr, fileId: "f_9", fileName: "IMG_1.jpeg" });
  assert.equal(ask.needsChoice, true);
  assert.deepEqual(ask.sheets, []);
  assert.equal(ask.choices.length, 4);
  assert.ok(ask.extraChars > 120);

  // Choosing "chỉ bảng" must NOT include the extra text…
  const tableOnly = planXlsxFromImage({ table, text: ocr, mode: "table" });
  assert.equal(tableOnly.needsChoice, false);
  assert.equal(tableOnly.sheets.length, 1);
  assert.deepEqual(tableOnly.sheets[0].columns, ["Brand", "Price ($)"]);
  assert.equal(tableOnly.sheets[0].totalsRow, true);

  // …while "cả hai" adds a second sheet with the leftover text…
  const both = planXlsxFromImage({ table, text: ocr, mode: "table+text" });
  assert.equal(both.sheets.length, 2);
  assert.equal(both.sheets[1].name, "Noi dung khac");
  assert.ok(both.sheets[1].rows.length >= 3);

  // …and "chỉ chữ" exports just the text.
  const textOnly = planXlsxFromImage({ table, text: ocr, mode: "text" });
  assert.equal(textOnly.sheets.length, 1);
  assert.deepEqual(textOnly.sheets[0].columns, ["Nội dung"]);
  assert.ok(textOnly.sheets[0].rows.every((row) => row.length === 1));

  // A table with no extra text exports immediately, no question asked.
  const clean = planXlsxFromImage({ table, text: "```csv\nBrand,Price\nAT&T,60\n```" });
  assert.equal(clean.needsChoice, false);
  assert.equal(clean.sheets.length, 1);
});

test("the scope comes from the user's own words, not from the model's argument", () => {
  const { modeFromUserText } = vision;
  // The option buttons send these exact phrasings.
  assert.equal(modeFromUserText("Chỉ lấy bảng trong ảnh IMG_1.jpeg vào Excel (id: f_9)"), "table");
  assert.equal(modeFromUserText("Đưa cả bảng và toàn bộ chữ trong ảnh IMG_1.jpeg vào Excel (id: f_9)"), "table+text");
  assert.equal(modeFromUserText("Chỉ lấy phần chữ trong ảnh IMG_1.jpeg vào Excel (id: f_9)"), "text");
  assert.equal(modeFromUserText("Đưa hết data trong ảnh thành excel giúp anh"), null);
  assert.equal(modeFromUserText("table only please"), "table");
  assert.equal(modeFromUserText("export both table and text"), "table+text");
  assert.equal(modeFromUserText(""), null);
});

test("csv blocks from the vision model become a table for generate_xlsx", () => {  const table = parseCsvBlock('Đây là bảng:\n```csv\nTên,Số lượng,Đơn giá\nGạo,10,15000\n"Đường trắng",5,22000\n```\nHết.');
  assert.deepEqual(table.columns, ["Tên", "Số lượng", "Đơn giá"]);
  assert.deepEqual(table.rows, [
    ["Gạo", "10", "15000"],
    ["Đường trắng", "5", "22000"],
  ]);
  assert.equal(parseCsvBlock("không có bảng nào"), null);
  assert.equal(parseCsvBlock("```csv\nchỉ-một-dòng\n```"), null);
});
