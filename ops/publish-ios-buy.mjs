#!/usr/bin/env node
/**
 * publish-ios-buy.mjs — Phát một IPA iOS lên kênh buy/install (t1.meetflowai.site).
 *
 * VÌ SAO CÓ FILE NÀY
 * ------------------
 * Task T-20260923-02 (buy) / T-20260923-03 (App Store Connect) kết luận: WIN (Windows)
 * KHÔNG build/ký được IPA iOS (không có Xcode/macOS). Phần WIN LÀM ĐƯỢC là *phát* bản IPA
 * đã test lên kênh buy — nhưng các script mà tài liệu nhắc (`scripts/publish-ios.sh`,
 * `scripts/check-publish-version.py`) chỉ là bản scratch trong /tmp của phiên trước, KHÔNG
 * có trong repo. File này tạo lại đường phát đó cho thật, để khi Mac đẩy IPA vào
 * `/root/flowvpn-ipa/incoming/` thì chỉ còn **một lệnh**.
 *
 * CƠ CHẾ ĐANG CHẠY (đọc trực tiếp từ /root/flowvpn-cp/src/index.js, không phải phỏng đoán)
 * -------------------------------------------------------------------------------------
 *  1. File phát cho khách:  `/v1/downloads/ios`  →  `IOS_IPA_PATH` (mặc định
 *     `/root/flowvpn-ipa/VPNFlow-latest.ipa`).
 *  2. Manifest OTA `/install/ios/manifest.plist` lấy `version` = app_config `latest_ios_version`
 *     và `bundle-version` = app_config `ios_ipa_build`.
 *  3. Trang `/install/ios` in `Version <latest_ios_version>`.
 *  4. Đổi 2 mốc app_config bằng `PATCH /v1/admin/app-version {latest_version, ipa_build}`
 *     (Bearer AUTH_TOKEN, mặc định service nghe `127.0.0.1:7778`).
 *
 * ⇒ Ba lớp phải KHỚP NHAU: **file thật** — **manifest** — **app_config**. Lệch một lớp là
 * khách cài nhầm bản (đúng sự cố chủ dự án báo).
 *
 * CÁCH DÙNG (chạy TRÊN node-2)
 * ----------------------------
 *   # 1. Chỉ ĐO, không đổi gì (mặc định) — in trạng thái 3 lớp + các IPA trong incoming/
 *   node ops/publish-ios-buy.mjs --status
 *   node ops/publish-ios-buy.mjs --status --expect-version 1.4.3 --expect-build 20
 *
 *   # 2. PHÁT THẬT (tự tìm IPA mới nhất trong incoming/, chặn nếu số bên trong không khớp)
 *   AUTH_TOKEN=<token> node ops/publish-ios-buy.mjs --apply \
 *       --ipa /root/flowvpn-ipa/incoming/VPNFlow-1.4.3-b20.ipa \
 *       --expect-version 1.4.3 --expect-build 20
 *
 * Token lấy từ chính service đang chạy:
 *   AUTH_TOKEN=$(systemctl show flowvpn-cp -p Environment | tr ' ' '\n' | sed -n 's/^AUTH_TOKEN=//p') \
 *     node ops/publish-ios-buy.mjs --apply
 *
 * KHÔNG BAO GIỜ tự bịa số version: script đọc `CFBundleShortVersionString`/`CFBundleVersion`
 * **bên trong** IPA (zip + plistlib), rồi mới so với `--expect-*`. Lệch ⇒ thoát code 2, không đổi gì.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Tham số
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) { a._.push(t); continue; }
    const key = t.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) a[key] = true;
    else { a[key] = next; i++; }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const str = (v) => (typeof v === "string" && v.length ? v : undefined);

const IPA_DIR = process.env.IOS_IPA_DIR || "/root/flowvpn-ipa";
const CONFIG = {
  ipaDir: IPA_DIR,
  latestPath: process.env.IOS_IPA_PATH || path.join(IPA_DIR, "VPNFlow-latest.ipa"),
  incomingDir: path.join(IPA_DIR, "incoming"),
  backupDir: path.join(IPA_DIR, "backups"),
  adminBase: str(args["admin-base"]) || process.env.ADMIN_BASE || "http://127.0.0.1:7778",
  publicBase: str(args["public-base"]) || process.env.PUBLIC_BASE || "https://t1.meetflowai.site",
  timeoutMs: Number(str(args["timeout-ms"]) ?? 60000),
};

const mode = args.apply ? "apply" : "status";
const expectVersion = str(args["expect-version"]);
const expectBuild = str(args["expect-build"]);
const allowMismatch = Boolean(args["allow-mismatch"]);
const asJson = Boolean(args.json);
const token = str(args.token)
  || process.env.AUTH_TOKEN
  || (str(args["token-file"]) ? fs.readFileSync(str(args["token-file"]), "utf8").trim() : "");

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------
const log = (...m) => { if (!asJson) console.log(...m); };
const ok = (b) => (b ? "✅" : "❌");

function sha256File(p) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(p, "r");
  const buf = Buffer.allocUnsafe(1 << 20);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest("hex");
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

const PY_READ_IPA = String.raw`
import sys, zipfile, plistlib, json
p = sys.argv[1]
out = {"main": None, "appex": [], "provisioning": None, "error": None}
try:
    z = zipfile.ZipFile(p)
except Exception as e:
    print(json.dumps({"error": "not_a_zip: %s" % e})); sys.exit(0)
bad = z.testzip()
if bad:
    print(json.dumps({"error": "corrupt_zip_entry: %s" % bad})); sys.exit(0)
for n in z.namelist():
    # main app: "Payload/Foo.app/Info.plist" (đúng 2 dấu "/"); appex nằm sâu hơn.
    if n.endswith(".appex/Info.plist") or (n.startswith("Payload/") and n.count("/") == 2 and n.endswith(".app/Info.plist")):
        try:
            d = plistlib.loads(z.read(n))
        except Exception:
            continue
        rec = {"path": n, "short": d.get("CFBundleShortVersionString"),
               "bundle": d.get("CFBundleVersion"), "id": d.get("CFBundleIdentifier")}
        if n.endswith(".appex/Info.plist"):
            out["appex"].append(rec)
        else:
            out["main"] = rec
# Heuristic kieu ky (chi de bao, khong phai ket luan): co ProvisionedDevices => Ad Hoc/Dev.
for n in z.namelist():
    if n.startswith("Payload/") and n.endswith(".app/embedded.mobileprovision"):
        raw = z.read(n)
        out["provisioning"] = {"hasProvisionedDevices": b"ProvisionedDevices" in raw,
                               "hasProvisionsAllDevices": b"ProvisionsAllDevices" in raw,
                               "hasBetaReportsActive": b"beta-reports-active" in raw}
        break
print(json.dumps(out))
`.trim();

/** Đọc version BÊN TRONG IPA. Trả {main:{short,bundle,id}, appex:[…], provisioning} hoặc {error}. */
function readIpaVersion(ipaPath) {
  const out = execFileSync("python3", ["-c", PY_READ_IPA, ipaPath], { encoding: "utf8", maxBuffer: 8 << 20 });
  return JSON.parse(out);
}

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(CONFIG.timeoutMs) });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* không phải JSON */ }
  return { status: r.status, body, text };
}

