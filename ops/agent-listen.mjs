#!/usr/bin/env node
/**
 * BỘ NGHE ĐẨY — thay cho watcher poll 20 giây.
 *
 * Vấn đề của kiểu cũ: watcher poll `origin/flowgpt` mỗi 20 giây, mỗi vòng gọi git hàng chục lần.
 * Trên Windows MỖI tiến trình con là MỘT cửa sổ console đen nháy lên rồi tắt (Node không truyền
 * cờ CREATE_NO_WINDOW khi `windowsHide` để mặc định). Kết quả thật: màn hình nháy không ngớt,
 * "cả đống windows command chạy rồi tắt loạn cả mắt".
 *
 * Cách mới: giữ MỘT kết nối mở tới connector (`GET /subscribe`, Server-Sent Events). Lúc rảnh
 * tiến trình này KHÔNG spawn gì cả — chỉ một socket nằm im. Bên kia gửi tin thì VPS đẩy xuống
 * ngay, tiến trình này RUNG CHUÔNG: chạy đúng một vòng `agent-watch.mjs --once --auto` (tiến
 * trình ẩn) để đồng bộ sổ và đánh thức harness nếu cần. Xong lại im.
 *
 *   node ops/agent-listen.mjs                 # chạy mãi (dùng cho Task Scheduler / chạy ẩn)
 *   node ops/agent-listen.mjs --once          # nối thử một lần rồi thoát (kiểm tra kênh)
 *   node ops/agent-listen.mjs --dry-run       # không chạy worker thật, chỉ in ra
 *   node ops/agent-listen.mjs --safety 600    # nhịp an toàn: 10 phút rung chuông một lần
 *
 * Biến môi trường: như agent-watch.mjs (AGENT_NAME, AGENT_BUS_URL, AGENT_BUS_TOKEN, hoặc .env.bus).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const SELF = (process.env.AGENT_NAME || "MAC").trim().toUpperCase();
const TASKS_DIR = path.join("ops", "tasks");

const args = process.argv.slice(2);
const flagValue = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const ONCE = args.includes("--once");
const DRY = args.includes("--dry-run");
const NO_WAKE = args.includes("--no-wake");
/** Nhịp AN TOÀN: kể cả không có tin đẩy, vẫn đồng bộ sổ một lần mỗi khoảng này (giây). */
const SAFETY = Number(flagValue("safety", process.env.LISTEN_SAFETY ?? 600)) || 600;
/** Hai lần rung chuông sát nhau quá thì gộp — tránh boot nhiều phiên vì một chùm tin. */
const GAP_MS = (Number(flagValue("gap", process.env.LISTEN_GAP ?? 20)) || 20) * 1000;
/** Không nhận được byte nào trong bao lâu thì coi như kết nối chết và nối lại (giây). */
const STALE_MS = (Number(flagValue("stale", process.env.LISTEN_STALE ?? 90)) || 90) * 1000;

/** Xem agent-watch.mjs: trên Windows phải tắt cửa sổ console của MỌI tiến trình con. */
const NO_WINDOW = { windowsHide: true };

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)} ${SELF} nghe] ${message}`);

/** Cấu hình connector: env trước, thiếu thì đọc `.env.bus` trong repo (file bị gitignore). */
function loadBusEnv() {
  let url = String(process.env.AGENT_BUS_URL ?? "").trim();
  let token = String(process.env.AGENT_BUS_TOKEN ?? "").trim();
  if (url && token) return { url: url.replace(/\/$/, ""), token };
  const values = {};
  try {
    for (const line of fs.readFileSync(path.join(process.cwd(), ".env.bus"), "utf8").split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) values[match[1]] = match[2].trim();
    }
  } catch {
    /* không có file */
  }
  url = url || values.AGENT_BUS_URL || "";
  token = token || values.AGENT_BUS_TOKEN || "";
  return { url: url.replace(/\/$/, ""), token };
}

// ---- chốt chống nhiều bộ nghe cùng chạy (mỗi cái giữ một kết nối ⇒ rung chuông trùng) --------
const PIDFILE = path.join(TASKS_DIR, `.listen-${SELF.toLowerCase()}.pid`);

function claimLock() {
  try {
    const existing = Number(fs.readFileSync(PIDFILE, "utf8").trim());
    if (existing && existing !== process.pid) {
      try {
        process.kill(existing, 0);
        return existing;
      } catch {
        /* tiến trình cũ đã chết */
      }
    }
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

// ---- RUNG CHUÔNG: chạy đúng một vòng đồng bộ (ẩn), không tự bịa ra prompt -------------------
const WORKER = ["ops/agent-watch.mjs", "--once", "--auto"];
let worker = null;
let lastRing = 0;

function ring(reason) {
  const now = Date.now();
  const since = now - lastRing;
  if (lastRing && since < GAP_MS) {
    log(`gộp nhịp (vừa rung ${Math.round(since / 1000)}s trước) — ${reason}`);
    return false;
  }
  if (worker) {
    log(`vòng trước còn đang chạy — bỏ qua — ${reason}`);
    return false;
  }
  lastRing = now;
  if (DRY) {
    log(`(chạy khô) sẽ chạy: node ${WORKER.join(" ")} — ${reason}`);
    return true;
  }
  if (NO_WAKE) {
    log(`(--no-wake) bỏ qua việc chạy worker — ${reason}`);
    return true;
  }
  try {
    worker = spawn(process.execPath, WORKER, { cwd: process.cwd(), stdio: "ignore", ...NO_WINDOW });
    log(`rung chuông: ${reason} → đồng bộ sổ (pid ${worker.pid})`);
    worker.on("exit", (code) => {
      log(`vòng đồng bộ xong (mã ${code})`);
      worker = null;
    });
    worker.on("error", (error) => {
      log(`vòng đồng bộ lỗi: ${String(error?.message ?? error)}`);
      worker = null;
    });
  } catch (error) {
    worker = null;
    log(`không chạy được vòng đồng bộ: ${String(error?.message ?? error)}`);
  }
  return true;
}

/** Xử lý một khung SSE (đã cắt theo dòng trống). Ta chỉ cần biết "có tin", không cần nội dung. */
function handleFrame(raw) {
  const data = raw
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) return; // comment (nhịp tim) hoặc khung rỗng
  let message = null;
  try {
    message = JSON.parse(data);
  } catch {
    /* không phải JSON thì vẫn coi là có tin */
  }
  if (message?.ok && message.agent && message.latest !== undefined) return; // khung hello
  const label = message
    ? `#${message.id ?? "?"} ${message.from ?? "?"}→${message.to ?? SELF} [${message.kind ?? "?"}] ${message.title ?? ""}`
    : "tin không rõ định dạng";
  ring(`có tin đẩy: ${label}`);
}

