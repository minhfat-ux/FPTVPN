#!/usr/bin/env node
/**
 * Sinh bảng trạng thái vào `AGENTS.local.md` — file mà harness TỰ NẠP khi mở phiên mới.
 *
 * Nhờ vậy mở phiên lên là biết ngay: việc nào đang mở, connector còn sống không, bên kia có đang
 * poll không, và việc gì phải làm trước — không phải hỏi lại người.
 *
 *   node ops/status-board.mjs            # cập nhật AGENTS.local.md
 *   node ops/status-board.mjs --print    # chỉ in ra, không ghi file
 *
 * Được gọi tự động: sau mỗi sự kiện trong `task.mjs`, mỗi vòng poll của `agent-watch.mjs`,
 * và một lần lúc `dsh web` khởi động (plugin `dsh-plugin-agent-watch`).
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SELF = (process.env.AGENT_NAME || "MAC").toUpperCase();
const PEER = SELF === "MAC" ? "WIN" : "MAC";
const TASKS_DIR = path.join("ops", "tasks");
const BOARD = "AGENTS.local.md";
const START = "<!-- AUTO-STATUS:START (do ops/status-board.mjs sinh, dung sua tay) -->";
const END = "<!-- AUTO-STATUS:END -->";
const PRINT_ONLY = process.argv.includes("--print");
const SKIP_NET = process.argv.includes("--offline");

const HINTS = {
  sent: (id, to) => `AGENT_NAME=${to.toUpperCase()} node ops/task.mjs ack ${id} --push`,
  reopened: (id, to) => `AGENT_NAME=${to.toUpperCase()} node ops/task.mjs ack ${id} --push   # làm lại`,
  acked: (id) => `node ops/task.mjs progress ${id} --note "…" --push`,
  in_progress: (id) => `node ops/task.mjs done ${id} --evidence "commit=…, cmd=…, kết quả=…" --push`,
  blocked: () => "bên giao cần gỡ vướng",
  done: () => "bên giao nghiệm thu: chạy lệnh trong `--verify` rồi `verify --result pass|fail`",
  created: (id) => `node ops/task.mjs send ${id} --push`,
};

/** Đọc sổ cục bộ: mỗi thư mục task là một chuỗi sự kiện. */
function readTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  const tasks = [];
  for (const id of fs.readdirSync(TASKS_DIR)) {
    if (id.startsWith(".")) continue;
    const dir = path.join(TASKS_DIR, id);
    let stat;
    try {
      stat = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const events = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        events.push(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
      } catch {
        /* bỏ file hỏng */
      }
    }
    events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const created = events.find((event) => event.type === "created");
    if (!created) continue;
    const task = created.task ?? { id };
    let status = "created";
    for (const event of events) {
      if (event.type === "sent") status = "sent";
      else if (event.type === "acked") status = "acked";
      else if (event.type === "progress") status = "in_progress";
      else if (event.type === "blocked") status = "blocked";
      else if (event.type === "done") status = "done";
      else if (event.type === "verified") status = event.result === "pass" ? "verified" : "reopened";
    }
    const sentEvent = events.find((event) => event.type === "sent");
    const wokeOrAcked = events.some((event) => ["woken", "acked"].includes(event.type));
    tasks.push({ id, task, status, events, last: events[events.length - 1], silentMinutes: sentEvent && !wokeOrAcked ? Math.round((Date.now() - new Date(sentEvent.at).getTime()) / 60000) : null });
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}

/** Đọc `.env.bus` nếu env chưa có (giống watcher). */
function busConfig() {
  const values = {};
  try {
    for (const line of fs.readFileSync(path.join(process.cwd(), ".env.bus"), "utf8").split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) values[match[1]] = match[2].trim();
    }
  } catch {
    /* không có file */
  }
  return {
    url: String(process.env.AGENT_BUS_URL || values.AGENT_BUS_URL || "").replace(/\/$/, ""),
    token: String(process.env.AGENT_BUS_TOKEN || values.AGENT_BUS_TOKEN || ""),
  };
}

async function busSnapshot() {
  const { url, token } = busConfig();
  if (!url || !token || SKIP_NET) return { configured: Boolean(url && token), url, reachable: false };
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const health = await (await fetch(`${url}/health`, { signal: AbortSignal.timeout(6000) })).json();
    const presence = await (await fetch(`${url}/presence`, { headers: auth, signal: AbortSignal.timeout(6000) })).json();
    const pending = await (await fetch(`${url}/pull?agent=${SELF.toLowerCase()}&since=0`, { headers: auth, signal: AbortSignal.timeout(6000) })).json();
    return {
      configured: true,
      url,
      reachable: true,
      count: health.count,
      latest: health.latest,
      agents: presence.agents ?? [],
      pending: pending.messages ?? [],
    };
  } catch (error) {
    return { configured: true, url, reachable: false, error: String(error?.message ?? error).slice(0, 120) };
  }
}

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

