#!/usr/bin/env node
/**
 * Đo chi phí thật của một lượt chat từ sổ credit, và thử các hệ số giá.
 *
 * Chạy ở nơi có database (node-2):
 *   FLOWGPT_DATA_DIR=/var/lib/flowgpt node ops/turn-cost-report.mjs
 *   FLOWGPT_DATA_DIR=/var/lib/flowgpt node ops/turn-cost-report.mjs 0.1 1
 *
 * Tham số: [creditsPerToken] [vndPerCredit] — in ra mỗi lượt tốn bao nhiêu đồng
 * với hệ số đó, để chọn hệ số đạt mục tiêu "1 lượt ≈ 200đ" bằng số đo thật.
 */

import { all, db, getAppSettings, initDb } from "../server/src/db.js";

const perToken = Number(process.argv[2] ?? 0.1);
const vndPerCredit = Number(process.argv[3] ?? 1);

initDb();

const settings = getAppSettings();
const rows = all("credit_ledger", "reason = 'chat_usage'", [], { order: "created_at DESC", limit: 200 });
const costs = rows.map((row) => Math.abs(Number(row.delta))).filter((value) => value > 0);

console.log(`Đang chạy: creditsPerToken=${settings.creditsPerToken}, vndPerCredit=${settings.vndPerCredit}`);
console.log(`Sổ credit có ${rows.length} lượt chat_usage.\n`);

if (!costs.length) {
  console.log("Chưa có lượt chat nào để đo.");
  db.close?.();
  process.exit(0);
}

// Hiện tại creditsPerToken = 1 nên delta chính là số token của lượt đó. Nếu chủ
// máy đã đổi hệ số thì quy ngược lại token trước khi thử hệ số mới.
const currentPerToken = Math.max(1e-9, Number(settings.creditsPerToken) || 1);
const tokens = costs.map((credits) => Math.round(credits / currentPerToken));
tokens.sort((a, b) => a - b);

const sum = tokens.reduce((a, b) => a + b, 0);
const avg = Math.round(sum / tokens.length);
const median = tokens[Math.floor(tokens.length / 2)];

console.log(`Token mỗi lượt: min ${tokens[0]} · median ${median} · trung bình ${avg} · max ${tokens[tokens.length - 1]}`);
console.log(`Tổng ${sum.toLocaleString("vi-VN")} token qua ${tokens.length} lượt.\n`);

const cost = (tokenCount) => Math.max(1, Math.ceil(tokenCount * perToken));
const vnd = (tokenCount) => cost(tokenCount) * vndPerCredit;

console.log(`--- Với creditsPerToken=${perToken}, vndPerCredit=${vndPerCredit} ---`);
for (const [label, value] of [
  ["rẻ nhất", tokens[0]],
  ["median", median],
  ["trung bình", avg],
  ["đắt nhất", tokens[tokens.length - 1]],
]) {
  console.log(
    `  ${label.padEnd(10)} ${String(value).padStart(6)} token → ${String(cost(value)).padStart(5)} credit = ${vnd(value).toLocaleString("vi-VN")} đ`,
  );
}

const avgVnd = vnd(avg);
console.log(`\nMột lượt trung bình: ${avgVnd.toLocaleString("vi-VN")} đ`);
const target = 200;
const delta = avgVnd - target;
console.log(
  Math.abs(delta) <= target * 0.15
    ? `✔ đạt mục tiêu ~${target}đ (lệch ${delta > 0 ? "+" : ""}${delta}đ)`
    : `✖ chưa đạt mục tiêu ~${target}đ (lệch ${delta > 0 ? "+" : ""}${delta}đ) — cần creditsPerToken ≈ ${(target / (avg * vndPerCredit)).toFixed(4)}`,
);

const signup = Number(settings.signupCredits) || 0;
const grantVnd = signup * vndPerCredit;
console.log(
  `\nTặng đăng nhập ${signup.toLocaleString("vi-VN")} credit = ${grantVnd.toLocaleString("vi-VN")} đ ≈ ${Math.floor(grantVnd / Math.max(1, avgVnd))} lượt chat`,
);
db.close?.();
