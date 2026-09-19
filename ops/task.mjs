#!/usr/bin/env node
/**
 * Sổ giao việc giữa hai harness (Mac ↔ Windows) — có trạng thái, có ACK, có nghiệm thu.
 *
 * VÌ SAO KHÔNG DÙNG TELEGRAM LÀM KÊNH CHÍNH: hai bên gửi bằng CÙNG một bot, mà Telegram
 * không trả lại cho `getUpdates` những tin do chính bot gửi ⇒ bên kia không đọc được.
 * Telegram chỉ dùng để "hú" cho người thật biết. KÊNH XÁC THỰC LÀ GIT:
 * mỗi sự kiện là một file trong `ops/tasks/<id>/`, push lên `origin/flowgpt` ⇒ có commit sha
 * làm bằng chứng, không phải "tin rằng bên kia đã nhận".
 *
 * Lệnh (mỗi lệnh ghi 1 file sự kiện, không sửa file cũ ⇒ hai bên không giẫm chân nhau):
 *
 *   node ops/task.mjs new --title "…" --to win [--detail docs/X.md] [--verify "cmd"] [--due 2026-09-19]
 *   node ops/task.mjs send <id> [--push] [--ping]     # ghi nhận đã giao + (tuỳ chọn) push & hú Telegram
 *   node ops/task.mjs ack <id> [--note "…"] [--push]  # BÊN NHẬN xác nhận đã nhận việc
 *   node ops/task.mjs progress <id> --note "…" [--push]
 *   node ops/task.mjs blocked <id> --reason "…" [--push]
 *   node ops/task.mjs done <id> --evidence "commit=… cmd=… kết quả=…" [--push]
 *   node ops/task.mjs verify <id> --result pass|fail [--note "…"] [--push]   # BÊN GIAO nghiệm thu
 *   node ops/task.mjs show <id> | list [--open|--all] | sync
 *
 * Luật cứng:
 *   - chỉ bên nhận (`--to`) được `ack`/`progress`/`done`/`blocked`
 *   - chỉ bên giao được `verify`; `verify` chỉ chạy sau `done`
 *   - `done` BẮT BUỘC có `--evidence` (commit sha / câu lệnh / file) — không có bằng chứng thì từ chối
 *   - `verify --result fail` mở lại việc (trạng thái `reopened`), phải ack + done lại
 *   - không có `verify pass` thì việc KHÔNG được coi là xong
 *
 * `sync`: `git fetch origin flowgpt` rồi đọc sự kiện của bên kia TỪ REMOTE, không cần merge
 * vào cây đang làm việc (tránh xung đột với cây dirty của harness kia).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { syncLedger } from "./lib/ledger.mjs";

const TASKS_DIR = path.join("ops", "tasks");
const VALUE_OPTIONS = new Set(["title", "to", "detail", "verify", "due", "note", "reason", "evidence", "result", "id", "peer-wake"]);
const args = process.argv.slice(2);
const flags = new Set();
const options = new Map();
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith("--")) continue;
  const name = arg.slice(2);
  if (VALUE_OPTIONS.has(name)) {
    options.set(name, args[i + 1] ?? "");
    i += 1;
  } else {
    flags.add(name);
  }
}
const opt = (name, fallback = null) => (options.has(name) ? options.get(name) : fallback);
const positional = args.filter((arg) => !arg.startsWith("--") && ![...options.values()].includes(arg));
const [command, idArg] = positional;

// .trim() để `set AGENT_NAME=WIN && …` trên Windows không tạo ra actor "win ".
const ACTOR = (process.env.AGENT_NAME || "MAC").trim().toLowerCase();
const NOW = () => new Date().toISOString().replace(/[:.]/g, "-");
const prettyTime = (iso) => String(iso ?? "").replace("T", " ").slice(0, 16);

/**
 * Trên Windows mỗi tiến trình con là MỘT cửa sổ console đen nháy lên rồi tắt (`windowsHide` mặc
 * định false). Mọi lần gọi git/node trong file này đều phải tắt cửa sổ đó.
 */
const NO_WINDOW = { windowsHide: true };

