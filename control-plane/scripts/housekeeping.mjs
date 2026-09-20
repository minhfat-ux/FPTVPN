#!/usr/bin/env node
/**
 * Housekeeping cho node-2 (control plane + kho phát hành).
 *
 *   node control-plane/scripts/housekeeping.mjs            # DRY-RUN: chỉ đếm (mặc định)
 *   node control-plane/scripts/housekeeping.mjs --apply    # xoá thật
 *   node control-plane/scripts/housekeeping.mjs --json     # báo cáo JSON
 *
 * Dọn gì (đo thật 20/09/2026: /root = 2,2 GB, riêng /root/flowvpn-apk = 1,1 GB):
 *   1. Bản sao lưu gói phát hành cũ trong /root/flowvpn-{apk,ipa,mac}: giữ `--release-keep`
 *      bản MỚI NHẤT mỗi thư mục (mặc định 2), phần còn lại xoá nếu quá `--release-days` (7).
 *      LUÔN giữ file đang phục vụ (`VPNFlow-latest.*`, `VPNFlow-mac.dmg|zip`, `VPNFlow-android7.apk`).
 *   2. File sao lưu mã nguồn rời trong /root (`*.bak-*`, `*.backup-*`, `*.safety-*`) quá `--code-days` (14).
 *   3. `gfw-history.json`: giữ `--gfw-keep` mục mới nhất mỗi host (mặc định 200) — file này
 *      phình theo thời gian vì ghi mỗi lần kiểm tra.
 *   4. `geoip-cache.json`: bỏ mục quá `--geoip-days` (mặc định 60).
 *
 * KHÔNG BAO GIỜ đụng: data/auth.json (tài khoản), data/devices.json (thiết bị khách),
 * ai-*.json, plans.json, app-config.db, node-secret, token, key.
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const JSON_OUT = argv.includes("--json");
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  const value = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const RELEASE_DIRS = ["/root/flowvpn-apk", "/root/flowvpn-ipa", "/root/flowvpn-mac"];
const KEEP_ALWAYS = new Set([
  "VPNFlow-latest.apk", "VPNFlow-android7.apk", "VPNFlow-latest.ipa",
  "VPNFlow-mac.dmg", "VPNFlow-mac.zip",
  "VPNFlow-Setup-latest.exe",
]);
const releaseDays = flag("--release-days", 7);
// Giữ thêm N bản sao lưu MỚI NHẤT mỗi thư mục phát hành (mặc định 2). Tuổi một mình không đủ:
// đo 20/09/2026 có 11 bản APK ~96MB chỉ mới 1-2 ngày tuổi nhưng đã vô dụng (1,1GB).
const releaseKeep = flag("--release-keep", 2);
const codeDays = flag("--code-days", 14);
const gfwKeep = flag("--gfw-keep", 200);
const geoipDays = flag("--geoip-days", 60);
const DATA_DIR = process.env.FLOWVPN_CP_DATA || "/root/flowvpn-cp/data";
const now = Date.now();

const report = { apply: APPLY, startedAt: new Date(now).toISOString(), steps: {} };
const mb = (bytes) => Number((bytes / 1024 / 1024).toFixed(1));

function olderThanDays(file, days) {
  try {
    return now - fs.statSync(file).mtimeMs > days * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Bản sao lưu gói phát hành: chỉ khớp mẫu backup, không bao giờ khớp file đang phục vụ. */
function isReleaseBackup(name) {
  if (KEEP_ALWAYS.has(name)) return false;
  return /(\.backup-|backup-|\.bak-|-bak$)/i.test(name) && /\.(apk|ipa|dmg|zip|exe)$/i.test(name);
}

const release = { files: [], bytes: 0 };
for (const dir of RELEASE_DIRS) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    continue;
  }
  const backups = [];
  for (const name of names) {
    if (!isReleaseBackup(name)) continue;
    const full = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(full);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    backups.push({ full, mtimeMs: stat.mtimeMs, size: stat.size });
  }
  backups.sort((a, b) => b.mtimeMs - a.mtimeMs); // mới nhất trước
  for (const [index, entry] of backups.entries()) {
    const tooOld = now - entry.mtimeMs > releaseDays * 24 * 60 * 60 * 1000;
    if (index < releaseKeep && !tooOld) continue; // trong số N mới nhất và còn mới ⇒ giữ
    if (index < releaseKeep && tooOld) continue;  // vẫn giữ N mới nhất, kể cả đã cũ
    release.files.push(entry.full);
    release.bytes += entry.size;
  }
}
report.steps.releaseBackups = { count: release.files.length, mb: mb(release.bytes), keepDays: releaseDays, keepNewest: releaseKeep };
if (APPLY) {
  let removed = 0;
  for (const file of release.files) {
    try {
      fs.unlinkSync(file);
      removed += 1;
    } catch {
      /* bỏ qua */
    }
  }
  report.steps.releaseBackups.deleted = removed;
}

