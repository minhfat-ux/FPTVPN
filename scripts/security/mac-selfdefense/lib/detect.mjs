/**
 * Các bộ phát hiện (detector) của mac-selfdefense.
 *
 * Triết lý: chỉ AUTO-LOCK khi có tín hiệu CỨNG. Tín hiệu mềm chỉ báo động.
 * Lý do: trên máy này node/opencode/dsh đều là binary ad-hoc signature của Homebrew —
 * nếu coi "không notarize" là cứng thì cơ chế sẽ tự bắn vào chân harness của chủ dự án.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** Dịch vụ TCC mà mã độc trên macOS gần như luôn nhắm tới. */
export const SENSITIVE_TCC_SERVICES = new Set([
  "kTCCServiceAccessibility",
  "kTCCServiceScreenCapture",
  "kTCCServiceSystemPolicyAllFiles", // = Full Disk Access
  "kTCCServiceListenEvent", // = Input Monitoring
  "kTCCServicePostEvent",
  "kTCCServiceEndpointSecurityClient",
  "kTCCServiceAppleEvents",
  "kTCCServiceSystemPolicyAppData",
  "kTCCServiceCamera",
  "kTCCServiceMicrophone",
  "kTCCServiceSystemPolicySysAdminFiles",
]);

/** Thư mục KHÔNG bao giờ là nơi hợp lệ để chạy binary trên máy dev. */
export const DEFAULT_SUSPICIOUS_PREFIXES = [
  "~/Desktop/",
  "~/Downloads/",
  "~/Documents/",
  "~/Public/",
  "/tmp/",
  "/var/tmp/",
  "/private/tmp/",
];

/** Vùng hợp lệ mặc định (đường dẫn binary). */
export const DEFAULT_ALLOW_PREFIXES = [
  "/System/",
  "/usr/",
  "/bin/",
  "/sbin/",
  "/Library/Apple/",
  "/Library/Frameworks/",
  "/Applications/",
  "/opt/homebrew/",
  "/usr/local/",
  "/opt/local/",
];

export function expandHome(p, home = os.homedir()) {
  if (typeof p !== "string") return p;
  if (p === "~") return home;
  if (p.startsWith("~/")) return path.join(home, p.slice(2));
  return p;
}

/** So khớp theo tiền tố thư mục (có chuẩn hoá ~). */
export function underAnyPrefix(target, prefixes, home = os.homedir()) {
  if (!target) return false;
  const t = path.resolve(expandHome(target, home));
  return prefixes.some((raw) => {
    const p = path.resolve(expandHome(raw, home));
    return t === p || t.startsWith(p.endsWith("/") ? p : `${p}/`);
  });
}

export function isAllowlisted(target, cfg) {
  return underAnyPrefix(target, cfg.allow?.pathPrefixes ?? DEFAULT_ALLOW_PREFIXES);
}

export function isSuspiciousPath(target, cfg) {
  const prefixes = cfg.suspiciousPathPrefixes ?? DEFAULT_SUSPICIOUS_PREFIXES;
  const t = path.resolve(expandHome(target));
  return prefixes.some((raw) => {
    const p = path.resolve(expandHome(raw));
    const withSlash = p.endsWith("/") ? p : `${p}/`;
    return t.startsWith(withSlash) && !isAllowlisted(t, cfg);
  });
}

/** `curl ... | bash`, `wget ... | sh`, base64 | shell — mẫu dropper. */
const PIPE_TO_SHELL =
  /\b(?:curl|wget|fetch)\b[^|;\n]*\|[^|\n]*\b(?:bash|sh|zsh|dash|python3?|perl|ruby|node)\b/i;
const DECODE_TO_SHELL =
  /\bbase64\b[^|;\n]*(?:-d|--decode|-D)[^|;\n]*\|[^|\n]*\b(?:bash|sh|zsh)\b/i;
