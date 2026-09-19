/**
 * TRI THỨC BIỂN SỐ ĐĂNG KÝ XE VIỆT NAM — ghép vào system prompt CHỈ khi câu hỏi chạm tới biển số.
 *
 * Vì sao phải là dữ liệu tra cứu chứ không để model tự nhớ: đã gặp thật — hỏi "biển 29A-123.45 ở
 * đâu", fBuddy trả lời đúng Hà Nội nhưng tự thêm "cùng nhóm 29, 30, 31, 32, 33, 40, **41**";
 * 41 không phải Hà Nội. Mã tỉnh là dữ liệu tra được, không phải thứ để suy luận.
 *
 * Dữ liệu nằm ở `./data/vn-plate-codes.json` (có `nguon` + `capNhat` + `doTinCay` từng mục) để
 * cập nhật được mà không phải sửa code. Tỉnh đã sáp nhập từ 01/7/2025 nên có HAI bảng: bảng cũ
 * (xe đang chạy trên đường vẫn mang) và bảng mới.
 *
 * Nguyên tắc trả lời (đưa thẳng vào prompt): chỉ khẳng định mã có trong bảng; mã không có thì nói
 * là không chắc và đề nghị người dùng tra cục đăng kiểm/Cục CSGT, KHÔNG đoán.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(HERE, "data", "vn-plate-codes.json");

/** Đọc dữ liệu biển số một lần rồi giữ trong bộ nhớ (file nhỏ, không đổi lúc chạy). */
let cache = null;
function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    cache = { bangCu: [], bangMoi: [], bienDacBiet: [], quyTacDoc: [], chuaChac: [], nguon: [] };
  }
  return cache;
}

/**
 * Câu hỏi có khả năng nói về biển số xe không? Quyết định có ghép bảng tra vào prompt hay không
 * — bảng dài nên chỉ ghép khi cần, đừng nhét vào mọi lượt.
 */
export function plateQuestionLikely(message = "") {
  const text = String(message).toLowerCase();
  if (!text) return false;
  if (/biển\s*(số|kiểm soát|xe|đăng ký)|bks|bsx|biển tỉnh|mã tỉnh|đăng ký xe|biển vàng|biển xanh|biển trắng/.test(text)) return true;
  // "29A-123.45", "51F 6789", "biển 43" — mã 2 số kèm chữ cái hoặc ngữ cảnh tỉnh/thành.
  if (/\b\d{2}[a-z]?[-.\s]?\d{3,5}\b/.test(text) && /xe|biển|ô tô|oto|xe máy|mô tô/.test(text)) return true;
  if (/tỉnh nào|thành phố nào|ở đâu/.test(text) && /\b\d{2}\b/.test(text) && /biển|xe/.test(text)) return true;
  return false;
}

/** Khối kiến thức biển số để ghép vào system prompt. Rỗng khi câu hỏi không liên quan. */
export function buildVnPlateKnowledge({ message = "", full = false } = {}) {
  if (!full && !plateQuestionLikely(message)) return "";
  const data = load();
  const lines = [
    "BIỂN SỐ ĐĂNG KÝ XE VIỆT NAM (dữ liệu tra cứu — KHÔNG suy đoán):",
    "• Quy tắc đọc: hai chữ số đầu = mã tỉnh/thành; chữ cái tiếp theo = loại xe và series; nhóm số cuối = số thứ tự. Biển 4 số là bản cũ, 5 số là bản mới; xe máy và ô tô khác series. Ví dụ 29A-123.45 = Hà Nội (29), xe con (A).",
  ];
  if (data.quyTacDoc?.length) lines.push(...data.quyTacDoc.map((rule) => `• ${rule}`));

  const render = (rows, tieuDe) => {
    if (!rows?.length) return;
    lines.push(`${tieuDe} (${rows.length} tỉnh/thành):`);
    for (const row of rows) {
      // Chịu được cả hai dạng dữ liệu: `ma` là mảng (bảng mới) hay chuỗi (bảng cũ ghi tay).
      const ma = (Array.isArray(row.ma) ? row.ma : [row.ma]).filter(Boolean).join(", ");
      const gop = row.gopTu?.length ? ` — gồm: ${row.gopTu.join(", ")}` : "";
      const note = row.ghiChu ? ` (${row.ghiChu})` : "";
      const unsure = row.doTinCay && row.doTinCay !== "chac" ? " [CHƯA CHẮC]" : "";
      lines.push(`   – ${row.tinh}: ${ma}${gop}${note}${unsure}`);
    }
  };
  render(data.bangMoi, "BẢNG HIỆN HÀNH (sau sáp nhập tỉnh 01/7/2025)");
  render(data.bangCu, "BẢNG CŨ (xe đang lưu hành vẫn mang mã này)");

  if (data.bienDacBiet?.length) {
    lines.push("Biển không theo tỉnh:");
    for (const row of data.bienDacBiet) lines.push(`   – ${row.kyHieu}: ${row.nghia}`);
  }
  const rules = [
    "• CHỈ khẳng định mã có trong hai bảng trên. Mã không có trong bảng ⇒ nói thẳng là mình không chắc, đề nghị người dùng xem cà vẹt/đăng kiểm hoặc tra Cục CSGT — TUYỆT ĐỐI không đoán, không tự thêm mã vào một nhóm tỉnh.",
    "• Nhắc rõ khi cần: tỉnh đã sáp nhập thì xe đăng ký trước 01/7/2025 vẫn mang mã cũ, xe mới theo mã mới; đừng nói mã cũ là 'sai'.",
    "• Không suy ra tỉnh từ ký tự chữ cái (A, B, F…) rồi đoán tỉnh — chữ cái nói loại xe/series.",
  ];
  if (data.chuaChac?.length) {
    rules.push(`• Điểm còn chưa chắc trong dữ liệu này (nếu người dùng hỏi trúng, nói là chưa chắc): ${data.chuaChac.join("; ")}.`);
  }
  lines.push(...rules);
  if (data.nguon?.length) lines.push(`Nguồn: ${data.nguon.slice(0, 4).join(" · ")}${data.capNhat ? ` · cập nhật ${data.capNhat}` : ""}`);
  return lines.join("\n");
}
