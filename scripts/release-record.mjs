#!/usr/bin/env node
/**
 * release-record.mjs — SO DANG KY PHAT HANH (append-only) + kiem tra + tao git tag.
 *
 * Vi sao co file nay: version cua VPNFlow dang nam rai rac o 6-7 cho (project.yml, build.gradle.kts,
 * csproj, .iss, Info.plist, moc tren server) va bang nhat ky markdown tung bi xoa nham (commit 7defd33,
 * 22/09/2026). So nay la nguon su that: moi lan phat hanh 1 dong JSON, KHONG sua dong cu.
 * Luat & schema: docs/VERSIONING.md. Quy trinh: docs/PUBLISHER_PROCESS.md §2b + §6.
 *
 * Dung:
 *   node scripts/release-record.mjs list [--platform ios] [--all]
 *   node scripts/release-record.mjs verify [--platform ios] [--strict]
 *   node scripts/release-record.mjs append --platform ios --version 1.4.1 --build 17 \
 *       --sha256 <hash> --size <bytes> --marker-latest 1.4.1 [--internal-version 1.4.1] \
 *       [--commit <sha>] [--verified-by "iPhone 15 / iOS 18.2"] [--evidence <duong-dan>] [--dry-run]
 *   node scripts/release-record.mjs tag --platform ios [--version 1.4.1]
 *
 * Ma thoat: 0 = DAT · 1 = CO LOI CUNG (dung phat hanh) · 2 = sai cach dung / thieu tham so.
 * Khong dung dependency ngoai. Moi lenh git can DOC stdout deu ghi ra FILE TAM (khong dung pipe —
 * sandbox cua harness Windows chan `spawn` co pipe: EPERM); `git tag` dung stdio inherit khi tao tag.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const LEDGER = process.env.RELEASE_LEDGER || path.join(REPO, "release", "releases.jsonl");

const PLATFORMS = ["ios", "macos", "android", "android-legacy", "windows"];
/** Dong mo ta trang thai dang phat (tag/rollback la dong phu, khong tinh vao kiem tra tien version). */
const STATE_ORIGINS = new Set(["publish", "backfill"]);
const CHANNELS = {
  ios: "/v1/downloads/ios",
  macos: "/v1/downloads/mac",
  android: "/v1/downloads/android",
  "android-legacy": "/v1/downloads/android-legacy",
  windows: "/dl/VPNFlow-Setup-{version}.exe",
};

function die(message, code = 2) {
  console.error(message);
  process.exit(code);
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, fallback = "") => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

function readLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  const rows = [];
  for (const [index, line] of fs.readFileSync(LEDGER, "utf8").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      rows.push({ ...JSON.parse(line), __line: index + 1 });
    } catch (error) {
      die(`⛔ Dong ${index + 1} trong ${path.relative(REPO, LEDGER)} khong phai JSON hop le: ${error.message}`, 1);
    }
  }
  return rows;
}

function appendRow(row) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  const line = JSON.stringify(row, Object.keys(row).sort()) + "\n";
  fs.appendFileSync(LEDGER, line, "utf8");
  return line;
}

function norm(value) {
  const text = String(value ?? "").trim().split("+")[0];
  const parts = text.split(".");
  while (parts.length > 3 && parts[parts.length - 1] === "0") parts.pop();
  return parts.join(".");
}

function compare(a, b) {
  const left = norm(a).split(".").map((x) => (x === "" ? 0 : Number(x) || 0));
  const right = norm(b).split(".").map((x) => (x === "" ? 0 : Number(x) || 0));
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const li = left[i] ?? 0;
    const ri = right[i] ?? 0;
    if (li !== ri) return li < ri ? -1 : 1;
  }
  return 0;
}

function stateRows(rows, platform) {
  return rows.filter((r) => r.platform === platform && STATE_ORIGINS.has(r.origin));
}

function latestState(rows, platform) {
  const list = stateRows(rows, platform);
  return list.length ? list[list.length - 1] : undefined;
}

