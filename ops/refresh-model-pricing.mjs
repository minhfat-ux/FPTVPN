#!/usr/bin/env node
/**
 * Agent tự đồng bộ GIÁ model từ OpenRouter vào bảng `model_pricing` (để `costForModel`
 * luôn tính credit đúng theo chi phí thật). Chạy định kỳ bằng systemd timer.
 *
 * Dùng `curl -4` (không dùng fetch): trên VPS này fetch dễ chết vì api ngoài resolve
 * sang IPv6 mà không có route (đã gặp với Telegram); curl -4 thì ổn định.
 */
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const DB = process.env.FBUDDY_DB || "/var/lib/fbuddy/fbuddy.db";
const db = new DatabaseSync(DB);
db.exec(`CREATE TABLE IF NOT EXISTS model_pricing (
  model TEXT PRIMARY KEY,
  input_usd REAL NOT NULL DEFAULT 0,
  output_usd REAL NOT NULL DEFAULT 0,
  cache_usd REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
)`);

const raw = execFileSync(
  "curl", ["-4", "-sS", "-m", "30", "https://openrouter.ai/api/v1/models"],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);
const json = JSON.parse(raw);
const now = new Date().toISOString();
const upsert = db.prepare(
  `INSERT INTO model_pricing (model, input_usd, output_usd, cache_usd, updated_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(model) DO UPDATE SET
     input_usd=excluded.input_usd, output_usd=excluded.output_usd,
     cache_usd=excluded.cache_usd, updated_at=excluded.updated_at`,
);

let n = 0;
let changed = 0;
for (const m of json?.data ?? []) {
  const p = m.pricing ?? {};
  const input = Number(p.prompt || 0);
  const output = Number(p.completion || 0);
  const cache = Number(p.input_cache_read || 0);
  const prev = db.prepare("SELECT input_usd, output_usd FROM model_pricing WHERE model = ?").get(m.id);
  if (prev && (Number(prev.input_usd) !== input || Number(prev.output_usd) !== output)) changed += 1;
  upsert.run(m.id, input, output, cache, now);
  n += 1;
}
console.log(`[pricing] ${new Date().toISOString()} — đã cập nhật giá ${n} model, ${changed} model đổi giá`);
