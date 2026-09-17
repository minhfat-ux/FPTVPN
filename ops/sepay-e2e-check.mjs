#!/usr/bin/env node
/**
 * Kiểm chứng THẬT đường webhook SePay, chạy trên server (đọc/ghi trực tiếp SQLite).
 *
 *   node ops/sepay-e2e-check.mjs                                  # production
 *   node ops/sepay-e2e-check.mjs http://127.0.0.1:7790            # tại chỗ
 *
 * Việc script làm, theo đúng thứ tự:
 *   1. tạo tài khoản tạm + một đơn nạp "starter"
 *   2. bật SePay ở chế độ `webhook` với secret TẠM
 *   3. gửi webhook ĐÃ KÝ qua HTTPS công khai (đi qua Caddy) → credit phải vào đúng
 *   4. gửi lại y hệt → không được cộng thêm (idempotent)
 *   5. gửi bản KHÔNG ký → phải bị 401
 *   6. dọn sạch: xoá tài khoản tạm cùng mọi dòng nó sở hữu, trả cài đặt SePay về như cũ
 *
 * Bước 3 là phần mà test trong `server/test/` không chứng minh được: Caddy có giữ
 * nguyên văn thân request hay không (chữ ký HMAC hỏng ngay nếu proxy sửa body).
 */
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const BASE = (process.argv[2] ?? "https://fbuddy.meetflowai.site").replace(/\/+$/, "");
const SECRET = `spsk_e2e_${crypto.randomBytes(12).toString("hex")}`;
const EMAIL = `sepay-e2e+${Date.now()}@fbuddy.test`;

const { initDb } = await import("../server/src/db.js");
const { config } = await import("../server/src/config.js");
const { createUser } = await import("../server/src/auth.js");
const { getBalance } = await import("../server/src/credits.js");
const { createTopupOrder, listTopupOrders } = await import("../server/src/topup.js");
const settings = await import("../server/src/settings.js");

initDb();

const ok = (message) => console.log(`  \u001b[32m✔\u001b[0m ${message}`);
const bad = (message) => {
  failures += 1;
  console.log(`  \u001b[31m✖\u001b[0m ${message}`);
};

let failures = 0;
let userId = null;

const before = settings.readAppSettings();
const restore = {
  sepayEnabled: before.sepayEnabled,
  sepayMode: before.sepayMode,
  sepayWebhookSecretEnc: before.sepayWebhookSecretEnc,
  sepayApiTokenEnc: before.sepayApiTokenEnc,
};

console.log(`\n== Kiểm chứng webhook SePay qua ${BASE} ==`);

try {
  const user = createUser({ email: EMAIL, password: "matkhau12345", name: "SePay E2E" });
  userId = user.id;
  ok(`tài khoản tạm: ${EMAIL}`);

  settings.applyAppSettingsPatch({ sepayWebhookSecret: SECRET });
  settings.patchAppSettings({ sepayEnabled: true, sepayMode: "webhook" });
  ok("đã bật SePay (chế độ webhook) với secret tạm — sẽ trả lại như cũ ở bước dọn");

  const order = createTopupOrder({ user, packageId: "starter" }).order;
  const balanceBefore = getBalance(user.id);
  ok(`đơn ${order.transferNote}: ${order.tokens} credit / ${order.amountVnd.toLocaleString("vi-VN")}đ`);

  const raw = JSON.stringify({
    id: `e2e_${Date.now()}`,
    transaction_content: `CT DEN: ${order.transferNote} chuyen tien nap`,
    amount_in: String(order.amountVnd),
    transfer_type: "in",
    transaction_date: new Date().toISOString().slice(0, 19).replace("T", " "),
  });

  const sendSigned = async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac("sha256", SECRET).update(`${timestamp}.${raw}`).digest("hex");
    const response = await fetch(`${BASE}/api/topup/sepay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SePay-Signature": `sha256=${signature}`,
        "X-SePay-Timestamp": String(timestamp),
      },
      body: raw,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  const first = await sendSigned();
  if (first.status === 200 && first.body?.applied === 1) {
    ok("webhook đã ký, gửi qua HTTPS công khai: nhận và khớp đúng 1 đơn");
  } else {
    bad(`lần gửi đầu: HTTP ${first.status} ${JSON.stringify(first.body)}`);
  }

  const afterFirst = getBalance(user.id);
  if (afterFirst === balanceBefore + order.tokens) {
    ok(`credit vào đúng: ${balanceBefore} → ${afterFirst} (+${order.tokens})`);
  } else {
    bad(`số dư sai: mong ${balanceBefore + order.tokens}, thực ${afterFirst}`);
  }

  const stored = listTopupOrders({ userId: user.id, limit: 1 })[0];
  if (stored?.status === "paid") ok(`đơn chuyển sang "paid" (confirmedBy=${stored.confirmedBy})`);
  else bad(`đơn còn ở trạng thái "${stored?.status}"`);

  const second = await sendSigned();
  if (second.status === 200 && second.body?.applied === 0) ok("gửi lại y hệt: không cộng thêm (idempotent)");
  else bad(`lần gửi lại: HTTP ${second.status} ${JSON.stringify(second.body)}`);
  if (getBalance(user.id) === afterFirst) ok("số dư không đổi sau khi gửi lại");
  else bad("SỐ DƯ BỊ CỘNG HAI LẦN");

  const unsigned = await fetch(`${BASE}/api/topup/sepay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
  if (unsigned.status === 401) ok("webhook không ký bị từ chối (401)");
  else bad(`webhook không ký trả HTTP ${unsigned.status} (mong 401)`);
} finally {
  try {
    if (userId) {
      const db = new DatabaseSync(config.dbFile);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
      let removed = 0;
      for (const table of tables) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((col) => col.name);
        if (!columns.includes("user_id")) continue;
        removed += db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId).changes;
      }
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      db.close();
      ok(`đã xoá tài khoản tạm và ${removed} dòng nó sở hữu`);
    }
  } catch (err) {
    bad(`dọn tài khoản tạm lỗi: ${err?.message ?? err}`);
  }
  try {
    settings.patchAppSettings(restore);
    ok("đã trả cài đặt SePay về đúng trạng thái trước khi chạy");
  } catch (err) {
    bad(`khôi phục cài đặt lỗi: ${err?.message ?? err}`);
  }
}

console.log(failures ? `\n\u001b[31m${failures} mục KHÔNG ĐẠT\u001b[0m` : "\n\u001b[32mĐẠT HẾT\u001b[0m");
process.exitCode = failures ? 1 : 0;
