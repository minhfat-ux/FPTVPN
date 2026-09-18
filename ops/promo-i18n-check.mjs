/**
 * Canh phần đa ngôn ngữ của popup quảng cáo (`web/public/promo.js`).
 *
 * Vì sao có script này: một lần sửa bằng regex đã làm MỌI thứ tiếng nhận tiêu đề tiếng
 * Anh mà không ai phát hiện. Script kiểm những thứ mắt thường bỏ qua:
 *   1. đủ 3 thứ tiếng vi/en/zh và đủ khoá như nhau;
 *   2. không thứ tiếng nào trùng chữ với thứ tiếng khác (bắt đúng lỗi "quên dịch");
 *   3. `en` không còn dấu tiếng Việt, `zh` phải có chữ Hán;
 *   4. placeholder `{os}` còn nguyên ở mọi thứ tiếng;
 *   5. KHÔNG còn chữ tiếng Việt hardcode ngoài bảng STRINGS (trừ comment).
 *
 * Chạy: node ops/promo-i18n-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(HERE, "..", "web", "public", "promo.js");
const source = fs.readFileSync(TARGET, "utf8");

const failures = [];
function check(ok, label, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

const VIETNAMESE = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const CJK = /[\u4e00-\u9fff]/;

/** Cắt object `STRINGS` ra khỏi file, có bỏ qua `{` nằm trong chuỗi (ví dụ `{os}`). */
function extractStrings(text) {
  const start = text.indexOf("var STRINGS = {");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let quote = "";
  let objectStart = -1;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) objectStart = i;
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { literal: text.slice(objectStart, i + 1), start: objectStart, end: i + 1 };
    }
  }
  return null;
}

const extracted = extractStrings(source);
check(Boolean(extracted), "tìm thấy bảng STRINGS trong promo.js");
if (!extracted) {
  console.error("\nKhông kiểm được gì thêm.");
  process.exit(1);
}

// eslint-disable-next-line no-eval
const STRINGS = eval(`(${extracted.literal})`);
const langs = Object.keys(STRINGS);
check(langs.sort().join(",") === "en,vi,zh", "có đúng 3 thứ tiếng vi/en/zh", langs.join(","));

const baseKeys = Object.keys(STRINGS.vi).sort();
for (const lang of langs) {
  const keys = Object.keys(STRINGS[lang]).sort();
  check(
    keys.join("|") === baseKeys.join("|"),
    `${lang}: đủ khoá như bản vi`,
    keys.length === baseKeys.length ? "" : `vi=${baseKeys.length} ${lang}=${keys.length}`,
  );
}

/** Nhãn nút không cần dịch (tên riêng) — bỏ qua khi so "phải khác nhau". */
const NEUTRAL_KEYS = new Set(["aiIosLabel", "aiAndroidLabel"]);
const proseKeys = baseKeys.filter((key) => !NEUTRAL_KEYS.has(key));

// Không thứ tiếng nào được trùng chữ với thứ tiếng khác ở các câu chính.
for (let i = 0; i < langs.length; i += 1) {
  for (let j = i + 1; j < langs.length; j += 1) {
    const same = proseKeys.filter((key) => STRINGS[langs[i]][key] === STRINGS[langs[j]][key]);
    check(same.length === 0, `${langs[i]} khác ${langs[j]}`, same.length ? `trùng: ${same.join(", ")}` : "");
  }
}

for (const lang of langs) {
  const withDiacritics = baseKeys.filter((key) => VIETNAMESE.test(STRINGS[lang][key]));
  if (lang === "vi") {
    check(withDiacritics.length >= 10, "vi: có dấu tiếng Việt", `${withDiacritics.length} khoá`);
  } else {
    check(withDiacritics.length === 0, `${lang}: không còn dấu tiếng Việt`, withDiacritics.join(", "));
  }
}