async function getText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(CONFIG.timeoutMs) });
  return { status: r.status, text: await r.text() };
}

/** Trạng thái 3 lớp đang phát (đo thật, không đọc app_config qua sqlite). */
async function readChannel() {
  const out = { admin: null, appVersion: null, manifest: null, installPage: null, latest: null };
  if (token) {
    const a = await getJson(`${CONFIG.adminBase}/v1/admin/app-version`, { Authorization: `Bearer ${token}` });
    out.admin = a;
  }
  out.appVersion = await getJson(`${CONFIG.publicBase}/v1/app-version?platform=ios`);
  const m = await getText(`${CONFIG.publicBase}/install/ios/manifest.plist`);
  // LƯU Ý: manifest OTA của mình KHÔNG có key `version` (xem iosInstallManifest trong
  // flowvpn-cp/src/app-version.js) — chỉ có `bundle-version`. Nên chỉ bắt buộc bundle-version.
  out.manifest = {
    status: m.status,
    version: (m.text.match(/<key>version<\/key>\s*<string>([^<]*)<\/string>/) || [])[1] ?? null,
    build: (m.text.match(/<key>bundle-version<\/key>\s*<string>([^<]*)<\/string>/) || [])[1] ?? null,
    bundleId: (m.text.match(/<key>bundle-identifier<\/key>\s*<string>([^<]*)<\/string>/) || [])[1] ?? null,
  };
  const p = await getText(`${CONFIG.publicBase}/install/ios`);
  out.installPage = { status: p.status, version: (p.text.match(/Version\s+([0-9][0-9.]*)/) || [])[1] ?? null };
  if (fs.existsSync(CONFIG.latestPath)) {
    const st = fs.statSync(CONFIG.latestPath);
    out.latest = {
      path: CONFIG.latestPath,
      size: st.size,
      mtime: st.mtime.toISOString(),
      sha256: sha256File(CONFIG.latestPath),
      embedded: readIpaVersion(CONFIG.latestPath),
    };
  }
  return out;
}

