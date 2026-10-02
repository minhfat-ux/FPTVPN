// So sánh 2 file sau khi chuẩn hoá CRLF.
// Dùng: node ops/_scratch/T-20261002-cp/norm-compare.mjs <fileA> <fileB>
import fs from "node:fs";

const [, , fa, fb] = process.argv;
const norm = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n").split("\n");
const a = norm(fa);
const b = norm(fb);
console.log(`${fa}: ${a.length} dong | ${fb}: ${b.length} dong`);
let diffs = 0;
const n = Math.max(a.length, b.length);
for (let i = 0; i < n; i += 1) {
  if (a[i] !== b[i]) {
    diffs += 1;
    if (diffs <= 80) {
      console.log(`L${i + 1}\n  A: ${JSON.stringify(a[i] ?? null)}\n  B: ${JSON.stringify(b[i] ?? null)}`);
    }
  }
}
console.log("tong so dong khac:", diffs, diffs === 0 ? "=> GIONG NHAU" : "");
