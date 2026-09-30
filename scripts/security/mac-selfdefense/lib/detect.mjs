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
import { execFileSync, spawnSync } from "node:child_process";

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
  "/Library/Developer/", // Xcode / CoreSimulator (TCC hay bị alert oan vì thiếu dòng này)
  "/Library/Application Support/Microsoft/", // Microsoft AutoUpdate (MAU2.0) + Teams updater
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
export function classifyProcess(proc, cfg, iocs, selfPid = process.pid, ancestors = new Set(), opts = {}) {
  const reasons = [];
  if (!proc || proc.pid === selfPid) return { severity: null, reasons };
  if (ancestors.has(proc.pid)) return { severity: null, reasons };

  // argv0 tương đối ("node", "ssh") thì không biết chắc file nào ⇒ bỏ qua.
  if (!proc.argv0 || !proc.argv0.startsWith("/")) return { severity: null, reasons };

  // Khớp IOC xét TRƯỚC mọi miễn trừ — miễn trừ không bao giờ che được dấu hiệu đã biết.
  const iocHits = matchesIocs(proc.argv0, iocs);
  if (iocHits.length) {
    return { severity: "hard", reasons: iocHits.map((h) => `IOC ${h}`) };
  }

  if (isSuspiciousPath(proc.argv0, cfg)) {
    // Updater/installer hợp lệ hay chạy helper từ vùng tạm. Miễn trừ theo CHỮ KÝ (danh tính nhà
    // phát hành), không theo tên file — xem createTrustChecker().
    const trust = trustVerdict(cfg, opts, proc.argv0);
    if (trust.trusted) {
      return { severity: "allow", reasons: [`vùng tạm nhưng ký hợp lệ (${trust.why}): ${proc.argv0}`] };
    }
    reasons.push(`binary chạy từ vùng đáng ngờ: ${proc.argv0}`);
  }

  if (reasons.length) return { severity: "hard", reasons };
  return { severity: null, reasons };
}

/**
 * Lấy kết quả kiểm tra chữ ký: ưu tiên hàm tiêm qua `opts.trust` (dùng cho test), không thì
 * dùng bộ kiểm tra chung có nhớ kết quả. Tắt hẳn bằng `cfg.trustSignatures = false`.
 */
