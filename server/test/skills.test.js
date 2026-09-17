import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, closeServer } from "./helpers.js";

const { initDb, all } = await import("../src/db.js");
initDb();
const { createUser, issueToken } = await import("../src/auth.js");
const { grantCredits } = await import("../src/credits.js");
const catalogue = await import("../src/skills/index.js");
const installed = await import("../src/skills/installed.js");

after(async () => {
  await closeServer();
});

function userFor(email, role = "user") {
  const existing = all("users", "email = ?", [email])[0];
  const user = existing ?? createUser({ email, password: "matkhau12345", name: "Skills", role });
  // Chat turns are metered; these tests are about skills, not billing.
  if (!existing && role !== "admin") grantCredits({ userId: user.id, amount: 1000 });
  return { user, token: issueToken(user) };
}

test("the catalogue marks what works today and what the marketplace will add", () => {
  const catalog = catalogue.publicSkillCatalog();
  const ready = catalog.filter((s) => s.state === "ready");
  const coming = catalog.filter((s) => s.state === "coming_soon");
  assert.deepEqual(
    ready.map((s) => s.id),
    ["chat", "image", "ppt", "excel", "data"],
  );
  assert.ok(coming.length >= 3, "cần vài mục 'Sắp có' để chợ kỹ năng có nội dung");
  assert.ok(coming.every((s) => s.builtin === false));
  assert.ok(catalog.every((s) => typeof s.order === "undefined"), "order là chi tiết nội bộ, không trả ra");
  assert.ok(catalog.every((s) => s.category));
});

test("isKnownSkill accepts built-ins plus auto and rejects the rest", () => {
  assert.equal(catalogue.isKnownSkill("ppt"), true);
  assert.equal(catalogue.isKnownSkill("auto"), true);
  assert.equal(catalogue.isKnownSkill("mcp_skill"), false);
  assert.equal(catalogue.isKnownSkill("khong-ton-tai"), false);
  assert.equal(catalogue.isKnownSkill(undefined), false);
});

test("a user with no rows gets everything ready, in catalogue order", () => {
  const { user } = userFor("skills-default@flowgpt.test");
  assert.deepEqual(installed.listInstalledSkillIds(user.id), ["chat", "image", "ppt", "excel", "data"]);
  assert.deepEqual(
    installed.listInstalledSkills(user.id).map((s) => s.label),
    ["Trò chuyện", "Sửa ảnh", "Làm PPT", "Làm Excel", "Phân tích dữ liệu"],
  );
});

test("setting the list replaces it and keeps the order the user chose", () => {
  const { user } = userFor("skills-set@flowgpt.test");
  const saved = installed.setInstalledSkills(user.id, ["ppt", "data", "chat"]);
  assert.deepEqual(saved, ["ppt", "data", "chat"]);
  assert.deepEqual(
    installed.listInstalledSkills(user.id).map((s) => s.id),
    ["ppt", "data", "chat"],
  );

  // Whitespace, duplicates and the virtual "auto" are normalised away.
  assert.deepEqual(installed.setInstalledSkills(user.id, [" ppt ", "ppt", "auto", "excel"]), ["ppt", "excel"]);
});

test("the fast list is capped at ten and always keeps at least one skill", () => {
  const { user } = userFor("skills-cap@flowgpt.test");
  assert.throws(
    () => installed.setInstalledSkills(user.id, Array.from({ length: 11 }, (_, i) => `s${i}`)),
    /Không có kỹ năng nào tên/,
  );
  assert.throws(() => installed.setInstalledSkills(user.id, []), /ít nhất một kỹ năng/);
  assert.throws(() => installed.setInstalledSkills(user.id, ["auto"]), /ít nhất một kỹ năng/);
});

test("coming-soon skills cannot be installed yet, with a clear reason", () => {
  const { user } = userFor("skills-soon@flowgpt.test");
  assert.throws(() => installed.setInstalledSkills(user.id, ["mcp_skill"]), /chợ kỹ năng/);
  assert.throws(() => installed.installSkill(user.id, "translate"), /chợ kỹ năng/);
});

