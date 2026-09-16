import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { adminPageHTML } from "../src/admin-page.js";

const indexSrc = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const geoipSrc = fs.readFileSync(new URL("../src/geoip.js", import.meta.url), "utf8");

/**
 * Dashboard từng hiện "IP công khai = 127.0.0.1" cho mọi máy, vì khách đi qua relay nên
 * `wg dump` chỉ thấy endpoint loopback. IP thật phải lấy từ tầng HTTP (Cloudflare/Caddy
 * forward) do chính app ghi lại khi kết nối, rồi tra vị trí/ISP offline bằng bảng GeoIP.
 */
test("stats: IP thật lấy từ device.lastClientIp, endpoint WireGuard chỉ để chẩn đoán", () => {
  const stats = indexSrc.slice(indexSrc.indexOf('app.get(["/v1/admin/stats"'), indexSrc.indexOf("GET /v1/admin/stats failed"));
  assert.ok(stats.includes("device?.lastClientIp"), "phải ưu tiên IP app đã ghi");
  assert.ok(stats.includes("isPublicIp(d.client_ip)"), "endpoint WireGuard chỉ dùng khi là IP công khai");
  assert.ok(stats.includes('client_ip_source: info?.source ?? null'), "phải nói rõ IP lấy từ đâu (api/wg)");
  assert.ok(stats.includes("wg_endpoint_ip: d.client_ip"), "giữ endpoint WireGuard để chẩn đoán");
  assert.ok(stats.includes("geoip: geoLookup.info()"), "phải trả tình trạng bảng GeoIP cho dashboard");
  assert.ok(stats.includes("by_location: byLocation"), "chart phải dùng nhãn vị trí");
  assert.ok(stats.includes("online_devices: onlineDevices"), "phải trả danh sách đã làm giàu dữ liệu");
});

test("index: app gọi API là server ghi lại IP thật cho thiết bị (không dùng để xác thực)", () => {
  assert.ok(indexSrc.includes("async function touchDeviceClientIp"), "thiếu hàm ghi IP");
  const helper = indexSrc.slice(indexSrc.indexOf("async function touchDeviceClientIp"), indexSrc.indexOf("async function touchDeviceClientIp") + 700);
  assert.ok(helper.includes("store.markSeen"), "phải lưu vào bản ghi thiết bị");
  assert.ok(helper.includes("isPublicIp(ip) ? ip : null"), "IP nội bộ/loopback không được ghi vào");
  // Mọi đường khách "kết nối/đăng ký máy" đều phải ghi IP.
  for (const marker of [
    'app.post("/v1/devices/claim"',
    'app.post("/v1/peers/register"',
  ]) {
    const start = indexSrc.indexOf(marker);
    assert.ok(start > 0, `thiếu route ${marker}`);
    const body = indexSrc.slice(start, indexSrc.indexOf("\n});", start));
    assert.ok(body.includes("touchDeviceClientIp("), `${marker} phải gọi touchDeviceClientIp`);
  }
  assert.ok(indexSrc.includes("createGeoLookup({"), "control plane phải dùng geoLookup offline");
});

test("geoip: tra OFFLINE (không gọi API bên thứ ba) và có cache", () => {
  assert.ok(!/fetch\(|https?:\/\/(?!\S*github)/.test(geoipSrc), "không được gọi mạng trong geoip.js");
  assert.ok(geoipSrc.includes("/usr/share/GeoIP/dbip-city-lite.mmdb"), "bảng city phải nằm trên máy");
  assert.ok(geoipSrc.includes("/usr/share/GeoIP/dbip-asn-lite.mmdb"), "bảng ASN phải nằm trên máy");
  assert.ok(geoipSrc.includes("cacheFile"), "phải có cache để không tra lại liên tục");
  assert.ok(geoipSrc.includes("MmdbReader"), "phải đọc bằng reader mmdb nội bộ");
});

test("dashboard: bảng Online Devices có cột IP thật / Vị trí / Nhà mạng", () => {
  const html = adminPageHTML();
  for (const header of ["IP thật", "Vị trí", "Nhà mạng (ISP)"]) {
    assert.ok(html.includes("<th>" + header + "</th>"), `thiếu cột ${header}`);
  }
  const render = html.slice(html.indexOf("function renderOnlineDevices"), html.indexOf("async function loadStats"));
  assert.ok(render.includes("cell(realIpText(d))"), "cột IP phải dùng realIpText");
  assert.ok(render.includes('cell(d.location || "—")'), "cột vị trí phải lấy từ geo");
  assert.ok(render.includes('cell(d.isp || "—")'), "cột ISP phải lấy từ bảng ASN");
  assert.ok(!render.includes('cell(d.client_ip || "—")'), "không hiện thẳng endpoint WireGuard nữa");
  assert.ok(render.includes('colspan="9"'), "số cột phải khớp header (9)");

  const ipText = html.slice(html.indexOf("function realIpText"), html.indexOf("function formatWhen"));
  assert.ok(ipText.includes('return "chưa có"'), "không có IP thì ghi rõ, không hiện 127.0.0.1");
  assert.ok(ipText.includes("formatWhen(d.client_ip_at)"), "IP phải kèm mốc thời gian cập nhật");

  assert.ok(html.includes('id="geoipNote"'), "thiếu dòng ghi chú nguồn bảng GeoIP");
  assert.ok(html.includes("renderGeoipNote(data.geoip)"), "loadStats phải hiện ghi chú GeoIP");
});
