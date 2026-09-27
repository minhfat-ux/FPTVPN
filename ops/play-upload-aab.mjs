#!/usr/bin/env node
/**
 * play-upload-aab.mjs — nộp AAB lên **Google Play** bằng Google Play Developer API,
 * chạy được từ Windows/Linux (không cần Play Console UI, không cần Java, không thêm dependency).
 *
 * VÌ SAO CÓ FILE NÀY
 * ------------------
 * Task T-20260927-01 (owner → win, bus #512): "publish bản MeetFlow AI Android lên Google Play".
 * AAB đã build + ký sẵn (`MeetFlowAI-1.0.7-play.aab`, package `com.meetflow.translator`,
 * versionCode 8) nhưng **chưa từng lên Play** (trang store 404 — xem
 * `docs/TG-VIBECODE-ANDROID-PLAY-PUBLISH.md`). Đường nộp duy nhất còn thiếu là một credential
 * service account có quyền Release trong Play Console — y như `ops/asc-upload-build.mjs` đã làm
 * cho App Store Connect khi WIN không có `xcrun`.
 *
 * CƠ CHẾ (Google Play Developer API v3 — "edits" là một transaction)
 * ----------------------------------------------------------------
 *   1. Đọc file AAB, KIỂM TĨNH trước (không gọi mạng): có manifest/bundle config, có chữ ký JAR,
 *      có đúng package/version định nộp — không tin tên file.
 *   2. Ký JWT RS256 bằng `private_key` trong service account JSON → đổi lấy access token
 *      (`https://oauth2.googleapis.com/token`, scope `androidpublisher`).
 *   3. POST  /applications/{pkg}/edits                          → editId
 *   4. POST  /upload/.../edits/{editId}/bundles?uploadType=media → tải AAB, trả `versionCode`
 *   5. PUT   /applications/{pkg}/edits/{editId}/tracks/{track}   → gắn bundle vào track + release notes
 *   6. POST  /applications/{pkg}/edits/{editId}:commit           → Play mới thật sự nhận
 *   (Bước 5 mặc định để `status=draft`: hàng đợi bản nháp cho chủ dự án tự bấm rollout.)
 *
 * CÁCH DÙNG
 * ---------
 *   node ops/play-upload-aab.mjs --preflight --aab <file.aab>          # chỉ đọc file, không mạng
 *   node ops/play-upload-aab.mjs --self-test                           # kiểm đường OAuth tới Google
 *   node ops/play-upload-aab.mjs --status                              # đọc: app có trên Play chưa, track nào
 *   node ops/play-upload-aab.mjs --apply --aab <file.aab> --track internal \
 *        --notes-file notes.json                                       # nộp thật (cần credential)
 *
 * Tùy chọn: `--package com.meetflow.translator` · `--cred <service-account.json>`
 *   `--expect-version 1.0.7` · `--expect-package <pkg>` · `--release-status draft|halted|inProgress|completed`
 *   `--rollout 0.1` (chỉ khi `inProgress`) · `--notes '<json>'` · `--dry-run` · `--json`
 *
 * Credential (theo thứ tự): `--cred` → env `PLAY_SERVICE_ACCOUNT_JSON` →
 *   env `PLAY_SERVICE_ACCOUNT_FILE` → `/root/flowvpn-cp/data/play-admin.json` (đúng file mà
 *   control-plane dùng để xác thực purchase — xem `control-plane/src/play-store.js`).
 * KHÔNG in `private_key` ra màn hình hay vào log.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
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
const asJson = Boolean(args.json);
const log = (...m) => { if (!asJson) console.log(...m); };
const ok = (b) => (b ? "✅" : "❌");
const fail = (msg, code = 2) => {
  if (asJson) console.log(JSON.stringify({ ok: false, error: msg }));
  else console.error(`⛔ ${msg}`);
  process.exit(code);
};

const PKG = str(args.package) || process.env.PLAY_PACKAGE_NAME || "com.meetflow.translator";
const API = str(args["api-base"]) || "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD_API = str(args["upload-api-base"]) || "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const AAB = str(args.aab);
const TRACK = str(args.track) || "internal";
const RELEASE_STATUS = str(args["release-status"]) || "draft";
const ROLLOUT = str(args.rollout) ? Number(str(args.rollout)) : undefined;
const EXPECT_V = str(args["expect-version"]);
const EXPECT_PKG = str(args["expect-package"]) || PKG;
const CRED_CANDIDATES = [
  str(args.cred),
  process.env.PLAY_SERVICE_ACCOUNT_FILE,
  "/root/flowvpn-cp/data/play-admin.json",
  path.join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".flowvpn-inbox", "play-admin.json"),
].filter(Boolean);

const mode = args.apply ? "apply"
  : args.status ? "status"
  : args["self-test"] ? "self-test"
  : args.preflight ? "preflight"
  : "help";

// ---------------------------------------------------------------------------
// Credential
// ---------------------------------------------------------------------------
function loadCredential() {
  const inline = (process.env.PLAY_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (inline) {
    try { return { source: "env:PLAY_SERVICE_ACCOUNT_JSON", json: JSON.parse(inline) }; }
    catch { fail("PLAY_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ."); }
  }
  const tried = [];
  for (const p of CRED_CANDIDATES) {
    try {
      const json = JSON.parse(fs.readFileSync(p, "utf8"));
      if (json.client_email && json.private_key) return { source: p, json };
      tried.push(`${p} (thiếu client_email/private_key)`);
    } catch (e) {
      tried.push(`${p} (${e.code ?? e.message})`);
    }
  }
  return { source: null, json: null, tried };
}

const CRED = loadCredential();

// ---------------------------------------------------------------------------
// JWT RS256 → access token
// ---------------------------------------------------------------------------
function makeJwt(json, now = Math.floor(Date.now() / 1000)) {
  const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "RS256", typ: "JWT" });
  const claims = b64({ iss: json.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 });
  const signingInput = `${header}.${claims}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  return `${signingInput}.${signer.sign(json.private_key).toString("base64url")}`;
}

async function googleToken(json) {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: makeJwt(json),
  });
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (e) {
    fail(`Không gọi được ${TOKEN_URL}: ${e.message}`);
  }
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* giữ text thô */ }
  if (!res.ok || !data.access_token) {
    const err = data.error_description || data.error || text.slice(0, 200);
    const e = new Error(`Google từ chối credential (${res.status}): ${err}`);
    e.status = res.status;
    e.googleError = data.error;
    throw e;
  }
  return data.access_token;
}

