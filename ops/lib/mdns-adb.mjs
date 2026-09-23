// Dò dịch vụ wireless-debugging của Android trong LAN bằng mDNS (UDP 5353).
//
// Vì sao không dùng `adb mdns services`: trên Windows bản mdns của adb (backend
// "adb discovery 0.0.0") thường trả RỖNG dù điện thoại ĐANG quảng bá — đã gặp thật
// với SM-F9460 ngày 23/09/2026. Truy vấn PTR/SRV thẳng thì thấy ngay.
//
// In ra (mỗi dòng một endpoint, dễ cho PowerShell đọc):
//   ENDPOINT <ip>:<port> <instance>
// Hoặc `--json` để lấy mảng đối tượng.
import dgram from "node:dgram";
import os from "node:os";

const GROUP = "224.0.0.251";
const PORT = 5353;
const SERVICES = [
  "_adb-tls-connect._tcp.local",
  "_adb-tls-pairing._tcp.local",
  "_adb._tcp.local",
];
const wantJson = process.argv.includes("--json");
const seconds = Number(process.argv.find((a) => a.startsWith("--seconds="))?.split("=")[1] ?? 5);
const host = process.argv.find((a) => a.startsWith("--host="))?.split("=")[1] ?? "";
const debug = process.argv.includes("--debug");

/**
 * Chọn card mạng để gửi/nhận multicast.
 *
 * VÌ SAO CẦN: máy Windows này có card `tun0` (172.19.0.1) với default route metric 0,
 * nên multicast 224.0.0.0/4 bị đẩy sang loopback và mDNS LAN không bao giờ tới.
 * Đã gặp thật 23/09/2026: `node …/mdns-adb.mjs` trả rỗng dù điện thoại ĐANG quảng bá.
 */
function pickIface(targetHost) {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      candidates.push({ name, address: a.address });
    }
  }
  if (targetHost) {
    const t = targetHost.split(".").map(Number);
    const sameSubnet = candidates.find((c) => {
      const ip = c.address.split(".").map(Number);
      return ip[0] === t[0] && ip[1] === t[1] && ip[2] === t[2];
    });
    if (sameSubnet) return sameSubnet;
  }
  const preferred = candidates.find((c) => !/^(172\.19\.|169\.254\.|10\.7[78]\.)/.test(c.address));
  return preferred ?? candidates[0] ?? null;
}

const iface = pickIface(host);

function encodeName(name) {
  const parts = name.split(".").filter(Boolean);
  const bufs = parts.map((p) => {
    const b = Buffer.from(p, "utf8");
    return Buffer.concat([Buffer.from([b.length]), b]);
  });
  return Buffer.concat([...bufs, Buffer.from([0])]);
}

function buildQuery(name) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(0, 2);
  header.writeUInt16BE(1, 4);
  const q = Buffer.concat([encodeName(name), Buffer.from([0x00, 0x0c, 0x00, 0x01])]);
  return Buffer.concat([header, q]);
}

/** Đọc tên DNS (có nén con trỏ) tại offset, trả {name, next}. */
function readName(buf, offset, depth = 0) {
  const labels = [];
  let i = offset;
  let next = null;
  while (i < buf.length && depth < 12) {
    const len = buf[i];
    if (len === 0) {
      i += 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | buf[i + 1];
      const jumped = readName(buf, ptr, depth + 1);
      labels.push(jumped.name);
      i += 2;
      next = next ?? i;
      return { name: labels.join("."), next: next ?? i };
    }
    labels.push(buf.slice(i + 1, i + 1 + len).toString("utf8"));
    i += 1 + len;
  }
  return { name: labels.filter(Boolean).join("."), next: next ?? i };
}

