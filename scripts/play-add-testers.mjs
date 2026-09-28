#!/usr/bin/env node
/**
 * play-add-testers.mjs — kiem tra app + quan ly TESTER tren Google Play Console.
 *
 * Vi sao co: chu du an yeu cau "dang ky toan bo user dung ban android vao Google Play Console
 * nhu tester" (26-27/09/2026). Viec nay thuoc kenh Android (owner windows, AGENTS §0 luat 12) va
 * credential Play nam o harness Windows ⇒ script nay chay TREN MAY CO credential, khong chua secret.
 *
 * Credential (khong bao gio in ra man hinh):
 *   PLAY_SERVICE_ACCOUNT_FILE  duong dan file JSON service account (mac dinh ~/.vpnflow-play/play-admin.json)
 *   PLAY_SERVICE_ACCOUNT_JSON  hoac JSON noi tuyen (uu tien neu co)
 *
 * Dung:
 *   node scripts/play-add-testers.mjs check  --package com.privatevpn.app
 *   node scripts/play-add-testers.mjs group  --package com.privatevpn.app --track internal --group dev@googlegroups.com
 *   node scripts/play-add-testers.mjs ui-steps --file <danh-sach-email.txt>
 *
 * LUU Y QUAN TRONG (gioi han cua API):
 *   API Google Play (androidpublisher) chi quan duoc tester theo **Google Group**
 *   (`track.testers.googleGroups`). DANH SACH EMAIL THU CONG khong co endpoint ⇒ phai dan vao
 *   Play Console UI (Testing → Closed/Internal testing → Testers → Create email list) hoac dua
 *   9 email do vao mot Google Group roi gan group lam tester bang lenh `group`.
 *   ⇒ `ui-steps` in san cac buoc + danh sach email de dan.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

const args = process.argv.slice(2);
const cmd = args[0] ?? "check";
const flag = (name, fb = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fb;
};

function loadCredential() {
  const inline = (process.env.PLAY_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (inline) return JSON.parse(inline);
  const file = process.env.PLAY_SERVICE_ACCOUNT_FILE
    || path.join(os.homedir(), ".vpnflow-play", "play-admin.json");
  if (!fs.existsSync(file)) {
    throw new Error(`khong thay credential Play: ${file} (dat PLAY_SERVICE_ACCOUNT_FILE hoac PLAY_SERVICE_ACCOUNT_JSON)`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(cred) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: cred.client_email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(cred.private_key);
  const assertion = `${signingInput}.${b64url(signature)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`doi token that bai: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json.access_token;
}

async function api(token, url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* giu text */ }
  return { status: res.status, json, text };
}

function needPackage() {
  const pkg = flag("package", process.env.PLAY_PACKAGE_NAME ?? "com.privatevpn.app");
  if (!pkg) throw new Error("thieu --package");
  return pkg;
}

async function cmdCheck() {
  const pkg = needPackage();
  const cred = loadCredential();
  console.log(`service account: ${String(cred.client_email).replace(/^[^@]{3}/, "***")} · project=${cred.project_id ?? "?"}`);
  const token = await accessToken(cred);
  const edit = await api(token, `${API}/${pkg}/edits`, "POST", {});
  if (edit.status >= 300) {
    console.log(`⛔ app "${pkg}" KHONG mo duoc bang credential nay: HTTP ${edit.status} ${edit.text.slice(0, 200)}`);
    console.log("   ⇒ hoac app chua co tren Google Play, hoac service account thieu quyen (can 'Edit app' + 'Manage testing tracks').");
    return;
  }
  const id = edit.json.id;
  const details = await api(token, `${API}/${pkg}/edits/${id}/details`);
  const tracks = await api(token, `${API}/${pkg}/edits/${id}/tracks`);
  console.log(`app: ${details.json?.defaultLanguage ? "" : ""}${pkg} · ten=${details.json?.contactEmail ? "(co)" : "(khong ro)"}`);
  for (const t of tracks.json?.tracks ?? []) {
    const releases = (t.releases ?? []).map((r) => `${r.status}:${r.versionCodes?.join(",") ?? ""}`).join(" | ") || "-";
    const testers = t.testers ?? {};
    console.log(`  track ${String(t.track).padEnd(10)} testers=${JSON.stringify(testers)} releases=${releases}`);
  }
  await api(token, `${API}/${pkg}/edits/${id}`, "DELETE");
}

async function cmdGroup() {
  const pkg = needPackage();
  const track = flag("track");
  const group = flag("group");
  if (!track || !group) throw new Error("can --track <internal|alpha|beta|...> va --group <email google group>");
  const cred = loadCredential();
  const token = await accessToken(cred);
  const edit = await api(token, `${API}/${pkg}/edits`, "POST", {});
  if (edit.status >= 300) throw new Error(`khong mo duoc edit cho ${pkg}: HTTP ${edit.status}`);
  const id = edit.json.id;
  const cur = await api(token, `${API}/${pkg}/edits/${id}/tracks/${track}`);
  if (cur.status >= 300) throw new Error(`khong doc duoc track ${track}: HTTP ${cur.status} ${cur.text.slice(0, 160)}`);
  const body = { ...cur.json, testers: { ...(cur.json.testers ?? {}), googleGroups: [group] } };
  const put = await api(token, `${API}/${pkg}/edits/${id}/tracks/${track}`, "PUT", body);
  console.log(`gan Google Group "${group}" lam tester track ${track}:`, put.status, put.status < 300 ? "OK" : put.text.slice(0, 200));
  if (put.status < 300) {
    const commit = await api(token, `${API}/${pkg}/edits/${id}:commit`, "POST", {});
    console.log("commit edit:", commit.status, commit.status < 300 ? "OK" : commit.text.slice(0, 200));
  } else {
    await api(token, `${API}/${pkg}/edits/${id}`, "DELETE");
  }
}

function cmdUiSteps() {
  const file = flag("file");
  if (!file || !fs.existsSync(file)) throw new Error("can --file <danh-sach-email.txt> (moi dong 1 email)");
  const emails = fs.readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s.includes("@"));
  console.log(`danh sach: ${emails.length} email (nguon ${file})`);
  console.log("\nDAN SACH EMAIL (dan vao Play Console):");
  for (const e of emails) console.log(`  ${e}`);
  console.log(`
BUOC TRONG PLAY CONSOLE (danh sach email thu cong — API khong lam duoc):
  1. https://play.google.com/console → chon app (package com.privatevpn.app)
  2. Test and release → Testing → Closed testing (hoac Internal testing)
  3. Tab "Testers" → "Create email list" → dat ten (vd: vpnflow-android-users) → dan ${emails.length} email o tren → Save
  4. Quay lai track → "Testers" → chon email list vua tao → Save
  5. Copy "Join on the web"/"Opt-in URL" → gui cho khach (hoac de ho tu bam link trong email)
  6. Neu muon API quan duoc: tao 1 Google Group chua ${emails.length} email nay roi chay
       node scripts/play-add-testers.mjs group --package com.privatevpn.app --track internal --group <group>@googlegroups.com
`);
}

try {
  if (cmd === "check") await cmdCheck();
  else if (cmd === "group") await cmdGroup();
  else if (cmd === "ui-steps") cmdUiSteps();
  else {
    console.log("dung: node scripts/play-add-testers.mjs check|group|ui-steps [--package <pkg>] [--track <t>] [--group <g>] [--file <emails.txt>]");
    process.exit(2);
  }
} catch (err) {
  console.error(`play-add-testers: ${err?.message ?? err}`);
  process.exit(1);
}