const code = { files: [], bytes: 0 };
for (const name of fs.readdirSync("/root")) {
  if (!/(\.bak-|\.backup-|\.safety-|\.bak$|\.old$)/i.test(name)) continue;
  const full = path.join("/root", name);
  let stat;
  try {
    stat = fs.statSync(full);
    if (!stat.isFile()) continue;
  } catch {
    continue;
  }
  if (!olderThanDays(full, codeDays)) continue;
  code.files.push(full);
  code.bytes += stat.size;
}
report.steps.codeBackups = { count: code.files.length, mb: mb(code.bytes), keepDays: codeDays };
if (APPLY) {
  let removed = 0;
  for (const file of code.files) {
    try {
      fs.unlinkSync(file);
      removed += 1;
    } catch {
      /* bỏ qua */
    }
  }
  report.steps.codeBackups.deleted = removed;
}

// gfw-history: { updatedAt, hosts: { host: [...] } } — cắt mỗi host còn `gfwKeep` mục mới nhất.
try {
  const file = path.join(DATA_DIR, "gfw-history.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const before = Buffer.byteLength(JSON.stringify(raw));
  let trimmed = 0;
  const hosts = {};
  for (const [host, entries] of Object.entries(raw.hosts ?? {})) {
    if (!Array.isArray(entries)) {
      hosts[host] = entries;
      continue;
    }
    if (entries.length > gfwKeep) trimmed += entries.length - gfwKeep;
    hosts[host] = entries.slice(-gfwKeep);
  }
  const next = { ...raw, hosts };
  report.steps.gfwHistory = {
    file,
    hosts: Object.keys(hosts).length,
    trimmedEntries: trimmed,
    kbBefore: Math.round(before / 1024),
  };
  if (APPLY && trimmed > 0) {
    fs.writeFileSync(file, JSON.stringify(next), "utf8");
    report.steps.gfwHistory.kbAfter = Math.round(fs.statSync(file).size / 1024);
  }
} catch (error) {
  report.steps.gfwHistory = { skipped: true, reason: error?.message ?? String(error) };
}

// geoip-cache: bỏ mục quá cũ (giữ nguyên cấu trúc file).
try {
  const file = path.join(DATA_DIR, "geoip-cache.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const cutoff = now - geoipDays * 24 * 60 * 60 * 1000;
  let dropped = 0;
  const keep = {};
  const entries = raw.entries ?? raw.cache ?? raw;
  for (const [ip, value] of Object.entries(entries)) {
    const at = Date.parse(value?.at ?? value?.updatedAt ?? value?.time ?? "");
    if (Number.isFinite(at) && at < cutoff) {
      dropped += 1;
      continue;
    }
    keep[ip] = value;
  }
  report.steps.geoipCache = { file, entries: Object.keys(keep).length, dropped, keepDays: geoipDays };
  if (APPLY && dropped > 0) {
    const next = raw.entries ? { ...raw, entries: keep } : raw.cache ? { ...raw, cache: keep } : keep;
    fs.writeFileSync(file, JSON.stringify(next), "utf8");
  }
} catch (error) {
  report.steps.geoipCache = { skipped: true, reason: error?.message ?? String(error) };
}

const totalMb = mb(release.bytes + code.bytes);
if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`[housekeeping-cp] apply=${APPLY} — giải phóng tối đa ~${totalMb}MB`);
  console.log(`  • bản sao lưu gói phát hành: ${release.files.length} file (${mb(release.bytes)}MB, giữ ${releaseKeep} bản mới nhất/thư mục)`);
  console.log(`  • sao lưu mã nguồn /root:    ${code.files.length} file (${mb(code.bytes)}MB, cũ hơn ${codeDays} ngày)`);
  console.log(`  • gfw-history:               cắt ${report.steps.gfwHistory.trimmedEntries ?? "?"} mục (giữ ${gfwKeep}/host)`);
  console.log(`  • geoip-cache:               bỏ ${report.steps.geoipCache.dropped ?? "?"} mục cũ hơn ${geoipDays} ngày`);
  if (!APPLY) console.log("  (DRY-RUN: chưa xoá gì. Thêm --apply để chạy thật.)");
}
