#!/usr/bin/env node
/*
 * wsrelay.js — cầu WebSocket ⇄ UDP cho relay qua Cloudflare (node-1 / node-2).
 *
 * BẢN VÁ 22/09/2026 (thay bản cũ trên node-1/node-2). Vì sao phải thay — đo trên máy thật:
 *   - Cầu chết sau 11–19 ping (~3,7–6,3 phút): WS vẫn "connected" nhưng KHÔNG pong, KHÔNG chuyển dữ liệu.
 *   - Từ PC (không qua GFW): `wss://api.meetflowai.site/relay/vn{1,2}hy` trả 101 nhưng không pong.
 *   - Tiến trình node sống 3 ngày 15 giờ, RSS phẳng 45 MB ⇒ KHÔNG crash/OOM/rò rỉ.
 *   - `journalctl -u relay-cf-vn2hy --since -24h | wc -l` = 1 ⇒ bản cũ KHÔNG log gì ⇒ không thể chẩn đoán.
 *
 * Bản này sửa đúng 5 điểm đó:
 *   1) LOG mọi kết nối (mở/đóng + lý do + số frame/byte) và thêm `GET /healthz` để kiểm ORIGIN từ xa.
 *   2) PONG + PING HAI CHIỀU: tự pong ping của client; server ping mỗi 15 s, không pong trong 20 s ⇒ cắt.
 *   3) BẮT LỖI SOCKET UDP: lỗi/đóng UDP ⇒ log + đóng WS ngay (client nối lại trong vài giây) — đây là
 *      nghi phạm khớp nhất với triệu chứng "101 nhưng không pong, không dữ liệu".
 *   4) BACKPRESSURE: vượt trần `ws.bufferedAmount` thì BỎ frame + log (không xếp hàng vô hạn).
 *   5) KHÔNG có timer 10 phút: chỉ dựa vào ping/pong thật, không cắt theo đồng hồ.
 *
 * Giao thức giữ NGUYÊN: mỗi binary WS frame = 1 datagram UDP (không thêm framing).
 * Hợp đồng env giữ nguyên như unit systemd hiện tại:
 *   WS_LISTEN_PORT (vd 7785)  WS_UDP_HOST (127.0.0.1)  WS_UDP_PORT (8443 hysteria / 443 WG)
 */

'use strict';

const http = require('http');
const dgram = require('dgram');
const wsLib = require('ws');
// ws v6 chi export Server, v7+ export WebSocketServer -> nhan ca hai.
const WSServer = wsLib.WebSocketServer || wsLib.Server;

const LISTEN_PORT = parseInt(process.env.WS_LISTEN_PORT || '7785', 10);
const UDP_HOST = process.env.WS_UDP_HOST || '127.0.0.1';
const UDP_PORT = parseInt(process.env.WS_UDP_PORT || '8443', 10);
const PING_INTERVAL_MS = parseInt(process.env.PING_INTERVAL_MS || '15000', 10);
const PONG_TIMEOUT_MS = parseInt(process.env.PONG_TIMEOUT_MS || '20000', 10);
const MAX_BUFFER_BYTES = parseInt(process.env.MAX_BUFFER_BYTES || String(4 * 1024 * 1024), 10);
const MAX_PAYLOAD = parseInt(process.env.MAX_PAYLOAD || String(1024 * 1024), 10);
const TAG = process.env.RELAY_TAG || `wsrelay:${LISTEN_PORT}->${UDP_HOST}:${UDP_PORT}`;

let seq = 0;
const stats = { connections: 0, active: 0, bytesIn: 0, bytesOut: 0, framesIn: 0, framesOut: 0,
                dropped: 0, udpErrors: 0, pingsOut: 0, pongsIn: 0, lastPongAt: null, lastError: null, startedAt: new Date().toISOString() };

function log(msg) { console.log(`${new Date().toISOString()} ${TAG} ${msg}`); }

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(Object.assign({}, stats, { udpTarget: `${UDP_HOST}:${UDP_PORT}` })));
    return;
  }
  res.writeHead(426, { 'content-type': 'text/plain' });
  res.end('upgrade required');
});

const wss = new WSServer({ server, perMessageDeflate: false, maxPayload: MAX_PAYLOAD });