function parseMessage(buf) {
  const out = { srv: [], ptr: [], a: [], txt: [] };
  if (buf.length < 12) return out;
  const qd = buf.readUInt16BE(4);
  const an = buf.readUInt16BE(6);
  const ns = buf.readUInt16BE(8);
  const ar = buf.readUInt16BE(10);
  let i = 12;
  for (let q = 0; q < qd; q += 1) {
    const { next } = readName(buf, i);
    i = next + 4;
  }
  const total = an + ns + ar;
  for (let r = 0; r < total && i < buf.length; r += 1) {
    const { name, next } = readName(buf, i);
    i = next;
    if (i + 10 > buf.length) break;
    const type = buf.readUInt16BE(i);
    const rdlen = buf.readUInt16BE(i + 8);
    const rdata = i + 10;
    if (type === 33) {
      const port = buf.readUInt16BE(rdata + 4);
      const { name: target } = readName(buf, rdata + 6);
      out.srv.push({ name, target, port });
    } else if (type === 12) {
      const { name: ptr } = readName(buf, rdata);
      out.ptr.push({ name, ptr });
    } else if (type === 1 && rdlen === 4) {
      out.a.push({ name, ip: `${buf[rdata]}.${buf[rdata + 1]}.${buf[rdata + 2]}.${buf[rdata + 3]}` });
    } else if (type === 16) {
      out.txt.push({ name });
    }
    i = rdata + rdlen;
  }
  return out;
}

const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
const found = new Map();
const ipByTarget = new Map();

const pending = [];

function resolvePending() {
  for (const s of pending) {
    if (found.has(s.key)) continue;
    const ip = ipByTarget.get(s.target);
    if (!ip) continue;
    found.set(s.key, { endpoint: s.key, ip, port: s.port, instance: s.name, target: s.target });
  }
}

sock.on("message", (msg, rinfo) => {
  const parsed = parseMessage(msg);
  if (debug) {
    console.log(`# gói từ ${rinfo.address}:${rinfo.port} ${msg.length}B`);
    for (const a of parsed.a) console.log(`#   A   ${a.name} = ${a.ip}`);
    for (const s of parsed.srv) console.log(`#   SRV ${s.name} -> ${s.target}:${s.port}`);
    for (const p of parsed.ptr) console.log(`#   PTR ${p.name} -> ${p.ptr}`);
  }
  for (const a of parsed.a) ipByTarget.set(a.name.replace(/\.$/, ""), a.ip);
  for (const s of parsed.srv) {
    if (!/^adb-/i.test(s.name)) continue;
    const target = s.target.replace(/\.$/, "");
    // A record có thể tới ở gói khác (hoặc không tới) ⇒ lấy IP của chính máy vừa trả lời.
    if (!ipByTarget.has(target)) ipByTarget.set(target, rinfo.address);
    const key = `${ipByTarget.get(target)}:${s.port}`;
    pending.push({ key, target, port: s.port, name: s.name });
    found.set(key, {
      endpoint: key,
      ip: ipByTarget.get(target),
      port: s.port,
      instance: s.name,
      target,
      via: "srv+rinfo",
    });
  }
  resolvePending();
});

sock.bind(() => {
  try {
    if (iface) {
      sock.setMulticastInterface(iface.address);
      sock.addMembership(GROUP, iface.address);
    } else {
      sock.addMembership(GROUP);
    }
    sock.setMulticastTTL(255);
    if (iface && !wantJson) console.log(`# card mạng dùng để hỏi mDNS: ${iface.name} ${iface.address}`);
  } catch (error) {
    if (!wantJson) console.log(`# không join được multicast: ${String(error?.message ?? error).slice(0, 80)}`);
  }
  for (const name of SERVICES) {
    const q = buildQuery(name);
    sock.send(q, 0, q.length, PORT, GROUP);
  }
});

setTimeout(() => {
  sock.close();
  const list = [...found.values()];
  if (wantJson) {
    console.log(JSON.stringify(list));
  } else if (list.length === 0) {
    console.log("(không thấy dịch vụ adb nào qua mDNS)");
  } else {
    for (const e of list) console.log(`ENDPOINT ${e.endpoint} ${e.instance}`);
  }
  process.exit(0);
}, Math.max(2, seconds) * 1000);
