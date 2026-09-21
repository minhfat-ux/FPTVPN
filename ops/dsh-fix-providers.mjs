#!/usr/bin/env node
/**
 * VÁ CẤU HÌNH MODEL CHO DSH (Mac/Windows) — thêm provider OpenRouter, bỏ model gpt-4 (8k token).
 *
 *   node ops/dsh-fix-providers.mjs            # xem sẽ đổi gì
 *   node ops/dsh-fix-providers.mjs --apply    # ghi (tự sao lưu trước)
 *
 * Vì sao: bản cài mặc định chỉ khai báo provider `openai` ⇒ model OpenRouter KHÔNG có chỗ gắn vào
 * (không phải lỗi giao diện). Và `gpt-4` có cửa sổ 8.192 token — nhỏ hơn cả system prompt + schema
 * công cụ của harness nên chọn là lỗi 100% ("exceeds the context window").
 *
 * Idempotent: chạy lại nhiều lần vô hại. Xem docs/ENVIRONMENT.md §6.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const file = path.join(home, "settings.yaml");
if (!fs.existsSync(file)) {
  console.error(`! Không thấy ${file} — máy này chưa chạy DSH lần nào?`);
  process.exit(1);
}

const before = fs.readFileSync(file, "utf8");
let text = before;
const notes = [];

const gpt4 = /[ \t]*\{ id: gpt-4, name: GPT-4, contextWindow: 8192, maxTokens: 8192 \},?\r?\n/;
if (gpt4.test(text)) {
  text = text.replace(gpt4, "");
  notes.push("bỏ model gpt-4 (8.192 token — không chạy được ở chế độ agent)");
}

if (/^[ \t]{4,8}openrouter:/m.test(text)) {
  notes.push("provider openrouter đã có — không thêm nữa");
} else {
  const anchor = /^([ \t]*)apiKeyEnv:\s*OPENAI_API_KEY\s*$/m;
  const match = anchor.exec(text);
  if (!match) {
    console.error("! Không thấy dòng 'apiKeyEnv: OPENAI_API_KEY' để chèn sau nó.");
    console.error("  Xem docs/ENVIRONMENT.md §6 rồi thêm provider openrouter bằng tay.");
    process.exit(2);
  }
  const indent = match[1];
  const entry = [
    `${indent}openrouter:`,
    `${indent}{`,
    `${indent}  models:`,
    `${indent}    [`,
    `${indent}      { id: deepseek/deepseek-chat, name: "DeepSeek Chat (qua OpenRouter)", contextWindow: 163840, maxTokens: 8000 },`,
    `${indent}      { id: deepseek/deepseek-chat-v3.1:free, name: "DeepSeek V3.1 free", contextWindow: 163840, maxTokens: 8000 },`,
    `${indent}      { id: qwen/qwen3-coder:free, name: "Qwen3 Coder free", contextWindow: 262144, maxTokens: 8000 },`,
    `${indent}      { id: moonshotai/kimi-k2:free, name: "Kimi K2 free", contextWindow: 200000, maxTokens: 8000 },`,
    `${indent}      { id: z-ai/glm-4.6, name: "GLM 4.6", contextWindow: 200000, maxTokens: 8000 },`,
    `${indent}      { id: openai/gpt-4.1-mini, name: "GPT-4.1 mini (qua OpenRouter)", contextWindow: 1047576, maxTokens: 32768 },`,
    `${indent}      { id: anthropic/claude-sonnet-4.5, name: "Claude Sonnet 4.5 (qua OpenRouter)", contextWindow: 200000, maxTokens: 32000 }`,
    `${indent}    ],`,
    `${indent}  baseURL: https://openrouter.ai/api/v1,`,
    `${indent}  apiKeyEnv: OPENROUTER_API_KEY`,
    `${indent}},`,
  ].join("\n");
  const at = match.index + match[0].length;
  text = `${text.slice(0, at)}\n${entry}${text.slice(at)}`;
  notes.push("thêm provider openrouter (7 model, cửa sổ 163k–1.05M)");
}

if (!notes.length) {
  console.log("Không có gì để sửa — cấu hình đã đúng.");
  process.exit(0);
}
console.log("Sẽ đổi:");
for (const note of notes) console.log("  -", note);
if (!APPLY) {
  console.log("\n(chạy thử) thêm --apply để ghi. File gốc sẽ được sao lưu cạnh đó.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backup = `${file}.bak-${stamp}`;
fs.copyFileSync(file, backup);
fs.writeFileSync(file, text);
console.log(`\n✓ đã ghi ${file}\n  sao lưu: ${backup}`);

const after = fs.readFileSync(file, "utf8");
const problems = [];
if (!/openrouter:/.test(after)) problems.push("không thấy khối openrouter sau khi ghi");
if (!/OPENROUTER_API_KEY/.test(after)) problems.push("không thấy OPENROUTER_API_KEY");
if (after.length < before.length * 0.8) problems.push("file ngắn đi bất thường");
if (problems.length) {
  console.error("! Kiểm tra sau khi ghi có vấn đề:", problems.join("; "));
  console.error(`  Khôi phục: copy "${backup}" đè lên "${file}"`);
  process.exit(3);
}
console.log("  kiểm tra thô: OK. Xác nhận: dsh --dump-config | grep openrouter");