const tasks = readTasks();
const bus = await busSnapshot();
const open = tasks.filter((task) => task.status !== "verified");
const now = new Date().toLocaleString("vi-VN", { hour12: false });

const lines = [START, "", `# Trạng thái harness (tự sinh ${now} — ĐỪNG sửa tay)`, ""];

lines.push(`Bên này: **${SELF}** · đối tác: **${PEER}** · connector: ${bus.configured ? bus.url : "(chưa cấu hình)"}`, "");

lines.push("## Việc đang mở", "");
if (!open.length) {
  lines.push("Không có việc nào đang mở.", "");
} else {
  lines.push("| id | trạng thái | luồng | việc | lệnh tiếp theo |", "|---|---|---|---|---|");
  for (const entry of open) {
    const hint = (HINTS[entry.status] ?? (() => "-"))(entry.id, entry.task.to ?? "");
    const silent = entry.silentMinutes !== null && entry.silentMinutes >= 5 ? ` ⚠ im lặng ${entry.silentMinutes} phút` : "";
    lines.push(`| \`${entry.id}\` | ${entry.status}${silent} | ${entry.task.from}→${entry.task.to} | ${String(entry.task.title ?? "").slice(0, 60)} | \`${hint}\` |`);
  }
  lines.push("");
}

lines.push("## Connector VPS", "");
if (!bus.configured) {
  lines.push("- Chưa cấu hình (thiếu `.env.bus`) — chỉ còn kênh git.", "");
} else if (!bus.reachable) {
  lines.push(`- ⚠ Không gọi được connector: ${bus.error ?? "không rõ"}`, "");
} else {
  lines.push(`- Hàng đợi: ${bus.count} tin (mới nhất #${bus.latest})`);
  const seen = new Map((bus.agents ?? []).map((agent) => [String(agent.agent).toLowerCase(), agent]));
  for (const name of [SELF.toLowerCase(), PEER.toLowerCase()]) {
    const info = seen.get(name);
    lines.push(
      info
        ? `- ${name}: poll ${info.secondsAgo}s trước (host ${info.host || "?"}, ip ${info.ip})`
        : `- ${name}: **CHƯA THẤY POLL** ✗`,
    );
  }
  if (bus.pending.length) {
    lines.push(`- Tin đang chờ cho ${SELF.toLowerCase()}:`);
    for (const message of bus.pending.slice(-5)) lines.push(`  - #${message.id} [${message.kind}] ${message.title}`);
  }
  lines.push("");
}

const todo = [];
for (const entry of open) {
  const mine = String(entry.task.to ?? "").toLowerCase() === SELF.toLowerCase();
  if (mine && entry.status === "sent") todo.push(`Nhận việc \`${entry.id}\`: \`AGENT_NAME=${SELF} node ops/task.mjs ack ${entry.id} --push\` rồi thực hiện.`);
  if (mine && entry.status === "reopened") todo.push(`\`${entry.id}\` bị trả lại — ack rồi làm lại.`);
  if (!mine && entry.status === "done") todo.push(`Nghiệm thu \`${entry.id}\`: chạy lệnh trong \`--verify\` rồi \`node ops/task.mjs verify ${entry.id} --result pass|fail\`.`);
  if (!mine && entry.silentMinutes !== null && entry.silentMinutes >= 5) todo.push(`\`${entry.id}\`: đã giao ${entry.silentMinutes} phút mà ${entry.task.to} chưa đánh thức/ack — kiểm tra watcher bên đó hoặc nhắc.`);
}
if (bus.reachable && bus.configured && !(bus.agents ?? []).some((agent) => String(agent.agent).toLowerCase() === PEER.toLowerCase())) {
  todo.push(`Đối tác **${PEER}** chưa poll connector — nó không nhận được việc cho tới khi chạy watcher (\`ops/win-join-bus.ps1\` + \`agent-watch.mjs\`).`);
}

lines.push("## Việc cần làm ngay khi mở phiên", "");
lines.push(...(todo.length ? todo.map((item) => `- ${item}`) : ["- Không có gì gấp. Muốn kiểm tra: `node ops/task.mjs sync` và `GET /presence` trên connector."]), "");
lines.push("Chi tiết giao thức: [`docs/TASK-PROTOCOL.md`](docs/TASK-PROTOCOL.md) · connector: [`docs/AGENT-BUS.md`](docs/AGENT-BUS.md)");
lines.push("", END);
const block = lines.join("\n");

if (PRINT_ONLY) {
  console.log(block);
  process.exit(0);
}

let text = fs.existsSync(BOARD) ? fs.readFileSync(BOARD, "utf8") : "";
const replaced = replaceBlock(text, START, END, block);
text = replaced ?? `${block}\n${text.trim() ? `\n${text.trim()}\n` : ""}`;
fs.writeFileSync(BOARD, text.endsWith("\n") ? text : `${text}\n`);
console.log(`đã cập nhật ${BOARD} (${open.length} việc đang mở, connector ${bus.reachable ? "OK" : "chưa gọi được"})`);
