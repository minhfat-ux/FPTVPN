#!/usr/bin/env node
/**
 * mac-selfdefense — cơ chế tự bảo vệ cho máy Mac của chủ dự án.
 *
 * Mục tiêu (chủ dự án chốt 22/09/2026): nếu lỡ cho phép thứ gì đó chạy mà có nghi vấn,
 * agent phải TỰ KHOÁ + CÁCH LY nó và BẮN TELEGRAM NGAY, không chờ người phát hiện.
 *
 * Phạm vi phát hiện (không cần root, không cần entitlement EndpointSecurity):
 *   1. persistence  — file mới/sửa trong LaunchAgents/LaunchDaemons (LaunchAgent dropper là
 *                     đúng thứ đã gặp ngày 24/08/2026 trên máy này).
 *   2. process      — tiến trình chạy binary từ Desktop/Downloads/tmp hoặc khớp IOC,
 *                     hoặc có dấu hiệu dropper `curl ... | bash`.
 *   3. tcc          — bản ghi mới trong TCC.db cho các quyền nhạy cảm (Accessibility,
 *                     Screen Recording, Full Disk Access, ...).
 *   4. quarantine   — file thực thi vừa bị gắn cờ cách ly (dấu hiệu vừa tải về).
 *
 * Chế độ: enforce (khoá thật) | alert (chỉ báo) | dry-run (chỉ ghi log).
 *
 * Chạy:
 *   node selfdefense.mjs run                 # daemon (LaunchAgent gọi cái này)
 *   node selfdefense.mjs once                # 1 vòng, in tóm tắt
 *   node selfdefense.mjs status              # trạng thái + heartbeat
 *   node selfdefense.mjs lock <path>         # khoá + cách ly thủ công
 *   node selfdefense.mjs test-alert          # thử kênh Telegram
 *   node selfdefense.mjs watchdog            # báo động nếu daemon đã chết
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  Deduper,
  keyOf,
  readTelegramCreds,
  sendTelegram,
  redact,
} from "./lib/notify.mjs";
import {
  bootout,
  defaultVault,
  hashTree,
  incidentDir,
  killProcess,
  moveToVault,
  neutralize,
  writeManifest,
} from "./lib/quarantine.mjs";
import {
  DEFAULT_ALLOW_PREFIXES,
  DEFAULT_SUSPICIOUS_PREFIXES,
  ancestorPids,
  classifyPersistence,
  classifyProcess,
  diffSnapshot,
  expandHome,
  isAllowlisted,
  isSuspiciousPath,
  listProcesses,
  matchesIocs,
  readTccFromLog,
  readTccRows,
  SENSITIVE_TCC_SERVICES,
  snapshotDirs,
} from "./lib/detect.mjs";

const SELF_FILE = fileURLToPath(import.meta.url);
export const SELF_DIR = path.dirname(SELF_FILE);
export const HOME = os.homedir();

export const STATE_DIR =
  process.env.SELFDEFENSE_STATE ?? path.join(HOME, ".local", "state", "mac-selfdefense");
const CONFIG_FILE =
  process.env.SELFDEFENSE_CONFIG ?? path.join(HOME, ".config", "mac-selfdefense", "config.json");
const IOC_FILE = path.join(SELF_DIR, "iocs.json");
const LOG_FILE = path.join(STATE_DIR, "selfdefense.log");
const HEARTBEAT_FILE = path.join(STATE_DIR, "heartbeat.json");
const DEDUP_FILE = path.join(STATE_DIR, "dedup.json");
// Snapshot bền trên đĩa: nếu chỉ giữ trong RAM thì mỗi lần daemon restart lại coi
// baseline là "sạch", và mã độc đáp xuống trong lúc daemon tắt sẽ được bỏ qua.
const SNAPSHOT_FILE = path.join(STATE_DIR, "snapshot.json");
const LOG_MAX_BYTES = 5 * 1024 * 1024;

export const DEFAULT_CONFIG = {
  mode: "enforce",
  pollMs: 5000,
  vault: null,
  watchDirs: ["~/Library/LaunchAgents", "/Library/LaunchAgents", "/Library/LaunchDaemons"],
  suspiciousPathPrefixes: DEFAULT_SUSPICIOUS_PREFIXES,
  allow: { pathPrefixes: DEFAULT_ALLOW_PREFIXES, labels: ["com.apple.", "site.meetflowai."] },
  // everyMs tách khỏi pollMs: `log show` khá nặng, không thể chạy mỗi 5 giây.
  tcc: { enabled: true, sensitiveOnly: true, source: "auto", everyMs: 60000 },
  // transport: "auto" = thử trực tiếp api.telegram.org, thất bại thì relay qua SSH tới VPS.
  // Máy Mac này KHÔNG tới được Telegram trực tiếp (đo 22/09/2026) nên thực tế sẽ dùng relay.
  notify: { transport: "auto", relayHost: null, relayKey: null },
  protectSelf: true,
};

export function loadConfig(file = CONFIG_FILE) {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* dùng mặc định */
  }
  const merged = {
    ...DEFAULT_CONFIG,
    ...user,
    allow: { ...DEFAULT_CONFIG.allow, ...(user.allow ?? {}) },
    tcc: { ...DEFAULT_CONFIG.tcc, ...(user.tcc ?? {}) },
    notify: { ...DEFAULT_CONFIG.notify, ...(user.notify ?? {}) },
  };
  // Cho ph00e9p ghi 011100e8 b1eb1ng bi1ebfn m00f4i tr01b01eddng 2014 d00f9ng khi ch1ea1y th1eed m00e0 kh00f4ng mu1ed1n s1eeda file c1ea5u h00ecnh.
  if (process.env.SELFDEFENSE_MODE) merged.mode = process.env.SELFDEFENSE_MODE;
  if (process.env.SELFDEFENSE_VAULT) merged.vault = process.env.SELFDEFENSE_VAULT;
  return merged;
}

