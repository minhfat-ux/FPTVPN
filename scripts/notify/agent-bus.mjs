#!/usr/bin/env node
/**
 * agent-bus.mjs — client cho connector "agent bus" trên VPS (Mac dựng 18/09, /opt/agent-bus).
 *
 * Vì sao dùng cái này thay cho poller-qua-SSH: VPS không gọi VÀO được máy Windows (client VPN
 * một chiều), nhưng Windows gọi RA thì được. Bus là HTTP nhỏ: có id tăng dần, lưu JSONL bền,
 * có `presence` (phân biệt "đã gửi" với "đã có người nhận") và **mỗi lần push tự alert Telegram**.
 *
 *   node scripts/notify/agent-bus.mjs push --to mac --kind ack  --title "đã nhận việc X" --ref <file>
 *   node scripts/notify/agent-bus.mjs push --to mac --kind status --title "✅ XONG X" --body "bằng chứng…"
 *   node scripts/notify/agent-bus.mjs pull            # việc mới gửi cho máy này (tự lưu mốc id)
 *   node scripts/notify/agent-bus.mjs pull --peek     # xem mà không nhích mốc
 *   node scripts/notify/agent-bus.mjs presence        # máy nào đang thực sự poll
 *
 * Token: $AGENT_BUS_TOKEN → ~/.agent-bus.env → .env.agent-bus (repo, đã gitignore) → /etc/agent-bus.env.
 * KHÔNG in token. URL: $AGENT_BUS_URL, mặc định https://fbuddy.meetflowai.site/agent-bus
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = (process.env.AGENT_BUS_URL || "https://fbuddy.meetflowai.site/agent-bus").replace(/\/+$/, "");
const STATE = process.env.AGENT_BUS_STATE || path.join(os.homedir(), ".flowvpn-inbox", "agent-bus.json");
const ME = process.env.AGENT_BUS_ME || process.env.FPT_OWNER || "windows";
const WIRE = { windows: "win", win: "win", mac: "mac", server: "server" };
const wire = (name) => WIRE[String(name).toLowerCase()] || String(name).toLowerCase();

function readToken() {
  if (process.env.AGENT_BUS_TOKEN) return process.env.AGENT_BUS_TOKEN.trim();
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const files = [
    path.join(os.homedir(), ".agent-bus.env"),
    path.resolve(here, "..", "..", ".env.agent-bus"),
    "/etc/agent-bus.env",
  ];
  for (const file of files) {
    try {
      const m = /^AGENT_BUS_TOKEN=(.*)$/m.exec(fs.readFileSync(file, "utf8"));
      if (m) {
        const value = m[1].trim().replace(/^["']|["']$/g, "");
        if (value) return value;
      }
    } catch {
      /* thử file kế tiếp */
    }
  }
  console.error("Thiếu AGENT_BUS_TOKEN (đặt env, hoặc ~/.agent-bus.env, hoặc .env.agent-bus)");
  process.exit(2);
}

const token = readToken();

async function call(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`bus lỗi ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    process.exit(1);
  }
  return json;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(next) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(next, null, 1));
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, fallback = "") => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

if (cmd === "push") {
  const to = flag("to", "mac");
  const title = flag("title");
  if (!title) {
    console.error('Thiếu --title. Ví dụ: push --to mac --kind ack --title "đã nhận việc X"');
    process.exit(2);
  }
  const out = await call("/push", {
    method: "POST",
    body: {
      to: wire(to),
      from: wire(flag("from", ME)),
      kind: flag("kind", "notify"),
      title,
      body: flag("body"),
      ref: flag("ref") || undefined,
    },
  });
  console.log(`đã gửi #${out.message.id} → ${out.message.to} (${out.message.kind}) · Telegram đã alert`);
} else if (cmd === "pull") {
  const agent = wire(flag("agent", ME));
  const state = readState();
  const since = Number(flag("since", state[agent] ?? 0)) || 0;
  const out = await call(`/pull?agent=${encodeURIComponent(agent)}&since=${since}`);
  const items = out.messages ?? [];
  if (!items.length) {
    console.log(`không có việc mới (agent=${agent}, since=${since}, latest=${out.latest})`);
  } else {
    for (const m of items) {
      console.log(`#${m.id} ${m.at} ${m.from}→${m.to} [${m.kind}] ${m.title}`);
      if (m.body) console.log(`    ${m.body.replace(/\n/g, "\n    ").slice(0, 800)}`);
      if (m.ref) console.log(`    ref: ${m.ref}`);
    }
  }
  if (!argv.includes("--peek")) {
    writeState({ ...state, [agent]: out.latest ?? since });
    console.log(`(mốc đã lưu: ${out.latest ?? since} → ${STATE})`);
  }
} else if (cmd === "presence") {
  const out = await call("/presence");
  if (!out.agents?.length) console.log("chưa máy nào poll");
  for (const a of out.agents ?? []) {
    console.log(`${a.agent}: ${a.secondsAgo}s trước, ip ${a.ip}, mốc ${a.lastSince}, ${a.messages} tin`);
  }
} else if (cmd === "health") {
  console.log(JSON.stringify(await call("/health")));
} else {
  console.error('Dùng: agent-bus.mjs push --to mac --title "…" [--kind ack|status|notify] [--body …] [--ref …]');
  console.error("      agent-bus.mjs pull [--agent win] [--peek] | presence | health");
  process.exit(2);
}
