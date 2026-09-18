#!/usr/bin/env node
/**
 * WATCHER ĐÁNH THỨC giữa hai harness.
 *
 * Vấn đề: ghi sổ giao việc vào git thì bên kia BIẾT khi nào họ `git fetch`, nhưng không ai
 * "gọi" được họ dậy. Telegram cũng không: hai bên gửi cùng một bot nên `getUpdates` không
 * trả lại tin của nhau. Cách giải: mỗi bên chạy watcher này — nó poll `origin/flowgpt`, thấy
 * việc mới thuộc về mình thì BOOT một lượt agent bằng `dsh --profile headless "<prompt>"`
 * để đọc sổ, `ack` và làm việc luôn.
 *
 *   node ops/agent-watch.mjs                     # vòng lặp, mặc định chỉ BÁO (không tự boot)
 *   node ops/agent-watch.mjs --auto              # ĐÁNH THỨC thật: boot dsh headless
 *   node ops/agent-watch.mjs --once --dry-run    # kiểm tra sẽ làm gì, không làm gì cả
 *   node ops/agent-watch.mjs --wake-cmd 'echo {prompt}'   # tự định nghĩa lệnh đánh thức
 *
 * Biến môi trường:
 *   AGENT_NAME=MAC|WIN     bên nào (mặc định MAC). Bên còn lại là đối tác.
 *   DSH_WAKE_CMD           lệnh đánh thức; `{prompt}` sẽ được thay bằng nội dung giao việc.
 *                          Mặc định: dsh --profile headless "{prompt}"
 *   WAKE_INTERVAL          giây giữa hai lần poll (mặc định 20)
 *   WAKE_COOLDOWN          giây tối thiểu giữa hai lần đánh thức CÙNG một việc (mặc định 600)
 *
 * Bằng chứng: mỗi lần đánh thức, watcher ghi sự kiện `woken` vào sổ và push lên git — bên giao
 * nhìn thấy "đã đánh thức lúc …" ⇒ biết kênh đánh thức thông, không phải đoán.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const SELF = (process.env.AGENT_NAME || "MAC").toUpperCase();
const PEER = SELF === "MAC" ? "WIN" : "MAC";
const TASKS_DIR = path.join("ops", "tasks");
const STATE_FILE = path.join(TASKS_DIR, `.watch-${SELF.toLowerCase()}.json`);

const args = process.argv.slice(2);
const flagValue = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const ONCE = args.includes("--once");
const DRY = args.includes("--dry-run");
const AUTO = args.includes("--auto");
/** Chỉ dùng khi THỬ: chạy lệnh đánh thức nhưng không ghi sự kiện `woken` (tránh bằng chứng giả). */
const NO_RECORD = args.includes("--no-record");
const INTERVAL = Number(flagValue("interval", process.env.WAKE_INTERVAL ?? 20)) || 20;
const COOLDOWN = Number(flagValue("cooldown", process.env.WAKE_COOLDOWN ?? 600)) || 600;
const WAKE_CMD = flagValue("wake-cmd", process.env.DSH_WAKE_CMD ?? 'dsh --profile headless "{prompt}"');

const git = (...argv) => {
  try {
    return execFileSync("git", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return `!git: ${String(error.stderr || error.message).trim().split("\n")[0]}`;
  }
};
const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)} ${SELF}] ${message}`);

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { seen: [], lastWake: {}, initialized: false };
  }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 1)}\n`);
}

