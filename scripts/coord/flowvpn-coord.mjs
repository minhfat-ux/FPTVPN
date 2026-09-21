#!/usr/bin/env node
/**
 * flowvpn-coord — bang viec dung chung cho cac agent (windows / mac / server).
 *
 * Vi sao: harness Windows, harness Mac va agent tren server cung sua mot repo; da co lan hai
 * ben dung cung file (scripts/tg-bot/bot.mjs) ma khong biet. Bang nay la nguon su that duy
 * nhat, dat tren node-2 (/var/lib/flowvpn-coord) de ca ba may doc/ghi qua SSH.
 *
 * Vi sao khong dung git lam noi luu: bang viec phai tuc thoi va khong sinh commit rac; mot
 * thu muc tren server la noi duy nhat, moi may deu doc duoc ngay sau khi may khac ghi.
 *
 * Moi claim la MOT file JSON rieng (<owner>-<area>.json) nen hai may ghi khong bao gio de len
 * nhau; ghi bang temp + rename nen khong doc phai file dang viet do.
 *
 * Lenh:
 *   flowvpn-coord list [--all] [--json]
 *   flowvpn-coord check <path...> [--owner <owner>]
 *   flowvpn-coord claim --owner <o> --area <a> --files <p1,p2> [--note <text>] [--ttl <phut>]
 *   flowvpn-coord release --owner <o> --area <a> [--status done|stale]
 *   flowvpn-coord selftest
 *
 * Exit code: 0 = on; 1 = check thay trung claim cua nguoi khac (DUNG LAI, bao orchestrator);
 *            2 = sai tham so.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";

const BOARD = process.env.COORD_DIR ?? "/var/lib/flowvpn-coord";
const CLAIMS_DIR = path.join(BOARD, "claims");
const TASKS_DIR = path.join(BOARD, "tasks");
const DEFAULT_TTL_MIN = Number(process.env.COORD_TTL_MIN || 90);
const OWNER_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;
const AREA_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

// ------------------------------------------------------------------ logic thuan (co selftest)
/** Claim con hieu luc tai thoi diem `now`. */
export function isActive(claim, now = Date.now()) {
  return claim?.status === "active" && Number(claim.expiresAt ?? 0) > now;
}

/** So phut con lai (am = da het han). */
export function minutesLeft(claim, now = Date.now()) {
  return Math.round((Number(claim?.expiresAt ?? 0) - now) / 60_000);
}

/**
 * Mot pattern trong claim co phu file nay khong.
 * Ho tro: duong dan chinh xac, thu muc (co/khong co `/` cuoi), va glob `*` don gian.
 */
