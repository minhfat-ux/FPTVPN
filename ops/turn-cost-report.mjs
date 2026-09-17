#!/usr/bin/env node
/**
 * Đo chi phí thật của một lượt chat và thử các hệ số giá.
 *
 *   FLOWGPT_DATA_DIR=/var/lib/flowgpt node ops/turn-cost-report.mjs
 *   FLOWGPT_DATA_DIR=/var/lib/flowgpt node ops/turn-cost-report.mjs 0.06 1
 *
 * Tham số: [creditsPerToken] [vndPerCredit].
 *
 * Nguồn số liệu là `messages.usage_json` (token vào/ra thật của từng lượt trả
 * lời), **không** phải `credit_ledger`. Lý do: `delta` trong sổ đã bị nhân với
 * `creditsPerToken` tại thời điểm ghi, nên sau khi đổi hệ số thì quy ngược lại
 * sẽ trộn hai đơn vị. `usage_json` thì độc lập với hệ số giá.
 */

import { all, db, getAppSettings, initDb } from "../server/src/db.js";

const perToken = Number(process.argv[2] ?? 0.06);
const vndPerCredit = Number(process.argv[3] ?? 1);

initDb();

const settings = getAppSettings();
console.log(`Đang chạy: creditsPerToken=${settings.creditsPerToken}, vndPerCredit=${settings.vndPerCredit}\n`);

// Mỗi lượt trả lời của trợ lý có thể kèm usage; lượt không có usage bị bỏ qua.
const rows = all("messages", "role = 'assistant'", [], { order: "created_at DESC", limit: 300 });
const turns = [];
for (const row of rows) {
  const usage = row.usage;
  if (!usage) continue;
  const tokens = Number(usage.in ?? 0) + Number(usage.out ?? 0);
  if (tokens > 0) turns.push(tokens);
}

if (!turns.length) {
  console.log("Chưa có lượt chat nào kèm usage để đo.");
  db.close?.();
  process.exit(0);
}

turns.sort((a, b) => a - b);
const sum = turns.reduce((a, b) => a + b, 0);
const avg = Math.round(sum / turns.length);
const median = turns[Math.floor(turns.length / 2)];
const p90 = turns[Math.min(turns.length - 1, Math.floor(turns.length * 0.9))];

console.log(`Số lượt đo được: ${turns.length} (nguồn: messages.usage_json)`);
console.log(`Token mỗi lượt: min ${turns[0]} · median ${median} · trung bình ${avg} · p90 ${p90} · max ${turns[turns.length - 1]}\n`);

const cost = (tokenCount) => Math.max(1, Math.ceil(tokenCount * perToken));
const vnd = (tokenCount) => cost(tokenCount) * vndPerCredit;

console.log(`--- Với creditsPerToken=${perToken}, vndPerCredit=${vndPerCredit} ---`);
for (const [label, value] of [
  ["rẻ nhất", turns[0]],
  ["median", median],
  ["trung bình", avg],
  ["p90", p90],
  ["đắt nhất", turns[turns.length - 1]],
]) {
  console.log(
    `  ${label.padEnd(10)} ${String(value).padStart(6)} token → ${String(cost(value)).padStart(5)} credit = ${vnd(value).toLocaleString("vi-VN")} đ`,
  );
}

const avgVnd = vnd(avg);
const target = 200;
const delta = avgVnd - target;
console.log(`\nMột lượt trung bình: ${avgVnd.toLocaleString("vi-VN")} đ`);
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