function tagOf(rows, platform) {
  // Chi lay tag cua DUNG version dang phat — neu lay "dong cuoi co tag" thi ban 1.4.3 se hien tag cua 1.4.0.
  const current = latestState(rows, platform);
  const want = current ? current.version : null;
  const withTag = rows.filter((r) => r.platform === platform && r.tag && (!want || r.version === want));
  return withTag.length ? withTag[withTag.length - 1].tag : "";
}

function pad(text, width) {
  const value = String(text ?? "");
  return value.length >= width ? value.slice(0, width) : value + " ".repeat(width - value.length);
}

/**
 * Chay git va tra stdout da trim — qua FILE TAM, khong qua pipe.
 * Vi sao khong dung `execFileSync(..., { encoding })`: sandbox cua harness Windows chan `spawn` co pipe
 * (EPERM: khong mo duoc named pipe) ⇒ moi cach doc stdout qua pipe deu nem EPERM. Ghi stdout ra file tam
 * roi doc lai khong dung pipe, va van HOI GIT nen dung cho ca clone thuong lan worktree lien ket.
 */
function gitOut(args) {
  const tmp = path.join(
    os.tmpdir(),
    `release-record-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  const fd = fs.openSync(tmp, "w");
  try {
    execFileSync("git", args, { cwd: REPO, stdio: ["ignore", fd, "inherit"] });
    return fs.readFileSync(tmp, "utf8").trim();
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* file tam khong xoa duoc cung khong anh huong ket qua */
    }
  }
}

/**
 * Tag da ton tai chua — hoi thang `git`, KHONG doc `<repo>/.git/refs/tags` bang fs.
 * Trong worktree lien ket, `<repo>/.git` la FILE (`gitdir: …`) chu khong phai thu muc, nen cach doc fs
 * luon tra false ⇒ nhanh "tag da ton tai va tro dung thi bo qua" thanh dead code, tool roi vao
 * `git tag -a` va nem loi khong bat (loi that 22/09/2026). `rev-parse --verify --quiet` dung cho ca
 * clone thuong lan worktree vi no hoi git chu khong tu doan duong dan.
 */
function tagExists(tag) {
  try {
    gitOut(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------- list

function cmdList() {
  const rows = readLedger();
  const platform = flag("platform");
  const only = platform ? [platform] : PLATFORMS;
  if (platform && !PLATFORMS.includes(platform)) die(`platform khong hop le: ${platform}`, 2);
  // Noi cot TAG theo tag dai nhat dang in: `android-legacy-v1.4.0` (21 ky tu) tung bi pad() cat thanh
  // "android-legacy-v1." va dinh lien cot sau ⇒ doc sai tag.
  const tagWidth = Math.max(18, ...only.map((p) => (tagOf(rows, p) || "-").length + 2));
  console.log(`So phat hanh: ${path.relative(REPO, LEDGER)} — ${rows.length} dong`);
  console.log(
    pad("NEN TANG", 16) + pad("VERSION", 10) + pad("BUILD", 7) + pad("MOC", 10) +
    pad("SIZE", 12) + pad("SHA256", 14) + pad("MTIME", 20) + pad("TAG", tagWidth) + "TRONG FILE",
  );
  for (const p of only) {
    const row = latestState(rows, p);
    if (!row) {
      console.log(pad(p, 16) + pad("(chua co dong nao)", 10));
      continue;
    }
    const internal = row.internal_version ? `${row.internal_version}${row.internal_build ? `/${row.internal_build}` : ""}` : "CHUA KIEM";
    console.log(
      pad(p, 16) + pad(row.version, 10) + pad(row.build ?? "-", 7) + pad(row.marker_latest ?? "-", 10) +
      pad(row.size ?? "-", 12) + pad(String(row.sha256 ?? "").slice(0, 12), 14) +
      pad(row.artifact_mtime ?? "-", 20) + pad(tagOf(rows, p) || "-", tagWidth) + internal,
    );
  }
  if (has("all")) {
    console.log("\n-- tat ca dong --");
    for (const row of rows) {
      console.log(
        `#${pad(row.__line, 4)} ${pad(row.at, 21)} ${pad(row.platform, 15)} ${pad(row.version, 9)} ` +
        `${pad(row.origin ?? "-", 9)} ${row.status ?? "-"} ${row.tag ? `tag=${row.tag}` : ""} ${row.notes ? "· " + row.notes : ""}`,
      );
    }
  }
}

