#!/usr/bin/env node
/**
 * Nghiệm thu T-20260929-03 (bus #584): control panel đếm "số thiết bị đã đăng ký".
 *
 * Chạy TRÊN node-2 (cần đọc dữ liệu thật + gọi API admin đang chạy):
 *   node ops/_scratch/verify-device-count.mjs --live
 *
 * Không tin lời khai: tự tính lại từ /root/flowvpn-cp/data/ios-devices.json rồi so với
 * JSON mà API /v1/admin/ios/apple trả về, và so với HTML trang admin đang phát.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const LIVE = process.env.LIVE_DIR ?? "/root/flowvpn-cp";
const BASE = process.env.CP_BASE ?? "http://127.0.0.1:7778";
const live = process.argv.includes("--live");

if (!live) {
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

const norm = (v) => String(v ?? "").trim().toUpperCase();
const getJson = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
};

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const setEq = (a, b) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

// 1) SỰ THẬT: tính độc lập từ tệp dữ liệu thật của shop.
const registry = JSON.parse(fs.readFileSync(`${LIVE}/data/ios-devices.json`, "utf8"));
const shopDevices = Array.isArray(registry.devices) ? registry.devices : [];
const shopUdids = [...new Set(shopDevices.map((d) => norm(d.udid)).filter(Boolean))];
const addedByShop = shopDevices.filter((d) => d.appleRegisteredAt && !d.appleAlreadyRegistered).length;
const alreadyOnApple = shopUdids.length - addedByShop;

// 2) API đang chạy trả gì.
const api = await getJson("/v1/admin/ios/apple");
const appleUdids = [...new Set((api.apple?.devices ?? []).map((d) => norm(d.udid)).filter(Boolean))];
const truthMissing = shopUdids.filter((u) => !appleUdids.includes(u));
const truthNotShop = appleUdids.filter((u) => !shopUdids.includes(u));

console.log("--- số đo ---");
console.log(`shop đã đăng ký (UDID)      : ${shopUdids.length}`);
console.log(`  shop tự thêm lên Apple    : ${addedByShop}`);
console.log(`  Apple đã có từ trước      : ${alreadyOnApple}`);
console.log(`tài khoản Apple (UDID thô)  : ${appleUdids.length}`);
console.log(`shop có trên Apple          : ${shopUdids.length - truthMissing.length}/${shopUdids.length}`);
console.log(`shop THIẾU trên Apple       : ${truthMissing.join(", ") || "(không)"}`);
console.log(`Apple KHÔNG thuộc shop      : ${truthNotShop.length}`);
console.log("");

check("API đọc được (credentials.configured)", api.credentials?.configured === true);
check("Apple trả danh sách thiết bị (apple.ok)", api.apple?.ok === true, api.apple?.error ?? "");
check("shop.registered == đếm lại từ ios-devices.json", api.shop?.registered === shopUdids.length, `api=${api.shop?.registered} truth=${shopUdids.length}`);
check("shop.addedByShop khớp dữ liệu", api.shop?.addedByShop === addedByShop, `api=${api.shop?.addedByShop} truth=${addedByShop}`);
check("shop.alreadyOnApple khớp dữ liệu", api.shop?.alreadyOnApple === alreadyOnApple, `api=${api.shop?.alreadyOnApple} truth=${alreadyOnApple}`);
check("shop.onApple + missing == registered", (api.shop?.onApple ?? -1) + (api.shop?.missingOnApple ?? []).length === api.shop?.registered);
check("shop.missingOnApple khớp tập tính tay", setEq((api.shop?.missingOnApple ?? []).map(norm), truthMissing), (api.shop?.missingOnApple ?? []).join(", ") || "(không)");
check("apple.accountTotal == số UDID thô của Apple", api.apple?.accountTotal === appleUdids.length, `api=${api.apple?.accountTotal} thô=${appleUdids.length}`);
check("apple.notShop khớp tập tính tay", setEq((api.apple?.notShop ?? []).map(norm), truthNotShop), `${(api.apple?.notShop ?? []).length} máy ngoài shop`);
check("API tách bạch 'số shop đã đăng ký' và 'số UDID thô trên Apple' (2 nguồn khác nhau)",
  Number.isInteger(api.shop?.registered) && Number.isInteger(api.apple?.accountTotal),
  `shop=${api.shop?.registered} · Apple thô=${api.apple?.accountTotal}`);
check("dữ liệu hôm nay CHỨNG MINH hai tập khác nhau (không thể lấy số thô làm số của shop)",
  truthMissing.length > 0 && truthNotShop.length > 0,
  `shop thiếu trên Apple=${truthMissing.length} · Apple ngoài shop=${truthNotShop.length}`);

// 3) Trang admin đang phát phải nói đúng (không còn câu đếm thô cũ).
const adminHtml = await fetch(`${BASE}/admin`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.text());
check("trang admin có câu đếm theo UDID của shop", adminHtml.includes("shop đã đăng ký"));
check("trang admin lấy số từ shop.registered (không phải apple.devices.length)", adminHtml.includes("shop.registered"));
check("trang admin có đối chiếu với Apple", adminHtml.includes("đang có trên Apple"));
check("trang admin nói rõ số máy ngoài shop", adminHtml.includes("không phải máy của shop"));
check("trang admin KHÔNG còn câu đếm thô cũ", !adminHtml.includes(" thiết bị trên tài khoản."));
check("tab iOS nói 'của shop'", adminHtml.includes("thiết bị (UDID) của shop"));
check("cột Apple đối chiếu danh sách Apple sống", adminHtml.includes("iosState.appleUdids"));

// 4) Bảng UDID vẫn trả đủ (không mất dữ liệu vì sửa đếm).
const iosList = await getJson("/v1/admin/ios/devices");
const listUdids = [...new Set((iosList.devices ?? []).map((d) => norm(d.udid)).filter(Boolean))];
check("/v1/admin/ios/devices vẫn đủ UDID", listUdids.length === shopUdids.length, `api=${listUdids.length} truth=${shopUdids.length}`);

const failed = checks.filter((c) => !c.ok);
console.log("");
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length ? 1 : 0);