function trustVerdict(cfg, opts, file) {
  if (cfg?.trustSignatures === false) return { trusted: false, why: null };
  if (typeof opts.trust === "function") return opts.trust(file);
  if (!trustVerdict.shared) trustVerdict.shared = createTrustChecker({ allowedTeamIds: cfg?.allowedTeamIds });
  return trustVerdict.shared(file);
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

/** File cấu hình shell — chạy mỗi lần mở terminal, là chỗ malware hay cài persistence. */
export const DEFAULT_STARTUP_PATHS = [
  "~/.zshrc",
  "~/.zprofile",
  "~/.zshenv",
  "~/.bashrc",
  "~/.bash_profile",
  "~/.profile",
  "~/.config/fish/config.fish",
];

/**
 * Phân loại nội dung một "bề mặt khởi động" (rc file, dòng crontab, login item).
 * Cứng = mẫu dropper hoặc khớp IOC. Mềm = trỏ vào vùng không nên thực thi.
 */
export function classifyStartupText(label, text, cfg, iocs) {
  const body = String(text ?? "");
  // Bỏ dòng comment TRƯỚC khi khớp mẫu: comment không thực thi được, mà tài liệu/ghi chú
  // hay nhắc tới `curl ... | bash` (đã gặp thật: chính báo cáo về mã độc bị gắn cờ).
  const code = body
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  const reasons = [];

  reasons.push(...matchesIocs(`${label}\n${code}`, iocs).map((h) => `IOC ${h}`));
  reasons.push(...matchesDropperPattern(code));
  if (reasons.length) return { severity: "hard", reasons };

  for (const rawLine of code.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    for (const m of line.matchAll(/["'=(:\s](\/[^\s"'`);|&]+)/g)) {
      if (isSuspiciousPath(m[1], cfg)) reasons.push(`trỏ vào vùng đáng ngờ: ${m[1]}`);
    }
    for (const m of line.matchAll(/["'=(:\s](~\/[^\s"'`);|&]+)/g)) {
      if (isSuspiciousPath(m[1], cfg)) reasons.push(`trỏ vào vùng đáng ngờ: ${m[1]}`);
    }
  }
  return { severity: reasons.length ? "medium" : null, reasons: [...new Set(reasons)] };
}

/** Đọc crontab của user hiện tại. Không có crontab thì trả chuỗi rỗng. */
export function readCrontab({ run = execFileSync } = {}) {
  try {
    return { ok: true, text: run("/usr/bin/crontab", ["-l"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (err) {
    const stderr = String(err?.stderr ?? "");
    if (/no crontab/i.test(stderr)) return { ok: true, text: "" };
    return { ok: false, error: stderr.slice(0, 200) || String(err?.message ?? err).slice(0, 200), text: "" };
  }
}

/**
 * Đọc danh sách login item.
 *
 * ⚠️ CÁI GIÁ: `osascript 'tell application "System Events"'` cần quyền **AppleEvents (Automation)**,
 * và macOS gán quyền đó cho tiến trình **chịu trách nhiệm** — ở đây là `node`. Nên hộp thoại hiện
 * chữ "node" (không phải tên công cụ) và hiện lại mỗi lần gọi. Vì vậy `startup.checkLoginItems`
 * mặc định TẮT. Đo thật 29/09/2026.
 */
export function readLoginItems({ run = execFileSync } = {}) {
  try {
    const out = run(
      "/usr/bin/osascript",
      ["-e", 'tell application "System Events" to get the name of every login item'],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 },
    );
    return { ok: true, items: String(out).split(",").map((s) => s.trim()).filter(Boolean) };
  } catch (err) {
    return { ok: false, error: String(err?.stderr ?? err?.message ?? err).slice(0, 200), items: [] };
  }
}

// ------------------------------------------------------------------ miễn trừ theo CHỮ KÝ SỐ

/**
 * Team ID của nhà cung cấp được phép chạy helper từ vùng tạm.
 *
 * Vì sao cần: updater/installer HỢP LỆ hay giải nén rồi chạy helper từ `/tmp` hoặc
 * `~/Library/Caches` — mà vùng tạm là tín hiệu CỨNG của watcher tiến trình. Không miễn trừ
 * thì cơ chế sẽ kill giữa lúc Microsoft AutoUpdate / macOS Software Update đang cài ⇒ app
 * hỏng dở. (Đo thật 24/09/2026: Microsoft AutoUpdate.app ký
 * `Developer ID Application: Microsoft Corporation (UBF8T346G9)`.)
 */
export const DEFAULT_ALLOWED_TEAM_IDS = [
  "UBF8T346G9", // Microsoft Corporation
];

/**
 * Authority của Apple. Apple không dùng Team ID cho binary nền tảng/hệ thống nên phải khớp chuỗi.
 */
export const APPLE_AUTHORITY_RE =
  /^(Software Signing|Apple Mac OS Application Signing|Apple Mac OS Application Signing \(Mac App Store\)|Platform Binary|Apple System|Apple iPhone OS Application Signing)$/;

/**
 * Đọc chữ ký số của 1 file.
 *
 * QUAN TRỌNG: đây là miễn trừ theo *danh tính nhà phát hành*, KHÔNG theo tên file. Mã độc tự
 * đặt tên "Microsoft AutoUpdate" sẽ không có Team ID của Microsoft ⇒ vẫn bị xử lý như thường.
 * (Sự cố 24/08/2026 trên chính máy này là một app tự xưng `SystemUpdater.app`.)
 *
 * @returns {{ok: boolean, teamId: string|null, authorities: string[], adhoc: boolean}}
 */
export function signatureOf(file, { spawn = spawnSync } = {}) {
  // `codesign -dv` ghi TOÀN BỘ thông tin ra STDERR (stdout rỗng) và trả rc=0. Dùng execFileSync
  // sẽ chỉ nhận stdout ⇒ authorities luôn rỗng ⇒ mọi binary đều bị coi là không tin cậy.
  // Đã trả giá đúng lỗi này ngày 24/09/2026. spawnSync cho cả hai luồng, và không ném lỗi.
  const res = spawn("/usr/bin/codesign", ["-dv", "--verbose=2", file], { encoding: "utf8" });
  const text = `${res?.stdout ?? ""}${res?.stderr ?? ""}`;

  let teamId = (text.match(/^TeamIdentifier=(.+)$/m) ?? [])[1]?.trim() ?? null;
  // codesign in literal "not set" cho binary không có Team ID (ad-hoc / binary hệ thống).
  if (teamId === "not set") teamId = null;
  const authorities = [...text.matchAll(/^Authority=(.+)$/gm)].map((m) => m[1].trim());
  // Một số bản codesign không in TeamIdentifier cho bundle; khi đó lấy từ chuỗi Authority.
  if (!teamId) {
    const fromAuthority = authorities
      .map((a) => a.match(/\(([A-Z0-9]{10})\)$/)?.[1])
      .find(Boolean);
    if (fromAuthority) teamId = fromAuthority;
  }
  return {
    ok: res?.status === 0,
    teamId,
    authorities,
    adhoc: /^Signature=adhoc$/m.test(text),
  };
}

/**
 * Bộ kiểm tra "nhà phát hành tin cậy", có nhớ kết quả theo đường dẫn.
 * Chỉ gọi `codesign` khi thật sự cần (đường dẫn bị nghi ngờ) nên chi phí không đáng kể.
 *
 * @returns {(file: string) => {trusted: boolean, why: string|null}}
 */
export function createTrustChecker({ allowedTeamIds = DEFAULT_ALLOWED_TEAM_IDS, spawn } = {}) {
  const cache = new Map();
  return (file) => {
    if (!file) return { trusted: false, why: null };
    if (cache.has(file)) return cache.get(file);

    const sig = signatureOf(file, { spawn });
    let verdict = { trusted: false, why: null };
    // Chữ ký ad-hoc không có Team ID và không có Authority ⇒ không bao giờ tin cậy.
    if (sig.teamId && allowedTeamIds.includes(sig.teamId)) {
      verdict = { trusted: true, why: `TeamID ${sig.teamId}` };
    } else if (sig.authorities.some((a) => APPLE_AUTHORITY_RE.test(a))) {
      verdict = { trusted: true, why: `Apple: ${sig.authorities[0]}` };
    }
    cache.set(file, verdict);
    return verdict;
  };
}
