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
import { execFileSync, spawn as childProcessSpawn } from "node:child_process";
// Luật đánh thức nằm ở module thuần để test được: `ops/wake-policy.test.mjs`. Xem chú thích trong
// đó về lỗi "tự đánh thức vì chính mình vừa báo blocked".
import { wakeReason as decideWakeReason } from "./lib/wake-policy.mjs";

// .trim() là bắt buộc: trên Windows, `set AGENT_NAME=WIN && node …` biến giá trị thành "WIN "
// (dấu cách trước &&), làm hỏng tên agent trong presence và tên file sự kiện (đã gặp thật).
const SELF = (process.env.AGENT_NAME || "MAC").trim().toUpperCase();
const PEER = SELF === "MAC" ? "WIN" : "MAC";
const TASKS_DIR = path.join("ops", "tasks");
const STATE_FILE = path.join(TASKS_DIR, `.watch-${SELF.toLowerCase()}.json`);
const STATE_OVERRIDE_FLAG = (() => {
  const index = process.argv.indexOf("--state");
  return index >= 0 ? process.argv[index + 1] : null;
})();
const statePath = () => STATE_OVERRIDE_FLAG || STATE_FILE;

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
// Watcher bên kia chết bao lâu thì báo NGƯỜI (Telegram) một lần — con người mới bật lại được.
const PEER_STALE_MS = Number(process.env.PEER_STALE_MS || 20 * 60 * 1000);
const PEER_ALERT_COOLDOWN_MS = Number(process.env.PEER_ALERT_COOLDOWN_MS || 30 * 60 * 1000);
const WAKE_CMD = flagValue("wake-cmd", process.env.DSH_WAKE_CMD ?? 'dsh --profile headless "{prompt}"');
// Connector trên VPS (máy ↔ máy). Telegram chỉ để alert cho người, không dùng làm kênh máy–máy.
const BUS_URL = String(flagValue("bus-url", process.env.AGENT_BUS_URL ?? "") ?? "").replace(/\/$/, "");
const BUS_TOKEN = String(process.env.AGENT_BUS_TOKEN ?? "").trim();
const NO_BUS = args.includes("--no-bus");

/** Nếu env chưa có cấu hình bus thì đọc `.env.bus` trong repo (file này bị gitignore). */
function loadBusEnv() {
  if (BUS_URL && BUS_TOKEN) return { url: BUS_URL, token: BUS_TOKEN };
  const file = path.join(process.cwd(), ".env.bus");
  const values = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) values[match[1]] = match[2].trim();
    }
  } catch {
    /* không có file */
  }
  return {
    url: String(BUS_URL || values.AGENT_BUS_URL || "").replace(/\/$/, ""),
    token: String(BUS_TOKEN || values.AGENT_BUS_TOKEN || ""),
  };
}

/**
 * Trên Windows, mỗi tiến trình con là MỘT cửa sổ console đen nháy lên rồi tắt: `windowsHide` mặc
 * định là `false`, nên Node không truyền cờ CREATE_NO_WINDOW. Watcher gọi git hàng chục lần mỗi
 * vòng poll ⇒ màn hình nháy không ngớt (đã gặp thật: "cả đống windows command chạy rồi tắt loạn
 * cả mắt"). Đặt cờ này cho MỌI lần spawn/exec. Trên macOS/Linux nó vô hại.
 */
const NO_WINDOW = { windowsHide: true };

/** JSON.parse chịu được BOM — file sự kiện do PowerShell 5.1 ghi có thể mở đầu bằng \uFEFF. */
const parseJson = (text) => JSON.parse(String(text ?? "").replace(/^\uFEFF/, ""));

const git = (...argv) => {
  try {
    return execFileSync("git", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...NO_WINDOW }).trim();
  } catch (error) {
    return `!git: ${String(error.stderr || error.message).trim().split("\n")[0]}`;
  }
};
const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)} ${SELF}] ${message}`);

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return { seen: [], lastWake: {}, initialized: false };
  }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  const text = `${JSON.stringify(state, null, 1)}\n`;
  // Ghi qua file tạm rồi đổi tên: hai tiến trình cùng ghi (đã gặp thật khi chạy chồng watcher)
  // không thể để lại file cụt, và lần ghi sau luôn thấy bản hoàn chỉnh của lần trước.
  const tmp = `${statePath()}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, statePath());
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch { /* thôi */ }
    fs.writeFileSync(statePath(), text);
  }
}

