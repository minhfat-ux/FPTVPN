#!/usr/bin/env node
/**
 * Repairs the Skill Hub catalogue in a live database.
 *
 * Two jobs, both driven by what is actually stored:
 *
 *   1. Re-price the seeded skills to match `server/src/skills/hub.js` (the seed
 *      only runs for slugs that do not exist yet, so an existing row keeps its
 *      old price forever). Prices are in VND and independent of the credit price.
 *   2. Recompute `installs` from the real `hub_purchases` table. The counter is
 *      incremented on every purchase, and test runs against production inflated
 *      it, so it must be derived from ownership records — not trusted.
 *
 * This edits the database directly, so it only runs where the database lives
 * (on node-2), and it is a dry run unless --apply is passed:
 *
 *   ssh root@165.101.114.162
 *   cd /opt/fbuddy
 *   FBUDDY_DATA_DIR=/var/lib/fbuddy node ops/hub-catalog-fix.mjs           # show the diff
 *   FBUDDY_DATA_DIR=/var/lib/fbuddy node ops/hub-catalog-fix.mjs --apply   # write it
 *
 * Rollback: prices are re-derivable from this file's TARGET_PRICE_VND by
 * re-running with the old numbers; `installs` is always recomputed from
 * purchases, and purchases are never touched.
 */

import { all, db, getAppSettings, initDb, update } from "../server/src/db.js";

const APPLY = process.argv.includes("--apply");

/** The VND price each seeded slug should carry. */
const TARGET_PRICE_VND = {
  "content-sales": 50000,
  "meeting-notes": 50000,
  "doc-translate": 50000,
  "contract-review": 50000,
  "lesson-plan": 50000,
  "data-story": 50000,
  "brand-voice": 0,
};

initDb();

const perCredit = Math.max(0, Number(getAppSettings().vndPerCredit) || 0);
const credits = (vnd) =>
  !vnd || !perCredit ? 0 : Math.max(1, Math.ceil(vnd / perCredit));

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

console.log(
  `${APPLY ? "APPLY" : "DRY RUN"} · ${skills.length} kỹ năng · ${purchases.length} lượt mua thật · 1 credit = ${perCredit}đ\n`,
);
console.log(`${"slug".padEnd(16)} ${"giá".padEnd(22)} ${"installs".padEnd(20)}`);

let priceFixes = 0;
let installFixes = 0;

for (const skill of skills) {
  const changes = {};

  const target = TARGET_PRICE_VND[skill.slug];
  const oldPriceVnd = Math.max(0, Math.trunc(Number(skill.price_vnd ?? 0) || 0));
  if (target !== undefined && target !== oldPriceVnd) {
    changes.price_vnd = target;
    // Keep the legacy credits column in step with the VND price.
    changes.price = credits(target);
    priceFixes += 1;
  }

  const realInstalls = ownedBy.get(skill.id) ?? 0;
  const oldInstalls = Number(skill.installs ?? 0);
  if (oldInstalls !== realInstalls) {
    changes.installs = realInstalls;
    installFixes += 1;
  }

  const priceCell =
    target !== undefined && target !== oldPriceVnd
      ? `${oldPriceVnd.toLocaleString("vi-VN")} → ${target.toLocaleString("vi-VN")}đ`
      : `${oldPriceVnd.toLocaleString("vi-VN")}đ`;
  const installCell =
    oldInstalls !== realInstalls ? `${oldInstalls} → ${realInstalls} (mua thật)` : String(oldInstalls);
  console.log(`${skill.slug.padEnd(16)} ${priceCell.padEnd(22)} ${installCell.padEnd(20)}`);

  if (APPLY && Object.keys(changes).length) update("hub_skills", skill.id, changes);
}

console.log(`\n${priceFixes} giá · ${installFixes} bộ đếm cần sửa.`);
if (!APPLY) {
  console.log("Chưa ghi gì cả. Thêm --apply để sửa thật.");
} else {
  console.log("Đã ghi. Kiểm tra lại bằng: node ops/hub-catalog-fix.mjs");
}
db.close?.();
