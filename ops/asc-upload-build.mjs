#!/usr/bin/env node
/**
 * asc-upload-build.mjs — nộp IPA lên App Store Connect / TestFlight **từ Linux/Windows**,
 * KHÔNG cần macOS (không cần Xcode / altool / iTMSTransporter).
 *
 * VÌ SAO CÓ FILE NÀY
 * ------------------
 * Task T-20260923-03 (App Store Connect) tắc ở đúng một chỗ: WIN chạy Windows, không có
 * `xcrun altool` (macOS-only) nên không nộp được build. Từ WWDC25, App Store Connect API
 * có **đường nộp build thuần HTTPS** (`buildUploads` / `buildUploadFiles`) nên máy Linux
 * cũng nộp được, chỉ cần đúng khoá API ES256 mà node-2 đã có.
 *
 * CƠ CHẾ (đọc từ tài liệu Apple + script thực chiến iTransporter2025public)
 * -----------------------------------------------------------------------
 *   1. Đọc số version BÊN TRONG IPA (không tin tên file) + kiểm tra chữ ký:
 *        · có `ProvisionedDevices`  ⇒ bản Ad Hoc  ⇒ TỪ CHỐI (App Store sẽ trả ITMS-90034)
 *        · `get-task-allow` phải false, nên có `beta-reports-active` cho TestFlight
 *   2. POST /v1/buildUploads        {cfBundleShortVersionString, cfBundleVersion, platform, app}
 *   3. POST /v1/buildUploadFiles    {fileName, fileSize, assetType:"ASSET", uti:"com.apple.ipa"}
 *      → trả `uploadOperations[]` (pre-signed URL + offset/length/headers)
 *   4. PUT từng part, ĐÚNG thứ tự partNumber, kèm đúng requestHeaders,
 *      **KHÔNG** thêm header Authorization (URL đã ký sẵn).
 *   5. PATCH /v1/buildUploadFiles/<id> {uploaded:true}  → Apple bắt đầu xử lý.
 *   6. GET /v1/builds?filter[app]=…  → chờ `processingState` = VALID.
 *
 * CÁCH DÙNG (chạy TRÊN node-2)
 * ----------------------------
 *   node ops/asc-upload-build.mjs --status                       # chỉ đọc, không đụng gì
 *   node ops/asc-upload-build.mjs --preflight --ipa <ipa>        # kiểm IPA, không gọi mạng
 *   node ops/asc-upload-build.mjs --apply --ipa <ipa> \
 *       --expect-version 1.4.3 --expect-build 20 --wait 600
 *
 * Khoá ASC: /root/flowvpn-cp/data/apple-asc.json (đổi bằng ASC_CRED / --cred).
 * KHÔNG in private key ra màn hình.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const APP_ID = str(args["app-id"]) || process.env.ASC_APP_ID || "6804150049";
const CRED = str(args.cred) || process.env.ASC_CRED || "/root/flowvpn-cp/data/apple-asc.json";
const API = str(args["api-base"]) || "https://api.appstoreconnect.apple.com";
const mode = args.apply ? "apply" : args["dry-run"] ? "dry-run" : args.preflight ? "preflight" : "status";
const asJson = Boolean(args.json);
const EXPECT_V = str(args["expect-version"]);
const EXPECT_B = str(args["expect-build"]);
const WAIT_S = Number(str(args.wait) ?? 0);
const DEFAULT_ASC_IPA = "/root/flowvpn-ipa/incoming/VPNFlow-1.4.3-b20-asc.ipa";

const log = (...m) => { if (!asJson) console.log(...m); };
const ok = (b) => (b ? "✅" : "❌");
const fail = (msg, code = 2) => { console.error(`⛔ ${msg}`); process.exit(code); };

// ---------------------------------------------------------------------------
// JWT (ES256) — token sống 15 phút, ký lại mỗi lần gọi cho chắc
// ---------------------------------------------------------------------------
function makeJwt() {
  const d = JSON.parse(fs.readFileSync(CRED, "utf8"));
  const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: d.keyId, typ: "JWT" });
  const body = b64({ iss: d.issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: d.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

async function api(method, apiPath, body, timeoutMs = 120000) {
  const res = await fetch(`${API}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJwt()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* không phải JSON */ }
  return { status: res.status, json, text };
}

function apiErrors(r) {
  const errs = r.json?.errors;
  if (Array.isArray(errs) && errs.length) return errs.map((e) => `${e.status ?? "?"} ${e.code ?? ""} ${e.title ?? ""}: ${e.detail ?? ""}`).join(" | ");
  return `${r.status} ${r.text.slice(0, 400)}`;
}

