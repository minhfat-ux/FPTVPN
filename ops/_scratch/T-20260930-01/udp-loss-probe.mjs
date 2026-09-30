// Đo mất gói UDP thuần tới một host:port (mặc định VPS:51888), không qua WireGuard.
// Dùng: node udp-loss-probe.mjs <host> <port> <n> <gapMs>
import dgram from "node:dgram";

const host = process.argv[2] || "165.101.114.162";
const port = Number(process.argv[3] || 51888);
const n = Number(process.argv[4] || 200);
const gap = Number(process.argv[5] || 50);

const sock = dgram.createSocket("udp4");
const sentAt = new Map();
const rtts = [];

sock.on("message", (msg) => {
  const seq = Number(msg.toString());
  if (sentAt.has(seq)) {
    rtts.push(Date.now() - sentAt.get(seq));
    sentAt.delete(seq);
  }
});

function finish() {
  const recv = rtts.length;
  const lost = n - recv;
  const avg = rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : 0;
  console.log(
    JSON.stringify({
      host,
      port,
      sent: n,
      recv,
      lost,
      lossPct: Number(((lost / n) * 100).toFixed(1)),
      rttMin: rtts.length ? Math.min(...rtts) : null,
      rttAvg: rtts.length ? Number(avg.toFixed(1)) : null,
      rttMax: rtts.length ? Math.max(...rtts) : null,
    }),
  );
  sock.close();
}

sock.bind(() => {
  let i = 0;
  const timer = setInterval(() => {
    if (i >= n) {
      clearInterval(timer);
      setTimeout(finish, 2000);
      return;
    }
    const buf = Buffer.from(String(i));
    sentAt.set(i, Date.now());
    sock.send(buf, port, host);
    i += 1;
  }, gap);
});
