// Console → quản lý người dùng phải thấy được "credit đã burn" (yêu cầu chủ dự án 2026-09-20).
import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, bootServer, closeServer } from "./helpers.js";

const { initDb } = await import("../src/db.js");
initDb();
const { createUser, issueToken } = await import("../src/auth.js");
const { grantCredits, spendCredits } = await import("../src/credits.js");

await bootServer();

after(async () => {
  await closeServer();
});

function userFor(email, role = "user") {
  const user = createUser({ email, password: "matkhau12345", name: "Test", role });
  return { user, token: issueToken(user) };
}

test("/admin/users trả về credit đã burn cho từng tài khoản", async () => {
  const admin = userFor("burn-admin@fbuddy.test", "admin");
  const heavy = userFor("burn-heavy@fbuddy.test");
  const light = userFor("burn-light@fbuddy.test");

  grantCredits({ userId: heavy.user.id, amount: 5000 });
  spendCredits({ userId: heavy.user.id, amount: 3200, reason: "chat_usage" });
  spendCredits({ userId: heavy.user.id, amount: 300, reason: "chat_usage" });
  grantCredits({ userId: light.user.id, amount: 1000 });
  spendCredits({ userId: light.user.id, amount: 40, reason: "chat_usage" });

  const result = await api("GET", "/admin/users", undefined, admin.token);
  const byEmail = new Map(result.items.map((item) => [item.email, item]));

  const heavyRow = byEmail.get("burn-heavy@fbuddy.test");
  assert.equal(heavyRow.creditBurned, 3500, "burn = tổng credit đã tiêu (3200 + 300)");
  // Tài khoản mới còn được cấp credit khởi tạo, nên `granted` = khởi tạo + 5000.
  assert.equal(heavyRow.creditBalance, heavyRow.creditGranted - 3500, "số dư = đã cấp − đã burn");
  assert.equal(heavyRow.creditEntries, 4, "1 khởi tạo + 1 cấp + 2 lần tiêu");
  assert.ok(heavyRow.creditLastAt, "phải có mốc hoạt động gần nhất");

  const lightRow = byEmail.get("burn-light@fbuddy.test");
  assert.equal(lightRow.creditBurned, 40);
  assert.equal(lightRow.creditBalance, lightRow.creditGranted - 40);

  const adminRow = byEmail.get("burn-admin@fbuddy.test");
  assert.equal(adminRow.creditBurned, 0, "tài khoản chưa dùng thì burn = 0");
});

test("/admin/stats có tổng credit đã burn toàn hệ thống", async () => {
  const admin = userFor("burn-admin2@fbuddy.test", "admin");
  const stats = await api("GET", "/admin/stats", undefined, admin.token);
  assert.equal(typeof stats.creditsBurned, "number");
  assert.ok(stats.creditsBurned >= 3540, `tổng burn phải cộng dồn: ${stats.creditsBurned}`);
});
