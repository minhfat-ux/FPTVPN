#!/usr/bin/env node
/**
 * HỢP NHẤT hai bộ dữ liệu biển số và ĐỐI CHIẾU CHÉO:
 *   - server/src/data/vn-plates-official.json : lấy từ Công báo Chính phủ (Thông tư 24/2023/TT-BCA,
 *     Thông tư 51/2025/TT-BCA, Nghị quyết 202/2025/QH15, Thông tư 79/2024/TT-BCA) — CHUẨN.
 *   - server/src/data/vn-plate-codes.json     : bản cũ lấy từ Wikipedia (bảng hiện hành + bản cũ 2025).
 *
 *   node ops/merge-vn-plates.mjs            # chỉ đối chiếu, in ra chỗ lệch
 *   node ops/merge-vn-plates.mjs --apply    # ghi bản hợp nhất vào vn-plate-codes.json (file runtime)
 *
 * Vì sao có bước đối chiếu: hai nguồn độc lập cùng nói về một dải mã. Chỗ nào lệch nhau thì phải
 * NHÌN THẤY, không được im lặng chọn một bên — đây đúng là kiểu lỗi đã xảy ra với mã 94 (ghi tay
 * thành Bình Dương trong khi Công báo và Wikipedia đều nói Bạc Liêu).
 */
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const OFFICIAL = "server/src/data/vn-plates-official.json";
const RUNTIME = "server/src/data/vn-plate-codes.json";

const official = JSON.parse(fs.readFileSync(OFFICIAL, "utf8"));
const runtime = fs.existsSync(RUNTIME) ? JSON.parse(fs.readFileSync(RUNTIME, "utf8")) : null;

/** Chuẩn hoá tên để so sánh: bỏ dấu ngoặc, khoảng trắng, khác biệt "TP." / "Thành phố". */
const norm = (value) =>
  String(value ?? "")
    .replace(/\(.*?\)/g, "")
    // Không dùng \b ở đây: \b của JS chỉ hiểu ASCII nên "Thành phố" có dấu sẽ không khớp, khiến
    // báo lệch giả (đã gặp: "TP. Hồ Chí Minh" vs "Thành phố Hồ Chí Minh" bị coi là hai nơi khác nhau).
    .replace(/tp\.?\s*/gi, "")
    .replace(/thành phố/gi, "")
    .replace(/tỉnh/gi, "")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// ---- 1. Bảng mã theo Công báo
const officialByCode = new Map();
for (const row of official.bangMoi ?? []) {
  for (const code of row.ma ?? []) {
    officialByCode.set(code, { tinhHienTai: row.tinh, gopTu: row.gopTu ?? [] });
  }
}
const officialOld = new Map();
for (const row of official.bangCu ?? []) {
  for (const code of row.ma ?? []) officialOld.set(code, row.tinh);
}

// ---- 2. Đối chiếu với bản Wikipedia (nếu có)
let mismatches = 0;
if (runtime?.traNguoc) {
  const codes = new Set([...Object.keys(runtime.traNguoc), ...officialByCode.keys()]);
  for (const code of [...codes].sort()) {
    const mine = runtime.traNguoc[code];
    const theirs = officialByCode.get(code);
    if (!mine || !theirs) continue;
    if (norm(mine.tinhHienTai) !== norm(theirs.tinhHienTai)) {
      mismatches += 1;
      console.log(`  LỆCH mã ${code}: Wikipedia nói "${mine.tinhHienTai}" · Công báo nói "${theirs.tinhHienTai}"`);
    }
  }
  console.log(mismatches ? `\n! ${mismatches} mã lệch giữa hai nguồn — bản Công báo được dùng làm chuẩn.` : "\nHai nguồn KHỚP nhau ở mọi mã cùng có.");
} else {
  console.log("(chưa có bản runtime để đối chiếu — sẽ tạo mới từ Công báo)");
}