test("install/uninstall behave like the marketplace buttons will", () => {
  const { user } = userFor("skills-toggle@flowgpt.test");
  installed.resetUserSkills(user.id);
  assert.deepEqual(installed.installSkill(user.id, "data"), ["chat", "image", "ppt", "excel", "data"]);
  assert.deepEqual(installed.uninstallSkill(user.id, "image"), ["chat", "ppt", "excel", "data"]);
  // Removing the last one is refused — the dropdown always needs a selection.
  installed.setInstalledSkills(user.id, ["ppt"]);
  assert.throws(() => installed.uninstallSkill(user.id, "ppt"), /ít nhất một kỹ năng/);
  installed.resetUserSkills(user.id);
});

test("GET /api/skills returns the user's list plus the catalogue", async () => {
  const { token } = userFor("skills-api@flowgpt.test");
  const result = await api("GET", "/skills", undefined, token);
  assert.deepEqual(result.installed, ["chat", "image", "ppt", "excel", "data"]);
  assert.deepEqual(result.items.map((s) => s.id), result.installed);
  assert.equal(result.maxSelectable, 10);
  assert.ok(result.catalog.some((s) => s.state === "coming_soon"));
  assert.ok(result.tools.some((t) => t.name === "generate_pptx"));
});

test("PUT /api/skills/installed saves the user's choice and rejects bad input", async () => {
  const { token } = userFor("skills-put@flowgpt.test");
  const saved = await api("PUT", "/skills/installed", { ids: ["data", "ppt"] }, token);
  assert.deepEqual(saved.installed, ["data", "ppt"]);
  assert.deepEqual(saved.items.map((s) => s.id), ["data", "ppt"]);

  const reread = await api("GET", "/skills", undefined, token);
  assert.deepEqual(reread.installed, ["data", "ppt"]);

  const unknown = await apiRaw("PUT", "/skills/installed", { ids: ["khong-co"] }, token);
  assert.equal(unknown.status, 400);
  const soon = await apiRaw("PUT", "/skills/installed", { ids: ["document"] }, token);
  assert.equal(soon.status, 400);
  assert.match((await soon.json()).error.message, /chợ kỹ năng/);
  const empty = await apiRaw("PUT", "/skills/installed", { ids: [] }, token);
  assert.equal(empty.status, 400);
});

test("skill choices are per user", async () => {
  const a = userFor("skills-a@flowgpt.test");
  const b = userFor("skills-b@flowgpt.test");
  await api("PUT", "/skills/installed", { ids: ["excel"] }, a.token);
  const other = await api("GET", "/skills", undefined, b.token);
  assert.deepEqual(other.installed, ["chat", "image", "ppt", "excel", "data"]);
});

test("the chat route accepts a catalogue skill and falls back for an unknown one", async () => {
  const settings = await import("../src/settings.js");
  if (!settings.listProviders().length) {
    settings.createProvider({ name: "Demo", kind: "mock", models: ["flowgpt-demo"] });
  }
  const { token } = userFor("skills-chat@flowgpt.test");
  const { baseUrl } = await bootServer();

  const run = async (skill) => {
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "Làm slide giúp anh", skill }),
    });
    const text = await response.text();
    const start = /event: start\ndata: (.+)/.exec(text);
    return { text, start: start ? JSON.parse(start[1]) : null };
  };

  const accepted = await run("ppt");
  assert.equal(accepted.start?.skill, "ppt", "skill hợp lệ phải được giữ nguyên");
  assert.match(accepted.text, /event: tool_call/);

  // An unknown id must not break the turn: the server falls back to a real skill.
  const unknown = await run("khong-ton-tai");
  assert.ok(unknown.start, "lượt chat vẫn phải chạy");
  assert.ok(
    ["auto", "chat", "image", "ppt", "excel", "data"].includes(unknown.start.skill),
    `skill dự phòng không hợp lệ: ${unknown.start.skill}`,
  );
});
