import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, closeServer, readSse, eventsNamed, textOf } from "./helpers.js";

const { initDb, all } = await import("../src/db.js");
initDb();
const { createUser, issueToken } = await import("../src/auth.js");
const settings = await import("../src/settings.js");
const credits = await import("../src/credits.js");
const hub = await import("../src/skills/hub.js");

settings.patchAppSettings({ signupCredits: 0 });
hub.ensureHubSeed();

after(async () => {
  await closeServer();
});

function userFor(email, role = "user", { balance = 0 } = {}) {
  const existing = all("users", "email = ?", [email])[0];
  const user = existing ?? createUser({ email, password: "matkhau12345", name: "Hub", role });
  if (!existing && balance) credits.grantCredits({ userId: user.id, amount: balance });
  return { user, token: issueToken(user) };
}

test("the seed fills the hub once and is idempotent", () => {
  const items = hub.listHubSkills({});
  assert.ok(items.length >= 6, "phải có vài kỹ năng mẫu");
  assert.ok(items.some((skill) => skill.price > 0), "phải có kỹ năng bán bằng token");
  assert.ok(items.some((skill) => skill.state === "coming_soon"), "phải có mục sắp mở");
  assert.equal(hub.ensureHubSeed(), 0, "chạy lại không thêm gì");
  const slugs = items.map((skill) => skill.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slug không trùng");
});

test("buying a skill charges credits for its VND price, records ownership and installs it", () => {
  const { user } = userFor("hub-buy@flowgpt.test", "user", { balance: 200000 });
  const skill = hub.listHubSkills({}).find((item) => item.slug === "content-sales");
  assert.equal(skill.priceVnd, 50000, "kỹ năng mẫu bán 50.000đ");
  assert.equal(skill.price, 50000, "1 credit = 1đ nên giá credit bằng giá VND");

  const before = credits.getBalance(user.id);
  const result = hub.purchaseHubSkill({ user, idOrSlug: skill.slug });
  assert.equal(result.alreadyOwned, false);
  assert.equal(result.pricePaid, skill.price);
  assert.equal(result.pricePaidVnd, 50000);
  assert.equal(result.balance, before - skill.price);
  assert.equal(result.skill.owned, true);
  assert.equal(result.installed, true, "mua xong phải tự thêm vào danh sách nhanh");

  const ledger = credits.listLedger(user.id);
  assert.equal(ledger[0].reason, "skill_purchase");
  assert.equal(Math.abs(ledger[0].delta), skill.price);
  assert.match(ledger[0].note, /50\.000đ/, "sổ phải ghi rõ giá VND đã trả");

  // Buying again is a no-op (no double charge).
  const again = hub.purchaseHubSkill({ user, idOrSlug: skill.slug });
  assert.equal(again.alreadyOwned, true);
  assert.equal(again.pricePaid, 0);
  assert.equal(again.pricePaidVnd, 0);
  assert.equal(credits.getBalance(user.id), before - skill.price);

  // The installed list really contains the hub skill id.
  const installed = all("user_skills", "user_id = ?", [user.id]).map((row) => row.skill_id);
  assert.ok(installed.includes(skill.id));
});

test("a user without enough credits is refused with the money price in the message", () => {
  const { user } = userFor("hub-poor@flowgpt.test", "user", { balance: 100 });
  const skill = hub.listHubSkills({}).find((item) => item.priceVnd > 0);
  assert.throws(
    () => hub.purchaseHubSkill({ user, idOrSlug: skill.slug }),
    (err) => err.status === 402 && /Cần 50\.000 credit \(50\.000đ\)/.test(err.message),
  );
  assert.equal(hub.hasPurchased(user.id, skill.id), false);
  assert.equal(credits.getBalance(user.id), 100, "không được trừ khi mua thất bại");
});

test("coming-soon and unknown skills cannot be bought", () => {
  const { user } = userFor("hub-soon@flowgpt.test", "user", { balance: 50000 });
  assert.throws(() => hub.purchaseHubSkill({ user, idOrSlug: "brand-voice" }), /chưa mở bán/);
  assert.throws(() => hub.purchaseHubSkill({ user, idOrSlug: "khong-co-skill-nay" }), /Không tìm thấy/);
});

test("a bought skill is selectable and steers the agent prompt", async () => {
  const { user, token } = userFor("hub-agent@flowgpt.test", "user", { balance: 200000 });
  const skill = hub.listHubSkills({}).find((item) => item.slug === "meeting-notes");
  hub.purchaseHubSkill({ user, idOrSlug: skill.slug });

  // Runtime resolution: free/owned → instructions; not-owned → null.
  const runtime = hub.hubSkillForUser({ skillId: skill.id, userId: user.id });
  assert.ok(runtime, "kỹ năng đã mua phải resolve được");
  assert.match(runtime.instructions, /biên bản họp/i);
  assert.equal(hub.hubSkillForUser({ skillId: skill.id, userId: userFor("hub-other@flowgpt.test").user.id }), null);
  assert.equal(hub.isSelectableSkill({ skillId: skill.id, userId: user.id }), true);
  assert.equal(hub.isSelectableSkill({ skillId: "khong-ton-tai", userId: user.id }), false);

  // A real turn accepts the hub skill id and keeps working.
  if (!settings.listProviders().some((provider) => provider.kind === "mock" && provider.enabled)) {
    settings.createProvider({ name: "Demo hub", kind: "mock", models: ["flowgpt-demo"] });
  }
  const { baseUrl } = await bootServer();
  const response = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: "Tóm tắt giúp anh", skill: skill.id }),
  });
  const events = await readSse(response);
  const start = eventsNamed(events, "start")[0]?.data;
  assert.equal(start?.skill, skill.id, "server phải giữ nguyên skill id của hub");
  assert.ok(textOf(events).length > 0 || eventsNamed(events, "tool_call").length > 0);
});