const git = (...argv) => {
  try {
    return execFileSync("git", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...NO_WINDOW }).trim();
  } catch (error) {
    return `!git: ${String(error.stderr || error.message).trim().split("\n")[0]}`;
  }
};

// ---------------------------------------------------------------- ghi / đọc sự kiện

function taskDir(id) {
  return path.join(TASKS_DIR, id);
}

/** Danh sách id hiện có (đọc từ đĩa). */
function localIds() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

function readJson(file, fromRemote = false) {
  try {
    const raw = fromRemote ? git("show", `origin/flowgpt:${file}`) : fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function eventsOf(id, fromRemote = false) {
  let names = [];
  if (fromRemote) {
    const listing = git("ls-tree", "-r", "--name-only", "origin/flowgpt", `${TASKS_DIR}/${id}/`);
    names = listing.startsWith("!git") ? [] : listing.split("\n").filter((line) => line.endsWith(".json"));
  } else {
    const dir = taskDir(id);
    names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => path.join(dir, name)) : [];
  }
  return names
    .map((file) => readJson(file, fromRemote))
    .filter(Boolean)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** Gộp sự kiện thành trạng thái hiện tại. */
function fold(events) {
  const state = { status: "unknown", ack: null, done: null, verified: null, reopened: 0, last: null, events };
  for (const event of events) {
    state.last = event;
    switch (event.type) {
      case "created": state.status = "created"; state.task = event.task; break;
      case "sent": state.status = "sent"; break;
      case "acked": state.status = "acked"; state.ack = event; break;
      case "progress":
        // progress ghi sau done chỉ là ghi chú thừa — không lùi trạng thái.
        if (state.status !== "done" && state.status !== "verified") state.status = "in_progress";
        break;
      case "blocked": state.status = "blocked"; state.blocked = event; break;
      case "done": state.status = "done"; state.done = event; break;
      case "verified":
        state.status = event.result === "pass" ? "verified" : "reopened";
        state.verified = event;
        if (event.result !== "pass") state.reopened += 1;
        break;
      default: break;
    }
  }
  return state;
}

function writeEvent(id, event) {
  const dir = taskDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${NOW()}-${ACTOR}-${event.type}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ ...event, actor: ACTOR, at: new Date().toISOString() }, null, 1)}\n`);
  return file;
}

/**
 * Commit + push phần sổ giao việc.
 *
 * Cây làm việc của hai harness thường xuyên dirty/lệch nhau, nên đẩy thẳng từ cây chính hay bị
 * `non-fast-forward`. Cách chắc ăn: nếu đẩy thẳng thất bại thì chép `ops/tasks/` sang một
 * worktree tạm của `origin/flowgpt`, commit ở đó rồi push — KHÔNG đụng tới cây đang làm việc.
 */
/**
 * Cầu nối sang kênh mà phía Windows đã tự dựng: `docs/ASK-WINDOWS.md`.
 *
 * Họ poll kênh riêng của họ (file này) chứ không nhất thiết poll `ops/tasks/`. Nên mỗi lần sổ thay
 * đổi, ta SINH LẠI một khối trong file đó (giữa hai mốc AUTO-TASKS) để việc hiện ra đúng chỗ họ nhìn.
 * Chỉ ghi trong khoảng giữa hai mốc — nội dung do người viết bên ngoài không bị đụng.
 */
const ASK_DOC = path.join("docs", "ASK-WINDOWS.md");
const ASK_START = "<!-- AUTO-TASKS:START (do ops/task.mjs sinh, dung sua tay) -->";
const ASK_END = "<!-- AUTO-TASKS:END -->";

/**
 * Thay khối giữa hai mốc bằng phương pháp CẮT CHUỖI (không dùng RegExp).
 *
 * Lỗi thật đã gặp: mốc chứa `(` `)` `.` nên `new RegExp(mốc)` không khớp, khối "tự sinh" vì thế
 * KHÔNG BAO GIỜ được cập nhật — file cứ giữ nội dung cũ mà script vẫn báo "đã cập nhật".
 */
function replaceBlock(text, start, end, block) {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from < 0 || to < from) return null;
  return text.slice(0, from) + block + text.slice(to + end.length);
}

function refreshAskDoc() {
  if (!fs.existsSync(ASK_DOC)) return null;
  const rows = [];
  for (const id of localIds()) {
    const state = fold(eventsOf(id));
    const task = state.task ?? {};
    const who = String(task.to ?? "").toUpperCase();
    const hints = {
      sent: `AGENT_NAME=${who} node ops/task.mjs ack ${id} --push`,
      reopened: `AGENT_NAME=${who} node ops/task.mjs ack ${id} --push   # làm lại`,
      acked: `node ops/task.mjs progress ${id} --note "…" --push`,
      in_progress: `node ops/task.mjs done ${id} --evidence "commit=…, cmd=…, kết quả=…" --push`,
      blocked: "bên giao cần gỡ vướng",
      done: "chờ bên giao nghiệm thu",
      created: "chưa giao — chạy task.mjs send",
    };
    rows.push(`| \`${id}\` | ${state.status} | ${String(task.title ?? "").slice(0, 70)} | \`${hints[state.status] ?? "-"}\` |`);
  }
  const block = [
    ASK_START,
    "",
    "## Việc đang chờ (tự sinh từ sổ giao việc — ĐỪNG sửa tay)",
    "",
    "Nguồn xác thực là git: `ops/tasks/<id>/`. Giao thức: [`TASK-PROTOCOL.md`](TASK-PROTOCOL.md).",
    "",
    "| id | trạng thái | việc | lệnh tiếp theo |",
    "|---|---|---|---|",
    ...(rows.length ? rows : ["| — | — | không có việc nào đang mở | — |"]),
    "",
    ASK_END,
  ].join("\n");
  let text = fs.readFileSync(ASK_DOC, "utf8");
  const replaced = replaceBlock(text, ASK_START, ASK_END, block);
  if (replaced !== null) {
    text = replaced;
  } else {
    // Chèn ngay dưới tiêu đề H1 để nằm ở chỗ dễ thấy nhất khi người/agent đọc file.
    const lines = text.split("\n");
    const titleAt = lines.findIndex((line) => line.startsWith("# "));
    if (titleAt >= 0) {
      lines.splice(titleAt + 1, 0, "", block, "");
      text = lines.join("\n");
    } else {
      text = `${block}\n\n${text.trimEnd()}\n`;
    }
  }
  fs.writeFileSync(ASK_DOC, text.endsWith("\n") ? text : `${text}\n`);
  return ASK_DOC;
}