export function loadIocs(file = IOC_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/** Đường dẫn này có thuộc chính mac-selfdefense không? (tự bảo vệ) */
export function isSelf(target) {
  const t = path.resolve(expandHome(String(target)));
  return t === SELF_DIR || t.startsWith(`${SELF_DIR}${path.sep}`);
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
}

function nowIso() {
  return new Date().toISOString();
}

export class SelfDefense {
  constructor({ cfg = loadConfig(), iocs = loadIocs(), logger = console } = {}) {
    this.cfg = cfg;
    this.iocs = iocs;
    this.logger = logger;
    ensureStateDir();
    this.vault = cfg.vault ?? defaultVault();
    this.deduper = new Deduper(DEDUP_FILE, 10 * 60 * 1000);
    this.creds = readTelegramCreds();
    this.prevSnapshot = this.loadSnapshot();
    this.tickCount = 0;
    this.incidents = [];
    this.lastTccSeen = Math.floor(Date.now() / 1000);
    this.lastTccAt = 0;
    this.tccDbDenied = false;
    this.seenTccMsgIds = new Set();
    this.tccVia = null;
    this.tccLogged = false;
    this.stopped = false;
  }

  log(obj) {
    const row = { ts: nowIso(), ...obj };
    const line = JSON.stringify(row);
    if (this.logger === console) process.stdout.write(`${line}\n`);
    else this.logger(line);
    try {
      if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) {
        fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
      }
      fs.appendFileSync(LOG_FILE, `${line}\n`);
    } catch {
      /* không chặn vì lỗi ghi log */
    }
  }

  heartbeat(extra = {}) {
    try {
      fs.writeFileSync(
        HEARTBEAT_FILE,
        JSON.stringify({ ts: nowIso(), pid: process.pid, tick: this.tickCount, ...extra }, null, 2),
      );
    } catch {
      /* bỏ qua */
    }
  }

  loadSnapshot() {
    try {
      const rows = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
      return new Map(rows.map(([p, m]) => [p, m]));
    } catch {
      return null;
    }
  }

  saveSnapshot(snap) {
    try {
      fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify([...snap]));
    } catch {
      /* không chặn */
    }
  }

  async alert(text, { key = keyOf(text) } = {}) {
    if (!this.deduper.shouldSend(key)) {
      this.log({ level: "info", event: "alert-suppressed", key });
      return { ok: false, suppressed: true };
    }
    const res = await sendTelegram(text, {
      creds: this.creds,
      transport: this.cfg.notify?.transport ?? "auto",
      relayHost: this.cfg.notify?.relayHost ?? undefined,
      relayKey: this.cfg.notify?.relayKey ?? undefined,
    });
    this.log({ level: res.ok ? "info" : "warn", event: "alert", ok: res.ok, error: res.error });
    return res;
  }

  /**
   * Hành động trung tâm. Chỉ gọi khi đã có tín hiệu cứng (trừ `force`).
   */
  async act({ kind, target, label = null, pid = null, reasons = [], severity = "hard" }) {
    const dry = this.cfg.mode === "dry-run" || this.cfg.mode === "alert";
    const record = {
      ts: nowIso(),
      kind,
      target,
      label,
      pid,
      severity,
      reasons,
      mode: this.cfg.mode,
      actions: [],
    };

    if (this.cfg.protectSelf && target && isSelf(target)) {
      record.actions.push("BỎ QUA: đích nằm trong chính mac-selfdefense (tự bảo vệ)");
      this.log({ level: "warn", event: "act-refused-self", ...record });
      return record;
    }

    const header = [
      severity === "hard" ? "🚨 MAC-SELFDEFENSE — KHOÁ & CÁCH LY" : "⚠️ MAC-SELFDEFENSE — cảnh báo",
      `Máy: ${os.hostname()}`,
      `Loại: ${kind}`,
      target ? `Đích: ${target}` : null,
      label ? `Label: ${label}` : null,
      pid ? `PID: ${pid}` : null,
      `Lý do: ${reasons.join(" | ")}`,
      `Chế độ: ${this.cfg.mode}${dry && this.cfg.mode !== "dry-run" ? " (không khoá)" : ""}`,
    ].filter(Boolean);

    // 1) Kill tiến trình trước — nếu không, file bị cách ly vẫn đang chạy trong RAM.
    if (pid && !dry) {
      const killed = killProcess(pid);
      record.actions.push(`kill pid=${pid} term=${killed.term} kill=${killed.kill}`);
    }

    // 2) Gỡ persistence khỏi launchd trước khi dời file.
    if (label && !dry) {
      record.actions.push(`bootout ${label}: ${bootout(label)}`);
    }

    // 3) Vô hiệu hoá tại chỗ + dời vào vault.
    if (target && fs.existsSync(target)) {
      if (dry) {
        record.actions.push("dry-run: bỏ qua neutralize + move");
      } else {
        const n = neutralize(target);
        record.actions.push(`neutralize chmod=${n.chmod} xattr=${n.xattr} renamed=${n.renamed.length}`);

        const dest = incidentDir(this.vault, label ?? path.basename(target));
        const mv = moveToVault(target, dest);
        record.actions.push(`move → ${mv.moved} verified=${mv.verified} files=${mv.manifest.length}`);
        if (mv.manifest.length) {
          const mf = writeManifest(dest, mv.manifest);
          record.actions.push(`manifest ${path.basename(mf)}`);
        }
      }
    }

    header.push("Hành động:", ...record.actions.map((a) => `• ${a}`));
    record.alert = await this.alert(header.join("\n"), { key: keyOf(`${kind}:${target}:${label}:${pid}`) });

    try {
      const incFile = path.join(STATE_DIR, "incidents.jsonl");
      fs.appendFileSync(incFile, `${JSON.stringify(record)}\n`);
    } catch {
      /* bỏ qua */
    }
    this.incidents.push(record);
    this.log({ level: "warn", event: "act", ...record });
    return record;
  }

  /** Watcher 1 — persistence. */
  async checkPersistence() {
    const dirs = this.cfg.watchDirs.map((d) => expandHome(d));
    const snap = snapshotDirs(dirs);
    // Lần chạy đầu (hoặc sau khi daemon bị tắt) coi MỌI file hiện có là "mới" để soi hết,
    // thay vì im lặng nhận chúng làm baseline sạch.
    const firstRun = this.prevSnapshot === null;
    const prev = this.prevSnapshot ?? new Map();
    const changed = diffSnapshot(prev, snap);
    const plistChanged = changed.filter((c) => c.path.endsWith(".plist"));
    this.prevSnapshot = snap;
    this.saveSnapshot(snap);
    if (firstRun) this.log({ level: "info", event: "baseline", files: snap.size });

    const acted = [];
    for (const c of plistChanged) {
      if (c.path.includes(".tmp")) continue;
      let text = "";
      try {
        text = fs.readFileSync(c.path, "utf8");
      } catch {
        continue;
      }
      const { severity, reasons, parsed } = classifyPersistence(c.path, text, this.cfg, this.iocs);
      if (!severity) continue;
      // Tín hiệu MỀM thì KHÔNG BAO GIỜ khoá, ở mọi chế độ: chỉ báo để người tự soi.
      // (Bản trước chỉ chặn khi mode=enforce, nên ở dry-run nó rơi xuống act() — gây báo cáo sai.)
      if (severity === "medium") {
        await this.alert(
          `⚠️ MAC-SELFDEFENSE — persistence mới cần soi tay\n${c.path}\nLabel: ${parsed.Label}\nLý do: ${reasons.join(" | ")}`,
        );
        continue;
      }
      acted.push(
        await this.act({
          kind: "persistence",
          target: c.path,
          label: parsed.Label,
          reasons: [`${c.kind}`, ...reasons],
          severity,
        }),
      );
    }
    for (const c of changed) {
      if (!c.path.endsWith(".plist")) this.log({ level: "info", event: "fs-change", path: c.path, kind: c.kind });
    }
    return acted;
  }

  /** Watcher 2 — tiến trình (chỉ soi đường dẫn file thực thi). */
  async checkProcesses() {
    const procs = listProcesses();
    const ancestors = ancestorPids(procs, process.pid);
    const acted = [];
    for (const p of procs) {
      if (p.uid !== process.getuid()) continue; // không kill được tiến trình của user khác
      const { severity, reasons } = classifyProcess(p, this.cfg, this.iocs, process.pid, ancestors);
      if (severity !== "hard") continue;
      acted.push(
        await this.act({
          kind: "process",
          target: p.argv0.startsWith("/") ? p.argv0 : null,
          pid: p.pid,
          reasons: [`pid ${p.pid}: ${p.command.slice(0, 200)}`, ...reasons],
        }),
      );
    }
    return acted;
  }

  /**
   * Watcher 3 — quyền nhạy cảm vừa được yêu cầu/cấp.
   *
   * Hai nguồn. Ưu tiên TCC.db vì có auth_value/auth_reason (biết người dùng ĐÃ bấm cho
   * phép hay chưa). Nhưng bản chạy qua LaunchAgent KHÔNG có Full Disk Access, nên thực tế
   * sẽ lùi về `log show` — đã kiểm chứng vẫn trả về service + identifier + binary_path.
   */
  async checkTcc() {
    if (!this.cfg.tcc?.enabled) return [];

    // Throttle: chỉ soi TCC theo chu kỳ riêng, không theo mỗi vòng poll.
    const everyMs = this.cfg.tcc?.everyMs ?? 60000;
    if (Date.now() - this.lastTccAt < everyMs) return [];
    this.lastTccAt = Date.now();

    const want = this.cfg.tcc?.source ?? "auto";
    let rows = [];
    let via = null;

    if ((want === "auto" || want === "db") && !this.tccDbDenied) {
      const db = readTccRows({ sinceUnix: this.lastTccSeen });
      if (db.ok) {
        via = "db";
        for (const r of db.rows) {
          this.lastTccSeen = Math.max(this.lastTccSeen, Number(r.last_modified) || 0);
          rows.push({
            service: String(r.service),
            client: String(r.client),
            binaryPath: null,
            ts: new Date(Number(r.last_modified) * 1000).toISOString(),
            detail: `auth_value=${r.auth_value} auth_reason=${r.auth_reason}`,
          });
        }
      } else {
        // Thiếu Full Disk Access là trạng thái thường trực của LaunchAgent, không phải sự cố
        // tạm thời: ghi nhận MỘT lần rồi chuyển hẳn sang nguồn `log`.
        this.tccDbDenied = true;
        this.log({ level: "info", event: "tcc-db-denied", fallback: "log", error: redact(db.error, this.creds) });
        if (want === "db") return [];
      }
    }

    if (via === null) {
      const lg = readTccFromLog({
        lastSeconds: Math.ceil(everyMs / 1000) + 30,
      });
      if (!lg.ok) {
        if (!this.tccLogged) {
          this.log({ level: "warn", event: "tcc-unavailable", error: redact(lg.error ?? "không rõ", this.creds) });
          this.tccLogged = true;
        }
        return [];
      }
      via = "log";
      for (const r of lg.rows) {
        if (this.seenTccMsgIds.has(r.msgId)) continue;
        this.seenTccMsgIds.add(r.msgId);
        rows.push({
          service: r.service,
          client: r.identifier || r.binaryPath,
          binaryPath: r.binaryPath,
          ts: r.ts,
          detail: `preflight=${r.preflight} pid=${r.pid}`,
        });
      }
      if (this.seenTccMsgIds.size > 800) {
        this.seenTccMsgIds = new Set([...this.seenTccMsgIds].slice(-300));
      }
    }

    if (via !== this.tccVia) {
      this.tccVia = via;
      this.log({ level: "info", event: "tcc-source", via });
    }

    const acted = [];
    for (const row of rows) {
      if (this.cfg.tcc.sensitiveOnly !== false && !SENSITIVE_TCC_SERVICES.has(row.service)) continue;

      const target = row.binaryPath || row.client;
      // Khớp IOC được xét TRƯỚC allowlist: mã độc nằm trong /Applications vẫn phải bắt.
      const iocHits = matchesIocs(`${row.client} ${row.binaryPath ?? ""}`, this.iocs);
      if (!iocHits.length && isAllowlisted(target, this.cfg)) continue; // nhiễu hệ thống Apple

      const suspicious = iocHits.length > 0 || isSuspiciousPath(target, this.cfg);
      const msg =
        `\u26a0\ufe0f MAC-SELFDEFENSE \u2014 quy\u1ec1n nh\u1ea1y c\u1ea3m v\u1eeba \u0111\u01b0\u1ee3c y\u00eau c\u1ea7u/c\u1ea5p\n` +
        `D\u1ecbch v\u1ee5: ${row.service}\nClient: ${row.client}\n` +
        (row.binaryPath && row.binaryPath !== row.client ? `Binary: ${row.binaryPath}\n` : "") +
        `L\u00fac: ${row.ts} (ngu\u1ed3n: ${via})\n${row.detail}\n` +
        (iocHits.length
          ? `IOC: ${iocHits.join(", ")}`
          : "Kh\u00f4ng kh\u1edbp IOC \u2014 ki\u1ec3m tra xem anh c\u00f3 ch\u1ee7 \u0111\u1ed9ng cho ph\u00e9p kh\u00f4ng.");

      if (!suspicious) {
        await this.alert(msg);
        continue;
      }
      acted.push(
        await this.act({
          kind: "tcc-grant",
          target,
          reasons: [`${row.service} cho ${row.client}`, ...iocHits],
        }),
      );
    }
    return acted;
  }

  async tick() {
    this.tickCount += 1;
    const acted = [];
    acted.push(...(await this.checkPersistence()));
    acted.push(...(await this.checkProcesses()));
    acted.push(...(await this.checkTcc()));
    this.heartbeat({ incidents: this.incidents.length });
    return acted;
  }

  async run() {
    this.log({
      level: "info",
      event: "start",
      mode: this.cfg.mode,
      pollMs: this.cfg.pollMs,
      vault: this.vault,
      telegram: this.creds ? "có" : "THIẾU cấu hình",
      pid: process.pid,
    });
    if (this.creds) {
      await this.alert(
        `🛡️ MAC-SELFDEFENSE đã BẬT\nMáy: ${os.hostname()}\nChế độ: ${this.cfg.mode}\nVault: ${this.vault}\nChu kỳ: ${this.cfg.pollMs}ms`,
        { key: `boot:${Date.now()}` },
      );
    }
    const stop = () => {
      this.stopped = true;
      this.log({ level: "info", event: "stop" });
      process.exit(0);
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);

    while (!this.stopped) {
      try {
        await this.tick();
      } catch (err) {
        this.log({ level: "error", event: "tick-failed", error: redact(err?.message ?? err, this.creds) });
      }
      await new Promise((r) => setTimeout(r, this.cfg.pollMs));
    }
  }
}

