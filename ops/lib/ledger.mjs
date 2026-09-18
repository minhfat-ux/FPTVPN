/**
 * Đọc sổ giao việc `ops/tasks/` — dùng chung cho `task.mjs` và `status-board.mjs`.
 *
 * QUAN TRỌNG: sự kiện do bên kia push nằm trên `origin/flowgpt` chứ KHÔNG tự có trong cây cục bộ.
 * Nếu chỉ đọc file cục bộ thì bảng trạng thái sẽ nói sai kiểu "im lặng 83 phút" trong khi bên kia
 * đã `ack` từ lâu (đã gặp thật). Vì vậy trước khi đọc, ta fetch rồi materialize sổ từ remote:
 * `git restore --source=origin/flowgpt --worktree -- ops/tasks` (chỉ ghi worktree, không đụng index,
 * và file sự kiện là bất biến nên ghi đè là an toàn).
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const TASKS_DIR = path.join("ops", "tasks");

const git = (...argv) => {
  try {
    return execFileSync("git", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return `!git: ${String(error.stderr || error.message).trim().split("\n")[0]}`;
  }
};

/** Kéo sổ mới nhất từ git về cây cục bộ. Trả về { ok, reason }. */
export function syncLedger({ fetch = true } = {}) {
  if (fetch) {
    const fetched = git("fetch", "-q", "origin", "flowgpt");
    if (fetched.startsWith("!git")) return { ok: false, reason: fetched };
  }
  const restored = git("restore", "--source=origin/flowgpt", "--worktree", "--", TASKS_DIR);
  if (restored.startsWith("!git")) return { ok: false, reason: restored };
  return { ok: true };
}

/** Mọi sự kiện của một task (đọc cục bộ; gọi syncLedger trước nếu cần dữ liệu mới). */
export function eventsOf(id) {
  const dir = path.join(TASKS_DIR, id);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return { ...JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")), file: name };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** Mọi task có sự kiện `created` (bỏ qua thư mục rác). */
export function readTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  const tasks = [];
  for (const id of fs.readdirSync(TASKS_DIR)) {
    if (id.startsWith(".")) continue;
    let stat;
    try {
      stat = fs.statSync(path.join(TASKS_DIR, id));
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const events = eventsOf(id);
    const created = events.find((event) => event.type === "created");
    if (!created) continue;
    tasks.push({ id, task: created.task ?? { id }, events, ...foldStatus(events) });
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}

/** Trạng thái suy ra từ chuỗi sự kiện. */
export function foldStatus(events) {
  let status = "created";
  let verified = null;
  let reopened = 0;
  for (const event of events) {
    if (event.type === "sent") status = "sent";
    else if (event.type === "acked") status = "acked";
    else if (event.type === "progress") status = "in_progress";
    else if (event.type === "blocked") status = "blocked";
    else if (event.type === "done") status = "done";
    else if (event.type === "verified") {
      status = event.result === "pass" ? "verified" : "reopened";
      verified = event;
      if (event.result !== "pass") reopened += 1;
    }
  }
  return { status, verified, reopened, last: events[events.length - 1] ?? null };
}