/** Dấu hiệu rất đặc trưng của dropper đã gặp ngày 24/08/2026 trên máy này. */
const NOPROXY_PIPE = /--noproxy\s+['"]?\*['"]?/i;

export function matchesDropperPattern(text) {
  const s = String(text ?? "");
  const hits = [];
  if (PIPE_TO_SHELL.test(s)) hits.push("pipe-to-shell (curl|bash)");
  if (DECODE_TO_SHELL.test(s)) hits.push("base64-decode-to-shell");
  if (NOPROXY_PIPE.test(s)) hits.push("--noproxy dấu hiệu dropper đã gặp");
  return hits;
}

/** Khớp IOC: label, domain, mẫu tên, sha256. */
export function matchesIocs(blob, iocs) {
  const s = String(blob ?? "").toLowerCase();
  const hits = [];
  for (const [kind, list] of Object.entries(iocs ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (typeof raw !== "string" || raw.length < 4) continue;
      if (s.includes(raw.toLowerCase())) hits.push(`${kind}:${raw}`);
    }
  }
  return hits;
}

/** Đọc plist XML thô (không cần plutil) — đủ để lấy Label/ProgramArguments. */
export function parsePlistText(text) {
  const out = { Label: null, ProgramArguments: [], RunAtLoad: null, KeepAlive: null, raw: String(text ?? "") };
  const label = out.raw.match(/<key>\s*Label\s*<\/key>\s*<string>([\s\S]*?)<\/string>/);
  if (label) out.Label = label[1].trim();
  const argsBlock = out.raw.match(/<key>\s*ProgramArguments\s*<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (argsBlock) {
    out.ProgramArguments = [...argsBlock[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) =>
      m[1]
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim(),
    );
  }
  out.RunAtLoad = /<key>\s*RunAtLoad\s*<\/key>\s*<true\s*\/>/.test(out.raw);
  out.KeepAlive = /<key>\s*KeepAlive\s*<\/key>\s*<true\s*\/>/.test(out.raw);
  return out;
}

/**
 * Phân loại 1 persistence item.
 * @returns {{severity: 'hard'|'medium'|null, reasons: string[], parsed: object}}
 */
export function classifyPersistence(file, text, cfg, iocs) {
  const parsed = parsePlistText(text);
  const blob = `${file}\n${parsed.Label ?? ""}\n${parsed.ProgramArguments.join(" ")}`;
  const reasons = [];

  const iocHits = matchesIocs(blob, iocs);
  if (iocHits.length) reasons.push(...iocHits.map((h) => `IOC ${h}`));

  const dropper = matchesDropperPattern(blob);
  if (dropper.length) reasons.push(...dropper);

  // Tham số trỏ tới nơi không hợp lệ để chạy binary.
  for (const arg of parsed.ProgramArguments) {
    if (arg.startsWith("/") && isSuspiciousPath(arg, cfg)) {
      reasons.push(`tham số trỏ vào vùng đáng ngờ: ${arg}`);
    }
  }

  const hard = reasons.length > 0;

  // Tín hiệu mềm: tự chạy + tự hồi sinh nhưng nội dung không khớp gì.
  if (!hard) {
    const prog = parsed.ProgramArguments.find((a) => a.startsWith("/"));
    if (parsed.RunAtLoad && parsed.KeepAlive && prog && !isAllowlisted(prog, cfg)) {
      reasons.push(`RunAtLoad+KeepAlive nhưng binary ngoài allowlist: ${prog}`);
      return { severity: "medium", reasons, parsed };
    }
    return { severity: null, reasons, parsed };
  }
  return { severity: "hard", reasons, parsed };
}

/** Parse `ps -Ao pid=,ppid=,uid=,command=`. */
export function parsePs(text) {
  const rows = [];
  for (const line of String(text ?? "").split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const command = m[4];
    const argv0 = command.split(/\s+/)[0];
    rows.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      uid: Number(m[3]),
      command,
      argv0,
    });
  }
  return rows;
}

export function listProcesses({ run = execFileSync } = {}) {
  try {
    const out = run("/bin/ps", ["-Ao", "pid=,ppid=,uid=,command="], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return parsePs(out);
  } catch {
    return [];
  }
}

/**
 * Phân loại 1 tiến trình.
 *
 * QUAN TRỌNG — chỉ soi ĐƯỜNG DẪN file thực thi, KHÔNG soi chuỗi tham số.
 * Bài học từ test 22/09/2026: khớp IOC trên toàn bộ command line làm chính lệnh bash
 * đang viết báo cáo về mã độc bị gắn cờ "hard"; ở chế độ enforce thì cơ chế sẽ kill
 * đúng phiên agent đang xử lý sự cố. Tín hiệu `curl | bash` nằm trong THAM SỐ nên
 * thuộc về lớp file/persistence (nơi nội dung là bằng chứng bền), không thuộc lớp tiến trình.
 *
 * @param {Set<number>} [ancestors] pid của tổ tiên daemon — không bao giờ tự kill.
 * @returns {{severity: 'hard'|null, reasons: string[]}}
 */
export function classifyProcess(proc, cfg, iocs, selfPid = process.pid, ancestors = new Set()) {
  const reasons = [];
  if (!proc || proc.pid === selfPid) return { severity: null, reasons };
  if (ancestors.has(proc.pid)) return { severity: null, reasons };

  // argv0 tương đối ("node", "ssh") thì không biết chắc file nào ⇒ bỏ qua.
  if (!proc.argv0 || !proc.argv0.startsWith("/")) return { severity: null, reasons };

  const iocHits = matchesIocs(proc.argv0, iocs);
  if (iocHits.length) reasons.push(...iocHits.map((h) => `IOC ${h}`));

  if (isSuspiciousPath(proc.argv0, cfg)) {
    reasons.push(`binary chạy từ vùng đáng ngờ: ${proc.argv0}`);
  }

  if (reasons.length) return { severity: "hard", reasons };
  return { severity: null, reasons };
}

/** Tập pid tổ tiên của tiến trình hiện tại (để không tự kill chính mình). */
export function ancestorPids(procs, fromPid = process.pid) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const out = new Set();
  let cur = byPid.get(fromPid);
  let guard = 0;
  while (cur && guard++ < 64) {
    out.add(cur.ppid);
    cur = byPid.get(cur.ppid);
  }
  return out;
}

