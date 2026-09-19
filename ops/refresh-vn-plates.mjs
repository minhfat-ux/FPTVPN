#!/usr/bin/env node
/**
 * CẬP NHẬT BẢNG MÃ BIỂN SỐ TỈNH/THÀNH từ nguồn sống, có kiểm tra chéo.
 *
 *   node ops/refresh-vn-plates.mjs            # chạy thử: in ra sẽ đổi gì
 *   node ops/refresh-vn-plates.mjs --apply    # ghi vào server/src/data/vn-plate-codes.json
 *
 * Vì sao không gõ tay bảng mã: đã sai thật — fBuddy tự thêm "41" vào nhóm biển Hà Nội. Mã tỉnh là
 * dữ liệu tra được, phải lấy từ nguồn và phải để lại dấu vết nguồn + ngày cập nhật.
 *
 * Nguồn: bài "Biển xe cơ giới Việt Nam" trên Wikipedia tiếng Việt, bảng "hiện hành" (34 tỉnh/thành
 * sau sáp nhập 01/7/2025, dẫn Nghị quyết 202/2025/QH15 và hướng dẫn của Bộ Công an). Script KHÔNG
 * tin trí nhớ của người viết: mọi mã trong bảng tên-cũ đều phải xuất hiện trong bảng hiện hành, mã
 * nào không khớp sẽ bị báo động chứ không được ghi.
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const OUT = "server/src/data/vn-plate-codes.json";
const UA = "fBuddy-refresh/1.0 (+https://fbuddy.meetflowai.site)";
const PAGE = "Biển xe cơ giới Việt Nam";

/**
 * Bảng CŨ (63 tỉnh/thành trước 01/7/2025) lấy từ bản cũ của CHÍNH bài này trên Wikipedia
 * (bản 2025-05-19, mục "Danh mục mã tỉnh": Mã tỉnh · Mã chữ cái · Tỉnh · Vùng).
 *
 * Cố ý KHÔNG gõ tay bảng này: bản gõ tay đầu tiên đã sai (ghi 94 = Bình Dương trong khi bảng
 * hiện hành xếp 94 cho Cà Mau). Dữ liệu tra được thì phải lấy từ nguồn, không lấy từ trí nhớ.
 */
const LEGACY_CUTOFF = "2025-06-01T00:00:00Z";

async function legacyWikitext() {
  const url =
    "https://vi.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=revisions" +
    `&rvlimit=1&rvstart=${encodeURIComponent(LEGACY_CUTOFF)}&rvdir=older&rvprop=ids|timestamp|content&titles=${encodeURIComponent(PAGE)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`Wikipedia (bản cũ) trả ${res.status}`);
  const json = await res.json();
  const revision = json?.query?.pages?.[0]?.revisions?.[0];
  if (!revision?.content) throw new Error("không lấy được bản cũ");
  return { content: revision.content, timestamp: revision.timestamp };
}

/** Bảng cũ: mỗi dòng "mã | chữ cái | tỉnh | vùng", có rowspan nên phải nhớ dòng trước. */
function parseLegacy(wt) {
  const table = tables(wt).find((t) => /Mã tỉnh/.test(t) && /Tỉnh \(thành phố\)|Tỉnh \(thành phố\)/.test(t));
  if (!table) throw new Error("không thấy bảng mã tỉnh bản cũ");
  const rows = [];
  let lastTinh = null;
  let lastVung = null;
  let lastChuCai = null;
  for (const chunk of table.split(/\n\|-/).slice(1)) {
    const cells = chunk
      .split("\n|")
      .map((cell) => cell.replace(/rowspan="?\d+"?/g, "").trim())
      .filter((cell) => cell && !cell.startsWith("}") && !cell.startsWith("+") && !cell.startsWith("!"));
    if (!cells.length) continue;
    const code = /(\d{2})/.exec(clean(cells[0]))?.[1];
    if (!code) continue;
    const rest = cells.slice(1).map((cell) => clean(cell)).filter(Boolean);
    const tinh = rest.find((cell) => cell.length > 2 && !/^[A-ZĐ]{1,3}$/.test(cell)) ?? lastTinh;
    const chuCai = rest.find((cell) => /^[A-ZĐ]{1,3}$/.test(cell)) ?? lastChuCai;
    const vung = rest.find((cell) => /Bộ|Miền|Duyên hải|Tây Nguyên|Đông Nam/.test(cell)) ?? lastVung;
    if (tinh) lastTinh = tinh;
    if (chuCai) lastChuCai = chuCai;
    if (vung) lastVung = vung;
    rows.push({ code, tinh: tinh ?? null, chuCai: chuCai ?? null, vung: vung ?? null });
  }
  return rows;
}

const BOLD = new RegExp("'{3}", "g");
const clean = (text) =>
  String(text)
    .replace(BOLD, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/<[^>]+>/g, "")
    // [[Tỉnh|tên hiện]] → tên hiện; [[Tỉnh]] → Tỉnh; ô kiểu "|SG" hoặc viết tắt thì bỏ.
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^\|+/, "")
    .replace(/['"]/g, "")
    .trim();

async function wikitext() {
  const url = `https://vi.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1&page=${encodeURIComponent(PAGE)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Wikipedia trả ${res.status}`);
  const json = await res.json();
  const text = json?.parse?.wikitext?.["*"];
  if (!text) throw new Error("không lấy được wikitext");
  return text;
}

