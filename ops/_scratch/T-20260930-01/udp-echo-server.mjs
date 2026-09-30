// UDP echo server — dùng để đo mất gói UDP thuần trên đường client -> VPS,
// tách khỏi WireGuard. Chạy trên VPS: node udp-echo-server.mjs <port>
import dgram from "node:dgram";

const port = Number(process.argv[2] || 51888);
const sock = dgram.createSocket("udp4");
sock.on("message", (msg, rinfo) => sock.send(msg, rinfo.port, rinfo.address));
sock.bind(port, () => console.log(`echo up on ${port}`));