wss.on('connection', (ws, req) => {
  const id = ++seq;
  const ip = (req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '?');
  stats.connections++; stats.active++;
  const opened = Date.now();
  let framesIn = 0, framesOut = 0, bytesIn = 0, bytesOut = 0;
  let alive = true, closed = false, closeReason = 'unknown';

  const udp = dgram.createSocket('udp4');
  // (3) Lỗi/đóng UDP: đóng WS NGAY để client nối lại trong vài giây, thay vì chờ hết pong timeout.
  udp.on('error', (err) => {
    stats.udpErrors++; stats.lastError = `udp: ${err.message}`;
    log(`#${id} UDP ERROR ${err.message} -> đóng WS để client nối lại`);
    closeReason = `udp-error: ${err.message}`;
    finish(1011, 'udp-error');
  });
  udp.on('message', (buf) => {
    if (closed) return;
    if (ws.bufferedAmount > MAX_BUFFER_BYTES) {
      // (4) Backpressure: bỏ frame thay vì xếp hàng vô hạn (RAM phải phẳng).
      stats.dropped++;
      if (stats.dropped % 1000 === 1) {
        log(`#${id} DROP frame (buffered=${ws.bufferedAmount}B > ${MAX_BUFFER_BYTES}B) tổng bỏ=${stats.dropped}`);
      }
      return;
    }
    framesOut++; bytesOut += buf.length; stats.framesOut++; stats.bytesOut += buf.length;
    ws.send(buf);
  });
  // Bind vào LOOPBACK chỉ đúng khi upstream cũng ở loopback.
  //
  // Linux trả `EINVAL` cho `send()` khi socket bind `127.0.0.1` mà đích là một host REMOTE.
  // Đo thật 23/09/2026 trên node-2: `relay-cf-vn1hy` (WS_UDP_HOST=103.173.155.50:8443) và
  // `relay-cf-vn1wg` (:443) chết 100% — `UDP SEND ERROR send EINVAL`, `out=0f/0B`, `udpErr`
  // tăng đều — trong khi `relay-cf-vn2hy`/`vn2wg` (WS_UDP_HOST=127.0.0.1) chạy tốt
  // (`udpErr=0`, đã chuyển GB). Hệ quả với khách: bắt tay WS xong nhưng gói không tới
  // hysteria ⇒ relay đóng `1011` ⇒ client rơi sang relay khác, đường node-1 không bao giờ dùng được.
  const upstreamIsLoopback = UDP_HOST === '127.0.0.1' || UDP_HOST === '::1' || UDP_HOST === 'localhost';
  udp.bind(0, upstreamIsLoopback ? '127.0.0.1' : '0.0.0.0', () => {
    log(`#${id} MỞ từ ${ip} local_udp=${udp.address().port} -> ${UDP_HOST}:${UDP_PORT}`);
  });

  // (2) Pong: `ws` tự trả lời ping của client; ở đây kiểm chiều ngược lại.
  ws.on('pong', () => { alive = true; stats.pongsIn++; stats.lastPongAt = new Date().toISOString(); });
  ws.on('ping', () => { alive = true; });
  const timer = setInterval(() => {
    if (closed) return;
    if (!alive) {
      closeReason = `pong timeout > ${PONG_TIMEOUT_MS}ms`;
      log(`#${id} KHÔNG PONG trong ${PONG_TIMEOUT_MS}ms -> cắt kết nối`);
      finish(1011, 'pong-timeout');
      return;
    }
    alive = false;
    stats.pingsOut++; try { ws.ping(); } catch (_) { /* đóng ngay sau đó */ }
  }, PING_INTERVAL_MS);

  ws.on('message', (data, isBinary) => {
    if (closed) return;
    if (!isBinary) return; // chỉ nhận binary = datagram
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    framesIn++; bytesIn += buf.length; stats.framesIn++; stats.bytesIn += buf.length;
    udp.send(buf, 0, buf.length, UDP_PORT, UDP_HOST, (err) => {
      if (err) {
        stats.udpErrors++; stats.lastError = `udp send: ${err.message}`;
        log(`#${id} UDP SEND ERROR ${err.message}`);
        closeReason = `udp-send: ${err.message}`;
        finish(1011, 'udp-send-error');
      }
    });
  });

  ws.on('error', (err) => {
    stats.lastError = `ws: ${err.message}`;
    log(`#${id} WS ERROR ${err.message}`);
    closeReason = `ws-error: ${err.message}`;
    finish(1011, 'ws-error');
  });

  ws.on('close', (code, reason) => {
    if (closeReason === 'unknown') closeReason = `client-close ${code} ${reason || ''}`.trim();
    finish(code, closeReason);
  });

  function finish(code, reason) {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    stats.active--;
    try { udp.close(); } catch (_) {}
    try { ws.close(code === 1000 ? 1000 : 1011, String(reason).slice(0, 120)); } catch (_) {}
    try { setTimeout(() => { try { ws.terminate(); } catch (_) {} }, 500); } catch (_) {}
    const secs = ((Date.now() - opened) / 1000).toFixed(1);
    log(`#${id} ĐÓNG sau ${secs}s | in=${framesIn}f/${bytesIn}B out=${framesOut}f/${bytesOut}B | lý do: ${reason}`);
  }
});

server.listen(LISTEN_PORT, () => {
  log(`LISTEN ${LISTEN_PORT} -> UDP ${UDP_HOST}:${UDP_PORT} | ping=${PING_INTERVAL_MS}ms pongTimeout=${PONG_TIMEOUT_MS}ms buffer=${MAX_BUFFER_BYTES}B`);
});

process.on('SIGTERM', () => { log('SIGTERM -> thoát'); server.close(() => process.exit(0)); });
process.on('uncaughtException', (e) => { stats.lastError = `uncaught: ${e.message}`; log(`UNCAUGHT ${e.stack || e.message}`); });
process.on('unhandledRejection', (e) => { stats.lastError = `rejection: ${e && e.message}`; log(`UNHANDLED ${e && (e.stack || e.message)}`); });

// Nhịp tổng hợp mỗi 5 phút để nhìn được xu hướng mà không cần đọc từng kết nối.
setInterval(() => {
  log(`STATS active=${stats.active} total=${stats.connections} in=${stats.framesIn}f/${stats.bytesIn}B ` +
      `out=${stats.framesOut}f/${stats.bytesOut}B drop=${stats.dropped} udpErr=${stats.udpErrors} lastError=${stats.lastError || '-'}`);
}, 300000);
