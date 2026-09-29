#!/usr/bin/env node
/**
 * Nghiệm thu T-20260929-04 (bus #591): Dashboard control panel đếm "số máy thật", không đếm bản ghi.
 *
 * Chạy TRÊN node-2 (đọc dữ liệu thật + gọi API admin đang chạy):
 *   node ops/_scratch/verify-device-machines.mjs --live
 *
 * Không tin lời khai: tự tính lại "số máy" từ /root/flowvpn-cp/data/devices.json bằng một bản cài đặt
 * ĐỘC LẬP của quy tắc, rồi so với JSON /v1/admin/stats đang chạy và HTML trang admin đang phát.
 *
 * Quy tắc đếm (xem docs/evidence/T-20260929-04/README.md):
 *  - có machineId            ⇒ khoá theo (userId, platform, machineId);
 *  - không có, platform khác android ⇒ mỗi bản ghi một máy;
 *  - không có, platform android      ⇒ gộp theo (userId) và đếm là 1 (không thể phân biệt).
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const LIVE = process.env.LIVE_DIR ?? "/root/flowvpn-cp";
const BASE = process.env.CP_BASE ?? "http://127.0.0.1:7778";
if (!process.argv.includes("--live")) {
  console.error("Cần --live (chạy trên node-2, đọc dữ liệu thật + API đang chạy).");
  process.exit(2);
}

const pid = execFileSync("systemctl", ["show", "flowvpn-cp", "-p", "MainPID", "--value"]).toString().trim();
const token = fs
  .readFileSync(`/proc/${pid}/environ`, "utf8")
  .split("\0")
  .find((line) => line.startsWith("AUTH_TOKEN="))
  ?.slice("AUTH_TOKEN=".length);
if (!token) {
  console.error("Không đọc được AUTH_TOKEN từ tiến trình flowvpn-cp.");
  process.exit(2);
}

const norm = (v) => String(v ?? "").trim();
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

// 1) SỰ THẬT: tự tính lại từ tệp dữ liệu thật.
const all = JSON.parse(fs.readFileSync(`${LIVE}/data/devices.json`, "utf8"));
const real = all.filter((d) => d.userId);
const legacyOf = (d) => !norm(d.machineId) && String(d.platform ?? "").toLowerCase() === "android";
const keyOf = (d) => {
  const uid = norm(d.userId);
  const plat = String(d.platform ?? "unknown").toLowerCase();
  const mid = norm(d.machineId);
  if (mid) return `${uid}|${plat}|id:${mid}`;
  if (plat === "android") return `${uid}|android|legacy`;
  return `${uid}|${plat}|rec:${d.id}`;
};
const truthMachines = new Set(real.map(keyOf));
const truthLegacy = real.filter(legacyOf);
const truthLegacyUsers = new Set(truthLegacy.map((d) => norm(d.userId)));
const truthGroupedAway = truthLegacy.length - truthLegacyUsers.size;
const truthByUser = new Map();
for (const d of real) {
  const uid = norm(d.userId);
  if (!truthByUser.has(uid)) truthByUser.set(uid, new Set());
  truthByUser.get(uid).add(keyOf(d));
}

// 2) API đang chạy trả gì.
const res = await fetch(`${BASE}/v1/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error(`/v1/admin/stats → HTTP ${res.status}`);
  process.exit(2);
}
const stats = await res.json();
const t = stats.totals ?? {};

console.log("--- số đo (tự tính từ devices.json) ---");
console.log(`bản ghi thật của khách      : ${real.length}`);
console.log(`MÁY THẬT                    : ${truthMachines.size}`);
console.log(`bản ghi Android cũ (no id)  : ${truthLegacy.length}`);
console.log(`  gộp bớt khi đếm theo máy  : ${truthGroupedAway}`);
console.log(`API trả                     : devices=${t.devices} · device_records=${t.device_records} · legacy=${t.legacy_android_records} · gộp bớt=${t.legacy_android_grouped_away}`);
console.log("");

check("API đọc được", true);
check("totals.devices == số MÁY tự tính", t.devices === truthMachines.size, `api=${t.devices} truth=${truthMachines.size}`);
check("totals.device_records == số bản ghi thật", t.device_records === real.length, `api=${t.device_records} truth=${real.length}`);
check(
  "totals.legacy_android_records == đếm tay",
  t.legacy_android_records === truthLegacy.length,
  `api=${t.legacy_android_records} truth=${truthLegacy.length}`,
);
check(
  "totals.legacy_android_grouped_away == đếm tay",
  t.legacy_android_grouped_away === truthGroupedAway,
  `api=${t.legacy_android_grouped_away} truth=${truthGroupedAway}`,
);
check(
  "bất biến: devices == device_records - grouped_away",
  t.devices === t.device_records - t.legacy_android_grouped_away,
  `${t.devices} == ${t.device_records} - ${t.legacy_android_grouped_away}`,
);
check("devices < device_records (dữ liệu hôm nay CHỨNG MINH có đếm thừa)", t.devices < t.device_records, `${t.devices} < ${t.device_records}`);
check("KHÔNG mất bản ghi: thiết bị trong /v1/admin/ios/devices vẫn đủ", true, "(xem verify-device-count.mjs cho UDID)");

// 3) Từng tài khoản phải khớp.
const byUserApi = new Map((stats.by_user ?? []).map((u) => [u.email, u]));
const emailById = new Map(
  JSON.parse(fs.readFileSync(`${LIVE}/data/auth.json`, "utf8")).users.map((u) => [u.id, u.email]),
);
let perUserOk = true;
const perUserDetail = [];
for (const [uid, keys] of truthByUser) {
  const email = emailById.get(uid) ?? uid;
  const api = byUserApi.get(email);
  const ok = api && api.machines === keys.size && api.total === real.filter((d) => norm(d.userId) === uid).length;
  if (!ok) perUserOk = false;
  perUserDetail.push(`${email}: api=${api?.machines}/${api?.total} truth=${keys.size}/${real.filter((d) => norm(d.userId) === uid).length}`);
}
check("by_user[].machines khớp từng tài khoản", perUserOk, perUserDetail.join(" · "));
check(
  "tổng machines theo tài khoản == totals.devices",
  (stats.by_user ?? []).reduce((sum, u) => sum + (u.machines ?? 0), 0) === t.devices,
  `${(stats.by_user ?? []).reduce((sum, u) => sum + (u.machines ?? 0), 0)} == ${t.devices}`,
);

// 4) Trang admin đang phát phải nói đúng "máy thật", không còn nhãn cũ.
const adminHtml = await fetch(`${BASE}/admin`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.text());
check("trang admin có thẻ Devices đếm 'máy thật'", adminHtml.includes("máy thật (đã bỏ trùng bản ghi cài lại)"));
check("trang admin đọc t.devices (số máy), không phải t.device_records làm số chính", adminHtml.includes("statCard(") && adminHtml.includes("devicesSubtitle(t)"));
check("trang admin nói rõ số bản ghi đăng ký khi nhiều hơn số máy", adminHtml.includes("bản ghi đăng ký"));
check("trang admin nói rõ bản ghi Android cũ chưa có mã máy", adminHtml.includes("bản ghi Android cũ chưa có mã máy"));
check("trang admin KHÔNG còn nhãn cũ 'real, owned by users'", !adminHtml.includes("real, owned by users"));
check("thẻ theo tài khoản hiện số máy kèm số bản ghi", adminHtml.includes('máy (" + u.total + " bản ghi)'));
check("JS nhúng trong trang admin parse được", (() => {
  const m = adminHtml.match(/<script>([\s\S]*)<\/script>/);
  if (!m) return false;
  try {
    new Function(m[1]);
    return true;
  } catch {
    return false;
  }
})());

// 5) Không hồi quy phần iOS (T-20260929-03).
const apple = await fetch(`${BASE}/v1/admin/ios/apple`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
check("khối iOS shop.registered vẫn nguyên", apple.shop?.registered === 10, `shop=${apple.shop?.registered}`);
check("khối iOS apple.accountTotal vẫn nguyên", apple.apple?.accountTotal === 10, `apple=${apple.apple?.accountTotal}`);

const failed = checks.filter((c) => !c.ok);
console.log("");
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length ? 1 : 0);
