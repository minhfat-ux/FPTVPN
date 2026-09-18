import test from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../src/ratelimit.js";

test("cho qua đúng hạn mức rồi chặn", () => {
  const limiter = createLimiter({ windowMs: 60_000, max: 3, name: "t" });
  assert.equal(limiter.take("ip").ok, true);
  assert.equal(limiter.take("ip").ok, true);
  assert.equal(limiter.take("ip").ok, true);
  const blocked = limiter.take("ip");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec >= 1, true);
});

test("hạn mức tính riêng cho từng key", () => {
  const limiter = createLimiter({ windowMs: 60_000, max: 1, name: "t" });
  assert.equal(limiter.take("a").ok, true);
  assert.equal(limiter.take("a").ok, false);
  assert.equal(limiter.take("b").ok, true);
});

test("cửa sổ trượt: hết thời gian thì cho qua lại", async () => {
  const limiter = createLimiter({ windowMs: 40, max: 1, name: "t" });
  assert.equal(limiter.take("ip").ok, true);
  assert.equal(limiter.take("ip").ok, false);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(limiter.take("ip").ok, true);
});

test("peek không tiêu lượt; reset xoá bộ đếm", () => {
  const limiter = createLimiter({ windowMs: 60_000, max: 2, name: "t" });
  assert.equal(limiter.peek("ip").ok, true);
  assert.equal(limiter.peek("ip").used, 0);
  limiter.take("ip");
  assert.equal(limiter.peek("ip").used, 1);
  limiter.reset("ip");
  assert.equal(limiter.peek("ip").used, 0);
});
