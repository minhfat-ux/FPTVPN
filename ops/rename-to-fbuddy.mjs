#!/usr/bin/env node
/**
 * Đổi thương hiệu ĐÃ LƯU trong SQLite: FlowGpt / FlowGPT / flowgpt → fBuddy / FBUDDY / fbuddy.
 *
 * Vì sao cần: các giá trị trong bảng `app_settings` (và chữ trong `hub_skills`) được
 * ghi một lần rồi đọc đè lên DEFAULT_APP_SETTINGS. Đổi code không tự đổi chúng —
 * nếu không chạy script này, giao diện vẫn hiện "FlowGpt" ở tên ứng dụng, prompt hệ
 * thống, tên người gửi email, nhãn model (FlowGPT-4.6) và link nạp tiền.
 *
 *   node ops/rename-to-fbuddy.mjs                    # xem trước (mặc định, KHÔNG ghi)
 *   node ops/rename-to-fbuddy.mjs --apply            # ghi thật
 *   FBUDDY_DB=/var/lib/fbuddy/fbuddy.db node ops/rename-to-fbuddy.mjs --apply
 *
 * Chạy được nhiều lần (idempotent). KHÔNG sửa nội dung hội thoại của người dùng
 * (`messages`) — lịch sử chat là bản ghi, không phải nhãn thương hiệu.
 *
 * Sau khi chạy, khởi động lại dịch vụ để tiến trình đang chạy đọc lại cấu hình.
 */

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const APPLY = process.argv.includes("--apply");
const DB = process.env.FBUDDY_DB ?? "/var/lib/fbuddy/fbuddy.db";

/** Bảng + cột chữ do hệ thống sinh ra (an toàn để đổi nhãn). */
const TEXT_COLUMNS = {
  hub_skills: ["name", "tagline", "description", "instructions"],
};

const RULES = [
  [/FLOWGPT/g, "FBUDDY"],
  [/FlowGPT/g, "fBuddy"],
  [/FlowGpt/g, "fBuddy"],
  [/flowgpt/g, "fbuddy"],
];

const TOKEN = /flowgpt/i;

if (!fs.existsSync(DB)) {
  console.error(`Không thấy CSDL: ${DB}\nĐặt đường dẫn bằng FBUDDY_DB=... (ví dụ /var/lib/fbuddy/fbuddy.db).`);
  process.exit(1);
}

/** Thay nhãn trong một chuỗi; trả về null nếu không có gì đổi. */
function rewriteText(text) {
  if (typeof text !== "string" || !TOKEN.test(text)) return null;
  let out = text;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out === text ? null : out;
}

/** Thay nhãn trong giá trị JSON (object/array/chuỗi lồng nhau). */
function rewriteJson(value) {
  if (typeof value === "string") {
    const next = rewriteText(value);
    return next === null ? { value, changed: false } : { value: next, changed: true };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const res = rewriteJson(item);
      if (res.changed) changed = true;
      return res.value;
    });
    return { value: changed ? out : value, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const res = rewriteJson(item);
      if (res.changed) changed = true;
      out[key] = res.value;
    }
    return { value: changed ? out : value, changed };
  }
  return { value, changed: false };
}

const db = new DatabaseSync(DB);
const now = new Date().toISOString();
let updates = 0;
let settingsTouched = 0;

// --- app_settings: JSON ở cột value_json --------------------------------
if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").get()) {
  const rows = db.prepare("SELECT key, value_json FROM app_settings").all();
  const setSetting = db.prepare("UPDATE app_settings SET value_json = ?, updated_at = ? WHERE key = ?");
  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.value_json);
    } catch {
      continue; // hàng hỏng thì bỏ qua, không đoán
    }
    const res = rewriteJson(parsed);
    if (!res.changed) continue;
    settingsTouched += 1;
    console.log(`app_settings.${row.key}`);
    console.log(`  cũ : ${JSON.stringify(parsed).slice(0, 160)}`);
    console.log(`  mới: ${JSON.stringify(res.value).slice(0, 160)}`);
    if (APPLY) {
      setSetting.run(JSON.stringify(res.value), now, row.key);
      updates += 1;
    }
  }
}

// --- hub_skills: chữ trong chợ kỹ năng -----------------------------------
for (const [table, columns] of Object.entries(TEXT_COLUMNS)) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!exists) continue;
  for (const row of db.prepare(`SELECT id, ${columns.join(", ")} FROM ${table}`).all()) {
    const changed = {};
    for (const column of columns) {
      const next = rewriteText(row[column]);
      if (next !== null) changed[column] = next;
    }
    if (!Object.keys(changed).length) continue;
    console.log(`${table}.${row.id} → ${Object.keys(changed).join(", ")}`);
    if (APPLY) {
      const assignments = Object.keys(changed).map((c) => `${c} = ?`).join(", ");
      db.prepare(`UPDATE ${table} SET ${assignments}, updated_at = ? WHERE id = ?`).run(
        ...Object.values(changed),
        now,
        row.id,
      );
      updates += 1;
    }
  }
}

console.log(
  `\n${APPLY ? "ĐÃ GHI" : "XEM TRƯỚC"}: ${settingsTouched} khoá cấu hình cần đổi` +
    (APPLY ? `, ${updates} hàng đã cập nhật` : " — chạy lại với --apply để ghi"),
);
if (APPLY) console.log("Giờ khởi động lại dịch vụ: systemctl restart fbuddy");