// ---------------------------------------------------------------- connector VPS + alert người
//
// Hai kênh tách bạch:
//   - CONNECTOR (agent bus trên VPS): máy ↔ máy, có trạng thái trong git làm nguồn xác thực.
//   - TELEGRAM: chỉ để ALERT cho người theo dõi, không phải kênh máy–máy.
const BUS_URL = String(process.env.AGENT_BUS_URL ?? "https://fbuddy.meetflowai.site/agent-bus").replace(/\/$/, "");
const BUS_TOKEN = String(process.env.AGENT_BUS_TOKEN ?? "").trim();

/** Đẩy một thông báo sang bus cho bên kia (best-effort: lỗi bus không được làm hỏng sổ). */
async function notifyPeer({ to, kind, title, body, ref }) {
  if (!BUS_TOKEN) return null;
  try {
    const response = await fetch(`${BUS_URL}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BUS_TOKEN}` },
      body: JSON.stringify({ to, from: ACTOR, kind, title, body, ref }),
      signal: AbortSignal.timeout(10000),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      console.log(`  ! bus từ chối (${response.status}): ${JSON.stringify(json).slice(0, 120)}`);
      return null;
    }
    return json?.message ?? null;
  } catch (error) {
    console.log(`  ! không đẩy được sang bus: ${String(error?.message ?? error).slice(0, 120)}`);
    return null;
  }
}

/** Alert cho NGƯỜI qua Telegram (không chặn luồng nếu lỗi). */
async function alertHuman(text) {
  try {
    const { sendPing } = await import("./lib/telegram.mjs");
    const result = await sendPing(text, { prefix: "[ALERT]" });
    return result?.ok ? result.messageId : null;
  } catch (error) {
    console.log(`  ! alert Telegram lỗi: ${String(error?.message ?? error).slice(0, 120)}`);
    return null;
  }
}