/** Các IPA nằm trong incoming/ (kèm version đọc bên trong). */
function listIncoming() {
  if (!fs.existsSync(CONFIG.incomingDir)) return [];
  return fs.readdirSync(CONFIG.incomingDir)
    .filter((f) => f.toLowerCase().endsWith(".ipa"))
    .map((f) => {
      const p = path.join(CONFIG.incomingDir, f);
      const st = fs.statSync(p);
      let embedded = null;
      try { embedded = readIpaVersion(p); } catch (e) { embedded = { error: e.message }; }
      return { file: f, path: p, size: st.size, mtime: st.mtime.toISOString(), embedded };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function describeEmbedded(e) {
  if (!e) return "—";
  if (e.error) return `LỖI: ${e.error}`;
  const main = e.main ? `${e.main.short}/${e.main.bundle}` : "?";
  const appex = (e.appex ?? []).map((x) => `${x.short}/${x.bundle}`).join(", ") || "—";
  return `main=${main} · appex=[${appex}]`;
}

// ---------------------------------------------------------------------------
// --status
// ---------------------------------------------------------------------------
async function doStatus() {
  const ch = await readChannel();
  const incoming = listIncoming();

  const latestEmbedded = ch.latest?.embedded ?? null;
  const publishedVersion = ch.appVersion?.body?.latest_version ?? ch.admin?.body?.latest_version ?? null;
  const publishedBuild = ch.manifest?.build ?? ch.admin?.body?.ipa_build ?? null;
  const fileVersion = latestEmbedded?.main?.short ?? null;
  const fileBuild = latestEmbedded?.main?.bundle ?? null;

  // Ba lớp: (1) file đang phát, (2) manifest OTA, (3) app_config + trang /install/ios.
  const threeWaySync = Boolean(
    publishedVersion && publishedBuild && fileVersion && fileBuild
    && publishedVersion === fileVersion && publishedBuild === fileBuild
    && String(ch.manifest.build) === String(publishedBuild)
    && ch.installPage.version === publishedVersion,
  );
  const matchesExpectation = expectVersion && expectBuild
    ? Boolean(publishedVersion === expectVersion && publishedBuild === expectBuild
      && fileVersion === expectVersion && fileBuild === expectBuild)
    : null;

  const report = {
    at: new Date().toISOString(),
    channel: {
      app_version_public: { status: ch.appVersion.status, latest_version: publishedVersion },
      manifest: ch.manifest,
      install_page: ch.installPage,
      app_config_admin: ch.admin ? { status: ch.admin.status, body: ch.admin.body } : "chưa có token (bỏ qua lớp admin)",
    },
    file_being_served: ch.latest ? {
      path: ch.latest.path, size: ch.latest.size, size_human: human(ch.latest.size),
      mtime: ch.latest.mtime, sha256: ch.latest.sha256, embedded: ch.latest.embedded,
    } : { path: CONFIG.latestPath, missing: true },
    three_way_sync: threeWaySync,
    matches_expectation: matchesExpectation,
    incoming: incoming.map((x) => ({ file: x.file, size_human: human(x.size), mtime: x.mtime, embedded: x.embedded })),
  };

  if (asJson) { console.log(JSON.stringify(report, null, 2)); return matchesExpectation === false ? 1 : 0; }

  log("═".repeat(78));
  log(`KÊNH PHÁT iOS (buy/install) — đo lúc ${report.at}`);
  log("═".repeat(78));
  log(`app_config (admin) : latest_version=${ch.admin?.body?.latest_version ?? "?"} ipa_build=${ch.admin?.body?.ipa_build ?? "?"}${ch.admin ? "" : "  (không có token)"}`);
  log(`/v1/app-version     : ${ok(ch.appVersion.status === 200)} ${ch.appVersion.status} latest_version=${publishedVersion}`);
  log(`manifest.plist      : ${ok(ch.manifest.status === 200)} bundle-version=${ch.manifest.build} (bundle-id=${ch.manifest.bundleId})`);
  log(`/install/ios        : ${ok(ch.installPage.status === 200)} "Version ${ch.installPage.version}"`);
  log("");
  if (ch.latest) {
    log(`File đang phát     : ${ch.latest.path}`);
    log(`                     ${human(ch.latest.size)} · mtime=${ch.latest.mtime}`);
    log(`                     sha256=${ch.latest.sha256}`);
    log(`                     bên trong IPA: ${describeEmbedded(ch.latest.embedded)}`);
  } else {
    log(`File đang phát     : ❌ KHÔNG TỒN TẠI (${CONFIG.latestPath})`);
  }
  log("");
  log(`Ba lớp khớp nhau (file = manifest = app_config): ${ok(threeWaySync)} ${threeWaySync ? "CÓ" : "KHÔNG"}`);
  if (matchesExpectation !== null) {
    log(`Đúng bản mong đợi (${expectVersion}/${expectBuild})       : ${ok(matchesExpectation)} ${matchesExpectation ? "ĐÚNG" : "CHƯA ĐÚNG"}`);
  }
  log("");
  log(`IPA trong ${CONFIG.incomingDir}: ${incoming.length}`);
  for (const x of incoming) log(`  · ${x.file}  ${human(x.size)}  ${x.mtime}  ${describeEmbedded(x.embedded)}`);
  if (!incoming.length) log("  (trống — chưa có file nào được bàn giao)");
  log("═".repeat(78));
  return matchesExpectation === false ? 1 : 0;
}

// ---------------------------------------------------------------------------
// --apply
// ---------------------------------------------------------------------------
async function doApply() {
  const fail = (msg, code = 2) => { console.error(`⛔ ${msg}`); process.exit(code); };

  if (!token) fail("Thiếu token admin. Đặt AUTH_TOKEN hoặc --token/--token-file.");

  // 1. Chọn IPA nguồn
  let ipaPath = str(args.ipa);
  if (!ipaPath) {
    const incoming = listIncoming();
    if (!incoming.length) fail(`Không có IPA nào trong ${CONFIG.incomingDir} — chưa có gì để phát.`);
    ipaPath = incoming[0].path;
    log(`… tự chọn IPA mới nhất trong incoming/: ${ipaPath}`);
  }
  if (!fs.existsSync(ipaPath)) fail(`Không thấy file IPA: ${ipaPath}`);
  const srcSize = fs.statSync(ipaPath).size;
  if (srcSize < 1 << 20) fail(`File IPA nhỏ bất thường (${srcSize} B) — nghi file cụt. Dừng.`);

  // 2. Đọc version BÊN TRONG (không tin tên file)
  const embedded = readIpaVersion(ipaPath);
  if (embedded.error) fail(`IPA không đọc được: ${embedded.error}`);
  if (!embedded.main?.short || !embedded.main?.bundle) fail("IPA thiếu Payload/<App>.app/Info.plist hoặc thiếu số version.");
  const v = embedded.main.short, b = embedded.main.bundle;
  const srcSha = sha256File(ipaPath);
  log(`IPA nguồn: ${ipaPath}`);
  log(`  ${human(srcSize)} · sha256=${srcSha}`);
  log(`  bên trong: ${describeEmbedded(embedded)}`);

  // 3. Chặn nếu số không khớp điều mong đợi — đây là lỗi "phát xong vẫn sai số"
  if (expectVersion && expectBuild && !allowMismatch) {
    if (v !== expectVersion || b !== expectBuild) {
      fail(`Số bên trong IPA là ${v}/${b}, KHÔNG phải ${expectVersion}/${expectBuild}. Không phát. `
        + `(Muốn phát bản khác thì sửa --expect-*; muốn bỏ qua kiểm tra thì --allow-mismatch — chỉ dùng khi thật hiểu rủi ro.)`);
    }
  }

  // 4. Appex phải cùng số với app chính — lệch nhau dễ làm OTA/App Store từ chối.
  const appexBad = (embedded.appex ?? []).filter((x) => x.short !== v || x.bundle !== b);
  if (appexBad.length) {
    const msg = `Appex lệch số với app chính: ${appexBad.map((x) => `${x.id ?? x.path}=${x.short}/${x.bundle}`).join(", ")} (app=${v}/${b})`;
    if (allowMismatch) console.warn(`⚠ ${msg} — vẫn tiếp tục vì --allow-mismatch.`);
    else fail(`${msg}. Đây đúng là kiểu lỗi từng gặp (app 20 nhưng appex 19). Không phát.`);
  }

  // 5. Idempotent: nếu bản đang phát ĐÃ đúng file này thì khỏi làm gì.
  const before = await readChannel();
  if (before.latest && before.latest.sha256 === srcSha) {
    const synced = before.appVersion?.body?.latest_version === v
      && String(before.manifest?.build) === String(b) && before.manifest?.version === v;
    if (synced) {
      log("✓ Bản đang phát ĐÃ đúng file này và 3 lớp đã khớp — không cần làm gì.");
      if (!asJson) printEvidence({ changed: false, version: v, build: b, sha256: srcSha, before });
      else console.log(JSON.stringify({ changed: false, version: v, build: b, sha256: srcSha }));
      return 0;
    }
  }

  // 6. Backup bản đang phát
  fs.mkdirSync(CONFIG.backupDir, { recursive: true });
  let backupPath = null;
  if (fs.existsSync(CONFIG.latestPath)) {
    const cur = readIpaVersion(CONFIG.latestPath);
    const tag = cur?.main ? `${cur.main.short}-b${cur.main.bundle}` : "unknown";
    backupPath = path.join(CONFIG.backupDir, `VPNFlow-latest.bak-${tag}-${Date.now()}.ipa`);
    fs.copyFileSync(CONFIG.latestPath, backupPath);
    log(`… backup bản cũ (${tag}) → ${backupPath}`);
  }

  // 7. Thay file kiểu ATOMIC: ghi file tạm cùng thư mục rồi rename đè (khách không tải phải file cụt)
  const tmp = `${CONFIG.latestPath}.tmp-${process.pid}`;
  fs.copyFileSync(ipaPath, tmp);
  const fd = fs.openSync(tmp, "r+");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, CONFIG.latestPath);
  const afterSha = sha256File(CONFIG.latestPath);
  if (afterSha !== srcSha) fail(`Sau khi thay, sha256 không khớp (${afterSha} != ${srcSha}). Cần kiểm tra tay.`, 3);
  log(`… đã thay ${CONFIG.latestPath} (sha256 khớp file nguồn)`);

  // 8. Đổi 2 mốc app_config — đọc JSON trả về, KHÔNG tin exit code
  const patch = await fetch(`${CONFIG.adminBase}/v1/admin/app-version`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ latest_version: v, ipa_build: String(b) }),
    signal: AbortSignal.timeout(CONFIG.timeoutMs),
  });
  const patchBody = await patch.json().catch(() => null);
  if (patch.status !== 200 || !patchBody) fail(`PATCH /v1/admin/app-version thất bại: HTTP ${patch.status} ${JSON.stringify(patchBody)}`);
  if (patchBody.latest_version !== v || String(patchBody.ipa_build) !== String(b)) {
    fail(`PATCH trả về số khác mong đợi: ${JSON.stringify(patchBody)}`);
  }
  log(`… PATCH app_config → latest_version=${patchBody.latest_version} ipa_build=${patchBody.ipa_build}`);

  // 9. Verify qua ĐÚNG kênh khách dùng, và tải thật để đọc lại version bên trong
  const after = await readChannel();
  const checks = {
    "app_config latest_version": patchBody.latest_version === v,
    "app_config ipa_build": String(patchBody.ipa_build) === String(b),
    "/v1/app-version latest_version": after.appVersion?.body?.latest_version === v,
    "manifest bundle-version": String(after.manifest?.build) === String(b),
    "/install/ios hiện Version": after.installPage?.version === v,
  };

  const dlTmp = path.join(CONFIG.ipaDir, `.verify-download-${process.pid}.ipa`);
  let dlEmbedded = null;
  try {
    const r = await fetch(`${CONFIG.publicBase}/v1/downloads/ios`, { signal: AbortSignal.timeout(CONFIG.timeoutMs) });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    fs.writeFileSync(dlTmp, Buffer.from(await r.arrayBuffer()));
    dlEmbedded = readIpaVersion(dlTmp);
    checks["tải thật /v1/downloads/ios → version trong IPA"] = dlEmbedded?.main?.short === v && String(dlEmbedded?.main?.bundle) === String(b);
    checks["tải thật → sha256 khớp file nguồn"] = sha256File(dlTmp) === srcSha;
  } catch (e) {
    checks["tải thật /v1/downloads/ios"] = false;
    log(`  (lỗi khi tải verify: ${e.message})`);
  } finally {
    try { fs.rmSync(dlTmp, { force: true }); } catch { /* ignore */ }
  }

  const allPass = Object.values(checks).every(Boolean);
  if (asJson) {
    console.log(JSON.stringify({ changed: true, version: v, build: b, sha256: srcSha, backup: backupPath, checks, passed: allPass }, null, 2));
  } else {
    printEvidence({ changed: true, version: v, build: b, sha256: srcSha, backup: backupPath, checks, after, dlEmbedded });
  }
  return allPass ? 0 : 4;
}

