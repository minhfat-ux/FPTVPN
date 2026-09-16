import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGeoLookup, isPublicIp, locationLabel } from "../src/geoip.js";

test("isPublicIp: loại đúng loopback/private/CGNAT/ULA", () => {
  for (const ip of ["127.0.0.1", "10.77.0.53", "192.168.1.5", "172.16.0.1", "100.64.0.1", "169.254.1.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "2001:db8::1", ""]) {
    assert.equal(isPublicIp(ip), false, `${ip} không được coi là IP công khai`);
  }
  for (const ip of ["8.8.8.8", "113.161.80.1", "165.101.114.162", "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
    assert.equal(isPublicIp(ip), true, `${ip} phải là IP công khai`);
  }
});

test("locationLabel: ghép thành phố + quốc gia, thiếu thì lấy mức thấp hơn", () => {
  assert.equal(locationLabel({ city: "Hanoi", country_name: "Vietnam" }), "Hanoi, Vietnam");
  assert.equal(locationLabel({ city: "Hanoi", country: "VN" }), "Hanoi, VN");
  assert.equal(locationLabel({ region: "California", country_name: "United States" }), "California, United States");
  assert.equal(locationLabel({ country_name: "Japan" }), "Japan");
  assert.equal(locationLabel({ country: "SG" }), "SG");
  assert.equal(locationLabel(null), null);
  assert.equal(locationLabel({}), null);
});

/** Reader giả — test logic cache/private mà không cần file mmdb. */
function fakeReader(records) {
  return () => ({
    calls: 0,
    lookup(ip) {
      this.calls += 1;
      return records[ip] ?? null;
    },
    meta: () => ({ database_type: "fake", node_count: 1, record_size: 24, ip_version: 6, search_tree_size: 6 }),
    close() {},
  });
}

function tempCacheFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "geoip-")), "cache.json");
}

test("geoip: IP private không tra bảng, vẫn có kết quả để hiển thị", async () => {
  const readers = [];
  const geo = createGeoLookup({
    cityDb: "fake-city",
    asnDb: "fake-asn",
    cacheFile: tempCacheFile(),
    logger: { warn() {} },
    openReader: (file) => {
      const reader = file === "fake-city"
        ? fakeReader({})(file)
        : fakeReader({ "8.8.8.8": { autonomous_system_number: 15169, autonomous_system_organization: "Google LLC" } })(file);
      readers.push(reader);
      return reader;
    },
  });
  const value = await geo.lookup("10.77.0.53");
  assert.equal(value.private, true);
  assert.equal(value.location, null);
  assert.equal(readers.length, 0, "IP private KHÔNG được mở bảng mmdb");
  await geo.close();
});

test("geoip: ghép city + ASN, cache theo TTL và ghi ra file", async () => {
  const cacheFile = tempCacheFile();
  let clock = 1_700_000_000_000;
  const cityRecords = {
    "113.161.80.1": {
      country: { iso_code: "VN", names: { en: "Vietnam" } },
      city: { names: { en: "Ho Chi Minh City" } },
      subdivisions: [{ names: { en: "Ho Chi Minh" } }],
      location: { latitude: 10.75, longitude: 106.66, time_zone: "Asia/Ho_Chi_Minh" },
    },
  };
  const asnRecords = { "113.161.80.1": { autonomous_system_number: 45899, autonomous_system_organization: "VNPT Corp" } };
  let cityOpens = 0;
  const makeLookup = () =>
    createGeoLookup({
      cityDb: "city",
      asnDb: "asn",
      cacheFile,
      ttlMs: 1000,
      now: () => clock,
      logger: { warn() {} },
      openReader: (file) => {
        if (file === "city") cityOpens += 1;
        return fakeReader(file === "city" ? cityRecords : asnRecords)(file);
      },
    });

  const geo = makeLookup();
  const value = await geo.lookup("113.161.80.1");
  assert.equal(value.country, "VN");
  assert.equal(value.country_name, "Vietnam");
  assert.equal(value.city, "Ho Chi Minh City");
  assert.equal(value.region, "Ho Chi Minh");
  assert.equal(value.asn, 45899);
  assert.equal(value.isp, "VNPT Corp");
  assert.equal(value.location, "Ho Chi Minh City, Vietnam");
  assert.equal(value.source, "mmdb");

  // Trong TTL: lần tra sau lấy từ cache, không đụng bảng.
  const again = await geo.lookup("113.161.80.1");
  assert.deepEqual(again, value);
  await geo.close();
  assert.equal(cityOpens, 1, "bảng city chỉ được mở một lần cho cùng một IP");

  // Cache trên đĩa: instance mới đọc lại mà không cần bảng (cho tới khi hết TTL).
  const reloaded = makeLookup();
  const fromDisk = await reloaded.lookup("113.161.80.1");
  assert.equal(fromDisk.location, "Ho Chi Minh City, Vietnam");
  assert.equal(cityOpens, 1, "còn trong TTL thì đọc từ cache đĩa, không mở bảng");

  // Hết TTL ⇒ tra lại từ bảng.
  clock += 60_000;
  await reloaded.lookup("113.161.80.1");
  assert.equal(cityOpens, 2, "hết TTL phải tra lại bảng");
  await reloaded.close();

  const saved = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  assert.ok(saved.entries["113.161.80.1"], "cache phải được ghi xuống đĩa");
});

test("geoip: bảng thiếu/lỗi thì trả kết quả rỗng chứ không làm chết dashboard", async () => {
  const warns = [];
  const geo = createGeoLookup({
    cityDb: "missing.mmdb",
    asnDb: "missing.mmdb",
    cacheFile: tempCacheFile(),
    logger: { warn: (m) => warns.push(m) },
    openReader: () => {
      throw new Error("ENOENT: không có file");
    },
  });
  const value = await geo.lookup("8.8.8.8");
  assert.equal(value.location, null);
  assert.ok(warns.length >= 1, "phải log cảnh báo khi thiếu bảng");
  const info = geo.info();
  assert.equal(info.city.ok, false);
  assert.match(info.city.error, /ENOENT/);
  await geo.close();
});
