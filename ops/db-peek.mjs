// Xem nhanh mot DB: cho biet day la ban flowgpt hay fbuddy.
import { all, initDb, db } from "../server/src/db.js";

initDb();
const dir = process.env.FLOWGPT_DATA_DIR ?? "(mac dinh)";
const skills = all("hub_skills", "", [], { order: "slug ASC" });
const users = all("users");
console.log(`--- ${dir} ---`);
console.log(`  hub_skills(${skills.length}): ${skills.map((s) => `${s.slug}=${s.price_vnd ?? "n/a"}`).join(" ")}`);
console.log(`  users(${users.length}): ${users.map((u) => u.email).join(", ") || "(none)"}`);
db.close?.();