// --------------------------------------------------------------------------- verify

function cmdVerify() {
  const rows = readLedger();
  const platform = flag("platform");
  const only = platform ? [platform] : PLATFORMS;
  const fails = [];
  const warns = [];
  const oks = [];

  const hashes = new Map(); // platform@version -> sha256
  for (const row of rows) {
    const key = `${row.platform}@${row.version}`;
    const seen = hashes.get(key);
    if (seen && row.sha256 && seen !== row.sha256) {
      fails.push(`artifact KHONG bat bien: ${key} co 2 sha256 khac nhau (${seen.slice(0, 12)}… vs ${row.sha256.slice(0, 12)}…) o dong ${row.__line}`);
    } else if (row.sha256) {
      hashes.set(key, row.sha256);
    }
  }

  for (const p of only) {
    if (!PLATFORMS.includes(p)) die(`platform khong hop le: ${p}`, 2);
    const list = stateRows(rows, p);
    if (!list.length) {
      warns.push(`${p}: chua co dong nao trong so`);
      continue;
    }
    let prev;
    for (const row of list) {
      const where = `${p} ${row.version} (dong ${row.__line})`;
      if (!row.size || !row.sha256) fails.push(`${where}: thieu size/sha256 — khong co bang chung artifact`);
      if (!/^[0-9a-f]{64}$/.test(String(row.sha256 ?? ""))) fails.push(`${where}: sha256 khong phai 64 ky tu hex`);
      if (row.version !== row.marker_latest) warns.push(`${where}: moc server dang la ${row.marker_latest ?? "(trong)"} — lech voi so`);
      if (!row.internal_version) warns.push(`${where}: chua doc version BEN TRONG artifact (internal_version=null)`);
      if (!row.verified_by || !row.evidence) warns.push(`${where}: thieu verified_by/evidence (dieu kien #3 §2b)`);
      if (!row.commit) warns.push(`${where}: thieu commit build ⇒ khong tao duoc tag`);
      if (prev) {
        const cmp = compare(row.version, prev.version);
        if (cmp < 0) fails.push(`${where}: PHAT HANH LUI so voi ${prev.version} (dong ${prev.__line})`);
        if (cmp === 0 && row.build && prev.build && Number(row.build) <= Number(prev.build) && row.sha256 !== prev.sha256) {
          fails.push(`${where}: cung version nhung build ${row.build} <= ${prev.build} (dong ${prev.__line})`);
        }
      }
      prev = row;
      oks.push(`${where}: so hop le (size ${row.size} B, sha256 ${String(row.sha256).slice(0, 12)}…)`);
    }
    if (list.length && !tagOf(rows, p)) warns.push(`${p}: chua co tag git (${p}-v${list[list.length - 1].version})`);
  }

  for (const line of oks) console.log(`  [DAT]           ${line}`);
  for (const line of warns) console.log(`  [CANH BAO]      ${line}`);
  for (const line of fails) console.log(`  [KHONG DAT]     ${line}`);
  console.log(`\nKet qua: ${oks.length} DAT · ${warns.length} CANH BAO · ${fails.length} KHONG DAT`);
  if (fails.length) {
    console.log("⛔ DUNG: sua so truoc khi phat hanh (xem docs/VERSIONING.md).");
    process.exit(1);
  }
  if (warns.length && has("strict")) {
    console.log("⛔ --strict: canh bao cung tinh la loi.");
    process.exit(1);
  }
  console.log(warns.length ? "✅ Khong co loi cung (con canh bao — doc ky truoc khi phat hanh)." : "✅ So sach.");
}

// --------------------------------------------------------------------------- append

