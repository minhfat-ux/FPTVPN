// Bảo mật tầng HTTP (2026-09-20): header bảo mật + giới hạn tần suất.
// Chủ dự án: "nhớ có các feature security nhé, dễ bị hack lắm đấy".
import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { bootServer, closeServer } from "./helpers.js";

const { initDb } = await import("../src/db.js");
initDb();
const { baseUrl } = await bootServer();

after(async () => { await closeServer(); });

test("mọi phản hồi có header bảo mật", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const csp = res.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(res.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.equal(res.headers.get("x-powered-by"), null, "không được lộ Express");
});

test("trang web (vỏ SPA) cũng có CSP và không cache", async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.match(res.headers.get("content-security-policy") ?? "", /script-src 'self'/);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
});

test("chặn khi gọi quá nhanh (429 + Retry-After)", async () => {
  let limited = null;
  for (let i = 0; i < 60; i += 1) {
    const res = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "spam" }),
    });
    if (res.status === 429) {
      limited = res;
      break;
    }
  }
  assert.ok(limited, "gọi dồn dập vào /api/chat/stream phải bị chặn 429");
  assert.ok(Number(limited.headers.get("retry-after")) > 0, "phải kèm Retry-After");
  const body = await limited.json();
  assert.equal(body.error.code, "rate_limited");
});
