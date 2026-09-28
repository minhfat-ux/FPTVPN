// Đẩy một tin JSON lên connector (agent-bus) — có thử lại vì mạng hay timeout.
// Dùng: node ops/_scratch/bus-push-json.mjs <tệp-json> [số-lần-thử]
import fs from "node:fs";

const file = process.argv[2];
const attempts = Number(process.argv[3]) || 4;
if (!file) {
  console.error("Thiếu tệp JSON");
  process.exit(2);
}
const payload = JSON.parse(fs.readFileSync(file, "utf8"));

let url = "https://fbuddy.meetflowai.site/agent-bus";
let token = "";
try {
  for (const line of fs.readFileSync(".env.bus", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^['"]|['"]$/g, "");
    if (m[1] === "AGENT_BUS_URL") url = v.replace(/\/$/, "");
    if (m[1] === "AGENT_BUS_TOKEN") token = v;
  }
} catch {
  /* dùng env hoặc mặc định */
}
url = process.env.AGENT_BUS_URL || url;
token = process.env.AGENT_BUS_TOKEN || token;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(`${url}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, from: "win" }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    console.log(`lần ${attempt}: HTTP ${response.status} ${text.slice(0, 300)}`);
    if (response.ok) process.exit(0);
  } catch (error) {
    console.log(`lần ${attempt}: lỗi ${String(error?.message ?? error).slice(0, 120)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
}
console.error("KHÔNG đẩy được tin lên bus sau nhiều lần thử");
process.exit(3);
