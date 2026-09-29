#!/usr/bin/env node
/**
 * ĐO LẠI cơ chế làm rách `auth.json` của control-plane (sự cố 29/09/2026 → T-20260929-01).
 *
 * Dùng:  node ops/verify-auth-save-race.mjs [đường-dẫn-auth-store.js] [rounds] [saves/round]
 *        # chạy trên node-2, mặc định trỏ module ĐANG CHẠY:
 *        node ops/verify-auth-save-race.mjs   →  verdict OK
 *        # đối chứng bản CŨ (trước vá):
 *        node ops/verify-auth-save-race.mjs /root/flowvpn-cp/src/auth-store.js.bak-20260929-500fix 3 50
 *
 * Vì sao cần: `AuthStore._save()` cũ ghi qua CÙNG tệp tạm `auth.json.tmp` nên hai request đồng thời
 * chồng lên nhau ⇒ `rename` ném `ENOENT` và tệp `auth.json` bị trộn thành JSON không hợp lệ. Bản vá
 * (tên tệp tạm riêng + xếp hàng ghi) phải chịu được bài bắn này. Script CHỈ ghi vào thư mục tạm
 * trong /tmp — không đụng dữ liệu thật.
 *
 * Exit: 0 = không rách (OK) · 1 = có ENOENT/JSON hỏng (cơ chế còn) · 3 = không import được module.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const modPath = process.argv[2] || '/root/flowvpn-cp/src/auth-store.js';
const rounds = Number(process.argv[3] || 3);
const perRound = Number(process.argv[4] || 50);

let AuthStore;
try {
  ({ AuthStore } = await import(modPath));
} catch (err) {
  console.error(`✗ Không import được ${modPath}: ${err.message}`);
  console.error('  (Node ESM cần đuôi .js/.mjs — bản .bak phải copy sang tên .mjs trước.)');
  process.exit(3);
}

function makeData(tag, n) {
  return {
    users: Array.from({ length: n }, (_, i) => ({
      id: `u-${tag}-${i}`, email: `u${i}@example.com`, appleUserId: null,
      revokedAt: null, createdAt: new Date().toISOString(),
    })),
    sessions: [], emailOtps: [], emailLoginRequests: [], joinTokens: [],
    subscriptions: [], enrollmentTokens: [], pendingPayments: [], renewalReminders: [],
  };
}

let enoent = 0, torn = 0, other = 0;
for (let r = 0; r < rounds; r++) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authrace-'));
  const store = new AuthStore(path.join(dir, 'auth.json'));
  const out = await Promise.allSettled(
    Array.from({ length: perRound }, (_, i) =>
      store._save(makeData(`r${r}w${i}`, 200 + ((i * 977) % 4000)))
    )
  );
  for (const o of out) {
    if (o.status !== 'rejected') continue;
    if (String(o.reason && o.reason.message).includes('ENOENT')) enoent++; else other++;
  }
  try {
    // Tệp cuối phải là MỘT bản ghi trọn vẹn: JSON hợp lệ + có users.
    const doc = JSON.parse(fs.readFileSync(path.join(dir, 'auth.json'), 'utf8'));
    if (!Array.isArray(doc.users) || doc.users.length === 0) torn++;
  } catch {
    torn++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

const verdict = enoent === 0 && torn === 0 && other === 0 ? 'OK' : 'FAIL';
console.log(JSON.stringify({ module: modPath, rounds, perRound, enoentRenameErrors: enoent, invalidJsonFiles: torn, otherErrors: other, verdict }));
process.exit(verdict === 'OK' ? 0 : 1);
