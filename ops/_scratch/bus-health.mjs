// Xem /health cua connector: ai dang nghe (subscribers), hang doi.
import fs from "node:fs";
let url = "https://fbuddy.meetflowai.site/agent-bus";
let token = "";
const raw = fs.readFileSync(".env.bus", "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const v = m[2].trim().replace(/^['"]|['"]$/g, "");
  if (m[1] === "AGENT_BUS_URL") url = v.replace(/\/$/, "");
  if (m[1] === "AGENT_BUS_TOKEN") token = v;
}
const r = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } });
console.log("status", r.status);
console.log(JSON.stringify(await r.json(), null, 1).slice(0, 3000));
