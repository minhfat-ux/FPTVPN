#!/usr/bin/env node
/**
 * asc-beta.mjs — thao tác App Store Connect / TestFlight cho VPNFlow bằng API (không cần Xcode).
 *
 * Vì sao có: lần phát hành 1.4.1/18 (23/09/2026) phải viết script tạm ở /tmp mới nộp được
 * Beta App Review. Gom lại thành 1 tool để lần sau chỉ chạy 1 lệnh, và để kiểm chứng bằng
 * chính API (không đoán trạng thái).
 *
 * Dùng:
 *   node scripts/asc-beta.mjs status                       # app + build mới nhất + submission
 *   node scripts/asc-beta.mjs submit <buildNumber>         # gán nhóm external + What to Test + nộp review
 *        [--group "External Test"] [--whatsnew <file.json>] [--wait]
 *
 * What-to-test: file JSON dạng {"en-GB": "...", "vi": "...", "zh-Hans": "..."} — bỏ trống thì không đổi.
 * Khoá: ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8 (đổi bằng ASC_KEY_ID / ASC_ISSUER_ID).
 */
import crypto from "node:crypto";
import fs from "node:fs";

const APP_ID = process.env.ASC_APP_ID ?? "6804150049";           // VPNFlow (com.privatevpn.app)
const KEY_ID = process.env.ASC_KEY_ID ?? "8GW3662G64";
const ISSUER = process.env.ASC_ISSUER_ID ?? "7a64d085-c03d-4b10-9b96-ff8e00c42e79";
const P8 = process.env.ASC_KEY_PATH ?? `${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;
const DEFAULT_GROUP = "External Test";

function token() {
  const key = fs.readFileSync(P8, "utf8");
  const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
  const body = b64({ iss: ISSUER, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

const jwt = token();
async function api(path, method = "GET", body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* 204 rỗng */ }
  return { status: res.status, json };
}

const args = process.argv.slice(2);
const cmd = args[0] ?? "status";
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

async function findBuild(number) {
  const r = await api(`/v1/builds?filter[app]=${APP_ID}&filter[version]=${number}&limit=1&sort=-uploadedDate`);
  return r.json?.data?.[0] ?? null;
}

async function cmdStatus() {
  const app = await api(`/v1/apps/${APP_ID}`);
  console.log("app:", app.json?.data?.attributes?.name, app.json?.data?.attributes?.bundleId, `(id ${APP_ID})`);
  const builds = await api(`/v1/builds?filter[app]=${APP_ID}&limit=5&sort=-uploadedDate`);
  for (const b of builds.json?.data ?? []) {
    const detail = await api(`/v1/builds/${b.id}/buildBetaDetail`);
    const a = detail.json?.data?.attributes ?? {};
    const subs = await api(`/v1/betaAppReviewSubmissions?filter[build]=${b.id}`);
    const sub = subs.json?.data?.[0]?.attributes?.betaReviewState ?? "-";
    console.log(`  build ${String(b.attributes?.version).padEnd(4)} ${String(b.attributes?.processingState).padEnd(9)}` +
      ` internal=${String(a.internalBuildState ?? "-").padEnd(18)} external=${String(a.externalBuildState ?? "-").padEnd(28)}` +
      ` review=${sub}  uploaded=${b.attributes?.uploadedDate}`);
  }
}

async function cmdSubmit(number) {
  if (!number) throw new Error("thiếu <buildNumber>: node scripts/asc-beta.mjs submit 19");
  const build = await findBuild(number);
  if (!build) throw new Error(`không thấy build ${number} trên App Store Connect (đã upload chưa?)`);
  console.log(`build ${number}: id=${build.id} processing=${build.attributes?.processingState}`);
  if (build.attributes?.processingState !== "VALID") {
    console.log("  ⚠️ chưa VALID — chờ Apple xử lý xong rồi chạy lại (không nộp bản đang PROCESSING).");
    return;
  }
  const groupName = flag("group", DEFAULT_GROUP);
  const groups = await api(`/v1/apps/${APP_ID}/betaGroups`);
  const group = (groups.json?.data ?? []).find((g) => g.attributes?.name === groupName && !g.attributes?.isInternalGroup);
  if (!group) throw new Error(`không thấy nhóm external tên "${groupName}"`);
  const add = await api(`/v1/builds/${build.id}/relationships/betaGroups`, "POST", { data: [{ type: "betaGroups", id: group.id }] });
  console.log(`  gán nhóm "${groupName}":`, add.status, add.status === 204 ? "OK" : JSON.stringify(add.json).slice(0, 200));

  const whatsnewFile = flag("whatsnew");
  if (whatsnewFile) {
    const texts = JSON.parse(fs.readFileSync(whatsnewFile, "utf8"));
    for (const [locale, text] of Object.entries(texts)) {
      if (String(text).length > 4000) throw new Error(`whatsNew ${locale} quá dài (${String(text).length})`);
      const cur = await api(`/v1/betaBuildLocalizations?filter[build]=${build.id}&filter[locale]=${encodeURIComponent(locale)}`);
      const ex = cur.json?.data?.[0];
      const r = ex
        ? await api(`/v1/betaBuildLocalizations/${ex.id}`, "PATCH", { data: { type: "betaBuildLocalizations", id: ex.id, attributes: { whatsNew: text } } })
        : await api(`/v1/betaBuildLocalizations`, "POST", { data: { type: "betaBuildLocalizations", attributes: { locale, whatsNew: text }, relationships: { build: { data: { type: "builds", id: build.id } } } } });
      console.log(`  What to Test ${locale}:`, r.status, r.status < 300 ? "OK" : JSON.stringify(r.json).slice(0, 180));
    }
  }

  const sub = await api(`/v1/betaAppReviewSubmissions`, "POST", {
    data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: build.id } } } },
  });
  const state = sub.json?.data?.attributes?.betaReviewState;
  console.log(`  NỘP REVIEW: ${sub.status} state=${state ?? JSON.stringify(sub.json?.errors).slice(0, 200)}`);

  if (args.includes("--wait")) {
    for (let i = 0; i < 40; i += 1) {
      const s = await api(`/v1/betaAppReviewSubmissions?filter[build]=${build.id}`);
      const st = s.json?.data?.[0]?.attributes?.betaReviewState;
      console.log(`   [${i}] review state: ${st}`);
      if (st && !["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(st)) break;
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}

try {
  if (cmd === "status") await cmdStatus();
  else if (cmd === "submit") await cmdSubmit(args[1]);
  else {
    console.log("dùng: node scripts/asc-beta.mjs status | submit <buildNumber> [--group <tên>] [--whatsnew <file.json>] [--wait]");
    process.exit(2);
  }
} catch (err) {
  console.error(`asc-beta: ${err?.message ?? err}`);
  process.exit(1);
}