/** Đọc sổ từ origin/flowgpt (không cần merge vào cây đang làm việc). */
function readLedger() {
  const listing = git("ls-tree", "-r", "--name-only", "origin/flowgpt", `${TASKS_DIR}/`);
  if (listing.startsWith("!git")) return { error: listing, tasks: [] };
  const files = listing.split("\n").filter((line) => line.endsWith(".json") && !line.includes("/."));
  const byTask = new Map();
  for (const file of files) {
    const id = file.split("/")[2];
    if (!id) continue;
    let event;
    try {
      event = JSON.parse(git("show", `origin/flowgpt:${file}`));
    } catch {
      continue;
    }
    if (!byTask.has(id)) byTask.set(id, []);
    byTask.get(id).push({ ...event, file });
  }
  const tasks = [];
  for (const [id, events] of byTask) {
    events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const created = events.find((event) => event.type === "created");
    tasks.push({
      id,
      task: created?.task ?? { id, from: "?", to: "?" },
      events,
      last: events[events.length - 1],
      types: events.map((event) => event.type),
    });
  }
  return { error: null, tasks };
}

/** Việc này có cần ĐÁNH THỨC tôi không? Trả về lý do hoặc null. */
function wakeReason(entry) {
  const to = String(entry.task.to ?? "").toLowerCase();
  const from = String(entry.task.from ?? "").toLowerCase();
  const last = entry.last;
  const mine = to === SELF.toLowerCase();
  const theirs = from === SELF.toLowerCase();
  if (!last) return null;
  if (mine && last.type === "sent") return "có việc mới được giao";
  if (mine && last.type === "verified" && last.result === "fail") return "bị trả lại, phải làm lại";
  if (mine && last.type === "blocked") return "bên giao vừa ghi chú vào việc của tôi";
  // Bên giao chỉ bị đánh thức khi thật sự cần hành động — không réo mỗi lần đối tác `ack`/`progress`.
  if (theirs && last.type === "done") return "đối tác báo xong — cần nghiệm thu";
  if (theirs && last.type === "blocked") return "đối tác đang vướng, cần gỡ";
  return null;
}

function buildPrompt(entry, reason) {
  return [
    `ĐÁNH THỨC TỰ ĐỘNG (${SELF} ← watcher ${PEER}).`,
    `Lý do: ${reason}.`,
    `Task ${entry.id}: ${entry.task.title ?? ""}`,
    entry.task.detail ? `Tài liệu: ${entry.task.detail}` : "",
    "",
    "Làm ngay, theo đúng thứ tự:",
    "1) node ops/task.mjs sync",
    `2) đọc docs/TASK-PROTOCOL.md và docs/TASK-WINDOWS-REWRITE.md nếu có`,
    `3) nếu việc thuộc về tôi: AGENT_NAME=${SELF} node ops/task.mjs ack ${entry.id} --push  rồi thực hiện`,
    `4) xong thì: AGENT_NAME=${SELF} node ops/task.mjs done ${entry.id} --evidence "commit=…, cmd=…, kết quả=…" --push`,
    `5) nếu tôi là bên giao: chạy đúng lệnh nghiệm thu trong sổ rồi verify --result pass|fail`,
  ]
    .filter(Boolean)
    .join("\n");
}

function runWake(prompt) {
  const command = WAKE_CMD.includes("{prompt}") ? WAKE_CMD.replace("{prompt}", prompt) : `${WAKE_CMD} ${prompt}`;
  if (DRY) {
    log(`(--dry-run) sẽ chạy: ${command.slice(0, 160)}…`);
    return;
  }
  const child = spawn(command, { shell: true, detached: true, stdio: "ignore" });
  child.unref();
  log(`đã đánh thức: ${command.split(" ").slice(0, 4).join(" ")}… (pid ${child.pid})`);
}