test("the hub API lists with prices and buys through HTTP", async () => {
  const { token } = userFor("hub-api@flowgpt.test", "user", { balance: 200000 });
  const listed = await api("GET", "/hub", undefined, token);
  assert.ok(listed.items.length >= 6);
  assert.equal(listed.currency, "token");
  assert.equal(listed.balance, 200000);
  assert.ok(Array.isArray(listed.categories));
  const target = listed.items.find((item) => item.priceVnd > 0 && item.state === "published");
  assert.equal(target.priceVnd, 50000);
  // Money price is what the shop shows; credits are derived from it.
  assert.equal(target.price, Math.ceil(target.priceVnd / settings.readAppSettings().vndPerCredit));

  const detail = await api("GET", `/hub/${target.slug}`, undefined, token);
  assert.equal(detail.skill.id, target.id);
  assert.equal(detail.skill.priceVnd, 50000);

  const bought = await api("POST", `/hub/${target.id}/purchase`, {}, token);
  assert.equal(bought.skill.owned, true);
  assert.equal(bought.balance, 200000 - target.price);
  assert.equal(bought.pricePaidVnd, 50000);

  const after = await api("GET", "/hub", undefined, token);
  assert.equal(after.items.find((item) => item.id === target.id).owned, true);
  assert.equal(after.ownedCount, 1);
});

test("only admins can manage the hub, and a created skill is immediately sellable", async () => {
  const admin = userFor("hub-admin@flowgpt.test", "admin");
  const buyer = userFor("hub-buyer@flowgpt.test", "user", { balance: 5000 });

  const forbidden = await apiRaw("GET", "/admin/hub", undefined, buyer.token);
  assert.equal(forbidden.status, 403);
  const forbiddenCreate = await apiRaw("POST", "/admin/hub", { name: "X" }, buyer.token);
  assert.equal(forbiddenCreate.status, 403);

  const created = await api(
    "POST",
    "/admin/hub",
    {
      name: "Viết email chuyên nghiệp",
      tagline: "Email ngắn, đúng ý, đúng giọng",
      category: "Văn phòng",
      icon: "mail",
      price: 3000,
      instructions: "Luôn trả về 3 phương án tiêu đề và 1 bản email hoàn chỉnh dưới 150 từ.",
    },
    admin.token,
  );
  assert.equal(created.skill.price, 3000);
  assert.equal(created.skill.state, "published");

  const listed = await api("GET", "/hub", undefined, buyer.token);
  assert.ok(listed.items.some((item) => item.id === created.skill.id));

  const bought = await api("POST", `/hub/${created.skill.id}/purchase`, {}, buyer.token);
  assert.equal(bought.balance, 2000);

  const updated = await api("PATCH", `/admin/hub/${created.skill.id}`, { price: 5000, state: "hidden" }, admin.token);
  assert.equal(updated.skill.price, 5000);
  const hidden = await api("GET", "/hub", undefined, buyer.token);
  assert.ok(!hidden.items.some((item) => item.id === created.skill.id), "kỹ năng ẩn không hiện với người dùng");
  assert.equal((await apiRaw("GET", `/hub/${created.skill.id}`, undefined, buyer.token)).status, 404);

  const deleted = await api("DELETE", `/admin/hub/${created.skill.id}`, undefined, admin.token);
  assert.equal(deleted.ok, true);
});

