#!/usr/bin/env node
/**
 * Hỏi chính fBuddy về các app của mình và kiểm tra câu trả lời.
 *
 *   node ops/apps-explain-check.mjs                                    # production
 *   node ops/apps-explain-check.mjs http://127.0.0.1:7790/api
 *
 * Chốt chặn cho lỗi "trợ lý nói sai về MeetFlow AI": dữ kiện nằm ở
 * `server/src/apps-knowledge.js` và luôn được ghép vào system prompt. Script này
 * tạo một tài khoản dùng-một-lần trên máy đích, hỏi 3 câu, rồi soi câu trả lời:
 *
 *   1. MeetFlow AI là gì, có phải là fBuddy không  → phải tả đúng công dụng và nói KHÁC.
 *   2. Công ty và hệ sinh thái gồm những gì        → FlowTech + VPNFlow/SuperMom AI…
 *   3. App nào chưa công bố                        → chỉ "đang phát triển", không bịa.
 *
 * Dọn tài khoản test sau khi chạy:
 *   ssh root@165.101.114.162 "node -e \"…DELETE FROM users WHERE email LIKE 'apps-explain+%'\""
 */

const BASE = (process.argv[2] ?? "https://fbuddy.meetflowai.site/api").replace(/\/+$/, "");
const EMAIL = `apps-explain+${Date.now()}@fbuddy.local`;
const PASSWORD = "matkhau12345";

let failures = 0;
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
  return { ok: response.ok, status: response.status, data: parsed, text };
}

/** Một lượt chat thật, trả về nội dung đã ghép từ các frame SSE `delta`. */
async function ask(token, content) {
  const response = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content, skill: "chat" }),
  });
  if (!response.ok) throw new Error(`chat/stream → ${response.status} ${(await response.text()).slice(0, 200)}`);

  let answer = "";
  let credits = null;
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
      if (event === "delta") answer += data.text ?? "";
      if (event === "done") credits = data.credits ?? null;
      if (event === "error") bad(`lỗi từ server: ${data.message}`);
    }
  }
  return { answer: answer.trim(), credits };
}

/**
 * Câu hỏi + điều kiện. `must` phải khớp, `mustNot` phải KHÔNG khớp — phần chặn
 * đúng lỗi đã gặp: nhầm MeetFlow AI thành fBuddy hoặc thành tên công ty.
 */
const QUESTIONS = [
  {
    q: "MeetFlow AI là gì? Nó có phải là em (fBuddy) không?",
    must: [
      [/dịch|biên bản|cuộc họp|cuộc gọi/i, "nói đúng công dụng: dịch và ghi biên bản cuộc họp"],
      [/\bkhác\b|không phải|riêng|hai (sản phẩm|app)/i, "nói rõ MeetFlow AI KHÁC fBuddy"],
      [/flowtech|sản phẩm khác/i, "đặt MeetFlow AI vào hệ sinh thái FlowTech"],
    ],
    mustNot: [
      [/meetflow ai[^.]{0,60}(chính là|tức là|là phiên bản|là bản (mobile|di động|khác)|được phát triển từ)[^.]{0,30}(f ?buddy|em\b)/i, "nhầm MeetFlow AI là fBuddy"],
      [/meetflow ai[^.]{0,60}(là|cũng là)[^.]{0,20}công ty/i, "gọi MeetFlow AI là công ty"],
      [/công ty (mẹ )?(của (em|f ?buddy) )?(chính )?là meetflow ai/i, "gọi MeetFlow AI là công ty mẹ của fBuddy"],
    ],
  },
  {
    q: "Công ty làm ra em tên là gì, và hệ sinh thái đó có những app nào?",
    must: [
      [/flowtech/i, "nêu tên công ty/hệ sinh thái: FlowTech"],
      [/vpnflow|supermon|supermom|harness/i, "kể được ít nhất một app khác trong hệ sinh thái"],
    ],
    mustNot: [[/meetflow ai là công ty/i, "gọi MeetFlow AI là công ty"]],
  },
  {
    q: "Bên mình có app nào đang làm mà chưa ra mắt không?",
    must: [[/chưa (công bố|ra mắt|phát hành)|đang phát triển|sắp ra mắt|chưa có thông tin/i, "nói đúng trạng thái chưa công bố"]],
    mustNot: [[/đã (có|ra mắt) trên (app store|google play|ch play)/i, "không được nói app chưa công bố đã phát hành"]],
  },
];

console.log(`fBuddy — kiểm tra trợ lý giải thích các app của mình → ${BASE}`);

const registered = await json("POST", "/auth/register", { email: EMAIL, password: PASSWORD });
if (!registered.ok) {
  console.error(`Không đăng ký được tài khoản test: ${registered.status} ${registered.text.slice(0, 200)}`);
  process.exit(1);
}
const token = registered.data.token;
ok(`tài khoản test: ${EMAIL}`);

let spent = 0;
for (const item of QUESTIONS) {
  console.log(`\n> ${item.q}\n`);
  let result;
  try {
    result = await ask(token, item.q);
  } catch (error) {
    bad(`không hỏi được: ${error.message}`);
    continue;
  }
  console.log(result.answer || "(không có nội dung trả về)");
  console.log("");
  spent += result.credits?.cost ?? 0;
  const text = result.answer;
  for (const [pattern, label] of item.must) {
    if (pattern.test(text)) ok(label);
    else bad(`thiếu: ${label}`);
  }
  for (const [pattern, label] of item.mustNot) {
    if (pattern.test(text)) bad(`sai: ${label}`);
    else ok(`không mắc lỗi: ${label}`);
  }
}

info(`tổng credit đã trừ cho ${QUESTIONS.length} câu: ${spent}`);
console.log(`\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}`);
process.exit(failures ? 1 : 0);