const ZH_PROSE = ["eyebrow", "title", "sub", "vpnPitch", "aiPitch", "aiBuy", "note", "later", "never"];
const zhMissing = ZH_PROSE.filter((key) => !CJK.test(STRINGS.zh[key]));
check(zhMissing.length === 0, "zh: các câu chính có chữ Hán", zhMissing.join(", "));

// `en` không được lẫn chữ Hán (bắt lỗi dán nhầm bản zh). Không bắt ASCII thuần vì bản
// tiếng Anh vẫn cố ý dùng gạch ngang dài "—" và dấu "·" cho giống bố cục các thứ tiếng khác.
const enCjk = proseKeys.filter((key) => CJK.test(STRINGS.en[key]));
check(enCjk.length === 0, "en: không lẫn chữ Hán", enCjk.join(", "));

const placeholderBad = langs.filter((lang) => !String(STRINGS[lang].downloadFor ?? "").includes("{os}"));
check(placeholderBad.length === 0, "downloadFor giữ placeholder {os} ở mọi thứ tiếng", placeholderBad.join(", "));

// Còn chữ tiếng Việt ngoài STRINGS (không tính comment) ⇒ có chỗ quên dùng t().
const outside = source.slice(0, extracted.start) + source.slice(extracted.end);
const withoutComments = outside.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const leftovers = withoutComments
  .split("\n")
  .map((line, index) => ({ line: line.trim(), index: index + 1 }))
  .filter((entry) => VIETNAMESE.test(entry.line));
check(
  leftovers.length === 0,
  "không còn chữ tiếng Việt hardcode ngoài STRINGS",
  leftovers.map((entry) => `~dòng ${entry.index}: ${entry.line.slice(0, 70)}`).join(" | "),
);

// Bản `web/dist/promo.js` mới là bản ĐƯỢC PHỤC VỤ, và trước đây hai bản đã lệch nhau
// (public `?v=culi1` / dist `?v=culi2`) mà không ai biết. So byte để không lặp lại.
const DIST = path.resolve(HERE, "..", "web", "dist", "promo.js");
if (fs.existsSync(DIST)) {
  const same = fs.readFileSync(DIST).equals(fs.readFileSync(TARGET));
  check(same, "web/dist/promo.js giống web/public/promo.js (bản được phục vụ không lệch)", same ? "" : "chạy: Copy-Item web\\public\\promo.js web\\dist\\promo.js");
} else {
  console.log("BỎ QUA web/dist/promo.js (chưa build) — nhớ build trước khi deploy.");
}

/*
 * `web/dist/` là bản build cũ nằm trong repo (bị .gitignore) nên rất dễ mục: đã có lúc
 * nó còn tiêu đề "FlowGpt" trong khi web/index.html đã là "fBuddy". Deploy bằng
 * `-SkipBuild` là đẩy nguyên bản mục đó lên sóng. So tiêu đề để bắt tại chỗ.
 */
const DIST_INDEX = path.resolve(HERE, "..", "web", "dist", "index.html");
const SRC_INDEX = path.resolve(HERE, "..", "web", "index.html");
if (fs.existsSync(DIST_INDEX) && fs.existsSync(SRC_INDEX)) {
  const titleOf = (file) => (fs.readFileSync(file, "utf8").match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? "";
  const builtTitle = titleOf(DIST_INDEX);
  const sourceTitle = titleOf(SRC_INDEX);
  check(
    builtTitle === sourceTitle,
    "web/dist/index.html không mục (tiêu đề khớp web/index.html)",
    builtTitle === sourceTitle ? "" : `dist="${builtTitle}" vs nguồn="${sourceTitle}" — chạy: npm --workspace web run build`,
  );
}

console.log("");
if (failures.length) {
  console.log(`I18N FAIL (${failures.length}): ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`I18N OK — ${langs.length} thứ tiếng (${langs.join(", ")}), ${baseKeys.length} khoá mỗi thứ tiếng.`);