function tables(wt) {
  const out = [];
  let index = 0;
  while ((index = wt.indexOf("{|", index)) >= 0) {
    const end = wt.indexOf("|}", index);
    if (end < 0) break;
    out.push(wt.slice(index, end));
    index = end + 2;
  }
  return out;
}

/** Bảng 34 tỉnh/thành hiện hành: mỗi dòng là "số thứ tự | tên | danh sách mã". */
function parseCurrentProvinces(wt) {
  const table = tables(wt).find((t) => /Tên tỉnh, thành phố/.test(t) && /Ký hiệu biển số/.test(t));
  if (!table) throw new Error("không thấy bảng tỉnh/thành hiện hành");
  const rows = [];
  for (const chunk of table.split(/\n\|-/).slice(1)) {
    const cells = chunk
      .split("\n|")
      .map((cell) => cell.trim())
      .filter((cell) => cell && !cell.startsWith("}") && !cell.startsWith("+") && !cell.startsWith("!"));
    if (cells.length < 3) continue;
    const tinh = clean(cells[1]);
    const raw = cells[2];
    const ma = [...clean(raw).matchAll(/\b(\d{2})\b/g)].map((match) => match[1]);
    const maChinh = [...raw.matchAll(new RegExp("'{3}(\\d{2})'{3}", "g"))].map((match) => match[1]);
    if (!tinh || !ma.length) continue;
    rows.push({ tinh, ma, maChinh });
  }
  return rows;
}

/** Các bảng biển đặc biệt (NG, NN, LD, DA, KT, QT, CD, 80…). */
function parseSpecial(wt) {
  const out = [];
  for (const table of tables(wt)) {
    if (!/Ký hiệu|Biển số/.test(table)) continue;
    for (const chunk of table.split(/\n\|-/).slice(1)) {
      const cells = chunk
        .split("\n|")
        .map((cell) => clean(cell))
        .filter(Boolean);
      if (cells.length < 2) continue;
      const kyHieu = cells.find((cell) => /^[A-ZĐ]{2,3}\b/.test(cell) || /^\d{2}[A-Z]?$/.test(cell));
      const nghia = cells[cells.length - 1];
      if (kyHieu && nghia && kyHieu.length <= 6 && nghia.length > 6 && !out.some((row) => row.kyHieu === kyHieu)) {
        out.push({ kyHieu, nghia: nghia.slice(0, 160), doTinCay: "chac" });
      }
    }
  }
  return out.slice(0, 24);
}

const wt = await wikitext();
const provinces = parseCurrentProvinces(wt);
const special = parseSpecial(wt);

const legacy = await legacyWikitext();
const legacyRows = parseLegacy(legacy.content);
const tenCu = Object.fromEntries(legacyRows.map((row) => [row.code, row.tinh]));
console.log(`Bảng cũ (${legacy.timestamp?.slice(0, 10)}): ${legacyRows.length} mã tỉnh/thành`);

const codesInTable = new Set(provinces.flatMap((row) => row.ma));
const unknown = Object.keys(tenCu).filter((code) => !codesInTable.has(code));
const missingOldName = [...codesInTable].filter((code) => !tenCu[code]).sort();

console.log(`\n== Bảng hiện hành: ${provinces.length} tỉnh/thành · ${codesInTable.size} mã ==`);
for (const row of provinces) {
  const gop = row.ma
    .map((code) => tenCu[code] ?? "?")
    .filter((name, index, all) => name !== row.tinh && all.indexOf(name) === index);
  console.log(`  ${row.tinh.padEnd(20)} ${row.ma.join(", ")}${gop.length ? `   (mã của: ${gop.join(", ")})` : ""}`);
}
if (unknown.length) console.log(`\n! BÁO ĐỘNG: mã có trong bảng tên-cũ nhưng KHÔNG có trong bảng hiện hành: ${unknown.join(", ")}`);
if (missingOldName.length) console.log(`! Cảnh báo: mã chưa có tên tỉnh cũ: ${missingOldName.join(", ")}`);

