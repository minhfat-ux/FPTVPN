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

test("profile đăng ký: gửi đúng callback và có thể gỡ sau khi cài", () => {
  const xml = buildDeviceProfile({ callbackUrl: "https://meetflowai.site/install/ios/udid" });
  assert.ok(xml.includes("<key>URL</key><string>https://meetflowai.site/install/ios/udid</string>"), "thiếu URL callback");
  assert.ok(xml.includes("<string>UDID</string>"), "phải xin UDID");
  assert.ok(xml.includes("<key>PayloadType</key><string>Profile Service</string>"));
  assert.ok(/<key>PayloadRemovalDisallowed<\/key><false\/>/.test(xml), "khách phải gỡ được profile sau khi đăng ký");
  assert.equal((xml.match(/<key>PayloadUUID<\/key>/g) ?? []).length, 2, "mỗi payload cần UUID riêng");
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

test("guard: route đăng ký thiết bị nằm dưới /install/ios (đã có handle Caddy)", () => {
  const idx = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(idx.includes('"/install/ios/register.mobileconfig"'), "phải có đường tải profile đăng ký");
  assert.ok(idx.includes('"/install/ios/udid"'), "phải có endpoint nhận UDID iOS gửi về");
  assert.ok(idx.includes('"/install/ios/status"'), "phải có endpoint cho trang chờ");
  assert.ok(idx.includes("iosDevices.markBuilt"), "phải có API cho máy Mac báo đã ký lại");
  assert.ok(idx.includes("express.urlencoded"), "endpoint nhận UDID phải đọc được form iOS gửi");
});

test("guard: đường 'khách gửi/dán UDID' dùng chung hàng đợi và kiểm định dạng", () => {
  const idx = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(idx.includes('"/install/ios/udid-form"'), "phải có form dán UDID");
  assert.ok(idx.includes("const UDID_RE"), "phải kiểm định dạng UDID trước khi nhận");
  assert.ok(idx.includes('"/v1/admin/ios/devices"'), "phải có API admin thêm UDID bằng tay (khách gửi email)");
  // cả hai đường phải ghi vào CÙNG hàng đợi để watcher ký lại
  assert.ok((idx.match(/iosDevices\.register\(/g) ?? []).length >= 3, "profile, form và API admin đều ghi vào cùng queue");
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
