import test from "node:test";
import assert from "node:assert/strict";

/**
 * Test cho máy khách SkillHub — KHÔNG cần mạng và KHÔNG cần DB: mọi lời gọi đều
 * được bơm `fetchImpl` giả. Nhờ vậy bộ test vẫn chạy được đúng lúc dịch vụ
 * `api.skillhub.cn` đang bị chặn theo vùng (xem đầu `server/src/skills/skillhub.js`).
 */
const skillhub = await import("../src/skills/skillhub.js");

const SKILL_MD = `---
name: 数据分析助手
description: Phân tích CSV và trả về bảng tóm tắt.
tools: [excel, data]
---

# 数据分析助手

Bạn là trợ lý phân tích dữ liệu. Hãy đọc tệp người dùng gửi và trả lời bằng bảng.
`;

/** fetch giả: khớp theo URL, ghi lại các lời gọi để assert. */
function stubFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body });
    for (const [matcher, response] of routes) {
      if (String(url).includes(matcher)) return response;
    }
    return { ok: false, status: 404, json: async () => ({ error: "not stubbed" }), text: async () => "not stubbed" };
  };
  impl.calls = calls;
  return impl;
}

const json = (payload) => ({ ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) });
const text = (body) => ({ ok: true, status: 200, json: async () => ({}), text: async () => body });

const CONFIG = { baseUrl: "https://api.skillhub.cn", apiKey: "team-key", clientUserId: null, timeoutMs: 5000 };

test("tìm skill: đúng query, có X-API-Key, bóc lớp envelope `data`", async () => {
  const fetchImpl = stubFetch([
    ["/api/skills?", json({ code: 0, message: "success", data: { total: 130000, skills: [{ slug: "a" }, { slug: "b" }] } })],
  ]);
  const result = await skillhub.searchSkills(
    { keyword: "phân tích dữ liệu", category: "data-analysis", pageSize: 5, free: true },
    { config: CONFIG, fetchImpl },
  );

  const call = fetchImpl.calls[0];
  assert.ok(call.url.startsWith("https://api.skillhub.cn/api/skills?"));
  assert.match(call.url, /keyword=ph%C3%A2n\+t%C3%ADch\+d%E1%BB%AF\+li%E1%BB%87u/, "từ khoá phải được encode");
  assert.match(call.url, /category=data-analysis/);
  assert.match(call.url, /pageSize=5/);
  assert.match(call.url, /labels=pricing_type%3A%21paid/, "free: true ⇒ chỉ lấy skill không tính phí");
  assert.equal(call.headers["X-API-Key"], "team-key", "khoá team chỉ đi ở phía server");
  assert.equal(result.total, 130000);
  assert.deepEqual(result.skills.map((s) => s.slug), ["a", "b"]);
});

test("lỗi HTTP trả thông báo rõ ràng kèm mã trạng thái", async () => {
  const notFound = stubFetch([["/api/v1/skills/", { ok: false, status: 404, json: async () => ({ error: "skill not found" }), text: async () => "" }]]);
  await assert.rejects(() => skillhub.getSkill("khong-ton-tai", { config: CONFIG, fetchImpl: notFound }), /404: skill not found/);

  const limited = stubFetch([["/api/skills?", { ok: false, status: 429, json: async () => ({}), text: async () => "" }]]);
  await assert.rejects(() => skillhub.searchSkills({}, { config: CONFIG, fetchImpl: limited }), /429/);
});

test("lỗi mạng được bọc lại kèm gợi ý kiểm tra đường sang Trung Quốc", async () => {
  const deadFetch = async () => {
    throw new Error("fetch failed");
  };
  await assert.rejects(
    () => skillhub.searchSkills({}, { config: CONFIG, fetchImpl: deadFetch }),
    /Không gọi được SkillHub.*VPN/s,
  );
});

