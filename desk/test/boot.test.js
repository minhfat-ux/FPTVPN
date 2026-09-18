import test from "node:test";
import assert from "node:assert/strict";
import { SECRET, seedOrder, seedUser } from "./helpers.js";

/**
 * "Chạy được" phải chứng minh bằng lệnh thật: gọi đúng hàm `start()` mà systemd
 * sẽ gọi, rồi hỏi `/health` qua HTTP.
 */

seedUser({ id: "u_boot", email: "boot@example.com" });
seedOrder({ id: "ord_boot", userId: "u_boot", status: "paid" });

const { start } = await import("../src/index.js");

test("start() mở cổng và /health trả 200", async () => {
  const { server, url } = await start();
  try {
    const response = await fetch(`${url}/v1/desktop/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, "flowdesk");
    assert.equal(body.entitlementSource.available, true);
    assert.equal(JSON.stringify(body).includes(SECRET), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
