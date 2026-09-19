#!/usr/bin/env node
/**
 * bw-loop — công cụ cho VÒNG LẶP AI tinh chỉnh băng thông của control plane.
 *
 * Vì sao có file này: `app_config` là nguồn override của `bw_policy` (xem `src/bw-policy.js`)
 * và `client_telemetry` là dữ liệu đo thật (xem `src/client-telemetry.js`). Sửa tay bằng SQL
 * thì dễ gõ sai key/gõ giá trị ngoài khoảng mà không ai báo; còn đọc dữ liệu thì phải nhớ
 * đúng câu SQL. Hai việc đó gói vào đây để agent/AI (và người) làm nhanh, có kiểm tra.
 *
 * Lệnh:
 *   node scripts/bw-loop.mjs policy show [--json]
 *   node scripts/bw-loop.mjs policy set ramp_up_factor=1.4 probe_max_ms=2500 [--apply]
 *   node scripts/bw-loop.mjs policy reset [--apply]
 *   node scripts/bw-loop.mjs report lying|ramp|hours [--days 7] [--json]
 *
 * Đường dẫn DB lấy từ env (giống server): APP_CONFIG_DB, CLIENT_TELEMETRY_DB.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  BW_POLICY_CONFIG_KEY,
  BW_POLICY_SPEC,
  DEFAULT_BW_POLICY,
  bwPolicyKeys,
  normalizeBwPolicy,
  resolveBwPolicy,
} from "../src/bw-policy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_CONFIG_DB = process.env.APP_CONFIG_DB ?? path.join(here, "..", "data", "app-config.db");
const TELEMETRY_DB = process.env.CLIENT_TELEMETRY_DB ?? path.join(here, "..", "data", "client-telemetry.db");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const valueOf = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function readConfigOverrides() {
  if (!fs.existsSync(APP_CONFIG_DB)) return { raw: null, updatedAt: null };
  const db = new DatabaseSync(APP_CONFIG_DB);
  try {
    const row = db.prepare("SELECT value, updated_at FROM app_config WHERE key = ?").get(BW_POLICY_CONFIG_KEY);
    return { raw: row?.value ?? null, updatedAt: row?.updated_at ?? null };
  } finally {
    db.close();
  }
}

function writeConfigOverrides(jsonText) {
  const db = new DatabaseSync(APP_CONFIG_DB);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    db.prepare(
      "INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    ).run(BW_POLICY_CONFIG_KEY, jsonText, new Date().toISOString());
  } finally {
    db.close();
  }
}

function deleteConfigOverrides() {
  const db = new DatabaseSync(APP_CONFIG_DB);
  try {
    db.prepare("DELETE FROM app_config WHERE key = ?").run(BW_POLICY_CONFIG_KEY);
  } finally {
    db.close();
  }
}

function table(rows, columns) {
  if (!rows.length) return "(không có dòng nào)";
  const widths = columns.map((c) => Math.max(String(c).length, ...rows.map((r) => String(r[c] ?? "").length)));
  const line = (cells) => cells.map((cell, i) => String(cell ?? "").padEnd(widths[i])).join("  ");
  return [line(columns), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map((r) => line(columns.map((c) => r[c])))].join("\n");
}

// ------------------------------------------------------------------ policy

function policyShow() {
  const { raw, updatedAt } = readConfigOverrides();
  const result = resolveBwPolicy({ read: () => raw, env: process.env });
  if (flag("json")) {
    console.log(JSON.stringify({ app_config_updated_at: updatedAt, ...result }, null, 2));
    return;
  }
  console.log(`app_config: ${APP_CONFIG_DB} (bw_policy ${raw ? `đã đặt lúc ${updatedAt}` : "chưa có — dùng mặc định"})`);
  console.log(`revision hiệu lực: ${result.revision}`);
  const rows = bwPolicyKeys().map((key) => ({
    key,
    value: String(result.policy[key]),
    default: String(DEFAULT_BW_POLICY[key]),
    doi: result.policy[key] === DEFAULT_BW_POLICY[key] ? "" : "<= OVERRIDE",
  }));
  console.log(table(rows, ["key", "value", "default", "doi"]));
  if (result.rejected.length) console.log(`\nBị bỏ qua/kẹp: ${JSON.stringify(result.rejected)}`);
}

function policySet(assignments, apply) {
  const patch = {};
  const problems = [];
  for (const item of assignments) {
    const eq = item.indexOf("=");
    if (eq <= 0) {
      problems.push(`${item}: thiếu dấu =`);
      continue;
    }
    const key = item.slice(0, eq).trim();
    const raw = item.slice(eq + 1).trim();
    if (!BW_POLICY_SPEC[key]) {
      problems.push(`${key}: không phải tham số hợp lệ`);
      continue;
    }
    patch[key] = raw;
  }
  const { raw: existing } = readConfigOverrides();
  const base = existing ? JSON.parse(existing) : {};
  const merged = { ...base, ...patch };
  const normalized = normalizeBwPolicy(merged);
  const hard = normalized.rejected.filter((item) => !["unknown_key", "clamped"].includes(item.reason));
  for (const item of normalized.rejected) {
    if (item.reason === "clamped") problems.push(`${item.key}: kẹp về [${item.min}, ${item.max}]`);
  }
  if (hard.length) problems.push(...hard.map((item) => `${item.key}: ${item.reason}`));
  if (problems.length) {
    console.error("KHÔNG ghi — cấu hình sai:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 2;
    return;
  }
  const before = resolveBwPolicy({ read: () => existing, env: process.env });
  const after = resolveBwPolicy({ read: () => JSON.stringify(merged), env: process.env });
  const changes = bwPolicyKeys()
    .filter((key) => before.policy[key] !== after.policy[key])
    .map((key) => ({ key, before: before.policy[key], after: after.policy[key] }));
  console.log(changes.length ? table(changes, ["key", "before", "after"]) : "(không có gì đổi)");
  if (!apply) {
    console.log(`\nDRY-RUN. Thêm --apply để ghi ${BW_POLICY_CONFIG_KEY} vào ${APP_CONFIG_DB}.`);
    return;
  }
  writeConfigOverrides(JSON.stringify(merged));
  console.log(`\nĐã ghi. revision mới: ${after.revision} — client lượt sau nhận qua /v1/bootstrap + /v1/nodes.`);
}

function policyReset(apply) {
  const { raw } = readConfigOverrides();
  if (!raw) {
    console.log("Không có override nào để xoá (đang dùng mặc định trong code).");
    return;
  }
  if (!apply) {
    console.log(`DRY-RUN. Override hiện tại: ${raw}\nThêm --apply để xoá (về mặc định trong code).`);
    return;
  }
  deleteConfigOverrides();
  console.log(`Đã xoá ${BW_POLICY_CONFIG_KEY} — policy về mặc định: revision ${resolveBwPolicy({ env: process.env }).revision}.`);
}

// ------------------------------------------------------------------ report (dữ liệu thật)

const QUERIES = {
  /** So sánh TRƯỚC/SAU khi đổi tham số: cùng một mạng, khác revision policy. */
  policy: {
    title: "Theo revision bw_policy (NULL = client chưa đọc bw_policy)",
    sql: `SELECT COALESCE(policy_revision, '(chưa đọc)') AS revision,
       COUNT(*) AS events,
       COUNT(DISTINCT device_id) AS devices,
       ROUND(AVG(declared_down_kbps)) AS declared,
       ROUND(AVG(measured_kbps)) AS measured,
       ROUND(AVG(COALESCE(effective_down_kbps, measured_kbps)) * 1.0 / NULLIF(AVG(declared_down_kbps), 0), 2) AS utilisation,
       ROUND(AVG(loss_pct), 2) AS loss_pct_tb
FROM client_telemetry
WHERE created_at >= ? AND declared_down_kbps > 0
GROUP BY revision
ORDER BY events DESC`,
    params: (cutoff) => [cutoff],
  },
  /** Mạng nào bị KHAI VƯỢT nhiều nhất (declared > measured) — ứng viên hạ trần/hệ số. */
  lying: {
    title: "Khai vượt theo mạng (declared/measured > 1 là khai quá sức mạng)",
    sql: `SELECT platform, net_type, COALESCE(substr(net_key_hash, 1, 8), '-') AS net,
       COUNT(*) AS samples,
       ROUND(AVG(measured_kbps)) AS measured,
       ROUND(AVG(declared_down_kbps)) AS declared,
       ROUND(AVG(declared_down_kbps) * 1.0 / NULLIF(AVG(measured_kbps), 0), 2) AS ratio,
       SUM(CASE WHEN measured_kbps * 100 < declared_down_kbps * 80 THEN 1 ELSE 0 END) AS over80
FROM client_telemetry
WHERE created_at >= ? AND measured_kbps > 0 AND declared_down_kbps > 0
GROUP BY platform, net_type, net
HAVING samples >= 3
ORDER BY ratio DESC
LIMIT 20`,
    params: (cutoff) => [cutoff],
  },
  /** Ramp/hạ số khai có đem lại tốc độ thật không: so declared với hiệu dụng. */
  ramp: {
    title: "Hiệu quả theo reason (utilisation = hiệu dụng / số khai)",
    sql: `SELECT COALESCE(reason, '-') AS reason,
       COUNT(*) AS events,
       ROUND(AVG(declared_down_kbps)) AS declared,
       ROUND(AVG(COALESCE(effective_down_kbps, measured_kbps))) AS actual,
       ROUND(AVG(COALESCE(effective_down_kbps, measured_kbps)) * 1.0 / NULLIF(AVG(declared_down_kbps), 0), 2) AS utilisation,
       SUM(CASE WHEN COALESCE(effective_down_kbps, measured_kbps) * 100 >= declared_down_kbps * 95 THEN 1 ELSE 0 END) AS cham_tran
FROM client_telemetry
WHERE created_at >= ? AND declared_down_kbps > 0
GROUP BY reason
ORDER BY events DESC`,
    params: (cutoff) => [cutoff],
  },
  /** Giờ địa phương nào chậm nhất (dùng tz_offset_min của client, không phải giờ server). */
  hours: {
    title: "Theo giờ ĐỊA PHƯƠNG của khách (đo được / số khai)",
    sql: `SELECT strftime('%H', datetime(created_at, '+' || tz_offset_min || ' minutes')) AS gio_dia_phuong,
       COUNT(*) AS samples,
       ROUND(AVG(measured_kbps)) AS measured,
       ROUND(AVG(declared_down_kbps)) AS declared,
       ROUND(AVG(COALESCE(effective_down_kbps, measured_kbps)) * 1.0 / NULLIF(AVG(declared_down_kbps), 0), 2) AS utilisation
FROM client_telemetry
WHERE created_at >= ? AND declared_down_kbps > 0
GROUP BY gio_dia_phuong
ORDER BY utilisation ASC`,
    params: (cutoff) => [cutoff],
  },
};

