#!/usr/bin/env node
/**
 * ĐO KHẢ NĂNG TRA TIN TỨC CỦA fBuddy — trước và sau khi vá đường tìm kiếm.
 *
 *   cd server && node ../ops/news-bench.mjs                       # chạy bộ 6 câu mặc định
 *   cd server && node ../ops/news-bench.mjs "giá vàng hôm nay"    # chạy câu chỉ định
 *
 * Mỗi câu in ra: số phát hiện (findings), trong đó bao nhiêu phát hiện CÓ NGÀY công bố, ngày mới
 * nhất, và thời gian tra (ms). Đây là thước đo cho yêu cầu "trả lời tin thì phải nói được tin ngày
 * nào" — findings không có ngày thì người dùng không kiểm chứng được độ mới.
 *
 * Chạy trực tiếp `research()` (không qua HTTP/model) nên đo đúng tầng tra cứu, không cần cấu hình
 * gì thêm. Đặt SEARCH_API_KEY nếu muốn đo đường Tavily.
 */
// Đường dẫn tính theo VỊ TRÍ FILE, không theo cwd — chạy từ `server/` hay từ gốc repo đều đúng.
const { research } = await import(new URL("../server/src/researcher.js", import.meta.url));

const DEFAULTS = [
  "tin AI mới nhất hôm nay",
  "giá vàng hôm nay",
  "tin công nghệ mới nhất",
  "thời sự Việt Nam hôm nay",
  "tin bóng đá hôm nay",
  "chính sách mới nhất về thuế",
];

const questions = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const list = questions.length ? questions : DEFAULTS;

const pad = (text, width) => String(text).padEnd(width);
const rows = [];

console.log(`ĐO TRA TIN — ${list.length} câu hỏi · ${new Date().toISOString()}`);
console.log(`SEARCH_API_KEY: ${process.env.SEARCH_API_KEY ? "CÓ (đường Tavily)" : "KHÔNG (đường DuckDuckGo + RSS)"}\n`);

for (const question of list) {
  const started = Date.now();
  let result = null;
  let error = null;
  try {
    result = await research({ question });
  } catch (issue) {
    error = issue;
  }
  const ms = Date.now() - started;

  if (error) {
    console.log(`✗ ${question}\n   LỖI sau ${ms} ms: ${String(error?.message ?? error).slice(0, 160)}\n`);
    rows.push({ question, findings: 0, dated: 0, newest: null, ms, error: true });
    continue;
  }

  const findings = result.findings ?? [];
  const dated = findings.filter((item) => item.detectedAt);
  // Ngày mới nhất = detectedAt lớn nhất (chuỗi ISO YYYY-MM-DD so sánh trực tiếp được).
  const newest = dated.map((item) => item.detectedAt).sort().at(-1) ?? null;
  const ages = dated.map((item) => item.ageDays).filter((age) => age !== null).sort((a, b) => a - b);
  const newestAge = ages.length ? ages[0] : null;

  console.log(`${newest ? "✓" : "·"} ${question}`);
  console.log(
    `   findings=${findings.length} · có ngày=${dated.length} · ngày mới nhất=${newest ?? "KHÔNG CÓ NGÀY"}` +
      (newestAge === null ? "" : ` (${newestAge} ngày trước)`) +
      ` · chắc chắn=${result.confidence} · cửa sổ=${result.timeWindow ?? "-"} · ${ms} ms`,
  );
  for (const item of findings.slice(0, 5)) {
    console.log(`      – [${item.detectedAt ?? "không rõ ngày"}] ${String(item.title ?? "").slice(0, 90)}`);
  }
  console.log("");
  rows.push({ question, findings: findings.length, dated: dated.length, newest, ms, error: false });
}

console.log("TỔNG HỢP");
console.log(`  ${pad("câu hỏi", 30)} | findings | có ngày | ngày mới nhất | ms`);
console.log(`  ${"-".repeat(30)}-+----------+---------+---------------+------`);
for (const row of rows) {
  console.log(
    `  ${pad(String(row.question).slice(0, 30), 30)} | ${pad(row.findings, 8)} | ${pad(row.dated, 7)} | ${pad(row.newest ?? "-", 13)} | ${row.ms}`,
  );
}
const total = rows.reduce((sum, row) => sum + row.findings, 0);
const totalDated = rows.reduce((sum, row) => sum + row.dated, 0);
const totalMs = rows.reduce((sum, row) => sum + row.ms, 0);
const withDate = rows.filter((row) => row.newest).length;
console.log(
  `\n  Tổng: ${total} findings · ${totalDated} có ngày · ${withDate}/${rows.length} câu có ít nhất 1 ngày · ` +
    `trung bình ${Math.round(totalMs / rows.length)} ms/câu`,
);
if (!withDate) console.log("  ! KHÔNG câu nào có ngày công bố — câu trả lời không thể nói 'tin ngày nào'.");