test("the admin listing carries the prompt pack so the edit form can prefill it", async () => {
  const admin = userFor("hub-admin-prefill@flowgpt.test", "admin");
  const buyer = userFor("hub-prefill-buyer@flowgpt.test", "user");

  const created = await api(
    "POST",
    "/admin/hub",
    {
      name: "Soạn thông cáo",
      tagline: "Thông cáo báo chí 1 trang",
      category: "Nội dung",
      icon: "megaphone",
      price: 2000,
      instructions: "Viết thông cáo theo mô hình ngược: kết luận trước, chi tiết sau.",
      tools: ["generate_xlsx", "list_files"],
      sortOrder: 42,
    },
    admin.token,
  );
  // Create/update answer with the full pack too.
  assert.match(created.skill.instructions, /thông cáo theo mô hình ngược/);
  assert.deepEqual(created.skill.tools, ["generate_xlsx", "list_files"]);

  const { items } = await api("GET", "/admin/hub", undefined, admin.token);
  const row = items.find((item) => item.id === created.skill.id);
  assert.ok(row, "kỹ năng vừa tạo phải có trong danh sách admin");
  assert.equal(row.instructions, "Viết thông cáo theo mô hình ngược: kết luận trước, chi tiết sau.");
  assert.deepEqual(row.tools, ["generate_xlsx", "list_files"]);
  assert.equal(row.sortOrder, 42);

  // The public listing must never leak the prompt pack.
  const listed = await api("GET", "/hub", undefined, buyer.token);
  const publicRow = listed.items.find((item) => item.id === created.skill.id);
  assert.equal(publicRow.instructions, undefined);
  assert.equal(publicRow.tools, undefined);

  // Editing the pack round-trips (including clearing it).
  const patched = await api(
    "PATCH",
    `/admin/hub/${created.skill.id}`,
    { instructions: "Chỉ viết 150 từ.", tools: [] },
    admin.token,
  );
  assert.equal(patched.skill.instructions, "Chỉ viết 150 từ.");
  assert.deepEqual(patched.skill.tools, []);

  // An admin can correct a counter inflated by test runs.
  const reset = await api("PATCH", `/admin/hub/${created.skill.id}`, { installs: 0 }, admin.token);
  assert.equal(reset.skill.installs, 0);
  const bumped = await api("PATCH", `/admin/hub/${created.skill.id}`, { installs: -5 }, admin.token);
  assert.equal(bumped.skill.installs, 0, "không cho số âm");

  await api("DELETE", `/admin/hub/${created.skill.id}`, undefined, admin.token);
});

test("every seeded skill is priced at a flat 50.000đ, independent of the credit price", () => {
  const before = settings.readAppSettings().vndPerCredit;
  const seeded = hub.listHubSkills({ includeHidden: true }).filter((skill) => skill.priceVnd > 0);
  assert.ok(seeded.length >= 6);
  for (const skill of seeded) {
    assert.equal(skill.priceVnd, 50000, `${skill.slug} phải bán 50.000đ`);
  }

  // The whole point of a VND-denominated price: changing what a credit costs
  // must NOT re-price the marketplace.
  const snapshot = new Map(hub.listHubSkills({ includeHidden: true }).map((s) => [s.slug, s.priceVnd]));
  settings.patchAppSettings({ vndPerCredit: 10 });
  const after = hub.listHubSkills({ includeHidden: true });
  for (const skill of after) {
    assert.equal(
      skill.priceVnd,
      snapshot.get(skill.slug),
      `${skill.slug} đổi giá khi giá credit đổi — sai mô hình`,
    );
  }
  const sample = after.find((skill) => skill.slug === "content-sales");
  assert.equal(sample.price, 5000, "10đ/credit thì 50.000đ = 5.000 credit");

  settings.patchAppSettings({ vndPerCredit: before });
  assert.equal(hub.creditsForPriceVnd(50000, 1), 50000);
  assert.equal(hub.creditsForPriceVnd(50000, 3), 16667, "luôn làm tròn lên");
  assert.equal(hub.creditsForPriceVnd(50, 1000), 1, "kỹ năng trả tiền không bao giờ thành miễn phí");
  assert.equal(hub.creditsForPriceVnd(0, 1), 0);
  assert.equal(hub.creditsForPriceVnd(50000, 0), 0, "chưa cấu hình giá credit thì không chặn");
});
