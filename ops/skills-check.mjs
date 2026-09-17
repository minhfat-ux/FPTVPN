#!/usr/bin/env node
/**
 * Runs EVERY skill end-to-end against a real instance (real provider, real files)
 * and reports what actually happened — not "should work".
 *
 *   node ops/skills-check.mjs                       # production
 *   node ops/skills-check.mjs http://127.0.0.1:7790/api
 *
 * Skills covered: chat · ppt · excel · excel-from-image (OCR fallback) ·
 * data (CSV analysis + chart) · image (Image Studio steering) · hub purchase ·
 * multi-device sessions. Each case asserts the tool ran, the artifact is real
 * (magic bytes) and the answer is non-empty, then prints latency + credit cost.
 *
 * Creates one throwaway account; remove it with:
 *   node ops/prune-test-users.mjs --apply
 */

import fs from "node:fs";

const BASE = (process.argv[2] ?? "https://fbuddy.meetflowai.site/api").replace(/\/+$/, "");
const EMAIL = `skills-check+${Date.now()}@fbuddy.local`;
const PASSWORD = "matkhau12345";

let failures = 0;
const results = [];
const ok = (message) => console.log(`  \u001b[32m✔\u001b[0m ${message}`);
const bad = (message) => {
  failures += 1;
  console.log(`  \u001b[31m✖\u001b[0m ${message}`);
};
const info = (message) => console.log(`    ${message}`);

async function json(method, path, body, token) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 200)}`);
  return parsed;
}

async function upload(token, name, mime, content) {
  const form = new FormData();
  form.append("file", new Blob([content], { type: mime }), name);
  const response = await fetch(`${BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`upload ${name} → ${response.status}: ${JSON.stringify(body).slice(0, 160)}`);
  return body.file;
}

