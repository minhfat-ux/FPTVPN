#!/usr/bin/env bash
set -u
TOK="$(grep -h '^Environment=AUTH_TOKEN=' /etc/systemd/system/flowvpn-cp.service.d/admin-token.conf | head -1 | cut -d= -f3)"
echo "token lay tu drop-in: ${#TOK} ky tu"

echo
echo "=== E2E: GET /v1/admin/users tu tien trinh DANG CHAY (7778) ==="
code=$(curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:7778/v1/admin/users -o /tmp/admin-users.json -w '%{http_code}')
echo "http=$code"
head -c 200 /tmp/admin-users.json; echo
node -e '
const j=JSON.parse(require("fs").readFileSync("/tmp/admin-users.json","utf8"));
const arr=Array.isArray(j)?j:(j.users||[]);
console.log("so user tra ve      =", arr.length);
console.log("dong co revokedAt   =", arr.filter(u=>u.revokedAt).length);
console.log("expiry_status revoked =", arr.filter(u=>u.expiry_status==="revoked").length);
console.log("email 3 dong dau    =", arr.slice(0,3).map(u=>u.email).join(", "));
console.log(arr.filter(u=>u.revokedAt).length===0 && arr.length>0 ? "KET QUA: PASS (khong con account revoked trong list)" : "KET QUA: FAIL");
' 2>&1

echo
echo "=== Do lai bo loc tren TEP TAM (khong dung du lieu that) ==="
cat > /tmp/rt-filter.mjs <<'EOF'
import fs from "node:fs";
const src = JSON.parse(fs.readFileSync("/root/flowvpn-cp/data/auth.json", "utf8"));
const one = src.users[0] ?? { id: "u1", email: "a@x" };
const tmp = { ...src, users: [
  { ...one, id: "tmp-ok",  email: "tmp-ok@example.com",  revokedAt: null },
  { ...one, id: "tmp-rev", email: "tmp-rev@example.com", revokedAt: new Date().toISOString() },
]};
fs.writeFileSync("/tmp/auth-filter-test.json", JSON.stringify(tmp));
const { AuthStore } = await import("file:///root/flowvpn-cp/src/auth-store.js");
const store = new AuthStore("/tmp/auth-filter-test.json");
const all = await store.listUsersWithExpiry();
const filt = await store.listUsersWithExpiry({ excludeRevoked: true });
console.log("tong tat ca           =", all.length);
console.log("sau khi loc           =", filt.length);
console.log("con revoked trong list? =", filt.some((u) => u.revokedAt));
console.log(all.length === 2 && filt.length === 1 && !filt.some((u) => u.revokedAt) ? "KET QUA: PASS" : "KET QUA: FAIL");
EOF
node /tmp/rt-filter.mjs 2>&1

echo
echo "=== Don dep tep tam tren may chu ==="
rm -f /tmp/rt-filter.mjs /tmp/auth-filter-test.json /tmp/admin-users.json && echo "da xoa tep tam"
