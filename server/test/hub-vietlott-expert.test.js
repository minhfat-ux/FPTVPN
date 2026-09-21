// Chuyên gia Vietlott phải nằm trong CHỢ KỸ NĂNG với kind "expert" (chủ dự án 21/09/2026).
import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";

const { initDb } = await import("../src/db.js");
initDb();
const hub = await import("../src/skills/hub.js");

test("seed tạo Chuyên gia Vietlott trong chợ kỹ năng", () => {
  const created = hub.ensureHubSeed();
  assert.ok(created >= 1 || hub.getHubSkillRow("chuyen-gia-vietlott"), "seed phải tạo được mục vietlott");
  const row = hub.getHubSkillRow("chuyen-gia-vietlott");
  assert.ok(row, "phải có mục slug chuyen-gia-vietlott");
  // `kind` nằm trong bản công khai của chợ (rowToSkill → listHubSkills) và cả runtime.
  const listing = hub.listHubSkills({ userId: null, lang: "vi" }).find((x) => x.slug === "chuyen-gia-vietlott");
  assert.ok(listing, "chợ phải trả về mục này");
  assert.equal(listing.kind, "expert", "phải là EXPERT trên chợ, không phải skill thường");
  assert.equal(hub.hubSkillRuntime(row).kind, "expert");
  assert.equal(listing.category, "Chuyên gia");
  assert.equal(Number(row.price_vnd), 0, "chuyên gia này miễn phí");
  assert.deepEqual(row.tools, ["tra_cuu"], "phải có công cụ tra cứu nguồn chính thức");
});

test("hướng dẫn của chuyên gia cấm dự đoán số", () => {
  const row = hub.getHubSkillRow("chuyen-gia-vietlott");
  const text = String(row.instructions ?? "");
  assert.match(text, /KHÔNG dự đoán con số/);
  assert.match(text, /vietlott\.vn/);
  assert.match(text, /KỲ QUAY/);
  assert.match(text, /TỰ NGUYỆN/);
});

test("chợ kỹ năng trả về mục vietlott cho người dùng", () => {
  const items = hub.listHubSkills({ userId: null, lang: "vi" });
  const found = items.find((item) => item.slug === "chuyen-gia-vietlott");
  assert.ok(found, "danh sách chợ phải có chuyên gia vietlott");
  assert.equal(found.kind, "expert");
});
