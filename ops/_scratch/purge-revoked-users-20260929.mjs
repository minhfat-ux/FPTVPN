// Xoá hẳn các account đã bị revoke khỏi kho auth.json (task T-20260929-02, bus #574).
// Chạy thử: node ops/_scratch/purge-revoked-users-20260929.mjs
// Ghi thật: node ops/_scratch/purge-revoked-users-20260929.mjs --apply
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const AUTH = "/root/flowvpn-cp/data/auth.json";
const BACKUP_DIR = "/root/flowvpn-cp/data/backups";

const before = JSON.parse(fs.readFileSync(AUTH, "utf8"));
const revoked = before.users.filter((user) => user.revokedAt);
console.log("users truoc      :", before.users.length);
console.log("account revoked  :", revoked.length);
for (const user of revoked) console.log("   -", user.email ?? user.id, "revokedAt=", user.revokedAt);

if (!revoked.length) {
  console.log("Không có account revoked nào — không cần làm gì.");
  process.exit(0);
}
if (!APPLY) {
  console.log("\n[chạy thử] thêm --apply để xoá thật (có backup).");
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${BACKUP_DIR}/auth.json.before-purge-${stamp}`;
fs.copyFileSync(AUTH, backup);
console.log("\nbackup:", backup);

const { AuthStore } = await import("file:///root/flowvpn-cp/src/auth-store.js");
const store = new AuthStore(AUTH);
const result = await store.purgeRevokedUsers();

const after = JSON.parse(fs.readFileSync(AUTH, "utf8"));
console.log("ĐÃ XOÁ :", result.removed, "account →", result.emails.join(", "));
console.log("users sau       :", after.users.length);
console.log("còn revoked     :", after.users.filter((user) => user.revokedAt).length);
