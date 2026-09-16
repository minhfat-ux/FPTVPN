import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("bootstrap: route tồn tại và là PUBLIC (không nằm sau requireAdminAuth)", () => {
  assert.ok(src.includes('app.get("/v1/bootstrap"'), "thiếu route /v1/bootstrap");
  const body = src.slice(src.indexOf('app.get("/v1/bootstrap"'), src.indexOf('app.get("/v1/bootstrap"') + 2600);
  assert.ok(!/requireAdminAuth/.test(body), "bootstrap phải public, không được chặn bằng token admin");
  assert.ok(body.includes('Cache-Control'), "phải có Cache-Control ngắn để client cache");
});

test("bootstrap: trả đủ field cho client né chặn, KHÔNG chứa secret", () => {
  const body = src.slice(src.indexOf('app.get("/v1/bootstrap"'), src.indexOf('app.get("/v1/bootstrap"') + 2600);
  for (const f of ["api_hosts", "relay_hosts", "transport_order", "min_app_version", "update_url", "poll_after_seconds"]) {
    assert.ok(body.includes(f), `thiếu field ${f}`);
  }
  assert.ok(body.includes("t1.meetflowai.site"), "mặc định phải có host dự phòng t1.meetflowai.site");
  assert.ok(body.includes("api.meetflowai.site"), "mặc định phải có host chính");
  for (const bad of ["AUTH_TOKEN", "privateKey", "TELEGRAM", "CLOUDFLARE"]) {
    assert.ok(!body.includes(bad), `bootstrap không được lộ ${bad}`);
  }
});