/** One chat turn; returns everything the assertions need. */
async function turn(token, { content, skill, attachments = [], conversationId = null }) {
  const started = Date.now();
  const response = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content, skill, attachments, conversationId, toolMode: "auto" }),
  });
  if (!response.ok) throw new Error(`chat/stream → ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const out = { text: "", notices: [], tools: [], artifacts: [], choices: [], error: null, usage: null, credits: null, conversationId };
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += Buffer.from(chunk).toString("utf8");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const raw = /^data: (.+)$/m.exec(frame)?.[1];
      if (!event || !raw) continue;
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      if (event === "start") out.conversationId = data.conversationId ?? out.conversationId;
      if (event === "delta") out.text += data.text ?? "";
      if (event === "notice") out.notices.push(data.message);
      if (event === "tool_call") out.tools.push(data.name);
      if (event === "tool_result" && data.choices?.length) out.choices = data.choices;
      if (event === "artifact") out.artifacts.push(data);
      if (event === "error") out.error = `${data.code}: ${data.message}`;
      if (event === "done") {
        out.usage = data.usage ?? out.usage;
        out.credits = data.credits ?? out.credits;
        // Planning turns carry the confirmation buttons on `done` (the server
        // attaches them, not the model).
        if (data.choices?.length) out.choices = data.choices;
      }
    }
  }
  out.ms = Date.now() - started;
  return out;
}

async function artifactBytes(token, artifact) {
  const response = await fetch(`${BASE}/files/${artifact.id}/content`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return { ok: false, size: 0, magic: "" };
  const buffer = Buffer.from(await response.arrayBuffer());
  return { ok: true, size: buffer.length, magic: buffer.subarray(0, 2).toString() };
}

function report(name, outcome, detail) {
  results.push({ name, outcome, detail });
}

// ---------------------------------------------------------------- the account
const registered = await json("POST", "/auth/register", { email: EMAIL, password: PASSWORD });
const token = registered.token;
console.log(`fBuddy — kiểm tra toàn bộ skill → ${BASE}`);
console.log(`tài khoản test: ${EMAIL}\n`);

// A full sweep burns ~20k credit and an account only gets the sign-up grant, so an
// admin token (env) tops it up — otherwise the later cases fail on the credit gate
// instead of on the skill.
const adminToken = process.env.FBUDDY_ADMIN_TOKEN ?? null;
if (adminToken) {
  try {
    await json("POST", "/admin/credits", { email: EMAIL, amount: 200000, note: "skills-check" }, adminToken);
    info("đã cấp thêm 200.000 credit cho tài khoản test");
  } catch (err) {
    info(`không cấp được credit qua admin token: ${err.message}`);
  }
} else {
  info("không có FBUDDY_ADMIN_TOKEN → các ca sau có thể hết credit giữa chừng");
}

const before = await json("GET", "/credits", undefined, token);
info(`credit khởi tạo: ${before.credits.balance}`);

// -------------------------------------------------------------------- 1. chat
console.log("\n1. Skill Trò chuyện (chat)");
try {
  const out = await turn(token, { content: "Chào em, 2+2 bằng mấy? Trả lời 1 câu.", skill: "chat" });
  if (out.error) bad(out.error);
  else if (!out.text.trim()) bad("không có nội dung trả lời");
  else ok(`trả lời ${out.text.trim().length} ký tự trong ${(out.ms / 1000).toFixed(1)}s`);
  report("chat", out.error ? "FAIL" : out.text.trim() ? "PASS" : "FAIL", out.error ?? `"${out.text.trim().slice(0, 60)}…"`);
} catch (err) {
  bad(err.message);
  report("chat", "FAIL", err.message);
}

// Every artifact tool now proposes a plan first and writes the file only after the
// user approves, so each file case is two turns: plan → tap "OK, tạo luôn…".
async function planThenCreate(token, { content, skill, attachments = [], conversationId = null, wantsChoice = null }) {
  const plan = await turn(token, { content, skill, attachments, conversationId });
  const choice = plan.choices.find((item) => (wantsChoice ? item.id === wantsChoice : item.id === "create")) ?? plan.choices[0];
  const created = choice
    ? await turn(token, { content: choice.value, skill, conversationId: plan.conversationId })
    : null;
  return { plan, choice, created: created ? { ...created, notices: [...plan.notices, ...created.notices], tools: [...plan.tools, ...created.tools] } : plan };
}

// --------------------------------------------------------------------- 2. ppt
console.log("\n2. Skill Làm PPT (đề xuất dàn ý → xác nhận → generate_pptx)");
try {
  const { plan, created } = await planThenCreate(token, {
    content: "Làm slide 3 trang giới thiệu fBuddy: tính năng, lợi ích, cách bắt đầu.",
    skill: "ppt",
  });
  const pptx = (created?.artifacts ?? []).find((a) => String(a.name).endsWith(".pptx"));
  info(`lượt 1: ${plan.artifacts.length} tệp, ${plan.choices.length} lựa chọn — ${plan.choices.map((c) => c.label).join(" | ")}`);
  if (plan.artifacts.length) bad("lượt đầu đã tạo tệp — phải hỏi xác nhận trước");
  if (!plan.choices.length) bad("không có lựa chọn xác nhận cho người dùng");
  if (plan.error || created?.error) bad(plan.error ?? created.error);
  else if (!pptx) bad(`không có artifact .pptx (tools: ${created?.tools.join(", ") || "không"})`);
  else {
    const bytes = await artifactBytes(token, pptx);
    if (bytes.ok && bytes.magic === "PK" && bytes.size > 20000) ok(`${pptx.name} — ${bytes.size} byte sau khi xác nhận`);
    else bad(`tệp pptx hỏng: ${JSON.stringify(bytes)}`);
  }
  report("ppt", pptx ? "PASS" : "FAIL", pptx ? pptx.name : (plan.error ?? "no artifact"));
} catch (err) {
  bad(err.message);
  report("ppt", "FAIL", err.message);
}

// ------------------------------------------------------------------- 3. excel
console.log("\n3. Skill Làm Excel (kế hoạch → xác nhận → generate_xlsx)");
try {
  const { plan, created } = await planThenCreate(token, {
    content: "Tạo file excel dự toán chi phí marketing 3 tháng: quảng cáo, nội dung, công cụ. Có dòng tổng.",
    skill: "excel",
  });
  const xlsx = (created?.artifacts ?? []).find((a) => String(a.name).endsWith(".xlsx"));
  info(`lượt 1: ${plan.artifacts.length} tệp, ${plan.choices.length} lựa chọn`);
  if (plan.artifacts.length) bad("lượt đầu đã tạo tệp — phải hỏi xác nhận trước");
  if (plan.error || created?.error) bad(plan.error ?? created.error);
  else if (!xlsx) bad(`không có artifact .xlsx (tools: ${created?.tools.join(", ") || "không"})`);
  else {
    const bytes = await artifactBytes(token, xlsx);
    if (bytes.ok && bytes.magic === "PK" && bytes.size > 4000) ok(`${xlsx.name} — ${bytes.size} byte sau khi xác nhận`);
    else bad(`tệp xlsx hỏng: ${JSON.stringify(bytes)}`);
  }
  report("excel", xlsx ? "PASS" : "FAIL", xlsx ? xlsx.name : (plan.error ?? "no artifact"));
} catch (err) {
  bad(err.message);
  report("excel", "FAIL", err.message);
}

// -------------------------------------------------------- 4. excel from image
console.log("\n4. Skill Excel TỪ ẢNH (OCR fallback + xlsx_from_image)");
try {
  // A real raster image with digits the vision model can read: "name number"
  // rows, i.e. exactly the shape of a photographed table.
  const { digitTablePng } = await import("./lib/test-image.mjs");
  const png = digitTablePng(["1200000 12", "1500000 15", "900000 9", "300000 6", "700000 7"]);
  const image = await upload(token, "bang-so-lieu.png", "image/png", png);
  info(`đã tải ảnh test ${image.name}: ${png.length} byte, ${image.id}`);
  const { plan, created } = await planThenCreate(token, {
    content: "Đưa hết data trong ảnh thành excel giúp anh",
    skill: "excel",
    attachments: [image.id],
    wantsChoice: "table",
  });
  const xlsx = (created?.artifacts ?? []).find((a) => String(a.name).endsWith(".xlsx"));
  const ocrNotice = [...(created?.notices ?? []), ...plan.notices].find((n) => /Đã đọc|đang đọc/.test(n));
  for (const notice of plan.notices) info(`notice: ${notice}`);
  info(`lượt 1: tools=${plan.tools.join(", ") || "(không)"} · tệp=${plan.artifacts.length} · lựa chọn=${plan.choices.map((c) => c.label).join(" | ")}`);
  info(`lượt 2: tools=${created?.tools.join(", ") || "(không)"}`);
  if (plan.error || created?.error) bad(plan.error ?? created.error);
  else if (!ocrNotice) bad("fallback thị giác không chạy (không có notice đọc ảnh)");
  else if (plan.artifacts.length) bad("lượt đầu đã tạo tệp — phải hỏi người dùng chọn/lấy gì trước");
  else if (!xlsx) bad(`không có artifact .xlsx (tools: ${created?.tools.join(", ") || "không"})`);
  else {
    const bytes = await artifactBytes(token, xlsx);
    if (bytes.ok && bytes.magic === "PK" && bytes.size > 4000) ok(`${xlsx.name} — ${bytes.size} byte, ${(created.ms / 1000).toFixed(1)}s ở lượt tạo`);
    else bad(`tệp xlsx hỏng: ${JSON.stringify(bytes)}`);
  }
  report(
    "excel-from-image",
    xlsx ? "PASS" : "FAIL",
    xlsx ? `${xlsx.name} · lượt 1 hỏi (${plan.choices.length} lựa chọn) → lượt 2 tạo` : (plan.error ?? "no artifact"),
  );
} catch (err) {
  bad(err.message);
  report("excel-from-image", "FAIL", err.message);
}

// -------------------------------------------------------------------- 5. data
console.log("\n5. Skill Phân tích dữ liệu (analyze_data)");
try {
  const csv = [
    "khu-vuc,doanh-thu,so-don",
    "Mien Bac,1200000,12",
    "Mien Nam,1500000,15",
    "Mien Nam,900000,9",
    "Mien Trung,300000,6",
    "Mien Bac,700000,7",
  ].join("\n");
  const csvFile = await upload(token, "doanh-thu-check.csv", "text/csv", csv);
  const out = await turn(token, {
    content: "Phân tích file này: doanh thu theo khu vực và vẽ biểu đồ giúp anh.",
    skill: "data",
    attachments: [csvFile.id],
  });
  const usedAnalyze = out.tools.includes("analyze_data");
  const hasChart = /biểu đồ|chart|Mien Nam|1\.?500\.?000|1500000/i.test(out.text);
  if (out.error) bad(out.error);
  else if (!usedAnalyze) bad(`không gọi analyze_data (đã gọi: ${out.tools.join(", ") || "không"})`);
  else if (!out.text.trim()) bad("không có nội dung phân tích");
  else ok(`analyze_data chạy, trả lời ${out.text.trim().length} ký tự${hasChart ? " (có số liệu/biểu đồ)" : ""}`);
  report("data", usedAnalyze && out.text.trim() ? "PASS" : "FAIL", out.error ?? `tools=${out.tools.join(",")}`);
} catch (err) {
  bad(err.message);
  report("data", "FAIL", err.message);
}

// ------------------------------------------------------------------- 6. image
console.log("\n6. Skill Sửa ảnh (đường dẫn Image Studio / edit_image)");
try {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
  const image = await upload(token, "anh-test.png", "image/png", png);
  const out = await turn(token, {
    content: "Cắt ảnh này thành hình vuông giúp anh",
    skill: "image",
    attachments: [image.id],
  });
  const usedImageTool = out.tools.some((name) => ["open_image_studio", "edit_image", "read_image"].includes(name));
  if (out.error) bad(out.error);
  else if (!usedImageTool) bad(`không gọi công cụ ảnh nào (đã gọi: ${out.tools.join(", ") || "không"})`);
  else if (!out.text.trim()) bad("không có nội dung trả lời");
  else ok(`gọi ${out.tools.join(", ")} và trả lời ${out.text.trim().length} ký tự`);
  report("image", usedImageTool && out.text.trim() ? "PASS" : "FAIL", out.error ?? `tools=${out.tools.join(",")}`);
} catch (err) {
  bad(err.message);
  report("image", "FAIL", err.message);
}

// --------------------------------------------------------------------- 7. hub
console.log("\n7. Chợ kỹ năng (mua bằng credit)");
try {
  const listing = await json("GET", "/hub", undefined, token);
  const onSale = listing.items.filter((skill) => skill.state !== "coming_soon");
  const cheapest = [...onSale].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
  if (!cheapest) bad("chợ không có kỹ năng nào đang mở bán");
  else {
    const purchase = await json("POST", `/hub/${cheapest.id}/purchase`, {}, token);
    const skills = await json("GET", "/skills", undefined, token);
    if (skills.items.some((skill) => skill.id === cheapest.id)) {
      ok(`mua "${cheapest.name}" (${cheapest.price} credit) và đã cài vào dropdown`);
    } else bad(`mua rồi nhưng không thấy trong dropdown`);
    report("hub", "PASS", `${cheapest.name} · ${purchase.skill?.price ?? cheapest.price} credit`);
  }
} catch (err) {
  bad(err.message);
  report("hub", "FAIL", err.message);
}

// ------------------------------------------------------------- 8. multi-device
console.log("\n8. Nhiều thiết bị (sessions + ngữ cảnh)");
try {
  const second = await json("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  const sessions = await json("GET", "/auth/sessions", undefined, token);
  const me = await json("GET", "/auth/me", undefined, second.token);
  if (sessions.items.length >= 2) ok(`${sessions.items.length} phiên cùng lúc, không đá nhau`);
  else bad(`chỉ thấy ${sessions.items.length} phiên`);
  if (me.lastConversationId) ok(`thiết bị 2 thấy hội thoại đang làm việc: ${me.lastConversationId}`);
  else bad("thiết bị 2 không thấy hội thoại hiện tại");
  report("sessions", sessions.items.length >= 2 && me.lastConversationId ? "PASS" : "FAIL", `${sessions.items.length} phiên`);
} catch (err) {
  bad(err.message);
  report("sessions", "FAIL", err.message);
}

// ------------------------------------------------------------------- summary
const after = await json("GET", "/credits", undefined, token);
console.log("\n================ TỔNG KẾT ================");
for (const item of results) {
  const mark = item.outcome === "PASS" ? "\u001b[32mPASS\u001b[0m" : "\u001b[31mFAIL\u001b[0m";
  console.log(`${mark}  ${item.name.padEnd(18)} ${item.detail ?? ""}`);
}
console.log(`\ncredit: ${before.credits.balance} → ${after.credits.balance} (đã dùng ${before.credits.balance - after.credits.balance})`);
console.log(`\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}`);
console.log("Dọn tài khoản test: node ops/prune-test-users.mjs --apply");
process.exit(failures ? 1 : 0);
