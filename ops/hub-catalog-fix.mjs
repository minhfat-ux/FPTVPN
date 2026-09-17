#!/usr/bin/env node
/**
 * Repairs the Skill Hub catalogue in a live database.
 *
 * Two jobs, both driven by what is actually stored:
 *
 *   1. Re-price the seeded skills to match `server/src/skills/hub.js` (the seed
 *      only runs for slugs that do not exist yet, so an existing row keeps its
 *      old price forever).
 *   2. Recompute `installs` from the real `hub_purchases` table. The counter is
 *      incremented on every purchase, and test runs against production inflated
 *      it, so it must be derived from ownership records — not trusted.
 *
 * This edits the database directly, so it only runs where the database lives
 * (on node-2), and it is a dry run unless --apply is passed:
 *
 *   ssh root@165.101.114.162
 *   cd /opt/flowgpt
 *   FLOWGPT_DATA_DIR=/var/lib/flowgpt node ops/hub-catalog-fix.mjs           # show the diff
 *   FLOWGPT_DATA_DIR=/var/lib/flowgpt node ops/hub-catalog-fix.mjs --apply   # write it
 *
 * Rollback: prices are re-derivable from this file's TARGET_PRICES by re-running
 * with the old numbers; `installs` is always recomputed from purchases, and
 * purchases are never touched.
 */

import { all, db, initDb, update } from "../server/src/db.js";

const APPLY = process.argv.includes("--apply");

/** The price each seeded slug should carry (1 credit = 20đ → 30k–70k VND). */
const TARGET_PRICES = {
  "content-sales": 2000,
  "meeting-notes": 1500,
  "doc-translate": 2500,
  "contract-review": 3500,
  "lesson-plan": 2000,
  "data-story": 3000,
  "brand-voice": 0,
};

initDb();

const skills = all("hub_skills", "", [], { order: "sort_order ASC" });
if (!skills.length) {
  console.log("Chợ kỹ năng đang trống — không có gì để sửa.");
  process.exit(0);
}

const purchases = all("hub_purchases");
const ownedBy = new Map();
for (const row of purchases) {
  ownedBy.set(row.hub_skill_id, (ownedBy.get(row.hub_skill_id) ?? 0) + 1);
}

console.log(`${APPLY ? "APPLY" : "DRY RUN"} · ${skills.length} kỹ năng · ${purchases.length} lượt mua thật\n`);
console.log(`${"slug".padEnd(16)} ${"giá".padEnd(14)} ${"installs".padEnd(20)}`);

let priceFixes = 0;
let installFixes = 0;

for (const skill of skills) {
  const changes = {};

  const target = TARGET_PRICES[skill.slug];
  const oldPrice = Number(skill.price ?? 0);
  if (target !== undefined && target !== oldPrice) {
    changes.price = target;
    priceFixes += 1;
  }

  const realInstalls = ownedBy.get(skill.id) ?? 0;
  const oldInstalls = Number(skill.installs ?? 0);
  if (oldInstalls !== realInstalls) {
    changes.installs = realInstalls;
    installFixes += 1;
  }

  const priceCell = target !== undefined && target !== oldPrice ? `${oldPrice} → ${target}` : String(oldPrice);
  const installCell =
    oldInstalls !== realInstalls ? `${oldInstalls} → ${realInstalls} (mua thật)` : String(oldInstalls);
  console.log(`${skill.slug.padEnd(16)} ${priceCell.padEnd(14)} ${installCell.padEnd(20)}`);

  if (APPLY && Object.keys(changes).length) update("hub_skills", skill.id, changes);
}

console.log(`\n${priceFixes} giá · ${installFixes} bộ đếm cần sửa.`);
if (!APPLY) {
  console.log("Chưa ghi gì cả. Thêm --apply để sửa thật.");
} else {
  console.log("Đã ghi. Kiểm tra lại bằng: node ops/hub-catalog-fix.mjs");
}
db.close?.();