export function matchPath(pattern, file) {
  const p = String(pattern ?? "").trim().replace(/^\.\//, "").replace(/\\/g, "/");
  const f = String(file ?? "").trim().replace(/^\.\//, "").replace(/\\/g, "/");
  if (!p || !f) return false;
  if (p === f) return true;
  const dir = p.endsWith("/") ? p : `${p}/`;
  if (f.startsWith(dir)) return true; // pattern la thu muc
  if (p.includes("*")) {
    const rx = new RegExp(`^${p.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
    if (rx.test(f)) return true;
  }
  return false;
}

/** Cac claim cua nguoi khac dang phu it nhat mot file trong danh sach. */
export function findConflicts(claims, files, owner, now = Date.now()) {
  return claims.filter(
    (c) => isActive(c, now) && c.owner !== owner && (c.files ?? []).some((p) => files.some((f) => matchPath(p, f))),
  );
}

/** Bang ke cho nguoi doc. */
export function formatBoard(claims, { now = Date.now(), all = false } = {}) {
  const active = claims.filter((c) => isActive(c, now));
  const shown = all ? claims : active;
  if (!shown.length) return "Bang viec trong: khong ai dang giu claim nao.";
  const sorted = [...shown].sort((a, b) => String(a.owner).localeCompare(String(b.owner)) || String(a.area).localeCompare(String(b.area)));
  const lines = sorted.map((c) => {
    const left = minutesLeft(c, now);
    const state = isActive(c, now) ? `con ${left}m` : `het han ${Math.abs(left)}m`;
    const files = (c.files ?? []).join(", ");
    return [
      `- [${c.owner}] ${c.area} (${state})`,
      `    files: ${files}`,
      c.note ? `    note : ${c.note}` : "",
      c.host ? `    may  : ${c.host}${c.branch ? ` @ ${c.branch}` : ""}` : "",
    ].filter(Boolean).join("\n");
  });
  const head = `Bang viec: ${active.length} claim dang hieu luc${all && claims.length !== active.length ? ` / ${claims.length} tong` : ""}`;
  return [head, ...lines].join("\n");
}

// ------------------------------------------------------------------------------ noi luu
function ensureBoard() {
  mkdirSync(CLAIMS_DIR, { recursive: true, mode: 0o700 });
}

function claimPath(owner, area) {
  return path.join(CLAIMS_DIR, `${owner}-${area}.json`);
}

function writeClaim(claim) {
  ensureBoard();
  const target = claimPath(claim.owner, claim.area);
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(claim, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, target); // rename la nguyen tu: khong ai doc duoc file nua voi
}

function readClaims() {
  ensureBoard();
  const out = [];
  for (const name of readdirSync(CLAIMS_DIR)) {
    if (!name.endsWith(".json")) continue;
    try {
      const claim = JSON.parse(readFileSync(path.join(CLAIMS_DIR, name), "utf8"));
      if (claim && claim.owner && claim.area) out.push(claim);
    } catch {
      /* file hong thi bo qua, khong lam sap bang */
    }
  }
  return out;
}

// ------------------------------------------------------------------------------- lenh
function requireOwner(value) {
  const owner = String(value ?? "").trim().toLowerCase();
  if (!OWNER_RE.test(owner)) throw new Error(`--owner phai khop ${OWNER_RE} (vi du: windows, mac, server)`);
  return owner;
}

function requireArea(value) {
  const area = String(value ?? "").trim().toLowerCase();
  if (!AREA_RE.test(area)) throw new Error(`--area phai khop ${AREA_RE} (vi du: tg-bot)`);
  return area;
}

function cmdClaim(values) {
  const owner = requireOwner(values.owner);
  const area = requireArea(values.area);
  const files = String(values.files ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!files.length) throw new Error("--files can it nhat mot duong dan (phan cach bang dau phay)");
  const ttl = Number(values.ttl ?? DEFAULT_TTL_MIN);
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error("--ttl phai la so phut > 0");

  // Canh bao (khong chan) neu claim nay de len claim dang hieu luc cua nguoi khac.
  const clashes = findConflicts(readClaims(), files, owner);
  const now = Date.now();
  const claim = {
    owner,
    area,
    files,
    note: String(values.note ?? "").trim(),
    host: String(values.host ?? process.env.COORD_HOST ?? "").trim(),
    branch: String(values.branch ?? "").trim(),
    status: "active",
    startedAt: now,
    updatedAt: now,
    expiresAt: now + ttl * 60_000,
  };
  writeClaim(claim);
  const head = `Da giu claim: [${owner}] ${area} — ${files.join(", ")} (het han sau ${ttl}m)`;
  if (!clashes.length) return head;
  return [
    head,
    "",
    "CANH BAO: claim nay de len claim dang hieu luc cua nguoi khac:",
    ...clashes.map((c) => `  - [${c.owner}] ${c.area}: ${(c.files ?? []).join(", ")}`),
    "Dung lai va bao orchestrator (harness Mac) truoc khi sua.",
  ].join("\n");
}

function cmdRelease(values) {
  const owner = requireOwner(values.owner);
  const area = requireArea(values.area);
  const status = String(values.status ?? "done");
  if (!["done", "stale", "cancelled"].includes(status)) throw new Error("--status chi nhan done | stale | cancelled");
  const file = claimPath(owner, area);
  if (!existsSync(file)) throw new Error(`khong thay claim [${owner}] ${area}`);
  const claim = JSON.parse(readFileSync(file, "utf8"));
  claim.status = status;
  claim.updatedAt = Date.now();
  claim.expiresAt = Date.now();
  writeClaim(claim);
  return `Da tra claim: [${owner}] ${area} -> ${status}`;
}

function cmdList(values) {
  const claims = readClaims();
  if (values.json) return JSON.stringify({ now: Date.now(), claims }, null, 2);
  return formatBoard(claims, { all: Boolean(values.all) });
}

function cmdCheck(values, files) {
  if (!files.length) throw new Error("check can it nhat mot duong dan");
  const owner = values.owner ? requireOwner(values.owner) : "";
  const clashes = findConflicts(readClaims(), files, owner);
  if (!clashes.length) return `OK: khong ai khac dang giu ${files.join(", ")}`;
  return [
    `XUNG DOT: ${files.join(", ")} nam trong claim dang hieu luc cua nguoi khac:`,
    ...clashes.map((c) => `  - [${c.owner}] ${c.area} (${minutesLeft(c)}m con lai): ${(c.files ?? []).join(", ")}${c.note ? ` — ${c.note}` : ""}`),
    "DUNG LAI, bao orchestrator (harness Mac) qua Telegram truoc khi sua.",
  ].join("\n");
}

function cmdSelftest() {
  const now = 1_000_000;
  const c = (over) => ({ owner: "mac", area: "a", files: ["x/y.js"], status: "active", expiresAt: now + 60_000, ...over });
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`selftest FAIL: ${msg}`);
  };
  assert(matchPath("scripts/tg-bot/bot.mjs", "scripts/tg-bot/bot.mjs"), "khop chinh xac");
  assert(matchPath("scripts/tg-bot", "scripts/tg-bot/bot.mjs"), "khop thu muc");
  assert(matchPath("scripts/tg-bot/", "scripts/tg-bot/bot.mjs"), "khop thu muc co /");
  assert(matchPath("scripts/*/bot.mjs", "scripts/tg-bot/bot.mjs"), "khop glob mot cap");
  assert(!matchPath("scripts/*/bot.mjs", "scripts/tg-bot/sub/bot.mjs"), "glob khong vuot cap");
  assert(!matchPath("scripts/tg-bot/bot.mjs", "scripts/tg-bot/other.mjs"), "khac file thi khong khop");
  assert(!matchPath("", "x"), "pattern rong");
  assert(isActive(c(), now), "claim con han la active");
  assert(!isActive(c({ expiresAt: now - 1 }), now), "claim het han thi khong active");
  assert(!isActive(c({ status: "done" }), now), "claim da xong thi khong active");
  assert(minutesLeft(c({ expiresAt: now + 120_000 }), now) === 2, "minutesLeft lam tron phut");
  const claims = [
    c({ owner: "mac", area: "b", files: ["scripts/tg-bot/bot.mjs"] }),
    c({ owner: "windows", area: "c", files: ["windows/app/x.cs"] }),
  ];
  assert(findConflicts(claims, ["scripts/tg-bot/bot.mjs"], "windows", now).length === 1, "thay claim cua nguoi khac");
  assert(findConflicts(claims, ["scripts/tg-bot/bot.mjs"], "mac", now).length === 0, "khong tu bao chinh minh");
  assert(findConflicts(claims, ["windows/app/x.cs"], "mac", now).length === 1, "thay claim o vung khac");
  assert(findConflicts(claims, ["docs/x.md"], "server", now).length === 0, "khong lien quan thi khong bao");
  assert(findConflicts([c({ expiresAt: now - 1 })], ["x/y.js"], "server", now).length === 0, "claim het han khong chan");
  const board = formatBoard([c({ note: "dang lam" })], { now });
  assert(board.includes("[mac] a") && board.includes("dang lam"), "formatBoard co owner + note");
  assert(formatBoard([], { now }).includes("trong"), "bang rong");
  return "selftest OK (18 assertion)";
}

// --------------------------------------------------------------------------------- main
// --------------------------------------------------------------------------- task (viec)
// Task do agent tren server (flowvpn-guard) tao ra khi phat hien KHACH BI TAC theo mau.
// Nguyen tac: task KHONG duoc thuc thi khi chua co approve cua chu du an (tren Telegram).
function ensureTasks() {
  mkdirSync(TASKS_DIR, { recursive: true, mode: 0o700 });
}

function taskPath(id) {
  const clean = String(id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(clean)) throw new Error(`id task khong hop le: ${clean}`);
  return path.join(TASKS_DIR, `${clean}.json`);
}

function readTask(id) {
  const file = taskPath(id);
  if (!existsSync(file)) throw new Error(`khong thay task ${id}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeTask(task) {
  ensureTasks();
  const target = taskPath(task.id);
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(task, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, target);
}

function readTasks() {
  ensureTasks();
  const out = [];
  for (const name of readdirSync(TASKS_DIR)) {
    if (!name.endsWith(".json")) continue;
    try {
      const t = JSON.parse(readFileSync(path.join(TASKS_DIR, name), "utf8"));
      if (t && t.id) out.push(t);
    } catch {
      /* task hong thi bo qua */
    }
  }
  return out.sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
}

function taskLine(t) {
  const customers = Array.isArray(t.customers) ? t.customers.length : 0;
  return `  ${String(t.id).padEnd(12)} ${String(t.status).padEnd(16)} owner=${String(t.owner ?? "?").padEnd(8)} ` +
    `${String(t.platform || "-").padEnd(8)} ${customers} khach · ${t.kind ?? ""}\n      ${t.evidence?.summary ?? ""}`;
}

function cmdTaskList(values) {
  const tasks = readTasks().filter((t) => values.all || t.status !== "done");
  if (values.json) return JSON.stringify(tasks, null, 2);
  if (!tasks.length) return "Khong co task nao.";
  const pending = tasks.filter((t) => t.status === "pending_approval");
  const head = `Task: ${tasks.length} (${pending.length} cho approve)`;
  return [head, ...tasks.map(taskLine)].join("\n");
}

function cmdTaskShow(id, values) {
  const t = readTask(id);
  return values.json ? JSON.stringify(t, null, 2) : [
    `Task ${t.id} · ${t.kind} · ${t.status}`,
    `  owner      : ${t.owner}`,
    `  platform   : ${t.platform || "-"}`,
    `  tao luc    : ${t.createdAt}`,
    t.approvedAt ? `  approve    : ${t.approvedAt} boi ${t.approvedBy ?? "?"}` : "",
    t.rejectedAt ? `  reject     : ${t.rejectedAt} — ${t.rejectReason ?? ""}` : "",
    `  bang chung : ${t.evidence?.summary ?? "-"}`,
    `  yeu cau    : ${t.requested_action ?? "-"}`,
    `  khach      : ${(t.customers ?? []).map((c) => c.email).join(", ")}`,
  ].filter(Boolean).join("\n");
}

function cmdTaskApprove(id, values) {
  const t = readTask(id);
  if (t.status === "approved" || t.status === "in_progress") return `Task ${t.id} da duoc approve truoc do (${t.approvedAt}).`;
  t.status = "approved";
  t.approvedAt = new Date().toISOString();
  t.approvedBy = String(values.by ?? "telegram").trim() || "telegram";
  writeTask(t);
  return `DA APPROVE task ${t.id} (owner ${t.owner}) — agent ${t.owner} co the bat dau sua.\n${cmdTaskShow(id, {})}`;
}

function cmdTaskReject(id, values) {
  const t = readTask(id);
  t.status = "rejected";
  t.rejectedAt = new Date().toISOString();
  t.rejectReason = String(values.reason ?? "khong co ly do").trim();
  t.rejectedBy = String(values.by ?? "telegram").trim() || "telegram";
  writeTask(t);
  return `DA REJECT task ${t.id}: ${t.rejectReason}`;
}

function cmdTaskClaim(id, values) {
  const t = readTask(id);
  if (t.status === "pending_approval") throw new Error(`task ${t.id} chua duoc chu du an approve — khong duoc lam`);
  if (t.status === "rejected") throw new Error(`task ${t.id} da bi reject — khong duoc lam`);
  t.status = "in_progress";
  t.claimedBy = requireOwner(values.owner);
  t.claimedAt = new Date().toISOString();
  writeTask(t);
  return `Task ${t.id} -> in_progress (owner ${t.claimedBy})`;
}

function cmdTaskDone(id, values) {
  const t = readTask(id);
  t.status = "done";
  t.doneAt = new Date().toISOString();
  t.doneNote = String(values.note ?? "").trim();
  writeTask(t);
  return `Task ${t.id} -> done${t.doneNote ? ` (${t.doneNote})` : ""}`;
}

const USAGE = `flowvpn-coord — bang viec dung chung cho cac agent

  flowvpn-coord list [--all] [--json]
  flowvpn-coord check <path...> [--owner <owner>]
  flowvpn-coord claim --owner <o> --area <a> --files <p1,p2> [--note <text>] [--ttl <phut>]
  flowvpn-coord release --owner <o> --area <a> [--status done|stale|cancelled]
  flowvpn-coord task list [--all] [--json]
  flowvpn-coord task show|approve|reject|claim|done <id> [--by <ten>] [--reason <text>] [--owner <o>] [--note <text>]
  flowvpn-coord selftest

Noi luu: ${CLAIMS_DIR} (COORD_DIR de doi).`;

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "list";
  const rest = command === "list" && argv[0]?.startsWith("-") ? argv : argv.slice(1);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      owner: { type: "string" },
      area: { type: "string" },
      files: { type: "string" },
      note: { type: "string" },
      ttl: { type: "string" },
      host: { type: "string" },
      branch: { type: "string" },
      status: { type: "string" },
      by: { type: "string" },
      reason: { type: "string" },
      all: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || command === "help") return USAGE;
  // Chi `check` moi nhan duong dan tu do. Cac lenh khac nhan tham so roi thi phai bao loi:
  // neu im lang bo qua, mot --note bi shell cat tai dau cach se am tham ghi sai bang viec.
  if (positionals.length && command !== "check" && command !== "task") {
    process.stderr.write(`flowvpn-coord: lenh ${command} khong nhan tham so tu do: ${positionals.join(" ")}\n(tham so co dau cach phai duoc quote)\n`);
    process.exit(2);
  }
  switch (command) {
    case "list": return cmdList(values);
    case "check": return cmdCheck(values, positionals);
    case "claim": return cmdClaim(values);
    case "release": return cmdRelease(values);
    case "task": {
      const [sub, id] = positionals;
      if (sub === "add") throw new Error(`task add do flowvpn-guard ghi truc tiep vao ${TASKS_DIR}`);
      if (!sub || sub === "list") return cmdTaskList(values);
      if (!id) throw new Error(`thieu id task: flowvpn-coord task ${sub} <id>`);
      switch (sub) {
        case "show": return cmdTaskShow(id, values);
        case "approve": return cmdTaskApprove(id, values);
        case "reject": return cmdTaskReject(id, values);
        case "claim": return cmdTaskClaim(id, values);
        case "done": return cmdTaskDone(id, values);
        default: throw new Error(`task ${sub} khong ho tro (list|show|approve|reject|claim|done)`);
      }
    }
    case "selftest": return cmdSelftest();
    default:
      process.stderr.write(`lenh la khong biet: ${command}\n\n${USAGE}\n`);
      process.exit(2);
  }
  return "";
}

// Chi chay khi duoc goi truc tiep: nho vay file nay con import duoc tu test ma khong chay CLI.
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const out = main();
    if (out) process.stdout.write(`${out}\n`);
    // check la lenh duy nhat co the "that bai" theo nghiep vu
    if (process.argv[2] === "check" && out.startsWith("XUNG DOT")) process.exit(1);
  } catch (err) {
    process.stderr.write(`flowvpn-coord: ${err?.message ?? err}\n`);
    process.exit(2);
  }
}
