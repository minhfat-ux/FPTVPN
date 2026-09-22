#!/usr/bin/env node
/**
 * gen-cn-cidrs.mjs — sinh danh sách CIDR của Trung Quốc để client đẩy vào **excludedRoutes**.
 *
 * Vì sao cần (yêu cầu §2d + tiêu chí A7, chủ dự án chốt hướng (a) ngày 22/09/2026):
 *   *"khi bật vpn, các app Trung quốc cần có đường riêng và không dùng vpn để connect vào"*.
 *   · Android: loại trừ theo **tên gói** (`addDisallowedApplication`) ⇒ dùng `cn-apps.txt` (đã có).
 *   · iOS/macOS: **KHÔNG có API loại trừ theo app** cho VPN do app tự cài ⇒ phải theo **ĐÍCH ĐẾN**.
 *     Extension hysteria-only không có routing engine ⇒ cách công khai, đơn giản nhất là
 *     `NEPacketTunnelNetworkSettings.excludedRoutes` với danh sách CIDR của TQ.
 *   · Windows: cùng bộ dữ liệu này dùng cho rule `geoip:cn → direct` của sing-box.
 *
 * Nguồn: **APNIC delegation** (nguồn chính thức, không phụ thuộc danh sách bên thứ ba):
 *   https://ftp.apnic.net/stats/apnic/delegated-apnic-latest
 *
 * Dùng:
 *   node scripts/gen-cn-cidrs.mjs                       # in thống kê + ghi docs/routes/cn-cidrs.txt
 *   node scripts/gen-cn-cidrs.mjs --out <path>          # ghi ra đường dẫn khác
 *   node scripts/gen-cn-cidrs.mjs --max-ipv4 20000      # chặn an toàn: vượt số prefix thì DỪNG
 *   node scripts/gen-cn-cidrs.mjs --source <url|file>
 *
 * Ghi chú kỹ thuật:
 *   · IPv4 trong file APNIC là `start|count` (không phải prefix) ⇒ phải đổi count → CIDR rồi GỘP lại;
 *     gộp là bắt buộc vì iOS/macOS đẩy từng CIDR thành một route (hàng nghìn route làm chậm lúc connect).
 *   · IPv6 đã ở dạng prefix ⇒ giữ nguyên.
 */

import fs from "node:fs";
import path from "node:path";

const DEFAULT_SOURCE = "https://ftp.apnic.net/stats/apnic/delegated-apnic-latest";
// Mặc định ghi ĐÚNG định dạng file đang phục vụ production (`/dl/routes/cn.txt`): mỗi dòng một CIDR
// IPv4, KHÔNG header — vì Windows `ChinaBypass.ParseCidrs` đã parse định dạng này từ 18/09.
const DEFAULT_OUT = path.join("docs", "routes", "cn.txt");
/** Trần an toàn: nhiều route quá thì client connect chậm ⇒ thà DỪNG còn hơn phát danh sách khổng lồ. */
const DEFAULT_MAX_IPV4 = 20000;