test("đọc SKILL.md: tìm được tệp, bóc frontmatter và tiêu đề H1", async () => {
  const fetchImpl = stubFetch([
    ["/files", json({ files: [{ path: "references/api.md" }, { path: "SKILL.md" }], count: 2, version: "1.0.2" })],
    ["/file?", text(SKILL_MD)],
  ]);
  const content = await skillhub.readSkillInstructions("data-helper", { config: CONFIG, fetchImpl });

  assert.equal(content.found, true);
  assert.equal(content.version, "1.0.2");
  assert.equal(content.files.length, 2);
  assert.equal(content.data.name, "数据分析助手");
  assert.deepEqual(content.data.tools, ["excel", "data"]);
  assert.match(content.instructions, /trợ lý phân tích dữ liệu/);
  assert.doesNotMatch(content.instructions, /^#\s/m, "tiêu đề H1 trùng tên skill phải bị bỏ");
  assert.doesNotMatch(content.instructions, /name:/, "frontmatter không được lọt vào chỉ dẫn");
});

test("skill không có SKILL.md thì báo không tìm thấy chứ không nổ", async () => {
  const fetchImpl = stubFetch([["/files", json({ files: [{ path: "README.md" }], count: 1, version: "1.0.0" })]]);
  const content = await skillhub.readSkillInstructions("la", { config: CONFIG, fetchImpl });
  assert.equal(content.found, false);
  assert.equal(content.instructions, "");
});

test("chỉ dẫn dài hơn trần thì bị cắt và GHI RÕ đã cắt", async () => {
  const short = skillhub.fitInstructions("Chỉ dẫn ngắn.");
  assert.equal(short.truncated, false);
  assert.equal(short.text, "Chỉ dẫn ngắn.");

  const long = `${"Đoạn chỉ dẫn. ".repeat(900)}`.trim(); // ~12.6k ký tự
  const fitted = skillhub.fitInstructions(long);
  assert.equal(fitted.truncated, true);
  assert.ok(fitted.text.length <= skillhub.MAX_INSTRUCTIONS, "phải nằm trong trần của chợ");
  assert.match(fitted.text, /đã lược bớt/, "phải nói rõ là đã cắt, không im lặng");
  assert.equal(fitted.originalLength, long.length);
});

test("ghép sang bản nháp của chợ: tên, mô tả, danh mục, công cụ, giá", () => {
  const draft = skillhub.toHubDraft(
    {
      skill: {
        slug: "find-skill-skillhub",
        displayName: "Phân tích dữ liệu",
        summary_zh: "Phân tích CSV và trả về bảng tóm tắt.",
        category: "data-analysis",
        downloads: 43390,
        labels: { requires_api_key: "false" },
      },
      content: { instructions: "Bạn là trợ lý phân tích dữ liệu.", data: { tools: ["excel", "ppt"] }, files: [{ path: "SKILL.md" }], version: "1.0.2" },
    },
    { priceVnd: 50000, now: "2026-09-18T00:00:00.000Z" },
  );

  assert.equal(draft.slug, "find-skill-skillhub");
  assert.equal(draft.skillhubSlug, "find-skill-skillhub");
  assert.equal(draft.name, "Phân tích dữ liệu");
  assert.equal(draft.category, "Dữ liệu", "data-analysis → Dữ liệu");
  assert.equal(draft.priceVnd, 50000);
  assert.equal(draft.instructionsTruncated, false);
  assert.deepEqual(draft.tools, ["generate_xlsx", "generate_pptx"], "bí danh excel/ppt phải map sang tool thật");
  assert.equal(draft.state, "published", "skill chỉ có chỉ dẫn thì bán được ngay");
  assert.equal(draft.source, "skillhub");
  assert.equal(draft.downloads, 43390);
  assert.equal(draft.importedAt, "2026-09-18T00:00:00.000Z");
  assert.deepEqual(draft.warnings, []);
});

test("skill kèm script hoặc cần API key thì KHÔNG bán như đang chạy được", () => {
  const withScripts = skillhub.toHubDraft({
    skill: { slug: "x", displayName: "Skill có script", summary: "Có script." },
    content: { instructions: "Chạy script.", data: {}, files: [{ path: "scripts/run.py" }, { path: "references/a.md" }], version: "1" },
  });
  assert.equal(withScripts.state, "coming_soon");
  assert.equal(withScripts.warnings.length, 2, "phải cảnh báo cả script lẫn tệp tham chiếu");
  assert.match(withScripts.warnings[0], /không chạy được script/);

  const needsKey = skillhub.toHubDraft({
    skill: { slug: "y", name: "Cần key", labels: { requires_api_key: "true" } },
    content: { instructions: "Gọi API ngoài.", data: {}, files: [{ path: "SKILL.md" }] },
  });
  assert.equal(needsKey.needsApiKey, true);
  assert.equal(needsKey.state, "coming_soon");

  // Không có chỉ dẫn thì cũng không thể bán.
  const empty = skillhub.toHubDraft({ skill: { slug: "z", name: "Rỗng" }, content: { instructions: "", files: [] } });
  assert.equal(empty.state, "coming_soon");

  // Trạng thái do người nhập chỉ định thì được tôn trọng.
  const forced = skillhub.toHubDraft(
    { skill: { slug: "w", name: "Ép" }, content: { instructions: "abc", files: [{ path: "scripts/a.py" }] } },
    { state: "published" },
  );
  assert.equal(forced.state, "published");
});

test("slug và danh mục: bỏ dấu tiếng Việt, khoá lạ về 'Khác'", () => {
  assert.equal(skillhub.slugify("Phân tích DỮ LIỆU (bản 2)"), "phan-tich-du-lieu-ban-2");
  assert.equal(skillhub.mapCategory("office-efficiency"), "Văn phòng");
  assert.equal(skillhub.mapCategory("business-ops"), "Bán hàng");
  assert.equal(skillhub.mapCategory("content-creation"), "Nội dung");
  assert.equal(skillhub.mapCategory("education"), "Giáo dục");
  assert.equal(skillhub.mapCategory("pay-skill"), "Khác");
  assert.equal(skillhub.mapCategory(null), "Khác");
});

test("tệp quá 1MB bị 413 thì gợi ý dùng zip", async () => {
  const fetchImpl = stubFetch([
    ["/file?", { ok: false, status: 413, json: async () => ({}), text: async () => "" }],
  ]);
  await assert.rejects(
    () => skillhub.readSkillFile("to", { path: "big.md", config: CONFIG, fetchImpl }),
    /413.*zip/s,
  );
});

test("fetchSkillDraft: một lời gọi ra bản nháp hoàn chỉnh", async () => {
  const fetchImpl = stubFetch([
    ["/api/v1/skills/data-helper/files", json({ files: [{ path: "SKILL.md" }], count: 1, version: "1.0.2" })],
    ["/file?", text(SKILL_MD)],
    ["/api/v1/skills/data-helper", json({ skill: { slug: "data-helper", displayName: "数据分析助手", summary_zh: "Phân tích CSV.", category: "data-analysis" } })],
  ]);
  const draft = await skillhub.fetchSkillDraft("data-helper", { priceVnd: 50000 }, { config: CONFIG, fetchImpl });

  assert.equal(draft.skillhubSlug, "data-helper");
  assert.equal(draft.category, "Dữ liệu");
  assert.equal(draft.version, "1.0.2");
  assert.deepEqual(draft.tools, ["generate_xlsx", "analyze_data"]);
  assert.match(draft.instructions, /trợ lý phân tích dữ liệu/);
});

test("base URL đổi được bằng biến môi trường (để trỏ qua VPN/relay)", () => {
  const config = skillhub.skillhubConfig({ SKILLHUB_BASE_URL: "http://127.0.0.1:8899/", SKILLHUB_API_KEY: "k" });
  assert.equal(config.baseUrl, "http://127.0.0.1:8899", "bỏ dấu / cuối");
  assert.equal(config.apiKey, "k");
  assert.equal(skillhub.skillhubConfig({}).baseUrl, "https://api.skillhub.cn");
});
