import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TEST_DATA_DIR } from "./helpers.js";

/**
 * The `price_vnd` migration rewrites the price of every skill already in the
 * shop, so it is worth proving against a database in the OLD format rather than
 * only against a freshly created one (which always has the new column).
 *
 * The legacy database is built before `src/db.js` is imported, because `config.js`
 * resolves the data directory on import and `initDb()` runs the migration.
 */
const legacyPath = path.join(TEST_DATA_DIR, "flowgpt.db");
const legacy = new DatabaseSync(legacyPath);
legacy.exec(`
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE hub_skills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Khác',
  icon TEXT NOT NULL DEFAULT 'sparkles',
  price INTEGER NOT NULL DEFAULT 0,
  instructions TEXT,
  tools_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'published',
  sort_order INTEGER NOT NULL DEFAULT 0,
  installs INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
const now = new Date().toISOString();
// The credit price this shop was selling at before the upgrade.
legacy.prepare("INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)").run(
  "vndPerCredit",
  "20",
  now,
);
const insertLegacy = legacy.prepare(
  `INSERT INTO hub_skills (id, slug, name, category, icon, price, state, sort_order, installs, created_at, updated_at)
   VALUES (?, ?, ?, 'Văn phòng', 'sparkles', ?, 'published', 10, 3, ?, ?)`,
);
insertLegacy.run("h_paid", "paid-skill", "Kỹ năng trả tiền", 2000, now, now);
insertLegacy.run("h_free", "free-skill", "Kỹ năng miễn phí", 0, now, now);
legacy.close();

const { initDb, all, db } = await import("../src/db.js");
initDb();

test("the migration prices old credit-priced skills in VND at the then-current rate", () => {
  const rows = all("hub_skills", "", [], { order: "slug ASC" });
  const paid = rows.find((row) => row.slug === "paid-skill");
  const free = rows.find((row) => row.slug === "free-skill");
  assert.ok(paid.price_vnd !== undefined, "phải có cột price_vnd sau migration");
  // 2.000 credit × 20đ/credit = 40.000đ — the money price must not change.
  assert.equal(paid.price_vnd, 40000);
  assert.equal(free.price_vnd, 0, "kỹ năng miễn phí vẫn miễn phí");
  assert.equal(paid.installs, 3, "bộ đếm cũ được giữ nguyên, không phải suy ra lúc migrate");
});

test("the backfill runs once — a deliberate price is never resurrected on restart", () => {
  // Simulate the owner re-pricing the skill after the upgrade.
  db.prepare("UPDATE hub_skills SET price_vnd = 50000, price = 1 WHERE slug = 'paid-skill'").run();
  initDb(); // a restart
  const paid = all("hub_skills", "slug = 'paid-skill'")[0];
  assert.equal(paid.price_vnd, 50000, "khởi động lại không được ghi đè giá đã đặt");
  assert.notEqual(paid.price_vnd, 40000, "không quay về giá cũ");
});