const traNguoc = {};
for (const row of provinces) {
  for (const code of row.ma) {
    traNguoc[code] = {
      tinhHienTai: row.tinh,
      tinhCu: tenCu[code] ?? null,
      laMaChinh: row.maChinh.includes(code),
    };
  }
}
// Mã cũ KHÔNG xuất hiện trong bảng hiện hành (ví dụ dải 51–58 của TP.HCM): vẫn phải tra được, nhưng
// ghi rõ là suy ra từ tỉnh cũ chứ không phải bảng cấp mới.
for (const row of legacyRows) {
  if (traNguoc[row.code] || !row.tinh) continue;
  traNguoc[row.code] = { tinhHienTai: row.tinh, tinhCu: row.tinh, laMaChinh: false, suyRa: true };
}

const data = {
  capNhat: new Date().toISOString().slice(0, 10),
  nguon: [
    "https://vi.wikipedia.org/wiki/Bi%E1%BB%83n_xe_c%C6%A1_gi%E1%BB%9Bi_Vi%E1%BB%87t_Nam",
    `Bản cũ của cùng bài (${legacy.timestamp?.slice(0, 10)}) cho bảng 63 tỉnh/thành trước sáp nhập`,
    "Nghị quyết 202/2025/QH15 (sắp xếp đơn vị hành chính cấp tỉnh)",
    "Hướng dẫn của Bộ Công an về ký hiệu biển số 34 tỉnh/thành từ 01/7/2025",
  ],
  ghiChu:
    "Bảng hiện hành sau sáp nhập 01/7/2025. Xe đăng ký trước mốc này vẫn mang mã cũ; mã cũ nay thuộc tỉnh mới theo cột tinhHienTai.",
  bangMoi: provinces.map((row) => ({
    tinh: row.tinh,
    ma: row.ma,
    maChinh: row.maChinh,
    gopTu: row.ma.map((code) => tenCu[code]).filter((name) => name && name !== row.tinh),
    doTinCay: "chac",
  })),
  bangCu: legacyRows.map((row) => ({
    ma: row.code,
    tinh: row.tinh,
    chuCai: row.chuCai,
    vung: row.vung,
    doTinCay: "chac",
  })),
  traNguoc,
  bienDacBiet: special,
  quyTacDoc: [
    "Hai chữ số đầu là mã tỉnh/thành; chữ cái tiếp theo là loại xe và series; nhóm số cuối là số thứ tự.",
    "Ký hiệu in đậm trong bảng là mã chính đang cấp cho tỉnh đó; các mã còn lại là của địa phương đã sáp nhập vào.",
    "Biển 4 số là bản cũ, biển 5 số là bản mới; cả hai đều còn lưu hành.",
    "Muốn biết một biển cụ thể của tỉnh nào: tra mã 2 số đầu trong bảng tra ngược, rồi mới xét chữ cái.",
  ],
  chuaChac: [
    ...(unknown.length
      ? [`Các mã ${unknown.join(", ")} không có trong bảng hiện hành; đây là mã cũ suy từ bảng trước sáp nhập (${legacy.timestamp?.slice(0, 10)}), gặp thì nên nói rõ là mã cũ.`]
      : []),
    ...(missingOldName.length
      ? [`Mã ${missingOldName.join(", ")} là mã cấp MỚI sau sáp nhập nên không có tỉnh cũ tương ứng.`]
      : []),
    "Bảng trên theo hướng dẫn của Bộ Công an về ký hiệu cấp cho 34 tỉnh/thành; danh sách series chữ cái chi tiết theo từng phòng CSGT thì phải xem cơ quan đăng ký.",
  ],
};

const before = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
if (before?.traNguoc && Object.keys(before.traNguoc).length) {
  const changes = [];
  for (const [code, row] of Object.entries(traNguoc)) {
    const old = before.traNguoc[code];
    if (old && old.tinhHienTai !== row.tinhHienTai) changes.push(`  ${code}: ${old.tinhHienTai} → ${row.tinhHienTai}`);
  }
  console.log(changes.length ? `\nThay đổi so với file hiện tại:\n${changes.join("\n")}` : "\nKhông có mã nào đổi tỉnh so với file hiện tại.");
}

if (!APPLY) {
  console.log(`\n(chạy thử) sẽ ghi ${OUT}: ${provinces.length} tỉnh/thành · ${Object.keys(traNguoc).length} mã · ${special.length} biển đặc biệt. Thêm --apply để ghi.`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(data, null, 1)}\n`);
console.log(`\n✓ đã ghi ${OUT}`);
