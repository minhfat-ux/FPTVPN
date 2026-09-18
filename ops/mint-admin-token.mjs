import fs from "node:fs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

/** Đọc biến môi trường từ file env của systemd (chỉ lấy KEY=VALUE, bỏ comment). */
function loadEnvFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
    }
  } catch (error) {
    console.error(`! không đọc được ${file}: ${error.message}`);
  }
  return out;
}

const env = { ...loadEnvFile("/etc/fbuddy/fbuddy.env"), ...process.env };
const secret = env.FBUDDY_SECRET;
if (!secret || secret.length < 16) {
  console.error("! thiếu FBUDDY_SECRET");
  process.exit(1);
}
const dbPath = env.FBUDDY_DATA_DIR ? `${env.FBUDDY_DATA_DIR}/fbuddy.db` : "/var/lib/fbuddy/fbuddy.db";
const db = new DatabaseSync(dbPath);
const admin = db.prepare("select id, email, role, token_version from users where role = 'admin' order by created_at limit 1").get();
if (!admin) {
  console.error("! không có user admin");
  process.exit(1);
}

const b64url = (input) => Buffer.from(input).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", `jwt:${secret}`).update(data).digest("base64url");
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const body = b64url(JSON.stringify({
  sub: admin.id,
  email: admin.email,
  role: admin.role,
  tv: admin.token_version ?? 1,
  iat: now,
  exp: now + 60 * 60 * 6,
}));
const token = `${header}.${body}.${sign(`${header}.${body}`)}`;

const outFile = process.argv[2] ?? "/root/fbuddy-admin-token.txt";
fs.writeFileSync(outFile, `${token}\n`, { mode: 0o600 });
console.log(`✓ token admin cho ${admin.email} (${admin.id}) → ${outFile} (hết hạn sau 6h)`);

const response = await fetch("http://127.0.0.1:7790/api/admin/hub?lang=vi", { headers: { Authorization: `Bearer ${token}` } });
console.log(`kiểm tra GET /admin/hub → ${response.status}`);
const payload = await response.json().catch(() => null);
console.log(`số mục chợ: ${payload?.items?.length ?? "?"}`);
