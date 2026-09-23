// Kiem tra "song" tren SO THAT: doc su kien cuoi cua mot task trong ops/tasks/ va hoi luat danh thuc.
//   node ops/_scratch/wake-check-live.mjs T-20260923-03
import fs from "node:fs";
import path from "node:path";
import { wakeReason } from "../lib/wake-policy.mjs";

const id = process.argv[2] ?? "T-20260923-03";
const self = (process.argv[3] ?? "WIN").toUpperCase();
const dir = path.join("ops", "tasks", id);
const events = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8").replace(/^\uFEFF/, "")));
events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
const created = events.find((e) => e.type === "created");
const task = created?.task ?? { id, from: "?", to: "?" };
const to = String(task.to ?? "").toLowerCase();

// Xét đúng trạng thái đã gây vòng lặp: sự kiện cuối là `blocked` do chính tôi ghi.
// (`woken` là hệ quả của vòng lặp, không phải trạng thái kích hoạt.)
for (const [label, last] of [
  ["sự kiện cuối", events[events.length - 1]],
  ["lần `blocked` cuối", [...events].reverse().find((e) => e.type === "blocked")],
]) {
  if (!last) continue;
  const entry = { id, task, last };
  const oldRule = to === self.toLowerCase() && last.type === "blocked";
  console.log(`task ${id}: ${task.from} → ${task.to}`);
  console.log(`  ${label}: ${last.type} (actor=${last.actor ?? "?"}) lúc ${last.at}`);
  console.log(`  luật CŨ  → ${oldRule ? "ĐÁNH THỨC (vòng lặp!)" : "không"}`);
  console.log(`  luật MỚI → ${wakeReason(entry, self) ?? "không đánh thức"}`);
}
