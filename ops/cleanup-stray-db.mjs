// Xoá file DB do lần kiểm tra nhầm tạo ra: /var/lib/fbuddy/flowgpt.db
// (app fbuddy đọc fbuddy.db, nên flowgpt.db trong thư mục đó là rác của tôi).
import { readFileSync, existsSync, unlinkSync, statSync } from "node:fs";

const dir = "/var/lib/fbuddy";
const targets = ["flowgpt.db", "flowgpt.db-wal", "flowgpt.db-shm"];
const keep = "fbuddy.db";

const keepStat = statSync(`${dir}/${keep}`);
console.log(`GIU LAI: ${keep} (${keepStat.size} bytes, sua luc ${keepStat.mtime.toISOString()})`);

for (const name of targets) {
  const file = `${dir}/${name}`;
  if (!existsSync(file)) {
    console.log(`  (khong co) ${name}`);
    continue;
  }
  const stat = statSync(file);
  // Chỉ xoá khi file nhỏ hơn fbuddy.db rõ rệt — tức là DB rỗng vừa tạo, không phải dữ liệu thật.
  if (stat.size > keepStat.size / 2) {
    console.error(`  DUNG: ${name} to bat thuong (${stat.size} bytes) — khong xoa, can nguoi xem`);
    process.exit(1);
  }
  unlinkSync(file);
  console.log(`  da xoa ${name} (${stat.size} bytes)`);
}

console.log("xong.");
