#!/usr/bin/env node
/**
 * Bot Telegram 2 CHIỀU cho VPNFlow — chạy TRÊN SERVER (node-2), không phụ thuộc máy Mac.
 *
 * Vì sao đặt trên server: chủ shop cần ra lệnh (xem tình trạng, restart, giao việc cho agent)
 * kể cả khi Mac đã tắt. Bot long-poll `getUpdates` (chỉ cần outbound HTTPS) rồi gọi API admin
 * của control plane trên 127.0.0.1 — không mở thêm cổng nào ra Internet.
 *
 * An toàn:
 *  · Chỉ chat id trong TELEGRAM_ALLOWED_CHATS mới ra lệnh được; chat khác bị từ chối + ghi log.
 *  · Lệnh ĐỔI TRẠNG THÁI phải bấm nút "Xác nhận" (inline keyboard) mới chạy.
 *  · Tên service nằm trong danh sách trắng cố định (không nhận tên tuỳ ý từ chat).
 *  · Mọi lệnh ghi audit JSONL vào LOG_FILE (mặc định /var/log/flowvpn-tg-bot.log).
 *
 * Chạy thử không cần Telegram:
 *   node bot.mjs --simulate "/status"          # in ra nội dung sẽ trả lời
 *   node bot.mjs --simulate "/ping" --send     # gửi thật vào chat (để kiểm tra đường gửi)
 */
