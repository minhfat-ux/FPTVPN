/**
 * Test cho phần dịch prompt pack — KHÔNG cần mạng, KHÔNG cần provider thật:
 * `streamImpl` và `chooseProvider` đều được bơm giả.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./helpers.js";

const translate = await import("../src/skills/translate.js");
const { initDb } = await import("../src/db.js");
initDb();

const FAKE_PROVIDER = { provider: { name: "Fake" }, model: "fake-model", row: { name: "Fake" } };
const chooseFake = () => FAKE_PROVIDER;

/** Giả lập streamChat: trả lần lượt các mẩu text. */
function streamOf(...chunks) {
  return async function* () {
    for (const chunk of chunks) yield { type: "delta", text: chunk };
    yield { type: "usage", in: 1, out: 1 };
    yield { type: "done", finishReason: "stop" };
  };
}
/** Trả theo thứ tự lời gọi (metadata trước, chỉ dẫn sau). */
function scriptedStream(outputs) {
  let index = 0;
  return async function* () {
    const text = outputs[Math.min(index, outputs.length - 1)];
    index += 1;
    for (const piece of String(text).match(/[\s\S]{1,20}/g) ?? []) yield { type: "delta", text: piece };
  };
}

const FIELDS = {
  name: "邮件营销",
  tagline: "写好每一封邮件",
  description: "从主题到 CTA 的完整方法",
  instructions: "## 第一步：主题行\n先写清楚收件人是谁、为什么现在要打开这封邮件，再给出一个不超过 50 字的主题行，避免夸张词汇。\n## 第二步：正文\n用三段落把价值说清楚，每段不超过三行，最后给一个明确的下一步。\n## 第三步：CTA\n只保留一个行动按钮，文案用动词开头。",
};

test("completeOnce gom delta thành văn bản, bỏ qua usage/done", async () => {
  const text = await translate.completeOnce({
    provider: FAKE_PROVIDER.provider, model: "m", user: "x", streamImpl: streamOf("Xin ", "chào ", "bạn"),
  });
  assert.equal(text, "Xin chào bạn");
});

test("completeOnce ném lỗi khi provider trả sự kiện error", async () => {
  const failing = async function* () { yield { type: "error", message: "hết quota" }; };
  await assert.rejects(
    () => translate.completeOnce({ provider: FAKE_PROVIDER.provider, model: "m", user: "x", streamImpl: failing }),
    /hết quota/,
  );
});

test("dịch metadata (JSON) + chỉ dẫn, map đúng vào kết quả", async () => {
  const result = await translate.translateSkillFields(FIELDS, {
    target: "vi",
    chooseProvider: chooseFake,
    streamImpl: scriptedStream([
      '```json\n{"name":"Email Marketing","tagline":"Viết tốt từng email","description":"Phương pháp đầy đủ từ tiêu đề tới CTA"}\n```',
      "## Bước 1\nViết dòng tiêu đề.\n## Bước 2\nViết nội dung.",
    ]),
  });
  assert.equal(result.target, "vi");
  assert.equal(result.name, "Email Marketing");
  assert.equal(result.tagline, "Viết tốt từng email");
  assert.match(result.description, /Phương pháp đầy đủ/);
  assert.match(result.instructions, /## Bước 1/);
  assert.equal(result.warnings.length, 0, `không nên có cảnh báo: ${result.warnings.join("; ")}`);
  assert.equal(result.lengths.source.instructions, FIELDS.instructions.length);
  assert.ok(result.lengths.translated.instructions > 0);
});

test("model trả JSON hỏng thì giữ nguyên tên/mô tả gốc kèm cảnh báo", async () => {
  const result = await translate.translateSkillFields(FIELDS, {
    target: "vi",
    chooseProvider: chooseFake,
    streamImpl: scriptedStream(["Xin chào, đây không phải JSON", "## Bước 1\nViết dòng tiêu đề."]),
  });
  assert.equal(result.name, FIELDS.name, "phải giữ nguyên tên gốc");
  assert.equal(result.description, FIELDS.description);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /JSON/);
  assert.match(result.instructions, /Bước 1/, "chỉ dẫn vẫn phải được dịch");
});

test("skill không có chỉ dẫn thì chỉ dịch metadata và cảnh báo rõ", async () => {
  let calls = 0;
  const counting = async function* () { calls += 1; yield { type: "delta", text: '{"name":"A","tagline":"B","description":"C"}' }; };
  const result = await translate.translateSkillFields({ name: "x", tagline: "", description: "", instructions: "" }, {
    target: "en", chooseProvider: chooseFake, streamImpl: counting,
  });
  assert.equal(calls, 1, "không được gọi lượt thứ hai khi không có chỉ dẫn");
  assert.equal(result.name, "A");
  assert.match(result.warnings.join(" "), /không có chỉ dẫn/);
});

test("bản dịch dài hơn nhiều thì cảnh báo sẽ bị trần 6.000 cắt thêm", async () => {
  const long = "这段很长的说明。".repeat(40);
  const result = await translate.translateSkillFields(
    { name: "n", tagline: "t", description: "d", instructions: long },
    { target: "vi", chooseProvider: chooseFake, streamImpl: scriptedStream(['{"name":"n","tagline":"t","description":"d"}', "Hướng dẫn rất dài. ".repeat(200)]) },
  );
  assert.ok(result.warnings.some((w) => /trần 6\.000/.test(w)), result.warnings.join("; "));
});

test("dịch nhiều ngôn ngữ: chạy cả vi và en, bỏ qua ngôn ngữ không hỗ trợ", async () => {
  const { translations, warnings } = await translate.translateSkill(FIELDS, {
    targets: ["vi", "en", "jp"],
    chooseProvider: chooseFake,
    streamImpl: scriptedStream(['{"name":"Email Marketing","tagline":"t","description":"d"}', "Hướng dẫn đã dịch."]),
  });
  assert.ok(translations.vi && translations.en, "phải có cả vi và en");
  assert.equal(translations.jp, undefined);
  assert.match(warnings.join(" "), /không hỗ trợ: jp/);
});

test("chưa cấu hình provider nào thì báo lỗi rõ ràng, không đoán bừa", async () => {
  const realChoose = (await import("../src/settings.js")).nextUsableProvider;
  assert.equal(realChoose({}), null, "CSDL test chưa có provider nào");
  await assert.rejects(
    () => translate.translateSkillFields(FIELDS, { target: "vi", chooseProvider: realChoose }),
    /Chưa có nhà cung cấp AI nào dùng được/,
  );
  await assert.rejects(
    () => translate.translateSkillFields(FIELDS, { target: "jp", chooseProvider: chooseFake }),
    /Ngôn ngữ đích không hỗ trợ/,
  );
});
