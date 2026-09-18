import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";

const { initDb } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");
const { buildSystemPrompt } = await import("../src/agent.js");
const {
  buildAppsKnowledge,
  buildAppsCatalogue,
  buildExpertSkillConnectorCatalogue,
  appsQuestionLikely,
  expertSkillQuestionLikely,
  PUBLISHED_APPS,
  COMING_SOON_APPS,
  EXPERTS_CATALOGUE,
  SKILLS_CATALOGUE,
} = await import("../src/apps-knowledge.js");

/**
 * Ca lỗi thật đã xảy ra: hỏi "MeetFlow AI là gì" thì trợ lý nhầm MeetFlow AI thành
 * fBuddy (hoặc thành tên công ty), vì prompt hệ thống không có dữ kiện nào về các app
 * của mình. Khối định danh phải luôn có mặt — kể cả khi admin đổi prompt hệ thống.
 */
test("khối định danh hệ sinh thái luôn được ghép, kể cả khi admin đổi prompt", () => {
  const appSettings = { ...settings.readAppSettings(), systemPrompt: "Chỉ trả lời ngắn gọn." };
  const prompt = buildSystemPrompt({ skill: "chat", files: [], settings: appSettings, user: null });

  assert.match(prompt, /Chỉ trả lời ngắn gọn\./); // prompt của admin vẫn còn
  assert.match(prompt, /Hệ sinh thái FlowTech/);
  assert.match(prompt, /MeetFlow AI: app dịch hội thoại thời gian thực và ghi biên bản cuộc họp\./);
  assert.match(prompt, /fBuddy — chính là bạn — và MeetFlow AI là HAI SẢN PHẨM KHÁC NHAU/);
  assert.match(prompt, /KHÔNG nói MeetFlow AI là fBuddy/);
  assert.match(prompt, /VPNFlow/);
  assert.match(prompt, /SuperMom AI/);
});