// ---------------------------------------------------------------------------
// Đọc IPA: version bên trong + chữ ký (dùng python3, không cần macOS)
// ---------------------------------------------------------------------------
const PY_READ_IPA = String.raw`
import sys, zipfile, plistlib, re, json
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
for n in z.namelist():
    if n.startswith("Payload/") and n.endswith(".app/embedded.mobileprovision"):
        raw = z.read(n)
        prof = {}
        m = re.search(rb"<plist.*?</plist>", raw, re.S)
        if m:
            try:
                d = plistlib.loads(m.group(0))
                ent = d.get("Entitlements", {}) or {}
                prof = {"name": d.get("Name"), "team": d.get("TeamIdentifier"),
                        "expires": str(d.get("ExpirationDate")),
                        "provisionedDevices": "ProvisionedDevices" in d,
                        "provisionsAllDevices": "ProvisionsAllDevices" in d,
                        "getTaskAllow": ent.get("get-task-allow"),
                        "betaReportsActive": ent.get("beta-reports-active"),
                        "applicationIdentifier": ent.get("application-identifier")}
            except Exception as e:
                prof = {"parseError": str(e)}
        else:
            prof = {"parseError": "no_plist_in_profile"}
        out["provisioning"] = prof
        break
print(json.dumps(out))
`.trim();

function readIpa(ipaPath) {
  return JSON.parse(execFileSync("python3", ["-c", PY_READ_IPA, ipaPath], { encoding: "utf8", maxBuffer: 8 << 20 }));
}

function describe(info) {
  if (info.error) return `LỖI: ${info.error}`;
  const p = info.provisioning ?? {};
  return `main=${info.main?.short}/${info.main?.bundle} · appex=[${(info.appex ?? []).map((x) => `${x.short}/${x.bundle}`).join(", ") || "—"}]`
    + ` · profile=${p.name ?? "?"} · provisionedDevices=${p.provisionedDevices} · betaReportsActive=${p.betaReportsActive}`
    + ` · getTaskAllow=${p.getTaskAllow}`;
}

// ---------------------------------------------------------------------------
// --preflight
// ---------------------------------------------------------------------------
function doPreflight() {
  const ipa = str(args.ipa) || DEFAULT_ASC_IPA;
  if (!fs.existsSync(ipa)) fail(`Không thấy IPA: ${ipa}`);
  const info = readIpa(ipa);
  if (info.error) fail(`IPA không đọc được: ${info.error}`);
  const v = info.main?.short, b = info.main?.bundle;
  const problems = [];
  if (!v || !b) problems.push("thiếu Payload/<App>.app/Info.plist hoặc số version");
  if (EXPECT_V && v !== EXPECT_V) problems.push(`version bên trong là ${v}, không phải ${EXPECT_V}`);
  if (EXPECT_B && String(b) !== String(EXPECT_B)) problems.push(`build bên trong là ${b}, không phải ${EXPECT_B}`);
  const appexBad = (info.appex ?? []).filter((x) => x.short !== v || x.bundle !== b);
  if (appexBad.length) problems.push(`appex lệch số: ${appexBad.map((x) => `${x.id}=${x.short}/${x.bundle}`).join(", ")}`);
  const p = info.provisioning ?? {};
  if (p.provisionedDevices) problems.push("profile có ProvisionedDevices ⇒ đây là bản Ad Hoc, KHÔNG nộp App Store được (phải dùng IPA app-store-connect)");
  if (p.getTaskAllow === true) problems.push("entitlement get-task-allow=true ⇒ bản debug, App Store sẽ từ chối");

  const report = { ipa, size: fs.statSync(ipa).size, embedded: info.main, appex: info.appex, provisioning: p, problems, ok: problems.length === 0 };
  if (asJson) { console.log(JSON.stringify(report, null, 2)); return problems.length ? 1 : 0; }
  log("═".repeat(78));
  log(`PREFLIGHT IPA (App Store Connect) — ${ipa}`);
  log("═".repeat(78));
  log(`bên trong     : ${describe(info)}`);
  log(`profile hết hạn: ${p.expires ?? "?"} · team=${JSON.stringify(p.team ?? null)}`);
  log(problems.length ? `\n❌ KHÔNG ĐỦ ĐIỀU KIỆN NỘP:\n  - ${problems.join("\n  - ")}` : "\n✅ ĐỦ ĐIỀU KIỆN NỘP (app-store-connect, không phải Ad Hoc)");
  log("═".repeat(78));
  return problems.length ? 1 : 0;
}

