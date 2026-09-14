import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IosDeviceStore, buildDeviceProfile, decodeDevicePayload } from "../src/ios-devices.js";

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "iosdev-")), "ios-devices.json");
const plistFor = (udid, extra = "") => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>UDID</key><string>${udid}</string>
<key>PRODUCT</key><string>iPhone15,2</string>
<key>VERSION</key><string>17.5.1</string>
${extra}
</dict></plist>`;

test("đọc payload iOS gửi về: form data=<base64 plist> và cả plist thô", () => {
  const plist = plistFor("00008120-0008299A26D80032");
  const form = new URLSearchParams({ data: Buffer.from(plist, "utf8").toString("base64") }).toString();
  const fromForm = decodeDevicePayload(form);
  assert.equal(fromForm.udid, "00008120-0008299A26D80032");
  assert.equal(fromForm.model, "iPhone15,2");
  assert.equal(fromForm.iosVersion, "17.5.1");
  assert.equal(decodeDevicePayload(plist).udid, "00008120-0008299A26D80032", "nhận cả plist thô để test được");
  // iOS/curl gửi nhiều dạng khác nhau — đều phải đọc được:
  const b64 = Buffer.from(plist, "utf8").toString("base64");
  assert.equal(decodeDevicePayload(b64).udid, "00008120-0008299A26D80032", "nhận base64 trô");
  assert.equal(decodeDevicePayload(b64.replace(/\+/g, " ")).udid, "00008120-0008299A26D80032",
    "querystring đổi '+' thành dấu cách — vẫn phải đọc đúng");
  assert.equal(decodeDevicePayload(b64.replace(/\+/g, "-").replace(/\//g, "_")).udid, "00008120-0008299A26D80032",
    "nhận cả base64 urlsafe");
  assert.equal(decodeDevicePayload("data=" + encodeURIComponent(b64)).udid, "00008120-0008299A26D80032",
    "nhận form đã URL-encode (%2B)");
  assert.equal(decodeDevicePayload("không phải plist"), null);
  assert.equal(decodeDevicePayload(plistFor("")), null, "không có UDID ⇒ null");
});

test("hồ sơ đăng ký: đúng CẤU TRÚC Profile Service (sai cấu trúc = iOS cài mà không gửi gì)", () => {
  const xml = buildDeviceProfile({ callbackUrl: "https://meetflowai.site/install/ios/udid?lang=vi" });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), "phải là plist XML");
  // Đây là điều kiện sống còn: PayloadType ở cấp cao nhất phải là Profile Service, và
  // PayloadContent phải là <dict> (không phải <array> các payload con như profile cấu hình).
  assert.ok(xml.includes('<key>PayloadType</key><string>Profile Service</string>'), "thiếu PayloadType Profile Service");
  assert.ok(!xml.includes('<key>PayloadType</key><string>Configuration</string>'), "KHÔNG được là profile Configuration");
  const content = xml.slice(xml.indexOf("<key>PayloadContent</key>"), xml.indexOf("<key>PayloadOrganization</key>"));
  assert.ok(content.includes("<dict>"), "PayloadContent phải là dict");
  assert.ok(!content.includes("<array>\n    <dict>"), "PayloadContent không được là array các payload con");
  assert.ok(content.includes("<key>URL</key><string>https://meetflowai.site/install/ios/udid?lang=vi</string>"), "URL callback sai");
  assert.ok(content.includes("<string>UDID</string>"), "phải xin UDID");
  assert.ok(/<key>PayloadRemovalDisallowed<\/key><false\/>/.test(xml), "khách phải gỡ được hồ sơ sau khi đăng ký");
  const uuids = [...xml.matchAll(/<key>PayloadUUID<\/key><string>([^<]+)</g)].map((m) => m[1]);
  assert.equal(uuids.length, 1, "Profile Service chỉ có 1 payload ⇒ đúng 1 PayloadUUID");
  assert.ok(/^[0-9A-F-]{36}$/.test(uuids[0]), "PayloadUUID phải là UUID");
});

test("store: đăng ký mới → chờ ký lại → markBuilt thì mọi máy thành cài được", async () => {
  const store = new IosDeviceStore(tmpFile());
  assert.deepEqual(await store.pending(), [], "ban đầu chưa có gì");

  const a = await store.register({ udid: "UDID-A", model: "iPhone15,2", iosVersion: "17.5" });
  assert.equal(a.isNew, true);
  assert.equal(a.device.built, false, "máy mới ⇒ chưa cài được cho tới khi ký lại");

  const again = await store.register({ udid: "UDID-A", iosVersion: "17.6" });
  assert.equal(again.isNew, false, "đăng ký lại không tạo trùng");
  assert.equal(again.device.iosVersion, "17.6", "cập nhật phiên bản iOS mới nhất");
  assert.equal((await store.list()).devices.length, 1);

  await store.register({ udid: "UDID-B" });
  assert.equal((await store.pending()).length, 2);

  const serial = await store.markBuilt({ note: "1.3.3 adhoc" });
  assert.equal(serial, 1);
  assert.deepEqual(await store.pending(), [], "ký lại xong thì không còn máy nào chờ");
  assert.equal((await store.statusFor("UDID-A")).ready, true);
  assert.equal((await store.statusFor("UDID-B")).ready, true);
  assert.equal((await store.statusFor("CHƯA-ĐĂNG-KÝ")).ready, false);

  await store.register({ udid: "UDID-C" });
  assert.equal((await store.statusFor("UDID-A")).ready, true, "máy cũ vẫn cài được");
  assert.equal((await store.statusFor("UDID-C")).ready, false, "máy mới lại phải chờ ký lại");
});

test("store: map UDID vào account và lưu lại sau khi đọc", async () => {
  const store = new IosDeviceStore(tmpFile());
  await store.register({ udid: "UDID-MAP", model: "iPhone15,2" });
  const mapped = await store.mapAccount("UDID-MAP", {
    userId: "user-123",
    email: "customer@example.com",
  });
  assert.equal(mapped.userId, "user-123");
  assert.equal(mapped.email, "customer@example.com");
  const listed = await store.list();
  assert.equal(listed.devices[0].userId, "user-123");
  assert.equal(listed.devices[0].email, "customer@example.com");
});

test("guard: route đăng ký thiết bị nằm dưới /install/ios (đã có handle Caddy)", () => {
  const idx = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(idx.includes('"/install/ios/register.mobileconfig"'), "phải có đường tải profile đăng ký");
  assert.ok(idx.includes('"/install/ios/udid"'), "phải có endpoint nhận UDID iOS gửi về");
  assert.ok(idx.includes('"/install/ios/status"'), "phải có endpoint cho trang chờ");
  assert.ok(idx.includes("iosDevices.markBuilt"), "phải có API cho máy Mac báo đã ký lại");
  assert.ok(idx.includes("express.urlencoded"), "endpoint nhận UDID phải đọc được form iOS gửi");
});

test("guard: khách CHỈ đăng ký bằng hồ sơ tự động (không bắt khách dán UDID)", () => {
  const idx = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(!idx.includes("udid-form"), "không còn form dán UDID trước mặt khách (chủ shop yêu cầu)");
  assert.ok(idx.includes('"/install/ios/register.mobileconfig"'), "khách lấy UDID bằng cách tải hồ sơ");
  assert.ok(idx.includes('"/install/ios/udid"'), "iOS tự gửi UDID về server sau khi cài hồ sơ");
  // Đường admin vẫn giữ cho ca khách gửi email cho shop (không phải UI khách tự dùng)
  assert.ok(idx.includes('"/v1/admin/ios/devices"'), "admin vẫn thêm UDID bằng tay được (khách gửi email)");
  assert.ok(idx.includes("const UDID_RE"), "API admin phải kiểm định dạng UDID");
  assert.ok((idx.match(/iosDevices\.register\(/g) ?? []).length >= 2, "hồ sơ + API admin dùng chung hàng đợi");
});

test("định dạng UDID: nhận đúng, loại sai", () => {
  const idx = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const src = idx.slice(idx.indexOf("const UDID_RE"), idx.indexOf("const UDID_RE") + 120);
  const re = eval(src.match(/= (\/.*\/[a-z]*)/)[1]);
  assert.ok(re.test("00008120-0008299A26D80032"), "UDID iPhone mới");
  assert.ok(re.test("00008101-000A55C01E85001E"));
  assert.ok(re.test("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"), "UDID 40 hex (máy cũ)");
  assert.ok(!re.test("không-phải-udid"));
  assert.ok(!re.test("00008120-0008299A26D8003"), "thiếu ký tự ⇒ loại");
  assert.ok(!re.test(""));
});

test("store: chỉ báo khách có email và chưa báo; markNotified chống spam", async () => {
  const store = new IosDeviceStore(tmpFile());
  await store.register({ udid: "UDID-N1", email: "a@example.com" });
  await store.register({ udid: "UDID-N2" }); // chưa map account
  await store.register({ udid: "UDID-N3", email: "c@example.com" });

  const pending = await store.pendingNotify();
  assert.deepEqual(pending.map((d) => d.udid).sort(), ["UDID-N1", "UDID-N3"]);

  assert.equal(await store.markNotified(["UDID-N1"]), 1);
  assert.deepEqual((await store.pendingNotify()).map((d) => d.udid), ["UDID-N3"]);
  assert.ok((await store.list()).devices.find((d) => d.udid === "UDID-N1").notifiedAt, "phải ghi thời điểm đã báo");
});

test("store: đánh dấu đã đăng ký Apple + ghi lỗi khi Apple từ chối", async () => {
  const store = new IosDeviceStore(tmpFile());
  await store.register({ udid: "UDID-ASC" });
  const registered = await store.markAppleRegistered("UDID-ASC", { deviceId: "DEV-9" });
  assert.equal(registered.appleDeviceId, "DEV-9");
  assert.ok(registered.appleRegisteredAt, "phải ghi thời điểm đăng ký Apple");

  await store.register({ udid: "UDID-ERR" });
  const failed = await store.markAppleError("UDID-ERR", "Authentication credentials are missing");
  assert.match(failed.appleError, /credentials/);
  assert.equal(failed.appleRegisteredAt, null, "lỗi thì không được coi là đã đăng ký");
});
