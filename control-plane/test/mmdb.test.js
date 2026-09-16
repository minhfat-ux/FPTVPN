import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MmdbReader, parseIp } from "../src/mmdb.js";

// Bảng GeoIP thật nằm ở /usr/share/GeoIP trên VPS; máy dev có thể trỏ bằng GEOIP_TEST_DB.
const CITY_DB = process.env.GEOIP_TEST_DB || "/usr/share/GeoIP/dbip-city-lite.mmdb";
const ASN_DB = process.env.GEOIP_TEST_ASN_DB || "/usr/share/GeoIP/dbip-asn-lite.mmdb";
const hasDb = fs.existsSync(CITY_DB);

test("parseIp: IPv4 / IPv6 / IPv4-mapped", () => {
  assert.deepEqual(parseIp("8.8.8.8").bytes, Buffer.from([8, 8, 8, 8]));
  assert.equal(parseIp("8.8.8.8").family, 4);
  assert.equal(parseIp("::ffff:1.2.3.4").family, 4, "IPv4-mapped phải coi là IPv4");
  assert.deepEqual(parseIp("::ffff:1.2.3.4").bytes, Buffer.from([1, 2, 3, 4]));
  assert.equal(parseIp("[2001:db8::1]").family, 6, "IPv6 trong ngoặc vuông vẫn phải hiểu");
  assert.equal(parseIp("2001:db8::1").bytes.length, 16);
  assert.equal(parseIp("::").bytes.every((b) => b === 0), true);
  assert.equal(parseIp("::1").bytes[15], 1);
  assert.equal(parseIp("2606:4700:4700::1111").bytes.readUInt16BE(0), 0x2606);
});

test("parseIp: đầu vào sai phải ném lỗi chứ không trả rác", () => {
  for (const bad of ["", "abc", "1.2.3", "1.2.3.256", "1.2.3.4.5", "2001:db8:::1", "gggg::1", "1.2.3.4/24"]) {
    assert.throws(() => parseIp(bad), undefined, `phải ném lỗi với "${bad}"`);
  }
});

test("MmdbReader: file không tồn tại → ném lỗi rõ ràng", () => {
  assert.throws(() => MmdbReader.open(path.join(os.tmpdir(), "khong-co-that.mmdb")));
});

test("MmdbReader: file rác thiếu marker metadata → ném lỗi chứ không đọc bừa", () => {
  const file = path.join(os.tmpdir(), `mmdb-rac-${process.pid}.bin`);
  fs.writeFileSync(file, Buffer.alloc(2048, 7));
  try {
    assert.throws(() => MmdbReader.open(file), /metadata/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("MmdbReader: tra IP thật trong bảng DB-IP (bỏ qua nếu máy không có bảng)", { skip: !hasDb }, () => {
  const reader = MmdbReader.open(CITY_DB);
  try {
    const meta = reader.meta();
    assert.equal(meta.ip_version, 6, "bảng DB-IP Lite là cây IPv6 (chứa cả IPv4)");
    assert.ok([24, 28, 32].includes(meta.record_size), "record_size chỉ có 24/28/32");
    assert.ok(meta.node_count > 1000);

    const google = reader.lookup("8.8.8.8");
    assert.ok(google, "8.8.8.8 phải có dữ liệu");
    assert.equal(google.country?.iso_code, "US");

    const vn = reader.lookup("113.161.80.1");
    assert.equal(vn?.country?.iso_code, "VN", "IP Việt Nam phải ra VN");

    // Dải private/loopback không được trả về dữ liệu quốc gia nào khác.
    assert.equal(reader.lookup("127.0.0.1"), null, "loopback không có bản ghi");
  } finally {
    reader.close();
  }
});

test("MmdbReader: tra được IPv6 và ASN (bỏ qua nếu máy không có bảng)", { skip: !hasDb || !fs.existsSync(ASN_DB) }, () => {
  const asn = MmdbReader.open(ASN_DB);
  try {
    const record = asn.lookup("113.161.80.1");
    assert.ok(record?.autonomous_system_number, "phải có số hiệu AS");
    assert.equal(typeof record.autonomous_system_organization, "string");
  } finally {
    asn.close();
  }
  const city = MmdbReader.open(CITY_DB);
  try {
    const v6 = city.lookup("2606:4700:4700::1111");
    assert.ok(v6, "Cloudflare IPv6 phải có bản ghi");
    assert.equal(v6.country?.iso_code, "US");
  } finally {
    city.close();
  }
});