// ---------------------------------------------------------------------------
// --status
// ---------------------------------------------------------------------------
async function doStatus() {
  const r = await api("GET", `/v1/builds?filter[app]=${APP_ID}&limit=20&sort=-uploadedDate`);
  const pre = await api("GET", `/v1/preReleaseVersions?filter[app]=${APP_ID}&limit=10&sort=-version`);
  const builds = (r.json?.data ?? []).map((b) => ({
    version: b.attributes.version,
    state: b.attributes.processingState,
    uploaded: b.attributes.uploadedDate,
    minOs: b.attributes.minOsVersion,
    expired: b.attributes.expired,
  }));
  const versions = (pre.json?.data ?? []).map((p) => p.attributes.version);
  const newest = builds[0] ?? null;
  const report = { app_id: APP_ID, builds, preReleaseVersions: versions, newest_build: newest };
  if (asJson) { console.log(JSON.stringify(report, null, 2)); return 0; }
  log("═".repeat(78));
  log(`APP STORE CONNECT — app ${APP_ID} (đọc ${new Date().toISOString()})`);
  log("═".repeat(78));
  log(`builds (mới nhất trước): ${r.status}`);
  for (const b of builds) log(`  build ${b.version} · state=${b.state} · uploaded=${b.uploaded} · minOs=${b.minOs} · expired=${b.expired}`);
  log(`preReleaseVersions: ${versions.join(", ") || "—"}`);
  log(`MỚI NHẤT: ${newest ? `build ${newest.version} · ${newest.state}` : "—"}`);
  log("═".repeat(78));
  return 0;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
async function createUpload(v, b, ipaName, size) {
  const r = await api("POST", "/v1/buildUploads", {
    data: {
      type: "buildUploads",
      attributes: { cfBundleShortVersionString: v, cfBundleVersion: String(b), platform: "IOS" },
      relationships: { app: { data: { type: "apps", id: APP_ID } } },
    },
  });
  if (r.status !== 201 || !r.json?.data?.id) fail(`POST /v1/buildUploads thất bại: ${apiErrors(r)}`);
  return r.json.data.id;
}

async function createFile(buildUploadId, ipaName, size) {
  const r = await api("POST", "/v1/buildUploadFiles", {
    data: {
      type: "buildUploadFiles",
      attributes: { fileName: ipaName, fileSize: size, assetType: "ASSET", uti: "com.apple.ipa" },
      relationships: { buildUpload: { data: { type: "buildUploads", id: buildUploadId } } },
    },
  });
  if (r.status !== 201 || !r.json?.data?.id) fail(`POST /v1/buildUploadFiles thất bại: ${apiErrors(r)}`);
  return r.json.data;
}

async function putParts(buf, fileData) {
  const ops = [...(fileData.attributes?.uploadOperations ?? [])];
  if (!ops.length) fail("Apple không trả uploadOperations — không có gì để đẩy.");
  ops.sort((a, b) => (a.partNumber ?? 0) - (b.partNumber ?? 0));
  const done = [];
  for (const op of ops) {
    const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
    const slice = buf.subarray(op.offset ?? 0, (op.offset ?? 0) + (op.length ?? buf.length));
    let okPart = false, lastErr = "";
    for (let attempt = 1; attempt <= 3 && !okPart; attempt++) {
      try {
        const r = await fetch(op.url, { method: op.method ?? "PUT", headers, body: slice, signal: AbortSignal.timeout(600000) });
        if (r.ok) { okPart = true; }
        else { lastErr = `HTTP ${r.status} ${(await r.text()).slice(0, 300)}`; await sleep(1000 * attempt); }
      } catch (e) { lastErr = e.message; await sleep(1000 * attempt); }
    }
    if (!okPart) fail(`Đẩy part ${op.partNumber} thất bại sau 3 lần: ${lastErr}`);
    done.push({ partNumber: op.partNumber, offset: op.offset, length: op.length });
    log(`  … part ${op.partNumber}/${ops.length} OK (offset=${op.offset} length=${op.length})`);
  }
  return done;
}

async function pollBuilds(v, b, waitS) {
  const deadline = Date.now() + waitS * 1000;
  let last = null;
  for (;;) {
    const r = await api("GET", `/v1/builds?filter[app]=${APP_ID}&filter[version]=${encodeURIComponent(String(b))}&limit=10&sort=-uploadedDate&include=preReleaseVersion`);
    const build = (r.json?.data ?? []).find((x) => String(x.attributes.version) === String(b)) ?? (r.json?.data ?? [])[0] ?? null;
    last = build ? { version: build.attributes.version, state: build.attributes.processingState, uploaded: build.attributes.uploadedDate } : null;
    log(`  … build ${b}: ${last ? `state=${last.state} uploaded=${last.uploaded}` : "chưa thấy trong /v1/builds"}`);
    if (last && ["VALID", "INVALID", "FAILED"].includes(last.state)) return last;
    if (Date.now() >= deadline) return last;
    await sleep(20000);
  }
}

async function doApply() {
  const ipa = str(args.ipa) || DEFAULT_ASC_IPA;
  if (!fs.existsSync(ipa)) fail(`Không thấy IPA: ${ipa}`);
  const info = readIpa(ipa);
  if (info.error) fail(`IPA không đọc được: ${info.error}`);
  const v = info.main?.short, b = info.main?.bundle;
  if (!v || !b) fail("IPA thiếu số version bên trong.");
  if (EXPECT_V && v !== EXPECT_V) fail(`Version bên trong là ${v}, không phải ${EXPECT_V}. Không nộp.`);
  if (EXPECT_B && String(b) !== String(EXPECT_B)) fail(`Build bên trong là ${b}, không phải ${EXPECT_B}. Không nộp.`);
  const p = info.provisioning ?? {};
  if (p.provisionedDevices) fail("IPA ký bằng profile Ad Hoc (có ProvisionedDevices) — App Store sẽ từ chối. Dùng bản app-store-connect.");

  const buf = fs.readFileSync(ipa);
  const ipaName = path.basename(ipa);
  log(`IPA nguồn: ${ipa}`);
  log(`  ${buf.length} B · ${describe(info)}`);
  log(`  sha256=${crypto.createHash("sha256").update(buf).digest("hex")}`);

  log(`… POST /v1/buildUploads (app=${APP_ID} ${v}/${b})`);
  const uploadId = await createUpload(v, b, ipaName, buf.length);
  log(`  buildUploadId=${uploadId}`);

  if (mode === "dry-run") {
    log("… dry-run: xin thử buildUploadFiles rồi xoá phiên, KHÔNG đẩy byte nào");
    const f = await createFile(uploadId, ipaName, buf.length);
    log(`  uploadOperations=${(f.attributes?.uploadOperations ?? []).length}`);
    const del = await api("DELETE", `/v1/buildUploads/${uploadId}`);
    log(`  đã xoá phiên: HTTP ${del.status}`);
    return 0;
  }

  log("… POST /v1/buildUploadFiles");
  const f = await createFile(uploadId, ipaName, buf.length);
  const fileId = f.id;
  log(`  buildUploadFileId=${fileId} · ${(f.attributes?.uploadOperations ?? []).length} part`);

  await putParts(buf, f);

  log("… PATCH buildUploadFiles {uploaded:true} (chốt, Apple bắt đầu xử lý)");
  const commit = await api("PATCH", `/v1/buildUploadFiles/${fileId}`, {
    data: { type: "buildUploadFiles", id: fileId, attributes: { uploaded: true } },
  });
  if (commit.status !== 200) fail(`PATCH buildUploadFiles thất bại: ${apiErrors(commit)}`);
  log(`  commit state=${commit.json?.data?.attributes?.state ?? "?"}`);

  const state = await api("GET", `/v1/buildUploads/${uploadId}`);
  const uploadState = state.json?.data?.attributes?.state ?? "?";

  let build = null;
  if (WAIT_S > 0) {
    log(`… chờ Apple xử lý (tối đa ${WAIT_S}s)`);
    build = await pollBuilds(v, b, WAIT_S);
  }

  const passed = uploadState === "COMPLETE" || (build && ["VALID", "PROCESSING"].includes(build.state));
  const report = {
    changed: true, ipa, sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    version: v, build_number: String(b), app_id: APP_ID,
    buildUploadId: uploadId, buildUploadFileId: fileId, upload_state: uploadState,
    latest_build: build ?? undefined, passed: Boolean(passed),
  };
  if (asJson) { console.log(JSON.stringify(report, null, 2)); return passed ? 0 : 4; }
  log("");
  log("═".repeat(78));
  log(`KẾT QUẢ NỘP APP STORE CONNECT: ${v} (build ${b})`);
  log("═".repeat(78));
  log(`buildUploadId      : ${uploadId}`);
  log(`buildUploadFileId  : ${fileId}`);
  log(`upload state       : ${uploadState}`);
  if (build) log(`build mới nhất     : build ${build.version} · processingState=${build.state}`);
  log("");
  log(ok(passed) + (passed ? " ĐÃ NỘP — Apple đang xử lý" : " CÓ VẤN ĐỀ — xem chi tiết trên"));
  log("═".repeat(78));
  return passed ? 0 : 4;
}

// ---------------------------------------------------------------------------
try {
  let code;
  if (mode === "apply" || mode === "dry-run") code = await doApply();
  else if (mode === "preflight") code = doPreflight();
  else code = await doStatus();
  process.exit(code ?? 0);
} catch (err) {
  console.error(`⛔ Lỗi: ${err.stack ?? err.message}`);
  process.exit(1);
}