test("câu hỏi về app thì ghép cả danh mục; lượt làm việc thường thì không", () => {
  const question = buildSystemPrompt({
    skill: "chat",
    files: [],
    settings: settings.readAppSettings(),
    user: null,
    message: "MeetFlow AI là gì, có phải là em không?",
  });
  assert.match(question, /## DANH MỤC APP/);
  // Dữ kiện đúng của MeetFlow AI — không phải tính năng của fBuddy.
  assert.match(question, /ghi biên bản cuộc họp \(meeting minutes\)/);
  assert.match(question, /id6765590042/);

  // Lượt làm việc bình thường không phải trả thêm token cho danh mục.
  const task = buildSystemPrompt({
    skill: "ppt",
    files: [],
    settings: settings.readAppSettings(),
    user: null,
    message: "làm giúp em 8 slide tổng kết quý 3",
  });
  assert.doesNotMatch(task, /## DANH MỤC APP|QUY TẮC VỀ APP/);
  assert.match(task, /Hệ sinh thái FlowTech/); // định danh vẫn còn

  // Câu hỏi chạm tới app/công ty/nền tảng/giá thì phải ghép danh mục.
  for (const message of [
    "bên mình có mấy app?",
    "VPNFlow cài trên máy tính thế nào?",
    "MeetFlow AI giá bao nhiêu?",
    "app này có trên iphone không?",
    "hệ sinh thái FlowTech gồm những gì?",
  ]) {
    assert.equal(appsQuestionLikely(message), true, `phải nhận ra: ${message}`);
  }
  for (const message of ["dịch giúp em đoạn văn này", "tóm tắt file đính kèm", "viết email xin nghỉ phép"]) {
    assert.equal(appsQuestionLikely(message), false, `không nên ghép danh mục: ${message}`);
  }
});

test("app chưa công bố chỉ có tên, không có tính năng hay link", () => {
  const catalogue = buildAppsCatalogue();
  for (const app of COMING_SOON_APPS) {
    assert.match(catalogue, new RegExp(app.name));
  }
  assert.match(catalogue, /Đang phát triển, CHƯA công bố/);
  assert.match(catalogue, /đang làm và chưa công bố, không mô tả tính năng và không hứa ngày ra mắt/);
  // Không được gán link hay tính năng cho app chưa công bố.
  for (const app of COMING_SOON_APPS) {
    assert.equal(app.links, undefined);
    assert.equal(app.facts, undefined);
  }
});

test("danh mục đủ 5 sản phẩm đã công bố và luôn có luật chống bịa", () => {
  assert.deepEqual(
    PUBLISHED_APPS.map((app) => app.id),
    ["fbuddy", "meetflow", "vpnflow", "harness", "supermom"],
  );
  const catalogue = buildAppsCatalogue();
  for (const app of PUBLISHED_APPS) {
    assert.match(catalogue, new RegExp(app.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(app.facts.length >= 4, `${app.name} phải có dữ kiện`);
  }
  // Giá bằng số không nằm trong prompt (đổi giá là hỏng câu trả lời).
  assert.doesNotMatch(catalogue, /\d{4,}\s?đ|\d+\s?(nghìn|triệu)\s?đồng/);
  assert.match(catalogue, /KHÔNG bịa tính năng, giá, ngày ra mắt/);
  assert.match(catalogue, /support@meetflowai\.site/);
  // Nói về công ty/app vẫn phải giữ cách xưng hô của hội thoại.
  assert.match(catalogue, /KHÔNG chuyển sang “chúng tôi”/);
  // Ba kênh thật của hệ sinh thái phải có trong dữ kiện.
  assert.match(catalogue, /VietQR/);
  assert.match(catalogue, /3 thiết bị/);
});

test("full: true ép ghép danh mục dù câu hỏi không nhắc app", () => {
  const forced = buildAppsKnowledge({ message: "chào em", full: true });
  assert.match(forced, /## DANH MỤC APP/);
  assert.match(forced, /QUY TẮC VỀ APP/);
  // full cũng kéo theo khối expert/skill/connector.
  assert.match(forced, /## EXPERTS, SKILLS & CONNECTOR/);
});

/**
 * Ca lỗi "fBuddy không biết mình có expert/skill gì": danh mục expert + skill đã được
 * soạn trong apps-knowledge.js nhưng KHÔNG được ghép vào prompt. Kết quả là hỏi
 * "bạn có chuyên gia tài chính không" thì trợ lý trả lời như không tồn tại. Khối này
 * phải đi theo khi câu hỏi chạm tới chuyên gia/kỹ năng/chợ kỹ năng.
 */
test("câu hỏi về chuyên gia/kỹ năng thì ghép danh mục expert + skill; lượt thường thì không", () => {
  for (const message of [
    "bạn có chuyên gia tài chính Việt Nam không?",
    "có kỹ năng gì trong chợ kỹ năng?",
    "bật giúp em expert luyện thi KET",
    "fBuddy biết gì về connector agent bus?",
  ]) {
    assert.equal(expertSkillQuestionLikely(message), true, `phải nhận ra: ${message}`);
    const block = buildAppsKnowledge({ message });
    assert.match(block, /## EXPERTS, SKILLS & CONNECTOR/, `phải có khối expert/skill: ${message}`);
  }

  // Lượt làm việc thường không phải trả token cho khối expert/skill.
  for (const message of ["làm giúp em 8 slide tổng kết quý 3", "dịch đoạn văn này", "viết email xin nghỉ phép"]) {
    assert.equal(expertSkillQuestionLikely(message), false, `không nên ghép khối expert: ${message}`);
    assert.doesNotMatch(buildAppsKnowledge({ message }), /## EXPERTS, SKILLS & CONNECTOR/);
  }

  // Khối expert/skill phải kể được ít nhất một chuyên gia VN và một chuyên gia giáo dục.
  const catalogue = buildExpertSkillConnectorCatalogue();
  assert.match(catalogue, /vietnam-finance-tax-expert/);
  assert.match(catalogue, /ket-prep-expert/);
  assert.match(catalogue, /Làm PowerPoint \(ppt\)/);
  assert.match(catalogue, /Chợ kỹ năng/);
  assert.match(catalogue, /Connector \(Agent Bus\)/);
  // Danh mục expert/skill cũng chịu cùng luật chống bịa.
  assert.match(catalogue, /KHÔNG bịa tính năng, giá, ngày ra mắt/);

  // Cấu trúc dữ liệu nguồn vẫn còn nguyên (đủ 2 nhóm expert + 4 skill built-in).
  assert.equal(EXPERTS_CATALOGUE.length, 2);
  assert.equal(SKILLS_CATALOGUE.builtin.length, 4);
});

/**
 * Prompt hệ thống mặc định cũ mở đầu bằng "trợ lý AI đa năng của MeetFlow AI" — đọc lên
 * thành fBuddy thuộc về MeetFlow AI, tức là đúng cái nhầm lẫn đang phải sửa. Bản mới ghi
 * FlowTech, và bản ghi cũ trong CSDL được sửa một lần khi khởi động.
 */
test("prompt mặc định gọi FlowTech là công ty, không gọi MeetFlow AI là công ty", async () => {
  const { DEFAULT_APP_SETTINGS, fixLegacySystemPromptCompany } = await import("../src/db.js");
  assert.match(DEFAULT_APP_SETTINGS.systemPrompt, /trợ lý AI đa năng của FlowTech/);
  assert.doesNotMatch(DEFAULT_APP_SETTINGS.systemPrompt, /của MeetFlow AI/);

  // Bản ghi cũ trong CSDL (do bản cũ gieo ra) được sửa lại.
  settings.patchAppSettings({
    systemPrompt: "Tên của bạn là fBuddy — trợ lý AI đa năng của MeetFlow AI, trả lời ngắn gọn.",
  });
  assert.equal(fixLegacySystemPromptCompany(), true);
  assert.match(settings.readAppSettings().systemPrompt, /trợ lý AI đa năng của FlowTech/);
  assert.doesNotMatch(settings.readAppSettings().systemPrompt, /của MeetFlow AI/);
  assert.equal(fixLegacySystemPromptCompany(), false); // chạy lại vô hại

  // Production lưu systemPrompt dạng MẢNG các đoạn (mỗi đoạn một dòng trong Cài đặt):
  // bản vá phải xử lý cả dạng này, nếu không nó im lặng không làm gì.
  settings.patchAppSettings({
    systemPrompt: [
      "Tên của bạn là fBuddy — trợ lý AI đa năng của MeetFlow AI, trả lời ngắn gọn.",
      "FLOWTECH HARNESS (kiến thức nền): FlowTech Harness là bộ môi trường chạy agent.",
    ],
  });
  assert.equal(fixLegacySystemPromptCompany(), true);
  const storedArray = settings.readAppSettings().systemPrompt;
  assert.ok(Array.isArray(storedArray));
  assert.match(storedArray[0], /trợ lý AI đa năng của FlowTech/);
  assert.equal(storedArray.length, 2); // không mất đoạn nào
  assert.match(storedArray[1], /FLOWTECH HARNESS/);

  // Prompt admin tự viết thì không bị đụng tới.
  settings.patchAppSettings({ systemPrompt: "Chỉ trả lời ngắn gọn, xưng em." });
  assert.equal(fixLegacySystemPromptCompany(), false);
  assert.equal(settings.readAppSettings().systemPrompt, "Chỉ trả lời ngắn gọn, xưng em.");

  settings.patchAppSettings({ systemPrompt: DEFAULT_APP_SETTINGS.systemPrompt });
});
