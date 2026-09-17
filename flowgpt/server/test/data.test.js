import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";

const { parseDelimited, coerce, inferType, groupBy, pearson, mean, median, stddev, quantile } =
  await import("../src/skills/data.js");

const CSV = [
  "khu-vuc,san-pham,doanh-thu,so-luong,ngay",
  "Mien Bac,Goi Pro,1200000,12,2026-01-05",
  "Mien Bac,Goi Pro,900000,9,2026-01-19",
  "Mien Nam,Goi Pro,1500000,15,2026-02-02",
  'Mien Nam,"Goi Pro, nam",9900000,10,2026-02-16',
  "Mien Trung,Goi Basic,300000,6,2026-03-02",
].join("\n");

test("CSV parser handles quotes, embedded commas and type coercion", () => {
  const table = parseDelimited(CSV);
  assert.deepEqual(table.columns, ["khu-vuc", "san-pham", "doanh-thu", "so-luong", "ngay"]);
  assert.equal(table.rows.length, 5);
  assert.equal(table.rows[0][2], 1200000);
  assert.equal(typeof table.rows[0][2], "number");
  // Quoted field with a comma survives.
  assert.equal(table.rows[3][1], "Goi Pro, nam");
  // ISO dates become Date objects.
  assert.ok(table.rows[0][4] instanceof Date);
});

test("delimiter detection copes with semicolons and tabs", () => {
  assert.deepEqual(parseDelimited("a;b\n1;2").columns, ["a", "b"]);
  assert.deepEqual(parseDelimited("a\tb\n1\t2").columns, ["a", "b"]);
});

test("coerce classifies numbers, booleans, dates and text", () => {
  assert.equal(coerce("1.234"), 1234);
  assert.equal(coerce("1,5"), 1.5);
  assert.equal(coerce("true"), true);
  assert.equal(coerce(""), null);
  assert.equal(coerce("abc"), "abc");
  assert.ok(coerce("2026-01-05") instanceof Date);
});

test("inferType needs a large majority to call a column numeric", () => {
  assert.equal(inferType([1, 2, 3, 4]), "number");
  assert.equal(inferType([1, 2, "x", "y"]), "string");
  assert.equal(inferType([new Date(), new Date()]), "date");
  assert.equal(inferType([null, null]), "empty");
});

test("statistics helpers match known values", () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.ok(Math.abs(stddev([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
});

test("group_by aggregates numeric metrics and sorts by the first metric", () => {
  const table = parseDelimited(CSV);
  const result = groupBy(table, {
    by: ["khu-vuc"],
    metrics: [{ column: "doanh-thu", agg: "sum" }, { column: "so-luong", agg: "count" }],
  });
  assert.deepEqual(result.columns, ["khu-vuc", "sum doanh-thu", "count so-luong"]);
  assert.equal(result.totalGroups, 3);
  // Mien Nam leads with 1,500,000 + 9,900,000 (the quoted row keeps its comma).
  assert.equal(result.rows[0][0], "Mien Nam");
  assert.equal(result.rows[0][1], 11400000);
  assert.equal(result.rows[0][2], 2);
});

test("group_by without metrics counts rows", () => {
  const table = parseDelimited(CSV);
  const result = groupBy(table, { by: ["san-pham"] });
  const total = result.rows.reduce((sum, row) => sum + row[row.length - 1], 0);
  assert.equal(total, 5);
});

test("pearson correlation is 1 for a perfect line and null for too few points", () => {
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-9);
  assert.equal(pearson([1, 2], [2, 4]), null);
  assert.equal(pearson([1, 1, 1], [2, 3, 4]), null);
});

test("group_by rejects unknown columns with a helpful message", () => {
  const table = parseDelimited(CSV);
  assert.throws(() => groupBy(table, { by: ["khong-co"] }), /Không có cột/);
});
