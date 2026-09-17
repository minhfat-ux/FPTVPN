#!/usr/bin/env node
/**
 * Asks fBuddy itself how credits work, on a throwaway account.
 *
 *   node ops/credit-explain-check.mjs                                    # production
 *   node ops/credit-explain-check.mjs http://127.0.0.1:7790/api
 *
 * Registers a fresh account (which receives the sign-up grant), asks a credit
 * question, prints the streamed answer and the ledger movement. This is the
 * regression guard for "the assistant says fBuddy is free": the answer must
 * mention the formula and how to get more tokens.
 *
 * Clean up the account afterwards:
 *   ssh root@165.101.114.162 "node -e \"…DELETE FROM users WHERE email LIKE 'credit-explain+%'\""
 */

const BASE = (process.argv[2] ?? "https://fbuddy.meetflowai.site/api").replace(/\/+$/, "");
const EMAIL = `credit-explain+${Date.now()}@fbuddy.local`;
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

console.log(`fBuddy — kiểm tra trợ lý giải thích credit → ${BASE}`);

const registered = await json("POST", "/auth/register", { email: EMAIL, password: PASSWORD });
if (!registered.ok) {
  console.error(`Không đăng ký được tài khoản test: ${registered.status} ${registered.text.slice(0, 200)}`);
  process.exit(1);
}
const token = registered.data.token;
ok(`tài khoản test: ${EMAIL}`);

const before = await json("GET", "/credits", undefined, token);
if (!before.ok) {
  console.error("Không đọc được /credits");
  process.exit(1);
}
info(`số dư ban đầu: ${before.data.credits.balance} credit`);

const question =
  "fBuddy có miễn phí không? Credit được cấp và tính như thế nào, và nếu hết thì em xin thêm token hoặc mua ở đâu?";
console.log(`\n> ${question}\n`);

const response = await fetch(`${BASE}/chat/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ content: question, skill: "chat" }),
});
if (!response.ok) {
  console.error(`chat/stream lỗi: ${response.status} ${await response.text()}`);
  process.exit(1);
}

let answer = "";
let usage = null;
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
    if (event === "usage") usage = data;
    if (event === "done") {
      usage = data.usage ?? usage;
      credits = data.credits ?? null;
    }
    if (event === "error") bad(`lỗi từ server: ${data.message}`);
    if (event === "notice") info(`notice: ${data.message}`);
  }
}

console.log(answer.trim() || "(không có nội dung trả về)");
console.log("");
info(`usage: ${JSON.stringify(usage)}  →  trừ ${credits?.cost ?? "?"} credit`);

const lowered = answer.toLowerCase();
const checks = [
  [/không (phải )?(là )?miễn phí|mất phí|trả phí|tốn credit/, "nói rõ fBuddy KHÔNG miễn phí"],
  [/credit/, "nhắc tới credit"],
  [/token/, "nhắc tới token"],
  [/xin thêm token|yêu cầu thêm token|xin thêm/, "chỉ cách xin thêm token"],
  [/nạp|mua thêm|thanh toán|chuyển khoản|vietqr/, "chỉ cách mua/nạp thêm"],
  [/10\.?000|10 nghìn|mười nghìn/, "nêu mức credit được tặng khi đăng nhập"],
  [/ảnh đại diện|tài khoản|hồ sơ|góc trên/, "nêu đường đi tới nút xin/mua"],
];
for (const [pattern, label] of checks) {
  if (pattern.test(lowered)) ok(label);
  else bad(`thiếu: ${label}`);
}

const after = await json("GET", "/credits", undefined, token);
if (after.ok) {
  const ledger = after.data.credits.recent?.[0];
  info(`số dư sau lượt: ${after.data.credits.balance} credit (bút toán gần nhất: ${ledger?.delta} ${ledger?.reason})`);
  const expected = (usage?.in ?? 0) + (usage?.out ?? 0);
  if (expected && ledger && Math.abs(ledger.delta) === expected) ok(`sổ cái khớp công thức: ${expected} = token vào + ra`);
  else if (ledger) info(`token vào + ra = ${expected}, sổ cái ghi ${Math.abs(ledger.delta)}`);
}

console.log(`\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}`);
process.exit(failures ? 1 : 0);