async function api(token, method, url, body, contentType = "application/json") {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = contentType;
    payload = contentType === "application/json" ? JSON.stringify(body) : body;
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 400) }; }
  if (!res.ok) {
    const detail = data?.error?.message || data?.raw || text.slice(0, 200);
    const e = new Error(`${method} ${url.replace(API, "").replace(UPLOAD_API, "")} → ${res.status}: ${detail}`);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Đọc ZIP tối thiểu (không dependency) — cần BUNG nội dung để kiểm thật,
// vì entry trong AAB bị nén: quét byte thô chỉ thấy TÊN entry, không thấy nội dung.
// ---------------------------------------------------------------------------
function unzipEntry(buf, wanted) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Kiểm tĩnh AAB (không gọi mạng) — "không tin tên file"
// ---------------------------------------------------------------------------
function preflight(aabPath) {
  const checks = [];
  const add = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail });

  if (!aabPath) fail("Thiếu --aab <file.aab>.");
  if (!fs.existsSync(aabPath)) fail(`Không thấy file: ${aabPath}`);
  const buf = fs.readFileSync(aabPath);
  const latin = buf.toString("latin1");
  const size = buf.length;

  add("Đuôi .aab", aabPath.toLowerCase().endsWith(".aab"), path.basename(aabPath));
  add("Là file ZIP (PK\\x03\\x04)", buf.subarray(0, 4).toString("latin1") === "PK\x03\x04", `${size} byte`);

  const manifest = unzipEntry(buf, "base/manifest/AndroidManifest.xml");
  const bundleConfig = unzipEntry(buf, "BundleConfig.pb");
  add("Có base/manifest/AndroidManifest.xml", Boolean(manifest), manifest ? `${manifest.length} byte` : "KHÔNG bung được");
  add("Có BundleConfig.pb", Boolean(bundleConfig), bundleConfig ? `${bundleConfig.length} byte` : "KHÔNG bung được");

  const m = latin.match(/META-INF\/[A-Za-z0-9_.-]+\.(RSA|DSA|EC)/);
  add("Có chữ ký JAR (META-INF/*.RSA|DSA|EC)", Boolean(m), m?.[0] ?? "chưa ký ⇒ Play từ chối");

  // Nội dung manifest (đã bung) — đây mới là bằng chứng thật về package/version.
  const text = manifest ? manifest.toString("latin1") : "";
  add(`Manifest khai package "${EXPECT_PKG}"`, text.includes(EXPECT_PKG), text ? "" : "không đọc được manifest");
  if (EXPECT_V) {
    add(`Manifest khai versionName "${EXPECT_V}"`, text.includes(EXPECT_V));
  }
  const versionCode = text.match(/versionCode[\s\S]{0,48}?(\d{1,10})/)?.[1] ?? null;
  const versionName = text.match(/versionName[\s\S]{0,48}?([0-9][0-9.]{0,15})/)?.[1] ?? null;
  add("Manifest có thuộc tính versionCode", Boolean(versionCode), versionCode ? `suy ra = ${versionCode}` : "");
  add("Không phải APK (không có classes.dex ở gốc)", !latin.includes("classes.dex") || latin.includes("base/dex/classes.dex"),
    latin.includes("base/dex/classes.dex") ? "có base/dex/classes.dex (đúng dạng AAB)" : "");

  // Chữ ký đọc được bằng jarsigner (nếu máy có JDK) — không bắt buộc.
  const signer = jarsignerInfo(aabPath);
  return { aab: aabPath, size, manifestBytes: manifest?.length ?? 0, versionCode, versionName, checks, signer };
}