/**
 * Chốt COOLDOWN dùng chung cho cả hai đường đánh thức (sổ git và connector).
 *
 * Vì sao cần: một việc có thể sinh nhiều tin trên connector (sent → progress → done), nếu mỗi tin
 * đều boot một phiên thì chỉ một việc cũng đủ mở 3–4 session. Đã gặp thật: 4 session DSH trong 6 phút.
 */
function cooldownBlocked(state, id) {
  const last = state.lastWake?.[id] ? new Date(state.lastWake[id]).getTime() : 0;
  return Boolean(last) && Date.now() - last < COOLDOWN * 1000;
}

function markWake(state, id) {
  if (!state.lastWake) state.lastWake = {};
  state.lastWake[id] = new Date().toISOString();
  saveState(state);
}

/**
 * Đọc nhiều blob trong MỘT tiến trình git (`cat-file --batch`).
 *
 * Vì sao: bản cũ gọi `git show` cho TỪNG file sự kiện — mỗi file là một tiến trình ⇒ mỗi file là
 * một cửa sổ console nháy trên Windows. Sổ càng dài thì bão càng dày. Một tiến trình cho tất cả.
 */
function gitCatFile(shas) {
  if (!shas.length) return new Map();
  let out;
  try {
    out = execFileSync("git", ["cat-file", "--batch"], {
      input: `${shas.join("\n")}\n`,
      // KHÔNG truyền encoding: mặc định 'buffer' mới cắt đúng theo BYTE (JSON tiếng Việt là
      // UTF-8 nhiều byte, cắt theo ký tự sẽ lệch). Truyền encoding:"buffer" là lỗi — Node chê
      // "Unknown encoding: buffer".
      maxBuffer: 64 * 1024 * 1024,
      ...NO_WINDOW,
    });
  } catch {
    return null;
  }
  const blobs = new Map();
  let offset = 0;
  while (offset < out.length) {
    const headerEnd = out.indexOf(10, offset);
    if (headerEnd < 0) break;
    // dạng: "<sha> <type> <size>" hoặc "<sha> missing"
    const parts = out.toString("utf8", offset, headerEnd).trim().split(" ");
    offset = headerEnd + 1;
    if (parts.length < 3) continue;
    const size = Number(parts[2]);
    if (!Number.isFinite(size)) continue;
    blobs.set(parts[0], out.toString("utf8", offset, offset + size));
    offset += size + 1;
  }
  return blobs;
}