/** Báo động nếu daemon đã chết (heartbeat cũ hơn 3 chu kỳ + 60s). */
export async function watchdog(cfg = loadConfig()) {
  ensureStateDir();
  const creds = readTelegramCreds();
  let hb = null;
  try {
    hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, "utf8"));
  } catch {
    /* chưa từng chạy */
  }
  const staleAfter = Math.max(cfg.pollMs * 3, 60000) + 60000;
  const age = hb ? Date.now() - Date.parse(hb.ts) : Infinity;
  if (age <= staleAfter) return { ok: true, ageMs: age };

  const msg =
    `🔴 MAC-SELFDEFENSE KHÔNG CHẠY\nMáy: ${os.hostname()}\n` +
    (hb ? `Heartbeat cuối: ${hb.ts} (cách ${Math.round(age / 1000)}s)` : "Chưa có heartbeat nào.") +
    `\nCần: launchctl kickstart -k gui/$(id -u)/site.meetflowai.mac-selfdefense`;
  const res = await sendTelegram(msg, { creds });
  return { ok: false, ageMs: age, alerted: res.ok };
}

// ------------------------------- CLI -------------------------------
function usage() {
  process.stdout.write(
    [
      "mac-selfdefense — tự bảo vệ máy Mac",
      "",
      "  run                 chạy daemon (do LaunchAgent gọi)",
      "  once                chạy 1 vòng rồi thoát",
      "  status              in cấu hình + heartbeat + số sự cố",
      "  lock <path>         khoá + cách ly thủ công một đường dẫn",
      "  test-alert          gửi thử 1 tin Telegram",
      "  watchdog            báo động nếu daemon đã chết",
      "",
      `Cấu hình: ${CONFIG_FILE}`,
      `Trạng thái: ${STATE_DIR}`,
      "",
    ].join("\n"),
  );
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const cfg = loadConfig();
  const sd = new SelfDefense({ cfg });

  switch (cmd) {
    case "run":
      await sd.run();
      return;
    case "once": {
      const acted = await sd.tick();
      sd.log({ level: "info", event: "once-done", acted: acted.length });
      process.stdout.write(`1 vòng xong: ${acted.length} hành động, ${sd.prevSnapshot?.size ?? 0} file theo dõi\n`);
      return;
    }
    case "status": {
      let hb = null;
      try {
        hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, "utf8"));
      } catch {
        /* chưa chạy */
      }
      process.stdout.write(
        JSON.stringify(
          {
            mode: cfg.mode,
            vault: sd.vault,
            telegram: sd.creds ? "đã cấu hình" : "THIẾU",
            watchDirs: cfg.watchDirs,
            heartbeat: hb,
            stateDir: STATE_DIR,
            iocs: Object.fromEntries(
              Object.entries(sd.iocs).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
            ),
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }
    case "lock": {
      const target = rest[0];
      if (!target) {
        process.stderr.write("thiếu đường dẫn\n");
        process.exitCode = 2;
        return;
      }
      const rec = await sd.act({
        kind: "manual",
        target: path.resolve(expandHome(target)),
        reasons: ["khoá thủ công theo yêu cầu chủ dự án"],
      });
      process.stdout.write(`${JSON.stringify(rec, null, 2)}\n`);
      return;
    }
    case "test-alert": {
      const res = await sd.alert(`🧪 MAC-SELFDEFENSE — tin thử lúc ${nowIso()} từ ${os.hostname()}` + `\nNếu anh nhận được tin này thì kênh alert đã THÔNG.`, {
        key: `test:${Date.now()}`,
      });
      process.stdout.write(`${JSON.stringify(res)}\n`);
      return;
    }
    case "watchdog": {
      const res = await watchdog(cfg);
      process.stdout.write(`${JSON.stringify(res)}\n`);
      return;
    }
    default:
      usage();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF_FILE)) {
  main().catch((err) => {
    process.stderr.write(`mac-selfdefense lỗi: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