import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ENV = process.env;
const TOKEN = (ENV.TELEGRAM_BOT_TOKEN ?? "").trim();
const ALLOWED = (ENV.TELEGRAM_ALLOWED_CHATS ?? ENV.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const CP_BASE = (ENV.CP_BASE ?? "http://127.0.0.1:7778").replace(/\/$/, "");
const ADMIN_TOKEN = (ENV.ADMIN_TOKEN ?? ENV.AUTH_TOKEN ?? "").trim();
const LOG_FILE = ENV.LOG_FILE ?? "/var/log/flowvpn-tg-bot.log";
const AGENT_ENABLED = ENV.AGENT_ENABLED !== "0";
const AGENT_CMD = ENV.AGENT_CMD ?? "dsh";
const AGENT_ARGS = (ENV.AGENT_ARGS ?? "--profile headless").split(" ").filter(Boolean);
const AGENT_WORKDIR = ENV.AGENT_WORKDIR ?? "/root/flowvpn-agent";
const AGENT_TIMEOUT_MS = Number(ENV.AGENT_TIMEOUT_MS || 900_000);
const POLL_TIMEOUT_S = Number(ENV.POLL_TIMEOUT_S || 25);

// Một nguồn sự thật cho logic thuần (đã có test trong control-plane/test/tg-commands.test.js).
async function loadCommands() {
  for (const spec of ["./tg-commands.js", "../../control-plane/src/tg-commands.js"]) {
    try {
      return await import(spec);
    } catch { /* thử đường dẫn kế tiếp */ }
  }
  throw new Error("không tìm thấy module tg-commands.js");
}
const cmd = await loadCommands();

/**
 * Việc /task đang chờ chủ shop bấm Xác nhận. Nội dung việc dài hơn 64 byte nên không thể
 * nhét vào callback_data của Telegram — nút chỉ gửi "oktask", bot tra lại ở đây.
 */
const pendingTasks = new Map(); // chatId -> { text, at }
const PENDING_TTL_MS = 15 * 60 * 1000;

function audit(entry) {
  try {
    appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch (err) {
    console.error("audit log lỗi:", err?.message ?? err);
  }
}

/**
 * Gọi Telegram Bot API, có THỬ LẠI: node-2 tới api.telegram.org thỉnh thoảng bị timeout
 * (thấy thật 16/09) — một cú timeout không được làm chết bot hay mất tin.
 */
async function tg(method, payload = {}, { attempts = 3 } = {}) {
  if (!TOKEN) throw new Error("thiếu TELEGRAM_BOT_TOKEN");
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.ok === false) throw new Error(body?.description ?? `HTTP ${res.status}`);
      return body.result;
    } catch (err) {
      lastErr = err;
      audit({ command: "tg-error", method, attempt, error: err?.message ?? String(err) });
      console.error(`tg-bot: ${method} lỗi lần ${attempt}/${attempts}: ${err?.message ?? err}`);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

/** Gửi tin, tự chia nhỏ nếu dài (Telegram giới hạn 4096 ký tự). */
async function send(chatId, text, extra = {}) {
  const chunks = String(text ?? "").match(/[\s\S]{1,3800}/g) ?? [""];
  let last = null;
  for (const chunk of chunks) {
    try {
      last = await tg("sendMessage", { chat_id: chatId, text: chunk, disable_web_page_preview: true, ...extra });
    } catch (err) {
      console.error("tg-bot: gửi tin thất bại:", err?.message ?? err);
      return null;
    }
  }
  return last;
}

// ------------------------------------------------------------------ dữ liệu
async function cp(path, options = {}) {
  const res = await fetch(`${CP_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

async function sh(file, args, timeout = 20_000) {
  const { stdout } = await execFileAsync(file, args, { timeout, maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
}

async function cmdStatus() {
  const report = await cp("/v1/admin/report");
  return [`📊 ${report.title ?? "Báo cáo"}`, ...(report.lines ?? []).map((l) => `• ${l}`)].join("\n");
}

async function cmdNodes() {
  const stats = await cp("/v1/admin/stats");
  const nodes = await cp("/v1/admin/nodes");
  const lines = ["🛰 Node:"];
  for (const node of nodes.nodes ?? []) {
    let health = "?";
    try {
      const h = await cp(`/v1/admin/nodes/${node.id}/health`);
      health = h.reachable ? `✓ ${h.latency_ms}ms · ${h.capability?.peers ?? "?"} peer` : "✗ KHÔNG phản hồi";
    } catch (err) {
      health = `lỗi: ${err.message}`;
    }
    lines.push(`• ${node.name ?? node.id} (${node.endpoint}) — ${health}`);
  }
  lines.push(`• Peer online: ${stats.totals?.online_peers ?? "?"}/${stats.totals?.total_peers ?? "?"}`);
  return lines.join("\n");
}

async function cmdDevices() {
  const report = await cp("/v1/admin/report");
  const keep = (report.lines ?? []).filter((l) => /Thiết bị|Nền tảng|Đăng ký mới|THIẾU peer|iOS đang chờ/.test(l));
  return ["📱 Thiết bị:", ...keep.map((l) => `• ${l}`)].join("\n");
}

async function cmdOrders() {
  const data = await cp("/v1/admin/payments/pending");
  const orders = data.orders ?? [];
  const head = `🧾 Đơn chờ thanh toán: ${orders.length}`;
  const top = orders.slice(0, 5).map((o) => `• #${o.orderCode} ${o.email} — ${o.plan_label ?? o.plan ?? "?"}`);
  return [head, ...top, orders.length > 5 ? `… và ${orders.length - 5} đơn nữa (xem /admin)` : ""].filter(Boolean).join("\n");
}

async function cmdIos() {
  const data = await cp("/v1/admin/ios/devices");
  const pending = (data.devices ?? []).filter((d) => d.udid && !d.built);
  const head = `📱 UDID chờ ký: ${pending.length}`;
  return [head, ...pending.slice(0, 5).map((d) => `• ${String(d.udid).slice(-8)} · ${d.email ?? "(chưa map)"}`)].join("\n");
}

async function cmdAlerts() {
  const info = await cp("/v1/admin/alert");
  return [
    "🔔 Alert:",
    `• Telegram: ${info.telegram ? "bật" : "tắt"}`,
    `• Mốc báo cáo: ${(info.reportTimes ?? []).join(", ")} (${info.reportEnabled ? "đang bật" : "đã tắt"})`,
    `• Báo cáo gần nhất: ${info.lastReportAt ?? "chưa gửi"}`,
  ].join("\n");
}

async function cmdLog(args) {
  const key = (args[0] ?? "cp").toLowerCase();
  const service = cmd.RESTARTABLE_SERVICES[key];
  if (!service) return `❓ Không có service "${key}". Chọn: ${Object.keys(cmd.RESTARTABLE_SERVICES).join(", ")}`;
  const lines = Math.min(Math.max(Number(args[1] ?? 25) || 25, 1), 200);
  const out = await sh("journalctl", ["-u", service, "-n", String(lines), "--no-pager"]);
  return `📜 ${service} (${lines} dòng cuối)\n${out}`;
}

async function cmdReport(chatId) {
  const result = await cp("/v1/admin/alert/report", { method: "POST" });
  return result.sent ? "✅ Đã gửi báo cáo vào chat." : `⚠️ Không gửi được báo cáo: ${result.reason}`;
}

async function cmdMirror() {
  const out = await sh("/usr/local/bin/mirror-peers.sh", [], 120_000).catch((err) => `lỗi: ${err.message}`);
  let tail = "";
  try {
    tail = await sh("tail", ["-1", "/var/log/flowvpn-mirror-peers.log"]);
  } catch { /* log chưa có */ }
  return `🔄 Đã chạy đồng bộ peer.\n${tail || out}`.trim();
}

async function cmdRestart(args) {
  const key = (args[0] ?? "").toLowerCase();
  const service = cmd.RESTARTABLE_SERVICES[key];
  if (!service) return `❓ Không restart "${key}". Chọn: ${Object.keys(cmd.RESTARTABLE_SERVICES).join(", ")}`;
  await sh("systemctl", ["restart", service], 60_000);
  const state = await sh("systemctl", ["is-active", service]).catch(() => "unknown");
  return `♻️ Đã restart ${service} — trạng thái: ${state}`;
}

async function cmdTask(chatId, args) {
  const prompt = args.join(" ").trim();
  if (!prompt) return "❓ Dùng: /task <việc cần làm>";
  if (!AGENT_ENABLED) return "⛔ Agent trên server đang tắt (AGENT_ENABLED=0).";
  await send(chatId, `⏳ Đang giao việc cho agent trên server:\n${prompt}`);
  try {
    const { stdout, stderr } = await execFileAsync(AGENT_CMD, [...AGENT_ARGS, prompt], {
      cwd: AGENT_WORKDIR,
      timeout: AGENT_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...ENV, DSH_HOME: ENV.DSH_HOME ?? "/root/.dsh" },
    });
    const result = (stdout || "").trim() || "(agent không in gì)";
    const warn = (stderr || "").trim();
    audit({ chat: chatId, command: "task", args: prompt, ok: true });
    await send(chatId, `✅ Xong:\n${result}`);
    if (warn) await send(chatId, `(stderr)\n${warn.slice(-1500)}`);
    return null;
  } catch (err) {
    const detail = (err.stdout || "").trim() || (err.stderr || "").trim() || err.message;
    audit({ chat: chatId, command: "task", args: prompt, ok: false, error: err.message });
    return `❌ Agent lỗi (${Math.round((err.killed ? AGENT_TIMEOUT_MS : 0) / 1000) || "?"}s):\n${String(detail).slice(-2500)}`;
  }
}

// ------------------------------------------------------------- điều phối lệnh
async function handleCommand(parsed, chatId, { force = false, dryRun = false } = {}) {
  switch (parsed.name) {
    case "help": return cmd.helpText();
    case "ping": return "🏓 pong — bot trên server vẫn chạy.";
    case "status": return cmdStatus();
    case "nodes": return cmdNodes();
    case "devices": return cmdDevices();
    case "orders": return cmdOrders();
    case "ios": return cmdIos();
    case "alerts": return cmdAlerts();
    case "log": return cmdLog(parsed.args);
    case "report": return cmdReport(chatId);
    case "mirror": return cmdMirror();
    case "restart": return cmdRestart(parsed.args);
    case "task": return cmdTask(chatId, parsed.args);
    default:
      return `❓ Không hiểu lệnh "${parsed.unknown ?? ""}". Gõ /help để xem danh sách.`;
  }
}

async function onMessage(message) {
  const chatId = String(message.chat?.id ?? "");
  const text = message.text ?? "";
  if (!cmd.isAllowedChat(chatId, ALLOWED)) {
    audit({ chat: chatId, command: "denied", args: text.slice(0, 120), ok: false });
    await send(chatId, "⛔ Chat này không có quyền điều khiển VPNFlow.").catch(() => {});
    return;
  }
  const parsed = cmd.parseCommand(text);
  audit({ chat: chatId, command: parsed.name, args: parsed.args, ok: true });
  if (cmd.needsConfirmation(parsed)) {
    if (parsed.name === "task") {
      const taskText = parsed.args.join(" ").trim();
      if (!taskText) {
        await send(chatId, "❓ Dùng: /task <việc cần làm>");
        return;
      }
      pendingTasks.set(chatId, { text: taskText, at: Date.now() });
    }
    const prompt = cmd.confirmationPrompt(parsed);
    await send(chatId, prompt.text, { reply_markup: { inline_keyboard: prompt.buttons } });
    return;
  }
  const reply = await handleCommand(parsed, chatId).catch((err) => `❌ Lỗi: ${err.message}`);
  if (reply) await send(chatId, reply);
}

async function onCallback(query) {
  const chatId = String(query.message?.chat?.id ?? "");
  if (!cmd.isAllowedChat(chatId, ALLOWED)) return;
  const parsedCb = cmd.parseCallback(query.data);
  await tg("answerCallbackQuery", { callback_query_id: query.id }).catch(() => {});
  if (parsedCb.action === "cancel") {
    await send(chatId, "🚫 Đã huỷ.");
    return;
  }
  if (parsedCb.action !== "confirm") {
    await send(chatId, "❓ Nút không hợp lệ.");
    return;
  }
  let parsed = { name: parsedCb.name, args: parsedCb.args, mutating: true };
  if (parsedCb.name === "task") {
    const pending = pendingTasks.get(chatId);
    pendingTasks.delete(chatId);
    if (!pending || Date.now() - pending.at > PENDING_TTL_MS) {
      await send(chatId, "⌛ Việc này đã hết hạn xác nhận — gửi lại /task <việc cần làm> giúp em.");
      return;
    }
    parsed = { name: "task", args: pending.text.split(" "), mutating: true };
  }
  audit({ chat: chatId, command: parsed.name, args: parsed.args, confirmed: true });
  const reply = await handleCommand(parsed, chatId, { force: true }).catch((err) => `❌ Lỗi: ${err.message}`);
  if (reply) await send(chatId, reply);
}

// ------------------------------------------------------------------- vòng lặp
async function pollLoop() {
  let offset = Number(ENV.TG_OFFSET_START || 0);
  console.log(`tg-bot: bắt đầu long-poll (chat cho phép: ${ALLOWED.join(", ") || "(chưa cấu hình!)"})`);
  for (;;) {
    try {
      const updates = await tg("getUpdates", {
        offset,
        timeout: POLL_TIMEOUT_S,
        allowed_updates: ["message", "callback_query"],
      });
      for (const update of updates ?? []) {
        offset = update.update_id + 1;
        try {
          if (update.message?.text) await onMessage(update.message);
          else if (update.callback_query) await onCallback(update.callback_query);
        } catch (err) {
          console.error("tg-bot: xử lý update lỗi:", err?.message ?? err);
          audit({ command: "error", error: err?.message ?? String(err) });
        }
      }
    } catch (err) {
      console.error("tg-bot: getUpdates lỗi:", err?.message ?? err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

process.on("unhandledRejection", (err) => {
  console.error("tg-bot: unhandledRejection:", err?.message ?? err);
  audit({ command: "unhandledRejection", error: err?.message ?? String(err) });
});
process.on("uncaughtException", (err) => {
  console.error("tg-bot: uncaughtException:", err?.message ?? err);
  audit({ command: "uncaughtException", error: err?.message ?? String(err) });
});

// --------------------------------------------------------------------- main
const simulateIdx = process.argv.indexOf("--simulate");
if (simulateIdx > -1) {
  const text = process.argv[simulateIdx + 1] ?? "/help";
  const chatId = ALLOWED[0] ?? "0";
  const parsed = cmd.parseCommand(text);
  // --confirm: chạy thẳng nhánh "đã bấm Xác nhận" để test /task từ CLI.
  if (cmd.needsConfirmation(parsed, { force: process.argv.includes("--confirm") })) {
    const prompt = cmd.confirmationPrompt(parsed);
    console.log("[cần xác nhận]", prompt.text);
    console.log("nút:", JSON.stringify(prompt.buttons));
    if (process.argv.includes("--send")) await send(chatId, prompt.text, { reply_markup: { inline_keyboard: prompt.buttons } });
  } else {
    const reply = await handleCommand(parsed, chatId, { force: true });
    console.log(reply ?? "(lệnh này tự gửi tin, không có nội dung trả về)");
    // /task tự gửi tin (⏳ rồi ✅) nên reply = null — không gửi thêm tin rỗng.
    if (reply && process.argv.includes("--send")) await send(chatId, reply);
  }
  process.exit(0);
}

if (!TOKEN) {
  console.error("thiếu TELEGRAM_BOT_TOKEN — không chạy được");
  process.exit(2);
}
await pollLoop();