/** Sau mỗi sự kiện: đẩy cho bên kia + alert cho người. */
async function announce(state, kind, detail) {
  const task = state.task ?? {};
  const peer = String(task.to ?? "").toLowerCase() === ACTOR ? String(task.from ?? "").toLowerCase() : String(task.to ?? "").toLowerCase();
  const title = `${task.id ?? ""} · ${task.title ?? ""}`.trim();
  const message = await notifyPeer({ to: peer, kind, title, body: detail, ref: task.id ?? null });
  const sent = await alertHuman(
    `${kind.toUpperCase()} · ${task.id ?? ""} (${task.from ?? "?"}→${task.to ?? "?"})\n${task.title ?? ""}` +
      `${detail ? `\n${detail.slice(0, 400)}` : ""}${message ? `\nbus #${message.id}` : ""}`,
  );
  return { message, sent };
}

function pushLedger(id, message) {
  const subject = `${message} [task ${id}]`;
  const doc = refreshAskDoc();
  if (doc) console.log(`  cập nhật khối "việc đang chờ" trong ${doc}`);
  git("add", TASKS_DIR, ...(doc ? [doc] : []));
  git("commit", "-m", subject, "--", TASKS_DIR, ...(doc ? [doc] : []));
  const direct = git("push", "origin", "HEAD:flowgpt");
  if (!direct.startsWith("!git")) return { commit: "cây chính", pushed: direct };

  const worktree = path.join(os.tmpdir(), `dsh-task-${process.pid}`);
  git("fetch", "origin", "flowgpt");
  const added = git("worktree", "add", "-q", "--detach", worktree, "origin/flowgpt");
  if (added.startsWith("!git")) return { commit: "cây chính", pushed: direct };
  try {
    fs.cpSync(TASKS_DIR, path.join(worktree, TASKS_DIR), { recursive: true });
    execFileSync("git", ["add", TASKS_DIR], { cwd: worktree, ...NO_WINDOW });
    execFileSync("git", ["-c", "user.email=agent@flowtech", "-c", "user.name=FlowTech Agent", "commit", "-q", "-m", subject], { cwd: worktree, ...NO_WINDOW });
    const out = execFileSync("git", ["push", "origin", "HEAD:flowgpt"], { cwd: worktree, encoding: "utf8", ...NO_WINDOW });
    return { commit: `worktree (${git("rev-parse", "--short", "HEAD")})`, pushed: String(out).trim() || "pushed" };
  } catch (error) {
    return { commit: "cây chính", pushed: `!git: ${String(error.stderr || error.message).trim().split("\n")[0]}` };
  } finally {
    git("worktree", "remove", "--force", worktree);
    git("worktree", "prune");
  }
}

// ---------------------------------------------------------------- trạng thái

function requireTask(id) {
  syncLedger(); // sự kiện của bên kia nằm trên origin — không sync thì trạng thái đọc sai
  const events = eventsOf(id);
  if (!events.length) {
    console.error(`Không có task "${id}". Xem: node ops/task.mjs list --all`);
    process.exit(2);
  }
  return { events, state: fold(events) };
}

function assertActor(state, role) {
  const task = state.task ?? {};
  const expected = role === "assignee" ? String(task.to ?? "").toLowerCase() : String(task.from ?? "").toLowerCase();
  if (expected && expected !== ACTOR) {
    console.error(
      `Sai bên: task này giao cho "${expected}", người giao "${task.from}". ` +
        `Bạn đang là "${ACTOR}" — chỉ ${role === "assignee" ? "bên nhận" : "bên giao"} được làm thao tác này. ` +
        `(Đặt AGENT_NAME=WIN hoặc AGENT_NAME=MAC cho đúng.)`,
    );
    process.exit(3);
  }
}

// ---------------------------------------------------------------- lệnh