function cmdAppend() {
  const platform = flag("platform");
  if (!platform) die("thieu --platform (ios|macos|android|android-legacy|windows)", 2);
  if (!PLATFORMS.includes(platform)) die(`platform khong hop le: ${platform}`, 2);
  const version = flag("version");
  if (!version) die("thieu --version", 2);

  const row = {
    at: new Date().toISOString(),
    platform,
    version,
    build: flag("build") || null,
    channel: flag("channel") || CHANNELS[platform].replace("{version}", version),
    artifact: flag("artifact") || null,
    size: flag("size") ? Number(flag("size")) : null,
    sha256: (flag("sha256") || "").toLowerCase() || null,
    artifact_mtime: flag("artifact-mtime") || null,
    marker_latest: flag("marker-latest") || null,
    marker_build: flag("marker-build") || null,
    internal_version: flag("internal-version") || null,
    internal_build: flag("internal-build") || null,
    commit: flag("commit") || null,
    commit_source: flag("commit-source") || null,
    tag: flag("tag") || null,
    status: flag("status") || "published",
    verified_by: flag("verified-by") || null,
    evidence: flag("evidence") || null,
    origin: flag("origin") || "publish",
    recorded_by: flag("recorded-by") || process.env.FPT_OWNER || "windows",
    notes: flag("notes") || null,
  };

  if (row.sha256 && !/^[0-9a-f]{64}$/.test(row.sha256)) die("--sha256 phai la 64 ky tu hex", 2);
  if (row.status === "published" && (!row.size || !row.sha256)) {
    die("⛔ dong published phai co --size va --sha256 (do tu file that, khong lay tu docs)", 1);
  }

  const rows = readLedger();
  const prev = latestState(rows, platform);
  if (prev && row.status === "published") {
    const cmp = compare(row.version, prev.version);
    if (cmp < 0) die(`⛔ PHAT HANH LUI: ${platform} dang o ${prev.version} (dong ${prev.__line}), dinh ghi ${row.version}`, 1);
    if (cmp === 0 && prev.sha256 && row.sha256 && prev.sha256 !== row.sha256) {
      // NGOAI LE CO GHI SO (chi khi duoc chot): cung version nhung khac sha256 ⇒ pham artifact bat bien
      // (docs/VERSIONING.md §3.3). Ca that 26/09/2026: chu du an chot phat 1.4.6/build 54 de khach TQ
      // nhan ngay ban chong "bam Connect la fail" tren 5G, thay cho 1.4.6/build 50.
      // Dung: --allow-rehash --reason "<chot cua ai, ngay nao>" (ly do duoc ghi vao chinh dong so).
      if (!has("allow-rehash")) {
        die(`⛔ ARTIFACT KHONG BAT BIEN: ${platform} ${row.version} da co sha256 ${prev.sha256.slice(0, 12)}… — hash moi ${row.sha256.slice(0, 12)}… ⇒ phat hanh version MOI (hoac dung --allow-rehash --reason "…" neu chu du an da chot ngoai le)`, 1);
      }
      const reason = flag("reason");
      if (!reason) die("--allow-rehash bat buoc phai kem --reason \"<chot cua ai, ngay nao>\"", 2);
      console.error(`⚠️  NGOAI LE artifact bat bien: ${platform} ${row.version} · ${prev.sha256.slice(0, 12)}… → ${row.sha256.slice(0, 12)}… · ly do: ${reason}`);
      row.notes = `[NGOAI LE artifact bat bien — ${reason}] ${row.notes ?? ""}`.trim();
    }
  }

  const line = JSON.stringify(row, Object.keys(row).sort());
  if (has("dry-run")) {
    console.log("(dry-run) se ghi dong:");
    console.log(line);
    return;
  }
  appendRow(row);
  console.log(`Da ghi so: ${platform} ${version}${row.build ? ` (build ${row.build})` : ""} · ${path.relative(REPO, LEDGER)}`);
  if (!row.internal_version) console.log("  ⚠️  internal_version=null — phai doc version BEN TRONG artifact (cong chan --mode post) truoc khi gui email.");
  if (!row.commit) console.log(`  ⚠️  thieu --commit ⇒ chua tao duoc tag ${platform}-v${version}.`);
}

// --------------------------------------------------------------------------- tag

