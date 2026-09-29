// Soi file auth.json hỏng (29/09/2026) — tìm điểm JSON hợp lệ đầu tiên và phần dư.
// Dùng: node ops/_scratch/inspect-auth-20260929.mjs [đường-dẫn]
import fs from "node:fs";

const p = process.argv[2] || "/root/flowvpn-cp/data/auth.json";
const raw = fs.readFileSync(p, "utf8");
console.log("file         :", p);
console.log("size (bytes) :", raw.length);

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
console.log("end of first JSON value:", end);
let obj = null;
try {
  obj = JSON.parse(raw.slice(0, end));
  console.log("PREFIX PARSES OK");
} catch (e) {
  console.log("prefix parse FAIL:", e.message);
}
if (obj) {
  for (const k of Object.keys(obj)) {
    console.log("   ", k, Array.isArray(obj[k]) ? `array(${obj[k].length})` : typeof obj[k]);
  }
}
const rest = raw.slice(end);
console.log("--- trailing bytes:", rest.length, "---");
console.log(JSON.stringify(rest.slice(0, 400)));