if (command === "new") {
  const title = String(opt("title", "")).trim();
  if (!title) {
    console.error('Thiếu --title. Ví dụ: node ops/task.mjs new --title "Viết lại 22 mục" --to win');
    process.exit(2);
  }
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const used = localIds().filter((id) => id.startsWith(`T-${today}-`)).length;
  const id = opt("id") || `T-${today}-${String(used + 1).padStart(2, "0")}`;
  if (fs.existsSync(taskDir(id))) {
    console.error(`Task ${id} đã tồn tại.`);
    process.exit(2);
  }
  const task = {
    id,
    title,
    from: ACTOR,
    to: String(opt("to", ACTOR === "mac" ? "win" : "mac")).toLowerCase(),
    detail: opt("detail"),
    verify: opt("verify"),
    due: opt("due"),
    createdAt: new Date().toISOString(),
  };
  writeEvent(id, { type: "created", task });
  console.log(`Đã tạo ${id}: ${title}  (${task.from} → ${task.to})`);
  console.log(`Giao việc:  node ops/task.mjs send ${id} --push --ping`);
} else if (command === "send") {
  const { state } = requireTask(idArg);
  assertActor(state, "assigner");
  writeEvent(idArg, { type: "sent", ref: state.task?.detail ?? null });
  console.log(`Đã ghi "sent" cho ${idArg}.`);
  if (flags.has("push")) {
    const { commit, pushed } = pushLedger(idArg, "task: giao việc");
    console.log(`  git: ${commit.split("\n")[0]}\n  push: ${pushed.split("\n").slice(-1)[0]}`);
  }
  // Đánh thức TRỰC TIẾP đối tác nếu có đường (ví dụ ssh sang máy kia). Watcher bên kia là
  // đường chính; đây là đường phụ cho trường hợp watcher của họ chưa chạy.
  const peerWake = opt("peer-wake", process.env.PEER_WAKE_CMD);
  if (peerWake) {
    try {
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync(peerWake, { shell: true, encoding: "utf8", timeout: 60000, ...NO_WINDOW });
      const out = String(result.stdout ?? "").trim().split("\n").slice(-2).join(" | ");
      console.log(`  đánh thức trực tiếp (${peerWake.slice(0, 60)}): ${result.status === 0 ? `ok ${out}` : `lỗi ${result.status}`}`);
    } catch (error) {
      console.log(`  đánh thức trực tiếp lỗi: ${String(error.message).slice(0, 120)}`);
    }
  }

  await announce(state, "sent", `Nhận việc: node ops/task.mjs ack ${idArg} --push`);

  if (flags.has("ping")) {
    const { sendPing } = await import("./lib/telegram.mjs");
    const task = state.task ?? {};
    const text =
      `[TASK ${idArg}] ORDER ${task.title}\n` +
      `chi tiết: ${task.detail ?? "(xem repo)"}\n` +
      `nhận việc: node ops/task.mjs ack ${idArg} --push\n` +
      `(Telegram chỉ để hú; kênh xác thực là git — docs/TASK-PROTOCOL.md)`;
    const result = await sendPing(text);
    console.log(result.ok ? `  đã hú Telegram (message_id ${result.messageId})` : "  hú Telegram lỗi (không ảnh hưởng sổ giao việc)");
  }
} else if (command === "ack") {
  const { state } = requireTask(idArg);
  assertActor(state, "assignee");
  if (state.status === "created") console.warn("! Task chưa được đánh dấu `sent` — vẫn ghi nhận ack.");
  writeEvent(idArg, { type: "acked", note: opt("note", "") });
  console.log(`✓ ${idArg}: đã xác nhận NHẬN việc${opt("note") ? ` — ${opt("note")}` : ""}`);
  await announce(state, "ack", opt("note", ""));
  if (flags.has("push")) console.log(`  push: ${pushLedger(idArg, "task: xác nhận đã nhận").pushed.split("\n").slice(-1)[0]}`);
} else if (command === "progress" || command === "blocked") {
  const { state } = requireTask(idArg);
  assertActor(state, "assignee");
  const note = opt("note") ?? opt("reason") ?? "";
  if (!note) {
    console.error(`Thiếu ${command === "blocked" ? "--reason" : "--note"}.`);
    process.exit(2);
  }
  writeEvent(idArg, { type: command === "blocked" ? "blocked" : "progress", note });
  console.log(`${command === "blocked" ? "⛔" : "…"} ${idArg}: ${note}`);
  await announce(state, command, note);
  if (flags.has("push")) console.log(`  push: ${pushLedger(idArg, `task: ${command}`).pushed.split("\n").slice(-1)[0]}`);
} else if (command === "done") {
  const { state } = requireTask(idArg);
  assertActor(state, "assignee");
  const evidence = String(opt("evidence", "")).trim();
  if (evidence.length < 8) {
    console.error('Từ chối: `done` phải kèm --evidence có thật (commit sha / câu lệnh đã chạy / file kết quả).');
    process.exit(2);
  }
  writeEvent(idArg, { type: "done", evidence });
  console.log(`✓ ${idArg}: báo XONG — ${evidence}`);
  await announce(state, "done", evidence);
  console.log(`  Chờ bên giao nghiệm thu: node ops/task.mjs verify ${idArg} --result pass`);
  if (flags.has("push")) console.log(`  push: ${pushLedger(idArg, "task: báo xong").pushed.split("\n").slice(-1)[0]}`);
} else if (command === "verify") {
  const { state } = requireTask(idArg);
  assertActor(state, "assigner");
  const result = String(opt("result", "")).toLowerCase();
  if (!["pass", "fail"].includes(result)) {
    console.error("Thiếu --result pass|fail");
    process.exit(2);
  }
  if (result === "pass" && state.status !== "done") {
    console.error(`Từ chối: trạng thái hiện tại là "${state.status}" — chỉ nghiệm thu PASS sau khi bên nhận báo \`done\`.`);
    process.exit(4);
  }
  writeEvent(idArg, { type: "verified", result, note: opt("note", "") });
  console.log(`${result === "pass" ? "✅ NGHIỆM THU PASS" : "❌ NGHIỆM THU FAIL"} ${idArg}${opt("note") ? ` — ${opt("note")}` : ""}`);
  await announce(state, result === "pass" ? "verified" : "reopened", opt("note", ""));
  if (result === "fail") console.log(`  Đã mở lại việc: bên nhận phải ack + done lại.`);
  if (flags.has("push")) console.log(`  push: ${pushLedger(idArg, `task: nghiệm thu ${result}`).pushed.split("\n").slice(-1)[0]}`);
} else if (command === "show") {
  const { state } = requireTask(idArg);
  const task = state.task ?? {};
  console.log(`\n${task.id}  [${state.status}]  ${task.title}`);
  console.log(`  ${task.from} → ${task.to}${task.due ? `  hạn ${task.due}` : ""}`);
  if (task.detail) console.log(`  chi tiết: ${task.detail}`);
  if (task.verify) console.log(`  nghiệm thu bằng: ${task.verify}`);
  console.log(`  sự kiện:`);
  for (const event of state.events) {
    const extra = event.note ?? event.evidence ?? event.reason ?? "";
    console.log(`    ${prettyTime(event.at)}  ${event.actor.padEnd(4)} ${event.type.padEnd(9)} ${String(extra).slice(0, 120)}`);
  }
} else if (command === "list") {
  const synced = syncLedger();
  if (!synced.ok) console.error(`! không sync được sổ từ git: ${synced.reason}`);
  const ids = localIds();
  const rows = [];
  for (const id of ids) {
    const events = eventsOf(id);
    const state = fold(events);
    // Thư mục không có sự kiện `created` là rác (ví dụ đánh thức cho tin bus không gắn task).
    if (!events.some((event) => event.type === "created")) {
      rows.push({ id, state: { ...state, status: "rác (không có created)" }, source: "local" });
      continue;
    }
    const remote = flags.has("remote") ? eventsOf(id, true) : [];
    if (remote.length > events.length) rows.push({ id, state: fold(remote), source: "remote" });
    else rows.push({ id, state, source: "local" });
  }
  const open = rows.filter((row) => !["verified"].includes(row.state.status));
  const show = flags.has("all") ? rows : open;
  if (!show.length) {
    console.log("Không có việc nào đang mở. (--all để xem cả việc đã nghiệm thu)");
  }
  for (const row of show) {
    const task = row.state.task ?? {};
    const mark = { verified: "✅", done: "🟡", acked: "🟢", in_progress: "…", sent: "📤", created: "📝", blocked: "⛔", reopened: "🔁" }[row.state.status] ?? "?";
    const overdue = task.due && new Date(task.due) < new Date() && row.state.status !== "verified" ? "  ⏰ QUÁ HẠN" : "";
    // Cảnh báo kênh đánh thức: đã giao mà chưa thấy `woken`/`acked` ⇒ máy kia có thể chưa chạy watcher.
    const sentEvent = row.state.events.find((event) => event.type === "sent");
    const woke = row.state.events.some((event) => event.type === "woken" || event.type === "acked");
    let silentHint = "";
    if (sentEvent && !woke) {
      const minutes = Math.round((Date.now() - new Date(sentEvent.at).getTime()) / 60000);
      if (minutes >= 5) silentHint = `  ⚠ giao ${minutes} phút, CHƯA thấy đánh thức/ack (máy ${task.to} chưa chạy watcher?)`;
    }
    console.log(`${mark} ${row.id}  [${row.state.status}]  ${task.from}→${task.to}  ${String(task.title).slice(0, 60)}${overdue}${silentHint}`);
  }
} else if (command === "refresh") {
  const doc = refreshAskDoc();
  console.log(doc ? `đã cập nhật ${doc}` : "không thấy docs/ASK-WINDOWS.md");
} else if (command === "push") {
  const { commit, pushed } = pushLedger(idArg ?? "ledger", opt("message", "task: cập nhật sổ giao việc"));
  console.log(`git: ${commit}\npush: ${pushed}`);
} else if (command === "sync") {
  const fetched = git("fetch", "origin", "flowgpt");
  console.log(fetched.startsWith("!git") ? `fetch lỗi: ${fetched}` : "đã fetch origin/flowgpt");
  const remoteIds = (() => {
    const listing = git("ls-tree", "-r", "--name-only", "origin/flowgpt", `${TASKS_DIR}/`);
    return listing.startsWith("!git")
      ? []
      : [...new Set(listing.split("\n").map((line) => line.split("/")[2]).filter(Boolean))].sort();
  })();
  const local = new Set(localIds());
  const rows = [];
  for (const id of remoteIds) rows.push({ id, state: fold(eventsOf(id, true)), where: local.has(id) ? "local+remote" : "remote-only" });
  for (const id of local) if (!remoteIds.includes(id)) rows.push({ id, state: fold(eventsOf(id)), where: "local-only (chưa push)" });
  console.log(`\nTrạng thái theo git (nguồn xác thực):`);
  for (const row of rows) {
    const task = row.state.task ?? {};
    const events = row.state.events;
    const last = events[events.length - 1];
    const who = last ? `${last.actor}@${prettyTime(last.at)}` : "?";
    console.log(`  ${row.id}  [${row.state.status}]  ${task.from ?? "?"}→${task.to ?? "?"}  cuối: ${who} ${last?.type ?? ""}  (${row.where})`);
  }
  if (!rows.length) console.log("  (chưa có task nào trên git)");
} else {
  console.log(
    [
      "Sổ giao việc Mac ↔ Windows. Xem docs/TASK-PROTOCOL.md.",
      "",
      "  new --title … --to win        tạo việc",
      "  send <id> [--push] [--ping]   giao việc",
      "  ack <id> [--push]             bên nhận xác nhận đã nhận",
      "  progress|blocked <id> --note  báo tiến độ / vướng",
      "  done <id> --evidence …        báo xong (BẮT BUỘC có bằng chứng)",
      "  verify <id> --result pass|fail  bên giao nghiệm thu",
      "  show <id> | list [--all] | sync",
      "  refresh                       cập nhật khối việc đang chờ trong docs/ASK-WINDOWS.md",
    ].join("\n"),
  );
}

// Sau mọi lệnh có ghi sự kiện: cập nhật bảng trạng thái (AGENTS.local.md) để phiên sau tự biết.
// Best-effort, chạy nền, không chặn và không làm hỏng kết quả lệnh.
if (["send", "ack", "progress", "blocked", "done", "verify"].includes(command)) {
  try {
    const { spawn } = await import("node:child_process");
    spawn(process.execPath, ["ops/status-board.mjs"], { cwd: process.cwd(), detached: true, stdio: "ignore", ...NO_WINDOW }).unref();
  } catch {
    /* không cập nhật được bảng cũng không sao */
  }
}
