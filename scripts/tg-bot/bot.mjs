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
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
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
const CHAT_TIMEOUT_MS = Number(ENV.CHAT_TIMEOUT_MS || 600_000);
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

/**
 * Trạng thái /chat (chỉ trong RAM): ngữ cảnh hội thoại từng chat, chat nào đang bật
 * "chế độ chat" (tin thường ⇒ trả lời), và chat nào đang có agent chạy (không chạy chồng).
 */
const chatHistories = new Map(); // chatId -> [{ role, content }]
const chatModes = new Set();     // chatId đang bật chế độ chat
const chatBusy = new Set();      // chatId đang chờ agent trả lời

/**
 * Sổ theo dõi việc agent do /task chạy (để /reporttasks báo cáo). Giữ trong RAM, tối đa
 * TASK_HISTORY_MAX việc gần nhất. /task chạy NỀN nên vòng long-poll không bị chặn và có
 * thể hỏi trạng thái trong lúc agent đang làm.
 */
const agentTasks = new Map(); // id -> { id, kind, chatId, prompt, status, startedAt, endedAt, error }
let taskSeq = 0;
const TASK_HISTORY_MAX = 30;

function newTask(kind, chatId, prompt) {
  taskSeq += 1;
  const task = {
    id: taskSeq,
    kind,
    chatId,
    prompt: String(prompt ?? "").trim(),
    status: "running",
    startedAt: Date.now(),
    endedAt: null,
    error: null,
  };
  agentTasks.set(task.id, task);
  pruneTasks();
  return task;
}

function finishTask(task, status, error = null) {
  task.status = status;
  task.endedAt = Date.now();
  if (error) task.error = String(error).slice(0, 300);
}

/** Chỉ dọn việc ĐÃ KẾT THÚC khi sổ vượt hạn — không bao giờ xoá việc đang chạy. */
function pruneTasks() {
  while (agentTasks.size > TASK_HISTORY_MAX) {
    const oldest = [...agentTasks.values()]
      .filter((t) => t.status !== "running")
      .sort((a, b) => a.id - b.id)[0];
    if (!oldest) return;
    agentTasks.delete(oldest.id);
  }
}

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
/**
 * Gọi Telegram Bot API qua node:https với **IPv4 bắt buộc**.
 *
 * Vì sao không dùng fetch: node-2 phân giải api.telegram.org ra IPv6 trước nhưng máy không có
 * IPv6, undici lại hay timeout sang IPv4 trong khi `curl` cùng IP vẫn 200 (đã kiểm chứng
 * 16/09). https.Agent({ family: 4 }) đi đúng đường như curl, và nếu vẫn lỗi thì thử thẳng IP.
 *
 * Gửi thất bại sau tất cả lần thử ⇒ ghi vào OUTBOX để vòng poll sau gửi lại (không mất việc
 * mà agent đã làm xong).
 */
const TG_HOST = "api.telegram.org";
const TG_IPS = ["149.154.167.220", "149.154.166.110", "149.154.175.100"];
const OUTBOX = ENV.OUTBOX_FILE ?? "/var/log/flowvpn-tg-outbox.jsonl";
let tgAgent = null;
function agent4() {
  // Socket idle timeout phải rộng hơn long-poll (xem callTimeout trong tg()): getUpdates giữ
  // kết nối im lặng tới 25s, agent timeout 10s sẽ cắt ngang giữa chừng.
  if (!tgAgent) tgAgent = new https.Agent({ keepAlive: true, family: 4, timeout: 60_000 });
  return tgAgent;
}