/** Ghi sự kiện `woken` rồi push — bằng chứng kênh đánh thức đã thông. */
function recordWake(entry, reason) {
  if (DRY || NO_RECORD) return;
  const file = path.join(TASKS_DIR, entry.id, `${new Date().toISOString().replace(/[:.]/g, "-")}-${SELF.toLowerCase()}-woken.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ type: "woken", actor: SELF.toLowerCase(), at: new Date().toISOString(), note: reason, via: WAKE_CMD }, null, 1)}\n`);
  const pushed = git("push", "origin", `HEAD:refs/heads/flowgpt`);
  if (String(pushed).startsWith("!git")) {
    // Cây lệch: đẩy qua worktree tạm để không đụng cây đang làm việc.
    const worktree = path.join(os.tmpdir(), `dsh-wake-${process.pid}`);
    git("fetch", "origin", "flowgpt");
    if (!git("worktree", "add", "-q", "--detach", worktree, "origin/flowgpt").startsWith("!git")) {
      try {
        fs.cpSync(TASKS_DIR, path.join(worktree, TASKS_DIR), { recursive: true });
        execFileSync("git", ["add", TASKS_DIR], { cwd: worktree });
        execFileSync("git", ["-c", "user.email=agent@flowtech", "-c", "user.name=FlowTech Agent", "commit", "-q", "-m", `task: watcher ${SELF} đánh thức [task ${entry.id}]`], { cwd: worktree });
        execFileSync("git", ["push", "origin", "HEAD:flowgpt"], { cwd: worktree });
        log("đã push bằng chứng `woken` (qua worktree)");
      } catch (error) {
        log(`push bằng chứng lỗi: ${String(error.stderr || error.message).split("\n")[0]}`);
      } finally {
        git("worktree", "remove", "--force", worktree);
        git("worktree", "prune");
      }
    }
  } else {
    log("đã push bằng chứng `woken`");
  }
}

async function tick(state, { initializeOnly = false } = {}) {
  const fetched = git("fetch", "origin", "flowgpt");
  if (fetched.startsWith("!git")) log(`fetch lỗi: ${fetched}`);
  const { error, tasks } = readLedger();
  if (error) {
    log(`không đọc được sổ: ${error}`);
    return 0;
  }
  let woke = 0;
  for (const entry of tasks) {
    const seenKey = entry.last ? `${entry.id}:${entry.last.at}:${entry.last.type}` : null;
    if (!seenKey || state.seen.includes(seenKey)) continue;
    const reason = wakeReason(entry);
    if (initializeOnly) {
      state.seen.push(seenKey);
      continue;
    }
    if (!reason) {
      state.seen.push(seenKey);
      continue;
    }
    const lastWake = state.lastWake[entry.id] ? new Date(state.lastWake[entry.id]).getTime() : 0;
    if (Date.now() - lastWake < COOLDOWN * 1000) {
      state.seen.push(seenKey);
      continue;
    }
    log(`ĐÁNH THỨC vì ${reason} → ${entry.id} (${entry.task.title ?? ""})`);
    state.seen.push(seenKey);
    state.lastWake[entry.id] = new Date().toISOString();
    if (AUTO) {
      runWake(buildPrompt(entry, reason));
      recordWake(entry, reason);
    } else {
      log(`  (chế độ chỉ báo — thêm --auto để boot harness. Lệnh sẽ dùng: ${WAKE_CMD.slice(0, 60)}…)`);
      log(`  nhận việc bằng tay: AGENT_NAME=${SELF} node ops/task.mjs ack ${entry.id} --push`);
    }
    woke += 1;
  }
  state.initialized = true;
  saveState(state);
  return woke;
}

const state = loadState();
const firstRun = !state.initialized;
if (!ONCE) {
  await tick(state, { initializeOnly: firstRun && !args.includes("--replay") });
  if (firstRun) log(`lần chạy đầu: bỏ qua ${state.seen.length} sự kiện cũ, chỉ đánh thức cho việc MỚI.`);
}
if (ONCE) {
  const woke = await tick(state);
  log(`--once xong (${woke} lần đánh thức, ${DRY ? "dry-run" : "thật"}).`);
} else {
  log(`đang chạy: ${SELF} ← ${PEER} · poll ${INTERVAL}s · ${AUTO ? "TỰ ĐỘNG đánh thức" : "chỉ báo"} · cooldown ${COOLDOWN}s`);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, INTERVAL * 1000));
    try {
      await tick(state);
    } catch (error) {
      log(`lỗi vòng lặp: ${String(error.message).split("\n")[0]}`);
    }
  }
}
