import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";

const { RateLimiter, titleFromText, slugify, truncate, newId } = await import("../src/util.js");

test("rate limiter allows up to the limit then blocks with retryAfter", () => {
  const limiter = new RateLimiter({ limit: 3, windowMs: 50 });
  assert.equal(limiter.check("a").ok, true);
  assert.equal(limiter.check("a").ok, true);
  const third = limiter.check("a");
  assert.equal(third.ok, true);
  assert.equal(third.remaining, 0);
  const fourth = limiter.check("a");
  assert.equal(fourth.ok, false);
  assert.ok(fourth.retryAfterMs > 0);
  // A different key has its own bucket.
  assert.equal(limiter.check("b").ok, true);
});

test("rate limiter window expires", async () => {
  const limiter = new RateLimiter({ limit: 1, windowMs: 20 });
  assert.equal(limiter.check("k").ok, true);
  assert.equal(limiter.check("k").ok, false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(limiter.check("k").ok, true);
});

test("conversation titles are derived from the first meaningful line", () => {
  assert.equal(titleFromText("Làm slide về fBuddy"), "Làm slide về fBuddy");
  assert.equal(titleFromText("# Tiêu đề markdown\nNội dung"), "Tiêu đề markdown");
  assert.equal(titleFromText("   \n\n  Dòng thứ hai  "), "Dòng thứ hai");
  assert.equal(titleFromText("Câu hỏi???"), "Câu hỏi");
  assert.equal(titleFromText(""), "Hội thoại mới");
  assert.ok(titleFromText("x".repeat(200)).length <= 64);
});

test("slugify strips Vietnamese diacritics", () => {
  assert.equal(slugify("Máy chủ Tệp"), "may-chu-tep");
  assert.equal(slugify("  ...  "), "item");
});

test("ids are prefixed and unique", () => {
  const a = newId("c");
  const b = newId("c");
  assert.match(a, /^c_[0-9a-f]{20}$/);
  assert.notEqual(a, b);
});

test("truncate keeps a marker and respects the limit", () => {
  assert.equal(truncate("abcdef", 4), "abc…");
  assert.equal(truncate("abc", 10), "abc");
});