function cmdTag() {
  const platform = flag("platform");
  if (!platform) die("thieu --platform", 2);
  const rows = readLedger();
  const row = latestState(rows, platform);
  if (!row) die(`chua co dong nao cho ${platform}`, 1);
  const version = flag("version") || row.version;
  if (version !== row.version) die(`version ${version} khong phai dong moi nhat (${row.version})`, 1);
  if (!row.commit) {
    die(`⛔ dong so cua ${platform} ${version} thieu commit build ⇒ khong tao tag. Bo sung bang:\n` +
        `   node scripts/release-record.mjs append --platform ${platform} --version ${version} --commit <sha> --origin backfill --status published ...`, 1);
  }
  const tag = `${platform}-v${version}`;
  const commit = row.commit;
  if (tagExists(tag)) {
    const existing = gitOut(["rev-list", "-n1", tag]);
    if (existing === commit) {
      console.log(`tag ${tag} da ton tai va dang tro dung commit ${commit.slice(0, 12)}… — khong lam gi.`);
      return;
    }
    die(
      `⛔ tag ${tag} da ton tai nhung tro ${existing.slice(0, 12)}… trong khi so ghi commit build ` +
      `${commit.slice(0, 12)}… — KHONG tao lai tag (moc bat bien). Sua bang dong so moi hoac version moi.`,
      1,
    );
  }
  const message = [
    `${platform} ${version}${row.build ? ` (build ${row.build})` : ""}`,
    `sha256: ${row.sha256}`,
    `size: ${row.size} B`,
    `commit build: ${row.commit}${row.commit_source ? ` (nguon: ${row.commit_source})` : ""}`,
    `moc server: ${row.marker_latest ?? "-"}`,
    `verify: ${row.verified_by ?? "chua ghi"}${row.evidence ? ` · ${row.evidence}` : ""}`,
    `ghi so: ${row.at} boi ${row.recorded_by}`,
  ].join("\n");
  // PHẢI truyền commit tường minh: `git tag -a <tag> -m <msg>` (khong co commit) se neo vao HEAD
  // cua cay lam viec — ma cay lam viec thuong DANG SAU origin/main, nen tag tro sai commit trong khi
  // message van ghi dung commit build (loi that 22/09/2026 voi windows-v1.4.3: message ghi 64e07c7
  // nhung tag tro 7ae07f0). Tag la moc "ban khach chay build tu ma nguon nao" ⇒ sai la mat tac dung.
  execFileSync("git", ["tag", "-a", tag, commit, "-m", message], { cwd: REPO, stdio: ["ignore", "inherit", "inherit"] });
  const anchored = gitOut(["rev-list", "-n1", tag]);
  if (anchored !== commit) {
    die(`⛔ tag ${tag} vua tao nhung tro ${anchored} — KHONG khop commit build ${commit}.`, 1);
  }
  appendRow({
    at: new Date().toISOString(),
    platform,
    version,
    build: row.build ?? null,
    sha256: row.sha256 ?? null,
    size: row.size ?? null,
    tag,
    status: row.status ?? "published",
    origin: "tag",
    recorded_by: process.env.FPT_OWNER || "windows",
    notes: `tao tag ${tag} cho commit ${row.commit}`,
  });
  console.log(`Da tao tag ${tag} (neo commit ${row.commit}) + ghi 1 dong vao so.`);
}

// --------------------------------------------------------------------------- main

switch (cmd) {
  case "list":
    cmdList();
    break;
  case "verify":
    cmdVerify();
    break;
  case "append":
    cmdAppend();
    break;
  case "tag":
    cmdTag();
    break;
  default:
    die(
      "Dung:\n" +
      "  node scripts/release-record.mjs list [--platform <p>] [--all]\n" +
      "  node scripts/release-record.mjs verify [--platform <p>] [--strict]\n" +
      "  node scripts/release-record.mjs append --platform <p> --version <v> --sha256 <hash> --size <bytes> --marker-latest <v> [...]\n" +
      "  node scripts/release-record.mjs tag --platform <p> [--version <v>]\n" +
      "Luat & schema: docs/VERSIONING.md",
      2,
    );
}