/**
 * Nối kênh đẩy và giữ nó. Trả về khi kết nối đứt (để vòng lặp ngoài nối lại).
 * `Accept-Encoding: identity` là cố ý: để không tầng nào (Caddy/Cloudflare) nén và đệm luồng.
 */
async function listen(bus, attempt) {
  const controller = new AbortController();
  let lastByte = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - lastByte > STALE_MS) {
      log(`im lặng ${Math.round((Date.now() - lastByte) / 1000)}s — coi như đứt, nối lại`);
      controller.abort();
    }
  }, Math.max(5000, Math.floor(STALE_MS / 3)));

  try {
    const url = `${bus.url}/subscribe?agent=${SELF.toLowerCase()}&host=${encodeURIComponent(os.hostname())}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${bus.token}`, Accept: "text/event-stream", "Accept-Encoding": "identity" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`connector trả ${response.status}`);
    log(`đã nối kênh đẩy (lần thử ${attempt}) — ${bus.url}`);
    // Nối được là đồng bộ một vòng: vớt tin gửi trong lúc máy tắt/chưa nối.
    ring("vừa nối kênh đẩy");
    if (ONCE) {
      log("(--once) nối được là đủ — thoát.");
      // PHẢI đóng kết nối: để ngỏ thì socket giữ event loop sống và tiến trình không bao giờ thoát
      // (đã gặp thật: `--once` treo tới lúc bị kill).
      controller.abort();
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      lastByte = Date.now();
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        handleFrame(frame);
      }
      if (buffer.length > 1024 * 1024) buffer = ""; // chống phình nếu bên kia gửi rác
    }
  } finally {
    clearInterval(watchdog);
    try {
      controller.abort();
    } catch {
      /* đã đóng rồi */
    }
  }
}

const bus = loadBusEnv();
if (!bus.url || !bus.token) {
  log("! chưa có AGENT_BUS_URL/AGENT_BUS_TOKEN (và không đọc được .env.bus) — không nghe được gì.");
  process.exit(1);
}

if (!ONCE) {
  const holder = claimLock();
  if (holder && !args.includes("--force")) {
    log(`đã có bộ nghe khác đang chạy (pid ${holder}) — thoát để không rung chuông trùng. (--force để chạy chồng)`);
    process.exit(0);
  }
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      releaseLock();
      process.exit(0);
    });
  }
  process.on("exit", releaseLock);
}

log(`nghe ${SELF} ← connector · nhịp an toàn ${SAFETY}s · gộp nhịp ${GAP_MS / 1000}s · ${DRY ? "CHẠY KHÔ" : "thật"}`);

// Nhịp an toàn: không thay thế kênh đẩy, chỉ để không bỏ sót nếu một tin không lên được bus.
if (!ONCE && SAFETY > 0) {
  setInterval(() => ring(`nhịp an toàn ${SAFETY}s`), SAFETY * 1000).unref?.();
}

let attempt = 0;
for (;;) {
  attempt += 1;
  try {
    await listen(bus, attempt);
    log("kênh đẩy đã đóng");
  } catch (error) {
    log(`kênh đẩy lỗi: ${String(error?.message ?? error).slice(0, 160)}`);
  }
  if (ONCE) break;
  // Nối lại có giãn cách: 2s, 4s, 8s… tối đa 60s, cộng chút ngẫu nhiên để hai máy không dồn nhịp.
  const wait = Math.min(60000, 2000 * 2 ** Math.min(attempt - 1, 5)) + Math.floor(Math.random() * 1000);
  log(`nối lại sau ${Math.round(wait / 1000)}s`);
  await new Promise((resolve) => setTimeout(resolve, wait));
}
