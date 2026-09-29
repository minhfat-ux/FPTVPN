// Sửa auth.json hỏng ngày 29/09/2026: giữ phần JSON hợp lệ đầu tiên, bỏ đoạn dư do ghi đè.
// Chạy thử (mặc định):  node ops/_scratch/repair-auth-20260929.mjs
// Ghi thật:             node ops/_scratch/repair-auth-20260929.mjs --apply
import fs from "node:fs";
import crypto from "node:crypto";

const APPLY = process.argv.includes("--apply");
const fileArgIdx = process.argv.indexOf("--file");
const file = fileArgIdx >= 0 ? process.argv[fileArgIdx + 1] : "/root/flowvpn-cp/data/auth.json";
const raw = fs.readFileSync(file, "utf8");

function endOfFirstJson(s) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth += 1;
    else if (c === "}" || c === "]") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const end = endOfFirstJson(raw);
if (end < 0) throw new Error("không tìm được JSON hợp lệ");
const prefix = raw.slice(0, end);
const rest = raw.slice(end);
const data = JSON.parse(prefix); // ném nếu hỏng
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

console.log("file            :", file);
console.log("bytes           :", raw.length, "→ hợp lệ", end, "| dư", rest.length);
console.log("sha256 gốc      :", sha(raw));
console.log("sha256 phần hợp lệ:", sha(prefix));
for (const k of Object.keys(data)) {
  console.log("   ", k, Array.isArray(data[k]) ? `array(${data[k].length})` : typeof data[k]);
}

// Kiểm tra đoạn dư không chứa bản ghi MỚI so với phần hợp lệ (nếu có thì phải hợp nhất).
const known = JSON.stringify(data.renewalReminders ?? []);
const restUserIds = [...rest.matchAll(/"userId":\s*"([^"]+)"/g)].map((m) => m[1]);
const missing = restUserIds.filter((id) => !known.includes(id));
console.log("userId trong đoạn dư:", restUserIds.length, "| không có ở phần hợp lệ:", missing.length, missing);

if (missing.length) {
  console.error("DỪNG: đoạn dư có dữ liệu không nằm trong phần hợp lệ — cần hợp nhất thủ công.");
  process.exit(2);
}

if (!APPLY) {
  console.log("\n[chạy thử] thêm --apply để ghi thật.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${file}.corrupt-${stamp}`;
fs.copyFileSync(file, backup);
const tmp = `${file}.${process.pid}.repair.tmp`;
fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmp, file);
console.log("\nĐÃ SỬA");
console.log("  backup:", backup);
console.log("  mới   :", file, fs.statSync(file).size, "bytes");
console.log("  kiểm  :", JSON.parse(fs.readFileSync(file, "utf8")).users.length, "users");