function httpsJson(method, path, body, { host = TG_HOST, ip = null, timeoutMs = 12_000 } = {}) {
  const payload = JSON.stringify(body ?? {});
  return new Promise((resolve, reject) => {
    const options = {
      method,
      host: ip ?? host,
      port: 443,
      path,
      agent: ip ? new https.Agent({ keepAlive: false, family: 4 }) : agent4(),
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), Host: host },
      timeout: timeoutMs,
    };
    if (ip) options.servername = host; // SNI + kiểm tra chứng chỉ theo tên miền thật
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { /* để nguyên null */ }
        if (res.statusCode >= 200 && res.statusCode < 300 && parsed?.ok !== false) resolve(parsed);
        else reject(new Error(parsed?.description ?? `HTTP ${res.statusCode}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timeout ${Math.round(timeoutMs / 1000)}s`)));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function tg(method, payload = {}, { attempts = 3 } = {}) {
  if (!TOKEN) throw new Error("thiếu TELEGRAM_BOT_TOKEN");
  const path = `/bot${TOKEN}/${method}`;
  // getUpdates là long-poll: Telegram giữ kết nối tới `payload.timeout` giây rồi mới trả về
  // rỗng. Timeout của client PHẢI lớn hơn (xem telegramCallTimeoutMs), nếu không mỗi vòng poll
  // đều bị cắt ở 12s và bot rơi vào vòng "timeout → thử lại → thử IP" vô ích (log 17/09).
  const callTimeout = cmd.telegramCallTimeoutMs(method, payload.timeout ?? POLL_TIMEOUT_S);
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const body = await httpsJson("POST", path, payload, { timeoutMs: callTimeout });
      return body?.result ?? null;
    } catch (err) {
      lastErr = err;
      audit({ command: "tg-error", method, attempt, error: err?.message ?? String(err) });
      console.error(`tg-bot: ${method} lỗi lần ${attempt}/${attempts}: ${err?.message ?? err}`);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  // Thử thẳng từng IP Telegram (bỏ qua DNS) trước khi bỏ cuộc.
  for (const ip of TG_IPS) {
    try {
      const body = await httpsJson("POST", path, payload, { ip, timeoutMs: callTimeout });
      console.log(`tg-bot: ${method} OK qua IP ${ip}`);
      return body?.result ?? null;
    } catch (err) {
      lastErr = err;
      console.error(`tg-bot: ${method} qua ${ip} lỗi: ${err?.message ?? err}`);
    }
  }
  throw lastErr;
}

/** Tin không gửi được thì xếp hàng, vòng poll sau gửi lại. */
function outboxPush(chatId, text, extra) {
  try {
    appendFileSync(OUTBOX, JSON.stringify({ ts: Date.now(), chatId, text, extra }) + "\n");
    console.error("tg-bot: đã xếp tin vào outbox");
  } catch (err) {
    console.error("tg-bot: không ghi được outbox:", err?.message ?? err);
  }
}

async function outboxFlush() {
  let lines = [];
  try {
    lines = readFileSync(OUTBOX, "utf8").split("\n").filter(Boolean);
  } catch { return; }
  if (!lines.length) return;
  const still = [];
  for (const line of lines) {
    let item;
    try { item = JSON.parse(line); } catch { continue; }
    try {
      await tg("sendMessage", { chat_id: item.chatId, text: item.text, disable_web_page_preview: true, ...(item.extra ?? {}) }, { attempts: 1 });
    } catch {
      still.push(line);
    }
  }
  try { writeFileSync(OUTBOX, still.length ? still.join("\n") + "\n" : ""); } catch { /* bỏ qua */ }
  if (lines.length !== still.length) console.log(`tg-bot: outbox đã gửi lại ${lines.length - still.length} tin`);
}

