/**
 * check-sampler-math.mjs — kiem chung doc lap vong lay mau bang thong.
 *
 * Doc cac dong `bw: sample net=... observed=<kbps> declared=<kbps> ... src=<n> raw=<byte>`
 * trong diagnostics.log, roi TU TINH lai toc do moi mau tu chenh lech `raw`:
 *     kbps = (raw_sau - raw_truoc) * 8 / (thoi gian troi qua, ms)
 * va so sanh voi `observed` (trung binh truot 12 mau cua app) => neu khop thi phep do dung.
 *
 * Dung: node check-sampler-math.mjs <duong-dan-diagnostics.log> [so dong cuoi]
 */
import fs from 'node:fs';

const file = process.argv[2];
const tailN = Number(process.argv[3] ?? 20);
if (!file) {
  console.error('dung: node check-sampler-math.mjs <log> [so dong cuoi]');
  process.exit(2);
}

const re =
  /^(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)\.(\d\d\d) .*bw: sample net=(\S+) observed=(\d+) declared=(\d+).*?src=(\d+) raw=(\d+)/;

const rows = [];
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  const m = re.exec(line);
  if (!m) continue;
  const [, , , hh, mm, ss, ms, net, observed, declared, src, raw] = m;
  const t = ((+hh * 60 + +mm) * 60 + +ss) * 1000 + +ms;
  rows.push({ t, net, observed: +observed, declared: +declared, src: +src, raw: +raw });
}

if (rows.length < 2) {
  console.log(`Chi co ${rows.length} dong mau co du observed+src+raw => chua du de kiem.`);
  process.exit(0);
}

const show = rows.slice(-tailN);
const srcName = { 1: '/proc/net/dev (payload)', 2: 'TrafficStats theo UID', 3: 'bo dem cau WS' };
console.log('thoi diem      src nguon                      kbps tu raw   observed   declared');
for (let i = 1; i < show.length; i++) {
  const a = show[i - 1];
  const b = show[i];
  // ĐỔI NGUỒN byte (1/2/3) là đổi thang đo: hiệu hai bộ đếm khác thang là số rác
  // (từng in ra cả Gbps âm). Bỏ qua, chỉ ghi chú — app cũng tự reset mẫu ở chỗ này.
  const switched = a.src !== b.src;
  const dt = b.t - a.t;
  const kbps = switched || dt <= 0 ? null : Math.round(((b.raw - a.raw) * 8) / dt);
  console.log(
    `${String(Math.floor(b.t / 3600000)).padStart(2, '0')}:${String(Math.floor((b.t % 3600000) / 60000)).padStart(2, '0')}:${String(Math.floor((b.t % 60000) / 1000)).padStart(2, '0')}  ` +
      `${String(b.src).padEnd(3)} ${(srcName[b.src] ?? '?').padEnd(28)} ` +
      `${(kbps === null ? (switched ? '  (doi nguon)' : '            -') : String(kbps)).padStart(12)} ` +
      `${String(b.observed).padStart(10)} ${String(b.declared).padStart(10)}  (net=${b.net})`,
  );
}

// So sanh chi mang tinh THAM KHAO: `observed` cua app la trung binh 12 mau 1 GIAY, con script
// chi thay cac dong log cach nhau ~15 GIAY — voi tai kieu cum/nghi thi hai cua so lech nhau
// rat xa du cung mot nguon so. Vi vay in TRUNG VI cua hai ben thay vi mot ti le "lech %".
const mine = [];
for (let i = Math.max(1, show.length - 12); i < show.length; i++) {
  if (show[i].src !== show[i - 1].src) continue;
  const dt = show[i].t - show[i - 1].t;
  if (dt > 0) mine.push(((show[i].raw - show[i - 1].raw) * 8) / dt);
}
const obs = show.slice(-12).map((r) => r.observed);
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
if (mine.length) {
  console.log(
    `\nTham khao (2 cua so KHAC nhau: app = 12 mau 1s, script = giua 2 dong log):\n` +
      `  trung vi kbps tu raw = ${Math.round(median(mine))} | trung vi observed cua app = ${Math.round(median(obs))}`,
  );
}
const srcs = [...new Set(rows.slice(-tailN).map((r) => r.src))];
console.log(`Nguon byte dang dung: ${srcs.map((s) => `${s} (${srcName[s] ?? '?'})`).join(', ')}`);
