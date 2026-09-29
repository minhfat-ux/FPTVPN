// Chứng minh lỗi ghi đồng thời của AuthStore (và bản vá): nạp 1 module auth-store bất kỳ,
// cho N request ghi chồng nhau, rồi kiểm tra tệp kết quả có phải JSON hợp lệ hay không.
// Dùng: node ops/_scratch/auth-race-test-20260929.mjs <module.mjs> <file.json> [N]
import fs from "node:fs";

const modulePath = process.argv[2];
const file = process.argv[3];
const n = Number(process.argv[4] || 60);
if (!modulePath || !file) {
  console.error("Dùng: node auth-race-test-20260929.mjs <module.mjs> <file.json> [N]");
  process.exit(2);
}

fs.rmSync(file, { force: true });
fs.rmSync(`${file}.tmp`, { force: true });

const { AuthStore } = await import(modulePath);
const store = new AuthStore(file);

const t0 = Date.now();
await Promise.all(
  Array.from({ length: n }, (_, i) => store.startEmailLogin(`race-${i}@test.local`)),
);

const raw = fs.readFileSync(file, "utf8");
let verdict = "VALID";
let detail = "";
try {
  const data = JSON.parse(raw);
  detail = `emailOtps=${data.emailOtps.length} emailLoginRequests=${data.emailLoginRequests.length}`;
} catch (err) {
  verdict = "CORRUPT";
  detail = err.message;
}
const leftoverTmp = fs.existsSync(`${file}.tmp`);
console.log(`${modulePath}`);
console.log(`  ${n} ghi đồng thời trong ${Date.now() - t0} ms`);
console.log(`  ${verdict}: ${detail}`);
console.log(`  tệp tạm còn sót (.tmp): ${leftoverTmp}`);
process.exit(verdict === "VALID" ? 0 : 1);