function report(name) {
  const spec = QUERIES[name];
  if (!spec) {
    console.error(`report không hợp lệ: ${name}. Chọn: ${Object.keys(QUERIES).join(" | ")}`);
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(TELEMETRY_DB)) {
    console.error(`Chưa có DB telemetry: ${TELEMETRY_DB} (chưa client nào gửi, hoặc sai CLIENT_TELEMETRY_DB).`);
    process.exitCode = 1;
    return;
  }
  const days = Number(valueOf("days", "7"));
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = new DatabaseSync(TELEMETRY_DB);
  try {
    const rows = db.prepare(spec.sql).all(...spec.params(cutoff));
    if (flag("json")) {
      console.log(JSON.stringify({ query: name, since: cutoff, rows }, null, 2));
      return;
    }
    console.log(`# ${spec.title} — ${days} ngày gần nhất (từ ${cutoff}), DB ${TELEMETRY_DB}`);
    console.log(table(rows, Object.keys(rows[0] ?? {}).length ? Object.keys(rows[0]) : ["(trống)"]));
  } finally {
    db.close();
  }
}

// ------------------------------------------------------------------ main

const [group, action, ...rest] = argv.filter((a) => !a.startsWith("--"));
if (group === "policy" && action === "show") policyShow();
else if (group === "policy" && action === "set") policySet(rest, flag("apply"));
else if (group === "policy" && action === "reset") policyReset(flag("apply"));
else if (group === "report") report(action);
else {
  console.log(`bw-loop — vòng lặp AI tinh chỉnh băng thông

  node scripts/bw-loop.mjs policy show [--json]
  node scripts/bw-loop.mjs policy set <key>=<value> [...] [--apply]
  node scripts/bw-loop.mjs policy reset [--apply]
  node scripts/bw-loop.mjs report lying|ramp|hours [--days 7] [--json]

  APP_CONFIG_DB=${APP_CONFIG_DB}
  CLIENT_TELEMETRY_DB=${TELEMETRY_DB}`);
  process.exitCode = group ? 2 : 0;
}