// ---- 3. Sinh bản runtime hợp nhất (cấu trúc mà vn-plates.js đang đọc)
const bangMoi = (official.bangMoi ?? []).map((row) => {
  const codes = row.ma ?? [];
  // Mã CHÍNH = mã mà tỉnh cũ trùng tên đơn vị mới (đơn vị giữ tên được cấp trước).
  const own = codes.filter((code) => norm(officialOld.get(code)) === norm(row.tinh));
  return {
    tinh: row.tinh,
    ma: codes,
    maChinh: own.length ? own : codes.slice(0, 1),
    gopTu: row.gopTu ?? [],
    doTinCay: row.doTinCay ?? "chac",
    ghiChu: row.ghiChu ?? "",
  };
});

const traNguoc = {};
for (const row of bangMoi) {
  for (const code of row.ma) {
    traNguoc[code] = {
      tinhHienTai: row.tinh,
      tinhCu: officialOld.get(code) ?? null,
      laMaChinh: row.maChinh.includes(code),
    };
  }
}
// Mã cũ không còn được cấp (nếu có) vẫn tra được, ghi rõ là suy ra.
for (const [code, tinh] of officialOld) {
  if (traNguoc[code]) continue;
  traNguoc[code] = { tinhHienTai: tinh, tinhCu: tinh, laMaChinh: false, suyRa: true };
}

const merged = {
  capNhat: new Date().toISOString().slice(0, 10),
  nguonChuan: official.nguon ?? [],
  ghiChu: official.ghiChu ?? (official.bangMoi?.[0]?.ghiChu ?? ""),
  ghiChuChung:
    "Bảng chuẩn lấy từ Công báo Chính phủ: Phụ lục số 02 Thông tư 51/2025/TT-BCA (34 tỉnh/thành sau sáp nhập 01/7/2025) " +
    "đối chiếu với Phụ lục số 02 Thông tư 24/2023/TT-BCA (63 tỉnh/thành trước sáp nhập) và Nghị quyết 202/2025/QH15. " +
    "Xe đăng ký trước 01/7/2025 vẫn mang mã cũ; mã cũ nay thuộc tỉnh mới theo cột tinhHienTai.",
  nguonDoiChieu: [
    "https://vi.wikipedia.org/wiki/Biển_xe_cơ_giới_Việt_Nam (bảng hiện hành + bản cũ 2025-05-19, dùng để đối chiếu chéo)",
  ],
  doiChieu: { soMaLech: mismatches, ketLuan: mismatches ? "Có lệch — đã lấy bản Công báo làm chuẩn" : "Hai nguồn khớp nhau" },
  bangMoi,
  // `ma` PHẢI là mảng: vn-plates.js gọi `(row.ma ?? []).join(", ")`. Từng ghi thành chuỗi nên
  // mọi câu hỏi về biển số đều chết với "row.ma.join is not a function".
  bangCu: (official.bangCu ?? []).map((row) => ({
    ma: Array.isArray(row.ma) ? row.ma : [row.ma].filter(Boolean),
    tinh: row.tinh,
    ghiChu: row.ghiChu ?? "",
    doTinCay: row.doTinCay ?? "chac",
  })),
  traNguoc,
  bienDacBiet: official.bienDacBiet ?? [],
  quyTacDoc: official.quyTacDoc ?? [],
  chuaChac: official.chuaChac ?? [],
};

console.log(`\nHợp nhất: ${bangMoi.length} tỉnh/thành · ${Object.keys(traNguoc).length} mã tra ngược · ${(official.bienDacBiet ?? []).length} biển đặc biệt · ${(official.quyTacDoc ?? []).length} quy tắc đọc`);
console.log(`Nghi ngờ (nghi_ngo): ${(official.bienDacBiet ?? []).filter((row) => row.doTinCay !== "chac").length} mục`);
if (!APPLY) {
  console.log(`\n(chạy thử) sẽ ghi ${RUNTIME}. Thêm --apply để ghi.`);
  process.exit(0);
}
fs.writeFileSync(RUNTIME, `${JSON.stringify(merged, null, 1)}\n`);
console.log(`\n✓ đã ghi ${RUNTIME}`);