/**
 * Đọc chữ ký bằng `jarsigner` NẾU máy có JDK.
 *
 * Ghi chú kỹ thuật: KHÔNG dùng stdio "pipe" để hứng output — trong sandbox của harness,
 * `child_process` mở named pipe bị chặn (EPERM). Nên hứng bằng FILE TẠM rồi đọc lại.
 */
function jarsignerInfo(aabPath) {
  const tmp = path.join(os.tmpdir(), `play-aab-jarsigner-${process.pid}.txt`);
  let lastNote = "không có jarsigner trên máy — bỏ qua";
  for (const bin of ["jarsigner", "jarsigner.exe"]) {
    let fd;
    try {
      fd = fs.openSync(tmp, "w");
      execFileSync(bin, ["-verify", "-certs", aabPath], { stdio: ["ignore", fd, fd] });
      const out = fs.readFileSync(tmp, "utf8");
      return { verified: /jar verified/.test(out), cn: out.match(/CN=([^,\n]+)/)?.[1] ?? null };
    } catch (e) {
      let out = "";
      try { out = fs.readFileSync(tmp, "utf8"); } catch { /* chưa ghi gì */ }
      if (/jar verified/.test(out)) return { verified: true, cn: out.match(/CN=([^,\n]+)/)?.[1] ?? null };
      lastNote = e.code === "ENOENT"
        ? "không có jarsigner trên máy — bỏ qua"
        : `jarsigner: ${(out.trim().split("\n").filter(Boolean).slice(-1)[0] ?? e.code ?? e.message).slice(0, 120)}`;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
  return { verified: null, note: lastNote };
}

function printPreflight(r) {
  log(`== Kiểm tĩnh AAB ==`);
  log(`   file: ${r.aab}  (${r.size} byte)`);
  for (const c of r.checks) log(`   ${ok(c.pass)} ${c.name}${c.detail ? `  — ${c.detail}` : ""}`);
  if (r.signer) {
    log(`   ${ok(r.signer.verified !== false)} chữ ký: ${r.signer.verified === null ? "chưa kiểm" : r.signer.verified ? "jar verified" : "KHÔNG hợp lệ"}${r.signer.cn ? ` · CN=${r.signer.cn}` : ""}${r.signer.note ? ` (${r.signer.note})` : ""}`);
  }
  return r.checks.every((c) => c.pass);
}

// ---------------------------------------------------------------------------
// Lệnh
// ---------------------------------------------------------------------------
if (mode === "help") {
  console.log(`play-upload-aab.mjs — nộp AAB lên Google Play không cần Play Console UI

  node ops/play-upload-aab.mjs --preflight --aab <file.aab> [--expect-version 1.0.7]
  node ops/play-upload-aab.mjs --self-test
  node ops/play-upload-aab.mjs --status [--package com.meetflow.translator]
  node ops/play-upload-aab.mjs --apply --aab <file.aab> [--track internal] [--release-status draft]
      [--notes-file notes.json | --notes '{"vi":"…"}'] [--rollout 0.1] [--dry-run]

Credential: --cred | PLAY_SERVICE_ACCOUNT_JSON | PLAY_SERVICE_ACCOUNT_FILE | /root/flowvpn-cp/data/play-admin.json`);
  process.exit(0);
}

if (mode === "preflight") {
  const r = preflight(AAB);
  const pass = printPreflight(r);
  if (asJson) console.log(JSON.stringify(r, null, 1));
  log(pass ? "\n✅ AAB ĐẠT kiểm tĩnh — có thể nộp." : "\n⛔ AAB KHÔNG đạt — xem dòng ❌ ở trên.");
  process.exit(pass ? 0 : 1);
}

if (mode === "self-test") {
  // Không cần credential thật: sinh 1 khoá RSA tạm rồi gọi Google. Google PHẢI trả
  // "invalid_grant" ⇒ chứng minh được (a) request đúng khuôn dạng, (b) máy ra được Internet TLS.
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const fake = {
    type: "service_account",
    client_email: "self-test@invalid.example.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  const jwt = makeJwt(fake);
  log(`== self-test ==`);
  log(`   JWT RS256 dựng được: ${jwt.split(".").length === 3 ? "✅" : "❌"} (${jwt.length} ký tự, 3 phần)`);
  try {
    await googleToken(fake);
    fail("Google nhận token của khoá giả — điều này KHÔNG nên xảy ra, kiểm lại code.");
  } catch (e) {
    const expected = e.googleError === "invalid_grant" || /Invalid grant/.test(e.message);
    log(`   Google trả lời: ${ok(expected)} ${e.message}`);
    log(expected
      ? "✅ Đường OAuth thông: request đúng khuôn dạng, chỉ thiếu credential THẬT có quyền Release."
      : "⚠ Google trả lỗi khác — kiểm lại mạng/khuôn dạng request.");
    // Đặt exitCode (không process.exit) để Node đóng handle sạch — tránh assertion của libuv trên Windows.
    process.exitCode = expected ? 0 : 1;
  }
}

async function ensureCredential() {
  if (!CRED.json) {
    fail(`Không có credential Google Play. Đã thử:\n   - ${(CRED.tried ?? []).join("\n   - ") || "(không có đường nào)"}\n` +
      `   → cần service account JSON có quyền Release trong Play Console (xem docs/TG-VIBECODE-ANDROID-PLAY-PUBLISH.md §4).`);
  }
  log(`   credential: ${CRED.source} · client_email=${CRED.json.client_email} · project=${CRED.json.project_id ?? "?"}`);
  return googleToken(CRED.json);
}

if (mode === "status") {
  const token = await ensureCredential();
  let edit;
  try {
    edit = await api(token, "POST", `${API}/applications/${PKG}/edits`, {});
  } catch (e) {
    if (e.status === 404) {
      fail(`App ${PKG} CHƯA có trên Google Play (API trả 404). Phải tạo app trong Play Console trước — API không tạo được app mới.`);
    }
    fail(`Không mở được edit cho ${PKG}: ${e.message}`);
  }
  log(`   app ${PKG}: ✅ có trên Play · editId=${edit.id}`);
  const tracks = await api(token, "GET", `${API}/applications/${PKG}/edits/${edit.id}/tracks`);
  for (const t of tracks.tracks ?? []) {
    const rel = (t.releases ?? []).map((r) => `${r.status}${r.userFraction !== undefined ? `@${r.userFraction}` : ""} v[${(r.versionCodes ?? []).join(",")}]`).join(" | ") || "(trống)";
    log(`   track ${t.track}: ${rel}`);
  }
  await api(token, "DELETE", `${API}/applications/${PKG}/edits/${edit.id}`); // dọn edit, không đổi bản phát hành
  log(`   (đã xoá edit tạm — không thay đổi gì trên Play)`);
  process.exit(0);
}

if (mode === "apply") {
  const r = preflight(AAB);
  const pass = printPreflight(r);
  if (!pass) fail("AAB không đạt kiểm tĩnh — dừng trước khi gọi Play.", 1);

  const notesRaw = str(args["notes-file"]) ? fs.readFileSync(str(args["notes-file"]), "utf8")
    : str(args.notes) ?? null;
  let releaseNotes;
  if (notesRaw) {
    try {
      const parsed = JSON.parse(notesRaw);
      releaseNotes = Object.entries(parsed).map(([language, text]) => {
        if (String(text).length > 500) fail(`Release note "${language}" dài ${String(text).length} ký tự (Play giới hạn 500).`);
        return { language, text: String(text) };
      });
    } catch (e) {
      fail(`--notes/--notes-file phải là JSON {"vi":"…","en":"…"}: ${e.message}`);
    }
    log(`   release notes: ${releaseNotes.map((n) => n.language).join(", ")}`);
  }
  if (RELEASE_STATUS === "inProgress" && ROLLOUT === undefined) fail("--release-status inProgress cần --rollout <0..1>.");
  if (RELEASE_STATUS !== "inProgress" && ROLLOUT !== undefined) fail("--rollout chỉ dùng với --release-status inProgress.");
  if (!["draft", "halted", "inProgress", "completed"].includes(RELEASE_STATUS)) fail(`--release-status không hợp lệ: ${RELEASE_STATUS}`);

  if (args["dry-run"]) {
    log(`\n== DRY-RUN (không gọi Play) ==`);
    log(`   1. POST ${API}/applications/${PKG}/edits`);
    log(`   2. POST ${UPLOAD_API}/applications/${PKG}/edits/{editId}/bundles?uploadType=media  (${r.size} byte)`);
    log(`   3. PUT  ${API}/applications/${PKG}/edits/{editId}/tracks/${TRACK}  status=${RELEASE_STATUS}${ROLLOUT !== undefined ? ` userFraction=${ROLLOUT}` : ""}`);
    log(`   4. POST ${API}/applications/${PKG}/edits/{editId}:commit`);
    process.exit(0);
  }

  const token = await ensureCredential();
  const edit = await api(token, "POST", `${API}/applications/${PKG}/edits`, {});
  log(`   edit mở: ${edit.id}`);
  const uploaded = await api(
    token, "POST",
    `${UPLOAD_API}/applications/${PKG}/edits/${edit.id}/bundles?uploadType=media`,
    fs.readFileSync(AAB),
    "application/octet-stream",
  );
  log(`   ✅ đã tải AAB lên: versionCode=${uploaded.versionCode} sha256=${uploaded.sha256?.slice(0, 16) ?? "?"}…`);
  await api(token, "PUT", `${API}/applications/${PKG}/edits/${edit.id}/tracks/${TRACK}`, {
    track: TRACK,
    releases: [{
      status: RELEASE_STATUS,
      versionCodes: [String(uploaded.versionCode)],
      ...(ROLLOUT !== undefined ? { userFraction: ROLLOUT } : {}),
      ...(releaseNotes ? { releaseNotes } : {}),
    }],
  });
  log(`   ✅ gắn vào track "${TRACK}" với status=${RELEASE_STATUS}`);
  const committed = await api(token, "POST", `${API}/applications/${PKG}/edits/${edit.id}:commit`);
  log(`   ✅ commit: ${committed.id ?? "(ok)"}`);
  if (asJson) console.log(JSON.stringify({ ok: true, package: PKG, track: TRACK, status: RELEASE_STATUS, versionCode: uploaded.versionCode }));
  log(`\n✅ ĐÃ NỘP. Kiểm lại trong Play Console (hoặc: node ops/play-upload-aab.mjs --status).`);
}
