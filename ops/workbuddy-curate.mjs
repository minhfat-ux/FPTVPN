#!/usr/bin/env node
/**
 * Chọn lọc skill/expert WorkBuddy theo tiêu chí của chủ dự án:
 *   1) liên quan Việt Nam / Đông Nam Á
 *   2) thuộc các nhóm: marketing · bán hàng · tài chính · PPT · researcher · expert ·
 *      giáo dục trẻ · giải toán · ngoại ngữ
 *
 *   node ops/workbuddy-curate.mjs
 *
 * Đọc `ops/workbuddy-content.json` (đã kéo nội dung thật), ghi `ops/workbuddy-curated.json`.
 * Khớp theo từ khoá trên slug + tên + mục đích + thân bài; mỗi nhóm có bộ từ khoá Trung/Anh/Việt.
 */
import fs from "node:fs/promises";

const GROUPS = {
  // CHỈ Việt Nam + Đông Nam Á. Cố ý KHÔNG để các từ rộng như 出海/跨境/国际化 — chúng
  // bắt cả expert cho Ai Cập, Brazil, Mexico… (không phải thị trường của mình).
  "Việt Nam / Đông Nam Á": ["越南", "vietnam", "viet nam", "东南亚", "东盟", "asean", "southeast asia", "indonesia", "印尼", "thailand", "泰国", "malaysia", "马来西亚", "philippines", "菲律宾", "singapore", "新加坡", "myanmar", "缅甸", "cambodia", "柬埔寨", "laos", "老挝", "mekong", "湄公"],
  marketing: ["营销", "品牌", "推广", "投放", "增长", "social media", "小红书", "内容营销", "marketing", "campaign", "seo", "广告"],
  sales: ["销售", "商务", "谈判", "客户开发", "商机", "报价", "投标", "sales", "crm", "lead generation", "proposal", "话术"],
  finance: ["金融", "财务", "会计", "投资", "估值", "财报", "税务", "预算", "成本", "finance", "investment", "accounting", "valuation", "stock", "现金流"],
  ppt: ["ppt", "幻灯片", "演示", "汇报", "路演", "slide", "presentation", "deck", "keynote"],
  researcher: ["研究", "调研", "竞品", "行业分析", "情报", "洞察", "research", "market analysis", "survey", "benchmark"],
  expert: ["顾问", "咨询", "专家", "战略", "解决方案", "consult", "advisory", "strategy", "solution architect", "诊断"],
  "giáo dục trẻ": ["儿童", "亲子", "小学", "少儿", "启蒙", "kids", "children", "parenting", "课后", "作业"],
  "giải toán": ["数学", "解题", "几何", "代数", "奥数", "math", "geometry", "algebra", "equation", "习题"],
  "ngoại ngữ": ["英语", "外语", "口语", "词汇", "语法", "听力", "雅思", "托福", "language learning", "english", "ielts", "toefl", "vocabulary"],
};

const items = JSON.parse(await fs.readFile("ops/workbuddy-content.json", "utf8"));
const matched = [];
for (const item of items) {
  // Khớp trên slug + tên + nhóm + mục đích. KHÔNG quét thân bài: thân bài dài nên từ khoá
  // chung (研究/专家/顾问) khớp gần như mọi mục và làm bộ lọc mất tác dụng.
  const haystack = [item.slug, item.name, item.category, item.purpose]
    .filter(Boolean).join(" \n ").toLowerCase();
  const groups = Object.entries(GROUPS)
    .filter(([, words]) => words.some((w) => haystack.includes(w.toLowerCase())))
    .map(([name]) => name);
  if (!groups.length) continue;
  const seaSpecific = groups.includes("Việt Nam / Đông Nam Á");
  matched.push({
    kind: item.kind, slug: item.slug, name: item.name, category: item.category,
    groups, seaSpecific, needsSetup: Boolean(item.needsSetup),
    bodyLength: item.bodyLength ?? 0, sourceFile: item.sourceFile,
    purpose: (item.purpose ?? "").slice(0, 300), prerequisites: (item.prerequisites ?? "").slice(0, 200),
    body: item.body ?? null,
  });
}
matched.sort((a, b) => (b.seaSpecific - a.seaSpecific) || b.groups.length - a.groups.length || b.bodyLength - a.bodyLength);
await fs.writeFile("ops/workbuddy-curated.json", `${JSON.stringify(matched, null, 1)}\n`);

const byGroup = {};
for (const m of matched) for (const g of m.groups) byGroup[g] = (byGroup[g] ?? 0) + 1;
console.log(`== CHỌN ĐƯỢC ${matched.length}/${items.length} mục ==`);
console.log(`   expert ${matched.filter((m) => m.kind === "expert").length} · skill ${matched.filter((m) => m.kind === "skill").length}`);
console.log(`   dùng ngay ${matched.filter((m) => !m.needsSetup).length} · cần API key/đăng nhập ${matched.filter((m) => m.needsSetup).length}`);
console.log(`   riêng Việt Nam/Đông Nam Á: ${matched.filter((m) => m.seaSpecific).length}\n`);
for (const [g, n] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) console.log(`   ${g.padEnd(24)} ${n}`);
console.log("\n== 12 mục sát Việt Nam/ĐNA nhất ==");
for (const m of matched.filter((x) => x.seaSpecific).slice(0, 12)) {
  console.log(`   [${m.kind}] ${m.slug.padEnd(30)} ${m.needsSetup ? "cần key" : "dùng ngay"} · ${(m.purpose || m.name || "").slice(0, 60)}`);
}
console.log("\nđã ghi ops/workbuddy-curated.json");