async function send(chatId, text, extra = {}) {
  // Cắt theo code point (chunkMessage) để KHÔNG cắt đôi emoji — cắt theo code unit làm Telegram
  // hiện ký tự vỡ giữa tin dài (report/chat đầy emoji).
  const chunks = cmd.chunkMessage(text, 3800);
  let last = null;
  for (const chunk of chunks) {
    try {
      last = await tg("sendMessage", { chat_id: chatId, text: chunk, disable_web_page_preview: true, ...extra });
    } catch (err) {
      console.error("tg-bot: gửi tin thất bại:", err?.message ?? err);
      outboxPush(chatId, chunk, extra);   // không mất tin, vòng sau gửi lại
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

/** Chạy test suite control plane trong workspace — "build được" trên server. */
async function cmdBuild() {
  const testLog = "/tmp/tg-bot-build.log";
  try {
    await sh("bash", ["-lc", `cd ${AGENT_WORKDIR}/control-plane && node --test test/*.test.js > ${testLog} 2>&1`], 300_000);
  } catch (err) {
    const tail = await sh("tail", ["-15", testLog]).catch(() => err.message);
    return `❌ Test FAIL\n${tail}`;
  }
  const summary = await sh("grep", ["-E", "^ℹ (tests|pass|fail)", testLog]).catch(() => "");
  return `✅ Build/test control plane trên server:\n${summary || "(không đọc được summary)"}`;
}

/** Deploy thay đổi trong workspace lên bản đang chạy (script có test + rollback). */
async function cmdDeploy() {
  const script = `${AGENT_WORKDIR}/scripts/server-agent/deploy-control-plane.sh`;
  try {
    const out = await sh("bash", [script], 600_000);
    const diff = await workspaceDiff();
    return `🚀 Deploy xong.\n${out}\n${diff}`;
  } catch (err) {
    const out = (err.stdout || "").trim() || (err.stderr || "").trim() || err.message;
    return `❌ Deploy LỖI (đã tự rollback nếu health hỏng):\n${String(out).slice(-2500)}`;
  }
}

/** Tóm tắt thay đổi trong workspace để đính kèm câu trả lời. */
async function workspaceDiff() {
  try {
    const status = await sh("git", ["-C", AGENT_WORKDIR, "status", "--porcelain"], 15_000);
    if (!status.trim()) return "📄 Workspace: không có file nào thay đổi.";
    const stat = await sh("git", ["-C", AGENT_WORKDIR, "diff", "--stat"], 15_000);
    return `📄 File đã đổi:\n${status}\n${stat}`;
  } catch (err) {
    return `(không đọc được git status: ${err.message})`;
  }
}

/** Tiền tố nhắc agent biết nó đang ở đâu và được phép làm gì. */
function agentPreamble() {
  return [
    "Bạn đang chạy trên SERVER VPNFlow (node-2), workspace " + AGENT_WORKDIR + ".",
    "Đọc docs/SERVER_AGENT.md trước khi làm. Được phép: sửa control-plane/src/*.js, chạy test,",
    "và deploy bằng scripts/server-agent/deploy-control-plane.sh (script tự test + rollback).",
    "KHÔNG đọc/in secret, không sửa dữ liệu khách, không build app iOS/Android/Windows ở đây.",
    "Trả lời ngắn gọn bằng tiếng Việt: đã làm gì, bằng chứng (lệnh + kết quả), còn gì chưa chắc.",
    "",
    "VIỆC CẦN LÀM:",
  ].join("\n");
}

async function cmdTask(chatId, args) {
  const prompt = args.join(" ").trim();
  if (!prompt) return "❓ Dùng: /task <việc cần làm>";
  if (!AGENT_ENABLED) return "⛔ Agent trên server đang tắt (AGENT_ENABLED=0).";
  const task = newTask("task", chatId, prompt);
  audit({ chat: chatId, command: "task", args: prompt, taskId: task.id, ok: true });
  // Chạy NỀN: trả lời ngay để bot còn nhận /reporttasks, /status… trong lúc agent làm.
  void runAgentTask(task);
  return `⏳ Đã nhận việc #${task.id}:\n${prompt}\nEm chạy nền và báo khi xong — gõ /reporttasks để xem trạng thái.`;
}

/** Thực thi một việc agent ở nền rồi cập nhật sổ và gửi kết quả về chat đã giao việc. */
async function runAgentTask(task) {
  try {
    const { stdout, stderr } = await execFileAsync(AGENT_CMD, [...AGENT_ARGS, agentPreamble() + task.prompt], {
      cwd: AGENT_WORKDIR,
      timeout: AGENT_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...ENV, DSH_HOME: ENV.DSH_HOME ?? "/root/.dsh" },
    });
    const result = (stdout || "").trim() || "(agent không in gì)";
    const warn = (stderr || "").trim();
    finishTask(task, "done");
    audit({ chat: task.chatId, command: "task", args: task.prompt, taskId: task.id, ok: true });
    await send(task.chatId, `✅ Xong việc #${task.id}:\n${result}\n\n${await workspaceDiff()}`);
    if (warn) await send(task.chatId, `(stderr #${task.id})\n${warn.slice(-1500)}`);
  } catch (err) {
    const timedOut = Boolean(err?.killed) || err?.signal === "SIGTERM";
    const detail = (err.stdout || "").trim() || (err.stderr || "").trim() || err.message;
    finishTask(task, timedOut ? "timeout" : "failed", err.message);
    audit({ chat: task.chatId, command: "task", args: task.prompt, taskId: task.id, ok: false, error: err.message });
    await send(task.chatId, `❌ Việc #${task.id} ${timedOut ? "quá hạn" : "lỗi"}:\n${String(detail).slice(-2500)}`).catch(() => {});
  }
}

/** /reporttasks — trạng thái các việc agent đang chạy / vừa xong. */
const COORD_BIN = ENV.COORD_BIN ?? "/usr/local/bin/flowvpn-coord";
const GUARD_TASKS_DIR = ENV.GUARD_TASKS_DIR ?? "/var/lib/flowvpn-coord/tasks";

/** Gọi flowvpn-coord (bang viec chung) và trả stdout. */
async function coord(args) {
  const { stdout } = await execFileAsync(COORD_BIN, args, { timeout: 20_000 });
  return String(stdout ?? "").trim();
}

/** /guard — task do flowvpn-guard tao ra, dang cho chu du an approve. */
async function cmdGuard() {
  const out = await coord(["task", "list"]);
  return out || "Khong co task nao.";
}

function readGuardTask(id) {
  try {
    return JSON.parse(readFileSync(`${GUARD_TASKS_DIR}/${id}.json`, "utf8"));
  } catch {
    return null;
  }
}

/**
 * /approve <id> — CHO PHEP sua. Day la cong duy nhat mo khoa viec sua/publish:
 * task do guard tao luon o trang thai pending_approval, agent khac claim se bi tu choi.
 * Task thuoc owner `server` thi bot giao luon cho agent tren server chay nen.
 */
async function cmdApprove(chatId, args) {
  const id = String(args[0] ?? "").trim();
  if (!id) return "❓ Dùng: /approve <id>  (xem /guard để lấy id)";
  const out = await coord(["task", "approve", id, "--by", "telegram"]);
  const task = readGuardTask(id);
  if (task?.owner === "server") {
    if (!AGENT_ENABLED) return `${out}\n⛔ Agent trên server đang tắt (AGENT_ENABLED=0) — task đã approve, tự chạy sau.`;
    const prompt = [
      `Task ${id} do flowvpn-guard tạo đã được chủ dự án APPROVE trên Telegram. Hãy điều tra và sửa:`,
      `- Loại: ${task.kind} · nền tảng: ${task.platform || "không rõ"}`,
      `- Bằng chứng: ${task.evidence?.summary ?? "-"}`,
      `- Khách bị ảnh hưởng: ${(task.customers ?? []).map((c) => c.email).join(", ")}`,
      `- Việc cần làm: ${task.requested_action ?? "điều tra nguyên nhân gốc rồi sửa"}`,
      "Yêu cầu: sửa nguyên nhân gốc, chạy test, deploy bằng /deploy khi xong, rồi cập nhật task:",
      `  flowvpn-coord task done ${id} --note "<đã sửa gì>"`,
    ].join("\n");
    const t = newTask("guard", chatId, prompt);
    void runAgentTask(t);
    return `${out}\n🤖 Đã giao agent trên server chạy nền (việc #${t.id}) — /reporttasks để xem, /report để lấy báo cáo.`;
  }
  return `${out}\n📋 Agent phụ trách: ${task?.owner ?? "?"}. Nhận việc bằng:\n` +
    `flowvpn-coord task claim ${id} --owner ${task?.owner ?? "<owner>"}`;
}

/** /reject <id> <lý do> — không sửa; guard ghi lý do vào task để không đề xuất lại. */
async function cmdReject(args) {
  const id = String(args[0] ?? "").trim();
  if (!id) return "❓ Dùng: /reject <id> <lý do>";
  const reason = args.slice(1).join(" ").trim() || "chủ dự án từ chối";
  return await coord(["task", "reject", id, "--reason", reason, "--by", "telegram"]);
}

function cmdReportTasks() {
  return cmd.reportTasks([...agentTasks.values()], { limit: 10 });
}

// ------------------------------------------------------------------ /chat
/**
 * Chạy agent ở CHẾ ĐỘ CHAT rồi gửi câu trả lời. Tách khỏi cmdChat để cmdChat trả về ngay
 * ("đang suy nghĩ"), không chặn vòng long-poll: chat có thể lâu (tra internet) mà anh vẫn
 * gõ được /status. Mỗi chat chỉ chạy 1 agent một lúc (chatBusy).
 */
async function runChat(chatId, text) {
  try {
    const history = chatHistories.get(chatId) ?? [];
    const prompt = cmd.buildChatPrompt(cmd.trimChatHistory(history), text);
    audit({ chat: chatId, command: "chat", args: text.slice(0, 200), ok: true });
    const { stdout } = await execFileAsync(AGENT_CMD, [...AGENT_ARGS, prompt], {
      cwd: AGENT_WORKDIR,
      timeout: CHAT_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...ENV, DSH_HOME: ENV.DSH_HOME ?? "/root/.dsh" },
    });
    const answer = (stdout || "").trim() || "(agent không trả lời)";
    const next = [...history, { role: "user", content: text }, { role: "assistant", content: answer }];
    chatHistories.set(chatId, cmd.trimChatHistory(next));
    await send(chatId, `💬 ${answer}`);
  } catch (err) {
    const detail = (err.stdout || "").trim() || (err.stderr || "").trim() || err.message;
    audit({ chat: chatId, command: "chat", ok: false, error: err.message });
    await send(chatId, `❌ Chat lỗi:\n${String(detail).slice(-2500)}`).catch(() => {});
  } finally {
    chatBusy.delete(chatId);
  }
}

async function cmdChat(chatId, args) {
  const parsed = cmd.parseChatArgs(args);
  if (parsed.kind === "help") return cmd.chatHelpText();
  if (parsed.kind === "reset") {
    chatHistories.delete(chatId);
    return "🧹 Đã xoá ngữ cảnh hội thoại. Mình bắt đầu lại nhé.";
  }
  if (parsed.kind === "on") {
    chatModes.add(chatId);
    return "🟢 Đã bật chế độ chat — anh nhắn bình thường (không cần /chat) em trả lời.";
  }
  if (parsed.kind === "off") {
    chatModes.delete(chatId);
    return "🔴 Đã tắt chế độ chat. Nhắn /chat <câu hỏi> khi cần.";
  }
  if (!AGENT_ENABLED) return "⛔ Agent trên server đang tắt (AGENT_ENABLED=0).";
  if (chatBusy.has(chatId)) return "⏳ Em còn đang trả lời tin trước, anh chờ chút rồi nhắn lại nhé.";
  chatBusy.add(chatId);
  void runChat(chatId, parsed.text);
  return "🤔 Đang suy nghĩ & tra cứu internet… em trả lời ngay khi xong.";
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
    case "reporttasks": case "tasks": return cmdReportTasks();
    case "report": return cmdReport(chatId);
    case "mirror": return cmdMirror();
    case "restart": return cmdRestart(parsed.args);
    case "build": return cmdBuild();
    case "deploy": return cmdDeploy();
    case "guard": return cmdGuard();
    case "approve": return cmdApprove(chatId, parsed.args);
    case "reject": return cmdReject(parsed.args);
    case "task": return cmdTask(chatId, parsed.args);
    case "chat": return cmdChat(chatId, parsed.args);
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
  // Chế độ chat: tin thường (không bắt đầu bằng "/") mà không phải lệnh nào thì đưa cho agent.
  if (parsed.name === "unknown" && !/^\s*\//.test(text) && chatModes.has(chatId)) {
    audit({ chat: chatId, command: "chat", args: text.slice(0, 200), ok: true });
    const reply = await cmdChat(chatId, text.split(/\s+/)).catch((err) => `❌ Lỗi: ${err.message}`);
    if (reply) await send(chatId, reply);
    return;
  }
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
      await outboxFlush();
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