/** Snapshot 1 cây thư mục: path -> mtimeMs (để phát hiện file mới/thay đổi). */
export function snapshotDir(dir, acc = new Map()) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      const st = fs.lstatSync(full);
      if (e.isDirectory()) snapshotDir(full, acc);
      else acc.set(full, st.mtimeMs);
    } catch {
      /* bỏ qua */
    }
  }
  return acc;
}

export function snapshotDirs(dirs) {
  const m = new Map();
  for (const d of dirs) snapshotDir(expandHome(d), m);
  return m;
}

/** Diff 2 snapshot → danh sách file mới hoặc vừa bị sửa. */
export function diffSnapshot(prev, next) {
  const changed = [];
  for (const [p, mtime] of next) {
    if (!prev.has(p)) changed.push({ path: p, kind: "new", mtime });
    else if (prev.get(p) !== mtime) changed.push({ path: p, kind: "modified", mtime });
  }
  return changed;
}

/**
 * Đọc TCC.db (best-effort). Cần Full Disk Access; thiếu quyền thì trả về `{ok:false}`.
 */
export function readTccRows({ dbFile, run = execFileSync, sinceUnix = 0 } = {}) {
  const db = dbFile ?? path.join(os.homedir(), "Library", "Application Support", "com.apple.TCC", "TCC.db");
  try {
    const out = run(
      "/usr/bin/sqlite3",
      [
        "-json",
        db,
        `select service, client, auth_value, auth_reason, last_modified from access where last_modified > ${Number(
          sinceUnix,
        )} order by last_modified desc limit 50;`,
      ],
      // stdio pipe: sqlite3 in "authorization denied" ra stderr; nếu để kế thừa thì
      // log lỗi của daemon đầy rác mỗi phút. Ta bắt lấy và xử lý bằng cờ tccDbDenied.
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
    return { ok: true, rows: JSON.parse(out || "[]") };
  } catch (err) {
    return { ok: false, error: String(err?.stderr ?? err?.message ?? err).slice(0, 300), rows: [] };
  }
}

/**
 * Ghép cặp `AUTHREQ_CTX` (biết service) với `AUTHREQ_ATTRIBUTION` (biết client) theo msgID.
 * Dùng khi KHÔNG đọc được TCC.db: bản chạy qua LaunchAgent không có Full Disk Access,
 * nhưng `log show` thì vẫn trả về service + identifier + binary_path.
 */
export function parseTccLog(text) {
  const ctx = new Map();
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const mctx = line.match(/AUTHREQ_CTX: msgID=([\d.]+),.*?service=([A-Za-z]+)/);
    if (mctx) {
      ctx.set(mctx[1], { msgId: mctx[1], service: mctx[2], preflight: /preflight=yes/.test(line) });
      continue;
    }
    const mattr = line.match(/AUTHREQ_ATTRIBUTION: msgID=([\d.]+)/);
    if (!mattr) continue;
    const base = ctx.get(mattr[1]);
    if (!base) continue;
    // Có cả `accessing=` (bên thực sự dùng quyền) và `requesting=` (bên khởi tạo).
    // Ưu tiên `accessing=` vì đó mới là app nhận quyền.
    const block =
      line.match(/accessing=\{TCCDProcess: identifier=([^,]*), pid=(\d+)[^}]*?binary_path=([^},]*)/) ??
      line.match(/requesting=\{TCCDProcess: identifier=([^,]*), pid=(\d+)[^}]*?binary_path=([^},]*)/);
    if (!block) continue;
    out.push({
      ...base,
      ts: line.slice(0, 23),
      identifier: block[1].trim(),
      pid: Number(block[2]),
      binaryPath: block[3].trim(),
    });
  }
  return out;
}

/** Đọc sự kiện TCC qua `log show` (không cần Full Disk Access). */
export function readTccFromLog({ lastSeconds = 70, run = execFileSync } = {}) {
  try {
    const out = run(
      "/usr/bin/log",
      [
        "show",
        "--last", `${lastSeconds}s`,
        "--style", "compact",
        "--predicate", 'process == "tccd" AND eventMessage CONTAINS "AUTHREQ"',
      ],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return { ok: true, rows: parseTccLog(out) };
  } catch (err) {
    return { ok: false, error: String(err?.stderr ?? err?.message ?? err).slice(0, 300), rows: [] };
  }
}