/** Đọc sổ từ origin/flowgpt (không cần merge vào cây đang làm việc). */
function readLedger() {
  const listing = git("ls-tree", "-r", "origin/flowgpt", `${TASKS_DIR}/`);
  if (listing.startsWith("!git")) return { error: listing, tasks: [] };
  const files = [];
  for (const line of listing.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const path = line.slice(tab + 1);
    if (!path.endsWith(".json") || path.includes("/.")) continue;
    const sha = line.slice(0, tab).trim().split(/\s+/)[2];
    if (sha) files.push({ path, sha });
  }
  const blobs = gitCatFile([...new Set(files.map((entry) => entry.sha))]);
  if (!blobs) return { error: "!git: cat-file --batch thất bại", tasks: [] };
  const byTask = new Map();
  for (const entry of files) {
    const id = entry.path.split("/")[2];
    if (!id) continue;
    let event;
    try {
      // BOM: PowerShell 5.1 (`Set-Content -Encoding UTF8`, `echo >`) ghi kèm BOM \uFEFF, JSON.parse
      // sẽ chết và sự kiện bị BỎ IM LẶNG. Đã gặp thật với 1 file win-progress. Phải cắt BOM.
      event = parseJson(blobs.get(entry.sha));
    } catch {
      continue;
    }
    if (!byTask.has(id)) byTask.set(id, []);
    byTask.get(id).push({ ...event, file: entry.path });
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

/**
 * Thời điểm sự kiện MỚI NHẤT trong sổ (đọc file cục bộ — nhanh, không cần git).
 * Dùng làm mốc phân biệt tin bus CŨ (rác lịch sử) với tin bus MỚI (gửi trong lúc máy tắt).
 */
function ledgerNewestAt() {
  let newest = 0;
  if (!fs.existsSync(TASKS_DIR)) return newest;
  for (const id of fs.readdirSync(TASKS_DIR)) {
    if (id.startsWith(".")) continue;
    const dir = path.join(TASKS_DIR, id);
    let stat;
    try { stat = fs.statSync(dir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const event = parseJson(fs.readFileSync(path.join(dir, file), "utf8"));
        const at = new Date(event.at ?? 0).getTime();
        if (at > newest) newest = at;
      } catch { /* bỏ file hỏng */ }
    }
  }
  return newest;
}

/**
 * Tin bus này có nói về ĐÚNG việc trong sổ không? (không chỉ trùng mã)
 *
 * Vì sao cần: mã việc TRÙNG giữa hai sổ — `T-20260919-01` ở sổ fbuddy là "UI/UX: bộ token theme
 * mobile", ở sổ FPTVPN là "Chuyển watcher Windows sang BỘ NGHE ĐẨY (SSE)". Nếu chỉ so mã thì một
 * tin `done` của việc BÊN KIA sẽ bị coi là bản phát lại của việc bên này và bị bỏ qua im lặng.
 * (Đã ghi trong docs/ASK-WINDOWS.md: "task ID trùng giữa hai sổ ⇒ đọc `detail` trước khi ack/done".)
 */
function sameSubject(busTitle, task) {
  if (!busTitle || !task?.title) return false;
  const strip = (text) => String(text).toLowerCase().replace(/\s+/g, " ").trim();
  const prefix = new RegExp(`^${String(task.id ?? "").toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[·:—-]\\s*`);
  const bus = strip(busTitle).replace(prefix, "");
  const local = strip(task.title);
  if (!bus || !local) return false;
  // Tiêu đề trên bus có thể bị cắt ngắn — chỉ cần khớp phần đầu.
  const length = Math.min(40, bus.length, local.length);
  return bus.slice(0, length) === local.slice(0, length);
}

/** Việc này có cần ĐÁNH THỨC tôi không? Trả về lý do hoặc null. Luật nằm ở `ops/lib/wake-policy.mjs`. */
function wakeReason(entry) {
  return decideWakeReason(entry, SELF);
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
    // Máy Windows không có cú pháp `AGENT_NAME=WIN node …` của bash — nhắc luôn để phiên được
    // đánh thức không mất một lượt thử-sai cho việc đặt biến môi trường.
    process.platform === "win32" ? `   (Windows/PowerShell: $env:AGENT_NAME="${SELF}"; node ops/task.mjs ack ${entry.id} --push)` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Ghi prompt ra tệp rồi gọi `ops/wake-launch.mjs` — KHÔNG để shell cắt prompt.
 *
 * LỖI THẬT (19/09/2026, đo được ngay trên phiên bị đánh thức): `WAKE_CMD` mặc định là
 * `dsh --profile headless "{prompt}"`, prompt có 7 dòng, mà `spawn(chuỗi, { shell: true })` trên
 * Windows chạy qua cmd.exe — cmd cắt lệnh ở dòng đầu. Hậu quả: harness được đánh thức CHỈ nhận
 * đúng dòng `ĐÁNH THỨC TỰ ĐỘNG (WIN ← watcher MAC).`, mất sạch "Lý do / Task / việc phải làm"
 * (đúng cảnh đã ghi trong ops/wake-launch.mjs — và nó vẫn tái diễn vì watcher chưa dùng launcher).
 * Cách chữa: prompt đi qua TỆP, launcher truyền nó thành MỘT đối số argv, không shell nào diễn giải.
 */
const WAKE_LAUNCH = path.join("ops", "wake-launch.mjs");
const PROMPT_DIR = path.join(os.tmpdir(), "dsh-wake-prompts");

/** Lệnh đích = WAKE_CMD bỏ chỗ giữ chỗ `{prompt}` (kèm ngoặc kép quanh nó) để launcher tự nối. */
function wakeTarget() {
  return WAKE_CMD.replace(/["']?\{prompt\}["']?/g, "").trim();
}

function runWake(prompt) {
  const inline = WAKE_CMD.includes("{prompt}");
  const command = inline ? WAKE_CMD.replace("{prompt}", prompt) : `${WAKE_CMD} ${prompt}`;
  const target = wakeTarget();
  const viaLauncher = inline && Boolean(target) && fs.existsSync(WAKE_LAUNCH);
  if (DRY) {
    log(`(--dry-run) sẽ chạy${viaLauncher ? " qua wake-launch" : ""}: ${command.slice(0, 160)}…`);
    return;
  }
  if (viaLauncher) {
    let promptFile = null;
    try {
      fs.mkdirSync(PROMPT_DIR, { recursive: true });
      promptFile = path.join(PROMPT_DIR, `wake-${process.pid}-${Date.now()}.txt`);
      fs.writeFileSync(promptFile, prompt, "utf8");
      const child = childProcessSpawn(process.execPath, [WAKE_LAUNCH, "--prompt-file", promptFile, "--cmd", target], {
        detached: true,
        stdio: "ignore",
        ...NO_WINDOW,
      });
      child.unref();
      log(`đã đánh thức (wake-launch, không qua shell · prompt ${prompt.length} ký tự): ${target.slice(0, 60)}… (pid ${child.pid})`);
      return;
    } catch (error) {
      if (promptFile) { try { fs.rmSync(promptFile, { force: true }); } catch { /* tệp tạm */ } }
      log(`wake-launch lỗi (${String(error?.message ?? error).slice(0, 120)}) — quay về cách cũ (prompt có thể bị cắt)`);
    }
  }
  // `spawn` KHÔNG có trong phạm vi file này (chỉ có `childProcessSpawn`) — gọi tên trần là
  // ReferenceError, và vì nó nằm trong runWake nên MỌI lần đánh thức đều chết ngay tại đây:
  // không boot harness, cũng không ghi được bằng chứng `woken`. Đã gặp thật.
  const child = childProcessSpawn(command, { shell: true, detached: true, stdio: "ignore", ...NO_WINDOW });
  child.unref();
  log(`đã đánh thức: ${command.split(" ").slice(0, 4).join(" ")}… (pid ${child.pid})`);
}

/** Ghi sự kiện `woken` rồi push — bằng chứng kênh đánh thức đã thông. */
function recordWake(entry, reason) {
  if (DRY || NO_RECORD) return;
  // Đánh thức vì một tin bus không gắn với task nào trong sổ thì KHÔNG ghi sự kiện — nếu ghi sẽ
  // sinh thư mục task rác (đã gặp: `bus-6` không có `created`, hiện ra `[unknown]` trong `list`).
  if (!fs.existsSync(path.join(TASKS_DIR, entry.id))) {
    log(`không ghi sự kiện woken cho "${entry.id}" (không phải task trong sổ)`);
    return;
  }
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

/** Alert cho NGƯỜI (Telegram) — mọi trao đổi đều phải thấy được. */
async function alertHuman(text) {
  if (DRY) return null; // chạy khô không gửi thật
  try {
    const { sendPing } = await import("./lib/telegram.mjs");
    const result = await sendPing(text, { prefix: "[ALERT]" });
    return result?.ok ? result.messageId : null;
  } catch {
    return null;
  }
}

/**
 * Những loại thông báo cần ĐÁNH THỨC (còn lại chỉ ghi log + alert).
 *
 * Cố ý KHÔNG có `ack` / `progress` / `verified` / `status` / `notify`: bên giao không cần mở một
 * phiên chỉ vì đối tác đã nhận việc hay đang làm — giống hệt luật ở nhánh đọc sổ git
 * (`wakeReason`). Trước 21/09/2026 đường bus còn có luật "hễ có `ref` là đánh thức", nên 4 tin
 * `ack` cho T-20260919-04..07 đã boot 4 phiên không có gì làm.
 */
const WAKE_KINDS = new Set(["task", "sent", "done", "reopened", "blocked", "verify-fail", "alert-test", "wake"]);

/** Kéo thông báo mới từ connector VPS; trả về số lần đánh thức. */
/** Cập nhật bảng trạng thái (chạy nền, best-effort). */
function refreshBoard() {
  if (DRY) return;
  try {
    const { spawn } = require_childProcess();
    spawn(process.execPath, ["ops/status-board.mjs"], { cwd: process.cwd(), detached: true, stdio: "ignore", ...NO_WINDOW }).unref();
  } catch {
    /* thôi */
  }
}

function require_childProcess() {
  return { spawn: spawnBoardProcess };
}

/** Tách riêng để tránh import động trong vòng lặp nóng. */
function spawnBoardProcess(...args) {
  return childProcessSpawn(...args);
}

async function tickBus(state) {
  if (NO_BUS) return 0;
  const bus = loadBusEnv();
  if (!bus.url || !bus.token) return 0;
  const since = Number(state.busSince ?? 0) || 0;
  let payload;
  try {
    const response = await fetch(`${bus.url}/pull?agent=${SELF.toLowerCase()}&since=${since}&host=${encodeURIComponent(os.hostname())}`, {
      headers: { Authorization: `Bearer ${bus.token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      log(`bus trả ${response.status}`);
      return 0;
    }
    payload = await response.json();
  } catch (error) {
    log(`bus không gọi được: ${String(error?.message ?? error).slice(0, 120)}`);
    return 0;
  }
  // Lần chạy đầu: bỏ qua lịch sử bus (giống cách bỏ qua sự kiện git cũ) để không đánh thức
  // hàng loạt vì tin cũ. Muốn xử lý lại từ đầu thì chạy `--replay-bus`.
  if (state.busSince === undefined && !args.includes("--replay-bus")) {
    // KHÔNG bỏ qua tất cả: máy vừa bật lại sau khi tắt vẫn phải xử lý tin gửi trong lúc tắt.
    // Chỉ bỏ qua tin CŨ HƠN sự kiện mới nhất trong sổ.
    const newest = ledgerNewestAt();
    const all = payload?.messages ?? [];
    const stale = all.filter((message) => new Date(message.at ?? 0).getTime() <= newest);
    const fresh = all.filter((message) => new Date(message.at ?? 0).getTime() > newest);
    state.busSince = stale.length ? Math.max(...stale.map((message) => message.id)) : 0;
    log(`lần chạy đầu với connector: bỏ qua ${stale.length} tin cũ, xử lý ${fresh.length} tin mới hơn sổ`);
    saveState(state);
  }
  let woke = 0;
  const queue = payload?.messages ?? [];

  // Tin bus có thể chỉ là BẢN PHÁT LẠI của một sự kiện đã nằm trong sổ (con trỏ bus lùi, máy tắt
  // lâu rồi bật lại, tin cũ chưa từng thấy qua đường bus). Đã gặp thật 21/09/2026: MAC bị đánh
  // thức cho `T-20260918-01` và `T-20260919-01` — cả hai sổ đã `verified` từ 19/09 — nên phiên mở
  // ra không có gì để làm. Với tin bus trỏ tới một việc CÓ trong sổ, TRẠNG THÁI ĐÃ GỘP của sổ
  // (nguồn xác thực) phải quyết định, không phải `kind` của tin bus.
  // Chỉ tin sổ khi sổ đã BẮT KỊP tin nhắn (sự kiện mới nhất >= thời điểm tin bus); nếu sổ còn cũ
  // hơn thì giữ nguyên cách cũ để không bỏ sót một `done` mà bên kia chưa push kịp lên git.
  let ledgerById = null;
  if (queue.some((message) => message.ref && fs.existsSync(path.join(TASKS_DIR, String(message.ref))))) {
    const { tasks } = readLedger();
    ledgerById = new Map(tasks.map((task) => [task.id, task]));
  }

  // NHÍCH CON TRỎ NGAY và ghi xuống đĩa TRƯỚC khi đánh thức.
  //
  // Đây là gốc lỗi thật phía Windows: con trỏ kẹt ở 11 nên mỗi vòng poll lại thấy 6 tin cũ
  // (13,18,23,24,25,26) và boot lại chúng ⇒ 4 session DSH trong 6 phút. Ghi con trỏ trước khi
  // làm việc nặng thì dù tiến trình chết giữa chừng, tin đã xử lý cũng không thể phát lại.
  const highest = queue.reduce((max, message) => Math.max(max, Number(message.id) || 0), Number(state.busSince ?? 0) || 0);
  if (highest > (Number(state.busSince ?? 0) || 0)) {
    state.busSince = highest;
    saveState(state);
  }

  // Nhớ riêng từng id đã xử lý: kể cả con trỏ có bị lùi (chạy chồng, file trạng thái cũ) thì
  // một tin cũng không bao giờ đánh thức hai lần.
  const handled = new Set(state.seenBus ?? []);
  for (const message of queue) {
    if (handled.has(message.id)) {
      log(`BUS #${message.id} đã xử lý trước đó — bỏ qua`);
      continue;
    }
    handled.add(message.id);
    state.seenBus = [...handled].slice(-500);
    saveState(state);

    log(`BUS #${message.id} ${message.from}→${message.to} [${message.kind}] ${message.title}`);
    if (!DRY) void alertHuman(`BUS #${message.id} · ${message.from}→${message.to} · ${message.kind}\n${message.title}${message.body ? `\n${message.body.slice(0, 300)}` : ""}`);
    if (!WAKE_KINDS.has(String(message.kind))) continue;
    const entry = {
      id: message.ref ?? `bus-${message.id}`,
      task: { id: message.ref ?? `bus-${message.id}`, title: message.title, to: message.to, from: message.from, detail: "docs/TASK-PROTOCOL.md" },
    };
    // Sổ đã bắt kịp tin này (và nói về đúng việc đó) mà bảo "không cần tôi hành động" ⇒ không đánh thức.
    const ledgerEntry = message.ref ? ledgerById?.get(String(message.ref)) : null;
    const ledgerCaughtUp = Boolean(ledgerEntry)
      && sameSubject(message.title, ledgerEntry.task)
      && new Date(ledgerEntry.last?.at ?? 0).getTime() >= new Date(message.at ?? 0).getTime();
    if (ledgerCaughtUp) {
      if (!wakeReason(ledgerEntry)) {
        log(`  #${message.id} trỏ ${message.ref} — sổ đã ở "${ledgerEntry.last?.type}" (không cần tôi hành động), KHÔNG đánh thức (bản phát lại)`);
        continue;
      }
      // Sổ là nguồn xác thực: dùng cả tiêu đề/chi tiết thật của việc trong sổ cho prompt.
      entry.task = ledgerEntry.task;
    }
    // Nhiều tin cho CÙNG một việc (sent → progress → done) chỉ được boot MỘT phiên.
    if (cooldownBlocked(state, entry.id)) {
      log(`  #${message.id} thuộc ${entry.id} vừa đánh thức trong ${COOLDOWN}s — chỉ ghi nhận, không boot thêm`);
      continue;
    }
    const reason = `connector VPS: ${message.kind} từ ${message.from} — ${message.title}`;
    if (AUTO) {
      markWake(state, entry.id);
      runWake(buildPrompt(entry, reason));
      recordWake(entry, reason);
    } else {
      log(`  (chỉ báo) sẽ đánh thức vì ${reason}`);
    }
    woke += 1;
  }
  return woke;
}

/**
 * Theo dõi SỨC KHOẺ watcher bên kia: nếu bên kia có việc đang chờ mà không poll connector quá
 * ngưỡng, báo cho NGƯỜI một lần qua Telegram (có cooldown, không spam) — vì chỉ con người
 * mới bật lại được watcher ở máy bên kia (VPN một chiều, không gọi vào được).
 */
async function tickHealth(state) {
  if (NO_BUS) return 0;
  const bus = loadBusEnv();
  if (!bus.url || !bus.token) return 0;
  try {
    const response = await fetch(`${bus.url}/presence`, { headers: { Authorization: `Bearer ${bus.token}` }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return 0;
    const { agents = [] } = await response.json();
    const peer = agents.find((agent) => String(agent.agent).toLowerCase() === PEER.toLowerCase());
    if (!peer || peer.secondsAgo < PEER_STALE_MS / 1000) return 0;
    const { tasks } = readLedger();
    const waiting = tasks.some((entry) => {
      const to = String(entry.task?.to ?? "").toLowerCase();
      return to === PEER.toLowerCase() && !["done", "verified"].includes(entry.last?.type ?? "");
    });
    if (!waiting) return 0;
    const lastAlert = state.lastPeerAlert ? new Date(state.lastPeerAlert).getTime() : 0;
    if (Date.now() - lastAlert < PEER_ALERT_COOLDOWN_MS) return 0;
    state.lastPeerAlert = new Date().toISOString();
    saveState(state);
    log(`watcher ${PEER} chết ${Math.round(peer.secondsAgo / 60)} phút mà còn việc đang chờ — báo người`);
    await alertHuman(
      `⚠ watcher ${PEER} đã ngừng poll ${Math.round(peer.secondsAgo / 60)} phút, đang có việc chờ nó.\n` +
        `Chỉ NGƯỜI bật lại được: trên máy ${PEER} chạy \`ops\\agent-watch.cmd\` (Windows) hoặc khởi động lại watcher.\n` +
        `Xem trạng thái: node ops/task.mjs list`,
    );
    return 1;
  } catch {
    return 0;
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
    if (cooldownBlocked(state, entry.id)) {
      state.seen.push(seenKey);
      saveState(state);
      continue;
    }
    log(`ĐÁNH THỨC vì ${reason} → ${entry.id} (${entry.task.title ?? ""})`);
    state.seen.push(seenKey);
    markWake(state, entry.id);
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

// ---- chốt chống NHIỀU watcher cùng chạy (mỗi cái sẽ spawn một phiên riêng → bão đánh thức).
// Đã gặp thật: 7 sự kiện `woken` trong 1 phút từ phía Windows.
const PIDFILE = path.join(TASKS_DIR, `.watch-${SELF.toLowerCase()}.pid`);

function watcherAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function claimLock() {
  try {
    const existing = Number(fs.readFileSync(PIDFILE, "utf8").trim());
    if (existing && existing !== process.pid && watcherAlive(existing)) return existing;
  } catch {
    /* chưa có pidfile */
  }
  fs.mkdirSync(TASKS_DIR, { recursive: true });
  fs.writeFileSync(PIDFILE, String(process.pid));
  return null;
}

function releaseLock() {
  try {
    if (Number(fs.readFileSync(PIDFILE, "utf8").trim()) === process.pid) fs.rmSync(PIDFILE, { force: true });
  } catch {
    /* thôi */
  }
}

if (!ONCE) {
  // BỘ NGHE ĐẨY (SSE) đang chạy thì KHÔNG được chạy watcher poll: hai đường cùng đánh thức thì mỗi
  // tin bus boot hai phiên harness. Đã gặp thật 19/09/2026 — sau khi chuyển sang SSE, một phiên
  // song song lại bật `agent-watch.mjs` ⇒ watcher poll quay lại (pid mới xuất hiện liên tục).
  // Tự thoát ở đây là chốt chặn cuối, không phụ thuộc ai/cái gì gọi watcher.
  // Vòng `--once` (do bộ nghe gọi) KHÔNG đi qua nhánh này nên không bị chặn.
  try {
    const listenPid = Number(fs.readFileSync(path.join(TASKS_DIR, `.listen-${SELF.toLowerCase()}.pid`), "utf8").trim());
    if (listenPid && listenPid !== process.pid) {
      process.kill(listenPid, 0); // ném lỗi nếu tiến trình đã chết
      log(`bộ nghe đẩy đang chạy (pid ${listenPid}) — watcher poll tự thoát để không đánh thức trùng.`);
      process.exit(0);
    }
  } catch {
    /* không có bộ nghe (hoặc pidfile cũ) — watcher được phép chạy */
  }
  const holder = claimLock();
  if (holder && !args.includes("--force")) {
    log(`đã có watcher khác đang chạy (pid ${holder}) — thoát để tránh đánh thức trùng. (--force để chạy chồng)`);
    process.exit(0);
  }
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => { releaseLock(); process.exit(0); });
}

const state = loadState();
const firstRun = !state.initialized;
if (!ONCE) {
  await tick(state, { initializeOnly: firstRun && !args.includes("--replay") });
  if (firstRun) log(`lần chạy đầu: bỏ qua ${state.seen.length} sự kiện cũ, chỉ đánh thức cho việc MỚI.`);
}
if (ONCE) {
  const woke = (await tick(state)) + (await tickBus(state)) + (await tickHealth(state));
  log(`--once xong (${woke} lần đánh thức, ${DRY ? "dry-run" : "thật"}).`);
} else {
  const busInfo = loadBusEnv();
  log(`connector: ${busInfo.url && busInfo.token ? busInfo.url : "(chưa có cấu hình bus — chỉ theo dõi git)"}`);
  log(`đang chạy: ${SELF} ← ${PEER} · poll ${INTERVAL}s · ${AUTO ? "TỰ ĐỘNG đánh thức" : "chỉ báo"} · cooldown ${COOLDOWN}s`);
  let round = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, INTERVAL * 1000));
    round += 1;
    try {
      await tick(state);
      await tickBus(state);
      await tickHealth(state);
      if (round % 3 === 0) refreshBoard();
    } catch (error) {
      log(`lỗi vòng lặp: ${String(error.message).split("\n")[0]}`);
    }
  }
}