function ipv4ToInt(ip) {
  const parts = String(ip).trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function intToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

/** Đổi (start, count) thành danh sách CIDR — count không nhất thiết là luỹ thừa của 2. */
export function rangeToCidrs(startIp, count) {
  const start = ipv4ToInt(startIp);
  if (start === null || !Number.isInteger(count) || count <= 0) return [];
  const out = [];
  let remaining = count;
  let current = start;
  while (remaining > 0) {
    // Khối lớn nhất căn theo địa chỉ hiện tại (bội số luỹ thừa 2 của current).
    let size = 1;
    while (size * 2 <= remaining && (current % (size * 2)) === 0) size *= 2;
    const prefix = 32 - Math.log2(size);
    out.push(`${intToIpv4(current)}/${prefix}`);
    current += size;
    remaining -= size;
  }
  return out;
}

/** Gộp các CIDR IPv4 chồng/kề nhau thành danh sách tối thiểu (đỡ route cho client). */
export function mergeCidrs(cidrs) {
  const parsed = cidrs
    .map((cidr) => {
      const [ip, bitsRaw] = String(cidr).split("/");
      const base = ipv4ToInt(ip);
      const bits = Number(bitsRaw);
      if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
      const size = 2 ** (32 - bits);
      return { start: base, end: base + size - 1 };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const block of parsed) {
    const last = merged[merged.length - 1];
    if (last && block.start <= last.end + 1) {
      last.end = Math.max(last.end, block.end);
    } else {
      merged.push({ ...block });
    }
  }

  const out = [];
  for (const block of merged) {
    let start = block.start;
    let remaining = block.end - block.start + 1;
    while (remaining > 0) {
      let size = 1;
      while (size * 2 <= remaining && (start % (size * 2)) === 0) size *= 2;
      out.push(`${intToIpv4(start)}/${32 - Math.log2(size)}`);
      start += size;
      remaining -= size;
    }
  }
  return out;
}

/** Parse nội dung file APNIC → { ipv4: [cidr], ipv6: [cidr], registryDate }. */
export function parseApnic(text, { country = "CN" } = {}) {
  const ipv4 = [];
  const ipv6 = [];
  let registryDate = null;
  for (const line of String(text).split("\n")) {
    if (!line.startsWith("apnic|")) continue;
    const [, cc, type, start, value, date, status] = line.split("|");
    if (cc !== country) continue;
    if (type === "ipv4" && (status === "allocated" || status === "assigned")) {
      ipv4.push(...rangeToCidrs(start, Number(value)));
      if (!registryDate && date) registryDate = date;
    } else if (type === "ipv6" && (status === "allocated" || status === "assigned")) {
      ipv6.push(`${start}/${value}`);
    }
  }
  return { ipv4: mergeCidrs(ipv4), ipv6, registryDate };
}

async function readSource(source) {
  if (!/^https?:\/\//i.test(source)) {
    return fs.readFileSync(source, "utf8");
  }
  const response = await fetch(source, { headers: { "user-agent": "vpnflow-gen-cn-cidrs/1.0" } });
  if (!response.ok) throw new Error(`tải ${source} lỗi HTTP ${response.status}`);
  return response.text();
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const source = argValue("source", DEFAULT_SOURCE);
  const out = argValue("out", DEFAULT_OUT);
  const maxIpv4 = Number(argValue("max-ipv4", DEFAULT_MAX_IPV4));

  console.log(`== Sinh danh sách CIDR Trung Quốc\n   nguồn: ${source}`);
  const text = await readSource(source);
  const { ipv4, ipv6, registryDate } = parseApnic(text);
  console.log(`   IPv4: ${ipv4.length} prefix (đã gộp) · IPv6: ${ipv6.length} prefix`);

  if (!ipv4.length) throw new Error("không đọc được prefix IPv4 nào của CN — kiểm tra nguồn/định dạng");
  if (ipv4.length > maxIpv4) {
    throw new Error(
      `IPv4 ${ipv4.length} prefix > trần an toàn ${maxIpv4} — DỪNG: quá nhiều route sẽ làm client ` +
      `connect chậm; xem lại nguồn hoặc nâng trần có ý thức (--max-ipv4)`,
    );
  }

  const header = [
    "# CIDR Trung Quốc — dùng để client đi ĐƯỜNG RIÊNG, không qua VPN (yêu cầu §2d / A7).",
    "#",
    "# iOS/macOS: đẩy danh sách này vào NEPacketTunnelNetworkSettings.excludedRoutes",
    "#   (includedRoutes = 0.0.0.0/0 + ::/0; phần bị loại trừ sẽ đi thẳng ra nhà mạng).",
    "# Windows  : ChinaBypass.cs tải file này rồi thêm route bypass qua interface vật lý.",
    "# Android  : KHÔNG dùng file này — loại trừ theo tên gói trong cn-apps.txt.",
    "#",
    `# Nguồn: APNIC delegation (${source})${registryDate ? ` · bản ghi ${registryDate}` : ""}`,
    `# Sinh lúc: ${new Date().toISOString()} · IPv4 ${ipv4.length} prefix (đã gộp) · IPv6 ${ipv6.length} prefix`,
    "# Tự sinh bằng scripts/gen-cn-cidrs.mjs — ĐỪNG sửa tay.",
    "",
  ].join("\n");

  // Mặc định: KHÔNG header, CHỈ IPv4 — khớp định dạng `cn.txt` mà Windows ChinaBypass đang parse.
  // Muốn bản mở rộng (có chú thích + IPv6) thì dùng --header --with-ipv6 và ghi ra file khác.
  const withHeader = process.argv.includes("--header");
  const withIpv6 = process.argv.includes("--with-ipv6");
  const body = [...ipv4, ...(withIpv6 ? ipv6 : [])].join("\n");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${withHeader ? header : ""}${body}\n`, "utf8");
  const size = fs.statSync(out).size;
  console.log(`   đã ghi: ${out} (${(size / 1024).toFixed(1)} KB, header=${withHeader}, ipv6=${withIpv6})`);
  console.log(`   mẫu: ${ipv4.slice(0, 3).join(", ")} …`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  main().catch((error) => {
    console.error(`LỖI: ${error.message}`);
    process.exit(1);
  });
}
