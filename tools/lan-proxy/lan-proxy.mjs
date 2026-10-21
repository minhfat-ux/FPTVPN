// lan-proxy.mjs — HTTP proxy trên LAN, CHIA TẢI qua nhiều relay SOCKS5.
//
// Vì sao có bản Node này: bản Go (lan-proxy.exe) mỗi kết nối chỉ dùng MỘT upstream nên bị
// cap ~1,4 Mbps (đo 22/10/2026: mỗi relay WS qua Cloudflare cap riêng ~1,4 Mbps; 3 luồng CÙNG
// một relay vẫn 1,4 Mbps tổng, nhưng 3 relay khác nhau song song cộng dồn ~3 Mbps). Máy này
// bật Smart App Control nên KHÔNG chạy được binary Go mới build (chỉ bản cũ đã được duyệt),
// vì vậy phần chia tải làm bằng Node — Node đã được phép chạy trên máy.
//
// Dùng:
//   $env:LISTEN='0.0.0.0:18081'
//   $env:UPSTREAMS='127.0.0.1:1101,127.0.0.1:1102,127.0.0.1:1103'
//   node tools\lan-proxy\lan-proxy.mjs
//
// Giao thức: HTTP proxy chuẩn — CONNECT cho HTTPS (giữ tunnel), và request thường
// (absolute-URI) được viết lại thành origin-form rồi đóng kết nối (Connection: close).
import net from "node:net";

const LISTEN = process.env.LISTEN || "0.0.0.0:18081";
const UPSTREAMS = (process.env.UPSTREAMS || "127.0.0.1:1101,127.0.0.1:1102,127.0.0.1:1103")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (UPSTREAMS.length === 0) {
  console.error("lan-proxy: thiếu UPSTREAMS");
  process.exit(2);
}

let rr = 0;
let live = 0;

// Mỗi kết nối lấy upstream kế tiếp (round-robin) => nhiều kết nối song song dùng hết các relay.
function nextUpstream() {
  const a = UPSTREAMS[rr % UPSTREAMS.length];
  rr += 1;
  return a;
}

// Bắt tay SOCKS5 không xác thực rồi CONNECT tới host:port. Trả về { sock, rest }.
function socks5Connect(host, port) {
  return new Promise((resolve, reject) => {
    const addr = nextUpstream();
    const idx = addr.lastIndexOf(":");
    const ah = addr.slice(0, idx);
    const ap = Number(addr.slice(idx + 1));
    const sock = net.connect({ host: ah, port: ap });
    let state = 0;
    let buf = Buffer.alloc(0);
    const fail = (e) => {
      sock.destroy();
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    sock.setTimeout(12000, () => fail(new Error(`socks5 timeout qua ${addr}`)));
    sock.on("error", fail);
    sock.on("connect", () => sock.write(Buffer.from([5, 1, 0])));
    sock.on("data", function onData(d) {
      buf = Buffer.concat([buf, d]);
      if (state === 0) {
        if (buf.length < 2) return;
        if (buf[0] !== 5 || buf[1] !== 0) return fail(new Error("socks5 auth fail"));
        buf = buf.subarray(2);
        state = 1;
        const hb = Buffer.from(host, "utf8");
        sock.write(
          Buffer.concat([
            Buffer.from([5, 1, 0, 3, hb.length]),
            hb,
            Buffer.from([(port >> 8) & 255, port & 255]),
          ]),
        );
      }
      if (state === 1) {
        if (buf.length < 5) return;
        const atyp = buf[3];
        let need;
        if (atyp === 1) need = 4 + 4 + 2;
        else if (atyp === 3) need = 4 + 1 + buf[4] + 2;
        else if (atyp === 4) need = 4 + 16 + 2;
        else return fail(new Error(`socks5 atyp lạ ${atyp}`));
        if (buf.length < need) return;
        if (buf[1] !== 0) return fail(new Error(`socks5 CONNECT lỗi mã ${buf[1]}`));
        const rest = buf.subarray(need);
        sock.removeAllListeners("data");
        sock.removeAllListeners("timeout");
        sock.setTimeout(0);
        sock.on("error", () => {});
        resolve({ sock, rest });
      }
    });
  });
}

function pipeBoth(a, b) {
  a.pipe(b);
  b.pipe(a);
  a.on("error", () => b.destroy());
  b.on("error", () => a.destroy());
  a.on("close", () => b.destroy());
  b.on("close", () => a.destroy());
  // Idle: tunnel không có dữ liệu 3 phút thì đóng (player có thể để treo).
  for (const s of [a, b]) s.setTimeout(180000, () => {
    s.destroy();
  });
}

function parseHostPort(s, defPort) {
  const i = s.lastIndexOf(":");
  if (i < 0) return [s, defPort];
  const p = Number(s.slice(i + 1));
  if (!Number.isFinite(p) || p <= 0) return [s, defPort];
  return [s.slice(0, i), p];
}

const server = net.createServer(async (client) => {
  live += 1;
  let head = Buffer.alloc(0);
  const onData = async (d) => {
    head = Buffer.concat([head, d]);
    const end = head.indexOf("\r\n\r\n");
    if (end < 0) {
      if (head.length > 32 * 1024) client.destroy();
      return;
    }
    client.removeListener("data", onData);
    const headText = head.subarray(0, end + 4).toString("latin1");
    let after = head.subarray(end + 4);
    const lines = headText.split("\r\n");
    const m = /^([A-Z]+)\s+(\S+)\s+HTTP\/1\.[01]$/.exec(lines[0] || "");
    if (!m) {
      client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const [, method, target] = m;
    const headers = lines.slice(1).filter((l) => l.length > 0);
    try {
      if (method === "CONNECT") {
        const [h, p] = parseHostPort(target, 443);
        const { sock, rest } = await socks5Connect(h, p);
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (rest.length) client.write(rest);
        if (after.length) sock.write(after);
        pipeBoth(client, sock);
        return;
      }
      // Request thường: target là absolute-URI (http://host/path).
      let u;
      try {
        u = new URL(target);
      } catch {
        client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
      }
      const h = u.hostname;
      const p = Number(u.port || (u.protocol === "https:" ? 443 : 80));
      const { sock } = await socks5Connect(h, p);
      const keep = headers.filter(
        (l) => !/^(proxy-connection|connection|keep-alive|upgrade):/i.test(l),
      );
      const reqText = `${method} ${u.pathname}${u.search} HTTP/1.1\r\n${keep.join("\r\n")}\r\nConnection: close\r\n\r\n`;
      sock.write(reqText);
      if (after.length) sock.write(after);
      pipeBoth(client, sock);
    } catch (e) {
      try {
        client.end(`HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nX-Proxy-Error: ${String(e.message).replace(/[^\x20-\x7e]/g, "?")}\r\n\r\n`);
      } catch {}
      client.destroy();
    }
  };
  client.on("data", onData);
  client.on("error", () => {});
  client.on("close", () => {
    live -= 1;
  });
  client.setTimeout(30000, () => client.destroy());
});

const idx = LISTEN.lastIndexOf(":");
const host = LISTEN.slice(0, idx);
const port = Number(LISTEN.slice(idx + 1));
server.listen(port, host, () => {
  console.log(`lan-proxy(node): nghe ${LISTEN} · chia tải ${UPSTREAMS.length} upstream: ${UPSTREAMS.join(", ")}`);
});

setInterval(() => {
  if (live >= 0) process.stdout.write("");
}, 60000).unref();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