function printEvidence({ changed, version, build, sha256, backup, checks, after, dlEmbedded }) {
  log("");
  log("═".repeat(78));
  log(changed ? `KẾT QUẢ PHÁT: ${version} (build ${build})` : "KẾT QUẢ: không đổi (đã đúng từ trước)");
  log("═".repeat(78));
  log(`sha256 file nguồn : ${sha256}`);
  if (backup) log(`backup bản cũ    : ${backup}`);
  if (after) {
    log(`/v1/app-version   : latest_version=${after.appVersion?.body?.latest_version}`);
    log(`manifest.plist    : bundle-version=${after.manifest?.build} (bundle-id=${after.manifest?.bundleId})`);
    log(`/install/ios      : "Version ${after.installPage?.version}"`);
    if (dlEmbedded?.main) log(`IPA tải thật      : CFBundleShortVersionString=${dlEmbedded.main.short} CFBundleVersion=${dlEmbedded.main.bundle}`);
  }
  if (checks) {
    log("");
    for (const [k, v] of Object.entries(checks)) log(`  ${ok(v)} ${k}`);
    const pass = Object.values(checks).every(Boolean);
    log("");
    log(pass ? "✅ TẤT CẢ ĐIỀU KIỆN NGHIỆM THU ĐỀU PASS" : "❌ CÓ ĐIỀU KIỆN FAIL — xem danh sách trên");
  }
  log("═".repeat(78));
}

// ---------------------------------------------------------------------------
try {
  const code = mode === "apply" ? await doApply() : await doStatus();
  process.exit(code);
} catch (err) {
  console.error(`⛔ Lỗi: ${err.stack ?? err.message}`);
  process.exit(1);
}
